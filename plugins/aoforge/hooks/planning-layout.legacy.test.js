'use strict';

// Test list (TRD 72-06, objective 72; rewritten for 3.1 by TRD 78-11, objective 78, SC-1/SC-4). The hooks find a
// project's planning tree at `.aoforge/` and nowhere else: AOForge 3.0.x also read a legacy `.planning/` for one
// release, and 3.1 does not (compat.findProjectRoot / planningRoot are single-name). A project that holds only the
// legacy directory is "not a project" for every hook: no ambient gate, no routing, no completion check, no status line
// segment, and no hook creates `.aoforge/` in it. (upgrade-project's one global legacy-layout notice for such a project
// is pinned in hooks/upgrade-project.legacy.test.js, case 1.) Every case spawns the real hook with a JSON payload on
// stdin, in a fixture project with a fake HOME (legacy-layout-fixtures.cjs).
//
// Layout aoforge (the `.aoforge/` contract, unchanged from 72-06)
// 1. gate-edits: ambient (no marker) Write to src/a.js is denied (strict default).
// 2. A live marker in `.aoforge/.skill-active` allows; the same project without it is denied (control).
// 3. Worktree of a main checkout whose gitignored marker exists only in the MAIN checkout's `.aoforge/`: allowed from
//    the worktree; without a marker: denied.
// 4. Planning artifacts: a Write under `.aoforge/` (`x.md` and a non-markdown `x.json`) is allowed in ambient mode
//    while src/a.js is denied.
//    4b. Layout both: a Write under `.aoforge/` is a planning artifact; one under the legacy directory is not (denied
//        like any other file: the legacy directory is ignored).
//    4c. shouldGate reports `planning artifact` for a path under `.aoforge/` only.
//    4d. Store mode (github.enabled + github.store): a Write to the generated STATE.md under `.aoforge/` is denied as
//        a read-only cache even with a live marker.
// 5. gate-executor-stop: an executor transcript naming 01-01: a SUMMARY under `.aoforge/objectives` -> no block;
//    absent -> one block. 5b: for an exact `<id>-TRD.md` the reason names `.aoforge/objectives/<dir>/<id>-SUMMARY.md`.
// 6. route-intent: "build the login page" gets the routing directive naming `.aoforge/`; layout none gets nothing.
// 7. upgrade-project + route-results: notices land in `.aoforge/`, info/exclude names them, the legacy directory is
//    never created, and route-results emits the upgrade notice on the next prompt.
// 8. verify-completion (autonomous, mid-execution) blocks naming `.aoforge/STATE.md`; classify-session emits the
//    ambient preamble.
//
// Layout legacy (TRD 78-11: not a project; every case also asserts that `.aoforge/` was not created)
// 9. gate-edits allows (no output): an ambient Write to src/a.js, a Write under the legacy directory, a Write to the
//    legacy STATE.md with a store-mode config and a marker there, and an ambient Write from a worktree of a legacy main
//    checkout.
// 10. gate-commits: a raw `git commit` passes (no output), as in layout none; layout aoforge denies it (control).
// 11. gate-executor-stop: aoforge:executor stopping with no SUMMARY anywhere -> no block.
// 12. route-intent: nothing, as in layout none.
// 13. verify-completion with an autonomous, mid-execution config and STATE.md in the legacy directory: nothing;
//     classify-session prints what it prints for layout none.
// 14. statusline: a live estimate run keyed by the legacy root shows no `⏱` segment; the same run keyed by an
//     `.aoforge/` root shows it (control).
//
// Runtime model: every write goes to the fixture's temp directory (fake HOME, TMPDIR inside it); hook-marker and
// estimate state are pointed into it as well. Nothing touches the real home.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('../aoforge/bin/lib/legacy-names.cjs');
const {
  planningProject,
  worktreePair,
  markerText,
} = require('../aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs');
const SF = require('./__fixtures__/subagent-stop-fixtures.js');

const HOOKS = __dirname;
const LIB = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');
const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;

