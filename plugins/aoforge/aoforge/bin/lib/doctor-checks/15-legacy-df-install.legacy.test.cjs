'use strict';

// Tests for doctor check 15-legacy-df-install (objective 72, TRD 72-15, INST-01; report-only since objective 78,
// TRD 78-06, SC-3), tests 1-3, 7 and the CLI case 12.
//
// INST-01: no legacy `df-*` skill or agent stays under ~/.claude, and the doctor flags one that reappears. 3.1 keeps the
// report and drops the doctor's own fix: the move is the global upgrade's (objective 36), which runs at session start
// after a plugin update and on demand with `aof-tools upgrade --global --apply`.
//
// 7. `run` warns with the move text (the global upgrade or the manual move); the module exports no `fix`;
//    `doctor --global --fix` neither reports it fixable nor moves anything.
//
// no_llm_test_data: every home is a fresh temp directory from legacy-doctor-fixtures (leftoverHome), with hand-written
// file contents. The real ~/.claude is never read or written: the check gets ctx.userHome, and the CLI case runs with
// HOME pointed at the fake home and neither product environment prefix set.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const check = require('./15-legacy-df-install.cjs');
const doctor = require('../doctor.cjs');
const { NAMES, LEGACY } = require('../legacy-names.cjs');
const F = require('../__fixtures__/legacy-doctor-fixtures.cjs');

const AOF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');

const made = [];
afterEach(() => {
  while (made.length) made.pop().cleanup();
});

function home(opts) {
  const h = F.leftoverHome(opts);
  made.push(h);
  return h;
}

function runFix(h) {
  return doctor.runDoctor({
    userHome: h.home,
    env: {},
    now: F.FIXED_NOW,
    pluginVersion: F.PLUGIN_VERSION,
    scope: 'global',
    fix: true,
    checks: [check],
  });
}

/** `aof-tools doctor --global [--fix] --json` with HOME on the fake home and no product variable. */
function cli(h, args) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(NAMES.envPrefix) || key.startsWith(LEGACY.envPrefix)) continue;
    env[key] = value;
  }
  env.HOME = h.home;
  env.USERPROFILE = h.home;
  const r = spawnSync(process.execPath, [AOF_TOOLS, 'doctor', '--global', ...args, '--json'], {
    cwd: h.home, env, encoding: 'utf-8', timeout: 60000,
  });
  assert.equal(r.status, 0, r.stderr);
  let text = String(r.stdout || '').trim();
  if (text.startsWith('@file:')) {
    const file = text.slice('@file:'.length);
    text = fs.readFileSync(file, 'utf-8');
    fs.rmSync(file, { force: true });
  }
  return JSON.parse(text);
}

// ─── contract ────────────────────────────────────────────────────────────────

describe('legacy-df-install: contract', () => {
  test('7. a global, report-only check: no fix export; reads the home only through ctx', () => {
    assert.equal(check.id, 'legacy-df-install');
    assert.equal(check.scope, 'global');
    assert.deepEqual(doctor.contractIssues(check), []);
    assert.equal(check.fix, undefined, 'report-only: the move belongs to the global upgrade');
    const src = fs.readFileSync(require.resolve('./15-legacy-df-install.cjs'), 'utf-8');
    assert.equal(/os\.homedir|process\.env/.test(src), false, 'never reads os.homedir() or process.env');
    assert.equal(src.includes(`'${LEGACY.installPrefix}'`), false, 'the install prefix comes from LEGACY');
    assert.equal(/moveLegacy/.test(src), false, 'no second mover');
  });

  test('loaded from the checks directory by the engine', () => {
    const ids = doctor.loadChecks().filter((e) => e.mod).map((e) => e.mod.id);
    assert.ok(ids.includes('legacy-df-install'), ids.join(', '));
  });
});

// ─── 1, 7. reappearance is flagged with the move text ────────────────────────

