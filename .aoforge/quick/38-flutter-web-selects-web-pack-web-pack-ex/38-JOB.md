---
objective: quick-38
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/schemas/stack-pack.schema.json
  - plugins/aoforge/aoforge/bin/lib/stack-packs.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-packs-cli.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs
  - plugins/aoforge-stack-flutter/aoforge-stack.json
  - plugins/aoforge-stack-flutter/fragments/verifier.md
  - plugins/aoforge-stack-web/aoforge-stack.json
  - plugins/aoforge-stack-web/fragments/executor.md
  - plugins/aoforge-stack-web/fragments/verifier.md
  - plugins/aoforge/agents/executor.md
  - plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs
  - docs/USER-GUIDE.md
  - docs/PROPOSAL-stack-packs.md
  - CLAUDE.md
  - CHANGELOG.md
  - plugins/aoforge-stack-flutter/CHANGELOG.md
  - plugins/aoforge-stack-web/CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "In a project whose STACK.md has `extends: flutter` and a TRD with `platform: [mobile, web]` (or `must_haves.platform: web`), `stack context verifier` lists `aoforge-stack-web:web-ui-verifier` and the web verifier fragment, and `stack discover` gives web the reason `soft dependency of flutter for platform web`. Before this change only flutter was active"
    - "A mobile-only Flutter project (runtime mobile, TRDs with `platform: [mobile]` or no platform) has exactly `[flutter]` active, and neither `stack context verifier` nor `stack context executor` names a web fragment or web-ui-verifier. Three cases keep their old active lists and context text: `extends: go` with a web-platform TRD, a profile with `verification.runtime: web` and no extends (reason `verification.runtime web`), and a repo with no STACK.md"
    - "`stacks.disabled: [\"web\"]` keeps the web pack out even with a web-platform Flutter TRD, and `stack doctor` then reports no soft-dependency warning for it"
    - "With Flutter selected, a web platform present and the web pack not installed (or its mirror broken), `stack doctor` JSON carries `warnings: [{ pack: 'flutter', wants: 'web', platform: 'web', reason, install_hint }]` and `--raw` prints a `warn:` line. Warnings never change `ok` or the exit code: a synthetic host pack with no tool requirements exits 0 with `ok: true`"
    - "stack-pack.schema.json accepts `soft_depends: [{ pack, platforms }]` and rejects any other key in an entry. plugins/aoforge-stack-flutter/aoforge-stack.json declares `[{ \"pack\": \"web\", \"platforms\": [\"web\"] }]` and validates. Core code names no pack: the soft dependency is manifest data only"
    - "The web pack ships fragments/executor.md and its manifest has `fragments.executor`. `stack context executor` lists that fragment exactly when the web pack is active: through runtime web, through `stacks.enabled`, or through Flutter's soft dependency. It does not list it for mobile-only Flutter, Go or no stack. The fragment loads up to three routes, checks for zero error-level console messages and takes one accessibility snapshot using the Playwright browser tools. It skips with a recorded reason when the tools or a server are missing, binds any server to 8091 (never 8080), records a `## Browser self-check` table in the SUMMARY draft, and never fails a task"
    - "agents/executor.md `tools:` grants exactly five Playwright tools: navigate, wait_for, console_messages, snapshot and close. It grants no click, fill or type. stack-neutrality.repo.test.cjs exempts exactly those five tokens, only on that frontmatter line. A sixth grant, or any Playwright mention elsewhere in a core file, fails CI"
    - "The Flutter verifier fragment maps a web runtime or web TRD platform to the web pack's fragment and agent. When the web pack is not listed, it records `? SKIPPED (web pack not active: ...)` and sends the surface to Step 9 human verification"
    - "`npm test` has no new failures against the baseline taken before Task 1. Failures that quick 37's in-flight RED commits cause are attributed to quick 37 and are not counted here. Nothing is pushed, tagged or released, and nothing is written under ~/.claude or /Users/justin/dev/aoforge-claude"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/stack-packs.cjs
      provides: "projectPlatforms (runtime + TRD platforms), soft-dependency selection pass in activePacks, softDependencyWarnings; shared unavailable-entry helper"
      exports: ["projectPlatforms", "softDependencyWarnings", "activePacks"]
    - path: plugins/aoforge/aoforge/bin/lib/stack-packs-cli.cjs
      provides: "doctor() result gains `warnings`; text prints `warn:` lines; exit code from `ok` only"
    - path: plugins/aoforge/aoforge/schemas/stack-pack.schema.json
      provides: "soft_depends: array of { pack, platforms }, additionalProperties false"
    - path: plugins/aoforge-stack-web/fragments/executor.md
      provides: "web executor self-check: route load, console errors, one snapshot, graceful skips, SUMMARY record"
    - path: plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs
      provides: "GRANT_ALLOW: token-scoped exemption for the executor's five read-only browser grants"
  key_links:
    - from: "stack-profile.cjs `stack context` and stack-packs-cli.cjs discover/doctor"
      to: "stack-packs.cjs activePacks (second pass over active hosts' soft_depends)"
      via: "projectPlatforms({ projectRoot, resolved }) intersected with each soft_depends entry's platforms"
    - from: "plugins/aoforge-stack-flutter/aoforge-stack.json soft_depends"
      to: "plugins/aoforge-stack-web (pack name `web`)"
      via: "manifest data read by core; core never names the pack"
    - from: "plugins/aoforge-stack-web/aoforge-stack.json fragments.executor"
      to: "agents/executor.md `## Stack pack procedures` (reads every listed fragment)"
      via: "`stack context executor` Read pointer"
    - from: "fragments/executor.md browser calls"
      to: "agents/executor.md tools line (five mcp__plugin_playwright_playwright__browser_* grants)"
      via: "subagent tool allowlist"
    - from: "SUMMARY `## Browser self-check` table"
      to: "plugins/aoforge-stack-web/fragments/verifier.md Step 8 (routes passed to web-ui-verifier)"
      via: "verifier reads the TRD SUMMARYs"
---

# Quick 38: Flutter web selects the web pack; web pack executor self-check

## Objective

