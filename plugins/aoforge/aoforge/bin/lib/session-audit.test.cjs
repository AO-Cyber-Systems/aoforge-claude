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

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  classify, accumulate, summarize, newAccumulator, AOFORGE_OWNED,
  bashWriteTargets, targetMatches, OVERRIDE_PHRASES,
  analyze, newHistoryTracker,
} = require('./session-audit.cjs');
const { bashGateReason } = require('./bash-write-gate.cjs');
const { makeTrackedRepo } = require('./__fixtures__/tracked-repo.cjs');
const { applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');
const {
  bashRow, skillToolRow, gateDenialRow, writeTranscriptTree, REPLAY_HISTORY,
} = require('./__fixtures__/bash-replay-fixtures.cjs');

// Built at runtime so this source file does not itself contain the raw-commit
// phrase — the commit gate matches on it (see TRD 27-04, which fixed exactly
// this false positive but only ships once the plugin cache is re-synced).
const RAW_COMMIT_MSG = 'AOForge project detected. Raw `' + 'git ' + 'commit` is blocked.';

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
// phrases "skip aoforge" and "just edit", which MUST NOT route (E-7).
const P = '/repo/src/a.go';
const GATE_TEXT = 'AOForge ambient mode active — direct Edit/Write/MultiEdit denied. ' +
  'To proceed, invoke an AOForge skill, or include "skip aoforge" or "just edit" in your prompt.';

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
    ['AOForge ambient mode active — direct Edit/Write/MultiEdit denied.', 'aoforge-edit-gate'],
    [RAW_COMMIT_MSG, 'aoforge-commit-gate'],
    ['This agent is isolated in the worktree /x, but this command is too complex', 'worktree-isolation'],
    ['Skill aoforge:objective cannot be used with Skill tool due to disable-model-invocation', 'skill-not-invocable'],
    ['Error: No such tool available: Edit.', 'tool-not-available'],
    ['Grep is not enabled in this context', 'tool-not-available'],
    ["The user doesn't want to proceed with this tool use.", 'permission-denial'],
    ['File has not been read yet. Read it first', 'read-before-write'],
    ['Command timed out after 2m 0s', 'command-timeout'],
    ['File does not exist. Note: your current working directory is /x', 'file-not-found'],
    ['File content (5.1KB) exceeds maximum allowed size', 'output-too-large'],
    ['CHANGELOG.md lacks ## [2.5.0]', 'aoforge-changelog-gate'],
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
      '# Notes\n\ngate-edits.js denies Edit in ambient mode; AOForge ambient mode active ' +
      'is the message. ' + RAW_COMMIT_MSG
    ), 's1');
    assert.equal(acc.events.length, 0, 'discussion of a gate must never count as a gate event');
  });

  test('assistant prose mentioning a gate is not an event either', () => {
    const acc = newAccumulator();
    accumulate(acc, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'The AOForge ambient mode active message means...' }] },
    }, 's1');
    assert.equal(acc.events.length, 0);
  });

  test('a failed tool_result IS an event', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('AOForge ambient mode active — direct Edit/Write/MultiEdit denied.'), 's1');
    assert.equal(acc.events.length, 1);
    assert.equal(acc.events[0].category, 'aoforge-edit-gate');
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
  test('counts AOForge-owned categories separately from harness ones', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('AOForge ambient mode active — direct Edit/Write/MultiEdit denied.'), 's1');
    accumulate(acc, errResult('This agent is isolated in the worktree /x'), 's1');
    const s = summarize(acc);
    // the worktree guard is the harness's, not AOForge's — it must not be claimed
    assert.equal(s.aoforge_owned_events, 1);
    assert.equal(s.total_events, 2);
    assert.match(s.verdict, /1 AOForge-owned/);
  });

  test('a clean window reports zero AOForge-owned blocks', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('This agent is isolated in the worktree /x'), 's1');
    const s = summarize(acc);
    assert.equal(s.aoforge_owned_events, 0);
    assert.match(s.verdict, /no AOForge-owned blocks/);
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

  test('AOFORGE_OWNED excludes the harness worktree guard', () => {
    assert.equal(AOFORGE_OWNED.has('worktree-isolation'), false,
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

  test('E-3: an aoforge Skill after the denial routes it, and a later write is not a bypass', () => {
    const g = gate([
      ...denied(),
      skillUse('k1', 'aoforge:quick', T(3)),
      bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(4)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test('E-4: a skill-active --start Bash call routes', () => {
    const g = gate([
      ...denied(),
      bashUse('b1', 'node ~/.claude/aoforge/bin/aof-tools.cjs skill-active --start quick', T(3)),
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test('E-5: a typed /aoforge: slash command (string content) routes', () => {
    const g = gate([
      ...denied(),
      userText('<command-message>aoforge:quick</command-message>\n<command-name>/aoforge:quick</command-name>', T(3)),
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
      { type: 'user', timestamp: T(3), message: { role: 'user', content: [{ type: 'text', text: 'Skip AOForge for this one' }] } },
    ]);
    assert.deepEqual(outcomes(g), { denials: 1, bypasses: 0, routed: 1, abandoned: 0 });
  });

  test("E-7: the gate's own denial text (it says skip aoforge / just edit) does not route", () => {
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
    const g = gate([denial('orphan', T(1)), skillUse('k1', 'aoforge:quick', T(2))]);
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
  test('S-1: denials === bypasses + routed + abandoned === by_category[aoforge-edit-gate]', () => {
    const acc = newAccumulator();
    const rows = [
      editUse('e1', P, T(1)), denial('e1', T(2)),
      bashUse('b1', `cat > ${P} <<'EOF'\nx\nEOF`, T(3)),
      editUse('e2', '/repo/src/b.go', T(4)), denial('e2', T(5)),
      skillUse('k1', 'aoforge:quick', T(6)),
      editUse('e3', '/repo/src/c.go', T(7)), denial('e3', T(8)),
    ];
    for (const r of rows) accumulate(acc, r, 's1');
    const s = summarize(acc);
    const g = s.edit_gate_bypass;
    assert.deepEqual(outcomes(g), { denials: 3, bypasses: 1, routed: 1, abandoned: 1 });
    assert.equal(g.denials, g.bypasses + g.routed + g.abandoned);
    assert.equal(g.denials, s.by_category['aoforge-edit-gate']);
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

  test('S-5: existing keys come first and unchanged; edit_gate_bypass, then bash_edit_gate, are last', () => {
    const keys = Object.keys(summarize(newAccumulator()));
    // TRD 60-05 appends bash_edit_gate after edit_gate_bypass; the original ten keys and edit_gate_bypass keep their places.
    assert.deepEqual(keys.slice(0, -2), [
      'files_scanned', 'sessions', 'sessions_with_blocks', 'sessions_with_blocks_pct',
      'total_events', 'sidechain_pct', 'by_category', 'by_period',
      'aoforge_owned_events', 'verdict',
    ]);
    assert.equal(keys[keys.length - 2], 'edit_gate_bypass');
    assert.equal(keys[keys.length - 1], 'bash_edit_gate');
  });
});

// ─── Bash write gate replay (TRD 60-05) ─────────────────────────────────────
// Every Bash call in a transcript runs through the hook's own evaluateBashWrites in dry-run. The project is a
// hand-built hermetic repo (makeTrackedRepo, REPLAY_HISTORY): src/a.js added 2026-09-01, src/late.js added
// 2026-09-10, src/gone.js added 2026-09-01 and removed 2026-09-15. Transcripts are hand-built trees on disk.
describe('bash_edit_gate replay', () => {
  let repo;
  let restoreEnv;
  let gitHome;
  const tmpDirs = [];
  let seq = 0;

  before(() => {
    gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-replay-home-'));
    restoreEnv = applyGitTestEnv(gitHome);
    repo = makeTrackedRepo({ history: REPLAY_HISTORY });
  });
  after(() => {
    repo.cleanup();
    restoreEnv();
    for (const d of [gitHome, ...tmpDirs]) fs.rmSync(d, { recursive: true, force: true });
  });

  const mkTmp = (prefix) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
  };
  /** One main-thread Bash row in the fixture project. */
  const br = (command, ts, extra = {}) => bashRow({ id: `b${++seq}`, command, ts, cwd: repo.root, ...extra });
  /** Write `spec` as a transcript tree and replay it. */
  const replay = (spec, opts) => analyze([writeTranscriptTree(mkTmp('df-replay-tree-'), spec)], opts).bash_edit_gate;

  const D = (day) => `2026-09-${day}T00:00:00Z`;
  const WRITE_A = 'echo x > src/a.js';
  const START = 'node ~/.claude/aoforge/bin/aof-tools.cjs skill-active --start quick';
  const END = 'node ~/.claude/aoforge/bin/aof-tools.cjs skill-active --end';

  describe('1-4: history-accurate tracking', () => {
    test('1: an ambient redirect into a tracked file would be denied', () => {
      const g = replay({ sessions: { s1: [br(WRITE_A, D('05'))] } });
      assert.equal(g.bash_calls, 1);
      assert.equal(g.ambient_bash_calls, 1);
      assert.equal(g.would_deny, 1);
      assert.equal(g.by_form.redirect, 1);
      assert.equal(g.false_positive_rate, 1);
      assert.equal(g.recommended_default, 'warn');
    });

    test('2: the same command before the file was added would pass (untracked then)', () => {
      const g = replay({ sessions: { s1: [br(WRITE_A, '2026-08-20T00:00:00Z')] } });
      assert.equal(g.ambient_bash_calls, 1);
      assert.equal(g.would_deny, 0);
    });

    test('3: a file added later is untracked before the add and tracked after it', () => {
      const before10 = replay({ sessions: { s1: [br('echo x > src/late.js', D('05'))] } });
      assert.equal(before10.would_deny, 0);
      const after10 = replay({ sessions: { s1: [br('echo x > src/late.js', D('12'))] } });
      assert.equal(after10.would_deny, 1);
    });

    test('4: a file later removed is tracked before the delete and untracked after it', () => {
      const cmd = "sed -i 's/a/b/' src/gone.js";
      assert.equal(replay({ sessions: { s1: [br(cmd, D('12'))] } }).would_deny, 1);
      assert.equal(replay({ sessions: { s1: [br(cmd, D('20'))] } }).would_deny, 0);
      assert.equal(replay({ sessions: { s1: [br(cmd, D('12'))] } }).by_form['sed-i'], 1);
    });

    test('4b: a row with no timestamp sees the latest state', () => {
      const g = replay({ sessions: { s1: [
        br('echo x > src/gone.js', undefined),
        br('echo x > src/late.js', undefined),
      ] } });
      assert.equal(g.ambient_bash_calls, 2);
      assert.equal(g.would_deny, 1);
    });
  });

  describe('5: what is not ambient', () => {
    test('5a: a row attributed to an aoforge skill is excluded', () => {
      const g = replay({ sessions: { s1: [br(WRITE_A, D('05'), { attributionSkill: 'aoforge:quick' })] } });
      assert.equal(g.bash_calls, 1);
      assert.equal(g.excluded.aoforge_skill, 1);
      assert.equal(g.ambient_bash_calls, 0);
      assert.equal(g.would_deny, 0);
    });

    test('5a2: a row attributed to a non-aoforge skill is still ambient', () => {
      const g = replay({ sessions: { s1: [br(WRITE_A, D('05'), { attributionSkill: 'superpowers:brainstorming' })] } });
      assert.equal(g.excluded.aoforge_skill, 0);
      assert.equal(g.ambient_bash_calls, 1);
      assert.equal(g.would_deny, 1);
    });

    test('5b: an aoforge:* subagent transcript (sibling .meta.json) is excluded', () => {
      const g = replay({
        sessions: { s1: [] },
        subagents: { s1: [{ id: 'agent-1', agentType: 'aoforge:executor', rows: [br(WRITE_A, D('05'), { isSidechain: true })] }] },
      });
      assert.equal(g.excluded.aoforge_agent, 1);
      assert.equal(g.ambient_bash_calls, 0);
    });

    test('5c: a general-purpose subagent is ambient', () => {
      const g = replay({
        sessions: { s1: [] },
        subagents: { s1: [{ id: 'agent-1', agentType: 'general-purpose', rows: [br(WRITE_A, D('05'), { isSidechain: true })] }] },
      });
      assert.equal(g.excluded.aoforge_agent, 0);
      assert.equal(g.ambient_bash_calls, 1);
      assert.equal(g.would_deny, 1);
    });

    test('5c2: a subagent transcript with no .meta.json is ambient', () => {
      const g = replay({
        sessions: { s1: [] },
        subagents: { s1: [{ id: 'agent-1', rows: [br(WRITE_A, D('05'), { isSidechain: true })] }] },
      });
      assert.equal(g.ambient_bash_calls, 1);
    });

    test('5d: rows from skill-active --start to --end are excluded, inclusive; the next row is ambient', () => {
      const g = replay({ sessions: { s1: [
        br(START, D('05')), br(WRITE_A, D('05')), br(END, D('05')), br(WRITE_A, D('06')),
      ] } });
      assert.equal(g.bash_calls, 4);
      assert.equal(g.excluded.aoforge_skill, 3);
      assert.equal(g.ambient_bash_calls, 1);
      assert.equal(g.would_deny, 1);
    });

    test('5d2: an open window does not leak into the next session', () => {
      const g = replay({ sessions: {
        s1: [br(START, D('05')), br(WRITE_A, D('05'))],
        s2: [br(WRITE_A, D('06'))],
      } });
      assert.equal(g.excluded.aoforge_skill, 2);
      assert.equal(g.ambient_bash_calls, 1);
    });

    test('5e: an aoforge Skill call opens the window for the rest of the session, until --end', () => {
      const skill = skillToolRow({ id: 'sk1', skill: 'aoforge:build', ts: D('05'), cwd: repo.root });
      const g = replay({ sessions: { s1: [
        br(WRITE_A, D('04')), skill, br(WRITE_A, D('05')), br(WRITE_A, D('06')), br(END, D('07')), br(WRITE_A, D('08')),
      ] } });
      assert.equal(g.bash_calls, 5);
      assert.equal(g.excluded.aoforge_skill, 3);
      assert.equal(g.ambient_bash_calls, 2);
      assert.equal(g.would_deny, 2);
    });

    test('5e2: a non-aoforge Skill call does not open the window', () => {
      const skill = skillToolRow({ id: 'sk1', skill: 'superpowers:brainstorming', ts: D('05'), cwd: repo.root });
      const g = replay({ sessions: { s1: [skill, br(WRITE_A, D('05'))] } });
      assert.equal(g.excluded.aoforge_skill, 0);
      assert.equal(g.ambient_bash_calls, 1);
    });
  });

  describe('6: where the project is', () => {
    test('6a: a cwd with no .aoforge/ ancestor is not an aoforge project', () => {
      const loose = mkTmp('df-replay-loose-');
      const g = replay({ sessions: { s1: [bashRow({ id: 'x', command: WRITE_A, ts: D('05'), cwd: loose })] } });
      assert.equal(g.bash_calls, 1);
      assert.equal(g.excluded.not_aoforge_project, 1);
      assert.equal(g.ambient_bash_calls, 0);
    });

    test('6b: a row with no absolute cwd is not an aoforge project', () => {
      const g = replay({ sessions: { s1: [bashRow({ id: 'x', command: WRITE_A, ts: D('05'), cwd: undefined })] } });
      assert.equal(g.excluded.not_aoforge_project, 1);
    });

    test('6c: a .aoforge/ project that is not a git repository has no history', () => {
      const proj = mkTmp('df-replay-nogit-');
      fs.mkdirSync(path.join(proj, '.aoforge'));
      const g = replay({ sessions: { s1: [bashRow({ id: 'x', command: WRITE_A, ts: D('05'), cwd: proj })] } });
      assert.equal(g.excluded.history_unavailable, 1);
      assert.equal(g.ambient_bash_calls, 0);
    });

    test('6d: a cwd inside a subdirectory of the project resolves to the project root', () => {
      const g = replay({ sessions: { s1: [
        bashRow({ id: 'x', command: 'echo x > ../src/a.js', ts: D('05'), cwd: path.join(repo.root, 'src') }),
      ] } });
      assert.equal(g.ambient_bash_calls, 1);
      assert.equal(g.would_deny, 1);
      assert.deepEqual(g.sample[0].gated, ['src/a.js']);
    });
  });

  describe('7: ambient rows that never gate', () => {
    test('7: heredoc mention, markdown, planning, outside-project and ls are ambient with would_deny 0', () => {
      const g = replay({ sessions: { s1: [
        br("cat <<'EOF'\necho x > src/a.js\nEOF", D('05')),
        br('echo x >> README.md', D('05')),
        br('echo {} > .aoforge/x.json', D('05')),
        br('echo x > /tmp/x', D('05')),
        br('ls', D('05')),
      ] } });
      assert.equal(g.bash_calls, 5);
      assert.equal(g.ambient_bash_calls, 5);
      assert.equal(g.would_deny, 0);
      assert.equal(g.false_positive_rate, 0);
      assert.equal(g.recommended_default, 'strict');
    });
  });

  describe('8: rate and recommendation', () => {
    const ls = (n) => Array.from({ length: n }, () => br('ls', D('05')));

    test('8a: 1 would-deny and 49 ls is 0.02, which is strict', () => {
      const g = replay({ sessions: { s1: [br(WRITE_A, D('05')), ...ls(49)] } });
      assert.equal(g.ambient_bash_calls, 50);
      assert.equal(g.would_deny, 1);
      assert.equal(g.false_positive_rate, 0.02);
      assert.equal(g.recommended_default, 'strict');
    });

    test('8b: 2 would-denies and 48 ls is 0.04, which is warn', () => {
      const g = replay({ sessions: { s1: [br(WRITE_A, D('05')), br(WRITE_A, D('06')), ...ls(48)] } });
      assert.equal(g.false_positive_rate, 0.04);
      assert.equal(g.recommended_default, 'warn');
    });

    test('8c: no ambient rows is a null rate and warn, never NaN', () => {
      const loose = mkTmp('df-replay-loose-');
      const g = replay({ sessions: { s1: [bashRow({ id: 'x', command: 'ls', ts: D('05'), cwd: loose })] } });
      assert.equal(g.ambient_bash_calls, 0);
      assert.equal(g.false_positive_rate, null);
      assert.equal(g.recommended_default, 'warn');
      const empty = summarize(newAccumulator()).bash_edit_gate;
      assert.equal(empty.false_positive_rate, null);
      assert.equal(empty.recommended_default, 'warn');
    });

    test('8d: the threshold is 0.02 and the basis names the upper bound', () => {
      const g = replay({ sessions: { s1: [br('ls', D('05'))] } });
      assert.equal(g.threshold, 0.02);
      assert.match(g.false_positive_basis, /upper bound/);
    });

    test('8e: the rate is rounded to 6 decimals', () => {
      const acc = newAccumulator({ trackedAt: (root, list) => new Set(list) });
      accumulate(acc, br(WRITE_A, D('05')), 's1');
      for (let i = 0; i < 2; i += 1) accumulate(acc, br('ls', D('05')), 's1');
      assert.equal(summarize(acc).bash_edit_gate.false_positive_rate, 0.333333);
    });
  });

  describe('9: one git history read per project root', () => {
    const LOG = '@1788220800\nA\tsrc/a.js\n';
    const okSpawn = () => {
      const calls = [];
      const spawn = (cmd, args, opts) => {
        calls.push({ cmd, args, opts });
        return { status: 0, stdout: LOG, stderr: '' };
      };
      return { spawn, calls };
    };

    test('9: three rows in one root plus one in a second root spawn git twice, read-only', () => {
      const { spawn, calls } = okSpawn();
      const t = newHistoryTracker({ spawn });
      const rootA = repo.root;
      const rootB = mkTmp('df-replay-second-');
      const abs = (root) => [path.join(root, 'src', 'a.js')];
      for (let i = 0; i < 3; i += 1) t.trackedAt(rootA, abs(rootA), '2026-09-05T00:00:00Z');
      t.trackedAt(rootB, abs(rootB), '2026-09-05T00:00:00Z');
      assert.equal(calls.length, 2);
      assert.equal(calls[0].cmd, 'git');
      for (const w of ['-C', 'log', '--no-renames', '--relative', '--diff-filter=AD', '--name-status']) {
        assert.ok(calls[0].args.includes(w), `git args include ${w}: ${calls[0].args.join(' ')}`);
      }
      assert.equal(calls[0].opts.env.GIT_OPTIONAL_LOCKS, '0');
    });

    test('9b: the answer follows the parsed history', () => {
      const t = newHistoryTracker({ spawn: okSpawn().spawn });
      const a = path.join(repo.root, 'src', 'a.js');
      const b = path.join(repo.root, 'src', 'b.js');
      const asOf = (ts) => t.trackedAt(repo.root, [a, b], ts);
      assert.deepEqual([...asOf(new Date(1788220800 * 1000 + 1000).toISOString())], [a]);
      assert.deepEqual([...asOf(new Date(1788220800 * 1000 - 1000).toISOString())], []);
      assert.deepEqual([...asOf(undefined)], [a]);
    });

    test('9c: a failing git is an unavailable root (null), asked once', () => {
      let n = 0;
      const t = newHistoryTracker({ spawn: () => { n += 1; return { status: 128, stdout: '', stderr: 'fatal' }; } });
      assert.equal(t.trackedAt(repo.root, [], D('05')), null);
      assert.equal(t.trackedAt(repo.root, [], D('06')), null);
      assert.equal(t.available(repo.root), false);
      assert.equal(n, 1);
    });

    test('9d: an add then a delete in the same history is untracked after the delete', () => {
      const log = '@300\nD\tsrc/a.js\n@100\nA\tsrc/a.js\n';
      const t = newHistoryTracker({ spawn: () => ({ status: 0, stdout: log, stderr: '' }) });
      const a = path.join(repo.root, 'src', 'a.js');
      const at = (sec) => new Date(sec * 1000).toISOString();
      assert.equal(t.trackedAt(repo.root, [a], at(200)).has(a), true);
      assert.equal(t.trackedAt(repo.root, [a], at(400)).has(a), false);
      assert.equal(t.trackedAt(repo.root, [a], at(50)).has(a), false);
    });
  });

  describe('10: a real Bash-gate denial is its own category', () => {
    const root = '/work/proj';
    const strictText = bashGateReason([`${root}/src/a.js`], root, 'strict');
    const warnText = bashGateReason([`${root}/src/a.js`], root, 'warn');

    test('10a: the strict and warn texts classify as aoforge-bash-edit-gate', () => {
      assert.equal(classify(strictText), 'aoforge-bash-edit-gate');
      assert.equal(classify(warnText), 'aoforge-bash-edit-gate');
    });

    test('10b: it is AOForge-owned, and the Edit/Write denial text keeps its own category', () => {
      assert.ok(AOFORGE_OWNED.has('aoforge-bash-edit-gate'));
      assert.equal(classify('AOForge ambient mode active — direct Edit/Write/MultiEdit denied.'), 'aoforge-edit-gate');
    });

    test('10c: it opens no edit-gate denial, so edit_gate_bypass stays at zero', () => {
      const acc = newAccumulator();
      accumulate(acc, br(WRITE_A, D('05')), 's1');
      accumulate(acc, gateDenialRow({ toolUseId: 'b1', text: strictText, ts: D('05') }), 's1');
      accumulate(acc, br(WRITE_A, D('05')), 's1');
      const s = summarize(acc);
      assert.equal(s.by_category['aoforge-bash-edit-gate'], 1);
      assert.equal(s.by_category['aoforge-edit-gate'], undefined);
      assert.equal(s.edit_gate_bypass.denials, 0);
      assert.equal(s.edit_gate_bypass.bypasses, 0);
      assert.equal(s.aoforge_owned_events, 1);
    });
  });

  describe('11: by_period and sample', () => {
    test('11a: by_period counts ambient and would_deny per month', () => {
      const g = replay({ sessions: { s1: [
        br(WRITE_A, D('05')), br('ls', D('06')), br(WRITE_A, '2026-08-20T00:00:00Z'),
      ] } });
      assert.deepEqual(g.by_period['2026-09'], { ambient: 2, would_deny: 1 });
      assert.deepEqual(g.by_period['2026-08'], { ambient: 1, would_deny: 0 });
    });

    test('11b: sample holds at most 10 entries, one-line commands cut to 200, gated paths relative', () => {
      const rows = Array.from({ length: 12 }, (_, i) => br(
        i === 0 ? `\necho \t ${'y'.repeat(300)} >\tsrc/a.js\n` : 'echo  yyy >\tsrc/a.js\ntrue',
        `2026-09-05T00:00:${String(i).padStart(2, '0')}Z`));
      const g = replay({ sessions: { s1: rows } });
      assert.equal(g.would_deny, 12);
      assert.equal(g.sample.length, 10);
      const first = g.sample[0];
      assert.deepEqual(Object.keys(first), ['ts', 'command', 'gated']);
      assert.equal(first.ts, '2026-09-05T00:00:00Z');
      assert.equal(first.command.length, 200);
      assert.ok(!/\s{2}|[\n\t]/.test(first.command), 'whitespace is collapsed to single spaces');
      assert.ok(first.command.startsWith('echo yyy'));
      assert.deepEqual(first.gated, ['src/a.js']);
      assert.equal(g.sample[1].command, 'echo yyy > src/a.js true');
    });
  });

  describe('shape, errors and purity', () => {
    test('the report carries its keys in the documented order, appended last', () => {
      const s = summarize(newAccumulator());
      assert.deepEqual(Object.keys(s.bash_edit_gate), [
        'bash_calls', 'ambient_bash_calls', 'excluded', 'would_deny', 'by_form', 'false_positive_rate',
        'false_positive_basis', 'threshold', 'recommended_default', 'by_period', 'sample',
      ]);
      assert.deepEqual(Object.keys(s.bash_edit_gate.excluded), [
        'aoforge_agent', 'aoforge_skill', 'not_aoforge_project', 'history_unavailable', 'error',
      ]);
      assert.deepEqual(Object.keys(s.bash_edit_gate.by_form), [
        'redirect', 'tee', 'sed-i', 'perl-i', 'cp', 'mv', 'python', 'node',
      ]);
      assert.equal(Object.keys(s).pop(), 'bash_edit_gate');
    });

    test('a throw while replaying one row is counted in excluded.error and the audit goes on', () => {
      let calls = 0;
      const acc = newAccumulator({ trackedAt: (root, list) => { calls += 1; if (calls === 2) throw new Error('boom'); return new Set(list); } });
      assert.doesNotThrow(() => {
        accumulate(acc, br(WRITE_A, D('05')), 's1');
        accumulate(acc, br(WRITE_A, D('05')), 's1');
        accumulate(acc, br(WRITE_A, D('05')), 's1');
      });
      const g = summarize(acc).bash_edit_gate;
      assert.equal(g.bash_calls, 3);
      assert.equal(g.excluded.error, 1);
      // The failed row is skipped, not half counted: bash_calls = ambient + every exclusion.
      assert.equal(g.ambient_bash_calls, 2);
      assert.equal(g.would_deny, 2);
      const excluded = Object.values(g.excluded).reduce((a, n) => a + n, 0);
      assert.equal(g.bash_calls, g.ambient_bash_calls + excluded);
    });

    test('malformed rows never reach the replay', () => {
      const acc = newAccumulator();
      for (const row of [null, 'x', {}, { type: 'assistant' }, { type: 'assistant', message: { content: 'text' } },
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }, null] } }]) {
        assert.doesNotThrow(() => accumulate(acc, row, 's1'));
      }
      assert.equal(summarize(acc).bash_edit_gate.bash_calls, 0);
    });

    test('a fileCtx 4th argument carries the agent type; the 3-argument form still works', () => {
      const acc = newAccumulator({ trackedAt: (root, list) => new Set(list) });
      accumulate(acc, br(WRITE_A, D('05')), 's1', { agentType: 'aoforge:planner' });
      accumulate(acc, br(WRITE_A, D('05')), 's2');
      const g = summarize(acc).bash_edit_gate;
      assert.equal(g.excluded.aoforge_agent, 1);
      assert.equal(g.ambient_bash_calls, 1);
    });

    test('the replay never writes: the command is not run and the repository is untouched', () => {
      const file = path.join(repo.root, 'src', 'a.js');
      const beforeContent = fs.readFileSync(file, 'utf8');
      const beforeStatus = repo.git(['status', '--porcelain']);
      const g = replay({ sessions: { s1: [br('echo CHANGED > src/a.js', D('05')), br('rm -f src/a.js', D('06'))] } });
      assert.equal(g.would_deny, 1);
      assert.equal(fs.readFileSync(file, 'utf8'), beforeContent);
      assert.equal(repo.git(['status', '--porcelain']), beforeStatus);
    });

    test('the injected trackedAt replaces the git history reader', () => {
      const seen = [];
      const g = replay({ sessions: { s1: [br(WRITE_A, D('05'))] } }, {
        trackedAt: (root, list, ts) => { seen.push(ts); return new Set(list); },
      });
      assert.equal(g.would_deny, 1);
      assert.ok(seen.includes(D('05')));
    });
  });
});
