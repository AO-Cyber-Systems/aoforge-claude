'use strict';

// The built-in sweep ratchet (TRD 62-03, objective 62-built-in-sweep, BLTN-01, BLTN-02, BLTN-03).
//
// WHAT IT CHECKS. DevFlow's own prose (skills and active workflows) should use Claude Code's
// built-ins instead of ad hoc text, and this test measures the real tree with builtin-audit.cjs:
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
// THE RATCHET. Nothing new may land. The prose is not clean yet, so each of the eight conversion
// groups has a baseline, __fixtures__/builtin-sweep-baseline/<group>.json, listing what is still
// pending: prompt findings (file, kind, exact trimmed text; a multiset, no line numbers), flows
// without progress, flows without a plan-mode draft review, and allowed-tools pairs. The test
// fails on a failing item that is not listed, and on a listed item that now passes (stale). A
// wave-3 conversion TRD (62-04..62-09, 62-11) deletes its entries from its own file first (RED),
// converts the prose (GREEN), and deletes the file once it is empty. A missing group file counts
// as empty. 62-10 deletes the directory and makes its absence a test. Precedent: the
// planning-writes ratchet of objective 48 (planning-writes.repo.test.cjs; 48-04 started the
// per-group baselines, 48-16..48-21 drove them to zero, 48-23 deleted the directory).
//
// THE MARKER. A line that is not a choice (a free-text question, a quoted example, a displayed
// menu, a subagent flow) takes `<!-- builtin-audit: allow <reason> -->` (reason at least 20
// characters) on the line or the line above. A short or stale marker fails test 8. Never use it to
// hide a real choice.
//
// THE INVENTORY. docs/built-in-sweep.md lists every prompt with its planned conversion. Test 9
// holds it to the tree: a `scan` row is pending (a baseline entry holds its text) or resolved
// (gone from its file, or only on marked lines), and every current finding has a row.
//
// Test list:
//  1.  The real tree is found: 70 or more scanned files, every one in exactly one group, every
//      GROUPS path on disk.
//  2.  Every prompt finding is listed in its group's baseline (file + kind + text, a multiset).
//  3.  No stale prompt entries in a baseline.
//  4.  Baseline shape: names, keys, group field, entries owned by their group.
//  5.  Progress (BLTN-01), per flow, against the owner's `progress` list.
//  6.  Plan-mode draft review (BLTN-02), per flow, against the owner's `plan_mode` list.
//  7.  allowed-tools missing and forbidden pairs, against the owner's lists; ALLOWED_TOOLS_EXEMPT.
//  8.  Zero bad (short or stale) allow markers.
//  9.  Inventory rows match the tree (9a), and every finding has a row (9b).
// 10.  Sensitivity: an appended `Proceed? (y/n)` or a bad AskUserQuestion call is caught.
// 11.  The flow tables are the objective's.
//
// Runtime model: read-only. Repo root is five levels up from bin/lib; a mirror install (no
// README.md there) skips the whole file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { scanPrompts, scanSet, skillCoverage, progressCounts, planModeSpans, groupOf, GROUPS, GROUP_PATHS, MARKER_RE } =
  require('./builtin-audit.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
const BASELINE_DIR = path.join(__dirname, '__fixtures__', 'builtin-sweep-baseline');
const INVENTORY_PATH = path.join(REPO_ROOT, 'docs', 'built-in-sweep.md');
const SKILLS_DIR = path.join(REPO_ROOT, 'plugins', 'devflow', 'skills');
const WORKFLOWS_DIR = path.join(REPO_ROOT, 'plugins', 'devflow', 'devflow', 'workflows');

// ─── the flow tables (tests 5, 6, 11) ───────────────────────────────────────────────
// BLTN-01 progress flows: the skill that owns the flow, the files whose TaskCreate/TaskUpdate calls
// count, and `min`, the floor for TaskCreate calls and completed TaskUpdate calls.
// BLTN-02 draft-review flows: the skill that owns the flow and the workflow that holds the plan-mode
// span. A flow's owner group is groupOf(its skill).

const SK = (n) => `plugins/devflow/skills/${n}/SKILL.md`;
const WF = (n) => `plugins/devflow/devflow/workflows/${n}.md`;
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

// ─── exemptions (test 7) ────────────────────────────────────────────────────────────
// {skill, tool, reason}: a skill/built-in pair the allowed-tools check does not count. Empty on
// purpose: adopt's case (it runs map-codebase.md unattended) is solved with `disallowed-tools` in
// TRD 62-08. Each entry needs a reason of at least 20 characters and must exempt a real failure.

const ALLOWED_TOOLS_EXEMPT = [];

// ─── constants ──────────────────────────────────────────────────────────────────────

const FINDING_KINDS = ['prose-choice', 'ask-without-options', 'header-too-long', 'too-many-options'];
const ROW_KINDS = ['choice', 'free-text', 'explanatory', 'subagent', 'ask-misuse', 'schema'];
const ROW_DETECTS = ['scan', 'manual'];
const BASELINE_KEYS = ['group', 'prompts', 'progress', 'plan_mode', 'allowed_tools_missing', 'allowed_tools_forbidden'];
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
  const m = rel.match(/^plugins\/devflow\/skills\/([^/]+)\/SKILL\.md$/);
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

// ─── baselines ──────────────────────────────────────────────────────────────────────

/** The files in the baseline directory as { name, data, error }. An absent directory is empty. */
function readBaselineDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .map((name) => {
      try {
        return { name, data: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')), error: null };
      } catch (e) {
        return { name, data: null, error: e.message };
      }
    });
}

const emptyBaseline = (group) => ({
  group,
  prompts: [],
  progress: [],
  plan_mode: [],
  allowed_tools_missing: [],
  allowed_tools_forbidden: [],
});

/** One baseline per GROUPS key; a missing file counts as empty. */
function baselinesByGroup(entries) {
  const by = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, emptyBaseline(g)]));
  for (const { name, data } of entries) {
    const g = name.replace(/\.json$/, '');
    if (!by[g] || !data || typeof data !== 'object') continue;
    for (const k of BASELINE_KEYS.slice(1)) by[g][k] = Array.isArray(data[k]) ? data[k] : [];
  }
  return by;
}

