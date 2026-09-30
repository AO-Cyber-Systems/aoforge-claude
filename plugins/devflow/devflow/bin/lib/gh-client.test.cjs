'use strict';

/**
 * Tests for lib/gh-client.cjs (TRD 46-01): the one seam every DevFlow `gh` call goes through.
 *
 * Hermetic: every test injects a fake runner (`_setRunGh`), a fake clock (`_setNow`) and a
 * recording sleep (`_setSleep`). Nothing here reaches GitHub, sleeps for real, or reads the
 * real ~/.claude. Fixtures are hand-built response objects.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const client = require('./gh-client.cjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Install a fake clock + recording sleep. `t` advances only when sleep is called. */
function harness(startMs = 0) {
  const h = { t: startMs, sleeps: [], calls: [] };
  client._setNow(() => h.t);
  client._setSleep((ms) => {
    h.sleeps.push(ms);
    h.t += ms;
  });
  return h;
}

/**
 * Install a scripted fake runner. Responses are consumed in order; the last one repeats.
 * Every call is recorded with the fake-clock time it happened at.
 */
function script(h, responses) {
  let i = 0;
  const fake = (args, opts) => {
    h.calls.push({ args, opts, at: h.t });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return { ...r };
  };
  client._setRunGh(fake);
  return fake;
}

const OK = { ok: true, status: 0, stdout: '{}', stderr: '' };
const SECONDARY = (stdout = '') => ({
  ok: false,
  status: 1,
  stdout,
  stderr: 'HTTP 403: You have exceeded a secondary rate limit',
});

afterEach(() => {
  client._resetClient();
});

// ─── Seam (tests 1-2) ────────────────────────────────────────────────────────

describe('seam', () => {
  it('1. _setRunGh(fake) routes ghRead/ghWrite to the fake; _setRunGh(null) restores the spawn runner', () => {
    const h = harness();
    const fake = script(h, [OK]);

    client.ghRead(['issue', 'view', '1']);
    client.ghWrite(['issue', 'create', '--title', 't']);
    assert.deepEqual(
      h.calls.map((c) => c.args),
      [['issue', 'view', '1'], ['issue', 'create', '--title', 't']],
    );
    assert.equal(typeof fake, 'function');

    // Restore: the default runner is now live again. Point PATH at a directory that cannot hold
    // `gh` so this stays hermetic and exercises the ENOENT path of the default runner.
    client._setRunGh(null);
    const before = h.calls.length;
    const r = client._runGh(['--version'], { env: { PATH: '/nonexistent-gh-client-test-dir' } });
    assert.equal(h.calls.length, before, 'fake must no longer be called after _setRunGh(null)');
    assert.equal(r.ok, false);
    assert.equal(r.status, null);
    assert.match(r.stderr, /gh: command not found/);
  });

  it('2. the exported _runGh wrapper picks up an injection made after require', () => {
    const held = client._runGh; // a consumer that captured the export before any injection
    const calls = [];
    client._setRunGh((args) => {
      calls.push(args);
      return { ok: true, status: 0, stdout: 'via-fake', stderr: '' };
    });
    const r = held(['auth', 'status']);
    assert.equal(r.stdout, 'via-fake');
    assert.deepEqual(calls, [['auth', 'status']]);
  });
});

// ─── Write classification (tests 3-4) ────────────────────────────────────────

describe('isWriteArgs', () => {
  it('3. classifies mutating invocations as writes', () => {
    const writes = [
      ['issue', 'create', '--title', 't'],
      ['issue', 'edit', '1', '--body', 'b'],
      ['issue', 'comment', '1', '--body', 'x'],
      ['issue', 'close', '1'],
      ['issue', 'reopen', '1'],
      ['label', 'create', 'bug'],
      ['release', 'create', 'v1.0.0'],
      ['release', 'edit', 'v1.0.0'],
      ['api', 'repos/o/r/issues', '-X', 'POST'],
      ['api', 'repos/o/r/issues/1', '--method', 'PATCH'],
      ['api', 'repos/o/r/labels/x', '-X', 'PUT'],
      ['api', 'repos/o/r/labels/x', '-X', 'DELETE'],
      ['api', 'repos/o/r/issues', '--method=POST'],
      ['api', 'repos/o/r/issues', '-f', 'title=x'],
      ['api', 'repos/o/r/issues', '-F', 'n=1'],
      ['api', 'repos/o/r/issues', '--raw-field', 'title=x'],
      ['api', 'graphql', '-f', 'query=mutation { addStar(input:{starrableId:"x"}) { clientMutationId } }'],
    ];
    for (const args of writes) {
      assert.equal(client.isWriteArgs(args), true, `expected write: ${args.join(' ')}`);
    }
  });

  it('4. classifies reads (including GraphQL queries and explicit GET) as not-writes', () => {
    const reads = [
      ['issue', 'view', '1'],
      ['issue', 'list'],
      ['api', 'repos/o/r/issues/1/comments'],
      ['api', 'graphql', '-f', 'query=query{viewer{login}}'],
      ['api', 'graphql', '-f', 'query=query($o:String!){repository(owner:$o){id}}', '-F', 'o=acme'],
      ['auth', 'status'],
      ['--version'],
      ['release', 'view', 'v1.0.0'],
      ['api', 'repos/o/r/issues', '-f', 'per_page=1', '-X', 'GET'],
      ['api', '--method', 'GET', 'repos/o/r/issues', '-f', 'state=open'],
    ];
    for (const args of reads) {
      assert.equal(client.isWriteArgs(args), false, `expected read: ${args.join(' ')}`);
    }
  });
});

