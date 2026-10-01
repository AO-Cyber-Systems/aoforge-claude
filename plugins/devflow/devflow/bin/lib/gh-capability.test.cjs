'use strict';

// TRD 47-06 — gh-capability.cjs (GST-08, type/field half of GST-01): one probe per repo and one pure
// function that turns the answer into the store's operating modes.
//
// Hermetic: the only GitHub is the 47-02 fake, installed with gh-client._setRunGh(fake.runGh). Every
// location a probe could write (HOME, the gh cache dir, the outbox) points at a temp root through
// hermeticEnv(). The wiki is probed through gh-wiki's git seam: a stub by default, a local bare repo
// (file://, `__fixtures__/wiki-remote.cjs`) where the real git behaviour matters. Nothing here touches
// the network, port 8080, or the real ~/.claude.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const client = require('./gh-client.cjs');
const wiki = require('./gh-wiki.cjs');
const cap = require('./gh-capability.cjs');
const { createFakeGitHub } = require('./__fixtures__/gh-fake.cjs');
const { makeStoreProject, hermeticEnv } = require('./__fixtures__/gh-store-fixtures.cjs');
const { createWikiRemote, gitAvailable, applyGitTestEnv } = require('./__fixtures__/wiki-remote.cjs');

const HAS_GIT = gitAvailable();
const GIT_OK = { ok: true, status: 0, stdout: 'abc123\tHEAD\n', stderr: '' };
const NOT_FOUND = { status: 1, stderr: 'gh: Not Found (HTTP 404)', stdout: '{"message":"Not Found","status":"404"}' };
const SERVER_ERROR = { status: 1, stderr: 'gh: Server Error (HTTP 500)', stdout: '' };

let hermetic;
let project;
let savedWikiRemote;
let gitCalls;
const cleanups = [];

beforeEach(() => {
  hermetic = hermeticEnv();
  savedWikiRemote = process.env.DEVFLOW_WIKI_REMOTE;
  delete process.env.DEVFLOW_WIKI_REMOTE;
  gitCalls = [];
  // Default wiki probe: a remote that answers. Tests about wiki behaviour replace it.
  wiki._setRunGit((args) => { gitCalls.push(args); return { ...GIT_OK }; });
});

afterEach(() => {
  client._resetClient();
  wiki._setRunGit(null);
  while (cleanups.length) cleanups.pop()();
  if (project) project.cleanup();
  project = null;
  if (savedWikiRemote === undefined) delete process.env.DEVFLOW_WIKI_REMOTE;
  else process.env.DEVFLOW_WIKI_REMOTE = savedWikiRemote;
  hermetic.restore();
});

/** A store project plus a fake GitHub variant, installed behind gh-client. */
function setup(variant = {}) {
  project = makeStoreProject();
  const fake = createFakeGitHub({ ...project.fakeOptions, ...variant });
  client._setRunGh(fake.runGh);
  return fake;
}

function detect(opts) {
  return cap.detectCapabilities(project.root, opts);
}

const matchPath = (p) => (argv) => argv[0] === 'api' && String(argv[1]).split('?')[0] === p;

// ─── constants ────────────────────────────────────────────────────────────────

describe('capability constants', () => {
  test('the required types, required fields and the one issue-fields path', () => {
    assert.deepEqual(cap.REQUIRED_TYPES, ['Objective', 'TRD', 'Decision']);
    assert.deepEqual(cap.REQUIRED_FIELDS, ['work', 'kind']);
    assert.equal(cap.ISSUE_FIELDS_PATH, 'orgs/{owner}/issue-fields');
  });
});

// ─── 1: everything native ─────────────────────────────────────────────────────

describe('full-featured organisation repo (test 1)', () => {
  test('every capability is native', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    const r = detect({ probeIssue: probe });
    assert.equal(r.ok, true);
    assert.equal(r.repo, 'o/r');
    assert.equal(r.owner_type, 'Organization');
    assert.equal(r.push, true);
    assert.equal(r.private, false);
    assert.deepEqual(r.org_types, { available: true, enabled: ['Objective', 'TRD', 'Decision'] });
    assert.deepEqual(r.issue_fields, { available: true, ids: { work: 11, kind: 12 } });
    assert.equal(r.sub_issues, 'ok');
    assert.equal(r.dependencies, 'ok');
    assert.equal(r.wiki, 'ok');
    assert.equal(r.wiki_detail, null);
    assert.equal(r.stale, false);
    assert.equal(r.provisional, false);
    assert.equal(r.final, true);
    assert.ok(!Number.isNaN(Date.parse(r.checked_at)));
    assert.deepEqual(r.degraded, []);

    const modes = cap.resolveModes(r);
    assert.equal(modes.types, 'native');
    assert.equal(modes.fields, 'native');
    assert.equal(modes.hierarchy, 'native');
    assert.equal(modes.dependencies, 'native');
    assert.equal(modes.pages, 'wiki');
    assert.equal(modes.writable, true);
    assert.deepEqual(modes.types_by_name, { Objective: 'native', TRD: 'native', Decision: 'native' });
    assert.deepEqual(modes.degraded, []);
    assert.equal(modes.pages_message, null);
  });

  test('every probe is a read', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe });
    assert.deepEqual(fake.writes(), []);
    for (const argv of fake.calls()) {
      assert.equal(argv[0], 'api');
      assert.ok(!argv.includes('-X') && !argv.includes('--method') && !argv.includes('--input'), argv.join(' '));
    }
  });
});

// ─── 2: user-owned repo (SC5, unit level) ─────────────────────────────────────

