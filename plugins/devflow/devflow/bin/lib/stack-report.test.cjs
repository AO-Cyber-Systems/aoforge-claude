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
//
// TRD 42-12 (gap G1: the report's components column listed unsupported node areas the draft calls
// "not a component"):
//   G2. CLI --draft --raw, supported svc/ (go) + unsupported node site/ and ui/frontend/:
//       meta.components equals the draft's component paths ([] for one supported area,
//       ['admin/', 'svc/'] for two); meta.unsupported_areas is ['site/', 'ui/frontend/']; the
//       header renders both lines (unsupported_areas omitted when empty).
//   G3. CLI --raw with a STACK.md naming components [svc/] while detection also sees tools/x/ (go):
//       meta.components is exactly ['svc/'], from the file.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/stack-report-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const FIXED_NOW = new Date(2026, 8, 28, 12, 0, 0);
const SEVERITY_RANK = { gap: 0, weak: 1, info: 2 };

// Every ID in the TRD must_haves, in catalogue order.
const CATALOGUE_IDS = [
  'GO-FMT', 'GO-VET', 'GO-LINT', 'GO-VULN', 'GO-RACE', 'GO-COVER', 'GO-TIDY', 'GO-FIX', 'GO-GEN-DRIFT',
  'GO-BUF', 'GO-SAST', 'DART-ANALYZE', 'DART-FORMAT', 'DART-TEST', 'DART-COVER', 'FLUT-INTEG',
  'FLUT-MAESTRO', 'FLUT-GOLDEN', 'DART-CODEGEN', 'DART-LOCK', 'DART-OUTDATED', 'JS-CI', 'JS-AUDIT',
  'JS-LINT', 'JS-TYPE', 'JS-E2E', 'HELM-LINT', 'DOCKER-LINT', 'DOCKER-SCAN', 'DOCKER-PIN',
  'CI-HYGIENE', 'LOCAL-MIRROR', 'CI-MISSING',
];

let home;
before(() => { home = fx.fakeEmptyHome(); });
after(() => { fx.cleanup(home); });

// A verifier stub: findings never depend on it; it keeps in-process drafts off the host PATH.
const stubVerify = () => ({ status: 'resolved', detail: 'stub', tool: null });

/** In-process report with the date injected and a stub verifier. */
function reportOf(repo, opts = {}) {
  return lazyReport().buildReport({ projectRoot: repo, userHome: home, now: FIXED_NOW, verify: stubVerify, ...opts });
}

/** runCli(repo, args, { tools }) -> { status, stdout, stderr, json }. PATH = stub tools ONLY. */
function runCli(repo, args, { tools = fx.DEFAULT_TOOLCHAIN } = {}) {
  const bin = fx.fakeToolchain(tools);
  try {
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, 'stack', 'report', ...args], {
      encoding: 'utf-8', env: { PATH: bin, HOME: home }, timeout: 60000,
    });
    let json = null;
    try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', json };
  } finally {
    fx.cleanup(bin);
  }
}

/** Every file under root (relative path -> sha256), for "nothing was written" assertions. */
function snapshot(root) {
  const out = {};
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else out[r] = crypto.createHash('sha256').update(fs.readFileSync(path.join(abs, e.name))).digest('hex');
    }
  };
  walk(root, '');
  return out;
}

const rows = (findings, id) => findings.filter((f) => f.id === id);
const one = (findings, id) => {
  const hit = rows(findings, id);
  assert.equal(hit.length, 1, `expected exactly one ${id} row, got ${JSON.stringify(findings, null, 2)}`);
  return hit[0];
};
const none = (findings, id) => assert.equal(rows(findings, id).length, 0, `unexpected ${id} row: ${JSON.stringify(rows(findings, id))}`);

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

