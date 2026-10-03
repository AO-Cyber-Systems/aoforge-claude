'use strict';

// stack-draft.test.cjs — assembleDraft, pure (TRD 42-07 tests 11-15 and the assembly rules).
//
// - D11 preference: runner beats CI for a key; declared beats both.
// - D12 an apply-only format -> { run: 'discover', apply: 'just fmt' }.
// - D13 sast->audit collapse: gosec with no other audit candidate -> audit is gosec, no sast;
//       gosec + govulncheck -> sast gosec, audit govulncheck.
// - D14 a weak marker is kept verbatim (`--no-fatal-infos`) and recorded as a note.
// - D15 a best candidate equal to the tier default is not re-emitted; a lone non-root area is the
//       one component of a general root and build/test/lint fall back to its tier with cwd (43-05).
// - D16 an unresolved candidate -> run: discover plus one note per candidate; `${{ }}` is never run.
// - D17 extends/components: 0 areas -> general + info note; no supported root area -> general plus
//       every supported area as a component (43-05, literal rule); the primary component's candidates
//       are root keys with cwd, other components' commands that differ from the tier are notes.
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

const { assembleDraft, pickPrimaryComponent } = require('./stack-draft.cjs');

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

  test('D15c (43-05, D3): a lone non-root area is the one component of a general root; build/test/lint fall back to its tier with cwd', () => {
    const areas = [{ dir: 'svc/', kinds: ['go'], tier: 'go', flags: [] }];
    const evidence = [
      ev('lint', 'make lint', { source: 'runner', runner: 'make', cwd: 'svc', area: 'svc/', tool: 'golangci-lint' }),
      ev('lint', 'go vet ./...', { cwd: 'svc', area: 'svc/', tool: 'go' }),
    ];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'general', 'a lone sub-area is never promoted to the root extends');
    assert.deepStrictEqual(d.components, [{ path: 'svc/', profile: 'go' }]);
    assert.deepStrictEqual(d.commands.lint, { run: 'make lint', cwd: 'svc' });
    assert.deepStrictEqual(d.commands.test, { run: 'go test -race ./...', scoped: 'go test -race {packages}', cwd: 'svc' });
    assert.deepStrictEqual(d.commands.build, { run: 'go build ./...', cwd: 'svc' });
    for (const key of ['format', 'fix', 'audit', 'codegen', 'typecheck']) {
      assert.equal(key in d.commands, false, `${key} is not a root key: the component inherits it from its tier`);
    }
    const primary = d.notes.find((n) => n.tag === 'primary_component');
    assert.ok(primary, JSON.stringify(d.notes));
    // TRD 43-10 re-baseline: the note names the build/test/lint count (the deciding evidence) and the total.
    assert.match(primary.detail, /primary component svc\/ \(go\): 2 build\/test\/lint evidence items of 2/);
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

  test('D17b (43-05, D6): 2+ areas -> general root; primary-component candidates become root keys with cwd, the rest stay notes', () => {
    const areas = [
      { dir: 'app/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] },
      { dir: 'portal/', kinds: ['node'], tier: null, unsupported: 'node', flags: ['unsupported'] },
      { dir: 'svc/', kinds: ['go'], tier: 'go', flags: [] },
    ];
    const evidence = [
      ev('test', 'go test -race -count=1 ./...', { cwd: 'svc', area: 'svc/', tool: 'go' }),
      ev('lint', 'go vet ./...', { cwd: 'svc', area: 'svc/', tool: 'go' }),
      ev('lint_helm', 'helm lint chart/', { tool: 'helm' }),
      ev('test', 'flutter test --coverage', { cwd: 'app', area: 'app/', tool: 'flutter' }),
    ];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'general');
    assert.deepStrictEqual(d.components, [{ path: 'app/', profile: 'flutter' }, { path: 'svc/', profile: 'go' }]);
    assert.deepStrictEqual(d.commands.lint_helm, { run: 'helm lint chart/' });
    assert.deepStrictEqual(
      d.commands.test,
      { run: 'go test -race -count=1 ./...', scoped: 'go test -race {packages}', cwd: 'svc' },
      'the primary component supplies the root test, with its cwd; the same tool as its tier default keeps the tier scoped form',
    );
    assert.deepStrictEqual(d.commands.lint, { run: 'go vet ./...', cwd: 'svc' }, 'equal to the tier default, but it is the root command now');
    assert.ok(d.notes.some((n) => n.area === 'app/' && n.key === 'test' && /flutter test --coverage/.test(n.candidate)), 'a non-primary component candidate stays a note');
    assert.ok(d.notes.some((n) => n.area === 'portal/' && n.status === 'info'), 'an unsupported area is noted');
    const primary = d.notes.find((n) => n.tag === 'primary_component');
    assert.ok(primary && primary.area === 'svc/', JSON.stringify(d.notes));
  });

  test('D17c: an explicit extends wins for the root', () => {
    const d = assembleDraft({ areas: ROOT_GO, evidence: [], tierCommands: { ...TIERS, golike: GENERAL }, verify: resolvedAll, extendsId: 'golike' });
    assert.equal(d.extendsId, 'golike');
  });
});

