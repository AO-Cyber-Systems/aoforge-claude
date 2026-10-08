---
objective: 72-install-and-naming-cleanup
trd: "17"
type: standard
wave: 9
depends_on: ["72-12", "72-13", "72-14", "72-15", "72-16"]
files_modified:
  - assets/ao-icon.svg
  - assets/SOURCES.md
  - README.md
  - site/layouts/partials/header.html
  - site/layouts/partials/footer.html
  - site/layouts/index.html
  - site/static/_redirects
  - site/static/ao-icon.svg
  - docs/MIGRATING-TO-AOFORGE.md
  - site/content/docs/getting-started/migrating-to-aoforge.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
  - site/data/aoforge.json
  - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
autonomous: true
requirements: [INST-02, INST-05]
must_haves:
  truths:
    - "README.md opens with the real gold AO emblem (`assets/ao-icon.svg`, byte-identical to https://aocyber.ai/images/ao-icon.svg, source URL recorded in `assets/SOURCES.md`) and an `AOForge` wordmark; no text placeholder, recolour or invented mark; the emblem is sized by height (its viewBox is not square)"
    - "The docs site header shows the same emblem with the AOForge wordmark, the home page and footer say AOForge, the old `/docs/reference/df-tools/` URL redirects (301) to `/docs/reference/aof-tools/`, and the site builds (`hugo --source site --minify` exits 0 when hugo is installed)"
    - "`docs/MIGRATING-TO-AOFORGE.md` (and its site page) gives the full name map, what keeps working for one release, what migrates by itself (planning dir, config key, CLAUDE.md blocks, runtime state), what the user does (install aoforge, disable devflow, `upgrade --global --confirm` after reading the diff, `gh rebrand` per store repository, rename `DEVFLOW_*` variables), how to check (`aof-tools doctor`), and when the shims are removed (the release after 3.0.0)"
    - "USER-GUIDE.md and CLAUDE.md document every new surface: `state rekey`, `gh rebrand`, W066/W067, doctor checks 15/16/27, migrations 0012-0014, the coexistence-guard hook, `legacy-names.cjs`/`compat.cjs`, and the pointer plugin; CLAUDE.md keeps its transition note"
    - "The rename guard and doc-refs gate pass with the migration guide and the USER-GUIDE shim section inside rename-guard ignore regions (the guide is listed in IGNORE_REGION_FILES)"
  artifacts:
    - path: docs/MIGRATING-TO-AOFORGE.md
      provides: "the 3.0.0 migration guide the CHANGELOG links"
    - path: assets/ao-icon.svg
      provides: "the real AO emblem, cached with its source"
    - path: site/static/_redirects
      provides: "old reference URL -> new"
      contains: "aof-tools"
  key_links:
    - from: "README.md / site header"
      to: "assets/ao-icon.svg / site/static/ao-icon.svg"
      via: "img src; same bytes as the aocyber.ai emblem"
      pattern: "ao-icon.svg"
    - from: "CHANGELOG 3.0.0 entry (72-18)"
      to: "docs/MIGRATING-TO-AOFORGE.md"
      via: "link"
      pattern: "MIGRATING-TO-AOFORGE"
---

# TRD 72-17: Identity, migration guide and the documentation of every new surface

<objective>
Give AOForge its identity where the README and the docs site show one (the real gold AO emblem with an AOForge
wordmark, per the AO Cyber brand guide), write the migration guide the 3.0.0 changelog will link, and document every
surface objective 72 added. The codemod already changed the words; this TRD adds what a codemod cannot.

Purpose: INST-05 (identity, migration guide) and INST-02 (the docs name AOForge everywhere).
Output: emblem asset with source, README and site identity, redirect, migration guide (repo + site), USER-GUIDE and
CLAUDE.md updates.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`. Documentation and assets; the one testable part (the guard's ignore-region
allowlist) is test-first.

Brand rules that bind (user's global CLAUDE.md, AO Cyber brand guide): dark + gold, gold `#d4a853` the only decorative
accent, Proxima Nova (Typekit kit `qwz2ubp`, already loaded by the site head), never navy or teal; the web/UI mark is
`ao-icon.svg` (flat gold "AO"), never the print lockup; the emblem's viewBox is 900×969.69, so size it by height; always
the real asset, downloaded and cached with its source URL. `site/static/ao-icon.svg` exists today and is used by
`site/layouts/partials/header.html` (`<img src="/ao-icon.svg" ... width="24" height="26">` + `<span class="brand-name">`).
`site/hugo.toml` `baseURL = "https://devflow.cloud/"` stays: the domain is objective 74's (a PRESERVE token).

Read narrowly: README.md 1-40; `site/layouts/partials/header.html`, `footer.html`, `site/layouts/index.html` 1-40;
`site/static/_redirects`; `docs/USER-GUIDE.md` table of contents (`rg -n "^## " docs/USER-GUIDE.md`); CLAUDE.md
`### Core Tool` bullets (`rg -n "^- \*\*" CLAUDE.md`); the 72-07..72-16 SUMMARYs' "provides" lines.
</context>

## Test list

1. rename-guard: `docs/MIGRATING-TO-AOFORGE.md` and the site migration page are in IGNORE_REGION_FILES; a legacy name
   outside an ignore region in either still fails the guard (sensitivity, on a temp copy).
2. The guard and doc-refs gate pass on the tree after this TRD.

<embedded_context>

<codebase_examples>
README header (GitHub renders HTML; size by height):
```html
<div align="center">
  <img src="assets/ao-icon.svg" alt="AO Cyber Systems" height="72">
  <h1>AOForge</h1>
  <p><strong>A meta-prompting, context engineering and spec-driven development system for Claude Code.</strong></p>
</div>
```
Redirect line (Cloudflare Pages `_redirects`): `/docs/reference/df-tools/  /docs/reference/aof-tools/  301` (the old
path is spelled inside a rename-guard ignore region: `_redirects` supports `#` comments).
</codebase_examples>

