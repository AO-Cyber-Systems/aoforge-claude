'use strict';

/**
 * home-project-detection.test.js — $HOME is never an AOForge project root (TRD 73-09, gap G5 (a)).
 *
 * Why: aoforge-watch writes its log and pid file into `~/<NAMES.userDotDir>/`, which has the
 * same name as a project's planning directory. The project-root walk had no stop at $HOME,
 * so once that directory existed every repository below $HOME read as an AOForge project:
 * gate-edits denied ambient edits, route-intent injected routing, classify-session
 * classified the session as ambient (73-VERIFICATION, G5). This is the regression test the
 * verifier asked for: the hooks are spawned under a temp HOME holding the watcher's
 * footprint and compared with the same repository under a control HOME without it.
 *
 * Test list (outermost first; the library-level cases are in compat.home.test.cjs and
 * planning-mode.test.cjs):
 *   1. classify-session (SessionStart, cwd = repo): stdout under the watcher's home is
 *      byte-identical to stdout under the control home.
 *   2. gate-edits (PreToolUse Write to <repo>/src/a.txt, no skill marker, no agent_type):
 *      no deny, and stdout equals the control run's.
 *   3. gate-commits (PreToolUse Bash, a raw commit command): stdout equals the control run's.
 *   4. route-intent (UserPromptSubmit, a build-intent prompt): stdout equals the control run's.
 *   5. Positive control: <home>/proj with its own planning directory and `.git` -> gate-edits
 *      denies an ambient Write to <home>/proj/src/a.txt (a project below $HOME is still one).
 *   6. cwd = <home> itself (a session started in $HOME) -> gate-edits allows a Write to
 *      <home>/notes.txt.
 *
 * Every home is a hand-built temp tree (lib/__fixtures__/home-dot-dir-fixtures.cjs); nothing
 * reads the real $HOME. Homes keep the form mkdtemp returns (macOS: /var/folders/...), while the
 * spawned hook's process.cwd() is the realpath (/private/var/folders/...): both forms must be
 * recognised as $HOME. Home paths in stdout are normalised to `<HOME>` before comparing;
 * decision fields are never normalised.
 *
 * Framework: node:test + node:assert/strict.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('../aoforge/bin/lib/legacy-names.cjs');
const { preToolUsePayload, makeAoforgeProject } = require('./__fixtures__/gate-fixtures.js');
const {
  WATCH_FOOTPRINT,
  mkHome,
  mkRepoBelow,
  rmHome,
} = require('../aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs');

const hook = (name) => path.join(__dirname, name);

/** process.env minus every skip escape (both prefixes, since the hooks alias the legacy one), with HOME set. */
function hookEnv(home) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith(`${NAMES.envPrefix}SKIP_`) || key.startsWith(`${LEGACY.envPrefix}SKIP_`)) delete env[key];
  }
  env.HOME = home;
  return env;
}

/** Spawn a hook in `cwd` under HOME=`home`; `payload` (an object) is its stdin, none when undefined. */
function runHook(name, { cwd, home, payload }) {
  const opts = { cwd, encoding: 'utf8', env: hookEnv(home) };
  if (payload === undefined) opts.stdio = ['ignore', 'pipe', 'pipe'];
  else opts.input = JSON.stringify(payload);
  const r = spawnSync(process.execPath, [hook(name)], opts);
  assert.equal(r.status, 0, `${name} exited ${r.status}; stderr: ${r.stderr}`);
  return r;
}

/** Replace every spelling of `home` (realpath first: it contains the mkdtemp form on macOS) with `<HOME>`. */
function norm(text, home) {
  let out = String(text);
  for (const form of [fs.realpathSync(home), home]) out = out.split(form).join('<HOME>');
  return out;
}

function deniesIn(stdout) {
  return /"permissionDecision"\s*:\s*"deny"/.test(stdout);
}

/**
 * A home holding the watcher's footprint and a control home without it, each with the same
 * repository below it. `fn({ dirty, clean })` receives `{ home, repo }` for both.
 */
