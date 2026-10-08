'use strict';

/**
 * Tests for lib/gh-milestone-store.cjs (TRD 48-05, D-05): native GitHub milestones written directly and
 * idempotently (find-or-create by title, PATCH by number), and the <= 1,000-character description.
 *
 * Hermetic: the fake GitHub (`__fixtures__/gh-fake.cjs`) is installed through the gh-client seam, the clock
 * and sleep are fake (so pacing never waits), and HOME / outbox / cache dirs are temp dirs from
 * `hermeticEnv()`. Nothing here reaches GitHub or the real ~/.claude, and nothing binds a port.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = require('./gh-milestone-store.cjs');
const client = require('./gh-client.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');

const URL = 'https://github.com/o/r/wiki/Milestone-v1_3';

// ─── Description (test 6) ────────────────────────────────────────────────────

describe('milestoneDescription (test 6)', () => {
  test('6. a 3-paragraph entry gives its first paragraph, a blank line and the Full notes link', () => {
    const entry = [
      '## v1.3 Store Demo (Shipped: 2026-09-01)',
      '',
      'First paragraph line one.',
      'line two.',
      '',
      'Second paragraph.',
      '',
      'Third paragraph.',
      '',
    ].join('\n');
    assert.equal(store.milestoneDescription(entry, URL), `First paragraph line one.\nline two.\n\nFull notes: ${URL}`);
  });

  test('6b. no heading and CRLF: still the first paragraph; no link means no trailer', () => {
    assert.equal(store.milestoneDescription('Only one.\r\n\r\nTwo.', URL), `Only one.\n\nFull notes: ${URL}`);
    assert.equal(store.milestoneDescription('Only one.\n\nTwo.'), 'Only one.');
    assert.equal(store.milestoneDescription('', URL), `Full notes: ${URL}`);
  });

  test('6c. a 2,000+ character first paragraph is cut on a space with an ellipsis, total <= 1,000', () => {
    const para = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    assert.ok(para.length >= 2000);
    const desc = store.milestoneDescription(`## v1.3\n\n${para}\n\nSecond.`, URL);
    assert.equal(store.MILESTONE_DESC_MAX, 1000);
    assert.ok(desc.length <= 1000, `length ${desc.length}`);
    const trailer = `\n\nFull notes: ${URL}`;
    assert.ok(desc.endsWith(trailer));
    const body = desc.slice(0, -trailer.length);
    assert.ok(body.endsWith('…'), 'ends with an ellipsis before the link');
    const kept = body.slice(0, -1);
    assert.ok(para.startsWith(kept), 'the kept text is a prefix of the paragraph');
    assert.equal(para[kept.length], ' ', 'cut on a word boundary');
    assert.ok(desc.length > 900, 'the budget is used, not thrown away');
  });

  test('6d. milestonePage / milestonePageUrl name the wiki page through the gh-wiki table', () => {
    assert.equal(store.milestonePage('v1.3'), 'Milestone-v1_3');
    assert.equal(store.milestonePage('1.3'), 'Milestone-v1_3');
    assert.equal(store.milestonePage('banana'), null);
    assert.equal(store.milestonePageUrl('o/r', 'v1.3'), URL);
    assert.equal(store.milestonePageUrl('o/r', 'banana'), null);
  });
});

// ─── Remote writes (tests 7-12) ──────────────────────────────────────────────

describe('native milestone writes (tests 7-12)', () => {
  let envh;
  let project;
  let fake;
  let clock;

  const setup = (opts = {}) => {
    project = makeStoreProject(opts);
    fake = createFakeGitHub(project.fakeOptions);
    client._setRunGh(fake.runGh);
  };

  beforeEach(() => {
    envh = hermeticEnv();
    clock = { t: 1_000_000 };
    client._setNow(() => clock.t);
    client._setSleep((ms) => { clock.t += ms; });
  });
  afterEach(() => {
    client._resetClient();
    if (project) project.cleanup();
    project = null;
    envh.restore();
  });

  const milestoneWrites = () => fake.writes().filter((a) => a.some((t) => /milestones/.test(t)));

  test('7. an empty repo gets one POST; the same call again writes nothing', () => {
    setup();
    const r = store.upsertMilestone(project.root, { version: 'v1.3', description: 'first' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.created, true);
    assert.equal(r.updated, false);
    assert.equal(r.title, 'v1.3');
    assert.equal(typeof r.number, 'number');
    assert.deepEqual(r.warnings, []);
    assert.equal(milestoneWrites().length, 1);
    assert.equal(fake.milestones.length, 1);
    assert.equal(fake.milestones[0].description, 'first');

    const again = store.upsertMilestone(project.root, { version: '1.3', description: 'first' });
    assert.equal(again.ok, true);
    assert.equal(again.created, false);
    assert.equal(again.updated, false);
    assert.equal(again.number, r.number);
    assert.equal(milestoneWrites().length, 1, 'no write when nothing differs');
  });

  test('7b. the title honours github.milestone_prefix; a bad version or an oversized description is refused before any call', () => {
    setup();
    const cfgPath = path.join(project.root, '.planning', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    cfg.github.milestone_prefix = 'M-';
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const r = store.upsertMilestone(project.root, { version: 'v2.0', description: 'x' });
    assert.equal(r.title, 'M-2.0');
    assert.equal(fake.milestones[0].title, 'M-2.0');

    const before = fake.calls().length;
    assert.equal(store.upsertMilestone(project.root, { version: 'banana' }).ok, false);
    const big = store.upsertMilestone(project.root, { version: 'v2.0', description: 'x'.repeat(1001) });
    assert.equal(big.ok, false);
    assert.match(big.error, /1000|1,000/);
    assert.equal(store.upsertMilestone(project.root, { version: 'v2.0', state: 'done' }).ok, false);
    assert.equal(fake.calls().length, before, 'invalid input makes no gh call');
  });

  test('8. an existing milestone with a different description is PATCHed by NUMBER, only the changed field', () => {
    setup();
    fake.seedMilestone('v1.2', 'other');
    const n = fake.seedMilestone('v1.3', 'old');
    const r = store.upsertMilestone(project.root, { version: 'v1.3', description: 'new', state: 'open' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.created, false);
    assert.equal(r.updated, true);
    assert.equal(r.number, n);
    const writes = milestoneWrites();
    assert.equal(writes.length, 1);
    assert.ok(writes[0].includes('PATCH'));
    assert.ok(writes[0].includes(`repos/o/r/milestones/${n}`), 'addressed by number');
    assert.ok(!writes[0].some((t) => /milestones\/v1/.test(t)), 'never by title');
    assert.equal(fake.milestones.find((m) => m.number === n).description, 'new');
    assert.equal(fake.milestones.find((m) => m.title === 'v1.2').description, 'other');

    // due_on and state differences go in the same single PATCH
    const r2 = store.upsertMilestone(project.root, { version: 'v1.3', description: 'new', state: 'closed', due_on: '2026-12-31T00:00:00Z' });
    assert.equal(r2.updated, true);
    assert.equal(milestoneWrites().length, 2);
    const ms = fake.milestones.find((m) => m.number === n);
    assert.equal(ms.state, 'closed');
    assert.equal(ms.due_on, '2026-12-31T00:00:00Z');
  });

  test('9. a POST refused 422 already_exists (created after the list) resolves by re-listing, no error', () => {
    setup();
    let raced = false;
    client._setRunGh((args, opts) => {
      if (!raced && args.includes('POST')) {
        raced = true;
        fake.seedMilestone('v1.3', 'made elsewhere'); // another writer won the race
      }
      return fake.runGh(args, opts);
    });
    const r = store.upsertMilestone(project.root, { version: 'v1.3', description: 'made elsewhere' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.created, false);
    assert.equal(r.updated, false);
    assert.equal(r.number, fake.milestones[0].number);
    assert.equal(fake.milestones.length, 1, 'no duplicate');
    const lists = fake.calls().filter((a) => a.some((t) => /milestones\?state=all/.test(t)));
    assert.equal(lists.length, 2, 'listed, then re-listed after the 422');

    // the race winner's description differs: re-list then PATCH by number
    const r2Project = project;
    let raced2 = false;
    client._setRunGh((args, opts) => {
      if (!raced2 && args.includes('POST')) {
        raced2 = true;
        fake.seedMilestone('v1.4', 'theirs');
      }
      return fake.runGh(args, opts);
    });
    const r2 = store.upsertMilestone(r2Project.root, { version: 'v1.4', description: 'ours' });
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.equal(r2.created, false);
    assert.equal(r2.updated, true);
    assert.equal(fake.milestones.find((m) => m.title === 'v1.4').description, 'ours');
  });

  test('10. closeMilestone PATCHes state=closed by number; already closed writes nothing; missing is reported', () => {
    setup();
    const n = fake.seedMilestone('v1.3', 'd');
    const r = store.closeMilestone(project.root, 'v1.3');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.updated, true);
    assert.equal(r.number, n);
    const writes = milestoneWrites();
    assert.equal(writes.length, 1);
    assert.ok(writes[0].includes(`repos/o/r/milestones/${n}`));
    assert.equal(fake.milestones[0].state, 'closed');
    assert.ok(fake.milestones[0].closed_at);

    const again = store.closeMilestone(project.root, 'v1.3');
    assert.equal(again.ok, true);
    assert.equal(again.updated, false);
    assert.equal(milestoneWrites().length, 1, 'already closed: no write');

    const missing = store.closeMilestone(project.root, 'v9.1');
    assert.equal(missing.ok, false);
    assert.equal(missing.notFound, true);
    assert.equal(milestoneWrites().length, 1);
  });

  test('11. listMilestones paginates every page (open and closed) into the documented shape', () => {
    setup();
    for (let i = 0; i < 120; i++) fake.seedMilestone(`v1.${i}`, i % 2 ? null : `d${i}`);
    fake.runGh(['api', '-X', 'PATCH', 'repos/o/r/milestones/3', '-f', 'state=closed']);
    const r = store.listMilestones(project.root);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.milestones.length, 120);
    for (const m of r.milestones) {
      assert.deepEqual(Object.keys(m).sort(), ['closed_at', 'description', 'due_on', 'number', 'state', 'title']);
    }
    const closed = r.milestones.find((m) => m.number === 3);
    assert.equal(closed.state, 'closed');
    assert.ok(closed.closed_at);
    assert.equal(r.milestones.find((m) => m.number === 2).description, '', 'a null description reads as empty');
    const lists = fake.calls().filter((a) => a.some((t) => /milestones\?state=all/.test(t)));
    assert.equal(lists.length, 1);
    assert.ok(lists[0].includes('--paginate'));

    const found = store.findMilestone(project.root, 'v1.2');
    assert.equal(found.ok, true);
    assert.equal(found.title, 'v1.2');
    assert.equal(found.milestone.number, 3);
    const none = store.findMilestone(project.root, 'v7.7');
    assert.equal(none.ok, true);
    assert.equal(none.milestone, null);
  });

  test('12. github.enabled false is skipped with zero gh calls', () => {
    setup({ enabled: false });
    for (const r of [
      store.upsertMilestone(project.root, { version: 'v1.3', description: 'x' }),
      store.closeMilestone(project.root, 'v1.3'),
      store.listMilestones(project.root),
      store.findMilestone(project.root, 'v1.3'),
    ]) {
      assert.equal(r.ok, false);
      assert.equal(r.skipped, true);
    }
    assert.equal(fake.calls().length, 0);
  });

  test('12b. offline: every call is {ok:false, offline:true} naming offline, and nothing is written', () => {
    setup();
    fake.seedMilestone('v1.3', 'old');
    fake.setOffline(true);
    for (const r of [
      store.upsertMilestone(project.root, { version: 'v1.3', description: 'new' }),
      store.upsertMilestone(project.root, { version: 'v1.4', description: 'new' }),
      store.closeMilestone(project.root, 'v1.3'),
      store.listMilestones(project.root),
      store.findMilestone(project.root, 'v1.3'),
    ]) {
      assert.equal(r.ok, false);
      assert.equal(r.offline, true);
      assert.match(r.error, /offline/i);
    }
    assert.equal(fake.writes().length, 0, 'offline exits before any write');
    assert.equal(fake.milestones[0].description, 'old');
  });
});

// ─── Seam (gh only through gh-client) ────────────────────────────────────────

describe('gh-milestone-store source', () => {
  test('never spawns: every gh call goes through gh-client', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gh-milestone-store.cjs'), 'utf-8');
    assert.doesNotMatch(src, /child_process|spawnSync|execSync|execFile/);
    assert.match(src, /require\('\.\/gh-client\.cjs'\)/);
  });

  test('gh-milestone.cjs stays pure local I/O', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gh-milestone.cjs'), 'utf-8');
    assert.doesNotMatch(src, /gh-client|child_process/);
  });
});