The work happens in the worktree
`/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/main-wt`
on branch `fix/post-77-verification`, written `<repo>` below. Work only there. Its planning tree is the legacy planning
directory. Run aof-tools as `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> ...`. **Never write
under `/Users/justin/dev/aoforge-claude`** (the main checkout) or `~/.claude`.

**Shared worktree.** Quick 37's executor commits on this same branch, in this same directory, while you work. It
owns model-rates.json, calibration-inputs.test.cjs, release.yml, scripts/release-tag*, scripts/tag-rules*,
changelog-on-tag.test.js, CLAUDE.md and the three CHANGELOGs. See gotchas: shared worktree.

Two gaps left by objective 77 (commit 1cce9f50 moved the Flutter and Playwright procedure into stack packs):

1. **Flutter web never selects the web pack.** A Flutter project (`extends: flutter`, profile runtime `mobile`)
   never activates `plugins/aoforge-stack-web`. Yet `plugins/aoforge-stack-flutter/fragments/verifier.md:11` sends
   Flutter-web smoke checks to "the web pack's Playwright check", and the default Flutter UI TRD has
   `platform: [mobile, web]`. As a result, Flutter web coverage silently falls to human verification. Verified: a
   fixture with `extends: flutter` and a TRD with `platform: [mobile, web]` gives `stack context verifier` →
   `packs.active: ["flutter"]` with no subagents.
2. **The executor's browser check is gone.** 1cce9f50 removed the executor's "Browser verification for UI tasks" step
   (`git show 1cce9f50 -- plugins/aoforge/agents/executor.md`) and its Playwright tool grants. It restored neither
   step in a pack.

**Premise correction (read before Task 2).** The decision says the self-check uses "the Playwright MCP tools the
executor agent already has". The main checkout (pre-77) still grants them. In `<repo>`, 1cce9f50 removed them: line 5
of agents/executor.md now ends at `mcp__gopls__*, mcp__dart__*`. A spawned executor holds only its `tools:` list, so
without a grant the fragment would skip on every run. Task 2 therefore restores **five read-only** grants (no click,
fill or type). It also adds a token-scoped neutrality exemption, the same reasoning that already keeps the gopls/dart
grants on core agents ("a pack cannot add tools to a core agent", PROPOSAL-stack-packs.md status row). This change
goes in its own commit so the user can revert it alone.

Intent: kind `plugin`, work `feature` (`aof-tools intent resolve`; a quick task has no OBJECTIVE.md). tdd strict,
test_list_first required, fixture_strategy generators (hand-built fixture builders come first in Task 1), outside-in:
spawned `aof-tools stack ...` tests before unit tests. Constraints: `no_llm_test_data`, `no_property_based_default`,
`no_gherkin_layer`. Test first in each task: commit RED, then GREEN.

## Locked decisions

- **D1 soft dependency is manifest data.** Add `soft_depends` to stack-pack.schema.json `properties`:
  ```json
  "soft_depends": {
    "description": "Packs this pack wants for some platforms without requiring them. When this pack is active and the project's platforms (the resolved verification.runtime, and every TRD's platform / must_haves.platform) include one listed here, the named pack is selected too, unless config stacks.disabled names it. A named pack that is not installed, not enabled or broken is a `stack doctor` warning, never a failure. Not followed transitively.",
    "type": "array",
    "items": {
      "type": "object",
      "required": ["pack", "platforms"],
      "additionalProperties": false,
      "properties": {
        "pack": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
        "platforms": { "type": "array", "items": { "type": "string", "minLength": 1 }, "uniqueItems": true }
      }
    }
  }
  ```
  The Flutter manifest gains `"soft_depends": [ { "pack": "web", "platforms": ["web"] } ]`. No other manifest key
  changes. The web pack's `select.runtime: ["web"]` stays as it is.
- **D2 platform set.** `projectPlatforms({ projectRoot, resolved }) -> string[]` (sorted, unique) in stack-packs.cjs:
  - add `resolved.frontmatter.verification.runtime` when it is a non-empty string. It is a scalar: `stack validate`
    rejects a list with STK001, so do not add list handling.
  - then read every `<planningRoot(projectRoot)>/objectives/*/*-TRD.md`. Use `planningRoot` from compat.cjs (it handles
    `.aoforge/` and the legacy directory) and `extractFrontmatter` from frontmatter.cjs. Add the string or every
    string item of `fm.platform` and of `fm.must_haves.platform`. If a file is unreadable or its frontmatter does not
    parse, skip it. If the directory is missing, the result is the runtime only.
  - Read only explicit values. A TRD without `platform` adds nothing: core does not know Flutter's `[mobile, web]`
    default. The Flutter verifier fragment covers that case (D5).
  - Compute it lazily, only when an active pack declares `soft_depends`. Go, Node and no-stack projects never pay for
    the scan.
- **D3 selection.** Restructure `activePacks` so it calls `discoverPacks` once and runs two passes:
  1. The existing rules, unchanged: `stacks.enabled`, a profile id in the extends chain, `select.runtime`, and
     `stacks.disabled` skipping a pack.
  2. For each pack selected in pass 1, in order, and each entry of its `manifest.soft_depends`: skip the entry if
     `entry.pack` is already selected or in `cfg.disabled`. Otherwise, if `entry.platforms` shares a platform with
     `projectPlatforms(...)` and an **enabled** discovered pack named `entry.pack` exists, select it with
     `reason: \`soft dependency of ${host.name} for platform ${hit}\``. `hit` is the first matching entry of
     `entry.platforms`.
  A pack selected in pass 2 does not bring in its own soft dependencies (one level only, so there are no cycles).
  Return the packs in discoverPacks order (sorted by name), not in selection order. Update the doc comment above
  `activePacks`.
- **D4 doctor warnings.** Add `softDependencyWarnings({ projectRoot, userHome, resolved, active })` to stack-packs.cjs.
  For each active host, look at each `soft_depends` entry that shares a platform with the project, names a pack that
  is not active and is not in `cfg.disabled`. Return
  `{ pack: host.name, wants: entry.pack, platform: hit, reason, install_hint }`. `reason` is `not_installed` (no
  mirror), `broken` (manifest issues) or `plugin_not_enabled`, built the way `unavailableSelectedPacks` builds it.
  Move that per-name logic into one helper both functions use, so the install-hint text is not duplicated.
  `doctor()` adds `warnings` to its result. `ok` is still `results.every(r => r.ok)`, and warnings never change it or
  the exit code. `doctorCli` text appends one line per warning:
  `warn: <pack> soft-depends on <wants> for platform <platform>, but <UNAVAILABLE_TEXT[reason]> (<install_hint>); its
  <platform> checks fall to human verification`. If there are no active packs and no warnings, the text stays
  `No active stack packs.`
