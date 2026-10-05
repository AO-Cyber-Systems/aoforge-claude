'use strict';

/**
 * session-audit.test.cjs — TRD 31-03
 *
 * The single most important test here is `prose about gates is not an event`.
 * The original audit's first pass keyword-matched raw transcript text and
 * counted 899 "hook-blocked" hits that were planning documents DISCUSSING the
 * gates. That inflated the headline number and would have pointed the whole
 * remediation programme at a phantom. Classification must only ever run on a
 * structured failed tool_result.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  classify, accumulate, summarize, newAccumulator, DEVFLOW_OWNED,
  bashWriteTargets, targetMatches, OVERRIDE_PHRASES,
} = require('./session-audit.cjs');

// Built at runtime so this source file does not itself contain the raw-commit
// phrase — the commit gate matches on it (see TRD 27-04, which fixed exactly
// this false positive but only ships once the plugin cache is re-synced).
const RAW_COMMIT_MSG = 'DevFlow project detected. Raw `' + 'git ' + 'commit` is blocked.';

const errResult = (text, extra = {}) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', is_error: true, content: text }] },
  ...extra,
});
const okResult = text => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', is_error: false, content: text }] },
});

// ─── Edit-gate fixture builders (quick 31) ─────────────────────────────────
// The denied path in every fixture is /repo/src/a.go and every row carries a
// timestamp. The gate text is the real message shape: it contains the override
// phrases "skip devflow" and "just edit", which MUST NOT route (E-7).
const P = '/repo/src/a.go';
const GATE_TEXT = 'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied. ' +
  'To proceed, invoke a DevFlow skill, or include "skip devflow" or "just edit" in your prompt.';

const editUse = (id, p, ts, tool = 'Write') => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: tool, input: { file_path: p, content: 'x' } }] },
});
const denial = (id, ts) => ({
  type: 'user', timestamp: ts,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: GATE_TEXT }] },
});
const bashUse = (id, command, ts) => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] },
});
const skillUse = (id, skill, ts) => ({
  type: 'assistant', timestamp: ts,
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Skill', input: skill === undefined ? {} : { skill } }] },
});
const userText = (text, ts, extra = {}) => ({
  type: 'user', timestamp: ts, message: { role: 'user', content: text }, ...extra,
});
const T = n => `2026-09-30T10:00:${String(n).padStart(2, '0')}Z`;

/** Feed rows into one accumulator and return the edit_gate_bypass block. */
function gate(rows, sid = 's1') {
  const acc = newAccumulator();
  for (const r of rows) accumulate(acc, r, sid);
  return summarize(acc).edit_gate_bypass;
}
const outcomes = g => ({ denials: g.denials, bypasses: g.bypasses, routed: g.routed, abandoned: g.abandoned });
/** The standard opener: a Write of P that the gate denies. */
const denied = (id = 'e1', n = 1) => [editUse(id, P, T(n)), denial(id, T(n + 1))];

describe('classify() — real gate messages', () => {
  const cases = [
    ['DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.', 'devflow-edit-gate'],
    [RAW_COMMIT_MSG, 'devflow-commit-gate'],
    ['This agent is isolated in the worktree /x, but this command is too complex', 'worktree-isolation'],
    ['Skill devflow:objective cannot be used with Skill tool due to disable-model-invocation', 'skill-not-invocable'],
    ['Error: No such tool available: Edit.', 'tool-not-available'],
    ['Grep is not enabled in this context', 'tool-not-available'],
    ["The user doesn't want to proceed with this tool use.", 'permission-denial'],
    ['File has not been read yet. Read it first', 'read-before-write'],
    ['Command timed out after 2m 0s', 'command-timeout'],
    ['File does not exist. Note: your current working directory is /x', 'file-not-found'],
    ['File content (5.1KB) exceeds maximum allowed size', 'output-too-large'],
    ['CHANGELOG.md lacks ## [2.5.0]', 'devflow-changelog-gate'],
  ];
  for (const [text, expected] of cases) {
    test(`"${text.slice(0, 44)}..." maps to ${expected}`, () => {
      assert.equal(classify(text), expected);
    });
  }

  test('an unrecognised failure is bucketed, not dropped', () => {
    assert.equal(classify('some novel failure'), 'other-tool-error');
  });
});

