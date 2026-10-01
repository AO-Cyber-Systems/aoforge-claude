'use strict';

/**
 * Tests for lib/gh-outbox-flush.cjs (TRD 47-07): the single executor for the outbox.
 *
 * Hermetic: the fake GitHub (`__fixtures__/gh-fake.cjs`) is installed through the client seam, the clock
 * and sleep are injected (nothing sleeps for real), HOME / outbox / cache dirs are temp dirs from
 * `hermeticEnv()`, and the wiki is a local bare repo. Nothing here reaches GitHub or the real ~/.claude.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const flushLib = require('./gh-outbox-flush.cjs');

// ─── classifyFailure (test 5) ────────────────────────────────────────────────

describe('classifyFailure', () => {
  const fail = (stderr, extra = {}) => ({ ok: false, status: 1, stdout: '', stderr, ...extra });

  test('5a. offline: no exit status, or a network error in stderr', () => {
    assert.equal(flushLib.classifyFailure({ ok: false, status: null, stdout: '', stderr: '' }), 'offline');
    for (const text of [
      'error connecting to api.github.com: dial tcp: lookup api.github.com: could not resolve host',
      'dial tcp 140.82.112.5:443: connection refused',
      'Get "https://api.github.com/": net/http: request canceled (Client.Timeout exceeded) timed out',
      'connect: network is unreachable',
      'unexpected EOF',
    ]) {
      assert.equal(flushLib.classifyFailure(fail(text)), 'offline', text);
    }
  });

  test('5b. rate_limited: a secondary limit, or the client write budget refusal', () => {
    assert.equal(flushLib.classifyFailure(fail('HTTP 403: You have exceeded a secondary rate limit')), 'rate_limited');
    assert.equal(flushLib.classifyFailure(fail('gh: abuse detection mechanism (HTTP 403)')), 'rate_limited');
    assert.equal(flushLib.classifyFailure(fail('API rate limit exceeded (HTTP 429)')), 'rate_limited');
    // the client's budget refusal has status null; it must NOT read as an outage
    assert.equal(flushLib.classifyFailure({
      ok: false, status: null, stdout: '', stderr: '', error: 'write budget exhausted (450 gh writes per run); refusing further writes',
    }), 'rate_limited');
  });

  test('5c. already_exists: a 422 that says the thing is already there', () => {
    for (const text of [
      'gh: Validation Failed (HTTP 422)\n{"message":"Issue may not contain duplicate sub-issues"}',
      'gh: Validation Failed (HTTP 422) {"errors":[{"resource":"Milestone","code":"already_exists"}]}',
      'gh: The title has already been taken (HTTP 422)',
      'gh: Issue is already blocked by this issue (HTTP 422)',
      'label with name "x" already exists (HTTP 422)',
    ]) {
      assert.equal(flushLib.classifyFailure(fail(text)), 'already_exists', text);
    }
  });

  test('5d. validation: any other 422', () => {
    assert.equal(flushLib.classifyFailure(fail('gh: Validation Failed (HTTP 422)')), 'validation');
    assert.equal(flushLib.classifyFailure(fail('gh: Issue already has a parent (HTTP 422)')), 'validation');
  });

  test('5e. permission: a 403 that is not a secondary limit, and a 401', () => {
    assert.equal(flushLib.classifyFailure(fail('gh: Resource not accessible by integration (HTTP 403)')), 'permission');
    assert.equal(flushLib.classifyFailure(fail('gh: Bad credentials (HTTP 401)')), 'permission');
  });

  test('5f. not_found: a 404', () => {
    assert.equal(flushLib.classifyFailure(fail('gh: Not Found (HTTP 404)')), 'not_found');
    assert.equal(flushLib.classifyFailure(fail('', { stdout: '{"message":"Not Found","status":"404"}' })), 'error',
      'a bare status field without an HTTP marker is not enough to call it a 404');
  });

  test('5g. error: anything else, including a success-shaped or empty input', () => {
    assert.equal(flushLib.classifyFailure(fail('something odd happened')), 'error');
    assert.equal(flushLib.classifyFailure(fail('gh: Server Error (HTTP 500)')), 'error');
    assert.equal(flushLib.classifyFailure(null), 'error');
    assert.equal(flushLib.classifyFailure(undefined), 'error');
  });

  test('5h. a rate-limit message beats the offline words it may contain', () => {
    assert.equal(
      flushLib.classifyFailure(fail('HTTP 403: secondary rate limit; request timed out waiting')),
      'rate_limited',
    );
  });
});
