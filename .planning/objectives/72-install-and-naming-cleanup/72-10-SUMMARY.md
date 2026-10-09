---
objective: 72-install-and-naming-cleanup
trd: "10"
subsystem: hooks
tags: [aoforge-rename, coexistence, legacy-agent-types, transcript-readers, shims]

requires:
  - phase: 72-02
    provides: "legacy-names.cjs NAMES/LEGACY; compat.cjs isOwnAgentType and aliasLegacyEnv"
  - phase: 72-06
    provides: "hooks on the compat resolver (the require-after-alias pattern this TRD's hook follows)"
provides:
  - "bin/lib/coexistence.cjs: detectLegacyPlugin({ userHome, fsImpl }) -> { installed, enabled, version, pointer }; coexistenceMessage(result); POINTER_MAJOR"
  - "hooks/coexistence-guard.js: SessionStart, registered last; one global notice per session (key coexistence:<session_id>, source coexistence-guard, level action, info for the pointer) naming the old plugin's version and `claude plugin disable <LEGACY.plugin>`; stdout empty, exit 0, fail open; AOFORGE_SKIP_COEXISTENCE=1 (legacy prefix aliased)"
  - "compat.isOwnAgentType now requires a non-empty agent name; compat.isOwnExecutor(t) = the executor in either namespace, exactly"
  - "gate-edits isAoforgeAgent = compat.isOwnAgentType (gate-bash-writes follows through its import); verify-commits and gate-executor-stop act on compat.isOwnExecutor"
  - "agent-overhead AGENT_PREFIX_RE built from NAMES.agentNs, LEGACY.agentNs and LEGACY.installPrefix"
  - "session-audit: legacy gate denial texts, the legacy skill and command namespace and the legacy override phrases count as the new ones (category ids unchanged)"
  - "__fixtures__/legacy-plugin-fixtures.cjs: pluginHome, writePluginState, seedEnabledLegacyPlugin, subagentStopPayload, preToolUsePayload"
affects: [72-07, 72-08, 72-09, 72-11, 72-12, 72-14, 72-15, 72-17]

tech-stack:
  added: []
  patterns:
    - "A hook that only informs writes a global notice through notices.cjs and keeps stdout empty; route-results shows it on the next prompt"
    - "A notice that must appear once per session keys on the session id and refuses a second pending notice of the same prefix"
    - "A transcript reader's legacy names are derived from NAMES/LEGACY (escapeRegExp alternations, slug substitution), never spelled"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-plugin-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/coexistence.cjs
    - plugins/aoforge/aoforge/bin/lib/coexistence.legacy.test.cjs
    - plugins/aoforge/hooks/coexistence-guard.js
    - plugins/aoforge/hooks/coexistence-guard.legacy.test.js
    - plugins/aoforge/hooks/agent-types.legacy.test.js
    - plugins/aoforge/aoforge/bin/lib/transcript-names.legacy.test.cjs
  modified:
    - plugins/aoforge/hooks/hooks.json
    - CLAUDE.md
    - plugins/aoforge/aoforge/bin/lib/compat.cjs
    - plugins/aoforge/aoforge/bin/lib/compat.legacy.test.cjs
    - plugins/aoforge/hooks/gate-edits.js
    - plugins/aoforge/hooks/verify-commits.js
    - plugins/aoforge/hooks/gate-executor-stop.js
    - plugins/aoforge/aoforge/bin/lib/agent-overhead.cjs
    - plugins/aoforge/aoforge/bin/lib/session-audit.cjs
    - plugins/aoforge/hooks/classify-session.test.js
    - plugins/aoforge/hooks/hook-coexistence.test.js
    - plugins/aoforge/hooks/planning-writes.audit.test.js
    - plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js

key-decisions:
  - "Coexistence notice is one per session: key coexistence:<session_id>; a later SessionStart of the same session (resume, compact) queues nothing even after it was read, and a new session never adds a second pending one"
  - "Enabled = installed and not explicitly false in ~/.claude/settings.json or settings.local.json (the local file wins); a version-1 installed_plugins.json is read too; the user-scope entry's version wins"
  - "The pointer release is the old plugin at major 3 or above: still told (level info), without the gates-run-twice warning"
  - "compat.isOwnAgentType now rejects a bare namespace: gate-edits trusted only a non-empty name, and its existing test pins that, so the shim was tightened rather than the gate loosened"
  - "isOwnExecutor matches `<ns>executor` exactly (stricter than the TRD's endsWith(':executor'), which would accept `<ns>x:executor`)"
  - "session-audit keeps OVERRIDE_PHRASES identical to the hook (D-1) and adds HISTORY_OVERRIDE_PHRASES for transcripts; category ids are unchanged, the old texts map to them"

requirements-completed: [INST-03, INST-05]
---

# Objective 72 TRD 10: AOForge beside the old plugin, and old identities still recognised Summary

**A new SessionStart hook tells a user who still has the old plugin enabled, once per session, which version it is and the exact `claude plugin disable` command. The gates treat the old agent namespace as their own for one release, and calibration and the session audit keep counting history recorded under the old agent, skill, command and gate names.**

## Progress
- [x] Task 1: Fixture builder: fake homes with plugin installs — 7f5c52b7
- [x] Task 2: Coexistence detection and the SessionStart guard — 35e2a155 (RED), 18594c35 (GREEN)
- [x] Task 3: Old agent types in the gates, old names in the transcript readers — 53cfd96e (RED), (this commit) (GREEN)
