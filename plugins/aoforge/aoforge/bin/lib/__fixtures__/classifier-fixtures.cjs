'use strict';

/**
 * classifier-fixtures.cjs — Test fixtures for classifier.cjs pure-logic tests
 * and classify-session.js hook subprocess tests.
 *
 * Provides:
 *   buildClassifyInput({...})      — factory for classifySession inputs
 *   SCENARIOS                      — named input presets for each branch
 *   mkAmbientTmpProject()          — tmpdir with .aoforge/ + .git/
 *   mkInitOfferTmpProject()        — tmpdir with .git/ only
 *   mkScratchDir()                 — tmpdir with nothing
 *   mkDeclineMarkerProject()       — tmpdir with .aoforge/ + .git/ + decline marker
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { NAMES } = require('../legacy-names.cjs');

// The planning-directory name the project builders write (TRD 72-05). The classify-session hook resolves only the legacy name
// until 72-06 moves it onto the resolver, so its tests call setPlanningDir(LEGACY.planningDir) once at load; 72-06
// drops those calls. node --test runs each file in its own process, so the switch never leaks.
let PLANNING = NAMES.planningDir;
function setPlanningDir(name) {
  PLANNING = name;
}

// ─── Factory builder ──────────────────────────────────────────────────────────

/**
 * Build a classifySession input object.
 * @param {object} opts
 * @param {string|null} opts.planningDir
 * @param {boolean}     opts.hasGitDir
 * @param {boolean}     opts.hasDeclineMarker
 * @param {boolean}     opts.isSubstantive       - (17-03) default true → back-compat with 15-01 tests
 * @param {boolean}     opts.previouslyDeclined  - (17-03) default false → back-compat with 15-01 tests
 * @returns {{ planningDir: string|null, hasGitDir: boolean, hasDeclineMarker: boolean, isSubstantive: boolean, previouslyDeclined: boolean }}
 */
function buildClassifyInput({
  planningDir = null,
  hasGitDir = false,
  hasDeclineMarker = false,
  isSubstantive = true,       // backward-compat default: existing init-offer tests still pass
  previouslyDeclined = false, // backward-compat default: existing init-offer tests still pass
} = {}) {
  return { planningDir, hasGitDir, hasDeclineMarker, isSubstantive, previouslyDeclined };
}

// ─── Named scenarios (pure, no filesystem) ────────────────────────────────────

const SCENARIOS = {
  /** Ambient: has .aoforge/ and no decline marker → 'ambient' */
  ambient: () => buildClassifyInput({ planningDir: '/tmp/p/.aoforge', hasGitDir: true }),
  /** Init-offer: git repo, no .aoforge/, no decline marker → 'init-offer' */
  initOffer: () => buildClassifyInput({ planningDir: null, hasGitDir: true }),
  /** Scratch dir: no planning, no git → 'skip' */
  scratchDir: () => buildClassifyInput({ planningDir: null, hasGitDir: false }),
  /** No-git dir: same as scratch — no planning, no git → 'skip' */
  noGitDir: () => buildClassifyInput({ planningDir: null, hasGitDir: false }),
  /** Decline marker: has .aoforge/ but marker present → 'skip' */
  declineMarker: () => buildClassifyInput({ planningDir: '/tmp/p/.aoforge', hasGitDir: true, hasDeclineMarker: true }),
  // ─── 17-03 new scenarios ─────────────────────────────────────────────────────
  /** Substantive git repo, no planning, not declined → 'init-offer' (17-03) */
  initOfferSubstantive: () => buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: true, previouslyDeclined: false }),
  /** Non-substantive git repo → 'skip' even without decline (17-03) */
  initOfferNotSubstantive: () => buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: false, previouslyDeclined: false }),
  /** Substantive but previously declined → 'skip' (17-03) */
  initOfferDeclined: () => buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: true, previouslyDeclined: true }),
};

// ─── Tmpdir scaffolds (used by classify-session subprocess tests) ─────────────

/**
 * Create a temp dir with both .aoforge/ and .git/ — classifies as 'ambient'.
 * Caller must clean up: fs.rmSync(root, { recursive: true, force: true })
 * @returns {string} absolute path to project root
 */
function mkAmbientTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-ambient-'));
  fs.mkdirSync(path.join(root, PLANNING), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

/**
 * Create a temp dir with .git/ only — classifies as 'init-offer'.
 * Caller must clean up.
 * @returns {string} absolute path to project root
 */
function mkInitOfferTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-init-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

/**
 * Create a bare temp dir (no .aoforge/, no .git/) — classifies as 'skip'.
 * Caller must clean up.
 * @returns {string} absolute path to scratch dir
 */
function mkScratchDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'classify-scratch-'));
}

/**
 * Create a temp dir with .aoforge/ + .git/ + .aoforge/.aoforge-init-declined marker.
 * Despite having .aoforge/, this classifies as 'skip' due to decline marker.
 * Caller must clean up.
 * @returns {string} absolute path to project root
 */
function mkDeclineMarkerProject() {
  const root = mkAmbientTmpProject();
  fs.writeFileSync(path.join(root, PLANNING, '.aoforge-init-declined'), '');
  return root;
}

module.exports = {
  setPlanningDir,
  buildClassifyInput,
  SCENARIOS,
  mkAmbientTmpProject,
  mkInitOfferTmpProject,
  mkScratchDir,
  mkDeclineMarkerProject,
};
