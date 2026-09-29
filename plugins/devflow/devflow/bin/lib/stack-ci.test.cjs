'use strict';

// stack-ci.test.cjs — Test list (TRD 42-03, tests 1-10 plus reader-robustness cases)
//
// - C1  Continuation shape: `gosec … \` + `-fmt sarif ./...` is ONE invocation; none starts with `-`.
// - C2  Flag-fragment shape: `flutter build ipa \` + `--build-number="${{ … }}"` is ONE invocation.
// - C3  Comment shape: `# run the tests` + `go test ./...` gives only `go test ./...`.
// - C4  Echo shape: `echo "Published …"` gives none; `echo x` + `make build` gives only `make build`.
// - C5  Control-fragment shape (`test -f … || {` / `echo …; exit 1` / `}`) gives none.
// - C6  cwd: step `working-directory` > job `defaults.run.working-directory` > workflow default.
// - C7  `uses: golangci/golangci-lint-action@v6` is a step with `uses` set and `invocations: []`.
// - C8  A quoted pipe (`sed -i 's|a|b|' f && go test ./...`) is two invocations; the sed one is intact.
// - C9  `continue-on-error: true` and a workflow `on: schedule:` are recorded.
// - C10 Workflow files are read in sorted order (`.yaml` and `.yml`); a malformed file never throws.
// - C11 Reader robustness: `>` folding, key order independence, look-alike block scalars, CRLF,
//       multi-document files, flow maps / anchors skipped, hostile input.
//
// Fixtures are hand-built (`__fixtures__/stack-ci-fixtures.cjs`), never generated.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { parseWorkflows, _parseWorkflowText } = require('./stack-ci.cjs');
const fx = require('./__fixtures__/stack-ci-fixtures.cjs');

const roots = [];
afterEach(() => { fx.cleanup(...roots.splice(0)); });
const use = (root) => { roots.push(root); return root; };

const invTexts = (steps) => steps.flatMap((s) => s.invocations.map((i) => i.text));
const byName = (steps, name) => {
  const s = steps.find((x) => x.name === name);
  assert.ok(s, `no step named ${JSON.stringify(name)} in ${JSON.stringify(steps.map((x) => x.name))}`);
  return s;
};

describe('C1-C5 the fleet failure shapes are gone at the parser level', () => {
  test('C1 continuation: ONE invocation, no dangling backslash, none starting with a flag', () => {
    const steps = parseWorkflows(use(fx.continuationShape()));
    const scan = byName(steps, 'Static analysis');
    assert.equal(scan.invocations.length, 1);
    assert.equal(scan.invocations[0].text, 'gosec -exclude=G304 -fmt sarif ./...');
    assert.equal(scan.invocations[0].tool, 'gosec');
    for (const t of invTexts(steps)) {
      assert.ok(!t.startsWith('-'), `flag fragment: ${t}`);
      assert.ok(!t.endsWith('\\'), `dangling backslash: ${t}`);
    }
  });

  test('C2 flag fragment: one invocation starting `flutter build ipa`, never only a flag or `${{ }}`', () => {
    const steps = parseWorkflows(use(fx.flagFragmentShape()));
    const build = byName(steps, 'Build iOS');
    assert.equal(build.invocations.length, 1);
    assert.equal(build.invocations[0].text, 'flutter build ipa --build-number="${{ inputs.buildNumber }}"');
    assert.ok(build.invocations[0].text.startsWith('flutter build ipa'));
    for (const t of invTexts(steps)) {
      assert.ok(!/^-/.test(t), `flag-only: ${t}`);
      assert.ok(!/^\$\{\{[^}]*\}\}$/.test(t), `expression-only: ${t}`);
    }
  });

  test('C3 comment: a `# run the tests` line is not a command', () => {
    const steps = parseWorkflows(use(fx.commentAsTestShape()));
    assert.deepEqual(invTexts(steps), ['go test ./...']);
  });

  test('C4 echo: a lone echo gives zero invocations; echo plus make gives only make', () => {
    const steps = parseWorkflows(use(fx.echoOnlyShape()));
    assert.deepEqual(byName(steps, 'Announce').invocations, []);
    assert.deepEqual(byName(steps, 'Mixed').invocations.map((i) => i.text), ['make build']);
  });

  test('C5 control fragment: `test -f … || {` / `echo …; exit 1` / `}` gives zero invocations', () => {
    const steps = parseWorkflows(use(fx.controlFragmentShape()));
    const pre = byName(steps, 'Preconditions');
    assert.deepEqual(pre.invocations, []);
    assert.equal(invTexts(steps).length, 0);
  });
});