describe('user-owned repo (test 2)', () => {
  test('labels + meta + docs, with sub-issues and dependencies still native', () => {
    const fake = setup({ ownerType: 'User', hasWiki: false });
    const probe = fake.seedIssue({ title: 'Objective 7' });
    const r = detect({ probeIssue: probe });
    assert.equal(r.ok, true);
    assert.equal(r.owner_type, 'User');
    assert.deepEqual(r.org_types, { available: false, enabled: [] });
    assert.equal(r.issue_fields.available, false);
    assert.equal(r.sub_issues, 'ok');
    assert.equal(r.dependencies, 'ok');
    assert.equal(r.wiki, 'disabled');

    const modes = cap.resolveModes(r);
    assert.equal(modes.types, 'labels');
    assert.equal(modes.fields, 'meta');
    assert.equal(modes.hierarchy, 'native');
    assert.equal(modes.dependencies, 'native');
    assert.equal(modes.pages, 'docs');
    assert.equal(modes.writable, true);
    assert.deepEqual(modes.degraded, ['types', 'fields', 'wiki']);
    assert.deepEqual(r.degraded, ['types', 'fields', 'wiki']);
  });

  test('an owner that is a user is never asked for org endpoints, and a disabled wiki is never probed', () => {
    const fake = setup({ ownerType: 'User', hasWiki: false });
    detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(fake.calls().some((a) => String(a[1]).startsWith('orgs/')), false);
    assert.equal(gitCalls.length, 0);
  });

  test('a user-owned repo with a wiki still probes the wiki (docs only when disabled)', () => {
    const fake = setup({ ownerType: 'User', hasWiki: true });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.wiki, 'ok');
    assert.equal(cap.resolveModes(r).pages, 'wiki');
    assert.deepEqual(r.degraded, ['types', 'fields']);
    assert.equal(gitCalls.length, 1);
  });
});

// ─── 3: partial org types ─────────────────────────────────────────────────────

describe('org issue types (test 3)', () => {
  test('a set missing Decision is reported per type', () => {
    const fake = setup({
      types: [{ id: 1, name: 'Objective', is_enabled: true }, { id: 2, name: 'TRD', is_enabled: true }, { id: 9, name: 'Bug', is_enabled: true }],
    });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.deepEqual(r.org_types, { available: true, enabled: ['Objective', 'TRD'] });
    const modes = cap.resolveModes(r);
    assert.equal(modes.types, 'labels');
    assert.deepEqual(modes.types_by_name, { Objective: 'native', TRD: 'native', Decision: 'labels' });
    assert.deepEqual(modes.degraded, ['types']);
  });

  test('a defined but disabled type counts as missing', () => {
    const fake = setup({
      types: [{ id: 1, name: 'Objective', is_enabled: true }, { id: 2, name: 'TRD', is_enabled: false }, { id: 3, name: 'Decision', is_enabled: true }],
    });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.deepEqual(r.org_types.enabled, ['Objective', 'Decision']);
    assert.equal(cap.resolveModes(r).types_by_name.TRD, 'labels');
  });

  test('no org types at all: every type falls back, detection still succeeds', () => {
    const fake = setup({ types: [] });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.ok, true);
    assert.deepEqual(r.org_types, { available: true, enabled: [] });
    assert.deepEqual(cap.resolveModes(r).types_by_name, { Objective: 'labels', TRD: 'labels', Decision: 'labels' });
  });

  test('the issue-types endpoint failing degrades types and nothing else', () => {
    const fake = setup();
    fake.failNext(matchPath('orgs/o/issue-types'), NOT_FOUND);
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.ok, true);
    assert.equal(r.org_types.available, false);
    const modes = cap.resolveModes(r);
    assert.equal(modes.types, 'labels');
    assert.equal(modes.fields, 'native');
    assert.deepEqual(modes.degraded, ['types']);
  });
});

// ─── 4: issue fields ──────────────────────────────────────────────────────────

describe('issue field definitions (test 4)', () => {
  for (const [label, response, definitive] of [['404', NOT_FOUND, true], ['500', SERVER_ERROR, false]]) {
    test(`a ${label} on the definitions endpoint means fields:meta and detection still succeeds`, () => {
      const fake = setup();
      fake.failNext(matchPath('orgs/o/issue-fields'), response);
      const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
      assert.equal(r.ok, true);
      assert.equal(r.issue_fields.available, false);
      assert.deepEqual(r.issue_fields.ids, {});
      assert.equal(cap.resolveModes(r).fields, 'meta');
      assert.equal(cap.resolveModes(r).types, 'native');
      // 404 is a definitive answer; a 500 may pass, so it must not be remembered as final.
      assert.equal(r.final, definitive);
    });
  }

  test('a definition list that lacks one required field is not native', () => {
    const fake = setup({ fields: [{ id: 11, name: 'work', data_type: 'single_select' }, { id: 20, name: 'owner', data_type: 'text' }] });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.issue_fields.available, false);
    assert.deepEqual(r.issue_fields.ids, { work: 11 });
    assert.deepEqual(r.issue_fields.missing, ['kind']);
    assert.equal(cap.resolveModes(r).fields, 'meta');
  });

  test('field names match case-insensitively and the ids are keyed by the canonical name', () => {
    const fake = setup({ fields: [{ id: 31, name: 'Work', data_type: 'single_select' }, { id: 32, name: 'KIND', data_type: 'single_select' }] });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.deepEqual(r.issue_fields, { available: true, ids: { work: 31, kind: 32 } });
  });

  test('listFieldDefinitions reads the one constant path and never throws', () => {
    const fake = setup();
    const ok = cap.listFieldDefinitions('o');
    assert.deepEqual(ok, { available: true, ids: { work: 11, kind: 12 } });
    assert.deepEqual(fake.calls().at(-1), ['api', 'orgs/o/issue-fields']);

    fake.failNext(matchPath('orgs/o/issue-fields'), { ok: true, status: 0, stdout: 'not json at all', stderr: '' });
    const bad = cap.listFieldDefinitions('o');
    assert.equal(bad.available, false);

    fake.failNext(matchPath('orgs/o/issue-fields'), { ok: true, status: 0, stdout: '{"an":"object"}', stderr: '' });
    assert.equal(cap.listFieldDefinitions('o').available, false);
  });
});

