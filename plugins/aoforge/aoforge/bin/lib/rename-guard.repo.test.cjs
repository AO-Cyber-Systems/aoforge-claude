'use strict';

// Test list (TRD 72-04, objective 72-install-and-naming-cleanup, INST-02). This is the repo gate
// that keeps the legacy product names out of the tree once the AOForge rename has landed. It
// spells no legacy name itself: every token it looks for is built from LEGACY in
// legacy-names.cjs, and what it skips and preserves comes from the rename codemod
// (scripts/aoforge-rename.cjs SKIP and PRESERVE), so the guard and the codemod share one
// definition.
//
// 1. Scan set = `git ls-files` minus the codemod's SKIP minus ALLOW. It is non-empty
//    (> 500 files) and includes plugins/aoforge/aoforge/bin/aof-tools.cjs and README.md.
// 2. Main gate: zero findings across the scan set for the legacy product word (any case, after
//    masking the codemod's PRESERVE tokens), the legacy CLI name and the legacy banner, in file
//    content and in the path itself. A failure lists `file:line token` and the ALLOW table.
// 3. Lines inside an ignore region (the rename-guard ignore-start ... ignore-end markers) are not
//    scanned; only files in IGNORE_REGION_FILES may contain such a region, and every region in
//    the repository is closed (an unclosed region throws).
// 4. Every ALLOW entry has a reason of >= 20 chars and matches >= 1 tracked path; an entry with
//    `spans` (test 9) is a global RegExp that matches >= 1 span in a tracked file it names.
// 5. Sensitivity: a sample text with one of each token yields three findings; the preserved
//    product names (the ...ops product and the .cloud domain) yield none.
// 5b. Planning-tree exemption: in a scratch git repo with tracked `<new planning dir>/x.md` and
//    `<legacy planning dir>/x.md`, each containing the legacy product word, scanRepo yields zero findings for
//    both (the planning tree stays history after 72-21's move), while the same word in the
//    tracked live user guide yields one. (`docs/x.md` is design history under the codemod's
//    docs-history SKIP, so the live guide is the positive control.)
// 6. Token patterns are built from LEGACY: this file's own source contains no legacy literal.
// 8. Planning directory (TRD 72-06): the token set includes the legacy planning directory name
//    (`planningDir`, built from LEGACY.planningDir), counted only where the codemod would call it a
//    directory (not member access such as a config key); a sample line naming the legacy STATE.md
//    yields one finding; the tree passes with ALLOW entries for .gitignore and the monorepo doctor.
// 9. Span-scoped ALLOW (TRD 72-14): an entry with `spans` keeps its file in the scan set and masks
//    only those spans (a JSON file cannot hold an ignore region). In the marketplace, the pointer
//    entry's lines are masked and another legacy word on another line is still found; the same
//    text under another path yields every finding. Masking keeps line numbers.
//
// Runtime model: read-only against the repository (5b writes only to its own tmp dir). Repo
// root is path.resolve(__dirname, '..', '..', '..', '..', '..'); a mirror install (no README.md
// there, no scripts/ directory) skips the whole file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { globToRegExp } = require('./doc-refs.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT =
  fs.existsSync(path.join(REPO_ROOT, 'README.md')) &&
  fs.existsSync(path.join(REPO_ROOT, 'scripts', 'aoforge-rename.cjs'));

/** The rename codemod (SKIP, PRESERVE, isSkipped). Loaded lazily: a mirror install has no scripts/. */
let _codemod = null;
function codemod() {
  if (!_codemod) _codemod = require(path.join(REPO_ROOT, 'scripts', 'aoforge-rename.cjs'));
  return _codemod;
}

// ─── ALLOW (on top of the codemod's SKIP) ──────────────────────────────────────────
// Every entry: a reason of >= 20 chars, and a pattern that matches >= 1 tracked path (test 4).
// A dead entry is a bug, so it fails the gate rather than sitting there silently.