const baselines = () => baselinesByGroup(readBaselineDir(BASELINE_DIR));

// ─── the checks (pure: data in, error lines out) ────────────────────────────────────

const promptKey = (group, file, kind, text) => JSON.stringify([group, file, kind, text]);

/** Test 2 and 3: findings against the baselines as a multiset. */
function checkPrompts(findings, by) {
  const remaining = new Map();
  for (const [group, b] of Object.entries(by)) {
    for (const e of b.prompts) {
      const k = promptKey(group, e.file, e.kind, e.text);
      remaining.set(k, (remaining.get(k) || 0) + 1);
    }
  }
  const unlisted = [];
  for (const f of findings) {
    const group = groupOf(f.file);
    const k = promptKey(group, f.file, f.kind, f.text);
    if (group && remaining.get(k) > 0) remaining.set(k, remaining.get(k) - 1);
    else unlisted.push(`${f.file}:${f.line}: ${f.kind}: ${f.text} (group ${group || 'none'})`);
  }
  const stale = [];
  for (const [group, b] of Object.entries(by)) {
    for (const e of b.prompts) {
      const k = promptKey(group, e.file, e.kind, e.text);
      if (remaining.get(k) > 0) {
        remaining.set(k, remaining.get(k) - 1);
        stale.push(`${e.file}: ${e.kind}: ${e.text} (group ${group}): converted? remove it from ${group}.json`);
      }
    }
  }
  return { unlisted, stale };
}

/**
 * Tests 5, 6 and 7: a failing item must be listed under its owner group's `field`, and a listed
 * item that passes is stale. `failing` maps an item key to why it fails.
 */
function checkListed(failing, ownerOf, by, field) {
  const errors = [];
  for (const [key, why] of failing) {
    const owner = ownerOf(key);
    if (!owner || !by[owner][field].includes(key)) {
      errors.push(`${key}: ${why}: add "${key}" to ${owner || '<no group>'}.json ${field} (pending) or fix it`);
    }
  }
  for (const [group, b] of Object.entries(by)) {
    for (const key of b[field]) {
      if (!failing.has(key)) errors.push(`${key}: listed in ${group}.json ${field} but it passes now (stale): remove it`);
    }
  }
  return errors;
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

const ownerOfSkillPair = (key) => groupOf(SK(key.split(':')[0]));

// ─── the inventory (test 9) ─────────────────────────────────────────────────────────

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

/** Test 9a: rows against the real tree. */
function checkInventoryRows(rows, scans, by) {
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
    if (r.detect !== 'scan') continue;

    const group = by[r.group];
    const pending = group && group.prompts.some((e) => e.file === r.file && e.text.includes(r.before));
    if (pending) continue;
    // Resolved: an ask-misuse row is fixed when no ask-without-options finding holds its text (the
    // converted calls may legitimately keep the same opener); every other row is fixed when its
    // text is gone or only on marked lines.
    const left =
      r.kind === 'ask-misuse'
        ? scan.findings.filter((f) => f.kind === 'ask-without-options' && f.text.includes(r.before)).map((f) => f.line)
        : unmarkedLines(scan, r.before);
    if (left.length) {
      errors.push(
        `${where}: scan row is neither pending in ${r.group}.json nor resolved: "${r.before}" still at line ${left.join(', ')}` +
          (r.kind === 'ask-misuse' ? ' as an AskUserQuestion call with no options' : ' with no allow marker') +
          ` (convert it, or put it back in ${r.group}.json prompts)`,
      );
    }
  }
  return errors;
}

