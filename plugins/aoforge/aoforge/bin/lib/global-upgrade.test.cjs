'use strict';

/**
 * global-upgrade.test.cjs — TRD 36-06 (UPG-06), tests 1-14.
 *
 * Every case runs against a disposable fake home from `makeFakeHome` (os.tmpdir()). Nothing here may
 * read or write the real ~/.claude: the lib takes `userHome` explicitly, and as a second fence this
 * file points HOME at a throwaway directory before anything else loads.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Fence: any accidental home lookup lands in a scratch dir, never the real one.
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gu-fence-home-'));

const {
  makeFakeHome,
  HAND_WRITTEN_ROUTING,
  snapshot,
} = require('./__fixtures__/upgrade-fixtures.cjs');
const managedBlock = require('./managed-block.cjs');
const notices = require('./notices.cjs');

const MOD_PATH = path.join(__dirname, 'global-upgrade.cjs');
const REAL_TEMPLATE = path.join(__dirname, '..', '..', 'templates', 'global-claude-md.md');
const NOW = new Date('2026-09-27T12:00:00.000Z');
const TS = '2026-09-27T12-00-00-000Z';

function gu() {
  return require(MOD_PATH);
}

function fakeHome(t, opts) {
  const home = makeFakeHome(opts);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function claudeMdPath(home) {
  return path.join(home, '.claude', 'CLAUDE.md');
}

function globalNotices(home) {
  return notices.readNotices(notices.globalNoticesPath(home));
}

function unconsumed(home) {
  return globalNotices(home).filter((n) => n.consumed !== true);
}

function backupsDir(home) {
  return path.join(home, '.claude', 'aoforge', 'backups');
}

function listBackups(home, prefix) {
  const dir = backupsDir(home);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => d.startsWith(prefix)).sort();
}

function writeTemplate(t, version, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gu-tpl-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'global-claude-md.md');
  fs.writeFileSync(file, `---\ntemplate: global-claude-md\ntemplate_version: "${version}"\n---\n${body}`);
  return file;
}

// 1
test('1: runGlobalUpgrade without userHome throws (no default home)', () => {
  const { runGlobalUpgrade } = gu();
  assert.throws(() => runGlobalUpgrade({}), /userHome/);
  assert.throws(() => runGlobalUpgrade(), /userHome/);
});

// 2
test('2: legacy df-* skills/agents and aoforge/VERSION move into backups/legacy-<ts>, bytes intact', (t) => {
  const home = fakeHome(t, { legacy: true });
  const c = path.join(home, '.claude');
  const before = {
    skill: fs.readFileSync(path.join(c, 'skills/df-plan/SKILL.md')),
    agent: fs.readFileSync(path.join(c, 'agents/df-planner.md')),
    version: fs.readFileSync(path.join(c, 'aoforge/VERSION')),
    keep: fs.readFileSync(path.join(c, 'skills/keep-me/SKILL.md')),
  };

  const report = gu().runGlobalUpgrade({ userHome: home, pluginVersion: '9.9.9', now: NOW });

  const backup = path.join(c, 'aoforge', 'backups', `legacy-${TS}`);
  assert.equal(report.legacy.backupDir, backup);
  assert.deepEqual([...report.legacy.moved].sort(), ['agents/df-planner.md', 'aoforge/VERSION', 'skills/df-plan']);

  assert.deepEqual(fs.readFileSync(path.join(backup, 'skills/df-plan/SKILL.md')), before.skill);
  assert.deepEqual(fs.readFileSync(path.join(backup, 'agents/df-planner.md')), before.agent);
  assert.deepEqual(fs.readFileSync(path.join(backup, 'aoforge/VERSION')), before.version);

  assert.equal(fs.existsSync(path.join(c, 'skills/df-plan')), false, 'legacy skill still in place');
  assert.equal(fs.existsSync(path.join(c, 'agents/df-planner.md')), false, 'legacy agent still in place');
  assert.equal(fs.existsSync(path.join(c, 'aoforge/VERSION')), false, 'legacy VERSION still in place');

  assert.deepEqual(fs.readFileSync(path.join(c, 'skills/keep-me/SKILL.md')), before.keep);
  assert.equal(fs.existsSync(path.join(backup, 'skills/keep-me')), false, 'non-df sibling was moved');

  const legacyNotices = unconsumed(home).filter((n) => n.key === 'global-legacy-moved');
  assert.equal(legacyNotices.length, 1);
  assert.equal(legacyNotices[0].level, 'info');
  assert.match(legacyNotices[0].message, new RegExp(`legacy-${TS}`));
});

// 3
test('3: a second legacy run moves nothing and queues no new notice', (t) => {
  const home = fakeHome(t, { legacy: true });
  const { runGlobalUpgrade } = gu();
  runGlobalUpgrade({ userHome: home, now: NOW });
  const noticesAfterFirst = globalNotices(home).length;

  const second = runGlobalUpgrade({ userHome: home, now: new Date('2026-09-28T12:00:00.000Z') });
  assert.deepEqual(second.legacy.moved, []);
  assert.equal(globalNotices(home).length, noticesAfterFirst);
  assert.deepEqual(listBackups(home, 'legacy-'), [`legacy-${TS}`]);
});

// 4
test('4: first run over a hand-written AOForge Routing section writes nothing and queues one adopt notice', (t) => {
  const home = fakeHome(t, { claudeMd: HAND_WRITTEN_ROUTING });

  const report = gu().runGlobalUpgrade({ userHome: home, now: NOW });

  assert.equal(fs.readFileSync(claudeMdPath(home), 'utf-8'), HAND_WRITTEN_ROUTING);
  assert.equal(report.block.action, 'adopt_pending');
  assert.equal(report.block.backup, null);
  assert.deepEqual(listBackups(home, 'global-'), []);

  const pending = unconsumed(home);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].key, 'global-claude-md-adopt');
  assert.equal(pending[0].level, 'action');
  assert.match(pending[0].message, /aof-tools upgrade --global --confirm/);
  assert.ok(pending[0].detail.includes('- # AOForge Routing'), 'detail lacks the removed heading line');
  // The version comes from the template, not a literal (TRD 72-09 bumped it to 4).
  const v = gu().loadGlobalTemplate(REAL_TEMPLATE).version;
  assert.ok(
    pending[0].detail.includes(`+ <!-- AOFORGE:START v=${v} src=global-claude-md -->`),
    'detail lacks the added START marker line',
  );
  assert.ok(!pending[0].detail.includes('- ## TDD & Quality'), 'the next heading must not be proposed for removal');
});

// 5
test('5: repeating the notice-only run keeps exactly one unconsumed adopt notice', (t) => {
  const home = fakeHome(t, { claudeMd: HAND_WRITTEN_ROUTING });
  const { runGlobalUpgrade } = gu();
  runGlobalUpgrade({ userHome: home, now: NOW });
  runGlobalUpgrade({ userHome: home, now: new Date('2026-09-27T13:00:00.000Z') });

  const adopt = unconsumed(home).filter((n) => n.key === 'global-claude-md-adopt');
  assert.equal(adopt.length, 1);
  assert.equal(fs.readFileSync(claudeMdPath(home), 'utf-8'), HAND_WRITTEN_ROUTING);
});

// 6
test('6: confirm adopts — the section becomes the block, everything else byte-identical, backup taken', (t) => {
  const home = fakeHome(t, { claudeMd: HAND_WRITTEN_ROUTING });
  const { runGlobalUpgrade, loadGlobalTemplate } = gu();

  const report = runGlobalUpgrade({ userHome: home, confirm: true, now: NOW });
  assert.equal(report.block.action, 'adopted');

  const tpl = loadGlobalTemplate(REAL_TEMPLATE);
  const block = managedBlock.render(tpl.body, { v: tpl.version, src: 'global-claude-md' });
  const head = HAND_WRITTEN_ROUTING.slice(0, HAND_WRITTEN_ROUTING.indexOf('# AOForge Routing'));
  const tail = HAND_WRITTEN_ROUTING.slice(HAND_WRITTEN_ROUTING.indexOf('## TDD & Quality'));
  const after = fs.readFileSync(claudeMdPath(home), 'utf-8');

  assert.ok(after.startsWith(head), 'text before the section changed');
  assert.ok(after.endsWith(tail), 'text from ## TDD & Quality to EOF changed');
  assert.equal(after, `${head}${block}\n\n${tail}`);

  const backupFile = path.join(backupsDir(home), `global-${TS}`, 'CLAUDE.md');
  assert.equal(report.block.backup, backupFile);
  assert.equal(fs.readFileSync(backupFile, 'utf-8'), HAND_WRITTEN_ROUTING);
});

// 7
test('7: after adoption, a plain run with the same template is a no-op', (t) => {
  const home = fakeHome(t, { claudeMd: HAND_WRITTEN_ROUTING });
  const { runGlobalUpgrade } = gu();
  runGlobalUpgrade({ userHome: home, confirm: true, now: NOW });
  const adoptedText = fs.readFileSync(claudeMdPath(home), 'utf-8');
  const noticeCount = globalNotices(home).length;

  const report = runGlobalUpgrade({ userHome: home, now: new Date('2026-09-28T12:00:00.000Z') });
  assert.equal(report.block.action, 'none');
  assert.equal(report.block.backup, null);
  assert.equal(fs.readFileSync(claudeMdPath(home), 'utf-8'), adoptedText);
  assert.deepEqual(listBackups(home, 'global-'), [`global-${TS}`]);
  assert.equal(globalNotices(home).length, noticeCount);
});

// 8
test('8: a template version bump rewrites only the block', (t) => {
  const oldBlock = managedBlock.render('# AOForge Routing\n\nold body', { v: '1', src: 'global-claude-md' });
  const text = `head\n\n${oldBlock}\n\ntail\n`;
  const home = fakeHome(t, { claudeMd: text });
  const tplPath = writeTemplate(t, '2', '# AOForge Routing\n\nnew body v2\n');

  const report = gu().runGlobalUpgrade({ userHome: home, templatePath: tplPath, now: NOW });
  assert.equal(report.block.action, 'updated');

  const after = fs.readFileSync(claudeMdPath(home), 'utf-8');
  const newBlock = managedBlock.render('# AOForge Routing\n\nnew body v2', { v: '2', src: 'global-claude-md' });
  assert.ok(after.startsWith('head\n\n'));
  assert.ok(after.endsWith('\n\ntail\n'));
  assert.equal(after, `head\n\n${newBlock}\n\ntail\n`);

  const all = unconsumed(home);
  assert.equal(all.length, 1);
  assert.equal(all[0].level, 'info');
  assert.equal(fs.readFileSync(report.block.backup, 'utf-8'), text);
});

// 9
test('9: no block and no routing section — the block is appended after one blank line', (t) => {
  const home = fakeHome(t, { claudeMd: '# Mine\n\nx\n' });
  const { runGlobalUpgrade, loadGlobalTemplate } = gu();

  const report = runGlobalUpgrade({ userHome: home, now: NOW });
  assert.equal(report.block.action, 'created');

  const tpl = loadGlobalTemplate(REAL_TEMPLATE);
  const block = managedBlock.render(tpl.body, { v: tpl.version, src: 'global-claude-md' });
  const after = fs.readFileSync(claudeMdPath(home), 'utf-8');
  assert.ok(after.startsWith('# Mine\n\nx\n'));
  assert.equal(after, `# Mine\n\nx\n\n${block}\n`);
});

// 10
test('10: no CLAUDE.md at all — the file is created holding just the block', (t) => {
  const home = fakeHome(t);
  const { runGlobalUpgrade, loadGlobalTemplate } = gu();

  const report = runGlobalUpgrade({ userHome: home, now: NOW });
  assert.equal(report.block.action, 'created');
  assert.equal(report.block.backup, null, 'nothing to back up when the file did not exist');

  const tpl = loadGlobalTemplate(REAL_TEMPLATE);
  const block = managedBlock.render(tpl.body, { v: tpl.version, src: 'global-claude-md' });
  assert.equal(fs.readFileSync(claudeMdPath(home), 'utf-8'), `${block}\n`);
});

// 11
test('11: two blocks — blocked, CLAUDE.md unchanged, one warn notice', (t) => {
  const one = managedBlock.render('a', { v: '1', src: 'global-claude-md' });
  const text = `x\n\n${one}\n\ny\n\n${one}\n`;
  const home = fakeHome(t, { claudeMd: text });

  const report = gu().runGlobalUpgrade({ userHome: home, now: NOW });
  assert.equal(report.block.action, 'blocked');
  assert.equal(fs.readFileSync(claudeMdPath(home), 'utf-8'), text);
  assert.deepEqual(listBackups(home, 'global-'), []);

  const all = unconsumed(home);
  assert.equal(all.length, 1);
  assert.equal(all[0].level, 'warn');
});

// 12
test('12: dryRun reports the plan and writes nothing under the fake home', (t) => {
  const home = fakeHome(t, { legacy: true, claudeMd: HAND_WRITTEN_ROUTING });
  const before = snapshot(home);

  const report = gu().runGlobalUpgrade({ userHome: home, dryRun: true, now: NOW });
  assert.deepEqual([...report.legacy.moved].sort(), ['agents/df-planner.md', 'aoforge/VERSION', 'skills/df-plan']);
  assert.equal(report.block.action, 'adopt_pending');
  assert.ok(Array.isArray(report.notices) && report.notices.length >= 1, 'dry run should list the notices it would queue');

  assert.deepEqual(snapshot(home), before);
  assert.equal(fs.existsSync(backupsDir(home)), false, 'dry run created a backups dir');
  assert.equal(fs.existsSync(notices.globalNoticesPath(home)), false, 'dry run wrote a notices file');
});

// 13
test('13: the real global template is version 4 and routes to /aoforge: skills only (TRD 37-10: adopt added; TRD 53-05: doctor added; TRD 72-09: AOForge routing)', () => {
  const tpl = gu().loadGlobalTemplate(REAL_TEMPLATE);
  assert.equal(tpl.version, '4');
  for (const cmd of ['/aoforge:build', '/aoforge:plan-objective', '/aoforge:status', '/aoforge:adopt', '/aoforge:doctor']) {
    assert.ok(tpl.body.includes(cmd), `template body lacks ${cmd}`);
  }
  assert.ok(!tpl.body.includes('/df:'), 'template body still references /df: commands');
  assert.ok(!tpl.body.startsWith('---'), 'frontmatter leaked into the body');
});

// 14
// TRD 72-09 added ./legacy-rewrite.cjs, ./legacy-names.cjs and ./text-escape.cjs (sync-runtime's test copies them too).
test('14: global-upgrade.cjs requires only Node built-ins and its listed lib closure', () => {
  const src = fs.readFileSync(MOD_PATH, 'utf-8');
  const allowed = new Set([
    'fs', 'path', 'os', 'crypto', './managed-block.cjs', './notices.cjs',
    './legacy-rewrite.cjs', './legacy-names.cjs', './text-escape.cjs',
  ]);
  const required = [...src.matchAll(/require\(\s*(['"`])([^'"`]+)\1\s*\)/g)].map((m) => m[2]);
  assert.ok(required.length > 0, 'found no require calls at all');
  const extra = required.filter((r) => !allowed.has(r));
  assert.deepEqual(extra, [], `disallowed requires: ${extra.join(', ')}`);
  assert.equal(/require\(\s*[^'"`\s]/.test(src), false, 'dynamic require found');
});
