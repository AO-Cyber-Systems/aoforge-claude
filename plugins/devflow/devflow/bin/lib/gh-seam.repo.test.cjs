'use strict';

// gh-seam.repo.test.cjs (TRD 46-08) — repo guard for objective 46's single GitHub seam.
//
// Static checks over the GitHub-facing modules:
//   17. only gh-client.cjs spawns `gh`; the others reach it through ghRead/ghWrite (the only `runGh(`
//       left outside gh-client are the two forwarding wrappers in gh.cjs), and gh.cjs spawns nothing.
//   18. no `parseInt(` of a directory prefix / objective id (`parseInt("02.1")` is 2 — defect 3).
//   19. gen-1 helpers are gone; readMappingV2/writeMappingV2 survive for importers and speak v3.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GUARDED = [
  'gh.cjs', 'gh-pull.cjs', 'gh-issue.cjs', 'gh-project.cjs', 'gh-mapping.cjs', 'gh-body.cjs',
  'gh-milestone.cjs', 'sync-state.cjs', 'conflict.cjs', 'awareness.cjs',
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
});
