# Flutter verifier procedure

Read by the verifier when `stack context verifier` lists this fragment: the project selected the
flutter or dart stack profile (objective 77 moved it out of agents/verifier.md). Each section names
the core step it belongs to; run it there. Every gate in it applies only to a TRD with `type: ui`
and `stack: flutter`; for any other TRD, skip it.

## Runtime mapping (Step 8)

- `mobile` runtime, or TRD `must_haves.platform: mobile` → Step 8b below (Maestro via its CLI).
- `web` runtime, or a TRD whose `platform` (or `must_haves.platform`) includes `web` → the web pack's verifier fragment and its `aoforge-stack-web:web-ui-verifier` agent, run against a `flutter build web --release` bundle served statically on port 8091 (never 8080), with `?enable-semantics=true`. This pack lists the web pack in `soft_depends`, so `stack context verifier` lists it for such a project whenever it is installed and not in `stacks.disabled`. Never `flutter run -d web-server`/`-d chrome` for capture: DWDS wedges into a blank page with no console error.
- **Web pack not active.** If `stack context verifier` lists no `web` pack, record each Flutter web surface as `? SKIPPED (web pack not active: /plugin install aoforge-stack-web@aocyber, or remove "web" from stacks.disabled)` and put it on the Step 9 human-verification list. This happens when aoforge-stack-web is not installed or not enabled (`aof-tools stack doctor` warns) or when `stacks.disabled` names it. Never report Flutter web coverage as passed without the web pack. Pack selection reads only explicit `platform` values, but a `type: ui` TRD with no `platform` still counts as `[mobile, web]` for these gates: handle its web half the same way when the web pack is not listed.

## Step 4: artifact state coverage

### Flutter UI state coverage (REQ-10-05)

For each `type: ui` + `stack: flutter` TRD, run the state-coverage gate after Levels 1-2 (exists + substantive) and before Level 3 (wiring):

```bash
STATE_COV=$(node ~/.claude/aoforge/stacks/flutter/bin/aof-flutter.cjs verify flutter-state-coverage "$TRD_PATH" --raw)
```

Parse JSON shape: `{ trd_path, state_management, artifacts: [{artifact, status, coverage, blockers, advisories}], overall }`.

For each artifact result:
- `status: 'verified'` → VERIFIED. No action.
- `status: 'partial'` → record per-state coverage in VERIFICATION.md `partial_state_coverage:` section. blockers go to `gaps:`, advisories go to `notes:`.
- `status: 'missing'` → all declared states unmet — record as gap (`gaps:` section).
- `status: 'missing_test_file'` → the artifact's `tests.widget` path doesn't exist on disk. Record as blocker gap.
- `status: 'skipped'` → `state_management: other`. Advisory only.

Confidence model honored by aof-tools (HIGH-only patterns → blockers; MEDIUM/LOW → advisories). Verifier does not need to re-implement confidence routing.

### Optional: Semantics() wrappers check (REQ-10-05 advisory)

For each `type: ui` artifact:
```bash
WIDGET_TEST=<path>
SOURCE=<artifact.path>
if [ -f "$SOURCE" ] && ! grep -q "Semantics(" "$SOURCE"; then
  echo "Advisory: $SOURCE has no Semantics() wrappers — Maestro selectability may be impaired."
fi
```

Emit as VERIFICATION.md `notes:` entry, never blocker.

## Step 8b: mobile runtime

### Step 8b: Flutter — Maestro MCP

`$PACKAGE_DIR` is `.packageDir` from `aof-flutter verify flutter-ui-bootstrap . --raw` (repo root in a single-package repo, `flutter/` in a monorepo); run every flutter/adb/maestro command below from `$PACKAGE_DIR` in a subshell — `( cd "$PACKAGE_DIR" && <cmd> )` — while evidence paths stay absolute from the repo root.

