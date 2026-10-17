'use strict';

/**
 * legacy-claude-md-fixtures.cjs (objective 72, TRD 72-09; objective 78, TRD 78-08) — CLAUDE.md files written before
 * the rename, and the throwaway homes and projects that hold them. Since 3.1 (TRD 78-08) AOForge refuses a block
 * under the pre-rename markers and never rewrites any of this text: these files are inputs that must come out of
 * every upgrade byte-identical.
 *
 *   globalClaudeMd()                         // the user's global file: hand-written sections around a v3 legacy block
 *   globalClaudeMd({ outsideLegacy: false }) // the same, with no legacy name outside the block
 *   globalClaudeMd({ crlf: true })           // the same bytes with CRLF line endings (TRD 78-08)
 *   handWrittenRoutingClaudeMd()             // no block: a hand-written "DevFlow Routing" section (the pre-36 shape)
 *   projectClaudeMd()                        // a project file: hand-written intro + legacy-marker block, legacy body
 *   projectClaudeMd({ legacyBlock: false })  // the same intro + an AOFORGE block with no legacy name in its body
 *   projectClaudeMd({ legacyBlock: false, legacyBody: true })  // AOFORGE markers, legacy names still in the body
 *   const home = fakeHomeWith(text);          // <tmp>/.claude/CLAUDE.md = text; remove it with fs.rmSync
 *   const root = projectWith(text);           // <tmp>/CLAUDE.md = text (text null: no CLAUDE.md at all)
 *
 * globalClaudeMd is a typed-out copy of the SHAPE of the real ~/.claude/CLAUDE.md as of 2026-10-08 (never read here):
 *   - "# HARD RULES" and an "Import Paths" section that mentions the devflowops product (a different product);
 *   - a v3 `DEVFLOW:START v=3 src=global-claude-md` block holding "# DevFlow Routing" and the `/devflow:` list;
 *   - after the block, a "## TDD & Quality" section with exactly ONE line naming the legacy product, its runtime
 *     path included (OUTSIDE_LEGACY_LINE);
 *   - a "# Brand Guide" section with no legacy name.
 *
 * projectClaudeMd has a hand-written paragraph ABOVE the block that names the legacy product and a block body with
 * the product name, `/devflow:quick`, the legacy CLI path and the legacy planning directory.
 *
 * Legacy names may be spelled here: this is one of the `__fixtures__/legacy-*` files the rename codemod and the
 * rename guard leave alone. Every value is a hand-written literal.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── global ~/.claude/CLAUDE.md ────────────────────────────────────────────────

const GLOBAL_HEAD =
  '# HARD RULES (non-negotiable)\n\n' +
  '- **NEVER use port 8080.** Use port 8091 for local verification servers.\n' +
  '- A secret at rest on this machine is not a leak.\n\n' +
  '# Import Paths — Vanity Domains\n\n' +
  'AOCyber code references its own modules by aocyber.ai names, so repo hosting (org renames, the GitHub EMU\n' +
  'migration, a later devflowops move) never touches source again.\n\n';

const LEGACY_GLOBAL_BLOCK =
  '<!-- DEVFLOW:START v=3 src=global-claude-md -->\n' +
  '# DevFlow Routing\n\n' +
  'The DevFlow plugin (`devflow@aocyber`) is installed. When the user\'s request fits a DevFlow workflow,\n' +
  'invoke the matching skill via the Skill tool instead of editing files directly.\n\n' +
  '- Building a feature end-to-end → `/devflow:build`\n' +
  '- Planning before building → `/devflow:plan-objective`\n' +
  '- Executing a planned objective → `/devflow:execute-objective`\n' +
  '- Quick ad-hoc task with atomic commits → `/devflow:quick`\n' +
  '- Adopt an existing repo (unattended, one commit on devflow/adopt) → `/devflow:adopt`\n' +
  '- Diagnose and safely repair the install and project state → `/devflow:doctor` (`doctor --fix`)\n\n' +
  'Skills enforce atomic commits, state tracking, and verification. Run `/devflow:help` to list all commands.\n' +
  '<!-- DEVFLOW:END -->';

const OUTSIDE_LEGACY_LINE =
  "DevFlow's intent model splits testing rigor by project kind; its defaults table is `~/.claude/devflow/references/defaults-table.md`.";

const OUTSIDE_PLAIN_LINE = 'The intent model splits testing rigor by project kind; its defaults table ships with the plugin.';

function globalTail(outsideLegacy) {
  return (
    '\n## TDD & Quality\n\n' +
    `${outsideLegacy ? OUTSIDE_LEGACY_LINE : OUTSIDE_PLAIN_LINE}\n` +
    'For `library`, `api`, and `cli` kind projects: write the failing test before the implementation.\n\n' +
    '# Brand Guide\n\n' +
    'Gold `#d4a853` is the only decorative accent. Never navy or teal.\n'
  );
}

/**
 * globalClaudeMd({ outsideLegacy = true, crlf = false }) -> the full text of a pre-rename global CLAUDE.md.
 * `crlf` turns every line ending into CRLF.
 */
