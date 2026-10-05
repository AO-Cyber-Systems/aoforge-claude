'use strict';

// calibrate-cli.test.cjs (TRD 57-06, EST-01) — `df-tools calibrate`, the command that writes calibration.json.
//
// Test list (TRD 57-06), outermost first. Every test spawns the real df-tools with `--cwd <dir>`:
//   1 --paths <beta> --out <file> writes a parsable file; JSON stdout reports changed:true, samples.trds 5, out
//   2 the same command again: identical bytes, changed:false
//   3 no --out: the file lands in <fake HOME>/.claude/devflow/calibration.json
//   4 DEVFLOW_CALIBRATION_PATH is used with no --out; with both, --out wins
//   5 --dry-run reports dry_run:true and creates no file
//   6 no --paths: the checkout holding cwd is calibrated; outside a project it exits 1 naming --paths
//   7 --rates: a rates file without claude-opus-5-5 leaves it unpriced; a rates file missing `source` exits 1
//   8 --raw prints exactly one line
//   9 --help exits 0; an unknown flag exits 1 with the usage line
//   extra: DEVFLOW_CALIBRATE_PATHS (path.delimiter), relative --paths / --out resolve against cwd, the dispatch
//          no-argument case never writes the default file
//
// Hermetic: every project, home and output file lives in an fs.mkdtemp directory. Every spawned run gets HOME=<fake home>
// and has DEVFLOW_CALIBRATION_PATH / DEVFLOW_CALIBRATE_PATHS removed from its environment, so the real
// ~/.claude/devflow/calibration.json can never be resolved, read or written. The BETA history is a literal copy of the one
// in calibrator.test.cjs (a test file is not imported from another test file); the project builder is the 57-02 fixture.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  makeCalibrationProject, removeCalibrationProject, ALPHA_SPEC,
} = require('./__fixtures__/calibration-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const USAGE = /df-tools calibrate /;

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
  return { tmp, home, defaultOut: path.join(home, '.claude', 'devflow', 'calibration.json') };
}

/**
 * Spawn `df-tools --cwd <cwd> calibrate ...args` with HOME = the fake home. `env` adds variables; the two calibrate
 * variables of the outer environment are always removed first.
 */
function run(sb, cwd, args, env = {}) {
  const base = { ...process.env, HOME: sb.home, NOTIFIER_DISABLE: '1' };
  delete base.DEVFLOW_CALIBRATION_PATH;
  delete base.DEVFLOW_CALIBRATE_PATHS;
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

describe('df-tools calibrate (end to end)', () => {
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
    assert.equal(written.version, 1);
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

  test('3. with no --out the file lands at <HOME>/.claude/devflow/calibration.json', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    assert.equal(fs.existsSync(sb.defaultOut), false);

    const result = okJson(sb, sb.tmp, ['--paths', beta]);

    assert.equal(result.out, sb.defaultOut);
    assert.ok(fs.existsSync(sb.defaultOut), 'written under the fake home');
    assert.equal(JSON.parse(fs.readFileSync(sb.defaultOut, 'utf-8')).samples.trds, 5);
  });

  test('4. DEVFLOW_CALIBRATION_PATH is the default out; --out wins over it', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const envOut = path.join(sb.tmp, 'env.json');
    const flagOut = path.join(sb.tmp, 'flag.json');

    const viaEnv = okJson(sb, sb.tmp, ['--paths', beta], { DEVFLOW_CALIBRATION_PATH: envOut });
    assert.equal(viaEnv.out, envOut);
    assert.ok(fs.existsSync(envOut));
    assert.equal(fs.existsSync(sb.defaultOut), false, 'the home default is not used');
    fs.rmSync(envOut);

    const both = okJson(sb, sb.tmp, ['--paths', beta, '--out', flagOut], { DEVFLOW_CALIBRATION_PATH: envOut });
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
    const before = fs.readFileSync(out);
    const mtime = fs.statSync(out).mtimeMs;

    assert.equal(okJson(sb, sb.tmp, ['--paths', beta, '--out', out, '--dry-run']).changed, false, 'same inputs: no change');
    fs.writeFileSync(out, '{}\n');
    assert.equal(okJson(sb, sb.tmp, ['--paths', beta, '--out', out, '--dry-run']).changed, true, 'a different file would change');
    assert.equal(fs.readFileSync(out, 'utf-8'), '{}\n', 'dry run does not repair it');
    assert.notEqual(before.toString(), '{}\n');
    assert.ok(Number.isFinite(mtime));
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
    assert.match(r.stderr, /no DevFlow project/);
    assert.match(r.stderr, /--paths/);
    assert.equal(fs.existsSync(sb.defaultOut), false, 'never creates the default calibration file when no project resolves');
  });

  test('6c. DEVFLOW_CALIBRATE_PATHS (path.delimiter separated) names the projects when --paths is absent', () => {
    const sb = sandbox();
    const beta = project(BETA_SPEC);
    const alpha = project(ALPHA_SPEC);
    const out = path.join(sb.tmp, 'c.json');
    const empty = tmpDir('df-calibrate-empty-');

    const result = okJson(sb, empty, ['--out', out], { DEVFLOW_CALIBRATE_PATHS: [beta, alpha].join(path.delimiter) });

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
    const tail = '5 TRDs, 7 tasks, 1 with tokens · classes code_tdd 5, doc 1, prompt 1';
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
