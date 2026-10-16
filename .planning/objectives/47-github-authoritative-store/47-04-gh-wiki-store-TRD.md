---
objective: 47-github-authoritative-store
trd: "04"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
  - plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/wiki-remote.cjs
autonomous: true
requirements: [GST-06, GST-08, GST-02]
must_haves:
  truths:
    - "The wiki clone lives at `.planning/wiki/` and `/.planning/wiki/` is added once to the repo's `info/exclude` (resolved with `git rev-parse --git-path info/exclude`, so worktrees work)"
    - "Writes are add → commit (skipped when nothing staged) → `pull --rebase origin master` → `push origin HEAD:master`; a rebase conflict aborts the rebase and returns `{conflict:true, files}`, never force-pushes or auto-resolves"
    - "A non-fast-forward push after the rebase is retried up to 3 times; an unreachable remote returns `{offline:true}` without throwing"
    - "`probeRemote` classifies the wiki as `ok`, `uninitialised` (repository not found) or `unavailable` (other git failure, stderr included)"
    - "ONE page-mapping table maps PROJECT, REQUIREMENTS, Roadmap, codebase docs, objective OBJECTIVE/CONTEXT/RESEARCH, ADRs and retros to page names and back; decimal objective `02.1-b` and `02-1-b` map to different pages"
    - "The `docs` backend exposes the same interface, writing `docs/devflow/<Page>.md` in the working tree and never committing"
    - "`pageRevisionUrl(repo, page, sha)` is the only place the (LOW confidence) revision URL format lives"
    - "`git` is spawned only through this module's `runGit` seam; tests use a local bare repo with isolated git config, never the network"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-wiki.cjs
      provides: "WIKI_DIR_REL, DOCS_DIR_REL, PAGE_TABLE, objectivePage, pageForCachePath, cachePathForPage, resolveWikiRemote, probeRemote, ensureClone, ensureExcluded, readPage, writePage, listPages, push, fetch, headSha, pageRevisionUrl, openStore, _setRunGit"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/wiki-remote.cjs
      provides: "createWikiRemote, gitAvailable, gitTestEnv"
  key_links:
    - "47-06 gh-capability calls probeRemote; 47-07 executes `wiki-push` ops via openStore().push; 47-09 writes objective pages and pins headSha into the objective body; 47-10 fetch + cachePathForPage on pull --all"
---

# TRD 47-04: Wiki store and `docs/` backend (GST-06, GST-08 wiki half)

<objective>
Create `lib/gh-wiki.cjs`: the wiki store. It clones `<repo>.wiki.git` into `.planning/wiki/`, maps planning documents to
wiki pages with one table, writes pages with commit + rebase + push on `master`, reads them back, pins a revision, and
offers a `docs/devflow/` backend with the same interface for repos without a wiki. Also create the hermetic
`__fixtures__/wiki-remote.cjs` (a local bare repo standing in for the wiki remote).

Purpose: GST-06 and the wiki half of GST-08; the revision pin for GST-02. Output: module, test, fixture.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `git` is spawned ONLY via `runGit` in this module (`spawnSync('git', argv, {cwd, env, encoding:'utf-8'})`, argv array, never a shell
  string). `_setRunGit(fn)` replaces it; `_setRunGit(null)` restores. 47-12 extends the seam guard to enforce this.
- Do not use `helpers.execGit` (it shells through `execSync` and trims output).
- Integration tests use the real local `git` against `file://` bare repos with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`,
  temp `HOME`, `GIT_TERMINAL_PROMPT=0` and explicit author/committer identity env. If `git` is missing, skip with a visible reason.
- Never touch the network; never port 8080; never the real `~/.claude`.
- Research reference: `47-RESEARCH.md` → "Wiki git behaviour (GST-06)", Pitfalls 6, 9.

## Decisions taken in planning

- **D-17 Wiki clone location (research Open Q5).** `.planning/wiki/`, excluded locally via `info/exclude` on clone (one line,
  `/.planning/wiki/`, appended only if absent). Objective 48 later gitignores the whole cache; the exclude line stays harmless.
- **D-18 docs/ backend.** Degraded mode writes `docs/devflow/<Page>.md` in the working tree (repo content, committed by the user's
  normal flow). `push` on this backend is a no-op returning `{ok:true, committed:false, note}`. A wiki in state `uninitialised` is
  REPORTED ("create the first wiki page in the web UI"), never silently switched to `docs/`; only `disabled` (has_wiki false)
  selects `docs/` — that decision is 47-06's, this module only provides both backends.
- **D-09 Revision URL (LOW, research Open Q6).** `https://github.com/{o}/{r}/wiki/{Page}/{sha}` lives in `pageRevisionUrl` only, with
  one test pinning it, so a correction is a one-line change. On the docs backend the "revision" is the repo path `docs/devflow/<Page>.md`.
