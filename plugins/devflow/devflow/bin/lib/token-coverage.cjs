'use strict';

// token-coverage.cjs (TRD 66-01, EST-09) — forward-stamp coverage of TRD SUMMARYs: of the TRDs executed in a scope, how
// many carry token fields stamped at write time (`tokens_source: "live"`)?
//
//   classifySummary(text)                       one SUMMARY: live | backfill | unlabeled | missing | in_progress
//   collectSummaries(readRoot, dirs)            every SUMMARY of the given objective directories, classified once each
//   coverageOf(entries)                         the counts and the forward fraction (exact, floored decimal, integer target)
//   explainMissing(entries, {indexFactory, readRoot})   a reason for each missing entry, from one lazy transcript index
//   formatCoverage(report)                      the text `df-tools tokens coverage --raw` prints
//   buildCoverage({readRoot, scope, indexFactory})      all of the above, in one report object
//
// Classes (the order decides):
//   live         tokens_input and tokens_output both filled and tokens_source "live"       counted, forward
//   backfill     both filled and tokens_source "backfill"                                    counted, never forward
//   unlabeled    both filled and no tokens_source, or any other value                        counted, never forward
//   in_progress  no token fields, a `## Progress` heading and no `## Self-Check` heading     listed, NOT counted
//   missing      no token fields otherwise (a finished SUMMARY, or the orchestrator-written shape with neither heading)
//                                                                                           counted, never forward
// "Both filled" is the rule lib/token-backfill.cjs uses for `already_stamped`, so coverage and backfill agree on what
// carries token fields. Commented template lines (`# tokens_input: N`) are not fields: the frontmatter reader skips them.
//
// Honest numbers: the denominator (`counted`) is live + backfill + unlabeled + missing, so a missing SUMMARY lowers the
// number and is never dropped. A SUMMARY without `## Self-Check` is NOT assumed unexecuted: only a `## Progress`
// checkpoint is in progress. The decimal is floored with integer arithmetic and the target is compared as integers
// (`live * 100 >= 95 * counted`); nothing here rounds a number up or compares a float with 0.95.
//
// Read-only: this module only reads directories, SUMMARY files and (for missing entries) the executor-transcript index
// it is handed. It has no way to change a file or to raise its own number.

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { trdKey } = require('./helpers.cjs');
const tu = require('./token-usage.cjs');

/** EST-09: at least this percentage of counted SUMMARYs should be forward-stamped. */
const TARGET_PERCENT = 95;

const CLASSES = Object.freeze(['live', 'backfill', 'unlabeled', 'missing', 'in_progress']);

/** A name that is a SUMMARY: `SUMMARY.md` or `<anything>-SUMMARY.md`. Unkeyed ones are reported, not counted. */
const SUMMARY_NAME_RE = /(?:^|-)SUMMARY\.md$/;
const PROGRESS_HEADING_RE = /^##[ \t]+Progress\b/im;
const SELF_CHECK_HEADING_RE = /^##[ \t]+Self-Check\b/im;

// ─── classification ───────────────────────────────────────────────────────────

function filled(v) {
  return (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v));
}

function frontmatterOf(text) {
  try {
    return extractFrontmatter(text);
  } catch {
    return {};
  }
}

/** A scalar with one pair of surrounding quotes removed and trimmed, or null when it is not a non-empty string. */
function unquoted(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) s = s.slice(1, -1).trim();
  return s === '' ? null : s;
}

/**
 * @param {string} text  the SUMMARY file text
 * @returns {{class: 'live'|'backfill'|'unlabeled'|'missing'|'in_progress', source: string|null}}
 *   source: the unquoted tokens_source when the token fields are present, else null
 */
function classifySummary(text) {
  const body = typeof text === 'string' ? text : '';
  const fm = frontmatterOf(body);
  if (filled(fm.tokens_input) && filled(fm.tokens_output)) {
    const source = unquoted(fm.tokens_source);
    if (source === 'live') return { class: 'live', source };
    if (source === 'backfill') return { class: 'backfill', source };
    return { class: 'unlabeled', source };
  }
  const checkpointOnly = PROGRESS_HEADING_RE.test(body) && !SELF_CHECK_HEADING_RE.test(body);
  return { class: checkpointOnly ? 'in_progress' : 'missing', source: null };
}

// ─── collection ───────────────────────────────────────────────────────────────

