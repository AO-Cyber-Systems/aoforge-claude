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

**Unconfirmed lead:** the org-level secret `CLOUDFLARE_ACCOUNT_ID` (AO-Cyber-Systems, visibility ALL, set 2026-04-16) names a different account, or the org `CLOUDFLARE_API_TOKEN` cannot see the AOCyber Systems account's Pages projects.

## Solution

1. Confirm which account the org secrets name, and correct `CLOUDFLARE_ACCOUNT_ID` and/or the token so both target the AOCyber Systems account with Pages edit access. The user sets the secrets; AOForge never enters a token.
2. Create `aoforge-docs` in that account: Pages, then Create, then Direct upload, name `aoforge-docs`, production branch `main`. Pages projects cannot be renamed.
3. With approval, run one deploy: `gh workflow run docs.yml --repo AO-Cyber-Systems/aoforge-claude --ref main`. Confirm it with `gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --limit 1 --json conclusion,status,url`.
4. Move devflow.cloud and www.devflow.cloud from devflow-docs to aoforge-docs. Delete devflow-docs only when the user decides to.
