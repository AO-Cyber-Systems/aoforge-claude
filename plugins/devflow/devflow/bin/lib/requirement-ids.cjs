'use strict';
// lib/requirement-ids.cjs: requirement IDs from a ROADMAP Requirements line (TRD 56-03, ONUM-04).
// An ID is taken only from an ID-shaped list item; free text yields none. IDs are uppercase (req-01 is not an ID).
//
// What counts as an ID (the contract `verify trd-pre` and `objective complete` share):
//   - Hyphenated:  [A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+   ONUM-01, R-1, REQ-10-03, F1-CONFIG, PHASE-B1, GATE-PTY-MESSAGE
//   - Letter-digit: [A-Z]{1,8}\d+                    F1, C1, A1
//   - Objective-scoped numeric: <objective>-<n>      55-1 for objective 55 (zero-tolerant). Accepted only when an
//     objective is given, so a date such as 2026-10 or a TRD id such as 53-02 is never an ID.
//   - Range: <ID>..<ID> or <ID>..<digits> with the same prefix (GWP-01..GWP-05, DOC-01..07, F1..F3). It expands
//     inclusive and keeps the start token's zero-pad width. A descending range, one with more than 50 items, or one
//     whose prefixes differ yields just the two endpoints.
//
// ID-shaped means the ITEM STARTS with the ID. Inline form: strip one surrounding [...], split on `,` and `;` outside
// parentheses and backticks, take each item's leading token after stripping leading whitespace, `(`, `[`, `*` and
// backticks. The whole token must be ID-shaped: it has to end at the end of the item, whitespace, `:`, `)`, `]`, `,`,
// `;`, a closing `*` or backtick, or a non-ASCII marker such as a check mark. Block form, when the label line has no
// value: the immediately following `- ` / `* ` bullet lines, each contributing its leading token the same way; the
// first line that is not a bullet ends the list. Lowercase IDs (req-01) are NOT accepted. The result is de-duplicated
// in first-seen order.
//
// Never scan a whole line for anything ID-shaped: prose such as RED-GREEN or TRD-level would become requirements.

const { objectiveNumPattern, boldLabelPattern } = require('./text-escape.cjs');

const ID_SRC = '[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z]{1,8}\\d+';
const LABEL_RE = new RegExp(boldLabelPattern('Requirements') + '[ \\t]*([^\\n]*)', 'i'); // never crosses a newline
const BOUNDARY_SRC = '(?=$|[\\s:)\\],;*`]|[^\\x00-\\x7F])';
const LEADING_NOISE_RE = /^[\s([*`]+/;
const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const MAX_RANGE = 50;

/** The anchored leading-token RegExp: group 1 is the first ID, group 2 the range end (an ID or bare digits). */
function leadingTokenRe(objective) {
  let id = ID_SRC;
  if (objective !== undefined && objective !== null && String(objective) !== '') {
    id += '|' + objectiveNumPattern(objective) + '-\\d+';
  }
  return new RegExp(`^(${id})(?:\\.\\.(${id}|\\d+))?${BOUNDARY_SRC}`);
}

/** Split on `,` and `;` that sit outside parentheses and backticks. A character loop, not a regex. */
function splitItems(value) {
  const items = [];
  let cur = '';
  let depth = 0;
  let inTick = false;
  for (const ch of value) {
    if (ch === '`') {
      inTick = !inTick;
    } else if (!inTick) {
      if (ch === '(') {
        depth++;
      } else if (ch === ')' && depth > 0) {
        depth--;
      } else if ((ch === ',' || ch === ';') && depth === 0) {
        items.push(cur);
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  items.push(cur);
  return items;
}

/** `GWP-01` -> { prefix: 'GWP-', digits: '01' }; null when the ID does not end in digits. */
function splitNumber(id) {
  const m = /^(.*?)(\d+)$/.exec(id);
  return m ? { prefix: m[1], digits: m[2] } : null;
}

/** Expand `start..end`. Anything that is not an ascending, same-prefix range of at most 50 items gives the endpoints. */
function expandRange(start, end) {
  const s = splitNumber(start);
  const bareEnd = /^\d+$/.test(end);
  const endpoints = bareEnd ? (s ? [start, s.prefix + end] : [start]) : [start, end];
  if (!s) return endpoints;

  let endDigits;
  if (bareEnd) {
    endDigits = end;
  } else {
    const e = splitNumber(end);
    if (!e || e.prefix !== s.prefix) return endpoints;
    endDigits = e.digits;
  }

  const from = Number(s.digits);
  const to = Number(endDigits);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || to - from + 1 > MAX_RANGE) {
    return endpoints;
  }
  const ids = [];
  for (let n = from; n <= to; n++) ids.push(s.prefix + String(n).padStart(s.digits.length, '0'));
  return ids;
}

/** The ID (or expanded range) an item starts with; [] when the item does not start with an ID-shaped token. */
function leadingIds(item, re) {
  const m = re.exec(item.replace(LEADING_NOISE_RE, ''));
  if (!m) return [];
  return m[2] === undefined ? [m[1]] : expandRange(m[1], m[2]);
}

function dedupe(ids) {
  return [...new Set(ids)];
}

/**
 * Requirement IDs from an inline Requirements value (`ONUM-01, ONUM-02`, `[F1, F2]`, `GWP-01..GWP-05 (see x)`).
 * `objective` enables the objective-scoped numeric form (`55-1` for objective 55).
 */
function extractRequirementIds(value, { objective } = {}) {
  if (typeof value !== 'string') return [];
  let text = value.trim();
  const bracketed = /^\[([\s\S]*)\]$/.exec(text);
  if (bracketed) text = bracketed[1];

  const re = leadingTokenRe(objective);
  const ids = [];
  for (const item of splitItems(text)) ids.push(...leadingIds(item, re));
  return dedupe(ids);
}

/**
 * Requirement IDs from a ROADMAP objective section: `{ found, ids }`. `found` is true when the section carries a
 * `**Requirements:**` or `**Requirements**:` label, even if it yields no IDs (the documented "none (tech debt)" case).
 * A label with a value reads that line only; a label with no value reads the bullet lines directly below it.
 */
function roadmapRequirementIds(section, { objective } = {}) {
  const text = String(section === undefined || section === null ? '' : section);
  const m = LABEL_RE.exec(text);
  if (!m) return { found: false, ids: [] };

  const value = m[1].trim();
  if (value) return { found: true, ids: extractRequirementIds(value, { objective }) };

  const re = leadingTokenRe(objective);
  const ids = [];
  const lines = text.slice(m.index + m[0].length).split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const bullet = BULLET_RE.exec(lines[i]);
    if (!bullet) break;
    ids.push(...leadingIds(bullet[1], re));
  }
  return { found: true, ids: dedupe(ids) };
}

module.exports = { extractRequirementIds, roadmapRequirementIds };
