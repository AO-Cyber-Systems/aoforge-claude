---
objective: 72-install-and-naming-cleanup
trd: "24"
subsystem: install
tags: [install, vanity, cloudflare-pages, approval-gates]
requirements: [INST-06]
requires:
  - objective: 72
    provides: "72-19/72-20: the GitHub repository renamed to AO-Cyber-Systems/aoforge-claude and 3.0.0 merged to main (docs.yml deploys to aoforge-docs); 72-23: global CLAUDE.md and marketplace decisions"
provides:
  - "Vanity mapping change prepared and verified (mapping commit plus seed-contract patch, 155/155 with both). Its durable copy is todo 2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured. Not pushed: deferred by the user"
  - "Cloudflare Pages facts for OPS-03: aoforge-docs does not exist; devflow-docs (devflow.cloud) is in the AOCyber Systems account; CI has hit 8000007 since 2026-09-27. Todo 2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main"
affects: [72-25, 72-26, 74]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .aoforge/todos/pending/2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md
    - .aoforge/todos/pending/2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured.md
  modified:
    - CLAUDE.md
decisions:
  - "Vanity PR (Gate A) deferred by the user until the rename is completely done: \"Defer that until we are completely done - that vanity URL is not configured yet.\" This replaces the earlier \"approved with seed update (Recommended)\"; nothing pushed, no PR"
  - "aoforge-docs Pages project and docs deploy (Gates B, B2) deferred by the user to objective 74 (OPS-03): \"Lets put off the docs runs\". This replaces the earlier \"done (dashboard)\"; nothing created or run"
  - "The vanity seed test pins the key set (VAN-07), so the mapping change ships with a seed-contract patch: the fixture row and MIRRORED become aoforge-claude, and devflow-claude becomes a kept EXTRA_KEYS rename key"
requirements-completed: []
metrics:
  started: 2026-10-09T14:06:12Z
  completed: 2026-10-09T15:15:15Z
  duration: "about 15 min of executor time, plus the approval waits"
  tasks: 3
  files: 3
tokens_input: 15177313
tokens_output: 80349
tokens_cache_read: 14672534
tokens_cache_write: 504567
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 24: Draft the vanity-mapping PR and stand up the `aoforge-docs` Pages project (approval gates) Summary

**Complete with deferrals: the vanity-mapping change was prepared and verified in a scratch clone (155/155 with its seed-contract patch). The user then deferred both live steps, so no PR was opened and no Pages project was created. The vanity PR waits until the rename is completely done and git.aocyber.ai is configured; the `aoforge-docs` project and the docs deploy move to objective 74 (OPS-03). Each has a todo carrying everything needed to resume. INST-06 stays Pending.**

## Progress
- [x] Task 1: Prepare the vanity-mapping change in a scratch clone (scratch commit 980c7c0, outside this repo) — cc0e27a1
- [x] Task 2: Approval gate A: push the branch and open a DRAFT PR in AOCyberAI-Ops/vanity. **DEFERRED by the user** ("Defer that until we are completely done - that vanity URL is not configured yet."). Nothing pushed, no PR. Todo `2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured` filed with both patches — final docs commit
- [x] Task 3: Approval gate B: the aoforge-docs Pages project and one docs deploy. **DEFERRED by the user to objective 74 (OPS-03)**: reply "Lets put off the docs runs". Nothing was run for Gate B or Gate B2. Todo `2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main` filed — d04c698d

## Task 1: the vanity-mapping change (2026-10-09T14:06-14:10Z)

Preflight: `exec-context check --repo /Users/justin/dev/devflow-claude --base feat/stack-profile-loader --id 72-24` exit 0. Main checkout, branch feat/stack-profile-loader, head 06494e55, `base_visible: true`, claim 72-24. The dispatch named no explicit WAVE_BASE, so the objective branch tip was used.

Scratch clone: `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/1c14a6e5-33a1-4f35-adda-4ba2db358951/scratchpad/vanity`. Throughout this SUMMARY, `<scratch>` is `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/1c14a6e5-33a1-4f35-adda-4ba2db358951/scratchpad`.

