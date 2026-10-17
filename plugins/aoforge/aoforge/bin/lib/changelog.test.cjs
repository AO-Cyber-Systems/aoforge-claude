'use strict';

// Test list (TRD 54-07: hasVersionEntry escapes the version with the shared escapeRegExp):
//
//   8. `## [1.0.0+build.1] - 2026-10-04` -> hasVersionEntry(dir, '1.0.0+build.1') is true (the unescaped `+` made it false)
//   9. same file -> hasVersionEntry(dir, '1.0.0') is false (a bare version is not the build version)
//   10. `## [1.0.0-rc.1] - 2026-10-04` -> hasVersionEntry(dir, '1.0.0-rc.1') is true (guard)
//   11. `## [401.0.0]` only -> '4.1.0' is false; `## [4.1.0]` -> true (guard: dots stay literal)
//   12. no CHANGELOG.md -> false (guard)
// (numbered 8-12 to match the TRD's test list)

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { hasVersionEntry } = require('./changelog.cjs');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function writeChangelog(body) {
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), `# Changelog\n\n${body}\n`, 'utf-8');
}

test('8. a +build version finds its own entry', () => {
  writeChangelog('## [1.0.0+build.1] - 2026-10-04\n\n### Added\n\n- thing\n');
  assert.equal(hasVersionEntry(dir, '1.0.0+build.1'), true);
});

test('9. the bare version is not the +build entry', () => {
  writeChangelog('## [1.0.0+build.1] - 2026-10-04\n\n### Added\n\n- thing\n');
  assert.equal(hasVersionEntry(dir, '1.0.0'), false);
});

test('10. a -rc pre-release version finds its own entry (guard)', () => {
  writeChangelog('## [1.0.0-rc.1] - 2026-10-04\n\n### Added\n\n- thing\n');
  assert.equal(hasVersionEntry(dir, '1.0.0-rc.1'), true);
});

test('11. dots are literal: 4.1.0 does not match 401.0.0 but matches its own entry (guard)', () => {
  writeChangelog('## [401.0.0] - 2026-10-04\n\n- other\n');
  assert.equal(hasVersionEntry(dir, '4.1.0'), false);

  writeChangelog('## [401.0.0] - 2026-10-04\n\n- other\n\n## [4.1.0] - 2026-10-03\n\n- mine\n');
  assert.equal(hasVersionEntry(dir, '4.1.0'), true);
});

test('12. no CHANGELOG.md -> false (guard)', () => {
  assert.equal(hasVersionEntry(dir, '1.0.0'), false);
});

// Quick 34: a pack tag (`<pack>--vX.Y.Z`) between two core releases must not become the previous
// release, or `changelog update` covers only the commits since the pack tag. Hand-built temp repos;
// the git calls run inside node, so the tag gate never sees them.

const { spawnSync, execFileSync } = require('child_process');
const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

function git(...args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args],
    { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commit(subject) {
  fs.writeFileSync(path.join(dir, 'f.txt'), subject);
  git('add', '-A');
  git('commit', '-qm', subject);
}

/** v1.0.0, then a commit, a lightweight pack tag, and another commit. */
function historyWithPackTag() {
  git('init', '-q', '.');
  commit('feat: one');
  git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0');
  commit('fix: two');
  git('tag', 'aoforge-stack-demo--v1.0.0');
  commit('feat: three');
}

function dryRun(...args) {
  const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', dir, 'changelog', 'update', ...args, '--dry-run'], { encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
  let out = r.stdout.trim();
  if (out.startsWith('@file:')) out = fs.readFileSync(out.slice('@file:'.length), 'utf-8');
  return JSON.parse(out);
}

test('13. a pack tag after the last core tag is not the previous release (HEAD range)', () => {
  historyWithPackTag();
  const r = dryRun('--version', 'v1.1.0');
  assert.equal(r.from, 'v1.0.0');
  assert.equal(r.commit_count, 2);
});

test('14. --to <v-tag> past a pack tag starts at the previous core tag', () => {
  historyWithPackTag();
  git('tag', '-a', 'v1.1.0', '-m', 'v1.1.0');
  const r = dryRun('--version', 'v1.1.0', '--to', 'v1.1.0');
  assert.equal(r.from, 'v1.0.0');
  assert.equal(r.commit_count, 2);
});
