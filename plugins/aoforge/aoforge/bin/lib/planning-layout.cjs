'use strict';

// planning-layout.cjs — every project-level pre-rename detector and the one legacy-layout message (objective 78,
// TRD 78-01, SC-3/SC-4; first written for objective 72, TRD 72-05/72-08).
//
// AOForge 3.1 reads only `.aoforge/` (NAMES.planningDir) and the "aoforge" config stamp key. The one-release shims
// that read the pre-rename names, and migrations 0012-0014 that converted them, end with AOForge 3.0.x
// (SHIM_RELEASE). What stays is reporting: each detector reads the filesystem itself (never compat's
// planning-directory fallback, which TRD 78-11 strips), and every message names the same two fixes, AOForge 3.0.x
// or the manual step.
//
//   isLegacyPlanning      only the pre-rename planning directory, and it holds a planning file
//   bothPlanningDirs      both planning directories exist
//   findLegacyLayoutRoot  the nearest legacy-only project at or above a directory, never $HOME or above it
//   legacyLayoutMessage   the ONE line a legacy-only project gets, wherever it is reported
//
//   W066 legacy-planning-dir     legacy only: `validate health` returns broken with it, before any other check;
//                                both: a warning (the legacy directory is ignored)
//   W067 legacy-config-key       `.aoforge/config.json` carries the pre-rename stamp key, alone or beside the new one
//   W069 legacy-claude-md-block  the project CLAUDE.md holds a managed block under the pre-rename markers
//                                (legacyBlockMessage is shared with the managed-block refusal, project and global)
//
// `validate health` (Check 1 and Checks 21-23) and doctor check 27 report these; `init plan-objective` and
// `init execute-objective` put W066 in `advisories_warnings` as one line (advisoryLine). Nothing here caches a
// result. This module spells no legacy name: every one comes from legacy-names.cjs.