// ─── 5 and 6: sub-issues and dependencies ─────────────────────────────────────

describe('sub-issues and dependencies (tests 5 and 6)', () => {
  test('no sub-issues API on a known issue means the task-list hierarchy', () => {
    const fake = setup({ subIssuesApi: false });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.sub_issues, 'absent');
    assert.equal(r.dependencies, 'ok');
    const modes = cap.resolveModes(r);
    assert.equal(modes.hierarchy, 'tasklist');
    assert.equal(modes.dependencies, 'native');
    assert.deepEqual(modes.degraded, ['sub_issues']);
    assert.equal(r.final, true);
  });

  test('an absent dependencies API is reported on its own', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    fake.failNext((a) => String(a[1]).includes('/dependencies/'), NOT_FOUND);
    const r = detect({ probeIssue: probe });
    assert.equal(r.sub_issues, 'ok');
    assert.equal(r.dependencies, 'absent');
    const modes = cap.resolveModes(r);
    assert.equal(modes.hierarchy, 'native');
    assert.equal(modes.dependencies, 'none');
    assert.deepEqual(modes.degraded, ['dependencies']);
  });

  test('without a probe issue both are unknown, treated as native, and the answer is not final', () => {
    const fake = setup();
    const r = detect({});
    assert.equal(r.sub_issues, 'unknown');
    assert.equal(r.dependencies, 'unknown');
    assert.equal(r.final, false);
    const modes = cap.resolveModes(r);
    assert.equal(modes.hierarchy, 'native');
    assert.equal(modes.dependencies, 'native');
    assert.deepEqual(modes.degraded, []);
    assert.equal(fake.calls().some((a) => /sub_issues|dependencies/.test(String(a[1]))), false);
  });

  test('a probe issue that does not exist is unknown, not absent', () => {
    setup({ subIssuesApi: false });
    const r = detect({ probeIssue: 99 });
    assert.equal(r.sub_issues, 'unknown');
    assert.equal(r.dependencies, 'unknown');
    assert.equal(r.final, false);
    assert.equal(cap.resolveModes(r).hierarchy, 'native');
  });

  test('a string issue number is accepted', () => {
    const fake = setup();
    const n = fake.seedIssue({ title: 'Objective 7' });
    assert.equal(detect({ probeIssue: String(n) }).sub_issues, 'ok');
  });
});

// ─── 7 and 8: the wiki ────────────────────────────────────────────────────────

describe('wiki state (tests 7 and 8)', () => {
  test('a wiki repository that does not exist yet is blocked, never docs', { skip: !HAS_GIT && 'git not installed' }, () => {
    const remote = createWikiRemote();
    cleanups.push(() => remote.cleanup());
    cleanups.push(applyGitTestEnv(remote.home));
    wiki._setRunGit(null);
    process.env.DEVFLOW_WIKI_REMOTE = remote.missingUrl;

    const fake = setup({ hasWiki: true });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.ok, true);
    assert.equal(r.wiki, 'uninitialised');
    assert.ok(r.wiki_detail && r.wiki_detail.length > 0);
    const modes = cap.resolveModes(r);
    assert.equal(modes.pages, 'blocked');
    assert.match(modes.pages_message, /first wiki page/);
    assert.match(modes.pages_message, /web UI/);
    assert.match(modes.pages_message, /df-tools gh outbox flush/);
    assert.deepEqual(modes.degraded, ['wiki']);
    // The user fixes this in the web UI and re-runs the flush at once: it must not be remembered.
    assert.equal(r.final, false);
    assert.ok(cap.describeDegraded(r).some((s) => /web UI/.test(s)));
  });

  test('a wiki that exists is ok', { skip: !HAS_GIT && 'git not installed' }, () => {
    const remote = createWikiRemote();
    cleanups.push(() => remote.cleanup());
    cleanups.push(applyGitTestEnv(remote.home));
    wiki._setRunGit(null);
    process.env.DEVFLOW_WIKI_REMOTE = remote.remoteUrl;

    const fake = setup({ hasWiki: true });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.wiki, 'ok');
    assert.equal(r.wiki_detail, null);
    const modes = cap.resolveModes(r);
    assert.equal(modes.pages, 'wiki');
    assert.deepEqual(modes.degraded, []);
  });

  test('a wiki that cannot be reached is blocked with the git stderr, never docs', () => {
    wiki._setRunGit(() => ({ ok: false, status: 128, stdout: '', stderr: 'fatal: remote end hung up unexpectedly\n' }));
    const fake = setup({ hasWiki: true });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.wiki, 'unavailable');
    assert.match(r.wiki_detail, /remote end hung up unexpectedly/);
    const modes = cap.resolveModes(r);
    assert.equal(modes.pages, 'blocked');
    assert.match(modes.pages_message, /remote end hung up unexpectedly/);
    assert.equal(r.final, false);
  });

  test('the wiki remote is resolved the way gh-wiki resolves it (env override wins)', () => {
    const fake = setup({ hasWiki: true });
    process.env.DEVFLOW_WIKI_REMOTE = 'file:///from-env.wiki.git';
    detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.ok(gitCalls.some((a) => a.includes('ls-remote') && a.includes('file:///from-env.wiki.git')), JSON.stringify(gitCalls));
  });

  test('an explicit env option reaches the wiki remote lookup too', () => {
    const fake = setup({ hasWiki: true });
    detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), env: { ...process.env, DEVFLOW_WIKI_REMOTE: 'file:///from-opt.wiki.git' } });
    assert.ok(gitCalls.some((a) => a.includes('file:///from-opt.wiki.git')), JSON.stringify(gitCalls));
  });
});

