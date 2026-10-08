'use strict';

// The built-in sweep ratchet, closed (TRD 62-10, objective 62-built-in-sweep, BLTN-01, BLTN-02, BLTN-03).
//
// WHAT IT CHECKS. AOForge's own prose (skills and active workflows) uses Claude Code's built-ins
// instead of ad hoc text, and this test measures the real tree with builtin-audit.cjs:
//   BLTN-03  a discrete choice is an AskUserQuestion, not prose ("(y/n)", "Reply with a number",
//            "Offer: 1) ... 2) ...", "Wait for user response"); AskUserQuestion calls keep to the
//            tool's limits (options present, header at most 12 characters, 2 to 4 options).
//   BLTN-01  the multi-step flows (micro, quick, build, debug, plan-objective, verify-work) show
//            progress with TaskCreate and TaskUpdate (creates and completed updates at the flow's
//            minimum, an in_progress update, both tools declared in allowed-tools).
//   BLTN-02  plan-objective, new-project and milestone complete present their draft in plan mode
//            (EnterPlanMode ... draft ... ExitPlanMode after a skip rule that names --auto).
//   allowed-tools  a skill declares every built-in it uses (following its workflow references).
//            ExitPlanMode is NEVER declared: its permission prompt IS the plan approval, so
//            pre-approving it could approve the draft the user is meant to review. It is also
//            never "missing".
//
// THE RATCHET IS CLOSED. Through TRDs 62-03 to 62-11 each of eight conversion groups kept a baseline
// (__fixtures__/builtin-sweep-baseline/<group>.json) listing what was still pending, and the test
// failed on anything not listed. The wave-3 TRDs converted the prose and deleted the files; TRD
// 62-10 deleted the directory and made its absence a test, so there is no pending list and no
// exceptions file: every finding, every flow without progress or a draft review and every
// undeclared built-in fails outright. Precedent: the planning-writes ratchet of objective 48
// (planning-writes.repo.test.cjs; 48-23 deleted its baseline directory the same way).
//
// THE MARKER. A line that is not a choice (a free-text question, a quoted example, a displayed
// menu, a subagent flow) takes `<!-- builtin-audit: allow <reason> -->` (reason at least 20
// characters) on the line or the line above. A short or stale marker fails test 7. Never use it to
// hide a real choice.
//
// THE INVENTORY. docs/built-in-sweep.md lists every prompt with what it became. Test 8 holds it to
// the tree, `scan` rows and `manual` rows alike (see checkInventoryRows and checkManualRow), every
// current finding needs a row, and the counts it states are the table's.
//
// Test list:
//  1.  The real tree is found: 70 or more scanned files, every one in exactly one group, every
//      GROUPS path on disk.
//  2.  The builtin-sweep-baseline/ directory does not exist (no ratchet left).
//  3.  Every prompt finding fails, listed `file:line: kind: text` (all of them, not just the first).
//  4.  Progress (BLTN-01): every flow passes outright.
//  5.  Plan-mode draft review (BLTN-02): every draft flow passes outright.
//  6.  allowed-tools: no missing and no forbidden pair; ALLOWED_TOOLS_EXEMPT entries (none today)
//      need a reason and must exempt a real failure.
//  7.  Zero bad (short or stale) allow markers.
//  8.  The inventory is closed and matches the tree: its status line says so (8a), every row, manual
//      rows included, is resolved in its file (8b), every finding has a row (8c), and the counts it
//      states match its table (8d).
//  9.  Sensitivity: an appended `Proceed? (y/n)` or a bad AskUserQuestion call is caught, and the
//      manual-row check names an unresolved row.
// 10.  The flow tables are the objective's.
//
// Runtime model: read-only. Repo root is five levels up from bin/lib; a mirror install (no
// README.md there) skips the whole file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scanPrompts, scanSet, skillCoverage, progressCounts, planModeSpans, groupOf, GROUP_PATHS, MARKER_RE } =
  require('./builtin-audit.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
// Kept as a constant whose presence is the failure (test 2).
const BASELINE_DIR = path.join(__dirname, '__fixtures__', 'builtin-sweep-baseline');
const INVENTORY_PATH = path.join(REPO_ROOT, 'docs', 'built-in-sweep.md');
const SKILLS_DIR = path.join(REPO_ROOT, 'plugins', 'aoforge', 'skills');
const WORKFLOWS_DIR = path.join(REPO_ROOT, 'plugins', 'aoforge', 'aoforge', 'workflows');

// ─── the flow tables (tests 4, 5, 10) ───────────────────────────────────────────────
// BLTN-01 progress flows: the skill that owns the flow, the files whose TaskCreate/TaskUpdate calls
// count, and `min`, the floor for TaskCreate calls and completed TaskUpdate calls.
// BLTN-02 draft-review flows: the skill that owns the flow and the workflow that holds the plan-mode
// span.

const SK = (n) => `plugins/aoforge/skills/${n}/SKILL.md`;
const WF = (n) => `plugins/aoforge/aoforge/workflows/${n}.md`;
const PROGRESS_FLOWS = {
  micro: { skill: 'micro', files: [SK('micro'), WF('micro')], min: 1 },
  quick: { skill: 'quick', files: [SK('quick'), WF('quick')], min: 2 },
  build: { skill: 'build', files: [SK('build'), WF('build')], min: 4 },
  debug: { skill: 'debug', files: [SK('debug')], min: 2 },
  'plan-objective': { skill: 'plan-objective', files: [SK('plan-objective'), WF('plan-objective')], min: 4 },
  'verify-work': { skill: 'verify-work', files: [SK('verify-work'), WF('verify-work'), WF('diagnose-issues')], min: 2 },
};
const DRAFT_FLOWS = {
  'plan-objective': { skill: 'plan-objective', file: WF('plan-objective') },
  'new-project': { skill: 'new-project', file: WF('new-project') },
  'milestone-complete': { skill: 'milestone', file: WF('complete-milestone') },
};

// ─── exemptions (test 6) ────────────────────────────────────────────────────────────
// {skill, tool, reason}: a skill/built-in pair the allowed-tools check does not count. Empty on
// purpose: adopt's case (it runs map-codebase.md unattended) is solved with `disallowed-tools` in
// TRD 62-08. Each entry needs a reason of at least 20 characters and must exempt a real failure.

const ALLOWED_TOOLS_EXEMPT = [];

// ─── constants ──────────────────────────────────────────────────────────────────────

const ROW_KINDS = ['choice', 'free-text', 'explanatory', 'subagent', 'ask-misuse', 'schema'];
const ROW_DETECTS = ['scan', 'manual'];
const MIN_BEFORE = 12;
const MIN_EXEMPT_REASON = 20;
/** A bare list head (`Options:`) cannot be quoted in an inventory row; a row within this many lines covers it. */
const BARE_HEAD_WINDOW = 12;
const BARE_HEAD_RE = /^(?:[-*]\s+)?(?:\*\*)?(?:Options|Offer options|Offer|Choose|Pick one|Select one):?(?:\*\*)?:?$/;

// ─── measuring the tree ─────────────────────────────────────────────────────────────

let _real = null;

/** The scan set with each file's lines and scanPrompts result, measured once. */
function real() {
  if (_real) return _real;
  const files = scanSet(REPO_ROOT);
  const scans = new Map();
  for (const f of files) {
    scans.set(f.rel, { text: f.text, lines: f.text.split(/\r?\n/), ...scanPrompts(f.text) });
  }
  _real = { files, scans };
  return _real;
}

const skillNameOf = (rel) => {
  const m = rel.match(/^plugins\/aoforge\/skills\/([^/]+)\/SKILL\.md$/);
  return m ? m[1] : null;
};

const coverageOf = (name) => skillCoverage({ skillsDir: SKILLS_DIR, workflowsDir: WORKFLOWS_DIR, name });

const textOf = (rel) => {
  const s = real().scans.get(rel);
  return s ? s.text : fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
};

/** Every real finding as { file, line, kind, text }. */
function realFindings() {
  const out = [];
  for (const [file, s] of real().scans) for (const f of s.findings) out.push({ file, ...f });
  return out;
}

// ─── the checks (pure: data in, error lines out) ────────────────────────────────────

/** Test 2: the baseline directory is gone. An empty directory left on disk counts too. */
function baselineDirErrors(dir) {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).sort();
  return [
    `${path.relative(REPO_ROOT, dir)} exists (${names.length ? names.join(', ') : 'empty'}): the sweep is closed, so nothing may be pending; ` +
      'convert the prompt and delete the directory',
  ];
}

