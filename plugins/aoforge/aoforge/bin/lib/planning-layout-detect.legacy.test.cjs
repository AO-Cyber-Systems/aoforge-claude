'use strict';

// planning-layout-detect.legacy.test.cjs — the 3.1 pre-rename detectors in planning-layout.cjs (objective 78,
// TRD 78-01, SC-3/SC-4). Module level: the detectors are called directly on hand-built fixtures from
// __fixtures__/legacy-layout-fixtures.cjs. Legacy names may be spelled here (`*.legacy.test.*`), but are built
// from LEGACY.
//
// Test list (TRD 78-01; the CLI cases 1-6 live in planning-layout.legacy.test.cjs and
// doctor-checks/27-legacy-planning-layout.legacy.test.cjs):
//
// CLI (`node aof-tools.cjs --cwd <root> ...`, scratch HOME):
//   1. Legacy-only project: `validate health --raw` -> status broken, an issue W066 whose message names the legacy
//      directory and whose fix names 3.0.x, `git mv` and the migration guide; no other check ran (no W003/E002
//      noise); `.aoforge/` was not created.
//   2. Both directories: `validate health --raw` -> W066 warning "both exist ... ignored"; status not broken by
//      W066 alone.
//   3. `.aoforge/config.json` with only the pre-rename stamp key -> W067 with fix "rename the key"; with both keys
//      -> W067 with fix "delete the pre-rename key"; with only `aoforge` -> no W067.
//   4. CLAUDE.md holding a START marker under LEGACY.blockTag ... END -> W069 warning; an AOFORGE block -> none;
//      no CLAUDE.md -> none.
//   5. `doctor --json` run inside a legacy-only project -> no project checks in the report, and a note equal to
//      `legacyLayoutMessage(root)`; run inside a subdirectory of it -> the same note (walk).
//   6. `doctor` in a both-layout / W067 / W069 project -> check 27 `warn` listing each code once; check 22 does
//      not repeat them; no finding names `--only 0012` or `--only 0013`.
//
// Module (this file):
//   7. isLegacyPlanning: legacy dir with a marker -> true; legacy dir empty or holding only unrelated files ->
//      false; a FILE named like the legacy dir -> false; both dirs -> false.
//   8. bothPlanningDirs: true only when both are directories.
//   9. findLegacyLayoutRoot: from a nested subdir of a legacy project -> the project root; from inside an
//      `.aoforge/` project nested under a legacy one -> null (the nearer real project wins); reaching $HOME (fake
//      home that itself holds a legacy layout) -> null; `home: ''` disables the stop.
//  10. legacyLayoutMessage(root) is a single line (no `\n`) containing the legacy directory with its slash,
//      `.aoforge`, `3.0.x`, `git mv` and `MIGRATING-TO-AOFORGE`.
//  11. hasLegacyBlockMarker(text): true for a START marker under the legacy tag (any attributes, CRLF too), false
//      for an AOFORGE marker, for the legacy tag in prose without the comment syntax, and for an END-only marker.
//      legacyBlockMessage('~/.claude/CLAUDE.md') names that label, both pre-rename markers, the AOFORGE tag and
//      `3.0.x`.
//  12. legacy-names: SHIM_RELEASE === '3.0.x'; existing assertions on NAMES/LEGACY unchanged
//      (legacy-names.legacy.test.cjs).

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { NAMES, LEGACY } = require('./legacy-names.cjs');
const layout = require('./planning-layout.cjs');
const {
  planningProject,
  nestedHome,
  nestedProject,
  claudeMdWithBlock,
} = require('./__fixtures__/legacy-layout-fixtures.cjs');

const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;
const MARKER_FILES = ['config.json', 'STATE.md', 'ROADMAP.md', 'PROJECT.md'];

const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

/** A fixture without git (the detectors read the filesystem only), cleaned up after each test. */
function project(opts = {}) {
  const p = planningProject({ git: false, ...opts });
  cleanups.push(p.cleanup);
  return p;
}

function home() {
  const h = nestedHome();
  cleanups.push(h.cleanup);
  return h;
}

/** Every text an issue carries, for "never names a retired migration" checks. */
const texts = (issue) => [issue.message, issue.fix].join('\n');

