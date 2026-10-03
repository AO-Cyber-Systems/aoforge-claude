'use strict';

// stack-drafter-realshape.test.cjs — the realshape suite (TRD 43-09, gap closure cycle 1).
//
// Each REALSHAPE builder (__fixtures__/stack-realshape-fixtures.cjs) reproduces the EVIDENCE SHAPE of
// one surveyed fleet drift row with invented content. This suite re-drafts it with
// `df-tools --cwd <fixture> stack init` (no --write) under a stub toolchain PATH and an empty HOME (the
// stack-drafter-golden harness), then:
//
//  R1 per shape    compareDrift(expect, draft) has no row (conflict OR more_specific) outside the
//                  shape's extraAllowed; every `absent` key is missing from the draft's own commands;
//                  no evidence item runs a `noEvidence` command; the draft validates; an optional
//                  `noteTags` { present, absent } says which note tags the draft carries (TRD 43-10)
//  R2 table guard  every entry has build/tools/expect/absent/extraAllowed/noEvidence, and no shape
//                  name carries a fleet repository's name (shapes are named by structure)
//
// 43-11..43-13 extend REALSHAPE; this file does not change for them. (43-10 added the optional noteTags.)

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/stack-drafter-fixtures.cjs');
const { REALSHAPE } = require('./__fixtures__/stack-realshape-fixtures.cjs');
const { KEY_ALIASES } = require('./__fixtures__/stack-golden-fixtures.cjs');
const { FLEET } = require('./__fixtures__/stack-fleet-tables.cjs');
const { compareDrift, formatRow } = require('./__fixtures__/stack-drift-compare.cjs');
const { parseProfile, resolveFromParsed } = require('./stack-profile.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

let home;
before(() => { home = fx.fakeEmptyHome(); });
after(() => { fx.cleanup(home); });

/** Large `stack init` results print as a single `@file:<path>` line: read that file for the JSON. */
function parseInitOutput(stdout) {
  const text = String(stdout || '').trim();
  if (text.startsWith('@file:')) {
    const file = text.slice('@file:'.length).trim();
    const body = fs.readFileSync(file, 'utf-8');
    try { fs.unlinkSync(file); } catch (_) { /* df-tools' own temp file */ }
    return JSON.parse(body);
  }
  return JSON.parse(text);
}

/** stackInit(repo, tools) -> { status, stderr, json, fm } (the golden harness shape). */
function stackInit(repo, tools) {
  const bin = fx.fakeToolchain(tools);
  try {
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, 'stack', 'init'], {
      encoding: 'utf-8',
      env: { PATH: bin, HOME: home },
      timeout: 60000,
      maxBuffer: 64 * 1024 * 1024,
    });
    let json = null;
    try { json = parseInitOutput(r.stdout); } catch (_) { json = null; }
    const fm = json && json.text ? parseProfile(json.text).frontmatter : null;
    return { status: r.status, stderr: r.stderr, json, fm };
  } finally {
    fx.cleanup(bin);
  }
}

/** The resolved commands of a tier id with an empty HOME (what a file inherits from `extends`). */
function tierCommands(extendsId, repo) {
  const resolved = resolveFromParsed(
    { frontmatter: { schema: 1, extends: extendsId }, sections: [] },
    { userHome: home, file: null, projectRoot: repo, targetPath: null },
  );
  return (resolved.frontmatter && resolved.frontmatter.commands) || {};
}

/** draftOf(name) -> { status, stderr, json, fm, rows } — drafted once, fixture removed afterwards. */
function draftOf(name) {
  const shape = REALSHAPE[name];
  const repo = shape.build();
  try {
    const r = stackInit(repo, shape.tools);
    if (!r.fm) return { ...r, rows: null };
    const { rows } = compareDrift({
      committed: shape.expect,
      draft: r.fm,
      committedTier: tierCommands(shape.expect.extends || 'general', repo),
      draftTier: tierCommands(r.fm.extends || 'general', repo),
      handOnly: [],
      keyAliases: KEY_ALIASES,
    });
    return { ...r, rows };
  } finally {
    fx.cleanup(repo);
  }
}

describe('stack init on real evidence shapes (TRD 43-09 realshape suite)', () => {
  for (const name of Object.keys(REALSHAPE)) {
    test(`${name}: draft equals the reviewed expectation`, () => {
      const shape = REALSHAPE[name];
      const d = draftOf(name);
      assert.ok(d.json, `${name}: stack init printed no JSON (exit ${d.status}): ${d.stderr}`);
      assert.equal(d.status, 0, `${name}: exit ${d.status}: ${d.stderr}`);
      assert.ok(d.fm, `${name}: the draft has no frontmatter`);

      const problems = [];
      const allowed = new Set(shape.extraAllowed || []);
      for (const row of d.rows) {
        if (!allowed.has(row.key)) problems.push(`${row.kind}: ${formatRow(row)}`);
      }
      const own = d.fm.commands || {};
      for (const key of shape.absent || []) {
        if (Object.prototype.hasOwnProperty.call(own, key)) problems.push(`absent key ${key} is drafted: ${JSON.stringify(own[key])}`);
      }
      const evidence = Array.isArray(d.json.evidence) ? d.json.evidence : [];
      for (const cmd of shape.noEvidence || []) {
        for (const item of evidence.filter((e) => e.command === cmd)) {
          problems.push(`evidence must not carry \`${cmd}\` (key ${item.key}, ${item.source} ${item.sourceFile || ''})`);
        }
      }
      const tags = new Set((Array.isArray(d.json.notes) ? d.json.notes : []).map((n) => n.tag).filter(Boolean));
      const wanted = shape.noteTags || {};
      for (const tag of wanted.present || []) {
        if (!tags.has(tag)) problems.push(`the draft carries no \`${tag}\` note`);
      }
      for (const tag of wanted.absent || []) {
        if (tags.has(tag)) problems.push(`the draft carries a \`${tag}\` note`);
      }
      if (!d.json.validation || d.json.validation.ok !== true) {
        problems.push(`draft does not validate: ${JSON.stringify(d.json.validation && d.json.validation.errors)}`);
      }
      assert.deepEqual(problems, [], `${name}:\n  ${problems.join('\n  ')}`);
    });
  }
});

describe('REALSHAPE table (TRD 43-09 guards)', () => {
  test('every entry is complete and named by structure, never by a fleet repository', () => {
    const repoTokens = FLEET.map((repo) => repo.toLowerCase().replace(/[^a-z0-9]/g, ''));
    for (const [name, shape] of Object.entries(REALSHAPE)) {
      assert.ok(/Shape$/.test(name), `${name}: shape names end in Shape`);
      const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const token of repoTokens) assert.ok(!flat.includes(token), `${name} carries the fleet repo name ${token}`);
      assert.equal(typeof shape.build, 'function', `${name}: build`);
      assert.ok(Array.isArray(shape.tools) && shape.tools.length > 0, `${name}: tools`);
      assert.ok(shape.expect && typeof shape.expect.extends === 'string', `${name}: expect.extends`);
      assert.ok(Array.isArray(shape.expect.components), `${name}: expect.components`);
      assert.ok(shape.expect.commands && typeof shape.expect.commands === 'object', `${name}: expect.commands`);
      for (const field of ['absent', 'extraAllowed', 'noEvidence']) {
        assert.ok(Array.isArray(shape[field]), `${name}: ${field} must be a list`);
      }
      if (shape.noteTags !== undefined) {
        for (const field of ['present', 'absent']) {
          assert.ok(Array.isArray(shape.noteTags[field]), `${name}: noteTags.${field} must be a list`);
        }
      }
    }
  });
});
