'use strict';

// Migration 0004 — objective-md-backfill (TRD 36-04b).
//
// Creates OBJECTIVE.md for every objective directory named `NN-slug` (or `NN.N-slug`) that has
// none, through project-bootstrap's `backfillAllObjectives` (dead code since TRD 18-01; this is
// its caller now). The stub carries `work:` (PROJECT.md `default_work`, else `feature`) and the
// objective's name and goal from ROADMAP.md.
//
// Only NN-named dirs are walked: scratch dirs under .planning/objectives/ (for example
// `UI-VISUAL-EVAL-CALLOUT`) are not objectives and must never receive a stub.

const { backfillAllObjectives } = require('../project-bootstrap.cjs');

const OBJECTIVE_DIR_RE = /^\d+(?:\.\d+)?-/;

function objectiveIdOf(relPath) {
  // '.planning/objectives/<id>/OBJECTIVE.md' -> '<id>'
  return relPath.split('/').slice(-2, -1)[0];
}

function detect(ctx) {
  const r = backfillAllObjectives(ctx.projectRoot, { match: OBJECTIVE_DIR_RE, dryRun: true });
  if (r.paths.length === 0) {
    return { applies: false, reason: 'every NN-named objective dir already has an OBJECTIVE.md' };
  }
  const ids = r.paths.map(objectiveIdOf);
  return { applies: true, reason: `OBJECTIVE.md missing in: ${ids.join(', ')}` };
}

function apply(ctx) {
  const r = backfillAllObjectives(ctx.projectRoot, { match: OBJECTIVE_DIR_RE, dryRun: !!ctx.dryRun });
  if (r.errors.length > 0) {
    throw new Error(r.errors.map((e) => `${e.objective}: ${e.message}`).join('; '));
  }
  return { changed: r.paths, notes: { created: r.paths.map(objectiveIdOf) } };
}

module.exports = {
  id: '0004',
  title: 'Backfill OBJECTIVE.md for objective dirs that have none',
  since: '2.11.0',
  safety: 'auto',
  detect,
  apply,
};
