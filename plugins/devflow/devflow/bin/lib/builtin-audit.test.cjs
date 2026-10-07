'use strict';

// Test list (TRD 62-01, objective 62-built-in-sweep, BLTN-01..03).
// Written before builtin-audit.cjs. Hand-written strings only (every literal is copied by hand
// from a real DevFlow file or written for the case); tests 16 and 19 build temp trees.
//
// Prompt scanner
//  1.  `Proceed? (y/n)` -> one prose-choice finding { line: 1, kind, text }; allowed/badMarkers empty.
//  2.  Each positive literal yields exactly one prose-choice finding (one per line, not per trigger).
//  3.  Negatives yield no finding (field lines, negated offers, headings, table rows).
//  4.  Window: a non-negated AskUserQuestion within 12 lines above or 6 below satisfies a prompt.
//  5.  A negated mention does not satisfy.
//  6.  A finding inside a fenced block counts the same as prose.
//  7.  Markers: allow on the line above or at the end of the line; stale and short markers are bad.
//  8.  ask-without-options.
//  9.  header-too-long.
// 10.  too-many-options.
// 11.  A line carrying two problems reports both kinds, sorted by line then kind.
//
// Declarations, progress, plan mode, scan set (added with Task 3)
// 12.  splitFrontmatter.   13. parseToolList.   14. builtinsUsed.   15. workflowRefs.
// 16.  skillCoverage (temp tree).   17. progressCounts.   18. planModeSpans.
// 19.  scanSet (temp tree).   20. groupOf and GROUPS.
// 14d. (63-04) TodoWrite( counts as a built-in use, the session todo store of /devflow:todo.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const audit = require('./builtin-audit.cjs');
const {
  scanPrompts,
  splitFrontmatter,
  parseToolList,
  builtinsUsed,
  workflowRefs,
  skillCoverage,
  progressCounts,
  planModeSpans,
  scanSet,
  groupOf,
  GROUPS,
  GROUP_PATHS,
} = audit;
const { askCall, askProse, skillMd, workflowMd, makeTree } = require('./__fixtures__/builtin-audit-fixtures.cjs');

const kinds = (text) => scanPrompts(text).findings.map((f) => f.kind);
const filler = (n, at) => {
  // n lines of neutral text; `at` maps a 1-based line number to replacement text.
  const out = [];
  for (let i = 1; i <= n; i++) out.push(at[i] !== undefined ? at[i] : 'Step detail.');
  return out.join('\n');
};

const MARKER = '<!-- builtin-audit: allow free-text: the answer is an open-ended description -->';
const MARKER_REASON = 'free-text: the answer is an open-ended description';
const TYPE_PASS = '→ Type "pass" or describe what\'s wrong';

