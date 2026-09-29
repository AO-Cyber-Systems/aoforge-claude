/**
 * Tests for gate-executor-stop.js — the SubagentStop completion gate for
 * devflow:executor (TRD 44-04, AUT-02).
 *
 * All fixtures are hand-built (./__fixtures__/subagent-stop-fixtures.js):
 * invented plan ids (77-02) and invented paths; no real transcript is copied.
 *
 * Unit (in-process):
 *   9.  identifyTrd — PLAN_ID / exec-context --id / -TRD.md path / frontmatter, ambiguity → null
 *   10. readFirstUserPrompt — string + array content, leading records skipped, bounded 1 MiB read
 *   11. summaryExists — over injected roots; roots without .planning/objectives skipped
 *   +   candidateRoots, isDeliberateStop
 */

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const F = require('./__fixtures__/subagent-stop-fixtures.js');
const {
  identifyTrd,
  readFirstUserPrompt,
  candidateRoots,
  summaryExists,
  isDeliberateStop,
} = require('./gate-executor-stop.js');

const MiB = 1 << 20;

function mkTmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

// ─── 9. identifyTrd ───────────────────────────────────────────────────────────

describe('identifyTrd', () => {
  test('PLAN_ID line → id', () => {
    assert.equal(identifyTrd('PLAN_ID: 77-02').id, '77-02');
  });

  test('full execute-objective spawn prompt → id and REPO_ROOT', () => {
    const r = identifyTrd(F.executorPrompt({ planId: '77-02', repoRoot: '/fixture/repo' }));
    assert.deepEqual(r, { id: '77-02', repoRoot: '/fixture/repo' });
  });

  test('exec-context check --id only → id', () => {
    const text = 'Run first:\n  node ~/.claude/devflow/bin/df-tools.cjs exec-context check --repo /fixture/repo --base abc1234 --id 77-02\n';
    assert.equal(identifyTrd(text).id, '77-02');
  });

  test('-TRD.md path only → id', () => {
    const text = 'Read @.planning/objectives/77-x/77-02-TRD.md and execute it.';
    assert.equal(identifyTrd(text).id, '77-02');
  });

  test('decimal objective PLAN_ID: 12.1-03 → 12.1-03', () => {
    assert.equal(identifyTrd('PLAN_ID: 12.1-03').id, '12.1-03');
  });

  test('frontmatter only (objective: 77-foo + trd: "02") → 77-02', () => {
    const text = F.executorPrompt({ planId: null, objective: '77-foo', trd: '02' });
    assert.equal(identifyTrd(text).id, '77-02');
  });

  test('PLAN_ID 77-02 plus exec-context --id 77-03 → ambiguous → null', () => {
    const text = [
      'PLAN_ID: 77-02',
      '  node ~/.claude/devflow/bin/df-tools.cjs exec-context check --repo /r --base b --id 77-03',
    ].join('\n');
    assert.equal(identifyTrd(text), null);
  });

  test('two different -TRD.md paths (no explicit id) → ambiguous → null', () => {
    const text = 'Compare .planning/objectives/77-x/77-01-TRD.md with .planning/objectives/77-x/77-02-TRD.md';
    assert.equal(identifyTrd(text), null);
  });

  test('explicit PLAN_ID wins over a different -TRD.md path mentioned as context', () => {
    const text = 'PLAN_ID: 77-02\nContext: @.planning/objectives/77-x/77-01-TRD.md';
    assert.equal(identifyTrd(text).id, '77-02');
  });

  test('prose mentions (not line-anchored PLAN_ID, --id outside exec-context) are ignored', () => {
    // An embedded TRD test list quoting ids must not make a real prompt ambiguous.
    const text = F.executorPrompt({
      planId: '77-02',
      extra: [
        '1. The first prompt has `PLAN_ID: 77-09` and more.',
        '   - `PLAN_ID: 77-02` plus a `--id 77-08` → ambiguous → null',
      ].join('\n'),
    });
    assert.equal(identifyTrd(text).id, '77-02');
  });

  test('nothing identifiable → null', () => {
    assert.equal(identifyTrd('Execute quick task 3.\nJob: @.planning/quick/3-fix/3-JOB.md'), null);
    assert.equal(identifyTrd(''), null);
    assert.equal(identifyTrd(null), null);
    assert.equal(identifyTrd(undefined), null);
  });

  test('repoRoot is null when REPO_ROOT is absent', () => {
    assert.deepEqual(identifyTrd('PLAN_ID: 77-02'), { id: '77-02', repoRoot: null });
  });
});

// ─── 10. readFirstUserPrompt ──────────────────────────────────────────────────

/** An fs subset that counts bytes: only openSync/readSync/closeSync exist. */
function spyFs() {
  const stats = { returned: 0, requested: 0, calls: 0 };
  const impl = {
    openSync: (...a) => fs.openSync(...a),
    closeSync: (...a) => fs.closeSync(...a),
    readSync: (fd, buf, off, len, pos) => {
      stats.calls += 1;
      stats.requested += len;
      const n = fs.readSync(fd, buf, off, len, pos);
      stats.returned += n;
      return n;
    },
  };
  return { impl, stats };
}

