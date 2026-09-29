'use strict';

// stack-profiles-content.test.cjs — TRD 42-02 (SDR-04).
//
// The tier-2 go/dart/flutter profiles ship bundled in the plugin at devflow/stack-profiles/, and
// carry the fixes verified live on 2026-09-28 (42-RESEARCH section 2.2). These tests pin the fixes
// down, so a later edit cannot quietly bring back a gate that never fails or a stale tool list.
//
// Test list:
// - C1a go.md and dart.md each pass validateProfile with ok, no errors and no warnings (so no
//       STK010). Both extend `general`, so no tier lookup is involved.
// - C2  go: `format.run` is `test -z "$(gofmt -l .)"` (survives a serialize/parse round trip, and
//       really exits non-zero on unformatted code); the gopls MCP entry has no tool lists.
//       dart: `audit.run` is `none`, `outdated` exists and sits in no gate, `gates.objective` has
//       no `audit`. dart/flutter: MCP `args` use feature flags (`--enable cli`), no tool lists.
//       flutter: `build.run` is `discover`. Every `skills[].pin` is absent or a hex commit, and
//       every `provenance.reviewed` was bumped.
// - C3  bodies: flutter names `flutter-add-widget-test` and `.maestro/`; dart names
//       `dart-collect-coverage`; every upstream skill name carries its `flutter-`/`dart-` prefix;
//       go no longer says it "isn't shipped in core".
// - C4  the move left no copy behind in docs/stack-profiles/.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sp = require('./stack-profile.cjs');

const PROFILES_DIR = path.join(__dirname, '..', '..', 'stack-profiles');
// docs/ is not in the ~/.claude/devflow mirror; walk up to the checkout root from __dirname.
const CHECKOUT_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const NAMES = ['go', 'dart', 'flutter'];
const GO_FORMAT_GATE = 'test -z "$(gofmt -l .)"';

function load(name) {
  const p = path.join(PROFILES_DIR, `${name}.md`);
  const text = fs.readFileSync(p, 'utf-8');
  return { path: p, text, parsed: sp.parseProfile(text, { source: p }) };
}

// Everything after the closing `---` of the front matter.
function bodyOf(text) {
  const lines = text.split('\n');
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  return lines.slice(close + 1).join('\n');
}

function onPath(bin) {
  return spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf-8' }).status === 0;
}

// Every occurrence of `name` in `text` is immediately preceded by `prefix`.
function alwaysPrefixed(text, name, prefix) {
  let idx = text.indexOf(name);
  while (idx !== -1) {
    if (text.slice(Math.max(0, idx - prefix.length), idx) !== prefix) return false;
    idx = text.indexOf(name, idx + 1);
  }
  return true;
}

describe('C1a: go and dart validate clean', () => {
  for (const name of ['go', 'dart']) {
    test(`C1a: ${name}.md validates ok with no errors and no warnings (no STK010)`, () => {
      const r = sp.validateProfile({ profilePath: path.join(PROFILES_DIR, `${name}.md`) });
      assert.equal(r.ok, true, JSON.stringify(r.errors));
      assert.deepEqual(r.errors, []);
      assert.deepEqual(r.warnings, []);
    });
  }
});

