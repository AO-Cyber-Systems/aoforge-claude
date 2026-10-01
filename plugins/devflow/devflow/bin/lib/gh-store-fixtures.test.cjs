'use strict';

/**
 * Tests for __fixtures__/gh-store-fixtures.cjs (TRD 47-02, Task 3): the hand-built store-shaped
 * project every later 47 test reuses (one objective, 3 TRDs in 2 waves), the oversized-TRD builder
 * for the 60,000 / 60,001 budget boundary, and the hermetic environment (HOME, outbox and cache dirs,
 * git isolation) that keeps a test off the real ~/.claude.
 *
 * Hermetic: everything lives under os.tmpdir(); no network, no real `gh`, no real ~/.claude.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  STORE_FIXTURE, makeStoreProject, oversizedTrdText, hermeticEnv,
} = require('./__fixtures__/gh-store-fixtures.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');

const read = (root, ...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const exists = (root, ...p) => fs.existsSync(path.join(root, ...p));
const OBJ = (root, ...p) => path.join(root, '.planning', 'objectives', '07-store-demo', ...p);

/** Every file under `dir` as `relative path -> contents`, so two projects can be compared. */
function snapshot(dir, base = dir, out = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshot(full, base, out);
    else out[path.relative(base, full)] = fs.readFileSync(full, 'utf8');
  }
  return out;
}

let made = [];
const make = (opts) => {
  const project = makeStoreProject(opts);
  made.push(project);
  return project;
};
afterEach(() => {
  for (const p of made) p.cleanup();
  made = [];
});

// ─── Test 16: the default project ────────────────────────────────────────────