/** Entry order: objective number numerically (4 before 4.1 before 10), then TRD number, then directory and file. */
function compareEntries(a, b) {
  const num = (e) => {
    const n = parseFloat(e.objective);
    return Number.isFinite(n) ? n : parseFloat(e.id.slice(0, e.id.lastIndexOf('-')));
  };
  const trd = (e) => parseInt(e.id.slice(e.id.lastIndexOf('-') + 1), 10);
  return (num(a) - num(b))
    || (trd(a) - trd(b))
    || (a.objective_dir < b.objective_dir ? -1 : a.objective_dir > b.objective_dir ? 1 : 0)
    || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
}

/**
 * Every SUMMARY of `dirs`, classified once. `dirs` is `[{number, dir}]` with `dir` relative to `readRoot` (forward slashes).
 * A file pairs to its TRD by `helpers.trdKey` + `normTrdId`, so `65-02-SUMMARY.md` and `65-02-push-branch-SUMMARY.md` are both
 * `65-02`. A file with no key goes to `skipped` as `unkeyed`; a second file for an id already seen in the same directory goes
 * to `skipped` as `duplicate` (the first in sorted order wins). A directory that cannot be listed contributes nothing. A
 * SUMMARY that cannot be read is `missing` with `reason: 'unreadable'`.
 *
 * @param {string} readRoot
 * @param {Array<{number: string, dir: string}>} dirs
 * @returns {{entries: Array<{id: string, objective: string, objective_dir: string, file: string, path: string,
 *   class: string, source: string|null, reason?: string}>, skipped: Array<{objective_dir: string, file: string, reason: string}>}}
 */
function collectSummaries(readRoot, dirs) {
  const entries = [];
  const skipped = [];
  for (const { number, dir } of dirs || []) {
    const rel = String(dir).split(path.sep).join('/');
    const abs = path.join(readRoot, ...rel.split('/'));
    const objectiveDir = path.posix.basename(rel);
    let names;
    try {
      names = fs.readdirSync(abs);
    } catch {
      continue;
    }
    const seen = new Set();
    for (const file of names.filter((n) => SUMMARY_NAME_RE.test(n)).sort()) {
      const id = tu.normTrdId(trdKey(file));
      if (!id) {
        skipped.push({ objective_dir: objectiveDir, file, reason: 'unkeyed' });
        continue;
      }
      if (seen.has(id)) {
        skipped.push({ objective_dir: objectiveDir, file, reason: 'duplicate' });
        continue;
      }
      seen.add(id);
      const entry = { id, objective: String(number), objective_dir: objectiveDir, file, path: `${rel}/${file}` };
      let text;
      try {
        text = fs.readFileSync(path.join(abs, file), 'utf8');
      } catch {
        entries.push({ ...entry, class: 'missing', source: null, reason: 'unreadable' });
        continue;
      }
      const c = classifySummary(text);
      entries.push({ ...entry, class: c.class, source: c.source });
    }
  }
  entries.sort(compareEntries);
  return { entries, skipped };
}

// ─── the fraction ─────────────────────────────────────────────────────────────

/**
 * `live / counted` as a decimal text floored at 6 places, trailing zeros trimmed (`2/4` is `0.5`, `4/4` is `1`), or null
 * when nothing is counted. Integer arithmetic only, so 5/7 prints `0.714285` and never the rounded `0.714286`.
 */
function ratioText(live, counted) {
  if (counted === 0) return null;
  const scaled = Math.floor((live * 1000000) / counted);
  const intPart = Math.floor(scaled / 1000000);
  const frac = String(scaled % 1000000).padStart(6, '0').replace(/0+$/, '');
  return frac ? `${intPart}.${frac}` : String(intPart);
}

/**
 * @param {Array<{class: string}>} entries
 * @returns {{counts: {summaries: number, counted: number, live: number, backfill: number, unlabeled: number,
 *   missing: number, in_progress: number},
 *   forward: {numerator: number, denominator: number, ratio: number|null, ratio_text: string|null,
 *   target_percent: number, met: boolean|null}}}
 */
function coverageOf(entries) {
  const list = entries || [];
  const n = (cls) => list.filter((e) => e.class === cls).length;
  const live = n('live');
  const backfill = n('backfill');
  const unlabeled = n('unlabeled');
  const missing = n('missing');
  const inProgress = n('in_progress');
  const counted = live + backfill + unlabeled + missing;
  return {
    counts: { summaries: list.length, counted, live, backfill, unlabeled, missing, in_progress: inProgress },
    forward: {
      numerator: live,
      denominator: counted,
      ratio: counted === 0 ? null : live / counted,
      ratio_text: ratioText(live, counted),
      target_percent: TARGET_PERCENT,
      met: counted === 0 ? null : live * 100 >= TARGET_PERCENT * counted,
    },
  };
}

