'use strict';

// stack-report.cjs — CI/CD + local-testing recommendations: `stack report` (TRD 42-08, SDR-06).
//
// Compares what a repository's CI and task runners actually RUN against the stacks it contains,
// and writes the result as `.planning/STACK-REPORT.md`: proposals only. Nothing here edits a
// workflow, a runner file or STACK.md.
//
// Every source is first normalised into the same INVOCATION RECORDS (buildRecords):
//
//   { origin, scope, file, job?, target?, runner?, ciFile?, cwd, area, text, tool,
//     continueOnError, weakMarkers, scheduled }
//
//   origin          ci | runner | script — what produced the text
//   scope           ci (runs in CI, directly or through a runner target / wrapper script the CI
//                   step calls) | local (a runner target a developer can run)
//   file            the file the text came from (a workflow, a Makefile, a script)
//   job / ciFile    the CI job and workflow file (ci scope only)
//   target / runner the runner target and its runner (make | task | just | npm | script)
//   cwd             repo-relative directory the command runs in; null = the repo root
//   area            the longest detected language area dir (`svc/`) containing cwd; '' = root
//   text / tool     the logical invocation (stack-shell) and its first word; `uses:<owner/repo>`
//                   with tool `uses` for an action step
//   continueOnError the step (or job) sets `continue-on-error: true`
//   weakMarkers     why the command cannot fail: `--no-fatal-infos`, `|| true`, `bare gofmt -l`…
//   scheduled       the workflow has a `schedule:` trigger
//
// A CI step calling make / task / just / an npm script expands into the target body (depth <= 2,
// cycle guard keyed on runner|dir|name). A CI step running `./scripts/x.sh` or `bash x.sh` has
// the script's body read once. The checks (REPORT_CHECKS) are DATA over these records.

const fs = require('fs');
const path = require('path');
const { normalizeScript, splitWords } = require('./stack-shell.cjs');
const { WEAK_MARKERS } = require('./stack-classify.cjs');
const { parseWorkflows } = require('./stack-ci.cjs');
const { readRunners } = require('./stack-runners.cjs');
const { detectAreas } = require('./stack-detect.cjs');
const { describeInvocation } = require('./stack-verify.cjs');
const { mdCell } = require('./text-escape.cjs');

const RUNNER_MAX_DEPTH = 2;
const MAX_EXPAND_DEPTH = 2;
const MAX_SCRIPT_BYTES = 64 * 1024;
const GO_FMT_TOOLS = new Set(['gofmt', 'gofumpt', 'goimports']);

// ─── path helpers ─────────────────────────────────────────────────────────────

/** A clean repo-relative posix dir, or null for the root ('', '.', './'). */
function normDir(dir) {
  if (dir === null || dir === undefined) return null;
  const raw = String(dir).replace(/\\/g, '/');
  if (raw === '') return null;
  const norm = path.posix.normalize(raw).replace(/\/+$/, '');
  return norm === '.' || norm === '' ? null : norm;
}

/** `dir` joined onto `base` (both repo-relative); null = the root. */
function joinDir(base, dir) {
  const b = normDir(base);
  const d = dir === null || dir === undefined ? null : String(dir);
  if (!d) return b;
  if (path.posix.isAbsolute(d)) return normDir(d);
  return normDir(b ? path.posix.join(b, d) : d);
}

/** The longest language-area dir (`svc/`) that contains `cwd`; '' when none does. */
function areaFor(cwd, areaDirs) {
  const c = cwd ? `${cwd}/` : '';
  let best = '';
  for (const d of areaDirs) {
    if (d && c.startsWith(d) && d.length > best.length) best = d;
  }
  return best;
}

function languageAreaDirs(areas) {
  return (areas || []).filter((a) => a && Array.isArray(a.kinds) && a.kinds.length).map((a) => a.dir).filter(Boolean);
}

function safeAreas(root) {
  try {
    return detectAreas(root);
  } catch (_) {
    return [];
  }
}

function safeNormalize(text, cwd) {
  try {
    return normalizeScript(String(text), { cwd: cwd || null });
  } catch (_) {
    return [];
  }
}

function safeDescribe(inv) {
  try {
    return describeInvocation(inv);
  } catch (_) {
    return { kind: 'binary', tool: inv.tool };
  }
}

function readSmall(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > MAX_SCRIPT_BYTES) return null;
    return fs.readFileSync(abs, 'utf-8');
  } catch (_) {
    return null;
  }
}

// ─── weak markers ─────────────────────────────────────────────────────────────

/** The first pipeline stage: `a | b`, `a || b`, `a && b` and `a ; b` are judged by `a`. */
function firstStage(argv) {
  const cut = argv.findIndex((x) => x === '|' || x === '||' || x === '&&' || x === ';');
  return cut === -1 ? argv : argv.slice(0, cut);
}

/**
 * weakMarkersOf(inv) -> string[]. stack-classify's WEAK_MARKERS (flags and `|| true`), plus
 * `bare gofmt -l`: a `gofmt|gofumpt|goimports -l/-d` that is neither piped into an exit
 * condition nor wrapped in `test -z "$(…)"` lists files and exits 0.
 */
function weakMarkersOf(inv) {
  const text = String(inv.text || '');
  const argv = Array.isArray(inv.argv) && inv.argv.length ? inv.argv.map(String) : splitWords(text);
  if (!argv.length) return [];
  const stage = firstStage(argv);
  const out = [];
  for (const m of WEAK_MARKERS) {
    try {
      if (m.test(stage, text) && !out.includes(m.id)) out.push(m.id);
    } catch (_) {
      // a marker that cannot read this argv does not apply
    }
  }
  const tool = path.posix.basename(String(stage[0] || ''));
  const piped = stage.length < argv.length && argv[stage.length] === '|';
  if (GO_FMT_TOOLS.has(tool) && stage.some((a) => a === '-l' || a === '-d') && !stage.includes('-w') && !piped) {
    out.push('bare gofmt -l');
  }
  return out;
}

// ─── runner index ─────────────────────────────────────────────────────────────

function targetKey(runner, dir, name) {
  return `${runner}|${normDir(dir) || ''}|${name}`;
}

function buildRunnerIndex(targets) {
  const index = new Map();
  for (const t of targets) {
    if (t.runner === 'script') continue;
    for (const name of [t.name, ...(Array.isArray(t.aliases) ? t.aliases : [])]) {
      const k = targetKey(t.runner, t.dir, name);
      if (!index.has(k)) index.set(k, t);
    }
  }
  return index;
}

function targetBody(t) {
  return Array.isArray(t.body) ? t.body.join('\n') : String(t.body || '');
}

function targetCwd(t) {
  return normDir(t.cwd) || normDir(t.dir);
}

// ─── buildRecords ─────────────────────────────────────────────────────────────

/**
 * buildRecords(root, { areas }) -> invocation records (see the header), in source order: CI
 * steps (sorted workflow files, file order), each followed by its expansion; then every runner
 * target's body (local). `areas` is detectAreas output, read when not supplied. Never throws on
 * an unreadable or malformed file: stack-ci, stack-runners and stack-shell all tolerate them.
 */