- **D5 Flutter verifier fragment.** In `plugins/aoforge-stack-flutter/fragments/verifier.md` `## Runtime mapping
  (Step 8)`, replace the `Flutter web smoke-only` bullet (line 11). Leave the mobile bullet as it is. The new
  bullets:
  - `web` runtime, or a TRD whose `platform` (or `must_haves.platform`) includes `web` → the web pack's verifier
    fragment and its `aoforge-stack-web:web-ui-verifier` agent. It runs against a `flutter build web --release`
    bundle served statically on port 8091 (never 8080), with `?enable-semantics=true`. This pack lists the web pack
    in `soft_depends`, so `stack context verifier` lists it for such a project whenever it is installed and not in
    `stacks.disabled`. Keep the existing `Never flutter run -d web-server/-d chrome ... DWDS` sentence.
  - **Web pack not active.** If that output lists no `web` pack, record each Flutter web surface as
    `? SKIPPED (web pack not active: /plugin install aoforge-stack-web@aocyber, or remove "web" from stacks.disabled)`
    and put it on the Step 9 human-verification list. This happens when aoforge-stack-web is not installed or not
    enabled (`aof-tools stack doctor` warns) or when `stacks.disabled` names it. Never report Flutter web coverage as
    passed without the web pack. Pack selection reads only explicit `platform` values, but a `type: ui` TRD with no
    `platform` still counts as `[mobile, web]` for these gates. Handle its web half the same way when the web pack
    is not listed.
- **D6 web executor fragment.** Create `plugins/aoforge-stack-web/fragments/executor.md` (the content is specified in
  Task 2) and add `"executor": "fragments/executor.md"` to the web manifest's `fragments`. Extend the web manifest's
  `description` to mention "an executor self-check before handoff". Core executor prose does not change: its
  `## Stack pack procedures` step already reads every listed fragment, and its UI-task item 4 already defers to a
  pack's per-task UI check.
- **D7 read-only grants.** Append exactly these five entries to agents/executor.md `tools:` (line 5), after
  `mcp__dart__*`: `mcp__plugin_playwright_playwright__browser_navigate`, `..._browser_wait_for`,
  `..._browser_console_messages`, `..._browser_snapshot` and `..._browser_close` (all with the
  `mcp__plugin_playwright_playwright__` prefix). Below the existing frontmatter comments, add one YAML comment line:
  `# Browser tools: read-only, for a stack pack's executor self-check (aoforge-stack-web); a pack cannot grant tools
  to a core agent (quick 38).` That comment must not contain the word that PATTERN matches. In
  stack-neutrality.repo.test.cjs add:
  ```js
  // Tool grants a pack needs on a core agent and cannot add itself. Only these exact tokens, and only on the
  // file's frontmatter `tools:` line, are skipped; every other line stays under PATTERN.
  const GRANT_ALLOW = {
    'agents/executor.md': {
      tokens: [/* the five full tool names, sorted */],
      reason: "the web pack's executor self-check loads a route and reads it: read-only browser tools only (quick 38)",
    },
  };
  ```
  In the main test, a line in a GRANT_ALLOW file that is inside the frontmatter (before the second `---`) and starts
  with `tools:` has each listed token removed before the PATTERN test. Add a test named
  `every GRANT_ALLOW entry is exactly the PATTERN-matching grant set on its tools line`. It splits the tools line on
  `,`, trims each part, keeps the parts PATTERN matches, sorts them, and requires them to deepEqual `tokens`, with a
  reason of 20 or more characters. A sixth grant (click), a missing one, or a removed grant fails it.
- **D8 CHANGELOG and docs, last.** No version bumps: packs stay 1.0.0 and core stays 3.1.0. After Task 2 is GREEN,
  add a `### Stack packs: Flutter web selects the web pack; web executor self-check (quick 38)` section under core
  `## [3.1.0]`, directly after the last `(quick 3N)` section. Add one `### Added` bullet under each pack's
  `## [1.0.0]`, whatever date suffix quick 37 has given those headings. Make one-clause updates in USER-GUIDE,
  CLAUDE.md line 71 and the PROPOSAL status row. The exact text is in Task 2, step 5.

## Test list

Outermost first. Fixtures are hand-built. Use the existing `makePack`, `makeProject`, `run`, `tmp` and `writeJson` in
stack-packs.test.cjs, plus two new builders (Task 1, step 0):
- `repoStacks(...names)`: a fresh tmp stacks dir with only the named in-repo packs mirrored, using
  `mirrorPack({ packRoot, stacksDir })` over `packRoots()` filtered by basename `aoforge-stack-<name>`.
- `writeTrd(proj, objDir, id, fmText)`: writes `<proj>/.aoforge/objectives/<objDir>/<id>-TRD.md` as
  `---\n<fmText>\n---\n\n# TRD\n`.

Never call `useRepoPacks()` in this file: it sets `process.env.AOFORGE_STACKS_DIR` for the whole process.

**Task 1: stack-packs.test.cjs, `describe('soft dependencies: Flutter web selects the web pack (quick 38)')`**
1. `extends: flutter` with a TRD `platform: [mobile, web]` (stacks = repoStacks('flutter','web')): `stack context
   verifier` JSON `packs.active` deepEqual `['flutter','web']`, and `packs.subagents` contains
   `{ pack: 'web', agent: 'aoforge-stack-web:web-ui-verifier' }`. `--raw` text includes `web-ui-verifier`.
   `stack discover` reports web's reason as `soft dependency of flutter for platform web`.
2. The same with a TRD whose only platform is `must_haves:\n  platform: web` → web is active.
3. `extends: flutter` with `verification:\n  runtime: web` and no TRDs → web is active with reason
   `verification.runtime web` (pass 1 wins and is unchanged).
