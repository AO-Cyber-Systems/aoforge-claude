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