function buildRecords(root, { areas = null } = {}) {
  const abs = path.resolve(String(root));
  const detected = Array.isArray(areas) ? areas : safeAreas(abs);
  const areaDirs = languageAreaDirs(detected);

  let targets = [];
  try {
    targets = readRunners(abs, { maxDepth: RUNNER_MAX_DEPTH });
  } catch (_) {
    targets = [];
  }
  const index = buildRunnerIndex(targets);
  const scriptCache = new Map();
  const records = [];

  const push = (base, fields, inv) => {
    const cwd = normDir(inv.cwd);
    records.push({
      ...base,
      ...fields,
      cwd,
      area: areaFor(cwd, areaDirs),
      text: String(inv.text),
      tool: String(inv.tool),
      weakMarkers: weakMarkersOf(inv),
    });
  };

  const readScript = (fileRel) => {
    if (!scriptCache.has(fileRel)) scriptCache.set(fileRel, readSmall(path.join(abs, fileRel)));
    return scriptCache.get(fileRel);
  };

  // One level (then a second) of expansion: a runner call into its target body, a wrapper
  // script into its file. `seen` guards cycles; scripts are read once and not expanded further.
  const expand = (inv, base, depth, seen, { runners = true } = {}) => {
    if (depth > MAX_EXPAND_DEPTH) return;
    const d = safeDescribe(inv);
    if (d.kind === 'runner' && runners) {
      if (d.unresolvable || d.info || !Array.isArray(d.names)) return;
      for (const name of d.names) {
        const k = targetKey(d.runner, d.dir, name);
        if (seen.has(k)) continue;
        const t = index.get(k);
        if (!t) continue;
        const nextSeen = new Set(seen).add(k);
        for (const sub of safeNormalize(targetBody(t), targetCwd(t))) {
          push(base, { origin: 'runner', file: t.file, target: t.name, runner: t.runner }, sub);
          expand(sub, base, depth + 1, nextSeen, { runners });
        }
      }
      return;
    }
    if (d.kind === 'script' && d.file) {
      const fileRel = joinDir(d.cwd, d.file);
      if (!fileRel) return;
      const k = `script|${fileRel}`;
      if (seen.has(k)) return;
      const text = readScript(fileRel);
      if (text === null) return;
      for (const sub of safeNormalize(text, normDir(inv.cwd))) {
        push(base, { origin: 'script', file: fileRel, runner: 'script' }, sub);
      }
    }
  };

  // CI: every step of every workflow, `uses:` included.
  let steps = [];
  try {
    steps = parseWorkflows(abs);
  } catch (_) {
    steps = [];
  }
  for (const step of steps) {
    const base = {
      scope: 'ci',
      ciFile: step.file,
      job: step.job,
      continueOnError: step.continueOnError === true,
      scheduled: step.scheduled === true,
    };
    if (step.uses) {
      const ref = String(step.uses).split('@')[0].trim();
      if (ref) {
        push(base, { origin: 'ci', file: step.file }, { text: `uses:${ref}`, tool: 'uses', argv: [], cwd: step.cwd });
      }
    }
    for (const inv of step.invocations || []) {
      push(base, { origin: 'ci', file: step.file }, inv);
      expand(inv, base, 1, new Set());
    }
  }

  // Local: every runner target's body. Other targets are already listed on their own, so only
  // wrapper scripts are followed from here.
  for (const t of targets) {
    const base = { scope: 'local', continueOnError: false, scheduled: false };
    const own = targetKey(t.runner, t.dir, t.name);
    for (const inv of safeNormalize(targetBody(t), targetCwd(t))) {
      push(base, { origin: 'runner', file: t.file, target: t.name, runner: t.runner }, inv);
      expand(inv, base, 1, new Set([own]), { runners: false });
    }
  }

  return records;
}

// ─── the catalogue (42-RESEARCH §4) ───────────────────────────────────────────
//
// Each row is DATA: `{ id, stack, severity, key?, name, ci: RegExp[], weak: RegExp[], proposal,
// snippet }` plus optional refinements the generic evaluator understands:
//
//   applies(area, ctx)   extra applicability beyond `stack` (a config file, a Go version)
//   sequence [[A, B]]    present when, in one CI job (or one runner target), a record matching A
//                        is followed by one matching B (a generator, then `git diff --exit-code`)
//   all: RegExp[]        present only when EVERY regex matches some CI record (`partial` otherwise)
//   trigger: RegExp[]    the row fires only when a CI record matches (a weak form is in use)
//   requiresCi: RegExp   the row applies only when some CI record matches (coverage needs tests)
//   anywhere: true       a runner target counts as present, not only CI (device-bound checks)
//   needsCi: false       evaluated even when the repo has no CI at all
//   absentSeverity / refinePresent / weakWhen / snippetFor / proposalFor / absentText
//
// `key` is the STACK.md command key the check's gate maps to; LOCAL-MIRROR names it. A check
// whose stack is not detected in an area emits nothing. IDs are stable: renaming one breaks
// anyone grepping reports.

const GIT_DIFF = /\bgit\s+diff\b[^|]*--(?:exit-code|quiet)\b/;
const GENERATOR = /\b(?:go\s+generate|buf\s+generate|sqlc\s+generate|templ\s+generate)\b/;
const GO_TEST = /\b(?:go\s+test|gotestsum|ginkgo)\b/;
const DART_TEST_RUN = /\b(?:dart|flutter)\s+test\b/;
const DOCKERFILE_RE = /(?:^|\/)(?:Dockerfile(?:\..+)?|[^/]+\.Dockerfile)$/;
const PLATFORM_DIRS = ['android', 'ios', 'macos', 'web'];

const hasKind = (area, ...kinds) => Array.isArray(area.kinds) && kinds.some((k) => area.kinds.includes(k));
const hasFlag = (area, flag) => Array.isArray(area.flags) && area.flags.includes(flag);
const isFlutter = (area) => hasKind(area, 'flutter');

const STACK_APPLIES = Object.freeze({
  go: (a) => hasKind(a, 'go'),
  dart: (a) => hasKind(a, 'dart', 'flutter'),
  flutter: (a) => hasKind(a, 'flutter'),
  js: (a) => hasKind(a, 'node'),
  helm: (a) => hasFlag(a, 'helm'),
  docker: (a) => hasFlag(a, 'docker'),
  any: () => false, // repo-level rows are evaluated once, not per area
});

function isFlutterApp(area, ctx) {
  if (!isFlutter(area)) return false;
  const dir = area.dir || '';
  return ctx.exists(`${dir}lib/main.dart`) && PLATFORM_DIRS.some((p) => ctx.isDir(`${dir}${p}`));
}