describe('accumulate() — only structured errors count', () => {
  test('prose ABOUT gates is NOT an event (the 899-false-hit bug)', () => {
    const acc = newAccumulator();
    // a planning doc read back through a SUCCESSFUL Read — the exact shape that
    // fooled the original keyword pass
    accumulate(acc, okResult(
      '# Notes\n\ngate-edits.js denies Edit in ambient mode; DevFlow ambient mode active ' +
      'is the message. ' + RAW_COMMIT_MSG
    ), 's1');
    assert.equal(acc.events.length, 0, 'discussion of a gate must never count as a gate event');
  });

  test('assistant prose mentioning a gate is not an event either', () => {
    const acc = newAccumulator();
    accumulate(acc, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'The DevFlow ambient mode active message means...' }] },
    }, 's1');
    assert.equal(acc.events.length, 0);
  });

  test('a failed tool_result IS an event', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.'), 's1');
    assert.equal(acc.events.length, 1);
    assert.equal(acc.events[0].category, 'devflow-edit-gate');
  });

  test('sidechain origin is recorded', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('is isolated in the worktree /x', { isSidechain: true }), 's1');
    assert.equal(acc.events[0].sidechain, true);
  });

  test('malformed rows never throw', () => {
    const acc = newAccumulator();
    for (const bad of [null, undefined, 'str', 7, {}, { message: null }, { message: { content: 'x' } }]) {
      assert.doesNotThrow(() => accumulate(acc, bad, 's'));
    }
    assert.equal(acc.events.length, 0);
  });
});

describe('summarize() — the programme verdict', () => {
  test('counts DevFlow-owned categories separately from harness ones', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.'), 's1');
    accumulate(acc, errResult('This agent is isolated in the worktree /x'), 's1');
    const s = summarize(acc);
    // the worktree guard is the harness's, not DevFlow's — it must not be claimed
    assert.equal(s.devflow_owned_events, 1);
    assert.equal(s.total_events, 2);
    assert.match(s.verdict, /1 DevFlow-owned/);
  });

  test('a clean window reports zero DevFlow-owned blocks', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('This agent is isolated in the worktree /x'), 's1');
    const s = summarize(acc);
    assert.equal(s.devflow_owned_events, 0);
    assert.match(s.verdict, /no DevFlow-owned blocks/);
  });

  test('sessions_with_blocks_pct reflects only sessions that actually blocked', () => {
    const acc = newAccumulator();
    accumulate(acc, okResult('nothing wrong'), 'clean-session');
    accumulate(acc, errResult('Command timed out after 2m 0s'), 'bad-session');
    const s = summarize(acc);
    assert.equal(s.sessions, 2);
    assert.equal(s.sessions_with_blocks, 1);
    assert.equal(s.sessions_with_blocks_pct, 50);
  });

  test('events are bucketed by period for trend comparison', () => {
    const acc = newAccumulator();
    accumulate(acc, { ...errResult('Command timed out after 2m 0s'), timestamp: '2026-08-01T00:00:00Z' }, 's');
    accumulate(acc, { ...errResult('Command timed out after 2m 0s'), timestamp: '2026-09-01T00:00:00Z' }, 's');
    const s = summarize(acc);
    assert.equal(s.by_period['2026-08']['command-timeout'], 1);
    assert.equal(s.by_period['2026-09']['command-timeout'], 1);
  });

  test('an empty corpus summarizes without dividing by zero', () => {
    const s = summarize(newAccumulator());
    assert.equal(s.total_events, 0);
    assert.equal(s.sessions_with_blocks_pct, 0);
    assert.equal(s.sidechain_pct, 0);
  });

  test('DEVFLOW_OWNED excludes the harness worktree guard', () => {
    assert.equal(DEVFLOW_OWNED.has('worktree-isolation'), false,
      'claiming the harness guard as ours would overstate what this programme fixed');
  });
});