describe('legacy-df-install: report (tests 1, 7)', () => {
  test('1/7. a df- skill and a df- agent -> warn naming both and the move, not fixable', () => {
    const h = home({ dfSkills: ['df-quick'], dfAgents: ['df-planner'] });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('skills/df-quick'), r.finding);
    assert.ok(r.finding.includes('agents/df-planner.md'), r.finding);
    assert.ok(r.finding.includes('load beside the plugin'), r.finding);
    assert.ok(r.finding.includes('~/.claude/aoforge/backups/legacy-<timestamp>/'), r.finding);
    assert.match(r.finding, /global upgrade/);
    assert.match(r.finding, /session start/);
    assert.ok(r.finding.includes('aof-tools upgrade --global --apply'), r.finding);
    assert.match(r.finding, /move them yourself/);
    assert.match(r.fix_command, /upgrade --global --apply$/);
    assert.doesNotMatch(r.fix_command, /doctor/, 'the doctor no longer fixes this');
    assert.equal(r.finding.includes('\n'), false, 'one line');
    assert.deepEqual(r.details.entries, ['skills/df-quick', 'agents/df-planner.md']);
  });

  test('no legacy entries -> ok, not fixable', () => {
    const h = home({});
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.deepEqual(r.details.entries, []);
  });

  test('no skills or agents directory at all -> ok', () => {
    const h = home({});
    fs.rmSync(h.skillsDir, { recursive: true });
    fs.rmSync(h.agentsDir, { recursive: true });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'ok', r.finding);
  });
});

// ─── 2, 7. --fix moves nothing ───────────────────────────────────────────────

describe('legacy-df-install: --fix (tests 2, 7)', () => {
  test('7. a --fix run attempts nothing: the entries stay, no backup is made, the report still warns', () => {
    const h = home({ dfSkills: ['df-quick'], dfAgents: ['df-planner'] });
    const report = runFix(h);
    assert.deepEqual(report.fixes, [], 'no fix attempted');
    assert.equal(report.checks[0].severity, 'warn');
    assert.equal(report.checks[0].fixable, false);
    for (const rel of ['skills/df-quick/SKILL.md', 'agents/df-planner.md']) {
      assert.equal(fs.readFileSync(path.join(h.claudeDir, ...rel.split('/')), 'utf-8'), h.files[rel], rel);
    }
    assert.equal(fs.existsSync(path.join(h.runtimeHome, 'backups')), false, 'no backup directory');
  });
});

// ─── 3. a non-legacy skill is never touched ──────────────────────────────────

describe('legacy-df-install: other skills (test 3)', () => {
  test('3. the user\'s own skill (synced) is never reported', () => {
    const h = home({ dfSkills: ['df-quick'], otherSkills: ['synced', 'notes'] });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.finding.includes('synced'), false, r.finding);
    assert.equal(r.finding.includes('notes'), false, r.finding);
    assert.deepEqual(r.details.entries, ['skills/df-quick']);
  });

  test('3. only synced present -> ok', () => {
    const h = home({ otherSkills: ['synced'] });
    assert.equal(check.run(F.doctorCtx({ home: h.home })).severity, 'ok');
  });
});

// ─── 12. through the CLI ─────────────────────────────────────────────────────

describe('legacy-df-install: CLI (tests 7, 12)', () => {
  test('12. aof-tools doctor --global --json lists legacy-df-install as warn, not fixable', () => {
    const h = home({ dfSkills: ['df-quick'], dfAgents: ['df-planner'] });
    const report = cli(h, []);
    const found = report.checks.find((c) => c.id === 'legacy-df-install');
    assert.ok(found, `legacy-df-install missing: ${report.checks.map((c) => c.id).join(', ')}`);
    assert.equal(found.severity, 'warn', found.finding);
    assert.equal(found.fixable, false);
    assert.ok(fs.existsSync(path.join(h.skillsDir, 'df-quick', 'SKILL.md')));
  });

  test('7. aof-tools doctor --global --fix --json: not reported fixable, no fix entry, nothing moved', () => {
    const h = home({ dfSkills: ['df-quick'], dfAgents: ['df-planner'] });
    const report = cli(h, ['--fix']);
    const found = report.checks.find((c) => c.id === 'legacy-df-install');
    assert.ok(found);
    assert.equal(found.fixable, false);
    assert.equal(report.fixes.some((f) => f.id === 'legacy-df-install'), false, JSON.stringify(report.fixes));
    assert.ok(fs.existsSync(path.join(h.skillsDir, 'df-quick', 'SKILL.md')), 'the skill stays');
    assert.ok(fs.existsSync(path.join(h.agentsDir, 'df-planner.md')), 'the agent stays');
  });
});
