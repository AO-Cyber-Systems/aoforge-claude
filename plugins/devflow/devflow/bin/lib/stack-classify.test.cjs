'use strict';

// stack-classify.test.cjs — Test list (TRD 42-03, tests 15-19 plus table-integrity cases)
//
// - K15 Table-driven: every row of the research classification table gives the expected
//       `{key, form}`. sast is pinned explicitly: gosec / semgrep / codeql are `sast` (NOT `audit`,
//       NOT `format`); govulncheck is `audit`. The sast->audit collapse is 42-07's job.
// - K16 Negatives: `test -f x`, `echo test`, `# tests`, `npx playwright test` are not `test`;
//       `helm lint` is not `lint`; a `-fmt sarif ./...` fragment is null.
// - K17 classifyUses: golangci-lint-action -> lint; actions/setup-go -> null (setup).
// - K18 Weak markers: `--no-fatal-infos`, `--issues-exit-code=0`, `|| true`, and a bare `gofmt -l`
//       (`never-fails`).
// - K19 Opaque wrappers: `./scripts/check-vuln.sh` + hint `govulncheck` -> audit, confidence low;
//       the same wrapper with no hint -> null. A hint never outranks a recognised tool.
// - K20 Runner wrappers (npx, pnpm exec, python -m, go run <module>, dart run) are unwrapped.
// - K21 Ordering pins: `flutter test integration_test` is e2e, `flutter test` is test.
// - K22 Table integrity: shape, key pattern from the profile schema, STANDARD_KEYS_EXT, purity.
//
// Inputs go through the same stack-shell normaliser the CI reader uses, so a comment, an `echo`
// and a flag fragment are rejected there and here alike.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  CLASSIFY_TABLE,
  classifyInvocation,
  classifyUses,
  lookupUses,
  WEAK_MARKERS,
  STANDARD_KEYS_EXT,
  USES_MAP,
} = require('./stack-classify.cjs');
const { STANDARD_KEYS } = require('./stack-evidence.cjs');

const KEY_PATTERN = new RegExp(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'schemas', 'stack-profile.schema.json'), 'utf-8')).$defs.commandKey.pattern,
);

