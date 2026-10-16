#!/usr/bin/env node
'use strict';

// release-tag.cjs — the release step of .github/workflows/release.yml (quick 34; dry run quick 37).
//
//   node scripts/release-tag.cjs <tag>                 (a tag push; repository root, GH_TOKEN set)
//   node scripts/release-tag.cjs --dry-run <run_id>    (workflow_dispatch with dry_run: true)
//
// Four tag kinds reach it:
//
//   vX.Y.Z            a core release. First it ensures the alias tag `<core>--vX.Y.Z` at the same
//                     commit and pushes it: plugin dependency ranges (the stack packs' `aoforge
//                     >=X.Y.Z`) resolve core from that prefixed tag (docs/PROPOSAL-stack-packs.md Q15).
//                     The core plugin.json must carry X.Y.Z.
//   <pack>--vX.Y.Z    a plugin's own release: plugins/<pack>/.claude-plugin/plugin.json must exist with
//                     that name and version, the notes come from plugins/<pack>/CHANGELOG.md, and the
//                     release is created with --latest=false so it never displaces core as Latest.
//   <core>--vX.Y.Z    the alias itself, which a core release just pushed: nothing to do.
//   <core>--v0.0.0-dryrun-<run_id>
//                     the dry run's throwaway tag: nothing to do (core only; a pack prefix is refused).
//
// Order for a release, as the workflow's shell had it: alias (core only), skip when the release
// already exists, title from the annotated tag's subject (else the tag), notes from the CHANGELOG
// section `## [X.Y.Z]` (else --generate-notes).
//
// The dry run (runDryRun) rehearses the one push a core release makes with the workflow's token. It
// pushes a lightweight `<core>--v0.0.0-dryrun-<run_id>` tag at HEAD (the alias prefix, so it meets the
// same tag rulesets as a real `<core>--vX.Y.Z`), checks that origin shows it at that commit, deletes
// it, and removes the local tag. It never calls gh and creates no release. It refuses a malformed run
// id and a dry-run tag that is already on origin before any push, always deletes what it pushed, and
// when the delete fails it throws with the exact cleanup command. Run
// `node scripts/tag-rules.cjs aoforge--v0.0.0-dryrun-1 aoforge--v3.1.0` first: a ruleset that restricts
// deleting `aoforge--v*` tags would leave the dry-run tag behind.
//
// A tag pushed with the workflow's GITHUB_TOKEN starts no workflow run (GitHub does not let that token
// trigger workflows). No release path depends on one doing so: the alias needs no run, because the
// core run already did the work; pack tags are pushed by a person, so their push starts this workflow
// normally; and no other workflow triggers on tags. The dry-run tag starts no run either; if one ever
// did, runRelease skips it with no exec call.
//
// runRelease and runDryRun take `exec(cmd, args) -> { status, stdout, stderr }`. The CLI entry below
// is the only place that wires a real one; the tests pass a fake. CommonJS, Node >= 16, sync fs, no
// dependencies.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CORE_DIR = 'plugins/aoforge';
const CORE_TAG_RE = /^v(\d+\.\d+\.\d+)$/;
const PLUGIN_TAG_RE = /^([a-z][a-z0-9-]*)--v(\d+\.\d+\.\d+)$/;
// Checked before PLUGIN_TAG_RE, which ends in `$` and so would never match the suffix anyway.
const DRY_RUN_TAG_RE = /^([a-z][a-z0-9-]*)--v0\.0\.0-dryrun-(\d+)$/;
// GitHub's run ids are positive integers; digits only also keeps the id inert in a ref and a message.
const RUN_ID_RE = /^\d{1,20}$/;

/** parseTag(tag) -> { plugin: string|null, version, dry_run? } | null. Only a dry-run tag has dry_run. */
function parseTag(tag) {
  if (typeof tag !== 'string') return null;
  let m = CORE_TAG_RE.exec(tag);
  if (m) return { plugin: null, version: m[1] };
  m = DRY_RUN_TAG_RE.exec(tag);
  if (m) return { plugin: m[1], version: '0.0.0', dry_run: m[2] };
  m = PLUGIN_TAG_RE.exec(tag);
  if (m) return { plugin: m[1], version: m[2] };
  return null;
}

function checkRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) {
    throw new Error(`dry run: the run id must be 1 to 20 digits (the workflow's github.run_id), got ${JSON.stringify(runId)}`);
  }
}