function globalClaudeMd({ outsideLegacy = true, crlf = false } = {}) {
  const text = `${GLOBAL_HEAD}${LEGACY_GLOBAL_BLOCK}\n${globalTail(outsideLegacy)}`;
  return crlf ? text.replace(/\n/g, '\r\n') : text;
}

/**
 * The pre-36 shape: no managed block, a hand-written routing section under `heading` ("DevFlow Routing" or
 * "AOForge Routing"), then a TDD section with no legacy name.
 */
function handWrittenRoutingClaudeMd(heading = 'DevFlow Routing') {
  return (
    '# HARD RULES (non-negotiable)\n\n' +
    '- **NEVER use port 8080.** Use port 8091 for local verification servers.\n\n' +
    `# ${heading}\n\n` +
    'The DevFlow plugin (`devflow@aocyber`) is installed.\n\n' +
    '- Building a feature end-to-end → `/devflow:build`\n' +
    '- Quick ad-hoc task with atomic commits → `/devflow:quick`\n\n' +
    '## TDD & Quality\n\n' +
    `${OUTSIDE_PLAIN_LINE}\n`
  );
}

// ─── project CLAUDE.md ─────────────────────────────────────────────────────────

const PROJECT_INTRO =
  '# CLAUDE.md\n\n' +
  'This project was set up with DevFlow in 2025; the notes below the markers are generated.\n\n';

const LEGACY_PROJECT_BODY =
  '# Development Rules\n\n' +
  '- This project uses DevFlow. Small fixes go through `/devflow:quick`.\n' +
  '- State lives in `.planning/STATE.md`; read it with `node ~/.claude/devflow/bin/df-tools.cjs state load`.\n\n' +
  '## Stack\n\n' +
  'Go 1.24 service; tests run with `go test ./...`.';

const CURRENT_PROJECT_BODY =
  '# Development Rules\n\n' +
  '- This project uses AOForge. Small fixes go through `/aoforge:quick`.\n' +
  '- State lives in `.aoforge/STATE.md`; read it with `node ~/.claude/aoforge/bin/aof-tools.cjs state load`.\n\n' +
  '## Stack\n\n' +
  'Go 1.24 service; tests run with `go test ./...`.';

const PROJECT_OUTRO = '\n\n## Local notes\n\nHand-written, kept as is.\n';

/**
 * projectClaudeMd({ legacyBlock = true, legacyBody = legacyBlock }) -> a project CLAUDE.md.
 *
 * `legacyBlock` picks the markers (DEVFLOW or AOFORGE, both `v=2 src=claude-md`); `legacyBody` picks the body
 * (legacy names, or their AOForge forms). The intro above the block always names the legacy product.
 */
function projectClaudeMd({ legacyBlock = true, legacyBody = legacyBlock } = {}) {
  const tag = legacyBlock ? 'DEVFLOW' : 'AOFORGE';
  const body = legacyBody ? LEGACY_PROJECT_BODY : CURRENT_PROJECT_BODY;
  return `${PROJECT_INTRO}<!-- ${tag}:START v=2 src=claude-md -->\n${body}\n<!-- ${tag}:END -->${PROJECT_OUTRO}`;
}

// ─── throwaway homes and projects ──────────────────────────────────────────────

/** A temp home whose `.claude/CLAUDE.md` is `text` (null: `.claude/` with no CLAUDE.md). Returns the home path. */
function fakeHomeWith(text) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-claude-md-home-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  if (text !== null && text !== undefined) fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), text);
  return home;
}

/** A temp project root whose `CLAUDE.md` is `text` (null: no CLAUDE.md). Returns the root path. */
function projectWith(text) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-claude-md-proj-'));
  if (text !== null && text !== undefined) fs.writeFileSync(path.join(root, 'CLAUDE.md'), text);
  return root;
}

module.exports = {
  globalClaudeMd,
  handWrittenRoutingClaudeMd,
  projectClaudeMd,
  fakeHomeWith,
  projectWith,
  // Literal content, so tests assert against the same bytes the builders wrote.
  GLOBAL_HEAD,
  LEGACY_GLOBAL_BLOCK,
  OUTSIDE_LEGACY_LINE,
  OUTSIDE_PLAIN_LINE,
  PROJECT_INTRO,
  PROJECT_OUTRO,
  LEGACY_PROJECT_BODY,
  CURRENT_PROJECT_BODY,
};
