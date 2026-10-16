'use strict';
// Objective 77 — the stack neutrality guard (docs/PROPOSAL-stack-packs.md §5A.7).
//
// Core AOForge carries no stack-specific procedure: Flutter, Dart, Maestro and Playwright live in
// the stack packs (plugins/aoforge-stack-*). This fails CI when a core agent, skill, hook,
// workflow or lib module (tests and fixtures aside) names one of them outside ALLOW below.
//
// ALLOW is for language-neutral DATA, not procedure: multi-language detection and evidence
// tables where Dart is one row beside Go, Node, Python and Rust; project-MCP tool grants a pack
// cannot add to a core agent. Each entry says why. A new entry needs the same kind of reason.
//
// Go is deliberately out of scope until its pack exists (it is core's bundled tier-2 profile).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', '..');
const ROOTS = ['agents', 'skills', 'hooks', 'aoforge/bin', 'aoforge/workflows'];
const PATTERN = /flutter|\bdart\b|maestro|playwright|pubspec/i;

const ALLOW = {
  'agents/codebase-mapper.md': 'manifest discovery `ls` lists pubspec.yaml beside go.mod, Cargo.toml and the rest',
  'aoforge/bin/lib/calibration-inputs.cjs': 'test/source file regexes per language (.dart beside .go, .ts, .py)',
  'aoforge/bin/lib/doc-staleness.cjs': 'manifest alias table across languages',
  'aoforge/bin/lib/init.cjs': 'the brownfield stack list: pubspec.yaml -> dart beside go.mod -> go',
  'aoforge/bin/lib/repo-state.cjs': 'manifest and extension tables across languages',
  'aoforge/bin/lib/skill-requires.cjs': 'install hints keyed by tool name',
  'aoforge/bin/lib/stack-classify.cjs': 'the CI evidence classification table: one row per tool across every stack',
  'aoforge/bin/lib/stack-detect.cjs': 'area markers per manifest (pubspec.yaml beside go.mod); the Flutter-SDK pubspec test',
  'aoforge/bin/lib/stack-draft.cjs': 'drafter command candidates per detected tool',
  'aoforge/bin/lib/stack-mcp.cjs': 'the project .mcp.json writer knows the gopls and dart servers a profile names',
  'aoforge/bin/lib/stack-report.cjs': 'recommendation rows per language (DART-*, FLUT-* beside GO-*)',
  'aoforge/workflows/adopt.md': 'kind examples, and the drafted-profile confirm step uses the gopls/dart MCP servers when present',
  'aoforge/workflows/map-codebase.md': 'the drafted-profile confirm step uses the gopls/dart MCP servers when present',
};

function walk(rel) {
  const abs = path.join(PLUGIN, rel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const r = `${rel}/${ent.name}`;
    if (ent.isDirectory()) {
      if (ent.name !== '__fixtures__' && ent.name !== 'node_modules') out.push(...walk(r));
    } else if (!/\.test\.(c?js|mjs)$/.test(ent.name)) {
      out.push(r);
    }
  }
  return out;
}

const files = ROOTS.flatMap(walk);

test('no core file names a pack-owned stack outside ALLOW', () => {
  const offenders = [];
  for (const rel of files) {
    if (ALLOW[rel]) continue;
    const lines = fs.readFileSync(path.join(PLUGIN, rel), 'utf8').split('\n');
    lines.forEach((line, i) => { if (PATTERN.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(offenders, [], 'move stack-specific content to a stack pack (plugins/aoforge-stack-*), or add a data-only ALLOW entry with a reason');
});

test('every ALLOW entry still matches and carries a reason', () => {
  for (const [rel, reason] of Object.entries(ALLOW)) {
    assert.ok(reason.length >= 20, `${rel}: give a reason`);
    const abs = path.join(PLUGIN, rel);
    assert.ok(fs.existsSync(abs), `${rel}: stale ALLOW entry (file gone)`);
    assert.ok(PATTERN.test(fs.readFileSync(abs, 'utf8')), `${rel}: stale ALLOW entry (no longer names a pack stack)`);
  }
});

test('the scan covers the trees it claims', () => {
  assert.ok(files.length > 200, `expected a real tree, scanned ${files.length} files`);
  for (const gone of ['skills/ui-eval/SKILL.md', 'agents/ui-evaluator.md', 'aoforge/bin/lib/flutter-ui-eval.cjs']) {
    assert.ok(!files.includes(gone), `${gone} belongs to the Flutter pack`);
  }
});
