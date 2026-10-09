'use strict';

/**
 * global-upgrade.cjs — bring the user-global `<home>/.claude` state forward (TRD 36-06, UPG-06).
 *
 * Two jobs, both run by sync-runtime.js after a successful mirror (bundled copy) and by
 * `aof-tools upgrade --global [--confirm]` (36-03):
 *
 * 1. Legacy install → backup. The pre-plugin installer left `.claude/skills/df-*`,
 *    `.claude/agents/df-*` and a stuck `.claude/aoforge/VERSION`. They are MOVED (never deleted) to
 *    `.claude/aoforge/backups/legacy-<ts>/{skills,agents,aoforge}/…` and an `info` notice says so.
 *    Non-`df-` siblings never move.
 *
 * 2. Managed block in `.claude/CLAUDE.md`, from templates/global-claude-md.md:
 *      <!-- AOFORGE:START v=<template_version> src=global-claude-md --> … <!-- AOFORGE:END -->
 *    - A block already present wins: it is rewritten only when the template version is higher
 *      (the TEMPLATE version, never the plugin version), and only the block bytes change.
 *    - No block but a hand-written "AOForge Routing" heading: the first run writes NOTHING and
 *      queues one `action` notice with the proposed diff. `confirm: true` replaces that section —
 *      its heading line up to (not including) the next heading line of ANY level — with the block.
 *    - Neither: the block is appended (the file is created if absent).
 *    - A malformed or duplicate block, or a block owned by another template: no write, one `warn`.
 *    - A block under the pre-rename markers is read like any other (managed-block, TRD 72-09) and is
 *      always stale, so the template rewrite moves it to AOFORGE markers in place: never two blocks.
 *      The hand-written heading is recognised under the old product name too.
 *    Before any write the previous file is copied to `.claude/aoforge/backups/global-<ts>/CLAUDE.md`.
 *
 * 3. Hand-written text OUTSIDE the block that still names the old product (TRD 72-09, INST-06): it
 *    is never rewritten silently. The proposal (legacy-rewrite over every byte outside the block, the
 *    block bytes copied) comes back as `outside: {lines, diff, applied, backup}` and, until approved,
 *    as one `action` notice whose detail is the unified diff. Only `confirm: true` writes it (backup
 *    first). sync-runtime never passes `confirm`.
 *
 * `userHome` is REQUIRED and never defaulted here — only sync-runtime and the CLI resolve the real
 * home. Dependencies: Node built-ins, ./managed-block.cjs, ./notices.cjs, ./legacy-rewrite.cjs and
 * ./legacy-names.cjs (and what those require: ./compat.cjs, ./text-escape.cjs), because the
 * sync-runtime test copies exactly that closure into a fake plugin root.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const managedBlock = require('./managed-block.cjs');
const notices = require('./notices.cjs');
const { rewriteLegacyNames, diffLines, unifiedDiff } = require('./legacy-rewrite.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

const SRC = 'global-claude-md';
const SOURCE = 'global-upgrade';
const DEFAULT_TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'global-claude-md.md');
const DISPLAY_PATH = '~/.claude/CLAUDE.md';

const KEYS = {
  legacy: 'global-legacy-moved',
  adopt: 'global-claude-md-adopt',
  block: 'global-claude-md-block',
  blocked: 'global-claude-md-blocked',
  outside: 'global-claude-md-outside',
};

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
// "AOForge Routing", or the same heading under the pre-rename product name (TRD 72-09).
const ROUTING_RE = new RegExp(`^(?:${escapeRegExp(NAMES.product)}|${escapeRegExp(LEGACY.product)}) Routing\\b`, 'i');
const LEGACY_DIRS = ['skills', 'agents'];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function requireHome(userHome, fn) {
  if (typeof userHome !== 'string' || userHome === '') {
    throw new TypeError(`${fn}: userHome is required (no default to the real home directory)`);
  }
  if (!path.isAbsolute(userHome)) {
    throw new TypeError(`${fn}: userHome must be an absolute path (got ${JSON.stringify(userHome)})`);
  }
}

function claudeDir(userHome) {
  return path.join(userHome, '.claude');
}

function backupsRoot(userHome) {
  return path.join(userHome, '.claude', 'aoforge', 'backups');
}

function claudeMdPath(userHome) {
  return path.join(userHome, '.claude', 'CLAUDE.md');
}

function stamp(now) {
  return now.toISOString().replace(/[:.]/g, '-');
}

/** `base`, or `base-1`, `base-2`, … when it already exists. Never creates anything. */
function uniqueDir(base) {
  if (!fs.existsSync(base)) return base;
  for (let i = 1; ; i++) {
    const candidate = `${base}-${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Byte-for-byte comparison of two trees (files, dirs, symlink targets). */
function sameTree(a, b) {
  const sa = fs.lstatSync(a);
  const sb = lstatOrNull(b);
  if (!sb) return false;
  if (sa.isSymbolicLink()) return sb.isSymbolicLink() && fs.readlinkSync(a) === fs.readlinkSync(b);
  if (sa.isDirectory()) {
    if (!sb.isDirectory()) return false;
    const ea = fs.readdirSync(a).sort();
    const eb = fs.readdirSync(b).sort();
    if (ea.length !== eb.length || ea.some((n, i) => n !== eb[i])) return false;
    return ea.every((n) => sameTree(path.join(a, n), path.join(b, n)));
  }
  return sb.isFile() && fs.readFileSync(a).equals(fs.readFileSync(b));
}

/**
 * Move one entry. `renameSync` first (same volume under `.claude`). On EXDEV only: copy, verify the
 * copy byte-for-byte, and only then remove the original — the removal is the second half of a
 * verified move, never a delete on its own. A failed verify leaves the original in place.
 */
function moveEntry(from, to) {
  try {
    fs.renameSync(from, to);
    return;
  } catch (err) {
    if (!err || err.code !== 'EXDEV') throw err;
  }
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
  if (!sameTree(from, to)) {
    throw new Error(`legacy move could not verify the copy of ${from}; the original was left in place`);
  }
  fs.rmSync(from, { recursive: true });
}

/** Write `text` to `file` via temp + rename, following a symlinked CLAUDE.md to its real target. */
function writeFileAtomic(file, text) {
  let target = file;
  try {
    target = fs.realpathSync(file);
  } catch {
    /* absent — create it at `file` */
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = lstatOrNull(target);
  const tmp = `${target}.df-tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, text);
    if (existing) fs.chmodSync(tmp, existing.mode & 0o7777);
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}

