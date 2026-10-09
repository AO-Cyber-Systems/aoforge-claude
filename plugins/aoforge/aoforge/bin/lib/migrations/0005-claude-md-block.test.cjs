'use strict';

// TRD 36-04c — migration 0005 claude-md-block (test list items 1-14, plus 15: never downgrade).
//
// no_llm_test_data: projects come from the shared hand-built fixtures (upgrade-fixtures.cjs); the
// versioned variants below are literal strings built in canonical managed-block form. Nothing
// touches the real ~/.claude, and nothing runs against this repo's CLAUDE.md.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const managedBlock = require('../managed-block.cjs');
const fx = require('../__fixtures__/upgrade-fixtures.cjs');

const MIGRATION_PATH = path.join(__dirname, '0005-claude-md-block.cjs');
const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'templates', 'claude-md.md');
const CLAUDE_REL = 'CLAUDE.md';
const PLUGIN_VERSION = '2.11.0';

// The user text the fixture wraps around the block (upgrade-fixtures.cjs CLAUDE_MD_BEFORE/AFTER).
const BEFORE = '# My notes\n\nkeep me\n\n';
const AFTER = '\n\n## After\n\nkeep me too\n';
const V2_START = '<!-- AOFORGE:START v=2 src=claude-md -->';
const END = '<!-- AOFORGE:END -->';

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const dir = cleanup.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function m0005() {
  return require(MIGRATION_PATH);
}

function track(dir) {
  cleanup.push(dir);
  return dir;
}

function ctxFor(root, { dryRun = false } = {}) {
  const home = track(fx.makeFakeHome());
  return { projectRoot: root, userHome: home, pluginVersion: PLUGIN_VERSION, dryRun, options: {} };
}

function readClaude(root) {
  return fs.readFileSync(path.join(root, CLAUDE_REL), 'utf-8');
}

function writeClaude(root, text) {
  fs.writeFileSync(path.join(root, CLAUDE_REL), text);
}

function templateRules() {
  return m0005().loadClaudeMdTemplate().rules;
}

// A versioned block in canonical managed-block form: one blank line after START, none before END,
// so read -> render round-trips it byte for byte.
function versionedClaudeMd(startMarker, rulesSection) {
  const sections = ['# Project Overview\n\nFixture app.'];
  if (rulesSection !== null) sections.push(rulesSection);
  sections.push('# Code Style\n\n- Use camelCase');
  return `${BEFORE}${startMarker}\n\n${sections.join('\n\n')}\n${END}${AFTER}`;
}

