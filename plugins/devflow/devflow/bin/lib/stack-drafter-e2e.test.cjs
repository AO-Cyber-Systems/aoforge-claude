'use strict';

// stack-drafter-e2e.test.cjs — ROADMAP criterion 1, end to end (TRD 42-07 tests 1-10).
//
// `df-tools --cwd <repo> stack init` over an invented repo shaped like every observed fleet
// failure, with PATH = a dir of stub tools ONLY (nothing leaks in from the node dir) and HOME = an
// empty temp dir, so the bundled tier-2 profiles are what resolve and verification is
// deterministic.
//
//  1  multi-area CI (aocore)        general + components; gosec in sast (a govulncheck wrapper is
//                                   the audit); no `-fmt` format; lint_helm; e2e is not test
//  2  fragment build (eden-biz)     api-dart is dart; no `${{`; the build is noted, never a fragment
//  3  comment test (devflow)        extends go; test is never a comment; lint inherited/go vet
//  4  echo release (aoinference)    extends general + component control-plane/ (TRD 43-05); build/test/lint from its
//                                   Makefile with cwd; no echo
//  5  control fragment (eden-circle) no control fragment; test from the Makefile
//  6  continuation + sed            the joined go test; sed never classified
//  7  manifest-only Flutter         extends flutter; only e2e: maestro test .maestro; inherits mcp
//  8  empty / docs-only             general, commands {}, an info note, exit 0
//  9a gosec-only                    audit is the joined gosec, no sast
//  9  binary missing                test: discover, binary_missing note, body names the command
//  10 every shape                   validation ok, reviewed = localDate(), no .planning/stacks/

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/stack-drafter-fixtures.cjs');
const { parseProfile } = require('./stack-profile.cjs');
const { localDate } = require('./helpers.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// TRD 42-07 Task 3: no run/apply may be a comment, flag, `${{ }}`, echo/printf, a `test -f` guard,
// a control word or brace, or end in a line continuation.
const FRAGMENT_RE = /^\s*(#|-|\$\{\{|echo\b|printf\b|test -f|\[|if\b|then\b|fi\b|\{|\})|\\\s*$|\$\{\{/;

function assertNoFragments(commands) {
  for (const [key, entry] of Object.entries(commands || {})) {
    for (const field of ['run', 'apply']) {
      const v = entry && entry[field];
      if (v === undefined) continue;
      assert.equal(typeof v, 'string', `${key}.${field} is not a string`);
      assert.ok(!FRAGMENT_RE.test(v), `${key}.${field} is a fragment: ${JSON.stringify(v)}`);
    }
  }
}

let home;
before(() => { home = fx.fakeEmptyHome(); });
after(() => { fx.cleanup(home); });

/** stackInit(repo, { tools, write, raw }) -> { status, stdout, stderr, json, fm, text } */
function stackInit(repo, { tools = fx.DEFAULT_TOOLCHAIN, write = false, raw = false, git = false } = {}) {
  const bin = fx.fakeToolchain(tools);
  const gitDir = git ? fx.gitOnlyBin() : null;
  try {
    const args = [DF_TOOLS, '--cwd', repo, 'stack', 'init'];
    if (write) args.push('--write');
    if (raw) args.push('--raw');
    const PATH = gitDir ? `${bin}${path.delimiter}${gitDir}` : bin;
    const r = spawnSync(process.execPath, args, { encoding: 'utf-8', env: { PATH, HOME: home }, timeout: 60000 });
    let json = null;
    let text = r.stdout;
    if (!raw) {
      try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
      text = json ? json.text : '';
    }
    const fm = text ? parseProfile(text).frontmatter : null;
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, fm, text };
  } finally {
    fx.cleanup(bin, gitDir);
  }
}

function withShape(build, fn) {
  const repo = build();
  try {
    return fn(repo);
  } finally {
    fx.cleanup(repo);
  }
}

const allRuns = (commands) => Object.values(commands || {}).flatMap((e) => [e.run, e.apply].filter(Boolean));

describe('stack init over the fleet failure shapes (TRD 42-07 e2e)', () => {
  test('1: multi-area CI (aocore-shaped)', () => withShape(fx.multiAreaCiShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.extends, 'general');
    for (const c of [{ path: 'svc/', profile: 'go' }, { path: 'app/', profile: 'flutter' }, { path: 'admin/', profile: 'flutter' }]) {
      assert.ok(fm.components.some((x) => x.path === c.path && x.profile === c.profile), `missing component ${JSON.stringify(c)}`);
    }
    assert.ok(!fm.components.some((c) => c.path === 'portal/'), 'an unsupported area is never a component');
    // gosec's `-fmt sarif` is not a format command anywhere.
    assert.ok(!(fm.commands.format && /-fmt/.test(allRuns({ f: fm.commands.format }).join(' '))));
    assert.ok(!json.notes.some((n) => n.key === 'format'));
    // gosec lands in sast because the govulncheck wrapper supplies audit.
    const sast = json.notes.find((n) => n.key === 'sast') || (fm.commands.sast && { candidate: fm.commands.sast.run });
    assert.ok(sast, JSON.stringify(json.notes));
    assert.match(sast.candidate, /^gosec /);
    assert.equal(sast.candidate, 'gosec -exclude=G104 -fmt sarif -out gosec.sarif ./...');
    assert.ok(!allRuns(fm.commands).some((v) => v.startsWith('gosec')) || fm.commands.sast);
    assert.ok(!(fm.commands.audit && fm.commands.audit.run.startsWith('gosec')));
    assert.ok(!json.notes.some((n) => n.key === 'audit' && String(n.candidate).startsWith('gosec')));
    // helm lint is lint_helm, never lint.
    assert.ok(fm.commands.lint_helm, JSON.stringify(fm.commands));
    assert.ok(fm.commands.lint_helm.run === 'helm lint chart/' || (fm.commands.lint_helm.run === 'discover' && json.notes.some((n) => n.key === 'lint_helm')));
    assert.ok(!(fm.commands.lint && /helm/.test(fm.commands.lint.run)));
    // playwright is e2e, never test.
    assert.ok(!(fm.commands.test && /playwright/.test(fm.commands.test.run)));
    assert.ok(json.notes.some((n) => n.key === 'e2e' && /playwright/.test(n.candidate)) || (fm.commands.e2e && /playwright/.test(fm.commands.e2e.run)));
    assertNoFragments(fm.commands);
  }));

  test('2: fragment build (eden-biz-shaped)', () => withShape(fx.fragmentBuildShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.ok(fm.components.some((c) => c.path === 'api-dart/' && c.profile === 'dart'), JSON.stringify(fm.components));
    assert.ok(!fm.components.some((c) => c.path === 'api-dart/' && c.profile === 'flutter'));
    assert.ok(fm.components.some((c) => c.path === 'app/' && c.profile === 'flutter'));
    for (const v of allRuns(fm.commands)) assert.ok(!v.includes('${{'), v);
    // The build is either a verified full command or discover plus a note; never a `\` fragment.
    if (fm.commands.build && fm.commands.build.run !== 'discover') {
      assert.ok(!/\\\s*$/.test(fm.commands.build.run));
    } else {
      assert.ok(json.notes.some((n) => n.key === 'build'), JSON.stringify(json.notes));
    }
    for (const n of json.notes) {
      if (n.candidate) assert.ok(!/\\\s*$/.test(n.candidate), `note candidate ends in a continuation: ${n.candidate}`);
    }
    assertNoFragments(fm.commands);
  }));

  test('3: comment line before go vet / gofmt / gopls (devflow-shaped)', () => withShape(fx.commentTestShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.extends, 'go');
    assert.ok(!(fm.commands.test && fm.commands.test.run.startsWith('#')));
    assert.ok(!json.evidence.some((e) => e.command.startsWith('#')), 'a comment is never evidence');
    assert.ok(!fm.commands.lint || fm.commands.lint.run === 'go vet ./...', JSON.stringify(fm.commands.lint));
    assert.ok(!allRuns(fm.commands).some((v) => v.includes('gopls')));
    assertNoFragments(fm.commands);
  }));

  test('4: echo-only release + control-plane/Makefile (aoinference-shaped)', () => withShape(fx.echoReleaseShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm } = r;
    // TRD 43-05, D3 (literal rule): no root manifest -> general + the one go area as a component; the
    // primary component supplies the root build/test/lint, each from `control-plane`.
    assert.equal(fm.extends, 'general');
    assert.deepStrictEqual(fm.components, [{ path: 'control-plane/', profile: 'go' }]);
    assert.deepStrictEqual(fm.commands.test, { run: 'make test', cwd: 'control-plane' });
    assert.deepStrictEqual(fm.commands.lint, { run: 'make lint', cwd: 'control-plane' });
    assert.deepStrictEqual(fm.commands.build, { run: 'make build', cwd: 'control-plane' });
    assert.ok(!allRuns(fm.commands).some((v) => /echo|Published/.test(v)));
    // The component inherits format/fix/audit/codegen/tidy from its tier: none is a root key.
    for (const key of ['tidy', 'format', 'fix', 'audit', 'codegen']) assert.equal(key in fm.commands, false, key);
    for (const entry of Object.values(fm.commands)) assert.equal(entry.cwd, 'control-plane');
    assertNoFragments(fm.commands);
  }));

  test('5: `test -f x || {` control fragment (eden-circle-shaped)', () => withShape(fx.controlFragmentShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.extends, 'go');
    assert.ok(!fm.commands.test || ['make test', 'go test -race ./...'].includes(fm.commands.test.run), JSON.stringify(fm.commands.test));
    assert.equal(fm.commands.test.run, 'make test', 'the Makefile target outranks the CI line');
    assert.ok(!json.evidence.some((e) => /^(test -f|\{|\}|exit\b|echo\b)/.test(e.command)));
    assertNoFragments(fm.commands);
  }));

  test('6: `\\`-continued go test beside a sed -i step (aodex/politihub shape)', () => withShape(fx.continuationSedShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.commands.test.run, 'go test -race -coverprofile=cover.out ./...');
    assert.ok(!json.evidence.some((e) => e.command.startsWith('sed')), 'sed is never classified');
    assert.ok(!allRuns(fm.commands).some((v) => v.startsWith('sed')));
    assertNoFragments(fm.commands);
  }));

  test('7: manifest-only Flutter app with .maestro/ — extends flutter, maestro e2e, inherits agent_tooling.mcp', () => withShape(fx.manifestOnlyFlutterShape, (repo) => {
    const r = stackInit(repo, { write: true });
    assert.equal(r.status, 0, r.stderr);
    const { fm } = r;
    assert.equal(fm.extends, 'flutter');
    const keys = Object.keys(fm.commands);
    assert.ok(keys.length === 0 || (keys.length === 1 && fm.commands.e2e.run === 'maestro test .maestro'), JSON.stringify(fm.commands));
    assert.deepStrictEqual(fm.commands.e2e, { run: 'maestro test .maestro' });

    const resolved = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, 'stack', 'resolve'], {
      encoding: 'utf-8', env: { PATH: path.dirname(process.execPath), HOME: home }, timeout: 60000,
    });
    assert.equal(resolved.status, 0, resolved.stderr);
    const rj = JSON.parse(resolved.stdout);
    assert.ok(rj.chain.some((l) => l.id === 'flutter'));
    const mcp = rj.frontmatter.agent_tooling && rj.frontmatter.agent_tooling.mcp;
    assert.ok(Array.isArray(mcp) && mcp.some((m) => m.name === 'dart'), JSON.stringify(rj.frontmatter.agent_tooling));
  }));

  for (const [label, build] of [['empty', fx.emptyShape], ['docs-only', fx.docsOnlyShape]]) {
    test(`8: ${label} repo -> general, commands {}, an info note, exit 0`, () => withShape(build, (repo) => {
      const r = stackInit(repo);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.fm.extends, 'general');
      assert.deepStrictEqual(r.fm.commands, {});
      assert.ok(r.json.notes.some((n) => n.status === 'info'), JSON.stringify(r.json.notes));
      assert.equal(r.fm.components, undefined);
    }));
  }

  test('9a: gosec-only CI -> audit is the joined gosec command, no sast', () => withShape(fx.gosecOnlyShape, (repo) => {
    const r = stackInit(repo, { tools: [...fx.DEFAULT_TOOLCHAIN, 'gosec'] });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.fm.extends, 'go');
    assert.equal(r.fm.commands.audit.run, 'gosec -exclude=G104 ./...');
    assert.equal('sast' in r.fm.commands, false);
    assertNoFragments(r.fm.commands);
  }));

  test('9: ginkgo not installed -> test: discover, a binary_missing note, the body names the command', () => withShape(fx.missingBinaryShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    assert.deepStrictEqual(r.fm.commands.test, { run: 'discover' });
    const n = r.json.notes.find((x) => x.key === 'test');
    assert.ok(n, JSON.stringify(r.json.notes));
    assert.equal(n.status, 'binary_missing');
    assert.equal(n.candidate, 'ginkgo -r -p');
    assert.match(r.text, /<!-- stack init notes[\s\S]*ginkgo -r -p[\s\S]*-->/);

    // --raw prints the same STACK.md text.
    const raw = stackInit(repo, { raw: true });
    assert.equal(raw.status, 0);
    assert.match(raw.stdout, /ginkgo -r -p/);
    assert.deepStrictEqual(parseProfile(raw.stdout).frontmatter.commands.test, { run: 'discover' });
  }));

  test('11: ao-terminal-shaped repo (TRD 42-13: G1 ignored dist/, G2 broad test, G3 canonical build)', { skip: !fx.hasGit() && 'git not available' }, () => withShape(fx.terminalShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.extends, 'go');
    assert.ok(!(fm.components || []).some((c) => c.path.startsWith('dist/')), `G1: ${JSON.stringify(fm.components)}`);
    assert.equal('test' in fm.commands, false, `G2: the go profile's test applies, not ${JSON.stringify(fm.commands.test)}`);
    assert.equal(fm.commands.build.run, 'task build:backend', `G3: ${JSON.stringify(fm.commands.build)}`);
    const narrow = json.notes.find((n) => n.status === 'narrow' && n.candidate === 'go test -c -o /tmp/guard.test ./tests/guard/');
    assert.ok(narrow, JSON.stringify(json.notes));
    assert.equal(narrow.key, 'test');
    assert.match(narrow.detail, /compile-only/);
    const subtree = json.notes.find((n) => n.status === 'narrow' && n.candidate === 'go test ./pkg/guardnet/...');
    assert.ok(subtree, `a package sub-tree is not repo-wide: ${JSON.stringify(json.notes)}`);
    assert.match(subtree.detail, /single-path/);
    // TRD 43-01 D5: `build:agent:internal` is `internal: true`, so it cannot be run from the CLI and
    // is never offered, not even as an alternate. A public variant still is.
    assert.ok(!json.notes.some((n) => /build:agent:internal/.test(String(n.candidate || ''))), JSON.stringify(json.notes));
    assert.ok(json.notes.some((n) => n.status === 'alternate' && n.key === 'build' && n.candidate === 'task build:agent:quickdev'), JSON.stringify(json.notes));
    assert.equal(json.validation.ok, true, JSON.stringify(json.validation.errors));
    assertNoFragments(fm.commands);

    // --raw prints the same STACK.md, with the notes in its comment block.
    const raw = stackInit(repo, { raw: true });
    assert.equal(raw.status, 0, raw.stderr);
    const rawFm = parseProfile(raw.stdout).frontmatter;
    assert.equal(rawFm.commands.build.run, 'task build:backend');
    assert.equal('test' in rawFm.commands, false);
    assert.match(raw.stdout, /<!-- stack init notes[\s\S]*narrow[\s\S]*-->/);
  }));

  test('10: every shape validates, is reviewed today, and --write never creates .planning/stacks/', () => {
    for (const [name, build] of Object.entries(fx.SHAPES)) {
      withShape(build, (repo) => {
        const before = localDate();
        const tools = name === 'gosecOnlyShape' ? [...fx.DEFAULT_TOOLCHAIN, 'gosec'] : fx.DEFAULT_TOOLCHAIN;
        const r = stackInit(repo, { tools, write: true });
        const after = localDate();
        assert.equal(r.status, 0, `${name}: ${r.stderr}`);
        assert.equal(r.json.validation.ok, true, `${name}: ${JSON.stringify(r.json.validation.errors)}`);
        assert.equal(r.json.action, 'written', name);
        assert.ok([before, after].includes(r.fm.provenance.reviewed), `${name}: reviewed ${r.fm.provenance.reviewed}`);
        assert.equal(fs.existsSync(path.join(repo, '.planning', 'stacks')), false, `${name} created .planning/stacks/`);
        const planning = fs.readdirSync(path.join(repo, '.planning'));
        assert.deepStrictEqual(planning, ['STACK.md'], `${name}: stack init writes only STACK.md`);
        assertNoFragments(r.fm.commands);
      });
    }
  });
});

