'use strict';

// stack-render.cjs — command rendering + per-agent context slicing (TRD 35-02b)
//
// Consumes the resolved-profile shape produced by 35-02a's resolver: frontmatter (commands,
// loop, gates, generated, verification), sections (H2 name -> {text, sources}), provenance,
// chain, component, issues. This module does not require that resolver — it depends only on
// the shape above — and it does no filesystem access of its own; it is pure logic over the
// object it is given.

const path = require('path');

const SAFE_TOKEN = /^[A-Za-z0-9_./@:+=-]+$/;

function quoteToken(token) {
  return SAFE_TOKEN.test(token) ? token : `'${token}'`;
}

// Unique `./<dirname>` per file (`.` for root files), in first-occurrence order.
function derivePackagesFromFiles(files) {
  const seen = new Set();
  const packages = [];
  for (const file of files) {
    const dir = path.posix.dirname(file);
    const pkg = dir === '.' || dir.startsWith('./') || dir.startsWith('/') ? dir : `./${dir}`;
    if (!seen.has(pkg)) {
      seen.add(pkg);
      packages.push(pkg);
    }
  }
  return packages;
}

function fillTemplate(template, files, packages) {
  let result = template;
  if (result.includes('{packages}')) {
    const pkgs = packages.length > 0 ? packages : derivePackagesFromFiles(files);
    result = result.split('{packages}').join(pkgs.map(quoteToken).join(' '));
  }
  if (result.includes('{files}')) {
    result = result.split('{files}').join(files.map(quoteToken).join(' '));
  }
  return result;
}

/**
 * renderCommand(profile, key, { files, packages, apply }) -> {
 *   key, status: 'ok'|'discover'|'none'|'undefined', form: 'run'|'scoped'|'apply'|null,
 *   command: string|null, timeout_s?, cwd?
 * }
 *
 * Form selection: `apply` if requested and it exists; otherwise `scoped` if files or packages
 * were given and a scoped form exists; otherwise `run`. `run: discover` / `run: none` are
 * reported as their own statuses — never a fabricated command.
 */
function renderCommand(profile, key, opts = {}) {
  const { files = [], packages = [], apply = false } = opts;
  const commands = (profile && profile.frontmatter && profile.frontmatter.commands) || {};
  const cmd = commands[key];

  if (!cmd) {
    return { key, status: 'undefined', form: null, command: null };
  }

  let form;
  let template;
  if (apply && cmd.apply) {
    form = 'apply';
    template = cmd.apply;
  } else if ((files.length > 0 || packages.length > 0) && cmd.scoped) {
    form = 'scoped';
    template = cmd.scoped;
  } else {
    form = 'run';
    template = cmd.run;
  }

  const passthrough = {};
  if (cmd.timeout_s !== undefined) passthrough.timeout_s = cmd.timeout_s;
  if (cmd.cwd !== undefined) passthrough.cwd = cmd.cwd;

  if (template === 'discover') {
    return { key, status: 'discover', form: null, command: null, ...passthrough };
  }
  if (template === 'none') {
    return { key, status: 'none', form: null, command: null, ...passthrough };
  }

  const command = fillTemplate(template, files, packages);
  return { key, status: 'ok', form, command, ...passthrough };
}

// §5.3 matrix: per-agent applicable sections (excluding Principles, which every agent gets, and
// Commands, which is synthesized from frontmatter rather than profile.sections), in the row
// order the proposal lists them. `commands`/`ui` gate the two rows that aren't plain sections.
const AGENT_SLICES = {
  planner: { commands: true, ui: true, sections: ['Idioms', 'Layout & architecture', 'Testing', 'Dependencies'] },
  executor: {
    commands: true,
    ui: true,
    sections: ['Idioms', 'Avoid', 'Layout & architecture', 'Dependencies', 'Generated code', 'Security'],
  },
  verifier: { commands: true, ui: true, sections: ['Avoid', 'Testing', 'Security'] },
  debugger: { commands: true, ui: false, sections: ['Avoid', 'Generated code'] },
  mapper: { commands: false, ui: false, sections: ['Layout & architecture', 'Dependencies'] },
  researcher: { commands: false, ui: false, sections: ['Layout & architecture', 'Dependencies'] },
};

const AGENT_ALIASES = {
  'codebase-mapper': 'mapper',
  'integration-checker': 'mapper',
  'objective-researcher': 'researcher',
  'project-researcher': 'researcher',
};

