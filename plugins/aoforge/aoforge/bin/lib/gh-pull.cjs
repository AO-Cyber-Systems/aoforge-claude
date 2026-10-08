'use strict';

// gh-pull.cjs (TRD 21-01) — `aof-tools gh pull <objective>` inbound bidirectional sync.
//
// Reads GitHub issue state for a tracked objective, detects drift versus disk
// frontmatter, and (with --apply) writes changed fields back to OBJECTIVE.md.
//
// v1.2 scope: drift DETECTION only. Full conflict resolution lives in TRD 21-03.
//
// Tracked fields (sync-eligible):
//   state      → status   (OPEN→don't overwrite; CLOSED→done)
//   labels     → labels   (string[])
//   assignees  → assignees (login[])
//   milestone  → milestone (title|null)
//
// Authoritative-from-disk fields (NOT pulled): kind, work, parent_issue,
//   org_initiative, org_project, goal, requirements, success_criteria.
//
// TRD 46-06 — one objective id end to end:
//   - `pull 2`, `pull 02-a` and `pull 002` resolve (gh-mapping.resolveObjective) to the same id + directory,
//     so they find the same v3 mapping entry and the same sync-state baseline that push recorded.
//   - `github.enabled` gates the command (zero gh calls when off); the repo comes from gh-client.resolveRepo
//     (config `github.repo`, then PROJECT.md `github_repo`).
//   - gh is reached only through gh-client; frontmatter is written through setFrontmatterField, which keeps
//     comments and key order. The mapping is read-only here (a v1/v2 file converts in memory).

const fs = require('fs');
const path = require('path');
const { extractFrontmatter, setFrontmatterField } = require('./frontmatter.cjs');
const { recordSync, hashFrontmatter, getLastSync } = require('./sync-state.cjs');
const ghClient = require('./gh-client.cjs');
const { resolveObjective, readMappingV3WithReport, getEntry } = require('./gh-mapping.cjs');
const conflictMod = require('./conflict.cjs');

// Local emitter — bypasses helpers.output() because that helper always exits 0
// and inverts raw semantics (raw=true→prose). cmdGhPull contract: raw=true→JSON,
// raw=false→prose, exit code per outcome.
function _emit(payload, prose, raw, exitCode) {
  if (raw) {
    process.stdout.write(JSON.stringify(payload, null, 2));
  } else {
    process.stdout.write(prose);
  }
  if (exitCode !== 0) process.exit(exitCode);
}

// ─── Test injection seam ─────────────────────────────────────────────────────

// gh-pull owns no spawn site: the seam IS gh-client's. `_setRunGh(fn)` installs `fn` there (null restores the
// default), so a fake reaches `ghRead` here and, through the auth bridge in cmdGhPull, lib/gh.cjs too.
function _setRunGh(fn) { ghClient._setRunGh(fn); }

// Tracked fields — v1.2 scope only
const TRACKED_FIELDS = ['status', 'labels', 'assignees', 'milestone'];

// ─── fetchGhIssue ────────────────────────────────────────────────────────────

/**
 * fetchGhIssue(issueRef) — returns parsed issue JSON or null if not found.
 * issueRef shape: 'owner/repo#NN'
 *
 * Returns:
 *   { state, labels: [{name,color}], assignees: [{login}], milestone: {title}|null, updatedAt }
 *   null                       — issue does not exist on GH
 *   { error, _ok: false }      — gh failed for other reason (rate limit, bad JSON, etc.)
 */
