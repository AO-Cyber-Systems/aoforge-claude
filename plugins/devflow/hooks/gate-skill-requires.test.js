/**
 * Tests for the gate-skill-requires hook, UserPromptExpansion + PreToolUse(Skill) (TRD 61-08, STOR-04 part 2).
 *
 * Subprocess tests spawn `process.execPath gate-skill-requires.js` with the payload on stdin, exactly as the
 * harness does, against the REAL plugins/devflow/skills/ (gh-sync declares `requires: [gh]`). Hand-built
 * fixtures only: payloads are literal objects, PATH directories are temp dirs with or without a literal
 * executable `gh` script, and in-process fixture skills are temp `skills/<name>/SKILL.md` files.
 *
 *    1. a typed /devflow:gh-sync with no gh on PATH is blocked, the reason names gh, its install hint,
 *       /devflow:doctor and the escape
 *    2. the same payload with gh on PATH prints nothing
 *    3. the Skill tool for devflow:gh-sync with no gh is denied with the same reason
 *    4. ... and prints nothing with gh on PATH
 *    5. DEVFLOW_SKIP_SKILL_REQUIRES=1 prints nothing on both paths
 *    6. a skill without `requires:` prints nothing
 *    7. not ours (another command, another namespace, an MCP prompt) prints nothing
 *    8. other events and tools, malformed and empty stdin print nothing
 *    9. an unknown DevFlow skill prints nothing
 *   10. fail open when the devflow libs are not next to hooks/
 *   11. in-process run(): only the missing tool is named; an invalid `requires:` fails open
 *   12. a payload with only command_name (no prompt) is blocked
 *
 * Every spawn sets env.PATH explicitly and carries no DEVFLOW_SKIP_SKILL_REQUIRES unless the test sets it.
 * Every spawn exits 0 and writes nothing to stderr.
 */

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-skill-requires.js');
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

const cleanups = [];

function scratch(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A PATH directory holding literal executable stubs, one per name. */
function pathDirWith(names) {
  const dir = scratch('gsr-path-');
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), '#!/bin/sh\nexit 0\n');
    fs.chmodSync(path.join(dir, name), 0o755);
  }
  return dir;
}

function writeSkill(skillsDir, name, frontmatterLines) {
  const dir = path.join(skillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    ['---', `name: ${name}`, 'description: fixture', ...frontmatterLines, '---', '', '# fixture', ''].join('\n'),
  );
}

let cwdDir;
let emptyPath;
let ghPath;

before(() => {
  cwdDir = scratch('gsr-cwd-');
  emptyPath = pathDirWith([]);
  ghPath = pathDirWith(['gh']);
});

after(() => {
  for (const fn of cleanups.splice(0)) fn();
});

/** Spawn a hook script with `payload` (an object, or a raw string) on stdin. */
function spawnHook(script, payload, { pathDir, extraEnv = {} } = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const r = spawnSync(process.execPath, [script], {
    input,
    cwd: cwdDir,
    env: { PATH: pathDir, ...extraEnv },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `hook exits 0 (stderr: ${r.stderr})`);
  assert.equal(r.stderr, '', 'hook writes nothing to stderr');
  return r.stdout;
}

function runHook(payload, opts) {
  return spawnHook(HOOK_PATH, payload, opts);
}

const typed = (extra = {}) => ({
  hook_event_name: 'UserPromptExpansion',
  expansion_type: 'slash_command',
  command_name: 'devflow:gh-sync',
  command_args: 'status',
  command_source: 'plugin',
  prompt: '/devflow:gh-sync status',
  cwd: cwdDir,
  ...extra,
});

const skillCall = (skill, extra = {}) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Skill',
  tool_input: { skill },
  cwd: cwdDir,
  ...extra,
});

describe('typed slash command (UserPromptExpansion)', () => {
  test('1. blocks /devflow:gh-sync with no gh on PATH and names the way out', () => {
    const out = JSON.parse(runHook(typed(), { pathDir: emptyPath }));
    assert.equal(out.decision, 'block');
    assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason']);
    for (const part of [
      '/devflow:gh-sync',
      'gh',
      'https://cli.github.com',
      '/devflow:doctor',
      'DEVFLOW_SKIP_SKILL_REQUIRES=1',
    ]) {
      assert.ok(out.reason.includes(part), `reason names ${part}: ${out.reason}`);
    }
  });

  test('2. prints nothing with gh on PATH', () => {
    assert.equal(runHook(typed(), { pathDir: ghPath }), '');
  });

  test('12. a payload with only command_name (no prompt) is blocked', () => {
    const payload = typed();
    delete payload.prompt;
    const out = JSON.parse(runHook(payload, { pathDir: emptyPath }));
    assert.equal(out.decision, 'block');
    assert.ok(out.reason.includes('/devflow:gh-sync'));
  });
});

describe('Skill tool (PreToolUse)', () => {
  test('3. denies devflow:gh-sync with no gh on PATH, with the same reason as a typed command', () => {
    const typedOut = JSON.parse(runHook(typed(), { pathDir: emptyPath }));
    const out = JSON.parse(runHook(skillCall('devflow:gh-sync'), { pathDir: emptyPath }));
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(out.hookSpecificOutput.permissionDecisionReason, typedOut.reason);
  });

  test('4. prints nothing with gh on PATH', () => {
    assert.equal(runHook(skillCall('devflow:gh-sync'), { pathDir: ghPath }), '');
  });
});

