# Objective 50: github-enforcement-and-setup - Research

**Researched:** 2026-10-01
**Domain:** DevFlow plugin (Node CJS) + GitHub rulesets / Actions / org App
**Confidence:** MEDIUM-HIGH (seams verified in code; GitHub endpoints verified in docs; issue-field create and merge-queue availability MEDIUM)

<user_constraints>
## User Constraints (no CONTEXT.md; design locked in docs/PROPOSAL-github-system-of-record.md, 2026-09-30)

### Locked Decisions
- GitHub authoritative; `.planning/` is a gitignored cache (store mode). One PR per objective to the default branch. Local enforcement: block commits on the default branch or unlinked branches; offline-tolerant outbox; logged env-var escape `DEVFLOW_SKIP_GH_GATE=1`.
- Identity: developer's `gh` token locally; org GitHub App in Actions (owned by platform/ops in AOCyberAI-Ops, incl. key rotation).
- Merge queue required wherever the repo supports it; workflows get `merge_group`. Repos without org features or wiki degrade (labels + body metadata; `docs/`).
- Ruleset branch-name / commit-message patterns are Enterprise-only, so linked-issue is a required Actions check.
- Stacked PRs not planned.

### Claude's Discretion
- Module layout, check ids, W-codes, the node script the workflow runs, test seams.

### Deferred Ideas (OUT OF SCOPE)
- Objective 51 work; stacked PRs; org-Project (Projects v2) writes from Actions (GITHUB_TOKEN cannot reach them).
- Open (proposal): which private repos are on a plan with wikis.
</user_constraints>

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GEN-01 | commit gate + trailer + escape | Seam: `cmdCommit` in `lib/misc.cjs:561`; `commit-trailer.cjs`; `override.cjs` GATES; `objective-branch.defaultBranch/currentBranch` |
| GEN-02 | post-commit + Stop hooks flush/report | New hooks + hooks.json PostToolUse (none registered today); `gh-outbox-flush.flush`; hook-marker-store |
| GEN-03 | health/doctor reports | validate Check 16 (W057+), doctor check 25-29 range |
| GEN-04 | `gh setup` | new `lib/gh-setup.cjs` + dispatch in df-tools `case 'gh'` (line ~1088); REST endpoints below; fake extensions |
| GEN-05 | reusable workflow + merge-time reconcile | `.github/workflows` template + `lib/gh-check.cjs` node script, tested with node --test |
</phase_requirements>

## Summary

Everything needed already exists as seams; this objective is mostly new thin modules plus three insertions into existing code. Store mode is the only place enforcement applies: with `github.store` off (D-01) `cmdCommit`, the hooks and `validate health`/`doctor` must be byte-identical and make zero `gh` calls (follow the pattern at `misc.cjs` "Local mode takes neither branch" and `planning-drift` "local returns before reading any outbox state"). `gh setup` is the exception by nature: it is an explicit command that needs `github.enabled` + a repo, not store mode (a repo can be set up before store is turned on).

Primary recommendation: build `gh-setup.cjs` as a pure plan/apply pair (`planSetup(state) -> actions[]`, `applySetup(actions)` through `gh-client`), reusing `gh-capability.detectCapabilities` for degradation; build the two required checks as one pure module `gh-check.cjs` (`linkedIssue({prBody, commits})`, `planningConsistency(...)`) invoked by a thin script from the reusable workflow; gate commits with a pure `gh-gate.cjs` called from `cmdCommit`.

## Standard Stack

No new dependencies (CJS, node:test). GitHub side: `gh` via `gh-client.cjs` only (`gh-seam.repo.test.cjs` fails CI on direct gh calls); `actions/create-github-app-token` (v3.x uses `client-id`; `app-id` deprecated since v3.1.0, v2 only knows `app-id`), `actions/checkout`.

| Piece | Where | Note |
|---|---|---|
| gate | `lib/gh-gate.cjs` (new) | pure; inputs: root, branch, default branch, mapping, env |
| setup | `lib/gh-setup.cjs` + `gh-setup-cli.cjs` (new) | dry-run default, `--apply` |
| checks | `lib/gh-check.cjs` (new) + `.github/workflows/devflow-checks.yml` template | `workflow_call` |
| health | `lib/gh-health.cjs` (new) feeding validate Check 16 and doctor check 25 | |
| hooks | `hooks/gh-flush.js` (new; PostToolUse Bash + Stop) | warn-only |

