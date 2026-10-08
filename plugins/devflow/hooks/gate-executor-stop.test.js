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

  // TRD 53-02: the same pairing rule as roadmap-reconcile and the df-tools readers.
  // `<id>-SUMMARY.md` is what the hook asks the executor to write; a named
  // `<id>-<slug>-SUMMARY.md` counts too. The id is a key, not a string prefix.
  function withObjectiveFiles(name, files) {
    const root = path.join(tmp, name);
    const dir = path.join(root, '.planning', 'objectives', '07-demo');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), '# x\n');
    return root;
  }

  test('53-02: a named <id>-<slug>-SUMMARY.md counts for <id>', () => {
    const root = withObjectiveFiles('named', ['07-01-alpha-TRD.md', '07-01-alpha-SUMMARY.md']);
    assert.equal(summaryExists('07-01', [root]), true);
  });

  test('53-02: the exact <id>-SUMMARY.md still counts beside a named TRD', () => {
    const root = withObjectiveFiles('exact', ['07-01-alpha-TRD.md', '07-01-SUMMARY.md']);
    assert.equal(summaryExists('07-01', [root]), true);
  });

  test('53-02: 07-010-SUMMARY.md and 07-01x-SUMMARY.md do not count for 07-01', () => {
    const root = withObjectiveFiles('prefix', ['07-010-SUMMARY.md', '07-01x-SUMMARY.md', '07-011-alpha-SUMMARY.md']);
    assert.equal(summaryExists('07-01', [root]), false);
  });

  test('53-02: another TRD\'s named summary does not count', () => {
    const root = withObjectiveFiles('other-named', ['07-01-alpha-TRD.md', '07-02-beta-SUMMARY.md']);
    assert.equal(summaryExists('07-01', [root]), false);
  });

  test('53-02: a decimal id is matched literally (the dot is not a wildcard)', () => {
    const decimal = withObjectiveFiles('decimal', ['07.1-02-x-SUMMARY.md']);
    assert.equal(summaryExists('07.1-02', [decimal]), true);
    const wildcard = withObjectiveFiles('decimal-wild', ['07x1-02-SUMMARY.md']);
    assert.equal(summaryExists('07.1-02', [wildcard]), false);
  });

  // TRD 56-01 (ONUM-01): the id is escaped with the shared text-escape.cjs escapeRegExp.
  test('56-01 #10: 12.1-03 matches only its own literal id, exact or named', () => {
    const lookalikes = withObjectiveFiles('decimal-lookalikes', ['1201-03-SUMMARY.md', '12x1-03-SUMMARY.md']);
    assert.equal(summaryExists('12.1-03', [lookalikes]), false);
    const named = withObjectiveFiles('decimal-named', ['1201-03-SUMMARY.md', '12.1-03-x-SUMMARY.md']);
    assert.equal(summaryExists('12.1-03', [named]), true);
  });

  test('53-02: an fsImpl without readdirSync on objective dirs keeps the exact-name path', () => {
    const root = F.makePlanningRepo(path.join(tmp, 'mock-exact'), { summaries: ['77-02'] });
    const objectivesDir = path.join(root, '.planning', 'objectives');
    const fsImpl = {
      ...fs,
      readdirSync: (p, ...rest) => {
        if (p === objectivesDir) return fs.readdirSync(p, ...rest);
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      },
    };
    assert.equal(summaryExists('77-02', [root], fsImpl), true);
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

// ─── decide() (unit) ──────────────────────────────────────────────────────────

const { spawnSync } = require('child_process');
const { decide, gitWorktrees } = require('./gate-executor-stop.js');

/** A fixture project with 77-02-TRD.md and a transcript whose first prompt dispatches 77-02. */
function makeExecutorScenario(root, { summaries = [], promptOpts = {}, transcriptOpts = {} } = {}) {
  F.makePlanningRepo(root, { summaries });
  const prompt = F.executorPrompt({ planId: '77-02', repoRoot: root, ...promptOpts });
  const transcript = F.writeAgentTranscript(path.join(root, 'transcripts'), prompt, transcriptOpts);
  const payload = F.subagentStopPayload({ cwd: root, agent_transcript_path: transcript });
  return { root, transcript, payload };
}

describe('decide', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-decide-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const deps = (extra = {}) => ({ env: {}, gitWorktrees: () => [], ...extra });

  test('executor, natural stop, no SUMMARY → block with an actionable reason', () => {
    const { payload } = makeExecutorScenario(path.join(tmp, 'block'));
    const d = decide(payload, deps());
    assert.equal(d.block, true);
    assert.match(d.reason, /77-02/);
    assert.match(d.reason, /77-02-SUMMARY\.md/);
    assert.match(d.reason, /## Progress/);
    assert.match(d.reason, /df-tools commit/);
  });

  test('env escape hatch wins over everything', () => {
    const { payload } = makeExecutorScenario(path.join(tmp, 'env'));
    assert.equal(decide(payload, deps({ env: { DEVFLOW_SKIP_EXECUTOR_STOP_GATE: '1' } })), null);
  });

  test('stop_hook_active true → null (the once-guard)', () => {
    const { payload } = makeExecutorScenario(path.join(tmp, 'active'));
    assert.equal(decide({ ...payload, stop_hook_active: true }, deps()), null);
  });

  test('test 5 (unit): SUMMARY only in a linked worktree from injected gitWorktrees → null', () => {
    const { payload } = makeExecutorScenario(path.join(tmp, 'wt-main'));
    const wt = F.makePlanningRepo(path.join(tmp, 'wt-linked'), { trdIds: [], summaries: ['77-02'] });
    const calls = [];
    const d = decide(payload, deps({ gitWorktrees: (r) => { calls.push(r); return [wt]; } }));
    assert.equal(d, null);
    assert.equal(calls.length, 1, 'exactly one gitWorktrees call');
    assert.ok(decide(payload, deps({ gitWorktrees: () => [] })).block, 'control: blocks without the worktree');
  });

  test('gitWorktrees throwing still checks the other roots', () => {
    const { payload } = makeExecutorScenario(path.join(tmp, 'wt-throws'));
    const d = decide(payload, deps({ gitWorktrees: () => { throw new Error('no git'); } }));
    assert.equal(d.block, true);
  });

  test('payload.cwd missing → deps.cwd is used', () => {
    const { root, payload } = makeExecutorScenario(path.join(tmp, 'nocwd'));
    const p = { ...payload };
    delete p.cwd;
    assert.equal(decide(p, deps({ cwd: root })).block, true);
    assert.equal(decide(p, deps({ cwd: path.join(tmp) })), null, 'no .planning up from tmp → null');
  });

  test('null / non-object payload → null', () => {
    assert.equal(decide(null, deps()), null);
    assert.equal(decide('nope', deps()), null);
  });
});

// ─── TRD 44-10: the block reason names the concrete SUMMARY path ─────────────
//
// Live E2E 2026-09-29: an executor told "the TRD's SUMMARY.md" wrote
// 99-01-SUMMARY.md at the repo root, where neither this gate nor the
// orchestrator looks. When the TRD file can be located, name the exact path.

const { trdDirFor } = require('./gate-executor-stop.js');

/** Today's reason when no TRD file is found — kept verbatim (TRD 44-10). */
function genericReason(id) {
  return [
    `DevFlow: you are stopping, but TRD ${id} has no ${id}-SUMMARY.md.`,
    'If work remains, continue it now (commit each finished task with df-tools commit).',
    "If you must stop, first write the ## Progress checkpoint to the TRD's SUMMARY.md",
    '(tasks done with hashes, the next concrete step) and commit it, then stop.',
    'If you stopped on purpose (checkpoint, escalation, exec-context hard stop), repeat that',
    'structured return verbatim and stop without writing files.',
    'Never use port 8080.',
  ].join(' ');
}

/** A 99-01 executor scenario: `trdIn` holds 99-demo/99-01-TRD.md (or nothing), cwd is `root`. */
function makeDemoScenario(root, { trdIn = root, repoRoot = root } = {}) {
  F.makePlanningRepo(root, { objectiveDir: '99-demo', trdIds: trdIn === root ? ['99-01'] : [] });
  if (trdIn !== root && trdIn) F.makePlanningRepo(trdIn, { objectiveDir: '99-demo', trdIds: ['99-01'] });
  const prompt = F.executorPrompt({ planId: '99-01', repoRoot });
  const transcript = F.writeAgentTranscript(path.join(root, 'transcripts'), prompt);
  return { root, payload: F.subagentStopPayload({ cwd: root, agent_transcript_path: transcript }) };
}

describe('trdDirFor (TRD 44-10)', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-trddir-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('returns <root>/.planning/objectives/<dir> holding <id>-TRD.md', () => {
    const root = F.makePlanningRepo(path.join(tmp, 'found'), { objectiveDir: '99-demo', trdIds: ['99-01'] });
    assert.equal(trdDirFor('99-01', [root]), path.join(root, '.planning', 'objectives', '99-demo'));
  });

  test('null when no root holds the TRD; roots without objectives are skipped', () => {
    const other = F.makePlanningRepo(path.join(tmp, 'other'), { objectiveDir: '99-demo', trdIds: ['99-02'] });
    const bare = path.join(tmp, 'bare');
    fs.mkdirSync(bare, { recursive: true });
    assert.equal(trdDirFor('99-01', [bare, path.join(tmp, 'missing'), other]), null);
    assert.equal(trdDirFor('99-01', []), null);
    assert.equal(trdDirFor('', [other]), null);
    assert.equal(trdDirFor('99-01', null), null);
  });

  test('the first root holding the TRD wins; a later root is still searched', () => {
    const empty = F.makePlanningRepo(path.join(tmp, 'empty'), { trdIds: [] });
    const a = F.makePlanningRepo(path.join(tmp, 'a'), { objectiveDir: '99-demo', trdIds: ['99-01'] });
    const b = F.makePlanningRepo(path.join(tmp, 'b'), { objectiveDir: '99-other', trdIds: ['99-01'] });
    assert.equal(trdDirFor('99-01', [empty, a, b]), path.join(a, '.planning', 'objectives', '99-demo'));
    assert.equal(trdDirFor('99-01', [empty, b, a]), path.join(b, '.planning', 'objectives', '99-other'));
  });

  test('an unreadable objectives dir is skipped (fail-open)', () => {
    const a = F.makePlanningRepo(path.join(tmp, 'unreadable'), { objectiveDir: '99-demo', trdIds: ['99-01'] });
    const b = F.makePlanningRepo(path.join(tmp, 'readable'), { objectiveDir: '99-demo', trdIds: ['99-01'] });
    const fsImpl = {
      ...fs,
      readdirSync: (p, ...rest) => {
        if (p.startsWith(a)) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        return fs.readdirSync(p, ...rest);
      },
    };
    assert.equal(trdDirFor('99-01', [a, b], fsImpl), path.join(b, '.planning', 'objectives', '99-demo'));
    assert.equal(trdDirFor('99-01', [a], fsImpl), null);
  });
});

describe('decide: block reason names the SUMMARY path (TRD 44-10)', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-reason-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const deps = (extra = {}) => ({ env: {}, gitWorktrees: () => [], ...extra });
  const REL = '.planning/objectives/99-demo/99-01-SUMMARY.md';

  test('TRD file found under cwd → reason names the repo-relative SUMMARY path', () => {
    const { payload } = makeDemoScenario(path.join(tmp, 'found'));
    const d = decide(payload, deps());
    assert.equal(d.block, true);
    assert.ok(d.reason.includes(REL), d.reason);
    assert.ok(d.reason.includes(`write the ## Progress checkpoint to ${REL}`), d.reason);
    assert.ok(!d.reason.includes("the TRD's SUMMARY.md"), 'concrete path replaces the generic wording');
    assert.ok(!d.reason.includes(tmp), 'repo-relative, never the absolute fixture path');
    assert.match(d.reason, /## Progress/);
    assert.match(d.reason, /df-tools commit/);
    assert.match(d.reason, /Never use port 8080\./);
  });

  test('TRD file found only under REPO_ROOT (another candidate root) → still named', () => {
    const named = path.join(tmp, 'named-root');
    const { payload } = makeDemoScenario(path.join(tmp, 'cwd-no-trd'), { trdIn: named, repoRoot: named });
    const d = decide(payload, deps());
    assert.equal(d.block, true);
    assert.ok(d.reason.includes(REL), d.reason);
  });

  test('no TRD file anywhere (id from the prompt only) → still blocks, generic wording unchanged', () => {
    const { payload } = makeDemoScenario(path.join(tmp, 'no-trd'), { trdIn: null });
    const d = decide(payload, deps());
    assert.equal(d.block, true);
    assert.equal(d.reason, genericReason('99-01'));
  });

  test('once-guard and SUMMARY-present short-circuits are unchanged', () => {
    const { root, payload } = makeDemoScenario(path.join(tmp, 'guards'));
    assert.equal(decide({ ...payload, stop_hook_active: true }, deps()), null);
    F.makePlanningRepo(root, { objectiveDir: '99-demo', trdIds: [], summaries: ['99-01'] });
    assert.equal(decide(payload, deps()), null);
  });
});

// ─── gitWorktrees (real git) ──────────────────────────────────────────────────

describe('gitWorktrees (real git)', () => {
  let tmp;
  let hasGit = true;
  before(() => {
    tmp = mkTmp('ges-git-');
    hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
  });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const git = (cwd, args) => {
    const r = spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r;
  };

  test('lists every worktree of the repo; [] for a non-repo', (t) => {
    if (!hasGit) { t.skip('git not installed'); return; }
    const main = path.join(tmp, 'main');
    fs.mkdirSync(main, { recursive: true });
    git(main, ['init', '-q']);
    git(main, ['commit', '-q', '--allow-empty', '-m', 'init']);
    const wt = path.join(tmp, 'wt-a');
    git(main, ['worktree', 'add', '-q', '-b', 'fixture-branch', wt]);

    const list = gitWorktrees(main).map((p) => fs.realpathSync(p));
    assert.ok(list.includes(fs.realpathSync(main)), JSON.stringify(list));
    assert.ok(list.includes(fs.realpathSync(wt)), JSON.stringify(list));
    assert.deepEqual(gitWorktrees(path.join(tmp, 'not-a-repo')), []);
  });

  test('e2e: SUMMARY only in a real linked worktree → no block', (t) => {
    if (!hasGit) { t.skip('git not installed'); return; }
    const main = path.join(tmp, 'main2');
    fs.mkdirSync(main, { recursive: true });
    git(main, ['init', '-q']);
    git(main, ['commit', '-q', '--allow-empty', '-m', 'init']);
    const wt = path.join(tmp, 'wt-b');
    git(main, ['worktree', 'add', '-q', '-b', 'fixture-branch-2', wt]);
    const { payload } = makeExecutorScenario(main);

    const control = runHook(payload, { cwd: main });
    assert.equal(JSON.parse(control.stdout || '{}').decision, 'block', `control: blocks before the worktree has a SUMMARY (${control.stderr})`);
    F.makePlanningRepo(wt, { trdIds: [], summaries: ['77-02'] });
    const r = runHook(payload, { cwd: main });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

// ─── E2E: spawn the hook with a stdin payload (tests 1-8) ─────────────────────

const HOOK_PATH = path.join(__dirname, 'gate-executor-stop.js');

function runHook(payload, { cwd, env = {} } = {}) {
  const baseEnv = { ...process.env };
  delete baseEnv.DEVFLOW_SKIP_EXECUTOR_STOP_GATE;
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...baseEnv, ...env },
    timeout: 15000,
  });
}

function assertSilent(r, label) {
  assert.equal(r.status, 0, `${label}: exit ${r.status} stderr=${r.stderr}`);
  assert.equal(r.stdout, '', `${label}: expected no output, got ${r.stdout}`);
}

describe('e2e: gate-executor-stop.js as a SubagentStop hook', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-e2e-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('1. executor, stop_hook_active false, no SUMMARY → one top-level block', () => {
    const { root, payload } = makeExecutorScenario(path.join(tmp, 't1'));
    const r = runHook(payload, { cwd: root });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason'], 'top-level shape, no hookSpecificOutput');
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /77-02/);
    assert.match(out.reason, /SUMMARY\.md/);
    assert.match(out.reason, /## Progress/);
  });

  test('1b. payload.cwd absent → falls back to the process cwd', () => {
    const { root, payload } = makeExecutorScenario(path.join(tmp, 't1b'));
    const r = runHook({ ...payload, cwd: undefined }, { cwd: root });
    assert.equal(JSON.parse(r.stdout).decision, 'block');
  });

  test('2. stop_hook_active true → no output', () => {
    const { root, payload } = makeExecutorScenario(path.join(tmp, 't2'));
    assertSilent(runHook({ ...payload, stop_hook_active: true }, { cwd: root }), 'stop_hook_active');
  });

  test('3. non-executor or missing agent_type → no output', () => {
    const { root, payload } = makeExecutorScenario(path.join(tmp, 't3'));
    assertSilent(runHook({ ...payload, agent_type: 'devflow:verifier' }, { cwd: root }), 'verifier');
    assertSilent(runHook({ ...payload, agent_type: 'general-purpose' }, { cwd: root }), 'general-purpose');
    assertSilent(runHook(F.subagentStopPayload({ ...payload, agent_type: undefined }), { cwd: root }), 'missing');
  });

  test('4. SUMMARY exists with only ## Progress → no output', () => {
    const { root, payload } = makeExecutorScenario(path.join(tmp, 't4'), { summaries: ['77-02'] });
    assertSilent(runHook(payload, { cwd: root }), 'progress-only summary');
  });

  test('5. SUMMARY only under REPO_ROOT while payload.cwd is elsewhere → no block', () => {
    const named = F.makePlanningRepo(path.join(tmp, 't5-named'), { summaries: ['77-02'] });
    const { root, payload } = makeExecutorScenario(path.join(tmp, 't5-cwd'), { promptOpts: { repoRoot: named } });
    assertSilent(runHook(payload, { cwd: root }), 'summary under REPO_ROOT');

    const empty = F.makePlanningRepo(path.join(tmp, 't5-empty'));
    const ctl = makeExecutorScenario(path.join(tmp, 't5-ctl'), { promptOpts: { repoRoot: empty } });
    assert.equal(JSON.parse(runHook(ctl.payload, { cwd: ctl.root }).stdout).decision, 'block', 'control');
  });

  test('6. no .planning up from cwd → no output; env escape hatch → no output', () => {
    const bare = path.join(tmp, 't6-bare');
    const transcript = F.writeAgentTranscript(bare, F.executorPrompt({ planId: '77-02', repoRoot: bare }));
    assertSilent(runHook(F.subagentStopPayload({ cwd: bare, agent_transcript_path: transcript }), { cwd: bare }), 'no .planning');

    const { root, payload } = makeExecutorScenario(path.join(tmp, 't6-env'));
    assertSilent(runHook(payload, { cwd: root, env: { DEVFLOW_SKIP_EXECUTOR_STOP_GATE: '1' } }), 'escape hatch');
  });

  test('7. transcript missing, nonexistent or garbage → no output', () => {
    const { root, payload } = makeExecutorScenario(path.join(tmp, 't7'));
    assertSilent(runHook({ ...payload, agent_transcript_path: undefined }, { cwd: root }), 'missing path');
    assertSilent(runHook({ ...payload, agent_transcript_path: path.join(root, 'nope.jsonl') }, { cwd: root }), 'nonexistent');
    const garbage = F.writeAgentTranscript(path.join(root, 'garbage'), null, { leading: ['garbage line', '{"type":"user",', '\u0000\u0001'] });
    assertSilent(runHook({ ...payload, agent_transcript_path: garbage }, { cwd: root }), 'garbage');
  });

  test('8. deliberate stops → no output', () => {
    const { root, payload } = makeExecutorScenario(path.join(tmp, 't8'));
    assertSilent(runHook({ ...payload, last_assistant_message: '## CHECKPOINT REACHED\n\n**Type:** human-verify' }, { cwd: root }), 'checkpoint');
    assertSilent(runHook({ ...payload, last_assistant_message: 'exec-context check failed: WRONG REPOSITORY (/elsewhere)' }, { cwd: root }), 'wrong repo');
    assertSilent(runHook({ ...payload, last_assistant_message: '## ESCALATION REQUESTED\n\n**Trigger:** tests-red-after-2' }, { cwd: root }), 'escalation');
  });

  test('unidentifiable or ambiguous TRD → no output', () => {
    const root = F.makePlanningRepo(path.join(tmp, 't-id'));
    const quick = F.writeAgentTranscript(path.join(root, 'q'), 'Execute quick task 3.\nJob: @.planning/quick/3-fix/3-JOB.md');
    assertSilent(runHook(F.subagentStopPayload({ cwd: root, agent_transcript_path: quick }), { cwd: root }), 'quick-style');
    const ambiguous = F.writeAgentTranscript(path.join(root, 'amb'), 'PLAN_ID: 77-02\n  node df-tools.cjs exec-context check --repo /r --base b --id 77-03');
    assertSilent(runHook(F.subagentStopPayload({ cwd: root, agent_transcript_path: ambiguous }), { cwd: root }), 'ambiguous');
  });

  test('TRD 44-10: the spawned hook names the concrete SUMMARY path, or keeps the generic text', () => {
    const found = makeDemoScenario(path.join(tmp, 't-path-found'));
    const r = runHook(found.payload, { cwd: found.root });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, 'block');
    assert.ok(out.reason.includes('write the ## Progress checkpoint to .planning/objectives/99-demo/99-01-SUMMARY.md'), out.reason);

    const none = makeDemoScenario(path.join(tmp, 't-path-none'), { trdIn: null });
    const r2 = runHook(none.payload, { cwd: none.root });
    assert.equal(r2.status, 0, r2.stderr);
    const out2 = JSON.parse(r2.stdout);
    assert.equal(out2.decision, 'block');
    assert.equal(out2.reason, genericReason('99-01'));
  });

  test('bad stdin (not JSON, empty) → no output, exit 0', () => {
    const root = F.makePlanningRepo(path.join(tmp, 't-stdin'));
    assertSilent(runHook('{not json', { cwd: root }), 'not json');
    assertSilent(runHook('', { cwd: root }), 'empty');
  });
});

