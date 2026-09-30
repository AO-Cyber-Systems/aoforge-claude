'use strict';

/**
 * gh-body.cjs — markers and managed sections for DevFlow-written GitHub text.
 *
 * The single builder for objective issue bodies and DevFlow comments. It stamps a
 * stable `devflow:id` marker so an issue can be found again without the local
 * mapping file, and it confines DevFlow's writes to marked sections so the rest
 * of an issue body (anything a human typed) is left alone.
 *
 * Pure module: no gh calls, no fs, no child_process, and no require of gh-mapping
 * (the id normaliser below is deliberately duplicated so this file has no
 * dependencies). Every function is deterministic.
 *
 * Marker forms:
 *   issue body, line 1:   <!-- devflow:id=46 -->
 *   comment,    line 1:   <!-- devflow:id=46 kind=state -->
 *   TRD form (reserved):  <!-- devflow:id=46-02 -->
 *
 * Managed sections inside an issue body:
 *   <!-- devflow:begin NAME -->
 *   ...DevFlow-owned text...
 *   <!-- devflow:end NAME -->
 */

// Fixed order in which sections are emitted and appended.
const SECTION_ORDER = ['summary', 'criteria', 'trds', 'footer'];

// The sticky-comment marker written before the devflow:id form existed.
const LEGACY_STATE_MARKER = '<!-- df:state -->';

// Accepts `2.1`, `0`, `46` and the TRD form `46-02`.
const MARKER_SOURCE =
  '<!--\\s*devflow:id=([0-9]+(?:\\.[0-9]+)?(?:-[0-9]+)?)(?:\\s+kind=([a-z-]+))?\\s*-->';
const ID_RE = /^(\d+)((?:\.\d+)?)((?:-\d+)?)$/;
const KIND_RE = /^[a-z-]+$/;

// ─── Id normalisation ────────────────────────────────────────────────────────

/**
 * canonicalId(id) — drop leading zeros from the objective part of an id.
 * `046` -> `46`, `02.1` -> `2.1`, `46-02` -> `46-02` (the TRD suffix is kept as
 * written). Returns null for anything that is not a valid marker id.
 *
 * Mirrors gh-mapping's toObjectiveId on purpose; duplicated, not imported, so
 * this module stays dependency-free.
 */
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

// ─── Markers ─────────────────────────────────────────────────────────────────

/** markerLine(id) — the line that opens every DevFlow-built issue body. */
function markerLine(id) {
  return `<!-- devflow:id=${requireId(id)} -->`;
}

/** commentMarker(id, kind) — the line that opens every DevFlow comment. */
function commentMarker(id, kind) {
  const cid = requireId(id);
  if (typeof kind !== 'string' || !KIND_RE.test(kind)) {
    throw new TypeError(`invalid devflow comment kind: ${JSON.stringify(kind)}`);
  }
  return `<!-- devflow:id=${cid} kind=${kind} -->`;
}

// Every marker in `text`, in order: [{ id, kind, index }]. A fresh global regex
// per call, so no lastIndex state leaks between calls.
function scanMarkers(text) {
  const re = new RegExp(MARKER_SOURCE, 'g');
  const src = typeof text === 'string' ? text : '';
  const found = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    found.push({ id: canonicalId(m[1]), kind: m[2] || null, index: m.index });
  }
  return found;
}

/**
 * extractMarker(body) — the first devflow marker anywhere in `body`, or null.
 * `{ id, kind }`; kind is null for an issue-body marker. The id is canonical.
 */
function extractMarker(body) {
  const first = scanMarkers(body)[0];
  return first ? { id: first.id, kind: first.kind } : null;
}

// The first ISSUE-body marker (kind === null) in `text`, with its index, or null.
// A comment-kind marker pasted into an issue body must not stand in for it.
function findIssueMarker(text) {
  return scanMarkers(text).find((m) => m.kind === null) || null;
}

