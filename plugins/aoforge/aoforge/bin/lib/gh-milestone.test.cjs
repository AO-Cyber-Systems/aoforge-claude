'use strict';

/**
 * Tests for lib/gh-milestone.cjs (TRD 46-05, GSF-05): which milestone an objective's issue belongs to.
 *
 * Before this module the milestone was "the first vX.Y anywhere in ROADMAP" (v1.1 in this repo, while
 * objective 46 declares v1.4) with a v1.0 default, and its number was cached forever. The resolver here
 * answers from the objective's own `milestone:` first, then the ROADMAP `## Milestones` list, and
 * otherwise says "none" — never a guess.
 *
 * Hermetic: temp projects, no gh calls.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normaliseVersion,
  milestoneTitle,
  resolveObjectiveMilestone,
} = require('./gh-milestone.cjs');

const tmpDirs = [];
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

// ROADMAP with a `## Milestones` list that resolves to v1.3 (highest shipped) and a planned v1.4.
const ROADMAP_V13 = [
  '# Roadmap',
  '',
  'Earlier work shipped as v1.1 and v1.2.',
  '',
  '## Milestones',
  '',
  '- ✅ **v1.3 — Earlier** — Objectives 1-40 (shipped 2026-01-01)',
  '- 📋 **v1.4 — GitHub** — Objectives 46+ (planned)',
  '',
  '## Objectives',
  '',
  '### Objective 2: a',
  '',
].join('\n');

/** A temp project. `roadmap: null` writes no ROADMAP; `objective: null` writes no OBJECTIVE.md. */
function makeProject({ roadmap = ROADMAP_V13, objective = '---\nobjective: a\n---\n# a\n', dir = '02-a' } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-milestone-'));
  tmpDirs.push(cwd);
  fs.mkdirSync(path.join(cwd, '.planning', 'objectives', dir), { recursive: true });
  if (roadmap !== null) fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), roadmap);
  if (objective !== null) fs.writeFileSync(path.join(cwd, '.planning', 'objectives', dir, 'OBJECTIVE.md'), objective);
  return cwd;
}

const withMilestone = (value) => `---\nobjective: a\nmilestone: ${value}\n---\n# a\n`;

describe('normaliseVersion / milestoneTitle', () => {
  it('normaliseVersion adds a leading v, tolerates quotes and whitespace, and rejects non-versions', () => {
    assert.equal(normaliseVersion('v1.4'), 'v1.4');
    assert.equal(normaliseVersion('1.4'), 'v1.4');
    assert.equal(normaliseVersion('V2.0.1'), 'v2.0.1');
    assert.equal(normaliseVersion('  "v1.4" '), 'v1.4');
    assert.equal(normaliseVersion('banana'), null);
    assert.equal(normaliseVersion('2'), null, 'a bare integer is not a milestone version');
    assert.equal(normaliseVersion(''), null);
    assert.equal(normaliseVersion(null), null);
    assert.equal(normaliseVersion(undefined), null);
  });

  it('milestoneTitle = prefix + version without its leading v', () => {
    assert.equal(milestoneTitle('v', 'v1.4'), 'v1.4');
    assert.equal(milestoneTitle('M-', 'v1.4'), 'M-1.4');
    assert.equal(milestoneTitle('', 'v1.4'), '1.4');
    assert.equal(milestoneTitle(undefined, 'v1.4'), 'v1.4', 'no prefix configured means the default v');
    assert.equal(milestoneTitle('v', null), null);
  });
});