// [input, key, form]
const ROWS = [
  // audit
  ['govulncheck ./...', 'audit', 'check'],
  ['npm audit --audit-level=high', 'audit', 'check'],
  ['pnpm audit', 'audit', 'check'],
  ['osv-scanner -r .', 'audit', 'check'],
  ['trivy fs .', 'audit', 'check'],
  ['pip-audit', 'audit', 'check'],
  ['cargo audit', 'audit', 'check'],
  // sast — pinned: never audit, never format
  ['gosec ./...', 'sast', 'check'],
  ['gosec -exclude=G304 -fmt sarif ./...', 'sast', 'check'],
  ['semgrep scan', 'sast', 'check'],
  ['codeql database analyze db --format=sarif-latest', 'sast', 'check'],
  // format: check
  ['gofmt -l .', 'format', 'check'],
  ['gofumpt -l .', 'format', 'check'],
  ['goimports -l .', 'format', 'check'],
  ['test -z "$(gofmt -l .)"', 'format', 'check'],
  ['dart format --set-exit-if-changed .', 'format', 'check'],
  ['prettier --check .', 'format', 'check'],
  ['cargo fmt --check', 'format', 'check'],
  ['ruff format --check', 'format', 'check'],
  ['terraform fmt -check', 'format', 'check'],
  // format: apply
  ['gofmt -w .', 'format', 'apply'],
  ['dart format .', 'format', 'apply'],
  ['prettier --write .', 'format', 'apply'],
  ['cargo fmt', 'format', 'apply'],
  // lint
  ['go vet ./...', 'lint', 'check'],
  ['golangci-lint run', 'lint', 'check'],
  ['staticcheck ./...', 'lint', 'check'],
  ['dart analyze', 'lint', 'check'],
  ['flutter analyze', 'lint', 'check'],
  ['eslint .', 'lint', 'check'],
  ['ruff check .', 'lint', 'check'],
  ['cargo clippy', 'lint', 'check'],
  // lint_helm / lint_docker
  ['helm lint chart/', 'lint_helm', 'check'],
  ['kubeconform -strict manifests/', 'lint_helm', 'check'],
  ['hadolint Dockerfile', 'lint_docker', 'check'],
  // typecheck
  ['tsc --noEmit', 'typecheck', 'check'],
  ['mypy .', 'typecheck', 'check'],
  ['pyright', 'typecheck', 'check'],
  // test
  ['go test ./...', 'test', 'check'],
  ['dart test', 'test', 'check'],
  ['flutter test', 'test', 'check'],
  ['npm test', 'test', 'check'],
  ['jest', 'test', 'check'],
  ['vitest run', 'test', 'check'],
  ['pytest', 'test', 'check'],
  ['cargo test', 'test', 'check'],
  ['ginkgo -r -p', 'test', 'check'],
  // e2e
  ['npx playwright test', 'e2e', 'check'],
  ['cypress run', 'e2e', 'check'],
  ['maestro test flows/', 'e2e', 'check'],
  ['patrol test', 'e2e', 'check'],
  ['flutter test integration_test', 'e2e', 'check'],
  ['flutter drive --target=integration_test/app_test.dart', 'e2e', 'check'],
  // build
  ['go build ./...', 'build', 'build'],
  ['flutter build ipa', 'build', 'build'],
  ['dart compile exe bin/x.dart', 'build', 'build'],
  ['npm run build', 'build', 'build'],
  ['docker build .', 'build', 'build'],
  ['cargo build', 'build', 'build'],
  // codegen
  ['go generate ./...', 'codegen', 'mutate'],
  ['buf generate', 'codegen', 'mutate'],
  ['sqlc generate', 'codegen', 'mutate'],
  ['dart run build_runner build', 'codegen', 'mutate'],
  ['templ generate', 'codegen', 'mutate'],
  // tidy
  ['go mod tidy -diff', 'tidy', 'check'],
  ['go mod tidy', 'tidy', 'apply'],
  // deps
  ['flutter pub get', 'deps', 'mutate'],
  ['dart pub get', 'deps', 'mutate'],
  ['npm ci', 'deps', 'mutate'],
  ['npm install', 'deps', 'mutate'],
  ['go mod download', 'deps', 'mutate'],
  // fix
  ['go fix -diff ./...', 'fix', 'check'],
  ['dart fix --dry-run', 'fix', 'check'],
  ['go fix ./...', 'fix', 'apply'],
  ['dart fix --apply', 'fix', 'apply'],
  // outdated (never fails for dart)
  ['dart pub outdated', 'outdated', 'check'],
  ['npm outdated', 'outdated', 'check'],
];

