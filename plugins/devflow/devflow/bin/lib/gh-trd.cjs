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
};
