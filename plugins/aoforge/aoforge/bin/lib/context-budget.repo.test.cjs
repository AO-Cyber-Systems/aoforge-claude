'use strict';

// context-budget.repo.test.cjs — what AOForge puts into a Claude Code context window stays bounded.
//
// Measured on 2026-10-16 before the budget existed: CLAUDE.md was 225 lines / 40K chars on every turn,
// /aoforge:status resolved to 43K chars plus an 82K STATE.md inline, /aoforge:milestone to 75K, the
// executor spawn listed 81K of references unconditionally. Claude Code loads a skill body (with its
// `@` references expanded) as one message, keeps CLAUDE.md resident on every turn, and hands an agent
// body to the subagent as its system prompt, so these are per-invocation costs. The caps below sit
// just above today's largest cases: they stop regressions, and lowering one is a deliberate change.
//
// Test list
//  1. CLAUDE.md: at most 200 lines (Claude Code memory guidance) and CLAUDE_MD_CHARS chars
//  2. no skill inlines a whole planning file (`@.aoforge/STATE.md`, ROADMAP.md, STATE_ARCHIVE.md): the
//     `!` digest injections replace them
//  3. every skill's resolved footprint (SKILL.md plus the `@~/.claude/aoforge/...` files it names at the
//     start of a line, each counted once) is at most SKILL_CHARS; every named file exists
//  4. every agent body is at most AGENT_CHARS
//  5. the executor spawn blocks of execute-objective.md carry no unconditional `@` reference line (an
//     agent reads what it needs when it needs it; checkpoints.md alone is 42K)
//  6. the budget numbers themselves are the documented ones (so a change to a cap is a reviewed diff)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const PLUGIN = path.join(REPO_ROOT, 'plugins', 'aoforge');
const RUNTIME = path.join(PLUGIN, 'aoforge');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'CLAUDE.md')) && fs.existsSync(path.join(PLUGIN, 'skills'));

const BUDGET = {
  CLAUDE_MD_LINES: 200,
  CLAUDE_MD_CHARS: 20000,
  SKILL_CHARS: 90000,   // execute-objective resolves to ~83K (its workflow is 77K); the next are 79K and 57K
  AGENT_CHARS: 65000,   // executor.md is ~62K
};

const PLANNING_INLINE_RE = /^@\.aoforge\/(STATE|ROADMAP|STATE_ARCHIVE)\.md\b/m;
const REF_RE = /^@~\/\.claude\/aoforge\/([^\s`")]+)/gm;

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function skillFiles() {
  const dir = path.join(PLUGIN, 'skills');
  return fs.readdirSync(dir).sort().map((name) => ({ name, file: path.join(dir, name, 'SKILL.md') })).filter((s) => fs.existsSync(s.file));
}

/** {chars, refs:[{rel, exists, chars}]} for one skill: the body plus each `@~/.claude/aoforge/<rel>` it names. */
function footprint(skillFile) {
  const body = read(skillFile);
  const refs = [];
  const seen = new Set();
  for (const m of body.matchAll(REF_RE)) {
    const rel = m[1].replace(/[.,]+$/, '');
    if (rel.endsWith('/')) continue; // a directory listing of runtime data (`initiatives/` lives in the user's home), not a bundled body
    if (seen.has(rel)) continue;
    seen.add(rel);
    const file = path.join(RUNTIME, ...rel.split('/'));
    const exists = fs.existsSync(file) && fs.statSync(file).isFile();
    refs.push({ rel, exists, chars: exists ? read(file).length : 0 });
  }
  return { chars: body.length + refs.reduce((n, r) => n + r.chars, 0), body: body.length, refs };
}

describe('context-budget.repo.test.cjs', { skip: IS_AOFORGE_CHECKOUT ? false : 'not an AOForge source checkout' }, () => {
  test('1. CLAUDE.md stays under the line and character caps', () => {
    const md = read(path.join(REPO_ROOT, 'CLAUDE.md'));
    const lines = md.split('\n').length;
    assert.ok(lines <= BUDGET.CLAUDE_MD_LINES, `CLAUDE.md is ${lines} lines (cap ${BUDGET.CLAUDE_MD_LINES}); move detail to docs/ or a reference`);
    assert.ok(md.length <= BUDGET.CLAUDE_MD_CHARS, `CLAUDE.md is ${md.length} chars (cap ${BUDGET.CLAUDE_MD_CHARS})`);
  });

  test('2. no skill inlines a whole planning file', () => {
    const offenders = skillFiles().filter((s) => PLANNING_INLINE_RE.test(read(s.file))).map((s) => s.name);
    assert.deepEqual(offenders, [], 'use !`aof-tools state digest --raw` / `roadmap digest --raw` instead of @.aoforge/STATE.md or ROADMAP.md');
  });

  test('3. every skill resolves under the cap and every reference it names exists', () => {
    const over = [];
    const missing = [];
    for (const s of skillFiles()) {
      const fp = footprint(s.file);
      if (fp.chars > BUDGET.SKILL_CHARS) over.push(`${s.name}: ${fp.chars} chars (body ${fp.body}, refs ${fp.refs.map((r) => `${r.rel}=${r.chars}`).join(', ')})`);
      for (const r of fp.refs) if (!r.exists) missing.push(`${s.name} -> ${r.rel}`);
    }
    assert.deepEqual(missing, [], 'a skill names a runtime file that does not exist');
    assert.deepEqual(over, [], `skill footprint over ${BUDGET.SKILL_CHARS} chars: trim the workflow or load part of it on demand`);
  });

  test('4. every agent body is under the cap', () => {
    const dir = path.join(PLUGIN, 'agents');
    const over = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
      .map((f) => ({ f, chars: read(path.join(dir, f)).length }))
      .filter((a) => a.chars > BUDGET.AGENT_CHARS)
      .map((a) => `${a.f}: ${a.chars}`);
    assert.deepEqual(over, [], `agent body over ${BUDGET.AGENT_CHARS} chars: the body is the subagent's whole system prompt`);
  });

  test('5. executor spawn blocks carry no unconditional @ reference line', () => {
    const wf = read(path.join(RUNTIME, 'workflows', 'execute-objective.md'));
    const blocks = [...wf.matchAll(/subagent_type="executor",[\s\S]*?prompt="([\s\S]*?)"\s*\)/g)]
      .map((m) => m[1])
      .filter((b) => b.includes('<execution_context>')); // the fresh spawns, not the SendMessage continuation
    assert.ok(blocks.length >= 2, `expected the executor spawn blocks, found ${blocks.length}`);
    for (const b of blocks) {
      const bare = b.split('\n').filter((l) => /^\s*@~\/\.claude\/aoforge\//.test(l));
      assert.deepEqual(bare, [], 'a Task prompt does not expand @; name the file and when to read it instead');
      assert.match(b, /execute-trd\.md/, 'the executor is still told where execute-trd.md is');
    }
  });

  test('6. the caps are the documented ones', () => {
    assert.deepEqual(BUDGET, { CLAUDE_MD_LINES: 200, CLAUDE_MD_CHARS: 20000, SKILL_CHARS: 90000, AGENT_CHARS: 65000 });
  });
});
