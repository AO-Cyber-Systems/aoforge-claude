'use strict';

// stack-validate.test.cjs — V-group unit tests for validateProfile / validateProfileText
// (TRD 35-03). Schema violations, cross-field rules (STK002-STK009) and the two positive
// controls (V1, V13). Never touches the real ~/.claude — every org tier lives under an
// fs.mkdtemp-ed fake home via __fixtures__/stack-profile-fixtures.cjs.
//
// - V1  valid project profile (extends general, a custom key used in gates) -> ok, no errors.
// - V2  no STACK.md -> ok, target mentions `general (bundled`.
// - V3  schema violation (`commands.test: { run: "" }`) -> STK001, path `commands.test.run`,
//       file = STACK.md path.
// - V4  `extends: missing` -> STK002.
// - V5  cycle a<->b in fake home -> STK003.
// - V6  5-hop chain -> STK004.
// - V7  `gates.task: [test, nosuch]` -> STK005 naming `nosuch` and `gates.task`; same for
//       `loop`, `generated.regenerate`, `verification.runtime_check`.
// - V8  `## Hacks` section -> STK006.
// - V9  body of 151 lines -> warning STK007, `ok` true.
// - V10 unterminated frontmatter -> STK008 (not a throw).
// - V11 component pointing at a missing file -> STK009.
// - V12 `validateProfileText` on a draft string (no file on disk) behaves like V1.
// - V13 bundled general and the three bundled stack-profiles (installed into a fake home) validate
//       ok — flutter via dart via general.
// - V14 (TRD 42-01, SDR-07) a placeholder skill pin — any whole-string `<...>` such as "<sha>" or
//       "<commit>" — is warning STK010, `ok` stays true; a real SHA is not; an inherited org
//       layer's placeholder is reported against that layer; entries dedupe per (source, pin,
//       layer path); validateProfile (on disk) surfaces it too.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sp = require('./stack-profile.cjs');
const fx = require('./__fixtures__/stack-profile-fixtures.cjs');

function codes(list) {
  return list.map((e) => e.code);
}

