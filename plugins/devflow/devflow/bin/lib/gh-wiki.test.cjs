'use strict';

// TRD 47-04 — gh-wiki.cjs (GST-06, GST-08 wiki half, GST-02 revision pin): the wiki store and the
// `docs/devflow/` backend.
//
// Hermetic: every project is a temp directory, every wiki remote is a local bare repo
// (`__fixtures__/wiki-remote.cjs`) reached over file://. Nothing here touches the network, `gh`,
// this repository's .planning/, or the real ~/.claude. Git runs with an isolated config (no global or
// system config, a temp HOME, no terminal prompts, explicit identity) so a developer's hooks, signing
// or init.defaultBranch cannot leak in.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const wiki = require('./gh-wiki.cjs');

const cleanup = [];
afterEach(() => {
  wiki._setRunGit(null);
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpProject(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-wiki-'));
  cleanup.push(root);
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (config !== undefined) {
    fs.writeFileSync(path.join(root, '.planning', 'config.json'), JSON.stringify(config));
  }
  return root;
}

// ─── Mapping (pure) ───────────────────────────────────────────────────────────

// The single table both directions read. Every row is [cache path, page].
const ROWS = [
  ['PROJECT.md', 'Project'],
  ['REQUIREMENTS.md', 'Requirements'],
  ['ROADMAP.md', 'Roadmap'],
  ['codebase/STACK.md', 'Codebase-Stack'],
  ['codebase/ARCHITECTURE.md', 'Codebase-Architecture'],
  ['objectives/07-store-demo/OBJECTIVE.md', 'Objective-7-store-demo'],
  ['objectives/07-store-demo/07-CONTEXT.md', 'Objective-7-store-demo-Context'],
  ['objectives/07-store-demo/07-RESEARCH.md', 'Objective-7-store-demo-Research'],
  ['objectives/02.1-b/OBJECTIVE.md', 'Objective-2_1-b'],
  ['objectives/02.1-b/02.1-CONTEXT.md', 'Objective-2_1-b-Context'],
  ['objectives/02-1-b/OBJECTIVE.md', 'Objective-2-1-b'],
  ['adr/0003-use-rest.md', 'ADR-0003-use-rest'],
  ['retros/v1.4.md', 'Retro-v1_4'],
];
const OBJECTIVE_DIRS = ['07-store-demo', '02.1-b', '02-1-b'];

describe('page mapping (tests 1-4)', () => {
  test('1. pageForCachePath maps every documented row', () => {
    for (const [rel, page] of ROWS) {
      assert.equal(wiki.pageForCachePath(rel), page, `${rel} -> ${page}`);
    }
  });

  test('1b. a bare CONTEXT.md / RESEARCH.md maps to the same page as the numbered one', () => {
    assert.equal(wiki.pageForCachePath('objectives/07-store-demo/CONTEXT.md'), 'Objective-7-store-demo-Context');
    assert.equal(wiki.pageForCachePath('objectives/07-store-demo/RESEARCH.md'), 'Objective-7-store-demo-Research');
  });

  test('1c. paths are accepted with a leading ./ and with backslashes', () => {
    assert.equal(wiki.pageForCachePath('./PROJECT.md'), 'Project');
    assert.equal(wiki.pageForCachePath('objectives\\07-store-demo\\OBJECTIVE.md'), 'Objective-7-store-demo');
  });

  test('2. objectivePage keeps decimal and hyphenated objective ids apart and stable', () => {
    const decimal = wiki.objectivePage('02.1-b');
    const hyphen = wiki.objectivePage('02-1-b');
    assert.equal(decimal, 'Objective-2_1-b');
    assert.equal(hyphen, 'Objective-2-1-b');
    assert.notEqual(decimal, hyphen);
    assert.equal(wiki.objectivePage('02.1-b'), decimal);
    assert.equal(wiki.objectivePage('02-1-b'), hyphen);
    assert.equal(wiki.objectivePage('07-store-demo'), 'Objective-7-store-demo');
    assert.equal(wiki.objectivePage('007'), 'Objective-7');
    assert.equal(wiki.objectivePage('not-an-objective'), null);
    assert.equal(wiki.objectivePage(''), null);
  });

  test('3. cachePathForPage inverts every row (Context/Research use the numbered repo convention)', () => {
    for (const [rel, page] of ROWS) {
      assert.equal(
        wiki.cachePathForPage(page, { objectiveDirs: OBJECTIVE_DIRS }),
        rel,
        `${page} -> ${rel}`,
      );
    }
  });

  test('3b. a bare CONTEXT.md round-trips as <prefix>-CONTEXT.md (documented, not an error)', () => {
    const page = wiki.pageForCachePath('objectives/07-store-demo/CONTEXT.md');
    assert.equal(
      wiki.cachePathForPage(page, { objectiveDirs: OBJECTIVE_DIRS }),
      'objectives/07-store-demo/07-CONTEXT.md',
    );
  });

  test('3c. objective pages need the objective directory list to invert; unknown ones return null', () => {
    assert.equal(wiki.cachePathForPage('Objective-7-store-demo'), null);
    assert.equal(wiki.cachePathForPage('Objective-7-store-demo', { objectiveDirs: [] }), null);
    assert.equal(wiki.cachePathForPage('Objective-9-other', { objectiveDirs: OBJECTIVE_DIRS }), null);
    assert.equal(wiki.cachePathForPage('Objective-7-store-demo-Context', { objectiveDirs: ['08-x'] }), null);
  });

  test('3d. a page that is not in the table inverts to null', () => {
    for (const page of ['Home', '_Sidebar', 'Some-Random-Page', '', null, undefined]) {
      assert.equal(wiki.cachePathForPage(page, { objectiveDirs: OBJECTIVE_DIRS }), null, String(page));
    }
  });

  test('4. unmapped cache paths return null (not every file goes to the wiki)', () => {
    for (const rel of [
      'STATE.md',
      'config.json',
      'objectives/07-store-demo/07-01-thing-TRD.md',
      'objectives/07-store-demo/07-01-SUMMARY.md',
      'objectives/misc/OBJECTIVE.md',
      'codebase/notes.txt',
      'codebase/sub/STACK.md',
      'ROADMAP.md.bak',
      'adr/readme.md',
      'retros/latest.md',
      '',
      null,
    ]) {
      assert.equal(wiki.pageForCachePath(rel), null, String(rel));
    }
  });

  test('PAGE_TABLE is exported as an ordered rule list used by both directions', () => {
    assert.ok(Array.isArray(wiki.PAGE_TABLE) && wiki.PAGE_TABLE.length >= 8);
    for (const rule of wiki.PAGE_TABLE) {
      assert.equal(typeof rule.match, 'function');
      assert.equal(typeof rule.invert, 'function');
    }
    assert.equal(wiki.WIKI_DIR_REL, '.planning/wiki');
    assert.equal(wiki.DOCS_DIR_REL, 'docs/devflow');
  });
});

describe('revision URL (test 5)', () => {
  test('5. pageRevisionUrl is the one place the revision URL format lives', () => {
    assert.equal(
      wiki.pageRevisionUrl('o/r', 'Objective-7-store-demo', 'abc123'),
      'https://github.com/o/r/wiki/Objective-7-store-demo/abc123',
    );
  });
});

describe('remote resolution (test 6)', () => {
  test('6. env beats config beats the default URL', () => {
    const root = tmpProject({ github: { repo: 'o/r', wiki: { remote: 'file:///from-config' } } });
    assert.equal(
      wiki.resolveWikiRemote(root, { env: { DEVFLOW_WIKI_REMOTE: 'file:///from-env' } }),
      'file:///from-env',
    );
    assert.equal(wiki.resolveWikiRemote(root, { env: {} }), 'file:///from-config');

    const noWikiCfg = tmpProject({ github: { repo: 'o/r' } });
    assert.equal(wiki.resolveWikiRemote(noWikiCfg, { env: {} }), 'https://github.com/o/r.wiki.git');
  });

  test('6b. no env, no config remote and no repo slug resolves to null', () => {
    const root = tmpProject({ github: {} });
    assert.equal(wiki.resolveWikiRemote(root, { env: {} }), null);
    assert.equal(wiki.resolveWikiRemote(tmpProject(), { env: {} }), null);
  });
});