// ─── Pacing (tests 5-7) ──────────────────────────────────────────────────────

describe('ghWrite pacing', () => {
  it('5. three consecutive writes are at least 1000 ms apart on the injected clock', () => {
    const h = harness();
    script(h, [OK]);
    client.ghWrite(['issue', 'create', '--title', 'a']);
    client.ghWrite(['issue', 'create', '--title', 'b']);
    client.ghWrite(['issue', 'create', '--title', 'c']);
    assert.equal(h.calls.length, 3);
    assert.ok(h.calls[1].at - h.calls[0].at >= client.MIN_WRITE_INTERVAL_MS);
    assert.ok(h.calls[2].at - h.calls[1].at >= client.MIN_WRITE_INTERVAL_MS);
    assert.equal(client.MIN_WRITE_INTERVAL_MS, 1000);
  });

  it('6. a ghRead between writes is not delayed and does not reset the write timer', () => {
    const h = harness();
    script(h, [OK]);
    client.ghWrite(['issue', 'create', '--title', 'a']); // at t=0
    h.t = 600;
    client.ghRead(['issue', 'view', '1']); // must run at 600 with no sleep
    assert.deepEqual(h.sleeps, []);
    assert.equal(h.calls[1].at, 600);
    client.ghWrite(['issue', 'create', '--title', 'b']);
    // The timer still counts from the first write (t=0), so only 400 ms remain.
    assert.deepEqual(h.sleeps, [400]);
    assert.equal(h.calls[2].at, 1000);
  });

  it('7. writes past WRITE_BUDGET_PER_RUN return a budget error without calling gh', () => {
    const h = harness();
    script(h, [OK]);
    assert.equal(client.WRITE_BUDGET_PER_RUN, 450);
    for (let i = 0; i < client.WRITE_BUDGET_PER_RUN; i++) {
      const r = client.ghWrite(['issue', 'comment', '1', '--body', String(i)]);
      assert.equal(r.ok, true);
    }
    assert.equal(h.calls.length, 450);
    const over = client.ghWrite(['issue', 'comment', '1', '--body', 'one too many']);
    assert.equal(over.ok, false);
    assert.match(over.error, /write budget/);
    assert.equal(h.calls.length, 450, 'gh must not be called once the budget is spent');
  });
});

// ─── Retry (tests 8-13) ──────────────────────────────────────────────────────

