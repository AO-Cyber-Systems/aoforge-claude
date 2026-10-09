---
objective: 72-install-and-naming-cleanup
verified: 2026-10-09T18:00:00Z
status: gaps_found
score: 5/6 must-haves verified
gaps:
  - truth: "INST-04: store-mode GitHub artefacts are renamed by a verb that previews with a dry run and applies one repository at a time after approval"
    status: partial
    reason: "gh rebrand exists and is unit-tested on fixtures, but it was never run against a live repository: no fleet repo is in store mode (72-25), and the dry run failed on eden-biz with spawnSync gh ENOBUFS (gh-client defaultRunGh has no maxBuffer). REQUIREMENTS.md still shows INST-04 unchecked/Pending, and no 72 SUMMARY lists INST-04 in requirements-completed (72-08 and 72-16 do)."
    artifacts:
      - path: "plugins/aoforge/aoforge/bin/lib/gh-client.cjs"
        issue: "defaultRunGh passes no maxBuffer; gh rebrand cannot read a large repository (todo 2026-10-09-give-gh-client-a-maxbuffer-so-gh-rebrand-can-read-large-repositories)"
    missing:
      - "Set maxBuffer in gh-client defaultRunGh (todo filed)"
      - "Tick INST-04 in REQUIREMENTS.md once accepted (tracker is inconsistent with the TRD frontmatter)"
---

# Objective 72: Rename to AOForge and naming cleanup Verification Report

**Goal:** DevFlow becomes AOForge everywhere it is a name, old names keep working for one release, projects and the user's setup move over in place, and the legacy df-* install is gone and stays gone.
**Status:** gaps_found (one partial requirement, INST-04; everything else verified)
**Re-verification:** No

## Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | No df-* under ~/.claude/skills or agents; doctor flags reappearance | VERIFIED | `ls ~/.claude/skills ~/.claude/agents \| grep -c '^df-'` = 0; doctor check 15 (legacy-df-install) present in doctor output set |
| 2 | Repo tests fail on legacy command forms and names | VERIFIED | rename-guard.repo.test.cjs and doc-refs.repo.test.cjs: 38 pass, 0 fail |
| 3 | Old names still work, no duplication | VERIFIED (static) | compat.cjs shims, dual-namespace readers, W066/W067, migrations 0012-0014 with contract suites (72-02, 05, 08, 09, 10, 11, 12 SUMMARYs); not re-exercised live here |
| 4 | .planning to .aoforge via git mv, dirty tree skipped, config/CLAUDE.md renamed, store-mode artefacts renamed after dry run | PARTIAL | Migrations 0012/0013/0014 verified by tests and by this repo's own move (4f0ed6b8; `.aoforge/` exists, no `.planning/`). Store-mode `gh rebrand` never run live (see gap) |
| 5 | 3.0.0 tagged, versions in step, CHANGELOG leads with rename, pointer plugin, coexistence flag | VERIFIED | tag v3.0.0; package.json, plugin.json, marketplace.json all 3.0.0; CHANGELOG `## [3.0.0] - 2026-10-08` leads with "DevFlow is now AOForge"; coexistence-guard hook (72-10), pointer plugin (72-14) |
| 6 | Live steps after approval | VERIFIED with deferrals | See below |

### SC-6 detail

- Repo on `.aoforge/` with AOForge active docs: done (72-21, 72-22).
- Global CLAUDE.md routes to /aoforge: done (72-23, global block v4).
- Repo is aoforge-claude, checkout at ~/dev/aoforge-claude, memory and keyed state carried over, follow-up PR #129 open: done (72-19, 72-26).
- Fleet: 10 repos upgraded behind per-repo checkpoints, nothing pushed; trades failed then undone by user reply; some held by user (72-25). Met per user decisions.
- Deferred by decision (not gaps): vanity PR (user deferred; vanity repo still on aocyber.ghe.com; both patches carried in todo 2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured); `aoforge-docs` Pages project moved to objective 74 OPS-03 (todo 2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main); marketplace re-point skipped (GitHub redirect).

## Requirements Coverage

| Req | TRDs claiming | Status | Evidence |
|-----|---------------|--------|----------|
| INST-01 | 8 | SATISFIED | no df-* on disk; command-form guard tests pass |
| INST-02 | 8 | SATISFIED | rename guard passes; 3.0.0 names across plugin |
| INST-03 | 12 | SATISFIED | compat shims and dual readers |
| INST-04 | 6 | PARTIAL | migrations done; live store-mode rebrand unexercised; tracker still Pending |
| INST-05 | 7 | SATISFIED | tag, version triple, CHANGELOG, pointer plugin |
| INST-06 | 11 | SATISFIED (deferrals recorded) | see SC-6 |

No orphaned requirement IDs: all six are claimed by TRDs and present in REQUIREMENTS.md.

## Advisories

- `doctor` reports 5 warnings (legacy-plugin-runtime, legacy-runtime-state, validate-health, awareness-state, backups); no errors. Moving the old runtime home to backups is the user's own call (`doctor --global --fix`).
- Objective is unscored for EST-11 per 72-01.
- Deployment verification: not_available (no devcluster; objective is not deployment-config).

## Human Verification

None required beyond the user's already-deferred live steps.

_Verifier: Claude (verifier)_
