'use strict';

// tokens-cli.test.cjs (TRD 57-03) — `df-tools tokens trd|stamp`, the forward token stamp (EST-06).
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
//     11-14 executor.md / execute-trd.md / summary.md template   (added with Task 2)
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