describe('C6 working directory precedence', () => {
  test('workflow default applies, job overrides it, step overrides both', () => {
    const steps = parseWorkflows(use(fx.workingDirDefaultsShape()));
    assert.equal(byName(steps, 'Vet').cwd, 'svc');
    assert.equal(byName(steps, 'Unit').cwd, 'app');
    assert.equal(byName(steps, 'Chart').cwd, 'chart');
  });

  test('every invocation carries the effective cwd', () => {
    const steps = parseWorkflows(use(fx.workingDirDefaultsShape()));
    assert.equal(byName(steps, 'Vet').invocations[0].cwd, 'svc');
    assert.equal(byName(steps, 'Unit').invocations[0].cwd, 'app');
    assert.equal(byName(steps, 'Chart').invocations[0].cwd, 'chart');
  });

  test('no default anywhere gives cwd null', () => {
    const steps = parseWorkflows(use(fx.mixedToolsShape()));
    for (const s of steps) assert.equal(s.cwd, null);
  });

  test('a `cd` inside the block nests under the step cwd', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    defaults:\n      run:\n        working-directory: svc\n    steps:\n      - run: |\n          cd inner\n          go vet ./...\n';
    const [step] = _parseWorkflowText(yml, 'x.yml');
    assert.equal(step.cwd, 'svc');
    assert.equal(step.invocations[0].cwd, 'svc/inner');
  });

  test('declaration order does not matter: defaults after jobs, working-directory after run', () => {
    const yml = [
      'on: [push]',
      'jobs:',
      '  j:',
      '    steps:',
      '      - run: go vet ./...',
      '        working-directory: late',
      '      - run: go test ./...',
      '    defaults:',
      '      run:',
      '        working-directory: jobwide',
      'defaults:',
      '  run:',
      '    working-directory: wfwide',
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x.yml');
    assert.equal(steps[0].cwd, 'late');
    assert.equal(steps[1].cwd, 'jobwide');
  });

  test('a working-directory nested under `with:` is an action input, not the step cwd', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - uses: some/action@v1\n        with:\n          working-directory: svc\n';
    const [step] = _parseWorkflowText(yml, 'x.yml');
    assert.equal(step.cwd, null);
  });
});

describe('C7 uses: steps are recorded, not dropped', () => {
  test('a `uses:` step has uses set and no invocations', () => {
    const steps = parseWorkflows(use(fx.usesActionsShape()));
    const lint = byName(steps, 'Lint');
    assert.equal(lint.uses, 'golangci/golangci-lint-action@v6');
    assert.deepEqual(lint.invocations, []);
    const setup = byName(steps, 'Setup Go');
    assert.equal(setup.uses, 'actions/setup-go@v5');
    assert.deepEqual(setup.invocations, []);
  });

  test('an unnamed `- uses:` step is recorded with a null name', () => {
    const steps = parseWorkflows(use(fx.usesActionsShape()));
    const checkout = steps.find((s) => s.uses === 'actions/checkout@v4');
    assert.ok(checkout);
    assert.equal(checkout.name, null);
  });

  test('a `run:` step has uses null', () => {
    const steps = parseWorkflows(use(fx.commentAsTestShape()));
    assert.equal(steps[0].uses, null);
  });

  test('`with:` keys never leak into the step (no phantom run / name)', () => {
    const steps = parseWorkflows(use(fx.usesActionsShape()));
    assert.equal(steps.length, 3); // checkout, Setup Go, Lint — the `with:` keys add none
    assert.deepEqual(invTexts(steps), []);
    assert.deepEqual(steps.map((s) => s.uses), ['actions/checkout@v4', 'actions/setup-go@v5', 'golangci/golangci-lint-action@v6']);
  });
});