function prefixLines(text, mark) {
  return text
    .replace(/(?:\r?\n)+$/, '')
    .split(/\r?\n/)
    .map((l) => (l === '' ? mark : `${mark} ${l}`));
}

// ---------------------------------------------------------------------------
// legacy install
// ---------------------------------------------------------------------------

/**
 * findLegacy(userHome) -> ['skills/df-…', 'agents/df-…', 'aoforge/VERSION'] (relative to `.claude`,
 * posix separators, sorted within each group). Only `df-`-prefixed entries count.
 */
function findLegacy(userHome) {
  requireHome(userHome, 'findLegacy');
  const base = claudeDir(userHome);
  const out = [];
  for (const sub of LEGACY_DIRS) {
    let names;
    try {
      names = fs.readdirSync(path.join(base, sub));
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (name.startsWith('df-')) out.push(`${sub}/${name}`);
    }
  }
  if (lstatOrNull(path.join(base, 'aoforge', 'VERSION'))) out.push('aoforge/VERSION');
  return out;
}

/**
 * moveLegacy(userHome, rels = findLegacy(userHome), {now, dryRun, prefix}) -> {moved, backupDir}
 *
 * Renames each entry to `<home>/.claude/aoforge/backups/<prefix>-<ts>/<rel>`. Nothing is deleted.
 * `prefix` defaults to `legacy`; the doctor's legacy runtime check (TRD 72-15) passes its own
 * `legacy-…` prefix so the old runtime home lands in a directory named for it. backup-prune never
 * enters a `legacy-*` directory. `backupDir` is null when there is nothing to move. `dryRun`
 * reports without touching the disk.
 */
