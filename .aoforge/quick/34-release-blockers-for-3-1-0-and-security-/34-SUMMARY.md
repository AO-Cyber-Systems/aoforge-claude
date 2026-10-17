---
objective: quick-34
trd: 01
subsystem: release, stack packs, security sweep
tags: [release, versioning, stack-packs, changelog, security, redaction, redos]
requires: []
provides:
  - core 3.1.0 consistent with the packs' aoforge >=3.1.0, enforced by a repo test
  - lib/stack-pack-hints.cjs (PACK_PROFILES, packInstallHint) and the pack install hint in EXTENDS_UNRESOLVED
  - scripts/release-tag.cjs (parseTag, planTag, releaseNotes, runRelease) driven by release.yml on v* and *--v*
  - fail-closed redaction, MAX_LINE_CHARS cap and root check in security sweep
affects: [release.yml, changelog-on-tag hook, changelog update, stack-drafter-fleet harness, security-auditor]
tech-stack:
  added: []
  patterns: [injected exec for release automation, whole-token and rest-of-line redaction, tempered regex rows]
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/stack-pack-hints.cjs
    - scripts/release-tag.cjs
    - scripts/release-tag.test.cjs
  modified:
    - package.json
    - package-lock.json
    - plugins/aoforge/.claude-plugin/plugin.json
    - .claude-plugin/marketplace.json
    - CHANGELOG.md
    - CLAUDE.md
    - site/data/aoforge.json
    - .github/workflows/release.yml
    - plugins/aoforge/aoforge/bin/lib/stack-profile.cjs
    - plugins/aoforge/aoforge/bin/lib/changelog.cjs
    - plugins/aoforge/aoforge/bin/lib/security-sweep.cjs
    - plugins/aoforge/hooks/changelog-on-tag.js
    - plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-profile.test.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-drafter-fleet.test.cjs
    - plugins/aoforge/aoforge/bin/lib/changelog.test.cjs
    - plugins/aoforge/aoforge/bin/lib/security-sweep.test.cjs
    - plugins/aoforge/hooks/changelog-on-tag.test.js
decisions:
  - "Core is 3.1.0 on main; the packs' >=3.1.0 range is kept and the devflow pointer stays at 3.0.0"
  - "MARKETPLACE is a local constant in stack-pack-hints.cjs, tied to marketplace.json name by a test, instead of exporting it from stack-packs.cjs (outside files_modified)"
  - "Redaction is fail-closed: whole token, and the rest of the line after a secret-looking key and its operator; MAX_LINE_CHARS stays 4096"
metrics:
  completed: 2026-10-16
  tasks: 3
  commits: 7
status: complete
---

# Quick 34: release blockers for 3.1.0, and secret leaks in security sweep Summary

Core aligned to 3.1.0 so Claude Code stops disabling the stack packs. The fleet harness drafts with the checkout's
packs. A `v*` release now also pushes `aoforge--vX.Y.Z`, and a `<pack>--vX.Y.Z` tag makes a non-Latest pack release.
The tag gate's hint works as printed. `security sweep` redacts fail-closed, caps each scanned line at 4096 chars and
rejects a missing root.

## Progress
- [x] Task 1: core 3.1.0 matches the packs; fleet harness drafts with the checkout's packs; pack install hint — fb532f66, 8c20a572, b60c7619
- [x] Task 2: release step creates prefixed tags and pack releases; changelog hint and previous-tag lookup handle prefixes — 6ff43772, 44da7508
- [x] Task 3: security sweep redacts fail-closed, bounds regex cost, and rejects a missing root — 7f52550b, f7e68425

## Commits

| Hash | Message |
|---|---|
| fb532f66 | test(release): core version must satisfy the packs' aoforge range; pack install hint (RED) |
| 8c20a572 | chore(release): align core to 3.1.0 for the stack packs; name the pack in EXTENDS_UNRESOLVED |
| b60c7619 | test(stack): fleet harness drafts with the checkout's stack packs |
| 6ff43772 | test(release): prefixed release tags, pack releases, prefixed-tag changelog hint (RED) |
| 44da7508 | feat(release): push aoforge--vX.Y.Z with each core release and release packs from their prefixed tags |
| 7f52550b | test(security): secret leaks in sweep hits, catastrophic patterns, missing root (RED) |
| f7e68425 | fix(security): redact whole tokens and secret values fail-closed; cap scanned line length |

