'use strict';

// stack-agent-mcp-contract.test.cjs (objective 42, TRD 09, SDR-05)
//
// Executable assertions over the prose that wires the gopls / dart MCP servers into DevFlow's
// agents and workflows. The CLI stays deterministic — MCP confirmation is agent-side only — so the
// contract lives in agent frontmatter and workflow text.
//
// Test list:
//
// 10. executor.md, verifier.md and debugger.md `tools:` include `mcp__gopls__*` and
//     `mcp__dart__*`; the adopt and map-codebase skills' `allowed-tools` include both.
// 11. adopt.md has a `confirm_stack_profile` step after `scaffold` and before `health`;
//     map-codebase.md has one after `draft_stack_profile` and before `generate_claude_md`, and its
//     non-interactive block skips it (adopt runs its own). Each step: names go_workspace,
//     go_vulncheck, go_diagnostics, roots, analyze_files, run_tests with `--enable cli`, ToolSearch
//     and `stack verify --run`; says STACK.md is never edited silently; offers `stack mcp --write`
//     as a suggestion only; is best-effort (approval + restart); fits in 30 lines.
// 12. No file under bin/lib/migrations/ references `.mcp.json` (locked Q4: opt-in per repo).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// __dirname = plugins/devflow/devflow/bin/lib
const DEVFLOW_ROOT = path.join(__dirname, '..', '..');            // plugins/devflow/devflow
const PLUGIN_ROOT = path.join(DEVFLOW_ROOT, '..');                 // plugins/devflow
const AGENTS = ['executor', 'verifier', 'debugger'].map((a) => path.join(PLUGIN_ROOT, 'agents', `${a}.md`));
const SKILLS = ['adopt', 'map-codebase'].map((s) => path.join(PLUGIN_ROOT, 'skills', s, 'SKILL.md'));
const ADOPT_WORKFLOW = path.join(DEVFLOW_ROOT, 'workflows', 'adopt.md');
const MAP_CODEBASE_WORKFLOW = path.join(DEVFLOW_ROOT, 'workflows', 'map-codebase.md');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const GLOBS = ['mcp__gopls__*', 'mcp__dart__*'];

const read = (p) => fs.readFileSync(p, 'utf-8');

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, 'file must have YAML frontmatter delimited by --- fences');
  return m[1];
}

function toolsLine(fm) {
  const m = /^tools:\s*(.+)$/m.exec(fm);
  return m ? m[1].split(',').map((t) => t.trim()).filter(Boolean) : [];
}

