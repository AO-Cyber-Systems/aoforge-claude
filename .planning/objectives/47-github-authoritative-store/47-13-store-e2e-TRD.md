---
objective: 47-github-authoritative-store
trd: "13"
type: standard
wave: 5
depends_on: ["47-11", "47-12"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
  - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
autonomous: true
requirements: [GST-01, GST-02, GST-03, GST-04, GST-05, GST-06, GST-07, GST-08]
must_haves:
  truths:
    - "SC1: the fixture objective (3 TRDs, 2 waves) pushed with `gh sync 7` creates the objective issue, 3 TRD sub-issues, the blocked-by edge 07-03←07-01 and the wiki page; after deleting the cache files, `gh pull --all` regenerates them byte-identically, and a second pull writes nothing"
    - "SC2: with a 60,001-character TRD in the objective, `gh sync 7` is refused and the fake records zero calls — no issue of any kind exists afterwards"
    - "SC3: scope comments posted as n=2, n=1, n=3 give an effective spec ordered 1, 2, 3; `gh trd fold` on the closed TRD replaces the body with the effective spec and the spec-rev comment logs `fold folded_through=3` with before and after hashes"
    - "SC4: writes made while offline are queued (`gh outbox flush` exits 3, nothing written); after reconnecting they flush in enqueue order (exit 0); a human edit to a TRD body since the last pull halts the next flush (exit 2) with a report naming the issue, and nothing after the halt is written"
    - "SC5: on a user-owned repo without a wiki the same sync → pull round trip succeeds with labels + body `meta` instead of types/fields and `docs/devflow/` pages instead of the wiki, and the pulled cache is byte-identical"
    - "The suite is hermetic: no real GitHub, no network, no real `~/.claude`, no port 8080"
    - "The repo seam guard also covers `gh-store-cli.cjs` (no gh spawn, no git spawn, no direct `ghWrite`)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs
      provides: "objective 47 success criteria 1-5 end to end on one stateful fake GitHub and one local wiki remote"
  key_links:
    - "One `gh._setRunGh(fake.runGh)` drives gh.cjs, gh-pull.cjs, gh-store-cli.cjs and every gh-* module through the gh-client seam; the wiki store runs real local git against a `file://` bare repo"
---

# TRD 47-13: End-to-end store scenario — SC1 to SC5

<objective>
Prove objective 47's success criteria 1-5 through the public commands (`gh sync`, `gh pull --all`, `gh outbox`, `gh trd`) on one
stateful fake GitHub and one local wiki remote, with the fixture objective from 47-02. This is verification of behaviour already
built in waves 1-4, so it is test-only.

Purpose: SC1-SC5. Output: `gh-store-e2e.test.cjs`; fake fixes only if the scenario exposes a gap in the fake.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<!-- TDD-EXCEPTION: end-to-end verification TRD; the behaviour under test was built test-first in 47-01..47-12. A failing scenario here is
     a defect in an earlier TRD: fix it there (with its own failing unit test first) and record it in this TRD's SUMMARY. -->

## Binding rules

- Install the fake ONLY with `gh._setRunGh(fake.runGh)` (one call reaches every module via gh-client). Fake clock via `client._setNow/_setSleep`;
  `_resetClient()` in afterEach.
- `hermeticEnv()` for `HOME`, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR`, git isolation; `DEVFLOW_WIKI_REMOTE` → `createWikiRemote().remoteUrl`.
  A guard test snapshots the real `~/.claude/devflow/state` listing (via `os.userInfo().homedir`) before and after the suite.
- Commands are called in-process with the `capture()` harness (copied from `gh-e2e.test.cjs`); exit codes asserted from `capture().code`.
- If `git` is missing, the wiki cases skip with a visible reason; the docs-mode case (SC5) still runs.
- A defect found here is fixed in the owning module with a unit test first, committed separately (`fix(47-NN): ...`), then this scenario re-run.
- No property-based tests, no `.feature` files, no generated data, never port 8080.

## Decisions taken in planning

- **SC1 compare set (D-25).** Byte-compared after wipe + `pull --all`: `objectives/07-store-demo/OBJECTIVE.md`, `07-CONTEXT.md`, `07-RESEARCH.md`, the three
  TRD files, `07-01-alpha-SUMMARY.md`, `PROJECT.md`, `REQUIREMENTS.md`. Deleted before the pull: all of these. Kept: `.planning/config.json`.
  ROADMAP.md/STATE.md are generated views: the fixture's hand-written ROADMAP.md is NOT deleted and must be untouched (`hand_maintained`);
  STATE.md is absent in the fixture, so pull writes a generated one — asserted by header, not bytes.
- **SC4 remote-edit route.** Pull (refreshes bases) → `fake.humanEditBody(<07-02 number>, <changed body>)` → change `07-02-beta-TRD.md` locally →
  `gh sync 7` (enqueues the upsert) → the flush inside sync halts → `gh outbox status` names the issue → `gh outbox flush` exits 2.

## Test list

1. Hermetic guard: real `~/.claude/devflow/state` listing unchanged; no file outside temp dirs written.
2. SC1 push: `gh sync 7` (store on, org, wiki ok) exit 0 → fake: objective issue with label `devflow:objective`; `GET sub_issues` lists 7-01, 7-02, 7-03 in order;
   `GET .../7-03/dependencies/blocked_by` contains 7-01's id; TRD types `TRD`; objective fields `work=feature`, `kind=plugin`; wiki remote has
   `Objective-7-store-demo.md` (== OBJECTIVE.md), `Project.md`, `Requirements.md`, `Roadmap.md`; objective body `wiki` section pins the remote head sha.
3. SC1 pull: snapshot the compare set; delete it; `gh pull --all` exit 0 → every file byte-identical; `ROADMAP.md` untouched; generated `STATE.md` written.
4. SC1 idempotence: second `gh pull --all` → `written: []`; third `gh sync 7` → zero writes beyond 46's allowed idempotent set.
5. SC2: add `07-04-big-TRD.md` from `oversizedTrdText(60001, ...)` to a FRESH project → `gh sync 7` exit 1, `refused:'budget'` naming 7-04, `fake.calls()` empty, journal absent;
   at exactly 60,000 → sync succeeds with a budget warning.
6. SC3: after SC1 push, `gh trd scope 07-01 --n 2 @file:a`, then `--n 1 @file:b`, then `--n 3 @file:c` → `gh trd spec 07-01 --raw` lists applied `[1,2,3]` and text order b, a, c;
   close TRD 7-01 on the fake; `gh trd fold 07-01` exit 0 → TRD body decodes to body + b + a + c; spec-rev rows include `scope n=2`, `scope n=1`, `scope n=3`,
   `fold folded_through=3 from=<old hash>` with the new hash equal to `contentHash(new body)`; `gh trd spec` afterwards applies nothing.
7. SC4 offline: `fake.setOffline(true)`; `gh trd freeze 07-02` and `gh trd scope 07-03 @file:d` → each reports pending; `gh outbox flush` exit 3; `fake.writes()`
   unchanged; `gh outbox status --raw` shows the pending ops in seq order.
8. SC4 reconnect: `fake.setOffline(false)`; `gh outbox flush` exit 0; the fake's successful writes after reconnect occur in journal seq order (map each write to its op).
9. SC4 remote edit: route from Decisions → flush halts, exit 2, `gh outbox status` prose names `#<number>` and both resolve commands; zero writes after the halt;
   `gh outbox resolve <seq> --accept-remote` → exit 0 and the human body is kept.
10. SC5 degraded: fresh `makeStoreProject({ownerType:'User', hasWiki:false, store:true})` → `gh sync 7` exit 0; TRD issues labelled `devflow:trd` with `type:null`;
    objective body `meta` section (`type: Objective`, `work: feature`, `kind: plugin`); sub-issues and blocked-by native; `docs/devflow/Objective-7-store-demo.md`,
    `Project.md`, `Roadmap.md` exist; no `.planning/wiki/` clone.
11. SC5 pull: wipe the compare set (not `docs/devflow/`) → `gh pull --all` → byte-identical; capability report lists types, fields and wiki as degraded.
12. Uninitialised wiki: `hasWiki:true` + `DEVFLOW_WIKI_REMOTE` = missing path → `gh sync 7` issues/sub-issues created, flush halts at `wiki-push` with the
    "create the first wiki page in the web UI" message (exit code 0 from sync with `outbox:'halted'` warning; `gh outbox flush` exit 2); no `docs/devflow/` written.
13. Seam guard: `gh-store-cli.cjs` added to GUARDED in `gh-seam.repo.test.cjs`, and to the "never calls ghWrite" list; guard passes.

<tasks>

<task type="auto">
  <name>Task 1: Harness + SC1 and SC2 (tests 1-5)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs</files>
  <action>
Create `gh-store-e2e.test.cjs` with a header comment mapping tests to SC1-SC5 (style of `gh-e2e.test.cjs`). Shared setup: `hermeticEnv()`,
fake clock, `createWikiRemote()`, `makeStoreProject({store:true})`, `fake = createFakeGitHub(project.fakeOptions)`, `gh._setRunGh(fake.runGh)`.
Helpers: `sync(root, args)`, `pullAll(root, args)`, `outbox(root, args)`, `trd(root, args)` → `capture(() => cmd...)`; `snapshot(root, rels)` → `{rel: Buffer}`.
Implement tests 1-5. If the fake lacks a shape the scenario needs, add it to `gh-fake.cjs` with a `gh-fake.test.cjs`-style case noted in the SUMMARY
(do not add test cases to gh-fake.test.cjs — it is not in this TRD's files; describe the gap and the fix in the SUMMARY).
Commit `test(47-13): e2e SC1-SC2 for the authoritative store`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs</verify>
  <done>Tests 1-5 pass.</done>
</task>

<task type="auto">
  <name>Task 2: SC3, SC4, SC5 and the uninitialised wiki (tests 6-12)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs</files>
  <action>
Implement tests 6-12 with hand-written scope texts (`a`, `b`, `c`, `d` are short literal paragraphs written to temp files). For test 8, record
`fake.writes()` before reconnect, then assert the new writes' order matches the journal's done ops ordered by seq (map op → argv by route: `post-scope`
→ `api ... /comments`, `upsert-comment` → `api ... /comments` with `kind=spec-rev`). Commit `test(47-13): e2e SC3-SC5`.
Any failure → fix in the owning module test-first (separate commit), re-run the whole suite.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs</verify>
  <done>Tests 1-12 pass; 46's e2e still green.</done>
</task>

<task type="auto">
  <name>Task 3: Extend the seam guard to gh-store-cli (test 13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</files>
  <action>
Add `gh-store-cli.cjs` to `GUARDED` and to the "store modules never call ghWrite" list added by 47-12. Run the guard; if it fails, the CLI
is doing work the library should do — move it into the owning module (test-first, separate commit). Commit `test(47-13): guard gh-store-cli seam`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</verify>
  <done>Guard passes with gh-store-cli included.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</regression>
</validation_gates>

<verification>
- Each of SC1-SC5 maps to named tests (2-4, 5, 6, 7-9, 10-11).
- `rg -n "8080|api.github.com" plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs` → only the fake's offline stderr string, if any.
</verification>

<success_criteria>
The authoritative store round-trips a real-shaped objective through the public commands, refuses oversized TRDs before any issue
exists, keeps scope comments ordered, queues offline, halts on remote edits, and works the same on a degraded repo.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-13-store-e2e-SUMMARY.md`
</output>
