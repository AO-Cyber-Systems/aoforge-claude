'use strict';

/**
 * plugin-cache — doctor check (TRD 45-05, DOC-05). REPORT ONLY.
 *
 * The plugin manager keeps one directory per fetched version under
 * `~/.claude/plugins/cache/aocyber/devflow/<version>/`. Old ones are never pruned, and a session that
 * started against 2.7.1 or 2.10.1 keeps running that cache's hooks, so stale dirs keep stale sessions
 * alive (2026-09-29). This check lists every cache dir other than the installed one, with sizes.
 *
 * It never deletes anything and exports no fix(): a running session may still be using a stale dir,
 * so removal is the operator's call, after quitting those sessions. The exact `rm -rf` lines are given
 * in fix_command.
 */

const fs = require('fs');
const path = require('path');

const helpers = require('../helpers.cjs');
const { compareSemver } = require('../validate.cjs');

/** Recursive byte sum. Every entry is read in its own try, so one unreadable file never hides the rest. */
function dirBytes(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += dirBytes(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    } catch {
      // unreadable entry: leave it out of the sum
    }
  }
  return total;
}

function realOrResolved(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Quote for a POSIX shell only when the path needs it, so plain paths read naturally. */
function shellQuote(p) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`;
}

function versionOrder(a, b) {
  const cmp = compareSemver(a.version, b.version);
  if (cmp !== 0) return cmp;
  return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
}

module.exports = {
  id: 'plugin-cache',
  title: 'No stale plugin cache directories',
  scope: 'global',

  run(ctx) {
    const cacheRoot = ctx.paths.pluginCacheRoot;
    let dirs = [];
    try {
      dirs = fs.readdirSync(cacheRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => ({ version: e.name, path: path.join(cacheRoot, e.name) }));
    } catch {
      dirs = [];
    }

    if (dirs.length === 0) {
      return { severity: 'ok', finding: 'no plugin cache directories', fixable: false, details: { installed: null, stale: [] } };
    }

    const installed = helpers.installedPlugin({ homeDir: ctx.userHome });
    if (!installed) {
      return {
        severity: 'warn',
        finding: `no installed devflow@aocyber plugin is registered, so ${dirs.length} cache dir(s) cannot be classified as stale (${dirs.map(d => d.version).sort().join(', ')})`,
        fixable: false,
        details: { installed: null, stale: [], cache_dirs: dirs.map(d => d.version) },
      };
    }

    const installedPath = installed.installPath ? realOrResolved(installed.installPath) : null;
    const stale = dirs
      .filter(d => d.version !== installed.version && realOrResolved(d.path) !== installedPath)
      .sort(versionOrder)
      .map(d => ({ version: d.version, path: d.path, bytes: dirBytes(d.path) }));

    if (stale.length === 0) {
      return {
        severity: 'ok',
        finding: `only the installed plugin cache (${installed.version}) is present`,
        fixable: false,
        details: { installed: installed.version, stale: [] },
      };
    }

    const listing = stale.map(s => `${s.version} (${s.bytes} bytes)`).join(', ');
    return {
      severity: 'warn',
      finding: `${stale.length} stale plugin cache dir(s) besides installed ${installed.version}: ${listing}`,
      fixable: false,
      fix_command: ['# after quitting sessions that use them:', ...stale.map(s => `rm -rf ${shellQuote(s.path)}`)].join('\n'),
      details: { installed: installed.version, stale },
    };
  },
};
