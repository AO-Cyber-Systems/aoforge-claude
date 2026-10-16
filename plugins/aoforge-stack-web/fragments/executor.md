# Web executor self-check

Read by the executor when `stack context executor` lists this fragment, which happens when the
project selected the web pack: `verification.runtime: web`, config `stacks.enabled`, or another
pack's soft dependency, such as the Flutter pack for a TRD whose `platform` includes `web`. It
restores the light browser check that objective 77 moved out of core. It is a self-check before you
hand off, not verification: the verifier's `web-ui-verifier` drive stays the authority, and nothing
here fails a task or blocks the SUMMARY.

## When it runs (post-task, before the SUMMARY)

Once per TRD, after the last task's verify step, when both hold:

- a task in the TRD created or changed something a browser renders, and
- the runtime is `web`, or the TRD's `platform` / `must_haves.platform` includes `web`.

It does not run, and records no row, for backend-only, config-only or test-only TRDs, or when the
platform excludes web. Check at most three routes: first the routes the truths name, otherwise the
routes the tasks changed.

## Preconditions (skip gracefully)

1. **Browser tools.** `browser_navigate`, `browser_wait_for`, `browser_console_messages`,
   `browser_snapshot` and `browser_close`. The executor holds them as
   `mcp__plugin_playwright_playwright__<tool>`. If they are not among your tools, record
   `SKIPPED (no browser tools: install playwright@claude-plugins-official)` and stop.
2. **Server.** The port rule: never port 8080; any server you start binds **8091**.
   - If the TRD or STACK.md names a URL that already answers (`curl -sf -o /dev/null <url>`), use
     it, unless it is on 8080.
   - Otherwise start the project's dev command on 8091 with the Bash tool's `run_in_background`, for
     example `PORT=8091 npm run dev`, `npx vite --port 8091` or `hugo server --port 8091`. Then probe:
     ```bash
     timeout 30 bash -c 'until curl -sf -o /dev/null http://localhost:8091/; do sleep 1; done'
     ```
   - A static web bundle, such as a Flutter TRD (`stack: flutter`): build it, serve `build/web` in
     the background (`run_in_background`), and load `http://127.0.0.1:8091/?enable-semantics=true`.
     ```bash
     ( cd <packageDir> && flutter build web --release )
     python3 -m http.server 8091 --bind 127.0.0.1 --directory <packageDir>/build/web
     ```
     Never `flutter run -d web-server` or `-d chrome`: DWDS wedges into a blank page.
   - If there is no start command, the build fails, or nothing answers in 30 s, record
     `SKIPPED (no dev server: <one-line reason>)`, stop any server you started, and stop.

## The check (per route)

1. `browser_navigate` to the route's URL.
2. `browser_wait_for` a landmark: a heading or label from the truths (pass it as `text`), else
   `main`. Never use a fixed sleep.
3. `browser_console_messages`, and count the error-level messages.
4. One `browser_snapshot`: the landmark must be in the accessibility tree.

After the last route, call `browser_close`, and stop any server you started.

Each route's result is one of:

- `PASS`: landmark present, 0 console errors.
- `FAIL (<n> console errors: <first message, at most 120 chars>)`
- `FAIL (landmark "<x>" missing)`

A FAIL caused by this TRD's change is a deviation Rule 1 bug: fix it within the fix-attempt limit,
re-run the check, and keep the final row. A FAIL you cannot attribute to this TRD stays FAIL in the
record and never blocks the SUMMARY.

## Record it for the verifier

Add this section to your SUMMARY draft:

```markdown
## Browser self-check

| Route | URL | Console errors | Snapshot | Result |
|---|---|---|---|---|
| /settings | http://localhost:8091/settings | 0 | landmark "Settings" present | PASS |
```

A SKIPPED run records a single row with the reason in the Result column, for example
`| - | - | - | - | SKIPPED (no dev server: no start command in package.json or STACK.md) |`. The
verifier's web fragment passes these routes, and any FAIL row's message, to `web-ui-verifier` as
artifacts to drive.