// ─── exports and imports ─────────────────────────────────────────────────────

describe('planning-layout: the 3.1 surface', () => {
  test('exports every detector, the message builders and the codes', () => {
    for (const name of [
      'isLegacyPlanning', 'bothPlanningDirs', 'findLegacyLayoutRoot', 'legacyLayoutMessage', 'legacyPlanningIssue',
      'legacyConfigKeyIssue', 'legacyClaudeMdIssue', 'legacyBlockMessage', 'hasLegacyBlockMarker', 'advisoryLine',
    ]) {
      assert.equal(typeof layout[name], 'function', `${name} is not exported`);
    }
    assert.equal(layout.MIGRATION_GUIDE, 'docs/MIGRATING-TO-AOFORGE.md');
    assert.equal(layout.CODE, 'W066');
    assert.equal(layout.CONFIG_CODE, 'W067');
    assert.equal(layout.CLAUDE_MD_CODE, 'W069');
  });

  test('asks compat only for $HOME (userHomeDir, isUserHome), never which directory is the planning one', () => {
    const src = fs.readFileSync(require.resolve('./planning-layout.cjs'), 'utf-8');
    const requires = [...src.matchAll(/const\s*\{([^}]*)\}\s*=\s*require\('\.\/compat\.cjs'\)/g)];
    assert.equal(requires.length, 1, 'one compat import');
    const names = requires[0][1].split(',').map((s) => s.trim()).filter(Boolean).sort();
    assert.deepEqual(names, ['isUserHome', 'userHomeDir']);
    assert.equal(/compat\.(isLegacyPlanning|bothPlanningDirs|planningRoot|planningRel)/.test(src), false);
  });
});

// ─── 7. isLegacyPlanning ─────────────────────────────────────────────────────

describe('7. isLegacyPlanning', () => {
  test('a legacy directory holding the planning tree -> true', () => {
    assert.equal(layout.isLegacyPlanning(project({ layout: 'legacy' }).root), true);
  });

  for (const marker of MARKER_FILES) {
    test(`a legacy directory holding only ${marker} -> true`, () => {
      const p = project({ layout: 'legacy', markers: false, files: { [marker]: 'x\n' } });
      assert.equal(layout.isLegacyPlanning(p.root), true);
    });
  }

  test('an empty legacy directory -> false', () => {
    const p = project({ layout: 'legacy', markers: false });
    assert.ok(fs.statSync(path.join(p.root, OLD)).isDirectory());
    assert.equal(layout.isLegacyPlanning(p.root), false);
  });

  test('a legacy directory holding only unrelated files -> false', () => {
    const p = project({ layout: 'legacy', markers: false, files: { 'notes.txt': 'x\n', 'sprint/plan.md': 'y\n' } });
    assert.equal(layout.isLegacyPlanning(p.root), false);
  });

  test('a FILE named like the legacy directory -> false', () => {
    const p = project({ layout: 'none', files: { [OLD]: 'not a directory\n' } });
    assert.ok(fs.statSync(path.join(p.root, OLD)).isFile());
    assert.equal(layout.isLegacyPlanning(p.root), false);
  });

  test('both directories -> false; only the new one -> false; no planning directory -> false', () => {
    assert.equal(layout.isLegacyPlanning(project({ layout: 'both' }).root), false);
    assert.equal(layout.isLegacyPlanning(project({ layout: 'aoforge' }).root), false);
    assert.equal(layout.isLegacyPlanning(project({ layout: 'none' }).root), false);
  });

  test('a root that does not exist, or is a file -> false (never throws)', () => {
    const p = project({ layout: 'none' });
    assert.equal(layout.isLegacyPlanning(path.join(p.root, 'missing')), false);
    assert.equal(layout.isLegacyPlanning(path.join(p.root, 'README.md')), false);
  });
});

// ─── 8. bothPlanningDirs ─────────────────────────────────────────────────────