- **Decimal objective page names.** `.` in an objective id becomes `_` in the page name: `02.1-b` → `Objective-2_1-b`; `02-1-b` →
  `Objective-2-1-b` (distinct). Leading zeros are dropped from the number (`07-store-demo` → `Objective-7-store-demo`).
- **Remote resolution.** `resolveWikiRemote(cwd)` = `DEVFLOW_WIKI_REMOTE` env → `.planning/config.json` `github.wiki.remote` →
  `https://github.com/<repo>.wiki.git`. Tests always set `DEVFLOW_WIKI_REMOTE` to a `file://` URL.
- **Auth.** For `https://` remotes only, prefix `-c credential.helper= -c 'credential.helper=!gh auth git-credential'`; never put a token in a URL.
- **Commit identity.** If `git config user.email` is empty in the clone, commit with `-c user.name=DevFlow -c user.email=devflow@users.noreply.github.com`.

<embedded_context>

<codebase_examples>
Page table (single source; exported as `PAGE_TABLE` and used by both directions):

| Cache path (relative to `.planning/`) | Page |
|---|---|
| `PROJECT.md` | `Project` |
| `REQUIREMENTS.md` | `Requirements` |
| `ROADMAP.md` (generated view) | `Roadmap` |
| `codebase/<NAME>.md` | `Codebase-<Name>` (e.g. `codebase/STACK.md` → `Codebase-Stack`) |
| `objectives/<dir>/OBJECTIVE.md` | `Objective-<N>-<slug>` |
| `objectives/<dir>/<NN>-CONTEXT.md` (or `CONTEXT.md`) | `Objective-<N>-<slug>-Context` |
| `objectives/<dir>/<NN>-RESEARCH.md` (or `RESEARCH.md`) | `Objective-<N>-<slug>-Research` |
| `adr/<NNNN>-<slug>.md` | `ADR-<NNNN>-<slug>` |
| `retros/<vX.Y>.md` | `Retro-v<X>_<Y>` |

Write path (research "Code Examples"):
```js
git(['add', '-A']); if (!git(['diff', '--cached', '--quiet']).ok) git(['commit', '-m', msg]);
git(['pull', '--rebase', 'origin', 'master']) || (git(['rebase', '--abort']), conflict());
git(['push', 'origin', 'HEAD:master']);
```
Read path: `git fetch origin`; ahead = `git rev-list --count origin/master..HEAD`; ahead 0 → `git reset --hard origin/master`;
ahead > 0 → `git pull --rebase origin master` and report `{ahead}` (the pending `wiki-push` op finishes it).

Offline/uninitialised classification on git stderr: `/repository .* not found|does not appear to be a git repository/i` → uninitialised
(for ls-remote/clone), `/could not resolve host|unable to access|connection refused|timed out|network is unreachable/i` → offline.
</codebase_examples>

<anti_patterns>
- `git push --force` or `-f` in any path; `git checkout --theirs/--ours` to resolve conflicts.
- Assuming `init.defaultBranch`; always `HEAD:master` and `git init --bare -b master` in the fixture.
- Rewriting a page whose bytes are unchanged (cache churn, Pitfall 9) — `writePage` compares first and returns `changed:false`.
- Embedding credentials in the remote URL.
</anti_patterns>

