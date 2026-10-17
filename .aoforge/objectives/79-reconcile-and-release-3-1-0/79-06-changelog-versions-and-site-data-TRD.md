---
objective: 79-reconcile-and-release-3-1-0
trd: "06"
type: standard
wave: 3
depends_on: ["79-02", "79-03", "79-04", "79-05"]
files_modified:
  - CHANGELOG.md
  - package.json
  - package-lock.json
  - plugins/aoforge/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - plugins/eden-ui-flutter/.claude-plugin/plugin.json
  - plugins/aoforge-stack-flutter/CHANGELOG.md
  - plugins/aoforge-stack-web/CHANGELOG.md
  - site/data/aoforge.json
autonomous: true
requirements: [SC-1]
must_haves:
  truths:
    - "CHANGELOG.md has exactly one `## [3.1.0] - 2026-10-16` section, carrying both lines: the integrate side's unreleased entries (objective 72's post-release work, 73, 74, 75, 78) and main's 3.1.0 subsections (quick 34-39, objectives 76/77, performance), plus a short Reconcile (objective 79) entry; `## [Unreleased]` above it is empty; every older section is byte-identical to `v3.0.0`'s"
    - "The 3.1.0 lead says what an upgrader must know first: the shims are gone (2.x upgrades through 3.0.x, linking docs/MIGRATING-TO-AOFORGE.md), stack procedure lives in the aoforge-stack-flutter and aoforge-stack-web packs, and `gh rebrand --apply` is required on an un-rebranded repository"
    - "`scripts/release-tag.cjs`'s own parser accepts the tree for `v3.1.0` (core plugin.json 3.1.0, alias aoforge--v3.1.0) and extracts non-empty 3.1.0 notes under GitHub's 125,000-character release-body limit"
    - "package.json, package-lock.json (root and packages['']), plugins/aoforge/.claude-plugin/plugin.json and marketplace.json (top level and the aoforge entry) read 3.1.0; the marketplace lists aoforge, aoforge-stack-flutter 1.0.0, aoforge-stack-web 1.0.0 and the sibling plugins, and no pre-rename pointer entry; every sibling whose files changed since v3.0.0 has a patch bump in plugin.json and marketplace (eden-ui-flutter unless quick 34 recorded otherwise)"
    - "`claude plugin validate` passes for the marketplace and every plugin directory it lists; site/data/aoforge.json is regenerated from the final tree and a second run produces no diff"
  artifacts:
    - path: CHANGELOG.md
      provides: "the one 3.1.0 section"
      contains: "## [3.1.0] - 2026-10-16"
  key_links:
    - from: "CHANGELOG.md ## [3.1.0]"
      to: "scripts/release-tag.cjs releaseNotes"
      via: "the release body on the v3.1.0 tag"
      pattern: "## [3.1.0]"
    - from: "CHANGELOG.md ## [3.1.0] lead"
      to: "docs/MIGRATING-TO-AOFORGE.md"
      via: "relative link"
      pattern: "MIGRATING-TO-AOFORGE"
---

# TRD 79-06: One 3.1.0 CHANGELOG section for both lines, versions and marketplace, regenerated site data

<objective>
79-01 kept both CHANGELOG blocks (the integrate side's `[Unreleased]` and main's `[3.1.0] - 2026-10-16`). The release
workflow publishes the GitHub release body from the `## [3.1.0]` section, and the tag gate requires that heading, so the
section must be one coherent entry for everything 3.1.0 ships. Fold the two, add the reconcile entry, confirm every
version and the marketplace, apply the sibling-plugin bump rule, validate every plugin, and regenerate the docs data
from the final tree.

