---
objective: 49-objective-branch-and-pr-lifecycle
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-trd.cjs
  - plugins/devflow/devflow/bin/lib/gh-trd.test.cjs
autonomous: true
requirements: [GPR-05]
must_haves:
  truths:
    - "`parseScopeComments` carries `author` (comment `user.login`) and `comment_id` for every scope; existing fields and order are unchanged"
    - "`parseScopeConfirms(comments)` returns `[{n, hash, author, comment_id}]` from `<!-- devflow:scope-confirm n=K hash=H -->` markers"
    - "`scopeAcceptance({assignees, appLogin, devflowScopes, confirms})` returns a pure predicate: a scope is accepted iff its author is an assignee, OR its author is `appLogin`, OR `devflowScopes` has a row for its n whose `scope_hash` equals the scope's CURRENT content hash, OR a confirm from an assignee names its n AND its current content hash, posted after it"
    - "`devflowScopesFrom(parseSpecRev(...))` returns `[{n, hash}]` from spec-rev events `scope n=K scope_hash=H`; a legacy `scope n=K` row with no `scope_hash` yields no entry (not trusted)"
    - "`effectiveSpec(text, comments, {accept})` applies only accepted scopes and returns `pending:[{n, author, comment_id}]`; with no `accept` option its output is identical to today's"
    - "A scope edited after confirmation (hash mismatch) is pending again; a DevFlow-posted scope edited on GitHub by anyone (hash no longer matches its spec-rev row) is pending too"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-trd.cjs
      provides: "author-aware scope parsing, confirm-marker parser and builder, scopeAcceptance predicate, accept option on effectiveSpec"
  key_links:
    - "Consumed by 49-06 (gh-comments gathers assignees, spec-rev rows, confirms; `gh trd confirm-scope` builds the marker)"
---

# TRD 49-03: Scope-change acceptance, the pure half (GPR-05)

<objective>
Today any comment carrying `<!-- devflow:scope n=K -->` changes a TRD's effective spec, whoever wrote it. Make acceptance explicit and
pure: carry the author, parse assignee confirmations, and let `effectiveSpec` apply only accepted scopes while reporting the rest as pending.

Purpose: GPR-05 ("only the objective's assignee or DevFlow; others are shown, pending assignee confirmation"). Output: gh-trd changes,
no I/O (gh-trd stays pure).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-03): ...`), then implementation (`feat(49-03): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- gh-trd stays pure: no requires of gh-client, no fs. It is in `NO_DIRECT_WRITE` (seam guard).
- Back-compat: every existing gh-trd test passes untouched; `effectiveSpec` without `accept` is byte-identical.
- Hand-written comment fixtures (`{id, user:{login}, body, created_at}`); never real GitHub; never port 8080.

## Decisions (GPR-05 mechanism, Claude's discretion, documented here)

- **DevFlow-authored scopes** are recognised by a spec-rev row, not by login (locally DevFlow posts with the developer's own token, so
  the author is a person). The row binds the scope's content: event `scope n=K scope_hash=H`, `H = scopeHash(scope text)`, written by
  `enqueueScope` (49-06). The row's existing `hash` column keeps its meaning (hash of the effective spec). Matching by n alone would let
  anyone with write access edit a DevFlow scope comment and have the edit applied, so a hash mismatch makes the scope pending.
- **Legacy rows** (`scope n=K` without `scope_hash`, written before objective 49) are not trusted: those scopes need an assignee author
  or a confirm. Recorded as a behaviour change in the SUMMARY.
- **App login** (`github.app_login`, absent by default) counts as DevFlow for the objective 50 Action.
- **Confirm marker** `<!-- devflow:scope-confirm n=K hash=H -->`, where `H = contentHash(scope text)` (the existing gh-body hash). Binding
  the hash means a later edit of the scope comment drops it back to pending.
- **Order**: a confirm counts only if its `created_at` (or id order when equal) is after the scope comment.
- **No assignee**: only DevFlow/App scopes are accepted; confirmation then needs `--force` in 49-06 (logged override).

## Test list

