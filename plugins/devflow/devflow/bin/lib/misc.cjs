'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output, error, safeReadFile, execGit, findPlanFiles, stripPlanSuffix, trdKey, normalizeObjectiveName, objectiveDirMatches, generateSlugInternal } = require('./helpers.cjs');
const { loadConfig } = require('./config.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { getArchivedObjectiveDirs, findObjectiveInternal } = require('./objective.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

function cmdGenerateSlug(text, raw) {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const result = { slug };
  output(result, raw, slug);
}

function cmdCurrentTimestamp(format, raw) {
  const now = new Date();
  let result;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

function cmdListTodos(cwd, area, raw) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');

  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);

        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        // Apply area filter if specified
        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.join('.planning', 'todos', 'pending', file),
        });
      } catch {}
    }
  } catch {}

  const result = { count, todos };
  output(result, raw, count.toString());
}

function cmdVerifyPathExists(cwd, targetPath, raw) {
  if (!targetPath) {
    error('path required for verification');
  }

  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

  try {
    const stats = fs.statSync(fullPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

function cmdHistoryDigest(cwd, raw) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const digest = { objectives: {}, decisions: [], tech_stack: new Set() };

  // Collect all objective directories: archived + current
  const allObjectiveDirs = [];

  // Add archived objectives first (oldest milestones first)
  const archived = getArchivedObjectiveDirs(cwd);
  for (const a of archived) {
    allObjectiveDirs.push({ name: a.name, fullPath: a.fullPath, milestone: a.milestone });
  }

  // Add current objectives
  if (fs.existsSync(objectivesDir)) {
    try {
      const currentDirs = fs.readdirSync(objectivesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
      for (const dir of currentDirs) {
        allObjectiveDirs.push({ name: dir, fullPath: path.join(objectivesDir, dir), milestone: null });
      }
    } catch {}
  }

  if (allObjectiveDirs.length === 0) {
    digest.tech_stack = [];
    output(digest, raw);
    return;
  }

  try {
    for (const { name: dir, fullPath: dirPath } of allObjectiveDirs) {
      const summaries = fs.readdirSync(dirPath).filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        try {
          const content = fs.readFileSync(path.join(dirPath, summary), 'utf-8');
          const fm = extractFrontmatter(content);

          const objectiveNum = fm.objective || dir.split('-')[0];

          if (!digest.objectives[objectiveNum]) {
            digest.objectives[objectiveNum] = {
              name: fm.name || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set(),
              affects: new Set(),
              patterns: new Set(),
            };
          }

          // Merge provides
          if (fm['dependency-graph'] && fm['dependency-graph'].provides) {
            fm['dependency-graph'].provides.forEach(p => digest.objectives[objectiveNum].provides.add(p));
          } else if (fm.provides) {
            fm.provides.forEach(p => digest.objectives[objectiveNum].provides.add(p));
          }

          // Merge affects
          if (fm['dependency-graph'] && fm['dependency-graph'].affects) {
            fm['dependency-graph'].affects.forEach(a => digest.objectives[objectiveNum].affects.add(a));
          }

          // Merge patterns
          if (fm['patterns-established']) {
            fm['patterns-established'].forEach(p => digest.objectives[objectiveNum].patterns.add(p));
          }

          // Merge decisions
          if (fm['key-decisions']) {
            fm['key-decisions'].forEach(d => {
              digest.decisions.push({ objective: objectiveNum, decision: d });
            });
          }

          // Merge tech stack
          if (fm['tech-stack'] && fm['tech-stack'].added) {
            fm['tech-stack'].added.forEach(t => digest.tech_stack.add(typeof t === 'string' ? t : t.name));
          }

        } catch (e) {
          // Skip malformed summaries
        }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.objectives).forEach(p => {
      digest.objectives[p].provides = [...digest.objectives[p].provides];
      digest.objectives[p].affects = [...digest.objectives[p].affects];
      digest.objectives[p].patterns = [...digest.objectives[p].patterns];
    });
    digest.tech_stack = [...digest.tech_stack];

    output(digest, raw);
  } catch (e) {
    error('Failed to generate history digest: ' + e.message);
  }
}

// A SUMMARY carrying a `## Progress` checkpoint but no `## Self-Check` heading was written
// mid-run: the executor contract (44-01) says "A SUMMARY without `## Self-Check` means
// checkpoint, not complete". Requiring `## Progress` as well keeps every old-style SUMMARY
// (neither heading) complete, so historical objectives never re-run. Scope (TRD 44-08): only
// objective-job-index reads this — roadmap analyze, progress bars and verify-completion.js
// still count any SUMMARY file.
function _isCheckpointOnlySummary(text) {
  return /^##\s+Progress\b/m.test(text) && !/^##\s+Self-Check\b/m.test(text);
}

function _summaryIsComplete(summaryPath) {
  let text;
  try {
    text = fs.readFileSync(summaryPath, 'utf-8');
  } catch {
    return true; // unreadable: keep the pre-44-08 behaviour (a SUMMARY file means done)
  }
  return !_isCheckpointOnlySummary(text);
}

// Opening `<task ...>` elements of the XML TRD format: at the start of a line (optionally
// indented) and outside fenced code blocks. A bare /<task\b/g also counts prose that mentions
// a task tag in backticks and XML examples inside fences (it read 5 for 44-08-TRD.md, which
// has 2 tasks). `<tasks>` (the wrapper) and `</task>` never match.
function _countTaskElements(content) {
  const unfenced = content.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '');
  return (unfenced.match(/^[ \t]*<task\b/gm) || []).length;
}

function cmdObjectiveJobIndex(cwd, objective, raw) {
  if (!objective) {
    error('objective required for objective-job-index');
  }

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objective);

  // Find objective directory
  let objectiveDir = null;
  let objectiveDirName = null;
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const match = dirs.find(d => objectiveDirMatches(d, normalized));
    if (match) {
      objectiveDir = path.join(objectivesDir, match);
      objectiveDirName = match;
    }
  } catch {
    // objectives dir doesn't exist
  }

  if (!objectiveDir) {
    output({ objective: normalized, error: 'Objective not found', jobs: [], waves: {}, incomplete: [], has_checkpoints: false }, raw);
    return;
  }

  // Get all files in objective directory
  const objectiveFiles = fs.readdirSync(objectiveDir);
  const jobFiles = findPlanFiles(objectiveFiles).sort();
  const summaryFiles = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

  // Build set of NN-MM keys with a completed SUMMARY (a Progress-only checkpoint is not complete).
  // Pair on the key (TRD 53-02), so `NN-MM-<slug>-TRD.md` is complete under `NN-MM-SUMMARY.md`
  // or `NN-MM-<slug>-SUMMARY.md`. The job `id` below stays `stripPlanSuffix(jobFile)`: that JSON
  // shape is consumed by execute-objective.
  const completedJobKeys = new Set(
    summaryFiles
      .filter(s => _summaryIsComplete(path.join(objectiveDir, s)))
      .map(s => trdKey(s))
  );

  const plans = [];
  const waves = {};
  const incomplete = [];
  let hasCheckpoints = false;

  for (const jobFile of jobFiles) {
    const jobId = stripPlanSuffix(jobFile);
    const jobPath = path.join(objectiveDir, jobFile);
    const content = fs.readFileSync(jobPath, 'utf-8');
    const fm = extractFrontmatter(content);

    // Count tasks: <task> XML elements (TRD format), else legacy `## Task N` headings (JOB format)
    const taskCount =
      _countTaskElements(content) || (content.match(/##\s*Task\s*\d+/gi) || []).length;

    // Parse wave as integer
    const wave = parseInt(fm.wave, 10) || 1;

    // Parse autonomous (default true if not specified)
    let autonomous = true;
    if (fm.autonomous !== undefined) {
      autonomous = fm.autonomous === 'true' || fm.autonomous === true;
    }

    if (!autonomous) {
      hasCheckpoints = true;
    }

    // Parse files_modified (TRD key; legacy files-modified accepted)
    let filesModified = [];
    const fmFiles = fm.files_modified ?? fm['files-modified'];
    if (fmFiles) filesModified = Array.isArray(fmFiles) ? fmFiles : [fmFiles];

    const hasSummary = completedJobKeys.has(trdKey(jobFile));
    if (!hasSummary) {
      incomplete.push(jobId);
    }

    const job = {
      id: jobId,
      wave,
      autonomous,
      objective: fm.objective || null,
      files_modified: filesModified,
      task_count: taskCount,
      has_summary: hasSummary,
    };

    plans.push(job);

    // Group by wave
    const waveKey = String(wave);
    if (!waves[waveKey]) {
      waves[waveKey] = [];
    }
    waves[waveKey].push(jobId);
  }

  const result = {
    objective: normalized,
    jobs: plans,
    waves,
    incomplete,
    has_checkpoints: hasCheckpoints,
  };

  output(result, raw);
}

function cmdSummaryExtract(cwd, summaryPath, fields, raw) {
  if (!summaryPath) {
    error('summary-path required for summary-extract');
  }

  const fullPath = path.join(cwd, summaryPath);

  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: summaryPath }, raw);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);

  // Parse key-decisions into structured format
  const parseDecisions = (decisionsList) => {
    if (!decisionsList || !Array.isArray(decisionsList)) return [];
    return decisionsList.map(d => {
      const colonIdx = d.indexOf(':');
      if (colonIdx > 0) {
        return {
          summary: d.substring(0, colonIdx).trim(),
          rationale: d.substring(colonIdx + 1).trim(),
        };
      }
      return { summary: d, rationale: null };
    });
  };

  // Build full result
  const fullResult = {
    path: summaryPath,
    one_liner: fm['one-liner'] || null,
    key_files: fm['key-files'] || [],
    tech_added: (fm['tech-stack'] && fm['tech-stack'].added) || [],
    patterns: fm['patterns-established'] || [],
    decisions: parseDecisions(fm['key-decisions']),
  };

  // If fields specified, filter to only those fields
  if (fields && fields.length > 0) {
    const filtered = { path: summaryPath };
    for (const field of fields) {
      if (fullResult[field] !== undefined) {
        filtered[field] = fullResult[field];
      }
    }
    output(filtered, raw);
    return;
  }

  output(fullResult, raw);
}