// ─── TRD 42-15: D1-D5 end to end (git on PATH beside the fake tools) ──────────
//
//  12  D3 terminal root policy     test inherits go; deps absent; build task build:backend;
//                                  off_stack npm test; sub_area task docs:npm:install
//  13  D3 positive control         a Taskfile `test` running go test overrides: task test
//  14  D1 checkout path            cwd `go`, never `svcrepo/`
//  15  D2 ignored baseline         nothing at `.snapshot/`; a cwd_ignored note
//  16  D4 nested repos             no component/area/cwd under either; cwd_nested_repo notes
//  17  D5 tracked-but-ignored      the preview lists both stack files in `ignored`

const NO_GIT = fx.hasGit() ? false : 'git not available';
const cwdsOf = (commands) => Object.values(commands || {}).map((e) => e.cwd).filter(Boolean);

describe('stack init closes D1-D5 end to end (TRD 42-15)', () => {
  test('12: D3 terminal root policy — a node sub-area never takes over a go root key', { skip: NO_GIT }, () => withShape(() => fx.termRootPolicyShape(), (repo) => {
    const r = stackInit(repo, { git: true, tools: [...fx.DEFAULT_TOOLCHAIN, 'buf'] });
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.extends, 'go');
    assert.deepStrictEqual(fm.commands.codegen, { run: 'make proto', when: 'sources_changed' }, 'a neutral generator is not off-stack');
    assert.equal('test' in fm.commands, false, `test inherits go test -race ./..., not ${JSON.stringify(fm.commands.test)}`);
    assert.equal('deps' in fm.commands, false, `the docs install is not a root deps: ${JSON.stringify(fm.commands.deps)}`);
    assert.equal(fm.commands.build.run, 'task build:backend', JSON.stringify(fm.commands.build));
    const off = json.notes.find((n) => n.status === 'off_stack' && n.candidate === 'npm test');
    assert.ok(off, JSON.stringify(json.notes));
    assert.equal(off.key, 'test');
    assert.match(off.detail, /node/);
    const sub = json.notes.find((n) => n.status === 'sub_area' && n.candidate === 'task docs:npm:install');
    assert.ok(sub, JSON.stringify(json.notes));
    assert.equal(sub.key, 'deps');
    assert.match(sub.detail, /site\//);
    assert.ok(!allRuns(fm.commands).some((v) => /npm|vitest/.test(v)), JSON.stringify(fm.commands));
    assert.equal(json.validation.ok, true, JSON.stringify(json.validation.errors));
    assertNoFragments(fm.commands);

    const raw = stackInit(repo, { raw: true, git: true });
    assert.equal(raw.status, 0, raw.stderr);
    assert.match(raw.stdout, /<!-- stack init notes[\s\S]*off_stack[\s\S]*sub_area[\s\S]*-->|<!-- stack init notes[\s\S]*sub_area[\s\S]*off_stack[\s\S]*-->/);
  }));

  test('13: D3 positive control — a root Taskfile `test` running go test overrides the profile', { skip: NO_GIT }, () => withShape(() => fx.termRootPolicyShape({ goTestTarget: true }), (repo) => {
    const r = stackInit(repo, { git: true });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.fm.extends, 'go');
    assert.equal(r.fm.commands.test.run, 'task test', JSON.stringify(r.fm.commands.test));
    assert.equal('deps' in r.fm.commands, false);
    assert.ok(r.json.notes.some((n) => n.status === 'off_stack' && n.candidate === 'npm test'), JSON.stringify(r.json.notes));
  }));

  test('14: D1 checkout path — the placed cwd is `go`, never `svcrepo/`', { skip: NO_GIT }, () => withShape(fx.checkoutPathShape, (repo) => {
    const r = stackInit(repo, { git: true });
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    // TRD 43-05, D3: general root + the one go area `go/` as a component (the checkout path is still never the cwd).
    assert.equal(fm.extends, 'general');
    assert.deepStrictEqual(fm.components, [{ path: 'go/', profile: 'go' }]);
    assert.deepStrictEqual(fm.commands.test, { run: 'go test -race -count=1 ./...', scoped: 'go test -race {packages}', cwd: 'go' });
    for (const cwd of cwdsOf(fm.commands)) assert.equal(cwd, 'go', JSON.stringify(fm.commands));
    for (const key of ['build', 'lint']) assert.equal((fm.commands[key] || {}).cwd, 'go', `${key} falls back to the go tier from go/: ${JSON.stringify(fm.commands)}`);
    assert.ok(!json.evidence.some((e) => String(e.cwd || '').startsWith('svcrepo')), JSON.stringify(json.evidence.map((e) => e.cwd)));
    assert.ok(!JSON.stringify(json.notes).includes('svcrepo/'), JSON.stringify(json.notes));
  }));

  test('15: D2 ignored baseline — no command at `.snapshot/`, a cwd_ignored note', { skip: NO_GIT }, () => withShape(fx.ignoredBaselineShape, (repo) => {
    const r = stackInit(repo, { git: true });
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.extends, 'go');
    assert.ok(!cwdsOf(fm.commands).some((c) => c.startsWith('.snapshot')), JSON.stringify(fm.commands));
    assert.ok(!allRuns(fm.commands).some((v) => /npm/.test(v)), JSON.stringify(fm.commands));
    const n = json.notes.find((x) => x.status === 'cwd_ignored');
    assert.ok(n, JSON.stringify(json.notes));
    assert.equal(n.candidate, 'npm test');
  }));

  test('16: D4 nested repos — no component, area or cwd under either; cwd_nested_repo notes', { skip: NO_GIT }, () => withShape(fx.nestedRepoShape, (repo) => {
    const r = stackInit(repo, { git: true });
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.extends, 'go');
    const nested = (p) => /^(vendored-sdk|other-lib)(\/|$)/.test(String(p || ''));
    assert.ok(!(fm.components || []).some((c) => nested(c.path)), JSON.stringify(fm.components));
    if (Array.isArray(json.areas)) assert.ok(!json.areas.some((a) => nested(a.dir)), JSON.stringify(json.areas));
    assert.ok(!cwdsOf(fm.commands).some(nested), JSON.stringify(fm.commands));
    const notes = json.notes.filter((x) => x.status === 'cwd_nested_repo');
    assert.ok(notes.some((x) => x.candidate === 'go test -count=1 ./...'), JSON.stringify(json.notes));
    assert.ok(notes.some((x) => x.candidate === 'go build ./...'), JSON.stringify(json.notes));
  }));

  test('17: D5 tracked-but-ignored .planning — the preview lists both stack files in `ignored`', { skip: NO_GIT }, () => withShape(fx.trackedPlanningIgnoredShape, (repo) => {
    const r = stackInit(repo, { git: true });
    assert.equal(r.status, 0, r.stderr);
    assert.deepStrictEqual([...r.json.ignored].sort(), ['.planning/STACK-REPORT.md', '.planning/STACK.md']);
    const raw = stackInit(repo, { raw: true, git: true });
    assert.equal(raw.status, 0, raw.stderr);
    assert.match(raw.stderr, /\.planning\/STACK\.md/);
    assert.match(raw.stderr, /\.planning\/STACK-REPORT\.md/);
    assert.equal(fs.existsSync(path.join(repo, '.planning', 'STACK.md')), false, 'a preview writes nothing');
  }));
});

