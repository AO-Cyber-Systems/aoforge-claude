---
objective: 72-install-and-naming-cleanup
trd: "03"
type: standard
wave: 2
depends_on: ["72-01"]
files_modified:
  - scripts/aoforge-rename.cjs
  - scripts/aoforge-rename.legacy.test.cjs
  - scripts/__fixtures__/legacy-rename-fixtures.cjs
autonomous: true
requirements: [INST-02]
must_haves:
  truths:
    - "`node scripts/aoforge-rename.cjs --rules names --inventory` on this repo prints every distinct legacy token with its action (rename -> target, preserve -> reason, manual -> reason) and `unclassified=0`, and exits 0; with an unclassified token it exits 1 and names it"
    - "`--rules planning --inventory` on this repo also reports `unclassified=0`"
    - "`--dry-run` (the default) on a scratch git repo prints the planned path moves, per-file rewrite counts and the residual list, and leaves `git status --porcelain` empty"
    - "`--write` on a scratch git repo performs every path move with `git mv` (history follows; the executable bit of a moved script is kept) and rewrites file contents; a second `--dry-run` then reports zero moves and zero rewrites (idempotent)"
    - "Preserved tokens survive a names rewrite unchanged: `devflowops`, `devFlowOps`, `devflow-desktop`, `devflow.cloud`, fleet repo-name strings in stack fixtures, and every skipped path (`.planning/**`, `.aoforge/**`, CHANGELOG.md, NOTICE.md, LICENSE, docs/** except docs/USER-GUIDE.md, `legacy-names.cjs`, `__fixtures__/legacy-*.cjs`, `*.legacy.test.*`, this script and its test)"
    - "The planning rule turns `path.join(<expr>, '.planning'` and `path.resolve(<expr>, '.planning'` into `planningRoot(<expr>)` forms and injects one `planningRoot` import from `compat.cjs` with the correct relative path; any other `.planning` in non-test code is rewritten to `.aoforge` AND listed as a residual for review"
  artifacts:
    - path: scripts/aoforge-rename.cjs
      provides: "the one-shot DevFlow -> AOForge codemod: PATH_RULES, NAME_RULES, PLANNING_RULES, PRESERVE, SKIP, mapPath, rewriteNames, rewritePlanning, inventory, CLI"
      exports: ["mapPath", "rewriteNames", "rewritePlanning", "classifyToken", "inventory", "PRESERVE", "SKIP", "main"]
    - path: scripts/aoforge-rename.legacy.test.cjs
      provides: "rule, preserve, skip, CLI and idempotence tests"
    - path: scripts/__fixtures__/legacy-rename-fixtures.cjs
      provides: "hand-built sample files and a scratch git repo shaped like this repository"
      exports: ["sampleFiles", "scratchRepo"]
  key_links:
    - from: "scripts/aoforge-rename.cjs --write"
      to: "git mv"
      via: "spawnSync('git', ['mv', from, to]) per PATH_RULES move, before content rewrites"
      pattern: "'mv'"
    - from: "rewritePlanning"
      to: "plugins/*/*/bin/lib/compat.cjs planningRoot"
      via: "injected require with a path relative to the rewritten file"
      pattern: "planningRoot"
---

# TRD 72-03: A tested, idempotent codemod for the DevFlow -> AOForge rename

<objective>
The rename touches about 750 tracked files outside `.planning/` (6,381 `devflow`, 1,181 `DevFlow`, 514 files naming
`df-tools`, 234 naming a `DEVFLOW_` variable, 626 naming `.planning`). Doing that by hand is not reviewable. Build one
script that knows every rule, every token to preserve and every path to skip, proves it on hand-built samples, and
classifies every distinct token in this repository before anything is written. 72-04 runs its `names` rules, 72-05 and
72-06 its `planning` rules.

Purpose: INST-02 at scale without collateral damage (devflowops, devflow-desktop, the devflow.cloud domain and the
fleet repo names are other things and must not change).
Output: `scripts/aoforge-rename.cjs` with tests and fixtures; a clean inventory of this repo (`unclassified=0`).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, no property-based libraries,
no `.feature` files. One test at a time.

