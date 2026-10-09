'use strict';

// Test list (TRD 72-06, objective 72-install-and-naming-cleanup, INST-02/INST-03). The hooks find a
// project's planning tree at `.aoforge/` first and, for one release, at a legacy `.planning/`: the
// same contract 72-05 proved for the aof-tools libraries. Every case spawns the real hook with a JSON
// payload on stdin, in a fixture project with a fake HOME, per layout (legacy-layout-fixtures.cjs).
//
// gate-edits (PreToolUse, Write)
// 1. Ambient (no marker), Write to src/a.js: denied (strict default), layouts aoforge and legacy.
// 2. A live marker in the layout's planning directory (`.aoforge/.skill-active`, legacy
//    `.planning/.skill-active`): allowed; the same project without the marker is denied (control).
// 3. Worktree of a main checkout whose gitignored marker exists only in the MAIN checkout's planning
//    directory: allowed from the worktree, layouts legacy and aoforge; without a marker: denied.
// 4. Planning artifacts: a Write under the planning directory (`x.md` and a non-markdown `x.json`) is
//    allowed in ambient mode while src/a.js is denied, per layout.
//    4b. Layout both: a Write under EITHER directory is a planning artifact (the path test names both).
//    4c. shouldGate reports `planning artifact` for a path under either name.
//    4d. Store mode (github.enabled + github.store): a Write to the generated STATE.md under the
//        planning directory is denied as a read-only cache even with a live marker.
// gate-executor-stop (SubagentStop)
// 5. An executor transcript naming 01-01 (01-01-x-TRD.md): a SUMMARY under the layout's objectives
//    directory -> no block; absent -> one block.
//    5b. For a TRD the hook can locate (an exact `<id>-TRD.md`), the block reason names
//        `<planning dir>/objectives/<dir>/<id>-SUMMARY.md`.
// route-intent (UserPromptSubmit)
// 6. "build the login page": layouts aoforge and legacy get the routing directive naming the
//    resolved directory; layout none gets nothing.
// upgrade-project + route-results (SessionStart, UserPromptSubmit)
// 7. A behind project: notices land in `.aoforge/` (a legacy directory is moved there by migration
//    0012 in the same run, TRD 72-08; the legacy name never remains), info/exclude gains
//    `.aoforge/.aoforge-notices.json`, and route-results emits the upgrade notice on the next prompt.
// verify-completion (Stop) and classify-session (SessionStart)
// 8. Autonomous mode mid-execution: verify-completion blocks and the reason names
//    `<planning dir>/STATE.md`; classify-session emits the ambient preamble. Both layouts.
//
// Runtime model: every write goes to the fixture's temp directory (fake HOME, TMPDIR inside it);
// hook-marker and estimate state are pointed into it as well. Nothing touches the real home.

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
const DIR_OF = Object.freeze({ aoforge: NAMES.planningDir, legacy: LEGACY.planningDir });
const SINGLE_LAYOUTS = Object.freeze(['aoforge', 'legacy']);

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

