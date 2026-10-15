#!/usr/bin/env node
'use strict';

// Stack pack mirror (objective 77; docs/PROPOSAL-stack-packs.md §5A.2).
//
// Core cannot read another plugin's files, so every stack pack ships this file as its
// SessionStart hook (`hooks/sync-pack.cjs`, a byte-identical copy: pack-mirror.repo.test.cjs
// fails CI on drift). It copies the pack's runtime files from ${CLAUDE_PLUGIN_ROOT} to
// `~/.claude/aoforge/stacks/<name>/`, where `aof-tools stack discover` finds them.
//
// Self-contained on purpose: it runs before core's own runtime mirror may exist, and hook order
// across plugins is undefined. Same marker idea as sync-runtime: `.pack-version` + `.pack-digest`
// skip a redundant copy. The copy lands in a temp sibling and is renamed into place, so a reader
// never sees half a pack. Fails open: any error is one stderr line and exit 0.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SKIP_DIRS = new Set(['.git', 'node_modules', '__fixtures__', 'hooks', '.claude-plugin']);
const SKIP_FILE = /\.test\.(c?js|mjs)$/;

function listFiles(root, rel = '') {
  const out = [];
  for (const ent of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? path.join(rel, ent.name) : ent.name;
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) out.push(...listFiles(root, r));
    } else if (ent.isFile() && !SKIP_FILE.test(ent.name)) {
      out.push(r);
    }
  }
  return out.sort();
}

function digestOf(root, files) {
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f.split(path.sep).join('/'));
    h.update('\0');
    h.update(fs.readFileSync(path.join(root, f)));
    h.update('\0');
  }
  return h.digest('hex');
}

function readOr(file, fallback) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return fallback; }
}

/**
 * mirrorPack({ packRoot, stacksDir }) -> { action: 'copied'|'current', name, dest }
 * Throws on a missing or nameless manifest; the hook entry catches.
 */
function mirrorPack({ packRoot, stacksDir }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(packRoot, 'aoforge-stack.json'), 'utf8'));
  if (!manifest.name || !/^[a-z][a-z0-9-]*$/.test(manifest.name)) throw new Error('aoforge-stack.json has no valid name');
  let version = '';
  try { version = JSON.parse(fs.readFileSync(path.join(packRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version || ''; } catch { /* dev tree */ }

  const files = listFiles(packRoot);
  const digest = digestOf(packRoot, files);
  const dest = path.join(stacksDir, manifest.name);
  if (readOr(path.join(dest, '.pack-version'), null) === version && readOr(path.join(dest, '.pack-digest'), null) === digest) {
    return { action: 'current', name: manifest.name, dest };
  }

  fs.mkdirSync(stacksDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(stacksDir, `.${manifest.name}-`));
  for (const f of files) {
    const to = path.join(tmp, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(packRoot, f), to);
  }
  fs.writeFileSync(path.join(tmp, '.pack-version'), version + '\n');
  fs.writeFileSync(path.join(tmp, '.pack-digest'), digest + '\n');

  const old = fs.existsSync(dest) ? `${dest}.old-${process.pid}` : null;
  if (old) fs.renameSync(dest, old);
  fs.renameSync(tmp, dest);
  if (old) fs.rmSync(old, { recursive: true, force: true });
  return { action: 'copied', name: manifest.name, dest };
}

function defaultStacksDir() {
  return process.env.AOFORGE_STACKS_DIR || path.join(os.homedir(), '.claude', 'aoforge', 'stacks');
}

if (require.main === module) {
  try {
    const packRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
    mirrorPack({ packRoot, stacksDir: defaultStacksDir() });
  } catch (e) {
    process.stderr.write(`[aoforge] stack pack mirror skipped: ${e.message}\n`);
  }
  process.exit(0);
}

module.exports = { mirrorPack, listFiles, digestOf, defaultStacksDir };
