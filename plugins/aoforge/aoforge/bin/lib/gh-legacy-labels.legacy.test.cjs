'use strict';

// Test list (TRD 78-09, objective 78, SC-2), case 7: gh-legacy-labels, the "is this repository rebranded" check that
// replaces the 72-11 label twins. 3.1.0 looks issues up by the AOForge label only; before a lookup by a DEFAULT label
// one `GET repos/{repo}/labels/{twin}` asks whether the pre-rename twin still exists.
//
// 7a. legacyTwin: an AOForge-namespace label -> its pre-rename twin; a label outside the namespace, the bare prefix
//     and a non-string -> null.
// 7b. 200 -> { ok:false, kind:'legacy-namespace', error } with the message naming the twin, the label and
//     `aof-tools gh rebrand --apply`; the GET path URL-encodes the twin.
// 7c. 404 -> { ok:true }.
// 7d. 500, and a call that got no answer at all -> { ok:false, kind:'error', error, r }; never "absent", never cached.
// 7e. Cached per repo and label for the process: a second call makes no API call; another repo or another label asks
//     again; clearCache() forgets every answer.
// 7f. A configured (non-default) label, and a default outside the AOForge namespace, are never checked: no call.
// 7g. With no client injected it reads through gh-client (the `_setRunGh` seam every caller uses).
//
// Hermetic: injected clients or gh-client's runner seam; no network, no fs, no port.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const client = require('./gh-client.cjs');
const labels = require('./gh-legacy-labels.cjs');

const OLD = 'devflow';

const OK_LABEL = (name) => ({ ok: true, status: 0, stdout: JSON.stringify({ id: 1, name, color: 'ededed' }), stderr: '' });
const NOT_FOUND = { ok: false, status: 1, stdout: '{"message":"Not Found","status":"404"}', stderr: 'gh: Not Found (HTTP 404)' };
const SERVER_ERROR = { ok: false, status: 1, stdout: '', stderr: 'gh: Server Error (HTTP 500)' };
const OFFLINE = { ok: false, status: null, stdout: '', stderr: 'error connecting to api.github.com' };

/** A client whose `ghRead` answers every call with `answer(args)` and records the args. */
function recordingClient(answer) {
  const calls = [];
  return {
    calls,
    ghRead(args) {
      calls.push(args.slice());
      return typeof answer === 'function' ? answer(args) : answer;
    },
  };
}

const expectedMessage = (repo, twin, label) => `${repo} still has the pre-rename label "${twin}", which AOForge no longer `
  + `reads, so it will not look issues up by "${label}" alone: run \`aof-tools gh rebrand --apply\` `
  + '(docs/MIGRATING-TO-AOFORGE.md, "Repositories with GitHub integration"), then retry';

beforeEach(() => labels.clearCache());
afterEach(() => {
  labels.clearCache();
  client._resetClient();
});

describe('7a. legacyTwin', () => {
  test('an AOForge-namespace label has a pre-rename twin; anything else has none', () => {
    assert.equal(labels.legacyTwin('aoforge:trd'), `${OLD}:trd`);
    assert.equal(labels.legacyTwin('aoforge:objective'), `${OLD}:objective`);
    assert.equal(labels.legacyTwin('aoforge:in-progress'), `${OLD}:in-progress`);
    assert.equal(labels.legacyTwin('custom'), null);
    assert.equal(labels.legacyTwin('team:objective'), null);
    assert.equal(labels.legacyTwin('aoforge:'), null);
    assert.equal(labels.legacyTwin(''), null);
    assert.equal(labels.legacyTwin(null), null);
    assert.equal(labels.legacyTwin(undefined), null);
  });
});

describe('7b-7d. the answer to the label GET', () => {
  test('7b. 200: refused with kind legacy-namespace and the message naming the twin and gh rebrand --apply', () => {
    const c = recordingClient((args) => OK_LABEL(decodeURIComponent(args[1].split('/').pop())));
    const r = labels.checkRebranded({ repo: 'o/r', label: 'aoforge:objective', defaultLabel: 'aoforge:objective', client: c });
    assert.deepEqual(r, { ok: false, kind: 'legacy-namespace', error: expectedMessage('o/r', `${OLD}:objective`, 'aoforge:objective') });
    assert.deepEqual(c.calls, [['api', `repos/o/r/labels/${OLD}%3Aobjective`]], 'one GET, the twin URL-encoded');
  });

  test('7c. 404: the twin is absent, the lookup proceeds', () => {
    const c = recordingClient(NOT_FOUND);
    const r = labels.checkRebranded({ repo: 'o/r', label: 'aoforge:trd', defaultLabel: 'aoforge:trd', client: c });
    assert.deepEqual(r, { ok: true });
    assert.equal(c.calls.length, 1);
  });

  for (const [name, answer] of [['500', SERVER_ERROR], ['no answer (offline)', OFFLINE]]) {
    test(`7d. ${name}: an error, not "absent", and not cached`, () => {
      const c = recordingClient(answer);
      const args = { repo: 'o/r', label: 'aoforge:trd', defaultLabel: 'aoforge:trd', client: c };
      const r = labels.checkRebranded(args);
      assert.equal(r.ok, false);
      assert.equal(r.kind, 'error');
      assert.match(r.error, new RegExp(`${OLD}:trd`));
      assert.equal(r.r, answer, 'the raw gh result rides along so a caller can classify it');
      labels.checkRebranded(args);
      assert.equal(c.calls.length, 2, 'an error is asked again');
    });
  }

  test('7d. a label with a space is URL-encoded in the path', () => {
    const c = recordingClient(NOT_FOUND);
    labels.checkRebranded({ repo: 'o/r', label: 'aoforge:type/my thing', defaultLabel: 'aoforge:type/my thing', client: c });
    assert.deepEqual(c.calls, [['api', `repos/o/r/labels/${OLD}%3Atype%2Fmy%20thing`]]);
  });
});

