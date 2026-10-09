'use strict';

/**
 * gh-body.cjs — markers and managed sections for AOForge-written GitHub text.
 *
 * The single builder for objective issue bodies and AOForge comments. It stamps a
 * stable `aoforge:id` marker so an issue can be found again without the local
 * mapping file, and it confines AOForge's writes to marked sections so the rest
 * of an issue body (anything a human typed) is left alone.
 *
 * Pure module: no gh calls, no fs, no child_process, and no require of gh-mapping
 * (the id normaliser below is deliberately duplicated so this file has no
 * dependencies). Every function is deterministic.
 *
 * Marker forms:
 *   issue body, line 1:   <!-- aoforge:id=46 -->
 *   comment,    line 1:   <!-- aoforge:id=46 kind=state -->
 *   TRD form:             <!-- aoforge:id=46-02 -->
 *   Decision form:        <!-- aoforge:id=46-02-d1 -->
 *   entity form (48-06):  <!-- aoforge:id=todo-2026-07-31-a -->, debug-<stem>, quick-<N> (exact, never normalised)
 *   multi-part comment:   marker line, then <!-- aoforge:part=1/2 --> (see findCommentsByMarker)
 *   dir marker (wiki section only): <!-- aoforge:dir=07-store-demo -->; it has no `id=`, so it is
 *                         never read as an id marker
 *
 * Managed sections inside an issue body:
 *   <!-- aoforge:begin NAME -->
 *   ...AOForge-owned text...
 *   <!-- aoforge:end NAME -->
 */

// Fixed order in which sections are emitted and appended.
const SECTION_ORDER = ['summary', 'criteria', 'trds', 'footer'];

// Optional managed sections (objective 47). buildObjectiveSections never emits them; a caller opts in by
// naming them in the `sections` object, and they are appended after SECTION_ORDER. Kept apart from
// SECTION_ORDER so the 46 bodies already on GitHub (and the 46 tests) are not disturbed.
//   wiki: <!-- aoforge:dir=NAME --> plus the link to the wiki page at a pinned revision
//   meta: `type:` / `work:` / `kind:` lines (degraded mode, when native fields/types are unavailable)
const OPTIONAL_SECTIONS = ['wiki', 'meta'];

// Objective 49: the managed sections of the one pull request per objective, in the order they are emitted.
// All optional. `closes` is one `Closes #N` line per issue the merge closes (the objective issue and every
// TRD issue), `wiki` the same pinned-revision block an objective issue carries, `summary` a short markdown
// text. A PR body opens with its OWN marker (`<!-- aoforge:pr=<objective id> -->`), never `aoforge:id=`, so no
// issue scan can mistake a pull request for the objective or a TRD.
const PR_SECTION_ORDER = Object.freeze(['closes', 'wiki', 'summary']);

// The sticky-comment marker written before the aoforge:id form existed.
const LEGACY_STATE_MARKER = '<!-- df:state -->';

// Entity ids (todo / debug / quick issues, 48-02's grammar). Duplicated from gh-trd.cjs ENTITY_ID_SOURCE so this
// module stays dependency-free; a test pins the two to one source. An entity id has exactly one spelling.
const ENTITY_ID_SOURCE = '(?:(?:todo|debug)-[a-z0-9][a-z0-9._-]{0,99}|quick-\\d+)';
const ENTITY_ID_RE = new RegExp(`^${ENTITY_ID_SOURCE}$`);

// Accepts `2.1`, `0`, `46`, the TRD form `46-02`, the Decision form `46-02-d1` and an entity id.
const MARKER_SOURCE =
  '<!--\\s*aoforge:id=([0-9]+(?:\\.[0-9]+)?(?:-[0-9]+(?:-d[0-9]+)?)?|' + ENTITY_ID_SOURCE + ')(?:\\s+kind=([a-z-]+))?\\s*-->';
// The PR marker carries an OBJECTIVE id only (`49`, `2.1`): there is one PR per objective, never one per TRD.
const PR_MARKER_SOURCE = '<!--\\s*aoforge:pr=([0-9]+(?:\\.[0-9]+)?)\\s*-->';
const OBJECTIVE_ID_RE = /^\d+(?:\.\d+)?$/;
const ID_RE = /^(\d+)((?:\.\d+)?)((?:-\d+(?:-d\d+)?)?)$/;
const KIND_RE = /^[a-z-]+$/;