describe('scanPrompts: prose-choice', () => {
  test('1. Proceed? (y/n) is one finding with line, kind and trimmed text', () => {
    const r = scanPrompts('Proceed? (y/n)');
    assert.deepEqual(r.findings, [{ line: 1, kind: 'prose-choice', text: 'Proceed? (y/n)' }]);
    assert.deepEqual(r.allowed, []);
    assert.deepEqual(r.badMarkers, []);
  });

  describe('2. positive literals', () => {
    const positives = [
      "Does this capture what you're building? (yes / adjust)",
      'Otherwise show the draft and ask: "Write this as .planning/STACK.md? (yes / edit / skip)".',
      '(yes / wait / adjust scope)',
      'Ask: "Push tag to remote? (y/n)"',
      'Reply with a number to resume, or provide an objective number to start new.',
      'Pausing before commit. Reply "safe to proceed" if the flagged content is not actually sensitive, or edit the files first.',
      TYPE_PASS,
      'Offer: 1) Force proceed, 2) Abort',
      '**If exists:** Offer: 1) Update research, 2) View existing, 3) Skip. Wait for response.',
      '- Offer options:',
      'Options:',
      'MUST present 3 options:',
      'Ask user if they want to run repairs:',
      'Ask the user which decision they want to resolve and which option to pick.',
      'Wait for user decision.',
      'Wait for user confirmation before creating worktrees.',
      'Check if session exists for that objective. If yes, offer to resume or restart.',
      '- User picks number to resume OR describes new issue',
      // plan-objective.md step 10 bullet, copied whole.
      '- **`## PLANNING INCONCLUSIVE`:** Show attempts, offer: Add context / Retry / Manual',
    ];
    for (const literal of positives) {
      test(literal.slice(0, 70), () => {
        const r = scanPrompts(literal);
        assert.equal(r.findings.length, 1, JSON.stringify(r.findings));
        assert.equal(r.findings[0].kind, 'prose-choice');
        assert.equal(r.findings[0].line, 1);
      });
    }
  });

  describe('3. negatives', () => {
    const negatives = [
      '- options:',
      '  - "Nothing happens" — Expected action produces no result',
      '    question: "Verify work satisfies requirements after each objective? (adds tokens/time)",',
      '      { label: "Approve", description: "Commit and continue" },',
      'Do NOT offer to plan the next sequential objective — this worktree only owns its assigned objectives.',
      'Subcommand options:',
      '`planning mode` prints `local` or `store`.',
      '| Option | Meaning |',
    ];
    for (const literal of negatives) {
      test(literal.trim().slice(0, 70), () => {
        assert.deepEqual(scanPrompts(literal).findings, []);
      });
    }
  });

  describe('4. window', () => {
    test('prompt 7 lines below the mention is satisfied, 13 lines below is not', () => {
      assert.equal(scanPrompts(filler(8, { 1: 'Use AskUserQuestion:', 8: 'Wait for user response.' })).findings.length, 0);
      assert.equal(scanPrompts(filler(14, { 1: 'Use AskUserQuestion:', 14: 'Wait for user response.' })).findings.length, 1);
    });
    test('mention 5 lines below the prompt is satisfied, 7 lines below is not', () => {
      assert.equal(scanPrompts(filler(6, { 1: 'Wait for user response.', 6: 'Use AskUserQuestion:' })).findings.length, 0);
      assert.equal(scanPrompts(filler(8, { 1: 'Wait for user response.', 8: 'Use AskUserQuestion:' })).findings.length, 1);
    });
  });

  describe('5. negated mentions', () => {
    test('"no AskUserQuestion" on the prompt line does not satisfy it', () => {
      assert.equal(scanPrompts('Wait for user response (plain text, no AskUserQuestion).').findings.length, 1);
    });
    test('"Never call AskUserQuestion here." two lines above a prompt does not satisfy it', () => {
      const r = scanPrompts('Never call AskUserQuestion here.\nStep detail.\nProceed? (y/n)');
      assert.deepEqual(
        r.findings.map((f) => [f.line, f.kind]),
        [[3, 'prose-choice']],
      );
    });
  });

  test('6. a finding inside a fenced block counts the same as prose', () => {
    const r = scanPrompts('```\nReply with a number to view details, or:\n```');
    assert.deepEqual(r.findings, [
      { line: 2, kind: 'prose-choice', text: 'Reply with a number to view details, or:' },
    ]);
  });
});

describe('scanPrompts: markers', () => {
  test('7a. a marker on the line above suppresses the finding and is recorded as allowed', () => {
    const r = scanPrompts(`${MARKER}\n${TYPE_PASS}`);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.allowed, [{ line: 2, reason: MARKER_REASON }]);
    assert.deepEqual(r.badMarkers, []);
  });

  test('7b. a marker at the end of the flagged line suppresses it too', () => {
    const r = scanPrompts(`${TYPE_PASS} ${MARKER}`);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.allowed, [{ line: 1, reason: MARKER_REASON }]);
    assert.deepEqual(r.badMarkers, []);
  });

  test('7c. a marker above a clean line is a stale bad marker', () => {
    const r = scanPrompts(`${MARKER}\nA clean line.`);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.allowed, []);
    assert.deepEqual(r.badMarkers, [{ line: 1, why: 'stale' }]);
  });

  test('7d. a marker with the reason "ok" is a short bad marker and the finding stays', () => {
    const r = scanPrompts(`<!-- builtin-audit: allow ok -->\n${TYPE_PASS}`);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].kind, 'prose-choice');
    assert.deepEqual(r.allowed, []);
    assert.deepEqual(r.badMarkers, [{ line: 1, why: 'short' }]);
  });

  test('7e. the marker text is masked: a reason quoting "Proceed? (y/n)" is never itself a finding', () => {
    const r = scanPrompts('<!-- builtin-audit: allow quoted "Proceed? (y/n)" shown to the reader -->\nA clean line.');
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.badMarkers, [{ line: 1, why: 'stale' }]);
  });
});

