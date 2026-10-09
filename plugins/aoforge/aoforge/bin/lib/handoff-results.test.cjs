'use strict';

/**
 * Tests for handoff-results.cjs (TRD 73-02): the one library that delivers watcher results, exactly once and to
 * the right address. Hand-built fixtures only (handoff-fixtures.cjs); the clock is injected, never read.
 *
 * The library is required lazily so that, before it exists, each test fails on its own.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const {
  FIXED_NOW, makeHandoffProject, doneRecord, pendingRecord, writeDone, writePending, writePidFile, hookPayload,
} = require('./__fixtures__/handoff-fixtures.cjs');

const LIB_PATH = path.join(__dirname, 'handoff-results.cjs');
const L = () => require('./handoff-results.cjs');
const iso = (ms) => new Date(ms).toISOString();
const HOUR = 60 * 60 * 1000;

let project;
beforeEach(() => { project = makeHandoffProject(); });
afterEach(() => project.cleanup());

// ---------------------------------------------------------------------------
// 5. selectUnconsumed
// ---------------------------------------------------------------------------

describe('selectUnconsumed', () => {
  test('5: skips consumed, stale, malformed, claimed, odd-named and non-json files; sorts by completed_at', () => {
    writeDone(project, doneRecord({ id: 'h-late', completed_at: iso(FIXED_NOW - 1000) }));
    writeDone(project, doneRecord({ id: 'h-early', completed_at: iso(FIXED_NOW - 5000) }));
    writeDone(project, doneRecord({ id: 'h-consumed', consumed: true }));
    writeDone(project, doneRecord({ id: 'h-old', completed_at: iso(FIXED_NOW - 2 * HOUR) }));
    writeDone(project, doneRecord({ id: 'h-claimed' }));
    fs.writeFileSync(path.join(project.doneDir, 'h-claimed.claim'), '{}');
    fs.writeFileSync(path.join(project.doneDir, 'h-bad.json'), 'not json');
    fs.writeFileSync(path.join(project.doneDir, 'h-note.txt'), 'not a record');
    fs.writeFileSync(path.join(project.doneDir, 'h-early.json.tmp'), '{}');
    fs.writeFileSync(
      path.join(project.doneDir, 'odd name.json'),
      JSON.stringify(doneRecord({ id: 'odd name' })),
    );

    const recs = L().selectUnconsumed(project.doneDir, { now: FIXED_NOW, ttl: HOUR });
    assert.deepEqual(recs.map((r) => r.id), ['h-early', 'h-late']);
    assert.equal(recs[0]._path, path.join(project.doneDir, 'h-early.json'));
  });

  test('5b: with no options the TTL comes from the environment default', () => {
    writeDone(project, doneRecord({ id: 'h-now', completed_at: new Date().toISOString() }));
    const recs = L().selectUnconsumed(project.doneDir);
    assert.deepEqual(recs.map((r) => r.id), ['h-now']);
  });
});

// ---------------------------------------------------------------------------
// 6. isAddressedTo
// ---------------------------------------------------------------------------

describe('isAddressedTo', () => {
  const main = hookPayload('PostToolUse');
  const sub = hookPayload('PostToolUse', { agent_id: 'a1' });
  const cases = [
    ['no session_id + main-loop payload', {}, main, true],
    ['no session_id + subagent payload', {}, sub, false],
    ['same session, both main loop', { session_id: 's-fixture' }, main, true],
    ['same session, both agent a1', { session_id: 's-fixture', agent_id: 'a1' }, sub, true],
    ['same session, record main loop, payload agent a1', { session_id: 's-fixture' }, sub, false],
    ['same session, record agent a1, payload main loop', { session_id: 's-fixture', agent_id: 'a1' }, main, false],
    ['same session, different agents', { session_id: 's-fixture', agent_id: 'a2' }, sub, false],
    ['other session', { session_id: 's-other' }, main, false],
    ['empty agent_id counts as main loop', { session_id: 's-fixture', agent_id: '' }, main, true],
  ];
  for (const [name, record, payload, want] of cases) {
    test(`6: ${name} -> ${want}`, () => {
      assert.equal(L().isAddressedTo(doneRecord(record), payload), want);
    });
  }
});

// ---------------------------------------------------------------------------
// 7-8. claimRecord
// ---------------------------------------------------------------------------

describe('claimRecord', () => {
  test('7: the first claim wins, the second loses, and the claim file records who and when', () => {
    assert.equal(L().claimRecord(project.doneDir, 'h-fixture1', { by: 'test' }), true);
    assert.equal(L().claimRecord(project.doneDir, 'h-fixture1', { by: 'test' }), false);
    const claim = JSON.parse(fs.readFileSync(path.join(project.doneDir, 'h-fixture1.claim'), 'utf8'));
    assert.deepEqual(Object.keys(claim).sort(), ['by', 'claimed_at', 'pid']);
    assert.equal(claim.by, 'test');
    assert.equal(claim.pid, process.pid);
    assert.ok(!Number.isNaN(Date.parse(claim.claimed_at)));
  });

  test('7b: an error other than EEXIST returns false and never throws', () => {
    assert.equal(L().claimRecord(path.join(project.root, 'missing'), 'h-fixture1', { by: 'test' }), false);
    assert.equal(L().claimRecord(project.doneDir, '../escape', { by: 'test' }), false);
    assert.equal(L().claimRecord(project.doneDir, '', { by: 'test' }), false);
    assert.equal(L().claimRecord(null, 'h-fixture1'), false);
  });

  test('7c: a read-only directory returns false', { skip: typeof process.getuid === 'function' && process.getuid() === 0 }, () => {
    fs.chmodSync(project.doneDir, 0o500);
    try {
      assert.equal(L().claimRecord(project.doneDir, 'h-fixture1', { by: 'test' }), false);
    } finally {
      fs.chmodSync(project.doneDir, 0o700);
    }
  });

  test('8: of three processes claiming one id at the same moment, exactly one wins', async () => {
    const startFile = path.join(project.root, 'start');
    const script = [
      "const fs = require('fs');",
      'const [lib, doneDir, start] = process.argv.slice(1);',
      'const nap = new Int32Array(new SharedArrayBuffer(4));',
      'while (!fs.existsSync(start)) Atomics.wait(nap, 0, 0, 2);',
      "process.stdout.write(String(require(lib).claimRecord(doneDir, 'h-race', { by: 'child' })));",
    ].join('\n');
    const children = [0, 1, 2].map(() => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script, LIB_PATH, project.doneDir, startFile]);
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`child exited ${code}: ${err}`))));
    }));
    // Give every child time to start and block on the start file, then release them together.
    await new Promise((r) => setTimeout(r, 400));
    fs.writeFileSync(startFile, 'go');
    const outputs = (await Promise.all(children)).sort();
    assert.deepEqual(outputs, ['false', 'false', 'true']);
  });
});

// ---------------------------------------------------------------------------
// 9. markConsumed
// ---------------------------------------------------------------------------

describe('markConsumed', () => {
  test('9: writes consumed, consumed_at and consumed_by through tmp + rename and keeps _path out of the file', () => {
    const file = writeDone(project, doneRecord({ id: 'h-fixture1' }));
    const recs = L().selectUnconsumed(project.doneDir, { now: FIXED_NOW, ttl: HOUR });
    L().markConsumed(recs, { by: 'test' });

    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(after.consumed, true);
    assert.equal(after.consumed_by, 'test');
    assert.ok(!Number.isNaN(Date.parse(after.consumed_at)));
    assert.equal(after._path, undefined, 'the in-memory _path is never persisted');
    assert.equal(after.stdout, 'fixture\n', 'the rest of the record is preserved');
    assert.equal(fs.existsSync(`${file}.tmp`), false, 'the tmp file was renamed away');
  });

  test('9b: a record that cannot be written does not throw', () => {
    assert.doesNotThrow(() => L().markConsumed([{ id: 'h-x', _path: path.join(project.root, 'missing', 'h-x.json') }], { by: 'test' }));
  });
});

// ---------------------------------------------------------------------------
// 10. renderRecord: byte-identical to route-results today, plus the `output` field
// ---------------------------------------------------------------------------

describe('renderRecord', () => {
  const HEAD = '### h-fixture1 — `echo fixture` — ';
  const DONE_AT = '\n*completed 2026-10-09T11:59:59.000Z*\n';

  test('10: done / failed / rejected / timeout / error / no-output strings are byte-identical to route-results', () => {
    const { renderRecord } = L();
    assert.equal(
      renderRecord(doneRecord()),
      `${HEAD}✓ exit 0${DONE_AT}\nstdout:\n\`\`\`\nfixture\n\n\`\`\``,
    );
    assert.equal(
      renderRecord(doneRecord({ status: 'failed', exit_code: 2, stdout: '', stderr: 'boom\n' })),
      `${HEAD}✗ exit 2${DONE_AT}\nstderr:\n\`\`\`\nboom\n\n\`\`\``,
    );
    assert.equal(
      renderRecord(doneRecord({ status: 'rejected', exit_code: -2, stdout: '', stderr: 'denied by guard' })),
      `${HEAD}✗ rejected by daemon${DONE_AT}\n**The daemon refused this command.** Do NOT retry it as-is — ` +
        'its allowlist excluded it. If the user genuinely needs this run, ask them to run it manually or extend ' +
        'the allowlist.\n\n```\ndenied by guard\n```',
    );
    assert.equal(
      renderRecord(doneRecord({ status: 'timeout', exit_code: -1, stdout: '', stderr: '' })),
      `${HEAD}✗ timeout${DONE_AT}\n**Command exceeded the daemon timeout.** Consider whether to retry, increase ` +
        '`timeout_ms` on the next handoff, or surface the slow operation to the user.',
    );
    assert.equal(
      renderRecord(doneRecord({ status: 'error', exit_code: -3, stdout: '', stderr: 'dispatch failed' })),
      `${HEAD}✗ daemon error${DONE_AT}\nstderr:\n\`\`\`\ndispatch failed\n\`\`\``,
    );
    assert.equal(
      renderRecord(doneRecord({ stdout: '', stderr: '' })),
      `${HEAD}✓ exit 0${DONE_AT}\n*(no output captured)*`,
    );
  });

  test('10b: a record written by `handoff complete` (output field, no stdout) renders its output', () => {
    const rec = doneRecord({ output: 'logged in\n' });
    delete rec.stdout;
    delete rec.stderr;
    const out = L().renderRecord(rec);
    assert.match(out, /```\nlogged in\n/);
    assert.doesNotMatch(out, /no output captured/);
  });

  test('10c: stdout wins over output when both are present', () => {
    const out = L().renderRecord(doneRecord({ stdout: 'from stdout\n', output: 'from output\n' }));
    assert.match(out, /from stdout/);
    assert.doesNotMatch(out, /from output/);
  });

  test('10d: renderResults of one small record is byte-identical to route-results', () => {
    assert.equal(
      L().renderResults([doneRecord()]),
      '## Deferred command results\n\n1 command the watcher ran out-of-band since your last turn. Use these to ' +
        'continue any work that was deferred.\n\n' +
        `${HEAD}✓ exit 0${DONE_AT}\nstdout:\n\`\`\`\nfixture\n\n\`\`\`\n`,
    );
  });
});

// ---------------------------------------------------------------------------
// 11. renderResults budget
// ---------------------------------------------------------------------------

describe('renderResults budget', () => {
  const big = (id, ch) => doneRecord({ id, stdout: ch.repeat(4000) });
  const POINTER = (id) => new RegExp(`node ~/\\.claude/aoforge/bin/aof-tools\\.cjs handoff get ${id}$`);

  test('11: three records of 4,000-character stdout fit under 9,000 characters; each cut record ends with the pointer', () => {
    const out = L().renderResults([big('h-fixture1', 'a'), big('h-fixture2', 'b'), big('h-fixture3', 'c')]);
    assert.ok(out.length < L().MAX_RENDER_CHARS, `rendered ${out.length} characters`);
    const sections = out.split(/^### /m).slice(1);
    assert.equal(sections.length, 3);
    ['h-fixture1', 'h-fixture2', 'h-fixture3'].forEach((id, i) => {
      assert.match(sections[i].trimEnd(), POINTER(id));
    });
  });

  test('11b: a record that already fits is left whole while the large ones are cut', () => {
    const out = L().renderResults([
      doneRecord({ id: 'h-small' }), big('h-fixture2', 'b'), big('h-fixture3', 'c'), big('h-fixture4', 'd'),
    ]);
    assert.ok(out.length < L().MAX_RENDER_CHARS, `rendered ${out.length} characters`);
    const sections = out.split(/^### /m).slice(1);
    assert.equal(sections.length, 4);
    assert.doesNotMatch(sections[0], /handoff get/);
    assert.match(sections[0], /fixture\n/);
    ['h-fixture2', 'h-fixture3', 'h-fixture4'].forEach((id, i) => {
      assert.match(sections[i + 1].trimEnd(), POINTER(id));
    });
  });

  test('11c: when even the shortest renderings do not fit, the overflow is counted and named, not dropped', () => {
    const records = [];
    for (let i = 0; i < 80; i++) records.push(big(`h-many${String(i).padStart(2, '0')}`, 'x'));
    const out = L().renderResults(records);
    assert.ok(out.length < L().MAX_RENDER_CHARS, `rendered ${out.length} characters`);
    const shown = out.split(/^### /m).length - 1;
    const note = out.match(/(\d+) more results not shown\. Read each with node ~\/\.claude\/aoforge\/bin\/aof-tools\.cjs handoff get <id>: (h-many\d\d)/);
    assert.ok(note, 'a closing note names the results that are not shown');
    assert.equal(shown + Number(note[1]), 80, 'every record is either shown or counted in the note');
    assert.equal(note[2], `h-many${String(shown).padStart(2, '0')}`, 'the note starts at the first record not shown');
    assert.match(out, /list them with node ~\/\.claude\/aoforge\/bin\/aof-tools\.cjs handoff list/);
  });
});

// ---------------------------------------------------------------------------
// 12. takeResults
// ---------------------------------------------------------------------------

describe('takeResults', () => {
  function seed() {
    writeDone(project, doneRecord({ id: 'h-main', completed_at: iso(FIXED_NOW - 4000) }));
    writeDone(project, doneRecord({ id: 'h-mine', session_id: 's-fixture', completed_at: iso(FIXED_NOW - 3000) }));
    writeDone(project, doneRecord({ id: 'h-sub', session_id: 's-fixture', agent_id: 'a1', completed_at: iso(FIXED_NOW - 2000) }));
    writeDone(project, doneRecord({ id: 'h-other', session_id: 's-other', completed_at: iso(FIXED_NOW - 1000) }));
  }
  const read = (id) => JSON.parse(fs.readFileSync(path.join(project.doneDir, `${id}.json`), 'utf8'));
  const claimed = (id) => fs.existsSync(path.join(project.doneDir, `${id}.claim`));

  test('12: mode addressed walks up from a nested cwd, takes only addressed records, claims and marks them', () => {
    seed();
    const nested = path.join(project.root, 'a', 'b');
    fs.mkdirSync(nested, { recursive: true });
    const got = L().takeResults({
      cwd: nested, payload: hookPayload('PostToolUse'), mode: 'addressed', by: 'test', now: FIXED_NOW,
    });
    assert.deepEqual(got.records.map((r) => r.id), ['h-main', 'h-mine']);
    assert.match(got.text, /## Deferred command results/);
    assert.match(got.text, /h-main/);
    assert.match(got.text, /h-mine/);
    assert.doesNotMatch(got.text, /h-sub|h-other/);

    for (const id of ['h-main', 'h-mine']) {
      assert.equal(claimed(id), true);
      assert.equal(read(id).consumed, true);
      assert.equal(read(id).consumed_by, 'test');
    }
    for (const id of ['h-sub', 'h-other']) {
      assert.equal(claimed(id), false, `${id} is not addressed to this payload`);
      assert.equal(read(id).consumed, false);
    }

    assert.equal(
      L().takeResults({ cwd: nested, payload: hookPayload('PostToolUse'), mode: 'addressed', by: 'test', now: FIXED_NOW }),
      null,
      'nothing left to take',
    );
  });

  test('12b: a subagent payload takes its own record and not the main loop\'s', () => {
    seed();
    const got = L().takeResults({
      cwd: project.root, payload: hookPayload('PostToolUse', { agent_id: 'a1' }), mode: 'addressed', by: 'test', now: FIXED_NOW,
    });
    assert.deepEqual(got.records.map((r) => r.id), ['h-sub']);
  });

  test('12c: mode all ignores addressing', () => {
    seed();
    const got = L().takeResults({ cwd: project.root, payload: hookPayload('UserPromptSubmit'), mode: 'all', by: 'test', now: FIXED_NOW });
    assert.deepEqual(got.records.map((r) => r.id), ['h-main', 'h-mine', 'h-sub', 'h-other']);
  });

  test('12d: a record already claimed by someone else is not taken', () => {
    seed();
    assert.equal(L().claimRecord(project.doneDir, 'h-main', { by: 'someone-else' }), true);
    const got = L().takeResults({ cwd: project.root, payload: hookPayload('PostToolUse'), mode: 'addressed', by: 'test', now: FIXED_NOW });
    assert.deepEqual(got.records.map((r) => r.id), ['h-mine']);
  });

  test('12e: null when there is no handoff directory or nothing fresh', () => {
    const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-results-bare-')));
    try {
      assert.equal(L().takeResults({ cwd: bare, mode: 'all', by: 'test' }), null);
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
    assert.equal(L().takeResults({ cwd: project.root, mode: 'all', by: 'test', now: FIXED_NOW }), null);
  });

  test('12f: the TTL environment variable is honoured through env', () => {
    writeDone(project, doneRecord({ id: 'h-aged', completed_at: iso(FIXED_NOW - 5000) }));
    const none = L().takeResults({
      cwd: project.root, mode: 'all', by: 'test', now: FIXED_NOW, env: { AOFORGE_HANDOFF_RESULT_TTL_MS: '1000' },
    });
    assert.equal(none, null);
    const some = L().takeResults({
      cwd: project.root, mode: 'all', by: 'test', now: FIXED_NOW, env: { AOFORGE_HANDOFF_RESULT_TTL_MS: '10000' },
    });
    assert.deepEqual(some.records.map((r) => r.id), ['h-aged']);
  });
});

// ---------------------------------------------------------------------------
// 13. pendingAddressedTo
// ---------------------------------------------------------------------------

describe('pendingAddressedTo', () => {
  test('13: fresh pending records addressed to the payload; other sessions, agents, aged and malformed dropped', () => {
    writePending(project, pendingRecord({ id: 'h-p-main', created_at: iso(FIXED_NOW - 3000) }));
    writePending(project, pendingRecord({ id: 'h-p-mine', session_id: 's-fixture', created_at: iso(FIXED_NOW - 2000) }));
    writePending(project, pendingRecord({ id: 'h-p-sub', session_id: 's-fixture', agent_id: 'a1', created_at: iso(FIXED_NOW - 1500) }));
    writePending(project, pendingRecord({ id: 'h-p-other', session_id: 's-other', created_at: iso(FIXED_NOW - 1000) }));
    writePending(project, pendingRecord({ id: 'h-p-old', session_id: 's-fixture', created_at: iso(FIXED_NOW - 2 * HOUR) }));
    fs.writeFileSync(path.join(project.pendingDir, 'h-p-bad.json'), 'not json');

    const main = L().pendingAddressedTo(project.handoffDir, hookPayload('Stop'), { now: FIXED_NOW, maxAgeMs: HOUR });
    assert.deepEqual(main.map((r) => r.id), ['h-p-main', 'h-p-mine']);

    const sub = L().pendingAddressedTo(project.handoffDir, hookPayload('Stop', { agent_id: 'a1' }), { now: FIXED_NOW, maxAgeMs: HOUR });
    assert.deepEqual(sub.map((r) => r.id), ['h-p-sub']);
  });

  test('13b: no pending directory is an empty list', () => {
    assert.deepEqual(L().pendingAddressedTo(path.join(project.root, 'missing'), hookPayload('Stop')), []);
  });
});

// ---------------------------------------------------------------------------
// 14. watcherWatching
// ---------------------------------------------------------------------------

describe('watcherWatching', () => {
  let scratch;
  beforeEach(() => { scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-pid-'))); });
  afterEach(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const envFor = (file) => ({ AOFORGE_HANDOFF_PID_FILE: file });

  test('14: no pid file -> false', () => {
    assert.equal(L().watcherWatching(project.root, { env: envFor(path.join(scratch, 'absent.pid')) }), false);
  });

  test('14b: a live pid that lists the root -> true; one that lists another path -> false', () => {
    const live = writePidFile(scratch, { pid: process.pid, watching: [project.root] });
    assert.equal(L().watcherWatching(project.root, { env: envFor(live) }), true);
    const elsewhere = writePidFile(scratch, { pid: process.pid, watching: ['/elsewhere'] });
    assert.equal(L().watcherWatching(project.root, { env: envFor(elsewhere) }), false);
  });

  test('14c: a dead pid -> false', () => {
    const gone = spawnSync(process.execPath, ['-e', '']).pid; // exited by the time spawnSync returns
    const file = writePidFile(scratch, { pid: gone, watching: [project.root] });
    assert.equal(L().watcherWatching(project.root, { env: envFor(file) }), false);
  });

  test('14d: the pre-rename daemon\'s pid file never counts', () => {
    writePidFile(scratch, { pid: process.pid, watching: [project.root], legacy: true });
    assert.equal(L().watcherWatching(project.root, { env: { HOME: scratch } }), false);
  });

  test('14e: a root given through a symlink still matches, whichever side holds the link', () => {
    const link = path.join(scratch, 'link');
    fs.symlinkSync(project.root, link);
    const real = writePidFile(scratch, { pid: process.pid, watching: [project.root] });
    assert.equal(L().watcherWatching(link, { env: envFor(real) }), true);
    const viaLink = writePidFile(scratch, { pid: process.pid, watching: [link] });
    assert.equal(L().watcherWatching(project.root, { env: envFor(viaLink) }), true);
  });
});

// ---------------------------------------------------------------------------
// Fail open
// ---------------------------------------------------------------------------

describe('fail open', () => {
  test('15: no exported function throws on bad input', () => {
    const lib = L();
    assert.doesNotThrow(() => {
      assert.deepEqual(lib.selectUnconsumed('/nonexistent/done'), []);
      assert.equal(lib.isAddressedTo(null, null), false);
      assert.equal(lib.truncate(null, 5), '');
      assert.equal(typeof lib.renderRecord({}), 'string');
      assert.equal(typeof lib.renderResults([]), 'string');
      lib.markConsumed(null);
      lib.markConsumed([null, undefined, {}]);
      assert.equal(lib.takeResults({ cwd: '/nonexistent/dir', mode: 'all' }), null);
      assert.equal(lib.takeResults(), null);
      assert.deepEqual(lib.pendingAddressedTo('/nonexistent/handoff', null), []);
      assert.equal(lib.watcherWatching(null), false);
      assert.equal(lib.findHandoffDir('/'), null);
      assert.equal(lib.isStale({ completed_at: 'garbage' }, FIXED_NOW, HOUR), false);
    });
  });

  test('16: exports the documented surface', () => {
    const lib = L();
    for (const name of [
      'HANDOFF_DIR', 'DEFAULT_TTL_MS', 'MAX_OUTPUT_CHARS', 'MAX_RENDER_CHARS', 'findHandoffDir', 'ttlMs', 'isStale',
      'selectUnconsumed', 'isAddressedTo', 'claimRecord', 'markConsumed', 'truncate', 'renderRecord', 'renderResults',
      'takeResults', 'pendingAddressedTo', 'watcherWatching',
    ]) {
      assert.notEqual(lib[name], undefined, `${name} is exported`);
    }
    assert.equal(lib.HANDOFF_DIR, '.aoforge-handoff');
    assert.equal(lib.DEFAULT_TTL_MS, HOUR);
    assert.equal(lib.MAX_OUTPUT_CHARS, 4000);
    assert.equal(lib.MAX_RENDER_CHARS, 9000);
  });
});