describe('makeStoreProject', () => {
  it('16. builds one objective with 3 TRDs in 2 waves, the planning docs and a github config', () => {
    const project = make();
    assert.equal(project.objectiveDir, '07-store-demo');
    assert.deepEqual(project.trdFiles, ['07-01-alpha-TRD.md', '07-02-beta-TRD.md', '07-03-gamma-TRD.md']);
    assert.ok(project.root.startsWith(os.tmpdir()), 'the project lives under os.tmpdir()');
    assert.deepEqual(project.fakeOptions, { repo: 'o/r', ownerType: 'Organization', hasWiki: true });

    for (const f of project.trdFiles) assert.ok(exists(OBJ(project.root, f)), f);
    for (const f of ['OBJECTIVE.md', '07-CONTEXT.md', '07-RESEARCH.md', '07-01-alpha-SUMMARY.md']) {
      assert.ok(exists(OBJ(project.root, f)), f);
    }
    for (const f of ['ROADMAP.md', 'PROJECT.md', 'REQUIREMENTS.md', 'config.json']) {
      assert.ok(exists(project.root, '.planning', f), f);
    }

    // Waves: 07-01 and 07-02 are wave 1; 07-03 is wave 2 and depends on 07-01.
    const alpha = read(OBJ(project.root), '07-01-alpha-TRD.md');
    const beta = read(OBJ(project.root), '07-02-beta-TRD.md');
    const gamma = read(OBJ(project.root), '07-03-gamma-TRD.md');
    assert.match(alpha, /^wave: 1$/m);
    assert.match(alpha, /^depends_on: \[\]$/m);
    assert.match(beta, /^wave: 1$/m);
    assert.match(beta, /^depends_on: \[\]$/m);
    assert.match(gamma, /^wave: 2$/m);
    assert.match(gamma, /^depends_on: \["07-01"\]$/m);
    for (const [name, text] of [['alpha', alpha], ['beta', beta], ['gamma', gamma]]) {
      assert.match(text, /^---\n/, `${name} opens with frontmatter`);
      assert.match(text, /^objective: 07-store-demo$/m, name);
      assert.equal((text.match(/<task /g) || []).length, 1, `${name} has exactly one <task>`);
      const lines = text.replace(/\n$/, '').split('\n').length;
      assert.ok(lines >= 20 && lines <= 40, `${name} is 20-40 lines (got ${lines})`);
    }

    // OBJECTIVE.md carries `work`; `kind` comes from PROJECT.md.
    const objective = read(OBJ(project.root), 'OBJECTIVE.md');
    assert.match(objective, /^objective: 07-store-demo$/m);
    assert.match(objective, /^work: feature$/m);
    assert.match(objective, /^milestone: v9\.9$/m);
    assert.doesNotMatch(objective, /^kind:/m, 'kind is not set on the objective');
    assert.match(objective, /## Goal/);
    assert.equal((objective.match(/^\d+\. /gm) || []).length, 2, 'two success criteria');
    const projectMd = read(project.root, '.planning', 'PROJECT.md');
    assert.match(projectMd, /^kind: plugin$/m);
    assert.match(projectMd, /^default_work: feature$/m);

    // ROADMAP: the demo milestone and objective 7 with two success criteria.
    const roadmap = read(project.root, '.planning', 'ROADMAP.md');
    assert.match(roadmap, /v9\.9 Store Demo/);
    assert.match(roadmap, /^### Objective 7: Store demo$/m);
    assert.equal((roadmap.match(/^\s+\d+\. /gm) || []).length, 2);

    const config = JSON.parse(read(project.root, '.planning', 'config.json'));
    assert.equal(config.github.enabled, true);
    assert.equal(config.github.repo, 'o/r');
    assert.equal('store' in config.github, false, 'store is opt-in');

    // The repo naming convention for the reference docs.
    assert.match(read(OBJ(project.root), '07-CONTEXT.md'), /\S/);
    assert.match(read(OBJ(project.root), '07-RESEARCH.md'), /\S/);
  });

  it('16b. one TRD has no trailing newline (a round-trip edge); the others end with one', () => {
    const project = make();
    const ends = project.trdFiles.map((f) => read(OBJ(project.root), f).endsWith('\n'));
    assert.equal(ends.filter((e) => !e).length, 1, 'exactly one TRD lacks a trailing newline');
    assert.equal(read(OBJ(project.root), '07-03-gamma-TRD.md').endsWith('\n'), false);
    assert.ok(/[^\x00-\x7f]/.test(read(OBJ(project.root), '07-02-beta-TRD.md')), 'one TRD carries non-ASCII text');
  });

  it('16c. the option flags: enabled false, store true (strict boolean) and independent temp roots', () => {
    const off = make({ enabled: false });
    assert.equal(JSON.parse(read(off.root, '.planning', 'config.json')).github.enabled, false);

    const store = make({ store: true });
    const cfg = JSON.parse(read(store.root, '.planning', 'config.json'));
    assert.strictEqual(cfg.github.store, true);
    assert.equal(cfg.github.enabled, true);

    assert.notEqual(off.root, store.root);
  });

  it('16d. cleanup removes the project; STORE_FIXTURE is the literal source of every file', () => {
    const project = makeStoreProject();
    assert.ok(fs.existsSync(project.root));
    project.cleanup();
    assert.equal(fs.existsSync(project.root), false);
    project.cleanup(); // idempotent

    const again = make();
    assert.equal(read(OBJ(again.root), '07-01-alpha-TRD.md'), STORE_FIXTURE.trds['07-01-alpha-TRD.md']);
    assert.equal(read(again.root, '.planning', 'ROADMAP.md'), STORE_FIXTURE.roadmap);
    // Callers may mutate what they were handed without poisoning the next project.
    again.trdFiles.push('x');
    assert.equal(make().trdFiles.length, 3);
  });

  it('17. {ownerType:"User"} writes the same files; the option is carried only for the fake', () => {
    const org = make();
    const user = make({ ownerType: 'User', hasWiki: false });
    assert.deepEqual(user.fakeOptions, { repo: 'o/r', ownerType: 'User', hasWiki: false });
    assert.deepEqual(snapshot(user.root), snapshot(org.root), 'identical files on disk');

    const fake = createFakeGitHub(user.fakeOptions);
    assert.equal(fake.ownerType, 'User');
    const repoMeta = JSON.parse(fake.runGh(['api', 'repos/o/r']).stdout);
    assert.equal(repoMeta.has_wiki, false);
    assert.equal(repoMeta.owner.type, 'User');
  });
});

// ─── Test 18: oversizedTrdText ───────────────────────────────────────────────

describe('oversizedTrdText', () => {
  const META = { id: '07-04', file: '07-04-big-TRD.md' };
  // The D-01 header, computed locally so this fixture does not import 47-01.
  const header = (m) => `<!-- devflow:id=${m.id} -->\n<!-- devflow:file=${m.file} -->\n`;

  it('18. the encoded length (D-01 header + text) is exactly n, at the 60,000 / 60,001 boundary and the 40,000 target', () => {
    for (const n of [39999, 40000, 60000, 60001]) {
      const text = oversizedTrdText(n, META);
      assert.equal(typeof text, 'string');
      assert.equal((header(META) + text).length, n, `n=${n}`);
    }
  });

  it('18b. the text is a TRD-shaped document (frontmatter + one task) padded with x; its header follows id and file', () => {
    const text = oversizedTrdText(60001, META);
    assert.match(text, /^---\n/);
    assert.match(text, /^objective: 07-store-demo$/m);
    assert.match(text, /<task /);
    assert.doesNotMatch(text, /\r/);
    assert.ok(text.endsWith('\n'));

    // A longer id / file name shortens the body by exactly the header difference.
    const other = { id: '07-12', file: '07-12-a-much-longer-file-name-TRD.md' };
    assert.equal((header(other) + oversizedTrdText(60001, other)).length, 60001);
    assert.notEqual(oversizedTrdText(60001, META).length, oversizedTrdText(60001, other).length);
  });

  it('18c. refuses a size too small to hold the header and a skeleton', () => {
    assert.throws(() => oversizedTrdText(10, META), RangeError);
    assert.throws(() => oversizedTrdText(60001, {}), /id and file/);
  });
});

// ─── Test 19: hermeticEnv ────────────────────────────────────────────────────

describe('hermeticEnv', () => {
  const KEYS = ['HOME', 'DEVFLOW_OUTBOX_DIR', 'DEVFLOW_GH_CACHE_DIR', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_TERMINAL_PROMPT',
    'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];

  const snap = () => Object.fromEntries(KEYS.map((k) => [k, Object.prototype.hasOwnProperty.call(process.env, k) ? process.env[k] : undefined]));
  const put = (saved) => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };

  it('19. sets HOME, the outbox and cache dirs to temp paths and isolates git; restore() puts every variable back exactly', () => {
    const original = snap();
    try {
      // A mix of set and unset variables, so "exactly" covers both.
      process.env.HOME = '/sentinel/home';
      process.env.GIT_TERMINAL_PROMPT = '1';
      delete process.env.DEVFLOW_OUTBOX_DIR;
      delete process.env.DEVFLOW_GH_CACHE_DIR;
      delete process.env.GIT_CONFIG_GLOBAL;
      process.env.GIT_CONFIG_SYSTEM = '/sentinel/system';
      const before = snap();

      const h = hermeticEnv();
      const tmp = os.tmpdir();
      assert.ok(h.env.HOME.startsWith(tmp));
      assert.ok(h.env.DEVFLOW_OUTBOX_DIR.startsWith(tmp));
      assert.ok(h.env.DEVFLOW_GH_CACHE_DIR.startsWith(tmp));
      assert.notEqual(h.env.HOME, h.env.DEVFLOW_OUTBOX_DIR);
      assert.notEqual(h.env.DEVFLOW_OUTBOX_DIR, h.env.DEVFLOW_GH_CACHE_DIR);
      assert.equal(h.env.GIT_CONFIG_GLOBAL, '/dev/null');
      assert.equal(h.env.GIT_CONFIG_SYSTEM, '/dev/null');
      assert.equal(h.env.GIT_TERMINAL_PROMPT, '0');
      assert.ok(fs.existsSync(h.env.HOME), 'HOME exists');
      assert.equal(fs.existsSync(h.env.DEVFLOW_OUTBOX_DIR), false, 'the outbox dir is absent until a test writes to it');

      // The returned env is what is live in process.env.
      for (const [k, v] of Object.entries(h.env)) assert.equal(process.env[k], v, k);
      assert.equal(os.homedir(), h.env.HOME, 'os.homedir() follows HOME, so ~/.claude resolves inside the temp dir');
      assert.notEqual(h.env.HOME, original.HOME);

      h.restore();
      assert.deepEqual(snap(), before, 'every variable is back, set or unset');
      assert.equal(fs.existsSync(h.root), false, 'restore removes the temp root');
      h.restore(); // idempotent
      assert.deepEqual(snap(), before);
    } finally {
      put(original);
    }
  });

  it('19b. two calls get distinct roots, and nesting restores in reverse order', () => {
    const original = snap();
    try {
      const a = hermeticEnv();
      const b = hermeticEnv();
      assert.notEqual(a.env.HOME, b.env.HOME);
      b.restore();
      assert.equal(process.env.HOME, a.env.HOME);
      a.restore();
      assert.deepEqual(snap(), original);
    } finally {
      put(original);
    }
  });
});
