'use strict';

// gh-sync-skill.repo.test.cjs (objective 51, TRD 51-09, GMD-03)
//
// `/devflow:gh-sync` keeps its name and becomes the operator skill for the GitHub store: it migrates a project onto
// GitHub (migration 0011, dry run first, explicit approval), reports store status, flushes the outbox, pulls, runs
// `gh setup` and generates release notes. `<objective>|--all` is the one-way mirror, documented for store-off
// projects. These assertions pin that contract over the prose, so a later edit cannot quietly bring back the old
// "commit the mapping file" step or a chain that names a mode the skill does not have.
//
// Test list:
//  1. The skill's frontmatter keeps `name: gh-sync`; its argument-hint lists the modes `migrate`, `status`, `flush`,
//     `pull`, `setup`, `release` plus `<objective>` and `--all`; allowed-tools has AskUserQuestion (migrate asks
//     before it applies); the description says when to use it ("migrate to github", "move planning to github",
//     "github store", "flush the outbox").
//  2. No line that mentions a commit names `.gh-mapping.json`; the body never runs a raw `git commit`; it carries
//     the dry-run plan (`planning import --dry-run`, `upgrade --check --only 0011`), the apply
//     (`upgrade --apply --only 0011 --confirm`) and says GitHub is the system of record in store mode.
//  3. Every `/devflow:gh-sync <mode>` mention in skills/flow/SKILL.md uses a mode from the argument-hint (a `{N}` or
//     `<objective>` placeholder is the objective form).
//  3b. The build-and-sync and verify-and-sync chains say that in store mode the step flushes the outbox and with
//     the store off it mirrors.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// __dirname = plugins/devflow/devflow/bin/lib
const PLUGIN = path.resolve(__dirname, '..', '..', '..'); // plugins/devflow
const SKILL_MD = path.join(PLUGIN, 'skills', 'gh-sync', 'SKILL.md');
const FLOW_MD = path.join(PLUGIN, 'skills', 'flow', 'SKILL.md');

const MODES = ['migrate', 'status', 'flush', 'pull', 'setup', 'release'];

function read(p) {
  return fs.readFileSync(p, 'utf-8');
}

/** Split a SKILL.md into its frontmatter lines and body. */
function splitSkill(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(m, 'SKILL.md has no frontmatter block');
  return { front: m[1], body: m[2] };
}

