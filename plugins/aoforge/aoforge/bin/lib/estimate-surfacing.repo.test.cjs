'use strict';

// estimate-surfacing.repo.test.cjs — TRD 58-09 (EST-04, EST-05).
//
// Pins where `aof-tools estimate` is surfaced in prose: the planner's PLANNING COMPLETE return, plan-objective's
// PLANNING COMPLETE handling and `<offer_next>`, /aoforge:build (one-line estimate, run state, finish line) and
// execute-objective's wave reports. The prose pastes aof-tools output verbatim, so what is tested is that each call
// exists, is one plain command, names a real subcommand, and sits where the reader looks. Read-only: this test never
// writes to the repo. Skipped when the tree is not an AOForge checkout (as doc-surfaces.test.cjs does).
//
// Test list:
// 1. agents/planner.md: the `## PLANNING COMPLETE` template carries `**Estimate:**` and the command
//    `aof-tools.cjs estimate objective` with `--table --raw`; the return-budget sentence says the estimate table is
//    pasted verbatim on top of the budget; an `estimate` step precedes `offer_next`.
// 2. workflows/plan-objective.md: the step 10 PLANNING COMPLETE bullet mentions the Estimate; `<offer_next>` has an
//    `### Estimate` heading followed by `aof-tools.cjs estimate objective {X} --table --raw`.
// 3. workflows/build.md: `estimate objective ... --line --raw` appears before `## 4. Research` (and step 3's plan has
//    an `**Estimate:**` bullet); `estimate start` is inside `## 7. Execute TRDs` before the execute-objective Task(;
//    `estimate finish` is inside `## 8.`.
// 4. workflows/execute-objective.md: in `execute_waves` item 1, `estimate wave ... --start` precedes `Spawning {count}
//    agent(s)`; in item 6, `estimate wave ... --done` precedes `## Wave {N} Complete`, whose template carries an
//    estimate line placeholder; `aggregate_results` has `estimate finish`.
// 5. Each of the four files calls `aof-tools.cjs estimate <sub>` at least once; every call names a subcommand in
//    estimate-cli.cjs's USAGE, is one plain command (no `&&`, pipe or `$(`), and each file carries a fail-soft sentence
//    (`never block`).
// 6. Sensitivity: the matcher flags `aof-tools.cjs estimate objectives 3` (unknown subcommand) and a piped call, and
//    passes `aof-tools.cjs estimate objective 3 --line --raw`.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { USAGE } = require('./estimate-cli.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

const FILES = {
  planner: 'plugins/aoforge/agents/planner.md',
  planObjective: 'plugins/aoforge/aoforge/workflows/plan-objective.md',
  build: 'plugins/aoforge/aoforge/workflows/build.md',
  executeObjective: 'plugins/aoforge/aoforge/workflows/execute-objective.md',
};

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
}

// The text between two anchors (end exclusive). A missing anchor fails with the file and the anchor named.
function between(src, rel, startAnchor, endAnchor) {
  const start = src.indexOf(startAnchor);
  assert.notEqual(start, -1, `${rel}: missing anchor ${JSON.stringify(startAnchor)}`);
  const end = endAnchor === undefined ? src.length : src.indexOf(endAnchor, start + startAnchor.length);
  assert.notEqual(end, -1, `${rel}: missing anchor ${JSON.stringify(endAnchor)} after ${JSON.stringify(startAnchor)}`);
  return src.slice(start, end);
}

function contains(text, rel, pattern, what) {
  assert.match(text, pattern, `${rel}: expected ${what}`);
}

// Index of the first match, asserting there is one.
function indexOfMatch(text, rel, pattern, what) {
  const m = pattern.exec(text);
  assert.ok(m, `${rel}: expected ${what}`);
  return m.index;
}

const SUBCOMMANDS = [...USAGE.matchAll(/aof-tools estimate ([a-z]+)/g)].map((m) => m[1]);