function fmList(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*\\n((?:\\s*-\\s*.+\\n?)+)`, 'm'));
  return m ? [...m[1].matchAll(/-\s*(.+)/g)].map((x) => x[1].trim()) : [];
}

/** The text of `<step name="<name>"> ... </step>` (exclusive of the tags), or null. */
function stepBody(md, name) {
  const open = `<step name="${name}">`;
  const start = md.indexOf(open);
  if (start === -1) return null;
  const end = md.indexOf('</step>', start);
  return md.slice(start + open.length, end);
}

function stepIndex(md, name) {
  return md.indexOf(`<step name="${name}"`);
}

// ─── 10: grants ─────────────────────────────────────────────────────────────

for (const file of AGENTS) {
  test(`10 - ${path.basename(file)} tools: grants ${GLOBS.join(' and ')}`, () => {
    const tools = toolsLine(frontmatter(read(file)));
    assert.ok(tools.length > 0, `${file} has no tools: line`);
    for (const g of GLOBS) assert.ok(tools.includes(g), `${path.basename(file)} tools: must include ${g}; got ${JSON.stringify(tools)}`);
  });
}

for (const file of SKILLS) {
  test(`10 - ${path.relative(PLUGIN_ROOT, file)} allowed-tools grants ${GLOBS.join(' and ')}`, () => {
    const tools = fmList(frontmatter(read(file)), 'allowed-tools');
    assert.ok(tools.length > 0, `${file} has no allowed-tools list`);
    for (const g of GLOBS) assert.ok(tools.includes(g), `${path.relative(PLUGIN_ROOT, file)} allowed-tools must include ${g}; got ${JSON.stringify(tools)}`);
  });
}

// ─── 11: confirm_stack_profile ──────────────────────────────────────────────

function assertConfirmStep(md, label) {
  const body = stepBody(md, 'confirm_stack_profile');
  assert.ok(body, `${label} must have a <step name="confirm_stack_profile"> step`);
  for (const needle of ['ToolSearch', 'mcp__gopls__', 'mcp__dart__', 'go_workspace', 'components', 'go_vulncheck',
    'go_diagnostics', 'roots', 'analyze_files', 'run_tests', '--enable cli', 'stack verify --run', 'stack mcp --write']) {
    assert.ok(body.includes(needle), `${label} confirm_stack_profile must mention ${JSON.stringify(needle)}`);
  }
  assert.match(body, /never edit\b[^\n]*STACK\.md[^\n]*silently/i, `${label}: must say STACK.md is never edited silently`);
  assert.match(body, /best-effort/i, `${label}: MCP use is best-effort, never mandatory`);
  assert.match(body, /restart/i, `${label}: must note .mcp.json servers need approval and a session restart`);
  assert.match(body, /suggest/i, `${label}: stack mcp --write is a suggestion only`);
  const lines = body.split('\n').filter((l, i, a) => !(i === 0 && l === '') && !(i === a.length - 1 && l === ''));
  assert.ok(lines.length <= 30, `${label} confirm_stack_profile must fit in 30 lines; has ${lines.length}`);
  return body;
}

test('11 - adopt.md: confirm_stack_profile sits between scaffold and health, with the full content', () => {
  const md = read(ADOPT_WORKFLOW);
  const scaffold = stepIndex(md, 'scaffold');
  const confirm = stepIndex(md, 'confirm_stack_profile');
  const health = stepIndex(md, 'health');
  assert.ok(scaffold !== -1 && confirm !== -1 && health !== -1, 'scaffold, confirm_stack_profile and health steps must exist');
  assert.ok(scaffold < confirm && confirm < health, `order must be scaffold < confirm_stack_profile < health; got ${scaffold}, ${confirm}, ${health}`);
  const body = assertConfirmStep(md, 'adopt.md');
  assert.match(body, /\.adopt-inferences\.json/, 'adopt records discrepancies for the report through .adopt-inferences.json');
  assert.match(body, /medium|low/, 'discrepancies are medium/low rows');
});

test('11 - map-codebase.md: confirm_stack_profile follows draft_stack_profile and precedes generate_claude_md', () => {
  const md = read(MAP_CODEBASE_WORKFLOW);
  const draft = stepIndex(md, 'draft_stack_profile');
  const confirm = stepIndex(md, 'confirm_stack_profile');
  const claude = stepIndex(md, 'generate_claude_md');
  assert.ok(draft !== -1 && confirm !== -1 && claude !== -1, 'draft_stack_profile, confirm_stack_profile and generate_claude_md steps must exist');
  assert.ok(draft < confirm && confirm < claude, `order must be draft_stack_profile < confirm_stack_profile < generate_claude_md; got ${draft}, ${confirm}, ${claude}`);
  assert.match(stepBody(md, 'draft_stack_profile'), /Continue to confirm_stack_profile/, 'draft_stack_profile must hand off to confirm_stack_profile');
  assertConfirmStep(md, 'map-codebase.md');
});

test('11 - map-codebase.md non-interactive mode skips confirm_stack_profile (adopt runs its own)', () => {
  const md = read(MAP_CODEBASE_WORKFLOW);
  const m = md.match(/<non_interactive_mode>([\s\S]*?)<\/non_interactive_mode>/);
  assert.ok(m, 'map-codebase.md must have a <non_interactive_mode> block');
  const line = m[1].split('\n').find((l) => l.includes('confirm_stack_profile'));
  assert.ok(line, '<non_interactive_mode> must name confirm_stack_profile');
  assert.match(line, /skipped/);
});

// ─── 12: no migration writes .mcp.json ──────────────────────────────────────

test('12 - no migration under bin/lib/migrations/ references .mcp.json (locked Q4)', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.cjs'));
  assert.ok(files.length > 0, 'migrations dir must hold migration files');
  for (const f of files) {
    assert.ok(!read(path.join(MIGRATIONS_DIR, f)).includes('.mcp.json'), `migrations/${f} must not reference .mcp.json`);
  }
});
