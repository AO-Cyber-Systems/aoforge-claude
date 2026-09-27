'use strict';

// stack-profile.test.cjs — Test list (TRD 35-02a)
//
// Parse (Task 1):
// - P1 well-formed text → {frontmatter, sections, bodyLineCount}; section names in order.
// - P2 BOM + CRLF input parses identically to LF input.
// - P3 no opening `---` → `StackProfileError` code `NO_FRONTMATTER`.
// - P4 unterminated block → code `UNTERMINATED`.
// - P5 a `---` horizontal rule in the body does not split anything.
// - P6 `extends: null` → `null`; `test: { run: discover }` → object `{run:'discover'}` (proves yaml-lite).
// - P7 H1 and prose before the first H2 are not a section.
// - P8 a `## Heading` line inside a ``` fence is not a split.
// - P9 `<!-- inherit -->` as the first non-blank line → `inherit:true`, marker removed from `text`.
// - P10 positive control: `references/stack-general.md` and `docs/stack-profiles/{go,dart,flutter}.md`
//   parse; flutter has exactly two `inherit:true` sections; general has sections Principles, Avoid,
//   Testing, Dependencies.
//
// Resolve (Task 2):
// - R1 no STACK.md → id `general`, chain length 1, every provenance value `bundled`, `issues: []`.
// - R2 STACK.md without `extends` overriding `commands.test` → provenance `commands.test: project`,
//   `commands.build: bundled`.
// - R3 `extends: golike` + fake home with `stacks/golike.md` → chain general→golike→project;
//   `commands.test.scoped` comes from org; provenance `org`.
// - R4 project `commands.test: { run: "x" }` over an org test with `scoped` → merged test is exactly
//   `{run:'x'}`.
// - R5 lists replace: project `loop: [test]` → `['test']`.
// - R6 maps deep-merge: project `generated.globs` + bundled `generated.markers` both present;
//   provenance per leaf.
// - R7 two-hop org chain (a extends b extends general) resolves in order general, b, a, project.
// - R8 cycle a↔b → one `EXTENDS_CYCLE` issue; no throw; chain ends at general.
// - R9 chain of 5 org hops → `EXTENDS_DEPTH`.
// - R10 `extends: nope` with a fake home lacking it → `EXTENDS_UNRESOLVED`; frontmatter as if
//   extends general.
// - R11 `userHome: null` + `extends: golike` → `EXTENDS_UNRESOLVED` even though a fake home with
//   golike exists elsewhere (never guessed).
// - R12 project `## Avoid` replaces general's; project `## Testing` with inherit → general text
//   then project text; `sources` lists both tiers.
// - R13 project `## Principles` (no marker) → general's Principles first, project text appended.
// - R14 components `[{path:'apps/',...},{path:'apps/web/',...}]`, `file:'apps/web/x.ts'` →
//   component `apps/web/`, its overrides have provenance `component`; `file:'lib/y.ts'` →
//   `component: null`.
// - R15 component `profile: golike` (an org id, not a path) resolves through the org dir.
// - R16 cache: same args → same object (`===`); `_resetCache()` → fresh object; different
//   `userHome` → different entry.
// - R17 malformed STACK.md → throws `StackProfileError` whose message contains the file path.
//
// Neutrality (Task 2):
// - P11 the source of stack-profile.cjs does not match
//   `/golang|gofmt|\bdart\b|flutter|pubspec|\bnpm\b|cargo|pytest|rails|gradle|swift|kotlin/i`.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const sp = require('./stack-profile.cjs');

