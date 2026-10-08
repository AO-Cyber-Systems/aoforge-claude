'use strict';

// TRD 47-04 — gh-wiki.cjs (GST-06, GST-08 wiki half, GST-02 revision pin): the wiki store and the
// `docs/aoforge/` backend.
//
// Hermetic: every project is a temp directory, every wiki remote is a local bare repo
// (`__fixtures__/wiki-remote.cjs`) reached over file://. Nothing here touches the network, `gh`,
// this repository's .planning/, or the real ~/.claude. Git runs with an isolated config (no global or
// system config, a temp HOME, no terminal prompts, explicit identity) so a developer's hooks, signing
// or init.defaultBranch cannot leak in.

const { describe, test, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const wiki = require('./gh-wiki.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

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
    // quick-29 (CodeQL js/regex-injection, alert 145): `<rule>.match(<cli path>)` read as a string-to-regex
    // `String.prototype.match`, so the rule method is `toPage` and no rule exposes `match`.
    for (const rule of wiki.PAGE_TABLE) {
      assert.equal(typeof rule.toPage, 'function', rule.name);
      assert.equal(rule.match, undefined, rule.name);
      assert.equal(typeof rule.invert, 'function', rule.name);
    }
    assert.equal(wiki.WIKI_DIR_REL, '.planning/wiki');
    assert.equal(wiki.DOCS_DIR_REL, 'docs/aoforge');
  });

  test('quick-29: regex-metacharacter cache paths map to null and never throw', () => {
    for (const rel of ['objectives/(/TRD.md', 'objectives/[x/UAT.md', 'codebase/a+b.md', 'objectives/.*/CONTEXT.md']) {
      assert.equal(wiki.pageForCachePath(rel), null, rel);
    }
  });
});

// ─── 48-05: research, milestones and other objective docs (D-04, D-05) ────────

