'use strict';

// Tests for scripts/tag-rules.cjs (quick 37): a read-only inspector of the repository rulesets that
// apply to a tag. GitHub has a rules-for-a-branch endpoint but none for a tag, so the script lists
// the tag-target rulesets (inherited ones included), reads each, and matches its ref_name conditions
// against refs/tags/<tag> locally.
//
// `run` takes an injected `exec`. Every test passes a fake that records [cmd, ...args] and answers
// from a script, so no test reaches GitHub. Rulesets are hand-built with `ruleset({...})`, in the
// shape `GET repos/{owner}/{repo}/rulesets/{id}` returns.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

// Loaded per test, so a missing module fails each test with its own name.
const load = () => require('./tag-rules.cjs');

function ruleset({ id, target = 'tag', enforcement = 'active', include, exclude = [], rules = ['creation'], ...rest }) {
  return {
    id,
    name: `ruleset ${id}`,
    target,
    source_type: 'Repository',
    source: 'o/r',
    enforcement,
    conditions: { ref_name: { include, exclude } },
    rules: rules.map((type) => ({ type })),
    current_user_can_bypass: 'never',
    ...rest,
  };
}

/** fakeExec(script) -> { exec, calls }: the first [prefix, result] whose prefix starts the call answers. */
function fakeExec(script = []) {
  const calls = [];
  const exec = (cmd, args) => {
    const call = [cmd, ...args];
    calls.push(call);
    for (const [prefix, result] of script) {
      if (prefix.every((p, k) => call[k] === p)) return { status: 0, stdout: '', stderr: '', ...result };
    }
    return { status: 1, stdout: '', stderr: `unexpected call: ${call.join(' ')}` };
  };
  return { exec, calls };
}

const WRITE_FLAGS = ['-X', '--method', '-f', '-F', '--field', '--raw-field', '--input'];

describe('refMatches', () => {
  test('16: fnmatch semantics for ruleset ref_name patterns against a full tag ref', () => {
    const { refMatches } = load();
    assert.equal(refMatches('refs/tags/aoforge--v3.1.0', 'refs/tags/aoforge--v*'), true);
    assert.equal(refMatches('refs/tags/aoforge--v0.0.0-dryrun-1', 'refs/tags/aoforge--v*'), true);
    assert.equal(refMatches('refs/tags/aoforge--v3.1.0', 'refs/tags/v*'), false);
    assert.equal(refMatches('refs/tags/v3.1.0', 'refs/tags/v*'), true);

    assert.equal(refMatches('refs/tags/anything', '~ALL'), true);
    assert.equal(refMatches('refs/tags/a/b', '~ALL'), true);
    assert.equal(refMatches('refs/tags/v3.1.0', '~DEFAULT_BRANCH'), false, '~DEFAULT_BRANCH is branch-only');

    assert.equal(refMatches('refs/tags/a/b', 'refs/tags/*'), false, '* stops at /');
    assert.equal(refMatches('refs/tags/a/b', 'refs/tags/**'), true, '** crosses /');
    assert.equal(refMatches('refs/tags/ab', 'refs/tags/*'), true);

    assert.equal(refMatches('refs/tags/v1.0', 'refs/tags/v?.0'), true, '? is one character');
    assert.equal(refMatches('refs/tags/v10.0', 'refs/tags/v?.0'), false);
    assert.equal(refMatches('refs/tags/v.0', 'refs/tags/v?.0'), false);

    assert.equal(refMatches('refs/tags/v1x0', 'refs/tags/v1.0'), false, '. is literal');
    assert.equal(refMatches('refs/tags/v1.0', 'refs/tags/v1.0'), true);
    assert.equal(refMatches('refs/tags/aab', 'refs/tags/a+b'), false, '+ is literal');
    assert.equal(refMatches('refs/tags/a+b', 'refs/tags/a+b'), true);
    assert.equal(refMatches('refs/tags/(x)', 'refs/tags/(x)'), true, '( is literal');
    assert.equal(refMatches('refs/tags/x', 'refs/tags/(x)'), false);
  });
});

