'use strict';

// TRD 66-03 (EST-09): every TRD runs in an executor, continuation prompts name their TRD, the report shows stamp
// coverage. Read-only against the repository and skipped outside an AOForge checkout.
//
// Evidence behind it:
//   - 65-02 and 65-03 were executed inline by the orchestrator (commit 220769c5). No executor ran, so there is no
//     executor transcript and `tokens trd 65-02` returns `no_transcript`.
//   - checkpoint_handling said "using continuation-prompt.md template", and no such template exists. An improvised
//     continuation prompt may not carry PLAN_ID / REPO_ROOT, so its transcript is never attributed to the TRD and the
//     stop gate cannot identify it.
//   - `{plan_id}` expands to the objective-job-index id, which carries the slug (66-01-tokens-coverage-command).
//     trd-identify's ID_END (?![\w-]) rejects a PLAN_ID line with a trailing slug, so the PLAN_ID line must carry the
//     short `{trd_id}` (`{objective_number}-{plan_number}`). `--id {plan_id}` stays the slug: it must match the id
//     `exec-context worktree` provisioned, and a slug there is simply not captured by the identifier.
//
// Tests (outermost first):
//   1. checkpoint_handling states the never-inline rule, with the reason (tokens stamp reads the executor transcript).
//   2. No file under plugins/aoforge/ mentions continuation-prompt.md, and the template does not exist. If someone
//      later adds that template, update this test together with it.
//   3. checkpoint_handling has an explicit continuation Task( spawn: shape, PLAN_ID uses {trd_id}, --id uses {plan_id}.
//   4. Filled with literal values, the continuation prompt is identified by identifyTrd and identifyExecutorTrd.
//   5. Regression pin: the execute_waves item-4 prompt carries {trd_id} on PLAN_ID and is identified identically.
//   6. An initial and a continuation executor transcript of one TRD are summed by tokensForTrd.
//   7. The continuation prompt stamps tokens before summary post and mentions ## Self-Check.
//   8. aggregate_results carries `tokens coverage --objective ${OBJECTIVE_NUMBER} --raw` as one plain command, with a
//      fail-soft clause and a no-backfill clause.
//   9. The matcher used in 8 rejects an unknown subcommand and a piped call.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { identifyTrd } = require('./trd-identify.cjs');
const { identifyExecutorTrd, indexExecutorTranscripts, tokensForTrd } = require('./token-usage.cjs');
const F = require('./__fixtures__/transcript-fixtures.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
const PLUGIN = path.join(REPO_ROOT, 'plugins', 'aoforge');
const WORKFLOW_REL = 'plugins/aoforge/aoforge/workflows/execute-objective.md';

const workflow = () => fs.readFileSync(path.join(REPO_ROOT, WORKFLOW_REL), 'utf-8');

/** The text between the first `openTag` and the first `closeTag` after it. Throws a readable failure when absent. */
function between(text, openTag, closeTag) {
  const from = text.indexOf(openTag);
  assert.ok(from !== -1, `${WORKFLOW_REL}: missing ${openTag}`);
  const start = from + openTag.length;
  const to = text.indexOf(closeTag, start);
  assert.ok(to !== -1, `${WORKFLOW_REL}: ${openTag} is never closed by ${closeTag}`);
  return text.slice(start, to);
}

const checkpointHandling = () => between(workflow(), '<step name="checkpoint_handling">', '</step>');
const executeWaves = () => between(workflow(), '<step name="execute_waves">', '</step>');

/** The contents of every fenced code block in a text. */
function fencedBlocks(text) {
  return [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/** The text of the first `prompt="..."` after `from` (the prompt holds no double quote, so it ends at the next one). */
function promptAfter(text, from) {
  const open = text.indexOf('prompt="', from);
  assert.ok(open !== -1, 'a prompt="..." argument');
  const start = open + 'prompt="'.length;
  const end = text.indexOf('"', start);
  assert.ok(end !== -1, 'the prompt ends at a closing double quote');
  return text.slice(start, end);
}

/** The fenced block of checkpoint_handling that spawns the continuation executor. */
function continuationBlock() {
  const blocks = fencedBlocks(checkpointHandling()).filter((b) => b.includes('Task(') && b.includes('subagent_type="executor"'));
  assert.equal(blocks.length, 1, 'checkpoint_handling has exactly one executor Task( block (the continuation spawn)');
  return blocks[0];
}

const continuationPrompt = () => {
  const block = continuationBlock();
  return promptAfter(block, block.indexOf('subagent_type="executor"'));
};

/** The first executor prompt of execute_waves (item 4). */
const initialPrompt = () => {
  const step = executeWaves();
  const at = step.indexOf('subagent_type="executor"');
  assert.ok(at !== -1, 'execute_waves has an executor Task( block');
  return promptAfter(step, at);
};

/** Replace only the listed `{placeholders}`; every other `{...}` stays literal. */
function fill(prompt, values) {
  let out = prompt;
  for (const [name, value] of Object.entries(values)) out = out.split(`{${name}}`).join(value);
  return out;
}

// A realistic expansion: {plan_id} carries the slug (objective-job-index), {trd_id} is the short id.
const TRD_CONTENT = [
  '---',
  'objective: 77-x',
  'trd: "02"',
  '---',
  '# TRD 77-02: fixture',
  '<objective>fixture</objective>',
].join('\n');

function valuesFor(repo) {
  return {
    plan_id: '77-02-fixture-slug',
    trd_id: '77-02',
    REPO_ROOT: repo,
    WAVE_BASE: 'abc1234',
    CHECKOUT: repo,
    objective_number: '77',
    objective_name: 'x',
    plan_number: '02',
    TRD_CONTENT,
  };
}

const linesOf = (text) => text.split('\n').map((l) => l.trim());

// The tokens subcommands named by tokens-cli.cjs USAGE: `tokens <trd ... | stamp ... | backfill ... | coverage [...]>`.
const TOKENS_SUBCOMMANDS = (() => {
  const { USAGE } = require('./tokens-cli.cjs');
  const open = USAGE.indexOf('<');
  const close = USAGE.indexOf('> [--objective-dir');
  assert.ok(open !== -1 && close > open, 'tokens-cli.cjs USAGE lists its subcommands between < and > [--objective-dir');
  return USAGE.slice(open + 1, close).split('|').map((part) => part.trim().split(/\s/)[0]).filter((w) => /^[a-z]+$/.test(w));
})();

// Findings for every `aof-tools.cjs tokens ...` call in a text: an unknown subcommand, or a composed command line.
function tokensCallProblems(text, allowed) {
  const problems = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/aof-tools\.cjs tokens\s+([A-Za-z_-]+)/g)) {
      if (!allowed.includes(m[1])) problems.push(`line ${i + 1}: unknown tokens subcommand "${m[1]}"`);
    }
    if (/aof-tools\.cjs tokens/.test(line) && /&&|\||\$\(/.test(line)) problems.push(`line ${i + 1}: tokens call is not one plain command`);
  });
  return problems;
}

