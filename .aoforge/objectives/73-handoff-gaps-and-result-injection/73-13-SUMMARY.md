---
objective: 73-handoff-gaps-and-result-injection
trd: "13"
subsystem: doctor
tags: [doctor, service-installer, user-dot-dir, watch, gap-closure, G5]
---

# Objective 73 TRD 13: Service logs leave ~/.aoforge, and doctor cleans up a leftover ~/.aoforge Summary

## Progress
- [x] Task 1: Service logs in the watch state directory — c9a02d10 (RED), (this commit) (GREEN)
- [ ] Task 2: RED, doctor check user-dot-dir — next step: add withDotDirFiles/writeServiceFile to plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs, write tests 5-14 in plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.test.cjs, add user-dot-dir to GLOBAL_IDS in doctor.e2e.test.cjs, run node --test on both (must fail)
- [ ] Task 3: GREEN, check 17 and its README row
