'use strict';

// TRD 46-02 — gh-mapping.cjs (GSF-01): one objective id, one mapping shape (v3).
//
// Hermetic: every project is a hand-built temp directory (fs.mkdtempSync). Nothing here touches this
// repository's .planning/, the real ~/.claude, the network or `gh`.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ghMapping = require('./gh-mapping.cjs');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-mapping-'));
  cleanup.push(root);
  fs.mkdirSync(path.join(root, '.planning', 'objectives'), { recursive: true });
  return root;
}

function writeRel(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function objectiveMd(name, githubIssue) {
  const lines = ['---', `objective: ${name}`];
  if (githubIssue !== undefined) lines.push(`github_issue: ${githubIssue}`);
  lines.push('---', '', `# Objective ${name}`, '');
  return lines.join('\n');
}

// Dirs 02-a, 02.1-foo, 03-b exist; ROADMAP also lists 10 (no dir yet). Decoy entries under
// objectives/ (a stray file and a non-numeric dir) must never surface as objectives.
function makeIndexedProject() {
  const root = tmpProject();
  writeRel(root, '.planning/ROADMAP.md', [
    '# Roadmap', '',
    '### Objective 2: a', '**Goal:** a', '',
    '### Objective 2.1: foo', '**Goal:** foo', '',
    '### Objective 3: b', '**Goal:** b', '',
    '### Objective 10: z', '**Goal:** z', '',
  ].join('\n'));
  writeRel(root, '.planning/objectives/02-a/OBJECTIVE.md', objectiveMd('02-a', 'o/r#30'));
  writeRel(root, '.planning/objectives/02.1-foo/OBJECTIVE.md', objectiveMd('02.1-foo', 'o/r#31'));
  writeRel(root, '.planning/objectives/03-b/OBJECTIVE.md', objectiveMd('03-b'));
  writeRel(root, '.planning/objectives/.gitkeep', '');
  writeRel(root, '.planning/objectives/scratch/notes.md', 'not an objective\n');
  return root;
}

describe('gh-mapping: objective identity', () => {
  // ─── 1. toObjectiveId table ─────────────────────────────────────────────────

  test('1. toObjectiveId maps every spelling of an objective to ONE canonical id', () => {
    const table = [
      ['46', '46'],
      ['046', '46'],
      ['46-github-sync-foundations', '46'],
      ['2.1', '2.1'],
      ['02.1-foo', '2.1'],
      ['0', '0'],
      ['00-refine-defaults-table', '0'],
      ['  7 ', '7'],
      [46, '46'],
      [2.1, '2.1'],
      ['abc', null],
      ['', null],
      [null, null],
      [undefined, null],
    ];
    for (const [input, expected] of table) {
      assert.equal(ghMapping.toObjectiveId(input), expected, `toObjectiveId(${JSON.stringify(input)})`);
    }
  });

  test('1b. toObjectiveId keeps a decimal part verbatim and rejects malformed numbers', () => {
    assert.equal(ghMapping.toObjectiveId('02.10'), '2.10', '2.10 is the tenth insert, not 2.1');
    assert.equal(ghMapping.toObjectiveId('2.'), null);
    assert.equal(ghMapping.toObjectiveId('2.1.3'), null);
    assert.equal(ghMapping.toObjectiveId('-3'), null);
    assert.equal(ghMapping.toObjectiveId('v46'), null);
  });

  test('1c. a TRD id reads as its objective (trds keys are out of scope for objective ids)', () => {
    // Documented gotcha: "46-02" is objective 46 with slug "02". Objective 47 owns the trds map.
    assert.equal(ghMapping.toObjectiveId('46-02'), '46');
  });

  // ─── 2. resolveObjective ────────────────────────────────────────────────────

  test('2. resolveObjective resolves a number, a padded number and a dir name to the same objective', () => {
    const root = makeIndexedProject();
    const want = { id: '2.1', dir: '02.1-foo', roadmapNumber: '2.1' };
    assert.deepEqual(ghMapping.resolveObjective(root, '02.1'), want);
    assert.deepEqual(ghMapping.resolveObjective(root, '2.1'), want);
    assert.deepEqual(ghMapping.resolveObjective(root, '02.1-foo'), want);
    assert.deepEqual(ghMapping.resolveObjective(root, 2), { id: '2', dir: '02-a', roadmapNumber: '2' });
  });

  test('2b. a ROADMAP-only objective resolves with dir null; an unknown objective resolves to null', () => {
    const root = makeIndexedProject();
    assert.deepEqual(ghMapping.resolveObjective(root, '10'), { id: '10', dir: null, roadmapNumber: '10' });
    assert.equal(ghMapping.resolveObjective(root, '99'), null);
    assert.equal(ghMapping.resolveObjective(root, 'scratch'), null);
    assert.equal(ghMapping.resolveObjective(root, ''), null);
    assert.equal(ghMapping.resolveObjective(root, null), null);
  });

  test('2c. a dir-only objective (not in ROADMAP) still resolves, roadmapNumber falls back to its id', () => {
    const root = tmpProject();
    writeRel(root, '.planning/objectives/07-solo/OBJECTIVE.md', objectiveMd('07-solo'));
    assert.deepEqual(ghMapping.resolveObjective(root, '7'), { id: '7', dir: '07-solo', roadmapNumber: '7' });
  });

  // ─── 3. listObjectiveIndex ──────────────────────────────────────────────────

  test('3. listObjectiveIndex is numerically sorted and reads github_issue from OBJECTIVE.md', () => {
    const root = makeIndexedProject();
    assert.deepEqual(ghMapping.listObjectiveIndex(root), [
      { id: '2', dir: '02-a', roadmapNumber: '2', github_issue: 'o/r#30' },
      { id: '2.1', dir: '02.1-foo', roadmapNumber: '2.1', github_issue: 'o/r#31' },
      { id: '3', dir: '03-b', roadmapNumber: '3', github_issue: null },
      { id: '10', dir: null, roadmapNumber: '10', github_issue: null },
    ]);
  });

  test('3b. an empty github_issue field is null, never an object', () => {
    const root = tmpProject();
    // extractFrontmatter turns a bare `github_issue:` into {} — the index must not leak that.
    writeRel(root, '.planning/objectives/04-x/OBJECTIVE.md', '---\nobjective: 04-x\ngithub_issue:\n---\n\n# x\n');
    const [entry] = ghMapping.listObjectiveIndex(root);
    assert.equal(entry.id, '4');
    assert.equal(entry.github_issue, null);
  });

  test('3c. sort is numeric on both parts (2, 2.1, 2.2, 2.10, 9, 10, 100)', () => {
    const root = tmpProject();
    const names = ['100-h', '10-g', '09-f', '02.10-e', '02.2-d', '02.1-c', '02-b'];
    for (const n of names) writeRel(root, `.planning/objectives/${n}/OBJECTIVE.md`, objectiveMd(n));
    assert.deepEqual(
      ghMapping.listObjectiveIndex(root).map((e) => e.id),
      ['2', '2.1', '2.2', '2.10', '9', '10', '100'],
    );
  });

  test('3d. no .planning at all → empty index, no throw', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-mapping-'));
    cleanup.push(root);
    assert.deepEqual(ghMapping.listObjectiveIndex(root), []);
    assert.equal(ghMapping.resolveObjective(root, '1'), null);
  });
});

