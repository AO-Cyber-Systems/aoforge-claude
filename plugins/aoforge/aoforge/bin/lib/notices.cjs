'use strict';

/**
 * notices.cjs — a tiny queue of one-shot user notices (TRD 36-02, UPG-02).
 *
 * Writers: the SessionStart upgrade hook (36-05) and the global upgrade (36-06).
 * Reader:  hooks/route-results.js (36-05) emits unconsumed notices once on the next prompt.
 *
 * Files:
 *   project: <projectRoot>/.planning/.aoforge-notices.json
 *   global:  <userHome>/.claude/aoforge/.aoforge-notices.json   (userHome is REQUIRED; no default)
 *
 * Shape:
 *   { "schema": 1, "notices": [ { "id": "n-<ms>-<hex6>", "ts": "<iso>", "source": "...",
 *     "level": "info|warn|action", "message": "one line", "detail": null, "key": null,
 *     "consumed": false } ] }
 *
 * Contract:
 *   - Writes are atomic: write `<file>.tmp-<pid>-<rand>` in the same dir, then rename.
 *   - A notice whose `key` matches an existing UNCONSUMED notice replaces it (no duplicates).
 *   - A missing or malformed file reads as [] and is never overwritten by append or take — a hook
 *     must never crash, and must never destroy a file it cannot understand.
 *
 * Requires only Node built-ins: 36-06's sync-runtime test copies this file into a fake plugin root.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA = 1;
const LEVELS = ['info', 'warn', 'action'];
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DETAIL_MAX_LINES = 40;

function projectNoticesPath(projectRoot) {
  if (!projectRoot) throw new TypeError('projectNoticesPath: projectRoot is required');
  return path.join(projectRoot, '.planning', '.aoforge-notices.json');
}

function globalNoticesPath(userHome) {
  if (!userHome) throw new TypeError('globalNoticesPath: userHome is required (no default to os.homedir())');
  return path.join(userHome, '.claude', 'aoforge', '.aoforge-notices.json');
}

/**
 * Load a notices file.
 * @returns {{state:'missing'|'malformed'|'ok', data?:{schema:number, notices:object[]}}}
 */
function loadStore(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    return { state: err && err.code === 'ENOENT' ? 'missing' : 'malformed' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'malformed' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.notices)) {
    return { state: 'malformed' };
  }
  const notices = parsed.notices.filter((n) => n && typeof n === 'object' && !Array.isArray(n));
  return { state: 'ok', data: { ...parsed, schema: parsed.schema || SCHEMA, notices } };
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}

/** All notices in `file`; [] when the file is missing or malformed. Never throws. */
function readNotices(file) {
  const store = loadStore(file);
  return store.state === 'ok' ? store.data.notices : [];
}

function validate(notice) {
  if (!notice || typeof notice !== 'object') throw new TypeError('appendNotice: notice must be an object');
  if (!LEVELS.includes(notice.level)) {
    throw new TypeError(`appendNotice: level must be one of ${LEVELS.join('|')} (got ${JSON.stringify(notice.level)})`);
  }
  if (typeof notice.source !== 'string' || notice.source === '') {
    throw new TypeError('appendNotice: source must be a non-empty string');
  }
  if (typeof notice.message !== 'string' || notice.message === '') {
    throw new TypeError('appendNotice: message must be a non-empty string');
  }
}

/**
 * Queue a notice. Replaces an unconsumed notice with the same `key`.
 *
 * @returns {object|null} the stored notice, or null when the file is malformed (left untouched).
 * @throws {TypeError} on an invalid notice (bad level, missing source/message) — a programming error.
 */
function appendNotice(file, notice, { now = new Date() } = {}) {
  validate(notice);
  const store = loadStore(file);
  if (store.state === 'malformed') return null;
  const data = store.state === 'ok' ? store.data : { schema: SCHEMA, notices: [] };

  const ts = now.toISOString();
  const entry = {
    id: `n-${Date.parse(ts)}-${crypto.randomBytes(3).toString('hex')}`,
    ts,
    source: notice.source,
    level: notice.level,
    message: notice.message,
    detail: notice.detail == null ? null : notice.detail,
    key: notice.key == null ? null : notice.key,
    consumed: false,
  };

  const idx = entry.key === null
    ? -1
    : data.notices.findIndex((n) => n.key === entry.key && n.consumed !== true);
  if (idx >= 0) data.notices[idx] = entry;
  else data.notices.push(entry);

  writeAtomic(file, data);
  return entry;
}

function tsMs(n) {
  const ms = Date.parse(n && n.ts);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Return every unconsumed notice across `files` (ts order), marking each consumed so it is returned
 * exactly once. Consumed notices older than 7 days are pruned. Missing/malformed files contribute
 * nothing and are not written. A file whose write fails contributes nothing either, so its notices
 * are shown later rather than twice. Never throws.
 */
function takeUnconsumed(files, { now = new Date() } = {}) {
  const nowMs = now.getTime();
  const taken = [];
  let order = 0;
  for (const file of Array.isArray(files) ? files : [files]) {
    if (!file) continue;
    const store = loadStore(file);
    if (store.state !== 'ok') continue;
    const data = store.data;

    const before = data.notices.length;
    data.notices = data.notices.filter((n) => !(n.consumed === true && nowMs - tsMs(n) > PRUNE_AFTER_MS));
    const pruned = data.notices.length !== before;

    const fresh = [];
    for (const n of data.notices) {
      if (n.consumed === true) continue;
      n.consumed = true;
      fresh.push(n);
    }
    if (fresh.length === 0 && !pruned) continue;

    try {
      writeAtomic(file, data);
    } catch {
      continue;
    }
    for (const n of fresh) taken.push({ n, order: order++ });
  }
  taken.sort((a, b) => tsMs(a.n) - tsMs(b.n) || a.order - b.order);
  return taken.map((t) => ({ ...t.n }));
}

/**
 * Markdown for a list of notices: a `## AOForge notices` heading and one `- [level] message` line
 * each, with `detail` indented beneath and capped at 40 lines. Empty list → ''.
 */
function renderNotices(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const lines = ['## AOForge notices', ''];
  for (const n of list) {
    const message = String(n.message == null ? '' : n.message).replace(/\s*\r?\n\s*/g, ' ');
    lines.push(`- [${n.level}] ${message}`);
    if (n.detail == null || n.detail === '') continue;
    const text = typeof n.detail === 'string' ? n.detail : JSON.stringify(n.detail, null, 2);
    const detailLines = text.replace(/(?:\r?\n)+$/, '').split(/\r?\n/);
    for (const l of detailLines.slice(0, DETAIL_MAX_LINES)) lines.push(`  ${l}`);
    if (detailLines.length > DETAIL_MAX_LINES) {
      lines.push(`  … (${detailLines.length - DETAIL_MAX_LINES} more lines)`);
    }
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  projectNoticesPath,
  globalNoticesPath,
  readNotices,
  appendNotice,
  takeUnconsumed,
  renderNotices,
  LEVELS,
};
