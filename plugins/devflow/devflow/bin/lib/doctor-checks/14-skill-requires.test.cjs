'use strict';

/**
 * 14-skill-requires.test.cjs — TRD 61-02 task 2 (STOR-04): the skill-requires doctor check.
 *
 * Report-only. Skills are literal `skills/<name>/SKILL.md` files inside a fixture install, PATH
 * directories are temp directories holding literal shell scripts, and every ctx carries an explicit
 * `env.PATH`, so the machine's real PATH and `~/.claude` are never read.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const doctor = require('../doctor.cjs');
const { makeDoctorHome, makeInstalledPlugin } = require('../__fixtures__/doctor-fixtures.cjs');
const { INSTALL_HINTS } = require('../skill-requires.cjs');

const check = require('./14-skill-requires.cjs');

const IS_WIN = process.platform === 'win32';
const NOW = new Date('2026-10-06T12:00:00Z');

let scratch;
let binWithGh;
let binEmpty;

before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-requires-doctor-'));
  binWithGh = path.join(scratch, 'bin-gh');
  fs.mkdirSync(binWithGh);
  fs.writeFileSync(path.join(binWithGh, 'gh'), '#!/bin/sh\nexit 0\n', 'utf-8');
  fs.chmodSync(path.join(binWithGh, 'gh'), 0o755);
  binEmpty = path.join(scratch, 'bin-empty');
  fs.mkdirSync(binEmpty);
});

after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

const skillMd = (name, requiresLines) => `---\nname: ${name}\n${requiresLines}---\nbody\n`;

function ctxFor(home, env) {
  return doctor.buildContext({ userHome: home, env, now: NOW });
}

/** A home whose installed plugin carries the given skills: `{ name: frontmatter-lines-after-name }`. */
function homeWithSkills(skills) {
  const home = makeDoctorHome();
  const files = {};
  for (const [name, lines] of Object.entries(skills)) files[`skills/${name}/SKILL.md`] = skillMd(name, lines);
  makeInstalledPlugin(home, { version: '2.11.0', files });
  return home;
}

const GH_SYNC = { 'gh-sync': 'requires:\n  - gh\n' };