| Check | Result |
|---|---|
| `gh repo view AOCyberAI-Ops/vanity` (TRD step 1) | exit 1: `Could not resolve to a Repository`. gh is logged in to github.com only |
| `gh api orgs/AOCyberAI-Ops` | 404 on github.com |
| Local clone `/Users/justin/dev/vanity` | remote `origin https://aocyber.ghe.com/AOCyberAI-Ops/vanity.git`. **The repo lives on GHE.com (aocyber.ghe.com), not github.com.** Branch main, clean, at a34dfa2 (tag v0.2.0) |
| `git -C /Users/justin/dev/vanity ls-remote origin` | exit 128: `could not read Username for 'https://aocyber.ghe.com'`. No git credential for aocyber.ghe.com in this shell |
| `gh auth status --hostname aocyber.ghe.com` | `You are not logged into any accounts on aocyber.ghe.com` |
| `curl https://aocyber.ghe.com/AOCyberAI-Ops/vanity` | 302 to the login page: the tenant answers |
| Migration project (`~/dev/github-enterprise-migration/.planning/PROJECT.md:53`, `STATE.md:50`) | GHE.com hosting was **abandoned 2026-10-06** ("not usable"); the target is now the github.com enterprise `aocyberai`. The vanity repo was created on GHE.com before that decision and has not moved |
| Live Worker `curl -D - https://git.aocyber.ai/canary.git` | 302 to eden-platform-go, `x-vanity-mapping: eb89ef18b775` |
| `curl https://git.aocyber.ai/devflow-claude.git` | 302 to `https://github.com/AO-Cyber-Systems/devflow-claude` (GitHub then redirects to aoforge-claude) |
| `curl https://git.aocyber.ai/aoforge-claude.git` | 404: no mapping yet |
| `gh repo view AO-Cyber-Systems/aoforge-claude` | PUBLIC, not archived, default branch main |

The real remote could not be cloned (no credential), so the scratch clone was made from the local clone, which matches the deployed mapping: main's build digest `eb89ef18b775` equals the live `x-vanity-mapping`. Its `origin` URL was then set to `https://aocyber.ghe.com/AOCyberAI-Ops/vanity.git` (local config only) so Gate A pushes to the real remote. Whether the remote main moved after 2026-10-06 18:36 is unverified until the user is logged in; Gate A fetches first.

Steps: `git clone /Users/justin/dev/vanity <scratch>/vanity`; `git -C <scratch>/vanity remote set-url origin https://aocyber.ghe.com/AOCyberAI-Ops/vanity.git`; `git -C <scratch>/vanity switch -c add-aoforge-claude`; one Edit to `modules.yaml`; `npm ci`; tests; `git add modules.yaml`; `AOFORGE_ALLOW_RAW_COMMIT=1 git -C <scratch>/vanity commit -m "feat(mapping): add aoforge-claude" -m "<body>"` gave **980c7c0** on `add-aoforge-claude` (parent a34dfa2).

**Format differs from the documented one** (TRD recovery: follow the file). `modules.yaml` uses YAML flow mappings, `key: { repo: Owner/Name, visibility: v }`, with `host` optional and omitted for github.com, not `<name>: <visibility> <host> <owner>/<repo>`. Both PR bodies say so.

### The full diff (`git -C <scratch>/vanity diff HEAD~1 -- modules.yaml`)

```diff
diff --git a/modules.yaml b/modules.yaml
index 0c9ba2a..27f7d06 100644
--- a/modules.yaml
+++ b/modules.yaml
@@ -62,6 +62,8 @@ modules:
   eden-press:                { repo: AO-Cyber-Systems/eden-press, visibility: public }
   eden-cli:                  { repo: AO-Cyber-Systems/eden-cli, visibility: public }
   devflow-claude:            { repo: AO-Cyber-Systems/devflow-claude, visibility: public }
+  # renamed from devflow-claude (AOForge 3.0.0)
+  aoforge-claude:            { repo: AO-Cyber-Systems/aoforge-claude, visibility: public }
   flutter-builder:           { repo: AO-Cyber-Systems/flutter-builder, visibility: public }
   edendocs:                  { repo: AO-Cyber-Systems/EdenDocs, visibility: public }
   flutter_map_plugins:       { repo: AO-Cyber-Systems/flutter_map_plugins, visibility: public }
```

`git show --stat HEAD`: `modules.yaml | 2 ++`, 1 file changed, 2 insertions. The devflow-claude entry is unchanged.

### The repository's own tests