describe('K15 every research-table row', () => {
  for (const [input, key, form] of ROWS) {
    test(`${input}  ->  ${key}/${form}`, () => {
      const got = classifyInvocation(input);
      assert.ok(got, `expected a classification for ${JSON.stringify(input)}`);
      assert.equal(got.key, key);
      assert.equal(got.form, form);
      assert.equal(got.confidence, 'high');
    });
  }

  test('sast is pinned: gosec / semgrep / codeql are sast, not audit and not format', () => {
    for (const cmd of ['gosec ./...', 'gosec -exclude=G304 -fmt sarif ./...', 'semgrep scan', 'codeql database analyze db']) {
      const got = classifyInvocation(cmd);
      assert.equal(got.key, 'sast', cmd);
      assert.notEqual(got.key, 'audit', cmd);
      assert.notEqual(got.key, 'format', cmd);
    }
    assert.equal(classifyInvocation('govulncheck ./...').key, 'audit');
  });

  test('the result carries exactly { key, form, tool, weak, confidence }', () => {
    const got = classifyInvocation('go test ./...');
    assert.deepEqual(Object.keys(got).sort(), ['confidence', 'form', 'key', 'tool', 'weak']);
    assert.deepEqual(got.weak, []);
  });

  test('tool names the tool that matched', () => {
    assert.equal(classifyInvocation('gofmt -l .').tool, 'gofmt');
    assert.equal(classifyInvocation('gosec ./...').tool, 'gosec');
    assert.equal(classifyInvocation('npx playwright test').tool, 'playwright');
    assert.equal(classifyInvocation('pnpm audit').tool, 'pnpm');
    assert.equal(classifyInvocation('helm lint chart/').tool, 'helm');
  });

  test('a `cd x &&` prefix, env, sudo and time do not change the classification', () => {
    assert.equal(classifyInvocation('cd svc && go vet ./...').key, 'lint');
    assert.equal(classifyInvocation('CGO_ENABLED=0 go build ./...').key, 'build');
    assert.equal(classifyInvocation('sudo time go test ./...').key, 'test');
  });

  test('flags after the tool do not change the tool (go test -race -coverprofile=c.out)', () => {
    assert.equal(classifyInvocation('go test -race -coverprofile=c.out ./...').key, 'test');
    assert.equal(classifyInvocation('go test -short ./... -race -coverprofile=coverage.out -timeout 5m').key, 'test');
  });

  test('a pipeline is judged by its first stage (later stages cannot flip the form)', () => {
    assert.equal(classifyInvocation('go test ./... | tee out.txt').key, 'test');
    assert.equal(classifyInvocation('dart format . | tee log --check').form, 'apply');
  });

  test('a piped kubeconform stage marks a helm template as lint_helm', () => {
    assert.equal(classifyInvocation('helm template chart/ | kubeconform -strict').key, 'lint_helm');
  });

  test('npm install with a package or -g is installing a tool, not deps', () => {
    assert.equal(classifyInvocation('npm install -g playwright'), null);
    assert.equal(classifyInvocation('npm install left-pad'), null);
    assert.equal(classifyInvocation('npm install --frozen-lockfile').key, 'deps');
  });

  test('eslint --fix and ruff check --fix mutate: lint/apply', () => {
    assert.equal(classifyInvocation('eslint --fix .').form, 'apply');
    assert.equal(classifyInvocation('ruff check --fix .').form, 'apply');
  });
});

describe('K16 negatives', () => {
  test('`test -f x` is not a test', () => {
    assert.equal(classifyInvocation('test -f x'), null);
  });
  test('`echo test` is not a test', () => {
    assert.equal(classifyInvocation('echo test'), null);
  });
  test('`# tests` is not a test', () => {
    assert.equal(classifyInvocation('# tests'), null);
  });
  test('`npx playwright test` is e2e, never test', () => {
    const got = classifyInvocation('npx playwright test');
    assert.equal(got.key, 'e2e');
    assert.notEqual(got.key, 'test');
  });
  test('`helm lint chart/` is lint_helm, never lint', () => {
    const got = classifyInvocation('helm lint chart/');
    assert.equal(got.key, 'lint_helm');
    assert.notEqual(got.key, 'lint');
  });
  test('a `-fmt sarif ./...` fragment classifies as null (never format)', () => {
    assert.equal(classifyInvocation('-fmt sarif ./...'), null);
    assert.equal(classifyInvocation({ text: '-fmt sarif ./...' }), null);
  });
  test('an echoed command line is not that command', () => {
    assert.equal(classifyInvocation('echo "go test ./..."'), null);
  });
  test('git plumbing and unknown tools are null', () => {
    assert.equal(classifyInvocation('git commit -m "fix tests"'), null);
    assert.equal(classifyInvocation("sed -i 's|a|b|' f"), null);
    assert.equal(classifyInvocation('mytool run'), null);
  });
  test('`gofmt` with neither -l nor -w prints source; it is not a gate', () => {
    assert.equal(classifyInvocation('gofmt main.go'), null);
  });
  test('`flutter test integration_test` is never `test`', () => {
    assert.notEqual(classifyInvocation('flutter test integration_test').key, 'test');
  });
  test('empty and non-string input are null, never a throw', () => {
    for (const bad of ['', '   ', null, undefined, 42, {}, [], { text: '' }]) {
      assert.doesNotThrow(() => classifyInvocation(bad));
      assert.equal(classifyInvocation(bad), null, JSON.stringify(bad));
    }
  });
});

