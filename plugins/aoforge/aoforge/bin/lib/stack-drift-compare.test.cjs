'use strict';

// stack-drift-compare.test.cjs — the pure drift comparison helper (TRD 43-08, task 1).
//
// compareDrift reproduces the 43-07 dry-run drift scope (43-ROLLOUT.md `## Dry-run drift`): extends,
// the components set, and per command key the EFFECTIVE run/apply/cwd (the file's own entry, else the
// one it inherits from its extends tier) over the union of both files' own keys. It takes frontmatter
// objects and the resolved tier commands of each file's `extends`, and does no I/O.
//
//  1  identical                  no rows
//  2  different run              conflict
//  3  committed command, draft discover      conflict
//  4  committed discover, draft command      more_specific
//  5  draft-only key more_specific; committed-only key conflict
//  6  committed apply the draft lacks, different cwd       conflict
//  7  draft omits a key the committed file writes with the tier's exact value   no row
//  8  HAND_ONLY key that differs            no row, named in `skipped`
//  9  committed helm_lint vs draft lint_helm, same command   no row (alias)
// 10  different extends / components        conflict rows `extends` / `components`
// 11  out-of-scope fields differ            no row

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { compareDrift, formatRow } = require('./__fixtures__/stack-drift-compare.cjs');

/** fm(extendsId, commands, components) -> a frontmatter object. */
const fm = (extendsId, commands = {}, components = []) => ({ schema: 1, extends: extendsId, components, commands });

const cmd = (run, more = {}) => ({ run, ...more });

/** drift(committed, draft, opts) -> compareDrift result with empty tiers unless given. */
function drift(committed, draft, opts = {}) {
  return compareDrift({
    committed,
    draft,
    committedTier: opts.committedTier || {},
    draftTier: opts.draftTier || {},
    handOnly: opts.handOnly || [],
    keyAliases: opts.keyAliases || {},
  });
}

const kinds = (result) => result.rows.map((r) => `${r.key}:${r.kind}`);