All seven commits were made with `aof-tools commit` on `fix/post-77-verification`. Nothing was pushed, tagged
or released (`git tag --list | wc -l` was 32 before and after).

## npm test

How it was run, both times: `npm test` in the worktree with `HOME=<scratchpad>/q34/home` (a scratch home whose
.gitconfig has a test identity and gpgsign off), so nothing was written under ~/.claude. `AOFORGE_FLEET_ROOT=/Users/justin/dev`
was set so the fleet harness still read the real fleet. `~/.claude/aoforge/stacks` does not exist on this machine, so
the scratch HOME does not change profile resolution.

| Run | tests | pass | fail | skipped |
|---|---|---|---|---|
| Baseline at ee93e66f | 12051 | 12000 | 19 | 32 |
| Final at f7e68425 | 12084 | 12051 | 1 | 32 |

Baseline failures: the 18 fleet rows, plus W-3 `ShellSession({shell:"fish"}).dispatch() works end-to-end` in
watcher-shell (Group W, TRD 20-05), which hung until the 600 s test timeout.

Final failure: only W-3 again. It hung to the 600 s timeout and then failed `-1 == 0` at
`plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs:464`. The fish PTY dispatch never returned an exit code. It
fails the same way at ee93e66f and touches nothing this task changed. It was not looped on.

Delta: tests +33 (the new tests: stack-packs 2, stack-profile 1, release-tag 18, changelog-on-tag 4, changelog 2,
security-sweep 6). Pass +51 (those 33 plus the 18 fleet rows). Fail 19 → 1. Skipped unchanged at 32.

## Per-file counts (before → after)

| File | Before | After |
|---|---|---|
| stack-packs.test.cjs | 22/22 | 24/24 |
| stack-profile.test.cjs | 52/52 | 53/53 |
| stack-neutrality.repo.test.cjs | 3/3 | 3/3 |
| stack-drafter-fleet.test.cjs | 50: 31 pass / 18 fail / 1 skipped | 50: 49 pass / 0 fail / 1 skipped |
| release-tag.test.cjs | (new) | 18/18 |
| workflow-permissions.test.cjs | 4/4 | 4/4 |
| changelog-on-tag.test.js | 26/26 | 30/30 |
| changelog.test.cjs | 5/5 | 7/7 |
| security-sweep.test.cjs | 10/10 | 16/16 |

The fleet harness's one skip is aoedge, which has no committed STACK.md at HEAD. ACCEPTED, OPEN and FLEET were not
edited.

## RED evidence

| Test | RED failure |
|---|---|
| core version: the sync files agree… | `aoforge-stack-flutter needs aoforge >=3.1.0, but core is 3.0.0: Claude Code disables the pack (dependency-version-unsatisfied)` |
| stack-pack-hints covers exactly the profiles… | `Cannot find module './stack-pack-hints.cjs'` |
| B4b (quick 34) flutter/dart install hint | `extends 'flutter' not found at <home>/.claude/aoforge/stacks/flutter.md or <checkout>/plugins/aoforge/aoforge/stack-profiles/flutter.md` (no pack named) |
| fleet harness (before useRepoPacks) | 31/18/1, for example `new conflict: components: committed admin/\|flutter, dev/devedge/\|go, go/\|go, portal/\|flutter vs draft dev/devedge/\|go, go/\|go` |
| release.yml tag filter | `tags: 'v*'` (no `*--v*`) |
| release.yml run step | `no run: block calls the release script with the ref name from the environment` |
| runRelease / parseTag / planTag / releaseNotes / CLI (13 tests) | `Cannot find module './release-tag.cjs'` |
| aoforge--v3.1.1 hint | reason was `… changelog update --version aoforge--v3.1.1 …` |
| end-to-end hint | after running the hinted command and committing, the gate still denied: `CHANGELOG.md has no entry for aoforge--v3.1.1` |
| changelog 13 (HEAD range) | `from: 'aoforge-stack-demo--v1.0.0'`, expected `'v1.0.0'` |
| changelog 14 (`--to v1.1.0`) | `from: 'aoforge-stack-demo--v1.0.0'`, expected `'v1.0.0'` |
| redactSecrets fail-closed strings | `'const apiKey = "[REDACTED]";'`, expected `'const apiKey = [REDACTED]'` |
| CLI leak forms | `src/leaks.go:1 is not reported as a hit` (the first assertion that failed; lines 8-10 were not leads) |
| token body prefixes | `sk-ant-`: `'const k = "sk-ant-Qz7W…";'` unchanged |
| 200 KB timing | `killed by SIGTERM after 30003 ms` |
| long line | `line_truncated` was `undefined` |
| one-`.*` guard | `sql-injection: query.*\+.*"`, `execute.*\+.*"`, `raw.*\+.*"`, `debug-defaults: DEBUG.*=.*1` |
| root check | `Missing expected exception.` |

