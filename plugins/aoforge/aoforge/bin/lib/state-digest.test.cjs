'use strict';

// state-digest.cjs — STATE.md rotation and digest (context budget).
//
// Test list
//  1. rotateDecisions keeps the newest N entries (file order) and returns the rest, each with its continuation lines
//  2. rotateDecisions with N or fewer entries: unchanged content, applies:false
//  3. rotateDecisions without the section: unchanged, applies:false
//  4. rotateDecisions keeps the section's lead text and the sections around it byte for byte; CRLF files keep \r
//  5. appendDecisionsToArchive appends oldest first after existing entries and drops the `*(none yet)*` placeholder
//  6. appendDecisionsToArchive adds a `## Decisions` section when the archive has none
//  7. digest: digest sections in order, decisions capped at N headlines with the "newest N of M" title, pending todos
//  8. digest condenses `**Objective complete:**` runs to one line and cuts lines over 400 chars
//  9. CLI: `state digest` prints the digest, `state rotate-decisions --dry-run` writes nothing, a real rotation moves
//     the entries into STATE_ARCHIVE.md and `state load` carries state_digest, never state_raw
// 10. migration 0015: detect/apply on an oversized STATE.md, not applicable afterwards, dry run writes nothing
// 11. `state advance-job` rotates an oversized log on the way through (local mode)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sd = require('./state-digest.cjs');
const DF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

function entry(i, extra = '') {
  return `- **Decision ${i} (2026-10-${String(i).padStart(2, '0')})** — summary ${i}${extra}`;
}

function stateWith(n, { lead = '', tail = '' } = {}) {
  const entries = [];
  for (let i = n; i >= 1; i--) {
    entries.push(entry(i));
    if (i % 3 === 0) entries.push(`  - sub-bullet of ${i}`, `  continuation of ${i}`);
  }
  return [
    '# Project State',
    '',
    '## Project Reference',
    '',
    '**Building:** a thing',
    '',
    '## Current Position',
    '',
    '**Milestone:** v1',
    '**Status:** Executing objective 7',
    '',
    '## Recent Decisions',
    ...(lead ? ['', lead] : ['']),
    ...entries,
    ...(tail ? [tail] : []),
    '',
    '## Blockers / Concerns',
    '',
    '- none',
    '',
    '## Session Continuity',
    '',
    '**Last Activity:** 2026-10-16',
    '',
  ].join('\n');
}

describe('state-digest: rotateDecisions', () => {
  test('1. keeps the newest N and returns the rest with their continuation lines', () => {
    const r = sd.rotateDecisions(stateWith(14), 10);
    assert.equal(r.applies, true);
    assert.equal(r.kept, 10);
    assert.equal(r.moved.length, 4);
    assert.match(r.moved[0], /^- \*\*Decision 4/);
    assert.match(r.moved[3], /^- \*\*Decision 1/);
    assert.ok(r.moved[1].includes('sub-bullet of 3'), 'entry 3 carries its sub-bullet');
    assert.ok(r.moved[1].includes('continuation of 3'));
    assert.ok(r.content.includes(entry(5)));
    assert.ok(!r.content.includes(entry(4)));
    assert.equal(sd.decisionEntries(r.content).length, 10);
  });

  test('2. N or fewer entries: unchanged, applies:false', () => {
    const content = stateWith(10);
    const r = sd.rotateDecisions(content, 10);
    assert.equal(r.applies, false);
    assert.equal(r.content, content);
    assert.equal(r.kept, 10);
  });

  test('3. no section: unchanged, applies:false', () => {
    const content = '# Project State\n\n## Current Position\n\n**Status:** x\n';
    const r = sd.rotateDecisions(content, 10);
    assert.equal(r.applies, false);
    assert.equal(r.content, content);
  });

  test('4. surrounding sections and lead text survive byte for byte; CRLF keeps \\r', () => {
    const content = stateWith(12, { lead: 'Newest first.' });
    const r = sd.rotateDecisions(content, 10);
    const before = content.slice(0, content.indexOf('## Recent Decisions'));
    const after = content.slice(content.indexOf('## Blockers'));
    assert.ok(r.content.startsWith(before));
    assert.ok(r.content.endsWith(after));
    assert.ok(r.content.includes('## Recent Decisions\n\nNewest first.\n'));

    const crlf = content.replace(/\n/g, '\r\n');
    const rc = sd.rotateDecisions(crlf, 10);
    assert.equal(rc.applies, true);
    assert.ok(!/[^\r]\n/.test(rc.content), 'every newline keeps its \\r');
    assert.equal(sd.decisionEntries(rc.content).length, 10);
  });
});