describe('executor token stamp coverage (TRD 66-03)', { skip: !IS_AOFORGE_CHECKOUT && 'not an aoforge-claude checkout' }, () => {
  test('1. checkpoint_handling says every TRD runs in an executor, and why', () => {
    const step = checkpointHandling();
    assert.match(step, /Every TRD runs in an executor/);
    assert.match(step, /Never write a TRD's SUMMARY yourself/);
    const paragraph = step.split(/\n\s*\n/).find((p) => p.includes("Never write a TRD's SUMMARY yourself"));
    assert.ok(paragraph, 'a paragraph holds the SUMMARY rule');
    assert.match(paragraph, /tokens stamp/, 'the same paragraph names tokens stamp');
    assert.match(paragraph, /transcript/, 'the same paragraph names the transcript');
    assert.doesNotMatch(step, /prefer an executor/i, 'the rule is unconditional');
  });

  test('2. no dangling continuation-prompt.md reference, and no such template', () => {
    // If someone later adds templates/continuation-prompt.md, update this test together with that change.
    const hits = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.md') && fs.readFileSync(full, 'utf-8').includes('continuation-prompt.md')) {
          hits.push(path.relative(REPO_ROOT, full));
        }
      }
    })(PLUGIN);
    assert.deepEqual(hits, [], 'files that still mention continuation-prompt.md');
    assert.equal(fs.existsSync(path.join(PLUGIN, 'aoforge', 'templates', 'continuation-prompt.md')), false);
  });

  test('3. checkpoint_handling carries an explicit continuation spawn', () => {
    const block = continuationBlock();
    assert.ok(block.includes('description="Execute TRD {trd_id} (continuation)"'), 'description names the short {trd_id}');

    const prompt = continuationPrompt();
    for (const needle of [
      '<completed_tasks>', '{completed_tasks_table}', '{user_response}', '{resume_task_number}',
      '--- BEGIN TRD ---', '{TRD_CONTENT}',
    ]) {
      assert.ok(prompt.includes(needle), `continuation prompt contains ${needle}`);
    }
    const lines = linesOf(prompt);
    assert.ok(lines.includes('REPO_ROOT:  {REPO_ROOT}'), 'a REPO_ROOT:  {REPO_ROOT} line');
    assert.ok(lines.includes('PLAN_ID:    {trd_id}'), 'a PLAN_ID:    {trd_id} line (the short id, never the slug)');
    assert.ok(!lines.some((l) => /^PLAN_ID:\s*\{plan_id\}/.test(l)), 'no PLAN_ID line carries the slug {plan_id}');
    assert.ok(
      lines.some((l) => l.endsWith('exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}')),
      'the exec-context check line with --id {plan_id}, the id the worktree was provisioned under'
    );
  });

  test('4. the filled continuation prompt is identified as the TRD', () => {
    const filled = fill(continuationPrompt(), valuesFor('/fixture/repo'));
    assert.deepEqual(identifyTrd(filled), { id: '77-02', repoRoot: '/fixture/repo' });
    const viaTokens = identifyExecutorTrd({ prompt: filled, description: 'Execute TRD 77-02 (continuation)' });
    assert.equal(viaTokens.id, '77-02');
    // The description is written from the same template, so it identifies the TRD on its own as well.
    const description = fill(/description="([^"]*)"/.exec(continuationBlock())[1], valuesFor('/fixture/repo'));
    assert.equal(description, 'Execute TRD 77-02 (continuation)');
    assert.equal(identifyExecutorTrd({ prompt: '', description }).id, '77-02');
  });

  test('5. the filled execute_waves item-4 prompt is identified identically (regression pin)', () => {
    const step = executeWaves();
    assert.match(
      step,
      /`\{trd_id\}`[^\n]*\{objective_number\}-\{plan_number\}/,
      'execute_waves defines {trd_id} as {objective_number}-{plan_number}, distinct from the slug {plan_id}'
    );
    const prompt = initialPrompt();
    const lines = linesOf(prompt);
    assert.ok(lines.includes('PLAN_ID:    {trd_id}'), 'the item-4 prompt has a PLAN_ID:    {trd_id} line');
    assert.ok(!lines.some((l) => /^PLAN_ID:\s*\{plan_id\}/.test(l)), 'no PLAN_ID line carries the slug {plan_id}');
    assert.ok(
      lines.some((l) => l.endsWith('exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}')),
      'the item-4 exec-context check keeps --id {plan_id}'
    );

    const filled = fill(prompt, valuesFor('/fixture/repo'));
    assert.deepEqual(identifyTrd(filled), { id: '77-02', repoRoot: '/fixture/repo' });
    assert.equal(identifyExecutorTrd({ prompt: filled, description: '' }).id, '77-02');
  });

  test('6. an initial and a continuation executor transcript of one TRD are summed', () => {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-66-03-repo-')));
    const projectsRoot = F.makeProjectsRoot();
    try {
      fs.mkdirSync(path.join(repo, '.planning', 'objectives', '77-x'), { recursive: true });
      const values = valuesFor(repo);
      const key = F.projectKeyFor(repo);
      F.writeSubagentTranscript(projectsRoot, {
        projectKey: key, session: 'sess-a', agentId: 'initial', description: 'Execute TRD 77-02',
        prompt: fill(initialPrompt(), values), cwd: repo, records: F.THREE_MESSAGES,
      });
      F.writeSubagentTranscript(projectsRoot, {
        projectKey: key, session: 'sess-a', agentId: 'resume',
        description: fill(/description="([^"]*)"/.exec(continuationBlock())[1], values),
        prompt: fill(continuationPrompt(), values), cwd: repo, records: F.THREE_MESSAGES,
      });

      const index = indexExecutorTranscripts({ root: projectsRoot, repoRoot: repo });
      assert.equal(index.counts.identified, 2, JSON.stringify(index.counts));
      assert.deepEqual(index.entries.map((e) => e.id), ['77-02', '77-02']);

      const total = tokensForTrd(index, { id: '77-02', dir: '77-x' });
      assert.equal(total.status, 'recovered', JSON.stringify(total));
      assert.equal(total.transcripts.length, 2);
      assert.equal(total.totals.tokens_output, 2 * 1370);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(projectsRoot, { recursive: true, force: true });
    }
  });

  test('7. the continuation prompt stamps tokens before it posts, and asks for the Self-Check', () => {
    const prompt = continuationPrompt();
    const stamp = prompt.indexOf('tokens stamp {trd_id} --draft');
    const post = prompt.indexOf('summary post {trd_id} --from');
    assert.ok(stamp !== -1, 'the prompt names tokens stamp {trd_id} --draft');
    assert.ok(post !== -1, 'the prompt names summary post {trd_id} --from');
    assert.ok(stamp < post, 'tokens stamp comes before summary post');
    assert.ok(prompt.includes('## Self-Check'), 'the prompt mentions ## Self-Check');
  });

  test('8. aggregate_results shows the token stamp coverage line as one plain command', () => {
    assert.ok(TOKENS_SUBCOMMANDS.includes('coverage'), `tokens-cli.cjs USAGE no longer names coverage: ${TOKENS_SUBCOMMANDS}`);
    const aggregate = between(workflow(), '<step name="aggregate_results">', '</step>');
    const line = 'node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverage --objective ${OBJECTIVE_NUMBER} --raw';
    assert.ok(aggregate.includes(line), 'aggregate_results names the tokens coverage command for the objective');
    assert.match(aggregate, /\*\*Token stamp:\*\*/, 'a **Token stamp:** line in the report template');
    assert.deepEqual(tokensCallProblems(workflow(), TOKENS_SUBCOMMANDS), [], 'every aof-tools.cjs tokens call in the workflow');
    assert.match(aggregate, /omit the line/i, 'a fail-soft clause');
    assert.match(aggregate, /never .*backfill/i, 'a no-backfill clause');
  });

  test('9. sensitivity: the matcher flags an unknown subcommand and a piped call, and passes the real line', () => {
    const real = 'node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverage --objective ${OBJECTIVE_NUMBER} --raw';
    assert.deepEqual(tokensCallProblems(real, TOKENS_SUBCOMMANDS), []);
    assert.deepEqual(tokensCallProblems('node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverage --objective 1 --raw', TOKENS_SUBCOMMANDS), []);

    const unknown = tokensCallProblems('node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverge --objective 1 --raw', TOKENS_SUBCOMMANDS);
    assert.equal(unknown.length, 1);
    assert.match(unknown[0], /unknown tokens subcommand "coverge"/);

    const piped = tokensCallProblems('node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverage --objective 1 --raw | head -1', TOKENS_SUBCOMMANDS);
    assert.equal(piped.length, 1);
    assert.match(piped[0], /not one plain command/);

    const chained = tokensCallProblems('node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverage --raw && echo done', TOKENS_SUBCOMMANDS);
    assert.equal(chained.length, 1);
    const substituted = tokensCallProblems('X=$(node ~/.claude/aoforge/bin/aof-tools.cjs tokens coverage --raw)', TOKENS_SUBCOMMANDS);
    assert.equal(substituted.length, 1);
  });
});
