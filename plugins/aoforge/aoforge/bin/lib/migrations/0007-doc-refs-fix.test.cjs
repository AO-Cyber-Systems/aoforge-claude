'use strict';

// TRD 38-08 — migration 0007 doc-refs-fix (test list items 1-14).
//
// no_llm_test_data: projects come from the shared hand-built fixtures (upgrade-fixtures.cjs) plus
// hand-written CLAUDE.md / STATE.md variants built the same way 0005's test file builds versioned
// blocks. Nothing touches the real ~/.claude, and nothing runs against this repository.
//
// Command-rename knowledge is not re-declared here: every stale token used below (df:health,
// df:plan-objective, aoforge:progress, aoforge:update) is chosen because doc-refs.test.cjs already
// pins its resolveToken() outcome, so this file exercises the migration's two-target plumbing, not
// the rename table itself.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const managedBlock = require('../managed-block.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0007-doc-refs-fix.cjs');
const CLAUDE_REL = 'CLAUDE.md';
const STATE_REL = '.planning/STATE.md';
const PLUGIN_VERSION = '2.11.0';

const BEFORE = '# My notes\n\nkeep me\n\n';
const AFTER = '\n\n## After\n\nkeep me too\n';
const V2_START = '<!-- AOFORGE:START v=2 src=claude-md -->';
const END = '<!-- AOFORGE:END -->';

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0007() {
  return require(MIGRATION_PATH);
}

function track(dir) {
  cleanup.push(dir);
  return dir;
}

function ctxFor(root, { dryRun = false } = {}) {
  const home = track(fx.makeFakeHome());
  return { projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, dryRun, options: {} };
}

function readClaude(root) {
  return fs.readFileSync(path.join(root, CLAUDE_REL), 'utf-8');
}

function writeClaude(root, text) {
  fs.writeFileSync(path.join(root, CLAUDE_REL), text);
}

function readState(root) {
  return fs.readFileSync(path.join(root, STATE_REL), 'utf-8');
}

function writeState(root, text) {
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, STATE_REL), text);
}

// A versioned block in canonical managed-block form (mirrors 0005's test helper): one blank line
// after START, none before END, so managedBlock.read/render round-trip it byte for byte.
function versionedClaudeMd(sections, { before = BEFORE, after = AFTER, start = V2_START, eol = '\n' } = {}) {
  const body = `${start}\n\n${sections.join('\n\n')}\n${END}`;
  const text = `${before}${body}${after}`;
  return eol === '\n' ? text : text.replace(/\n/g, eol);
}