4. Mobile only: `extends: flutter`, one TRD `platform: [mobile]` and one TRD with no platform → `packs.active`
   deepEqual `['flutter']`. The verifier context has no `web-ui-verifier`, and `packs.fragments` names only flutter.
5. `stacks.disabled: ['web']` with a `platform: [mobile, web]` TRD → active `['flutter']`. `stack doctor` JSON
   `warnings` deepEqual `[]`.
6. Unchanged: (a) `extends: go` with a web TRD → `active` `[]`, no `## Stack packs` in `stack context verifier
   --raw`; (b) `schema: 1\nverification:\n  runtime: web` with no extends → `active` `['web']`, reason
   `verification.runtime web`; (c) no STACK.md with a web TRD → `active` `[]`, no `## Stack packs`.
7. Web pack absent (stacks = repoStacks('flutter')), `extends: flutter`, web TRD: `stack doctor` JSON `warnings` has
   length 1 with `pack 'flutter'`, `wants 'web'`, `platform 'web'` and `reason 'not_installed'`, and `install_hint`
   matches `/aoforge-stack-web@aocyber/`. `packs` has no `web` entry. The `--raw` text has a line starting
   `warn: flutter soft-depends on web for platform web`. Do not assert the exit code here: the real flutter pack's
   `requires_tool` makes `ok` depend on whether flutter is on PATH.
8. Synthetic host (`makePack({ name:'h', plugin:'aoforge-stack-h', profiles:['profiles/h.md'], soft_depends:[{pack:'w',
   platforms:['web']}] })`, no requires_tool), with `extends: h` and a web TRD:
   - `w` not mirrored → `stack doctor` exit 0, `ok: true`, one warning with reason `not_installed`.
   - `w` mirrored with `contract: 2` (broken) → reason `broken`, still exit 0.
   - A TRD with `platform: [mobile]` only → `warnings` `[]`.
9. Schema: `validateManifest` with `soft_depends: [{ pack: 'web' }]` → an issue naming `platforms`. With
   `[{ pack: 'web', platforms: ['web'], extra: 1 }]` → an issue. The shipped flutter manifest's `soft_depends`
   deepEqual `[{ pack: 'web', platforms: ['web'] }]`, and every shipped `soft_depends[].pack` names an in-repo pack
   (`packRoots()` basenames without the `aoforge-stack-` prefix).
10. Unit `projectPlatforms`: with runtime `mobile`, TRDs `platform: [mobile, web]`, `platform: desktop` and
    `must_haves.platform: web`, a non-TRD file `notes.md` with `platform: tv`, and a TRD with no frontmatter →
    `['desktop','mobile','web']`. With `resolved: null` and no objectives dir → `[]`.

**Task 2: stack-packs.test.cjs, `describe('web pack executor self-check (quick 38)')`, and stack-neutrality.repo.test.cjs**
11. `stack context executor --raw` (repoStacks('flutter','web')) contains `/web: Read \`[^`]*web\/fragments\/executor\.md\`/`
    in each of three cases: (a) `extends: flutter` with a web TRD; (b) `verification.runtime: web` with no extends;
    (c) config `stacks.enabled: ['web']` with no STACK.md.
12. `stack context executor --raw` does not mention `web/fragments/executor.md` for mobile-only Flutter, for
    `extends: go`, or for no STACK.md. The no-STACK.md case also has no `## Stack packs`.
13. Content of the web executor fragment (read from the repo file): it names `browser_navigate`,
    `browser_wait_for`, `browser_console_messages`, `browser_snapshot` and `browser_close`. It contains
    `## Browser self-check`, `SKIPPED (no browser tools` and `SKIPPED (no dev server`, and it contains `8091`. It
    does not match `/(localhost|127\.0\.0\.1|0\.0\.0\.0):8080|--port[ =]8080|PORT=8080/`.
