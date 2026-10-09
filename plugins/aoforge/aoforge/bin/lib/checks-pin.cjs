'use strict';

// checks-pin.cjs (TRD 61-01, STOR-03) — is the managed AOForge checks workflow pinned to an old release?
//
// `aof-tools gh setup --apply` writes `.github/workflows/aoforge.yml` from `templates/github/aoforge.yml`. The file pins
// AOForge twice, both rendered from the plugin version that ran setup:
//
//   jobs:
//     aoforge:
//       uses: AO-Cyber-Systems/aoforge-claude/.github/workflows/aoforge-checks.yml@v2.13.1
//       with:
//         aoforge-ref: v2.13.1
//
// Nothing re-pins it after a release, so a repository keeps running the checks of the release it was set up on (the
// v2.13.1 checks crash: live smoke, 2026-10-05). This module is the one reader of those pin lines and the one decision
// about whether they are stale. Decision rules (pinStatus):
//
//   managed   = one of the first 5 lines matches MANAGED_HEADER (gh-setup planWorkflow's update-vs-conflict rule)
//   compared  = [aoforge-ref]  +  [uses @ref, ONLY when the path before '@' === DEFAULT_CHECKS_WORKFLOW]
//   release   = /^v?(\d+)\.(\d+)\.(\d+)$/   (anything else is a branch or SHA, never compared)
//   installed = parseReleaseRef(installedVersion)   (null -> 'not-comparable', no finding)
//   stale     = compared refs that are release-shaped and older than installed (three integers, never string order)
//   state     = absent | not-managed | not-comparable | stale | current | ahead
//
// A team pinned to `main` chose to track it, and a fork's reusable workflow has its own versioning, so neither is
// stale. `aoforge-ref` is always AOForge's runner ref, so it is always compared when it is release-shaped.
//
// W062 contract: one warning, only for state 'stale', never repairable. Re-pinning needs `gh setup --apply` and a pull
// request, which a health repair must never do. Message, one line:
//
//   checks-pin-stale: .github/workflows/aoforge.yml pins AOForge <ref> (<fields>), older than the installed plugin <v>
//
// where <ref> is the oldest stale ref and <fields> the stale fields that pin it.
//
// Consumers: validate health Check 17 (W062), doctor check 26 `checks-workflow-pin`, the `gh setup` dry run (TRD 61-06
// prints parseWorkflowPins(text).lines), and gh-setup.cjs, which imports WORKFLOW_PATH, MANAGED_HEADER and
// DEFAULT_CHECKS_WORKFLOW from here. This module requires only fs, path and the two leaf modules legacy-names.cjs and
// text-escape.cjs, and must never require gh-setup.cjs or any gh-* module: gh-setup requires this one, and a circular
// require hands back a half-built module.exports.
//
// The legacy caller (TRD 72-11, INST-03). A repository set up before the rename has `.github/workflows/<legacy
// caller>` with the legacy managed header, the legacy repository slug and reusable-workflow file on its `uses:` line
// and the legacy ref input. It keeps calling the legacy workflow at its old pin (the commit stays reachable through
// GitHub's rename redirect). It is read like a new caller (same pin fields, compared the same way) and flagged
// `legacy: true`: its W062 fix is the rebrand (72-16), which rewrites slug, file name, input and pin together. A pin
// bump is never applied to it in place, and `gh setup` (which writes WORKFLOW_PATH and matches MANAGED_HEADER only)
// never treats it as its own. The new caller wins when both files exist.