<error_recovery>
- Rebase conflict: `git rebase --abort`; collect `git diff --name-only --diff-filter=U` BEFORE aborting; return
  `{ok:false, conflict:true, files}`; the local commit is kept so the human can resolve in `.planning/wiki/`.
- Clone of an existing non-empty `.planning/wiki/` with a different `origin` → `{ok:false, error:'wiki clone points at <url>, expected <url>'}`; never delete it.
</error_recovery>

</embedded_context>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── gh-wiki.cjs                 ← CREATE
├── gh-wiki.test.cjs            ← CREATE
└── __fixtures__/
    └── wiki-remote.cjs         ← CREATE
</file_tree>

<context>
@.planning/objectives/47-github-authoritative-store/47-RESEARCH.md
@docs/PROPOSAL-github-system-of-record.md
</context>

<gotchas>
- The project root used in tests is itself a `git init` temp repo (needed for `info/exclude`); create it with `git init -b main` under the isolated env.
- `git rev-parse --git-path info/exclude` returns a path relative to cwd; resolve it against the project root.
- `fetch` with `reset --hard` must never run when `ahead > 0`.
- Wiki page files are `<Page>.md` at the clone root (flat namespace).
</gotchas>

## Test list

Mapping (pure)
1. `pageForCachePath('PROJECT.md')` → `Project`; `codebase/STACK.md` → `Codebase-Stack`; `objectives/07-store-demo/OBJECTIVE.md` → `Objective-7-store-demo`; `.../07-CONTEXT.md` and `.../CONTEXT.md` → `...-Context`; `.../07-RESEARCH.md` → `...-Research`; `adr/0003-use-rest.md` → `ADR-0003-use-rest`; `retros/v1.4.md` → `Retro-v1_4`.
2. `objectivePage('02.1-b')` ≠ `objectivePage('02-1-b')`; both are stable.
3. `cachePathForPage(page, {objectiveDirs:['07-store-demo']})` inverts every row of test 1; Context/Research pages invert to the repo convention `<dir prefix>-CONTEXT.md` / `<dir prefix>-RESEARCH.md` (`07-CONTEXT.md`), so a bare `CONTEXT.md` round-trips as `07-CONTEXT.md` (documented, not an error).
4. Unmapped cache path → null (not every file goes to the wiki).
5. `pageRevisionUrl('o/r','Objective-7-store-demo','abc123')` → `https://github.com/o/r/wiki/Objective-7-store-demo/abc123`.
6. `resolveWikiRemote` precedence: env → config → default URL.

Command sequences (with `_setRunGit` fake, no git)
7. `push` runs add, diff --cached --quiet, commit, pull --rebase origin master, push origin HEAD:master in that order; nothing staged → no commit, still pulls/pushes only if ahead.
8. Rebase failure → `rebase --abort` called, `{conflict:true, files}`; no `push` call; no `--force` anywhere in recorded argv.
9. Push rejected non-fast-forward 2× then ok → 3 pull/push rounds, ok; 4 rejections → `{ok:false, error:/non-fast-forward/}`.
10. Offline stderr on pull → `{ok:false, offline:true}`.
11. https remote gets the credential-helper `-c` prefix; `file://` does not.

Integration (real local git, `wiki-remote.cjs`)
12. `probeRemote` → `ok` for the fixture remote, `uninitialised` for a missing path, `unavailable` for a non-repo dir with other stderr.
13. `ensureClone` clones into `.planning/wiki/`, appends `/.planning/wiki/` to `info/exclude` once (second call no duplicate), and `git status --porcelain` of the project does not list `.planning/wiki`.
14. `writePage` + `push` → the bare remote's `master` contains the page; `headSha` equals the remote ref.
15. Human edit on the remote to a DIFFERENT page, then local write + push → rebase succeeds, both changes on remote.
16. Human edit to the SAME lines, then local write + push → `{conflict:true, files:['Objective-7-store-demo.md']}`, remote unchanged, rebase aborted (`git status` clean of rebase state).
17. `fetch` with ahead 0 → local equals remote; with an unpushed local commit → `{ahead:1}`, local commit retained.
18. Remote moved away (`goOffline()`) → push returns `{offline:true}` or a classified failure, never throws.
19. `openStore(root, {mode:'docs'})`: `writePage('Project', text)` writes `docs/devflow/Project.md`; `readPage` reads it; `push` → `{ok:true, committed:false}`; `listPages` lists it; revision → `docs/devflow/Project.md`.
20. `writePage` with identical bytes → `changed:false` and file mtime unchanged.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Page mapping, remote resolution, revision URL (tests 1-6)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-wiki.cjs, plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs</files>
  <action>