// ─── TRD 66-02: a final SUMMARY without token fields (EST-09) ─────────────────
//
// 64-09 and 64-10 ran `summary post` without `tokens stamp`. The gate that
// already sends an executor back once when its TRD has no SUMMARY now does the
// same when the FINAL SUMMARY (one with a `## Self-Check` heading) carries no
// tokens_input/tokens_output. A `## Progress` checkpoint is never blocked.

/**
 * A fixture project whose 77-02 SUMMARY is of the given fixture kind (none when
 * `kind` is null), plus a transcript whose first prompt dispatches 77-02.
 */
function makeTokenScenario(root, { kind = 'final_unstamped', promptOpts = {}, transcriptOpts = {} } = {}) {
  F.makePlanningRepo(root, {
    summaries: kind ? ['77-02'] : [],
    summaryKinds: kind ? { '77-02': kind } : {},
  });
  const prompt = F.executorPrompt({ planId: '77-02', repoRoot: root, ...promptOpts });
  const transcript = F.writeAgentTranscript(path.join(root, 'transcripts'), prompt, transcriptOpts);
  const payload = F.subagentStopPayload({ cwd: root, agent_transcript_path: transcript });
  return { root, payload, objectiveDir: path.join(root, '.planning', 'objectives', '77-x') };
}