describe('stack report CLI (TRD 42-08 tests 1-3)', () => {
  test('1. --write on a Go gaps repo writes STACK-REPORT.md with correct counts; GO-RACE/GO-VET/GO-VULN are gaps; workflows untouched', () => {
    withShape(fx.goGapsShape, (repo) => {
      const wfDir = path.join(repo, '.github', 'workflows');
      const wfBefore = snapshot(wfDir);
      const makeBefore = fs.readFileSync(path.join(repo, 'Makefile'), 'utf-8');

      const r = runCli(repo, ['--write']);
      assert.equal(r.status, 0, r.stderr);
      const file = path.join(repo, '.planning', 'STACK-REPORT.md');
      assert.ok(fs.existsSync(file), 'STACK-REPORT.md written');
      const text = fs.readFileSync(file, 'utf-8');

      const raw = runCli(repo, ['--raw']);
      assert.equal(raw.status, 0, raw.stderr);
      const { findings } = raw.json;
      const tally = { gap: 0, weak: 0, info: 0 };
      for (const f of findings) tally[f.severity]++;
      const m = /^counts: \{ gap: (\d+), weak: (\d+), info: (\d+) \}$/m.exec(text);
      assert.ok(m, text);
      assert.deepEqual({ gap: Number(m[1]), weak: Number(m[2]), info: Number(m[3]) }, tally);
      assert.deepEqual(raw.json.counts, tally);

      for (const id of ['GO-RACE', 'GO-VET', 'GO-VULN']) assert.equal(one(findings, id).severity, 'gap', id);

      // The documented format.
      assert.match(text, /^---\ngenerated: "\d{4}-\d{2}-\d{2}"\nprofile: "go"\nprofile_source: draft\ncomponents: \[\]\ncounts: /);
      assert.match(text, /^# Stack Report: /m);
      assert.match(text, /^Proposals only — nothing here has been applied\. Review, then change CI\/runners yourself\.$/m);
      for (const h of ['## Gaps', '## Weak', '## Info', '## Draft notes']) assert.ok(text.includes(`\n${h}\n`), h);
      assert.match(text, /\| ID \| Component \| Finding \| Evidence \| Proposal \|/);
      assert.match(text, /\| Key \| Candidate \| Status \| Source \|/);
      assert.match(text, /\| GO-RACE \|/);

      // Proposals only: CI, runner files and STACK.md are never touched.
      assert.deepEqual(snapshot(wfDir), wfBefore);
      assert.equal(fs.readFileSync(path.join(repo, 'Makefile'), 'utf-8'), makeBefore);
      assert.ok(!fs.existsSync(path.join(repo, '.planning', 'STACK.md')));
      assert.deepEqual(fs.readdirSync(path.join(repo, '.planning')), ['STACK-REPORT.md']);
    });
  });

  test('2. --raw writes nothing and returns JSON findings sorted by (severity, component, id)', () => {
    withShape(fx.polyglotShape, (repo) => {
      const before = snapshot(repo);
      const r = runCli(repo, ['--raw']);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(snapshot(repo), before, 'nothing may be written');
      assert.ok(r.json && Array.isArray(r.json.findings) && r.json.findings.length > 5, r.stdout);
      const { findings } = r.json;
      for (let i = 1; i < findings.length; i++) {
        const a = findings[i - 1];
        const b = findings[i];
        const ka = [SEVERITY_RANK[a.severity], a.component, a.id];
        const kb = [SEVERITY_RANK[b.severity], b.component, b.id];
        const cmp = ka[0] - kb[0] || (ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0) || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0);
        assert.ok(cmp <= 0, `out of order: ${JSON.stringify(a)} before ${JSON.stringify(b)}`);
      }
      for (const f of findings) {
        assert.ok(['gap', 'weak', 'info'].includes(f.severity), JSON.stringify(f));
        for (const k of ['id', 'component', 'finding', 'proposal']) assert.equal(typeof f[k], 'string', `${k} on ${JSON.stringify(f)}`);
        assert.ok(Array.isArray(f.evidence), JSON.stringify(f));
      }
    });
  });

  test('3. --draft --raw without STACK.md reports profile_source draft and writes no STACK.md; a STACK.md file is used when present', () => {
    withShape(fx.goGapsShape, (repo) => {
      const r = runCli(repo, ['--draft', '--raw']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.json.profile_source, 'draft');
      assert.equal(r.json.profile, 'go');
      assert.ok(!fs.existsSync(path.join(repo, '.planning')), '.planning must not be created');

      fs.mkdirSync(path.join(repo, '.planning'));
      fs.writeFileSync(path.join(repo, '.planning', 'STACK.md'), '---\nschema: 1\nid: "ledger"\nextends: "go"\ncommands: {}\n---\n\n# ledger\n', 'utf-8');
      const fromFile = runCli(repo, ['--raw']);
      assert.equal(fromFile.status, 0, fromFile.stderr);
      assert.equal(fromFile.json.profile_source, 'file');
      assert.equal(fromFile.json.id, 'ledger');
      const forced = runCli(repo, ['--draft', '--raw']);
      assert.equal(forced.json.profile_source, 'draft');
    });
  });

  test('3b. an unknown flag or a positional argument is a usage error (exit 1)', () => {
    withShape(fx.goGapsShape, (repo) => {
      assert.equal(runCli(repo, ['--bogus']).status, 1);
      assert.equal(runCli(repo, ['somewhere']).status, 1);
    });
  });
});

