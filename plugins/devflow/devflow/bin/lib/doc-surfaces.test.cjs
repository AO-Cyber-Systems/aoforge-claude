'use strict';

// doc-surfaces.test.cjs — TRD 38-11 tests 8-9.
//
// Pins the wiring itself, not just the behavior: `df-tools telemetry` and its
// documentation-advisory surfacing in `/devflow:status` are reachable, not merely
// documented. Read-only — this test never writes to the repo.
//
// Test list:
// 8. progress.md contains `df-tools.cjs validate docs --raw` and a `## Documentation` section.
// 9. df-tools.cjs source contains `case 'telemetry'`, and help.cjs's COMMANDS.telemetry exists.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

describe('doc surfaces (TRD 38-11)', { skip: !IS_DEVFLOW_CHECKOUT ? 'not a DevFlow checkout' : false }, () => {
  test('8. progress.md wires `validate docs --raw` into a Documentation section', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'plugins/devflow/devflow/workflows/progress.md'),
      'utf-8'
    );
    assert.match(src, /df-tools\.cjs validate docs --raw/, 'expected progress.md to call validate docs --raw');
    assert.match(src, /## Documentation/, 'expected a ## Documentation section in the Present template');
  });

  test('9. df-tools.cjs has a telemetry case; help.cjs has a telemetry entry', () => {
    const dfToolsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'plugins/devflow/devflow/bin/df-tools.cjs'),
      'utf-8'
    );
    assert.match(dfToolsSrc, /case 'telemetry':/, "expected df-tools.cjs to have case 'telemetry'");

    const { COMMANDS } = require('./help.cjs');
    assert.ok(COMMANDS.telemetry, 'expected help.cjs COMMANDS.telemetry to exist');
  });
});
