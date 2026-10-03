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

// ─── testBreadth (TRD 42-13 tests 8-9) ────────────────────────────────────────
//
// The repo-wide `test` must be broad. testBreadth reads the test runner's own flags and positional
// paths (data per tool, in stack-classify) and says whether a test invocation runs the whole suite.

const { testBreadth } = require('./stack-classify.cjs');

describe('K23 testBreadth — broad (TRD 42-13 test 8)', () => {
  const BROAD = [
    'go test ./...',
    'go test -race -short ./...',
    'go test -coverprofile=c.out ./...',
    'go test -race -coverprofile=c.out ./...',
    'go test -count=1 -v -timeout 10m ./...',
    'go test -json ./... | tee report.json',
    'go test -tags osusergo,netgo ./...',
    'go test',
    'go test .',
    'gotestsum --format pkgname -- -race ./...',
    'gotestsum',
    'dart test',
    'dart test test/',
    'flutter test',
    'flutter test --coverage',
    'dart test {{args}}',
    'npm test',
    'pnpm test',
    'yarn run test',
    'vitest run',
    'jest --ci',
    'pytest',
    'pytest tests/',
    'pytest -m "not integration"',
    'cargo test --workspace',
    'ginkgo -r -p',
    'CGO_ENABLED=1 go test -race ./...',
  ];
  for (const input of BROAD) {
    test(`${input}  ->  broad`, () => {
      const r = testBreadth(input);
      assert.ok(r, `${input} is a test invocation`);
      assert.equal(r.breadth, 'broad', JSON.stringify(r));
      assert.equal(r.reason, null);
      assert.equal(r.fitsKey, 'test');
    });
  }
});

describe('K24 testBreadth — narrow, with reasons (TRD 42-13 test 9)', () => {
  const NARROW = [
    ['go test -c ./x/', 'compile-only', 'test'],
    ['go test -o bin/t ./x/', 'compile-only', 'test'],
    ['go test -c -o /tmp/guard.test ./tests/guard/', 'compile-only', 'test'],
    ['go test -run TestFoo ./...', 'run-filter', 'test'],
    ['go test -run=TestFoo ./...', 'run-filter', 'test'],
    ['go test -tags=integration ./...', 'tag', 'integration'],
    ['go test -tags e2e ./...', 'tag', 'e2e'],
    ['go test ./tests/guard/', 'single-path', 'test'],
    ['go test ./cmd/...', 'single-path', 'test'],
    ['go test ./pkg/guardnet/...', 'single-path', 'test'],
    ['ginkgo -r ./pkg/guardnet', 'single-path', 'test'],
    ['go test ./e2e/...', 'suite-path', 'e2e'],
    ['go test ./integration/...', 'suite-path', 'integration'],
    ['gotestsum -- -run TestSlow ./...', 'run-filter', 'test'],
    ['dart test test/foo_test.dart', 'single-path', 'test'],
    ['dart test --name parses', 'run-filter', 'test'],
    ['dart test -t integration', 'tag', 'integration'],
    ['flutter test integration_test', 'suite-path', 'e2e'],
    ['flutter test test/widget_test.dart', 'single-path', 'test'],
    ['npm test -- src/api.test.ts', 'single-path', 'test'],
    ['vitest run src/api', 'single-path', 'test'],
    ['jest -t "parses dates"', 'run-filter', 'test'],
    ['pytest tests/unit/test_api.py', 'single-path', 'test'],
    ['pytest -k slow', 'run-filter', 'test'],
    ['pytest -m integration', 'tag', 'integration'],
    ['cargo test parser', 'run-filter', 'test'],
    ['ginkgo --focus Slow ./...', 'run-filter', 'test'],
  ];
  for (const [input, reason, fitsKey] of NARROW) {
    test(`${input}  ->  narrow (${reason}, fits ${fitsKey})`, () => {
      const r = testBreadth(input);
      assert.ok(r, `${input} is a test invocation`);
      assert.equal(r.breadth, 'narrow', JSON.stringify(r));
      assert.equal(r.reason, reason, JSON.stringify(r));
      assert.equal(r.fitsKey, fitsKey, JSON.stringify(r));
      assert.equal(typeof r.detail, 'string');
      assert.ok(r.detail.length > 0);
    });
  }

  test('compile-only outranks every other reason', () => {
    assert.equal(testBreadth('go test -c -run TestX -tags=integration ./tests/guard/').reason, 'compile-only');
    assert.equal(testBreadth('go test -c -run TestX -tags=integration ./tests/guard/').fitsKey, 'integration');
  });

  test('a non-test invocation has no breadth (null); so does non-string input', () => {
    for (const input of ['go build ./...', 'go vet ./...', 'make test', 'task test:unit', 'echo go test -c', '', null, 42]) {
      assert.equal(testBreadth(input), null, String(input));
    }
  });

  test('a normalised invocation object is read like its text', () => {
    assert.equal(testBreadth({ text: 'go test -c ./x/', argv: ['go', 'test', '-c', './x/'] }).reason, 'compile-only');
    assert.equal(testBreadth({ text: 'go test ./...' }).breadth, 'broad');
  });

  test('TEST_BREADTH is data: every row names a tool matcher and a spec', () => {
    const { TEST_BREADTH } = require('./stack-classify.cjs');
    assert.ok(Array.isArray(TEST_BREADTH) && TEST_BREADTH.length >= 8);
    for (const row of TEST_BREADTH) {
      assert.equal(typeof row.match, 'function');
      assert.equal(typeof row.args, 'function');
      assert.equal(typeof row.spec, 'object');
    }
  });
});

