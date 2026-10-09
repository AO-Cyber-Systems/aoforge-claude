'use strict';

/**
 * Tests for scripts/aoforge-rename.cjs, the one-shot DevFlow -> AOForge codemod.
 *
 * This file spells the legacy names on purpose (`*.legacy.test.*` is on the
 * allow-list for legacy spellings): the codemod's whole job is to turn them into
 * the new ones, so its tests must write them.
 *
 * Test list. Outermost first: the CLI on a scratch git repo, then the pure rules.
 *
 * CLI (scratch repo from scratchRepo())
 *  1.  `--rules names --inventory`: exit 0, each distinct token once with action and
 *      count, ends with `unclassified=0`.
 *  2.  A file holding `devflowzap` (unknown compound): `--inventory` exits 1 and names it.
 *  3.  `--rules names` (default dry run): lists the directory moves, the df-tools move,
 *      a rewrite count per file and `residuals=<n>`; `git status --porcelain` is empty.
 *  4.  `--rules names --write`: git sees renames, the moved stub keeps mode 100755, and a
 *      second dry run prints `moves=0 rewrites=0`.
 *  5.  `--rules planning --write` after 4: path.join(cwd, '.planning', ...) became
 *      planningRoot(cwd) with one compat import (relative path per file); a second
 *      planning dry run reports `rewrites=0`.
 *  6.  `--report <file>` writes JSON { rules, moves, rewrites, residuals }.
 *  6b. `--only <prefix>` (repeatable) restricts moves, rewrites and inventory.
 *
 * Pure rules
 *  7.  mapPath: plugin dirs, df-tools, workflow/template/data/doc basenames; skipped
 *      paths unchanged.
 *  8.  rewriteNames: one case per rule (command, agent type, mirror path, env var,
 *      marker, prose, identifier, banner, repo URL, docs project, branch, npm scope).
 *  9.  Preserves: devflowops, devFlowOps, devflow-desktop, devflow.cloud; fleet repo
 *      names in stack fixtures; the monorepo doctor entry is reported manual.
 * 10.  Skips: legacy-names.cjs, legacy fixtures and tests, CHANGELOG, docs/** (not
 *      USER-GUIDE), .planning/** and .aoforge/**.
 * 11.  A binary file (NUL byte) is never rewritten.
 * 12.  rewritePlanning: planningRoot forms, import injection and merge, an existing
 *      declaration left alone, residual tagging, prose, regex literals.
 * 13.  classifyToken.
 * 14.  Ignore regions: lines between the rename-guard ignore markers are kept by both passes;
 *      residual line numbers still count them (TRD 72-06).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rename = require('./aoforge-rename.cjs');
const { mapPath, rewriteNames, rewritePlanning, classifyToken, isSkipped, processFile } = rename;
const { scratchRepo } = require('./__fixtures__/legacy-rename-fixtures.cjs');

const SCRIPT = path.join(__dirname, 'aoforge-rename.cjs');

// ─── CLI helpers ─────────────────────────────────────────────────────────────

function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return env;
}

/** Run the codemod with cwd = the scratch repo. */
function run(repo, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repo.root,
    env: cleanEnv(),
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Build a scratch repo, run `fn`, always clean up. */
function withRepo(fn, extra) {
  const repo = scratchRepo(extra);
  try {
    return fn(repo);
  } finally {
    repo.cleanup();
  }
}

const read = (repo, rel) => fs.readFileSync(path.join(repo.root, rel), 'utf8');
const lastLine = (s) => s.trim().split('\n').pop();
const porcelain = (repo) => repo.git('status', '--porcelain');

// ─── 1. inventory ────────────────────────────────────────────────────────────

test('1. --rules names --inventory lists each distinct token once and ends with unclassified=0', () => {
  withRepo((repo) => {
    const r = run(repo, '--rules', 'names', '--inventory');
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    assert.strictEqual(lastLine(r.stdout), 'unclassified=0');
    const rows = r.stdout.trim().split('\n').slice(0, -1).map((l) => l.split('\t'));
    for (const row of rows) assert.strictEqual(row.length, 4, row.join('|'));
    const keys = rows.map((row) => row.slice(0, 3).join('\t'));
    assert.strictEqual(new Set(keys).size, keys.length, 'a token/action pair is listed twice');
    const by = Object.fromEntries(rows.map((row) => [row[0], row]));
    assert.deepStrictEqual(by['devflow-watch'].slice(1, 3), ['rename', 'aoforge-watch']);
    assert.strictEqual(by['devflowops'][1], 'preserve');
    const cloud = rows.find((row) => row[0].includes('devflow.cloud'));
    assert.strictEqual(cloud[1], 'preserve');
    assert.strictEqual(by["'devflow-test'"][1], 'preserve');
    assert.strictEqual(by["'.devflow'"][1], 'manual');
    assert.ok(Number(by['devflow-watch'][3]) >= 1);
    assert.strictEqual(porcelain(repo), '', 'an inventory must not touch the tree');
  });
});

test('1. --rules planning --inventory also ends with unclassified=0', () => {
  withRepo((repo) => {
    const r = run(repo, '--rules', 'planning', '--inventory');
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    assert.strictEqual(lastLine(r.stdout), 'unclassified=0');
    assert.match(r.stdout, /^\.planning\/STATE\.md\trename\t\.aoforge\/STATE\.md\t\d+$/m);
  });
});

// ─── 2. unclassified ─────────────────────────────────────────────────────────

test('2. an unknown compound makes --inventory exit 1 and names the token', () => {
  withRepo(
    (repo) => {
      const r = run(repo, '--rules', 'names', '--inventory');
      assert.strictEqual(r.status, 1);
      assert.match(r.stdout, /^devflowzap\tunclassified\t/m);
      assert.strictEqual(lastLine(r.stdout), 'unclassified=1');
    },
    { 'lib/zap.js': "const x = 'devflowzap';\n" },
  );
});

// ─── 3. dry run ──────────────────────────────────────────────────────────────

test('3. the default is a dry run that lists moves, rewrites and residuals and changes nothing', () => {
  withRepo((repo) => {
    const r = run(repo, '--rules', 'names');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /^move plugins\/devflow -> plugins\/aoforge$/m);
    assert.match(r.stdout, /^move plugins\/aoforge\/devflow -> plugins\/aoforge\/aoforge$/m);
    assert.match(r.stdout, /^move \S*df-tools\.cjs -> \S*aof-tools\.cjs$/m);
    assert.match(r.stdout, /^move \.github\/workflows\/devflow-checks\.yml -> \.github\/workflows\/aoforge-checks\.yml$/m);
    assert.match(r.stdout, /^rewrite \S*SKILL\.md \(\d+\)$/m);
    assert.match(r.stdout, /^rewrite README\.md \(2\)$/m); // the title and the repo URL; devflowops is preserved
    assert.match(r.stdout, /residuals=\d+\s*$/);
    assert.strictEqual(porcelain(repo), '');
  });
});

