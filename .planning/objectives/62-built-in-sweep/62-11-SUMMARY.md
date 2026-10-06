---
objective: 62-built-in-sweep
trd: "11"
---

# Objective 62 TRD 11: Questions in the remaining skills and workflows Summary

## Progress
- [x] Task 1 RED: security-audit, cleanup, flow and help leave the baseline — 4a29c78b
- [x] Task 1 GREEN (a): security-audit asks with AskUserQuestion and declares it — 668d76c2
- [x] Task 1 GREEN (b): cleanup asks with a proper AskUserQuestion; cleanup and flow declare it — 85be87df
- [x] Task 1 GREEN (c): help.md describes verify-work's free-text answer — 257b32d5
- [x] Task 2 RED: research and assumption prompts leave the baseline — 97345ce0
- [x] Task 2 GREEN (a): research-objective asks with AskUserQuestion and declares it — 0d3330db
- [x] Task 2 GREEN (b): list-objective-assumptions: correction stays free text (marker), next step is an AskUserQuestion — (this commit)
- [ ] Task 2 GREEN (c): settings splits its six questions into two calls; doctor and gh-sync questions get headers; empty baseline deleted — next step: in workflows/settings.md split present_settings into two AskUserQuestion calls of 3 (Model, Research, Plan Check; then Verifier, Auto, Branching) and reword line 203 to `- [ ] Save-as-defaults question asked`; add header "Repair" (Apply fixes (Recommended) / Skip) in skills/doctor step 3; add header "GitHub store" with Not now (Recommended) to skills/gh-sync step 2b keeping the AskUserQuestion token; `git rm` the remaining baseline