// ─── TRD 42-15 test 13: toolStack + TIER_STACKS (D3 root-override policy) ─────
//
// toolStack(inv) names the language/ecosystem a command's TOOL belongs to, so stack-draft can ask
// "does this root candidate run the extends tier's stack?" without naming a tool itself. An opaque
// wrapper (a script path, a task runner, a shell) is null: its body, not its name, decides.

describe('toolStack / TIER_STACKS (TRD 42-15 test 13)', () => {
  const { toolStack, TIER_STACKS } = require('./stack-classify.cjs');

  const CASES = [
    ['go test ./...', 'go'],
    ['go build -o dist/x ./cmd/x', 'go'],
    ['gofmt -l .', 'go'],
    ['golangci-lint run', 'go'],
    ['govulncheck ./...', 'go'],
    ['gosec ./...', 'go'],
    ['dart analyze', 'dart'],
    ['dart run build_runner build', 'dart'],
    ['flutter test', 'flutter'],
    ['flutter pub get', 'flutter'],
    ['npm test', 'node'],
    ['vitest', 'node'],
    ['vitest --root ui', 'node'],
    ['pnpm run x', 'node'],
    ['npx tsc --noEmit', 'node'],
    ['cargo test', 'rust'],
    ['pytest -q', 'python'],
    ['python -m pytest', 'python'],
    ['helm lint chart/', 'helm'],
    ['docker build .', 'docker'],
    ['hadolint Dockerfile', 'docker'],
    ['./x.sh', null],
    ['bash scripts/ci.sh', null],
    ['make test', null],
    ['task build', null],
    ['echo hi', null],
    ['', null],
  ];

  for (const [input, want] of CASES) {
    test(`toolStack(${JSON.stringify(input)}) -> ${want}`, () => {
      assert.equal(toolStack(input), want);
    });
  }

  test('env assignments and a templated leading token are skipped; the tool decides', () => {
    assert.equal(toolStack('CGO_ENABLED=1 go build ./...'), 'go');
    assert.equal(toolStack('CGO_ENABLED=1 {{.GO_ENV_VARS}} go build -o x ./cmd/x'), 'go');
    assert.equal(toolStack('cd site && npm install'), 'node');
  });

  test('a normalised invocation object and non-string input', () => {
    assert.equal(toolStack({ text: 'go vet ./...', argv: ['go', 'vet', './...'] }), 'go');
    assert.equal(toolStack({ text: 'npm ci' }), 'node');
    assert.equal(toolStack(null), null);
    assert.equal(toolStack(42), null);
  });

  test('TIER_STACKS maps each bundled tier to its stack family', () => {
    assert.deepStrictEqual(TIER_STACKS, { go: ['go'], dart: ['dart'], flutter: ['dart', 'flutter'] });
    assert.ok(Object.isFrozen(TIER_STACKS));
  });
});

