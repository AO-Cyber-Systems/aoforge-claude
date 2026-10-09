---
objective: 44-autonomy-hardening
trd: "05"
subsystem: hooks
tags: [stop-hook, autonomy, auto-continue, classifier, tdd]
requirements: [AUT-06]
dependency-graph:
  requires:
    - "gate-edits.js hasSkillActiveMarker / findPlanningDir / sharedPlanningDir (read-only, TRD 27-01)"
  provides:
    - "plugins/devflow/hooks/auto-continue.js — Stop hook: finalParagraph, isQuestionToUser, isHandoffToUser, isWaitingOnBackground, announcedAction, hasRunningBackground, decide, reasonFor"
    - "plugins/devflow/hooks/__fixtures__/stop-fixtures.js — stopPayload, writeSkillMarker, makeWorktreeWithMainMarker, ANNOUNCE / NOT_ANNOUNCE corpus"
  affects:
    - "44-09 (registers the hook under Stop in hooks.json and documents it)"
    - "44-01 (yolo-between-waves removes 'on your word' asks at the source; this hook catches the residue)"
tech-stack:
  added: []
  patterns:
    - "Stop hook once-guard via stop_hook_active (no counter file)"
    - "Lazy require of gate-edits helpers so a moved file fails open"
    - "Hand-written labelled message corpus driving one test() per label"
key-files:
  created:
    - plugins/devflow/hooks/auto-continue.js
    - plugins/devflow/hooks/auto-continue.test.js
    - plugins/devflow/hooks/__fixtures__/stop-fixtures.js
  modified: []
decisions:
  - "Classifier reads only the LAST sentence of the final paragraph (except the unambiguous 'Ready for wave N … on your word', which may appear anywhere in it)"
  - "`Now` counts only before a gerund / I'll / I will / I'm <gerund> / let me / let's / to / for / on to; `Next` only as `Next,` / Next I'll / Next let me / Next <gerund> — never `Next:`, `Next steps`, `Next up`"
  - "Gerund-led sentences carrying a finite verb or an `N pass/fail` result are reports, not announcements"
  - "A `/devflow:` command anywhere in a final paragraph that says `Next` is a hand-off to the user"
  - "Any background task whose status is not a recognised terminal state counts as running (fail toward no block)"
  - "decide() ignores non-Stop events so it can never double up with the 44-02 SubagentStop gate"
metrics:
  duration: "~10 min"
  completed: 2026-09-29
  tasks: 3
  files: 3
tokens_input: 3580515
tokens_output: 65726
tokens_cache_read: 3469363
tokens_cache_write: 111078
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 44 TRD 05: Auto-continue Stop hook Summary

**What shipped:** a Stop hook that blocks once, via the verified `stop_hook_active` guard, when a live skill marker exists, no background task is running, and the final paragraph's last sentence announces the model's own next step ("Writing the predicate.", "Ready for wave 4 on your word."). Its reason hands that step back to the model. A narrow classifier stays silent on questions, `/devflow:` hand-offs, waits and reports. 26 hand-written negatives cover those cases.

## Progress

- [x] Task 1: Stop fixture builders + hand-written message corpus — 1377186
- [x] Task 2: announcedAction classifier + hasRunningBackground — RED 5c37063 + ab27e73 (exit 1), GREEN 6fda26b (65/65)
- [x] Task 3: decide() + main() wired to the live-marker check — RED 85170b6 (exit 1), GREEN fbe4846 (189/189 incl. gate-edits + verify-completion)
- [x] Wave gate (npm test): only the known pre-existing failures
- [x] Final SUMMARY

## What was built

`plugins/devflow/hooks/auto-continue.js` checks these conditions in order. The first one that fails means no block:

1. `DEVFLOW_SKIP_AUTOCONTINUE` is `1` (or `true`), so the hook is skipped.
2. `stop_hook_active` is truthy. This is the once-guard.
3. `hook_event_name` is present and is not `Stop`. The hook serves only the main loop.
4. The gate-edits helpers fail to load. The hook fails open.
5. There is no `.planning/` (`findPlanningDir(payload.cwd || cwd)`).
6. The marker is not live (`hasSkillActiveMarker(planningDir, sharedPlanningDir(cwd))`). This checks both the local and the main-checkout marker, with expiry.
7. `hasRunningBackground(background_tasks)`.
8. `announcedAction(last_assistant_message)` is null.

