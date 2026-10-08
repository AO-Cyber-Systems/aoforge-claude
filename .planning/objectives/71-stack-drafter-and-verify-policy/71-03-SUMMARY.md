# Objective 71 TRD 03: `stack verify --run` never reaches a service silently Summary

## Progress
- [x] Task 1: Fixture builders: a committed scratch repo and a CI workflow with services — (this commit)
- [ ] Task 2: CI steps carry their job's service containers and the env names in scope — next step: add describe C18 (cases 18-21) to stack-ci.test.cjs and update the step-key contract pin, run it RED
- [ ] Task 3: The `env_required` policy, the three signal layers and `--allow-services` — next step: create stack-verify-services.test.cjs with cases 1-17, run it RED