// ─── Task 2: pure conversion, sync-state keys, reader/writer ──────────────────

// Index entries as listObjectiveIndex returns them — passed straight in, because migrateMapping is pure.
const INDEX = [
  { id: '2', dir: '02-a', roadmapNumber: '2', github_issue: 'o/r#30' },
  { id: '2.1', dir: '02.1-foo', roadmapNumber: '2.1', github_issue: 'o/r#31' },
  { id: '3', dir: '03-b', roadmapNumber: '3', github_issue: null },
];

const ent = (issue_id, state_comment_id = null, verified_at = null) => ({ issue_id, state_comment_id, verified_at });

// This repository's real v2 mapping, hand-copied.
const REAL_V2 = { milestone_id: null, objectives: { 0: { issue_id: 20, state_comment_id: 4374249280 } } };

// Fixtures 4-9 as [name, raw, index] so idempotency (test 10) can loop over them.
const FIXTURES = [
  ['4 v1 numbers', { milestone_id: 5, objectives: { 2: 11 } }, []],
  ['5 real v2', REAL_V2, []],
  ['6 mixed', { milestone_id: null, objectives: { 1: 7, 2: { issue_id: 8, state_comment_id: 99 }, 3: { issue_id: 9 } } }, []],
  ['7 dir-name and padded keys', { objectives: { '02.1-foo': 31, '046': { issue_id: 50, state_comment_id: 5 } } }, []],
  ['8 collapsed key repaired', { objectives: { 2: { issue_id: 31, state_comment_id: null } } }, INDEX],
  ['8b collapsed key, no frontmatter hit', { objectives: { 2: { issue_id: 77, state_comment_id: null } } }, INDEX],
  ['9 collision', { objectives: { '02-a': 11, 2: 12 } }, []],
  ['9b same issue twice', { objectives: { '02-a': 11, 2: { issue_id: 11, state_comment_id: 55 } } }, []],
];

