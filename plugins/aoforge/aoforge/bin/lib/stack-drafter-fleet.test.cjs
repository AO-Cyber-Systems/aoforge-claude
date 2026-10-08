'use strict';

// stack-drafter-fleet.test.cjs — the real-fleet drift harness (TRD 43-08, final tables in 43-15).
//
// The 43-06 goldens pass on invented fixtures built to fit the rules; the real fleet still drifted
// (43-VERIFICATION.md). This is the outermost test: it redrafts each fleet repo with the CHECKOUT's
// `aof-tools --cwd <repo> stack init` (no --write, no --run) and compares the draft with the repo's
// committed `.planning/STACK.md`, read from HEAD and never from the work tree, in exactly the 43-07
// dry-run scope (stack-drift-compare.cjs).
//
//  12  per repo      no CONFLICT outside ACCEPTED (as a conflict); more-specific rows, ACCEPTED rows and
//                    OPEN rows are reported with t.diagnostic and never fail
//  13  ratchet       every OPEN key still drifts (conflict or more-specific); a closed one fails with
//                    "remove it". An ACCEPTED row that no longer drifts is reported, not failed
//  14  read-only     HEAD and `git status --porcelain=v1 -uall` equal before and after, per repo
//  15  table guards  the module exports exactly FLEET, ACCEPTED and OPEN (no KNOWN_DRIFT, no third table);
//                    ACCEPTED is exactly the user-accepted rows, each with kind, reason, date and
//                    by: 'user' (the accepted HAND_ONLY keys are imported, not copied); OPEN entries
//                    have keys and a reason
//  16  assess        the classification (`assess`) is checked on synthetic tables, because the real OPEN rows
//                    all drift today and the ratchet's failing branch would otherwise never run. An OPEN entry with `pending: 'refresh'`
//                    is reported as "refresh pending" (TRD 71-02): a drafter rule closed the gap and the repo's
//                    committed STACK.md predates it. It is tolerated while it drifts and fails once it stops
//  17  self-test     per repo, no drafted command carries a self-test argument while the draft's evidence
//      guard         holds the gate that runs the same entry point without one (`selfTestDrafts`, TRD 71-02,
//                    guarding the 71-01 rule). Its predicate is written apart from the drafter's on purpose
//
// Real environment on purpose: process.env (the real PATH and HOME) reaches `stack init` and the tier
// resolution, as in the 43-07 dry run. The golden and realshape suites use stubs; this one does not.
//
// Skips, never fails, when: AOFORGE_SKIP_FLEET_HARNESS=1; the fleet root (AOFORGE_FLEET_ROOT, default
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
const tables = require('./__fixtures__/stack-fleet-tables.cjs');
const { FLEET, ACCEPTED, OPEN } = tables;
const { compareDrift, formatRow, selfTestDrafts } = require('./__fixtures__/stack-drift-compare.cjs');
const { parseProfile, resolveFromParsed } = require('./stack-profile.cjs');

const { HAND_ONLY, KEY_ALIASES } = golden;

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const FLEET_ROOT = process.env.AOFORGE_FLEET_ROOT || path.join(os.homedir(), 'dev');
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
    try { fs.unlinkSync(file); } catch (_) { /* the pointer file is aof-tools' own temp file */ }
    return JSON.parse(body);
  }
  return JSON.parse(text);
}

/** stackInit(repo) -> { ok, fm, evidence } | { ok: false, error }. No --write, no --run; real env. */
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
  return { ok: true, fm: parseProfile(json.text).frontmatter, evidence: Array.isArray(json.evidence) ? json.evidence : [] };
}

/** The resolved commands of the tier a file `extends` (real HOME), i.e. what it inherits. */
function tierCommands(extendsId, repo) {
  const resolved = resolveFromParsed(
    { frontmatter: { schema: 1, extends: extendsId }, sections: [] },
    { userHome: os.homedir(), file: null, projectRoot: repo, targetPath: null },
  );
  return (resolved.frontmatter && resolved.frontmatter.commands) || {};
}

/**
 * assess(repo, rows, { accepted, open }) -> { problems, notes }
 *
 * Classifies the rows of one repo's compareDrift against the tables. A row is
 *   - ACCEPTED when an accepted entry lists its key with the row's kind (a conflict accepted as a
 *     more-specific row, or the reverse, is not accepted);
 *   - OPEN when an open entry lists its key (any drift kind);
 *   - otherwise a problem if it is a conflict, and a note if it is more-specific.
 * An OPEN key with no row has been closed: a problem ("remove it"). An ACCEPTED entry with no matching
 * row is a note only, because accepting is the user's call and a closed row does no harm.
 */