/** The fixture env plus state directories inside the fixture, so no hook writes under a real home. */
function hookEnv(p, extra = {}) {
  const tmp = p.tmp;
  return {
    ...p.env,
    [`${NAMES.envPrefix}HOOK_MARKER_DIR`]: path.join(tmp, 'hook-markers'),
    [`${NAMES.envPrefix}ESTIMATE_STATE_DIR`]: path.join(tmp, 'estimates'),
    [`${NAMES.envPrefix}PROGRESS_GUARD_DIR`]: path.join(tmp, 'progress-guard'),
    [`${NAMES.envPrefix}AUDIT_LOG_PATH`]: path.join(tmp, 'audit.log'),
    ...extra,
  };
}

/** Spawn hooks/<name> with `payload` as JSON on stdin. */
function runHook(name, { cwd, env, payload = {} }) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, name)], {
    cwd,
    env,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 60000,
  });
  assert.equal(r.status, 0, `${name} must exit 0 (stderr: ${r.stderr})`);
  return { stdout: r.stdout || '', stderr: r.stderr || '' };
}

function parsed(stdout) {
  const text = stdout.trim();
  return text ? JSON.parse(text) : null;
}

function withProject(opts, fn) {
  const p = planningProject(opts);
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

function withPair(opts, fn) {
  const w = worktreePair(opts);
  const p = { env: w.env, tmp: w.tmp };
  try {
    return fn(w, p);
  } finally {
    w.cleanup();
  }
}

/** A legacy-only project: `fn(p)`, then assert that no hook created `.aoforge/` in it. */
function withLegacy(opts, fn) {
  return withProject({ layout: 'legacy', ...opts }, (p) => {
    const out = fn(p);
    assert.equal(fs.existsSync(path.join(p.root, NEW)), false, `no hook created ${NEW}/ in a legacy-only project`);
    return out;
  });
}

/** stdout with the project root replaced, so two fixtures' outputs compare. */
function norm(stdout, root) {
  return String(stdout).split(root).join('<ROOT>');
}

// ─── gate-edits ───────────────────────────────────────────────────────────────

function writePayload(cwd, filePath) {
  return { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: filePath, content: 'x\n' }, cwd };
}

/** 'deny' | 'ask' | 'allow' (no output) for a Write to `filePath` from `cwd`. */
function editDecision(p, cwd, filePath) {
  const out = parsed(runHook('gate-edits.js', { cwd, env: hookEnv(p), payload: writePayload(cwd, filePath) }).stdout);
  return out ? out.hookSpecificOutput.permissionDecision : 'allow';
}

function editReason(p, cwd, filePath) {
  const out = parsed(runHook('gate-edits.js', { cwd, env: hookEnv(p), payload: writePayload(cwd, filePath) }).stdout);
  return out ? out.hookSpecificOutput.permissionDecisionReason : '';
}

const STORE_CONFIG = `${JSON.stringify({ mode: 'yolo', github: { enabled: true, store: true } }, null, 2)}\n`;

