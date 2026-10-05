'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractFrontmatter, reconstructFrontmatter, spliceFrontmatter, setFrontmatterField, parseMustHavesBlock, FRONTMATTER_SCHEMAS } = require('./frontmatter.cjs');

test('extractFrontmatter — baseline parse (existing fields unchanged)', () => {
  const c = `---\nkind: api\ndefault_work: feature\n---\n\n# Test`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.kind, 'api');
  assert.strictEqual(fm.default_work, 'feature');
});

test('extractFrontmatter — PROJECT.md new fields', () => {
  const c = `---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/devflow-claude\norg_project: PVT_kwDODwqLrc4BRsOP\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.github_repo, 'AO-Cyber-Systems/devflow-claude');
  assert.strictEqual(fm.org_project, 'PVT_kwDODwqLrc4BRsOP');
});

test('extractFrontmatter — OBJECTIVE.md new fields with full ref', () => {
  const c = `---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\nparent_issue: AO-Cyber-Systems/devflow-claude#9\norg_initiative: devflow-internal-alpha\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(fm.org_initiative, 'devflow-internal-alpha');
});

test('extractFrontmatter — OBJECTIVE.md shorthand parse', () => {
  // The # character makes the parser quote-handle it. Both quoted and unquoted should work.
  const cQuoted = `---\nwork: feature\nparent_issue: "#9"\n---\n\n# x`;
  const cUnquoted = `---\nwork: feature\nparent_issue: #9\n---\n\n# x`;
  const fmQ = extractFrontmatter(cQuoted);
  const fmU = extractFrontmatter(cUnquoted);
  assert.strictEqual(fmQ.parent_issue, '#9', 'quoted shorthand should yield #9 literal');
  assert.strictEqual(fmU.parent_issue, '#9', 'unquoted shorthand should yield #9 literal');
});

test('extractFrontmatter — absence of new fields is silent', () => {
  const c = `---\nwork: feature\n---\n\n# Existing file`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, undefined);
  assert.strictEqual(fm.parent_issue, undefined);
  assert.strictEqual(fm.org_initiative, undefined);
  assert.strictEqual(fm.org_project, undefined);
});

test('extractFrontmatter — TRD frontmatter per-TRD github_issue override', () => {
  const c = `---\nobjective: 01-test\ntrd: 01\ntype: tdd\ngithub_issue: AO-Cyber-Systems/devflow-claude#52\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#52');
});

test('reconstructFrontmatter — preserves new fields round-trip', () => {
  const orig = {
    work: 'feature',
    github_issue: 'AO-Cyber-Systems/devflow-claude#20',
    parent_issue: '#9',
  };
  const yaml = reconstructFrontmatter(orig);
  assert.match(yaml, /github_issue:.*devflow-claude#20/);
  assert.match(yaml, /parent_issue:.*"#9"/, 'shorthand should round-trip with quotes (parser quotes # values)');
});

test('extractFrontmatter — combined: all new + existing fields together', () => {
  const c = `---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\nparent_issue: "#9"\norg_initiative: devflow-internal-alpha\norg_project: PVT_kwDODwqLrc4BRsOP\noverrides:\n  tdd: strict\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, '#9');
  assert.strictEqual(fm.org_initiative, 'devflow-internal-alpha');
  assert.strictEqual(fm.org_project, 'PVT_kwDODwqLrc4BRsOP');
  assert.deepStrictEqual(fm.overrides, { tdd: 'strict' });
});

// ── Flutter UI optional frontmatter fields (REQ-10-01) ──────────────────────
//
// These 12 cases document and guard the permissive extractFrontmatter parser's
// handling of the 6 new optional fields introduced for type: ui TRDs.
// Tests are expected to PASS on first run — this is regression-coverage of
// existing parser behavior, not test-driven introduction of new behavior.
//
// Fixture strings are hand-built inline template literals per CLAUDE.md
// TDD Playbook habit 4: no LLM-generated test data.
//
// Parser behavior notes for Cases 6-10:
//   The extractFrontmatter stack-based parser handles scalar fields, inline
//   arrays, and nested plain objects. Block-array items that contain nested
//   key-value sub-fields (e.g., api_contract: [{path, sha}]) are captured as
//   strings of the form "path: value" — the parser flattens "- key: val" to a
//   string literal. Downstream consumers that need structured artifact data use
//   parseMustHavesBlock() instead. These tests document that exact behavior so
//   any future parser change that breaks it is caught immediately.

// Shared fixture for Cases 1-10. Hand-built, deterministic.
const FLUTTER_UI_FIXTURE = `---
objective: 10-test
trd: 99
type: ui
stack: flutter
platform: [mobile, web]
state_management: riverpod
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [REQ-10-01]
api_contract:
  - path: lib/api/user_client.dart
    sha: ab12cd34ef
  - path: ../eden-biz-go/proto/users.proto
    sha: ef56gh78ij
must_haves:
  truths:
    - User sees loading spinner
  artifacts:
    - path: lib/screens/user_list_screen.dart
      provides: User list screen
      contains: AsyncValue
      states: [loading, data, error, empty]
      tests:
        widget: test/screens/user_list_screen_test.dart
        integration: integration_test/user_list_flow_test.dart
        maestro: .maestro/user_list.yaml
  key_links: []
---
# body
`;