1. `parseScopeComments` on two scope comments by `alice`/`mallory` → entries include `author` and `comment_id`; old fields unchanged.
2. `parseScopeConfirms` extracts `{n:2, hash:'abc', author:'alice', comment_id:9}`; ignores malformed markers (missing hash, n=0).
3. `buildScopeConfirm({n, hash, note})` → text starting with the marker line; round-trips through `parseScopeConfirms`.
4. Predicate: author in assignees → accepted.
5. Predicate: author `mallory` not assignee, no confirm → pending.
6. Predicate: `devflowScopes:[{n:3, hash:scopeHash(scope3)}]`, author `bob` not assignee → accepted.
6a. Predicate: same row, but scope 3's text was edited after posting (hash differs) → pending (edited DevFlow scope is not applied).
6b. `devflowScopesFrom` parses `scope n=3 scope_hash=ab12` → `[{n:3, hash:'ab12'}]`; legacy `scope n=3` → `[]`; `fold through 2` → `[]`.
7. Predicate: author equals `appLogin` → accepted; `appLogin` undefined never matches a missing login.
8. Predicate: confirm by assignee with matching hash after the scope → accepted; confirm by a non-assignee → pending; confirm with stale
   hash → pending; confirm older than the scope → pending.
9. `effectiveSpec(text, comments, {accept})` with scopes n=1 (accepted), n=2 (pending), n=3 (accepted) → text has 1 and 3 only,
   `applied:[1,3]`, `pending:[{n:2, author:'mallory', comment_id}]`, `chars` counts only applied.
10. `effectiveSpec` without `accept` → deep-equal to today's output for the same input (pin with a snapshot of the current return).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Authors, confirm markers and the acceptance predicate (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-trd.cjs, plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</files>
  <action>
RED: tests 1-8 (with 6a, 6b) in `describe('49-03 scope acceptance')`; commit `test(49-03): scope authors and acceptance`.
GREEN: extend `parseScopeComments` (L377) with `author: c.user && c.user.login || null` and `comment_id: c.id`; add
`parseScopeConfirms`, `buildScopeConfirm`, `scopeHash(scopeText)` (reuse `contentHash` over the normalised scope text),
`devflowScopesFrom(specRev)`, `scopeEvent(n, hash)` (builds `scope n=K scope_hash=H` for 49-06) and
`scopeAcceptance({assignees = [], appLogin = null, devflowScopes = [], confirms = []})` returning `(scope) => 'accepted'|'pending'`.
Commit `feat(49-03): scope acceptance predicate`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</verify>
  <done>Tests 1-8 pass; existing gh-trd tests unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `accept` option on effectiveSpec (tests 9-10)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-trd.cjs, plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</files>
  <action>
RED: test 10 first as a characterization snapshot (expected to pass on today's code; commit it with test 9 failing):
`test(49-03): effectiveSpec pending scopes`.
GREEN: `effectiveSpec` (L437) takes `accept`; when present, skips pending scopes and adds `pending`; when absent, returns exactly the
current shape (no `pending` key). Commit `feat(49-03): effectiveSpec applies only accepted scopes`. Run gh-* suite.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs && node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</verify>
  <done>Tests 9-10 pass; gh-* suite green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-trd.cjs`: `parseScopeComments` L377, `effectiveSpec` L437, `parseSpecRev` L516 (entries `{rev, at, event, hash, chars}`; `devflowScopesFrom` reads `event`), `splitParts` L746.
- `gh-comments.cjs` L408 today writes `event: scope n=K` with `hash` = effective-spec hash; 49-06 switches the event to `scopeEvent(n, scopeHash)`.
- `gh-comments.cjs` `enqueueScope` L362 shows how DevFlow writes a scope plus its spec-rev row.
</codebase_examples>
<anti_patterns>
- Reading assignees inside gh-trd (I/O belongs in gh-comments, 49-06).
- Trusting a confirm without the hash binding: an edited scope would ride on an old approval.
</anti_patterns>
<error_recovery>
- If the module has no content-hash helper in scope, import gh-body's (`contentHash`) — gh-body is pure too.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` green.
</verification>

<success_criteria>
Given a TRD's comments and its objective's assignees, DevFlow can tell which scope changes apply and which wait for confirmation, without I/O.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-03-SUMMARY.md`
</output>