describe('K17 classifyUses', () => {
  const CASES = [
    ['golangci/golangci-lint-action@v6', 'lint'],
    ['golang/govulncheck-action@v1', 'audit'],
    ['securego/gosec@master', 'sast'],
    ['bufbuild/buf-action@v1', 'lint'],
    ['github/codeql-action/analyze@v3', 'sast'],
    ['golangci/golangci-lint-action', 'lint'],
    ['actions/setup-go@v5', null],
    ['subosito/flutter-action@v2', null],
    ['actions/checkout@v4', null],
    ['securego/gosec-fork@v1', null],
    ['./.github/actions/local', null],
    ['docker://alpine:3', null],
    ['', null],
  ];
  for (const [ref, key] of CASES) {
    test(`${JSON.stringify(ref)} -> ${key}`, () => {
      assert.equal(classifyUses(ref), key);
    });
  }

  test('non-string refs give null', () => {
    for (const bad of [null, undefined, 3, {}]) assert.equal(classifyUses(bad), null);
  });

  test('setup actions are in USES_MAP with a null key and role "setup"', () => {
    for (const prefix of ['actions/setup-go', 'subosito/flutter-action']) {
      const e = USES_MAP.find((x) => x.prefix === prefix);
      assert.ok(e, prefix);
      assert.equal(e.key, null);
      assert.equal(e.role, 'setup');
    }
  });

  test('lookupUses returns the entry, ignoring @ref, or null', () => {
    assert.equal(lookupUses('actions/setup-go@v5').role, 'setup');
    assert.equal(lookupUses('golangci/golangci-lint-action@v6').key, 'lint');
    assert.equal(lookupUses('nobody/nothing@v1'), null);
  });
});

describe('K18 weak markers', () => {
  test('`flutter analyze --no-fatal-infos` is lint, weak by that flag', () => {
    const got = classifyInvocation('flutter analyze --no-fatal-infos');
    assert.equal(got.key, 'lint');
    assert.deepEqual(got.weak, ['--no-fatal-infos']);
  });

  test('both non-fatal flags are reported, in a stable order', () => {
    assert.deepEqual(classifyInvocation('flutter analyze --no-fatal-warnings --no-fatal-infos').weak, ['--no-fatal-infos', '--no-fatal-warnings']);
  });

  test('a bare `gofmt -l .` is format/check and weak: never-fails', () => {
    const got = classifyInvocation('gofmt -l .');
    assert.equal(got.key, 'format');
    assert.equal(got.form, 'check');
    assert.deepEqual(got.weak, ['never-fails']);
  });

  test('wrapped in `test -z "$(…)"` the same check is NOT weak', () => {
    assert.deepEqual(classifyInvocation('test -z "$(gofmt -l .)"').weak, []);
    assert.deepEqual(classifyInvocation('[ -z "$(gofmt -l .)" ]').weak, []);
  });

  test('a gofmt piped into a filter is the author composing an exit condition: not weak', () => {
    assert.deepEqual(classifyInvocation('gofmt -l . | grep .').weak, []);
  });

  test('`gofmt -l -w` mutates: format/apply, not weak', () => {
    const got = classifyInvocation('gofmt -l -w .');
    assert.equal(got.form, 'apply');
    assert.deepEqual(got.weak, []);
  });

  test('--issues-exit-code=0 (both spellings) is weak', () => {
    assert.deepEqual(classifyInvocation('golangci-lint run --issues-exit-code=0').weak, ['--issues-exit-code=0']);
    assert.deepEqual(classifyInvocation('golangci-lint run --issues-exit-code 0').weak, ['--issues-exit-code=0']);
    assert.deepEqual(classifyInvocation('golangci-lint run --issues-exit-code=1').weak, []);
  });

  test('`|| true` swallows the exit code', () => {
    assert.deepEqual(classifyInvocation('go vet ./... || true').weak, ['|| true']);
    assert.equal(classifyInvocation('go vet ./... || true').key, 'lint');
  });

  test('gosec -no-fail is weak', () => {
    assert.deepEqual(classifyInvocation('gosec -no-fail ./...').weak, ['-no-fail']);
  });

  test('dart pub outdated always exits 0', () => {
    assert.deepEqual(classifyInvocation('dart pub outdated').weak, ['never-fails']);
    assert.deepEqual(classifyInvocation('npm outdated').weak, []);
  });

  test('a strict command has no weak markers', () => {
    for (const cmd of ['go vet ./...', 'go test ./...', 'flutter analyze', 'gosec ./...', 'govulncheck ./...']) {
      assert.deepEqual(classifyInvocation(cmd).weak, [], cmd);
    }
  });

  test('WEAK_MARKERS exposes the spec ids', () => {
    const ids = WEAK_MARKERS.map((m) => m.id);
    for (const id of ['--no-fatal-infos', '--no-fatal-warnings', '--issues-exit-code=0', '|| true']) {
      assert.ok(ids.includes(id), `${id} missing from WEAK_MARKERS`);
    }
    assert.ok(WEAK_MARKERS.every((m) => typeof m.id === 'string' && typeof m.test === 'function'));
  });
});

