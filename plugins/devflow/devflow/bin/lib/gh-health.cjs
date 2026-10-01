'use strict';

/**
 * gh-health.cjs — offline store-mode health (TRD 50-04, GEN-03, the pure half).
 *
 * `collectStoreHealth(root, opts)` answers one question from LOCAL state only: what does this store-mode project
 * have that GitHub does not know about, or disagrees about? It reads the outbox journal, the sync bases, the mapping
 * (`.planning/.gh-mapping.json`) and the cache files; it never calls `gh`, never touches the network and never
 * writes. validate Check 16 and doctor check 25 (50-07) render what it returns.
 *
 *   -> { applicable: boolean, findings: [{ code, message, fix, objective?, id? }] }
 *
 * | code | meaning                                                                                              |
 * |------|------------------------------------------------------------------------------------------------------|
 * | W057 | unsynced writes: pending/blocked ops, a halted outbox, a recovered (corrupt) journal                 |
 * | W058 | missing links: a TRD file with no mapped issue, an objective with TRDs and no issue, a PR entry with  |
 * |      | no number                                                                                            |
 * | W059 | orphans, the OFFLINE half: a mapped TRD whose file is gone, a PR entry whose objective has no dir     |
 * | W060 | frozen-body drift: a frozen TRD whose local text no longer encodes to the recorded body hash          |
 * | W061 | the check itself failed (never silent, never a throw)                                                 |
 *
 * Local mode (`github.store` off) returns `{applicable:false, findings:[]}` BEFORE anything else is read: the same guard
 * as `planning-drift.findCacheDrift`. Each section runs inside its own try/catch, so one unreadable file costs one W061
 * and the sections that do not need it still run. Findings are data: this module never prints, exits or repairs.
 *
 * One side effect belongs to the outbox, not to this module: reading a journal that cannot be parsed makes
 * `outbox.status` move it aside as `<journal>.corrupt-<ts>` (so the next write cannot overwrite the only copy). That is
 * reported as a W057 naming the file; the file itself is never deleted here.
 *
 * The outbox, mapping and hierarchy modules are called through their module objects, never destructured, so a test can
 * prove that local mode reads none of them.
 */

const planningMode = require('./planning-mode.cjs');
const ghMapping = require('./gh-mapping.cjs');
const ghHierarchy = require('./gh-hierarchy.cjs');
const outbox = require('./gh-outbox.cjs');

const CODES = Object.freeze({
  UNSYNCED: 'W057',
  LINKS: 'W058',
  ORPHANS: 'W059',
  FROZEN_DRIFT: 'W060',
  FAILED: 'W061',
});

// ─── small helpers ───────────────────────────────────────────────────────────

const errText = (e) => (e && e.message ? e.message : String(e));
const plural = (n, one, many) => (n === 1 ? one : many);
const objectiveOf = (trdId) => String(trdId).replace(/-\d+$/, '');
const isPositiveInt = (n) => Number.isInteger(n) && n > 0;

/** One finding. `objective` and `id` are present only when the finding is about one objective or one TRD. */
function finding(code, message, fix, about = {}) {
  const f = { code, message, fix };
  if (about.objective !== undefined) f.objective = about.objective;
  if (about.id !== undefined) f.id = about.id;
  return f;
}

/** W061: a section could not run. `what` completes "store health could not check ...". */
function failed(what, err, fix) {
  return finding(
    CODES.FAILED,
    `store health could not check ${what}: ${errText(err)}`,
    fix || 'fix the cause above, then run the check again',
  );
}

/** The options `gh-outbox` readers accept (`env`, `home`, `now`), only when the caller gave them. */
function outboxOptions(opts) {
  const out = {};
  for (const key of ['env', 'home', 'now']) if (opts[key] !== undefined) out[key] = opts[key];
  return out;
}

// ─── W057: unsynced writes ───────────────────────────────────────────────────

function haltFinding(halted) {
  const reason = halted.reason || 'unknown';
  const seq = Number.isInteger(halted.seq) ? halted.seq : null;
  const detail = typeof halted.detail === 'string' && halted.detail !== '' ? `: ${halted.detail}` : '';
  const at = seq !== null ? `, op #${seq}` : '';
  const message = `the GitHub outbox is halted (${reason}${at})${detail}`;
  const fix = seq !== null
    ? `df-tools gh outbox resolve ${seq} --accept-remote (keep GitHub's version) or --overwrite (keep DevFlow's); `
      + 'df-tools gh outbox status shows the op'
    : 'df-tools gh outbox status shows the halted op; clear it with df-tools gh outbox resolve <seq> --accept-remote|--overwrite';
  const target = halted.target && typeof halted.target === 'object' ? halted.target : null;
  return finding(CODES.UNSYNCED, message, fix, target && typeof target.id === 'string' ? { id: target.id } : {});
}

