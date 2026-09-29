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
const STANDARD_KEYS_EXT = [...STANDARD_KEYS, 'sast', 'e2e', 'lint_helm', 'lint_docker', 'tidy', 'outdated'];

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

// ─── CLASSIFY_TABLE ───────────────────────────────────────────────────────────

const CLASSIFY_TABLE = [
  // e2e first: `playwright test`, `flutter test integration_test` and friends are never `test`.
  R('e2e', 'check', 'playwright', (a) => is(a, 'playwright', 'test')),
  R('e2e', 'check', 'cypress', (a) => is(a, 'cypress', 'run')),
  R('e2e', 'check', 'maestro', (a) => is(a, 'maestro', 'test')),
  R('e2e', 'check', 'patrol', (a) => is(a, 'patrol', 'test')),
  R('e2e', 'check', 'flutter', (a) => is(a, 'flutter', 'test') && a.some((x) => x.includes('integration_test'))),
  R('e2e', 'check', 'flutter', (a) => is(a, 'flutter', 'drive')),

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
  ['test', 'check', ['test', 'tests', 'unit', 'pytest', 'jest', 'vitest', 'ginkgo', 'spec', 'specs']],
  ['build', 'build', ['build', 'compile']],
  ['codegen', 'mutate', ['generate', 'codegen', 'gen']],
  ['tidy', 'apply', ['tidy']],
  ['deps', 'mutate', ['deps', 'install', 'bootstrap']],
  ['fix', 'apply', ['fix']],
];

/** What a target / script NAME says the command does. Always low confidence; null when it says nothing. */
function classifyHint(hint) {
  const h = typeof hint === 'string' ? hint.trim() : '';
  if (!h) return null;
  // The hint may itself be a tool name (`govulncheck`): read it as a command first.
  const viaTable = classifyText(h);
  if (viaTable) return { ...viaTable, confidence: 'low' };
  const tokens = h.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const [key, form, names] of HINT_TOKENS) {
    if (tokens.some((t) => names.includes(t))) {
      // `fmt-check` / `format-verify` describe the checking form.
      const checking = key === 'format' && tokens.some((t) => t === 'check' || t === 'verify' || t === 'lint');
      return { key, form: checking ? 'check' : form, tool: null, weak: [], confidence: 'low' };
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

module.exports = {
  CLASSIFY_TABLE,
  classifyInvocation,
  classifyUses,
  lookupUses,
  WEAK_MARKERS,
  STANDARD_KEYS_EXT,
  USES_MAP,
};
