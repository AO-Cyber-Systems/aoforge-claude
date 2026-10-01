---
status: active
---
<purpose>
Orchestrate parallel codebase mapper agents to analyze codebase and produce structured documents in .planning/codebase/, then synthesize a CLAUDE.md with coding rules.

Each agent has fresh context, explores a specific focus area, and **writes its documents to drafts itself**. The orchestrator only receives confirmation + line counts, publishes every draft in one pass with `df-tools doc put codebase/<NAME>.md`, then synthesizes CLAUDE.md and writes a summary.

Output: .planning/codebase/ folder with 8 structured documents + CLAUDE.md at project root with prescriptive coding rules.
</purpose>

<philosophy>
**Why dedicated mapper agents:**
- Fresh context per domain (no token contamination)
- Agents write their documents to drafts themselves (no context transfer back to orchestrator)
- Only the orchestrator publishes (`doc put`), one document at a time — parallel publishes would race
- Orchestrator only summarizes what was created (minimal context usage)
- Faster execution (agents run simultaneously)

**Document quality over length:**
Include enough detail to be useful as reference. Prioritize practical examples (especially code patterns) over arbitrary brevity.

**Always include file paths:**
Documents are reference material for Claude when planning/executing. Always include actual file paths formatted with backticks: `src/services/user.ts`.
</philosophy>

<non_interactive_mode>
Used by `/devflow:adopt` (and `/devflow:map-codebase --non-interactive`). No prompts, no waiting
for a response — every step below resolves itself deterministically. Every `df-tools.cjs` call and
every path in this mode is under the target directory via `--cwd`.

- **check_existing** — if `.planning/codebase/` already has complete documents, use them as-is;
  map only the docs that are missing or empty — never delete existing documents.
- **spawn_agents / collect_confirmations / verify_output / publish_maps** — unchanged; still spawn
  the 4 mapper agents (or, if the Task tool is unavailable, perform each focus directly in sequence),
  verify their drafts and publish them. A secret hit in publish_maps does not pause here — as in
  scan_for_secrets, it is left for `adopt report`.
- **draft_stack_profile** — skipped entirely. `adopt scaffold` writes `.planning/STACK.md` itself.
- **confirm_stack_profile** — skipped. `/devflow:adopt` runs its own after `adopt scaffold`.
- **generate_claude_md** — unchanged; still writes the versioned CLAUDE.md block that `adopt`
  relies on.
- **scan_for_secrets** — do not pause for confirmation. Any finding is left for `adopt report` to
  redact and list under "Needs review" — mapping itself never blocks on it.
- **commit_codebase_map** — skipped. `/devflow:adopt` makes the only commit for the whole run.
- **offer_next** — skipped. Return control to the caller instead of printing next steps.
</non_interactive_mode>

<process>

<step name="init_context" priority="first">
Load codebase mapping context:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init map-codebase)
```

Extract from init JSON: `mapper_model`, `commit_docs`, `codebase_dir`, `existing_maps`, `has_maps`, `codebase_dir_exists`.
</step>

<step name="check_existing">
**Non-interactive:** see <non_interactive_mode>.

Check if .planning/codebase/ already exists using `has_maps` from init context.

If `codebase_dir_exists` is true:
```bash
ls -la .planning/codebase/
```

**If exists:**

```
.planning/codebase/ already exists with these documents:
[List files found]

What's next?
1. Refresh - Delete existing and remap codebase
2. Update - Keep existing, only update specific documents
3. Skip - Use existing codebase map as-is
```

Wait for user response.

If "Refresh": Delete .planning/codebase/, continue to create_structure
If "Update": Ask which documents to update, continue to spawn_agents (filtered)
If "Skip": Exit workflow

**If doesn't exist:**
Continue to create_structure.
</step>

<step name="create_structure">
Nothing to create by hand: each mapper writes its documents to drafts, and `doc put` (publish_maps)
creates `.planning/codebase/` in local mode and the store page in store mode. Each draft path comes from:

```bash
node ~/.claude/devflow/bin/df-tools.cjs planning draft codebase/<NAME>.md
```

It prints an absolute path outside the repo, seeded from the current map when one exists, and prints
the same path on every call — so the mappers and the orchestrator agree on it without passing it around.

**Expected documents (`codebase/<NAME>.md`):**
- STACK.md (from tech mapper)
- INTEGRATIONS.md (from tech mapper)
- ARCHITECTURE.md (from arch mapper)
- STRUCTURE.md (from arch mapper)
- CONVENTIONS.md (from quality mapper)
- TESTING.md (from quality mapper)
- PATTERNS.md (from quality mapper)
- CONCERNS.md (from concerns mapper)

Continue to spawn_agents.
</step>

<step name="spawn_agents">
Spawn 4 parallel codebase-mapper agents.

Use Task tool with `subagent_type="codebase-mapper"`, `model="{mapper_model}"`, and `run_in_background=true` for parallel execution.

**CRITICAL:** Use the dedicated `codebase-mapper` agent, NOT `Explore`. The mapper agent writes its documents to drafts itself; it never publishes them.

**Agent 1: Tech Focus**

Task tool parameters:
```
subagent_type: "codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase tech stack"
```

Prompt:
```
Focus: tech

