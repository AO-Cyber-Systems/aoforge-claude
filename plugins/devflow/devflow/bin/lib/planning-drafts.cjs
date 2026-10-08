'use strict';

/**
 * planning-drafts.cjs (TRD 69-01, TOOL-06) — the draft an agent edits before it hands a planning file to a verb with
 * `--from`, and the check that the draft is still based on the live file.
 *
 * A draft lives at `<os.tmpdir()>/devflow-drafts/<repoKey(main)>/<rel>` and is seeded from the live
 * `<main>/.planning/<rel>`. Before this module a draft was seeded once and never looked at again, so one left over from
 * an earlier session, or seeded before someone else changed the live file, was handed back as current and `doc put`
 * published it over that change (in store mode, to the wiki).
 *
 * Every draft now has a sidecar `<draft>.base.json` -> `{rel, sha256, seeded_at}`: the sha256 of the live text the
 * draft was seeded from (`null` when there was no live file). One sidecar per draft, never a shared manifest, so
 * parallel executors cannot lose each other's updates. A draft is STALE when the live file's sha256 no longer equals
 * its base.
 *
 * Why a base hash and not mtime: the agent's own edit makes the draft NEWER than a live file that changed after the
 * draft was seeded, so an mtime comparison misses exactly the case this exists for. mtime is only the fallback for a
 * draft with no usable base (one made before this module existed): older than the live file -> stale. Its limit: a
 * legacy draft seeded by an older version, edited, and newer than a live file that changed in between cannot be
 * detected. It is adopted (a base of the current live text is written) rather than refused.
 *
 * `prepareDraft` is `planning draft`: it seeds, and reseeds a stale draft, keeping the replaced draft at
 * `<draft>.stale`. `checkDraftBase` is the `doc put` guard: it refuses a stale draft and names the fix.
 * `recordPublished` moves the base to the published text, so publishing the same unchanged draft again is not refused.
 * stdin (`-`) and a file outside the drafts tree with no base record have nothing to compare and are never checked.
 *
 * Pure apart from fs: no process.exit, no output.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const planningPaths = require('./planning-paths.cjs');
const planningMode = require('./planning-mode.cjs');
const outbox = require('./gh-outbox.cjs');
const { atomicWrite } = require('./sync-state.cjs');

const DRAFTS_DIR = 'devflow-drafts';
const BASE_SUFFIX = '.base.json';
const STALE_SUFFIX = '.stale';

// ─── Paths ───────────────────────────────────────────────────────────────────

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** The MAIN checkout (D-14): drafts and the live file are keyed on it, so a linked worktree shares them. */
const mainOf = (root) => planningMode.resolveMainRoot(root) || path.resolve(String(root));

/** `<tmpdir>/devflow-drafts/<repoKey(main)>/<rel>`; throws TypeError (planning-paths' rule) for an unsafe rel. */
function draftFileFor(root, rel) {
  planningPaths.classify(rel);
  return path.join(os.tmpdir(), DRAFTS_DIR, outbox.repoKey(mainOf(root)), ...rel.split('/'));
}

/** `<main>/.planning/<rel>`: the file a draft is seeded from and published to. */
function liveFileFor(root, rel) {
  planningPaths.classify(rel);
  return path.join(mainOf(root), '.planning', ...rel.split('/'));
}

/** realpath of the deepest existing ancestor of `p` with the missing remainder re-appended (macOS /var vs /private/var). */
function realDeep(p) {
  const resolved = path.resolve(p);
  let cur = resolved;
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...rest);
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return resolved;
      rest.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

const samePath = (a, b) => realDeep(a) === realDeep(b);

// ─── Base records ────────────────────────────────────────────────────────────

/** The sidecar of `draft`, or null when it is missing, unparseable, or not `{rel: string, sha256: string|null}`. */
function readBase(draft) {
  const text = readOrNull(draft + BASE_SUFFIX);
  if (text === null) return null;
  try {
    const b = JSON.parse(text);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
    if (typeof b.rel !== 'string') return null;
    if (b.sha256 !== null && typeof b.sha256 !== 'string') return null;
    return b;
  } catch {
    return null;
  }
}

function writeBase(draft, rel, sha, now) {
  const record = { rel, sha256: sha, seeded_at: now.toISOString() };
  atomicWrite(draft + BASE_SUFFIX, `${JSON.stringify(record)}\n`);
}

/** The base of `draft` when it belongs to `rel`; a base for another document is no base here. */
function baseFor(draft, rel) {
  const b = readBase(draft);
  return b && b.rel === rel ? b : null;
}

// ─── The staleness rule ──────────────────────────────────────────────────────

/**
 * Is `draft` (a draft of `rel`) stale against the live file? `base` is the draft's own base record or null.
 *   live missing        -> not stale (nothing to be stale against)
 *   base                -> base.sha256 !== sha256(live)               reason 'base-changed'
 *   no base             -> the draft is older than the live file      reason 'older-than-live'
 * -> {stale, reason, live, liveSha}
 */
