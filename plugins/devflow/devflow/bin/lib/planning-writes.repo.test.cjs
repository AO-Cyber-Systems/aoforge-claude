'use strict';

// SC1 ratchet: direct planning-file write instructions in DevFlow's own prose (TRD 48-04,
// objective 48-planning-write-path-migration, GWP-02, decision D-21).
//
// WHAT COUNTS. planning-audit.cjs scans every skill (skills/<name>/SKILL.md), every non-legacy
// workflow, every agent and every template (references are out of scope: they explain, they do
// not instruct). A finding is a line that tells an agent to write a planning file (TRD, SUMMARY,
// VERIFICATION, UAT, RESEARCH, CONTEXT, OBJECTIVE.md, PROJECT.md, REQUIREMENTS, ROADMAP,
// STATE.md, MILESTONES, codebase/, todos/, debug/, quick/, research/, milestones/, decisions/)
// with no store-aware df-tools verb call within 3 lines. See planning-audit.cjs for the regexes.
//
// THE RATCHET. Per-file counts may only go down:
//   - a file absent from every baseline must have zero findings (every one is listed file:line);
//   - actual[file] > baseline[file] fails, naming the file and both counts;
//   - baseline[file] > actual[file] fails as stale ("lower the baseline for <file> to <n>"),
//     so the TRD that migrates prose lowers the number in the same commit;
//   - a baseline key must sit in the JSON of its own group (groupOf).
// Baselines live in __fixtures__/planning-writes-baseline/<group>.json, one file per group so
// the six prose TRDs edit disjoint files: 48-16 plan, 48-17 execute, 48-18 verify,
// 48-19 bootstrap, 48-20 work, 48-21 misc. Each drives its group to zero; 48-23 deletes the
// baselines and asserts zero findings outright.
//
// A line that is read-only, explanatory, or about a runtime/tracked-config path (STACK.md,
// config.json, .trd-progress/) takes an inline `<!-- planning-audit: allow <reason> -->` marker
// (reason >= 20 chars) on the line or the line above. Stale or short markers fail this test.
// EXEMPT below is for lines the regexes misjudge outright; never for real write instructions.
//
// Test list:
// 9.  Every finding in a file absent from all baselines fails with `file:line: <text>` (all listed).
// 10. actual[file] > baseline[file] fails naming the file and both counts.
// 11. baseline[file] > actual[file] fails as stale ("lower the baseline for <file> to <n>").
// 12. A baseline key whose groupOf differs from the JSON it sits in fails.
// 13. Sensitivity: >= 1 finding in today's agents/planner.md while planner.md is baselined, else 0.
// 14. Every EXEMPT entry matches a real line and has a 20+ char reason; zero bad inline markers.
//
// Regenerating counts (only ever by measuring, never by hand):
//   PLANNING_AUDIT_MEASURE=1 node -e "<require this file>.measuredBaselines()" and write each
//   group's object to <group>.json. PLANNING_AUDIT_MEASURE=1 skips the suite when required.
//
// Runtime model: read-only. Repo root is five levels up; a mirror install (no README.md there)
// skips the whole file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { scanWrites, scanSet, groupOf, GROUPS, GROUP_PATHS } = require('./planning-audit.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
const BASELINE_DIR = path.join(__dirname, '__fixtures__', 'planning-writes-baseline');
const GROUP_NAMES = Object.keys(GROUPS);

/** The prose TRD that owns each group and must drive it to zero. */
const OWNER = { plan: '48-16', execute: '48-17', verify: '48-18', bootstrap: '48-19', work: '48-20', misc: '48-21' };

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

function baselineComment(group) {
  return (
    `Planning-write ratchet baseline for the '${group}' group (TRD 48-04, D-21). Per-file counts of ` +
    'direct planning-file write instructions not yet routed through a df-tools verb. Counts may only ' +
    `go down: lower a count in the commit that migrates the prose. TRD ${OWNER[group]} drives this ` +
    'group to zero; 48-23 deletes these files. Regenerate by measuring with planning-audit.cjs, never by hand.'
  );
}

