# Flutter planner rules

Read by the planner when `stack context planner` lists this fragment: the project selected the
flutter or dart stack profile (objective 77 moved it out of agents/planner.md). Run it after the
initial task breakdown and before `<step name="build_dependency_graph">`.

## Flutter UI scope sub-procedure (REQ-10-03)

After initial task breakdown — but BEFORE `<step name="build_dependency_graph">` — invoke the Flutter UI scope detector:

```bash
FLUTTER_UI_SCOPE=$(node ~/.claude/aoforge/stacks/flutter/bin/aof-flutter.cjs detect flutter-ui-scope "$OBJECTIVE" --raw)
DETECTED=$(echo "$FLUTTER_UI_SCOPE" | jq -r '.detected')
```

If `DETECTED == "true"`:

1. **Set type=ui + stack=flutter + platform=[mobile, web] on each TRD touching lib/**/*.dart:**
   For each drafted TRD whose `files_modified` includes paths matching `lib/**/*.dart`:
   - Set `type: ui` (third valid type alongside `standard` and `tdd`)
   - Set `stack: flutter`
   - Set `platform: [mobile, web]` — **DEFAULT for Flutter UI TRDs.** BOTH platforms are required coverage. Narrow only with explicit user-locked decision in OBJECTIVE.md.
   - Extract `state_management:` from the detector output: `<riverpod|bloc|setState|other>`

2. **Semantic field requirement for each type=ui artifact:**
   For each entry in `must_haves.artifacts` of a `type: ui` TRD, require ALL of:
   - `states:` — non-empty list of state names (e.g., `[loading, data, error, empty]`)
   - `tests.widget:` — path to widget test file
   - `tests.integration:` — path to integration_test file. **Used by BOTH platforms** — mobile runs `flutter test <path>`, web runs `flutter drive --driver=test_driver/integration_test.dart --target=<path> -d chrome`.
   - `tests.maestro:` — path to Maestro flow YAML. **Mobile-only by design** — Maestro on Flutter web is blocked upstream (mobile-dev-inc/maestro#2591). The web verifier is `flutter drive`, not Maestro.

   `tests.widget`/`tests.integration` paths are package-relative (relative to the resolved Flutter `packageDir`), never prefixed with `flutter/`.

   These are SEMANTICALLY required by the planner — the validator schema (FRONTMATTER_SCHEMAS.trd) does NOT enforce them. The planner is the gate.

   Use the state-pattern catalog at `~/.claude/aoforge/stacks/flutter/references/flutter-state-patterns.md` for guidance on what `states:` values are conventionally expected per state_management library:
   - **riverpod**: `[loading, data, error, empty]` (or subset)
   - **bloc**: `[initial, loading, data, error]` (or subset; custom state names may need Phase-2 aliases)
   - **setState**: `[loading, data, error, empty]` (or subset; lower confidence in regex coverage)
   - **other**: planner emits PLANNING INCONCLUSIVE and asks user to declare states explicitly OR drop to truths-only (rare escape hatch).

3. **Auto-emit the ui-eval visual gate (P5).** When flutter-ui scope is detected, auto-emit a
   ui-eval state-matrix manifest stub (Shape-A: a `states` array with per-state `id`/`route`/
   `data_state`/`expected`) referenced from the objective, AND declare the verifier visual gate —
   i.e. record that verifier Step 8c will run `aof-flutter verify flutter-ui-eval "$OBJECTIVE" --raw`
   on this objective. This is exactly parallel to how the state-coverage semantic fields are
   auto-required above; visual eval becomes opt-out, not opt-in. The emit decision is the pure
   `decideUIEvalDefault` in `bin/lib/flutter-ui-eval-planner-default.cjs` (emit iff detected). A
   non-ui objective gets neither stub nor gate.

   **Write the gate as a VISIBLE, reviewable call-out (CALLOUT-01).** When `decideUIEvalDefault`
   returns `emit:true`, it ALSO returns a `callout` string and a `tasks` array
   (`{subject,description}` descriptors: author the ui_eval state-matrix manifest; run the
   `/aoforge-stack-flutter:ui-eval` visual gate). Do NOT keep the gate implicit. Write a visible
   `## Visual-Eval Gate (auto-required)` section into the plan output (the objective's
   PLAN/SUMMARY artifact, or a clearly-marked block in the generated TRD) containing the returned
   `callout` line followed by the `tasks` rendered as a checklist, e.g.:

   ```markdown
   ## Visual-Eval Gate (auto-required)

   <callout line from decideUIEvalDefault>

   - [ ] <tasks[0].subject> — <tasks[0].description>
   - [ ] <tasks[1].subject> — <tasks[1].description>
   ```

   This makes the auto-required gate a reviewable artifact a human sees explicitly, not just the
   silently-injected manifest stub. A non-ui objective (emit:false) writes NO such section.

4. **PLANNING INCONCLUSIVE on any missing field:**
   If ANY `type: ui` artifact lacks ANY of the four required fields above, emit a structured `## PLANNING INCONCLUSIVE` block listing each missing field per artifact, then HALT. Do NOT write the TRD files. Return to the orchestrator with the inconclusive block.

   Example PLANNING INCONCLUSIVE output:
   ```
   ## PLANNING INCONCLUSIVE

   The following Flutter UI TRDs are missing required fields:

   ### TRD 10-03 → artifact `lib/screens/user_list.dart`
   - Missing: `states:` (no state names declared)
   - Missing: `tests.maestro:` (no Maestro flow path; required for mobile coverage)

   Either:
   - Provide the missing fields in the objective context (locked design decisions), or
   - Drop scope to a non-UI TRD (set `type: standard` and remove Flutter UI fields).
   ```

5. **If detected=false:** proceed normally. No Flutter UI fields added; the rest of `break_into_tasks` is unchanged.

6. **Failsafe:** If the detector returns `{ detected: false, error: ... }` (e.g., no pubspec, no .aoforge/objectives, etc.), treat as detected=false and proceed normally. Do NOT block planning on detector errors.

7. **Auto-note the ADVISORY design-review pass (Phase B).** When flutter-ui scope is detected,
   ALSO note an ADVISORY design-review pass for the objective — PARALLEL to the ui-eval visual
   gate above, but with a CRUCIALLY DIFFERENT contract: the design-review pass is **advisory and
   NEVER gates.** Where the ui-eval visual gate (verifier Step 8c) can FAIL the objective on a
   broken surface, the design-review pass (verifier Step 8d) only ever records advisory design-debt
   notes + candidate todos for FUTURE UI objectives — it can never change THIS objective's verdict.
   The decision is the pure `decideDesignReviewDefault` in
   `bin/lib/flutter-ui-eval-planner-default.cjs` (enable iff detected). It ALWAYS returns
   `advisory:true` and `gating:false`; a non-ui objective gets `enabled:false` (and still
   `advisory:true`/`gating:false`).

   **Write it as a VISIBLE call-out, distinct from the visual gate.** When
   `decideDesignReviewDefault` returns `enabled:true`, it returns a `callout` string and a
   `tasks` array (author the design-review manifest; run the `/aoforge-stack-flutter:design-review` advisory
   sweep). Write a `## Advisory Design Review (auto-noted)` section into the plan output containing
   the returned `callout` line followed by the `tasks` rendered as a checklist, e.g.:

   ```markdown
   ## Advisory Design Review (auto-noted)

   <callout line from decideDesignReviewDefault — explicitly ADVISORY, never gates>

   - [ ] <tasks[0].subject> — <tasks[0].description>
   - [ ] <tasks[1].subject> — <tasks[1].description>
   ```

   **Cadence (document this in the section):** the heavy first-run sweep is the user-invoked
   `/aoforge-stack-flutter:design-review`; thereafter a lightweight advisory pass runs on each UI objective's
   surfaces (verifier Step 8d). High-priority design debt becomes candidate todos / scope for future
   UI-polish objectives — NEVER a blocker for the current objective. A non-ui objective
   (`enabled:false`) writes NO such section.

## TRD frontmatter for type: ui

The fields steps 1-2 set and require, as they appear in a TRD's frontmatter (core's TRD template
documents only `type: ui`, `platform`, which core reads, and the core `api_contract` field):