function goMinor(area, ctx) {
  const m = /^go\s+(\d+)\.(\d+)/m.exec(ctx.read(`${area.dir || ''}go.mod`) || '');
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

function evidenceMatching(area, re) {
  return (area.evidence || []).filter((e) => re.test(e));
}

const REPORT_CHECKS = [
  {
    id: 'GO-FMT', stack: 'go', key: 'format', severity: 'gap',
    name: 'Go format check',
    ci: [/\b(?:gofmt|gofumpt|goimports)\b[^|]*\s-[ld]\b/, /\bgolangci-lint\s+fmt\b/],
    sequence: [[/\b(?:gofmt|gofumpt|goimports)\b[^|]*\s-w\b/, GIT_DIFF]],
    weak: [],
    // golangci-lint v2 with a `formatters:` section formats as part of `run`.
    presentVia: (area, ctx, hits) => {
      const cfg = evidenceMatching(area, /\.golangci\.(?:ya?ml|toml|json)$/)[0];
      if (!cfg || !/^formatters\s*:/m.test(ctx.read(cfg) || '')) return null;
      return hits.lint.find((r) => /\bgolangci-lint\s+run\b|^uses:golangci\/golangci-lint-action$/.test(r.text)) || null;
    },
    proposal: 'Fail CI on unformatted files; a bare `gofmt -l` lists them and exits 0.',
    snippet: 'test -z "$(gofmt -l .)"',
  },
  {
    id: 'GO-VET', stack: 'go', key: 'lint', severity: 'gap',
    name: '`go vet`',
    ci: [/\bgo\s+vet\b/],
    weak: [],
    proposal: 'Run `go vet` in CI.',
    snippet: 'go vet ./...',
  },
  {
    id: 'GO-LINT', stack: 'go', key: 'lint', severity: 'weak',
    name: 'Go linter (golangci-lint / staticcheck)',
    ci: [/\bgolangci-lint\s+run\b/, /^uses:golangci\/golangci-lint-action$/, /\bstaticcheck\b/],
    weak: [],
    // Research §4: weak when missing, info when `go vet` already runs.
    absentSeverity: (area, ctx) => (ctx.ranInCi('GO-VET', area) ? 'info' : 'weak'),
    proposalFor: (area) => (hasFlag(area, 'golangci')
      ? 'Run golangci-lint in CI (the repo already has a .golangci config).'
      : 'Add a linter beyond vet; staticcheck needs no config.'),
    snippetFor: (area) => (hasFlag(area, 'golangci') ? 'golangci-lint run ./...' : 'staticcheck ./...'),
    proposal: 'Add a linter beyond vet.',
    snippet: 'staticcheck ./...',
  },
  {
    id: 'GO-VULN', stack: 'go', key: 'audit', severity: 'gap',
    name: 'govulncheck',
    ci: [/\bgovulncheck\b/, /^uses:golang\/govulncheck-action$/],
    weak: [],
    // New CVEs arrive without a code change: a push-only scan misses them.
    weakWhen: (strong) => (strong.some((h) => h.r.scheduled) ? null : 'no schedule: trigger (new CVEs need no code change)'),
    proposal: 'Scan dependencies for known vulnerabilities in CI, on a schedule as well as on push.',
    snippet: 'govulncheck ./...',
  },
  {
    id: 'GO-RACE', stack: 'go', key: 'test', severity: 'gap',
    name: 'the race detector',
    ci: [/\b(?:go\s+test|gotestsum|ginkgo)\b.*\s-race\b/],
    weak: [],
    absentText: 'no `go test -race` in CI',
    proposal: 'Run the tests with the race detector (needs CGO).',
    snippet: 'go test -race ./...',
  },
  {
    id: 'GO-COVER', stack: 'go', severity: 'info',
    name: 'Go coverage',
    ci: [/\b(?:go\s+test|gotestsum|ginkgo)\b.*\s-{1,2}(?:cover|coverprofile|coverpkg|covermode)\b/],
    requiresCi: GO_TEST,
    weak: [],
    absentText: 'CI runs Go tests without coverage',
    proposal: 'Record coverage (no threshold is implied).',
    snippet: 'go test -coverprofile=coverage.out ./...',
  },
  {
    id: 'GO-TIDY', stack: 'go', key: 'tidy', severity: 'weak',
    name: 'go.mod tidy check',
    ci: [/\bgo\s+mod\s+tidy\b[^|]*\s-diff\b/],
    sequence: [[/\bgo\s+mod\s+tidy\b/, GIT_DIFF]],
    weak: [],
    proposal: 'Fail CI when go.mod/go.sum are not tidy (Go >= 1.23).',
    snippet: 'go mod tidy -diff',
  },
  {
    id: 'GO-FIX', stack: 'go', severity: 'info',
    name: '`go fix -diff`',
    ci: [/\bgo\s+fix\b[^|]*\s-diff\b/],
    applies: (area, ctx) => {
      const v = goMinor(area, ctx);
      return Boolean(v && (v.major > 1 || v.minor >= 26));
    },
    weak: [],
    proposal: 'Report pending modernizer fixes; `go fix -diff` exits non-zero on a diff.',
    snippet: 'go fix -diff ./...',
  },
  {
    id: 'GO-GEN-DRIFT', stack: 'go', key: 'codegen', severity: 'gap',
    name: 'generated-code drift check',
    ci: [],
    sequence: [[GENERATOR, GIT_DIFF]],
    applies: (area) => hasFlag(area, 'sqlc') || hasFlag(area, 'buf') || hasFlag(area, 'go_generate'),
    evidenceFiles: /(?:^|\/)(?:sqlc\.(?:ya?ml|json)|buf(?:\.gen|\.work)?\.yaml)$|\.go$/,
    weak: [],
    absentText: 'generator config present, but CI never regenerates and runs `git diff --exit-code`',
    proposal: 'Regenerate in CI and fail on drift.',
    snippetFor: (area) => {
      if (hasFlag(area, 'sqlc')) return 'sqlc generate && git diff --exit-code';
      if (hasFlag(area, 'buf')) return 'buf generate && git diff --exit-code';
      return 'go generate ./... && git diff --exit-code';
    },
    snippet: 'go generate ./... && git diff --exit-code',
  },
  {
    id: 'GO-BUF', stack: 'go', key: 'lint', severity: 'info',
    name: '`buf lint` / `buf breaking`',
    ci: [/\bbuf\s+lint\b/, /\bbuf\s+breaking\b/, /^uses:bufbuild\/buf-/],
    applies: (area) => hasFlag(area, 'buf'),
    evidenceFiles: /(?:^|\/)buf(?:\.gen|\.work)?\.yaml$/,
    weak: [],
    proposal: 'Lint the protos and check them for breaking changes against the default branch.',
    snippet: 'buf lint',
  },
  {
    id: 'GO-SAST', stack: 'go', key: 'sast', severity: 'info',
    name: 'SAST pass (gosec / CodeQL)',
    ci: [/\bgosec\b/, /^uses:securego\/gosec$/, /^uses:github\/codeql-action(?:\/|$)/],
    weak: [],
    proposal: 'Optional: add a SAST pass.',
    snippet: 'gosec ./...',
  },
  {
    id: 'DART-ANALYZE', stack: 'dart', key: 'lint', severity: 'weak',
    name: 'Dart analyzer',
    ci: [/\b(?:dart|flutter)\s+analyze\b/],
    weak: [],
    absentText: 'no `dart analyze` / `flutter analyze` in CI',
    // `flutter analyze` is fatal on infos by default; `dart analyze` only with --fatal-infos.
    refinePresent: (strong) => (strong.every((h) => /\bdart\s+analyze\b/.test(h.r.text) && !/--fatal-infos\b/.test(h.r.text))
      ? 'infos are not fatal (`dart analyze` without --fatal-infos)'
      : null),
    proposal: 'Make analyzer infos and warnings fail the build.',
    snippetFor: (area) => (isFlutter(area) ? 'flutter analyze' : 'dart analyze --fatal-infos'),
    snippet: 'dart analyze --fatal-infos',
  },
  {
    id: 'DART-FORMAT', stack: 'dart', key: 'format', severity: 'gap',
    name: 'Dart format check',
    ci: [/\bdart\s+format\b/],
    sequence: [[/\bdart\s+format\b/, GIT_DIFF]],
    weak: [/^(?![\s\S]*--set-exit-if-changed)/],
    weakReason: 'no --set-exit-if-changed',
    proposal: 'Fail CI on unformatted Dart.',
    snippet: 'dart format --output=none --set-exit-if-changed .',
  },
  {
    id: 'DART-TEST', stack: 'dart', key: 'test', severity: 'gap',
    name: 'Dart/Flutter test run',
    ci: [DART_TEST_RUN, /\bvery_good\s+test\b/],
    weak: [],
    proposal: 'Run the tests in CI.',
    snippetFor: (area) => (isFlutter(area) ? 'flutter test' : 'dart test'),
    snippet: 'dart test',
  },
  {
    id: 'DART-COVER', stack: 'dart', severity: 'info',
    name: 'Dart/Flutter coverage',
    ci: [/\b(?:dart|flutter)\s+test\b[^|]*--coverage\b/, /\bvery_good\s+test\b[^|]*--coverage\b/],
    requiresCi: DART_TEST_RUN,
    weak: [],
    absentText: 'CI runs the tests without coverage',
    // Q8 (verified 2026-09-29, dart 3.x + package:test 1.32): `dart test --coverage=coverage`
    // exits 0 and writes VM JSON under coverage/test/, not lcov.
    proposalFor: (area) => (isFlutter(area)
      ? 'Record coverage; `flutter test --coverage` writes coverage/lcov.info.'
      : 'Record coverage; `dart test --coverage=coverage` writes VM JSON under coverage/ (format it to lcov with package:coverage).'),
    snippetFor: (area) => (isFlutter(area) ? 'flutter test --coverage' : 'dart test --coverage=coverage'),
    proposal: 'Record coverage.',
    snippet: 'flutter test --coverage',
  },
  {
    id: 'FLUT-INTEG', stack: 'flutter', severity: 'weak',
    name: 'integration tests',
    ci: [/\bintegration_test\b/],
    applies: (area) => hasFlag(area, 'integration_test'),
    evidenceFiles: /integration_test\/$/,
    weak: [],
    absentText: '`integration_test/` exists but CI never runs it',
    proposal: 'Run the integration tests on a device or emulator in CI.',
    snippet: 'flutter test integration_test -d <device>',
  },
  {
    id: 'FLUT-MAESTRO', stack: 'flutter', severity: 'info',
    name: 'Maestro / Patrol flows',
    ci: [/\bmaestro\s+test\b/, /\bpatrol\s+test\b/, /^uses:mobile-dev-inc\/action-maestro-cloud$/],
    applies: (area, ctx) => isFlutterApp(area, ctx),
    anywhere: true,
    needsCi: false,
    weak: [],
    absentSeverity: (area, ctx) => (hasFlag(area, 'maestro') || ctx.isDir(`${area.dir || ''}patrol_test`) ? 'weak' : 'info'),
    absentTextFor: (area, ctx) => (hasFlag(area, 'maestro') || ctx.isDir(`${area.dir || ''}patrol_test`)
      ? 'UI flows exist (`.maestro/` / `patrol_test/`) but nothing runs them'
      : 'a Flutter app with no Maestro or Patrol flows'),
    proposal: 'Add end-to-end UI flows and a runner target for them.',
    snippet: 'maestro test .maestro',
  },
  {
    id: 'FLUT-GOLDEN', stack: 'flutter', severity: 'info',
    name: 'golden tests',
    ci: [],
    trigger: [/--exclude-tags(?:=|\s+)\S*\bgolden/],
    triggeredText: 'golden tests are excluded in CI',
    weak: [],
    proposal: 'Run the goldens in a pinned-image CI job instead of skipping them.',
    snippet: 'flutter test --tags golden',
  },
  {
    id: 'DART-CODEGEN', stack: 'dart', key: 'codegen', severity: 'weak',
    name: 'build_runner drift check',
    ci: [],
    sequence: [[/\bbuild_runner\s+build\b/, GIT_DIFF]],
    applies: (area) => hasFlag(area, 'build_runner') && hasFlag(area, 'generated'),
    evidenceFiles: /\.(?:g|freezed|gr|mocks)\.dart$|pubspec\.yaml$/,
    weak: [],
    absentText: 'generated Dart files are committed, but CI never rebuilds them and runs `git diff --exit-code`',
    proposal: 'Rebuild generated code in CI and fail on drift.',
    snippet: 'dart run build_runner build --delete-conflicting-outputs && git diff --exit-code',
  },
  {
    id: 'DART-LOCK', stack: 'dart', severity: 'info',
    name: 'locked dependency resolution',
    ci: [/\bpub\s+get\b[^|]*--enforce-lockfile\b/],
    applies: (area, ctx) => ctx.exists(`${area.dir || ''}pubspec.lock`) && (isFlutterApp(area, ctx) || ctx.isDir(`${area.dir || ''}bin`)),
    evidenceFiles: /pubspec\.lock$/,
    weak: [],
    absentText: 'an app with a committed `pubspec.lock`, resolved in CI without --enforce-lockfile',
    proposal: 'Resolve exactly the committed lockfile in CI.',
    snippetFor: (area) => (isFlutter(area) ? 'flutter pub get --enforce-lockfile' : 'dart pub get --enforce-lockfile'),
    snippet: 'dart pub get --enforce-lockfile',
  },
  {
    id: 'DART-OUTDATED', stack: 'dart', severity: 'info',
    name: '`pub outdated`',
    ci: [],
    trigger: [/\bpub\s+outdated\b/],
    triggeredText: '`pub outdated` always exits 0: it is advisory, not an audit gate (there is no `dart pub audit`)',
    weak: [],
    proposal: 'Keep it as a non-gating advisory job; do not count it as the audit gate.',
    snippet: null,
  },
  {
    id: 'JS-CI', stack: 'js', severity: 'weak',
    name: 'reproducible install',
    ci: [/\bnpm\s+ci\b/, /\bpnpm\s+install\b[^|]*--frozen-lockfile\b/, /\byarn\s+install\b[^|]*--(?:frozen-lockfile|immutable)\b/, /\bbun\s+install\b[^|]*--frozen-lockfile\b/],
    trigger: [/\bnpm\s+(?:install|i)\b/, /\bpnpm\s+(?:install|i)\b/, /\bbun\s+install\b/, /\byarn(?:\s+install)?\s*$/],
    triggeredText: 'CI installs with `npm install`, which may rewrite the lockfile',
    weak: [],
    proposal: 'Install exactly the lockfile in CI.',
    snippet: 'npm ci',
  },
  {
    id: 'JS-AUDIT', stack: 'js', key: 'audit', severity: 'gap',
    name: 'dependency audit',
    ci: [/\b(?:npm|pnpm|yarn|bun)\s+audit\b/],
    weak: [],
    proposal: 'Audit dependencies in CI.',
    snippet: 'npm audit --audit-level=high',
  },
  {
    id: 'JS-LINT', stack: 'js', key: 'lint', severity: 'gap',
    name: 'JS/TS linter',
    ci: [/\beslint\b/, /\bbiome\s+(?:lint|check|ci)\b/, /\boxlint\b/],
    weak: [],
    proposal: 'Lint in CI.',
    snippet: 'npx eslint .',
  },
  {
    id: 'JS-TYPE', stack: 'js', key: 'typecheck', severity: 'gap',
    name: 'TypeScript type check',
    ci: [/\btsc\b[^|]*(?:--noEmit\b|\s-b\b|--build\b)/, /\bvue-tsc\b/],
    applies: (area, ctx) => ctx.exists(`${area.dir || ''}tsconfig.json`),
    weak: [],
    proposal: 'Type-check in CI.',
    snippet: 'npx tsc --noEmit',
  },
  {
    id: 'JS-E2E', stack: 'js', key: 'e2e', severity: 'info',
    name: 'the configured e2e suite (Playwright / Cypress)',
    ci: [/\bplaywright\s+test\b/, /\bcypress\s+run\b/],
    applies: (area, ctx) => /"(?:@playwright\/test|playwright|cypress)"/.test(ctx.read(`${area.dir || ''}package.json`) || '')
      || ['playwright.config.ts', 'playwright.config.js', 'cypress.config.ts', 'cypress.config.js'].some((f) => ctx.exists(`${area.dir || ''}${f}`)),
    weak: [],
    absentText: 'an e2e framework is configured but CI never runs it',
    proposal: 'Run the e2e suite in CI.',
    snippet: 'npx playwright test',
  },
  {
    id: 'HELM-LINT', stack: 'helm', key: 'lint_helm', severity: 'gap',
    name: 'chart validation',
    ci: [],
    all: [/\bhelm\s+lint\b/, /\bkubeconform\b|\bkubeval\b/],
    allLabels: ['`helm lint`', '`helm template | kubeconform`'],
    evidenceFiles: /(?:^|\/)Chart\.yaml$/,
    weak: [],
    absentText: 'a Helm chart with no `helm lint` or kubeconform validation in CI',
    partialText: (missing) => `only part of chart validation runs: missing ${missing.join(', ')} (rendered manifests are never validated against the schema; add kubeconform)`,
    proposal: 'Lint the chart and validate the rendered manifests.',
    snippetFor: (area) => {
      const chart = evidenceMatching(area, /(?:^|\/)Chart\.yaml$/)[0];
      const dir = chart ? (path.posix.dirname(chart) === '.' ? '.' : path.posix.dirname(chart)) : '<chart>';
      return `helm lint ${dir} && helm template ${dir} | kubeconform -strict -summary`;
    },
    snippet: 'helm lint <chart> && helm template <chart> | kubeconform -strict -summary',
  },
  {
    id: 'DOCKER-LINT', stack: 'docker', key: 'lint_docker', severity: 'info',
    name: 'Dockerfile linter (hadolint)',
    ci: [/\bhadolint\b/, /^uses:hadolint\/hadolint-action$/],
    evidenceFiles: DOCKERFILE_RE,
    weak: [],
    proposal: 'Lint Dockerfiles (hadolint must be installed; it is not assumed).',
    snippetFor: (area) => `hadolint ${evidenceMatching(area, DOCKERFILE_RE)[0] || 'Dockerfile'}`,
    snippet: 'hadolint Dockerfile',
  },
  {
    id: 'DOCKER-SCAN', stack: 'docker', severity: 'info',
    name: 'image scan (trivy / grype)',
    ci: [/\btrivy\b/, /\bgrype\b/, /\bdocker\s+scout\s+cves\b/, /^uses:aquasecurity\/trivy-action$/, /^uses:anchore\/scan-action$/],
    evidenceFiles: DOCKERFILE_RE,
    weak: [],
    proposal: 'Scan built images for known vulnerabilities.',
    snippet: 'trivy image <image>',
  },
  {
    id: 'DOCKER-PIN', stack: 'docker', severity: 'info',
    name: 'digest-pinned base images',
    ci: [],
    needsCi: false,
    evaluate: (area, ctx) => {
      const files = evidenceMatching(area, DOCKERFILE_RE);
      const unpinned = [];
      for (const f of files) {
        const text = ctx.read(f) || '';
        const stages = new Set();
        const re = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/gim;
        let m;
        while ((m = re.exec(text)) !== null) {
          const image = m[1];
          if (m[2]) stages.add(m[2].toLowerCase());
          if (image === 'scratch' || image.includes('@sha256:') || image.startsWith('$') || stages.has(image.toLowerCase())) continue;
          if (!unpinned.includes(image)) unpinned.push(image);
        }
      }
      if (!unpinned.length) return null;
      return { severity: 'info', finding: `base images pinned by tag, not digest: ${unpinned.join(', ')}`, evidence: files };
    },
    proposal: 'Pin each FROM to an @sha256 digest (keep the tag in a comment for readability).',
    snippet: null,
  },
  {
    id: 'CI-HYGIENE', stack: 'any', severity: 'info',
    name: 'workflow hygiene',
    ci: [],
    evaluate: (_area, ctx) => {
      const parts = [];
      const files = [];
      for (const { file, text } of ctx.workflows) {
        const issues = [];
        if (!/^\s*permissions\s*:/m.test(text)) issues.push('no permissions:');
        let unpinned = 0;
        const re = /^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)/gm;
        let m;
        while ((m = re.exec(text)) !== null) {
          const ref = m[1];
          if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
          const at = ref.lastIndexOf('@');
          if (at === -1 || !/^[0-9a-f]{40}$/.test(ref.slice(at + 1))) unpinned += 1;
        }
        if (unpinned) issues.push(`${unpinned} action${unpinned === 1 ? '' : 's'} not pinned to a commit SHA`);
        if (!/^\s*timeout-minutes\s*:/m.test(text)) issues.push('no timeout-minutes');
        if (!/^\s*concurrency\s*:/m.test(text)) issues.push('no concurrency');
        if (issues.length) {
          parts.push(`${path.posix.basename(file)} (${issues.join(', ')})`);
          files.push(file);
        }
      }
      if (!parts.length) return null;
      return { severity: 'info', finding: `workflow hygiene: ${parts.join('; ')}`, evidence: files };
    },
    proposal: 'Set a least-privilege `permissions:` block, pin actions by SHA, and add `timeout-minutes` and a `concurrency` group.',
    snippet: null,
  },
  {
    id: 'LOCAL-MIRROR', stack: 'any', severity: 'gap',
    name: 'local runner target mirroring each CI gate',
    ci: [],
    meta: 'local-mirror',
    proposal: 'Add a task/make/just target per STACK.md key so each CI gate also runs locally.',
    snippet: null,
  },
  {
    id: 'CI-MISSING', stack: 'any', severity: 'info',
    name: 'CI',
    ci: [],
    meta: 'ci-missing',
    needsCi: false,
    proposal: 'Add a baseline workflow per detected stack.',
    snippet: null,
  },
];

