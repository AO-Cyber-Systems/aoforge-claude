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
//  4  echo release (aoinference)    extends go; keys from control-plane/Makefile with cwd; no echo
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
function stackInit(repo, { tools = fx.DEFAULT_TOOLCHAIN, write = false, raw = false } = {}) {
  const bin = fx.fakeToolchain(tools);
  try {
    const args = [DF_TOOLS, '--cwd', repo, 'stack', 'init'];
    if (write) args.push('--write');
    if (raw) args.push('--raw');
    const r = spawnSync(process.execPath, args, { encoding: 'utf-8', env: { PATH: bin, HOME: home }, timeout: 60000 });
    let json = null;
    let text = r.stdout;
    if (!raw) {
      try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
      text = json ? json.text : '';
    }
    const fm = text ? parseProfile(text).frontmatter : null;
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, fm, text };
  } finally {
    fx.cleanup(bin);
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
    assert.equal(fm.extends, 'go');
    assert.deepStrictEqual(fm.commands.test, { run: 'make test', cwd: 'control-plane' });
    assert.deepStrictEqual(fm.commands.lint, { run: 'make lint', cwd: 'control-plane' });
    assert.deepStrictEqual(fm.commands.build, { run: 'make build', cwd: 'control-plane' });
    assert.ok(!allRuns(fm.commands).some((v) => /echo|Published/.test(v)));
    // Inherited go commands would otherwise run at the root, where there is no go.mod.
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
    assert.ok(json.notes.some((n) => n.status === 'alternate' && n.key === 'build' && n.candidate === 'task build:agent:internal'), JSON.stringify(json.notes));
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
