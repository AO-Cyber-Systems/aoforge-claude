---
schema: 1
id: "devcluster"
extends: "general"
components: [{ path: "tools/devproxy/", profile: "go" }]
commands:
  build: { run: "none" }
  test: { run: "bash t0-conformance/selftest.sh" }
  lint: { run: "shellcheck bin/*.sh lib/*.sh t0-conformance/*.sh" }
  cluster_test: { run: "./bin/test.sh" }
provenance:
  reviewed: "2026-09-29"
  sources: ["bin/build.sh", "bin/test.sh"]
---

# Stack Profile: devcluster

<!-- Drafted by `df-tools stack init`. Add no `## ` heading below unless this project genuinely diverges from `general`: an empty section would replace the parent's. Recognized sections: Principles, Idioms, Avoid, Layout & architecture, Testing, Dependencies, Generated code, Security, UI. -->

<!-- Hand-reviewed 2026-09-29 (objective 42 rollout): Bash/Python local-cluster CLI; Go only in the tools/devproxy/ component (go profile gates run there). `bin/build.sh <app>` builds app images, not this repo, so `build` is none. `bin/test.sh` asserts a LIVE cluster (L0-L5) and is the cluster_test key; the offline gate is the T0 self-test, which reads the gitops repo from config. Drafter notes superseded; see .planning/STACK-REPORT.md. -->
