'use strict';

// gh-seam.repo.test.cjs (TRD 46-08) — repo guard for objective 46's single GitHub seam.
//
// Static checks over the GitHub-facing modules:
//   17. only gh-client.cjs spawns `gh`; the others reach it through ghRead/ghWrite (the only `runGh(`
//       left outside gh-client are the two forwarding wrappers in gh.cjs), and gh.cjs spawns nothing.
//   18. no `parseInt(` of a directory prefix / objective id (`parseInt("02.1")` is 2 — defect 3).
//   19. gen-1 helpers are gone; readMappingV2/writeMappingV2 survive for importers and speak v3.
// TRD 47-12 extends the guard to the store modules:
//   20. `git` is spawned only at three named sites: gh-wiki.cjs (the store), awareness.cjs (older, local) and
//       objective-branch.cjs (the objective branch / PR lifecycle, TRD 49-04; 20b pins it to one spawn and no gh).
//   21. the store modules (gh-hierarchy, gh-comments, gh-cache, gh-capability, gh-trd, gh-outbox, gh-wiki)
//       never call `ghWrite(`: every GitHub write goes through the outbox flusher.
// TRD 47-13 adds `gh-store-cli.cjs` (47-11) to GUARDED and to that list: the command layer spawns neither gh nor
// git and never writes to GitHub itself; it calls the library (flush, comments, hierarchy) that does.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Objective 48's planning modules (TRD 48-15): they reach GitHub only through the outbox, never ghWrite( or a spawn.
const PLANNING_MODULES = [
  'planning-mode.cjs', 'planning-paths.cjs', 'planning-ledger.cjs', 'planning-verbs.cjs', 'planning-entity-verbs.cjs',
  'planning-import.cjs', 'planning-verbs-cli.cjs', 'planning-drift.cjs', 'planning-audit.cjs', 'planning-drafts.cjs',
];

// objective 51 (TRD 51-08): the backfill migration lives under migrations/; guarded by its lib-relative path.
const MIGRATION_0011 = path.join('migrations', '0011-github-store-backfill.cjs');

const GUARDED = [
  'gh.cjs', 'gh-pull.cjs', 'gh-issue.cjs', 'gh-project.cjs', 'gh-mapping.cjs', 'gh-body.cjs',
  'gh-milestone.cjs', 'sync-state.cjs', 'conflict.cjs', 'awareness.cjs',
  // objective 47 store modules (TRD 47-12)
  'gh-trd.cjs', 'gh-capability.cjs', 'gh-outbox.cjs', 'gh-outbox-flush.cjs', 'gh-hierarchy.cjs',
  'gh-comments.cjs', 'gh-wiki.cjs', 'gh-cache.cjs',
  // the command surface over the store (TRD 47-11), guarded since TRD 47-13
  'gh-store-cli.cjs',
  // objective 50 (TRD 50-04): the offline store-health collector. It reads local state only: no gh, no git, no writes.
  'gh-health.cjs',
  // objective 48 planning modules and their CLI (guarded since TRD 48-15): none spawns gh or git
  ...PLANNING_MODULES,
  'trd-bulk.cjs',
  // native milestones (48-05): it calls ghWrite directly (D-05), so it is guarded but not in NO_DIRECT_WRITE
  'gh-milestone-store.cjs',
  // objective 49 (TRD 49-04): the objective-branch git seam. It spawns git (a named site, test 20) and never gh.
  'objective-branch.cjs',
  // objective 49 (TRD 49-09): the PR lifecycle. gh-pr.cjs calls ghWrite once (createLinkedBranch, synchronous and online-required),
  // so it is guarded but not in NO_DIRECT_WRITE; its CLI and the commit trailer never write or spawn anything.
  'gh-pr.cjs', 'gh-pr-cli.cjs', 'commit-trailer.cjs',
  // objective 50 (TRD 50-02): the store-mode commit gate decision. Offline by design: it calls neither gh nor git itself
  // (git is read through objective-branch.cjs) and never writes.
  'gh-gate.cjs',
  // objective 50 (TRD 50-03): the pure logic of the two required checks; takes plain data, spawns and writes nothing.
  'gh-check.cjs',
  // objective 50 (TRD 50-08): the Actions check runner. It posts commit statuses and closes stragglers through ghWrite
  // (the runner has no outbox), so it is guarded but not in NO_DIRECT_WRITE.
  'gh-check-cli.cjs',
  // objective 50 (TRD 50-09): the `gh setup` read + plan half. It reads through ghRead/ghPaginate only and spawns
  // nothing; it is guarded but not in NO_DIRECT_WRITE because TRD 50-11 adds applySetup to this module, which writes
  // through gh-client.ghWrite (the setup apply is the one direct writer of this objective, like gh-milestone-store).
  'gh-setup.cjs',
  // objective 50 (TRD 50-11): the `gh setup` command. It calls applySetup and nothing else: it neither spawns nor writes.
  'gh-setup-cli.cjs',
  // objective 51 (TRD 51-03): the backfill core. Pure: it reads local files and the journal, returns ops, and never
  // spawns gh or git, enqueues, flushes or writes to GitHub.
  'gh-backfill.cjs',
  // objective 51 (TRD 51-08): migration 0011, the backfill driver. It reaches GitHub only through the import, the outbox
  // flusher and the readers (ghRead / ghPaginate), and git only through objective-branch's runGit seam: it spawns
  // neither gh nor git and never calls ghWrite( (test 24). A path under migrations/, read relative to lib/.
  MIGRATION_0011,
];

