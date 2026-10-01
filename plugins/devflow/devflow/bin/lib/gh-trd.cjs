'use strict';

// gh-trd.cjs — the ONE pure codec for TRD issue bodies and their comment protocol.
//
// A TRD is posted to GitHub as an issue whose body is two header lines followed by
// the verbatim TRD file:
//
//   <!-- devflow:id=47-01 -->
//   <!-- devflow:file=47-01-gh-trd-codec-TRD.md -->
//   <the TRD file text, exactly>
//
// This module encodes/decodes that body byte-exactly, measures the scope budget on
// the FINAL posted string, orders scope comments strictly by `n`, computes the
// effective spec, decides a fold, and maintains the append-only `devflow:spec-rev`
// log. It also owns the numbered-parts splitter used for oversized SUMMARY and
// VERIFICATION comments.
//
// Pure: no fs, no child_process, no gh calls — only `crypto`. It deliberately does
// NOT require gh-body or gh-mapping: the id canonicalisation below is duplicated on
// purpose (as gh-body duplicates gh-mapping's) and a test pins the two to the same
// output.
//
// Length unit: JS `.length` (UTF-16 units). GitHub counts characters, so `.length`
// over-counts astral characters — conservative, never optimistic.

const crypto = require('crypto');

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
const ID_LINE_RE = /^<!--\s*devflow:id=([0-9]+(?:\.[0-9]+)?(?:-[0-9]+)?)\s*-->$/;
const FILE_LINE_RE = /^<!--\s*devflow:file=(\S+?)\s*-->$/;
// A file name is a single path segment: letters, digits, `.`, `_`, `-`; no
// leading dot, no `..`, no separators. Keeps `devflow:file=` from steering a
// pull outside `.planning/objectives/<dir>/`.
const SAFE_FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

function canonicalId(id) {
  if (id === null || id === undefined) return null;
  const m = ID_RE.exec(String(id).trim());
  if (!m) return null;
  return String(parseInt(m[1], 10)) + m[2] + m[3];
}

function requireId(id) {
  const cid = canonicalId(id);
  if (cid === null) throw new TypeError(`invalid devflow id: ${JSON.stringify(id)}`);
  return cid;
}

function isSafeFileName(name) {
  return typeof name === 'string' && SAFE_FILE_RE.test(name) && !name.includes('..');
}

function idLine(id) {
  return `<!-- devflow:id=${requireId(id)} -->`;
}

/** fileLine(name) — `<!-- devflow:file=<name> -->`. Throws TypeError for an unsafe name. */
function fileLine(name) {
  if (!isSafeFileName(name)) {
    throw new TypeError(`invalid devflow file name: ${JSON.stringify(name)}`);
  }
  return `<!-- devflow:file=${name} -->`;
}

/** parseFileLine(line) — the file name in a file line, or null (also for an unsafe name). */
function parseFileLine(line) {
  if (typeof line !== 'string') return null;
  const m = FILE_LINE_RE.exec(line.trim());
  if (!m) return null;
  return isSafeFileName(m[1]) ? m[1] : null;
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

const NOT_A_TRD_BODY = 'not a devflow TRD body';

/**
 * decodeTrdBody(body) — reverse of encodeTrdBody. Verifies BOTH header lines and
 * their order; anything else (a human-created issue, a comment) is
 * `{ok:false, error}`. Never throws. On success the remainder after exactly
 * `idLine\n fileLine\n` is returned verbatim as `text`.
 */
function decodeTrdBody(body) {
  if (typeof body !== 'string') return { ok: false, error: NOT_A_TRD_BODY };
  const s = normalise(body);

  const nl1 = s.indexOf('\n');
  if (nl1 === -1) return { ok: false, error: NOT_A_TRD_BODY };
  const m1 = ID_LINE_RE.exec(s.slice(0, nl1).trim());
  if (!m1) return { ok: false, error: NOT_A_TRD_BODY };

  const rest = s.slice(nl1 + 1);
  const nl2 = rest.indexOf('\n');
  // The second header line may be the last thing in the body when the file text
  // is empty and a trailing newline was stripped in transit.
  const line2 = nl2 === -1 ? rest : rest.slice(0, nl2);
  const file = parseFileLine(line2);
  if (file === null) return { ok: false, error: NOT_A_TRD_BODY };

  const id = canonicalId(m1[1]);
  if (id === null) return { ok: false, error: NOT_A_TRD_BODY };
  return { ok: true, id, file, text: nl2 === -1 ? '' : rest.slice(nl2 + 1) };
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

// Scope comments open with `<!-- devflow:scope n=K -->`. gh-body's MARKER_SOURCE
// does NOT match this form, so it has its own scanner, applied to the FIRST line
// of a comment only.
const SCOPE_LINE_RE = /^\s*<!--\s*devflow:scope\s+n=(\d+)\s*-->/;

/** scopeMarker(n) — `<!-- devflow:scope n=K -->`. `n` must be a positive integer. */
function scopeMarker(n) {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new TypeError(`scope n must be a positive integer, got ${JSON.stringify(n)}`);
  }
  return `<!-- devflow:scope n=${n} -->`;
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
 * parseScopeComments(comments) — `comments` is `[{id, body}]` (GitHub REST subset).
 *
 * -> { scopes:[{n, text, body, comment_id}], errors:[string] }
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
    found.push({ n, text: nl === -1 ? '' : body.slice(nl + 1), body, comment_id: c.id });
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
 * effectiveSpec(text, comments, {foldedThrough, id, file}) — the TRD text plus every
 * applied scope comment, in `n` order, each as `"\n\n" + <full comment body>`.
 * Scopes with `n <= foldedThrough` are skipped: a fold already put them in the body.
 *
 * -> { text, chars, applied:[n], overflow, errors }
 *
 * `chars` is the length of the ENCODED body when `id` and `file` are given (the
 * figure the 60,000 limit applies to); without them it is the effective text length
 * only and does not include the two header lines. `overflow` is `chars > 60,000`;
 * the spec is returned either way so the caller can report it.
 */
function effectiveSpec(text, comments, { foldedThrough = 0, id, file } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`effectiveSpec() text must be a string, got ${text === null ? 'null' : typeof text}`);
  }
  if (!Number.isSafeInteger(foldedThrough) || foldedThrough < 0) {
    throw new TypeError(`foldedThrough must be a non-negative integer, got ${JSON.stringify(foldedThrough)}`);
  }
  const { scopes, errors } = parseScopeComments(comments);

  let out = normalise(text);
  const applied = [];
  for (const s of scopes) {
    if (s.n <= foldedThrough) continue;
    out += '\n\n' + s.body;
    applied.push(s.n);
  }

  const chars =
    id !== undefined && file !== undefined ? encodeTrdBody({ id, file, text: out }).length : out.length;
  return { text: out, chars, applied, overflow: chars > TRD_MAX_CHARS, errors };
}

// ─── spec-rev log ────────────────────────────────────────────────────────────
//
// The `devflow:spec-rev` sticky comment is an append-only markdown table. The
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
 *   {ok:false, error}                        body is not a devflow TRD, or the scope
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
  budget,
  checkObjectiveBudgets,
  scopeMarker,
  buildScopeComment,
  parseScopeComments,
  effectiveSpec,
  specRevLine,
  parseSpecRev,
  appendSpecRev,
  isFrozen,
  assertEditable,
  detectDrift,
  planFold,
};
