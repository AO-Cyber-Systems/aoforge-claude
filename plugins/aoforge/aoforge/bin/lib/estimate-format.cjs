'use strict';

// estimate-format.cjs — TRD 58-08 (EST-02, EST-03, EST-05)
//
// The text and the rounding behind `aof-tools estimate`. Pure functions over the result objects the engine returns
// (estimate.cjs, estimate-rollup.cjs, estimate-milestone.cjs): no file, no clock, no environment. The planner, build and
// execute-objective prose paste these strings verbatim, so their shape is part of the interface.
//
// Rounding happens here and only here: the engine hands over raw numbers, `roundResult` rounds the JSON once and the
// formatters round each figure once as they print it. A caller never rounds a number that was already rounded.
//
// No data, no number: a result that says `{available: false, reason}` prints `No estimate: <reason>`, and so does one
// whose headline metric is null.

const { MIN_OBJECTIVES, REPRODUCE_TOLERANCE } = require('./estimate-backtest.cjs');
const { mdCell } = require('./text-escape.cjs');

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ─── Scalars ──────────────────────────────────────────────────────────────────

/** `5 min`, `59 min`, `1h 00m`, `1h 15m`, `2h 05m`; `n/a` for anything that is not a number. Rounds before it splits. */
function formatMinutes(minutes) {
  if (!isNum(minutes)) return 'n/a';
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/** `3.6M`, `21.0M`, `29K`, `950`; `n/a` for anything that is not a number. */
function formatTokens(tokens) {
  if (!isNum(tokens)) return 'n/a';
  if (tokens >= 999500) return `${(tokens / 1e6).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(Math.round(tokens));
}

/** `$1.40`; `n/a` for anything that is not a number. */
function formatUsd(usd) {
  return isNum(usd) ? `$${usd.toFixed(2)}` : 'n/a';
}

/** `10%`, and one decimal below 1% so a rare event does not print as `0%`. */
function formatPercent(probability) {
  const pct = probability * 100;
  if (pct === 0 || pct >= 1) return `${Math.round(pct)}%`;
  return `${Number(pct.toFixed(1))}%`;
}

// ─── Rounding ─────────────────────────────────────────────────────────────────

// Decimals per key. A number under one of these keys (the `p50` and `p90` of a stat, an element of an array) takes the
// key's rule until a nearer key says otherwise; `n` is a count and is never rounded.
const DECIMALS = Object.freeze({
  minutes: 1,
  wall_minutes: 1,
  agent_minutes: 1,
  actual_minutes: 1,
  tokens_input: 0,
  tokens_output: 0,
  cost_usd: 4,
  probability: 4,
  // The backtest (TRD 64-04): ratios to 3 decimals, shares to 4. An `actual` has no entry of its own: it takes the one
  // of the metric it sits under (agent_minutes 1, cost_usd 4, wall_minutes 1).
  ratio: 3,
  median_ratio: 3,
  pooled_ratio: 3,
  coverage: 4,
  trd_coverage: 4,
  under_median_share: 4,
});

const roundTo = (x, decimals) => Number(x.toFixed(decimals));

function walk(value, decimals) {
  if (typeof value === 'number') return isNum(value) && decimals !== null ? roundTo(value, decimals) : value;
  if (Array.isArray(value)) return value.map((item) => walk(item, decimals));
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      let next = decimals;
      if (Object.prototype.hasOwnProperty.call(DECIMALS, key)) next = DECIMALS[key];
      else if (key === 'n') next = null;
      out[key] = walk(item, next);
    }
    return out;
  }
  return value;
}

/**
 * A deep copy of an estimate result with every figure rounded once, for the JSON output: minutes to 1 decimal, tokens
 * to whole numbers, dollars and probabilities to 4 decimals, backtest ratios to 3 and shares to 4. Every other key is
 * copied as is; the input is not changed.
 */
function roundResult(value) {
  return walk(value, null);
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

/**
 * Where an actual landed against an estimate: `at or under median`, `within P90` or `over P90`. Null when there is
 * nothing to compare (no actual, no median, or past the median with no P90).
 * @param {?number} actual minutes
 * @param {?{p50: ?number, p90: ?number}} estimate
 */
function verdict(actual, estimate) {
  if (!isNum(actual) || !estimate || !isNum(estimate.p50)) return null;
  if (actual <= estimate.p50) return 'at or under median';
  if (!isNum(estimate.p90)) return null;
  return actual <= estimate.p90 ? 'within P90' : 'over P90';
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

const noEstimate = (reason) => `No estimate: ${reason}`;
const unavailable = (r) => !r || r.available === false;

/** `6 min (P90 18 min)` for a `{p50, p90}` stat; `n/a` for null. */
const pair = (stat, fn) => (stat ? `${fn(stat.p50)} (P90 ${fn(stat.p90)})` : 'n/a');

const costPart = (stat) => (stat ? pair(stat, formatUsd) : 'cost n/a');

/** `12 min median, P90 36 min`. */
function medianP90(stat) {
  return isNum(stat.p90)
    ? `${formatMinutes(stat.p50)} median, P90 ${formatMinutes(stat.p90)}`
    : `${formatMinutes(stat.p50)} median`;
}

const hasEstimate = (stat) => stat !== null && stat !== undefined && isNum(stat.p50);

/** `a`, `a and b`, `a, b and c`. */
function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** `Includes 1 verifier spawn and gap closure (10% likely, n=40; +31 min, +$5.80 if it happens).` or ''. */
function overheadSentence(overhead, gap) {
  const items = (Array.isArray(overhead) ? overhead : []).map((e) => {
    const spawns = isNum(e.spawns) ? e.spawns : 1;
    return `${spawns} ${e.agent} ${spawns === 1 ? 'spawn' : 'spawns'}`;
  });
  if (gap) {
    const extra = gap.extra || {};
    const costs = [];
    if (extra.wall_minutes) costs.push(`+${formatMinutes(extra.wall_minutes.p50)}`);
    if (extra.cost_usd) costs.push(`+${formatUsd(extra.cost_usd.p50)}`);
    const tail = costs.length > 0 ? `; ${costs.join(', ')} if it happens` : '';
    items.push(`gap closure (${formatPercent(gap.probability)} likely, n=${gap.n}${tail})`);
  }
  return items.length > 0 ? `Includes ${joinList(items)}.` : '';
}

/** `80-02 doc, n=10`, `81 unplanned`, a synthetic component's name alone. */
function weakestText(weakest) {
  if (!weakest) return '';
  let text = String(weakest.name);
  const tag = weakest.class || weakest.status;
  if (tag) text += ` ${tag}`;
  if (isNum(weakest.n)) text += `, n=${weakest.n}`;
  return text;
}

function confidenceSentence(confidence, weakest) {
  const who = weakestText(weakest);
  return who === '' ? `Confidence: ${confidence}.` : `Confidence: ${confidence} (weakest: ${who}).`;
}

// The minutes method a version 3 calibration names (`method.minutes`), or null when the result has no method block.
function minutesMethodName(calibration) {
  const method = calibration && calibration.method;
  if (method === null || typeof method !== 'object' || Array.isArray(method)) return null;
  return typeof method.minutes === 'string' && method.minutes !== '' ? method.minutes : null;
}

// `, minutes trd_level (window 10, through objective 66)`: the method and the parts of its identity that are known, the
// parentheses left out when none is. Nothing at all for a calibration with no method block (version 1 or 2).
function minutesMethodPart(calibration) {
  const name = minutesMethodName(calibration);
  if (name === null) return '';
  const known = [];
  if (isNum(calibration.method.window_objectives)) known.push(`window ${calibration.method.window_objectives}`);
  if (isNum(calibration.method.through_objective)) known.push(`through objective ${calibration.method.through_objective}`);
  return `, minutes ${name}${known.length > 0 ? ` (${known.join(', ')})` : ''}`;
}

function calibrationSentence(calibration) {
  if (!calibration || !calibration.data_as_of) return '';
  const trds = calibration.samples && isNum(calibration.samples.trds) ? `, ${plural(calibration.samples.trds, 'TRD')}` : '';
  return `Calibration ${calibration.data_as_of}${trds}${minutesMethodPart(calibration)}.`;
}

/** The `Note: ` lines: the result's notes, then what the calibration lacked. */
function noteLines(notes, missing) {
  const lines = (Array.isArray(notes) ? notes : []).map((n) => `Note: ${n}`);
  if (Array.isArray(missing) && missing.length > 0) lines.push(`Note: missing data: ${missing.join('; ')}`);
  return lines;
}

// ─── Task and TRD ─────────────────────────────────────────────────────────────

/**
 * One task estimate: `Task code_tdd: 6 min (P90 18 min) · tokens 3.6M in / 29K out · $1.40 (P90 $2.20) · n=30,
 * confidence high`, with `(<class> has N samples; using all tasks)` when the all-task figures stood in.
 */
function taskLine(task) {
  if (unavailable(task)) return noEstimate(task && task.reason);
  if (task.class === 'checkpoint') return 'Task checkpoint: human wait, not estimated';
  if (!task.minutes && !task.tokens_input && !task.tokens_output && !task.cost_usd) {
    return noEstimate(`the calibration has no data for task class ${task.class}; run aof-tools calibrate`);
  }
  const parts = [
    `Task ${task.class}: ${pair(task.minutes, formatMinutes)}`,
    `tokens ${formatTokens(task.tokens_input && task.tokens_input.p50)} in / ${formatTokens(task.tokens_output && task.tokens_output.p50)} out`,
    costPart(task.cost_usd),
    `n=${task.samples}, confidence ${task.confidence}`,
  ];
  let text = parts.join(' · ');
  if (task.basis === 'all') text += ` (${task.class} has ${plural(task.class_samples || 0, 'sample')}; using all tasks)`;
  return text;
}

/** One TRD estimate: `TRD 80-01: 12 min (P90 36 min) · $2.80 (P90 $4.40) · 2 tasks · confidence high`. */
function trdLine(trd) {
  if (unavailable(trd)) return noEstimate(trd && trd.reason);
  if (!trd.minutes) {
    const auto = (trd.tasks || []).filter((t) => t.class !== 'checkpoint');
    return auto.length === 0
      ? noEstimate(`TRD ${trd.id} has no auto tasks`)
      : noEstimate(`TRD ${trd.id} has no minutes data in the calibration; run aof-tools calibrate`);
  }
  const parts = [
    `TRD ${trd.id}: ${pair(trd.minutes, formatMinutes)}`,
    costPart(trd.cost_usd),
    plural((trd.tasks || []).length, 'task'),
  ];
  if (trd.human_wait) parts.push('human wait not included');
  parts.push(`confidence ${trd.confidence}`);
  return parts.join(' · ');
}

// ─── Objective ────────────────────────────────────────────────────────────────

function objectiveNoMinutes(r) {
  return r.status === 'unplanned'
    ? noEstimate(`objective ${r.objective} is unplanned and the calibration has no objective history (objective_level); run aof-tools calibrate`)
    : noEstimate(`objective ${r.objective} has no minutes data in the calibration; run aof-tools calibrate`);
}

const trdsLeft = (r) => `${plural(r.trds.remaining, 'TRD')} ${r.all ? 'estimated' : 'left'}`;

/** `Objective 80 estimate: 26 min median (P90 1h 09m) wall · $6.80 (P90 $10.90) · 3 TRDs left in 2 waves · confidence medium`. */
function objectiveLine(r) {
  if (unavailable(r)) return noEstimate(r && r.reason);
  // `all` asks for the estimate of the TRDs already done (the backtest), so a done objective renders like any other then.
  if (r.status === 'done' && !r.all) return `Objective ${r.objective}: all TRDs done (${r.trds.done} of ${r.trds.total})`;
  const wall = r.total && r.total.wall_minutes;
  if (!wall) return objectiveNoMinutes(r);
  const basis = r.status === 'unplanned'
    ? `unplanned, from ${r.history ? plural(r.history.objectives, 'past objective') : 'no history'}`
    : `${trdsLeft(r)} in ${plural((r.waves || []).length, 'wave')}`;
  return `Objective ${r.objective} estimate: ${formatMinutes(wall.p50)} median (P90 ${formatMinutes(wall.p90)}) wall · ${costPart(r.total.cost_usd)} · ${basis} · confidence ${r.confidence}`;
}

const UNPLANNED_BASIS_NOTE = /^unplanned: estimated from /;

/** The markdown table the planner and execute-objective paste; see the TRD for the literal layout. */
function objectiveTable(r) {
  if (unavailable(r)) return noEstimate(r && r.reason);
  if (r.status === 'done' && !r.all) return objectiveLine(r);
  const total = r.total || {};
  if (!total.wall_minutes) return objectiveNoMinutes(r);

  const unplanned = r.status === 'unplanned';
  const heading = unplanned
    ? `Objective ${r.objective} (unplanned)`
    : `Objective ${r.objective} (${trdsLeft(r)}, ${plural((r.waves || []).length, 'wave')})`;
  const row = (label, a, b) => `| ${label} | ${a} | ${b} |`;
  const stat = (key, fn) => [fn(total[key] && total[key].p50), fn(total[key] && total[key].p90)];
  const tokens = (which) => {
    const key = which === 'p50' ? 'p50' : 'p90';
    return `${formatTokens(total.tokens_input && total.tokens_input[key])} / ${formatTokens(total.tokens_output && total.tokens_output[key])}`;
  };

  const lines = [
    `| ${heading} | Median | P90 |`,
    '|---|---|---|',
    row(unplanned ? 'Wall time (serial, unplanned)' : 'Wall time', ...stat('wall_minutes', formatMinutes)),
  ];
  if (!unplanned) lines.push(row('Agent time', ...stat('agent_minutes', formatMinutes)));
  lines.push(row('Tokens in / out', tokens('p50'), tokens('p90')));
  lines.push(row('Cost', ...stat('cost_usd', formatUsd)));
  lines.push('');

  const footer = [
    overheadSentence(r.overhead, r.gap_closure),
    confidenceSentence(r.confidence, r.weakest),
    calibrationSentence(r.calibration),
  ].filter((piece) => piece !== '');
  lines.push(footer.join(' '));

  let notes = r.notes;
  if (unplanned) {
    const n = r.history ? r.history.objectives : 0;
    notes = [
      `figures come from ${plural(n, 'past objective')} because the objective has no TRDs yet.`,
      ...(Array.isArray(r.notes) ? r.notes.filter((note) => !UNPLANNED_BASIS_NOTE.test(note)) : []),
    ];
  }
  lines.push(...noteLines(notes, r.missing));
  return lines.join('\n');
}

// ─── Milestone ────────────────────────────────────────────────────────────────

const isLeft = (o) => o.status !== 'done' && o.status !== 'cancelled';

function milestoneNoMinutes(r) {
  return noEstimate(`milestone ${r.version} has no minutes data in the calibration; run aof-tools calibrate`);
}

/** `Milestone v1.0 estimate: 1h 49m median (P90 4h 36m) · $29.40 (P90 $58.10) · 3 objectives left (1 unplanned) · confidence low`. */
function milestoneLine(r) {
  if (unavailable(r)) return noEstimate(r && r.reason);
  const left = (r.objectives || []).filter(isLeft);
  if (left.length === 0) return `Milestone ${r.version} estimate: no objectives left`;
  const wall = r.total && r.total.wall_minutes;
  if (!wall) return milestoneNoMinutes(r);
  const unplanned = left.filter((o) => o.status === 'unplanned').length;
  const count = `${plural(left.length, 'objective')} left${unplanned > 0 ? ` (${unplanned} unplanned)` : ''}`;
  return `Milestone ${r.version} estimate: ${formatMinutes(wall.p50)} median (P90 ${formatMinutes(wall.p90)}) · ${costPart(r.total.cost_usd)} · ${count} · confidence ${r.confidence}`;
}

function statusText(o) {
  if (o.status === 'partial') return `partial, ${o.trds.remaining} of ${o.trds.total} TRDs left`;
  if (o.status === 'planned') return `planned, ${plural(o.trds.total, 'TRD')}`;
  return o.status;
}

/** One row per objective that still has work, a bold total row, and a footer naming the done and cancelled ones. */
function milestoneTable(r) {
  if (unavailable(r)) return noEstimate(r && r.reason);
  const objectives = r.objectives || [];
  const left = objectives.filter(isLeft);
  const numbers = (status) => objectives.filter((o) => o.status === status).map((o) => o.number).join(', ');
  const done = numbers('done');
  const cancelled = numbers('cancelled');
  const doneCancelled = [done !== '' ? `Done: ${done}.` : '', cancelled !== '' ? `Cancelled: ${cancelled}.` : ''].filter((p) => p !== '');

  const notes = (Array.isArray(r.notes) ? r.notes : []).filter((note) => note !== 'no objectives left');
  if (left.length === 0) {
    return [[`Milestone ${r.version}: no objectives left.`, ...doneCancelled].join(' '), ...noteLines(notes, r.missing)].join('\n');
  }
  const wall = r.total && r.total.wall_minutes;
  if (!wall) return milestoneNoMinutes(r);

  const lines = [
    '| Objective | Status | Wall median | Wall P90 | Cost median | Confidence |',
    '|---|---|---|---|---|---|',
  ];
  for (const o of left) {
    const w = o.total && o.total.wall_minutes;
    const c = o.total && o.total.cost_usd;
    lines.push(`| ${mdCell(`${o.number} ${o.name}`)} | ${statusText(o)} | ${formatMinutes(w && w.p50)} | ${formatMinutes(w && w.p90)} | ${formatUsd(c && c.p50)} | ${o.confidence} |`);
  }
  const cost = r.total.cost_usd;
  lines.push(`| **${r.version} total (${plural(left.length, 'objective')} left)** | | **${formatMinutes(wall.p50)}** | **${formatMinutes(wall.p90)}** | **${formatUsd(cost && cost.p50)}** | **${r.confidence}** |`);
  lines.push('');

  const footer = [
    ...doneCancelled,
    overheadSentence(r.overhead, null),
    confidenceSentence(r.confidence, r.weakest),
    calibrationSentence(r.calibration),
  ].filter((piece) => piece !== '');
  lines.push(footer.join(' '));
  lines.push(...noteLines(notes, r.missing));
  return lines.join('\n');
}

// ─── Run verbs ────────────────────────────────────────────────────────────────

/** `Wave 1 estimate: 12 min median, P90 36 min`, or `Wave 1: no estimate`. */
function waveStartLine({ wave, p50, p90 }) {
  if (!hasEstimate({ p50 })) return `Wave ${wave}: no estimate`;
  return `Wave ${wave} estimate: ${medianP90({ p50, p90 })}`;
}

/** `Wave 1: actual 14 min · estimate 12 min median, P90 36 min · within P90`. */
function waveDoneLine({ wave, actual, p50, p90 }) {
  const parts = [`Wave ${wave}: actual ${formatMinutes(actual)}`];
  parts.push(hasEstimate({ p50 }) ? `estimate ${medianP90({ p50, p90 })}` : 'no estimate');
  const v = verdict(actual, { p50, p90 });
  if (v !== null) parts.push(v);
  return parts.join(' · ');
}

/** `Objective 80 execution: actual 30 min · estimate 19 min median, P90 52 min · within P90`. */
function finishLine({ objective, actual, wall }) {
  const parts = [`Objective ${objective} execution: actual ${formatMinutes(actual)}`];
  parts.push(hasEstimate(wall) ? `estimate ${medianP90(wall)}` : 'no estimate');
  const v = verdict(actual, wall);
  if (v !== null) parts.push(v);
  return parts.join(' · ');
}

// ─── Backtest (TRD 64-04, EST-08) ─────────────────────────────────────────────

// The renderers print a result of estimate-backtest.buildBacktest (plus the `available` flag and `calibration` the CLI adds).
// They decide nothing: every verdict, median and share is read off the result, and the counts printed beside them are
// counted from its rows. Text rounds once as it prints, ratios to two decimals; the JSON keeps three (DECIMALS).

// The two primary metrics, by their key on an objective row, on that row's TRD rows, and in the class tables.
const BACKTEST_METRICS = Object.freeze([
  Object.freeze({ key: 'agent_minutes', label: 'Agent minutes', short: 'agent minutes', trdKey: 'minutes', classKey: 'minutes', tag: 'minutes', show: formatMinutes }),
  Object.freeze({ key: 'cost_usd', label: 'Cost', short: 'cost', trdKey: 'cost_usd', classKey: 'cost_usd', tag: 'cost', show: formatUsd }),
]);

const ratioText = (x) => (isNum(x) ? x.toFixed(2) : 'n/a');
const ofText = (n, m) => `${n} of ${m}`;
const withShare = (n, m) => (m === 0 ? ofText(n, m) : `${ofText(n, m)} (${formatPercent(n / m)})`);
/** `5 of 5 objectives (100%)`: the count, what was counted, then the share. */
const coverText = (n, m, noun) => `${ofText(n, m)} ${noun}${m === 0 ? '' : ` (${formatPercent(n / m)})`}`;
const bandText = (band) => `±${Math.round(band * 100)}%`;
const yesNo = (flag) => (flag === true ? 'yes' : flag === false ? 'no' : 'n/a');
const wasCompared = (cell) => Boolean(cell) && !cell.excluded;

/** How many compared objectives and TRDs had their actual at or under P90 (and under the median), counted from the rows. */
function backtestCounts(result, metric) {
  const rows = Array.isArray(result.objectives) ? result.objectives : [];
  const cells = rows.map((row) => row[metric.key]).filter(wasCompared);
  const trdCells = rows.flatMap((row) => (row.trd_rows || []).map((trdRow) => trdRow[metric.trdKey])).filter(wasCompared);
  const count = (list, test) => list.filter(test).length;
  return {
    objectives: cells.length,
    covered: count(cells, (c) => c.covered === true),
    atOrUnder: count(cells, (c) => c.at_or_under_median === true),
    trds: trdCells.length,
    trdCovered: count(trdCells, (c) => c.covered === true),
  };
}

/**
 * One line: `Backtest 59, 60, 61: agent minutes median ratio 1.51 (2 of 5 in ±30%, P90 covers 5 of 5 objectives, 40 of 41
 * TRDs) · cost median ratio 0.98 (5 of 5, P90 5 of 5, 41 of 41) · EST-08 not met`. The first metric that prints numbers
 * names what they count; the next is shortened. A metric below the minimum is `insufficient (2 objectives)`.
 */
function backtestLine(r) {
  if (unavailable(r)) return noEstimate(r && r.reason);
  let first = true;
  const parts = BACKTEST_METRICS.map((metric) => {
    const s = r.summary[metric.key];
    if (s.sc2 === 'insufficient') return `${metric.short} insufficient (${plural(s.compared, 'objective')})`;
    const c = backtestCounts(r, metric);
    const inBand = first ? `${ofText(s.in_band, s.compared)} in ${bandText(r.band)}` : ofText(s.in_band, s.compared);
    const objectives = first ? `P90 covers ${ofText(c.covered, c.objectives)} objectives` : `P90 ${ofText(c.covered, c.objectives)}`;
    const trds = first ? `${ofText(c.trdCovered, c.trds)} TRDs` : ofText(c.trdCovered, c.trds);
    first = false;
    return `${metric.short} median ratio ${ratioText(s.median_ratio)} (${inBand}, ${objectives}, ${trds})`;
  });
  parts.push(`EST-08 ${r.verdict.est08}`);
  const objectives = (r.objectives || []).map((o) => o.objective).join(', ');
  return `Backtest ${objectives}: ${parts.join(' · ')}`;
}

const tableRow = (cells) => `| ${cells.join(' | ')} |`;
const tableRule = (columns) => `|${'---|'.repeat(columns)}`;
const objectiveLabel = (o) => mdCell(o.name ? `${o.objective} ${o.name}` : o.objective);
const percentOrNa = (share) => (isNum(share) ? formatPercent(share) : 'n/a');
const showOrNa = (show, value) => (isNum(value) ? show(value) : 'n/a');
/** `1h 40m / 5h 00m` for a stat with a median, `n/a` without one. */
const pairOrNa = (stat, show) => (stat && isNum(stat.p50) ? `${show(stat.p50)} / ${show(stat.p90)}` : 'n/a');

/** `- Agent minutes: SC2 fail (...) · SC3 pass (...)`: both verdicts and the numbers behind them. */
function verdictLine(r, metric) {
  const s = r.summary[metric.key];
  const c = backtestCounts(r, metric);
  const needed = `${plural(s.compared, 'objective')} compared, ${MIN_OBJECTIVES} needed`;
  const sc2 = s.sc2 === 'insufficient'
    ? `SC2 insufficient (${needed})`
    : `SC2 ${s.sc2} (median ratio ${ratioText(s.median_ratio)}, ${ofText(s.in_band, s.compared)} objectives in ${bandText(r.band)})`;
  let sc3;
  if (s.sc3 === 'insufficient') sc3 = `SC3 insufficient (${s.compared < MIN_OBJECTIVES ? needed : 'no TRD compared'})`;
  else sc3 = `SC3 ${s.sc3} (P90 covers ${coverText(c.covered, c.objectives, 'objectives')} and ${coverText(c.trdCovered, c.trds, 'TRDs')}; target ${formatPercent(r.coverage_target)})`;
  return `- ${metric.label}: ${sc2} · ${sc3}`;
}

/** The four cells one executor metric takes in an objective row: estimate, actual (or why there is none), ratio, actual <= P90. */
function executorCells(cell, metric) {
  if (!cell) return ['n/a', 'n/a', 'n/a', 'n/a'];
  const estimate = pairOrNa(cell, metric.show);
  if (cell.excluded) {
    const ids = Array.isArray(cell.trds) && cell.trds.length > 0 ? ` (${cell.trds.join(', ')})` : '';
    return [estimate, `excluded: ${cell.excluded}${ids}`, 'n/a', 'n/a'];
  }
  return [estimate, metric.show(cell.actual), ratioText(cell.ratio), yesNo(cell.covered)];
}

/** `prospective` or `reconstructed` when both metrics agree, else `minutes prospective, cost reconstructed`. */
function sourceText(o) {
  const minutes = o.agent_minutes && o.agent_minutes.source;
  const cost = o.cost_usd && o.cost_usd.source;
  return minutes === cost ? String(minutes || 'n/a') : `minutes ${minutes}, cost ${cost}`;
}

function executorSection(r) {
  const [minutes, cost] = BACKTEST_METRICS;
  const lines = [
    tableRow(['Objective', 'TRDs', 'Source', 'Agent min p50 / P90', 'Actual', 'Ratio', '<= P90', 'Cost p50 / P90', 'Actual', 'Ratio', '<= P90']),
    tableRule(11),
  ];
  for (const o of r.objectives || []) {
    lines.push(tableRow([objectiveLabel(o), o.trds, sourceText(o), ...executorCells(o.agent_minutes, minutes), ...executorCells(o.cost_usd, cost)]));
  }
  lines.push('', tableRow(['Metric', 'Compared', 'Median ratio', 'Pooled ratio', 'In band', 'P90 covers objectives', 'P90 covers TRDs', 'At or under median']), tableRule(8));
  for (const metric of BACKTEST_METRICS) {
    const s = r.summary[metric.key];
    const c = backtestCounts(r, metric);
    lines.push(tableRow([
      metric.label, s.compared, ratioText(s.median_ratio), ratioText(s.pooled_ratio), ofText(s.in_band, s.compared),
      withShare(c.covered, c.objectives), withShare(c.trdCovered, c.trds), withShare(c.atOrUnder, c.objectives),
    ]));
  }
  return lines;
}

const WALL_INTRO = 'Compares `estimate.wall_minutes` of the run state (execution only: the waves, not the verifier or planning, so not the total '
  + 'the estimate line prints) with the measured time from `estimate start` to `estimate finish`. Reproduced: the estimate rebuilt now from this '
  + `calibration matches the recorded one within ${REPRODUCE_TOLERANCE} minutes. Reported, never judged.`;

function wallSection(r) {
  const objectives = r.objectives || [];
  const measuredRuns = objectives.filter((o) => o.wall_minutes && o.wall_minutes.source === 'prospective');
  if (measuredRuns.length === 0) return ['none recorded'];

  const lines = [WALL_INTRO, '',
    tableRow(['Objective', 'Estimate p50 / P90', 'Reconstructed p50 / P90', 'Actual', 'Ratio', '<= P90', 'Reproduced']), tableRule(7)];
  for (const o of measuredRuns) {
    const w = o.wall_minutes;
    const p = w.prospective || {};
    lines.push(tableRow([
      objectiveLabel(o), pairOrNa(p, formatMinutes), pairOrNa(w.reconstructed, formatMinutes), showOrNa(formatMinutes, w.actual),
      ratioText(p.ratio), yesNo(p.covered), yesNo(w.reproduced),
    ]));
  }

  const waveRows = [];
  for (const o of measuredRuns) {
    for (const wave of o.wall_minutes.waves || []) {
      const actual = wave.excluded === 'no actual' ? 'excluded: no actual' : showOrNa(formatMinutes, wave.actual);
      waveRows.push(tableRow([objectiveLabel(o), wave.wave, (wave.trds || []).join(', '), pairOrNa(wave, formatMinutes), actual, ratioText(wave.ratio), yesNo(wave.covered)]));
    }
  }
  if (waveRows.length > 0) {
    lines.push('', tableRow(['Objective', 'Wave', 'TRDs', 'Estimate p50 / P90', 'Actual', 'Ratio', '<= P90']), tableRule(7), ...waveRows);
  }

  const byReason = new Map();
  for (const o of objectives) {
    if (measuredRuns.includes(o)) continue;
    const reason = (o.wall_minutes && o.wall_minutes.excluded) || 'not compared';
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason).push(o.objective);
  }
  if (byReason.size > 0) {
    const missing = [...byReason].map(([reason, numbers]) => `${numbers.join(', ')} (${reason})`).join('; ');
    lines.push('', `No finished run state: ${missing}.`);
  }
  return lines;
}

function classSection(r) {
  const table = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return ['none'];
    return [
      tableRow(['Class', 'Tasks', 'Median ratio', 'P90 coverage', 'Verdict']),
      tableRule(5),
      ...rows.map((c) => tableRow([
        mdCell(c.class), c.tasks, ratioText(c.median_ratio), percentOrNa(c.coverage),
        c.verdict === 'miscalibrated' ? `miscalibrated: ${(c.flags || []).join(', ')}` : c.verdict,
      ])),
    ];
  };
  const classes = r.classes || {};
  const [minutes, cost] = BACKTEST_METRICS;
  return [`**${minutes.label}**`, '', ...table(classes[minutes.classKey]), '', `**${cost.label}**`, '', ...table(classes[cost.classKey])];
}

function miscalibratedSection(r) {
  const entries = (r.verdict && r.verdict.miscalibrated) || [];
  if (entries.length === 0) return ['none'];
  return entries.map((m) => {
    const metric = BACKTEST_METRICS.find((candidate) => candidate.key === m.metric);
    return `- ${m.class} (${metric ? metric.tag : m.metric}): ${(m.flags || []).join(', ')}, median ratio ${ratioText(m.median_ratio)}, coverage ${percentOrNa(m.coverage)}`;
  });
}

function exclusionSection(r) {
  const lines = [];
  for (const metric of BACKTEST_METRICS) {
    for (const e of r.summary[metric.key].excluded || []) {
      const ids = Array.isArray(e.trds) && e.trds.length > 0 ? ` (${e.trds.join(', ')})` : '';
      lines.push(`- ${metric.label}, objective ${e.objective}: ${e.reason}${ids}`);
    }
  }
  return lines.length > 0 ? lines : ['none'];
}

function calibrationFooter(r) {
  const cal = r.calibration || {};
  const samples = cal.samples || {};
  const count = (n) => (isNum(n) ? n : 'n/a');
  const name = minutesMethodName(cal);
  const minutes = name === null ? '' : `minutes ${name}, `;
  return `Calibration ${cal.path || 'n/a'}, data as of ${cal.data_as_of || 'n/a'}, samples ${count(samples.trds)} TRDs / ${count(samples.tasks)} tasks / ${count(samples.with_tokens)} with tokens, `
    + `${minutes}inputs_digest ${cal.inputs_digest || 'none'}. Band ${bandText(r.band)}, coverage target ${formatPercent(r.coverage_target)}.`;
}

/**
 * The markdown report 64-05 pastes into the accuracy report: the verdict, the executor estimates against actuals (with a
 * summary row per metric), the wall time of prospective run states, the task classes, the miscalibrated classes and the
 * exclusions, then the calibration it ran against.
 */
function backtestReport(r) {
  if (unavailable(r)) return noEstimate(r && r.reason);
  const block = (heading, lines) => [heading, '', ...lines].join('\n');
  return [
    block('### Verdict', [...BACKTEST_METRICS.map((metric) => verdictLine(r, metric)), '', `EST-08: ${r.verdict.est08}`]),
    block('### Executor estimates against actuals', executorSection(r)),
    block('### Wall time (prospective run states)', wallSection(r)),
    block('### Task classes', classSection(r)),
    block('### Miscalibrated classes', miscalibratedSection(r)),
    block('### Exclusions', exclusionSection(r)),
    ['---', '', calibrationFooter(r)].join('\n'),
  ].join('\n\n');
}

module.exports = {
  formatMinutes,
  formatTokens,
  formatUsd,
  roundResult,
  verdict,
  taskLine,
  trdLine,
  objectiveLine,
  objectiveTable,
  milestoneLine,
  milestoneTable,
  waveStartLine,
  waveDoneLine,
  finishLine,
  backtestLine,
  backtestReport,
};
