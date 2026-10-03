'use strict';

// stack-classify.cjs — classify an invocation by TOOL SEMANTICS (TRD 42-03, SDR-02).
//
// The old classifier scored English tokens over a whole line (`\btests?\b`, `\bfmt\b`), so
// `test -f x` and `# run the tests` were `test`, `gosec -fmt sarif` was `format`, `helm lint` was
// `lint` and `npx playwright test` was `test`. This module reads the resolved TOOL and SUBCOMMAND
// from a normalised invocation (see stack-shell.cjs) and looks them up in CLASSIFY_TABLE, an ORDERED
// array of data rows. First hit wins; a more specific row must therefore sit above a more general
// one (`flutter test integration_test` above `flutter test`) and the test file pins that order.
//
//   row = { key, form, tool, match(argv, text), weak? }   // or { key, form, tool, re }
//
// `form` says what the command DOES: `check` (fails when the code is wrong), `apply` (rewrites the
// code), `build` (produces an artefact), `mutate` (regenerates or installs). A `format` command in
// `apply` form belongs under a profile command's `apply:`, never its `run:`.
//
// A hint (a Makefile target, a justfile recipe, a package.json script name) is a TIEBREAKER for
// opaque wrappers only (`./scripts/x.sh`, `bash x.sh`, `make x`, `npm run x`). It never outranks a
// recognised tool, and a hint-derived result is always `confidence: 'low'`.
//
// PURE: no fs, no child_process, no network. It names tools because it is data, not the profile
// loader; stack-profile.cjs and stack-render.cjs stay language-neutral. Tier-2 profiles may extend
// this table later; the row shape above is the extension contract.

const { normalizeScript, splitWords, isFragment } = require('./stack-shell.cjs');

// The nine keys every profile understands. Kept here (not imported from stack-evidence.cjs) so this
// module stays free of fs; a test pins the two lists together.
const STANDARD_KEYS = ['build', 'test', 'lint', 'format', 'fix', 'typecheck', 'audit', 'codegen', 'deps'];

// Custom keys this classifier can emit. All satisfy the schema key pattern `^[a-z][a-z0-9_]*$`.
const STANDARD_KEYS_EXT = [...STANDARD_KEYS, 'sast', 'e2e', 'e2e_env', 'lint_helm', 'lint_docker', 'tidy', 'outdated'];

// ─── Matching helpers ─────────────────────────────────────────────────────────

const JS_PM = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const GO_FMT = new Set(['gofmt', 'gofumpt', 'goimports']);

/** `is(argv, 'go', 'test')` — the tool and the leading subcommand words. */
const is = (a, tool, ...subs) => a[0] === tool && subs.every((s, i) => a[i + 1] === s);

/** True when any argument is `name` or `name=value`. */
const flag = (a, ...names) => a.some((x) => names.some((n) => x === n || x.startsWith(`${n}=`)));

/** True when no non-flag argument follows position `from` (a bare `npm install`). */
const bare = (a, from) => !a.slice(from).some((x) => !x.startsWith('-'));

const outputNone = (a) => flag(a, '--output') && (a.includes('--output=none') || a.some((x, i) => x === '--output' && a[i + 1] === 'none'));

const R = (key, form, tool, match, extra = {}) => ({ key, form, tool, match, ...extra });

// `docker compose [global flags] <verb>` / `docker-compose [flags] <verb>`: the verb, or null. A
// flag that takes a separate value (`-f e2e/compose.yml`, `-p name`, `--profile e2e`) is skipped
// together with its value so the value is never read as the verb.
const COMPOSE_VALUE_FLAGS = new Set([
  '-f', '--file', '-p', '--project-name', '--profile', '--env-file', '--project-directory', '--ansi', '--parallel', '--progress',
]);
const DOCKER_VALUE_FLAGS = new Set(['-c', '--context', '-H', '--host', '-l', '--log-level', '--config']);

function composeVerb(a) {
  let i;
  if (a[0] === 'docker-compose') {
    i = 1;
  } else if (a[0] === 'docker') {
    i = 1;
    while (i < a.length && a[i].startsWith('-')) i += DOCKER_VALUE_FLAGS.has(a[i]) ? 2 : 1;
    if (a[i] !== 'compose') return null;
    i += 1;
  } else {
    return null;
  }
  for (; i < a.length; i++) {
    if (!a[i].startsWith('-')) return a[i];
    if (COMPOSE_VALUE_FLAGS.has(a[i])) i += 1;
  }
  return null;
}

/** The compose verbs that bring containers up (see the e2e_env rows in CLASSIFY_TABLE). */
const ENV_COMPOSE_VERBS = new Set(['up', 'run', 'start']);

// ─── CLASSIFY_TABLE ───────────────────────────────────────────────────────────