const fs = require('fs');
const path = require('path');
const { userHomeDir, isUserHome } = require('./compat.cjs');
const { NAMES, LEGACY, SHIM_RELEASE } = require('./legacy-names.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

const { planningDir: NEW_DIR, configKey: NEW_KEY, blockTag: NEW_TAG, product: PRODUCT, cli: CLI } = NAMES;
const { planningDir: OLD_DIR, configKey: OLD_KEY, blockTag: OLD_TAG } = LEGACY;

const CODE = 'W066';
const CONFIG_CODE = 'W067';
const CLAUDE_MD_CODE = 'W069';
const MIGRATION_ID = '0012';
const CONFIG_MIGRATION_ID = '0013';

/** The migration guide in the aoforge-claude repository (its "Upgrading from 2.x" section is the manual path). */
const MIGRATION_GUIDE = 'docs/MIGRATING-TO-AOFORGE.md';

/** A pre-rename planning directory holds at least one of these; an unrelated directory of that name holds none. */
const PLANNING_MARKERS = Object.freeze(['config.json', 'STATE.md', 'ROADMAP.md', 'PROJECT.md']);

/** A managed-block START marker under the pre-rename tag (the START syntax of managed-block.cjs, case-sensitive). */
const LEGACY_BLOCK_START_RE = new RegExp(`<!--\\s*${escapeRegExp(OLD_TAG)}:START\\b`);

// ─── filesystem ──────────────────────────────────────────────────────────────

/** fs.Stats for `p`, or null when it is absent; ENOTDIR (a file on the way) is absence too. */
function statOf(p) {
  try {
    return fs.statSync(p, { throwIfNoEntry: false }) || null;
  } catch {
    return null;
  }
}

const isDir = (p) => {
  const s = statOf(p);
  return Boolean(s && s.isDirectory());
};

const isFile = (p) => {
  const s = statOf(p);
  return Boolean(s && s.isFile());
};

// ─── detectors ───────────────────────────────────────────────────────────────

/**
 * True only for a root whose pre-rename planning directory is a directory holding at least one planning file
 * (PLANNING_MARKERS) and whose `.aoforge/` is not a directory.
 * @param {string} root
 * @returns {boolean}
 */
function isLegacyPlanning(root) {
  if (typeof root !== 'string' || root === '') return false;
  const old = path.join(root, OLD_DIR);
  if (isDir(path.join(root, NEW_DIR)) || !isDir(old)) return false;
  return PLANNING_MARKERS.some((name) => isFile(path.join(old, name)));
}

/**
 * True when a root holds both planning directories (an unfinished move).
 * @param {string} root
 * @returns {boolean}
 */
function bothPlanningDirs(root) {
  if (typeof root !== 'string' || root === '') return false;
  return isDir(path.join(root, NEW_DIR)) && isDir(path.join(root, OLD_DIR));
}

/**
 * The nearest legacy-only project root at or above `start`, or null.
 *
 * The walk returns null at $HOME (in any symlinked form: compat.isUserHome) and never searches above it, returns
 * null as soon as it meets a directory holding `.aoforge/` (the nearer real project wins), and stops at the
 * filesystem root. `home: ''` disables the $HOME stop. Home is read on every call, never cached.
 *
 * @param {string} start
 * @param {object} [opts]
 * @param {string} [opts.home=userHomeDir()]
 * @returns {string|null}
 */
function findLegacyLayoutRoot(start, { home = userHomeDir() } = {}) {
  if (typeof start !== 'string' || start === '') return null;
  let dir = path.resolve(start);
  for (;;) {
    if (isUserHome(dir, { home })) return null;
    if (isDir(path.join(dir, NEW_DIR))) return null;
    if (isLegacyPlanning(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ─── the legacy-layout message ───────────────────────────────────────────────

function layoutProblem(root) {
  return `${root} still uses the pre-rename planning directory ${OLD_DIR}/, which ${PRODUCT} no longer reads`;
}

function layoutFix() {
  return `Move it with ${PRODUCT} ${SHIM_RELEASE} (\`${CLI} upgrade --apply\`) or by hand: \`git mv ${OLD_DIR} ${NEW_DIR}\`, `
    + `then rename a "${OLD_KEY}" key in ${NEW_DIR}/config.json to "${NEW_KEY}" (see ${MIGRATION_GUIDE}, "Upgrading from 2.x")`;
}

/**
 * The one line a legacy-only project gets: what is wrong and both fixes (AOForge 3.0.x, or the manual move).
 * @param {string} root
 * @returns {string}
 */
function legacyLayoutMessage(root) {
  return `${layoutProblem(root)}. ${layoutFix()}.`;
}

// ─── issues ──────────────────────────────────────────────────────────────────

/**
 * The W066 issue for `root`, or null when the project uses only `.aoforge/` (or has no planning directory). For a
 * legacy-only root, `message` is legacyLayoutMessage's problem and `fix` its fix part, so a reporter prints both.
 * @param {string} root
 * @returns {{code: string, message: string, fix: string, layout: 'legacy'|'both'}|null}
 */
function legacyPlanningIssue(root) {
  if (bothPlanningDirs(root)) {
    return {
      code: CODE,
      layout: 'both',
      message: `legacy-planning-dir: ${NEW_DIR}/ and ${OLD_DIR}/ both exist; `
        + `the legacy one is ignored (${PRODUCT} reads ${NEW_DIR}/ only)`,
      fix: `Move anything you still need from ${OLD_DIR}/ into ${NEW_DIR}/, `
        + `then remove the legacy directory ${OLD_DIR}/`,
    };
  }
  if (isLegacyPlanning(root)) {
    return { code: CODE, layout: 'legacy', message: `legacy-planning-dir: ${layoutProblem(root)}`, fix: layoutFix() };
  }
  return null;
}

/**
 * The W067 issue for `root`, or null. Reads `<root>/.aoforge/config.json` only (a config in the legacy directory
 * is part of the W066 layout problem). The pre-rename key alone: rename it. Both keys: delete the pre-rename one
 * (3.1 never merges or removes it). An absent or unreadable config.json is validate's Check 3 (E005/W003).
 * @param {string} root
 * @returns {{code: string, message: string, fix: string}|null}
 */
function legacyConfigKeyIssue(root) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(root, NEW_DIR, 'config.json'), 'utf-8'));
  } catch {
    return null;
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null;
  const has = (k) => Object.prototype.hasOwnProperty.call(cfg, k);
  if (!has(OLD_KEY)) return null;
  const file = `${NEW_DIR}/config.json`;
  if (has(NEW_KEY)) {
    return {
      code: CONFIG_CODE,
      message: `legacy-config-key: ${file} still holds the pre-rename "${OLD_KEY}" key beside "${NEW_KEY}"; `
        + `${PRODUCT} reads only "${NEW_KEY}" and never removes the old one`,
      fix: `In ${file}, delete the pre-rename key "${OLD_KEY}" (${PRODUCT} records its upgrades under "${NEW_KEY}")`,
    };
  }
  return {
    code: CONFIG_CODE,
    message: `legacy-config-key: ${file} records its upgrades under the pre-rename "${OLD_KEY}" key; `
      + `${PRODUCT} reads only "${NEW_KEY}"`,
    fix: `In ${file}, rename the key to "${NEW_KEY}" (or run ${PRODUCT} ${SHIM_RELEASE}'s \`${CLI} upgrade --apply\` once)`,
  };
}

/**
 * True when `text` holds a managed-block START marker under the pre-rename tag (any attributes, CRLF or LF).
 * @param {string} text
 * @returns {boolean}
 */
function hasLegacyBlockMarker(text) {
  return typeof text === 'string' && LEGACY_BLOCK_START_RE.test(text);
}

/**
 * The W069 text for a CLAUDE.md file (`fileLabel`: 'CLAUDE.md' for a project, '~/.claude/CLAUDE.md' for the
 * global one). The managed-block refusal (TRD 78-08) uses the same text.
 * @param {string} fileLabel
 * @returns {{message: string, fix: string}}
 */
function legacyBlockMessage(fileLabel) {
  return {
    message: `legacy-claude-md-block: ${fileLabel} holds a managed block under the pre-rename ${OLD_TAG} markers, `
      + `which ${PRODUCT} no longer updates`,
    fix: `Rename <!-- ${OLD_TAG}:START and <!-- ${OLD_TAG}:END to ${NEW_TAG}; the next upgrade refreshes the block `
      + `(or run ${PRODUCT} ${SHIM_RELEASE}'s upgrade once)`,
  };
}

/**
 * The W069 issue for `root` (its CLAUDE.md holds a pre-rename managed block), or null.
 * @param {string} root
 * @returns {{code: string, message: string, fix: string}|null}
 */
function legacyClaudeMdIssue(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
  } catch {
    return null;
  }
  if (!hasLegacyBlockMarker(text)) return null;
  return { code: CLAUDE_MD_CODE, ...legacyBlockMessage('CLAUDE.md') };
}

/** The issue as one advisory line: `W066 <message> (fix: <fix>)`. */
function advisoryLine(issue) {
  return `${issue.code} ${issue.message} (fix: ${issue.fix})`;
}

module.exports = {
  CODE,
  CONFIG_CODE,
  CLAUDE_MD_CODE,
  MIGRATION_ID,
  CONFIG_MIGRATION_ID,
  MIGRATION_GUIDE,
  PLANNING_MARKERS,
  LEGACY_BLOCK_START_RE,
  isLegacyPlanning,
  bothPlanningDirs,
  findLegacyLayoutRoot,
  legacyLayoutMessage,
  legacyPlanningIssue,
  legacyConfigKeyIssue,
  legacyClaudeMdIssue,
  legacyBlockMessage,
  hasLegacyBlockMarker,
  advisoryLine,
};