<anti_patterns>
- No placeholder text mark, no recoloured or redrawn emblem, no print lockup on the web.
- Do not change the GSD fork attribution, NOTICE.md, LICENSE, or past CHANGELOG entries.
- Do not change `baseURL` (objective 74).
- No local web server on port 8080; if a preview is needed use 8091 (`hugo server --source site -p 8091`), and stop it.
</anti_patterns>

<error_recovery>
- If https://aocyber.ai/images/ao-icon.svg is unreachable, use `site/static/ao-icon.svg` only if its sha256 matches
  the last known download recorded in the SUMMARY of a prior run; otherwise stop and report (never substitute).
- If `hugo` is not installed, record that and verify the templates with the existing site tests only.
</error_recovery>

</embedded_context>

<gotchas>
- Download into a fresh empty directory under the scratchpad (`curl -fsSL -o <scratch>/emblem/ao-icon.svg <url>`), then
  copy; compare with `shasum -a 256`.
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: The real emblem and the identity on README and the site</name>
  <files>assets/ao-icon.svg, assets/SOURCES.md, README.md, site/static/ao-icon.svg, site/layouts/partials/header.html, site/layouts/partials/footer.html, site/layouts/index.html, site/static/_redirects</files>
  <action>
Download the emblem (gotchas); write `assets/ao-icon.svg` and `assets/SOURCES.md` (`ao-icon.svg — https://aocyber.ai/images/ao-icon.svg, downloaded <date>, sha256 <hash>`); if `site/static/ao-icon.svg` differs, replace it with the
download. README header per codebase_examples, keeping the existing tagline lines and badges (badge URLs already point at
`aoforge-claude`). Site: header brand reads `AOForge` beside the emblem (height-driven sizing), home hero and footer say
AOForge; `_redirects` gains the reference-page redirect. Build with `hugo --source site --minify` if available (output
dir is gitignored). Commit (`docs(72-17): AOForge identity with the real AO emblem`).
  </action>
  <verify>shasum -a 256 assets/ao-icon.svg site/static/ao-icon.svg && rg -n "ao-icon.svg" README.md site/layouts/partials/header.html && rg -n "aof-tools" site/static/_redirects</verify>
  <done>Both emblem copies equal the download; README and site show emblem + AOForge; redirect present; hugo build
exits 0 (or recorded as unavailable).</done>
  <recovery>If the header CSS assumes a square icon, set `height` only and `width: auto` in the existing site CSS.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Migration guide (repo + site) inside guard ignore regions</name>
  <files>plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs, docs/MIGRATING-TO-AOFORGE.md, site/content/docs/getting-started/migrating-to-aoforge.md</files>
  <action>
RED: test 1 (add both paths to IGNORE_REGION_FILES with the sensitivity case). Run: fails because the files do not
exist yet (the guard's "matches a real path" rule). Commit RED.

GREEN: write the guide per the truths: sections Name map (table), What keeps working until the next release, What moves
by itself, What you do (ordered checklist with exact commands), Check it (`aof-tools doctor`, `aof-tools validate
health`), Store-mode repositories (`gh rebrand` dry run then `--apply`), Removing the shims. Put every legacy spelling
inside `<!-- rename-guard:ignore-start -->`/`-end` regions. The site page carries the same content with Hugo front
matter (title, weight after installation). Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Test 1-2 pass; both pages exist and cover every truth bullet.</done>
  <recovery>If doc-refs flags legacy slash forms inside the guide, phrase them without the leading slash ("the old
devflow namespace") or inside a code block doc-refs ignores; the guide must still pass the INST-01 gate.</recovery>
</task>

<task type="auto">
  <name>Task 3: USER-GUIDE, CLAUDE.md and the site data</name>
  <files>docs/USER-GUIDE.md, CLAUDE.md, site/data/aoforge.json</files>
  <action>
USER-GUIDE: a "Renamed to AOForge (3.0.0)" section linking the guide, plus entries where each surface belongs (doctor
checks 15/16/27, W066/W067 in the validate list, `state rekey`, `gh rebrand`, coexistence-guard in the hooks list,
migrations 0012-0014 in the upgrade section, the pointer plugin in installation). CLAUDE.md: Core Tool bullets for
`state rekey` and `gh rebrand`, the W066/W067 and doctor check additions in the existing Validation/Doctor bullets,
migrations 0012-0014 in the Upgrade bullet, one bullet on `legacy-names.cjs`/`compat.cjs` (the shim layer and its
removal release), the pointer plugin under Marketplace; keep the transition note untouched. Regenerate
`site/data/aoforge.json` with `node scripts/gen-docs-data.cjs`. Run the guard, doc-refs, dispatch-completeness,
hook-inventory and the full suite. Commit (`docs(72-17): document the rename surfaces`).
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>Every new surface is documented in both files; repo gates and full suite green.</done>
  <recovery>If gen-docs-data changes many unrelated rows, check that it read the renamed paths; commit only its
output for this repo state.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `rg -n -e "state rekey" -e "gh rebrand" -e "W066" -e "W067" docs/USER-GUIDE.md CLAUDE.md` hits both files.
- `test -f docs/MIGRATING-TO-AOFORGE.md && rg -n "aoforge@aocyber" docs/MIGRATING-TO-AOFORGE.md`.
</verification>

<success_criteria>
- A reader of the README, the site or the migration guide sees AOForge with the real AO emblem and knows exactly how to
  move over.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-17-SUMMARY.md` through
`df-tools summary post`.
</output>