// ─── 9: push permission ───────────────────────────────────────────────────────

describe('push permission (test 9)', () => {
  test('push:false means writable:false and a sentence that says so', () => {
    const fake = setup({ push: false });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.equal(r.ok, true);
    assert.equal(r.push, false);
    assert.equal(cap.resolveModes(r).writable, false);
    assert.equal(r.final, false); // access can be granted at any moment
    assert.ok(cap.describeDegraded(r).some((s) => /push/i.test(s) && /o\/r/.test(s)));
    assert.deepEqual(fake.writes(), []);
  });

  test('a private repo is reported', () => {
    const fake = setup({ isPrivate: true });
    assert.equal(detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) }).private, true);
  });
});

// ─── 12: the repo itself ──────────────────────────────────────────────────────

describe('the repository read (test 12)', () => {
  test('404 on the repository is fatal, unlike a capability probe', () => {
    const fake = setup();
    fake.failNext(matchPath('repos/o/r'), NOT_FOUND);
    const r = detect({ probeIssue: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'repository o/r not found or not accessible');
    assert.equal(fake.calls().length, 1);
  });

  test('another failure on the repository is fatal and carries the gh message', () => {
    const fake = setup();
    fake.failNext(matchPath('repos/o/r'), { status: 1, stderr: 'gh: Forbidden (HTTP 403)' });
    const r = detect({});
    assert.equal(r.ok, false);
    assert.match(r.error, /Forbidden \(HTTP 403\)/);
  });

  test('no github.repo is an error before any gh call', () => {
    const fake = setup();
    fs.writeFileSync(path.join(project.root, '.planning', 'config.json'), JSON.stringify({ github: { enabled: true } }));
    fs.writeFileSync(path.join(project.root, '.planning', 'PROJECT.md'), '# Project\n');
    const r = detect({});
    assert.equal(r.ok, false);
    assert.match(r.error, /github\.repo/);
    assert.equal(fake.calls().length, 0);
  });

  test('an unparseable repository answer is fatal', () => {
    const fake = setup();
    fake.failNext(matchPath('repos/o/r'), { ok: true, status: 0, stdout: '<html>', stderr: '' });
    const r = detect({});
    assert.equal(r.ok, false);
    assert.match(r.error, /unparseable/);
  });
});

// ─── resolveModes: pure ───────────────────────────────────────────────────────

describe('resolveModes is pure', () => {
  const NATIVE = {
    repo: 'o/r', owner_type: 'Organization', push: true, private: false,
    org_types: { available: true, enabled: ['Objective', 'TRD', 'Decision'] },
    issue_fields: { available: true, ids: { work: 11, kind: 12 } },
    sub_issues: 'ok', dependencies: 'ok', wiki: 'ok', wiki_detail: null,
    checked_at: '2026-10-01T00:00:00.000Z', stale: false, provisional: false, final: true,
  };

  test('same input, same output, input untouched', () => {
    const frozen = JSON.parse(JSON.stringify(NATIVE));
    const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
    deepFreeze(frozen);
    const a = cap.resolveModes(frozen);
    const b = cap.resolveModes(frozen);
    assert.deepEqual(a, b);
    assert.deepEqual(frozen, NATIVE);
  });

  test('it touches neither gh nor git', () => {
    const fake = setup();
    cap.resolveModes(NATIVE);
    cap.describeDegraded(NATIVE);
    assert.equal(fake.calls().length, 0);
    assert.equal(gitCalls.length, 0);
  });

  test('unknown wiki and unknown hierarchy read as native (provisional defaults)', () => {
    const modes = cap.resolveModes({ ...NATIVE, sub_issues: 'unknown', dependencies: 'unknown', wiki: 'unknown' });
    assert.equal(modes.hierarchy, 'native');
    assert.equal(modes.pages, 'wiki');
    assert.deepEqual(modes.degraded, []);
  });

  test('a missing argument is a programming error, not a silent default', () => {
    assert.throws(() => cap.resolveModes(null), TypeError);
    assert.throws(() => cap.resolveModes({ ok: false, error: 'repository o/r not found or not accessible' }), /not found/);
  });
});

// ─── 13: describeDegraded ─────────────────────────────────────────────────────

describe('describeDegraded (test 13)', () => {
  const NATIVE = {
    repo: 'o/r', owner_type: 'Organization', push: true, private: false,
    org_types: { available: true, enabled: ['Objective', 'TRD', 'Decision'] },
    issue_fields: { available: true, ids: { work: 11, kind: 12 } },
    sub_issues: 'ok', dependencies: 'ok', wiki: 'ok', wiki_detail: null,
  };

  test('nothing degraded, nothing said', () => {
    assert.deepEqual(cap.describeDegraded(NATIVE), []);
  });

  test('one human sentence per degraded capability on a user-owned repo', () => {
    const sentences = cap.describeDegraded({
      ...NATIVE, owner_type: 'User', org_types: { available: false, enabled: [] }, issue_fields: { available: false, ids: {} }, wiki: 'disabled',
    });
    assert.equal(sentences.length, 3);
    assert.ok(sentences.every((s) => typeof s === 'string' && /\.$/.test(s)), JSON.stringify(sentences));
    assert.match(sentences[0], /issue types/i);
    assert.match(sentences[0], /devflow:type\//);
    assert.match(sentences[1], /issue fields/i);
    assert.match(sentences[1], /meta/);
    assert.match(sentences[2], /docs\/devflow/);
  });

  test('a partial type set names the missing types', () => {
    const [sentence] = cap.describeDegraded({ ...NATIVE, org_types: { available: true, enabled: ['Objective', 'TRD'] } });
    assert.match(sentence, /Decision/);
    assert.doesNotMatch(sentence, /Objective|TRD/);
  });

  test('a missing sub-issues API and a missing dependencies API each get a sentence', () => {
    const sentences = cap.describeDegraded({ ...NATIVE, sub_issues: 'absent', dependencies: 'absent' });
    assert.equal(sentences.length, 2);
    assert.match(sentences[0], /sub-issues/i);
    assert.match(sentences[0], /task list/i);
    assert.match(sentences[1], /dependenc/i);
  });

  test('the sentences follow the order of the degraded list', () => {
    const caps = { ...NATIVE, owner_type: 'User', org_types: { available: false, enabled: [] }, issue_fields: { available: false, ids: {} }, sub_issues: 'absent', wiki: 'disabled' };
    const modes = cap.resolveModes(caps);
    assert.deepEqual(modes.degraded, ['types', 'fields', 'sub_issues', 'wiki']);
    assert.equal(cap.describeDegraded(caps).length, 4);
  });
});

// ─── 10: the TTL cache ────────────────────────────────────────────────────────

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 0, 0, 0);

function cacheFileFor(repo = 'o/r') {
  return cap.cachePath(repo, process.env);
}

function writeConfigTtl(minutes) {
  const file = path.join(project.root, '.planning', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
  cfg.github.project_cache_ttl_minutes = minutes;
  fs.writeFileSync(file, JSON.stringify(cfg));
}

describe('cache location and reading (test 10)', () => {
  test('the cache lives under <gh cache dir>/capabilities/<owner>__<repo>.json, outside the repo', () => {
    const env = { DEVFLOW_GH_CACHE_DIR: '/x/gh-cache' };
    assert.equal(cap.cachePath('o/r', env), path.join('/x/gh-cache', 'capabilities', 'o__r.json'));
    assert.equal(cap.cachePath('My-Org/some.repo_x', env), path.join('/x/gh-cache', 'capabilities', 'My-Org__some.repo_x.json'));
  });

  test('with no override it is the dir gh-project already uses, under HOME read lazily', () => {
    delete process.env.DEVFLOW_GH_CACHE_DIR;
    assert.equal(
      cap.cachePath('o/r'),
      path.join(os.homedir(), '.claude', 'devflow', 'state', 'gh-project', 'capabilities', 'o__r.json'),
    );
    assert.ok(cap.cachePath('o/r').startsWith(hermetic.root), 'HOME is the hermetic temp root');
  });

  test('a hostile slug cannot leave the capabilities directory', () => {
    const env = { DEVFLOW_GH_CACHE_DIR: '/x/gh-cache' };
    const file = cap.cachePath('../../etc/passwd', env);
    assert.equal(path.dirname(file), path.join('/x/gh-cache', 'capabilities'));
  });

  test('a missing, corrupt or foreign cache file reads as a miss; age is not applied', () => {
    const env = process.env;
    assert.equal(cap.readCachedCapabilities('o/r', env), null);

    const file = cacheFileFor();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json');
    assert.equal(cap.readCachedCapabilities('o/r', env), null);

    fs.writeFileSync(file, JSON.stringify({ repo: 'someone/else', checked_at: '2026-10-01T00:00:00.000Z' }));
    assert.equal(cap.readCachedCapabilities('o/r', env), null);

    fs.writeFileSync(file, JSON.stringify({ repo: 'o/r', checked_at: 'yesterday' }));
    assert.equal(cap.readCachedCapabilities('o/r', env), null);

    // A record missing what resolveModes reads is a miss, however well-formed the JSON is.
    fs.writeFileSync(file, JSON.stringify({ repo: 'o/r', owner_type: 'Organization', checked_at: '2001-01-01T00:00:00.000Z' }));
    assert.equal(cap.readCachedCapabilities('o/r', env), null);

    const old = {
      repo: 'o/r', owner_type: 'Organization', push: true, private: false,
      org_types: { available: true, enabled: ['Objective', 'TRD', 'Decision'] },
      issue_fields: { available: true, ids: { work: 11, kind: 12 } },
      sub_issues: 'ok', dependencies: 'ok', wiki: 'ok', wiki_detail: null,
      checked_at: '2001-01-01T00:00:00.000Z', stale: false, provisional: false, final: true,
    };
    fs.writeFileSync(file, JSON.stringify(old));
    assert.equal(cap.readCachedCapabilities('o/r', env).owner_type, 'Organization');
  });
});

describe('TTL cache behaviour (test 10)', () => {
  test('a second call inside the TTL makes zero gh and zero git calls and returns the same answer', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    const first = detect({ probeIssue: probe, now: T0 });
    assert.equal(first.cached, false);
    const calls = fake.calls().length;
    const git = gitCalls.length;
    assert.ok(calls > 0 && git > 0);
    assert.ok(fs.existsSync(cacheFileFor()), 'the final answer was written');

    const second = detect({ probeIssue: probe, now: T0 + 359 * MIN });
    assert.equal(fake.calls().length, calls);
    assert.equal(gitCalls.length, git);
    assert.equal(second.cached, true);
    assert.equal(second.stale, false);
    assert.equal(second.checked_at, first.checked_at);
    const { cached: c1, ...a } = first;
    const { cached: c2, ...b } = second;
    assert.deepEqual(b, a);
    assert.deepEqual(cap.resolveModes(second), cap.resolveModes(first));
  });

  test('after the TTL it probes again and rewrites the file', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    const calls = fake.calls().length;
    const later = detect({ probeIssue: probe, now: T0 + 361 * MIN });
    assert.ok(fake.calls().length > calls);
    assert.equal(later.cached, false);
    assert.equal(later.checked_at, new Date(T0 + 361 * MIN).toISOString());
    assert.equal(cap.readCachedCapabilities('o/r', process.env).checked_at, later.checked_at);
  });

  test('the TTL comes from github.project_cache_ttl_minutes', () => {
    const fake = setup();
    writeConfigTtl(10);
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    const calls = fake.calls().length;
    detect({ probeIssue: probe, now: T0 + 9 * MIN });
    assert.equal(fake.calls().length, calls, 'inside 10 minutes');
    detect({ probeIssue: probe, now: T0 + 11 * MIN });
    assert.ok(fake.calls().length > calls, 'past 10 minutes');
  });

  test('a nonsense TTL falls back to 360 minutes', () => {
    const fake = setup();
    writeConfigTtl('soon');
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    const calls = fake.calls().length;
    detect({ probeIssue: probe, now: T0 + 359 * MIN });
    assert.equal(fake.calls().length, calls);
    detect({ probeIssue: probe, now: T0 + 361 * MIN });
    assert.ok(fake.calls().length > calls);
  });

  test('refresh:true probes again even inside the TTL', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    const calls = fake.calls().length;
    const r = detect({ probeIssue: probe, now: T0 + MIN, refresh: true });
    assert.ok(fake.calls().length > calls);
    assert.equal(r.cached, false);
  });

  test('invalidate deletes the file and the next call probes again', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    assert.ok(fs.existsSync(cacheFileFor()));
    assert.deepEqual(cap.invalidate('o/r', process.env), { ok: true, removed: true });
    assert.equal(fs.existsSync(cacheFileFor()), false);
    assert.deepEqual(cap.invalidate('o/r', process.env), { ok: true, removed: false });
    const calls = fake.calls().length;
    detect({ probeIssue: probe, now: T0 + MIN });
    assert.ok(fake.calls().length > calls);
  });

  test('the capability cache is per repo', () => {
    const fake = setup();
    detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.equal(cap.readCachedCapabilities('o/other', process.env), null);
    assert.notEqual(cap.cachePath('o/other', process.env), cap.cachePath('o/r', process.env));
  });

  test('a corrupt cache file is a miss, not a crash', () => {
    const fake = setup();
    const file = cacheFileFor();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '\u0000\u0000 garbage');
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.cached, false);
    assert.equal(cap.readCachedCapabilities('o/r', process.env).repo, 'o/r');
  });

  test('a cache directory that cannot be written never fails detection', () => {
    const fake = setup();
    const blocker = path.join(hermetic.root, 'a-file');
    fs.writeFileSync(blocker, 'x');
    process.env.DEVFLOW_GH_CACHE_DIR = path.join(blocker, 'under-a-file');
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.final, true);
  });
});

