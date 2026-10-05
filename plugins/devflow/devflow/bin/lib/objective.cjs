'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, normalizeObjectiveName, objectiveDirMatches, generateSlugInternal, findPlanFiles, trdKey } = require('./helpers.cjs');
const { updateProgressTableRow, updateJobsLine } = require('./roadmap-progress.cjs');
const planningMode = require('./planning-mode.cjs');
const { escapeRegExp, objectiveNumPattern } = require('./text-escape.cjs');

// ─── Internal helpers ─────────────────────────────────────────────────────────

function searchObjectiveInDir(baseDir, relBase, normalized) {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const match = dirs.find(d => objectiveDirMatches(d, normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const objectiveNumber = dirMatch ? dirMatch[1] : normalized;
    const objectiveName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const objectiveDir = path.join(baseDir, match);
    const objectiveFiles = fs.readdirSync(objectiveDir);

    const plans = findPlanFiles(objectiveFiles).sort();
    const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
    const hasResearch = objectiveFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext = objectiveFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification = objectiveFiles.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');

    // Pair on the NN-MM key (TRD 53-02): a named TRD is complete under `NN-MM-SUMMARY.md`
    // or `NN-MM-<slug>-SUMMARY.md`.
    const completedJobKeys = new Set(summaries.map(s => trdKey(s)));
    const incompleteJobs = plans.filter(p => !completedJobKeys.has(trdKey(p)));

    return {
      found: true,
      directory: path.join(relBase, match),
      objective_number: objectiveNumber,
      objective_name: objectiveName,
      objective_slug: objectiveName ? objectiveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
      jobs: plans,
      summaries,
      incomplete_jobs: incompleteJobs,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
    };
  } catch {
    return null;
  }
}

function getArchivedObjectiveDirs(cwd) {
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  const results = [];

  if (!fs.existsSync(milestonesDir)) return results;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    // Find v*-objectives directories, sort newest first
    const objectiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-objectives$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of objectiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-objectives$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const entries = fs.readdirSync(archivePath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

      for (const dir of dirs) {
        results.push({
          name: dir,
          milestone: version,
          basePath: path.join('.planning', 'milestones', archiveName),
          fullPath: path.join(archivePath, dir),
        });
      }
    }
  } catch {}

  return results;
}

function findObjectiveInternal(cwd, objective) {
  if (!objective) return null;

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objective);

  // Search current objectives first
  const current = searchObjectiveInDir(objectivesDir, path.join('.planning', 'objectives'), normalized);
  if (current) return current;

  // Search archived milestone objectives (newest first)
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  if (!fs.existsSync(milestonesDir)) return null;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const archiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-objectives$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of archiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-objectives$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const relBase = path.join('.planning', 'milestones', archiveName);
      const result = searchObjectiveInDir(archivePath, relBase, normalized);
      if (result) {
        result.archived = version;
        return result;
      }
    }
  } catch {}

  return null;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdFindObjective(cwd, objective, raw) {
  if (!objective) {
    error('objective identifier required');
  }

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objective);

  const notFound = { found: false, directory: null, objective_number: null, objective_name: null, jobs: [], summaries: [] };

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    const match = dirs.find(d => objectiveDirMatches(d, normalized));
    if (!match) {
      output(notFound, raw, '');
      return;
    }

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const objectiveNumber = dirMatch ? dirMatch[1] : normalized;
    const objectiveName = dirMatch && dirMatch[2] ? dirMatch[2] : null;

    const objectiveDir = path.join(objectivesDir, match);
    const objectiveFiles = fs.readdirSync(objectiveDir);
    const plans = findPlanFiles(objectiveFiles).sort();
    const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();

    const result = {
      found: true,
      directory: path.join('.planning', 'objectives', match),
      objective_number: objectiveNumber,
      objective_name: objectiveName,
      jobs: plans,
      summaries,
    };

    output(result, raw, result.directory);
  } catch {
    output(notFound, raw, '');
  }
}

// cmdObjectiveNextDecimal — DEPRECATED in v1.2 (TRD 12-06, I2 survey: 0% usage across 16 projects).
// Decimal objectives were never used in practice. Use `objective add` to append integer objectives.
function cmdObjectiveNextDecimal(cwd, baseObjective, raw) {
  const deprecationResult = {
    error: 'decimal-objective commands were deprecated in v1.2; use df-tools objective add to append instead',
    removed_in: '12-06',
    recommendation: 'Use `df-tools objective add <description>` to append a new integer objective.',
  };
  process.stdout.write(JSON.stringify(deprecationResult, null, 2) + '\n');
  process.exit(1);
}

