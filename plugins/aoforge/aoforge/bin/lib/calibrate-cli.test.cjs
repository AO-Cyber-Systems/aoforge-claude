'use strict';

// calibrate-cli.test.cjs (TRD 57-06, EST-01) — `aof-tools calibrate`, the command that writes calibration.json.
//
// Test list (TRD 57-06), outermost first. Every test spawns the real aof-tools with `--cwd <dir>`:
//   1 --paths <beta> --out <file> writes a parsable file; JSON stdout reports changed:true, samples.trds 5, out
//   2 the same command again: identical bytes, changed:false
//   3 no --out: the file lands in <fake HOME>/.claude/aoforge/calibration.json
//   4 AOFORGE_CALIBRATION_PATH is used with no --out; with both, --out wins
//   5 --dry-run reports dry_run:true and creates no file
//   6 no --paths: the checkout holding cwd is calibrated; outside a project it exits 1 naming --paths
//   7 --rates: a rates file without claude-opus-5-5 leaves it unpriced; a rates file missing `source` exits 1
//   8 --raw prints exactly one line
//   9 --help exits 0; an unknown flag exits 1 with the usage line
//   extra: AOFORGE_CALIBRATE_PATHS (path.delimiter), relative --paths / --out resolve against cwd, the dispatch
//          no-argument case never writes the default file
//
// Hermetic: every project, home and output file lives in an fs.mkdtemp directory. Every spawned run gets HOME=<fake home>
// and has AOFORGE_CALIBRATION_PATH / AOFORGE_CALIBRATE_PATHS removed from its environment, so the real
// ~/.claude/aoforge/calibration.json can never be resolved, read or written. The BETA history is a literal copy of the one
// in calibrator.test.cjs (a test file is not imported from another test file); the project builder is the 57-02 fixture.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  makeCalibrationProject, removeCalibrationProject, ALPHA_SPEC, FUTURE_SPEC,
} = require('./__fixtures__/calibration-fixtures.cjs');
const fx = require('./__fixtures__/transcript-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const USAGE = /aof-tools calibrate /;

// The hand-built BETA history, literal. Five TRDs in two objectives:
//   70-a/01  code_tdd + doc            10min
//   70-a/02  one code_tdd              8min
//   70-a/03  three code_tdd            12min + tokens (140747 in / 1370 out, Opus 5.5)
//   71-b/01  one code_tdd + checkpoint 30min, autonomous:false, gap_closure:true
//   71-b/02  one prompt, no SUMMARY, 6min from its Performance Metrics row
// 7 task samples: code_tdd 5, doc 1, prompt 1.
const BETA_SPEC = {
  name: 'beta',
  objectives: [
    {
      dir: '70-a',
      trds: [
        {
          nn: '01', slug: 'first',
          tasks: [
            { name: 'Task 1: a', type: 'auto', tdd: true, files: ['lib/a.cjs', 'lib/a.test.cjs'] },
            { name: 'Task 2: readme', type: 'auto', files: ['README.md'] },
          ],
          summary: { duration: '10min', completed: '2026-09-01' },
        },
        {
          nn: '02', slug: 'second',
          tasks: [{ name: 'Task 1: b', type: 'auto', tdd: true, files: ['lib/b.cjs', 'lib/b.test.cjs'] }],
          summary: { duration: '8min', completed: '2026-09-02' },
        },
        {
          nn: '03', slug: 'third',
          tasks: [
            { name: 'Task 1: c', type: 'auto', tdd: true, files: ['lib/c.cjs', 'lib/c.test.cjs'] },
            { name: 'Task 2: d', type: 'auto', tdd: true, files: ['lib/d.cjs', 'lib/d.test.cjs'] },
            { name: 'Task 3: e', type: 'auto', tdd: true, files: ['lib/e.cjs', 'lib/e.test.cjs'] },
          ],
          summary: {
            duration: '12min', completed: '2026-10-05',
            tokens_input: 140747, tokens_output: 1370, tokens_cache_read: 121144, tokens_cache_write: 19596,
            token_model: 'claude-opus-5-5',
          },
        },
      ],
    },
    {
      dir: '71-b',
      trds: [
        {
          nn: '01', slug: 'gated', frontmatter: { autonomous: false, gap_closure: true },
          tasks: [
            { name: 'Task 1: f', type: 'auto', tdd: true, files: ['lib/f.cjs', 'lib/f.test.cjs'] },
            { name: 'Task 2: verify', type: 'checkpoint:human-verify', files: [] },
          ],
          summary: { duration: '30min', completed: '2026-09-20' },
        },
        {
          nn: '02', slug: 'prompt',
          tasks: [{ name: 'Task 1: skill', type: 'auto', files: ['skills/x/SKILL.md'] }],
          summary: null,
        },
      ],
    },
  ],
  stateArchiveRows: ['| Objective 71 P02 | 6min | 1 tasks | 1 files |'],
};

// A rates file with one model and no claude-opus-5-5: BETA's token sample has no price.
const FABLE_ONLY_RATES = {
  currency: 'USD',
  unit: 'per million tokens',
  models: {
    'claude-fable-5-1': {
      input: 10, cache_write_5m: 12.5, cache_write_1h: 20, cache_read: 0.25, output: 50,
      source: 'https://platform.claude.com/docs/en/about-claude/pricing', as_of: '2026-10-05',
    },
  },
  aliases: {},
};

// ─── fixtures ────────────────────────────────────────────────────────────────

const toRemove = [];
afterEach(() => {
  while (toRemove.length) {
    const r = toRemove.pop();
    if (r.project) removeCalibrationProject(r.project);
    else fs.rmSync(r.dir, { recursive: true, force: true });
  }
});

function tmpDir(prefix = 'df-calibrate-cli-') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  toRemove.push({ dir });
  return dir;
}

function project(spec) {
  const root = makeCalibrationProject(spec);
  toRemove.push({ project: root });
  return root;
}