/** Test 9b: every finding is satisfied by a row in its file (a bare list head by a nearby row). */
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

// ─── baseline shape (test 4) ────────────────────────────────────────────────────────

const isString = (v) => typeof v === 'string' && v.length > 0;

function checkShape(entries) {
  const errors = [];
  for (const { name, data, error } of entries) {
    const m = name.match(/^(.+)\.json$/);
    if (!m || !GROUPS[m[1]]) {
      errors.push(`${name}: not <group>.json for a GROUPS key (${Object.keys(GROUPS).join(', ')})`);
      continue;
    }
    const group = m[1];
    if (error) {
      errors.push(`${name}: does not parse: ${error}`);
      continue;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errors.push(`${name}: not a JSON object`);
      continue;
    }
    const keys = Object.keys(data).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...BASELINE_KEYS].sort())) {
      errors.push(`${name}: keys are [${keys.join(', ')}], expected [${BASELINE_KEYS.join(', ')}]`);
      continue;
    }
    if (data.group !== group) errors.push(`${name}: "group" is ${JSON.stringify(data.group)}, expected "${group}"`);
    for (const k of BASELINE_KEYS.slice(1)) {
      if (!Array.isArray(data[k])) errors.push(`${name}: "${k}" is not an array`);
    }
    if (BASELINE_KEYS.slice(1).some((k) => !Array.isArray(data[k]))) continue;

    for (const e of data.prompts) {
      const ok =
        e &&
        typeof e === 'object' &&
        JSON.stringify(Object.keys(e).sort()) === JSON.stringify(['file', 'kind', 'text']) &&
        isString(e.file) &&
        FINDING_KINDS.includes(e.kind) &&
        isString(e.text);
      if (!ok) {
        errors.push(`${name}: prompt entry ${JSON.stringify(e)} is not { file, kind, text } with a known kind`);
        continue;
      }
      if (groupOf(e.file) !== group) errors.push(`${name}: prompt entry for ${e.file} belongs to group ${groupOf(e.file)}`);
    }
    const flowList = (field, table) => {
      for (const k of data[field]) {
        if (!table[k]) errors.push(`${name}: ${field} entry ${JSON.stringify(k)} is not one of ${Object.keys(table).join(', ')}`);
        else if (groupOf(SK(table[k].skill)) !== group) errors.push(`${name}: ${field} entry ${k} belongs to group ${groupOf(SK(table[k].skill))}`);
      }
    };
    flowList('progress', PROGRESS_FLOWS);
    flowList('plan_mode', DRAFT_FLOWS);
    for (const field of ['allowed_tools_missing', 'allowed_tools_forbidden']) {
      for (const k of data[field]) {
        if (!isString(k) || !/^[\w-]+:[A-Za-z]+$/.test(k)) errors.push(`${name}: ${field} entry ${JSON.stringify(k)} is not "<skill>:<Tool>"`);
        else if (ownerOfSkillPair(k) !== group) errors.push(`${name}: ${field} entry ${k} belongs to group ${ownerOfSkillPair(k)}`);
      }
    }
  }
  return errors;
}

// ─── formatting ─────────────────────────────────────────────────────────────────────

const fail = (title, errors) => `${title} (${errors.length}):\n  ${errors.join('\n  ')}`;

// ─── tests ──────────────────────────────────────────────────────────────────────────