function fetchGhIssue(issueRef) {
  const m = issueRef && issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return null;
  const [, owner, repo, num] = m;

  const r = ghClient.ghRead(['issue', 'view', String(num), '--repo', `${owner}/${repo}`, '--json', 'state,labels,assignees,milestone,updatedAt']);

  if (!r.ok) {
    if (/Could not resolve to an Issue/i.test(r.stderr)) return null;
    return { error: r.stderr || 'gh issue view failed', _ok: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (_) {
    return { error: 'invalid JSON from gh', _ok: false };
  }
  return parsed;
}

// ─── normalizeGhIssue ────────────────────────────────────────────────────────

/**
 * Normalize gh issue JSON to a flat dict matching disk frontmatter shape.
 * gh:   { state: "OPEN", labels: [{name,color}], assignees: [{login}], milestone: {title}|null, updatedAt }
 * disk: { status, labels: string[], assignees: string[], milestone: string|null, updatedAt }
 *
 * Mapping:
 *   state OPEN  → 'open'
 *   state CLOSED → 'done'
 *
 * (Mapping rationale: in_progress is NOT a GH-trackable signal — GH only knows OPEN/CLOSED.
 *  When GH says OPEN, callers can decide whether to keep disk's 'in_progress' or downgrade
 *  to 'open'. detectDrift compares normalized values, so a disk 'in_progress' vs GH 'open'
 *  WILL drift. Callers handle this via the apply layer.)
 */
function normalizeGhIssue(ghIssue) {
  return {
    status: ghIssue.state === 'CLOSED' ? 'done' : 'open',
    labels: (ghIssue.labels || []).map((l) => l.name),
    assignees: (ghIssue.assignees || []).map((a) => a.login),
    milestone: ghIssue.milestone ? ghIssue.milestone.title : null,
    updatedAt: ghIssue.updatedAt,
  };
}

// ─── detectDrift ─────────────────────────────────────────────────────────────

/**
 * Pure-logic drift detection. No IO.
 *
 * Inputs:
 *   disk_fm         — disk frontmatter dict { status, labels, assignees, milestone, ... }
 *   gh_state        — gh issue JSON (raw, before normalization)
 *   last_sync_state — null OR { etag, gh_updated_at, label_set, last_synced_at, last_synced_disk_hash }
 *
 * Returns:
 *   { drift: bool, fields: { field: { disk, gh } }, first_sync: bool, conflict_suspected: bool }
 *
 * Logic:
 *   - last_sync_state is null → first-time pull, treat as drift (any GH state is "new")
 *   - GH updatedAt unchanged from last_sync.gh_updated_at → no drift
 *   - GH changed → diff each tracked field; report fields that differ between disk and GH
 *
 * conflict_suspected stays FALSE in 21-01. TRD 21-03 implements 3-way diff for full conflict logic.
 */
function detectDrift({ disk_fm, gh_state, last_sync_state }) {
  const ghNorm = normalizeGhIssue(gh_state);

  // First-time pull: no baseline
  if (!last_sync_state) {
    const fields = {};
    for (const f of TRACKED_FIELDS) {
      const diskVal = disk_fm[f];
      const ghVal = ghNorm[f];
      if (!shallowEqual(diskVal, ghVal)) {
        fields[f] = { disk: diskVal, gh: ghVal };
      }
    }
    return { drift: true, first_sync: true, fields, conflict_suspected: false };
  }

  // GH unchanged → no drift
  if (gh_state.updatedAt === last_sync_state.gh_updated_at) {
    return { drift: false, first_sync: false, fields: {}, conflict_suspected: false };
  }

  // GH changed; diff each field
  const fields = {};
  for (const f of TRACKED_FIELDS) {
    const diskVal = disk_fm[f];
    const ghVal = ghNorm[f];
    if (!shallowEqual(diskVal, ghVal)) {
      fields[f] = { disk: diskVal, gh: ghVal };
    }
  }

  return {
    drift: Object.keys(fields).length > 0,
    first_sync: false,
    fields,
    conflict_suspected: false, // TRD 21-03 layers full conflict logic
  };
}

/**
 * Shallow equality for primitives + arrays-of-primitives. Null-safe.
 */
function shallowEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((x, i) => x === sb[i]);
  }
  return false;
}

// ─── applyDrift ──────────────────────────────────────────────────────────────

/**
 * applyDrift({ projectRoot, objectiveId, drift, ghIssue, hasLastSync })
 *
 * Writes drifted fields into OBJECTIVE.md frontmatter. Refuses if conflict_suspected
 * or if there's no last_sync baseline and not a first-time sync.
 * `objectiveId` here is the objective DIRECTORY name (it builds the file path).
 *
 * Returns { ok, applied?, error? }
 *
 * Each field goes through frontmatter.setFrontmatterField: the `<field>: ...` line is replaced in place (a new
 * field is appended), and every other byte, including `# OPTIONAL` comments and key order, is untouched.
 */
function applyDrift({ projectRoot, objectiveId, drift, ghIssue, hasLastSync = true }) {
  if (drift.conflict_suspected) {
    return {
      ok: false,
      error: 'Conflict suspected — both sides changed. Re-run with --resolve=disk|gh|merge (see TRD 21-03).',
    };
  }
  if (!hasLastSync && !drift.first_sync) {
    return {
      ok: false,
      error: 'No prior sync state. Run `aof-tools gh sync <objective>` first to establish baseline.',
    };
  }

  const objPath = path.join(projectRoot, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    return { ok: false, error: `OBJECTIVE.md not found: ${objPath}` };
  }

  const ghNorm = normalizeGhIssue(ghIssue);
  const applied = {};

  for (const field of Object.keys(drift.fields)) {
    const ghVal = ghNorm[field];
    const r = setFrontmatterField(objPath, field, serializeYamlValue(ghVal));
    if (!r.ok) return { ok: false, error: r.error };
    // No frontmatter block: the setter leaves the file alone and warns. Nothing has been written yet.
    if (r.warning) return { ok: false, error: 'OBJECTIVE.md missing frontmatter block' };
    applied[field] = ghVal;
  }

  return { ok: true, applied };
}

