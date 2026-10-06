'use strict';

/**
 * session-audit.cjs — TRD 31-03
 *
 * Classifies autonomy-blocking events in Claude Code session transcripts.
 *
 * This is the durable form of the 2026-08-18 Autonomy Blocker Audit, which was
 * a throwaway script. Two reasons it needs to live in the repo:
 *
 *   1. It is the acceptance test for objectives 27-30. Those objectives claim to
 *      have removed specific block categories; the only honest way to confirm
 *      that is to re-measure and watch the categories collapse.
 *   2. Re-deriving it invites re-deriving its bugs. The original first pass
 *      counted prose ABOUT gates as gate events (899 false hits from planning
 *      documents that merely discuss them). Classification here runs only on
 *      structured tool_result errors, never on free text.
 *
 * Baseline to beat (2,746 sessions, 2026-05-29 → 2026-08-18):
 *   worktree-isolation   2685   (harness guard, not DevFlow — mitigated in 27-05)
 *   devflow-edit-gate    1357   (fixed in 27-01/27-02)
 *   devflow-commit-gate   446   (fixed in 27-04)
 *   file-not-found        498   (mitigated in 30-03)
 *   tool-not-available    164   (fixed in 30-01)
 *   skill-not-invocable    68   (fixed in 30-02)
 *
 * What happened after each edit-gate denial (quick 31 — the measurement
 * DECISION-001 waits on). `summarize()` appends `edit_gate_bypass`: every
 * `devflow-edit-gate` denial gets exactly one outcome, so
 * denials === bypasses + routed + abandoned === by_category['devflow-edit-gate'].
 * Per transcript file (one session), decided by the first event after the denial:
 *
 *   bypass     a later Bash tool_use WRITES the denied path (redirect, heredoc,
 *              tee, sed -i, cp/mv, perl -i, inline python/node). It counts the
 *              ATTEMPT when the tool_use appears, whatever its tool_result says.
 *   routed     a devflow:* Skill call, a `skill-active --start` Bash call, a typed
 *              `/devflow:` slash command, or a user override phrase. A user
 *              override counts as routed because it is a sanctioned path: the
 *              user chose to let the edit through.
 *   abandoned  still open when the corpus ends.
 *
 * Path match is basename-tolerant (a heuristic, so a same-named file elsewhere is
 * a possible false positive). Like classification, tracking runs only on
 * structured blocks (tool_use, tool_result, user text), never on raw text.
 */

const fs = require('fs');
const path = require('path');

/**
 * Classifiers, applied ONLY to the content of a failed tool_result.
 * Order matters — first match wins, most specific first.
 */
