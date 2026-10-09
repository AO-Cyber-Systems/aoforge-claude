'use strict';

// gh-trd.cjs — the ONE pure codec for TRD issue bodies and their comment protocol.
//
// A TRD is posted to GitHub as an issue whose body is two header lines followed by
// the verbatim TRD file:
//
//   <!-- aoforge:id=47-01 -->
//   <!-- aoforge:file=47-01-gh-trd-codec-TRD.md -->
//   <the TRD file text, exactly>
//
// This module encodes/decodes that body byte-exactly, measures the scope budget on
// the FINAL posted string, orders scope comments strictly by `n`, computes the
// effective spec, decides a fold, and maintains the append-only `aoforge:spec-rev`
// log. It also owns the numbered-parts splitter used for oversized SUMMARY and
// VERIFICATION comments, and (48-02) the separate entity codec for todo, debug and
// quick issues (`encodeEntityBody` / `decodeEntityBody`).
//
// Pure: no fs, no child_process, no gh calls — only `crypto`, plus the name map and the
// regex escape for the two-namespace readers (TRD 72-11). It deliberately does
// NOT require gh-body or gh-mapping: the id canonicalisation below is duplicated on
// purpose (as gh-body duplicates gh-mapping's) and a test pins the two to the same
// output.
//
// Length unit: JS `.length` (UTF-16 units). GitHub counts characters, so `.length`
// over-counts astral characters — conservative, never optimistic.

const crypto = require('crypto');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

// Readers accept the legacy marker namespace as well (TRD 72-11, INST-03: a repository not yet rebranded keeps
// its TRD, entity, scope and part lines in it); every writer below spells the AOForge namespace only. Non-capturing,
// so no capture group moves. Removed with the other one-release shims (legacy-names.cjs SHIM_REMOVAL).
const NS = `(?:${escapeRegExp(NAMES.markerNs)}|${escapeRegExp(LEGACY.markerNs)})`;

// ─── Constants ───────────────────────────────────────────────────────────────

const TRD_TARGET_CHARS = 40000; // warn at and above this
const TRD_MAX_CHARS = 60000; // over this is refused
const COMMENT_MAX_CHARS = 60000;
const MAX_TRDS_PER_OBJECTIVE = 100;

// ─── Hashing and normalisation ───────────────────────────────────────────────

/**
 * normalise(text) — convert `\r\n` to `\n`. It never trims and never touches
 * trailing newlines or a lone `\r`: byte-exact round trips depend on that.
 */
function normalise(text) {
  if (typeof text !== 'string') {
    throw new TypeError(`expected a string, got ${text === null ? 'null' : typeof text}`);
  }
  return text.replace(/\r\n/g, '\n');
}

/**
 * contentHash(text) — `sha256:<64 hex>` of the normalised text. Same shape as
 * sync-state.cjs's hashFrontmatter values, so the two stores read alike.
 */
function contentHash(text) {
  return 'sha256:' + crypto.createHash('sha256').update(normalise(text), 'utf8').digest('hex');
}

// ─── Header lines ────────────────────────────────────────────────────────────

// Accepts `2.1`, `0`, `46` and the TRD form `46-02` — the same shape gh-body's
// MARKER_SOURCE accepts for its id group.
const ID_RE = /^(\d+)((?:\.\d+)?)((?:-\d+)?)$/;
const ID_LINE_RE = new RegExp(`^<!--\\s*${NS}:id=([0-9]+(?:\\.[0-9]+)?(?:-[0-9]+)?)\\s*-->$`);
const FILE_LINE_RE = new RegExp(`^<!--\\s*${NS}:file=(\\S+?)\\s*-->$`);
// A file name is a single path segment: letters, digits, `.`, `_`, `-`; no
// leading dot, no `..`, no separators. Keeps `aoforge:file=` from steering a
// pull outside `.aoforge/objectives/<dir>/`.
const SAFE_FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

function canonicalId(id) {
  if (id === null || id === undefined) return null;
  const m = ID_RE.exec(String(id).trim());
  if (!m) return null;
  return String(parseInt(m[1], 10)) + m[2] + m[3];
}

function requireId(id) {
  const cid = canonicalId(id);
  if (cid === null) throw new TypeError(`invalid aoforge id: ${JSON.stringify(id)}`);
  return cid;
}

function isSafeFileName(name) {
  return typeof name === 'string' && SAFE_FILE_RE.test(name) && !name.includes('..');
}

function idLine(id) {
  return `<!-- aoforge:id=${requireId(id)} -->`;
}

/** fileLine(name) — `<!-- aoforge:file=<name> -->`. Throws TypeError for an unsafe name. */
function fileLine(name) {
  if (!isSafeFileName(name)) {
    throw new TypeError(`invalid aoforge file name: ${JSON.stringify(name)}`);
  }
  return `<!-- aoforge:file=${name} -->`;
}

/** parseFileLine(line) — the file name in a file line, or null (also for an unsafe name). */
function parseFileLine(line) {
  if (typeof line !== 'string') return null;
  const m = FILE_LINE_RE.exec(line.trim());
  if (!m) return null;
  return isSafeFileName(m[1]) ? m[1] : null;
}

// ─── Entity header lines (48-02) ─────────────────────────────────────────────
//
// Todos, debug sessions and quick tasks are issues too (objective 48, D-03). Their
// ids are NOT numeric, so they get their own id-line regex: ID_LINE_RE stays
// numeric-only, which keeps decodeTrdBody (and so gh-cache's TRD materialise) from
// ever reading an entity body as a TRD.
//
//   todo-<stem>    debug-<stem>    quick-<N>
//
// `<stem>` is the lowercased file stem (todo files are dated, e.g.
// `todo-2026-07-31-harden-aof-tools-health`). This layer only validates ids; the
// verb layer builds them.
const ENTITY_ID_SOURCE = '(?:(?:todo|debug)-[a-z0-9][a-z0-9._-]{0,99}|quick-\\d+)';
const ENTITY_ID_RE = new RegExp('^' + ENTITY_ID_SOURCE + '$');
const ENTITY_ID_LINE_RE = new RegExp(`^<!--\\s*${NS}:id=(` + ENTITY_ID_SOURCE + ')\\s*-->$');