## Seam map (verified)

**GEN-01 commit gate.** `cmdCommit(cwd, message, files, raw, amend)` at `lib/misc.cjs:561`, dispatched `df-tools.cjs:385`. Store-mode trailer branch already exists (`planningMode.isStoreMode(cwd)` then `refsFor(resolveMainRoot(cwd)||cwd, message)` then `applyRefs`), after the commit_docs/gitignore filtering and before the merge-in-progress check. Insert the gate at the top of that store-mode block (before any `git add`, so refusal leaves the index untouched). Refusal result style: `{committed:false, hash:null, reason:'<code>', error:'...'}` via `output(result, raw, reason, 1)` (see `merge_in_progress`). Reasons: `default_branch`, `unlinked_branch`.
- Default branch: `objective-branch.defaultBranch(root)` (origin/HEAD then main/master fallback; `branch:null` when unknown). Current: `currentBranch(root)`. Both take an injectable `_setRunGit`. Detached HEAD: treat as unlinked, refuse with a clear message.
- "Linked" locally = offline fact from the mapping: `ghMapping.listPrs(mapping)`/`getPr` (`prs[<objective>].branch`, written by `gh pr start`). Compare against the current branch; resolve mapping from MAIN root (worktrees hold none). Do NOT call GitHub from commit (must work offline). The linked-branch truth on GitHub is `gh pr start` (createLinkedBranch), so a local mapping hit is sufficient.
- MUST allow executor worktree branches `df/exec-<id>` (`exec-context.cjs:424`) that merge back into the objective branch: allow when the main checkout is itself on a linked branch, or at minimum when the name matches `df/exec-*`. Otherwise every parallel wave is refused. Also allow merge/rebase completion paths (`merge_in_progress` already handled separately).
- Trailer: `commit-trailer.refsFor` returns `issue:null` with a reason on an unscoped commit; today it never blocks (its header says "enforcement belongs to the check"). Keep that: the branch gate is the local enforcement, the trailer stays best-effort. Consider falling back to the branch's objective issue (`prs[obj]` -> objective `issue_id`) when the message has no scope, so GEN-01 "adds the trailer" always holds on a linked branch.
- Escape: `DEVFLOW_SKIP_GH_GATE=1` read from `process.env` inside df-tools (this is a df-tools process, not a hook, so the exported-variable caveat that affects gate-commits does not apply). On escape, log through `override.recordOverride({planningDir, gate:'gh', reason})`; add `gh: null` to `GATES` (env-driven, logged only, same as `commits`/`changelog`). Reason text: from `DEVFLOW_SKIP_GH_GATE_REASON` or a fixed default ("env DEVFLOW_SKIP_GH_GATE=1"). `audit-cli.runOverride` validates gate names against GATES, so adding the key makes `df-tools override --gate gh --reason ...` work too. Log lives at `.planning/.override-log.jsonl` (runtime state, already a tolerated dotfile; confirm it is gitignored in store mode).
- gate-commits.js (hook) blocks raw `git commit`; `df-tools commit` is the sanctioned path, so raw-commit bypass of the new gate is out of scope locally and is covered remotely by the PR checks.

