'use strict';

// The single source of the DevFlow -> AOForge name map (objective 72).
//
// NAMES holds the current (AOForge) form of every name; LEGACY holds the old
// (DevFlow) form. Legacy names may be spelled ONLY here, in the legacy-*.cjs files of
// the lib fixtures directory and in *.legacy.test.* files. Every other
// module builds its legacy strings from LEGACY (see compat.cjs).
//
// The shims that read LEGACY are removed in SHIM_REMOVAL.

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
  // Legacy-only: the short command forms (/df:, /df-) and the legacy skill/agent install prefix.
  commandNsShort: '/df:',
  commandDash: '/df-',
  installPrefix: 'df-',
});

const SHIM_REMOVAL = 'the release after 3.0.0';

module.exports = { NAMES, LEGACY, SHIM_REMOVAL };