Naming convention (72-02): legacy names may be spelled only in `bin/lib/legacy-names.cjs`, `__fixtures__/legacy-*.cjs`
and `*.legacy.test.*`. This script is a one-shot tool that necessarily spells them; it stays in the repo as the record
of the rename and 72-04's repo test allowlists `scripts/aoforge-rename*` and `scripts/__fixtures__/legacy-*`.
`scripts/**/*.test.cjs` is already in `npm test`.

Measured inventory at planning (outside `.planning/`, CHANGELOG excluded): compound tokens include `devflow-claude`
(462), `devflow-watch` (203), `.devflow` (115, the user dot dir `~/.devflow/` and `.devflow/no-binaries.yml` of
monorepo-standards), `.devflow-handoff` (105), `devflow-ref`/`devflow_ref` (checks caller input), `devflowSrc`,
`devflowWatchPath`, `seedDevflowScope`, `devflowScopes`, `IS_DEVFLOW_CHECKOUT`, `.devflow-notices`, `devflow-setup`,
`devflow-store-cache`, `devflow-upgrade`, `devflow-untrack-runtime-state`, `devflow-edit-gate`, `devflow_todo`,
`DEVFLOW_MANAGED`, `devflow.cloud` (hugo baseURL; the domain stays until objective 74), `devflowops` (18, a different
product), and the fleet repo names `'devflow'`, `'devflow-test'` in `__fixtures__/stack-fleet-tables.cjs`.
Sibling plugins are in scope: `plugins/eden-ui-flutter/skills/frontend-design/SKILL.md` reads
`~/.claude/devflow/references/*` and runs `df-tools`; three sibling `plugin.json` files link `devflow-claude`;
`plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js` lists `.devflow` and `.planning` as dirs to skip
(that line becomes a manual residual: ADD `.aoforge`, keep the others).
</context>

## Test list

Outermost first: the CLI on a scratch git repo, then the pure rules. One at a time.

**CLI (scratch repo from `scratchRepo()`)**
1. `--rules names --inventory` on the scratch repo: exit 0, output lists each distinct token once with action and
   count, ends with `unclassified=0`.
2. Add a file containing `devflowzap` (unknown compound): `--inventory` exits 1 and names `devflowzap`.
3. `--rules names` (default dry run): stdout lists `move plugins/devflow -> plugins/aoforge`,
   `move plugins/aoforge/devflow -> plugins/aoforge/aoforge`, the `df-tools.cjs -> aof-tools.cjs` move, a rewrite count
   per file and `residuals=<n>`; `git status --porcelain` is empty afterwards.
4. `--rules names --write`: `git status` shows renames (R) for moved files; the moved `bin/df-tools` stub is still
   mode 100755 (`git ls-files -s`); a second `--rules names` dry run prints `moves=0 rewrites=0`.
5. `--rules planning --write` after 4: `lib/sample.cjs`'s `path.join(cwd, '.planning', 'STATE.md')` became
   `path.join(planningRoot(cwd), 'STATE.md')` with `const { planningRoot } = require('./compat.cjs');` injected once;
   a hook file got `require('../aoforge/bin/lib/compat.cjs')`; a second planning dry run reports `rewrites=0`.
6. `--report <file>` writes JSON `{ rules, moves, rewrites, residuals: [{ file, line, text, reason }] }`.
6b. `--only <prefix>` (repeatable) restricts moves, rewrites and inventory to tracked files under those path prefixes:
    `--rules planning --only plugins/aoforge/aoforge/bin` leaves a hook file untouched.

**Pure rules**
7. `mapPath`: `plugins/devflow/devflow/bin/lib/x.cjs` -> `plugins/aoforge/aoforge/bin/lib/x.cjs`;
   `plugins/devflow/hooks/a.js` -> `plugins/aoforge/hooks/a.js`; `.../bin/df-tools.cjs` -> `.../bin/aof-tools.cjs`;
   `.github/workflows/devflow-checks.yml` -> `aoforge-checks.yml`; `templates/github/devflow.yml` -> `aoforge.yml`;
   `site/data/devflow.json` -> `aoforge.json`; `site/content/docs/reference/df-tools.md` -> `aof-tools.md`;
   `bin/devflow-watch.cjs` -> `bin/aoforge-watch.cjs`; `.planning/x`, `.aoforge/x` and `CHANGELOG.md` -> unchanged
   (skipped).
