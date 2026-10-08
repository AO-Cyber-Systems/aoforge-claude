'use strict';

// Migration 0003 — state-json-seed (TRD 36-04a).
//
// Seeds the machine-readable `.planning/state.json` sidecar from STATE.md when STATE.md exists and
// state.json does not. This is the only copy of the seeding logic: `validate health --repair`
// (W009, action `createStateJson`) calls apply.

const fs = require('fs');
const path = require('path');
const { STATE_JSON_DEFAULTS, stateExtractField, writeStateJson } = require('../state.cjs');

const STATE_REL = '.planning/STATE.md';
const STATE_JSON_REL = '.planning/state.json';

/**
 * seedFromStateMd(stateContent) -> a state.json object: STATE_JSON_DEFAULTS overlaid with every
 * field the markdown yields (Current Job, Total Jobs in Objective, Progress, Status, Last Activity,
 * Current Objective, and the `## Blockers` list).
 */
function seedFromStateMd(stateContent) {
  const content = stateContent || '';
  const seeded = Object.assign({}, STATE_JSON_DEFAULTS);

  const extractMd = (field) => stateExtractField(content, field);
  const currentJobRaw = extractMd('Current Job');
  const totalJobsRaw = extractMd('Total Jobs in Objective');
  const progressRaw = extractMd('Progress');
  const statusRaw = extractMd('Status');
  const lastActivityRaw = extractMd('Last Activity');
  const currentObjRaw = extractMd('Current Objective');

  if (currentJobRaw) seeded.current_job = parseInt(currentJobRaw, 10) || 0;
  if (totalJobsRaw) seeded.total_jobs = parseInt(totalJobsRaw, 10) || 0;
  if (progressRaw) seeded.progress_pct = parseInt(String(progressRaw).replace('%', ''), 10) || 0;
  if (statusRaw) seeded.status = statusRaw;
  if (lastActivityRaw) seeded.last_activity = lastActivityRaw;
  if (currentObjRaw) seeded.current_objective = currentObjRaw;

  // The body starts on the line after the heading. (The old health repair used `[^#]*\n` here,
  // which is greedy: with a blank line before the next heading it skipped the Blockers list and
  // captured the NEXT section's bullets instead — e.g. the Session Log entries.)
  const blockersMatch = content.match(/##\s*Blockers[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
  if (blockersMatch) {
    const items = blockersMatch[1].match(/^-\s+(.+)$/gm) || [];
    seeded.blockers = items.map((i) => i.replace(/^-\s+/, '').trim()).filter(Boolean);
  }

  return seeded;
}

function detect(ctx) {
  const statePath = path.join(ctx.projectRoot, STATE_REL);
  if (!fs.existsSync(statePath)) return { applies: false, reason: `no ${STATE_REL} to seed from` };
  if (fs.existsSync(path.join(ctx.projectRoot, STATE_JSON_REL))) {
    return { applies: false, reason: `${STATE_JSON_REL} already exists` };
  }
  return { applies: true, reason: `${STATE_JSON_REL} is missing; seeding it from ${STATE_REL}` };
}

function apply(ctx) {
  const statePath = path.join(ctx.projectRoot, STATE_REL);
  const content = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf-8') : '';
  const seeded = seedFromStateMd(content);
  if (!ctx.dryRun) writeStateJson(ctx.projectRoot, seeded);
  const seededFields = Object.keys(seeded).filter((k) => seeded[k] !== STATE_JSON_DEFAULTS[k]);
  return { changed: [STATE_JSON_REL], notes: { seeded_fields: seededFields } };
}

module.exports = {
  id: '0003',
  title: 'Seed .planning/state.json from STATE.md',
  since: '2.11.0',
  safety: 'auto',
  detect,
  apply,
  seedFromStateMd,
};