**GEN-02 hooks.** `hooks.json` registers SessionStart, Stop (verify-completion, auto-continue), SubagentStop, UserPromptSubmit, PreToolUse. There is NO PostToolUse entry; add `PostToolUse` with matcher `Bash` -> new `gh-flush.js`, and append to the Stop group. `hook-inventory.test.cjs` pins CLAUDE.md `### Hooks` bullets to hooks.json both ways: add the bullet in the same change or CI fails. Hook rules: warn-only/exit 0, fail open, never write runtime dotfiles into `.planning/` (`planning-writes.audit.test.js`; allowlist only `.skill-active`, `.edit-override`, `.devflow-notices.json`); keep markers in `hook-marker-store` (`~/.claude/devflow/state/hook-markers/<repo-key>/`, override `DEVFLOW_HOOK_MARKER_DIR`). Post-commit trigger: PostToolUse payload has `tool_input.command`; fire only when it contains `df-tools.cjs commit` (or `df-tools commit`) to avoid flushing on every Bash call. Behaviour: store mode only; call `gh-outbox-flush.flush(root, {wait:false})` (it already returns `status:'pending', reason:'offline'` via `markPending` rather than throwing, and `status:'skipped'` when `github.enabled` false; lock contention returns `running`), bounded by a short timeout; report via stderr/`additionalContext`, never `decision:block`. Drift report = pending count + halted + `findCacheDrift`. Stop hook must never block (do not touch `stop_hook_active` logic; `auto-continue` blocks once already). Use `DEVFLOW_SKIP_GH_FLUSH_HOOK=1` style escape consistent with other hooks. Hook tests are `hooks/*.test.js` run with the fake `gh` via `_setRunGh` or PATH shim (`gh-shim.test.cjs` shows the shim).

**GEN-03 health.** `validate.cjs` checks: 15 = planning cache drift (W055/W056, store only, `findCacheDrift`). Next free: **Check 16**, **W057-W059** (W058+ also free; W060s unused; verified none of W057+ present). Suggested: W057 unsynced writes (outbox pending/blocked/halted via `outbox.status`), W058 orphaned TRD issues / missing objective-TRD links (`gh-hierarchy.reportOrphans` already computes `unlinked`, `missing_local`, but it calls GitHub; health must stay offline: use cached mapping + outbox only, and mark network-needing checks `doctor`-only), W059 objective branch with no linked mapping / PR missing, W060 frozen-body drift (TRD body hash vs spec-rev `frozen` event: `gh-trd` `parseSpecRev` frozen/hash, `handlePatchBody` already refuses frozen edits remotely). Always `addIssue('warning', code, msg, fix, false)` (never repairable, never flips `ok`), wrap in try/catch -> W056-style "check failed" code so it is never silent. Doctor: next free project slot is **25** (`24-store-cache-tracked` is last; 10-19 global, 20-29 project, 30-39 state). Add `25-gh-sync-state.cjs` (and optionally `26-gh-setup-drift`), report-only (`fixable:false`, `fix_command`), compose `gh-health.cjs` rather than reimplement; add `*.test.cjs` next to it; the README lists contract + numbering.

**Outbox offline.** `flush`: `res.class==='offline'|'rate_limited'` -> `markPending` + `finish('pending')`, exit code 3 from `gh outbox flush`; no throw. `detectCapabilities` has `offlineAnswer()` that falls back to the cached capability record. So hooks and checks can treat `pending` as success-with-notice.

**GEN-04 setup.** `df-tools.cjs` `case 'gh'` (line ~1088) is a flat if/else on `args[1]`; add `setup` -> `require('./lib/gh-setup-cli.cjs').cmdGhSetup(cwd, args.slice(2), raw)` and extend the "Unknown gh subcommand" list; `dispatch-completeness.test.cjs` and `help.cjs` need entries (check both). Exit codes follow gh-store-cli `EXIT` (0 ok, 1 error). Reuse from `gh-capability`: `REQUIRED_TYPES` (Objective, TRD, Decision) + `OPTIONAL_TYPES` (Debug, Quick), `REQUIRED_FIELDS` (work, kind), `ISSUE_FIELDS_PATH`, `detectCapabilities(cwd,{refresh:true})` (types/fields/pages/sub-issues/dependencies, wiki state `ok|disabled|uninitialised|unavailable`), `describeDegraded`. Labels from config `github.labels.*` (objective, in_progress, gaps, trd, decision) default `devflow:*`; existing `ensureLabel` shells `gh label create <n> --repo <r> --color 1d76db --description 'DevFlow tracking'` and tolerates "already exists" - reuse that exact shape for idempotency. Merge queue already has a GraphQL probe in `gh-outbox-flush.mergeQueueProbe` (`repository.mergeQueue(branch:)`), usable to detect an existing queue.

