'use strict';

/**
 * skill-requires.repo.test.cjs — TRD 61-02 task 2 (STOR-04): the contract on the REAL skills.
 *
 * Reads `plugins/aoforge/skills/*` as shipped. It fails CI when a SKILL.md declares a `requires:` the
 * parser cannot read, when a declared tool has no install hint (the refusal would not be concrete), or
 * when `doctor` and `help` (the remedy for a missing tool) become refusable themselves.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { readSkillRequires, listSkillRequires, INSTALL_HINTS } = require('./skill-requires.cjs');

const SKILLS_DIR = path.resolve(__dirname, '..', '..', '..', 'skills');

const skillNames = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, e.name, 'SKILL.md')))
  .map(e => e.name)
  .sort();

describe('skill-requires repo contract', () => {
  test('the real skills directory is found', () => {
    assert.ok(skillNames.length >= 30, `only ${skillNames.length} skills under ${SKILLS_DIR}`);
    assert.ok(skillNames.includes('gh-sync'));
  });

  test('15. every skills/*/SKILL.md parses', () => {
    for (const name of skillNames) {
      const r = readSkillRequires(SKILLS_DIR, name);
      assert.equal(r.found, true, name);
      assert.equal(r.error, undefined, `${name}: ${r.error}`);
    }
  });

  test('16. gh-sync declares exactly gh', () => {
    assert.deepEqual(readSkillRequires(SKILLS_DIR, 'gh-sync'), { found: true, tools: ['gh'] });
  });

  test('17. every tool any skill declares has an install hint', () => {
    const declared = listSkillRequires(SKILLS_DIR);
    assert.ok(declared.length > 0, 'at least gh-sync declares requires:');
    for (const { skill, tools } of declared) {
      for (const tool of tools) {
        assert.equal(typeof INSTALL_HINTS[tool], 'string', `${skill} requires ${tool}, which has no INSTALL_HINTS entry`);
        assert.ok(INSTALL_HINTS[tool].length > 0, tool);
      }
    }
  });

  test('18. doctor and help declare no requires: (they are the remedy and must always run)', () => {
    for (const name of ['doctor', 'help']) {
      assert.deepEqual(readSkillRequires(SKILLS_DIR, name), { found: true, tools: [] }, name);
    }
  });
});