describe('gate-edits, layout aoforge', () => {
  test('1: ambient, Write to src/a.js is denied', () => {
    withProject({ layout: 'aoforge' }, (p) => {
      assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'deny');
    });
  });

  test(`2: a live marker in ${NEW}/ allows; without it, denied`, () => {
    withProject({ layout: 'aoforge' }, (p) => {
      const target = path.join(p.root, 'src', 'a.js');
      assert.equal(editDecision(p, p.root, target), 'deny', 'control: no marker');
      fs.writeFileSync(path.join(p.root, NEW, '.skill-active'), markerText());
      assert.equal(editDecision(p, p.root, target), 'allow');
    });
  });

  test('3: worktree of a main checkout holding the only marker: allowed', () => {
    withPair({ layout: 'aoforge', marker: 'main' }, (w, p) => {
      assert.equal(path.dirname(w.markerPath), path.join(w.main, NEW));
      assert.equal(fs.existsSync(path.join(w.worktree, NEW, '.skill-active')), false,
        'the worktree has no marker of its own');
      assert.equal(editDecision(p, w.worktree, path.join(w.worktree, 'src', 'a.js')), 'allow');
    });
    withPair({ layout: 'aoforge', marker: 'none' }, (w, p) => {
      assert.equal(editDecision(p, w.worktree, path.join(w.worktree, 'src', 'a.js')), 'deny', 'control: no marker');
    });
  });

  test(`4: a Write under ${NEW}/ is a planning artifact`, () => {
    withProject({ layout: 'aoforge' }, (p) => {
      const dir = path.join(p.root, NEW, 'objectives', '01-first');
      assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'deny', 'control');
      assert.equal(editDecision(p, p.root, path.join(dir, 'x.md')), 'allow');
      assert.equal(editDecision(p, p.root, path.join(dir, 'x.json')), 'allow');
    });
  });

  test(`4b: layout both, a Write under ${NEW}/ is a planning artifact; one under ${OLD}/ is not`, () => {
    withProject({ layout: 'both' }, (p) => {
      const rel = path.join('objectives', '01-first', 'x.json');
      assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'deny', 'control');
      assert.equal(editDecision(p, p.root, path.join(p.root, NEW, rel)), 'allow', NEW);
      assert.equal(editDecision(p, p.root, path.join(p.root, OLD, rel)), 'deny', `${OLD} is ignored`);
    });
  });

  test(`4c: shouldGate names a path under ${NEW}/ a planning artifact, and one under ${OLD}/ not`, () => {
    const { shouldGate } = require('./gate-edits.js');
    const gate = (filePath) => shouldGate({
      tool: 'Write', filePath, planningDir: `/p/${NEW}`, skillActive: false, overrideActive: false,
    });
    assert.deepEqual(gate(`/p/${NEW}/objectives/01-first/x.json`), { decision: 'allow', reason: 'planning artifact' });
    assert.equal(gate(`/p/${OLD}/objectives/01-first/x.json`).decision, 'deny', OLD);
    assert.equal(gate('/p/src/a.js').decision, 'deny', 'control');
  });

  test('4d: store mode denies a Write to the generated STATE.md even with a marker', () => {
    withProject({ layout: 'aoforge', files: { 'config.json': STORE_CONFIG } }, (p) => {
      fs.writeFileSync(path.join(p.root, NEW, '.skill-active'), markerText());
      const state = path.join(p.root, NEW, 'STATE.md');
      assert.equal(editDecision(p, p.root, state), 'deny');
      assert.match(editReason(p, p.root, state), /read-only cache/);
      assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'allow', 'control: the marker allows code');
    });
  });
});

describe('gate-edits, layout legacy: not a project (TRD 78-11)', () => {
  test('9: an ambient Write to src/a.js is allowed (no ambient gate)', () => {
    withLegacy({}, (p) => {
      assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'allow');
    });
  });

  test(`9b: a Write under ${OLD}/ is allowed like any file of a non-project`, () => {
    withLegacy({}, (p) => {
      assert.equal(editDecision(p, p.root, path.join(p.root, OLD, 'objectives', '01-first', 'x.json')), 'allow');
    });
  });

  test(`9c: a store-mode config and a marker in ${OLD}/ change nothing: its STATE.md is not a read-only cache`, () => {
    withLegacy({ files: { 'config.json': STORE_CONFIG } }, (p) => {
      fs.writeFileSync(path.join(p.root, OLD, '.skill-active'), markerText());
      const state = path.join(p.root, OLD, 'STATE.md');
      assert.equal(editDecision(p, p.root, state), 'allow');
      assert.equal(editReason(p, p.root, state), '');
    });
  });

  test('9d: from a worktree of a legacy main checkout, an ambient Write is allowed', () => {
    withPair({ layout: 'legacy', marker: 'none' }, (w, p) => {
      assert.equal(editDecision(p, w.worktree, path.join(w.worktree, 'src', 'a.js')), 'allow');
      assert.equal(fs.existsSync(path.join(w.main, NEW)), false, `no ${NEW}/ in the main checkout`);
      assert.equal(fs.existsSync(path.join(w.worktree, NEW)), false, `no ${NEW}/ in the worktree`);
    });
  });
});

// ─── gate-commits ─────────────────────────────────────────────────────────────

