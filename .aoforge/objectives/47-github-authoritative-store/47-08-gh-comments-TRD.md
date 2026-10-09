---
objective: 47-github-authoritative-store
trd: "08"
type: tdd
wave: 2
depends_on: ["47-01", "47-02", "47-03", "47-05"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-comments.cjs
  - plugins/devflow/devflow/bin/lib/gh-comments.test.cjs
autonomous: true
requirements: [GST-03, GST-04]
must_haves:
  truths:
    - "A SUMMARY is enqueued as a `devflow:summary` comment on its TRD issue (marker `<!-- devflow:id=<trd> kind=summary -->`, then `<!-- devflow:file=<name> -->`, then the verbatim file); a VERIFICATION as a sticky `kind=verification` comment on the objective issue"
    - "`decodeFileComment(comments, id, kind)` rebuilds `{file, text}` byte-exactly, joining numbered parts in part order"
    - "A scope change is enqueued as `post-scope n=K` plus a `scope n=K` spec-rev entry; a scope comment over 60,000 chars, or one that would push the effective spec over 60,000, is refused with `overflow:true` and a message that the overflow becomes a new TRD"
    - "`freezeTrd` logs a `freeze` spec-rev entry with the current body hash; `foldTrd` on a closed TRD enqueues a body replace with the effective spec and a `fold` entry only when it fits, and reports `fits:false` otherwise (SC3 unit level)"
    - "`readEffectiveSpec` returns body + scope comments in `n` order, honouring `folded_through`"
    - "All writes are enqueued in the outbox; this module performs reads only"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-comments.cjs
      provides: "fileCommentText, decodeFileComment, enqueueSummary, enqueueVerification, enqueueScope, freezeTrd, foldTrd, readTrdState, readEffectiveSpec, detectTrdDrift"
  key_links:
    - "47-07 executes the upsert-comment / post-scope / patch-body ops these functions enqueue; 47-10 uses decodeFileComment on pull; 47-11 `gh trd freeze|fold|spec|scope` and 47-12 sync call enqueueSummary/enqueueVerification"
---

# TRD 47-08: SUMMARY / VERIFICATION comments, scope changes, freeze and fold (GST-03, GST-04)

<objective>
Create `lib/gh-comments.cjs`: the comment protocol on top of the 47-01 codec. It enqueues SUMMARY and VERIFICATION comments,
scope-change comments with the scope-change budget, and the `freeze` / `fold` lifecycle of a TRD's spec, and it reads TRD state
back (body, scope comments, spec-rev) to compute the effective spec and drift.

Purpose: GST-04 and the GitHub-facing half of GST-03. Output: module + tests. All writes go to the outbox (47-03); reads go
through gh-client.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- No `ghWrite` in this module (static check). Reads via `client.ghRead` / `client.ghPaginate` only.
- Tests: `makeStoreProject()` + `hermeticEnv()` + `createFakeGitHub()` installed via `_setRunGh`; seed TRD issues with
  `fake.seedIssue` carrying the 47-01 body header and set mapping `trds` via `setTrd`; assert on the journal (`gh-outbox.readJournal`)
  and on the fake's (absent) writes.
- No property-based tests, no generated data, never port 8080.
- Research reference: `47-RESEARCH.md` → Pattern 1 (scope comments, spec-rev, fold, frozen), Pitfalls 4, 5.

## Decisions taken in planning

- **D-04 Oversized comments.** `upsert-comment` payload `text` = `fileLine(file) + '\n' + verbatim content`; the flusher (47-07) splits it
  into parts. `decodeFileComment` reverses it (strip marker line, `joinParts`, read the file line).
- **Scope budget.** `enqueueScope` reads the TRD state and refuses when `buildScopeComment` overflows OR the effective spec including the
  new comment would exceed 60,000 chars (proposal: "the overflow becomes a new TRD"; the TRD-creating verb is objective 48).
- **Scope `n`.** Caller may pass `n`; default = (highest existing scope `n`) + 1, computed from a fresh read. Existing `n` with identical text →
  no-op; existing `n` with different text → refused (`n=K already used`).
- **D-03 Fold on close.** `foldTrd` requires the TRD issue to be `closed` (`{force:true}` overrides for tests/manual use); scope errors (gaps,
  duplicates) refuse the fold. The enqueued `patch-body` is `{mode:'replace', body:newBody}`; the flusher's remote-edit check (D-24) guards it.
- **Freeze.** `freezeTrd` is idempotent (spec-rev append dedupes event+hash). Wiring it into execute start is objective 49's lifecycle work;
  47 exposes it as a library call and the `gh trd freeze` verb (47-11).
- **spec-rev entries** for scope: `event:'scope n=K'`, `hash` = contentHash of the encoded effective spec after the scope comment, `chars` its length.

<embedded_context>

<codebase_examples>
Comment marker helpers (`gh-body.cjs:69`, `:118`): `commentMarker(id, kind)` → `<!-- devflow:id=${id} kind=${kind} -->`;
`withCommentMarker(id, kind, text)`. 47-05 adds `findCommentsByMarker(comments, id, kind)` → `[{comment, part, of}]` in part order.
Paginated comment read (46 pattern, `gh-client.cjs:293`): `client.ghPaginate(\`repos/${repo}/issues/${n}/comments\`)` → `{ok, items}`.
Codec (47-01): `contentHash`, `fileLine`, `parseFileLine`, `decodeTrdBody`, `buildScopeComment`, `parseScopeComments`, `effectiveSpec`,
`parseSpecRev`, `planFold`, `detectDrift`, `joinParts`, `TRD_MAX_CHARS`.
Enqueue (47-03): `outbox.enqueue(root, [{kind:'upsert-comment', target:{id, kind:'summary'}, payload:{mode:'replace', text}}], {now})`.
</codebase_examples>

<anti_patterns>
- Posting directly with ghWrite "because it is just a comment" — every write is an outbox op.
- Ordering scope comments by time; deleting scope comments after a fold.
- Trimming a SUMMARY to fit; splitting is the flusher's job and is lossless.
</anti_patterns>

<error_recovery>
- TRD not in the mapping and not found by marker scan → `{ok:false, error:'TRD 07-01 has no issue yet; run gh sync first'}`.
- spec-rev comment missing → treated as an empty log (not an error).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/47-01-gh-trd-codec-TRD.md
@.planning/objectives/47-github-authoritative-store/47-03-gh-outbox-store-TRD.md
</context>

<gotchas>
- `readTrdState(root, trdId)` → `{number, state, body, comments, scopes, specRevText, frozen, foldedThrough}` with ONE issue GET and ONE paginated
  comments read; reuse it in every function here.
- The verification comment targets the OBJECTIVE id (`7`), not a TRD id.
- Effective-spec measurement uses the encoded body (`encodeTrdBody`) so it matches the 60K rule exactly.
</gotchas>

## Test list

1. `fileCommentText('07-01-alpha-SUMMARY.md', text)` → file line + `\n` + text; `decodeFileComment` on a one-part comment list returns `{file, text}` exactly.
2. `decodeFileComment` on 3 part comments given out of order → joined in part order; a missing part → `{ok:false, missing:[2]}`; superseded parts ignored.
3. `enqueueSummary(root, {trdId:'07-01', file, text})` → one `upsert-comment` op `{id:'7-01', kind:'summary'}`; zero gh writes.
4. `enqueueVerification(root, {objectiveId:'07', file:'07-VERIFICATION.md', text})` → op target `{id:'7', kind:'verification'}`.
5. `enqueueScope` default `n` = max existing + 1 (fake seeded with n=1,2 → 3); enqueues `post-scope` then `upsert-comment append-spec-rev` with event `scope n=3`.
6. Scope text of 60,001 chars → `{ok:false, overflow:true}`, nothing enqueued.
7. Body 50,000 + existing scopes 9,000 + new 2,000 → effective over 60K → `{ok:false, overflow:true, message:/new TRD/}`.
8. Existing `n=2` with identical text → no-op; different text → `{ok:false, error:/n=2 already used/}`.
9. `freezeTrd` → append-spec-rev op with `event:'freeze'`, `hash === contentHash(body)`; calling twice enqueues once (coalesced or deduped).
10. `foldTrd` on a closed TRD with scopes 1..3 that fit → `patch-body replace` op whose body decodes to body text + scopes in order, then a `fold folded_through=3` spec-rev op.
11. `foldTrd` on an open TRD → refused; with `{force:true}` proceeds.
12. `foldTrd` when the effective spec exceeds 60K → `{ok:true, fits:false}`, nothing enqueued.
13. `foldTrd` with a scope gap → `{ok:false, error:/gap/}`.
14. `readEffectiveSpec` after a fold (spec-rev `folded_through=3`, new scope n=4) → body + n=4 only.
15. `detectTrdDrift`: body hash equals last spec-rev hash → no drift; `fake.humanEditBody` → drift with both hashes.
16. Static: `rg -n "ghWrite" gh-comments.cjs` → none.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: File comments — SUMMARY and VERIFICATION (tests 1-4, 16)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-comments.cjs, plugins/devflow/devflow/bin/lib/gh-comments.test.cjs</files>
  <action>
RED: tests 1-4, 16. Commit RED.
GREEN: `fileCommentText(file, text)`, `decodeFileComment(comments, id, kind)` (uses `findCommentsByMarker` + `joinParts` + `parseFileLine`),
`enqueueSummary(root, {trdId, file, text, now})`, `enqueueVerification(root, {objectiveId, file, text, now})`. Ids canonicalised with
`gh-mapping.toTrdId` / `toObjectiveId`. Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs</verify>
  <done>Tests 1-4 and 16 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TRD state reads, scope changes, freeze, fold, drift (tests 5-15)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-comments.cjs, plugins/devflow/devflow/bin/lib/gh-comments.test.cjs</files>
  <action>
RED: tests 5-15, seeding TRD issues and comments in the fake (hand-written scope comment bodies). Commit RED.
GREEN: `readTrdState(root, trdId)`, `readEffectiveSpec(root, trdId)`, `enqueueScope(root, {trdId, n?, text, now})`,
`freezeTrd(root, trdId, {now})`, `foldTrd(root, trdId, {now, force})`, `detectTrdDrift(root, trdId)`.
Approach for enqueueScope:
1. `st = readTrdState`; `n = arg ?? max(st.scopes.n) + 1`; duplicate handling per Decisions.
2. `c = buildScopeComment(n, text)`; overflow → refuse.
3. `eff = effectiveSpec(decode(st.body).text, [...st.comments, {id: Infinity, body: c.body}], {foldedThrough, id, file})`; `eff.overflow` → refuse.
4. Enqueue `post-scope` then `append-spec-rev {event:'scope n='+n, hash: contentHash(encoded effective), chars}` in ONE `enqueue` call.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs</verify>
  <done>Tests 1-16 pass; the fake records zero writes across the suite.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "ghWrite" plugins/devflow/devflow/bin/lib/gh-comments.cjs` → no matches.
- Tests 10 and 14 demonstrate SC3 (fold logged; effective spec ordered) at unit level.
</verification>

<success_criteria>
SUMMARY, VERIFICATION, scope, freeze and fold all flow through the outbox with one comment protocol that reads back byte-exactly.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-08-gh-comments-SUMMARY.md`
</output>
