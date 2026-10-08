'use strict';

// ─── Shared ROADMAP.md Progress-table + Jobs-line writers ──────────────────────
//
// Both `roadmap update-job-progress` (roadmap.cjs) and `objective complete`
// (objective.cjs) need to update a single row of the "## Progress" table and
// the "**Jobs:**" detail line inside an objective's section. This module is
// the ONE place that does it, so there's exactly one implementation to get
// right — and it's column-name-aware instead of assuming a fixed pipe count.
//
// ROADMAP.md's Progress table has shipped in two shapes (see
// aoforge/templates/roadmap.md):
//   4-column (single-milestone project): | Objective | Plans | Status | Completed |
//   5-column (post-milestone-grouping):  | Objective | Milestone | Plans | Status | Completed |
// A positional regex tuned for one shape silently shifts every cell one
// column to the left/right when run against the other shape. This module
// reads the header row to find each column by name, with a positional
// fallback (by column count) when header wording varies.

// js/regex-injection: `objectiveNum` is interpolated into `new RegExp(...)` at both call sites below, so it
// goes through the shared escape (text-escape.cjs) rather than a hand-rolled `.replace('.', '\\.')`.
const { escapeRegExp } = require('./text-escape.cjs');

function splitTableRow(line) {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|');
}

function buildColumnIndex(headerCells) {
  const colIndex = {};
  headerCells.forEach((cell, i) => {
    const norm = cell.trim().toLowerCase();
    if (norm === 'objective') colIndex.objective = i;
    else if (norm === 'milestone') colIndex.milestone = i;
    else if (norm === 'plans' || norm === 'jobs complete') colIndex.plans = i;
    else if (norm === 'status') colIndex.status = i;
    else if (norm === 'completed') colIndex.completed = i;
  });

  if (colIndex.objective === undefined) colIndex.objective = 0;

  // Positional fallback for known column counts when names don't match
  // exactly (older/renamed headers) — keeps the older 4-column shape working.
  if (colIndex.plans === undefined || colIndex.status === undefined || colIndex.completed === undefined) {
    const n = headerCells.length;
    if (n === 4) {
      if (colIndex.plans === undefined) colIndex.plans = 1;
      if (colIndex.status === undefined) colIndex.status = 2;
      if (colIndex.completed === undefined) colIndex.completed = 3;
    } else if (n === 5) {
      if (colIndex.milestone === undefined) colIndex.milestone = 1;
      if (colIndex.plans === undefined) colIndex.plans = 2;
      if (colIndex.status === undefined) colIndex.status = 3;
      if (colIndex.completed === undefined) colIndex.completed = 4;
    }
  }

  return colIndex;
}

/**
 * Update one row of the "## Progress" table for `objectiveNum`, touching only
 * the columns present in `updates` ({ plans, status, completed }). Every
 * other column (Milestone included) is left byte-identical.
 *
 * Returns { content, updated }.
 */
function updateProgressTableRow(content, objectiveNum, updates) {
  const lines = content.split('\n');
  const progressIdx = lines.findIndex(l => /^##\s*Progress\s*$/i.test(l.trim()));
  if (progressIdx === -1) return { content, updated: false };

  let headerIdx = -1;
  for (let i = progressIdx + 1; i < lines.length; i++) {
    if (/^\s*\|/.test(lines[i])) { headerIdx = i; break; }
    if (/^#{1,6}\s/.test(lines[i])) break; // hit next section, no table found
  }
  if (headerIdx === -1) return { content, updated: false };

  const headerCells = splitTableRow(lines[headerIdx]);
  const colIndex = buildColumnIndex(headerCells);

  const objEscaped = escapeRegExp(objectiveNum);
  const rowPattern = new RegExp(`^${objEscaped}\\.?\\s`);

  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) break; // end of table

    const cells = splitTableRow(line);
    const objCell = (cells[colIndex.objective] || '').trim();
    if (!rowPattern.test(objCell)) continue;

    if (updates.plans !== undefined && colIndex.plans !== undefined) {
      cells[colIndex.plans] = ` ${updates.plans} `;
    }
    if (updates.status !== undefined && colIndex.status !== undefined) {
      cells[colIndex.status] = ` ${updates.status} `;
    }
    if (updates.completed !== undefined && colIndex.completed !== undefined) {
      cells[colIndex.completed] = ` ${updates.completed} `;
    }

    lines[i] = '|' + cells.join('|') + '|';
    return { content: lines.join('\n'), updated: true };
  }

  return { content, updated: false };
}

