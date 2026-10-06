'use strict';

/**
 * skill-requires — `requires:` in SKILL.md frontmatter, the tool lookup and the refusal text
 * (TRD 61-02, STOR-04 part 1).
 *
 * A skill declares the external tools it cannot run without:
 *
 *     requires: [gh]            # or a block list, or a single string
 *
 * ENFORCEMENT POINT (decision). A skill cannot refuse itself: by the time its body runs, the model is
 * already executing it. So the refusal lives outside the skill, in a hook (`hooks/gate-skill-requires.js`,
 * TRD 61-08) on two events:
 *   - `UserPromptExpansion`, which fires when the user types `/devflow:<skill>` and can block the
 *     expansion; its `reason` is shown to the user;
 *   - `PreToolUse` with matcher `Skill`, which fires when Claude invokes a skill through the Skill tool
 *     (typing the slash command bypasses PreToolUse).
 * The alternative, a `df-tools` preflight each SKILL.md body calls, was rejected: it depends on the model
 * obeying the body, costs a Bash call per invocation, and would put an edit in every skill.
 *
 * `requires:` refuses the WHOLE skill, so a skill that needs a tool for only some subcommands does not
 * declare it.
 *
 * FAIL-OPEN CONTRACT. Nothing here throws on bad input. A missing skill is `{ found: false }`, a bad
 * `requires:` value is an `error` string, an unusable PATH is "not found". The hook treats every one of
 * those as "do not block". The hook runs on every slash command, so the lookup is a handful of `stat`
 * calls and never spawns `which`, `command -v` or the tool itself. This module may require only `fs`,
 * `path` and `./frontmatter.cjs`, to stay cheap to load.
 *
 * CONSUMERS: the 61-08 hook (skillNameFromInvocation, readSkillRequires, missingTools, refusalReason) and
 * doctor check 14, `skill-requires` (listSkillRequires, findOnPath, INSTALL_HINTS).
 */

const fs = require('fs');
const path = require('path');

const { extractFrontmatter } = require('./frontmatter.cjs');

/** The environment variable that turns the gate off. Named in the refusal text. */
const SKIP_ENV = 'DEVFLOW_SKIP_SKILL_REQUIRES';

/** A tool token: what a `requires:` entry and a PATH lookup accept. No path separators, no spaces. */
const TOOL_RE = /^[a-z0-9][a-z0-9._+-]*$/;

/** A skill directory name. Checked before any path is built from it. */
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

const PLUGIN_PREFIX = 'devflow:';

/** One concrete install step per tool the skills may require. A repo test pins that every declared tool has one. */
const INSTALL_HINTS = Object.freeze({
  gh: 'install the GitHub CLI (https://cli.github.com), then run gh auth login',
  docker: 'install Docker (https://docs.docker.com/get-docker/)',
  flutter: 'install Flutter (https://docs.flutter.dev/get-started/install)',
  go: 'install Go (https://go.dev/dl/)',
});

const IS_WIN = process.platform === 'win32';

function show(value) {
  try {
    const s = JSON.stringify(value);
    return s === undefined ? String(value) : s;
  } catch {
    return String(value);
  }
}

/**
 * parseRequires(frontmatter) -> { ok: true, tools } | { ok: false, error }
 *
 * `tools` is deduplicated with its order kept. No `requires` key declares nothing. A tool that is not a
 * plain token, or a value that is neither a string nor a list of strings, is an error naming the value.
 */
function parseRequires(fm) {
  if (!fm || typeof fm !== 'object' || !Object.prototype.hasOwnProperty.call(fm, 'requires')) {
    return { ok: true, tools: [] };
  }
  const value = fm.requires;
  if (value === undefined) return { ok: true, tools: [] };
  if (typeof value !== 'string' && !Array.isArray(value)) {
    return { ok: false, error: `requires: ${show(value)} is not a tool name or a list of tool names` };
  }
  const list = Array.isArray(value) ? value : [value];
  const tools = [];
  for (const token of list) {
    if (typeof token !== 'string' || !TOOL_RE.test(token)) {
      return {
        ok: false,
        error: `requires: invalid tool ${show(token)} (a tool is lowercase letters, digits, ".", "_", "+" or "-", with no spaces or slashes)`,
      };
    }
    if (!tools.includes(token)) tools.push(token);
  }
  return { ok: true, tools };
}

/**
 * readSkillRequires(skillsDir, name) -> { found, tools, error? }
 *
 * `found: false` for a missing skill and for any name that is not a plain skill name (checked before a
 * path is built, so nothing outside `skillsDir` is read). An invalid `requires:` is `{ found: true,
 * tools: [], error }`.
 */
function readSkillRequires(skillsDir, name) {
  const none = { found: false, tools: [] };
  if (typeof skillsDir !== 'string' || skillsDir === '') return none;
  if (typeof name !== 'string' || !SKILL_NAME_RE.test(name)) return none;
  let text;
  try {
    text = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf-8');
  } catch {
    return none;
  }
  let parsed;
  try {
    parsed = parseRequires(extractFrontmatter(text));
  } catch (e) {
    return { found: true, tools: [], error: `frontmatter is unreadable (${e && e.message})` };
  }
  if (!parsed.ok) return { found: true, tools: [], error: parsed.error };
  return { found: true, tools: parsed.tools };
}

