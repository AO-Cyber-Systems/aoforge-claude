'use strict';

// stack-draft.test.cjs — assembleDraft, pure (TRD 42-07 tests 11-15 and the assembly rules).
//
// - D11 preference: runner beats CI for a key; declared beats both.
// - D12 an apply-only format -> { run: 'discover', apply: 'just fmt' }.
// - D13 sast->audit collapse: gosec with no other audit candidate -> audit is gosec, no sast;
//       gosec + govulncheck -> sast gosec, audit govulncheck.
// - D14 a weak marker is kept verbatim (`--no-fatal-infos`) and recorded as a note.
// - D15 a best candidate equal to the tier default is not re-emitted; a single non-root area
//       re-emits with cwd (tier keys included, scoped kept).
// - D16 an unresolved candidate -> run: discover plus one note per candidate; `${{ }}` is never run.
// - D17 extends/components: 0 areas -> general + info note; 2+ areas -> components by tier id,
//       unsupported areas are notes; component commands that differ from the tier are notes.
// - D18 e2e: maestro only with a .maestro/ flag; a maestro candidate without one is dropped.
// - D19 loop for a general extends lists resolved format/lint/test; codegen/deps keep `when`.
// - D20 purity: stack-draft.cjs requires neither stack-profile.cjs nor fs.
//
// Evidence items and tier command maps are hand-built; `verify` is a stub, so nothing here
// touches the filesystem or PATH.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { assembleDraft } = require('./stack-draft.cjs');

const GENERAL = {
  build: { run: 'discover' },
  test: { run: 'discover' },
  lint: { run: 'discover' },
  format: { run: 'discover' },
  fix: { run: 'discover' },
  typecheck: { run: 'discover' },
  audit: { run: 'discover', when: 'deps_changed' },
  codegen: { run: 'discover', when: 'sources_changed' },
};
const GO = {
  ...GENERAL,
  build: { run: 'go build ./...' },
  test: { run: 'go test -race ./...', scoped: 'go test -race {packages}' },
  lint: { run: 'go vet ./...' },
  format: { run: 'test -z "$(gofmt -l .)"', apply: 'gofmt -w {files}' },
  audit: { run: 'govulncheck ./...', when: 'deps_changed' },
  codegen: { run: 'go generate ./...', when: 'sources_changed' },
};
const FLUTTER = {
  ...GENERAL,
  build: { run: 'discover' },
  test: { run: 'flutter test', scoped: 'flutter test {files}' },
  lint: { run: 'flutter analyze --fatal-infos' },
};
const TIERS = { general: GENERAL, go: GO, flutter: FLUTTER };

const ROOT_GO = [{ dir: '', kinds: ['go'], tier: 'go', flags: [], evidence: ['go.mod'] }];
const NO_AREAS = [];

/** ev(key, command, extra) — one evidence item with sensible defaults. */
function ev(key, command, extra = {}) {
  return {
    key,
    command,
    form: 'check',
    source: 'ci',
    sourceFile: '.github/workflows/ci.yml',
    cwd: null,
    area: '',
    runner: null,
    confidence: 'high',
    weak: [],
    tool: command.split(/\s+/)[0],
    ...extra,
  };
}

const resolvedAll = () => ({ status: 'resolved', detail: 'stub' });

