'use strict';

// Test list (TRD 48-04, objective 48-planning-write-path-migration, GWP-02 / SC1).
// Written before planning-audit.cjs. Hand-written strings only; test 8 builds a temp tree.
//
// 1.  `Write the TRD to .aoforge/objectives/01-x/01-01-a-TRD.md` -> 1 finding, artifact 'TRD', line 1.
// 2.  Same line with an `aof-tools.cjs plan put-trd` call two lines later -> 0 findings; four lines later -> 1.
// 3.  `cat > .aoforge/STATE.md <<EOF` -> 1 finding; `cat .aoforge/STATE.md` -> 0.
// 4.  `Never write STACK.md yourself` -> 0 (negation); `Do not edit the SUMMARY` -> 0.
// 5.  `Read @~/.claude/aoforge/templates/summary.md` -> 0; `update ROADMAP.md progress` -> 1;
//     `node aof-tools.cjs frontmatter set .aoforge/x/OBJECTIVE.md status done` -> 1.
// 6.  A finding inside a fenced bash block counts the same as prose.
// 6a. `<!-- planning-audit: allow <reason> -->` above `Write the SUMMARY.md` -> 0 findings, 1 allowed;
//     the same marker above a line with no finding -> 1 bad marker (stale); reason `ok` -> bad marker (short).
// 7.  groupOf: planner -> plan, executor -> execute, verifier -> verify, workflows/new-project.md -> bootstrap,
//     skills/todo/SKILL.md -> work, skills/status/SKILL.md -> misc.
// 8.  scanSet(root) excludes a workflow with `status: legacy` and includes templates.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const audit = require('./planning-audit.cjs');
const { scanWrites, scanSet, groupOf, GROUPS } = audit;

const PUT_TRD = 'node ~/.claude/aoforge/bin/aof-tools.cjs plan put-trd 01 01-01-a-TRD.md --from "$DRAFT"';
const WRITE_TRD = 'Write the TRD to .aoforge/objectives/01-x/01-01-a-TRD.md';