| Run | Command | Result |
|---|---|---|
| Baseline, main (v0.2.0) | `npm --prefix <scratch>/vanity test` | 7 files, **155/155 passed**; generate: 54 modules, digest `eb89ef18b775` (= live) |
| Mapping-only commit 980c7c0 | `npm --prefix <scratch>/vanity test` | **exit 1: 154 passed, 1 failed.** `modules-seed.test.ts` case 7 "no strays": `expected [...] to have a length of 54 but got 55`. Digest `44d02afed482`, 55 modules |
| With the drafted seed-contract change (working tree only, then restored) | `npm --prefix <scratch>/vanity test` | 7 files, **155/155 passed**, digest `44d02afed482` |
| same | `npm --prefix <scratch>/vanity run typecheck` | exit 0 |
| same | `go -C <scratch>/vanity test ./probe/...` | `ok go.aocyber.ai/vanity/probe` |
| same | `WRANGLER_SEND_METRICS=false npm --prefix <scratch>/vanity run check:deploy` | wrangler 4.147.0 `--dry-run: exiting now`, bundle 11.52 KiB, no deploy |

The seed test pins the key set to exactly the 52-row inventory fixture plus `vanity` and `canary` (VAN-07), so any new key fails CI's required `test` check unless the seed contract changes too. Changing the test contract goes beyond "change only the entries the TRD names", so it was **not committed**. It is drafted as `<scratch>/vanity-seed-contract.patch` for the user to choose at Gate A. The scratch branch holds only 980c7c0, and `git status` is clean.

The drafted seed-contract patch:
- `test/fixtures/active-repos.tsv`: the row `devflow-claude public main` becomes `aoforge-claude public main` (sorted after `aoforge`)
- `MIRRORED`: `"devflow-claude"` becomes `"aoforge-claude"`
- `EXTRA_KEYS`: adds `["devflow-claude", { repo: "AO-Cyber-Systems/devflow-claude" }]`, with a comment saying it is the kept pre-rename key
- case 10 expects both extra keys

PR bodies (end with the attribution line): `<scratch>/vanity-pr-body-seed.md` (with the seed commit) and `<scratch>/vanity-pr-body-mapping-only.md` (says the `test` check is expected to fail).

## Task 3 pre-checks (read-only, 2026-10-09T14:10Z)

| Check | Result |
|---|---|
| `rg -n project-name .github/workflows/docs.yml` (local) | line 75 `--project-name=aoforge-docs --branch=main --commit-dirty=true` |
| docs.yml on `main` (`gh api .../contents/.github/workflows/docs.yml?ref=main`) | same `--project-name=aoforge-docs`; triggers: push to main (paths), pull_request, `workflow_dispatch`; Hugo `--baseURL "https://devflow.cloud/"` |
| `npx --yes wrangler@4 whoami` | exit 1: wrangler 4.70.0, `Failed to fetch auth token: 400 Bad Request`, `Not logged in.` The user's own wrangler session has expired |
| `gh secret list --repo AO-Cyber-Systems/aoforge-claude` | none at repo level |
| `gh secret list --org AO-Cyber-Systems` (names only) | `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, both set 2026-04-16, visibility ALL |
| Latest main docs run 37937471480 (2026-10-09T13:31Z, after the 3.0.0 merge) | failure at "Deploy to Cloudflare Pages": `/accounts/***/pages/projects/aoforge-docs` `Project not found ... [code: 8000007]`. The token authenticates; only the project is missing |
| Main docs runs since 2026-09-27 (10 listed) | all failure. 37797973574 (10-08) and 36286213239 (09-27): the same 8000007 for **devflow-docs** |
| `curl https://devflow-docs.pages.dev/` and `https://devflow.cloud/` | both 200, `<title>DevFlow</title>`. The old project exists and serves the domain. My first reading, "not in the account the CI secret names", was an inference from the 8000007 runs. The account facts below locate the project, but which account the secret names is still unconfirmed |
| `curl https://aoforge-docs.pages.dev/` | does not resolve: no such project anywhere |

### Cloudflare account facts (gathered read-only by the orchestrator, 2026-10-09)

The orchestrator read these from the Cloudflare API using the user's AOCyber global key. The executor made no Cloudflare API call.

