'use strict';

// planning-paths.test.cjs — Test list (TRD 48-01, Task 2)
//
//   5. Every row of the D-02 class table: at least one positive path, asserting class, verb, and that the hint names the verb.
//   6. Edges: TRD vs notes in an objective dir; todo / debug / quick entities (open vs closed, job vs summary); a quick dir's other
//      files and legacy *-JOB.md are runtime; 47-owned bare CONTEXT/RESEARCH; dot segments anywhere are runtime.
//   7. relToPlanning: inside -> POSIX rel, outside -> null, a symlinked parent (macOS /var vs /private/var) resolves by realpath of
//      the deepest existing ancestor.
//   8. Unsafe rels (../x, absolute, NUL, backslash, empty, . or .. segments) throw TypeError.
//   9. gitignoreLines() is exactly the three U-1 lines; TRACKED_CONFIG is ['config.json', 'STACK.md'].
//  10. listByClass on a hand-built tree: four sorted lists, wiki/.git/** skipped.
//  11. The runtime dotfiles pinned by hooks/planning-writes.audit.test.js classify runtime.
//
// Literal, hand-written path tables only. Nothing here spawns anything or touches ~/.claude.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const paths = require('./planning-paths.cjs');

// ─── 5. the class table, one or more positive paths per row ──────────────────

// [rel, expectedClass, expectedVerb]
const CLASS_TABLE_ROWS = [
  // tracked-config
  ['config.json', 'tracked-config', null],
  ['STACK.md', 'tracked-config', null],
  // runtime: dot-prefixed first segment
  ['.skill-active', 'runtime', null],
  ['.trd-progress/48-01.md', 'runtime', null],
  // runtime: named files and trees
  ['state.json', 'runtime', null],
  ['STATE_ARCHIVE.md', 'runtime', null],
  ['SESSION_PICKUP.md', 'runtime', null],
  ['evidence/shot.png', 'runtime', null],
  ['evidence/a/b/maestro.xml', 'runtime', null],
  ['workstreams/x', 'runtime', null],
  ['workstreams/alpha/STATE.md', 'runtime', null],
  // generated
  ['ROADMAP.md', 'generated', 'gh pull --all'],
  ['STATE.md', 'generated', 'gh pull --all'],
  ['MILESTONES.md', 'generated', 'gh pull --all'],
  // cache: objective dir
  ['objectives/48-x/48-01-foo-TRD.md', 'cache', 'plan put-trd'],
  ['objectives/48-x/48-01-TRD.md', 'cache', 'plan put-trd'],
  ['objectives/48-x/OBJECTIVE.md', 'cache', 'objective put'],
  ['objectives/48-x/48-01-SUMMARY.md', 'cache', 'summary post'],
  ['objectives/48-x/48-VERIFICATION.md', 'cache', 'verification post'],
  ['objectives/48-x/48-CONTEXT.md', 'cache', 'doc put'],
  ['objectives/48-x/48-RESEARCH.md', 'cache', 'doc put'],
  ['objectives/48-x/48-UAT.md', 'cache', 'doc put'],
  ['objectives/48-x/48-EVIDENCE.md', 'cache', 'doc put'],
  ['objectives/42-y/42-ROLLOUT.md', 'cache', 'doc put'],
  ['objectives/42-y/42-DISCOVERY.md', 'cache', 'doc put'],
  // cache: docs
  ['PROJECT.md', 'cache', 'doc put'],
  ['REQUIREMENTS.md', 'cache', 'doc put'],
  ['codebase/STACK.md', 'cache', 'doc put'],
  ['adr/0001-store-mode.md', 'cache', 'doc put'],
  ['retros/v1.3.md', 'cache', 'doc put'],
  ['research/github-coordination-layer.md', 'cache', 'doc put'],
  ['milestones/v1.3-ROADMAP.md', 'cache', 'doc put'],
  ['wiki/Home.md', 'cache', 'doc put'],
  ['wiki/sub/page.md', 'cache', 'doc put'],
  // cache: entities
  ['todos/pending/2026-07-31-a.md', 'cache', 'todo add'],
  ['todos/completed/a.md', 'cache', 'todo add'],
  ['todos/done/a.md', 'cache', 'todo add'],
  ['debug/x.md', 'cache', 'debug put'],
  ['debug/resolved/x.md', 'cache', 'debug put'],
  ['quick/12-fix-x/12-JOB.md', 'cache', 'quick put'],
  ['quick/12-fix-x/12-SUMMARY.md', 'cache', 'quick put'],
  ['decisions/pending/DECISION-001.md', 'cache', 'decision open'],
  ['decisions/answered/DECISION-002.md', 'cache', 'decision open'],
  // runtime: anything else
  ['ADOPT-REPORT.md', 'runtime', null],
  ['STACK-REPORT.md', 'runtime', null],
  ['objectives/48-x/notes.md', 'runtime', null],
  ['objectives/42-x/42-01-foo-JOB.md', 'runtime', null],
  ['objectives/48-x/evidence/shot.png', 'runtime', null],
  ['quick/12-fix-x/DECISION-001.md', 'runtime', null],
  ['random/thing.txt', 'runtime', null],
];

