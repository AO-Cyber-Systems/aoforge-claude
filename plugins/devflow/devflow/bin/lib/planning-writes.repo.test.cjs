'use strict';

// SC1: zero direct planning-file write instructions in DevFlow's own prose (TRD 48-04 started
// the ratchet, TRD 48-23 closed it; objective 48-planning-write-path-migration, GWP-02, D-21).
//
// WHAT COUNTS. planning-audit.cjs scans every skill (skills/<name>/SKILL.md), every non-legacy
// workflow, every agent and every template (references are out of scope: they explain, they do
// not instruct). A finding is a line that tells an agent to write a planning file (TRD, SUMMARY,
// VERIFICATION, UAT, RESEARCH, CONTEXT, OBJECTIVE.md, PROJECT.md, REQUIREMENTS, ROADMAP,
// STATE.md, MILESTONES, codebase/, todos/, debug/, quick/, research/, milestones/, decisions/)
// with no store-aware df-tools verb call within 3 lines. See planning-audit.cjs for the regexes.
//
// THE RULE. Zero findings, every one listed `file:line: <text>` on failure. There is no
// baseline: the per-group __fixtures__/planning-writes-baseline/*.json ratchet (48-04) was driven
// to zero by 48-16..48-21 and deleted by 48-23, and the directory must not come back. A new
// planning write goes through a df-tools verb (plan put-trd, summary post, doc put, ...).
//
// A line that is read-only, explanatory, or about a runtime/tracked-config path (STACK.md,
// config.json, .trd-progress/) takes an inline `<!-- planning-audit: allow <reason> -->` marker
// (reason >= 20 chars) on the line or the line above. Stale or short markers fail this test.
// EXEMPT below is for lines the regexes misjudge outright; never for real write instructions.
//
// Test list:
// 9.  Every finding fails with `file:line: <text>` (all listed, not just the first).
// 10. The planning-writes-baseline/ directory does not exist (no ratchet left).
// 13. Sensitivity: agents/planner.md has zero findings, and an injected write line yields one.
// 14. Every EXEMPT entry matches a real line and has a 20+ char reason; zero bad inline markers.
//
// Runtime model: read-only. Repo root is five levels up; a mirror install (no README.md there)
// skips the whole file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { scanWrites, scanSet, GROUP_PATHS } = require('./planning-audit.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
/** The deleted ratchet's home (48-04..48-23). Its presence is a failure. */
const BASELINE_DIR = path.join(__dirname, '__fixtures__', 'planning-writes-baseline');

// ─── EXEMPT (test 14) ───────────────────────────────────────────────────────────────
// {file, line_contains, reason}: a finding in `file` whose text includes `line_contains` is
// not counted. Reason >= 20 chars; each entry must match a real line of a real file.

