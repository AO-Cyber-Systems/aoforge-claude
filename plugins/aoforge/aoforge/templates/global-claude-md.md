---
template: global-claude-md
template_version: "4"
---
# AOForge Routing

The AOForge plugin (`aoforge@aocyber`) is installed. When the user's request fits an AOForge workflow,
invoke the matching skill via the Skill tool instead of editing files directly.

- Building a feature end-to-end → `/aoforge:build`
- Planning before building → `/aoforge:plan-objective`
- Executing a planned objective → `/aoforge:execute-objective`
- Verifying / UAT → `/aoforge:verify-work`
- Debugging a bug → `/aoforge:debug`
- Quick ad-hoc task with atomic commits → `/aoforge:quick`
- Trivial single-token change → `/aoforge:micro`
- New project setup → `/aoforge:new-project`
- Adopt an existing repo (unattended, one commit on aoforge/adopt) → `/aoforge:adopt`
- Resume / status / progress / health → `/aoforge:status` (`status resume`, `status pause`, `status check`)
- Diagnose and safely repair the install and project state → `/aoforge:doctor` (`doctor --fix`)
- Milestones → `/aoforge:milestone <sub>`
- Todos → `/aoforge:todo add`, `/aoforge:todo list`
- GitHub store (migrate, status, flush, setup, release) → `/aoforge:gh-sync`
- Talk through an objective before planning → `/aoforge:discuss-objective`

Skills enforce atomic commits, state tracking, and verification. Run `/aoforge:help` to list all commands.