describe('validateProfile (V group)', () => {
  test('V1: valid project profile (extends general, custom key used in gates) -> ok, no errors', () => {
    const stackMd = fx.profileMd({
      yaml: [
        'schema: 1',
        'commands:',
        '  mycheck: { run: "mytool check" }',
        'gates:',
        '  task: [mycheck]',
      ].join('\n'),
    });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.validateProfile({ projectRoot: root });
      assert.equal(r.ok, true);
      assert.deepEqual(r.errors, []);
    } finally {
      fx.cleanup(root);
    }
  });

  test('V2: no STACK.md -> ok, target mentions `general (bundled`', () => {
    const root = fx.makeProject({});
    try {
      const r = sp.validateProfile({ projectRoot: root });
      assert.equal(r.ok, true);
      assert.ok(r.target.includes('general (bundled'), `target was: ${r.target}`);
    } finally {
      fx.cleanup(root);
    }
  });

  test('V3: schema violation commands.test.run "" -> STK001 with path + file', () => {
    const stackMd = fx.profileMd({
      yaml: ['schema: 1', 'commands:', '  test: { run: "" }'].join('\n'),
    });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.validateProfile({ projectRoot: root });
      assert.equal(r.ok, false);
      const hit = r.errors.find((e) => e.code === 'STK001' && e.path === 'commands.test.run');
      assert.ok(hit, `expected an STK001 at commands.test.run, got: ${JSON.stringify(r.errors)}`);
      assert.equal(hit.file, path.join(root, '.planning', 'STACK.md'));
    } finally {
      fx.cleanup(root);
    }
  });

  test('V4: extends: missing -> STK002', () => {
    const home = fx.makeHome({});
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: missing'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.validateProfile({ projectRoot: root, userHome: home });
      assert.equal(r.ok, false);
      assert.ok(codes(r.errors).includes('STK002'), JSON.stringify(r.errors));
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('V5: extends cycle a<->b -> STK003', () => {
    const home = fx.cycleHome();
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: a'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.validateProfile({ projectRoot: root, userHome: home });
      assert.equal(r.ok, false);
      assert.ok(codes(r.errors).includes('STK003'), JSON.stringify(r.errors));
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('V6: 5-hop chain -> STK004', () => {
    const home = fx.chainHome(5);
    const stackMd = fx.profileMd({ yaml: ['schema: 1', 'extends: h5'].join('\n') });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.validateProfile({ projectRoot: root, userHome: home });
      assert.equal(r.ok, false);
      assert.ok(codes(r.errors).includes('STK004'), JSON.stringify(r.errors));
    } finally {
      fx.cleanup(root, home);
    }
  });

  describe('V7: an undefined key in a resolved-commands cross-field -> STK005 naming the key and the field', () => {
    test('gates.task', () => {
      const stackMd = fx.profileMd({ yaml: ['schema: 1', 'gates:', '  task: [test, nosuch]'].join('\n') });
      const root = fx.makeProject({ stackMd });
      try {
        const r = sp.validateProfile({ projectRoot: root });
        assert.equal(r.ok, false);
        const hit = r.errors.find((e) => e.code === 'STK005' && e.path === 'gates.task');
        assert.ok(hit, JSON.stringify(r.errors));
        assert.ok(hit.msg.includes('nosuch'), hit.msg);
      } finally {
        fx.cleanup(root);
      }
    });

    test('loop', () => {
      const stackMd = fx.profileMd({ yaml: ['schema: 1', 'loop: [test, nosuch]'].join('\n') });
      const root = fx.makeProject({ stackMd });
      try {
        const r = sp.validateProfile({ projectRoot: root });
        assert.equal(r.ok, false);
        const hit = r.errors.find((e) => e.code === 'STK005' && e.path === 'loop');
        assert.ok(hit, JSON.stringify(r.errors));
        assert.ok(hit.msg.includes('nosuch'), hit.msg);
      } finally {
        fx.cleanup(root);
      }
    });

    test('generated.regenerate', () => {
      const stackMd = fx.profileMd({
        yaml: ['schema: 1', 'generated:', '  regenerate: nosuch'].join('\n'),
      });
      const root = fx.makeProject({ stackMd });
      try {
        const r = sp.validateProfile({ projectRoot: root });
        assert.equal(r.ok, false);
        const hit = r.errors.find((e) => e.code === 'STK005' && e.path === 'generated.regenerate');
        assert.ok(hit, JSON.stringify(r.errors));
        assert.ok(hit.msg.includes('nosuch'), hit.msg);
      } finally {
        fx.cleanup(root);
      }
    });

    test('verification.runtime_check', () => {
      const stackMd = fx.profileMd({
        yaml: ['schema: 1', 'verification:', '  runtime: cli', '  runtime_check: nosuch'].join('\n'),
      });
      const root = fx.makeProject({ stackMd });
      try {
        const r = sp.validateProfile({ projectRoot: root });
        assert.equal(r.ok, false);
        const hit = r.errors.find((e) => e.code === 'STK005' && e.path === 'verification.runtime_check');
        assert.ok(hit, JSON.stringify(r.errors));
        assert.ok(hit.msg.includes('nosuch'), hit.msg);
      } finally {
        fx.cleanup(root);
      }
    });
  });

  test('V8: an H2 section outside SECTION_NAMES -> STK006', () => {
    const stackMd = fx.profileMd({ yaml: 'schema: 1', sections: [{ name: 'Hacks', text: 'Do not.' }] });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.validateProfile({ projectRoot: root });
      assert.equal(r.ok, false);
      assert.ok(codes(r.errors).includes('STK006'), JSON.stringify(r.errors));
    } finally {
      fx.cleanup(root);
    }
  });

  test('V9: body of 151 lines -> warning STK007, ok stays true', () => {
    const stackMd = fx.longBodyProfile(150); // bodyLineCount === 151, see fixture doc
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.validateProfile({ projectRoot: root });
      assert.equal(r.ok, true);
      assert.deepEqual(r.errors, []);
      assert.ok(codes(r.warnings).includes('STK007'), JSON.stringify(r.warnings));
    } finally {
      fx.cleanup(root);
    }
  });

  test('V10: unterminated frontmatter -> STK008, not a throw', () => {
    const root = fx.makeProject({ stackMd: '---\nschema: 1\n' });
    try {
      let r;
      assert.doesNotThrow(() => {
        r = sp.validateProfile({ projectRoot: root });
      });
      assert.equal(r.ok, false);
      assert.ok(codes(r.errors).includes('STK008'), JSON.stringify(r.errors));
    } finally {
      fx.cleanup(root);
    }
  });

  test('V11: components[].profile pointing at a missing file -> STK009', () => {
    const stackMd = fx.profileMd({
      yaml: ['schema: 1', 'components:', '  - { path: "apps/", profile: "missing.md" }'].join('\n'),
    });
    const root = fx.makeProject({ stackMd });
    try {
      const r = sp.validateProfile({ projectRoot: root });
      assert.equal(r.ok, false);
      assert.ok(codes(r.errors).includes('STK009'), JSON.stringify(r.errors));
    } finally {
      fx.cleanup(root);
    }
  });

  test('V12: validateProfileText on a draft string (no file on disk) behaves like V1', () => {
    const text = fx.profileMd({
      yaml: [
        'schema: 1',
        'commands:',
        '  mycheck: { run: "mytool check" }',
        'gates:',
        '  task: [mycheck]',
      ].join('\n'),
    });
    const r = sp.validateProfileText(text, {});
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
  });

  test('V13: bundled general and the three bundled stack-profiles validate ok — flutter via dart via general', () => {
    const PROFILES_DIR = path.join(__dirname, '..', '..', 'stack-profiles');
    const goText = fs.readFileSync(path.join(PROFILES_DIR, 'go.md'), 'utf-8');
    const dartText = fs.readFileSync(path.join(PROFILES_DIR, 'dart.md'), 'utf-8');
    const flutterText = fs.readFileSync(path.join(PROFILES_DIR, 'flutter.md'), 'utf-8');
    // No install: flutter's `extends: dart` resolves through the bundled tier (TRD 42-02).
    const home = fx.makeHome({});
    try {
      const generalResult = sp.validateProfile({});
      assert.equal(generalResult.ok, true, JSON.stringify(generalResult.errors));

      const goResult = sp.validateProfileText(goText, { userHome: home });
      assert.equal(goResult.ok, true, JSON.stringify(goResult.errors));

      const dartResult = sp.validateProfileText(dartText, { userHome: home });
      assert.equal(dartResult.ok, true, JSON.stringify(dartResult.errors));

      const flutterResult = sp.validateProfileText(flutterText, { userHome: home });
      assert.equal(flutterResult.ok, true, JSON.stringify(flutterResult.errors));
      assert.deepEqual(flutterResult.warnings, []);
    } finally {
      fx.cleanup(home);
    }
  });

  test('V13b: a user-tier dart.md override is what flutter extends, ahead of the bundled dart', () => {
    const PROFILES_DIR = path.join(__dirname, '..', '..', 'stack-profiles');
    const dartText = fs.readFileSync(path.join(PROFILES_DIR, 'dart.md'), 'utf-8');
    const flutterText = fs.readFileSync(path.join(PROFILES_DIR, 'flutter.md'), 'utf-8');
    const home = fx.makeHome({ stacks: { dart: dartText.replace('run: "dart test"', 'run: "dart test --user-tier"') } });
    try {
      const flutterResult = sp.validateProfileText(flutterText, { userHome: home });
      assert.equal(flutterResult.ok, true, JSON.stringify(flutterResult.errors));
      const resolved = sp.resolveFromParsed(sp.parseProfile(flutterText, {}), { userHome: home });
      const dartHop = resolved.chain.find((c) => c.id === 'dart');
      assert.equal(dartHop.path, path.join(home, '.claude', 'devflow', 'stacks', 'dart.md'));
      assert.equal(dartHop.source, 'user');
    } finally {
      fx.cleanup(home);
    }
  });

  test('V15: a component naming a bundled profile id is not STK009', () => {
    const home = fx.makeHome({});
    const text = fx.profileMd({
      yaml: ['schema: 1', 'components:', '  - { path: "svc/", profile: go }'].join('\n'),
    });
    try {
      const r = sp.validateProfileText(text, { userHome: home });
      assert.equal(r.errors.find((e) => e.code === 'STK009'), undefined, JSON.stringify(r.errors));
      const off = sp.validateProfileText(text, { userHome: home, bundledDir: null });
      assert.ok(off.errors.find((e) => e.code === 'STK009'), 'with the bundled tier off, go is not found');
    } finally {
      fx.cleanup(home);
    }
  });
});

