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
