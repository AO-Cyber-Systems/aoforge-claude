---
objective: 79-reconcile-and-release-3-1-0
trd: "02"
status: checkpoint
---

# Objective 79 TRD 02: compat-import guard and the wave-2 sweep (in progress)

## Progress
- [x] Task 1: RED then GREEN reconcile-guard.repo.test.cjs with its scanner and mutation proof — ea51fff8 (RED), a5a26af2 (GREEN)
- [x] Task 2: Run the rename, neutrality, compat-entry, legacy-names and reconcile guards over the merged tree; fix findings at their source; sweep the prompts for 3.0.0 shim prose — (this commit)
- [ ] Task 3: Confirm no 79-01 triage row is routed to 79-02, and run file-identities.legacy.test.cjs, planning-layout.legacy.test.cjs and the pack and scripts domain suite — next step: `env HOME=$(mktemp -d) node --test` those two files, then `'plugins/aoforge-stack-*/**/*.test.cjs' 'scripts/**/*.test.cjs'`