Guards that passed before and after, by design: the plain `v3.1.1` deny text (byte for byte), the pack-tag deny naming
`plugins/aoforge-stack-demo/CHANGELOG.md` and `## [1.0.0]`, `contents: write`, and no `${{ github.ref_name }}` in
a `run:` block.

## The four changed redactSecrets expectations (security-sweep.test.cjs)

| Input | Before | After |
|---|---|---|
| ``const apiKey = "<AKIA…>";`` | `const apiKey = "[REDACTED]";` | `const apiKey = [REDACTED]` |
| `password = 'hunter2'` | `password = '[REDACTED]'` | `password = [REDACTED]` |
| ``db_token: `abc` `` | ``db_token: `[REDACTED]` `` | `db_token: [REDACTED]` |
| `if (password == null) return;` | `if (password == null) return;` | `if (password == [REDACTED]` |

No other existing assertion changed.

## Timing

The 204,852-char single-line file now sweeps in 25 ms (`t.diagnostic`), against a 30 s kill before. MAX_LINE_CHARS
= 4096. The cap did not need lowering to 2048.

## site/data/aoforge.json (regenerated with `node scripts/gen-docs-data.cjs`)

Changed keys: `generatedAt`, `version` and `packageVersion` (3.0.0 → 3.1.0), `counts.hooks` (23 → 24),
`counts.dfToolsCommands` (81 → 84), `agents[job-checker].models.budget` and `agents[verifier].models.budget` (haiku →
sonnet), the events of `changelog-on-tag`, `gate-bash-writes`, `gate-commits` and `gate-interactive` (`PreToolUse
(Bash via pre-bash.js)`) and `guard-no-progress` (its explicit matcher list), the new `hooks[pre-bash]`, new
subcommands `roadmap digest`, `state digest`, `state rotate-decisions`, `validate roadmap-coverage` and `verify
objective-evidence`, the new commands `codebase`, `security` and `trd`, and `models.haiku` (claude-haiku-5-5). Only
the version fields come from this task. The rest is drift since the 2026-10-15 generation.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: core 3.1.0 / hint / fleet | `node --test stack-packs.test.cjs stack-profile.test.cjs stack-neutrality.repo.test.cjs`; `node --test stack-drafter-fleet.test.cjs` | 0; 0 (49/0/1) | PASS |
| 1: version sites | `git grep -n '"version": "3.0.0"' -- package.json package-lock.json plugins/aoforge/.claude-plugin/plugin.json` | 1 (no output); marketplace.json has only the devflow entry (line 47) at 3.0.0 | PASS |
| 1: heading | `rg -n '^## \[3\.1\.0\]' CHANGELOG.md` | 0 (one line: 9) | PASS |
| 2: release tests | `node --test scripts/release-tag.test.cjs scripts/workflow-permissions.test.cjs plugins/aoforge/hooks/changelog-on-tag.test.js plugins/aoforge/aoforge/bin/lib/changelog.test.cjs` (plus context-budget.repo) | 0 (65/65) | PASS |
| 2: trigger and hint | `rg -n "tags:" .github/workflows/release.yml`; `rg -n -F 'version ${tag}' plugins/aoforge/hooks/changelog-on-tag.js` | 0 (`['v*', '*--v*']`); 1 (no output) | PASS |
| 2: no tag made | `git tag --list \| wc -l` | 32 before and after | PASS |
| 3: sweep tests | `node --test plugins/aoforge/aoforge/bin/lib/security-sweep.test.cjs` | 0 (16/16, 25 ms) | PASS |
| 3: missing root | `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs security sweep --root /nonexistent-quick34` | 1 (`Error: security sweep: root /nonexistent-quick34 is not a directory`) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | FAIL, on the pre-existing W-3 fish-shell hang only (12051/12084 pass, 32 skipped). All 33 new tests and every suite this task touched pass |

