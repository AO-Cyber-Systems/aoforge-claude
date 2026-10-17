'use strict';

// Tests for scripts/release-tag.cjs (quick 34): the release step behind .github/workflows/release.yml.
//
// Three tag kinds reach it:
//   vX.Y.Z              core release; also ensures the alias tag aoforge--vX.Y.Z at the same commit,
//                       which is what the stack packs' `aoforge >=X.Y.Z` dependency resolves from
//   <pack>--vX.Y.Z      a plugin's own release, notes from plugins/<pack>/CHANGELOG.md, never Latest
//   aoforge--vX.Y.Z     the alias itself: nothing to do (the core release made it)
//
// runRelease takes an injected `exec`. Every test here passes a fake that records [cmd, ...args] and
// answers from a script, so no test runs a real `git push` or `gh`, and none runs the CLI against
// this repository. Fixture roots are hand-built in os.tmpdir().

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = path.join(__dirname, 'release-tag.cjs');
const RELEASE_YML = path.join(REPO, '.github', 'workflows', 'release.yml');

// Loaded per test, so a missing module fails each test with its own name.
const load = () => require('./release-tag.cjs');

const SHA = '1111111111111111111111111111111111111111';
const OTHER = '2222222222222222222222222222222222222222';

function put(root, rel, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

function fixtureRoot({ packChangelog = '# Changelog\n\n## [1.0.0] - Unreleased\n\n- the demo pack notes\n' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-tag-'));
  put(root, 'plugins/aoforge/.claude-plugin/plugin.json', JSON.stringify({ name: 'aoforge', version: '3.1.0' }));
  put(root, 'plugins/aoforge-stack-demo/.claude-plugin/plugin.json', JSON.stringify({ name: 'aoforge-stack-demo', version: '1.0.0' }));
  put(root, 'plugins/aoforge-stack-demo/CHANGELOG.md', packChangelog);
  put(root, 'CHANGELOG.md', [
    '# Changelog', '', '## [Unreleased]', '', '## [3.1.0] - Unreleased', '', '- core notes for 3.1.0', '',
    '## [3.0.0] - 2026-10-08', '', '- older notes', '',
  ].join('\n'));
  return root;
}

/**
 * fakeExec(script) -> { exec, calls, notes }. `script` is a list of [prefix, result]: the first
 * prefix that matches the start of [cmd, ...args] answers; anything unmatched succeeds with empty
 * output. A result may be an array: each matching call takes the next element, and the last one
 * repeats (quick 37, for the three ls-remote calls of a dry run). `notes` captures the --notes-file
 * content of each `gh release create`, read at call time (runRelease removes the file afterwards).
 */
function fakeExec(script = []) {
  const calls = [];
  const notes = [];
  const used = script.map(() => 0);
  const exec = (cmd, args) => {
    const call = [cmd, ...args];
    calls.push(call);
    if (cmd === 'gh' && args[0] === 'release' && args[1] === 'create') {
      const i = args.indexOf('--notes-file');
      notes.push(i >= 0 ? fs.readFileSync(args[i + 1], 'utf8') : null);
    }
    for (let s = 0; s < script.length; s++) {
      const [prefix, result] = script[s];
      if (!prefix.every((p, k) => call[k] === p)) continue;
      const answer = Array.isArray(result) ? result[Math.min(used[s], result.length - 1)] : result;
      used[s] += 1;
      return { status: 0, stdout: '', stderr: '', ...answer };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { exec, calls, notes };
}

/** The calls with the temp notes path replaced, so a sequence can be compared exactly. */
function normalized(calls) {
  return calls.map((c) => c.map((a, i) => (c[i - 1] === '--notes-file' ? '<notes>' : a)));
}

const TAG_COMMIT = ['git', 'rev-parse', 'refs/tags/v3.1.0^{commit}'];
const ALIAS_VERIFY = ['git', 'rev-parse', '--verify', '--quiet', 'refs/tags/aoforge--v3.1.0^{commit}'];
const RELEASE_VIEW = ['gh', 'release', 'view', 'v3.1.0'];
const SUBJECT = ['git', 'for-each-ref', '--format=%(contents:subject)', 'refs/tags/v3.1.0'];

function coreScript({ alias = null, released = false } = {}) {
  return [
    [TAG_COMMIT, { stdout: `${SHA}\n` }],
    [ALIAS_VERIFY, alias ? { stdout: `${alias}\n` } : { status: 1 }],
    [RELEASE_VIEW, released ? { stdout: 'title:\tAOForge 3.1.0\n' } : { status: 1, stderr: 'release not found' }],
    [SUBJECT, { stdout: 'AOForge 3.1.0\n' }],
  ];
}

const isCall = (prefix) => (c) => prefix.every((p, k) => c[k] === p);

describe('release.yml (text level)', () => {
  const yml = fs.readFileSync(RELEASE_YML, 'utf8');

  test('the tag filter lists both v* and *--v*', () => {
    const m = /^\s*tags:\s*\[([^\]]*)\]/m.exec(yml);
    assert.ok(m, 'expected a flow-style `tags: [...]` filter');
    const patterns = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    assert.ok(patterns.includes('v*'), `tags: ${m[1]}`);
    assert.ok(patterns.includes('*--v*'), `tags: ${m[1]}`);
  });

  test('a run step invokes node scripts/release-tag.cjs "$GITHUB_REF_NAME"', () => {
    assert.ok(runBlocks(yml).some((b) => b.includes('node scripts/release-tag.cjs "$GITHUB_REF_NAME"')),
      'no run: block calls the release script with the ref name from the environment');
  });

  test('contents: write is still declared', () => {
    assert.match(yml, /^\s*permissions:\s*\n\s*contents: write\s*$/m);
  });

  test('no ${{ github.ref_name }} is interpolated inside a run: block', () => {
    const blocks = runBlocks(yml);
    assert.ok(blocks.length > 0, 'release.yml has run: blocks');
    for (const b of blocks) assert.doesNotMatch(b, /\$\{\{\s*github\.ref(_name)?\s*\}\}/, b);
  });

  test('6: contents: write at the top level and in the job, and no other scope is granted write', () => {
    assert.match(yml, /^permissions:\n {2}contents: write\n(?=\n|#|[A-Za-z]|$)/m,
      'top-level block must be exactly "permissions:" / "  contents: write"');
    const jobs = yml.slice(yml.search(/^jobs:/m));
    assert.match(jobs, /^ {4}permissions:\n {6}contents: write\s*$/m, 'the release job keeps its own block');
    const writes = yml.split('\n').filter((l) => /^\s*[a-z-]+:\s*write\b/.test(l));
    assert.ok(writes.length >= 2, writes.join('\n'));
    for (const l of writes) assert.equal(l.trim(), 'contents: write', l);
    assert.doesNotMatch(yml, /write-all/);
  });

  test('7: workflow_dispatch dry_run input; release step push-only; dry-run step dispatch-only; no ${{ in any run:', () => {
    const on = yml.slice(yml.search(/^on:/m), yml.search(/^jobs:/m));
    assert.match(on, /^ {2}workflow_dispatch:\s*$/m, 'on: has workflow_dispatch');
    const input = block(on, /^ {6}dry_run:\s*$/m);
    assert.ok(input, 'workflow_dispatch has an input dry_run');
    assert.match(input, /^ {8}type: boolean\s*$/m, input);
    assert.match(input, /^ {8}default: true\s*$/m, input);

    const all = steps(yml);
    const release = all.filter((s) => s.includes('node scripts/release-tag.cjs "$GITHUB_REF_NAME"'));
    assert.equal(release.length, 1, 'one step runs the release');
    assert.match(release[0], /^\s*if: github\.event_name == 'push'\s*$/m, release[0]);

    const dry = all.filter((s) => /^\s*if: github\.event_name == 'workflow_dispatch'\s*$/m.test(s));
    assert.equal(dry.length, 1, 'one step runs on workflow_dispatch');
    const dryRun = runBlocks(dry[0]).join('\n');
    assert.ok(dryRun.includes('node scripts/release-tag.cjs --dry-run "$RUN_ID"'), dryRun);
    assert.match(dryRun, /"\$DRY_RUN" != "true"[\s\S]*exit 1/, 'dry_run: false exits 1');
    assert.match(dry[0], /^\s*RUN_ID: \$\{\{ github\.run_id \}\}\s*$/m, 'RUN_ID comes through env');
    assert.match(dry[0], /^\s*DRY_RUN: \$\{\{ inputs\.dry_run \}\}\s*$/m, 'DRY_RUN comes through env');

    const blocks = runBlocks(yml);
    assert.ok(blocks.length >= 2, 'release.yml has both run: blocks');
    for (const b of blocks) assert.ok(!b.includes('${{'), `a run: block interpolates \${{ }}:\n${b}`);
  });
});

/** The lines of the mapping that starts at `re` in `text`, up to the next line indented no deeper. */
function block(text, re) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => re.test(l));
  if (at === -1) return null;
  const indent = lines[at].search(/\S/);
  const out = [lines[at]];
  for (let j = at + 1; j < lines.length; j++) {
    if (lines[j].trim() !== '' && lines[j].search(/\S/) <= indent) break;
    out.push(lines[j]);
  }
  return out.join('\n');
}

/** Each `- ` item under the first `steps:` key, as text. */
function steps(yml) {
  const lines = yml.split('\n');
  const at = lines.findIndex((l) => /^\s*steps:\s*$/.test(l));
  if (at === -1) return [];
  const indent = lines[at].search(/\S/);
  const out = [];
  let current = null;
  for (let j = at + 1; j < lines.length; j++) {
    const line = lines[j];
    if (line.trim() !== '' && line.search(/\S/) <= indent && !/^\s*-\s/.test(line)) break;
    if (/^\s*-\s/.test(line) && line.search(/\S/) === indent + 2) {
      current = [line];
      out.push(current);
    } else if (current) {
      current.push(line);
    }
  }
  return out.map((s) => s.join('\n'));
}

/** The body of every `run:` key: an inline value, or the indented lines of a `|` / `>` block. */
function runBlocks(yml) {
  const lines = yml.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (!/^[|>]/.test(m[2])) { out.push(m[2]); continue; }
    const indent = m[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() !== '' && lines[j].search(/\S/) <= indent) break;
      body.push(lines[j]);
    }
    out.push(body.join('\n'));
  }
  return out;
}