function serializeYamlValue(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
  if (typeof v === 'string') return v;
  return String(v);
}

// ─── cmdGhPullAll (TRD 47-10) ────────────────────────────────────────────────

function pullAllProse(r) {
  const lines = [`Pulled from GitHub: ${r.written.length} written, ${r.skipped.length} unchanged.`];
  if (r.written.length > 0) lines.push(`Written: ${r.written.join(', ')}`);
  if (r.attention.length > 0) {
    lines.push('Needs a look:');
    for (const a of r.attention) lines.push(`  - ${a}`);
  }
  for (const n of r.notes) lines.push(`Note: ${n}`);
  for (const e of r.errors) lines.push(`Error: ${e}`);
  return lines.join('\n') + '\n';
}

/**
 * `gh pull --all [--force]` — exit 0 when the cache matches GitHub, 1 on error, 2 when it was rebuilt but a
 * human should look (locally modified or hand-kept files left alone, orphans, pages skipped, rejected items).
 * github.enabled gates it: zero gh calls when it is off.
 */
function cmdGhPullAll(cwd, args, raw) {
  const gate = ghClient.requireEnabled(cwd);
  if (gate.skipped) {
    _emit({ ok: false, skipped: true, reason: gate.reason }, gate.reason + '\n', raw, 0);
    return;
  }
  const result = require('./gh-cache.cjs').pullAll(cwd, { force: args.includes('--force') });
  if (!result.ok) {
    const msg = result.error || 'gh pull --all failed';
    _emit(result, msg + '\n', raw, result.skipped ? 0 : 1);
    return;
  }
  _emit(result, pullAllProse(result), raw, result.attention.length > 0 || result.errors.length > 0 ? 2 : 0);
}

// ─── cmdGhPull (CLI orchestrator) ────────────────────────────────────────────

/**
 * cmdGhPull(cwd, args, raw) — CLI entry point.
 * Usage: aof-tools gh pull <objective> [--apply] [--resolve=disk|gh|merge] [--resolved] | --all [--force]
 *
 * `--all` (TRD 47-10) rebuilds the whole `.planning/` cache from GitHub (gh-cache.pullAll); the
 * per-objective drift pull below is unchanged.
 */