const CLASSIFY_TABLE = [
  // e2e first: `playwright test`, `flutter test integration_test` and friends are never `test`.
  R('e2e', 'check', 'playwright', (a) => is(a, 'playwright', 'test')),
  R('e2e', 'check', 'cypress', (a) => is(a, 'cypress', 'run')),
  R('e2e', 'check', 'maestro', (a) => is(a, 'maestro', 'test')),
  R('e2e', 'check', 'patrol', (a) => is(a, 'patrol', 'test')),
  R('e2e', 'check', 'flutter', (a) => is(a, 'flutter', 'test') && a.some((x) => x.includes('integration_test'))),
  R('e2e', 'check', 'flutter', (a) => is(a, 'flutter', 'drive')),

  // e2e_env: bringing an environment up (TRD 43-04, D4). The command mutates the machine (starts
  // containers, creates a cluster, installs a release), so it is `mutate`, never a check gate, and
  // stack verify --run never runs the key. Never build / test / e2e.
  R('e2e_env', 'mutate', 'docker', (a) => ENV_COMPOSE_VERBS.has(composeVerb(a))),
  R('e2e_env', 'mutate', 'kind', (a) => is(a, 'kind', 'create')),
  R('e2e_env', 'mutate', 'k3d', (a) => is(a, 'k3d', 'cluster', 'create')),
  R('e2e_env', 'mutate', 'kubectl', (a) => a[0] === 'kubectl'),
  R('e2e_env', 'mutate', 'helm', (a) => is(a, 'helm', 'install') || is(a, 'helm', 'upgrade')),
  R('e2e_env', 'mutate', 'tilt', (a) => is(a, 'tilt', 'up')),

  // audit: dependency vulnerabilities.
  R('audit', 'check', 'govulncheck', (a) => a[0] === 'govulncheck'),
  R('audit', 'check', null, (a) => JS_PM.has(a[0]) && a[1] === 'audit'),
  R('audit', 'check', 'osv-scanner', (a) => a[0] === 'osv-scanner'),
  R('audit', 'check', 'trivy', (a) => is(a, 'trivy', 'fs')),
  R('audit', 'check', 'pip-audit', (a) => a[0] === 'pip-audit'),
  R('audit', 'check', 'cargo', (a) => is(a, 'cargo', 'audit')),

  // sast: static analysis for security defects. NOT audit, NOT format. Collapsing sast into audit
  // when no audit command exists is the drafter's decision (42-07), never the classifier's.
  R('sast', 'check', 'gosec', (a) => a[0] === 'gosec'),
  R('sast', 'check', 'semgrep', (a) => a[0] === 'semgrep'),
  R('sast', 'check', 'codeql', (a) => a[0] === 'codeql'),

  // format: apply forms are matched by their mutating flag, check forms by their checking flag.
  R('format', 'apply', null, (a) => GO_FMT.has(a[0]) && flag(a, '-w')),
  // `gofmt -l` lists files but exits 0: a check that never fails unless wrapped in `test -z`.
  R('format', 'check', null, (a) => GO_FMT.has(a[0]) && flag(a, '-l', '-d') && !flag(a, '-w'), { weak: ['never-fails'] }),
  R('format', 'apply', 'go', (a) => is(a, 'go', 'fmt')),
  R('format', 'check', 'dart', (a) => is(a, 'dart', 'format') && flag(a, '--set-exit-if-changed')),
  R('format', 'check', 'dart', (a) => is(a, 'dart', 'format') && outputNone(a), { weak: ['never-fails'] }),
  R('format', 'apply', 'dart', (a) => is(a, 'dart', 'format')),
  R('format', 'check', 'prettier', (a) => a[0] === 'prettier' && flag(a, '--check', '-c', '--list-different', '-l')),
  R('format', 'apply', 'prettier', (a) => a[0] === 'prettier' && flag(a, '--write', '-w')),
  R('format', 'check', 'cargo', (a) => is(a, 'cargo', 'fmt') && flag(a, '--check')),
  R('format', 'apply', 'cargo', (a) => is(a, 'cargo', 'fmt')),
  R('format', 'check', 'ruff', (a) => is(a, 'ruff', 'format') && flag(a, '--check', '--diff')),
  R('format', 'apply', 'ruff', (a) => is(a, 'ruff', 'format')),
  R('format', 'check', 'terraform', (a) => is(a, 'terraform', 'fmt') && flag(a, '-check')),
  R('format', 'apply', 'terraform', (a) => is(a, 'terraform', 'fmt')),

  // lint: repo-wide code linters. The `--fix` variants rewrite code, so they are `apply`.
  R('lint', 'apply', 'eslint', (a) => a[0] === 'eslint' && flag(a, '--fix')),
  R('lint', 'apply', 'ruff', (a) => is(a, 'ruff', 'check') && flag(a, '--fix')),
  R('lint', 'apply', 'golangci-lint', (a) => is(a, 'golangci-lint', 'run') && flag(a, '--fix')),
  R('lint', 'check', 'go', (a) => is(a, 'go', 'vet')),
  R('lint', 'check', 'golangci-lint', (a) => is(a, 'golangci-lint', 'run')),
  R('lint', 'check', 'staticcheck', (a) => a[0] === 'staticcheck'),
  R('lint', 'check', 'dart', (a) => is(a, 'dart', 'analyze')),
  R('lint', 'check', 'flutter', (a) => is(a, 'flutter', 'analyze')),
  R('lint', 'check', 'eslint', (a) => a[0] === 'eslint'),
  R('lint', 'check', 'ruff', (a) => is(a, 'ruff', 'check')),
  R('lint', 'check', 'cargo', (a) => is(a, 'cargo', 'clippy')),
  // A shell repo's linter (TRD 43-06): `shellcheck bin/*.sh lib/*.sh`.
  R('lint', 'check', 'shellcheck', (a) => a[0] === 'shellcheck'),

  // lint_helm / lint_docker: never the repo-wide `lint`.
  R('lint_helm', 'check', 'helm', (a) => is(a, 'helm', 'lint')),
  R('lint_helm', 'check', 'kubeconform', (a) => a[0] === 'kubeconform'),
  // `helm template … | kubeconform`: the first stage is helm, the gate is the piped stage.
  R('lint_helm', 'check', 'kubeconform', (_a, text) => /\|\s*kubeconform\b/.test(text)),
  R('lint_docker', 'check', 'hadolint', (a) => a[0] === 'hadolint'),

  // typecheck
  R('typecheck', 'check', 'tsc', (a) => a[0] === 'tsc' && flag(a, '--noEmit', '-noEmit')),
  R('typecheck', 'check', 'mypy', (a) => a[0] === 'mypy'),
  R('typecheck', 'check', 'pyright', (a) => a[0] === 'pyright'),

  // test: unit / package tests. (`flutter test integration_test` was taken by e2e above.)
  R('test', 'check', 'go', (a) => is(a, 'go', 'test')),
  R('test', 'check', 'gotestsum', (a) => a[0] === 'gotestsum'),
  R('test', 'check', 'dart', (a) => is(a, 'dart', 'test')),
  R('test', 'check', 'flutter', (a) => is(a, 'flutter', 'test')),
  R('test', 'check', null, (a) => JS_PM.has(a[0]) && (a[1] === 'test' || a[1] === 't' || (a[1] === 'run' && a[2] === 'test'))),
  R('test', 'check', 'jest', (a) => a[0] === 'jest'),
  R('test', 'check', 'vitest', (a) => a[0] === 'vitest'),
  R('test', 'check', 'pytest', (a) => a[0] === 'pytest'),
  R('test', 'check', 'cargo', (a) => is(a, 'cargo', 'test')),
  R('test', 'check', 'ginkgo', (a) => a[0] === 'ginkgo'),

  // build
  R('build', 'build', 'go', (a) => is(a, 'go', 'build')),
  R('build', 'build', 'flutter', (a) => is(a, 'flutter', 'build')),
  R('build', 'build', 'dart', (a) => is(a, 'dart', 'compile')),
  R('build', 'build', null, (a) => JS_PM.has(a[0]) && (a[1] === 'build' || (a[1] === 'run' && a[2] === 'build'))),
  R('build', 'build', 'docker', (a) => a[0] === 'docker' && (a[1] === 'build' || (a[1] === 'buildx' && a[2] === 'build'))),
  R('build', 'build', 'cargo', (a) => is(a, 'cargo', 'build')),

  // codegen: regenerates files, so the drafter lists it before build / lint with `when: sources_changed`.
  R('codegen', 'mutate', 'go', (a) => is(a, 'go', 'generate')),
  R('codegen', 'mutate', 'buf', (a) => is(a, 'buf', 'generate')),
  R('codegen', 'mutate', 'sqlc', (a) => is(a, 'sqlc', 'generate')),
  R('codegen', 'mutate', 'build_runner', (a) => a[0] === 'build_runner' && (a[1] === 'build' || a[1] === 'watch')),
  R('codegen', 'mutate', 'templ', (a) => is(a, 'templ', 'generate')),

  // tidy
  R('tidy', 'check', 'go', (a) => is(a, 'go', 'mod', 'tidy') && flag(a, '-diff')),
  R('tidy', 'apply', 'go', (a) => is(a, 'go', 'mod', 'tidy')),

  // deps: installing the project's OWN dependencies. `npm install left-pad` and `npm i -g x` install
  // a tool, not the project, and are not classified.
  R('deps', 'mutate', 'flutter', (a) => is(a, 'flutter', 'pub', 'get')),
  R('deps', 'mutate', 'dart', (a) => is(a, 'dart', 'pub', 'get')),
  R('deps', 'mutate', 'npm', (a) => is(a, 'npm', 'ci')),
  R('deps', 'mutate', null, (a) => JS_PM.has(a[0]) && (a[1] === 'install' || a[1] === 'i') && bare(a, 2) && !flag(a, '-g', '--global')),
  R('deps', 'mutate', 'go', (a) => is(a, 'go', 'mod', 'download')),

  // fix: `dart fix` with no flag only PREVIEWS; `go fix` always rewrites.
  R('fix', 'check', 'go', (a) => is(a, 'go', 'fix') && flag(a, '-diff')),
  R('fix', 'apply', 'go', (a) => is(a, 'go', 'fix')),
  R('fix', 'apply', 'dart', (a) => is(a, 'dart', 'fix') && flag(a, '--apply')),
  R('fix', 'check', 'dart', (a) => is(a, 'dart', 'fix')),

  // outdated: informational. `dart pub outdated` exits 0 whatever it finds.
  R('outdated', 'check', 'dart', (a) => (a[0] === 'dart' || a[0] === 'flutter') && a[1] === 'pub' && a[2] === 'outdated', { weak: ['never-fails'] }),
  R('outdated', 'check', null, (a) => JS_PM.has(a[0]) && a[1] === 'outdated'),
];