test('Case 1 (REQ-10-01) — type: ui parses as string literal', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.strictEqual(fm.type, 'ui');
});

test('Case 2 (REQ-10-01) — stack: flutter parses as string literal', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.strictEqual(fm.stack, 'flutter');
});

test('Case 3 (REQ-10-01) — platform: [mobile, web] inline array parses as two-element array', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.deepStrictEqual(fm.platform, ['mobile', 'web']);
});

test('Case 4 (REQ-10-01) — platform: [mobile] single-element inline array parses as one-element array', () => {
  const mini = `---\nplatform: [mobile]\n---\n`;
  const fm = extractFrontmatter(mini);
  assert.deepStrictEqual(fm.platform, ['mobile']);
});

test('Case 5 (REQ-10-01) — state_management: riverpod parses as string literal', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.strictEqual(fm.state_management, 'riverpod');
});

test('Case 6 (REQ-10-01) — api_contract block array: parser captures dash-prefixed items as strings', () => {
  // extractFrontmatter treats "- key: value" array items as the string "key: value".
  // This documents the existing permissive parser behavior for block arrays whose
  // items contain nested key-value pairs. Consumers needing structured {path, sha}
  // objects must parse the raw YAML themselves; extractFrontmatter is intentionally
  // permissive rather than strict. This test guards against future regressions that
  // would silently drop or corrupt the api_contract field entirely.
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.ok(Array.isArray(fm.api_contract), 'api_contract should be parsed as an array');
  assert.strictEqual(fm.api_contract.length, 2, 'api_contract should contain 2 items');
  assert.ok(
    fm.api_contract[0].includes('lib/api/user_client.dart'),
    'first api_contract item should include the path value'
  );
  assert.ok(
    fm.api_contract[1].includes('eden-biz-go/proto/users.proto'),
    'second api_contract item should include the path value'
  );
});

test('Case 7 (REQ-10-01) — must_haves.artifacts: parser captures block-array items as strings', () => {
  // extractFrontmatter treats "- path: value" artifact items as string "path: value".
  // The states[] and tests{} sub-fields are not accessible via extractFrontmatter for
  // block-array items; use parseMustHavesBlock() for structured artifact access.
  // This test documents the behavior as a regression guard.
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.ok(Array.isArray(fm.must_haves.artifacts), 'artifacts should be parsed as an array');
  assert.strictEqual(fm.must_haves.artifacts.length, 1, 'should have 1 artifact item');
  assert.ok(
    fm.must_haves.artifacts[0].includes('lib/screens/user_list_screen.dart'),
    'artifact item should include the path value'
  );
});

test('Case 8 (REQ-10-01) — must_haves.truths: block array of simple strings parses correctly', () => {
  // Simple string block arrays (no nested key-value) parse into string arrays as expected.
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.deepStrictEqual(fm.must_haves.truths, ['User sees loading spinner']);
});

test('Case 9 (REQ-10-01) — must_haves.key_links: empty block array parses as empty array', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.deepStrictEqual(fm.must_haves.key_links, []);
});

test('Case 10 (REQ-10-01) — platform: [mobile, web] parses as two distinct values, not one merged string', () => {
  // Regression: inline array must not be parsed as a single string "[mobile, web]".
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.ok(!fm.platform.some(v => v.includes(',')), 'no platform item should contain a comma');
  assert.ok(fm.platform.includes('mobile'), 'platform array should contain "mobile"');
  assert.ok(fm.platform.includes('web'), 'platform array should contain "web"');
});

test('Case 11 (REQ-10-01) — back-compat: TRD without any Flutter UI fields parses unchanged', () => {
  // A standard TRD without any of the 6 new fields must parse identically to its
  // pre-objective-10 form: no extra keys, no error, baseline fields intact.
  const BASELINE_FIXTURE = `---
objective: 99-foo
trd: 01
type: standard
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [REQ-99-01]
must_haves:
  truths: []
  artifacts: []
  key_links: []
---
# body
`;
  const fm = extractFrontmatter(BASELINE_FIXTURE);
  // No new Flutter UI fields present:
  assert.strictEqual(fm.stack, undefined, 'stack should be absent');
  assert.strictEqual(fm.platform, undefined, 'platform should be absent');
  assert.strictEqual(fm.state_management, undefined, 'state_management should be absent');
  assert.strictEqual(fm.api_contract, undefined, 'api_contract should be absent');
  // Baseline fields still parse correctly:
  assert.strictEqual(fm.type, 'standard');
  assert.strictEqual(fm.objective, '99-foo');
  assert.strictEqual(fm.trd, '01');
});

test('Case 12 (REQ-10-01) — FRONTMATTER_SCHEMAS.trd.required is unchanged (8 baseline fields)', () => {
  // Regression guard: if any new Flutter UI field is incorrectly added to the
  // required schema, non-Flutter TRDs would fail validation. This test catches
  // that immediately. The 8 required fields are fixed — new fields are optional
  // by design and enforced semantically by the planner (TRD 10-03).
  assert.deepStrictEqual(
    FRONTMATTER_SCHEMAS.trd.required.slice().sort(),
    ['autonomous', 'depends_on', 'files_modified', 'must_haves', 'objective', 'trd', 'type', 'wave'].sort()
  );
});