/**
 * The "**Jobs:**" line carries hand-authored planning detail (wave layout,
 * split rationale, requirement IDs). Both callers used to overwrite the
 * whole line with a bare "N/M jobs complete", discarding that detail — a
 * later fix (quick-20) then over-corrected by only ever PREPENDING the new
 * counter, which produced a second, stacked count whenever the existing
 * value already started with one (real ROADMAP.md lines write "0/16
 * complete" with no "jobs" word, so the old "\d+/\d+\s+jobs\s+..." strip
 * never matched it and the new counter was tacked on in front instead).
 *
 * Correct behaviour (quick-20): replace vs prepend, never both.
 *   - Leading count present (`N/M complete`, `N/M jobs executed`,
 *     `N/M TRDs executed`, ...): replace ONLY the `N/M` numbers with the
 *     new counter's numbers. The author's own noun and verb, and every
 *     byte after the fragment, are kept untouched (byte-identical tail).
 *   - No leading count at all: prepend `N/M jobs complete — ` as before.
 *   - Already-stacked counts (an old bug's leftover, or two runs that both
 *     wrote a leading count) self-heal to a single count, keeping the
 *     FIRST fragment's own noun and verb.
 */
const JOBS_PLACEHOLDER_PATTERN = /^\d+\s+jobs$/i;
// A machine-owned count fragment: numbers, an optional single noun word
// ("jobs" / "TRDs" / "plans" / ...), then a verb. Anchored so it only
// matches at the very start of a value — "verified passed 66/66" and
// "sequential — 33-02" must never be mistaken for it.
const COUNT_FRAGMENT_SOURCE = String.raw`\d+\/\d+(\s+[A-Za-z]+)?(\s+(?:complete|executed|done)\b)`;
const JOBS_LEADING_COUNT_PATTERN = new RegExp('^' + COUNT_FRAGMENT_SOURCE, 'i');
// A further count fragment stacked right after a separator — self-heal for
// lines an earlier bug already corrupted, or a value that picked up two
// counts across repeated runs.
const JOBS_STACKED_COUNT_PATTERN = new RegExp(String.raw`^\s*[—;,-]\s*` + COUNT_FRAGMENT_SOURCE, 'i');

function computeJobsLineText(existingText, counterText) {
  const trimmed = (existingText || '').trim();
  if (trimmed === '' || JOBS_PLACEHOLDER_PATTERN.test(trimmed)) return counterText;

  const lead = trimmed.match(JOBS_LEADING_COUNT_PATTERN);
  if (!lead) return `${counterText} — ${trimmed}`; // no count present: prepend (unchanged)

  const newNumbersMatch = counterText.match(/^\d+\/\d+/);
  const newNumbers = newNumbersMatch ? newNumbersMatch[0] : trimmed.match(/^\d+\/\d+/)[0];
  const nounAndVerb = (lead[1] || '') + lead[2]; // the author's own noun/verb, verbatim

  let rest = trimmed.slice(lead[0].length); // keeps its own ", " / " — " / " in ..."
  let stacked;
  while ((stacked = rest.match(JOBS_STACKED_COUNT_PATTERN))) rest = rest.slice(stacked[0].length);

  return newNumbers + nounAndVerb + rest;
}

/**
 * Update the "**Jobs:**" line inside `### Objective N: ...`'s own section
 * (bounded by the next `#{2,4} Objective \d` header, or EOF) — never a
 * different objective's line, even when duplicate "Objective N" mentions
 * exist elsewhere (checklist entries in collapsed `<details>` milestone
 * blocks don't start with `#`, so they're never candidates).
 *
 * Returns { content, updated }.
 */
function updateJobsLine(content, objectiveNum, counterText) {
  const objEscaped = escapeRegExp(objectiveNum);
  const headerPattern = new RegExp(`^#{2,4}\\s*Objective\\s+${objEscaped}(?:[.:]|\\s|$)`, 'i');
  const anyHeaderPattern = /^#{2,4}\s*Objective\s+\d/i;

  const lines = content.split('\n');
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) { sectionStart = i; break; }
  }
  if (sectionStart === -1) return { content, updated: false };

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (anyHeaderPattern.test(lines[i])) { sectionEnd = i; break; }
  }

  const jobsLinePattern = /^(\*\*Jobs:\*\*\s*)(.*)$/i;
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const m = lines[i].match(jobsLinePattern);
    if (!m) continue;
    lines[i] = m[1] + computeJobsLineText(m[2], counterText);
    return { content: lines.join('\n'), updated: true };
  }

  return { content, updated: false };
}

module.exports = {
  splitTableRow,
  buildColumnIndex,
  updateProgressTableRow,
  computeJobsLineText,
  updateJobsLine,
};