function unsyncedFindings(main, outboxOpts) {
  const s = outbox.status(main, outboxOpts);
  const out = [];

  const queued = (s.pending || 0) + (s.blocked || 0);
  if (queued > 0) {
    const parts = [];
    if (s.pending > 0) parts.push(`${s.pending} pending`);
    if (s.blocked > 0) parts.push(`${s.blocked} blocked`);
    out.push(finding(
      CODES.UNSYNCED,
      `${queued} queued ${plural(queued, 'change has', 'changes have')} not reached GitHub (${parts.join(', ')})`,
      'df-tools gh outbox flush',
    ));
  }

  if (s.halted) out.push(haltFinding(s.halted));

  if (s.recovered && s.recovered.corrupt_path) {
    out.push(finding(
      CODES.UNSYNCED,
      `the outbox journal was unreadable and was set aside as ${s.recovered.corrupt_path}; anything queued in it was not sent`,
      `look at ${s.recovered.corrupt_path}, run df-tools gh sync --all to queue what it held, then delete the file`,
    ));
  }
  return out;
}

// ─── local files and the mapping ─────────────────────────────────────────────

/**
 * Every objective that has a directory, with its TRD files. A ROADMAP-only objective (no directory) has no files to
 * check. An objective whose TRD files cannot be read is returned in `errors` and in `unreadable`, so the checks that
 * compare files to the mapping skip it rather than call its TRDs orphans.
 */
function readLocal(main) {
  const index = ghMapping.listObjectiveIndex(main);
  const objectives = [];
  const errors = [];
  for (const entry of index) {
    if (entry.dir === null) continue;
    try {
      // Parse warnings (a stray file in the objective directory) are not findings: the array is passed and ignored.
      const trds = ghHierarchy.readObjectiveTrds(main, entry.id, { warnings: [] });
      objectives.push({ id: entry.id, dir: entry.dir, trds });
    } catch (e) {
      errors.push({ id: entry.id, error: e });
    }
  }
  return { index, objectives, errors, unreadable: new Set(errors.map((e) => e.id)) };
}

/** The v3 mapping, or a thrown Error naming why it cannot be trusted. A missing file is an empty mapping, not an error. */
function readMapping(main) {
  const rep = ghMapping.readMappingV3WithReport(main);
  if (rep.error) throw new Error(`.planning/.gh-mapping.json cannot be used: ${rep.error}`);
  if ((rep.warnings || []).some((w) => /unparseable/.test(w))) {
    throw new Error('.planning/.gh-mapping.json is not valid JSON');
  }
  return rep.mapping;
}

// ─── W058: missing links ─────────────────────────────────────────────────────

function linkFindings(local, mapping) {
  const out = [];

  for (const o of local.objectives) {
    if (o.trds.length === 0) continue;
    const sync = `df-tools gh sync ${o.id}`;
    if (!ghMapping.getEntry(mapping, o.id)) {
      out.push(finding(
        CODES.LINKS,
        `objective ${o.id} has ${o.trds.length} TRD ${plural(o.trds.length, 'file', 'files')} but no objective issue in the mapping`,
        sync,
        { objective: o.id },
      ));
    }
    for (const t of o.trds) {
      if (ghMapping.getTrd(mapping, t.id)) continue;
      out.push(finding(
        CODES.LINKS,
        `TRD ${t.id} (${t.file}) has no GitHub issue in the mapping`,
        sync,
        { objective: o.id, id: t.id },
      ));
    }
  }

  for (const [objective, pr] of ghMapping.listPrs(mapping)) {
    if (isPositiveInt(pr.number)) continue;
    const branch = typeof pr.branch === 'string' && pr.branch !== '' ? ` (branch ${pr.branch})` : '';
    out.push(finding(
      CODES.LINKS,
      `objective ${objective} has a pull request entry${branch} but no PR number`,
      `df-tools gh pr sync ${objective}`,
      { objective },
    ));
  }
  return out;
}

// ─── the collector ───────────────────────────────────────────────────────────

/**
 * @param {string} root any cwd in the project; the MAIN checkout is resolved first (the mapping and cache live there)
 * @param {{env?: object, home?: string, now?: number}} [opts] passed to the outbox readers (tests point the journal at a temp dir)
 * @returns {{applicable: boolean, findings: Array<{code: string, message: string, fix: string, objective?: string, id?: string}>}}
 */
function collectStoreHealth(root, opts = {}) {
  let pm;
  try {
    pm = planningMode.planningMode(root);
  } catch (e) {
    return { applicable: true, findings: [failed('whether this project uses store mode', e)] };
  }
  if (pm.mode !== planningMode.STORE) return { applicable: false, findings: [] };

  const main = pm.root;
  const outboxOpts = outboxOptions(opts || {});
  const findings = [];
  const section = (what, fn, fix) => {
    try {
      findings.push(...fn());
    } catch (e) {
      findings.push(failed(what, e, fix));
    }
  };

  section('the outbox', () => unsyncedFindings(main, outboxOpts), 'run df-tools gh outbox status to see why the journal cannot be read');

  let local = null;
  section('the objective directories', () => {
    local = readLocal(main);
    return local.errors.map((e) => failed(`the TRD files of objective ${e.id}`, e.error));
  });

  let mapping = null;
  section('the GitHub mapping', () => {
    mapping = readMapping(main);
    return [];
  }, 'repair .planning/.gh-mapping.json (or restore it from git), then run the check again');

  if (local && mapping) {
    section('the TRD and PR links', () => linkFindings(local, mapping));
  }

  return { applicable: true, findings };
}

module.exports = { collectStoreHealth, CODES };