describe('scanPrompts: AskUserQuestion schema', () => {
  test('8a. a single-line call with no options is ask-without-options', () => {
    const r = scanPrompts('AskUserQuestion(header: "Micro Task", question: "One-line description of the change?")');
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [[1, 'ask-without-options']],
    );
  });

  test('8b. a multi-line call with no options reports the opening line', () => {
    const text = [
      'AskUserQuestion(',
      '  header: "Quick Task",',
      '  question: "What do you want to do?",',
      '  followUp: null',
      ')',
    ].join('\n');
    assert.deepEqual(
      scanPrompts(text).findings.map((f) => [f.line, f.kind]),
      [[1, 'ask-without-options']],
    );
  });

  test('8c. a call with options is clean', () => {
    assert.deepEqual(scanPrompts(askCall({ options: ['A', 'B'] })).findings, []);
  });

  test('8d. a call built with omitOptions is ask-without-options', () => {
    assert.deepEqual(kinds(askCall({ omitOptions: true })), ['ask-without-options']);
  });

  test('8e. prose mentions are never checked for options', () => {
    assert.deepEqual(scanPrompts('Use AskUserQuestion:').findings, []);
  });

  test('9a. a header over 12 characters is header-too-long', () => {
    const r = scanPrompts('    header: "Default work type",');
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [[1, 'header-too-long']],
    );
  });

  test('9b. an inline header= over 12 characters is header-too-long (real complete-milestone.md call)', () => {
    const line =
      'AskUserQuestion(header="Archive Objectives", question="Archive objective directories to milestones/?", options: "Yes — move to milestones/v[X.Y]-objectives/" | "Skip — keep objectives in place")';
    assert.deepEqual(
      scanPrompts(line).findings.map((f) => [f.line, f.kind]),
      [[1, 'header-too-long']],
    );
  });

  test('9c. short headers are clean, including exactly 12 characters', () => {
    assert.deepEqual(scanPrompts('header: "Roadmap"').findings, []);
    assert.deepEqual(scanPrompts('header: "Twelve chars"').findings, []);
  });

  test('10a. five options in object form is too-many-options on the question line', () => {
    const r = scanPrompts(askCall({ options: ['A', 'B', 'C', 'D', 'E'] }));
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [[4, 'too-many-options']],
    );
  });

  test('10b. four options in object form is clean', () => {
    assert.deepEqual(scanPrompts(askCall({ options: ['A', 'B', 'C', 'D'] })).findings, []);
  });

  test('10c. five bullet options is too-many-options on the question line', () => {
    const r = scanPrompts(askProse({ options: ['A', 'B', 'C', 'D', 'E'] }));
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [[3, 'too-many-options']],
    );
  });

  test('10d. a second question restarts the count', () => {
    const text = `${askProse({ options: ['A', 'B', 'C'] })}\n${askProse({ options: ['D', 'E', 'F'] })}`;
    assert.deepEqual(scanPrompts(text).findings, []);
  });

  test('11. a line carrying two problems reports both kinds, sorted by line then kind', () => {
    const call = 'AskUserQuestion(header: "Archive Objectives", question: "Archive now?")';
    const text = filler(10, { 1: 'Wait for user decision.', 10: call });
    const r = scanPrompts(text);
    assert.deepEqual(
      r.findings.map((f) => [f.line, f.kind]),
      [
        [1, 'prose-choice'],
        [10, 'ask-without-options'],
        [10, 'header-too-long'],
      ],
    );
  });
});