function cmdObjectivesList(cwd, options, raw) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const { type, objective, includeArchived } = options;

  // If no objectives directory, return empty
  if (!fs.existsSync(objectivesDir)) {
    if (type) {
      output({ files: [], count: 0 }, raw, '');
    } else {
      output({ directories: [], count: 0 }, raw, '');
    }
    return;
  }

  try {
    // Get all objective directories
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    let dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    // Include archived objectives if requested
    if (includeArchived) {
      const archived = getArchivedObjectiveDirs(cwd);
      for (const a of archived) {
        dirs.push(`${a.name} [${a.milestone}]`);
      }
    }

    // Sort numerically (handles decimals: 01, 02, 02.1, 02.2, 03)
    dirs.sort((a, b) => {
      const aNum = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      const bNum = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      return aNum - bNum;
    });

    // If filtering by objective number
    if (objective) {
      const normalized = normalizeObjectiveName(objective);
      // Archived entries read `04.1-one [v1.2]`: match on the directory name alone.
      const match = dirs.find(d => objectiveDirMatches(d.replace(/ \[v[\d.]+\]$/, ''), normalized));
      if (!match) {
        output({ files: [], count: 0, objective_dir: null, error: 'Objective not found' }, raw, '');
        return;
      }
      dirs = [match];
    }

    // If listing files of a specific type
    if (type) {
      const files = [];
      for (const dir of dirs) {
        const dirPath = path.join(objectivesDir, dir);
        const dirFiles = fs.readdirSync(dirPath);

        let filtered;
        if (type === 'jobs') {
          filtered = findPlanFiles(dirFiles);
        } else if (type === 'summaries') {
          filtered = dirFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        } else {
          filtered = dirFiles;
        }

        files.push(...filtered.sort());
      }

      const result = {
        files,
        count: files.length,
        objective_dir: objective ? dirs[0].replace(/^\d+(?:\.\d+)?-?/, '') : null,
      };
      output(result, raw, files.join('\n'));
      return;
    }

    // Default: list directories
    output({ directories: dirs, count: dirs.length }, raw, dirs.join('\n'));
  } catch (e) {
    error('Failed to list objectives: ' + e.message);
  }
}

// ─── Store mode (objective 48, TRD 48-14, D-08/D-19) ─────────────────────────
//
// With `github.store` on (planning-mode.cjs), ROADMAP.md and STATE.md are generated views and OBJECTIVE.md is a
// GitHub-backed cache file. The objective commands then route through planning-verbs and never edit the views:
//   add       the new dir and its OBJECTIVE.md through `objective put` (find-or-create of the issue, ledger)
//   insert    unchanged: deprecated since 12-06, it writes nothing in either mode
//   remove    refused: deletes are never automatic
//   complete  `objective set-status <id> complete` (closes the issue as completed)
// Each command takes ONE early store branch; the local bodies below are unchanged. planning-verbs is required
// lazily (it loads the gh libraries), and the store branch works on the MAIN checkout (D-14).

const ROADMAP_GENERATED = 'generated (gh pull --all)';

/** The parts of a planning-verb result an objective command reports under `verb`. */
function verbSummary(r) {
  const out = {
    ok: r.ok === true,
    mode: r.mode,
    rel: r.rel,
    exit: r.exit,
    flush: r.flush ? r.flush.status : null,
    warnings: r.warnings || [],
  };
  if (r.error) out.error = r.error;
  if (r.note) out.note = r.note;
  if (r.prose) out.prose = r.prose;
  return out;
}

/** OBJECTIVE.md for a new objective: the entry today's `objective add` appends to ROADMAP.md, under frontmatter. */
function newObjectiveText(dirName, num, description, dependsOn) {
  return [
    '---',
    `objective: ${dirName}`,
    'status: planned',
    '---',
    '',
    `# Objective ${num}: ${description}`,
    '',
    '**Goal:** [To be planned]',
    `**Depends on:** Objective ${dependsOn}`,
    '**Jobs:** 0 jobs',
    '',
    'Jobs:',
    `- [ ] TBD (run /devflow:plan-objective ${num} to break down)`,
    '',
  ].join('\n');
}

/**
 * Store-mode `objective add`: number and slug exactly as the local body does (ROADMAP headings when the view is
 * rendered, plus the objective dirs), create the dir, and write its OBJECTIVE.md through `objective put`.
 * ROADMAP.md is not edited: `gh pull --all` regenerates it from the objective issues.
 */