describe('K19 opaque wrappers and hints', () => {
  test('`./scripts/check-vuln.sh` + hint `govulncheck` -> audit, confidence low', () => {
    const got = classifyInvocation('./scripts/check-vuln.sh', { hint: 'govulncheck' });
    assert.equal(got.key, 'audit');
    assert.equal(got.confidence, 'low');
  });

  test('the same wrapper with no hint is null', () => {
    assert.equal(classifyInvocation('./scripts/check-vuln.sh'), null);
    assert.equal(classifyInvocation('./scripts/check-vuln.sh', {}), null);
    assert.equal(classifyInvocation('./scripts/check-vuln.sh', { hint: '' }), null);
  });

  test('`bash scripts/x.sh`, `make x` and `npm run x` are opaque too', () => {
    assert.equal(classifyInvocation('bash scripts/x.sh', { hint: 'lint' }).key, 'lint');
    assert.equal(classifyInvocation('make check', { hint: 'test' }).key, 'test');
    assert.equal(classifyInvocation('npm run ci', { hint: 'typecheck' }).key, 'typecheck');
    assert.equal(classifyInvocation('../scripts/govulncheck-gate.sh ./...', { hint: 'audit' }).key, 'audit');
  });

  test('a hint is a tiebreaker only: it never outranks a recognised tool', () => {
    const got = classifyInvocation('go test ./...', { hint: 'lint' });
    assert.equal(got.key, 'test');
    assert.equal(got.confidence, 'high');
  });

  test('a hint does not rescue an unknown, non-opaque tool', () => {
    assert.equal(classifyInvocation('mytool run', { hint: 'test' }), null);
  });

  test('a hint that names nothing gives null', () => {
    assert.equal(classifyInvocation('./scripts/x.sh', { hint: 'deploy-staging' }), null);
  });

  test('hint tokens: e2e outranks test, helm outranks lint, vuln means audit', () => {
    assert.equal(classifyInvocation('./s.sh', { hint: 'test-e2e' }).key, 'e2e');
    assert.equal(classifyInvocation('./s.sh', { hint: 'lint-helm' }).key, 'lint_helm');
    assert.equal(classifyInvocation('./s.sh', { hint: 'check-vuln' }).key, 'audit');
    assert.equal(classifyInvocation('./s.sh', { hint: 'unit-tests' }).key, 'test');
  });

  test('hint forms are conservative: fmt is apply, build is build, generate is mutate', () => {
    assert.equal(classifyInvocation('./s.sh', { hint: 'fmt' }).form, 'apply');
    assert.equal(classifyInvocation('./s.sh', { hint: 'build' }).form, 'build');
    assert.equal(classifyInvocation('./s.sh', { hint: 'generate' }).form, 'mutate');
    assert.equal(classifyInvocation('./s.sh', { hint: 'lint' }).form, 'check');
  });

  test('every hint result is low confidence', () => {
    for (const hint of ['test', 'lint', 'fmt', 'build', 'audit', 'govulncheck', 'typecheck']) {
      assert.equal(classifyInvocation('./s.sh', { hint }).confidence, 'low', hint);
    }
  });
});

