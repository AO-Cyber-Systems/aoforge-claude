'use strict';

/**
 * micro.cjs — aof-tools micro CLI subcommand
 *
 * Implements the `aof-tools micro start|commit|abort` surface for atomic
 * micro-task tracking. Wraps the skill-active marker lifecycle and drives
 * a single git commit per micro task with a `chore(micro): {description}`
 * message. In local mode the STATE.md "Quick Tasks Completed" table is updated
 * on each commit; with `github.store` on, STATE.md is a generated view and is
 * left untouched (52-03). Every commit goes through `aof-tools commit` (53-03), so in
 * store mode it is refused off an objective's linked branch with the normal gate
 * message, and the logged AOFORGE_SKIP_GH_GATE=1 escape works as it does there.
 *
 * CLI surface:
 *   aof-tools micro start <description>           write .aoforge/.skill-active, allocate task slot
 *   aof-tools micro commit [--files <path>...]    atomic commit + STATE.md row (local mode only) + remove marker
 *   aof-tools micro abort                         remove marker without committing (idempotent)
 *
 * Imports marker logic from skill-active.cjs — does NOT duplicate it.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output, error, generateSlugInternal } = require('./helpers.cjs');
const { findPlanningDir, startSkill, endSkill, statusSkill, markerPath } = require('./skill-active.cjs');
const { planningDirLabel } = require('./compat.cjs');

// ─── fs injection (for testability) ──────────────────────────────────────────

const realFs = {
  existsSync: (...a) => fs.existsSync(...a),
  mkdirSync: (...a) => fs.mkdirSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  unlinkSync: (...a) => fs.unlinkSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
  readdirSync: (...a) => fs.readdirSync(...a),
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── Internal: quick task numbering ──────────────────────────────────────────

/**
 * Compute the next sequential number for a quick task slot.
 * Mirrors the pattern used in `cmdInitQuick` (init.cjs:362-371).
 *
 * @param {string} planningDir - absolute path to .aoforge/
 * @returns {number}
 */
function _nextQuickNum(planningDir) {
  const quickDir = path.join(planningDir, 'quick');
  let nextNum = 1;
  try {
    const existing = fs.readdirSync(quickDir)
      .filter(f => /^\d+-/.test(f))
      .map(f => parseInt(f.split('-')[0], 10))
      .filter(n => !isNaN(n));
    if (existing.length > 0) nextNum = Math.max(...existing) + 1;
  } catch {
    // quick/ dir doesn't exist yet — start at 1
  }
  return nextNum;
}

// ─── Internal: STATE.md quick task row append ─────────────────────────────────

/**
 * Parse the Quick Tasks Completed table header to detect column count.
 * Returns 5 (no Status column) or 6 (Status column present).
 *
 * @param {string} headerLine
 * @returns {5|6}
 */
function _detectColumnCount(headerLine) {
  // Count pipe separators to determine column count
  const cols = headerLine.split('|').filter(s => s.trim().length > 0);
  return cols.some(c => c.trim().toLowerCase() === 'status') ? 6 : 5;
}

/**
 * Append a row to the "Quick Tasks Completed" section of STATE.md.
 * Matches existing column shape (5 or 6 columns). Creates section if absent.
 *
 * 5-col shape: | # | Description | Date | Commit | Directory |
 * 6-col shape: | # | Description | Date | Commit | Directory | Status |
 *
 * @param {string} stateMdPath - absolute path to STATE.md
 * @param {{ num: number, description: string, date: string, commitHash: string, directory: string }} row
 */