Purpose: SC-1 ("versions are 3.1.0 in all three files and CHANGELOG has one `## [3.1.0] - 2026-10-16` section carrying
both sides").
Output: CHANGELOG.md, version files, site data; a SUMMARY with the release-notes length and validation output.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-01-SUMMARY.md
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-02-SUMMARY.md
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-03-SUMMARY.md
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-04-SUMMARY.md
@.aoforge/objectives/79-reconcile-and-release-3-1-0/79-05-SUMMARY.md

Run in the CHECKOUT you were given; tests with an empty `mktemp -d` HOME. 79-07 runs in parallel and owns CLAUDE.md,
docs/ and site/content: do not touch them. Rows of the 79-01 triage table that read CHANGELOG, versions or site data
are yours.

Facts (planning time):
- After the merge CHANGELOG.md reads: header, `## [Unreleased]` with the integrate side's `### Added` / `### Changed` /
  `### Removed` / `### Fixed` (objectives 72-post-release, 73, 74, 75, 78; 78-12 wrote ten Changed entries and one
  Removed entry), then main's `## [3.1.0] - 2026-10-16` (a lead paragraph on the stack packs, then `### Release tooling
  and security sweep (quick 34)`, `### Fixes (quick 35)`, `### Fixes (quick 36)`, `### Pricing and release workflow
  (quick 37)`, two stack-pack subsections (quick 38, 39), `### Model efficiency (objective 76) and stack-pack leftovers
  (objective 77)`, `### Performance and context budget`), then `## [3.0.0] - 2026-10-08`.
- release-tag.cjs: `parseTag`, `planTag(tag, root)` (core tag: core plugin.json version must match; alias
  `<core>--vX.Y.Z`), `releaseNotes(text, version)` (body under `## [X.Y.Z]` up to the next `## [`). Read its exports
  before calling them.
- Sibling plugins changed since v3.0.0 on main: only `plugins/eden-ui-flutter/skills/frontend-design/SKILL.md` (one line,
  1cce9f50, 77-03), version still 1.0.1. 72-18's rule for a release: a sibling whose files changed gets a patch bump in
  its plugin.json and marketplace entry. Check quick 34's SUMMARY (`.aoforge/quick/34-*/34-SUMMARY.md`) for a recorded
  decision first; follow it if it exists.
- `docs.yml` regenerates `site/data/aoforge.json` with `node scripts/gen-docs-data.cjs` (`npm run docs:data`).
- No `## [Unreleased]` content may be lost: every entry moves into 3.1.0.
</context>

<embedded_context>

<codebase_examples>
Shape of the folded section (headings are a suggestion; keep every entry's text, regroup only):
```markdown
## [Unreleased]

## [3.1.0] - 2026-10-16

<lead: 2-4 sentences>

### Removed: the one-release rename shims (objective 78)
### Stack packs: Flutter, Dart and web procedure leave core (objective 77, quick 38, quick 39)
### Added
### Changed
### Fixed
### Release tooling and security sweep (quick 34)
... main's quick 35-37, objective 76 and performance subsections as they are ...
### Reconcile (objective 79)
```
</codebase_examples>

<anti_patterns>
- Rewording or shortening entries to save space; regroup and de-duplicate only (an entry both sides wrote about the same
  change is merged into one, keeping both facts).
- A second `## [3.1.0]` heading, a date other than 2026-10-16, or entries left under `[Unreleased]`.
- Touching any section below 3.1.0 (`git diff v3.0.0 -- CHANGELOG.md` must show additions above `## [3.0.0]` only).
- Bumping a stack pack above 1.0.0 (unreleased) or the aoforge version above 3.1.0.
- Hand-editing site/data/aoforge.json.
</anti_patterns>

<error_recovery>
- `claude plugin validate` is unavailable or errors for an environmental reason: record the exact output and validate the
  JSON shapes with node instead (name, version, source present); do not skip silently.
- releaseNotes over 125,000 characters: move the longest per-TRD detail to docs (record for 79-07 is too late in the
  same wave: shorten by linking to USER-GUIDE sections instead, and say so in the SUMMARY).
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Fold the CHANGELOG into one 3.1.0 section with the reconcile entry</name>
  <files>CHANGELOG.md, plugins/aoforge-stack-flutter/CHANGELOG.md, plugins/aoforge-stack-web/CHANGELOG.md</files>
  <action>
Move every entry under `## [Unreleased]` into `## [3.1.0] - 2026-10-16` (codebase_examples shape), leaving
`## [Unreleased]` empty above it. Write the lead (2-4 sentences, plain declaratives): 3.1.0 removes the rename's
one-release compatibility (a 2.x project upgrades through 3.0.x first: [migration guide](docs/MIGRATING-TO-AOFORGE.md));
Flutter, Dart and web procedure moved into the `aoforge-stack-flutter` and `aoforge-stack-web` packs (install the pack
your project needs); an un-rebranded GitHub repository needs `aof-tools gh rebrand --apply` before 3.1 writes to it; and
it ships objectives 72 (post-release), 73-78 and quick 34-39. Add `### Reconcile (objective 79)` with one bullet per
change the 79-0N SUMMARYs record: main's planning records moved to `.aoforge/`, legacy ignore lines removed,
`reconcile-guard.repo.test.cjs`, the pre-bash equivalence corpus, quick 36's worktree tests on the supported layout,
the EST-11 record correction, STACK.md and the pack profiles. If a wave-2 TRD changed a stack pack's files, add a line to
that pack's CHANGELOG under its existing top section (do not change its version).
Check: `git diff v3.0.0 -- CHANGELOG.md` shows changes only above `## [3.0.0]`;
`rg -c '^## \[3\.1\.0\] - 2026-10-16$' CHANGELOG.md` prints 1; `node plugins/aoforge/aoforge/bin/aof-tools.cjs changelog --help`
then run its check form for 3.1.0; the release-tag parser (read exports first), e.g.
`node -e "const r=require('./scripts/release-tag.cjs'); const n=r.releaseNotes(require('fs').readFileSync('CHANGELOG.md','utf8'),'3.1.0'); console.log(n.length)"`
prints a number > 0 and < 125000.
Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "docs(79-06): one 3.1.0 CHANGELOG section for both lines" --files CHANGELOG.md` (plus the pack CHANGELOGs you touched).
  </action>
  <verify>
- `rg -n '^## \[' CHANGELOG.md | head -3` shows `## [Unreleased]`, `## [3.1.0] - 2026-10-16`, `## [3.0.0] - 2026-10-08`
- `awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f && NF' CHANGELOG.md` prints nothing (Unreleased empty)
- the releaseNotes length check passes; `env HOME=$(mktemp -d) node --test scripts/release-tag.test.cjs plugins/aoforge/aoforge/bin/lib/changelog.test.cjs` passes
  </verify>
  <done>One 3.1.0 section carries both lines and the reconcile; older history unchanged; the release workflow's parser accepts it.</done>
  <recovery>If an entry's placement is ambiguous, keep it under the integrate side's original heading inside 3.1.0; never drop it.</recovery>
</task>

<task type="auto">
  <name>Task 2: Versions, marketplace, sibling bump, plugin validation, site data</name>
  <files>package.json, package-lock.json, plugins/aoforge/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, plugins/eden-ui-flutter/.claude-plugin/plugin.json, site/data/aoforge.json</files>
  <action>
Read and record versions: `node -e` over package.json, package-lock.json (`.version` and `.packages[""].version`),
plugins/aoforge/.claude-plugin/plugin.json, marketplace.json (top level, each entry name/version/source), and each
`plugins/*/.claude-plugin/plugin.json`. Fix any 3.1.0 mismatch for aoforge. For each sibling plugin:
`git diff --stat v3.0.0 HEAD -- plugins/<name>`; changed and not bumped -> patch bump in its plugin.json and its
marketplace entry (eden-ui-flutter 1.0.1 -> 1.0.2), unless quick 34's SUMMARY records a reason not to (then cite it).
Each marketplace entry's version must equal its plugin.json. No pre-rename pointer entry.
Validate: `claude plugin validate .` (the marketplace) and `claude plugin validate plugins/<name>` for each listed
plugin (check `claude plugin validate --help` for the form; record each output). Plan the tag with the release script's
own function (read its exports; `planTag('v3.1.0', <repo root>)` or its CLI dry form) and record kind `core`, alias
`aoforge--v3.1.0`.
Site data: `node scripts/gen-docs-data.cjs`, then run it again and `git diff --stat site/data/aoforge.json` after the
second run must equal after the first (deterministic). Run tests that read these files (scratch HOME):
`node --test scripts/release-tag.test.cjs scripts/tag-rules.test.cjs` and any 79-06 triage rows.
Commit: `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "chore(79-06): 3.1.0 versions, marketplace and docs data" --files <the files you changed>`.
  </action>
  <verify>
- `node -e "const f=require('fs');const j=p=>JSON.parse(f.readFileSync(p,'utf8'));const m=j('.claude-plugin/marketplace.json');console.log(j('package.json').version,j('package-lock.json').version,j('plugins/aoforge/.claude-plugin/plugin.json').version,m.version,m.plugins.find(p=>p.name==='aoforge').version)"` prints `3.1.0` five times
- every marketplace entry's version equals its plugin.json (scripted check recorded in the SUMMARY); no entry's source points at a removed directory
- `claude plugin validate` outputs recorded, all valid (or the environmental reason recorded)
  </verify>
  <done>Versions, marketplace and sibling bumps are consistent; every plugin validates; site data is regenerated and stable.</done>
  <recovery>If package-lock.json disagrees and `npm install --package-lock-only` would be needed, run it (no network install of new packages; it only rewrites the lock's version fields) and record the diff; if it changes dependencies, stop and return.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped: node --test scripts/release-tag.test.cjs scripts/tag-rules.test.cjs plugins/aoforge/aoforge/bin/lib/changelog.test.cjs {files})</test>
</validation_gates>

<verification>
- One 3.1.0 section, empty Unreleased, history untouched, notes length within the limit, release parser accepts v3.1.0.
- Five 3.1.0 version reads; marketplace consistent; plugins validate; site data stable.
</verification>

<success_criteria>
- The release artifacts for 3.1.0 describe both lines in one place and every version agrees.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/79-reconcile-and-release-3-1-0/79-06-SUMMARY.md` through
`node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post`.
</output>