Analyze this codebase for technology stack and external integrations.

Write these documents to their drafts — `node ~/.claude/devflow/bin/df-tools.cjs planning draft codebase/<NAME>.md` prints each path:
- STACK.md - Languages, runtime, frameworks, dependencies, configuration
- INTEGRATIONS.md - External APIs, databases, auth providers, webhooks

Explore thoroughly. Write the drafts using templates; do not publish them. Return confirmation only.
```

**Agent 2: Architecture Focus**

Task tool parameters:
```
subagent_type: "codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase architecture"
```

Prompt:
```
Focus: arch

Analyze this codebase architecture and directory structure.

Write these documents to their drafts — `node ~/.claude/devflow/bin/df-tools.cjs planning draft codebase/<NAME>.md` prints each path:
- ARCHITECTURE.md - Pattern, layers, data flow, abstractions, entry points
- STRUCTURE.md - Directory layout, key locations, naming conventions

Explore thoroughly. Write the drafts using templates; do not publish them. Return confirmation only.
```

**Agent 3: Quality Focus**

Task tool parameters:
```
subagent_type: "codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase conventions"
```

Prompt:
```
Focus: quality

Analyze this codebase for coding conventions, testing patterns, and representative code examples.

Write these documents to their drafts — `node ~/.claude/devflow/bin/df-tools.cjs planning draft codebase/<NAME>.md` prints each path:
- CONVENTIONS.md - Code style, naming, patterns, error handling
- TESTING.md - Framework, structure, mocking, coverage
- PATTERNS.md - 3-5 real code snippets (30-60 lines each) showing how code is written here

Explore thoroughly. Write the drafts using templates; do not publish them. Return confirmation only.
```

**Agent 4: Concerns Focus**

Task tool parameters:
```
subagent_type: "codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase concerns"
```

Prompt:
```
Focus: concerns

Analyze this codebase for technical debt, known issues, and areas of concern.

Write this document to its draft — `node ~/.claude/devflow/bin/df-tools.cjs planning draft codebase/CONCERNS.md` prints the path:
- CONCERNS.md - Tech debt, bugs, security, performance, fragile areas

Explore thoroughly. Write the draft using the template; do not publish it. Return confirmation only.
```

Continue to collect_confirmations.
</step>

<step name="collect_confirmations">
Wait for all 4 agents to complete.

Read each agent's output file to collect confirmations.

**Expected confirmation format from each agent:**
```
## Mapping Complete

**Focus:** {focus}
**Drafts written:**
- `codebase/{DOC1}.md` → `{draft path}` ({N} lines)
- `codebase/{DOC2}.md` → `{draft path}` ({N} lines)

