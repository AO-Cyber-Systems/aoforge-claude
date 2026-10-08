'use strict';

// stack-drafter-golden.test.cjs — objective 43's success criterion (TRD 43-06).
//
// Re-drafting each of the 11 override repos' SHAPES (hand-built, invented fixtures in
// __fixtures__/stack-golden-fixtures.cjs) with `aof-tools --cwd <fixture> stack init` yields the
// override's `extends`, its `components` set and, per command key, its run/apply/cwd — modulo
// HAND_ONLY. PATH is a stub toolchain only and HOME an empty temp dir, so the bundled tier profiles
// resolve and verification is deterministic (the stack-drafter-e2e harness).
//
//  1  one test per golden     extends, components, per expected key run/apply/cwd (the effective
//                             command: the draft's own entry, else the one it inherits from its
//                             extends tier), and no extra ROOT key beyond EXTRA_ALLOWED
//  2  HAND_ONLY table         equals the documented object exactly (guards silent growth); KEY_ALIASES
//                             and EXTRA_ALLOWED likewise
//  3  every golden draft      validates, and no run/apply is a fragment
//  4  GOLDEN table            equals the frozen override files' run/apply/cwd subset (when present)
//
// Out of scope by design (TRD 43-06): `when`, `scoped`, `timeout_s`, `loop`, `provenance`.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fx = require('./__fixtures__/stack-drafter-fixtures.cjs');
const golden = require('./__fixtures__/stack-golden-fixtures.cjs');
const { parseProfile, resolveFromParsed } = require('./stack-profile.cjs');

const { GOLDEN, GOLDEN_SHAPES, HAND_ONLY, KEY_ALIASES, EXTRA_ALLOWED } = golden;

const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const OVERRIDES_DIR = path.join(REPO_ROOT, '.planning', 'objectives', '42-codebase-aware-stack-drafter', 'overrides');

// TRD 42-07: no run/apply may be a comment, flag, `${{ }}`, echo/printf, a `test -f` guard, a control
// word or brace, or end in a line continuation (the stack-drafter-e2e idea, copied, not imported).
const FRAGMENT_RE = /^\s*(#|-|\$\{\{|echo\b|printf\b|test -f|\[|if\b|then\b|fi\b|\{|\})|\\\s*$|\$\{\{/;

let home;
before(() => { home = fx.fakeEmptyHome(); });
after(() => { fx.cleanup(home); });

/** stackInit(repo, tools) -> { status, stderr, json, fm } (the stack-drafter-e2e harness shape). */
function stackInit(repo, tools) {
  const bin = fx.fakeToolchain(tools);
  try {
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', repo, 'stack', 'init'], {
      encoding: 'utf-8',
      env: { PATH: bin, HOME: home },
      timeout: 60000,
    });
    let json = null;
    try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
    const fm = json && json.text ? parseProfile(json.text).frontmatter : null;
    return { status: r.status, stderr: r.stderr, json, fm };
  } finally {
    fx.cleanup(bin);
  }
}

/** The resolved commands of a tier id with an empty HOME (what the draft inherits from `extends`). */
function tierCommands(extendsId, repo) {
  const resolved = resolveFromParsed(
    { frontmatter: { schema: 1, extends: extendsId }, sections: [] },
    { userHome: home, file: null, projectRoot: repo, targetPath: null },
  );
  return (resolved.frontmatter && resolved.frontmatter.commands) || {};
}

const drafts = new Map();

/** draftOf(shape) -> { status, stderr, json, fm, tier } — drafted once per shape, fixture cleaned up. */
function draftOf(shape) {
  if (drafts.has(shape)) return drafts.get(shape);
  const { build, tools } = GOLDEN_SHAPES[shape];
  const repo = build();
  try {
    const r = stackInit(repo, tools);
    const tier = r.fm ? tierCommands(r.fm.extends, repo) : {};
    const out = { ...r, tier };
    drafts.set(shape, out);
    return out;
  } finally {
    fx.cleanup(repo);
  }
}

const sortComponents = (list) => (Array.isArray(list) ? list : [])
  .map((c) => ({ path: c.path, profile: c.profile }))
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const draftKeyOf = (key) => KEY_ALIASES[key] || key;
const scoped = (entry) => (entry ? { run: entry.run, apply: entry.apply, cwd: entry.cwd } : null);

/**
 * divergences(shape) -> [string]: every way the draft differs from GOLDEN[shape] in scope. Collected
 * rather than asserted one at a time, so one failing test lists the whole diff for that golden.
 */
function divergences(shape) {
  const want = GOLDEN[shape];
  const d = draftOf(shape);
  if (!d.fm) return [`no draft (exit ${d.status}): ${d.stderr}`];
  const out = [];
  if (d.fm.extends !== want.extends) out.push(`extends: want ${want.extends}, got ${d.fm.extends}`);
  const gotComps = JSON.stringify(sortComponents(d.fm.components));
  const wantComps = JSON.stringify(sortComponents(want.components));
  if (gotComps !== wantComps) out.push(`components: want ${wantComps}, got ${gotComps}`);

  const commands = d.fm.commands || {};
  const handOnly = HAND_ONLY[shape] || [];
  for (const [key, exp] of Object.entries(want.commands)) {
    if (handOnly.includes(key)) continue;
    const dk = draftKeyOf(key);
    const own = commands[dk];
    const got = scoped(own || d.tier[dk]);
    const via = own ? 'draft' : 'inherited';
    if (!got) {
      out.push(`${key}: want ${JSON.stringify(exp)}, got nothing`);
      continue;
    }
    for (const field of ['run', 'apply', 'cwd']) {
      if ((got[field] || undefined) !== (exp[field] || undefined)) {
        out.push(`${key}.${field}: want ${JSON.stringify(exp[field])}, got ${JSON.stringify(got[field])} (${via})`);
      }
    }
  }

  const expectedKeys = new Set(Object.keys(want.commands).map(draftKeyOf));
  const allowed = new Set(EXTRA_ALLOWED[shape] || []);
  for (const key of Object.keys(commands)) {
    if (!expectedKeys.has(key) && !allowed.has(key)) out.push(`extra root key ${key}: ${JSON.stringify(scoped(commands[key]))}`);
  }
  return out;
}

