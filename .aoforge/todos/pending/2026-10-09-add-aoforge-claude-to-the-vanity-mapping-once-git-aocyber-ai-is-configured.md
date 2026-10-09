---
title: add aoforge-claude to the vanity mapping once git.aocyber.ai is configured
area: vanity-mapping
files: ["AOCyberAI-Ops/vanity modules.yaml (aocyber.ghe.com, outside this repo)"]
---

## Problem

TRD 72-24 Task 2 (INST-06) was deferred by the user on 2026-10-09: "Defer that until we are completely done - that vanity URL is not configured yet." This replaces the user's earlier Gate A reply, "approved with seed update". Nothing was pushed and no PR was opened. The work comes after everything else in the rename is done.

The vanity Worker repository is **`https://aocyber.ghe.com/AOCyberAI-Ops/vanity.git` on GHE.com**, not on github.com. `gh repo view AOCyberAI-Ops/vanity` fails against github.com. The migration project abandoned GHE.com as its target on 2026-10-06 (`~/dev/github-enterprise-migration/.planning/PROJECT.md`), but the vanity repo has not moved. As of 2026-10-09, gh and git have no login for aocyber.ghe.com on this machine.

What the hostname did on 2026-10-09:
- `git.aocyber.ai/devflow-claude.git` returned 302 to `github.com/AO-Cyber-Systems/devflow-claude`.
- `git.aocyber.ai/aoforge-claude.git` returned 404.
- The live `x-vanity-mapping` was `eb89ef18b775`, which is main at tag v0.2.0 (a34dfa2).

The change was prepared in a session-only scratch clone. This todo is its durable copy: the two patches below are verbatim.

1. **Mapping commit** (scratch 980c7c0 on branch `add-aoforge-claude`, parent a34dfa2). It adds only the `aoforge-claude` entry and keeps `devflow-claude`.
2. **Seed-contract patch**, not committed. `test/node/modules-seed.test.ts` case 7 ("no strays") fails on the mapping change alone: 154 passed, 1 failed, "expected 54, got 55". With this patch: 155/155 passed, typecheck clean, `go test ./probe/...` ok, `check:deploy` dry run ok, digest `44d02afed482`.

The file's real format is YAML flow mappings, `key: { repo: Owner/Name, visibility: v }`, with `host` optional and omitted for github.com. That differs from the one-line form documented in `VANITY-IMPORTS.md`.

### Patch 1: mapping (`git format-patch -1 980c7c0`)

````diff
From 980c7c0109d6e507e985bcc642ee618995858536 Mon Sep 17 00:00:00 2001
From: Justin Donnaruma <justin@donnaruma.us>
Date: Fri, 9 Oct 2026 10:08:46 -0400
Subject: [PATCH] feat(mapping): add aoforge-claude

AO-Cyber-Systems/devflow-claude was renamed to AO-Cyber-Systems/aoforge-claude (AOForge 3.0.0). Add the new name as its own key on the current legacy host (github.com, host omitted), public like the repo it renames. The devflow-claude key stays: GitHub redirects the old name, and removing it is a separate decision.
---
 modules.yaml | 2 ++
 1 file changed, 2 insertions(+)

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
-- 
2.54.0 (Apple Git-157)
````

### Patch 2: seed contract (`vanity-seed-contract.patch`, apply with `git apply`)

````diff
diff --git a/test/fixtures/active-repos.tsv b/test/fixtures/active-repos.tsv
index cc5cbbd..6841c51 100644
--- a/test/fixtures/active-repos.tsv
+++ b/test/fixtures/active-repos.tsv
@@ -13,6 +13,7 @@ aodex	private	main
 aodex-website	private	main
 aoedge	private	main
 aoforge	private	main
+aoforge-claude	public	main
 aoforge-term	private	main
 aoid	private	main
 aoinference	private	main
@@ -21,7 +22,6 @@ aoterm	private	ao-main
 demo-builder	private	main
 devcluster	private	main
 devflow	private	main
-devflow-claude	public	main
 devflowops	private	main
 dfip	private	main
 eden-biz	private	main
