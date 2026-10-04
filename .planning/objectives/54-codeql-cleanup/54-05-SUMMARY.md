# Objective 54 TRD 05: execFileSync in the CLI test files Summary

## Progress
- [x] Task 1: execFileSync in decision-queue, flutter-ui-scope and project-hygiene tests (alerts 96-100, 107-109, 112-113) — (this commit)
- [ ] Task 2: gateFails keeps a real sh but passes everything variable as positional parameters (alert 122) — next step: in plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs replace gateFails (~:775) with the GATE_SCRIPT + positional-parameter form and convert its three callers to argv arrays, then run `node --test` on the file and compare with the 34-pass baseline
