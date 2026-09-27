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

module.exports = {
  renderCommand,
};
