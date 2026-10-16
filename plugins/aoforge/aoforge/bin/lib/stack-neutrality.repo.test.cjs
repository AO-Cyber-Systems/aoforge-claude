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
  'aoforge/bin/lib/calibration-inputs.cjs': 'test/source file regexes per language (.dart beside .go, .ts, .py)',
  'aoforge/bin/lib/doc-staleness.cjs': 'manifest alias table across languages',
  'aoforge/bin/lib/init.cjs': 'the brownfield stack list: pubspec.yaml -> dart beside go.mod -> go',
  'aoforge/bin/lib/repo-state.cjs': 'manifest and extension tables across languages',
  'aoforge/bin/lib/skill-requires.cjs': 'install hints keyed by tool name',
  'aoforge/bin/lib/stack-classify.cjs': 'the CI evidence classification table: one row per tool across every stack',
  'aoforge/bin/lib/stack-detect.cjs': 'area markers per manifest (pubspec.yaml beside go.mod); the Flutter-SDK pubspec test',
  'aoforge/bin/lib/stack-draft.cjs': 'drafter command candidates per detected tool',
  'aoforge/bin/lib/stack-mcp.cjs': 'the project .mcp.json writer knows the gopls and dart servers a profile names',
  'aoforge/bin/lib/stack-pack-hints.cjs': 'install hints keyed by profile id: the pack that ships each pack-owned profile',
  'aoforge/bin/lib/stack-report.cjs': 'recommendation rows per language (DART-*, FLUT-* beside GO-*)',
  'aoforge/workflows/adopt.md': 'kind examples, and the drafted-profile confirm step uses the gopls/dart MCP servers when present',
  'aoforge/workflows/map-codebase.md': 'the drafted-profile confirm step uses the gopls/dart MCP servers when present',
};

// Tool grants a pack needs on a core agent and cannot add itself. Only these exact tokens, and only on the
// file's frontmatter `tools:` line, are skipped; every other line stays under PATTERN.
const GRANT_ALLOW = {
  'agents/executor.md': {
    tokens: [
      'mcp__plugin_playwright_playwright__browser_close',
      'mcp__plugin_playwright_playwright__browser_console_messages',
      'mcp__plugin_playwright_playwright__browser_navigate',
      'mcp__plugin_playwright_playwright__browser_snapshot',
      'mcp__plugin_playwright_playwright__browser_wait_for',
    ],
    reason: "the web pack's executor self-check loads a route and reads it: read-only browser tools only (quick 38)",
  },
};

/** The index of the frontmatter line starting `tools:` (before the second `---`), or -1. */
function toolsLineIndex(lines) {
  if (lines[0] !== '---') return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') return -1;
    if (lines[i].startsWith('tools:')) return i;
  }
  return -1;
}

/** The tools line with each exactly-listed token removed; any other grant on it stays. */
function scrubGrants(line, tokens) {
  return line.split(',').filter((part) => !tokens.includes(part.trim())).join(',');
}

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
    const grant = GRANT_ALLOW[rel];
    const toolsAt = grant ? toolsLineIndex(lines) : -1;
    lines.forEach((line, i) => {
      const scanned = i === toolsAt ? scrubGrants(line, grant.tokens) : line;
      if (PATTERN.test(scanned)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(offenders, [], 'move stack-specific content to a stack pack (plugins/aoforge-stack-*), or add a data-only ALLOW entry with a reason');
});

test('every GRANT_ALLOW entry is exactly the PATTERN-matching grant set on its tools line', () => {
  for (const [rel, { tokens, reason }] of Object.entries(GRANT_ALLOW)) {
    assert.ok(reason.length >= 20, `${rel}: give a reason`);
    assert.deepEqual([...tokens].sort(), tokens, `${rel}: keep the tokens sorted`);
    const abs = path.join(PLUGIN, rel);
    assert.ok(fs.existsSync(abs), `${rel}: stale GRANT_ALLOW entry (file gone)`);
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    const at = toolsLineIndex(lines);
    assert.ok(at > 0, `${rel}: no frontmatter tools: line`);
    const grants = lines[at].split(',').map((p) => p.trim()).filter((p) => PATTERN.test(p)).sort();
    assert.deepEqual(grants, tokens, `${rel}: the tools line's pack-stack grants must be exactly GRANT_ALLOW's tokens`);
  }
});

test('the tools-line scrub removes only the exact listed tokens', () => {
  const tokens = GRANT_ALLOW['agents/executor.md'].tokens;
  const line = `tools: Read, ${tokens.join(', ')}`;
  assert.ok(!PATTERN.test(scrubGrants(line, tokens)), 'the five listed grants are skipped');
  assert.ok(PATTERN.test(scrubGrants(`${line}, mcp__plugin_playwright_playwright__browser_click`, tokens)), 'a sixth grant is not');
  assert.ok(PATTERN.test(scrubGrants(`${line}, mcp__plugin_playwright_playwright__*`, tokens)), 'a wildcard grant is not');
  assert.equal(toolsLineIndex(['---', 'name: x', '---', 'tools: body text']), -1, 'a body line is never the tools line');
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