describe('state-digest: appendDecisionsToArchive', () => {
  test('5. appends oldest first after existing entries and drops the placeholder', () => {
    const archive = '# State Archive\n\n## Decisions\n\n- *(none yet)*\n\n## Performance Metrics\n\n| a |\n';
    const out = sd.appendDecisionsToArchive(archive, ['- new (2026-10-02)', '- old (2026-10-01)']);
    assert.ok(!out.includes('*(none yet)*'));
    const dec = out.indexOf('## Decisions');
    const met = out.indexOf('## Performance Metrics');
    assert.ok(dec < out.indexOf('- old (2026-10-01)'));
    assert.ok(out.indexOf('- old (2026-10-01)') < out.indexOf('- new (2026-10-02)'));
    assert.ok(out.indexOf('- new (2026-10-02)') < met);
    const again = sd.appendDecisionsToArchive(out, ['- newer (2026-10-03)']);
    assert.ok(again.indexOf('- new (2026-10-02)') < again.indexOf('- newer (2026-10-03)'));
    assert.ok(again.indexOf('- newer (2026-10-03)') < again.indexOf('## Performance Metrics'));
  });

  test('6. adds a Decisions section when the archive has none', () => {
    const out = sd.appendDecisionsToArchive('# State Archive\n', ['- only (2026-10-01)']);
    assert.ok(out.includes('## Decisions\n\n- only (2026-10-01)\n'));
  });
});

describe('state-digest: digest', () => {
  test('7. sections in order, decisions capped with the newest-of title, pending todos kept', () => {
    const content = stateWith(12).replace('## Session Continuity', '## Accumulated Context\n\n### Pending Todos\n\n- todo one\n\n## Session Continuity');
    const d = sd.digest(content, { decisions: 5 });
    const order = ['# Project State', '## Project Reference', '## Current Position', '## Blockers / Concerns', '## Session Continuity', '## Recent Decisions (newest 5 of 12', '### Pending Todos'];
    let last = -1;
    for (const h of order) {
      const i = d.indexOf(h);
      assert.ok(i > last, `${h} present and in order`);
      last = i;
    }
    assert.ok(d.includes('- **Decision 12 (2026-10-12)** — summary 12'));
    assert.ok(d.includes('- **Decision 8 (2026-10-08)** — summary 8'));
    assert.ok(!d.includes('Decision 7 ('), 'the sixth decision is not shown');
    assert.ok(!d.includes('sub-bullet of 12'), 'headlines only');
    assert.ok(d.includes('- todo one'));
    assert.ok(sd.digest(stateWith(3)).includes('## Recent Decisions\n'), 'no "newest of" title when all are shown');
  });

  test('8. condenses Objective complete runs and cuts long lines', () => {
    const long = 'x'.repeat(900);
    const content = [
      '# Project State', '', '## Current Position', '',
      '**Milestone:** v1',
      '**Objective complete:** 1 — one',
      '**Objective complete:** 2 — two',
      '**Objective complete:** 3.1 — three one',
      `**Status:** ${long}`,
      '',
    ].join('\n');
    const d = sd.digest(content);
    assert.ok(d.includes('**Objectives complete:** 1, 2, 3.1 (3;'));
    assert.ok(!d.includes('**Objective complete:** 1'));
    assert.ok(d.includes('**Status:** ' + 'x'.repeat(388) + ' …'), 'long line cut at 400 chars');
    assert.ok(d.length < content.length);
  });
});

function scratchProject(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-state-digest-'));
  const planning = path.join(dir, '.aoforge');
  fs.mkdirSync(planning, { recursive: true });
  fs.writeFileSync(path.join(planning, 'config.json'), JSON.stringify({ mode: 'yolo', aoforge: { version: '3.0.0', migrations_applied: [] } }, null, 2));
  fs.writeFileSync(path.join(planning, 'STATE.md'), stateWith(n));
  fs.writeFileSync(path.join(planning, 'STATE_ARCHIVE.md'), '# State Archive\n\n## Decisions\n\n- *(none yet)*\n\n## Performance Metrics\n\n| Objective | Duration | Tasks | Files |\n|---|---|---|---|\n');
  return dir;
}