// ─── setFrontmatterField (TRD 46-06, F1-F7) ──────────────────────────────────

test.describe('setFrontmatterField', () => {
  let dir;
  test.beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-setfm-')); });
  test.afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const write = (name, content) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content, 'utf-8');
    return p;
  };

  const WITH_COMMENTS = [
    '---',
    'objective: 46-github-sync-foundations',
    'work: feature',
    '# OPTIONAL: set manually',
    '# github_issue: owner/repo#NN',
    'parent_issue:',
    'depends_on: [45]',
    '---',
    '',
    '# Body',
    'github_issue: body-text-stays',
    '',
  ].join('\n');

  test('F1: appends a missing key as the last frontmatter line; comments, order and body are byte-identical', () => {
    const p = write('OBJECTIVE.md', WITH_COMMENTS);
    const r = setFrontmatterField(p, 'github_issue', 'o/r#1');
    assert.deepStrictEqual(r, { ok: true, changed: true });
    const expected = WITH_COMMENTS.replace('depends_on: [45]\n---', 'depends_on: [45]\ngithub_issue: o/r#1\n---');
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), expected);
  });

  test('F2: replaces an existing key in place; nothing else changes', () => {
    const src = WITH_COMMENTS.replace('work: feature', 'work: feature\ngithub_issue: o/r#1');
    const p = write('OBJECTIVE.md', src);
    const r = setFrontmatterField(p, 'github_issue', 'o/r#2');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.changed, true);
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), src.replace('github_issue: o/r#1', 'github_issue: o/r#2'));
  });

  test('F3: an equal value changes neither bytes nor mtime', () => {
    const src = WITH_COMMENTS.replace('work: feature', 'work: feature\ngithub_issue: o/r#1');
    const p = write('OBJECTIVE.md', src);
    const old = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(p, old, old);
    const before = fs.statSync(p).mtimeMs;
    const r = setFrontmatterField(p, 'github_issue', 'o/r#1');
    assert.deepStrictEqual(r, { ok: true, changed: false });
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), src);
    assert.strictEqual(fs.statSync(p).mtimeMs, before);
  });

  test('F3b: a quoted existing value equal to the new value is unchanged', () => {
    const src = '---\ngithub_issue: "o/r#1"\n---\nbody\n';
    const p = write('OBJECTIVE.md', src);
    const r = setFrontmatterField(p, 'github_issue', 'o/r#1');
    assert.strictEqual(r.changed, false);
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), src);
  });

  test('F4: ifAbsentOrEqual reports a conflict and keeps the file when a different value exists', () => {
    const src = '---\ngithub_issue: o/r#1\n---\nbody\n';
    const p = write('OBJECTIVE.md', src);
    const r = setFrontmatterField(p, 'github_issue', 'o/r#2', { ifAbsentOrEqual: true });
    assert.deepStrictEqual(r, { ok: true, changed: false, conflict: true, existing: 'o/r#1' });
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), src);
  });

  test('F4b: ifAbsentOrEqual treats a bare `key:` as absent and fills it; equal value is not a conflict', () => {
    const p = write('a.md', '---\ngithub_issue:\nwork: feature\n---\nb\n');
    const r = setFrontmatterField(p, 'github_issue', 'o/r#3', { ifAbsentOrEqual: true });
    assert.strictEqual(r.changed, true);
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), '---\ngithub_issue: o/r#3\nwork: feature\n---\nb\n');
    const again = setFrontmatterField(p, 'github_issue', 'o/r#3', { ifAbsentOrEqual: true });
    assert.deepStrictEqual(again, { ok: true, changed: false });
  });

  test('F5: a file without a frontmatter block is left untouched with a warning; a missing file is ok:false', () => {
    const src = '# Just a heading\n\ngithub_issue: nope\n';
    const p = write('plain.md', src);
    const r = setFrontmatterField(p, 'github_issue', 'o/r#1');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.changed, false);
    assert.match(r.warning, /frontmatter/i);
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), src);

    const missing = setFrontmatterField(path.join(dir, 'nope.md'), 'github_issue', 'o/r#1');
    assert.strictEqual(missing.ok, false);
    assert.ok(missing.error);
  });

  test('F6: github_issue text in the BODY is never touched', () => {
    const src = '---\nwork: feature\n---\n\ngithub_issue: body-old\n---\ngithub_issue: body-old-2\n';
    const p = write('OBJECTIVE.md', src);
    setFrontmatterField(p, 'github_issue', 'o/r#9');
    assert.strictEqual(
      fs.readFileSync(p, 'utf-8'),
      '---\nwork: feature\ngithub_issue: o/r#9\n---\n\ngithub_issue: body-old\n---\ngithub_issue: body-old-2\n',
    );
  });

  test('F7: owner/repo#12 is written unquoted and round-trips through extractFrontmatter', () => {
    const p = write('OBJECTIVE.md', '---\nwork: feature\n---\nbody\n');
    setFrontmatterField(p, 'github_issue', 'owner/repo#12');
    const content = fs.readFileSync(p, 'utf-8');
    assert.match(content, /^github_issue: owner\/repo#12$/m);
    assert.strictEqual(extractFrontmatter(content).github_issue, 'owner/repo#12');
  });

  test('F8: CRLF files keep CRLF (appended and replaced lines)', () => {
    const src = '---\r\nwork: feature\r\ngithub_issue: o/r#1\r\n---\r\nbody\r\n';
    const p = write('crlf.md', src);
    setFrontmatterField(p, 'github_issue', 'o/r#2');
    setFrontmatterField(p, 'parent_issue', 'o/r#1');
    assert.strictEqual(
      fs.readFileSync(p, 'utf-8'),
      '---\r\nwork: feature\r\ngithub_issue: o/r#2\r\nparent_issue: o/r#1\r\n---\r\nbody\r\n',
    );
  });

  test('F9: a key that is a prefix/regex-special string matches only its own line', () => {
    const src = '---\ngithub_issue_extra: keep\nwork: feature\n---\n';
    const p = write('prefix.md', src);
    setFrontmatterField(p, 'github_issue', 'o/r#1');
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), '---\ngithub_issue_extra: keep\nwork: feature\ngithub_issue: o/r#1\n---\n');
    const p2 = write('dot.md', '---\nabc: 1\n---\n');
    setFrontmatterField(p2, 'a.c', 'x');
    assert.strictEqual(fs.readFileSync(p2, 'utf-8'), '---\nabc: 1\na.c: x\n---\n');
  });

  test('F10: replacing a key whose old value is a block list removes the orphaned list items', () => {
    const src = '---\nlabels:\n  - a\n  - b\nwork: feature\n---\n';
    const p = write('block.md', src);
    setFrontmatterField(p, 'labels', '[c]');
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), '---\nlabels: [c]\nwork: feature\n---\n');
  });

  test('F11: an empty frontmatter block gets the key; a newline in key or value is refused', () => {
    const p = write('empty.md', '---\n---\nbody\n---\nmore\n');
    setFrontmatterField(p, 'github_issue', 'o/r#1');
    assert.strictEqual(fs.readFileSync(p, 'utf-8'), '---\ngithub_issue: o/r#1\n---\nbody\n---\nmore\n');
    const bad = setFrontmatterField(p, 'github_issue', 'a\nb');
    assert.strictEqual(bad.ok, false);
    const badKey = setFrontmatterField(p, 'a\nb', 'x');
    assert.strictEqual(badKey.ok, false);
  });
});