describe('frontmatter and tool lists', () => {
  test('12a. splitFrontmatter returns the frontmatter, the body and the 1-based first body line', () => {
    const text = '---\nname: a\nallowed-tools: Read\n---\nline one\nline two';
    assert.deepEqual(splitFrontmatter(text), {
      frontmatter: 'name: a\nallowed-tools: Read',
      body: 'line one\nline two',
      bodyStartLine: 5,
    });
  });

  test('12b. no frontmatter gives an empty frontmatter and bodyStartLine 1', () => {
    assert.deepEqual(splitFrontmatter('just text\nmore'), {
      frontmatter: '',
      body: 'just text\nmore',
      bodyStartLine: 1,
    });
  });

  test('13a. parseToolList reads a YAML list', () => {
    const fm = 'name: a\nallowed-tools:\n  - Read\n  - Bash\n  - AskUserQuestion\ndescription: x';
    assert.deepEqual(parseToolList(fm, 'allowed-tools'), ['Read', 'Bash', 'AskUserQuestion']);
  });

  test('13b. parseToolList reads an inline comma list', () => {
    assert.deepEqual(parseToolList('allowed-tools: Read, Write, TaskCreate', 'allowed-tools'), [
      'Read',
      'Write',
      'TaskCreate',
    ]);
  });

  test('13c. parseToolList reads a space-separated list', () => {
    assert.deepEqual(parseToolList('allowed-tools: Read Bash', 'allowed-tools'), ['Read', 'Bash']);
  });

  test('13d. parseToolList returns [] when the key is absent', () => {
    assert.deepEqual(parseToolList('name: a\ndescription: x', 'allowed-tools'), []);
  });

  test('13e. disallowed-tools is its own key and never read as allowed-tools', () => {
    const fm = 'disallowed-tools: AskUserQuestion\nallowed-tools:\n  - Read';
    assert.deepEqual(parseToolList(fm, 'disallowed-tools'), ['AskUserQuestion']);
    assert.deepEqual(parseToolList(fm, 'allowed-tools'), ['Read']);
  });

  test('13f. a fixture skill in either shape round-trips through splitFrontmatter and parseToolList', () => {
    const inline = skillMd({ name: 'a', allowed: ['Read', 'Write', 'TaskCreate'], inline: true });
    const list = skillMd({ name: 'a', allowed: ['Read', 'Bash'] });
    assert.deepEqual(parseToolList(splitFrontmatter(inline).frontmatter, 'allowed-tools'), [
      'Read',
      'Write',
      'TaskCreate',
    ]);
    assert.deepEqual(parseToolList(splitFrontmatter(list).frontmatter, 'allowed-tools'), ['Read', 'Bash']);
  });
});

describe('builtinsUsed and workflowRefs', () => {
  test('14a. call form is required for every built-in but AskUserQuestion', () => {
    assert.deepEqual(builtinsUsed('TaskCreate(subject="x")'), ['TaskCreate']);
    assert.deepEqual(builtinsUsed('create a progress task with TaskCreate'), []);
  });

  test('14b. AskUserQuestion counts in directive form, and a negated mention does not', () => {
    assert.deepEqual(builtinsUsed('Use AskUserQuestion:'), ['AskUserQuestion']);
    assert.deepEqual(builtinsUsed('Never call AskUserQuestion.'), []);
  });

  test('14c. EnterPlanMode() and ExitPlanMode() are both reported, a backticked name is not', () => {
    assert.deepEqual(builtinsUsed('EnterPlanMode()\nExitPlanMode()'), ['EnterPlanMode', 'ExitPlanMode']);
    assert.deepEqual(builtinsUsed('built-in plan mode (`EnterPlanMode`)'), []);
  });

  test('14d. TodoWrite( is a built-in use (63-04); a negated call and a bare mention are not', () => {
    assert.deepEqual(builtinsUsed('TodoWrite(todos=[...])'), ['TodoWrite']);
    assert.deepEqual(builtinsUsed('Never call TodoWrite(todos=[])'), []);
    assert.deepEqual(builtinsUsed('the session list (TodoWrite) holds the todo'), []);
    assert.deepEqual(builtinsUsed('TaskList()\nTodoWrite(todos=[])'), ['TaskList', 'TodoWrite']);
  });

  test('15. workflowRefs finds each referenced workflow once, in order', () => {
    const text = [
      '@~/.claude/devflow/workflows/micro.md',
      'Read and follow ~/.claude/devflow/workflows/transition.md',
      'Then micro again: ~/.claude/devflow/workflows/micro.md',
    ].join('\n');
    assert.deepEqual(workflowRefs(text), ['micro', 'transition']);
  });
});

