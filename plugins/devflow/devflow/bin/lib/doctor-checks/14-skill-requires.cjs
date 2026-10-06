'use strict';

/**
 * skill-requires — doctor check (TRD 61-02, STOR-04). REPORT ONLY.
 *
 * A skill can declare the external tools it cannot run without (`requires:` in its SKILL.md
 * frontmatter, read by `lib/skill-requires.cjs`). The gate hook refuses such a skill when a tool is not
 * on PATH, and its refusal points here. This check reads every installed skill's declaration, looks each
 * tool up on PATH without spawning anything, and names the tool, the skills that need it and how to
 * install it.
 *
 * PATH CAVEAT. The doctor runs in the user's shell, and the hook inherits the PATH of the Claude Code
 * process. A tool installed by a shell profile (nvm, asdf, a Homebrew shellenv line) can be found by one
 * and not the other, so when this check says `ok` and a skill is still refused, start Claude Code from a
 * shell where the tool resolves, or set DEVFLOW_SKIP_SKILL_REQUIRES=1 in that environment.
 *
 * The root is the installed plugin's installPath; `DEVFLOW_DOCTOR_PLUGIN_ROOT` (test/dev override) is
 * used only when no installed plugin is registered (the same rule as hooks-registry). No installed plugin
 * is `ok` here, because hooks-registry already warns about the install. No fix(): installing a tool is
 * the user's decision, and the plugin cache is the plugin manager's.
 */

const fs = require('fs');
const path = require('path');

const helpers = require('../helpers.cjs');
const { listSkillRequires, findOnPath, hintFor } = require('../skill-requires.cjs');

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function resolveRoot(ctx) {
  const installed = helpers.installedPlugin({ homeDir: ctx.userHome });
  if (installed && installed.installPath && isDir(installed.installPath)) return installed.installPath;
  const override = ctx.env && ctx.env.DEVFLOW_DOCTOR_PLUGIN_ROOT;
  if (override && isDir(override)) return override;
  return null;
}

module.exports = {
  id: 'skill-requires',
  title: 'tools that installed DevFlow skills require are on PATH',
  scope: 'global',

  run(ctx) {
    const root = resolveRoot(ctx);
    if (!root) {
      return {
        severity: 'ok',
        finding: 'no installed plugin to check (the hooks-registry check reports a missing install)',
        fixable: false,
      };
    }

    const listed = listSkillRequires(path.join(root, 'skills'));
    const invalid = listed.filter(s => s.error).map(s => ({ skill: s.skill, error: s.error }));
    const declared = listed.filter(s => !s.error);

    if (declared.length === 0 && invalid.length === 0) {
      return {
        severity: 'ok',
        finding: 'no skill declares requires:',
        fixable: false,
        details: { root, checked: [], missing: [], invalid: [] },
      };
    }

    // tool -> the skills that need it (listSkillRequires is sorted, so each list is too).
    const byTool = new Map();
    for (const { skill, tools } of declared) {
      for (const tool of tools) {
        if (!byTool.has(tool)) byTool.set(tool, []);
        byTool.get(tool).push(skill);
      }
    }

    const env = ctx.env || {};
    const checked = [...byTool.keys()].sort().map(tool => ({
      tool,
      skills: byTool.get(tool),
      found: findOnPath(tool, env),
    }));
    const missing = checked
      .filter(c => c.found === null)
      .map(c => ({ tool: c.tool, skills: c.skills, hint: hintFor(c.tool) }));
    const details = { root, checked, missing, invalid };

    if (missing.length === 0 && invalid.length === 0) {
      return {
        severity: 'ok',
        finding: `every required tool is on PATH: ${checked.map(c => `${c.tool} (${c.skills.join(', ')})`).join(', ')}`,
        fixable: false,
        details,
      };
    }

    const findings = [];
    if (missing.length) {
      findings.push(
        'required tool(s) not on PATH: ' +
        missing.map(m => `${m.tool} (needed by ${m.skills.map(s => `/devflow:${s}`).join(', ')})`).join('; ')
      );
    }
    for (const bad of invalid) findings.push(`/devflow:${bad.skill} has an invalid requires: (${bad.error})`);

    const fixes = [];
    if (missing.length) {
      const plural = missing.length > 1;
      fixes.push(missing.map(m => (plural ? `${m.tool}: ${m.hint}` : m.hint)).join('; '));
    }
    if (invalid.length) {
      fixes.push('correct requires: in the named SKILL.md (a tool name or a list of tool names) and release');
    }

    return {
      severity: 'warn',
      finding: findings.join('; '),
      fixable: false,
      fix_command: fixes.join('; '),
      details,
    };
  },
};