When every check passes, stdout is exactly `{"decision":"block","reason":"DevFlow auto-continue: you announced \"<≤120 chars>\" and then ended your turn. Take that step now, in this turn. If you actually need the user's input, ask one explicit question instead of announcing. Never use port 8080."}`. Any exception produces no output and exit 0. `main()` deliberately does not call `process.exit()`, because on macOS a pipe write is async and exiting early could truncate the JSON.

How `announcedAction` classifies a message:
- It takes the **final paragraph**: trailing whitespace and trailing fenced blocks are stripped, then it keeps the text after the last blank line.
- **Vetoes:** the paragraph is rejected outright if any of these match:
  - `isQuestionToUser`: a `?` ends the last line or any sentence (a URL `?query` does not count), or an ask phrase appears. The phrases are: should I / shall I / do you want / would you like / would you prefer / would you rather / do you prefer / want me to / let me know / can you / could you / please / your call / up to you / over to you / if you'd like / if you want / you('ll) need to / need you to / needs your. "On your word" is deliberately absent.
  - `isHandoffToUser`: the paragraph contains `/devflow:` and matches `Next` (Next Up / Next: / Next step / Next, run …).
  - `isWaitingOnBackground`: wait(ing) for/on/until / in the background / task notification / once|when|after <it|they|the X> finishes|completes|reports|lands|returns.
- **Match:** `Ready for wave \d+[^.\n]*on your word` anywhere in the paragraph, otherwise the paragraph's LAST sentence (with leading and trailing `*`/`_` emphasis stripped) must be one of the case-sensitive sentence-start forms `Now …`, `Next …`, `Running …`, `Writing …` or `Starting wave …`, subject to the narrowing listed in decisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical: false-positive hardening] Classifier narrowed beyond the TRD's literal rule**
- **Found during:** Task 2 (designing against real phrasing, per the dispatch's "false positives are the main risk")
- **Issue:** The TRD's literal rule is "the final paragraph contains a sentence starting `Now`/`Next`/`Running`/`Writing`/`Starting wave`" plus the TRD's question/hand-off regexes. That rule blocks on common completion and recommendation shapes:
  - `Now all 412 tests pass.`
  - `Now nothing is left to do.`
  - `Next steps:\n- Tag v2.12.0` (no slash command)
  - `Next, run /devflow:verify-work 44` (misses the TRD hand-off regex, which only covers `Next Up|:| step`)
  - `Running the suite showed three failures.`
  - `Now running the full suite: 412 pass, 0 fail.`
  - `Now running the full suite. All 412 pass.`
  - `Now waiting for their task notifications.`
  - `Running the Flutter tests needs a booted emulator. Can you boot one?` (caught by `?`, but its ask-phrase equivalents were not)
- **Fix:**
  - Only the last sentence of the final paragraph counts.
  - `Now` and `Next` require an action continuation.
  - The NOT_GERUND list excludes `nothing`/`something`/`bring`/`string` and similar words.
  - A REPORT_RE rejects gerund-led sentences that carry a finite verb or an `N pass/fail` result.
  - A wait veto was added.
  - The ask-phrase list was widened.
  - The hand-off check accepts any `Next` + `/devflow:`.
- **Accepted trade-off:** some genuine announcements now go unflagged, e.g. "Writing the predicate. It lives in lib/x.cjs." and "Running npm test, which takes 3 min." A missed auto-continue costs one human nudge. A wrong block makes the model act without permission.
- **Files modified:** plugins/devflow/hooks/auto-continue.js
- **Commit:** 6fda26b

**2. [Rule 2 - Missing critical] Non-Stop events are ignored**
- **Found during:** Task 3
- **Issue:** If the hook were ever co-registered under SubagentStop, it would double-block executors alongside the 44-02 completion gate.
- **Fix:** `decide()` returns null when `hook_event_name` is present and is not `Stop`. A unit test covers this.
- **Files modified:** plugins/devflow/hooks/auto-continue.js
- **Commit:** fbe4846

**3. [Rule 2 - Missing critical] Unrecognised background statuses count as running**
- **Found during:** Task 2
- **Issue:** Only `running` was specified. A `pending`/`queued` task, or an entry with no status, would otherwise let the hook block while work is outstanding.
- **Fix:** A task counts as running unless its status is in a terminal set (completed, failed, error, killed, cancelled, stopped, timed_out, …). A unit test covers `pending`.
- **Files modified:** plugins/devflow/hooks/auto-continue.js
- **Commit:** 6fda26b

**4. Corpus extended past the TRD list, in its own RED commit**
- The TRD items 6 and 7 are verbatim (labels `trd-6a..f`, `trd-7a..h`).
- 7 more ANNOUNCE and 18 more NOT_ANNOUNCE entries were added, labelled `real-*`. They are modelled on 44-EVIDENCE §1 row 4 / §3.3, the ui-brand.md Next Up block, the executor completion format and checkpoint asks.
- Final counts: 14 ANNOUNCE / 26 NOT_ANNOUNCE. The TRD minimum is 6 / 8.
- The report-shaped negatives were committed (ab27e73) before any implementation existed.

**5. Task 1 verify path**
- The TRD's Task 1 `<verify>` requires the MAIN checkout path (`/Users/justin/dev/devflow-claude/...`), which another session owns. I ran it against the worktree path instead: `13 22` at the time, now `14 26`.

**6. Escape hatch accepts `true` as well as `1`.** This is additive, and the test covers `1`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Stop fixtures + corpus | `node -e "const f=require('<worktree>/plugins/devflow/hooks/__fixtures__/stop-fixtures.js'); console.log(f.ANNOUNCE.length, f.NOT_ANNOUNCE.length)"` → `13 22` (now 14 26) | 0 | PASS |
| 2: announcedAction + hasRunningBackground | `node --test plugins/devflow/hooks/auto-continue.test.js` → 65/65 | 0 | PASS |
| 3: decide() + main() | `node --test plugins/devflow/hooks/auto-continue.test.js plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/verify-completion.test.js` → 189/189 | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2, 5c37063) | `node --test plugins/devflow/hooks/auto-continue.test.js` | 1 (`Cannot find module './auto-continue.js'`) | FAIL (correct) |
| RED (Task 2 extra negatives, ab27e73) | committed before any implementation file existed | n/a | FAIL (correct) |
| GREEN (Task 2, 6fda26b) | `node --test plugins/devflow/hooks/auto-continue.test.js` | 0 (65/65) | PASS (correct) |
| RED (Task 3, 85170b6) | `node --test plugins/devflow/hooks/auto-continue.test.js` | 1 (`decide is not a function`; the e2e block cases got empty stdout) | FAIL (correct) |
| GREEN (Task 3, fbe4846) | `node --test auto-continue + gate-edits + verify-completion` | 0 (189/189) | PASS (correct) |
| REFACTOR | none needed | — | — |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | — | N/A |
| test | `node --test plugins/devflow/hooks/auto-continue.test.js` | 0 | PASS |
| wave | `npm --prefix <worktree> test` → 5198 tests, 5138 pass, 10 fail, 50 skipped | 1 | PASS (all 10 failures are known and pre-existing: devflow-watch ×3 and handoff-e2e ×6 [node-pty missing in worktrees], roadmap-reconcile E2E1 ×1) |

