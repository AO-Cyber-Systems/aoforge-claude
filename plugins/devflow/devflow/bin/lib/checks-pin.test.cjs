'use strict';

/**
 * Tests for checks-pin.cjs (TRD 61-01, STOR-03): the one reader of the DevFlow checks workflow pin lines, and the one
 * decision about whether that pin is older than the installed plugin.
 *
 * Fixtures are hand-built: workflow text comes from the real template through gh-setup's renderTemplates, or is a
 * literal written in this file. Test 8 writes into temp dirs under the OS temp dir and removes them in `after`.
 */

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pin = require('./checks-pin.cjs');
const { renderTemplates } = require('./gh-setup.cjs');
const ghSetup = require('./gh-setup.cjs');

const DEFAULT_USES = 'AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml';

/** A workflow the way the managed template renders it, but written out by hand: header optional, refs free. */
function literalWorkflow({ managed = true, uses = `${DEFAULT_USES}@v2.13.1`, devflowRef = 'v2.13.1' } = {}) {
  return [
    ...(managed ? ['# devflow:managed — written by df-tools gh setup; edits are overwritten', '#'] : []),
    'name: DevFlow',
    '',
    'on:',
    '  pull_request:',
    '',
    'jobs:',
    '  devflow:',
    `    uses: ${uses}`,
    '    with:',
    `      devflow-ref: ${devflowRef}`,
    '',
  ].join('\n');
}

const tmpDirs = [];
function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-checks-pin-'));
  tmpDirs.push(dir);
  return dir;
}
function writeWorkflow(root, text) {
  const abs = path.join(root, '.github', 'workflows', 'devflow.yml');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf-8');
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// ─── structure ───────────────────────────────────────────────────────────────

describe('checks-pin: one definition of the workflow constants', () => {
  test('exports the three constants with the values gh setup has always used', () => {
    assert.equal(pin.WORKFLOW_PATH, '.github/workflows/devflow.yml');
    assert.equal(pin.DEFAULT_CHECKS_WORKFLOW, DEFAULT_USES);
    assert.ok(pin.MANAGED_HEADER instanceof RegExp);
    assert.equal(pin.MANAGED_HEADER.test('# devflow:managed — written by df-tools gh setup'), true);
    assert.equal(pin.MANAGED_HEADER.test('#devflow:managed'), true);
    assert.equal(pin.MANAGED_HEADER.test('# devflow:managedx'), false);
    assert.equal(ghSetup.WORKFLOW_PATH, pin.WORKFLOW_PATH, 'gh-setup still exports WORKFLOW_PATH, now from checks-pin');
  });

  test('checks-pin.cjs requires only fs and path, and gh-setup.cjs no longer defines the constants', () => {
    const own = fs.readFileSync(path.join(__dirname, 'checks-pin.cjs'), 'utf-8');
    const required = [...own.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]).sort();
    assert.deepEqual(required, ['fs', 'path']);

    const setup = fs.readFileSync(path.join(__dirname, 'gh-setup.cjs'), 'utf-8');
    for (const name of ['WORKFLOW_PATH', 'MANAGED_HEADER', 'DEFAULT_CHECKS_WORKFLOW']) {
      assert.doesNotMatch(setup, new RegExp(`^const ${name}\\s*=`, 'm'), `gh-setup.cjs must import ${name}, not define it`);
    }
  });
});

// ─── parseWorkflowPins (tests 1-5) ───────────────────────────────────────────