14. The web verifier fragment contains `Browser self-check` (the verifier reads the executor's record).
15. stack-neutrality: `every GRANT_ALLOW entry is exactly the PATTERN-matching grant set on its tools line`. It is RED
    until agents/executor.md has the five grants. Its existing tests keep passing.

<file_tree>
plugins/
├── aoforge/aoforge/schemas/stack-pack.schema.json        ← MODIFY (soft_depends)
├── aoforge/aoforge/bin/lib/stack-packs.cjs               ← MODIFY
├── aoforge/aoforge/bin/lib/stack-packs-cli.cjs           ← MODIFY (doctor warnings)
├── aoforge/aoforge/bin/lib/stack-packs.test.cjs          ← MODIFY
├── aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs← MODIFY (GRANT_ALLOW)
├── aoforge/agents/executor.md                            ← MODIFY (tools line + one comment)
├── aoforge-stack-flutter/aoforge-stack.json              ← MODIFY (soft_depends)
├── aoforge-stack-flutter/fragments/verifier.md           ← MODIFY (Runtime mapping)
├── aoforge-stack-web/aoforge-stack.json                  ← MODIFY (fragments.executor, description)
├── aoforge-stack-web/fragments/executor.md               ← CREATE
└── aoforge-stack-web/fragments/verifier.md               ← MODIFY (reads the self-check)
</file_tree>

<embedded_context>
<codebase_examples>
- Selection today (`stack-packs.cjs:160-179`): pass 1 is `cfg.enabled` → `profile extends <id>` → `select.runtime`,
  and `cfg.disabled` skips first. Keep the reason strings byte for byte. Tests pin `'config stacks.enabled'` and
  `'verification.runtime web'`.
- `unavailableSelectedPacks` (`:191-226`) builds the `not_installed` / `broken` / `plugin_not_enabled` entries and
  their `install_hint` (`/plugin install aoforge-stack-${name}@${MARKETPLACE}` for a missing mirror). Factor that
  into `unavailableEntry(name, discovered, userHome)` and call it from both functions.
- `stack context` (`stack-profile.cjs:1234-1255`) calls `activePacks({ projectRoot, userHome, resolved })` then
  `agentExtras` / `renderExtras`. It needs no change: the new pass lives inside activePacks.
- `doctor()` (`stack-packs-cli.cjs:85-104`) and `doctorCli` (`:195-206`): `output(r, raw, text, r.ok ? 0 : 1)`.
  Without `--raw` it prints JSON; with `--raw` it prints the text.
- Existing selection tests (`stack-packs.test.cjs:248-310`) show the spawned style:
  `run(['stack','discover'], { cwd: proj, stacksDir })` → `r.json.active.map(a => a.reason)`.
- Web fragment style: `plugins/aoforge-stack-web/fragments/verifier.md` (a short preamble saying when it is read,
  then `## Step 8: web runtime`). The web-ui-verifier agent's port rule and readiness probe
  (`agents/web-ui-verifier.md` rules and protocol 1-2) are the model for the self-check's server handling.
- The removed core step (1cce9f50), for reference only:
  `browser_navigate(url="http://localhost:{port}/{route}")`, `browser_snapshot()`, `browser_take_screenshot()`.
  "Record browser verification in task evidence ... skip for backend-only tasks."
</codebase_examples>

<anti_patterns>
- Do not write a pack name (`web`, `flutter`) into core logic. Core reads `soft_depends` from manifests and nothing
  more. Test fixtures may name packs.
- Do not put `select.platform` on the web pack, and do not add a `--objective` flag to `stack context`. The decision
  places the rule on Flutter's manifest as a soft dependency, and the test calls plain `stack context verifier`.
- Do not follow soft dependencies transitively, and do not let a warning change `doctor`'s `ok` or exit code.
- Do not move browser procedure into core prose. The only core changes are the tools line, one YAML comment and the
  guard test.
- Do not grant `browser_click`, `browser_fill_form`, `browser_type`, `browser_evaluate` or `browser_take_screenshot`.
  The self-check only loads a page and reads it.
- Never use port 8080, in examples or anywhere else. Servers bind 8091.
- Never use `flutter run -d web-server` or `-d chrome` for capture.
- No LLM-generated fixture text, no property-based libraries and no `.feature` files.
</anti_patterns>

<error_recovery>
- A spawned test prints nothing useful: rerun without `--raw` and read `r.stderr`. `stack resolve` on the fixture
  shows whether `extends: flutter` resolved from the pack tier (`chain[].source === 'pack'`).
- `planning-writes.repo.test.cjs` flags a line in the new fragment because it reads as a planning-file write (it
  scans pack fragments too). Rephrase it as "add this section to your SUMMARY draft", which is the Flutter executor
  fragment's wording and passes. As a last resort, add `<!-- planning-audit: allow <reason of 20+ chars> -->` on the
  line above.
- The neutrality guard flags the executor comment line: it contains a PATTERN word. Reword it so it names only
  "browser tools" and "aoforge-stack-web".
- `aof-tools commit` refuses because something outside `--files` is staged (quick 37 is mid-commit). Run
  `git diff --cached --name-only`. If every staged path belongs to quick 37, run the same commit command again a
  moment later. Never unstage, stash or reset another task's files. After three refusals, stop and report.
</error_recovery>
</embedded_context>

<gotchas>
- **Shared worktree with quick 37.** Never run `git add -A`, `git add .`, `git commit -a`, `git stash`, `git reset`,
  `git restore` or `git checkout -- <path>`. Commit only with
  `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> commit "<msg>" --files <only this task's files>`.
  Keep the gap between a RED commit and its GREEN commit short: quick 37 runs the same test suite.
- **Baseline.** Record `git rev-parse HEAD` as BASE before Task 1. Per-file counts measured at 236dcf91
  (tests/fail/skipped): stack-packs 32/0/0, stack-neutrality 3/0/0, planning-writes 11/0/0, rename-guard 20/0/0,
  builtin-sweep 17/0/0, doc-refs 18/0/0 and stack-profile 53/0/0. Run full `npm test` once at BASE. Quick 37's RED
  commits (for example 236dcf91, rates) can leave failures in calibration/model-rates/release-tag/tag-rules/
  changelog-on-tag tests. Those belong to quick 37. List them in the SUMMARY and do not count them.
- **`requires_tool: flutter`.** The real Flutter pack is `ok: true` only where flutter is on PATH. It is on PATH on
  this Mac but not on CI ubuntu. Assert doctor's exit code only with the synthetic host pack (test 8).
- **`pluginEnabled` returns true whenever `AOFORGE_STACKS_DIR` is set**, so tests cannot reach
  `plugin_not_enabled` through a stacks dir. Test `not_installed` and `broken`. Keep `plugin_not_enabled` in code
  through the shared helper.
- **`verification.runtime` is a scalar.** A list is STK001. Do not normalise lists.
- **Neutrality PATTERN** is `/flutter|\bdart\b|maestro|playwright|pubspec/i`. `playwright` has no word boundary, so
  every `mcp__plugin_playwright_playwright__...` token matches. `mcp__dart__*` does not match `\bdart\b`, because
  `_` is a word character. The guard scans `agents/`, `skills/`, `hooks/`, `aoforge/bin` and `aoforge/workflows` of
  the core plugin, and skips test files. Pack files are not scanned.
- **Rename guard.** Do not type the legacy planning directory's literal name, or any legacy product name, in a file
  this task creates or edits. Fixtures use `.aoforge/`, which `makeProject` already creates.
- **Fragment delivery.** `renderExtras` prints `- web: Read \`<stacks>/web/fragments/executor.md\` ...`, so the path
  in the text is the mirror path under the test's stacks dir, not the repo path.
- **Agent tool names.** The Playwright plugin's MCP server is `npx @playwright/mcp@latest`. Its tools are exposed as
  `mcp__plugin_playwright_playwright__<tool>`, the prefix web-ui-verifier.md already uses. `browser_console_messages`
  is a real tool of that server.
</gotchas>

<validation_gates>
- task: `npm test` (`aof-tools stack command test` → `npm test`; `gates.task: [test]`). Scoped form:
  `node --test <files>`. No lint, format or build gate (`status: none`).
- After each GREEN commit, run the scoped set: `node --test plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs
  plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs plugins/aoforge/aoforge/bin/lib/planning-writes.repo.test.cjs
  plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/builtin-sweep.repo.test.cjs
  plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/stack-profile.test.cjs`.
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: soft_depends — a Flutter project with a web platform selects the web pack; doctor warns when it is absent</name>
  <files>plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs, plugins/aoforge/aoforge/schemas/stack-pack.schema.json, plugins/aoforge/aoforge/bin/lib/stack-packs.cjs, plugins/aoforge/aoforge/bin/lib/stack-packs-cli.cjs, plugins/aoforge-stack-flutter/aoforge-stack.json, plugins/aoforge-stack-flutter/fragments/verifier.md</files>
  <action>
Step 0, the fixture builders. Add `repoStacks(...names)` and `writeTrd(proj, objDir, id, fmText)` to
stack-packs.test.cjs next to `makeProject` (see Test list). Use `packRoots` (already imported) and `mirrorPack`.

Step 1, RED. Write tests 1-10 in the new describe block. Run
`node --test plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs`. The new tests must fail for the right reason:
web not active, no `warnings` key, schema rejecting `soft_depends` as an unknown key, `projectPlatforms` not a
function. Test 3 and test 6 may already pass because they pin unchanged behaviour. Commit only the test file:
`test(stack-packs): Flutter web platform selects the web pack; soft-dependency doctor warning (RED)`.

Step 2, GREEN, in this order:
1. Schema: add `soft_depends` exactly as D1 gives it.
2. stack-packs.cjs: add `projectPlatforms` (D2). Restructure `activePacks` into two passes (D3), calling
   `discoverPacks` once. Factor out `unavailableEntry`. Add `softDependencyWarnings` (D4). Export `projectPlatforms`
   and `softDependencyWarnings`. Update the header comment's `activePacks` line to say "... or another active pack's
   soft_depends platform rule".
   ```
   activePacks({ projectRoot, userHome, resolved }):
     cfg = readStacksConfig(projectRoot); discovered = discoverPacks({ userHome }); selected = Map(name -> reason)
     pass 1: for pack of discovered (enabled, not disabled): existing rules -> selected.set(name, reason)
     platforms = null                                  # lazy
     pass 2: for host of discovered where selected.has(host.name) and selected.get came from pass 1:
       for dep of host.manifest.soft_depends || []:
         if selected.has(dep.pack) or cfg.disabled.includes(dep.pack): continue
         platforms ??= projectPlatforms({ projectRoot, resolved })
         hit = dep.platforms.find(p => platforms.includes(p)); if (!hit) continue
         target = discovered.find(p => p.name === dep.pack && p.enabled); if (!target) continue   # warning path, D4
         selected.set(dep.pack, `soft dependency of ${host.name} for platform ${hit}`)  # mark as pass 2
     return discovered.filter(p => selected.has(p.name)).map(p => ({ ...p, reason: selected.get(p.name) }))
   ```
   `# GOTCHA:` a host found in pass 1 must not pick up a pass-2 pack as a host. Record which pass selected each pack.
3. stack-packs-cli.cjs: `doctor()` returns `{ ok, packs, warnings }` with `warnings` from
   `softDependencyWarnings({ projectRoot, userHome, resolved, active })`. `doctorCli` appends the `warn:` lines
   (D4). The exit code is unchanged.
4. Flutter manifest: add `soft_depends` (D1). Flutter verifier fragment: the Runtime mapping edit (D5).
Run the scoped set (validation_gates). Commit the five source files with the message
`feat(stack-packs): soft_depends, so a Flutter project with a web platform selects the web pack`.

# PATTERN: keep every reason string byte for byte. Stack-packs tests pin `'config stacks.enabled'`, `'profile extends demo'`
# (via active names) and `'verification.runtime web'`.
# CRITICAL: no pack name in core code. Only `soft_depends` data selects.
  </action>
  <verify>
`node --test plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs`: 32 + the new tests, 0 fail.
The probe below shows `"active":["flutter","web"]` and a `subagents` entry `aoforge-stack-web:web-ui-verifier`. In
the mobile-only variant (TRD `platform: [mobile]`) it shows `["flutter"]`. Build it in the scratchpad from the mirrors
of both repo packs:
`AOFORGE_STACKS_DIR=<tmp stacks> HOME=<tmp> node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <tmp proj> stack context verifier`.
`git show --stat HEAD` lists only Task 1 files.
  </verify>
  <done>Tests 1-10 pass. A Flutter project whose runtime or TRD platforms include web gets the web verifier fragment
and web-ui-verifier from `stack context verifier`. Mobile-only Flutter, Go, Node-runtime-web and no-stack behave as
before. `stacks.disabled` wins. `stack doctor` warns, and never fails, when the web pack is absent. Two commits: RED,
then GREEN.</done>
  <recovery>If the two-pass refactor breaks an existing selection test, compare the reason strings and the order of
the result. Return discoverPacks order and keep pass 1 unchanged. If `extends: flutter` does not resolve in a fixture,
check that repoStacks mirrored both `flutter` and `web` into the dir passed as `stacksDir`. Revert path:
`git revert <GREEN sha>` (never reset; this worktree is shared).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: web pack executor self-check, five read-only browser grants, then CHANGELOG and docs</name>
  <files>plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs, plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs, plugins/aoforge-stack-web/fragments/executor.md, plugins/aoforge-stack-web/aoforge-stack.json, plugins/aoforge-stack-web/fragments/verifier.md, plugins/aoforge/agents/executor.md, docs/USER-GUIDE.md, docs/PROPOSAL-stack-packs.md, CLAUDE.md, CHANGELOG.md, plugins/aoforge-stack-flutter/CHANGELOG.md, plugins/aoforge-stack-web/CHANGELOG.md</files>
  <action>
Step 1, RED. Write tests 11-14 in stack-packs.test.cjs. In stack-neutrality.repo.test.cjs, write `GRANT_ALLOW` with
its five tokens, the frontmatter tools-line scrub in the main test (D7) and test 15. Run both files. Tests 11, 13, 14
and 15 fail: there is no fragment, no verifier mention and no grants. Test 12 passes. Commit the two test files:
`test(stack-web): executor self-check fragment and read-only browser grants (RED)`.

Step 2, GREEN, the fragment. Create `plugins/aoforge-stack-web/fragments/executor.md` with these sections, written
plainly, about 60-90 lines:
- `# Web executor self-check`. A preamble says it is read when `stack context executor` lists it, which happens when
  the project selected the web pack: `verification.runtime: web`, config `stacks.enabled`, or another pack's soft
  dependency, such as the Flutter pack for a TRD whose `platform` includes `web`. It restores the light browser check
  that objective 77 moved out of core. It is a self-check before handing off, not verification: the verifier's
  web-ui-verifier drive stays the authority, and nothing here fails a task or blocks the SUMMARY.
- `## When it runs (post-task, before the SUMMARY)`. It runs once, after the last task's verify step, when a task in
  the TRD created or changed something a browser renders, and the runtime is web or `platform` /
  `must_haves.platform` includes `web`. It does not run, and records no row, for backend-only, config-only or
  test-only TRDs, or when the platform excludes web. It checks at most three routes: first the routes the truths
  name, otherwise the routes the tasks changed.
- `## Preconditions (skip gracefully)`.
  1. Browser tools: `browser_navigate`, `browser_wait_for`, `browser_console_messages`, `browser_snapshot` and
     `browser_close` (the executor holds them as `mcp__plugin_playwright_playwright__<tool>`). If they are not among
     your tools, record `SKIPPED (no browser tools: install playwright@claude-plugins-official)` and stop.
  2. Server. The port rule: never port 8080; any server you start binds 8091. If the TRD or STACK.md names a URL
     that already answers (`curl -sf -o /dev/null <url>`), use it, unless it is on 8080. Otherwise start the
     project's dev command on 8091 with the Bash tool's `run_in_background` (for example `PORT=8091 npm run dev`,
     `npx vite --port 8091` or `hugo server --port 8091`). Then probe
     `timeout 30 bash -c 'until curl -sf -o /dev/null http://localhost:8091/; do sleep 1; done'`. For a static web
     bundle, such as a Flutter TRD (`stack: flutter`): run `( cd <packageDir> && flutter build web --release )`, then
     `python3 -m http.server 8091 --bind 127.0.0.1 --directory <packageDir>/build/web` in the background, and load
     `http://127.0.0.1:8091/?enable-semantics=true`. Never `flutter run -d web-server` or `-d chrome` (DWDS wedges
     into a blank page). If there is no start command, the build fails, or nothing answers in 30 s, record
     `SKIPPED (no dev server: <one-line reason>)`, stop any server you started, and stop.
- `## The check (per route)`. Call `browser_navigate`. Then `browser_wait_for` a landmark: a heading or label from
  the truths, else `main`. Never use a fixed sleep. Then `browser_console_messages` and count the error-level
  messages. Then one `browser_snapshot`. Finally `browser_close`, and stop any server you started. The result is
  `PASS` (landmark present, 0 errors), `FAIL (<n> console errors: <first message, at most 120 chars>)` or
  `FAIL (landmark "<x>" missing)`. A FAIL caused by this TRD's change is a deviation Rule 1 bug: fix it within the
  fix-attempt limit, re-run, and keep the final row. A FAIL you cannot attribute stays FAIL and never blocks the
  SUMMARY.
- `## Record it for the verifier`. "Add this section to your SUMMARY draft:", followed by a fenced markdown block
  with `## Browser self-check` and a `| Route | URL | Console errors | Snapshot | Result |` table, with one example
  row on `http://localhost:8091/settings`. Add one line saying that a SKIPPED run records a single row with the
  reason.

Web manifest: add `"executor": "fragments/executor.md"` to `fragments` and extend `description` (D6).
`plugins/aoforge-stack-web/fragments/verifier.md`: in `## Step 8: web runtime`, before the Agent call, add one
paragraph. It says: read each SUMMARY's `## Browser self-check` table; pass its routes, and any FAIL row's message,
to the agent as artifacts to drive; a self-check PASS is never Step 8 evidence on its own; and a FAIL row is a lead
for the drive, not a gap by itself.
Run the scoped set. Commit those three pack files:
`feat(stack-web): executor browser self-check before handoff`.

Step 3, GREEN, the grants. This commit stays separate so it can be reverted alone. Edit agents/executor.md line 5 and
add the comment line (D7). Run the scoped set, including stack-neutrality, planning-writes and builtin-sweep. Commit
agents/executor.md alone with
`feat(executor): five read-only browser tools for a stack pack's self-check`. The guard test file went in with the RED
commit.

Step 4, full suite. Run `npm test`. Compare it with BASE and attribute any quick 37 failures (see gotchas).

Step 5, CHANGELOG and docs, last. First bring your view up to date with what quick 37 has committed:
`git log --oneline -20`, then `git status --porcelain -- CLAUDE.md CHANGELOG.md plugins/aoforge-stack-flutter/CHANGELOG.md plugins/aoforge-stack-web/CHANGELOG.md docs/USER-GUIDE.md docs/PROPOSAL-stack-packs.md`.
Edit only the files that command prints nothing for. If a file shows changes, quick 37 has uncommitted work in it:
leave that file alone and put the exact text for it in the SUMMARY under `## Pending CHANGELOG and doc lines`. Read
each file's current headings before editing.
- CHANGELOG.md: add a section directly after the last `### ... (quick 3N)` section under `## [3.1.0]`, whatever date
  suffix that heading carries:
  `### Stack packs: Flutter web selects the web pack; web executor self-check (quick 38)`, with three bullets.
  (1) A pack manifest can declare `soft_depends: [{ pack, platforms }]`. When the declaring pack is active and the
  resolved `verification.runtime`, or any `platform` / `must_haves.platform` of a TRD under the objectives tree,
  includes a listed platform, the named pack is selected too. `stacks.disabled` wins, and the rule is not
  transitive. The Flutter pack declares web for platform `web`, so a Flutter project with web TRDs now gets the web
  verifier fragment and web-ui-verifier. (2) `stack doctor` reports `warnings` for a soft dependency that is not
  installed, not enabled or broken, and never fails on them. (3) The executor again holds five read-only browser
  tools (navigate, wait_for, console_messages, snapshot, close), which 1cce9f50 had removed, for the web pack's
  self-check. `stack-neutrality.repo.test.cjs` exempts exactly those tokens on that one frontmatter line.
- plugins/aoforge-stack-flutter/CHANGELOG.md, under `## [1.0.0]` → `### Added`: one bullet. The pack declares the web
  pack as a soft dependency for platform `web`. When the web pack is not active, the verifier fragment records Flutter
  web surfaces as `? SKIPPED` and sends them to human verification (quick 38).
- plugins/aoforge-stack-web/CHANGELOG.md, under `## [1.0.0]` → `### Added`: one bullet. An executor fragment adds a
  light browser self-check before handoff: load the route, no console errors, one accessibility snapshot, through
  the Playwright MCP tools. It records a `## Browser self-check` table for the verifier, skips with a reason when the
  browser tools or a dev server are unavailable, and binds servers to port 8091. The verifier fragment passes those
  routes to web-ui-verifier (quick 38).
- docs/USER-GUIDE.md, in the "A pack only acts in a project that selects it" list, after the
  `verification.runtime: web` bullet, add: "A Flutter project also selects the web pack when its
  `verification.runtime` is `web` or a TRD's `platform` includes `web`: the Flutter pack lists it as a soft dependency
  (`soft_depends`). If the web pack is not installed, `aof-tools stack doctor` warns (it never fails on this) and the
  verifier sends Flutter web surfaces to human verification. `stacks.disabled` still wins." Also extend the
  aoforge-stack-web table row: "... and an executor self-check before handoff".
- CLAUDE.md line 71 (Stack packs): change the selection parenthesis to "(`extends:` one of its profiles, config
  `stacks.enabled`, a matching `verification.runtime`, or an active pack's `soft_depends` platform rule, such as
  Flutter → web for platform web)". Change "`stack doctor` checks an active pack's tools" to "`stack doctor` checks an
  active pack's tools and warns on an absent soft dependency".