describe('stack init re-drafts the 11 override shapes (TRD 43-06 golden equivalence)', () => {
  for (const shape of Object.keys(GOLDEN)) {
    test(`${shape}: draft equals override modulo HAND_ONLY`, () => {
      const diff = divergences(shape);
      assert.deepEqual(diff, [], `${shape} diverges:\n  ${diff.join('\n  ')}`);
    });
  }

  test('HAND_ONLY, KEY_ALIASES and EXTRA_ALLOWED equal the documented tables exactly', () => {
    // Each entry's reason lives beside it in __fixtures__/stack-golden-fixtures.cjs. Growing any of
    // these tables is a governed change (TRD 43-06): it needs a reason and user acceptance at 43-07.
    //   devcluster.build          user-confirmed: bin/build.sh <app> builds other apps' images; build is `none`
    //   aocore.portal_codegen     user-confirmed: a hand-named key for a component script run from the root
    // Added in TRD 43-06, pending user acceptance at the 43-07 checkpoint (author-named, non-canonical):
    //   devcluster.cluster_test   ./bin/test.sh asserts a live cluster: an env_unnamed note, never `test`
    //   ao-terminal.test_frontend the root node frontend's suite; the drafter emits one `test` (tier stack's)
    //   ao-terminal.bootstrap     `task init` only calls internal tasks: no readable gate
    //   aodex.guards              several boundary-check targets in one step: the grouping is the author's
    //   aoedge.acceptance         scenario suites against a live edge: an alternate test note
    //   EdenDocs.smoke            single-purpose smoke test: a narrow note under test
    //   EdenDocs.branding         verify-branding.sh runs no readable gate
    //   navigators.sqlc           a second codegen recipe; the drafter emits one `codegen`
    //   quanta-local.preflight    host checks no classifier reads; key = target name
    //   quanta-local.verify       needs the environment up: noted, never `test`; key = target name
    assert.deepEqual(JSON.parse(JSON.stringify(HAND_ONLY)), {
      devcluster: ['build', 'cluster_test'],
      aocore: ['portal_codegen'],
      'ao-terminal': ['test_frontend', 'bootstrap'],
      aodex: ['guards'],
      aoedge: ['acceptance'],
      EdenDocs: ['smoke', 'branding'],
      navigators: ['sqlc'],
      'quanta-local': ['preflight', 'verify'],
    });
    // HAND_ONLY never covers a canonical key beyond the user-confirmed devcluster build.
    const CANONICAL = ['build', 'test', 'lint', 'format', 'tidy', 'codegen', 'audit', 'deps', 'e2e'];
    for (const [shape, keys] of Object.entries(HAND_ONLY)) {
      for (const key of keys) {
        if (shape === 'devcluster' && key === 'build') continue;
        assert.ok(!CANONICAL.includes(key), `HAND_ONLY ${shape}.${key} is a canonical key`);
      }
    }
    assert.deepEqual({ ...KEY_ALIASES }, { helm_lint: 'lint_helm' });
    assert.deepEqual(JSON.parse(JSON.stringify(EXTRA_ALLOWED)), {});
    for (const [shape, keys] of Object.entries(HAND_ONLY)) {
      for (const key of keys) assert.ok(GOLDEN[shape] && GOLDEN[shape].commands[key], `HAND_ONLY ${shape}.${key} is not a golden key`);
    }
  });

  test('every golden draft validates and carries no fragment run/apply', () => {
    for (const shape of Object.keys(GOLDEN)) {
      const d = draftOf(shape);
      assert.ok(d.json, `${shape}: stack init printed no JSON (exit ${d.status}): ${d.stderr}`);
      assert.equal(d.status, 0, `${shape}: exit ${d.status}: ${d.stderr}`);
      assert.equal(d.json.validation.ok, true, `${shape}: ${JSON.stringify(d.json.validation.errors)}`);
      for (const [key, entry] of Object.entries(d.fm.commands || {})) {
        for (const field of ['run', 'apply']) {
          const v = entry && entry[field];
          if (v === undefined) continue;
          assert.equal(typeof v, 'string', `${shape} ${key}.${field} is not a string`);
          assert.ok(!FRAGMENT_RE.test(v), `${shape} ${key}.${field} is a fragment: ${JSON.stringify(v)}`);
        }
      }
    }
  });

  test('GOLDEN equals the frozen override files (run/apply/cwd, extends, components)', (t) => {
    if (!fs.existsSync(OVERRIDES_DIR)) {
      t.skip('the objective 42 override files are not in this checkout');
      return;
    }
    for (const shape of Object.keys(GOLDEN)) {
      const text = fs.readFileSync(path.join(OVERRIDES_DIR, `${shape}.STACK.md`), 'utf-8');
      const fm = parseProfile(text).frontmatter;
      const want = GOLDEN[shape];
      assert.equal(fm.extends, want.extends, `${shape}: extends`);
      assert.deepEqual(sortComponents(fm.components), sortComponents(want.components), `${shape}: components`);
      const fromFile = {};
      for (const [key, entry] of Object.entries(fm.commands || {})) {
        fromFile[key] = JSON.parse(JSON.stringify(scoped(entry)));
      }
      assert.deepEqual(fromFile, JSON.parse(JSON.stringify(want.commands)), `${shape}: commands`);
    }
  });
});