const ALLOW = [
  {
    pattern: '**/legacy-names.cjs',
    reason: 'the one module that spells every legacy name; every other module builds them from LEGACY',
  },
  {
    pattern: '**/__fixtures__/legacy-*',
    reason: 'fixtures that build legacy projects, environments and homes on purpose',
  },
  {
    pattern: '**/*.legacy.test.*',
    reason: 'tests of the one-release shims feed legacy names as deliberate input',
  },
  {
    pattern: 'scripts/aoforge-rename*',
    reason: 'the rename codemod and its test spell the old names to find them',
  },
  {
    pattern: 'scripts/__fixtures__/legacy-*',
    reason: 'the codemod fixtures are a sample tree spelled with the old names',
  },
  {
    pattern: '.gitignore',
    reason: 'keeps the legacy ignore lines beside the new ones for one release (old runtime files)',
  },
  {
    pattern: 'plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js',
    reason: 'skips directories by name: its skip lists name the legacy planning and product directories beside the new ones',
  },
  // TRD 72-14: the final release of the old plugin, a pointer to the new one.
  {
    pattern: `plugins/${LEGACY.slug}/**`,
    reason: 'the final pointer release of the legacy plugin keeps its name; removed in the release after 3.0.0',
  },
  {
    pattern: 'scripts/gen-pointer-skills*',
    reason: 'generates the pointer plugin, which must use the legacy plugin name',
  },
];

// ─── ignore regions ───────────────────────────────────────────────────────────────
// Built from parts so this file does not itself carry a region marker.

const IGNORE_START = ['rename-guard', 'ignore-start'].join(':');
const IGNORE_END = ['rename-guard', 'ignore-end'].join(':');

/** The only files allowed to hold an ignore region. */
const IGNORE_REGION_FILES = ['CLAUDE.md', 'docs/USER-GUIDE.md'];

class RenameGuardError extends Error {}

/** 0-based indices of the lines inside an ignore region, markers included. Throws on an unclosed region. */
function ignoredLines(lines) {
  const ignored = new Set();
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    const hasStart = lines[i].includes(IGNORE_START);
    const hasEnd = lines[i].includes(IGNORE_END);
    if (open === -1 && hasStart) {
      ignored.add(i);
      open = hasEnd ? -1 : i;
      continue;
    }
    if (open !== -1) {
      ignored.add(i);
      if (hasEnd) open = -1;
    } else if (hasEnd) {
      throw new RenameGuardError(`${IGNORE_END} without ${IGNORE_START} at line ${i + 1}`);
    }
  }
  if (open !== -1) {
    throw new RenameGuardError(`unclosed ${IGNORE_START} (no ${IGNORE_END}) starting at line ${open + 1}`);
  }
  return ignored;
}

// ─── tokens (built from LEGACY, test 6) ───────────────────────────────────────────

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TOKENS = [
  { id: 'product', re: new RegExp(esc(LEGACY.slug), 'gi') },
  { id: 'cli', re: new RegExp(esc(LEGACY.cli), 'gi') },
  { id: 'banner', re: new RegExp(esc(LEGACY.banner), 'g') },
  // TRD 72-06: the legacy planning directory, not followed by an identifier character (a longer
  // identifier is another word). Member access is filtered below with the codemod's occurrenceKind.
  { id: 'planningDir', re: new RegExp(`${esc(LEGACY.planningDir)}(?![A-Za-z0-9_])`, 'g'), directoryOnly: true },
];

/** Kinds of a planning-directory occurrence that name the directory (codemod occurrenceKind). */
const DIRECTORY_KINDS = new Set(['path', 'regex']);

/** Swap every span the codemod preserves (or leaves for a human) in `rel` for same-length filler. */
function maskPreserved(text, rel) {
  const { PRESERVE } = codemod();
  const fill = (m) => '\u0000'.repeat(m.length);
  for (const p of PRESERVE.manual) {
    if (p.rules && p.rules !== 'names') continue;
    if (p.files && !p.files(rel)) continue;
    text = text.replace(p.re, fill);
  }
  for (const p of PRESERVE.scoped) {
    if (p.files && !p.files(rel)) continue;
    text = text.replace(p.re, fill);
  }
  for (const p of PRESERVE.global) text = text.replace(p.re, fill);
  return text;
}

