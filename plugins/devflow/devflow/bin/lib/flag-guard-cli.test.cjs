'use strict';

// Test list (TRD 68-03 task 3, TOOL-01): the real binary rejects an unknown flag on a writing command before anything
// runs. Hand-built temp project, fake HOME, `gh` PATH shim (flag-guard-fixtures.cjs); never this repository's `.planning/`.
//
//  14. `df-tools --cwd <p> milestone complete v1.0 --zz-unknown` -> exit 1, `Error: unknown flag --zz-unknown for
//      `milestone complete`...`, the tree is unchanged, no gh call.
//  15. Every FLAG_SPEC entry (each subcommand; a flags-only command once), via its PROBES argv + `--zz-unknown` -> exit 1,
//      the flag and the entry's label named, tree unchanged, no gh call. Failures are collected and reported together.
//      Entries whose rule is `anyFlags` (`state patch`) are skipped by the loop; the skip list is asserted.
//  15b. PROBES and FLAG_SPEC cover the same entries.
//  16. Positive controls: known flags still work (`--flag=value`, multi-word values, a global --raw, `state patch --<field>`).
//  17. `milestone complete --help --zz-unknown` still prints usage and exits 0 (help is answered first).
//  18. A non-writing command is untouched: `find-objective 1 --zz-unknown` behaves as before (exit 0).

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { flagProbeProject, PROBES, specEntries } = require('./__fixtures__/flag-guard-fixtures.cjs');

const UNKNOWN = '--zz-unknown';

// Entries the loop in test 15 cannot probe with an unknown flag: every `--x` is a field name there.
const SKIPPED_BY_RULE = ['state patch'];

describe('writing commands reject an unknown flag (TOOL-01)', () => {
  let project;
  before(() => { project = flagProbeProject(); });
  after(() => { project.cleanup(); });

  test('14. milestone complete v1.0 --zz-unknown exits 1 naming the flag, and writes nothing', () => {
    const treeBefore = project.tree();
    const r = project.run(['milestone', 'complete', 'v1.0', UNKNOWN]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^Error: unknown flag --zz-unknown for `milestone complete`/);
    assert.deepEqual(project.tree(), treeBefore);
    assert.deepEqual(project.ghCalls(), []);
  });

  test('15. every probed FLAG_SPEC entry rejects an unknown flag the same way, writes nothing and calls no gh', () => {
    const failures = [];
    for (const [label, argv] of Object.entries(PROBES)) {
      if (SKIPPED_BY_RULE.includes(label)) continue;
      const treeBefore = project.tree();
      const r = project.run([...argv, UNKNOWN]);
      const problems = [];
      if (r.status !== 1) problems.push(`exit ${r.status}, expected 1`);
      const expected = `unknown flag ${UNKNOWN} for \`${label}\``;
      if (!r.stderr.includes(expected)) problems.push(`stderr lacks "${expected}": ${JSON.stringify(r.stderr.slice(0, 160))}`);
      if (JSON.stringify(project.tree()) !== JSON.stringify(treeBefore)) problems.push('the tree changed');
      if (project.ghCalls().length > 0) problems.push('gh was called');
      if (problems.length > 0) failures.push(`${label}: ${problems.join('; ')}`);
    }
    assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
  });

  test('15b. PROBES and FLAG_SPEC cover the same entries, and only the skipped ones are anyFlags', () => {
    const { FLAG_SPEC } = require('./flag-spec.cjs');
    const entries = specEntries(FLAG_SPEC);
    assert.deepEqual(entries.map((e) => e.label).sort(), Object.keys(PROBES).sort());
    const unprobeable = entries.filter((e) => e.rule.anyFlags || e.rule.ownParser).map((e) => e.label).sort();
    assert.deepEqual(unprobeable, SKIPPED_BY_RULE);
    for (const e of entries) {
      if (e.rule.anyFlags || e.rule.ownParser || e.rule.tailFrom !== undefined) {
        assert.equal(typeof e.rule.reason, 'string', `${e.label} needs a reason`);
        assert.notEqual(e.rule.reason.trim(), '', `${e.label} needs a reason`);
      }
    }
  });

  describe('16. known flags still work', () => {
    const stderrIsClean = (r) => assert.doesNotMatch(r.stderr, /unknown flag/);

    test('objective remove 2 --force is a dry run', () => {
      const r = project.run(['objective', 'remove', '2', '--force']);
      stderrIsClean(r);
      assert.equal(r.status, 0, r.stderr);
    });

    test('scaffold takes several words after --name', () => {
      const r = project.run(['scaffold', 'context', '--objective', '1', '--name', 'Ctx', 'Name']);
      stderrIsClean(r);
      assert.equal(r.status, 0, r.stderr);
    });

    test('state patch takes --<field> <value> pairs', () => {
      const r = project.run(['state', 'patch', '--Status', 'Building']);
      stderrIsClean(r);
      assert.equal(r.status, 0, r.stderr);
    });

    test('skill-active --status', () => {
      const r = project.run(['skill-active', '--status']);
      stderrIsClean(r);
      assert.equal(r.status, 0, r.stderr);
    });

    test('frontmatter get with --field and a global --raw', () => {
      const r = project.run(['frontmatter', 'get', '.planning/objectives/01-a/01-01-TRD.md', '--field', 'type', '--raw']);
      stderrIsClean(r);
      assert.equal(r.status, 0, r.stderr);
    });

    test('--flag=value is accepted', () => {
      const r = project.run(['doc', 'put', 'PROJECT.md', '--from=draft.md']);
      stderrIsClean(r);
      assert.equal(r.status, 0, r.stderr);
    });
  });

  test('17. milestone complete --help --zz-unknown still prints usage and exits 0', () => {
    const treeBefore = project.tree();
    const r = project.run(['milestone', 'complete', '--help', UNKNOWN]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Usage: df-tools milestone/);
    assert.deepEqual(project.tree(), treeBefore);
  });

  test('18. a non-writing command is untouched: find-objective 1 --zz-unknown exits 0', () => {
    const r = project.run(['find-objective', '1', UNKNOWN]);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /unknown flag/);
  });
});