function run(cwd, args) {
  const r = spawnSync(process.execPath, [DF_TOOLS, ...args], { cwd, encoding: 'utf8', env: { ...process.env, HOME: cwd, AOFORGE_SKIP_GH_GATE: '1' } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('state-digest: CLI', () => {
  test('9. state digest / rotate-decisions / load', () => {
    const dir = scratchProject(13);
    const d = run(dir, ['state', 'digest', '--raw']);
    assert.equal(d.code, 0, d.err);
    assert.ok(d.out.includes('## Recent Decisions (newest 5 of 13'));

    const dry = run(dir, ['state', 'rotate-decisions', '--dry-run']);
    assert.equal(dry.code, 0, dry.err);
    const dryJson = JSON.parse(dry.out);
    assert.equal(dryJson.moved, 3);
    assert.equal(dryJson.dry_run, true);
    assert.equal(sd.decisionEntries(fs.readFileSync(path.join(dir, '.aoforge', 'STATE.md'), 'utf8')).length, 13, 'dry run writes nothing');

    const real = run(dir, ['state', 'rotate-decisions', '--raw']);
    assert.equal(real.code, 0, real.err);
    assert.equal(real.out.trim(), '3');
    const state = fs.readFileSync(path.join(dir, '.aoforge', 'STATE.md'), 'utf8');
    const archive = fs.readFileSync(path.join(dir, '.aoforge', 'STATE_ARCHIVE.md'), 'utf8');
    assert.equal(sd.decisionEntries(state).length, 10);
    assert.ok(archive.includes(entry(1)) && archive.includes(entry(3)));
    assert.ok(archive.indexOf(entry(1)) < archive.indexOf(entry(3)), 'oldest first in the archive');
    assert.ok(!archive.includes('*(none yet)*'));

    const again = run(dir, ['state', 'rotate-decisions']);
    assert.equal(JSON.parse(again.out).moved, 0, 'idempotent');

    const load = run(dir, ['state', 'load']);
    assert.equal(load.code, 0, load.err);
    const payload = load.out.startsWith('@file:') ? JSON.parse(fs.readFileSync(load.out.slice('@file:'.length), 'utf8')) : JSON.parse(load.out);
    assert.equal('state_raw' in payload, false);
    assert.ok(payload.state_digest.includes('## Current Position'));
    assert.equal(payload.state_exists, true);

    const bad = run(dir, ['state', 'rotate-decisions', '--bogus']);
    assert.equal(bad.code, 1, 'unknown flag refused');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('10. migration 0015 detect/apply', () => {
    const m = require('./migrations/0015-rotate-state-decisions.cjs');
    const dir = scratchProject(12);
    const ctx = { projectRoot: dir, userHome: dir, pluginVersion: '3.0.0', dryRun: false, options: {} };
    assert.equal(m.detect(ctx).applies, true);
    const dryRes = m.apply({ ...ctx, dryRun: true });
    assert.deepEqual(dryRes.changed, ['.aoforge/STATE.md', '.aoforge/STATE_ARCHIVE.md']);
    assert.equal(sd.decisionEntries(fs.readFileSync(path.join(dir, '.aoforge', 'STATE.md'), 'utf8')).length, 12, 'dry run writes nothing');
    const res = m.apply(ctx);
    assert.deepEqual(res.changed, ['.aoforge/STATE.md', '.aoforge/STATE_ARCHIVE.md']);
    assert.match(res.notes, /moved 2 decisions/);
    assert.equal(m.detect(ctx).applies, false);
    assert.deepEqual(m.apply(ctx).changed, []);
    assert.equal(m.safety, 'auto');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('11. state advance-job rotates on the way through', () => {
    const dir = scratchProject(12);
    const sp = path.join(dir, '.aoforge', 'STATE.md');
    fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').replace('**Status:** Executing objective 7', '**Current Job:** 1\n**Total Jobs in Objective:** 3\n**Status:** Executing objective 7'));
    const r = run(dir, ['state', 'advance-job']);
    assert.equal(r.code, 0, r.err);
    assert.equal(sd.decisionEntries(fs.readFileSync(sp, 'utf8')).length, 10);
    assert.ok(fs.readFileSync(path.join(dir, '.aoforge', 'STATE_ARCHIVE.md'), 'utf8').includes(entry(1)));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