describe('48-05 page rules', () => {
  test('48-05 1. characterization: the 47 mappings are unchanged and issue-backed files stay null', () => {
    const pinned = [
      ['PROJECT.md', 'Project'],
      ['REQUIREMENTS.md', 'Requirements'],
      ['ROADMAP.md', 'Roadmap'],
      ['codebase/STACK.md', 'Codebase-Stack'],
      ['objectives/07-store-demo/07-CONTEXT.md', 'Objective-7-store-demo-Context'],
      ['objectives/07-store-demo/07-RESEARCH.md', 'Objective-7-store-demo-Research'],
      ['objectives/07-store-demo/OBJECTIVE.md', 'Objective-7-store-demo'],
      ['adr/0001-x.md', 'ADR-0001-x'],
      ['retros/v1.3.md', 'Retro-v1_3'],
    ];
    for (const [rel, page] of pinned) {
      assert.equal(wiki.pageForCachePath(rel), page, `${rel} -> ${page}`);
      assert.equal(wiki.cachePathForPage(page, { objectiveDirs: ['07-store-demo'] }), rel, `${page} -> ${rel}`);
    }
    for (const rel of [
      'objectives/07-store-demo/07-01-a-TRD.md',
      'objectives/07-store-demo/07-01-a-SUMMARY.md',
      'objectives/07-store-demo/07-VERIFICATION.md',
      'STATE.md',
    ]) {
      assert.equal(wiki.pageForCachePath(rel), null, rel);
    }
  });

  const DIRS_48 = ['07-store-demo', '42-codebase-aware-stack-drafter', '48-planning-write-path-migration', '02.1-b'];
  const roundTrip = (rel, page) => {
    assert.equal(wiki.pageForCachePath(rel), page, `${rel} -> ${page}`);
    assert.equal(wiki.cachePathForPage(page, { objectiveDirs: DIRS_48 }), rel, `${page} -> ${rel}`);
  };

  const NEW_ROWS = [
    ['research/tdd-scope-summary.md', 'Research-tdd-scope-summary'],
    ['research/STACK_notes.md', 'Research-STACK_notes'],
    ['milestones/v1.3.md', 'Milestone-v1_3'],
    ['milestones/v2.10.1.md', 'Milestone-v2_10_1'],
    ['milestones/v1.3-MILESTONE-AUDIT.md', 'Milestone-v1_3-Milestone-Audit'],
    ['milestones/v1.2-ROADMAP.md', 'Milestone-v1_2-Roadmap'],
    ['objectives/42-codebase-aware-stack-drafter/42-ROLLOUT.md', 'Objective-42-codebase-aware-stack-drafter-Rollout'],
    ['objectives/48-planning-write-path-migration/48-UAT.md', 'Objective-48-planning-write-path-migration-Uat'],
    ['objectives/07-store-demo/07-EVIDENCE.md', 'Objective-7-store-demo-Evidence'],
    ['objectives/07-store-demo/07-DISCOVERY.md', 'Objective-7-store-demo-Discovery'],
    ['objectives/02.1-b/02.1-UAT.md', 'Objective-2_1-b-Uat'],
  ];

  test('48-05 2. research notes map to Research-<stem> and back', () => {
    roundTrip('research/tdd-scope-summary.md', 'Research-tdd-scope-summary');
    roundTrip('research/STACK_notes.md', 'Research-STACK_notes');
    for (const rel of ['research/sub/x.md', 'research/.hidden.md', 'research/x.txt', 'research/-x.md']) {
      assert.equal(wiki.pageForCachePath(rel), null, rel);
    }
  });

  test('48-05 3. milestone entries and archives map to Milestone-v<X_Y>[-<Kind>] and back', () => {
    roundTrip('milestones/v1.3.md', 'Milestone-v1_3');
    roundTrip('milestones/v2.10.1.md', 'Milestone-v2_10_1');
    roundTrip('milestones/v1.3-MILESTONE-AUDIT.md', 'Milestone-v1_3-Milestone-Audit');
    roundTrip('milestones/v1.2-ROADMAP.md', 'Milestone-v1_2-Roadmap');
    for (const rel of ['milestones/1.3.md', 'milestones/v1.3-audit.md', 'milestones/v1.3-.md', 'milestones/notes.md']) {
      assert.equal(wiki.pageForCachePath(rel), null, rel);
    }
    for (const page of ['Milestone-v1.3', 'Milestone-v1_3-AUDIT', 'Milestone-1_3', 'Milestone-v1_3-audit']) {
      assert.equal(wiki.cachePathForPage(page, { objectiveDirs: DIRS_48 }), null, page);
    }
  });

  test('48-05 4. other objective docs map to <ObjectivePage>-<Suffix>; TRD/SUMMARY/VERIFICATION stay null', () => {
    roundTrip('objectives/42-codebase-aware-stack-drafter/42-ROLLOUT.md', 'Objective-42-codebase-aware-stack-drafter-Rollout');
    roundTrip('objectives/48-planning-write-path-migration/48-UAT.md', 'Objective-48-planning-write-path-migration-Uat');
    roundTrip('objectives/07-store-demo/07-EVIDENCE.md', 'Objective-7-store-demo-Evidence');
    roundTrip('objectives/02.1-b/02.1-UAT.md', 'Objective-2_1-b-Uat');
    for (const rel of [
      'objectives/07-store-demo/07-VERIFICATION.md',
      'objectives/07-store-demo/07-01-a-TRD.md',
      'objectives/07-store-demo/07-01-SUMMARY.md',
      'objectives/07-store-demo/07-TRD.md',
      'objectives/07-store-demo/07-SUMMARY.md',
      'objectives/07-store-demo/08-UAT.md',
      'objectives/07-store-demo/7-UAT.md',
      'objectives/07-store-demo/07-uat.md',
      'objectives/07-store-demo/UAT.md',
      'objectives/misc/07-UAT.md',
    ]) {
      assert.equal(wiki.pageForCachePath(rel), null, rel);
    }
    // CONTEXT / RESEARCH keep their 47 rules (the generic rule never claims them).
    assert.equal(wiki.cachePathForPage('Objective-7-store-demo-Context', { objectiveDirs: DIRS_48 }), 'objectives/07-store-demo/07-CONTEXT.md');
    assert.equal(wiki.cachePathForPage('Objective-7-store-demo-Research', { objectiveDirs: DIRS_48 }), 'objectives/07-store-demo/07-RESEARCH.md');
    // Inverting needs the objective directory list, like every objective page.
    assert.equal(wiki.cachePathForPage('Objective-42-codebase-aware-stack-drafter-Rollout'), null);
    assert.equal(wiki.cachePathForPage('Objective-7-store-demo-Verification', { objectiveDirs: DIRS_48 }), null);
  });

  test('48-05 5. every new rule produces a valid wiki page name', () => {
    for (const [rel, page] of NEW_ROWS) {
      assert.equal(wiki.pageForCachePath(rel), page, rel);
      assert.equal(wiki.validPage(page), true, page);
    }
    const names = wiki.PAGE_TABLE.map((r) => r.name);
    for (const n of ['research', 'milestone', 'milestone-archive', 'objective-doc']) assert.ok(names.includes(n), n);
    assert.ok(names.indexOf('research') < names.indexOf('objective-context'), 'research precedes the objective rules');
    assert.ok(names.indexOf('objective-doc') > names.indexOf('objective'), 'the generic objective doc rule follows the 47 objective rules');
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
      wiki.resolveWikiRemote(root, { env: { AOFORGE_WIKI_REMOTE: 'file:///from-env' } }),
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

// ─── Command sequences (recording fake runner, no git) ────────────────────────

/** Drop leading `-c key=value` pairs so a test can read the git subcommand. */
function stripC(args) {
  const out = [...args];
  while (out[0] === '-c') out.splice(0, 2);
  return out;
}

const FAIL = (stderr, stdout = '') => ({ ok: false, status: 1, stdout, stderr });

/**
 * A recording stand-in for runGit. `handler(strippedArgs, rawArgs, calls)` may return a partial result;
 * anything it does not return is a success with empty output.
 */
function fakeGit(handler) {
  const calls = [];
  const fn = (args, opts) => {
    calls.push({ args: [...args], cwd: opts && opts.cwd, env: opts && opts.env });
    const r = handler ? handler(stripC(args), args, calls) : undefined;
    return Object.assign({ ok: true, status: 0, stdout: '', stderr: '' }, r || {});
  };
  fn.calls = calls;
  fn.lines = () => calls.map((c) => stripC(c.args).join(' '));
  /** The lines that carry the write sequence (identity and bookkeeping queries filtered out). */
  fn.sequence = () => fn.lines().filter((l) => !/^(config|rev-parse|rev-list) /.test(l));
  return fn;
}

function assertNoForce(git) {
  for (const c of git.calls) {
    for (const a of c.args) {
      assert.ok(
        a !== '--force' && a !== '-f' && a !== '--force-with-lease' && !/^\+/.test(a),
        `force flag in argv: ${c.args.join(' ')}`,
      );
    }
    assert.ok(!c.args.some((a) => /^--(ours|theirs)$/.test(a)), `conflict side-picking in: ${c.args.join(' ')}`);
  }
}

/** A project whose `.planning/wiki/` exists, so `push` has a clone to run in. */
function projectWithClone() {
  const root = tmpProject();
  fs.mkdirSync(path.join(root, '.planning', 'wiki'), { recursive: true });
  return root;
}

const CONFIGURED = { stdout: 'dev@example.com\n' };
const FILE_REMOTE = 'file:///fake/remote.wiki.git';
const CRED_PREFIX = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];

describe('push sequence (tests 7-10)', () => {
  test('7. add, diff --cached --quiet, commit, pull --rebase, push HEAD:master in that order', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => {
      if (a.join(' ') === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { message: 'sync pages', remote: FILE_REMOTE });

    assert.equal(r.ok, true);
    assert.equal(r.committed, true);
    assert.equal(r.pushed, true);
    assert.deepEqual(git.sequence(), [
      'add -A',
      'diff --cached --quiet',
      'commit -m sync pages',
      'pull --rebase origin master',
      'push origin HEAD:master',
    ]);
    assert.ok(git.calls.every((c) => c.cwd === path.join(root, '.planning', 'wiki')), 'every call runs in the clone');
    assertNoForce(git);
  });

  test('7b. nothing staged and nothing ahead: no commit, no pull, no push', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => {
      if (a[0] === 'rev-list') return { stdout: '0\n' };
      if (a[0] === 'config') return CONFIGURED;
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { remote: FILE_REMOTE });

    assert.equal(r.ok, true);
    assert.equal(r.committed, false);
    assert.equal(r.pushed, false);
    assert.deepEqual(git.sequence(), ['add -A', 'diff --cached --quiet']);
  });

  test('7c. nothing staged but local commits ahead: still pulls and pushes', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => {
      if (a[0] === 'rev-list') return { stdout: '2\n' };
      if (a[0] === 'config') return CONFIGURED;
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { remote: FILE_REMOTE });

    assert.equal(r.ok, true);
    assert.equal(r.committed, false);
    assert.equal(r.pushed, true);
    assert.deepEqual(git.sequence(), [
      'add -A',
      'diff --cached --quiet',
      'pull --rebase origin master',
      'push origin HEAD:master',
    ]);
  });

  test('7d. an unset git identity commits as AOForge; a configured one is left alone', () => {
    const rootA = projectWithClone();
    const noIdentity = fakeGit((a) => (a.join(' ') === 'diff --cached --quiet' ? FAIL('') : undefined));
    wiki._setRunGit(noIdentity);
    wiki.push(rootA, { message: 'm', remote: FILE_REMOTE });
    const commitA = noIdentity.calls.find((c) => stripC(c.args)[0] === 'commit');
    assert.deepEqual(commitA.args.slice(0, 4), ['-c', 'user.name=AOForge', '-c', 'user.email=aoforge@users.noreply.github.com']);

    const rootB = projectWithClone();
    const hasIdentity = fakeGit((a) => {
      if (a.join(' ') === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      return undefined;
    });
    wiki._setRunGit(hasIdentity);
    wiki.push(rootB, { message: 'm', remote: FILE_REMOTE });
    const commitB = hasIdentity.calls.find((c) => stripC(c.args)[0] === 'commit');
    assert.equal(commitB.args[0], 'commit');
  });

  test('7e. no wiki clone: a clear error and zero git calls', () => {
    const root = tmpProject();
    const git = fakeGit();
    wiki._setRunGit(git);

    const r = wiki.push(root, { remote: FILE_REMOTE });

    assert.equal(r.ok, false);
    assert.match(r.error, /clone/i);
    assert.equal(git.calls.length, 0);
  });

  test('8. a rebase conflict aborts the rebase, reports the files and never pushes', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => {
      const line = a.join(' ');
      if (line === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      if (line === 'pull --rebase origin master') {
        return FAIL(
          'error: could not apply 1a2b3c4... sync\n',
          'CONFLICT (content): Merge conflict in Objective-7-store-demo.md\n',
        );
      }
      if (line === 'diff --name-only --diff-filter=U') return { stdout: 'Objective-7-store-demo.md\n' };
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { message: 'm', remote: FILE_REMOTE });

    assert.equal(r.ok, false);
    assert.equal(r.conflict, true);
    assert.deepEqual(r.files, ['Objective-7-store-demo.md']);
    const lines = git.lines();
    assert.ok(lines.includes('rebase --abort'), 'rebase aborted');
    assert.ok(
      lines.indexOf('diff --name-only --diff-filter=U') < lines.indexOf('rebase --abort'),
      'conflicted files are collected before the abort',
    );
    assert.ok(!lines.some((l) => l.startsWith('push ')), 'no push after a conflict');
    assertNoForce(git);
  });

  test('9. a non-fast-forward push is retried: 2 rejections then success is 3 rounds', () => {
    const root = projectWithClone();
    let pushes = 0;
    const git = fakeGit((a) => {
      const line = a.join(' ');
      if (line === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      if (line === 'push origin HEAD:master') {
        pushes += 1;
        if (pushes <= 2) return FAIL(' ! [rejected]        HEAD -> master (non-fast-forward)\n');
      }
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { message: 'm', remote: FILE_REMOTE });

    assert.equal(r.ok, true);
    assert.equal(r.rounds, 3);
    assert.equal(git.lines().filter((l) => l === 'pull --rebase origin master').length, 3);
    assert.equal(git.lines().filter((l) => l === 'push origin HEAD:master').length, 3);
    assertNoForce(git);
  });

  test('9b. a push rejected on every attempt gives up after the initial try and 3 retries', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => {
      const line = a.join(' ');
      if (line === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      if (line === 'push origin HEAD:master') return FAIL(' ! [rejected]        HEAD -> master (fetch first)\n');
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { message: 'm', remote: FILE_REMOTE });

    assert.equal(r.ok, false);
    assert.match(r.error, /non-fast-forward/);
    assert.equal(git.lines().filter((l) => l === 'push origin HEAD:master').length, 4);
    assertNoForce(git);
  });

  test('9c. a conflict found on a retry round is still reported, not retried away', () => {
    const root = projectWithClone();
    let pulls = 0;
    const git = fakeGit((a) => {
      const line = a.join(' ');
      if (line === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      if (line === 'push origin HEAD:master') return FAIL(' ! [rejected]        HEAD -> master (non-fast-forward)\n');
      if (line === 'pull --rebase origin master') {
        pulls += 1;
        if (pulls === 2) return FAIL('', 'CONFLICT (content): Merge conflict in Project.md\n');
      }
      if (line === 'diff --name-only --diff-filter=U') return { stdout: 'Project.md\n' };
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { message: 'm', remote: FILE_REMOTE });

    assert.equal(r.conflict, true);
    assert.deepEqual(r.files, ['Project.md']);
    assert.equal(git.lines().filter((l) => l === 'push origin HEAD:master').length, 1);
  });

  test('10. offline stderr on pull is {offline:true}, not a throw and not a conflict', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => {
      const line = a.join(' ');
      if (line === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      if (line === 'pull --rebase origin master') {
        return FAIL("fatal: unable to access 'https://github.com/o/r.wiki.git/': Could not resolve host: github.com\n");
      }
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { message: 'm', remote: FILE_REMOTE });

    assert.equal(r.ok, false);
    assert.equal(r.offline, true);
    assert.equal(r.conflict, undefined);
    assert.ok(!git.lines().includes('rebase --abort'), 'no rebase was started, so none is aborted');
    assert.ok(!git.lines().some((l) => l.startsWith('push ')));
  });

  test('10b. offline stderr on the push itself is also {offline:true}', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => {
      const line = a.join(' ');
      if (line === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      if (line === 'push origin HEAD:master') return FAIL('ssh: connect to host github.com: Network is unreachable\n');
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { message: 'm', remote: FILE_REMOTE });

    assert.equal(r.ok, false);
    assert.equal(r.offline, true);
  });

  test('10c. an authentication failure is reported as auth, not as offline', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => {
      const line = a.join(' ');
      if (line === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      if (line === 'pull --rebase origin master') {
        return FAIL("fatal: unable to access 'https://github.com/o/r.wiki.git/': The requested URL returned error: 403\n");
      }
      return undefined;
    });
    wiki._setRunGit(git);

    const r = wiki.push(root, { message: 'm', remote: 'https://github.com/o/r.wiki.git' });

    assert.equal(r.ok, false);
    assert.equal(r.auth, true);
    assert.equal(r.offline, undefined);
  });
});

describe('credential helper and probe (test 11)', () => {
  test('11. an https remote carries the credential-helper prefix on remote calls; file:// does not', () => {
    const rootHttps = projectWithClone();
    const https = fakeGit((a) => {
      if (a.join(' ') === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      return undefined;
    });
    wiki._setRunGit(https);
    wiki.push(rootHttps, { message: 'm', remote: 'https://github.com/o/r.wiki.git' });
    for (const c of https.calls) {
      const sub = stripC(c.args)[0];
      if (sub === 'pull' || sub === 'push') {
        assert.deepEqual(c.args.slice(0, 4), CRED_PREFIX, `${sub} carries the credential prefix`);
      }
    }
    assert.ok(https.calls.some((c) => stripC(c.args)[0] === 'push'));

    const rootFile = projectWithClone();
    const local = fakeGit((a) => {
      if (a.join(' ') === 'diff --cached --quiet') return FAIL('');
      if (a[0] === 'config') return CONFIGURED;
      return undefined;
    });
    wiki._setRunGit(local);
    wiki.push(rootFile, { message: 'm', remote: FILE_REMOTE });
    for (const c of local.calls) {
      assert.ok(!c.args.some((a) => /credential/.test(a)), `no credential config for file://: ${c.args.join(' ')}`);
    }
  });

  test('11b. no token ever appears in an argv; the remote URL is passed through unmodified', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => (a.join(' ') === 'diff --cached --quiet' ? FAIL('') : undefined));
    wiki._setRunGit(git);
    wiki.push(root, { message: 'm', remote: 'https://github.com/o/r.wiki.git' });
    for (const c of git.calls) {
      assert.ok(!c.args.some((a) => /ghp_|github_pat_|x-access-token|:\/\/[^/\s]*@/.test(a)), c.args.join(' '));
    }
  });

  test('11c. probeRemote classifies ok / uninitialised / unavailable from ls-remote', () => {
    const answers = {
      ok: { stdout: 'abc123\tHEAD\n' },
      uninit: FAIL("remote: Repository not found.\nfatal: repository 'https://github.com/o/r.wiki.git/' not found\n"),
      local: FAIL("fatal: '/x/y.git' does not appear to be a git repository\nfatal: Could not read from remote repository.\n"),
      other: FAIL('fatal: invalid gitfile format: /x/y\n'),
      offline: FAIL("fatal: unable to access 'https://github.com/o/r.wiki.git/': Could not resolve host: github.com\n"),
    };
    let current;
    wiki._setRunGit(fakeGit(() => answers[current]));

    current = 'ok';
    assert.equal(wiki.probeRemote(FILE_REMOTE).state, 'ok');
    current = 'uninit';
    assert.equal(wiki.probeRemote('https://github.com/o/r.wiki.git').state, 'uninitialised');
    current = 'local';
    assert.equal(wiki.probeRemote(FILE_REMOTE).state, 'uninitialised');

    current = 'other';
    const other = wiki.probeRemote(FILE_REMOTE);
    assert.equal(other.state, 'unavailable');
    assert.match(other.stderr, /invalid gitfile format/);

    current = 'offline';
    const off = wiki.probeRemote('https://github.com/o/r.wiki.git');
    assert.equal(off.state, 'unavailable');
    assert.equal(off.offline, true);
  });

  test('11d. probeRemote asks ls-remote once and uses the credential prefix for https only', () => {
    const git = fakeGit(() => ({ stdout: 'abc\tHEAD\n' }));
    wiki._setRunGit(git);
    wiki.probeRemote('https://github.com/o/r.wiki.git');
    wiki.probeRemote(FILE_REMOTE);
    assert.equal(git.calls.length, 2);
    assert.deepEqual(git.calls[0].args.slice(0, 4), CRED_PREFIX);
    assert.deepEqual(stripC(git.calls[0].args).slice(0, 1), ['ls-remote']);
    assert.ok(!git.calls[1].args.includes('credential.helper='));
  });
});

describe('fetch and runGit (tests 11e-11g)', () => {
  test('11e. fetch resets to origin/master only when nothing is ahead', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => (a[0] === 'rev-list' ? { stdout: '0\n' } : undefined));
    wiki._setRunGit(git);

    const r = wiki.fetch(root);

    assert.equal(r.ok, true);
    assert.equal(r.ahead, 0);
    assert.ok(git.lines().includes('fetch origin'));
    assert.ok(git.lines().includes('reset --hard origin/master'));
  });

  test('11f. fetch with local commits ahead never resets; it rebases and reports the count', () => {
    const root = projectWithClone();
    const git = fakeGit((a) => (a[0] === 'rev-list' ? { stdout: '1\n' } : undefined));
    wiki._setRunGit(git);

    const r = wiki.fetch(root);

    assert.equal(r.ok, true);
    assert.equal(r.ahead, 1);
    assert.ok(!git.lines().some((l) => l.startsWith('reset ')), 'reset --hard would destroy the unpushed commit');
    assert.ok(git.lines().includes('pull --rebase origin master'));
    assertNoForce(git);
  });

  test('11g. fetch offline is {offline:true}', () => {
    const root = projectWithClone();
    wiki._setRunGit(fakeGit((a) => (a[0] === 'fetch' ? FAIL('fatal: Could not resolve host: github.com\n') : undefined)));
    const r = wiki.fetch(root);
    assert.equal(r.ok, false);
    assert.equal(r.offline, true);
  });

  test('11h. runGit never throws: a missing git binary is a result, not an exception', () => {
    const r = wiki.runGit(['--version'], { env: { PATH: path.join(os.tmpdir(), 'df-gh-wiki-no-such-bin-dir') } });
    assert.equal(r.ok, false);
    assert.equal(r.status, null);
    assert.equal(r.stderr, 'git: command not found');
  });

  test('11i. runGit reports a missing working directory as that, not as a missing git', () => {
    const r = wiki.runGit(['status'], { cwd: path.join(os.tmpdir(), 'df-gh-wiki-no-such-cwd') });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /working directory/);
  });

  test('11j. _setRunGit(null) restores the real runner', () => {
    wiki._setRunGit(() => ({ ok: false, status: 1, stdout: '', stderr: 'fake' }));
    assert.equal(wiki.runGit(['--version']).stderr, 'fake');
    wiki._setRunGit(null);
    assert.notEqual(wiki.runGit(['--version']).stderr, 'fake');
  });
});

// ─── Integration (real local git against a bare repo; never the network) ──────

const HAS_GIT = gitAvailable();

describe('wiki integration (local git)', { skip: !HAS_GIT && 'git not installed' }, () => {
  let restoreEnv;
  let envHome;
  let savedRemoteEnv;
  const remotes = [];

  before(() => {
    envHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-wiki-home-'));
    savedRemoteEnv = process.env.AOFORGE_WIKI_REMOTE;
    restoreEnv = applyGitTestEnv(envHome);
  });

  after(() => {
    restoreEnv();
    if (savedRemoteEnv === undefined) delete process.env.AOFORGE_WIKI_REMOTE;
    else process.env.AOFORGE_WIKI_REMOTE = savedRemoteEnv;
    fs.rmSync(envHome, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.AOFORGE_WIKI_REMOTE;
    while (remotes.length) remotes.pop().cleanup();
  });

  /** Run git in `cwd` under the isolated env. */
  function sh(cwd, args) {
    const r = spawnSync('git', args, { cwd, env: process.env, encoding: 'utf-8' });
    assert.ok(!r.error, `git ${args.join(' ')}: ${r.error && r.error.message}`);
    return r;
  }

  function out(cwd, args) {
    const r = sh(cwd, args);
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  }

  /** A fresh seeded wiki remote plus a temp project (a `git init -b main` repo) pointed at it. */
  function setup(seedOpts) {
    const remote = createWikiRemote(seedOpts);
    remotes.push(remote);
    const root = tmpProject();
    out(root, ['init', '-q', '-b', 'main']);
    process.env.AOFORGE_WIKI_REMOTE = remote.remoteUrl;
    return { remote, root, clone: path.join(root, '.planning', 'wiki') };
  }

  function setupWithClone(seedOpts) {
    const ctx = setup(seedOpts);
    const c = wiki.ensureClone(ctx.root, { remote: ctx.remote.remoteUrl });
    assert.equal(c.ok, true, JSON.stringify(c));
    return ctx;
  }

  test('12. probeRemote: ok for the fixture, uninitialised for a missing path, unavailable otherwise', () => {
    const { remote, root } = setup();
    assert.equal(wiki.probeRemote(remote.remoteUrl, { cwd: root }).state, 'ok');
    assert.equal(wiki.probeRemote(remote.missingUrl, { cwd: root }).state, 'uninitialised');

    const bad = wiki.probeRemote(remote.notARepoUrl, { cwd: root });
    assert.equal(bad.state, 'unavailable');
    assert.ok(bad.stderr.length > 0, 'git stderr is included');
  });

  test('13. ensureClone clones into .planning/wiki, excludes it once, and the project does not see it', () => {
    const { remote, root, clone } = setup();
    fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), '# state\n');

    const r = wiki.ensureClone(root, { remote: remote.remoteUrl });

    assert.equal(r.ok, true);
    assert.equal(r.cloned, true);
    assert.equal(fs.readFileSync(path.join(clone, 'Home.md'), 'utf-8'), '# Home\n');
    const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf-8');
    assert.equal(exclude.split('\n').filter((l) => l === '/.planning/wiki/').length, 1);
    const status = out(root, ['status', '--porcelain', '--untracked-files=all']);
    assert.ok(status.includes('.planning/STATE.md'), 'control: other planning files are still visible');
    assert.ok(!status.includes('.planning/wiki'), `wiki clone leaked into status:\n${status}`);
  });

  test('13b. a second ensureClone is a no-op and adds no duplicate exclude line', () => {
    const { remote, root } = setup();
    wiki.ensureClone(root, { remote: remote.remoteUrl });
    const again = wiki.ensureClone(root, { remote: remote.remoteUrl });

    assert.equal(again.ok, true);
    assert.equal(again.cloned, false);
    const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf-8');
    assert.equal(exclude.split('\n').filter((l) => l.trim() === '/.planning/wiki/').length, 1);
    assert.deepEqual(wiki.ensureExcluded(root), { ok: true, added: false, path: path.join(root, '.git', 'info', 'exclude') });
  });

  test('13c. an existing clone with a different origin is reported, never deleted', () => {
    const { root, clone } = setupWithClone();
    const other = createWikiRemote();
    remotes.push(other);

    const r = wiki.ensureClone(root, { remote: other.remoteUrl });

    assert.equal(r.ok, false);
    assert.match(r.error, /wiki clone points at .*, expected /);
    assert.ok(fs.existsSync(path.join(clone, 'Home.md')), 'the clone is untouched');
  });

  test('13d. a non-empty .planning/wiki that is not a clone is reported, not overwritten', () => {
    const { remote, root, clone } = setup();
    fs.mkdirSync(clone, { recursive: true });
    fs.writeFileSync(path.join(clone, 'precious.md'), 'keep me\n');

    const r = wiki.ensureClone(root, { remote: remote.remoteUrl });

    assert.equal(r.ok, false);
    assert.match(r.error, /not a git clone/);
    assert.equal(fs.readFileSync(path.join(clone, 'precious.md'), 'utf-8'), 'keep me\n');
  });

  test('13e. ensureClone of a missing wiki is {uninitialised:true} and creates nothing', () => {
    const { remote, root, clone } = setup();
    const r = wiki.ensureClone(root, { remote: remote.missingUrl });
    assert.equal(r.ok, false);
    assert.equal(r.uninitialised, true);
    assert.ok(!fs.existsSync(clone));
  });

  test('13f. exclude works from a linked worktree (git --git-path)', () => {
    const { remote, root } = setup();
    fs.writeFileSync(path.join(root, 'README.md'), 'hi\n');
    out(root, ['add', 'README.md']);
    out(root, ['commit', '-q', '-m', 'init']);
    const wt = path.join(os.tmpdir(), `df-gh-wiki-wt-${process.pid}-${Date.now()}`);
    cleanup.push(wt);
    out(root, ['worktree', 'add', '-q', '-b', 'wt-branch', wt]);

    const r = wiki.ensureClone(wt, { remote: remote.remoteUrl });

    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(fs.existsSync(path.join(wt, '.planning', 'wiki', 'Home.md')));
    const status = out(wt, ['status', '--porcelain', '--untracked-files=all']);
    assert.ok(!status.includes('wiki'), `worktree sees the clone:\n${status}`);
  });

  test('14. writePage + push puts the page on the remote master and headSha equals the remote ref', () => {
    const { remote, root } = setupWithClone();
    const w = wiki.writePage(root, 'Objective-7-store-demo', '# Objective 7\n');
    assert.equal(w.ok, true);
    assert.equal(w.changed, true);

    const p = wiki.push(root, { message: 'objective 7' });

    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(p.committed, true);
    assert.equal(p.pushed, true);
    assert.equal(remote.readRemotePage('Objective-7-store-demo'), '# Objective 7\n');
    assert.equal(wiki.headSha(root), remote.headSha());
    assert.equal(p.sha, remote.headSha());
  });

  test('15. a human edit to a DIFFERENT page rebases cleanly and both changes reach the remote', () => {
    const { remote, root } = setupWithClone();
    remote.commitPage('Other-Page', 'edited on the web\n');
    wiki.writePage(root, 'Objective-7-store-demo', 'from aoforge\n');

    const p = wiki.push(root, { message: 'objective 7' });

    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(remote.readRemotePage('Other-Page'), 'edited on the web\n');
    assert.equal(remote.readRemotePage('Objective-7-store-demo'), 'from aoforge\n');
    assert.equal(wiki.headSha(root), remote.headSha());
  });

  test('16. a human edit to the SAME lines is a reported conflict: remote unchanged, rebase aborted', () => {
    const { remote, root, clone } = setupWithClone({ seed: { 'Objective-7-store-demo.md': 'one\ntwo\nthree\n' } });
    remote.commitPage('Objective-7-store-demo', 'one\nHUMAN\nthree\n');
    const remoteBefore = remote.headSha();
    wiki.writePage(root, 'Objective-7-store-demo', 'one\nLOCAL\nthree\n');

    const p = wiki.push(root, { message: 'objective 7' });

    assert.equal(p.ok, false);
    assert.equal(p.conflict, true);
    assert.deepEqual(p.files, ['Objective-7-store-demo.md']);
    assert.equal(remote.headSha(), remoteBefore, 'remote is untouched');
    assert.equal(remote.readRemotePage('Objective-7-store-demo'), 'one\nHUMAN\nthree\n');
    assert.ok(!fs.existsSync(path.join(clone, '.git', 'rebase-merge')), 'no rebase in progress');
    assert.ok(!fs.existsSync(path.join(clone, '.git', 'rebase-apply')), 'no rebase in progress');
    assert.equal(out(clone, ['status', '--porcelain']), '', 'the clone is clean');
    assert.equal(out(clone, ['rev-list', '--count', 'origin/master..HEAD']), '1', 'the local commit is kept');
    assert.equal(fs.readFileSync(path.join(clone, 'Objective-7-store-demo.md'), 'utf-8'), 'one\nLOCAL\nthree\n');
  });

  test('17. fetch with nothing ahead matches the remote; with an unpushed commit it reports {ahead:1}', () => {
    const { remote, root, clone } = setupWithClone();
    remote.commitPage('From-Web', 'web\n');

    const a = wiki.fetch(root);

    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(a.ahead, 0);
    assert.equal(a.updated, true);
    assert.equal(wiki.headSha(root), remote.headSha());
    assert.equal(fs.readFileSync(path.join(clone, 'From-Web.md'), 'utf-8'), 'web\n');

    // An unpushed local commit (what a pending wiki-push op leaves behind).
    wiki.writePage(root, 'Local-Only', 'local\n');
    out(clone, ['add', '-A']);
    out(clone, ['commit', '-q', '-m', 'local only']);
    remote.commitPage('From-Web-2', 'web2\n');

    const b = wiki.fetch(root);

    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(b.ahead, 1);
    assert.equal(fs.readFileSync(path.join(clone, 'Local-Only.md'), 'utf-8'), 'local\n', 'local commit retained');
    assert.equal(fs.readFileSync(path.join(clone, 'From-Web-2.md'), 'utf-8'), 'web2\n', 'remote change rebased in');
    assert.equal(out(clone, ['rev-list', '--count', 'origin/master..HEAD']), '1');
  });

  test('17b. fetch never discards a page that is written but not yet committed', () => {
    const { remote, root, clone } = setupWithClone();
    wiki.writePage(root, 'Pending-Page', 'not pushed yet\n');
    remote.commitPage('From-Web', 'web\n');

    const r = wiki.fetch(root);

    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.dirty, true);
    assert.equal(r.updated, false);
    assert.equal(fs.readFileSync(path.join(clone, 'Pending-Page.md'), 'utf-8'), 'not pushed yet\n');
  });

  test('18. a remote that has moved away is a classified failure, never a throw', () => {
    const { remote, root } = setupWithClone();
    wiki.writePage(root, 'Objective-7-store-demo', 'x\n');
    remote.goOffline();

    let r;
    assert.doesNotThrow(() => {
      r = wiki.push(root, { message: 'm' });
    });

    assert.equal(r.ok, false);
    assert.ok(r.offline === true || r.uninitialised === true, JSON.stringify(r));
    assert.equal(r.committed, true, 'the local commit is kept for the next attempt');
    assert.doesNotThrow(() => wiki.fetch(root));
  });

  test('19. the docs backend: same interface, writes docs/aoforge/<Page>.md, never commits', () => {
    const root = tmpProject();
    out(root, ['init', '-q', '-b', 'main']);
    const git = fakeGit();
    wiki._setRunGit(git);

    const store = wiki.openStore(root, { mode: 'docs' });

    assert.equal(store.mode, 'docs');
    assert.deepEqual(store.listPages(), []);
    assert.equal(store.readPage('Project'), null);
    const w = store.writePage('Project', '# Project\n');
    assert.equal(w.ok, true);
    assert.equal(w.changed, true);
    assert.equal(fs.readFileSync(path.join(root, 'docs', 'aoforge', 'Project.md'), 'utf-8'), '# Project\n');
    assert.equal(store.readPage('Project'), '# Project\n');
    assert.deepEqual(store.listPages(), ['Project']);
    const p = store.push({ message: 'ignored' });
    assert.equal(p.ok, true);
    assert.equal(p.committed, false);
    assert.equal(typeof p.note, 'string');
    assert.equal(store.revisionRef('Project'), 'docs/aoforge/Project.md');
    assert.equal(store.headSha(), null);
    assert.equal(store.fetch().ok, true);
    assert.equal(git.calls.length, 0, 'the docs backend never runs git');
  });

  test('19b. the wiki backend exposes the same interface; its revision is the clone HEAD sha', () => {
    const { remote, root } = setupWithClone();
    const store = wiki.openStore(root, { mode: 'wiki', remote: remote.remoteUrl });

    assert.equal(store.mode, 'wiki');
    for (const fn of ['readPage', 'writePage', 'listPages', 'push', 'fetch', 'headSha', 'revisionRef']) {
      assert.equal(typeof store[fn], 'function', fn);
    }
    assert.deepEqual(store.listPages(), ['Home']);
    store.writePage('Project', '# Project\n');
    assert.equal(store.push({ message: 'project' }).ok, true);
    assert.equal(store.revisionRef('Project'), remote.headSha());
    assert.equal(store.readPage('Project'), '# Project\n');
    assert.deepEqual(store.listPages(), ['Home', 'Project']);
    assert.throws(() => wiki.openStore(root, { mode: 'bogus' }), /mode/);
  });

  test('20. writePage with identical bytes is changed:false and leaves the file mtime alone', () => {
    const { root, clone } = setupWithClone();
    const first = wiki.writePage(root, 'Requirements', '# R\n');
    assert.equal(first.changed, true);
    const file = path.join(clone, 'Requirements.md');
    const old = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(file, old, old);

    const again = wiki.writePage(root, 'Requirements', '# R\n');

    assert.equal(again.ok, true);
    assert.equal(again.changed, false);
    assert.equal(fs.statSync(file).mtimeMs, old.getTime());
    assert.equal(wiki.writePage(root, 'Requirements', '# R2\n').changed, true);

    const docsRoot = tmpProject();
    wiki.writePage(docsRoot, 'Requirements', '# R\n', { mode: 'docs' });
    const docsFile = path.join(docsRoot, 'docs', 'aoforge', 'Requirements.md');
    fs.utimesSync(docsFile, old, old);
    assert.equal(wiki.writePage(docsRoot, 'Requirements', '# R\n', { mode: 'docs' }).changed, false);
    assert.equal(fs.statSync(docsFile).mtimeMs, old.getTime());
  });

  test('20b. page names cannot escape the store directory', () => {
    const { root, clone } = setupWithClone();
    for (const bad of ['../evil', 'a/b', '..', '', '.hidden', 'x\0y']) {
      const w = wiki.writePage(root, bad, 'x');
      assert.equal(w.ok, false, JSON.stringify(bad));
      assert.equal(wiki.readPage(root, bad), null, JSON.stringify(bad));
    }
    assert.ok(!fs.existsSync(path.join(root, '.planning', 'evil.md')));
    assert.deepEqual(fs.readdirSync(clone).filter((f) => f !== '.git'), ['Home.md']);
  });

  test('20c. writePage on the wiki backend without a clone is an error, not a stray directory', () => {
    const root = tmpProject();
    const w = wiki.writePage(root, 'Project', 'x');
    assert.equal(w.ok, false);
    assert.match(w.error, /clone/);
    assert.ok(!fs.existsSync(path.join(root, '.planning', 'wiki')));
  });

  test('20d. listPages returns page names only: no extension, no dotfiles, no .git, sorted', () => {
    const { root, clone } = setupWithClone({ seed: { 'Zeta.md': 'z\n', 'Alpha.md': 'a\n', 'notes.txt': 'n\n' } });
    fs.writeFileSync(path.join(clone, '.hidden.md'), 'h\n');
    fs.mkdirSync(path.join(clone, 'subdir'));
    assert.deepEqual(wiki.listPages(root), ['Alpha', 'Zeta']);
  });

  // ─── 49-04: the wiki diff the PR lifecycle posts when verification passes ───

  test('49-04 10. diff is the unified diff of the wiki between two revisions; \'\' when nothing changed', () => {
    const { root } = setupWithClone();
    const base = wiki.headSha(root);
    assert.equal(wiki.writePage(root, 'Objective-49-demo', '# Objective 49\n\nfirst line\n').ok, true);
    const p = wiki.push(root, { message: 'objective 49' });
    assert.equal(p.ok, true, JSON.stringify(p));

    const d = wiki.diff(root, base);
    assert.equal(typeof d, 'string', 'success is the diff text itself');
    assert.match(d, /^diff --git a\/Objective-49-demo\.md b\/Objective-49-demo\.md/m);
    assert.match(d, /^\+first line$/m);
    assert.ok(!/\x1b\[/.test(d), 'no colour codes');

    assert.equal(wiki.diff(root, base, p.sha), d, 'toSha defaults to HEAD');
    assert.equal(wiki.diff(root, p.sha, p.sha), '', 'same revision twice: no changes');
    assert.equal(wiki.diff(root, base, base), '');
    assert.match(wiki.diff(root, p.sha, base), /^-first line$/m, 'the order of the two revisions matters');
  });

  test('49-04 10b. no wiki clone is {ok:false, reason:"no-wiki-clone"} and runs no git', () => {
    const calls = [];
    wiki._setRunGit((args) => { calls.push(args); return { ok: true, status: 0, stdout: '', stderr: '' }; });

    const noPlanning = tmpProject();
    assert.deepEqual(wiki.diff(noPlanning, 'abc1234'), { ok: false, reason: 'no-wiki-clone', error: `no wiki clone at ${wiki.WIKI_DIR_REL}` });

    const dirNoGit = tmpProject();
    fs.mkdirSync(path.join(dirNoGit, '.planning', 'wiki'), { recursive: true });
    assert.equal(wiki.diff(dirNoGit, 'abc1234').reason, 'no-wiki-clone', 'a wiki dir that is not a clone');
    assert.equal(calls.length, 0);
  });

  test('49-04 10c. a bad revision is a result, and an option-looking revision is refused before git runs', () => {
    const { root } = setupWithClone();
    const bad = wiki.diff(root, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'git-failed');
    assert.ok(bad.error.length > 0);

    const calls = [];
    wiki._setRunGit((args) => { calls.push(args); return { ok: true, status: 0, stdout: '', stderr: '' }; });
    for (const evil of ['--output=/tmp/pwned', '-p', '', 'a b', undefined, 7]) {
      const r = wiki.diff(root, evil);
      assert.equal(r.ok, false, `from=${String(evil)}`);
      assert.equal(r.reason, 'bad-revision');
      // an undefined toSha is not bad: it defaults to HEAD
      if (evil !== undefined) assert.equal(wiki.diff(root, 'HEAD', evil).reason, 'bad-revision', `to=${String(evil)}`);
    }
    assert.equal(calls.length, 0, 'git never ran for a refused revision');
  });

  test('49-04 10d. diff runs git diff --no-color <from>..<to> -- inside the wiki clone', () => {
    const { root, clone } = setupWithClone();
    const calls = [];
    wiki._setRunGit((args, opts) => { calls.push({ args, cwd: opts && opts.cwd }); return { ok: true, status: 0, stdout: 'D\n', stderr: '' }; });
    assert.equal(wiki.diff(root, 'abc1234', 'def5678'), 'D\n', 'the output is returned untrimmed');
    assert.deepEqual(calls, [{ args: ['diff', '--no-color', 'abc1234..def5678', '--'], cwd: clone }]);
    calls.length = 0;
    wiki.diff(root, 'abc1234');
    assert.deepEqual(calls.map((c) => c.args), [['diff', '--no-color', 'abc1234..HEAD', '--']]);
  });
});
