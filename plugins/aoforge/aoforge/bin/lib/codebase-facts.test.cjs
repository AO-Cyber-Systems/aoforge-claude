'use strict';
// TRD 76-04 — codebase facts: language-neutral, focus-limited, deterministic, capped,
// env files by name only.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { FOCI, facts, cmdCodebaseFacts } = require('./codebase-facts.cjs');

const SECRET = 'sk_live_SUPERSECRET_DO_NOT_LEAK_42';
const tmpDirs = [];

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codebase-facts-'));
  tmpDirs.push(root);
  // Go module
  write(root, 'go.mod', 'module example.com/svc\n\ngo 1.22\n');
  write(root, 'cmd/server/main.go', [
    'package main', '', 'import (', '\t"fmt"', '\t"github.com/spf13/cobra/cmd"', '\tpg "github.com/jackc/pgx/v5"', ')', '',
    'func main() { fmt.Println(cobra.X, pg.Y) }', '',
  ].join('\n'));
  write(root, 'internal/orders/store.go', [
    'package orders', '', 'import "github.com/jackc/pgx/v5/pgxpool"', '',
    '// TODO: pool sizing', 'func Load() error {', '\tpanic("not implemented")', '}', '',
  ].join('\n'));
  write(root, 'internal/orders/store_test.go', 'package orders\n\nimport "testing"\n\nfunc TestLoad(t *testing.T) {}\n');
  // Python package
  write(root, 'pyproject.toml', '[project]\nname = "tool"\n');
  write(root, 'tool/__init__.py', '');
  write(root, 'tool/__main__.py', 'import os\nimport requests\nfrom tool import core\n\n# FIXME: retry\n');
  write(root, 'tool/core.py', 'from requests.adapters import HTTPAdapter\nimport numpy as np\n\ndef run():\n    pass\n\ndef load():\n    return None\n');
  write(root, 'tests/test_core.py', 'import pytest\n\ndef test_run():\n    pass\n');
  // JS
  write(root, 'package.json', '{"name":"web"}\n');
  write(root, 'web/index.js', "const fs = require('fs');\nconst express = require('express');\nimport x from './local';\nimport { a } from '@scope/pkg/sub';\n// HACK XXX TODO\nfunction f() { return []; }\nfunction g() {\n  return {};\n}\n");
  write(root, 'web/index.test.js', "const express = require('express');\nfunction stub() { return null; }\n");
  // config, env, CI
  write(root, 'tsconfig.json', '{}\n');
  write(root, 'Makefile', 'test:\n\tgo test ./...\n');
  write(root, '.github/workflows/ci.yml', 'on: push\n');
  write(root, '.env', `API_KEY=${SECRET}\n`);
  write(root, '.env.local', `OTHER=${SECRET}\n`);
  // skipped trees and files
  write(root, 'node_modules/leftpad/index.js', "const evil = require('should-not-appear');\n// TODO hidden\n");
  write(root, 'vendor/x/y.go', 'package y\nimport "github.com/vendored/nope"\n');
  write(root, '.aoforge/STATE.md', '# TODO planning\n');
  write(root, 'package-lock.json', '{"lockfileVersion":3}\n');
  write(root, 'web/bundle.min.js', 'require("minified-dep")\n');
  write(root, 'web/huge.js', `// TODO huge\n${'x'.repeat(1024 * 1024 + 10)}\n`);
  return root;
}

after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

test('all focus: manifests, languages, config, env names, imports across languages', () => {
  const root = makeFixture();
  const r = facts({ root });
  assert.equal(r.focus, 'all');
  assert.deepEqual([...r.manifests].sort(), ['go.mod', 'package.json', 'pyproject.toml']);
  const exts = r.languages.map((l) => l.ext);
  assert.ok(exts.includes('.go') && exts.includes('.py') && exts.includes('.js'));
  for (let i = 1; i < r.languages.length; i++) assert.ok(r.languages[i - 1].files >= r.languages[i].files);
  assert.ok(r.config_files.includes('tsconfig.json'));
  assert.ok(r.config_files.includes('Makefile'));
  assert.ok(r.config_files.includes('.github/workflows/ci.yml'));
  assert.deepEqual(r.env_files, ['.env', '.env.local']);
  const mods = r.imports.map((i) => i.module);
  for (const m of ['express', '@scope/pkg', 'requests', 'numpy', 'pytest', 'github.com/jackc/pgx', 'github.com/spf13/cobra']) {
    assert.ok(mods.includes(m), `missing import ${m}: ${mods.join(', ')}`);
  }
  for (const m of ['fs', 'os', 'fmt', 'testing', 'tool', 'should-not-appear', 'github.com/vendored/nope', 'minified-dep']) {
    assert.ok(!mods.includes(m), `unexpected import ${m}`);
  }
  assert.equal(r.imports.find((i) => i.module === 'express').files, 2);
  assert.equal(r.imports.find((i) => i.module === 'requests').files, 2);
});

test('env file contents never appear in output', () => {
  const root = makeFixture();
  const json = JSON.stringify(facts({ root }));
  assert.ok(!json.includes(SECRET));
  assert.ok(!json.includes('API_KEY'));
});