describe('computeFindings (TRD 42-08 tests 4-11)', () => {
  test('4. applicability: pure Go has no DART/FLUT/JS/HELM/DOCKER rows; a Flutter app without .maestro gets FLUT-MAESTRO info; with .maestro run in CI there is none', () => {
    withShape(fx.goGapsShape, (repo) => {
      const { findings } = reportOf(repo);
      const foreign = findings.filter((f) => /^(DART|FLUT|JS|HELM|DOCKER)-/.test(f.id));
      assert.deepEqual(foreign, []);
    });
    withShape(fx.flutterAppNoMaestro, (repo) => {
      const { findings } = reportOf(repo);
      const row = one(findings, 'FLUT-MAESTRO');
      assert.equal(row.severity, 'info');
      assert.match(row.snippet, /^maestro test \.maestro$/);
      assert.deepEqual(findings.filter((f) => /^GO-/.test(f.id)), []);
    });
    withShape(fx.flutterAppWithMaestro, (repo) => {
      none(reportOf(repo).findings, 'FLUT-MAESTRO');
    });
  });

  test('5. weak: --no-fatal-infos, bare gofmt -l and continue-on-error golangci-lint are weak rows', () => {
    withShape(fx.weakAnalyzersShape, (repo) => {
      const { findings } = reportOf(repo);
      const analyze = one(findings, 'DART-ANALYZE');
      assert.equal(analyze.severity, 'weak');
      assert.equal(analyze.component, 'app/');
      assert.match(analyze.finding, /--no-fatal-infos/);
      const fmt = one(findings, 'GO-FMT');
      assert.equal(fmt.severity, 'weak');
      assert.equal(fmt.component, 'svc/');
      assert.match(fmt.finding, /bare gofmt -l/);
      const lint = one(findings, 'GO-LINT');
      assert.equal(lint.severity, 'weak');
      assert.match(lint.finding, /continue-on-error/);
      assert.equal(one(findings, 'DART-TEST').severity, 'gap');
    });
  });

  test('6. expansion: CI `make lint` into golangci-lint counts as GO-LINT present; a govulncheck wrapper script counts as GO-VULN present', () => {
    withShape(fx.makeExpansionShape, (repo) => none(reportOf(repo).findings, 'GO-LINT'));
    withShape(fx.wrapperScriptShape, (repo) => none(reportOf(repo).findings, 'GO-VULN'));
  });

  test('7. `uses: golangci/golangci-lint-action` counts as GO-LINT present', () => {
    withShape(fx.usesActionShape, (repo) => none(reportOf(repo).findings, 'GO-LINT'));
  });

  test('8. LOCAL-MIRROR: a CI-only go vet names `lint`; a runner vet target removes the row', () => {
    withShape(fx.SHAPES.localMirrorWithoutVet, (repo) => {
      const row = one(reportOf(repo).findings, 'LOCAL-MIRROR');
      assert.equal(row.severity, 'gap');
      assert.match(row.finding, /\blint\b/);
    });
    withShape(fx.SHAPES.localMirrorWithVet, (repo) => none(reportOf(repo).findings, 'LOCAL-MIRROR'));
  });

  test('9. CI-MISSING is info when there are no workflows (and CI gates are not listed one by one); HELM-LINT is a gap on lint only', () => {
    withShape(fx.noCiShape, (repo) => {
      const { findings } = reportOf(repo);
      assert.equal(one(findings, 'CI-MISSING').severity, 'info');
      none(findings, 'GO-VET');
      none(findings, 'GO-RACE');
      none(findings, 'LOCAL-MIRROR');
    });
    withShape(fx.helmOnlyLintShape, (repo) => {
      const row = one(reportOf(repo).findings, 'HELM-LINT');
      assert.equal(row.severity, 'gap');
      assert.match(row.finding, /kubeconform/);
    });
  });

  test('10. GO-GEN-DRIFT is a gap when sqlc.yaml exists and no `git diff --exit-code` follows the generator', () => {
    withShape(fx.sqlcNoDriftShape, (repo) => assert.equal(one(reportOf(repo).findings, 'GO-GEN-DRIFT').severity, 'gap'));
    withShape(fx.sqlcWithDriftShape, (repo) => none(reportOf(repo).findings, 'GO-GEN-DRIFT'));
  });

  test('11. draft notes: a missing ginkgo becomes a DRAFT-NOTE-test info row naming the candidate and binary_missing', () => {
    withShape(fx.missingBinaryShape, (repo) => {
      const r = runCli(repo, ['--raw']);
      assert.equal(r.status, 0, r.stderr);
      const note = r.json.findings.find((f) => f.id === 'DRAFT-NOTE-test');
      assert.ok(note, JSON.stringify(r.json.findings, null, 2));
      assert.equal(note.severity, 'info');
      assert.match(note.finding, /ginkgo -r -p/);
      assert.match(note.finding, /binary_missing/);

      const md = runCli(repo, []);
      assert.equal(md.status, 0, md.stderr);
      assert.match(md.stdout, /## Draft notes\n\n\| Key \| Candidate \| Status \| Source \|\n\|---\|---\|---\|---\|\n\| test \| `ginkgo -r -p` \| binary_missing \|/);
    });
  });

  test('every catalogue ID is data in REPORT_CHECKS and is exercised by at least one fixture', () => {
    const { REPORT_CHECKS } = lazyReport();
    assert.deepEqual(REPORT_CHECKS.map((c) => c.id), CATALOGUE_IDS);
    for (const c of REPORT_CHECKS) {
      assert.ok(['go', 'dart', 'flutter', 'js', 'helm', 'docker', 'any'].includes(c.stack), c.id);
      assert.ok(['gap', 'weak', 'info'].includes(c.severity), c.id);
      assert.equal(typeof c.proposal, 'string', c.id);
      for (const re of c.ci || []) assert.ok(re instanceof RegExp, c.id);
    }
    const seen = new Set();
    for (const [name, build] of Object.entries(fx.SHAPES)) {
      withShape(build, (repo) => {
        for (const f of reportOf(repo).findings) seen.add(f.id);
      });
      assert.ok(name);
    }
    const missing = CATALOGUE_IDS.filter((id) => !seen.has(id));
    assert.deepEqual(missing, [], `IDs no fixture produced: ${missing.join(', ')}`);
  });

  test('DART-COVER proposes `flutter test --coverage` for Flutter and the Q8-verified `dart test --coverage=coverage` for Dart', () => {
    withShape(fx.flutterAppNoMaestro, (repo) => assert.equal(one(reportOf(repo).findings, 'DART-COVER').snippet, 'flutter test --coverage'));
    withShape(fx.pureDartShape, (repo) => {
      const { findings } = reportOf(repo);
      assert.equal(one(findings, 'DART-COVER').snippet, 'dart test --coverage=coverage');
      none(findings, 'DART-ANALYZE'); // `dart analyze --fatal-infos` is the strict form
      none(findings, 'DART-TEST');
    });
  });
});

describe('determinism and render (TRD 42-08 test 12)', () => {
  test('12. two runs give byte-identical output with the date injected', () => {
    withShape(fx.polyglotShape, (repo) => {
      const a = reportOf(repo);
      const b = reportOf(repo);
      assert.equal(a.text, b.text);
      assert.deepEqual(a.findings, b.findings);
      assert.match(a.text, /^---\ngenerated: "2026-09-28"\n/);
      const { renderReport } = lazyReport();
      assert.equal(renderReport(a.findings, a.meta), a.text);
    });
  });
});

// ─── TRD 54-08: table cells are escaped once, backslash first (CodeQL js/incomplete-sanitization) ───

/**
 * cellsOf(row) -> the trimmed cells of one markdown table row, split on pipes that are NOT
 * escaped. On a backslash the next character is skipped (it is escaped); on a pipe a cell closes.
 * The empty leading and trailing cells (the row's outer pipes) are dropped.
 */
function cellsOf(row) {
  const cells = [];
  let current = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && i + 1 < row.length) {
      current += ch + row[i + 1];
      i += 1;
    } else if (ch === '|') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.slice(1, -1).map((c) => c.trim());
}