// ─── why a SUMMARY is missing ─────────────────────────────────────────────────

/**
 * New entries with a `reason` on each missing one that has none: `stamp_skipped` when an executor transcript of that TRD
 * exists for this repository (token-usage.tokensForTrd recovers it, so the forward stamp could have run), otherwise
 * tokensForTrd's own reason (`no_transcript`, `ambiguous_objective`, `zero_usage`). Entries of any other class, and a missing
 * entry that already has a reason (`unreadable`), are copied untouched.
 *
 * `indexFactory` returns the transcript index. It is called at most once, and not at all when nothing needs a reason. If it
 * throws, every entry that needed a reason gets `transcripts_unreadable`. Without a factory no reason is added.
 *
 * @param {Array<object>} entries
 * @param {{indexFactory?: () => object, readRoot: string}} opts
 */
function explainMissing(entries, { indexFactory, readRoot } = {}) {
  const needs = (e) => e.class === 'missing' && !e.reason;
  if (typeof indexFactory !== 'function' || !entries.some(needs)) return entries.map((e) => ({ ...e }));

  let state = null;
  const index = () => {
    if (state === null) {
      try {
        state = { value: indexFactory() };
      } catch {
        state = { failed: true };
      }
    }
    return state;
  };

  return entries.map((e) => {
    if (!needs(e)) return { ...e };
    const got = index();
    if (got.failed) return { ...e, reason: 'transcripts_unreadable' };
    try {
      const found = tu.tokensForTrd(got.value, {
        id: e.id,
        dir: e.objective_dir,
        sharedNumber: tu.objectiveDirsFor(readRoot, e.id).length > 1,
      });
      return { ...e, reason: found.status === 'recovered' ? 'stamp_skipped' : found.reason };
    } catch {
      return { ...e, reason: 'transcripts_unreadable' };
    }
  });
}

// ─── text ─────────────────────────────────────────────────────────────────────

/**
 * The report text: one summary line, then one line per entry that is not live (id order), then one per skipped file.
 * No trailing newline.
 */
function formatCoverage(report) {
  const { scope, counts, forward } = report;
  const label = scope.kind === 'milestone' ? scope.version : `objective ${scope.objective}`;
  const tail = `in progress ${counts.in_progress} (not counted)`;
  const lines = [];
  if (counts.counted === 0) {
    lines.push(`${label} forward-stamped 0/0 (no executed TRDs in scope) · ${tail}`);
  } else {
    lines.push(
      `${label} forward-stamped ${forward.numerator}/${forward.denominator} = ${forward.ratio_text} `
      + `(target ${forward.target_percent}%: ${forward.met ? 'met' : 'not met'}) · live ${counts.live} · `
      + `backfill ${counts.backfill} · unlabeled ${counts.unlabeled} · missing ${counts.missing} · ${tail}`,
    );
  }
  for (const e of report.entries || []) {
    if (e.class === 'live') continue;
    const name = e.class === 'in_progress' ? 'in progress' : e.class;
    lines.push(`  ${e.id} ${name}${e.reason ? ` (${e.reason})` : ''}`);
  }
  for (const s of report.skipped || []) lines.push(`  skipped ${s.objective_dir}/${s.file} (${s.reason})`);
  return lines.join('\n');
}

// ─── the report ───────────────────────────────────────────────────────────────

/**
 * @param {{readRoot: string, scope: {kind: 'milestone'|'objective', version?: string, objective?: string,
 *   dirs: Array<{number: string, dir: string}>}, indexFactory?: () => object}} opts
 * @returns {{scope: {kind: string, version?: string, objective?: string, objectives: Array<{number: string, dir: string}>},
 *   read_root: string, counts: object, forward: object, entries: Array<object>, skipped: Array<object>}}
 */
function buildCoverage({ readRoot, scope, indexFactory }) {
  const dirs = (scope.dirs || []).map(({ number, dir }) => ({ number, dir }));
  const collected = collectSummaries(readRoot, dirs);
  const entries = explainMissing(collected.entries, { indexFactory, readRoot });
  const { counts, forward } = coverageOf(entries);

  const outScope = { kind: scope.kind };
  if (scope.version !== undefined) outScope.version = scope.version;
  if (scope.objective !== undefined) outScope.objective = scope.objective;
  outScope.objectives = dirs;

  return { scope: outScope, read_root: readRoot, counts, forward, entries, skipped: collected.skipped };
}

module.exports = {
  TARGET_PERCENT,
  CLASSES,
  classifySummary,
  collectSummaries,
  coverageOf,
  ratioText,
  explainMissing,
  formatCoverage,
  buildCoverage,
};
