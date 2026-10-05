'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, normalizeObjectiveName, findPlanFiles, generateSlugInternal } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { findObjectiveInternal } = require('./objective.cjs');
const { updateProgressTableRow, updateJobsLine } = require('./roadmap-progress.cjs');
const { reconcile } = require('./roadmap-reconcile.cjs');
const { isStoreMode } = require('./planning-mode.cjs');
const { objectiveNumPattern, boldLabelPattern } = require('./text-escape.cjs');

// `**Goal:**` and `**Goal**:` (the v1.5 ROADMAP form) both read; one definition for every reader here.
const GOAL_RE = new RegExp(boldLabelPattern('Goal') + '\\s*([^\\n]+)', 'i');
const DEPENDS_RE = new RegExp(boldLabelPattern('Depends on') + '\\s*([^\\n]+)', 'i');

// TRD 48-13 (D-19): in store mode ROADMAP.md is a view rendered from GitHub by
// `gh pull --all`, so the commands that write it no-op (exit 0) with this
// result. Not an error: workflows call them unconditionally.
const ROADMAP_STORE_SKIP = Object.freeze({
  updated: false,
  skipped: 'store-mode',
  message: 'ROADMAP.md is generated in store mode; run `df-tools gh pull --all`',
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

// One bullet of the `## Milestones` list. Covers every shape the codebase emits:
//   - 🚧 **v1.3 — Name** — Objectives 27–41 (in progress; ...)     this repo
//   - ✅ **v1.0 MVP** - Objectives 1-4 (shipped YYYY-MM-DD)          templates/roadmap.md
//   - **v0.1 — Adopted** (2026-01-01, current): no objectives yet.   adopt.cjs scaffold
// Groups: 1 = status emoji (optional), 2 = version digits, 3 = name (may be ''), 4 = trailing text.
// The emoji are multi-code-unit, hence the `u` flag and literal characters.
const MILESTONE_BULLET_RE = /^\s*[-*]\s+(?:(✅|🚧|📋)️?\s+)?\*\*v(\d+(?:\.\d+)+)\s*(?:[—–:-]\s*)?([^*]*?)\s*\*\*(.*)$/u;
const MILESTONE_IN_PROGRESS_RE = /\b(in progress|current)\b/i;

/** Numeric per-dot-segment comparison of '1.10' vs '1.9' (so 1.10 > 1.9). */
function compareVersionDigits(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Parse the bullets between `## Milestones` and the next `#`/`##` heading. [] when absent. */
function parseMilestoneBullets(roadmap) {
  const lines = roadmap.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s+Milestones\b/i.test(l));
  if (start < 0) return [];
  const bullets = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    const m = lines[i].match(MILESTONE_BULLET_RE);
    if (!m) continue;
    bullets.push({ status: m[1] || null, digits: m[2], name: m[3].trim(), rest: m[4] });
  }
  return bullets;
}

/**
 * Choose the milestone the project is working in. Priority:
 *   1. the first 🚧 entry
 *   2. the first not-shipped entry whose trailing text says `in progress` / `current`
 *      (the adopt scaffold carries no emoji, only `(date, current)`)
 *   3. the highest-version ✅ entry
 *   4. the lowest-version 📋 entry
 *   5. the first bullet
 */
function pickMilestone(bullets) {
  if (bullets.length === 0) return null;
  const inProgress = bullets.find(b => b.status === '🚧')
    || bullets.find(b => b.status !== '✅' && MILESTONE_IN_PROGRESS_RE.test(b.rest));
  if (inProgress) return inProgress;
  const extreme = (status, dir) => bullets
    .filter(b => b.status === status)
    .sort((a, b) => dir * compareVersionDigits(a.digits, b.digits))[0];
  return extreme('✅', -1) || extreme('📋', 1) || bullets[0];
}

function getMilestoneInfo(cwd) {
  try {
    const roadmap = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
    const picked = pickMilestone(parseMilestoneBullets(roadmap));
    if (picked) {
      return { version: `v${picked.digits}`, name: picked.name || 'milestone' };
    }
    // Legacy fallback — no `## Milestones` section, or no bullet in it parses.
    // First-match regexes kept verbatim from the pre-40-01 implementation.
    const versionMatch = roadmap.match(/v(\d+\.\d+)/);
    const nameMatch = roadmap.match(/## .*v\d+\.\d+[:\s]+([^\n(]+)/);
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: nameMatch ? nameMatch[1].trim() : 'milestone',
    };
  } catch {
    return { version: 'v1.0', name: 'milestone' };
  }
}

function getRoadmapObjectiveInternal(cwd, objectiveNum) {
  if (!objectiveNum) return null;
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  try {
    const content = fs.readFileSync(roadmapPath, 'utf-8');
    const escapedObjective = objectiveNumPattern(objectiveNum);
    const objectivePattern = new RegExp(`#{2,4}\\s*Objective\\s+${escapedObjective}:\\s*([^\\n]+)`, 'i');
    const headerMatch = content.match(objectivePattern);
    if (!headerMatch) return null;

    const objectiveName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = nextHeaderMatch ? headerIndex + nextHeaderMatch.index : content.length;
    const section = content.slice(headerIndex, sectionEnd).trim();

    const goalMatch = section.match(GOAL_RE);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    return {
      found: true,
      objective_number: objectiveNum.toString(),
      objective_name: objectiveName,
      goal,
      section,
    };
  } catch {
    return null;
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdRoadmapGetObjective(cwd, objectiveNum, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    output({ found: false, error: 'ROADMAP.md not found' }, raw, '');
    return;
  }

  try {
    const content = fs.readFileSync(roadmapPath, 'utf-8');

    // Escaped objective number with a trailing boundary (4.1 never matches 4.10 or 4.1.2)
    const escapedObjective = objectiveNumPattern(objectiveNum);

    // Match "## Objective X:", "### Objective X:", or "#### Objective X:" with optional name
    const objectivePattern = new RegExp(
      `#{2,4}\\s*Objective\\s+${escapedObjective}:\\s*([^\\n]+)`,
      'i'
    );
    const headerMatch = content.match(objectivePattern);

    if (!headerMatch) {
      // Fallback: check if objective exists in summary list but missing detail section
      const checklistPattern = new RegExp(
        `-\\s*\\[[ x]\\]\\s*\\*\\*Objective\\s+${escapedObjective}:\\s*([^*]+)\\*\\*`,
        'i'
      );
      const checklistMatch = content.match(checklistPattern);

      if (checklistMatch) {
        // Objective exists in summary but missing detail section - malformed ROADMAP
        output({
          found: false,
          objective_number: objectiveNum,
          objective_name: checklistMatch[1].trim(),
          error: 'malformed_roadmap',
          message: `Objective ${objectiveNum} exists in summary list but missing "### Objective ${objectiveNum}:" detail section. ROADMAP.md needs both formats.`
        }, raw, '');
        return;
      }

      output({ found: false, objective_number: objectiveNum }, raw, '');
      return;
    }

    const objectiveName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;

    // Find the end of this section (next ## or ### objective header, or end of file)
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = nextHeaderMatch
      ? headerIndex + nextHeaderMatch.index
      : content.length;

    const section = content.slice(headerIndex, sectionEnd).trim();

    // Extract goal if present
    const goalMatch = section.match(GOAL_RE);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    // Extract success criteria as structured array
    const criteriaMatch = section.match(/\*\*Success Criteria\*\*[^\n]*:\s*\n((?:\s*\d+\.\s*[^\n]+\n?)+)/i);
    const success_criteria = criteriaMatch
      ? criteriaMatch[1].trim().split('\n').map(line => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
      : [];

    output(
      {
        found: true,
        objective_number: objectiveNum,
        objective_name: objectiveName,
        goal,
        success_criteria,
        section,
      },
      raw,
      section
    );
  } catch (e) {
    error('Failed to read ROADMAP.md: ' + e.message);
  }
}

function cmdRoadmapAnalyze(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    output({ error: 'ROADMAP.md not found', milestones: [], objectives: [], current_objective: null }, raw);
    return;
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');

  // Extract all objective headings: ## Objective N: Name or ### Objective N: Name
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  const objectives = [];
  let match;

  while ((match = objectivePattern.exec(content)) !== null) {
    const objectiveNum = match[1];
    const objectiveName = match[2].replace(/\(INSERTED\)/i, '').trim();

    // Extract goal from the section
    const sectionStart = match.index;
    const restOfContent = content.slice(sectionStart);
    const nextHeader = restOfContent.match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = nextHeader ? sectionStart + nextHeader.index : content.length;
    const section = content.slice(sectionStart, sectionEnd);

    const goalMatch = section.match(GOAL_RE);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    const dependsMatch = section.match(DEPENDS_RE);
    const depends_on = dependsMatch ? dependsMatch[1].trim() : null;

    // Check completion on disk
    const normalized = normalizeObjectiveName(objectiveNum);
    let diskStatus = 'no_directory';
    let jobCount = 0;
    let summaryCount = 0;
    let hasContext = false;
    let hasResearch = false;

    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      const dirMatch = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);

      if (dirMatch) {
        const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dirMatch));
        jobCount = findPlanFiles(objectiveFiles).length;
        summaryCount = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
        hasContext = objectiveFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
        hasResearch = objectiveFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

        if (summaryCount >= jobCount && jobCount > 0) diskStatus = 'complete';
        else if (summaryCount > 0) diskStatus = 'partial';
        else if (jobCount > 0) diskStatus = 'planned';
        else if (hasResearch) diskStatus = 'researched';
        else if (hasContext) diskStatus = 'discussed';
        else diskStatus = 'empty';
      }
    } catch {}

    // Check ROADMAP checkbox status
    const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Objective\\s+${objectiveNumPattern(objectiveNum)}`, 'i');
    const checkboxMatch = content.match(checkboxPattern);
    const roadmapComplete = checkboxMatch ? checkboxMatch[1] === 'x' : false;

    objectives.push({
      number: objectiveNum,
      name: objectiveName,
      goal,
      depends_on,
      job_count: jobCount,
      summary_count: summaryCount,
      has_context: hasContext,
      has_research: hasResearch,
      disk_status: diskStatus,
      roadmap_complete: roadmapComplete,
    });
  }

  // Extract milestone info
  const milestones = [];
  const milestonePattern = /##\s*(.*v(\d+\.\d+)[^(\n]*)/gi;
  let mMatch;
  while ((mMatch = milestonePattern.exec(content)) !== null) {
    milestones.push({
      heading: mMatch[1].trim(),
      version: 'v' + mMatch[2],
    });
  }

  // Find current and next objective
  const currentObjective = objectives.find(p => p.disk_status === 'planned' || p.disk_status === 'partial') || null;
  const nextObjective = objectives.find(p => p.disk_status === 'empty' || p.disk_status === 'no_directory' || p.disk_status === 'discussed' || p.disk_status === 'researched') || null;

  // Aggregated stats
  const totalJobs = objectives.reduce((sum, p) => sum + p.job_count, 0);
  const totalSummaries = objectives.reduce((sum, p) => sum + p.summary_count, 0);
  const completedPhases = objectives.filter(p => p.disk_status === 'complete').length;

  // Detect objectives in summary list without detail sections (malformed ROADMAP)
  const checklistPattern = /-\s*\[[ x]\]\s*\*\*Objective\s+(\d+(?:\.\d+)?)/gi;
  const checklistObjectives = new Set();
  let checklistMatch;
  while ((checklistMatch = checklistPattern.exec(content)) !== null) {
    checklistObjectives.add(checklistMatch[1]);
  }
  const detailObjectives = new Set(objectives.map(p => p.number));
  const missingDetails = [...checklistObjectives].filter(p => !detailObjectives.has(p));

  const result = {
    milestones,
    objectives,
    objective_count: objectives.length,
    completed_objectives: completedPhases,
    total_jobs: totalJobs,
    total_summaries: totalSummaries,
    progress_percent: totalJobs > 0 ? Math.round((totalSummaries / totalJobs) * 100) : 0,
    current_objective: currentObjective ? currentObjective.number : null,
    next_objective: nextObjective ? nextObjective.number : null,
    missing_objective_details: missingDetails.length > 0 ? missingDetails : null,
  };

  output(result, raw);
}

function cmdRoadmapUpdateJobProgress(cwd, objectiveNum, raw) {
  if (!objectiveNum) {
    error('objective number required for roadmap update-job-progress');
  }

  if (isStoreMode(cwd)) {
    output(Object.assign({}, ROADMAP_STORE_SKIP), raw, 'skipped');
    return;
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  const objectiveInfo = findObjectiveInternal(cwd, objectiveNum);
  if (!objectiveInfo) {
    error(`Objective ${objectiveNum} not found`);
  }

  const jobCount = objectiveInfo.jobs.length;
  const summaryCount = objectiveInfo.summaries.length;

  if (jobCount === 0) {
    output({ updated: false, reason: 'No plans found', job_count: 0, summary_count: 0 }, raw, 'no plans');
    return;
  }

  const isComplete = summaryCount >= jobCount;
  const status = isComplete ? 'Complete' : summaryCount > 0 ? 'In Progress' : 'Planned';
  const today = new Date().toISOString().split('T')[0];

  if (!fs.existsSync(roadmapPath)) {
    output({ updated: false, reason: 'ROADMAP.md not found', job_count: jobCount, summary_count: summaryCount }, raw, 'no roadmap');
    return;
  }

  let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
  const objectiveEscaped = objectiveNumPattern(objectiveNum);

  // Progress table row: update Plans + Status (and Completed, when complete) —
  // column-name-aware so the Milestone column (when present) is never disturbed.
  const tableUpdates = { plans: `${summaryCount}/${jobCount}`, status };
  if (isComplete) tableUpdates.completed = today;
  ({ content: roadmapContent } = updateProgressTableRow(roadmapContent, objectiveNum, tableUpdates));

  // Update job count in objective detail section — refreshes only the
  // machine-owned "N/M jobs complete/executed" prefix, preserving any
  // hand-authored detail that follows it.
  const jobCountText = isComplete
    ? `${summaryCount}/${jobCount} jobs complete`
    : `${summaryCount}/${jobCount} jobs executed`;
  ({ content: roadmapContent } = updateJobsLine(roadmapContent, objectiveNum, jobCountText));

  // If complete: check checkbox
  if (isComplete) {
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Objective\\s+${objectiveEscaped}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);
  }

  fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

  // Nested per-TRD checkboxes (`- [ ] NN-MM-TRD.md — ...`) from SUMMARY.md
  // presence + Self-Check verdict. Reuses the LOCKED `reconcile` export of
  // roadmap-reconcile.cjs in dry-run and applies ONLY this objective's per-TRD
  // changes. Write mode is deliberately not used: it rewrites every
  // objective's TRD lines and applies the `**Status:** complete` /
  // Progress-row rollups repo-wide.
  // The dry run reads the file written just above, so its line indices match;
  // the `before` equality check skips any line that no longer does.
  // roadmap-reconcile only recognises integer `### Objective N:` headers, so a
  // decimal objective (e.g. 40.1) has no section of its own and is skipped.
  const trdCheckboxes = [];
  if (/^\d+$/.test(String(objectiveNum))) {
    const want = String(parseInt(objectiveNum, 10)); // '040' / '40' -> '40'
    const mine = reconcile({ projectRoot: cwd, mode: 'dry-run' }).changes.filter(c =>
      (c.kind === 'trd_summary_exists' || c.kind === 'trd_summary_failed') &&
      String(parseInt(c.objective_num, 10)) === want);
    if (mine.length) {
      const lines = fs.readFileSync(roadmapPath, 'utf-8').split('\n');
      for (const c of mine) {
        if (lines[c.line_index] === c.before) {
          lines[c.line_index] = c.after;
          trdCheckboxes.push(c.trd_id);
        }
      }
      if (trdCheckboxes.length) fs.writeFileSync(roadmapPath, lines.join('\n'), 'utf-8');
    }
  }

  output({
    updated: true,
    objective: objectiveNum,
    job_count: jobCount,
    summary_count: summaryCount,
    status,
    complete: isComplete,
    trd_checkboxes_ticked: trdCheckboxes.length,
    trd_checkboxes: trdCheckboxes,
  }, raw, `${summaryCount}/${jobCount} ${status}`);
}