function moveLegacy(userHome, rels, { now = new Date(), dryRun = false, prefix = 'legacy' } = {}) {
  requireHome(userHome, 'moveLegacy');
  if (typeof prefix !== 'string' || !/^legacy(?:-[a-z0-9]+)*$/.test(prefix)) {
    throw new TypeError(`moveLegacy: prefix must be "legacy" or start with "legacy-" (got ${JSON.stringify(prefix)})`);
  }
  const list = rels === undefined ? findLegacy(userHome) : [...rels];
  if (list.length === 0) return { moved: [], backupDir: null };

  const backupDir = uniqueDir(path.join(backupsRoot(userHome), `${prefix}-${stamp(now)}`));
  if (dryRun) return { moved: list, backupDir };

  const moved = [];
  for (const rel of list) {
    const parts = rel.split('/');
    const from = path.join(claudeDir(userHome), ...parts);
    const to = path.join(backupDir, ...parts);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    moveEntry(from, to);
    moved.push(rel);
  }
  return { moved, backupDir };
}

// ---------------------------------------------------------------------------
// CLAUDE.md block
// ---------------------------------------------------------------------------

/** Heading lines outside fenced code: [{start, level, text}], `start` = offset of the line. */
function headings(text) {
  const out = [];
  let fence = null;
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(pos, lineEnd).replace(/\r$/, '');
    if (fence) {
      const c = FENCE_CLOSE_RE.exec(line);
      if (c && c[1][0] === fence[0] && c[1].length >= fence.length) fence = null;
    } else {
      const f = FENCE_OPEN_RE.exec(line);
      if (f) {
        fence = f[1];
      } else {
        const h = HEADING_RE.exec(line);
        if (h) out.push({ start: pos, level: h[1].length, text: h[2] });
      }
    }
    pos = nl === -1 ? text.length : nl + 1;
  }
  return out;
}

/**
 * findRoutingSection(text) -> {start, end, heading} | null
 *
 * `start` is the first heading line whose text begins "AOForge Routing", or the pre-rename product
 * name followed by "Routing" (heading lines only — a sentence mentioning it does not count). `end` is the start of the NEXT heading line of any level,
 * else text.length, so a `## TDD & Quality` subsection under it survives adoption.
 */
function findRoutingSection(text) {
  if (typeof text !== 'string') return null;
  const hs = headings(text);
  const i = hs.findIndex((h) => ROUTING_RE.test(h.text));
  if (i === -1) return null;
  return { start: hs[i].start, end: i + 1 < hs.length ? hs[i + 1].start : text.length, heading: hs[i].text };
}

/**
 * loadGlobalTemplate(templatePath) -> {version, body}
 *
 * `version` is the frontmatter `template_version`; `body` is everything after the frontmatter,
 * leading blank lines and trailing whitespace trimmed. This is what lives inside the block.
 */
function loadGlobalTemplate(templatePath = DEFAULT_TEMPLATE_PATH) {
  const text = fs.readFileSync(templatePath, 'utf-8').replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  const vm = fm && /^template_version:[ \t]*["']?([^"'\s]+)["']?[ \t]*$/m.exec(fm[1]);
  if (!vm) throw new Error(`global-claude-md template has no template_version frontmatter (${templatePath})`);
  const body = text.slice(fm[0].length).replace(/^\n+/, '').replace(/\s+$/, '');
  if (body === '') throw new Error(`global-claude-md template has an empty body (${templatePath})`);
  return { version: vm[1], body };
}

/**
 * planBlock(text, template, {confirm}) -> pure plan, no I/O.
 *
 *   {action:'none'}
 *   {action:'created'|'updated'|'adopted', next}            next = the full new file text
 *   {action:'adopt_pending', proposed, diff}                  nothing to write without confirm
 *   {action:'blocked', reason}
 *
 * `text` null means the file does not exist. An existing block always wins over the hand-written
 * section logic.
 */
