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
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

const tmpDirs = [];

afterEach(() => {
  client._resetClient();
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
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

// ─── Pagination (tests 14-16) ────────────────────────────────────────────────

/** A page of `n` hand-built issue-shaped items, numbered from `from`. */
function pageOf(n, from = 1) {
  const items = [];
  for (let i = 0; i < n; i++) items.push({ id: from + i });
  return items;
}

describe('ghPaginate', () => {
  it('14. calls gh api --paginate --slurp and flattens [[a,b],[c]] to [a,b,c]', () => {
    const h = harness();
    script(h, [{ ok: true, status: 0, stdout: JSON.stringify([[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]]), stderr: '' }]);
    const r = client.ghPaginate('repos/o/r/issues/1/comments');
    assert.deepEqual(h.calls.map((c) => c.args), [['api', '--paginate', '--slurp', 'repos/o/r/issues/1/comments']]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.items, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('14b. an endpoint with no results (an empty slurped page) yields an empty array', () => {
    const h = harness();
    script(h, [{ ok: true, status: 0, stdout: '[[]]', stderr: '' }]);
    const r = client.ghPaginate('repos/o/r/milestones');
    assert.equal(r.ok, true);
    assert.deepEqual(r.items, []);
  });

  it('15. falls back to a per_page=100&page=N loop when gh rejects --slurp', () => {
    const h = harness();
    const full = pageOf(100);
    const tail = pageOf(3, 101);
    script(h, [
      { ok: false, status: 1, stdout: '', stderr: 'unknown flag: --slurp' },
      { ok: true, status: 0, stdout: JSON.stringify(full), stderr: '' },
      { ok: true, status: 0, stdout: JSON.stringify(tail), stderr: '' },
    ]);
    const r = client.ghPaginate('repos/o/r/labels');
    assert.deepEqual(h.calls.map((c) => c.args), [
      ['api', '--paginate', '--slurp', 'repos/o/r/labels'],
      ['api', 'repos/o/r/labels?per_page=100&page=1'],
      ['api', 'repos/o/r/labels?per_page=100&page=2'],
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.items.length, 103);
    assert.deepEqual(r.items[102], { id: 103 });
  });

  it('15b. the fallback uses & when the path already carries a query string', () => {
    const h = harness();
    script(h, [
      { ok: false, status: 1, stdout: '', stderr: 'unknown flag: --slurp' },
      { ok: true, status: 0, stdout: JSON.stringify(pageOf(2)), stderr: '' },
    ]);
    const r = client.ghPaginate('repos/o/r/issues?state=all');
    assert.deepEqual(h.calls[1].args, ['api', 'repos/o/r/issues?state=all&per_page=100&page=1']);
    assert.equal(r.ok, true);
    assert.equal(r.items.length, 2);
  });

  it('15c. a real failure (not a --slurp rejection) is returned, not retried as a page loop', () => {
    const h = harness();
    script(h, [{ ok: false, status: 1, stdout: '', stderr: 'HTTP 404: Not Found' }]);
    const r = client.ghPaginate('repos/o/missing/issues');
    assert.equal(r.ok, false);
    assert.match(r.stderr, /404/);
    assert.ok(r.error);
    assert.equal(h.calls.length, 1);
  });

  it('15d. the fallback loop is bounded by MAX_PAGES', () => {
    const h = harness();
    // After the --slurp rejection, every page is full: without a guard this would never end.
    let n = 0;
    client._setRunGh((args) => {
      h.calls.push({ args, at: h.t });
      n++;
      if (n === 1) return { ok: false, status: 1, stdout: '', stderr: 'unknown flag: --slurp' };
      return { ok: true, status: 0, stdout: JSON.stringify(pageOf(100)), stderr: '' };
    });
    const r = client.ghPaginate('repos/o/r/issues');
    assert.equal(client.MAX_PAGES, 100);
    assert.equal(h.calls.length, 1 + client.MAX_PAGES);
    assert.equal(r.items.length, 100 * client.MAX_PAGES);
  });

  it('16. unparseable output returns an {ok:false} shape and does not throw', () => {
    const h = harness();
    script(h, [{ ok: true, status: 0, stdout: '[{"id":1}][{"id":2}]', stderr: '' }]);
    let r;
    assert.doesNotThrow(() => { r = client.ghPaginate('repos/o/r/issues'); });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'unparseable page');
    assert.equal(r.stdout, '[{"id":1}][{"id":2}]');
  });
});

// ─── Enabled gate (tests 17-19) ──────────────────────────────────────────────

/** Build a throwaway project dir with hand-written .planning files. */
function makeProject({ config, projectMd } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-client-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  if (config !== undefined) {
    fs.writeFileSync(
      path.join(dir, '.planning', 'config.json'),
      typeof config === 'string' ? config : JSON.stringify(config),
    );
  }
  if (projectMd !== undefined) fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), projectMd);
  return dir;
}

describe('requireEnabled', () => {
  it('17. no config, no github block, enabled:false or invalid JSON all skip with a github.enabled reason and zero gh calls', () => {
    const h = harness();
    script(h, [OK]);
    const projects = [
      makeProject(),
      makeProject({ config: { mode: 'yolo' } }),
      makeProject({ config: { github: { repo: 'acme/widgets' } } }),
      makeProject({ config: { github: { enabled: false, repo: 'acme/widgets' } } }),
      makeProject({ config: '{ not json' }),
    ];
    for (const dir of projects) {
      const r = client.requireEnabled(dir);
      assert.equal(r.skipped, true, dir);
      assert.equal(r.ok, false);
      assert.equal(r.enabled, false);
      assert.match(r.reason, /github\.enabled/);
    }
    assert.equal(h.calls.length, 0);
  });

  it('18. enabled:true without a valid repo anywhere skips with a github.repo reason', () => {
    const h = harness();
    script(h, [OK]);
    const noRepo = makeProject({ config: { github: { enabled: true } } });
    const badRepo = makeProject({ config: { github: { enabled: true, repo: 'not-a-slug' } } });
    const badProjectRepo = makeProject({
      config: { github: { enabled: true } },
      projectMd: '---\nname: x\ngithub_repo: justaname\n---\n# x\n',
    });
    for (const dir of [noRepo, badRepo, badProjectRepo]) {
      const r = client.requireEnabled(dir);
      assert.equal(r.skipped, true, dir);
      assert.equal(r.ok, false);
      assert.match(r.reason, /github\.repo/);
    }
    assert.equal(h.calls.length, 0);
  });

  it('19. enabled:true with a repo returns the gate payload; PROJECT.md github_repo is the fallback', () => {
    const h = harness();
    script(h, [OK]);

    const fromConfig = makeProject({ config: { github: { enabled: true, repo: 'acme/widgets' } } });
    const a = client.requireEnabled(fromConfig);
    assert.equal(a.enabled, true);
    assert.equal(a.repo, 'acme/widgets');
    assert.deepEqual(a.labels, {});
    assert.equal(a.milestone_prefix, 'v');
    assert.equal(a.skipped, undefined);

    const custom = makeProject({
      config: { github: { enabled: true, repo: 'acme/widgets', labels: { bug: 'red' }, milestone_prefix: 'M' } },
    });
    const c = client.requireEnabled(custom);
    assert.deepEqual(c.labels, { bug: 'red' });
    assert.equal(c.milestone_prefix, 'M');

    const fromProjectMd = makeProject({
      config: { github: { enabled: true } },
      projectMd: '---\nname: x\ngithub_repo: acme/from-project\n---\n# x\n',
    });
    assert.equal(client.resolveRepo(fromProjectMd), 'acme/from-project');
    assert.equal(client.requireEnabled(fromProjectMd).repo, 'acme/from-project');

    // config.github.repo wins over PROJECT.md when both are present.
    const both = makeProject({
      config: { github: { enabled: true, repo: 'acme/from-config' } },
      projectMd: '---\ngithub_repo: acme/from-project\n---\n',
    });
    assert.equal(client.resolveRepo(both), 'acme/from-config');

    assert.equal(h.calls.length, 0, 'the enabled gate must make zero gh calls');
  });
});

// ─── Exit codes (test 20) ────────────────────────────────────────────────────

/** Run fn with process.exit and process.stdout.write captured; always restore. */
function captureEmit(fn) {
  const realExit = process.exit;
  const realWrite = process.stdout.write;
  const cap = { code: undefined, out: '' };
  process.exit = (code) => { if (cap.code === undefined) cap.code = code; };
  process.stdout.write = (chunk) => { cap.out += String(chunk); return true; };
  try {
    fn();
  } finally {
    process.exit = realExit;
    process.stdout.write = realWrite;
  }
  return cap;
}

describe('emitResult', () => {
  it('20. ok exits 0; skipped exits 0; a real failure exits 1 and still prints the JSON', () => {
    const ok = captureEmit(() => client.emitResult({ ok: true, n: 1 }, false));
    assert.equal(ok.code, 0);
    assert.deepEqual(JSON.parse(ok.out), { ok: true, n: 1 });

    const skipped = captureEmit(() => client.emitResult({ skipped: true, ok: false, reason: 'github.enabled is not true' }, false));
    assert.equal(skipped.code, 0);
    assert.equal(JSON.parse(skipped.out).skipped, true);

    const failed = captureEmit(() => client.emitResult({ ok: false, error: 'boom' }, false));
    assert.equal(failed.code, 1);
    assert.deepEqual(JSON.parse(failed.out), { ok: false, error: 'boom' });
  });

  it('20b. a result with no ok field exits 0, and raw mode prints the raw value', () => {
    const noOk = captureEmit(() => client.emitResult({ items: [] }, false));
    assert.equal(noOk.code, 0);

    const raw = captureEmit(() => client.emitResult({ ok: false, error: 'boom' }, true, 'boom-raw'));
    assert.equal(raw.code, 1);
    assert.equal(raw.out, 'boom-raw');
  });
});

// ─── Scoped retry policy (TRD 47-07, D-23 / Pitfall 8) ───────────────────────

describe('withRetryPolicy', () => {
  it('21. default policy is unchanged: a secondary limit is retried MAX_RETRIES (4) times', () => {
    const h = harness();
    script(h, [SECONDARY()]);
    const r = client.ghWrite(['api', '--method', 'POST', 'repos/o/r/issues', '--input', '-'], { input: '{}' });
    assert.equal(r.ok, false);
    assert.equal(r.attempts, client.MAX_RETRIES + 1);
    assert.equal(h.sleeps.filter((ms) => ms >= 60000).length, client.MAX_RETRIES);
  });

  it('22. {maxRetries:0} makes one attempt and never sleeps; the policy is restored afterwards, also when fn throws', () => {
    const h = harness();
    script(h, [SECONDARY()]);
    const r = client.withRetryPolicy({ maxRetries: 0 }, () => client.ghWrite(['issue', 'create', '--title', 't']));
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 1);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.sleeps, [], 'a zero-retry policy must not sleep');

    // restored: the next call retries again
    const again = client.ghRead(['issue', 'view', '1']);
    assert.equal(again.attempts, client.MAX_RETRIES + 1);

    // restored after a throw as well
    assert.throws(
      () => client.withRetryPolicy({ maxRetries: 0 }, () => { throw new Error('boom'); }),
      /boom/,
    );
    h.calls.length = 0;
    h.sleeps.length = 0;
    const third = client.ghRead(['issue', 'view', '2']);
    assert.equal(third.attempts, client.MAX_RETRIES + 1);
  });

  it('22b. withRetryPolicy returns what fn returns, nests (inner wins, outer restored) and validates maxRetries', () => {
    const h = harness();
    script(h, [SECONDARY()]);
    assert.equal(client.withRetryPolicy({ maxRetries: 1 }, () => 'value'), 'value');

    const outer = client.withRetryPolicy({ maxRetries: 1 }, () => {
      const inner = client.withRetryPolicy({ maxRetries: 0 }, () => client.ghRead(['issue', 'view', '1']).attempts);
      const after = client.ghRead(['issue', 'view', '1']).attempts;
      return { inner, after };
    });
    assert.deepEqual(outer, { inner: 1, after: 2 });

    for (const bad of [-1, 1.5, '2', null, undefined, NaN]) {
      assert.throws(() => client.withRetryPolicy({ maxRetries: bad }, () => 1), TypeError, String(bad));
    }
    assert.throws(() => client.withRetryPolicy(null, () => 1), TypeError);
    assert.throws(() => client.withRetryPolicy({ maxRetries: 0 }, 'not a function'), TypeError);
  });

  it('22c. _resetClient restores the default policy even from inside an active scope', () => {
    client.withRetryPolicy({ maxRetries: 0 }, () => {
      client._resetClient();
      const h2 = harness();
      script(h2, [SECONDARY()]);
      assert.equal(client.ghRead(['issue', 'view', '1']).attempts, client.MAX_RETRIES + 1);
    });
  });

  it('23. opts reach the runner exactly as passed: {input} is byte-identical and carries no policy keys (Open Q7)', () => {
    const h = harness();
    script(h, [OK]);
    const input = '{"a":1}';
    client.withRetryPolicy({ maxRetries: 0 }, () => {
      client.ghWrite(['api', '--method', 'POST', 'repos/o/r/issues', '--input', '-'], { input });
    });
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0].opts, { input });
    assert.equal(h.calls[0].opts.input, input);
    assert.deepEqual(Object.keys(h.calls[0].opts), ['input']);
  });

  it('24. writeCount() increases by one per paced attempt (retries included) and reads do not count', () => {
    const h = harness();
    script(h, [OK]);
    assert.equal(client.writeCount(), 0);
    client.ghWrite(['issue', 'create', '--title', 'a']);
    assert.equal(client.writeCount(), 1);
    client.ghRead(['issue', 'view', '1']);
    assert.equal(client.writeCount(), 1);
    client.ghWrite(['issue', 'create', '--title', 'b']);
    assert.equal(client.writeCount(), 2);

    script(h, [SECONDARY(), OK]);
    client.ghWrite(['issue', 'create', '--title', 'c']);
    assert.equal(client.writeCount(), 4, 'a retried write is two attempts');

    client._resetClient();
    assert.equal(client.writeCount(), 0);
  });

  it('24b. now() and sleep() forward to the injected clock, so a caller shares the same seam as the client', () => {
    const h = harness(5000);
    assert.equal(client.now(), 5000);
    client.sleep(250);
    assert.deepEqual(h.sleeps, [250]);
    assert.equal(client.now(), 5250);
  });
});