// ─── TRD 48-14: frontmatter set|merge in local mode (characterization) and store mode ─

const strict = require('node:assert/strict');
const { storeCliProject } = require('./__fixtures__/store-cli-fixtures.cjs');
const { STORE_FIXTURE } = require('./__fixtures__/gh-store-fixtures.cjs');

const FM_TRD_REL = `objectives/${STORE_FIXTURE.objectiveDir}/07-01-alpha-TRD.md`;
const FM_OBJ_REL = `objectives/${STORE_FIXTURE.objectiveDir}/OBJECTIVE.md`;

function withFmProject(opts, fn) {
  const p = storeCliProject(opts);
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

/** The text after a file's frontmatter block (starting at the newline that follows the closing `---`). */
const bodyOf = (text) => text.slice(text.indexOf('\n---\n', 3) + 5);

test('48-14 char 5: local frontmatter set on a TRD rewrites the block exactly as today', () => {
  withFmProject({ store: false }, (p) => {
    const before = STORE_FIXTURE.trds['07-01-alpha-TRD.md'];
    const r = p.run(['frontmatter', 'set', `.planning/${FM_TRD_REL}`, '--field', 'status', '--value', 'done']);
    strict.equal(r.status, 0, r.stderr);
    strict.equal(r.stdout, JSON.stringify({ updated: true, field: 'status', value: 'done' }, null, 2));
    strict.equal(p.read(FM_TRD_REL), [
      '---',
      'objective: 07-store-demo',
      'trd: 01',
      'type: tdd',
      'wave: 1',
      'depends_on: []',
      'files_modified: [src/key.cjs, src/key.test.cjs]',
      'autonomous: true',
      'requirements: [STO-01]',
      'must_haves:',
      "  truths: [parseKey('07-01') returns {objective: 7, trd: 1}]",
      'status: done',
      '---',
      '',
    ].join('\n') + bodyOf(before));
    strict.deepEqual(p.ghCalls(), []);
    strict.deepEqual(p.ledgerEntries(), {});
  });
});

test('48-14 char 5b: local frontmatter merge on OBJECTIVE.md rewrites the block exactly as today', () => {
  withFmProject({ store: false }, (p) => {
    const r = p.run(['frontmatter', 'merge', `.planning/${FM_OBJ_REL}`, '--data', '{"status":"in_progress","wave":2}']);
    strict.equal(r.status, 0, r.stderr);
    strict.equal(r.stdout, JSON.stringify({ merged: true, fields: ['status', 'wave'] }, null, 2));
    strict.equal(p.read(FM_OBJ_REL), [
      '---',
      'objective: 07-store-demo',
      'work: feature',
      'status: in_progress',
      'milestone: v9.9',
      'depends_on: Objective 6',
      'wave: 2',
      '---',
      '',
    ].join('\n') + bodyOf(STORE_FIXTURE.objective));
    strict.deepEqual(p.ghCalls(), []);
  });
});

test('48-14 store 6: frontmatter set on a cached TRD is refused naming plan put-trd and planning draft; file unchanged', () => {
  withFmProject({ store: true }, (p) => {
    const before = p.read(FM_TRD_REL);
    const r = p.run(['frontmatter', 'set', `.planning/${FM_TRD_REL}`, '--field', 'status', '--value', 'done']);
    strict.equal(r.status, 1);
    strict.ok(r.stderr.includes(`${FM_TRD_REL} is a GitHub-backed cache file in store mode`), r.stderr);
    strict.match(r.stderr, /df-tools plan put-trd/);
    strict.ok(r.stderr.includes(`df-tools planning draft ${FM_TRD_REL}`), r.stderr);
    strict.equal(p.read(FM_TRD_REL), before);
    strict.deepEqual(p.ghCalls(), []);
  });
});

test('48-14 store 6b: an absolute path to the cache file is refused the same way', () => {
  withFmProject({ store: true }, (p) => {
    const before = p.read(FM_TRD_REL);
    const r = p.run(['frontmatter', 'set', p.planning(FM_TRD_REL), '--field', 'status', '--value', 'done']);
    strict.equal(r.status, 1);
    strict.match(r.stderr, /plan put-trd/);
    strict.equal(p.read(FM_TRD_REL), before);
  });
});

test('48-14 store 6c: frontmatter set on a runtime planning file and on a non-planning file works as today', () => {
  withFmProject({ store: true }, (p) => {
    fs.mkdirSync(p.planning('.trd-progress'), { recursive: true });
    fs.writeFileSync(p.planning('.trd-progress/7-01.md'), '---\nstatus: running\n---\n\nprogress\n');
    const a = p.run(['frontmatter', 'set', '.planning/.trd-progress/7-01.md', '--field', 'status', '--value', 'done']);
    strict.equal(a.status, 0, a.stderr);
    strict.equal(p.read('.trd-progress/7-01.md'), '---\nstatus: done\n---\n\nprogress\n');

    fs.writeFileSync(path.join(p.root, 'notes.md'), '---\ntitle: x\n---\n\nbody\n');
    const b = p.run(['frontmatter', 'set', 'notes.md', '--field', 'title', '--value', 'y']);
    strict.equal(b.status, 0, b.stderr);
    strict.equal(fs.readFileSync(path.join(p.root, 'notes.md'), 'utf8'), '---\ntitle: y\n---\n\nbody\n');
    strict.deepEqual(p.ghCalls(), []);
  });
});

test('48-14 store 7: frontmatter merge on OBJECTIVE.md is refused naming objective put; file unchanged', () => {
  withFmProject({ store: true }, (p) => {
    const r = p.run(['frontmatter', 'merge', `.planning/${FM_OBJ_REL}`, '--data', '{"status":"in_progress"}']);
    strict.equal(r.status, 1);
    strict.match(r.stderr, /GitHub-backed cache file in store mode/);
    strict.match(r.stderr, /df-tools objective put/);
    strict.equal(p.read(FM_OBJ_REL), STORE_FIXTURE.objective);
  });
});

test('48-14 store 7b: frontmatter get and validate still read cache files in store mode', () => {
  withFmProject({ store: true }, (p) => {
    const r = p.run(['frontmatter', 'get', `.planning/${FM_OBJ_REL}`, '--field', 'status']);
    strict.equal(r.status, 0, r.stderr);
    strict.deepEqual(JSON.parse(r.stdout), { status: 'planned' });
  });
});

// ─── TRD 43-03 (D11): parseMustHavesBlock follows the real must_haves indent ──
//
// `must_haves:` children sit at 2 spaces (items at 4, keys at 6) in the template and
// in every real TRD. The parser used to hardcode 4/6/8, so `verify artifacts` printed
// "No must_haves.artifacts found" for all of them. These fixtures are hand-built.

const { spawnSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

/** A TRD in the template layout: must_haves children at 2, items at 4, keys at 6. */
const MH_2_4 = [
  '---',
  'objective: 43-test',
  'trd: "01"',
  'must_haves:',
  '  truths:',
  '    - "first truth"',
  '    - second truth',
  '  artifacts:',
  '    - path: lib/a.js',
  '      provides: "the a module"',
  '    - path: lib/b.js',
  '      provides: "the b module"',
  '      min_lines: 3',
  '  key_links:',
  '    - "lib/a.js -> lib/b.js -> require"',
  '---',
  '# body',
  '',
].join('\n');

/** The legacy layout: must_haves children at 4, items at 6, keys at 8. */
const MH_4_6 = [
  '---',
  'objective: 43-test',
  'must_haves:',
  '    truths:',
  '      - "legacy truth"',
  '    artifacts:',
  '      - path: lib/a.js',
  '        provides: "legacy a"',
  '        min_lines: 2',
  '      - path: lib/b.js',
  '        provides: "legacy b"',
  '    key_links:',
  '      - from: lib/a.js',
  '        to: lib/b.js',
  '        via: "require"',
  '---',
  '# body',
  '',
].join('\n');

/** The oldest shape: `must_haves:` itself indented, its blocks at 4. */
const MH_NESTED = [
  '---',
  'objective: 43-test',
  'wrap:',
  '  must_haves:',
  '    artifacts:',
  '      - path: lib/c.js',
  '        provides: "nested c"',
  '---',
  '# body',
  '',
].join('\n');

function withMhDir(trdText, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-mh-'));
  try {
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.writeFileSync(path.join(dir, 'lib', 'a.js'), "// a\nrequire('lib/b.js');\n// a end\n");
    fs.writeFileSync(path.join(dir, 'lib', 'b.js'), '// b\n// b2\n// b3\n');
    const trd = path.join(dir, 'TEST-TRD.md');
    fs.writeFileSync(trd, trdText);
    return fn({ dir, trd });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runVerify(dir, sub, trd) {
  const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', dir, 'verify', sub, trd], { encoding: 'utf-8' });
  return { status: r.status, stderr: r.stderr, json: r.stdout ? JSON.parse(r.stdout) : null };
}

test('43-03 D11 #1: `verify artifacts` lists both artifacts of a 2/4-layout TRD', () => {
  withMhDir(MH_2_4, ({ dir, trd }) => {
    const r = runVerify(dir, 'artifacts', trd);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.json.error, undefined, 'must not report "No must_haves.artifacts found"');
    assert.strictEqual(r.json.total, 2);
    assert.deepStrictEqual(r.json.artifacts.map((a) => a.path), ['lib/a.js', 'lib/b.js']);
    assert.strictEqual(r.json.all_passed, true);
  });
});

test('43-03 D11 #2: every objective-42 TRD yields a non-empty artifact list', (t) => {
  const dir = path.join(REPO_ROOT, '.planning', 'objectives', '42-codebase-aware-stack-drafter');
  if (!fs.existsSync(dir)) return t.skip('objective 42 planning files not present');
  const trds = fs.readdirSync(dir).filter((f) => /^42-\d+-TRD\.md$/.test(f)).sort();
  assert.ok(trds.length >= 15, `expected 15 TRDs, found ${trds.length}`);
  for (const f of trds) {
    const items = parseMustHavesBlock(fs.readFileSync(path.join(dir, f), 'utf-8'), 'artifacts');
    assert.ok(items.length > 0, `${f}: artifacts must be non-empty`);
    assert.ok(items.every((a) => a && typeof a === 'object' && typeof a.path === 'string' && a.path !== ''), `${f}: every artifact has a path`);
  }
});

test('43-03 D11 #3: 2/4 layout gives {path, provides} artifacts and string truths', () => {
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'artifacts'), [
    { path: 'lib/a.js', provides: 'the a module' },
    { path: 'lib/b.js', provides: 'the b module', min_lines: 3 },
  ]);
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'truths'), ['first truth', 'second truth']);
});