// TRD 42-15 recovery (over-block found by the fleet preview): a language-neutral generator
// (`buf generate`, `sqlc generate`, `protoc`) belongs to no stack, so it must not be off-stack
// for a go repo's codegen. It is its own value, NEUTRAL_STACK, which stack-draft treats as
// matching any tier.
describe('toolStack: language-neutral generators (TRD 42-15 recovery)', () => {
  const { toolStack, NEUTRAL_STACK } = require('./stack-classify.cjs');

  test('NEUTRAL_STACK is a string distinct from every tier stack', () => {
    assert.equal(typeof NEUTRAL_STACK, 'string');
    assert.ok(!['go', 'dart', 'flutter', 'node'].includes(NEUTRAL_STACK));
  });

  for (const input of ['buf generate', 'sqlc generate', 'protoc --go_out=. api.proto']) {
    test(`toolStack(${JSON.stringify(input)}) -> NEUTRAL_STACK`, () => {
      assert.equal(toolStack(input), NEUTRAL_STACK);
    });
  }
});

// TRD 43-04 (D4): environment bring-up and scenario targets get their own key, `e2e_env`. A name that
// pairs an environment token with a scenario token, or a body that brings an environment up, is never
// build / test / e2e. Tokens are whole words from the existing splitter, never substrings.
describe('K23 e2e_env: name and body classification (TRD 43-04, tests 3-5)', () => {
  const { classifyHint } = require('./stack-classify.cjs');

  for (const name of ['e2e-stack-up', 'integration-env-up', 'e2e:seed', 'scenario-cluster-start', 'e2e_compose_down', 'up-e2e']) {
    test(`classifyHint(${JSON.stringify(name)}) is e2e_env, low confidence, check form`, () => {
      const got = classifyHint(name);
      assert.equal(got.key, 'e2e_env');
      assert.equal(got.form, 'check');
      assert.equal(got.confidence, 'low');
    });
    test(`an opaque wrapper hinted ${JSON.stringify(name)} is e2e_env`, () => {
      assert.equal(classifyInvocation('make x', { hint: name }).key, 'e2e_env');
      assert.equal(classifyInvocation('./scripts/x.sh', { hint: name }).key, 'e2e_env');
    });
  }

  for (const name of ['e2e', 'test-e2e', 'playwright', 'e2e-tests', 'integration']) {
    test(`classifyHint(${JSON.stringify(name)}) keeps its old key (no environment token)`, () => {
      const got = classifyHint(name);
      assert.ok(!got || got.key !== 'e2e_env');
    });
  }

  test('a plain e2e hint stays e2e; test-e2e and playwright too', () => {
    assert.equal(classifyHint('e2e').key, 'e2e');
    assert.equal(classifyHint('test-e2e').key, 'e2e');
    assert.equal(classifyHint('playwright').key, 'e2e');
  });

  test('tokens are whole words: setup is not up, restart is not start, upstream is not up', () => {
    for (const name of ['e2e-setup', 'e2e-restart', 'integration-upstream', 'scenario-environment', 'e2e-stacked']) {
      const got = classifyHint(name);
      assert.ok(!got || got.key !== 'e2e_env', `${name} must not be e2e_env`);
    }
  });

  test('an environment token without a scenario token is not e2e_env', () => {
    for (const name of ['stack-up', 'docker-up', 'start', 'env-seed', 'cluster-down']) {
      const got = classifyHint(name);
      assert.ok(!got || got.key !== 'e2e_env', `${name} must not be e2e_env`);
    }
  });

  test('the name rule outranks the test and build tokens: e2e-stack-up is never e2e, test or build', () => {
    for (const name of ['e2e-stack-up', 'build-e2e-env', 'integration-test-env-up']) {
      assert.equal(classifyHint(name).key, 'e2e_env', name);
    }
  });

  const BODIES = [
    'docker compose up -d',
    'docker compose -f e2e/compose.yml up -d',
    'docker compose -p shopsvc --profile e2e up -d --wait',
    'docker compose run --rm tests',
    'docker compose start db',
    'docker-compose up -d',
    'docker-compose run --rm tests',
    'kind create cluster --name shopsvc',
    'k3d cluster create shopsvc',
    'kubectl apply -f k8s/',
    'kubectl wait --for=condition=ready pod --all',
    'helm install shopsvc ./chart',
    'helm upgrade --install shopsvc ./chart',
    'tilt up',
  ];
  for (const body of BODIES) {
    test(`body ${JSON.stringify(body)} is e2e_env in mutate form`, () => {
      const got = classifyInvocation(body);
      assert.ok(got, 'classified');
      assert.equal(got.key, 'e2e_env');
      assert.equal(got.form, 'mutate');
      assert.equal(got.confidence, 'high');
    });
  }

  test('bodies that merely mention the tools are not e2e_env', () => {
    for (const body of ['docker compose build', 'docker compose config', 'docker compose logs api', 'docker compose down', 'helm lint chart/', 'helm template x ./chart', 'kind version', 'echo kubectl apply']) {
      const got = classifyInvocation(body);
      assert.ok(!got || got.key !== 'e2e_env', `${body} must not be e2e_env`);
    }
  });

  test('docker build is still build; helm lint is still lint_helm', () => {
    assert.equal(classifyInvocation('docker build .').key, 'build');
    assert.equal(classifyInvocation('helm lint chart/').key, 'lint_helm');
  });

  test('e2e_env is a known key: in STANDARD_KEYS_EXT right after e2e, and it satisfies the key pattern', () => {
    const i = STANDARD_KEYS_EXT.indexOf('e2e');
    assert.equal(STANDARD_KEYS_EXT[i + 1], 'e2e_env');
    assert.ok(KEY_PATTERN.test('e2e_env'));
  });

  test('every e2e_env row sits after the last e2e row and before the first test row', () => {
    const keys = CLASSIFY_TABLE.map((r) => r.key);
    assert.ok(keys.includes('e2e_env'));
    assert.ok(keys.indexOf('e2e_env') > keys.lastIndexOf('e2e'));
    assert.ok(keys.lastIndexOf('e2e_env') < keys.indexOf('test'));
  });
});