function _appendQuickTaskRow(stateMdPath, row) {
  const content = fs.readFileSync(stateMdPath, 'utf8');
  const SECTION_HEADER = '## Quick Tasks Completed';
  const TABLE_HEADER_5 = '| # | Description | Date | Commit | Directory |';
  const TABLE_SEP_5 = '|---|---|---|---|---|';
  const TABLE_HEADER_6 = '| # | Description | Date | Commit | Directory | Status |';
  const TABLE_SEP_6 = '|---|---|---|---|---|---|';

  const sectionIdx = content.indexOf(SECTION_HEADER);
  const dateStr = row.date ? row.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
  const hash = row.commitHash || '';
  const dir = row.directory || '.';

  if (sectionIdx === -1) {
    // Section absent — create it in 5-col shape
    const newSection = [
      '',
      SECTION_HEADER,
      '',
      TABLE_HEADER_5,
      TABLE_SEP_5,
      `| ${row.num} | ${row.description} | ${dateStr} | ${hash} | ${dir} |`,
      '',
    ].join('\n');
    fs.writeFileSync(stateMdPath, content.trimEnd() + '\n' + newSection, 'utf8');
    return;
  }

  // Section exists — find the header line to detect column count
  const afterSection = content.substring(sectionIdx);
  const lines = afterSection.split('\n');

  let colCount = 5;
  for (const line of lines) {
    if (line.startsWith('|') && !line.match(/^\|[-\s|]+\|$/)) {
      // This is a data row or header row (not a separator)
      colCount = _detectColumnCount(line);
      break;
    }
  }

  // Find insertion point — end of the section (before next ##, or end of file)
  const insertionPattern = /\n(?=##\s|\z)/;
  const sectionMatch = content.indexOf('\n## ', sectionIdx + SECTION_HEADER.length);
  const insertAt = sectionMatch === -1 ? content.length : sectionMatch;

  let newRow;
  if (colCount === 6) {
    newRow = `| ${row.num} | ${row.description} | ${dateStr} | ${hash} | ${dir} | Atomic |`;
  } else {
    newRow = `| ${row.num} | ${row.description} | ${dateStr} | ${hash} | ${dir} |`;
  }

  const before = content.substring(0, insertAt).trimEnd();
  const after = content.substring(insertAt);
  fs.writeFileSync(stateMdPath, before + '\n' + newRow + '\n' + after, 'utf8');
}

// ─── Internal: default commit runner (aof-tools commit) ───────────────────────

// micro commits THROUGH `aof-tools commit` (53-03), never with a raw `git commit`. cmdCommit owns the store-mode GEN-01 branch
// gate, its logged AOFORGE_SKIP_GH_GATE escape and the `Refs #` trailer, so micro reuses it instead of forking any of them.
// It is spawned rather than called in-process because cmdCommit reports through output(), which ends the process. A child
// process is not seen by the gate-commits hook (hooks only see Claude's own Bash calls), so it needs no escape variable.
const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

// The refusal codes gh-gate.cjs emits (its `refuse(...)` calls). Only these become `gate-refused`; every other failed
// commit stays `commit-failed`. micro.test.cjs G-5 fails if gh-gate.cjs gains a code that is missing here.
const GATE_REASONS = new Set(['detached_head', 'default_branch', 'unlinked_branch']);

const NOTHING_STAGED_MSG =
  'nothing staged and no tracked file is modified. Untracked files are never ' +
  'swept in — name new files explicitly: aof-tools micro commit --files <path>...';

/**
 * The NUL-separated paths `git diff <args>` prints, relative to `cwd` (`--relative`, so a project that lives in a
 * subdirectory of its repository still hands `aof-tools commit` paths it can resolve). `--no-renames` lists a rename as the
 * deletion plus the addition so both halves are committed.
 *
 * @returns {{ paths: string[], error: string|null }}
 */
function _diffPaths(cwd, args) {
  const r = spawnSync('git', ['diff', ...args, '--name-only', '--no-renames', '--relative', '-z'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    return { paths: [], error: (r.stderr || '').trim() || `git diff exited ${r.status}` };
  }
  return { paths: (r.stdout || '').split('\0').filter(Boolean), error: null };
}

/**
 * The paths a micro commit covers when the caller named none: what is staged, else the tracked modifications. Untracked files
 * are never included — the old `git add .` fallback swept a user's unrelated drafts into a micro commit and onto a pushed
 * branch. aof-tools commit with no `--files` commits `.aoforge/` only, so micro resolves the list itself.
 *
 * @returns {{ paths: string[], error: string|null }}
 */
function _implicitFiles(cwd) {
  const staged = _diffPaths(cwd, ['--cached']);
  if (staged.error || staged.paths.length > 0) return staged;
  return _diffPaths(cwd, []);
}

/**
 * Default runner: commits exactly `opts.files` (or the implicit list) with `aof-tools commit <message> --files ...`. The commit
 * is always pathspec-limited, so any other change the user has staged stays staged and out of it (#120).
 *
 * Maps aof-tools commit's JSON result onto the runner contract `{ exitCode, stdout, stderr }`, plus `reason` and `json`:
 *   committed: true            -> exitCode 0, stdout = the short hash
 *   committed: false + error   -> exitCode 1, stderr = the message verbatim (a gate refusal names both remedies), reason
 *   committed: false, no error -> exitCode 1 (skipped_* / nothing_to_commit: nothing landed, so micro must not report success)
 *
 * @param {string} cwd
 * @param {{ message: string, files: string[]|null }} opts
 * @returns {{ exitCode: number, stdout: string, stderr: string, reason?: string, json?: object }}
 */
function _dfToolsCommitRunner(cwd, opts) {
  let files = opts.files && opts.files.length > 0 ? opts.files : null;
  if (!files) {
    const implicit = _implicitFiles(cwd);
    if (implicit.error) return { exitCode: 1, stdout: '', stderr: implicit.error };
    if (implicit.paths.length === 0) return { exitCode: 1, stdout: '', stderr: NOTHING_STAGED_MSG };
    files = implicit.paths;
  }

  const r = spawnSync(process.execPath, [DF_TOOLS, 'commit', opts.message, '--files', ...files], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  let json = null;
  try { json = JSON.parse((r.stdout || '').trim()); } catch { /* not JSON: report the raw streams below */ }

  if (json && json.committed === true) {
    return { exitCode: 0, stdout: json.hash || '', stderr: '', json };
  }
  if (json && json.committed === false) {
    const stderr = json.error || `aof-tools commit did not commit (${json.reason})`;
    return { exitCode: 1, stdout: '', stderr, reason: json.reason, json };
  }
  const said = (r.stderr || r.stdout || (r.error && r.error.message) || '').trim();
  return { exitCode: r.status || 1, stdout: '', stderr: said };
}

// ─── startMicro ──────────────────────────────────────────────────────────────

/**
 * Allocates a new micro task slot and writes the .skill-active marker.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .aoforge/
 * @param {string} opts.description - user-supplied task description
 * @param {number} opts.pid - PID (aof-tools subprocess PID)
 * @param {string} opts.now - ISO8601 timestamp
 * @returns {{ ok: boolean, next_num?: number, slug?: string, task_dir?: string, marker?: object, reason?: string, message?: string }}
 */
function startMicro({ planningDir, description, pid, now }) {
  if (!planningDir) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: `No ${planningDirLabel()} directory found in cwd or ancestors`,
    };
  }

  if (!description || typeof description !== 'string' || !description.trim()) {
    return {
      ok: false,
      reason: 'missing-description',
      message: 'micro start requires a <description> argument',
    };
  }

  const trimmedDesc = description.trim();
  const slug = generateSlugInternal(trimmedDesc)?.substring(0, 40) || 'task';
  const nextNum = _nextQuickNum(planningDir);
  const taskDir = path.join(path.basename(planningDir), 'quick', `${nextNum}-${slug}`);

  // F2: physically create the placeholder dir BEFORE writing the marker.
  // This prevents counter collisions with `aof-tools init quick` which scans the
  // same dir for `^\d+-` entries. Order matters: mkdir before startSkill so a
  // mkdir failure doesn't leave a stranded marker.
  const absTaskDir = path.join(planningDir, 'quick', `${nextNum}-${slug}`);
  try {
    fs.mkdirSync(absTaskDir, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      reason: 'mkdir-failed',
      message: `Failed to create placeholder dir: ${e.message}`,
    };
  }

  // Write the skill-active marker (last-write-wins: startSkill overwrites)
  const skillResult = startSkill({ planningDir, skillName: 'micro', pid, now });
  if (!skillResult.ok) {
    return skillResult;
  }

  // Persist description to .micro-description so `cmdMicro commit` can retrieve it
  // (the skill-active marker format does not include a description field)
  try {
    fs.writeFileSync(path.join(planningDir, '.micro-description'), trimmedDesc, 'utf8');
  } catch {
    // Non-fatal — description file write failure; CLI commit path will need --description
  }

  return {
    ok: true,
    next_num: nextNum,
    slug,
    task_dir: taskDir,
    marker: skillResult.marker,
  };
}

// ─── commitMicro ─────────────────────────────────────────────────────────────

/**
 * Produces an atomic git commit with message `chore(micro): {description}`,
 * appends a row to STATE.md "Quick Tasks Completed" (local mode only), and
 * removes the marker. Marker is NOT removed if the commit fails — caller can retry.
 * The default runner commits through `aof-tools commit` (53-03). A store-mode gate refusal
 * returns `{ ok: false, reason: 'gate-refused', gate_reason, message }` with the gate's
 * message verbatim (it names `aof-tools gh pr start` and AOFORGE_SKIP_GH_GATE=1).
 * In store mode (planning-mode.isStoreMode) STATE.md is not required, not
 * written and not committed: the result carries `state_commit_hash: null` and
 * `state_row: 'skipped_store_mode'` (52-03).
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .aoforge/
 * @param {string} opts.description - task description (used in commit message)
 * @param {string[]|null} opts.files - files to stage and commit (pathspec-limited; unrelated staged changes stay staged); null = what is already staged, else tracked modifications; never untracked files
 * @param {string} opts.now - ISO8601 timestamp (for STATE.md date)
 * @param {Function|null} opts.gitRunner - injection for tests, `(cwd, {message, files}) => {exitCode, stdout, stderr, reason?}`; null = the aof-tools commit runner
 * @returns {{ ok: boolean, commit_hash?: string, state_commit_hash?: string|null, state_row?: 'skipped_store_mode', removed_marker?: boolean, reason?: string, gate_reason?: string, message?: string, stderr?: string }}
 */
function commitMicro({ planningDir, description, files, now, gitRunner }) {
  if (!planningDir) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: `No ${planningDirLabel()} directory found in cwd or ancestors`,
    };
  }

  // Check that an active micro marker exists
  const status = statusSkill({ planningDir });
  if (!status.active || !status.marker || status.marker.skill !== 'micro') {
    return {
      ok: false,
      reason: 'no-active-micro',
      message: 'No active micro task found. Run `aof-tools micro start <description>` first.',
    };
  }

  // Derive description from argument, falling back to marker (for CLI path where
  // cmdMicro reads it from the marker)
  const commitDesc = (description && description.trim()) ? description.trim() : (status.marker.description || 'micro task');

  // Derive project root from planningDir (parent of .aoforge/)
  const projectRoot = path.dirname(planningDir);

  // 52-03: in store mode STATE.md is a generated view (`aof-tools gh pull --all`
  // rebuilds it), so micro neither requires it nor appends its row there. Same rule
  // as workflows/quick.md Step 7. isStoreMode resolves the main checkout itself.
  const store = require('./planning-mode.cjs').isStoreMode(projectRoot);

  // Check STATE.md exists (do NOT auto-create) — local mode only
  const stateMdPath = path.join(planningDir, 'STATE.md');
  if (!store && !fs.existsSync(stateMdPath)) {
    return {
      ok: false,
      reason: 'no-state-file',
      message: 'STATE.md not found. Project may not be fully initialized.',
    };
  }

  // Commit via runner
  const message = `chore(micro): ${commitDesc}`;
  const runner = gitRunner || ((cwd, opts) => _dfToolsCommitRunner(cwd, opts));

  const commitResult = runner(projectRoot, { message, files });

  if (commitResult.exitCode !== 0) {
    // 53-03: a store-mode refusal from `aof-tools commit` (the GEN-01 branch gate) is not a git failure. Return the gate's
    // message verbatim, since it names the remedies (`aof-tools gh pr start`, the logged AOFORGE_SKIP_GH_GATE=1 escape), and
    // keep the marker like every failed commit so the user can switch branch and rerun `micro commit`.
    if (GATE_REASONS.has(commitResult.reason)) {
      return {
        ok: false,
        reason: 'gate-refused',
        gate_reason: commitResult.reason,
        message: commitResult.stderr,
        removed_marker: false,
      };
    }
    return {
      ok: false,
      reason: 'commit-failed',
      message: `git commit failed: ${commitResult.stderr}`,
      stderr: commitResult.stderr,
      removed_marker: false,
    };
  }

  // Get short hash after successful commit
  let commitHash = null;
  const hashResult = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (hashResult.status === 0) {
    commitHash = hashResult.stdout.trim();
  }

  // When the runner is a mock (test injection), it may return a hash directly
  if (!commitHash && commitResult.stdout) {
    commitHash = commitResult.stdout.trim().substring(0, 7);
  }

  // 52-03: store mode makes exactly one commit (the source change) and leaves
  // STATE.md byte-identical. Marker and description cleanup still always happen.
  if (store) {
    endSkill({ planningDir });
    try { fs.unlinkSync(path.join(planningDir, '.micro-description')); } catch { /* absent */ }
    return {
      ok: true,
      commit_hash: commitHash,
      state_commit_hash: null,
      state_row: 'skipped_store_mode',
      removed_marker: true,
    };
  }

  // Determine row num for STATE.md.
  // F2 changed the contract: startMicro now creates the placeholder dir, so
  // _nextQuickNum() at commit time would return one HIGHER than the slot
  // actually allocated. Resolve to the slot we actually used by scanning for a
  // dir matching the current slug; fall back to _nextQuickNum if not found.
  const commitSlug = generateSlugInternal(commitDesc)?.substring(0, 40) || 'task';
  let rowNum = null;
  try {
    const quickDir = path.join(planningDir, 'quick');
    const matches = fs.readdirSync(quickDir).filter(d => d.endsWith(`-${commitSlug}`));
    if (matches.length > 0) {
      // Pick the highest-numbered match (the one this micro created)
      const sorted = matches.sort(
        (a, b) => parseInt(b.split('-')[0], 10) - parseInt(a.split('-')[0], 10)
      );
      const n = parseInt(sorted[0].split('-')[0], 10);
      if (!isNaN(n)) rowNum = n;
    }
  } catch {
    // Fall through to fallback
  }
  if (rowNum === null) {
    rowNum = _nextQuickNum(planningDir);
  }

  // Append STATE.md row (records SOURCE commit hash, not STATE.md commit hash)
  let stateRowAppended = false;
  try {
    _appendQuickTaskRow(stateMdPath, {
      num: rowNum,
      description: commitDesc,
      date: now || new Date().toISOString(),
      commitHash: commitHash || '',
      directory: path.basename(projectRoot),
    });
    stateRowAppended = true;
  } catch (e) {
    // Non-fatal: STATE.md write failed but commit succeeded
    // Fall through — still remove marker and return ok with state_commit_hash:null
  }

  // Remove the marker BEFORE the STATE.md commit so the second commit picks up
  // the marker deletion alongside the STATE.md row. This keeps the working tree
  // clean post-commit (no `D .aoforge/.skill-active` lingering) and matches the
  // /aoforge:quick 2-commit pattern: source → state-and-cleanup.
  // STATE.md commit failure is recoverable; marker cleanup is the user-meaningful
  // unit and must always happen.
  endSkill({ planningDir });
  // The description scratch file is micro's own state, not project content. It is
  // never staged (untracked files are never swept in), so remove it here rather
  // than leave it in the tree for the CLI wrapper alone to clean.
  try { fs.unlinkSync(path.join(planningDir, '.micro-description')); } catch { /* absent */ }

  // F1: second atomic commit for STATE.md (and any pending marker deletion).
  // Mirrors /aoforge:quick's 2-commit pattern. Only attempt if the row was
  // successfully appended — otherwise nothing to commit.
  //
  // Also stage `<planning dir>/.skill-active` IF it is already tracked in the
  // repository. After endSkill, the marker is deleted on disk; if it was tracked,
  // this shows as `D` in the working tree and must be captured in commit 2 to
  // keep the tree clean. If the marker was never tracked, list nothing for it —
  // `git add` on an untracked, now-deleted path errors with "did not match".
  const planningRel = path.basename(planningDir); // `.aoforge`, or a legacy planning directory
  const stateFiles = [`${planningRel}/STATE.md`];
  const lsResult = spawnSync('git', ['ls-files', '--error-unmatch', `${planningRel}/.skill-active`], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (lsResult.status === 0) {
    stateFiles.push(`${planningRel}/.skill-active`);
  }

  let stateCommitHash = null;
  if (stateRowAppended) {
    try {
      const stateCommitResult = runner(projectRoot, {
        message: `chore(micro): record STATE.md row for ${commitDesc}`,
        files: stateFiles,
      });
      if (stateCommitResult.exitCode === 0) {
        const h = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
          cwd: projectRoot,
          encoding: 'utf8',
        });
        if (h.status === 0) {
          stateCommitHash = h.stdout.trim();
        }
        // When the runner is a mock, it may return the hash directly
        if (!stateCommitHash && stateCommitResult.stdout) {
          stateCommitHash = stateCommitResult.stdout.trim().substring(0, 7);
        }
      } else {
        process.stderr.write(
          `[micro] warning: STATE.md commit failed (${stateCommitResult.stderr || 'unknown'}); STATE.md left dirty in working tree\n`
        );
      }
    } catch (e) {
      process.stderr.write(
        `[micro] warning: STATE.md commit threw (${e.message}); STATE.md left dirty\n`
      );
    }
  }

  return {
    ok: true,
    commit_hash: commitHash,
    state_commit_hash: stateCommitHash,
    removed_marker: true,
  };
}