function requireEntityId(id) {
  if (typeof id !== 'string' || !ENTITY_ID_RE.test(id)) {
    throw new TypeError(`invalid aoforge entity id: ${JSON.stringify(id)}`);
  }
  return id;
}

/**
 * isSafeEntityPath(path) — true for a path RELATIVE TO `.aoforge/` made of safe
 * file-name segments joined by `/` (e.g. `todos/pending/x.md`,
 * `quick/12-fix-x/12-JOB.md`). No leading or trailing `/`, no empty segment, no
 * dot-prefixed segment, no `..`, no backslash: an entity body's file line can steer
 * a pull to a location under `.aoforge/`, never outside it and never onto a
 * runtime dotfile.
 */
function isSafeEntityPath(p) {
  return typeof p === 'string' && p !== '' && p.split('/').every(isSafeFileName);
}

function entityFileLine(p) {
  if (!isSafeEntityPath(p)) {
    throw new TypeError(`invalid aoforge entity file path: ${JSON.stringify(p)}`);
  }
  return `<!-- aoforge:file=${p} -->`;
}

function parseEntityFileLine(line) {
  if (typeof line !== 'string') return null;
  const m = FILE_LINE_RE.exec(line.trim());
  if (!m) return null;
  return isSafeEntityPath(m[1]) ? m[1] : null;
}

// ─── Body codec ──────────────────────────────────────────────────────────────

/**
 * encodeTrdBody({id, file, text}) — the issue body for a TRD:
 * id line, file line, then the verbatim (CRLF-normalised) file text.
 */
function encodeTrdBody({ id, file, text } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`TRD text must be a string, got ${text === null ? 'null' : typeof text}`);
  }
  return idLine(id) + '\n' + fileLine(file) + '\n' + normalise(text);
}

const NOT_A_TRD_BODY = 'not an aoforge TRD body';

/**
 * decodeHeader(body, idLineRe, parseFile) — the strict two-line parse shared by
 * decodeTrdBody and decodeEntityBody: `{rawId, file, text}`, or null when either
 * header line is missing, malformed or out of order. `text` is the remainder after
 * exactly `idLine\n fileLine\n`, verbatim.
 */
function decodeHeader(body, idLineRe, parseFile) {
  if (typeof body !== 'string') return null;
  const s = normalise(body);

  const nl1 = s.indexOf('\n');
  if (nl1 === -1) return null;
  const m1 = idLineRe.exec(s.slice(0, nl1).trim());
  if (!m1) return null;

  const rest = s.slice(nl1 + 1);
  const nl2 = rest.indexOf('\n');
  // The second header line may be the last thing in the body when the file text
  // is empty and a trailing newline was stripped in transit.
  const line2 = nl2 === -1 ? rest : rest.slice(0, nl2);
  const file = parseFile(line2);
  if (file === null) return null;

  return { rawId: m1[1], file, text: nl2 === -1 ? '' : rest.slice(nl2 + 1) };
}

/**
 * decodeTrdBody(body) — reverse of encodeTrdBody. Verifies BOTH header lines and
 * their order; anything else (a human-created issue, a comment, an entity body) is
 * `{ok:false, error}`. Never throws. On success the remainder after exactly
 * `idLine\n fileLine\n` is returned verbatim as `text`.
 */
function decodeTrdBody(body) {
  const h = decodeHeader(body, ID_LINE_RE, parseFileLine);
  if (h === null) return { ok: false, error: NOT_A_TRD_BODY };
  const id = canonicalId(h.rawId);
  if (id === null) return { ok: false, error: NOT_A_TRD_BODY };
  return { ok: true, id, file: h.file, text: h.text };
}

// ─── Entity body codec (48-02) ───────────────────────────────────────────────
//
//   <!-- aoforge:id=todo-2026-07-31-a -->
//   <!-- aoforge:file=todos/pending/2026-07-31-a.md -->
//   <the entity file text, exactly>
//
// The file line carries the path relative to `.aoforge/` so a pull rebuilds the
// exact location. A separate codec from the TRD one: neither decoder accepts the
// other's body.

/**
 * encodeEntityBody({id, file, text}) — the issue body for a todo, debug session or
 * quick task. Throws TypeError for an id outside the entity grammar, an unsafe
 * `.aoforge/`-relative path, or a non-string text.
 */
function encodeEntityBody({ id, file, text } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`entity text must be a string, got ${text === null ? 'null' : typeof text}`);
  }
  const head = `<!-- aoforge:id=${requireEntityId(id)} -->`;
  return head + '\n' + entityFileLine(file) + '\n' + normalise(text);
}

const NOT_AN_ENTITY_BODY = 'not an aoforge entity body';

/**
 * decodeEntityBody(body) — reverse of encodeEntityBody: `{ok:true, id, file, text}`
 * or `{ok:false, error}` (a TRD body, a human-written body, a non-string). Never
 * throws.
 */
function decodeEntityBody(body) {
  const h = decodeHeader(body, ENTITY_ID_LINE_RE, parseEntityFileLine);
  if (h === null) return { ok: false, error: NOT_AN_ENTITY_BODY };
  return { ok: true, id: h.rawId, file: h.file, text: h.text };
}

// ─── Budget ──────────────────────────────────────────────────────────────────

/**
 * budget(body) — `{chars, status}` where status is `ok` below 40,000, `warn` from
 * 40,000 to 60,000 inclusive and `over` above 60,000. `body` MUST be the final
 * encoded issue body (header included): the limit applies to the posted string,
 * never to the file.
 */