describe('matchingRulesets', () => {
  test('17: include without a matching exclude hits; exclude wins; disabled and branch rulesets drop; evaluate stays', () => {
    const { matchingRulesets } = load();
    const sets = [
      ruleset({ id: 1, include: ['refs/tags/aoforge--v*'], rules: ['creation', 'deletion', 'update'] }),
      ruleset({ id: 2, include: ['~ALL'], exclude: ['refs/tags/aoforge--v0.0.0-dryrun-*'] }),
      ruleset({ id: 3, include: ['~ALL'], enforcement: 'disabled' }),
      ruleset({ id: 4, include: ['~ALL'], target: 'branch' }),
      ruleset({ id: 5, include: ['refs/tags/aoforge--*'], enforcement: 'evaluate',
        bypass_actors: [{ actor_id: 15368, actor_type: 'Integration', bypass_mode: 'always' }] }),
      ruleset({ id: 6, include: ['refs/tags/v*'] }),
    ];

    const dry = matchingRulesets('aoforge--v0.0.0-dryrun-1', sets);
    assert.deepEqual(dry.map((h) => h.id), [1, 5], 'exclude wins for 2; 3 disabled, 4 branch, 6 no include');

    const release = matchingRulesets('aoforge--v3.1.0', sets);
    assert.deepEqual(release.map((h) => h.id), [1, 2, 5]);
    assert.deepEqual(release[0], {
      id: 1, name: 'ruleset 1', source_type: 'Repository', source: 'o/r', enforcement: 'active',
      rules: ['creation', 'deletion', 'update'], current_user_can_bypass: 'never', bypass_actors: null,
    });
    assert.equal(release[2].enforcement, 'evaluate');
    assert.deepEqual(release[2].bypass_actors, [{ actor_id: 15368, actor_type: 'Integration', bypass_mode: 'always' }]);

    assert.deepEqual(matchingRulesets('v3.1.0', sets).map((h) => h.id), [2, 6]);
  });
});

describe('run', () => {
  const LIST = 'repos/o/r/rulesets?targets=tag&includes_parents=true&per_page=100';
  const script = (prefix = 'repos/o/r') => [
    [['gh', 'api', `${prefix}/rulesets?targets=tag&includes_parents=true&per_page=100`],
      { stdout: JSON.stringify([{ id: 1 }, { id: 2 }]) }],
    [['gh', 'api', `${prefix}/rulesets/1`], { stdout: JSON.stringify(ruleset({ id: 1, include: ['refs/tags/aoforge--v*'] })) }],
    [['gh', 'api', `${prefix}/rulesets/2`], { stdout: JSON.stringify(ruleset({ id: 2, include: ['refs/tags/v*'] })) }],
  ];

  test('18: one list call (targets=tag, includes_parents=true), one GET per ruleset, and only GETs', () => {
    const { run } = load();
    const { exec, calls } = fakeExec(script());
    const r = run(['--repo', 'o/r', 'aoforge--v3.1.0'], { exec });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(calls, [
      ['gh', 'api', LIST],
      ['gh', 'api', 'repos/o/r/rulesets/1'],
      ['gh', 'api', 'repos/o/r/rulesets/2'],
    ]);
    for (const c of calls) {
      assert.deepEqual(c.slice(0, 2), ['gh', 'api']);
      for (const flag of WRITE_FLAGS) assert.ok(!c.includes(flag), `${c.join(' ')} carries ${flag}`);
    }
    assert.match(r.stdout, /aoforge--v3\.1\.0/);
    assert.match(r.stdout, /1 "ruleset 1" \(Repository o\/r, active\): creation; you can bypass: never; bypass actors: not visible/);
    assert.doesNotMatch(r.stdout, /"ruleset 2"/);
  });

  test('18: without --repo the paths carry the literal {owner}/{repo} for gh to fill in', () => {
    const { run } = load();
    const { exec, calls } = fakeExec(script('repos/{owner}/{repo}'));
    const r = run(['other-1'], { exec });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((c) => c[2].startsWith('repos/{owner}/{repo}/rulesets')), JSON.stringify(calls));
    assert.match(r.stdout, /other-1/);
    assert.match(r.stdout, /no tag ruleset matches/);
  });

  test('18: --json prints one entry per tag with its hits', () => {
    const { run } = load();
    const { exec } = fakeExec(script());
    const r = run(['--repo', 'o/r', '--json', 'aoforge--v3.1.0', 'v3.1.0'], { exec });
    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.map((t) => [t.tag, t.rulesets.map((h) => h.id)]), [['aoforge--v3.1.0', [1]], ['v3.1.0', [2]]]);
  });

  test('18: a gh failure exits 1 with its stderr; no tag is a usage error', () => {
    const { run } = load();
    const failing = fakeExec([[['gh', 'api'], { status: 1, stderr: 'gh: Not Found (HTTP 404)' }]]);
    const r = run(['--repo', 'o/r', 'aoforge--v3.1.0'], { exec: failing.exec });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Not Found \(HTTP 404\)/);

    const none = fakeExec(script());
    const usage = run(['--repo', 'o/r'], { exec: none.exec });
    assert.equal(usage.code, 1);
    assert.match(usage.stderr, /usage/i);
    assert.equal(none.calls.length, 0);
  });
});