// ─── evaluation ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER = Object.freeze({ gap: 0, weak: 1, info: 2 });
const MAX_EVIDENCE = 3;

function makeContext(root, areas, records) {
  const abs = root ? path.resolve(String(root)) : null;
  const cache = new Map();
  const read = (rel) => {
    if (!abs) return null;
    if (!cache.has(rel)) cache.set(rel, readSmall(path.join(abs, rel)));
    return cache.get(rel);
  };
  const stat = (rel) => {
    if (!abs) return null;
    try {
      return fs.statSync(path.join(abs, rel));
    } catch (_) {
      return null;
    }
  };
  const workflows = [];
  if (abs) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(abs, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f)).sort();
    } catch (_) {
      names = [];
    }
    for (const name of names) {
      const file = `.github/workflows/${name}`;
      const text = read(file);
      if (text !== null) workflows.push({ file, text });
    }
  }
  const hasCi = workflows.length > 0 || records.some((r) => r.scope === 'ci');
  const states = new Map();
  return {
    root: abs,
    areas,
    records,
    workflows,
    hasCi,
    read,
    exists: (rel) => {
      const st = stat(rel);
      return Boolean(st && st.isFile());
    },
    isDir: (rel) => {
      const st = stat(rel);
      return Boolean(st && st.isDirectory());
    },
    recordsFor: (area) => records.filter((r) => r.area === (area.dir || '') || r.area === ''),
    states,
    ranInCi: (id, area) => {
      const s = states.get(`${id}|${area.dir || ''}`);
      return Boolean(s && (s.state === 'present' || s.state === 'weak'));
    },
  };
}

