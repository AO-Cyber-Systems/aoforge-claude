'use strict';

// Test list (TRD 72-14, objective 72-install-and-naming-cleanup, INST-05). The generator of the
// final devflow@aocyber release: one forwarding skill per AOForge skill, kept in step by --check.
//
// 1. renderPointerSkill(skill) -> SKILL.md text. Frontmatter (read back with the repo's own
//    parser, never compared as raw text) holds exactly name, description, argument-hint (when the
//    skill has one) and allowed-tools [Skill]; the body names aoforge:<name>, says to pass the
//    arguments unchanged, and gives /plugin install aoforge@aocyber for when AOForge is absent.
//    1b every fixture skill round-trips its description and hint (block, one-line, brackets).
//    1c a manual-only skill (disable-model-invocation) keeps the flag, and its body tells the
//       user to type /aoforge:<name> instead of invoking the Skill tool (which cannot run it).
//    1d a hint holding a double quote is escaped so the YAML string reads back unchanged.
//    1e parseSkill reads each typed-out AOForge fixture skill as EXPECTED; extra frontmatter
//       (requires:, model:) is not carried.
// 2. plan(aoforgeSkillsDir, pointerSkillsDir) -> { missing, extra, stale }, sorted, for the
//    fixture states empty, complete, missing, extra and stale.
// 3. CLI: --write on an empty pointer dir writes every pointer (each equal to the render) and
//    --check then exits 0; one pointer deleted -> --check exits 1 naming it; a stray pointer dir
//    -> exits 1 naming it; a stale pointer -> exits 1 naming it; --write on the stray state
//    removes it; no mode or an unknown flag exits 2.
// 4. The real repository: --check exits 0, and plugins/devflow/skills has one directory per
//    plugins/aoforge/skills directory.
//
// Fixtures: scripts/__fixtures__/legacy-pointer-fixtures.cjs (typed-out AOForge skills in tmp
// roots). Runtime: test 4 reads the repository; everything else writes only its own tmp roots.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(__dirname, 'gen-pointer-skills.cjs');
const { renderPointerSkill, parseSkill, plan } = require('./gen-pointer-skills.cjs');
const { extractFrontmatter } = require(path.join(REPO_ROOT, 'plugins', 'aoforge', 'aoforge', 'bin', 'lib', 'frontmatter.cjs'));
const fx = require('./__fixtures__/legacy-pointer-fixtures.cjs');

/** Split a SKILL.md into its parsed frontmatter, its frontmatter key order and its body. */
function readPointer(text) {
  const m = text.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  assert.ok(m, `not a frontmatter document:\n${text}`);
  const keys = m[1]
    .split('\n')
    .map((l) => l.match(/^([A-Za-z0-9_-]+):/))
    .filter(Boolean)
    .map((k) => k[1]);
  return { fm: extractFrontmatter(text), keys, body: m[2] };
}