// The marker on the first line of `text` only (CRLF-safe), or null.
function firstLineMarker(text) {
  if (typeof text !== 'string') return null;
  const first = text.split('\n', 1)[0].replace(/\r$/, '');
  const m = new RegExp(`^\\s*${MARKER_SOURCE}\\s*$`).exec(first);
  return m ? { id: canonicalId(m[1]), kind: m[2] || null } : null;
}

/**
 * withCommentMarker(id, kind, text) — prefix a comment body with its marker line.
 * A body that already opens with a devflow marker for the same id is returned
 * unchanged (it is already stamped, whatever its kind).
 */
function withCommentMarker(id, kind, text) {
  const marker = commentMarker(id, kind);
  const cid = canonicalId(id);
  const t = text === null || text === undefined ? '' : String(text);
  const existing = firstLineMarker(t);
  if (existing && existing.id === cid) return t;
  return t === '' ? marker : `${marker}\n${t}`;
}

// ─── Objective sections ──────────────────────────────────────────────────────

/**
 * buildObjectiveSections(state) — the DevFlow-owned text of an objective issue,
 * one string per name in SECTION_ORDER. No markers and no trailing newline:
 * mergeManaged supplies the begin/end lines and the surrounding newlines.
 *
 * `state` is the shape gh.cjs readObjectiveState returns.
 */
function buildObjectiveSections(state) {
  const s = state || {};

  const summary = [];
  summary.push(`**Objective ${s.number}: ${s.name}**`);
  if (s.goal) summary.push('', `**Goal:** ${s.goal}`);
  const sha = s.last_commit && s.last_commit.sha ? s.last_commit.sha : 'none';
  summary.push(
    '',
    `**Status:** ${s.trd_done || 0}/${s.trd_total || 0} TRDs done, current wave ${s.current_wave || 1}, last commit ${sha}`
  );

  const criteria = Array.isArray(s.success_criteria) ? s.success_criteria : [];
  const trds = Array.isArray(s.trds) ? s.trds : [];

  const objDir = s.dir || s.objectiveId || '';
  const footer =
    '_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). ' +
    `Source of truth: \`.planning/objectives/${objDir}/\` in this repo._`;

  return {
    summary: summary.join('\n'),
    criteria: criteria.length
      ? criteria
          .map((sc) => `- [${sc.done ? 'x' : ' '}] ${sc.id}${sc.text ? `: ${sc.text}` : ''}`)
          .join('\n')
      : '_None yet._',
    trds: trds.length
      ? trds.map((t) => `- [${t.done ? 'x' : ' '}] ${t.name}${t.brief ? ` — ${t.brief}` : ''}`).join('\n')
      : '_None yet._',
    footer,
  };
}

// ─── Sticky state comment ────────────────────────────────────────────────────

/**
 * buildStateComment(id, state, isoTimestamp) — the sticky "state" comment body.
 * Same content as the pre-marker sticky comment, under the devflow:id marker.
 * The timestamp is passed in so callers and tests stay deterministic.
 */
function buildStateComment(id, state, isoTimestamp) {
  const s = state || {};
  const lines = [commentMarker(id, 'state')];
  lines.push(`**DevFlow state — last synced ${isoTimestamp}**`);
  lines.push('');
  lines.push(`- Wave: ${s.current_wave || 1}`);
  lines.push(`- TRDs: ${s.trd_done || 0}/${s.trd_total || 0}`);
  lines.push(`- SUMMARY count: ${s.summary_count || 0}`);
  if (s.last_commit) {
    lines.push(`- Last commit: ${s.last_commit.sha} — ${s.last_commit.subject}`);
  }
  if (s.branch) {
    lines.push(`- Branch: ${s.branch}`);
  }
  return lines.join('\n');
}

/**
 * isStateComment(body, id) — is `body` the sticky state comment for objective `id`?
 * True for `<!-- devflow:id=<id> kind=state -->` and for the legacy
 * `<!-- df:state -->` (which carries no id, so it matches any). Only the first
 * line counts: a marker quoted further down a human comment is not a match.
 */