describe('66-02 e2e: final SUMMARY without token fields', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-66-e2e-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('1. final SUMMARY with no token fields gives one top-level block naming the stamp commands', () => {
    const { root, payload } = makeTokenScenario(path.join(tmp, 't1'));
    const r = runHook(payload, { cwd: root });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason'], 'top-level shape, no hookSpecificOutput');
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /77-02/);
    assert.match(out.reason, /tokens_input/);
    assert.match(out.reason, /tokens stamp 77-02 --draft/);
    assert.match(out.reason, /summary post 77-02 --from/);
    assert.match(out.reason, /planning draft objectives\/77-x\/77-02-SUMMARY\.md/);
    assert.match(out.reason, /stamped: false/);
    assert.match(out.reason, /never type token numbers by hand/i);
    assert.match(out.reason, /8080/);
  });

  test('2. final SUMMARY with live token fields gives no output', () => {
    const { root, payload } = makeTokenScenario(path.join(tmp, 't2'), { kind: 'final_stamped' });
    assertSilent(runHook(payload, { cwd: root }), 'stamped final summary');
  });

  test('3. the same unstamped final SUMMARY with stop_hook_active gives no output (the once-guard)', () => {
    const { root, payload } = makeTokenScenario(path.join(tmp, 't3'));
    assert.equal(JSON.parse(runHook(payload, { cwd: root }).stdout).decision, 'block', 'control');
    assertSilent(runHook({ ...payload, stop_hook_active: true }, { cwd: root }), 'stop_hook_active');
  });
});

