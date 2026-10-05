---
title: objective complete reports is_last_objective for v1.5
area: df-tools
created: 2026-10-05
---

`df-tools objective complete 56` and `57` (repo copy, post-Objective 56) return `next_objective: null, is_last_objective: true` although Objectives 58-64 exist in ROADMAP.md. Likely cause: next-objective detection scans `.planning/objectives/` directories, and none exist yet for 58+. Effect: STATE.md is not advanced to the next objective; set by hand in both runs. Candidate for Objective 59 (PLMB) since it already owns completion reporting.
