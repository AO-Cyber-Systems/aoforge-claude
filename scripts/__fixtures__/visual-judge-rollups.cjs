'use strict';

/**
 * Hand-built rollups for the live visual judge assertion (scripts/ci-visual-judge.cjs, TRD 74-01).
 *
 * `verify flutter-ui-eval <manifest> --judge live --raw` emits a rollup whose shape is fixed by
 * plugins/aoforge/aoforge/bin/lib/flutter-ui-eval.cjs (cmdVerifyFlutterUIEval). The assertion
 * script reads that rollup, so its tests need rollups the live judge could have produced, built
 * without calling the model. Every builder below is typed out by hand from the engine's own
 * per-state detail and run-level fields: no randomness, no recorded API output, no generated data.
 *
 *   liveState(overrides)          a state the live model judged not broken on 3/3 samples
 *   brokenLiveState(overrides)    a state the live model judged broken on 3/3 samples, one HIGH overflow
 *   downgradedState(id, error)    a state whose live call threw (no credential, network, refusal):
 *                                 the engine drops it to verdict review with errors and no evidence
 *   liveRollup(overrides)         the passing live run over the committed two-state manifest
 *   fixtureManifest()             the committed manifest.json, parsed
 *
 * Each builder returns a fresh object, so a test may mutate its copy freely.
 */

const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_PATH = path.join(__dirname, 'visual-judge', 'manifest.json');

function liveState(overrides = {}) {
  return {
    state_id: 'docs-home',
    verdict: 'pass',
    is_broken: false,
    flake: false,
    votes: { broken: 0, ok: 3 },
    defects: [],
    evidence: 'vision',
    advisories: [],
    ...overrides,
  };
}

function brokenLiveState(overrides = {}) {
  return {
    state_id: 'docs-home-broken',
    verdict: 'fail',
    is_broken: true,
    flake: false,
    votes: { broken: 3, ok: 0 },
    defects: [
      {
        type: 'overflow',
        severity: 'high',
        region: 'headline',
        rationale: 'The headline runs past the right edge of the viewport and is cut off mid-word.',
      },
    ],
    evidence: 'vision',
    advisories: [],
    ...overrides,
  };
}

function downgradedState(stateId, error) {
  return {
    state_id: stateId,
    verdict: 'review',
    is_broken: null,
    defects: [],
    errors: [error],
  };
}

function liveRollup(overrides = {}) {
  return {
    engine_version: '3.0.0',
    schema_version: 1,
    resolution: 'resolved',
    manifest_path: MANIFEST_PATH,
    network: true,
    judge: 'live-vision',
    gate: 'binding',
    model: 'claude-test-model',
    samples: 3,
    flakeBudget: 1,
    unjudgedPolicy: 'fail',
    verdict: 'pass',
    counts: { pass: 1, fail: 1, review: 0, known_broken: 0 },
    reviews: [],
    fails: [],
    known_failing: ['docs-home-broken'],
    resolved: [],
    unjudged: [],
    known_broken: [],
    usage: { input_tokens: 8400, output_tokens: 900 },
    states: [liveState({ state_id: 'docs-home' }), brokenLiveState({ state_id: 'docs-home-broken' })],
    ...overrides,
  };
}

function fixtureManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
}

module.exports = {
  MANIFEST_PATH,
  liveState,
  brokenLiveState,
  downgradedState,
  liveRollup,
  fixtureManifest,
};