describe('classify: the D-02 class table', () => {
  for (const [rel, cls, verb] of CLASS_TABLE_ROWS) {
    test(`5. ${rel} -> ${cls}${verb ? ` (${verb})` : ''}`, () => {
      const got = paths.classify(rel);
      assert.strictEqual(got.class, cls);
      assert.strictEqual(got.verb, verb);
      if (verb) {
        assert.strictEqual(typeof got.hint, 'string');
        assert.ok(got.hint.includes(verb), `hint "${got.hint}" names the verb "${verb}"`);
      } else {
        assert.strictEqual(got.hint, null);
      }
      assert.ok(paths.CLASSES.includes(got.class));
    });
  }

  test('5b. the result always has exactly the four keys', () => {
    for (const [rel] of CLASS_TABLE_ROWS) {
      assert.deepStrictEqual(Object.keys(paths.classify(rel)).sort(), ['class', 'entity', 'hint', 'verb'], rel);
    }
  });

  test('5c. every class in the table is covered and CLASSES is exactly the four classes, frozen', () => {
    assert.deepStrictEqual([...paths.CLASSES].sort(), ['cache', 'generated', 'runtime', 'tracked-config']);
    assert.ok(Object.isFrozen(paths.CLASSES));
    const seen = new Set(CLASS_TABLE_ROWS.map((r) => r[1]));
    assert.deepStrictEqual([...seen].sort(), [...paths.CLASSES].sort());
  });

  test('5d. VERB_TABLE is the deduplicated, frozen list of every verb the table names', () => {
    const expected = [...new Set(CLASS_TABLE_ROWS.map((r) => r[2]).filter(Boolean))].sort();
    assert.deepStrictEqual([...paths.VERB_TABLE].sort(), expected);
    assert.strictEqual(new Set(paths.VERB_TABLE).size, paths.VERB_TABLE.length);
    assert.ok(Object.isFrozen(paths.VERB_TABLE));
  });

  test('5e. hints carry the concrete arguments when the path names them', () => {
    assert.match(paths.classify('objectives/48-x/48-01-foo-TRD.md').hint, /plan put-trd 48 48-01-foo-TRD\.md --from/);
    assert.match(paths.classify('objectives/2.1-y/OBJECTIVE.md').hint, /objective put 2\.1 --from/);
    assert.match(paths.classify('objectives/48-x/48-01-SUMMARY.md').hint, /summary post 48-01 --from/);
    assert.match(paths.classify('objectives/48-x/48-VERIFICATION.md').hint, /verification post 48 --from/);
    assert.match(paths.classify('objectives/48-x/48-UAT.md').hint, /doc put objectives\/48-x\/48-UAT\.md --from/);
    assert.match(paths.classify('todos/pending/2026-07-31-a.md').hint, /todo complete 2026-07-31-a/);
    assert.match(paths.classify('debug/x.md').hint, /debug put x --from/);
    // `quick put` takes `<N> <slug>` (48-15's CLI); a hint without the slug suggests a call that exits 1.
    assert.match(paths.classify('quick/12-fix-x/12-JOB.md').hint, /quick put 12 fix-x --from/);
    assert.match(paths.classify('quick/12-fix-x/12-SUMMARY.md').hint, /quick summary 12 --from/);
    assert.match(paths.classify('ROADMAP.md').hint, /generated view/);
  });

  test('5f. a hint keeps its placeholder when the path does not name the argument', () => {
    assert.match(paths.classify('objectives/misc/OBJECTIVE.md').hint, /objective put <id>/);
    assert.match(paths.classify('objectives/misc/foo-SUMMARY.md').hint, /summary post <trd>/);
  });
});

// ─── 6. edges and entities ───────────────────────────────────────────────────

