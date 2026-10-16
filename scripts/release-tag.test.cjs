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
 * output. `notes` captures the --notes-file content of each `gh release create`, read at call time
 * (runRelease removes the file afterwards).
 */
function fakeExec(script = []) {
  const calls = [];
  const notes = [];
  const exec = (cmd, args) => {
    const call = [cmd, ...args];
    calls.push(call);
    if (cmd === 'gh' && args[0] === 'release' && args[1] === 'create') {
      const i = args.indexOf('--notes-file');
      notes.push(i >= 0 ? fs.readFileSync(args[i + 1], 'utf8') : null);
    }
    for (const [prefix, result] of script) {
      if (prefix.every((p, k) => call[k] === p)) return { status: 0, stdout: '', stderr: '', ...result };
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
});

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

describe('parseTag and planTag', () => {
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
});