describe('migration 0005 claude-md-block', () => {
  test('1. contract: id 0005, safety auto, semver since; loadRegistry() includes it', () => {
    const m = m0005();
    assert.equal(m.id, '0005');
    assert.equal(m.safety, 'auto');
    assert.match(m.since, /^\d+\.\d+\.\d+$/);
    assert.ok(typeof m.title === 'string' && m.title.trim().length > 0);
    assert.equal(typeof m.detect, 'function');
    assert.equal(typeof m.apply, 'function');
    assert.equal(typeof m.loadClaudeMdTemplate, 'function');

    const entry = upgrade.loadRegistry().find((r) => r.id === '0005');
    assert.ok(entry, 'registry includes 0005');
    assert.equal(entry.safety, 'auto');
  });

  test('2. loadClaudeMdTemplate() -> version 2 and the corrected Development Rules', () => {
    const tpl = m0005().loadClaudeMdTemplate();
    assert.equal(tpl.version, '2');
    assert.ok(tpl.rules.startsWith('# Development Rules'), 'rules start at the heading');
    assert.ok(tpl.rules.includes('Objectives chain automatically'));
    assert.ok(tpl.rules.includes('~/.claude/aoforge/references/tdd.md'));
    assert.ok(tpl.rules.includes('~/.claude/aoforge/references/anti-patterns.md'));
    assert.doesNotMatch(tpl.rules, /Phases/);
    assert.doesNotMatch(tpl.rules, /\n# /, 'rules stop before the next section');
    assert.doesNotMatch(tpl.rules, /\s$/, 'trailing blank lines trimmed');
  });

  test('3. template hygiene: frontmatter, no Phases, no repo-relative paths, versioned markers', () => {
    const text = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    assert.match(text, /^---\ntemplate: claude-md\ntemplate_version: "2"\n---\n/);
    assert.doesNotMatch(text, /Phases/);
    assert.ok(!text.includes('(see .claude/aoforge'), 'no repo-relative (see .claude/aoforge path');
    assert.doesNotMatch(text, /(?<!~\/)\.claude\/aoforge\//, 'every runtime path is ~/.claude/aoforge/');
    assert.ok(text.includes(V2_START), 'example markers are versioned');
    assert.ok(!text.includes('<!-- AOFORGE:START - Auto-generated'), 'no legacy marker left in the template');
  });

  test('4. legacy block (makeV1Project) -> detect applies (legacy/unversioned marker)', () => {
    const root = track(fx.makeV1Project());
    const det = m0005().detect(ctxFor(root));
    assert.equal(det.applies, true);
    assert.match(det.reason, /legacy|unversioned/);
  });

  test('5. apply on legacy: bytes outside identical, v=2 marker, only the rules section rewritten', () => {
    const m = m0005();
    const root = track(fx.makeV1Project());
    const res = m.apply(ctxFor(root));
    assert.deepEqual(res.changed, [CLAUDE_REL]);

    const text = readClaude(root);
    const block = managedBlock.read(text);
    assert.ok(block, 'block still present');
    assert.equal(text.slice(0, block.start), BEFORE);
    assert.equal(text.slice(block.end), AFTER);
    assert.ok(text.slice(block.start).startsWith(V2_START));
    assert.equal(block.meta.v, '2');
    assert.equal(block.meta.src, 'claude-md');

    assert.ok(block.content.includes('# Project Overview\n\nFixture app.'));
    assert.ok(block.content.includes('# Code Style\n\n- Use camelCase'));
    assert.equal(
      block.content,
      `\n# Project Overview\n\nFixture app.\n\n${templateRules()}\n\n# Code Style\n\n- Use camelCase`,
      'rules replaced in place; other sections untouched',
    );
  });

  test('6. v=2 block whose rules already match -> detect false', () => {
    const root = track(fx.makeV1Project());
    writeClaude(root, versionedClaudeMd(V2_START, templateRules()));
    const det = m0005().detect(ctxFor(root));
    assert.equal(det.applies, false);
    assert.match(det.reason, /current|up to date/);
  });

  test('7. v=2 block with hand-edited rules -> detect applies (drift); apply restores the rules only', () => {
    const m = m0005();
    const root = track(fx.makeV1Project());
    const rules = templateRules();
    const edited = rules.replace('- Verification:', '- My own rule: keep it\n- Verification:');
    assert.notEqual(edited, rules);
    const original = versionedClaudeMd(V2_START, edited);
    writeClaude(root, original);

    const det = m.detect(ctxFor(root));
    assert.equal(det.applies, true);
    assert.match(det.reason, /drift|differs/);

    const res = m.apply(ctxFor(root));
    assert.deepEqual(res.changed, [CLAUDE_REL]);
    assert.equal(readClaude(root), versionedClaudeMd(V2_START, rules));
    assert.equal(readClaude(root), original.replace(edited, rules), 'only the rules section changed');
  });

  test('8. v=1 block -> detect applies (stale); apply stamps v=2', () => {
    const m = m0005();
    const root = track(fx.makeV1Project());
    writeClaude(root, versionedClaudeMd('<!-- AOFORGE:START v=1 src=claude-md -->', templateRules()));

    const det = m.detect(ctxFor(root));
    assert.equal(det.applies, true);
    assert.match(det.reason, /v=1/);

    m.apply(ctxFor(root));
    assert.equal(readClaude(root), versionedClaudeMd(V2_START, templateRules()));
  });

  test('9. block with no Development Rules section -> apply inserts it as the first section', () => {
    const m = m0005();
    const root = track(fx.makeV1Project());
    writeClaude(root, versionedClaudeMd(V2_START, null));

    const det = m.detect(ctxFor(root));
    assert.equal(det.applies, true);
    assert.match(det.reason, /missing|no .*Development Rules/);

    m.apply(ctxFor(root));
    const expected =
      `${BEFORE}${V2_START}\n\n${templateRules()}\n\n# Project Overview\n\nFixture app.\n\n` +
      `# Code Style\n\n- Use camelCase\n${END}${AFTER}`;
    assert.equal(readClaude(root), expected);
  });

  test('10. CLAUDE.md with no block -> detect false; runner apply() leaves CLAUDE.md byte-identical', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: 'none' }));
    const before = readClaude(root);
    const ctx = ctxFor(root);

    const det = m0005().detect(ctx);
    assert.equal(det.applies, false);
    assert.match(det.reason, /no AOFORGE block/);

    const report = upgrade.apply({ projectRoot: root, userHome: ctx.userHome, pluginVersion: PLUGIN_VERSION });
    assert.ok(!report.applied.some((a) => a.id === '0005'), '0005 not applied');
    assert.ok(report.skipped.some((s) => s.id === '0005'), '0005 skipped');
    assert.equal(readClaude(root), before, 'never adds a block');
  });

  test('11. no CLAUDE.md -> detect false', () => {
    const root = track(fx.makeV1Project({ claudeMdBlock: null }));
    const det = m0005().detect(ctxFor(root));
    assert.equal(det.applies, false);
    assert.match(det.reason, /CLAUDE\.md/);
    assert.equal(fs.existsSync(path.join(root, CLAUDE_REL)), false);
  });

  test('12. two blocks -> detect false (ManagedBlockError reason); runner apply leaves the file unchanged', () => {
    const root = track(fx.makeV1Project());
    const original = BEFORE + fx.LEGACY_CLAUDE_MD_BLOCK + '\n\n' + fx.LEGACY_CLAUDE_MD_BLOCK + AFTER;
    writeClaude(root, original);
    const ctx = ctxFor(root);

    const det = m0005().detect(ctx);
    assert.equal(det.applies, false);
    assert.match(det.reason, /multiple AOFORGE blocks/);

    const report = upgrade.apply({ projectRoot: root, userHome: ctx.userHome, pluginVersion: PLUGIN_VERSION });
    assert.ok(!report.applied.some((a) => a.id === '0005'));
    assert.ok(!report.failed.some((f) => f.id === '0005'));
    assert.equal(readClaude(root), original);
  });

  test('13. dryRun writes nothing and still returns changed', () => {
    const root = track(fx.makeV1Project());
    const before = fx.snapshot(root);
    const res = m0005().apply(ctxFor(root, { dryRun: true }));
    assert.deepEqual(res.changed, [CLAUDE_REL]);
    assert.deepEqual(fx.diffSnapshots(before, fx.snapshot(root)), []);
  });

  test('14. second apply is a no-op: detect false after the first apply', () => {
    const m = m0005();
    const root = track(fx.makeV1Project());
    m.apply(ctxFor(root));
    const once = readClaude(root);

    const det = m.detect(ctxFor(root));
    assert.equal(det.applies, false);
    m.apply(ctxFor(root));
    assert.equal(readClaude(root), once, 'applying again changes nothing');
  });

  test('15. a block newer than the template -> detect false (never downgraded)', () => {
    const root = track(fx.makeV1Project());
    const original = versionedClaudeMd('<!-- AOFORGE:START v=3 src=claude-md -->', '# Development Rules\n\n- Future rule');
    writeClaude(root, original);
    const det = m0005().detect(ctxFor(root));
    assert.equal(det.applies, false);
    assert.match(det.reason, /newer/);
  });
});
