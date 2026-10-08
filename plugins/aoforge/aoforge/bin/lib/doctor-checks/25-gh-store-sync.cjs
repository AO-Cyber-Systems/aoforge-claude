'use strict';

// Doctor check: gh-store-sync (TRD 50-07, GEN-03).
//
// Surfaces the store-mode sync problems that gh-health.collectStoreHealth (TRD 50-04) finds, without re-implementing
// any of it: W057 unsynced writes (pending/blocked ops, a halted outbox, a recovered journal), W058 missing links,
// W059 orphans (the OFFLINE half), W060 frozen-body drift, W061 the collector itself could not run.
//
// This check OWNS W057-W061 in the doctor: `22-validate-health.cjs` lists them in DEFERRED (the W040 pattern), so a
// problem shows once, here, instead of twice. `validate health` (Check 16) still reports them for people who run it
// directly.
//
// REPORT-ONLY, and offline. It never exports `fix`: flushing the outbox sends writes to GitHub, resolving a halt picks
// a side, and restoring a frozen TRD discards an edit, and each of those is a decision for a person. The online orphan
// scan stays `aof-tools gh orphans <objective>` (named in the W059 fix); doctor never calls it. Local mode, or no
// project, is ok.
//
// `fix_command` is the most urgent finding's command (halt > unsynced > frozen > links > orphans > check-failed);
// `details.fix_commands` carries one command per code, `details.findings` carries every finding.

const FIX_STATUS = 'aof-tools gh outbox status';
const FIX_HEALTH = 'aof-tools validate health --raw';

/** A finding's own `fix` when it is exactly one plain aof-tools command, not a sentence about several. */
function bareCommand(fix) {
  return typeof fix === 'string' && /^aof-tools [a-z][a-z0-9 <>|.-]*$/.test(fix.trim()) ? fix.trim() : null;
}

const isHalt = (f) => f.code === 'W057' && /halted/.test(f.message || '');

/** Urgency, lowest first: a halt stops every later write, so it outranks everything. */
function rank(f) {
  if (isHalt(f)) return 0;
  switch (f.code) {
    case 'W057': return 1;
    case 'W060': return 2;
    case 'W058': return 3;
    case 'W059': return 4;
    default: return 5; // W061, and any code the collector adds later
  }
}

/** The exact command to run for one finding. */
function commandFor(f) {
  switch (f.code) {
    case 'W057':
      // `aof-tools gh outbox flush` for queued writes; a halt or a recovered journal is read with `status` first.
      return isHalt(f) ? FIX_STATUS : bareCommand(f.fix) || FIX_STATUS;
    case 'W060':
      return f.id ? `aof-tools gh trd scope ${f.id}` : FIX_STATUS;
    case 'W058':
      return bareCommand(f.fix) || 'aof-tools gh sync --all';
    case 'W059':
      return f.objective ? `aof-tools gh orphans ${f.objective}` : FIX_STATUS;
    default:
      return FIX_HEALTH;
  }
}

function run(ctx) {
  if (!ctx.projectRoot) return { severity: 'ok', finding: 'no project', fixable: false };

  let result;
  try {
    // Through the module object, so a test can prove the collector is the one source of findings.
    result = require('../gh-health.cjs').collectStoreHealth(ctx.projectRoot, { env: ctx.env, home: ctx.userHome });
  } catch (e) {
    return {
      severity: 'warn',
      finding: `store sync health could not run: ${e && e.message ? e.message : String(e)}`,
      fixable: false,
      fix_command: FIX_HEALTH,
      details: { findings: [], codes: [], fix_commands: {} },
    };
  }

  if (!result || !result.applicable) {
    return { severity: 'ok', finding: 'not a store-mode project', fixable: false, details: { findings: [], codes: [], fix_commands: {} } };
  }

  const findings = result.findings || [];
  if (findings.length === 0) {
    return { severity: 'ok', finding: 'no store sync problems', fixable: false, details: { findings: [], codes: [], fix_commands: {} } };
  }

  // Stable sort: equal-rank findings keep the collector's order.
  const ordered = findings.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map((x) => x.f);

  const fixCommands = {};
  for (const f of ordered) if (!(f.code in fixCommands)) fixCommands[f.code] = commandFor(f);

  const codes = [...new Set(findings.map((f) => f.code))].sort();
  const listed = ordered.map((f) => `${f.code} ${f.message}`).join('; ');
  const n = findings.length;

  return {
    severity: 'warn',
    finding: `store sync: ${n} problem${n === 1 ? '' : 's'}: ${listed}`,
    fixable: false,
    fix_command: commandFor(ordered[0]),
    details: { findings: ordered, codes, fix_commands: Object.fromEntries(Object.entries(fixCommands).sort(([a], [b]) => a.localeCompare(b))) },
  };
}

module.exports = {
  id: 'gh-store-sync',
  title: 'GitHub store sync problems',
  scope: 'project',
  run,
};