describe('planning-audit: write directives', () => {
  test('1: a direct TRD write is one finding on line 1 with artifact TRD', () => {
    const r = scanWrites(WRITE_TRD);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].line, 1);
    assert.equal(r.findings[0].artifact, 'TRD');
    assert.equal(r.findings[0].text, WRITE_TRD);
    assert.deepEqual(r.allowed, []);
    assert.deepEqual(r.badMarkers, []);
  });

  test('2: an aof-tools verb within 3 lines satisfies the directive; 4 lines away does not', () => {
    const near = [WRITE_TRD, 'then', PUT_TRD].join('\n');
    assert.equal(scanWrites(near).findings.length, 0);

    const far = [WRITE_TRD, 'a', 'b', 'c', PUT_TRD].join('\n');
    const r = scanWrites(far);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].line, 1);

    // The window is symmetric: a verb three lines ABOVE also satisfies.
    const above = [PUT_TRD, 'a', 'b', WRITE_TRD].join('\n');
    assert.equal(scanWrites(above).findings.length, 0);
  });

  test('3: a redirect into STATE.md is a write; a plain cat is a read', () => {
    assert.equal(scanWrites('cat > .aoforge/STATE.md <<EOF').findings.length, 1);
    assert.equal(scanWrites('cat .aoforge/STATE.md').findings.length, 0);
  });

  test('4: negations are not directives', () => {
    assert.equal(scanWrites('Never write STACK.md yourself').findings.length, 0);
    assert.equal(scanWrites('Do not edit the SUMMARY').findings.length, 0);
    assert.equal(scanWrites("Don't update ROADMAP.md here").findings.length, 0);
    assert.equal(scanWrites('Do **NOT** write the SUMMARY.md').findings.length, 0);
    // A negation in an earlier clause does not govern a later verb.
    assert.equal(scanWrites('If no SUMMARY exists, create SUMMARY.md').findings.length, 1);
  });

  test('5: @-references are reads; ROADMAP update and frontmatter set are writes', () => {
    assert.equal(scanWrites('Read @~/.claude/aoforge/templates/summary.md').findings.length, 0);
    // The artifact token inside an @~ reference is a template path, not the planning file.
    assert.equal(scanWrites('Fill @~/.claude/aoforge/templates/UAT.md').findings.length, 0);

    const roadmap = scanWrites('update ROADMAP.md progress');
    assert.equal(roadmap.findings.length, 1);
    assert.equal(roadmap.findings[0].artifact, 'ROADMAP');

    const fm = scanWrites('node aof-tools.cjs frontmatter set .aoforge/x/OBJECTIVE.md status done');
    assert.equal(fm.findings.length, 1);
    assert.equal(fm.findings[0].artifact, 'OBJECTIVE.md');
  });

  test('5b: word-form verb and artifact more than 80 chars apart are not a directive', () => {
    const far = `update ${'x'.repeat(81)} ROADMAP.md`;
    assert.equal(scanWrites(far).findings.length, 0);
    const near = `update ${'x'.repeat(70)} ROADMAP.md`;
    assert.equal(scanWrites(near).findings.length, 1);
  });

  test('5c: a store-aware verb on the same line satisfies (template fill, state, roadmap)', () => {
    assert.equal(
      scanWrites('node ~/.claude/aoforge/bin/aof-tools.cjs template fill summary --objective 3 > SUMMARY.md').findings.length,
      0,
    );
    assert.equal(scanWrites('Update STATE.md: `aof-tools.cjs state advance-job`').findings.length, 0);
    assert.equal(
      scanWrites('Update ROADMAP.md with `node aof-tools.cjs roadmap update-job-progress 3`').findings.length,
      0,
    );
  });

  test('5d: an XML tag closing bracket is not a redirect', () => {
    assert.equal(scanWrites('<files>.aoforge/STATE.md</files>').findings.length, 0);
    assert.equal(scanWrites('echo done >> .aoforge/STATE.md').findings.length, 1);
    // A redirect into .aoforge/ that names no artifact (runtime/config path) is not a finding.
    assert.equal(scanWrites('echo "{}" > .aoforge/config.json').findings.length, 0);
  });

  test('5e: an aof-tools commit message is narration, not a write directive', () => {
    assert.equal(
      scanWrites(
        'node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: create roadmap ([N] objectives)" --files .aoforge/ROADMAP.md .aoforge/STATE.md',
      ).findings.length,
      0,
    );
    // ...but a write instruction on the same line as a commit still counts.
    assert.equal(
      scanWrites('Write ROADMAP.md, then `aof-tools.cjs commit "docs: roadmap" --files .aoforge/ROADMAP.md`').findings
        .length,
      1,
    );
  });

  test('6: a finding inside a fenced bash block counts the same as prose', () => {
    const text = ['Intro', '```bash', 'cat > .aoforge/STATE.md <<EOF', 'x', 'EOF', '```'].join('\n');
    const r = scanWrites(text);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].line, 3);
  });

  test('6a: inline allow markers suppress one finding; stale or short markers are bad', () => {
    const allowed = scanWrites(
      ['<!-- planning-audit: allow explanatory example of the old flow -->', 'Write the SUMMARY.md'].join('\n'),
    );
    assert.equal(allowed.findings.length, 0);
    assert.deepEqual(allowed.allowed, [{ line: 2, reason: 'explanatory example of the old flow' }]);
    assert.deepEqual(allowed.badMarkers, []);

    // Inline on the flagged line itself.
    const inline = scanWrites('Write the SUMMARY.md <!-- planning-audit: allow explanatory example of the old flow -->');
    assert.equal(inline.findings.length, 0);
    assert.equal(inline.allowed.length, 1);
    assert.equal(inline.allowed[0].line, 1);

    const stale = scanWrites(
      ['<!-- planning-audit: allow explanatory example of the old flow -->', 'Nothing to see here'].join('\n'),
    );
    assert.equal(stale.findings.length, 0);
    assert.deepEqual(stale.allowed, []);
    assert.equal(stale.badMarkers.length, 1);
    assert.equal(stale.badMarkers[0].line, 1);
    assert.match(stale.badMarkers[0].problem, /stale/);

    const short = scanWrites(['<!-- planning-audit: allow ok -->', 'Write the SUMMARY.md'].join('\n'));
    assert.equal(short.badMarkers.length, 1);
    assert.equal(short.badMarkers[0].line, 1);
    assert.match(short.badMarkers[0].problem, /short/);
    // A short-reason marker does not suppress anything.
    assert.equal(short.findings.length, 1);
    assert.deepEqual(short.allowed, []);
  });

  test('6b: a marker above a directive already satisfied by a verb is stale', () => {
    const text = [
      '<!-- planning-audit: allow explanatory example of the old flow -->',
      WRITE_TRD,
      PUT_TRD,
    ].join('\n');
    const r = scanWrites(text);
    assert.equal(r.findings.length, 0);
    assert.equal(r.badMarkers.length, 1);
  });
});