describe('8. bothPlanningDirs', () => {
  test('true only when both are directories', () => {
    assert.equal(layout.bothPlanningDirs(project({ layout: 'both' }).root), true);
    assert.equal(layout.bothPlanningDirs(project({ layout: 'both', markers: false }).root), true);
    assert.equal(layout.bothPlanningDirs(project({ layout: 'aoforge' }).root), false);
    assert.equal(layout.bothPlanningDirs(project({ layout: 'legacy' }).root), false);
    assert.equal(layout.bothPlanningDirs(project({ layout: 'none' }).root), false);
  });

  test('a FILE named like the legacy directory beside the new one -> false', () => {
    const p = project({ layout: 'aoforge' });
    fs.writeFileSync(path.join(p.root, OLD), 'not a directory\n');
    assert.equal(layout.bothPlanningDirs(p.root), false);
  });
});

// ─── 9. findLegacyLayoutRoot ─────────────────────────────────────────────────

describe('9. findLegacyLayoutRoot', () => {
  test('from the root and from a nested subdirectory of a legacy project -> the project root', () => {
    const p = project({ layout: 'legacy' });
    const sub = path.join(p.root, 'src', 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    assert.equal(layout.findLegacyLayoutRoot(p.root, { home: p.home }), p.root);
    assert.equal(layout.findLegacyLayoutRoot(sub, { home: p.home }), p.root);
  });

  test('inside an .aoforge project nested under a legacy one -> null (the nearer real project wins)', () => {
    const p = project({ layout: 'legacy' });
    const inner = nestedProject(p.root, 'inner', { layout: 'aoforge' });
    const sub = path.join(inner, 'src');
    fs.mkdirSync(sub, { recursive: true });
    assert.equal(layout.findLegacyLayoutRoot(sub, { home: p.home }), null);
    assert.equal(layout.findLegacyLayoutRoot(inner, { home: p.home }), null);
    assert.equal(layout.findLegacyLayoutRoot(path.join(inner, NEW, 'objectives'), { home: p.home }), null);
  });

  test('a legacy project nested inside an .aoforge one -> the nested legacy root', () => {
    const p = project({ layout: 'aoforge' });
    const inner = nestedProject(p.root, 'pkg/old', { layout: 'legacy' });
    assert.equal(layout.findLegacyLayoutRoot(path.join(inner), { home: p.home }), inner);
  });

  test('an unrelated legacy-named directory is not a project: the walk goes on past it', () => {
    const p = project({ layout: 'legacy', markers: false });
    assert.equal(layout.findLegacyLayoutRoot(p.root, { home: p.home }), null);
  });

  test('reaching $HOME -> null, even when $HOME itself holds the legacy layout', () => {
    const h = home();
    assert.equal(layout.isLegacyPlanning(h.home), true, 'the fake home holds the legacy layout');
    assert.equal(layout.findLegacyLayoutRoot(h.nested, { home: h.home }), null);
    assert.equal(layout.findLegacyLayoutRoot(h.home, { home: h.home }), null);
  });

  test('$HOME under a symlinked name still stops the walk', () => {
    const h = home();
    const link = path.join(h.base, 'home-link');
    fs.symlinkSync(h.home, link);
    assert.equal(layout.findLegacyLayoutRoot(h.nested, { home: link }), null);
  });

  test("home: '' disables the stop", () => {
    const h = home();
    assert.equal(layout.findLegacyLayoutRoot(h.nested, { home: '' }), h.home);
  });

  test('the default home is read on every call (HOME at call time)', () => {
    const h = home();
    const saved = process.env.HOME;
    try {
      process.env.HOME = h.home;
      assert.equal(layout.findLegacyLayoutRoot(h.nested), null);
      process.env.HOME = path.join(h.base, 'elsewhere');
      assert.equal(layout.findLegacyLayoutRoot(h.nested), h.home);
    } finally {
      process.env.HOME = saved;
    }
  });

  test('no legacy layout anywhere -> null', () => {
    const p = project({ layout: 'none' });
    assert.equal(layout.findLegacyLayoutRoot(p.root, { home: p.home }), null);
  });
});

// ─── 10. legacyLayoutMessage ─────────────────────────────────────────────────

describe('10. legacyLayoutMessage', () => {
  test('one line naming the directory, the root, both fixes and the migration guide', () => {
    const p = project({ layout: 'legacy' });
    const m = layout.legacyLayoutMessage(p.root);
    assert.equal(typeof m, 'string');
    assert.equal(m.includes('\n'), false, 'one line');
    for (const part of [p.root, `${OLD}/`, NEW, '3.0.x', `git mv ${OLD} ${NEW}`, 'MIGRATING-TO-AOFORGE', 'no longer reads']) {
      assert.ok(m.includes(part), `missing ${JSON.stringify(part)}: ${m}`);
    }
    assert.ok(m.includes(`"${LEGACY.configKey}"`) && m.includes(`"${NAMES.configKey}"`), m);
    assert.equal(/--only|for one release/.test(m), false, m);
  });
});

// ─── 11. CLAUDE.md managed block under the pre-rename tag ────────────────────

describe('11. hasLegacyBlockMarker and legacyBlockMessage', () => {
  const T = LEGACY.blockTag;

  test('a START marker under the legacy tag -> true (any attributes, no space, CRLF)', () => {
    for (const text of [
      `<!-- ${T}:START v=3.0.0 src=project-claude-md -->\nx\n<!-- ${T}:END -->\n`,
      `<!--${T}:START-->\nx\n<!--${T}:END-->`,
      `<!-- ${T}:START - Auto-generated by a command. Edit between these markers -->`,
      `# Title\r\n\r\n<!-- ${T}:START v=2.15.0 -->\r\nbody\r\n<!-- ${T}:END -->\r\n`,
      claudeMdWithBlock(T),
    ]) {
      assert.equal(layout.hasLegacyBlockMarker(text), true, JSON.stringify(text));
    }
  });

  test('an AOFORGE marker, prose, an END-only marker, another case or a longer word -> false', () => {
    for (const text of [
      claudeMdWithBlock(NAMES.blockTag),
      `The old ${T}:START marker is gone.`,
      `<!-- ${T}:END -->`,
      `<!-- ${T.toLowerCase()}:START v=1 -->`,
      `<!-- ${T}:STARTED -->`,
      '',
    ]) {
      assert.equal(layout.hasLegacyBlockMarker(text), false, JSON.stringify(text));
    }
    assert.equal(layout.hasLegacyBlockMarker(null), false);
    assert.equal(layout.hasLegacyBlockMarker(undefined), false);
  });

  test("legacyBlockMessage('~/.claude/CLAUDE.md') names the file, both markers, the AOFORGE tag and 3.0.x", () => {
    const r = layout.legacyBlockMessage('~/.claude/CLAUDE.md');
    assert.deepEqual(Object.keys(r).sort(), ['fix', 'message']);
    assert.ok(r.message.startsWith('legacy-claude-md-block: ~/.claude/CLAUDE.md '), r.message);
    const all = texts(r);
    for (const part of [`<!-- ${T}:START`, `<!-- ${T}:END`, NAMES.blockTag, '3.0.x']) {
      assert.ok(all.includes(part), `missing ${JSON.stringify(part)}: ${all}`);
    }
    assert.equal(r.message.includes('\n') || r.fix.includes('\n'), false, 'one line each');
  });
});

// ─── the issues validate health and the doctor report ────────────────────────

describe('legacyPlanningIssue (W066)', () => {
  test('legacy only -> W066 layout legacy: the problem in message, both fixes in fix, no retired migration', () => {
    const p = project({ layout: 'legacy' });
    const issue = layout.legacyPlanningIssue(p.root);
    assert.equal(issue.code, 'W066');
    assert.equal(issue.layout, 'legacy');
    assert.ok(issue.message.startsWith('legacy-planning-dir: '), issue.message);
    assert.ok(issue.message.includes(`${OLD}/`) && issue.message.includes('no longer reads'), issue.message);
    for (const part of ['3.0.x', `git mv ${OLD} ${NEW}`, layout.MIGRATION_GUIDE]) {
      assert.ok(issue.fix.includes(part), `fix misses ${part}: ${issue.fix}`);
    }
    assert.equal(/--only|for one release/.test(texts(issue)), false, texts(issue));
    const whole = layout.legacyLayoutMessage(p.root);
    assert.ok(whole.includes(issue.message.slice('legacy-planning-dir: '.length)), 'message is the problem part');
    assert.ok(whole.includes(issue.fix), 'fix is the fix part');
  });

  test('both -> W066 layout both: the legacy one is ignored', () => {
    const issue = layout.legacyPlanningIssue(project({ layout: 'both' }).root);
    assert.equal(issue.code, 'W066');
    assert.equal(issue.layout, 'both');
    assert.match(issue.message, /both exist/);
    assert.match(issue.message, /ignored/);
    assert.ok(issue.fix.includes(`${NEW}/`) && issue.fix.includes(`${OLD}/`), issue.fix);
  });

  test('only the new directory, none, or an unrelated legacy-named directory -> null', () => {
    assert.equal(layout.legacyPlanningIssue(project({ layout: 'aoforge' }).root), null);
    assert.equal(layout.legacyPlanningIssue(project({ layout: 'none' }).root), null);
    assert.equal(layout.legacyPlanningIssue(project({ layout: 'legacy', markers: false }).root), null);
  });
});

describe('legacyConfigKeyIssue (W067)', () => {
  test('only the pre-rename key -> W067, fix: rename the key', () => {
    const issue = layout.legacyConfigKeyIssue(project({ layout: 'aoforge', configKey: 'legacy' }).root);
    assert.equal(issue.code, 'W067');
    assert.ok(issue.message.startsWith('legacy-config-key: '), issue.message);
    assert.ok(issue.message.includes(`"${LEGACY.configKey}"`), issue.message);
    assert.ok(issue.fix.includes(`rename the key to "${NAMES.configKey}"`), issue.fix);
    assert.equal(/--only|for one release/.test(texts(issue)), false, texts(issue));
  });

  test('both keys -> W067, fix: delete the pre-rename key', () => {
    const issue = layout.legacyConfigKeyIssue(project({ layout: 'aoforge', configKey: 'both' }).root);
    assert.equal(issue.code, 'W067');
    assert.ok(issue.fix.includes('delete the pre-rename key'), issue.fix);
    assert.equal(/--only|for one release/.test(texts(issue)), false, texts(issue));
  });

  test('only the new key, no stamp, no or unreadable config -> null', () => {
    assert.equal(layout.legacyConfigKeyIssue(project({ layout: 'aoforge', configKey: 'aoforge' }).root), null);
    assert.equal(layout.legacyConfigKeyIssue(project({ layout: 'aoforge' }).root), null);
    assert.equal(layout.legacyConfigKeyIssue(project({ layout: 'none' }).root), null);
    const p = project({ layout: 'aoforge', files: { 'config.json': '{ not json' } });
    assert.equal(layout.legacyConfigKeyIssue(p.root), null);
  });

  test('reads <root>/.aoforge/config.json only: a key in the legacy directory is the layout problem, not W067', () => {
    assert.equal(layout.legacyConfigKeyIssue(project({ layout: 'legacy', configKey: 'legacy' }).root), null);
  });
});

describe('legacyClaudeMdIssue (W069)', () => {
  test('a CLAUDE.md block under the pre-rename tag -> W069 with the legacyBlockMessage text', () => {
    const issue = layout.legacyClaudeMdIssue(project({ layout: 'aoforge', claudeMd: 'legacy-block' }).root);
    assert.deepEqual(issue, { code: 'W069', ...layout.legacyBlockMessage('CLAUDE.md') });
  });

  test('an AOFORGE block or no CLAUDE.md -> null', () => {
    assert.equal(layout.legacyClaudeMdIssue(project({ layout: 'aoforge', claudeMd: 'aoforge-block' }).root), null);
    assert.equal(layout.legacyClaudeMdIssue(project({ layout: 'aoforge' }).root), null);
  });
});

describe('advisoryLine', () => {
  test('one line: `<code> <message> (fix: <fix>)`', () => {
    const issue = layout.legacyPlanningIssue(project({ layout: 'legacy' }).root);
    const line = layout.advisoryLine(issue);
    assert.equal(line, `W066 ${issue.message} (fix: ${issue.fix})`);
    assert.equal(line.includes('\n'), false);
  });
});
