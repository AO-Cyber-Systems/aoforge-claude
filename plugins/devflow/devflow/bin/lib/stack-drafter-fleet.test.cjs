'use strict';

// stack-drafter-fleet.test.cjs — the real-fleet drift harness (TRD 43-08, gap closure cycle 1).
//
// The 43-06 goldens pass on invented fixtures built to fit the rules; the real fleet still drifted
// (43-VERIFICATION.md). This is the outermost test: it redrafts each fleet repo with the CHECKOUT's
// `df-tools --cwd <repo> stack init` (no --write, no --run) and compares the draft with the repo's
// committed `.planning/STACK.md`, read from HEAD and never from the work tree, in exactly the 43-07
// dry-run scope (stack-drift-compare.cjs).
//
//  12  per repo      no CONFLICT outside ACCEPTED and KNOWN_DRIFT; more-specific rows are reported
//                    with t.diagnostic and never fail
//  13  ratchet       every KNOWN_DRIFT key still conflicts; a closed one fails with "remove it"
//  14  read-only     HEAD and `git status --porcelain=v1 -uall` equal before and after, per repo
//  15  table guards  ACCEPTED is exactly { devcluster: lint, test } (the accepted HAND_ONLY keys are
//                    imported, not copied); every KNOWN_DRIFT entry has keys, closes and reason
//
// Real environment on purpose: process.env (the real PATH and HOME) reaches `stack init` and the tier
// resolution, as in the 43-07 dry run. The golden and realshape suites use stubs; this one does not.
//
// Skips, never fails, when: DEVFLOW_SKIP_FLEET_HARNESS=1; the fleet root (DEVFLOW_FLEET_ROOT, default
// ~/dev) is absent or holds fewer than half of FLEET; and, per repo, when the repo or its committed
// STACK.md is absent. A `stack init` that exits non-zero is a failure, not a skip.
// The table guards (15) read no repository, so they always run.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const golden = require('./__fixtures__/stack-golden-fixtures.cjs');
const { FLEET, ACCEPTED, KNOWN_DRIFT } = require('./__fixtures__/stack-fleet-tables.cjs');
const { compareDrift, formatRow } = require('./__fixtures__/stack-drift-compare.cjs');
const { parseProfile, resolveFromParsed } = require('./stack-profile.cjs');

const { HAND_ONLY, KEY_ALIASES } = golden;

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const FLEET_ROOT = process.env.DEVFLOW_FLEET_ROOT || path.join(os.homedir(), 'dev');
const COMMITTED = '.planning/STACK.md';
const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };

