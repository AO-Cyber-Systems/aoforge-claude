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
 *   worktree-isolation   2685   (harness guard, not AOForge — mitigated in 27-05)
 *   aoforge-edit-gate    1357   (fixed in 27-01/27-02)
 *   aoforge-commit-gate   446   (fixed in 27-04)
 *   file-not-found        498   (mitigated in 30-03)
 *   tool-not-available    164   (fixed in 30-01)
 *   skill-not-invocable    68   (fixed in 30-02)
 *
 * What happened after each edit-gate denial (quick 31 — the measurement
 * DECISION-001 waits on). `summarize()` appends `edit_gate_bypass`: every
 * `aoforge-edit-gate` denial gets exactly one outcome, so
 * denials === bypasses + routed + abandoned === by_category['aoforge-edit-gate'].
 * Per transcript file (one session), decided by the first event after the denial:
 *
 *   bypass     a later Bash tool_use WRITES the denied path (redirect, heredoc,
 *              tee, sed -i, cp/mv, perl -i, inline python/node). It counts the
 *              ATTEMPT when the tool_use appears, whatever its tool_result says.
 *   routed     an aoforge:* Skill call, a `skill-active --start` Bash call, a typed
 *              `/aoforge:` slash command, or a user override phrase. A user
 *              override counts as routed because it is a sanctioned path: the
 *              user chose to let the edit through.
 *   abandoned  still open when the corpus ends.
 *
 * Path match is basename-tolerant (a heuristic, so a same-named file elsewhere is
 * a possible false positive). Like classification, tracking runs only on
 * structured blocks (tool_use, tool_result, user text), never on raw text.
 *
 * Bash write gate replay (TRD 60-05, GATE-05). `summarize()` also appends
 * `bash_edit_gate`: every Bash call in the transcripts is run through the hook's
 * own decision (bash-write-gate.cjs evaluateBashWrites) in dry-run. Nothing is
 * executed or written; git is only read, one `git log` per project root.
 *
 * Ambient means all four of: the row's cwd is inside an AOForge project (an
 * ancestor has `.aoforge/`); the transcript is not an aoforge:* subagent (the
 * sibling `.meta.json` agentType); the row is not attributed to an aoforge:*
 * skill (`attributionSkill`); and no skill-active window is open in that
 * session (`skill-active --start` ... `--end`, or an aoforge Skill call earlier
 * in it, for rows older than `attributionSkill`). Override phrases are ignored:
 * that counts more would-denies, never fewer, which is the safe direction.
 *
 * A target is tracked only if git history says it was tracked AT THE ROW'S
 * TIMESTAMP (the last add or delete at or before it). Today's `git ls-files`
 * would call every file a command created, and committed afterwards, tracked.
 *
 * A transcript cannot say whether a flagged command was a genuine write, so
 * every would-deny counts as a false positive: false_positive_rate =
 * would_deny / ambient_bash_calls, an UPPER BOUND. GATE-05: the Bash rule ships
 * `strict` only if that bound is at most 2% (FP_THRESHOLD), otherwise `warn`
 * (recommendDefault). The measured evidence and the chosen default are TRD
 * 60-06's: references/bash-edit-gate-evidence.json.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  evaluateBashWrites, recommendDefault, realpathDeep, BASH_GATE_CLASSIFIER, FP_THRESHOLD,
} = require('./bash-write-gate.cjs');
const { findProjectRoot, isOwnAgentType } = require('./compat.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

/** `alts` as one case-insensitive alternation of literal strings. */
const anyOf = (alts) => alts.map(escapeRegExp).join('|');

/**
 * An agent type or skill name of ours: either namespace with a non-empty name (compat.isOwnAgentType; skills share
 * the agent namespace). History recorded under the pre-rename namespace counts as ours (TRD 72-10).
 */
const isAoforgeName = isOwnAgentType;

/**
 * Classifiers, applied ONLY to the content of a failed tool_result.
 * Order matters — first match wins, most specific first.
 * The Bash rule's denial text starts with the same `AOForge ambient mode active`
 * as the Edit/Write one, so it must come first.
 *
 * TRD 72-10: every gate's pre-rename denial text maps to the same id as its new
 * one (the product name, the CLI name and the env prefix come from NAMES and
 * LEGACY), so history recorded before the rename keeps counting. Reports keyed
 * by the old ids are history.
 */
const RULES = [
  ['aoforge-bash-edit-gate', BASH_GATE_CLASSIFIER],
  ['aoforge-edit-gate', new RegExp(
    `(?:${anyOf([NAMES.product, LEGACY.product])}) ambient mode active|direct Edit\\/Write\\/MultiEdit denied`, 'i')],
  ['aoforge-commit-gate', new RegExp(
    `Raw .?git commit.? is blocked|(?:${anyOf([NAMES.cli, LEGACY.cli])})\\.cjs commit.*so the commit is scoped`, 'i')],
  ['aoforge-changelog-gate', new RegExp(
    `CHANGELOG\\.md lacks|(?:${anyOf([NAMES.envPrefix, LEGACY.envPrefix])})SKIP_CHANGELOG_GATE`, 'i')],
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

/** Categories AOForge owns and this programme claims to have fixed. */
const AOFORGE_OWNED = new Set([
  'aoforge-edit-gate', 'aoforge-bash-edit-gate', 'aoforge-commit-gate', 'aoforge-changelog-gate',
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
 * hooks/ is not mirrored to ~/.claude/aoforge/, so the runtime copy would throw.
 * session-audit.test.cjs (D-1) fails if the two lists drift.
 */
const OVERRIDE_PHRASES = [
  'skip aoforge',
  'just edit',
  'bypass aoforge',
  'force edit',
];

/**
 * The override phrases as history recorded them: the current list plus each phrase under the pre-rename product
 * name (TRD 72-10). A transcript from before the rename says the old phrase, and it was a sanctioned route then.
 */
const HISTORY_OVERRIDE_PHRASES = Object.freeze([...new Set([
  ...OVERRIDE_PHRASES,
  ...OVERRIDE_PHRASES.map((p) => p.split(NAMES.slug).join(LEGACY.slug)),
])]);

/** A typed slash command of ours, in either namespace, as the transcript records it. */
const OWN_COMMAND_TAGS = Object.freeze([NAMES.commandNs, LEGACY.commandNs].map((ns) => `<command-name>${ns}`));

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

/**
 * A user's own words: a typed /aoforge: command routes, as does an override phrase. The pre-rename command
 * namespace and phrases route too (TRD 72-10).
 */
function trackUserText(acc, st, text, isMeta) {
  if (typeof text !== 'string' || !st.open.length) return;
  if (OWN_COMMAND_TAGS.some(tag => text.includes(tag))) { resolveAll(acc, st, 'routed'); return; }
  if (isMeta) return; // skill-body injections are not the user's words
  const lower = text.toLowerCase();
  if (HISTORY_OVERRIDE_PHRASES.some(p => lower.includes(p))) resolveAll(acc, st, 'routed');
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
        if (isAoforgeName(input.skill)) resolveAll(acc, st, 'routed');
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
      if (classify(text) !== 'aoforge-edit-gate') continue;
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

// ─── Bash write gate replay (TRD 60-05) ─────────────────────────────────────

/** The forms detectBashWrites reports, in the order the report lists them. */
const GATE_FORMS = ['redirect', 'tee', 'sed-i', 'perl-i', 'cp', 'mv', 'python', 'node'];
const SKILL_END_RE = /\bskill-active\s+--end\b/;
const SAMPLE_CAP = 10;
const FP_BASIS = 'upper bound: every would-deny in the ambient replay counts as a false positive';


/** The directory a cp or mv would write into, if it exists now. A read, like the hook's check. */
function liveIsDirectory(abs) {
  try { return fs.statSync(abs).isDirectory(); } catch { return false; }
}

/**
 * The nearest ancestor of `cwd` (itself included) that has a planning directory (compat.findProjectRoot
 * one directory at a time, `.aoforge/` or a legacy one), or null. `cache` maps every directory visited to its answer, so a
 * corpus of rows in a few hundred directories stats each directory once.
 * @param {string} cwd
 * @param {Map<string, string|null>} cache
 * @returns {string|null}
 */
function findPlanningRoot(cwd, cache) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return null;
  const visited = [];
  let found = null;
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (cache.has(dir)) { found = cache.get(dir); break; }
    visited.push(dir);
    let isProject = false;
    try { isProject = findProjectRoot(dir, { maxUp: 0 }) !== null; } catch { /* unreadable: not a project here */ }
    if (isProject) { found = dir; break; }
    if (path.dirname(dir) === dir) break;
  }
  for (const dir of visited) cache.set(dir, found);
  return found;
}

/** git quotes a path with unusual characters; the plain `"..."` forms decode as JSON. */
function unquoteGitPath(p) {
  if (!p.startsWith('"') || !p.endsWith('"')) return p;
  try { return JSON.parse(p); } catch { return p; }
}

/**
 * `git log --name-status --format=@%ct` -> Map<relative path, [{ t, kind }]>,
 * each list ascending in time. git prints newest first, so the list is reversed
 * before a stable sort: events in the same second keep their commit order.
 * @param {string} out
 * @returns {Map<string, Array<{t: number, kind: 'A'|'D'}>>}
 */
function parseHistory(out) {
  const events = [];
  let t = NaN;
  for (const line of out.split('\n')) {
    if (line.startsWith('@')) { t = Number(line.slice(1)); continue; }
    const m = /^([AD])\t(.+)$/.exec(line);
    if (m && Number.isFinite(t)) events.push({ t, kind: m[1], rel: unquoteGitPath(m[2]) });
  }
  events.reverse();
  events.sort((a, b) => a.t - b.t);
  const byPath = new Map();
  for (const e of events) {
    const list = byPath.get(e.rel);
    if (list) list.push({ t: e.t, kind: e.kind }); else byPath.set(e.rel, [{ t: e.t, kind: e.kind }]);
  }
  return byPath;
}

/**
 * Answers "was this file tracked at that moment?" from each project's git
 * history. One `git log` per project root, read-only, cached by the root's real
 * path. A root that git cannot read is unavailable: `trackedAt` returns null.
 *
 * @param {{spawn?: Function}} [opts] spawn replaces child_process.spawnSync (tests)
 * @returns {{
 *   trackedAt: (root: string, absPaths: string[], ts?: string) => Set<string>|null,
 *   available: (root: string) => boolean,
 * }}
 */
function newHistoryTracker({ spawn = spawnSync } = {}) {
  const roots = new Map(); // realpathDeep(root) -> { key, events } | null
  const keys = new Map(); // root as given -> realpathDeep(root), resolved once: it is asked once per Bash row

  function load(root) {
    let key = keys.get(root);
    if (key === undefined) { key = realpathDeep(root); keys.set(root, key); }
    if (roots.has(key)) return roots.get(key);
    let entry = null;
    try {
      const r = spawn('git', [
        '-c', 'core.quotePath=false', '-C', root, 'log',
        '--no-renames', '--relative', '--diff-filter=AD', '--name-status', '--format=@%ct',
      ], {
        encoding: 'utf8',
        maxBuffer: 256 << 20,
        timeout: 60000,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      });
      if (r && !r.error && r.status === 0 && typeof r.stdout === 'string') {
        entry = { key, events: parseHistory(r.stdout) };
      }
    } catch { entry = null; /* git missing or the spawn failed: the root has no history */ }
    roots.set(key, entry);
    return entry;
  }

  /** The subset of `absPaths` tracked at `ts` (a row with no usable timestamp sees the latest state). */
  function trackedAt(root, absPaths, ts) {
    const entry = load(root);
    if (!entry) return null;
    const tracked = new Set();
    const parsed = typeof ts === 'string' ? Date.parse(ts) / 1000 : NaN;
    const when = Number.isFinite(parsed) ? parsed : Infinity;
    for (const abs of absPaths || []) {
      const rel = path.relative(entry.key, realpathDeep(abs)).split(path.sep).join('/');
      if (rel === '' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) continue;
      let isTracked = false;
      for (const e of entry.events.get(rel) || []) {
        if (e.t > when) break;
        isTracked = e.kind === 'A';
      }
      if (isTracked) tracked.add(abs);
    }
    return tracked;
  }

  return { trackedAt, available: root => load(root) !== null };
}

function newBashGate({ trackedAt } = {}) {
  return {
    // Injected for tests; otherwise the git history reader, built on first use.
    trackedAt: typeof trackedAt === 'function' ? trackedAt : null,
    rootCache: new Map(),
    sessions: new Map(), // sid -> { window: boolean } — an aoforge skill is active
    bashCalls: 0,
    ambient: 0,
    excluded: { aoforge_agent: 0, aoforge_skill: 0, not_aoforge_project: 0, history_unavailable: 0, error: 0 },
    wouldDeny: 0,
    byForm: Object.fromEntries(GATE_FORMS.map(f => [f, 0])),
    periods: {},
    sample: [],
  };
}

function bashGateOf(acc) {
  if (!acc.bashGate) acc.bashGate = newBashGate();
  return acc.bashGate;
}

function trackedAtOf(bg) {
  if (!bg.trackedAt) bg.trackedAt = newHistoryTracker().trackedAt;
  return bg.trackedAt;
}

/** The form of the first write that produced the first gated path. */
function gatedForm(writes, gatedAbs) {
  const hit = writes.find(w => w.path === gatedAbs
    || ((w.form === 'cp' || w.form === 'mv') && w.path && path.dirname(gatedAbs) === path.resolve(w.path)));
  return (hit || writes[0] || {}).form;
}

/**
 * One Bash call. Counters change only after the whole decision succeeded, so a
 * throw leaves the call counted in `bashCalls` and nothing else, and the caller
 * counts it as an error: bashCalls = ambient + every exclusion.
 */
function replayBashCall(bg, st, row, cmd, fileCtx) {
  bg.bashCalls += 1;
  if (SKILL_ACTIVE_RE.test(cmd)) { st.window = true; bg.excluded.aoforge_skill += 1; return; }
  if (SKILL_END_RE.test(cmd)) { st.window = false; bg.excluded.aoforge_skill += 1; return; }
  if (fileCtx && isAoforgeName(fileCtx.agentType)) { bg.excluded.aoforge_agent += 1; return; }
  if (isAoforgeName(row.attributionSkill) || st.window) { bg.excluded.aoforge_skill += 1; return; }

  const projectRoot = findPlanningRoot(row.cwd, bg.rootCache);
  if (!projectRoot) { bg.excluded.not_aoforge_project += 1; return; }

  const trackedAt = trackedAtOf(bg);
  const ts = row.timestamp;
  if (trackedAt(projectRoot, [], ts) === null) { bg.excluded.history_unavailable += 1; return; }

  const result = evaluateBashWrites(cmd, {
    cwd: row.cwd,
    projectRoot,
    home: os.homedir(),
    isDirectory: liveIsDirectory,
    isTracked: abs => trackedAt(projectRoot, abs, ts) || new Set(),
  });

  bg.ambient += 1;
  const period = ts ? String(ts).slice(0, 7) : null;
  const p = period ? (bg.periods[period] || (bg.periods[period] = { ambient: 0, would_deny: 0 })) : null;
  if (p) p.ambient += 1;
  if (!result.gated.length) return;

  bg.wouldDeny += 1;
  if (p) p.would_deny += 1;
  const form = gatedForm(result.writes, result.gated[0]);
  if (form) bg.byForm[form] = (bg.byForm[form] || 0) + 1;
  if (bg.sample.length < SAMPLE_CAP) {
    bg.sample.push({
      ts: ts || null,
      command: cmd.replace(/\s+/g, ' ').trim().slice(0, 200),
      gated: result.gated.map(abs => path.relative(projectRoot, abs)),
    });
  }
}

/**
 * Replays every Bash tool_use of one assistant row through the Bash gate's
 * decision. Reads the row and writes ONLY `acc.bashGate`. A throw while
 * replaying one call is counted in `excluded.error` and the audit goes on.
 *
 * @param {object} acc
 * @param {object} row
 * @param {string} [sid]
 * @param {{agentType?: string|null}|null} [fileCtx] from the transcript's sibling .meta.json
 */
function trackBashGate(acc, row, sid, fileCtx) {
  if (row.type !== 'assistant') return;
  const content = row.message && row.message.content;
  if (!Array.isArray(content)) return;
  const bg = bashGateOf(acc);
  const key = sid || '';
  let st = bg.sessions.get(key);
  if (!st) { st = { window: false }; bg.sessions.set(key, st); }

  for (const block of content) {
    if (!block || block.type !== 'tool_use') continue;
    const input = block.input && typeof block.input === 'object' ? block.input : {};
    if (block.name === 'Skill') {
      if (isAoforgeName(input.skill)) st.window = true;
    } else if (block.name === 'Bash' && typeof input.command === 'string') {
      try {
        replayBashCall(bg, st, row, input.command, fileCtx);
      } catch {
        bg.excluded.error += 1;
      }
    }
  }
}

function summarizeBashGate(acc) {
  const bg = acc.bashGate || newBashGate();
  const rate = bg.ambient ? +(bg.wouldDeny / bg.ambient).toFixed(6) : null;
  const periods = Object.entries(bg.periods).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    bash_calls: bg.bashCalls,
    ambient_bash_calls: bg.ambient,
    excluded: { ...bg.excluded },
    would_deny: bg.wouldDeny,
    by_form: { ...bg.byForm },
    false_positive_rate: rate,
    false_positive_basis: FP_BASIS,
    threshold: FP_THRESHOLD,
    recommended_default: recommendDefault(rate),
    by_period: Object.fromEntries(periods.map(([k, v]) => [k, { ...v }])),
    sample: bg.sample.map(s => ({ ...s, gated: s.gated.slice() })),
  };
}

function newAccumulator(opts = {}) {
  return {
    events: [], sessions: new Set(), blockedSessions: new Set(), files: 0,
    editGate: newEditGate(),
    bashGate: newBashGate({ trackedAt: opts.trackedAt }),
  };
}

/**
 * Fold one transcript record into the accumulator.
 * Exported so aggregation is testable without disk.
 *
 * `fileCtx` is what the transcript's sibling `.meta.json` says about it
 * (`{ agentType }`); the 3-argument form keeps working.
 */
function accumulate(acc, row, sessionId, fileCtx) {
  if (!row || typeof row !== 'object') return;
  if (sessionId) acc.sessions.add(sessionId);
  // Before the array check below: typed slash commands and prompts are string content.
  trackEditGate(acc, row, sessionId);
  try {
    trackBashGate(acc, row, sessionId, fileCtx);
  } catch {
    bashGateOf(acc).excluded.error += 1;
  }

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

  const aoforgeOwned = Object.entries(by_category)
    .filter(([c]) => AOFORGE_OWNED.has(c))
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
    aoforge_owned_events: aoforgeOwned,
    // The programme's claim, stated as a number rather than a vibe.
    verdict: aoforgeOwned === 0
      ? 'no AOForge-owned blocks in this window'
      : `${aoforgeOwned} AOForge-owned blocks remain — objectives 27/30 target these`,
    // Appended last so every key above keeps its name, value and order.
    edit_gate_bypass: summarizeEditGate(acc),
    bash_edit_gate: summarizeBashGate(acc),
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
 * What a transcript's sibling `<name>.meta.json` says about it. Subagent
 * transcripts have one (`{"agentType":"aoforge:planner",...}`); main sessions do
 * not, which is `null`.
 * @param {string} file the .jsonl path
 * @returns {{agentType: string|null}|null}
 */
function readAgentCtx(file) {
  try {
    const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return { agentType: meta && typeof meta.agentType === 'string' ? meta.agentType : null };
  } catch {
    return null; // no meta file, or an unreadable one: the transcript is not known to be an agent
  }
}

/**
 * Scan transcripts and report blocking events.
 *
 * @param {string[]} roots
 * @param {{limit?: number, since?: string, trackedAt?: Function}} [opts] - `since` is an ISO date;
 *   events before it are excluded, which is how you compare a window AFTER a
 *   fix against the baseline before it. `trackedAt(root, absPaths, ts)` replaces
 *   the git history reader of the Bash gate replay (tests).
 * @returns {object}
 */
function analyze(roots, opts = {}) {
  const acc = newAccumulator({ trackedAt: opts.trackedAt });
  let files = [];
  for (const r of roots) collectTranscripts(r, files);
  if (opts.limit && files.length > opts.limit) files = files.slice(0, opts.limit);
  acc.files = files.length;

  for (const file of files) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const sessionId = path.basename(file, '.jsonl');
    const fileCtx = readAgentCtx(file);
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (opts.since && row.timestamp && String(row.timestamp) < opts.since) continue;
      accumulate(acc, row, sessionId, fileCtx);
    }
    endEditGateSession(acc, sessionId);
  }
  return summarize(acc);
}

module.exports = {
  analyze, accumulate, summarize, newAccumulator, classify,
  collectTranscripts, RULES, AOFORGE_OWNED,
  bashWriteTargets, targetMatches, stripHeredocBodies, OVERRIDE_PHRASES,
  newHistoryTracker, summarizeBashGate, trackBashGate, findPlanningRoot,
};
