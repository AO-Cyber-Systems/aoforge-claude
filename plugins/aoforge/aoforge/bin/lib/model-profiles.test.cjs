'use strict';

/**
 * model-profiles.test.cjs — TRD 28-02
 *
 * Asserts the model profile table actually BINDS. The 2026-08-18 audit found it
 * did not: profile keys carried a `df-` prefix, the three skills that call
 * `aof-tools resolve-model` passed un-prefixed names, and the miss fell through
 * to a hard-coded 'sonnet' — silently, for every agent, regardless of profile.
 * Nothing failed loudly, so the whole table looked like it was working.
 *
 * These tests are the mechanical guard against that class of drift:
 *   - agent files and profile entries stay in one-to-one correspondence
 *   - both key spellings resolve identically
 *   - every tier names a real model id
 *   - resolution is auditable (tier + concrete id, not just an alias)
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..', '..', '..');
const PROFILES_PATH = path.join(__dirname, '..', '..', 'references', 'model-profiles.json');
const AGENTS_DIR = path.join(__dirname, '..', '..', '..', 'agents');
const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
const agentNames = agentFiles.map(f => f.replace(/\.md$/, '')).sort();
const profileKeys = Object.keys(profiles.agents).sort();

function resolveModel(agentKey) {
  const r = spawnSync(process.execPath, [DF_TOOLS, 'resolve-model', agentKey], {
    cwd: REPO, encoding: 'utf8',
  });
  try { return JSON.parse(r.stdout); } catch { return { _raw: r.stdout, _err: r.stderr }; }
}

describe('TRD 28-02 — the model profile table binds', () => {
  test('every agent on disk has a profile entry', () => {
    const missing = agentNames.filter(a => !profileKeys.includes(a));
    assert.deepEqual(missing, [], `agents with no profile entry: ${missing.join(', ')}`);
  });

  test('every profile entry corresponds to an agent on disk (no orphans)', () => {
    const orphans = profileKeys.filter(k => !agentNames.includes(k));
    assert.deepEqual(orphans, [], `profile entries with no agent file: ${orphans.join(', ')}`);
  });

  test('profile keys are canonical — no df- prefix in the table', () => {
    const prefixed = profileKeys.filter(k => k.startsWith('df-'));
    assert.deepEqual(prefixed, [], `df- prefixed keys must be canonicalised: ${prefixed.join(', ')}`);
  });

  test('every tier referenced by an agent exists in models{}', () => {
    const tiers = new Set();
    for (const entry of Object.values(profiles.agents)) {
      for (const tier of Object.values(entry)) tiers.add(tier);
    }
    const unknown = [...tiers].filter(t => !profiles.models[t]);
    assert.deepEqual(unknown, [], `tiers with no model id: ${unknown.join(', ')}`);
  });

  test('model ids carry no deprecated date suffix', () => {
    for (const [tier, id] of Object.entries(profiles.models)) {
      assert.ok(
        !/-\d{8}$/.test(id),
        `models.${tier} = "${id}" has a date suffix; use the undated id`
      );
    }
  });

  test('every agent declares all three profile tiers', () => {
    for (const [agent, entry] of Object.entries(profiles.agents)) {
      for (const profile of ['quality', 'balanced', 'budget']) {
        assert.ok(entry[profile], `agents.${agent} is missing the "${profile}" tier`);
      }
    }
  });
});

describe('TRD 28-02 — resolve-model resolution is correct and auditable', () => {
  test('both key spellings resolve identically', () => {
    for (const agent of agentNames) {
      const bare = resolveModel(agent);
      const prefixed = resolveModel(`df-${agent}`);
      assert.equal(bare.model, prefixed.model, `${agent}: bare=${bare.model} df-=${prefixed.model}`);
      assert.equal(bare.tier, prefixed.tier, `${agent}: tier mismatch between spellings`);
    }
  });

  test('no known agent falls through to the unknown-agent default', () => {
    const fellThrough = agentNames.filter(a => resolveModel(a).unknown_agent === true);
    assert.deepEqual(fellThrough, [],
      `these resolved via the silent 'sonnet' fallback: ${fellThrough.join(', ')}`);
  });

  test('resolution reports tier and concrete model id, not just the alias', () => {
    const r = resolveModel('planner');
    assert.equal(r.agent, 'planner');
    assert.ok(r.tier, 'expected a tier in the result');
    assert.ok(r.model_id, 'expected a concrete model_id in the result');
    assert.equal(r.model_id, profiles.models[r.tier]);
  });

  test('opus tier maps to the inherit alias (agent keeps the session model)', () => {
    const r = resolveModel('planner'); // opus at the balanced profile
    assert.equal(r.tier, 'opus');
    assert.equal(r.model, 'inherit');
  });

  test('an unknown agent is flagged, not silently defaulted', () => {
    const r = resolveModel('definitely-not-an-agent');
    assert.equal(r.unknown_agent, true);
    assert.equal(r.model, 'sonnet');
    assert.equal(r.requested, 'definitely-not-an-agent');
  });
});

describe('TRD 28-02 — agent frontmatter is consistent with the tier table', () => {
  // Haiku 4.5 REJECTS the `effort` parameter (it is supported from Opus 4.5 /
  // Sonnet 5 upward). An agent that can resolve to the haiku tier must not
  // declare effort in frontmatter, or that run 400s.
  test('no agent that can resolve to haiku declares an effort in frontmatter', () => {
    const offenders = [];
    for (const agent of agentNames) {
      const entry = profiles.agents[agent] || {};
      const canBeHaiku = Object.values(entry).includes('haiku');
      if (!canBeHaiku) continue;
      const fm = fs.readFileSync(path.join(AGENTS_DIR, `${agent}.md`), 'utf8').split('---')[1] || '';
      if (/^effort:/m.test(fm)) offenders.push(agent);
    }
    assert.deepEqual(offenders, [],
      `these can resolve to haiku but declare effort (Haiku 4.5 rejects it): ${offenders.join(', ')}`);
  });

  test('any declared effort is a valid level', () => {
    const VALID = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
    for (const agent of agentNames) {
      const fm = fs.readFileSync(path.join(AGENTS_DIR, `${agent}.md`), 'utf8').split('---')[1] || '';
      const m = /^effort:\s*(\S+)/m.exec(fm);
      if (!m) continue;
      assert.ok(VALID.has(m[1]), `${agent}: effort "${m[1]}" is not a valid level`);
    }
  });
});

// ---------------------------------------------------------------------------
// TRD 41-07 — the reference's effort column is pinned to agent frontmatter.
//
// 28-03 added `effort: xhigh` to planner.md and `effort: high` to
// ui-evaluator.md. The PR #68 merge (b657033) dropped both lines and reverted
// ui-evaluator.md's body to the obsolete `df-ui-evaluator` key. CI stayed green
// because nothing tied references/model-profiles.md to the frontmatter.
//
// model-profiles.json deliberately does NOT carry effort (Task() takes no
// effort argument), and no generator writes the .md — so the .md table is the
// canonical effort source and these tests compare it against the agent files.
// ---------------------------------------------------------------------------

const PROFILES_MD_PATH = path.join(__dirname, '..', '..', 'references', 'model-profiles.md');
const SKILLS_DIR = path.join(__dirname, '..', '..', '..', 'skills');
const WORKFLOWS_DIR = path.join(__dirname, '..', '..', 'workflows');

// Parse the "## Profile Definitions" table only. The same file also has a
// "Tier → model id" table whose rows (`opus`, `sonnet`, `haiku`) match the
// same row shape, so the scan stops at the next `## ` heading.
function readEffortTable() {
  const lines = fs.readFileSync(PROFILES_MD_PATH, 'utf8').split('\n');
  const start = lines.findIndex(l => /^##\s+Profile Definitions\b/.test(l));
  if (start === -1) return [];
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) break;
    if (!/^\|\s*`([a-z-]+)`\s*\|/.test(line)) continue;
    const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
    const agent = cells[0].replace(/`/g, '');
    const raw = cells[cells.length - 1];
    const effort = (raw === '—' || raw === '-') ? null : raw;
    rows.push({ agent, effort, line: i + 1 });
  }
  return rows;
}

function frontmatterEffort(agent) {
  const file = path.join(AGENTS_DIR, `${agent}.md`);
  if (!fs.existsSync(file)) return undefined;
  const fm = fs.readFileSync(file, 'utf8').split('---')[1] || '';
  const m = /^effort:\s*(\S+)/m.exec(fm);
  return m ? m[1] : null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('TRD 41-07 — reference effort column matches agent frontmatter', () => {
  const rows = readEffortTable();

  test('every profile key has exactly one row in the Profile Definitions table', () => {
    const counts = new Map();
    for (const r of rows) counts.set(r.agent, (counts.get(r.agent) || 0) + 1);
    const missing = profileKeys.filter(k => !counts.has(k));
    const duplicated = profileKeys.filter(k => (counts.get(k) || 0) > 1);
    assert.deepEqual(missing, [],
      `model-profiles.json agents with no row in references/model-profiles.md: ${missing.join(', ')} ` +
      `(parsed ${rows.length} rows)`);
    assert.deepEqual(duplicated, [],
      `agents with more than one row in references/model-profiles.md: ${duplicated.join(', ')}`);
  });

  test('documented effort equals frontmatter effort for every row (— means none)', () => {
    assert.ok(rows.length >= profileKeys.length,
      `parsed only ${rows.length} table rows; expected at least ${profileKeys.length} — the row regex is too strict`);
    const mismatches = [];
    for (const { agent, effort } of rows) {
      const fm = frontmatterEffort(agent);
      if (fm === undefined) {
        mismatches.push(`${agent}: documented ${effort || 'none'}, no agent file`);
        continue;
      }
      if ((effort || null) !== (fm || null)) {
        mismatches.push(`${agent}: documented ${effort || 'none'}, frontmatter ${fm || 'none'}`);
      }
    }
    assert.deepEqual(mismatches, [],
      `agent frontmatter effort drifted from references/model-profiles.md:\n  ${mismatches.join('\n  ')}`);
  });

  test('no agent, skill or workflow prompt names a profile key with the obsolete df- prefix', () => {
    const keys = Object.keys(profiles.agents).map(escapeRe);
    const re = new RegExp('`df-(' + keys.join('|') + ')`');

    const files = [];
    for (const f of fs.readdirSync(AGENTS_DIR)) {
      if (f.endsWith('.md')) files.push(path.join(AGENTS_DIR, f));
    }
    for (const f of fs.readdirSync(SKILLS_DIR, { recursive: true })) {
      if (path.basename(f) === 'SKILL.md') files.push(path.join(SKILLS_DIR, f));
    }
    for (const f of fs.readdirSync(WORKFLOWS_DIR, { recursive: true })) {
      if (String(f).endsWith('.md')) files.push(path.join(WORKFLOWS_DIR, f));
    }

    const hits = [];
    for (const file of files.sort()) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const m = re.exec(line);
        if (m) hits.push(`${path.relative(REPO, file)}:${i + 1} (\`df-${m[1]}\`)`);
      });
    }
    assert.deepEqual(hits, [],
      `obsolete df- profile keys (canonical keys have no prefix):\n  ${hits.join('\n  ')}`);
  });
});
