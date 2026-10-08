'use strict';

// planning-drafts-cli.test.cjs (TRD 69-01, tests 1-6) — spawned aof-tools against a hand-built local-mode project:
// `planning draft` reseeds a stale draft and `doc put` refuses one. The fixture's env carries an isolated TMPDIR and
// HOME, so no draft lands in the real temp tree. The tests share one project and run in order: each step builds on
// the state the one before it left (the draft, the live file).
//
//   1 a stale draft is refused, the live file untouched    2 `planning draft` reseeds it, stdout is the path only
//   3 the reseeded draft publishes                         4 the same unchanged draft publishes again
//   5 --raw reports seeded / reseeded / stale_copy         6 stdin is never checked

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { makeDraftProject } = require('./__fixtures__/draft-fixtures.cjs');

const REL = 'PROJECT.md';
const read = (file) => fs.readFileSync(file, 'utf8');

describe('planning draft / doc put: a stale draft', () => {
  let P;
  let draft;
  let foreign;

  before(() => {
    P = makeDraftProject();
    foreign = path.join(P.home, 'elsewhere.md');
    fs.writeFileSync(foreign, '# Project\n\nchanged by someone else\n');
  });
  after(() => P.cleanup());

  test('1. doc put refuses a stale draft, names the fix, and leaves the live file as it was', () => {
    const seeded = P.run(['planning', 'draft', REL]);
    assert.equal(seeded.status, 0, seeded.stderr);
    draft = seeded.stdout.trim();
    assert.ok(path.isAbsolute(draft));
    fs.writeFileSync(draft, 'my edit\n');

    // Someone else publishes first (a file outside the drafts tree: published as always).
    const other = P.run(['doc', 'put', REL, '--from', foreign]);
    assert.equal(other.status, 0, other.stderr);
    assert.equal(read(P.livePath(REL)), read(foreign));

    const res = P.run(['doc', 'put', REL, '--from', draft]);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /doc put: refused \(stale draft\)/);
    assert.match(res.stderr, /aof-tools planning draft PROJECT\.md/);
    assert.ok(res.stderr.includes(`${draft}.stale`), res.stderr);
    assert.equal(read(P.livePath(REL)), read(foreign), 'the live file is byte-identical');
  });

  test('2. planning draft reseeds the stale draft: stdout is only the path, the notice is on stderr', () => {
    const res = P.run(['planning', 'draft', REL]);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, `${draft}\n`);
    assert.match(res.stderr, /reseeded/);
    assert.ok(res.stderr.includes(`${draft}.stale`), res.stderr);
    assert.equal(read(draft), read(P.livePath(REL)));
    assert.equal(read(`${draft}.stale`), 'my edit\n');
  });

  test('3. the reseeded draft publishes', () => {
    fs.writeFileSync(draft, '# Project\n\nmy reapplied edit\n');
    const res = P.run(['doc', 'put', REL, '--from', draft]);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.equal(read(P.livePath(REL)), '# Project\n\nmy reapplied edit\n');
  });

  test('4. the same unchanged draft publishes again (the base followed the published text)', () => {
    const res = P.run(['doc', 'put', REL, '--from', draft]);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.equal(read(P.livePath(REL)), '# Project\n\nmy reapplied edit\n');
  });

  test('5. --raw reports seeded, reseeded and stale_copy', () => {
    P.setLive('ROADMAP.md', '# Roadmap\n');
    const fresh = P.run(['planning', 'draft', 'ROADMAP.md', '--raw']);
    assert.equal(fresh.status, 0, fresh.stderr);
    const f = JSON.parse(fresh.stdout);
    assert.equal(f.ok, true);
    assert.equal(f.rel, 'ROADMAP.md');
    assert.ok(path.isAbsolute(f.path));
    assert.equal(f.seeded, true);
    assert.equal(f.reseeded, false);
    assert.equal(f.stale_copy, null);

    const again = JSON.parse(P.run(['planning', 'draft', REL, '--raw']).stdout);
    assert.equal(again.path, draft);
    assert.equal(again.seeded, false);
    assert.equal(again.reseeded, false);
    assert.equal(again.stale_copy, null);

    P.setLive(REL, '# Project\n\nchanged again\n');
    const re = P.run(['planning', 'draft', REL, '--raw']);
    assert.equal(re.status, 0, re.stderr);
    const r = JSON.parse(re.stdout);
    assert.equal(r.ok, true);
    assert.equal(r.seeded, false);
    assert.equal(r.reseeded, true);
    assert.equal(r.stale_copy, `${draft}.stale`);
  });

  test('6. stdin is never checked: the live file changed and doc put --from - still publishes', () => {
    P.setLive(REL, '# Project\n\nchanged behind the scenes\n');
    const res = P.run(['doc', 'put', REL, '--from', '-'], { input: '# Project\n\nfrom stdin\n' });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.equal(read(P.livePath(REL)), '# Project\n\nfrom stdin\n');
  });
});