Ready for orchestrator to publish.
```

**What you receive:** Just draft paths and line counts. NOT document contents.

If any agent failed, note the failure and continue with successful documents.

Continue to verify_output.
</step>

<step name="verify_output">
Verify every draft the confirmations name (the drafts all sit in one directory):

```bash
wc -l <draft paths from the confirmations>
```

**Verification checklist:**
- All 8 drafts exist (only the requested ones on an "Update" run)
- No empty drafts (each should have >20 lines)

If any drafts are missing or empty, note which agents may have failed and leave those documents out
of publish_maps.

Continue to publish_maps.
</step>

<step name="publish_maps">
**Non-interactive:** see <non_interactive_mode>.

**Secrets first.** In store mode a published map leaves the machine, so check the drafts before
anything is published — the same patterns as scan_for_secrets:

```bash
grep -E '(sk-[a-zA-Z0-9]{20,}|sk_live_[a-zA-Z0-9]+|sk_test_[a-zA-Z0-9]+|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]+|AKIA[A-Z0-9]{16}|xox[baprs]-[a-zA-Z0-9-]+|-----BEGIN.*PRIVATE KEY|eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.)' <draft paths from the confirmations>
```

On any hit, show it and pause exactly as scan_for_secrets does ("safe to proceed", or edit the draft first).

**Publish each map, one at a time** — never in parallel, and never from a mapper agent:

```bash
node ~/.claude/devflow/bin/df-tools.cjs doc put codebase/STACK.md --from "<draft path for codebase/STACK.md>"
```

Repeat for every verified draft (INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, PATTERNS,
CONCERNS). `planning draft codebase/<NAME>.md` prints the same path again if a confirmation lost it.
Each `df-tools doc put` writes `.planning/codebase/<NAME>.md` in both modes (in store mode it also pushes the page),
so the steps below read the published maps from there. A non-zero exit names the document: report it
and continue with the rest.

Continue to draft_stack_profile.
</step>

<step name="draft_stack_profile">
**Non-interactive:** see <non_interactive_mode>.

**Draft the project stack profile (`.planning/STACK.md`) from what was just mapped.**

Skip this step if `.planning/STACK.md` already exists.

```bash
node ~/.claude/devflow/bin/df-tools.cjs stack init --from codebase --raw
```

If the command fails with "Unknown command" (an older DevFlow mirror), skip this step silently.
Otherwise show the draft and ask: "Write this as .planning/STACK.md? (yes / edit / skip)".
Only on **yes** run `node ~/.claude/devflow/bin/df-tools.cjs stack init --from codebase --write`.
STACK.md is prescriptive; codebase/STACK.md stays descriptive and is its evidence. Never write it without confirmation.

Continue to confirm_stack_profile.
</step>

<step name="confirm_stack_profile">
**Non-interactive:** see <non_interactive_mode>.

Skip if `.planning/STACK.md` does not exist. Best-effort: confirm it against the code with the
gopls/dart MCP tools when this session has them. `.mcp.json` servers need approval and a session
restart, so their absence is normal — never block on them.

1. Probe: use ToolSearch for `mcp__gopls__go_workspace` and `mcp__dart__analyze_files` (no
   ToolSearch → look for `mcp__gopls__*` / `mcp__dart__*` in your tool list).
2. Go (gopls present): `go_workspace` — the module layout must match the drafted `components`;
   `go_vulncheck` — the `audit` key is meaningful; `go_diagnostics` on 1-2 files.
3. Dart/Flutter (dart present): `roots` for the project dir, then `analyze_files` (baseline vs the
   drafted analyze flags); `run_tests` only when the server was started with `--enable cli`.
4. Otherwise, or additionally (safe keys only):
   `node ~/.claude/devflow/bin/df-tools.cjs stack verify --run --raw`
5. Give the user each discrepancy as a note: the key, what the profile says, what the code shows.
   NEVER edit STACK.md silently — any change goes through the user.
6. `.mcp.json` is opt-in per repo: suggest `stack mcp --write`; never run it here.
7. Start no server; if one is ever needed, use port 8091, never 8080.

Continue to generate_claude_md.
</step>

<step name="generate_claude_md">
**Synthesize CLAUDE.md from codebase analysis.**

Read all 8 analysis documents and the template:

```
Read: .planning/codebase/STACK.md
Read: .planning/codebase/ARCHITECTURE.md
Read: .planning/codebase/STRUCTURE.md
Read: .planning/codebase/CONVENTIONS.md
Read: .planning/codebase/TESTING.md
Read: .planning/codebase/PATTERNS.md
Read: .planning/codebase/INTEGRATIONS.md
Read: .planning/codebase/CONCERNS.md
Read: ~/.claude/devflow/templates/claude-md.md
```

Follow the template's section structure and guidelines to synthesize a CLAUDE.md:
- **Prescriptive tone:** "Use X", "Never Y", "Always Z" — not "The codebase uses X"
- **Concrete:** Include actual file paths, command names, patterns from the analysis docs
- **Concise:** Aim for 80-150 lines — this is auto-loaded every session, brevity matters
- **Skip empty sections:** If a section has nothing meaningful (e.g., no integrations), omit it entirely
- **Development Rules:** Copy the `# Development Rules` section verbatim from the template. It is DevFlow-owned; the upgrade (migration 0005) keeps it current in existing blocks, so do not reword or tailor it.

**Markers (versioned):** Wrap the generated content in
`<!-- DEVFLOW:START v=<template_version> src=claude-md -->` … `<!-- DEVFLOW:END -->`, where
`<template_version>` is the `template_version` in the template's frontmatter (currently `2`, i.e.
`<!-- DEVFLOW:START v=2 src=claude-md -->`).