function storeObjectiveAdd(root, description, raw) {
  const roadmapPath = path.join(root, '.planning', 'ROADMAP.md');
  const content = fs.existsSync(roadmapPath) ? fs.readFileSync(roadmapPath, 'utf-8') : '';

  let slug = generateSlugInternal(description);
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-+$/, '');

  let maxObjective = 0;
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+)(?:\.\d+)?:/gi;
  let m;
  while ((m = objectivePattern.exec(content)) !== null) maxObjective = Math.max(maxObjective, parseInt(m[1], 10));
  const objectivesDir = path.join(root, '.planning', 'objectives');
  try {
    for (const entry of fs.readdirSync(objectivesDir, { withFileTypes: true })) {
      const dm = entry.isDirectory() ? entry.name.match(/^(\d+)(?:\.\d+)?-/) : null;
      if (dm) maxObjective = Math.max(maxObjective, parseInt(dm[1], 10));
    }
  } catch (_) {
    // No objectives dir yet: the ROADMAP count stands, as in the local body.
  }

  const newObjectiveNum = maxObjective + 1;
  const paddedNum = String(newObjectiveNum).padStart(2, '0');
  const dirName = `${paddedNum}-${slug}`;
  fs.mkdirSync(path.join(objectivesDir, dirName), { recursive: true });

  const text = newObjectiveText(dirName, newObjectiveNum, description, maxObjective);
  const r = require('./planning-verbs.cjs').objectivePut(root, { id: String(newObjectiveNum), text });
  const result = {
    objective_number: newObjectiveNum,
    padded: paddedNum,
    name: description,
    slug,
    directory: `.planning/objectives/${dirName}`,
    objective_file: `.planning/objectives/${dirName}/OBJECTIVE.md`,
    roadmap: ROADMAP_GENERATED,
    published: r.ok === true,
    verb: verbSummary(r),
  };
  if (r.ok !== true) {
    result.hint = `${result.objective_file} is written; run \`df-tools gh sync ${newObjectiveNum}\` once GitHub is reachable to create its issue`;
  }
  output(result, raw, paddedNum, r.exit);
}

/** The first objective directory numbered after `objectiveNum`: `{num, name}` or null (the local body's scan). */
function nextObjectiveDir(objectivesDir, objectiveNum) {
  try {
    const dirs = fs.readdirSync(objectivesDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
    const currentFloat = parseFloat(objectiveNum);
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      if (dm && parseFloat(dm[1]) > currentFloat) return { num: dm[1], name: dm[2] || null };
    }
  } catch {}
  return null;
}

/**
 * Store-mode `objective complete`: `objective set-status <id> complete` (OBJECTIVE.md `status:`, the objective
 * sync, and a patch-issue closing the issue as completed). ROADMAP.md, STATE.md and REQUIREMENTS.md are not edited;
 * requirements are ticked with `requirements mark-complete`, which publishes through `doc put`.
 */
function storeObjectiveComplete(root, objectiveNum, raw) {
  const objectiveInfo = findObjectiveInternal(root, objectiveNum);
  if (!objectiveInfo) {
    error(`Objective ${objectiveNum} not found`);
  }
  const r = require('./planning-verbs.cjs').objectiveSetStatus(root, { id: objectiveNum, status: 'complete' });
  const next = nextObjectiveDir(path.join(root, '.planning', 'objectives'), objectiveNum);
  const result = {
    completed: r.ok === true,
    completed_objective: objectiveNum,
    objective_name: objectiveInfo.objective_name,
    jobs_executed: `${objectiveInfo.summaries.length}/${objectiveInfo.jobs.length}`,
    next_objective: next ? next.num : null,
    next_objective_name: next ? next.name : null,
    is_last_objective: next === null,
    date: new Date().toISOString().split('T')[0],
    roadmap_updated: false,
    state_updated: false,
    state_update_reason: 'store_mode',
    roadmap: ROADMAP_GENERATED,
    verb: verbSummary(r),
  };
  output(result, raw, undefined, r.exit);
}

function cmdObjectiveAdd(cwd, description, raw) {
  if (!description) {
    error('description required for objective add');
  }

  // Reject flag-like descriptions (e.g. --help) before touching any files
  if (description.trim().startsWith('--')) {
    error('description must not start with "--" — got a flag-like argument: ' + description);
  }

  if (planningMode.isStoreMode(cwd)) return storeObjectiveAdd(planningMode.resolveMainRoot(cwd), description, raw);

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');

  // Cap slug at 60 chars, strip trailing hyphens left by mid-word cut
  let slug = generateSlugInternal(description);
  if (slug.length > 60) {
    slug = slug.slice(0, 60).replace(/-+$/, '');
  }

  // Find highest integer objective number from ROADMAP headings
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+)(?:\.\d+)?:/gi;
  let maxObjective = 0;
  let m;
  while ((m = objectivePattern.exec(content)) !== null) {
    const num = parseInt(m[1], 10);
    if (num > maxObjective) maxObjective = num;
  }

  // Also scan .planning/objectives/ directory prefixes so a dir without a ROADMAP heading
  // is still counted (prevents number collisions)
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  if (fs.existsSync(objectivesDir)) {
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirPrefixPattern = /^(\d+)(?:\.\d+)?-/;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const match = entry.name.match(dirPrefixPattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxObjective) maxObjective = num;
        }
      }
    } catch (_) {
      // Non-fatal: if readdir fails, fall back to ROADMAP-only count
    }
  }

  const newObjectiveNum = maxObjective + 1;
  const paddedNum = String(newObjectiveNum).padStart(2, '0');
  const dirName = `${paddedNum}-${slug}`;
  const dirPath = path.join(cwd, '.planning', 'objectives', dirName);

  // Create directory with .gitkeep so git tracks empty folders
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');

  // Build objective entry
  const objectiveEntry = `\n### Objective ${newObjectiveNum}: ${description}\n\n**Goal:** [To be planned]\n**Depends on:** Objective ${maxObjective}\n**Jobs:** 0 jobs\n\nJobs:\n- [ ] TBD (run /devflow:plan-objective ${newObjectiveNum} to break down)\n`;

  // Find insertion point: before last "---" or at end
  let updatedContent;
  const lastSeparator = content.lastIndexOf('\n---');
  if (lastSeparator > 0) {
    updatedContent = content.slice(0, lastSeparator) + objectiveEntry + content.slice(lastSeparator);
  } else {
    updatedContent = content + objectiveEntry;
  }

  fs.writeFileSync(roadmapPath, updatedContent, 'utf-8');

  const result = {
    objective_number: newObjectiveNum,
    padded: paddedNum,
    name: description,
    slug,
    directory: `.planning/objectives/${dirName}`,
  };

  output(result, raw, paddedNum);
}