test('skips node_modules, vendor, .aoforge, lock, minified and >1MB files', () => {
  const root = makeFixture();
  const json = JSON.stringify(facts({ root }));
  for (const s of ['node_modules', 'vendor/', '.aoforge', 'package-lock.json', 'bundle.min.js', 'huge.js']) {
    assert.ok(!json.includes(s), `output mentions ${s}`);
  }
});

test('arch: top dirs, entry points; tests; markers; stubs; largest', () => {
  const root = makeFixture();
  const r = facts({ root });
  assert.ok(r.top_dirs.some((d) => d.dir === 'internal' && d.files === 2));
  assert.ok(r.top_dirs.some((d) => d.dir === 'internal/orders'));
  assert.ok(r.entry_points.includes('cmd/server/main.go'));
  assert.ok(r.entry_points.includes('web/index.js'));
  assert.ok(r.entry_points.includes('tool/__main__.py'));
  assert.ok(!r.entry_points.includes('web/index.test.js'));
  assert.equal(r.tests.files, 3);
  assert.deepEqual(r.tests.dirs.map((d) => d.dir).sort(), ['internal/orders', 'tests', 'web']);
  assert.deepEqual(
    { TODO: r.markers.TODO, FIXME: r.markers.FIXME, HACK: r.markers.HACK, XXX: r.markers.XXX },
    { TODO: 2, FIXME: 1, HACK: 1, XXX: 1 },
  );
  assert.equal(r.markers.top_files[0].file, 'web/index.js');
  const stubs = r.stub_returns.map((s) => `${s.file}:${s.line}`);
  assert.ok(stubs.includes('internal/orders/store.go:7'));
  assert.ok(stubs.includes('tool/core.py:5'));
  assert.ok(stubs.includes('tool/core.py:8'));
  assert.ok(stubs.includes('web/index.js:8'));
  assert.ok(!stubs.some((s) => s.startsWith('tests/') || s.includes('.test.')), 'test files excluded from stubs');
  assert.ok(r.largest_source_files.length > 0);
  for (let i = 1; i < r.largest_source_files.length; i++) {
    assert.ok(r.largest_source_files[i - 1].lines >= r.largest_source_files[i].lines);
  }
});

test('focus limits the sections computed', () => {
  const root = makeFixture();
  const meta = ['root', 'focus'];
  const expect = {
    tech: ['manifests', 'languages', 'config_files', 'env_files', 'imports'],
    arch: ['top_dirs', 'entry_points', 'languages'],
    quality: ['tests', 'languages', 'largest_source_files'],
    concerns: ['markers', 'stub_returns', 'largest_source_files', 'env_files'],
  };
  for (const [focus, keys] of Object.entries(expect)) {
    const r = facts({ root, focus });
    assert.deepEqual(Object.keys(r).sort(), [...meta, ...keys].sort(), focus);
  }
  assert.deepEqual(FOCI, ['tech', 'arch', 'quality', 'concerns', 'all']);
});

test('unknown focus throws naming the valid foci', () => {
  const root = makeFixture();
  assert.throws(() => facts({ root, focus: 'bogus' }), /tech, arch, quality, concerns, all/);
});

test('deterministic across runs', () => {
  const root = makeFixture();
  assert.deepEqual(facts({ root }), facts({ root }));
});

test('caps every list', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codebase-facts-caps-'));
  tmpDirs.push(root);
  for (let i = 0; i < 60; i++) {
    write(root, `d${String(i).padStart(2, '0')}/m${i}.js`,
      `const a = require('pkg${i}');\n// TODO ${i}\nfunction f() { return null; }\nfunction g() { return null; }\n`);
    write(root, `.env.n${i}`, 'X=1\n');
  }
  const r = facts({ root });
  assert.ok(r.top_dirs.length <= 40);
  assert.ok(r.imports.length <= 40);
  assert.equal(r.stub_returns.length, 30);
  assert.equal(r.largest_source_files.length, 20);
  assert.ok(r.markers.top_files.length <= 20);
  assert.equal(r.markers.TODO, 60);
  assert.ok(r.env_files.length <= 30);
});

test('CLI: --focus and --root, JSON and --raw', () => {
  const root = makeFixture();
  const script = `require(${JSON.stringify(path.join(__dirname, 'codebase-facts.cjs'))}).cmdCodebaseFacts(process.cwd(), process.argv.slice(1), process.argv.includes('--raw'))`;
  const run = (...a) => spawnSync(process.execPath, ['-e', script, 'codebase', 'facts', ...a], { cwd: os.tmpdir(), encoding: 'utf8' });

  const j = run('--focus', 'tech', '--root', root);
  assert.equal(j.status, 0, j.stderr);
  const parsed = JSON.parse(j.stdout);
  assert.equal(parsed.focus, 'tech');
  assert.ok(parsed.imports);
  assert.ok(!j.stdout.includes(SECRET));

  const raw = run('--focus', 'concerns', '--root', root, '--raw');
  assert.equal(raw.status, 0, raw.stderr);
  assert.match(raw.stdout, /markers: TODO 2/);
  assert.match(raw.stdout, /env files \(names only, never read\): \.env, \.env\.local/);
  assert.ok(!raw.stdout.includes(SECRET));

  const bad = run('--focus', 'nope', '--root', root);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /valid foci: tech, arch, quality, concerns, all/);

  const unk = run('--bogus');
  assert.equal(unk.status, 1);
  assert.equal(typeof cmdCodebaseFacts, 'function');
});