function weakReasons(r, check) {
  const out = [...(r.weakMarkers || [])];
  if (r.continueOnError && !out.includes('continue-on-error')) out.push('continue-on-error');
  for (const re of check.weak || []) {
    if (re.test(r.text)) {
      const reason = check.weakReason || 'non-fatal form';
      if (!out.includes(reason)) out.push(reason);
    }
  }
  return out;
}

function groupKey(r) {
  return r.scope === 'ci' ? `ci|${r.ciFile}|${r.job}` : `local|${r.file}|${r.target || ''}`;
}

/** The A records of every satisfied `[A, B]` sequence, one per (group, pair). */
function sequenceHits(records, sequence) {
  if (!Array.isArray(sequence) || !sequence.length) return [];
  const groups = new Map();
  for (const r of records) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const list of groups.values()) {
    for (const [a, b] of sequence) {
      const i = list.findIndex((r) => a.test(r.text));
      if (i === -1) continue;
      if (list.some((r, k) => k > i && b.test(r.text))) out.push(list[i]);
    }
  }
  return out;
}

function describeRecord(r) {
  if (r.scope === 'ci') {
    const where = `${r.ciFile}${r.job ? `:${r.job}` : ''}`;
    if (r.origin === 'ci') return `${where}: ${r.text}`;
    return `${where} -> ${r.file}${r.target ? ` (${r.target})` : ''}: ${r.text}`;
  }
  return `${r.file}${r.target ? ` (${r.target})` : ''}: ${r.text}`;
}