// The store modules that must never write to GitHub themselves; `gh-outbox-flush` is the one writer.
const NO_DIRECT_WRITE = [
  'gh-hierarchy.cjs', 'gh-comments.cjs', 'gh-cache.cjs', 'gh-capability.cjs', 'gh-trd.cjs', 'gh-outbox.cjs', 'gh-wiki.cjs', 'gh-store-cli.cjs',
  'objective-branch.cjs',
  'gh-health.cjs',
  'gh-pr-cli.cjs', 'commit-trailer.cjs',
  'gh-gate.cjs',
  'gh-check.cjs',
  'gh-setup-cli.cjs',
  'gh-backfill.cjs', // objective 51 (TRD 51-03)
  MIGRATION_0011, // objective 51 (TRD 51-08)
  ...PLANNING_MODULES,
];

// The modules allowed to spawn `git`, by name, each with the reason it is allowed (test 20, 20b).
const GIT_SITES = new Map([
  ['gh-wiki.cjs', 'the wiki / docs store: the one git seam of objective 47'],
  ['awareness.cjs', 'pre-existing (objective 6) local branch scan; not a GitHub store module'],
  ['objective-branch.cjs', 'the objective branch / PR lifecycle (objective 49): fetch, switch, empty start commit, push, local cleanup'],
]);
const GIT_SPAWN = /spawnSync\(\s*['"]git['"]|execFileSync\(\s*['"]git['"]|spawn\(\s*['"]git['"]|execSync\(\s*['"`]git\b/;

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf-8');
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

// Every non-comment line of the guarded files that matches `re`, as "file:line: text".
function offending(re, allow = () => false) {
  const hits = [];
  for (const f of GUARDED) {
    read(f).split('\n').forEach((line, i) => {
      if (isComment(line) || allow(line)) return;
      if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

// The forwarding wrappers: `(...a) => client._runGh(...a)` and the exported `(...args) => _runGh(...args)`.
const FORWARDER = /\(\.\.\.(a|args)\)\s*=>\s*(client\.)?_runGh\(\.\.\.(a|args)\)/;

describe('one gh seam (TRD 46-08)', () => {
  test('17: only gh-client spawns gh; no runGh( outside the forwarding wrappers; gh.cjs spawns nothing', () => {
    const spawns = offending(/spawnSync\(\s*['"]gh['"]|execFileSync\(\s*['"]gh['"]|spawn\(\s*['"]gh['"]/);
    assert.deepStrictEqual(spawns, [], `gh spawned outside gh-client:\n${spawns.join('\n')}`);

    const runGhCalls = offending(/\brunGh\(|\b_runGh\(/, (line) => FORWARDER.test(line));
    assert.deepStrictEqual(runGhCalls, [], `runGh( outside the forwarding wrappers:\n${runGhCalls.join('\n')}`);

    const ghSpawn = read('gh.cjs').split('\n')
      .map((line, i) => `gh.cjs:${i + 1}: ${line.trim()}`)
      .filter((l) => /spawnSync|child_process/.test(l));
    assert.deepStrictEqual(ghSpawn, [], `gh.cjs must not spawn processes itself:\n${ghSpawn.join('\n')}`);

    assert.match(read('gh-client.cjs'), /spawnSync\('gh'/, 'gh-client is the one spawn site');
  });

  test('18: no parseInt( of a directory prefix or objective id', () => {
    const bad = /parseInt\([^;]*?(dir|objectiveId|split\('-'\)|match\(\/\^\(\\d\+\))/i;
    const hits = offending(bad);
    assert.deepStrictEqual(hits, [], `parseInt of an objective id / dir prefix:\n${hits.join('\n')}`);
  });

  test('19: gen-1 helpers are gone; readMappingV2/writeMappingV2 read and write v3', () => {
    const gh = require('./gh.cjs');
    for (const name of ['formatIssueBody', 'getMilestoneVersion', 'readMapping', 'writeMapping']) {
      assert.ok(!(name in gh), `gh.cjs must not export ${name}`);
    }
    const src = read('gh.cjs');
    for (const name of ['formatIssueBody', 'getMilestoneVersion', 'readMapping', 'writeMapping', 'runGh', 'getProjectName']) {
      assert.ok(!new RegExp(`function ${name}\\(`).test(src), `gh.cjs must not define ${name}`);
    }

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-seam-'));
    try {
      fs.mkdirSync(path.join(root, '.planning', 'objectives', '02-a'), { recursive: true });
      const file = path.join(root, '.planning', '.gh-mapping.json');
      fs.writeFileSync(file, JSON.stringify({ milestone_id: 4, objectives: { 2: 7 } }));
      const m = gh.readMappingV2(root);
      assert.strictEqual(m.version, 3);
      assert.strictEqual(m.objectives['2'].issue_id, 7);

      gh.writeMappingV2(root, { objectives: { 2: { issue_id: 9, state_comment_id: 11 } } });
      const disk = JSON.parse(fs.readFileSync(file, 'utf-8'));
      assert.strictEqual(disk.version, 3);
      assert.strictEqual(disk.objectives['2'].issue_id, 9);
      assert.strictEqual(disk.objectives['2'].state_comment_id, 11);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('20: git is spawned only at the three named sites: gh-wiki.cjs (the store), awareness.cjs (a pre-existing local scan) and objective-branch.cjs (the PR lifecycle)', () => {
    // The exceptions are named, not pattern-matched: a new module that spawns git fails this test.
    const hits = offending(GIT_SPAWN).filter((h) => !GIT_SITES.has(h.slice(0, h.indexOf(':'))));
    assert.deepStrictEqual(hits, [], `git spawned outside the named sites:\n${hits.join('\n')}`);
    for (const f of GIT_SITES.keys()) assert.match(read(f), /spawnSync\('git'/, `${f} is a git spawn site (stale exception otherwise)`);
  });

  test('20b (49-04): objective-branch.cjs is a named, guarded git site with one spawn, and never reaches gh', () => {
    assert.equal(GIT_SITES.size, 3);
    assert.ok(GIT_SITES.get('objective-branch.cjs').length > 0, 'named with a reason');
    assert.ok(GUARDED.includes('objective-branch.cjs'), 'guarded');
    assert.ok(NO_DIRECT_WRITE.includes('objective-branch.cjs'), 'never writes to GitHub');

    const code = read('objective-branch.cjs').split('\n').filter((l) => !isComment(l));
    assert.equal(code.filter((l) => GIT_SPAWN.test(l)).length, 1, 'exactly one git spawn site (runGit)');
    assert.equal(code.filter((l) => /spawnSync\(\s*['"]gh['"]|require\(['"]\.\/gh/.test(l)).length, 0, 'it never spawns or requires gh');
    assert.equal(code.filter((l) => /ghWrite\(|ghRead\(|runGh\(/.test(l)).length, 0, 'no GitHub calls');

    // The guard is by name: the same source under any other name is a violation.
    const source = read('objective-branch.cjs');
    const flagged = (name) => [[name, source]]
      .filter(([n, text]) => !GIT_SITES.has(n) && text.split('\n').some((l) => !isComment(l) && GIT_SPAWN.test(l)))
      .map(([n]) => n);
    assert.deepStrictEqual(flagged('objective-branch.cjs'), []);
    assert.deepStrictEqual(flagged('objective-branch-copy.cjs'), ['objective-branch-copy.cjs']);
  });

  test('21: store modules never call ghWrite( (the flusher is the only writer), and the guard lists every store module', () => {
    for (const f of ['gh-trd.cjs', 'gh-capability.cjs', 'gh-outbox.cjs', 'gh-outbox-flush.cjs', 'gh-hierarchy.cjs', 'gh-comments.cjs', 'gh-wiki.cjs', 'gh-cache.cjs', 'gh-store-cli.cjs']) {
      assert.ok(GUARDED.includes(f), `${f} is guarded`);
    }
    const hits = [];
    for (const f of NO_DIRECT_WRITE) {
      read(f).split('\n').forEach((line, i) => {
        if (!isComment(line) && /\bghWrite\(/.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepStrictEqual(hits, [], `ghWrite( outside the flusher:\n${hits.join('\n')}`);
  });

  test('22 (48-15): the planning modules are guarded and never write directly; gh-milestone-store is guarded and may', () => {
    for (const f of [...PLANNING_MODULES, 'trd-bulk.cjs', 'gh-milestone-store.cjs']) {
      assert.ok(fs.existsSync(path.join(__dirname, f)), `${f} exists (a stale guard entry otherwise)`);
      assert.ok(GUARDED.includes(f), `${f} is guarded`);
    }
    for (const f of PLANNING_MODULES) assert.ok(NO_DIRECT_WRITE.includes(f), `${f} must never call ghWrite(`);
    assert.ok(!NO_DIRECT_WRITE.includes('gh-milestone-store.cjs'), 'gh-milestone-store writes milestones directly (D-05)');
    assert.match(read('gh-milestone-store.cjs'), /client\.ghWrite\(/, 'gh-milestone-store is a direct writer (stale exception otherwise)');
    // Every planning-*.cjs library in this directory is listed: a new one cannot slip past the guard.
    const onDisk = fs.readdirSync(__dirname).filter((f) => /^planning-[a-z-]+\.cjs$/.test(f) && !/\.test\.cjs$/.test(f));
    assert.deepStrictEqual(onDisk.filter((f) => !PLANNING_MODULES.includes(f)), [], 'unguarded planning-*.cjs module');
  });

  test('23 (49-09): every gh-*.cjs module in lib is guarded (gh-client is the seam itself, held by test 17), so a new one cannot slip past', () => {
    const onDisk = fs.readdirSync(__dirname).filter((f) => /^gh-[a-z-]+\.cjs$/.test(f) && !/\.test\.cjs$/.test(f));
    assert.ok(onDisk.includes('gh-pr.cjs'), 'the scan sees the PR lifecycle module');
    const unguarded = onDisk.filter((f) => f !== 'gh-client.cjs' && !GUARDED.includes(f));
    assert.deepStrictEqual(unguarded, [], `unguarded gh-*.cjs module(s): add them to GUARDED (and NO_DIRECT_WRITE unless they write): ${unguarded.join(', ')}`);
  });

  test('23b (49-09): gh-pr.cjs is guarded and may write, but only createLinkedBranch; gh-pr-cli.cjs and commit-trailer.cjs are guarded and never write', () => {
    for (const f of ['gh-pr.cjs', 'gh-pr-cli.cjs', 'commit-trailer.cjs']) {
      assert.ok(fs.existsSync(path.join(__dirname, f)), `${f} exists (a stale guard entry otherwise)`);
      assert.ok(GUARDED.includes(f), `${f} is guarded`);
    }
    for (const f of ['gh-pr-cli.cjs', 'commit-trailer.cjs']) assert.ok(NO_DIRECT_WRITE.includes(f), `${f} must never call ghWrite(`);
    assert.ok(!NO_DIRECT_WRITE.includes('gh-pr.cjs'), 'gh-pr.cjs writes createLinkedBranch directly (decision 2)');

    const code = (f) => read(f).split('\n').filter((l) => !isComment(l));
    const writes = code('gh-pr.cjs').filter((l) => /\bghWrite\(/.test(l));
    assert.equal(writes.length, 1, `exactly one direct ghWrite( in gh-pr.cjs, got ${writes.length}`);
    assert.ok(read('gh-pr.cjs').includes('CREATE_MUTATION'), 'the one write is the createLinkedBranch mutation');
    for (const f of ['gh-pr.cjs', 'gh-pr-cli.cjs', 'commit-trailer.cjs']) {
      assert.equal(code(f).filter((l) => GIT_SPAWN.test(l) || /spawnSync\(\s*['"]gh['"]/.test(l)).length, 0, `${f} spawns neither git nor gh`);
    }
  });

  test('24 (51-03): gh-backfill.cjs is guarded, never writes to GitHub, spawns nothing and never queues or flushes', () => {
    const f = 'gh-backfill.cjs';
    assert.ok(fs.existsSync(path.join(__dirname, f)), `${f} exists (a stale guard entry otherwise)`);
    assert.ok(GUARDED.includes(f), `${f} is guarded`);
    assert.ok(NO_DIRECT_WRITE.includes(f), `${f} must never call ghWrite(`);
    const code = read(f).split('\n').filter((l) => !isComment(l));
    const bad = (re) => code.filter((l) => re.test(l));
    assert.deepStrictEqual(bad(/\bghWrite\(|\bghRead\(|\brunGh\(/), [], 'no GitHub calls');
    assert.deepStrictEqual(bad(/child_process|\bspawn(Sync)?\(|\bexecFile(Sync)?\(|\bexecSync\(/), [], 'spawns nothing (neither gh nor git)');
    assert.deepStrictEqual(bad(/\benqueue\(|\bflush\(|gh-outbox-flush/), [], 'never queues or flushes: callers own that');
  });
});

describe('migration 0011 stays behind the seams (TRD 51-08)', () => {
  test('24b (51-08): 0011 is guarded, spawns neither gh nor git (no child_process at all) and never calls ghWrite(', () => {
    assert.ok(GUARDED.includes(MIGRATION_0011) && NO_DIRECT_WRITE.includes(MIGRATION_0011), 'guarded, no direct write');
    const code = read(MIGRATION_0011).split('\n').map((line, i) => [i + 1, line]).filter(([, l]) => !isComment(l));
    const hits = (re) => code.filter(([, l]) => re.test(l)).map(([n, l]) => `${MIGRATION_0011}:${n}: ${l.trim()}`);
    assert.deepStrictEqual(hits(/child_process|spawnSync\(|execFileSync\(|execSync\(|\bspawn\(/), [], 'no process is spawned');
    assert.deepStrictEqual(hits(/\bghWrite\(|\brunGh\(|\b_runGh\(/), [], 'no direct GitHub write and no raw gh call');
  });
});