/** dryRunTag(core, runId) -> '<core>--v0.0.0-dryrun-<runId>'. Throws on a malformed run id. */
function dryRunTag(core, runId) {
  checkRunId(runId);
  return `${core}--v0.0.0-dryrun-${runId}`;
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
 *   { kind: 'dry-run', tag, plugin, version: '0.0.0', run_id }
 * Throws, naming the tag, for anything else, including a dry-run tag under any prefix but core's.
 */
function planTag(tag, { root }) {
  const parsed = parseTag(tag);
  if (!parsed) throw new Error(`"${tag}" is not a release tag: expected vX.Y.Z or <plugin>--vX.Y.Z`);
  const core = readPluginJson(root, CORE_DIR);
  if (!core || !core.name) throw new Error(`${CORE_DIR}/.claude-plugin/plugin.json is missing or has no name (tag "${tag}")`);
  const { plugin, version } = parsed;

  if (parsed.dry_run !== undefined) {
    if (plugin !== core.name) {
      throw new Error(`tag "${tag}": dry-run tags are core-only (${core.name}--v0.0.0-dryrun-<run id>), not ${plugin}`);
    }
    return { kind: 'dry-run', tag, plugin, version, run_id: parsed.dry_run };
  }

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
  if (plan.kind === 'dry-run') {
    log(`${tag} is a dry-run tag; the dry run deletes it. Nothing to do.`);
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

const output = (r) => ((r && (r.stderr || r.stdout)) || '').trim();

/**
 * runDryRun(runId, { root, exec, log }) -> { action: 'dry-run', tag, sha, pushed, verified, deleted }
 *
 * The calls, in order: git rev-parse HEAD^{commit}; git ls-remote --tags origin <ref> (must be empty);
 * git tag <tag> <sha>; git push origin <ref>; git ls-remote (must show `<sha>\t<ref>`);
 * git push origin --delete <ref>; git ls-remote (must be empty); git tag -d <tag>. Never gh.
 * A refused push or a missing tag on origin is the finding, so it is reported after the cleanup rather
 * than stopping it: whatever was pushed is deleted and the local tag is removed before it throws.
 */
function runDryRun(runId, { root, exec, log = () => {} }) {
  checkRunId(runId);
  const core = readPluginJson(root, CORE_DIR);
  if (!core || !core.name) throw new Error(`${CORE_DIR}/.claude-plugin/plugin.json is missing or has no name (dry run)`);
  const tag = dryRunTag(core.name, runId);
  const ref = `refs/tags/${tag}`;
  const lsRemote = () => exec('git', ['ls-remote', '--tags', 'origin', ref]);

  const sha = must(exec('git', ['rev-parse', 'HEAD^{commit}']), 'git rev-parse HEAD').stdout.trim();
  const before = must(lsRemote(), `git ls-remote ${tag}`).stdout.trim();
  if (before) throw new Error(`${tag} is already on origin (${before}); refusing to touch a tag this run did not create`);
  must(exec('git', ['tag', tag, sha]), `git tag ${tag}`);
  log(`created local tag ${tag} at ${sha}`);

  let pushed = false;
  let verified = false;
  let deleted = false;
  const failures = [];
  try {
    const push = exec('git', ['push', 'origin', ref]);
    if (push.status !== 0) {
      failures.push(`push of ${tag} refused: ${output(push) || `exit ${push.status}`}`);
    } else {
      pushed = true;
      log(`pushed ${tag}`);
      const seen = lsRemote();
      const listed = seen.status === 0 ? seen.stdout.trim() : '';
      verified = seen.status === 0 && listed.split('\n').some((l) => l.trim() === `${sha}\t${ref}`);
      if (verified) log(`origin shows ${tag} at ${sha}`);
      else if (seen.status !== 0) failures.push(`git ls-remote after pushing ${tag} failed: ${output(seen)}`);
      else failures.push(`${tag} did not reach origin at ${sha}: ${listed || 'absent'}`);
    }
  } catch (e) {
    failures.push(e.message);
  } finally {
    if (pushed) {
      const del = exec('git', ['push', 'origin', '--delete', ref]);
      const after = lsRemote();
      deleted = del.status === 0 && after.status === 0 && after.stdout.trim() === '';
      if (deleted) {
        log(`deleted ${tag} from origin`);
      } else {
        const why = del.status !== 0 ? `delete refused: ${output(del)}` : `still listed: ${output(after) || 'ls-remote failed'}`;
        failures.push(`${tag} is still on origin (${why}); delete it by hand: git push origin --delete ${ref}`);
      }
    }
    // Local only and best effort: the runner's checkout is thrown away after the job anyway.
    exec('git', ['tag', '-d', tag]);
  }
  if (failures.length) throw new Error(failures.join('; '));
  return { action: 'dry-run', tag, sha, pushed, verified, deleted };
}

function realExec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) return { status: 1, stdout: '', stderr: r.error.message };
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opts = { root: process.cwd(), exec: realExec, log: (m) => console.log(m) };
  try {
    const result = argv[0] === '--dry-run' ? runDryRun(argv[1], opts) : runRelease(argv[0], opts);
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error(`release-tag: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { parseTag, planTag, releaseNotes, runRelease, runDryRun, dryRunTag };
