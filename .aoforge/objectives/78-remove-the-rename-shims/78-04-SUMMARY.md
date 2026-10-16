---
objective: 78-remove-the-rename-shims
trd: "04"
subsystem: rename-shims
tags: [rename, shims, stack-mcp, mcp-json, todo-sync, adopt, migration-0010]

requires:
  - objective: 72-rename-to-aoforge
    provides: the 72-12 read-side shims (.mcp.json owner key, todo metadata key, adopt branch/marker) and the 72-08 dual-slug 0010 block reader removed here
provides:
  - "stack-mcp owns a .mcp.json entry only through AOFORGE_MANAGED === 'stack'; legacyOwnedEntries(doc) finds entries owned through the pre-rename key and every stackMcp result carries `warnings: []` with one line per such entry (preview and --write)"
  - "todo-session TODO_META_KEYS is ['aoforge_todo']; the todo-sync Stop hook prefilter types the same key and exports it, and todo-sync.test.js pins the two equal"
  - "adopt reads and routes on aoforge/adopt and aoforge-adopt.json only: no legacy_branch_exists fact, no adopt-branch-conflict route, no pre-rename marker fallback"
  - "migration 0010 recognises its .gitignore block only under the AOForge slug; a pre-rename-slug block is kept as user text"
affects: [78-05-watch-daemon-runtime-home, 78-07-retire-planning-migrations-and-guard, 78-11-compat-single-name, 78-12-docs-and-close-out]

tech-stack:
  added: []
  patterns:
    - "A removed read shim leaves a read-only detector where silence would hide a stale user file (the .mcp.json warning); elsewhere the old identity is plain user data"
    - "A hook's cheap prefilter types its constant instead of loading the library, and a test pins it to the library's value"

key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-mcp.test.cjs
    - plugins/aoforge/aoforge/bin/lib/todo-session.cjs
    - plugins/aoforge/aoforge/bin/lib/todo-session.test.cjs
    - plugins/aoforge/hooks/todo-sync.js
    - plugins/aoforge/hooks/todo-sync.test.js
    - plugins/aoforge/aoforge/bin/lib/adopt.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs

key-decisions:
  - "Pre-rename .mcp.json owner key: REMOVE the read, ADD a one-line report. The entry stays in the user's file and would silently stop being refreshed; a report keeps that visible without making the old key work"
  - "Pre-rename todo metadata key: REMOVE. Only a session started under the pre-rename skills writes it; every 3.x todo skill writes the AOForge key, and the cost of a miss is one unsynced todo in a months-old resumed session"
  - "Pre-rename adopt branch/marker: REMOVE, no detector. An adopt is a one-shot bootstrap; one left unfinished across two releases is restarted on aoforge/adopt, and the old branch is never touched (nothing is lost)"
  - "0010's pre-rename block slug: REMOVE, no detector. Only a project that 0012 never moved can still carry that block, and such a project is on the legacy layout, which 78-07 refuses before any migration runs"
  - "The .mcp.json warning is reported by a preview too (stack mcp reads .mcp.json leniently for it and never refuses); `warnings` is always present, empty when nothing is stale"
  - "An entry carrying the AOForge key at any value is not reported, even beside the pre-rename key: the user has already chosen for it"

requirements-completed: [SC-1, SC-2]
---

# Objective 78 TRD 04: Identities in users' files Summary

One-liner: the `.mcp.json` owner key, the session-todo metadata key, the adopt branch and marker, and 0010's ignore-block slug are each read under the AOForge name only; a `.mcp.json` entry still owned through the pre-rename key is left byte-identical and reported in one `warnings` line naming `AOFORGE_MANAGED` as the fix.

## Progress
- [x] Task 1: RED — identities are ignored or reported — 326f8932
- [x] Task 2: GREEN — stack-mcp ownership, todo key, hook prefilter, 0010 slug — bdb1fe13
- [x] Task 3: GREEN — adopt forgets the pre-rename branch and marker — (this commit)