/** Today's counts as the six baseline objects: `_comment` first, then sorted keys with count > 0. */
function measuredBaselines(opts) {
  const counts = Object.fromEntries(GROUP_NAMES.map((g) => [g, {}]));
  for (const f of measure(opts).findings) {
    const g = groupOf(f.file);
    counts[g][f.file] = (counts[g][f.file] || 0) + 1;
  }
  return Object.fromEntries(
    GROUP_NAMES.map((g) => [
      g,
      Object.fromEntries([
        ['_comment', baselineComment(g)],
        ...Object.keys(counts[g])
          .sort()
          .map((k) => [k, counts[g][k]]),
      ]),
    ]),
  );
}

/** The six baseline files as parsed JSON (with `_comment`). */
function loadBaselineFiles() {
  return Object.fromEntries(
    GROUP_NAMES.map((g) => [g, JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, `${g}.json`), 'utf-8'))]),
  );
}

// ─── the ratchet (tests 9-12) ───────────────────────────────────────────────────────

/**
 * Compare findings against per-group baselines. Pure.
 * @param {{file:string, line:number, text:string}[]} findings
 * @param {Object<string, Object<string, number|string>>} baselines group -> {file: count, _comment}
 * @returns {string[]} one message per problem; empty when the ratchet holds
 */
function checkRatchet(findings, baselines) {
  const errors = [];
  const base = new Map(); // file -> {count, group}
  for (const [group, entries] of Object.entries(baselines)) {
    for (const [file, count] of Object.entries(entries)) {
      if (file === '_comment') continue;
      const owner = groupOf(file);
      if (owner !== group) {
        errors.push(`${file} sits in ${group}.json but groupOf says '${owner}' — move it to ${owner}.json`);
      }
      if (!Number.isInteger(count) || count < 1) {
        errors.push(`${file}: baseline in ${group}.json must be a positive integer (drop the key at zero), got ${JSON.stringify(count)}`);
      }
      base.set(file, { count, group });
    }
  }

  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  const lines = (fs_) => fs_.map((f) => `  ${f.file}:${f.line}: ${f.text}`);

  for (const [file, fs_] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const b = base.get(file);
    if (!b) {
      for (const f of fs_) errors.push(`${f.file}:${f.line}: ${f.text}`);
    } else if (fs_.length > b.count) {
      errors.push(
        [
          `${file}: ${fs_.length} planning-write directives > baseline ${b.count} (${b.group}.json) — ` +
            'route the new one through a df-tools verb:',
          ...lines(fs_),
        ].join('\n'),
      );
    }
  }
  for (const [file, b] of [...base.entries()].sort(([a], [c]) => a.localeCompare(c))) {
    const actual = (byFile.get(file) || []).length;
    if (Number.isInteger(b.count) && b.count > actual) {
      errors.push(
        `${file}: baseline ${b.count} > actual ${actual} (stale) — lower the baseline for ${file} to ${actual}` +
          ` in ${b.group}.json${actual === 0 ? ' (delete the key)' : ''}`,
      );
    }
  }
  return errors;
}

function formatRatchetFailure(errors) {
  return [
    'planning-write ratchet failed (D-21: counts may only go down). Route each write through a df-tools',
    'verb (plan put-trd, summary post, doc put, ...); a read-only or explanatory line takes an inline',
    '`<!-- planning-audit: allow <reason of 20+ chars> -->` marker instead:',
    ...errors,
  ].join('\n');
}

// ─── tests ──────────────────────────────────────────────────────────────────────────

const SKIP = !IS_DEVFLOW_CHECKOUT
  ? 'not a devflow-claude checkout'
  : process.env.PLANNING_AUDIT_MEASURE === '1'
    ? 'PLANNING_AUDIT_MEASURE=1 (measuring baselines)'
    : false;