describe('migration 0007 doc-refs-fix', () => {
  test('1. contract: id 0007, safety auto, semver since; loadRegistry() includes it', () => {
    const m = m0007();
    assert.equal(m.id, '0007');
    assert.equal(m.title, 'Rewrite stale AOForge command references in live project docs');
    assert.match(m.since, /^\d+\.\d+\.\d+$/);
    assert.equal(m.safety, 'auto');
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');

    const entry = upgrade.loadRegistry().find((r) => r.id === '0007');
    assert.ok(entry, 'registry includes 0007');
    assert.equal(entry.safety, 'auto');
  });

  test('2. no CLAUDE.md and a clean STATE.md -> applies:false', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    const det = m0007().detect(ctxFor(root));
    assert.equal(det.applies, false);
  });

  test('3. CLAUDE.md block (v=2 src=claude-md) containing "Run /df:plan-objective" -> applies; reason counts 1 in CLAUDE.md', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    writeClaude(root, versionedClaudeMd([
      '# Project Overview\n\nFixture app. Run /df:plan-objective to start.',
      '# Code Style\n\n- Use camelCase',
    ]));
    const det = m0007().detect(ctxFor(root));
    assert.equal(det.applies, true);
    assert.match(det.reason, /1 stale command reference\(s\) in CLAUDE\.md AOFORGE block/);
    assert.match(det.reason, /0 in STATE\.md/);
  });

  test('4. apply on case 3: token rewritten, START marker byte-identical, bytes outside identical (incl. CRLF), changed === [CLAUDE.md]', () => {
    const m = m0007();
    for (const eol of ['\n', '\r\n']) {
      const root = track(fx.makeV1Project({ claudeMdBlock: null }));
      const original = versionedClaudeMd([
        '# Project Overview\n\nFixture app. Run /df:plan-objective to start.',
        '# Code Style\n\n- Use camelCase',
      ], { eol });
      writeClaude(root, original);

      const res = m.apply(ctxFor(root));
      assert.deepEqual(res.changed, [CLAUDE_REL]);

      const text = readClaude(root);
      const block = managedBlock.read(text);
      assert.ok(text.slice(block.start).startsWith(V2_START.replace(/\n/g, eol)), 'START marker byte-identical');
      assert.equal(text.slice(0, block.start), eol === '\n' ? BEFORE : BEFORE.replace(/\n/g, eol));
      assert.equal(text.slice(block.end), eol === '\n' ? AFTER : AFTER.replace(/\n/g, eol));
      assert.ok(block.content.includes('/aoforge:plan-objective'));
      assert.ok(!block.content.includes('/df:plan-objective'));
    }
  });

  test('5. same token OUTSIDE the block (user prose) -> not applicable and never changed', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    const original = versionedClaudeMd(['# Project Overview\n\nFixture app.', '# Code Style\n\n- Use camelCase'], {
      before: 'See /df:plan-objective in the old docs.\n\n',
    });
    writeClaude(root, original);

    const det = m0007().detect(ctxFor(root));
    assert.equal(det.applies, false);

    const res = m0007().apply(ctxFor(root));
    assert.deepEqual(res.changed, []);
    assert.equal(readClaude(root), original);
  });

  test('6. two START markers -> CLAUDE.md target skipped (malformed); apply leaves CLAUDE.md untouched and still fixes STATE.md', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    const original = BEFORE + fx.LEGACY_CLAUDE_MD_BLOCK + '\n\n' + fx.LEGACY_CLAUDE_MD_BLOCK + AFTER;
    writeClaude(root, original);
    writeState(root,
      '# Project State\n\n## Current Position\n\nRun /aoforge:progress to check.\n\n' +
      '## Session Log\n\n- 2026-01-15: fixture session\n');

    const det = m0007().detect(ctxFor(root));
    assert.equal(det.applies, true, det.reason);
    assert.match(det.reason, /CLAUDE\.md skipped \(malformed/);

    const res = m0007().apply(ctxFor(root));
    assert.equal(readClaude(root), original, 'CLAUDE.md untouched');
    assert.ok(res.changed.includes(STATE_REL), 'STATE.md fixed');
    assert.ok(!res.changed.includes(CLAUDE_REL));
    assert.ok(readState(root).includes('/aoforge:status'));
    assert.ok(!readState(root).includes('/aoforge:progress\n'));
  });

  test('7. STATE.md rewrites outside the Session Log and appends one new log line; the log line stays byte-identical', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    const before = '# Project State\n\n## Current Position\n\nrun /aoforge:progress to check status.\n\n';
    const log = '## Session Log\n\n- 2026-01-01: regenerated by /df:health --repair\n';
    writeState(root, before + log);

    const res = m0007().apply(ctxFor(root));
    assert.ok(res.changed.includes(STATE_REL));

    const text = readState(root);
    assert.ok(text.includes('run /aoforge:status to check status.'));
    assert.ok(!text.includes('/aoforge:progress'));
    assert.ok(text.includes('- 2026-01-01: regenerated by /df:health --repair\n'), 'log line byte-identical');

    const logLines = text.slice(text.indexOf('## Session Log')).split('\n').filter((l) => l.startsWith('- '));
    assert.equal(logLines.length, 2, 'the original entry plus exactly one new entry');
    assert.equal(logLines[0], '- 2026-01-01: regenerated by /df:health --repair');
    assert.match(logLines[1], /^- \d{4}-\d{2}-\d{2}: upgrade 0007 updated 1 command reference\(s\) to current \/aoforge: names$/);
  });

  test('8. STATE.md with no Session Log section -> rewritten outside, nothing appended', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    writeState(root, '# Project State\n\n## Current Position\n\nrun /aoforge:progress.\n');

    const res = m0007().apply(ctxFor(root));
    assert.ok(res.changed.includes(STATE_REL));

    const text = readState(root);
    assert.ok(text.includes('/aoforge:status'));
    assert.ok(!text.includes('/aoforge:progress'));
    assert.ok(!/upgrade 0007 updated/.test(text), 'no log section exists, so nothing is appended');
  });

  test('9. STATE.md with only a removed command -> applies:false; a forced apply leaves the text unchanged and records removed_left', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    const original = '# Project State\n\n## Current Position\n\nDo not run /aoforge:update.\n';
    writeState(root, original);

    const det = m0007().detect(ctxFor(root));
    assert.equal(det.applies, false, det.reason);

    const res = m0007().apply(ctxFor(root));
    assert.deepEqual(res.changed, []);
    assert.equal(readState(root), original);
    assert.ok(res.notes.removed_left.includes('update'));
  });

  test('10. dryRun:true -> returns the same changed and writes nothing (snapshot equal)', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    writeClaude(root, versionedClaudeMd([
      '# Project Overview\n\nFixture app. Run /df:plan-objective to start.',
      '# Code Style\n\n- Use camelCase',
    ]));
    const before = fx.snapshot(root);
    const live = m0007().apply(ctxFor(root, { dryRun: false })).changed;

    // Re-seed an identical fixture so the dry-run comparison starts from the same pre-apply state.
    const root2 = track(fx.makeV1Project({ claudeMdBlock: null }));
    writeClaude(root2, versionedClaudeMd([
      '# Project Overview\n\nFixture app. Run /df:plan-objective to start.',
      '# Code Style\n\n- Use camelCase',
    ]));
    const before2 = fx.snapshot(root2);
    const res = m0007().apply(ctxFor(root2, { dryRun: true }));
    assert.deepEqual(res.changed, live);
    assert.deepEqual(fx.diffSnapshots(before2, fx.snapshot(root2)), []);
    assert.ok(fx.diffSnapshots(before, fx.snapshot(root)).length > 0, 'sanity: the live run really wrote');
  });

  test('11. idempotent: detect false after apply; a full upgrade.apply run twice leaves 0007 in skipped and the files byte-identical', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    writeClaude(root, versionedClaudeMd([
      '# Project Overview\n\nFixture app. Run /df:plan-objective for details.',
      '# Code Style\n\n- Use camelCase',
    ]));
    writeState(root,
      '# Project State\n\n## Current Position\n\nrun /aoforge:progress.\n\n' +
      '## Session Log\n\n- 2026-01-15: fixture session\n');
    const home = track(fx.makeFakeHome());

    const first = upgrade.apply({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION });
    assert.equal(first.failed.length, 0, JSON.stringify(first.failed));
    assert.ok(first.applied.some((a) => a.id === '0007'), '0007 applied on the first run');
    const afterFirst = fx.snapshot(root);

    const det = m0007().detect({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, dryRun: true, options: {} });
    assert.equal(det.applies, false, det.reason);

    const second = upgrade.apply({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION });
    assert.equal(second.failed.length, 0, JSON.stringify(second.failed));
    assert.ok(second.skipped.some((s) => s.id === '0007'), '0007 skipped on the second run');
    assert.deepEqual(fx.diffSnapshots(afterFirst, fx.snapshot(root)), []);
  });

  test('12. historical-record exemption: only CLAUDE.md, STATE.md and the config.json stamp change across a full apply', () => {
    const root = track(fx.makeStampedProject(PLUGIN_VERSION, { migrations_applied: ['0001', '0002', '0003', '0004', '0005'] }));
    const tpl = require('./0005-claude-md-block.cjs').loadClaudeMdTemplate();
    writeClaude(root, versionedClaudeMd([
      '# Project Overview\n\nFixture app. Run /df:health for status.',
      tpl.rules,
      '# Code Style\n\n- Use camelCase',
    ]));
    writeState(root,
      '# Project State\n\n## Current Position\n\nrun /aoforge:progress.\n\n' +
      '## Session Log\n\n- 2026-01-15: fixture session\n');

    // A stale token in every historical-record path the TRD lists. None of these may be opened
    // for writing by 0007 — describing the token in words here, not spelling it, per the module's
    // own comment convention (the CI gate in 38-09 only scans bin/**/*.cjs SOURCE, not this test
    // file, but staying consistent keeps the fixture readable either way).
    const stale = 'See the /df:health command for status.\n';
    const objDir = path.join(root, '.planning/objectives/01-alpha');
    fs.appendFileSync(path.join(objDir, '01-01-SUMMARY.md'), stale);
    fs.appendFileSync(path.join(objDir, '01-01-TRD.md'), stale);
    fs.appendFileSync(path.join(objDir, 'OBJECTIVE.md'), stale);
    fs.appendFileSync(path.join(root, '.planning/ROADMAP.md'), stale);
    fs.writeFileSync(path.join(objDir, '01-01-VERIFICATION.md'), '# Verification\n\n' + stale);
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n' + stale);
    fs.mkdirSync(path.join(root, '.planning/milestones'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning/milestones/2026-01-MILESTONE.md'), '# Milestone\n\n' + stale);
    fs.mkdirSync(path.join(root, '.planning/todos'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning/todos/2026-01-01-todo.md'), '# Todo\n\n' + stale);

    const home = track(fx.makeFakeHome());
    const before = fx.snapshot(root);
    const r = upgrade.apply({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION });
    assert.equal(r.failed.length, 0, JSON.stringify(r.failed));
    assert.ok(r.applied.some((a) => a.id === '0007'), '0007 ran');

    const diff = fx.diffSnapshots(before, fx.snapshot(root));
    assert.deepEqual(diff, [CLAUDE_REL, '.planning/config.json', STATE_REL].sort());
  });

  test('13. coexists with 0005: a legacy block with stale rules and /df:plan-objective -> a full apply lands v=2, template rules, and the token rewritten; a later check is up_to_date', () => {
    const root = track(fx.makeStampedProject(PLUGIN_VERSION, { migrations_applied: ['0001', '0002', '0003', '0004'] }));
    const legacy = fx.LEGACY_CLAUDE_MD_BLOCK.replace('Fixture app.', 'Fixture app. Run /df:plan-objective for details.');
    writeClaude(root, BEFORE + legacy + AFTER);
    const home = track(fx.makeFakeHome());

    const r = upgrade.apply({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION });
    assert.equal(r.failed.length, 0, JSON.stringify(r.failed));
    assert.ok(r.applied.some((a) => a.id === '0005'), '0005 ran');
    assert.ok(r.applied.some((a) => a.id === '0007'), '0007 ran');

    const text = readClaude(root);
    const block = managedBlock.read(text);
    assert.equal(block.meta.v, '2');
    assert.equal(block.meta.src, 'claude-md');
    const tpl = require('./0005-claude-md-block.cjs').loadClaudeMdTemplate();
    assert.ok(block.content.includes(tpl.rules), 'rules section equals the template');
    assert.ok(text.includes('/aoforge:plan-objective'));
    assert.ok(!text.includes('/df:plan-objective'));

    const chk = upgrade.check({ projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION });
    assert.equal(chk.up_to_date, true, JSON.stringify(chk));
  });
});