function withHomes(fn) {
  const dirty = mkHome({ dotDir: WATCH_FOOTPRINT, prefix: 'aof-home-watch-' });
  const clean = mkHome({ prefix: 'aof-home-ctl-' });
  try {
    fn({
      dirty: { home: dirty.home, repo: mkRepoBelow(dirty.home) },
      clean: { home: clean.home, repo: mkRepoBelow(clean.home) },
    });
  } finally {
    rmHome(dirty.home, clean.home);
  }
}

/** Run the same hook against both homes and return the normalised stdouts. */
function bothRuns(name, buildPayload) {
  let out;
  withHomes(({ dirty, clean }) => {
    const run = ({ home, repo }) => {
      const payload = buildPayload ? buildPayload({ home, repo }) : undefined;
      return norm(runHook(name, { cwd: repo, home, payload }).stdout, home);
    };
    out = { dirty: run(dirty), clean: run(clean) };
  });
  return out;
}

describe('$HOME holding the watcher\'s dot directory is not a project (spawned hooks, TRD 73-09)', () => {
  test('1. classify-session: stdout equals the control home\'s', () => {
    const { dirty, clean } = bothRuns('classify-session.js');
    assert.equal(dirty, clean);
  });

  test('2. gate-edits: an ambient Write in a repo below $HOME is not denied, stdout equals the control\'s', () => {
    const { dirty, clean } = bothRuns('gate-edits.js', ({ repo }) => preToolUsePayload({
      tool: 'Write',
      filePath: path.join(repo, 'src', 'a.txt'),
      cwd: repo,
    }));
    assert.equal(deniesIn(dirty), false, `gate-edits denied: ${dirty}`);
    assert.equal(dirty, clean);
  });

  test('3. gate-commits: a raw commit in a repo below $HOME: stdout equals the control\'s', () => {
    const { dirty, clean } = bothRuns('gate-commits.js', ({ repo }) => preToolUsePayload({
      tool: 'Bash',
      command: 'git commit -m x',
      cwd: repo,
    }));
    assert.equal(deniesIn(dirty), false, `gate-commits denied: ${dirty}`);
    assert.equal(dirty, clean);
  });

  test('4. route-intent: a build prompt in a repo below $HOME: stdout equals the control\'s', () => {
    const { dirty, clean } = bothRuns('route-intent.js', ({ repo }) => ({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'add a delete button to the settings page',
      session_id: 's-fixture',
      cwd: repo,
    }));
    assert.equal(dirty, clean);
  });

  test('5. positive control: a project below $HOME (its own planning directory) is still gated', () => {
    const { home } = mkHome({ dotDir: WATCH_FOOTPRINT, prefix: 'aof-home-watch-' });
    try {
      const proj = mkRepoBelow(home, 'proj');
      makeAoforgeProject(proj);
      const r = runHook('gate-edits.js', {
        cwd: proj,
        home,
        payload: preToolUsePayload({ tool: 'Write', filePath: path.join(proj, 'src', 'a.txt'), cwd: proj }),
      });
      assert.equal(deniesIn(r.stdout), true, `expected an ambient deny below $HOME; stdout: ${r.stdout}`);
    } finally {
      rmHome(home);
    }
  });

  test('6. a session started in $HOME itself: gate-edits allows a Write to <home>/notes.txt', () => {
    const { home } = mkHome({ dotDir: WATCH_FOOTPRINT, prefix: 'aof-home-watch-' });
    try {
      const r = runHook('gate-edits.js', {
        cwd: home,
        home,
        payload: preToolUsePayload({ tool: 'Write', filePath: path.join(home, 'notes.txt'), cwd: home }),
      });
      assert.equal(deniesIn(r.stdout), false, `gate-edits denied a Write in $HOME: ${r.stdout}`);
      assert.equal(r.stdout, '');
    } finally {
      rmHome(home);
    }
  });
});
