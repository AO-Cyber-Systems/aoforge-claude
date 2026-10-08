'use strict';

/**
 * brownfield-detector.cjs — Brownfield codebase map detector
 *
 * Implements `aof-tools detect brownfield-map [<cwd>]`:
 * - Pure logic, no LLM, no network
 * - Detects when .planning/ exists, .planning/codebase/ is absent, AND substantial
 *   source code (>= 50 files) is present → offers /aoforge:map-codebase
 *
 * Output shape (from 14-RESEARCH.md F3):
 * {
 *   should_offer_map: boolean,
 *   planning_exists: boolean,
 *   codebase_map_exists: boolean,
 *   source_file_count: number,
 *   threshold: number
 * }
 *
 * Phase A integration (deferred): classify-session.js will call this on first
 * session per project. This TRD ships the detector helper only.
 *
 * 37-04 (ADP-01): the CLI is now a thin adapter over repo-state.cjs's `detectRepoState` — the one
 * detector shared with project-state.cjs and init.cjs. `countSourceFiles` is re-exported straight
 * from repo-state.cjs (same function object); `detectBrownfieldMap` (the pure function) is
 * unchanged.
 */

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');

const repoState = require('./repo-state.cjs');
const { countSourceFiles } = repoState;

// ─── detectBrownfieldMap (pure function) ─────────────────────────────────────

/**
 * Pure function — determine whether to offer /aoforge:map-codebase.
 * Takes already-evaluated inputs (no filesystem I/O).
 *
 * @param {object} opts
 * @param {boolean} opts.planningExists       - .planning/ directory is present
 * @param {boolean} opts.codebaseMapExists    - .planning/codebase/ directory is present
 * @param {number}  opts.sourceFileCount      - count of source files in project
 * @param {number}  [opts.threshold=50]       - minimum source file count for "substantial code"
 * @returns {{
 *   should_offer_map: boolean,
 *   planning_exists: boolean,
 *   codebase_map_exists: boolean,
 *   source_file_count: number,
 *   threshold: number
 * }}
 */
function detectBrownfieldMap({ planningExists, codebaseMapExists, sourceFileCount, threshold = 50 }) {
  const should_offer_map = planningExists && !codebaseMapExists && sourceFileCount >= threshold;

  return {
    should_offer_map,
    planning_exists: planningExists,
    codebase_map_exists: codebaseMapExists,
    source_file_count: sourceFileCount,
    threshold,
  };
}

// ─── cmdDetectBrownfieldMap (I/O wrapper) ────────────────────────────────────

/**
 * CLI entry point: reads filesystem state via repo-state.cjs's detector, emits result.
 *
 * @param {string} cwd        - process working directory (default root for resolution)
 * @param {string} targetCwd  - optional override path to inspect (args[2] from CLI)
 * @param {boolean} raw       - if true, emit compact JSON; otherwise emit pretty JSON
 */
function cmdDetectBrownfieldMap(cwd, targetCwd, raw) {
  // Resolve root: targetCwd (if provided) wins over cwd
  const root = targetCwd ? path.resolve(targetCwd) : cwd;

  // Validate root exists
  if (!fs.existsSync(root)) {
    const result = { should_offer_map: false, error: `cwd not found: ${root}` };
    process.stderr.write(`Error: cwd not found: ${root}\n`);
    process.exit(1);
    return; // unreachable — process.exit throws in test harness
  }

  // 37-04: one detector call replaces the planning/codebase-map filesystem checks and the
  // local org-marker (`*.ext`) extraExts lookup — detectRepoState's collectSignals already
  // performs both (35-09 parity preserved: `[]` extraExts when userHome falsy).
  const userHome = require('os').homedir();
  const { signals, derived } = repoState.detectRepoState(root, { userHome });

  const result = {
    should_offer_map: derived.should_offer_map,
    planning_exists: signals.has_planning,
    codebase_map_exists: signals.has_codebase_map,
    source_file_count: signals.code_files,
    threshold: 50,
  };

  // Emit
  const summaryLine = result.should_offer_map
    ? `should_offer_map:true — planning exists, no codebase map, ${result.source_file_count} source files`
    : `should_offer_map:false`;

  output(result, raw, JSON.stringify(result));
}

module.exports = { cmdDetectBrownfieldMap, detectBrownfieldMap, countSourceFiles };