// ─── abortMicro ──────────────────────────────────────────────────────────────

/**
 * Removes the skill-active marker without committing. Idempotent.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .aoforge/
 * @returns {{ ok: boolean, removed?: boolean, reason?: string, message?: string }}
 */
function abortMicro({ planningDir }) {
  if (!planningDir) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: `No ${planningDirLabel()} directory found in cwd or ancestors`,
    };
  }

  // F2: remove placeholder dir created by startMicro (idempotent — swallow ENOENT).
  // Order: dir-removal first (pure fs op), then endSkill (existing contract).
  // If dir removal fails, still call endSkill — leaving the dir behind is recoverable,
  // leaving the marker is not.
  try {
    const descFile = path.join(planningDir, '.micro-description');
    if (fs.existsSync(descFile)) {
      const desc = fs.readFileSync(descFile, 'utf8').trim();
      const slug = generateSlugInternal(desc)?.substring(0, 40) || 'task';
      const quickDir = path.join(planningDir, 'quick');
      if (fs.existsSync(quickDir)) {
        const matches = fs.readdirSync(quickDir).filter(d => d.endsWith(`-${slug}`));
        // Pick the highest-N match (the one this micro just created)
        const target = matches
          .sort((a, b) => parseInt(b.split('-')[0], 10) - parseInt(a.split('-')[0], 10))[0];
        if (target) {
          fs.rmSync(path.join(quickDir, target), { recursive: true, force: true });
        }
      }
    }
  } catch {
    // Idempotent — ignore. Marker cleanup is the only required side-effect.
  }

  const result = endSkill({ planningDir });
  return result;
}