describe('7e. the per-process cache', () => {
  test('a second call for the same repo and label makes no API call; present and absent are both remembered', () => {
    const present = recordingClient(OK_LABEL(`${OLD}:objective`));
    const args = { repo: 'o/r', label: 'aoforge:objective', defaultLabel: 'aoforge:objective', client: present };
    const first = labels.checkRebranded(args);
    const second = labels.checkRebranded(args);
    assert.deepEqual(second, first);
    assert.equal(second.kind, 'legacy-namespace');
    assert.equal(present.calls.length, 1);

    const absent = recordingClient(NOT_FOUND);
    const trd = { repo: 'o/r', label: 'aoforge:trd', defaultLabel: 'aoforge:trd', client: absent };
    assert.deepEqual(labels.checkRebranded(trd), { ok: true });
    assert.deepEqual(labels.checkRebranded(trd), { ok: true });
    assert.equal(absent.calls.length, 1);
  });

  test('another repo or another label asks again', () => {
    const c = recordingClient(NOT_FOUND);
    labels.checkRebranded({ repo: 'o/r', label: 'aoforge:trd', defaultLabel: 'aoforge:trd', client: c });
    labels.checkRebranded({ repo: 'o/other', label: 'aoforge:trd', defaultLabel: 'aoforge:trd', client: c });
    labels.checkRebranded({ repo: 'o/r', label: 'aoforge:decision', defaultLabel: 'aoforge:decision', client: c });
    assert.deepEqual(c.calls.map((a) => a[1]), [
      `repos/o/r/labels/${OLD}%3Atrd`,
      `repos/o/other/labels/${OLD}%3Atrd`,
      `repos/o/r/labels/${OLD}%3Adecision`,
    ]);
  });

  test('clearCache forgets every answer', () => {
    const c = recordingClient(NOT_FOUND);
    const args = { repo: 'o/r', label: 'aoforge:trd', defaultLabel: 'aoforge:trd', client: c };
    labels.checkRebranded(args);
    labels.clearCache();
    labels.checkRebranded(args);
    assert.equal(c.calls.length, 2);
  });
});

describe('7f. labels that are never checked', () => {
  test('a configured label (not the default) is used as configured: no call', () => {
    const c = recordingClient(OK_LABEL(`${OLD}:objective`));
    assert.deepEqual(labels.checkRebranded({ repo: 'o/r', label: 'custom', defaultLabel: 'aoforge:objective', client: c }), { ok: true });
    assert.deepEqual(labels.checkRebranded({ repo: 'o/r', label: 'aoforge:objective', defaultLabel: 'aoforge:trd', client: c }), { ok: true });
    assert.equal(c.calls.length, 0);
  });

  test('a default outside the AOForge namespace has no twin: no call', () => {
    const c = recordingClient(OK_LABEL('x'));
    assert.deepEqual(labels.checkRebranded({ repo: 'o/r', label: 'tracking', defaultLabel: 'tracking', client: c }), { ok: true });
    assert.equal(c.calls.length, 0);
  });
});

describe('7g. the default client', () => {
  test('reads through gh-client, so the runner seam answers it', () => {
    const seen = [];
    client._setRunGh((args) => {
      seen.push(args.slice());
      return args[1] === `repos/o/r/labels/${OLD}%3Atrd` ? OK_LABEL(`${OLD}:trd`) : NOT_FOUND;
    });
    const trd = labels.checkRebranded({ repo: 'o/r', label: 'aoforge:trd', defaultLabel: 'aoforge:trd' });
    assert.equal(trd.kind, 'legacy-namespace');
    const decision = labels.checkRebranded({ repo: 'o/r', label: 'aoforge:decision', defaultLabel: 'aoforge:decision' });
    assert.deepEqual(decision, { ok: true });
    assert.deepEqual(seen, [
      ['api', `repos/o/r/labels/${OLD}%3Atrd`],
      ['api', `repos/o/r/labels/${OLD}%3Adecision`],
    ]);
  });

  test('a function is accepted as the client (the read itself)', () => {
    const calls = [];
    const read = (args) => { calls.push(args); return NOT_FOUND; };
    assert.deepEqual(labels.checkRebranded({ repo: 'o/r', label: 'aoforge:todo', defaultLabel: 'aoforge:todo', client: read }), { ok: true });
    assert.equal(calls.length, 1);
  });
});
