'use strict';

// planning-verbs-cli.test.cjs (TRD 48-15) — the df-tools commands over the planning verbs (48-11, 48-12) and the
// store routing of the existing `todo complete` / `milestone complete` / `objective set-status ... complete`.
//
// Test list (TRD 48-15):
//   in-process (fake GitHub)   1 readFrom   2 plan put-trd local --raw   3 store budget refusal   4 store summary post
//   subprocess (df-tools.cjs)  5 every verb line, local   6 store put-trd queues (exit 3), planning mode --raw
//                              7 todo/milestone complete characterization   8 set-status complete == objective complete
//                              9 --help for the new top-level commands writes nothing
//
// Hermetic: in-process tests use hermeticEnv() + the fake installed through the gh-client seam + a local bare wiki
// remote; spawned tests use store-cli-fixtures (offline gh shim, temp HOME/outbox, loopback-offline wiki remote),
// TMPDIR under a temp root (drafts) and NOTIFIER_DISABLE=1. No real GitHub, never ~/.claude, never port 8080.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gh = require('./gh.cjs');
const client = require('./gh-client.cjs');
const mappingLib = require('./gh-mapping.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv, oversizedTrdText, STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');
const { storeCliProject, offlineTable, DF_TOOLS } = require('./__fixtures__/store-cli-fixtures.cjs');
const { installGhShim } = require('./__fixtures__/gh-shim.cjs');
const { makeBackfillProject } = require('./__fixtures__/gh-backfill-fixtures.cjs');

// Required lazily: test 7 is a characterization of TODAY's dispatch and must run before this module exists.
const cli = () => require('./planning-verbs-cli.cjs');

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const D = `objectives/${STORE_FIXTURE.objectiveDir}`;
const ROADMAP_LIB = path.join(__dirname, 'roadmap.cjs');

// ─── In-process harness ──────────────────────────────────────────────────────