describe('compareDrift (43-07 drift scope)', () => {
  test('1. identical committed and draft: no rows', () => {
    const a = fm('go', { build: cmd('go build ./...', { cwd: 'go' }), test: cmd('go test ./...') });
    const b = fm('go', { build: cmd('go build ./...', { cwd: 'go' }), test: cmd('go test ./...') });
    assert.deepEqual(drift(a, b), { rows: [], skipped: [] });
  });

  test('2. same key, different run: one conflict row carrying both values', () => {
    const r = drift(fm('go', { build: cmd('make build', { cwd: 'go' }) }), fm('go', { build: cmd('make build-web', { cwd: 'flutter' }) }));
    assert.deepEqual(kinds(r), ['build:conflict']);
    assert.deepEqual(r.rows[0].committed, { run: 'make build', apply: undefined, cwd: 'go' });
    assert.deepEqual(r.rows[0].draft, { run: 'make build-web', apply: undefined, cwd: 'flutter' });
  });

  test('3. committed has a command, draft says discover: conflict', () => {
    const r = drift(fm('go', { audit: cmd('govulncheck ./...') }), fm('go', { audit: cmd('discover') }));
    assert.deepEqual(kinds(r), ['audit:conflict']);
  });

  test('4. committed discover, draft has a command: more_specific', () => {
    const r = drift(fm('go', { lint: cmd('discover') }), fm('go', { lint: cmd('go vet ./...', { cwd: 'go' }) }));
    assert.deepEqual(kinds(r), ['lint:more_specific']);
  });

  test('4b. committed `none` against a draft command is a conflict, not more_specific', () => {
    const r = drift(fm('go', { build: cmd('none') }), fm('go', { build: cmd('go build ./...') }));
    assert.deepEqual(kinds(r), ['build:conflict']);
  });

  test('5. a draft-only key is more_specific; a committed-only key is a conflict', () => {
    const draftOnly = drift(fm('go', {}), fm('go', { deps: cmd('go mod download', { cwd: 'ai/go' }) }));
    assert.deepEqual(kinds(draftOnly), ['deps:more_specific']);
    assert.equal(draftOnly.rows[0].committed, null);
    const committedOnly = drift(fm('go', { tidy: cmd('go mod tidy -diff', { apply: 'go mod tidy' }) }), fm('go', {}));
    assert.deepEqual(kinds(committedOnly), ['tidy:conflict']);
    assert.equal(committedOnly.rows[0].draft, null);
  });

  test('6. a committed apply the draft lacks is a conflict; a different cwd is a conflict', () => {
    const noApply = drift(
      fm('go', { format: cmd('make fmt-check', { apply: 'make fmt' }) }),
      fm('go', { format: cmd('make fmt-check') }),
    );
    assert.deepEqual(kinds(noApply), ['format:conflict']);
    const otherCwd = drift(
      fm('go', { test: cmd('make test', { cwd: 'go' }) }),
      fm('go', { test: cmd('make test', { cwd: 'flutter' }) }),
    );
    assert.deepEqual(kinds(otherCwd), ['test:conflict']);
  });

  test('6b. a draft that adds an apply to the same run is more_specific', () => {
    const r = drift(fm('go', { format: cmd('make fmt-check') }), fm('go', { format: cmd('make fmt-check', { apply: 'make fmt' }) }));
    assert.deepEqual(kinds(r), ['format:more_specific']);
  });

  test('7. a draft that omits a key the committed file writes with the tier value: no row', () => {
    const tier = { build: cmd('go build ./...'), vet: cmd('go vet ./...') };
    const committed = fm('go', { build: cmd('go build ./...') });
    const draft = fm('go', {});
    assert.deepEqual(drift(committed, draft, { committedTier: tier, draftTier: tier }), { rows: [], skipped: [] });
  });

  test('7b. the tier value differs from the committed own value: conflict through inheritance', () => {
    const committed = fm('go', { build: cmd('make build') });
    const draft = fm('go', {});
    const r = drift(committed, draft, { committedTier: {}, draftTier: { build: cmd('go build ./...') } });
    assert.deepEqual(kinds(r), ['build:conflict']);
  });

  test('8. a HAND_ONLY key that differs: no row, named in skipped', () => {
    const committed = fm('go', { portal_codegen: cmd('make portal'), build: cmd('go build ./...') });
    const draft = fm('go', { build: cmd('go build ./...') });
    const r = drift(committed, draft, { handOnly: ['portal_codegen'] });
    assert.deepEqual(r, { rows: [], skipped: ['portal_codegen'] });
  });

  test('9. committed helm_lint against draft lint_helm with the same command: no row (alias)', () => {
    const committed = fm('go', { helm_lint: cmd('helm lint helm/x/') });
    const draft = fm('go', { lint_helm: cmd('helm lint helm/x/') });
    assert.deepEqual(drift(committed, draft, { keyAliases: { helm_lint: 'lint_helm' } }), { rows: [], skipped: [] });
  });

  test('9b. the alias row is named with the draft key', () => {
    const committed = fm('go', { helm_lint: cmd('helm lint helm/x/') });
    const draft = fm('go', { lint_helm: cmd('kubeconform -v') });
    const r = drift(committed, draft, { keyAliases: { helm_lint: 'lint_helm' } });
    assert.deepEqual(kinds(r), ['lint_helm:conflict']);
  });

  test('10. different extends is a conflict row `extends`; a different components set is a conflict row `components`', () => {
    const ext = drift(fm('go', {}), fm('general', {}));
    assert.deepEqual(kinds(ext), ['extends:conflict']);
    assert.equal(ext.rows[0].committed, 'go');
    assert.equal(ext.rows[0].draft, 'general');

    const comps = drift(fm('go', {}, []), fm('go', {}, [{ path: 'control-plane', profile: 'go' }]));
    assert.deepEqual(kinds(comps), ['components:conflict']);
  });

  test('10b. components compare as a sorted set, and a missing extends means general', () => {
    const a = fm(undefined, {}, [{ path: 'b', profile: 'go' }, { path: 'a', profile: 'flutter' }]);
    const b = fm('general', {}, [{ path: 'a', profile: 'flutter' }, { path: 'b', profile: 'go' }]);
    assert.deepEqual(drift(a, b), { rows: [], skipped: [] });
  });

  test('11. out-of-scope fields (when, scoped, timeout_s) differ: no row', () => {
    const committed = fm('go', { test: cmd('go test ./...', { when: 'always', scoped: true, timeout_s: 60 }) });
    const draft = fm('go', { test: cmd('go test ./...', { when: 'changed', scoped: false, timeout_s: 600 }) });
    assert.deepEqual(drift(committed, draft), { rows: [], skipped: [] });
  });

  test('formatRow uses the 43-07 table wording', () => {
    const r = drift(fm('go', { build: cmd('go build ./...', { cwd: 'go' }) }), fm('go', { build: cmd('make build', { apply: 'make fix' }) }));
    assert.equal(formatRow(r.rows[0]), 'build: committed `go build ./... (cwd go)` vs draft `make build (apply: make fix)`');
    const only = drift(fm('go', {}), fm('go', { deps: cmd('go mod download', { cwd: 'ai/go' }) }));
    assert.equal(formatRow(only.rows[0]), 'deps: draft only `go mod download (cwd ai/go)`');
    const gone = drift(fm('go', { tidy: cmd('go mod tidy -diff', { apply: 'go mod tidy' }) }), fm('go', {}));
    assert.equal(formatRow(gone.rows[0]), 'tidy: committed only `go mod tidy -diff (apply: go mod tidy)`');
    const ext = drift(fm('go', {}), fm('general', {}));
    assert.equal(formatRow(ext.rows[0]), 'extends: committed `go` vs draft `general`');
  });

  test('the helper does no I/O: it requires nothing', () => {
    const src = require('fs').readFileSync(require.resolve('./__fixtures__/stack-drift-compare.cjs'), 'utf-8');
    assert.ok(!/require\(/.test(src), 'stack-drift-compare.cjs must not require anything');
  });
});