function cli(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const QUICK = {
  name: 'quick',
  description: 'Small features.\nUse when: the change is small.\nTriggers on: "small change"\n',
  argumentHint: '[--full]',
};

describe('1: renderPointerSkill', () => {
  test('1a: frontmatter is name, description, argument-hint and allowed-tools [Skill]; body forwards to aoforge:quick', () => {
    const { fm, keys, body } = readPointer(renderPointerSkill(QUICK));
    assert.deepEqual(keys, ['name', 'description', 'argument-hint', 'allowed-tools']);
    assert.equal(fm.name, 'quick');
    assert.equal(fm.description, QUICK.description);
    assert.equal(fm['argument-hint'], '[--full]');
    assert.deepEqual(fm['allowed-tools'], ['Skill']);
    assert.match(body, /invoke the Skill tool with skill `aoforge:quick`/);
    assert.match(body, /\$ARGUMENTS/);
    assert.match(body, /unchanged/);
    assert.match(body, /`\/plugin install aoforge@aocyber`/);
    assert.match(body, /`claude plugin disable devflow@aocyber`/);
    assert.match(body, /release after\s+3\.0\.0/);
  });

  test('1b: every fixture skill round-trips its description and hint', () => {
    for (const skill of Object.values(fx.EXPECTED)) {
      const { fm, keys } = readPointer(renderPointerSkill(skill));
      assert.equal(fm.name, skill.name, skill.name);
      assert.equal(fm.description, skill.description, `${skill.name} description`);
      if (skill.argumentHint === null) {
        assert.equal(keys.includes('argument-hint'), false, `${skill.name} has no hint`);
      } else {
        assert.equal(fm['argument-hint'], skill.argumentHint, `${skill.name} hint`);
      }
      assert.deepEqual(fm['allowed-tools'], ['Skill'], `${skill.name} allowed-tools`);
    }
  });

  test('1c: a manual-only skill keeps the flag and tells the user to type the command', () => {
    const { fm, keys, body } = readPointer(renderPointerSkill(fx.EXPECTED.gamma));
    assert.deepEqual(keys, ['name', 'description', 'argument-hint', 'disable-model-invocation', 'allowed-tools']);
    assert.equal(fm['disable-model-invocation'], 'true');
    assert.match(body, /`\/aoforge:gamma \$ARGUMENTS`/);
    assert.doesNotMatch(body, /invoke the Skill tool with skill/);
    assert.match(body, /`\/plugin install aoforge@aocyber`/);
    // a model-invocable skill carries no flag
    assert.equal(readPointer(renderPointerSkill(fx.EXPECTED.alpha)).keys.includes('disable-model-invocation'), false);
  });

  test('1d: a hint holding a double quote reads back unchanged', () => {
    const text = renderPointerSkill({ name: 'x', description: 'X.\n', argumentHint: 'say "hi" \\ bye' });
    const line = text.split('\n').find((l) => l.startsWith('argument-hint:'));
    assert.equal(JSON.parse(line.slice('argument-hint:'.length).trim()), 'say "hi" \\ bye');
  });

  test('1e: parseSkill reads each typed-out AOForge skill as EXPECTED', () => {
    for (const [name, text] of Object.entries(fx.AOFORGE_SKILLS)) {
      assert.deepEqual(parseSkill(text, name), fx.EXPECTED[name], name);
    }
  });
});

describe('2: plan', () => {
  const cases = {
    empty: { missing: ['alpha', 'beta', 'gamma'], extra: [], stale: [] },
    complete: { missing: [], extra: [], stale: [] },
    missing: { missing: [fx.MISSING], extra: [], stale: [] },
    extra: { missing: [], extra: [fx.EXTRA], stale: [] },
    stale: { missing: [], extra: [], stale: [fx.STALE] },
  };
  for (const [state, want] of Object.entries(cases)) {
    test(`2: ${state}`, () => {
      const f = fx.pointerFixture(state, { render: renderPointerSkill });
      try {
        assert.deepEqual(plan(f.aoforgeSkills, f.pointerSkills), want);
      } finally {
        f.cleanup();
      }
    });
  }

  test('2: a pointer dir that does not exist yet is all missing', () => {
    const f = fx.pointerFixture('empty');
    try {
      fs.rmSync(f.pointerSkills, { recursive: true });
      assert.deepEqual(plan(f.aoforgeSkills, f.pointerSkills), { missing: ['alpha', 'beta', 'gamma'], extra: [], stale: [] });
    } finally {
      f.cleanup();
    }
  });
});

describe('3: CLI', () => {
  const io = (f) => ['--source', f.aoforgeSkills, '--dest', f.pointerSkills];

  test('3a: --write fills an empty pointer dir; --check then exits 0', () => {
    const f = fx.pointerFixture('empty');
    try {
      const w = cli('--write', ...io(f));
      assert.equal(w.code, 0, w.stderr);
      for (const [name, skill] of Object.entries(fx.EXPECTED)) {
        const written = fs.readFileSync(path.join(f.pointerSkills, name, 'SKILL.md'), 'utf8');
        assert.equal(written, renderPointerSkill(skill), name);
      }
      const c = cli('--check', ...io(f));
      assert.equal(c.code, 0, c.stderr);
    } finally {
      f.cleanup();
    }
  });

  test('3b: one pointer deleted -> --check exits 1 naming it', () => {
    const f = fx.pointerFixture('complete', { render: renderPointerSkill });
    try {
      fs.rmSync(path.join(f.pointerSkills, 'gamma'), { recursive: true });
      const c = cli('--check', ...io(f));
      assert.equal(c.code, 1);
      assert.match(c.stderr, /missing: gamma/);
    } finally {
      f.cleanup();
    }
  });

  test('3c: a stray pointer dir -> --check exits 1 naming it; --write removes it', () => {
    const f = fx.pointerFixture('extra', { render: renderPointerSkill });
    try {
      const c = cli('--check', ...io(f));
      assert.equal(c.code, 1);
      assert.match(c.stderr, new RegExp(`extra: ${fx.EXTRA}`));
      const w = cli('--write', ...io(f));
      assert.equal(w.code, 0, w.stderr);
      assert.equal(fs.existsSync(path.join(f.pointerSkills, fx.EXTRA)), false);
      assert.equal(cli('--check', ...io(f)).code, 0);
    } finally {
      f.cleanup();
    }
  });

  test('3d: a stale pointer -> --check exits 1 naming it', () => {
    const f = fx.pointerFixture('stale', { render: renderPointerSkill });
    try {
      const c = cli('--check', ...io(f));
      assert.equal(c.code, 1);
      assert.match(c.stderr, new RegExp(`stale: ${fx.STALE}`));
    } finally {
      f.cleanup();
    }
  });

  test('3e: no mode, or an unknown flag, exits 2', () => {
    assert.equal(cli().code, 2);
    assert.equal(cli('--check', '--nope').code, 2);
    assert.equal(cli('--check', '--write').code, 2);
  });
});

describe('4: the real repository', () => {
  test('4: --check exits 0 and there is one pointer per AOForge skill', () => {
    const c = cli('--check');
    assert.equal(c.code, 0, c.stderr);
    const dirs = (rel) =>
      fs
        .readdirSync(path.join(REPO_ROOT, rel), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    assert.deepEqual(dirs('plugins/devflow/skills'), dirs('plugins/aoforge/skills'));
  });
});
