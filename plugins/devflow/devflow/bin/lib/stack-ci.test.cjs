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
// - C14 (TRD 43-09) Workflow / job / step `env:` literals substituted into run lines; runtime values
//       (`${{ }}`, in-block assignments, $GITHUB_ENV exports, single quotes) left as written.
//
// Fixtures are hand-built (`__fixtures__/stack-ci-fixtures.cjs`), never generated.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { parseWorkflows, _parseWorkflowText, normaliseWorkingDirectory, expandsAny } = require('./stack-ci.cjs');
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
    // `checkouts` and `external` joined the contract in TRD 42-14 (D1); `envSubstituted` in TRD 43-09;
    // `runtimeVars` in TRD 43-13 (re-baselined: the names a run block assigns at run time).
    // `services` and `envNames` in TRD 71-03 (the job's service containers; the env names in scope).
    assert.deepEqual(Object.keys(step).sort(), ['checkouts', 'continueOnError', 'cwd', 'envNames', 'envSubstituted', 'external', 'file', 'invocations', 'job', 'name', 'runtimeVars', 'scheduled', 'services', 'uses']);
    assert.equal(step.file, 'wf.yml');
    assert.deepEqual(step.checkouts, []);
    assert.equal(step.external, false);
    assert.deepEqual(step.envSubstituted, []);
    assert.deepEqual(step.runtimeVars, []);
    assert.deepEqual(step.services, []);
    assert.deepEqual(step.envNames, []);
  });
});

// ─── TRD 43-09: literal `env:` values reach the run lines ────────────────────
//
// 8. Workflow, job and step `env:` literals are substituted into run lines (step > job > workflow).
//    A `${{ }}` value, a variable assigned in the same run block, a variable an earlier step of the job
//    exports to $GITHUB_ENV, and anything inside single quotes stay as written. A double-quoted word
//    that holds a substitution and is left with no whitespace or shell metacharacter is unquoted.