async function cmdWebsearch(query, options, raw) {
  const apiKey = process.env.BRAVE_API_KEY;

  if (!apiKey) {
    // No key = silent skip, agent falls back to built-in WebSearch
    output({ available: false, reason: 'BRAVE_API_KEY not set' }, raw, '');
    return;
  }

  if (!query) {
    output({ available: false, error: 'Query required' }, raw, '');
    return;
  }

  const params = new URLSearchParams({
    q: query,
    count: String(options.limit || 10),
    country: 'us',
    search_lang: 'en',
    text_decorations: 'false'
  });

  if (options.freshness) {
    params.set('freshness', options.freshness);
  }

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      }
    );

    if (!response.ok) {
      output({ available: false, error: `API error: ${response.status}` }, raw, '');
      return;
    }

    const data = await response.json();

    const results = (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age || null
    }));

    output({
      available: true,
      query,
      count: results.length,
      results
    }, raw, results.map(r => `${r.title}\n${r.url}\n${r.description}`).join('\n\n'));
  } catch (err) {
    output({ available: false, error: err.message }, raw, '');
  }
}

/**
 * Is a merge in progress? git refuses a partial (pathspec-scoped) commit while
 * MERGE_HEAD exists, so `df-tools commit` cannot use its normal scoped form.
 */