- docs/PROPOSAL-stack-packs.md status row (line 6): append to the deviations: "a pack may declare `soft_depends`,
  selected for some platforms (quick 38); for the same reason as the gopls/dart grants, the executor holds five
  read-only browser grants for the web pack's self-check (quick 38)".
Run `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> changelog check 3.1.0` and the doc-refs and
rename-guard tests. Commit only the files you edited:
`docs(quick-38): changelog and guide for soft dependencies and the web self-check`.
  </action>
  <verify>
`node --test plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs`: 0 fail.
The scoped set (validation_gates) gives 0 fail. `npm test` gives no failures beyond those attributed to quick 37.
`sed -n 5p <repo>/plugins/aoforge/agents/executor.md` ends with the five grants.
`changelog check 3.1.0` is ok, unless CHANGELOG.md was left pending; then the SUMMARY says so.
`git log --oneline BASE..HEAD -- <this task's files>` shows Task 2's RED, fragment, grant and docs commits.
  </verify>
  <done>When the web pack is active, `stack context executor` lists the web self-check fragment. That includes
Flutter projects selected through the soft dependency. Mobile-only Flutter, Go and no-stack projects do not get it.
The executor can run the self-check: it holds exactly five read-only browser grants, and the neutrality guard allows
only those, on that one line. The verifier fragment uses the self-check record. CHANGELOG and doc lines are in place,
or listed as pending because quick 37 had uncommitted work in those files.</done>
  <recovery>If the grant is vetoed after the fact, `git revert <grant sha>` and drop the GRANT_ALLOW entry and