describe('assembleDraft preference (D11)', () => {
  test('D11: a runner candidate beats a CI candidate; a declared candidate beats both', () => {
    const evidence = [
      ev('test', 'go test -count=1 ./...'),
      ev('test', 'make test', { source: 'runner', sourceFile: 'Makefile', runner: 'make', tool: 'go' }),
    ];
    const d1 = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d1.extendsId, 'go');
    assert.equal(d1.commands.test.run, 'make test');

    const d2 = assembleDraft({
      areas: ROOT_GO,
      evidence: [...evidence, ev('test', 'go test -short ./...', { source: 'declared', sourceFile: '.planning/codebase/STACK.md' })],
      tierCommands: TIERS,
      verify: resolvedAll,
    });
    assert.equal(d2.commands.test.run, 'go test -short ./...');
  });

  test('D11b: within a source, high confidence beats low and non-weak beats weak', () => {
    const evidence = [
      ev('lint', 'make check', { source: 'runner', runner: 'make', confidence: 'low', tool: null }),
      ev('lint', 'make vet', { source: 'runner', runner: 'make', weak: ['|| true'], tool: 'go' }),
      ev('lint', 'make lint', { source: 'runner', runner: 'make', tool: 'golangci-lint' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.lint.run, 'make lint');
  });
});

describe('assembleDraft forms (D12)', () => {
  test('D12: an apply-only format gives { run: discover, apply: just fmt }', () => {
    const evidence = [ev('format', 'just fmt', { source: 'runner', runner: 'just', form: 'apply', tool: 'gofmt' })];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.format, { run: 'discover', apply: 'just fmt' });
  });

  test('D12b: a check form beside an apply form fills both run and apply', () => {
    const evidence = [
      ev('format', 'make fmt', { source: 'runner', runner: 'make', form: 'apply', tool: 'gofmt' }),
      ev('format', 'make fmt-check', { source: 'runner', runner: 'make', form: 'check', tool: 'gofmt' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.format, { run: 'make fmt-check', apply: 'make fmt' });
  });
});

describe('assembleDraft sast/audit (D13)', () => {
  test('D13: gosec with NO other audit candidate collapses into audit; no sast key', () => {
    const evidence = [ev('sast', 'gosec -exclude=G104 ./...', { tool: 'gosec' })];
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.ok(d.commands.audit, JSON.stringify(d.commands));
    assert.match(d.commands.audit.run, /^gosec /);
    assert.equal('sast' in d.commands, false);
  });

  test('D13b: gosec plus govulncheck -> sast is gosec, audit is govulncheck', () => {
    const evidence = [
      ev('sast', 'gosec ./...', { tool: 'gosec' }),
      ev('audit', 'govulncheck -show verbose ./...', { tool: 'govulncheck' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.sast.run, 'gosec ./...');
    assert.equal(d.commands.audit.run, 'govulncheck -show verbose ./...');
  });
});

describe('assembleDraft weak markers (D14)', () => {
  test('D14: flutter analyze --no-fatal-infos stays verbatim as lint.run, with a weak note', () => {
    const areas = [{ dir: '', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] }];
    const evidence = [ev('lint', 'flutter analyze --no-fatal-infos', { weak: ['--no-fatal-infos'], tool: 'flutter' })];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'flutter');
    assert.equal(d.commands.lint.run, 'flutter analyze --no-fatal-infos');
    const note = d.notes.find((n) => n.key === 'lint');
    assert.ok(note, JSON.stringify(d.notes));
    assert.equal(note.status, 'resolved');
    assert.deepStrictEqual(note.weak, ['--no-fatal-infos']);
    assert.equal(note.candidate, 'flutter analyze --no-fatal-infos');
  });
});

describe('assembleDraft tier defaults and cwd (D15)', () => {
  test('D15: a best candidate equal to the tier default is not re-emitted (inherited)', () => {
    const evidence = [ev('lint', 'go vet ./...', { tool: 'go' })];
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal('lint' in d.commands, false);
    assert.ok(d.inheritedKeys.includes('lint'));
  });

  test('D15b: a runner target whose body IS the tier default is inherited too', () => {
    const evidence = [ev('lint', 'make vet', { source: 'runner', runner: 'make', tool: 'go', resolvesTo: 'go vet ./...' })];
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal('lint' in d.commands, false);
  });

  test('D15c: a single non-root area extends its tier and re-emits with cwd (tier keys keep scoped)', () => {
    const areas = [{ dir: 'svc/', kinds: ['go'], tier: 'go', flags: [] }];
    const evidence = [
      ev('lint', 'make lint', { source: 'runner', runner: 'make', cwd: 'svc', area: 'svc/', tool: 'golangci-lint' }),
      ev('lint', 'go vet ./...', { cwd: 'svc', area: 'svc/', tool: 'go' }),
    ];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'go');
    assert.deepStrictEqual(d.components, []);
    assert.deepStrictEqual(d.commands.lint, { run: 'make lint', cwd: 'svc' });
    assert.deepStrictEqual(d.commands.test, { run: 'go test -race ./...', scoped: 'go test -race {packages}', cwd: 'svc' });
    assert.equal(d.commands.codegen.when, 'sources_changed');
    assert.equal(d.commands.codegen.cwd, 'svc');
  });

  test('D15d: a re-emitted command from the same tool as the tier default keeps the tier scoped form', () => {
    const evidence = [ev('test', 'go test ./...', { tool: 'go' })];
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.test, { run: 'go test ./...', scoped: 'go test -race {packages}' });
  });
});

describe('assembleDraft verification (D16)', () => {
  test('D16: no resolved candidate -> run: discover plus one note per candidate', () => {
    const evidence = [ev('test', 'ginkgo -r -p', { tool: 'ginkgo' })];
    const verify = (cmd) => (cmd.startsWith('ginkgo')
      ? { status: 'binary_missing', detail: 'ginkgo not found on PATH' }
      : { status: 'resolved', detail: 'stub' });
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify });
    assert.deepStrictEqual(d.commands.test, { run: 'discover' });
    const note = d.notes.find((n) => n.key === 'test');
    assert.ok(note);
    assert.equal(note.status, 'binary_missing');
    assert.equal(note.candidate, 'ginkgo -r -p');
    assert.equal(note.source, 'ci');
    assert.equal(note.area, '');
  });

  test('D16b: the first RESOLVED candidate wins over an unresolved better-ranked one (noted)', () => {
    const evidence = [
      ev('test', 'make test', { source: 'runner', runner: 'make', tool: 'go' }),
      ev('test', 'go test -count=1 ./...', { tool: 'go' }),
    ];
    const verify = (cmd) => (cmd === 'make test' ? { status: 'target_missing', detail: 'no make target' } : { status: 'resolved', detail: 'ok' });
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify });
    assert.equal(d.commands.test.run, 'go test -count=1 ./...');
    assert.ok(d.notes.some((n) => n.key === 'test' && n.status === 'target_missing'));
  });

  test('D16c: a `${{ }}` command is unverifiable, never a run', () => {
    const evidence = [ev('build', 'flutter build ipa --build-number="${{ github.run_number }}"', { form: 'build', tool: 'flutter' })];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.build, { run: 'discover' });
    assert.ok(d.notes.some((n) => n.key === 'build' && n.status === 'unverifiable'));
  });

  test('D16d: verify results are cached per (command, cwd)', () => {
    let calls = 0;
    const verify = () => { calls++; return { status: 'resolved', detail: 'ok' }; };
    const evidence = [ev('lint', 'make lint', { runner: 'make' }), ev('lint', 'make lint', { runner: 'make', source: 'runner' })];
    assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify });
    assert.equal(calls, 1);
  });
});