RED: tests 1-6. Commit RED.
GREEN: `WIKI_DIR_REL = '.planning/wiki'`, `DOCS_DIR_REL = 'docs/devflow'`, `PAGE_TABLE` (ordered rule list: `{match(rel) → page|null, invert(page, ctx) → rel|null}`),
`objectivePage(dir)`, `pageForCachePath(rel)`, `cachePathForPage(page, {objectiveDirs})`, `pageRevisionUrl`, `resolveWikiRemote(cwd, {env})`.
Use `gh-mapping.toObjectiveId` for the number normalisation (it is pure). Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs</verify>
  <done>Tests 1-6 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: runGit seam, push/fetch/probe sequences and wiki-remote fixture (tests 7-11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-wiki.cjs, plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/wiki-remote.cjs</files>
  <action>
RED: tests 7-11 using a recording fake runner installed with `_setRunGit`. Commit RED.
GREEN:
- `runGit(args, {cwd, env})` → `{ok, status, stdout, stderr}`, never throws (ENOENT → `{ok:false, status:null, stderr:'git: command not found'}`);
  env = `{...process.env, GIT_TERMINAL_PROMPT:'0', ...opts.env}`.
- `probeRemote(remote)`, `ensureClone(root, {remote})`, `ensureExcluded(root)`, `push(root, {message, remote})`, `fetch(root)`, `headSha(root)`,
  `classifyGitFailure(r)` (internal: offline | uninitialised | conflict | non_fast_forward | error).
- `__fixtures__/wiki-remote.cjs`: `gitAvailable()`, `gitTestEnv(home)` (isolation vars + `GIT_AUTHOR_NAME/EMAIL`, `GIT_COMMITTER_NAME/EMAIL`),
  `createWikiRemote({seed = {'Home.md':'# Home\n'}})` → `{remoteUrl, bareDir, commitPage(page, text, msg), readRemotePage(page), headSha(), goOffline(), goOnline(), missingUrl, notARepoUrl, cleanup}`.
  Bare repo via `git init --bare -b master`; seeding through a scratch clone with the isolated env.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs</verify>
  <done>Tests 1-11 pass; no recorded argv contains `--force` or `-f` after `push`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Integration against a local bare repo and the docs backend (tests 12-20)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-wiki.cjs, plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs</files>
  <action>
RED: tests 12-20 in `describe('wiki integration (local git)', {skip: !gitAvailable() && 'git not installed'})`, each with a fresh
fixture remote, a temp project (`git init -b main`), `DEVFLOW_WIKI_REMOTE=<remoteUrl>` and `gitTestEnv`. Commit RED.
GREEN: `readPage`, `writePage` (byte compare first), `listPages`, `openStore(root, {mode, remote})` returning
`{mode, readPage, writePage, listPages, push, fetch, headSha, revisionRef(page)}` for both `wiki` and `docs`.
Fix any sequence bug the real git exposes; keep tests 7-11 green. Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs</verify>
  <done>Tests 1-20 pass (or 12-18 skip visibly without git); nothing written outside os.tmpdir().</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "spawnSync\(\s*'git'" plugins/devflow/devflow/bin/lib/` → only `gh-wiki.cjs` (among gh-* modules) and test fixtures.
- `rg -n -- "--force|'-f'" plugins/devflow/devflow/bin/lib/gh-wiki.cjs` → no push force flag.
</verification>

<success_criteria>
A wiki store and a docs backend share one interface and one page table; writes rebase and push to `master` without ever
forcing; conflicts and outages are reported, not hidden.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-04-gh-wiki-store-SUMMARY.md`
</output>