/** The word around a match, for a readable finding. */
function wordAt(line, index, length) {
  let s = index;
  let e = index + length;
  while (s > 0 && /[\w.~/@:-]/.test(line[s - 1])) s--;
  while (e < line.length && /[\w.~/@:-]/.test(line[e])) e++;
  return line.slice(s, e);
}

/**
 * Every legacy token in `text`, the content of `rel`: [{ line, token }], 1-based lines.
 * Ignore regions are skipped; preserved spans are masked first.
 */
function scanText(text, rel = '') {
  const lines = maskPreserved(text, rel).split('\n');
  const ignored = ignoredLines(lines);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (ignored.has(i)) continue;
    for (const t of TOKENS) {
      for (const m of lines[i].matchAll(t.re)) {
        if (t.directoryOnly && !DIRECTORY_KINDS.has(codemod().occurrenceKind(lines[i], m.index))) continue;
        out.push({ line: i + 1, token: wordAt(lines[i], m.index, m[0].length) });
      }
    }
  }
  return out;
}

/** Legacy tokens in the path itself (line 0). */
function scanPath(rel) {
  return scanText(rel, rel).map((f) => ({ line: 0, token: f.token }));
}

// ─── scan set ─────────────────────────────────────────────────────────────────────

/** Tracked regular files under `root`, posix paths. */
function trackedFiles(root) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) {
    throw new Error(`git ls-files failed in ${root}: ${r.error ? r.error.message : String(r.stderr).trim()}`);
  }
  return r.stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((f) => {
      try {
        return fs.lstatSync(path.join(root, f)).isFile();
      } catch {
        return false;
      }
    });
}

const allowRes = (allow) => allow.map((a) => globToRegExp(a.pattern));

/** `git ls-files` minus the codemod's SKIP minus `allow`. */
function scanSet(root, { allow = ALLOW } = {}) {
  const { isSkipped } = codemod();
  const res = allowRes(allow);
  return trackedFiles(root).filter((rel) => !isSkipped(rel) && !res.some((re) => re.test(rel)));
}

/** Text of a file, or null when it is binary or not valid UTF-8 (the codemod skips those too). */
function readText(root, rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  if (buf.includes(0)) return null;
  const text = buf.toString('utf8');
  return Buffer.from(text, 'utf8').equals(buf) ? text : null;
}

/** Every finding across the scan set of `root`: [{ file, line, token }]. */
function scanRepo(root, opts = {}) {
  const findings = [];
  for (const rel of scanSet(root, opts)) {
    for (const f of scanPath(rel)) findings.push({ file: rel, ...f });
    const text = readText(root, rel);
    if (text === null) continue;
    for (const f of scanText(text, rel)) findings.push({ file: rel, ...f });
  }
  return findings;
}

const MAX_LISTED = 300;

function formatFailure(findings) {
  const listed = findings.slice(0, MAX_LISTED).map((f) => `  ${f.file}:${f.line}  ${f.token}`);
  if (findings.length > MAX_LISTED) listed.push(`  ... and ${findings.length - MAX_LISTED} more`);
  return [
    `${findings.length} legacy name(s) in the tree (rename them, or, only for a file that must spell the`,
    'old name, add a justified ALLOW entry):',
    ...listed,
    '',
    'ALLOW (on top of the codemod SKIP):',
    ...ALLOW.map((a) => `  ${a.pattern} — ${a.reason}`),
  ].join('\n');
}

// ─── tests ────────────────────────────────────────────────────────────────────────