describe('C8 quoted pipes stay intact', () => {
  test('`sed -i \'s|a|b|\' f && go test ./...` is two invocations and the sed one is whole', () => {
    const steps = parseWorkflows(use(fx.quotedPipeShape()));
    const out = steps[0].invocations.map((i) => i.text);
    assert.deepEqual(out, ["sed -i 's|a|b|' svc/version.txt", 'go test ./...']);
  });
});

describe('C9 continue-on-error and schedule', () => {
  test('continue-on-error: true is recorded on the step only', () => {
    const steps = parseWorkflows(use(fx.scheduleShape()));
    const nightly = steps.filter((s) => s.file.endsWith('nightly.yml'));
    assert.equal(byName(nightly, 'Vuln scan').continueOnError, true);
    assert.equal(byName(nightly, 'Strict tests').continueOnError, false);
  });

  test('a workflow `on: schedule:` marks every step of THAT workflow scheduled', () => {
    const steps = parseWorkflows(use(fx.scheduleShape()));
    const nightly = steps.filter((s) => s.file.endsWith('nightly.yml'));
    const pr = steps.filter((s) => s.file.endsWith('pr.yml'));
    assert.ok(nightly.length > 0 && pr.length > 0);
    assert.ok(nightly.every((s) => s.scheduled === true));
    assert.ok(pr.every((s) => s.scheduled === false));
  });

  test('inline `on: [push, schedule]` and flow `on: { schedule: … }` also count', () => {
    assert.equal(_parseWorkflowText('on: [push, schedule]\njobs:\n  j:\n    steps:\n      - run: go test\n', 'x')[0].scheduled, true);
    assert.equal(_parseWorkflowText('on: { schedule: [{cron: "0 1 * * *"}] }\njobs:\n  j:\n    steps:\n      - run: go test\n', 'x')[0].scheduled, true);
  });

  test('a quoted "on": key is still the trigger block', () => {
    const yml = '"on":\n  schedule:\n    - cron: "0 1 * * *"\njobs:\n  j:\n    steps:\n      - run: go test\n';
    assert.equal(_parseWorkflowText(yml, 'x')[0].scheduled, true);
  });

  test('a job-level continue-on-error applies to steps that do not say otherwise', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    continue-on-error: true\n    steps:\n      - run: go test\n      - run: go vet\n        continue-on-error: false\n';
    const steps = _parseWorkflowText(yml, 'x');
    assert.equal(steps[0].continueOnError, true);
    assert.equal(steps[1].continueOnError, false);
  });

  test('a matrix / expression continue-on-error is not treated as true', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - run: go test\n        continue-on-error: ${{ matrix.experimental }}\n';
    assert.equal(_parseWorkflowText(yml, 'x')[0].continueOnError, false);
  });
});

describe('C10 many files, sorted; malformed input never throws', () => {
  test('files are read in sorted order and both .yml and .yaml count', () => {
    const steps = parseWorkflows(use(fx.multiFileShape()));
    assert.deepEqual([...new Set(steps.map((s) => s.file))], [
      '.github/workflows/aa-first.yaml',
      '.github/workflows/mm-middle.yml',
      '.github/workflows/zz-last.yml',
    ]);
    assert.deepEqual(invTexts(steps), ['go vet ./...', 'npm test', 'cargo test']);
  });

  test('a non-workflow file in the directory is ignored', () => {
    const steps = parseWorkflows(use(fx.multiFileShape()));
    assert.ok(!steps.some((s) => /README/.test(s.file)));
  });

  test('a malformed file yields what was parseable and never throws', () => {
    const root = use(fx.malformedShape());
    let steps;
    assert.doesNotThrow(() => { steps = parseWorkflows(root); });
    assert.ok(steps.some((s) => s.file.endsWith('a-good.yml') && s.invocations[0].text === 'go build ./...'));
    const bad = steps.filter((s) => s.file.endsWith('b-bad.yml'));
    assert.ok(bad.some((s) => s.invocations.some((i) => i.text === 'go vet ./...')), 'the parseable step survives');
    assert.ok(bad.some((s) => s.invocations.some((i) => i.text === 'go test ./...')), 'a step after the garbage still parses');
  });

  test('a repo with no workflows dir gives []', () => {
    const root = use(fx.makeWorkflowRepo());
    assert.deepEqual(parseWorkflows(root), []);
    assert.deepEqual(parseWorkflows('/nonexistent/df-stack-ci-none'), []);
  });

  test('a directory named like a workflow is skipped, not fatal', () => {
    const root = use(fx.makeWorkflowRepo({ workflows: { 'ok.yml': 'on: [push]\njobs:\n  j:\n    steps:\n      - run: go vet ./...\n' }, files: { '.github/workflows/dir.yml/inner.txt': 'x' } }));
    assert.deepEqual(invTexts(parseWorkflows(root)), ['go vet ./...']);
  });
});