test('43-03 D11 #4: the legacy 4/6/8 layout still parses, whether must_haves is at column 0 or indented', () => {
  assert.deepStrictEqual(parseMustHavesBlock(MH_4_6, 'artifacts'), [
    { path: 'lib/a.js', provides: 'legacy a', min_lines: 2 },
    { path: 'lib/b.js', provides: 'legacy b' },
  ]);
  assert.deepStrictEqual(parseMustHavesBlock(MH_4_6, 'truths'), ['legacy truth']);
  assert.deepStrictEqual(parseMustHavesBlock(MH_4_6, 'key_links'), [
    { from: 'lib/a.js', to: 'lib/b.js', via: 'require' },
  ]);
  assert.deepStrictEqual(parseMustHavesBlock(MH_NESTED, 'artifacts'), [
    { path: 'lib/c.js', provides: 'nested c' },
  ]);
});

test('43-03 D11 #5: a quoted value with inner quotes keeps its full text', () => {
  const text = [
    '---',
    'must_haves:',
    '  artifacts:',
    '    - path: lib/a.js',
    '      provides: "has \\"x\\" key"',
    '  truths:',
    '    - "a \\"quoted\\" truth"',
    '---',
    '',
  ].join('\n');
  assert.deepStrictEqual(parseMustHavesBlock(text, 'artifacts'), [{ path: 'lib/a.js', provides: 'has "x" key' }]);
  assert.deepStrictEqual(parseMustHavesBlock(text, 'truths'), ['a "quoted" truth']);
});