function budget(body) {
  if (typeof body !== 'string') {
    throw new TypeError(`budget() needs the encoded body string, got ${typeof body}`);
  }
  const chars = body.length;
  let status = 'ok';
  if (chars > TRD_MAX_CHARS) status = 'over';
  else if (chars >= TRD_TARGET_CHARS) status = 'warn';
  return { chars, status };
}

/**
 * checkObjectiveBudgets(trds) — gate for a whole objective, run BEFORE the first
 * issue is created. `trds` is `[{id, file, text}]`. Refuses (`ok:false`) when any
 * TRD's encoded body is over 60,000 chars, when a TRD cannot be encoded at all, or
 * when there are more than 100 TRDs; names EVERY offender, never just the first.
 *
 * -> { ok, over:[{id,chars}], warn:[{id,chars}], invalid:[{id,error}], error? }
 */
function checkObjectiveBudgets(trds) {
  if (!Array.isArray(trds)) throw new TypeError('checkObjectiveBudgets() needs an array of TRDs');

  const over = [];
  const warn = [];
  const invalid = [];
  for (const trd of trds) {
    const id = trd && trd.id;
    let body;
    try {
      body = encodeTrdBody(trd);
    } catch (err) {
      invalid.push({ id, error: err.message });
      continue;
    }
    const { chars, status } = budget(body);
    if (status === 'over') over.push({ id, chars });
    else if (status === 'warn') warn.push({ id, chars });
  }

  const problems = [];
  if (trds.length > MAX_TRDS_PER_OBJECTIVE) {
    problems.push(`objective has ${trds.length} TRDs; the limit is ${MAX_TRDS_PER_OBJECTIVE}`);
  }
  for (const o of over) {
    problems.push(`TRD ${o.id} is ${o.chars} chars (limit ${TRD_MAX_CHARS})`);
  }
  for (const i of invalid) {
    problems.push(`TRD ${i.id} cannot be encoded: ${i.error}`);
  }

  const result = { ok: problems.length === 0, over, warn, invalid };
  if (problems.length > 0) result.error = problems.join('; ');
  return result;
}

// ─── Scope comments ──────────────────────────────────────────────────────────

// Scope comments open with `<!-- aoforge:scope n=K -->`. gh-body's MARKER_SOURCE
// does NOT match this form, so it has its own scanner, applied to the FIRST line
// of a comment only.
const SCOPE_LINE_RE = new RegExp(`^\\s*<!--\\s*${NS}:scope\\s+n=(\\d+)\\s*-->`);

/** scopeMarker(n) — `<!-- aoforge:scope n=K -->`. `n` must be a positive integer. */
function scopeMarker(n) {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new TypeError(`scope n must be a positive integer, got ${JSON.stringify(n)}`);
  }
  return `<!-- aoforge:scope n=${n} -->`;
}

/**
 * buildScopeComment(n, text) — the comment body for scope change `n`.
 *
 * Returns the comment STRING when it fits in COMMENT_MAX_CHARS. A comment over the
 * limit is refused, never trimmed: `{ok:false, overflow:true, chars, max, error}` —
 * the overflow becomes a new TRD (the TRD-creating verb is objective 48). Callers
 * discriminate on `typeof result === 'string'`.
 */
function buildScopeComment(n, text) {
  const marker = scopeMarker(n);
  if (typeof text !== 'string') {
    throw new TypeError(`scope text must be a string, got ${text === null ? 'null' : typeof text}`);
  }
  const comment = marker + '\n' + normalise(text);
  if (comment.length > COMMENT_MAX_CHARS) {
    return {
      ok: false,
      overflow: true,
      chars: comment.length,
      max: COMMENT_MAX_CHARS,
      error: `scope comment is ${comment.length} chars (limit ${COMMENT_MAX_CHARS}); split it into a new TRD`,
    };
  }
  return comment;
}

// A comment's author login and timestamp, or null when the comment lacks them.
function commentAuthor(c) {
  return c && c.user && typeof c.user.login === 'string' && c.user.login !== '' ? c.user.login : null;
}
function commentCreatedAt(c) {
  return c && typeof c.created_at === 'string' && c.created_at !== '' ? c.created_at : null;
}

// Comment ids are REST ids (numbers, or numeric strings). Compare numerically
// when both are numeric — `Infinity` stands for a comment not posted yet and sorts
// last — otherwise fall back to string order.
function commentIdOrder(a, b) {
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);
  const x = num(a);
  const y = num(b);
  if (x !== null && y !== null) return x < y ? -1 : x > y ? 1 : 0;
  const s = String(a);
  const t = String(b);
  return s < t ? -1 : s > t ? 1 : 0;
}

/**
 * parseScopeComments(comments) — `comments` is `[{id, body, user?, created_at?}]`
 * (GitHub REST subset).
 *
 * -> { scopes:[{n, text, body, comment_id, author, created_at}], errors:[string] }
 *
 * `author` is the comment's `user.login` and `created_at` its timestamp; each is
 * `null` when the comment does not carry it (49-03: acceptance needs both).
 *
 * Scopes are ordered STRICTLY by `n` (never by created_at or comment id: those
 * disagree after an edit or an outbox replay). Non-scope comments are ignored.
 * Problems are reported, not thrown, so the caller decides what to do:
 *   - `gap before n=K`            — K is not previous+1 (the sequence starts at 1)
 *   - `duplicate n=K (...)`       — the lowest comment id is kept, the rest ignored
 *   - `invalid scope n=0 (...)`   — n < 1; the comment is skipped
 * `text` is everything after the marker line; `body` is the full comment, marker
 * included, so a reader of the effective spec sees where each change begins.
 */
