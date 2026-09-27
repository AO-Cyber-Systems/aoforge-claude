---
objective: quick-18
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - docs/PROPOSAL-stack-profile.md
  - docs/stack-profiles/go.md
  - docs/stack-profiles/dart.md
  - docs/stack-profiles/flutter.md
  - plugins/devflow/devflow/references/stack-general.md
  - plugins/devflow/devflow/templates/stack.md
  - plugins/devflow/devflow/schemas/stack-profile.schema.json
autonomous: true
must_haves:
  truths:
    - "All 7 stack-profile artifacts exist at their destination paths, byte-identical to the scratchpad sources"
    - "npm test passes with the new files present (or any failure is reported, not silently fixed)"
    - "Exactly one new commit exists on docs/stack-packs-proposal containing ONLY the 7 destination paths"
  artifacts:
    - path: docs/PROPOSAL-stack-profile.md
    - path: docs/stack-profiles/go.md
    - path: docs/stack-profiles/dart.md
    - path: docs/stack-profiles/flutter.md
    - path: plugins/devflow/devflow/references/stack-general.md
    - path: plugins/devflow/devflow/templates/stack.md
    - path: plugins/devflow/devflow/schemas/stack-profile.schema.json
  key_links: []
---

<!-- TDD-EXCEPTION: docs/reference/template/schema copy only; no code, no logic to test -->

<objective>
Land the stack-profile proposal (per-project `.planning/STACK.md` with a general-purpose default) and its artifacts in the repo by copying 7 pre-written, pre-validated files VERBATIM from the session scratchpad. No content edits, no agent/skill/hook wiring. Run the test suite, then make one atomic docs commit.
</objective>

<context>
SRC=/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/stack
REPO=/Users/justin/dev/devflow-claude

Mapping (source -> destination, relative to REPO):
| Source | Destination |
|--------|-------------|
| $SRC/docs/PROPOSAL-stack-profile.md | docs/PROPOSAL-stack-profile.md |
| $SRC/docs/stack-profiles/go.md | docs/stack-profiles/go.md |
| $SRC/docs/stack-profiles/dart.md | docs/stack-profiles/dart.md |
| $SRC/docs/stack-profiles/flutter.md | docs/stack-profiles/flutter.md |
| $SRC/references/stack-general.md | plugins/devflow/devflow/references/stack-general.md |
| $SRC/templates/stack.md | plugins/devflow/devflow/templates/stack.md |
| $SRC/schemas/stack-profile.schema.json | plugins/devflow/devflow/schemas/stack-profile.schema.json |

Verified during planning: all 7 sources exist; `plugins/devflow/devflow/schemas/` exists (holds surface-spec.schema.json, must_not_vocabulary.json); `docs/stack-profiles/` does NOT exist yet and must be created. `templates.test.cjs` does not appear to enumerate the templates dir, so no test breakage is expected — but verify.

Branch: docs/stack-packs-proposal (current). Do not push.

Pre-existing untracked files that must NOT be staged:
- .planning/objectives/26-github-issue-auto-build-monitor/
- .planning/objectives/27..31 `.gitkeep` files
- docs/CODEX-PORT.md
- docs/PROPOSAL-visual-workflow-class.md
- plugins/devflow/devflow/references/codex-agent-policy.md
</context>

<embedded_context>
<codebase_examples>
Commit style: `{type}({scope}): {description}` — previous commit on this branch: `docs(proposal): stack packs — language-agnostic core with Go/Dart/Flutter packs`.
</codebase_examples>
<anti_patterns>
- Do NOT open files in Read/Write and re-emit their content — use `cp`. Rewriting risks drift from the validated source.
- Do NOT `git add -A`, `git add .`, or `git add docs/` — it would sweep the untracked CODEX-PORT/visual-workflow docs.
- Do NOT edit tests to make them pass.
- Worktree/harness guard: emit one plain command per Bash call; avoid compound `&&` chains if refused.
</anti_patterns>
<error_recovery>
- `cmp` mismatch: re-run `cp` for that file; never hand-edit.
- `npm test` failure: check whether it pre-exists (run `git stash -u` is NOT allowed here — instead inspect the failing test name; if it references templates/references/schemas enumeration, it is caused by this change). Report the failure verbatim and STOP before committing; do not modify tests.
- Raw git commit blocked by gate-commits hook: use `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <7 paths>`.
</error_recovery>
</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Copy the 7 artifacts verbatim and verify byte identity</name>
  <files>docs/PROPOSAL-stack-profile.md, docs/stack-profiles/go.md, docs/stack-profiles/dart.md, docs/stack-profiles/flutter.md, plugins/devflow/devflow/references/stack-general.md, plugins/devflow/devflow/templates/stack.md, plugins/devflow/devflow/schemas/stack-profile.schema.json</files>
  <action>
1. `mkdir -p /Users/justin/dev/devflow-claude/docs/stack-profiles`
2. `cp` each source to its destination per the mapping table (absolute paths).
3. Do not open, reformat, or edit the content.
  </action>
  <verify>
For each of the 7 pairs: `cmp "$SRC/<src>" "$REPO/<dest>"` exits 0 with no output.
`python3 -m json.tool plugins/devflow/devflow/schemas/stack-profile.schema.json >/dev/null` succeeds (sanity only).
  </verify>
  <done>All 7 destinations exist and are byte-identical to their sources.</done>
</task>

<task type="auto">
  <name>Task 2: Run the test suite and make the atomic commit</name>
  <files>(git index only)</files>
  <action>
1. From REPO run `npm test`. If it fails, report the failing test(s) verbatim, note whether they relate to the new files, and STOP — do not modify tests, do not commit.
2. On pass, stage ONLY the 7 destination paths by explicit path (`git add <path>` x7, or via df-tools commit `--files`).
3. Confirm `git diff --cached --name-only` lists exactly those 7 paths.
4. Commit with message: `docs(proposal): stack profile — per-project .planning/STACK.md with general-purpose default`
   Preferred: `node ~/.claude/devflow/bin/df-tools.cjs commit "docs(proposal): stack profile — per-project .planning/STACK.md with general-purpose default" --files <7 paths>`
5. Do not push.
  </action>
  <verify>
- `npm test` exit 0.
- `git show --stat --name-only HEAD` lists exactly the 7 destination paths.
- `git status --porcelain` still shows docs/CODEX-PORT.md, docs/PROPOSAL-visual-workflow-class.md, plugins/devflow/devflow/references/codex-agent-policy.md, and the .planning/objectives/26-31 entries as untracked (`??`).
- `git rev-parse --abbrev-ref HEAD` = docs/stack-packs-proposal; nothing pushed.
  </verify>
  <done>One commit on docs/stack-packs-proposal with exactly the 7 files; tests green; pre-existing untracked files untouched.</done>
</task>

</tasks>

<verification>
- 7x `cmp` clean
- `npm test` passes
- HEAD commit contains exactly the 7 paths with the specified message
- No unrelated files staged or committed; no push
</verification>

<success_criteria>
The stack-profile proposal, three example profiles (Go, Dart, Flutter), general-purpose reference, STACK.md template, and JSON schema are committed verbatim in a single docs commit, with the test suite green.
</success_criteria>

<output>
Write summary to .planning/quick/18-stack-profile-proposal-per-project-stack/18-SUMMARY.md: commit hash, cmp results, npm test result (pass count), and confirmation that untracked files were not staged.
</output>