const EXEMPT = [
  // ── the regex misreads the verb: nothing here writes a planning file ──
  {
    file: 'plugins/devflow/agents/executor.md',
    line_contains: 'before reading the TRD, before any edit, before any commit',
    reason: 'preflight ordering sentence: "edit" means any code edit, and the TRD is only read here',
  },
  {
    file: 'plugins/devflow/agents/executor.md',
    line_contains: 'create a progress task for each task in the TRD',
    reason: 'TaskCreate progress tracking creates a harness task entry; the TRD is only read',
  },
  {
    file: 'plugins/devflow/agents/executor.md',
    line_contains: 'Record this as a deviation if the TRD asked for a direct edit',
    reason: 'generated-file guard about editing source code; the TRD is only the thing that asked',
  },
  {
    file: 'plugins/devflow/agents/planner.md',
    line_contains: ': Create User',
    reason: 'example TRD titles in the slicing guidance; "Create" names the code each TRD builds',
  },
  {
    file: 'plugins/devflow/agents/planner.md',
    line_contains: 'When a TRD creates 2+ new files',
    reason: 'describes the <file_tree> section: the TRD\'s own tasks create source files',
  },
  {
    file: 'plugins/devflow/devflow/templates/trd-prompt.md',
    line_contains: 'Include when TRD creates 2+ new files',
    reason: 'template comment for <file_tree>: the TRD\'s own tasks create source files',
  },
  {
    file: 'plugins/devflow/agents/planner.md',
    line_contains: 'post-write check eliminate that failure mode',
    reason: 'background paragraph on why the boundary rule exists; it instructs nothing',
  },
  {
    file: 'plugins/devflow/devflow/templates/project.md',
    line_contains: 'to update Project v2 custom fields',
    reason: 'the update targets GitHub Project v2 fields; OBJECTIVE.md is only a field source',
  },
  {
    file: 'plugins/devflow/devflow/templates/research.md',
    line_contains: 'Write "No user constraints',
    reason: 'section-content guidance: write this sentence; CONTEXT.md is only the condition',
  },
  {
    file: 'plugins/devflow/skills/gh-sync/SKILL.md',
    line_contains: 'create or edit the GitHub release',
    reason: 'the write targets a GitHub release; SUMMARY.md files are only read for the notes',
  },
  // ── negations the scanner cannot see (the negation follows the verb, or is "refuse") ──
  {
    file: 'plugins/devflow/agents/planner.md',
    line_contains: '**STOP. Write no TRDs.**',
    reason: '"Write no TRDs" forbids the write; the negation follows the verb, past the rule',
  },
  {
    file: 'plugins/devflow/agents/verifier.md',
    line_contains: 'refusing to overwrite" — this means',
    reason: 'quotes the UAT generator refusal and says skip, do NOT regenerate; a forbid',
  },
  {
    file: 'plugins/devflow/devflow/templates/UAT.md',
    line_contains: 'the generator REFUSES to overwrite',
    reason: 'safety note that the UAT generator refuses an overwrite; it forbids the write',
  },
];

// ─── measurement ────────────────────────────────────────────────────────────────────

function _exempted(file, text, exempt) {
  return exempt.some((e) => e.file === file && text.includes(e.line_contains));
}

/**
 * Scan the repo: findings (EXEMPT removed) and bad inline markers, each tagged with its file.
 * `override` maps a repo-relative path to replacement text (used to inject a synthetic line).
 */
function measure({ root = REPO_ROOT, exempt = EXEMPT, override = {} } = {}) {
  const findings = [];
  const badMarkers = [];
  for (const file of scanSet(root)) {
    const text = file in override ? override[file] : fs.readFileSync(path.join(root, file), 'utf-8');
    const r = scanWrites(text);
    for (const f of r.findings) {
      if (!_exempted(file, f.text, exempt)) findings.push({ file, ...f });
    }
    for (const b of r.badMarkers) badMarkers.push({ file, ...b });
  }
  return { findings, badMarkers };
}

// ─── the zero rule (tests 9-10) ─────────────────────────────────────────────────────

/**
 * One message per finding, `file:line: <text>`, sorted by file then line. Pure. Empty when clean.
 * @param {{file:string, line:number, text:string}[]} findings
 * @returns {string[]}
 */
function checkZero(findings) {
  return [...findings]
    .sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line)
    .map((f) => `${f.file}:${f.line}: ${f.text}`);
}

function formatZeroFailure(errors) {
  return [
    `planning-write audit failed (SC1, D-21): ${errors.length} direct planning-file write instruction(s).`,
    'Route each write through a df-tools verb (plan put-trd, summary post, doc put, ...); a read-only or',
    'explanatory line takes an inline `<!-- planning-audit: allow <reason of 20+ chars> -->` marker instead:',
    ...errors.map((e) => `  ${e}`),
  ].join('\n');
}

// ─── verbs exist (TRD 48-15) ────────────────────────────────────────────────────────

const { COMMANDS } = require('./help.cjs');
const { VERB_TABLE } = require('./planning-paths.cjs');
const { VERB_CALL_RE } = require('./planning-audit.cjs');

const DF_TOOLS_SRC = path.join(__dirname, '..', 'df-tools.cjs');

/** Split on `|` at parenthesis depth 0. */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === '|' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Every verb the audit regex accepts, expanded: `plan (put-trd|push)` -> `plan put-trd`, `plan push`; a pattern
 * subcommand (`state [a-z-]+`) -> `state *` (any documented subcommand).
 */