function isStateComment(body, id) {
  if (typeof body !== 'string') return false;
  const firstLine = body.split('\n', 1)[0].replace(/\r$/, '');
  if (firstLine.trim() === LEGACY_STATE_MARKER) return true;
  const cid = canonicalId(id);
  if (cid === null) return false;
  const m = firstLineMarker(body);
  return m !== null && m.kind === 'state' && m.id === cid;
}

// ─── Lookup by marker ────────────────────────────────────────────────────────

/**
 * indexByMarker(issues) — map objective id -> issue number from issue bodies.
 *
 * `issues` is `[{ number, body }]`. Returns
 *   { byId: { [id]: number }, duplicates: { [id]: number[] }, unmarked: number[] }
 * An id claimed by two or more distinct issues goes into `duplicates` (ascending
 * numbers) and is left OUT of `byId`: the caller must stop and report rather
 * than pick one. The same issue listed twice (page overlap) is not a duplicate.
 * Comment-kind markers never count; such an issue is unmarked.
 */
function indexByMarker(issues) {
  const claims = new Map(); // id -> issue numbers, in first-seen order
  const unmarked = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (!issue || typeof issue.number !== 'number') continue;
    const marker = findIssueMarker(issue.body);
    if (marker === null) {
      if (!unmarked.includes(issue.number)) unmarked.push(issue.number);
      continue;
    }
    if (!claims.has(marker.id)) claims.set(marker.id, []);
    const numbers = claims.get(marker.id);
    if (!numbers.includes(issue.number)) numbers.push(issue.number);
  }

  const byId = {};
  const duplicates = {};
  for (const [id, numbers] of claims) {
    if (numbers.length === 1) byId[id] = numbers[0];
    else duplicates[id] = numbers.slice().sort((a, b) => a - b);
  }
  return { byId, duplicates, unmarked };
}

/**
 * parseTitleNumber(title) — the objective number from a `[Objective N] ...` title,
 * normalised like toObjectiveId (`046` -> `46`), or null. The fallback for issues
 * created before markers existed.
 */
function parseTitleNumber(title) {
  const m = /^\[Objective\s+([\d.]+)\]/.exec(typeof title === 'string' ? title : '');
  return m ? canonicalId(m[1]) : null;
}

// ─── Managed-section merge ───────────────────────────────────────────────────

// GitHub caps an issue body at 65,536 characters. Refuse well short of that so
// the failure is ours and explicit rather than an opaque API error.
const MAX_BODY_CHARS = 60000;

const beginMarker = (name) => `<!-- devflow:begin ${name} -->`;
const endMarker = (name) => `<!-- devflow:end ${name} -->`;
const renderBlock = (name, content) => `${beginMarker(name)}\n${content}\n${endMarker(name)}`;

// Matches any begin/end section marker, so section content cannot forge one.
const SECTION_MARKER_RE = /<!--\s*devflow:(?:begin|end)\b/;

/**
 * findPair(body, name) — the first WELL-FORMED begin/end pair for `name`:
 * `{ innerStart, endIndex }`, or null when there is none.
 *
 * indexOf-based on purpose. A begin is dangling when another begin of the same
 * name comes before the next end; such a begin is skipped, otherwise a stray
 * begin left by an earlier malformed merge would pair with the end of the fresh
 * section appended after it and a later merge would replace everything between.
 */
function findPair(body, name) {
  const begin = beginMarker(name);
  const end = endMarker(name);
  let b = body.indexOf(begin);
  while (b !== -1) {
    const innerStart = b + begin.length;
    const e = body.indexOf(end, innerStart);
    if (e === -1) return null; // nothing closes this begin, nor any later one
    const nextBegin = body.indexOf(begin, innerStart);
    if (nextBegin === -1 || nextBegin > e) return { innerStart, endIndex: e };
    b = nextBegin; // dangling begin: another opens before this one closes
  }
  return null;
}

