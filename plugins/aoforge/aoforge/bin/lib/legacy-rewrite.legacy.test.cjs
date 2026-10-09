'use strict';

// Test list (objective 72, TRD 72-09, INST-04): legacy-rewrite.cjs, the text rewrite the CLAUDE.md
// migration (0014) and `upgrade --global` share.
//
// 11a. Every LEGACY/NAMES pair rewrites: each shared key's LEGACY value becomes its NAMES value, alone
//      and inside a sentence.
// 11b. The case forms the codemod also maps: the capitalised slug, the upper-case CLI; the article
//      before a renamed name ("a <legacy product>" -> "an <new product>").
// 11c. PRESERVE tokens survive, in every case, beside a renamed name on the same line.
// 11d. The planning directory is renamed only as a directory: `<legacy dir>/STATE.md` is, member access
//      (`config<legacy dir>`) and a longer identifier (`<legacy dir>Dir`) are not.
// 11e. hasLegacyNames: true with a legacy name, false for AOForge-only text and for preserved tokens.
// 11f. Idempotent: a rewritten text rewrites to itself; a text with no legacy name is returned as is.
// 11g. unifiedDiff marks changed lines: `---`/`+++` headers, an `@@` hunk header, `-old` then `+new`,
//      unchanged neighbours as ` ` context; identical texts give ''.
// 11h. diffLines: one op per line; a one-line change is one '-' and one '+' with the rest ' '.
// 12.  legacy-names.PRESERVE equals the codemod's global PRESERVE tokens (same lower-cased set as the
//      codemod ids, and each token is matched whole by its codemod pattern). Skipped in a mirror install,
//      which has no scripts/ directory.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { NAMES, LEGACY, PRESERVE } = require('./legacy-names.cjs');
const { rewriteLegacyNames, hasLegacyNames, unifiedDiff, diffLines } = require('./legacy-rewrite.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const CODEMOD = path.join(REPO_ROOT, 'scripts', 'aoforge-rename.cjs');

const SHARED_KEYS = Object.keys(NAMES).filter((k) => Object.prototype.hasOwnProperty.call(LEGACY, k));

test('11a: every LEGACY/NAMES pair rewrites, alone and inside a sentence', () => {
  assert.ok(SHARED_KEYS.length >= 20, `expected the full name map, got ${SHARED_KEYS.length} keys`);
  for (const k of SHARED_KEYS) {
    assert.equal(rewriteLegacyNames(LEGACY[k]), NAMES[k], `LEGACY.${k} alone`);
    assert.equal(
      rewriteLegacyNames(`Use ${LEGACY[k]} here.`),
      `Use ${NAMES[k]} here.`,
      `LEGACY.${k} inside a sentence`,
    );
  }
  assert.equal(
    rewriteLegacyNames('Run `node ~/.claude/devflow/bin/df-tools.cjs state load` or `/devflow:quick`.'),
    'Run `node ~/.claude/aoforge/bin/aof-tools.cjs state load` or `/aoforge:quick`.',
  );
  assert.equal(rewriteLegacyNames('<!-- DEVFLOW:START v=3 src=global-claude-md -->'), '<!-- AOFORGE:START v=3 src=global-claude-md -->');
  assert.equal(rewriteLegacyNames('DEVFLOW_SKIP_EDIT_GATE=1'), 'AOFORGE_SKIP_EDIT_GATE=1');
});

test('11b: the capitalised slug, the upper-case CLI and the article', () => {
  assert.equal(rewriteLegacyNames('Devflow'), 'Aoforge');
  assert.equal(rewriteLegacyNames('DF-TOOLS'), 'AOF-TOOLS');
  assert.equal(rewriteLegacyNames('This is a DevFlow project.'), 'This is an AOForge project.');
  assert.equal(rewriteLegacyNames('A `df-tools` call.'), 'An `aof-tools` call.');
  assert.equal(rewriteLegacyNames('a plain word'), 'a plain word');
});

test('11c: PRESERVE tokens survive beside a renamed name', () => {
  assert.ok(PRESERVE.length >= 4, 'PRESERVE lists the other products');
  for (const tok of [...PRESERVE, 'DEVFLOWOPS']) {
    assert.equal(rewriteLegacyNames(`${tok} is not DevFlow`), `${tok} is not AOForge`, tok);
  }
  assert.equal(
    rewriteLegacyNames('a later devflowops move; see devflow.cloud and devflow-desktop'),
    'a later devflowops move; see devflow.cloud and devflow-desktop',
  );
});

test('11d: the planning directory is renamed only as a directory', () => {
  assert.equal(rewriteLegacyNames('State lives in `.planning/STATE.md`.'), 'State lives in `.aoforge/STATE.md`.');
  assert.equal(rewriteLegacyNames('repo/.planning'), 'repo/.aoforge');
  assert.equal(rewriteLegacyNames('config.planning = 1'), 'config.planning = 1');
  assert.equal(rewriteLegacyNames('opts.planningDir'), 'opts.planningDir');
  assert.equal(rewriteLegacyNames('the planning phase'), 'the planning phase');
});

test('11e: hasLegacyNames', () => {
  assert.equal(hasLegacyNames('Use /devflow:quick'), true);
  assert.equal(hasLegacyNames('State in .planning/'), true);
  assert.equal(hasLegacyNames('DevFlow'), true);
  assert.equal(hasLegacyNames('Use /aoforge:quick with aof-tools in .aoforge/'), false);
  assert.equal(hasLegacyNames('the devflowops repo and devflow.cloud'), false);
  assert.equal(hasLegacyNames(''), false);
});

test('11f: idempotent; text with no legacy name comes back unchanged', () => {
  const src = 'DevFlow uses `.planning/` and `/devflow:quick`; devflowops stays.\nDEVFLOW_X=1 DF ►\n';
  const once = rewriteLegacyNames(src);
  assert.notEqual(once, src);
  assert.equal(rewriteLegacyNames(once), once);
  const plain = 'Nothing to see.\r\nSecond line with trailing space \n';
  assert.equal(rewriteLegacyNames(plain), plain);
});

test('11g: unifiedDiff marks changed lines', () => {
  const a = 'one\ntwo\nDevFlow line\nfour\nfive\n';
  const b = 'one\ntwo\nAOForge line\nfour\nfive\n';
  const diff = unifiedDiff(a, b, { fromFile: 'a/CLAUDE.md', toFile: 'b/CLAUDE.md' });
  const lines = diff.split('\n');
  assert.equal(lines[0], '--- a/CLAUDE.md');
  assert.equal(lines[1], '+++ b/CLAUDE.md');
  assert.match(lines[2], /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@$/);
  assert.ok(lines.includes('-DevFlow line'), diff);
  assert.ok(lines.includes('+AOForge line'), diff);
  assert.ok(lines.indexOf('-DevFlow line') < lines.indexOf('+AOForge line'), 'the removal comes first');
  assert.ok(lines.includes(' two') && lines.includes(' four'), 'neighbours are context lines');
  assert.equal(unifiedDiff(a, a), '');
});

test('11h: diffLines gives one op per line', () => {
  const ops = diffLines('a\nb\nc', 'a\nB\nc');
  assert.deepEqual(ops, [
    { op: ' ', line: 'a' },
    { op: '-', line: 'b' },
    { op: '+', line: 'B' },
    { op: ' ', line: 'c' },
  ]);
  assert.deepEqual(diffLines('x', 'x'), [{ op: ' ', line: 'x' }]);
  assert.deepEqual(diffLines('a\nc', 'a\nb\nc'), [
    { op: ' ', line: 'a' },
    { op: '+', line: 'b' },
    { op: ' ', line: 'c' },
  ]);
});

test(
  '12: legacy-names.PRESERVE equals the codemod global PRESERVE tokens',
  { skip: !fs.existsSync(CODEMOD) && 'mirror install: no scripts/ directory' },
  () => {
    const codemod = require(CODEMOD).PRESERVE.global;
    const ids = codemod.map((p) => p.id).sort();
    const ours = [...new Set(PRESERVE.map((t) => t.toLowerCase()))].sort();
    assert.deepEqual(ours, ids);
    for (const tok of PRESERVE) {
      const owner = codemod.find((p) => p.id === tok.toLowerCase());
      const re = new RegExp(owner.re.source, owner.re.flags.replace('g', ''));
      const m = re.exec(tok);
      assert.ok(m && m[0] === tok, `codemod pattern ${owner.re} does not match ${tok} whole`);
    }
    assert.ok(Object.isFrozen(PRESERVE), 'PRESERVE is frozen');
  },
);
