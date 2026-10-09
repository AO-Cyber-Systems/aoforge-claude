---
name: security-audit
description: |
  Scan the codebase for security vulnerabilities — checks for secrets, auth flaws, dependency risks, and OWASP Top 10 issues.
  Standalone — works without project setup. Covers secrets, auth, dependencies, and code-level vulnerabilities.
  Triggers on: "security audit", "scan for vulnerabilities", "check for secrets", "security review", "find security issues"
argument-hint: "[optional: path scope like 'src/api' or focus filter like 'secrets-only', 'auth-only', 'deps-only']"
allowed-tools:
  - Skill
---
DevFlow is now AOForge. This command moved to `/aoforge:security-audit`.

If the AOForge plugin is installed, invoke the Skill tool with skill `aoforge:security-audit` and pass `$ARGUMENTS` unchanged. Do nothing else.

If it is not installed (`aoforge:security-audit` is not among your skills, or the Skill tool does not know it), tell the user: run `/plugin install aoforge@aocyber` (marketplace `aocyber`), restart Claude Code, then disable this plugin with `claude plugin disable devflow@aocyber`. This pointer is removed in the release after 3.0.0.
