'use strict';

/**
 * skill-requires.test.cjs — TRD 61-02 task 1 (STOR-04): `requires:` in skill frontmatter, the
 * PATH lookup and the refusal text.
 *
 * Hand-built fixtures only: skills dirs are temp directories holding literal SKILL.md text, and PATH
 * directories are temp directories holding literal shell scripts. No lookup ever reads the machine's
 * real PATH: every one gets an explicit `env.PATH`.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sr = require('./skill-requires.cjs');

const IS_WIN = process.platform === 'win32';
const EXE = '#!/bin/sh\nexit 0\n';

let root;
let skillsDir;
let binWithGh;
let binWithGhToo;
let binEmpty;
let binNotExec;
let binDirNamedGh;

function skill(name, frontmatter) {
  const dir = path.join(skillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n${frontmatter}---\nbody\n`, 'utf-8');
}

function exe(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, EXE, 'utf-8');
  fs.chmodSync(file, 0o755);
  return file;
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-requires-'));
  skillsDir = path.join(root, 'skills');
  fs.mkdirSync(skillsDir);

  binWithGh = path.join(root, 'bin-gh');
  exe(binWithGh, 'gh');
  binWithGhToo = path.join(root, 'bin-gh-too');
  exe(binWithGhToo, 'gh');
  binEmpty = path.join(root, 'bin-empty');
  fs.mkdirSync(binEmpty);

  binNotExec = path.join(root, 'bin-notexec');
  fs.mkdirSync(binNotExec);
  fs.writeFileSync(path.join(binNotExec, 'gh'), EXE, 'utf-8');
  fs.chmodSync(path.join(binNotExec, 'gh'), 0o644);

  binDirNamedGh = path.join(root, 'bin-dir');
  fs.mkdirSync(path.join(binDirNamedGh, 'gh'), { recursive: true });
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('parseRequires', () => {
  test('1a. no requires key is ok with no tools', () => {
    assert.deepEqual(sr.parseRequires({}), { ok: true, tools: [] });
    assert.deepEqual(sr.parseRequires({ name: 'x' }), { ok: true, tools: [] });
    assert.deepEqual(sr.parseRequires(undefined), { ok: true, tools: [] });
    assert.deepEqual(sr.parseRequires(null), { ok: true, tools: [] });
  });

  test('1b. a single string is one tool', () => {
    assert.deepEqual(sr.parseRequires({ requires: 'gh' }), { ok: true, tools: ['gh'] });
  });

  test('1c. a list is deduplicated and keeps its order', () => {
    assert.deepEqual(
      sr.parseRequires({ requires: ['gh', 'docker', 'gh'] }),
      { ok: true, tools: ['gh', 'docker'] }
    );
  });

  test('1d. an empty list declares nothing', () => {
    assert.deepEqual(sr.parseRequires({ requires: [] }), { ok: true, tools: [] });
  });

  test('1e. a tool token is lowercase letters, digits and . _ + -', () => {
    for (const good of ['gh', 'g++', 'python3.12', 'a_b', 'a-b', '7z']) {
      assert.deepEqual(sr.parseRequires({ requires: [good] }), { ok: true, tools: [good] }, good);
    }
  });

  test('1f. a bad value is an error that names it', () => {
    for (const bad of [['Gh CLI'], [5], {}, '', ['gh', '../gh'], ['-rf'], ['GH'], [''], [null], 5, true]) {
      const r = sr.parseRequires({ requires: bad });
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.equal(typeof r.error, 'string');
      assert.ok(r.error.includes('requires'), r.error);
      assert.equal(r.tools, undefined);
    }
    assert.ok(sr.parseRequires({ requires: ['Gh CLI'] }).error.includes('"Gh CLI"'));
    assert.ok(sr.parseRequires({ requires: [5] }).error.includes('5'));
    assert.ok(sr.parseRequires({ requires: {} }).error.includes('{}'));
    assert.ok(sr.parseRequires({ requires: '' }).error.includes('""'));
  });
});

describe('readSkillRequires', () => {
  test('2a. a block list', () => {
    skill('blocky', 'requires:\n  - gh\n  - docker\n');
    assert.deepEqual(sr.readSkillRequires(skillsDir, 'blocky'), { found: true, tools: ['gh', 'docker'] });
  });

  test('2b. an inline list', () => {
    skill('inline', 'requires: [gh, docker]\n');
    assert.deepEqual(sr.readSkillRequires(skillsDir, 'inline'), { found: true, tools: ['gh', 'docker'] });
  });

  test('2c. a single string', () => {
    skill('single', 'requires: gh\n');
    assert.deepEqual(sr.readSkillRequires(skillsDir, 'single'), { found: true, tools: ['gh'] });
  });

  test('2d. no key', () => {
    skill('plain', 'description: nothing needed\n');
    const r = sr.readSkillRequires(skillsDir, 'plain');
    assert.deepEqual(r, { found: true, tools: [] });
    assert.equal(r.error, undefined);
  });

  test('2e. a missing skill', () => {
    assert.deepEqual(sr.readSkillRequires(skillsDir, 'no-such-skill'), { found: false, tools: [] });
    assert.deepEqual(sr.readSkillRequires(path.join(root, 'no-such-dir'), 'x'), { found: false, tools: [] });
  });

  test('2f. an invalid value is found, empty and carries the error', () => {
    skill('badreq', 'requires:\n  - Gh CLI\n');
    const r = sr.readSkillRequires(skillsDir, 'badreq');
    assert.equal(r.found, true);
    assert.deepEqual(r.tools, []);
    assert.ok(r.error.includes('Gh CLI'), r.error);
  });

  test('2g. a name with path characters is not found and nothing outside skillsDir is read', () => {
    // A real SKILL.md that "../outside" would reach if the name were joined unchecked.
    fs.mkdirSync(path.join(root, 'outside'));
    fs.writeFileSync(path.join(root, 'outside', 'SKILL.md'), '---\nname: outside\nrequires: [gh]\n---\n', 'utf-8');
    fs.mkdirSync(path.join(skillsDir, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'a', 'b', 'SKILL.md'), '---\nname: b\nrequires: [gh]\n---\n', 'utf-8');
    skill('Upper', 'requires: [gh]\n');

    for (const name of ['../outside', 'a/b', 'X', 'Upper', '', '.', '..', 'a b', '-lead']) {
      assert.deepEqual(sr.readSkillRequires(skillsDir, name), { found: false, tools: [] }, JSON.stringify(name));
    }
  });

  test('2h. bad arguments never throw', () => {
    for (const [dir, name] of [[undefined, 'x'], [null, null], [skillsDir, undefined], [skillsDir, 5], [{}, {}]]) {
      assert.deepEqual(sr.readSkillRequires(dir, name), { found: false, tools: [] });
    }
  });
});

describe('skillNameFromInvocation', () => {
  const expansion = (extra) => ({ hook_event_name: 'UserPromptExpansion', ...extra });
  const skillTool = (s) => ({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: s } });

  test('3a. a typed /aoforge:<skill> resolves from the prompt', () => {
    assert.equal(
      sr.skillNameFromInvocation(expansion({ prompt: '/aoforge:gh-sync status', command_name: 'gh-sync' })),
      'gh-sync'
    );
  });

  test('3b. a namespaced command_name alone is enough', () => {
    assert.equal(sr.skillNameFromInvocation(expansion({ command_name: 'aoforge:gh-sync' })), 'gh-sync');
  });

  test('3c. another plugin or the user own skill of the same name is not an AOForge skill', () => {
    assert.equal(sr.skillNameFromInvocation(expansion({ prompt: '/gh-sync', command_name: 'gh-sync' })), null);
    assert.equal(sr.skillNameFromInvocation(expansion({ command_name: 'gh-sync' })), null);
    assert.equal(sr.skillNameFromInvocation(expansion({ command_name: 'other:gh-sync' })), null);
    assert.equal(sr.skillNameFromInvocation(expansion({ prompt: '/other:gh-sync x', command_name: 'gh-sync' })), null);
  });

  test('3d. the Skill tool resolves aoforge:<skill>, with or without a leading slash', () => {
    assert.equal(sr.skillNameFromInvocation(skillTool('aoforge:gh-sync')), 'gh-sync');
    assert.equal(sr.skillNameFromInvocation(skillTool('/aoforge:gh-sync')), 'gh-sync');
  });

  test('3e. the Skill tool with a bare or foreign name is not an AOForge skill', () => {
    assert.equal(sr.skillNameFromInvocation(skillTool('gh-sync')), null);
    assert.equal(sr.skillNameFromInvocation(skillTool('other:gh-sync')), null);
  });

  test('3f. other tools and events are ignored', () => {
    assert.equal(
      sr.skillNameFromInvocation({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { skill: 'aoforge:gh-sync' } }),
      null
    );
    assert.equal(
      sr.skillNameFromInvocation({ hook_event_name: 'UserPromptSubmit', prompt: '/aoforge:gh-sync' }),
      null
    );
    assert.equal(sr.skillNameFromInvocation({ tool_name: 'Skill', tool_input: { skill: 'aoforge:gh-sync' } }), null);
  });

  test('3g. null and non-object input never throw', () => {
    for (const bad of [null, undefined, 'aoforge:gh-sync', 5, [], {}, { hook_event_name: 'PreToolUse', tool_name: 'Skill' }]) {
      assert.equal(sr.skillNameFromInvocation(bad), null, JSON.stringify(bad));
    }
  });

  test('3h. a name that is not a valid skill name is not returned', () => {
    assert.equal(sr.skillNameFromInvocation(skillTool('aoforge:../../etc')), null);
    assert.equal(sr.skillNameFromInvocation(skillTool('aoforge:A')), null);
    assert.equal(sr.skillNameFromInvocation(expansion({ command_name: 'aoforge:a/b' })), null);
  });
});

describe('findOnPath', () => {
  test('4a. an executable file in a PATH directory is found by absolute path', { skip: IS_WIN }, () => {
    assert.equal(sr.findOnPath('gh', { PATH: binWithGh }), path.join(binWithGh, 'gh'));
  });

  test('4b. a non-executable file is not found', { skip: IS_WIN }, () => {
    assert.equal(sr.findOnPath('gh', { PATH: binNotExec }), null);
  });

  test('4c. a directory named like the tool is not found', () => {
    assert.equal(sr.findOnPath('gh', { PATH: binDirNamedGh }), null);
  });

  test('4d. an empty, undefined or missing PATH finds nothing', () => {
    assert.equal(sr.findOnPath('gh', { PATH: '' }), null);
    assert.equal(sr.findOnPath('gh', {}), null);
    assert.equal(sr.findOnPath('gh', undefined), null);
    assert.equal(sr.findOnPath('gh', null), null);
  });

  test('4e. PATH entries that do not exist or are empty are skipped', { skip: IS_WIN }, () => {
    const gone = path.join(root, 'does-not-exist');
    const PATH = ['', gone, '', binWithGh].join(path.delimiter);
    assert.equal(sr.findOnPath('gh', { PATH }), path.join(binWithGh, 'gh'));
  });

  test('4f. the first PATH directory that has it wins', { skip: IS_WIN }, () => {
    const first = [binWithGhToo, binWithGh].join(path.delimiter);
    assert.equal(sr.findOnPath('gh', { PATH: first }), path.join(binWithGhToo, 'gh'));
    const second = [binWithGh, binWithGhToo].join(path.delimiter);
    assert.equal(sr.findOnPath('gh', { PATH: second }), path.join(binWithGh, 'gh'));
  });

  test('4g. a tool that is not on PATH is null', () => {
    assert.equal(sr.findOnPath('docker', { PATH: [binEmpty, binWithGh].join(path.delimiter) }), null);
  });

  test('4h. a tool name that is not a plain token never resolves a path', { skip: IS_WIN }, () => {
    const PATH = binWithGh;
    for (const bad of ['../bin-gh/gh', 'bin-gh/gh', path.join(binWithGh, 'gh'), '', '.', '..', undefined, 5]) {
      assert.equal(sr.findOnPath(bad, { PATH }), null, JSON.stringify(bad));
    }
  });
});

describe('missingTools', () => {
  test('5a. names only the tools that are not on PATH', { skip: IS_WIN }, () => {
    assert.deepEqual(sr.missingTools(['gh', 'docker'], { PATH: binWithGh }), ['docker']);
  });

  test('5b. nothing required, nothing missing', () => {
    assert.deepEqual(sr.missingTools([], { PATH: binEmpty }), []);
    assert.deepEqual(sr.missingTools(undefined, { PATH: binEmpty }), []);
  });

  test('5c. everything missing keeps the declared order', () => {
    assert.deepEqual(sr.missingTools(['gh', 'docker'], { PATH: binEmpty }), ['gh', 'docker']);
    assert.deepEqual(sr.missingTools(['gh'], {}), ['gh']);
  });
});

describe('refusalReason', () => {
  test('6a. one missing tool names the skill, the hint, doctor and the escape', () => {
    const text = sr.refusalReason('gh-sync', ['gh']);
    for (const needle of [
      '/aoforge:gh-sync',
      'gh',
      sr.INSTALL_HINTS.gh,
      'gh auth login',
      '/aoforge:doctor',
      'skill-requires',
      'AOFORGE_SKIP_SKILL_REQUIRES=1',
    ]) {
      assert.ok(text.includes(needle), `${needle} missing from: ${text}`);
    }
    assert.ok(text.includes('it is not installed'), text);
    assert.ok(!text.includes('\n'), 'one paragraph');
  });

  test('6b. two missing tools are both named, with plural grammar', () => {
    const text = sr.refusalReason('build', ['gh', 'docker']);
    assert.ok(text.startsWith('/aoforge:build needs gh and docker on PATH'), text);
    assert.ok(text.includes('they are not installed'), text);
    assert.ok(text.includes(`not installed: gh: ${sr.INSTALL_HINTS.gh}; docker: ${sr.INSTALL_HINTS.docker}. `), text);
  });

  test('6c. three missing tools read as a list', () => {
    const text = sr.refusalReason('x', ['gh', 'docker', 'go']);
    assert.ok(text.includes('needs gh, docker and go on PATH'), text);
  });

  test('6d. an unknown tool gets the generic hint', () => {
    const text = sr.refusalReason('x', ['frobnicate']);
    assert.ok(text.includes('install frobnicate and make sure it is on PATH'), text);
  });

  test('6e. the escape is named as the launch environment, not a command prefix', () => {
    const text = sr.refusalReason('gh-sync', ['gh']);
    assert.ok(text.includes('in the environment Claude Code is launched from'), text);
  });

  test('6f. the constants are exported', () => {
    assert.equal(sr.SKIP_ENV, 'AOFORGE_SKIP_SKILL_REQUIRES');
    assert.ok(Object.isFrozen(sr.INSTALL_HINTS));
    for (const tool of ['gh', 'docker', 'flutter', 'go']) {
      assert.equal(typeof sr.INSTALL_HINTS[tool], 'string', tool);
    }
    assert.equal(sr.INSTALL_HINTS.flutter, 'install Flutter (https://docs.flutter.dev/get-started/install)');
    assert.equal(sr.INSTALL_HINTS.go, 'install Go (https://go.dev/dl/)');
  });

  test('6g. bad arguments never throw', () => {
    assert.equal(typeof sr.refusalReason(undefined, undefined), 'string');
    assert.equal(typeof sr.refusalReason('x', []), 'string');
  });
});

describe('listSkillRequires', () => {
  test('7a. skills with a non-empty list, sorted by name; invalid ones carry the error', () => {
    const dir = fs.mkdtempSync(path.join(root, 'list-'));
    const put = (name, fm) => {
      fs.mkdirSync(path.join(dir, name));
      fs.writeFileSync(path.join(dir, name, 'SKILL.md'), `---\nname: ${name}\n${fm}---\nbody\n`, 'utf-8');
    };
    put('zeta', 'requires: [docker]\n');
    put('alpha', 'requires:\n  - gh\n  - docker\n');
    put('mid', 'description: needs nothing\n');
    put('broken', 'requires:\n  - Gh CLI\n');
    fs.mkdirSync(path.join(dir, 'no-skill-file'));
    fs.writeFileSync(path.join(dir, 'stray.md'), 'not a skill dir\n', 'utf-8');

    const out = sr.listSkillRequires(dir);
    assert.deepEqual(out.map(e => e.skill), ['alpha', 'broken', 'zeta']);
    assert.deepEqual(out[0], { skill: 'alpha', tools: ['gh', 'docker'] });
    assert.equal(out[1].skill, 'broken');
    assert.deepEqual(out[1].tools, []);
    assert.ok(out[1].error.includes('Gh CLI'), out[1].error);
    assert.deepEqual(out[2], { skill: 'zeta', tools: ['docker'] });
  });

  test('7b. a missing or empty skills dir lists nothing and never throws', () => {
    assert.deepEqual(sr.listSkillRequires(path.join(root, 'nope')), []);
    assert.deepEqual(sr.listSkillRequires(undefined), []);
    assert.deepEqual(sr.listSkillRequires(fs.mkdtempSync(path.join(root, 'empty-'))), []);
  });
});
