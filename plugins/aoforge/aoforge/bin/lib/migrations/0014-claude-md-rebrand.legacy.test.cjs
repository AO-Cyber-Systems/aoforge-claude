'use strict';

// Test list (objective 72, TRD 72-09, INST-04): migration 0014 moves a project CLAUDE.md's managed block
// to the AOForge markers and names. Text outside the block is never touched.
//
//  9.  Legacy-marker block whose body has the product name, `/devflow:quick`, the legacy CLI path and the
//      legacy planning directory: detect applies; apply rewrites the markers (v=2 src=claude-md kept) and
//      the body; the hand-written intro above the block (naming the legacy product) and the text after it
//      are byte-identical; changed is ['CLAUDE.md'].
//  9b. AOFORGE markers over a legacy body (the shape 0005 leaves when it restamps first): applies; the
//      body is rewritten, the markers stay.
//  9c. dryRun: apply reports ['CLAUDE.md'] and writes nothing; a second detect after a real apply does
//      not apply (idempotent).
//  9d. A project still on the legacy planning directory (0012 deferred the move): the markers, product,
//      slash namespace and CLI are rewritten but the block keeps naming the directory the project really
//      uses; detect then does not apply. Once the directory has moved, 0014 applies again and rewrites
//      the planning-directory path too.
// 10.  Not applicable: AOFORGE markers with no legacy name in the body (even with the legacy product in
//      the intro); no CLAUDE.md; a CLAUDE.md with no block; two blocks (reason names "multiple").
// 10b. Contract: id '0014', safety 'auto', since '3.0.0', and the registry loads it.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const m0014 = require('./0014-claude-md-rebrand.cjs');
const { loadRegistry } = require('../upgrade.cjs');
const managedBlock = require('../managed-block.cjs');
const fx = require('../__fixtures__/legacy-claude-md-fixtures.cjs');

function project(t, text) {
  const root = fx.projectWith(text);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const ctx = (projectRoot, extra = {}) => ({ projectRoot, dryRun: false, options: {}, ...extra });
const readClaude = (root) => fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');

test('9: a legacy-marker block is rewritten to AOForge markers and names; outside text is untouched', (t) => {
  const before = fx.projectClaudeMd();
  const root = project(t, before);

  const det = m0014.detect(ctx(root));
  assert.equal(det.applies, true, det.reason);

  const res = m0014.apply(ctx(root));
  assert.deepEqual(res.changed, ['CLAUDE.md']);

  const after = readClaude(root);
  assert.ok(after.startsWith(fx.PROJECT_INTRO), 'the hand-written intro changed');
  assert.ok(after.includes('set up with DevFlow in 2025'), 'the intro still names the legacy product');
  assert.ok(after.endsWith(fx.PROJECT_OUTRO), 'the text after the block changed');
  assert.equal(
    after,
    `${fx.PROJECT_INTRO}<!-- AOFORGE:START v=2 src=claude-md -->\n${fx.CURRENT_PROJECT_BODY}\n<!-- AOFORGE:END -->${fx.PROJECT_OUTRO}`,
  );
  const block = managedBlock.read(after);
  assert.deepEqual(block.meta, { v: '2', src: 'claude-md', legacy: false });
  assert.ok(block.content.includes('/aoforge:quick'));
  assert.ok(block.content.includes('`.aoforge/STATE.md`'));
  assert.ok(block.content.includes('~/.claude/aoforge/bin/aof-tools.cjs'));
});

test('9b: AOFORGE markers over a legacy body: the body is rewritten', (t) => {
  const root = project(t, fx.projectClaudeMd({ legacyBlock: false, legacyBody: true }));
  assert.equal(m0014.detect(ctx(root)).applies, true);
  assert.deepEqual(m0014.apply(ctx(root)).changed, ['CLAUDE.md']);
  assert.equal(readClaude(root), fx.projectClaudeMd({ legacyBlock: false }));
});

test('9c: dryRun writes nothing; after a real apply the migration no longer applies', (t) => {
  const before = fx.projectClaudeMd();
  const root = project(t, before);
  assert.deepEqual(m0014.apply(ctx(root, { dryRun: true })).changed, ['CLAUDE.md']);
  assert.equal(readClaude(root), before);

  m0014.apply(ctx(root));
  const det = m0014.detect(ctx(root));
  assert.equal(det.applies, false, det.reason);
});

test('9d: while the project still uses the legacy planning directory, the block keeps naming it', (t) => {
  const root = project(t, fx.projectClaudeMd());
  fs.mkdirSync(path.join(root, '.planning'));

  assert.equal(m0014.detect(ctx(root)).applies, true);
  m0014.apply(ctx(root));
  const partial = readClaude(root);
  const expectedPartial = fx.projectClaudeMd({ legacyBlock: false }).replace('`.aoforge/STATE.md`', '`.planning/STATE.md`');
  assert.equal(partial, expectedPartial);
  const det = m0014.detect(ctx(root));
  assert.equal(det.applies, false, det.reason);

  fs.renameSync(path.join(root, '.planning'), path.join(root, '.aoforge'));
  assert.equal(m0014.detect(ctx(root)).applies, true, 'the moved directory is not picked up');
  m0014.apply(ctx(root));
  assert.equal(readClaude(root), fx.projectClaudeMd({ legacyBlock: false }));
});

test('10: not applicable without legacy markers or names in the block, or without a usable block', (t) => {
  const current = project(t, fx.projectClaudeMd({ legacyBlock: false }));
  const det = m0014.detect(ctx(current));
  assert.equal(det.applies, false, det.reason);

  const none = project(t, null);
  assert.equal(m0014.detect(ctx(none)).applies, false);
  assert.deepEqual(m0014.apply(ctx(none)).changed, []);

  const noBlock = project(t, '# CLAUDE.md\n\nDevFlow notes, no block.\n');
  assert.equal(m0014.detect(ctx(noBlock)).applies, false);

  const two = project(
    t,
    '<!-- DEVFLOW:START v=2 src=claude-md -->\na\n<!-- DEVFLOW:END -->\n\n<!-- AOFORGE:START v=2 src=claude-md -->\nb\n<!-- AOFORGE:END -->\n',
  );
  const twoDet = m0014.detect(ctx(two));
  assert.equal(twoDet.applies, false);
  assert.match(twoDet.reason, /multiple/);
});

test('10b: contract and registry', () => {
  assert.equal(m0014.id, '0014');
  assert.equal(m0014.safety, 'auto');
  assert.equal(m0014.since, '3.0.0');
  const entry = loadRegistry().find((m) => m.id === '0014');
  assert.ok(entry, 'the registry does not load 0014');
  assert.equal(entry.safety, 'auto');
});