function staleness(root, rel, draft, base) {
  const livePath = liveFileFor(root, rel);
  const live = readOrNull(livePath);
  if (live === null) return { stale: false, reason: null, live: null, liveSha: null };
  const liveSha = sha256(live);
  if (base) {
    const stale = base.sha256 !== liveSha;
    return { stale, reason: stale ? 'base-changed' : null, live, liveSha };
  }
  let older = false;
  try {
    older = fs.statSync(draft).mtimeMs < fs.statSync(livePath).mtimeMs;
  } catch {
    older = false; // no draft file to compare
  }
  return { stale: older, reason: older ? 'older-than-live' : null, live, liveSha };
}

// ─── planning draft ──────────────────────────────────────────────────────────

/**
 * prepareDraft(root, rel, {now?}) — the draft for `rel`, ready to edit. Creates its directory.
 *   no draft           -> seeded from the live file (written, not copied: a copy can keep the source mtime) and a
 *                         base recorded (sha256 null when there is no live file, and then no draft file is created)
 *   draft, current     -> untouched (a draft without a base gets one: it is adopted)
 *   draft, stale       -> the old draft is kept at `<draft>.stale`, the draft is rewritten with the live text and the
 *                         base moves on; a draft whose text already equals the live text only refreshes the base
 * -> {path, seeded, reseeded, stale_copy, reason}. Throws TypeError for an unsafe rel.
 */
function prepareDraft(root, rel, { now = new Date() } = {}) {
  const file = draftFileFor(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const result = (extra) => ({ path: file, seeded: false, reseeded: false, stale_copy: null, reason: null, ...extra });

  if (!fs.existsSync(file)) {
    const live = readOrNull(liveFileFor(root, rel));
    if (live !== null) atomicWrite(file, live);
    writeBase(file, rel, live === null ? null : sha256(live), now);
    return result({ seeded: live !== null });
  }

  const base = baseFor(file, rel);
  const s = staleness(root, rel, file, base);
  if (s.live === null) return result();
  if (!s.stale) {
    if (!base) writeBase(file, rel, s.liveSha, now);
    return result();
  }

  const old = fs.readFileSync(file, 'utf8');
  if (old === s.live) {
    writeBase(file, rel, s.liveSha, now);
    return result();
  }
  const staleCopy = file + STALE_SUFFIX;
  atomicWrite(staleCopy, old);
  atomicWrite(file, s.live);
  writeBase(file, rel, s.liveSha, now);
  return result({ reseeded: true, stale_copy: staleCopy, reason: s.reason });
}

// ─── doc put ─────────────────────────────────────────────────────────────────

/**
 * Is `from` a draft of `rel` that the base record (or the canonical path) lets us check? -> the absolute path and its
 * base, or null for stdin, an empty value, a file with another document's base, and a file outside the drafts tree.
 */
function checkable(root, rel, from) {
  if (typeof from !== 'string' || from === '' || from === '-') return null;
  const abs = path.resolve(from);
  const base = readBase(abs);
  if (base) return base.rel === rel ? { abs, base } : null;
  return samePath(abs, draftFileFor(root, rel)) ? { abs, base: null } : null;
}

/**
 * checkDraftBase(root, rel, from) — may `doc put` publish `from`? {ok: true}, or
 * {ok: false, refused: 'stale draft', reason, draft, error} naming `df-tools planning draft <rel>` as the fix.
 */
function checkDraftBase(root, rel, from) {
  const c = checkable(root, rel, from);
  if (!c) return { ok: true };
  const s = staleness(root, rel, c.abs, c.base);
  if (!s.stale) return { ok: true };
  return {
    ok: false,
    refused: 'stale draft',
    reason: s.reason,
    draft: from,
    error:
      `the draft ${from} is stale: .planning/${rel} changed after the draft was seeded, so publishing it would ` +
      `overwrite that change. Run \`df-tools planning draft ${rel}\` to reseed it (it keeps your edits at ` +
      `${from}${STALE_SUFFIX}), re-apply them, then run doc put again.`,
  };
}

/**
 * recordPublished(root, rel, from, text, {now?}) — after `text` was published from `from`, make the draft's base the
 * published text so publishing it again is not refused. Same gating as checkDraftBase: stdin and a foreign file get
 * nothing, in particular no sidecar next to a user's file.
 */
function recordPublished(root, rel, from, text, { now = new Date() } = {}) {
  const c = checkable(root, rel, from);
  if (!c) return;
  writeBase(c.abs, rel, sha256(text), now);
}

module.exports = {
  DRAFTS_DIR,
  BASE_SUFFIX,
  STALE_SUFFIX,
  draftFileFor,
  liveFileFor,
  prepareDraft,
  checkDraftBase,
  recordPublished,
};