describe('what is never remembered (test 6 and the anti-patterns)', () => {
  test('an answer without a probe issue is not written, and a later call with one re-probes despite the TTL', () => {
    const fake = setup();
    const first = detect({ now: T0 });
    assert.equal(first.sub_issues, 'unknown');
    assert.equal(fs.existsSync(cacheFileFor()), false);

    const probe = fake.seedIssue({ title: 'Objective 7' });
    const second = detect({ probeIssue: probe, now: T0 + MIN });
    assert.equal(second.cached, false);
    assert.equal(second.sub_issues, 'ok');
    assert.ok(fs.existsSync(cacheFileFor()));
  });

  test('a final answer serves a later call that has no probe issue', () => {
    const fake = setup();
    detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    const calls = fake.calls().length;
    const r = detect({ now: T0 + MIN });
    assert.equal(fake.calls().length, calls);
    assert.equal(r.sub_issues, 'ok');
    assert.equal(r.cached, true);
  });

  test('a transient failure (500) on a probe is not written', () => {
    const fake = setup();
    fake.failNext(matchPath('orgs/o/issue-fields'), SERVER_ERROR);
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.equal(r.final, false);
    assert.equal(fs.existsSync(cacheFileFor()), false);
  });

  test('a repo without push access is not written', () => {
    const fake = setup({ push: false });
    detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.equal(fs.existsSync(cacheFileFor()), false);
  });

  test('a blocked wiki is not written', () => {
    wiki._setRunGit(() => ({ ok: false, status: 128, stdout: '', stderr: 'fatal: repository \'https://github.com/o/r.wiki.git/\' not found\n' }));
    const fake = setup({ hasWiki: true });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.equal(r.wiki, 'uninitialised');
    assert.equal(fs.existsSync(cacheFileFor()), false);
  });

  test('a definitive degraded answer IS written (labels on a user-owned repo are not a failure)', () => {
    const fake = setup({ ownerType: 'User', hasWiki: false });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.equal(r.final, true);
    const cached = cap.readCachedCapabilities('o/r', process.env);
    assert.equal(cached.owner_type, 'User');
    assert.deepEqual(cap.resolveModes(cached), cap.resolveModes(r));
    assert.deepEqual(cap.describeDegraded(cached), cap.describeDegraded(r));
  });
});