describe('planning-audit: groups', () => {
  test('7: groupOf maps the pinned table, default misc', () => {
    assert.equal(groupOf('plugins/aoforge/agents/planner.md'), 'plan');
    assert.equal(groupOf('plugins/aoforge/agents/executor.md'), 'execute');
    assert.equal(groupOf('plugins/aoforge/agents/verifier.md'), 'verify');
    assert.equal(groupOf('plugins/aoforge/aoforge/workflows/new-project.md'), 'bootstrap');
    assert.equal(groupOf('plugins/aoforge/skills/todo/SKILL.md'), 'work');
    assert.equal(groupOf('plugins/aoforge/skills/status/SKILL.md'), 'misc');
    assert.equal(groupOf('plugins/aoforge/aoforge/templates/research-project/STACK.md'), 'bootstrap');
    assert.equal(groupOf('plugins/aoforge/aoforge/templates/codebase/stack.md'), 'misc');
  });

  test('7b: GROUPS names exactly the six groups, misc last', () => {
    assert.deepEqual(Object.keys(GROUPS), ['plan', 'execute', 'verify', 'bootstrap', 'work', 'misc']);
  });

  test('7c: no path is pinned to two groups', () => {
    const seen = new Map();
    for (const [group, paths] of Object.entries(audit.GROUP_PATHS)) {
      for (const p of paths) {
        assert.ok(!seen.has(p), `${p} pinned to both ${seen.get(p)} and ${group}`);
        seen.set(p, group);
      }
    }
  });
});

describe('planning-audit: scan set', () => {
  test('8: scanSet excludes status: legacy workflows and includes templates', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-audit-'));
    try {
      const wf = path.join(root, 'plugins/aoforge/aoforge/workflows');
      const tpl = path.join(root, 'plugins/aoforge/aoforge/templates');
      fs.mkdirSync(wf, { recursive: true });
      fs.mkdirSync(path.join(tpl, 'codebase'), { recursive: true });
      fs.writeFileSync(path.join(wf, 'old.md'), '---\nstatus: legacy\n---\nWrite the SUMMARY.md\n');
      fs.writeFileSync(path.join(wf, 'new.md'), '---\nstatus: active\n---\nWrite the SUMMARY.md\n');
      fs.writeFileSync(path.join(tpl, 'summary.md'), '# Summary\n');
      fs.writeFileSync(path.join(tpl, 'codebase', 'stack.md'), '# Stack\n');
      fs.writeFileSync(path.join(tpl, 'config.json'), '{}\n');

      const files = scanSet(root);
      assert.deepEqual(files, [
        'plugins/aoforge/aoforge/templates/codebase/stack.md',
        'plugins/aoforge/aoforge/templates/summary.md',
        'plugins/aoforge/aoforge/workflows/new.md',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('8b: scanSet picks skills/*/SKILL.md and agents/*.md only', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-audit-'));
    try {
      fs.mkdirSync(path.join(root, 'plugins/aoforge/skills/todo'), { recursive: true });
      fs.mkdirSync(path.join(root, 'plugins/aoforge/agents'), { recursive: true });
      fs.writeFileSync(path.join(root, 'plugins/aoforge/skills/todo/SKILL.md'), 'x\n');
      fs.writeFileSync(path.join(root, 'plugins/aoforge/skills/todo/notes.md'), 'x\n');
      fs.writeFileSync(path.join(root, 'plugins/aoforge/agents/planner.md'), 'x\n');
      assert.deepEqual(scanSet(root), [
        'plugins/aoforge/agents/planner.md',
        'plugins/aoforge/skills/todo/SKILL.md',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
