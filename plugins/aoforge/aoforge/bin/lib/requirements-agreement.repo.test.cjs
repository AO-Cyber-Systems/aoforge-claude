'use strict';

// TOOL-10 on this repository (TRD 69-03): the SUMMARYs in .planning/objectives/ agree with their VERIFICATIONs.
//
// THE RULE. Every requirement an objective's VERIFICATION marks SATISFIED, and that a REQUIREMENTS document defines, is
// listed in `requirements-completed` by at least one SUMMARY of that objective (requirements-agreement.cjs holds the
// parse rules and the scope rule). Objective 58 broke it: EST-02 and EST-04 were satisfied and listed nowhere, which
// misled anything that audits completion from SUMMARY frontmatter. This test was RED on that state and keeps it fixed;
// a new disagreement fails it with the objective, the requirement and how to repair it.
//
// Test list:
// 11. scan(.planning).findings is empty; scan() actually checked requirements; objective 58 is among them (its SATISFIED
//     rows include EST-02 and EST-04, and both are checked, not skipped).
//
// Runtime model: read-only. Repo root is five levels up; a mirror install (no README.md or .planning/objectives there)
// skips the whole file, as planning-writes.repo.test.cjs does.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ra = require('./requirements-agreement.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const PLANNING_DIR = path.join(REPO_ROOT, '.planning');
const OBJECTIVES_DIR = path.join(PLANNING_DIR, 'objectives');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md')) && fs.existsSync(OBJECTIVES_DIR);
const SKIP = IS_AOFORGE_CHECKOUT ? false : 'not an AOForge checkout (no README.md or .planning/objectives/ five levels up)';

/** The objective 58 directory, or null once a milestone archive has moved it out of .planning/objectives/. */
function objective58Dir() {
  const name = fs.existsSync(OBJECTIVES_DIR) ? fs.readdirSync(OBJECTIVES_DIR).find(n => /^58-/.test(n)) : undefined;
  return name ? path.join(OBJECTIVES_DIR, name) : null;
}

describe('requirements-completed agrees with VERIFICATION in this repository', () => {
  test('11. no satisfied requirement is missing from every SUMMARY of its objective', { skip: SKIP }, () => {
    const { findings, checked } = ra.scan(PLANNING_DIR);
    const report = findings.map(f => `${ra.findingMessage(f)}\n    fix: ${ra.findingFix(f)}`).join('\n  ');
    assert.deepEqual(findings, [], `requirements-completed disagrees with VERIFICATION:\n  ${report}`);
    assert.ok(checked.objectives > 0 && checked.requirements > 0, `the scan checked nothing: ${JSON.stringify(checked)}`);
  });

  test('11. objective 58 is actually checked (EST-02 and EST-04 are satisfied, defined and listed)', { skip: SKIP || (objective58Dir() ? false : 'objective 58 is no longer under .planning/objectives/') }, () => {
    const known = ra.knownRequirementIds(PLANNING_DIR);
    const result = ra.scanObjective(objective58Dir(), known);
    assert.ok(result, 'objective 58 has a VERIFICATION');
    for (const id of ['EST-02', 'EST-04']) {
      assert.ok(result.satisfied.includes(id), `58-VERIFICATION marks ${id} SATISFIED: ${result.satisfied.join(', ')}`);
      assert.ok(result.checked.includes(id), `${id} is defined in a REQUIREMENTS document, so it is checked, not skipped`);
      assert.ok(result.listed.includes(id), `a 58 SUMMARY lists ${id} in requirements-completed: ${result.listed.join(', ')}`);
    }
  });
});
