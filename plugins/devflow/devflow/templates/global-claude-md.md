---
template: global-claude-md
template_version: "2"
---
# DevFlow Routing

The DevFlow plugin (`devflow@aocyber`) is installed. When the user's request fits a DevFlow workflow,
invoke the matching skill via the Skill tool instead of editing files directly.

- Building a feature end-to-end → `/devflow:build`
- Planning before building → `/devflow:plan-objective`
- Executing a planned objective → `/devflow:execute-objective`
- Verifying / UAT → `/devflow:verify-work`
- Debugging a bug → `/devflow:debug`
- Quick ad-hoc task with atomic commits → `/devflow:quick`
- Trivial single-token change → `/devflow:micro`
- New project setup → `/devflow:new-project`
- Adopt an existing repo (unattended, one commit on devflow/adopt) → `/devflow:adopt`
- Resume / status / progress / health → `/devflow:status` (`status resume`, `status pause`, `status check`)
- Milestones → `/devflow:milestone <sub>`
- Todos → `/devflow:todo add`, `/devflow:todo list`
- Push planning state to GitHub issues → `/devflow:gh-sync`
- Talk through an objective before planning → `/devflow:discuss-objective`

Skills enforce atomic commits, state tracking, and verification. Run `/devflow:help` to list all commands.