// ─── Weak markers ─────────────────────────────────────────────────────────────
//
// Things that make a gate look strict but not fail. The id is what the report prints: the flag
// itself for a flag, `|| true` for a swallowed exit code, `never-fails` for a command whose exit
// status ignores what it found. `test(argv, text)` sees the first pipeline stage's argv and the full text.

const WEAK_MARKERS = [
  { id: '--no-fatal-infos', test: (a) => flag(a, '--no-fatal-infos') },
  { id: '--no-fatal-warnings', test: (a) => flag(a, '--no-fatal-warnings') },
  {
    id: '--issues-exit-code=0',
    test: (a) => a.includes('--issues-exit-code=0') || a.some((x, i) => x === '--issues-exit-code' && a[i + 1] === '0'),
  },
  { id: '|| true', test: (_a, text) => /\|\|\s*(?:true\b|:(?=\s|$)|exit\s+0\b)/.test(text) },
  { id: '-no-fail', test: (a) => flag(a, '-no-fail', '--no-fail') },
  { id: '--exit-zero', test: (a) => flag(a, '--exit-zero') },
];

// ─── Uses map ─────────────────────────────────────────────────────────────────
//
// A `uses:` step proves a lint / audit / sast step EXISTS but gives no command: the report uses it,
// the drafter never turns it into a `run`. `key: null` with `role: 'setup'` is toolchain setup.

const USES_MAP = [
  { prefix: 'golangci/golangci-lint-action', key: 'lint', role: 'check' },
  { prefix: 'golang/govulncheck-action', key: 'audit', role: 'check' },
  { prefix: 'securego/gosec', key: 'sast', role: 'check' },
  { prefix: 'github/codeql-action', key: 'sast', role: 'check' },
  { prefix: 'bufbuild/buf-action', key: 'lint', role: 'check', note: 'proto' },
  { prefix: 'actions/setup-go', key: null, role: 'setup' },
  { prefix: 'actions/setup-node', key: null, role: 'setup' },
  { prefix: 'actions/setup-python', key: null, role: 'setup' },
  { prefix: 'actions/setup-java', key: null, role: 'setup' },
  { prefix: 'subosito/flutter-action', key: null, role: 'setup' },
  { prefix: 'dart-lang/setup-dart', key: null, role: 'setup' },
];

/** lookupUses(ref) -> the USES_MAP entry for `owner/repo[/path][@ref]`, or null. `@ref` is ignored. */
function lookupUses(ref) {
  if (typeof ref !== 'string') return null;
  const base = ref.trim().split('@')[0];
  if (!base || base.startsWith('.') || base.startsWith('docker:')) return null;
  for (const entry of USES_MAP) {
    if (base === entry.prefix || base.startsWith(`${entry.prefix}/`)) return entry;
  }
  return null;
}

/** classifyUses(ref) -> a key, or null (unknown action, or setup-only). */
function classifyUses(ref) {
  const entry = lookupUses(ref);
  return entry ? entry.key : null;
}

// ─── Unwrapping ───────────────────────────────────────────────────────────────
//
// `npx playwright test`, `pnpm exec eslint .`, `python -m pytest`, `dart run build_runner build`,
// `go run github.com/x/y/cmd/gosec@latest ./...`: the tool that matters is the one being RUN.

const BIN_WRAP = new Set(['playwright', 'cypress', 'eslint', 'jest', 'vitest', 'prettier', 'tsc', 'mypy', 'pyright', 'ruff']);

function skipLeadingFlags(a) {
  let i = 0;
  while (i < a.length && a[i].startsWith('-')) {
    const takesValue = a[i] === '-p' || a[i] === '--package';
    i += takesValue ? 2 : 1;
  }
  return a.slice(i);
}

function toolFromModule(ref) {
  const parts = ref.split('@')[0].split('/').filter(Boolean);
  let last = parts.pop() || '';
  if (/^v\d+$/.test(last) && parts.length) last = parts.pop();
  return last;
}

const isModuleRef = (x) => typeof x === 'string' && x.includes('/') && !/^[./~]/.test(x) && !x.endsWith('.go');

function unwrap(argv) {
  let a = argv;
  for (let guard = 0; guard < 4 && a.length; guard++) {
    const t = a[0];
    let next = null;
    if (t === 'npx' || t === 'bunx') next = skipLeadingFlags(a.slice(1));
    else if (JS_PM.has(t) && (a[1] === 'exec' || a[1] === 'dlx' || a[1] === 'x')) next = skipLeadingFlags(a.slice(2));
    else if ((t === 'pnpm' || t === 'yarn') && BIN_WRAP.has(a[1])) next = a.slice(1);
    else if ((t === 'python' || t === 'python3') && a[1] === '-m') next = a.slice(2);
    else if ((t === 'poetry' || t === 'uv' || t === 'pipenv') && a[1] === 'run') next = a.slice(2);
    else if (t === 'go' && a[1] === 'run' && isModuleRef(a[2])) next = [toolFromModule(a[2]), ...a.slice(3)];
    else if (t === 'dart' && a[1] === 'run' && a[2]) next = a.slice(2);
    else if ((t === 'dart' || t === 'flutter') && a[1] === 'pub' && a[2] === 'run') next = a.slice(3);
    if (!next || !next.length) break;
    a = next;
  }
  return a;
}