describe('runRelease (fake exec)', () => {
  test('v3.1.0, alias absent: tag commit, alias verify, tag + push the alias, release view, title, create', () => {
    const root = fixtureRoot();
    try {
      const { exec, calls, notes } = fakeExec(coreScript());
      const r = load().runRelease('v3.1.0', { root, exec, log: () => {} });
      assert.deepEqual(normalized(calls), [
        TAG_COMMIT,
        ALIAS_VERIFY,
        ['git', 'tag', 'aoforge--v3.1.0', SHA],
        ['git', 'push', 'origin', 'refs/tags/aoforge--v3.1.0'],
        RELEASE_VIEW,
        SUBJECT,
        ['gh', 'release', 'create', 'v3.1.0', '--title', 'AOForge 3.1.0', '--notes-file', '<notes>'],
      ]);
      assert.ok(!calls.flat().includes('--latest=false'), 'a core release may become Latest');
      assert.equal(notes.length, 1);
      assert.match(notes[0], /core notes for 3\.1\.0/);
      assert.doesNotMatch(notes[0], /older notes/);
      assert.equal(r.action, 'created');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('alias already at the tag commit: no tag and no push; at another commit: throws naming both shas, no release', () => {
    const root = fixtureRoot();
    try {
      const same = fakeExec(coreScript({ alias: SHA }));
      load().runRelease('v3.1.0', { root, exec: same.exec, log: () => {} });
      assert.ok(!same.calls.some(isCall(['git', 'tag'])), 'no git tag');
      assert.ok(!same.calls.some(isCall(['git', 'push'])), 'no git push');
      assert.ok(same.calls.some(isCall(['gh', 'release', 'create', 'v3.1.0'])), 'the release is still created');

      const moved = fakeExec(coreScript({ alias: OTHER }));
      assert.throws(() => load().runRelease('v3.1.0', { root, exec: moved.exec, log: () => {} }),
        (e) => e.message.includes(SHA) && e.message.includes(OTHER) && e.message.includes('aoforge--v3.1.0'));
      assert.ok(!moved.calls.some(isCall(['git', 'tag'])), 'no git tag');
      assert.ok(!moved.calls.some(isCall(['git', 'push'])), 'no git push');
      assert.ok(!moved.calls.some(isCall(['gh', 'release', 'create'])), 'no release');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('release already exists: the alias is still ensured and gh release create is not called', () => {
    const root = fixtureRoot();
    try {
      const { exec, calls } = fakeExec(coreScript({ released: true }));
      const r = load().runRelease('v3.1.0', { root, exec, log: () => {} });
      assert.ok(calls.some(isCall(['git', 'tag', 'aoforge--v3.1.0', SHA])));
      assert.ok(calls.some(isCall(['git', 'push', 'origin', 'refs/tags/aoforge--v3.1.0'])));
      assert.ok(!calls.some(isCall(['gh', 'release', 'create'])));
      assert.equal(r.action, 'exists');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a pack tag releases from the pack CHANGELOG with --latest=false and makes no alias', () => {
    const root = fixtureRoot();
    try {
      const view = ['gh', 'release', 'view', 'aoforge-stack-demo--v1.0.0'];
      const { exec, calls, notes } = fakeExec([[view, { status: 1 }]]);
      const r = load().runRelease('aoforge-stack-demo--v1.0.0', { root, exec, log: () => {} });
      assert.deepEqual(normalized(calls), [
        view,
        ['git', 'for-each-ref', '--format=%(contents:subject)', 'refs/tags/aoforge-stack-demo--v1.0.0'],
        ['gh', 'release', 'create', 'aoforge-stack-demo--v1.0.0', '--title', 'aoforge-stack-demo--v1.0.0',
          '--notes-file', '<notes>', '--latest=false'],
      ]);
      assert.equal(notes[0].trim(), '- the demo pack notes');
      assert.equal(r.action, 'created');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a CHANGELOG without the version heading falls back to --generate-notes', () => {
    const root = fixtureRoot({ packChangelog: '# Changelog\n\n## [0.9.0] - 2026-01-01\n\n- old\n' });
    try {
      const { exec, calls } = fakeExec([[['gh', 'release', 'view'], { status: 1 }]]);
      load().runRelease('aoforge-stack-demo--v1.0.0', { root, exec, log: () => {} });
      const create = calls.find(isCall(['gh', 'release', 'create']));
      assert.ok(create.includes('--generate-notes'), create.join(' '));
      assert.ok(!create.includes('--notes-file'), create.join(' '));
      assert.ok(create.includes('--latest=false'), create.join(' '));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('aoforge--v3.1.0 performs no exec call and returns action skip', () => {
    const root = fixtureRoot();
    try {
      const { exec, calls } = fakeExec();
      const r = load().runRelease('aoforge--v3.1.0', { root, exec, log: () => {} });
      assert.equal(calls.length, 0);
      assert.equal(r.action, 'skip');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// The dry run (quick 37): `release.yml` on workflow_dispatch pushes a throwaway core-prefixed tag at HEAD,
// checks origin has it, deletes it, and creates no release.
const DRY_TAG = 'aoforge--v0.0.0-dryrun-4242';
const DRY_REF = `refs/tags/${DRY_TAG}`;
const HEAD = ['git', 'rev-parse', 'HEAD^{commit}'];
const LS_REMOTE = ['git', 'ls-remote', '--tags', 'origin', DRY_REF];
const TAG_CREATE = ['git', 'tag', DRY_TAG, SHA];
const PUSH = ['git', 'push', 'origin', DRY_REF];
const DELETE = ['git', 'push', 'origin', '--delete', DRY_REF];
const TAG_DELETE = ['git', 'tag', '-d', DRY_TAG];

/** ls-remote answers: absent before the push, present after it, absent after the delete. */
function dryScript({ lsRemote = [{ stdout: '' }, { stdout: `${SHA}\t${DRY_REF}\n` }, { stdout: '' }], extra = [] } = {}) {
  return [[HEAD, { stdout: `${SHA}\n` }], [LS_REMOTE, lsRemote], ...extra];
}

describe('runDryRun (fake exec)', () => {
  test('8: the eight calls in order, never gh, and every step reported done', () => {
    const root = fixtureRoot();
    try {
      const { exec, calls } = fakeExec(dryScript());
      const r = load().runDryRun('4242', { root, exec, log: () => {} });
      assert.deepEqual(calls, [HEAD, LS_REMOTE, TAG_CREATE, PUSH, LS_REMOTE, DELETE, LS_REMOTE, TAG_DELETE]);
      assert.ok(!calls.some((c) => c[0] === 'gh'), 'no gh call');
      assert.deepEqual(r, { action: 'dry-run', tag: DRY_TAG, sha: SHA, pushed: true, verified: true, deleted: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('9: a refused push throws, naming the tag and quoting stderr; no verify, no delete, the local tag is removed', () => {
    const root = fixtureRoot();
    try {
      const stderr = `GH013: Repository rule violations found for ${DRY_REF}`;
      const { exec, calls } = fakeExec(dryScript({ extra: [[PUSH, { status: 1, stderr }]] }));
      assert.throws(() => load().runDryRun('4242', { root, exec, log: () => {} }),
        (e) => e.message.includes(DRY_TAG) && e.message.includes(stderr), 'message names the tag and quotes stderr');
      assert.deepEqual(calls, [HEAD, LS_REMOTE, TAG_CREATE, PUSH, TAG_DELETE]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('10: a push that origin does not show still deletes and cleans up, then throws', () => {
    const root = fixtureRoot();
    try {
      const absent = fakeExec(dryScript({ lsRemote: [{ stdout: '' }, { stdout: '' }, { stdout: '' }] }));
      assert.throws(() => load().runDryRun('4242', { root, exec: absent.exec, log: () => {} }),
        (e) => e.message.includes(DRY_TAG) && e.message.includes('did not reach origin'), 'absent');
      assert.deepEqual(absent.calls, [HEAD, LS_REMOTE, TAG_CREATE, PUSH, LS_REMOTE, DELETE, LS_REMOTE, TAG_DELETE]);

      const moved = fakeExec(dryScript({ lsRemote: [{ stdout: '' }, { stdout: `${OTHER}\t${DRY_REF}\n` }, { stdout: '' }] }));
      assert.throws(() => load().runDryRun('4242', { root, exec: moved.exec, log: () => {} }),
        (e) => e.message.includes(SHA) && e.message.includes(OTHER) && e.message.includes('did not reach origin'), 'other sha');
      assert.deepEqual(moved.calls, [HEAD, LS_REMOTE, TAG_CREATE, PUSH, LS_REMOTE, DELETE, LS_REMOTE, TAG_DELETE]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('11: a refused delete throws with the exact cleanup command; so does a tag still on origin after it', () => {
    const root = fixtureRoot();
    const cleanup = `git push origin --delete ${DRY_REF}`;
    try {
      const refused = fakeExec(dryScript({ extra: [[DELETE, { status: 1, stderr: 'GH013: deletion restricted' }]] }));
      assert.throws(() => load().runDryRun('4242', { root, exec: refused.exec, log: () => {} }),
        (e) => e.message.includes(cleanup) && e.message.includes(DRY_TAG), 'refused delete');
      assert.ok(refused.calls.some(isCall(TAG_DELETE)), 'the local tag is still removed');

      const left = fakeExec(dryScript({
        lsRemote: [{ stdout: '' }, { stdout: `${SHA}\t${DRY_REF}\n` }, { stdout: `${SHA}\t${DRY_REF}\n` }],
      }));
      assert.throws(() => load().runDryRun('4242', { root, exec: left.exec, log: () => {} }),
        (e) => e.message.includes(cleanup), 'tag still listed after the delete');
      assert.ok(left.calls.some(isCall(TAG_DELETE)), 'the local tag is still removed');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('12: a dry-run tag already on origin is refused before any tag, push or delete', () => {
    const root = fixtureRoot();
    try {
      const { exec, calls } = fakeExec(dryScript({ lsRemote: [{ stdout: `${OTHER}\t${DRY_REF}\n` }] }));
      assert.throws(() => load().runDryRun('4242', { root, exec, log: () => {} }),
        (e) => e.message.includes(DRY_TAG) && e.message.includes('already on origin'));
      assert.deepEqual(calls, [HEAD, LS_REMOTE]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('13: a malformed run id throws before any exec call', () => {
    const root = fixtureRoot();
    try {
      for (const runId of ['', undefined, 'abc', '12;rm -rf /', '-1']) {
        const { exec, calls } = fakeExec(dryScript());
        assert.throws(() => load().runDryRun(runId, { root, exec, log: () => {} }), /run id/, String(runId));
        assert.equal(calls.length, 0, `no exec call for ${JSON.stringify(runId)}`);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('parseTag and planTag', () => {
  test('14: a dry-run tag parses with its run id, plans as dry-run, is skipped by runRelease, and is core-only', () => {
    const root = fixtureRoot();
    try {
      const { parseTag, planTag, runRelease, dryRunTag } = load();
      assert.equal(dryRunTag('aoforge', '4242'), DRY_TAG);
      assert.deepEqual(parseTag(DRY_TAG), { plugin: 'aoforge', version: '0.0.0', dry_run: '4242' });
      assert.ok(!('dry_run' in parseTag('v3.1.0')), 'a core tag has no dry_run key');
      assert.ok(!('dry_run' in parseTag('aoforge-stack-demo--v1.0.0')), 'a pack tag has no dry_run key');
      assert.equal(planTag(DRY_TAG, { root }).kind, 'dry-run');

      const { exec, calls } = fakeExec();
      const r = runRelease(DRY_TAG, { root, exec, log: () => {} });
      assert.equal(r.action, 'skip');
      assert.equal(calls.length, 0);

      assert.throws(() => planTag('aoforge-stack-demo--v0.0.0-dryrun-1', { root }),
        (e) => e.message.includes('aoforge-stack-demo--v0.0.0-dryrun-1'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('parseTag reads the two tag forms and nothing else', () => {
    const { parseTag } = load();
    assert.deepEqual(parseTag('v3.1.0'), { plugin: null, version: '3.1.0' });
    assert.deepEqual(parseTag('aoforge-stack-demo--v1.0.0'), { plugin: 'aoforge-stack-demo', version: '1.0.0' });
    assert.equal(parseTag('v3.1'), null);
    assert.equal(parseTag('release-1'), null);
  });

  test('planTag gives the core, alias and pack plans', () => {
    const root = fixtureRoot();
    try {
      const { planTag } = load();
      assert.deepEqual(planTag('v3.1.0', { root }), {
        kind: 'core', tag: 'v3.1.0', plugin: 'aoforge', version: '3.1.0', changelog: 'CHANGELOG.md', alias: 'aoforge--v3.1.0', latest: true,
      });
      assert.equal(planTag('aoforge--v3.1.0', { root }).kind, 'core-alias');
      assert.deepEqual(planTag('aoforge-stack-demo--v1.0.0', { root }), {
        kind: 'pack', tag: 'aoforge-stack-demo--v1.0.0', plugin: 'aoforge-stack-demo', version: '1.0.0',
        changelog: 'plugins/aoforge-stack-demo/CHANGELOG.md', alias: null, latest: false,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('planTag throws, naming the tag, for an unknown plugin, a version mismatch, a short version and a non-release tag', () => {
    const root = fixtureRoot();
    try {
      const { planTag } = load();
      for (const tag of ['nosuch--v1.0.0', 'aoforge-stack-demo--v9.9.9', 'v3.0.9', 'v3.1', 'release-1']) {
        assert.throws(() => planTag(tag, { root }), (e) => e.message.includes(tag), tag);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('releaseNotes', () => {
  test('extracts the body under the version heading up to the next ## [', () => {
    const text = '# Changelog\n\n## [1.0.0] - Unreleased\n\n- first\n- second\n\n## [0.9.0] - 2026-01-01\n\n- old\n';
    assert.equal(load().releaseNotes(text, '1.0.0'), '- first\n- second');
  });

  test('the version is literal: 1.0.0 does not match ## [1x0x0]', () => {
    assert.equal(load().releaseNotes('# Changelog\n\n## [1x0x0] - 2026-01-01\n\n- wrong\n', '1.0.0'), '');
  });

  test('a missing heading gives an empty string', () => {
    assert.equal(load().releaseNotes('# Changelog\n\n## [0.9.0]\n\n- old\n', '1.0.0'), '');
  });

  test('this repository: the CHANGELOG has notes for the package.json version', () => {
    const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
    const text = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
    assert.notEqual(load().releaseNotes(text, version), '', `CHANGELOG.md has no notes under ## [${version}]`);
  });
});

describe('CLI', () => {
  test('a tag that is not a release tag exits 1 before any git or gh call, naming the tag', () => {
    const root = fixtureRoot();
    try {
      const r = spawnSync(process.execPath, [SCRIPT, 'release-1'], { cwd: root, encoding: 'utf8' });
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stderr, /release-1/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('15: --dry-run with no run id, or a non-numeric one, exits 1 naming the run id before any git call', () => {
    const root = fixtureRoot();
    try {
      for (const args of [['--dry-run'], ['--dry-run', 'abc']]) {
        // The fixture root is not a git repository, so a git call would fail with git's own message.
        const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
        assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}`);
        assert.match(r.stderr, /^release-tag: .*run id/m, r.stderr);
        assert.doesNotMatch(r.stderr, /rev-parse|not a git repository/, r.stderr);
        assert.equal(r.stdout, '', 'nothing printed as a result');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