describe('gate-commits', () => {
  const commit = (p) => runHook('gate-commits.js', {
    cwd: p.root,
    env: hookEnv(p),
    payload: { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: p.root },
  }).stdout;

  test('10: layout legacy, a raw git commit passes (no output), as in layout none', () => {
    const none = withProject({ layout: 'none' }, (p) => norm(commit(p), p.root));
    assert.equal(none.trim(), '', 'control: layout none says nothing');
    withLegacy({}, (p) => {
      assert.equal(norm(commit(p), p.root), none);
    });
  });

  test('10: layout aoforge denies the raw commit (control)', () => {
    withProject({ layout: 'aoforge' }, (p) => {
      const out = parsed(commit(p));
      assert.ok(out, 'a decision');
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    });
  });
});

// ─── gate-executor-stop ───────────────────────────────────────────────────────

function stopPayload(p, planId, transcriptDir) {
  const transcript = SF.writeAgentTranscript(transcriptDir, SF.executorPrompt({ planId, repoRoot: p.root }));
  return SF.subagentStopPayload({
    cwd: p.root,
    agent_transcript_path: transcript,
    transcript_path: path.join(transcriptDir, 'session.jsonl'),
    last_assistant_message: 'Task 1 committed.',
  });
}

const CHECKPOINT_SUMMARY = '# Summary\n\n## Progress\n- [x] Task 1: write x.txt — abc1234\n';

// The block reason names the SUMMARY path only for a TRD it can locate, and the hook's trdDirFor
// locates the exact `<id>-TRD.md` name: case 5b adds one (objective 02) beside the named 01-01.
const EXACT_TRD = '---\nobjective: 02-second\ntrd: "01"\n---\n\n# TRD 02-01: Y\n';

describe('gate-executor-stop', () => {
  test(`5: layout aoforge, SUMMARY under ${NEW}/objectives -> no block; absent -> one block`, () => {
    withProject({ layout: 'aoforge' }, (p) => {
      const payload = stopPayload(p, '01-01', path.join(p.tmp, 'transcript'));
      const env = hookEnv(p);

      const blocked = parsed(runHook('gate-executor-stop.js', { cwd: p.root, env, payload }).stdout);
      assert.ok(blocked, 'absent SUMMARY: one block');
      assert.equal(blocked.decision, 'block');

      fs.writeFileSync(path.join(p.root, NEW, 'objectives', '01-first', '01-01-SUMMARY.md'), CHECKPOINT_SUMMARY);
      assert.equal(runHook('gate-executor-stop.js', { cwd: p.root, env, payload }).stdout.trim(), '', 'SUMMARY present: no block');
    });
  });

  test(`5b: layout aoforge, the block reason names ${NEW}/objectives/<dir>/<id>-SUMMARY.md`, () => {
    withProject({ layout: 'aoforge', files: { 'objectives/02-second/02-01-TRD.md': EXACT_TRD } }, (p) => {
      const payload = stopPayload(p, '02-01', path.join(p.tmp, 'transcript'));
      const blocked = parsed(runHook('gate-executor-stop.js', { cwd: p.root, env: hookEnv(p), payload }).stdout);
      assert.ok(blocked, 'absent SUMMARY: one block');
      assert.ok(
        blocked.reason.includes(`${NEW}/objectives/02-second/02-01-SUMMARY.md`),
        `the reason names the .aoforge path: ${blocked.reason}`,
      );
    });
  });

  test('11: layout legacy, aoforge:executor stopping with no SUMMARY anywhere -> no block', () => {
    withLegacy({}, (p) => {
      const payload = stopPayload(p, '01-01', path.join(p.tmp, 'transcript'));
      assert.equal(runHook('gate-executor-stop.js', { cwd: p.root, env: hookEnv(p), payload }).stdout.trim(), '');
    });
  });
});

// ─── route-intent ─────────────────────────────────────────────────────────────

