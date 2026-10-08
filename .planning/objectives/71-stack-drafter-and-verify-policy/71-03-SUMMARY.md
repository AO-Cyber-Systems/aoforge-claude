# Objective 71 TRD 03: `stack verify --run` never reaches a service silently Summary

## Progress
- [x] Task 1: Fixture builders: a committed scratch repo and a CI workflow with services — 658b5e6a
- [x] Task 2: CI steps carry their job's service containers and the env names in scope — RED fccb7cfa, GREEN ee1b73fe
- [ ] Task 3: The `env_required` policy, the three signal layers and `--allow-services` — RED committed (this commit); next step: stack-verify.cjs, add RUN_POLICY.services, the service finding in scanText/analyzeText, serviceSignals, runOne env_required, parseVerifyArgs --allow-services, rawTable, and flag-spec.cjs bools