describe('readFirstUserPrompt', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-read-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('string content', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 's'), 'PLAN_ID: 77-02\nhello');
    assert.equal(readFirstUserPrompt(p), 'PLAN_ID: 77-02\nhello');
  });

  test('array content', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'a'), 'PLAN_ID: 77-02', { contentAsArray: true });
    assert.equal(readFirstUserPrompt(p), 'PLAN_ID: 77-02');
  });

  test('array content: text parts are joined, non-text parts ignored', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'multi'), null, {
      leading: [{
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'part one' },
            { type: 'image', source: { type: 'base64', data: 'AAAA' } },
            { type: 'text', text: 'PLAN_ID: 77-02' },
          ],
        },
      }],
    });
    assert.equal(readFirstUserPrompt(p), 'part one\nPLAN_ID: 77-02');
  });

  test('a leading non-user summary record is skipped', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'lead'), 'PLAN_ID: 77-02', {
      leading: [{ type: 'summary', summary: 'Earlier work on PLAN_ID: 77-09', leafUuid: 'leaf-fixture-1' }],
    });
    assert.equal(readFirstUserPrompt(p), 'PLAN_ID: 77-02');
  });

  test('garbage lines before the user record are skipped', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'garbage'), 'PLAN_ID: 77-02', {
      leading: ['this is not json', '{"truncated": '],
    });
    assert.equal(readFirstUserPrompt(p), 'PLAN_ID: 77-02');
  });

  test('stops at the FIRST user record', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'two'), 'PLAN_ID: 77-02', {
      trailing: [{ type: 'user', message: { role: 'user', content: 'PLAN_ID: 77-05' } }],
    });
    assert.equal(readFirstUserPrompt(p), 'PLAN_ID: 77-02');
  });

  test('no user record / nonexistent / missing path → null', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'none'), null, { leading: ['garbage', '{"type":"summary"}'] });
    assert.equal(readFirstUserPrompt(p), null);
    assert.equal(readFirstUserPrompt(path.join(tmp, 'does-not-exist.jsonl')), null);
    assert.equal(readFirstUserPrompt(undefined), null);
    assert.equal(readFirstUserPrompt(''), null);
  });

  test('2 MiB file, user line inside the first 1 MiB → found, reads ≤ 1 MiB', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'big-ok'), 'PLAN_ID: 77-02', {
      leading: [{ type: 'summary', summary: 's'.repeat(900 * 1024), leafUuid: 'leaf-fixture-2' }],
      padBytes: Math.ceil(1.2 * MiB),
    });
    assert.ok(fs.statSync(p).size > 2 * MiB, 'fixture must exceed 2 MiB');
    const { impl, stats } = spyFs();
    assert.equal(readFirstUserPrompt(p, { fsImpl: impl }), 'PLAN_ID: 77-02');
    assert.ok(stats.returned <= MiB, `returned ${stats.returned} bytes`);
    assert.ok(stats.requested <= MiB, `requested ${stats.requested} bytes`);
  });

  test('user line lies beyond the first 1 MiB → null, and reads ≤ 1 MiB', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'big-far'), 'PLAN_ID: 77-02', {
      leading: [{ type: 'summary', summary: 's'.repeat(1100 * 1024), leafUuid: 'leaf-fixture-3' }],
      padBytes: MiB,
    });
    const { impl, stats } = spyFs();
    assert.equal(readFirstUserPrompt(p, { fsImpl: impl }), null);
    assert.ok(stats.returned <= MiB, `returned ${stats.returned} bytes`);
    assert.ok(stats.requested <= MiB, `requested ${stats.requested} bytes`);
  });

  test('maxBytes is honoured', () => {
    const p = F.writeAgentTranscript(path.join(tmp, 'small-cap'), 'PLAN_ID: 77-02', {
      leading: [{ type: 'summary', summary: 's'.repeat(4096), leafUuid: 'leaf-fixture-4' }],
    });
    const { impl, stats } = spyFs();
    assert.equal(readFirstUserPrompt(p, { maxBytes: 1024, fsImpl: impl }), null);
    assert.ok(stats.requested <= 1024);
  });
});

// ─── 11. summaryExists ────────────────────────────────────────────────────────

