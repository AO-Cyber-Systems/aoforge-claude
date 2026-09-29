'use strict';

// stack-report.test.cjs — `df-tools stack report` (TRD 42-08, SDR-06).
//
// Test list (outermost to innermost; the TRD's numbering):
//   1.  CLI --write on goGapsShape: file written, frontmatter counts right, GO-RACE/GO-VET/GO-VULN
//       gaps, `.github/workflows` unchanged.
//   2.  CLI --raw writes nothing; JSON findings sorted by (severity, component, id).
//   3.  CLI --draft --raw without STACK.md: profile_source 'draft'; STACK.md still absent.
//   4.  Applicability: pure Go has no DART-*/FLUT-*; Flutter app without .maestro -> FLUT-MAESTRO
//       info; with .maestro + CI maestro -> no FLUT-MAESTRO row.
//   5.  Weak: --no-fatal-infos -> DART-ANALYZE weak; bare gofmt -l -> GO-FMT weak;
//       continue-on-error golangci-lint -> GO-LINT weak.
//   6.  Expansion: CI `make lint` (golangci-lint body) -> GO-LINT present; CI wrapper script
//       with govulncheck -> GO-VULN present.
//   7.  `uses: golangci/golangci-lint-action` -> GO-LINT present.
//   7r. Record level: weakMarkers + continueOnError; CI `make lint` -> CI record + expanded
//       runner record; `./scripts/x.sh` -> script records; `uses:` record text; cycle guard.
//   8.  LOCAL-MIRROR names `lint` when the runner lacks vet; no row when it has it.
//   9.  CI-MISSING info without workflows; HELM-LINT gap on lint-only.
//   10. GO-GEN-DRIFT gap with sqlc.yaml and no `git diff --exit-code` after the generator.
//   11. Draft notes: missing ginkgo -> a DRAFT-NOTE-test info row naming binary_missing.
//   12. Deterministic: two runs byte-identical with the date injected.
//   14. Q8 probe (skip-only): `dart test --coverage=coverage` in a temp package; diagnostic only.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const fx = require('./__fixtures__/stack-report-fixtures.cjs');

function withShape(build, fn) {
  const repo = build();
  try {
    return fn(repo);
  } finally {
    fx.cleanup(repo);
  }
}

function lazyReport() {
  return require('./stack-report.cjs');
}

const find = (records, pred) => records.find(pred);

describe('buildRecords (TRD 42-08 test 7r)', () => {
  test('7r-a: weak markers (--no-fatal-infos, || true, bare gofmt -l) and continueOnError are recorded', () => {
    withShape(fx.weakAnalyzersShape, (repo) => {
      const records = lazyReport().buildRecords(repo);

      const analyze = find(records, (r) => r.origin === 'ci' && r.text === 'flutter analyze --no-fatal-infos');
      assert.ok(analyze, JSON.stringify(records, null, 2));
      assert.ok(analyze.weakMarkers.includes('--no-fatal-infos'), JSON.stringify(analyze));
      assert.equal(analyze.area, 'app/');
      assert.equal(analyze.cwd, 'app');
      assert.equal(analyze.file, '.github/workflows/ci.yml');
      assert.equal(analyze.job, 'flutter');
      assert.equal(analyze.scope, 'ci');

      const fmt = find(records, (r) => r.origin === 'ci' && r.text === 'gofmt -l .');
      assert.ok(fmt, 'bare gofmt record');
      assert.ok(fmt.weakMarkers.includes('bare gofmt -l'), JSON.stringify(fmt));
      assert.equal(fmt.area, 'svc/');

      const vet = find(records, (r) => r.origin === 'ci' && /^go vet/.test(r.text));
      assert.ok(vet, 'go vet record');
      assert.ok(vet.weakMarkers.includes('|| true'), JSON.stringify(vet));

      const lint = find(records, (r) => r.origin === 'ci' && r.text === 'golangci-lint run ./...');
      assert.ok(lint, 'golangci-lint record');
      assert.equal(lint.continueOnError, true);
      assert.deepEqual(lint.weakMarkers, []);
      assert.equal(analyze.continueOnError, false);
    });
  });

  test('7r-b: a CI `make lint` yields the CI record plus an expanded runner record; a self-referencing target does not loop', () => {
    withShape(fx.makeExpansionShape, (repo) => {
      const records = lazyReport().buildRecords(repo);

      assert.ok(find(records, (r) => r.origin === 'ci' && r.text === 'make lint' && r.scope === 'ci'), 'CI record');
      const expanded = find(records, (r) => r.origin === 'runner' && r.scope === 'ci' && r.target === 'lint');
      assert.ok(expanded, JSON.stringify(records, null, 2));
      assert.equal(expanded.text, 'golangci-lint run ./...');
      assert.equal(expanded.file, 'Makefile');
      assert.equal(expanded.job, 'lint');
      assert.equal(expanded.ciFile, '.github/workflows/ci.yml');

      // The target is also a LOCAL runner record (it can be run on a laptop).
      assert.ok(find(records, (r) => r.origin === 'runner' && r.scope === 'local' && r.target === 'lint' && r.text === 'golangci-lint run ./...'));

      // `loop: make loop` expands at most once from CI and stops at the cycle guard.
      const loops = records.filter((r) => r.scope === 'ci' && r.target === 'loop');
      assert.ok(loops.length >= 1 && loops.length <= 2, `loop expansions: ${loops.length}`);
      assert.ok(records.length < 50, `record count ${records.length} suggests unbounded expansion`);
    });
  });

  test('7r-c: a CI wrapper script yields script records from the file body (read once)', () => {
    withShape(fx.wrapperScriptShape, (repo) => {
      const records = lazyReport().buildRecords(repo);
      const step = find(records, (r) => r.origin === 'ci' && r.text === './scripts/vuln-gate.sh');
      assert.ok(step, JSON.stringify(records, null, 2));
      assert.equal(step.scheduled, true);

      const body = records.filter((r) => r.origin === 'script');
      assert.equal(body.length, 1, JSON.stringify(body));
      assert.equal(body[0].text, 'govulncheck ./...');
      assert.equal(body[0].file, 'scripts/vuln-gate.sh');
      assert.equal(body[0].scope, 'ci');
      assert.equal(body[0].scheduled, true);
    });
  });

  test('7r-d: a `uses:` step becomes a record with text `uses:<owner/repo>`', () => {
    withShape(fx.usesActionShape, (repo) => {
      const records = lazyReport().buildRecords(repo);
      const uses = find(records, (r) => r.text === 'uses:golangci/golangci-lint-action');
      assert.ok(uses, JSON.stringify(records, null, 2));
      assert.equal(uses.origin, 'ci');
      assert.equal(uses.tool, 'uses');
      assert.ok(find(records, (r) => r.text === 'uses:actions/checkout'));
    });
  });

  test('7r-e: runner targets are local records; records carry the documented fields', () => {
    withShape(fx.goGapsShape, (repo) => {
      const records = lazyReport().buildRecords(repo);
      const local = find(records, (r) => r.scope === 'local' && r.target === 'test');
      assert.ok(local, JSON.stringify(records, null, 2));
      assert.equal(local.origin, 'runner');
      assert.equal(local.text, 'go test ./...');
      assert.equal(local.area, '');
      for (const r of records) {
        for (const field of ['origin', 'scope', 'file', 'cwd', 'area', 'text', 'tool', 'continueOnError', 'weakMarkers', 'scheduled']) {
          assert.ok(Object.prototype.hasOwnProperty.call(r, field), `${field} missing on ${JSON.stringify(r)}`);
        }
      }
    });
  });
});