describe('skillCoverage', () => {
  const REF = (n) => `~/.claude/devflow/workflows/${n}.md`;
  const build = () =>
    makeTree({
      skills: {
        a: skillMd({ name: 'a', allowed: ['Read'], body: `Follow @${REF('w1')}` }),
        b: skillMd({ name: 'b', allowed: ['Read'], disallowed: 'AskUserQuestion', body: `Follow @${REF('w1')}` }),
        c: skillMd({ name: 'c', allowed: ['Read'], body: 'ExitPlanMode()' }),
        d: skillMd({ name: 'd', allowed: ['Read', 'ExitPlanMode'], body: 'ExitPlanMode()' }),
      },
      workflows: {
        w1: workflowMd({ body: `TaskCreate(subject="x")\nThen ${REF('w2')}` }),
        // w2 closes a cycle back to w1 and points at w9, which has no file.
        w2: workflowMd({ body: `Use AskUserQuestion:\nSee ${REF('w1')} and ${REF('w9')}` }),
      },
    });

  test('16a. follows workflow references transitively, survives a cycle and a missing file', () => {
    const t = build();
    try {
      const r = skillCoverage({ skillsDir: t.skillsDir, workflowsDir: t.workflowsDir, name: 'a' });
      assert.deepEqual(r.declared, ['Read']);
      assert.deepEqual(r.missing, ['AskUserQuestion', 'TaskCreate']);
      assert.deepEqual(r.used, ['AskUserQuestion', 'TaskCreate']);
      assert.deepEqual(r.via.TaskCreate, [path.join(t.workflowsDir, 'w1.md')]);
      assert.deepEqual(r.via.AskUserQuestion, [path.join(t.workflowsDir, 'w2.md')]);
      assert.deepEqual(r.forbidden, []);
    } finally {
      t.cleanup();
    }
  });

  test('16b. disallowed-tools removes a tool from missing', () => {
    const t = build();
    try {
      const r = skillCoverage({ skillsDir: t.skillsDir, workflowsDir: t.workflowsDir, name: 'b' });
      assert.deepEqual(r.disallowed, ['AskUserQuestion']);
      assert.deepEqual(r.missing, ['TaskCreate']);
    } finally {
      t.cleanup();
    }
  });

  test('16c. ExitPlanMode used but not declared is not missing', () => {
    const t = build();
    try {
      const r = skillCoverage({ skillsDir: t.skillsDir, workflowsDir: t.workflowsDir, name: 'c' });
      assert.deepEqual(r.used, ['ExitPlanMode']);
      assert.deepEqual(r.missing, []);
      assert.deepEqual(r.forbidden, []);
    } finally {
      t.cleanup();
    }
  });

  test('16d. ExitPlanMode declared in allowed-tools is forbidden', () => {
    const t = build();
    try {
      const r = skillCoverage({ skillsDir: t.skillsDir, workflowsDir: t.workflowsDir, name: 'd' });
      assert.deepEqual(r.forbidden, ['ExitPlanMode']);
      assert.deepEqual(r.missing, []);
    } finally {
      t.cleanup();
    }
  });
});

describe('progressCounts', () => {
  test('17a. counts TaskCreate calls and completed / in_progress TaskUpdate calls across texts', () => {
    const t1 = 'TaskCreate(subject="a")\nTaskCreate(subject="b")\nTaskUpdate(taskId=a, status="completed")';
    const t2 = 'TaskUpdate(\n  taskId=b,\n  status="in_progress")';
    assert.deepEqual(progressCounts([t1, t2]), { creates: 2, completes: 1, inProgress: 1 });
  });

  test('17b. the colon form counts as complete', () => {
    assert.deepEqual(progressCounts(['TaskUpdate({ taskId: c, status: "completed" })']), {
      creates: 0,
      completes: 1,
      inProgress: 0,
    });
  });

  test('17c. a TaskUpdate with another status counts as neither', () => {
    assert.deepEqual(progressCounts(['TaskUpdate(taskId=a, status="deleted")']), {
      creates: 0,
      completes: 0,
      inProgress: 0,
    });
  });
});