// Append a fresh block after `body`, separated by exactly one blank line. The
// existing text is never touched: only the newlines needed to reach a blank
// line are added.
function appendBlock(body, name, content) {
  const block = renderBlock(name, content);
  if (body === '') return block;
  const trailing = /\n*$/.exec(body)[0].length;
  return body + '\n'.repeat(Math.max(0, 2 - trailing)) + block;
}

/**
 * mergeManaged(existingBody, sections, id) — write DevFlow's sections into an
 * issue body without disturbing anything else.
 *
 * Returns `{ ok: true, body, changed, warnings }` or `{ ok: false, error }`.
 *
 *  - Only the inner text of an existing `devflow:begin NAME` / `devflow:end NAME`
 *    pair changes; the first well-formed pair per name, never a global replace.
 *  - A section with no well-formed pair is appended at the end. A begin or end
 *    marker that is present but unpaired is left in place, with the warning
 *    `malformed section NAME`; no text is ever deleted.
 *  - A body without a marker keeps its text whole (the marker becomes line 1 and
 *    the sections follow it); a body marked for a different id is refused.
 *  - Idempotent: merging the same sections again gives `changed: false`, and a
 *    changed:false result returns the caller's body exactly as passed.
 *  - `\r\n` is folded to `\n` to compare and merge. If the caller's body used
 *    CRLF, a changed result is written back with CRLF so human text keeps its
 *    bytes.
 *
 * `sections` is `{ summary, criteria, trds, footer }` (see buildObjectiveSections);
 * names left out are skipped.
 */
function mergeManaged(existingBody, sections, id) {
  const cid = canonicalId(id);
  if (cid === null) return { ok: false, error: `invalid devflow id: ${JSON.stringify(id)}` };

  const provided = SECTION_ORDER.filter((n) => sections && sections[n] !== undefined);
  for (const name of provided) {
    const content = sections[name];
    if (typeof content !== 'string') {
      return { ok: false, error: `section ${name} content must be a string` };
    }
    if (SECTION_MARKER_RE.test(content)) {
      return { ok: false, error: `section ${name} content contains a devflow section marker` };
    }
  }

  const raw = existingBody === null || existingBody === undefined ? '' : String(existingBody);
  const hadCrlf = raw.includes('\r\n');
  const norm = raw.replace(/\r\n/g, '\n');
  const warnings = [];

  let merged;
  if (norm.trim() === '') {
    const blocks = provided.map((n) => renderBlock(n, sections[n]));
    merged = `${markerLine(cid)}\n${blocks.length ? `${blocks.join('\n\n')}\n` : ''}`;
  } else {
    const found = findIssueMarker(norm);
    if (found && found.id !== cid) {
      return { ok: false, error: `body marker devflow:id=${found.id} does not match ${cid}` };
    }
    merged = found ? norm : `${markerLine(cid)}\n${norm}`;
    for (const name of provided) {
      const content = sections[name];
      const pair = findPair(merged, name);
      if (pair) {
        merged = `${merged.slice(0, pair.innerStart)}\n${content}\n${merged.slice(pair.endIndex)}`;
      } else {
        if (merged.includes(beginMarker(name)) || merged.includes(endMarker(name))) {
          warnings.push(`malformed section ${name}`);
        }
        merged = appendBlock(merged, name, content);
      }
    }
  }

  const changed = merged !== norm;
  const out = hadCrlf ? merged.replace(/\n/g, '\r\n') : merged;
  if (out.length >= MAX_BODY_CHARS) {
    return {
      ok: false,
      error:
        `issue body would be ${out.length} characters; the limit is ${MAX_BODY_CHARS} ` +
        '(GitHub rejects bodies over 65536)',
    };
  }
  return { ok: true, body: changed ? out : raw, changed, warnings };
}

module.exports = {
  SECTION_ORDER,
  MAX_BODY_CHARS,
  mergeManaged,
  markerLine,
  commentMarker,
  extractMarker,
  buildObjectiveSections,
  buildStateComment,
  isStateComment,
  withCommentMarker,
  indexByMarker,
  parseTitleNumber,
};
