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
// - P10 positive control: `references/stack-general.md` and `stack-profiles/{go,dart,flutter}.md`
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

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const sp = require('./stack-profile.cjs');
const fx = require('./__fixtures__/stack-profile-fixtures.cjs');

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
    const PROFILES_DIR = path.join(__dirname, '..', '..', 'stack-profiles');

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

describe('resolveProfile (R group)', () => {
  beforeEach(() => {
    sp._resetCache();
  });

  test('R1: no STACK.md -> id general, chain length 1, every provenance value bundled, issues empty', () => {
    const root = fx.makeProject({});
    try {
      const r = sp.resolveProfile({ projectRoot: root });
      assert.strictEqual(r.id, 'general');
      assert.strictEqual(r.chain.length, 1);
      assert.strictEqual(r.chain[0].tier, 'bundled');
      const tiers = new Set(Object.values(r.provenance));
      assert.deepStrictEqual([...tiers], ['bundled']);
      assert.deepStrictEqual(r.issues, []);
      assert.strictEqual(r.projectFile, null);
    } finally {
      fx.cleanup(root);
    }
  });

  test('R2: STACK.md without extends overriding commands.test', () => {
    const stackMd = fx.profileMd({
      yaml: ['schema: 1', 'commands:', '  test: { run: "customtest ./..." }'].join('\n'),
    });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root });
      assert.deepStrictEqual(r.frontmatter.commands.test, { run: 'customtest ./...' });
      assert.strictEqual(r.provenance['commands.test'], 'project');
      assert.strictEqual(r.provenance['commands.build'], 'bundled');
    } finally {
      fx.cleanup(root);
    }
  });

  test('R3: extends chain resolves org tier via userHome', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: golike'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root, userHome: home });
      assert.deepStrictEqual(r.chain.map((c) => c.id), ['general', 'golike', null]);
      assert.deepStrictEqual(r.chain.map((c) => c.tier), ['bundled', 'org', 'project']);
      assert.strictEqual(r.frontmatter.commands.test.scoped, 'buildtool test -race {packages}');
      assert.strictEqual(r.provenance['commands.test'], 'org');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('R4: project commands.test replaces org commands.test atomically', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const stackMd = fx.profileMd({
      yaml: ['schema: 1', 'extends: golike', 'commands:', '  test: { run: "x" }'].join('\n'),
    });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root, userHome: home });
      assert.deepStrictEqual(r.frontmatter.commands.test, { run: 'x' });
      assert.strictEqual(r.provenance['commands.test'], 'project');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('R5: arrays replace wholesale, not merge', () => {
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'loop: [test]'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root });
      assert.deepStrictEqual(r.frontmatter.loop, ['test']);
      assert.strictEqual(r.provenance.loop, 'project');
    } finally {
      fx.cleanup(root);
    }
  });

  test('R6: plain-object maps deep-merge leaf by leaf', () => {
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'generated:', '  globs: ["**/*.gen.ts"]'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root });
      assert.deepStrictEqual(r.frontmatter.generated.globs, ['**/*.gen.ts']);
      assert.ok(Array.isArray(r.frontmatter.generated.markers) && r.frontmatter.generated.markers.length > 0);
      assert.strictEqual(r.provenance['generated.globs'], 'project');
      assert.strictEqual(r.provenance['generated.markers'], 'bundled');
    } finally {
      fx.cleanup(root);
    }
  });

  test('R7: two-hop org chain resolves low-to-high', () => {
    const home = fx.makeHome({
      stacks: {
        b: fx.profileMd({ yaml: ['schema: 1', 'id: b', 'extends: general'].join('\n') }),
        a: fx.profileMd({ yaml: ['schema: 1', 'id: a', 'extends: b'].join('\n') }),
      },
    });
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: a'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root, userHome: home });
      assert.deepStrictEqual(r.chain.map((c) => c.id), ['general', 'b', 'a', null]);
      assert.strictEqual(r.id, 'a');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('R8: an extends cycle is reported as an issue, not thrown', () => {
    const home = fx.makeHome({
      stacks: {
        a: fx.profileMd({ yaml: ['schema: 1', 'id: a', 'extends: b'].join('\n') }),
        b: fx.profileMd({ yaml: ['schema: 1', 'id: b', 'extends: a'].join('\n') }),
      },
    });
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: a'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root, userHome: home });
      const cycleIssues = r.issues.filter((i) => i.code === 'EXTENDS_CYCLE');
      assert.strictEqual(cycleIssues.length, 1);
      assert.strictEqual(r.chain[0].id, 'general');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('R9: an extends chain longer than 4 hops trips EXTENDS_DEPTH', () => {
    const home = fx.makeHome({
      stacks: {
        h1: fx.profileMd({ yaml: ['schema: 1', 'id: h1', 'extends: general'].join('\n') }),
        h2: fx.profileMd({ yaml: ['schema: 1', 'id: h2', 'extends: h1'].join('\n') }),
        h3: fx.profileMd({ yaml: ['schema: 1', 'id: h3', 'extends: h2'].join('\n') }),
        h4: fx.profileMd({ yaml: ['schema: 1', 'id: h4', 'extends: h3'].join('\n') }),
        h5: fx.profileMd({ yaml: ['schema: 1', 'id: h5', 'extends: h4'].join('\n') }),
      },
    });
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: h5'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root, userHome: home });
      const depthIssues = r.issues.filter((i) => i.code === 'EXTENDS_DEPTH');
      assert.strictEqual(depthIssues.length, 1);
      const orgHops = r.chain.filter((c) => c.tier === 'org');
      assert.strictEqual(orgHops.length, 4);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('R10: an unresolved extends id is reported and treated as general', () => {
    const home = fx.makeHome({});
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: nope'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root, userHome: home });
      const unresolvedIssues = r.issues.filter((i) => i.code === 'EXTENDS_UNRESOLVED');
      assert.strictEqual(unresolvedIssues.length, 1);
      assert.deepStrictEqual(r.chain.map((c) => c.tier), ['bundled', 'project']);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('R11: userHome null never guesses at an org home, even when one exists', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: golike'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root, userHome: null });
      const unresolvedIssues = r.issues.filter((i) => i.code === 'EXTENDS_UNRESOLVED');
      assert.strictEqual(unresolvedIssues.length, 1);
      assert.deepStrictEqual(r.chain.map((c) => c.tier), ['bundled', 'project']);
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('R12: sections replace by default, append when marked inherit', () => {
    const stackMd = fx.profileMd({
      yaml: 'schema: 1',
      sections: [
        { name: 'Avoid', text: 'Project avoid text.' },
        { name: 'Testing', text: 'Project testing addendum.', inherit: true },
      ],
    });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root });
      assert.strictEqual(r.sections['Avoid'].text, 'Project avoid text.');
      assert.deepStrictEqual(r.sections['Avoid'].sources, ['project']);
      assert.ok(r.sections['Testing'].text.startsWith('Test the layers'));
      assert.ok(r.sections['Testing'].text.endsWith('Project testing addendum.'));
      assert.deepStrictEqual(r.sections['Testing'].sources, ['bundled', 'project']);
    } finally {
      fx.cleanup(root);
    }
  });

  test('R13: Principles always appends, even without an inherit marker', () => {
    const stackMd = fx.profileMd({
      yaml: 'schema: 1',
      sections: [{ name: 'Principles', text: 'Project-specific principle.' }],
    });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root });
      assert.ok(r.sections['Principles'].text.startsWith("1. **Discover"));
      assert.ok(r.sections['Principles'].text.endsWith('Project-specific principle.'));
      assert.deepStrictEqual(r.sections['Principles'].sources, ['bundled', 'project']);
    } finally {
      fx.cleanup(root);
    }
  });

  describe('R14: component selection by longest path prefix', () => {
    test('a file under the more specific prefix resolves that component', () => {
      const stackMd = fx.profileMd({
        yaml: [
          'schema: 1',
          'components:',
          '  - { path: "apps/", profile: ".planning/stacks/apps-generic.md" }',
          '  - { path: "apps/web/", profile: ".planning/stacks/apps-web.md" }',
        ].join('\n'),
      });
      const generic = fx.profileMd({ yaml: 'schema: 1' });
      const web = fx.profileMd({
        yaml: ['schema: 1', 'commands:', '  build: { run: "webbuild" }'].join('\n'),
      });
      const root = fx.makeProject({ stackMd, stacks: { 'apps-generic': generic, 'apps-web': web } });
      try {
        const r = sp.resolveProfile({ projectRoot: root, file: 'apps/web/x.ts' });
        assert.strictEqual(r.component.path, 'apps/web/');
        assert.strictEqual(r.frontmatter.commands.build.run, 'webbuild');
        assert.strictEqual(r.provenance['commands.build'], 'component');
      } finally {
        fx.cleanup(root);
      }
    });

    test('a file outside any component prefix resolves no component', () => {
      const stackMd = fx.profileMd({
        yaml: ['schema: 1', 'components:', '  - { path: "apps/", profile: ".planning/stacks/apps-generic.md" }'].join('\n'),
      });
      const generic = fx.profileMd({ yaml: 'schema: 1' });
      const root = fx.makeProject({ stackMd, stacks: { 'apps-generic': generic } });
      try {
        const r = sp.resolveProfile({ projectRoot: root, file: 'lib/y.ts' });
        assert.strictEqual(r.component, null);
      } finally {
        fx.cleanup(root);
      }
    });
  });

  test('R15: a component profile naming an org id resolves through the org tier', () => {
    const home = fx.makeHome({ stacks: { golike: fx.orgProfileGoLike() } });
    const stackMd = fx.profileMd({
      yaml: ['schema: 1', 'components:', '  - { path: "apps/", profile: "golike" }'].join('\n'),
    });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.resolveProfile({ projectRoot: root, userHome: home, file: 'apps/x.go' });
      assert.ok(r.chain.find((c) => c.id === 'golike' && c.tier === 'component'));
      assert.strictEqual(r.frontmatter.commands.test.scoped, 'buildtool test -race {packages}');
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('R16: results are cached by (projectRoot, userHome, file); _resetCache clears it', () => {
    const root = fx.makeProject({});
    try {
      const r1 = sp.resolveProfile({ projectRoot: root });
      const r2 = sp.resolveProfile({ projectRoot: root });
      assert.strictEqual(r1, r2);

      sp._resetCache();
      const r3 = sp.resolveProfile({ projectRoot: root });
      assert.notStrictEqual(r1, r3);
      assert.deepStrictEqual(r1, r3);

      const home = fx.makeHome({});
      const r4 = sp.resolveProfile({ projectRoot: root, userHome: home });
      assert.notStrictEqual(r3, r4);
      fx.cleanup(home);
    } finally {
      fx.cleanup(root);
    }
  });

  test('R17: a malformed STACK.md throws, naming the file in the message', () => {
    const root = fx.makeProject({ stackMd: 'not a valid profile at all, no fence' });
    try {
      assert.throws(
        () => sp.resolveProfile({ projectRoot: root }),
        (err) => {
          assert.strictEqual(err.name, 'StackProfileError');
          assert.ok(err.message.includes(path.join(root, '.planning', 'STACK.md')));
          return true;
        }
      );
    } finally {
      fx.cleanup(root);
    }
  });
});

describe('neutrality', () => {
  test('P11: the module source names no specific stack', () => {
    const selfPath = path.join(__dirname, 'stack-profile.cjs');
    const src = fs.readFileSync(selfPath, 'utf-8');
    const re = /golang|gofmt|\bdart\b|flutter|pubspec|\bnpm\b|cargo|pytest|rails|gradle|swift|kotlin/i;
    assert.ok(!re.test(src), 'stack-profile.cjs must not name a specific stack');
  });
});

// ─── mergeFrontmatter prototype-pollution guard (SEC group, quick-22) ─────
//
// js/prototype-pollution-utility (stack-profile.cjs:219 in mergeFrontmatter). mergeFrontmatter
// itself is not exported, so these drive it through the exported `resolveFromParsed` with an
// already-parsed target whose frontmatter is built via JSON.parse — JSON.parse's internal
// CreateDataProperty path (unlike an object-literal `{ __proto__: ... }`) leaves `__proto__` as
// a genuine OWN enumerable key, which is exactly the shape `Object.entries(layer)` in
// mergeFrontmatter iterates over. Each test polls Object.prototype for its own planted key
// afterward and deletes it in `finally` regardless of pass/fail, so a RED-phase pollution never
// bleeds into a later test in this same process.
describe('mergeFrontmatter prototype-pollution guard (SEC group)', () => {
  const BLOCKED_KEYS = ['__proto__', 'constructor', 'prototype'];

  test('SEC1: top-level __proto__/constructor/prototype keys are refused, siblings still merge', () => {
    const malicious = JSON.parse(
      '{"schema":1,"__proto__":{"polluted":1},"constructor":{"polluted":2},"prototype":{"polluted":3},"safe":{"keep":true}}'
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(malicious, '__proto__'),
      'fixture must carry __proto__ as an own key (JSON.parse contract)'
    );

    try {
      const r = sp.resolveFromParsed({ frontmatter: malicious, sections: [] }, {});

      assert.strictEqual(({}).polluted, undefined, 'Object.prototype must not be polluted');
      for (const name of BLOCKED_KEYS) {
        assert.ok(
          !Object.prototype.hasOwnProperty.call(r.frontmatter, name),
          `merged frontmatter must not carry an own '${name}' property`
        );
      }
      for (const p of Object.keys(r.provenance)) {
        assert.ok(
          !/(^|\.)(__proto__|constructor|prototype)(\.|$)/.test(p),
          `provenance path '${p}' must not reference a blocked key`
        );
      }
      assert.strictEqual(r.frontmatter.safe.keep, true, 'a normal sibling key must still merge');
    } finally {
      delete Object.prototype.polluted;
    }
  });

  test('SEC2: nested __proto__/constructor/prototype keys are refused, siblings still merge', () => {
    const malicious = JSON.parse(
      '{"schema":1,"generated":{"__proto__":{"nestedPolluted":1},"constructor":{"nestedPolluted":2},"prototype":{"nestedPolluted":3},"markers":["ok"]}}'
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(malicious.generated, '__proto__'),
      'fixture must carry a nested __proto__ as an own key (JSON.parse contract)'
    );

    try {
      const r = sp.resolveFromParsed({ frontmatter: malicious, sections: [] }, {});

      assert.strictEqual(({}).nestedPolluted, undefined, 'Object.prototype must not be polluted from a nested merge');
      for (const name of BLOCKED_KEYS) {
        assert.ok(
          !Object.prototype.hasOwnProperty.call(r.frontmatter.generated, name),
          `merged frontmatter.generated must not carry an own '${name}' property`
        );
      }
      for (const p of Object.keys(r.provenance)) {
        assert.ok(
          !/(^|\.)(__proto__|constructor|prototype)(\.|$)/.test(p),
          `provenance path '${p}' must not reference a blocked key`
        );
      }
      assert.deepStrictEqual(r.frontmatter.generated.markers, ['ok'], 'a normal sibling key must still merge');
    } finally {
      delete Object.prototype.nestedPolluted;
    }
  });
});