// ─── Quick 31: what happened after each edit-gate denial (DECISION-001) ─────

describe('bashWriteTargets() — commands that write a file', () => {
  const writes = [
    ['W-1a: > P', `echo x > ${P}`],
    ['W-1b: >> P', `echo x >> ${P}`],
    ['W-1c: echo x | tee P', `echo x | tee ${P}`],
    ['W-1d: tee -a P', `echo x | tee -a ${P}`],
    ["W-1e: sed -i '' (BSD)", `sed -i '' 's/a/b/' ${P}`],
    ['W-1f: sed -i (GNU)', `sed -i 's/a/b/' ${P}`],
    ['W-1g: cp /tmp/x P', `cp /tmp/x ${P}`],
    ['W-1h: mv /tmp/x P', `mv /tmp/x ${P}`],
    ['W-1i: perl -pi -e', `perl -pi -e 's/a/b/' ${P}`],
    ['W-1j: python3 -c open(P, w)', `python3 -c "open('${P}','w').write('x')"`],
    ['W-1k: python3 heredoc open(P, w) (inline patterns scan the unstripped command)',
      `python3 - <<'EOF'\nopen('${P}', 'w').write('x')\nEOF`],
    ['W-1l: python3 -c Path(P).write_text', `python3 -c "from pathlib import Path; Path('${P}').write_text('x')"`],
    ['W-1m: node -e writeFileSync(P)', `node -e "require('fs').writeFileSync('${P}','x')"`],
    ['W-1n: cat > P <<EOF', `cat > ${P} <<'EOF'\nx\nEOF`],
    ['W-1o: relative target after the heredoc delimiter', `cat <<'EOF' > src/a.go\nx\nEOF`],
  ];
  for (const [name, cmd] of writes) {
    test(name, () => {
      const targets = bashWriteTargets(cmd);
      assert.ok(Array.isArray(targets), 'returns an array');
      assert.ok(
        targets.some(t => t === P || t === 'src/a.go'),
        `expected a target equal to ${P}; got ${JSON.stringify(targets)} for ${JSON.stringify(cmd)}`
      );
    });
  }

  const nonWrites = [
    ['W-2a: cat P', `cat ${P}`],
    ['W-2b: sed -n P (no -i)', `sed -n '1,5p' ${P}`],
    ['W-2c: grep x P', `grep x ${P}`],
    ['W-2d: reading P into another file', `cat ${P} > /tmp/copy`],
    ['W-2e: 2>&1 is not a redirect to a file', 'ls 2>&1'],
    ['W-2f: > /dev/null', 'cmd > /dev/null'],
    ['W-2g: text inside a heredoc body is stripped', `cat > /tmp/notes.md <<'EOF'\nsee > src/a.go\nEOF`],
  ];
  for (const [name, cmd] of nonWrites) {
    test(name, () => {
      const targets = bashWriteTargets(cmd);
      assert.ok(Array.isArray(targets), 'returns an array');
      assert.ok(
        !targets.some(t => targetMatches(t, P)),
        `must not yield ${P}; got ${JSON.stringify(targets)} for ${JSON.stringify(cmd)}`
      );
      assert.ok(!targets.includes('/dev/null'), '/dev/null is never a target');
    });
  }
});