function parseScopeComments(comments) {
  if (!Array.isArray(comments)) throw new TypeError('parseScopeComments() needs an array of comments');

  const errors = [];
  const found = [];
  for (const c of comments) {
    if (!c || typeof c.body !== 'string') continue;
    const body = normalise(c.body);
    const nl = body.indexOf('\n');
    const m = SCOPE_LINE_RE.exec(nl === -1 ? body : body.slice(0, nl));
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isSafeInteger(n) || n < 1) {
      errors.push(`invalid scope n=${m[1]} (comment ${String(c.id)})`);
      continue;
    }
    found.push({
      n,
      text: nl === -1 ? '' : body.slice(nl + 1),
      body,
      comment_id: c.id,
      author: commentAuthor(c),
      created_at: commentCreatedAt(c),
    });
  }

  found.sort((a, b) => a.n - b.n || commentIdOrder(a.comment_id, b.comment_id));

  const scopes = [];
  const ignored = new Map(); // n -> [comment ids not kept]
  for (const f of found) {
    const prev = scopes[scopes.length - 1];
    if (prev && prev.n === f.n) {
      if (!ignored.has(f.n)) ignored.set(f.n, []);
      ignored.get(f.n).push(f.comment_id);
      continue;
    }
    scopes.push(f);
  }

  let expected = 1;
  for (const s of scopes) {
    if (ignored.has(s.n)) {
      errors.push(
        `duplicate n=${s.n} (comment ${String(s.comment_id)} kept, ` +
          `${ignored.get(s.n).map(String).join(', ')} ignored)`
      );
    }
    if (s.n !== expected) errors.push(`gap before n=${s.n}`);
    expected = s.n + 1;
  }

  return { scopes, errors };
}

/**
 * effectiveSpec(text, comments, {foldedThrough, id, file, accept}) — the TRD text plus
 * every applied scope comment, in `n` order, each as `"\n\n" + <full comment body>`.
 * Scopes with `n <= foldedThrough` are skipped: a fold already put them in the body.
 *
 * -> { text, chars, applied:[n], overflow, errors }            (no `accept`)
 * -> { text, chars, applied:[n], overflow, errors, pending }   (with `accept`)
 *
 * `accept` (49-03) is a predicate `(scope) => 'accepted' | 'pending'` over a
 * parseScopeComments scope — build it with scopeAcceptance(). Only a scope for which it
 * returns exactly 'accepted' is applied; every other unfolded scope is listed in
 * `pending: [{n, author, comment_id}]` and left out of `text` and `chars`. With no
 * `accept` (undefined or null) every scope applies and there is no `pending` key —
 * today's behaviour, unchanged.
 *
 * `chars` is the length of the ENCODED body when `id` and `file` are given (the
 * figure the 60,000 limit applies to); without them it is the effective text length
 * only and does not include the two header lines. `overflow` is `chars > 60,000`;
 * the spec is returned either way so the caller can report it.
 */
function effectiveSpec(text, comments, { foldedThrough = 0, id, file, accept } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`effectiveSpec() text must be a string, got ${text === null ? 'null' : typeof text}`);
  }
  if (!Number.isSafeInteger(foldedThrough) || foldedThrough < 0) {
    throw new TypeError(`foldedThrough must be a non-negative integer, got ${JSON.stringify(foldedThrough)}`);
  }
  if (accept !== undefined && accept !== null && typeof accept !== 'function') {
    throw new TypeError(`effectiveSpec() accept must be a function, got ${typeof accept}`);
  }
  const { scopes, errors } = parseScopeComments(comments);

  let out = normalise(text);
  const applied = [];
  const pending = [];
  for (const s of scopes) {
    if (s.n <= foldedThrough) continue;
    if (accept && accept(s) !== 'accepted') {
      pending.push({ n: s.n, author: s.author, comment_id: s.comment_id });
      continue;
    }
    out += '\n\n' + s.body;
    applied.push(s.n);
  }

  const chars =
    id !== undefined && file !== undefined ? encodeTrdBody({ id, file, text: out }).length : out.length;
  const result = { text: out, chars, applied, overflow: chars > TRD_MAX_CHARS, errors };
  if (accept) result.pending = pending;
  return result;
}

// ─── Scope acceptance (49-03, GPR-05) ────────────────────────────────────────
//
// A scope comment changes a TRD's effective spec, so WHO may change it matters.
// A scope is ACCEPTED when any of these holds, and PENDING otherwise:
//
//   1. its author is an assignee of the objective's issue;
//   2. its author is the AOForge GitHub App login (`github.app_login`, objective 50);
//   3. the spec-rev log holds a `scope n=K scope_hash=H` row for it whose H equals the
//      hash of the scope's CURRENT text (AOForge posted it; locally that happens with
//      the developer's own token, so the login alone cannot tell);
//   4. an assignee posted `<!-- aoforge:scope-confirm n=K hash=H -->` after the scope,
//      naming the same n and the scope's CURRENT text hash.
//
// Routes 3 and 4 bind the CONTENT hash, so editing a scope after it was posted or
// confirmed drops it back to pending. Everything here is pure: the caller (gh-comments,
// 49-06) gathers assignees, spec-rev rows and confirms and hands them in.
//
// Not detected here: someone other than a confirm's author editing that confirm
// comment on GitHub. Its `user.login` is still the original author.

const SCOPE_CONFIRM_LINE_RE = new RegExp(`^\\s*<!--\\s*${NS}:scope-confirm\\s+n=(\\d+)\\s+hash=([^\\s<>]+)\\s*-->`);
const SCOPE_ROW_EVENT_RE = /^scope\s+n=(\d+)\s+scope_hash=(\S+)\s*$/;
const CONFIRM_HASH_RE = /^[^\s<>]+$/;
const EVENT_HASH_RE = /^[^\s|]+$/;