describe('parseWorkflowPins', () => {
  test('1. the rendered default workflow: managed, both pins, the two lines in file order', () => {
    const p = pin.parseWorkflowPins(renderTemplates({}, '2.13.1').workflow);
    assert.equal(p.managed, true);
    assert.equal(p.uses, `${DEFAULT_USES}@v2.13.1`);
    assert.equal(p.uses_path, DEFAULT_USES);
    assert.equal(p.uses_ref, 'v2.13.1');
    assert.equal(p.devflow_ref, 'v2.13.1');
    assert.deepEqual(p.lines, [`uses: ${DEFAULT_USES}@v2.13.1`, 'devflow-ref: v2.13.1']);
  });

  test('2. a configured checks_workflow @main pins both fields to main', () => {
    const p = pin.parseWorkflowPins(
      renderTemplates({ checks_workflow: 'me/fork/.github/workflows/devflow-checks.yml@main' }, '2.14.0').workflow,
    );
    assert.equal(p.uses_path, 'me/fork/.github/workflows/devflow-checks.yml');
    assert.equal(p.uses_ref, 'main');
    assert.equal(p.devflow_ref, 'main');
  });

  test('3. no "# devflow:managed" header -> managed false, pins still parsed', () => {
    const p = pin.parseWorkflowPins(literalWorkflow({ managed: false }));
    assert.equal(p.managed, false);
    assert.equal(p.uses_ref, 'v2.13.1');
    assert.equal(p.devflow_ref, 'v2.13.1');
  });

  test('3. a header below line 5 does not make the file managed (planWorkflow\'s rule)', () => {
    const text = ['name: DevFlow', '', '', '', '', '# devflow:managed', literalWorkflow({ managed: false })].join('\n');
    assert.equal(pin.parseWorkflowPins(text).managed, false);
  });

  test('4. no uses: / devflow-ref: lines -> both null, lines []', () => {
    const p = pin.parseWorkflowPins('# devflow:managed\nname: DevFlow\non:\n  push:\n');
    assert.equal(p.managed, true);
    assert.equal(p.uses, null);
    assert.equal(p.uses_path, null);
    assert.equal(p.uses_ref, null);
    assert.equal(p.devflow_ref, null);
    assert.deepEqual(p.lines, []);
  });

  test('4. non-string input -> the empty answer, never throws', () => {
    const empty = { managed: false, uses: null, uses_path: null, uses_ref: null, devflow_ref: null, lines: [] };
    for (const input of [undefined, null, 42, {}, ['uses: x@v1.0.0']]) {
      assert.deepEqual(pin.parseWorkflowPins(input), empty, `input ${JSON.stringify(input)}`);
    }
  });

  test('5. one pair of surrounding quotes is stripped from either value', () => {
    const p = pin.parseWorkflowPins(literalWorkflow({ uses: `'${DEFAULT_USES}@v2.13.1'`, devflowRef: '"v2.13.1"' }));
    assert.equal(p.devflow_ref, 'v2.13.1');
    assert.equal(p.uses, `${DEFAULT_USES}@v2.13.1`);
    assert.equal(p.uses_ref, 'v2.13.1');
    assert.deepEqual(p.lines, [`uses: '${DEFAULT_USES}@v2.13.1'`, 'devflow-ref: "v2.13.1"'], 'lines keep the file text');
  });

  test('uses without @ -> uses_ref null; the path splits at the LAST @', () => {
    assert.equal(pin.parseWorkflowPins(literalWorkflow({ uses: './.github/workflows/local.yml' })).uses_ref, null);
    const p = pin.parseWorkflowPins(literalWorkflow({ uses: 'me/x@y/.github/workflows/c.yml@v1.2.3' }));
    assert.equal(p.uses_path, 'me/x@y/.github/workflows/c.yml');
    assert.equal(p.uses_ref, 'v1.2.3');
  });

  test('CRLF text parses the same as LF text', () => {
    const lf = pin.parseWorkflowPins(renderTemplates({}, '2.13.1').workflow);
    const crlf = pin.parseWorkflowPins(renderTemplates({}, '2.13.1').workflow.replace(/\n/g, '\r\n'));
    assert.deepEqual(crlf, lf);
  });
});

// ─── parseReleaseRef (test 6) ────────────────────────────────────────────────