describe('pickPrimaryComponent (43-05, D6)', () => {
  const comp = (p, profile) => ({ path: p, profile });
  const at = (dir, source = 'ci', n = 1) => Array.from({ length: n }, (_, i) => ev('test', `cmd-${dir}-${source}-${i}`, { source, effectiveArea: dir, area: dir }));

  test('P1: the component with the most runner + CI evidence wins, even over go', () => {
    const items = [...at('app/', 'ci', 3), ...at('svc/', 'runner', 1)];
    const p = pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], items);
    assert.equal(p.path, 'app/');
    assert.equal(p.score, 3);
  });

  test('P2: on a tie go beats flutter and dart (the go-first heuristic, user decision 2026-10-02)', () => {
    const items = [...at('app/', 'ci', 2), ...at('lib/', 'ci', 2), ...at('svc/', 'ci', 2)];
    const p = pickPrimaryComponent([comp('app/', 'flutter'), comp('lib/', 'dart'), comp('svc/', 'go')], items);
    assert.equal(p.path, 'svc/');
    assert.equal(pickPrimaryComponent([comp('lib/', 'dart'), comp('app/', 'flutter')], []).path, 'app/', 'flutter before dart');
  });

  test('P3: two go components tie -> the shallower path, then the lexical one', () => {
    assert.equal(pickPrimaryComponent([comp('dev/edge/', 'go'), comp('go/', 'go')], []).path, 'go/');
    assert.equal(pickPrimaryComponent([comp('b/', 'go'), comp('a/', 'go')], []).path, 'a/');
  });

  test('P4: zero evidence -> the go component if any, else the first by path', () => {
    assert.equal(pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], []).path, 'svc/');
    assert.equal(pickPrimaryComponent([comp('b/', 'rust'), comp('a/', 'rust')], []).path, 'a/');
    assert.equal(pickPrimaryComponent([], []), null);
  });

  test('P5: only runner and CI items count; declared, manifest and docs items and other areas do not', () => {
    const items = [...at('app/', 'manifest', 4), ...at('app/', 'docs', 4), ...at('app/', 'declared', 4), ...at('svc/', 'ci', 1), ...at('', 'ci', 9)];
    const p = pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], items);
    assert.equal(p.path, 'svc/');
    assert.equal(p.score, 1);
  });

  test('P6: a tier root has no primary component: its behaviour is unchanged (devflowops: go root + flutter component)', () => {
    const areas = [...ROOT_GO, { dir: 'app/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] }];
    const evidence = [ev('test', 'flutter test --coverage', { cwd: 'app', area: 'app/', tool: 'flutter' })];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'go');
    assert.equal('test' in d.commands, false);
    assert.ok(!d.notes.some((n) => n.tag === 'primary_component'));
  });
});

