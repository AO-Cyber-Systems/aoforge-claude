'use strict';

// Tests for scripts/ci-visual-judge.cjs (TRD 74-01), the CI assertion that the live visual
// judge really looked at the fixture screenshots.
//
// NO TEST MAKES A NETWORK CALL. The CLI cases inject `{ env, spawn, readFile, out, err }` into
// main(): env is a hand-built object (never process.env) and spawn is a stub, so the live judge
// is never started. The one case that runs the real CLI (case 17) runs `--judge labels` with
// ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL stripped from its environment.
//
// Every rollup comes from the hand-written builders in __fixtures__/visual-judge-rollups.cjs.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'ci-visual-judge.cjs');
const {
  MANIFEST_PATH,
} = require('./__fixtures__/visual-judge-rollups.cjs');

// A value shaped like nothing real. It must never appear in anything the script prints.
const FAKE_CREDENTIAL = 'test-only-not-a-key';

/**
 * Injected dependencies for main(). `spawnResult` is what the stubbed spawn returns (an
 * object, or a function of (cmd, args, opts)); `files` serves readFile by path, anything else
 * falls through to the real filesystem (the committed fixture manifest).
 */
function harness({ env = { ANTHROPIC_API_KEY: FAKE_CREDENTIAL }, spawnResult, files = {} } = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const deps = {
    env,
    spawn(cmd, args, opts) {
      calls.push({ cmd, args, opts });
      return typeof spawnResult === 'function' ? spawnResult(cmd, args, opts) : spawnResult;
    },
    readFile(p, enc) {
      if (Object.prototype.hasOwnProperty.call(files, p)) return files[p];
      return fs.readFileSync(p, enc);
    },
    out: (s) => out.push(String(s)),
    err: (s) => err.push(String(s)),
  };
  return { deps, calls, stdout: () => out.join(''), stderr: () => err.join('') };
}

function loadScript() {
  return require(SCRIPT);
}

describe('ci-visual-judge main()', () => {
  test('1. no ANTHROPIC_API_KEY and no ANTHROPIC_AUTH_TOKEN: exit 1, names both, never spawns', () => {
    const { main } = loadScript();
    const h = harness({ env: { PATH: '/usr/bin' } });
    const code = main([MANIFEST_PATH], h.deps);
    assert.equal(code, 1);
    assert.match(h.stderr(), /ANTHROPIC_API_KEY/);
    assert.match(h.stderr(), /ANTHROPIC_AUTH_TOKEN/);
    assert.match(h.stderr(), /repository secret/);
    assert.equal(h.calls.length, 0, 'the judge must not be started without a credential');
  });
});