describe('targetMatches() — basename-tolerant', () => {
  test('W-3a: exact absolute path matches', () => {
    assert.equal(targetMatches(P, P), true);
  });
  test('W-3b: relative suffix matches', () => {
    assert.equal(targetMatches('src/a.go', P), true);
  });
  test('W-3c: ./src/a.go matches', () => {
    assert.equal(targetMatches('./src/a.go', P), true);
  });
  test('W-3d: "$REPO/src/a.go" (quoted, variable-rooted) matches by basename', () => {
    assert.equal(targetMatches('"$REPO/src/a.go"', P), true);
  });
  test('W-3e: a different basename does not match', () => {
    assert.equal(targetMatches('src/b.go', P), false);
  });
  test('W-3f: a longer basename does not match', () => {
    assert.equal(targetMatches('a.go.bak', P), false);
  });
});

describe('OVERRIDE_PHRASES — drift guard', () => {
  test('D-1: matches hooks/lib/edit-override.js', () => {
    const hooksLib = require(path.join(__dirname, '..', '..', '..', 'hooks', 'lib', 'edit-override.js'));
    assert.deepEqual(OVERRIDE_PHRASES, hooksLib.OVERRIDE_PHRASES);
  });
});

describe('edit-gate outcomes — one outcome per denial', () => {
  test('E-1: Bash heredoc write of the denied file is a bypass', () => {
    const g = gate([
      ...denied(),
      bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(3)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 1, routed: 0, abandoned: 0 });
    assert.equal(g.sample.length, 1);
    assert.equal(g.sample[0].file, 'a.go');
    assert.equal(g.sample[0].ts, T(3), 'the sample is stamped with the bypassing command row');
  });

  test('E-2: target after the heredoc delimiter is still a bypass', () => {
    const g = gate([
      ...denied(),
      bashUse('b1', `cat <<'EOF' > src/a.go\nx\nEOF`, T(3)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 1, routed: 0, abandoned: 0 });
  });

  test('E-3: a devflow Skill after the denial routes it, and a later write is not a bypass', () => {
    const g = gate([
      ...denied(),
      skillUse('k1', 'devflow:quick', T(3)),
      bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(4)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test('E-4: a skill-active --start Bash call routes', () => {
    const g = gate([
      ...denied(),
      bashUse('b1', 'node ~/.claude/devflow/bin/df-tools.cjs skill-active --start quick', T(3)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test('E-5: a typed /devflow: slash command (string content) routes', () => {
    const g = gate([
      ...denied(),
      userText('<command-message>devflow:quick</command-message>\n<command-name>/devflow:quick</command-name>', T(3)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test('E-6: a user prompt with an override phrase routes', () => {
    const g = gate([...denied(), userText('please just edit it', T(3))]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test('E-6b: an isMeta user row (skill-body injection) containing a phrase does not route', () => {
    const g = gate([...denied(), userText('the skill says just edit the file', T(3), { isMeta: true })]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 0, abandoned: 1 });
  });

  test('E-6c: an override phrase in a user text block (array content) routes', () => {
    const g = gate([
      ...denied(),
      { type: 'user', timestamp: T(3), message: { role: 'user', content: [{ type: 'text', text: 'Skip DevFlow for this one' }] } },
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test("E-7: the gate's own denial text (it says skip devflow / just edit) does not route", () => {
    const g = gate([...denied()]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 0, abandoned: 1 });
  });

  test('E-8: a denial followed only by unrelated work is abandoned', () => {
    const g = gate([...denied(), bashUse('b1', 'ls -la', T(3))]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 0, abandoned: 1 });
  });

  test('E-9: sessions are independent (denial in s1, write in s2)', () => {
    const acc = newAccumulator();
    for (const r of denied()) accumulate(acc, r, 's1');
    accumulate(acc, bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(3)), 's2');
    const g = summarize(acc).edit_gate_bypass;
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 0, abandoned: 1 });
  });

  test('E-10: a write BEFORE the denial is not a bypass', () => {
    const g = gate([
      bashUse('b0', `cat > ${P} <<'EOF'\nx\nEOF`, T(1)),
      ...denied('e1', 2),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 0, abandoned: 1 });
  });

  test('E-11: retries of the same path: one bypass resolves both, recorded as one sample', () => {
    const g = gate([
      ...denied('e1', 1),
      ...denied('e2', 3),
      bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(5)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 2, bypasses: 2, routed: 0, abandoned: 0 });
    assert.equal(g.sample.length, 1);
  });

  test('E-12a: a write to a different basename is not a bypass', () => {
    const g = gate([...denied(), bashUse('b1', "cat > src/b.go <<'EOF'\nx\nEOF", T(3))]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 0, abandoned: 1 });
  });

  test('E-12b: reading the denied file into another file is not a bypass', () => {
    const g = gate([...denied(), bashUse('b1', `cat ${P} > /tmp/copy`, T(3))]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 0, abandoned: 1 });
  });

  test('E-13: a denial with no matching tool_use counts, can never be bypassed, ends abandoned', () => {
    const g = gate([
      denial('orphan', T(1)),
      bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(2)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 0, abandoned: 1 });
  });

  test('E-13b: a denial with no matching tool_use can still be routed', () => {
    const g = gate([denial('orphan', T(1)), skillUse('k1', 'devflow:quick', T(2))]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test('E-14: malformed rows never throw', () => {
    const acc = newAccumulator();
    const rows = [
      { type: 'assistant', timestamp: T(1), message: { content: [{ type: 'tool_use', id: 'x1', name: 'Write', input: null }] } },
      { type: 'assistant', timestamp: T(2), message: { content: [{ type: 'tool_use', id: 'x2', name: 'Bash', input: { command: 42 } }] } },
      { type: 'assistant', timestamp: T(3), message: { content: [{ type: 'tool_use', id: 'x3', name: 'Bash', input: null }] } },
      skillUse('x4', undefined, T(4)),
      { type: 'user', timestamp: T(5), message: { role: 'user', content: null } },
      { type: 'user', timestamp: T(6), message: { role: 'user', content: [null, 7, 'str', {}] } },
      { type: 'assistant', timestamp: T(7), message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: P } }] } },
    ];
    for (const r of rows) assert.doesNotThrow(() => accumulate(acc, r, 's1'));
    assert.doesNotThrow(() => summarize(acc));
    assert.deepEqual(outcomes(summarize(acc).edit_gate_bypass), { denials: 0, bypasses: 0, routed: 0, abandoned: 0 });
  });

  test('a NotebookEdit denial records its notebook_path and can be bypassed', () => {
    const nb = '/repo/notes/n.ipynb';
    const g = gate([
      { type: 'assistant', timestamp: T(1), message: { content: [{ type: 'tool_use', id: 'n1', name: 'NotebookEdit', input: { notebook_path: nb } }] } },
      denial('n1', T(2)),
      bashUse('b1', `cat > ${nb} <<'EOF'\n{}\nEOF`, T(3)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 1, routed: 0, abandoned: 0 });
    assert.equal(g.sample[0].file, 'n.ipynb');
  });

  test('summarize() does not mutate the accumulator (still-open denials stay open)', () => {
    const acc = newAccumulator();
    for (const r of denied()) accumulate(acc, r, 's1');
    assert.equal(summarize(acc).edit_gate_bypass.abandoned, 1);
    assert.equal(summarize(acc).edit_gate_bypass.abandoned, 1);
    accumulate(acc, bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(3)), 's1');
    assert.deepEqual(outcomes(summarize(acc).edit_gate_bypass), { denials: 1, bypasses: 1, routed: 0, abandoned: 0 });
  });
});

describe('summarize() edit_gate_bypass', () => {
  test('S-1: denials === bypasses + routed + abandoned === by_category[devflow-edit-gate]', () => {
    const acc = newAccumulator();
    const rows = [
      editUse('e1', P, T(1)), denial('e1', T(2)),
      bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(3)),
      editUse('e2', '/repo/src/b.go', T(4)), denial('e2', T(5)),
      skillUse('k1', 'devflow:quick', T(6)),
      editUse('e3', '/repo/src/c.go', T(7)), denial('e3', T(8)),
    ];
    for (const r of rows) accumulate(acc, r, 's1');
    const s = summarize(acc);
    const g = s.edit_gate_bypass;
    assert.deepEqual(outcomes(g), { denials: 3, bypasses: 1, routed: 1, abandoned: 1 });
    assert.equal(g.denials, g.bypasses + g.routed + g.abandoned);
    assert.equal(g.denials, s.by_category['devflow-edit-gate']);
    assert.equal(g.bypass_rate, 0.333);
  });

  test('S-2: by_period is keyed by the denial month', () => {
    const acc = newAccumulator();
    for (const r of [editUse('e1', P, '2026-08-10T00:00:00Z'), denial('e1', '2026-08-10T00:00:01Z')]) accumulate(acc, r, 's1');
    for (const r of [
      editUse('e2', P, '2026-09-10T00:00:00Z'), denial('e2', '2026-09-10T00:00:01Z'),
      bashUse('b2', `cat > ${P} <<'EOF'\nx\nEOF`, '2026-09-10T00:00:02Z'),
    ]) accumulate(acc, r, 's2');
    const g = summarize(acc).edit_gate_bypass;
    assert.deepEqual(g.by_period, {
      '2026-08': { denials: 1, bypasses: 0, routed: 0, abandoned: 1 },
      '2026-09': { denials: 1, bypasses: 1, routed: 0, abandoned: 0 },
    });
  });

  test('S-2b: a denial without a timestamp is counted in the totals but left out of by_period', () => {
    const acc = newAccumulator();
    const noTs = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'e1', is_error: true, content: GATE_TEXT }] } };
    accumulate(acc, noTs, 's1');
    const g = summarize(acc).edit_gate_bypass;
    assert.equal(g.denials, 1);
    assert.equal(g.abandoned, 1);
    assert.deepEqual(g.by_period, {});
  });

  test('S-3: sample is capped at 5 with 7 bypassing commands; commands are one line, at most 200 chars', () => {
    const acc = newAccumulator();
    const rows = [];
    for (let i = 0; i < 7; i += 1) {
      const n = i * 3;
      rows.push(editUse(`e${i}`, P, T(n)), denial(`e${i}`, T(n + 1)),
        bashUse(`b${i}`, `cat > ${P} <<'EOF'\n${'x'.repeat(300)}\nEOF`, T(n + 2)));
    }
    for (const r of rows) accumulate(acc, r, 's1');
    const g = summarize(acc).edit_gate_bypass;
    assert.equal(g.bypasses, 7);
    assert.equal(g.sample.length, 5);
    for (const s of g.sample) {
      assert.ok(s.command.length <= 200, `command too long: ${s.command.length}`);
      assert.ok(!s.command.includes('\n'), 'command must be a single line');
    }
  });

  test('S-4: an empty corpus is all zeros with no NaN', () => {
    const g = summarize(newAccumulator()).edit_gate_bypass;
    assert.deepEqual(g, {
      denials: 0, bypasses: 0, routed: 0, abandoned: 0, bypass_rate: 0, by_period: {}, sample: [],
    });
    assert.ok(!Number.isNaN(g.bypass_rate));
  });

  test('S-5: existing keys come first and unchanged; edit_gate_bypass is last', () => {
    const keys = Object.keys(summarize(newAccumulator()));
    assert.deepEqual(keys.slice(0, -1), [
      'files_scanned', 'sessions', 'sessions_with_blocks', 'sessions_with_blocks_pct',
      'total_events', 'sidechain_pct', 'by_category', 'by_period',
      'devflow_owned_events', 'verdict',
    ]);
    assert.equal(keys[keys.length - 1], 'edit_gate_bypass');
  });
});