function requireScopeN(n) {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new TypeError(`scope n must be a positive integer, got ${JSON.stringify(n)}`);
  }
  return n;
}

/**
 * scopeHash(scopeText) — the content hash of a scope comment's text (everything after
 * its marker line), CRLF-normalised. The hash a spec-rev `scope_hash=` and a confirm
 * `hash=` both bind.
 */
function scopeHash(scopeText) {
  return contentHash(scopeText);
}

/**
 * scopeEvent(n, hash) — the spec-rev `event` cell for an AOForge-posted scope:
 * `scope n=K scope_hash=H`. It still begins `scope`, so detectDrift keeps skipping it.
 */
function scopeEvent(n, hash) {
  requireScopeN(n);
  if (typeof hash !== 'string' || !EVENT_HASH_RE.test(hash)) {
    throw new TypeError(`scope_hash must be a non-empty string without whitespace or "|", got ${JSON.stringify(hash)}`);
  }
  return `scope n=${n} scope_hash=${hash}`;
}

/**
 * aoforgeScopesFrom(specRev) — `parseSpecRev(...)` output (or its `entries` array) ->
 * `[{n, hash}]` for every row written as `scope n=K scope_hash=H`, in log order. A legacy
 * `scope n=K` row has no `scope_hash`, binds no content, and yields nothing: it is not
 * trusted (those scopes need an assignee author or a confirm).
 */
function aoforgeScopesFrom(specRev) {
  const entries = Array.isArray(specRev)
    ? specRev
    : specRev && Array.isArray(specRev.entries)
      ? specRev.entries
      : [];
  const out = [];
  for (const e of entries) {
    if (!e || typeof e.event !== 'string') continue;
    const m = SCOPE_ROW_EVENT_RE.exec(e.event);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isSafeInteger(n) || n < 1) continue;
    out.push({ n, hash: m[2] });
  }
  return out;
}

/**
 * buildScopeConfirm({n, hash, note}) — the comment an assignee posts to confirm scope
 * `n`: the marker line `<!-- aoforge:scope-confirm n=K hash=H -->`, then `note` when
 * given. Throws TypeError on a bad n, hash or note. Over COMMENT_MAX_CHARS it is
 * refused (never trimmed): `{ok:false, overflow:true, chars, max, error}`; callers
 * discriminate on `typeof result === 'string'`, as for buildScopeComment.
 */
function buildScopeConfirm({ n, hash, note } = {}) {
  requireScopeN(n);
  if (typeof hash !== 'string' || !CONFIRM_HASH_RE.test(hash)) {
    throw new TypeError(`confirm hash must be a non-empty string without whitespace, "<" or ">", got ${JSON.stringify(hash)}`);
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    throw new TypeError(`confirm note must be a string, got ${typeof note}`);
  }
  const marker = `<!-- aoforge:scope-confirm n=${n} hash=${hash} -->`;
  const comment = note ? marker + '\n' + normalise(note) : marker;
  if (comment.length > COMMENT_MAX_CHARS) {
    return {
      ok: false,
      overflow: true,
      chars: comment.length,
      max: COMMENT_MAX_CHARS,
      error: `scope confirmation is ${comment.length} chars (limit ${COMMENT_MAX_CHARS}); shorten the note`,
    };
  }
  return comment;
}

/**
 * parseScopeConfirms(comments) — `[{id, body, user?, created_at?}]` ->
 * `[{n, hash, author, comment_id, created_at}]`, in the order given. Only the FIRST line
 * of a comment is read, like a scope marker. A marker with no hash, an `n` below 1 or an
 * `n` that is not a number is ignored. `author` and `created_at` are null when absent.
 */
function parseScopeConfirms(comments) {
  if (!Array.isArray(comments)) throw new TypeError('parseScopeConfirms() needs an array of comments');
  const out = [];
  for (const c of comments) {
    if (!c || typeof c.body !== 'string') continue;
    const body = normalise(c.body);
    const nl = body.indexOf('\n');
    const m = SCOPE_CONFIRM_LINE_RE.exec(nl === -1 ? body : body.slice(0, nl));
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isSafeInteger(n) || n < 1) continue;
    out.push({ n, hash: m[2], author: commentAuthor(c), comment_id: c.id, created_at: commentCreatedAt(c) });
  }
  return out;
}

// Logins compare case-insensitively (GitHub treats them so). Empty or non-string is no login.
function loginKey(v) {
  return typeof v === 'string' && v !== '' ? v.toLowerCase() : null;
}

// Is `later` posted after `earlier`? By created_at when both parse and differ; otherwise
// (equal, missing or unparseable) by comment id. Equal everywhere is NOT after: fail closed.
function postedAfter(later, earlier) {
  const a = Date.parse(later.created_at);
  const b = Date.parse(earlier.created_at);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a > b;
  return commentIdOrder(later.comment_id, earlier.comment_id) > 0;
}

/**
 * scopeAcceptance({assignees, appLogin, aoforgeScopes, confirms}) — a predicate
 * `(scope) => 'accepted' | 'pending'` over a parseScopeComments scope
 * (`{n, text, author, comment_id, created_at}`). See the rules above.
 *
 *   assignees       logins (strings, or `{login}` objects) of the objective's assignees
 *   appLogin        the AOForge App login, or null/absent (it then matches nothing)
 *   aoforgeScopes   aoforgeScopesFrom(parseSpecRev(...))
 *   confirms        parseScopeConfirms(comments)
 *
 * With nothing supplied every scope is pending: nothing is trusted by default.
 */
