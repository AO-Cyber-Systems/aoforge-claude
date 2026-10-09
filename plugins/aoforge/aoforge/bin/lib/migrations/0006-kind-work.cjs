'use strict';

// Migration 0006 — kind-work (TRD 36-04b). safety: 'confirm'.
//
// Moves a pre-intent-model project onto the kind/work model by wrapping migrate.cjs: PROJECT.md
// gains `kind` (and `default_work` when given) and OBJECTIVE.md files lacking `work` get the
// default work. It never guesses a kind — that is why it is `confirm`: a human chooses, and the
// choice arrives as ctx.options.kind (`aof-tools upgrade --apply --only 0006 --kind <kind>`, which
// `health --migrate` runs after asking).
//
// Detect keys on PROJECT.md `kind` only. Objectives missing `work` on a project that already has
// `kind` are not this migration's business.
//
// migrate.apply is called with backup: false because the upgrade runner has already backed the
// project up outside the repo; the standalone `aof-tools migrate apply` keeps its in-repo backup.

const path = require('path');
const migrate = require('../migrate.cjs');
const { VALID_KINDS } = require('../intent.cjs');

const { planningRel } = require('../compat.cjs');

function rel(projectRoot, absPath) {
  return path.relative(projectRoot, absPath).split(path.sep).join('/');
}

function detect(ctx) {
  const PROJECT_REL = planningRel(ctx.projectRoot, 'PROJECT.md');
  const p = migrate.plan({ projectRoot: ctx.projectRoot });
  if (p.errors.length > 0 || !p.project) {
    return { applies: false, reason: `no ${PROJECT_REL} to set a kind on` };
  }
  if (!p.project.needsKind) {
    return { applies: false, reason: `${PROJECT_REL} already has kind: ${p.project.currentKind}` };
  }
  return {
    applies: true,
    reason: `${PROJECT_REL} has no kind; choose one (${VALID_KINDS.join(', ')}) and run with --kind <kind>`,
  };
}

function apply(ctx) {
  const options = ctx.options || {};
  const kind = options.kind;
  if (!kind) {
    throw new Error(`0006 needs --kind <kind> (one of: ${VALID_KINDS.join(', ')})`);
  }

  // Defensive: the runner detects immediately before apply, but a direct call on a project that
  // already has a kind must not start rewriting objectives' work.
  const p = migrate.plan({ projectRoot: ctx.projectRoot });
  if (p.project && !p.project.needsKind) {
    return { changed: [], notes: `kind already set (${p.project.currentKind}); nothing to do` };
  }

  const r = migrate.apply({
    projectRoot: ctx.projectRoot,
    kind,
    defaultWork: options.defaultWork,
    dryRun: !!ctx.dryRun,
    backup: false,
  });
  return {
    changed: (r.changes || []).map((c) => rel(ctx.projectRoot, c.path)),
    notes: options.defaultWork ? `kind=${kind} default_work=${options.defaultWork}` : `kind=${kind}`,
  };
}

module.exports = {
  id: '0006',
  title: 'Set PROJECT.md kind (and default work) for the intent model',
  since: '2.11.0',
  safety: 'confirm',
  detect,
  apply,
};