/**
 * listSkillRequires(skillsDir) -> [{ skill, tools, error? }] sorted by skill name.
 *
 * Only skills that declare a non-empty list, plus skills whose value is invalid (`tools: []`, `error`).
 */
function listSkillRequires(skillsDir) {
  let names;
  try {
    names = fs.readdirSync(skillsDir);
  } catch {
    return [];
  }
  const out = [];
  for (const skill of names.filter(n => SKILL_NAME_RE.test(n)).sort()) {
    const r = readSkillRequires(skillsDir, skill);
    if (!r.found) continue;
    if (r.error) out.push({ skill, tools: [], error: r.error });
    else if (r.tools.length > 0) out.push({ skill, tools: r.tools });
  }
  return out;
}

/** `/devflow:gh-sync status` or `devflow:gh-sync` -> `gh-sync`. Anything not DevFlow-namespaced -> null. */
function devflowName(value) {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (text.startsWith('/')) text = text.slice(1);
  if (!text.startsWith(PLUGIN_PREFIX)) return null;
  const name = text.slice(PLUGIN_PREFIX.length).split(/\s/)[0];
  return SKILL_NAME_RE.test(name) ? name : null;
}

/**
 * skillNameFromInvocation(hookInput) -> skill name | null
 *
 * Handles the two events the 61-08 hook is registered on:
 *   - `UserPromptExpansion`: `command_name` (`devflow:<skill>`), else the typed `prompt` (`/devflow:<skill> ...`).
 *     A bare `command_name` with a prompt that is not `/devflow:...` is another plugin's or the user's own
 *     skill and is not a DevFlow skill.
 *   - `PreToolUse` with `tool_name: 'Skill'`: `tool_input.skill` (`devflow:<skill>`, with or without `/`).
 * Everything else, and anything that is not a valid skill name, is null.
 */
function skillNameFromInvocation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.hook_event_name === 'UserPromptExpansion') {
    const cn = typeof input.command_name === 'string' ? input.command_name.trim().replace(/^\//, '') : '';
    // Another plugin's namespace is not ours, whatever the prompt says.
    if (cn.includes(':') && !cn.startsWith(PLUGIN_PREFIX)) return null;
    return devflowName(cn) || devflowName(input.prompt);
  }
  if (input.hook_event_name === 'PreToolUse' && input.tool_name === 'Skill') {
    const ti = input.tool_input;
    if (!ti || typeof ti !== 'object') return null;
    return devflowName(ti.skill);
  }
  return null;
}

function isExecutableFile(file) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * findOnPath(tool, env) -> absolute path | null
 *
 * The first directory of `env.PATH` holding an executable regular file named `tool`. Never spawns
 * anything. `tool` must be a plain token, so a name can never resolve to a path of the caller's choosing.
 * On win32 each `env.PATHEXT` extension is tried as well.
 */
function findOnPath(tool, env) {
  if (typeof tool !== 'string' || !TOOL_RE.test(tool)) return null;
  if (!env || typeof env !== 'object') return null;
  const rawPath = typeof env.PATH === 'string' ? env.PATH : (IS_WIN && typeof env.Path === 'string' ? env.Path : '');
  if (rawPath === '') return null;

  const names = [tool];
  if (IS_WIN) {
    const exts = (typeof env.PATHEXT === 'string' && env.PATHEXT ? env.PATHEXT : '.EXE;.CMD;.BAT')
      .split(';')
      .filter(Boolean);
    for (const ext of exts) names.push(tool + ext.toLowerCase(), tool + ext.toUpperCase());
  }

  for (const dir of rawPath.split(path.delimiter)) {
    if (dir === '') continue;
    for (const n of names) {
      const candidate = path.join(dir, n);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

/** missingTools(tools, env) -> the tools not found on `env.PATH`, in declared order. */
function missingTools(tools, env) {
  if (!Array.isArray(tools)) return [];
  return tools.filter(t => findOnPath(t, env) === null);
}

function hintFor(tool) {
  return Object.prototype.hasOwnProperty.call(INSTALL_HINTS, tool)
    ? INSTALL_HINTS[tool]
    : `install ${tool} and make sure it is on PATH`;
}

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * refusalReason(skill, missing) -> one paragraph
 *
 * Names the skill, every missing tool, one concrete install hint per tool, `/devflow:doctor` (check
 * `skill-requires`) and the escape. The escape is named as the environment Claude Code is launched
 * from, because a hook runs in Claude Code's own process and an inline command prefix never reaches it.
 */
function refusalReason(skill, missing) {
  const tools = Array.isArray(missing) ? missing.filter(t => typeof t === 'string' && t !== '') : [];
  if (tools.length === 0) return `/devflow:${skill} has no missing required tools.`;
  const plural = tools.length > 1;
  const hints = tools.map(t => (plural ? `${t}: ${hintFor(t)}` : hintFor(t))).join('; ');
  return (
    `/devflow:${skill} needs ${joinNames(tools)} on PATH, and ${plural ? 'they are' : 'it is'} not installed: ${hints}. ` +
    `Run /devflow:doctor to check every DevFlow skill's required tools (check skill-requires). ` +
    `To bypass, set ${SKIP_ENV}=1 in the environment Claude Code is launched from.`
  );
}

module.exports = {
  SKIP_ENV,
  INSTALL_HINTS,
  parseRequires,
  readSkillRequires,
  listSkillRequires,
  skillNameFromInvocation,
  findOnPath,
  missingTools,
  refusalReason,
};
