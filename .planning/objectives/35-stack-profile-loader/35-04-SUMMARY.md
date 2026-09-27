---
objective: 35-stack-profile-loader
trd: "04"
subsystem: stack-profile
tags: [drafting, cli, tdd, evidence-collection, workflows]
dependency-graph:
  requires: ["35-01", "35-02a", "35-02b", "35-03"]
  provides: ["collectEvidence", "classifyCommand", "listOrgProfiles", "pickExtends", "draftProfile", "serializeProfile", "initProfile", "df-tools stack init"]
  affects: ["35-05 (health)", "35-09 (detectMarkers builds on listOrgProfiles)"]
tech-stack:
  added: []
  patterns:
    - "Evidence readers live in a stack-free sibling module (stack-evidence.cjs) so
       stack-profile.cjs's own neutrality test (P11) never has to distinguish 'evidence about
       a tool' from 'a hardcoded stack name' — the module boundary does that for free."
    - "draftProfile queries the parent chain via a synthetic in-memory resolve target
       ({frontmatter:{schema:1, extends: extendsId}, sections: []}) fed through the existing
       resolveFromParsed core (35-03), so a draft that has never touched disk still sees exactly
       what its parent already resolves and only fills commands left at `discover`."
    - "serializeProfile always emits `key: {}` / `key: []` inline for empty objects/arrays rather
       than a bare `key:` line, because yaml-lite's buildMap treats a key with no value and no
       indented block as null — the round-trip test (I7b) exists specifically to pin this."
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-evidence.cjs
    - plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-init.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-profile-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/templates/codebase/stack.md
    - plugins/devflow/devflow/workflows/map-codebase.md
    - plugins/devflow/devflow/workflows/new-project.md
decisions:
  - "Ancestor-dropping in pickExtends (I3): when multiple installed profiles' detect markers match,
     any matched profile that is an ancestor (via its own extends chain) of another matched profile
     is dropped from the winner pool — the most specific (child) profile wins, dropped ancestors are
     surfaced in `alternatives` rather than silently discarded."
  - "draftProfile's body is a single-line HTML comment with no `## ` heading, by design (a gotcha
     called out in the TRD): an H2 in the draft would REPLACE the parent's corresponding section
     under 35-02a's merge semantics, so the draft must stay heading-free."
  - "I12's org fixture is inline (not the shared fx.orgProfileGoLike()) because that shared fixture's
     test.scoped is 'buildtool test -race {packages}' — a neutral placeholder — while the DoD's
     literal expected output is 'go test -race ./pkg'; the inline fixture makes the DoD text
     achievable without changing the shared fixture (which 35-05 also depends on, per the TRD's own
     'you own it this wave' note not extending to renaming its content)."
metrics:
  duration: "~90 min (including a continuation across a context compaction)"
  completed: 2026-09-27
---

# Objective 35 TRD 04: Drafting — `df-tools stack init` Summary

Added evidence-based command drafting (`stack-evidence.cjs`: CI workflow / Makefile / justfile /
package.json / TESTING.md / Commands-table readers) and `df-tools stack init`
(`listOrgProfiles`, `pickExtends`, `draftProfile`, `serializeProfile`, `initProfile`), then wired a
human-confirmed draft step into `map-codebase` and `new-project`, with `codebase/STACK.md` gaining
a `## Commands` section as the evidence source.

## Deviations from Plan

