'use strict';

// requirements-agreement.cjs (TRD 69-03, TOOL-10) — does SUMMARY frontmatter agree with VERIFICATION?
//
// AGREEMENT. For every objective that has a VERIFICATION, each requirement its Requirements Coverage table marks
// SATISFIED must appear in the `requirements-completed` of at least one SUMMARY in the same objective. Anything that
// audits completion from SUMMARY frontmatter (audit-milestone's three-source cross-reference, a requirements tally) is
// misled when a satisfied requirement is listed nowhere. A SUMMARY of another objective never satisfies this one.
//
// SCOPE RULE. Only IDs defined in a REQUIREMENTS document are checked: `.planning/REQUIREMENTS.md` and
// `.planning/milestones/*-REQUIREMENTS.md`, where a definition is a `- [x] **ID**:` / `- [ ] **ID**:` line (a
// traceability-table row or a prose mention is not one). Any other satisfied ID is returned as `skipped`, never as a
// finding. The reason is measured: a planning-session scan of this repository over `.planning/objectives/`, scoped to
// REQUIREMENTS-document IDs, flagged exactly objective 58 (EST-02, EST-04). Unscoped it also flagged objectives 03, 04,
// 08 (SC-N), 11 (AC-N), 23 (SCOPE-N), 35 (STK), 41 (VER) and 44 (AUT): labels and requirement families that predate
// REQUIREMENTS.md, whose SUMMARYs were never meant to list them.
//
// PARSE RULES.
//   coverage rows   only table rows under a heading whose title contains "Requirements Coverage" (case-insensitive); the
//                   section ends at the next heading. The first cell gives the ID (`EST-02: text`, `**EST-02**`,
//                   `` `EST-02` `` all read EST-02); the row counts when the remaining cells say SATISFIED and do not say
//                   NOT SATISFIED or PARTIALLY SATISFIED. BLOCKED and NEEDS HUMAN rows never count.
//   completed       `requirements-completed` from the SUMMARY frontmatter, read through extractFrontmatter: an inline
//                   list or a block list arrives as an array; an inline list followed by a `# comment` arrives as the raw
//                   string, so its comment is stripped and the rest split on commas. Each entry is matched by its LEADING
//                   ID token, so `"STK-02 (part b)"` is STK-02. The `requirements` key (a TRD's) is not read.
//   candidates      the TRDs of the objective whose `requirements` field lists the ID, named by the number at the front
//                   of the file name (`58-05-task-and-trd-estimates-TRD.md` -> `58-05`).
//
// Pure: reads files, prints nothing, never exits. 69-05 renders findings as the W065 health warning and as
// `validate requirements`.

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { normalizeObjectiveName, objectiveDirMatches, parseObjectiveDirName } = require('./helpers.cjs');

/** A requirement ID at the start of a string, ignoring leading space, quotes, backticks and bold markers. */
const REQ_ID_RE = /^[\s"'`*]*([A-Z][A-Z0-9]*-\d+[a-z]?)\b/;
/** A requirement definition line in a REQUIREMENTS document. */
const DEFINITION_RE = /^- \[[ xX]\] \*\*([A-Z][A-Z0-9]*-\d+[a-z]?)\*\*/gm;
/** The TRD id at the front of a TRD file name. */
const TRD_ID_RE = /^(\d+(?:\.\d+)?-\d+[a-z]?)(?:-|$)/;

function leadingId(s) {
  const m = REQ_ID_RE.exec(String(s));
  return m ? m[1] : null;
}

function unique(list) {
  return [...new Set(list)];
}

/** The text of a file, or null when it does not exist. Any other read error is raised. */
function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
    throw e;
  }
}

/** The names in a directory, sorted; an absent directory is an empty list. */
function listDir(dir, opts) {
  try {
    return fs.readdirSync(dir, opts).sort((a, b) => {
      const x = typeof a === 'string' ? a : a.name;
      const y = typeof b === 'string' ? b : b.name;
      return x < y ? -1 : x > y ? 1 : 0;
    });
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return [];
    throw e;
  }
}

/** Every requirement ID defined in `.planning/REQUIREMENTS.md` or `.planning/milestones/*-REQUIREMENTS.md`. */
function knownRequirementIds(planningDir) {
  const files = [path.join(planningDir, 'REQUIREMENTS.md')];
  const milestonesDir = path.join(planningDir, 'milestones');
  for (const name of listDir(milestonesDir)) {
    if (/-REQUIREMENTS\.md$/.test(name)) files.push(path.join(milestonesDir, name));
  }
  const ids = new Set();
  for (const file of files) {
    const text = readIfExists(file);
    if (text === null) continue;
    for (const m of text.matchAll(DEFINITION_RE)) ids.add(m[1]);
  }
  return ids;
}

/** Whether the cells after the requirement cell say the requirement is satisfied. */
function saysSatisfied(rest) {
  return /\bSATISFIED\b/.test(rest) && !/\b(NOT|PARTIALLY)\s+SATISFIED\b/i.test(rest);
}