8. `rewriteNames`, one case each: `/devflow:quick` -> `/aoforge:quick`; `devflow:executor` -> `aoforge:executor`;
   `node ~/.claude/devflow/bin/df-tools.cjs` -> `node ~/.claude/aoforge/bin/aof-tools.cjs`; `DEVFLOW_SKIP_EDIT_GATE` ->
   `AOFORGE_SKIP_EDIT_GATE`; `<!-- DEVFLOW:START v=3 -->` -> `<!-- AOFORGE:START v=3 -->`; `DevFlow builds` ->
   `AOForge builds`; `isDevflowAgent` -> `isAoforgeAgent`; `DF ► PLANNING` -> `AOF ► PLANNING`;
   `github.com/AO-Cyber-Systems/devflow-claude` -> `.../aoforge-claude`; `devflow-docs` -> `aoforge-docs`;
   `devflow/adopt` -> `aoforge/adopt`; `@ao-cyber-systems/devflow-cc` -> `@ao-cyber-systems/aoforge-cc`.
9. Preserves: `devflowops`, `devFlowOps`, `devflow-desktop`, `https://devflow.cloud/` unchanged; in a file named
   `stack-fleet-tables.cjs`, `'devflow'` and `'devflow-test'` unchanged while `/devflow:quick` in the same file is
   rewritten; in `monorepo-standards/.../doctor.js` the `'.devflow'` entry is unchanged and reported `manual`.