function assess(repo, rows, { accepted = {}, open = {} } = {}) {
  const acceptedEntries = accepted[repo] || [];
  const openEntries = open[repo] || [];
  const problems = [];
  const notes = [];

  for (const row of rows) {
    const acc = acceptedEntries.find((entry) => entry.kind === row.kind && entry.keys.includes(row.key));
    if (acc) {
      notes.push(`${repo}: accepted by ${acc.by} ${acc.decided} (${row.kind}): ${formatRow(row)}`);
    } else if (openEntries.some((entry) => entry.keys.includes(row.key))) {
      // A refresh-pending row is a follow-up (a drafter rule closed the gap; the repo's committed file predates it),
      // not a drafter gap. It is tolerated exactly like any OPEN row, and the ratchet below still applies.
      const open = openEntries.find((entry) => entry.keys.includes(row.key));
      notes.push(open.pending === 'refresh'
        ? `${repo}: OPEN, refresh pending (${row.kind}): ${formatRow(row)}`
        : `${repo}: OPEN (${row.kind}): ${formatRow(row)}`);
    } else if (row.kind === 'conflict') {
      problems.push(`new conflict: ${formatRow(row)}`);
    } else {
      notes.push(`${repo}: more specific: ${formatRow(row)}`);
    }
  }

  const drifting = new Set(rows.map((row) => row.key));
  for (const key of openEntries.flatMap((entry) => entry.keys)) {
    if (!drifting.has(key)) problems.push(`${repo}.${key} no longer drifts: remove it from OPEN`);
  }
  for (const entry of acceptedEntries) {
    for (const key of entry.keys) {
      if (!rows.some((row) => row.key === key && row.kind === entry.kind)) {
        notes.push(`${repo}.${key} is ACCEPTED as ${entry.kind} but no longer drifts that way: consider removing it`);
      }
    }
  }
  return { problems, notes };
}

const presentRepos = FLEET.filter((repo) => fs.existsSync(path.join(FLEET_ROOT, repo)));

function fleetSkipReason() {
  if (process.env.AOFORGE_SKIP_FLEET_HARNESS === '1') return 'AOFORGE_SKIP_FLEET_HARNESS=1';
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

      if (skipped.length) t.diagnostic(`${repo}: HAND_ONLY keys skipped: ${skipped.join(', ')}`);

      // 12 and 13: a conflict outside ACCEPTED is new drift; an OPEN key that no longer drifts is closed.
      const { problems, notes } = assess(repo, rows, { accepted: ACCEPTED, open: OPEN });
      for (const note of notes) t.diagnostic(note);

      assert.equal(problems.length, 0, `${repo}:\n  ${problems.join('\n  ')}`);

      // 17: the 71-01 self-test rule holds on the real fleet. Removing a more-specific row from ACCEPTED guards
      // nothing (only conflicts fail), so this is what fails when a draft fills a key with a self-test step.
      assert.deepEqual(
        selfTestDrafts({ commands: draft.commands, evidence: init.evidence }),
        [],
        `${repo}: a drafted self-test sits beside its gate`,
      );
    });
  }
});