// ─── Id normalisation ────────────────────────────────────────────────────────

/**
 * canonicalId(id) — drop leading zeros from the objective part of an id.
 * `046` -> `46`, `02.1` -> `2.1`, `46-02` -> `46-02` (the TRD suffix is kept as
 * written). An entity id (`todo-<stem>`, `debug-<stem>`, `quick-<N>`) is returned
 * exactly as given: it has one spelling, so nothing is trimmed or normalised.
 * Returns null for anything that is not a valid marker id.
 *
 * Mirrors gh-mapping's toObjectiveId / toEntityId on purpose; duplicated, not
 * imported, so this module stays dependency-free.
 */
function canonicalId(id) {
  if (id === null || id === undefined) return null;
  if (typeof id === 'string' && ENTITY_ID_RE.test(id)) return id;
  const m = ID_RE.exec(String(id).trim());
  if (!m) return null;
  return String(parseInt(m[1], 10)) + m[2] + m[3];
}

function requireId(id) {
  const cid = canonicalId(id);
  if (cid === null) throw new TypeError(`invalid aoforge id: ${JSON.stringify(id)}`);
  return cid;
}

// ─── Markers ─────────────────────────────────────────────────────────────────

/** markerLine(id) — the line that opens every AOForge-built issue body. */
function markerLine(id) {
  return `<!-- aoforge:id=${requireId(id)} -->`;
}

/**
 * prMarker(id) — the line that opens an AOForge-built pull-request body: `<!-- aoforge:pr=49 -->`. A distinct
 * marker kind, so `aoforge:id=` scans (indexByMarker, extractMarker, comment lookups) never see a PR. Only an
 * objective id is accepted (`49`, `049`, `2.1`); a TRD, Decision or entity id throws.
 */
function prMarker(id) {
  const cid = canonicalId(id);
  if (cid === null || !OBJECTIVE_ID_RE.test(cid)) {
    throw new TypeError(`invalid aoforge objective id for a PR marker: ${JSON.stringify(id)}`);
  }
  return `<!-- aoforge:pr=${cid} -->`;
}

// Every PR marker in `text`, in order: [{ id, index }]. The id is canonical (`049` -> `49`).
function scanPrMarkers(text) {
  const re = new RegExp(PR_MARKER_SOURCE, 'g');
  const src = typeof text === 'string' ? text : '';
  const found = [];
  let m;
  while ((m = re.exec(src)) !== null) found.push({ id: canonicalId(m[1]), index: m.index });
  return found;
}

/** extractPrMarker(body) — `{ id }` from the first `aoforge:pr=` marker anywhere in `body`, or null. */
function extractPrMarker(body) {
  const first = scanPrMarkers(body)[0];
  return first ? { id: first.id } : null;
}