function scopeAcceptance({ assignees = [], appLogin = null, aoforgeScopes = [], confirms = [] } = {}) {
  const assigneeKeys = new Set(
    (Array.isArray(assignees) ? assignees : [])
      .map((a) => loginKey(typeof a === 'string' ? a : a && a.login))
      .filter((k) => k !== null)
  );
  const appKey = loginKey(appLogin);
  const rows = Array.isArray(aoforgeScopes) ? aoforgeScopes : [];
  const confs = Array.isArray(confirms) ? confirms : [];

  return function accept(scope) {
    if (!scope || typeof scope.text !== 'string') return 'pending';

    const author = loginKey(scope.author);
    if (author !== null && (assigneeKeys.has(author) || author === appKey)) return 'accepted';

    const hash = scopeHash(scope.text);
    if (rows.some((r) => r && r.n === scope.n && r.hash === hash)) return 'accepted';

    const confirmed = confs.some((c) => {
      if (!c || c.n !== scope.n || c.hash !== hash) return false;
      const by = loginKey(c.author);
      return by !== null && assigneeKeys.has(by) && postedAfter(c, scope);
    });
    return confirmed ? 'accepted' : 'pending';
  };
}

// ─── spec-rev log ────────────────────────────────────────────────────────────
//
// The `aoforge:spec-rev` sticky comment is an append-only markdown table. The
// caller (47-08) posts it with `commentMarker(id, 'spec-rev')` as line 1; this
// module owns everything below that line:
//
//   | rev | at | event | hash | chars |
//   |---|---|---|---|---|
//   | 1 | 2026-10-01T10:00:00Z | freeze | sha256:ab.. | 18234 |
//   | 2 | 2026-10-02T09:00:00Z | scope n=1 | sha256:cd.. | 19004 |
//   | 3 | 2026-10-03T12:00:00Z | fold folded_through=1 from=sha256:ab.. | sha256:ef.. | 19004 |
//
// Hash semantics: `freeze` and `fold` rows hash the encoded issue BODY; `scope`
// rows hash the encoded EFFECTIVE spec after that scope comment (47-08). Drift
// detection therefore only looks at non-scope rows.
//
// Only lines matching `^\| \d+ \| ` are rows, so a human note below the table is
// ignored by parse and kept by append.

const SPEC_REV_HEADER = '| rev | at | event | hash | chars |';
const SPEC_REV_SEPARATOR = '|---|---|---|---|---|';
const SPEC_REV_ROW_RE = /^\| (\d+) \| (.+?) \| (.+?) \| (.+?) \| (\d+) \|\s*$/;
const SPEC_REV_ROW_PREFIX_RE = /^\| \d+ \| /;
const SPEC_REV_HEADER_RE = /^\|\s*rev\s*\|/;
const SPEC_REV_SEPARATOR_RE = /^\|\s*:?-+/;
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const FREEZE_EVENT_RE = /^freeze\b/;
const FOLD_EVENT_RE = /^fold\b.*\bfolded_through=(\d+)/;
const SCOPE_EVENT_RE = /^scope\b/;

function requireCell(name, value) {
  if (typeof value !== 'string' || value.trim() === '' || /[|\n\r]/.test(value)) {
    throw new TypeError(`spec-rev ${name} must be a non-empty single-line string without "|", got ${JSON.stringify(value)}`);
  }
  return value;
}

/** specRevLine(rev, {at, event, hash, chars}) — one table row. Throws TypeError on a cell that would corrupt the table. */
function specRevLine(rev, { at, event, hash, chars } = {}) {
  if (!Number.isSafeInteger(rev) || rev < 1) {
    throw new TypeError(`spec-rev rev must be a positive integer, got ${JSON.stringify(rev)}`);
  }
  requireCell('at', at);
  requireCell('event', event);
  if (typeof hash !== 'string' || !HASH_RE.test(hash)) {
    throw new TypeError(`spec-rev hash must be sha256:<64 hex>, got ${JSON.stringify(hash)}`);
  }
  if (!Number.isSafeInteger(chars) || chars < 0) {
    throw new TypeError(`spec-rev chars must be a non-negative integer, got ${JSON.stringify(chars)}`);
  }
  return `| ${rev} | ${at} | ${event} | ${hash} | ${chars} |`;
}

/**
 * parseSpecRev(text) — `null`/`undefined` read as an empty log.
 * -> { entries:[{rev,at,event,hash,chars}], frozen, folded_through, last }
 */
function parseSpecRev(specRevText) {
  const text = specRevText === null || specRevText === undefined ? '' : normalise(specRevText);
  const entries = [];
  for (const line of text.split('\n')) {
    const m = SPEC_REV_ROW_RE.exec(line);
    if (!m) continue;
    entries.push({ rev: Number(m[1]), at: m[2], event: m[3], hash: m[4], chars: Number(m[5]) });
  }
  let foldedThrough = 0;
  for (const e of entries) {
    const f = FOLD_EVENT_RE.exec(e.event);
    if (f) foldedThrough = Math.max(foldedThrough, Number(f[1]));
  }
  return {
    entries,
    frozen: entries.some((e) => FREEZE_EVENT_RE.test(e.event)),
    folded_through: foldedThrough,
    last: entries.length > 0 ? entries[entries.length - 1] : null,
  };
}

/**
 * appendSpecRev(specRevText, {at, event, hash, chars}) — the log with one more row.
 *
 * Append-only and idempotent: an entry whose `event` AND `hash` already appear
 * returns the input string untouched, so replaying an outbox op is harmless. The
 * new row goes directly under the last existing row, so human text below the table
 * survives. Anything above the table (the caller's marker line) is preserved. The
 * rev number is one more than the highest rev already logged.
 */