function uniqueEvidence(list) {
  const out = [];
  for (const e of list) {
    if (e && !out.includes(e)) out.push(e);
    if (out.length >= MAX_EVIDENCE) break;
  }
  return out;
}

/**
 * evaluate(check, area, ctx) -> { state, ci, local, reasons, missing }
 *   state: present | weak | absent | partial | triggered | n/a
 */
function evaluate(check, area, ctx) {
  const recs = ctx.recordsFor(area);
  const matchers = check.all || check.ci || [];
  const hits = [];
  for (const r of recs) {
    if (matchers.some((re) => re.test(r.text))) hits.push({ r, reasons: weakReasons(r, check) });
  }
  for (const r of sequenceHits(recs, check.sequence)) hits.push({ r, reasons: [] });
  if (typeof check.presentVia === 'function') {
    const lint = recs.filter((r) => r.scope === 'ci');
    const r = check.presentVia(area, ctx, { lint });
    if (r) hits.push({ r, reasons: [] });
  }
  const ci = hits.filter((h) => h.r.scope === 'ci');
  const local = hits.filter((h) => h.r.scope === 'local');

  if (check.all) {
    const missing = check.all.map((re, i) => (ci.some((h) => re.test(h.r.text)) ? null : (check.allLabels || [])[i] || re.source)).filter(Boolean);
    if (missing.length === check.all.length) return { state: 'absent', ci, local, reasons: [], missing };
    if (missing.length) return { state: 'partial', ci, local, reasons: [], missing };
  }

  const found = check.anywhere ? hits : ci;
  if (!found.length) {
    if (check.trigger && ctx.hasCi) {
      const trig = recs.filter((r) => r.scope === 'ci' && check.trigger.some((re) => re.test(r.text)));
      if (trig.length) return { state: 'triggered', ci: trig.map((r) => ({ r, reasons: [] })), local, reasons: [], missing: [] };
      return { state: 'n/a', ci, local, reasons: [], missing: [] };
    }
    if (check.trigger) return { state: 'n/a', ci, local, reasons: [], missing: [] };
    return { state: 'absent', ci, local, reasons: [], missing: [] };
  }
  const strong = found.filter((h) => !h.reasons.length);
  if (!strong.length) {
    const reasons = [];
    for (const h of found) for (const x of h.reasons) if (!reasons.includes(x)) reasons.push(x);
    return { state: 'weak', ci, local, reasons, missing: [] };
  }
  if (typeof check.weakWhen === 'function') {
    const reason = check.weakWhen(strong);
    if (reason) return { state: 'weak', ci, local, reasons: [reason], missing: [] };
  }
  if (typeof check.refinePresent === 'function') {
    const note = check.refinePresent(strong);
    if (note) return { state: 'refined', ci, local, reasons: [note], missing: [] };
  }
  return { state: 'present', ci, local, reasons: [], missing: [] };
}

function snippetOf(check, area) {
  return typeof check.snippetFor === 'function' ? check.snippetFor(area) : check.snippet;
}

function proposalOf(check, area) {
  return typeof check.proposalFor === 'function' ? check.proposalFor(area) : check.proposal;
}

function makeFinding(check, area, severity, finding, evidence) {
  const f = {
    id: check.id,
    severity,
    component: area ? area.dir || '' : '',
    finding,
    evidence: uniqueEvidence(evidence || []),
    proposal: area ? proposalOf(check, area) : check.proposal,
  };
  const snippet = area ? snippetOf(check, area) : check.snippet;
  if (snippet) f.snippet = snippet;
  return f;
}

