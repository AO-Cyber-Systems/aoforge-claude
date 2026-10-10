---
objective: 73-handoff-gaps-and-result-injection
trd: "13"
subsystem: doctor
tags: [doctor, service-installer, user-dot-dir, watch, gap-closure, G5]
---

# Objective 73 TRD 13: Service logs leave ~/.aoforge, and doctor cleans up a leftover ~/.aoforge Summary

## Progress
- [x] Task 1: Service logs in the watch state directory — c9a02d10 (RED), f69468f4 (GREEN)
- [x] Task 2: RED, doctor check user-dot-dir — (this commit)
- [ ] Task 3: GREEN, check 17 and its README row — next step: export moveEntry from plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs, write plugins/aoforge/aoforge/bin/lib/doctor-checks/17-user-dot-dir.cjs (scan/run/fix), add the 17-user-dot-dir entry to the README 10-19 row, run node --test on 17-user-dot-dir.test.cjs, doctor.e2e.test.cjs and 15-legacy-df-install.legacy.test.cjs