// TRD 43-06 (devflowops / aodex goldens): a check or apply SUFFIX in a target name names the form of the
// key the rest of the name carries, for every key with that form, not only format. `lint-fix` is
// lint's apply, `tidy-check` tidy's check. A drift check (`git diff --exit-code` / `--quiet`) is what a
// `<x>-check` target runs after regenerating; stack-evidence reads it through isDriftCheck.
describe('K25 hint forms from check / apply suffixes; drift checks (TRD 43-06)', () => {
  const { classifyHint, isDriftCheck } = require('./stack-classify.cjs');
  const pick = (r) => (r ? { key: r.key, form: r.form } : null);

  test('K25a: `<key>-fix` (any separator) is the apply form of lint, format and tidy', () => {
    for (const name of ['lint-fix', 'lint:fix', 'lint_fix', 'fix-lint']) {
      assert.deepEqual(pick(classifyHint(name)), { key: 'lint', form: 'apply' }, name);
    }
    assert.deepEqual(pick(classifyHint('fmt-fix')), { key: 'format', form: 'apply' });
    assert.deepEqual(pick(classifyHint('tidy-fix')), { key: 'tidy', form: 'apply' });
  });

  test('K25b: `<key>-check` / `-verify` / `-diff` is the check form of format, tidy, codegen and fix', () => {
    assert.deepEqual(pick(classifyHint('tidy-check')), { key: 'tidy', form: 'check' });
    assert.deepEqual(pick(classifyHint('generate-check')), { key: 'codegen', form: 'check' });
    assert.deepEqual(pick(classifyHint('codegen:verify')), { key: 'codegen', form: 'check' });
    assert.deepEqual(pick(classifyHint('fmt-check')), { key: 'format', form: 'check' });
    assert.deepEqual(pick(classifyHint('format-diff')), { key: 'format', form: 'check' });
    assert.deepEqual(pick(classifyHint('fix-check')), { key: 'fix', form: 'check' });
  });

  test('K25c: without a suffix the conservative forms stand; a suffix never changes the key', () => {
    assert.deepEqual(pick(classifyHint('fmt')), { key: 'format', form: 'apply' });
    assert.deepEqual(pick(classifyHint('tidy')), { key: 'tidy', form: 'apply' });
    assert.deepEqual(pick(classifyHint('generate')), { key: 'codegen', form: 'mutate' });
    assert.deepEqual(pick(classifyHint('fix')), { key: 'fix', form: 'apply' });
    assert.deepEqual(pick(classifyHint('lint')), { key: 'lint', form: 'check' });
    assert.deepEqual(pick(classifyHint('build-check')), { key: 'build', form: 'build' }, 'build has no check form');
    assert.deepEqual(pick(classifyHint('test-fix')), { key: 'test', form: 'check' }, 'test has no apply form');
    assert.equal(classifyHint('check'), null);
    assert.equal(classifyHint('verify'), null);
  });

  test('K25d: isDriftCheck is `git diff` with --exit-code or --quiet, nothing else', () => {
    for (const cmd of ['git diff --exit-code', 'git diff --exit-code -- go.mod go.sum', 'git diff --quiet', 'git --no-pager diff --exit-code']) {
      assert.equal(isDriftCheck(cmd), true, cmd);
    }
    for (const cmd of ['git diff', 'git diff --stat', 'git status --porcelain', 'go test ./...', 'diff -u a b', '']) {
      assert.equal(isDriftCheck(cmd), false, cmd);
    }
  });
});

