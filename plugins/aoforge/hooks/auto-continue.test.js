/**
 * Tests for the auto-continue Stop hook (TRD 44-05, AUT-06).
 *
 *   unit — announcedAction over the hand-written corpus (one test per label),
 *          finalParagraph, isQuestionToUser, isHandoffToUser, hasRunningBackground
 *   e2e  — the hook as a subprocess with real Stop payloads (see bottom)
 *
 * The corpus lives in __fixtures__/stop-fixtures.js and is hand-written.
 * False positives are the main risk: every NOT_ANNOUNCE entry must stay null.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  ANNOUNCE,
  NOT_ANNOUNCE,
  stopPayload,
  writeSkillMarker,
  makeWorktreeWithMainMarker,
} = require('./__fixtures__/stop-fixtures.js');
const {
  finalParagraph,
  isQuestionToUser,
  isHandoffToUser,
  announcedAction,
  hasRunningBackground,
  decide,
} = require('./auto-continue.js');

const HOOK_PATH = path.join(__dirname, 'auto-continue.js');

// ---------------------------------------------------------------------------
// Test list item 6 — every ANNOUNCE entry classifies as an announcement
// ---------------------------------------------------------------------------

describe('announcedAction — ANNOUNCE corpus (non-null)', () => {
  for (const { label, text } of ANNOUNCE) {
    test(label, () => {
      const action = announcedAction(text);
      assert.equal(typeof action, 'string', `expected an announcement for: ${JSON.stringify(text)}`);
      assert.ok(action.length > 0);
      assert.ok(action.length <= 120, `quoted action must be <= 120 chars, got ${action.length}`);
    });
  }
});

// ---------------------------------------------------------------------------
// Test list item 7 — every NOT_ANNOUNCE entry classifies as null
// ---------------------------------------------------------------------------

describe('announcedAction — NOT_ANNOUNCE corpus (null)', () => {
  for (const { label, text } of NOT_ANNOUNCE) {
    test(label, () => {
      assert.equal(announcedAction(text), null, `false positive on: ${JSON.stringify(text)}`);
    });
  }
});

describe('announcedAction — returned sentence', () => {
  test('quotes the announced sentence from the final paragraph', () => {
    assert.match(announcedAction('Tests are green.\n\nWriting the predicate.'), /^Writing the predicate/);
  });

  test('takes the announcement sentence, not the preceding report sentence', () => {
    assert.match(announcedAction('Wave 2 merged. Ready for wave 3 on your word.'), /^Ready for wave 3 on your word/);
  });

  test('a sentence-start match after a full stop inside the final paragraph', () => {
    assert.match(announcedAction('RED is committed. Now writing the implementation.'), /^Now writing the implementation/);
  });

  test('caps the quoted action at 120 characters', () => {
    const long = 'Writing ' + 'the very long predicate name '.repeat(10) + 'now.';
    const action = announcedAction(long);
    assert.equal(typeof action, 'string');
    assert.ok(action.length <= 120, `got ${action.length}`);
    assert.match(action, /^Writing the very long/);
  });

  test('"now" inside a word never matches ("known", "snow")', () => {
    assert.equal(announcedAction('The cause is known. Snow is unrelated.'), null);
  });

  test('lower-case sentence-start words are not announcements', () => {
    assert.equal(announcedAction('running npm test.'), null);
  });

  test('non-string / empty input → null', () => {
    assert.equal(announcedAction(undefined), null);
    assert.equal(announcedAction(null), null);
    assert.equal(announcedAction(42), null);
    assert.equal(announcedAction(''), null);
    assert.equal(announcedAction('   \n\n  '), null);
  });
});

// ---------------------------------------------------------------------------
// finalParagraph / isQuestionToUser / isHandoffToUser
// ---------------------------------------------------------------------------

describe('finalParagraph', () => {
  test('text after the last blank line', () => {
    assert.equal(finalParagraph('one\n\ntwo\nthree'), 'two\nthree');
  });

  test('trailing whitespace is ignored', () => {
    assert.equal(finalParagraph('one\n\ntwo  \n\n  \n'), 'two');
  });

  test('a trailing fenced block is stripped', () => {
    assert.equal(finalParagraph('intro\n\nNow running:\n\n```bash\nnpm test\n\nnpm run build\n```\n'), 'Now running:');
  });

  test('a single paragraph is returned whole', () => {
    assert.equal(finalParagraph('Only one.'), 'Only one.');
  });
});

describe('isQuestionToUser', () => {
  test('last line ends with ?', () => {
    assert.equal(isQuestionToUser('Tests pass.\nShip it?'), true);
  });

  test('ask phrases without a question mark', () => {
    assert.equal(isQuestionToUser('Let me know when the other session is done.'), true);
    assert.equal(isQuestionToUser('I can push now if you want me to.'), true);
  });

  test('a plain announcement is not a question', () => {
    assert.equal(isQuestionToUser('Writing the SUMMARY.'), false);
  });

  test('"on your word" is NOT treated as a question (it auto-continues)', () => {
    assert.equal(isQuestionToUser('Ready for wave 3 on your word.'), false);
  });

  test('a query string is not a question mark', () => {
    assert.equal(isQuestionToUser('Running curl http://localhost:8091/health?full=1 now.'), false);
  });
});

describe('isHandoffToUser', () => {
  test('Next Up heading + /aoforge: command', () => {
    assert.equal(isHandoffToUser('## ▶ Next Up\n`/aoforge:plan-objective 45`'), true);
  });

  test('Next: + /aoforge: command', () => {
    assert.equal(isHandoffToUser('Next: run /aoforge:verify-work 44'), true);
  });

  test('Next without a /aoforge: command is not a hand-off', () => {
    assert.equal(isHandoffToUser('Next, I\'ll wire the hook into hooks.json.'), false);
  });
});

// ---------------------------------------------------------------------------
// Test list item 8 — hasRunningBackground
// ---------------------------------------------------------------------------

describe('hasRunningBackground', () => {
  test('undefined / null / [] → false', () => {
    assert.equal(hasRunningBackground(undefined), false);
    assert.equal(hasRunningBackground(null), false);
    assert.equal(hasRunningBackground([]), false);
  });

  test('a running task → true', () => {
    assert.equal(hasRunningBackground([{ status: 'running' }]), true);
  });

  test('only completed / failed tasks → false', () => {
    assert.equal(hasRunningBackground([{ status: 'completed' }, { status: 'failed' }]), false);
  });

  test('a running task among finished ones → true', () => {
    assert.equal(
      hasRunningBackground([
        { id: 't1', type: 'agent', status: 'completed', agent_type: 'aoforge:executor' },
        { id: 't2', type: 'agent', status: 'running', agent_type: 'aoforge:executor' },
      ]),
      true
    );
  });

  test('a not-yet-finished status (pending) counts as running — fail toward no block', () => {
    assert.equal(hasRunningBackground([{ status: 'pending' }]), true);
  });

  test('a non-array value → false', () => {
    assert.equal(hasRunningBackground('running'), false);
  });
});

// ---------------------------------------------------------------------------
// decide() — the condition chain, with injected deps
// ---------------------------------------------------------------------------

const ANNOUNCED = 'Tests are green.\n\nWriting the predicate.';

function tmpRoot() {
  // realpath: macOS tmpdir is a /var → /private/var symlink
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-autocontinue-')));
}

/** An AOForge project root; marker: 'live' | 'expired' | 'none'. */
function makeProject({ marker = 'live' } = {}) {
  const root = tmpRoot();
  const planning = path.join(root, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  if (marker === 'live') writeSkillMarker(planning);
  if (marker === 'expired') {
    writeSkillMarker(planning, { expiresAt: new Date(Date.now() - 60 * 1000).toISOString() });
  }
  return root;
}

describe('decide', () => {
  const live = () => true;

  test('all conditions hold → {block:true, reason}', () => {
    const root = makeProject();
    const out = decide(stopPayload({ cwd: root, last_assistant_message: ANNOUNCED }), {
      env: {},
      cwd: root,
      markerLive: live,
    });
    assert.equal(out.block, true);
    assert.equal(
      out.reason,
      'AOForge auto-continue: you announced "Writing the predicate." and then ended your turn. ' +
        'Take that step now, in this turn. If you actually need the user\'s input, ask one explicit ' +
        'question instead of announcing. Never use port 8080.'
    );
  });

  test('env skip → null', () => {
    const root = makeProject();
    const p = stopPayload({ cwd: root, last_assistant_message: ANNOUNCED });
    assert.equal(decide(p, { env: { AOFORGE_SKIP_AUTOCONTINUE: '1' }, cwd: root, markerLive: live }), null);
  });

  test('stop_hook_active → null', () => {
    const root = makeProject();
    const p = stopPayload({ cwd: root, stop_hook_active: true, last_assistant_message: ANNOUNCED });
    assert.equal(decide(p, { env: {}, cwd: root, markerLive: live }), null);
  });

  test('marker not live → null', () => {
    const root = makeProject();
    const p = stopPayload({ cwd: root, last_assistant_message: ANNOUNCED });
    assert.equal(decide(p, { env: {}, cwd: root, markerLive: () => false }), null);
  });

  test('a non-Stop event (e.g. SubagentStop) → null — this hook is for the main loop only', () => {
    const root = makeProject();
    const p = stopPayload({
      cwd: root,
      hook_event_name: 'SubagentStop',
      agent_type: 'aoforge:executor',
      last_assistant_message: ANNOUNCED,
    });
    assert.equal(decide(p, { env: {}, cwd: root, markerLive: live }), null);
  });

  test('last_assistant_message absent or not a string → null', () => {
    const root = makeProject();
    const p = stopPayload({ cwd: root });
    delete p.last_assistant_message;
    assert.equal(decide(p, { env: {}, cwd: root, markerLive: live }), null);
    assert.equal(decide(stopPayload({ cwd: root, last_assistant_message: 7 }), { env: {}, cwd: root, markerLive: live }), null);
  });

  test('gate-edits helpers fail to load (moved file) → null (fail open)', () => {
    const root = makeProject();
    const p = stopPayload({ cwd: root, last_assistant_message: ANNOUNCED });
    const loadHelpers = () => {
      throw new Error("Cannot find module './gate-edits.js'");
    };
    assert.equal(decide(p, { env: {}, cwd: root, loadHelpers }), null);
  });

  test('payload without cwd falls back to deps.cwd', () => {
    const root = makeProject();
    const p = stopPayload({ last_assistant_message: ANNOUNCED });
    delete p.cwd;
    const out = decide(p, { env: {}, cwd: root });
    assert.equal(out && out.block, true);
  });

  test('a long announcement is quoted at <= 120 chars in the reason', () => {
    const root = makeProject();
    const long = 'Writing ' + 'the very long predicate name '.repeat(10) + 'now.';
    const out = decide(stopPayload({ cwd: root, last_assistant_message: long }), { env: {}, cwd: root });
    const quoted = /announced "([^"]*)"/.exec(out.reason)[1];
    assert.ok(quoted.length <= 120, `got ${quoted.length}`);
  });
});