describe('summaryExists', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-summary-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('true when <root>/.planning/objectives/*/<id>-SUMMARY.md exists (Progress-only counts)', () => {
    const root = F.makePlanningRepo(path.join(tmp, 'with'), { summaries: ['77-02'] });
    assert.equal(summaryExists('77-02', [root]), true);
  });

  test('false when only the TRD exists', () => {
    const root = F.makePlanningRepo(path.join(tmp, 'without'));
    assert.equal(summaryExists('77-02', [root]), false);
  });

  test('another TRD\'s SUMMARY does not count', () => {
    const root = F.makePlanningRepo(path.join(tmp, 'other'), { trdIds: ['77-01', '77-02'], summaries: ['77-01'] });
    assert.equal(summaryExists('77-02', [root]), false);
  });

  test('a root without .planning/objectives is skipped', () => {
    const bare = path.join(tmp, 'bare');
    fs.mkdirSync(bare, { recursive: true });
    const withSummary = F.makePlanningRepo(path.join(tmp, 'with2'), { objectiveDir: '77-y', summaries: ['77-02'] });
    assert.equal(summaryExists('77-02', [bare, path.join(tmp, 'missing'), withSummary]), true);
    assert.equal(summaryExists('77-02', [bare]), false);
    assert.equal(summaryExists('77-02', []), false);
  });

  test('an unreadable objectives dir is skipped, other roots still checked', () => {
    const a = F.makePlanningRepo(path.join(tmp, 'unreadable'));
    const b = F.makePlanningRepo(path.join(tmp, 'readable'), { summaries: ['77-02'] });
    const fsImpl = {
      ...fs,
      readdirSync: (p, ...rest) => {
        if (p.startsWith(a)) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        return fs.readdirSync(p, ...rest);
      },
    };
    assert.equal(summaryExists('77-02', [a, b], fsImpl), true);
    assert.equal(summaryExists('77-02', [a], fsImpl), false);
  });
});

// ─── candidateRoots ───────────────────────────────────────────────────────────

describe('candidateRoots', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-roots-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('project root is found by walking up from cwd', () => {
    const root = F.makePlanningRepo(path.join(tmp, 'proj'));
    const sub = path.join(root, 'src', 'deep');
    fs.mkdirSync(sub, { recursive: true });
    const roots = candidateRoots({ cwd: sub, repoRoot: null, gitWorktrees: () => [] });
    assert.ok(roots.includes(root), JSON.stringify(roots));
  });

  test('REPO_ROOT from the prompt is included alongside cwd', () => {
    const a = F.makePlanningRepo(path.join(tmp, 'cwd-root'));
    const b = F.makePlanningRepo(path.join(tmp, 'named-root'));
    const roots = candidateRoots({ cwd: a, repoRoot: b, gitWorktrees: () => [] });
    assert.ok(roots.includes(a) && roots.includes(b), JSON.stringify(roots));
  });

  test('a linked worktree (.git file) adds its main checkout', () => {
    const main = F.makePlanningRepo(path.join(tmp, 'main'));
    fs.mkdirSync(path.join(main, '.git', 'worktrees', 'wt1'), { recursive: true });
    const wt = F.makePlanningRepo(path.join(tmp, 'wt1'));
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${path.join(main, '.git', 'worktrees', 'wt1')}\n`);
    const roots = candidateRoots({ cwd: wt, repoRoot: null, gitWorktrees: () => [] });
    assert.ok(roots.includes(wt) && roots.includes(main), JSON.stringify(roots));
  });

  test('gitWorktrees entries are added, with ONE call for REPO_ROOT', () => {
    const main = F.makePlanningRepo(path.join(tmp, 'main2'));
    const w1 = path.join(tmp, 'w-a');
    const w2 = path.join(tmp, 'w-b');
    const calls = [];
    const roots = candidateRoots({ cwd: main, repoRoot: main, gitWorktrees: (r) => { calls.push(r); return [main, w1, w2]; } });
    assert.deepEqual(calls, [main]);
    assert.ok(roots.includes(w1) && roots.includes(w2), JSON.stringify(roots));
  });

  test('gitWorktrees throwing is tolerated', () => {
    const root = F.makePlanningRepo(path.join(tmp, 'throws'));
    const roots = candidateRoots({ cwd: root, repoRoot: root, gitWorktrees: () => { throw new Error('git missing'); } });
    assert.ok(roots.includes(root));
  });

  test('roots are de-duplicated', () => {
    const root = F.makePlanningRepo(path.join(tmp, 'dup'));
    const roots = candidateRoots({ cwd: root, repoRoot: root, gitWorktrees: () => [root, `${root}/`] });
    assert.equal(roots.filter((r) => r === root).length, 1, JSON.stringify(roots));
    assert.equal(new Set(roots).size, roots.length);
  });
});

// ─── isDeliberateStop ─────────────────────────────────────────────────────────

describe('isDeliberateStop', () => {
  test('structured returns and exec-context hard stops are deliberate', () => {
    assert.equal(isDeliberateStop('## CHECKPOINT REACHED\n\n**Type:** human-verify'), true);
    assert.equal(isDeliberateStop('## ESCALATION REQUESTED\n\n**Trigger:** tests-red-after-2'), true);
    assert.equal(isDeliberateStop('Preflight failed: WRONG REPOSITORY — rooted in /other'), true);
    assert.equal(isDeliberateStop('exec-context: BASE NOT VISIBLE'), true);
    assert.equal(isDeliberateStop('exec-context: SHARED INDEX with 77-01'), true);
  });

  test('ordinary messages are not', () => {
    assert.equal(isDeliberateStop('Task 2 committed. Stopping here.'), false);
    assert.equal(isDeliberateStop(''), false);
    assert.equal(isDeliberateStop(undefined), false);
    assert.equal(isDeliberateStop(null), false);
  });
});
