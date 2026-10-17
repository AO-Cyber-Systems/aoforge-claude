'use strict';

/**
 * global-upgrade.legacy.test.cjs — objective 78, TRD 78-08 (SC-2, SC-4; replaces the TRD 72-09 list): AOForge 3.1
 * no longer moves a block under the pre-rename markers in ~/.claude/CLAUDE.md, and no longer proposes or writes a
 * rewrite of hand-written text outside the block. A pre-rename block, or a hand-written pre-rename routing heading,
 * gets one global notice naming the fix, and nothing is written.
 *
 * Test list:
 *  1.  A v3 pre-rename block with a hand-written legacy line outside it (LF and CRLF): runGlobalUpgrade writes
 *      nothing (byte-identical, no backup), reports block.action 'pre_rename' and no `outside`, and queues exactly
 *      one `action` notice (source global-upgrade, key global-claude-md-pre-rename) whose message carries the W069
 *      text for ~/.claude/CLAUDE.md: the marker rename and AOForge 3.0.x. A second run and a confirm run change
 *      nothing and still leave one unconsumed notice.
 *  1b. CLI (fake HOME): `upgrade --global --apply` and `--global --confirm` leave the file byte-identical and print
 *      JSON with no `outside` and no `outside_diff`; `--global --raw` prints the refusal and no outside section.
 *  2.  A hand-written "DevFlow Routing" section and no block: byte-identical with and without confirm, block action
 *      'pre_rename', one notice naming the file, the heading and AOForge 3.0.x, no block added; the CLI agrees.
 *  3.  A hand-written "AOForge Routing" section keeps today's notice-only behaviour, and confirm adopts it into the
 *      current block (the adoption path is unchanged).
 *  6.  The real template routes to AOForge only (/aoforge:, aoforge@aocyber, aoforge/adopt) and never names the old
 *      product.
 *
 * Every case runs in a throwaway home (legacy-claude-md-fixtures fakeHomeWith). The real ~/.claude is never read or
 * written: the lib takes userHome explicitly, HOME is fenced to a scratch directory before anything loads, and the
 * CLI is spawned with HOME=<fake>.
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
const notices = require('./notices.cjs');
const { legacyBlockMessage } = require('./planning-layout.cjs');
const { runGlobalUpgrade, loadGlobalTemplate } = require('./global-upgrade.cjs');

const REAL_TEMPLATE = path.join(__dirname, '..', '..', 'templates', 'global-claude-md.md');
const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const NOW = new Date('2026-10-16T12:00:00.000Z');
const TPL = loadGlobalTemplate(REAL_TEMPLATE);
const PRE_RENAME_KEY = 'global-claude-md-pre-rename';
const DISPLAY = '~/.claude/CLAUDE.md';
const W069 = legacyBlockMessage(DISPLAY);

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
  return fs.readdirSync(dir).filter((d) => d.startsWith('global-'));
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

/** Exactly one unconsumed notice, the pre-rename one; returns it. */
function onePreRenameNotice(h) {
  const all = unconsumed(h);
  assert.equal(all.length, 1, `expected one notice, got: ${all.map((n) => n.key).join(', ')}`);
  const [n] = all;
  assert.equal(n.key, PRE_RENAME_KEY);
  assert.equal(n.level, 'action');
  assert.equal(n.source, 'global-upgrade');
  assert.ok(n.message.includes(DISPLAY), n.message);
  assert.match(n.message, /3\.0\.x/);
  return n;
}

test('1: a pre-rename block is refused: byte-identical, no backup, no outside, one notice with the W069 fix', (t) => {
  for (const crlf of [false, true]) {
    const before = fx.globalClaudeMd({ crlf });
    const h = home(t, before);

    const report = runGlobalUpgrade({ userHome: h, now: NOW });
    assert.equal(report.block.action, 'pre_rename', `crlf=${crlf}`);
    assert.equal(report.block.backup, null);
    assert.ok(!('outside' in report), 'the report still carries an outside proposal');
    assert.equal(readMd(h), before, `crlf=${crlf}: CLAUDE.md changed`);
    assert.deepEqual(backups(h), []);

    const n = onePreRenameNotice(h);
    assert.ok(n.message.includes(W069.message), n.message);
    assert.ok(n.message.includes(W069.fix), n.message);

    const again = runGlobalUpgrade({ userHome: h, now: NOW });
    const confirmed = runGlobalUpgrade({ userHome: h, now: NOW, confirm: true });
    for (const r of [again, confirmed]) {
      assert.equal(r.block.action, 'pre_rename');
      assert.ok(!('outside' in r));
    }
    assert.equal(readMd(h), before, 'a later run or --confirm wrote CLAUDE.md');
    assert.deepEqual(backups(h), []);
    onePreRenameNotice(h);
  }
});