test('43-03 D11 #6a: string key_links are reported as not machine-checkable, not skipped', () => {
  withMhDir(MH_2_4, ({ dir, trd }) => {
    const r = runVerify(dir, 'key-links', trd);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.json.error, undefined);
    assert.strictEqual(r.json.links.length, 1, 'the string link is listed');
    assert.deepStrictEqual(
      { link: r.json.links[0].link, status: r.json.links[0].status, verified: r.json.links[0].verified },
      { link: 'lib/a.js -> lib/b.js -> require', status: 'not machine-checkable', verified: false },
    );
    assert.strictEqual(r.json.unchecked, 1);
    assert.strictEqual(r.json.total, 0, 'unchecked strings are not counted as checkable links');
    assert.strictEqual(r.json.all_verified, true, 'strings must not make a plan fail verification');
  });
});

test('43-03 D11 #6b: object-form key_links are checked as before, beside string ones', () => {
  const mixed = [
    '---',
    'must_haves:',
    '  key_links:',
    '    - from: lib/a.js',
    '      to: lib/b.js',
    '      via: "require"',
    '    - from: lib/a.js',
    '      to: lib/missing.js',
    '    - "free text link"',
    '---',
    '',
  ].join('\n');
  withMhDir(mixed, ({ dir, trd }) => {
    const r = runVerify(dir, 'key-links', trd);
    assert.strictEqual(r.status, 0, r.stderr);
    const checked = r.json.links.filter((l) => l.status !== 'not machine-checkable');
    assert.deepStrictEqual(checked.map((l) => [l.to, l.verified]), [['lib/b.js', true], ['lib/missing.js', false]]);
    assert.strictEqual(r.json.total, 2);
    assert.strictEqual(r.json.verified, 1);
    assert.strictEqual(r.json.unchecked, 1);
    assert.strictEqual(r.json.all_verified, false, 'a real unverified link still fails');
  });
});