describe('gate-edits', () => {
  for (const layout of SINGLE_LAYOUTS) {
    test(`1: layout ${layout}, ambient, Write to src/a.js is denied`, () => {
      withProject({ layout }, (p) => {
        assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'deny');
      });
    });

    test(`2: layout ${layout}, a live marker in ${DIR_OF[layout]}/ allows; without it, denied`, () => {
      withProject({ layout }, (p) => {
        const target = path.join(p.root, 'src', 'a.js');
        assert.equal(editDecision(p, p.root, target), 'deny', 'control: no marker');
        fs.writeFileSync(path.join(p.root, DIR_OF[layout], '.skill-active'), markerText());
        assert.equal(editDecision(p, p.root, target), 'allow');
      });
    });
  }

  for (const layout of ['legacy', 'aoforge']) {
    test(`3: layout ${layout}, worktree of a main checkout holding the only marker: allowed`, () => {
      withPair({ layout, marker: 'main' }, (w, p) => {
        assert.equal(path.dirname(w.markerPath), path.join(w.main, DIR_OF[layout]));
        assert.equal(fs.existsSync(path.join(w.worktree, DIR_OF[layout], '.skill-active')), false,
          'the worktree has no marker of its own');
        assert.equal(editDecision(p, w.worktree, path.join(w.worktree, 'src', 'a.js')), 'allow');
      });
      withPair({ layout, marker: 'none' }, (w, p) => {
        assert.equal(editDecision(p, w.worktree, path.join(w.worktree, 'src', 'a.js')), 'deny', 'control: no marker');
      });
    });
  }

  for (const layout of SINGLE_LAYOUTS) {
    test(`4: layout ${layout}, a Write under ${DIR_OF[layout]}/ is a planning artifact`, () => {
      withProject({ layout }, (p) => {
        const dir = path.join(p.root, DIR_OF[layout], 'objectives', '01-first');
        assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'deny', 'control');
        assert.equal(editDecision(p, p.root, path.join(dir, 'x.md')), 'allow');
        assert.equal(editDecision(p, p.root, path.join(dir, 'x.json')), 'allow');
      });
    });
  }

  test('4b: layout both, a Write under either directory is a planning artifact', () => {
    withProject({ layout: 'both' }, (p) => {
      assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'deny', 'control');
      for (const name of [NAMES.planningDir, LEGACY.planningDir]) {
        assert.equal(editDecision(p, p.root, path.join(p.root, name, 'objectives', '01-first', 'x.json')), 'allow', name);
      }
    });
  });

  test('4c: shouldGate names a path under either directory a planning artifact', () => {
    const { shouldGate } = require('./gate-edits.js');
    for (const name of [NAMES.planningDir, LEGACY.planningDir]) {
      const r = shouldGate({
        tool: 'Write',
        filePath: `/p/${name}/objectives/01-first/x.json`,
        planningDir: `/p/${name}`,
        skillActive: false,
        overrideActive: false,
      });
      assert.deepEqual(r, { decision: 'allow', reason: 'planning artifact' }, name);
    }
    const other = shouldGate({
      tool: 'Write', filePath: '/p/src/a.js', planningDir: `/p/${NAMES.planningDir}`, skillActive: false, overrideActive: false,
    });
    assert.equal(other.decision, 'deny', 'control');
  });

  for (const layout of SINGLE_LAYOUTS) {
    test(`4d: layout ${layout}, store mode denies a Write to the generated STATE.md even with a marker`, () => {
      const config = `${JSON.stringify({ mode: 'yolo', github: { enabled: true, store: true } }, null, 2)}\n`;
      withProject({ layout, files: { 'config.json': config } }, (p) => {
        fs.writeFileSync(path.join(p.root, DIR_OF[layout], '.skill-active'), markerText());
        const state = path.join(p.root, DIR_OF[layout], 'STATE.md');
        assert.equal(editDecision(p, p.root, state), 'deny');
        assert.match(editReason(p, p.root, state), /read-only cache/);
        assert.equal(editDecision(p, p.root, path.join(p.root, 'src', 'a.js')), 'allow', 'control: the marker allows code');
      });
    });
  }
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
  for (const layout of SINGLE_LAYOUTS) {
    test(`5: layout ${layout}, SUMMARY under ${DIR_OF[layout]}/objectives -> no block; absent -> one block`, () => {
      withProject({ layout }, (p) => {
        const payload = stopPayload(p, '01-01', path.join(p.tmp, 'transcript'));
        const env = hookEnv(p);

        const blocked = parsed(runHook('gate-executor-stop.js', { cwd: p.root, env, payload }).stdout);
        assert.ok(blocked, 'absent SUMMARY: one block');
        assert.equal(blocked.decision, 'block');

        fs.writeFileSync(path.join(p.root, DIR_OF[layout], 'objectives', '01-first', '01-01-SUMMARY.md'), CHECKPOINT_SUMMARY);
        assert.equal(runHook('gate-executor-stop.js', { cwd: p.root, env, payload }).stdout.trim(), '', 'SUMMARY present: no block');
      });
    });

    test(`5b: layout ${layout}, the block reason names ${DIR_OF[layout]}/objectives/<dir>/<id>-SUMMARY.md`, () => {
      withProject({ layout, files: { 'objectives/02-second/02-01-TRD.md': EXACT_TRD } }, (p) => {
        const payload = stopPayload(p, '02-01', path.join(p.tmp, 'transcript'));
        const blocked = parsed(runHook('gate-executor-stop.js', { cwd: p.root, env: hookEnv(p), payload }).stdout);
        assert.ok(blocked, 'absent SUMMARY: one block');
        assert.ok(
          blocked.reason.includes(`${DIR_OF[layout]}/objectives/02-second/02-01-SUMMARY.md`),
          `the reason names the layout's path: ${blocked.reason}`,
        );
      });
    });
  }
});