const RULES = [
  ['devflow-edit-gate', /DevFlow ambient mode active|direct Edit\/Write\/MultiEdit denied/i],
  ['devflow-commit-gate', /Raw .?git commit.? is blocked|df-tools\.cjs commit.*so the commit is scoped/i],
  ['devflow-changelog-gate', /CHANGELOG\.md lacks|DEVFLOW_SKIP_CHANGELOG_GATE/i],
  ['worktree-isolation', /is isolated in the worktree/i],
  ['skill-not-invocable', /disable-model-invocation/i],
  ['tool-not-available', /No such tool available|is not enabled in this context/i],
  ['permission-denial', /user doesn't want to (proceed|take this action)|tool use was rejected/i],
  ['read-before-write', /File has not been read yet|File has been modified since read/i],
  ['edit-string-miss', /String to replace not found|No changes to make: old_string and new_string/i],
  ['command-timeout', /Command timed out after/i],
  ['file-not-found', /File does not exist|ENOENT|no such file or directory/i],
  ['output-too-large', /exceeds maximum allowed (size|tokens)/i],
];

/** Categories DevFlow owns and this programme claims to have fixed. */
const DEVFLOW_OWNED = new Set([
  'devflow-edit-gate', 'devflow-commit-gate', 'devflow-changelog-gate',
  'skill-not-invocable', 'tool-not-available',
]);

/**
 * Classify one failed tool_result's text.
 * @param {string} text
 * @returns {string} category, or 'other-tool-error'
 */
function classify(text) {
  const t = String(text || '');
  for (const [name, re] of RULES) if (re.test(t)) return name;
  return 'other-tool-error';
}

// ─── Edit-gate outcome tracking (quick 31) ──────────────────────────────────

/** Tools the edit gate denies; the denied path is on their input. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/**
 * Copied from hooks/lib/edit-override.js (OVERRIDE_PHRASES). Do NOT require it:
 * hooks/ is not mirrored to ~/.claude/devflow/, so the runtime copy would throw.
 * session-audit.test.cjs (D-1) fails if the two lists drift.
 */
const OVERRIDE_PHRASES = [
  'skip devflow',
  'just edit',
  'bypass devflow',
  'force edit',
];

/** A Bash call that starts a skill marker is a route into the sanctioned path. */
const SKILL_ACTIVE_RE = /\bskill-active\s+--start\b/;

// Heredoc bodies and terminators, keeping the opener line: lib/shell-words.cjs (TRD 60-01).
const { stripHeredocBodies } = require('./shell-words.cjs');

/** Redirect targets that are never files worth tracking. */
const IGNORED_TARGETS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr']);

const unquote = s => String(s).replace(/^(['"`])(.*)\1$/, '$2');

/** Quotes and a leading `./` are noise when comparing a target to a path. */
const cleanTarget = t => String(t).trim().replace(/^['"`]+|['"`]+$/g, '').replace(/^\.\//, '');

/**
 * Paths a Bash command writes, as written in the command (quotes stripped).
 * A heuristic over shell text, not a parser: it covers the forms agents use to
 * get around the edit gate. Reads and writes to other files yield other targets.
 * @param {string} cmd
 * @returns {string[]}
 */
function bashWriteTargets(cmd) {
  if (typeof cmd !== 'string' || !cmd) return [];
  const targets = [];

  // Inline code: scan the FULL command, because heredoc bodies hold python/node source.
  const inline = [
    /\bopen\(\s*['"]([^'"\n]+)['"]\s*,\s*(?:mode\s*=\s*)?['"][^'"]*[wax]/g,
    /\bPath\(\s*['"]([^'"\n]+)['"]\s*\)\.write_(?:text|bytes)\(/g,
    /\b(?:writeFileSync|appendFileSync)\(\s*['"`]([^'"`\n]+)['"`]/g,
  ];
  for (const re of inline) {
    for (const m of cmd.matchAll(re)) targets.push(m[1]);
  }

  // Shell: scan with heredoc bodies removed so text inside a body is not a write.
  const stripped = stripHeredocBodies(cmd);
  for (const m of stripped.matchAll(/(?<![<>=-])>{1,2}(?![>&=])\s*(['"]?)([^\s'"<>|;&()]+)\1/g)) {
    targets.push(m[2]);
  }

  for (const seg of stripped.split(/&&|\|\||[;|\n]/)) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean).map(unquote);
    while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
    if (!tokens.length) continue;
    const rest = tokens.slice(1);
    const args = rest.filter(t => !t.startsWith('-'));
    switch (path.posix.basename(tokens[0])) {
      case 'tee':
        targets.push(...args);
        break;
      case 'sed':
      case 'gsed':
        if (rest.some(t => /^(-i|--in-place)/.test(t)) && rest.length > 1) targets.push(rest[rest.length - 1]);
        break;
      case 'perl':
        // `-pi`, `-i.bak`: the `i` must close the flag cluster, so `-Mstrict` is not `-i`.
        if (rest.some(t => /^-[A-Za-z]*i(\.\S+)?$/.test(t)) && rest.length > 1) targets.push(rest[rest.length - 1]);
        break;
      case 'cp':
      case 'mv':
        if (args.length >= 2) targets.push(args[args.length - 1]);
        break;
      default:
    }
  }

  return targets
    .map(cleanTarget)
    .filter(t => t && !IGNORED_TARGETS.has(t));
}

/**
 * Does a command's write target name the denied path? Basename-tolerant on
 * purpose: `src/a.go`, `./src/a.go` and `"$REPO/src/a.go"` all hit `/repo/src/a.go`.
 * @param {string} target
 * @param {string} p
 * @returns {boolean}
 */
function targetMatches(target, p) {
  if (typeof target !== 'string' || typeof p !== 'string') return false;
  const t = cleanTarget(target);
  const q = cleanTarget(p);
  if (!t || !q || IGNORED_TARGETS.has(t)) return false;
  if (t === q) return true;
  const base = path.posix.basename(t);
  return base !== '' && base === path.posix.basename(q);
}

function newEditGate() {
  // sessions: sid -> { editPaths: Map<toolUseId, path>, open: [{ path, ts }] }
  return { sessions: new Map(), resolved: [], samples: [] };
}

function editGateSession(acc, sid) {
  if (!acc.editGate) acc.editGate = newEditGate();
  const key = sid || '';
  let st = acc.editGate.sessions.get(key);
  if (!st) {
    st = { editPaths: new Map(), open: [] };
    acc.editGate.sessions.set(key, st);
  }
  return st;
}

/** Close every open denial of a session with one outcome. */
function resolveAll(acc, st, outcome) {
  for (const d of st.open) acc.editGate.resolved.push({ outcome, ts: d.ts });
  st.open = [];
}

/** A user's own words: a typed /devflow: command routes, as does an override phrase. */
function trackUserText(acc, st, text, isMeta) {
  if (typeof text !== 'string' || !st.open.length) return;
  if (text.includes('<command-name>/devflow:')) { resolveAll(acc, st, 'routed'); return; }
  if (isMeta) return; // skill-body injections are not the user's words
  const lower = text.toLowerCase();
  if (OVERRIDE_PHRASES.some(p => lower.includes(p))) resolveAll(acc, st, 'routed');
}

/**
 * Per-session edit-gate denial tracker. Reads the row and writes ONLY
 * `acc.editGate`; it never touches `acc.events`.
 */
function trackEditGate(acc, row, sid) {
  const st = editGateSession(acc, sid);
  const isUser = row.type === 'user';
  const content = row.message && row.message.content;

  if (isUser && typeof content === 'string') {
    trackUserText(acc, st, content, row.isMeta === true);
    return;
  }
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;

    if (block.type === 'tool_use') {
      const input = block.input && typeof block.input === 'object' ? block.input : {};
      if (EDIT_TOOLS.has(block.name)) {
        const p = input.file_path || input.notebook_path;
        if (block.id && typeof p === 'string') st.editPaths.set(block.id, p);
      } else if (block.name === 'Skill') {
        if (typeof input.skill === 'string' && input.skill.startsWith('devflow:')) resolveAll(acc, st, 'routed');
      } else if (block.name === 'Bash' && typeof input.command === 'string') {
        const cmd = input.command;
        if (SKILL_ACTIVE_RE.test(cmd)) { resolveAll(acc, st, 'routed'); continue; }
        if (!st.open.length) continue;
        const targets = bashWriteTargets(cmd);
        if (!targets.length) continue;
        const hit = st.open.filter(d => d.path && targets.some(t => targetMatches(t, d.path)));
        if (!hit.length) continue;
        for (const d of hit) acc.editGate.resolved.push({ outcome: 'bypassed', ts: d.ts });
        st.open = st.open.filter(d => !hit.includes(d));
        // One bypassing command is one sample, however many retries it resolved.
        if (acc.editGate.samples.length < 5) {
          acc.editGate.samples.push({
            ts: row.timestamp || null,
            file: path.posix.basename(cleanTarget(hit[0].path)),
            command: cmd.replace(/\s+/g, ' ').trim().slice(0, 200),
          });
        }
      }
    } else if (block.type === 'tool_result') {
      if (block.is_error !== true) continue;
      const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
      if (classify(text) !== 'devflow-edit-gate') continue;
      st.open.push({ path: st.editPaths.get(block.tool_use_id) || null, ts: row.timestamp || null });
    } else if (block.type === 'text' && isUser) {
      trackUserText(acc, st, block.text, row.isMeta === true);
    }
  }
}

/**
 * Free what a finished transcript no longer needs. Open denials stay: they are
 * counted as abandoned by `summarize()`.
 */
function endEditGateSession(acc, sid) {
  const st = acc.editGate && acc.editGate.sessions.get(sid || '');
  if (st) st.editPaths.clear();
}

function summarizeEditGate(acc) {
  const eg = acc.editGate || newEditGate();
  // Outcomes = resolved ones plus every still-open denial as abandoned. Nothing is mutated.
  const all = eg.resolved.slice();
  for (const st of eg.sessions.values()) {
    for (const d of st.open) all.push({ outcome: 'abandoned', ts: d.ts });
  }

  const KEY = { bypassed: 'bypasses', routed: 'routed', abandoned: 'abandoned' };
  const totals = { denials: 0, bypasses: 0, routed: 0, abandoned: 0 };
  const periods = {};
  for (const o of all) {
    totals.denials += 1;
    totals[KEY[o.outcome]] += 1;
    if (!o.ts) continue;
    const period = String(o.ts).slice(0, 7);
    const p = periods[period] || (periods[period] = { denials: 0, bypasses: 0, routed: 0, abandoned: 0 });
    p.denials += 1;
    p[KEY[o.outcome]] += 1;
  }

  return {
    ...totals,
    bypass_rate: totals.denials ? +(totals.bypasses / totals.denials).toFixed(3) : 0,
    by_period: Object.fromEntries(Object.entries(periods).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    sample: eg.samples.map(s => ({ ...s })),
  };
}

function newAccumulator() {
  return {
    events: [], sessions: new Set(), blockedSessions: new Set(), files: 0,
    editGate: newEditGate(),
  };
}

/**
 * Fold one transcript record into the accumulator.
 * Exported so aggregation is testable without disk.
 */
function accumulate(acc, row, sessionId) {
  if (!row || typeof row !== 'object') return;
  if (sessionId) acc.sessions.add(sessionId);
  // Before the array check below: typed slash commands and prompts are string content.
  trackEditGate(acc, row, sessionId);

  const content = row.message && row.message.content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type !== 'tool_result' || block.is_error !== true) continue;
    const text = typeof block.content === 'string'
      ? block.content
      : JSON.stringify(block.content || '');
    acc.events.push({
      category: classify(text),
      ts: row.timestamp || null,
      sidechain: row.isSidechain === true,
      session: sessionId || null,
    });
    if (sessionId) acc.blockedSessions.add(sessionId);
  }
}

/**
 * @param {object} acc
 * @returns {object} report
 */
function summarize(acc) {
  const by_category = {};
  const by_period = {};
  let sidechain = 0;

  for (const e of acc.events) {
    by_category[e.category] = (by_category[e.category] || 0) + 1;
    if (e.sidechain) sidechain += 1;
    if (e.ts) {
      const period = String(e.ts).slice(0, 7);
      (by_period[period] || (by_period[period] = {}))[e.category] =
        (by_period[period][e.category] || 0) + 1;
    }
  }

  const devflowOwned = Object.entries(by_category)
    .filter(([c]) => DEVFLOW_OWNED.has(c))
    .reduce((a, [, n]) => a + n, 0);

  const sessions = acc.sessions.size;
  return {
    files_scanned: acc.files,
    sessions,
    sessions_with_blocks: acc.blockedSessions.size,
    sessions_with_blocks_pct: sessions
      ? +((100 * acc.blockedSessions.size) / sessions).toFixed(1) : 0,
    total_events: acc.events.length,
    sidechain_pct: acc.events.length
      ? +((100 * sidechain) / acc.events.length).toFixed(1) : 0,
    by_category: Object.fromEntries(
      Object.entries(by_category).sort((a, b) => b[1] - a[1])
    ),
    by_period,
    devflow_owned_events: devflowOwned,
    // The programme's claim, stated as a number rather than a vibe.
    verdict: devflowOwned === 0
      ? 'no DevFlow-owned blocks in this window'
      : `${devflowOwned} DevFlow-owned blocks remain — objectives 27/30 target these`,
    // Appended last so every key above keeps its name, value and order.
    edit_gate_bypass: summarizeEditGate(acc),
  };
}

function collectTranscripts(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectTranscripts(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/**
 * Scan transcripts and report blocking events.
 *
 * @param {string[]} roots
 * @param {{limit?: number, since?: string}} [opts] - `since` is an ISO date;
 *   events before it are excluded, which is how you compare a window AFTER a
 *   fix against the baseline before it.
 * @returns {object}
 */
function analyze(roots, opts = {}) {
  const acc = newAccumulator();
  let files = [];
  for (const r of roots) collectTranscripts(r, files);
  if (opts.limit && files.length > opts.limit) files = files.slice(0, opts.limit);
  acc.files = files.length;

  for (const file of files) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const sessionId = path.basename(file, '.jsonl');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (opts.since && row.timestamp && String(row.timestamp) < opts.since) continue;
      accumulate(acc, row, sessionId);
    }
    endEditGateSession(acc, sessionId);
  }
  return summarize(acc);
}

module.exports = {
  analyze, accumulate, summarize, newAccumulator, classify,
  collectTranscripts, RULES, DEVFLOW_OWNED,
  bashWriteTargets, targetMatches, stripHeredocBodies, OVERRIDE_PHRASES,
};