describe('report table cells (TRD 54-08 tests 6-8)', () => {
  const META = { generated: '2026-09-28', id: 'demo', profile: 'general', profile_source: 'draft', components: [] };
  const finding = (over) => ({
    id: 'GO-VET', severity: 'gap', component: '', finding: 'no vet', evidence: ['ci.yml'], proposal: 'add go vet', snippet: null, ...over,
  });
  const rowOf = (md, needle) => {
    const line = md.split('\n').find((l) => l.startsWith('|') && l.includes(needle));
    assert.ok(line, `no table row contains ${JSON.stringify(needle)}:\n${md}`);
    return line;
  };

  test('6. a finding containing backslash-pipe renders as exactly five cells, backslash escaped before the pipe', () => {
    const { renderReport } = lazyReport();
    const md = renderReport([finding({ finding: 'a\\|b' })], META);
    const cells = cellsOf(rowOf(md, 'GO-VET'));
    assert.equal(cells.length, 5, JSON.stringify(cells));
    assert.equal(cells[2], 'a\\\\\\|b');
  });

  test('7. an empty component renders (root) and other empty cells render the em-dash placeholder', () => {
    const { renderReport } = lazyReport();
    const md = renderReport([finding({ component: null, evidence: [], proposal: '' })], META);
    const cells = cellsOf(rowOf(md, 'GO-VET'));
    assert.deepEqual(cells, ['GO-VET', '(root)', 'no vet', '—', '—']);
  });

  test('7b. a draft-note row keeps its five-column structure and the em-dash for a missing candidate', () => {
    const { renderReport } = lazyReport();
    const note = { id: 'DRAFT-NOTE-test', severity: 'info', component: '', finding: 'n', evidence: [], proposal: '', note: { key: 'test', candidate: null, status: 'binary_missing', source: 'ci' } };
    const md = renderReport([note], META);
    const cells = cellsOf(rowOf(md, 'binary_missing'));
    assert.deepEqual(cells, ['test', '—', 'binary_missing', 'ci']);
  });
});