describe('planModeSpans', () => {
  const SKIP = '**Skip if:** `--auto` flag or config `workflow.auto_advance` is true.';

  test('18a. a span with a skip rule, a draft and an exit reports all four fields', () => {
    const text = [
      'Intro.',
      SKIP,
      'Step detail.',
      'Step detail.',
      'EnterPlanMode()',
      'Put the REQUIREMENTS draft in the plan.',
      'ExitPlanMode()',
    ].join('\n');
    assert.deepEqual(planModeSpans(text), [{ enterLine: 5, exitLine: 7, mentionsDraft: true, skipLine: 2 }]);
  });

  test('18b. the skip line must be within the 20 lines above', () => {
    const at20 = filler(21, { 1: SKIP, 21: 'EnterPlanMode()' });
    const at21 = filler(22, { 1: SKIP, 22: 'EnterPlanMode()' });
    assert.equal(planModeSpans(at20)[0].skipLine, 1);
    assert.equal(planModeSpans(at21)[0].skipLine, null);
  });

  test('18c. no draft between enter and exit means mentionsDraft false', () => {
    const r = planModeSpans('EnterPlanMode()\nShow the plan.\nExitPlanMode()');
    assert.deepEqual(r, [{ enterLine: 1, exitLine: 3, mentionsDraft: false, skipLine: null }]);
  });

  test('18d. no ExitPlanMode after means exitLine null', () => {
    const r = planModeSpans('EnterPlanMode()\nPut the draft in the plan.');
    assert.deepEqual(r, [{ enterLine: 1, exitLine: null, mentionsDraft: true, skipLine: null }]);
  });

  test('18e. two spans close independently, and text with no plan mode has none', () => {
    const text = 'EnterPlanMode()\ndraft one\nExitPlanMode()\nStep detail.\nEnterPlanMode()\nExitPlanMode()';
    assert.deepEqual(
      planModeSpans(text).map((s) => [s.enterLine, s.exitLine, s.mentionsDraft]),
      [
        [1, 3, true],
        [5, 6, false],
      ],
    );
    assert.deepEqual(planModeSpans('Nothing here.'), []);
  });
});

describe('scanSet and groups', () => {
  test('19. scanSet lists skills and active workflows with POSIX rel paths, sorted, with text', () => {
    const t = makeTree({
      repoLayout: true,
      skills: {
        a: skillMd({ name: 'a', allowed: ['Read'], body: 'Body A' }),
        b: skillMd({ name: 'b', allowed: ['Read'], body: 'Body B' }),
      },
      workflows: {
        w1: workflowMd({ body: 'Workflow one' }),
        old: workflowMd({ status: 'legacy', body: 'Retired' }),
      },
    });
    try {
      const set = scanSet(t.root);
      assert.deepEqual(
        set.map((f) => f.rel),
        [
          'plugins/devflow/devflow/workflows/w1.md',
          'plugins/devflow/skills/a/SKILL.md',
          'plugins/devflow/skills/b/SKILL.md',
        ],
      );
      assert.ok(set[0].text.includes('Workflow one'));
      assert.ok(set[1].text.includes('Body A'));
    } finally {
      t.cleanup();
    }
  });

  test('20a. groupOf maps skills and workflows to their group, and a legacy workflow to null', () => {
    assert.equal(groupOf('plugins/devflow/skills/micro/SKILL.md'), 'micro-quick-debug');
    assert.equal(groupOf('plugins/devflow/devflow/workflows/complete-milestone.md'), 'milestone');
    assert.equal(groupOf('plugins/devflow/devflow/workflows/insert-objective.md'), null);
  });

  test('20b. GROUPS has the eight group names in order', () => {
    assert.deepEqual(Object.keys(GROUPS), [
      'micro-quick-debug',
      'verify-work',
      'plan-build',
      'new-project',
      'milestone',
      'execute-and-map',
      'todo-status-objective',
      'remaining',
    ]);
  });

  test('20c. no path appears in two groups', () => {
    const all = Object.values(GROUP_PATHS).flat();
    assert.equal(new Set(all).size, all.length);
    for (const p of all) assert.equal(groupOf(p), Object.keys(GROUP_PATHS).find((g) => GROUP_PATHS[g].includes(p)));
  });
});

