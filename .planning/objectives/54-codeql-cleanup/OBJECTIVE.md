---
objective: 54-codeql-cleanup
kind: plugin
work: bugfix
status: registered
milestone: v1.4
---

# Objective 54 — CodeQL cleanup

Registered 2026-10-04 after release 2.13.0. CodeQL lists **56 open alerts** on `main` (Security tab, `ref=refs/heads/main`). The user reviewed them by group and chose: fix every group except D, and dismiss D with a reason. Line numbers below are from before the 2.13.0 merge, so re-list the alerts first with `gh api "repos/AO-Cyber-Systems/devflow-claude/code-scanning/alerts?ref=refs/heads/main&state=open&per_page=100"`.

## Groups

**A. Regexes built from objective numbers or versions: 21 alerts** (`js/regex-injection`, `js/incomplete-sanitization`)
- Files: `objective.cjs`, `roadmap.cjs`, `novel-domain.cjs`, `trd-pre-check.cjs`, `project-bootstrap.cjs`, `changelog.cjs`, `hooks/changelog-on-tag.js`.
- What's wrong:
  - `replace('.', '\\.')` without `/g` escapes only the first dot.
  - `project-bootstrap.cjs` doesn't escape at all.
  - `+` and other metacharacters in versions are left unescaped.
- Fix: one shared `escapeRegExp` at every interpolation site. `objective.cjs:1069` and `roadmap-progress.cjs` already have one. Consolidate into one helper and keep the hook self-contained if it can't require lib.
- Tests: `4.1` must not match `4.10` or `401`; `4.1.2`; a version with `+`/`-rc`; decimal objectives.

**B. Markdown table cells escape `|` but not `\`: 6 alerts.** Sites: `adopt.cjs` ×4 and `stack-report.cjs` cell. Fix: one `mdCell` helper (backslash first, then pipe, then newlines). Match the quick-29 fix in `0011` `cell` and `planning-verbs-cli` `tableCell`, and fold those into the helper too.

**C. `stack-profile.cjs` `js/bad-tag-filter`: 1 alert.** The note sanitiser only replaces `-->`. Neutralise every comment terminator, including `--!>`, preferably by breaking any `--`.

**E. `config.cjs` `js/prototype-pollution-utility`: 1 alert.** `config-set` walks dotted keys from argv. Reject `__proto__`, `constructor` and `prototype` at any segment, with a clear error and exit 1. Check `config-get` and any other dotted-path walker for the same issue.

**F. `actions/missing-workflow-permissions`: 2 alerts.** In `.github/workflows/test.yml` and `agent-shell-harness.yml`, add the least-privilege `permissions:` block (`contents: read` unless a job needs more; check each job).

**G. `js/shell-command-injection-from-environment` in tests: 22 alerts** across 9 `*.test.cjs` files. Replace `execSync` template strings with `execFileSync`/`spawnSync(process.execPath, [script, ...args])`. Assertions stay unchanged.

**H. Test leftovers: 2 alerts.**
- `scripts/ci-unit-gate.test.cjs` `js/identity-replacement`: a `.replace(x, x)` that does nothing. Find out what was meant and fix the intent, not just the lint.
- `doctor.e2e.test.cjs` incomplete escaping.

**D. Dismiss, don't fix: 1 alert.** `handoff.cjs` `new RegExp(s.prompt_match)` is intended: a handoff manifest declares the prompt regex, and the value is the user's own. Add a code comment saying so. Dismiss the alert as "won't fix" with that reason. Dismissing writes to GitHub, and the user approved it for this alert only.

## Success

- After the fixes are pushed and CodeQL re-runs on the branch, it reports 0 new alerts. On `main`, after merge, every alert in A-C and E-H is closed and D is dismissed with a reason.
- No behaviour change apart from the corrected matching (tests prove it).
- `npm test` is green apart from the known MA-7.
- Releasing is out of scope: it is a separate approval.