function cmdGhPull(cwd, args, raw) {
  const objectiveArg = args.find((a) => !a.startsWith('--'));
  const apply = args.includes('--apply');

  // TRD 21-03: --resolve flag handling
  const resolveFlag = args.find((a) => a.startsWith('--resolve='));
  const resolveValue = resolveFlag ? resolveFlag.split('=')[1] : null;
  const resolvedFlag = args.includes('--resolved');

  if (resolveValue && !['disk', 'gh', 'merge'].includes(resolveValue)) {
    const msg = `Invalid --resolve value: ${resolveValue}. Use disk, gh, or merge.`;
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }
  // Reject `--resolve disk` (space-separated, no '=')
  if (args.some((a) => a === '--resolve')) {
    const msg = 'Use --resolve=disk (with equals sign), not --resolve disk.';
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }

  if (args.includes('--all')) {
    cmdGhPullAll(cwd, args, raw);
    return;
  }

  if (!objectiveArg) {
    process.stderr.write('Usage: aof-tools gh pull <objective> [--apply] [--resolve=disk|gh|merge] [--resolved] | --all [--force]\n');
    process.exit(1);
    return;
  }

  // TRD 46-06: github.enabled gates the whole command. Zero gh calls when it is off (not even auth).
  const gate = ghClient.requireEnabled(cwd);
  if (gate.skipped) {
    _emit({ ok: false, skipped: true, reason: gate.reason }, gate.reason + '\n', raw, 0);
    return;
  }

  // Any spelling ("2", "02-a", "002") -> one id (mapping + sync-state key) and one directory (file paths).
  const objective = resolveObjective(cwd, objectiveArg);
  if (!objective || !objective.dir) {
    const msg = `objective not found: ${objectiveArg}`
      + (objective ? ' (it is in the ROADMAP but has no directory under .planning/objectives/)' : '');
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }

  // gh.cjs requireGhAuth runs on the gh-client seam (TRD 46-07), so no bridge is needed.
  const { requireGhAuth } = require('./gh.cjs');
  try {
    requireGhAuth(['repo']);
  } catch (e) {
    if (e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({
        error: e.message,
        remediation: e.remediation,
        scopes_missing: e.scopes_missing,
      }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    throw e;
  }

  // Mapping v3, read-only: a v1/v2 file converts in memory and is never written back from here.
  const report = readMappingV3WithReport(cwd);
  if (report.error) {
    _emit({ ok: false, error: report.error }, report.error + '\n', raw, 1);
    return;
  }
  const entry = getEntry(report.mapping, objective.id);
  if (!entry || !entry.issue_id) {
    const msg = report.conflicts && report.conflicts[objective.id]
      ? `Objective ${objective.id} maps to conflicting GitHub issues in .planning/.gh-mapping.json; resolve that before pulling.`
      : `Objective ${objective.id} has no GitHub issue. Run \`aof-tools gh sync ${objective.id}\` first to create one before pulling.`;
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }

  // Issue ref: <repo>#<issue_id>, repo from config github.repo then PROJECT.md github_repo (requireEnabled)
  const issueRef = `${gate.repo}#${entry.issue_id}`;

  const ghIssue = fetchGhIssue(issueRef);
  if (ghIssue === null) {
    const msg = `Issue ${issueRef} not found on GitHub`;
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }
  if (ghIssue && ghIssue._ok === false) {
    _emit({ ok: false, error: ghIssue.error }, ghIssue.error + '\n', raw, 1);
    return;
  }

  // Read disk frontmatter
  const objPath = path.join(cwd, '.planning', 'objectives', objective.dir, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    const msg = `OBJECTIVE.md not found: ${objPath}`;
    _emit({ ok: false, error: msg }, msg + '\n', raw, 1);
    return;
  }
  const disk_fm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};

  // Read last sync state via sync-state.cjs (TRD 21-02)
  const last_sync_state = getLastSync(cwd, objective.id);

  // ── TRD 21-03: --resolve=merge --resolved continuation path ──
  // When user is completing a previously-surfaced conflict via merge, dispatch BEFORE
  // the conflict detector runs (their edits may have removed the conflict; we still
  // honor their resolution intent based on pending_resolution.disk_hash_at_conflict).
  if (resolveValue === 'merge' && resolvedFlag && last_sync_state && last_sync_state.pending_resolution) {
    const r = conflictMod.resolveMerge({ cwd, objectiveId: objective.dir, currentDiskFm: disk_fm });
    if (!r.ok) { _emit({ ok: false, error: r.error }, r.error + '\n', raw, 1); return; }
    _emit(
      { ok: true, action: 'merged', resolution: 'merge', message: r.message },
      r.message + '\n',
      raw,
      0
    );
    return;
  }

  // ── TRD 21-03: conflict detection runs BEFORE drift logic ──
  if (last_sync_state) {
    const currentDiskHash = hashFrontmatter(disk_fm);
    const diskChangedSinceLastSync = currentDiskHash !== last_sync_state.last_synced_disk_hash;
    const ghChangedSinceLastSync = ghIssue.updatedAt !== last_sync_state.gh_updated_at;

    if (diskChangedSinceLastSync && ghChangedSinceLastSync) {
      const ghNorm = normalizeGhIssue(ghIssue);
      const conflict = conflictMod.detectConflict({
        disk_fm,
        gh_norm: ghNorm,
        last_sync: last_sync_state,
      });

      if (conflict.conflict) {
        // Real per-field conflict on at least one field. Dispatch on --resolve flag.

        if (resolveValue === 'disk') {
          const r = conflictMod.resolveDisk({ cwd, objectiveId: objective.dir, issueRef, ghIssue, currentDiskFm: disk_fm });
          if (!r.ok) { _emit({ ok: false, error: r.error }, r.error + '\n', raw, 1); return; }
          _emit({ ok: true, action: 'pushed', resolution: 'disk' }, 'Pushed disk state to GitHub.\n', raw, 0);
          return;
        }
        if (resolveValue === 'gh') {
          const r = conflictMod.resolveGh({ cwd, objectiveId: objective.dir, issueRef, ghIssue, currentDiskFm: disk_fm });
          if (!r.ok) { _emit({ ok: false, error: r.error }, r.error + '\n', raw, 1); return; }
          _emit({ ok: true, action: 'pulled', resolution: 'gh', applied: r.applied }, 'Applied GitHub state to disk.\n', raw, 0);
          return;
        }
        if (resolveValue === 'merge' && resolvedFlag) {
          const r = conflictMod.resolveMerge({ cwd, objectiveId: objective.dir, currentDiskFm: disk_fm });
          if (!r.ok) { _emit({ ok: false, error: r.error }, r.error + '\n', raw, 1); return; }
          _emit(
            { ok: true, action: 'merged', resolution: 'merge', message: r.message },
            r.message + '\n',
            raw,
            0
          );
          return;
        }

        // No --resolve flag (or --resolve=merge without --resolved):
        // record pending_resolution with the conflict-time disk hash, then surface diff + exit 1.
        recordSync(cwd, objective.id, {
          ...last_sync_state,
          pending_resolution: {
            disk_hash_at_conflict: currentDiskHash,
            surfaced_at: new Date().toISOString(),
          },
        });

        const diffStr = conflictMod.formatThreeWayDiff({
          objectiveId: objective.dir,
          issueRef,
          conflicting_fields: conflict.conflicting_fields,
        });
        const isMergePending = (resolveValue === 'merge' && !resolvedFlag);
        const proseTail = isMergePending
          ? '\n\nNext: edit OBJECTIVE.md to merge changes, then re-run with --resolve=merge --resolved.\n'
          : '\n';
        process.stderr.write(diffStr + proseTail);
        _emit(
          {
            ok: false,
            conflict: true,
            conflicting_fields: conflict.conflicting_fields,
            non_conflicting_fields: conflict.non_conflicting_fields,
            hint: isMergePending
              ? 'Edit OBJECTIVE.md, then re-run with --resolve=merge --resolved.'
              : 'Re-run with --resolve=disk|gh|merge to resolve.',
          },
          '',
          raw,
          1,
        );
        return;
      }
    }
  }

  const drift = detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });

  if (!drift.drift) {
    _emit(
      { ok: true, drift: false, message: 'No drift; planning state matches GitHub.' },
      'No drift; planning state matches GitHub.\n',
      raw,
      0
    );
    return;
  }

  if (apply) {
    if (drift.conflict_suspected) {
      const msg = 'Both sides changed. Re-run with --resolve=disk|gh|merge (TRD 21-03).';
      _emit(
        { ok: false, drift: true, conflict_suspected: true, fields: drift.fields, hint: msg },
        msg + '\n',
        raw,
        1
      );
      return;
    }
    const applyResult = applyDrift({
      projectRoot: cwd,
      objectiveId: objective.dir,
      drift,
      ghIssue,
      hasLastSync: last_sync_state != null,
    });
    if (!applyResult.ok) {
      _emit({ ok: false, error: applyResult.error }, applyResult.error + '\n', raw, 1);
      return;
    }

    // After successful disk write, record the new sync state (TRD 21-02 wiring).
    // Hash MUST be computed AFTER applyDrift so disk_fm reflects the post-write state.
    const ghNorm = normalizeGhIssue(ghIssue);
    const updatedDiskFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
    recordSync(cwd, objective.id, {
      issue_ref: issueRef,
      etag: null,
      gh_updated_at: ghIssue.updatedAt,
      label_set: ghNorm.labels,
      assignees: ghNorm.assignees,
      milestone: ghNorm.milestone,
      status: ghNorm.status,
      last_synced_at: new Date().toISOString(),
      last_synced_disk_hash: hashFrontmatter(updatedDiskFm),
    });

    _emit(
      { ok: true, drift: true, applied: applyResult.applied },
      `Applied ${Object.keys(applyResult.applied).length} field changes to OBJECTIVE.md.\n`,
      raw,
      0
    );
    return;
  }

  // Report-only mode
  _emit(
    {
      ok: true,
      drift: true,
      fields: drift.fields,
      first_sync: drift.first_sync,
      hint: 'Re-run with --apply to write changes.',
    },
    formatDriftPretty(drift),
    raw,
    0
  );
}

function formatDriftPretty(drift) {
  const lines = [];
  if (drift.first_sync) lines.push('First-time pull (no prior sync state):');
  else lines.push('Drift detected:');
  for (const [field, vals] of Object.entries(drift.fields)) {
    lines.push(`  ${field}:`);
    lines.push(`    disk: ${JSON.stringify(vals.disk)}`);
    lines.push(`    gh:   ${JSON.stringify(vals.gh)}`);
  }
  lines.push('');
  lines.push('Re-run with --apply to write changes to OBJECTIVE.md.');
  return lines.join('\n');
}

module.exports = {
  fetchGhIssue,
  detectDrift,
  applyDrift,
  cmdGhPull,
  normalizeGhIssue,
  shallowEqual,
  _setRunGh,
  TRACKED_FIELDS,
};