describe('K20 runner wrappers are unwrapped', () => {
  const CASES = [
    ['npx --yes playwright test', 'e2e'],
    ['npx -y prettier --check .', 'format'],
    ['pnpm exec playwright test', 'e2e'],
    ['pnpm dlx eslint .', 'lint'],
    ['npm exec -- tsc --noEmit', 'typecheck'],
    ['bunx prettier --check .', 'format'],
    ['yarn playwright test', 'e2e'],
    ['python -m pytest', 'test'],
    ['python3 -m mypy .', 'typecheck'],
    ['poetry run pytest', 'test'],
    ['go run github.com/securego/gosec/v2/cmd/gosec@latest ./...', 'sast'],
    ['go run golang.org/x/vuln/cmd/govulncheck@latest ./...', 'audit'],
    ['dart run build_runner build --delete-conflicting-outputs', 'codegen'],
    ['flutter pub run build_runner build', 'codegen'],
  ];
  for (const [input, key] of CASES) {
    test(`${input}  ->  ${key}`, () => {
      assert.equal(classifyInvocation(input).key, key);
    });
  }

  test('`go run ./cmd/tool` (a local program) is not a tool from the table', () => {
    assert.equal(classifyInvocation('go run ./cmd/tool'), null);
  });

  test('`dart run` of an unknown program is null', () => {
    assert.equal(classifyInvocation('dart run bin/server.dart'), null);
  });
});

describe('K21 ordering pins', () => {
  test('`flutter test integration_test` is e2e; `flutter test` is test', () => {
    assert.equal(classifyInvocation('flutter test integration_test').key, 'e2e');
    assert.equal(classifyInvocation('flutter test test/widget_test.dart').key, 'test');
    assert.equal(classifyInvocation('flutter test --coverage integration_test/app_test.dart').key, 'e2e');
    assert.equal(classifyInvocation('flutter test --coverage').key, 'test');
  });

  test('the e2e flutter row precedes the test flutter row in CLASSIFY_TABLE', () => {
    const e2e = CLASSIFY_TABLE.findIndex((r) => r.key === 'e2e' && r.tool === 'flutter');
    const plain = CLASSIFY_TABLE.findIndex((r) => r.key === 'test' && r.tool === 'flutter');
    assert.ok(e2e >= 0 && plain >= 0);
    assert.ok(e2e < plain, 'a more specific e2e row must come before the generic test row');
  });

  test('every e2e row precedes every generic test row', () => {
    const lastE2e = CLASSIFY_TABLE.map((r) => r.key).lastIndexOf('e2e');
    const firstTest = CLASSIFY_TABLE.map((r) => r.key).indexOf('test');
    assert.ok(lastE2e < firstTest, `last e2e row ${lastE2e} must precede first test row ${firstTest}`);
  });

  test('format apply/check disambiguation by flag, not by order accident', () => {
    assert.equal(classifyInvocation('dart format --set-exit-if-changed --output=none .').form, 'check');
    assert.deepEqual(classifyInvocation('dart format --set-exit-if-changed --output=none .').weak, []);
    assert.equal(classifyInvocation('dart format --output=none .').form, 'check');
    assert.deepEqual(classifyInvocation('dart format --output=none .').weak, ['never-fails']);
    assert.equal(classifyInvocation('cargo fmt --all -- --check').form, 'check');
    assert.equal(classifyInvocation('cargo fmt --all').form, 'apply');
  });

  test('go mod tidy -diff is the check form of tidy; bare is apply', () => {
    assert.equal(classifyInvocation('go mod tidy -diff').form, 'check');
    assert.equal(classifyInvocation('go mod tidy').form, 'apply');
  });

  test('the lint_helm rows precede any generic lint match for `helm lint`', () => {
    assert.equal(classifyInvocation('helm lint chart/ --strict').key, 'lint_helm');
  });
});