describe('gh-mapping: migrateMapping (pure v1/v2 -> v3)', () => {
  test('4. v1 numbers become v3 entries; a bare milestone_id is dropped and noted', () => {
    const r = ghMapping.migrateMapping({ milestone_id: 5, objectives: { 2: 11 } }, []);
    assert.equal(r.error, undefined);
    assert.equal(r.changed, true);
    assert.deepEqual(r.mapping, { version: 3, milestones: {}, objectives: { 2: ent(11) }, trds: {} });
    assert.ok(r.notes.some((n) => /milestone_id/.test(n)), `notes mention milestone_id: ${JSON.stringify(r.notes)}`);
    assert.deepEqual(r.conflicts, {});
  });

  test('5. this repository\'s real v2 file converts to objectives["0"] without loss', () => {
    const r = ghMapping.migrateMapping(REAL_V2, []);
    assert.deepEqual(r.mapping.objectives['0'], { issue_id: 20, state_comment_id: 4374249280, verified_at: null });
    assert.equal(r.mapping.version, 3);
    assert.deepEqual(r.mapping.milestones, {});
    assert.equal(r.notes.some((n) => /milestone_id/.test(n)), false, 'a null milestone_id needs no note');
  });

  test('6. mixed v1/v2 entries land in ONE shape; no bare number, no [object Object]', () => {
    const r = ghMapping.migrateMapping(FIXTURES[2][1], []);
    assert.deepEqual(r.mapping.objectives, { 1: ent(7), 2: ent(8, 99), 3: ent(9) });
    for (const v of Object.values(r.mapping.objectives)) {
      assert.equal(typeof v, 'object');
      assert.equal(typeof v.issue_id, 'number');
    }
    assert.ok(!JSON.stringify(r.mapping).includes('[object Object]'));
  });

  test('7. a dir-name key and a padded key are re-keyed to their canonical ids', () => {
    const r = ghMapping.migrateMapping(FIXTURES[3][1], []);
    assert.deepEqual(r.mapping.objectives, { '2.1': ent(31), 46: ent(50, 5) });
    assert.equal(r.mapping.objectives['02.1-foo'], undefined);
    assert.equal(r.mapping.objectives['046'], undefined);
  });

  test('8. a parseInt-collapsed key is re-keyed only when an OBJECTIVE.md github_issue names that issue', () => {
    const hit = ghMapping.migrateMapping({ objectives: { 2: { issue_id: 31, state_comment_id: null } } }, INDEX);
    assert.deepEqual(hit.mapping.objectives, { '2.1': ent(31) });
    assert.ok(hit.notes.some((n) => /2\.1/.test(n)), 'the re-key is noted');

    const miss = ghMapping.migrateMapping({ objectives: { 2: { issue_id: 77, state_comment_id: null } } }, INDEX);
    assert.deepEqual(miss.mapping.objectives, { 2: ent(77) }, 'no frontmatter hit: stays "2", verified_at null');
  });

  test('8b. the repair never guesses: own-id match, ambiguity and a different integer part all keep the key', () => {
    // Objective 2 itself owns #30 -> the key is already right.
    const own = ghMapping.migrateMapping({ objectives: { 2: { issue_id: 30 } } }, INDEX);
    assert.deepEqual(own.mapping.objectives, { 2: ent(30) });

    // Two decimals claim #40 -> ambiguous, keep "2".
    const ambiguous = [
      { id: '2.1', dir: null, roadmapNumber: '2.1', github_issue: 'o/r#40' },
      { id: '2.2', dir: null, roadmapNumber: '2.2', github_issue: 'o/r#40' },
    ];
    const amb = ghMapping.migrateMapping({ objectives: { 2: { issue_id: 40 } } }, ambiguous);
    assert.deepEqual(amb.mapping.objectives, { 2: ent(40) });

    // #31 belongs to 2.1, but the key is "5": a parseInt collapse only ever loses the decimal part.
    const other = ghMapping.migrateMapping({ objectives: { 5: { issue_id: 31 } } }, INDEX);
    assert.deepEqual(other.mapping.objectives, { 5: ent(31) });
  });

  test('8c. the index also matches a URL or bare-number github_issue', () => {
    const idx = [
      { id: '2.1', dir: null, roadmapNumber: '2.1', github_issue: 'https://github.com/o/r/issues/31' },
      { id: '4.1', dir: null, roadmapNumber: '4.1', github_issue: '44' },
    ];
    const r = ghMapping.migrateMapping({ objectives: { 2: { issue_id: 31 }, 4: { issue_id: 44 } } }, idx);
    assert.deepEqual(r.mapping.objectives, { '2.1': ent(31), '4.1': ent(44) });
  });

  test('9. two legacy keys on one id with different issues go to conflicts and out of objectives', () => {
    const r = ghMapping.migrateMapping({ objectives: { '02-a': 11, 2: 12 } }, []);
    assert.equal(r.mapping.objectives['2'], undefined);
    assert.deepEqual(r.conflicts, {
      2: [
        { legacy_key: '02-a', issue_id: 11, state_comment_id: null },
        { legacy_key: '2', issue_id: 12, state_comment_id: null },
      ],
    });
    assert.deepEqual(r.mapping.conflicts, r.conflicts, 'the conflicts block is persisted in the mapping');
  });

  test('9b. the same issue under two keys merges silently (non-null fields win)', () => {
    const r = ghMapping.migrateMapping({ objectives: { '02-a': 11, 2: { issue_id: 11, state_comment_id: 55 } } }, []);
    assert.deepEqual(r.mapping.objectives, { 2: ent(11, 55) });
    assert.deepEqual(r.conflicts, {});
    assert.equal(r.mapping.conflicts, undefined, 'no conflicts key when there are none');
  });

  test('10. idempotent: migrate(migrate(x).mapping) deep-equals migrate(x).mapping, changed false on the second run', () => {
    for (const [name, raw, index] of FIXTURES) {
      const first = ghMapping.migrateMapping(raw, index);
      assert.equal(first.error, undefined, name);
      assert.equal(first.changed, true, `${name}: a legacy input is changed by the first run`);
      const second = ghMapping.migrateMapping(first.mapping, index);
      assert.deepEqual(second.mapping, first.mapping, `${name}: second run is a no-op`);
      assert.equal(second.changed, false, `${name}: changed false on the second run`);
    }
  });

  test('10b. migrateMapping does not mutate its input', () => {
    const raw = JSON.parse(JSON.stringify(FIXTURES[3][1]));
    const before = JSON.stringify(raw);
    ghMapping.migrateMapping(raw, []);
    assert.equal(JSON.stringify(raw), before);
  });

  test('11. a version above 3 is an error, never a silent downgrade', () => {
    const r = ghMapping.migrateMapping({ version: 4, objectives: { 1: ent(1) } }, []);
    assert.match(r.error, /unsupported mapping version 4/);
    assert.equal(r.mapping, null);
    assert.equal(r.changed, false);
  });

  test('11b. null/undefined input is an empty v3 and not "changed"; a non-object is an error', () => {
    for (const raw of [null, undefined]) {
      const r = ghMapping.migrateMapping(raw, []);
      assert.deepEqual(r.mapping, { version: 3, milestones: {}, objectives: {}, trds: {} });
      assert.equal(r.changed, false);
    }
    assert.ok(ghMapping.migrateMapping([], []).error);
    assert.ok(ghMapping.migrateMapping('nope', []).error);
  });

  test('11c. repo, milestones, trds and unknown top-level fields are carried; legacy milestone_id is not', () => {
    const r = ghMapping.migrateMapping({
      version: 3, repo: 'o/r', milestones: { 'v1.4': 7 }, trds: { '46-02': { issue_id: 9 } },
      objectives: { 46: ent(123, 456) }, future_field: { a: 1 },
    }, []);
    assert.equal(r.error, undefined);
    assert.equal(r.mapping.repo, 'o/r');
    assert.deepEqual(r.mapping.milestones, { 'v1.4': 7 });
    assert.deepEqual(r.mapping.trds, { '46-02': { issue_id: 9 } });
    assert.deepEqual(r.mapping.future_field, { a: 1 });
    assert.equal(r.changed, false, 'an already-canonical v3 mapping is unchanged');
    assert.equal(ghMapping.migrateMapping({ milestone_id: 3, objectives: {} }, []).mapping.milestone_id, undefined);
  });

  test('11d. entries that cannot be used are skipped with a note, not turned into garbage', () => {
    const r = ghMapping.migrateMapping({
      objectives: { 1: ent(10), 2: { state_comment_id: 4 }, 3: 'x', 4: null, junk: 12, 5: { issue_id: '15' } },
    }, []);
    assert.deepEqual(r.mapping.objectives, { 1: ent(10), 5: ent(15) }, 'a numeric-string issue_id is coerced');
    assert.ok(r.notes.length >= 4, `each skipped entry is noted: ${JSON.stringify(r.notes)}`);
  });

  test('11e. existing conflicts in a v3 mapping survive a second pass untouched', () => {
    const v3 = {
      version: 3, milestones: {}, objectives: {}, trds: {},
      conflicts: { 2: [{ legacy_key: '02-a', issue_id: 11, state_comment_id: null }, { legacy_key: '2', issue_id: 12, state_comment_id: null }] },
    };
    const r = ghMapping.migrateMapping(v3, []);
    assert.deepEqual(r.mapping, v3);
    assert.equal(r.changed, false);
  });
});