Plan/apply design: (1) read state (repo meta, rulesets list, labels, org types/fields, workflow file, PR template, wiki), (2) compute an ordered action list, each `{kind, target, desc, exists|create|update, payload}`; dry-run (default) prints exact JSON payloads; `--apply` executes via `gh-client.ghWrite` (paced), idempotent by diffing against existing (match ruleset by `name` e.g. `devflow: default branch`, PUT if drifted, skip if equal). Local-file actions (PR template `.github/pull_request_template.md`, workflow `.github/workflows/devflow-checks.yml`) are written to the working tree, not committed (user commits via a PR; `df-tools commit --files`). Do not clobber an existing PR template: append/managed block or report. Non-admin token: 403 -> report-only per action, exit 1 at the end, never partial-silent.

GitHub endpoints (docs verified 2026-10):
- Rulesets: `GET/POST repos/{o}/{r}/rulesets`, `PUT .../rulesets/{id}`, `GET .../rules/branches/{branch}`. Body: `name`, `target:'branch'`, `enforcement:'active'` (`evaluate` is Enterprise-only), `conditions.ref_name.include:['~DEFAULT_BRANCH']`, `bypass_actors` (default `[]`), `rules`: `{type:'pull_request', parameters:{required_approving_review_count:0, dismiss_stale_reviews_on_push:false, require_code_owner_review:false, require_last_push_approval:false, required_review_thread_resolution:false}}` (four booleans + count REQUIRED; decide approvals count, 0 is the least surprising since one-PR-per-objective with a solo dev), `{type:'non_fast_forward'}`, `{type:'deletion'}`, `{type:'required_status_checks', parameters:{required_status_checks:[{context:'devflow/linked-issue'},{context:'devflow/planning-consistency'}], strict_required_status_checks_policy:false}}` (add `integration_id` of the org App to pin the source: HIGH value, MEDIUM feasibility, needs the App id from config), and `{type:'merge_queue', parameters:{check_response_timeout_minutes, grouping_strategy:'ALLGREEN', max_entries_to_build, max_entries_to_merge, merge_method, min_entries_to_merge, min_entries_to_merge_wait_minutes}}` (all 7 required; `merge_method` must follow `github.pr.merge_method` default squash -> `SQUASH`). Pick conservative defaults: 60, ALLGREEN, 5, 5, SQUASH, 1, 5.
- Merge queue availability: org-owned public repos or private on Enterprise Cloud only; Team-plan private repos do not offer it. No clean pre-probe, so: attempt with the rule; on 422 retry without `merge_queue` and report "merge queue unavailable on this plan" (degraded advisory, exit 0). A merge queue cannot coexist with wildcard branch patterns (we use `~DEFAULT_BRANCH`, fine).
- Issue types: `GET/POST orgs/{org}/issue-types` (`name`, `description`, `is_enabled`, `color`), update `PUT .../issue-types/{id}`; max 25; User-owned repos: 404 -> degraded (labels). Create only missing of REQUIRED + OPTIONAL types.
- Issue fields: `GET/POST orgs/{org}/issue-fields` with header `X-GitHub-Api-Version: 2026-03-10`; body `name`, `data_type` (text|date|single_select|multi_select|number), `description`, `visibility`. Needs org admin (`admin:org`/Issue Fields write). Fields `work` and `kind` as `single_select` (options listing is a separate sub-resource; MEDIUM/LOW: confirm option-creation shape before coding, make it an Open Question; ISSUE_FIELDS_PATH comment in capability says LOW confidence and docs now confirm the path). `gh-client.ghWrite` may need to pass `-H X-GitHub-Api-Version`; check `isWriteArgs` treats `api -X POST` as a write (it does for the existing REST writes).
- Wiki: `has_wiki` via `PATCH repos/{o}/{r} {has_wiki:true}`; initialization cannot be done by API (first page web UI): setup only CHECKS via `probeWiki`/capability `pages` and prints the manual step; never falls back silently.
- Labels: `gh label create` as above (or `POST repos/{o}/{r}/labels`).
- merge_group: the workflow template carries `on: pull_request` + `merge_group`. Setup also scans existing `.github/workflows/*.yml` for workflows that produce required contexts and warns if they lack `merge_group` (do not rewrite user workflows; report). No path/branch filters on required-check workflows.
- Degraded detection: `detectCapabilities` fields `types:'native'|'labels'`, `fields:'meta'`, `pages`; print `describeDegraded` in the setup report; with no org features skip type/field actions and note labels + body metadata are used instead.