10. Skips: content of `legacy-names.cjs`, `__fixtures__/legacy-x.cjs`, `a.legacy.test.cjs`, `CHANGELOG.md`,
    `docs/PROPOSAL-x.md`, `.planning/STATE.md` and `.aoforge/STATE.md` (the planning tree after 72-21's move) is never
    rewritten (`docs/USER-GUIDE.md` is).
11. Binary file (contains a NUL byte) is never rewritten.
12. `rewritePlanning`: `path.join(ctx.root, '.planning')` -> `planningRoot(ctx.root)`; `path.resolve(root, '.planning',
    'objectives')` -> `path.resolve(planningRoot(root), 'objectives')`; existing `const { x } = require('./compat.cjs')`
    gains `planningRoot` instead of a second require; a file that already declares `planningRoot` is left alone and
    reported `manual`; `'.planning/config.json'` in non-test code -> `'.aoforge/config.json'` and reported residual;
    `.planning/STATE.md` in markdown prose -> `.aoforge/STATE.md`, not residual; a regex literal `/\/\.planning\//` ->
    unchanged and reported `manual` (72-06 builds it from LEGACY).
13. `classifyToken('devflow-watch')` -> rename `aoforge-watch`; `classifyToken('devflowops')` -> preserve.

<embedded_context>

<codebase_examples>
How hooks reach libs today (the planning rule must produce the same relative style):
```js
const store = require('../devflow/bin/lib/hook-marker-store.cjs');            // hooks/*.js
rd = require(path.join(__dirname, '..', 'devflow', 'bin', 'lib', 'runtime-digest.cjs'));
```
After the names pass these read `../aoforge/bin/lib/...`, so the injected import in a hook is
`const { planningRoot } = require('../aoforge/bin/lib/compat.cjs');`, in `bin/lib/x.cjs` it is `'./compat.cjs'`, in
`bin/lib/migrations/x.cjs` and `bin/lib/doctor-checks/x.cjs` `'../compat.cjs'`, in `bin/aof-tools.cjs` `'./lib/compat.cjs'`.

Commonest planning shapes (counts from planning): `path.join(cwd, '.planning', 'ROADMAP.md')` (17),
`path.join(cwd, '.planning', 'objectives')` (17), `path.join(cwd, '.planning', 'STATE.md')` (12),
`path.join(cwd, '.planning')` (11), `path.join(root, '.planning')` (5).
</codebase_examples>

<anti_patterns>
- Never `--write` against this repository in this TRD. Inventory only; 72-04 writes.
- No blanket `s/devflow/aoforge/` without the preserve mask. Mask preserved tokens with placeholders that cannot occur
  in source (e.g. `\u0000P<n>\u0000`), rewrite, then restore.
- Do not move a path with fs.rename: `git mv` only, so history follows.
- Do not rewrite `.planning` in the names pass or names in the planning pass: the passes are separate so 72-04 can
  stay green without the resolver.
- No generated test data: the fixture samples are typed out.
</anti_patterns>

<error_recovery>
- Ordering bugs (`DevFlow` handled after `devflow` lowercasing it) show up as `Aoforge` in prose: apply rules from most
  specific to least: preserves, `/devflow:`, `df-tools`, `DF ►`, `DEVFLOW`, `DevFlow`, camel `Devflow`, `devflow`.
- If `git mv` of a directory fails because the target exists (re-run), skip moves whose source is absent and target
  present: that is what makes `--write` idempotent.
- If an inventory token is ambiguous (prose that could mean the devflowops product), classify it `manual` with the
  reason; 72-04 decides by reading the line.
</error_recovery>

</embedded_context>

<gotchas>
- The live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
- Do not require anything from `plugins/` in the script (paths move under it). It is self-contained.
- `rg` is not guaranteed in CI; use `git ls-files -z` + Node fs in the script.
- The `DF ►` banner contains U+25BA; keep the file UTF-8 and match the character exactly.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders: sample files and a scratch repo shaped like this one</name>
  <files>scripts/__fixtures__/legacy-rename-fixtures.cjs</files>
  <action>
Create `sampleFiles()` -> `{ [relPath]: content }` with typed-out samples covering every case of tests 7-12:
`plugins/devflow/devflow/bin/df-tools.cjs` (requires `./lib/sample.cjs`, reads `process.env.DEVFLOW_X`),
`plugins/devflow/devflow/bin/lib/sample.cjs` (the planning shapes, a `'.planning/config.json'` literal, a regex
literal), `plugins/devflow/devflow/bin/lib/compat.cjs` (stub exporting `planningRoot`), `plugins/devflow/hooks/a.js`,
`plugins/devflow/skills/quick/SKILL.md` (prose with `/devflow:quick`, `DF ►`, `@~/.claude/devflow/...`,
`.planning/STATE.md`), `plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs`, a monorepo-standards
`doctor.js` line, `site/hugo.toml` with `devflow.cloud`, `README.md` with the repo URL and `devflowops`, `CHANGELOG.md`,
`docs/PROPOSAL-x.md`, `docs/USER-GUIDE.md`, `.planning/STATE.md`, a `legacy-names.cjs` and a `x.legacy.test.cjs`, a
binary `assets/x.bin` with a NUL byte, and an executable `plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/bin/df-tools`.
`scratchRepo()` -> `{ root, cleanup }`: mkdtemp, `git init -q`, user config local, write samples, chmod +x the stub,
`git add -A`, commit (`-c commit.gpgsign=false`). Check with `node -e` that the repo is clean. Commit
(`test(72-03): rename codemod fixtures`).
  </action>
  <verify>node -e "const f=require('./scripts/__fixtures__/legacy-rename-fixtures.cjs');const r=f.scratchRepo();console.log(require('child_process').execSync('git status --porcelain',{cwd:r.root}).toString()||'clean');r.cleanup()"</verify>
  <done>Both builders exist; the scratch repo is a clean git repo containing every sample.</done>
  <recovery>If commit signing prompts inside the fixture, pass `-c commit.gpgsign=false` to that `git commit`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pure rules: paths, names, planning, preserves, skips</name>
  <files>scripts/aoforge-rename.legacy.test.cjs, scripts/aoforge-rename.cjs</files>
  <action>
RED: tests 7-13 (header test list with all 13 cases first). Run: fail (module missing). Commit RED.

GREEN, `scripts/aoforge-rename.cjs` (CommonJS, Node built-ins only):
- `SKIP` (no content rewrite, no move): `.planning/**` and `.aoforge/**` (the planning tree is history under either
  name, and 72-21 moves it from one to the other), `CHANGELOG.md`, `NOTICE.md`, `LICENSE*`, `docs/**` except
  `docs/USER-GUIDE.md`, `**/legacy-names.cjs`, `**/__fixtures__/legacy-*`, `**/*.legacy.test.*`,
  `scripts/aoforge-rename*`, `node_modules/**`, `site/public/**`. Skipped files that live under a moved directory are
  still MOVED (git mv moves the directory) but never rewritten.
- `PATH_RULES`: ordered prefix and basename rules of test 7.
- `PRESERVE`: global tokens (`devflowops`, `devFlowOps`, `DevFlowOps`, `devflow-desktop`, `devflow.cloud`) and
  file-scoped ones (`stack-fleet-tables.cjs`, `stack-golden-fixtures.cjs`, `stack-realshape-fixtures.cjs` and
  `stack-*.test.cjs`: quoted `'devflow'`, `'devflow-test'`), plus `manual` entries (monorepo-standards doctor.js
  `'.devflow'`).
- `NAME_RULES` in the order given in error_recovery; `rewriteNames(text, rel) -> { text, count, residuals }`.
- `PLANNING_RULES`: the `path.join|path.resolve(<expr>, '.planning'` transform (expr = identifier or dotted member),
  import injection/merge with the relative path computed from `rel` to the nearest `bin/lib/compat.cjs` (rules in
  codebase_examples), `.planning` -> `.aoforge` elsewhere, residual tagging for non-test `.cjs/.js` string literals,
  regex literals and files that already declare `planningRoot`; `rewritePlanning(text, rel)`.
- `classifyToken(token, rel)` -> `{ action: 'rename'|'preserve'|'manual'|'unclassified', target?, reason? }`.
Header: the rules, the order, why each preserve exists, and that the script is the record of the 72 rename.
Commit GREEN.
  </action>
  <verify>node --test scripts/aoforge-rename.legacy.test.cjs</verify>
  <done>Tests 7-13 pass.</done>
  <recovery>If test 9's file-scoped preserve leaks into other files, key file scopes on the basename, not the path
prefix (paths move under `plugins/`).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: CLI (inventory, dry run, write, report) and a clean inventory of this repo</name>
  <files>scripts/aoforge-rename.legacy.test.cjs, scripts/aoforge-rename.cjs</files>
  <action>
RED: tests 1-6b (spawn `node scripts/aoforge-rename.cjs` with `cwd` = the scratch repo). Run: fail. Commit RED.

GREEN: `main(argv)`: `--rules names|planning` (required), `--inventory`, `--write`, `--report <file>`,
`--only <prefix>` (repeatable); default is the dry run. Unknown flags exit 1. Files come from `git ls-files -z` at cwd. Inventory scans with a broad token regex (any run of
`[A-Za-z0-9_.~/@-]*` containing `devflow`, `df-tools`, `DF ►` or `.planning`, case-insensitive for devflow) and prints
`<token>\t<action>\t<target|reason>\t<count>` sorted, then `unclassified=<n>`; exit 1 when n > 0. `--write` runs
PATH_RULES moves first (each `git mv`, skipping moves already done), then content rewrites over the post-move file
list. stdout ends with `moves=<n> rewrites=<n> residuals=<n>`. Commit GREEN.

Then, READ-ONLY on this repository: run `node scripts/aoforge-rename.cjs --rules names --inventory` and
`--rules planning --inventory`. For each unclassified token, read one or two of its lines and add a rule, preserve or
manual entry (with a reason) to the tables, plus a pure test case when it is a new rule shape. Repeat until both report
`unclassified=0`. Record both final inventories' summary lines and the manual list in the SUMMARY. Commit
(`feat(72-03): classify every legacy token in the repository`).
  </action>
  <verify>node --test scripts/aoforge-rename.legacy.test.cjs && node scripts/aoforge-rename.cjs --rules names --inventory | tail -1 && node scripts/aoforge-rename.cjs --rules planning --inventory | tail -1 && git status --porcelain</verify>
  <done>Tests 1-13 pass; both inventories of this repo print `unclassified=0`; the repo has no uncommitted changes
from the inventory runs.</done>
  <recovery>If the inventory is huge on screen, pipe through `cut -f1,2,4 | sort -k3 -n -r | head -80` while
classifying; the script output itself stays complete.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test scripts/aoforge-rename.legacy.test.cjs</test>
<test>npm test   (full suite before the last commit; micro exclusion form if signing prompts)</test>
</validation_gates>

<verification>
- `node scripts/aoforge-rename.cjs --rules names --inventory | tail -1` prints `unclassified=0`.
- `node scripts/aoforge-rename.cjs --rules planning --inventory | tail -1` prints `unclassified=0`.
- `git status --porcelain` is empty: nothing in the repo was rewritten by this TRD.
</verification>

<success_criteria>
- A reviewed, tested codemod with zero unclassified tokens is ready for 72-04 (names) and 72-05/06 (planning).
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-03-SUMMARY.md` through
`df-tools summary post`.
</output>
