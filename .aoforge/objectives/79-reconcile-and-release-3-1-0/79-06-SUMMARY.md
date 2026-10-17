---
objective: 79-reconcile-and-release-3-1-0
trd: "06"
subsystem: release-artifacts
tags: [changelog, versions, marketplace, site-data, 3.1.0, release-notes]
requires:
  - 79-01 (merged tree: CHANGELOG with [Unreleased] above [3.1.0])
  - 79-02 to 79-05 (the wave 2 changes the reconcile entry records)
provides:
  - "CHANGELOG.md: exactly one `## [3.1.0] - 2026-10-16` section carrying both lines plus the reconcile entry; `[Unreleased]` empty"
  - "3.1.0 in package.json, package-lock.json (both fields), the aoforge plugin.json and marketplace.json (top level and entry)"
  - "eden-ui-flutter 1.0.2 (patch bump for its one changed skill line) in plugin.json and the marketplace"
  - "site/data/aoforge.json regenerated from the final tree"
affects: [79-07, 79-08]
tech-stack:
  added: []
  patterns: ["fold by heading slices, never retype an entry; fix only statements the fold makes false"]
key-files:
  created: []
  modified:
    - CHANGELOG.md
    - plugins/aoforge-stack-flutter/CHANGELOG.md
    - plugins/aoforge-stack-web/CHANGELOG.md
    - .claude-plugin/marketplace.json
    - plugins/eden-ui-flutter/.claude-plugin/plugin.json
    - site/data/aoforge.json
key-decisions:
  - "The 3.1.0 section keeps every entry of both sides; five statements the fold made false were corrected in place and are listed under Deviations."
  - "eden-ui-flutter gets 1.0.2: it is the only sibling whose files changed since v3.0.0 and quick 34's SUMMARY records no reason to skip a bump."
  - "package.json, package-lock.json and the aoforge plugin.json already read 3.1.0 (79-01 and quick 34); they are unchanged."
requirements-completed: []
metrics:
  duration: 6min
  started: 2026-10-17T03:37:33Z
  completed: 2026-10-17T03:44:00Z
  tasks: 2
  files: 6
tokens_input: 10980291
tokens_output: 53037
tokens_cache_read: 10819043
tokens_cache_write: 161098
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 79 TRD 06: One 3.1.0 CHANGELOG section, versions and site data Summary

