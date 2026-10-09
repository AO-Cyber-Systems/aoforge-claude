'use strict';

/**
 * global-upgrade.legacy.test.cjs — objective 72, TRD 72-09 (INST-03, INST-06): the global
 * ~/.claude/CLAUDE.md written before the rename.
 *
 * Test list:
 *  1.  A v3 legacy-marker block, no legacy name outside it: runGlobalUpgrade({ userHome }) rewrites the
 *      block to the v4 template under AOFORGE markers with /aoforge: routing, backs up the old file,
 *      writes exactly one block and proposes nothing outside (outside.lines 0, no outside notice).
 *  2.  The same block plus one hand-written line outside it naming the old product: without confirm the
 *      block is still rewritten (a template bump), the outside line is unchanged, the result carries
 *      outside: { lines: 1, diff } with the -old/+new lines, and an action notice names
 *      `aof-tools upgrade --global --confirm` with the diff as its detail.
 *  3.  Same with confirm: the outside line now names AOForge, the devflowops line (another product) is
 *      unchanged, one backup holds the old file, outside.applied is true, and the pending outside notice
 *      is superseded by an info one (same key).
 *  4.  CLI (fake HOME): `upgrade --global --raw` prints the unified diff (-/+ lines at line start) and
 *      writes nothing; `upgrade --global` (JSON) carries it as outside_diff; `--global --apply` writes
 *      the block but not the outside line; `--global --confirm` writes the outside line.
 *  5.  A hand-written routing section with no block (the pre-36 shape) keeps today's notice-only
 *      behaviour under both the "DevFlow Routing" and the "AOForge Routing" heading: nothing written,
 *      one adopt notice, nothing proposed outside; confirm adopts it into the v4 block.
 *  6.  The real template is version 4 and its routing names only AOForge (/aoforge:, aoforge@aocyber,
 *      aoforge/adopt).
 *
 * Every case runs in a throwaway home (legacy-claude-md-fixtures fakeHomeWith). The real ~/.claude is
 * never read or written: the lib takes userHome explicitly, HOME is fenced to a scratch directory
 * before anything loads, and the CLI is spawned with HOME=<fake>.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Fence: any accidental home lookup lands in a scratch dir, never the real one.
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-gu-legacy-fence-home-'));

const fx = require('./__fixtures__/legacy-claude-md-fixtures.cjs');
const { gitEnv } = require('./__fixtures__/upgrade-fixtures.cjs');
const managedBlock = require('./managed-block.cjs');
const notices = require('./notices.cjs');
const { runGlobalUpgrade, loadGlobalTemplate } = require('./global-upgrade.cjs');

const REAL_TEMPLATE = path.join(__dirname, '..', '..', 'templates', 'global-claude-md.md');
const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const NOW = new Date('2026-10-08T12:00:00.000Z');
const TPL = loadGlobalTemplate(REAL_TEMPLATE);
const SRC = 'global-claude-md';
const OUTSIDE_KEY = 'global-claude-md-outside';

function home(t, text) {
  const h = fx.fakeHomeWith(text);
  t.after(() => fs.rmSync(h, { recursive: true, force: true }));
  return h;
}

const claudeMd = (h) => path.join(h, '.claude', 'CLAUDE.md');
const readMd = (h) => fs.readFileSync(claudeMd(h), 'utf-8');
const unconsumed = (h) => notices.readNotices(notices.globalNoticesPath(h)).filter((n) => n.consumed !== true);

function backups(h) {
  const dir = path.join(h, '.claude', 'aoforge', 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => d.startsWith('global-')).map((d) => path.join(dir, d, 'CLAUDE.md'));
}

/** The fixture text with the legacy block swapped for the current-template block (and the outside line as given). */
function expected({ outsideLegacy, outsideRewritten = false }) {
  const text = fx.globalClaudeMd({ outsideLegacy });
  const at = text.indexOf(fx.LEGACY_GLOBAL_BLOCK);
  let tail = text.slice(at + fx.LEGACY_GLOBAL_BLOCK.length);
  if (outsideRewritten) tail = tail.replace(fx.OUTSIDE_LEGACY_LINE, fx.OUTSIDE_LEGACY_LINE_NEW);
  return text.slice(0, at) + managedBlock.render(TPL.body, { v: TPL.version, src: SRC }) + tail;
}

