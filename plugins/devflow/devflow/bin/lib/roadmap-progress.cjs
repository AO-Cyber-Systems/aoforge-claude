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
// devflow/templates/roadmap.md):
//   4-column (single-milestone project): | Objective | Plans | Status | Completed |
//   5-column (post-milestone-grouping):  | Objective | Milestone | Plans | Status | Completed |
// A positional regex tuned for one shape silently shifts every cell one
// column to the left/right when run against the other shape. This module
// reads the header row to find each column by name, with a positional
// fallback (by column count) when header wording varies.

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

  const objEscaped = objectiveNum.replace('.', '\\.');
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
 * whole line with a bare "N/M jobs complete" — this preserves that detail by
 * prepending/refreshing only the machine-owned counter prefix.
 */
const JOBS_PLACEHOLDER_PATTERN = /^\d+\s+jobs$/i;
const JOBS_MANAGED_PREFIX_PATTERN = /^\d+\/\d+\s+jobs\s+(?:complete|executed)\b[\s,;—-]*/i;

function computeJobsLineText(existingText, counterText) {
  const trimmed = (existingText || '').trim();
  if (trimmed === '' || JOBS_PLACEHOLDER_PATTERN.test(trimmed)) return counterText;

  const stripped = trimmed.replace(JOBS_MANAGED_PREFIX_PATTERN, '').trim();
  return stripped ? `${counterText} — ${stripped}` : counterText;
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
  const objEscaped = objectiveNum.replace('.', '\\.');
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