// ─── 11: offline ──────────────────────────────────────────────────────────────

describe('offline detection (test 11)', () => {
  test('with a cache: the stale cache, flagged, and the file is left exactly as it was', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    const online = detect({ probeIssue: probe, now: T0 });
    const before = fs.readFileSync(cacheFileFor(), 'utf-8');

    fake.setOffline(true);
    const r = detect({ probeIssue: probe, now: T0 + 400 * MIN });
    assert.equal(r.ok, true);
    assert.equal(r.stale, true);
    assert.equal(r.offline, true);
    assert.equal(r.provisional, false);
    assert.equal(r.final, false);
    assert.equal(r.checked_at, online.checked_at, 'it reports when the answer was really obtained');
    assert.equal(r.owner_type, online.owner_type);
    assert.deepEqual(cap.resolveModes(r), cap.resolveModes(online));
    assert.equal(fs.readFileSync(cacheFileFor(), 'utf-8'), before);
  });

  test('with a cache and refresh:true the stale cache is also what offline returns', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    fake.setOffline(true);
    const r = detect({ probeIssue: probe, now: T0 + MIN, refresh: true });
    assert.equal(r.stale, true);
  });

  test('a stale answer is whatever it was, even a degraded one', () => {
    const fake = setup({ ownerType: 'User', hasWiki: false });
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    fake.setOffline(true);
    const r = detect({ probeIssue: probe, now: T0 + 500 * MIN });
    assert.equal(r.stale, true);
    assert.deepEqual(cap.resolveModes(r).degraded, ['types', 'fields', 'wiki']);
  });

  test('without a cache: provisional defaults, never written', () => {
    const fake = setup();
    fake.setOffline(true);
    const r = detect({ probeIssue: 1, now: T0 });
    assert.equal(r.ok, true);
    assert.equal(r.provisional, true);
    assert.equal(r.stale, false);
    assert.equal(r.offline, true);
    assert.equal(r.final, false);
    assert.equal(r.repo, 'o/r');
    assert.equal(r.owner_type, 'unknown');
    assert.equal(r.checked_at, new Date(T0).toISOString());
    assert.equal(r.wiki, 'unknown');
    assert.equal(r.sub_issues, 'unknown');
    assert.deepEqual(r.degraded, []);
    const modes = cap.resolveModes(r);
    assert.equal(modes.types, 'native');
    assert.equal(modes.fields, 'native');
    assert.equal(modes.hierarchy, 'native');
    assert.equal(modes.pages, 'wiki');
    assert.equal(modes.writable, true);
    assert.equal(fs.existsSync(cacheFileFor()), false);
    assert.equal(fs.existsSync(path.dirname(cacheFileFor())), false, 'not even the directory');
    assert.equal(gitCalls.length, 0, 'no wiki probe while offline');
  });

  test('a network error that still carries an exit status is offline too', () => {
    const fake = setup();
    fake.failNext(matchPath('repos/o/r'), { status: 1, stderr: 'error connecting to api.github.com: dial tcp 140.82.112.5:443: connection refused' });
    const r = detect({ now: T0 });
    assert.equal(r.provisional, true);
    assert.equal(r.offline, true);
  });

  test('going offline halfway (after the repo read) is still an offline detection, and nothing is written', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    fake.failNext(matchPath('orgs/o/issue-types'), { status: null, stderr: 'could not resolve host: api.github.com' });
    const r = detect({ probeIssue: probe, now: T0 });
    assert.equal(r.provisional, true);
    assert.equal(r.offline, true);
    assert.equal(fs.existsSync(cacheFileFor()), false);
  });

  test('an offline wiki probe makes the whole detection offline rather than a blocked wiki', () => {
    wiki._setRunGit(() => ({ ok: false, status: 128, stdout: '', stderr: 'fatal: unable to access \'https://github.com/o/r.wiki.git/\': Could not resolve host: github.com\n' }));
    const fake = setup({ hasWiki: true });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.equal(r.provisional, true);
    assert.equal(r.offline, true);
    assert.equal(r.wiki, 'unknown');
    assert.equal(fs.existsSync(cacheFileFor()), false);
  });

  test('offline never turns a missing repository into a provisional answer', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    fake.failNext(matchPath('repos/o/r'), NOT_FOUND);
    const r = detect({ probeIssue: probe, now: T0 + 400 * MIN });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'repository o/r not found or not accessible');
  });

  test('coming back online replaces the stale answer', () => {
    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    fake.setOffline(true);
    assert.equal(detect({ probeIssue: probe, now: T0 + 400 * MIN }).stale, true);
    fake.setOffline(false);
    const r = detect({ probeIssue: probe, now: T0 + 401 * MIN });
    assert.equal(r.stale, false);
    assert.equal(r.cached, false);
    assert.equal(cap.readCachedCapabilities('o/r', process.env).checked_at, new Date(T0 + 401 * MIN).toISOString());
  });
});