**CHANGELOG.md now has one `## [3.1.0] - 2026-10-16` section (a four-sentence lead, the shim removal first, both sides' entries, and a Reconcile entry), the release parser extracts 40,899 characters of notes for it, every version reads 3.1.0 with `eden-ui-flutter` patched to 1.0.2, all eight plugins and the marketplace validate, and `site/data/aoforge.json` is regenerated.**

## Progress
- [x] Task 1: Fold the CHANGELOG into one 3.1.0 section with the reconcile entry — ee155766
- [x] Task 2: Versions, marketplace, sibling bump, plugin validation, site data — 87e4d0dd

## What changed

**Task 1 (CHANGELOG).** The file was sliced by heading with a one-off script (scratchpad, not committed), so no entry was
retyped: the lead, then `### Removed: the one-release rename shims (objective 78)`, `### Added`, `### Changed`,
`### Fixed` (the integrate side, text as written), then main's eight subsections in main's order (quick 34 to 39,
objectives 76/77, performance), then `### Reconcile (objective 79)`, then `## [3.0.0]` unchanged. `## [Unreleased]` is empty
above it. Line 3 says AOForge. The lead says what an upgrader must know first: the shims are gone (a 2.x project
upgrades through 3.0.x first, linking `docs/MIGRATING-TO-AOFORGE.md`), the Flutter, Dart and web procedure lives in the
two packs (with the install commands), and an un-rebranded GitHub repository needs `aof-tools gh rebrand --apply`. The
Reconcile entry has one bullet per recorded change: planning records and ignore lines (79-01), the pre-bash dispatcher
(79-01), `reconcile-guard.repo.test.cjs` (79-02), the 51-case equivalence corpus (79-03), quick 36's worktree tests on
the `.aoforge/` layout plus the legacy-refusal test (79-04), the EST-11 record, STACK.md and the pack profiles and the
corrected comments (79-05), and this TRD. Both pack CHANGELOGs got one line under their existing `1.0.0` for wave 2's
changes to their files (the Flutter profiles' home, the `sync-pack.cjs` header comment); no pack version moved.

**Task 2 (versions).** package.json, package-lock.json (`.version` and `.packages[""].version`), the aoforge plugin.json,
marketplace.json top level and the aoforge entry already read 3.1.0, so none changed. `git diff --stat v3.0.0 HEAD` over
the five sibling plugins showed one changed file: `plugins/eden-ui-flutter/skills/frontend-design/SKILL.md` (one line,
`/aoforge:ui-eval` to `/aoforge-stack-flutter:ui-eval`). Quick 34's SUMMARY records no decision about siblings, so the
72-18 rule applied: `eden-ui-flutter` 1.0.1 to 1.0.2 in its plugin.json and its marketplace entry. The stack packs stay
at 1.0.0 and core stays 3.1.0. The marketplace lists aoforge, aoforge-stack-flutter 1.0.0, aoforge-stack-web 1.0.0 and the
five sibling plugins; there is no pointer entry. `site/data/aoforge.json` was regenerated from the final tree: only
`generatedAt` changed (counts skills=32 agents=12 hooks=24 workflows=39 references=36 templates=31 commands=84), so the
marketplace description "32 skills, 12 agents" still agrees.

## Release notes and tag plan

| Item | Value |
|---|---|
| `releaseNotes(CHANGELOG.md, '3.1.0')` length | **40,899 characters** (limit 125,000), first line is the lead |
| `aof-tools changelog check 3.1.0` | `{ "ok": true, "version": "3.1.0", "present": true }` |
| `planTag('v3.1.0', { root })` | `{"kind":"core","tag":"v3.1.0","plugin":"aoforge","version":"3.1.0","changelog":"CHANGELOG.md","alias":"aoforge--v3.1.0","latest":true}` |
| `planTag('aoforge--v3.1.0')` | `core-alias` |
| `planTag('aoforge-stack-flutter--v1.0.0')` / `aoforge-stack-web--v1.0.0` | `pack`, changelog `plugins/<pack>/CHANGELOG.md`, `latest: false` |
| `git diff v3.0.0 -- CHANGELOG.md` | one hunk at line 1; the only deleted line is line 3 (DevFlow to AOForge); `## [3.0.0]` to the end byte-identical (`git diff --no-index` empty) |
| Entries lost | none: of the 14 non-blank old lines absent from the new file, 3 are main's lead paragraph (absorbed into the new lead), 1 is the header line, and 10 are the five deliberate corrections below (the CLAUDE.md bullet's re-wrap included) |

## `claude plugin validate`

| Target | Result |
|---|---|
| `.` (marketplace) | valid; 1 warning: `plugins[0] plugin.json -> statusLine: Unknown field` |
| `plugins/aoforge` | valid; 22 warnings: the same `statusLine` and 21 unquoted `${CLAUDE_PLUGIN_ROOT}` hook commands |
| `plugins/aoforge-stack-flutter` | valid, no warnings |
| `plugins/aoforge-stack-web` | valid, no warnings |
| `plugins/eden-ui-flutter` | valid, no warnings |
| `plugins/eden-ui-web` | valid, no warnings |
| `plugins/aosentry-mcp` | valid, no warnings |
| `plugins/monorepo-standards` | valid; 1 warning: unquoted `${CLAUDE_PLUGIN_ROOT}` in a hook command |
| `plugins/social-media-generator` | valid, no warnings |

All warnings are advisory and predate this TRD (v3.0.0 had `statusLine` and 22 unquoted `node ${CLAUDE_PLUGIN_ROOT}/...`
commands). Scripted check: every marketplace entry's name and version equal its plugin.json, every source directory
exists, every directory under `plugins/` with a plugin.json is listed, and no entry matches `devflow`.

## Findings handed to other TRDs

- **for 79-07:** the 3.1.0 CHANGELOG says CLAUDE.md "is kept under 200 lines / 20,000 chars", which `context-budget.repo.test.cjs`
  enforces; if 79-07 lands CLAUDE.md under the cap the sentence is true as written. `doc-refs.repo.test.cjs` test 2 still
  fails only on `CLAUDE.md:163  ui-eval -> unknown` (79-01 failure #2); `eden-ui-flutter`'s skill already uses the
  pack-qualified form `/aoforge-stack-flutter:ui-eval`, which is the form to write there.
- **for 79-08:** `claude plugin validate` warnings above are advisory and unchanged since 3.0.0 (statusLine key, unquoted
  `${CLAUDE_PLUGIN_ROOT}`); fixing them is a decision for the release, not this TRD. The CHANGELOG's OPS-03 entry now says
  PR #130 "was not merged when this was written (2026-10-10)" and the docs deploy "still fails until the Pages project is
  set up": if the user resolves OPS-03 before the tag, update that entry. The roadmap/state side of W040/W068 is still
  79-08's migration 0015.
- **tag-time facts for 79-08:** `v3.1.0` plans as `core` with alias `aoforge--v3.1.0`; the packs' first tags are
  `aoforge-stack-flutter--v1.0.0` and `aoforge-stack-web--v1.0.0` (their CHANGELOGs carry `## [1.0.0] - 2026-10-16`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Five statements in the folded text were false once both sides shared one release**
- **Found during:** Task 1 (reading both blocks side by side)
- **Issue and fix** (each edit changes only the false clause; every fact it carried is kept):
  1. Quick 34 (main): "The `devflow` pointer stays at 3.0.0, its final release." Objective 78 removes the pointer plugin in
     this release. Now: "The pre-rename pointer plugin stayed at its final 3.0.0 release and is removed in this release
     (see Removed above)."
  2. W069 note (integrate): "the reconcile of this branch with `main` must confirm W069 is still free." The reconcile did:
     `validate.cjs` defines W068 (`decision-log-oversized`) and W069 once each. Now says so.
  3. Objective 73 watch-daemon entry (integrate): "For one release `~/.aoforge/` is still read ..." Objective 78 (TRDs 78-05,
     78-11) removed that read and the same section says so. Now: "Objective 78 then removed the read of `~/.aoforge/`
     that this change first kept for one release (see Removed above and ...)"; the sentence about a service installed by
     3.0.0 and doctor check 17 stays.
  4. OPS-03 (integrate): "the change is on this branch and on PR #130, neither is merged, so `main` does not have it" is
     false on a release cut from `main`. Now: PR #130 "was not merged when this was written (2026-10-10), and the docs deploy
     still fails until the Pages project is set up".
  5. Performance (main): "CLAUDE.md is 146 lines / 15K chars" would be stale after 79-07 rewrites CLAUDE.md. Now "is kept
     under 200 lines / 20,000 chars (the performance work measured 146 lines / 15K chars, down from 225 / 40K)", true
     whatever 79-07 lands, because the repo test caps it.
- **Files modified:** CHANGELOG.md
- **Commit:** ee155766

### Other notes (not deviations)

- The TRD asks that a second `gen-docs-data` run "produces no diff". `generatedAt` is `new Date().toISOString()` by design
  (`scripts/gen-docs-data.cjs:245`), so the file differs from the first run in that one key. After both runs
  `git diff --stat site/data/aoforge.json` is identical (1 insertion, 1 deletion), and the JSON with `generatedAt` removed
  is byte-identical between runs. The script was not changed (outside this TRD's files).
- `package.json`, `package-lock.json` and the aoforge `plugin.json` needed no edit, so Task 2's commit lists three data files.
- `requirements mark-complete` was not run: `SC-1` is objective 79's success criterion, not a REQUIREMENTS.md id.
- `claude plugin validate` is available here, so no node-only fallback was needed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: CHANGELOG fold | `rg -n '^## \[' CHANGELOG.md --max-count 4` (Unreleased 7, 3.1.0 9, 3.0.0 439, 2.15.0 653) | 0 | PASS |
| 1 | `awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f && NF' CHANGELOG.md` (no output) | 0 | PASS |
| 1 | `rg -c '^## \[3\.1\.0\] - 2026-10-16$' CHANGELOG.md` | 0 (prints 1) | PASS |
| 1 | `node -e releaseNotes(CHANGELOG.md,'3.1.0').length` | 0 (40899) | PASS |
| 1 | `aof-tools changelog check 3.1.0` | 0 (present) | PASS |
| 1 | `env HOME=<scratch> node --test scripts/release-tag.test.cjs changelog.test.cjs stack-packs.test.cjs changelog-on-tag.test.js` | 0 | PASS (115/115) |
| 2: versions | `node -e` five reads (package.json, lock, plugin.json, marketplace top level and entry) | 0 | PASS (3.1.0 x5, plus lock `packages[""]` 3.1.0) |
| 2 | scripted marketplace vs plugin.json check (8 entries) | 0 | PASS (0 bad, 0 unlisted, 0 pointer) |
| 2 | `claude plugin validate` on `.` and the 8 plugin directories | 0 each | PASS (warnings above) |
| 2 | `node scripts/gen-docs-data.cjs` twice | 0 | PASS (identical apart from generatedAt) |
| 2 | `env HOME=<scratch> node --test release-tag, tag-rules, aoforge-rename.legacy, changelog-on-tag, stack-packs, stack-neutrality, ui-spec-skill-contract, old-commands.legacy, codebase-facts, changelog` | 0 | PASS (212/212) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, as the TRD's gate) | `env HOME=<scratch under the session scratchpad> node --test scripts/release-tag.test.cjs scripts/tag-rules.test.cjs plugins/aoforge/aoforge/bin/lib/changelog.test.cjs` plus the files that read these artifacts (list above) | 0 | PASS (212/212; the full suite was not run here: 79-08 owns it, and `watcher-shell.test.cjs` stays excluded wherever it runs) |
| guards over tracked text | `node --test rename-guard.repo, reconcile-guard.repo, doc-refs.repo, planning-writes.repo` | 1 | 77/78 pass; the one failure is `CLAUDE.md:163 ui-eval` in `doc-refs.repo.test.cjs` test 2, routed to 79-07 by 79-01 (failure #2); CHANGELOG.md is exempt from that scan |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (one 3.1.0 section with both lines, empty Unreleased and untouched history; lead covers the shims,
  the packs and `gh rebrand --apply`; release-tag's own parser accepts `v3.1.0` with 40,899 characters; versions and
  marketplace consistent with the sibling bump; plugins validate and site data regenerated)
- Gate failures: none from this TRD (the one guard failure above predates it and is 79-07's)

## Self-Check: PASSED

- FOUND: CHANGELOG.md, plugins/aoforge-stack-flutter/CHANGELOG.md, plugins/aoforge-stack-web/CHANGELOG.md,
  .claude-plugin/marketplace.json, plugins/eden-ui-flutter/.claude-plugin/plugin.json, site/data/aoforge.json,
  package.json, package-lock.json, plugins/aoforge/.claude-plugin/plugin.json
- FOUND: ee155766 and 87e4d0dd in `git log --all`
- FOUND: `## [3.1.0] - 2026-10-16` exactly once in CHANGELOG.md
