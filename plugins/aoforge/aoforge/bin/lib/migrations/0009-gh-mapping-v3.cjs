'use strict';

// Migration 0009 — gh-mapping-v3 (TRD 46-02, GSF-01).
//
// `.planning/.gh-mapping.json` has existed in two shapes (v1: bare issue numbers, v2: objects) and the
// GitHub sync keyed objectives three different ways (ROADMAP number, parseInt of the directory prefix,
// directory name). A reader of one shape fed the other's value to `gh issue edit` ("[object Object]"), and
// `pull` could never find the entries `push` wrote. This migration converts the mapping on disk to the one
// v3 shape and re-keys `.planning/.gh-sync-state.json` by objective id, both through lib/gh-mapping.cjs —
// the only place either decision is made.
//
// Why `auto`: it is local, deterministic and needs no judgement. Every conversion rule is in the pure
// `migrateMapping`; an ambiguous legacy key is kept (never guessed at), and two legacy keys that disagree
// about the issue are recorded under a `conflicts` block rather than one of them being picked. Anyone who
// skips the migration is still covered: `readMappingV3` converts lazily in memory and never writes.
//
// What it will not touch: a mapping it cannot parse, and a mapping written by a NEWER AOForge (version
// above 3). Both report `applies: false`, so a half-written file or a downgrade is never the result of an
// unattended SessionStart upgrade. The upgrade runner has already backed the project up outside the repo
// (`~/.claude/aoforge/backups/`) before the first write.
//
// Applicability is gated on the mapping file: a project that never synced to GitHub has neither file and
// is left alone. Sync-state keeps `version: 1` on disk; only its keys change.

const fs = require('fs');
const path = require('path');
const ghMapping = require('../gh-mapping.cjs');
const { atomicWrite } = require('../sync-state.cjs');

const MAPPING_REL = '.planning/.gh-mapping.json';
const SYNC_STATE_REL = '.planning/.gh-sync-state.json';

// 'v1' (bare issue numbers), 'v2' (objects), 'v1/v2 mixed', or 'v3'. Wording for reasons and notes only.
function describeShape(raw) {
  if (Number(raw.version) === ghMapping.MAPPING_VERSION) return 'v3';
  const values = Object.values(raw.objectives && typeof raw.objectives === 'object' ? raw.objectives : {});
  const bare = values.some((v) => v === null || typeof v !== 'object');
  const objects = values.some((v) => v !== null && typeof v === 'object');
  if (bare && objects) return 'v1/v2 mixed';
  return bare ? 'v1' : 'v2';
}

// Decide everything detect and apply need, without writing. -> { applies, reason, writes, notes }
// where writes is [{ rel, content }] in the order they are applied (mapping first).
function plan(ctx) {
  const none = (reason) => ({ applies: false, reason, writes: [], notes: [] });

  const mappingAbs = path.join(ctx.projectRoot, MAPPING_REL);
  if (!fs.existsSync(mappingAbs)) return none('no .gh-mapping.json (GitHub sync not in use)');

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(mappingAbs, 'utf-8'));
  } catch (_) {
    return none('unparseable mapping — left untouched');
  }

  const conv = ghMapping.migrateMapping(raw, ghMapping.listObjectiveIndex(ctx.projectRoot));
  if (conv.error) return none(`${conv.error} — left untouched`);

  const writes = [];
  const reasons = [];
  const notes = [];

  if (conv.changed) {
    const shape = describeShape(raw);
    writes.push({ rel: MAPPING_REL, content: ghMapping.serializeMapping(conv.mapping) });
    reasons.push(shape === 'v3' ? 'mapping keys normalised to objective ids' : `mapping ${shape} → v3`);
    notes.push(`converted .gh-mapping.json ${shape} → v3 (${Object.keys(conv.mapping.objectives).length} objective(s))`, ...conv.notes);
  }

  const syncAbs = path.join(ctx.projectRoot, SYNC_STATE_REL);
  if (fs.existsSync(syncAbs)) {
    let state = null;
    try {
      state = JSON.parse(fs.readFileSync(syncAbs, 'utf-8'));
    } catch (_) {
      notes.push('.gh-sync-state.json is unparseable — left untouched');
    }
    // Only version 1 (or unversioned) is understood; anything else is someone else's file.
    if (state && typeof state === 'object' && !Array.isArray(state) && (state.version === undefined || state.version === 1)) {
      const norm = ghMapping.normalizeSyncStateKeys(state);
      if (norm.changed) {
        writes.push({ rel: SYNC_STATE_REL, content: `${JSON.stringify(norm.state, null, 2)}\n` });
        reasons.push('sync-state keys → objective ids');
        notes.push('re-keyed .gh-sync-state.json by objective id');
      }
    }
  }

  if (writes.length === 0) return { applies: false, reason: 'mapping already v3 and sync-state keys already objective ids', writes, notes };
  return { applies: true, reason: reasons.join('; '), writes, notes };
}

function detect(ctx) {
  const p = plan(ctx);
  return { applies: p.applies, reason: p.reason };
}

function apply(ctx) {
  const p = plan(ctx);
  const changed = [];
  for (const w of p.writes) {
    if (!ctx.dryRun) atomicWrite(path.join(ctx.projectRoot, w.rel), w.content);
    changed.push(w.rel);
  }
  return { changed, notes: p.writes.length ? p.notes.join('; ') : `nothing to convert (${p.reason})` };
}

module.exports = {
  id: '0009',
  title: 'Convert the GitHub sync mapping to v3 and key sync-state by objective id',
  since: '2.13.0',
  safety: 'auto',
  detect,
  apply,
};
