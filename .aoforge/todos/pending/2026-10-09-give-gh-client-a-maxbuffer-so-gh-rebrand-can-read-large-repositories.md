---
title: give gh-client a maxBuffer so gh rebrand can read large repositories
area: github
files: [plugins/aoforge/aoforge/bin/lib/gh-client.cjs, plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs]
---

## Problem

TRD 72-25 Task 1 ran the read-only dry run `aof-tools --cwd ~/dev/eden-biz/go gh rebrand --raw`. It failed with:

```
{"ok": false, "error": "could not read the issues of AO-Cyber-Systems/eden-biz: spawnSync gh ENOBUFS"}
```

`gh-client.cjs` `defaultRunGh` (line 49) calls `spawnSync('gh', args, { encoding, stdio, timeout: 30000 })` with no `maxBuffer`, so Node's 1 MiB default applies. `gh-rebrand.cjs:249` reads `repos/<repo>/issues?state=all` (paginated) in one spawn, and eden-biz's issue list is larger than 1 MiB. The comments read on line 251 has the same exposure. The 30 s timeout is a second ceiling for big repositories.

No fleet repository is in store mode, so 72-25 did not need a rebrand. But eden-biz's flutter/ and go/ projects mirror to GitHub (`github.enabled: true`) and cannot be rebranded until this is fixed.

## Solution

1. Set a large `maxBuffer` (e.g. 256 MiB) in `defaultRunGh`, or per call for the paginated rebrand reads, and raise the timeout for paginated reads.
2. Map `ENOBUFS` / `ETIMEDOUT` to a clear error that names the read and the repository.
3. Add a test with a fake runner returning more than 1 MiB.
4. Re-run `aof-tools --cwd ~/dev/eden-biz/go gh rebrand` (dry run) to confirm.