// ─── V14: placeholder skill pins -> STK010 (TRD 42-01, SDR-07) ────────────────

function skillsYaml(entries, extra = []) {
  return [
    'schema: 1',
    ...extra,
    'agent_tooling:',
    '  skills:',
    ...entries.map(({ source, pin }) => `    - { source: ${JSON.stringify(source)}, pin: ${JSON.stringify(pin)} }`),
  ].join('\n');
}

function stk010(list) {
  return list.filter((w) => w.code === 'STK010');
}

describe('validateProfile — STK010 placeholder skill pin (V14)', () => {
  test('V14a: pin "<sha>" -> one STK010 warning naming the source and the pin; ok stays true', () => {
    const text = fx.profileMd({ yaml: skillsYaml([{ source: 'github.com/acme/skills', pin: '<sha>' }]) });
    const r = sp.validateProfileText(text, {});
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.deepEqual(r.errors, []);
    const hits = stk010(r.warnings);
    assert.equal(hits.length, 1, JSON.stringify(r.warnings));
    assert.match(hits[0].msg, /github\.com\/acme\/skills/);
    assert.match(hits[0].msg, /placeholder pin "<sha>"/);
    assert.match(hits[0].msg, /pin a real commit/);
  });

  test('V14b: any whole-string <...> placeholder counts — pin "<commit>" -> STK010', () => {
    const text = fx.profileMd({ yaml: skillsYaml([{ source: 'github.com/acme/skills', pin: '<commit>' }]) });
    const r = sp.validateProfileText(text, {});
    assert.equal(r.ok, true);
    assert.equal(stk010(r.warnings).length, 1, JSON.stringify(r.warnings));
    assert.match(stk010(r.warnings)[0].msg, /"<commit>"/);
  });

  test('V14c: a real SHA, or a string merely containing angle brackets, is not a placeholder', () => {
    const text = fx.profileMd({
      yaml: skillsYaml([
        { source: 'github.com/acme/skills', pin: '155dc7ca10da' },
        { source: 'github.com/acme/other', pin: 'v1.2.3<beta>' },
      ]),
    });
    const r = sp.validateProfileText(text, {});
    assert.equal(r.ok, true);
    assert.deepEqual(stk010(r.warnings), [], JSON.stringify(r.warnings));
  });

  test('V14d: a placeholder on an inherited org layer is reported against that layer', () => {
    const orgMd = fx.profileMd({
      yaml: skillsYaml([{ source: 'github.com/acme/org-skills', pin: '<sha>' }], ['id: acme', 'extends: general']),
    });
    const home = fx.makeHome({ stacks: { acme: orgMd } });
    const root = fx.makeProject({ stackMd: fx.profileMd({ yaml: ['schema: 1', 'extends: acme'].join('\n') }) });
    try {
      const r = sp.validateProfile({ projectRoot: root, userHome: home });
      assert.equal(r.ok, true, JSON.stringify(r.errors));
      const hits = stk010(r.warnings);
      assert.equal(hits.length, 1, JSON.stringify(r.warnings));
      assert.match(hits[0].msg, /github\.com\/acme\/org-skills/);
      assert.match(hits[0].msg, /acme/);
      assert.equal(hits[0].file, path.join(home, '.claude', 'devflow', 'stacks', 'acme.md'));
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('V14e: dedupes by (source, pin, layer path) — a repeat in one layer warns once, the same entry in two layers warns twice', () => {
    const entry = { source: 'github.com/acme/skills', pin: '<sha>' };
    const orgMd = fx.profileMd({ yaml: skillsYaml([entry], ['id: acme', 'extends: general']) });
    const home = fx.makeHome({ stacks: { acme: orgMd } });
    const root = fx.makeProject({ stackMd: fx.profileMd({ yaml: skillsYaml([entry, entry], ['extends: acme']) }) });
    try {
      const r = sp.validateProfile({ projectRoot: root, userHome: home });
      assert.equal(r.ok, true, JSON.stringify(r.errors));
      const hits = stk010(r.warnings);
      assert.equal(hits.length, 2, JSON.stringify(hits));
      const files = hits.map((w) => w.file).sort();
      assert.deepEqual(files, [path.join(home, '.claude', 'devflow', 'stacks', 'acme.md'), path.join(root, '.planning', 'STACK.md')].sort());
    } finally {
      fx.cleanup(root, home);
    }
  });

  test('V14f: validateProfile on an on-disk STACK.md surfaces STK010 (the code survives the file path)', () => {
    const root = fx.makeProject({ stackMd: fx.profileMd({ yaml: skillsYaml([{ source: 'github.com/acme/skills', pin: '<sha>' }]) }) });
    try {
      const r = sp.validateProfile({ projectRoot: root });
      assert.equal(r.ok, true, JSON.stringify(r.errors));
      assert.equal(stk010(r.warnings).length, 1, JSON.stringify(r.warnings));
      assert.equal(stk010(r.warnings)[0].file, path.join(root, '.planning', 'STACK.md'));
    } finally {
      fx.cleanup(root);
    }
  });
});