const SKIP = IS_DEVFLOW_CHECKOUT ? false : 'not a devflow-claude checkout';

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

  describe('2. prompt findings are baselined', () => {
    test('every finding in every scanned file is listed in its group baseline', () => {
      const { unlisted } = checkPrompts(realFindings(), baselines());
      assert.deepEqual(
        unlisted,
        [],
        fail('prompt findings not in the baseline (convert them, or mark a non-choice line with <!-- builtin-audit: allow <reason> -->)', unlisted),
      );
    });

    test('sensitivity: removing one baseline entry makes it fail, naming that finding', () => {
      const by = baselines();
      const group = Object.keys(by).find((g) => by[g].prompts.length > 0);
      if (!group) return; // nothing pending: a finding with no entry cannot be removed
      const removed = by[group].prompts[0];
      by[group] = { ...by[group], prompts: by[group].prompts.slice(1) };
      const { unlisted } = checkPrompts(realFindings(), by);
      assert.ok(
        unlisted.some((l) => l.includes(`${removed.file}:`) && l.includes(`${removed.kind}: ${removed.text}`)),
        `expected a failure naming ${removed.file} ${removed.kind}, got:\n${unlisted.join('\n')}`,
      );
    });
  });

  describe('3. no stale prompt entries', () => {
    test('every baseline prompt entry is consumed by a current finding', () => {
      const { stale } = checkPrompts(realFindings(), baselines());
      assert.deepEqual(stale, [], fail('stale baseline prompt entries', stale));
    });

    test('sensitivity: an entry no finding matches is reported, saying converted? remove it', () => {
      const by = baselines();
      const group = Object.keys(GROUPS)[0];
      const file = GROUP_PATHS[group][0];
      by[group] = {
        ...by[group],
        prompts: [...by[group].prompts, { file, kind: 'prose-choice', text: 'Proceed? (y/n) this text is in no file' }],
      };
      const { stale } = checkPrompts(realFindings(), by);
      assert.equal(stale.length, 1, stale.join('\n'));
      assert.ok(stale[0].includes(`converted? remove it from ${group}.json`), stale[0]);
    });
  });

  describe('4. baseline shape', () => {
    test('every baseline file is <group>.json with the six keys, its own group, and entries it owns', () => {
      const errors = checkShape(readBaselineDir(BASELINE_DIR));
      assert.deepEqual(errors, [], fail('baseline shape errors', errors));
    });
  });

  describe('5. progress (BLTN-01)', () => {
    test('every progress flow passes, or is listed in its owner group, and no listed flow passes', () => {
      const errors = checkListed(
        failingProgress(),
        (flow) => groupOf(SK(PROGRESS_FLOWS[flow].skill)),
        baselines(),
        'progress',
      );
      assert.deepEqual(errors, [], fail('progress ratchet', errors));
    });
  });

  describe('6. plan-mode draft review (BLTN-02)', () => {
    test('every draft flow passes, or is listed in its owner group, and no listed flow passes', () => {
      const errors = checkListed(
        failingPlanMode(),
        (flow) => groupOf(SK(DRAFT_FLOWS[flow].skill)),
        baselines(),
        'plan_mode',
      );
      assert.deepEqual(errors, [], fail('plan-mode ratchet', errors));
    });
  });

  describe('7. allowed-tools', () => {
    test('every missing and forbidden pair is baselined in its owner group, and no listed pair passes', () => {
      const { missing, forbidden } = failingAllowedTools();
      const by = baselines();
      const errors = [
        ...checkListed(missing, ownerOfSkillPair, by, 'allowed_tools_missing'),
        ...checkListed(forbidden, ownerOfSkillPair, by, 'allowed_tools_forbidden'),
      ];
      assert.deepEqual(errors, [], fail('allowed-tools ratchet', errors));
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

  describe('8. markers', () => {
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

  describe('9. the inventory (docs/built-in-sweep.md)', () => {
    const inventory = () => parseInventory(fs.readFileSync(INVENTORY_PATH, 'utf-8'));

    test('9a. every row parses, names a real file in its group, and a scan row is pending or resolved', () => {
      const { rows, errors } = inventory();
      assert.ok(rows.length >= 50, `parsed ${rows.length} rows from the ## Prompts table; expected at least 50`);
      const all = [...errors, ...checkInventoryRows(rows, real().scans, baselines())];
      assert.deepEqual(all, [], fail('inventory rows out of step with the tree', all));
    });

    test('9b. every scanner finding has an inventory row', () => {
      const { rows } = inventory();
      const errors = checkFindingsHaveRows(realFindings(), rows, real().scans);
      assert.deepEqual(errors, [], fail('findings with no inventory row (add a row, or narrow the pattern)', errors));
    });
  });

  describe('10. sensitivity', () => {
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
  });

  describe('11. the flow tables', () => {
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