function mergeInProgress(cwd) {
  return execGit(cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).exitCode === 0;
}

/**
 * A merge or a rebase in progress in THIS checkout's own git dir (TRD 50-06). The same markers hooks/gate-commits.js reads:
 * MERGE_HEAD, `rebase-merge/` and `rebase-apply/`. `--absolute-git-dir` is the per-worktree dir, which is where a linked
 * worktree's rebase state lives. Any git failure reads as "nothing in progress".
 */
function mergeOrRebaseInProgress(cwd) {
  if (mergeInProgress(cwd)) return true;
  const gitDir = execGit(cwd, ['rev-parse', '--absolute-git-dir']);
  if (gitDir.exitCode !== 0 || !gitDir.stdout) return false;
  return ['rebase-merge', 'rebase-apply'].some((name) => fs.existsSync(path.join(gitDir.stdout, name)));
}

/** A --files argument as a repo-root-relative posix path ('' means the whole repo). */
function repoPathOf(prefix, file) {
  const full = path.posix.normalize(prefix + String(file).replace(/\\/g, '/')).replace(/\/+$/, '');
  return full === '.' ? '' : full;
}

/**
 * Staged removals under `files` whose working copy still exists (TRD 44-06).
 *
 * Why this matters: for a pathspec commit (`git commit -m msg -- <paths>`, git's `--only` mode)
 * git re-stages every matching path from the WORKING TREE, including paths it finds only in HEAD.
 * A file that was `git rm --cached` but is still on disk — migration 0008 does exactly that to
 * runtime-state files that hooks keep rewriting — is silently re-added, and the removal is lost.
 * A removal whose file is also gone from disk is safe in pathspec mode, so it is not counted.
 *
 * → null when there is nothing to handle (the common case costs one `git diff --cached`), else
 *   { removals: [repo paths], skipAdd: Set<file args naming a removal>, specs: [repo paths] }.
 * An unborn branch or any git error also returns null: there is no HEAD to remove from.
 */
