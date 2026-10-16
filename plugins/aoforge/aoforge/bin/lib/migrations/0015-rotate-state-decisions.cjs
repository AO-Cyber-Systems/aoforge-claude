'use strict';

// Migration 0015 — rotate STATE.md's decision log into the archive (context budget).
//
// templates/state.md has always said STATE.md "is a DIGEST, not an archive" and that decisions live in
// STATE_ARCHIVE.md, but nothing moved them: a project's `## Recent Decisions` grew one entry per TRD until the file
// ran to tens of kilobytes, and every skill that inlines STATE.md paid for all of it on entry. This auto migration
// keeps the newest DEFAULT_KEEP entries in STATE.md and appends the older ones to STATE_ARCHIVE.md `## Decisions`,
// oldest first, each as it stood (date and rationale travel with it). From then on `state advance-job` rotates on
// every advance and `validate health` reports W068 when the log is over the limit again.
//
//   detect   applies when STATE.md exists, the project is not in store mode (STATE.md is a generated view there) and
//            the section holds more than DEFAULT_KEEP entries
//   apply    one rotation; idempotent (a second run finds nothing to move). Dry run writes nothing.

const fs = require('fs');
const path = require('path');

const { planningRoot, planningRel } = require('../compat.cjs');
const stateDigest = require('../state-digest.cjs');

function statePath(root) {
  return path.join(planningRoot(root), 'STATE.md');
}

function isStore(root) {
  try { return require('../planning-mode.cjs').isStoreMode(root); } catch { return false; }
}

function detect(ctx) {
  const file = statePath(ctx.projectRoot);
  const rel = planningRel(ctx.projectRoot, 'STATE.md');
  if (!fs.existsSync(file)) return { applies: false, reason: `no ${rel}` };
  if (isStore(ctx.projectRoot)) return { applies: false, reason: `${rel} is a generated view in store mode` };
  let content;
  try { content = fs.readFileSync(file, 'utf-8'); } catch (e) { return { applies: false, reason: `${rel} unreadable: ${e.message}` }; }
  const n = stateDigest.decisionEntries(content).length;
  if (n <= stateDigest.DEFAULT_KEEP) return { applies: false, reason: `${rel} "Recent Decisions" has ${n} entries (limit ${stateDigest.DEFAULT_KEEP})` };
  return { applies: true, reason: `${rel} "Recent Decisions" has ${n} entries; the ${n - stateDigest.DEFAULT_KEEP} oldest move to STATE_ARCHIVE.md` };
}

function apply(ctx) {
  const rel = planningRel(ctx.projectRoot, 'STATE.md');
  const archiveRel = planningRel(ctx.projectRoot, 'STATE_ARCHIVE.md');
  const d = detect(ctx);
  if (!d.applies) return { changed: [], notes: d.reason };
  const res = require('../state.cjs').rotateDecisionsOnDisk(ctx.projectRoot, stateDigest.DEFAULT_KEEP, { dryRun: !!ctx.dryRun });
  if (!res.applies) return { changed: [], notes: `nothing to move in ${rel}` };
  return {
    changed: [rel, archiveRel],
    notes: `moved ${res.moved} decisions from ${rel} to ${archiveRel}; ${res.kept} kept`,
  };
}

module.exports = {
  id: '0015',
  title: 'Move older STATE.md decisions to STATE_ARCHIVE.md (keep the newest 10)',
  since: '3.1.0',
  safety: 'auto',
  detect,
  apply,
};