| Fact | Value |
|---|---|
| Account | "AOCyber Systems", id starting `b2de90d0` (the full id is in the orchestrator's relay; it is truncated here because this repository is public) |
| Pages projects in that account | aocyber-website, politihub-web, politihub-navigators-web, aodex-website, devflow-docs |
| devflow-docs custom domains | devflow.cloud, www.devflow.cloud |
| aoforge-docs | **does not exist** |

So **devflow-docs is in the AOCyber Systems account**, yet CI's deploy got `Project not found [8000007]` for devflow-docs from 2026-09-27 to 2026-10-08.

**Unconfirmed lead for OPS-03:** the org-level secret `CLOUDFLARE_ACCOUNT_ID` (AO-Cyber-Systems, visibility ALL, set 2026-04-16) names a different account, or the org `CLOUDFLARE_API_TOKEN` lacks access to this account's Pages projects. This is not verified: the secret values were not read.

## Approvals (literal replies)

| Gate | Reply | Run |
|---|---|---|
| A, final | "Defer that until we are completely done - that vanity URL is not configured yet." (user's reply, relayed by the orchestrator) | **Gate A DEFERRED.** It replaces the reply below; nothing was fetched, pushed or opened. Todo filed with both patches. The user's reason is that git.aocyber.ai is not configured yet. For the record, on 2026-10-09 the hostname answered 302 for `devflow-claude` and `canary`, with mapping digest `eb89ef18b775` (v0.2.0) |
| A. Task 2, push and draft PR (superseded) | "approved with seed update (Recommended)" (user's AskUserQuestion reply, relayed by the orchestrator) | nothing yet. `gh auth status --hostname aocyber.ghe.com` at 2026-10-09T14:1xZ: exit 1, `You are not logged into any accounts on aocyber.ghe.com`. The orchestrator's instruction was to stop if the user is not logged in, so no fetch, apply, push or PR was run |
| B. Task 3, Pages project | "done (dashboard)" (relayed) | verify only, read-only: `curl -sS -I https://aoforge-docs.pages.dev/` gives `Could not resolve host`. `dig +short aoforge-docs.pages.dev @1.1.1.1` is empty. The authoritative server `dig aoforge-docs.pages.dev @adi.ns.cloudflare.com` returns only the `pages.dev` SOA (NXDOMAIN, negative TTL 60s), while `devflow-docs.pages.dev` is delegated (NS gerardo/veda). **Not confirmed**: either the project is not created yet, or it exists without a first deployment or under a suffixed subdomain. wrangler is logged out and the CI token is a secret, so the Cloudflare API was not queried |
| B, superseded | "Lets put off the docs runs" (user's reply, relayed by the orchestrator) | **Gate B DEFERRED to objective 74 (OPS-03).** The earlier "done (dashboard)" is withdrawn; no project was created. Nothing was run |
| B2. One docs deploy | "Lets put off the docs runs" | **DEFERRED to objective 74 (OPS-03).** `gh workflow run docs.yml` was not run |

## Gates as offered (all deferred; nothing was run)

**Gate A (Task 2): DEFERRED until the rename is complete. Kept as the record of what was offered; the todo carries the updated recipe.** Prerequisite (the user, since it takes a credential): `gh auth login --hostname aocyber.ghe.com`, then `gh auth setup-git --hostname aocyber.ghe.com`. Replies: `approved with seed update` (recommended), `approved` (mapping only, CI expected red), `done` (the user did it; verify only), `blocked` (TRD error_recovery: todo, skip Task 2), anything else holds. Commands, in order, one per call, each run once:
1. `git -C <scratch>/vanity fetch origin`
2. `git -C <scratch>/vanity rev-parse origin/main`: must print a34dfa2d…; if it moved, stop and report (no rebase without a fresh look)
3. (seed option only) `git -C <scratch>/vanity apply <scratch>/vanity-seed-contract.patch`, `git -C <scratch>/vanity add test/fixtures/active-repos.tsv test/node/modules-seed.test.ts`, `AOFORGE_ALLOW_RAW_COMMIT=1 git -C <scratch>/vanity commit -m "test(mapping): seed contract treats aoforge-claude as the renamed devflow-claude"`, `npm --prefix <scratch>/vanity test` (must be 155/155)
4. `git -C <scratch>/vanity push origin add-aoforge-claude` (new branch, never forced, never main)
5. `gh pr create --repo aocyber.ghe.com/AOCyberAI-Ops/vanity --draft --base main --head add-aoforge-claude --title "Add aoforge-claude to the vanity mapping" --body-file <scratch>/vanity-pr-body-seed.md` (or `vanity-pr-body-mapping-only.md` for `approved`)
6. Verify: `gh pr view add-aoforge-claude --repo aocyber.ghe.com/AOCyberAI-Ops/vanity --json isDraft,state,url`

**Gate B (Task 3): DEFERRED to objective 74 (OPS-03); kept here only as the record of what was offered.** wrangler is not logged in, so the default path is the user's dashboard. Replies: `done` (the user created aoforge-docs in the account CI's `CLOUDFLARE_ACCOUNT_ID` names; I verify with `curl https://aoforge-docs.pages.dev/` and ask Gate B2 for the deploy), `approved` (only after the user runs `npx wrangler login` themselves: I run `npx --yes wrangler@4 whoami`, then `npx --yes wrangler@4 pages project create aoforge-docs --production-branch main` once, then ask Gate B2), anything else holds. Gate B2 (its own reply): `gh workflow run docs.yml --repo AO-Cyber-Systems/aoforge-claude --ref main`, then `gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --limit 1 --json conclusion,status,url`.

## Deferred-work todos

| Todo | Carries |
|---|---|
| `.aoforge/todos/pending/2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured.md` | The durable copy of the scratch work, because the scratchpad is session-only. It holds patch 1 (`git format-patch -1 980c7c0`, byte-identical apart from format-patch's trailing blank line) and patch 2 (`vanity-seed-contract.patch`, byte-identical by `cmp`); both were re-extracted from the filed todo and checked with `git apply --check`. It also notes that the repo is on aocyber.ghe.com, gives the login prerequisite, the PR body outline and the steps, and says never merge |
| `.aoforge/todos/pending/2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md` | The Cloudflare account facts, the 8000007 history, the unconfirmed secret/account lead, and the four steps: fix the secret, create aoforge-docs, run one approved deploy, move devflow.cloud |

## Must-haves

| # | Truth | Evidence | Status |
|---|---|---|---|
| 1 | A scratch-clone branch adds `aoforge-claude` in the file's format (public, `AO-Cyber-Systems/aoforge-claude`, current host), keeps `devflow-claude`, and passes the repo's own tests | 980c7c0 adds exactly that entry and keeps `devflow-claude`. Mapping alone: 154/155 (seed case 7). With the drafted seed patch: 155/155, typecheck, Go probe and dry-run bundle all pass. The patch was not committed because the user deferred the gate before applying it | PARTIAL: the entry is right; passing the tests needs the patch, which is preserved in the todo |
| 2 | Pushed and a DRAFT PR opened only after explicit approval, never merged; if the repo is inaccessible, recorded with a todo | The user deferred the gate ("Defer that until we are completely done ..."). Nothing pushed (`add-aoforge-claude` has no upstream), no PR. The repo is on aocyber.ghe.com, where gh/git had no login. Blocker recorded and todo filed | MET by the TRD's own alternative (recorded and todo instead of a PR) |
| 3 | The Pages project `aoforge-docs` exists, and the deploy result is recorded after an approved docs run | The user deferred both to objective 74 (OPS-03). aoforge-docs does not exist (orchestrator's read-only API check, and authoritative DNS shows nothing). No run was triggered. Last main run 37937471480: failure, 8000007 | **NOT MET**: deferred by the user; todo filed |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Prepare the vanity change | `git -C <scratch>/vanity diff HEAD~1 -- modules.yaml` (exactly one added entry and its comment) | 0 | PASS |
| 2: Gate A, draft PR | `gh auth status --hostname aocyber.ghe.com` (not logged in), then the user's deferral; `git -C <scratch>/vanity rev-parse --abbrev-ref add-aoforge-claude@{upstream}` gives `no upstream configured` (never pushed) | 1 / 128 | DEFERRED by the user |
| 3: Gate B and B2, Pages and deploy | `dig aoforge-docs.pages.dev @adi.ns.cloudflare.com` (no record), then the user's deferral to OPS-03 | 0 | DEFERRED by the user |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Vanity repo tests (scratch, mapping + seed patch) | `npm --prefix <scratch>/vanity test`, `run typecheck`, `go -C <scratch>/vanity test ./probe/...`, `run check:deploy` | 0 | PASS: 155/155 |
| Vanity repo tests (scratch, mapping only) | `npm --prefix <scratch>/vanity test` | 1 | FAIL as expected: seed case 7. Recorded, which is why the seed patch exists |
| CLAUDE.md guards (after the "Where we left off" edit) | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs dispatch-completeness.test.cjs` | 0 | PASS: 45/45 |
| stack task gates (test/lint/build) in this repo | not run | n/a | not_available: no source file changed; only CLAUDE.md prose, todos and this SUMMARY |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The vanity repo is on aocyber.ghe.com, not github.com**
- **Found during:** Task 1, when `gh repo view AOCyberAI-Ops/vanity` failed.
- **Fix:** I found the local clone `/Users/justin/dev/vanity` (origin `https://aocyber.ghe.com/AOCyberAI-Ops/vanity.git`) and cloned the scratch copy from it, because there was no login for the real remote. I confirmed the copy is current with what is deployed: main's digest `eb89ef18b775` equals the live `x-vanity-mapping`. I then set the scratch clone's `origin` to the GHE.com URL. I did not file the TRD's error_recovery todo at that point, because the repo exists. The user's later deferral made the todo the outcome anyway.

**2. [Rule 4-style, surfaced, not applied] The seed test pins the key set**
- **Found during:** Task 1.
- **Issue:** `modules-seed.test.ts` case 7 fails with any new key. Fixing it touches the VAN-07 test contract, which is beyond "change only the entries the TRD names".
- **Handling:** The fix was drafted as a patch and not committed. The user chose it at Gate A ("approved with seed update") before deferring the whole gate.

**3. [Recovery] Mapping format differs from the doc**
- The file uses YAML flow mappings. As the TRD's recovery says, I followed the file, and both PR bodies say so.

**4. [Rule 2 - 72-22 hand-off] Project CLAUDE.md "Where we left off" updated**
- "72-23 of 26" became "72-24 of 26", and the 72-24 bullet now records the deferrals and both todo names. No legacy spelling was added; the rename guard passes 45/45.

**5. [Correction] A pre-check inference was wrong**
- I had first inferred that devflow-docs was outside the CI secret's account. The orchestrator's read-only Cloudflare check placed devflow-docs in "AOCyber Systems" (id truncated here because the repo is public). The SUMMARY now records the secret or account mismatch as an unconfirmed lead.

**6. [Dispatch] No explicit WAVE_BASE**
- The preflight used the objective branch tip `feat/stack-profile-loader` (06494e55).

Nothing was pushed anywhere. No Cloudflare write was made and no workflow was triggered. The user's vanity clone `/Users/justin/dev/vanity` was read only.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 1 met (truth 2, through its recorded-and-todo alternative), 1 partial (truth 1), 1 not met (truth 3, deferred by the user)
- Gate failures: none in this repo. The vanity mapping-only test failure is recorded above and resolved by the preserved seed patch
- Success criteria ("the vanity mapping change awaits the user's review, and the docs site has its AOForge Pages project"): **not met**. Both were deferred by the user. The TRD gives no deferral path for the Pages project, so this TRD is closed as **complete with deferrals**, not as passed
- INST-06 stays **Pending**. `requirements mark-complete` is not run

## Hand-offs

- **The vanity PR (after the rename is complete and git.aocyber.ai is configured):** follow the todo. The scratch clone `<scratch>/vanity` (branch `add-aoforge-claude` at 980c7c0, no upstream) disappears with the session; the todo is the only durable copy.
- **The migration project:** its inventory (`inventory/AO-Cyber-Systems.repos.json`) and PLAN.md still list the pre-rename repo name among the 11 mirrors. Its own state still says the vanity repo is on GHE.com, which it abandoned on 2026-10-06.
- **Objective 74 (OPS-03):** start from the docs todo: check which account the org `CLOUDFLARE_ACCOUNT_ID` names before creating aoforge-docs.
- **72-25 and 72-26:** CLAUDE.md now reads 72-24 of 26. Update it as each step lands.

## Self-Check: COMPLETE WITH DEFERRALS (not PASSED)

The TRD's own success criteria do not count a user-deferred gate as met: the Pages project does not exist, and the vanity PR is not awaiting review. So this is not a PASSED verdict. Every claim in this SUMMARY was checked:

- FOUND: commits cc0e27a1, 19ffaaa1 and d04c698d on `feat/stack-profile-loader` (`git log --oneline -n 4`)
- FOUND: both todo files under `.aoforge/todos/pending/` (8674 and 2151 bytes)
- FOUND: the todo's patches re-extracted and verified. The seed patch is byte-identical (`cmp`) and applies (`git apply --check`); the mapping patch reverse-applies on 980c7c0 (`git apply --check -R`)
- FOUND: scratch commit 980c7c0 on `add-aoforge-claude`, no upstream (never pushed)
- FOUND: the CLAUDE.md edit passes the rename, doc-refs and dispatch guards (45/45)
- NOT DONE (user-deferred): vanity draft PR; aoforge-docs Pages project; docs deploy