// cmdObjectiveInsert — DEPRECATED in v1.2 (TRD 12-06, I2 survey: 0% usage across 16 projects).
// Decimal objectives were never used in practice. Use `objective add` to append integer objectives.
function cmdObjectiveInsert(cwd, afterObjective, description, raw) {
  const deprecationResult = {
    error: 'decimal-objective insertion was deprecated in v1.2; use df-tools objective add to append instead',
    removed_in: '12-06',
    recommendation: 'Use `df-tools objective add <description>` to append a new integer objective.',
  };
  process.stdout.write(JSON.stringify(deprecationResult, null, 2) + '\n');
  process.exit(1);
}

/**
 * Compute — without touching the filesystem — exactly what `objective remove`
 * would delete and rename.
 *
 * cmdObjectiveRemove prints this plan in dry-run mode and CONSUMES it in
 * --confirm mode, so the preview and the mutation cannot drift apart.
 *
 * PURE: performs zero fs mutations.
 *
 * Safe to call before the target directory is deleted: the rename filter is
 * strictly `dirInt > removedInt` and the target sits at `=== removedInt`, so the
 * target can never appear in the rename set either way.
 */
function computeRemovalPlan(objectivesDir, normalized, isDecimal, targetDir) {
  const plan = {
    target_directory: targetDir || null,
    renamed_directories: [],
    renamed_files: [],
  };

  // Decimal removal deletes the target only — sibling renumbering was dropped in
  // TRD 12-06 (I2 survey: 0% usage). The rename set is empty by construction,
  // which is what keeps an integer sibling like 07-later from being renumbered.
  if (isDecimal) return plan;

  const removedInt = parseInt(normalized, 10);

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    // Collect directories that need renumbering (integer objectives > removed, and their decimals)
    const toRename = [];
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+)(?:\.(\d+))?-(.+)$/);
      if (!dm) continue;
      const dirInt = parseInt(dm[1], 10);
      if (dirInt > removedInt) {
        toRename.push({
          dir,
          oldInt: dirInt,
          decimal: dm[2] ? parseInt(dm[2], 10) : null,
          slug: dm[3],
        });
      }
    }

    // Sort descending to avoid conflicts
    toRename.sort((a, b) => {
      if (a.oldInt !== b.oldInt) return b.oldInt - a.oldInt;
      return (b.decimal || 0) - (a.decimal || 0);
    });

    for (const item of toRename) {
      const newInt = item.oldInt - 1;
      const newPadded = String(newInt).padStart(2, '0');
      const oldPadded = String(item.oldInt).padStart(2, '0');
      const decimalSuffix = item.decimal !== null ? `.${item.decimal}` : '';
      const oldPrefix = `${oldPadded}${decimalSuffix}`;
      const newPrefix = `${newPadded}${decimalSuffix}`;
      const newDirName = `${newPrefix}-${item.slug}`;

      plan.renamed_directories.push({ from: item.dir, to: newDirName });

      // Planning runs before any rename, so this reads the OLD directory name.
      // `directory` records where the file will live once its parent rename
      // lands, so the executor can join a path without re-deriving anything.
      const dirFiles = fs.readdirSync(path.join(objectivesDir, item.dir));
      for (const f of dirFiles) {
        if (f.startsWith(oldPrefix)) {
          plan.renamed_files.push({
            directory: newDirName,
            from: f,
            to: newPrefix + f.slice(oldPrefix.length),
          });
        }
      }
    }
  } catch {}

  return plan;
}

