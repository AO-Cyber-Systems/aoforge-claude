# Flutter UI executor procedure

Read by the executor only when the TRD frontmatter has `type: ui` AND `stack: flutter`. For every
other TRD none of it applies, which is why it is not in `agents/executor.md` (TRD 76-05: it was
about 21% of the executor prompt, paid on every spawn). The three sections run at three points:
the bootstrap detector before any task, the per-task gates after each task, the post-all-tasks
gate before the final commit and SUMMARY. `agent-shell-harness.test.cjs` executes their bash
blocks end to end, so edit the commands here, not a copy.

## Flutter UI bootstrap detector (REQ-10-07)

If the TRD has `type: ui` AND `stack: flutter`, run the bootstrap detector at executor start (BEFORE executing any tasks):

```bash
# One plain command per Bash call. There is nothing to assign: a shell variable does NOT
# survive into the next call, so read `.action` and `.packageDir` straight out of this
# tool result and note them down as literal absolute paths.
# harness: subst node ~/.claude/aoforge/bin/aof-tools.cjs=aof-tools
node ~/.claude/aoforge/bin/aof-tools.cjs verify flutter-ui-bootstrap . --raw

# The repo root is the session's working directory.
pwd
```

The repo root is read here, at the repo root, and both values are worth noting down as literal absolute paths (they will not survive into the next Bash call — that is why nothing above assigns them to a variable); every evidence path below is absolute from `$REPO_ROOT`, never `$OLDPWD` (in this harness the working directory persists across Bash tool calls while shell state does not, so `$OLDPWD` is never a reliable repo root). `PACKAGE_DIR` is read straight from `.packageDir` with no further resolution — `aof-tools verify flutter-ui-bootstrap`'s `packageDir` is already absolute per the W0-4 contract, so re-deriving it (e.g. `cd "$REPO_ROOT/$PACKAGE_DIR" && pwd`) would be redundant.

Every flutter/maestro/adb command in this agent runs from `$PACKAGE_DIR` **in a subshell** — `( cd "$PACKAGE_DIR" && <cmd> )` — never a bare `cd "$PACKAGE_DIR" && <cmd>`. The working directory of the session stays the repo root: the harness persists cwd across Bash tool calls, and `.aoforge/` paths (marker, evidence, `aof-tools` state) resolve from cwd, so a leaked `cd` breaks every later call. Evidence `mv`/`--output` targets are absolute from `$REPO_ROOT`; the `.aoforge/` marker and evidence paths stay at the repo root.

Shell variables do NOT persist across Bash tool calls either, so `$REPO_ROOT`, `$PACKAGE_DIR`, and `$OBJECTIVE_DIR` in the examples below are placeholders for a single call. `$OBJECTIVE_DIR` comes from `objective_dir` in the `init execute-objective` JSON (extracted above at agent start) — it does not survive into later calls any more than the other two do. Each Bash call must do one of:

1. **Preferred (cheaper): substitute the literal absolute paths** you learned at bootstrap — write `( cd /abs/path/to/flutter && flutter test ... )` and `mv /abs/path/to/flutter/build/... /abs/repo/.aoforge/...` directly. No re-derivation, no extra process.
2. Re-derive at the top of the call: `REPO_ROOT=$(git rev-parse --show-toplevel)`, `PACKAGE_DIR=$(node ~/.claude/aoforge/bin/aof-tools.cjs verify flutter-ui-bootstrap . --raw | jq -r .packageDir)`, and `OBJECTIVE_DIR=$(node ~/.claude/aoforge/bin/aof-tools.cjs init execute-objective "$OBJECTIVE" | jq -r .objective_dir)`.

Never assume a variable set in an earlier call is still defined.

| ACTION | Behavior |
|--------|----------|
| skip | All required infra present (pubspec dev_dep + integration_test/ + .maestro/ + test_driver/integration_test.dart) and marker exists. Continue normally. |
| warn | First-run, missing some infra. Extract `.setup_task` from the JSON and insert it as a NEW task ahead of all other tasks. The setup task carries `caution="pause-before-destructive"` so the user reviews the proposed pubspec changes before commit. It scaffolds the test_driver/integration_test.dart driver REQUIRED for web `flutter drive` verification. |
| fail | Marker file present + infra still missing. HARD FAIL the executor with a structured error pointing to the missing items. The user must restore the infra OR delete the marker to re-run the bootstrap. |

**Extracting the setup task (action:warn):**

Take `.setup_task` from the detector output above — it is a fully-formed `<task>` XML block
from TRD 10-04a's bootstrap detector — and insert it as the FIRST task in the task list,
before all TRD-defined tasks. There is deliberately no shell step here: piping the field
through `jq` into a shell variable would only lose it at the end of that Bash call.

**Hard fail (action:fail):**

```bash
# The missing items are the `.missing` array in the detector output above — quote them
# into the message you return. `$MISSING` from an earlier call no longer exists here.
echo "EXECUTOR HARD FAIL: Flutter UI bootstrap infra missing after marker set."
echo "Restore the missing infra OR delete .aoforge/.flutter-ui-bootstrap-done to re-run bootstrap."
# harness: expect-exit 1
exit 1
```