test 15 in a follow-up commit. The fragment then skips with `SKIPPED (no browser tools ...)` in spawned executors
and still runs in inline sessions. If quick 37 is still editing a CHANGELOG or CLAUDE.md, never wait in a loop and
never commit its hunks: write the pending lines into the SUMMARY.</recovery>
</task>

</tasks>

<verification>
- `npm test`: no new failures against BASE. `tests` and `pass` grow only by the tests added here. `skipped` is
  unchanged. Quick 37 failures are listed with file names.
- `git log --oneline BASE..HEAD --author="$(git config user.name)"` and the commit subjects show the quick 38
  commits: Task 1 RED and GREEN; Task 2 RED, fragment, grant and docs. All of them went through `aof-tools commit`.
- `git diff BASE --stat -- <files_modified>` lists only files in `files_modified`. Quick 37's files show only its
  own commits.
- A scratch fixture with `extends: flutter` and a `platform: [mobile, web]` TRD lists both packs in
  `stack context verifier` and `stack context executor`. A `platform: [mobile]` fixture lists only flutter.
- No push, tag or release. Nothing is written under `~/.claude` or `/Users/justin/dev/aoforge-claude`. No port 8080
  anywhere in the diff except the "never 8080" rule text: `git diff BASE -- <files_modified> | rg -n '8080'` shows
  only those lines.