/** Human-readable rendering of a removal plan. Callers write this to stderr. */
function renderPlanText(target, plan) {
  const lines = [];
  lines.push('DRY RUN — nothing has been modified.');
  lines.push(`Plan for: objective remove ${target}`);
  lines.push('');
  lines.push(`Directory to delete: ${plan.target_directory || '(none found)'}`);
  lines.push('');

  if (plan.renamed_directories.length === 0) {
    lines.push('Directories to rename: (none)');
  } else {
    lines.push(`Directories to rename (${plan.renamed_directories.length}):`);
    for (const d of plan.renamed_directories) {
      lines.push(`  ${d.from} -> ${d.to}`);
    }
  }
  lines.push('');

  if (plan.renamed_files.length === 0) {
    lines.push('Files to rename: (none)');
  } else {
    lines.push(`Files to rename (${plan.renamed_files.length}):`);
    for (const f of plan.renamed_files) {
      lines.push(`  [${f.directory}] ${f.from} -> ${f.to}`);
    }
  }
  lines.push('');
  lines.push('ROADMAP.md and STATE.md would also be renumbered.');
  lines.push('Re-run with --confirm to execute.');

  return lines.join('\n') + '\n';
}

function cmdObjectiveRemove(cwd, targetObjective, options, raw) {
  if (!targetObjective) {
    error('objective number required for objective remove');
  }

  if (planningMode.isStoreMode(cwd)) {
    error(`objective remove is refused in store mode: deletes are never automatic. Close the objective issue with df-tools objective set-status ${targetObjective} cancelled`);
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const force = options.force || false;
  const confirm = options.confirm || false;

  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  // Normalize the target
  const normalized = normalizeObjectiveName(targetObjective);
  const isDecimal = targetObjective.includes('.');

  // Find and validate target directory
  let targetDir = null;
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    targetDir = dirs.find(d => objectiveDirMatches(d, normalized));
  } catch {}

  // Check for executed work (SUMMARY.md files).
  //
  // ORDER IS LOAD-BEARING: this rail is evaluated BEFORE the --confirm
  // short-circuit below. If the dry run returned first, removing an objective
  // that has executed jobs would exit 0 instead of refusing with exit 1.
  if (targetDir && !force) {
    const targetPath = path.join(objectivesDir, targetDir);
    const files = fs.readdirSync(targetPath);
    const summaries = files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
    if (summaries.length > 0) {
      error(`Objective ${targetObjective} has ${summaries.length} executed job(s). Use --force to remove anyway.`);
    }
  }

  const plan = computeRemovalPlan(objectivesDir, normalized, isDecimal, targetDir);

  // Dry run by default. --force overrides the executed-jobs rail above;
  // --confirm authorizes the destructive cascade. The two are independent, and
  // removing an objective that has executed jobs needs both.
  if (!confirm) {
    process.stderr.write(renderPlanText(targetObjective, plan));
    output(
      {
        removed: targetObjective,
        dry_run: true,
        confirmed: false,
        mutated: false,
        directory_deleted: null,
        target_directory: plan.target_directory,
        renamed_directories: plan.renamed_directories,
        renamed_files: plan.renamed_files,
        roadmap_updated: false,
        state_updated: false,
        hint: 'Re-run with --confirm to execute this plan.',
      },
      raw
    );
    // output() calls process.exit — nothing below this point runs.
  }

  // Delete target directory
  if (targetDir) {
    fs.rmSync(path.join(objectivesDir, targetDir), { recursive: true, force: true });
  }

  // Renumber subsequent objectives by EXECUTING the plan. Never recompute the
  // renames here: a second, independent computation is exactly how the printed
  // plan and the actual mutation come apart.
  const renamedDirs = [];
  const renamedFiles = [];
  let partial = false;
  let failing = null;

  try {
    for (const d of plan.renamed_directories) {
      failing = `directory ${d.from} -> ${d.to}`;
      fs.renameSync(path.join(objectivesDir, d.from), path.join(objectivesDir, d.to));
      renamedDirs.push(d);

      // Files are renamed immediately after their parent directory, matching the
      // on-disk sequence this command has always used.
      for (const f of plan.renamed_files) {
        if (f.directory !== d.to) continue;
        failing = `file ${f.directory}/${f.from} -> ${f.to}`;
        fs.renameSync(
          path.join(objectivesDir, f.directory, f.from),
          path.join(objectivesDir, f.directory, f.to)
        );
        renamedFiles.push(f);
      }
    }
    failing = null;
  } catch (err) {
    // Failure semantics are deliberately unchanged: the cascade aborts at the
    // failing rename, earlier renames stay applied, ROADMAP.md is still
    // rewritten below, and the exit code stays 0. Making the cascade atomic is
    // out of scope. The one thing added here is that it is no longer SILENT.
    partial = true;
    process.stderr.write(
      `Warning: rename cascade aborted at ${failing} — ${(err && err.message) || err}\n` +
        `Applied ${renamedDirs.length}/${plan.renamed_directories.length} directory renames ` +
        `and ${renamedFiles.length}/${plan.renamed_files.length} file renames before failing.\n` +
        'The objectives tree is now partially renumbered; fix the remaining names by hand.\n'
    );
  }

  // Update ROADMAP.md
  let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

  // Remove the target objective section
  const targetEscaped = objectiveNumPattern(targetObjective);
  const sectionPattern = new RegExp(
    `\\n?#{2,4}\\s*Objective\\s+${targetEscaped}\\s*:[\\s\\S]*?(?=\\n#{2,4}\\s+Objective\\s+\\d|$)`,
    'i'
  );
  roadmapContent = roadmapContent.replace(sectionPattern, '');

  // Remove from objective list (checkbox)
  const checkboxPattern = new RegExp(`\\n?-\\s*\\[[ x]\\]\\s*.*Objective\\s+${targetEscaped}[:\\s][^\\n]*`, 'gi');
  roadmapContent = roadmapContent.replace(checkboxPattern, '');

  // Remove from progress table
  const tableRowPattern = new RegExp(`\\n?\\|\\s*${targetEscaped}\\.?\\s[^|]*\\|[^\\n]*`, 'gi');
  roadmapContent = roadmapContent.replace(tableRowPattern, '');

  // Renumber references in ROADMAP for subsequent objectives
  if (!isDecimal) {
    const removedInt = parseInt(normalized, 10);

    // Collect all integer objectives > removedInt
    const maxObjective = 99; // reasonable upper bound
    for (let oldNum = maxObjective; oldNum > removedInt; oldNum--) {
      const newNum = oldNum - 1;
      const oldStr = String(oldNum);
      const newStr = String(newNum);
      const oldPad = oldStr.padStart(2, '0');
      const newPad = newStr.padStart(2, '0');

      // Objective headings: ## Objective 18: or ### Objective 18: → ## Objective 17: or ### Objective 17:
      roadmapContent = roadmapContent.replace(
        new RegExp(`(#{2,4}\\s*Objective\\s+)${oldStr}(\\s*:)`, 'gi'),
        `$1${newStr}$2`
      );

      // Checkbox items: - [ ] **Objective 18:** → - [ ] **Objective 17:**
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Objective\\s+)${oldStr}([:\\s])`, 'g'),
        `$1${newStr}$2`
      );

      // Job references: 18-01 → 17-01
      roadmapContent = roadmapContent.replace(
        new RegExp(`${oldPad}-(\\d{2})`, 'g'),
        `${newPad}-$1`
      );

      // Table rows: | 18. → | 17.
      roadmapContent = roadmapContent.replace(
        new RegExp(`(\\|\\s*)${oldStr}\\.\\s`, 'g'),
        `$1${newStr}. `
      );

      // Depends on references
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Depends on:\\*\\*\\s*Objective\\s+)${oldStr}\\b`, 'gi'),
        `$1${newStr}`
      );
    }
  }

  fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

  // Update STATE.md objective count. state_updated reports an actual write,
  // not whether the file exists (TOOL-02).
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  let stateUpdated = false;
  if (fs.existsSync(statePath)) {
    const originalState = fs.readFileSync(statePath, 'utf-8');
    let stateContent = originalState;
    // Update "Total Objectives" field
    const totalPattern = /(\*\*Total Objectives:\*\*\s*)(\d+)/;
    const totalMatch = stateContent.match(totalPattern);
    if (totalMatch) {
      const oldTotal = parseInt(totalMatch[2], 10);
      stateContent = stateContent.replace(totalPattern, `$1${oldTotal - 1}`);
    }
    // Update "Objective: X of Y" pattern
    const ofPattern = /(\bof\s+)(\d+)(\s*(?:\(|objectives?))/i;
    const ofMatch = stateContent.match(ofPattern);
    if (ofMatch) {
      const oldTotal = parseInt(ofMatch[2], 10);
      stateContent = stateContent.replace(ofPattern, `$1${oldTotal - 1}$3`);
    }
    if (stateContent !== originalState) {
      fs.writeFileSync(statePath, stateContent, 'utf-8');
      stateUpdated = true;
    }
  }

  const result = {
    removed: targetObjective,
    dry_run: false,
    confirmed: true,
    mutated: true,
    partial,
    directory_deleted: targetDir || null,
    target_directory: plan.target_directory,
    renamed_directories: renamedDirs,
    renamed_files: renamedFiles,
    roadmap_updated: true,
    state_updated: stateUpdated,
  };

  output(result, raw);
}

