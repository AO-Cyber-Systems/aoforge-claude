---
title: create the aoforge-docs Pages project and deploy the docs from main
area: docs-deploy
files: [.github/workflows/docs.yml]
---

## Problem

`.github/workflows/docs.yml` deploys to the Cloudflare Pages project `aoforge-docs` (`--project-name=aoforge-docs`), which does not exist. On 2026-10-09 the user deferred both the project and the docs deploy to objective 74 (OPS-03) with the reply "Lets put off the docs runs" (TRD 72-24, Gates B and B2).

Every main docs run since at least 2026-09-27 has failed at "Deploy to Cloudflare Pages" with `Project not found [code: 8000007]`: for `devflow-docs` up to 2026-10-08 (runs 36286213239, 37797973574) and for `aoforge-docs` on 2026-10-09 (run 37937471480).

Facts the orchestrator read from the Cloudflare API (read-only) on 2026-10-09, using the user's AOCyber key:
- Account "AOCyber Systems" (id starting b2de90d0) has the Pages projects aocyber-website, politihub-web, politihub-navigators-web, aodex-website and devflow-docs.
- devflow-docs carries devflow.cloud and www.devflow.cloud.
- aoforge-docs does not exist.

So devflow-docs is in that account, yet CI gets 8000007 for it.

**Confirmed (TRD 74-06 Task 1, 2026-10-10, class B):** the 74-02 diagnostic ran on PR #130 (docs.yml run 38020394881, https://github.com/AO-Cyber-Systems/aoforge-claude/actions/runs/38020394881) and printed:

```
cloudflare target: checking the deploy target for Pages project aoforge-docs
cloudflare target: account: Dont Panic Consulting, Co. (named by CLOUDFLARE_ACCOUNT_ID)
cloudflare target: other accounts the token can see: 0
cloudflare target: Pages projects could not be listed: code 8000024 Invalid list options provided. Review the `page` or `per_page` parameter.
```

- The org-level `CLOUDFLARE_ACCOUNT_ID` (visibility ALL, set 2026-04-16) names the account "Dont Panic Consulting, Co.", not AOCyber Systems, and the token sees no other account. So CI cannot reach the AOCyber Systems account at all. That explains `Project not found [8000007]` for `devflow-docs` too.
- The `aoforge-docs` Pages project is missing from AOCyber Systems (orchestrator's read-only check, 2026-10-09).
- There are no repository secrets; the org values are what CI uses.

**Diagnostic bug (74-02):** `scripts/ci-cloudflare-target.cjs` (around lines 42 and 215) requests `pages/projects?per_page=100`, and Cloudflare returns error 8000024. Until it is fixed, the "Pages projects (n)" and "aoforge-docs: present|ABSENT" lines cannot appear. Suggested fix: GET `pages/projects/aoforge-docs` by name instead of listing (a 200 means present, a not-found code means absent). The cause (the endpoint rejecting a `per_page` of 100) is likely but was not verified.

## Status (2026-10-10)

TRD 74-06 was deferred by the user ("Skip this for now - we aren't doing this right now."). OPS-03 stays Pending. PR #130 stays open and unmerged until this resumes (it now carries only OPS-03 content). Nothing was pushed and no Cloudflare or GitHub state changed. The remaining steps are 74-06 Task 2 (steps 1 and 2 below) and Task 3 (one preview deploy from `ops/74-ci-operations`, which needs the diagnostic fix above first), each behind its own approval. The production deploy in step 3 happens at the merge in TRD 74-08.

## Solution

1. Set repository-level secrets `CLOUDFLARE_API_TOKEN` (Account / Cloudflare Pages / Edit, plus Account Settings / Read so the diagnostic can name the account) and `CLOUDFLARE_ACCOUNT_ID` for the AOCyber Systems account. A repository secret overrides the org secret of the same name for this repository only, so other repositories keep the org values. The user sets the secrets (GitHub Settings, or `gh secret set <NAME> --repo AO-Cyber-Systems/aoforge-claude`); AOForge never enters a token.
2. Create `aoforge-docs` in that account: Pages, then Create, then Direct upload, name `aoforge-docs`, production branch `main`. Pages projects cannot be renamed.
3. With approval, run one deploy: `gh workflow run docs.yml --repo AO-Cyber-Systems/aoforge-claude --ref main`. Confirm it with `gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --limit 1 --json conclusion,status,url`.
4. Move devflow.cloud and www.devflow.cloud from devflow-docs to aoforge-docs. Delete devflow-docs only when the user decides to.
