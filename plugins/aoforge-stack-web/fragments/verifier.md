# Web verifier procedure

Read by the verifier when `stack context verifier` lists this fragment (objective 77 moved it out of
agents/verifier.md). The browser drive needs Playwright MCP tools, which core agents do not hold, so
the verifier delegates it to the `aoforge-stack-web:web-ui-verifier` agent, which carries the
readiness probe, landmark wait and seeded-auth protocol and returns the evidence.

## Step 8: web runtime

When the runtime is `web` (or a TRD's `must_haves.platform` is `web`, or a Flutter-web smoke check
asks for it), spawn the pack agent with the Agent tool:

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