function cmdObjectiveComplete(cwd, objectiveNum, raw) {
  if (!objectiveNum) {
    error('objective number required for objective complete');
  }

  if (planningMode.isStoreMode(cwd)) return storeObjectiveComplete(planningMode.resolveMainRoot(cwd), objectiveNum, raw);

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objectiveNum);
  const today = new Date().toISOString().split('T')[0];

  // Verify objective info
  const objectiveInfo = findObjectiveInternal(cwd, objectiveNum);
  if (!objectiveInfo) {
    error(`Objective ${objectiveNum} not found`);
  }

  const jobCount = objectiveInfo.jobs.length;
  const summaryCount = objectiveInfo.summaries.length;

  // Update ROADMAP.md: mark objective complete
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

    // Checkbox: - [ ] Objective N: → - [x] Objective N: (...completed DATE)
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Objective\\s+${objectiveNumPattern(objectiveNum)}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);

    // Progress table: update Status to Complete, set Completed date — column-name-
    // aware so the Milestone column (when present) is never disturbed.
    ({ content: roadmapContent } = updateProgressTableRow(roadmapContent, objectiveNum, {
      status: 'Complete',
      completed: today,
    }));

    // Update job count in objective section — refreshes only the machine-owned
    // "N/M jobs complete" prefix, preserving any hand-authored detail after it.
    ({ content: roadmapContent } = updateJobsLine(
      roadmapContent,
      objectiveNum,
      `${summaryCount}/${jobCount} jobs complete`
    ));

    fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

    // Update REQUIREMENTS.md traceability for this objective's requirements
    const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
    if (fs.existsSync(reqPath)) {
      // Extract the Requirements line from this objective's own section. Anchoring to the `#{2,4}` header
      // keeps a checklist mention of `Objective N` from starting the scan in an earlier section.
      const headerRe = new RegExp(`^#{2,4}\\s*Objective\\s+${objectiveNumPattern(objectiveNum)}\\s*:`, 'im');
      const header = headerRe.exec(roadmapContent);
      let reqMatch = null;
      if (header) {
        const rest = roadmapContent.slice(header.index + header[0].length);
        const next = rest.search(/\n#{2,4}\s*Objective\s+\d/i);
        const section = next === -1 ? rest : rest.slice(0, next);
        reqMatch = section.match(/\*\*Requirements:\*\*\s*([^\n]+)/i);
      }

      if (reqMatch) {
        const reqIds = reqMatch[1].replace(/[\[\]]/g, '').split(/[,\s]+/).map(r => r.trim()).filter(Boolean);
        let reqContent = fs.readFileSync(reqPath, 'utf-8');

        for (const reqId of reqIds) {
          // Update checkbox: - [ ] **REQ-ID** → - [x] **REQ-ID**
          reqContent = reqContent.replace(
            new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${escapeRegExp(reqId)}\\*\\*)`, 'gi'),
            '$1x$2'
          );
          // Update traceability table: | REQ-ID | Objective N | Pending | → | REQ-ID | Objective N | Complete |
          reqContent = reqContent.replace(
            new RegExp(`(\\|\\s*${escapeRegExp(reqId)}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi'),
            '$1 Complete $2'
          );
        }

        fs.writeFileSync(reqPath, reqContent, 'utf-8');
      }
    }
  }

  // Find next objective
  let nextObjectiveNum = null;
  let nextObjectiveName = null;
  let isLastObjective = true;

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const currentFloat = parseFloat(objectiveNum);

    // Find the next objective directory after current
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      if (dm) {
        const dirFloat = parseFloat(dm[1]);
        if (dirFloat > currentFloat) {
          nextObjectiveNum = dm[1];
          nextObjectiveName = dm[2] || null;
          isLastObjective = false;
          break;
        }
      }
    }
  } catch {}

  // Update STATE.md. Two schemas, told apart by **Current Objective:** — the
  // legacy template's anchor field (still documented in workflows/transition.md).
  //
  // Legacy (field present): advance Current Objective / Status / Current Job /
  // Last Activity fields as always.
  //
  // Narrative (field absent): a running "**Objective complete:** N — ..." log
  // plus one free-text "**Status:**" summary line. That file still has a field
  // literally named **Status:**, which the legacy replaces would destructively
  // overwrite with a short templated value — wiping the narrative summary and
  // moving status backward for an objective that was just completed. So the
  // narrative branch is additive only (TOOL-02): it inserts one
  // "**Objective complete:** N — <title> (completed <date>, S/J TRDs)" line
  // directly after the LAST existing log line, and never touches **Status:**.
  // It is idempotent (an existing "N —" line means nothing is written), and it
  // writes nothing when there is no log line to anchor to — it never guesses a
  // position such as end-of-file.
  //
  // state_updated reports whether STATE.md was actually written, never merely
  // whether it exists; state_update_reason says why when it was not.
  let stateUpdated = false;
  let stateUpdateReason = null;
  if (!fs.existsSync(statePath)) {
    stateUpdateReason = 'state_missing';
  } else {
    const original = fs.readFileSync(statePath, 'utf-8');
    let stateContent = original;
    const isLegacyStateSchema = /\*\*Current Objective:\*\*/m.test(stateContent);

    if (isLegacyStateSchema) {
      // Update Current Objective
      stateContent = stateContent.replace(
        /(\*\*Current Objective:\*\*\s*).*/,
        `$1${nextObjectiveNum || objectiveNum}`
      );

      // Update Current Objective Name
      if (nextObjectiveName) {
        stateContent = stateContent.replace(
          /(\*\*Current Objective Name:\*\*\s*).*/,
          `$1${nextObjectiveName.replace(/-/g, ' ')}`
        );
      }

      // Update Status
      stateContent = stateContent.replace(
        /(\*\*Status:\*\*\s*).*/,
        `$1${isLastObjective ? 'Milestone complete' : 'Ready to plan'}`
      );

      // Update Current Job
      stateContent = stateContent.replace(
        /(\*\*Current Job:\*\*\s*).*/,
        `$1Not started`
      );

      // Update Last Activity
      stateContent = stateContent.replace(
        /(\*\*Last Activity:\*\*\s*).*/,
        `$1${today}`
      );

      // Update Last Activity Description
      stateContent = stateContent.replace(
        /(\*\*Last Activity Description:\*\*\s*).*/,
        `$1Objective ${objectiveNum} complete${nextObjectiveNum ? `, transitioned to Objective ${nextObjectiveNum}` : ''}`
      );
    } else {
      const logNum = logObjectiveNumber(objectiveNum);
      const alreadyLogged = new RegExp(
        `^\\*\\*Objective complete:\\*\\*\\s*0*${escapeRegExp(logNum)}\\s*[—–-]`,
        'm'
      );
      const logLines = [...original.matchAll(/^\*\*Objective complete:\*\*.*$/gm)];

      if (alreadyLogged.test(original)) {
        stateUpdateReason = 'already_logged';
      } else if (!logLines.length) {
        stateUpdateReason = 'no_log_anchor';
      } else {
        const title = objectiveTitle(roadmapPath, logNum, objectiveInfo.objective_name);
        const eol = original.includes('\r\n') ? '\r\n' : '\n';
        const last = logLines[logLines.length - 1];
        const at = last.index + last[0].length;
        stateContent =
          original.slice(0, at) +
          `${eol}**Objective complete:** ${logNum} — ${title} (completed ${today}, ${summaryCount}/${jobCount} TRDs)` +
          original.slice(at);
      }
    }

    if (stateContent !== original) {
      fs.writeFileSync(statePath, stateContent, 'utf-8');
      stateUpdated = true;
    } else if (!stateUpdateReason) {
      stateUpdateReason = 'unchanged';
    }
  }

  const result = {
    completed_objective: objectiveNum,
    objective_name: objectiveInfo.objective_name,
    jobs_executed: `${summaryCount}/${jobCount}`,
    next_objective: nextObjectiveNum,
    next_objective_name: nextObjectiveName,
    is_last_objective: isLastObjective,
    date: today,
    roadmap_updated: fs.existsSync(roadmapPath),
    state_updated: stateUpdated,
    state_update_reason: stateUpdateReason,
  };

  output(result, raw);
}