describe('assembleDraft primary-component placement (43-05, D6)', () => {
  const AREAS = [
    { dir: 'app/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] },
    { dir: 'svc/', kinds: ['go'], tier: 'go', flags: [] },
  ];
  // Two svc/ CI items make `svc/` the primary component (app/ holds none).
  const primaryEvidence = () => [
    ev('lint', 'go vet ./...', { cwd: 'svc', area: 'svc/', tool: 'go' }),
    ev('test', 'go test ./...', { cwd: 'svc', area: 'svc/', tool: 'go' }),
  ];

  // TRD 43-10 re-baseline (B2). D17d used to say a root-area candidate beats a primary-component one. The
  // placement is now tiered by source: a task-runner target of the primary component (tier 2) beats the
  // other root-area candidates (tier 3: CI, docs, manifest), so the primary's `make test` is the key and
  // the root CI script is the shadowed note. A key with no root candidate still takes the primary one.
  test('D17d (test 10, re-baselined by 43-10): the primary component\'s runner target (tier 2) beats a root CI script (tier 3); the loser is a note', () => {
    const evidence = [
      ev('test', './ci/test.sh', { source: 'ci', tool: null, bodyStacks: [], effectiveArea: '' }),
      ev('test', 'make test', { source: 'runner', sourceFile: 'svc/Makefile', runner: 'make', cwd: 'svc', area: 'svc/', tool: 'go', effectiveArea: 'svc/' }),
      ...primaryEvidence(),
    ];
    const d = assembleDraft({ areas: AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.test, { run: 'make test', cwd: 'svc' }, JSON.stringify(d.commands.test));
    assert.deepStrictEqual(d.commands.lint, { run: 'go vet ./...', cwd: 'svc' }, 'a key with no root candidate still takes the primary one');
    assert.ok(d.notes.some((n) => n.key === 'test' && n.candidate === './ci/test.sh' && n.status === 'shadowed'), JSON.stringify(d.notes));
  });

  test('D17e: a primary candidate keeps its OWN cwd; a recipe that does the cd itself keeps none (just test-go)', () => {
    const evidence = [
      ev('test', 'just test-go', { source: 'runner', sourceFile: 'justfile', runner: 'just', cwd: null, area: '', tool: 'go', effectiveArea: 'svc/' }),
      ev('build', 'make build', { source: 'runner', sourceFile: 'svc/Makefile', runner: 'make', cwd: 'svc', area: 'svc/', tool: 'go', effectiveArea: 'svc/' }),
    ];
    const d = assembleDraft({ areas: AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.test, { run: 'just test-go' });
    assert.deepStrictEqual(d.commands.build, { run: 'make build', cwd: 'svc' });
  });

  test('D17f: with 2+ components there is NO tier-default fallback (a key nothing supplies stays absent)', () => {
    const d = assembleDraft({ areas: AREAS, evidence: [ev('test', 'go test ./...', { cwd: 'svc', area: 'svc/', tool: 'go' })], tierCommands: TIERS, verify: resolvedAll });
    assert.ok(d.commands.test);
    assert.equal('build' in d.commands, false);
    assert.equal('lint' in d.commands, false);
  });

  test('D17g: the single-component fallback is build/test/lint only, and a root candidate wins over it', () => {
    const areas = [{ dir: 'svc/', kinds: ['go'], tier: 'go', flags: [] }];
    const d = assembleDraft({ areas, evidence: [ev('build', 'make build', { source: 'runner', runner: 'make', tool: 'go', effectiveArea: '' })], tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.build, { run: 'make build' }, 'the root candidate has no cwd and wins over the fallback');
    assert.deepStrictEqual(d.commands.test, { run: 'go test -race ./...', scoped: 'go test -race {packages}', cwd: 'svc' });
    assert.deepStrictEqual(d.commands.lint, { run: 'go vet ./...', cwd: 'svc' });
    assert.equal(Object.keys(d.commands).length, 3);
    // A component tier whose build is `discover` supplies no build fallback.
    const flutterOnly = assembleDraft({ areas: [{ dir: 'app/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] }], evidence: [], tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(Object.keys(flutterOnly.commands), ['test', 'lint']);
    assert.equal(flutterOnly.commands.test.cwd, 'app');
  });

  test('D17h (test 11): a root candidate whose tool stack is only a NON-primary component stack is an off_primary note; shell stays', () => {
    const evidence = [
      ev('build', 'flutter build web', { tool: 'flutter', bodyStacks: ['flutter'], effectiveArea: '' }),
      ev('build', 'make build', { source: 'runner', sourceFile: 'svc/Makefile', runner: 'make', cwd: 'svc', area: 'svc/', tool: 'go', effectiveArea: 'svc/' }),
      ev('lint', 'shellcheck bin/*.sh', { tool: 'shellcheck', bodyStacks: [], effectiveArea: '' }),
      ...primaryEvidence(),
    ];
    const d = assembleDraft({ areas: AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.build, { run: 'make build', cwd: 'svc' }, JSON.stringify(d.commands.build));
    const off = d.notes.find((n) => n.status === 'off_primary');
    assert.ok(off, JSON.stringify(d.notes));
    assert.equal(off.key, 'build');
    assert.equal(off.candidate, 'flutter build web');
    assert.match(off.detail, /tool stack flutter belongs to component app\/, not the primary component/);
    assert.deepStrictEqual(d.commands.lint, { run: 'shellcheck bin/*.sh' }, 'a shell candidate is a root key (devcluster)');
    assert.ok(!d.notes.some((n) => n.status === 'off_primary' && n.candidate === 'shellcheck bin/*.sh'));
  });

  test('D17i: a mixed, unknown or neutral tool stack is never off_primary; the primary\'s own stack is never off_primary', () => {
    const evidence = [
      ev('test', 'task ci', { source: 'runner', runner: 'task', tool: null, bodyStacks: ['go', 'flutter'], effectiveArea: '' }),
      ev('codegen', 'buf generate', { form: 'mutate', tool: 'buf', bodyStacks: ['neutral'], effectiveArea: '' }),
      ev('deps', 'npm ci', { form: 'mutate', tool: 'npm', bodyStacks: ['node'], effectiveArea: '' }),
      ev('typecheck', 'go vet ./...', { tool: 'go', bodyStacks: ['go'], effectiveArea: '' }),
      ...primaryEvidence(),
    ];
    const d = assembleDraft({ areas: AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.ok(!d.notes.some((n) => n.status === 'off_primary'), JSON.stringify(d.notes));
    for (const key of ['test', 'codegen', 'deps', 'typecheck']) assert.ok(d.commands[key], `${key}: ${JSON.stringify(d.commands)}`);
  });

  test('D31c (test 12): an effectiveArea equal to a NON-primary component is still noted against that component', () => {
    const evidence = [
      ev('test', 'task app:test', { source: 'runner', runner: 'task', tool: 'flutter', bodyStacks: ['flutter'], effectiveArea: 'app/' }),
      ...primaryEvidence(),
    ];
    const d = assembleDraft({ areas: AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.notes.find((n) => n.tag === 'primary_component').area, 'svc/');
    assert.equal(d.commands.test.run, 'go test ./...', 'the flutter component never supplies the root test');
    const n = d.notes.find((x) => x.candidate === 'task app:test');
    assert.ok(n, JSON.stringify(d.notes));
    assert.equal(n.area, 'app/');
    assert.match(n.detail, /component app\/ uses tier flutter/);
  });
});

// TRD 43-10 (B2; eden-biz, aodex and politihub rows). In a `general` root with a primary component a key's
// candidates are taken by TIER, not "root list else primary list":
//   (1) recipes of a task-runner file at the repo root, wherever their body runs;
//   (2) targets of the primary component's own runner file, each keeping its own cwd;
//   (3) the other root-area candidates (CI, docs, manifest);
//   (4) the primary component's other candidates.
// The first tier that supplies the key wins. A tier none of whose candidates verify falls through to the
// next, and only when every tier is spent does the key end as `discover`.
describe('assembleDraft tiered root/primary placement (B2, TRD 43-10)', () => {
  const AREAS = [
    { dir: 'app/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [] },
    { dir: 'svc/', kinds: ['go'], tier: 'go', flags: [] },
  ];
  // Make `svc/` the primary component: it holds the lint and test evidence, `app/` holds none.
  const primaryEvidence = () => [
    ev('lint', 'go vet ./...', { cwd: 'svc', area: 'svc/', effectiveArea: 'svc/', tool: 'go' }),
    ev('test', 'go test ./...', { cwd: 'svc', area: 'svc/', effectiveArea: 'svc/', tool: 'go' }),
  ];
  const t1 = (extra = {}) => ev('build', 'make build-all', { source: 'runner', sourceFile: 'Makefile', runner: 'make', form: 'build', tool: 'go', effectiveArea: '', ...extra });
  const t2 = (extra = {}) => ev('build', 'make build', { source: 'runner', sourceFile: 'svc/Makefile', runner: 'make', form: 'build', cwd: 'svc', area: 'svc/', tool: 'go', effectiveArea: 'svc/', ...extra });
  const t3 = (extra = {}) => ev('build', './ci/build.sh', { source: 'ci', form: 'build', tool: null, bodyStacks: [], effectiveArea: '', ...extra });
  const t4 = (extra = {}) => ev('build', 'go build ./...', { source: 'ci', form: 'build', cwd: 'svc', area: 'svc/', tool: 'go', effectiveArea: 'svc/', ...extra });
  const draft = (evidence, verify = resolvedAll) => assembleDraft({ areas: AREAS, evidence: [...evidence, ...primaryEvidence()], tierCommands: TIERS, verify });

  test('B2a: each tier wins over the next: root runner, primary runner, root CI, primary CI', () => {
    assert.deepStrictEqual(draft([t4(), t3(), t2(), t1()]).commands.build, { run: 'make build-all' }, 'tier 1: no cwd');
    assert.deepStrictEqual(draft([t4(), t3(), t2()]).commands.build, { run: 'make build', cwd: 'svc' }, 'tier 2 beats the root CI step');
    assert.deepStrictEqual(draft([t4(), t3()]).commands.build, { run: './ci/build.sh' }, 'tier 3 beats the primary CI step');
    assert.deepStrictEqual(draft([t4()]).commands.build, { run: 'go build ./...', cwd: 'svc' }, 'tier 4 alone');
  });

  test('B2b: a tier none of whose candidates verify falls through to the next; every tier spent ends as discover', () => {
    const verify = (cmd) => (cmd === 'make build-all' || cmd === './ci/build.sh'
      ? { status: 'binary_missing', detail: 'stub: not on PATH' }
      : { status: 'resolved', detail: 'stub' });
    const d = draft([t1(), t2(), t3()], verify);
    assert.deepStrictEqual(d.commands.build, { run: 'make build', cwd: 'svc' }, JSON.stringify(d.commands.build));
    assert.ok(d.notes.some((n) => n.candidate === 'make build-all' && n.status === 'binary_missing'), 'the failed tier is noted');

    const none = draft([t1(), t3(), t4()], () => ({ status: 'binary_missing', detail: 'stub' }));
    assert.deepStrictEqual(none.commands.build, { run: 'discover' }, 'every tier spent with candidates: discover');
  });

  test('B2c: a tier-2 target keeps its own cwd even when its body leaves the dir (`cd .. && buf generate`)', () => {
    const generate = ev('codegen', 'make generate', {
      source: 'runner', sourceFile: 'svc/Makefile', runner: 'make', form: 'mutate', cwd: 'svc', area: 'svc/', tool: 'buf', bodyStacks: ['neutral'], effectiveArea: '',
    });
    const rootCi = ev('codegen', 'buf generate', { source: 'ci', form: 'mutate', tool: 'buf', bodyStacks: ['neutral'], effectiveArea: '' });
    const d = draft([generate, rootCi]);
    assert.deepStrictEqual(d.commands.codegen, { run: 'make generate', when: 'sources_changed', cwd: 'svc' }, JSON.stringify(d.commands.codegen));
  });

  test('B2d: a root image build that loses to the primary runner is a shadowed note with an image_build detail (aodex)', () => {
    const image = ev('build', 'docker build --target builder -t ui-builder --build-arg VERSION=${{ steps.ref.outputs.version }} -f ./ui/Dockerfile ./ui', {
      source: 'ci', form: 'build', tool: 'docker', bodyStacks: ['docker'], effectiveArea: '',
    });
    const d = draft([image, t2()]);
    assert.deepStrictEqual(d.commands.build, { run: 'make build', cwd: 'svc' }, JSON.stringify(d.commands.build));
    const n = d.notes.find((x) => x.key === 'build' && x.status === 'shadowed');
    assert.ok(n, JSON.stringify(d.notes));
    assert.match(n.detail, /image_build/);
    assert.match(n.detail, /make build/);
  });

  test('B2e: a non-image root candidate that loses is a shadowed note without the image_build detail', () => {
    const d = draft([t3(), t2()]);
    const n = d.notes.find((x) => x.candidate === './ci/build.sh');
    assert.ok(n && n.status === 'shadowed', JSON.stringify(d.notes));
    assert.doesNotMatch(n.detail, /image_build/);
  });

  test('B2f: off_primary still applies to tier 1 and tier 3 when a lower tier supplies the key', () => {
    const flutterBuild = ev('build', 'flutter build web', { source: 'ci', form: 'build', tool: 'flutter', bodyStacks: ['flutter'], effectiveArea: '' });
    const rootRecipe = ev('build', 'just build-app', { source: 'runner', sourceFile: 'justfile', runner: 'just', form: 'build', tool: 'flutter', bodyStacks: ['flutter'], effectiveArea: 'app/' });
    const d = draft([flutterBuild, rootRecipe, t2()]);
    assert.deepStrictEqual(d.commands.build, { run: 'make build', cwd: 'svc' });
    const off = d.notes.filter((n) => n.status === 'off_primary' && n.key === 'build').map((n) => n.candidate).sort();
    assert.deepStrictEqual(off, ['flutter build web', 'just build-app']);
  });

  test('B2g: the primary component\'s losing candidates are component notes when a root tier wins (as before)', () => {
    const d = draft([t1(), t2()]);
    assert.deepStrictEqual(d.commands.build, { run: 'make build-all' });
    assert.ok(d.notes.some((n) => n.area === 'svc/' && n.key === 'build' && n.candidate === 'make build'), JSON.stringify(d.notes));
  });

  test('B2h: a declared row still beats every tier', () => {
    const declared = ev('build', './scripts/mine.sh', { source: 'declared', sourceFile: '.planning/codebase/STACK.md', form: 'build', tool: null, bodyStacks: [], effectiveArea: '' });
    assert.deepStrictEqual(draft([t2(), t1(), declared]).commands.build, { run: './scripts/mine.sh' });
  });

  test('B2i: a general root with no primary component (a root product, no components) is placed as before', () => {
    const d = assembleDraft({ areas: NO_AREAS, evidence: [t3(), t1()], tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.build, { run: 'make build-all' }, 'rank by source, as before');
    assert.ok(!d.notes.some((n) => n.status === 'shadowed'));
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

  // Re-baselined in TRD 43-06: the NAME rank now applies to every key (the devflowops golden needs
  // `make generate` over `make generate-backend`, `make deps` over `make deps-frontend`), so `gen` (the
  // conventional codegen name) wins here. The rest of the 42-13 tuple (default target, depended-on,
  // segments, variant tokens) and the alternate notes stay gated to build/test/lint: D25i2 guards that.
  test('D25i: the name rank covers every key (43-06); other keys still add no alternates', () => {
    const evidence = [
      rt('codegen', 'gen:proto:internal', { order: 0 }),
      rt('codegen', 'gen', { order: 1, isDefault: true, dependedOn: true }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.codegen.run, 'task gen');
    assert.ok(!d.notes.some((n) => n.status === 'alternate'));
  });

  test('D25i2: beyond the name rank, other keys keep evidence order (no default / depended-on / segment ranking)', () => {
    const evidence = [
      rt('codegen', 'gen:proto:internal', { order: 0 }),
      rt('codegen', 'gen:api', { order: 1, isDefault: true, dependedOn: true }),
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
      // TRD 43-05 (D2/D3): `go/` is the repo's go module, so it is a language area (a cwd in NO area is
      // now a sub_area pseudo-area); the draft is general + the component go/, whose test is the root test.
      const areas = [{ dir: 'go/', kinds: ['go'], tier: 'go', flags: [] }];
      const evidence = collectEvidence(root, { areas });
      const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
      assert.deepStrictEqual(d.commands.test, { run: 'go test ./...', scoped: 'go test -race {packages}', cwd: 'go' }, JSON.stringify(d.commands));
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

// TRD 43-04 (D4, spot-check recovery): among e2e_env candidates the one whose NAME carries the
// scenario and environment tokens (stack-evidence `scenarioNamed`) outranks one that only has a
// bring-up body, though the body is high confidence and the name is low. (eden-biz: `make e2e-stack-up`
// over the generic `make infra-up`.)
describe('assembleDraft e2e_env prefers the scenario-named target (D34, TRD 43-04)', () => {
  const bodyOnly = () => ev('e2e_env', 'make infra-up', {
    source: 'runner', sourceFile: 'go/Makefile', runner: 'make', form: 'mutate', tool: 'docker', confidence: 'high',
    target: { name: 'infra-up', deps: [], isDefault: false, dependedOn: false, order: 0 },
  });
  const named = (extra = {}) => ev('e2e_env', 'make e2e-stack-up', {
    source: 'runner', sourceFile: 'Makefile', runner: 'make', form: 'check', tool: null, confidence: 'low', scenarioNamed: true,
    target: { name: 'e2e-stack-up', deps: [], isDefault: false, dependedOn: false, order: 0 }, ...extra,
  });

  test('D34: a low-confidence scenario-named target beats a high-confidence body-only one, in either evidence order', () => {
    for (const evidence of [[bodyOnly(), named()], [named(), bodyOnly()]]) {
      const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
      assert.equal(d.commands.e2e_env.run, 'make e2e-stack-up', JSON.stringify(d.commands));
    }
  });

  // Re-baselined in TRD 43-06 (D38): it asserted that with no scenario-named candidate the body-only
  // `make infra-up` still became e2e_env. The devcluster, navigators and quanta-local goldens key no
  // body-only bring-up, so without the flag there is no e2e_env key: both candidates are env_unnamed notes.
  test('D34b: without the flag no candidate is the e2e environment: no e2e_env key, both noted (43-06)', () => {
    const d = assembleDraft({ areas: NO_AREAS, evidence: [named({ scenarioNamed: undefined }), bodyOnly()], tierCommands: TIERS, verify: resolvedAll });
    assert.equal('e2e_env' in d.commands, false, JSON.stringify(d.commands));
    assert.deepEqual(d.notes.filter((n) => n.status === 'env_unnamed').map((n) => n.candidate).sort(), ['make e2e-stack-up', 'make infra-up']);
  });

  test('D34c: source still outranks the flag: a declared body-only candidate beats a named runner target', () => {
    const declared = ev('e2e_env', 'make infra-up', { source: 'declared', sourceFile: '.planning/codebase/STACK.md', tool: 'docker' });
    const d = assembleDraft({ areas: NO_AREAS, evidence: [named(), declared], tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.e2e_env.run, 'make infra-up');
  });

  test('D34d: the flag changes ranking for e2e_env only; a flagged e2e candidate ranks as before', () => {
    const lowFlagged = ev('e2e', 'make e2e', { source: 'runner', runner: 'make', tool: null, confidence: 'low', scenarioNamed: true });
    const highPlain = ev('e2e', 'npx playwright test', { source: 'runner', runner: 'make', tool: 'playwright', confidence: 'high' });
    const d = assembleDraft({ areas: NO_AREAS, evidence: [lowFlagged, highPlain], tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.e2e.run, 'npx playwright test');
  });
});

// TRD 43-06 (devflowops / EdenDocs / aodex goldens).
// - D35 the canonical NAME ranks for every key, not only build/test/lint: a target (or a script / target
//   a CI step goes through, stack-evidence `invokedName`) named for the key — the key itself, its
//   conventional spelling (`fmt` for format, `generate` / `gen` for codegen), optionally with a form
//   suffix (`lint-fix`, `fmt-check`) — beats a nameless candidate, which beats a qualified name
//   (`deps-frontend`, `build-deps.sh`). It ranks right after the source, ahead of confidence.
// - D36 a codegen drift check (check form) is the codegen gate; the generator it re-runs (mutate) is
//   its apply, not a competing run.
describe('assembleDraft canonical names for every key (D35, TRD 43-06)', () => {
  const tgt = (name, order = 0, extra = {}) => ({ name, deps: [], isDefault: false, dependedOn: false, order, ...extra });
  const runner = (key, name, form, confidence, order, extra = {}) => ev(key, `make ${name}`, {
    source: 'runner', sourceFile: 'Makefile', runner: 'make', form, confidence, tool: confidence === 'high' ? 'go' : null,
    target: tgt(name, order), ...extra,
  });

  test('D35a: deps — the bare `make deps` (low, prerequisites only) beats a high-confidence leg', () => {
    const evidence = [
      runner('deps', 'deps-frontend', 'mutate', 'high', 1, { tool: 'npm' }),
      runner('deps', 'deps', 'mutate', 'low', 0),
      runner('deps', 'deps-backend', 'mutate', 'high', 2),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.deps.run, 'make deps', JSON.stringify(d.commands));
  });

  test('D35b: codegen — `make generate` (the conventional name) beats `make generate-backend`', () => {
    const evidence = [runner('codegen', 'generate-backend', 'mutate', 'high', 0), runner('codegen', 'generate', 'mutate', 'low', 1)];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.codegen.run, 'make generate', JSON.stringify(d.commands));
  });

  test('D35c: apply — `make lint-fix` (key + apply suffix) beats `make lint-backend-fix`', () => {
    const evidence = [
      runner('lint', 'lint', 'check', 'low', 0),
      runner('lint', 'lint-backend-fix', 'apply', 'high', 1, { tool: 'golangci-lint' }),
      runner('lint', 'lint-fix', 'apply', 'low', 2),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepEqual({ run: d.commands.lint.run, apply: d.commands.lint.apply }, { run: 'make lint', apply: 'make lint-fix' });
  });

  test('D35d: CI scripts — `build.sh` beats an earlier `build-deps.sh` and a nameless high-confidence image build', () => {
    const evidence = [
      ev('build', './scripts/x/build-deps.sh', { runner: 'script', tool: null, form: 'build', confidence: 'low', invokedName: 'build-deps' }),
      ev('build', 'docker build -t x .', { form: 'build', tool: 'docker' }),
      ev('build', './scripts/x/build.sh', { runner: 'script', tool: null, form: 'build', confidence: 'low', invokedName: 'build' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.build.run, './scripts/x/build.sh', JSON.stringify(d.commands));
  });

  test('D35e: a nameless candidate still beats a qualified name in the same source', () => {
    const evidence = [
      ev('lint', 'make lint-docs', { runner: 'make', tool: null, confidence: 'low', invokedName: 'lint-docs' }),
      ev('lint', 'golangci-lint run', { tool: 'golangci-lint' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.lint.run, 'golangci-lint run', JSON.stringify(d.commands));
  });

  test('D36: codegen drift check is the run, the generator it re-runs is the apply (same cwd)', () => {
    const evidence = [
      runner('codegen', 'openapi-regen', 'mutate', 'high', 0, { cwd: 'go' }),
      runner('codegen', 'openapi-verify', 'check', 'high', 1, { cwd: 'go' }),
    ];
    const d = assembleDraft({ areas: NO_AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.codegen.run, 'make openapi-verify', JSON.stringify(d.commands));
    assert.equal(d.commands.codegen.apply, 'make openapi-regen');
    assert.equal(d.commands.codegen.cwd, 'go');
  });

  test('D36b: with no check form a generator is still the codegen run, with no apply', () => {
    const d = assembleDraft({ areas: NO_AREAS, evidence: [runner('codegen', 'generate', 'mutate', 'high', 0)], tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.commands.codegen.run, 'make generate');
    assert.equal(d.commands.codegen.apply, undefined);
  });
});

// TRD 43-06 (politihub / aodex goldens): CI steps that go through a component's TASK RUNNER (`make
// build` in `go/`) say that component's runner is the repo's declared build interface; a component whose
// CI only runs its tier's tools directly (`flutter build web` in three workflows) is built by its tier.
// So a component with CI-through-runner evidence is the primary first; the evidence count decides among
// the rest (P1-P5 unchanged: their items go through no runner).
describe('pickPrimaryComponent: CI through a task runner first (P7, TRD 43-06)', () => {
  const comp = (p, profile) => ({ path: p, profile });
  const ci = (dir, n, runner = null) => Array.from({ length: n }, (_, i) => ev('build', `cmd-${dir}-${runner || 'raw'}-${i}`, {
    source: 'ci', runner, effectiveArea: dir, area: dir,
  }));
  const rn = (dir, n) => Array.from({ length: n }, (_, i) => ev('build', `make t${i}`, { source: 'runner', runner: 'make', effectiveArea: dir, area: dir }));

  test('P7a: a component whose CI runs its runner targets beats one with more direct CI steps', () => {
    const items = [...ci('flutter-app/', 9), ...rn('go/', 2), ...ci('go/', 2, 'make')];
    const p = pickPrimaryComponent([comp('flutter-app/', 'flutter'), comp('go/', 'go')], items);
    assert.equal(p.path, 'go/');
    assert.equal(p.score, 4);
  });

  test('P7b: a CI step running a script file is not through a task runner', () => {
    const items = [...ci('portal/', 3, 'script'), ...ci('go/', 2)];
    assert.equal(pickPrimaryComponent([comp('portal/', 'flutter'), comp('go/', 'go')], items).path, 'portal/', 'evidence count decides');
  });

  test('P7c: when several components have CI through a runner, the evidence count decides, then go-first', () => {
    const items = [...ci('app/', 4, 'make'), ...ci('svc/', 2, 'just')];
    assert.equal(pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], items).path, 'app/');
    const tie = [...ci('app/', 2, 'make'), ...ci('svc/', 2, 'task')];
    assert.equal(pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], tie).path, 'svc/');
  });

  test('P7d: runner items alone (no CI calling them) do not lift a component over more CI evidence (P1 stands)', () => {
    const items = [...ci('app/', 3), ...rn('svc/', 1)];
    assert.equal(pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], items).path, 'app/');
  });
});

// TRD 43-10 (B1; eden-biz and politihub rows). The primary component is chosen on the evidence that
// names the repository's build interface: build, test and lint. A CI step through a task runner lifts a
// component only when it serves one of those keys (`make bundle-e2e` serves e2e and says nothing about the
// build); then the count of build/test/lint evidence decides, then ALL evidence, then go-first.
describe('pickPrimaryComponent: build/test/lint evidence decides (B1, TRD 43-10)', () => {
  const comp = (p, profile) => ({ path: p, profile });
  let n = 0;
  const many = (key, dir, count, extra = {}) => Array.from({ length: count }, () => {
    n += 1;
    return ev(key, `cmd-${key}-${dir}-${n}`, { source: 'ci', runner: null, effectiveArea: dir, area: dir, ...extra });
  });

  test('B1a: one CI step through a runner serving e2e does not lift a component', () => {
    const items = [
      ...many('build', 'svc/', 3), ...many('test', 'svc/', 3),
      ...many('deps', 'app/', 5), ...many('build', 'app/', 2), ...many('test', 'app/', 2),
      ...many('e2e', 'app/', 1, { runner: 'make' }),
    ];
    const p = pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], items);
    assert.equal(p.path, 'svc/', JSON.stringify(p));
    assert.equal(p.viaRunner, 0);
    assert.equal(p.canonical, 6);
    assert.equal(p.score, 6);
  });

  test('B1b: a CI step through a runner serving build, test or lint still lifts its component', () => {
    for (const key of ['build', 'test', 'lint']) {
      const items = [...many('test', 'svc/', 6), ...many(key, 'app/', 1, { runner: 'make' })];
      const p = pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], items);
      assert.equal(p.path, 'app/', `${key}: ${JSON.stringify(p)}`);
      assert.equal(p.viaRunner, 1);
    }
  });

  test('B1c: without a runner step, the build/test/lint count decides before the total', () => {
    const items = [
      ...many('test', 'svc/', 4), ...many('build', 'svc/', 1),
      ...many('deps', 'app/', 9), ...many('codegen', 'app/', 4), ...many('test', 'app/', 2),
    ];
    const p = pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], items);
    assert.equal(p.path, 'svc/', JSON.stringify(p));
    assert.equal(p.canonical, 5);
    assert.equal(p.score, 5);
  });

  test('B1d: equal build/test/lint counts: the total decides, then go-first', () => {
    const more = [...many('test', 'app/', 2), ...many('deps', 'app/', 3), ...many('test', 'svc/', 2)];
    assert.equal(pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], more).path, 'app/', 'the total decides');
    const tie = [...many('test', 'app/', 2), ...many('test', 'svc/', 2)];
    assert.equal(pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], tie).path, 'svc/', 'go-first');
  });

  test('B1e: runner items count as evidence; only runner and CI items count at all', () => {
    const items = [
      ...many('build', 'svc/', 1, { source: 'runner', runner: 'make' }), ...many('test', 'svc/', 1, { source: 'runner', runner: 'make' }),
      ...many('test', 'app/', 1), ...many('test', 'app/', 5, { source: 'manifest' }),
    ];
    const p = pickPrimaryComponent([comp('app/', 'flutter'), comp('svc/', 'go')], items);
    assert.equal(p.path, 'svc/', JSON.stringify(p));
    assert.equal(p.viaRunner, 0, 'a runner ITEM is not a CI step through a runner');
  });
});

// TRD 43-06 (EdenDocs golden). A `general` root that BUILDS ITSELF (a root build candidate that is not
// only a container image build) is a product of its own: its components are sidecars, so no component is
// primary, none fills the root's keys and the single-component fallback does not apply. A repo-level
// check run FROM the root (an attachable key: e2e, lint_helm, lint_docker) stays a root key even when its
// script lives in a component.
describe('assembleDraft root product and root-invoked attachable keys (D37, TRD 43-06)', () => {
  const AREAS = [{ dir: 'side/', kinds: ['go'], tier: 'go', flags: [], evidence: ['side/go.mod'] }];
  const sideCi = () => [
    ev('lint', 'go vet ./...', { cwd: 'side', area: 'side/', effectiveArea: 'side/', tool: 'go', bodyStacks: ['go'] }),
    ev('test', 'go test ./...', { cwd: 'side', area: 'side/', effectiveArea: 'side/', tool: 'go', bodyStacks: ['go'] }),
  ];
  const e2e = () => ev('e2e', './side/scripts/e2e.sh', { runner: 'script', tool: null, confidence: 'low', invokedName: 'e2e', effectiveArea: 'side/', bodyStacks: [] });

  test('D37a: a root that builds itself has no primary component: no root lint/test from the sidecar, no fallback', () => {
    const evidence = [
      ev('build', './scripts/build.sh', { runner: 'script', tool: null, form: 'build', confidence: 'low', invokedName: 'build', bodyStacks: [] }),
      ...sideCi(),
      e2e(),
    ];
    const d = assembleDraft({ areas: AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.extendsId, 'general');
    assert.deepStrictEqual(d.components, [{ path: 'side/', profile: 'go' }]);
    assert.deepStrictEqual(d.commands.build, { run: './scripts/build.sh' });
    assert.equal('lint' in d.commands, false, JSON.stringify(d.commands));
    assert.equal('test' in d.commands, false, JSON.stringify(d.commands));
    assert.deepStrictEqual(d.commands.e2e, { run: './side/scripts/e2e.sh' }, 'a root-invoked e2e stays a root key');
    assert.ok(!d.notes.some((n) => n.tag === 'primary_component'), JSON.stringify(d.notes));
    assert.ok(d.notes.some((n) => n.tag === 'root_product'), JSON.stringify(d.notes));
  });

  test('D37b: a narrow-only root test beside a root product is discover, never the sidecar tier test', () => {
    const evidence = [
      ev('build', './scripts/build.sh', { runner: 'script', tool: null, form: 'build', confidence: 'low', invokedName: 'build', bodyStacks: [] }),
      ev('test', './scripts/smoke-test.sh', { runner: 'script', tool: null, confidence: 'low', invokedName: 'smoke-test', singlePurpose: true, bodyStacks: [] }),
      ...sideCi(),
    ];
    const d = assembleDraft({ areas: AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.test, { run: 'discover' }, JSON.stringify(d.commands));
  });

  test('D37c: a root image build alone does not make the root a product: the component stays primary', () => {
    const evidence = [
      ev('build', 'docker build -t x .', { form: 'build', tool: 'docker', bodyStacks: ['docker'] }),
      ...sideCi(),
    ];
    const d = assembleDraft({ areas: AREAS, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.notes.find((n) => n.tag === 'primary_component').area, 'side/');
    assert.deepStrictEqual(d.commands.lint, { run: 'go vet ./...', cwd: 'side' });
  });

  test('D37d: with a primary, a root-invoked e2e from a NON-primary component is a root key; a root-invoked codegen there is a note', () => {
    const areas = [
      { dir: 'svc/', kinds: ['go'], tier: 'go', flags: [], evidence: ['svc/go.mod'] },
      { dir: 'app/', kinds: ['dart', 'flutter'], tier: 'flutter', flags: [], evidence: ['app/pubspec.yaml'] },
    ];
    const evidence = [
      ev('build', 'make build', { source: 'runner', sourceFile: 'svc/Makefile', runner: 'make', cwd: 'svc', area: 'svc/', tool: 'go', effectiveArea: 'svc/' }),
      ev('lint', 'go vet ./...', { cwd: 'svc', area: 'svc/', tool: 'go', effectiveArea: 'svc/' }),
      ev('test', 'go test ./...', { cwd: 'svc', area: 'svc/', tool: 'go', effectiveArea: 'svc/' }),
      ev('e2e', './app/scripts/e2e.sh', { runner: 'script', tool: null, confidence: 'low', invokedName: 'e2e', effectiveArea: 'app/', bodyStacks: [] }),
      ev('codegen', 'bash app/build.sh', { form: 'mutate', runner: 'script', tool: null, invokedName: 'build', effectiveArea: 'app/', bodyStacks: [] }),
    ];
    const d = assembleDraft({ areas, evidence, tierCommands: TIERS, verify: resolvedAll });
    assert.equal(d.notes.find((n) => n.tag === 'primary_component').area, 'svc/');
    assert.deepStrictEqual(d.commands.e2e, { run: './app/scripts/e2e.sh' }, JSON.stringify(d.commands));
    assert.equal('codegen' in d.commands, false, JSON.stringify(d.commands));
  });
});

// TRD 43-06 (devcluster / navigators / quanta-local goldens): `e2e_env` is the environment the e2e
// scenarios run against, and only a NAME says that (`make e2e-stack-up`, stack-evidence scenarioNamed).
// A body-only bring-up (`just infra`, `make up`, a live-cluster script running kubectl) is some
// environment, not the e2e one: an `env_unnamed` note, never a root key. A declared row still counts.
describe('assembleDraft e2e_env needs a scenario name (D38, TRD 43-06)', () => {
  const bodyOnly = (cmd = 'make up') => ev('e2e_env', cmd, { source: 'runner', sourceFile: 'Makefile', runner: 'make', form: 'mutate', tool: 'docker', confidence: 'high' });
  const named = () => ev('e2e_env', 'make e2e-stack-up', { source: 'runner', sourceFile: 'Makefile', runner: 'make', form: 'check', tool: null, confidence: 'low', scenarioNamed: true });

  test('D38a: body-only bring-ups are notes, never the e2e_env key', () => {
    const d = assembleDraft({ areas: NO_AREAS, evidence: [bodyOnly('make up'), bodyOnly('just infra')], tierCommands: TIERS, verify: resolvedAll });
    assert.equal('e2e_env' in d.commands, false, JSON.stringify(d.commands));
    const n = d.notes.filter((x) => x.status === 'env_unnamed');
    assert.deepEqual(n.map((x) => x.candidate).sort(), ['just infra', 'make up']);
  });

  test('D38b: with a scenario-named candidate it is the key; the body-only one is a note', () => {
    const d = assembleDraft({ areas: NO_AREAS, evidence: [bodyOnly(), named()], tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.e2e_env, { run: 'make e2e-stack-up' });
    assert.ok(d.notes.some((x) => x.status === 'env_unnamed' && x.candidate === 'make up'));
  });

  test('D38c: a declared body-only row is the user\'s own choice and stays the key', () => {
    const declared = ev('e2e_env', 'make up', { source: 'declared', sourceFile: '.planning/codebase/STACK.md', form: 'mutate', tool: 'docker' });
    const d = assembleDraft({ areas: NO_AREAS, evidence: [declared], tierCommands: TIERS, verify: resolvedAll });
    assert.deepStrictEqual(d.commands.e2e_env, { run: 'make up' });
  });
});