describe('14-skill-requires check', () => {
  test('14. exports a report-only global check', () => {
    assert.equal(check.id, 'skill-requires');
    assert.equal(check.scope, 'global');
    assert.equal(typeof check.title, 'string');
    assert.ok(check.title.length > 0);
    assert.equal(typeof check.run, 'function');
    assert.equal(check.fix, undefined);
  });

  test('8. a required tool that is on PATH is ok and the finding names it', { skip: IS_WIN }, () => {
    const r = check.run(ctxFor(homeWithSkills(GH_SYNC), { PATH: binWithGh }));
    assert.equal(r.severity, 'ok', r.finding);
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('gh'), r.finding);
    assert.ok(r.finding.includes('gh (gh-sync)'), r.finding);
    assert.deepEqual(r.details.checked, [{ tool: 'gh', skills: ['gh-sync'], found: path.join(binWithGh, 'gh') }]);
    assert.deepEqual(r.details.missing, []);
  });

  test('9. a required tool that is not on PATH warns with the skill, the hint and details.missing', () => {
    const r = check.run(ctxFor(homeWithSkills(GH_SYNC), { PATH: binEmpty }));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('gh'), r.finding);
    assert.ok(r.finding.includes('/devflow:gh-sync'), r.finding);
    assert.equal(r.fix_command, INSTALL_HINTS.gh);
    assert.deepEqual(r.details.missing, [{ tool: 'gh', skills: ['gh-sync'], hint: INSTALL_HINTS.gh }]);
    assert.deepEqual(r.details.checked, [{ tool: 'gh', skills: ['gh-sync'], found: null }]);
  });

  test('9b. an empty or absent PATH is every tool missing', () => {
    for (const env of [{ PATH: '' }, {}]) {
      const r = check.run(ctxFor(homeWithSkills(GH_SYNC), env));
      assert.equal(r.severity, 'warn', JSON.stringify(env));
      assert.equal(r.details.missing[0].tool, 'gh');
    }
  });

  test('9c. only the missing tool is reported when another is found', { skip: IS_WIN }, () => {
    const home = homeWithSkills({ ...GH_SYNC, builder: 'requires: [gh, docker]\n' });
    const r = check.run(ctxFor(home, { PATH: binWithGh }));
    assert.equal(r.severity, 'warn');
    assert.deepEqual(r.details.missing, [{ tool: 'docker', skills: ['builder'], hint: INSTALL_HINTS.docker }]);
    assert.deepEqual(r.details.checked.map(c => c.tool), ['docker', 'gh']);
    assert.ok(r.finding.includes('docker'), r.finding);
    assert.equal(r.fix_command, INSTALL_HINTS.docker);
  });

  test('10. two skills that need the same missing tool give one entry listing both', () => {
    const home = homeWithSkills({
      zeta: 'requires: [docker]\n',
      alpha: 'requires:\n  - docker\n',
    });
    const r = check.run(ctxFor(home, { PATH: binEmpty }));
    assert.equal(r.severity, 'warn');
    assert.equal(r.details.missing.length, 1);
    assert.deepEqual(r.details.missing[0], {
      tool: 'docker',
      skills: ['alpha', 'zeta'],
      hint: INSTALL_HINTS.docker,
    });
    assert.ok(r.finding.includes('/devflow:alpha'), r.finding);
    assert.ok(r.finding.includes('/devflow:zeta'), r.finding);
    assert.equal(r.fix_command, INSTALL_HINTS.docker);
  });

  test('10b. several missing tools join their hints in the fix command', () => {
    const home = homeWithSkills({ a: 'requires: [gh]\n', b: 'requires: [docker]\n' });
    const r = check.run(ctxFor(home, { PATH: binEmpty }));
    assert.deepEqual(r.details.missing.map(m => m.tool), ['docker', 'gh']);
    assert.equal(r.fix_command, `docker: ${INSTALL_HINTS.docker}; gh: ${INSTALL_HINTS.gh}`);
  });

  test('10c. an unknown tool gets the generic hint', () => {
    const r = check.run(ctxFor(homeWithSkills({ x: 'requires: [frobnicate]\n' }), { PATH: binEmpty }));
    assert.equal(r.details.missing[0].hint, 'install frobnicate and make sure it is on PATH');
  });

  test('11. no skill declaring requires: is ok and says so', () => {
    const r = check.run(ctxFor(homeWithSkills({ plain: 'description: needs nothing\n' }), { PATH: binEmpty }));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('no skill declares requires:'), r.finding);
  });

  test('11b. an installed plugin with no skills directory is the same', () => {
    const home = makeDoctorHome();
    makeInstalledPlugin(home, { version: '2.11.0' });
    const r = check.run(ctxFor(home, { PATH: binEmpty }));
    assert.equal(r.severity, 'ok');
    assert.ok(r.finding.includes('no skill declares requires:'), r.finding);
  });

  test('12. an invalid requires: value warns naming the skill and the bad value', () => {
    const home = homeWithSkills({ broken: 'requires:\n  - Gh CLI\n', fine: 'description: ok\n' });
    const r = check.run(ctxFor(home, { PATH: binEmpty }));
    assert.equal(r.severity, 'warn');
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('broken'), r.finding);
    assert.ok(r.finding.includes('Gh CLI'), r.finding);
    assert.equal(r.details.invalid.length, 1);
    assert.equal(r.details.invalid[0].skill, 'broken');
    assert.ok(r.details.invalid[0].error.includes('Gh CLI'));
    assert.deepEqual(r.details.missing, []);
  });

  test('12b. an invalid value and a missing tool are both reported', () => {
    const home = homeWithSkills({ ...GH_SYNC, broken: 'requires:\n  - Gh CLI\n' });
    const r = check.run(ctxFor(home, { PATH: binEmpty }));
    assert.equal(r.severity, 'warn');
    assert.ok(r.finding.includes('/devflow:gh-sync'), r.finding);
    assert.ok(r.finding.includes('Gh CLI'), r.finding);
    assert.equal(
      r.fix_command,
      `${INSTALL_HINTS.gh}; correct requires: in the named SKILL.md (a tool name or a list of tool names) and release`,
    );
  });

  test('13a. no installed plugin and no override is ok, and says there is nothing to check', () => {
    const r = check.run(ctxFor(makeDoctorHome(), { PATH: binEmpty }));
    assert.equal(r.severity, 'ok');
    assert.equal(r.fixable, false);
    assert.ok(r.finding.includes('no installed plugin to check'), r.finding);
  });

  test('13b. with no installed plugin, DEVFLOW_DOCTOR_PLUGIN_ROOT is the root that is checked', () => {
    const pluginRoot = path.join(scratch, 'override-root');
    fs.mkdirSync(path.join(pluginRoot, 'skills', 'gh-sync'), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, 'skills', 'gh-sync', 'SKILL.md'), skillMd('gh-sync', 'requires:\n  - gh\n'), 'utf-8');
    const r = check.run(ctxFor(makeDoctorHome(), { PATH: binEmpty, DEVFLOW_DOCTOR_PLUGIN_ROOT: pluginRoot }));
    assert.equal(r.severity, 'warn');
    assert.deepEqual(r.details.missing.map(m => m.tool), ['gh']);
  });

  test('13c. an installed plugin wins over the override', () => {
    const pluginRoot = path.join(scratch, 'ignored-root');
    fs.mkdirSync(path.join(pluginRoot, 'skills', 'gh-sync'), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, 'skills', 'gh-sync', 'SKILL.md'), skillMd('gh-sync', 'requires:\n  - gh\n'), 'utf-8');
    const home = homeWithSkills({ plain: 'description: needs nothing\n' });
    const r = check.run(ctxFor(home, { PATH: binEmpty, DEVFLOW_DOCTOR_PLUGIN_ROOT: pluginRoot }));
    assert.equal(r.severity, 'ok', r.finding);
  });

  test('13d. an override that is not a directory is ignored', () => {
    const r = check.run(ctxFor(makeDoctorHome(), { PATH: binEmpty, DEVFLOW_DOCTOR_PLUGIN_ROOT: path.join(scratch, 'no-such-root') }));
    assert.equal(r.severity, 'ok');
    assert.ok(r.finding.includes('no installed plugin to check'), r.finding);
  });

  test('15. it runs through the engine as a global check and never touches the real PATH', () => {
    const home = homeWithSkills(GH_SYNC);
    const report = doctor.runDoctor({
      userHome: home,
      env: { PATH: binEmpty },
      now: NOW,
      scope: 'global',
      checks: [check],
    });
    const entry = report.checks.find(c => c.id === 'skill-requires');
    assert.ok(entry, JSON.stringify(report.checks));
    assert.equal(entry.severity, 'warn');
    assert.equal(entry.fixable, false);
  });
});