// ─── 14: hygiene ──────────────────────────────────────────────────────────────

describe('hygiene (test 14)', () => {
  function listing(dir) {
    try {
      return fs.readdirSync(dir).sort().map((n) => `${n}:${fs.statSync(path.join(dir, n)).mtimeMs}`);
    } catch {
      return null;
    }
  }

  test('no write argv after any detection, and the real ~/.claude/devflow/state is untouched', () => {
    const realCaps = path.join(os.userInfo().homedir, '.claude', 'devflow', 'state', 'gh-project', 'capabilities');
    const before = listing(realCaps);

    const fake = setup();
    const probe = fake.seedIssue({ title: 'Objective 7' });
    detect({ probeIssue: probe, now: T0 });
    detect({ probeIssue: probe, now: T0 + 400 * MIN });
    detect({ probeIssue: probe, now: T0 + 401 * MIN, refresh: true });
    fake.setOffline(true);
    detect({ probeIssue: probe, now: T0 + 900 * MIN });
    cap.invalidate('o/r', process.env);

    assert.deepEqual(fake.writes(), []);
    assert.deepEqual(listing(realCaps), before);
  });

  test('with no cache-dir override the file still lands under the hermetic HOME', () => {
    delete process.env.DEVFLOW_GH_CACHE_DIR;
    const fake = setup();
    detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    const file = cap.cachePath('o/r');
    assert.ok(file.startsWith(hermetic.root), file);
    assert.ok(fs.existsSync(file));
  });

  test('the module never writes into the project', () => {
    const fake = setup();
    const files = () => fs.readdirSync(path.join(project.root, '.planning'), { recursive: true }).sort();
    const before = files();
    detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }), now: T0 });
    assert.deepEqual(files(), before);
  });
});