describe('classify: edges and entities', () => {
  test('6a. a TRD vs an arbitrary note in the same objective dir', () => {
    const trd = paths.classify('objectives/48-x/48-01-foo-TRD.md');
    assert.deepStrictEqual([trd.class, trd.verb, trd.entity], ['cache', 'plan put-trd', null]);
    const note = paths.classify('objectives/48-x/notes.md');
    assert.deepStrictEqual(note, { class: 'runtime', verb: null, hint: null, entity: null });
  });

  test('6b. todos: pending is open, completed and legacy done are closed', () => {
    assert.deepStrictEqual(paths.classify('todos/pending/a.md').entity, { role: 'todo', id: 'todo-a', state: 'open' });
    assert.deepStrictEqual(paths.classify('todos/completed/a.md').entity, { role: 'todo', id: 'todo-a', state: 'closed' });
    assert.deepStrictEqual(paths.classify('todos/done/a.md').entity, { role: 'todo', id: 'todo-a', state: 'closed' });
    assert.deepStrictEqual(paths.classify('todos/pending/2026-07-31-harden-df-tools.md').entity, {
      role: 'todo',
      id: 'todo-2026-07-31-harden-df-tools',
      state: 'open',
    });
  });

  test('6c. debug: open at the top level, closed under resolved/', () => {
    assert.deepStrictEqual(paths.classify('debug/x.md').entity, { role: 'debug', id: 'debug-x', state: 'open' });
    assert.deepStrictEqual(paths.classify('debug/resolved/x.md').entity, { role: 'debug', id: 'debug-x', state: 'closed' });
  });

  test('6d. quick: JOB and SUMMARY are parts of quick-<N>; anything else in the dir is runtime', () => {
    assert.deepStrictEqual(paths.classify('quick/12-fix-x/12-JOB.md').entity, { role: 'quick', id: 'quick-12', part: 'job' });
    assert.deepStrictEqual(paths.classify('quick/12-fix-x/12-SUMMARY.md').entity, { role: 'quick', id: 'quick-12', part: 'summary' });
    assert.deepStrictEqual(paths.classify('quick/12-fix-x/DECISION-001.md'), { class: 'runtime', verb: null, hint: null, entity: null });
    assert.strictEqual(paths.classify('quick/12-fix-x/13-JOB.md').class, 'runtime', 'the file number must match the dir');
    assert.strictEqual(paths.classify('quick/12-fix-x/sub/12-JOB.md').class, 'runtime');
    assert.strictEqual(paths.classify('quick/notes.md').class, 'runtime');
  });

  test('6e. entity ids use the lowercased stem (48-02 grammar); a stem the grammar refuses keeps the class with no entity', () => {
    assert.deepStrictEqual(paths.classify('todos/pending/Mixed-Case.md').entity, { role: 'todo', id: 'todo-mixed-case', state: 'open' });
    const bad = paths.classify('todos/pending/has space.md');
    assert.strictEqual(bad.class, 'cache');
    assert.strictEqual(bad.verb, 'todo add');
    assert.strictEqual(bad.entity, null);
  });

  test('6f. non-entity cache paths carry no entity', () => {
    for (const rel of ['PROJECT.md', 'objectives/48-x/OBJECTIVE.md', 'decisions/pending/DECISION-001.md', 'wiki/Home.md']) {
      assert.strictEqual(paths.classify(rel).entity, null, rel);
    }
  });

  test('6g. legacy *-JOB.md in an objective dir is runtime, not doc put', () => {
    assert.strictEqual(paths.classify('objectives/42-x/42-01-foo-JOB.md').class, 'runtime');
    assert.strictEqual(paths.classify('objectives/42-x/42-01-JOB.md').class, 'runtime');
  });

  test("6h. 47-owned bare CONTEXT/RESEARCH (gh-cache OWNED_OBJECTIVE_FILE_RE) are cache; other bare uppercase files are not", () => {
    assert.strictEqual(paths.classify('objectives/48-x/CONTEXT.md').verb, 'doc put');
    assert.strictEqual(paths.classify('objectives/48-x/RESEARCH.md').verb, 'doc put');
    assert.strictEqual(paths.classify('objectives/48-x/README.md').class, 'runtime');
  });

  test('6i. a lowercase suffix is not an objective doc', () => {
    assert.strictEqual(paths.classify('objectives/48-x/48-01-foo-trd.md').class, 'runtime');
    assert.strictEqual(paths.classify('objectives/48-x/48-research.md').class, 'runtime');
  });

  test('6j. a dot segment anywhere is runtime (no verb writes a wiki clone .git or an editor swap file)', () => {
    assert.strictEqual(paths.classify('wiki/.git/HEAD').class, 'runtime');
    assert.strictEqual(paths.classify('objectives/48-x/.48-01-foo-TRD.md.swp').class, 'runtime');
    assert.strictEqual(paths.classify('todos/pending/.hidden.md').class, 'runtime');
  });

  test('6k. entries nested too deep for their row are runtime', () => {
    for (const rel of ['codebase/sub/STACK.md', 'todos/pending/x/a.md', 'debug/resolved/x/y.md', 'objectives/48-x/sub/48-UAT.md', 'research/a/b.md']) {
      assert.strictEqual(paths.classify(rel).class, 'runtime', rel);
    }
  });

  test('6l. non-markdown files in markdown-only rows are runtime', () => {
    for (const rel of ['todos/pending/a.txt', 'debug/x.json', 'research/data.csv', 'objectives/48-x/48-UAT.txt']) {
      assert.strictEqual(paths.classify(rel).class, 'runtime', rel);
    }
  });
});

