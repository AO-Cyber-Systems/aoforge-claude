'use strict';

// Doctor check: checks-workflow-pin (TRD 61-01, STOR-03).
//
// Warns when the managed `.github/workflows/aoforge.yml` (written by `gh setup --apply`) pins AOForge to a release
// older than the installed plugin, so a repository set up on an old release does not keep running that release's
// checks unnoticed. The parse and the decision are checks-pin.collectPinFindings, the same collector validate health
// Check 17 renders as W062; nothing is re-implemented here.
//
// This check OWNS W062 in the doctor: `22-validate-health.cjs` lists it in DEFERRED (the W040 / W057-W061 pattern),
// so a stale pin shows once, here.
//
// The comparison version is the plugin manager's installed plugin (helpers.installedPlugin, the call
// 12-hooks-registry makes), else the running engine (ctx.pluginVersion). A branch or SHA pin, a fork's own @ref, an
// unmanaged file and an absent file are ok, each with its own finding.
//
// REPORT-ONLY. It never exports `fix`: re-pinning is `gh setup --apply` plus merging the pull request it prints, and
// an @ref in github.checks_workflow re-pins that same ref until the config is changed. Both are a person's call.
//
// A legacy managed caller (TRD 72-15; checks-pin's `legacy` flag, TRD 72-11) is the pre-rename caller file. It is
// always a warning, stale or not, and its fix_command is the rebrand dry run (TRD 72-16), which rewrites the slug,
// workflow file, input name and pin together. It is never offered the gh setup re-pin: setup would add a second
// caller beside it.

const helpers = require('../helpers.cjs');
const checksPin = require('../checks-pin.cjs');

const FIX_COMMAND = 'node ~/.claude/aoforge/bin/aof-tools.cjs gh setup --apply';
const REBRAND_COMMAND = 'node ~/.claude/aoforge/bin/aof-tools.cjs gh rebrand --dry-run';
const CONFIG_NOTE = 'an @ref in github.checks_workflow re-pins that ref: update it first';
const WORKFLOW = checksPin.WORKFLOW_PATH;

/** -> {version, source}: the installed plugin when the plugin manager knows it, else the running engine. */
function comparisonVersion(ctx) {
  let info = null;
  try {
    info = helpers.installedPlugin({ homeDir: ctx.userHome });
  } catch {
    info = null;
  }
  if (info && typeof info.version === 'string' && info.version) return { version: info.version, source: 'installed-plugin' };
  return { version: ctx.pluginVersion || null, source: 'running-engine' };
}

const refsOf = (entries) => [...new Set(entries.map((e) => e.ref))].join(', ');

/** The one-line finding for a legacy managed caller, stale or not. */
function legacyFinding(r) {
  const stale = r.findings.length ? `; ${r.findings[0].message}` : '';
  return `legacy caller workflow ${r.path} predates the AOForge rename${stale}. `
    + 'Rebrand it (a dry run first) rather than re-pinning with gh setup, which would add a second caller beside it';
}

/** The one-line finding for each ok state, naming the caller file actually read. */
function okFinding(r, version) {
  const pins = r.pins || {};
  const WORKFLOW = r.path || checksPin.WORKFLOW_PATH;
  switch (r.state) {
    case 'not-managed':
      return `${WORKFLOW} is not managed by gh setup (no "# aoforge:managed" header), so its pins are not checked`;
    case 'current':
      return `${WORKFLOW} is pinned to ${refsOf(r.compared)} (installed ${r.installed})`;
    case 'ahead':
      return `${WORKFLOW} is pinned to ${refsOf(r.compared)}, ahead of the installed plugin ${r.installed}`;
    case 'not-comparable': {
      if (r.installed === null) {
        return `the AOForge version ${version === null ? '(unknown)' : version} is not a release, so ${WORKFLOW} is not compared`;
      }
      const ref = pins.aoforge_ref || pins.uses_ref;
      return ref
        ? `${WORKFLOW} is pinned to ${ref} (a branch or SHA, not compared)`
        : `${WORKFLOW} names no AOForge ref, so there is nothing to compare`;
    }
    default:
      return `${WORKFLOW}: ${r.state}`;
  }
}

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };

  const { version, source } = comparisonVersion(ctx);
  let r;
  try {
    r = checksPin.collectPinFindings({ projectRoot: ctx.projectRoot, installedVersion: version });
  } catch (e) {
    return {
      severity: 'warn',
      finding: `${WORKFLOW} could not be read: ${e && e.message ? e.message : String(e)}`,
      fixable: false,
      details: { installed: version, version_source: source },
    };
  }

  if (!r.applicable) {
    return {
      severity: 'ok',
      finding: `no ${WORKFLOW} (gh setup has not written the AOForge checks workflow here)`,
      fixable: false,
      details: { state: r.state, installed: version, version_source: source },
    };
  }

  const details = {
    state: r.state,
    path: r.path,
    pins: r.pins,
    installed: version,
    version_source: source,
    compared: r.compared,
    stale: r.stale,
    legacy: r.legacy === true,
  };

  if (details.legacy && r.pins && r.pins.managed) {
    const legacyDetails = r.findings.length ? { ...details, code: r.findings[0].code, fix: r.findings[0].fix } : details;
    return {
      severity: 'warn',
      finding: legacyFinding(r),
      fixable: false,
      fix_command: REBRAND_COMMAND,
      details: legacyDetails,
    };
  }

  if (r.findings.length === 0) {
    return { severity: 'ok', finding: okFinding(r, version), fixable: false, details };
  }

  const [f] = r.findings;
  return {
    severity: 'warn',
    finding: `${f.message} (${CONFIG_NOTE})`,
    fixable: false,
    fix_command: FIX_COMMAND,
    details: { ...details, code: f.code, fix: f.fix },
  };
}

module.exports = {
  id: 'checks-workflow-pin',
  title: 'AOForge checks workflow pin',
  scope: 'project',
  run,
};