function cmdMilestoneComplete(cwd, version, options, raw) {
  if (!version) {
    error('version required for milestone complete (e.g., v1.0)');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const milestonesPath = path.join(cwd, '.planning', 'MILESTONES.md');
  const archiveDir = path.join(cwd, '.planning', 'milestones');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const today = new Date().toISOString().split('T')[0];
  const milestoneName = options.name || version;

  // Ensure archive directory exists
  fs.mkdirSync(archiveDir, { recursive: true });

  // Gather stats from objectives
  let objectiveCount = 0;
  let totalJobs = 0;
  let totalTasks = 0;
  const accomplishments = [];

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      objectiveCount++;
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = findPlanFiles(objectiveFiles);
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      totalJobs += plans.length;

      // Extract one-liners from summaries
      for (const s of summaries) {
        try {
          const content = fs.readFileSync(path.join(objectivesDir, dir, s), 'utf-8');
          const fm = extractFrontmatter(content);
          if (fm['one-liner']) {
            accomplishments.push(fm['one-liner']);
          }
          // Count tasks
          const taskMatches = content.match(/##\s*Task\s*\d+/gi) || [];
          totalTasks += taskMatches.length;
        } catch {}
      }
    }
  } catch {}

  // Archive ROADMAP.md
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    fs.writeFileSync(path.join(archiveDir, `${version}-ROADMAP.md`), roadmapContent, 'utf-8');
  }

  // Archive REQUIREMENTS.md
  if (fs.existsSync(reqPath)) {
    const reqContent = fs.readFileSync(reqPath, 'utf-8');
    const archiveHeader = `# Requirements Archive: ${version} ${milestoneName}\n\n**Archived:** ${today}\n**Status:** SHIPPED\n\nFor current requirements, see \`.planning/REQUIREMENTS.md\`.\n\n---\n\n`;
    fs.writeFileSync(path.join(archiveDir, `${version}-REQUIREMENTS.md`), archiveHeader + reqContent, 'utf-8');
  }

  // Archive audit file if exists
  const auditFile = path.join(cwd, '.planning', `${version}-MILESTONE-AUDIT.md`);
  if (fs.existsSync(auditFile)) {
    fs.renameSync(auditFile, path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`));
  }

  // Create/append MILESTONES.md entry
  const accomplishmentsList = accomplishments.map(a => `- ${a}`).join('\n');
  const milestoneEntry = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Objectives completed:** ${objectiveCount} objectives, ${totalJobs} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || '- (none recorded)'}\n\n---\n\n`;

  if (fs.existsSync(milestonesPath)) {
    const existing = fs.readFileSync(milestonesPath, 'utf-8');
    fs.writeFileSync(milestonesPath, existing + '\n' + milestoneEntry, 'utf-8');
  } else {
    fs.writeFileSync(milestonesPath, `# Milestones\n\n${milestoneEntry}`, 'utf-8');
  }

  // Update STATE.md
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');
    stateContent = stateContent.replace(
      /(\*\*Status:\*\*\s*).*/,
      `$1${version} milestone complete`
    );
    stateContent = stateContent.replace(
      /(\*\*Last Activity:\*\*\s*).*/,
      `$1${today}`
    );
    stateContent = stateContent.replace(
      /(\*\*Last Activity Description:\*\*\s*).*/,
      `$1${version} milestone completed and archived`
    );
    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  // Archive objective directories if requested
  let phasesArchived = false;
  if (options.archiveObjectives) {
    try {
      const phaseArchiveDir = path.join(archiveDir, `${version}-objectives`);
      fs.mkdirSync(phaseArchiveDir, { recursive: true });

      const phaseEntries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const objectiveDirNames = phaseEntries.filter(e => e.isDirectory()).map(e => e.name);
      for (const dir of objectiveDirNames) {
        fs.renameSync(path.join(objectivesDir, dir), path.join(phaseArchiveDir, dir));
      }
      phasesArchived = objectiveDirNames.length > 0;
    } catch {}
  }

  const result = {
    version,
    name: milestoneName,
    date: today,
    objectives: objectiveCount,
    jobs: totalJobs,
    tasks: totalTasks,
    accomplishments,
    archived: {
      roadmap: fs.existsSync(path.join(archiveDir, `${version}-ROADMAP.md`)),
      requirements: fs.existsSync(path.join(archiveDir, `${version}-REQUIREMENTS.md`)),
      audit: fs.existsSync(path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`)),
      objectives: phasesArchived,
    },
    milestones_updated: true,
    state_updated: fs.existsSync(statePath),
  };

  output(result, raw);
}

function cmdProgressRender(cwd, format, raw) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const milestone = getMilestoneInfo(cwd);

  const objectives = [];
  let totalJobs = 0;
  let totalSummaries = 0;

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => {
      const aNum = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      const bNum = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      return aNum - bNum;
    });

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const objectiveNum = dm ? dm[1] : dir;
      const objectiveName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = findPlanFiles(objectiveFiles).length;
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalJobs += plans;
      totalSummaries += summaries;

      let status;
      if (plans === 0) status = 'Pending';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      objectives.push({ number: objectiveNum, name: objectiveName, jobs: plans, summaries, status });
    }
  } catch {}

  const percent = totalJobs > 0 ? Math.round((totalSummaries / totalJobs) * 100) : 0;

  if (format === 'table') {
    // Render markdown table
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name}\n\n`;
    out += `**Progress:** [${bar}] ${totalSummaries}/${totalJobs} plans (${percent}%)\n\n`;
    out += `| Objective | Name | Plans | Status |\n`;
    out += `|-------|------|-------|--------|\n`;
    for (const p of objectives) {
      out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.jobs} | ${p.status} |\n`;
    }
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalJobs} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalJobs }, raw, text);
  } else {
    // JSON format
    output({
      milestone_version: milestone.version,
      milestone_name: milestone.name,
      objectives,
      total_jobs: totalJobs,
      total_summaries: totalSummaries,
      percent,
    }, raw);
  }
}

module.exports = {
  ROADMAP_STORE_SKIP,
  getMilestoneInfo,
  getRoadmapObjectiveInternal,
  cmdRoadmapGetObjective,
  cmdRoadmapAnalyze,
  cmdRoadmapUpdateJobProgress,
  cmdMilestoneComplete,
  cmdProgressRender,
};