function aofTools(args, h) {
  const r = spawnSync(process.execPath, [AOF_TOOLS, 'upgrade', ...args], {
    cwd: h,
    env: gitEnv(h),
    encoding: 'utf-8',
    timeout: 60000,
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* --raw output */
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

test('1: a v3 legacy-marker block becomes the v4 AOFORGE block; old file backed up; one block', (t) => {
  const before = fx.globalClaudeMd({ outsideLegacy: false });
  const h = home(t, before);

  const report = runGlobalUpgrade({ userHome: h, now: NOW });

  assert.equal(report.block.action, 'updated');
  assert.equal(report.block.from, '3');
  assert.equal(report.block.to, '4');
  const after = readMd(h);
  assert.equal(after, expected({ outsideLegacy: false }));
  assert.ok(after.includes('<!-- AOFORGE:START v=4 src=global-claude-md -->'));
  assert.ok(after.includes('/aoforge:build') && !after.includes('/devflow:'), 'routing is not AOForge');
  assert.ok(!after.includes('DEVFLOW:'), 'a legacy marker survived');
  assert.equal(after.split(':START').length - 1, 1, 'exactly one block');
  assert.equal(managedBlock.read(after).tag, 'AOFORGE');

  const b = backups(h);
  assert.equal(b.length, 1);
  assert.equal(fs.readFileSync(b[0], 'utf-8'), before);

  assert.deepEqual({ lines: report.outside.lines, diff: report.outside.diff, applied: report.outside.applied }, {
    lines: 0,
    diff: '',
    applied: false,
  });
  assert.ok(!unconsumed(h).some((n) => n.key === OUTSIDE_KEY), 'an outside notice was queued');
});

test('2: without confirm the block is rewritten and the outside line is only proposed', (t) => {
  const h = home(t, fx.globalClaudeMd());

  const report = runGlobalUpgrade({ userHome: h, now: NOW });

  assert.equal(report.block.action, 'updated');
  const after = readMd(h);
  assert.equal(after, expected({ outsideLegacy: true }));
  assert.ok(after.includes(fx.OUTSIDE_LEGACY_LINE), 'the outside line changed without confirm');
  assert.ok(after.includes('a later devflowops move'), 'the other product changed');

  assert.equal(report.outside.lines, 1);
  assert.equal(report.outside.applied, false);
  const diffLines = report.outside.diff.split('\n');
  assert.ok(diffLines.includes(`-${fx.OUTSIDE_LEGACY_LINE}`), report.outside.diff);
  assert.ok(diffLines.includes(`+${fx.OUTSIDE_LEGACY_LINE_NEW}`), report.outside.diff);
  assert.ok(!diffLines.some((l) => /^[-+](?!--|\+\+).*devflowops/.test(l)), 'the other product is proposed for change');
  assert.ok(!diffLines.some((l) => /^[-+].*:START/.test(l)), 'the block itself is part of the outside diff');

  const pending = unconsumed(h).filter((n) => n.key === OUTSIDE_KEY);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].level, 'action');
  assert.match(pending[0].message, /aof-tools upgrade --global --confirm/);
  assert.equal(pending[0].detail, report.outside.diff);
});

test('3: with confirm the outside line is rewritten too; devflowops stays; backup first', (t) => {
  const before = fx.globalClaudeMd();
  const h = home(t, before);

  runGlobalUpgrade({ userHome: h, now: NOW }); // queues the pending outside notice
  const report = runGlobalUpgrade({ userHome: h, now: NOW, confirm: true });

  const after = readMd(h);
  assert.equal(after, expected({ outsideLegacy: true, outsideRewritten: true }));
  assert.ok(after.includes(fx.OUTSIDE_LEGACY_LINE_NEW));
  assert.ok(after.includes('a later devflowops move'), 'the other product changed');
  assert.equal(report.outside.lines, 1);
  assert.equal(report.outside.applied, true);

  const b = backups(h);
  assert.equal(b.length, 2, 'one backup per writing run');
  assert.ok(b.some((f) => fs.readFileSync(f, 'utf-8') === before), 'no backup holds the original file');
  assert.ok(report.outside.backup && fs.existsSync(report.outside.backup), 'the confirming run kept a backup');

  const outsideNotices = unconsumed(h).filter((n) => n.key === OUTSIDE_KEY);
  assert.equal(outsideNotices.length, 1, 'the pending notice was not superseded');
  assert.equal(outsideNotices[0].level, 'info');

  const again = runGlobalUpgrade({ userHome: h, now: NOW, confirm: true });
  assert.equal(again.block.action, 'none');
  assert.equal(again.outside.lines, 0, 'a second confirmed run still proposes a change');
});

test('4: CLI prints the diff, --apply leaves the outside line, --confirm writes it', (t) => {
  const before = fx.globalClaudeMd();
  const h = home(t, before);

  const raw = aofTools(['--global', '--raw'], h);
  assert.equal(raw.status, 0, raw.stderr);
  const rawLines = raw.stdout.split('\n');
  assert.ok(rawLines.includes(`-${fx.OUTSIDE_LEGACY_LINE}`), raw.stdout);
  assert.ok(rawLines.includes(`+${fx.OUTSIDE_LEGACY_LINE_NEW}`), raw.stdout);
  assert.match(raw.stdout, /aof-tools upgrade --global --confirm/);
  assert.equal(readMd(h), before, '--global alone wrote CLAUDE.md');

  const plan = aofTools(['--global'], h);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(plan.json.dryRun, true);
  assert.ok(plan.json.outside_diff.split('\n').includes(`-${fx.OUTSIDE_LEGACY_LINE}`), plan.stdout);
  assert.equal(readMd(h), before);

  const apply = aofTools(['--global', '--apply'], h);
  assert.equal(apply.status, 0, apply.stderr);
  assert.equal(apply.json.block.action, 'updated');
  assert.equal(readMd(h), expected({ outsideLegacy: true }), '--apply touched the outside line');

  const confirm = aofTools(['--global', '--confirm'], h);
  assert.equal(confirm.status, 0, confirm.stderr);
  assert.equal(confirm.json.outside.applied, true);
  assert.equal(readMd(h), expected({ outsideLegacy: true, outsideRewritten: true }));
  assert.equal(backups(h).length, 2, 'each writing run keeps a backup');
});

test('5: a hand-written routing section with no block stays notice-only under either heading', (t) => {
  for (const heading of ['DevFlow Routing', 'AOForge Routing']) {
    const before = fx.handWrittenRoutingClaudeMd(heading);
    const h = home(t, before);

    const report = runGlobalUpgrade({ userHome: h, now: NOW });
    assert.equal(report.block.action, 'adopt_pending', heading);
    assert.equal(readMd(h), before, `${heading}: written without confirm`);
    assert.deepEqual(backups(h), []);
    const pending = unconsumed(h);
    assert.equal(pending.length, 1, `${heading}: ${pending.map((n) => n.key).join(', ')}`);
    assert.equal(pending[0].key, 'global-claude-md-adopt');
    assert.ok(pending[0].detail.includes(`- # ${heading}`), 'the routing heading is not proposed for removal');
    assert.equal(report.outside.lines, 0);

    const adopted = runGlobalUpgrade({ userHome: h, now: NOW, confirm: true });
    assert.equal(adopted.block.action, 'adopted', heading);
    const after = readMd(h);
    assert.ok(after.includes('<!-- AOFORGE:START v=4 src=global-claude-md -->'));
    assert.ok(!after.includes(`# ${heading}\n\nThe DevFlow plugin`), 'the hand-written section survived adoption');
    assert.ok(after.includes(fx.OUTSIDE_PLAIN_LINE), 'text after the routing section was lost');
  }
});

test('6: the real template is version 4 and routes to AOForge only', () => {
  assert.equal(TPL.version, '4');
  for (const s of ['/aoforge:build', '/aoforge:doctor', '`aoforge@aocyber`', 'aoforge/adopt', '# AOForge Routing']) {
    assert.ok(TPL.body.includes(s), `template body lacks ${s}`);
  }
  assert.ok(!/devflow/i.test(TPL.body), 'template body names the old product');
});
