'use strict';

// Test list (TRD 68-03 task 3, TOOL-01): the real binary rejects an unknown flag on a writing command before anything
// runs. Hand-built temp project, fake HOME, `gh` PATH shim (flag-guard-fixtures.cjs); never this repository's `.planning/`.
//
//  14. `aof-tools --cwd <p> milestone complete v1.0 --zz-unknown` -> exit 1, `Error: unknown flag --zz-unknown for
//      `milestone complete`...`, the tree is unchanged, no gh call.
//  15. Every FLAG_SPEC entry (each subcommand; a flags-only command once), via its PROBES argv + `--zz-unknown` -> exit 1,
//      the flag and the entry's label named, tree unchanged, no gh call. Failures are collected and reported together.
//      Entries whose rule is `anyFlags` (`state patch`) are skipped by the loop; the skip list is asserted.
//  15b. PROBES and FLAG_SPEC cover the same entries.
//  16. Positive controls: known flags still work (`--flag=value`, multi-word values, a global --raw, `state patch --<field>`).
//  17. `milestone complete --help --zz-unknown` still prints usage and exits 0 (help is answered first).
//  18. A non-writing command is untouched: `find-objective 1 --zz-unknown` behaves as before (exit 0).
//
// TRD 68-05 widens test 15 to the whole spec (every writing command, group 1 and group 2) and adds:
//  19. The spawn loop skips exactly the entries whose rule is `anyFlags` or `tailFrom` (`handoff create`, `state patch`):
//      their acceptance is flag-guard.test.cjs test 9 (pure, no spawn), so no handoff record is ever queued by a test.
//      An `ownParser` entry is probed like any other, and must exit 1 naming the flag (its module's own message).
//  20. Positive controls for group 2: known flags are not reported (`migrate plan --dry-run`, `changelog update --dry-run
//      --version v9.9.9`, `planning mode`, `exec-context check --repo <root>`).

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { flagProbeProject, PROBES, specEntries } = require('./__fixtures__/flag-guard-fixtures.cjs');
const { FLAG_SPEC } = require('./flag-spec.cjs');

const UNKNOWN = '--zz-unknown';

// Entries the loop in test 15 cannot probe with an unknown flag: every `--x` is a field name in `state patch`, and the
// tokens of `handoff create` after the verb carry the user's command (the arm extracts `--inputs-json` from them).
const SKIPPED_BY_RULE = ['handoff create', 'state patch'];

const RULES = new Map(specEntries(FLAG_SPEC).map((e) => [e.label, e.rule]));

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
      const ghBefore = project.ghCalls().length;
      const r = project.run([...argv, UNKNOWN]);
      const problems = [];
      if (r.status !== 1) problems.push(`exit ${r.status}, expected 1`);
      // A guard rejection names the entry; an `ownParser` entry is rejected by its module, in its own words.
      const ownParser = Boolean((RULES.get(label) || {}).ownParser);
      const expected = ownParser ? UNKNOWN : `unknown flag ${UNKNOWN} for \`${label}\``;
      if (!r.stderr.includes(expected)) problems.push(`stderr lacks "${expected}": ${JSON.stringify(r.stderr.slice(0, 160))}`);
      if (JSON.stringify(project.tree()) !== JSON.stringify(treeBefore)) problems.push('the tree changed');
      // A delta, so one probe that reaches gh is reported once and does not taint every probe after it.
      if (project.ghCalls().length > ghBefore) problems.push('gh was called');
      if (problems.length > 0) failures.push(`${label}: ${problems.join('; ')}`);
    }
    assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
  });

  test('15b. PROBES and FLAG_SPEC cover the same entries', () => {
    const entries = specEntries(FLAG_SPEC);
    assert.deepEqual(entries.map((e) => e.label).sort(), Object.keys(PROBES).sort());
    for (const e of entries) {
      if (e.rule.anyFlags || e.rule.ownParser || e.rule.tailFrom !== undefined) {
        assert.equal(typeof e.rule.reason, 'string', `${e.label} needs a reason`);
        assert.notEqual(e.rule.reason.trim(), '', `${e.label} needs a reason`);
      }
    }
  });

  test('19. the spawn loop skips exactly the anyFlags and tailFrom entries', () => {
    const skipped = specEntries(FLAG_SPEC)
      .filter((e) => e.rule.anyFlags || e.rule.tailFrom !== undefined)
      .map((e) => e.label)
      .sort();
    assert.deepEqual(skipped, SKIPPED_BY_RULE);
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
    assert.match(r.stdout, /^Usage: aof-tools milestone/);
    assert.deepEqual(project.tree(), treeBefore);
  });

  test('18. a non-writing command is untouched: find-objective 1 --zz-unknown exits 0', () => {
    const r = project.run(['find-objective', '1', UNKNOWN]);
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /unknown flag/);
  });

  describe('20. known flags of the group-2 commands are not reported', () => {
    const accepted = (r) => assert.doesNotMatch(r.stderr, /unknown flag/);

    test('migrate plan --dry-run', () => {
      accepted(project.run(['migrate', 'plan', '--dry-run']));
    });

    test('changelog update --dry-run --version v9.9.9', () => {
      accepted(project.run(['changelog', 'update', '--dry-run', '--version', 'v9.9.9']));
    });

    test('planning mode', () => {
      const r = project.run(['planning', 'mode']);
      accepted(r);
      assert.equal(r.status, 0, r.stderr);
    });

    test('exec-context check --repo <root>', () => {
      accepted(project.run(['exec-context', 'check', '--repo', project.root]));
    });
  });
});