function planBlock(text, template, { confirm = false } = {}) {
  const current = text == null ? '' : text;
  const meta = { v: template.version, src: SRC };

  let existing;
  try {
    existing = managedBlock.read(current);
  } catch (err) {
    return { action: 'blocked', reason: err.message };
  }

  if (existing) {
    if (existing.meta.src && existing.meta.src !== SRC) {
      return {
        action: 'blocked',
        reason: `the AOFORGE block belongs to src=${existing.meta.src}, not ${SRC}; refusing to rewrite it`,
      };
    }
    if (!managedBlock.isStale(existing, template.version)) return { action: 'none' };
    return {
      action: 'updated',
      from: existing.meta.v,
      next: managedBlock.upsert(current, template.body, meta),
    };
  }

  const section = findRoutingSection(current);
  if (section) {
    const block = managedBlock.render(template.body, meta);
    const proposed = section.end >= current.length
      ? `${current.slice(0, section.start)}${block}\n`
      : `${current.slice(0, section.start)}${block}\n\n${current.slice(section.end)}`;
    const diff = [
      ...prefixLines(current.slice(section.start, section.end), '-'),
      ...prefixLines(block, '+'),
    ].join('\n');
    return confirm
      ? { action: 'adopted', next: proposed, diff }
      : { action: 'adopt_pending', proposed, diff };
  }

  return { action: 'created', next: managedBlock.upsert(current, template.body, meta) };
}

/**
 * planOutside(text) -> {lines, diff, next}. Pure, no I/O.
 *
 * `text` is the file as the block step leaves it. Every byte outside its managed block goes through
 * legacy-rewrite; the block bytes are copied as they are (the template owns them). `lines` counts the
 * changed lines, `diff` is a unified diff of `text` -> `next` ('' when nothing changes). A malformed
 * block, or a null/empty text, proposes nothing.
 */
function planOutside(text) {
  const none = { lines: 0, diff: '', next: text };
  if (typeof text !== 'string' || text === '') return none;
  let block;
  try {
    block = managedBlock.read(text);
  } catch {
    return none; // planBlock already reported the malformed block; never rewrite around it
  }
  const next = block
    ? rewriteLegacyNames(text.slice(0, block.start)) + text.slice(block.start, block.end) + rewriteLegacyNames(text.slice(block.end))
    : rewriteLegacyNames(text);
  if (next === text) return none;
  return {
    lines: diffLines(text, next).filter((o) => o.op === '-').length,
    diff: unifiedDiff(text, next, { fromFile: DISPLAY_PATH, toFile: `${DISPLAY_PATH} (proposed)` }),
    next,
  };
}

function backupClaudeMd(userHome, file, now) {
  const dir = uniqueDir(path.join(backupsRoot(userHome), `global-${stamp(now)}`));
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'CLAUDE.md');
  fs.copyFileSync(file, dest);
  return dest;
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

/**
 * runGlobalUpgrade({userHome, pluginVersion, templatePath, confirm, dryRun, now})
 *   -> {dryRun, legacy:{moved, backupDir}, block:{action, backup, from, to},
 *       outside:{lines, diff, applied, backup}, notices}
 *
 * `notices` lists what was queued (or, on dryRun, what would be). `pluginVersion` only colours the
 * notice text; block staleness is the template version alone. `outside` is the proposal for the
 * hand-written text outside the block: `applied` (and `backup`) only on a non-dry run with `confirm`.
 */