For non-Flutter TRDs (type != ui OR stack != flutter), skip this detector entirely.

The bootstrap detector is shipped by TRD 10-04a (`lib/flutter-ui-bootstrap.cjs` + aof-tools subcommand). See `~/.claude/aoforge/references/flutter-state-patterns.md` "Web verification mechanism" section for why test_driver/integration_test.dart is required (web verification flows through `flutter drive --driver=test_driver/integration_test.dart`).

## Flutter UI per-task verification (REQ-10-04)

If TRD frontmatter has `type: ui` AND `stack: flutter`, apply these gates PER TASK in addition to the standard per-task verification. Do not rely on cwd between calls; every command names its directory explicitly.

### Per-task: flutter analyze (baseline-diff)

`flutter analyze` exits non-zero on any warning, including pre-existing. Per RESEARCH.md Pitfall #6, compare against a baseline captured at task START:

The baseline lives in a file, not a shell variable — task START and task END are separate Bash calls, and variables do not survive between them.

```bash
# At task START (capture baseline to a file under the evidence dir)
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
mkdir -p "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
# harness: derive PACKAGE_DIR={root}/flutter
# harness: expect .aoforge/objectives/34-demo/evidence/analyze-baseline.txt
( cd "$PACKAGE_DIR" && flutter analyze --no-pub --no-fatal-warnings 2>&1 | sort ) > "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/analyze-baseline.txt

# At task END: the CURRENT output goes to a SECOND FILE, not a shell variable. Task START
# and task END are separate Bash calls, so `$CURRENT_ANALYZE` would not exist by now.
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
# harness: derive PACKAGE_DIR={root}/flutter
# harness: expect .aoforge/objectives/34-demo/evidence/analyze-current.txt
( cd "$PACKAGE_DIR" && flutter analyze --no-pub --no-fatal-warnings 2>&1 | sort ) > "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/analyze-current.txt

# One call compares the two FILES. `grep` exits 1 when there is nothing new, which is the
# PASSING case, so the `||` branch reports it; read the result from the tool output.
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
diff "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/analyze-baseline.txt "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/analyze-current.txt | grep '^>' || echo "OK: no new flutter analyze warnings"
```

Any line the comparison prints is a warning this task introduced: apply deviation Rules 1-3
to fix it, and if 3 attempts are exhausted, document it as a Deferred Issue.

### Per-task: flutter test on the task's widget test

If the task's `<files>` includes a path ending in `_test.dart` AND the task is `tdd="true"`:

```bash
# RED phase — MUST exit non-zero (test fails on missing implementation)
# harness: derive PACKAGE_DIR={root}/flutter
# harness: subst <path/to/test.dart>=integration_test/red_phase_test.dart
# harness: expect-exit 1
( cd "$PACKAGE_DIR" && flutter test <path/to/test.dart> )

# GREEN phase (after implementation) — MUST exit zero
# harness: derive PACKAGE_DIR={root}/flutter
# harness: subst <path/to/test.dart>=integration_test/app_test.dart
( cd "$PACKAGE_DIR" && flutter test <path/to/test.dart> )
```

TRD test paths are package-relative (relative to `$PACKAGE_DIR`), never prefixed with `flutter/`.

For non-tdd tasks with a widget test path, run once at task end; MUST exit zero.

**If `flutter` is not installed:** If `command -v flutter` fails AND TRD has `type: ui`, emit a checkpoint asking the user to install Flutter or run from a project where it IS installed. Do NOT silently skip verification.

## Flutter UI post-all-tasks verification (REQ-10-04)

After ALL tasks complete (before final commit + SUMMARY), if TRD has `type: ui` + `stack: flutter`, run the post-all-tasks gate. **Iterate over each platform in TRD frontmatter `platform:`** — invocations differ per platform.

**Pre-create evidence dir:**

```bash
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
mkdir -p "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/
```

**Per-platform integration_test + Maestro invocations:**