test('3. skipped files are not rewritten and are not listed', () => {
  withRepo((repo) => {
    const r = run(repo, '--rules', 'names');
    for (const skipped of ['CHANGELOG.md', 'PROPOSAL-x.md', 'legacy-names.cjs', 'x.legacy.test.cjs', 'x.bin', '.planning/STATE.md']) {
      assert.ok(!new RegExp(`^rewrite \\S*${skipped.replace('.', '\\.')}`, 'm').test(r.stdout), skipped);
    }
    assert.match(r.stdout, /^rewrite docs\/USER-GUIDE\.md \(\d+\)$/m);
  });
});

// ─── 4. write ────────────────────────────────────────────────────────────────

test('4. --rules names --write moves with git mv, keeps the executable bit and is idempotent', () => {
  withRepo((repo) => {
    const w = run(repo, '--rules', 'names', '--write');
    assert.strictEqual(w.status, 0, w.stderr + w.stdout);

    const status = porcelain(repo);
    assert.match(status, /^R/m, status);
    assert.ok(fs.existsSync(path.join(repo.root, 'plugins/aoforge/aoforge/bin/aof-tools.cjs')));
    assert.ok(!fs.existsSync(path.join(repo.root, 'plugins/devflow')));

    const stub = repo.git('ls-files', '-s', 'plugins/aoforge/aoforge/bin/lib/__fixtures__/agent-shell/bin/aof-tools');
    assert.match(stub, /^100755 /, stub);

    assert.match(read(repo, 'README.md'), /^# AOForge$/m);
    assert.match(read(repo, 'README.md'), /devflowops/);
    assert.match(read(repo, 'README.md'), /aoforge-claude/);
    assert.match(read(repo, 'site/hugo.toml'), /devflow\.cloud/);
    assert.match(read(repo, 'plugins/aoforge/skills/quick/SKILL.md'), /^# AOF ► QUICK$/m);
    assert.match(read(repo, 'plugins/aoforge/aoforge/bin/aof-tools.cjs'), /AOFORGE_X/);
    assert.match(read(repo, 'plugins/aoforge/hooks/a.js'), /\.\.\/aoforge\/bin\/lib\/hook-marker-store\.cjs/);

    // skipped and preserved content is byte for byte what it was
    assert.match(read(repo, 'CHANGELOG.md'), /DevFlow first release/);
    assert.match(read(repo, 'docs/PROPOSAL-x.md'), /DevFlow proposal/);
    assert.match(read(repo, '.planning/STATE.md'), /DevFlow state/);
    assert.match(read(repo, 'plugins/aoforge/aoforge/bin/lib/legacy-names.cjs'), /DevFlow/);
    assert.match(read(repo, 'plugins/aoforge/aoforge/bin/lib/x.legacy.test.cjs'), /\/devflow:quick/);
    assert.strictEqual(read(repo, 'assets/x.bin'), 'devflow\u0000DevFlow df-tools .planning');
    assert.match(
      read(repo, 'plugins/aoforge/aoforge/bin/lib/__fixtures__/stack-fleet-tables.cjs'),
      /repo: 'devflow-test'.*\n[\s\S]*\/aoforge:quick/,
    );
    assert.match(read(repo, 'plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js'), /'\.devflow', '\.planning'/);

    const again = run(repo, '--rules', 'names');
    assert.strictEqual(again.status, 0, again.stderr);
    assert.match(lastLine(again.stdout), /^moves=0 rewrites=0 /);

    const writeAgain = run(repo, '--rules', 'names', '--write');
    assert.strictEqual(writeAgain.status, 0, writeAgain.stderr);
    assert.match(lastLine(writeAgain.stdout), /^moves=0 rewrites=0 /);
  });
});

// ─── 5. planning ─────────────────────────────────────────────────────────────

test('5. --rules planning --write after names uses planningRoot with a relative import per file', () => {
  withRepo((repo) => {
    assert.strictEqual(run(repo, '--rules', 'names', '--write').status, 0);

    const dry = run(repo, '--rules', 'planning');
    assert.strictEqual(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /^rewrite plugins\/aoforge\/aoforge\/bin\/lib\/sample\.cjs \(\d+\)$/m);

    const w = run(repo, '--rules', 'planning', '--write');
    assert.strictEqual(w.status, 0, w.stderr + w.stdout);

    const sample = read(repo, 'plugins/aoforge/aoforge/bin/lib/sample.cjs');
    assert.match(sample, /path\.join\(planningRoot\(cwd\), 'STATE\.md'\)/);
    assert.match(sample, /return planningRoot\(cwd\);/);
    assert.match(sample, /path\.resolve\(planningRoot\(ctx\.root\), 'objectives'\)/);
    assert.strictEqual((sample.match(/const \{ planningRoot \} = require\('\.\/compat\.cjs'\);/g) || []).length, 1);
    assert.match(sample, /const CONFIG = '\.aoforge\/config\.json';/);
    assert.match(sample, /PLANNING_RE = \/\\\/\\\.planning\\\/\/;/, 'a regex literal is left for a human');

    assert.match(read(repo, 'plugins/aoforge/hooks/a.js'), /require\('\.\.\/aoforge\/bin\/lib\/compat\.cjs'\)/);
    assert.match(read(repo, 'plugins/aoforge/aoforge/bin/aof-tools.cjs'), /require\('\.\/lib\/compat\.cjs'\)/);
    assert.match(read(repo, 'plugins/aoforge/skills/quick/SKILL.md'), /\.aoforge\/STATE\.md/);

    // history and the planning tree are untouched, so is the monorepo doctor line
    assert.match(read(repo, '.planning/STATE.md'), /\.planning\/STATE\.md/);
    assert.match(read(repo, 'CHANGELOG.md'), /\.planning\/STATE\.md/);
    assert.match(read(repo, 'plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js'), /'\.planning'/);

    const again = run(repo, '--rules', 'planning');
    assert.match(lastLine(again.stdout), /^moves=0 rewrites=0 /);
  });
});

// ─── 6. report ───────────────────────────────────────────────────────────────

test('6. --report writes { rules, moves, rewrites, residuals } as JSON', () => {
  withRepo((repo) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-report-'));
    try {
      const file = path.join(dir, 'report.json');
      const r = run(repo, '--rules', 'names', '--report', file);
      assert.strictEqual(r.status, 0, r.stderr);
      const report = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.strictEqual(report.rules, 'names');
      assert.ok(Array.isArray(report.moves) && report.moves.length >= 3);
      assert.deepStrictEqual(report.moves[0], { kind: 'dir', from: 'plugins/devflow', to: 'plugins/aoforge' });
      assert.ok(Array.isArray(report.rewrites) && report.rewrites.every((x) => x.file && x.count > 0));
      const doctor = report.residuals.find((x) => x.file.endsWith('monorepo-doctor/lib/doctor.js'));
      assert.ok(doctor, JSON.stringify(report.residuals));
      assert.strictEqual(doctor.line, 2);
      assert.match(doctor.reason, /\.aoforge/);
      assert.match(doctor.text, /\.devflow/);
      assert.strictEqual(porcelain(repo), '');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── 6b. --only ──────────────────────────────────────────────────────────────

test('6b. --only restricts moves, rewrites and inventory to the given prefixes', () => {
  withRepo((repo) => {
    const site = run(repo, '--rules', 'names', '--only', 'site');
    assert.strictEqual(site.status, 0, site.stderr);
    assert.match(lastLine(site.stdout), /^moves=0 rewrites=1 /);
    assert.match(site.stdout, /^rewrite site\/hugo\.toml \(1\)$/m);

    const two = run(repo, '--rules', 'names', '--only', 'site', '--only', 'README.md');
    assert.match(lastLine(two.stdout), /^moves=0 rewrites=2 /);

    const inv = run(repo, '--rules', 'names', '--inventory', '--only', 'site');
    assert.strictEqual(inv.status, 0);
    assert.ok(!/devflow-watch/.test(inv.stdout));
    assert.match(inv.stdout, /^\S*devflow\.cloud\S*\tpreserve\t/m);
  });
});

test('6b. --rules planning --only leaves files outside the prefix untouched', () => {
  withRepo((repo) => {
    assert.strictEqual(run(repo, '--rules', 'names', '--write').status, 0);
    const w = run(repo, '--rules', 'planning', '--write', '--only', 'plugins/aoforge/aoforge/bin');
    assert.strictEqual(w.status, 0, w.stderr);
    assert.match(read(repo, 'plugins/aoforge/aoforge/bin/lib/sample.cjs'), /planningRoot\(cwd\)/);
    assert.match(read(repo, 'plugins/aoforge/hooks/a.js'), /path\.join\(cwd, '\.planning', '\.skill-active'\)/);
  });
});

// ─── CLI argument handling ───────────────────────────────────────────────────

test('an unknown flag, a missing --rules, a bad value or a non-git directory exit 1', () => {
  withRepo((repo) => {
    for (const args of [
      ['--rules', 'names', '--bogus'],
      ['--inventory'],
      ['--rules', 'sideways'],
      ['--rules', 'names', '--report'],
      ['--rules', 'names', '--only'],
      ['--rules', 'names', 'positional'],
      ['--rules', 'names', '--write', '--inventory'],
    ]) {
      const r = run(repo, ...args);
      assert.strictEqual(r.status, 1, args.join(' '));
      assert.ok(r.stderr.length > 0, args.join(' '));
    }
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-nogit-'));
  try {
    const r = run({ root: dir }, '--rules', 'names', '--inventory');
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /git/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── 7. mapPath ──────────────────────────────────────────────────────────────

test('7. mapPath moves plugin directories and renames the known basenames', () => {
  const cases = [
    ['plugins/devflow/devflow/bin/lib/x.cjs', 'plugins/aoforge/aoforge/bin/lib/x.cjs'],
    ['plugins/devflow/hooks/a.js', 'plugins/aoforge/hooks/a.js'],
    ['plugins/devflow/devflow/bin/df-tools.cjs', 'plugins/aoforge/aoforge/bin/aof-tools.cjs'],
    ['plugins/devflow/devflow/bin/df-tools.test.cjs', 'plugins/aoforge/aoforge/bin/aof-tools.test.cjs'],
    ['.github/workflows/devflow-checks.yml', '.github/workflows/aoforge-checks.yml'],
    ['plugins/devflow/devflow/templates/github/devflow.yml', 'plugins/aoforge/aoforge/templates/github/aoforge.yml'],
    ['site/data/devflow.json', 'site/data/aoforge.json'],
    ['site/content/docs/reference/df-tools.md', 'site/content/docs/reference/aof-tools.md'],
    ['plugins/devflow/devflow/bin/devflow-watch.cjs', 'plugins/aoforge/aoforge/bin/aoforge-watch.cjs'],
    [
      'plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/bin/df-tools',
      'plugins/aoforge/aoforge/bin/lib/__fixtures__/agent-shell/bin/aof-tools',
    ],
  ];
  for (const [from, to] of cases) assert.strictEqual(mapPath(from), to, from);
});

test('7. mapPath leaves skipped and unrelated paths unchanged', () => {
  for (const p of [
    '.planning/x',
    '.planning/objectives/72-x/72-03-rename-codemod-TRD.md',
    '.aoforge/x',
    'CHANGELOG.md',
    'plugins/eden-ui-flutter/skills/frontend-design/SKILL.md',
    'docs/notes-on-devflowops.md',
  ]) {
    assert.strictEqual(mapPath(p), p, p);
  }
});

test('7. mapPath is idempotent', () => {
  for (const p of [
    'plugins/devflow/devflow/bin/df-tools.cjs',
    '.github/workflows/devflow-checks.yml',
    'site/data/devflow.json',
  ]) {
    assert.strictEqual(mapPath(mapPath(p)), mapPath(p), p);
  }
});

// ─── 8. rewriteNames ─────────────────────────────────────────────────────────

test('8. rewriteNames rewrites each name form', () => {
  const cases = [
    ['/devflow:quick', '/aoforge:quick'],
    ['devflow:executor', 'aoforge:executor'],
    ['node ~/.claude/devflow/bin/df-tools.cjs', 'node ~/.claude/aoforge/bin/aof-tools.cjs'],
    ['DEVFLOW_SKIP_EDIT_GATE', 'AOFORGE_SKIP_EDIT_GATE'],
    ['<!-- DEVFLOW:START v=3 -->', '<!-- AOFORGE:START v=3 -->'],
    ['DevFlow builds', 'AOForge builds'],
    ['isDevflowAgent', 'isAoforgeAgent'],
    ['DF ► PLANNING', 'AOF ► PLANNING'],
    [
      'github.com/AO-Cyber-Systems/devflow-claude',
      'github.com/AO-Cyber-Systems/aoforge-claude',
    ],
    ['devflow-docs', 'aoforge-docs'],
    ['devflow/adopt', 'aoforge/adopt'],
    ['@ao-cyber-systems/devflow-cc', '@ao-cyber-systems/aoforge-cc'],
    ['TO DF-TOOLS as data', 'TO AOF-TOOLS as data'],
  ];
  for (const [from, to] of cases) {
    assert.strictEqual(rewriteNames(from, 'x.md').text, to, from);
  }
});

test('8. rewriteNames fixes the indefinite article before the new vowel sound', () => {
  const cases = [
    ['Not a DevFlow project', 'Not an AOForge project'],
    ['A DevFlow project', 'An AOForge project'],
    ['a devflow-claude checkout', 'an aoforge-claude checkout'],
    ['a `df-tools` command', 'an `aof-tools` command'],
    ['a DEVFLOW_X variable', 'an AOFORGE_X variable'],
    ['data devflow', 'data aoforge'], // "data" ends in a, but is not the article
    ['a devflowops thing', 'a devflowops thing'], // preserved: not renamed, so no change
  ];
  for (const [from, to] of cases) assert.strictEqual(rewriteNames(from, 'x.md').text, to, from);
  const once = rewriteNames('a DevFlow', 'x.md').text;
  assert.strictEqual(rewriteNames(once, 'x.md').text, once);
});

test('8. rewriteNames counts replacements and reports no residuals for plain text', () => {
  const r = rewriteNames('DevFlow and DevFlow use devflow', 'x.md');
  assert.strictEqual(r.text, 'AOForge and AOForge use aoforge');
  assert.strictEqual(r.count, 3);
  assert.deepStrictEqual(r.residuals, []);
});

test('8. rewriteNames is idempotent', () => {
  const once = rewriteNames('/devflow:quick via df-tools in DevFlow', 'x.md').text;
  const twice = rewriteNames(once, 'x.md');
  assert.strictEqual(twice.text, once);
  assert.strictEqual(twice.count, 0);
});

// ─── 9. preserves ────────────────────────────────────────────────────────────

test('9. global preserves survive a names rewrite', () => {
  assert.strictEqual(rewriteNames('devflowops', 'x.md').text, 'devflowops');
  assert.strictEqual(rewriteNames('devFlowOps', 'x.md').text, 'devFlowOps');
  assert.strictEqual(rewriteNames('DevFlowOps', 'x.md').text, 'DevFlowOps');
  assert.strictEqual(rewriteNames('devflow-desktop', 'x.md').text, 'devflow-desktop');
  assert.strictEqual(rewriteNames('https://devflow.cloud/', 'x.md').text, 'https://devflow.cloud/');
  assert.strictEqual(
    rewriteNames('see devflowops and DevFlow', 'x.md').text,
    'see devflowops and AOForge',
  );
});

test('9. fleet repo names are preserved in stack fixtures, other names still change', () => {
  const rel = 'plugins/aoforge/aoforge/bin/lib/__fixtures__/stack-fleet-tables.cjs';
  const src = "{ repo: 'devflow' }, { repo: 'devflow-test' }, 'Run /devflow:quick'";
  assert.strictEqual(
    rewriteNames(src, rel).text,
    "{ repo: 'devflow' }, { repo: 'devflow-test' }, 'Run /aoforge:quick'",
  );
  // the preserve is scoped to those files by basename: elsewhere the quoted name changes
  assert.strictEqual(rewriteNames("repo: 'devflow'", 'lib/other.cjs').text, "repo: 'aoforge'");
  // the basename scope survives the plugin directory move
  const moved = 'plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs';
  assert.strictEqual(rewriteNames("'devflow-test'", moved).text, "'devflow-test'");
});

test('9. in stack tests the runtime directory under ~/.claude is still renamed', () => {
  const rel = 'plugins/devflow/devflow/bin/lib/stack-profile.test.cjs';
  const src = "path.join(home, '.claude', 'devflow', 'stacks', 'dart.md')";
  assert.strictEqual(
    rewriteNames(src, rel).text,
    "path.join(home, '.claude', 'aoforge', 'stacks', 'dart.md')",
  );
  assert.strictEqual(classifyToken("'devflow'", rel).action, 'preserve');
});

test('9. the monorepo doctor skip list is left alone and reported manual', () => {
  const rel = 'plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js';
  const src = "const SKIP = new Set(['.git', '.devflow', '.planning']);\n";
  const r = rewriteNames(src, rel);
  assert.strictEqual(r.text, src);
  assert.strictEqual(r.residuals.length, 1);
  assert.strictEqual(r.residuals[0].line, 1);
  assert.match(r.residuals[0].reason, /\.aoforge/);
});

// ─── 10. skips ───────────────────────────────────────────────────────────────

test('10. isSkipped covers history, legacy-name files and the planning tree', () => {
  for (const rel of [
    'plugins/devflow/devflow/bin/lib/legacy-names.cjs',
    'plugins/aoforge/aoforge/bin/lib/legacy-names.cjs',
    'plugins/devflow/devflow/bin/lib/__fixtures__/legacy-fixtures.cjs',
    'scripts/__fixtures__/legacy-rename-fixtures.cjs',
    'plugins/devflow/devflow/bin/lib/compat.legacy.test.cjs',
    'a.legacy.test.cjs',
    'CHANGELOG.md',
    'NOTICE.md',
    'LICENSE',
    'LICENSE.md',
    'docs/PROPOSAL-x.md',
    'docs/sub/dir/note.md',
    '.planning/STATE.md',
    '.planning/objectives/72-x/72-01-SUMMARY.md',
    '.aoforge/STATE.md',
    'scripts/aoforge-rename.cjs',
    'scripts/aoforge-rename.legacy.test.cjs',
    'node_modules/x/index.js',
    'site/public/index.html',
  ]) {
    assert.strictEqual(isSkipped(rel), true, rel);
  }
});

test('10. isSkipped does not skip docs/USER-GUIDE.md or ordinary files', () => {
  for (const rel of [
    'docs/USER-GUIDE.md',
    'README.md',
    'plugins/devflow/devflow/bin/lib/compat.cjs',
    'plugins/devflow/hooks/a.js',
    'site/content/docs/reference/df-tools.md',
  ]) {
    assert.strictEqual(isSkipped(rel), false, rel);
  }
});

test('10. isSkipped does not skip the live built-in inventories that repo tests pin to the tree', () => {
  // builtin-sweep.repo.test.cjs and builtin-status.repo.test.cjs check that every path these
  // two files cite exists, so they must follow the renamed tree (TRD 72-04).
  for (const rel of ['docs/built-in-sweep.md', 'docs/built-in-integration-status.md']) {
    assert.strictEqual(isSkipped(rel), false, rel);
  }
  assert.strictEqual(isSkipped('docs/built-in-other.md'), true, 'only the two named inventories are live');
});

test('10. a skipped file is never rewritten', () => {
  const buf = Buffer.from("const LEGACY = { cli: 'df-tools', dir: '.planning' };\n");
  for (const rules of ['names', 'planning']) {
    const r = processFile('plugins/devflow/devflow/bin/lib/legacy-names.cjs', buf, rules);
    assert.strictEqual(r.skipped, 'skip');
    assert.strictEqual(r.changed, false);
  }
});

// ─── 11. binary ──────────────────────────────────────────────────────────────

test('11. a file containing a NUL byte is never rewritten', () => {
  const buf = Buffer.from('devflow\u0000DevFlow df-tools .planning', 'utf8');
  for (const rules of ['names', 'planning']) {
    const r = processFile('assets/x.bin', buf, rules);
    assert.strictEqual(r.skipped, 'binary');
    assert.strictEqual(r.changed, false);
  }
});

test('11. a text file is rewritten through processFile', () => {
  const r = processFile('README.md', Buffer.from('DevFlow\n'), 'names');
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.text, 'AOForge\n');
  assert.strictEqual(r.count, 1);
});

// ─── 12. rewritePlanning ─────────────────────────────────────────────────────

const LIB = 'plugins/aoforge/aoforge/bin/lib/x.cjs';

test('12. path.join(<expr>, ".planning") becomes planningRoot(<expr>) with one import', () => {
  const src = [
    "'use strict';",
    "const path = require('path');",
    '',
    "const a = path.join(ctx.root, '.planning');",
    "const b = path.join(cwd, '.planning', 'STATE.md');",
    '',
  ].join('\n');
  const r = rewritePlanning(src, LIB);
  assert.strictEqual(
    r.text,
    [
      "'use strict';",
      "const path = require('path');",
      "const { planningRoot } = require('./compat.cjs');",
      '',
      'const a = planningRoot(ctx.root);',
      "const b = path.join(planningRoot(cwd), 'STATE.md');",
      '',
    ].join('\n'),
  );
  assert.strictEqual(r.count, 2);
  assert.deepStrictEqual(r.residuals, []);
});

test('12. path.resolve(<expr>, ".planning", ...) is handled the same way', () => {
  const src = "const path = require('path');\nconst d = path.resolve(root, '.planning', 'objectives');\n";
  const r = rewritePlanning(src, LIB);
  assert.match(r.text, /const d = path\.resolve\(planningRoot\(root\), 'objectives'\);/);
  assert.strictEqual((r.text.match(/require\('\.\/compat\.cjs'\)/g) || []).length, 1);
});

test('12. an existing compat require gains planningRoot instead of a second require', () => {
  const src = [
    "'use strict';",
    "const path = require('path');",
    "const { x } = require('./compat.cjs');",
    "const d = path.join(cwd, '.planning');",
    '',
  ].join('\n');
  const r = rewritePlanning(src, LIB);
  assert.match(r.text, /const \{ x, planningRoot \} = require\('\.\/compat\.cjs'\);/);
  assert.strictEqual((r.text.match(/compat\.cjs/g) || []).length, 1);
  assert.match(r.text, /const d = planningRoot\(cwd\);/);
});

test('12. the injected import path is relative to the rewritten file', () => {
  const src = "const path = require('path');\nconst d = path.join(cwd, '.planning');\n";
  const want = (rel, spec) => {
    const r = rewritePlanning(src, rel);
    assert.ok(r.text.includes(`const { planningRoot } = require('${spec}');`), `${rel}\n${r.text}`);
  };
  want('plugins/aoforge/hooks/a.js', '../aoforge/bin/lib/compat.cjs');
  want('plugins/aoforge/aoforge/bin/lib/migrations/0001-x.cjs', '../compat.cjs');
  want('plugins/aoforge/aoforge/bin/lib/doctor-checks/10-x.cjs', '../compat.cjs');
  want('plugins/aoforge/aoforge/bin/aof-tools.cjs', './lib/compat.cjs');
  want('plugins/devflow/hooks/a.js', '../devflow/bin/lib/compat.cjs');
});

test('12. a file that already declares planningRoot is left alone and reported manual', () => {
  const src = [
    "const path = require('path');",
    'function planningRoot(r) { return r; }',
    "const d = path.join(cwd, '.planning');",
    '',
  ].join('\n');
  const r = rewritePlanning(src, LIB);
  assert.strictEqual(r.text, src);
  assert.strictEqual(r.count, 0);
  assert.strictEqual(r.residuals.length, 1);
  assert.match(r.residuals[0].reason, /planningRoot/);
});

test('12. a file that already imports planningRoot from compat is transformed without a second import', () => {
  const src = [
    "const path = require('path');",
    "const { planningRoot } = require('./compat.cjs');",
    "const d = path.join(cwd, '.planning', 'x');",
    '',
  ].join('\n');
  const r = rewritePlanning(src, LIB);
  assert.match(r.text, /const d = path\.join\(planningRoot\(cwd\), 'x'\);/);
  assert.strictEqual((r.text.match(/compat\.cjs/g) || []).length, 1);
});

test('12. a remaining .planning string in non-test code becomes .aoforge and is a residual', () => {
  const src = "const CONFIG = '.planning/config.json';\n";
  const r = rewritePlanning(src, LIB);
  assert.strictEqual(r.text, "const CONFIG = '.aoforge/config.json';\n");
  assert.strictEqual(r.residuals.length, 1);
  assert.strictEqual(r.residuals[0].line, 1);
  assert.match(r.residuals[0].text, /\.aoforge\/config\.json/);
});

test('12. markdown prose and code comments are rewritten without a residual', () => {
  const md = rewritePlanning('Read .planning/STATE.md first.\n', 'plugins/aoforge/skills/q/SKILL.md');
  assert.strictEqual(md.text, 'Read .aoforge/STATE.md first.\n');
  assert.deepStrictEqual(md.residuals, []);
  const js = rewritePlanning('// state lives in .planning/STATE.md\n', LIB);
  assert.strictEqual(js.text, '// state lives in .aoforge/STATE.md\n');
  assert.deepStrictEqual(js.residuals, []);
});

test('12. a regex literal is left alone and reported manual in non-test code', () => {
  const src = 'const RE = /\\/\\.planning\\//;\n';
  const r = rewritePlanning(src, LIB);
  assert.strictEqual(r.text, src);
  assert.strictEqual(r.residuals.length, 1);
  assert.match(r.residuals[0].reason, /regex/i);
});

test('12. in test files the directory name is replaced with no planningRoot and no residual', () => {
  const src = "const d = path.join(tmp, '.planning', 'x');\nconst RE = /\\.planning/;\n";
  const r = rewritePlanning(src, 'plugins/aoforge/aoforge/bin/lib/y.test.cjs');
  assert.strictEqual(r.text, "const d = path.join(tmp, '.aoforge', 'x');\nconst RE = /\\.aoforge/;\n");
  assert.deepStrictEqual(r.residuals, []);
  assert.ok(!r.text.includes('planningRoot'));
});

test('12. property access and identifiers that merely contain "planning" are untouched', () => {
  const src = 'calls.planning.push(dir); opts.planningDir; cfg.planning.commit_docs; p.planning_dir;\n';
  const r = rewritePlanning(src, LIB);
  assert.strictEqual(r.text, src);
  assert.strictEqual(r.count, 0);
});

test('12. escaped newline and tab before .planning still count as a path', () => {
  const r = rewritePlanning("const s = 'a\\n.planning/STATE.md\\t.planning/x';\n", LIB);
  assert.strictEqual(r.text, "const s = 'a\\n.aoforge/STATE.md\\t.aoforge/x';\n");
});

test('12. a git pathspec exclude and a template interpolation still name the directory', () => {
  const spec = rewritePlanning("const args = ['--', ':(exclude).planning'];\n", LIB);
  assert.strictEqual(spec.text, "const args = ['--', ':(exclude).aoforge'];\n");
  assert.strictEqual(spec.residuals.length, 1);
  const tpl = rewritePlanning('const p = `${root}.planning${path.sep}`;\n', LIB);
  assert.strictEqual(tpl.text, 'const p = `${root}.aoforge${path.sep}`;\n');
  assert.strictEqual(tpl.residuals.length, 1);
});

test('12. a dot after a closing bracket that is not an interpolation stays ambiguous and untouched', () => {
  const src = 'const x = list.map(f).planning;\nconst y = a[0].planning;\n';
  const r = rewritePlanning(src, LIB);
  assert.strictEqual(r.text, src);
  assert.strictEqual(r.residuals.length, 2);
  assert.match(r.residuals[0].reason, /ambiguous/);
});

test('12. no compat file in reach: .aoforge text and a residual, no import', () => {
  const src = "const path = require('path');\nconst d = path.join(cwd, '.planning');\n";
  const r = rewritePlanning(src, 'plugins/other/lib/x.js', { compatPath: null });
  assert.strictEqual(r.text, "const path = require('path');\nconst d = path.join(cwd, '.aoforge');\n");
  assert.strictEqual(r.residuals.length, 1);
  assert.match(r.residuals[0].reason, /compat/);
});

test('12. the monorepo doctor skip list keeps ".planning" and is reported manual', () => {
  const rel = 'plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js';
  const src = "const SKIP = new Set(['.git', '.devflow', '.planning']);\n";
  const r = rewritePlanning(src, rel);
  assert.strictEqual(r.text, src);
  assert.strictEqual(r.residuals.length, 1);
  assert.match(r.residuals[0].reason, /\.aoforge/);
});

test('12. rewritePlanning is idempotent', () => {
  const src = [
    "const path = require('path');",
    "const a = path.join(cwd, '.planning', 'ROADMAP.md');",
    "const c = '.planning/config.json';",
    '',
  ].join('\n');
  const once = rewritePlanning(src, LIB);
  const twice = rewritePlanning(once.text, LIB);
  assert.strictEqual(twice.text, once.text);
  assert.strictEqual(twice.count, 0);
  assert.deepStrictEqual(twice.residuals, []);
});

// ─── 13. classifyToken ───────────────────────────────────────────────────────

test('13. classifyToken renames a known compound', () => {
  assert.deepStrictEqual(classifyToken('devflow-watch'), { action: 'rename', target: 'aoforge-watch' });
  const cli = classifyToken('df-tools.cjs');
  assert.strictEqual(cli.action, 'rename');
  assert.strictEqual(cli.target, 'aof-tools.cjs');
  assert.strictEqual(classifyToken('isDevflowAgent').target, 'isAoforgeAgent');
  assert.strictEqual(classifyToken('DEVFLOW_SKIP_EDIT_GATE').target, 'AOFORGE_SKIP_EDIT_GATE');
  assert.strictEqual(classifyToken('devflowSrc').target, 'aoforgeSrc');
});

test('13. classifyToken preserves another product, the domain and the desktop app', () => {
  assert.strictEqual(classifyToken('devflowops').action, 'preserve');
  assert.strictEqual(classifyToken('devflowops.format').action, 'preserve');
  assert.strictEqual(classifyToken('devflow.cloud').action, 'preserve');
  assert.strictEqual(classifyToken('devflow-desktop').action, 'preserve');
  assert.ok(classifyToken('devflowops').reason);
});

test('13. classifyToken refuses a glued or unknown spelling', () => {
  assert.strictEqual(classifyToken('devflowzap').action, 'unclassified');
  assert.strictEqual(classifyToken('xdevflow').action, 'unclassified');
  assert.strictEqual(classifyToken('devFlow').action, 'unclassified');
});

test('13. classifyToken accepts the one known glued spelling, a negative test vector', () => {
  // gate-edits tests feed `devflowx:y` to prove the agent-type match needs the exact prefix
  assert.deepStrictEqual(classifyToken('devflowx'), { action: 'rename', target: 'aoforgex' });
  assert.strictEqual(classifyToken('devflowxy').action, 'unclassified');
});

test('13. classifyToken honours file-scoped entries, which match the quoted form', () => {
  const doctor = 'plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js';
  assert.strictEqual(classifyToken("'.devflow'", doctor).action, 'manual');
  assert.strictEqual(classifyToken("'.devflow'", 'lib/other.cjs').action, 'rename');
  const fleet = 'plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs';
  assert.strictEqual(classifyToken("'devflow-test'", fleet).action, 'preserve');
  assert.strictEqual(classifyToken("'devflow-test'", 'lib/other.cjs').action, 'rename');
});

test('13. classifyToken for the planning rules', () => {
  assert.deepStrictEqual(classifyToken('.planning/STATE.md', '', 'planning'), {
    action: 'rename',
    target: '.aoforge/STATE.md',
  });
  assert.strictEqual(classifyToken('opts.planningDir', '', 'planning').action, 'preserve');
  assert.strictEqual(classifyToken('p.planning', '', 'planning').action, 'preserve');
});

// 14. Ignore regions (TRD 72-06): lines between the rename-guard ignore markers are never rewritten, by
//     either pass, so CLAUDE.md's transition note can name the legacy spellings on purpose. The markers are
//     built from parts, like the guard's, so this file holds no region of its own.
const IGNORE_START = ['rename-guard', 'ignore-start'].join(':');
const IGNORE_END = ['rename-guard', 'ignore-end'].join(':');

test('14. lines inside an ignore region are kept, lines outside are rewritten (planning)', () => {
  const text = [
    'Read .planning/STATE.md first.',
    `<!-- ${IGNORE_START} -->`,
    '> The planning tree stays at `.planning/` until 72-21.',
    `<!-- ${IGNORE_END} -->`,
    'Then .planning/ROADMAP.md.',
    '',
  ].join('\n');
  const r = processFile('CLAUDE.md', Buffer.from(text), 'planning');
  assert.strictEqual(r.skipped, null);
  assert.strictEqual(
    r.text,
    [
      'Read .aoforge/STATE.md first.',
      `<!-- ${IGNORE_START} -->`,
      '> The planning tree stays at `.planning/` until 72-21.',
      `<!-- ${IGNORE_END} -->`,
      'Then .aoforge/ROADMAP.md.',
      '',
    ].join('\n'),
  );
  assert.strictEqual(r.count, 2);
});

test('14. an ignore region is honoured by the names pass too, and a file without one is unchanged in behaviour', () => {
  const text = [`<!-- ${IGNORE_START} -->`, 'DevFlow 2.15.0 is live.', `<!-- ${IGNORE_END} -->`, 'DevFlow', ''].join('\n');
  const r = processFile('README.md', Buffer.from(text), 'names');
  assert.strictEqual(r.text, [`<!-- ${IGNORE_START} -->`, 'DevFlow 2.15.0 is live.', `<!-- ${IGNORE_END} -->`, 'AOForge', ''].join('\n'));
  const plain = processFile('README.md', Buffer.from('DevFlow\n'), 'names');
  assert.strictEqual(plain.text, 'AOForge\n');
});

test('14. residual line numbers count the lines of an ignore region', () => {
  const src = [
    `// ${IGNORE_START}`,
    "const keep = '.planning/x';",
    `// ${IGNORE_END}`,
    "const d = '.planning/config.json';",
    '',
  ].join('\n');
  const r = processFile('plugins/aoforge/aoforge/bin/lib/x.cjs', Buffer.from(src), 'planning');
  assert.ok(r.text.includes("const keep = '.planning/x';"), r.text);
  assert.ok(r.text.includes("const d = '.aoforge/config.json';"), r.text);
  assert.deepStrictEqual(r.residuals.map((x) => x.line), [4]);
});