describe('escape, and what the gate leaves alone', () => {
  test('5. DEVFLOW_SKIP_SKILL_REQUIRES=1 prints nothing on both paths', () => {
    const extraEnv = { DEVFLOW_SKIP_SKILL_REQUIRES: '1' };
    assert.equal(runHook(typed(), { pathDir: emptyPath, extraEnv }), '');
    assert.equal(runHook(skillCall('devflow:gh-sync'), { pathDir: emptyPath, extraEnv }), '');
  });

  test('5b. the escape only counts when it is exactly 1 (control)', () => {
    const extraEnv = { DEVFLOW_SKIP_SKILL_REQUIRES: '0' };
    assert.equal(JSON.parse(runHook(typed(), { pathDir: emptyPath, extraEnv })).decision, 'block');
  });

  test('6. a skill without requires: prints nothing, typed or called', () => {
    const status = typed({ command_name: 'devflow:status', command_args: '', prompt: '/devflow:status' });
    assert.equal(runHook(status, { pathDir: emptyPath }), '');
    assert.equal(runHook(skillCall('devflow:status'), { pathDir: emptyPath }), '');
  });

  test('7. a command or skill that is not DevFlow\'s prints nothing', () => {
    const cases = [
      typed({ command_name: 'review', command_args: '', command_source: 'builtin', prompt: '/review' }),
      typed({ command_name: 'gh-sync', command_args: '', prompt: '/gh-sync' }),
      skillCall('other:gh-sync'),
      // A control that would block if the expansion_type guard were missing: the name is ours, the kind is not.
      typed({ expansion_type: 'mcp_prompt' }),
    ];
    for (const payload of cases) {
      assert.equal(runHook(payload, { pathDir: emptyPath }), '', JSON.stringify(payload));
    }
  });

  test('8. other events and tools, malformed and empty stdin print nothing', () => {
    const cases = [
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: '/devflow:gh-sync' }, cwd: cwdDir },
      { hook_event_name: 'UserPromptSubmit', prompt: '/devflow:gh-sync status', cwd: cwdDir },
      'not json',
      '',
    ];
    for (const payload of cases) {
      assert.equal(runHook(payload, { pathDir: emptyPath }), '', JSON.stringify(payload));
    }
  });

  test('9. an unknown DevFlow skill prints nothing', () => {
    const nope = typed({ command_name: 'devflow:nope', command_args: '', prompt: '/devflow:nope' });
    assert.equal(runHook(nope, { pathDir: emptyPath }), '');
    assert.equal(runHook(skillCall('devflow:nope'), { pathDir: emptyPath }), '');
  });
});

describe('fail open', () => {
  test('10. the hook copied alone, with no devflow/ sibling, prints nothing and exits 0', () => {
    const lone = scratch('gsr-lone-');
    const hooksDir = path.join(lone, 'hooks');
    fs.mkdirSync(hooksDir);
    const script = path.join(hooksDir, 'gate-skill-requires.js');
    fs.copyFileSync(HOOK_PATH, script);
    assert.equal(spawnHook(script, typed(), { pathDir: emptyPath }), '');
    assert.equal(spawnHook(script, skillCall('devflow:gh-sync'), { pathDir: emptyPath }), '');
  });
});

describe('run() in process', () => {
  // Required lazily, so a missing hook file fails each test on its own instead of the whole file at load.
  const run = (...args) => require('./gate-skill-requires.js').run(...args);
  let tmpSkills;
  let ghOnly;

  before(() => {
    tmpSkills = scratch('gsr-skills-');
    writeSkill(tmpSkills, 'both', ['requires: [gh, docker]']);
    writeSkill(tmpSkills, 'badreq', ['requires: Not A Tool']);
    writeSkill(tmpSkills, 'plain', []);
    ghOnly = pathDirWith(['gh']);
  });

  test('11. names only the tool that is missing', () => {
    const out = run(typed({ command_name: 'devflow:both', prompt: '/devflow:both' }), {
      env: { PATH: ghOnly },
      skillsDir: tmpSkills,
    });
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /docker/);
    assert.doesNotMatch(out.reason, /\bgh\b/);
  });

  test('11b. names both tools when neither is installed', () => {
    const out = run(skillCall('devflow:both'), { env: { PATH: emptyPath }, skillsDir: tmpSkills });
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /\bgh\b/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /docker/);
  });

  test('11c. an invalid requires: value fails open', () => {
    assert.equal(run(skillCall('devflow:badreq'), { env: { PATH: emptyPath }, skillsDir: tmpSkills }), null);
    assert.equal(
      run(typed({ command_name: 'devflow:badreq', prompt: '/devflow:badreq' }), {
        env: { PATH: emptyPath },
        skillsDir: tmpSkills,
      }),
      null,
    );
  });

  test('11d. a skill without requires: and a missing skill are null', () => {
    assert.equal(run(skillCall('devflow:plain'), { env: { PATH: emptyPath }, skillsDir: tmpSkills }), null);
    assert.equal(run(skillCall('devflow:absent'), { env: { PATH: emptyPath }, skillsDir: tmpSkills }), null);
  });

  test('11e. the escape wins over a missing tool', () => {
    assert.equal(
      run(skillCall('devflow:both'), {
        env: { PATH: emptyPath, DEVFLOW_SKIP_SKILL_REQUIRES: '1' },
        skillsDir: tmpSkills,
      }),
      null,
    );
  });

  test('11f. the default skillsDir is this plugin\'s own skills', () => {
    assert.ok(fs.existsSync(path.join(SKILLS_DIR, 'gh-sync', 'SKILL.md')));
    const out = run(skillCall('devflow:gh-sync'), { env: { PATH: emptyPath } });
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  });

  test('11g. non-object input is null', () => {
    for (const input of [null, undefined, 'x', 3, []]) {
      assert.equal(run(input, { env: { PATH: emptyPath } }), null);
    }
  });
});