// ─── 49-02: read classification for the objective branch and PR lifecycle ────
//
// Objective 49 lists an issue's linked branches (`gh issue develop --list`) and reads PRs. A read must not be
// paced (1 s apart) or counted against WRITE_BUDGET_PER_RUN, so the classifier has to know which of these only
// look.

describe('49-02 isWriteArgs: issue develop, pr, graphql', () => {
  it('8. `issue develop --list` and `-l` only list linked branches, so they are reads', () => {
    const reads = [
      ['issue', 'develop', '120', '--list'],
      ['issue', 'develop', '120', '-l'],
      ['issue', 'develop', '--list', '120'],
      ['issue', 'develop', '-l', '120'],
      ['issue', 'develop', '120', '--list', '--repo', 'o/r'],
      ['issue', 'develop', '--repo', 'o/r', '--list', '120'],
    ];
    for (const args of reads) {
      assert.equal(client.isWriteArgs(args), false, `expected read: ${args.join(' ')}`);
    }
  });

  it('8b. `issue develop` without --list still creates a linked branch, so it stays a write', () => {
    const writes = [
      ['issue', 'develop', '120'],
      ['issue', 'develop', '120', '--name', 'b'],
      ['issue', 'develop', '120', '--name', 'b', '--base', 'main'],
      ['issue', 'develop', '120', '-n', 'b', '-b', 'main', '--checkout'],
      // a value that merely looks like the flag is a value, not the flag
      ['issue', 'develop', '120', '--name', '--list'],
      ['issue', 'develop', '120', '--base', '-l'],
    ];
    for (const args of writes) {
      assert.equal(client.isWriteArgs(args), true, `expected write: ${args.join(' ')}`);
    }
  });

  it('8c. pr view|list|status|diff|checks are reads; pr ready and pr create are writes', () => {
    for (const sub of ['view', 'list', 'status', 'diff', 'checks']) {
      assert.equal(client.isWriteArgs(['pr', sub, '5']), false, `expected read: pr ${sub}`);
    }
    for (const args of [['pr', 'ready', '5'], ['pr', 'create', '--draft'], ['pr', 'merge', '5'], ['pr', 'edit', '5', '--body', 'b']]) {
      assert.equal(client.isWriteArgs(args), true, `expected write: ${args.join(' ')}`);
    }
  });

  it('8d. api graphql: a query is a read, a mutation is a write', () => {
    assert.equal(client.isWriteArgs(['api', 'graphql', '-f', 'query=query{x}']), false);
    assert.equal(client.isWriteArgs(['api', 'graphql', '-f', 'query=mutation{x}']), true);
  });

  it('8e. ghRun does not pace or budget `issue develop --list`, and still paces `issue develop`', () => {
    const h = harness();
    script(h, [OK]);
    client.ghRun(['issue', 'develop', '120', '--list']);
    client.ghRun(['issue', 'develop', '121', '--list']);
    client.ghRun(['issue', 'develop', '122', '-l']);
    assert.deepEqual(h.sleeps, []);
    assert.equal(client.writeCount(), 0, 'a list is not counted against the write budget');
    client.ghRun(['issue', 'develop', '120', '--name', 'b']);
    client.ghRun(['issue', 'develop', '121', '--name', 'c']);
    assert.deepEqual(h.sleeps, [1000]);
    assert.equal(client.writeCount(), 2);
  });
});