describe('route-intent', () => {
  const payload = { hook_event_name: 'UserPromptSubmit', prompt: 'build the login page' };

  test(`6: layout aoforge gets the routing directive naming ${NEW}/`, () => {
    withProject({ layout: 'aoforge' }, (p) => {
      const out = parsed(runHook('route-intent.js', { cwd: p.root, env: hookEnv(p), payload }).stdout);
      assert.ok(out, 'a directive');
      const ctx = out.hookSpecificOutput.additionalContext;
      assert.match(ctx, /ROUTING DIRECTIVE/);
      assert.ok(ctx.includes(`(${NEW}/ exists)`), ctx);
    });
  });

  test('6: layout none gets nothing', () => {
    withProject({ layout: 'none' }, (p) => {
      assert.equal(runHook('route-intent.js', { cwd: p.root, env: hookEnv(p), payload }).stdout.trim(), '');
    });
  });

  test('12: layout legacy gets nothing either', () => {
    withLegacy({}, (p) => {
      assert.equal(runHook('route-intent.js', { cwd: p.root, env: hookEnv(p), payload }).stdout.trim(), '');
    });
  });
});

// ─── upgrade-project + route-results ──────────────────────────────────────────

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pollUntil(fn, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v || Date.now() >= end) return v;
    sleep(200);
  }
}

function readNotices(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')).notices || [];
  } catch {
    return [];
  }
}

describe('upgrade-project and route-results', () => {
  test(`7: layout aoforge, notices land in ${NEW}/ and info/exclude names it`, () => {
    withProject({ layout: 'aoforge' }, (p) => {
      const env = hookEnv(p, {
        [`${NAMES.envPrefix}SKIP_PRUNE`]: '1',
        [`${NAMES.envPrefix}SKIP_TRANSCRIPT_EXPORT`]: '1',
      });
      const noticesRel = `${NEW}/${NAMES.notices}`;
      const noticesFile = path.join(p.root, NEW, NAMES.notices);

      runHook('upgrade-project.js', { cwd: p.root, env, payload: {} });
      // The hook writes its own notice before it exits; when it did, wait for the detached commit
      // child's notice too, so cleanup never races the child.
      if (readNotices(noticesFile).some((n) => n.source === 'upgrade-project')) {
        pollUntil(() => readNotices(noticesFile).find((n) => n.source === 'upgrade-commit'));
      }

      const notices = readNotices(noticesFile);
      assert.ok(
        notices.some((n) => n.source === 'upgrade-project'),
        `an upgrade notice in ${noticesRel}: ${JSON.stringify(notices)}`,
      );
      assert.equal(fs.existsSync(path.join(p.root, OLD)), false, `${OLD}/ is never created`);

      const exclude = fs.readFileSync(path.join(p.root, '.git', 'info', 'exclude'), 'utf-8');
      assert.ok(exclude.split('\n').includes(noticesRel), exclude);
      assert.equal(p.git(['status', '--porcelain', '--', noticesRel]).trim(), '', 'git status never lists it');

      const routed = parsed(runHook('route-results.js', { cwd: p.root, env, payload: { prompt: 'hello' } }).stdout);
      assert.ok(routed, 'route-results emits the pending notices');
      assert.match(JSON.stringify(routed), /AOForge upgraded this project/);
    });
  });
});

// ─── verify-completion + classify-session ─────────────────────────────────────

