'use strict';

/**
 * Self-test for the `gh` PATH shim fixture (TRD 46-01, test 21).
 *
 * The shim is for CLI-level tests that spawn a real `df-tools` process; unit tests use
 * gh-client `_setRunGh` instead. These tests prove the shim answers from its canned table and
 * records argv, so nothing built on it can reach GitHub. Every spawn here sets PATH to the
 * shim's bin dir first, so even a machine with a real `gh` installed never runs it.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { installGhShim } = require('./__fixtures__/gh-shim.cjs');

const shims = [];

function install(opts) {
  const shim = installGhShim(opts);
  shims.push(shim);
  return shim;
}

function gh(shim, args) {
  return spawnSync('gh', args, { env: shim.env(), encoding: 'utf-8' });
}

afterEach(() => {
  while (shims.length) shims.pop().cleanup();
});

describe('installGhShim', () => {
  it('21. answers a canned argv, exits 1 with a no-match message otherwise, and records every call in order', () => {
    const shim = install({ table: { 'issue view 7': { code: 0, stdout: '{"number":7}' } } });

    const hit = gh(shim, ['issue', 'view', '7']);
    assert.equal(hit.status, 0);
    assert.equal(hit.stdout, '{"number":7}');

    const miss = gh(shim, ['issue', 'view', '99']);
    assert.equal(miss.status, 1);
    assert.match(miss.stderr, /\[gh-shim\] no match: issue view 99/);
    assert.equal(miss.stdout, '');

    assert.deepEqual(shim.readCalls(), [['issue', 'view', '7'], ['issue', 'view', '99']]);
    assert.equal(fs.existsSync(shim.callsFile), true);
  });

  it('21b. the longest matching key prefix wins, so query strings can follow a table key', () => {
    const shim = install({
      table: {
        'api repos/o/r/issues': { code: 0, stdout: 'short' },
        'api repos/o/r/issues/1/comments': { code: 0, stdout: 'long' },
      },
    });
    assert.equal(gh(shim, ['api', 'repos/o/r/issues/1/comments?per_page=100&page=2']).stdout, 'long');
    assert.equal(gh(shim, ['api', 'repos/o/r/issues?state=all']).stdout, 'short');
    assert.equal(gh(shim, ['api', 'repos/o/r/issues/1/comments']).stdout, 'long', 'exact key is used as-is');
  });

  it('21c. passes stderr and a non-zero code through; defaultCode controls the unmatched exit', () => {
    const shim = install({
      table: { 'issue create': { code: 1, stderr: 'HTTP 403: You have exceeded a secondary rate limit' } },
      defaultCode: 7,
    });
    const denied = gh(shim, ['issue', 'create', '--title', 't']);
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /secondary rate limit/);

    const unmatched = gh(shim, ['label', 'list']);
    assert.equal(unmatched.status, 7);
    assert.match(unmatched.stderr, /\[gh-shim\] no match: label list/);
  });

  it('21d. setTable swaps the canned answers between calls', () => {
    const shim = install({ table: { 'auth status': { code: 1, stderr: 'not logged in' } } });
    assert.equal(gh(shim, ['auth', 'status']).status, 1);
    shim.setTable({ 'auth status': { code: 0, stdout: 'Logged in' } });
    const after = gh(shim, ['auth', 'status']);
    assert.equal(after.status, 0);
    assert.equal(after.stdout, 'Logged in');
    assert.equal(shim.readCalls().length, 2);
  });

  it('21e. env() puts the shim first on PATH and points HOME and the gh cache at temp dirs', () => {
    const shim = install({ table: {} });
    const env = shim.env({ EXTRA_FLAG: '1' });
    assert.equal(env.PATH.split(path.delimiter)[0], shim.binDir);
    assert.equal(env.EXTRA_FLAG, '1');
    assert.notEqual(env.HOME, os.homedir());
    assert.equal(env.HOME.startsWith(shim.dir), true);
    assert.equal(env.DEVFLOW_GH_CACHE_DIR.startsWith(shim.dir), true);
    assert.equal(fs.statSync(env.HOME).isDirectory(), true);

    // extra wins over the defaults
    assert.equal(shim.env({ HOME: '/elsewhere' }).HOME, '/elsewhere');
  });

  it('21f. uses a caller-supplied dir, and readCalls() is empty before any call', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-shim-given-'));
    const shim = install({ dir, table: { '--version': { code: 0, stdout: 'gh version 0.0.0 (shim)' } } });
    assert.equal(shim.dir, dir);
    assert.equal(shim.binDir, path.join(dir, 'bin'));
    assert.deepEqual(shim.readCalls(), []);
    assert.equal(gh(shim, ['--version']).stdout, 'gh version 0.0.0 (shim)');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