function auditVerbs(re = VERB_CALL_RE) {
  const m = /\\s\+\((.*)\)$/.exec(re.source);
  if (!m) throw new Error(`cannot read the verb group of ${re.source}`);
  const out = [];
  for (const alt of splitTop(m[1])) {
    const g = /^(.*?)\((.*)\)$/.exec(alt);
    if (g) for (const sub of splitTop(g[2])) out.push(`${g[1]}${sub}`);
    else out.push(alt.replace(/\[a-z-\]\+$/, '*'));
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * verbsExist(verbs, commands, dispatchSrc) — each verb (`<command> <sub> [<flag>...]`) needs a top-level `case` in
 * df-tools.cjs and a help.cjs COMMANDS entry whose usage documents every further word (`*` = any). -> missing[]
 */
function verbsExist(verbs, commands = COMMANDS, dispatchSrc = fs.readFileSync(DF_TOOLS_SRC, 'utf8')) {
  const missing = [];
  for (const verb of verbs) {
    const [top, ...words] = verb.split(' ');
    const entry = commands[top];
    if (!entry || !new RegExp(`^ {4}case '${escapeRe(top)}':`, 'm').test(dispatchSrc)) {
      missing.push(`${verb}: no df-tools command \`${top}\``);
      continue;
    }
    const documented = new Set(entry.usage.split(/[\s<>|[\]()]+/).filter(Boolean));
    for (const w of words) {
      if (w !== '*' && !documented.has(w)) missing.push(`${verb}: \`df-tools ${top} --help\` does not document \`${w}\``);
    }
  }
  return missing;
}

// ─── tests ──────────────────────────────────────────────────────────────────────────

const SKIP = !IS_DEVFLOW_CHECKOUT
  ? 'not a devflow-claude checkout'
  : process.env.PLANNING_AUDIT_MEASURE === '1'
    ? 'PLANNING_AUDIT_MEASURE=1 (measuring baselines)'
    : false;

describe('planning-writes.repo.test.cjs', { skip: SKIP }, () => {
  describe('GATE', () => {
    test('the repo has zero planning-write findings', () => {
      const errors = checkZero(measure().findings);
      assert.deepEqual(errors, [], formatZeroFailure(errors));
    });

    test('injected `Write the SUMMARY.md file` in skills/todo/SKILL.md fails naming that line', () => {
      const file = 'plugins/devflow/skills/todo/SKILL.md';
      const original = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
      const text = `${original.replace(/\n?$/, '\n')}Write the SUMMARY.md file\n`;
      const injectedLine = text.split('\n').length - 1;
      const message = formatZeroFailure(checkZero(measure({ override: { [file]: text } }).findings));
      assert.ok(
        message.includes(`${file}:${injectedLine}: Write the SUMMARY.md file`),
        `the failure must name ${file}:${injectedLine}, got:\n${message}`,
      );
    });
  });

  describe('ZERO rule (injected findings)', () => {
    const A = 'plugins/devflow/agents/planner.md';
    const B = 'plugins/devflow/skills/status/SKILL.md';
    const f = (file, line, text = `Write the SUMMARY.md ${line}`) => ({ file, line, text, artifact: 'SUMMARY' });

    test('9: every finding is listed file:line, sorted, not just the first', () => {
      const errors = checkZero([f(B, 9), f(A, 4), f(B, 3)]);
      assert.deepEqual(errors, [`${A}:4: Write the SUMMARY.md 4`, `${B}:3: Write the SUMMARY.md 3`, `${B}:9: Write the SUMMARY.md 9`]);
      const message = formatZeroFailure(errors);
      assert.ok(message.includes('3 direct planning-file write instruction(s)'), message);
      assert.ok(message.includes(`  ${B}:9: Write the SUMMARY.md 9`), message);
    });

    test('no findings, no errors', () => {
      assert.deepEqual(checkZero([]), []);
    });
  });

  describe('NO BASELINE', () => {
    test('10: baseline files must be deleted — __fixtures__/planning-writes-baseline/ does not exist', () => {
      const left = fs.existsSync(BASELINE_DIR) ? fs.readdirSync(BASELINE_DIR) : null;
      assert.equal(
        left,
        null,
        `baseline files must be deleted: SC1 asserts zero outright (48-23), found ${BASELINE_DIR}` +
          (left ? ` holding ${left.join(', ') || 'nothing'}` : ''),
      );
    });
  });

  describe('SENSITIVITY', () => {
    test('13: agents/planner.md has zero findings, and an injected write line yields exactly one', () => {
      const rel = 'plugins/devflow/agents/planner.md';
      const clean = measure().findings.filter((x) => x.file === rel);
      assert.deepEqual(clean, [], `${rel} must have zero findings`);
      const original = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      const text = `${original.replace(/\n?$/, '\n')}\nCreate the TRD file at .planning/objectives/01-x/01-01-TRD.md\n`;
      const hit = measure({ override: { [rel]: text } }).findings.filter((x) => x.file === rel);
      assert.equal(hit.length, 1, `expected the scanner to flag the injected line, got ${JSON.stringify(hit)}`);
    });
  });

  describe('EXEMPT and inline markers', () => {
    test('14: every EXEMPT entry matches a real line with a 20+ char reason; zero bad markers', () => {
      for (const e of EXEMPT) {
        assert.ok(e.reason.length >= 20, `EXEMPT reason too short (${e.reason.length}): ${e.file}`);
        const abs = path.join(REPO_ROOT, e.file);
        assert.ok(fs.existsSync(abs), `EXEMPT file does not exist: ${e.file}`);
        const hit = fs.readFileSync(abs, 'utf-8').split(/\r?\n/).some((l) => l.includes(e.line_contains));
        assert.ok(hit, `EXEMPT entry matches no line (stale): ${e.file} :: ${e.line_contains}`);
      }
      const { badMarkers } = measure();
      assert.deepEqual(
        badMarkers,
        [],
        `bad planning-audit allow markers:\n${badMarkers.map((b) => `  ${b.file}:${b.line}: ${b.problem}`).join('\n')}`,
      );
    });
  });

  describe('VERBS EXIST (48-15): a deny message or a satisfied directive never names a verb df-tools lacks', () => {
    test('every planning-paths VERB_TABLE verb and every verb the audit regex accepts is a documented df-tools command', () => {
      const expanded = auditVerbs();
      for (const v of ['plan put-trd', 'planning mode', 'state *', 'roadmap update-job-progress', 'requirements mark-complete', 'template fill', 'gh pull']) {
        assert.ok(expanded.includes(v), `the audit regex expands to ${v} (got ${expanded.join(', ')})`);
      }
      assert.ok(VERB_TABLE.length >= 10, `VERB_TABLE: ${VERB_TABLE.join(', ')}`);
      const missing = verbsExist([...VERB_TABLE, ...expanded]);
      assert.deepStrictEqual(missing, [], `verbs named by the gate or the audit that df-tools does not have:\n${missing.join('\n')}`);
    });

    test('sensitivity: a made-up subcommand or command fails, naming it', () => {
      assert.deepStrictEqual(verbsExist(['plan bogus']), ['plan bogus: `df-tools plan --help` does not document `bogus`']);
      assert.deepStrictEqual(verbsExist(['nope put']), ['nope put: no df-tools command `nope`']);
      assert.deepStrictEqual(verbsExist(['gh pull --all', 'state *']), []);
    });
  });

  describe('GROUP table', () => {
    test('every pinned group path is a scanned file (or a prefix of one)', () => {
      const scanned = scanSet(REPO_ROOT);
      for (const [group, paths] of Object.entries(GROUP_PATHS)) {
        for (const p of paths) {
          const ok = p.endsWith('/') ? scanned.some((s) => s.startsWith(p)) : scanned.includes(p);
          assert.ok(ok, `GROUPS.${group} pins ${p}, which is not in the scan set`);
        }
      }
    });
  });
});

module.exports = { EXEMPT, measure, checkZero, formatZeroFailure, auditVerbs, verbsExist };