**Fake GitHub extensions** (`lib/__fixtures__/gh-fake.cjs`, 1438 lines; unknown routes return `[gh-fake] unsupported`, so add to the fake, never to tests). Missing today: rulesets (GET list/POST/PUT, with 422 for merge_queue when option `mergeQueueAllowed:false`, and 403 when `push`/admin false), `PATCH repos/o/r` (has_wiki), `orgs/o/issue-types` POST/PUT, `orgs/o/issue-fields` POST (+ api-version header check), labels REST if used (`gh label create` is implemented in argv form: confirm `label create` handler near fake line ~824). Add fake options `rulesets`, `mergeQueueAllowed`, `isAdmin`. Existing options: `ownerType`, `hasWiki`, `push`, `types`, `fields`, `mergeQueue`, `defaultBranch`, `setOffline`. Add cases to `gh-fake.test.cjs` per its "add the shape HERE" rule. Local-file side uses a temp project dir; `makeGitRemote` (`__fixtures__/git-remote.cjs`) for the wiki remote and `gh-shim.test.cjs` pattern for PATH-shim hook tests. Never `~/.claude`: set `DEVFLOW_GH_CACHE_DIR`, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_HOOK_MARKER_DIR` to temp dirs.

**GEN-05 workflow.** Ship the reusable workflow as a template in this repo (e.g. `plugins/devflow/devflow/templates/github/devflow-checks.yml`, mirrored to `~/.claude/devflow/` by sync-runtime, which `gh setup` copies into the target repo) PLUS this repo's own `.github/workflows/` copy dogfooding it. Because the checks must run in repos where DevFlow is not checked out, the workflow `workflow_call`s from a central repo (org-owned, e.g. AOCyberAI-Ops/.github `uses: org/repo/.github/workflows/devflow-checks.yml@<tag>`), where the script is vendored; the plugin ships a thin caller. Open: central repo path/tag is owned by platform/ops.
- Shape: `on: workflow_call: {inputs: {app-client-id: string}, secrets: {app-private-key: required}}`; callers use `pull_request` (opened, edited, synchronize, reopened, ready_for_review) and `merge_group`, plus `pull_request_target`-style isolation NOT needed (checks only read PR body/commits). Job names/contexts must be exactly `devflow/linked-issue` and `devflow/planning-consistency` (set `name:`; the context is the job name; the same names on `merge_group`). Step: `actions/create-github-app-token@v3` with `client-id` (not `app-id`; actionlint may still reject it) and explicit `permission-*` (issues: write, pull-requests: write, contents: read; metadata read). The App is only needed for the reconcile (closing issues, Project -> Done needs org Projects scope the GITHUB_TOKEN lacks); the two checks themselves can use the default `GITHUB_TOKEN` (read), which reduces App blast radius. Recommend: checks on GITHUB_TOKEN, reconcile job on the App token, `if: github.event.pull_request.merged == true` (a `pull_request: closed` trigger) so merge-queue merges also reconcile (`merge_group` `destroyed` is not a merge signal; use `closed` + `merged`).
- Logic in a node script (`scripts/devflow-check.cjs` or the lib module with a tiny CLI): `linkedIssue`: PR must contain a closing reference (`Closes|Fixes|Resolves #N`, case-insensitive, also `owner/repo#N`) in the PR body, to an existing issue; objective PRs also carry commit trailers `^Refs #\d+$` (commit-trailer header names this check). On `merge_group` there is no PR body: read the PR from `github.event.merge_group.head_commit`/branch `gh-readonly-queue/<base>/pr-<n>-<sha>` and re-evaluate by PR number. `planningConsistency`: in store mode `.planning/` is NOT in git (migration 0010), so the check cannot run `validate consistency` on a checkout; define it as: the mapping/issue graph is consistent (objective issue exists, TRD sub-issues linked, no unfrozen-drifted body, wiki revision pinned in PR body exists), read from GitHub, and in local mode run `df-tools validate consistency` on the checkout. Needs a decision (Open Question 1).
- Testing offline: the script exports pure functions taking `(event, readIssue, listCommits)` with injected fetchers and has `main()` reading `GITHUB_EVENT_PATH` + env; tests feed fixture event JSON files and the fake GitHub via `_setRunGh` (the script uses `gh-client`, or REST through an injected `getJson`). Add a YAML sanity test (parse the workflow with a tiny line check or `json-schema-lite`; do not add a YAML dep): assert contexts/names, `workflow_call`, `merge_group`, `client-id`, and that no `paths`/`branches` filter exists. Success criterion 3 = test: PR body without closing reference -> exit 1 with `failure` conclusion; with `Closes #N` -> 0.
- Reconcile reuse: `gh-pr.reconcileObjectivePr(root, objArg, deps)` (steps closes any issue the closing keywords missed; exit 0/3/1) is local-cache oriented; in Actions there is no cache, so write a stateless variant that lists `Closes` targets from the PR body, closes any still open, deletes branch is handled by repo setting `delete_branch_on_merge` (add to setup: `PATCH repos {delete_branch_on_merge:true}`).