// The objective number as written in the narrative log: leading zeros dropped
// from the integer part ('07' → '7'), decimal part kept ('12.1' stays '12.1',
// so an inserted objective is never mistaken for its parent).
function logObjectiveNumber(objectiveNum) {
  const m = String(objectiveNum).match(/^0*(\d+)((?:\.\d+)?)/);
  return m ? `${m[1]}${m[2]}` : String(objectiveNum);
}

// Title for the narrative log line: the ROADMAP.md "### Objective N: <title>"
// heading with any trailing ✅ stripped; otherwise the objective directory's
// name with hyphens as spaces; otherwise "Objective N".
function objectiveTitle(roadmapPath, logNum, objectiveName) {
  if (fs.existsSync(roadmapPath)) {
    const roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    const heading = roadmap.match(new RegExp(
      `^#{2,4}\\s*Objective\\s+0*${escapeRegExp(logNum)}\\s*:[ \\t]*(.+?)(?:[ \\t]*\\u2705\\uFE0F?)*[ \\t]*$`,
      'mu'
    ));
    if (heading && heading[1].trim()) return heading[1].trim();
  }
  if (objectiveName) return objectiveName.replace(/-/g, ' ');
  return `Objective ${logNum}`;
}

module.exports = {
  searchObjectiveInDir,
  getArchivedObjectiveDirs,
  findObjectiveInternal,
  cmdFindObjective,
  cmdObjectiveNextDecimal,
  cmdObjectivesList,
  cmdObjectiveAdd,
  cmdObjectiveInsert,
  cmdObjectiveRemove,
  cmdObjectiveComplete,
};