describe('K22 table integrity', () => {
  const FORMS = new Set(['check', 'apply', 'build', 'mutate']);

  test('CLASSIFY_TABLE is a non-empty ordered array of well-formed rows', () => {
    assert.ok(Array.isArray(CLASSIFY_TABLE) && CLASSIFY_TABLE.length > 40);
    CLASSIFY_TABLE.forEach((row, i) => {
      assert.equal(typeof row.key, 'string', `row ${i}`);
      assert.ok(FORMS.has(row.form), `row ${i} form ${row.form}`);
      assert.ok(typeof row.match === 'function' || row.re instanceof RegExp, `row ${i} needs match() or re`);
    });
  });

  test('every key the table can emit is in STANDARD_KEYS_EXT', () => {
    const ext = new Set(STANDARD_KEYS_EXT);
    for (const row of CLASSIFY_TABLE) assert.ok(ext.has(row.key), `${row.key} missing from STANDARD_KEYS_EXT`);
  });

  test('STANDARD_KEYS_EXT is the standard keys plus the custom ones', () => {
    for (const k of STANDARD_KEYS) assert.ok(STANDARD_KEYS_EXT.includes(k), `standard key ${k} missing`);
    for (const k of ['sast', 'e2e', 'lint_helm', 'lint_docker', 'tidy', 'outdated']) {
      assert.ok(STANDARD_KEYS_EXT.includes(k), `custom key ${k} missing`);
    }
    assert.equal(new Set(STANDARD_KEYS_EXT).size, STANDARD_KEYS_EXT.length, 'no duplicates');
  });

  test('the local standard-key list is not stale against stack-evidence.cjs', () => {
    assert.deepEqual(STANDARD_KEYS_EXT.slice(0, STANDARD_KEYS.length), STANDARD_KEYS);
  });

  test('every custom key satisfies the profile schema key pattern', () => {
    for (const k of STANDARD_KEYS_EXT) assert.ok(KEY_PATTERN.test(k), `${k} violates ${KEY_PATTERN}`);
    for (const e of USES_MAP) if (e.key !== null) assert.ok(KEY_PATTERN.test(e.key), `${e.key} violates ${KEY_PATTERN}`);
  });

  test('every USES_MAP key is a known key or null', () => {
    const ext = new Set(STANDARD_KEYS_EXT);
    for (const e of USES_MAP) assert.ok(e.key === null || ext.has(e.key), `${e.prefix}: ${e.key}`);
  });

  test('the module is pure: no fs, no child_process, no network', () => {
    for (const file of ['stack-classify.cjs', 'stack-shell.cjs']) {
      const src = fs.readFileSync(path.join(__dirname, file), 'utf-8');
      assert.ok(!/require\(\s*['"](?:node:)?(?:fs|child_process|net|http|https|dns)['"]\s*\)/.test(src), `${file} must stay pure`);
    }
  });

  test('classification is deterministic and does not mutate its input', () => {
    const inv = { text: 'go test ./...', tool: 'go', argv: ['go', 'test', './...'], cwd: null, env: {} };
    const copy = JSON.parse(JSON.stringify(inv));
    const a = classifyInvocation(inv);
    const b = classifyInvocation(inv);
    assert.deepEqual(a, b);
    assert.deepEqual(inv, copy);
  });

  test('a normalised invocation object (as stack-ci emits) classifies like its text', () => {
    assert.equal(classifyInvocation({ text: 'go vet ./...', tool: 'go', argv: ['go', 'vet', './...'], cwd: 'svc', env: {} }).key, 'lint');
    assert.equal(classifyInvocation({ text: 'gosec ./...' }).key, 'sast');
    assert.equal(classifyInvocation({ text: 'flutter analyze --no-fatal-infos' }).weak[0], '--no-fatal-infos');
  });

  test('an object input carrying a hint-eligible wrapper honours the hint option', () => {
    assert.equal(classifyInvocation({ text: './scripts/check-vuln.sh', tool: './scripts/check-vuln.sh', argv: ['./scripts/check-vuln.sh'] }, { hint: 'govulncheck' }).key, 'audit');
  });
});
