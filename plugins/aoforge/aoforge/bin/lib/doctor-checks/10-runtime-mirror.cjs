'use strict';

/**
 * runtime-mirror — doctor check (TRD 45-05, DOC-05).
 *
 * `~/.claude/aoforge` is a mirror of the installed plugin's `aoforge/` tree, refreshed by the
 * sync-runtime SessionStart hook. Evidence from 2026-09-29: the mirror sat at 2.10.1 while 2.11.0 was
 * installed. This check compares the mirror against the plugin manager's own registry (never against
 * the mirror's own marker): version first, then, for equal versions, the content digest of the real
 * mirror files against the real installed files (`.plugin-version` alone cannot see a same-version
 * content change).
 *
 * Fix: drop the version/digest markers and run the INSTALLED plugin's sync-runtime.js with HOME
 * pointed at ctx.userHome. Removing `.plugin-version` forces a mirror in every sync-runtime version
 * (including ones that predate the digest logic), and is refused whenever the mirror is ahead of the
 * installed plugin, since that would downgrade a dev checkout.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const helpers = require('../helpers.cjs');
const { compareSemver } = require('../validate.cjs');
const { digestTree, readMarkerDigest, DIGEST_FILE } = require('../runtime-digest.cjs');

const UPDATE_HINT = 'start a new Claude Code session, or run `/plugin update aoforge@aocyber`';
const SPAWN_TIMEOUT_MS = 60000;
const VERSION_RE = /^v?\d+\.\d+\.\d+/;

function readTrimmed(file) {
  try {
    const v = fs.readFileSync(file, 'utf-8').trim();
    return v === '' ? null : v;
  } catch {
    return null;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Inspect the mirror against the installed plugin and classify it.
 * @returns {{severity, finding, fixable, fix_command?, details}}
 */
function classify(ctx) {
  const mirrorDir = ctx.paths.mirrorDir;
  const installed = helpers.installedPlugin({ homeDir: ctx.userHome });
  const mirrorRaw = readTrimmed(path.join(mirrorDir, '.plugin-version'));
  const mirrorVer = mirrorRaw && VERSION_RE.test(mirrorRaw) ? mirrorRaw : null;

  const details = {
    installed: installed ? installed.version : null,
    mirror: mirrorRaw,
    installPath: installed ? installed.installPath : null,
    installed_digest: null,
    mirror_digest: null,
    marker_digest: readMarkerDigest(mirrorDir),
  };

  if (!installed) {
    return {
      severity: 'warn',
      finding: `no installed aoforge@aocyber plugin is registered, so the runtime mirror (${mirrorRaw || 'absent'}) cannot be checked`,
      fixable: false,
      fix_command: 'install the plugin with `/plugin install aoforge@aocyber`, then start a new Claude Code session',
      details,
    };
  }

  const installPath = installed.installPath;
  const bundledDir = installPath ? path.join(installPath, 'aoforge') : null;
  if (!bundledDir || !isDir(bundledDir)) {
    return {
      severity: 'warn',
      finding: `installed plugin ${installed.version} has no aoforge/ runtime at ${installPath || '(no installPath)'}, so the mirror cannot be compared`,
      fixable: false,
      fix_command: UPDATE_HINT,
      details,
    };
  }

  // A fix can only run when the installed plugin ships the sync-runtime hook.
  const syncRuntime = path.join(installPath, 'hooks', 'sync-runtime.js');
  const canFix = isFile(syncRuntime);
  const reportOnly = canFix ? undefined : UPDATE_HINT;

  const withFix = (r) => {
    if (!r.fixable && reportOnly && !r.fix_command) r.fix_command = reportOnly;
    return r;
  };

  if (!mirrorVer) {
    const why = mirrorRaw
      ? `mirror version marker ${JSON.stringify(mirrorRaw)} is not a version`
      : 'no runtime mirror (~/.claude/aoforge/.plugin-version is missing)';
    return withFix({
      severity: 'error',
      finding: `${why}; installed plugin is ${installed.version}`,
      fixable: canFix,
      details,
    });
  }

  const cmp = compareSemver(mirrorVer, installed.version);

  if (cmp > 0) {
    return {
      severity: 'warn',
      finding: `mirror ahead (dev checkout?): mirror ${mirrorVer} is newer than installed ${installed.version}; left alone so it is not downgraded`,
      fixable: false,
      fix_command: UPDATE_HINT,
      details,
    };
  }

  if (cmp < 0) {
    return withFix({
      severity: 'error',
      finding: `runtime mirror ${mirrorVer} is behind installed plugin ${installed.version}`,
      fixable: canFix,
      details,
    });
  }

  // Same version: the content decides.
  details.installed_digest = digestTree(bundledDir);
  details.mirror_digest = digestTree(mirrorDir);
  if (details.installed_digest !== details.mirror_digest) {
    return withFix({
      severity: 'error',
      finding: `runtime mirror content drift at version ${installed.version}: mirrored files differ from the installed plugin`,
      fixable: canFix,
      details,
    });
  }

  return {
    severity: 'ok',
    finding: `runtime mirror ${mirrorVer} matches installed plugin ${installed.version} (content digest equal)`,
    fixable: false,
    details,
  };
}

function tail(text, max = 300) {
  const s = String(text || '').trim();
  return s.length > max ? '...' + s.slice(-max) : s;
}

module.exports = {
  id: 'runtime-mirror',
  title: 'Runtime mirror (~/.claude/aoforge) matches the installed plugin',
  scope: 'global',

  run(ctx) {
    return classify(ctx);
  },

  fix(ctx, result) {
    // Re-classify: never trust a result handed in from before the world may have changed.
    const state = classify(ctx);
    if (!state.fixable) {
      return {
        applied: false,
        refused: `not safe to re-mirror: ${state.finding}`,
      };
    }

    const installPath = state.details.installPath;
    const mirrorDir = ctx.paths.mirrorDir;
    const syncRuntime = path.join(installPath, 'hooks', 'sync-runtime.js');

    // Force a mirror in every sync-runtime version (missing/unparseable marker => mirror).
    fs.rmSync(path.join(mirrorDir, '.plugin-version'), { force: true });
    fs.rmSync(path.join(mirrorDir, DIGEST_FILE), { force: true });

    const spawned = spawnSync(process.execPath, [syncRuntime], {
      env: {
        ...ctx.env,
        CLAUDE_PLUGIN_ROOT: installPath,
        HOME: ctx.userHome,
        USERPROFILE: ctx.userHome,
      },
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    });

    // sync-runtime exits 0 even when it fails, so convergence is judged from the mirror itself.
    const after = classify(ctx);
    if (after.severity === 'ok') {
      return {
        applied: true,
        changed: ['~/.claude/aoforge'],
        notes: `re-mirrored ${installPath}/aoforge to ~/.claude/aoforge (${after.details.installed})`,
      };
    }

    const reason = spawned.error
      ? spawned.error.message
      : tail(spawned.stderr) || tail(spawned.stdout) || after.finding;
    return {
      applied: false,
      refused: `sync-runtime did not converge: ${reason}`,
      changed: ['~/.claude/aoforge'],
    };
  },
};