test('43-03 D11 #7: a block ends at the next sibling key, in both layouts', () => {
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'artifacts').map((a) => a.path), ['lib/a.js', 'lib/b.js']);
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'truths'), ['first truth', 'second truth']);
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'key_links'), ['lib/a.js -> lib/b.js -> require']);
  assert.deepStrictEqual(parseMustHavesBlock(MH_4_6, 'artifacts').map((a) => a.path), ['lib/a.js', 'lib/b.js']);
  assert.deepStrictEqual(parseMustHavesBlock(MH_4_6, 'truths'), ['legacy truth']);
});

test('56-01 #9: the block name goes through escapeRegExp: the real names read as before, a metacharacter name is literal', () => {
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'artifacts'), [
    { path: 'lib/a.js', provides: 'the a module' },
    { path: 'lib/b.js', provides: 'the b module', min_lines: 3 },
  ]);
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'truths'), ['first truth', 'second truth']);
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'key_links'), ['lib/a.js -> lib/b.js -> require']);
  assert.deepStrictEqual(parseMustHavesBlock(MH_4_6, 'key_links'), [{ from: 'lib/a.js', to: 'lib/b.js', via: 'require' }]);
  // Unescaped, `artifact.` compiled `.` as a wildcard and read the `artifacts:` block.
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'artifact.'), []);
  assert.deepStrictEqual(parseMustHavesBlock(MH_2_4, 'key_link.'), []);
});

test('43-03 D11 #8: inline-array and single-quoted values parse as `verify artifacts` needs them', () => {
  // 76 real TRDs write `exports: ["a", "b"]` and 7 write `contains: 'subagent_type="x"'`.
  // Left as raw text, `verify artifacts` would report "Missing export: [...]" for files
  // that are fine, the moment the layout fix lets it read those TRDs at all.
  const text = [
    '---',
    'must_haves:',
    '  artifacts:',
    '    - path: lib/a.js',
    '      exports: ["alpha", "beta, with comma", gamma]',
    '      states: []',
    "      contains: 'subagent_type=\"planner\"'",
    "      provides: 'it''s here'",
    '---',
    '',
  ].join('\n');
  assert.deepStrictEqual(parseMustHavesBlock(text, 'artifacts'), [{
    path: 'lib/a.js',
    exports: ['alpha', 'beta, with comma', 'gamma'],
    states: [],
    contains: 'subagent_type="planner"',
    provides: "it's here",
  }]);
});

test('43-03 D11 #8b: `verify artifacts` checks each inline-array export on its own', () => {
  const trd = [
    '---',
    'must_haves:',
    '  artifacts:',
    '    - path: lib/b.js',
    '      exports: ["// b", "// b3"]',
    '    - path: lib/b.js',
    '      exports: ["// b", "// nope"]',
    '---',
    '',
  ].join('\n');
  withMhDir(trd, ({ dir, trd: trdPath }) => {
    const r = runVerify(dir, 'artifacts', trdPath);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepStrictEqual(r.json.artifacts.map((a) => a.issues), [[], ['Missing export: // nope']]);
  });
});

// ─── TRD 52-05: multi-line strings as YAML block scalars ─────────────────────
// A string holding a newline used to be written on one line, so extractFrontmatter read back only its first line,
// turned a `Reason: ...` line into a spurious key, and ended the frontmatter early at a `---` line.

test('52-05 #6: reconstruct writes a multi-line string as a |- block indented two past its key, top level and nested', () => {
  strict.equal(reconstructFrontmatter({ a: 'x\ny' }), 'a: |-\n  x\n  y');
  strict.equal(reconstructFrontmatter({ o: { k: 'x\ny' } }), 'o:\n  k: |-\n    x\n    y');
  // CRLF is normalised, an empty content line is an empty line (no trailing spaces), trailing newlines are dropped.
  strict.equal(reconstructFrontmatter({ a: 'x\r\n\r\ny\n\n' }), 'a: |-\n  x\n\n  y');
  strict.equal(reconstructFrontmatter({ a: 'one', b: 'p\nq', c: 'two' }), 'a: one\nb: |-\n  p\n  q\nc: two');
});