describe('C2: profile content fixes', () => {
  test('C2: go format gate is `test -z "$(gofmt -l .)"`; apply stays `gofmt -w {files}`', () => {
    const fm = load('go').parsed.frontmatter;
    assert.ok(fm.commands.format.run.startsWith('test -z "$(gofmt -l'), fm.commands.format.run);
    assert.equal(fm.commands.format.run, GO_FORMAT_GATE);
    assert.equal(fm.commands.format.apply, 'gofmt -w {files}');
    assert.equal(fm.commands.fix.run, 'go fix -diff ./...');
    assert.equal(fm.commands.tidy.run, 'go mod tidy -diff');
  });

  test('C2: the go format gate survives a serializeProfile/parseProfile round trip', () => {
    const format = load('go').parsed.frontmatter.commands.format;
    const text = sp.serializeProfile({ schema: 1, id: 'roundtrip', commands: { format } }, '');
    const back = sp.parseProfile(text, { source: 'roundtrip' });
    assert.deepEqual(back.frontmatter.commands.format, format);
  });

  test('C2: the go format gate exits non-zero on unformatted code and zero on formatted code',
    { skip: onPath('gofmt') ? false : 'gofmt is not on PATH' },
    () => {
      const run = load('go').parsed.frontmatter.commands.format.run;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gofmt-gate-'));
      try {
        fs.writeFileSync(path.join(dir, 'main.go'), 'package main\nfunc  main( ) {  }\n');
        const bad = spawnSync('sh', ['-c', run], { cwd: dir, encoding: 'utf-8' });
        assert.notEqual(bad.status, 0, 'an unformatted file must fail the gate');

        fs.writeFileSync(path.join(dir, 'main.go'), 'package main\n\nfunc main() {}\n');
        const good = spawnSync('sh', ['-c', run], { cwd: dir, encoding: 'utf-8' });
        assert.equal(good.status, 0, `a formatted file must pass the gate: ${good.stdout}${good.stderr}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

  test('C2: go gopls MCP entry carries no tool lists; gopls min stays 0.21', () => {
    const fm = load('go').parsed.frontmatter;
    const gopls = fm.agent_tooling.mcp[0];
    assert.equal(gopls.name, 'gopls');
    assert.deepEqual(gopls.args, ['mcp']);
    assert.equal('disabled_tools' in gopls, false);
    assert.equal('enabled_tools' in gopls, false);
    assert.equal(fm.toolchain.gopls.min, '0.21');
  });

  test('C2: dart audit is `none`, `outdated` is non-gating, gates.objective has no audit', () => {
    const fm = load('dart').parsed.frontmatter;
    assert.equal(fm.commands.audit.run, 'none');
    assert.deepEqual(fm.commands.outdated, { run: 'dart pub outdated --no-transitive', when: 'deps_changed' });
    assert.equal(fm.gates.objective.includes('audit'), false);
    for (const list of [fm.loop, fm.gates.task, fm.gates.objective]) {
      assert.equal(list.includes('outdated'), false, `outdated must not gate: ${JSON.stringify(list)}`);
    }
  });

  test('C2: dart MCP args disable flutter, enable cli, disable pub_dev_search; no tool lists', () => {
    const mcp = load('dart').parsed.frontmatter.agent_tooling.mcp[0];
    assert.equal(mcp.command, 'dart');
    assert.deepEqual(mcp.args, ['mcp-server', '--disable', 'flutter', '--enable', 'cli', '--disable', 'pub_dev_search']);
    assert.equal('enabled_tools' in mcp, false);
    assert.equal('disabled_tools' in mcp, false);
  });

  test('C2: flutter MCP args enable cli and disable pub_dev_search; no tool lists', () => {
    const mcp = load('flutter').parsed.frontmatter.agent_tooling.mcp[0];
    assert.equal(mcp.command, 'dart');
    assert.deepEqual(mcp.args, ['mcp-server', '--enable', 'cli', '--disable', 'pub_dev_search']);
    assert.ok(mcp.args.includes('--enable') && mcp.args.includes('cli'));
    assert.equal('enabled_tools' in mcp, false);
    assert.equal('disabled_tools' in mcp, false);
  });

  test('C2: flutter build is `discover` (the drafter fills it in)', () => {
    assert.equal(load('flutter').parsed.frontmatter.commands.build.run, 'discover');
  });

  test('C2: no MCP entry in any profile declares enabled_tools or disabled_tools', () => {
    for (const name of NAMES) {
      for (const entry of load(name).parsed.frontmatter.agent_tooling.mcp) {
        assert.equal('enabled_tools' in entry, false, `${name}: ${entry.name}`);
        assert.equal('disabled_tools' in entry, false, `${name}: ${entry.name}`);
      }
    }
  });

  test('C2: every skills[].pin is absent or a real hex commit', () => {
    for (const name of NAMES) {
      for (const skill of load(name).parsed.frontmatter.agent_tooling.skills) {
        if (!('pin' in skill)) continue;
        assert.match(skill.pin, /^[0-9a-f]{7,40}$/, `${name}: ${skill.source} pin ${skill.pin}`);
      }
    }
  });

  test('C2: every provenance.reviewed was bumped past the 2026-09-27 draft date', () => {
    for (const name of NAMES) {
      const reviewed = load(name).parsed.frontmatter.provenance.reviewed;
      assert.match(reviewed, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(reviewed > '2026-09-27', `${name}: reviewed ${reviewed}`);
    }
  });
});

describe('C3: profile prose', () => {
  test('C3: flutter body names flutter-add-widget-test and .maestro/', () => {
    const body = bodyOf(load('flutter').text);
    assert.ok(body.includes('flutter-add-widget-test'));
    assert.ok(body.includes('.maestro/'));
  });

  test('C3: dart body names dart-collect-coverage', () => {
    assert.ok(bodyOf(load('dart').text).includes('dart-collect-coverage'));
  });

  test('C3: every upstream flutter skill name carries the flutter- prefix', () => {
    const text = load('flutter').text;
    for (const name of ['add-widget-test', 'build-responsive-layout', 'fix-layout-issues', 'apply-architecture-best-practices', 'add-integration-test']) {
      assert.ok(alwaysPrefixed(text, name, 'flutter-'), `flutter.md names '${name}' without 'flutter-'`);
    }
  });

  test('C3: every upstream dart skill name carries the dart- prefix', () => {
    const text = load('dart').text;
    for (const name of ['collect-coverage', 'resolve-package-conflicts', 'add-unit-test', 'run-static-analysis', 'fix-runtime-errors']) {
      assert.ok(alwaysPrefixed(text, name, 'dart-'), `dart.md names '${name}' without 'dart-'`);
    }
  });

  test('C3: go no longer claims it is not shipped in core', () => {
    const body = bodyOf(load('go').text);
    assert.equal(body.includes("isn't shipped in core"), false);
    assert.ok(body.includes('bundled with DevFlow'));
  });
});

describe('C4: moved, not copied', () => {
  for (const name of NAMES) {
    test(`C4: docs/stack-profiles/${name}.md no longer exists`, () => {
      assert.equal(fs.existsSync(path.join(CHECKOUT_ROOT, 'docs', 'stack-profiles', `${name}.md`)), false);
    });
  }
});