function runGlobalUpgrade({
  userHome,
  pluginVersion = null,
  templatePath = DEFAULT_TEMPLATE_PATH,
  confirm = false,
  dryRun = false,
  now = new Date(),
} = {}) {
  requireHome(userHome, 'runGlobalUpgrade');

  // Load the template first so a broken install fails before anything moves.
  const template = loadGlobalTemplate(templatePath);
  const noticesFile = notices.globalNoticesPath(userHome);
  const queued = [];
  const queue = (n) => {
    const notice = { source: SOURCE, ...n };
    if (dryRun) {
      queued.push(notice);
      return;
    }
    const stored = notices.appendNotice(noticesFile, notice, { now });
    if (stored) queued.push(stored);
  };
  const who = pluginVersion ? `AOForge v${pluginVersion}` : 'AOForge';

  // 1. legacy install
  const legacy = moveLegacy(userHome, findLegacy(userHome), { now, dryRun });
  if (legacy.moved.length > 0) {
    queue({
      level: 'info',
      key: KEYS.legacy,
      message: `${who} moved ${legacy.moved.length} legacy v1 install file(s) out of ~/.claude to ${legacy.backupDir} (nothing was deleted).`,
      detail: legacy.moved.map((r) => `- ${r}`).join('\n'),
    });
  }

  // 2. managed block in CLAUDE.md
  const file = claudeMdPath(userHome);
  const current = readIfExists(file);
  const plan = planBlock(current, template, { confirm });
  const block = { action: plan.action, backup: null, from: plan.from == null ? null : plan.from, to: template.version };

  // 3. hand-written text outside the block, as the block step leaves the file. A pending adoption is
  //    measured on its proposal, so the one `--confirm` the user is told about covers both changes.
  let base = null;
  if (plan.action === 'adopt_pending') base = plan.proposed;
  else if (plan.next !== undefined) base = plan.next;
  else if (plan.action === 'none') base = current;
  const proposal = planOutside(base);
  const outside = { lines: proposal.lines, diff: proposal.diff, applied: false, backup: null };
  const writeOutside = confirm && proposal.lines > 0;
  const nextText = writeOutside ? proposal.next : plan.next;

  if (plan.action === 'adopt_pending') {
    queue({
      level: 'action',
      key: KEYS.adopt,
      message: `${DISPLAY_PATH} has a hand-written "AOForge Routing" section. Run \`aof-tools upgrade --global --confirm\` `
        + `(node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global --confirm) to replace just that section with the `
        + `managed AOForge block (v${template.version}); nothing else in the file changes and a backup is kept.`,
      detail: plan.diff,
    });
  } else if (plan.action === 'blocked') {
    queue({
      level: 'warn',
      key: KEYS.blocked,
      message: `${who} left ${DISPLAY_PATH} untouched: ${plan.reason}. Fix the AOFORGE markers by hand to let it update.`,
    });
  } else if (nextText !== undefined && !dryRun) {
    if (current !== null) block.backup = backupClaudeMd(userHome, file, now);
    writeFileAtomic(file, nextText);
    if (writeOutside) {
      outside.applied = true;
      outside.backup = block.backup;
    }
  }

  const backupNote = block.backup ? ` Backup: ${block.backup}.` : '';
  if (outside.applied) {
    // Same key as the pending notice, so an unshown "action" notice is superseded rather than left stale.
    queue({
      level: 'info',
      key: KEYS.outside,
      message: `${who} rewrote ${outside.lines} hand-written line(s) outside the managed block of ${DISPLAY_PATH} `
        + `from ${LEGACY.product} to ${NAMES.product} names, as approved with --confirm.${backupNote}`,
      detail: outside.diff,
    });
  } else if (outside.lines > 0) {
    queue({
      level: 'action',
      key: KEYS.outside,
      message: `${DISPLAY_PATH} has ${outside.lines} hand-written line(s) outside the managed block that still name `
        + `${LEGACY.product}. They are never rewritten silently: review the diff, then run \`aof-tools upgrade --global --confirm\` `
        + `(node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --global --confirm) to rewrite them to ${NAMES.product}; `
        + 'a backup is kept.',
      detail: outside.diff,
    });
  }
  if (plan.action === 'created') {
    queue({
      level: 'info',
      key: KEYS.block,
      message: `${who} added its managed routing block (v${template.version}) to ${DISPLAY_PATH}; text outside the AOFORGE markers is never touched.${backupNote}`,
    });
  } else if (plan.action === 'updated') {
    queue({
      level: 'info',
      key: KEYS.block,
      message: `${who} updated the AOForge block in ${DISPLAY_PATH} from v${plan.from == null ? 'legacy' : plan.from} to v${template.version}; only the block changed.${backupNote}`,
    });
  } else if (plan.action === 'adopted') {
    // Same key as the pending notice, so an unshown "action" notice is superseded rather than left stale.
    queue({
      level: 'info',
      key: KEYS.adopt,
      message: `${who} replaced the hand-written "AOForge Routing" section of ${DISPLAY_PATH} with the managed block (v${template.version}).${backupNote}`,
    });
  }

  return { dryRun, legacy, block, outside, notices: queued };
}

module.exports = {
  findLegacy,
  moveLegacy,
  findRoutingSection,
  loadGlobalTemplate,
  planBlock,
  planOutside,
  runGlobalUpgrade,
  KEYS,
  SRC,
  DEFAULT_TEMPLATE_PATH,
};