describe('C11 reader robustness', () => {
  test('mixedToolsShape: seven steps, one invocation each, in document order', () => {
    const steps = parseWorkflows(use(fx.mixedToolsShape()));
    assert.deepEqual(steps.map((s) => s.name), ['SAST', 'Vulnerabilities', 'Chart lint', 'End to end', 'Vet', 'Tests', 'Analyze']);
    assert.deepEqual(invTexts(steps), [
      'gosec ./...',
      'govulncheck ./...',
      'helm lint chart/',
      'npx playwright test',
      'go vet ./...',
      'go test -race -coverprofile=c.out ./...',
      'flutter analyze --no-fatal-infos',
    ]);
    assert.ok(steps.every((s) => s.job === 'gates'));
    assert.ok(steps.every((s) => s.file === '.github/workflows/ci.yml'));
  });

  test('a `>` folded scalar joins its lines with spaces', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - run: >\n          go test\n          -race ./...\n';
    assert.deepEqual(_parseWorkflowText(yml, 'x')[0].invocations.map((i) => i.text), ['go test -race ./...']);
  });

  test('`|-` and `|+` chomping indicators are block scalars too', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - run: |-\n          go vet ./...\n      - run: |+\n          go test ./...\n';
    assert.deepEqual(invTexts(_parseWorkflowText(yml, 'x')), ['go vet ./...', 'go test ./...']);
  });

  test('a quoted single-line run: is unquoted', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - run: "go test ./..."\n      - run: \'go vet ./...\'\n';
    assert.deepEqual(invTexts(_parseWorkflowText(yml, 'x')), ['go test ./...', 'go vet ./...']);
  });

  test('a trailing YAML comment on a plain run: is dropped', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - run: go test ./... # everything\n';
    assert.deepEqual(invTexts(_parseWorkflowText(yml, 'x')), ['go test ./...']);
  });

  test('a run: value containing a colon is not mistaken for a nested key', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - name: "Run: tests"\n        run: go test -run "TestA: b" ./...\n';
    const [step] = _parseWorkflowText(yml, 'x');
    assert.equal(step.name, 'Run: tests');
    assert.deepEqual(step.invocations.map((i) => i.text), ['go test -run "TestA: b" ./...']);
  });

  test('a look-alike block scalar under `with:` does not create steps or invocations', () => {
    const yml = [
      'on: [push]',
      'jobs:',
      '  j:',
      '    steps:',
      '      - uses: actions/github-script@v7',
      '        with:',
      '          script: |',
      '            run: go test ./...',
      '            steps:',
      '              - run: go vet ./...',
      '      - run: go build ./...',
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x');
    assert.equal(steps.length, 2);
    assert.deepEqual(steps[0].invocations, []);
    assert.deepEqual(steps[1].invocations.map((i) => i.text), ['go build ./...']);
  });

  test('an indentless `steps:` sequence (dashes aligned with the key) parses', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n    - name: a\n      run: go vet ./...\n    - name: b\n      run: go test ./...\n';
    const steps = _parseWorkflowText(yml, 'x');
    assert.deepEqual(steps.map((s) => s.name), ['a', 'b']);
    assert.deepEqual(invTexts(steps), ['go vet ./...', 'go test ./...']);
  });

  test('step keys nested under env: / with: do not overwrite step-level keys', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - name: real\n        env:\n          name: fake\n          run: nope\n        run: go vet ./...\n';
    const [step] = _parseWorkflowText(yml, 'x');
    assert.equal(step.name, 'real');
    assert.deepEqual(step.invocations.map((i) => i.text), ['go vet ./...']);
  });

  test('two jobs with different step indentation both parse', () => {
    const yml = 'on: [push]\njobs:\n  a:\n    steps:\n      - run: go vet ./...\n  b:\n    steps:\n    - run: go test ./...\n';
    const steps = _parseWorkflowText(yml, 'x');
    assert.deepEqual(steps.map((s) => [s.job, s.invocations[0].text]), [['a', 'go vet ./...'], ['b', 'go test ./...']]);
  });

  test('CRLF line endings parse like LF', () => {
    const yml = 'on: [push]\r\njobs:\r\n  j:\r\n    steps:\r\n      - run: |\r\n          gosec \\\r\n            -fmt sarif ./...\r\n';
    assert.deepEqual(invTexts(_parseWorkflowText(yml, 'x')), ['gosec -fmt sarif ./...']);
  });

  test('a UTF-8 BOM is ignored', () => {
    const yml = '\uFEFFon: [push]\njobs:\n  j:\n    steps:\n      - run: go vet ./...\n';
    assert.deepEqual(invTexts(_parseWorkflowText(yml, 'x')), ['go vet ./...']);
  });

  test('multi-document files: workflow-level state does not leak across `---`', () => {
    const yml = [
      'on:',
      '  schedule:',
      '    - cron: "0 1 * * *"',
      'defaults:',
      '  run:',
      '    working-directory: first',
      'jobs:',
      '  j:',
      '    steps:',
      '      - run: go vet ./...',
      '---',
      'on: [push]',
      'jobs:',
      '  k:',
      '    steps:',
      '      - run: go test ./...',
      '',
    ].join('\n');
    const [a, b] = _parseWorkflowText(yml, 'x');
    assert.deepEqual([a.scheduled, a.cwd, a.job], [true, 'first', 'j']);
    assert.deepEqual([b.scheduled, b.cwd, b.job], [false, null, 'k']);
  });

  test('flow-map steps and YAML anchors are skipped, never thrown on', () => {
    const yml = [
      'on: [push]',
      'x-defaults: &d',
      '  shell: bash',
      'jobs:',
      '  j:',
      '    steps:',
      '      - {name: flow, run: go vet ./...}',
      '      - <<: *d',
      '        run: go test ./...',
      '      - run: &cmd go build ./...',
      '      - run: *cmd',
      '',
    ].join('\n');
    let steps;
    assert.doesNotThrow(() => { steps = _parseWorkflowText(yml, 'x'); });
    assert.ok(Array.isArray(steps));
    assert.ok(invTexts(steps).includes('go test ./...'));
    for (const t of invTexts(steps)) assert.ok(!t.startsWith('*') && !t.startsWith('&'), `alias leaked: ${t}`);
  });

  test('a step with neither run nor uses is not emitted', () => {
    const yml = 'on: [push]\njobs:\n  j:\n    steps:\n      - name: only a name\n      - run: go vet ./...\n';
    const steps = _parseWorkflowText(yml, 'x');
    assert.equal(steps.length, 1);
  });

  test('hostile input never throws', () => {
    for (const input of ['', '\u0000\u0001\u0002', 'garbage: [', ':::', '- - - -', 'jobs:\n  - x\n  - y', 'steps:\n- run:', null, undefined, 42]) {
      assert.doesNotThrow(() => _parseWorkflowText(input, 'x'), `input: ${JSON.stringify(input)}`);
    }
    assert.deepEqual(_parseWorkflowText('', 'x'), []);
  });

  test('step records carry exactly the contracted fields', () => {
    const [step] = _parseWorkflowText('on: [push]\njobs:\n  j:\n    steps:\n      - name: n\n        run: go vet ./...\n', 'wf.yml');
    assert.deepEqual(Object.keys(step).sort(), ['continueOnError', 'cwd', 'file', 'invocations', 'job', 'name', 'scheduled', 'uses']);
    assert.equal(step.file, 'wf.yml');
  });
});