</verification>

<success_criteria>
- Flutter web coverage reaches the web pack's verifier fragment and web-ui-verifier whenever the project asks for
  web. When the pack is missing, the coverage is visibly SKIPPED and sent to a human, never silently dropped.
- The executor again does a light browser self-check on web UI work. That check lives in the web pack, and core
  carries only five read-only tool grants.
- Core stays stack-neutral: selection is driven by manifest data, and the neutrality guard is narrower, not looser.
</success_criteria>

<output>
Write the SUMMARY text into the draft
`/var/folders/j2/r369kq256wd5qg5yn51x376m0000gn/T/aoforge-drafts/aoforge-claude-df646fc2/quick/38-flutter-web-selects-web-pack-web-pack-ex/38-SUMMARY.md`.
Publish it with
`node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> quick summary 38 --from <that draft> --raw`.
Its JSON `path` must be under `<repo>`; if it is not, stop and report. Do not commit the SUMMARY: the orchestrator
does that.
Include:
- BASE, the npm test totals at BASE and at the end, and the per-file counts before and after;
- each RED failure message;
- every commit hash, with the grant commit called out so the user can revert it alone;
- the probe output for the web and mobile-only Flutter fixtures (`packs.active`, `packs.subagents`);
- the `stack doctor --raw` text for the web-absent fixture;
- any failures attributed to quick 37;
- `## Pending CHANGELOG and doc lines` if step 5 skipped any file.
</output>
