'use strict';

// tokens-cli.test.cjs (TRD 57-03) — `df-tools tokens trd|stamp`, the forward token stamp (EST-06).
// TRD 57-06 adds `tokens backfill` (EST-07): its tests are the last describe in this file, named `57-06 10.` onwards.
//
// Test list (TRD 57-03), outermost first:
//   end to end (spawned df-tools, HOME = fake home)
//     1 stamp writes the six token fields into a SUMMARY draft           2 summary post publishes them
//     3 no transcript: exit 0, stamped:false, draft unchanged            4 a --draft inside .planning/ is refused
//     5 shared objective number: draft path decides, else ambiguous      6 tokens trd --raw / JSON
//     7 re-stamp overwrites after the transcript grew                    8 usage errors exit 1       9 --help
//   in-process
//     10 the default transcript root is os.homedir()/.claude/projects, read at call time
//   prose contract (read-only, devflow-claude checkout only)
//     11 executor.md <self_check>: tokens stamp before summary post   12 execute-trd.md create_summary_with_evidence
//     13 templates/summary.md documents the fields                    14 executor.md record-metric passes --job, not --trd
//
// TRD 66-01 adds `tokens coverage` (EST-09): its tests are the last describe in this file, named `66-01 1.` onwards.
//   66-01 1. default scope is the current milestone      2. --raw text: the summary line, then one line per non-live entry
//   66-01 3. --milestone v1.5 reads the archived dirs    4. --objective 65 scopes to one objective directory
//   66-01 5. missing reasons from transcripts; --root and --repo honored
//   66-01 6. usage errors exit 1 with the USAGE line     7. read-only: no file under the repo or the projects root changes
//   extra: the help usage lists coverage; readRootFor picks main in store mode and the checkout in local mode
//
// Hermetic: every repo, home and draft is an fs.mkdtemp directory (realpath'd). Spawned runs get HOME=<fake home>, so
// the real ~/.claude is never read; in-process calls pass `root` explicitly, or set HOME and restore it. Transcripts
// come from __fixtures__/transcript-fixtures.cjs; SUMMARY and TRD text is literal below. No generated data.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  makeFakeHome, projectKeyFor, assistantRecords, executorPrompt, writeSubagentTranscript, THREE_MESSAGES,
} = require('./__fixtures__/transcript-fixtures.cjs');
const { makeCoverageProject, V16_FIXTURE } = require('./__fixtures__/token-coverage-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const USAGE = /df-tools tokens /;

// ─── fixture ─────────────────────────────────────────────────────────────────

const SUMMARY_FRONTMATTER = [
  '---',
  'objective: 99-demo',
  'job: "01"',
  'duration: 7min',
  'completed: 2026-10-05',
  '---',
].join('\n');

const SUMMARY_BODY = [
  '',
  '# Objective 99 TRD 01: Demo Summary',
  '',
  '**A stamped draft keeps its body byte for byte.**',
  '',
  '## Task Evidence',
  '',
  '| Task | Verify Command | Exit Code | Status |',
  '|---|---|---|---|',
  '| 1 | `node --test demo.test.cjs` | 0 | PASS |',
  '',
].join('\n');

const SUMMARY_TEXT = `${SUMMARY_FRONTMATTER}\n${SUMMARY_BODY}`;

const TRD_TEXT = [
  '---',
  'objective: 99-demo',
  'trd: "01"',
  'type: standard',
  '---',
  '',
  '# TRD 99-01: Demo',
  '',
].join('\n');

/** The body of a markdown file: everything after the closing frontmatter fence. */
function bodyOf(text) {
  const m = /^---\n[\s\S]*?\n---\n/.exec(text);
  assert.ok(m, 'file has a frontmatter block');
  return text.slice(m[0].length);
}

/**
 * A fake project: `<tmp>/repo/.planning/objectives/<dir>/` per `dirs` (99-demo also gets its 99-01 TRD), a fake HOME
 * with an empty projects tree, and a drafts directory outside the repo.
 */
function makeProject({ dirs = ['99-demo'] } = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-tokens-')));
  const repo = path.join(tmp, 'repo');
  for (const d of dirs) fs.mkdirSync(path.join(repo, '.planning', 'objectives', d), { recursive: true });
  if (dirs.includes('99-demo')) {
    fs.writeFileSync(path.join(repo, '.planning', 'objectives', '99-demo', '99-01-demo-TRD.md'), TRD_TEXT);
  }
  const { home, projectsRoot } = makeFakeHome();
  const drafts = path.join(tmp, 'drafts');
  fs.mkdirSync(drafts, { recursive: true });

  const env = { ...process.env, HOME: home, TMPDIR: tmp, NOTIFIER_DISABLE: '1' };
  return {
    tmp,
    repo,
    home,
    projectsRoot,
    drafts,
    /** A transcript for `id` in `objectiveDir` whose executor ran in `repo`. */
    transcript(id, objectiveDir, { agentId = `agent-${id}`, records = THREE_MESSAGES, session = 's1' } = {}) {
      return writeSubagentTranscript(projectsRoot, {
        projectKey: projectKeyFor(repo),
        session,
        agentId,
        description: `Execute TRD ${id}`,
        prompt: executorPrompt('plan_id', { id, objectiveDir, repoRoot: repo }),
        cwd: repo,
        records,
      });
    },
    /** A literal draft file at `drafts/<rel>`; returns its absolute path. */
    draft(rel, text = SUMMARY_TEXT) {
      const f = path.join(drafts, ...rel.split('/'));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text);
      return f;
    },
    /** Spawn df-tools with `--cwd <repo>` (HOME is the fake home). */
    run(args) {
      return spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, ...args], {
        cwd: tmp, env, encoding: 'utf-8', timeout: 60000,
      });
    },
    cleanup() {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

/** Run df-tools without --raw (the dispatcher prints JSON), assert exit 0 and return the parsed stdout. */
function okJson(p, args) {
  const r = p.run(args);
  assert.equal(r.status, 0, `df-tools ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ─── 1-9: df-tools end to end ────────────────────────────────────────────────

describe('df-tools tokens stamp (end to end)', () => {
  test('1. stamp writes the six token fields into the draft frontmatter and leaves the body byte-identical', () => {
    const p = makeProject();
    try {
      p.transcript('99-01', '99-demo');
      const draft = p.draft('objectives/99-demo/99-01-SUMMARY.md');
      const before = fs.readFileSync(draft, 'utf-8');

      const res = okJson(p, ['tokens', 'stamp', '99-01', '--draft', draft]);
      assert.equal(res.stamped, true, JSON.stringify(res));
      assert.equal(res.transcripts.length, 1);

      const after = fs.readFileSync(draft, 'utf-8');
      assert.match(after, /^tokens_input: 140747$/m);
      assert.match(after, /^tokens_output: 1370$/m);
      assert.match(after, /^tokens_cache_read: 121144$/m);
      assert.match(after, /^tokens_cache_write: 19596$/m);
      assert.match(after, /^token_model: "claude-opus-5-5"$/m);
      assert.match(after, /^tokens_source: "live"$/m);
      assert.equal(bodyOf(after), bodyOf(before), 'body is byte-identical');
      assert.match(after, /^duration: 7min$/m, 'existing frontmatter keys survive');
    } finally {
      p.cleanup();
    }
  });

  test('2. summary post of a stamped draft publishes tokens_input and tokens_output (local mode)', () => {
    const p = makeProject();
    try {
      p.transcript('99-01', '99-demo');
      const draft = p.draft('objectives/99-demo/99-01-SUMMARY.md');

      const stamp = p.run(['tokens', 'stamp', '99-01', '--draft', draft]);
      assert.equal(stamp.status, 0, `${stamp.stdout}\n${stamp.stderr}`);

      const post = p.run(['summary', 'post', '99-01', '--from', draft]);
      assert.equal(post.status, 0, `${post.stdout}\n${post.stderr}`);

      const published = fs.readFileSync(path.join(p.repo, '.planning', 'objectives', '99-demo', '99-01-SUMMARY.md'), 'utf-8');
      assert.match(published, /^tokens_input: 140747$/m);
      assert.match(published, /^tokens_output: 1370$/m);
    } finally {
      p.cleanup();
    }
  });

  test('3. no transcript for the TRD: exit 0, stamped:false / no_transcript, draft bytes unchanged', () => {
    const p = makeProject();
    try {
      p.transcript('99-01', '99-demo');
      const draft = p.draft('objectives/99-demo/99-02-SUMMARY.md');
      const before = fs.readFileSync(draft);

      const res = okJson(p, ['tokens', 'stamp', '99-02', '--draft', draft]);
      assert.equal(res.stamped, false);
      assert.equal(res.reason, 'no_transcript');
      assert.deepEqual(fs.readFileSync(draft), before);
    } finally {
      p.cleanup();
    }
  });

  test('4. a --draft inside .planning/ exits 1, names --draft and summary post, and is not touched', () => {
    const p = makeProject();
    try {
      p.transcript('99-01', '99-demo');
      const inside = path.join(p.repo, '.planning', 'objectives', '99-demo', '99-01-SUMMARY.md');
      fs.writeFileSync(inside, SUMMARY_TEXT);
      const before = fs.readFileSync(inside);

      const r = p.run(['tokens', 'stamp', '99-01', '--draft', inside]);
      assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /--draft/);
      assert.match(r.stderr, /summary post/);
      assert.deepEqual(fs.readFileSync(inside), before);
    } finally {
      p.cleanup();
    }
  });

  test('5. a shared objective number: the draft path names the directory, otherwise ambiguous_objective', () => {
    const p = makeProject({ dirs: ['10-alpha', '10-beta'] });
    try {
      p.transcript('10-01', '10-beta');

      const named = p.draft('objectives/10-beta/10-01-SUMMARY.md');
      const ok = okJson(p, ['tokens', 'stamp', '10-01', '--draft', named]);
      assert.equal(ok.stamped, true, JSON.stringify(ok));
      assert.equal(ok.objective_dir, '10-beta');
      assert.match(fs.readFileSync(named, 'utf-8'), /^tokens_output: 1370$/m);

      const bare = p.draft('10-01-SUMMARY.md');
      const before = fs.readFileSync(bare);
      const res = okJson(p, ['tokens', 'stamp', '10-01', '--draft', bare]);
      assert.equal(res.stamped, false);
      assert.equal(res.reason, 'ambiguous_objective');
      assert.deepEqual(fs.readFileSync(bare), before);
    } finally {
      p.cleanup();
    }
  });

  test('6. tokens trd --raw prints the one-line totals; without --raw the JSON carries found, fields, transcripts', () => {
    const p = makeProject();
    try {
      p.transcript('99-01', '99-demo');

      const raw = p.run(['tokens', 'trd', '99-01', '--raw']);
      assert.equal(raw.status, 0, `${raw.stdout}\n${raw.stderr}`);
      assert.equal(raw.stdout.trim(), 'tokens_input=140747 tokens_output=1370 transcripts=1');

      const res = okJson(p, ['tokens', 'trd', '99-01']);
      assert.equal(res.found, true);
      assert.equal(res.trd, '99-01');
      assert.equal(res.fields.tokens_input, 140747);
      assert.equal(res.fields.tokens_output, 1370);
      assert.equal(res.transcripts.length, 1);
    } finally {
      p.cleanup();
    }
  });

  test('7. re-stamping after the transcript grew overwrites the draft values', () => {
    const p = makeProject();
    try {
      const file = p.transcript('99-01', '99-demo');
      const draft = p.draft('objectives/99-demo/99-01-SUMMARY.md');
      okJson(p, ['tokens', 'stamp', '99-01', '--draft', draft]);
      assert.match(fs.readFileSync(draft, 'utf-8'), /^tokens_output: 1370$/m);

      const fourth = assistantRecords({ id: 'msg_D', input: 3, cacheWrite: 0, cacheRead: 50000, output: 100, blocks: 1 });
      fs.appendFileSync(file, fourth.map((r) => JSON.stringify(r)).join('\n') + '\n');

      const res = okJson(p, ['tokens', 'stamp', '99-01', '--draft', draft]);
      assert.equal(res.stamped, true, JSON.stringify(res));
      const after = fs.readFileSync(draft, 'utf-8');
      assert.match(after, /^tokens_output: 1470$/m);
      assert.equal((after.match(/^tokens_output:/gm) || []).length, 1, 'one tokens_output line, not two');
    } finally {
      p.cleanup();
    }
  });

  test('8. usage errors exit 1 with a usage line', () => {
    const p = makeProject();
    try {
      const draft = p.draft('objectives/99-demo/99-01-SUMMARY.md');
      const cases = [
        ['tokens'],
        ['tokens', 'bogus'],
        ['tokens', 'stamp', '99-01'],
        ['tokens', 'trd'],
        ['tokens', 'trd', '99-01', '--nope'],
        ['tokens', 'stamp', '99-01', '--draft'],
        ['tokens', 'stamp', 'not-an-id', '--draft', draft],
      ];
      for (const args of cases) {
        const r = p.run(args);
        assert.equal(r.status, 1, `df-tools ${args.join(' ')} should exit 1\n${r.stdout}\n${r.stderr}`);
        assert.match(r.stderr, USAGE, `df-tools ${args.join(' ')} prints a usage line`);
        assert.doesNotMatch(r.stderr, /Unknown command/);
      }
      assert.equal(fs.readFileSync(draft, 'utf-8'), SUMMARY_TEXT, 'a usage error writes nothing');
    } finally {
      p.cleanup();
    }
  });

  test('9. tokens --help exits 0 and prints the usage line', () => {
    const p = makeProject();
    try {
      const r = p.run(['tokens', '--help']);
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, USAGE);
    } finally {
      p.cleanup();
    }
  });
});

// ─── 10: in-process ──────────────────────────────────────────────────────────

describe('runTokens (in-process)', () => {
  const tokensCli = () => require('./tokens-cli.cjs');

  test('10. the default transcript root is os.homedir()/.claude/projects, read at call time', () => {
    const p = makeProject();
    const savedHome = process.env.HOME;
    try {
      p.transcript('99-01', '99-demo');
      process.env.HOME = p.home;
      const r = tokensCli().runTokens({ argv: ['trd', '99-01'], cwd: p.repo });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.result.found, true);
      assert.equal(r.result.fields.tokens_output, 1370);

      process.env.HOME = path.join(p.tmp, 'empty-home');
      const none = tokensCli().runTokens({ argv: ['trd', '99-01'], cwd: p.repo });
      assert.equal(none.ok, true);
      assert.equal(none.result.found, false, 'a different HOME is a different root');
    } finally {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
      p.cleanup();
    }
  });

  test('10a. an explicit root wins over HOME, and a bad flag is a usage error naming the usage line', () => {
    const p = makeProject();
    try {
      p.transcript('99-01', '99-demo');
      const r = tokensCli().runTokens({ argv: ['trd', '99-01'], cwd: p.repo, root: p.projectsRoot });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.result.found, true);

      const bad = tokensCli().runTokens({ argv: ['trd', '99-01', '--nope'], cwd: p.repo, root: p.projectsRoot });
      assert.equal(bad.ok, false);
      assert.match(bad.message, USAGE);
    } finally {
      p.cleanup();
    }
  });
});

// ─── 11-14: prose contract (read-only) ───────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
const PLUGIN = path.join(REPO_ROOT, 'plugins', 'devflow');

const readPlugin = (...rel) => fs.readFileSync(path.join(PLUGIN, ...rel), 'utf-8');

/** The text between `<tag ...>` and `</tag>` (first occurrence), or null. */
function blockOf(text, openRe, closeTag) {
  const open = openRe.exec(text);
  if (!open) return null;
  const from = open.index + open[0].length;
  const to = text.indexOf(closeTag, from);
  return to === -1 ? null : text.slice(from, to);
}

/** Logical command lines containing `needle`: a trailing backslash joins the next line. */
function commandLines(text, needle) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (line.trimEnd().endsWith('\\') && i + 1 < lines.length) {
      i++;
      line = `${line.trimEnd().slice(0, -1)} ${lines[i].trim()}`;
    }
    if (line.includes(needle)) out.push(line);
  }
  return out;
}

describe('executor prose stamps token usage before summary post (TRD 57-03)', { skip: !IS_DEVFLOW_CHECKOUT && 'not a devflow-claude checkout' }, () => {
  const NEVER_BY_HAND = /never type token numbers by hand/i;

  test('11. executor.md <self_check> runs tokens stamp before summary post, and says never type the numbers', () => {
    const executor = readPlugin('agents', 'executor.md');
    const selfCheck = blockOf(executor, /<self_check>/, '</self_check>');
    assert.ok(selfCheck, 'executor.md has a <self_check> block');
    const stamp = selfCheck.indexOf('df-tools.cjs tokens stamp {objective}-{trd} --draft');
    const post = selfCheck.indexOf('summary post {objective}-{trd} --from');
    assert.ok(stamp >= 0, 'self_check names the tokens stamp command');
    assert.ok(post >= 0, 'self_check names the summary post command');
    assert.ok(stamp < post, 'tokens stamp comes before summary post');
    assert.match(executor, NEVER_BY_HAND);
  });

  test('12. execute-trd.md create_summary_with_evidence names tokens stamp before summary post', () => {
    const workflow = readPlugin('devflow', 'workflows', 'execute-trd.md');
    const step = blockOf(workflow, /<step name="create_summary_with_evidence">/, '</step>');
    assert.ok(step, 'workflow has the create_summary_with_evidence step');
    const stamp = step.indexOf('tokens stamp');
    const post = step.indexOf('summary post');
    assert.ok(stamp >= 0, 'step names tokens stamp');
    assert.ok(post >= 0, 'step names summary post');
    assert.ok(stamp < post, 'tokens stamp comes before summary post');
    assert.match(step, NEVER_BY_HAND);
  });

  test('13. templates/summary.md documents tokens_input and tokens_output', () => {
    const template = readPlugin('devflow', 'templates', 'summary.md');
    assert.match(template, /tokens_input/);
    assert.match(template, /tokens_output/);
  });

  test('14. executor.md record-metric example passes --job "${TRD}", never --trd', () => {
    const executor = readPlugin('agents', 'executor.md');
    // 59-06: the call reads `df-tools.cjs --cwd <checkout> state record-metric`, so match the subcommand, not the prefix.
    const metrics = commandLines(executor, 'state record-metric').filter((l) => l.includes('df-tools.cjs'));
    assert.ok(metrics.length >= 1, 'executor.md has a record-metric example');
    for (const line of metrics) {
      assert.ok(line.includes('--job "${TRD}"'), `uses --job "\${TRD}": ${line}`);
      assert.doesNotMatch(line, /--trd\b/, `no --trd flag: ${line}`);
    }
  });
});

// ─── TRD 57-06: tokens backfill (EST-07) ─────────────────────────────────────
//
// Test list (TRD 57-06 tests 10-15; the names carry the `57-06` prefix because 10-14 above belong to 57-03):
//   10 dry run by default: counts, recovered and unrecovered by reason, no file changed
//   11 --write stamps the recovered SUMMARY (tokens_source "backfill"); a second --write writes nothing
//   12 --raw prints the formatBackfillReport lines (2 for a dry run, 3 with --write)
//   13 a failed write exits 1 and lists the failure; unrecoverable history never does
//   14 --write and --force belong to backfill only; backfill takes no TRD id
//   15 the help entry lists backfill
//   extra: --force restamps an already stamped SUMMARY; outside a project it asks for --repo
// Fixture: `99-demo/99-01` has an executor transcript, `98-old/98-01` has none, both with literal SUMMARYs. Spawned runs
// use the fake HOME of makeProject and `--root <fake projects root>`.

const SUMMARY_98_01 = SUMMARY_TEXT.replace('objective: 99-demo', 'objective: 98-old');
const SUMMARY_99_02 = [
  '---', 'objective: 99-demo', 'trd: "02"', 'tokens_input: 5', 'tokens_output: 6', '---', '', '# Objective 99 TRD 02: Stamped', '',
].join('\n');
const STAMPED_FIELDS = ['tokens_input: 140747', 'tokens_output: 1370', 'tokens_cache_read: 121144', 'tokens_cache_write: 19596',
  'token_model: "claude-opus-5-5"', 'tokens_source: "backfill"'];

/** `{relativePath: base64 bytes}` for every file under `dir`. */
function treeBytes(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(dir, abs)] = fs.readFileSync(abs).toString('base64');
    }
  };
  walk(dir);
  return out;
}

/** makeProject with the two backfill SUMMARYs (and a config.json); 99-01 has a transcript, 98-01 does not. */
function makeBackfillProject() {
  const p = makeProject({ dirs: ['99-demo', '98-old'] });
  const objectives = path.join(p.repo, '.planning', 'objectives');
  fs.writeFileSync(path.join(p.repo, '.planning', 'config.json'), '{}\n');
  fs.writeFileSync(path.join(objectives, '99-demo', '99-01-SUMMARY.md'), SUMMARY_TEXT);
  fs.writeFileSync(path.join(objectives, '98-old', '98-01-SUMMARY.md'), SUMMARY_98_01);
  p.transcript('99-01', '99-demo');
  return { ...p, summary99: path.join(objectives, '99-demo', '99-01-SUMMARY.md'), objectives };
}

describe('df-tools tokens backfill (end to end, TRD 57-06)', () => {
  test('57-06 10. a dry run reports recovered and unrecovered counts and changes no file', () => {
    const p = makeBackfillProject();
    try {
      const before = treeBytes(p.repo);
      const result = okJson(p, ['tokens', 'backfill', '--root', p.projectsRoot]);

      assert.equal(result.counts.summaries, 2);
      assert.equal(result.counts.recovered, 1);
      assert.equal(result.counts.unrecovered, 1);
      assert.equal(result.counts.already_stamped, 0);
      assert.equal(result.counts.by_reason.no_transcript, 1);
      assert.deepEqual(result.recovered, ['99-01']);
      assert.deepEqual(result.unrecovered, [{ id: '98-01', objective_dir: '98-old', reason: 'no_transcript' }]);
      assert.equal(result.index_counts.executor_transcripts, 1);
      assert.equal(result.checkout, p.repo);
      assert.equal(result.repo, p.repo);
      assert.equal(result.transcripts_root, p.projectsRoot);
      assert.equal(Object.prototype.hasOwnProperty.call(result, 'applied'), false, 'a dry run has no applied block');
      assert.deepEqual(treeBytes(p.repo), before, 'no file under the repository changed');
    } finally {
      p.cleanup();
    }
  });

  test('57-06 11. --write stamps the recovered SUMMARY with tokens_source "backfill"; a second --write writes nothing', () => {
    const p = makeBackfillProject();
    try {
      const first = okJson(p, ['tokens', 'backfill', '--write', '--root', p.projectsRoot]);
      assert.deepEqual(first.applied.written, ['99-01']);
      assert.deepEqual(first.applied.write_failed, []);
      const stamped = fs.readFileSync(p.summary99, 'utf-8');
      for (const line of STAMPED_FIELDS) assert.ok(stamped.includes(`${line}\n`), `has ${line}`);
      assert.equal(bodyOf(stamped), bodyOf(SUMMARY_TEXT), 'the body is byte-identical');
      assert.equal(
        fs.readFileSync(path.join(p.objectives, '98-old', '98-01-SUMMARY.md'), 'utf-8'), SUMMARY_98_01, 'the unrecovered SUMMARY is untouched',
      );

      const before = treeBytes(p.repo);
      const second = okJson(p, ['tokens', 'backfill', '--write', '--root', p.projectsRoot]);
      assert.deepEqual(second.applied.written, []);
      assert.equal(second.counts.already_stamped, 1);
      assert.equal(second.counts.recovered, 0);
      assert.deepEqual(treeBytes(p.repo), before, 'a second --write changes nothing');
    } finally {
      p.cleanup();
    }
  });

  test('57-06 11b. --force restamps an already stamped SUMMARY; without it the 5 and 6 stay', () => {
    const p = makeBackfillProject();
    try {
      const file = path.join(p.objectives, '99-demo', '99-02-SUMMARY.md');
      fs.writeFileSync(file, SUMMARY_99_02);
      p.transcript('99-02', '99-demo', { agentId: 'agent-99-02', session: 's2' });

      const plain = okJson(p, ['tokens', 'backfill', '--write', '--root', p.projectsRoot]);
      assert.deepEqual(plain.applied.written, ['99-01']);
      assert.equal(fs.readFileSync(file, 'utf-8'), SUMMARY_99_02, 'without --force the existing values stay');

      const forced = okJson(p, ['tokens', 'backfill', '--write', '--force', '--root', p.projectsRoot]);
      assert.deepEqual(forced.applied.written, ['99-02']);
      const text = fs.readFileSync(file, 'utf-8');
      assert.ok(text.includes('tokens_input: 140747\n'), 'tokens_input replaced');
      assert.ok(text.includes('tokens_source: "backfill"\n'));
      assert.equal((text.match(/^tokens_input:/gm) || []).length, 1, 'replaced in place, not duplicated');
    } finally {
      p.cleanup();
    }
  });

  test('57-06 12. --raw prints the formatBackfillReport lines: two for a dry run, three with --write', () => {
    const p = makeBackfillProject();
    try {
      const dry = p.run(['tokens', 'backfill', '--root', p.projectsRoot, '--raw']);
      assert.equal(dry.status, 0, dry.stderr);
      assert.equal(
        dry.stdout.replace(/\n$/, ''),
        'summaries 2 · already stamped 0 · recovered 1 · unrecovered 1 (no_transcript 1)\n'
        + 'executor transcripts 1 (identified 1, unidentified 0, ambiguous 0, foreign 0)',
      );

      const written = p.run(['tokens', 'backfill', '--write', '--root', p.projectsRoot, '--raw']);
      assert.equal(written.status, 0, written.stderr);
      const lines = written.stdout.replace(/\n$/, '').split('\n');
      assert.equal(lines.length, 3);
      assert.equal(lines[2], 'written 1 · unchanged 0 · skipped 0 · failed 0');
    } finally {
      p.cleanup();
    }
  });

  test('57-06 13. unrecoverable history exits 0; a --write whose summary post fails exits 1 and lists the failure', {
    skip: (process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0)) && 'needs a non-root POSIX user to make a directory read-only',
  }, () => {
    const p = makeBackfillProject();
    const dir = path.join(p.objectives, '99-demo');
    try {
      const calm = p.run(['tokens', 'backfill', '--root', p.projectsRoot]);
      assert.equal(calm.status, 0, 'an unrecovered SUMMARY is the normal outcome, never an error');

      fs.chmodSync(p.summary99, 0o444);
      fs.chmodSync(dir, 0o555);
      const r = p.run(['tokens', 'backfill', '--write', '--root', p.projectsRoot]);
      fs.chmodSync(dir, 0o755);
      fs.chmodSync(p.summary99, 0o644);

      assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
      const result = JSON.parse(r.stdout);
      assert.deepEqual(result.applied.written, []);
      assert.equal(result.applied.write_failed.length, 1);
      assert.equal(result.applied.write_failed[0].id, '99-01');
      assert.equal(result.applied.write_failed[0].objective_dir, '99-demo');
      assert.ok(result.applied.write_failed[0].error, 'the failure carries its error');
      assert.equal(fs.readFileSync(p.summary99, 'utf-8'), SUMMARY_TEXT, 'a failed write leaves the SUMMARY as it was');
    } finally {
      fs.chmodSync(dir, 0o755);
      p.cleanup();
    }
  });

  test('57-06 14. --write and --force belong to backfill only, and backfill takes no TRD id or draft', () => {
    const p = makeBackfillProject();
    try {
      const draft = p.draft('objectives/99-demo/99-01-SUMMARY.md');
      const before = treeBytes(p.repo);
      const cases = [
        ['tokens', 'stamp', '99-01', '--draft', draft, '--force'],
        ['tokens', 'stamp', '99-01', '--draft', draft, '--write'],
        ['tokens', 'trd', '99-01', '--force'],
        ['tokens', 'trd', '99-01', '--write'],
        ['tokens', 'backfill', '99-01'],
        ['tokens', 'backfill', '--draft', draft],
        ['tokens', 'backfill', '--objective-dir', '99-demo'],
        ['tokens', 'backfill', '--bogus'],
        ['tokens', 'backfill', '--root'],
      ];
      for (const args of cases) {
        const r = p.run(args);
        assert.equal(r.status, 1, `df-tools ${args.join(' ')} should exit 1\n${r.stdout}\n${r.stderr}`);
        assert.match(r.stderr, USAGE, `df-tools ${args.join(' ')} prints a usage line`);
        assert.doesNotMatch(r.stderr, /Unknown command/);
      }
      assert.deepEqual(treeBytes(p.repo), before, 'a usage error writes nothing');
    } finally {
      p.cleanup();
    }
  });

  test('57-06 14b. outside a DevFlow project, backfill is a usage error that names --repo', () => {
    const p = makeBackfillProject();
    try {
      const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-tokens-empty-')));
      try {
        const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', empty, 'tokens', 'backfill', '--root', p.projectsRoot], {
          cwd: p.tmp, env: { ...process.env, HOME: p.home, NOTIFIER_DISABLE: '1' }, encoding: 'utf-8', timeout: 60000,
        });
        assert.equal(r.status, 1);
        assert.match(r.stderr, /no DevFlow project/);
        assert.match(r.stderr, /pass --repo/);
      } finally {
        fs.rmSync(empty, { recursive: true, force: true });
      }
    } finally {
      p.cleanup();
    }
  });

  test('57-06 15. the tokens help usage lists backfill, --write and --force', () => {
    const { COMMANDS } = require('./help.cjs');
    assert.match(COMMANDS.tokens.usage, /backfill \[--write\] \[--force\]/);
    assert.match(COMMANDS.tokens.details, /dry run/i);

    const p = makeBackfillProject();
    try {
      const r = p.run(['tokens', '--help']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /backfill/);
    } finally {
      p.cleanup();
    }
  });
});

// ─── TRD 66-01: tokens coverage (EST-09) ─────────────────────────────────────

const V16_LINE_1 = 'v1.6 forward-stamped 2/6 = 0.333333 (target 95%: not met) · live 2 · backfill 1 · unlabeled 1 · missing 2 · in progress 1 (not counted)';

/** Run df-tools (no --raw: JSON), assert exit 0 and return the parsed stdout. */
function coverageJson(p, args) {
  const r = p.run(['tokens', 'coverage', ...args]);
  assert.equal(r.status, 0, `df-tools tokens coverage ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Run df-tools with --raw, assert exit 0 and return the stdout without its final newline. */
function coverageText(p, args) {
  const r = p.run(['tokens', 'coverage', ...args, '--raw']);
  assert.equal(r.status, 0, `df-tools tokens coverage ${args.join(' ')} --raw\n${r.stdout}\n${r.stderr}`);
  return r.stdout.replace(/\n$/, '');
}

describe('66-01 tokens coverage (end to end)', () => {
  test('66-01 1. with no flag the scope is the current milestone: only 65-* and 66-*, counted from the fixture', () => {
    const p = makeCoverageProject(V16_FIXTURE);
    try {
      const r = coverageJson(p, []);
      assert.equal(r.scope.kind, 'milestone');
      assert.equal(r.scope.version, 'v1.6');
      assert.deepEqual(r.entries.map((e) => [e.id, e.class]), [
        ['65-01', 'live'], ['65-02', 'missing'], ['65-03', 'missing'], ['65-04', 'live'],
        ['66-01', 'backfill'], ['66-02', 'unlabeled'], ['66-03', 'in_progress'],
      ]);
      assert.deepEqual(r.counts, { summaries: 7, counted: 6, live: 2, backfill: 1, unlabeled: 1, missing: 2, in_progress: 1 });
      assert.equal(r.forward.numerator, 2);
      assert.equal(r.forward.denominator, 6);
      assert.equal(r.forward.ratio_text, '0.333333');
      assert.equal(r.forward.met, false);
      assert.equal(r.forward.target_percent, 95);
      assert.deepEqual(r.scope.objectives.map((o) => o.number), ['65', '66']);
    } finally {
      p.cleanup();
    }
  });

  test('66-01 2. --raw prints the summary line, then one line per non-live entry in id order', () => {
    const p = makeCoverageProject(V16_FIXTURE);
    try {
      assert.equal(coverageText(p, []), [
        V16_LINE_1,
        '  65-02 missing (no_transcript)',
        '  65-03 missing (no_transcript)',
        '  66-01 backfill',
        '  66-02 unlabeled',
        '  66-03 in progress',
      ].join('\n'));
    } finally {
      p.cleanup();
    }
  });

  test('66-01 3. --milestone v1.5 (or 1.5) reads the archived objective directory', () => {
    const p = makeCoverageProject(V16_FIXTURE);
    try {
      const r = coverageJson(p, ['--milestone', 'v1.5']);
      assert.equal(r.scope.kind, 'milestone');
      assert.equal(r.scope.version, 'v1.5');
      assert.deepEqual(r.entries.map((e) => [e.id, e.class, e.path]), [
        ['64-01', 'live', '.planning/milestones/v1.5-objectives/64-old/64-01-SUMMARY.md'],
      ]);
      assert.equal(r.forward.ratio_text, '1');
      assert.equal(r.forward.met, true);

      const bare = coverageJson(p, ['--milestone', '1.5']);
      assert.equal(bare.scope.version, 'v1.5');
      assert.deepEqual(bare.entries.map((e) => e.id), ['64-01']);
      assert.equal(
        coverageText(p, ['--milestone', 'v1.5']),
        'v1.5 forward-stamped 1/1 = 1 (target 95%: met) · live 1 · backfill 0 · unlabeled 0 · missing 0 · in progress 0 (not counted)',
      );
    } finally {
      p.cleanup();
    }
  });

  test('66-01 4. --objective 65 scopes to that objective directory only', () => {
    const p = makeCoverageProject(V16_FIXTURE);
    try {
      const r = coverageJson(p, ['--objective', '65']);
      assert.equal(r.scope.kind, 'objective');
      assert.equal(r.scope.objective, '65');
      assert.deepEqual(r.entries.map((e) => e.id), ['65-01', '65-02', '65-03', '65-04']);
      assert.deepEqual(r.scope.objectives, [{ number: '65', dir: '.planning/objectives/65-release' }]);
      assert.ok(
        coverageText(p, ['--objective', '65']).startsWith('objective 65 forward-stamped 2/4 = 0.5 (target 95%: not met)'),
      );

      const archived = coverageJson(p, ['--objective', '64']);
      assert.deepEqual(archived.entries.map((e) => e.id), ['64-01'], 'an archived objective is found too');
    } finally {
      p.cleanup();
    }
  });

  test('66-01 5. a missing SUMMARY with an executor transcript is stamp_skipped; --root and --repo are honored', () => {
    const p = makeCoverageProject(V16_FIXTURE);
    const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-coverage-empty-')));
    try {
      p.transcript('65-03', '65-release');

      const reasons = (r) => Object.fromEntries(r.entries.filter((e) => e.class === 'missing').map((e) => [e.id, e.reason]));
      assert.deepEqual(reasons(coverageJson(p, [])), { '65-02': 'no_transcript', '65-03': 'stamp_skipped' },
        'the default root is HOME/.claude/projects');
      assert.deepEqual(reasons(coverageJson(p, ['--root', p.projectsRoot])), { '65-02': 'no_transcript', '65-03': 'stamp_skipped' });
      assert.deepEqual(reasons(coverageJson(p, ['--root', empty])), { '65-02': 'no_transcript', '65-03': 'no_transcript' },
        'another --root has no transcript');
      assert.deepEqual(reasons(coverageJson(p, ['--repo', p.repo])), { '65-02': 'no_transcript', '65-03': 'stamp_skipped' });
      assert.deepEqual(reasons(coverageJson(p, ['--repo', empty])), { '65-02': 'no_transcript', '65-03': 'no_transcript' },
        'transcripts of another repository do not count');
      assert.ok(coverageText(p, []).split('\n').includes('  65-03 missing (stamp_skipped)'));
      assert.ok(coverageText(p, []).split('\n').includes('  65-02 missing (no_transcript)'));
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
      p.cleanup();
    }
  });

  test('66-01 5b. from outside a project, --repo names the project to read', () => {
    const p = makeCoverageProject(V16_FIXTURE);
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-coverage-outside-')));
    try {
      const run = (args) => spawnSync(process.execPath, [DF_TOOLS, '--cwd', outside, 'tokens', 'coverage', ...args], {
        cwd: p.tmp, env: { ...process.env, HOME: p.home, NOTIFIER_DISABLE: '1' }, encoding: 'utf-8', timeout: 60000,
      });
      const none = run([]);
      assert.equal(none.status, 1);
      assert.match(none.stderr, /no DevFlow project/);
      assert.match(none.stderr, /pass --repo/);

      const ok = run(['--repo', p.repo, '--raw']);
      assert.equal(ok.status, 0, ok.stderr);
      assert.equal(ok.stdout.split('\n')[0], V16_LINE_1);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
      p.cleanup();
    }
  });

  test('66-01 6. usage errors exit 1 with the USAGE line on stderr and name what is wrong', () => {
    const p = makeCoverageProject(V16_FIXTURE);
    const bare = makeCoverageProject({ objectives: { '65-release': [{ id: '65-01', kind: 'live' }] } });
    try {
      const before = p.hashTree(p.repo);
      const cases = [
        [['--milestone', 'v1.6', '--objective', '65'], /not both|only one|either/i],
        [['65-01'], /takes no TRD id/],
        [['--since', '65'], /unknown flag --since/],
        [['--write'], /only valid for tokens backfill/],
        [['--objective', 'x1'], /--objective/],
        [['--milestone', 'v9.9'], /milestone v9\.9 not in ROADMAP\.md/],
        [['--objective', '99'], /no objective directory/i],
        [['--milestone'], /needs a value/],
      ];
      for (const [args, want] of cases) {
        const r = p.run(['tokens', 'coverage', ...args]);
        assert.equal(r.status, 1, `tokens coverage ${args.join(' ')} should exit 1\n${r.stdout}\n${r.stderr}`);
        assert.match(r.stderr, USAGE, `tokens coverage ${args.join(' ')} prints a usage line`);
        assert.match(r.stderr, want, `tokens coverage ${args.join(' ')}`);
        assert.doesNotMatch(r.stderr, /Unknown command/);
      }

      const noRoadmap = bare.run(['tokens', 'coverage']);
      assert.equal(noRoadmap.status, 1, 'the default scope needs a ROADMAP.md');
      assert.match(noRoadmap.stderr, /ROADMAP\.md not found/);
      assert.match(noRoadmap.stderr, USAGE);
      assert.equal(bare.run(['tokens', 'coverage', '--objective', '65']).status, 0, '--objective needs no ROADMAP.md');

      assert.deepEqual(p.hashTree(p.repo), before, 'a usage error writes nothing');
    } finally {
      bare.cleanup();
      p.cleanup();
    }
  });

  test('66-01 7. a report writes nothing: every file under the repo and the projects root is byte-identical', () => {
    const p = makeCoverageProject(V16_FIXTURE);
    try {
      p.transcript('65-03', '65-release');
      const repoBefore = p.hashTree(p.repo);
      const rootBefore = p.hashTree(p.projectsRoot);
      assert.ok(repoBefore.length > 0 && rootBefore.length > 0);

      const r = coverageJson(p, []);
      assert.equal(r.counts.missing, 2, 'the run had missing entries, so the transcript index was consulted');
      coverageText(p, []);
      coverageJson(p, ['--objective', '65']);
      coverageJson(p, ['--milestone', 'v1.5']);

      assert.deepEqual(p.hashTree(p.repo), repoBefore);
      assert.deepEqual(p.hashTree(p.projectsRoot), rootBefore);
    } finally {
      p.cleanup();
    }
  });

  test('66-01 8. the tokens help usage lists coverage and --milestone / --objective', () => {
    const { COMMANDS } = require('./help.cjs');
    assert.match(COMMANDS.tokens.usage, /coverage \[--milestone <v> \| --objective <N>\]/);
    assert.match(COMMANDS.tokens.summary, /coverage/);
    assert.match(COMMANDS.tokens.details, /live\/counted/);

    const p = makeCoverageProject(V16_FIXTURE);
    try {
      const r = p.run(['tokens', '--help']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /coverage/);
    } finally {
      p.cleanup();
    }
  });

  test('66-01 9. readRootFor reads the main checkout in store mode and the checkout holding cwd in local mode', () => {
    const { readRootFor } = require('./tokens-cli.cjs');
    assert.equal(readRootFor({ mode: 'store', main: '/m', checkout: '/w' }), '/m');
    assert.equal(readRootFor({ mode: 'local', main: '/m', checkout: '/w' }), '/w');
    assert.equal(readRootFor({ mode: 'local', main: '/m', checkout: null }), '/m');
  });
});