/** git(repo, args) -> spawnSync result. Read-only verbs only: rev-parse, status, show. */
function git(repo, args) {
  return spawnSync('git', ['-C', repo, ...args], { encoding: 'utf-8', env: GIT_ENV, maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
}

/** snapshot(repo) -> { head, porcelain }: what a read-only draft must leave unchanged. */
function snapshot(repo) {
  return {
    head: git(repo, ['rev-parse', 'HEAD']).stdout.trim(),
    porcelain: git(repo, ['status', '--porcelain=v1', '-uall']).stdout,
  };
}

/** committedText(repo) -> the committed STACK.md from HEAD, or null when there is none. */
function committedText(repo) {
  const r = git(repo, ['show', `HEAD:${COMMITTED}`]);
  return r.status === 0 ? r.stdout : null;
}

/** Large `stack init` results print as a single `@file:<path>` line: read that file for the JSON. */
function parseInitOutput(stdout) {
  const text = stdout.trim();
  if (text.startsWith('@file:')) {
    const file = text.slice('@file:'.length).trim();
    const body = fs.readFileSync(file, 'utf-8');
    try { fs.unlinkSync(file); } catch (_) { /* the pointer file is df-tools' own temp file */ }
    return JSON.parse(body);
  }
  return JSON.parse(text);
}

/** stackInit(repo) -> { ok, fm } | { ok: false, error }. No --write, no --run; real env. */
function stackInit(repo) {
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, 'stack', 'init'], {
    encoding: 'utf-8',
    env: process.env,
    timeout: 60000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) return { ok: false, error: `stack init exited ${r.status}${r.signal ? ` (${r.signal})` : ''}: ${r.stderr}` };
  let json;
  try {
    json = parseInitOutput(r.stdout);
  } catch (e) {
    return { ok: false, error: `stack init printed no parseable JSON: ${e.message}` };
  }
  if (!json || typeof json.text !== 'string') return { ok: false, error: 'stack init JSON has no `text`' };
  return { ok: true, fm: parseProfile(json.text).frontmatter };
}

/** The resolved commands of the tier a file `extends` (real HOME), i.e. what it inherits. */
function tierCommands(extendsId, repo) {
  const resolved = resolveFromParsed(
    { frontmatter: { schema: 1, extends: extendsId }, sections: [] },
    { userHome: os.homedir(), file: null, projectRoot: repo, targetPath: null },
  );
  return (resolved.frontmatter && resolved.frontmatter.commands) || {};
}

/** knownKeys(repo) -> every key a KNOWN_DRIFT entry of the repo covers. */
const knownKeys = (repo) => (KNOWN_DRIFT[repo] || []).flatMap((entry) => entry.keys);

const presentRepos = FLEET.filter((repo) => fs.existsSync(path.join(FLEET_ROOT, repo)));

function fleetSkipReason() {
  if (process.env.DEVFLOW_SKIP_FLEET_HARNESS === '1') return 'DEVFLOW_SKIP_FLEET_HARNESS=1';
  if (!fs.existsSync(FLEET_ROOT)) return `the fleet root ${FLEET_ROOT} is absent`;
  if (presentRepos.length * 2 < FLEET.length) return `only ${presentRepos.length} of ${FLEET.length} fleet repos are under ${FLEET_ROOT}`;
  return false;
}

describe('stack init against the real fleet (TRD 43-08)', { skip: fleetSkipReason() }, () => {
  for (const repo of FLEET) {
    test(`${repo}: draft has no unaccepted conflict with the committed STACK.md`, (t) => {
      const dir = path.join(FLEET_ROOT, repo);
      if (!fs.existsSync(dir)) {
        t.skip(`${repo} is not under ${FLEET_ROOT}`);
        return;
      }
      const text = committedText(dir);
      if (text === null) {
        t.skip(`${repo} has no committed ${COMMITTED} at HEAD`);
        return;
      }

      const before = snapshot(dir);
      const init = stackInit(dir);
      const after = snapshot(dir);

      // 14: the drafter wrote nothing and moved nothing.
      assert.equal(after.head, before.head, `${repo}: HEAD moved during the draft`);
      assert.equal(after.porcelain, before.porcelain, `${repo}: the work tree changed during the draft`);
      assert.ok(init.ok, `${repo}: ${init.error}`);

      const committed = parseProfile(text).frontmatter;
      const draft = init.fm;
      const { rows, skipped } = compareDrift({
        committed,
        draft,
        committedTier: tierCommands(committed.extends, dir),
        draftTier: tierCommands(draft.extends, dir),
        handOnly: HAND_ONLY[repo] || [],
        keyAliases: KEY_ALIASES,
      });

      const conflicts = rows.filter((row) => row.kind === 'conflict');
      const moreSpecific = rows.filter((row) => row.kind === 'more_specific');
      if (skipped.length) t.diagnostic(`${repo}: HAND_ONLY keys skipped: ${skipped.join(', ')}`);
      for (const row of moreSpecific) t.diagnostic(`${repo}: more specific: ${formatRow(row)}`);

      const allowed = new Set([...((ACCEPTED[repo] && ACCEPTED[repo].keys) || []), ...knownKeys(repo)]);
      const problems = [];

      // 12: a conflict outside ACCEPTED and KNOWN_DRIFT is new drift.
      const unaccepted = conflicts.filter((row) => !allowed.has(row.key));
      for (const row of unaccepted) problems.push(`new conflict: ${formatRow(row)}`);

      // 13: the ratchet. A KNOWN_DRIFT key that is no longer a conflict has been closed.
      const conflictKeys = new Set(conflicts.map((row) => row.key));
      for (const key of knownKeys(repo)) {
        if (conflictKeys.has(key)) continue;
        const now = moreSpecific.find((row) => row.key === key);
        problems.push(`${repo}.${key} no longer drifts${now ? ' (now more_specific)' : ''}: remove it from KNOWN_DRIFT`);
      }

      assert.equal(problems.length, 0, `${repo}:\n  ${problems.join('\n  ')}`);
    });
  }
});

describe('fleet tables (TRD 43-08 guards)', () => {
  test('FLEET is the 33 unique repo names', () => {
    assert.equal(FLEET.length, 33);
    assert.equal(new Set(FLEET).size, 33);
  });

  test('ACCEPTED is exactly devcluster lint and test; HAND_ONLY keys are imported, not copied', () => {
    assert.deepEqual(Object.keys(ACCEPTED), ['devcluster']);
    assert.deepEqual([...ACCEPTED.devcluster.keys], ['lint', 'test']);
    assert.ok(typeof ACCEPTED.devcluster.reason === 'string' && ACCEPTED.devcluster.reason.length > 0, 'ACCEPTED.devcluster needs a reason');
    // The tables name only repos of the fleet, and the shape names of HAND_ONLY are repo names.
    for (const repo of Object.keys(HAND_ONLY)) assert.ok(FLEET.includes(repo), `HAND_ONLY.${repo} is not a FLEET repo`);
  });

  test('every KNOWN_DRIFT entry has keys, closes and reason, and names a FLEET repo', () => {
    for (const [repo, entries] of Object.entries(KNOWN_DRIFT)) {
      assert.ok(FLEET.includes(repo), `KNOWN_DRIFT.${repo} is not a FLEET repo`);
      assert.ok(Array.isArray(entries) && entries.length > 0, `KNOWN_DRIFT.${repo} must be a non-empty list of entries`);
      const seen = new Set();
      for (const entry of entries) {
        const id = `KNOWN_DRIFT.${repo} [${(entry.keys || []).join(', ')}]`;
        assert.ok(Array.isArray(entry.keys) && entry.keys.length > 0 && entry.keys.every((k) => typeof k === 'string' && k), `${id}: keys`);
        assert.ok(typeof entry.closes === 'string' && /^(43-\d\d|out-of-scope)$/.test(entry.closes), `${id}: closes must be 43-NN or out-of-scope`);
        assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0, `${id}: reason`);
        if (entry.residual !== undefined) assert.ok(typeof entry.residual === 'string' && entry.residual.length > 0, `${id}: residual needs its why`);
        for (const key of entry.keys) {
          assert.ok(!seen.has(key), `${id}: ${key} is listed twice for ${repo}`);
          seen.add(key);
          const accepted = (ACCEPTED[repo] && ACCEPTED[repo].keys) || [];
          assert.ok(!accepted.includes(key), `${id}: ${key} is already ACCEPTED`);
          assert.ok(!(HAND_ONLY[repo] || []).includes(key), `${id}: ${key} is already HAND_ONLY`);
        }
      }
    }
  });
});