const fs = require('fs');
const path = require('path');
const { LEGACY } = require('./legacy-names.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

/** The managed workflow, relative to the repository root. */
const WORKFLOW_PATH = '.github/workflows/aoforge.yml';
/** The header line that marks the workflow as gh setup's to overwrite. */
const MANAGED_HEADER = /^#\s*aoforge:managed\b/;
/** AOForge's reusable checks workflow, without its @ref. */
const DEFAULT_CHECKS_WORKFLOW = 'AO-Cyber-Systems/aoforge-claude/.github/workflows/aoforge-checks.yml';

// The pre-rename caller: its file, header, reusable workflow and ref input. Read only, never written.
const LEGACY_WORKFLOW_PATH = `.github/workflows/${LEGACY.checksCaller}`;
const LEGACY_MANAGED_HEADER = new RegExp(`^#\\s*${escapeRegExp(LEGACY.markerNs)}:managed\\b`);
const LEGACY_CHECKS_WORKFLOW = `AO-Cyber-Systems/${LEGACY.repo}/.github/workflows/${LEGACY.checksWorkflow}`;
const LEGACY_REF_LINE = new RegExp(`^\\s*${escapeRegExp(LEGACY.slug)}-ref:\\s*(\\S+)`);

const W062 = 'W062';
const FIX =
  'Run `aof-tools gh setup --apply` to re-pin it, then merge the workflow pull request it prints. If github.checks_workflow in '
  + '.aoforge/config.json names an @ref, update that first: setup re-renders the configured ref.';
// A legacy caller is never re-pinned in place: setup would add a second caller beside it.
const FIX_LEGACY =
  'This caller predates the AOForge rename. Do not re-pin it with gh setup, which would add a second caller beside it. '
  + 'Run `aof-tools gh rebrand` (a dry run first): it rewrites the repository slug, workflow file, input name and pin together.';

const USES_LINE = /^\s*uses:\s*(\S+)/;
const AOFORGE_REF_LINE = /^\s*aoforge-ref:\s*(\S+)/;
const RELEASE_REF = /^v?(\d+)\.(\d+)\.(\d+)$/;

function emptyPins() {
  return { managed: false, legacy: false, uses: null, uses_path: null, uses_ref: null, aoforge_ref: null, lines: [] };
}

/** Strip one pair of matching surrounding quotes. */
function unquote(value) {
  if (value.length >= 2) {
    const q = value[0];
    if ((q === '"' || q === "'") && value[value.length - 1] === q) return value.slice(1, -1);
  }
  return value;
}

/**
 * The AOForge pins in a workflow's text: the first `uses:` and the first `aoforge-ref:` line, and whether the file is
 * managed by gh setup. `uses_path`/`uses_ref` split `uses` at its LAST `@` (no `@` -> `uses_ref: null`). `lines` holds
 * the matched lines, trimmed, in file order. Never throws: anything but a string gives the empty answer.
 *
 * The legacy caller is read the same way (its managed header, and its ref input as `aoforge_ref`) and sets `legacy`:
 * true when the header, the `uses:` path or the ref input is the legacy one.
 *
 * @param {string} text
 * @returns {{managed:boolean, legacy:boolean, uses:string|null, uses_path:string|null, uses_ref:string|null,
 *            aoforge_ref:string|null, lines:string[]}}
 */
function parseWorkflowPins(text) {
  const out = emptyPins();
  if (typeof text !== 'string') return out;
  const all = text.split(/\r?\n/);
  const head = all.slice(0, 5);
  const legacyHeader = head.some((l) => LEGACY_MANAGED_HEADER.test(l));
  out.managed = legacyHeader || head.some((l) => MANAGED_HEADER.test(l));
  let legacyRef = false;

  let usesLine = null;
  let refLine = null;
  for (let i = 0; i < all.length && (usesLine === null || refLine === null); i++) {
    if (usesLine === null) {
      const m = USES_LINE.exec(all[i]);
      if (m) {
        usesLine = i;
        out.uses = unquote(m[1]);
        continue;
      }
    }
    if (refLine === null) {
      const m = AOFORGE_REF_LINE.exec(all[i]) || LEGACY_REF_LINE.exec(all[i]);
      if (m) {
        refLine = i;
        out.aoforge_ref = unquote(m[1]);
        legacyRef = !AOFORGE_REF_LINE.test(all[i]);
      }
    }
  }

  if (out.uses !== null) {
    const at = out.uses.lastIndexOf('@');
    out.uses_path = at >= 0 ? out.uses.slice(0, at) : out.uses;
    out.uses_ref = at >= 0 ? out.uses.slice(at + 1) : null;
  }
  out.legacy = legacyHeader || legacyRef || out.uses_path === LEGACY_CHECKS_WORKFLOW;
  out.lines = [usesLine, refLine].filter((i) => i !== null).sort((a, b) => a - b).map((i) => all[i].trim());
  return out;
}

/**
 * A release ref as three integers: `v2.13.1` and `2.13.1` -> [2, 13, 1]. A branch, a SHA, a partial version or a
 * pre-release is null, and null is never compared.
 *
 * @param {*} ref
 * @returns {number[]|null}
 */
function parseReleaseRef(ref) {
  if (typeof ref !== 'string') return null;
  const m = RELEASE_REF.exec(ref.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1 / 0 / 1 over two parseReleaseRef triples. */
function compareRelease(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Decide whether parsed pins are older than the installed plugin.
 *
 * `compared` lists the release-shaped refs that were compared, `stale` the ones older than `installed`, both as
 * `{field, ref}` in the order aoforge-ref, uses. `installed` is the normalized `X.Y.Z`, or null when the installed
 * version is not a release (then the state is 'not-comparable').
 *
 * @param {object} pins parseWorkflowPins output
 * @param {string|null} installedVersion `2.14.0` or `v2.14.0`
 * @returns {{state:'not-managed'|'not-comparable'|'stale'|'current'|'ahead', installed:string|null,
 *            compared:{field:string, ref:string}[], stale:{field:string, ref:string}[]}}
 */
function pinStatus(pins, installedVersion) {
  const p = pins && typeof pins === 'object' ? pins : emptyPins();
  const want = parseReleaseRef(installedVersion);
  const installed = want ? want.join('.') : null;
  const answer = (state, compared = [], stale = []) => ({ state, installed, compared, stale });

  if (!p.managed) return answer('not-managed');
  if (!want) return answer('not-comparable');

  const candidates = [{ field: 'aoforge-ref', ref: p.aoforge_ref }];
  if (p.uses_path === DEFAULT_CHECKS_WORKFLOW || p.uses_path === LEGACY_CHECKS_WORKFLOW) {
    candidates.push({ field: 'uses', ref: p.uses_ref });
  }
  const compared = candidates.filter((c) => parseReleaseRef(c.ref) !== null);
  if (compared.length === 0) return answer('not-comparable');

  const order = compared.map((c) => compareRelease(parseReleaseRef(c.ref), want));
  const stale = compared.filter((_c, i) => order[i] < 0);
  if (stale.length > 0) return answer('stale', compared, stale);
  return answer(order.some((o) => o > 0) ? 'ahead' : 'current', compared, []);
}

/**
 * Read the managed workflow from a repository root: WORKFLOW_PATH, else the legacy caller. A local file read: no gh,
 * no git.
 *
 * @param {string} root
 * @returns {{state:'absent'} | {state:'present', path:string, text:string, pins:object}}
 * @throws for a path that exists but cannot be read (a directory, no permission); callers report it
 */
function readWorkflowPin(root) {
  for (const rel of [WORKFLOW_PATH, LEGACY_WORKFLOW_PATH]) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf-8');
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) continue;
      throw e;
    }
    return { state: 'present', path: rel, text, pins: parseWorkflowPins(text) };
  }
  return { state: 'absent' };
}

/** The one-line W062 message: the oldest stale ref and the stale fields that pin it, in the caller at `rel`. */
function staleMessage(stale, installed, rel = WORKFLOW_PATH) {
  let oldest = stale[0];
  for (const s of stale) {
    if (compareRelease(parseReleaseRef(s.ref), parseReleaseRef(oldest.ref)) < 0) oldest = s;
  }
  const base = parseReleaseRef(oldest.ref);
  const fields = stale.filter((s) => compareRelease(parseReleaseRef(s.ref), base) === 0).map((s) => s.field);
  return `checks-pin-stale: ${rel} pins AOForge ${oldest.ref} (${fields.join(', ')}), older than the installed plugin ${installed}`;
}

/**
 * The validate/doctor collector. `applicable` is false only when the workflow file is absent. `findings` holds one
 * `{code:'W062', message, fix}` when the state is 'stale', and is empty otherwise. Never throws for a missing file; may
 * throw for an unreadable one, and its callers catch that.
 *
 * @param {{projectRoot:string, installedVersion:string|null}} opts
 */
function collectPinFindings({ projectRoot, installedVersion } = {}) {
  const read = readWorkflowPin(projectRoot);
  if (read.state === 'absent') return { applicable: false, state: 'absent', findings: [] };

  const status = pinStatus(read.pins, installedVersion);
  const legacy = read.pins.legacy === true;
  const findings = status.state === 'stale'
    ? [{ code: W062, message: staleMessage(status.stale, status.installed, read.path), fix: legacy ? FIX_LEGACY : FIX }]
    : [];
  return {
    applicable: true,
    state: status.state,
    path: read.path,
    legacy,
    pins: read.pins,
    installed: status.installed,
    compared: status.compared,
    stale: status.stale,
    findings,
  };
}

module.exports = {
  WORKFLOW_PATH,
  MANAGED_HEADER,
  DEFAULT_CHECKS_WORKFLOW,
  parseWorkflowPins,
  parseReleaseRef,
  pinStatus,
  readWorkflowPin,
  collectPinFindings,
};
