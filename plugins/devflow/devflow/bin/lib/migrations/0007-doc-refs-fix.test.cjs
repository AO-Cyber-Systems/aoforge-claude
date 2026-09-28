'use strict';

// TRD 38-08 — migration 0007 doc-refs-fix (test list items 1-14).
//
// no_llm_test_data: projects come from the shared hand-built fixtures (upgrade-fixtures.cjs) plus
// hand-written CLAUDE.md / STATE.md variants built the same way 0005's test file builds versioned
// blocks. Nothing touches the real ~/.claude, and nothing runs against this repository.
//
// Command-rename knowledge is not re-declared here: every stale token used below (df:health,
// df:plan-objective, devflow:progress, devflow:update) is chosen because doc-refs.test.cjs already
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
const V2_START = '<!-- DEVFLOW:START v=2 src=claude-md -->';
const END = '<!-- DEVFLOW:END -->';

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
    assert.equal(m.title, 'Rewrite stale DevFlow command references in live project docs');
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
    assert.match(det.reason, /1 stale command reference\(s\) in CLAUDE\.md DEVFLOW block/);
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
      assert.ok(block.content.includes('/devflow:plan-objective'));
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
      '# Project State\n\n## Current Position\n\nRun /devflow:progress to check.\n\n' +
      '## Session Log\n\n- 2026-01-15: fixture session\n');

    const det = m0007().detect(ctxFor(root));
    assert.equal(det.applies, true, det.reason);
    assert.match(det.reason, /CLAUDE\.md skipped \(malformed/);

    const res = m0007().apply(ctxFor(root));
    assert.equal(readClaude(root), original, 'CLAUDE.md untouched');
    assert.ok(res.changed.includes(STATE_REL), 'STATE.md fixed');
    assert.ok(!res.changed.includes(CLAUDE_REL));
    assert.ok(readState(root).includes('/devflow:status'));
    assert.ok(!readState(root).includes('/devflow:progress\n'));
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
});