**Merge with existing CLAUDE.md:**

If `CLAUDE.md` already exists at project root:
1. Read existing CLAUDE.md
2. If a DEVFLOW block is found — a `<!-- DEVFLOW:START v=… src=claude-md -->` marker, or a legacy unversioned `<!-- DEVFLOW:START - Auto-generated … -->` marker (same block) — followed by `<!-- DEVFLOW:END -->`:
   - Replace everything between markers (inclusive of markers) with the new DevFlow section, written with the versioned start marker
   - Preserve all content before and after the markers exactly as-is
   - If more than one DEVFLOW:START marker exists, or a START has no END, stop and report it — do not guess which block to replace
3. If no markers found:
   - Prepend the new DevFlow section (wrapped in the versioned markers) above existing content
   - Add a blank line between the DevFlow section and existing content

If no CLAUDE.md exists:
1. Write fresh file with the versioned markers wrapping the generated content

Write CLAUDE.md to project root.

Continue to scan_for_secrets.
</step>

<step name="scan_for_secrets">
**Non-interactive:** see <non_interactive_mode>.

**CRITICAL SECURITY CHECK:** Scan output files for accidentally leaked secrets before committing.

Run secret pattern detection:

```bash
# Check for common API key patterns in generated docs
grep -E '(sk-[a-zA-Z0-9]{20,}|sk_live_[a-zA-Z0-9]+|sk_test_[a-zA-Z0-9]+|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]+|AKIA[A-Z0-9]{16}|xox[baprs]-[a-zA-Z0-9-]+|-----BEGIN.*PRIVATE KEY|eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.)' .planning/codebase/*.md CLAUDE.md 2>/dev/null && SECRETS_FOUND=true || SECRETS_FOUND=false
```

**If SECRETS_FOUND=true:**

```
⚠️  SECURITY ALERT: Potential secrets detected in codebase documents!

Found patterns that look like API keys or tokens in:
[show grep output]

This would expose credentials if committed.

**Action required:**
1. Review the flagged content above
2. If these are real secrets, they must be removed before committing
3. Consider adding sensitive files to Claude Code "Deny" permissions

Pausing before commit. Reply "safe to proceed" if the flagged content is not actually sensitive, or edit the files first.
```

Wait for user confirmation before continuing to commit_codebase_map.

**If SECRETS_FOUND=false:**

Continue to commit_codebase_map.
</step>

<step name="commit_codebase_map">
**Non-interactive:** see <non_interactive_mode>.

Commit the codebase map:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs: map existing codebase" --files .planning/codebase/*.md CLAUDE.md
```

Continue to offer_next.
</step>

<step name="offer_next">
**Non-interactive:** see <non_interactive_mode>.

Present completion summary and next steps.

**Get line counts:**
```bash
wc -l .planning/codebase/*.md CLAUDE.md
```

**Output format:**

```
Codebase mapping complete.

Created .planning/codebase/:
- STACK.md ([N] lines) - Technologies and dependencies
- ARCHITECTURE.md ([N] lines) - System design and patterns
- STRUCTURE.md ([N] lines) - Directory layout and organization
- CONVENTIONS.md ([N] lines) - Code style and patterns
- TESTING.md ([N] lines) - Test structure and practices
- PATTERNS.md ([N] lines) - Representative code examples
- INTEGRATIONS.md ([N] lines) - External services and APIs
- CONCERNS.md ([N] lines) - Technical debt and issues

Generated CLAUDE.md ([N] lines) — coding rules auto-loaded every session


---

## ▶ Next Up

**Initialize project** — use codebase context for planning

`/devflow:new-project`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Re-run mapping: `/devflow:map-codebase`
- Review CLAUDE.md: `cat CLAUDE.md`
- Review specific file: `cat .planning/codebase/STACK.md`
- Edit any document before proceeding

---
```

End workflow.
</step>

</process>

<success_criteria>
- Every verified draft published with `doc put codebase/<NAME>.md`, one at a time, after the draft secret check
- 4 parallel codebase-mapper agents spawned with run_in_background=true
- Agents write their documents to drafts (orchestrator doesn't receive document contents)
- Read agent output files to collect confirmations
- All 8 codebase documents exist
- CLAUDE.md generated at project root with prescriptive coding rules
- CLAUDE.md wrapped in versioned <!-- DEVFLOW:START v=… src=claude-md --> / <!-- DEVFLOW:END --> markers
- If CLAUDE.md existed, user content outside markers is preserved
- Clear completion summary with line counts
- User offered clear next steps in DevFlow style
</success_criteria>