// ─── TRD 43-01: runner readers (D1 Make variables, D5 internal Taskfile tasks) ────────────────
//
//  18  D1 aggregate Make    `build: frontend backend` with a `$(GO) build` leg drafts make build/test/lint
//  19  D5 internal tasks    `internal: true` Taskfile tasks are never a command or a candidate
//      (and e2e 11 no longer expects an `alternate` note for its internal build task)

describe('stack init closes the runner-reader defects end to end (TRD 43-01)', () => {
  test('18: D1 aggregate Make — `$(GO)` expands, so `make build/test/lint` win (devflowops-shaped)', () => withShape(fx.aggregateMakeShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    for (const key of ['build', 'test', 'lint']) {
      assert.equal((fm.commands[key] || {}).run, `make ${key}`, `${key}: ${JSON.stringify(fm.commands)} notes: ${JSON.stringify(json.notes)}`);
    }
    assert.ok(
      !json.notes.some((n) => n.status === 'off_stack' && n.candidate === 'make build'),
      `make build is not off_stack: ${JSON.stringify(json.notes)}`,
    );
    assert.ok(!JSON.stringify(fm.commands).includes('app_no_gcc'), `no variant name in commands: ${JSON.stringify(fm.commands)}`);
    assert.equal(json.validation.ok, true, JSON.stringify(json.validation.errors));
    assertNoFragments(fm.commands);
  }));

  test('19: D5 internal tasks — never a command, candidate or note; tidy stays the go tier default (ao-terminal-shaped)', () => withShape(fx.internalTaskShape, (repo) => {
    const r = stackInit(repo);
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    assert.equal(fm.extends, 'go');
    const hidden = /\btask (go:mod:tidy|npm:install)\b/;
    assert.ok(!allRuns(fm.commands).some((v) => hidden.test(v)), `commands: ${JSON.stringify(fm.commands)}`);
    assert.ok(!json.evidence.some((e) => hidden.test(String(e.command))), `candidates: ${JSON.stringify(json.evidence)}`);
    assert.ok(!json.notes.some((n) => hidden.test(String(n.candidate || ''))), `notes: ${JSON.stringify(json.notes)}`);
    // With no override, `tidy` is whatever the bundled go profile says.
    assert.equal('tidy' in fm.commands, false, `tidy inherits the go tier, not ${JSON.stringify(fm.commands.tidy)}`);
    const goTier = parseProfile(fs.readFileSync(path.join(__dirname, '..', '..', 'stack-profiles', 'go.md'), 'utf-8')).frontmatter;
    assert.equal(goTier.commands.tidy.run, 'go mod tidy -diff');
    assert.equal(goTier.commands.tidy.apply, 'go mod tidy');
    assert.equal(json.validation.ok, true, JSON.stringify(json.validation.errors));
    assertNoFragments(fm.commands);
  }));
});