## Deviations from Plan

1. **[Rule 3 - Blocking] MARKETPLACE not exported from stack-packs.cjs.** The job suggested exporting it, but
   stack-packs.cjs is not in `files_modified` and the verification requires the diff to stay inside that list.
   stack-pack-hints.cjs declares `MARKETPLACE = 'aocyber'`, and the stack-packs test asserts that every hint contains
   `/plugin install <pack>@<marketplace.json name>`, which ties it to the real marketplace name.
2. **Test environment.** Every test run used a scratch HOME (see npm test above) to honour "nothing written under
   ~/.claude". The fleet root was passed explicitly. The per-file baselines matched the job's numbers exactly.
3. **Extra tests beyond the list, all additive:** a `--generate-notes` fallback case, parseTag and positive planTag
   plans, and a CLI exit-1 test for a non-release tag. That test runs in a fixture cwd and fails in planTag before any
   exec. context-budget.repo.test.cjs (6/6) was also run because CLAUDE.md grew by one sentence.
4. **Redaction details beyond the sketch:** the long token prefixes match anywhere, but `sk-`, `AKIA` and `ASIA`
   only at a word start, so words such as `task-` or `disk-` stay readable. The secret-tokens row's own replacement
   still covers a prefixed match. The raw footer is singular for one capped line ("1 line … was … its first 4096
   chars").

## Deferred

None.

## Notes

- `actions/checkout` persists the GITHUB_TOKEN credentials, so `git push origin refs/tags/aoforge--vX.Y.Z` should
  work with `contents: write`. A tag ruleset, if the org adds one, could reject it. Only the first real release will
  show that.
- Token usage is not stamped. `tokens stamp quick-34` exits 1 (`invalid TRD id "quick-34" (expected
  <objective>-<NN>)`), and `34-01` would name objective 34's TRD, not this quick task.
- release.yml calls `node` on `ubuntu-latest` without setup-node. The runner image ships Node, and the script needs
  Node 16 or later with no dependencies.

## User decisions carried forward

1. `SHIM_REMOVAL` and the docs say the rename shims and the `devflow` pointer go in "the release after 3.0.0", which
   is now 3.1.0, but they are still present. Either remove them before tagging or reword the promise.
2. Replace `Unreleased` with the date in `## [3.1.0]` and in each pack's `## [1.0.0]` before tagging.
3. The first real release confirms that GITHUB_TOKEN may push `aoforge--vX.Y.Z` (no tag ruleset blocks it).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 10/11 in full. The 11th ("npm test reports 0 failures") holds except for the W-3 fish-shell
  hang, which was already in the baseline. Its other clauses hold: nothing pushed, tagged or released, and nothing
  written under ~/.claude.
- Gate failures: npm test, W-3 `ShellSession({shell:"fish"})` (watcher-shell.test.cjs:464). Pre-existing and
  environmental.

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/stack-pack-hints.cjs, scripts/release-tag.cjs, scripts/release-tag.test.cjs,
  .github/workflows/release.yml, plugins/aoforge/aoforge/bin/lib/security-sweep.cjs
- FOUND: fb532f66, 8c20a572, b60c7619, 6ff43772, 44da7508, 7f52550b, f7e68425
- `git diff ee93e66f --stat` lists 22 files, all in files_modified. `git status` in the main checkout
  (/Users/justin/dev/aoforge-claude) is unchanged (`?? amp` only)