describe('assembleDraft extends and components (D17)', () => {
  test('D17: no language area and no evidence -> general, {} and an info note', () => {
    const d = assembleDraft({ areas: NO_AREAS, evidence: [], tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'general');
    assert.deepStrictEqual(d.commands, {});
    assert.deepStrictEqual(d.components, []);
    assert.ok(d.notes.some((n) => n.status === 'info'));
    assert.equal(d.loop, undefined);
  });

  test('D17b: 2+ areas -> general root, components by tier id; component-only commands become notes', () => {
    const areas = [
      { dir: 'app/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] },
      { dir: 'portal/', kinds: ['node'], tier: null, unsupported: 'node', flags: ['unsupported'] },
      { dir: 'svc/', kinds: ['go'], tier: 'go', flags: [] },
    ];
    const evidence = [
      ev('test', 'go test -race -count=1 ./...', { cwd: 'svc', area: 'svc/', tool: 'go' }),
      ev('lint', 'go vet ./...', { cwd: 'svc', area: 'svc/', tool: 'go' }),
      ev('lint_helm', 'helm lint chart/', { tool: 'helm' }),
    ];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'general');
    assert.deepStrictEqual(d.components, [{ path: 'app/', profile: 'flutter' }, { path: 'svc/', profile: 'go' }]);
    assert.deepStrictEqual(d.commands.lint_helm, { run: 'helm lint chart/' });
    assert.equal('test' in d.commands, false, 'a component command is not a root command');
    assert.ok(d.notes.some((n) => n.area === 'svc/' && n.key === 'test' && n.candidate.includes('-count=1')));
    assert.ok(!d.notes.some((n) => n.area === 'svc/' && n.key === 'lint'), 'equal to the tier default: nothing to note');
    assert.ok(d.notes.some((n) => n.area === 'portal/' && n.status === 'info'), 'an unsupported area is noted');
  });

  test('D17c: an explicit extends wins for the root', () => {
    const d = assembleDraft({ areas: ROOT_GO, evidence: [], tierCommands: { ...TIERS, golike: GENERAL }, verify: resolvedAll, extendsId: 'golike' });
    assert.equal(d.extendsId, 'golike');
  });
});

describe('assembleDraft e2e (D18)', () => {
  test('D18: a .maestro/ flag adds `maestro test .maestro`; without it a maestro candidate is dropped', () => {
    const areas = [{ dir: '', kinds: ['dart', 'flutter'], tier: 'flutter', flags: ['maestro'] }];
    const d = assembleDraft({ areas, evidence: [], tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.e2e, { run: 'maestro test .maestro' });

    const bare = [{ dir: '', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] }];
    const d2 = assembleDraft({ areas: bare, evidence: [ev('e2e', 'maestro test flows/', { tool: 'maestro' })], tierCommands: TIERS, verify: resolvedAll });
    assert.equal('e2e' in d2.commands, false);

    const d3 = assembleDraft({ areas: bare, evidence: [ev('e2e', 'npx playwright test', { tool: 'playwright' })], tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d3.commands.e2e.run, 'npx playwright test');
  });
});

describe('assembleDraft loop and when (D19)', () => {
  test('D19: a general extends emits loop from resolved format/lint/test; codegen/deps keep when', () => {
    const evidence = [
      ev('lint', 'npm run lint', { source: 'manifest', runner: 'npm' }),
      ev('test', 'npm test', { source: 'manifest', runner: 'npm' }),
      ev('codegen', 'buf generate', { form: 'mutate', tool: 'buf' }),
      ev('deps', 'npm ci', { form: 'mutate', tool: 'npm' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.loop, ['lint', 'test']);
    assert.deepStrictEqual(d.commands.codegen, { run: 'buf generate', when: 'sources_changed' });
    assert.deepStrictEqual(d.commands.deps, { run: 'npm ci', when: 'deps_changed' });
    assert.deepStrictEqual(d.sources, ['.github/workflows/ci.yml']);
    assert.deepStrictEqual(d.resolvedKeys.sort(), ['codegen', 'deps', 'lint', 'test']);
  });
});

describe('stack-draft purity (D20)', () => {
  test('D20: stack-draft.cjs requires neither stack-profile.cjs nor fs', () => {
    const src = fs.readFileSync(path.join(__dirname, 'stack-draft.cjs'), 'utf-8');
    assert.ok(!/require\(['"]\.\/stack-profile\.cjs['"]\)/.test(src));
    assert.ok(!/require\(['"]fs['"]\)/.test(src));
  });
});

// ─── TRD 42-13: the repo-wide test is broad; runner picks are canonical ─────────
//
// - D21 (test 3) only narrow test candidates + a parent test -> no test key, one `narrow` note each.
// - D22 (test 4) only narrow test candidates, no parent test -> test: discover, plus the notes.
// - D23 (test 5) a broad CI test beats a narrow runner target even though runner outranks CI.
// - D24 (test 6) narrow notes carry the key the candidate FITS (integration / e2e); no new keys.
// - D25 (test 7) canonical runner ranking for build/test/lint, alternates noted; other keys and
//       non-runner sources keep their order.

/** rt(key, name, extra) — a runner-target evidence item carrying stack-evidence's target metadata. */
function rt(key, name, extra = {}) {
  const { deps = [], isDefault = false, dependedOn = false, order = 0, runner = 'task', body, ...rest } = extra;
  const tool = { build: 'go', test: 'go', lint: 'go', codegen: 'go' }[key] || null;
  const defaults = { build: 'go build ./...', test: 'go test ./...', lint: 'go vet ./...', codegen: 'go generate ./...' };
  return ev(key, `${runner} ${name}`, {
    source: 'runner',
    sourceFile: runner === 'make' ? 'Makefile' : 'Taskfile.yml',
    runner,
    tool,
    form: key === 'build' ? 'build' : key === 'codegen' ? 'mutate' : 'check',
    target: { name, deps, isDefault, dependedOn, order },
    bodyInvocations: body || [defaults[key] || `${key} ./...`],
    ...rest,
  });
}

describe('assembleDraft narrow test candidates (D21-D24, TRD 42-13)', () => {
  test('D21: only narrow test candidates + a parent test -> no test override, one narrow note each', () => {
    const evidence = [
      ev('test', 'go test -c -o /tmp/guard.test ./tests/guard/', { tool: 'go', sourceFile: '.github/workflows/guard.yml' }),
      ev('test', 'go test -run TestSmoke ./...', { tool: 'go' }),
    ];
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal('test' in d.commands, false, JSON.stringify(d.commands));
    assert.ok(d.inheritedKeys.includes('test'));
    const narrow = d.notes.filter((n) => n.status === 'narrow');
    assert.equal(narrow.length, 2, JSON.stringify(d.notes));
    const guard = narrow.find((n) => n.candidate.startsWith('go test -c'));
    assert.equal(guard.key, 'test');
    assert.match(guard.detail, /compile-only/);
    assert.equal(guard.source, 'ci');
    assert.match(narrow.find((n) => n.candidate.includes('-run')).detail, /run-filter/);
  });

  test('D21b: a single non-root area inherits the parent test WITH its cwd when only narrow candidates exist', () => {
    const areas = [{ dir: 'svc/', kinds: ['go'], tier: 'go', flags: [] }];
    const evidence = [ev('test', 'go test ./tests/guard/', { tool: 'go', cwd: 'svc', area: 'svc/' })];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.test, { run: 'go test -race ./...', scoped: 'go test -race {packages}', cwd: 'svc' });
    assert.ok(d.notes.some((n) => n.status === 'narrow' && n.area === 'svc/'));
  });

  test('D22: only narrow test candidates and no parent test -> test: discover, plus the notes', () => {
    const evidence = [ev('test', 'go test -c ./tests/guard/', { tool: 'go' })];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.test, { run: 'discover' });
    assert.ok(d.notes.some((n) => n.status === 'narrow' && n.key === 'test'), JSON.stringify(d.notes));
    assert.equal(d.loop, undefined, 'a discover test is not a loop key');
  });

  test('D23: a broad CI test beats a narrow runner target, though runner outranks CI', () => {
    const evidence = [
      ev('test', 'go test -race ./...', { tool: 'go' }),
      rt('test', 'test:unit', { body: ['go test ./pkg/unit/'] }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.test.run, 'go test -race ./...');
    const n = d.notes.find((x) => x.candidate === 'task test:unit');
    assert.ok(n, JSON.stringify(d.notes));
    assert.equal(n.status, 'narrow');
    assert.equal(n.key, 'test');
    assert.match(n.detail, /single-path/);
  });

  test('D23b: a runner target is narrow only when no test invocation in its body is broad', () => {
    const evidence = [
      rt('test', 'test', { body: ['go test ./...', 'go test -tags=integration ./...'] }),
      ev('test', 'go test -count=1 ./...', { tool: 'go' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.test.run, 'task test', 'a broad invocation in the body keeps the target broad');
    assert.ok(!d.notes.some((n) => n.status === 'narrow'));
  });

  test('D24: -tags=integration is noted under `integration`, ./e2e/... under `e2e`; neither becomes a key', () => {
    const evidence = [
      ev('test', 'go test -tags=integration ./...', { tool: 'go' }),
      ev('test', 'go test ./e2e/...', { tool: 'go' }),
    ];
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    const byCandidate = Object.fromEntries(d.notes.filter((n) => n.status === 'narrow').map((n) => [n.candidate, n.key]));
    assert.deepStrictEqual(byCandidate, { 'go test -tags=integration ./...': 'integration', 'go test ./e2e/...': 'e2e' });
    assert.equal('integration' in d.commands, false);
    assert.equal('e2e' in d.commands, false);
    assert.equal('test' in d.commands, false);
  });

  test('D24b: a chosen test whose breadth cannot be read is kept (as today) and noted breadth-unknown', () => {
    const evidence = [ev('test', 'make test', { source: 'runner', runner: 'make', tool: null, confidence: 'low' })];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.test.run, 'make test');
    const n = d.notes.find((x) => x.status === 'breadth-unknown');
    assert.ok(n, JSON.stringify(d.notes));
    assert.equal(n.key, 'test');
    assert.equal(n.candidate, 'make test');
  });
});

describe('assembleDraft canonical runner targets (D25, TRD 42-13 test 7)', () => {
  const pick = (evidence, key = 'build') => assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll }).commands[key].run;

  test('D25a: bare `build` beats `build:backend`', () => {
    assert.equal(pick([rt('build', 'build:backend', { order: 0 }), rt('build', 'build', { order: 1 })]), 'task build');
  });

  test('D25b: with no bare one, the target the Taskfile `default` depends on wins (depended-on)', () => {
    const evidence = [
      rt('build', 'build:frontend', { order: 1 }),
      rt('build', 'build:backend', { order: 2, dependedOn: true, confidence: 'low' }),
    ];
    assert.equal(pick(evidence), 'task build:backend', 'depended-on outranks confidence and source order');
  });

  test('D25c: `build:backend` beats `build:agent:internal` (fewer segments, no variant token)', () => {
    const evidence = [
      rt('build', 'build:agent:internal', { order: 3, dependedOn: true }),
      rt('build', 'build:backend', { order: 5, dependedOn: true, confidence: 'low' }),
    ];
    assert.equal(pick(evidence), 'task build:backend');
  });

  test('D25d: `build` beats `build:macos`; a variant token loses at equal segments', () => {
    assert.equal(pick([rt('build', 'build:macos', { order: 0 }), rt('build', 'build', { order: 1 })]), 'task build');
    assert.equal(pick([rt('build', 'build:dev', { order: 0 }), rt('build', 'build:app', { order: 1 })]), 'task build:app');
  });

  test('D25e: Make `.DEFAULT_GOAL := all` (all classifies to build) beats `build-dev`', () => {
    const evidence = [
      rt('build', 'build-dev', { runner: 'make', order: 0 }),
      rt('build', 'all', { runner: 'make', order: 2, isDefault: true }),
    ];
    assert.equal(pick(evidence), 'make all');
  });

  test('D25f: with every canonical criterion equal, source order decides (never the alphabet)', () => {
    const evidence = [
      rt('build', 'build:api', { order: 5 }),
      rt('build', 'build:web', { order: 2 }),
    ];
    assert.equal(pick(evidence), 'task build:web');
  });

  test('D25g: losing runner candidates become `alternate` notes naming the canonical pick', () => {
    const evidence = [
      rt('build', 'build:agent:internal', { order: 3, dependedOn: true }),
      rt('build', 'build:agent:quickdev', { order: 4 }),
      rt('build', 'build:backend', { order: 5, dependedOn: true }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.build.run, 'task build:backend');
    const alternates = d.notes.filter((n) => n.status === 'alternate');
    assert.deepStrictEqual(alternates.map((n) => n.candidate).sort(), ['task build:agent:internal', 'task build:agent:quickdev']);
    for (const n of alternates) {
      assert.equal(n.key, 'build');
      assert.match(n.detail, /canonical pick: task build:backend/);
    }
  });

  test('D25h: an unresolved losing runner candidate is not an alternate', () => {
    const evidence = [rt('lint', 'lint', { order: 0 }), rt('lint', 'lint:internal', { order: 1 })];
    const verify = (cmd) => (cmd === 'task lint:internal' ? { status: 'target_missing', detail: 'gone' } : { status: 'resolved', detail: 'ok' });
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify });
    assert.equal(d.commands.lint.run, 'task lint');
    assert.ok(!d.notes.some((n) => n.status === 'alternate'), JSON.stringify(d.notes));
  });

  test('D25i: canonical ranking is gated to build/test/lint; other keys keep evidence order and add no alternates', () => {
    const evidence = [
      rt('codegen', 'gen:proto:internal', { order: 0 }),
      rt('codegen', 'gen', { order: 1, isDefault: true, dependedOn: true }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.codegen.run, 'task gen:proto:internal');
    assert.ok(!d.notes.some((n) => n.status === 'alternate'));
  });

  test('D25j: the source order is unchanged: a declared build still beats a canonical runner target', () => {
    const evidence = [
      rt('build', 'build', { order: 0 }),
      ev('build', 'go build -o bin/app ./cmd/app', { source: 'declared', form: 'build', tool: 'go' }),
    ];
    assert.equal(pick(evidence), 'go build -o bin/app ./cmd/app');
  });
});

// ─── TRD 42-14: command cwd hygiene (tests 1-3) ───────────────────────────────
//
// - D26 (test 1) CI at `working-directory: svcrepo/go` (self checkout `path: svcrepo`) in a repo
//       with go/ is placed with cwd `go`; `libs/pkg-a` (sibling checkout) is a cwd_external note.
// - D27 (test 2) ignored / untracked / nested-repo cwds are notes (cwd_ignored, cwd_untracked,
//       cwd_nested_repo), never commands, and are never even verified.
// - D28 (test 3) verify's cwd_missing on the only candidate gives `discover` + a note; an item the
//       hygiene already called `missing` does the same without asking verify, and never inherits.

const { collectEvidence } = require('./stack-evidence.cjs');
const ciFx = require('./__fixtures__/stack-ci-fixtures.cjs');

describe('assembleDraft command cwd hygiene (D26-D28, TRD 42-14)', () => {
  test('D26: a self-checkout cwd is placed normalised; a sibling-checkout cwd is a cwd_external note', () => {
    const root = ciFx.selfCheckoutPathShape();
    try {
      const evidence = collectEvidence(root, { areas: [] });
      const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
      assert.deepStrictEqual(d.commands.test, { run: 'go test ./...', cwd: 'go' }, JSON.stringify(d.commands));
      for (const [key, entry] of Object.entries(d.commands)) {
        assert.notEqual(entry.run, 'flutter analyze', `${key}: an external command was placed`);
        assert.ok(!entry.cwd || !entry.cwd.startsWith('svcrepo') && !entry.cwd.startsWith('libs/'), `${key}: ${JSON.stringify(entry)}`);
      }
      const ext = d.notes.find((n) => n.candidate === 'flutter analyze');
      assert.ok(ext, JSON.stringify(d.notes));
      assert.equal(ext.status, 'cwd_external');
      assert.match(ext.detail, /libs\/pkg-a/);
    } finally {
      ciFx.cleanup(root);
    }
  });

  test('D27: ignored / untracked / nested-repo cwds are notes, never commands, never verified', () => {
    const verified = [];
    const verify = (command, cwd) => { verified.push(`${cwd}|${command}`); return { status: 'resolved', detail: 'stub' }; };
    const evidence = [
      ev('test', 'go test ./...', { cwd: '.snapshot/api', cwdStatus: 'ignored' }),
      ev('lint', 'golangci-lint run', { cwd: 'scratch', cwdStatus: 'untracked' }),
      ev('build', 'go build ./...', { cwd: 'vendored-sdk', cwdStatus: 'nested_repo' }),
      ev('format', 'dart format --set-exit-if-changed .', { cwd: 'libs/pkg-a', cwdStatus: 'external' }),
      ev('typecheck', 'tsc --noEmit', { cwdStatus: 'ok' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify });
    assert.deepStrictEqual(Object.keys(d.commands), ['typecheck'], JSON.stringify(d.commands));
    assert.deepStrictEqual(verified, ['|tsc --noEmit']);
    const statusOf = (candidate) => (d.notes.find((n) => n.candidate === candidate) || {}).status;
    assert.equal(statusOf('go test ./...'), 'cwd_ignored');
    assert.equal(statusOf('golangci-lint run'), 'cwd_untracked');
    assert.equal(statusOf('go build ./...'), 'cwd_nested_repo');
    assert.equal(statusOf('dart format --set-exit-if-changed .'), 'cwd_external');
    for (const n of d.notes.filter((x) => /^cwd_/.test(x.status))) assert.ok(n.key, JSON.stringify(n));
  });

  test('D27b: a hygiene-excluded candidate does not block a clean one for the same key', () => {
    const evidence = [
      ev('test', 'go test ./...', { source: 'runner', cwd: '.snapshot/api', cwdStatus: 'ignored' }),
      ev('test', 'go test -count=1 ./...', { cwdStatus: 'ok' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.test, { run: 'go test -count=1 ./...' });
    assert.equal(d.notes.find((n) => n.candidate === 'go test ./...').status, 'cwd_ignored');
  });

  test('D28: verify says cwd_missing for the only candidate -> discover + a cwd_missing note', () => {
    const verify = () => ({ status: 'cwd_missing', detail: 'nope does not exist under the repo root' });
    const d = assembleDraft({ areas: NO_AREAS, evidence: [ev('test', 'go test ./...', { cwd: 'nope' })], tierCommands: TIERS, verify });
    assert.deepStrictEqual(d.commands.test, { run: 'discover' });
    const n = d.notes.find((x) => x.candidate === 'go test ./...');
    assert.equal(n.status, 'cwd_missing');
    assert.match(n.detail, /nope does not exist/);
  });

  test('D28b: an item the hygiene called missing is cwd_missing without verify, and never inherits the tier default there', () => {
    let calls = 0;
    const verify = () => { calls += 1; return { status: 'resolved', detail: 'stub' }; };
    const d = assembleDraft({
      areas: ROOT_GO,
      evidence: [ev('test', 'go test -race ./...', { cwd: 'nope', cwdStatus: 'missing' })],
      tierCommands: TIERS,
      verify,
    });
    assert.equal(calls, 0);
    assert.deepStrictEqual(d.commands.test, { run: 'discover' }, JSON.stringify(d.commands));
    const n = d.notes.find((x) => x.candidate === 'go test -race ./...');
    assert.equal(n.status, 'cwd_missing');
    assert.match(n.detail, /nope does not exist under the repo root/);
  });
});

// ─── TRD 42-15 tests 8-11: the root-override policy (D3) ──────────────────────
//
// Repo-root commands cover the repo's primary stack. For a key the extends profile supplies with a
// runnable run, only a root candidate whose body runs a tool of the tier's stack family
// (stack-classify.TIER_STACKS) at the root may override it; the rest are `off_stack` notes and
// the profile default applies. A candidate whose effectiveArea is an unsupported sub-area is a
// `sub_area` note for ANY key; one whose effectiveArea is a component is noted against it.

describe('assembleDraft root-override policy (D3, TRD 42-15)', () => {
  const SITE_AREAS = [
    ...ROOT_GO,
    { dir: 'site/', kinds: ['node'], tier: null, unsupported: 'node', flags: ['unsupported'] },
    { dir: 'ui/', kinds: ['node'], tier: null, unsupported: 'node', flags: ['unsupported'] },
  ];

  test('D29 (test 8): a profile-supplied key with only off-stack root candidates is inherited, with off_stack notes', () => {
    const evidence = [
      ev('test', 'npm test', { source: 'manifest', sourceFile: 'package.json', runner: 'npm', tool: 'vitest', bodyStacks: ['node'], effectiveArea: '' }),
      ev('test', 'npm test', { runner: 'npm', tool: 'vitest', bodyStacks: ['node'], effectiveArea: '' }),
      ev('test', 'make check-all', { source: 'runner', sourceFile: 'Makefile', runner: 'make', tool: null, confidence: 'low', bodyStacks: [], effectiveArea: '' }),
    ];
    const d = assembleDraft({ areas: SITE_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'go');
    assert.equal('test' in d.commands, false, JSON.stringify(d.commands.test));
    assert.ok(d.inheritedKeys.includes('test'));
    const off = d.notes.filter((n) => n.status === 'off_stack');
    assert.ok(off.some((n) => n.key === 'test' && n.candidate === 'npm test' && /node/.test(n.detail) && /extends go/.test(n.detail)), JSON.stringify(d.notes));
    assert.ok(off.some((n) => n.candidate === 'make check-all' && /unknown/.test(n.detail)), 'an opaque body has no stack: never a match');
  });

  test('D30 (test 9): a stack-matching root candidate overrides as today (runner body decides; flutter covers dart)', () => {
    const evidence = [
      ev('test', 'task test', { source: 'runner', sourceFile: 'Taskfile.yml', runner: 'task', tool: 'go', bodyStacks: ['go'], effectiveArea: '' }),
      ev('test', 'npm test', { source: 'manifest', runner: 'npm', tool: 'vitest', bodyStacks: ['node'], effectiveArea: '' }),
    ];
    const d = assembleDraft({ areas: SITE_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.test.run, 'task test');

    const flutterRoot = [{ dir: '', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] }];
    const d2 = assembleDraft({
      areas: flutterRoot,
      evidence: [ev('lint', 'dart analyze', { tool: 'dart', bodyStacks: ['dart'], effectiveArea: '' })],
      tierCommands: TIERS,
      verify: resolvedAll,
    });
    assert.equal(d2.commands.lint.run, 'dart analyze', 'TIER_STACKS.flutter includes dart');
  });

  test('D30b: a mixed body matches only when a tier-stack invocation runs at the root; the mix is noted', () => {
    const mixed = ev('test', 'task ci', {
      source: 'runner', runner: 'task', tool: 'go', bodyStacks: ['go', 'node'], effectiveArea: '',
      bodyScopes: [{ stack: 'go', area: '' }, { stack: 'node', area: 'ui/' }],
    });
    const d = assembleDraft({ areas: SITE_AREAS, evidence: [mixed], tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.test.run, 'task ci');
    assert.ok(d.notes.some((n) => n.key === 'test' && n.status === 'mixed_stack' && /node/.test(n.detail)), JSON.stringify(d.notes));

    const goOnlyInSub = ev('test', 'task ci', {
      source: 'runner', runner: 'task', tool: null, bodyStacks: ['go', 'node'], effectiveArea: '',
      bodyScopes: [{ stack: 'go', area: 'ui/' }, { stack: 'node', area: '' }],
    });
    const d2 = assembleDraft({ areas: SITE_AREAS, evidence: [goOnlyInSub], tierCommands: TIERS, verify: resolvedAll });
    assert.equal('test' in d2.commands, false, 'the go invocation does not run at the root');
    assert.ok(d2.notes.some((n) => n.status === 'off_stack' && n.candidate === 'task ci'));
  });

  test('D31 (test 10): an effectiveArea in an unsupported sub-area is a sub_area note for ANY key, never a root command', () => {
    const evidence = [
      ev('deps', 'task docs:npm:install', { source: 'runner', runner: 'task', form: 'mutate', tool: 'npm', bodyStacks: ['node'], effectiveArea: 'site/' }),
      ev('e2e', 'npx playwright test', { tool: 'playwright', cwd: 'ui', area: 'ui/', bodyStacks: ['node'], effectiveArea: 'ui/' }),
      ev('build', 'task build:site', { source: 'runner', runner: 'task', form: 'build', tool: null, bodyStacks: ['node'], effectiveArea: 'site/' }),
    ];
    const d = assembleDraft({ areas: SITE_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal('deps' in d.commands, false, JSON.stringify(d.commands));
    assert.equal('e2e' in d.commands, false, 'an attachable key from an unsupported sub-area is not placed either');
    assert.equal('build' in d.commands, false);
    const sub = d.notes.filter((n) => n.status === 'sub_area');
    assert.ok(sub.some((n) => n.key === 'deps' && n.candidate === 'task docs:npm:install' && /site\//.test(n.detail)), JSON.stringify(d.notes));
    assert.ok(sub.some((n) => n.key === 'e2e' && /ui\//.test(n.detail)));
    assert.ok(sub.some((n) => n.key === 'build' && n.candidate === 'task build:site'));
  });

  test('D31b: an effectiveArea that is a component is noted against the component, never a root override', () => {
    const areas = [
      ...ROOT_GO,
      { dir: 'app/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] },
    ];
    const evidence = [
      ev('test', 'task app:test', { source: 'runner', runner: 'task', tool: 'flutter', bodyStacks: ['flutter'], effectiveArea: 'app/' }),
    ];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.components, [{ path: 'app/', profile: 'flutter' }]);
    assert.equal('test' in d.commands, false);
    const n = d.notes.find((x) => x.candidate === 'task app:test');
    assert.ok(n, JSON.stringify(d.notes));
    assert.equal(n.area, 'app/');
    assert.match(n.detail, /component app\/ uses tier flutter/);
  });

  test('D32 (test 11): keys the profile does not supply keep today\'s behaviour for root candidates', () => {
    const evidence = [
      ev('e2e', 'npx playwright test', { tool: 'playwright', bodyStacks: ['node'], effectiveArea: '' }),
      ev('lint_helm', 'helm lint chart/', { tool: 'helm', bodyStacks: ['helm'], effectiveArea: '' }),
      ev('deps', 'npm ci', { form: 'mutate', tool: 'npm', bodyStacks: ['node'], effectiveArea: '' }),
    ];
    const d = assembleDraft({ areas: SITE_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.e2e.run, 'npx playwright test');
    assert.equal(d.commands.lint_helm.run, 'helm lint chart/');
    assert.deepStrictEqual(d.commands.deps, { run: 'npm ci', when: 'deps_changed' });
    assert.ok(!d.notes.some((n) => n.status === 'off_stack'), JSON.stringify(d.notes));
  });

  test('D32b: with extends general the stack gate is a no-op', () => {
    const evidence = [ev('test', 'npm test', { source: 'manifest', runner: 'npm', tool: 'vitest', bodyStacks: ['node'], effectiveArea: '' })];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'general');
    assert.equal(d.commands.test.run, 'npm test');
  });
});

describe('assembleDraft root-override policy: neutral generators (TRD 42-15 recovery)', () => {
  const { NEUTRAL_STACK } = require('./stack-classify.cjs');

  test('D30c: a codegen whose body runs a language-neutral generator overrides a go profile; a node one does not', () => {
    const evidence = [
      ev('codegen', 'make proto', { source: 'runner', runner: 'make', form: 'mutate', tool: 'buf', bodyStacks: [NEUTRAL_STACK], effectiveArea: '' }),
    ];
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.codegen, { run: 'make proto', when: 'sources_changed' });
    assert.ok(!d.notes.some((n) => n.status === 'off_stack' || n.status === 'mixed_stack'), JSON.stringify(d.notes));

    const node = [ev('codegen', 'npm run gen', { source: 'manifest', runner: 'npm', form: 'mutate', tool: null, bodyStacks: ['node'], effectiveArea: '' })];
    const d2 = assembleDraft({ areas: ROOT_GO, evidence: node, tierCommands: TIERS, verify: resolvedAll });
    assert.equal('codegen' in d2.commands, false);
    assert.ok(d2.notes.some((n) => n.status === 'off_stack' && n.candidate === 'npm run gen'));
  });
});

// TRD 43-04 (D4, test 8): a single-purpose script (stack-evidence sets `singlePurpose`; this module
// only reads the flag, so it stays pure) is narrow in breadthOf and can never become the repo-wide test.
describe('assembleDraft single-purpose scripts are narrow (D33, TRD 43-04)', () => {
  const script = (extra = {}) => ev('test', './go/scripts/check-migrations_test.sh', {
    runner: 'script', tool: null, confidence: 'low', singlePurpose: true, bodyStacks: ['go'], ...extra,
  });

  test('D33: a singlePurpose script never fills test: one narrow note, the parent test is inherited', () => {
    const d = assembleDraft({ areas: ROOT_GO, evidence: [script()], tierCommands: TIERS, verify: resolvedAll });
    assert.equal('test' in d.commands, false, JSON.stringify(d.commands));
    assert.ok(d.inheritedKeys.includes('test'));
    const n = d.notes.filter((x) => x.status === 'narrow');
    assert.equal(n.length, 1, JSON.stringify(d.notes));
    assert.equal(n[0].key, 'test');
    assert.equal(n[0].candidate, './go/scripts/check-migrations_test.sh');
    assert.match(n[0].detail, /single-purpose script/);
  });

  test('D33b: it is narrow even when its body reads as broad, and it beats nothing: a broad CI test is chosen', () => {
    const evidence = [
      script({ bodyInvocations: ['go test -race ./...'], confidence: 'high', source: 'runner' }),
      ev('test', 'go test -count=1 ./...', { tool: 'go' }),
    ];
    const d = assembleDraft({ areas: ROOT_GO, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.test.run, 'go test -count=1 ./...');
    assert.ok(d.notes.some((x) => x.status === 'narrow' && /single-purpose script/.test(x.detail)), JSON.stringify(d.notes));
  });

  test('D33c: with no parent test the only candidate being narrow gives test: discover and the note', () => {
    const d = assembleDraft({ areas: NO_AREAS, evidence: [script()], tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.test, { run: 'discover' });
    assert.ok(d.notes.some((x) => x.status === 'narrow' && x.key === 'test'), JSON.stringify(d.notes));
  });

  test('D33d: the same script without the flag stays a candidate (no name guessing here: evidence owns the flag)', () => {
    const d = assembleDraft({ areas: NO_AREAS, evidence: [script({ singlePurpose: undefined })], tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.test.run, './go/scripts/check-migrations_test.sh');
    assert.ok(!d.notes.some((x) => x.status === 'narrow'));
  });

  test('D33e: the flag only judges the repo-wide test; another key is untouched', () => {
    const evidence = [ev('lint', './scripts/check-style.sh', { runner: 'script', tool: null, confidence: 'low', singlePurpose: true })];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.lint.run, './scripts/check-style.sh');
  });
});