Read `platform:` from TRD frontmatter (default `[mobile, web]` per TRD 10-03's planner gate). For each platform:

**Mobile** (`mobile` in platform):

```bash
# Requires booted emulator. If not booted, emit checkpoint asking user to boot one.
# harness: derive PACKAGE_DIR={root}/flutter
( cd "$PACKAGE_DIR" && flutter test integration_test/ )

# Move screenshots (from takeScreenshot() calls inside integration_test files):
# Both sides absolute — no cd, so this command doesn't depend on cwd at all.
# harness: derive PACKAGE_DIR={root}/flutter
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
# harness: expect .aoforge/objectives/34-demo/evidence/shot.png
mv "$PACKAGE_DIR"/build/integration_test_screenshots/* "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/ 2>/dev/null || true

# Build + install app for Maestro:
# harness: derive PACKAGE_DIR={root}/flutter
# harness: expect flutter/build/app/outputs/flutter-apk/app-debug.apk
( cd "$PACKAGE_DIR" && flutter build apk --debug )
# harness: derive PACKAGE_DIR={root}/flutter
( cd "$PACKAGE_DIR" && adb install -r build/app/outputs/flutter-apk/app-debug.apk )

# Run Maestro flows (MOBILE ONLY — Maestro is mobile-only by design):
# See references/flutter-state-patterns.md "Web verification mechanism" — upstream blocker
# mobile-dev-inc/maestro#2591 (open since July 2025, unresolved mid-2026). NO MAESTRO ON WEB.
# harness: derive PACKAGE_DIR={root}/flutter
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
# harness: expect .aoforge/objectives/34-demo/evidence/maestro.xml
( cd "$PACKAGE_DIR" && maestro test .maestro/ \
  --format junit \
  --output "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/maestro.xml )

# Maestro screenshots — source is already absolute (~), destination is absolute from $REPO_ROOT:
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
# harness: expect .aoforge/objectives/34-demo/evidence/flow-1.png
mv ~/.maestro/tests/*/screenshots/* "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/ 2>/dev/null || true
```

**If `maestro` is not installed:** Emit a checkpoint. Do not silently skip. Install: `curl -fsSL "https://get.maestro.dev" | bash`.

**Web** (`web` in platform):

```bash
# Requires chromedriver running (port 4444). If not running, emit checkpoint.
# The exit 1 below is CORRECT: it is the checkpoint branch, not a failure of this prose.
# harness: expect-exit 1
pgrep chromedriver >/dev/null || { echo "CHECKPOINT: Start chromedriver --port=4444 in another terminal"; exit 1; }

# Per references/flutter-state-patterns.md "Web verification mechanism":
# WEB uses flutter drive invoking the SAME tests.integration path that mobile uses via flutter test.
# The test_driver/integration_test.dart driver is scaffolded by TRD 10-04a's bootstrap setup task.
# DO NOT use `flutter test integration_test/ -d chrome` — deprecated for web (Pitfall #1).
# harness: derive PACKAGE_DIR={root}/flutter
# harness: subst <tests.integration path from TRD>=integration_test/app_test.dart
# harness: expect flutter/build/integration_test_screenshots/web-shot.png
( cd "$PACKAGE_DIR" && flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=<tests.integration path from TRD> \
  -d chrome )

# Move web integration_test screenshots:
# Both sides absolute — no cd, so this command doesn't depend on cwd at all.
# harness: derive PACKAGE_DIR={root}/flutter
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
# harness: expect .aoforge/objectives/34-demo/evidence/web-shot.png
mv "$PACKAGE_DIR"/build/integration_test_screenshots/* "$REPO_ROOT"/.aoforge/objectives/$OBJECTIVE_DIR/evidence/ 2>/dev/null || true

# NO MAESTRO ON WEB — Maestro is mobile-only BY DESIGN.
# See references/flutter-state-patterns.md "Web verification mechanism" section.
# Upstream blocker: mobile-dev-inc/maestro#2591 (open since July 2025, unresolved mid-2026).
echo "Web verification complete — flutter drive ran tests.integration. Maestro not invoked on web (mobile-only by design)."
```

**Both platforms are REQUIRED coverage by default.** If `platform:` is missing from TRD, treat it as `[mobile, web]`. If chromedriver isn't available, emit a checkpoint — do NOT silently skip web verification.

**SUMMARY.md evidence attachment:**

After all verification commands run, add this section to your SUMMARY draft:

```markdown
## Flutter UI Evidence

- Mobile integration_test screenshots: .aoforge/objectives/<obj>/evidence/<file>.png (N files)
- Web flutter drive screenshots: .aoforge/objectives/<obj>/evidence/<file>.png (N files)
- Maestro junit XML (mobile): .aoforge/objectives/<obj>/evidence/maestro.xml
- Maestro screenshots (mobile): .aoforge/objectives/<obj>/evidence/<flow>-<step>.png (N files)
- flutter analyze: clean (no new warnings vs baseline)
- Platforms verified: [mobile, web]  <- from TRD frontmatter `platform:` field
```

**Failure handling:**

If any post-all-tasks gate fails:
- Apply deviation Rule 1 (auto-fix bug) for genuine test failures.
- Apply deviation Rule 3 (auto-fix blocking) for missing emulator/chromedriver — emit checkpoint to user.
- Document as Deferred Issue if 3 fix attempts exhausted (per existing FIX ATTEMPT LIMIT in scope_boundary).

For non-Flutter TRDs (type != ui OR stack != flutter), skip ALL Flutter UI verification.

**Flutter UI reference docs:**
- `~/.claude/aoforge/references/flutter-state-patterns.md` — state-coverage regex catalog AND "Web verification mechanism" section (why tests.maestro is mobile-only-by-design; why flutter drive is the web verifier)
- `aof-tools verify flutter-ui-bootstrap` — bootstrap gate at executor start (REQ-10-07; shipped by TRD 10-04a)