diff --git a/test/node/modules-seed.test.ts b/test/node/modules-seed.test.ts
index 8463cf9..aaa1076 100644
--- a/test/node/modules-seed.test.ts
+++ b/test/node/modules-seed.test.ts
@@ -23,7 +23,7 @@ const MIRRORED = new Set([
   "eden-ui-flutter",
   "eden-press",
   "eden-cli",
-  "devflow-claude",
+  "aoforge-claude",
   "flutter-builder",
   "EdenDocs",
   "flutter_map_plugins",
@@ -59,7 +59,13 @@ const ALLOWED_NON_LEGACY = new Map<string, { host: string; repo: string }>([
 // `canary` (TRD 02-09) is the health-check key used by post-deploy smoke and monitors, and by the
 // VAN-05 propagation rehearsal. It aliases a PUBLIC mirrored repo so a health check never needs a
 // credential. Keep this list to keys that must stay forever: a revert is another approved deploy.
-const EXTRA_KEYS = new Map<string, { repo: string }>([["canary", { repo: "AO-Cyber-Systems/eden-platform-go" }]]);
+// `devflow-claude` is the pre-rename key of aoforge-claude (renamed 2026-10-09, AOForge 3.0.0). It
+// keeps its old target, which GitHub redirects, so existing git.aocyber.ai/devflow-claude references
+// keep resolving. Removing it is a separate reviewed change.
+const EXTRA_KEYS = new Map<string, { repo: string }>([
+  ["canary", { repo: "AO-Cyber-Systems/eden-platform-go" }],
+  ["devflow-claude", { repo: "AO-Cyber-Systems/devflow-claude" }],
+]);
 
 interface ActiveRepo {
   name: string;
@@ -194,8 +200,11 @@ describe("modules.yaml seed against the active-repo inventory", () => {
     });
   });
 
-  it("10. the extra keys are exactly the permanent canary health-check alias", () => {
-    expect([...EXTRA_KEYS.entries()]).toEqual([["canary", { repo: "AO-Cyber-Systems/eden-platform-go" }]]);
+  it("10. the extra keys are exactly the permanent canary health-check alias and the devflow-claude rename key", () => {
+    expect([...EXTRA_KEYS.entries()]).toEqual([
+      ["canary", { repo: "AO-Cyber-Systems/eden-platform-go" }],
+      ["devflow-claude", { repo: "AO-Cyber-Systems/devflow-claude" }],
+    ]);
     for (const key of EXTRA_KEYS.keys()) {
       expect(ALLOWED_NON_LEGACY.has(key), `${key} must not also be a non-legacy exception`).toBe(false);
       expect(key, `${key} must be a lowercase key`).toBe(key.toLowerCase());
````

The fixture is generated from the migration inventory (`inventory/AO-Cyber-Systems.repos.json`), which still lists `devflow-claude`. Refreshing that inventory belongs to the migration project.

## Solution

Do this only after the rest of the rename is complete and git.aocyber.ai is configured, and only with the user's explicit approval for the push and the PR.

1. Save the two patches above to files: `mapping.patch` (patch 1, starting at its `From` line) and `seed.patch` (patch 2).
2. The user logs in: `gh auth login --hostname aocyber.ghe.com`, then `gh auth setup-git --hostname aocyber.ghe.com`. If the vanity repo has moved hosts by then, use its new remote and `--repo`.
3. Clone it: `git clone https://aocyber.ghe.com/AOCyberAI-Ops/vanity.git <dir>`, then `git -C <dir> switch -c add-aoforge-claude`.
4. Apply patch 1: `git -C <dir> am <mapping.patch>`. If main moved past a34dfa2 and it no longer applies, redo the two added lines by hand, next to `devflow-claude`.
5. Apply patch 2: `git -C <dir> apply <seed.patch>`, stage the two test files, then commit `test(mapping): seed contract treats aoforge-claude as the renamed devflow-claude`. In this repo the commit needs the inline escape `AOFORGE_ALLOW_RAW_COMMIT=1 git -C <dir> commit ...`.
6. Check: `npm ci`, `npm test` (expect 155/155), `npm run typecheck`, `go test ./probe/...`.
7. With approval, push without force: `git -C <dir> push origin add-aoforge-claude`.
8. Open a draft PR: `gh pr create --repo aocyber.ghe.com/AOCyberAI-Ops/vanity --draft --base main --head add-aoforge-claude --title "Add aoforge-claude to the vanity mapping" --body-file <body>`.
   - The body covers: what and why (the rename); that the `devflow-claude` key stays and GitHub redirects it; the seed-contract commit and the stale inventory; the format note; the test results; that nothing deploys until a `v*` tag and the `production` environment approval; that the PR stays a draft. It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
   - Never merge it or mark it ready. The user reviews and merges, then tags.
9. Mark INST-06's vanity part done (objective 72 / REQUIREMENTS.md) once the draft PR URL is recorded.