describe('secondary-rate-limit retry', () => {
  it('8. honours retry-after: sleeps exactly 2000 ms, then succeeds with attempts: 2', () => {
    const h = harness();
    script(h, [SECONDARY('HTTP/2.0 403 Forbidden\nretry-after: 2\n\n{}'), OK]);
    const r = client.ghWrite(['api', 'repos/o/r/issues', '-X', 'POST', '--include']);
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
    assert.deepEqual(h.sleeps, [2000]);
    assert.equal(h.calls.length, 2);
    assert.ok(h.calls[1].at - h.calls[0].at >= 2000);
  });

  it('9. without a header: 60s, 120s, 240s, 480s, then returns the last failure (attempts = MAX_RETRIES + 1)', () => {
    const h = harness();
    script(h, [SECONDARY()]);
    const r = client.ghWrite(['issue', 'create', '--title', 't']);
    assert.equal(client.MAX_RETRIES, 4);
    assert.equal(r.ok, false);
    assert.equal(r.attempts, client.MAX_RETRIES + 1);
    assert.deepEqual(h.sleeps, [60000, 120000, 240000, 480000]);
    assert.equal(h.calls.length, 5);
  });

  it('9b. retryDelayMs grows by doubling and is capped at MAX_RETRY_MS (900000)', () => {
    harness();
    const r = SECONDARY();
    assert.equal(client.BASE_RETRY_MS, 60000);
    assert.equal(client.MAX_RETRY_MS, 900000);
    assert.equal(client.retryDelayMs(r, 0), 60000);
    assert.equal(client.retryDelayMs(r, 3), 480000);
    assert.equal(client.retryDelayMs(r, 4), 900000);
    assert.equal(client.retryDelayMs(r, 10), 900000);
  });

  it('10. x-ratelimit-remaining: 0 + x-ratelimit-reset waits until the reset instant (min 1000 ms)', () => {
    const NOW = 1_700_000_000_000;
    const h = harness(NOW);
    script(h, [
      {
        ok: false,
        status: 1,
        stdout: 'x-ratelimit-remaining: 0\nx-ratelimit-reset: 1700000030\n\n{}',
        stderr: 'HTTP 403: API rate limit exceeded',
      },
      OK,
    ]);
    const r = client.ghWrite(['issue', 'create', '--title', 't']);
    assert.equal(r.ok, true);
    assert.deepEqual(h.sleeps, [30000]);

    // A reset instant already in the past never yields a delay below 1000 ms.
    const stale = {
      ok: false,
      status: 1,
      stdout: 'x-ratelimit-remaining: 0\nx-ratelimit-reset: 1699999000',
      stderr: 'HTTP 403: API rate limit exceeded',
    };
    assert.equal(client.retryDelayMs(stale, 0), 1000);
  });

  it('11. HTTP 429, abuse detection and content-creation blocks are all classified as retryable', () => {
    const retryable = [
      { ok: false, status: 1, stdout: '', stderr: 'HTTP 429: Too Many Requests - rate limit hit' },
      { ok: false, status: 1, stdout: '', stderr: 'You have triggered an abuse detection mechanism' },
      { ok: false, status: 1, stdout: '', stderr: 'You have been temporarily blocked from content creation' },
      { ok: false, status: 1, stdout: '', stderr: 'HTTP 403: You have exceeded a secondary rate limit' },
    ];
    for (const r of retryable) {
      assert.equal(client.isSecondaryLimit(r), true, r.stderr);
    }
    // Also exercised end to end: each one is retried once and then succeeds.
    for (const r of retryable) {
      const h = harness();
      script(h, [r, OK]);
      const out = client.ghWrite(['issue', 'create', '--title', 't']);
      assert.equal(out.attempts, 2, r.stderr);
      assert.equal(out.ok, true, r.stderr);
      client._resetClient();
    }
    assert.equal(client.isSecondaryLimit({ ok: true, status: 0, stdout: 'rate limit', stderr: '' }), false);
  });

  it('12. a bare 403 (Resource not accessible by integration) is NOT retried', () => {
    const h = harness();
    script(h, [{ ok: false, status: 1, stdout: '', stderr: 'HTTP 403: Resource not accessible by integration' }]);
    const r = client.ghWrite(['issue', 'create', '--title', 't']);
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 1);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.sleeps, []);
  });

  it('13. ghRead retries on the same classifier without pacing', () => {
    const h = harness();
    script(h, [SECONDARY('retry-after: 3'), OK]);
    const r = client.ghRead(['api', 'repos/o/r/issues/1/comments']);
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2);
    // Only the retry delay was slept; no 1000 ms pacing sleep was added by the read path.
    assert.deepEqual(h.sleeps, [3000]);

    // Two consecutive successful reads are never spaced.
    const h2 = harness();
    script(h2, [OK]);
    client.ghRead(['issue', 'view', '1']);
    client.ghRead(['issue', 'view', '2']);
    assert.deepEqual(h2.sleeps, []);
  });

  it('13b. parseRetryAfter reads a case-insensitive header line, else null', () => {
    assert.equal(client.parseRetryAfter({ stdout: 'Retry-After: 7\n{}', stderr: '' }), 7000);
    assert.equal(client.parseRetryAfter({ stdout: '', stderr: 'retry-after:  12' }), 12000);
    assert.equal(client.parseRetryAfter({ stdout: '{"message":"no header"}', stderr: '' }), null);
  });

  it('13c. ghRun dispatches writes to ghWrite (paced) and reads to ghRead (unpaced)', () => {
    const h = harness();
    script(h, [OK]);
    client.ghRun(['issue', 'view', '1']);
    client.ghRun(['issue', 'view', '2']);
    assert.deepEqual(h.sleeps, []);
    client.ghRun(['issue', 'close', '1']);
    client.ghRun(['issue', 'close', '2']);
    assert.deepEqual(h.sleeps, [1000]);
  });
});