describe('66-02 decide: the token branch', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-66-decide-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const deps = (extra = {}) => ({ env: {}, gitWorktrees: () => [], ...extra });

  test('4. final + backfill-stamped gives null: the gate checks presence, not source', () => {
    const { payload } = makeTokenScenario(path.join(tmp, 't4'), { kind: 'final_backfill' });
    assert.equal(decide(payload, deps()), null);
  });

  test('5. a ## Progress checkpoint with no token fields gives null (44-04 semantics kept)', () => {
    const { payload } = makeTokenScenario(path.join(tmp, 't5'), { kind: 'checkpoint' });
    assert.equal(decide(payload, deps()), null);
  });

  test('6. only commented template lines (# tokens_input: N) still blocks', () => {
    const { payload } = makeTokenScenario(path.join(tmp, 't6'), { kind: 'final_template_comments' });
    const d = decide(payload, deps());
    assert.equal(d.block, true);
    assert.match(d.reason, /tokens stamp 77-02 --draft/);
  });

  test('7. tokens_input without tokens_output blocks: both fields are required', () => {
    const { payload } = makeTokenScenario(path.join(tmp, 't7'), { kind: 'final_input_only' });
    assert.equal(decide(payload, deps()).block, true);
  });

  test('8. a slugged <id>-<slug>-SUMMARY.md is found and named in the planning draft path', () => {
    const unstamped = makeTokenScenario(path.join(tmp, 't8-block'), { kind: null });
    fs.writeFileSync(path.join(unstamped.objectiveDir, '77-02-fixture-SUMMARY.md'), F.summaryText('final_unstamped', '77-02'));
    const d = decide(unstamped.payload, deps());
    assert.equal(d.block, true);
    assert.ok(d.reason.includes('planning draft objectives/77-x/77-02-fixture-SUMMARY.md'), d.reason);

    const stamped = makeTokenScenario(path.join(tmp, 't8-pass'), { kind: null });
    fs.writeFileSync(path.join(stamped.objectiveDir, '77-02-fixture-SUMMARY.md'), F.summaryText('final_stamped', '77-02'));
    assert.equal(decide(stamped.payload, deps()), null);
  });

  test('9. two roots: any stamped final passes, an unstamped final in a worktree alone blocks', () => {
    const main = makeTokenScenario(path.join(tmp, 't9-main'), { kind: 'final_unstamped' });
    const stampedWt = F.makePlanningRepo(path.join(tmp, 't9-wt-stamped'), {
      trdIds: [], summaries: ['77-02'], summaryKinds: { '77-02': 'final_stamped' },
    });
    assert.equal(decide(main.payload, deps({ gitWorktrees: () => [stampedWt] })), null, 'stamped worktree final passes');
    assert.equal(decide(main.payload, deps({ gitWorktrees: () => [] })).block, true, 'control: main alone blocks');

    const bare = makeTokenScenario(path.join(tmp, 't9-bare'), { kind: null });
    const unstampedWt = F.makePlanningRepo(path.join(tmp, 't9-wt-unstamped'), {
      trdIds: [], summaries: ['77-02'], summaryKinds: { '77-02': 'final_unstamped' },
    });
    const d = decide(bare.payload, deps({ gitWorktrees: () => [unstampedWt] }));
    assert.equal(d.block, true, 'unstamped final in the worktree, none in main');
    assert.match(d.reason, /planning draft objectives\/77-x\/77-02-SUMMARY\.md/);
  });

  test('10. a deliberate stop with an unstamped final gives null', () => {
    const { payload } = makeTokenScenario(path.join(tmp, 't10'));
    assert.equal(decide({ ...payload, last_assistant_message: '## CHECKPOINT REACHED\n\n**Type:** human-verify' }, deps()), null);
  });

  test('11. DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1 with an unstamped final gives null', () => {
    const { payload } = makeTokenScenario(path.join(tmp, 't11'));
    assert.equal(decide(payload, deps({ env: { DEVFLOW_SKIP_EXECUTOR_STOP_GATE: '1' } })), null);
  });

  test('12. an unreadable SUMMARY gives null and does not throw', () => {
    const { payload } = makeTokenScenario(path.join(tmp, 't12'));
    const fsImpl = {
      ...fs,
      readFileSync: (p, ...rest) => {
        if (String(p).endsWith('-SUMMARY.md')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        return fs.readFileSync(p, ...rest);
      },
    };
    assert.doesNotThrow(() => decide(payload, deps({ fsImpl })));
    assert.equal(decide(payload, deps({ fsImpl })), null);
    assert.equal(decide(payload, deps()).block, true, 'control: readable, it blocks');
  });

  test('13. a continuation-shaped first prompt identifies the TRD and the gate applies', () => {
    const root = path.join(tmp, 't13');
    const { payload } = makeTokenScenario(root, {
      promptOpts: {
        extra: [
          'Execute TRD 77-02 (continuation after a checkpoint)',
          '<completed_tasks>',
          '| 1 | Fixture kinds | abc1234 | fixtures.js |',
          '</completed_tasks>',
        ].join('\n'),
      },
    });
    const d = decide(payload, deps());
    assert.equal(d.block, true);
    assert.match(d.reason, /tokens stamp 77-02 --draft/);
  });

  test('a decimal objective id (12.1-03) is checked like any other', () => {
    const root = path.join(tmp, 't13b');
    F.makePlanningRepo(root, { objectiveDir: '12.1-x', trdIds: ['12.1-03'], summaries: ['12.1-03'], summaryKinds: { '12.1-03': 'final_unstamped' } });
    const prompt = F.executorPrompt({ planId: '12.1-03', repoRoot: root });
    const transcript = F.writeAgentTranscript(path.join(root, 'transcripts'), prompt);
    const payload = F.subagentStopPayload({ cwd: root, agent_transcript_path: transcript });
    const d = decide(payload, deps());
    assert.equal(d.block, true);
    assert.match(d.reason, /planning draft objectives\/12\.1-x\/12\.1-03-SUMMARY\.md/);
  });
});

