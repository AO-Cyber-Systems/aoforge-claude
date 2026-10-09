'use strict';

/**
 * gh-health.cjs — offline store-mode health (TRD 50-04, GEN-03, the pure half).
 *
 * `collectStoreHealth(root, opts)` answers one question from LOCAL state only: what does this store-mode project
 * have that GitHub does not know about, or disagrees about? It reads the outbox journal, the sync bases, the mapping
 * (`.aoforge/.gh-mapping.json`) and the cache files; it never calls `gh`, never touches the network and never
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
const ghTrd = require('./gh-trd.cjs');
const outbox = require('./gh-outbox.cjs');

const CODES = Object.freeze({
  UNSYNCED: 'W057',
  LINKS: 'W058',
  ORPHANS: 'W059',
  FROZEN_DRIFT: 'W060',
  FAILED: 'W061',
});

// ─── small helpers ───────────────────────────────────────────────────────────

const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
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
    ? `aof-tools gh outbox resolve ${seq} --accept-remote (keep GitHub's version) or --overwrite (keep AOForge's); `
      + 'aof-tools gh outbox status shows the op'
    : 'aof-tools gh outbox status shows the halted op; clear it with aof-tools gh outbox resolve <seq> --accept-remote|--overwrite';
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
      'aof-tools gh outbox flush',
    ));
  }

  if (s.halted) out.push(haltFinding(s.halted));

  if (s.recovered && s.recovered.corrupt_path) {
    out.push(finding(
      CODES.UNSYNCED,
      `the outbox journal was unreadable and was set aside as ${s.recovered.corrupt_path}; anything queued in it was not sent`,
      `look at ${s.recovered.corrupt_path}, run aof-tools gh sync --all to queue what it held, then delete the file`,
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
  if (rep.error) throw new Error(`.aoforge/.gh-mapping.json cannot be used: ${rep.error}`);
  if ((rep.warnings || []).some((w) => /unparseable/.test(w))) {
    throw new Error('.aoforge/.gh-mapping.json is not valid JSON');
  }
  return rep.mapping;
}

// ─── W058: missing links ─────────────────────────────────────────────────────

function linkFindings(local, mapping) {
  const out = [];

  for (const o of local.objectives) {
    if (o.trds.length === 0) continue;
    const sync = `aof-tools gh sync ${o.id}`;
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
      `aof-tools gh pr sync ${objective}`,
      { objective },
    ));
  }
  return out;
}

// ─── W059: orphans (offline half) ────────────────────────────────────────────

/**
 * Mapping entries with nothing local behind them. The GitHub-side scan (`gh orphans`) needs the network, so every
 * finding names it for the online confirmation. A Decision entry has no file by design and is skipped, and so is a TRD
 * of an objective whose files could not be read (that is a W061, not an orphan).
 */
function orphanFindings(local, mapping) {
  const out = [];

  const present = new Set();
  for (const o of local.objectives) for (const t of o.trds) present.add(t.id);

  for (const key of Object.keys(mapping.trds || {}).sort(natural)) {
    const tid = ghMapping.toTrdId(key);
    const entry = ghMapping.getTrd(mapping, key);
    if (tid === null || !entry || entry.role === 'decision' || /-d\d+$/.test(tid)) continue;
    const objective = objectiveOf(tid);
    if (local.unreadable.has(objective) || present.has(tid)) continue;
    out.push(finding(
      CODES.ORPHANS,
      `TRD ${tid} is mapped to issue #${entry.issue_number} but its file is gone from .aoforge/objectives/`,
      `aof-tools gh orphans ${objective} confirms against GitHub; restore the file with aof-tools gh pull --all, `
        + `or close issue #${entry.issue_number} if the TRD was removed on purpose`,
      { objective, id: tid },
    ));
  }

  const withDir = new Set(local.index.filter((e) => e.dir !== null).map((e) => e.id));
  for (const [key, pr] of ghMapping.listPrs(mapping)) {
    const objective = ghMapping.toObjectiveId(key) || key;
    if (withDir.has(objective)) continue;
    const branch = typeof pr.branch === 'string' && pr.branch !== '' ? ` (branch ${pr.branch})` : '';
    const number = isPositiveInt(pr.number) ? ` #${pr.number}` : '';
    out.push(finding(
      CODES.ORPHANS,
      `objective ${objective} has a pull request entry${number}${branch} but no objective directory under .aoforge/objectives/`,
      `aof-tools gh orphans ${objective} confirms against GitHub; if the objective was removed on purpose, close its pull request there`,
      { objective },
    ));
  }
  return out;
}

// ─── W060: frozen-body drift ─────────────────────────────────────────────────

/**
 * A TRD is frozen when its sync base carries `frozen: true`; from then on its body changes only through a scope comment.
 * The recorded `body_hash` is `contentHash` of the issue body (gh-outbox-flush `baseFromIssue`), and the body of a TRD
 * issue is `encodeTrdBody({id, file, text})` of the file (gh-hierarchy buildOps), so the local file drifted exactly when
 * that encoding no longer hashes to `base.body_hash`. Comment (`<id>#<kind>`) and PR (`pr:<n>`) bases are not TRD ids and
 * are skipped; a frozen base with no local file is left to W059.
 */
function frozenDriftFindings(main, local, outboxOpts) {
  const bases = outbox.readBase(main, outboxOpts);
  const files = new Map();
  for (const o of local.objectives) for (const t of o.trds) files.set(t.id, { objective: o.id, file: t.file, text: t.text });

  const out = [];
  for (const key of Object.keys(bases).sort(natural)) {
    const base = bases[key];
    if (!base || base.frozen !== true) continue;
    const tid = ghMapping.toTrdId(key);
    const trd = tid === null ? undefined : files.get(tid);
    if (!trd) continue;
    const actual = ghTrd.contentHash(ghTrd.encodeTrdBody({ id: tid, file: trd.file, text: trd.text }));
    if (actual === base.body_hash) continue;
    out.push(finding(
      CODES.FROZEN_DRIFT,
      `frozen TRD ${tid} (${trd.file}) no longer matches the body recorded for issue #${base.issue_number}`,
      `a frozen TRD changes only through a scope comment: aof-tools gh trd scope ${tid} ...; `
        + 'restore the file with aof-tools gh pull --all --force',
      { objective: trd.objective, id: tid },
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

  section('the outbox', () => unsyncedFindings(main, outboxOpts), 'run aof-tools gh outbox status to see why the journal cannot be read');

  let local = null;
  section('the objective directories', () => {
    local = readLocal(main);
    return local.errors.map((e) => failed(`the TRD files of objective ${e.id}`, e.error));
  });

  let mapping = null;
  section('the GitHub mapping', () => {
    mapping = readMapping(main);
    return [];
  }, 'repair .aoforge/.gh-mapping.json (or restore it from git), then run the check again');

  if (local && mapping) {
    section('the TRD and PR links', () => linkFindings(local, mapping));
    section('mapped TRDs and PRs that have nothing local', () => orphanFindings(local, mapping));
  }

  // Needs only the sync bases and the files, not the mapping, so an unreadable mapping does not hide it.
  if (local) {
    section(
      'the frozen TRD bodies',
      () => frozenDriftFindings(main, local, outboxOpts),
      'run aof-tools gh outbox status to see why the sync bases cannot be read',
    );
  }

  return { applicable: true, findings };
}

module.exports = { collectStoreHealth, CODES };