// ─── Opaque wrappers and hints ────────────────────────────────────────────────

const OPAQUE_TOOLS = new Set(['bash', 'sh', 'zsh', 'dash', 'make', 'gmake', 'just', 'task', 'ninja']);

/** A command whose tool cannot be read from its text: a script path, a shell, a task runner. */
function isOpaque(argv) {
  const t = argv[0];
  if (!t) return false;
  if (OPAQUE_TOOLS.has(t)) return true;
  if (/\.(?:sh|bash)$/.test(t)) return true;
  if (/^(?:\.\.?\/|\/|~)/.test(t)) return true;
  if (JS_PM.has(t) && (argv[1] === 'run' || argv[1] === 'run-script')) return true;
  return false;
}

// Ordered: a more specific meaning outranks a general one (`test-e2e` is e2e, `lint-helm` is lint_helm).
const HINT_TOKENS = [
  ['e2e', 'check', ['e2e', 'playwright', 'cypress', 'maestro', 'patrol']],
  ['audit', 'check', ['audit', 'vuln', 'vulns', 'vulncheck', 'govulncheck']],
  ['sast', 'check', ['sast', 'gosec', 'semgrep', 'codeql']],
  ['lint_helm', 'check', ['helm', 'kubeconform']],
  ['lint_docker', 'check', ['hadolint', 'dockerlint']],
  ['typecheck', 'check', ['typecheck', 'tsc', 'mypy', 'pyright']],
  ['lint', 'check', ['lint', 'linter', 'vet', 'analyze', 'analyse', 'staticcheck', 'eslint', 'clippy']],
  ['format', 'apply', ['fmt', 'format', 'gofmt', 'gofumpt', 'goimports', 'prettier']],
  ['test', 'check', ['test', 'tests', 'unit', 'pytest', 'jest', 'vitest', 'ginkgo', 'spec', 'specs', 'selftest', 'selftests']],
  ['build', 'build', ['build', 'compile']],
  ['codegen', 'mutate', ['generate', 'codegen', 'gen']],
  ['tidy', 'apply', ['tidy']],
  ['deps', 'mutate', ['deps', 'install', 'bootstrap']],
  ['fix', 'apply', ['fix']],
];

// A name that pairs an ENVIRONMENT token with a SCENARIO token (`e2e-stack-up`, `integration-env-up`,
// `e2e:seed`) brings a scenario's environment up; it is not the scenario suite, and never `test` or
// `build` (TRD 43-04, D4). Whole tokens only: `setup` is not `up`, `restart` is not `start`.
const ENV_TOKENS = Object.freeze(['up', 'down', 'stack', 'env', 'seed', 'infra', 'cluster', 'compose', 'start', 'stop']);
const SCENARIO_TOKENS = Object.freeze(['e2e', 'integration', 'scenario']);

// A check or apply SUFFIX in a name names the form of the key the rest of the name carries (TRD 43-06):
// `fmt-check`, `tidy-check`, `generate-check` are check forms; `lint-fix`, `lint:fix` is lint's apply.
// Only keys that HAVE that form take it: `build-check` is still a build, `test-fix` still a test.
const CHECK_SUFFIX_TOKENS = Object.freeze(['check', 'verify', 'diff']);
const APPLY_SUFFIX_TOKENS = Object.freeze(['fix', 'write', 'apply']);
const KEYS_WITH_CHECK_FORM = new Set(['format', 'tidy', 'codegen', 'fix']);
const KEYS_WITH_APPLY_FORM = new Set(['lint', 'format', 'tidy', 'fix']);

function hintForm(key, form, tokens) {
  // `fmt-lint` has always meant the checking format target.
  if (key === 'format' && tokens.includes('lint')) return 'check';
  if (KEYS_WITH_CHECK_FORM.has(key) && tokens.some((t) => CHECK_SUFFIX_TOKENS.includes(t))) return 'check';
  if (key !== 'fix' && KEYS_WITH_APPLY_FORM.has(key) && tokens.some((t) => APPLY_SUFFIX_TOKENS.includes(t))) return 'apply';
  return form;
}

/**
 * checkFormByName(key, form, name) -> form (TRD 43-09). hintForm for a key the BODY decided: a writer
 * (apply / mutate) under a name carrying a check suffix (`schema-verify` running `go generate`) is the
 * key's check form when the key has one (format, tidy, codegen, fix). Any other form, or a name with
 * no check suffix, is returned unchanged.
 */
function checkFormByName(key, form, name) {
  if (form !== 'apply' && form !== 'mutate') return form;
  const tokens = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokens.some((t) => CHECK_SUFFIX_TOKENS.includes(t))) return form;
  return hintForm(key, form, tokens);
}

// ─── drift checks as real recipes write them (TRD 43-09) ─────────────────────
//
// Two shapes fail on drift without `git diff --exit-code`, and neither normalises to an invocation a
// table row could read (an assignment, an `if`, an `exit`; a bare `diff`), so they are read from the
// RAW recipe or script text. A Makefile recipe carries `$$` where the shell sees `$`: every pattern
// accepts both.
//   captured  `X=$(git diff …)` (or backticks, or inline in the test), tested with `-n` / `-z`, then
//             a failing exit
//   snapshot  `diff` / `cmp` (flags -q -u -s -r or none) of a copy under a mktemp or snapshot dir
//             against the in-tree file, then a failing exit
// A failing exit is `exit <non-zero>`, `exit $rc`, or the `false` command. Without one, the recipe only
// SHOWS a diff (`… || true`, an echo) and is not a check.