describe('verify-completion and classify-session', () => {
  const autonomous = `${JSON.stringify({ mode: 'autonomous', github: { enabled: false } }, null, 2)}\n`;
  const executing = [
    '# Project State',
    '',
    '## Current Position',
    '',
    'Objective: 1',
    '**Status:** Executing',
    '',
  ].join('\n');
  const files = { 'config.json': autonomous, 'STATE.md': executing };

  test(`8: layout aoforge, verify-completion resumes naming ${NEW}/STATE.md`, () => {
    withProject({ layout: 'aoforge', files }, (p) => {
      const out = parsed(runHook('verify-completion.js', { cwd: p.root, env: hookEnv(p), payload: {} }).stdout);
      assert.ok(out, 'a block');
      assert.equal(out.decision, 'block');
      assert.ok(out.reason.includes(`Read ${NEW}/STATE.md`), out.reason);
    });
  });

  test('8: layout aoforge, classify-session emits the ambient preamble', () => {
    withProject({ layout: 'aoforge' }, (p) => {
      const out = parsed(runHook('classify-session.js', { cwd: p.root, env: hookEnv(p), payload: {} }).stdout);
      assert.ok(out, 'a preamble');
      assert.match(out.hookSpecificOutput.additionalContext, /ambient mode is active/);
    });
  });

  test(`13: layout legacy, an autonomous mid-execution STATE.md in ${OLD}/ is not checked`, () => {
    withLegacy({ files }, (p) => {
      assert.equal(runHook('verify-completion.js', { cwd: p.root, env: hookEnv(p), payload: {} }).stdout.trim(), '');
    });
  });

  test('13: layout legacy, classify-session prints what it prints for layout none', () => {
    const none = withProject({ layout: 'none' }, (p) => (
      norm(runHook('classify-session.js', { cwd: p.root, env: hookEnv(p), payload: {} }).stdout, p.root)));
    assert.doesNotMatch(none, /ambient mode is active/, 'control: layout none has no preamble');
    withLegacy({}, (p) => {
      assert.equal(norm(runHook('classify-session.js', { cwd: p.root, env: hookEnv(p), payload: {} }).stdout, p.root), none);
    });
  });
});

// ─── statusline ───────────────────────────────────────────────────────────────

/** Copy the libs the status line's estimate segment loads into the fake HOME's runtime (statusline-estimate.test.js). */
function installEstimateLib(home) {
  const dir = path.join(home, '.claude', NAMES.runtimeDir, 'bin', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['estimate-run-store.cjs', 'upgrade.cjs', 'compat.cjs', 'legacy-names.cjs']) {
    fs.copyFileSync(path.join(LIB, name), path.join(dir, name));
  }
}

/** A live run: wave 1 done, wave 2 started 5 minutes ago, wave 3 pending. */
function liveRun() {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const min = 60 * 1000;
  return {
    version: 1,
    objective: '78',
    started_at: iso(now - 40 * min),
    updated_at: iso(now),
    finished_at: null,
    estimate: { line: 'Objective 78 estimate: ...', wall_minutes: { p50: 40, p90: 106 }, confidence: 'medium' },
    waves: [
      { wave: 1, trds: ['78-01'], p50: 12, p90: 36, started_at: iso(now - 40 * min), finished_at: iso(now - 5 * min), actual_minutes: 14 },
      { wave: 2, trds: ['78-02'], p50: 20, p90: 50, started_at: iso(now - 5 * min), finished_at: null, actual_minutes: null },
      { wave: 3, trds: ['78-03'], p50: 8, p90: 20, started_at: null, finished_at: null, actual_minutes: null },
    ],
  };
}

/** The status line for `p.root`, with a live estimate run keyed by that root. */
function statusLine(p) {
  const store = require(path.join(LIB, 'estimate-run-store.cjs'));
  const env = hookEnv(p);
  installEstimateLib(p.home);
  store.writeRunState(p.root, liveRun(), { env: { [`${NAMES.envPrefix}ESTIMATE_STATE_DIR`]: env[`${NAMES.envPrefix}ESTIMATE_STATE_DIR`] } });
  const input = { model: { display_name: 'Sonnet 4.5' }, workspace: { current_dir: p.root }, session_id: 's', context_window: { remaining_percentage: 70 } };
  const r = runHook('statusline.js', { cwd: p.root, env, payload: input });
  // eslint-disable-next-line no-control-regex
  return r.stdout.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('statusline', () => {
  test('14: layout aoforge, a live run shows the estimate segment (control)', () => {
    withProject({ layout: 'aoforge' }, (p) => {
      assert.match(statusLine(p), /⏱ 78 W2\/3/);
    });
  });

  test('14: layout legacy, the same run keyed by the legacy root shows no segment', () => {
    withLegacy({}, (p) => {
      const line = statusLine(p);
      assert.doesNotMatch(line, /⏱/, line);
      assert.match(line, /Sonnet 4\.5/, 'the rest of the line renders');
    });
  });
});
