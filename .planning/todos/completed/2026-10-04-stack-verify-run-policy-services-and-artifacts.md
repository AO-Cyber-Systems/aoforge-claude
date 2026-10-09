completed: 2026-10-08
---
created: 2026-10-04T14:00:00.000Z
title: stack verify --run policy for service-backed tests and build artifacts
area: stack-verify
files: [plugins/devflow/devflow/bin/lib/stack-verify.cjs]
---

## Problem

Two gaps found during the objective 43 SDR-08 follow-up run (43-ROLLOUT.md, 2026-10-04):

- **Service-backed tests can reach a local database.** trades `test` ran against whatever was listening on 127.0.0.1:5432. The effect guard snapshots only the work tree, so it cannot see database writes. The run policy refuses port 8080 in command text but has no notion of "this suite needs a dedicated test service".
- **An untracked build artifact halts the rest of the run.** eden-circle `make build` writes `bin/circle-api`, which is untracked and not gitignored. The guard restores it but then marks the root `side-effect-unsafe` and skips every later Flutter gate in that root.

## Solution

- Refuse an opt-in `test` (or require an explicit acknowledgement) when the suite's config or env references a database or service URL (`DATABASE_URL`, `TEST_DATABASE_URL`, `localhost:5432`, docker-compose services) and no dedicated test value is set. Report it as `env_required` rather than running it.
- Classify an artifact a `build` writes into an untracked, unignored output dir (`bin/`, `dist/`, `build/`) as an expected build output. Restore it, but do not halt unrelated components' gates.
