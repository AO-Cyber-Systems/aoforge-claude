'use strict';

// gh-seam.repo.test.cjs (TRD 46-08) — repo guard for objective 46's single GitHub seam.
//
// Static checks over the GitHub-facing modules:
//   17. only gh-client.cjs spawns `gh`; the others reach it through ghRead/ghWrite (the only `runGh(`
//       left outside gh-client are the two forwarding wrappers in gh.cjs), and gh.cjs spawns nothing.
//   18. no `parseInt(` of a directory prefix / objective id (`parseInt("02.1")` is 2 — defect 3).
//   19. gen-1 helpers are gone; readMappingV2/writeMappingV2 survive for importers and speak v3.
// TRD 47-12 extends the guard to the store modules:
//   20. `git` is spawned only at two named sites: gh-wiki.cjs (the store) and awareness.cjs (older, local).
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
  'planning-import.cjs', 'planning-verbs-cli.cjs', 'planning-drift.cjs', 'planning-audit.cjs',
];

const GUARDED = [
  'gh.cjs', 'gh-pull.cjs', 'gh-issue.cjs', 'gh-project.cjs', 'gh-mapping.cjs', 'gh-body.cjs',
  'gh-milestone.cjs', 'sync-state.cjs', 'conflict.cjs', 'awareness.cjs',
  // objective 47 store modules (TRD 47-12)
  'gh-trd.cjs', 'gh-capability.cjs', 'gh-outbox.cjs', 'gh-outbox-flush.cjs', 'gh-hierarchy.cjs',
  'gh-comments.cjs', 'gh-wiki.cjs', 'gh-cache.cjs',
  // the command surface over the store (TRD 47-11), guarded since TRD 47-13
  'gh-store-cli.cjs',
  // objective 48 planning modules and their CLI (guarded since TRD 48-15): none spawns gh or git
  ...PLANNING_MODULES,
  'trd-bulk.cjs',
  // native milestones (48-05): it calls ghWrite directly (D-05), so it is guarded but not in NO_DIRECT_WRITE
  'gh-milestone-store.cjs',
];

// The store modules that must never write to GitHub themselves; `gh-outbox-flush` is the one writer.
const NO_DIRECT_WRITE = [
  'gh-hierarchy.cjs', 'gh-comments.cjs', 'gh-cache.cjs', 'gh-capability.cjs', 'gh-trd.cjs', 'gh-outbox.cjs', 'gh-wiki.cjs', 'gh-store-cli.cjs',
  ...PLANNING_MODULES,
];

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

  test('20: git is spawned only at the two named sites: gh-wiki.cjs (the store) and awareness.cjs (a pre-existing local scan)', () => {
    // The exceptions are named, not pattern-matched: a new module that spawns git fails this test.
    const GIT_SITES = new Map([
      ['gh-wiki.cjs', 'the wiki / docs store: the one git seam of objective 47'],
      ['awareness.cjs', 'pre-existing (objective 6) local branch scan; not a GitHub store module'],
    ]);
    const gitSpawn = /spawnSync\(\s*['"]git['"]|execFileSync\(\s*['"]git['"]|spawn\(\s*['"]git['"]|execSync\(\s*['"`]git\b/;
    const hits = offending(gitSpawn).filter((h) => !GIT_SITES.has(h.slice(0, h.indexOf(':'))));
    assert.deepStrictEqual(hits, [], `git spawned outside the named sites:\n${hits.join('\n')}`);
    for (const f of GIT_SITES.keys()) assert.match(read(f), /spawnSync\('git'/, `${f} is a git spawn site (stale exception otherwise)`);
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
});