// ---------------------------------------------------------------------------
// Test list items 1-5 — the hook as a subprocess with real Stop payloads
// ---------------------------------------------------------------------------

/** Run the hook; AOFORGE_SKIP_AUTOCONTINUE is removed from the inherited env. */
function runHook(stdin, { cwd, env = {} } = {}) {
  const childEnv = { ...process.env };
  delete childEnv.AOFORGE_SKIP_AUTOCONTINUE;
  Object.assign(childEnv, env);
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    env: childEnv,
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    encoding: 'utf8',
    timeout: 15000,
  });
}

function assertBlock(r, fragment) {
  assert.equal(r.status, 0, `exit 0 expected, stderr: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason']);
  assert.equal(out.decision, 'block');
  if (fragment) assert.ok(out.reason.includes(fragment), `reason should quote ${fragment}: ${out.reason}`);
  assert.match(out.reason, /Take that step now/);
  return out;
}

function assertSilent(r) {
  assert.equal(r.status, 0, `exit 0 expected, stderr: ${r.stderr}`);
  assert.equal(r.stdout, '');
}

describe('auto-continue hook (subprocess e2e)', () => {
  test('1: live marker + announcement → block quoting the announced step', () => {
    const root = makeProject();
    const r = runHook(stopPayload({ cwd: root, last_assistant_message: ANNOUNCED }), { cwd: root });
    assertBlock(r, 'Writing the predicate');
  });

  test('2: stop_hook_active true → no output (once-guard)', () => {
    const root = makeProject();
    const r = runHook(
      stopPayload({ cwd: root, stop_hook_active: true, last_assistant_message: ANNOUNCED }),
      { cwd: root }
    );
    assertSilent(r);
  });

  test('3a: a running background task → no output', () => {
    const root = makeProject();
    const r = runHook(
      stopPayload({
        cwd: root,
        last_assistant_message: ANNOUNCED,
        background_tasks: [
          { id: 't1', type: 'agent', status: 'running', description: 'Execute 44-05', agent_type: 'aoforge:executor' },
        ],
      }),
      { cwd: root }
    );
    assertSilent(r);
  });

  test('3b: only completed / failed background tasks → block', () => {
    const root = makeProject();
    const r = runHook(
      stopPayload({
        cwd: root,
        last_assistant_message: ANNOUNCED,
        background_tasks: [
          { id: 't1', type: 'agent', status: 'completed', description: 'Execute 44-03', agent_type: 'aoforge:executor' },
          { id: 't2', type: 'agent', status: 'failed', description: 'Execute 44-06', agent_type: 'aoforge:executor' },
        ],
      }),
      { cwd: root }
    );
    assertBlock(r, 'Writing the predicate');
  });

  test('4a: no marker → no output', () => {
    const root = makeProject({ marker: 'none' });
    const r = runHook(stopPayload({ cwd: root, last_assistant_message: ANNOUNCED }), { cwd: root });
    assertSilent(r);
  });

  test('4b: expired marker → no output', () => {
    const root = makeProject({ marker: 'expired' });
    const r = runHook(stopPayload({ cwd: root, last_assistant_message: ANNOUNCED }), { cwd: root });
    assertSilent(r);
  });

  test('4c: marker only in the MAIN checkout, cwd a linked worktree → block', () => {
    const { wtRoot } = makeWorktreeWithMainMarker(tmpRoot());
    const r = runHook(stopPayload({ cwd: wtRoot, last_assistant_message: ANNOUNCED }), { cwd: wtRoot });
    assertBlock(r, 'Writing the predicate');
  });

  test('5a: AOFORGE_SKIP_AUTOCONTINUE=1 → no output', () => {
    const root = makeProject();
    const r = runHook(stopPayload({ cwd: root, last_assistant_message: ANNOUNCED }), {
      cwd: root,
      env: { AOFORGE_SKIP_AUTOCONTINUE: '1' },
    });
    assertSilent(r);
  });

  test('5b: no .planning/ → no output', () => {
    const root = tmpRoot();
    const r = runHook(stopPayload({ cwd: root, last_assistant_message: ANNOUNCED }), { cwd: root });
    assertSilent(r);
  });

  test('5c: invalid stdin JSON → no output, exit 0', () => {
    const root = makeProject();
    const r = runHook('{not json', { cwd: root });
    assertSilent(r);
  });

  test('5d: empty stdin → no output, exit 0', () => {
    const root = makeProject();
    const r = runHook('', { cwd: root });
    assertSilent(r);
  });

  test('false-positive guard: live marker + Next Up hand-off → no output', () => {
    const root = makeProject();
    const handoff = NOT_ANNOUNCE.find((e) => e.label.startsWith('real-h')).text;
    const r = runHook(stopPayload({ cwd: root, last_assistant_message: handoff }), { cwd: root });
    assertSilent(r);
  });

  test('false-positive guard: live marker + question to the user → no output', () => {
    const root = makeProject();
    const r = runHook(stopPayload({ cwd: root, last_assistant_message: 'Should I start wave 3?' }), { cwd: root });
    assertSilent(r);
  });

  test('"Ready for wave N on your word" with a live marker → block', () => {
    const root = makeProject();
    const r = runHook(
      stopPayload({ cwd: root, last_assistant_message: 'Wave 3 merged.\n\nReady for wave 4 on your word.' }),
      { cwd: root }
    );
    assertBlock(r, 'Ready for wave 4 on your word');
  });
});