/** Run fn with process.exit / stdout / stderr / exitCode captured; `code` is the exit code the CLI asked for. */
function capture(fn) {
  const out = { stdout: '', stderr: '', code: null };
  const saved = { exit: process.exit, out: process.stdout.write, err: process.stderr.write, exitCode: process.exitCode };
  process.exitCode = 0;
  process.exit = (c) => { if (out.code === null) out.code = c === undefined ? 0 : c; };
  process.stdout.write = (chunk) => { out.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { out.stderr += chunk; return true; };
  try {
    out.ret = fn();
  } finally {
    if (out.code === null) out.code = process.exitCode || 0;
    process.exit = saved.exit;
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
    process.exitCode = saved.exitCode === undefined ? 0 : saved.exitCode;
  }
  return out;
}

let S;

function useProject({ store = false, sync = false } = {}) {
  beforeEach((t) => {
    const envh = hermeticEnv();
    const project = makeStoreProject({ store });
    const fake = createFakeGitHub(project.fakeOptions);
    const clock = { t: T0 };
    client._resetClient();
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
    gh._setRunGh(fake.runGh);
    gh._resetCache();
    const savedRemote = process.env.DEVFLOW_WIKI_REMOTE;
    let restoreGit = () => {};
    let remote = null;
    if (gitAvailable()) {
      restoreGit = applyGitTestEnv(path.join(envh.root, 'home'));
      remote = createWikiRemote();
      process.env.DEVFLOW_WIKI_REMOTE = remote.remoteUrl;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pvcli-'));
    S = { envh, project, root: project.root, fake, remote, restoreGit, savedRemote, tmp, skipped: false };
    if (store && !gitAvailable()) {
      S.skipped = true;
      t.skip('git is not available: store-mode verbs push wiki pages');
      return;
    }
    if (sync) {
      const r = gh.syncObjective('7', S.root);
      assert.equal(r.ok, true, JSON.stringify(r));
    }
  });
  afterEach(() => {
    client._resetClient();
    if (S.remote) S.remote.cleanup();
    S.restoreGit();
    if (S.savedRemote === undefined) delete process.env.DEVFLOW_WIKI_REMOTE;
    else process.env.DEVFLOW_WIKI_REMOTE = S.savedRemote;
    fs.rmSync(S.tmp, { recursive: true, force: true });
    S.envh.restore();
    S.project.cleanup();
  });
}

const planningFile = (rel) => path.join(S.root, '.planning', ...rel.split('/'));
const draft = (name, text) => {
  const f = path.join(S.tmp, name);
  fs.writeFileSync(f, text);
  return f;
};
const smallTrd = (nn) => `---\nobjective: ${STORE_FIXTURE.objectiveDir}\ntrd: "${nn}"\ntype: standard\n---\n\n# TRD 7-${nn}\n`;

// ─── 1-4: the CLI layer, in-process ──────────────────────────────────────────

describe('readFrom', () => {
  test('1. --from <path> reads the file; --from - reads injected stdin; missing --from names planning draft', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvcli-read-'));
    try {
      const f = path.join(dir, 'in.md');
      fs.writeFileSync(f, 'from a file\n');
      assert.deepEqual(cli().readFrom(['--from', f]).text, 'from a file\n');
      assert.equal(cli().readFrom(['x', '--from', 'in.md'], { cwd: dir }).text, 'from a file\n', 'relative to cwd');
      assert.equal(cli().readFrom(['--from', '-'], { stdin: () => 'from stdin\n' }).text, 'from stdin\n');
      const missing = cli().readFrom(['put-trd', '7']);
      assert.equal(missing.text, undefined);
      assert.match(missing.error, /--from/);
      assert.match(missing.error, /planning draft/);
      assert.match(cli().readFrom(['--from', path.join(dir, 'nope.md')]).error, /could not read/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('local mode (in-process)', () => {
  useProject({ store: false });

  test('2. plan put-trd writes the file, exit 0, --raw JSON has mode local; zero gh calls', () => {
    const text = smallTrd('04');
    const f = draft('trd.md', text);
    const r = capture(() => cli().cmdPlan(S.root, ['put-trd', '7', '07-04-x-TRD.md', '--from', f], true));
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.mode, 'local');
    assert.equal(payload.rel, `${D}/07-04-x-TRD.md`);
    assert.equal(fs.readFileSync(planningFile(`${D}/07-04-x-TRD.md`), 'utf8'), text);
    assert.equal(S.fake.calls().length, 0, 'zero gh calls');

    const prose = capture(() => cli().cmdPlan(S.root, ['put-trd', '7', '07-05-y-TRD.md', '--from', draft('y.md', smallTrd('05'))], false));
    assert.equal(prose.code, 0, prose.stderr);
    assert.match(prose.stdout, /plan put-trd: wrote \.planning\/objectives\/07-store-demo\/07-05-y-TRD\.md \(local mode\)/);

    const bad = capture(() => cli().cmdPlan(S.root, ['put-trd', '7', '07-06-z-TRD.md'], false));
    assert.equal(bad.code, 1);
    assert.match(bad.stderr, /planning draft/);
    const unknown = capture(() => cli().cmdPlan(S.root, ['bogus'], false));
    assert.equal(unknown.code, 1);
    assert.match(unknown.stderr, /Unknown plan subcommand: bogus\. Available: put-trd, push/);
  });
});

describe('store mode (in-process)', () => {
  describe('budget', () => {
    useProject({ store: true });

    test('3. a TRD over 60,000 encoded chars: exit 1, prose names the budget and split, nothing written', () => {
      if (S.skipped) return;
      const big = oversizedTrdText(61000, { id: '7-04', file: '07-04-x-TRD.md' });
      assert.ok(big.length > 60000);
      const f = draft('big.md', big);
      const r = capture(() => cli().cmdPlan(S.root, ['put-trd', '7', '07-04-x-TRD.md', '--from', f], false));
      assert.equal(r.code, 1, r.stdout + r.stderr);
      assert.match(r.stdout + r.stderr, /budget/i);
      assert.match(r.stdout + r.stderr, /split/);
      assert.equal(fs.existsSync(planningFile(`${D}/07-04-x-TRD.md`)), false, 'nothing written');
      assert.equal(S.fake.calls().length, 0, 'zero gh calls');
    });
  });

  describe('summary post', () => {
    useProject({ store: true, sync: true });

    test('4. summary post 7-01 --from p: exit 0 and the summary comment lands on the TRD issue', () => {
      if (S.skipped) return;
      const text = '# Summary 7-01\n\nDone through the CLI.\n';
      const f = draft('sum.md', text);
      const r = capture(() => cli().cmdSummary(S.root, ['post', '7-01', '--from', f], false));
      assert.equal(r.code, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /summary post: wrote \.planning\/objectives\/07-store-demo\/07-01-alpha-SUMMARY\.md \(store mode\)/);
      const issue = mappingLib.getTrd(mappingLib.readMappingV3(S.root), '7-01').issue_number;
      const summaries = S.fake.comments.filter((c) => c.issue_number === issue && c.body.includes('kind=summary'));
      assert.equal(summaries.length, 1, 'one summary comment on the TRD issue');
      assert.ok(summaries[0].body.includes('Done through the CLI.'));
    });
  });
});

// ─── 5-9: df-tools end to end (spawned) ──────────────────────────────────────

/** A store-cli project (offline gh) with drafts under its own TMPDIR and notifications off. */
function cliProject(opts) {
  const p = storeCliProject(opts);
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pvcli-sub-')));
  const env = { ...p.env, NOTIFIER_DISABLE: '1', TMPDIR: tmp };
  return {
    p,
    tmp,
    env,
    run: (args, input) => spawnSync(process.execPath, [DF_TOOLS, ...args], { cwd: p.root, env, encoding: 'utf-8', timeout: 60000, input }),
    file(name, text) {
      const f = path.join(tmp, name);
      fs.writeFileSync(f, text);
      return f;
    },
    norm: (text) => text.split(p.root).join('<root>'),
    exists: (rel) => fs.existsSync(p.planning(rel)),
    cleanup() {
      p.cleanup();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

/** Run with --raw, assert exit 0, return the parsed JSON result. */
function okRaw(c, args, input) {
  const r = c.run([...args, '--raw'], input);
  assert.equal(r.status, 0, `df-tools ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

describe('df-tools planning verbs, local project', () => {
  test('5. every verb line exits 0 and writes its file; planning mode prints local', () => {
    const c = cliProject({ store: false });
    try {
      const wrote = (res, text, re) => {
        assert.equal(res.mode, 'local', JSON.stringify(res));
        if (re) assert.match(res.rel, re);
        assert.equal(c.p.read(res.rel), text, res.rel);
      };

      const trd = smallTrd('04');
      wrote(okRaw(c, ['plan', 'put-trd', '7', '07-04-delta-TRD.md', '--from', c.file('trd.md', trd)]), trd, /07-04-delta-TRD\.md$/);
      assert.equal(okRaw(c, ['plan', 'push', '7']).skipped, 'local mode');

      const obj = '---\nobjective: 07-store-demo\nstatus: planned\n---\n\n# Objective 7: Store demo\n';
      wrote(okRaw(c, ['objective', 'put', '7', '--from', c.file('obj.md', obj)]), obj, /OBJECTIVE\.md$/);
      okRaw(c, ['objective', 'set-status', '7', 'in_progress']);
      assert.match(c.p.read(`${D}/OBJECTIVE.md`), /^status: in_progress$/m);

      wrote(okRaw(c, ['summary', 'post', '7-02', '--from', c.file('s.md', '# S2\n')]), '# S2\n', /07-02.*SUMMARY\.md$/);
      wrote(okRaw(c, ['summary', 'checkpoint', '7-03', '--from', c.file('ck.md', '# wip\n')]), '# wip\n', /07-03.*SUMMARY\.md$/);
      wrote(okRaw(c, ['verification', 'post', '7', '--from', c.file('v.md', '# V\n')]), '# V\n', /VERIFICATION\.md$/);
      wrote(okRaw(c, ['doc', 'put', 'research/a.md', '--from', '-'], '# Research A\n'), '# Research A\n', /^research\/a\.md$/);

      const opened = okRaw(c, ['decision', 'open', '7-01', '--question', 'Pick A or B?']);
      assert.match(opened.rel, /^decisions\/pending\/DECISION-\d+\.md$/);
      assert.ok(c.exists(opened.rel));
      okRaw(c, ['decision', 'answer', opened.id, '--text', 'A']);
      assert.ok(c.exists(`decisions/resolved/${opened.id}.md`));

      wrote(okRaw(c, ['todo', 'add', '--from', c.file('t.md', 'title: demo\n'), '--stem', '2026-10-01-demo']), 'title: demo\n', /^todos\/pending\/2026-10-01-demo\.md$/);
      const done = c.run(['todo', 'complete', '2026-10-01-demo']);
      assert.equal(done.status, 0, done.stderr);
      assert.equal(JSON.parse(done.stdout).completed, true);
      assert.ok(c.exists('todos/completed/2026-10-01-demo.md') && !c.exists('todos/pending/2026-10-01-demo.md'));

      wrote(okRaw(c, ['debug', 'put', 'flaky-login', '--from', c.file('d.md', '# Debug\n')]), '# Debug\n', /^debug\/flaky-login\.md$/);
      okRaw(c, ['debug', 'resolve', 'flaky-login']);
      assert.ok(c.exists('debug/resolved/flaky-login.md'));

      wrote(okRaw(c, ['quick', 'put', '3', 'fix-typo', '--from', c.file('j.md', '# Job\n')]), '# Job\n', /^quick\/.*JOB\.md$/);
      wrote(okRaw(c, ['quick', 'summary', '3', '--from', c.file('qs.md', '# Done\n')]), '# Done\n', /^quick\/.*SUMMARY\.md$/);

      okRaw(c, ['milestone', 'put', 'v1.0', '--from', c.file('m.md', '## v1.0\n\nShipped.\n')]);
      assert.match(c.p.read('MILESTONES.md'), /## v1\.0/);

      const d = okRaw(c, ['planning', 'draft', `${D}/OBJECTIVE.md`]);
      assert.ok(d.path.startsWith(c.tmp), d.path);
      assert.equal(fs.readFileSync(d.path, 'utf8'), c.p.read(`${D}/OBJECTIVE.md`), 'seeded from the cache file');

      const mode = c.run(['planning', 'mode']);
      assert.equal(mode.status, 0);
      assert.equal(mode.stdout, 'local\n');

      const imp = c.run(['planning', 'import']);
      assert.equal(imp.status, 1, 'a real import needs store mode');
      assert.match(imp.stderr, /github\.store/);
      // 51-05: with github enabled a dry run is the backfill preview, not a refusal.
      const preview = c.run(['planning', 'import', '--dry-run']);
      assert.equal(preview.status, 0, preview.stderr);
      assert.match(preview.stdout, /^preview \(store is off\)/m);

      const bogus = c.run(['plan', 'bogus']);
      assert.equal(bogus.status, 1);
      assert.match(bogus.stderr, /Available: put-trd, push/);
    } finally {
      c.cleanup();
    }
  });
});

describe('df-tools planning verbs, store project (offline gh)', { skip: gitAvailable() ? false : 'git is not available' }, () => {
  test('6. plan put-trd queues the hierarchy push and exits 3 (pending); planning mode --raw says store', () => {
    const c = cliProject({ store: true });
    try {
      const r = c.run(['plan', 'put-trd', '7', '07-04-delta-TRD.md', '--from', c.file('trd.md', smallTrd('04'))]);
      assert.equal(r.status, 3, `${r.stdout}\n${r.stderr}`);
      assert.ok(c.p.journalOps().length > 0, 'the journal holds the op');
      assert.equal(c.p.read(`${D}/07-04-delta-TRD.md`), smallTrd('04'));
      const mode = okRaw(c, ['planning', 'mode']);
      assert.equal(mode.mode, 'store');
      assert.equal(mode.root, c.p.root);
    } finally {
      c.cleanup();
    }
  });
});

describe('51-05 planning import --dry-run prints the backfill plan', () => {
  test('6. preview prose: estimate, history and the will-stay-local table; --raw carries estimate; zero gh calls', () => {
    const project = makeBackfillProject({ objectives: 2, git: false });
    const envRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pvcli-backfill-')));
    const shim = installGhShim({ dir: path.join(envRoot, 'shim'), table: offlineTable(), defaultCode: 1 });
    const env = shim.env({
      DEVFLOW_OUTBOX_DIR: path.join(envRoot, 'outbox'),
      NOTIFIER_DISABLE: '1',
      TMPDIR: envRoot,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    });
    const run = (args) => spawnSync(process.execPath, [DF_TOOLS, '--cwd', project.root, ...args], { cwd: envRoot, env, encoding: 'utf-8', timeout: 60000 });
    try {
      const r = run(['planning', 'import', '--dry-run']);
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      const lines = r.stdout.split('\n');
      assert.equal(lines[0], 'preview (store is off): this is what the GitHub backfill would queue.');
      assert.match(r.stdout, /^planning import \(dry run\): queued 2 objective, 1 decision, /m);
      assert.match(r.stdout, /^estimate: ~\d+ writes \(upper bound\) in \d+ ops; /m);
      assert.match(r.stdout, /^history: 12 closed \(completed\), 0 closed \(not planned\)$/m);
      assert.match(r.stdout, /^will stay local:$/m);
      assert.match(r.stdout, /^ {2}\| decisions\/resolved\/DECISION-001\.md \| no trd: field; /m, 'the decision without trd: is a table row');

      const raw = run(['planning', 'import', '--dry-run', '--raw']);
      assert.equal(raw.status, 0, raw.stderr);
      const json = JSON.parse(raw.stdout);
      assert.equal(json.preview, true);
      assert.equal(json.estimate.objectives, 2);
      assert.equal(typeof json.estimate.writes_max, 'number');
      assert.deepEqual(json.history, { closed_completed: 12, closed_not_planned: 0 });
      assert.deepEqual(shim.readCalls(), [], 'zero gh calls');
    } finally {
      project.cleanup();
      fs.rmSync(envRoot, { recursive: true, force: true });
    }
  });
});

describe('local behaviour of the existing commands is unchanged', () => {
  test('7. todo complete and milestone complete print exactly what the library commands print', () => {
    const a = cliProject({ store: false });
    const b = cliProject({ store: false });
    try {
      for (const c of [a, b]) {
        fs.mkdirSync(c.p.planning('todos/pending'), { recursive: true });
        fs.writeFileSync(c.p.planning('todos/pending/2026-09-30-x.md'), 'title: x\n');
      }
      const today = new Date().toISOString().split('T')[0];
      const prose = a.run(['todo', 'complete', '2026-09-30-x.md']);
      assert.equal(prose.status, 0, prose.stderr);
      assert.equal(prose.stdout, JSON.stringify({ completed: true, file: '2026-09-30-x.md', date: today }, null, 2));
      const raw = b.run(['todo', 'complete', '2026-09-30-x.md', '--raw']);
      assert.equal(raw.status, 0, raw.stderr);
      assert.equal(raw.stdout, 'completed');
      for (const c of [a, b]) assert.equal(c.p.read('todos/completed/2026-09-30-x.md'), `completed: ${today}\ntitle: x\n`);

      const missing = a.run(['todo', 'complete', 'nope.md']);
      assert.equal(missing.status, 1);
      assert.equal(missing.stderr, 'Error: Todo not found: nope.md\n');

      const viaDispatch = a.run(['milestone', 'complete', 'v1.0', '--name', 'Store', 'Demo', '--archive-objectives']);
      const direct = spawnSync(process.execPath, ['-e',
        `require(${JSON.stringify(ROADMAP_LIB)}).cmdMilestoneComplete(process.cwd(), 'v1.0', {name: 'Store Demo', archiveObjectives: true}, false)`,
      ], { cwd: b.p.root, env: b.env, encoding: 'utf-8', timeout: 60000 });
      assert.equal(viaDispatch.status, direct.status, viaDispatch.stderr + direct.stderr);
      assert.equal(viaDispatch.status, 0, viaDispatch.stderr);
      assert.equal(a.norm(viaDispatch.stdout), b.norm(direct.stdout));
      const snap = (c) => JSON.parse(c.norm(JSON.stringify(c.p.snapshot())));
      assert.deepEqual(snap(a), snap(b), 'the same files with the same bytes');
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});

describe('objective set-status complete (local)', () => {
  test('8. writes status: complete, then has exactly today\'s objective complete effects', () => {
    const a = cliProject({ store: false });
    const b = cliProject({ store: false });
    try {
      const ra = a.run(['objective', 'set-status', '7', 'complete']);
      const rb = b.run(['objective', 'complete', '7']);
      assert.equal(ra.status, 0, ra.stderr);
      assert.equal(rb.status, 0, rb.stderr);
      assert.ok(ra.stdout.length > 0);
      assert.equal(a.norm(ra.stdout), b.norm(rb.stdout), 'objective complete output');
      assert.match(a.p.read(`${D}/OBJECTIVE.md`), /^status: complete$/m);
      assert.equal(a.p.read('ROADMAP.md'), b.p.read('ROADMAP.md'));
      const snap = (c) => {
        const s = JSON.parse(c.norm(JSON.stringify(c.p.snapshot())));
        delete s[`${D}/OBJECTIVE.md`];
        return s;
      };
      assert.deepEqual(snap(a), snap(b), 'ROADMAP/STATE and everything else as objective complete leaves it');
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});

describe('help', () => {
  test('9. --help for every new top-level command prints usage, exits 0, writes nothing', () => {
    const c = cliProject({ store: false });
    try {
      const before = c.p.snapshot();
      for (const cmd of ['plan', 'summary', 'verification', 'doc', 'decision', 'debug', 'quick']) {
        const r = c.run([cmd, '--help']);
        assert.equal(r.status, 0, `${cmd} --help\n${r.stderr}`);
        assert.match(r.stdout, new RegExp(`^Usage: df-tools ${cmd} `));
        assert.match(r.stdout, /WRITES/);
      }
      assert.match(c.run(['plan', '--help']).stdout, /plan put-trd <objective> <file-name> --from <path\|->/);
      assert.match(c.run(['planning', '--help']).stdout, /planning mode/);
      assert.deepEqual(c.p.snapshot(), before, 'nothing written');
    } finally {
      c.cleanup();
    }
  });
});

// quick-29 (CodeQL js/incomplete-sanitization, alert 144): the stay-local table cell escaped `|` but not
// the backslash before it, so a rel ending in `\` (or holding `\|`) broke out of its cell.
describe('quick-29: stayLocalTable escapes a backslash before the pipe in a cell', () => {
  test('8b: `a\\|b.md` and `c\\d` render as `a\\\\\\|b.md` and `c\\\\d`; a newline flattens to a space', () => {
    const lines = cli().stayLocalTable({
      kept_local: [
        { rel: 'a\\|b.md', reason: 'c\\d' },
        { rel: 'x\ny.md', reason: 'p\r\nq' },
      ],
    });
    assert.ok(lines.includes('  | a\\\\\\|b.md | c\\\\d |'), lines.join('\n'));
    assert.ok(lines.includes('  | x y.md | p q |'), lines.join('\n'));
  });
});

// 55-05 item 55-2: `objective put N` for an objective nothing registered names `objective add`, the step that works.
describe('55-05 objective put on an unknown objective names objective add', () => {
  test('1. local mode: exit 1, stderr names `objective add`, nothing is written', () => {
    const c = cliProject({ store: false });
    try {
      const before = c.p.snapshot();
      const r = c.run(['objective', 'put', '9', '--from', c.file('obj9.md', '---\nobjective: 09-new\nstatus: planned\n---\n\n# Objective 9\n')]);
      assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /objective 9 is not known/);
      assert.match(r.stderr, /objective add/);
      assert.deepEqual(c.p.snapshot(), before, 'nothing written');
    } finally {
      c.cleanup();
    }
  });

  test('2. store mode: same exit and hint, and nothing is queued', { skip: gitAvailable() ? false : 'git is not available' }, () => {
    const c = cliProject({ store: true });
    try {
      const r = c.run(['objective', 'put', '9', '--from', c.file('obj9.md', '---\nobjective: 09-new\nstatus: planned\n---\n\n# Objective 9\n')]);
      assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /objective 9 is not known/);
      assert.match(r.stderr, /objective add/);
      assert.deepEqual(c.p.journalOps(), [], 'nothing queued');
    } finally {
      c.cleanup();
    }
  });

  test('2b. every verb sharing objectiveTarget carries the hint (plan put-trd, verification post)', () => {
    const c = cliProject({ store: false });
    try {
      const trd = c.run(['plan', 'put-trd', '9', '09-01-x-TRD.md', '--from', c.file('t.md', smallTrd('01'))]);
      assert.equal(trd.status, 1, `${trd.stdout}\n${trd.stderr}`);
      assert.match(trd.stderr, /objective add/);
      const ver = c.run(['verification', 'post', '9', '--from', c.file('v.md', '# V\n')]);
      assert.equal(ver.status, 1, `${ver.stdout}\n${ver.stderr}`);
      assert.match(ver.stderr, /objective add/);
    } finally {
      c.cleanup();
    }
  });
});
