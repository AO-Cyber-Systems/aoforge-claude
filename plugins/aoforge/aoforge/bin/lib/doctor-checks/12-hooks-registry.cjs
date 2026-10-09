'use strict';

/**
 * hooks-registry — doctor check (TRD 45-05, DOC-05). REPORT ONLY.
 *
 * The plugin's `hooks/hooks.json` (and `plugin.json` statusLine) name hook scripts as
 * `${CLAUDE_PLUGIN_ROOT}/hooks/<file>.js`. Two drifts break a release silently: a registration whose
 * file is not there (the hook just never runs), and a hook file nobody registered (it ships dead).
 * Draft hooks carry a `DRAFT` header in their first 40 lines and are intentionally unregistered.
 *
 * The root is the installed plugin's installPath; `AOFORGE_DOCTOR_PLUGIN_ROOT` (test/dev override) is
 * used only when no installed plugin is registered. `*.test.js` files and `hooks/lib/` helpers are not
 * hooks. No fix(): the plugin cache is the plugin manager's, and the source of truth is the repo.
 */

const fs = require('fs');
const path = require('path');

const helpers = require('../helpers.cjs');

const REF_RE = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/g;
const DRAFT_HEAD_LINES = 40;
const REPORT_HINT =
  'fix hooks/hooks.json or the hook files in plugins/aoforge and release; ' +
  'for a damaged install run `/plugin update aoforge@aocyber`';

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

function readJson(file) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(file, 'utf-8')) };
  } catch (e) {
    return { ok: false, error: e.code === 'ENOENT' ? 'not found' : e.message };
  }
}

/** Every string under a `command` key, anywhere in the value. */
function collectCommands(value, out = []) {
  if (Array.isArray(value)) {
    for (const v of value) collectCommands(v, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'command' && typeof v === 'string') out.push(v);
      else collectCommands(v, out);
    }
  }
  return out;
}

/** Plugin-root-relative posix paths named by `${CLAUDE_PLUGIN_ROOT}/<path>` in a command string. */
function refsIn(command) {
  const refs = [];
  for (const m of command.matchAll(REF_RE)) refs.push(m[1].split(path.sep).join('/'));
  return refs;
}

function hasDraftHeader(file) {
  try {
    const head = fs.readFileSync(file, 'utf-8').split('\n').slice(0, DRAFT_HEAD_LINES);
    return head.some(line => line.includes('DRAFT'));
  } catch {
    return false;
  }
}

function resolveRoot(ctx) {
  const installed = helpers.installedPlugin({ homeDir: ctx.userHome });
  if (installed && installed.installPath && isDir(installed.installPath)) return installed.installPath;
  const override = ctx.env && ctx.env.AOFORGE_DOCTOR_PLUGIN_ROOT;
  if (override && isDir(override)) return override;
  return null;
}

const sortedUnique = (list) => [...new Set(list)].sort();

module.exports = {
  id: 'hooks-registry',
  title: 'hooks.json matches the hook files in the installed plugin',
  scope: 'global',

  run(ctx) {
    const root = resolveRoot(ctx);
    if (!root) {
      return {
        severity: 'warn',
        finding: 'no installed plugin to check (aoforge@aocyber is not registered and AOFORGE_DOCTOR_PLUGIN_ROOT is unset)',
        fixable: false,
        fix_command: 'install the plugin with `/plugin install aoforge@aocyber`',
      };
    }

    const hooksPath = path.join(root, 'hooks', 'hooks.json');
    const hooksJson = readJson(hooksPath);
    if (!hooksJson.ok) {
      return {
        severity: 'warn',
        finding: `hooks/hooks.json is unreadable in ${root} (${hooksJson.error})`,
        fixable: false,
        fix_command: REPORT_HINT,
        details: { root },
      };
    }

    const hookRefs = sortedUnique(collectCommands(hooksJson.data.hooks).flatMap(refsIn));
    const missing = hookRefs.filter(rel => !isFile(path.join(root, rel)));

    // plugin.json statusLine: a second registration site.
    const issues = [];
    let statusRefs = [];
    const pluginJson = readJson(path.join(root, '.claude-plugin', 'plugin.json'));
    if (pluginJson.ok) {
      const cmd = pluginJson.data && pluginJson.data.statusLine && pluginJson.data.statusLine.command;
      if (typeof cmd === 'string') statusRefs = sortedUnique(refsIn(cmd));
    } else if (pluginJson.error !== 'not found') {
      issues.push(`.claude-plugin/plugin.json is unreadable (${pluginJson.error}), so statusLine was not checked`);
    }
    const statusMissing = statusRefs.filter(rel => !isFile(path.join(root, rel)));

    const registered = sortedUnique([...hookRefs, ...statusRefs]);

    // Hook files on disk: top-level hooks/*.js minus tests. hooks/lib/ helpers are not hooks.
    let onDisk = [];
    try {
      onDisk = fs.readdirSync(path.join(root, 'hooks'), { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.endsWith('.test.js'))
        .map(e => `hooks/${e.name}`)
        .sort();
    } catch {
      onDisk = [];
    }
    const registeredSet = new Set(registered);
    const unregistered = [];
    const drafts = [];
    for (const rel of onDisk) {
      if (registeredSet.has(rel)) continue;
      if (hasDraftHeader(path.join(root, rel))) drafts.push(rel);
      else unregistered.push(rel);
    }

    if (missing.length) issues.push(`hook file(s) named in hooks.json but missing: ${missing.join(', ')}`);
    if (statusMissing.length) issues.push(`plugin.json statusLine target missing: ${statusMissing.join(', ')}`);
    if (unregistered.length) issues.push(`hook file(s) neither registered nor marked DRAFT: ${unregistered.join(', ')}`);

    const details = {
      root,
      registered,
      missing,
      statusline_missing: statusMissing,
      unregistered,
      drafts,
    };

    if (issues.length) {
      return {
        severity: 'warn',
        finding: issues.join('; '),
        fixable: false,
        fix_command: REPORT_HINT,
        details,
      };
    }

    return {
      severity: 'ok',
      finding: `${registered.length} registered hook file(s) resolve; ${drafts.length} DRAFT hook(s) intentionally unregistered`,
      fixable: false,
      details,
    };
  },
};