function appendSpecRev(specRevText, entry) {
  const raw = specRevText === null || specRevText === undefined ? '' : specRevText;
  const text = normalise(raw);
  const parsed = parseSpecRev(text);

  // Validate before the idempotence check so a malformed entry always throws.
  specRevLine(1, entry);

  if (parsed.entries.some((e) => e.event === entry.event && e.hash === entry.hash)) return raw;

  const next = parsed.entries.reduce((max, e) => Math.max(max, e.rev), 0) + 1;
  const row = specRevLine(next, entry);
  const lines = text.split('\n');

  let lastRow = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SPEC_REV_ROW_PREFIX_RE.test(lines[i])) lastRow = i;
  }
  if (lastRow !== -1) {
    lines.splice(lastRow + 1, 0, row);
    return lines.join('\n');
  }

  const head = lines.findIndex((l) => SPEC_REV_HEADER_RE.test(l));
  if (head !== -1) {
    const at = SPEC_REV_SEPARATOR_RE.test(lines[head + 1] || '') ? head + 1 : head;
    lines.splice(at + 1, 0, row);
    return lines.join('\n');
  }

  const base = text === '' || text.endsWith('\n') ? text : text + '\n';
  return base + SPEC_REV_HEADER + '\n' + SPEC_REV_SEPARATOR + '\n' + row + '\n';
}

/** isFrozen(specRevText) — true once a `freeze` entry exists. */
function isFrozen(specRevText) {
  return parseSpecRev(specRevText).frozen;
}

/**
 * assertEditable({specRev}) — gate for execution-time body edits. `specRev` is the
 * spec-rev comment text. Fold is the one sanctioned edit of a frozen TRD, so
 * planFold does not call this.
 */
function assertEditable(trdState) {
  const specRev = trdState && trdState.specRev;
  if (isFrozen(specRev)) {
    return {
      ok: false,
      reason: 'frozen',
      error: 'TRD is frozen: its body must not be edited after freeze (record a scope comment instead)',
    };
  }
  return { ok: true };
}

/**
 * detectDrift(body, specRevText) — has the live issue body changed since it was
 * last logged? Compares contentHash(body) with the last non-scope row (scope rows
 * hash the effective spec, not the body). Reported, never repaired.
 *
 * -> {drift:false} | {drift:false, unlogged:true} | {drift:true, expected, actual}
 */
function detectDrift(body, specRevText) {
  const { entries } = parseSpecRev(specRevText);
  let ref = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (!SCOPE_EVENT_RE.test(entries[i].event)) {
      ref = entries[i];
      break;
    }
  }
  if (ref === null) return { drift: false, unlogged: true };
  const actual = contentHash(body);
  if (ref.hash === actual) return { drift: false };
  return { drift: true, expected: ref.hash, actual };
}

// ─── Fold ────────────────────────────────────────────────────────────────────

/**
 * planFold(body, comments, specRevText, at) — decide a fold on close.
 *
 * Fold REPLACES the TRD issue body with the encoded effective spec so a reader of
 * the issue sees one document; scope comments are never deleted, and
 * `folded_through` tells later readers the body already contains them.
 *
 *   {ok:false, error}                        body is not an aoforge TRD, or the scope
 *                                            sequence has gaps/duplicates
 *   {ok:true, fits:true, noop:true}          no unfolded scope comment exists
 *   {ok:true, fits:false}                    encoded effective spec > 60,000 chars
 *   {ok:true, fits:true, newBody, entry}     `entry` is the spec-rev row to append:
 *                                            fold folded_through=K from=<old body hash>
 */
function planFold(body, comments, specRevText, at) {
  const dec = decodeTrdBody(body);
  if (!dec.ok) return { ok: false, error: dec.error };

  requireCell('at', at);
  const rev = parseSpecRev(specRevText);
  const parsed = parseScopeComments(comments);
  if (parsed.errors.length > 0) {
    return { ok: false, error: parsed.errors.join('; '), errors: parsed.errors };
  }

  const eff = effectiveSpec(dec.text, comments, {
    foldedThrough: rev.folded_through,
    id: dec.id,
    file: dec.file,
  });
  if (eff.applied.length === 0) return { ok: true, fits: true, noop: true };

  const newBody = encodeTrdBody({ id: dec.id, file: dec.file, text: eff.text });
  if (newBody.length > TRD_MAX_CHARS) return { ok: true, fits: false };

  return {
    ok: true,
    fits: true,
    newBody,
    entry: {
      at,
      event: `fold folded_through=${Math.max(...eff.applied)} from=${contentHash(body)}`,
      hash: contentHash(newBody),
      chars: newBody.length,
    },
  };
}

// ─── Numbered parts ──────────────────────────────────────────────────────────
//
// A SUMMARY or VERIFICATION comment over 60,000 chars is split into numbered parts,
// never trimmed. Each part of a multi-part split opens with `<!-- aoforge:part=i/n -->`
// (the third header line, after the caller's marker and file lines). The split is
// lossless: stripping the part line from every part and concatenating them in order
// returns the original text exactly.

const PART_LINE_RE = new RegExp(`^<!--\\s*${NS}:part=(\\d+)\\/(\\d+)\\s*-->(?:\\n|$)`);

/** partLine(i, n) — `<!-- aoforge:part=i/n -->` with 1 <= i <= n. */
function partLine(i, n) {
  if (!Number.isSafeInteger(i) || !Number.isSafeInteger(n) || i < 1 || n < 1 || i > n) {
    throw new TypeError(`invalid part ${JSON.stringify(i)}/${JSON.stringify(n)}`);
  }
  return `<!-- aoforge:part=${i}/${n} -->`;
}

// Where to cut `rest` (longer than `cap`) so the head fits in `cap` chars: just
// after the last newline that fits, else at `cap` — backing off one unit so a
// UTF-16 surrogate pair is never split between two comments.
function cutPoint(rest, cap) {
  const nl = rest.lastIndexOf('\n', cap - 1);
  if (nl >= 0) return nl + 1;
  const last = rest.charCodeAt(cap - 1);
  if (cap > 1 && last >= 0xd800 && last <= 0xdbff) return cap - 1;
  return cap;
}

