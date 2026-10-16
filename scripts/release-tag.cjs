#!/usr/bin/env node
'use strict';

// release-tag.cjs — the release step of .github/workflows/release.yml (quick 34).
//
//   node scripts/release-tag.cjs <tag>        (run from the repository root, GH_TOKEN set)
//
// Three tag kinds reach it:
//
//   vX.Y.Z            a core release. First it ensures the alias tag `<core>--vX.Y.Z` at the same
//                     commit and pushes it: plugin dependency ranges (the stack packs' `aoforge
//                     >=X.Y.Z`) resolve core from that prefixed tag (docs/PROPOSAL-stack-packs.md Q15).
//                     The core plugin.json must carry X.Y.Z.
//   <pack>--vX.Y.Z    a plugin's own release: plugins/<pack>/.claude-plugin/plugin.json must exist with
//                     that name and version, the notes come from plugins/<pack>/CHANGELOG.md, and the
//                     release is created with --latest=false so it never displaces core as Latest.
//   <core>--vX.Y.Z    the alias itself, which a core release just pushed: nothing to do. (A push made
//                     with the workflow's GITHUB_TOKEN does not start another run anyway.)
//
// Order for a release, as the workflow's shell had it: alias (core only), skip when the release
// already exists, title from the annotated tag's subject (else the tag), notes from the CHANGELOG
// section `## [X.Y.Z]` (else --generate-notes).
//
// runRelease takes `exec(cmd, args) -> { status, stdout, stderr }`. The CLI entry below is the only
// place that wires a real one; the tests pass a fake. CommonJS, Node >= 16, sync fs, no dependencies.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CORE_DIR = 'plugins/aoforge';
const CORE_TAG_RE = /^v(\d+\.\d+\.\d+)$/;
const PLUGIN_TAG_RE = /^([a-z][a-z0-9-]*)--v(\d+\.\d+\.\d+)$/;

/** parseTag(tag) -> { plugin: string|null, version } | null */
function parseTag(tag) {
  if (typeof tag !== 'string') return null;
  let m = CORE_TAG_RE.exec(tag);
  if (m) return { plugin: null, version: m[1] };
  m = PLUGIN_TAG_RE.exec(tag);
  if (m) return { plugin: m[1], version: m[2] };
  return null;
}