// ─── 48-06: Debug and Quick are OPTIONAL issue types (tests 10, 11) ──────────

describe('48-06 optional Debug/Quick types (tests 10, 11)', () => {
  const REQUIRED = ['Objective', 'TRD', 'Decision'];
  const caps = (enabled) => ({
    repo: 'o/r', owner_type: 'Organization', push: true,
    org_types: { available: true, enabled },
    issue_fields: { available: true, ids: { work: 11, kind: 12 } },
    sub_issues: 'ok', dependencies: 'ok', wiki: 'ok',
  });
  const OPTIONAL_SENTENCE = 'Issue types Debug/Quick are not enabled; DevFlow labels those issues devflow:type/<name>.';

  test('10a. OPTIONAL_TYPES is Debug and Quick; REQUIRED_TYPES is unchanged', () => {
    assert.deepEqual(cap.OPTIONAL_TYPES, ['Debug', 'Quick']);
    assert.ok(Object.isFrozen(cap.OPTIONAL_TYPES));
    assert.deepEqual(cap.REQUIRED_TYPES, REQUIRED);
  });

  test('10b. required types native, no Debug/Quick: types stay native, Debug/Quick read as labels, only an optional_types advisory', () => {
    const c = caps(REQUIRED);
    const modes = cap.resolveModes(c);
    assert.equal(modes.types, 'native');
    assert.deepEqual(modes.degraded, []);
    // An optional type the org lacks is not named: an absent optional entry means labels (the flusher's rule).
    assert.deepEqual(modes.types_by_name, { Objective: 'native', TRD: 'native', Decision: 'native' });
    assert.equal(Object.hasOwn(modes.types_by_name, 'Debug'), false);
    assert.deepEqual(cap.describeDegraded(c), [], 'the degraded notices are unchanged for this case');
    assert.deepEqual(cap.advisoriesOf(c), ['optional_types']);
    assert.deepEqual(cap.describeAdvisories(c), [OPTIONAL_SENTENCE]);
  });

  test('10c. only Quick missing: the advisory names Quick alone', () => {
    const c = caps([...REQUIRED, 'Debug']);
    assert.deepEqual(cap.resolveModes(c).types_by_name, { Objective: 'native', TRD: 'native', Decision: 'native', Debug: 'native' });
    assert.deepEqual(cap.describeAdvisories(c), ['Issue type Quick is not enabled; DevFlow labels those issues devflow:type/quick.']);
  });

  test('10d. a live probe on an org with all five types records Debug and Quick as enabled', () => {
    const fake = setup({
      types: [
        { id: 1, name: 'Objective', is_enabled: true }, { id: 2, name: 'TRD', is_enabled: true },
        { id: 3, name: 'Decision', is_enabled: true }, { id: 4, name: 'Debug', is_enabled: true },
        { id: 5, name: 'Quick', is_enabled: true }, { id: 9, name: 'Bug', is_enabled: true },
      ],
    });
    const r = detect({ probeIssue: fake.seedIssue({ title: 'Objective 7' }) });
    assert.deepEqual(r.org_types, { available: true, enabled: [...REQUIRED, 'Debug', 'Quick'] });
    assert.deepEqual(r.degraded, []);
  });

  test('11a. all five enabled: every type native, no advisory', () => {
    const c = caps([...REQUIRED, 'Debug', 'Quick']);
    const modes = cap.resolveModes(c);
    assert.equal(modes.types, 'native');
    assert.deepEqual(modes.types_by_name, { Objective: 'native', TRD: 'native', Decision: 'native', Debug: 'native', Quick: 'native' });
    assert.deepEqual(modes.degraded, []);
    assert.deepEqual(cap.advisoriesOf(c), []);
    assert.deepEqual(cap.describeAdvisories(c), []);
  });

  test('11b. no types at all: 47\'s degraded notice text is unchanged and there is no optional advisory', () => {
    const c = caps([]);
    const modes = cap.resolveModes(c);
    assert.equal(modes.types, 'labels');
    assert.deepEqual(modes.types_by_name, { Objective: 'labels', TRD: 'labels', Decision: 'labels' });
    assert.deepEqual(modes.degraded, ['types']);
    assert.deepEqual(cap.describeDegraded(c), [
      'Issue types not enabled for the organization: Objective, TRD, Decision; DevFlow records those as devflow:type/<name> labels instead.',
    ]);
    assert.deepEqual(cap.advisoriesOf(c), [], 'the optional advisory only appears when the required types are native');
  });

  test('11c. Debug/Quick enabled but a required type missing: the aggregate is still decided by the required types', () => {
    const c = caps(['Objective', 'TRD', 'Debug', 'Quick']);
    const modes = cap.resolveModes(c);
    assert.equal(modes.types, 'labels');
    assert.equal(modes.types_by_name.Decision, 'labels');
    assert.equal(modes.types_by_name.Debug, 'native');
    assert.deepEqual(modes.degraded, ['types']);
    assert.deepEqual(cap.advisoriesOf(c), []);
  });
});