// ─── TRD 42-12: report components = the profile's components ───────────────

const { goMod } = require('./__fixtures__/stack-detect-fixtures.cjs');

const NODE_PKG = (name) => `{ "name": "${name}", "private": true, "scripts": { "build": "vite build" } }\n`;

/** One supported go area (svc/) and two unsupported node areas (site/, ui/frontend/). */
function svcPlusNodeShape({ admin = false } = {}) {
  const files = {
    'README.md': '# invented portal\n',
    'svc/go.mod': goMod('svc'),
    'svc/main.go': 'package main\n\nfunc main() {}\n',
    'site/package.json': NODE_PKG('invented-site'),
    'ui/frontend/package.json': NODE_PKG('invented-frontend'),
  };
  if (admin) files['admin/go.mod'] = goMod('admin');
  return fx.makeWhole(files);
}

describe('report components come from the profile (TRD 42-12 G2-G3)', () => {
  test('G2: --draft --raw: components are the draft\'s ([svc/] for one supported sub-area, TRD 43-05 D3); node areas are unsupported_areas', () => {
    withShape(() => svcPlusNodeShape(), (repo) => {
      const r = runCli(repo, ['--draft', '--raw']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.json.profile_source, 'draft');
      assert.deepEqual(r.json.components, ['svc/']);
      assert.deepEqual(r.json.unsupported_areas, ['site/', 'ui/frontend/']);

      const md = runCli(repo, ['--draft']);
      assert.equal(md.status, 0, md.stderr);
      assert.match(md.stdout, /\ncomponents: \["svc\/"\]\nunsupported_areas: \["site\/", "ui\/frontend\/"\]\ncounts: /);
    });
  });

  test('G2b: two supported areas -> components [admin/, svc/], equal to the draft; node areas stay out of them', () => {
    withShape(() => svcPlusNodeShape({ admin: true }), (repo) => {
      const r = runCli(repo, ['--draft', '--raw']);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(r.json.components, ['admin/', 'svc/']);
      assert.deepEqual(r.json.unsupported_areas, ['site/', 'ui/frontend/']);

      // In-process: meta.components deep-equals the draft's own components[].path.
      const sp = require('./stack-profile.cjs');
      const draft = sp.draftProfile({ projectRoot: repo, userHome: home, now: FIXED_NOW, verify: stubVerify });
      const built = reportOf(repo, { draft: true });
      assert.deepEqual(built.meta.components, (draft.frontmatter.components || []).map((c) => c.path));
      assert.match(built.text, /\ncomponents: \["admin\/", "svc\/"\]\nunsupported_areas: \["site\/", "ui\/frontend\/"\]\n/);
    });
  });

  test('G3: --raw with STACK.md components [svc/] -> components exactly [svc/] even though tools/x/ is detected', () => {
    const repo = fx.makeWhole({
      'go.mod': goMod('ledger'),
      'main.go': 'package main\n\nfunc main() {}\n',
      'svc/go.mod': goMod('svc'),
      'tools/x/go.mod': goMod('tools-x'),
      '.planning/STACK.md': '---\nschema: 1\nid: "ledger"\nextends: "go"\ncomponents: [{ path: "svc/", profile: "go" }]\ncommands: {}\n---\n\n# ledger\n',
    });
    try {
      const r = runCli(repo, ['--raw']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.json.profile_source, 'file');
      assert.deepEqual(r.json.components, ['svc/']);
      assert.deepEqual(r.json.unsupported_areas, []);
      const md = runCli(repo, []);
      assert.match(md.stdout, /\ncomponents: \["svc\/"\]\ncounts: /);
      assert.equal(md.stdout.includes('unsupported_areas'), false, 'an empty unsupported_areas is not rendered');
    } finally {
      fx.cleanup(repo);
    }
  });
});