// ─── TRD 43-04: environment and scenario targets get their own key (D4) ─────────────────────────
//
//  20  env bring-up (eden-biz)   `make e2e-stack-up` is e2e_env, never e2e; a single-purpose check
//                                script is a narrow note, never the repo-wide test
//  21  scenario wrapper (EdenDocs) a wrapper named *-e2e.sh is e2e, though its first body line is go build

describe('stack init gives environment and scenario targets their own key end to end (TRD 43-04)', () => {
  const TOOLS = [...fx.DEFAULT_TOOLCHAIN, 'docker', 'npx'];

  test('20: env bring-up — `make e2e-stack-up` is e2e_env; the migrations check script is a narrow note (eden-biz-shaped)', () => withShape(fx.envBringUpShape, (repo) => {
    const r = stackInit(repo, { tools: TOOLS });
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    const detail = `commands: ${JSON.stringify(fm.commands)} notes: ${JSON.stringify(json.notes)}`;
    assert.equal((fm.commands.e2e_env || {}).run, 'make e2e-stack-up', detail);
    assert.notEqual((fm.commands.e2e_env || {}).run, 'make infra-up', `a generic compose target must not outrank the scenario-named one: ${detail}`);
    assert.notEqual((fm.commands.e2e || {}).run, 'make e2e-stack-up', detail);
    assert.equal((fm.commands.e2e || {}).run, 'make e2e', detail);
    assert.ok(!allRuns(fm.commands).some((v) => /check-migrations/.test(v)), detail);
    const n = json.notes.find((x) => x.status === 'narrow' && /check-migrations_test\.sh/.test(String(x.candidate)));
    assert.ok(n, detail);
    assert.match(n.detail, /single-purpose script/);
    assert.equal(json.validation.ok, true, JSON.stringify(json.validation.errors));
    assertNoFragments(fm.commands);
  }));

  test('21: scenario wrapper — `docs-e2e.sh` is e2e, never build, though its first body line is go build (EdenDocs-shaped)', () => withShape(fx.scenarioWrapperShape, (repo) => {
    const r = stackInit(repo, { tools: TOOLS });
    assert.equal(r.status, 0, r.stderr);
    const { fm, json } = r;
    const detail = `commands: ${JSON.stringify(fm.commands)} notes: ${JSON.stringify(json.notes)}`;
    assert.equal((fm.commands.e2e || {}).run, './docsvc/scripts/docs-e2e.sh', detail);
    for (const [key, entry] of Object.entries(fm.commands)) {
      if (key === 'e2e') continue;
      assert.ok(!allRuns({ [key]: entry }).some((v) => /docs-e2e/.test(v)), `${key} holds the scenario script: ${detail}`);
    }
    assert.ok(!json.notes.some((x) => x.key === 'build' && /docs-e2e/.test(String(x.candidate))), detail);
    assert.equal(json.validation.ok, true, JSON.stringify(json.validation.errors));
    assertNoFragments(fm.commands);
  }));
});