/** A per-area finding from an evaluation, or null when the check is satisfied. */
function findingFor(check, area, ctx, ev) {
  const localEvidence = ev.local.map((h) => `local: ${describeRecord(h.r)}`);
  const whyFiles = check.evidenceFiles ? evidenceMatching(area, check.evidenceFiles) : [];
  switch (ev.state) {
    case 'absent': {
      const severity = typeof check.absentSeverity === 'function' ? check.absentSeverity(area, ctx) : check.severity;
      if (!severity) return null;
      const text = typeof check.absentTextFor === 'function'
        ? check.absentTextFor(area, ctx)
        : check.absentText || `CI has no ${check.name}`;
      const suffix = ev.local.length && !check.anywhere ? ' (a local runner target runs it)' : '';
      const why = whyFiles.length ? whyFiles : (area.evidence || []).slice(0, 1);
      return makeFinding(check, area, severity, `${text}${suffix}`, [...localEvidence, ...why]);
    }
    case 'partial':
      return makeFinding(check, area, check.severity, check.partialText(ev.missing), ev.ci.map((h) => describeRecord(h.r)));
    case 'weak':
      return makeFinding(check, area, 'weak', `${check.name} runs in CI but is weakened: ${ev.reasons.join(', ')}`, ev.ci.map((h) => describeRecord(h.r)));
    case 'refined':
      return makeFinding(check, area, 'info', ev.reasons.join(', '), ev.ci.map((h) => describeRecord(h.r)));
    case 'triggered':
      return makeFinding(check, area, check.severity, check.triggeredText, ev.ci.map((h) => describeRecord(h.r)));
    default:
      return null;
  }
}

function runnerFamily(records) {
  const local = records.find((r) => r.scope === 'local' && ['make', 'task', 'just'].includes(r.runner));
  return local ? local.runner : null;
}

function noteFinding(n) {
  const key = n.key || 'area';
  const candidate = n.candidate || null;
  const status = n.status || 'note';
  const finding = `${candidate || '(no candidate)'}: ${status}${n.detail ? ` (${n.detail})` : ''}`;
  return {
    id: `DRAFT-NOTE-${key}`,
    severity: 'info',
    component: n.area || '',
    finding,
    evidence: n.source ? [`stack init draft (${n.source})`] : ['stack init draft'],
    proposal: 'The drafter kept this out of STACK.md (`run: discover` or a note); set it by hand once it resolves.',
    note: { key: n.key || null, candidate, status, source: n.source || null },
  };
}

