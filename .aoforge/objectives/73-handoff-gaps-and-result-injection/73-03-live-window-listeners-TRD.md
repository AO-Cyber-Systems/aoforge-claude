---
objective: 73-handoff-gaps-and-result-injection
trd: "03"
type: standard
wave: 2
depends_on: ["73-01"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs
  - plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs
autonomous: true
requirements: [HND-01]
must_haves:
  truths:
    - "Gap 3 (detector late match) is closed: text matching a secret's prompt regex that appears only after the dispatched command has exited never makes the daemon inject anything, neither Ctrl+C nor the secret, and never adds `secret resolution failed`; proven by a test that failed on the pre-73 code"
    - "`attachDataListener(fn, { liveOnly: true })` delivers only the active dispatch's live window. In-band protocol (bash/zsh PTY script): the bytes after the BEGIN line up to DELIM. Replay protocol (pipe mode, fish, powershell): the bytes from the start of the dispatch up to BEGIN. Never sentinel text, never bytes from before the dispatch or between dispatches; a marker split across two chunks is held back, not leaked"
    - "A listener attached without options sees every chunk exactly as before (DL-1 to DL-8 unchanged)"
    - "processOnce attaches the prompt detector with `{ liveOnly: true }`"
    - "A secret resolved from env and injected at a live PTY prompt is consumed by the command (`got=` line) and redacted from the done record; an unresolvable secret at a live prompt fails the dispatch promptly (no timeout) with `secret resolution failed`"
    - "In handoff-e2e.test.cjs, MA-6-synth asserts success and MA-7 asserts a failed (never timed-out) dispatch with the resolution message; no test skips on an architectural gap any more, and the only remaining skips are node-pty or doctl being absent"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs
      provides: "liveOnly data listeners; makeLiveFilter({ begin, delim, protocol }) pure filter"
      exports: ["ShellSession", "ShellSessionClosed", "splitDispatchOutput", "sentinelMarkers", "makeLiveFilter"]
    - path: plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs
      provides: "detector attached live-only"
    - path: plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs
      provides: "MA-6-synth / MA-7 / MA-6 as assertions, gap header marked closed"
  key_links:
    - from: "watcher-daemon.cjs processOnce"
      to: "ShellSession.attachDataListener(detector, { liveOnly: true })"
      via: "the detector only ever sees live bytes"
      pattern: "liveOnly: true"
    - from: "ShellSession._emitExtData"
      to: "makeLiveFilter"
      via: "one filter per active dispatch, shared by every liveOnly listener"
      pattern: "makeLiveFilter\\("
---

# TRD 73-03: Listeners see only the live command, so a late match never fires (gap 3)

<objective>
Gap 3 (`19-05-mock-auth-e2e-SUMMARY.md`, "Gap 3"): the daemon's prompt detector scans every byte the shell emits
during a dispatch, including the replay of the captured stderr that the wrapper prints after the command has exited.
doctl's error text "Unable to read DigitalOcean access token" matches the `access token` prompt regex, so the detector
"answers" a prompt that is already gone: it injects Ctrl+C (or worse, the resolved secret, which then lands on the
shell's input) and records a false "secret resolution failed". Before 73-01 that Ctrl+C also hung the wrapper.

73-01 moved bash/zsh PTY output in-band, so the replay is gone there, but the replay protocol still runs in pipe mode and
for fish and powershell, and the detector still sees pre-BEGIN residue and sentinel lines. The fix is at the source of
the bytes: a listener can ask for the live window only (`{ liveOnly: true }`), and the session knows where that window
is for each protocol. processOnce attaches the detector that way. Listeners that do not ask keep today's behaviour.

Then the e2e tests that have skipped on the three gaps since objective 19 become real assertions.

Purpose: HND-01 (gap 3) and the end-to-end proof that all three gaps are closed. 73-05's attended terminal mirror uses
the same `liveOnly` listener.
Output: `makeLiveFilter` and liveOnly listeners in `watcher-shell.cjs`, the detector attached live-only, the gap
regression tests (RED then GREEN), MA-6-synth / MA-7 / MA-6 rewritten.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, no property-based libraries, no
`.feature` files.

Read 73-01's SUMMARY first (`.aoforge/objectives/73-handoff-gaps-and-result-injection/73-01-SUMMARY.md`): it records
`sentinelMarkers`, the script protocol, and the MA-* outcomes it observed.

Read narrowly:
- `plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs`: `attachDataListener` 123, `detachDataListener`, `_emitExtData`
  152, PTY `onData` and pipe `stdout`/`stderr` handlers in `spawn`, `dispatch` (now with the PTY script branch from
  73-01), `_tryComplete`.
- `plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs`: `_makePromptDetector` 137-169, `processOnce` 208 (detector
  attach 265-279, dispatch 289-312), exports 432.
- `plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs`: `makeTokenSession` 280, token-passing group 312-680.
- `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`: data-listener group (DL-1..DL-8, ~316-437).
- `plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs`: MA header 389-440, describe 444, mock lifecycle 546-615,
  `isArchitecturalGap` 710, `tryWaitForDoneRecord` 721, MA-6-synth 726, MA-7 799, MA-6 870.
- Baseline of the e2e file before objective 73: 13 tests, 10 pass, 3 skipped (MA-6-synth, MA-7, MA-6, each on a gap).
</context>

## Test list

Outermost first: the e2e daemon pipeline, then processOnce with a real session, then the session, then the pure filter.

**e2e** (`handoff-e2e.test.cjs`, Task 3):
1. MA-6-synth: status `done`, exit 0, stdout matches `/got=/`, the fake token appears in neither stdout nor stderr.
2. MA-7 (doctl, `DIGITALOCEAN_TOKEN` unset): a done record arrives within 20 s (`waitForDoneRecord`, which throws on
   timeout), `status 'failed'`, stderr matches `/secret resolution failed/` and `/DIGITALOCEAN_TOKEN/`, status is not
   `timeout`.
3. MA-6 (doctl against the mock, token from env): stderr does not match `/unknown terminal/i`, a done record arrives,
   the token is redacted. If doctl's TUI then fails for a reason that is not one of the three gaps, see error_recovery.

**processOnce with a real ShellSession** (`watcher-daemon.test.cjs`, new group "objective 73: late match"):
4. Gap 3, unresolvable secret: pipe-mode session (`interactive: false`), allowlist `[{ label: 'test:echo', match:
   /^echo\b/ }]`, secret `{ prompt_match: 'access token', value_source: 'env', value_ref: 'AOFORGE_T73_UNSET' }` (env
   deleted), command `echo "Error: unable to read access token" 1>&2; exit 3`, with a spy wrapping
   `session.injectInput` -> `status 'failed'`, `exit_code 3`, stderr contains `unable to read access token`, stderr does
   not contain `secret resolution failed`, the spy saw no `\x03`. Old code: `\x03` injected and the false message.
5. Gap 3, resolved secret: same, env `AOFORGE_T73_SET='t73-token-abcdef123'` -> the spy saw no injection at all (old
   code: the token was written to the shell's stdin, where bash runs it as a command).
6. PTY (bash), resolved secret at a live prompt: command `printf 'Enter your access token: ' > /dev/tty; read TOK; echo
   "got=$TOK"`, allowlist `^printf\b` -> `status 'done'`, stdout contains `got=***REDACTED***`, the raw token appears
   nowhere in the done record.
7. PTY (bash), unresolvable secret at a live prompt -> a done record in under 5 s, `status 'failed'`, stderr contains
   `secret resolution failed`.

**ShellSession** (`watcher-shell.test.cjs`, new group "objective 73: live-only listeners"):
8. Pipe mode (replay): a liveOnly listener and a plain listener on `echo 'Enter your access token:' 1>&2; echo out;
   exit 3` -> the liveOnly listener received no `access token`, no `out` and no `__DFW_`; the plain listener saw `out`.
9. PTY bash (in-band): a liveOnly listener on `echo live-73` -> joined text contains `live-73` and no `__DFW_`.
10. PTY bash forced onto the replay protocol (`s._wrapper = { ...s._wrapper, ptyScript: undefined, sourceLine:
    undefined }` before the dispatch): `printf 'Prompt-73: ' > /dev/tty; echo replayed-73` -> the liveOnly listener
    saw `Prompt-73:` and not `replayed-73`.
11. A liveOnly listener attached before `spawn()` and between dispatches receives nothing outside a dispatch.
12. DL-1 to DL-8 pass unchanged.

**Pure filter** (`makeLiveFilter`, in-process):
13. In-band, chunks `['__DFW_BEG', 'IN_x__\r\nab', 'c__DFW_DE', 'LIM_x__\r\n__DFW_END_x__:0\r\n']` -> concatenated
    emits are `abc`; no emitted text contains `__DFW_`.
14. Replay, chunks `['Prompt: ', 'more', '\r\n__DFW_BEGIN_x__\r\nreplayed']` -> emits `Prompt: more\r\n`, nothing
    after BEGIN.
15. A held-back suffix that turns out not to be a marker (`'ab__DF'` then `'Zq'`) is emitted in full on the next chunk.

**processOnce wiring** (`watcher-daemon.test.cjs`):
16. `makeTokenSession` records the options passed to `attachDataListener`; processOnce passes `{ liveOnly: true }`.
    Existing TP-* tests pass unchanged (the fake ignores the option).

<embedded_context>

<codebase_examples>
Today every chunk goes to every listener (`watcher-shell.cjs` 152-159):
```js
  _emitExtData(chunk) {
    if (this._extDataListeners.length === 0) return;
    const listeners = this._extDataListeners.slice();
    for (const fn of listeners) {
      try { fn(chunk); } catch { /* listener errors must not break dispatch */ }
    }
  }
```
The detector's late-match branch (`watcher-daemon.cjs` 155-162), which never asks whether the command is still
running:
```js
      if (sec.err) {
        // Failed resolution — first prompt match aborts the dispatch.
        if (sec.regex.test(buf)) {
          try { sessionInjector('\x03'); } catch { /* ignore */ }
          sec.consumed = 'error';
          onError(`secret resolution failed for "${sec.ref}" (${sec.err})`);
        }
        continue;
      }
```
Shape of the change:
- Store listeners as `{ fn, liveOnly }` (attach takes an optional second argument; detach matches on `fn`).
- When a dispatch starts, create `d.live = makeLiveFilter({ begin, delim, protocol })` where `protocol` is `'inband'`
  for the 73-01 script branch and `'replay'` otherwise; on settle, drop it.
- `_emitExtData(chunk)`: plain listeners get `chunk`; if any liveOnly listener exists and a dispatch is active,
  compute `const live = d.live(chunk)` once and, when non-empty, pass it to each liveOnly listener.
- In pipe mode, stdout and stderr both feed `_emitExtData`; feed the filter from both in arrival order (the replay
  protocol's markers arrive on stdout).
- `makeLiveFilter` is pure: it keeps a small state (`phase: 'before' | 'live' | 'after'`, a pending tail) and returns the
  newly live text for each chunk. Hold back only the longest suffix of the pending text that is a proper prefix of the
  marker it is waiting for (BEGIN in `before` for in-band, DELIM in `live` for in-band, BEGIN in `live` for replay).
  For in-band, the live window starts after the newline that ends the BEGIN line.

The token-session fake (`watcher-daemon.test.cjs` 280) is a hand-built double: extend it to record
`attachDataListener`'s second argument (`session._listenerOpts`) and nothing else.

MA-7 and MA-6 in the e2e file wrap their asserts in gap detection today (`isArchitecturalGap`, `tryWaitForDoneRecord`
returning null -> `t.skip`). Replace those with `waitForDoneRecord` (throws on timeout) and plain asserts; delete the
two helpers if nothing else uses them, and rewrite the "ARCHITECTURAL FINDING (TRD 19-05)" header block as a short
"closed in objective 73" note naming 73-01 (gaps 1 and 2) and 73-03 (gap 3).
</codebase_examples>

<anti_patterns>
- Do not make the detector parse sentinels itself or pass markers into `_makePromptDetector`; the session owns the
  protocol and already knows which one each dispatch used.
- Do not change the default listener behaviour. DL-1..DL-8 pin it, and 73-05's facade relies on the second argument
  being optional.
- Do not widen or loosen prompt regexes, the duplicate-prompt guard or redaction to get MA-6 green.
- Do not keep a catch-all skip in the e2e file. A skip must name a missing tool (node-pty, doctl), never a hang.
- Do not log or assert on the raw token anywhere except the "appears nowhere" checks.
</anti_patterns>

<error_recovery>
- MA-6 (real doctl) fails for a new reason once it has a terminal. doctl's bubble-tea TUI redraws its view on every
  keystroke, so the label `access token` can re-appear after the injection and trip the duplicate-prompt guard
  (`duplicate prompt match`), or bubble-tea may wait on a terminal query (cursor position, background colour) that
  nothing in the PTY answers. Do not widen anything to get it green. Keep the MA-6 asserts that hold (no
  `unknown terminal`, a done record within the timeout, the token redacted), drop only the `status 'done'` assert,
  and record the observed status and stderr (token redacted) in the SUMMARY as a follow-up for objective 75's todo
  sweep. Gap 1's own regression test is 73-01's `[ -t 1 ]` test, not MA-6.
- MA-7 shows `status 'timeout'`: the `\x03` did not reach doctl or the wrapper did not survive it. Re-run 73-01's
  Ctrl+C test under the same shell; check that processOnce now attaches with `liveOnly`.
- Test 10 (bash forced onto the replay protocol in PTY mode) is unreliable, for example because the batched lines
  race the `/dev/tty` prompt. That replay-in-PTY path is what fish and powershell use, and `getWrapper` supports no
  other shell to test it with. Keep the pure-filter tests 13-15 as the replay coverage, mark test 10 `todo` with the
  observed behaviour in its message, and say so in the SUMMARY.
</error_recovery>

</embedded_context>

<gotchas>
- In replay protocol the BEGIN marker is printed after the command exits, so "before BEGIN" is the live phase. In the
  in-band script it is printed before the command, so "after BEGIN, before DELIM" is. One filter, two phase maps.
- Redaction runs on the final stdout/stderr (`_redactSecrets`), which needs values of at least 8 characters
  (`MIN_REDACT_LEN`); keep test tokens at 17+ characters.
- The pipe-mode processOnce tests need a hand-built allowlist; `defaultAllowlist()` does not allow `echo`.
- The roadmap-reconcile E2E1 gotcha: tick this TRD's ROADMAP box before the final full-suite run.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED, the late-match regressions and the live-only listener tests</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs, plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs</files>
  <action>
Write test list items 4, 5, 8-11 and 13-16 (6 and 7 come in Task 2 as guards). Hand-build the allowlists, env names
and the injectInput spy. Run both files against the current code and capture the RED: 4 and 5 show the injection and
the false `secret resolution failed`; 8-11 show sentinel or replayed text reaching the listener; 13-15 fail on the
missing `makeLiveFilter`; 16 shows no options passed. Commit the tests alone (`test(73-03): ...`).
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs exits non-zero with only the new objective-73 tests failing</verify>
  <done>Gap 3's regression tests exist and fail on the current code for the documented reasons; the RED output is captured for the SUMMARY.</done>
  <recovery>If test 4 passes on the old code, check that the command's text really arrives after BEGIN (replay) in pipe mode and that the secret's regex matches it; the point is a match that exists only in replayed output.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, makeLiveFilter, liveOnly listeners and the live-only detector</name>
  <files>plugins/aoforge/aoforge/bin/lib/watcher-shell.cjs, plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs, plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs</files>
  <action>
Implement `makeLiveFilter` and the liveOnly listener path as described in codebase_examples, and change processOnce's
attach to `session.attachDataListener(detector, { liveOnly: true })`. Leave `_makePromptDetector` itself unchanged
unless a test proves it must change. Make Task 1's tests pass one at a time, then add test list items 6 and 7 (PTY
guards; they should pass immediately, which you record). Update the `watcher-shell.cjs` header's protocol section with
the live-window rule, and the `_makePromptDetector` doc comment to say it is fed live bytes only. Run both files and the
wrapper tests. Commit `feat(73-03): ...`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs plugins/aoforge/aoforge/bin/lib/wrappers/bash.test.cjs exits 0, with the PTY tests running (not skipped)</verify>
  <done>Late matches never inject; live prompts are still answered and redacted; plain listeners unchanged; every pre-existing test green.</done>
  <recovery>If a pre-existing TP-* test breaks, the fake session is being treated as a real one; the fake must stay a pass-through that ignores the option.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The e2e tests assert instead of skipping, and the gates</name>
  <files>plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs</files>
  <action>
Rewrite MA-6-synth, MA-7 and MA-6 to test list items 1-3 and the header note (codebase_examples). Keep the
`ptyAvailable()` and `doctlAvailable()` gates, the mock lifecycle (`liveServers`, unref, suite-level `after`) and
`stopDaemon` untouched. Run the file: expect 13 tests, 0 fail, 0 skipped on this machine (node-pty and doctl are
installed); if MA-6 follows error_recovery, say so in the SUMMARY. Then run the full suite against the baseline and
record the delta.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs exits 0 with no skips on this machine (or only a documented MA-6 change per error_recovery), then npm test (or the STACK.md glob) shows no new failures</verify>
  <done>No e2e test skips on a gap; MA-6-synth passes; MA-7 fails fast with the resolution message; the SUMMARY's TDD table covers gap 3 (RED commit and output) and lists the e2e before/after (10 pass + 3 skip -> 13 pass, or the documented MA-6 outcome).</done>
  <recovery>If the e2e file hangs, it is a daemon that never got its END: run `node --test --test-name-pattern=MA-7 plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` alone and read the daemon log tail the test prints on teardown.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs plugins/aoforge/aoforge/bin/lib/watcher-daemon.test.cjs plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "liveOnly: true" plugins/aoforge/aoforge/bin/lib/watcher-daemon.cjs` finds the attach.
- `rg -n -e "isArchitecturalGap" -e "architectural gap" plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` finds nothing outside the "closed in objective 73" note.
- The SUMMARY's TDD table shows RED then GREEN for tests 4 and 5 (gap 3) and the e2e before/after counts.
</verification>

<success_criteria>
- Gap 3 has a regression test that failed on the old code and passes now.
- All three gaps are exercised end to end through the real daemon without a gap skip.
- No regression in the full suite.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-03-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table and the e2e before/after.
</output>