/** A fresh scratch dir plus a fake HOME. Spawned runs can only resolve this home, never the real one. */
function sandbox() {
  const tmp = tmpDir();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  return { tmp, home, defaultOut: path.join(home, '.claude', 'aoforge', 'calibration.json') };
}

/**
 * Spawn `aof-tools --cwd <cwd> calibrate ...args` with HOME = the fake home. `env` adds variables; the two calibrate
 * variables of the outer environment are always removed first.
 */
function run(sb, cwd, args, env = {}) {
  const base = { ...process.env, HOME: sb.home, NOTIFIER_DISABLE: '1' };
  delete base.AOFORGE_CALIBRATION_PATH;
  delete base.AOFORGE_CALIBRATE_PATHS;
  return spawnSync(process.execPath, [DF_TOOLS, '--cwd', cwd, 'calibrate', ...args], {
    cwd: sb.tmp, env: { ...base, ...env }, encoding: 'utf-8', timeout: 60000,
  });
}

/** Run, assert exit 0 and return the parsed JSON stdout. */
function okJson(sb, cwd, args, env) {
  const r = run(sb, cwd, args, env);
  assert.equal(r.status, 0, `calibrate ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ─── 1-9 ─────────────────────────────────────────────────────────────────────

describe('aof-tools calibrate (end to end)', () => {
  test('1. writes a parsable calibration.json and reports changed:true, samples.trds 5 and the out path', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    const result = okJson(sb, sb.tmp, ['--paths', beta, '--out', out]);

    assert.equal(result.out, out);
    assert.equal(result.changed, true);
    assert.equal(result.dry_run, false);
    assert.equal(result.samples.trds, 5);
    assert.equal(result.samples.tasks, 7);
    assert.equal(result.samples.with_tokens, 1);
    assert.deepEqual(result.classes, { code_tdd: 5, doc: 1, prompt: 1 }, '`all` is samples.tasks, so it is not repeated');
    assert.deepEqual(result.unpriced_models, []);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].project, 'beta');
    assert.match(result.inputs_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.data_as_of, '2026-10-05');
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'task_classes'), false, 'stdout is a summary, not the calibration');

    assert.ok(fs.existsSync(out), 'the file exists');
    const written = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.equal(written.version, 3);
    assert.deepEqual(written.method, { minutes: 'trd_level', window_objectives: 10, through_objective: null });
    assert.deepEqual(result.method, written.method);
    assert.equal(written.samples.trds, 5);
    assert.equal(written.inputs_digest, result.inputs_digest);
  });

  test('2. the same command twice gives byte-identical files and changed:false', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    assert.equal(okJson(sb, sb.tmp, ['--paths', beta, '--out', out]).changed, true);
    const first = fs.readFileSync(out);
    const mtime = fs.statSync(out).mtimeMs;

    const second = okJson(sb, sb.tmp, ['--paths', beta, '--out', out]);
    assert.equal(second.changed, false);
    assert.ok(first.equals(fs.readFileSync(out)), 'bytes are identical');
    assert.equal(fs.statSync(out).mtimeMs, mtime, 'an unchanged file is not rewritten');
  });

  test('3. with no --out the file lands at <HOME>/.claude/aoforge/calibration.json', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    assert.equal(fs.existsSync(sb.defaultOut), false);

    const result = okJson(sb, sb.tmp, ['--paths', beta]);

    assert.equal(result.out, sb.defaultOut);
    assert.ok(fs.existsSync(sb.defaultOut), 'written under the fake home');
    assert.equal(JSON.parse(fs.readFileSync(sb.defaultOut, 'utf-8')).samples.trds, 5);
  });

  test('4. AOFORGE_CALIBRATION_PATH is the default out; --out wins over it', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const envOut = path.join(sb.tmp, 'env.json');
    const flagOut = path.join(sb.tmp, 'flag.json');

    const viaEnv = okJson(sb, sb.tmp, ['--paths', beta], { AOFORGE_CALIBRATION_PATH: envOut });
    assert.equal(viaEnv.out, envOut);
    assert.ok(fs.existsSync(envOut));
    assert.equal(fs.existsSync(sb.defaultOut), false, 'the home default is not used');
    fs.rmSync(envOut);

    const both = okJson(sb, sb.tmp, ['--paths', beta, '--out', flagOut], { AOFORGE_CALIBRATION_PATH: envOut });
    assert.equal(both.out, flagOut);
    assert.ok(fs.existsSync(flagOut));
    assert.equal(fs.existsSync(envOut), false, 'env.json is not created when --out is given');
  });

  test('5. --dry-run reports dry_run:true and creates no file', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    const result = okJson(sb, sb.tmp, ['--paths', beta, '--out', out, '--dry-run']);

    assert.equal(result.dry_run, true);
    assert.equal(result.out, out);
    assert.equal(result.samples.trds, 5);
    assert.equal(fs.existsSync(out), false, 'nothing written to --out');
    assert.equal(fs.existsSync(sb.defaultOut), false, 'nothing written to the home default');
    assert.equal(fs.existsSync(`${out}.tmp`), false);
  });

  test('5b. --dry-run beside an existing file leaves it untouched and says whether a write would change it', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    okJson(sb, sb.tmp, ['--paths', beta, '--out', out]);

    assert.equal(okJson(sb, sb.tmp, ['--paths', beta, '--out', out, '--dry-run']).changed, false, 'same inputs: no change');
    fs.writeFileSync(out, '{}\n');
    assert.equal(okJson(sb, sb.tmp, ['--paths', beta, '--out', out, '--dry-run']).changed, true, 'a different file would change');
    assert.equal(fs.readFileSync(out, 'utf-8'), '{}\n', 'dry run does not repair it');
  });

  test('6. with no --paths it calibrates the checkout holding cwd; outside a project it exits 1 naming --paths', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    const here = okJson(sb, beta, ['--out', out]);
    assert.equal(here.sources[0].project, 'beta');
    assert.equal(here.samples.trds, 5);

    const empty = tmpDir('df-calibrate-empty-');
    const r = run(sb, empty, ['--out', path.join(sb.tmp, 'never.json')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--paths/);
    assert.equal(fs.existsSync(path.join(sb.tmp, 'never.json')), false);
  });

  test('6b. the dispatcher-style call (no args, empty cwd, fake HOME) exits 1 with a usage-style message and writes nothing', () => {
    const sb = sandbox();
    const empty = tmpDir('df-calibrate-empty-');

    const r = run(sb, empty, []);

    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stderr, /Unknown command/);
    assert.match(r.stderr, /no AOForge project/);
    assert.match(r.stderr, /--paths/);
    assert.equal(fs.existsSync(sb.defaultOut), false, 'never creates the default calibration file when no project resolves');
  });

  test('6c. AOFORGE_CALIBRATE_PATHS (path.delimiter separated) names the projects when --paths is absent', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const alpha = project(ALPHA_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    const empty = tmpDir('df-calibrate-empty-');

    const result = okJson(sb, empty, ['--out', out], { AOFORGE_CALIBRATE_PATHS: [beta, alpha].join(path.delimiter) });

    assert.deepEqual(result.sources.map((s) => s.project), ['alpha', 'beta']);
    assert.ok(result.samples.trds > 5, 'both projects contribute samples');
  });

  test('6d. --paths is comma separated and relative paths resolve against cwd, as does --out', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const alpha = project(ALPHA_SPEC);

    const both = okJson(sb, sb.tmp, ['--paths', `${beta},${alpha}`, '--out', path.join(sb.tmp, 'both.json')]);
    assert.deepEqual(both.sources.map((s) => s.project), ['alpha', 'beta']);

    const rel = path.relative(sb.tmp, beta);
    const result = okJson(sb, sb.tmp, ['--paths', rel, '--out', path.join('nested', 'rel.json')]);
    assert.equal(result.out, path.join(sb.tmp, 'nested', 'rel.json'));
    assert.ok(fs.existsSync(path.join(sb.tmp, 'nested', 'rel.json')), 'written relative to cwd');
    assert.equal(result.sources[0].project, 'beta');
  });

  test('6e. --paths that holds no project exits 1 and writes nothing, so an empty history cannot overwrite a good file', () => {
    const sb = sandbox();
    const nowhere = tmpDir('df-calibrate-nowhere-');
    const out = path.join(sb.tmp, 'c.json');
    fs.writeFileSync(out, '{"keep":"me"}\n');

    const r = run(sb, sb.tmp, ['--paths', nowhere, '--out', out]);

    assert.equal(r.status, 1);
    assert.match(r.stderr, /no AOForge project/);
    assert.equal(fs.readFileSync(out, 'utf-8'), '{"keep":"me"}\n', 'the existing file is untouched');
    assert.equal(fs.existsSync(sb.defaultOut), false);
  });

  test('7. --rates without claude-opus-5-5 leaves it unpriced; a rates file missing `source` exits 1 naming the model', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    const rates = path.join(sb.tmp, 'rates.json');
    fs.writeFileSync(rates, `${JSON.stringify(FABLE_ONLY_RATES, null, 2)}\n`);
    const result = okJson(sb, sb.tmp, ['--paths', beta, '--out', out, '--rates', rates]);
    assert.ok(result.unpriced_models.includes('claude-opus-5-5'), `unpriced: ${JSON.stringify(result.unpriced_models)}`);

    const broken = JSON.parse(JSON.stringify(FABLE_ONLY_RATES));
    delete broken.models['claude-fable-5-1'].source;
    const badRates = path.join(sb.tmp, 'bad-rates.json');
    fs.writeFileSync(badRates, `${JSON.stringify(broken, null, 2)}\n`);
    const badOut = path.join(sb.tmp, 'bad.json');
    const r = run(sb, sb.tmp, ['--paths', beta, '--out', badOut, '--rates', badRates]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /claude-fable-5-1/);
    assert.equal(fs.existsSync(badOut), false, 'a bad rates file writes nothing');
  });

  test('8. --raw prints exactly one line: changed, then unchanged, then dry run', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    // The fake HOME has no ~/.claude/projects, so the overhead scan runs and finds nothing.
    // 67-02: the summary always ends with the minutes method.
    const tail = '5 TRDs, 7 tasks, 1 with tokens · classes code_tdd 5, doc 1, prompt 1 · overhead none · minutes trd_level';
    const oneLine = (r) => {
      assert.equal(r.status, 0, r.stderr);
      const text = r.stdout.replace(/\n$/, '');
      assert.equal(text.includes('\n'), false, 'one line');
      return text;
    };

    assert.equal(oneLine(run(sb, sb.tmp, ['--paths', beta, '--out', out, '--raw'])), `calibration ${out}: changed · ${tail}`);
    assert.equal(oneLine(run(sb, sb.tmp, ['--paths', beta, '--out', out, '--raw'])), `calibration ${out}: unchanged · ${tail}`);
    assert.equal(oneLine(run(sb, sb.tmp, ['--paths', beta, '--out', out, '--raw', '--dry-run'])), `calibration ${out}: dry run · ${tail}`);
  });

  test('9. --help exits 0 with the usage line; an unknown flag or a stray positional exits 1 with it', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);

    const help = run(sb, sb.tmp, ['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, USAGE);

    const bogus = run(sb, sb.tmp, ['--bogus']);
    assert.equal(bogus.status, 1);
    assert.match(bogus.stderr, USAGE);
    assert.match(bogus.stderr, /--bogus/);

    const stray = run(sb, sb.tmp, ['--paths', beta, 'extra']);
    assert.equal(stray.status, 1);
    assert.match(stray.stderr, USAGE);

    const noValue = run(sb, sb.tmp, ['--paths']);
    assert.equal(noValue.status, 1);
    assert.match(noValue.stderr, /--paths needs a value/);
    assert.equal(fs.existsSync(sb.defaultOut), false, 'no usage error writes the default file');
  });
});

// ─── 58-03: agent overhead (--root, --no-overhead) ───────────────────────────
//   1 no --root, fake HOME without .claude/projects: overhead is scanned and empty; --raw ends ` · overhead none`
//   2 --root <troot>: planner 1 and verifier 1 matched, the foreign verifier counted; --raw lists them
//   3 no --root: the default root is <HOME>/.claude/projects, resolved at call time
//   4 --no-overhead: nothing scanned, in the result and in the file
//   5 the same --root twice: byte-identical, changed:false
//   6 --root with no value, and --root with --no-overhead, are usage errors
// Every spawn has HOME = a fresh temp dir; the real ~/.claude/projects is never read.

const EMPTY_OVERHEAD = { scanned: true, spawns: 0, matched: 0, foreign: 0, quick: 0, unreadable: 0, agents: {} };

// A projects root holding a planner and a verifier for `repo` (session s1, agents p1 and v1), and a verifier spawned
// from an unrelated directory.
function overheadRoot(repo, root = fx.makeProjectsRoot()) {
  if (!toRemove.some((r) => r.dir === root)) toRemove.push({ dir: root });
  const foreign = tmpDir('df-calibrate-foreign-');
  const write = (cwd, agentId, spawn) => fx.writeOverheadTranscript(root, {
    projectKey: fx.projectKeyFor(cwd), session: 's1', agentId, spawn, cwd,
  });
  write(repo, 'p1', fx.PLANNER_SPAWN);
  write(repo, 'v1', fx.VERIFIER_SPAWN);
  write(foreign, 'f1', fx.VERIFIER_SPAWN);
  return root;
}

describe('aof-tools calibrate agent overhead (end to end)', () => {
  test('58-03/1. with no --root and no ~/.claude/projects the scan runs and finds nothing', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    assert.equal(fs.existsSync(path.join(sb.home, '.claude', 'projects')), false);

    const result = okJson(sb, sb.tmp, ['--paths', beta, '--out', out]);
    assert.deepEqual(result.overhead, EMPTY_OVERHEAD);

    const raw = run(sb, sb.tmp, ['--paths', beta, '--out', out, '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    assert.ok(raw.stdout.replace(/\n$/, '').endsWith(' · overhead none · minutes trd_level'), raw.stdout);
  });

  test('58-03/2. --root reads that projects root: matched spawns by agent, the foreign one counted, and the file carries them', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const troot = overheadRoot(beta);
    const out = path.join(sb.tmp, 'c.json');

    const result = okJson(sb, sb.tmp, ['--paths', beta, '--out', out, '--root', troot]);
    assert.deepEqual(result.overhead, {
      scanned: true, spawns: 3, matched: 2, foreign: 1, quick: 0, unreadable: 0, agents: { planner: 1, verifier: 1 },
    });
    const written = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.equal(written.agent_overhead.planner.samples, 1);
    assert.equal(written.agent_overhead.verifier.samples, 1);
    assert.equal(written.agent_overhead_sources.scanned, true);
    assert.equal(written.agent_overhead_sources.foreign, 1);

    const raw = run(sb, sb.tmp, ['--paths', beta, '--out', out, '--root', troot, '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    const line = raw.stdout.replace(/\n$/, '');
    assert.equal(line.includes('\n'), false, 'one line');
    assert.ok(line.endsWith(' · overhead planner 1, verifier 1 · minutes trd_level'), line);
  });

  test('58-03/2b. a relative --root resolves against cwd', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const troot = overheadRoot(beta);
    const result = okJson(sb, sb.tmp, [
      '--paths', beta, '--out', path.join(sb.tmp, 'c.json'), '--root', path.relative(sb.tmp, troot),
    ]);
    assert.equal(result.overhead.matched, 2);
  });

  test('58-03/3. with no --root the default root is <HOME>/.claude/projects, read at call time', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const homeRoot = path.join(sb.home, '.claude', 'projects');
    fx.writeOverheadTranscript(homeRoot, {
      projectKey: fx.projectKeyFor(beta), session: 's1', agentId: 'p1', spawn: fx.PLANNER_SPAWN, cwd: beta,
    });

    const result = okJson(sb, sb.tmp, ['--paths', beta, '--out', path.join(sb.tmp, 'c.json')]);
    assert.equal(result.overhead.agents.planner, 1);
    assert.equal(result.overhead.matched, 1);
  });

  test('58-03/4. --no-overhead scans nothing, in the result and in the file, even with transcripts under HOME', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    fx.writeOverheadTranscript(path.join(sb.home, '.claude', 'projects'), {
      projectKey: fx.projectKeyFor(beta), session: 's1', agentId: 'p1', spawn: fx.PLANNER_SPAWN, cwd: beta,
    });
    const out = path.join(sb.tmp, 'c.json');

    const result = okJson(sb, sb.tmp, ['--paths', beta, '--out', out, '--no-overhead']);
    assert.deepEqual(result.overhead, { ...EMPTY_OVERHEAD, scanned: false });
    const written = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.equal(written.agent_overhead_sources.scanned, false);
    assert.equal(written.agent_overhead.planner.samples, 0);

    const raw = run(sb, sb.tmp, ['--paths', beta, '--out', out, '--no-overhead', '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    assert.ok(raw.stdout.replace(/\n$/, '').endsWith(' · overhead skipped · minutes trd_level'), raw.stdout);
  });

  test('58-03/5. the same --root twice gives byte-identical files and changed:false', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const troot = overheadRoot(beta);
    const out = path.join(sb.tmp, 'c.json');
    const args = ['--paths', beta, '--out', out, '--root', troot];

    assert.equal(okJson(sb, sb.tmp, args).changed, true);
    const first = fs.readFileSync(out);
    const mtime = fs.statSync(out).mtimeMs;

    assert.equal(okJson(sb, sb.tmp, args).changed, false);
    assert.ok(first.equals(fs.readFileSync(out)), 'bytes are identical');
    assert.equal(fs.statSync(out).mtimeMs, mtime);
  });

  test('58-03/6. --root with no value, and --root with --no-overhead, exit 1 with the usage line and write nothing', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    const noValue = run(sb, sb.tmp, ['--paths', beta, '--out', out, '--root']);
    assert.equal(noValue.status, 1);
    assert.match(noValue.stderr, /--root needs a value/);
    assert.match(noValue.stderr, USAGE);

    const both = run(sb, sb.tmp, ['--paths', beta, '--out', out, '--root', sb.tmp, '--no-overhead']);
    assert.equal(both.status, 1);
    assert.match(both.stderr, /--root/);
    assert.match(both.stderr, /--no-overhead/);
    assert.match(both.stderr, USAGE);

    assert.equal(fs.existsSync(out), false);
    assert.equal(fs.existsSync(sb.defaultOut), false);
  });
});

// ─── 64-08: --window <N|all> ─────────────────────────────────────────────────
//   11 --window 2 on SLOPE: exit 0, the summary names `window 2 objectives (dropped 10 TRDs)`, the file has window.objectives 2
//      and samples.trds 4
//   12 --window all and no flag write byte-identical files (SLOPE has fewer objectives than the default window of 64-10)
//   13 usage errors exit 1, name the flag and write nothing: 0, -3, 2.5, abc, and no value
//   14 --dry-run --window 2 writes nothing, the result carries `window`, `changed` is computed as for any dry run
//   15 help, the usage line and the aof-tools.cjs header name `--window <N|all>`
// SLOPE is a literal copy of the one in calibrator.test.cjs: objectives 1-a to 7-g, TRDs 01 and 02, two code_tdd tasks each,
// 40min per TRD in objectives 1-5 and 10min in 6-7.

function slopeTrd(nn, duration, completed) {
  return {
    nn, slug: 'work',
    tasks: [
      { name: 'Task 1: x', type: 'auto', tdd: true, files: ['lib/x.cjs', 'lib/x.test.cjs'] },
      { name: 'Task 2: y', type: 'auto', tdd: true, files: ['lib/x.cjs', 'lib/x.test.cjs'] },
    ],
    summary: { duration, completed },
  };
}

const SLOPE_SPEC = {
  name: 'slope',
  objectives: ['1-a', '2-b', '3-c', '4-d', '5-e', '6-f', '7-g'].map((dir) => {
    const n = Number(dir.split('-')[0]);
    const duration = n <= 5 ? '40min' : '10min';
    return { dir, trds: [slopeTrd('01', duration, `2026-09-0${n}`), slopeTrd('02', duration, `2026-09-0${n}`)] };
  }),
};

describe('aof-tools calibrate --window (end to end)', () => {
  test('11. --window 2 keeps the two latest objectives; the summary and the file say so', () => {
    const sb = sandbox();
    const slope = project(SLOPE_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    const raw = run(sb, sb.tmp, ['--paths', slope, '--window', '2', '--no-overhead', '--out', out, '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    assert.ok(raw.stdout.includes('window 2 objectives (dropped 10 TRDs)'), raw.stdout);
    assert.equal(raw.stdout.replace(/\n$/, '').includes('\n'), false, '--raw is still one line');
    assert.ok(raw.stdout.includes('4 TRDs, 8 tasks'), 'the counts describe the retained TRDs');

    const written = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.equal(written.window.objectives, 2);
    assert.equal(written.samples.trds, 4);
    assert.equal(written.task_classes.code_tdd.minutes.p50, 5);

    const result = okJson(sb, sb.tmp, ['--paths', slope, '--window', '2', '--no-overhead', '--out', out]);
    assert.equal(result.changed, false, 'the same command again changes nothing');
    assert.deepEqual(result.window, {
      objectives: 2,
      projects: [{ project: 'slope', first: '6-f', last: '7-g', kept_objectives: 2, dropped_objectives: 5, dropped_trds: 10 }],
    });
    assert.equal(result.samples.trds, 4);
  });

  // Calibration v3 (TRD 67-02) names the REQUESTED window in `method` and in `inputs_digest`, so files built with a
  // different request differ there and nowhere else.
  const withoutIdentity = (file) => {
    const { method, inputs_digest: digest, ...rest } = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return rest;
  };

  test('12. --window all and no flag write the same statistics, and the text has no window part', () => {
    const sb = sandbox();
    const slope = project(SLOPE_SPEC);
    const plain = path.join(sb.tmp, 'plain.json');
    const all = path.join(sb.tmp, 'all.json');

    const plainResult = okJson(sb, sb.tmp, ['--paths', slope, '--no-overhead', '--out', plain]);
    const allResult = okJson(sb, sb.tmp, ['--paths', slope, '--window', 'all', '--no-overhead', '--out', all]);
    assert.deepEqual(withoutIdentity(all), withoutIdentity(plain));
    assert.equal(JSON.parse(fs.readFileSync(plain, 'utf-8')).method.window_objectives, 10);
    assert.equal(JSON.parse(fs.readFileSync(all, 'utf-8')).method.window_objectives, null);
    assert.equal(allResult.method.window_objectives, null);
    assert.equal(plainResult.window, null);
    assert.equal(allResult.window, null);
    assert.equal(allResult.samples.trds, 14);
    assert.equal(JSON.parse(fs.readFileSync(plain, 'utf-8')).task_classes.code_tdd.minutes.p50, 20);

    const text = run(sb, sb.tmp, ['--paths', slope, '--window', 'all', '--no-overhead', '--out', all, '--raw']).stdout;
    assert.equal(text.includes('window'), false);
  });

  test('12b. a window large enough to drop nothing has the statistics of no flag, and names the window it was asked for', () => {
    const sb = sandbox();
    const slope = project(SLOPE_SPEC);
    const plain = path.join(sb.tmp, 'plain.json');
    const big = path.join(sb.tmp, 'big.json');
    okJson(sb, sb.tmp, ['--paths', slope, '--no-overhead', '--out', plain]);
    const result = okJson(sb, sb.tmp, ['--paths', slope, '--window', '50', '--no-overhead', '--out', big]);
    assert.deepEqual(withoutIdentity(big), withoutIdentity(plain));
    assert.equal(result.method.window_objectives, 50);
    assert.equal(fs.readFileSync(big, 'utf-8') === fs.readFileSync(plain, 'utf-8'), false, 'the request is part of the file');
    assert.equal(result.window, null);
  });

  test('13. a bad window exits 1, names --window and the usage line, and writes nothing', () => {
    const sb = sandbox();
    const slope = project(SLOPE_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    for (const bad of [['--window', '0'], ['--window', '-3'], ['--window', '2.5'], ['--window', 'abc'], ['--window', ''], ['--window']]) {
      const r = run(sb, sb.tmp, ['--paths', slope, '--no-overhead', '--out', out, ...bad]);
      assert.equal(r.status, 1, `${bad.join(' ')}: ${r.stdout}`);
      assert.match(r.stderr, /--window/, bad.join(' '));
      assert.match(r.stderr, USAGE, bad.join(' '));
      assert.equal(/unknown flag/.test(r.stderr), false, `${bad.join(' ')}: --window is a known flag`);
      assert.match(r.stderr, bad.length === 1 ? /--window needs a value/ : /--window must be a positive integer or all/, bad.join(' '));
      assert.equal(fs.existsSync(out), false, `${bad.join(' ')} wrote a file`);
    }
    assert.equal(fs.existsSync(sb.defaultOut), false);
  });

  test('14. --dry-run --window 2 writes nothing, reports the window, and computes changed as for any dry run', () => {
    const sb = sandbox();
    const slope = project(SLOPE_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    const fresh = okJson(sb, sb.tmp, ['--paths', slope, '--window', '2', '--no-overhead', '--out', out, '--dry-run']);
    assert.equal(fresh.dry_run, true);
    assert.equal(fresh.changed, true, 'no file yet: a write would change it');
    assert.equal(fresh.window.objectives, 2);
    assert.equal(fresh.samples.trds, 4);
    assert.equal(fs.existsSync(out), false);

    okJson(sb, sb.tmp, ['--paths', slope, '--window', '2', '--no-overhead', '--out', out]);
    const same = okJson(sb, sb.tmp, ['--paths', slope, '--window', '2', '--no-overhead', '--out', out, '--dry-run']);
    assert.equal(same.changed, false, 'the file already holds this window');
    const other = okJson(sb, sb.tmp, ['--paths', slope, '--window', '3', '--no-overhead', '--out', out, '--dry-run']);
    assert.equal(other.changed, true, 'another window would change the file');
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf-8')).window.objectives, 2, 'the dry run left the file alone');
  });

  test('15. help, the usage line and the aof-tools header name --window <N|all>', () => {
    const { COMMANDS } = require('./help.cjs');
    const cli = require('./calibrate-cli.cjs');
    assert.ok(cli.USAGE.includes('[--window <N|all>]'), cli.USAGE);
    assert.ok(COMMANDS.calibrate.usage.includes('[--window <N|all>]'), COMMANDS.calibrate.usage);
    assert.ok(COMMANDS.calibrate.details.includes('--window'), 'details explain the flag');
    assert.match(COMMANDS.calibrate.details, /N most recent objectives/);
    assert.match(COMMANDS.calibrate.details, /all/);

    const header = fs.readFileSync(DF_TOOLS, 'utf-8').split('\n').slice(0, 260).join('\n');
    assert.ok(header.includes('--window <N|all>'), 'the aof-tools.cjs header comment names the flag');

    const sb = sandbox();
    const help = spawnSync(process.execPath, [DF_TOOLS, '--cwd', sb.tmp, 'calibrate', '--help'], {
      cwd: sb.tmp, env: { ...process.env, HOME: sb.home }, encoding: 'utf-8', timeout: 60000,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.ok(help.stdout.includes('--window <N|all>'), help.stdout);
  });
});

// ─── 64-10: the window is the default ────────────────────────────────────────
//   16 no flag on a project with 12 objectives windows to the most recent 10 and names the window in the summary;
//      `--window all` keeps all twelve and names none; `--window 3` overrides the default
//   17 help and the aof-tools.cjs header say the default and that `--window all` keeps all history
// WIDE: objectives 1-a to 12-l, one TRD of two code_tdd tasks each; 1-a and 2-b took 40min (task share 20), the rest 10min.
const WIDE_SPEC = {
  name: 'wide',
  objectives: Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const duration = n <= 2 ? '40min' : '10min';
    return { dir: `${n}-${String.fromCharCode(96 + n)}`, trds: [slopeTrd('01', duration, `2026-09-${String(n).padStart(2, '0')}`)] };
  }),
};

describe('aof-tools calibrate default window (end to end)', () => {
  test('16. no flag windows to the most recent 10 objectives; --window all opts out; --window 3 overrides', () => {
    const sb = sandbox();
    const wide = project(WIDE_SPEC);
    const dflt = path.join(sb.tmp, 'a.json');
    const all = path.join(sb.tmp, 'all.json');
    const three = path.join(sb.tmp, 'three.json');

    const raw = run(sb, sb.tmp, ['--paths', wide, '--no-overhead', '--out', dflt, '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    assert.ok(raw.stdout.includes('window 10 objectives (dropped 2 TRDs)'), raw.stdout);
    assert.ok(raw.stdout.includes('10 TRDs, 20 tasks'), 'the counts describe the retained TRDs');
    const written = JSON.parse(fs.readFileSync(dflt, 'utf-8'));
    assert.equal(written.window.objectives, 10);
    assert.equal(written.samples.trds, 10);
    assert.equal(written.task_classes.code_tdd.minutes.max, 5);

    const allRaw = run(sb, sb.tmp, ['--paths', wide, '--window', 'all', '--no-overhead', '--out', all, '--raw']);
    assert.equal(allRaw.status, 0, allRaw.stderr);
    assert.equal(allRaw.stdout.includes('window'), false, allRaw.stdout);
    const allWritten = JSON.parse(fs.readFileSync(all, 'utf-8'));
    assert.equal(Object.keys(allWritten).includes('window'), false);
    assert.equal(allWritten.samples.trds, 12);
    assert.equal(allWritten.task_classes.code_tdd.minutes.max, 20);

    const threeRaw = run(sb, sb.tmp, ['--paths', wide, '--window', '3', '--no-overhead', '--out', three, '--raw']);
    assert.equal(threeRaw.status, 0, threeRaw.stderr);
    assert.ok(threeRaw.stdout.includes('window 3 objectives (dropped 9 TRDs)'), threeRaw.stdout);
    assert.equal(JSON.parse(fs.readFileSync(three, 'utf-8')).samples.trds, 3);
  });

  test('17. help and the aof-tools.cjs header say the default and that --window all keeps all history', () => {
    const { COMMANDS } = require('./help.cjs');
    assert.match(COMMANDS.calibrate.details, /default: the most recent 10 objectives with samples per project/);
    assert.match(COMMANDS.calibrate.details, /--window all/);
    const header = fs.readFileSync(DF_TOOLS, 'utf-8').split('\n').slice(0, 260).join('\n');
    assert.match(header, /default: the most recent 10 objectives/);
  });
});

// ─── 67-02: --minutes and --through ──────────────────────────────────────────
//   15 --minutes trd_level --through 66 on FUTURE: exit 0, the text names both, the file's method and samples agree
//   16 the same command again is unchanged; the JSON form reports changed:false and carries method
//   17 --minutes task_sum and no --minutes write byte-identical files
//   18 usage errors exit 1, name the flag and write nothing
//   19 --dry-run writes nothing and the result carries method
//   20 help, USAGE, the aof-tools.cjs header and the case comment name both flags
describe('aof-tools calibrate --minutes and --through (end to end)', () => {
  const NO_FILE = 'wrote a file';

  test('67-02/15. --minutes trd_level --through 66 reads only 64-66, writes the method and names both in the summary', () => {
    const sb = sandbox();
    const future = project(FUTURE_SPEC);
    const out = path.join(sb.tmp, 'c.json');

    const raw = run(sb, sb.tmp, ['--paths', future, '--no-overhead', '--minutes', 'trd_level', '--through', '66', '--out', out, '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    assert.ok(raw.stdout.includes('minutes trd_level'), raw.stdout);
    assert.ok(raw.stdout.includes('through objective 66'), raw.stdout);
    assert.ok(raw.stdout.includes('3 TRDs, 6 tasks'), raw.stdout);
    assert.equal(raw.stdout.replace(/\n$/, '').includes('\n'), false, '--raw is still one line');

    const written = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.deepEqual(written.method, { minutes: 'trd_level', window_objectives: 10, through_objective: 66 });
    assert.equal(written.samples.trds, 3);
    assert.equal(written.data_as_of, '2026-10-03');
  });

  test('67-02/16. the same command again is unchanged, and the JSON form reports changed:false with the method', () => {
    const sb = sandbox();
    const future = project(FUTURE_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    const args = ['--paths', future, '--no-overhead', '--minutes', 'trd_level', '--through', '66', '--out', out];

    assert.equal(run(sb, sb.tmp, [...args, '--raw']).status, 0);
    const first = fs.readFileSync(out);
    const again = run(sb, sb.tmp, [...args, '--raw']);
    assert.equal(again.status, 0, again.stderr);
    assert.ok(again.stdout.includes('unchanged'), again.stdout);
    assert.ok(again.stdout.includes('through objective 66'), again.stdout);

    const result = okJson(sb, sb.tmp, args);
    assert.equal(result.changed, false);
    assert.deepEqual(result.method, { minutes: 'trd_level', window_objectives: 10, through_objective: 66 });
    assert.ok(first.equals(fs.readFileSync(out)), 'bytes are identical');
  });

  // 67-05: the default is trd_level, so the byte-identity is with --minutes trd_level (it was --minutes task_sum before).
  test('67-02/17. --minutes trd_level and no --minutes write byte-identical files, and the text names trd_level', () => {
    const sb = sandbox();
    const future = project(FUTURE_SPEC);
    const plain = path.join(sb.tmp, 'plain.json');
    const named = path.join(sb.tmp, 'named.json');
    const plainRaw = run(sb, sb.tmp, ['--paths', future, '--no-overhead', '--through', '66', '--out', plain, '--raw']);
    const namedRaw = run(sb, sb.tmp, ['--paths', future, '--no-overhead', '--through', '66', '--minutes', 'trd_level', '--out', named, '--raw']);
    assert.equal(plainRaw.status, 0, plainRaw.stderr);
    assert.equal(namedRaw.status, 0, namedRaw.stderr);
    assert.ok(fs.readFileSync(plain).equals(fs.readFileSync(named)));
    assert.ok(plainRaw.stdout.includes('minutes trd_level'), plainRaw.stdout);
    assert.equal(plainRaw.stdout.includes('through objective'), true);

    const open = run(sb, sb.tmp, ['--paths', future, '--no-overhead', '--out', path.join(sb.tmp, 'open.json'), '--raw']);
    assert.equal(open.status, 0, open.stderr);
    assert.equal(open.stdout.includes('through objective'), false, 'no cutoff, no cutoff text');
    assert.ok(open.stdout.includes('minutes trd_level'), open.stdout);
  });

  test('67-05/1. no --minutes writes the trd_level method, byte-identical to --minutes trd_level; --minutes task_sum differs', () => {
    const sb = sandbox();
    const future = project(FUTURE_SPEC);
    const plain = path.join(sb.tmp, 'plain.json');
    const level = path.join(sb.tmp, 'level.json');
    const sum = path.join(sb.tmp, 'sum.json');
    const plainRaw = run(sb, sb.tmp, ['--paths', future, '--no-overhead', '--out', plain, '--raw']);
    const levelRaw = run(sb, sb.tmp, ['--paths', future, '--no-overhead', '--minutes', 'trd_level', '--out', level, '--raw']);
    const sumRaw = run(sb, sb.tmp, ['--paths', future, '--no-overhead', '--minutes', 'task_sum', '--out', sum, '--raw']);
    for (const r of [plainRaw, levelRaw, sumRaw]) assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(fs.readFileSync(plain, 'utf-8')).method.minutes, 'trd_level',
      '67-VALIDATION.md ship_default true: the default is the shipped method');
    assert.ok(fs.readFileSync(plain).equals(fs.readFileSync(level)), 'no --minutes is --minutes trd_level');
    assert.equal(fs.readFileSync(plain).equals(fs.readFileSync(sum)), false, '--minutes task_sum is a different calibration');
    assert.equal(JSON.parse(fs.readFileSync(sum, 'utf-8')).method.minutes, 'task_sum');
    assert.ok(plainRaw.stdout.includes('minutes trd_level'), plainRaw.stdout);
    assert.ok(sumRaw.stdout.includes('minutes task_sum'), sumRaw.stdout);
  });

  test('67-02/18. a bad --minutes or --through exits 1, names the flag and the usage line, and writes nothing', () => {
    const sb = sandbox();
    const future = project(FUTURE_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    const cases = [
      [['--minutes'], '--minutes', /--minutes needs a value/],
      [['--minutes', 'trd-level'], '--minutes', /--minutes must be task_sum or trd_level, got "trd-level"/],
      [['--minutes', 'all'], '--minutes', /--minutes must be task_sum or trd_level, got "all"/],
      [['--through'], '--through', /--through needs a value/],
      [['--through', '-1'], '--through', /--through must be an objective number \(for example 66\), got "-1"/],
      [['--through', 'abc'], '--through', /--through must be an objective number \(for example 66\), got "abc"/],
      [['--through', '6x'], '--through', /--through must be an objective number \(for example 66\), got "6x"/],
    ];
    for (const [bad, flag, message] of cases) {
      const r = run(sb, sb.tmp, ['--paths', future, '--no-overhead', '--out', out, ...bad]);
      assert.equal(r.status, 1, `${bad.join(' ')}: ${r.stdout}`);
      assert.ok(r.stderr.includes(flag), bad.join(' '));
      assert.match(r.stderr, message, bad.join(' '));
      assert.match(r.stderr, USAGE, bad.join(' '));
      assert.equal(/unknown flag/.test(r.stderr), false, `${bad.join(' ')}: ${flag} is a known flag`);
      assert.equal(fs.existsSync(out), false, `${bad.join(' ')} ${NO_FILE}`);
    }
    assert.equal(fs.existsSync(sb.defaultOut), false);
  });

  test('67-02/18b. a decimal --through is an objective number', () => {
    const sb = sandbox();
    const future = project(FUTURE_SPEC);
    const result = okJson(sb, sb.tmp, ['--paths', future, '--no-overhead', '--through', '65.5', '--out', path.join(sb.tmp, 'c.json')]);
    assert.equal(result.method.through_objective, 65.5);
    assert.equal(result.samples.trds, 2);
  });

  test('67-02/19. --dry-run --minutes trd_level --through 66 writes nothing and the result carries the method', () => {
    const sb = sandbox();
    const future = project(FUTURE_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    const result = okJson(sb, sb.tmp, ['--paths', future, '--no-overhead', '--minutes', 'trd_level', '--through', '66', '--out', out, '--dry-run']);
    assert.equal(result.dry_run, true);
    assert.equal(result.changed, true);
    assert.deepEqual(result.method, { minutes: 'trd_level', window_objectives: 10, through_objective: 66 });
    assert.equal(result.samples.trds, 3);
    assert.equal(fs.existsSync(out), false);
    assert.equal(fs.existsSync(sb.defaultOut), false);
  });

  test('67-02/20. help, USAGE, the aof-tools.cjs header and the case comment name --minutes <task_sum|trd_level> and --through <N>', () => {
    const { COMMANDS } = require('./help.cjs');
    const cli = require('./calibrate-cli.cjs');
    const lines = fs.readFileSync(DF_TOOLS, 'utf-8').split('\n');
    const header = lines.slice(0, 260).join('\n');
    const caseComment = lines.find((line) => line.trim().startsWith('// aof-tools calibrate '));
    assert.ok(caseComment, 'the case comment exists');
    for (const [where, text] of [
      ['USAGE', cli.USAGE], ['help usage', COMMANDS.calibrate.usage], ['aof-tools.cjs header', header], ['case comment', caseComment],
    ]) {
      assert.ok(text.includes('--minutes <task_sum|trd_level>'), `${where} names --minutes`);
      assert.ok(text.includes('--through <N>'), `${where} names --through`);
    }
    assert.ok(COMMANDS.calibrate.details.includes('--minutes'), 'details explain --minutes');
    assert.ok(COMMANDS.calibrate.details.includes('--through'), 'details explain --through');
    assert.match(COMMANDS.calibrate.details, /trd_level/);
    assert.match(COMMANDS.calibrate.details, /task_sum/);

    const sb = sandbox();
    const help = spawnSync(process.execPath, [DF_TOOLS, '--cwd', sb.tmp, 'calibrate', '--help'], {
      cwd: sb.tmp, env: { ...process.env, HOME: sb.home }, encoding: 'utf-8', timeout: 60000,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.ok(help.stdout.includes('--minutes <task_sum|trd_level>'), help.stdout);
    assert.ok(help.stdout.includes('--through <N>'), help.stdout);
  });
});