**Prereqs (check, do not install):**
```bash
command -v maestro >/dev/null || { echo "maestro not installed — skip with SKIPPED status"; }
# Install hint for user: curl -fsSL "https://get.maestro.mobile.dev" | bash
```

**Emulator readiness (open-source path):**
```bash
# Android
$ANDROID_HOME/emulator/emulator -avd "$AVD_NAME" -no-snapshot -no-audio -no-window &
timeout 60 bash -c 'until adb shell getprop sys.boot_completed 2>/dev/null | grep -q 1; do sleep 2; done'
# iOS (macOS only)
xcrun simctl boot "iPhone 15" && xcrun simctl bootstatus "iPhone 15" -b
```

**Build and install the app:**
```bash
( cd "$PACKAGE_DIR" && flutter build apk --debug )
( cd "$PACKAGE_DIR" && adb install -r build/app/outputs/flutter-apk/app-debug.apk )
# or for iOS: ( cd "$PACKAGE_DIR" && flutter build ios --debug && xcrun simctl install booted build/ios/iphonesimulator/Runner.app )
```

**Protocol:**

1. Flows live at `.aoforge/objectives/<obj>/verification/*.yaml`. If the agent that planned this objective did not author flows, derive one per truth from Step 3 now and write it.

   Minimal flow:
   ```yaml
   appId: com.example.myflutterapp
   ---
   - launchApp
   - assertVisible: "Welcome"
   - tapOn: "Sign In"
   - assertVisible: "Dashboard"
   - takeScreenshot: dashboard
   ```

2. Run flows via Maestro MCP (invoke `maestro mcp` server, or subprocess `maestro test`):
   ```bash
   REPO_ROOT=$(git rev-parse --show-toplevel)
   ( cd "$PACKAGE_DIR" && maestro test "$REPO_ROOT"/.aoforge/objectives/"$OBJECTIVE_DIR"/verification/ \
     --format junit --output "$REPO_ROOT"/.aoforge/objectives/"$OBJECTIVE_DIR"/evidence/maestro.xml )
   ```

3. For state inspection between steps, call `maestro hierarchy` — returns JSON view tree (text, resource-id, bounds, clickable, children). Parse to verify expected elements present.

4. Capture screenshots via `takeScreenshot` steps in the flow; they land in the Maestro output dir — move to `.aoforge/objectives/<obj>/evidence/`.

5. Cleanup: `adb emu kill` or `xcrun simctl shutdown booted` if started here.

**Flutter semantics note:** Maestro reads Flutter's SemanticsNode tree automatically. No extra config needed on mobile. For Flutter web, run `flutter build web --release`, serve `build/web` statically, and append `?enable-semantics=true` to the URL so Playwright sees a real a11y tree. Never `flutter run -d web-server`/`-d chrome` for capture — DWDS wedges into a blank page with no console error.

### Step 8b: Maestro orphan-flow detection (REQ-10-05)

After running Maestro flows, cross-reference the on-disk `.maestro/*.yaml` files against TRD `must_haves.artifacts[*].tests.maestro` references:

```bash
DECLARED=$(find .aoforge/objectives/$OBJECTIVE_DIR -name '*-TRD.md' -exec grep -h '^\s*maestro:' {} \; | sed -E 's/^\s*maestro:\s*//' | sort -u)
ACTUAL=$(find .maestro -name '*.yaml' 2>/dev/null | sort -u)

ORPHANS=$(comm -23 <(echo "$ACTUAL") <(echo "$DECLARED"))
```

For each orphan flow, record an entry under the report's `notes:` section:
```yaml
notes:
  - kind: maestro_orphan_flow
    path: .maestro/foo.yaml
    note: "Flow file present but not referenced by any TRD's tests.maestro. Legitimate bootstrap flows (e.g., app_launch.yaml) are expected — review before deleting."
```

Orphans are advisory, never blocking.

## Steps 8c and 8d: visual eval and design review

### Step 8c: Visual UI eval (P3)