describe('gh-mapping: normalizeSyncStateKeys', () => {
  test('12. two keys for one objective collapse to the id, keeping the newest last_synced_at', () => {
    const input = {
      version: 1,
      objectives: {
        '02-a': { last_synced_at: '2026-01-01T00:00:00Z', status: 'open' },
        2: { last_synced_at: '2026-02-01T00:00:00Z', status: 'done' },
      },
    };
    const r = ghMapping.normalizeSyncStateKeys(input);
    assert.equal(r.changed, true);
    assert.deepEqual(Object.keys(r.state.objectives), ['2']);
    assert.equal(r.state.objectives['2'].status, 'done', 'the record with the newer last_synced_at wins');
    assert.equal(r.state.version, 1, 'sync-state stays version 1');
  });

  test('12b. the newest record wins whichever key spelling it arrived under', () => {
    const r = ghMapping.normalizeSyncStateKeys({
      version: 1,
      objectives: {
        '02-a': { last_synced_at: '2026-03-01T00:00:00Z', status: 'open' },
        2: { last_synced_at: '2026-02-01T00:00:00Z', status: 'done' },
      },
    });
    assert.equal(r.state.objectives['2'].status, 'open');
  });

  test('12c. a dir-name key is renamed, a canonical state is unchanged, junk keys are kept, input is not mutated', () => {
    const renamed = ghMapping.normalizeSyncStateKeys({ version: 1, objectives: { '02.1-foo': { status: 'open' } } });
    assert.deepEqual(Object.keys(renamed.state.objectives), ['2.1']);
    assert.equal(renamed.changed, true);

    const clean = ghMapping.normalizeSyncStateKeys({ version: 1, objectives: { 2: { status: 'open' }, '2.1': { status: 'open' } } });
    assert.equal(clean.changed, false);

    const junk = ghMapping.normalizeSyncStateKeys({ version: 1, objectives: { weird: { status: 'open' } } });
    assert.deepEqual(Object.keys(junk.state.objectives), ['weird'], 'a record it cannot name is left alone');
    assert.equal(junk.changed, false);

    const input = { version: 1, objectives: { '046': { status: 'open' } } };
    const before = JSON.stringify(input);
    ghMapping.normalizeSyncStateKeys(input);
    assert.equal(JSON.stringify(input), before);
  });

  test('12d. a missing or empty state normalises to an empty version-1 state', () => {
    assert.deepEqual(ghMapping.normalizeSyncStateKeys(null), { state: { version: 1, objectives: {} }, changed: false });
    assert.deepEqual(ghMapping.normalizeSyncStateKeys({}), { state: { version: 1, objectives: {} }, changed: false });
  });
});