function readPluginJson(root, dir) {
  const file = path.join(root, dir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * planTag(tag, { root }) -> the release plan for a tag:
 *   { kind: 'core', tag, plugin, version, changelog: 'CHANGELOG.md', alias: '<core>--vX.Y.Z', latest: true }
 *   { kind: 'core-alias', tag, plugin, version }
 *   { kind: 'pack', tag, plugin, version, changelog: 'plugins/<pack>/CHANGELOG.md', alias: null, latest: false }
 * Throws, naming the tag, for anything else.
 */
function planTag(tag, { root }) {
  const parsed = parseTag(tag);
  if (!parsed) throw new Error(`"${tag}" is not a release tag: expected vX.Y.Z or <plugin>--vX.Y.Z`);
  const core = readPluginJson(root, CORE_DIR);
  if (!core || !core.name) throw new Error(`${CORE_DIR}/.claude-plugin/plugin.json is missing or has no name (tag "${tag}")`);
  const { plugin, version } = parsed;

  if (plugin === null) {
    if (core.version !== version) {
      throw new Error(`tag "${tag}" does not match ${CORE_DIR}/.claude-plugin/plugin.json version ${core.version}`);
    }
    return { kind: 'core', tag, plugin: core.name, version, changelog: 'CHANGELOG.md', alias: `${core.name}--v${version}`, latest: true };
  }
  if (plugin === core.name) return { kind: 'core-alias', tag, plugin, version };

  const dir = `plugins/${plugin}`;
  const pj = readPluginJson(root, dir);
  if (!pj) throw new Error(`tag "${tag}" names no plugin of this repository: ${dir}/.claude-plugin/plugin.json does not exist`);
  if (pj.name !== plugin) throw new Error(`tag "${tag}": ${dir}/.claude-plugin/plugin.json is named ${JSON.stringify(pj.name)}, not ${plugin}`);
  if (pj.version !== version) throw new Error(`tag "${tag}" does not match ${dir}/.claude-plugin/plugin.json version ${pj.version}`);
  return { kind: 'pack', tag, plugin, version, changelog: `${dir}/CHANGELOG.md`, alias: null, latest: false };
}

/** releaseNotes(text, version) -> the trimmed body under `## [version]` up to the next `## [`, or ''. */
function releaseNotes(text, version) {
  const heading = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`);
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return '';
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim();
}

function must(result, what) {
  if (!result || result.status !== 0) {
    const detail = result ? (result.stderr || result.stdout || '').trim() : 'no result';
    throw new Error(`${what} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

/**
 * runRelease(tag, { root, exec, log }) -> { action: 'skip'|'exists'|'created', tag, kind, alias? }
 * See the header for the order. Throws on any failed step; nothing after it runs.
 */
function runRelease(tag, { root, exec, log = () => {} }) {
  const plan = planTag(tag, { root });
  if (plan.kind === 'core-alias') {
    log(`${tag} is the alias of a core release; the core release pushed it. Nothing to do.`);
    return { action: 'skip', tag, kind: plan.kind };
  }

  // 1. The alias tag (core only), at exactly the release commit.
  if (plan.alias) {
    const sha = must(exec('git', ['rev-parse', `refs/tags/${tag}^{commit}`]), `git rev-parse ${tag}`).stdout.trim();
    const existing = exec('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${plan.alias}^{commit}`]);
    if (existing.status === 0) {
      const at = existing.stdout.trim();
      if (at !== sha) throw new Error(`${plan.alias} already points at ${at}, but ${tag} is at ${sha}: refusing to move it`);
      log(`${plan.alias} already at ${sha}`);
    } else {
      must(exec('git', ['tag', plan.alias, sha]), `git tag ${plan.alias}`);
      must(exec('git', ['push', 'origin', `refs/tags/${plan.alias}`]), `git push ${plan.alias}`);
      log(`pushed ${plan.alias} at ${sha}`);
    }
  }

  // 2. Idempotency: an existing release is left alone.
  if (exec('gh', ['release', 'view', tag]).status === 0) {
    log(`release for ${tag} already exists, skipping`);
    return { action: 'exists', tag, kind: plan.kind, alias: plan.alias };
  }

  // 3. Title: the annotated tag's subject, else the tag. actions/checkout materializes the pushed
  // tag as a lightweight ref, so %(contents:subject) would fall through to the COMMIT subject; the
  // workflow re-fetches the real tag objects (git fetch --tags --force) before this runs.
  const subject = exec('git', ['for-each-ref', '--format=%(contents:subject)', `refs/tags/${tag}`]);
  const title = (subject.status === 0 && subject.stdout.trim()) || tag;

  // 4. Notes: the CHANGELOG section, else GitHub's generated notes.
  const changelogPath = path.join(root, plan.changelog);
  const notes = fs.existsSync(changelogPath) ? releaseNotes(fs.readFileSync(changelogPath, 'utf8'), plan.version) : '';
  const tmp = notes ? fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-')) : null;
  try {
    const args = ['release', 'create', tag, '--title', title];
    if (tmp) {
      const file = path.join(tmp, 'notes.md');
      fs.writeFileSync(file, notes + '\n');
      args.push('--notes-file', file);
    } else {
      args.push('--generate-notes');
    }
    if (!plan.latest) args.push('--latest=false');
    must(exec('gh', args), `gh release create ${tag}`);
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
  log(`created release ${tag}${plan.latest ? '' : ' (not Latest)'}`);
  return { action: 'created', tag, kind: plan.kind, alias: plan.alias };
}

function realExec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) return { status: 1, stdout: '', stderr: r.error.message };
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

if (require.main === module) {
  const tag = process.argv[2];
  try {
    const result = runRelease(tag, { root: process.cwd(), exec: realExec, log: (m) => console.log(m) });
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error(`release-tag: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { parseTag, planTag, releaseNotes, runRelease };