function compareFindings(a, b) {
  return (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    || (a.component < b.component ? -1 : a.component > b.component ? 1 : 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    || (a.finding < b.finding ? -1 : a.finding > b.finding ? 1 : 0);
}

/**
 * computeFindings({ areas, records, notes, root, checks }) -> findings sorted by
 * (severity, component, id). `root` enables the file-reading rows (DOCKER-PIN, CI-HYGIENE, the
 * config-dependent `applies`); without it they see no files. Notes become `DRAFT-NOTE-<key>`
 * info rows (locked Q2). When the repo has no CI at all, the CI-gate rows are folded into one
 * CI-MISSING row instead of one gap per missing gate.
 */
function computeFindings({ areas = [], records = [], notes = [], root = null, checks = REPORT_CHECKS } = {}) {
  const ctx = makeContext(root, areas, records);
  const findings = [];
  const mirrorGaps = new Map(); // area dir -> [{ key, text, evidence }]
  const baseline = new Map(); // stack -> snippets, for CI-MISSING

  for (const area of areas) {
    for (const check of checks) {
      if (check.stack === 'any') continue;
      const stackOk = STACK_APPLIES[check.stack];
      if (!stackOk || !stackOk(area)) continue;
      if (typeof check.applies === 'function' && !check.applies(area, ctx)) continue;

      if (!ctx.hasCi && check.needsCi !== false) {
        if (check.severity === 'gap' && !check.trigger) {
          const snip = snippetOf(check, area);
          if (snip) {
            const list = baseline.get(check.stack) || [];
            if (!list.includes(snip)) list.push(snip);
            baseline.set(check.stack, list);
          }
        }
        continue;
      }
      if (check.requiresCi && !ctx.recordsFor(area).some((r) => r.scope === 'ci' && check.requiresCi.test(r.text))) continue;

      if (typeof check.evaluate === 'function') {
        const out = check.evaluate(area, ctx);
        if (out) findings.push(makeFinding(check, area, out.severity, out.finding, out.evidence));
        continue;
      }

      const ev = evaluate(check, area, ctx);
      ctx.states.set(`${check.id}|${area.dir || ''}`, ev);
      const f = findingFor(check, area, ctx, ev);
      if (f) findings.push(f);

      const inCi = ev.state === 'present' || ev.state === 'weak' || ev.state === 'refined' || ev.state === 'partial';
      if (check.key && inCi && !check.anywhere && ev.local.length === 0) {
        const list = mirrorGaps.get(area.dir || '') || [];
        const first = ev.ci[0] ? ev.ci[0].r : null;
        if (!list.some((x) => x.key === check.key && x.id === check.id)) {
          list.push({ id: check.id, key: check.key, text: first ? first.text : check.name, evidence: first ? describeRecord(first) : null });
        }
        mirrorGaps.set(area.dir || '', list);
      }
    }
  }

  for (const check of checks) {
    if (check.stack !== 'any') continue;
    if (check.meta === 'ci-missing') {
      if (ctx.hasCi) continue;
      const stacks = [...baseline.keys()].sort();
      const plan = stacks.map((s) => `${s}: ${baseline.get(s).join(', ')}`).join('; ');
      findings.push({
        id: check.id,
        severity: check.severity,
        component: '',
        finding: 'no CI: `.github/workflows` is absent, so no gate runs on push',
        evidence: ['.github/workflows (missing)'],
        proposal: plan ? `${check.proposal} ${plan}` : check.proposal,
      });
      continue;
    }
    if (check.meta === 'local-mirror') {
      if (!ctx.hasCi) continue;
      const family = runnerFamily(records);
      for (const [dir, list] of [...mirrorGaps.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
        const keys = [];
        for (const x of list) if (!keys.includes(x.key)) keys.push(x.key);
        const detail = list.map((x) => `${x.key} (${x.text})`).join(', ');
        const f = {
          id: check.id,
          severity: check.severity,
          component: dir,
          finding: `gates run only in CI, with no local runner target: ${detail}`,
          evidence: uniqueEvidence(list.map((x) => x.evidence)),
          proposal: `${check.proposal} Keys: ${keys.join(', ')}.`,
        };
        if (family) f.snippet = `${family} ${keys[0]}`;
        findings.push(f);
      }
      continue;
    }
    if (typeof check.evaluate === 'function' && (ctx.hasCi || check.needsCi === false)) {
      const out = check.evaluate(null, ctx);
      if (out) findings.push(makeFinding(check, null, out.severity, out.finding, out.evidence));
    }
  }

  for (const n of Array.isArray(notes) ? notes : []) {
    if (n && typeof n === 'object') findings.push(noteFinding(n));
  }

  return findings.sort(compareFindings);
}

// ─── render ───────────────────────────────────────────────────────────────────

const REPORT_REL = '.planning/STACK-REPORT.md';

function cell(value) {
  return value === null || value === undefined || value === '' ? '—' : mdCell(value);
}

function countsOf(findings) {
  const counts = { gap: 0, weak: 0, info: 0 };
  for (const f of findings) if (Object.prototype.hasOwnProperty.call(counts, f.severity)) counts[f.severity] += 1;
  return counts;
}

function findingTable(rows) {
  if (!rows.length) return 'None.\n';
  const lines = ['| ID | Component | Finding | Evidence | Proposal |', '|---|---|---|---|---|'];
  for (const f of rows) {
    const proposal = f.snippet ? `${f.proposal} \`${f.snippet}\`` : f.proposal;
    lines.push(`| ${cell(f.id)} | ${cell(f.component || '(root)')} | ${cell(f.finding)} | ${cell(f.evidence.join('; '))} | ${cell(proposal)} |`);
  }
  return `${lines.join('\n')}\n`;
}

// The Draft notes table always carries its header (the documented format); an empty one has no rows.
function notesTable(rows) {
  const lines = ['| Key | Candidate | Status | Source |', '|---|---|---|---|'];
  for (const f of rows) {
    const n = f.note || {};
    lines.push(`| ${cell(n.key)} | ${n.candidate ? cell(`\`${n.candidate}\``) : '—'} | ${cell(n.status)} | ${cell(n.source)} |`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * renderReport(findings, meta) -> markdown. `meta` = { generated, id, profile, profile_source,
 * components, unsupported_areas? }. `unsupported_areas` is rendered only when non-empty. Pure
 * and deterministic: the date is an input, never read here.
 */
function renderReport(findings, meta) {
  const counts = countsOf(findings);
  const flowList = (list) => `[${list.map((c) => JSON.stringify(c)).join(', ')}]`;
  const components = Array.isArray(meta.components) ? meta.components : [];
  const unsupported = Array.isArray(meta.unsupported_areas) ? meta.unsupported_areas : [];
  const isNote = (f) => /^DRAFT-NOTE-/.test(f.id);
  const bySeverity = (s) => findings.filter((f) => f.severity === s && !isNote(f));
  return [
    '---',
    `generated: ${JSON.stringify(String(meta.generated))}`,
    `profile: ${JSON.stringify(String(meta.profile || 'general'))}`,
    `profile_source: ${meta.profile_source}`,
    `components: ${flowList(components)}`,
    ...(unsupported.length ? [`unsupported_areas: ${flowList(unsupported)}`] : []),
    `counts: { gap: ${counts.gap}, weak: ${counts.weak}, info: ${counts.info} }`,
    '---',
    '',
    `# Stack Report: ${meta.id}`,
    '',
    'Proposals only — nothing here has been applied. Review, then change CI/runners yourself.',
    '',
    '## Gaps',
    '',
    findingTable(bySeverity('gap')),
    '## Weak',
    '',
    findingTable(bySeverity('weak')),
    '## Info',
    '',
    findingTable(bySeverity('info')),
    '## Draft notes',
    '',
    notesTable(findings.filter(isNote)),
  ].join('\n');
}

// ─── build / write / CLI ──────────────────────────────────────────────────────

/**
 * buildReport({ projectRoot, userHome, draft, now, verifyOpts, verify }) ->
 *   { meta: { generated, id, profile, profile_source, components, unsupported_areas, counts },
 *     findings, text }
 *
 * The profile is `.planning/STACK.md` when it exists (and `draft` is false), else the in-memory
 * draft. Notes always come from a fresh draftProfile. Reads only; writes nothing.
 *
 * `components` is EXACTLY that profile's `components[].path` (TRD 42-12, gap G1) — never the
 * detected areas, which once listed unsupported node dirs the draft itself calls "not a
 * component". `unsupported_areas` lists the non-root language areas with no tier-2 profile that
 * the profile does not name as components. Findings stay per detected area either way.
 */
function buildReport({ projectRoot, userHome = null, draft = false, now = new Date(), verifyOpts = {}, verify = null } = {}) {
  // Lazy: stack-profile loads this module lazily through STACK_EXTENSIONS; a top-level require
  // would be a cycle.
  const sp = require('./stack-profile.cjs');
  const { localDate } = require('./helpers.cjs');
  const root = path.resolve(String(projectRoot));
  const areas = safeAreas(root);

  let drafted = null;
  try {
    drafted = sp.draftProfile({ projectRoot: root, userHome, now, verifyOpts, verify });
  } catch (_) {
    drafted = null;
  }

  let source = 'draft';
  let fm = drafted ? drafted.frontmatter : { id: path.basename(root), extends: 'general' };
  const stackPath = path.join(root, '.planning', 'STACK.md');
  if (!draft && fs.existsSync(stackPath)) {
    try {
      const parsed = sp.parseProfile(fs.readFileSync(stackPath, 'utf-8'), { source: stackPath });
      if (parsed && parsed.frontmatter) {
        fm = parsed.frontmatter;
        source = 'file';
      }
    } catch (_) {
      // an unparseable STACK.md: report against the draft, and say so via profile_source
    }
  }

  const records = buildRecords(root, { areas });
  const findings = computeFindings({ areas, records, notes: drafted ? drafted.notes : [], root });
  const components = (Array.isArray(fm.components) ? fm.components : [])
    .map((c) => (c && typeof c === 'object' ? c.path : null))
    .filter((p) => typeof p === 'string' && p !== '');
  const componentDirs = new Set(components.map(normDir));
  const unsupportedAreas = areas
    .filter((a) => a && a.dir && Array.isArray(a.kinds) && a.kinds.length && !a.tier)
    .map((a) => a.dir)
    .filter((dir) => !componentDirs.has(normDir(dir)));
  const meta = {
    generated: localDate(now),
    id: String(fm.id || path.basename(root)),
    profile: String(fm.extends || 'general'),
    profile_source: source,
    components,
    unsupported_areas: unsupportedAreas,
    counts: countsOf(findings),
  };
  return { meta, findings, text: renderReport(findings, meta) };
}

/** writeReport(root, text) — writes ONLY `.planning/STACK-REPORT.md` (creating `.planning`). */
function writeReport(root, text) {
  const target = path.join(path.resolve(String(root)), REPORT_REL);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, 'utf-8');
  return target;
}

/**
 * cli(cwd, args, raw, { userHome }) — `df-tools stack report [--write] [--draft]`. `args`
 * excludes the `report` token (the STACK_EXTENSIONS contract). Prints the markdown; under the
 * global `--raw` prints the JSON result instead. Exit 0: a report is proposals, never a failure.
 */
function cli(cwd, args, raw, { userHome = null } = {}) {
  const { output, error } = require('./helpers.cjs');
  let write = false;
  let draft = false;
  for (const a of args || []) {
    if (a === '--write') write = true;
    else if (a === '--draft') draft = true;
    else {
      error(String(a).startsWith('-')
        ? `unknown flag ${a}. stack report takes: --write, --draft (and the global --raw)`
        : `stack report takes no positional argument (got "${a}")`);
      return;
    }
  }
  let built;
  try {
    built = buildReport({ projectRoot: cwd, userHome: userHome || require('os').homedir(), draft });
  } catch (err) {
    error(err.message);
    return;
  }
  let action = 'preview';
  if (write) {
    writeReport(cwd, built.text);
    action = 'written';
  }
  const result = { action, path: REPORT_REL, ...built.meta, findings: built.findings };
  if (raw) output(result, false);
  else output(result, true, built.text);
}

module.exports = {
  REPORT_CHECKS,
  REPORT_REL,
  buildRecords,
  computeFindings,
  renderReport,
  buildReport,
  writeReport,
  cli,
  // exported for tests
  _weakMarkersOf: weakMarkersOf,
  _areaFor: areaFor,
};