describe('resolveObjectiveMilestone', () => {
  it("M1. the objective's own milestone wins over the ROADMAP list", () => {
    const cwd = makeProject({ objective: withMilestone('v1.4') });
    const r = resolveObjectiveMilestone(cwd, '02-a', 'v');
    assert.deepEqual(r, { title: 'v1.4', version: 'v1.4', source: 'objective' });
  });

  it('M2. with no milestone: field, the ROADMAP Milestones list answers, not earlier prose', () => {
    const roadmap = [
      '# Roadmap',
      '',
      'We used to ship v1.1 by hand.',
      '',
      '## Milestones',
      '',
      '- ✅ **v1.3 — Earlier** — Objectives 1-40 (shipped 2026-01-01)',
      '- 🚧 **v2.0 — Next** — Objectives 41-60 (in progress)',
      '',
    ].join('\n');
    const cwd = makeProject({ roadmap });
    const r = resolveObjectiveMilestone(cwd, '02-a', 'v');
    assert.deepEqual(r, { title: 'v2.0', version: 'v2.0', source: 'roadmap' });
  });

  it('M3. no milestone: field and no Milestones section: none, with a warning, never v1.1 from prose', () => {
    const roadmap = '# Roadmap\n\nShipped as v1.1 last year.\n\n### Objective 2: a\n';
    const cwd = makeProject({ roadmap });
    const r = resolveObjectiveMilestone(cwd, '02-a', 'v');
    assert.equal(r.title, null);
    assert.equal(r.version, null);
    assert.equal(r.source, 'none');
    assert.match(r.warning, /no milestone/);
  });

  it('M3b. a Milestones heading with no version bullets is still "none", not the legacy first-vX.Y fallback', () => {
    const roadmap = '# Roadmap\n\nShipped as v1.1 last year.\n\n## Milestones\n\nTBD\n\n### Objective 2: a\n';
    const cwd = makeProject({ roadmap });
    const r = resolveObjectiveMilestone(cwd, '02-a', 'v');
    assert.equal(r.source, 'none');
    assert.equal(r.title, null);
  });

  it('M3c. no ROADMAP at all is "none", never the v1.0 default', () => {
    const cwd = makeProject({ roadmap: null });
    const r = resolveObjectiveMilestone(cwd, '02-a', 'v');
    assert.equal(r.source, 'none');
    assert.equal(r.title, null);
    assert.notEqual(r.version, 'v1.0');
  });

  it('M4. the prefix is applied to the version without its v; a version written without v is normalised', () => {
    const cwd = makeProject({ objective: withMilestone('v1.4') });
    assert.equal(resolveObjectiveMilestone(cwd, '02-a', 'M-').title, 'M-1.4');
    assert.equal(resolveObjectiveMilestone(cwd, '02-a', 'v').title, 'v1.4');

    const bare = makeProject({ objective: withMilestone('1.4') });
    const r = resolveObjectiveMilestone(bare, '02-a', 'v');
    assert.equal(r.version, 'v1.4');
    assert.equal(r.title, 'v1.4');
    assert.equal(r.source, 'objective');
  });

  it('M5. a ROADMAP-only objective (no directory) falls through to the roadmap, or to none', () => {
    const withList = makeProject();
    assert.deepEqual(resolveObjectiveMilestone(withList, null, 'v'),
      { title: 'v1.3', version: 'v1.3', source: 'roadmap' });

    const without = makeProject({ roadmap: '# Roadmap\n\n### Objective 2: a\n' });
    assert.equal(resolveObjectiveMilestone(without, null, 'v').source, 'none');
  });

  it('M6. a milestone: value that is not a version is ignored with a warning, and resolution continues', () => {
    const cwd = makeProject({ objective: withMilestone('banana') });
    const r = resolveObjectiveMilestone(cwd, '02-a', 'v');
    assert.equal(r.source, 'roadmap');
    assert.equal(r.title, 'v1.3');
    assert.match(r.warning, /banana/);
  });

  it('M7. a missing OBJECTIVE.md or an unreadable directory falls through without throwing', () => {
    const cwd = makeProject({ objective: null });
    assert.equal(resolveObjectiveMilestone(cwd, '02-a', 'v').source, 'roadmap');
    assert.equal(resolveObjectiveMilestone(cwd, 'no-such-dir', 'v').source, 'roadmap');
  });

  it('M8. gh-milestone has no first-vX.Y regex and never defaults to v1.0', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gh-milestone.cjs'), 'utf-8');
    assert.ok(!src.includes('match(/v('), 'no first-vX.Y match');
    assert.ok(!/['"`]v1\.0['"`]/.test(src), 'no v1.0 default');
  });
});