## Architecture Patterns

- Pure-core/thin-IO: `planSetup`, `evaluateGate`, `linkedIssue` are pure and table-tested; IO only in `apply*`/CLI.
- Everything GitHub goes through `gh-client` (repo test `gh-seam.repo.test.cjs`).
- Store-off guard first line of each public entry point; test with a `gh` seam that throws on any call.
- Command output: `result(EXIT.X, payload, text)` + `emit(res, raw)` as in gh-store-cli.

### Anti-Patterns
- Calling GitHub from `df-tools commit` or `validate health` (must work offline; health offline-only).
- Rewriting user workflows or PR templates unprompted.
- Using a ruleset `evaluate` mode or branch-name/commit-message patterns (Enterprise-only).
- Path/branch filters on the required-check workflows (check never reports, merge hangs).

## Don't Hand-Roll

| Problem | Use instead |
|---|---|
| default branch / current branch | `objective-branch.cjs` |
| issue for a commit | `commit-trailer.refsFor/applyRefs` |
| override logging | `override.recordOverride` |
| capability / degraded detection | `gh-capability.detectCapabilities`, `describeDegraded` |
| offline flush | `gh-outbox-flush.flush` |
| orphans/links | `gh-hierarchy.reportOrphans` |
| cache drift | `planning-drift.findCacheDrift` |
| label create idempotency | the `ensureLabel` pattern |
| YAML parsing | none: assert on text; no new deps |

## Common Pitfalls

1. **Worktree executors refused**: `df/exec-*` branches have no mapping entry; allow them (see GEN-01). Warning sign: parallel waves fail at first commit.
2. **Local-mode regression**: any gh call or changed result key with store off breaks D-01; add byte-identical tests (existing `commit-*.test.cjs` patterns).
3. **merge_group missing**: required checks never report in the queue, PRs hang. Same context names on both events.
4. **Merge-queue 422 on Team plan**: must degrade, not abort the whole apply.
5. **`pull_request` rule parameters**: all four booleans + count are required or the POST is 422.
6. **Required check context pinning**: without `integration_id` anyone can post a status with that name; pin to the App when its id is configured.
7. **Closing keywords only fire for PRs to the default branch** (proposal); the check must also assert base == default.
8. **Issue-fields API version header** `2026-03-10` is required for create; missing header = 404/400.
9. **Hook payload**: PostToolUse fires for every Bash; match the command string narrowly; never block; no `.planning/` writes from hooks.
10. **hook-inventory/doc tests**: new hook needs a CLAUDE.md bullet; new df-tools verb needs help/dispatch-completeness/doc-refs entries; new W-codes may need documenting where W055 is listed (USER-GUIDE).
11. **Override log path**: `.planning/.override-log.jsonl` must exist in a store-mode project's ignore rules (check migration 0010 block) so it is not committed.
12. **Wiki first page**: cannot be API-created; setup reports a manual step and exits non-zero only when `--require-wiki`.

## Code Examples