// Greedy pack of paragraph units into chunks of at most `cap` chars. A unit that
// does not fit on its own is split with cutPoint.
function packUnits(units, cap) {
  const chunks = [];
  let cur = '';
  for (const unit of units) {
    if (cur.length + unit.length <= cap) {
      cur += unit;
      continue;
    }
    if (cur !== '') {
      chunks.push(cur);
      cur = '';
    }
    let rest = unit;
    while (rest.length > cap) {
      const cut = cutPoint(rest, cap);
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    cur = rest;
  }
  if (cur !== '' || chunks.length === 0) chunks.push(cur);
  return chunks;
}

/**
 * splitParts(text, max = COMMENT_MAX_CHARS, {reserve = 0}) — split `text` into parts
 * that each fit `max` chars once the caller adds `reserve` chars of its own (marker
 * and file header lines) around them.
 *
 * - A text that already fits (`text.length + reserve <= max`) is returned as ONE part
 *   with no part line.
 * - Otherwise paragraphs (blank-line separated, separators kept inside the parts) are
 *   packed greedily; each part is prefixed with `partLine(i, n) + '\n'` and that
 *   prefix is counted against `max`, including its worst-case width for n's digit count.
 * - A paragraph longer than a part is split just after the last newline that fits,
 *   and only if there is none, at the limit.
 * - A text that itself opens with a part line is always given a header, so
 *   joinParts cannot mistake its first line for one.
 *
 * Throws RangeError when `max - reserve` cannot even hold the part line.
 */
function splitParts(text, max = COMMENT_MAX_CHARS, { reserve = 0 } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`splitParts() text must be a string, got ${text === null ? 'null' : typeof text}`);
  }
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new TypeError(`splitParts() max must be a positive integer, got ${JSON.stringify(max)}`);
  }
  if (!Number.isSafeInteger(reserve) || reserve < 0) {
    throw new TypeError(`splitParts() reserve must be a non-negative integer, got ${JSON.stringify(reserve)}`);
  }

  if (text.length + reserve <= max && !PART_LINE_RE.test(text)) return [text];

  // Split after each run of blank lines; the whole run stays with the paragraph before it.
  const units = text.split(/(?<=\n\n)(?!\n)/);

  // The part line's width depends on the number of parts, which depends on the
  // width. Try 1-digit counts first and widen until the result agrees with itself.
  for (let digits = 1; ; digits++) {
    const widest = 10 ** digits - 1;
    const headerLen = partLine(widest, widest).length + 1;
    const cap = max - reserve - headerLen;
    if (cap < 1) {
      throw new RangeError(
        `limit ${max} (reserve ${reserve}) is too small for a ${headerLen}-char part line`
      );
    }
    const chunks = packUnits(units, cap);
    if (String(chunks.length).length <= digits) {
      return chunks.map((chunk, i) => partLine(i + 1, chunks.length) + '\n' + chunk);
    }
  }
}

/**
 * joinParts(parts) — reverse of splitParts. `parts` are the strings handed to
 * splitParts' caller, in any order, each beginning with its part line (the caller has
 * already stripped its own marker/file lines). A single string with no part line is
 * the whole text.
 *
 * -> { ok:true, text, missing:[] }
 *  | { ok:false, text:null, missing:[i...], error }   — never a partial text
 */
function joinParts(parts) {
  if (!Array.isArray(parts) || parts.some((p) => typeof p !== 'string')) {
    throw new TypeError('joinParts() needs an array of strings');
  }
  const fail = (error, missing = []) => ({ ok: false, text: null, missing, error });
  if (parts.length === 0) return fail('no parts');

  const parsed = parts.map((p) => {
    const m = PART_LINE_RE.exec(p);
    return m ? { i: Number(m[1]), n: Number(m[2]), chunk: p.slice(m[0].length) } : null;
  });

  if (parts.length === 1 && parsed[0] === null) return { ok: true, text: parts[0], missing: [] };
  if (parsed.some((p) => p === null)) return fail('a part has no part line');

  const n = parsed[0].n;
  if (parsed.some((p) => p.n !== n)) {
    return fail(`parts disagree on the part count (${[...new Set(parsed.map((p) => p.n))].join(' vs ')})`);
  }

  const byIndex = new Map();
  for (const p of parsed) {
    if (p.i < 1 || p.i > n) return fail(`part ${p.i} is outside 1..${n}`);
    if (byIndex.has(p.i)) return fail(`duplicate part ${p.i}`);
    byIndex.set(p.i, p.chunk);
  }

  const missing = [];
  for (let i = 1; i <= n; i++) if (!byIndex.has(i)) missing.push(i);
  if (missing.length > 0) {
    return fail(`missing part ${missing.join(', ')} of ${n}`, missing);
  }

  let text = '';
  for (let i = 1; i <= n; i++) text += byIndex.get(i);
  return { ok: true, text, missing: [] };
}

module.exports = {
  TRD_TARGET_CHARS,
  TRD_MAX_CHARS,
  COMMENT_MAX_CHARS,
  MAX_TRDS_PER_OBJECTIVE,
  normalise,
  contentHash,
  fileLine,
  parseFileLine,
  encodeTrdBody,
  decodeTrdBody,
  ENTITY_ID_RE,
  ENTITY_ID_LINE_RE,
  isSafeEntityPath,
  encodeEntityBody,
  decodeEntityBody,
  budget,
  checkObjectiveBudgets,
  scopeMarker,
  buildScopeComment,
  parseScopeComments,
  parseScopeConfirms,
  buildScopeConfirm,
  scopeHash,
  scopeEvent,
  aoforgeScopesFrom,
  scopeAcceptance,
  effectiveSpec,
  specRevLine,
  parseSpecRev,
  appendSpecRev,
  isFrozen,
  assertEditable,
  detectDrift,
  planFold,
  partLine,
  splitParts,
  joinParts,
};