Machine-judge visual correctness of every captured Flutter UI surface BEFORE escalating it to a human. This consumes the already-shipped offline scoring engine (`flutter-ui-eval.cjs`); it does not pick a vision model id or re-implement scoring.

**Gate:** run ONLY when the objective has >=1 TRD with `type: ui` + `stack: flutter`. Otherwise skip silently (mirror the REQ-10-06 non-Flutter skip).

**Call the engine arm:**

```bash
UI_EVAL=$(node ~/.claude/aoforge/stacks/flutter/bin/aof-flutter.cjs verify flutter-ui-eval "$OBJECTIVE" --raw)
```

The engine resolves `"$OBJECTIVE"` to a manifest — or explains why it could not — via `resolveUIEvalTarget` (`bin/lib/flutter-ui-eval-resolve.cjs`), and reports one of four honest `resolution` values. **Route by `resolution` first — only a `resolved` result carries a scoreRun rollup at all.**

**Route by `resolution` (the load-bearing contract):**

| `resolution` | Meaning | Action |
|---|---|---|
| `not_applicable` | No TRD in this objective is `type: ui` + `stack: flutter` | **Skip silently.** No VERIFICATION.md entry, no note, exit 0. Unchanged behaviour for non-Flutter objectives. |
| `absent` | UI TRDs exist; no manifest at any location in `searched[]` | **`? MISSING (no ui-eval manifest)`** — append a `notes:` entry naming `searched[]`, **KEEP the surface on the Step 9 `human_verification:` list**, and record a todo to author the manifest. Nothing judged this surface, so a human still must. When `reason: 'unscoped-candidates'`, a repo-root `ui_eval/manifests/*.manifest.json` exists but is **never** auto-picked (W0-3) — name `candidates[]` in the todo instead of assuming one applies to this objective. **Escalate to a `gaps:` entry when the objective declares `visual_gate: true`** (the ratchet: an objective planned after the gate became auto-required has no excuse). |
| `invalid` | A manifest was found but could not be loaded | **`gaps:` entry** carrying the parse reason. A broken gate is a defect, not an absence — never report it as MISSING. |
| `resolved` | Manifest loaded and scored | Route the scoreRun rollup per the verdict rules below. |

**Never a hard fail on `not_applicable` or `absent`.** Only `invalid` and a judged `fail` produce gaps.

**Parse the scoreRun rollup (`resolution: 'resolved'` only):**

Rollup shape: `{ verdict: 'pass'|'pass-with-reviews'|'fail', gate: 'binding'|'advisory', counts, reviews[], fails[], unjudged[], known_broken[], states[] }`. `gate` is the run's STANDING — what authority its verdict carries, independent of outcome. `gate: 'binding'` ONLY when the engine ran with `--judge live` (a real vision comparison per state). `gate: 'advisory'` on the default invocation (no `--judge`, or `--judge labels`) — the offline label-echo judge (network:false), which is a labels LOOKUP, not a visual gate, and must never be treated as one regardless of how clean its verdict is. Each `states[]` entry: `{ state_id, verdict: 'pass'|'review'|'fail', is_broken, defects[], errors[], evidence: 'vision'|'label', known_broken?, max_severity? }`.

**Route per verdict (the load-bearing contract, `resolution: 'resolved'` only):**