describe('66-02 helpers: hasTokenFields, isFinalSummary, summaryFiles', () => {
  let tmp;
  before(() => { tmp = mkTmp('ges-66-helpers-'); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('14a. hasTokenFields: true only when the frontmatter holds both numeric fields', () => {
    const has = (text) => require('./gate-executor-stop.js').hasTokenFields(text);
    assert.equal(has(F.summaryText('final_stamped', '77-02')), true);
    assert.equal(has(F.summaryText('final_backfill', '77-02')), true, 'source is not inspected');
    assert.equal(has(F.summaryText('final_unstamped', '77-02')), false);
    assert.equal(has(F.summaryText('final_template_comments', '77-02')), false, 'commented lines never count');
    assert.equal(has(F.summaryText('final_input_only', '77-02')), false);
    assert.equal(has(F.summaryText('checkpoint', '77-02')), false, 'no frontmatter');
    assert.equal(has('---\ntokens_input: 5\ntokens_output: x\n---\n'), false, 'a non-numeric value');
    assert.equal(has('---\ntokens_input: 5\n---\n\ntokens_output: 6\n'), false, 'a field in the body is not frontmatter');
    assert.equal(has('---\r\ntokens_input: 5\r\ntokens_output: 6\r\n---\r\n'), true, 'CRLF frontmatter');
    assert.equal(has('---\ntokens_input:   5  \ntokens_output:\t6\t\n---\n'), true, 'blanks around the number');
    assert.equal(has(undefined), false);
    assert.equal(has(null), false);
  });

  test('14b. isFinalSummary: true iff a line starts with the ## Self-Check heading', () => {
    const fin = (text) => require('./gate-executor-stop.js').isFinalSummary(text);
    assert.equal(fin(F.summaryText('final_unstamped', '77-02')), true);
    assert.equal(fin('## Self-Check\n'), true, 'bare heading');
    assert.equal(fin(F.summaryText('checkpoint', '77-02')), false);
    assert.equal(fin('see the ## Self-Check section\n'), false, 'a mention is not a heading');
    assert.equal(fin('## Self-Checked\n'), false, 'a different word');
    assert.equal(fin(undefined), false);
  });

  test('14c. summaryFiles: absolute, de-duplicated, whole-id, exact and slugged names across roots', () => {
    const { summaryFiles } = require('./gate-executor-stop.js');
    const make = (name, files) => {
      const root = path.join(tmp, name);
      const dir = path.join(root, '.planning', 'objectives', '77-x');
      fs.mkdirSync(dir, { recursive: true });
      for (const f of files) fs.writeFileSync(path.join(dir, f), '# x\n');
      return { root, dir };
    };
    const a = make('a', ['77-02-SUMMARY.md', '77-02-fixture-SUMMARY.md', '77-020-SUMMARY.md', '77-02x-SUMMARY.md', '77-03-SUMMARY.md', '77-02-TRD.md']);
    const b = make('b', ['77-02-other-SUMMARY.md']);
    const got = summaryFiles('77-02', [a.root, b.root, a.root]);
    assert.deepEqual(
      [...got].sort(),
      [path.join(a.dir, '77-02-SUMMARY.md'), path.join(a.dir, '77-02-fixture-SUMMARY.md'), path.join(b.dir, '77-02-other-SUMMARY.md')].sort(),
    );
    assert.ok(got.every((f) => path.isAbsolute(f)), 'absolute paths');
    assert.equal(new Set(got).size, got.length, 'no duplicates');
    assert.ok(got.indexOf(path.join(b.dir, '77-02-other-SUMMARY.md')) > got.indexOf(path.join(a.dir, '77-02-SUMMARY.md')), 'roots order is kept');

    assert.deepEqual(summaryFiles('77-02', []), []);
    assert.deepEqual(summaryFiles('', [a.root]), []);
    assert.deepEqual(summaryFiles('77-02', null), []);
    assert.deepEqual(summaryFiles('77-02', [path.join(tmp, 'missing')]), []);
  });

  test('14d. summaryFiles: a decimal id is matched literally', () => {
    const { summaryFiles } = require('./gate-executor-stop.js');
    const dir = path.join(tmp, 'dec', '.planning', 'objectives', '12.1-x');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ['12.1-03-x-SUMMARY.md', '1201-03-SUMMARY.md', '12x1-03-SUMMARY.md']) fs.writeFileSync(path.join(dir, f), '# x\n');
    assert.deepEqual(summaryFiles('12.1-03', [path.join(tmp, 'dec')]), [path.join(dir, '12.1-03-x-SUMMARY.md')]);
  });

  test('14e. summaryExists still agrees with summaryFiles', () => {
    const { summaryFiles } = require('./gate-executor-stop.js');
    const root = F.makePlanningRepo(path.join(tmp, 'agree'), { summaries: ['77-02'] });
    assert.equal(summaryExists('77-02', [root]), summaryFiles('77-02', [root]).length > 0);
    assert.equal(summaryExists('77-03', [root]), summaryFiles('77-03', [root]).length > 0);
  });
});

// ─── 15. executor.md tells the executor about the gate (repo checkout only) ───

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

describe('66-02 prose: executor.md <self_check> and the SubagentStop gate', { skip: !IS_DEVFLOW_CHECKOUT && 'not a devflow-claude checkout' }, () => {
  test('15. <self_check> keeps stamp before post, and says the SubagentStop gate sends the executor back once', () => {
    const executor = fs.readFileSync(path.join(REPO_ROOT, 'plugins', 'devflow', 'agents', 'executor.md'), 'utf8');
    const open = executor.indexOf('<self_check>');
    const close = executor.indexOf('</self_check>', open);
    assert.ok(open >= 0 && close > open, 'executor.md has a <self_check> block');
    const selfCheck = executor.slice(open, close);

    const stamp = selfCheck.indexOf('df-tools.cjs tokens stamp {objective}-{trd} --draft');
    const post = selfCheck.indexOf('summary post {objective}-{trd} --from');
    assert.ok(stamp >= 0, 'self_check names the tokens stamp command');
    assert.ok(post > stamp, 'the stamp command precedes the summary post command');
    assert.match(selfCheck, /SubagentStop/, 'self_check mentions the SubagentStop gate');
    // "post it once" is already in step 3's heading, so tie `once` to the gate's own sentence.
    assert.match(selfCheck, /SubagentStop[^.\n]*\bonce\b/, 'self_check says the gate sends the executor back once');
  });
});