describe('parseReleaseRef', () => {
  test('6. release-shaped refs give three integers; anything else is null', () => {
    assert.deepEqual(pin.parseReleaseRef('v2.13.1'), [2, 13, 1]);
    assert.deepEqual(pin.parseReleaseRef('2.13.1'), [2, 13, 1]);
    for (const ref of ['main', 'v2.13', '4f2a9c1', '', null, undefined, 'v2.13.1-rc.1', 'release/2.13.1']) {
      assert.equal(pin.parseReleaseRef(ref), null, `ref ${JSON.stringify(ref)}`);
    }
  });
});

// ─── pinStatus (test 7) ──────────────────────────────────────────────────────

describe('pinStatus against installed 2.14.0', () => {
  const at = (ref, extra = {}) => pin.parseWorkflowPins(literalWorkflow({ uses: `${DEFAULT_USES}@${ref}`, devflowRef: ref, ...extra }));

  test('7. pins at v2.13.1 -> stale, listing devflow-ref and uses', () => {
    const s = pin.pinStatus(at('v2.13.1'), '2.14.0');
    assert.equal(s.state, 'stale');
    assert.equal(s.installed, '2.14.0');
    assert.deepEqual(s.stale, [{ field: 'devflow-ref', ref: 'v2.13.1' }, { field: 'uses', ref: 'v2.13.1' }]);
  });

  test('7. integer comparison, never string order: v2.9.0 is older than 2.13.1', () => {
    assert.equal(pin.pinStatus(at('v2.9.0'), '2.13.1').state, 'stale');
    assert.equal(pin.pinStatus(at('v2.13.1'), '2.9.0').state, 'ahead');
  });

  test('7. pins at v2.14.0 -> current; at v2.15.0 -> ahead; neither lists a stale entry', () => {
    const current = pin.pinStatus(at('v2.14.0'), '2.14.0');
    assert.equal(current.state, 'current');
    assert.deepEqual(current.stale, []);
    const ahead = pin.pinStatus(at('v2.15.0'), '2.14.0');
    assert.equal(ahead.state, 'ahead');
    assert.deepEqual(ahead.stale, []);
  });

  test('7. pins at main -> not-comparable', () => {
    const s = pin.pinStatus(at('main'), '2.14.0');
    assert.equal(s.state, 'not-comparable');
    assert.deepEqual(s.stale, []);
  });

  test('7. a fork\'s own uses @ref is never compared; devflow-ref always is', () => {
    const fork = pin.parseWorkflowPins(literalWorkflow({ uses: 'me/fork/.github/workflows/devflow-checks.yml@v1.0.0', devflowRef: 'v2.14.0' }));
    assert.equal(pin.pinStatus(fork, '2.14.0').state, 'current');
    const staleRunner = pin.parseWorkflowPins(literalWorkflow({ uses: 'me/fork/.github/workflows/devflow-checks.yml@v9.0.0', devflowRef: 'v2.13.1' }));
    const s = pin.pinStatus(staleRunner, '2.14.0');
    assert.equal(s.state, 'stale');
    assert.deepEqual(s.stale, [{ field: 'devflow-ref', ref: 'v2.13.1' }]);
  });

  test('7. installed v2.14.0 answers the same as 2.14.0; installed null or dev -> not-comparable', () => {
    for (const ref of ['v2.13.1', 'v2.14.0', 'v2.15.0', 'main']) {
      assert.deepEqual(pin.pinStatus(at(ref), 'v2.14.0'), pin.pinStatus(at(ref), '2.14.0'), `pins at ${ref}`);
    }
    for (const installed of [null, 'dev', undefined]) {
      const s = pin.pinStatus(at('v2.13.1'), installed);
      assert.equal(s.state, 'not-comparable', `installed ${JSON.stringify(installed)}`);
      assert.equal(s.installed, null);
      assert.deepEqual(s.stale, []);
    }
  });

  test('an unmanaged workflow is not-managed whatever it pins', () => {
    const p = pin.parseWorkflowPins(literalWorkflow({ managed: false }));
    assert.equal(pin.pinStatus(p, '2.14.0').state, 'not-managed');
  });
});

// ─── collectPinFindings (test 8) ─────────────────────────────────────────────