describe('fleet tables (TRD 43-08 guards)', () => {
  test('FLEET is the 33 unique repo names', () => {
    assert.equal(FLEET.length, 33);
    assert.equal(new Set(FLEET).size, 33);
  });

  test('the module exports exactly FLEET, ACCEPTED and OPEN: KNOWN_DRIFT is gone and there is no third table', () => {
    assert.deepEqual(Object.keys(tables).sort(), ['ACCEPTED', 'FLEET', 'OPEN']);
    assert.equal(tables.KNOWN_DRIFT, undefined, 'KNOWN_DRIFT was retired by TRD 43-15');
  });

  // The user-accepted rows, pinned: ACCEPTED grows only by a user decision, and this list is where that shows.
  // 43-15 (`accept-all`, 2026-10-03) added every row after devcluster's two. 71-02 removed aodex.audit: the 71-01
  // self-test rule drafts the gate step, so the row that excused the self-test pick describes a draft that is gone.
  const ACCEPTED_ROWS = [
    'EdenDocs.deps', 'ao-terminal.deps', 'aocore.test', 'aodex.lint', 'aofamily.build', 'aofamily.deps',
    'aofamily.lint', 'devcluster.lint', 'devcluster.test', 'eden-biz.e2e', 'justinforme.e2e', 'politihub.lint',
  ];

  test('ACCEPTED is exactly the user-accepted rows, each with kind, reason, date and by: user; HAND_ONLY keys are imported, not copied', () => {
    const rows = [];
    for (const [repo, entries] of Object.entries(ACCEPTED)) {
      assert.ok(FLEET.includes(repo), `ACCEPTED.${repo} is not a FLEET repo`);
      assert.ok(Array.isArray(entries) && entries.length > 0, `ACCEPTED.${repo} must be a non-empty list of entries`);
      const seen = new Set();
      for (const entry of entries) {
        const id = `ACCEPTED.${repo} [${(entry.keys || []).join(', ')}]`;
        assert.ok(Array.isArray(entry.keys) && entry.keys.length > 0 && entry.keys.every((k) => typeof k === 'string' && k), `${id}: keys`);
        assert.ok(entry.kind === 'conflict' || entry.kind === 'more_specific', `${id}: kind must be conflict or more_specific`);
        assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0, `${id}: reason`);
        assert.ok(typeof entry.decided === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.decided), `${id}: decided must be YYYY-MM-DD`);
        assert.equal(entry.by, 'user', `${id}: every ACCEPTED entry is a user decision (by: 'user')`);
        for (const key of entry.keys) {
          assert.ok(!seen.has(`${key}/${entry.kind}`), `${id}: ${key} is listed twice as ${entry.kind} for ${repo}`);
          seen.add(`${key}/${entry.kind}`);
          assert.ok(!(HAND_ONLY[repo] || []).includes(key), `${id}: ${key} is already HAND_ONLY`);
          rows.push(`${repo}.${key}`);
        }
      }
    }
    assert.deepEqual([...new Set(rows)].sort(), [...ACCEPTED_ROWS].sort());
    // The shape names of HAND_ONLY are repo names.
    for (const repo of Object.keys(HAND_ONLY)) assert.ok(FLEET.includes(repo), `HAND_ONLY.${repo} is not a FLEET repo`);
  });

  test('every OPEN entry has keys and a reason, names a FLEET repo, and is neither ACCEPTED nor HAND_ONLY', (t) => {
    let count = 0;
    for (const [repo, entries] of Object.entries(OPEN)) {
      assert.ok(FLEET.includes(repo), `OPEN.${repo} is not a FLEET repo`);
      assert.ok(Array.isArray(entries) && entries.length > 0, `OPEN.${repo} must be a non-empty list of entries`);
      const seen = new Set();
      for (const entry of entries) {
        const id = `OPEN.${repo} [${(entry.keys || []).join(', ')}]`;
        assert.ok(Array.isArray(entry.keys) && entry.keys.length > 0 && entry.keys.every((k) => typeof k === 'string' && k), `${id}: keys`);
        assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0, `${id}: reason`);
        // 71-02: `pending` is optional and has one value. A refresh-pending row says what the draft is and what the
        // committed file still holds, so the follow-up commit in the repo can be made without re-deriving either.
        if (entry.pending !== undefined) {
          assert.equal(entry.pending, 'refresh', `${id}: pending must be 'refresh' when present`);
          assert.match(entry.reason, /draft/, `${id}: a refresh-pending reason names the draft`);
          assert.match(entry.reason, /committed/, `${id}: a refresh-pending reason names the committed value`);
        }
        for (const key of entry.keys) {
          count += 1;
          assert.ok(!seen.has(key), `${id}: ${key} is listed twice for ${repo}`);
          seen.add(key);
          const accepted = (ACCEPTED[repo] || []).flatMap((a) => a.keys);
          assert.ok(!accepted.includes(key), `${id}: ${key} is already ACCEPTED`);
          assert.ok(!(HAND_ONLY[repo] || []).includes(key), `${id}: ${key} is already HAND_ONLY`);
        }
      }
    }
    t.diagnostic(`OPEN rows for the verifier: ${count}${count ? ` (${Object.keys(OPEN).join(', ')})` : ''}`);
  });
});