```yaml
type: ui
# ── Flutter UI fields (OPTIONAL — present only when type: ui) ──
# When type: ui, the planner (TRD 10-03) requires all of these via PLANNING INCONCLUSIVE.
# The validator schema (FRONTMATTER_SCHEMAS.trd) does NOT enforce them — non-UI TRDs are unaffected.
stack: flutter                 # currently only 'flutter' is meaningful for type: ui
platform: [mobile, web]        # DEFAULT for Flutter UI TRDs: BOTH platforms are required coverage.
                               # Allowed: [mobile, web], [mobile], [web]. Default if planner detects Flutter UI scope: [mobile, web].
state_management: riverpod     # one of: riverpod | bloc | setState | provider | other
# The per-artifact `states:` and `tests:` sub-fields live under must_haves.artifacts:
# must_haves:
#   artifacts:
#     - path: "lib/screens/user_list_screen.dart"
#       provides: "User list screen"
#       contains: "AsyncValue"
#       states: [loading, data, error, empty]   # NEW: required for type: ui artifacts
#       tests:                                  # NEW: required for type: ui artifacts
#         widget: "test/screens/user_list_screen_test.dart"
#         integration: "integration_test/user_list_flow_test.dart"
#         maestro: ".maestro/user_list.yaml"
```

| Field | Required when `type: ui` | Purpose |
|---|---|---|
| `stack` | Yes | Stack family. Currently only `flutter` is meaningful. |
| `platform` | Yes | Array of `mobile`, `web`. **Default `[mobile, web]`**: both platforms are required coverage. Narrow only if a TRD genuinely targets a single platform. |
| `state_management` | Yes | `riverpod`, `bloc`, `setState` or `other`: what `detect flutter-ui-scope` returns. `provider` is accepted but has no catalogue in `flutter-state-patterns.md`, so state coverage scores it like `other`. Selects the state-coverage regex set. |
| `must_haves.artifacts[*].states` | Yes (per artifact) | Non-empty list of state names this artifact must render and test. |
| `must_haves.artifacts[*].tests.widget` | Yes (per artifact) | Path to the widget test file. |
| `must_haves.artifacts[*].tests.integration` | Yes (per artifact) | Path to the integration_test file: one path, both platforms (step 2). The executor's bootstrap setup task scaffolds the `test_driver/integration_test.dart` driver. |
| `must_haves.artifacts[*].tests.maestro` | Yes (per artifact) | Path to the Maestro flow YAML, mobile-only (step 2). There is no web opt-in flag: web coverage flows entirely through `tests.integration`. |

A TRD outside this scope omits every field above and still validates. The executor runs
`tests.integration` twice, once per platform with a different driver: `flutter test` on mobile,
and on web `flutter drive` against a running chromedriver. `flutter drive` is the web-tier
black-box verifier because Maestro's web semantics overlay is broken upstream.