// ─── route-intent ─────────────────────────────────────────────────────────────

describe('route-intent', () => {
  const payload = { hook_event_name: 'UserPromptSubmit', prompt: 'build the login page' };

  for (const layout of SINGLE_LAYOUTS) {
    test(`6: layout ${layout} gets the routing directive naming ${DIR_OF[layout]}/`, () => {
      withProject({ layout }, (p) => {
        const out = parsed(runHook('route-intent.js', { cwd: p.root, env: hookEnv(p), payload }).stdout);
        assert.ok(out, 'a directive');
        const ctx = out.hookSpecificOutput.additionalContext;
        assert.match(ctx, /ROUTING DIRECTIVE/);
        assert.ok(ctx.includes(`(${DIR_OF[layout]}/ exists)`), ctx);
      });
    });
  }

  test('6: layout none gets nothing', () => {
    withProject({ layout: 'none' }, (p) => {
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
  for (const layout of SINGLE_LAYOUTS) {
    // TRD 72-08: migration 0012 (auto) moves a legacy directory to `.aoforge/` in the same hook run, so the notices
    // of BOTH layouts end up in `.aoforge/` and the legacy directory is gone afterwards.
    test(`7: layout ${layout}, notices land in ${NAMES.planningDir}/ and info/exclude names it`, () => {
      withProject({ layout }, (p) => {
        const finalDir = NAMES.planningDir;
        const other = LEGACY.planningDir;
        const env = hookEnv(p, {
          [`${NAMES.envPrefix}SKIP_PRUNE`]: '1',
          [`${NAMES.envPrefix}SKIP_TRANSCRIPT_EXPORT`]: '1',
        });
        const noticesRel = `${finalDir}/${NAMES.notices}`;
        const noticesFile = path.join(p.root, finalDir, NAMES.notices);

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
        assert.equal(fs.existsSync(path.join(p.root, other)), false, `${other}/ is never created (and a legacy one moved)`);

        const exclude = fs.readFileSync(path.join(p.root, '.git', 'info', 'exclude'), 'utf-8');
        assert.ok(exclude.split('\n').includes(noticesRel), exclude);
        assert.equal(p.git(['status', '--porcelain', '--', noticesRel]).trim(), '', 'git status never lists it');

        const routed = parsed(runHook('route-results.js', { cwd: p.root, env, payload: { prompt: 'hello' } }).stdout);
        assert.ok(routed, 'route-results emits the pending notices');
        assert.match(JSON.stringify(routed), /AOForge upgraded this project/);
      });
    });
  }
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

  for (const layout of SINGLE_LAYOUTS) {
    test(`8: layout ${layout}, verify-completion resumes naming ${DIR_OF[layout]}/STATE.md`, () => {
      withProject({ layout, files: { 'config.json': autonomous, 'STATE.md': executing } }, (p) => {
        const out = parsed(runHook('verify-completion.js', { cwd: p.root, env: hookEnv(p), payload: {} }).stdout);
        assert.ok(out, 'a block');
        assert.equal(out.decision, 'block');
        assert.ok(out.reason.includes(`Read ${DIR_OF[layout]}/STATE.md`), out.reason);
      });
    });

    test(`8: layout ${layout}, classify-session emits the ambient preamble`, () => {
      withProject({ layout }, (p) => {
        const out = parsed(runHook('classify-session.js', { cwd: p.root, env: hookEnv(p), payload: {} }).stdout);
        assert.ok(out, 'a preamble');
        assert.match(out.hookSpecificOutput.additionalContext, /ambient mode is active/);
      });
    });
  }
});