describe('gh-mapping: readMappingV3 / writeMappingV3', () => {
  const EMPTY_V3 = { version: 3, milestones: {}, objectives: {}, trds: {} };

  test('13. readMappingV3: missing file -> empty v3; v2 file -> v3 in memory with the file bytes unchanged', () => {
    const root = tmpProject();
    assert.deepEqual(ghMapping.readMappingV3(root), EMPTY_V3);
    assert.equal(fs.existsSync(path.join(root, '.planning', '.gh-mapping.json')), false, 'a read never creates the file');

    const v2 = JSON.stringify(REAL_V2) + '\n';
    const file = writeRel(root, '.planning/.gh-mapping.json', v2);
    const m = ghMapping.readMappingV3(root);
    assert.equal(m.version, 3);
    assert.deepEqual(m.objectives['0'], ent(20, 4374249280));
    assert.equal(fs.readFileSync(file, 'utf-8'), v2, 'reading never writes');
  });

  test('13b. readMappingV3 uses the project index to repair a parseInt-collapsed key', () => {
    const root = makeIndexedProject();
    writeRel(root, '.planning/.gh-mapping.json', JSON.stringify({ objectives: { 2: { issue_id: 31, state_comment_id: null } } }));
    assert.deepEqual(ghMapping.readMappingV3(root).objectives, { '2.1': ent(31) });
  });

  test('13c. readMappingV3WithReport surfaces warnings, conflicts and errors without throwing', () => {
    const bad = tmpProject();
    writeRel(bad, '.planning/.gh-mapping.json', '{not json');
    const r1 = ghMapping.readMappingV3WithReport(bad);
    assert.deepEqual(r1.mapping, EMPTY_V3);
    assert.deepEqual(r1.warnings, ['unparseable .gh-mapping.json']);

    const future = tmpProject();
    writeRel(future, '.planning/.gh-mapping.json', JSON.stringify({ version: 4, objectives: {} }));
    const r2 = ghMapping.readMappingV3WithReport(future);
    assert.match(r2.error, /unsupported mapping version 4/);
    assert.deepEqual(r2.mapping, EMPTY_V3);

    const dup = tmpProject();
    writeRel(dup, '.planning/.gh-mapping.json', JSON.stringify({ objectives: { '02-a': 11, 2: 12 } }));
    const r3 = ghMapping.readMappingV3WithReport(dup);
    assert.equal(r3.conflicts['2'].length, 2);
    assert.equal(r3.changed, true);
    assert.ok(Array.isArray(r3.notes));
  });

  test('14. writeMappingV3 writes numerically sorted keys, a trailing newline, and goes through tmp+rename', () => {
    const root = tmpProject();
    const m = ghMapping.emptyMapping();
    m.repo = 'o/r';
    m.objectives['10'] = ent(110);
    m.objectives['2.1'] = ent(21);
    m.objectives['2'] = ent(20);
    m.objectives['3'] = ent(30, 3);
    m.milestones['v1.4'] = 7;

    const renames = [];
    const realRename = fs.renameSync;
    fs.renameSync = (from, to) => { renames.push([from, to]); return realRename(from, to); };
    let result;
    try {
      result = ghMapping.writeMappingV3(root, m);
    } finally {
      fs.renameSync = realRename;
    }
    assert.equal(result.ok, true);

    const file = path.join(root, '.planning', '.gh-mapping.json');
    assert.deepEqual(renames.map(([, to]) => to), [file], 'exactly one rename, onto the mapping file');
    assert.notEqual(renames[0][0], file, 'from a tmp file');
    assert.equal(path.dirname(renames[0][0]), path.dirname(file), 'in the same directory (atomic on one filesystem)');
    assert.deepEqual(fs.readdirSync(path.join(root, '.planning')), ['.gh-mapping.json'], 'no tmp file left behind');

    const text = fs.readFileSync(file, 'utf-8');
    assert.ok(text.endsWith('}\n'), 'trailing newline');
    // JSON.parse would reorder integer-like keys, so the order is asserted on the text itself.
    const pos = (k) => text.indexOf(`"${k}": {`);
    assert.ok(pos('2') > -1 && pos('2') < pos('2.1') && pos('2.1') < pos('3') && pos('3') < pos('10'),
      `objectives are sorted 2, 2.1, 3, 10:\n${text}`);
    assert.deepEqual(JSON.parse(text), { ...m }, 'and the content is exactly the mapping');
    assert.ok(text.startsWith('{\n  "version": 3,\n  "repo": "o/r",\n  "milestones"'), 'canonical top-level order');
  });

  test('14b. write -> read -> write is byte-stable (the file is tracked in git)', () => {
    const root = tmpProject();
    const m = ghMapping.emptyMapping();
    m.objectives['46'] = ent(123, 456, '2026-09-30T00:00:00.000Z');
    m.objectives['2.1'] = ent(21);
    m.objectives['9'] = ent(9);
    assert.equal(ghMapping.writeMappingV3(root, m).ok, true);
    const file = path.join(root, '.planning', '.gh-mapping.json');
    const first = fs.readFileSync(file, 'utf-8');
    assert.equal(ghMapping.writeMappingV3(root, ghMapping.readMappingV3(root)).ok, true);
    assert.equal(fs.readFileSync(file, 'utf-8'), first);
  });

  test('14c. writeMappingV3 always emits conflicts last, only when non-empty, and normalises a legacy-shaped input', () => {
    const root = tmpProject();
    const r = ghMapping.writeMappingV3(root, { objectives: { '02-a': 11, 2: 12 } });
    assert.equal(r.ok, true);
    const parsed = JSON.parse(fs.readFileSync(path.join(root, '.planning', '.gh-mapping.json'), 'utf-8'));
    assert.equal(parsed.version, 3);
    assert.equal(parsed.objectives['2'], undefined);
    assert.equal(parsed.conflicts['2'].length, 2);

    const clean = tmpProject();
    ghMapping.writeMappingV3(clean, ghMapping.emptyMapping());
    assert.equal('conflicts' in JSON.parse(fs.readFileSync(path.join(clean, '.planning', '.gh-mapping.json'), 'utf-8')), false);
  });

  test('14d. writeMappingV3 refuses a mapping above version 3 and never overwrites a newer file on disk', () => {
    const root = tmpProject();
    const refused = ghMapping.writeMappingV3(root, { version: 4, objectives: {} });
    assert.equal(refused.ok, false);
    assert.match(refused.error, /version 4/);
    assert.equal(fs.existsSync(path.join(root, '.planning', '.gh-mapping.json')), false, 'nothing written');

    const newer = JSON.stringify({ version: 4, objectives: { 1: ent(1) } }) + '\n';
    const file = writeRel(root, '.planning/.gh-mapping.json', newer);
    const clobber = ghMapping.writeMappingV3(root, ghMapping.emptyMapping());
    assert.equal(clobber.ok, false);
    assert.match(clobber.error, /version 4/);
    assert.equal(fs.readFileSync(file, 'utf-8'), newer, 'the newer file is untouched');
  });

  test('14e. writeMappingV3 will not overwrite a file it cannot parse', () => {
    const root = tmpProject();
    const file = writeRel(root, '.planning/.gh-mapping.json', '{not json');
    const r = ghMapping.writeMappingV3(root, ghMapping.emptyMapping());
    assert.equal(r.ok, false);
    assert.match(r.error, /unparseable/);
    assert.equal(fs.readFileSync(file, 'utf-8'), '{not json');
  });

  test('15. getEntry / setEntry normalise the key through toObjectiveId', () => {
    const m = ghMapping.emptyMapping();
    ghMapping.setEntry(m, '02.1-foo', { issue_id: 31 });
    assert.deepEqual(m.objectives, { '2.1': ent(31) });
    assert.deepEqual(ghMapping.getEntry(m, '2.1'), ent(31));
    assert.deepEqual(ghMapping.getEntry(m, '02.1-foo'), ent(31));

    ghMapping.setEntry(m, 46, { issue_id: 123, state_comment_id: 456 });
    assert.deepEqual(ghMapping.getEntry(m, '046'), ent(123, 456));
    assert.equal(ghMapping.getEntry(m, '99'), null);
    assert.equal(ghMapping.getEntry(m, 'abc'), null);
    assert.equal(ghMapping.getEntry(m, null), null);
  });

  test('15b. setEntry merges onto the existing entry; an explicit null clears a field; issue_id is required', () => {
    const m = ghMapping.emptyMapping();
    ghMapping.setEntry(m, '46', { issue_id: 123, verified_at: '2026-09-30T00:00:00.000Z' });
    ghMapping.setEntry(m, '46', { state_comment_id: 9 });
    assert.deepEqual(m.objectives['46'], ent(123, 9, '2026-09-30T00:00:00.000Z'));
    ghMapping.setEntry(m, '46', { verified_at: null });
    assert.equal(m.objectives['46'].verified_at, null);

    assert.throws(() => ghMapping.setEntry(m, '47', { state_comment_id: 1 }), /issue_id/);
    assert.throws(() => ghMapping.setEntry(m, 'abc', { issue_id: 1 }), /unrecognised objective/);
    assert.equal(ghMapping.setEntry(m, '48', { issue_id: 8 }), m, 'returns the mapping for chaining');
  });

  test('15c. the public surface the rewire TRDs depend on is exported', () => {
    assert.equal(ghMapping.MAPPING_VERSION, 3);
    for (const fn of [
      'toObjectiveId', 'resolveObjective', 'listObjectiveIndex', 'migrateMapping', 'normalizeSyncStateKeys',
      'readMappingV3', 'readMappingV3WithReport', 'writeMappingV3', 'getEntry', 'setEntry', 'emptyMapping',
    ]) {
      assert.equal(typeof ghMapping[fn], 'function', fn);
    }
  });
});