// TRD 43-09 (devflowops.format / devflowops.tidy / aodex.codegen rows): the drift checks real recipes
// write. A captured `$(git diff …)` tested non-empty, and a `diff -q` of a mktemp/snapshot copy against
// the regenerated file, each followed by a failing exit. Read from the raw recipe TEXT (`$$` or `$`):
// both shapes normalise to nothing a table row could see. driftCheckAt gives where the check statement
// starts, so stack-evidence can look for the writer before it.
describe('K27 drift checks as real recipes write them (TRD 43-09)', () => {
  const { isDriftCheck, driftCheckAt } = require('./stack-classify.cjs');
  const CAPTURED_MAKE = 'out=$$(git diff --color=never cmd views); if [ -n "$$out" ]; then echo "run make fmt"; echo "$${out}"; exit 1; fi';
  const CAPTURED_SH = 'changes="$(git diff --name-only -- go.mod go.sum)"\nif [ -n "$changes" ]; then\n  echo "$changes"\n  exit 1\nfi';

  test('K27a: a captured `git diff` tested non-empty and failing is a drift check ($$ and $ spellings)', () => {
    assert.equal(isDriftCheck(CAPTURED_MAKE), true, 'Makefile $$ spelling');
    assert.equal(isDriftCheck(CAPTURED_SH), true, 'shell $ spelling');
    assert.equal(isDriftCheck('d=`git -C api diff`; [ -z "$d" ] || exit 1'), true, 'backticks, -z, || exit');
    assert.equal(isDriftCheck('if [ -n "$(git diff)" ]; then false; fi'), true, 'inline capture, `false`');
    assert.equal(isDriftCheck('rc=1; d=$(git diff); if [ -n "$d" ]; then exit $rc; fi'), true, '`exit $rc`');
  });

  test('K27b: a snapshot `diff`/`cmp` against the in-tree file, then a failing exit, is a drift check', () => {
    assert.equal(isDriftCheck('diff -q $$tmp/f.go f.go || exit 1'), true, '`|| exit 1`');
    assert.equal(isDriftCheck('snap=$$(mktemp -d) && cp a.gen.go $$snap/ && go generate ./... && if ! diff -q $$snap/a.gen.go a.gen.go >/dev/null; then cp $$snap/a.gen.go .; exit 1; fi'), true, '`if ! diff -q … then … exit 1`');
    assert.equal(isDriftCheck('keep=$(mktemp -d)\ncp out.json "$keep/"\n./gen.sh\ncmp "$keep/out.json" out.json || exit 1'), true, 'cmp, quoted, mktemp-assigned');
    assert.equal(isDriftCheck('diff -u .snapshots/api.txt api.txt || { echo stale; exit 1; }'), true, 'a snapshot directory');
    assert.equal(isDriftCheck('diff $TMPDIR/x.pb.go x.pb.go || exit 1'), true, 'no flag');
  });

  test('K27c: a diff that is only shown, or not of a snapshot, is not a drift check', () => {
    assert.equal(isDriftCheck('d=$$(git diff); echo "$$d"'), false, 'captured and echoed only');
    assert.equal(isDriftCheck('d=$(git diff); if [ -n "$d" ]; then echo "$d"; fi'), false, 'tested but never failing');
    assert.equal(isDriftCheck('git diff --stat'), false);
    assert.equal(isDriftCheck('diff -u $$tmp/a a | head -30 || true'), false, '`|| true` is not a failing exit');
    assert.equal(isDriftCheck('diff -u expected.txt actual.txt || exit 1'), false, 'neither side is a snapshot');
    assert.equal(isDriftCheck('d=$(git log -1); [ -n "$d" ] || exit 1'), false, 'not a git diff');
    assert.equal(isDriftCheck('exit 0'), false);
  });

  test('K27d: driftCheckAt points at the start of the check statement, -1 when there is none', () => {
    const text = 'go generate ./api/... >/dev/null 2>&1 && if ! diff -q $$tmp/a.go a.go; then exit 1; fi';
    const at = driftCheckAt(text);
    assert.equal(text.slice(0, at).trim(), 'go generate ./api/... >/dev/null 2>&1 &&');
    assert.equal(driftCheckAt(CAPTURED_MAKE), 0);
    assert.equal(driftCheckAt('gofmt -w .'), -1);
    assert.equal(driftCheckAt(''), -1);
  });
});