describe('parseProfile (P group)', () => {
  test('P1: well-formed text -> {frontmatter, sections, bodyLineCount}; section names in order', () => {
    const lines = [
      '---',
      'schema: 1',
      'id: test',
      '---',
      '',
      '# Stack Profile: test',
      '',
      '## Principles',
      '',
      'Principle text.',
      '',
      '## Avoid',
      '',
      'Avoid text.',
      '',
    ];
    const closeIdx = 3;
    const text = lines.join('\n');

    const result = sp.parseProfile(text, { source: 'inline' });

    assert.deepStrictEqual(result.frontmatter, { schema: 1, id: 'test' });
    assert.deepStrictEqual(result.sections.map((s) => s.name), ['Principles', 'Avoid']);
    assert.strictEqual(result.sections[0].text, 'Principle text.');
    assert.strictEqual(result.sections[1].text, 'Avoid text.');
    assert.strictEqual(result.bodyLineCount, lines.length - (closeIdx + 1));
  });

  test('P2: BOM + CRLF input parses identically to LF input', () => {
    const lfText = ['---', 'schema: 1', '---', '', '## Idioms', '', 'Text here.', ''].join('\n');
    const crlfText = `﻿${lfText.replace(/\n/g, '\r\n')}`;

    const lfResult = sp.parseProfile(lfText, { source: 'lf' });
    const crlfResult = sp.parseProfile(crlfText, { source: 'crlf' });

    assert.deepStrictEqual(crlfResult.frontmatter, lfResult.frontmatter);
    assert.deepStrictEqual(crlfResult.sections, lfResult.sections);
    assert.strictEqual(crlfResult.bodyLineCount, lfResult.bodyLineCount);
  });

  test('P3: no opening --- -> StackProfileError NO_FRONTMATTER', () => {
    assert.throws(
      () => sp.parseProfile('# just a heading\n\nbody', { source: 'x' }),
      (err) => {
        assert.strictEqual(err.name, 'StackProfileError');
        assert.strictEqual(err.code, 'NO_FRONTMATTER');
        return true;
      }
    );
  });

  test('P4: unterminated block -> StackProfileError UNTERMINATED', () => {
    const text = ['---', 'schema: 1', '', '## Idioms', 'text'].join('\n');
    assert.throws(
      () => sp.parseProfile(text, { source: 'x' }),
      (err) => {
        assert.strictEqual(err.code, 'UNTERMINATED');
        return true;
      }
    );
  });

  test('P5: a --- horizontal rule in the body does not split anything', () => {
    const text = ['---', 'schema: 1', '---', '', '## Avoid', '', 'before', '', '---', '', 'after', ''].join('\n');
    const result = sp.parseProfile(text, { source: 'x' });
    assert.strictEqual(result.sections.length, 1);
    assert.strictEqual(result.sections[0].name, 'Avoid');
    assert.strictEqual(result.sections[0].text, 'before\n\n---\n\nafter');
  });

  test('P6: extends: null -> null; test: { run: discover } -> object (proves yaml-lite)', () => {
    const text = ['---', 'extends: null', 'test: { run: discover }', '---', ''].join('\n');
    const result = sp.parseProfile(text, { source: 'x' });
    assert.strictEqual(result.frontmatter.extends, null);
    assert.deepStrictEqual(result.frontmatter.test, { run: 'discover' });
  });

  test('P7: H1 and prose before the first H2 are not a section', () => {
    const text = ['---', 'schema: 1', '---', '', '# Stack Profile', '', 'Some prose.', '', '## Idioms', '', 'Idiom text.', ''].join('\n');
    const result = sp.parseProfile(text, { source: 'x' });
    assert.strictEqual(result.sections.length, 1);
    assert.strictEqual(result.sections[0].name, 'Idioms');
    assert.strictEqual(result.sections[0].text, 'Idiom text.');
  });

  test('P8: a ## Heading line inside a ``` fence is not a split', () => {
    const text = ['---', 'schema: 1', '---', '', '## Idioms', '', '```', '## not a heading', '```', '', 'Real text.', ''].join('\n');
    const result = sp.parseProfile(text, { source: 'x' });
    assert.strictEqual(result.sections.length, 1);
    assert.strictEqual(result.sections[0].name, 'Idioms');
    assert.ok(result.sections[0].text.includes('## not a heading'));
  });

  test('P9: <!-- inherit --> as first non-blank line -> inherit:true, marker removed from text', () => {
    const text = ['---', 'schema: 1', '---', '', '## Avoid', '', '<!-- inherit -->', 'Extra text.', ''].join('\n');
    const result = sp.parseProfile(text, { source: 'x' });
    assert.strictEqual(result.sections[0].inherit, true);
    assert.strictEqual(result.sections[0].text, 'Extra text.');
    assert.ok(!result.sections[0].text.includes('<!-- inherit -->'));
  });

  describe('P10: positive control — shipped profiles parse', () => {
    const GENERAL_PATH = path.join(__dirname, '..', '..', 'references', 'stack-general.md');
    const PROFILES_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'docs', 'stack-profiles');

    test('general.md parses; sections Principles, Avoid, Testing, Dependencies', () => {
      const text = fs.readFileSync(GENERAL_PATH, 'utf-8');
      const result = sp.parseProfile(text, { source: GENERAL_PATH });
      assert.deepStrictEqual(result.sections.map((s) => s.name), ['Principles', 'Avoid', 'Testing', 'Dependencies']);
    });

    test('go.md, dart.md, flutter.md parse; flutter has exactly two inherit:true sections', () => {
      for (const name of ['go.md', 'dart.md', 'flutter.md']) {
        const p = path.join(PROFILES_DIR, name);
        const text = fs.readFileSync(p, 'utf-8');
        const result = sp.parseProfile(text, { source: p });
        assert.ok(result.sections.length > 0, `${name} should have sections`);
      }
      const flutterPath = path.join(PROFILES_DIR, 'flutter.md');
      const flutterResult = sp.parseProfile(fs.readFileSync(flutterPath, 'utf-8'), { source: flutterPath });
      const inheritCount = flutterResult.sections.filter((s) => s.inherit).length;
      assert.strictEqual(inheritCount, 2);
    });
  });
});