// ─── 7. relToPlanning ────────────────────────────────────────────────────────

describe('relToPlanning', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-paths-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('7a. inside -> POSIX rel (existing or not), outside -> null', () => {
    const planning = path.join(tmp, 'proj', '.planning');
    fs.mkdirSync(path.join(planning, 'objectives', '48-x'), { recursive: true });
    fs.writeFileSync(path.join(planning, 'STATE.md'), 'x');
    assert.strictEqual(paths.relToPlanning(path.join(planning, 'STATE.md'), planning), 'STATE.md');
    assert.strictEqual(paths.relToPlanning(path.join(planning, 'objectives', '48-x', '48-01-a-TRD.md'), planning), 'objectives/48-x/48-01-a-TRD.md');
    assert.strictEqual(paths.relToPlanning(path.join(planning, 'new', 'deep', 'file.md'), planning), 'new/deep/file.md');
    assert.strictEqual(paths.relToPlanning(path.join(tmp, 'proj', 'src', 'x.js'), planning), null);
    assert.strictEqual(paths.relToPlanning(path.join(tmp, 'proj', '.planning-old', 'x.md'), planning), null);
    assert.strictEqual(paths.relToPlanning(path.join(planning, '..', 'README.md'), planning), null);
    assert.strictEqual(paths.relToPlanning(planning, planning), null, 'the dir itself is not a path inside it');
  });

  test('7b. a symlinked parent resolves through realpath of the deepest existing ancestor', () => {
    const realProj = path.join(tmp, 'real-proj');
    const planning = path.join(realProj, '.planning');
    fs.mkdirSync(planning, { recursive: true });
    const link = path.join(tmp, 'link-proj');
    fs.symlinkSync(realProj, link, 'dir');

    // the file does not exist yet; only an ancestor is real
    assert.strictEqual(paths.relToPlanning(path.join(link, '.planning', 'objectives', '7-x', 'OBJECTIVE.md'), planning), 'objectives/7-x/OBJECTIVE.md');
    assert.strictEqual(paths.relToPlanning(path.join(planning, 'STATE.md'), path.join(link, '.planning')), 'STATE.md');
    assert.strictEqual(paths.relToPlanning(path.join(link, 'src', 'a.js'), planning), null);
  });

  test('7c. os.tmpdir() vs its realpath (macOS /var vs /private/var) agree', () => {
    const planning = path.join(tmp, '.planning');
    fs.mkdirSync(planning);
    const realPlanning = fs.realpathSync(planning);
    assert.strictEqual(paths.relToPlanning(path.join(planning, 'ROADMAP.md'), realPlanning), 'ROADMAP.md');
    assert.strictEqual(paths.relToPlanning(path.join(realPlanning, 'ROADMAP.md'), planning), 'ROADMAP.md');
  });

  test('7d. non-string input -> null', () => {
    assert.strictEqual(paths.relToPlanning(undefined, tmp), null);
    assert.strictEqual(paths.relToPlanning(path.join(tmp, 'x'), null), null);
  });
});

// ─── 8. unsafe rels ──────────────────────────────────────────────────────────

describe('classify: unsafe rels', () => {
  test('8. ../x, absolute, NUL, backslash, empty, . and .. segments, non-strings throw TypeError', () => {
    const unsafe = ['../x', 'objectives/../config.json', '/etc/passwd', 'a\0b', 'objectives\\48-x\\OBJECTIVE.md', '', './STATE.md', 'a//b', 'a/./b', 'todos/pending/'];
    for (const rel of unsafe) {
      assert.throws(() => paths.classify(rel), TypeError, JSON.stringify(rel));
    }
    for (const value of [undefined, null, 42, {}, ['STATE.md']]) {
      assert.throws(() => paths.classify(value), TypeError, String(value));
    }
  });
});

