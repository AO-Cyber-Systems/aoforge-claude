'use strict';

// Tests for doctor check 15-legacy-df-install (objective 72, TRD 72-15, INST-01), tests 1-3 and the CLI case 12.
//
// INST-01: no legacy `df-*` skill or agent stays under ~/.claude, and the doctor flags one that reappears. The fix is
// global-upgrade's mover (findLegacy/moveLegacy): every entry is moved into ~/.claude/aoforge/backups/legacy-<ts>/,
// never deleted.
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

/** Every file under `dir`, relative and posix, sorted. */
function listFiles(dir) {
  const out = [];
  (function walk(cur, rel) {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(cur, entry.name), childRel);
      else out.push(childRel);
    }
  })(dir, '');
  return out.sort();
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

// ─── contract ────────────────────────────────────────────────────────────────

describe('legacy-df-install: contract', () => {
  test('a global check with a fix; reads the home only through ctx', () => {
    assert.equal(check.id, 'legacy-df-install');
    assert.equal(check.scope, 'global');
    assert.deepEqual(doctor.contractIssues(check), []);
    assert.equal(typeof check.fix, 'function');
    const src = fs.readFileSync(require.resolve('./15-legacy-df-install.cjs'), 'utf-8');
    assert.equal(/os\.homedir|process\.env/.test(src), false, 'never reads os.homedir() or process.env');
    assert.equal(src.includes(`'${LEGACY.installPrefix}'`), false, 'the install prefix comes from LEGACY');
  });

  test('loaded from the checks directory by the engine', () => {
    const ids = doctor.loadChecks().filter((e) => e.mod).map((e) => e.mod.id);
    assert.ok(ids.includes('legacy-df-install'), ids.join(', '));
  });
});

// ─── 1. reappearance is flagged ──────────────────────────────────────────────

describe('legacy-df-install: report (test 1)', () => {
  test('1. a df- skill and a df- agent -> warn naming both, fixable', () => {
    const h = home({ dfSkills: ['df-quick'], dfAgents: ['df-planner'] });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.severity, 'warn', r.finding);
    assert.equal(r.fixable, true);
    assert.ok(r.finding.includes('skills/df-quick'), r.finding);
    assert.ok(r.finding.includes('agents/df-planner.md'), r.finding);
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

// ─── 2. the fix moves, never deletes ─────────────────────────────────────────

describe('legacy-df-install: fix (test 2)', () => {
  test('2. --fix moves both into backups/legacy-<ts>/{skills,agents}/ unchanged; re-run is ok', () => {
    const h = home({ dfSkills: ['df-quick'], dfAgents: ['df-planner'] });
    const report = runFix(h);

    assert.equal(report.fixes.length, 1);
    const [outcome] = report.fixes;
    assert.equal(outcome.applied, true, outcome.refused || outcome.notes);
    const backupsDir = path.join(h.runtimeHome, 'backups');
    assert.equal(path.dirname(outcome.backup), backupsDir);
    assert.match(path.basename(outcome.backup), /^legacy-2026-10-09T03-00-00-000Z$/);

    // Originals gone, the user's own skill untouched.
    assert.equal(fs.existsSync(path.join(h.skillsDir, 'df-quick')), false);
    assert.equal(fs.existsSync(path.join(h.agentsDir, 'df-planner.md')), false);

    // Nothing deleted: the backup holds every byte.
    for (const rel of ['skills/df-quick/SKILL.md', 'agents/df-planner.md']) {
      assert.equal(fs.readFileSync(path.join(outcome.backup, ...rel.split('/')), 'utf-8'), h.files[rel], rel);
    }
    assert.deepEqual(listFiles(outcome.backup), ['agents/df-planner.md', 'skills/df-quick/SKILL.md']);

    // changed paths are absolute: the engine must not take them for project paths.
    assert.ok(outcome.changed.length > 0 && outcome.changed.every((p) => path.isAbsolute(p)), outcome.changed.join(', '));

    // The post-fix report and a fresh run are ok.
    assert.equal(report.checks[0].severity, 'ok', report.checks[0].finding);
    assert.equal(check.run(F.doctorCtx({ home: h.home })).severity, 'ok');
  });

  test('fix with nothing to move -> not applied, nothing created', () => {
    const h = home({});
    const r = check.fix(F.doctorCtx({ home: h.home }), { severity: 'ok', fixable: false });
    assert.equal(r.applied, false);
    assert.equal(fs.existsSync(path.join(h.runtimeHome, 'backups')), false);
  });
});

// ─── 3. a non-legacy skill is never touched ──────────────────────────────────

describe('legacy-df-install: other skills (test 3)', () => {
  test('3. the user\'s own skill (synced) is never reported or moved', () => {
    const h = home({ dfSkills: ['df-quick'], otherSkills: ['synced', 'notes'] });
    const r = check.run(F.doctorCtx({ home: h.home }));
    assert.equal(r.finding.includes('synced'), false, r.finding);
    assert.equal(r.finding.includes('notes'), false, r.finding);
    assert.deepEqual(r.details.entries, ['skills/df-quick']);

    runFix(h);
    for (const name of ['synced', 'notes']) {
      const rel = `skills/${name}/SKILL.md`;
      assert.equal(fs.readFileSync(path.join(h.claudeDir, ...rel.split('/')), 'utf-8'), h.files[rel], rel);
    }
  });

  test('3. only synced present -> ok', () => {
    const h = home({ otherSkills: ['synced'] });
    assert.equal(check.run(F.doctorCtx({ home: h.home })).severity, 'ok');
  });
});

// ─── 12. through the CLI ─────────────────────────────────────────────────────

describe('legacy-df-install: CLI (test 12)', () => {
  test('12. aof-tools doctor --global --json on a home with df- leftovers lists legacy-df-install as warn', () => {
    const h = home({ dfSkills: ['df-quick'], dfAgents: ['df-planner'] });
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(NAMES.envPrefix) || key.startsWith(LEGACY.envPrefix)) continue;
      env[key] = value;
    }
    env.HOME = h.home;
    env.USERPROFILE = h.home;
    const r = spawnSync(process.execPath, [AOF_TOOLS, 'doctor', '--global', '--json'], {
      cwd: h.home, env, encoding: 'utf-8', timeout: 60000,
    });
    assert.equal(r.status, 0, r.stderr);
    let text = String(r.stdout || '').trim();
    if (text.startsWith('@file:')) {
      const file = text.slice('@file:'.length);
      text = fs.readFileSync(file, 'utf-8');
      fs.rmSync(file, { force: true });
    }
    const report = JSON.parse(text);
    const found = report.checks.find((c) => c.id === 'legacy-df-install');
    assert.ok(found, `legacy-df-install missing: ${report.checks.map((c) => c.id).join(', ')}`);
    assert.equal(found.severity, 'warn', found.finding);
    assert.equal(found.fixable, true);
    // Report mode: nothing moved.
    assert.ok(fs.existsSync(path.join(h.skillsDir, 'df-quick', 'SKILL.md')));
  });
});