describe('Q8 probe (TRD 42-08 test 14, skip-only)', () => {
  test('14. `dart test --coverage=coverage` in a temp minimal Dart package (diagnostic only; never fails on the outcome)', (t) => {
    const probe = spawnSync('dart', ['--version'], { encoding: 'utf-8', timeout: 30000 });
    if (probe.error || probe.status !== 0) {
      t.skip('dart is not installed');
      return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-q8-probe-'));
    try {
      fs.mkdirSync(path.join(dir, 'test'));
      fs.writeFileSync(path.join(dir, 'pubspec.yaml'), 'name: q8_probe\npublish_to: none\nenvironment:\n  sdk: ^3.5.0\ndev_dependencies:\n  test: any\n', 'utf-8');
      fs.writeFileSync(path.join(dir, 'test', 'probe_test.dart'), "import 'package:test/test.dart';\n\nvoid main() {\n  test('adds', () => expect(1 + 1, 2));\n}\n", 'utf-8');
      const get = spawnSync('dart', ['pub', 'get', '--offline'], { cwd: dir, encoding: 'utf-8', timeout: 120000 });
      if (get.status !== 0) {
        t.diagnostic(`Q8: dart pub get --offline failed (package:test not cached): ${(get.stderr || '').trim().split('\n').pop()}`);
        t.skip('package:test is not in the offline pub cache');
        return;
      }
      const run = spawnSync('dart', ['test', '--coverage=coverage'], { cwd: dir, encoding: 'utf-8', timeout: 180000 });
      let produced = [];
      try { produced = fs.readdirSync(path.join(dir, 'coverage'), { recursive: true }).map(String).sort(); } catch (_) { produced = []; }
      t.diagnostic(`Q8: dart test --coverage=coverage exit=${run.status}; coverage/ contains: ${produced.join(', ') || '(nothing)'}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