function stagedRemovalsOnDisk(cwd, files) {
  const del = execGit(cwd, ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D', '-z', '--', ...files]);
  if (del.exitCode !== 0) return null;
  const deleted = del.stdout.split('\0').filter(Boolean);
  if (deleted.length === 0) return null;

  const top = execGit(cwd, ['rev-parse', '--show-toplevel']);
  if (top.exitCode !== 0 || !top.stdout) return null;
  const prefixRes = execGit(cwd, ['rev-parse', '--show-prefix']);
  const prefix = prefixRes.exitCode === 0 ? prefixRes.stdout : '';

  const removals = deleted.filter((p) => fs.existsSync(path.join(top.stdout, p)));
  if (removals.length === 0) return null;

  const removalSet = new Set(removals);
  const skipAdd = new Set(files.filter((f) => removalSet.has(repoPathOf(prefix, f))));
  return { removals, skipAdd, specs: files.map((f) => repoPathOf(prefix, f)) };
}

/** True when a --files argument names `.planning` or something under it (quick-24). */
function isPlanningPath(cwd, p) {
  const rel = path.relative(cwd, path.resolve(cwd, String(p))).split(path.sep).join('/');
  return rel === '.planning' || rel.startsWith('.planning/');
}

/** Run git with stdin; never throws. */
function gitInput(cwd, args, input) {
  const r = spawnSync('git', args, { cwd, input, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  return { status: r.status, stdout: r.stdout || '', error: r.error };
}

/** True when the cwd-relative posix `entry` is `rel` or lies under it. */
function coversPath(rel, entry) {
  return rel === '' || entry === rel || entry.startsWith(rel + '/');
}

/**
 * ignoredPaths(cwd, paths) -> Set of the `paths` arguments (verbatim) that `git add` would refuse as ignored
 * (TRD 48-10, D-20). Store mode ignores `.planning/*` except config.json and STACK.md (U-1), so the whole-dir
 * probe no longer answers for a single path. TRD 43-03 (D7): it now answers for every requested path, and for the
 * whole-dir question too (`ignoredPaths(cwd, ['.planning'])`), so cmdCommit no longer calls helpers.isGitIgnored.
 *
 * One `git check-ignore --no-index --stdin -z -v -n` call: verbose + non-matching give one record per input, in
 * input order, so a path is matched back by position (no reliance on how git echoes it), and a path matched only
 * by a negation (`!.planning/config.json`) counts as NOT ignored.
 *
 * A path git already knows about (in the index, or in HEAD — e.g. a staged `rm --cached` removal) is never
 * reported: `git add` stages a tracked file regardless of ignore rules, and a staged removal must reach the commit
 * (TRD 44-06, migrations 0008 and 0010). So the set holds exactly the paths whose pathspec commit git would reject
 * today ("did not match any file(s) known to git"). Any git failure → empty set (today's behaviour).
 */
function ignoredPaths(cwd, paths) {
  if (!paths.length) return new Set();
  const probe = gitInput(cwd, ['check-ignore', '--no-index', '--stdin', '-z', '-v', '-n'], paths.map((p) => `${p}\0`).join(''));
  if (probe.error || (probe.status !== 0 && probe.status !== 1)) return new Set();
  const fields = probe.stdout.split('\0');
  const candidates = [];
  paths.forEach((p, i) => {
    const source = fields[i * 4];
    const pattern = fields[i * 4 + 2] || '';
    if (source && !pattern.startsWith('!')) candidates.push(p);
  });
  if (!candidates.length) return new Set();

  const relOf = (p) => {
    const rel = path.relative(cwd, path.resolve(cwd, String(p))).split(path.sep).join('/');
    return rel === '.' ? '' : rel;
  };
  const known = [];
  const index = gitInput(cwd, ['ls-files', '-z', '--', ...candidates], '');
  if (index.status === 0) known.push(...index.stdout.split('\0').filter(Boolean));
  const tree = gitInput(cwd, ['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', ...candidates], '');
  if (tree.status === 0) known.push(...tree.stdout.split('\0').filter(Boolean));
  return new Set(candidates.filter((p) => {
    const rel = relOf(p);
    return !known.some((entry) => coversPath(rel, entry));
  }));
}

function cmdCommit(cwd, message, files, raw, amend) {
  if (!message && !amend) {
    error('commit message required');
  }

  const config = loadConfig(cwd);

  const requested = files && files.length > 0 ? files : ['.planning/'];

  // Gates cover planning docs only; code passed via --files still commits (quick-24).
  // Order matters: commit_docs first, and only then the gitignore probe. The filter runs
  // BEFORE the TRD 44-06 removal detection below, so it and the foreign-index check see only
  // the filtered list — a staged planning path then counts as foreign and is never swept in.
  //
  // TRD 48-10 (D-20): the gitignore probe is two-stage. `.planning` wholly ignored → today's
  // whole-dir drop, unchanged. Otherwise each requested planning path is probed on its own
  // (store mode ignores `.planning/*` except config.json and STACK.md): an ignored path git
  // knows nothing about is dropped into skipped_planning; config.json, STACK.md, tracked files,
  // staged removals and code still commit. With no ignore rule under `.planning/` (local mode)
  // nothing is dropped and the result is exactly today's.
  //
  // TRD 43-03 (D7): the per-path probe covers EVERY requested path, not just planning ones. A code
  // path the repo ignores and git knows nothing about (`build/out.txt`) used to reach `git add`
  // (refused) and then the pathspec commit ("did not match any file(s) known to git"), which
  // failed the whole commit as `commit_failed` and took the tracked files named beside it down too.
  // It now goes to `skipped_ignored` (planning paths keep `skipped_planning`), and the whole-dir
  // question is asked of `ignoredPaths` too, so it is index- AND HEAD-aware like every per-path
  // answer: a tracked file, or a staged removal still in HEAD, keeps `.planning` from reading as
  // "wholly ignored". Both skipped lists appear in the result only when non-empty.
  const blocked = !config.commit_docs ? 'skipped_commit_docs_false'
    : ignoredPaths(cwd, ['.planning']).has('.planning') ? 'skipped_gitignored' : null;
  let filesToStage = requested;
  let skippedPlanning = [];
  let skippedIgnored = [];
  let dropReason = blocked;
  if (blocked) {
    skippedPlanning = requested.filter((f) => isPlanningPath(cwd, f));
    filesToStage = requested.filter((f) => !isPlanningPath(cwd, f));
  }
  const ignored = ignoredPaths(cwd, filesToStage);
  if (ignored.size) {
    for (const f of filesToStage) {
      if (!ignored.has(f)) continue;
      (isPlanningPath(cwd, f) ? skippedPlanning : skippedIgnored).push(f);
    }
    filesToStage = filesToStage.filter((f) => !ignored.has(f));
    dropReason = dropReason || 'skipped_gitignored';
  }
  if (dropReason && filesToStage.length === 0) {
    const result = { committed: false, hash: null, reason: dropReason };
    output(result, raw, 'skipped');
    return;
  }
  const skippedField = {
    ...(skippedPlanning.length ? { skipped_planning: skippedPlanning } : {}),
    ...(skippedIgnored.length ? { skipped_ignored: skippedIgnored } : {}),
  };

  // TRD 50-06 (GEN-01): in store mode a commit lands only on an objective's linked branch (or on a `df/exec-*` worktree
  // of it), never on the default branch or an unlinked one. The decision is gh-gate.cjs's (50-02, offline); it runs here —
  // after the planning filter, so a commit that is wholly skipped stays `skipped` with exit 0, and BEFORE the `git add`
  // loop below, so a refusal never touches the index. A merge or rebase in progress skips it: the `merge_in_progress`
  // refusal and the raw-commit completion path own that case, and a rebase leaves HEAD detached. Amend is gated like any
  // commit. DEVFLOW_SKIP_GH_GATE=1 lets the refused commit land; the override is logged once it has (see below), in the
  // MAIN checkout's `.planning/`. Local mode never loads gh-gate.cjs, so its result keys and message bytes are unchanged.
  const planningMode = require('./planning-mode.cjs');
  const storeMode = planningMode.isStoreMode(cwd);
  let gateObjective;
  let gateEscape = null;
  if (storeMode && !mergeOrRebaseInProgress(cwd)) {
    const ghGate = require('./gh-gate.cjs');
    const inputs = ghGate.readGateInputs(cwd);
    const verdict = ghGate.evaluateGate({ ...inputs, env: process.env });
    if (!verdict.allow) {
      const result = { committed: false, hash: null, reason: verdict.reason, branch: inputs.branch, error: verdict.message };
      // TRD 52-02: raw mode prints only the reason code, which would drop both remedies; the message goes to stderr.
      if (raw) process.stderr.write(`${verdict.message}\n`);
      output(result, raw, verdict.reason, 1);
      return;
    }
    if (verdict.escaped) gateEscape = { verdict, branch: inputs.branch, env: ghGate.ESCAPE_ENV };
    else gateObjective = verdict.objective;
  }

  // TRD 44-06: staged removals whose working copy survives cannot go through the pathspec commit
  // below (it would re-add them from disk). Detect them first; `git add` must skip them too, or
  // an un-ignored one would be re-staged here instead. null → the ordinary path, unchanged.
  const removal = amend ? null : stagedRemovalsOnDisk(cwd, filesToStage);
  for (const file of filesToStage) {
    if (removal && removal.skipAdd.has(file)) continue;
    execGit(cwd, ['add', file]);
  }

  // Commit — always limited to the pathspecs that were just staged, so
  // concurrently staged changes from other executors (or a file some unrelated
  // tool left dirty) are not swept in. The git add loop above already ensures
  // brand-new files are tracked first.
  //
  // Issue #87 part 3: with no --files the fallback used to stage `.planning/`
  // and then run a bare `git commit -m`, which commits the WHOLE index. The
  // command is named for planning docs, so the default now commits exactly
  // `.planning/` and nothing else. Passing --files stays the recommended form.
  //
  // Do NOT add pathspecs to the amend branch — --amend --no-edit -- <paths> changes amend semantics.
  //
  // TRD 44-06: with a staged removal still on disk, the commit uses the WHOLE index and no
  // pathspec — git's `--only` pathspec mode re-stages listed paths from the working tree, which
  // would re-track the removed file. That is only safe when the index holds nothing outside
  // --files, so the foreign-index check below refuses otherwise (never sweep in other work).
  //
  // TRD 49-07 (GPR-02): in store mode a scoped commit names the issue it serves — `feat(49-02): x` gets a final
  // `Refs #<TRD issue>` paragraph, `docs(49): x` the objective's. The issue comes from the mapping in the MAIN checkout
  // (a worktree executor's own `.planning/` holds none). It never blocks: no scope, an unknown id or no mapping leaves
  // the message untouched and the result carries `refs: null` with a reason. `--amend` keeps its message, so it is
  // never touched. Local mode takes neither branch — the message bytes and result keys are exactly as before, and the
  // trailer module (and so the mapping) is never even loaded.
  //
  // TRD 50-06: on a linked branch a message with no usable scope (`wip: notes`) references the linked objective's issue
  // (the gate's `objective`), so every commit there carries a `Refs #`. A scoped message keeps the resolution above.
  let commitMessage = message;
  let refsField = {};
  if (!amend && storeMode) {
    const { refsFor, applyRefs } = require('./commit-trailer.cjs');
    const refs = refsFor(planningMode.resolveMainRoot(cwd) || cwd, message, { objective: gateObjective });
    commitMessage = applyRefs(message, refs.issue);
    refsField = refs.issue === null ? { refs: null, refs_reason: refs.reason } : { refs: refs.issue };
  }

  let commitArgs;
  if (amend) {
    commitArgs = ['commit', '--amend', '--no-edit'];
  } else if (removal) {
    commitArgs = ['commit', '-m', commitMessage];
  } else {
    commitArgs = ['commit', '-m', commitMessage, '--', ...filesToStage];
  }
  // Issue #100 finding 5: a merge in progress makes the pathspec form above a
  // PARTIAL COMMIT, which git refuses outright. That refusal used to surface as
  // `nothing_to_commit` with exit 0 — the one wording that makes a human stop
  // looking — so the merge resolution was silently never committed. Detect it
  // BEFORE the attempt so the message can name the cause and the remedy.
  if (!amend && mergeInProgress(cwd)) {
    const result = {
      committed: false,
      hash: null,
      reason: 'merge_in_progress',
      staged: filesToStage,
      error:
        'A merge is in progress (MERGE_HEAD exists), and git refuses a partial ' +
        '(pathspec-scoped) commit during a merge. Your changes ARE staged — ' +
        'nothing was lost. Finish the merge with the whole index:\n' +
        '  DEVFLOW_ALLOW_RAW_COMMIT=1 git commit --no-edit\n' +
        'or, to abandon it: git merge --abort',
    };
    output(result, raw, 'merge_in_progress', 1);
    return;
  }

  if (removal) {
    const stagedRes = execGit(cwd, ['diff', '--cached', '--name-only', '--no-renames', '-z']);
    const staged = stagedRes.stdout.split('\0').filter(Boolean);
    const covered = (p) => removal.specs.some((s) => s === '' || p === s || p.startsWith(s + '/'));
    const foreign = stagedRes.exitCode === 0 ? staged.filter((p) => !covered(p)) : ['(git diff --cached failed)'];
    if (foreign.length) {
      const result = {
        committed: false,
        hash: null,
        reason: 'staged_removal_with_foreign_index',
        staged,
        foreign,
        removals: removal.removals,
        error:
          `Recording the staged removal of ${removal.removals.join(', ')} needs a whole-index ` +
          'commit (a pathspec commit re-adds a removed file from the working tree), but the ' +
          `index also holds staged changes outside --files: ${foreign.join(', ')}. Nothing was ` +
          'committed and nothing was unstaged. Commit or unstage those paths ' +
          '(git restore --staged <path>), then retry.',
      };
      output(result, raw, 'staged_removal_with_foreign_index', 1);
      return;
    }
  }

  const commitResult = execGit(cwd, commitArgs);
  if (commitResult.exitCode !== 0) {
    const said = commitResult.stdout + '\n' + commitResult.stderr;
    if (said.includes('nothing to commit')) {
      // The benign case, and the ONLY one that keeps exit 0: there was simply
      // nothing staged under the pathspecs.
      const result = { committed: false, hash: null, reason: 'nothing_to_commit', ...skippedField };
      output(result, raw, 'nothing');
      return;
    }
    // Anything else is a real failure. Reporting it as `nothing_to_commit`
    // with exit 0 was how a refused commit read as a no-op (issue #100).
    const result = {
      committed: false,
      hash: null,
      reason: 'commit_failed',
      staged: filesToStage,
      error: commitResult.stderr || commitResult.stdout,
    };
    output(result, raw, 'commit_failed', 1);
    return;
  }

  // Get short hash
  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
  // TRD 50-06: an escaped commit is logged only once it has landed — an override that overrode nothing (nothing to commit,
  // a git failure) is not a signal worth keeping. The entry goes to the MAIN checkout's `.planning/` (a worktree's own is
  // not where `df-tools override --list` reads). A log failure never undoes the commit: it is reported, not thrown.
  let gateField = {};
  if (gateEscape) {
    const { verdict, branch, env } = gateEscape;
    const reason = process.env.DEVFLOW_SKIP_GH_GATE_REASON ||
      `env ${env}=1 (${verdict.reason} on ${branch || 'a detached HEAD'})`;
    const mainRoot = planningMode.resolveMainRoot(cwd) || cwd;
    let logged;
    try {
      logged = require('./override.cjs').recordOverride({ planningDir: path.join(mainRoot, '.planning'), gate: 'gh', reason });
    } catch (e) {
      logged = { ok: false, message: e.message };
    }
    gateField = logged.ok ? { gate_escaped: true } : { gate_escaped: true, gate_log_error: logged.message || logged.reason_code || 'override log failed' };
  }
  const result = { committed: true, hash, reason: 'committed', ...skippedField, ...refsField, ...gateField };
  output(result, raw, hash || 'committed');
}

function cmdTodoComplete(cwd, filename, raw) {
  if (!filename) {
    error('filename required for todo complete');
  }

  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  const completedDir = path.join(cwd, '.planning', 'todos', 'completed');
  const sourcePath = path.join(pendingDir, filename);

  if (!fs.existsSync(sourcePath)) {
    error(`Todo not found: ${filename}`);
  }

  // Ensure completed directory exists
  fs.mkdirSync(completedDir, { recursive: true });

  // Read, add completion timestamp, move
  let content = fs.readFileSync(sourcePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  content = `completed: ${today}\n` + content;

  fs.writeFileSync(path.join(completedDir, filename), content, 'utf-8');
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

function cmdScaffold(cwd, type, options, raw) {
  const { objective, name } = options;
  const padded = objective ? normalizeObjectiveName(objective) : '00';
  const today = new Date().toISOString().split('T')[0];

  // Find objective directory
  const objectiveInfo = objective ? findObjectiveInternal(cwd, objective) : null;
  const objectiveDir = objectiveInfo ? path.join(cwd, objectiveInfo.directory) : null;

  if (objective && !objectiveDir && type !== 'objective-dir') {
    error(`Objective ${objective} directory not found`);
  }

  let filePath, content;

  switch (type) {
    case 'context': {
      filePath = path.join(objectiveDir, `${padded}-CONTEXT.md`);
      content = `---\nobjective: "${padded}"\nname: "${name || objectiveInfo?.objective_name || 'Unnamed'}"\ncreated: ${today}\n---\n\n# Objective ${objective}: ${name || objectiveInfo?.objective_name || 'Unnamed'} — Context\n\n## Decisions\n\n_Decisions will be captured during /devflow:discuss-objective ${objective}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
      break;
    }
    case 'uat': {
      filePath = path.join(objectiveDir, `${padded}-UAT.md`);
      content = `---\nobjective: "${padded}"\nname: "${name || objectiveInfo?.objective_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Objective ${objective}: ${name || objectiveInfo?.objective_name || 'Unnamed'} — User Acceptance Testing\n\n## Test Results\n\n| # | Test | Status | Notes |\n|---|------|--------|-------|\n\n## Summary\n\n_Pending UAT_\n`;
      break;
    }
    case 'verification': {
      filePath = path.join(objectiveDir, `${padded}-VERIFICATION.md`);
      content = `---\nobjective: "${padded}"\nname: "${name || objectiveInfo?.objective_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Objective ${objective}: ${name || objectiveInfo?.objective_name || 'Unnamed'} — Verification\n\n## Goal-Backward Verification\n\n**Objective Goal:** [From ROADMAP.md]\n\n## Checks\n\n| # | Requirement | Status | Evidence |\n|---|------------|--------|----------|\n\n## Result\n\n_Pending verification_\n`;
      break;
    }
    case 'objective-dir': {
      if (!objective || !name) {
        error('objective and name required for objective-dir scaffold');
      }
      const slug = generateSlugInternal(name);
      const dirName = `${padded}-${slug}`;
      const phasesParent = path.join(cwd, '.planning', 'objectives');
      fs.mkdirSync(phasesParent, { recursive: true });
      const dirPath = path.join(phasesParent, dirName);
      fs.mkdirSync(dirPath, { recursive: true });
      output({ created: true, directory: `.planning/objectives/${dirName}`, path: dirPath }, raw, dirPath);
      return;
    }
    default:
      error(`Unknown scaffold type: ${type}. Available: context, uat, verification, objective-dir`);
  }

  if (fs.existsSync(filePath)) {
    output({ created: false, reason: 'already_exists', path: filePath }, raw, 'exists');
    return;
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  const relPath = path.relative(cwd, filePath);
  output({ created: true, path: relPath }, raw, relPath);
}

/**
 * Store mode `requirements mark-complete`: publish the edited REQUIREMENTS.md through `doc put` (cache write, ledger,
 * wiki-push of its page, flush). Output is today's plus the verb result under `verb`; the exit code is the verb's
 * (3 when the wiki-push is still pending, e.g. offline).
 */
function publishRequirements(root, text, { updated, notFound, reqIds }, raw) {
  const r = require('./planning-verbs.cjs').docPut(root, {
    rel: 'REQUIREMENTS.md',
    text,
    message: `requirements: mark ${updated.join(', ')} complete`,
  });
  const verb = { ok: r.ok === true, mode: r.mode, rel: r.rel, exit: r.exit, flush: r.flush ? r.flush.status : null, warnings: r.warnings || [] };
  if (r.error) verb.error = r.error;
  if (r.prose) verb.prose = r.prose;
  output({
    updated: true,
    marked_complete: updated,
    not_found: notFound,
    total: reqIds.length,
    verb,
  }, raw, `${updated.length}/${reqIds.length} requirements marked complete`, r.exit);
}

function cmdRequirementsMarkComplete(cwd, reqIdsRaw, raw) {
  if (!reqIdsRaw || reqIdsRaw.length === 0) {
    error('requirement IDs required. Usage: requirements mark-complete REQ-01,REQ-02 or REQ-01 REQ-02');
  }

  // Accept comma-separated, space-separated, or bracket-wrapped: [REQ-01, REQ-02]
  const reqIds = reqIdsRaw
    .join(' ')
    .replace(/[\[\]]/g, '')
    .split(/[,\s]+/)
    .map(r => r.trim())
    .filter(Boolean);

  if (reqIds.length === 0) {
    error('no valid requirement IDs found');
  }

  // Store mode (TRD 48-14, D-19): REQUIREMENTS.md is a GitHub-backed cache file (a wiki page). Read the MAIN
  // checkout's copy (D-14), make today's edit in memory, and publish it with `doc put` instead of writing it directly.
  const storeMode = require('./planning-mode.cjs').isStoreMode(cwd);
  if (storeMode) cwd = require('./planning-mode.cjs').resolveMainRoot(cwd);

  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  if (!fs.existsSync(reqPath)) {
    output({ updated: false, reason: 'REQUIREMENTS.md not found', ids: reqIds }, raw, 'no requirements file');
    return;
  }

  let reqContent = fs.readFileSync(reqPath, 'utf-8');
  const updated = [];
  const notFound = [];

  for (const reqId of reqIds) {
    let found = false;

    // Update checkbox: - [ ] **REQ-ID** → - [x] **REQ-ID**
    const idSrc = escapeRegExp(reqId); // the id is CLI input: compile it literally (`.` is not a wildcard, `(` is not a group)
    const checkboxPattern = new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${idSrc}\\*\\*)`, 'gi');
    if (checkboxPattern.test(reqContent)) {
      reqContent = reqContent.replace(checkboxPattern, '$1x$2');
      found = true;
    }

    // Update traceability table: | REQ-ID | Objective N | Pending | → | REQ-ID | Objective N | Complete |
    const tablePattern = new RegExp(`(\\|\\s*${idSrc}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi');
    if (tablePattern.test(reqContent)) {
      // Re-read since test() advances lastIndex for global regex
      reqContent = reqContent.replace(
        new RegExp(`(\\|\\s*${idSrc}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi'),
        '$1 Complete $2'
      );
      found = true;
    }

    if (found) {
      updated.push(reqId);
    } else {
      notFound.push(reqId);
    }
  }

  if (updated.length > 0 && storeMode) return publishRequirements(cwd, reqContent, { updated, notFound, reqIds }, raw);

  if (updated.length > 0) {
    fs.writeFileSync(reqPath, reqContent, 'utf-8');
  }

  output({
    updated: updated.length > 0,
    marked_complete: updated,
    not_found: notFound,
    total: reqIds.length,
  }, raw, `${updated.length}/${reqIds.length} requirements marked complete`);
}

module.exports = {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdVerifyPathExists,
  cmdHistoryDigest,
  cmdObjectiveJobIndex,
  cmdSummaryExtract,
  cmdWebsearch,
  cmdCommit,
  cmdTodoComplete,
  cmdScaffold,
  cmdRequirementsMarkComplete,
};