/** BLTN-01: flows that lack progress wiring, as flow -> why. */
function failingProgress() {
  const failing = new Map();
  for (const [flow, def] of Object.entries(PROGRESS_FLOWS)) {
    const c = progressCounts(def.files.map(textOf));
    const declared = coverageOf(def.skill).declared;
    const why = [];
    if (c.creates < def.min) why.push(`${c.creates} TaskCreate calls, need ${def.min}`);
    if (c.completes < def.min) why.push(`${c.completes} completed TaskUpdate calls, need ${def.min}`);
    if (c.inProgress < 1) why.push('no in_progress TaskUpdate');
    for (const t of ['TaskCreate', 'TaskUpdate']) {
      if (!declared.includes(t)) why.push(`skill ${def.skill} does not declare ${t}`);
    }
    if (why.length) failing.set(flow, `flow ${flow} lacks progress (${why.join('; ')})`);
  }
  return failing;
}

/** BLTN-02: flows without a plan-mode draft review, as flow -> why. */
function failingPlanMode() {
  const failing = new Map();
  for (const [flow, def] of Object.entries(DRAFT_FLOWS)) {
    const spans = planModeSpans(textOf(def.file));
    const declared = coverageOf(def.skill).declared;
    const why = [];
    if (spans.length === 0) why.push('no EnterPlanMode() span');
    else if (!spans.some((s) => s.mentionsDraft)) why.push('no span presents a draft');
    for (const s of spans) {
      if (s.exitLine === null) why.push(`span at line ${s.enterLine} has no ExitPlanMode()`);
      if (s.skipLine === null) why.push(`span at line ${s.enterLine} has no skip rule naming --auto above it`);
    }
    if (!declared.includes('EnterPlanMode')) why.push(`skill ${def.skill} does not declare EnterPlanMode`);
    if (declared.includes('ExitPlanMode')) why.push(`skill ${def.skill} declares ExitPlanMode`);
    if (why.length) failing.set(flow, `flow ${flow} has no plan-mode draft review (${why.join('; ')})`);
  }
  return failing;
}