describe('assess: the harness classification, on synthetic tables (TRD 43-15)', () => {
  const conflict = (key) => ({ key, kind: 'conflict', committed: 'a', draft: 'b' });
  const specific = (key) => ({ key, kind: 'more_specific', committed: 'discover', draft: 'b' });
  const acc = (kind, keys) => ({ r: [{ keys, kind, reason: 'why', decided: '2026-10-03', by: 'user' }] });

  test('a conflict outside ACCEPTED and OPEN is a problem; a more-specific row is only a note', () => {
    const { problems, notes } = assess('r', [conflict('test'), specific('lint')], {});
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^new conflict: test/);
    assert.equal(notes.length, 1);
    assert.match(notes[0], /more specific: lint/);
  });

  test('an ACCEPTED row is tolerated only as the kind that was accepted', () => {
    const accepted = acc('more_specific', ['lint']);
    assert.deepEqual(assess('r', [specific('lint')], { accepted }).problems, []);
    // The accepted more-specific row turning into a conflict is new drift.
    const turned = assess('r', [conflict('lint')], { accepted });
    assert.equal(turned.problems.length, 1);
    assert.match(turned.problems[0], /^new conflict: lint/);
    // An accepted conflict is tolerated, and an accepted conflict that became more-specific is merely noted.
    const acceptedConflict = acc('conflict', ['test']);
    assert.deepEqual(assess('r', [conflict('test')], { accepted: acceptedConflict }).problems, []);
    const closed = assess('r', [specific('test')], { accepted: acceptedConflict });
    assert.deepEqual(closed.problems, []);
    assert.ok(closed.notes.some((n) => /ACCEPTED as conflict but no longer drifts that way/.test(n)));
  });

  test('an OPEN key is reported, not failed, while it drifts in either kind', () => {
    const open = { r: [{ keys: ['test', 'lint'], reason: 'no rule yet' }] };
    const { problems, notes } = assess('r', [conflict('test'), specific('lint')], { open });
    assert.deepEqual(problems, []);
    assert.equal(notes.filter((n) => /OPEN/.test(n)).length, 2);
  });

  test('the OPEN ratchet: a key that no longer drifts fails with "remove it"', () => {
    const open = { r: [{ keys: ['test'], reason: 'no rule yet' }] };
    const { problems } = assess('r', [], { open });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /r\.test no longer drifts: remove it from OPEN/);
  });

  test('tables of other repos do not leak into this repo', () => {
    const accepted = { other: [{ keys: ['test'], kind: 'conflict', reason: 'why', decided: '2026-10-03', by: 'user' }] };
    assert.equal(assess('r', [conflict('test')], { accepted }).problems.length, 1);
  });

  // TRD 71-02 (SDR-09): a drafter rule closed the gap, the repo's committed STACK.md predates it, and refreshing
  // that file is a commit in the repo. The row is a follow-up, not a drafter gap.
  test('13: an OPEN `pending: refresh` row is reported as refresh pending while it drifts, never failed', () => {
    const open = { r: [{ keys: ['lint'], pending: 'refresh', reason: 'draft `make lint` vs committed `go vet ./...`' }] };
    const { problems, notes } = assess('r', [conflict('lint')], { open });
    assert.deepEqual(problems, []);
    assert.equal(notes.length, 1);
    assert.match(notes[0], /refresh pending/);
    assert.match(notes[0], /lint: committed/);
    // A plain OPEN row keeps its own wording.
    const plain = assess('r', [conflict('lint')], { open: { r: [{ keys: ['lint'], reason: 'no rule yet' }] } });
    assert.equal(plain.notes.length, 1);
    assert.doesNotMatch(plain.notes[0], /refresh pending/);
  });

  test('14: a refresh-pending OPEN row that stops drifting fails with "remove it" (the ratchet is unchanged)', () => {
    const open = { r: [{ keys: ['lint'], pending: 'refresh', reason: 'draft `make lint` vs committed `go vet ./...`' }] };
    const { problems } = assess('r', [], { open });
    assert.deepEqual(problems, ['r.lint no longer drifts: remove it from OPEN']);
  });
});