test('52-05 #7a: extract parses |-, | and |+ with their chomping', () => {
  const fm = extractFrontmatter([
    '---',
    'strip: |-',
    '  a',
    '  b',
    '',
    'clip: |',
    '  a',
    '  b',
    '',
    '',
    'keep: |+',
    '  a',
    '  b',
    '',
    '',
    'after: z',
    '---',
    'body',
  ].join('\n'));
  strict.equal(fm.strip, 'a\nb');
  strict.equal(fm.clip, 'a\nb\n');
  strict.equal(fm.keep, 'a\nb\n\n\n');
  strict.equal(fm.after, 'z');
});

test('52-05 #7b: extract keeps blank lines inside a block and the spaces past the block indent', () => {
  const fm = extractFrontmatter([
    '---',
    'resolution: |-',
    '  Option B.',
    '',
    '    indented two more',
    '  Reason: has a colon',
    '  - looks like an item',
    '  ---',
    'status: resolved',
    '---',
  ].join('\n'));
  strict.equal(fm.resolution, 'Option B.\n\n  indented two more\nReason: has a colon\n- looks like an item\n---');
  strict.equal(fm.status, 'resolved');
  strict.equal(fm.Reason, undefined);
});

test('52-05 #7c: a block one level down ends at the next sibling key and at the parent level', () => {
  const fm = extractFrontmatter([
    '---',
    'o:',
    '  k: |-',
    '    x',
    '    y',
    '  j: plain',
    '  m: |',
    '    last',
    'top: t',
    '---',
  ].join('\n'));
  strict.deepEqual(fm.o, { k: 'x\ny', j: 'plain', m: 'last\n' });
  strict.equal(fm.top, 't');
});

test('52-05 #7d: only a bare indicator starts a block; `a | b` stays a plain scalar; > is read literally', () => {
  const fm = extractFrontmatter([
    '---',
    'pipe: a | b',
    'gt: x > y',
    'folded: >-',
    '  one',
    '  two',
    'next: n',
    '---',
  ].join('\n'));
  strict.equal(fm.pipe, 'a | b');
  strict.equal(fm.gt, 'x > y');
  strict.equal(fm.folded, 'one\ntwo'); // literal, not folded: the serializer never emits >
  strict.equal(fm.next, 'n');
});

test('52-05 #8: extract(splice(content, obj)) preserves every multi-line string exactly', () => {
  const answer = 'Option B.\nReason: second line with colon\n---\n  indented line\n\n- item\n# not a comment\nlast';
  const nested = 'x: 1\n---\n\n  y';
  const obj = { id: 'DECISION-001', status: 'resolved', resolution: answer, meta: { note: nested, k: 'v' }, resolved_at: '2026-10-04T13:49:05.343Z' };
  const content = '---\nid: DECISION-001\nstatus: pending\n---\n\n## Question\n\nPick?\n';
  const out = spliceFrontmatter(content, obj);
  strict.ok(out.endsWith('\n---\n\n## Question\n\nPick?\n'), 'the body after the frontmatter is unchanged');
  const fm = extractFrontmatter(out);
  strict.equal(fm.resolution, answer);
  strict.deepEqual(fm.meta, { note: nested, k: 'v' });
  strict.equal(fm.status, 'resolved');
  strict.equal(fm.resolved_at, '2026-10-04T13:49:05.343Z');
  strict.equal(fm.Reason, undefined);
  // CRLF content reads back as LF.
  strict.equal(extractFrontmatter(spliceFrontmatter(content, { r: 'a\r\nb' })).r, 'a\nb');
  // A second splice is a fixed point.
  strict.equal(spliceFrontmatter(out, fm), out);
});

test('52-05 #9: single-line values reconstruct byte-identically to before the block-scalar change', () => {
  const obj = {
    id: 'DECISION-001', status: 'resolved', question: 'Pick: A or B?', tag: '#x', flow: '[a]', brace: '{b}', n: 3, ok: true,
    empty: '', tags: ['a', 'b'], long: ['one: x', 'two #y', 'three', 'four'],
    nested: { s: 'plain', c: 'has: colon', arr: ['p', 'q'], deep: { k: 'v', list: ['m'] } },
    resolved_at: '2026-10-04T13:49:05.343Z',
  };
  strict.equal(reconstructFrontmatter(obj),
    'id: DECISION-001\nstatus: resolved\nquestion: "Pick: A or B?"\ntag: "#x"\nflow: "[a]"\nbrace: "{b}"\nn: 3\nok: true\n' +
    'empty: \ntags: [a, b]\nlong:\n  - "one: x"\n  - "two #y"\n  - three\n  - four\nnested:\n  s: plain\n  c: "has: colon"\n' +
    '  arr: [p, q]\n  deep:\n    k: v\n    list:\n      - m\nresolved_at: "2026-10-04T13:49:05.343Z"');
});