- Any state in `fails[]` (verdict `fail`) → append a `gaps:` entry: the defect type/severity + the screenshot evidence path under `.aoforge/objectives/<obj>/evidence/ui_eval/<state_id>.png`.
- `verdict: pass-with-reviews` OR any state in `reviews[]` → append `notes:` entries + a partial section; that surface STAYS on the Step 9 human-verification list.
- Any state in `unjudged[]` (aodex#485 — nothing examined it, distinct from a genuine judge disagreement) → append a `notes:` entry naming it as never judged; that surface STAYS on the Step 9 human-verification list regardless of `gate` or the run's overall verdict.
- Any state in `known_broken[]` (#72 — judged BROKEN, but only MEDIUM/LOW, so below the HIGH-only blocking bar and still `verdict: pass`) → append a `notes:` entry naming it with its `max_severity` and defects. It never fails the gate, but it is a known defect, not a clean pass: that surface STAYS on the Step 9 human-verification list.
- `gate: 'binding'` AND `verdict: pass` (no fails, no reviews, no unjudged, no known_broken) → REMOVE that surface from the Step 9 `human_verification:` list. **This is the ONLY route that may retire a human visual check.** The payoff — machine-judged visual correctness drops off the human queue — requires a binding gate; an offline pass alone never earns it.
- `gate: 'advisory'` → NEVER removes a surface from the Step 9 list, whatever the verdict. Even a clean `verdict: pass` on the default (offline label-echo) path is a labels lookup, not a machine judgment of the pixels — append a `notes:` entry (e.g. "advisory pass — offline label-echo judge, not machine-verified against a binding gate") and leave the surface queued for human visual verification.

For non-Flutter objectives: skip this subroutine.

### Step 8d: Advisory design review (ADVISORY — NEVER GATES)

After the Step 8c defect gate, run a lightweight ADVISORY design-critique pass over this objective's Flutter UI surfaces. **This step is the opposite of Step 8c: it can NEVER gate, fail, or change the pass/fail verdict.** Where Step 8c's defect judge answers "is this surface BROKEN?" and a fail produces a `gaps:` entry, Step 8d's design critic answers "is this GOOD design?" and only ever records ADVISORY notes + candidate todos for FUTURE UI objectives. Do NOT touch or duplicate the Step 8c gating logic.

**Gate:** run ONLY when the objective has >=1 TRD with `type: ui` + `stack: flutter`. Otherwise skip silently.

**Cadence:** the heavy first-run design sweep is the user-invoked `/aoforge-stack-flutter:design-review` (ranked design-debt backlog). Step 8d is the lightweight follow-up — a thin advisory pass on each UI objective's surfaces, so design debt keeps surfacing as the project grows without a full re-sweep each time.

**Run the advisory critic arm (only when a manifest AND a credential exist):**

```bash
# Locate the objective's design-review manifest (same manifest the ui_eval gate uses):
#   .aoforge/objectives/<obj>/evidence/ui_eval/manifest.json  OR  flutter/ui_eval/manifests/*.json
DESIGN_MANIFEST="<resolved manifest path>"

# A credential is required for the live critique (ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN+ANTHROPIC_BASE_URL).
if [ -n "$DESIGN_MANIFEST" ] && [ -f "$DESIGN_MANIFEST" ] && { [ -n "$ANTHROPIC_API_KEY" ] || [ -n "$ANTHROPIC_AUTH_TOKEN" ]; }; then
  DESIGN=$(node ~/.claude/aoforge/stacks/flutter/bin/aof-flutter.cjs flutter-ui design-review "$DESIGN_MANIFEST" --live --raw)
else
  # No manifest OR no credential → NOTE and continue. NEVER block.
  DESIGN='{"advisory":true,"skipped":"design-review skipped (no manifest/credential)"}'
fi
```

Rollup shape (when it runs): `{ advisory:true, total, counts:{high,medium,low}, byDimension, debt[]?, skipped[], report_path }`. `advisory:true` is ALWAYS set — there is NEVER a verdict.

**Route the advisory output (the load-bearing never-gates contract):**

- If `design-review skipped (no manifest/credential)` → record an **advisory note** `design-review skipped (no manifest/credential)` and continue. NOT a gap. NOT a fail.
- High/medium-priority debt items → record them as **advisory notes** in the verification output AND route them to the objective-work loop as **candidate todos** for FUTURE UI objectives (see below). They DO **NOT** create `gaps:` entries, DO **NOT** appear in the Step 11 `gaps:` block, and DO **NOT** change the Step 10 status. Low-priority debt is recorded in the report only.
- On `{ error: ... }` (manifest not found / invalid) → record an advisory note and fall through. NEVER a hard fail.

**Routing high-priority debt → candidate todos (reuse the existing todo mechanism):**

Use the SAME capture verb as `/aoforge:todo add`. For each `high` (and optionally `medium`) debt item, draft the todo and hand it to `aof-tools todo add`. Local mode writes `.aoforge/todos/pending/<date>-<slug>.md` exactly as before; store mode also files it as a todo issue:

```bash
slug=$(node ~/.claude/aoforge/bin/aof-tools.cjs generate-slug "design debt <state_id> <dimension>" --raw)
DRAFT=$(node ~/.claude/aoforge/bin/aof-tools.cjs planning draft todos/pending/<date>-<slug>.md)
# Fill the printed draft path (Write tool) with area: ui, the debt anchor/observation/suggestion,
# and a note that it is a candidate for a FUTURE UI-polish objective (NOT a blocker for THIS one).
node ~/.claude/aoforge/bin/aof-tools.cjs todo add --from "$DRAFT" --stem <date>-<slug>
node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: capture design-debt todo - <state_id> <dimension>" --files .aoforge/todos/pending/<date>-<slug>.md
```

Shell variables do not survive between Bash calls: note the path `planning draft` prints and pass it literally to `--from`. The commit records the file in local mode; in store mode `commit` skips the gitignored cache path.

These candidate todos are scope for a future UI-polish objective; they do not block the current objective and never appear in its gap output.

**In the verifier's final report**, add an `## Advisory Design Review` section listing the high/medium debt items (or "skipped — no manifest/credential") and the `report_path`. Clearly mark it ADVISORY. The Step 10 status and Step 11 `gaps:` block are computed WITHOUT any input from Step 8d.

For non-Flutter objectives: skip this subroutine.

## Step 9: human verification and UAT

- **Surfaces that Step 8c scored `pass` UNDER `gate: 'binding'` (a real `--judge live` comparison) are visual-correctness-verified by the machine judge and MUST NOT appear in this human-verification list.** A `pass` under `gate: 'advisory'` (the default offline label-echo path) is a labels lookup, not a machine judgment — it STAYS on this list. Step 8c `review`/`unjudged`/SKIPPED surfaces also escalate here for visual UX.

### Step 9 (REQ-10-06): Auto-generate UAT for Flutter UI objectives

If the objective contains AT LEAST ONE TRD with `type: ui` + `stack: flutter`, auto-generate the 1-page UAT checklist:

```bash
node ~/.claude/aoforge/stacks/flutter/bin/aof-flutter.cjs generate uat "$OBJECTIVE" --raw
```

Output JSON: `{ generated: true, uat_path: '...', test_count: N }` or `{ error: '...' }`.

On `generated: true`, publish the generated file through the UAT verb (local mode rewrites the same bytes; store mode also queues its wiki page):

```bash
node ~/.claude/aoforge/bin/aof-tools.cjs doc put objectives/{objective_dir}/{phase_num}-UAT.md --from "<uat_path from the JSON>"
```

The generator produces:
- State-coverage rows expanded per platform (e.g., `platform: [mobile, web]` doubles state rows — one row per (state, platform) combination)
- Maestro flow rows (mobile-only by design — Maestro on Flutter web is blocked upstream)
- Web integration rows (`flutter drive` invocations) — when `web` is in the TRD's `platform` field

On success, mention the UAT.md path in the verifier's final report. The user runs through the checklist; results feed back into `/aoforge:verify-work` via the existing UAT.md flow (see `templates/UAT.md` lifecycle section).

If the generator returns an error like "UAT.md already in use; refusing to overwrite" — this means a previous walkthrough is in progress. Report and skip; do NOT regenerate.

For non-Flutter objectives: skip this subroutine. Manual UAT (the existing flow) is unchanged.