/** allowed-tools: { missing, forbidden } as "skill:Tool" -> why, minus ALLOWED_TOOLS_EXEMPT. */
function failingAllowedTools() {
  const exempt = new Set(ALLOWED_TOOLS_EXEMPT.map((e) => `${e.skill}:${e.tool}`));
  const missing = new Map();
  const forbidden = new Map();
  const seen = new Set();
  for (const f of real().files) {
    const name = skillNameOf(f.rel);
    if (!name) continue;
    const cov = coverageOf(name);
    for (const t of cov.missing) {
      const key = `${name}:${t}`;
      seen.add(key);
      if (!exempt.has(key)) missing.set(key, `skill ${name} uses ${t} but does not declare it in allowed-tools`);
    }
    for (const t of cov.forbidden) {
      const key = `${name}:${t}`;
      seen.add(key);
      if (!exempt.has(key)) forbidden.set(key, `skill ${name} declares ${t} in allowed-tools, which is forbidden`);
    }
  }
  return { missing, forbidden, seen };
}

// ─── the inventory (test 8) ─────────────────────────────────────────────────────────

/** The `| BS-nnn |` rows of the Prompts table. A stray unescaped `|` is a cell-count error. */
function parseInventory(text) {
  const rows = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.startsWith('| BS-')) return;
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((c) => c.trim().replace(/\\\|/g, '|'));
    if (cells.length !== 7) {
      errors.push(`built-in-sweep.md:${i + 1}: expected 7 cells, found ${cells.length} (escape a | inside a cell as \\|)`);
      return;
    }
    const [id, group, file, detect, kind, before, conversion] = cells;
    rows.push({ line: i + 1, id, group, file, detect, kind, before: before.replace(/^`|`$/g, ''), conversion });
  });
  return { rows, errors };
}