## Post-TRD Verification

- Auto-fix cycles used: 0 (every GREEN passed on its first run after one self-caught index bug in `Now I am <gerund>`, fixed before the first test run)
- Must-haves verified: 5/5
  1. Block exactly when marker live + `stop_hook_active` false + nothing running + announcement: e2e tests 1, 2, 3a/3b, 4a/4b/4c
  2. Announcement forms (Now / Next, / Running / Writing / Starting wave / Ready … on your word): the ANNOUNCE corpus
  3. Questions, ask phrases and the `/devflow:` hand-off never fire: the NOT_ANNOUNCE corpus plus two e2e false-positive guards
  4. The reason quotes ≤120 chars and says to take the step now or ask one question: decide exact-text and long-announcement tests
  5. The escape hatch, fail-open behaviour and the no-DevFlow-project case: e2e 5a-5d and the decide loadHelpers-throws test
- Gate failures: none. The wave-gate failures are the known pre-existing set.
- Scope respected: hooks.json, gate-edits.js, verify-completion.js, STATE.md and ROADMAP.md are untouched. There was no version bump, tag or push, and nothing used port 8080.

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/auto-continue.js
- FOUND: plugins/devflow/hooks/auto-continue.test.js
- FOUND: plugins/devflow/hooks/__fixtures__/stop-fixtures.js
- FOUND commits on df/exec-44-05: 1377186, 5c37063, ab27e73, 6fda26b, 85170b6, fbe4846
- `git diff --stat c88f347..HEAD` lists only the three planned files plus this SUMMARY
- Worktree clean after the full `npm test` run (no stray files)
