'use strict';

// Hand-built fixture builders for stack-profile.cjs tests (TRD 35-02a).
// Per TDD playbook habit 4 (`no_llm_test_data`): factory functions, not generated test data.
// Every builder writes into a `fs.mkdtemp`-ed directory; nothing here ever touches the real
// `~/.claude` — a fake home is always an explicit, disposable temp directory.

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * makeProject({ stackMd, stacks, files }) -> absolute project root
 *
 * Always creates `<root>/.planning/`. When `stackMd` is given, writes it to
 * `<root>/.planning/STACK.md` (the project tier). `stacks` writes project-local component
 * override files to `<root>/.planning/stacks/<name>.md` (keys are bare names — the `.md`
 * extension is added here). `files` writes arbitrary repo files at `<root>/<relPath>`,
 * creating parent directories as needed.
 */
function makeProject({ stackMd = null, stacks = {}, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-project-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });

  if (stackMd !== null) {
    fs.writeFileSync(path.join(root, '.planning', 'STACK.md'), stackMd, 'utf-8');
  }

  const stackNames = Object.keys(stacks);
  if (stackNames.length) {
    fs.mkdirSync(path.join(root, '.planning', 'stacks'), { recursive: true });
    for (const name of stackNames) {
      fs.writeFileSync(path.join(root, '.planning', 'stacks', `${name}.md`), stacks[name], 'utf-8');
    }
  }

  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }

  return root;
}

/**
 * makeHome({ stacks }) -> absolute fake home directory
 *
 * Writes each entry to `<home>/.claude/devflow/stacks/<id>.md` (keys are bare ids — the `.md`
 * extension is added here). This is the ONLY thing tests pass as `userHome`; nothing in this
 * module or in stack-profile.cjs ever reads the operator's real home.
 */
function makeHome({ stacks = {} } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-stack-home-'));
  const ids = Object.keys(stacks);
  if (ids.length) {
    const dir = path.join(home, '.claude', 'devflow', 'stacks');
    fs.mkdirSync(dir, { recursive: true });
    for (const id of ids) {
      fs.writeFileSync(path.join(dir, `${id}.md`), stacks[id], 'utf-8');
    }
  }
  return home;
}

/**
 * profileMd({ yaml, sections }) -> string
 *
 * `'---\n' + yaml + '\n---\n\n# Stack Profile\n\n'`, then for each `{ name, text, inherit }` in
 * `sections`: `## <name>\n\n`, an `<!-- inherit -->\n` marker line when `inherit` is truthy,
 * then `<text>\n\n`. `sections` defaults to `[]` (frontmatter-only fixtures are common).
 */
function profileMd({ yaml, sections = [] } = {}) {
  let out = `---\n${yaml}\n---\n\n# Stack Profile\n\n`;
  for (const section of sections) {
    out += `## ${section.name}\n\n`;
    if (section.inherit) out += '<!-- inherit -->\n';
    out += `${section.text || ''}\n\n`;
  }
  return out;
}

/**
 * orgProfileGoLike() -> string
 *
 * A hand-built org/pack-tier fixture: id `golike`, extends `general`, a `detect` marker
 * (`go.mod` — so `pickExtends` finds it against a go.mod-shaped repo per 35-04's I2/I12), and
 * `commands.build` / `commands.test` (the latter with a `scoped` form so tests can prove atomic
 * command-object replacement), plus `verification.runtime: service`. The name and command
 * strings are deliberately synthetic ("golike", "buildtool …") — this is a stand-in shape for
 * an org/pack profile, not a real one.
 */
function orgProfileGoLike() {
  return profileMd({
    yaml: [
      'schema: 1',
      'id: golike',
      'extends: general',
      'detect: [go.mod]',
      'commands:',
      '  build: { run: "buildtool build ./..." }',
      '  test: { run: "buildtool test ./...", scoped: "buildtool test -race {packages}" }',
      'verification:',
      '  runtime: service',
    ].join('\n'),
    sections: [{ name: 'Idioms', text: 'Org-tier idiom text for golike.' }],
  });
}

/**
 * goShapedRepo() -> absolute project root shaped like a Go project (35-04's I2/I12 DoD fixture):
 * a `go.mod`, a CI workflow whose one step runs `go test ./...`, and a package file so the
 * `--packages ./pkg` DoD invocation has somewhere to point. Pass to `makeProject({ files })`
 * — this returns the `files` object, not a directory, so the caller controls `stackMd`/`stacks`
 * alongside it in the same `makeProject` call.
 */
function goShapedRepo() {
  return {
    'go.mod': 'module example.com/x\n',
    '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - run: go test ./...\n',
    'pkg/a.go': 'package pkg\n',
  };
}

/**
 * cycleHome() -> fake home with an org-tier `a` <-> `b` extends cycle (id `a` extends `b`,
 * id `b` extends `a`). Write `extends: a` in the caller's project STACK.md to trip it.
 * (35-03: shared by validateProfile's STK003 cases and R8-style resolve cases.)
 */
function cycleHome() {
  return makeHome({
    stacks: {
      a: profileMd({ yaml: ['schema: 1', 'id: a', 'extends: b'].join('\n') }),
      b: profileMd({ yaml: ['schema: 1', 'id: b', 'extends: a'].join('\n') }),
    },
  });
}

/**
 * chainHome(n) -> fake home with `n` org-tier hops `h1..hn`, `h1` extending `general` and each
 * `h(i)` extending `h(i-1)`. Write `extends: h<n>` in the caller's project STACK.md to walk the
 * full chain. (35-03: shared by validateProfile's STK004 cases and R9-style resolve cases.)
 */
function chainHome(n) {
  const stacks = {};
  for (let i = 1; i <= n; i++) {
    const id = `h${i}`;
    const parent = i === 1 ? 'general' : `h${i - 1}`;
    stacks[id] = profileMd({ yaml: ['schema: 1', `id: ${id}`, `extends: ${parent}`].join('\n') });
  }
  return makeHome({ stacks });
}

/**
 * longBodyProfile(n) -> a minimal profile document (`schema: 1` only, no sections) whose body
 * is exactly `n + 1` lines: `n` content lines plus the trailing-newline's empty segment that
 * `parseProfile`'s `bodyLineCount` always counts. Call `longBodyProfile(150)` for a body of 151
 * lines — one past the 150-line STK007 threshold. (35-05 will need the same boundary control
 * for its own W-code mapping, so it lives here rather than being inlined per-caller.)
 */
function longBodyProfile(n) {
  const body = Array.from({ length: n }, (_, i) => `Line ${i + 1}.`).join('\n');
  return `---\nschema: 1\n---\n${body}\n`;
}

/** cleanup(...dirs) — best-effort recursive removal; never throws. */
function cleanup(...dirs) {
  for (const dir of dirs) {
    if (!dir) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

module.exports = {
  makeProject,
  makeHome,
  profileMd,
  orgProfileGoLike,
  goShapedRepo,
  cycleHome,
  chainHome,
  longBodyProfile,
  cleanup,
};