describe('rename-guard.repo.test.cjs', { skip: IS_AOFORGE_CHECKOUT ? false : 'not an AOForge source checkout' }, () => {
  test('1: scan set is non-empty (> 500 files) and includes the named anchors', () => {
    const files = scanSet(REPO_ROOT);
    assert.ok(files.length > 500, `expected > 500 files in the scan set, got ${files.length}`);
    assert.ok(files.includes('README.md'), 'scan set must include README.md');
    assert.ok(
      files.includes('plugins/aoforge/aoforge/bin/aof-tools.cjs'),
      'scan set must include plugins/aoforge/aoforge/bin/aof-tools.cjs',
    );
  });

  test('2: zero legacy names across the scan set (content and paths)', () => {
    const findings = scanRepo(REPO_ROOT);
    assert.equal(findings.length, 0, formatFailure(findings));
  });

  describe('3: ignore regions', () => {
    test('3a: lines inside a region are not scanned; lines outside are', () => {
      const text = [
        `before ${LEGACY.product}`,
        `<!-- ${IGNORE_START} -->`,
        `inside ${LEGACY.product} and ${LEGACY.cli}`,
        `<!-- ${IGNORE_END} -->`,
        `after ${LEGACY.cli}`,
      ].join('\n');
      const found = scanText(text, 'docs/USER-GUIDE.md');
      assert.deepEqual(
        found.map((f) => f.line),
        [1, 5],
      );
    });

    test('3b: an unclosed region throws', () => {
      assert.throws(() => scanText(`${IGNORE_START}\n${LEGACY.product}\n`, 'x.md'), RenameGuardError);
      assert.throws(() => scanText(`${IGNORE_END}\n`, 'x.md'), RenameGuardError);
    });

    test('3c: only IGNORE_REGION_FILES hold a region, and every region is closed', () => {
      const holders = [];
      for (const rel of scanSet(REPO_ROOT)) {
        const text = readText(REPO_ROOT, rel);
        if (text === null) continue;
        if (!text.includes(IGNORE_START) && !text.includes(IGNORE_END)) continue;
        holders.push(rel);
        assert.doesNotThrow(() => ignoredLines(text.split('\n')), `${rel}: region not closed`);
      }
      const stray = holders.filter((rel) => !IGNORE_REGION_FILES.includes(rel));
      assert.deepEqual(stray, [], `ignore regions outside IGNORE_REGION_FILES: ${stray.join(', ')}`);
    });
  });

  test('4: every ALLOW entry has a reason >= 20 chars and matches >= 1 tracked path', () => {
    const tracked = trackedFiles(REPO_ROOT);
    for (const entry of ALLOW) {
      assert.ok(
        typeof entry.reason === 'string' && entry.reason.length >= 20,
        `ALLOW ${entry.pattern}: reason must be >= 20 chars`,
      );
      const re = globToRegExp(entry.pattern);
      assert.ok(
        tracked.some((rel) => re.test(rel)),
        `ALLOW ${entry.pattern} matches no tracked path (a dead entry)`,
      );
      if (entry.spans === undefined) continue;
      assert.ok(entry.spans instanceof RegExp && entry.spans.global, `ALLOW ${entry.pattern}: spans must be a /g RegExp`);
      const files = tracked.filter((rel) => re.test(rel));
      assert.ok(
        files.some((rel) => new RegExp(entry.spans.source, entry.spans.flags).test(readText(REPO_ROOT, rel) || '')),
        `ALLOW ${entry.pattern}: spans ${entry.spans} match nothing in the file (a dead entry)`,
      );
    }
  });

  describe('5: sensitivity', () => {
    test('5a: one of each token yields three findings', () => {
      const text = [`Uses ${LEGACY.product} here.`, `Run ${LEGACY.cli} state load.`, `${LEGACY.banner} DONE`].join(
        '\n',
      );
      const found = scanText(text, 'README.md');
      assert.equal(found.length, 3, JSON.stringify(found));
      assert.deepEqual(
        found.map((f) => f.line),
        [1, 2, 3],
      );
    });

    test('5b: the preserved product names yield none', () => {
      const text = [`${LEGACY.slug}ops repo`, `${LEGACY.slug}.cloud domain`].join('\n');
      assert.deepEqual(scanText(text, 'README.md'), []);
    });

    test('5c: the planning tree is exempt under both names; the live guide is not', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-guard-'));
      try {
        const git = (...args) => {
          const r = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
          assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
        };
        git('init', '-q');
        const files = [`${NAMES.planningDir}/x.md`, `${LEGACY.planningDir}/x.md`, 'docs/x.md', 'docs/USER-GUIDE.md'];
        for (const rel of files) {
          fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
          fs.writeFileSync(path.join(tmp, rel), `A ${LEGACY.product} note.\n`);
        }
        git('add', '--', ...files);
        const findings = scanRepo(tmp, { allow: [] });
        assert.deepEqual(
          findings.map((f) => `${f.file}:${f.line}`),
          ['docs/USER-GUIDE.md:1'],
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  test('6: this file spells no legacy name (tokens are built from LEGACY)', () => {
    const src = fs.readFileSync(__filename, 'utf8');
    assert.equal(new RegExp(esc(LEGACY.slug), 'i').test(src), false, 'legacy product word in the guard source');
    assert.equal(src.toLowerCase().includes(LEGACY.cli.toLowerCase()), false, 'legacy CLI name in the guard source');
    assert.equal(src.includes(LEGACY.banner), false, 'legacy banner in the guard source');
    assert.deepEqual(scanText(src, path.relative(REPO_ROOT, __filename)), [], 'legacy planning directory in the guard source');
  });

  describe('8: the legacy planning directory (TRD 72-06)', () => {
    test('8a: the token set holds the planning directory token, built from LEGACY', () => {
      const t = TOKENS.find((x) => x.id === 'planningDir');
      assert.ok(t, 'a planningDir token');
      assert.ok(t.re.source.startsWith(esc(LEGACY.planningDir)), t.re.source);
    });

    test('8b: a sample line naming the legacy STATE.md yields one finding', () => {
      const found = scanText(`cat ${LEGACY.planningDir}/STATE.md\n`, 'README.md');
      assert.deepEqual(found, [{ line: 1, token: `${LEGACY.planningDir}/STATE.md` }]);
    });

    test('8c: member access and longer identifiers are not the directory', () => {
      const prop = LEGACY.planningDir.slice(1);
      const text = [`cfg.${prop}.commit_docs`, `opts.${prop}Dir`, `${NAMES.planningDir}/STATE.md`].join('\n');
      assert.deepEqual(scanText(text, 'x.cjs'), []);
    });

    test('8d: a regex naming the legacy directory is a finding', () => {
      const found = scanText(`const RE = /\\${LEGACY.planningDir}\\//;\n`, 'x.cjs');
      assert.equal(found.length, 1, JSON.stringify(found));
    });
  });

  describe('9: span-scoped ALLOW (TRD 72-14)', () => {
    const MARKET = '.claude-plugin/marketplace.json';
    const sample = [
      '{',
      `  "name": "${LEGACY.slug}",`,
      `  "description": "${LEGACY.product} is now ${NAMES.product}: install ${NAMES.plugin}.",`,
      '  "version": "3.0.0",',
      `  "source": "./plugins/${LEGACY.slug}",`,
      `  "category": "uses ${LEGACY.cli}"`,
      '}',
    ].join('\n');

    test('9a: the marketplace pointer entry is masked; another legacy word is still found', () => {
      assert.ok(scanSet(REPO_ROOT).includes(MARKET), 'a span-scoped file stays in the scan set');
      assert.deepEqual(
        scanFile(sample, MARKET).map((f) => f.line),
        [6],
      );
    });

    test('9b: the same text under another path yields every finding', () => {
      assert.deepEqual(
        scanFile(sample, 'x.json').map((f) => f.line),
        [2, 3, 5, 6],
      );
    });

    test('9c: masking keeps the text length and its line breaks', () => {
      const masked = maskAllowedSpans(sample, MARKET);
      assert.equal(masked.length, sample.length);
      assert.equal(masked.split('\n').length, sample.split('\n').length);
    });
  });
});
