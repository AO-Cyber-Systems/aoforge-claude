'use strict';

// Migration 0002 — job-to-trd (TRD 36-04a).
//
// Renames every legacy plan file `.aoforge/objectives/<dir>/*-JOB.md` (and a bare `JOB.md`) to
// its `-TRD.md` / `TRD.md` name, then appends one dated line under STATE.md's `## Session Log`.
//
// A JOB whose TRD counterpart already exists is a conflict: it is never renamed (that would
// overwrite the TRD) and never deleted, and detect ignores it, so the migration stays idempotent.
//
// This is the only copy of the rename logic: `validate health` W008 detection calls
// findLegacyJobFiles and its `--repair` calls apply.
//
// Deliberate change from the old health repair: it also forced STATE.md `Status: Resumed`. A
// session-start auto-migration must not rewrite the user's status, so this only logs the rename.

const fs = require('fs');
const path = require('path');
const { planningRel } = require('../compat.cjs');

// under the project's resolved planning directory (`.aoforge/`, or a legacy one)
const objectivesRel = (root) => planningRel(root, 'objectives');
const stateRel = (root) => planningRel(root, 'STATE.md');
const SESSION_LOG_RE = /^##\s+Session Log[^\n]*$/m;

function isLegacyJobName(name) {
  return name.endsWith('-JOB.md') || name === 'JOB.md';
}

function toTrdName(name) {
  return name === 'JOB.md' ? 'TRD.md' : name.replace(/-JOB\.md$/, '-TRD.md');
}

function abs(projectRoot, rel) {
  return path.join(projectRoot, ...rel.split('/'));
}

/**
 * findLegacyJobFiles(projectRoot) -> [{ from, to, conflict }]
 *
 * Every `*-JOB.md` / `JOB.md` directly inside an objective directory, sorted. `from` and `to` are
 * project-relative posix paths; `conflict` is true when `to` already exists.
 */
function findLegacyJobFiles(projectRoot) {
  const OBJECTIVES_REL = objectivesRel(projectRoot);
  const objectivesDir = abs(projectRoot, OBJECTIVES_REL);
  const found = [];
  let entries;
  try {
    entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
  } catch {
    return found;
  }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const dir of dirs) {
    let files;
    try {
      files = fs.readdirSync(path.join(objectivesDir, dir)).sort();
    } catch {
      continue;
    }
    for (const name of files) {
      if (!isLegacyJobName(name)) continue;
      const trdName = toTrdName(name);
      found.push({
        from: `${OBJECTIVES_REL}/${dir}/${name}`,
        to: `${OBJECTIVES_REL}/${dir}/${trdName}`,
        conflict: fs.existsSync(path.join(objectivesDir, dir, trdName)),
      });
    }
  }
  return found;
}

function conflictNote(conflicts) {
  if (!conflicts.length) return '';
  return `; left alone because the TRD already exists: ${conflicts.map((c) => c.from).join(', ')}`;
}

function detect(ctx) {
  const all = findLegacyJobFiles(ctx.projectRoot);
  const pending = all.filter((f) => !f.conflict);
  const conflicts = all.filter((f) => f.conflict);
  if (pending.length) {
    return {
      applies: true,
      reason: `${pending.length} legacy JOB.md file(s) to rename to TRD.md${conflictNote(conflicts)}`,
    };
  }
  if (conflicts.length) {
    return { applies: false, reason: `no renamable JOB.md files${conflictNote(conflicts)}` };
  }
  return { applies: false, reason: `no legacy JOB.md files under ${objectivesRel(ctx.projectRoot)}/` };
}

// -> the new STATE.md content, or null when there is no `## Session Log` section.
function withSessionLogLine(content, line) {
  const match = SESSION_LOG_RE.exec(content);
  if (!match) return null;
  const headingEnd = match.index + match[0].length;
  if (headingEnd >= content.length) return `${content}\n${line}\n`;
  // Insert directly after the heading line (the old repair's placement).
  return content.slice(0, headingEnd + 1) + line + '\n' + content.slice(headingEnd + 1);
}

function apply(ctx) {
  const root = ctx.projectRoot;
  const migrated = [];
  const changed = [];
  const skipped = [];

  for (const f of findLegacyJobFiles(root)) {
    // Re-check immediately before the rename: renameSync would silently replace an existing TRD.
    if (f.conflict || fs.existsSync(abs(root, f.to))) {
      skipped.push(f.from);
      continue;
    }
    if (!ctx.dryRun) fs.renameSync(abs(root, f.from), abs(root, f.to));
    migrated.push({ from: f.from, to: f.to });
    changed.push(f.from, f.to);
  }

  const STATE_REL = stateRel(root);
  const statePath = abs(root, STATE_REL);
  if (migrated.length && fs.existsSync(statePath)) {
    const today = new Date().toISOString().split('T')[0];
    const line = `- ${today}: Migrated ${migrated.length} JOB.md file(s) to TRD.md (AOForge upgrade, migration 0002)`;
    const next = withSessionLogLine(fs.readFileSync(statePath, 'utf-8'), line);
    if (next !== null) {
      if (!ctx.dryRun) fs.writeFileSync(statePath, next, 'utf-8');
      changed.push(STATE_REL);
    }
  }

  return { changed, notes: { migrated, skipped_conflicts: skipped } };
}

module.exports = {
  id: '0002',
  title: 'Rename legacy JOB.md plan files to TRD.md',
  since: '2.11.0',
  safety: 'auto',
  detect,
  apply,
  findLegacyJobFiles,
};