/** Lines (1-based) of `file` holding `before` that no allow marker covers (on the line or directly above). */
function unmarkedLines(scan, before) {
  const out = [];
  scan.lines.forEach((l, i) => {
    if (!l.includes(before)) return;
    const covered = MARKER_RE.test(l) || (i > 0 && MARKER_RE.test(scan.lines[i - 1]));
    if (!covered) out.push(i + 1);
  });
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The headers a Conversion cell names as `header "X"` (prose may write `header: "X"` or `header "X"`). */
const namedHeaders = (conversion) => [...conversion.matchAll(/\bheader "([^"]+)"/g)].map((m) => m[1]);

const hasHeader = (text, header) => new RegExp(`\\bheader\\s*[:=]?\\s*"${escapeRe(header)}"`).test(text);

/**
 * A `manual` row has no scanner finding to consult, so its resolution is read from its Conversion
 * cell. The row is resolved when its Before text is gone (or only on marked lines), or when it stays
 * on purpose and the file shows the conversion:
 *   keep:           the Conversion says the line stays, with a reason;
 *   header "X"      every header the Conversion names is the header of an AskUserQuestion in the file;
 *   bare list head  a reword of a bare `Options:` head next to the Before line, with none left near it.
 * Anything else is a prompt nobody converted. Returns an error line, or null.
 */
function checkManualRow(r, scan) {
  const where = `${r.id} (${r.file})`;
  const left = unmarkedLines(scan, r.before);
  if (left.length === 0) return null;
  if (/^keep:/.test(r.conversion)) return null;
  const headers = namedHeaders(r.conversion);
  if (headers.length > 0) {
    const absent = headers.filter((h) => !hasHeader(scan.text, h));
    if (absent.length === 0) return null;
    return `${where}: manual row names header "${absent.join('", "')}" but no AskUserQuestion in the file has it ("${r.before}" is still at line ${left.join(', ')})`;
  }
  if (/\bbare\b.*\blist head\b/i.test(r.conversion)) {
    const near = left.some((line) =>
      scan.lines.some((l, i) => BARE_HEAD_RE.test(l.trim()) && Math.abs(i + 1 - line) <= BARE_HEAD_WINDOW),
    );
    if (!near) return null;
    return `${where}: a bare list head is still within ${BARE_HEAD_WINDOW} lines of "${r.before}" (line ${left.join(', ')}); reword it as the Conversion says`;
  }
  return `${where}: manual row is unresolved: "${r.before}" is still at line ${left.join(', ')} and its Conversion ("${r.conversion.slice(0, 60)}") is not a keep, a header present in the file, or a bare list head reworded`;
}

/** Test 8b: every row against the real tree. There is no pending state. */
function checkInventoryRows(rows, scans) {
  const errors = [];
  const ids = new Set();
  for (const r of rows) {
    const where = `${r.id} (${r.file})`;
    if (!/^BS-\d{3}$/.test(r.id)) errors.push(`${r.id}: ID is not BS-nnn`);
    if (ids.has(r.id)) errors.push(`${r.id}: duplicate ID`);
    ids.add(r.id);
    const scan = scans.get(r.file);
    if (!scan) {
      errors.push(`${where}: file is not in the scan set`);
      continue;
    }
    if (groupOf(r.file) !== r.group) errors.push(`${where}: Group is ${r.group}, expected ${groupOf(r.file)}`);
    if (!ROW_KINDS.includes(r.kind)) errors.push(`${where}: Kind "${r.kind}" is not one of ${ROW_KINDS.join(', ')}`);
    if (!ROW_DETECTS.includes(r.detect)) errors.push(`${where}: Detect "${r.detect}" is not scan or manual`);
    if (r.before.length < MIN_BEFORE) errors.push(`${where}: Before is shorter than ${MIN_BEFORE} characters`);
    if (r.detect === 'manual') {
      const e = checkManualRow(r, scan);
      if (e) errors.push(e);
      continue;
    }
    if (r.detect !== 'scan') continue;

    // A scan row is resolved when its text is gone or only on marked lines. An ask-misuse row is
    // fixed when no ask-without-options finding holds its text (the converted calls may
    // legitimately keep the same opener).
    const left =
      r.kind === 'ask-misuse'
        ? scan.findings.filter((f) => f.kind === 'ask-without-options' && f.text.includes(r.before)).map((f) => f.line)
        : unmarkedLines(scan, r.before);
    if (left.length) {
      errors.push(
        `${where}: scan row is not resolved: "${r.before}" still at line ${left.join(', ')}` +
          (r.kind === 'ask-misuse' ? ' as an AskUserQuestion call with no options' : ' with no allow marker') +
          ' (convert it, or mark a line that is not a choice)',
      );
    }
  }
  return errors;
}

/** Test 8c: every finding is satisfied by a row in its file (a bare list head by a nearby row). */
function checkFindingsHaveRows(findings, rows, scans) {
  const errors = [];
  for (const f of findings) {
    const own = rows.filter((r) => r.file === f.file);
    if (own.some((r) => f.text.includes(r.before))) continue;
    const scan = scans.get(f.file);
    if (BARE_HEAD_RE.test(f.text)) {
      const near = own.some((r) =>
        scan.lines.some((l, i) => l.includes(r.before) && Math.abs(i + 1 - f.line) <= BARE_HEAD_WINDOW),
      );
      if (near) continue;
    }
    errors.push(`${f.file}:${f.line}: ${f.kind}: ${f.text}: no row in docs/built-in-sweep.md covers this finding`);
  }
  return errors;
}

// ─── formatting ─────────────────────────────────────────────────────────────────────

const fail = (title, errors) => `${title} (${errors.length}):\n  ${errors.join('\n  ')}`;

// ─── tests ──────────────────────────────────────────────────────────────────────────

const SKIP = IS_AOFORGE_CHECKOUT ? false : 'not an aoforge-claude checkout';

describe('builtin-sweep.repo.test.cjs', { skip: SKIP }, () => {
  describe('1. the real tree', () => {
    test('scanSet finds 70 or more files, every file has a group, no path is in two groups, every GROUPS path exists', () => {
      const { files } = real();
      assert.ok(files.length >= 70, `scanSet returned ${files.length} files; expected at least 70 (is this the repository root?)`);
      const ungrouped = files.filter((f) => !groupOf(f.rel)).map((f) => f.rel);
      assert.deepEqual(ungrouped, [], fail('scanned files with no group in GROUPS', ungrouped));
      const all = Object.values(GROUP_PATHS).flat();
      const dup = all.filter((p, i) => all.indexOf(p) !== i);
      assert.deepEqual(dup, [], fail('paths in two groups', dup));
      const absent = all.filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)));
      assert.deepEqual(absent, [], fail('GROUPS paths that do not exist on disk', absent));
    });
  });

  describe('2. no ratchet left', () => {
    test('the builtin-sweep-baseline/ directory does not exist', () => {
      assert.deepEqual(baselineDirErrors(BASELINE_DIR), []);
    });

    test('sensitivity: a directory standing where the baseline was is reported, empty or not', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-sweep-baseline-'));
      try {
        assert.equal(baselineDirErrors(tmp).length, 1, 'an empty directory is reported');
        fs.writeFileSync(path.join(tmp, 'micro-quick-debug.json'), '{}');
        const [msg] = baselineDirErrors(tmp);
        assert.ok(msg.includes('micro-quick-debug.json'), msg);
        assert.deepEqual(baselineDirErrors(path.join(tmp, 'absent')), []);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('3. prompt findings (BLTN-03)', () => {
    test('no scanned file has a prose choice, an AskUserQuestion with no options, a long header or too many options', () => {
      const lines = realFindings().map((f) => `${f.file}:${f.line}: ${f.kind}: ${f.text}`);
      assert.deepEqual(
        lines,
        [],
        fail('prompt findings (convert them, or mark a non-choice line with <!-- builtin-audit: allow <reason> -->)', lines),
      );
    });
  });

  describe('4. progress (BLTN-01)', () => {
    test('every progress flow has its TaskCreate and TaskUpdate calls, an in_progress update and the declarations', () => {
      const errors = [...failingProgress().values()];
      assert.deepEqual(errors, [], fail('flows without progress', errors));
    });
  });

  describe('5. plan-mode draft review (BLTN-02)', () => {
    test('every draft flow has an EnterPlanMode/ExitPlanMode span presenting a draft under a skip rule', () => {
      const errors = [...failingPlanMode().values()];
      assert.deepEqual(errors, [], fail('flows without a plan-mode draft review', errors));
    });
  });

  describe('6. allowed-tools', () => {
    test('no skill uses a built-in it does not declare, and none declares ExitPlanMode', () => {
      const { missing, forbidden } = failingAllowedTools();
      const errors = [...missing.values(), ...forbidden.values()];
      assert.deepEqual(errors, [], fail('allowed-tools', errors));
    });

    test('every ALLOWED_TOOLS_EXEMPT entry has a 20+ character reason and exempts a real failure', () => {
      const { seen } = failingAllowedTools();
      const errors = [];
      for (const e of ALLOWED_TOOLS_EXEMPT) {
        const key = `${e.skill}:${e.tool}`;
        if (typeof e.reason !== 'string' || e.reason.length < MIN_EXEMPT_REASON) errors.push(`${key}: reason is under ${MIN_EXEMPT_REASON} characters`);
        if (!seen.has(key)) errors.push(`${key}: exempts nothing (no missing or forbidden pair)`);
      }
      assert.deepEqual(errors, [], fail('ALLOWED_TOOLS_EXEMPT entries', errors));
    });
  });

  describe('7. markers', () => {
    test('no scanned file has a short or stale builtin-audit allow marker', () => {
      const errors = [];
      for (const [file, s] of real().scans) {
        for (const b of s.badMarkers) {
          errors.push(
            `${file}:${b.line}: ${b.why === 'short' ? 'reason under 20 characters' : 'stale marker (it suppresses nothing)'}: ${s.lines[b.line - 1].trim()}`,
          );
        }
      }
      assert.deepEqual(errors, [], fail('bad builtin-audit allow markers', errors));
    });
  });

  describe('8. the inventory (docs/built-in-sweep.md)', () => {
    const inventory = () => parseInventory(fs.readFileSync(INVENTORY_PATH, 'utf-8'));

    test('8a. the status line says the sweep is closed', () => {
      const text = fs.readFileSync(INVENTORY_PATH, 'utf-8');
      assert.match(text, /^Status: closed \(TRD 62-10\)\./m, 'the inventory must say `Status: closed (TRD 62-10).`');
    });

    test('8b. every row, scan and manual, parses, names a real file in its group, and is resolved in that file', () => {
      const { rows, errors } = inventory();
      assert.ok(rows.length >= 120, `parsed ${rows.length} rows from the ## Prompts table; expected at least 120`);
      assert.ok(rows.some((r) => r.detect === 'manual'), 'no manual rows parsed; the manual check would test nothing');
      const all = [...errors, ...checkInventoryRows(rows, real().scans)];
      assert.deepEqual(all, [], fail('inventory rows out of step with the tree', all));
    });

    test('8c. every scanner finding has an inventory row', () => {
      const { rows } = inventory();
      const errors = checkFindingsHaveRows(realFindings(), rows, real().scans);
      assert.deepEqual(errors, [], fail('findings with no inventory row (add a row, or narrow the pattern)', errors));
    });

    test('8d. the row, kind and group counts the document states match its table', () => {
      const text = fs.readFileSync(INVENTORY_PATH, 'utf-8');
      const { rows } = inventory();
      const tally = (key) => rows.reduce((m, r) => ({ ...m, [r[key]]: (m[r[key]] || 0) + 1 }), {});
      const total = text.match(/^(\d+) rows \((\d+) `scan`, (\d+) `manual`\)/m);
      assert.ok(total, 'the ## Prompts section must open with "N rows (A `scan`, B `manual`)"');
      const detect = tally('detect');
      assert.deepEqual([+total[1], +total[2], +total[3]], [rows.length, detect.scan, detect.manual], 'the stated row counts');
      const kinds = text.match(/^Rows per kind: (.+)\.$/m);
      assert.ok(kinds, 'missing the "Rows per kind:" line');
      const statedKinds = Object.fromEntries(kinds[1].split(', ').map((p) => [p.split(' ')[0], +p.split(' ')[1]]));
      assert.deepEqual(statedKinds, tally('kind'), 'the stated rows per kind');
      const groups = text.match(/^Rows per group: (.+)\.$/m);
      assert.ok(groups, 'missing the "Rows per group:" line');
      const statedGroups = Object.fromEntries([...groups[1].matchAll(/([\w-]+) (\d+) \(TRD/g)].map((m) => [m[1], +m[2]]));
      assert.deepEqual(statedGroups, tally('group'), 'the stated rows per group');
    });
  });

  describe('9. sensitivity', () => {
    const MICRO = WF('micro');
    const PAD = '\n'.repeat(14); // keep any AskUserQuestion mention in micro.md outside the 12-line window
    const count = (text, kind) => scanPrompts(text).findings.filter((f) => f.kind === kind).length;

    test('appending `Proceed? (y/n)` to workflows/micro.md adds one prose-choice finding', () => {
      const text = textOf(MICRO);
      assert.equal(count(`${text}${PAD}Proceed? (y/n)\n`, 'prose-choice'), count(text, 'prose-choice') + 1);
    });

    test('appending a call with a long header and no options adds one ask-without-options and one header-too-long', () => {
      const text = textOf(MICRO);
      const bad = `${text}${PAD}AskUserQuestion(header: "A header that is too long", question: "Which?")\n`;
      assert.equal(count(bad, 'ask-without-options'), count(text, 'ask-without-options') + 1);
      assert.equal(count(bad, 'header-too-long'), count(text, 'header-too-long') + 1);
    });

    test('a manual row whose text stays is resolved only by a keep, a header in the file, or a reworded bare list head', () => {
      const lines = ['## Step', 'Does this look right?', 'AskUserQuestion(header: "Looks right", question: "Ship it?")'];
      const scan = { text: lines.join('\n'), lines };
      const row = (conversion) => ({ id: 'BS-999', file: 'x.md', before: 'Does this look right?', conversion });
      assert.match(checkManualRow(row('reword: tidy it'), scan), /manual row is unresolved/);
      assert.match(checkManualRow(row('AskUserQuestion header "Ship it?": Yes / No'), scan), /names header "Ship it\?"/);
      assert.equal(checkManualRow(row('AskUserQuestion header "Looks right": Yes / No'), scan), null);
      assert.equal(checkManualRow(row('keep: free text, not a menu'), scan), null);
      const gone = { ...scan, lines: ['## Step'], text: '## Step' };
      assert.equal(checkManualRow(row('reword: tidy it'), gone), null);
      const head = { text: 'Does this look right?\nOptions:', lines: ['Does this look right?', 'Options:'] };
      assert.match(checkManualRow(row('reword the bare Options list head below'), head), /bare list head is still/);
    });
  });

  describe('10. the flow tables', () => {
    test('PROGRESS_FLOWS and DRAFT_FLOWS keys are the objective\'s, and every file they name exists', () => {
      assert.deepEqual(Object.keys(PROGRESS_FLOWS).sort(), ['build', 'debug', 'micro', 'plan-objective', 'quick', 'verify-work']);
      assert.deepEqual(Object.keys(DRAFT_FLOWS).sort(), ['milestone-complete', 'new-project', 'plan-objective']);
      const named = [
        ...Object.values(PROGRESS_FLOWS).flatMap((d) => [SK(d.skill), ...d.files]),
        ...Object.values(DRAFT_FLOWS).flatMap((d) => [SK(d.skill), d.file]),
      ];
      const absent = [...new Set(named)].filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)));
      assert.deepEqual(absent, [], fail('flow table files that do not exist', absent));
    });
  });
});