test('1b: CLI --global --apply / --confirm write nothing and print no outside section', (t) => {
  const before = fx.globalClaudeMd();
  const h = home(t, before);

  const raw = aofTools(['--global', '--raw'], h);
  assert.equal(raw.status, 0, raw.stderr);
  assert.ok(raw.stdout.includes('pre_rename'), raw.stdout);
  assert.ok(raw.stdout.includes(W069.fix), raw.stdout);
  assert.doesNotMatch(raw.stdout, /outside the (managed )?block/);
  assert.ok(!raw.stdout.split('\n').some((l) => l.startsWith(`-${fx.OUTSIDE_LEGACY_LINE}`)), 'a diff was printed');

  for (const args of [['--global'], ['--global', '--apply'], ['--global', '--confirm']]) {
    const r = aofTools(args, h);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    assert.ok(r.json, `${args.join(' ')}: not JSON: ${r.stdout}`);
    assert.equal(r.json.block.action, 'pre_rename', args.join(' '));
    assert.ok(!('outside' in r.json), `${args.join(' ')}: JSON has outside`);
    assert.ok(!('outside_diff' in r.json), `${args.join(' ')}: JSON has outside_diff`);
    assert.equal(readMd(h), before, `${args.join(' ')} wrote CLAUDE.md`);
  }
  assert.deepEqual(backups(h), []);
  onePreRenameNotice(h);
});

test('2: a hand-written pre-rename routing heading is refused: byte-identical, one notice, no block added', (t) => {
  const before = fx.handWrittenRoutingClaudeMd('DevFlow Routing');
  const h = home(t, before);

  const report = runGlobalUpgrade({ userHome: h, now: NOW });
  assert.equal(report.block.action, 'pre_rename');
  assert.equal(readMd(h), before);
  const n = onePreRenameNotice(h);
  assert.ok(n.message.includes('DevFlow Routing'), n.message);

  const confirmed = runGlobalUpgrade({ userHome: h, now: NOW, confirm: true });
  assert.equal(confirmed.block.action, 'pre_rename');
  assert.equal(readMd(h), before, '--confirm adopted or appended');
  assert.ok(!readMd(h).includes('AOFORGE:START'), 'a block was added');
  assert.deepEqual(backups(h), []);
  onePreRenameNotice(h);

  for (const args of [['--global', '--apply'], ['--global', '--confirm']]) {
    const r = aofTools(args, h);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.block.action, 'pre_rename', args.join(' '));
    assert.ok(!('outside' in r.json) && !('outside_diff' in r.json));
    assert.equal(readMd(h), before, `${args.join(' ')} wrote CLAUDE.md`);
  }
});

test('3: a hand-written "AOForge Routing" section keeps the notice-only path; confirm adopts it', (t) => {
  const before = fx.handWrittenRoutingClaudeMd('AOForge Routing');
  const h = home(t, before);

  const report = runGlobalUpgrade({ userHome: h, now: NOW });
  assert.equal(report.block.action, 'adopt_pending');
  assert.equal(readMd(h), before, 'written without confirm');
  assert.deepEqual(backups(h), []);
  const pending = unconsumed(h);
  assert.equal(pending.length, 1, pending.map((n) => n.key).join(', '));
  assert.equal(pending[0].key, 'global-claude-md-adopt');
  assert.ok(pending[0].detail.includes('- # AOForge Routing'), 'the routing heading is not proposed for removal');

  const adopted = runGlobalUpgrade({ userHome: h, now: NOW, confirm: true });
  assert.equal(adopted.block.action, 'adopted');
  const after = readMd(h);
  assert.ok(after.includes(`<!-- AOFORGE:START v=${TPL.version} src=global-claude-md -->`));
  assert.ok(!after.includes('# AOForge Routing\n\nThe DevFlow plugin'), 'the hand-written section survived adoption');
  assert.ok(after.includes(fx.OUTSIDE_PLAIN_LINE), 'text after the routing section was lost');
});

test('6: the real template routes to AOForge only', () => {
  for (const s of ['/aoforge:build', '/aoforge:doctor', '`aoforge@aocyber`', 'aoforge/adopt', '# AOForge Routing']) {
    assert.ok(TPL.body.includes(s), `template body lacks ${s}`);
  }
  assert.ok(!/devflow/i.test(TPL.body), 'template body names the old product');
});