const DOLLAR = '\\$\\$?';
const GIT_DIFF = 'git(?:\\s+(?:-[Cc]\\s+\\S+|--?[A-Za-z][\\w-]*(?:=\\S+)?))*\\s+diff\\b';
const CAPTURED_GIT_DIFF = new RegExp(`${DOLLAR}\\(\\s*${GIT_DIFF}|\`\\s*${GIT_DIFF}`, 'g');
const NONEMPTY_TEST = /(?:\[\[?|\btest)\s+!?\s*-[nz]\s/;
const FAILING_EXIT = new RegExp(
  `\\bexit\\s+(?:0*[1-9]\\d*|${DOLLAR}\\{?[A-Za-z_?][A-Za-z0-9_]*\\}?)|(?:^|[;&|{(]|\\bthen|\\belse|\\bdo)\\s*false\\b`,
  'm',
);
const MKTEMP_VAR = new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)=["']?(?:${DOLLAR}\\(\\s*mktemp\\b|\`\\s*mktemp\\b)`, 'g');
const SNAPSHOT_VAR_NAME = /^(?:tmp|temp|tmpdir|tempdir|tmp_dir|temp_dir|snap|snapdir|snap_dir|snapshot|snapshots|snapshot_dir|scratch)$/i;
const SNAPSHOT_SEGMENT = /^\.?snap(?:shot)?s?$/i;
const DIFF_OPERAND = '("[^"]*"|\'[^\']*\'|[^\\s;&|<>()]+)';
const SNAPSHOT_DIFF = new RegExp(
  `(?:^|[\\s;&|(!{])((?:diff|cmp)(?:\\s+(?:-[qusr]+|--(?:brief|quiet|silent|recursive|unified(?:=\\d+)?)))*)\\s+${DIFF_OPERAND}\\s+${DIFF_OPERAND}`,
  'g',
);
// Where a statement starts: just after the last separator before a position (`;`, `&&`, `||`, `|`,
// a newline). Quote-unaware on purpose: it only decides how much text precedes the check.
const SEPARATOR = /;|&&|\|\||\||\n/g;

function statementStart(text, at) {
  let start = 0;
  SEPARATOR.lastIndex = 0;
  let m;
  while ((m = SEPARATOR.exec(text)) !== null && m.index < at) start = m.index + m[0].length;
  return start;
}

const unquote = (w) => (/^(["']).*\1$/.test(w) ? w.slice(1, -1) : w);

/** `$snap/x`, `$$tmp/x`, `${TMPDIR}/x`, `/tmp/x` or `…/.snapshots/x`, given the mktemp-assigned names. */
function isSnapshotPath(word, mktempVars) {
  const p = unquote(word);
  const v = new RegExp(`^${DOLLAR}\\{?([A-Za-z_][A-Za-z0-9_]*)\\}?/`).exec(p);
  if (v) return mktempVars.has(v[1]) || SNAPSHOT_VAR_NAME.test(v[1]);
  if (/^\/tmp\//.test(p)) return true;
  return p.split('/').slice(0, -1).some((seg) => SNAPSHOT_SEGMENT.test(seg));
}

const isInTreePath = (word) => {
  const p = unquote(word);
  return p !== '-' && !p.startsWith('$') && !p.startsWith('/') && !p.startsWith('-');
};

/**
 * driftCheckAt(text) -> the offset where the drift-check STATEMENT starts in a raw recipe or script
 * text, or -1 (TRD 43-09). Recognises the captured-`git diff` and snapshot-`diff` shapes above; the
 * caller reads what runs before that offset for the writer. `git diff --exit-code` is isDriftCheck's
 * job on normalised invocations and is not repeated here.
 */
function driftCheckAt(text) {
  const t = typeof text === 'string' ? text : '';
  if (!t.trim()) return -1;
  const failsAfter = (pos) => FAILING_EXIT.test(t.slice(pos));

  let best = -1;
  CAPTURED_GIT_DIFF.lastIndex = 0;
  let m;
  while ((m = CAPTURED_GIT_DIFF.exec(t)) !== null) {
    if (NONEMPTY_TEST.test(t) && failsAfter(m.index)) {
      best = m.index;
      break;
    }
  }

  const mktempVars = new Set();
  MKTEMP_VAR.lastIndex = 0;
  while ((m = MKTEMP_VAR.exec(t)) !== null) mktempVars.add(m[1]);
  SNAPSHOT_DIFF.lastIndex = 0;
  while ((m = SNAPSHOT_DIFF.exec(t)) !== null) {
    const at = m.index + m[0].indexOf(m[1]);
    if (best !== -1 && at >= best) break;
    const [a, b] = [m[2], m[3]];
    const oneSnapshot = (isSnapshotPath(a, mktempVars) && isInTreePath(b)) || (isSnapshotPath(b, mktempVars) && isInTreePath(a));
    if (oneSnapshot && failsAfter(at)) {
      best = at;
      break;
    }
  }
  return best === -1 ? -1 : statementStart(t, best);
}

/**
 * isDriftCheck(inv) -> true for `git diff --exit-code` / `git diff --quiet` (any paths after): the
 * command a `<x>-check` target runs after regenerating, failing when the tree changed (TRD 43-06).
 * A raw TEXT (a string) is also a drift check when it holds a captured or snapshot diff that fails
 * (driftCheckAt, TRD 43-09).
 */
function isDriftCheck(inv) {
  for (const c of toInvocations(inv)) {
    let a = firstStage(c.argv);
    if (a[0] !== 'git') continue;
    a = a.slice(1);
    while (a.length && a[0].startsWith('-')) a = a.slice(1); // `git --no-pager diff`
    if (a[0] === 'diff' && a.some((x) => x === '--exit-code' || x === '--quiet')) return true;
  }
  return typeof inv === 'string' && driftCheckAt(inv) !== -1;
}

/** What a target / script NAME says the command does. Always low confidence; null when it says nothing. */
function classifyHint(hint) {
  const h = typeof hint === 'string' ? hint.trim() : '';
  if (!h) return null;
  // The hint may itself be a tool name (`govulncheck`): read it as a command first.
  const viaTable = classifyText(h);
  if (viaTable) return { ...viaTable, confidence: 'low' };
  const tokens = h.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((t) => ENV_TOKENS.includes(t)) && tokens.some((t) => SCENARIO_TOKENS.includes(t))) {
    return { key: 'e2e_env', form: 'check', tool: null, weak: [], confidence: 'low' };
  }
  for (const [key, form, names] of HINT_TOKENS) {
    if (tokens.some((t) => names.includes(t))) {
      // `fmt-check` / `tidy-verify` describe the checking form, `lint-fix` the applying one.
      return { key, form: hintForm(key, form, tokens), tool: null, weak: [], confidence: 'low' };
    }
  }
  return null;
}

// ─── Classification ───────────────────────────────────────────────────────────

const basename = (t) => String(t).split('/').pop();

/** The first pipeline stage: `a | b`, `a || b`, `a && b` and `a ; b` are judged by `a`. */
function firstStage(argv) {
  const cut = argv.findIndex((x) => x === '|' || x === '||' || x === '&&' || x === ';');
  return cut === -1 ? argv : argv.slice(0, cut);
}

function collectWeak(stage, text, row, piped) {
  const weak = [];
  for (const m of WEAK_MARKERS) if (m.test(stage, text)) weak.push(m.id);
  for (const w of row.weak || []) if (!weak.includes(w)) weak.push(w);
  // A piped `gofmt -l . | grep .` is the author composing an exit condition; do not second-guess it.
  return piped ? weak.filter((w) => w !== 'never-fails') : weak;
}

/** Table-only classification of one invocation: high confidence, or null. */
function classifyArgv(argv, text) {
  const cut = firstStage(argv);
  const stage = unwrap(cut);
  const piped = cut.length < argv.length && argv[cut.length] === '|';
  for (const row of CLASSIFY_TABLE) {
    const hit = row.match ? row.match(stage, text) : row.re.test(stage.join(' '));
    if (!hit) continue;
    return {
      key: row.key,
      form: row.form,
      tool: row.tool || basename(stage[0]),
      weak: collectWeak(stage, text, row, piped),
      confidence: 'high',
    };
  }
  return null;
}

// The text of the first `$( … )` (or backtick) command substitution, balanced, quote-unaware.
function innerSubstitution(text) {
  const i = text.indexOf('$(');
  if (i !== -1) {
    let depth = 0;
    for (let k = i + 1; k < text.length; k++) {
      if (text[k] === '(') depth++;
      else if (text[k] === ')') {
        depth--;
        if (depth === 0) return text.slice(i + 2, k);
      }
    }
    return text.slice(i + 2);
  }
  const m = /`([^`]*)`/.exec(text);
  return m ? m[1] : null;
}

/** `test -z "$(gofmt -l .)"` / `[ -z "$(…)" ]`: the gate is the command inside; the wrapper makes it fail. */
function classifyWrapped(text) {
  const inner = innerSubstitution(text);
  if (inner == null) return null;
  const found = classifyText(inner);
  if (!found) return null;
  return { ...found, weak: found.weak.filter((w) => w !== 'never-fails') };
}

function classifyOne({ text, argv }, hint) {
  const tool = argv[0];
  if (tool === 'test' || tool === '[' || tool === '[[') return classifyWrapped(text);
  const hit = classifyArgv(argv, text);
  if (hit) return hit;
  if (hint && isOpaque(unwrap(firstStage(argv)))) return classifyHint(hint);
  return null;
}

/** An invocation object (`{ text, argv? }`) or a shell string -> [{ text, argv }]. Strings are normalised. */
function toInvocations(inv) {
  if (typeof inv === 'string') {
    try {
      return normalizeScript(inv).map((i) => ({ text: i.text, argv: i.argv }));
    } catch (_) {
      return [];
    }
  }
  if (inv && typeof inv === 'object' && !Array.isArray(inv) && typeof inv.text === 'string') {
    const text = inv.text.trim();
    if (!text || isFragment(text)) return [];
    const argv = Array.isArray(inv.argv) && inv.argv.length ? inv.argv.map(String) : splitWords(text);
    return argv.length ? [{ text, argv }] : [];
  }
  return [];
}

// Table-only, no hint: used for hints that are themselves tool names and for `$( )` contents.
function classifyText(text) {
  for (const c of toInvocations(text)) {
    const r = classifyOne(c, null);
    if (r) return r;
  }
  return null;
}

/**
 * classifyInvocation(inv, { hint } = {}) -> { key, form, tool, weak, confidence } | null
 *
 * `inv` is a normalised invocation from stack-shell / stack-ci (`{ text, argv, … }`) or a shell
 * string (normalised here; the first classifiable command wins). Returns null for anything that is
 * not a recognised gate: a comment, an `echo`, `test -f`, a flag fragment, an unknown tool.
 *
 * `weak` lists reasons the command looks stricter than it is (see WEAK_MARKERS). `confidence` is
 * `high` for a table hit and `low` for a result that came only from `hint` on an opaque wrapper.
 */
function classifyInvocation(inv, { hint } = {}) {
  for (const candidate of toInvocations(inv)) {
    const result = classifyOne(candidate, hint);
    if (result) return result;
  }
  return null;
}

// ─── Test breadth (TRD 42-13) ─────────────────────────────────────────────────
//
// The repo-wide `test` must run the whole suite. `go test -c -o /tmp/x.test ./tests/x/` compiles
// one package and runs nothing; `go test -run TestX ./...` runs one test; `-tags=integration`
// selects the integration suite; `go test ./tests/x/` tests one package. testBreadth reads a test
// runner's OWN flags and positional paths, per tool, from the TEST_BREADTH data below, and says
// whether the invocation is broad or narrow and why. It never judges `-short`, `-race`, `-count`,
// `-v`, `-timeout` or a coverage flag: those change how the suite runs, not how much of it.
//
//   spec = {
//     value        flags that take a separate value (`-run X`), so X is not read as a path
//     compileOnly  flags that build the test binary and run nothing            -> compile-only
//     runFilter    flags that select tests by name                             -> run-filter
//     tags         flags that name tags; tagMode 'suite' (go build tags ADD files, so only an
//                  integration/e2e tag narrows) or 'filter' (a selection; narrows unless `not …`)
//     pathFlags    flags that restrict to one package/path                     -> single-path
//     positional   'path' (a package/dir/file) or 'filter' (cargo: a test-name filter)
//     defaults     positional values that mean the whole suite (`./...`, `.`, dart's `test/`)
//     skip         leading subcommands that are not paths (vitest run)
//     stopAt       tokens after which the rest belongs to the test binary (go -args, cargo --)
//     norm         flag-name normaliser (go accepts -flag and --flag alike)
//   }
//
// A positional that is a template or variable (`{{args}}`, `$(PKGS)`) is pass-through and never
// narrows. Any other positional that is not a `defaults` entry narrows: a package, a file, or a
// sub-tree (`./pkg/x/...` is one package tree, not the repo). A path segment that names an
// e2e/integration suite (`./e2e/...`) narrows as `suite-path`, and sets `fitsKey`.

const GO_SPEC = Object.freeze({
  value: new Set([
    '-run', '-skip', '-o', '-tags', '-timeout', '-count', '-coverprofile', '-covermode', '-coverpkg',
    '-cpu', '-parallel', '-bench', '-benchtime', '-p', '-exec', '-ldflags', '-gcflags', '-asmflags',
    '-mod', '-modfile', '-overlay', '-pkgdir', '-toolexec', '-outputdir', '-blockprofile',
    '-blockprofilerate', '-cpuprofile', '-memprofile', '-memprofilerate', '-mutexprofile',
    '-mutexprofilefraction', '-trace', '-shuffle', '-fuzz', '-fuzztime', '-fuzzminimizetime', '-list',
    '-vet', '-buildmode', '-compiler', '-installsuffix', '-C',
  ]),
  compileOnly: new Set(['-c', '-o']),
  runFilter: new Set(['-run']),
  tags: new Set(['-tags']),
  tagMode: 'suite',
  pathFlags: new Set(),
  positional: 'path',
  defaults: new Set(['', '.', './', './...', '...']),
  skip: new Set(),
  stopAt: new Set(['-args']),
  norm: (f) => f.replace(/^--/, '-'),
});

const DART_SPEC = Object.freeze({
  value: new Set([
    '--name', '-n', '--plain-name', '-N', '--tags', '-t', '--exclude-tags', '-x', '--platform', '-p',
    '--preset', '-P', '--concurrency', '-j', '--total-shards', '--shard-index', '--timeout',
    '--reporter', '-r', '--file-reporter', '--coverage-path', '--test-randomize-ordering-seed',
    '-d', '--device-id', '--dart-define', '--dart-define-from-file', '--flavor', '--compiler',
  ]),
  compileOnly: new Set(),
  runFilter: new Set(['--name', '-n', '--plain-name', '-N']),
  tags: new Set(['--tags', '-t']),
  tagMode: 'filter',
  pathFlags: new Set(),
  positional: 'path',
  defaults: new Set(['', '.', './', 'test', 'test/', './test', './test/']),
  skip: new Set(),
  stopAt: new Set(),
  norm: (f) => f,
});

const JS_SPEC = Object.freeze({
  value: new Set([
    '-t', '--testNamePattern', '-c', '--config', '--testPathPattern', '--testPathIgnorePatterns',
    '--maxWorkers', '-w', '--coverageDirectory', '--reporters', '--reporter', '--selectProjects',
    '--shard', '--testTimeout', '--rootDir', '--roots', '--root', '-r', '--dir', '--project',
    '--outputFile', '--environment', '--pool', '--mode',
  ]),
  compileOnly: new Set(),
  runFilter: new Set(['-t', '--testNamePattern']),
  tags: new Set(),
  tagMode: 'filter',
  pathFlags: new Set(['--testPathPattern']),
  positional: 'path',
  defaults: new Set(['', '.', './']),
  skip: new Set(['run', 'watch', 'dev']),
  stopAt: new Set(),
  norm: (f) => f,
});

const PYTEST_SPEC = Object.freeze({
  value: new Set([
    '-k', '-m', '-c', '-p', '-o', '-n', '--rootdir', '--maxfail', '--junitxml', '--junit-xml', '--cov',
    '--cov-report', '--tb', '--durations', '--basetemp', '--deselect', '--ignore', '--ignore-glob',
    '--confcutdir', '--log-level', '--timeout',
  ]),
  compileOnly: new Set(),
  runFilter: new Set(['-k']),
  tags: new Set(['-m']),
  tagMode: 'filter',
  pathFlags: new Set(),
  positional: 'path',
  defaults: new Set(['', '.', './', 'test', 'test/', 'tests', 'tests/', './tests', './tests/']),
  skip: new Set(),
  stopAt: new Set(),
  norm: (f) => f,
});

const CARGO_SPEC = Object.freeze({
  value: new Set([
    '-p', '--package', '--test', '--bench', '--example', '--bin', '--features', '-F', '--target', '-j',
    '--jobs', '--manifest-path', '--profile', '--target-dir', '--exclude', '--color', '-Z',
  ]),
  compileOnly: new Set(['--no-run']),
  runFilter: new Set(),
  tags: new Set(),
  tagMode: 'filter',
  pathFlags: new Set(['-p', '--package', '--test']),
  positional: 'filter',
  defaults: new Set(['']),
  skip: new Set(),
  stopAt: new Set(['--']),
  norm: (f) => f,
});

const GINKGO_SPEC = Object.freeze({
  value: new Set([
    '--focus', '-focus', '--focus-file', '--skip', '-skip', '--skip-file', '--label-filter', '--procs',
    '--timeout', '--output-dir', '--junit-report', '--json-report', '--coverprofile', '--tags',
  ]),
  compileOnly: new Set(['build']),
  runFilter: new Set(['--focus', '-focus', '--focus-file', '--label-filter']),
  tags: new Set(['--tags']),
  tagMode: 'suite',
  pathFlags: new Set(),
  positional: 'path',
  defaults: new Set(['', '.', './', './...', '...']),
  skip: new Set(['run']),
  stopAt: new Set(['--']),
  norm: (f) => f,
});

/** Args after `--` (gotestsum hands them to go test); null when there are none: gotestsum runs ./... */
function afterDashDash(a) {
  const i = a.indexOf('--');
  return i === -1 ? null : a.slice(i + 1);
}

const TEST_BREADTH = [
  { tool: 'go', match: (a) => is(a, 'go', 'test'), args: (a) => a.slice(2), spec: GO_SPEC },
  { tool: 'gotestsum', match: (a) => a[0] === 'gotestsum', args: afterDashDash, spec: GO_SPEC },
  { tool: 'dart', match: (a) => is(a, 'dart', 'test'), args: (a) => a.slice(2), spec: DART_SPEC },
  { tool: 'flutter', match: (a) => is(a, 'flutter', 'test'), args: (a) => a.slice(2), spec: DART_SPEC },
  {
    tool: null,
    match: (a) => JS_PM.has(a[0]) && (a[1] === 'test' || a[1] === 't' || (a[1] === 'run' && a[2] === 'test')),
    args: (a) => a.slice(a[1] === 'run' ? 3 : 2),
    spec: JS_SPEC,
  },
  { tool: 'jest', match: (a) => a[0] === 'jest', args: (a) => a.slice(1), spec: JS_SPEC },
  { tool: 'vitest', match: (a) => a[0] === 'vitest', args: (a) => a.slice(1), spec: JS_SPEC },
  { tool: 'pytest', match: (a) => a[0] === 'pytest', args: (a) => a.slice(1), spec: PYTEST_SPEC },
  { tool: 'cargo', match: (a) => is(a, 'cargo', 'test'), args: (a) => a.slice(2), spec: CARGO_SPEC },
  { tool: 'ginkgo', match: (a) => a[0] === 'ginkgo', args: (a) => a.slice(1), spec: GINKGO_SPEC },
];

/** Why a test invocation is narrow, most decisive first, with the words a note prints. */
const BREADTH_REASONS = Object.freeze({
  'compile-only': 'builds the test binary and runs no test',
  'run-filter': 'runs only the tests a name filter selects',
  tag: 'selects a tagged suite, not the whole one',
  'suite-path': 'runs an integration/e2e suite path',
  'single-path': 'tests one package or path, not the whole repo',
});
const REASON_ORDER = Object.keys(BREADTH_REASONS);

/** A path segment or tag that names an e2e / integration suite. `integration_test` is Flutter's e2e dir. */
function suiteOf(token) {
  const t = String(token).toLowerCase();
  if (t === 'integration_test') return 'e2e';
  if (t === 'e2e' || /^e2e[-_]/.test(t) || /[-_]e2e$/.test(t)) return 'e2e';
  if (t === 'integration' || /^integration[-_]/.test(t) || /[-_]integration$/.test(t)) return 'integration';
  return null;
}

function suiteOfPath(p) {
  for (const seg of String(p).split('/')) {
    const s = suiteOf(seg);
    if (s) return s;
  }
  return null;
}

function suiteOfTags(value) {
  for (const t of String(value || '').split(/[,\s]+/)) {
    const s = suiteOf(t);
    if (s) return s;
  }
  return null;
}

/** Split test-runner args into `{ flags: [{ name, value }], positional: [] }` by the spec. */
function parseTestArgs(args, spec) {
  const flags = [];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const x = String(args[i]);
    if (spec.stopAt.has(x)) break;
    if (x === '--') continue;
    if (x.startsWith('-') && x !== '-') {
      const eq = x.indexOf('=');
      const name = spec.norm(eq === -1 ? x : x.slice(0, eq));
      let value = eq === -1 ? null : x.slice(eq + 1);
      if (value === null && spec.value.has(name) && i + 1 < args.length) value = String(args[++i]);
      flags.push({ name, value });
    } else {
      positional.push(x);
    }
  }
  while (positional.length && spec.skip.has(positional[0])) positional.shift();
  return { flags, positional };
}

/** `{ breadth, reason, fitsKey, detail }` for one tool's args (see the section header). */
function judgeBreadth(args, spec) {
  const { flags, positional } = parseTestArgs(args, spec);
  const reasons = new Set();
  let fits = null;
  const hint = (s) => { if (s && !fits) fits = s; };

  for (const f of flags) {
    if (spec.compileOnly.has(f.name)) reasons.add('compile-only');
    if (spec.runFilter.has(f.name)) reasons.add('run-filter');
    if (spec.pathFlags.has(f.name)) {
      reasons.add('single-path');
      hint(suiteOfPath(f.value || ''));
    }
    if (spec.tags.has(f.name)) {
      const suite = suiteOfTags(f.value);
      if (spec.tagMode === 'suite') {
        if (suite) {
          reasons.add('tag');
          hint(suite);
        }
      } else if (!/^\s*not\b/.test(String(f.value || ''))) {
        reasons.add('tag');
        hint(suite);
      }
    }
  }
  if (spec.compileOnly.has(positional[0])) { // `ginkgo build`
    reasons.add('compile-only');
    positional.shift();
  }
  for (const p of positional) {
    if (/\{\{|\$/.test(p)) continue; // pass-through args: a template or a variable
    if (spec.positional === 'filter') {
      reasons.add('run-filter');
      continue;
    }
    const suite = suiteOfPath(p);
    if (suite) {
      reasons.add('suite-path');
      hint(suite);
      continue;
    }
    if (spec.defaults.has(p)) continue;
    reasons.add('single-path'); // a package, a file, or a sub-tree (`./pkg/x/...`): not the repo
  }

  const reason = REASON_ORDER.find((r) => reasons.has(r)) || null;
  if (!reason) return { breadth: 'broad', reason: null, fitsKey: 'test', detail: 'runs the whole suite' };
  return { breadth: 'narrow', reason, fitsKey: fits || 'test', detail: `${reason}: ${BREADTH_REASONS[reason]}` };
}

/**
 * testBreadth(inv) -> { breadth: 'broad'|'narrow', reason, fitsKey, detail, tool } | null
 *
 * `inv` is a normalised invocation (`{ text, argv? }`) or a shell string; the first invocation
 * that runs a known test runner decides. null when nothing in it is a test runner (a build, a
 * `make test` wrapper whose body is elsewhere, an echo). `reason` is null for a broad invocation,
 * else compile-only | run-filter | tag | suite-path | single-path (most decisive wins).
 * `fitsKey` is `e2e` / `integration` when a tag or path names that suite, else `test`: where a
 * narrow candidate belongs, for a note (the drafter never emits a new key from it).
 */
function testBreadth(inv) {
  for (const c of toInvocations(inv)) {
    const stage = unwrap(firstStage(c.argv));
    for (const row of TEST_BREADTH) {
      if (!row.match(stage)) continue;
      const args = row.args(stage);
      const judged = judgeBreadth(Array.isArray(args) ? args : [], row.spec);
      return { ...judged, tool: row.tool || basename(stage[0]) };
    }
  }
  return null;
}

// ─── Tool stack (TRD 42-15, D3) ───────────────────────────────────────────────
//
// Which language / ecosystem a command's TOOL belongs to, so stack-draft can ask "does this root
// candidate run the extends tier's stack?" without naming a tool itself. Data, keyed on the tool
// binary (the same families CLASSIFY_TABLE rows name). A wrapper that is itself stack-typed
// (`npx`, `python -m`, `go run`, `dart run`) needs no unwrapping: the wrapper IS the stack. An
// opaque tool (a script path, a shell, make/task/just) is null: its BODY decides, never its name.

const TOOL_STACKS = Object.freeze({
  go: ['go', 'gofmt', 'gofumpt', 'goimports', 'golangci-lint', 'staticcheck', 'govulncheck', 'gosec', 'gotestsum', 'ginkgo', 'gopls', 'templ'],
  dart: ['dart', 'build_runner'],
  flutter: ['flutter', 'patrol', 'fvm'],
  node: ['node', 'npm', 'pnpm', 'yarn', 'bun', 'npx', 'bunx', 'vitest', 'jest', 'eslint', 'prettier', 'tsc', 'playwright', 'cypress', 'vite', 'tsx'],
  rust: ['cargo', 'rustc', 'rustfmt'],
  python: ['python', 'python3', 'pytest', 'ruff', 'mypy', 'pyright', 'pip', 'pip3', 'pip-audit', 'poetry', 'uv', 'pipenv', 'black', 'flake8', 'tox'],
  helm: ['helm', 'kubeconform'],
  docker: ['docker', 'hadolint', 'podman'],
  // Language-neutral generators: they emit code for whichever stack the repo is, so they belong
  // to none and stack-draft treats them as matching any tier (TRD 42-15 recovery).
  neutral: ['buf', 'protoc', 'sqlc'],
});

/** The toolStack of a language-neutral generator (TOOL_STACKS.neutral): matches any tier. */
const NEUTRAL_STACK = 'neutral';

const STACK_OF_TOOL = new Map();
for (const [stack, tools] of Object.entries(TOOL_STACKS)) for (const t of tools) STACK_OF_TOOL.set(t, stack);

/** The stack family each bundled tier-2 profile covers: a root command matches when its tool is in it. */
const TIER_STACKS = Object.freeze({
  go: Object.freeze(['go']),
  dart: Object.freeze(['dart']),
  flutter: Object.freeze(['dart', 'flutter']),
});

// A leading Taskfile / Helm template (`{{.GO_ENV_VARS}}`) or `VAR=val` expands to environment, not
// a tool; skip it to reach the tool it prefixes.
const LEADING_NOISE = /^(?:\{\{.*\}\}|[A-Za-z_][A-Za-z0-9_]*=.*)$/;

/**
 * toolStack(inv) -> 'go'|'dart'|'flutter'|'node'|'rust'|'python'|'helm'|'docker'|'neutral'|null
 *
 * `inv` is a normalised invocation (`{ text, argv? }`) or a shell string (the first invocation in
 * it decides). null for an opaque wrapper, an unknown tool, a fragment or non-string input.
 */
function toolStack(inv) {
  for (const c of toInvocations(inv)) {
    let i = 0;
    while (i < c.argv.length - 1 && LEADING_NOISE.test(c.argv[i])) i++;
    const tool = c.argv[i];
    if (!tool) continue;
    return STACK_OF_TOOL.get(basename(tool)) || null;
  }
  return null;
}

module.exports = {
  CLASSIFY_TABLE,
  TOOL_STACKS,
  TIER_STACKS,
  NEUTRAL_STACK,
  toolStack,
  classifyInvocation,
  classifyHint,
  isDriftCheck,
  driftCheckAt,
  checkFormByName,
  classifyUses,
  lookupUses,
  testBreadth,
  TEST_BREADTH,
  BREADTH_REASONS,
  WEAK_MARKERS,
  STANDARD_KEYS_EXT,
  USES_MAP,
};