/** One scalar frontmatter value (`key: "value"` or `key: value`). */
function scalar(front, key) {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(front);
  if (!m) return null;
  return m[1].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

/** The block-scalar description (`description: |` + indented lines). */
function description(front) {
  const m = /^description:\s*\|\n((?:[ \t]+.*\n?)+)/m.exec(front);
  return m ? m[1] : (scalar(front, 'description') || '');
}

/** The `allowed-tools:` list. */
function allowedTools(front) {
  const m = /^allowed-tools:\n((?:[ \t]+-.*\n?)+)/m.exec(front);
  if (!m) return [];
  return m[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
}

/**
 * The modes the argument-hint offers: the first word of each `|` alternative inside the outer brackets.
 * `[migrate [--dry-run]|status|release <tag>|<objective>|--all]` -> migrate, status, release, <objective>, --all.
 */
function hintModes(hint) {
  const inner = hint.replace(/^\[/, '').replace(/\]$/, '');
  return inner.split('|').map((alt) => alt.trim().split(/\s+/)[0]).filter(Boolean);
}

function skillParts() {
  return splitSkill(read(SKILL_MD));
}

describe('51-09: /devflow:gh-sync is the GitHub store operator skill', () => {
  it('1: frontmatter keeps the name, lists every store mode, and can ask before migrating', () => {
    const { front } = skillParts();
    assert.equal(scalar(front, 'name'), 'gh-sync', 'the skill is repurposed in place, never renamed');

    const hint = scalar(front, 'argument-hint');
    assert.ok(hint, 'argument-hint is missing');
    const modes = hintModes(hint);
    for (const mode of [...MODES, '<objective>', '--all']) {
      assert.ok(modes.includes(mode), `argument-hint ${JSON.stringify(hint)} does not offer \`${mode}\` (modes: ${modes.join(', ')})`);
    }
    assert.ok(/migrate \[--dry-run\]/.test(hint), 'migrate takes an optional --dry-run');
    assert.ok(/setup \[--apply\]/.test(hint), 'setup takes an optional --apply');
    assert.ok(/release <tag>/.test(hint), 'release takes a tag');

    const tools = allowedTools(front);
    for (const t of ['Read', 'Bash', 'AskUserQuestion']) {
      assert.ok(tools.includes(t), `allowed-tools lacks ${t} (has: ${tools.join(', ')})`);
    }

    const desc = description(front).toLowerCase();
    for (const phrase of ['migrate to github', 'move planning to github', 'github store', 'flush the outbox']) {
      assert.ok(desc.includes(phrase), `description lacks the trigger "${phrase}"`);
    }
  });

  it('2: migrate shows the plan, then applies 0011; nothing commits the mapping file or runs a raw git commit', () => {
    const { body } = skillParts();
    const lines = body.split('\n');

    const mappingCommits = lines
      .map((text, i) => ({ text, line: i + 1 }))
      .filter((l) => /commit/i.test(l.text) && l.text.includes('.gh-mapping.json'));
    assert.deepEqual(mappingCommits, [], 'a commit instruction names .gh-mapping.json');

    const rawCommits = lines.filter((l) => /\bgit commit\b/.test(l) && !/never|not\b/i.test(l));
    assert.deepEqual(rawCommits, [], 'the skill tells the agent to run a raw git commit');

    for (const needle of [
      'planning import --dry-run',
      'upgrade --check --only 0011',
      'upgrade --apply --only 0011 --confirm',
      'gh outbox flush',
      'gh outbox status',
      'gh pull --all',
      'gh setup',
      'gh sync-release',
      'AskUserQuestion',
    ]) {
      assert.ok(body.includes(needle), `the skill body never mentions \`${needle}\``);
    }
    assert.ok(/system of record/i.test(body), 'the skill does not say GitHub is the system of record in store mode');
    assert.ok(/mirror/i.test(body) && /store (?:is )?off/i.test(body), '<objective>|--all is not documented as the store-off mirror');
  });

  it('3: every /devflow:gh-sync <mode> in the flow chains is a mode the skill offers', () => {
    const modes = hintModes(scalar(skillParts().front, 'argument-hint'));
    const flow = read(FLOW_MD);
    const mentions = [];
    const re = /\/devflow:gh-sync(?:[ \t]+([^\s`]+))?/g;
    let m;
    while ((m = re.exec(flow)) !== null) {
      const line = flow.slice(0, m.index).split('\n').length;
      mentions.push({ line, token: m[1] || null });
    }
    assert.ok(mentions.length >= 3, `expected the flow chains to name /devflow:gh-sync (found ${mentions.length})`);

    const bad = mentions.filter(({ token }) => {
      if (token === null) return false; // the bare skill name: its no-argument default
      if (/^[{<]/.test(token)) return !modes.includes('<objective>'); // `{N}` / `<objective>` placeholder
      return !modes.includes(token);
    });
    assert.deepEqual(
      bad,
      [],
      `flow/SKILL.md names a gh-sync mode the skill does not have (modes: ${modes.join(', ')}):\n` +
        bad.map((b) => `  line ${b.line}: /devflow:gh-sync ${b.token}`).join('\n'),
    );
  });

  it('3b: the flow chains say what syncing means in store mode', () => {
    const flow = read(FLOW_MD);
    const chains = flow.split('\n').filter((l) => /\*\*(?:build-and-sync|verify-and-sync)\*\*/.test(l));
    assert.equal(chains.length, 2, 'build-and-sync and verify-and-sync chains not found');
    for (const l of chains) {
      assert.ok(/flushes the outbox/.test(l) && /mirrors/.test(l), `chain does not say store mode flushes, store off mirrors: ${l}`);
    }
  });
});