None — TRD executed exactly as written. One self-caught test-authoring bug during Task 2's GREEN
pass (not a TRD deviation, no Rule 1-4 applicable): the I6 test's first draft asserted against
`draft.commands`, which doesn't exist on `draftProfile`'s return shape (`{frontmatter, body,
evidence, extends}` — commands live under `draft.frontmatter.commands`). Caught and fixed before
the GREEN commit; the implementation itself was correct on the first pass.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: stack-evidence.cjs (E1-E10) | `node --test plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs` | 0 | PASS (12/12) |
| 2: stack init drafting (I1-I12) | `node --test plugins/devflow/devflow/bin/lib/stack-init.test.cjs` | 0 | PASS (13/13, incl. I7b) |
| 2: no 35-02a/35-03 regressions | `node --test stack-profile.test.cjs stack-cli.test.cjs help.test.cjs` | 0 | PASS |
| 3: Commands section wiring | `rg -n "draft_stack_profile\|stack init --from codebase" map-codebase.md` | 0 | PASS (see grep evidence below) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test stack-evidence.test.cjs` | 1 | FAIL (correct — `collectEvidence`/`classifyCommand` not yet defined) |
| GREEN (Task 1) | `node --test stack-evidence.test.cjs` | 0 | PASS (12/12) |
| RED (Task 2) | `node --test stack-init.test.cjs` | 1 | FAIL (correct — `sp.draftProfile is not a function` on I11; I12 exit-code mismatch with GREEN implementation stashed) |
| GREEN (Task 2) | `node --test stack-init.test.cjs` | 0 | PASS (13/13, after fixing the I6 test-authoring bug) |

## Grep Evidence (Task 3)

| Check | Command | Result |
|---|---|---|
| Commands section present twice (template + worked example) | `rg -c "^## Commands" templates/codebase/stack.md` | `2` |
| Table header present twice | `rg -n "\| Key \| Command \| Evidence \|" templates/codebase/stack.md` | lines 82, 168 |
| Step ordering | `rg -n '<step name="verify_output">\|<step name="draft_stack_profile">\|<step name="generate_claude_md">' map-codebase.md` | 214 → 231 → 248 (correctly between the two) |
| Continue-line updated | `rg -n "Continue to draft_stack_profile" map-codebase.md` | line 228 |
| new-project wiring after RESEARCH COMPLETE | `rg -n "stack init --from research\|RESEARCH COMPLETE" new-project.md` | RESEARCH COMPLETE at 765; `stack init --from research` at 782 (after) |
| "Unknown command" skip wording (both files) | `rg -n "Unknown command" map-codebase.md new-project.md` | present in both |
| Human confirm wording (both files) | `rg -n '"yes / edit / skip"' map-codebase.md new-project.md` | present in both |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Fast verify | `node --test stack-evidence.test.cjs stack-init.test.cjs stack-profile.test.cjs stack-cli.test.cjs help.test.cjs` | 0 | PASS (79/79) |
| Neutrality | `rg -n -i "golang\|gofmt\|\bdart\b\|flutter\|pubspec\|cargo\|pytest\|rails\|gradle\|swift\|kotlin" stack-evidence.cjs stack-profile.cjs` | 1 (no matches) | PASS |
| Full regression gate | see below | 1 | 1 failure, pre-existing (see below) |

## Post-TRD Verification

- Auto-fix cycles used: 0 (the one bug found was a test-authoring mistake caught and fixed
  entirely within Task 2's own RED→GREEN cycle, before any commit — not a post-hoc deviation)
- Must-haves verified: 7/7 (`must_haves.truths` — preview-by-default, DoD write→validate→command
  end-to-end via I12, refuse-without-force via I10, child-wins-over-ancestor via I3, discover-only
  drafting via I6, no-H2-body by construction, Commands-section + workflow wiring via grep evidence
  above)
- Gate failures: None blocking

## Regression Gate (baseline-relative)

Ran `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`
from the repo root, output written to the session scratchpad only (never the repo).

**Totals (this run, informational):** 3571 tests, 499 suites, 3538 pass, 1 fail, 0 cancelled, 32 skipped.

**Failures and classification:**

| Test | File:Line | In baseline TSV? | Classification |
|---|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | Yes (matches a `baseline-failures.tsv` line) | **Pre-existing** |

That is the only failure this run produced. None of the "up to 11" known-flaky
devflow-watch.test.cjs/handoff-e2e.test.cjs failures (daemon PID-lifecycle, route-results,
LK-1/LK-2) reproduced in this run. Per the gate's rule, a name appearing in the TSV counts as
pre-existing regardless of whether it passes or fails in a given run; the sole failure observed
matches the TSV exactly, so no re-run or `git diff --stat` investigation was required.
`baseline-failures.tsv` was not edited. `bin/lib/micro.test.cjs` was excluded from the run per the
TRD's instruction (it hangs on signing; pre-existing).

**Verdict: no regressions.**

## Commits

| Commit | Type | Message |
|---|---|---|
| `3221240` | test | test(35-04): stack evidence readers |
| `ca23b8a` | feat | feat(35-04): stack-evidence command readers |
| `1299f7f` | test | test(35-04): stack init drafting |
| `2d1230b` | feat | feat(35-04): df-tools stack init |
| `4c1c36a` | feat | feat(35-04): stack init drafting wired into map-codebase and new-project |

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/stack-evidence.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-evidence.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/stack-init.test.cjs
- FOUND: 3221240, ca23b8a, 1299f7f, 2d1230b, 4c1c36a (all present in `git log --oneline`)