/** The IDs a VERIFICATION's Requirements Coverage table marks SATISFIED, in order, once each. */
function parseSatisfied(text) {
  const out = [];
  let inSection = false;
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      inSection = /requirements coverage/i.test(heading[1]);
      continue;
    }
    if (!inSection) continue;
    const row = line.trim();
    if (!row.startsWith('|')) continue;
    const cells = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const id = leadingId(cells[0]);
    if (!id) continue;
    if (saysSatisfied(cells.slice(1).join(' | ')) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * A frontmatter list value as a list of strings. extractFrontmatter returns an array for inline and block lists, and the
 * raw string for an inline list followed by a `# comment`; anything else (absent, a nested object) is empty.
 */
function listValue(v) {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v !== 'string') return [];
  let s = v.replace(/\s+#.*$/, '').trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

/** The requirement IDs in a frontmatter list, by leading ID token. */
function idsOf(value) {
  return unique(listValue(value).map(leadingId).filter(Boolean));
}

/** The IDs a SUMMARY lists in `requirements-completed`. */
function parseCompleted(text) {
  const fm = extractFrontmatter(String(text).replace(/\r\n/g, '\n'));
  return idsOf(fm['requirements-completed']);
}

/**
 * Check one objective directory. `known` is the set from knownRequirementIds. Null when the objective has no VERIFICATION.
 *   satisfied  every ID its VERIFICATIONs mark SATISFIED (the union, in file then row order)
 *   listed     every ID its SUMMARYs list in requirements-completed
 *   checked    satisfied IDs defined in a REQUIREMENTS document
 *   skipped    satisfied IDs no REQUIREMENTS document defines
 *   missing    [{ id, verification, candidates }] for each checked ID no SUMMARY lists
 */
function scanObjective(objDir, known) {
  const files = listDir(objDir).filter(name => fs.statSync(path.join(objDir, name)).isFile());
  const verifications = files.filter(name => /-VERIFICATION\.md$/.test(name));
  if (!verifications.length) return null;

  const satisfied = [];
  const verificationOf = new Map();
  for (const name of verifications) {
    for (const id of parseSatisfied(readIfExists(path.join(objDir, name)) || '')) {
      if (verificationOf.has(id)) continue;
      verificationOf.set(id, name);
      satisfied.push(id);
    }
  }

  const listed = new Set();
  for (const name of files.filter(n => /-SUMMARY\.md$/.test(n))) {
    for (const id of parseCompleted(readIfExists(path.join(objDir, name)) || '')) listed.add(id);
  }

  const trds = [];
  for (const name of files.filter(n => /-TRD\.md$/.test(n))) {
    const m = TRD_ID_RE.exec(name);
    if (!m) continue;
    const fm = extractFrontmatter(readIfExists(path.join(objDir, name)) || '');
    trds.push({ id: m[1], requirements: idsOf(fm.requirements) });
  }

  const checked = satisfied.filter(id => known.has(id));
  const skipped = satisfied.filter(id => !known.has(id));
  const missing = checked
    .filter(id => !listed.has(id))
    .map(id => ({
      id,
      verification: verificationOf.get(id),
      candidates: trds.filter(t => t.requirements.includes(id)).map(t => t.id).sort(),
    }));

  return { satisfied, listed: [...listed], checked, skipped, missing };
}

/** Order objective numbers numerically (`58` after `04.1`, `100` after `58`), then by directory name. */
function compareObjectiveDirs(a, b) {
  const [ai, ad] = parseObjectiveDirName(a).number.split('.').map(Number);
  const [bi, bd] = parseObjectiveDirName(b).number.split('.').map(Number);
  if (ai !== bi) return ai - bi;
  const x = ad === undefined ? -1 : ad;
  const y = bd === undefined ? -1 : bd;
  if (x !== y) return x - y;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Scan every objective under `planningDir/objectives` (or only `{ objective }`, matched by number like the other
 * objective-scoped commands: `5` selects `05-*`, never `58-*`).
 * -> { checked: { objectives, requirements }, findings: [{ objective, number, requirement, verification, candidates }],
 *      skipped: [{ objective, ids }] }
 * `checked.objectives` counts objectives that have a VERIFICATION. Findings sort by objective, then requirement.
 */
function scan(planningDir, { objective } = {}) {
  const known = knownRequirementIds(planningDir);
  const objectivesDir = path.join(planningDir, 'objectives');
  const wanted = objective === undefined || objective === null ? null : normalizeObjectiveName(String(objective));

  const dirs = listDir(objectivesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => parseObjectiveDirName(name) !== null)
    .filter(name => wanted === null || objectiveDirMatches(name, wanted))
    .sort(compareObjectiveDirs);

  const checked = { objectives: 0, requirements: 0 };
  const findings = [];
  const skipped = [];
  for (const dir of dirs) {
    const result = scanObjective(path.join(objectivesDir, dir), known);
    if (!result) continue;
    checked.objectives += 1;
    checked.requirements += result.checked.length;
    if (result.skipped.length) skipped.push({ objective: dir, ids: result.skipped });
    const { number } = parseObjectiveDirName(dir);
    const missing = result.missing.slice().sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    for (const m of missing) {
      findings.push({ objective: dir, number, requirement: m.id, verification: m.verification, candidates: m.candidates });
    }
  }
  return { checked, findings, skipped };
}

/** The one-line statement of a finding (what 69-05 shows as W065). */
function findingMessage(f) {
  return `requirements-unlisted: objective ${f.number} (${f.verification}) marks ${f.requirement} satisfied, but no SUMMARY in ${f.objective} lists it in requirements-completed`;
}

/** `a`, `a or b`, `a, b or c`. */
function orList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** How to repair a finding: list the ID in the SUMMARY of a TRD that completed it, through the planning verbs. */
function findingFix(f) {
  const candidates = f.candidates || [];
  const who = candidates.length
    ? `the SUMMARY of ${orList(candidates)} (the TRD${candidates.length > 1 ? 's' : ''} whose requirements field lists it)`
    : 'the SUMMARY of the TRD that completed it';
  const trd = candidates.length ? candidates[0] : '<trd>';
  return `Add ${f.requirement} to requirements-completed in ${who}: df-tools planning draft objectives/${f.objective}/${trd}-SUMMARY.md, edit the draft, then df-tools summary post ${trd} --from <draft>.`;
}

module.exports = {
  knownRequirementIds,
  parseSatisfied,
  parseCompleted,
  scanObjective,
  scan,
  findingMessage,
  findingFix,
};