describe('C14 env literals substituted into run lines (TRD 43-09)', () => {
  const textOf = (steps, name) => byName(steps, name).invocations.map((i) => i.text);

  test('workflow and job env reach the run lines; step beats job beats workflow', () => {
    const yml = [
      'on: [push]',
      'env:',
      '  CHART: deploy/charts/web',
      '  LEVEL: workflow',
      'jobs:',
      '  j:',
      '    env:',
      '      LEVEL: job',
      '    steps:',
      '      - name: wf',
      '        run: helm lint "${CHART}/"',
      '      - name: job',
      '        run: tool --level $LEVEL',
      '      - name: step',
      '        env:',
      '          LEVEL: step',
      '        run: tool --level ${LEVEL}',
      '      - name: flow',
      '        env: { LEVEL: flowstep }',
      '        run: tool --level "$LEVEL"',
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x');
    assert.deepEqual(textOf(steps, 'wf'), ['helm lint deploy/charts/web/']);
    assert.deepEqual(byName(steps, 'wf').envSubstituted, ['CHART']);
    assert.deepEqual(textOf(steps, 'job'), ['tool --level job']);
    assert.deepEqual(textOf(steps, 'step'), ['tool --level step']);
    assert.deepEqual(textOf(steps, 'flow'), ['tool --level flowstep']);
  });

  test('`${{ }}` values and expressions are runtime: left as written', () => {
    const yml = [
      'on: [push]',
      'env:',
      '  REF: ${{ github.ref }}',
      'jobs:',
      '  j:',
      '    steps:',
      '      - name: deploy',
      '        run: deploy --ref "$REF" --sha "${{ github.sha }}"',
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x');
    assert.deepEqual(textOf(steps, 'deploy'), ['deploy --ref "$REF" --sha "${{ github.sha }}"']);
    assert.deepEqual(byName(steps, 'deploy').envSubstituted, []);
  });

  test('a variable assigned in the same run block is untouched; the others still substitute', () => {
    const yml = [
      'on: [push]',
      'env:',
      '  OUT: dist',
      '  CHART: charts/api',
      'jobs:',
      '  j:',
      '    steps:',
      '      - name: render',
      '        run: |',
      '          OUT="$(mktemp -d)"',
      '          helm template "$CHART" --output-dir "$OUT"',
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x');
    assert.deepEqual(textOf(steps, 'render'), ['helm template charts/api --output-dir "$OUT"']);
    assert.deepEqual(byName(steps, 'render').envSubstituted, ['CHART']);
  });

  test('a variable an earlier step exports to $GITHUB_ENV is runtime for the rest of the job', () => {
    const yml = [
      'on: [push]',
      'env:',
      '  TAG: base',
      'jobs:',
      '  j:',
      '    steps:',
      '      - run: echo "TAG=$(git describe --tags)" >> "$GITHUB_ENV"',
      '      - name: image',
      '        run: docker build -t "app:$TAG" .',
      '  k:',
      '    steps:',
      '      - name: other',
      '        run: docker build -t "app:$TAG" .',
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x');
    assert.deepEqual(textOf(steps, 'image'), ['docker build -t "app:$TAG" .']);
    assert.deepEqual(textOf(steps, 'other'), ['docker build -t app:base .'], 'another job is unaffected');
  });

  test('quoting: whitespace or a metacharacter keeps the quotes; single quotes are literal', () => {
    const yml = [
      'on: [push]',
      'env:',
      '  MSG: hello world',
      '  DIR: charts/a',
      'jobs:',
      '  j:',
      '    steps:',
      '      - name: q',
      `        run: tool --msg "$MSG" --glob "\${DIR}/*.yaml" --lit '\${DIR}' "\${DIR}/x" "keep"`,
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x');
    assert.deepEqual(textOf(steps, 'q'), [`tool --msg "hello world" --glob "charts/a/*.yaml" --lit '\${DIR}' charts/a/x "keep"`]);
    assert.deepEqual(byName(steps, 'q').envSubstituted, ['MSG', 'DIR']);
  });
});

// ─── TRD 42-14 (D1): working-directory normalisation ──────────────────────────
//
// 5. normaliseWorkingDirectory, table-driven.
// 6. parseWorkflows records per-job checkouts { path, repository } and the normalised step cwd.

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('C12 normaliseWorkingDirectory (TRD 42-14 test 5)', () => {
  test('the D1 rules, in order', () => {
    const root = use(fx.makeWorkflowRepo({ files: { 'go/go.mod': 'module x\n' } }));
    const repoName = path.basename(root);
    const cases = [
      [null, {}, { cwd: null, external: false }],
      ['', {}, { cwd: null, external: false }],
      ['${{ github.workspace }}/go', {}, { cwd: 'go', external: false }],
      ['${{github.workspace}}', {}, { cwd: null, external: false }],
      ['$GITHUB_WORKSPACE/go', {}, { cwd: 'go', external: false }],
      ['./go', {}, { cwd: 'go', external: false }],
      ['./go/', {}, { cwd: 'go', external: false }],
      ['svcrepo/go', { selfCheckoutPath: 'svcrepo' }, { cwd: 'go', external: false }],
      ['svcrepo', { selfCheckoutPath: 'svcrepo' }, { cwd: null, external: false }],
      ['./svcrepo/go', { selfCheckoutPath: './svcrepo/' }, { cwd: 'go', external: false }],
      [`${repoName}/go`, {}, { cwd: 'go', external: false }],
      ['go', {}, { cwd: 'go', external: false }],
      ['libs/pkg-a', { selfCheckoutPath: 'svcrepo', otherCheckoutPaths: ['libs/pkg-a'] }, { cwd: 'libs/pkg-a', external: true }],
      ['libs/pkg-a/sub', { otherCheckoutPaths: ['libs/pkg-a'] }, { cwd: 'libs/pkg-a/sub', external: true }],
      ['libs/pkg-ab', { otherCheckoutPaths: ['libs/pkg-a'] }, { cwd: 'libs/pkg-ab', external: false }],
      ['${{ github.workspace }}/libs/pkg-a', { otherCheckoutPaths: ['libs/pkg-a'] }, { cwd: 'libs/pkg-a', external: true }],
    ];
    for (const [raw, opts, want] of cases) {
      assert.deepEqual(normaliseWorkingDirectory(raw, { root, repoName, ...opts }), want, `raw ${JSON.stringify(raw)} ${JSON.stringify(opts)}`);
    }
  });

  test('a repo named `go` with a real go/go/ dir keeps `go/go` (never strips a real dir)', () => {
    const parent = use(fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-ci-go-')));
    const root = path.join(parent, 'go');
    fs.mkdirSync(path.join(root, 'go', 'go'), { recursive: true });
    assert.deepEqual(normaliseWorkingDirectory('go/go', { root, repoName: 'go' }), { cwd: 'go/go', external: false });
    assert.deepEqual(normaliseWorkingDirectory('go', { root, repoName: 'go' }), { cwd: 'go', external: false });
  });

  test('the basename fallback needs <root>/<basename> to be ABSENT, and no root means no fallback', () => {
    const root = use(fx.makeWorkflowRepo({ files: { 'go/go.mod': 'module x\n' } }));
    const repoName = path.basename(root);
    fs.mkdirSync(path.join(root, repoName, 'go'), { recursive: true });
    assert.deepEqual(normaliseWorkingDirectory(`${repoName}/go`, { root, repoName }), { cwd: `${repoName}/go`, external: false });
    assert.deepEqual(normaliseWorkingDirectory('svc/go', { repoName: 'svc' }), { cwd: 'svc/go', external: false });
  });
});

describe('C13 parseWorkflows records checkouts and normalised cwds (TRD 42-14 test 6)', () => {
  for (const [name, build] of [['block with:', fx.selfCheckoutPathShape], ['flow with: { }', fx.siblingCheckoutShape]]) {
    test(`${name}: self checkout stripped, sibling checkout external`, () => {
      const steps = parseWorkflows(use(build()));
      const unit = byName(steps, 'Unit');
      assert.equal(unit.cwd, 'go');
      assert.equal(unit.external, false);
      assert.equal(unit.invocations[0].cwd, 'go');
      assert.deepEqual(unit.checkouts, [
        { path: 'svcrepo', repository: null },
        { path: 'libs/pkg-a', repository: 'org/pkg-a' },
      ]);
      const lib = byName(steps, 'Lib analyze');
      assert.equal(lib.cwd, 'libs/pkg-a');
      assert.equal(lib.external, true);
      assert.equal(lib.invocations[0].external, true);
    });
  }

  test('block shape: job default, step override, the checkout root itself, and a job with no checkout path', () => {
    const steps = parseWorkflows(use(fx.selfCheckoutPathShape()));
    assert.equal(byName(steps, 'Vet').cwd, 'go');
    assert.equal(byName(steps, 'Root').cwd, null);
    assert.equal(byName(steps, 'Root').invocations[0].cwd, null);
    assert.equal(byName(steps, 'Workspace').cwd, 'go');
    assert.equal(byName(steps, 'Dotted').cwd, 'go');
    assert.deepEqual(byName(steps, 'Workspace').checkouts, [{ path: null, repository: null }]);
    const checkout = steps.find((s) => s.job === 'go' && s.uses === 'actions/checkout@v4');
    assert.ok(checkout, 'the checkout step itself is still recorded');
  });

  test('flow shape: ${{ github.workspace }} into the sibling is external too', () => {
    const steps = parseWorkflows(use(fx.siblingCheckoutShape()));
    const t = byName(steps, 'Lib test');
    assert.equal(t.cwd, 'libs/pkg-a/sub');
    assert.equal(t.external, true);
  });

  test('_parseWorkflowText with no root still strips the self checkout path', () => {
    const steps = _parseWorkflowText(fx.TEXT.SELF_CHECKOUT_YML, 'ci.yml');
    assert.equal(byName(steps, 'Unit').cwd, 'go');
    assert.equal(byName(steps, 'Lib analyze').external, true);
  });
});

// TRD 43-12 (aocore.lint row): an action's `with: working-directory` is where the action runs (golangci-lint-action
// runs at the repo root unless told otherwise). It is recorded as `step.with['working-directory']`, normalised like
// a step cwd, and never changes `step.cwd` (C6). A `with:` holding only other inputs records nothing.
describe('C15 an action\'s `with: working-directory` (TRD 43-12 test 5)', () => {
  const yml = (withLines) => [
    'on: [push]',
    'defaults:',
    '  run:',
    '    working-directory: svc',
    'jobs:',
    '  j:',
    '    steps:',
    '      - uses: golangci/golangci-lint-action@0123456789abcdef0123456789abcdef01234567 # v9.1.0',
    ...withLines,
    '      - run: go vet ./...',
    '',
  ].join('\n');

  test('C15a: a block `with:` working-directory is read into step.with, normalised; step.cwd is untouched', () => {
    const [step, vet] = _parseWorkflowText(yml([
      '        with:',
      '          version: v2.5.0',
      '          install-mode: goinstall',
      '          working-directory: ./mod/go',
      '          # only new findings fail a PR',
      '          only-new-issues: true',
    ]), 'x.yml');
    assert.deepStrictEqual(step.with, { 'working-directory': 'mod/go' });
    assert.equal(step.cwd, 'svc');
    assert.equal(vet.with, undefined);
    assert.deepEqual(vet.invocations.map((i) => i.text), ['go vet ./...']);
  });

  test('C15b: the flow spelling and a `${{ github.workspace }}/` prefix are read the same way', () => {
    const [step] = _parseWorkflowText(yml(["        with: { version: v2.5.0, working-directory: '${{ github.workspace }}/core' }"]), 'x.yml');
    assert.deepStrictEqual(step.with, { 'working-directory': 'core' });
  });

  test('C15c: a `with:` holding only other inputs records no with and leaves the cwd alone', () => {
    const [step] = _parseWorkflowText(yml(['        with:', '          version: v2.5.0', '          args: --timeout=5m']), 'x.yml');
    assert.equal(step.with, undefined);
    assert.equal(step.cwd, 'svc');
  });

  test('C15d: `working-directory: .` is the repo root (null), and it is still recorded', () => {
    const [step] = _parseWorkflowText(yml(['        with:', '          working-directory: .']), 'x.yml');
    assert.deepStrictEqual(step.with, { 'working-directory': null });
  });
});

// ─── TRD 43-13: names a run block assigns at run time ─────────────────────────
//
// 4. step.runtimeVars lists the names the run block itself assigns a value only known when it runs: a
//    command substitution (`X="$(cmd)"`, `X=$(cmd)`, `` X=`cmd` ``), an `export X=…`, a `read [-r] X`, a
//    `for X in` loop variable, and a name assigned from one of those (`PKG="${line%%=*}"`). A plain literal
//    (`X=dist`), a `${{ }}` value and a workflow/job/step `env:` name substituted into the line are not.
describe('C16 step.runtimeVars (TRD 43-13 test 4)', () => {
  const runtimeOf = (lines, extra = []) => {
    const doc = ['on: [push]', 'jobs:', '  j:', '    steps:', ...extra, '      - name: s', '        run: |', ...lines.map((l) => `          ${l}`), ''].join('\n');
    const step = byName(_parseWorkflowText(doc, 'x.yml'), 's');
    return step.runtimeVars;
  };

  test('C16a: command substitution, quoted or not, in either spelling', () => {
    assert.deepEqual(runtimeOf(['SKIP="$(./scripts/print-skips.sh --class slow)"', 'go test ./... -skip "${SKIP}"']), ['SKIP']);
    assert.deepEqual(runtimeOf(['SKIP=$(./scripts/print-skips.sh)', 'go test ./... -skip "$SKIP"']), ['SKIP']);
    assert.deepEqual(runtimeOf(['REV=`git rev-parse HEAD`', 'go build -ldflags "-X main.rev=$REV" ./...']), ['REV']);
    assert.deepEqual(runtimeOf(['PROF="/tmp/cov-$(date +%s).out"', 'go test -coverprofile="$PROF" ./...']), ['PROF']);
  });

  test('C16b: export, a read variable and a for-loop variable; a name derived from one of them', () => {
    assert.deepEqual(runtimeOf(['export GOFLAGS=-mod=mod', 'go test ./...']), ['GOFLAGS']);
    assert.deepEqual(runtimeOf(['while read -r line; do', '  PKG="${line%%=*}"', '  go test "./${PKG}/..."', 'done < floors.txt']).sort(), ['PKG', 'line']);
    assert.deepEqual(runtimeOf(['for p in api worker; do go build "./cmd/$p"; done']), ['p']);
  });

  test('C16c: a plain literal, a `${{ }}` value and an env-substituted name are not runtime', () => {
    assert.deepEqual(runtimeOf(['OUT=dist', 'go build -o "$OUT/app" ./...']), []);
    assert.deepEqual(runtimeOf(['PKG=${{ matrix.pkg }}', 'go test "./${PKG}/..."']), []);
    const fromEnv = runtimeOf(['go test $PKG'], ['      - name: other', '        run: echo hi']);
    assert.deepEqual(fromEnv, []);
    const doc = ['on: [push]', 'env:', '  PKG: ./internal/store', 'jobs:', '  j:', '    steps:', '      - name: s', '        run: go test $PKG', ''].join('\n');
    const step = byName(_parseWorkflowText(doc, 'x.yml'), 's');
    assert.deepEqual(step.runtimeVars, []);
    assert.deepEqual(step.invocations.map((i) => i.text), ['go test ./internal/store']);
  });

  test('C16d: a uses-only step has no runtime names', () => {
    const doc = ['on: [push]', 'jobs:', '  j:', '    steps:', '      - name: s', '        uses: actions/checkout@v4', ''].join('\n');
    assert.deepEqual(byName(_parseWorkflowText(doc, 'x.yml'), 's').runtimeVars, []);
  });
});

// TRD 56-01 (ONUM-01): expandsAny compiled each name into the regex source unescaped, so `.` was a wildcard.
describe('C17 expandsAny matches a name literally (TRD 56-01 test 7)', () => {
  test('C17a: a metacharacter in a name is literal', () => {
    assert.equal(expandsAny('x $AxB', ['A.B']), false);
    assert.equal(expandsAny('x ${AxB}', ['A.B']), false);
  });

  test('C17b: plain names expand as before, in both spellings, with the name boundary', () => {
    assert.equal(expandsAny('x ${A}', ['A']), true);
    assert.equal(expandsAny('x $A y', ['A']), true);
    assert.equal(expandsAny('x $AB', ['A']), false);
    assert.equal(expandsAny("x '$A'", ['A']), false);
    assert.equal(expandsAny('x $A', []), false);
  });
});

// TRD 71-03 (SDR-10): `stack verify --run` asks the CI job that runs a gate whether the job needs a service.
// 18. A job's `services:` names are on each of its steps; another job's steps have none.
// 19. `envNames`: workflow, job and step env names in scope, sorted, runtime values included.
// 20. A service container's own `env:` and a `services:` key under a step's `with:` are not job state.
describe('C18 job services and env names (TRD 71-03)', () => {
  const vfx = require('./__fixtures__/stack-verify-fixtures.cjs');

  test('C18a: each step of a job with services carries the sorted service names; another job has none', () => {
    const text = `${vfx.serviceWorkflow({ job: 'suite', services: ['redis', 'postgres'], runs: ['svc-suite --all'] })}`
      + '  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - run: svc-lint\n';
    const steps = _parseWorkflowText(text, 'ci.yml');
    const suite = steps.filter((s) => s.job === 'suite');
    assert.equal(suite.length, 2); // checkout + run
    for (const s of suite) assert.deepEqual(s.services, ['postgres', 'redis']);
    const lint = steps.filter((s) => s.job === 'lint');
    assert.equal(lint.length, 1);
    assert.deepEqual(lint[0].services, []);
  });

  test('C18b: envNames is the sorted union of workflow, job and step env names', () => {
    const yml = [
      'on: [push]',
      'env:',
      '  A: one',
      'jobs:',
      '  j:',
      '    env:',
      '      B: two',
      '      D: ${{ secrets.D }}',
      '    steps:',
      '      - name: own',
      '        env: { C: x }',
      '        run: tool',
      '      - name: sibling',
      '        run: tool',
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x');
    assert.deepEqual(byName(steps, 'own').envNames, ['A', 'B', 'C', 'D']);
    assert.deepEqual(byName(steps, 'sibling').envNames, ['A', 'B', 'D']);
  });

  test('C18c: a service container\'s own env is not a step env name', () => {
    const text = vfx.serviceWorkflow({ services: ['postgres'], env: { DATABASE_URL: 'x' }, runs: ['tool'] });
    const steps = _parseWorkflowText(text, 'ci.yml');
    assert.ok(steps.length >= 2);
    for (const s of steps) {
      assert.deepEqual(s.services, ['postgres']);
      assert.deepEqual(s.envNames, ['DATABASE_URL']);
    }
  });

  test('C18d: `services:` under a step\'s `with:` is not a job service', () => {
    const yml = [
      'on: [push]',
      'jobs:',
      '  j:',
      '    steps:',
      '      - uses: some/action@v1',
      '        with:',
      '          services: postgres',
      '      - run: tool',
      '',
    ].join('\n');
    const steps = _parseWorkflowText(yml, 'x');
    assert.equal(steps.length, 2);
    for (const s of steps) assert.deepEqual(s.services, []);
  });
});