// Findings for every `aof-tools.cjs estimate ...` call in a text: an unknown subcommand, or a composed command line.
function estimateCallProblems(text, allowed) {
  const problems = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/aof-tools\.cjs estimate\s+([A-Za-z_-]+)/g)) {
      if (!allowed.includes(m[1])) {
        problems.push(`line ${i + 1}: unknown estimate subcommand "${m[1]}"`);
      }
    }
    if (/aof-tools\.cjs estimate/.test(line) && /&&|\||\$\(/.test(line)) {
      problems.push(`line ${i + 1}: estimate call is not one plain command`);
    }
  });
  return problems;
}

describe('estimate surfacing (TRD 58-09)', { skip: !IS_AOFORGE_CHECKOUT ? 'not an AOForge checkout' : false }, () => {
  test('1. planner.md PLANNING COMPLETE carries the Estimate table, the budget note and an estimate step', () => {
    const rel = FILES.planner;
    const src = read(rel);

    const block = /```markdown\n## PLANNING COMPLETE\n[\s\S]*?```/.exec(src);
    assert.ok(block, `${rel}: missing the "## PLANNING COMPLETE" template block`);
    contains(block[0], rel, /\*\*Estimate:\*\*/, 'the **Estimate:** field in the PLANNING COMPLETE template');
    contains(block[0], rel, /aof-tools\.cjs estimate objective/, 'the command aof-tools.cjs estimate objective in the template');
    contains(block[0], rel, /--table --raw/, '--table --raw in the template');

    const budget = /\*\*Return budget:[^\n]*/.exec(src);
    assert.ok(budget, `${rel}: missing the "**Return budget:" sentence`);
    contains(budget[0], rel, /estimate table[^\n]*verbatim[^\n]*on top of/i, 'the budget sentence to say the estimate table is pasted verbatim on top of the budget');

    const stepAt = indexOfMatch(src, rel, /<step name="estimate">/, '<step name="estimate">');
    const offerAt = indexOfMatch(src, rel, /<step name="offer_next">/, '<step name="offer_next">');
    assert.ok(stepAt < offerAt, `${rel}: <step name="estimate"> must come before <step name="offer_next">`);
  });

  test('2. plan-objective.md shows the Estimate on PLANNING COMPLETE and re-runs it in offer_next', () => {
    const rel = FILES.planObjective;
    const src = read(rel);

    const bullet = /- \*\*`## PLANNING COMPLETE`:\*\*[^\n]*/.exec(src);
    assert.ok(bullet, `${rel}: missing the step 10 "## PLANNING COMPLETE" bullet`);
    contains(bullet[0], rel, /Estimate/, 'the step 10 PLANNING COMPLETE bullet to mention the Estimate');

    const offer = between(src, rel, '<offer_next>', '</offer_next>');
    const headingAt = indexOfMatch(offer, rel, /^### Estimate$/m, 'an "### Estimate" heading in <offer_next>');
    const after = offer.slice(headingAt);
    contains(after, rel, /aof-tools\.cjs estimate objective \{X\} --table --raw/, 'aof-tools.cjs estimate objective {X} --table --raw under the Estimate heading');
  });

  test('3. build.md prints the one-line estimate early, starts the run and shows the finish line', () => {
    const rel = FILES.build;
    const src = read(rel);

    const lineAt = indexOfMatch(src, rel, /aof-tools\.cjs estimate objective [^\n]*--line --raw/, 'aof-tools.cjs estimate objective ... --line --raw');
    const researchAt = src.indexOf('## 4. Research');
    assert.notEqual(researchAt, -1, `${rel}: missing anchor "## 4. Research"`);
    assert.ok(lineAt < researchAt, `${rel}: the one-line estimate must appear before "## 4. Research"`);

    const plan = between(src, rel, '## 3. Present Build Plan', '## 4. Research');
    contains(plan, rel, /\*\*Estimate:\*\*/, 'an **Estimate:** bullet in step 3\'s plan');

    const exec = between(src, rel, '## 7. Execute TRDs', '## 8.');
    const startAt = indexOfMatch(exec, rel, /aof-tools\.cjs estimate start /, 'aof-tools.cjs estimate start inside "## 7. Execute TRDs"');
    const taskAt = exec.indexOf('Task(');
    assert.notEqual(taskAt, -1, `${rel}: missing the execute-objective Task( in "## 7. Execute TRDs"`);
    assert.ok(startAt < taskAt, `${rel}: estimate start must come before the execute-objective Task(`);

    const done = between(src, rel, '## 8.');
    contains(done, rel, /aof-tools\.cjs estimate finish /, 'aof-tools.cjs estimate finish inside "## 8."');
  });

  test('4. execute-objective.md records each wave and closes the run in the aggregate', () => {
    const rel = FILES.executeObjective;
    const src = read(rel);

    const waves = between(src, rel, '<step name="execute_waves">', '</step>');

    const item1 = between(waves, rel, "1. **Describe what's being built", '2. **Create progress tasks');
    const startAt = indexOfMatch(item1, rel, /aof-tools\.cjs estimate wave [^\n]*--start/, 'aof-tools.cjs estimate wave ... --start in execute_waves item 1');
    const spawnAt = item1.indexOf('Spawning {count} agent(s)');
    assert.notEqual(spawnAt, -1, `${rel}: missing "Spawning {count} agent(s)" in execute_waves item 1`);
    assert.ok(startAt < spawnAt, `${rel}: estimate wave --start must come before "Spawning {count} agent(s)"`);

    const item6 = between(waves, rel, '6. **Report completion', '7. **Handle failures');
    const doneAt = indexOfMatch(item6, rel, /aof-tools\.cjs estimate wave [^\n]*--done/, 'aof-tools.cjs estimate wave ... --done in execute_waves item 6');
    const reportAt = item6.indexOf('## Wave {N} Complete');
    assert.notEqual(reportAt, -1, `${rel}: missing "## Wave {N} Complete" in execute_waves item 6`);
    assert.ok(doneAt < reportAt, `${rel}: estimate wave --done must come before "## Wave {N} Complete"`);
    const template = item6.slice(reportAt);
    contains(template, rel, /\{actual vs estimate line\}/, 'an {actual vs estimate line} placeholder in the Wave Complete template');

    const aggregate = between(src, rel, '<step name="aggregate_results">', '</step>');
    contains(aggregate, rel, /aof-tools\.cjs estimate finish /, 'aof-tools.cjs estimate finish inside aggregate_results');
  });

  test('5. every estimate call uses a real subcommand, is one plain command, and is fail-soft', () => {
    assert.deepEqual(
      [...SUBCOMMANDS].sort(),
      ['backtest', 'finish', 'milestone', 'objective', 'start', 'task', 'trd', 'wave'],
      'estimate-cli.cjs USAGE no longer names the eight subcommands this test expects'
    );
    for (const rel of Object.values(FILES)) {
      const src = read(rel);
      contains(src, rel, /aof-tools\.cjs estimate/, 'at least one aof-tools.cjs estimate call');
      const problems = estimateCallProblems(src, SUBCOMMANDS);
      assert.deepEqual(problems, [], `${rel}: ${problems.join('; ')}`);
      contains(src, rel, /never block/, 'a fail-soft sentence (matching "never block") next to the estimate calls');
    }
  });

  test('6. sensitivity: the matcher flags a bad call and passes a good one', () => {
    assert.deepEqual(estimateCallProblems('node ~/.claude/aoforge/bin/aof-tools.cjs estimate objective 3 --line --raw', SUBCOMMANDS), []);
    const unknown = estimateCallProblems('node ~/.claude/aoforge/bin/aof-tools.cjs estimate objectives 3', SUBCOMMANDS);
    assert.equal(unknown.length, 1);
    assert.match(unknown[0], /unknown estimate subcommand "objectives"/);
    const piped = estimateCallProblems('node ~/.claude/aoforge/bin/aof-tools.cjs estimate objective 3 --line --raw | head', SUBCOMMANDS);
    assert.equal(piped.length, 1);
    assert.match(piped[0], /not one plain command/);
  });
});