// ─── cmdMicro ─────────────────────────────────────────────────────────────────

/**
 * CLI entry point for `aof-tools micro`.
 *
 * @param {string} cwd - current working directory (for findPlanningDir)
 * @param {string[]} args - args after the 'micro' keyword
 * @param {boolean} raw - --raw flag (true = JSON-only output)
 */
function cmdMicro(cwd, args, raw) {
  const planningDir = findPlanningDir(cwd);
  const op = args[0];

  if (op === 'start') {
    const description = args.slice(1).join(' ').trim();
    const result = startMicro({
      planningDir,
      description,
      pid: process.pid,
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      error(result.message || result.reason);
      return;
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  if (op === 'commit') {
    // Parse --files flag
    const filesIndex = args.indexOf('--files');
    const files = filesIndex !== -1
      ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--'))
      : null;

    // Read description from active marker (set during `start`)
    const status = statusSkill({ planningDir });
    const description = (status.active && status.marker && status.marker.description)
      ? status.marker.description
      : null;

    // If marker has a description field, use it; otherwise description stays null
    // and commitMicro will derive from the marker.skill context
    // NOTE: The marker format from startSkill is {skill, started_at, pid} — no description field.
    // We need to store the description when starting. For now, cmdMicro passes the description
    // via a workaround: re-read from a task-description file if present, or require --description.
    // Simpler approach: store description in marker (extend startSkill payload via micro.cjs).
    // Since we can't modify skill-active.cjs (READ-ONLY), we store description separately.
    const descFile = planningDir ? path.join(planningDir, '.micro-description') : null;
    let commitDescription = null;
    if (descFile && fs.existsSync(descFile)) {
      commitDescription = fs.readFileSync(descFile, 'utf8').trim();
    }
    if (!commitDescription) {
      error('No micro description found. Was `aof-tools micro start <description>` run?');
      return;
    }

    const result = commitMicro({
      planningDir,
      description: commitDescription,
      files: files && files.length > 0 ? files : null,
      now: new Date().toISOString(),
      gitRunner: null,
    });
    if (!result.ok) {
      // 53-03: a gate refusal is machine-readable, like `aof-tools commit`'s own: the JSON result on stdout (exit 1) and the
      // message, which names both remedies, on stderr. The marker and description file are kept so the user can rerun.
      if (result.reason === 'gate-refused') {
        process.stderr.write(`${result.message}\n`);
        output(result, raw, JSON.stringify(result), 1);
        return;
      }
      error(result.message || result.reason);
      return;
    }
    // Clean up description file on success
    if (descFile && fs.existsSync(descFile)) {
      try { fs.unlinkSync(descFile); } catch {}
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  if (op === 'abort') {
    // Clean up description file too
    if (planningDir) {
      const descFile = path.join(planningDir, '.micro-description');
      if (fs.existsSync(descFile)) {
        try { fs.unlinkSync(descFile); } catch {}
      }
    }
    const result = abortMicro({ planningDir });
    if (!result.ok) {
      error(result.message || result.reason);
      return;
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  error(`Unknown micro subcommand: "${op}". Available: start <description>, commit [--files <path>...], abort`);
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  cmdMicro,
  startMicro,
  commitMicro,
  abortMicro,
  _setRunFs,
  _resetMocks,
  _GATE_REASONS: GATE_REASONS,
};
