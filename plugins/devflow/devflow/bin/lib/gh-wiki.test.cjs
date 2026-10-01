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

  test('7d. an unset git identity commits as DevFlow; a configured one is left alone', () => {
    const rootA = projectWithClone();
    const noIdentity = fakeGit((a) => (a.join(' ') === 'diff --cached --quiet' ? FAIL('') : undefined));
    wiki._setRunGit(noIdentity);
    wiki.push(rootA, { message: 'm', remote: FILE_REMOTE });
    const commitA = noIdentity.calls.find((c) => stripC(c.args)[0] === 'commit');
    assert.deepEqual(commitA.args.slice(0, 4), ['-c', 'user.name=DevFlow', '-c', 'user.email=devflow@users.noreply.github.com']);

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