/** commentMarker(id, kind) — the line that opens every AOForge comment. */
function commentMarker(id, kind) {
  const cid = requireId(id);
  if (typeof kind !== 'string' || !KIND_RE.test(kind)) {
    throw new TypeError(`invalid aoforge comment kind: ${JSON.stringify(kind)}`);
  }
  return `<!-- aoforge:id=${cid} kind=${kind} -->`;
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
 * extractMarker(body) — the first aoforge marker anywhere in `body`, or null.
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
 * A body that already opens with an aoforge marker for the same id is returned
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

const PART_LINE_RE = /^\s*<!--\s*aoforge:part=(\d+)\/(\d+)\s*-->\s*$/;

// `{ part, of }` from the line right after the marker line; 1 of 1 when it is absent or not a sane i/n.
function readPart(body) {
  const lines = body.split('\n', 2);
  const m = lines.length > 1 ? PART_LINE_RE.exec(lines[1].replace(/\r$/, '')) : null;
  if (m) {
    const part = Number(m[1]);
    const of = Number(m[2]);
    if (Number.isSafeInteger(part) && Number.isSafeInteger(of) && part >= 1 && part <= of) return { part, of };
  }
  return { part: 1, of: 1 };
}

function compareCommentIds(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * findCommentsByMarker(comments, id, kind) — every comment whose FIRST line is the marker for `id`
 * (canonical compare) with comment kind `kind`, as `[{ comment, part, of }]` ordered by part and then
 * by comment id. A long comment is split over several; each carries `<!-- aoforge:part=i/n -->` on the
 * line after its marker. A comment without one (or with an impossible i/n) is part 1 of 1.
 *
 * `comments` is `[{ id, body }]`; entries without a string body are skipped, and a non-array gives [].
 * An omitted `kind` matches any comment kind for the id. An issue-body marker (no kind) never matches,
 * and neither does a marker quoted further down a human comment. Throws TypeError for an invalid id
 * or kind, like commentMarker.
 */
function findCommentsByMarker(comments, id, kind) {
  const cid = requireId(id);
  const wantKind = kind === undefined || kind === null ? null : kind;
  if (wantKind !== null && (typeof wantKind !== 'string' || !KIND_RE.test(wantKind))) {
    throw new TypeError(`invalid aoforge comment kind: ${JSON.stringify(kind)}`);
  }
  const found = [];
  for (const comment of Array.isArray(comments) ? comments : []) {
    if (!comment || typeof comment.body !== 'string') continue;
    const m = firstLineMarker(comment.body);
    if (!m || m.id !== cid || m.kind === null) continue;
    if (wantKind !== null && m.kind !== wantKind) continue;
    found.push({ comment, ...readPart(comment.body) });
  }
  return found.sort((a, b) => a.part - b.part || compareCommentIds(a.comment.id, b.comment.id));
}

// ─── Objective sections ──────────────────────────────────────────────────────

/**
 * buildObjectiveSections(state) — the AOForge-owned text of an objective issue,
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

  // Store mode (`state.store === true`): the issue IS the record and `.aoforge/` is a gitignored cache, so the
  // footer must not point at a repo path. The text depends on the flag alone, so the managed-section hash only
  // changes when the mode does. Mirror mode (flag absent or anything else) keeps today's bytes (D-01).
  const objDir = s.dir || s.objectiveId || '';
  const footer =
    '_Tracked by [AOForge](https://github.com/AO-Cyber-Systems/aoforge-claude). ' +
    (s.store === true
      ? 'This issue is the source of truth (store mode); `.aoforge/` in a checkout is a local cache rebuilt from it._'
      : `Source of truth: \`.aoforge/objectives/${objDir}/\` in this repo._`);

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
 * Same content as the pre-marker sticky comment, under the aoforge:id marker.
 * The timestamp is passed in so callers and tests stay deterministic.
 */
function buildStateComment(id, state, isoTimestamp) {
  const s = state || {};
  const lines = [commentMarker(id, 'state')];
  lines.push(`**AOForge state — last synced ${isoTimestamp}**`);
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
 * True for `<!-- aoforge:id=<id> kind=state -->` and for the legacy
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

const beginMarker = (name) => `<!-- aoforge:begin ${name} -->`;
const endMarker = (name) => `<!-- aoforge:end ${name} -->`;
const renderBlock = (name, content) => `${beginMarker(name)}\n${content}\n${endMarker(name)}`;

// Matches any begin/end section marker, so section content cannot forge one.
const SECTION_MARKER_RE = /<!--\s*aoforge:(?:begin|end)\b/;

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
 * mergeManaged(existingBody, sections, id) — write AOForge's sections into an
 * issue body without disturbing anything else.
 *
 * Returns `{ ok: true, body, changed, warnings }` or `{ ok: false, error }`.
 *
 *  - Only the inner text of an existing `aoforge:begin NAME` / `aoforge:end NAME`
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
 * `sections` is `{ summary, criteria, trds, footer }` (see buildObjectiveSections)
 * plus the optional `wiki` and `meta` (OPTIONAL_SECTIONS); names left out are skipped.
 * A missing wiki/meta pair is appended at the end; an existing body is never re-ordered.
 *
 * `opts.order` (default SECTION_ORDER then OPTIONAL_SECTIONS) replaces the list of section names that are
 * written, and `opts.marker` (`'id'`, the default, or `'pr'`) selects the marker line written and matched:
 * `aoforge:id=<id>` or `aoforge:pr=<objective id>`. `{ order: PR_SECTION_ORDER, marker: 'pr' }` is a pull-request
 * body; with neither option nothing differs from an objective body (49-05).
 *
 * `opts.preserveTicks` (default false, so 46's sync behaves exactly as before): when the
 * `criteria` pair already exists, a `- [ ]` line in the new content whose text matches a
 * `- [x]` line already on GitHub is written as `- [x]`. The verifier ticks criteria on
 * GitHub; a re-push must not un-tick them. Matching is by criterion text, never position.
 */
function mergeManaged(existingBody, sections, id, opts = {}) {
  const cid = canonicalId(id);
  if (cid === null) return { ok: false, error: `invalid aoforge id: ${JSON.stringify(id)}` };

  const preserveTicks = Boolean(opts && opts.preserveTicks);
  const markerKind = opts && opts.marker !== undefined ? opts.marker : 'id';
  if (markerKind !== 'id' && markerKind !== 'pr') {
    return { ok: false, error: `opts.marker must be "id" or "pr", got ${JSON.stringify(markerKind)}` };
  }
  const isPr = markerKind === 'pr';
  if (isPr && !OBJECTIVE_ID_RE.test(cid)) {
    return { ok: false, error: `a PR body is marked with an objective id, got ${JSON.stringify(id)}` };
  }
  let order = [...SECTION_ORDER, ...OPTIONAL_SECTIONS];
  if (opts && opts.order !== undefined) {
    if (!Array.isArray(opts.order) || !opts.order.every((n) => typeof n === 'string' && /^[a-z][a-z-]*$/.test(n))) {
      return { ok: false, error: 'opts.order must be an array of section names' };
    }
    order = opts.order;
  }
  const provided = order.filter((n) => sections && sections[n] !== undefined);
  for (const name of provided) {
    const content = sections[name];
    if (typeof content !== 'string') {
      return { ok: false, error: `section ${name} content must be a string` };
    }
    if (SECTION_MARKER_RE.test(content)) {
      return { ok: false, error: `section ${name} content contains an aoforge section marker` };
    }
  }

  const raw = existingBody === null || existingBody === undefined ? '' : String(existingBody);
  const hadCrlf = raw.includes('\r\n');
  const norm = raw.replace(/\r\n/g, '\n');
  const warnings = [];

  let merged;
  if (norm.trim() === '') {
    const blocks = provided.map((n) => renderBlock(n, sections[n]));
    merged = `${isPr ? prMarker(cid) : markerLine(cid)}\n${blocks.length ? `${blocks.join('\n\n')}\n` : ''}`;
  } else {
    // The marker kind decides which line identifies the body. A body carrying only the OTHER kind is refused:
    // an issue body must never gain a PR marker, nor a PR body an issue marker (that would make it look like one).
    const idFound = findIssueMarker(norm);
    const prFound = scanPrMarkers(norm)[0] || null;
    const found = isPr ? prFound : idFound;
    const other = isPr ? idFound : prFound;
    if (found && found.id !== cid) {
      return { ok: false, error: `body marker aoforge:${markerKind}=${found.id} does not match ${cid}` };
    }
    if (!found && other) {
      return {
        ok: false,
        error: isPr
          ? `body marker aoforge:id=${other.id} does not match PR marker aoforge:pr=${cid}`
          : `body marker aoforge:pr=${other.id} does not match issue marker aoforge:id=${cid}`,
      };
    }
    merged = found ? norm : `${isPr ? prMarker(cid) : markerLine(cid)}\n${norm}`;
    for (const name of provided) {
      let content = sections[name];
      const pair = findPair(merged, name);
      if (pair) {
        if (preserveTicks && name === 'criteria') {
          content = keepTicks(merged.slice(pair.innerStart, pair.endIndex), content);
        }
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

// ─── Store sections (objective 47) ───────────────────────────────────────────

// A checklist line: `- [ ] text`, `- [x] text` (also `*`/`+` bullets and `[X]`). Group 1 is the
// bullet incl. trailing space, 2 the tick character, 4 the criterion text.
const TICK_LINE_RE = /^(\s*[-*+]\s+)\[([ xX])\](\s+)(\S.*?)\s*$/;
const collapseWs = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * keepTicks(existingInner, content) — `content` with every unticked checklist line whose
 * text matches a ticked line in `existingInner` rewritten as ticked. Text is compared with
 * whitespace collapsed; only `- [ ]` -> `- [x]` ever happens (a tick is never removed).
 */
function keepTicks(existingInner, content) {
  const ticked = new Set();
  for (const line of existingInner.split('\n')) {
    const m = TICK_LINE_RE.exec(line);
    if (m && m[2] !== ' ') ticked.add(collapseWs(m[4]));
  }
  if (ticked.size === 0) return content;
  return content
    .split('\n')
    .map((line) => {
      const m = TICK_LINE_RE.exec(line);
      if (!m || m[2] !== ' ' || !ticked.has(collapseWs(m[4]))) return line;
      return `${m[1]}[x]${line.slice(m[1].length + 3)}`;
    })
    .join('\n');
}

/**
 * extractSection(body, name) — the inner text of the first well-formed `aoforge:begin NAME` /
 * `aoforge:end NAME` pair, without the newline mergeManaged puts on each side; null when there is no
 * well-formed pair (missing or malformed). CRLF is folded to LF.
 */
function extractSection(body, name) {
  if (typeof body !== 'string' || typeof name !== 'string') return null;
  const norm = body.replace(/\r\n/g, '\n');
  const pair = findPair(norm, name);
  if (!pair) return null;
  let inner = norm.slice(pair.innerStart, pair.endIndex);
  if (inner.startsWith('\n')) inner = inner.slice(1);
  if (inner.endsWith('\n')) inner = inner.slice(0, -1);
  return inner;
}

// The cache directory name is read back off GitHub and becomes a path, so it is held to one safe segment:
// starts alphanumeric, then [A-Za-z0-9._-], and no `..` anywhere.
const SAFE_DIR_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const isSafeDir = (dir) => typeof dir === 'string' && SAFE_DIR_RE.test(dir) && !dir.includes('..');
const DIR_MARKER_RE = /<!--\s*aoforge:dir=(\S+?)\s*-->/;
const SAFE_PAGE_RE = /^[^\s[\]()<>`|]+$/;
const SAFE_URL_RE = /^https?:\/\/[^\s()<>`]+$/;
const SHA_RE = /^[0-9a-f]{7,40}$/i;

/**
 * buildWikiSection({ dir, page, url, sha }) — inner text of the `wiki` section:
 *   <!-- aoforge:dir=07-store-demo -->
 *   Detail: [Objective-7-store-demo](URL) (revision `abc1234`)
 * `dir` is the objective's cache directory name — the only place GitHub stores it, so `pull --all` can
 * place files from an empty cache. `url` is the full page-at-revision URL (gh-wiki's pageRevisionUrl);
 * it is used as given. Throws TypeError for a value that would not read back safely.
 */
function buildWikiSection(args) {
  const a = args || {};
  if (!isSafeDir(a.dir)) throw new TypeError(`invalid wiki dir: ${JSON.stringify(a.dir)}`);
  if (typeof a.page !== 'string' || !SAFE_PAGE_RE.test(a.page)) {
    throw new TypeError(`invalid wiki page: ${JSON.stringify(a.page)}`);
  }
  if (typeof a.url !== 'string' || !SAFE_URL_RE.test(a.url)) {
    throw new TypeError(`invalid wiki url: ${JSON.stringify(a.url)}`);
  }
  if (typeof a.sha !== 'string' || !SHA_RE.test(a.sha)) {
    throw new TypeError(`invalid wiki revision: ${JSON.stringify(a.sha)}`);
  }
  return `<!-- aoforge:dir=${a.dir} -->\nDetail: [${a.page}](${a.url}) (revision \`${a.sha}\`)`;
}

/**
 * parseDirMarker(body) — the cache directory named by the `wiki` section's `aoforge:dir` marker, or
 * null: no wiki section, no marker inside it (a marker pasted elsewhere does not count), or a value
 * that is not one safe path segment.
 */
function parseDirMarker(body) {
  const section = extractSection(body, 'wiki');
  if (section === null) return null;
  const m = DIR_MARKER_RE.exec(section);
  return m && isSafeDir(m[1]) ? m[1] : null;
}

const META_KEYS = ['type', 'work', 'kind'];
const META_LINE_RE = new RegExp(`^(${META_KEYS.join('|')}):\\s*(\\S.*?)\\s*$`);

/**
 * buildMetaSection({ type, work, kind }) — inner text of the `meta` section (degraded mode): one
 * `key: value` line per key that has a value, in that order. Empty/absent keys are omitted; all
 * absent gives ''. A non-string or multi-line value throws TypeError.
 */
function buildMetaSection(meta) {
  const m = meta || {};
  const lines = [];
  for (const key of META_KEYS) {
    const v = m[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || /[\r\n]/.test(v)) throw new TypeError(`invalid meta ${key}: ${JSON.stringify(v)}`);
    if (v.trim() === '') continue;
    lines.push(`${key}: ${v.trim()}`);
  }
  return lines.join('\n');
}

/**
 * parseMeta(text) — `{ type?, work?, kind? }` from the inner text of a `meta` section
 * (extractSection(body, 'meta')). Unknown lines are ignored; null/non-string gives {}.
 */
function parseMeta(text) {
  const out = {};
  if (typeof text !== 'string') return out;
  for (const line of text.split(/\r?\n/)) {
    const m = META_LINE_RE.exec(line.trim());
    if (m && !(m[1] in out)) out[m[1]] = m[2];
  }
  return out;
}

const TRD_MODES = ['native', 'tasklist'];
const TRD_NATURAL = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/**
 * buildTrdsSection({ mode, trds }) — inner text of the objective's `trds` section.
 *   mode 'native'   — one line, `3 TRDs, tracked as sub-issues.` (GitHub renders the children itself)
 *   mode 'tasklist' — `- [ ] #12 07-01 alpha` per TRD, ticked when done/closed, sorted by TRD id, for
 *                     hosts without the sub-issues API
 * `trds` is `[{ id, number, title?, done? }]` (`issue_number` and `closed` are accepted spellings of
 * number and done). No TRDs gives `_None yet._`. Throws TypeError for an unknown mode and, in tasklist
 * mode, for an item without a TRD id or a positive integer issue number.
 */
function buildTrdsSection(args) {
  const a = args || {};
  if (!TRD_MODES.includes(a.mode)) throw new TypeError(`invalid trds mode: ${JSON.stringify(a.mode)}`);
  const trds = Array.isArray(a.trds) ? a.trds : [];
  if (trds.length === 0) return '_None yet._';
  if (a.mode === 'native') return `${trds.length} TRD${trds.length === 1 ? '' : 's'}, tracked as sub-issues.`;

  const rows = trds.map((t) => {
    const item = t || {};
    const number = item.number !== undefined ? item.number : item.issue_number;
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      throw new TypeError(`trds item needs a TRD id: ${JSON.stringify(item)}`);
    }
    if (!Number.isInteger(number) || number <= 0) {
      throw new TypeError(`trds item ${item.id} needs a positive integer issue number`);
    }
    const done = item.done === true || item.closed === true || item.state === 'closed';
    const title = typeof item.title === 'string' ? collapseWs(item.title) : '';
    return { id: item.id.trim(), line: `- [${done ? 'x' : ' '}] #${number} ${item.id.trim()}${title ? ` ${title}` : ''}` };
  });
  rows.sort((x, y) => TRD_NATURAL(x.id, y.id));
  return rows.map((r) => r.line).join('\n');
}

// ─── Pull-request body (objective 49) ────────────────────────────────────────

/**
 * closesSection(numbers) — inner text of the `closes` section: one `Closes #N` line per issue, in the order
 * given, each number once. One keyword per line on purpose: `Closes #1, #2` closes only #1 (49 Pitfall 4).
 * Throws TypeError for a non-array, an empty list, or anything that is not a positive integer.
 */
function closesSection(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new TypeError('closesSection needs a non-empty array of issue numbers');
  }
  const seen = [];
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1) throw new TypeError(`closesSection: ${JSON.stringify(n)} is not an issue number`);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen.map((n) => `Closes #${n}`).join('\n');
}

/**
 * buildPrBody({ id, sections }) — a whole PR body: the `aoforge:pr=<id>` marker, then the PR sections named in
 * `sections` in PR_SECTION_ORDER. Built by mergeManaged so the result is exactly what a later merge of the same
 * sections leaves unchanged. Throws TypeError for an id that is not an objective id or a section that is refused.
 */
function buildPrBody(args) {
  const a = args || {};
  const r = mergeManaged('', a.sections, a.id, { order: PR_SECTION_ORDER, marker: 'pr' });
  if (!r.ok) throw new TypeError(`buildPrBody: ${r.error}`);
  return r.body;
}

module.exports = {
  ENTITY_ID_SOURCE,
  SECTION_ORDER,
  OPTIONAL_SECTIONS,
  PR_SECTION_ORDER,
  prMarker,
  extractPrMarker,
  closesSection,
  buildPrBody,
  MAX_BODY_CHARS,
  mergeManaged,
  extractSection,
  buildWikiSection,
  parseDirMarker,
  buildMetaSection,
  parseMeta,
  buildTrdsSection,
  findCommentsByMarker,
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