// ─── inventory-derived cases (TRD 62-03) ────────────────────────────────────────────
// docs/built-in-sweep.md rows the 62-01 literals did not already cover. Each line is copied by
// hand from the real file named in its row; the scanner must flag it (the inventory's `scan`
// Detect value means exactly this) and the reconcile found no row it missed, so these pin the
// agreement rather than drive a change.
describe('inventory-derived real lines (62-03)', () => {
  const proseLines = [
    // BS-004 quick.md
    'Display gap summary, offer: 1) Re-run executor to fix gaps, 2) Accept as-is.',
    // BS-015 build.md
    'Display research results and wait for confirmation before proceeding.',
    // BS-019 plan-objective.md
    'Display blocker, offer: 1) Provide context, 2) Skip research, 3) Abort',
    // BS-046 plan-milestone-gaps.md
    'and offers to plan each objective',
    // BS-064 execute-trd.md
    'Present plan identification, wait for confirmation.',
    // BS-071 transition.md
    'Ask: "Objective [X] complete — all [Y] plans finished. Ready to mark done and move to Objective [X+1]?"',
    // BS-077 check-todos.md
    'Wait for user to reply with a number.',
    // BS-085 pause-work.md
    "If no active objective detected, ask user which objective they're pausing work on.",
    // BS-090 resume-project.md
    'Offer to reconstruct STATE.md',
    // BS-094 workstreams-setup.md
    'Offer to view status instead.',
    // BS-109 research-objective.md
    'Display summary, offer: Plan/Dig deeper/Review/Done',
    // BS-114 settings.md
    '- [ ] User offered to save as global defaults',
  ];
  for (const literal of proseLines) {
    test(`prose-choice: ${literal.slice(0, 60)}`, () => {
      const r = scanPrompts(literal);
      assert.deepEqual(
        r.findings.map((f) => f.kind),
        ['prose-choice'],
        JSON.stringify(r.findings),
      );
    });
  }

  test('BS-001: a one-line AskUserQuestion call with no options is ask-without-options', () => {
    const line = 'AskUserQuestion(header: "Micro Task", question: "One-line description of the change?")';
    assert.deepEqual(
      scanPrompts(line).findings.map((f) => f.kind),
      ['ask-without-options'],
    );
  });

  test('BS-002: a bare AskUserQuestion( opener whose block has no options is ask-without-options with the opener as text', () => {
    const r = scanPrompts('AskUserQuestion(\n  header: "Quick",\n  question: "What do you want to do?"\n)');
    assert.deepEqual(r.findings, [{ line: 1, kind: 'ask-without-options', text: 'AskUserQuestion(' }]);
  });

  test('BS-002: the same opener with an options list is clean', () => {
    const text = 'AskUserQuestion(\n  header: "Plan check",\n  question: "Proceed?",\n  options: [{ label: "Go" }, { label: "Stop" }]\n)';
    assert.deepEqual(scanPrompts(text).findings, []);
  });

  test('BS-025: a header over 12 characters is header-too-long', () => {
    assert.deepEqual(
      scanPrompts('header: "Default work type",').findings.map((f) => f.kind),
      ['header-too-long'],
    );
  });

  test('a bare Options: list head is a finding alone and satisfied by an AskUserQuestion mention within the window', () => {
    // execute-objective.md, security-audit.md, transition.md and workstreams-merge.md carry one;
    // the inventory covers each through a neighbouring row (see the repo test's proximity rule).
    assert.deepEqual(
      scanPrompts('Options:\n- retry').findings.map((f) => f.kind),
      ['prose-choice'],
    );
    assert.deepEqual(scanPrompts('Options:\n- retry\nUse AskUserQuestion to ask.').findings, []);
  });
});