describe('planning-writes.repo.test.cjs', { skip: SKIP }, () => {
  describe('GATE', () => {
    test('the repo holds the ratchet against the six pinned baselines', () => {
      const errors = checkRatchet(measure().findings, loadBaselineFiles());
      assert.deepEqual(errors, [], formatRatchetFailure(errors));
    });

    test('injected `Write the SUMMARY.md file` in skills/todo/SKILL.md fails naming that line', () => {
      const file = 'plugins/devflow/skills/todo/SKILL.md';
      const original = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
      const text = `${original.replace(/\n?$/, '\n')}Write the SUMMARY.md file\n`;
      const injectedLine = text.split('\n').length - 1;
      const errors = checkRatchet(measure({ override: { [file]: text } }).findings, loadBaselineFiles());
      const message = formatRatchetFailure(errors);
      assert.ok(
        message.includes(`${file}:${injectedLine}: Write the SUMMARY.md file`),
        `the failure must name ${file}:${injectedLine}, got:\n${message}`,
      );
    });
  });

  describe('RATCHET rules (injected findings/baselines)', () => {
    const A = 'plugins/devflow/agents/planner.md'; // plan
    const B = 'plugins/devflow/skills/status/SKILL.md'; // misc
    const f = (file, line, text = `Write the SUMMARY.md ${line}`) => ({ file, line, text, artifact: 'SUMMARY' });
    const empty = () => Object.fromEntries(GROUP_NAMES.map((g) => [g, { _comment: 'x' }]));

    test('9: every finding in an un-baselined file is listed file:line, not just the first', () => {
      const errors = checkRatchet([f(B, 3), f(B, 9)], empty());
      const message = formatRatchetFailure(errors);
      assert.ok(message.includes(`${B}:3: Write the SUMMARY.md 3`), message);
      assert.ok(message.includes(`${B}:9: Write the SUMMARY.md 9`), message);
    });

    test('10: actual above baseline fails naming the file and both counts', () => {
      const baselines = empty();
      baselines.plan[A] = 2;
      const errors = checkRatchet([f(A, 1), f(A, 5), f(A, 8)], baselines);
      assert.equal(errors.length, 1);
      assert.match(errors[0], new RegExp(`${A.replace(/[.]/g, '\\.')}: 3 planning-write directives > baseline 2`));
      assert.ok(errors[0].includes(`${A}:8: Write the SUMMARY.md 8`), errors[0]);
    });

    test('11: baseline above actual fails as stale with the number to lower it to', () => {
      const baselines = empty();
      baselines.plan[A] = 3;
      const errors = checkRatchet([f(A, 1)], baselines);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].includes(`lower the baseline for ${A} to 1`), errors[0]);

      const zero = empty();
      zero.misc[B] = 1;
      const [e0] = checkRatchet([], zero);
      assert.ok(e0.includes(`lower the baseline for ${B} to 0`) && e0.includes('delete the key'), e0);
    });

    test('12: a baseline key filed under the wrong group fails', () => {
      const baselines = empty();
      baselines.execute[A] = 1;
      const errors = checkRatchet([f(A, 1)], baselines);
      assert.ok(
        errors.some((e) => e.includes(`${A} sits in execute.json but groupOf says 'plan'`)),
        errors.join('\n'),
      );
    });

    test('12b: a non-positive or non-integer baseline count fails', () => {
      const baselines = empty();
      baselines.misc[B] = 0;
      assert.ok(checkRatchet([], baselines).some((e) => e.includes('must be a positive integer')));
    });

    test('ratchet holds when counts match exactly', () => {
      const baselines = empty();
      baselines.plan[A] = 2;
      assert.deepEqual(checkRatchet([f(A, 1), f(A, 2)], baselines), []);
    });
  });

  describe('BASELINE files', () => {
    test('six group files exist, each with a _comment naming its owner TRD, keys sorted', () => {
      const files = loadBaselineFiles();
      assert.deepEqual(Object.keys(files), GROUP_NAMES);
      for (const g of GROUP_NAMES) {
        const obj = files[g];
        assert.equal(typeof obj._comment, 'string', `${g}.json needs a _comment`);
        assert.ok(obj._comment.includes(OWNER[g]), `${g}.json _comment must name ${OWNER[g]}`);
        const keys = Object.keys(obj).filter((k) => k !== '_comment');
        assert.deepEqual(keys, [...keys].sort(), `${g}.json keys must be sorted`);
      }
    });
  });

  describe('SENSITIVITY', () => {
    test('13: agents/planner.md has >= 1 finding while baselined, else exactly 0', () => {
      const rel = 'plugins/devflow/agents/planner.md';
      const n = measure().findings.filter((x) => x.file === rel).length;
      const baselined = Object.values(loadBaselineFiles()).some((g) => rel in g);
      if (baselined) assert.ok(n >= 1, `expected >= 1 finding in ${rel}, got ${n}`);
      else assert.equal(n, 0, `${rel} is not baselined, so it must have zero findings`);
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

module.exports = { EXEMPT, OWNER, measure, measuredBaselines, checkRatchet, baselineComment };
