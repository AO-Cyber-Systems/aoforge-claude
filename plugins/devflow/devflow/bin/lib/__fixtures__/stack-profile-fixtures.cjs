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
 * A hand-built org/pack-tier fixture: id `golike`, extends `general`, a `detect` marker, and
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
      'detect: [marker.lock]',
      'commands:',
      '  build: { run: "buildtool build ./..." }',
      '  test: { run: "buildtool test ./...", scoped: "buildtool test -race {packages}" }',
      'verification:',
      '  runtime: service',
    ].join('\n'),
    sections: [{ name: 'Idioms', text: 'Org-tier idiom text for golike.' }],
  });
}

/** cleanup(...dirs) — best-effort recursive removal; never throws. */
function cleanup(...dirs) {
  for (const dir of dirs) {
    if (!dir) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

module.exports = { makeProject, makeHome, profileMd, orgProfileGoLike, cleanup };