// ─── 9. U-1 lines ────────────────────────────────────────────────────────────

describe('U-1 tracked set', () => {
  test('9. gitignoreLines and TRACKED_CONFIG', () => {
    assert.deepStrictEqual(paths.gitignoreLines(), ['.planning/*', '!.planning/config.json', '!.planning/STACK.md']);
    assert.deepStrictEqual([...paths.TRACKED_CONFIG], ['config.json', 'STACK.md']);
    assert.ok(Object.isFrozen(paths.TRACKED_CONFIG));
    // a fresh array each call: a caller appending to it cannot change the next caller's lines
    paths.gitignoreLines().push('mutated');
    assert.strictEqual(paths.gitignoreLines().length, 3);
  });

  test('9b. every TRACKED_CONFIG entry classifies tracked-config and the negations match it', () => {
    for (const rel of paths.TRACKED_CONFIG) {
      assert.strictEqual(paths.classify(rel).class, 'tracked-config');
      assert.ok(paths.gitignoreLines().includes(`!.planning/${rel}`));
    }
  });
});

// ─── 10. listByClass ─────────────────────────────────────────────────────────

describe('listByClass', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-list-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function put(planning, rel, text = 'x') {
    const file = path.join(planning, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }

  test('10a. a hand-built tree -> four sorted lists, wiki/.git/** skipped', () => {
    const planning = path.join(tmp, '.planning');
    const files = [
      'config.json',
      'STACK.md',
      'ROADMAP.md',
      'STATE.md',
      'state.json',
      '.skill-active',
      '.trd-progress/48-01.md',
      'objectives/48-x/OBJECTIVE.md',
      'objectives/48-x/48-01-a-TRD.md',
      'objectives/48-x/notes.md',
      'todos/pending/a.md',
      'quick/3-x/3-JOB.md',
      'quick/3-x/DECISION-001.md',
      'wiki/Home.md',
      'wiki/.git/HEAD',
      'wiki/.git/objects/ab/cdef',
    ];
    for (const rel of files) put(planning, rel);

    assert.deepStrictEqual(paths.listByClass(planning), {
      'tracked-config': ['STACK.md', 'config.json'],
      cache: ['objectives/48-x/48-01-a-TRD.md', 'objectives/48-x/OBJECTIVE.md', 'quick/3-x/3-JOB.md', 'todos/pending/a.md', 'wiki/Home.md'],
      generated: ['ROADMAP.md', 'STATE.md'],
      runtime: ['.skill-active', '.trd-progress/48-01.md', 'objectives/48-x/notes.md', 'quick/3-x/DECISION-001.md', 'state.json'],
    });
  });

  test('10b. a missing .planning/ -> four empty lists', () => {
    assert.deepStrictEqual(paths.listByClass(path.join(tmp, 'nope')), { 'tracked-config': [], cache: [], generated: [], runtime: [] });
  });

  test('10c. every listed rel classifies to the list it is in', () => {
    const planning = path.join(tmp, '.planning');
    for (const [rel] of CLASS_TABLE_ROWS) put(planning, rel);
    const listed = paths.listByClass(planning);
    let count = 0;
    for (const cls of paths.CLASSES) {
      for (const rel of listed[cls]) {
        assert.strictEqual(paths.classify(rel).class, cls, rel);
        count += 1;
      }
    }
    assert.strictEqual(count, CLASS_TABLE_ROWS.length);
  });
});

// ─── 11. runtime dotfiles pinned by the planning-writes audit ────────────────

describe('runtime dotfiles', () => {
  // Literal list: hooks/planning-writes.audit.test.js pins .skill-active, .edit-override and .devflow-notices.json as the only
  // dotfiles a hook may write under .planning/, and names .progress-guard.json / .awareness-cache.json as moved out (migration 0008).
  const DOTFILES = ['.skill-active', '.edit-override', '.devflow-notices.json', '.progress-guard.json', '.awareness-cache.json'];

  test('11. each classifies runtime', () => {
    for (const rel of DOTFILES) {
      assert.deepStrictEqual(paths.classify(rel), { class: 'runtime', verb: null, hint: null, entity: null }, rel);
    }
  });
});

describe('module hygiene', () => {
  test('requires only fs, path and os (hook-safe, no child_process)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'planning-paths.cjs'), 'utf8');
    const required = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    assert.deepStrictEqual([...new Set(required)].filter((r) => !['fs', 'os', 'path'].includes(r)), []);
    assert.doesNotMatch(src, /child_process/);
  });
});