function resolveAgent(agent) {
  const canonical = AGENT_ALIASES[agent] || agent;
  if (!AGENT_SLICES[canonical]) {
    const valid = Object.keys(AGENT_SLICES).join(', ');
    throw Object.assign(new Error(`unknown agent "${agent}"; valid: ${valid}`), {
      code: 'UNKNOWN_AGENT',
    });
  }
  return canonical;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function renderSectionBlock(name, profile) {
  return `## ${name}\n\n${profile.sections[name].text}`;
}

// Commands block:
//   ## Commands (profile: <id>)
//   - <key>: <run>   (scoped: <scoped>)        # 'discover'/'none' shown literally, not filled
//   loop: a -> b -> c
//   gates.task: ...
//   gates.objective: ...
//   generated: globs [..]; regenerate: <key>    # executor + debugger only
//   runtime: <verification.runtime> (runtime_check: <key>)   # verifier only
function renderCommandsBlock(profile, canonicalAgent) {
  const fm = profile.frontmatter || {};
  const lines = [`## Commands (profile: ${profile.id})`];
  const commands = fm.commands || {};
  for (const [cmdKey, cmd] of Object.entries(commands)) {
    let line = `- ${cmdKey}: ${cmd.run}`;
    if (cmd.scoped) line += `   (scoped: ${cmd.scoped})`;
    lines.push(line);
  }
  if (fm.loop && fm.loop.length) {
    lines.push(`loop: ${fm.loop.join(' → ')}`);
  }
  const gates = fm.gates || {};
  if (gates.task && gates.task.length) lines.push(`gates.task: ${gates.task.join(', ')}`);
  if (gates.objective && gates.objective.length) {
    lines.push(`gates.objective: ${gates.objective.join(', ')}`);
  }
  if (canonicalAgent === 'executor' || canonicalAgent === 'debugger') {
    const gen = fm.generated || {};
    let genLine = `generated: globs [${(gen.globs || []).join(', ')}]`;
    if (gen.regenerate) genLine += `; regenerate: ${gen.regenerate}`;
    lines.push(genLine);
  }
  if (canonicalAgent === 'verifier') {
    const ver = fm.verification || {};
    let runLine = `runtime: ${ver.runtime}`;
    if (ver.runtime_check) runLine += ` (runtime_check: ${ver.runtime_check})`;
    lines.push(runLine);
  }
  return lines.join('\n');
}

function renderBlock(name, profile, canonicalAgent) {
  return name === 'Commands' ? renderCommandsBlock(profile, canonicalAgent) : renderSectionBlock(name, profile);
}

// Ordered candidate list [Principles, Commands, then the matrix order], filtered to what this
// agent's slice covers and (for everything but Commands) what the profile actually has.
function buildCandidates(profile, canonicalAgent, ui) {
  const slice = AGENT_SLICES[canonicalAgent];
  const ordered = ['Principles'];
  if (slice.commands) ordered.push('Commands');
  for (const name of slice.sections) ordered.push(name);
  if (slice.ui && ui) ordered.push('UI');
  const sections = (profile && profile.sections) || {};
  return ordered.filter((name) => name === 'Commands' || Boolean(sections[name]));
}

/**
 * contextFor(profile, agent, { budget, ui }) -> {
 *   agent, profile_id, text, tokens, budget, truncated, included: [names], omitted: [names]
 * }
 *
 * Slices the §5.3 sections for `agent` (aliases resolve to their canonical agent), renders them
 * in [Principles, Commands, matrix order], and drops from the end until the result fits the
 * token budget (`Math.ceil(text.length / 4)`). If Principles (+ Commands) alone still exceed the
 * budget, hard-cuts the text and appends a truncation marker rather than dropping further.
 */
function contextFor(profile, agent, opts = {}) {
  const { budget = 2500, ui = false } = opts;
  const canonical = resolveAgent(agent);
  const included = buildCandidates(profile, canonical, ui);
  const omitted = [];

  const renderAll = (names) => names.map((name) => renderBlock(name, profile, canonical)).join('\n\n');

  let text = renderAll(included);
  let tokens = estimateTokens(text);
  let truncated = false;

  let protectedCount = 0;
  for (const name of included) {
    if (name === 'Principles' || name === 'Commands') {
      protectedCount++;
    } else {
      break;
    }
  }

  while (tokens > budget && included.length > protectedCount) {
    omitted.push(included.pop());
    truncated = true;
    text = renderAll(included);
    tokens = estimateTokens(text);
  }

  if (tokens > budget) {
    const maxChars = Math.max(0, budget * 4 - 16);
    text = `${text.slice(0, maxChars)}\n…[truncated]`;
    tokens = estimateTokens(text);
    truncated = true;
  }

  return {
    agent: canonical,
    profile_id: profile.id,
    text,
    tokens,
    budget,
    truncated,
    included,
    omitted,
  };
}

module.exports = {
  renderCommand,
  contextFor,
  AGENT_SLICES,
  AGENT_ALIASES,
};
