---
objective: 72-install-and-naming-cleanup
trd: "24"
subsystem: install
tags: [install, vanity, cloudflare-pages, approval-gates]
requirements: [INST-06]
metrics:
  started: 2026-10-09T14:06:12Z
---

# Objective 72 TRD 24: Draft the vanity-mapping PR and stand up the `aoforge-docs` Pages project (approval gates) Summary

**Checkpoint: Task 1 is done in a scratch clone (one local commit, nothing pushed). Tasks 2 and 3 wait at their approval gates.**

## Progress
- [x] Task 1: Prepare the vanity-mapping change in a scratch clone (scratch commit 980c7c0, outside this repo) — cc0e27a1
- [ ] Task 2: Approval gate A: push the branch and open a DRAFT PR in AOCyberAI-Ops/vanity — next step: the reply is "approved with seed update (Recommended)", but gh is not logged in to aocyber.ghe.com, so nothing ran. Once `gh auth status --hostname aocyber.ghe.com` exits 0, run Gate A steps 1-6 below once each (the seed option)
- [x] Task 3: Approval gate B: the aoforge-docs Pages project and one docs deploy. **DEFERRED by the user to objective 74 (OPS-03)**: reply "Lets put off the docs runs". Nothing was run for Gate B or Gate B2. Todo `2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main` filed — (this commit)

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
| A. Task 2, push and draft PR | "approved with seed update (Recommended)" (user's AskUserQuestion reply, relayed by the orchestrator) | nothing yet. `gh auth status --hostname aocyber.ghe.com` at 2026-10-09T14:1xZ: exit 1, `You are not logged into any accounts on aocyber.ghe.com`. The orchestrator's instruction was to stop if the user is not logged in, so no fetch, apply, push or PR was run |
| B. Task 3, Pages project | "done (dashboard)" (relayed) | verify only, read-only: `curl -sS -I https://aoforge-docs.pages.dev/` gives `Could not resolve host`. `dig +short aoforge-docs.pages.dev @1.1.1.1` is empty. The authoritative server `dig aoforge-docs.pages.dev @adi.ns.cloudflare.com` returns only the `pages.dev` SOA (NXDOMAIN, negative TTL 60s), while `devflow-docs.pages.dev` is delegated (NS gerardo/veda). **Not confirmed**: either the project is not created yet, or it exists without a first deployment or under a suffixed subdomain. wrangler is logged out and the CI token is a secret, so the Cloudflare API was not queried |
| B, superseded | "Lets put off the docs runs" (user's reply, relayed by the orchestrator) | **Gate B DEFERRED to objective 74 (OPS-03).** The earlier "done (dashboard)" is withdrawn; no project was created. Nothing was run |
| B2. One docs deploy | "Lets put off the docs runs" | **DEFERRED to objective 74 (OPS-03).** `gh workflow run docs.yml` was not run |

## Pending gates (exact commands presented, nothing run)

**Gate A (Task 2).** Prerequisite (the user, since it takes a credential): `gh auth login --hostname aocyber.ghe.com`, then `gh auth setup-git --hostname aocyber.ghe.com`. Replies: `approved with seed update` (recommended), `approved` (mapping only, CI expected red), `done` (the user did it; verify only), `blocked` (TRD error_recovery: todo, skip Task 2), anything else holds. Commands, in order, one per call, each run once:
1. `git -C <scratch>/vanity fetch origin`
2. `git -C <scratch>/vanity rev-parse origin/main`: must print a34dfa2d…; if it moved, stop and report (no rebase without a fresh look)
3. (seed option only) `git -C <scratch>/vanity apply <scratch>/vanity-seed-contract.patch`, `git -C <scratch>/vanity add test/fixtures/active-repos.tsv test/node/modules-seed.test.ts`, `AOFORGE_ALLOW_RAW_COMMIT=1 git -C <scratch>/vanity commit -m "test(mapping): seed contract treats aoforge-claude as the renamed devflow-claude"`, `npm --prefix <scratch>/vanity test` (must be 155/155)
4. `git -C <scratch>/vanity push origin add-aoforge-claude` (new branch, never forced, never main)
5. `gh pr create --repo aocyber.ghe.com/AOCyberAI-Ops/vanity --draft --base main --head add-aoforge-claude --title "Add aoforge-claude to the vanity mapping" --body-file <scratch>/vanity-pr-body-seed.md` (or `vanity-pr-body-mapping-only.md` for `approved`)
6. Verify: `gh pr view add-aoforge-claude --repo aocyber.ghe.com/AOCyberAI-Ops/vanity --json isDraft,state,url`

**Gate B (Task 3): DEFERRED to objective 74 (OPS-03); kept here only as the record of what was offered.** wrangler is not logged in, so the default path is the user's dashboard. Replies: `done` (the user created aoforge-docs in the account CI's `CLOUDFLARE_ACCOUNT_ID` names; I verify with `curl https://aoforge-docs.pages.dev/` and ask Gate B2 for the deploy), `approved` (only after the user runs `npx wrangler login` themselves: I run `npx --yes wrangler@4 whoami`, then `npx --yes wrangler@4 pages project create aoforge-docs --production-branch main` once, then ask Gate B2), anything else holds. Gate B2 (its own reply): `gh workflow run docs.yml --repo AO-Cyber-Systems/aoforge-claude --ref main`, then `gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --limit 1 --json conclusion,status,url`.