describe('selfTestDrafts: a drafted self-test beside its gate (TRD 71-01 guard, TRD 71-02)', () => {
  const GATE = 'bash scripts/gate.sh';
  const gateItem = (over = {}) => ({ key: 'audit', command: GATE, cwd: 'go', ...over });
  const draft = (run, cwd = 'go') => ({ audit: { run, cwd } });

  test('8: a drafted self-test argument beside a same-key, same-cwd gate item is a finding', () => {
    const run = `${GATE} --self-test`;
    assert.deepEqual(
      selfTestDrafts({ commands: draft(run), evidence: [gateItem({ command: run }), gateItem()] }),
      [{ key: 'audit', run, gate: GATE }],
    );
  });

  test('9: a lone self-test, with no gate item in the evidence, is allowed', () => {
    const run = `${GATE} --self-test`;
    assert.deepEqual(selfTestDrafts({ commands: draft(run), evidence: [gateItem({ command: run })] }), []);
    assert.deepEqual(selfTestDrafts({ commands: draft(run), evidence: [] }), []);
  });

  test('10: a gate item at another cwd, or for another key, is not the gate', () => {
    const run = `${GATE} --self-test`;
    assert.deepEqual(selfTestDrafts({ commands: draft(run), evidence: [gateItem({ cwd: 'other' })] }), []);
    assert.deepEqual(selfTestDrafts({ commands: draft(run), evidence: [gateItem({ cwd: undefined })] }), []);
    assert.deepEqual(selfTestDrafts({ commands: draft(run), evidence: [gateItem({ key: 'lint' })] }), []);
    // null, '' and a missing cwd are all the repo root, and `./go/` is `go`.
    assert.equal(selfTestDrafts({ commands: draft(run, null), evidence: [gateItem({ cwd: '' })] }).length, 1);
    assert.equal(selfTestDrafts({ commands: { audit: { run } }, evidence: [gateItem({ cwd: null })] }).length, 1);
    assert.equal(selfTestDrafts({ commands: draft(run, './go/'), evidence: [gateItem()] }).length, 1);
  });

  test('11: --selftest, --self-test=x, --selftest-<case> and a bare `selftest` after the script are self-test arguments', () => {
    for (const marker of ['--selftest', '--self-test', '--self-test=x', '--selftest-no-divergence', 'selftest', '-self-test']) {
      const run = `${GATE} ${marker}`;
      assert.deepEqual(
        selfTestDrafts({ commands: draft(run), evidence: [gateItem()] }),
        [{ key: 'audit', run, gate: GATE }],
        marker,
      );
    }
    // A marker among other arguments: the gate is the run without just that word.
    const mixed = `${GATE} --fixture f.json --self-test`;
    assert.deepEqual(
      selfTestDrafts({ commands: draft(mixed), evidence: [gateItem({ command: `${GATE} --fixture f.json` })] }),
      [{ key: 'audit', run: mixed, gate: `${GATE} --fixture f.json` }],
    );
  });

  test('11: the script name and a runner target named selftest are entry points, not self-test arguments', () => {
    // Each pairs the run with an item for the run minus that word, so counting the word would be a finding.
    const shape = (run, base) => selfTestDrafts({ commands: draft(run), evidence: [{ key: 'audit', command: base, cwd: 'go' }] });
    assert.deepEqual(shape('bash t0/selftest.sh', 'bash'), []);
    assert.deepEqual(shape('bash selftest', 'bash'), []);
    assert.deepEqual(shape('make selftest', 'make'), []);
    assert.deepEqual(shape('just self-test', 'just'), []);
    // A word the evidence names as the item's target is never a self-test argument.
    const named = selfTestDrafts({
      commands: draft('./run.sh selftest'),
      evidence: [
        { key: 'audit', command: './run.sh selftest', cwd: 'go', target: { name: 'selftest' } },
        { key: 'audit', command: './run.sh', cwd: 'go' },
      ],
    });
    assert.deepEqual(named, []);
  });

  test('12: odd shapes never throw and find nothing', () => {
    const evidence = [gateItem()];
    // A bare string is the run (as in the drift comparison); a lone one has no gate.
    assert.deepEqual(selfTestDrafts({ commands: { audit: `${GATE} --self-test` }, evidence: [] }), []);
    for (const run of ['discover', 'none', '', undefined, null, 5]) {
      assert.deepEqual(selfTestDrafts({ commands: { audit: { run, cwd: 'go' } }, evidence }), [], String(run));
    }
    assert.deepEqual(selfTestDrafts({ commands: { audit: null }, evidence }), []);
    assert.deepEqual(selfTestDrafts({ commands: { audit: [] }, evidence }), []);
    assert.deepEqual(selfTestDrafts({ evidence }), []);
    assert.deepEqual(selfTestDrafts({ commands: draft(`${GATE} --self-test`) }), []);
    assert.deepEqual(selfTestDrafts({ commands: draft(`${GATE} --self-test`), evidence: [null, 'x', {}, { key: 'audit' }] }), []);
    assert.deepEqual(selfTestDrafts({}), []);
    assert.deepEqual(selfTestDrafts(), []);
  });
});
