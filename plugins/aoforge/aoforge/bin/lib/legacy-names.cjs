'use strict';

// The single source of the DevFlow -> AOForge name map (objective 72).
//
// NAMES holds the current (AOForge) form of every name; LEGACY holds the old
// (DevFlow) form. Legacy names may be spelled ONLY here, in the legacy-*.cjs files of
// the lib fixtures directory and in *.legacy.test.* files (rename-guard.repo.test.cjs).
// Every other module builds its legacy strings from LEGACY.
//
// AOForge 3.1.0 (SHIM_REMOVAL, objective 78) removed the one-release shims that read
// LEGACY to make an old name work. What still needs LEGACY reads an old name only to
// detect and report it, to convert it on request, or to read history:
//   - detectors: planning-layout (W066/W067/W069 and the legacy-layout message, which
//     legacy-layout-guard, upgrade and the upgrade-project hook use), coexistence (the
//     global SessionStart notice), managed-block and global-upgrade (a pre-rename
//     CLAUDE.md block), gh-setup (a pre-rename PR-template block), gh-legacy-labels
//     (an un-rebranded repository), checks-pin (a pre-rename checks caller), stack-mcp
//     (a pre-rename .mcp.json owner key), doctor checks 15 and 16
//   - the converter: gh-rebrand and legacy-rewrite (every key NAMES and LEGACY share)
//   - history readers: session-audit and agent-overhead (transcripts recorded before
//     the rename)
//   - PRESERVE (below), and the rename guard and the rename codemod
//     (scripts/aoforge-rename.cjs), which build their tokens from LEGACY
// legacy-names.legacy.test.cjs (6) fails on a LEGACY key that nothing reads.

const NAMES = Object.freeze({
  product: 'AOForge',
  slug: 'aoforge',
  upper: 'AOFORGE',
  cli: 'aof-tools',
  banner: 'AOF ►',
  planningDir: '.aoforge',
  runtimeDir: 'aoforge',
  envPrefix: 'AOFORGE_',
  agentNs: 'aoforge:',
  commandNs: '/aoforge:',
  configKey: 'aoforge',
  blockTag: 'AOFORGE',
  markerNs: 'aoforge',
  checkContextNs: 'aoforge/',
  userDotDir: '.aoforge',
  notices: '.aoforge-notices.json',
  repo: 'aoforge-claude',
  pagesProject: 'aoforge-docs',
  checksWorkflow: 'aoforge-checks.yml',
  checksCaller: 'aoforge.yml',
  watch: 'aoforge-watch',
  adoptBranch: 'aoforge/adopt',
  plugin: 'aoforge@aocyber',
});

const LEGACY = Object.freeze({
  product: 'DevFlow',
  slug: 'devflow',
  upper: 'DEVFLOW',
  cli: 'df-tools',
  banner: 'DF ►',
  planningDir: '.planning',
  runtimeDir: 'devflow',
  envPrefix: 'DEVFLOW_',
  agentNs: 'devflow:',
  commandNs: '/devflow:',
  configKey: 'devflow',
  blockTag: 'DEVFLOW',
  markerNs: 'devflow',
  checkContextNs: 'devflow/',
  userDotDir: '.devflow',
  notices: '.devflow-notices.json',
  repo: 'devflow-claude',
  pagesProject: 'devflow-docs',
  checksWorkflow: 'devflow-checks.yml',
  checksCaller: 'devflow.yml',
  watch: 'devflow-watch',
  adoptBranch: 'devflow/adopt',
  plugin: 'devflow@aocyber',
  // Legacy-only: the short command namespace (/df:, which doc-refs.legacy.test.cjs feeds in to prove it is
  // ignored) and the legacy skill/agent install prefix (doctor check 15, agent-overhead). The dash form (/df-)
  // went in 3.1.0: nothing read it once doc-refs stopped reading pre-rename command forms (TRDs 78-02, 78-12).
  commandNsShort: '/df:',
  installPrefix: 'df-',
});

// Tokens that contain a legacy name but are NOT the renamed product: other products and a
// domain. A rewrite masks them (case-insensitively) before it maps any LEGACY name. The rename
// codemod (scripts/aoforge-rename.cjs PRESERVE.global) masks the same tokens; TRD 72-09's
// consistency test (legacy-rewrite.legacy.test.cjs) keeps the two lists equal.
const PRESERVE = Object.freeze(['devflowops', 'devFlowOps', 'DevFlowOps', 'devflow-desktop', 'devflow.cloud']);

// The release that removed the one-release shims; 3.1 code spells a legacy name only to detect and report it, in
// gh rebrand, and in readers of history recorded before the rename (objective 78, TRD 78-12).
const SHIM_REMOVAL = '3.1.0';

// The last release line that carries the one-release shims and migrations 0012-0014; every 3.1 legacy message
// names it as the conversion path (objective 78, TRD 78-01).
const SHIM_RELEASE = '3.0.x';

module.exports = { NAMES, LEGACY, PRESERVE, SHIM_REMOVAL, SHIM_RELEASE };