Ruleset payload (from docs.github.com/en/rest/repos/rules):
```json
{"name":"devflow: default branch","target":"branch","enforcement":"active","bypass_actors":[],
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"devflow/linked-issue"},{"context":"devflow/planning-consistency"}]}},
  {"type":"merge_queue","parameters":{"check_response_timeout_minutes":60,"grouping_strategy":"ALLGREEN","max_entries_to_build":5,"max_entries_to_merge":5,"merge_method":"SQUASH","min_entries_to_merge":1,"min_entries_to_merge_wait_minutes":5}}]}
```
Send via `gh api -X POST repos/o/r/rulesets --input -` (the client accepts `opts.input`; the fake reads it).

Gate decision (sketch): `evaluateGate({branch, defaultBranch, prs, env}) -> {allow, reason, escaped}`; `escaped` set only when `env.DEVFLOW_SKIP_GH_GATE === '1'` and the gate would otherwise refuse.

Workflow skeleton:
```yaml
name: DevFlow checks
on:
  workflow_call:
    inputs: { app-client-id: { type: string, required: false } }
    secrets: { app-private-key: { required: false } }
jobs:
  linked-issue:
    name: devflow/linked-issue
    runs-on: ubuntu-latest
    permissions: { contents: read, issues: read, pull-requests: read }
    steps: [ checkout, run node check script linked-issue ]
```
(Caller adds `on: pull_request` + `merge_group`; check job-name vs reusable-workflow context: a called job's context is `<caller job> / <called job name>`, so contexts must be verified, see Open Question 2.)

## State of the Art
- `actions/create-github-app-token` v3.1.0+ uses `client-id`; `app-id` deprecated.
- Issue fields GA for all orgs; REST create needs `X-GitHub-Api-Version: 2026-03-10`.
- Merge queue is a ruleset rule type (`merge_queue`), not just branch protection.

## Open Questions

1. **What does `devflow/planning-consistency` check in store mode?** (`.planning/` untracked.) Recommendation: validate the GitHub issue graph + mapping-independent invariants server-side; keep `df-tools validate consistency` for local-mode repos. Planner should fix this in the first TRD.
2. **Required-context naming through `workflow_call`.** Required contexts are matched on check name; a reusable workflow job shows as `<caller-job-id> / <job name>` unless the caller job is named. Recommend the shipped caller workflow define jobs named exactly `devflow/linked-issue` and `devflow/planning-consistency` that `uses:` nothing, i.e. the template's jobs call the script directly, and the "reusable" part is the shared steps/App-token reconcile. Verify with one real repo outside CI before declaring done (cannot be tested offline: LOW confidence).
3. **Issue-field option creation for single_select `work`/`kind`** (REST shape for options). Verify in docs before coding; fall back to `text` data type or body metadata.
4. **Org App id / `integration_id` source** (config key `github.app_login` exists, no id). Recommend `github.app_id` config + optional pin.
5. **Central repo for the reusable workflow** (AOCyberAI-Ops; platform/ops-owned). The plugin ships the caller + script; the actual `uses:` ref is a config value (`github.checks_workflow`).
6. **Approving review count** default 0 vs 1.

## Sources

### Primary (HIGH)
- Code: `lib/misc.cjs` (cmdCommit), `commit-trailer.cjs`, `override.cjs`, `objective-branch.cjs`, `gh-capability.cjs`, `gh-outbox-flush.cjs`, `gh-store-cli.cjs`, `gh-pr.cjs`, `validate.cjs` Check 15, `doctor-checks/README.md`, `hooks/hooks.json`, `__fixtures__/gh-fake.cjs`
- https://docs.github.com/en/rest/repos/rules (rulesets, merge_queue/pull_request/required_status_checks parameters)
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue (availability, merge_group)
### Secondary (MEDIUM)
- https://docs.github.com/en/rest/orgs/issue-types ; https://docs.github.com/en/rest/orgs/issue-fields (create requires API version 2026-03-10)
- https://github.com/actions/create-github-app-token (client-id from v3.1.0)
### Tertiary (LOW)
- Required-context naming through reusable workflows; issue-field option API.

## Metadata
**Confidence:** seams HIGH; endpoints MEDIUM-HIGH; Actions context naming LOW.
**Research date:** 2026-10-01. **Valid until:** 2026-10-31.