// TRD 43-09 (aocore.lint_helm row): an install step that ends by printing the tool's version
// (`kubeconform -v`) is a presence probe, never a gate for any key. Checked before the table, so no row
// (a bare-tool row like kubeconform's, or kubectl's e2e_env row) can claim it. `-v` stays verbose for the
// runners whose bare invocation runs the suite (pytest, ginkgo, mypy).
describe('K28 version probes are never gates (TRD 43-09)', () => {
  test('K28a: `<tool> -v`, `--version`, `version` and `version --short|--client` classify to null', () => {
    for (const cmd of ['kubeconform -v', 'helm version', 'golangci-lint --version', 'go version', 'kubectl version --client', 'helm version --short', 'govulncheck --version', 'npx eslint -v']) {
      assert.equal(classifyInvocation(cmd), null, cmd);
      assert.equal(classifyInvocation(cmd, { hint: 'lint' }), null, `${cmd} with a hint`);
    }
  });

  test('K28b: the gates themselves still classify; `-v` among other operands is a flag, not a probe', () => {
    const pick = (r) => (r ? { key: r.key, form: r.form } : null);
    assert.deepEqual(pick(classifyInvocation('kubeconform -strict -summary out.yaml')), { key: 'lint_helm', form: 'check' });
    assert.deepEqual(pick(classifyInvocation('go test -v ./...')), { key: 'test', form: 'check' });
    assert.deepEqual(pick(classifyInvocation('pytest -v')), { key: 'test', form: 'check' }, 'pytest -v runs the suite');
    assert.deepEqual(pick(classifyInvocation('ginkgo -v')), { key: 'test', form: 'check' }, 'ginkgo -v runs the suite');
    assert.deepEqual(pick(classifyInvocation('helm lint charts/a/')), { key: 'lint_helm', form: 'check' });
    assert.deepEqual(pick(classifyInvocation('go version -m ./bin/x')), null, 'go version -m reads a binary: not a gate either');
  });
});

// TRD 43-06 (devcluster golden): shellcheck is the repo-wide linter of a shell repo, and a `selftest`
// is a test entry point (an offline self-test), so both classify without a runner around them.
describe('K26 shellcheck and selftest (TRD 43-06)', () => {
  const { classifyHint } = require('./stack-classify.cjs');
  test('K26a: `shellcheck <files>` is lint, check form, high confidence', () => {
    const got = classifyInvocation('shellcheck bin/*.sh lib/*.sh t0-conformance/*.sh');
    assert.ok(got);
    assert.deepEqual({ key: got.key, form: got.form, tool: got.tool, confidence: got.confidence }, { key: 'lint', form: 'check', tool: 'shellcheck', confidence: 'high' });
  });
  test('K26b: a `selftest` / `selftests` name is test; `self-test` already was', () => {
    for (const name of ['selftest', 'selftests', 'run-selftest', 'self-test']) assert.equal((classifyHint(name) || {}).key, 'test', name);
    assert.equal(classifyInvocation('bash t0-conformance/selftest.sh', { hint: 'selftest' }).key, 'test');
  });
});