describe('collectPinFindings', () => {
  test('8. no .github/workflows/devflow.yml -> not applicable, absent, no findings', () => {
    const root = tmpProject();
    assert.deepEqual(pin.collectPinFindings({ projectRoot: root, installedVersion: '2.14.0' }),
      { applicable: false, state: 'absent', findings: [] });
  });

  test('8. a managed workflow at v2.13.1 -> exactly one W062 naming the file, the pin and the installed version', () => {
    const root = tmpProject();
    writeWorkflow(root, renderTemplates({}, '2.13.1').workflow);
    const r = pin.collectPinFindings({ projectRoot: root, installedVersion: '2.14.0' });
    assert.equal(r.applicable, true);
    assert.equal(r.state, 'stale');
    assert.equal(r.findings.length, 1);
    const [f] = r.findings;
    assert.deepEqual(Object.keys(f).sort(), ['code', 'fix', 'message']);
    assert.equal(f.code, 'W062');
    assert.equal(
      f.message,
      'checks-pin-stale: .github/workflows/devflow.yml pins DevFlow v2.13.1 (devflow-ref, uses), older than the installed plugin 2.14.0',
    );
    assert.match(f.message, /^checks-pin-stale:/);
    assert.ok(f.fix.includes('df-tools gh setup --apply'), f.fix);
    assert.ok(f.fix.includes('github.checks_workflow'), f.fix);
    assert.equal(f.message.includes('\n'), false, 'one line');
  });

  test('8. when the two fields disagree, the message names the older ref', () => {
    const root = tmpProject();
    writeWorkflow(root, literalWorkflow({ uses: `${DEFAULT_USES}@v2.13.1`, devflowRef: 'v2.12.0' }));
    const [f] = pin.collectPinFindings({ projectRoot: root, installedVersion: '2.14.0' }).findings;
    assert.equal(
      f.message,
      'checks-pin-stale: .github/workflows/devflow.yml pins DevFlow v2.12.0 (devflow-ref), older than the installed plugin 2.14.0',
    );
  });

  test('8. an unmanaged workflow at v2.13.1 -> not-managed, no findings', () => {
    const root = tmpProject();
    writeWorkflow(root, literalWorkflow({ managed: false }));
    const r = pin.collectPinFindings({ projectRoot: root, installedVersion: '2.14.0' });
    assert.equal(r.applicable, true);
    assert.equal(r.state, 'not-managed');
    assert.deepEqual(r.findings, []);
  });

  test('8. current and ahead pins carry their state and no findings', () => {
    const root = tmpProject();
    writeWorkflow(root, renderTemplates({}, '2.14.0').workflow);
    const r = pin.collectPinFindings({ projectRoot: root, installedVersion: '2.14.0' });
    assert.equal(r.state, 'current');
    assert.deepEqual(r.findings, []);
    assert.equal(r.pins.devflow_ref, 'v2.14.0');
    assert.equal(r.installed, '2.14.0');
  });
});

// ─── readWorkflowPin ─────────────────────────────────────────────────────────

describe('readWorkflowPin', () => {
  test('absent on a missing file; present with the text and pins otherwise', () => {
    const root = tmpProject();
    assert.deepEqual(pin.readWorkflowPin(root), { state: 'absent' });
    const text = renderTemplates({}, '2.13.1').workflow;
    writeWorkflow(root, text);
    const r = pin.readWorkflowPin(root);
    assert.equal(r.state, 'present');
    assert.equal(r.text, text);
    assert.deepEqual(r.pins, pin.parseWorkflowPins(text));
  });

  test('an unreadable path throws, so the callers can report it', () => {
    const root = tmpProject();
    fs.mkdirSync(path.join(root, '.github', 'workflows', 'devflow.yml'), { recursive: true });
    assert.throws(() => pin.readWorkflowPin(root));
    assert.throws(() => pin.collectPinFindings({ projectRoot: root, installedVersion: '2.14.0' }));
  });
});
