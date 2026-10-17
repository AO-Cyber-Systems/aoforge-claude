# Web verifier procedure

Read by the verifier when `stack context verifier` lists this fragment (objective 77 moved it out of
agents/verifier.md). The browser drive needs Playwright MCP tools, which the core verifier does not
hold, so the verifier delegates it to the `aoforge-stack-web:web-ui-verifier` agent, which carries the
readiness probe, landmark wait and seeded-auth protocol and returns the evidence.

## Step 8: web runtime

Before you spawn the agent, read each TRD SUMMARY's `## Browser self-check` table (the executor's
record from this pack's executor fragment). Pass its routes, and any FAIL row's message, to the agent
as artifacts to drive. A self-check PASS is never Step 8 evidence on its own: only the agent's drive
is. A FAIL row is a lead for the drive, not a gap by itself.

When the runtime is `web` (or a TRD's `platform` or `must_haves.platform` includes `web`, as the
Flutter pack's fragment asks for Flutter web), spawn the pack agent with the Agent tool:

```
Agent(
  subagent_type="aoforge-stack-web:web-ui-verifier",
  model="<node ~/.claude/aoforge/bin/aof-tools.cjs resolve-model web-ui-verifier --raw>",
  prompt="Objective dir: <dir>. Drive these UI artifacts: <artifact, route, landmark per line>. Start command and URL: <if known>."
)
```

Copy its `## WEB UI VERIFICATION` table into VERIFICATION.md as the Step 8 functional result and its
evidence paths into the shared evidence block. A `✗ BROKEN` row is a gap; `? SKIPPED`/`? UNCERTAIN`
rows go to human verification. If you cannot spawn agents (the Agent tool is missing at this nesting
depth), add the web drive to human verification with that reason.
