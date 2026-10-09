---
objective: 72-install-and-naming-cleanup
trd: "04"
type: standard
wave: 3
depends_on: ["72-02", "72-03"]
files_modified:
  - "plugins/devflow/** (moved to plugins/aoforge/** with git mv)"
  - "plugins/aoforge/** (every moved file's content)"
  - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
  - plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
  - plugins/aoforge/aoforge/bin/aof-tools.cjs
  - "plugins/aoforge/hooks/*.js (entry alias line)"
  - "plugins/eden-ui-flutter/**, plugins/eden-ui-web/**, plugins/aosentry-mcp/**, plugins/monorepo-standards/** (references only)"
  - .claude-plugin/marketplace.json
  - package.json
  - package-lock.json
  - README.md
  - CLAUDE.md
  - SECURITY.md
  - docs/USER-GUIDE.md
  - "site/** (content, layouts, data, hugo.toml)"
  - ".github/workflows/*.yml (devflow-checks.yml moved to aoforge-checks.yml)"
  - scripts/gen-docs-data.cjs
  - .gitignore
autonomous: true
requirements: [INST-02]
must_haves:
  truths:
    - "`git log --follow --oneline plugins/aoforge/aoforge/bin/aof-tools.cjs` reaches history from before this TRD (the move was a git rename)"
    - "`node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes: the planning tree is exempt under both names (`.planning/**` and `.aoforge/**`, through the codemod's SKIP), and no other tracked file outside the allowlist spells `devflow` (any case, minus the codemod's PRESERVE tokens), `df-tools` or `DF ►`; every allowlist entry has a reason of at least 20 characters and matches at least one tracked path"
    - "The full suite passes with the same baseline as 71-05 (roadmap-reconcile E2E1 transient only), run as `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'`, and `npm test`'s script names `plugins/aoforge/**`"
    - "`.claude-plugin/marketplace.json` lists plugin `aoforge` with `source: ./plugins/aoforge`; `plugins/aoforge/.claude-plugin/plugin.json` has `name: aoforge`; `claude plugin validate plugins/aoforge` and `claude plugin validate .` exit 0"
    - "Every entry point (`aof-tools.cjs`, `aoforge-watch.cjs`, every hook script registered in hooks.json and the statusLine script) calls `aliasLegacyEnv()` before it reads the environment, and a hook spawned with only the legacy skip variable set (e.g. the legacy form of `AOFORGE_SKIP_EDIT_GATE=1`) behaves as skipped (compat-entry.repo.test.cjs)"
    - "CLAUDE.md describes the renamed source tree and opens with a transition note (inside a `rename-guard:ignore-start`/`-end` region) that the live runtime during objective 72 is the installed DevFlow 2.15.0 plugin and this repo's planning tree stays at `.planning/` until TRD 72-21"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/aof-tools.cjs
      provides: "the renamed CLI, aliasing legacy env first"
      contains: "aliasLegacyEnv"
    - path: plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
      provides: "INST-02 repo gate over legacy names (token patterns built from LEGACY; PRESERVE from scripts/aoforge-rename.cjs)"
    - path: plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
      provides: "entry points alias legacy env; behavioural check on one hook"
  key_links:
    - from: "rename-guard.repo.test.cjs"
      to: "legacy-names.cjs LEGACY + scripts/aoforge-rename.cjs PRESERVE/SKIP"
      via: "require; the guard and the codemod share one definition of what is preserved and skipped"
      pattern: "aoforge-rename.cjs"
    - from: "hooks/*.js and bin/aof-tools.cjs"
      to: "compat.cjs aliasLegacyEnv"
      via: "first statement after the core requires"
      pattern: "aliasLegacyEnv\\("
---

# TRD 72-04: Apply the names rename (DevFlow -> AOForge, except the planning directory)

<objective>
Run 72-03's codemod with its `names` rules over the repository: move `plugins/devflow/` to `plugins/aoforge/`
(runtime dir `aoforge/`), `df-tools.cjs` to `aof-tools.cjs` and the other renamed files with `git mv`, and rewrite
every DevFlow name to its AOForge form. Make the entry points alias legacy `DEVFLOW_*` variables, add the repo gate
that keeps legacy names out, and end green. The `.planning` directory name is NOT touched here (72-05/06).

Purpose: INST-02. Everything after this TRD works in the final tree.
Output: the renamed tree in one mechanical commit, plus the guard and entry-alias tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md
@.planning/objectives/72-install-and-naming-cleanup/72-03-SUMMARY.md

Project kind `plugin`, work `feature`. Task 1 is test-first (the guard RED before the rewrite). The rewrite itself is
mechanical and verified by the whole suite.

**Why this is safe mid-objective.** The hooks gating this session run from the installed plugin cache
(`~/.claude/plugins/cache/aocyber/devflow/2.15.0/`) and the runtime mirror `~/.claude/devflow/`, not from this checkout.
Executors keep using `node ~/.claude/devflow/bin/df-tools.cjs` and this repo's `.planning/`, which this TRD does not
move. To exercise the repo's own code, run `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`.

Read: 72-03-SUMMARY.md (the manual list and both inventory summaries); `scripts/aoforge-rename.cjs --help`;
`plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` 1-130 (EXEMPT table shape to mirror in the guard).
</context>

## Test list

**rename-guard.repo.test.cjs** (repo test; skips itself in a mirror install without README.md, like doc-refs)
1. Scan set = `git ls-files` minus the codemod's `SKIP` minus `ALLOW`; it is non-empty (> 500 files) and includes
   `plugins/aoforge/aoforge/bin/aof-tools.cjs` and `README.md`.
2. Main gate: zero findings for `devflow` (case-insensitive, after masking PRESERVE tokens), `df-tools`, `DF ►`; a
   failure lists `file:line token` and the ALLOW table.
3. Lines inside `rename-guard:ignore-start` ... `rename-guard:ignore-end` are not scanned, and only files in
   `IGNORE_REGION_FILES` (CLAUDE.md, docs/USER-GUIDE.md) may contain such a region; regions are closed.
4. Every ALLOW entry has a reason >= 20 chars and matches >= 1 tracked path.
5. Sensitivity: a sample text with one of each token yields three findings; `devflowops` and `devflow.cloud` yield
   none.
5b. Planning-tree exemption: in a scratch git repo with tracked `.planning/x.md` and `.aoforge/x.md`, each containing the
   legacy product word, the guard's scan function yields zero findings for both (the tree stays history after 72-21's
   move), while the same word in a tracked `docs/x.md` yields one.
6. Token patterns are built from `LEGACY` (the test file itself contains no legacy literal).

**compat-entry.repo.test.cjs**
7. `aof-tools.cjs`, `aoforge-watch.cjs`, every `hooks/*.js` named in `hooks/hooks.json` and the plugin.json statusLine
   script contain `aliasLegacyEnv(` before their first `process.env` read.
8. Behaviour: spawn `hooks/gate-edits.js` in a scratch AOForge project (ambient, no skill marker) on a Write to a
   tracked file with env `{ [LEGACY.envPrefix + 'SKIP_EDIT_GATE']: '1' }` -> allowed (no deny output); without it ->
   denied.

<embedded_context>

<codebase_examples>
EXEMPT shape to mirror for ALLOW (doc-refs.repo.test.cjs):
```js
const EXEMPT = [
  { pattern: '**/*.test.cjs', reason: 'tests feed old command names as deliberate input fixtures ...' },
];
```
Initial ALLOW (each with its reason): `**/legacy-names.cjs`, `**/__fixtures__/legacy-*`, `**/*.legacy.test.*`,
`scripts/aoforge-rename*`, `scripts/__fixtures__/legacy-*`, `.gitignore` (keeps the legacy ignore lines for one
release beside the new ones). Pattern matching: reuse `doc-refs.cjs` `walkFiles`/glob helper rather than a new one.

Entry alias line:
```js
require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv();      // hooks/*.js
require('./lib/compat.cjs').aliasLegacyEnv();                   // bin/aof-tools.cjs (before other lib requires)
```
</codebase_examples>

<anti_patterns>
- Do not hand-edit what the codemod should do. If a whole class of token is wrong, fix the rule in
  `scripts/aoforge-rename.cjs` (with a test), reset the tree (`git checkout -- . && git clean -fd plugins scripts site`
  ONLY for paths this TRD changed) and re-run. Hand edits are for the manual residual list only.
- Do not touch `.planning` names (directory, strings, prose). The planning pass is 72-05/06.
- Do not delete legacy ignore lines from `.gitignore`: add the AOForge line beside each (the codemod lists `.gitignore`
  as manual).
- Do not rewrite CHANGELOG.md, NOTICE.md, docs history or the GSD fork attribution.
- Do not commit with a red suite; do not use `--no-verify`.
</anti_patterns>

<error_recovery>
- `git mv` refuses because a path is dirty: commit or stash nothing; stop and report. This TRD needs a clean tree.
- Suite failures after the rewrite fall into: (a) a test computing a path with `'devflow'` segments the rule missed
  (fix the rule), (b) a snapshot/golden that embeds a name (regenerate only if the generator is in-repo and the diff is
  names only), (c) the env alias missing at an entry point (Task 3). Record every residual fix in the SUMMARY.
- If more than ~30 files need hand fixes, stop after Task 2's commit and report: the codemod rules need another pass.
- `claude plugin validate` warns on an unknown field: record it; fail only on errors.
</error_recovery>

</embedded_context>

<gotchas>
- One commit for the move + rewrite keeps `git log --follow` simple. Use
  `node ~/.claude/devflow/bin/df-tools.cjs commit "refactor(72-04): rename DevFlow to AOForge (mechanical)" --files <paths>`
  with the top-level paths that changed (`plugins scripts site docs/USER-GUIDE.md README.md CLAUDE.md SECURITY.md
  package.json package-lock.json .claude-plugin .github .gitignore`); confirm `git status --porcelain` is empty after.
  If `commit` refuses a directory argument, pass the file list from `git status --porcelain` instead.
- `micro.test.cjs` hangs on commit signing: use the `!(micro)` full-suite form.
- `site/data/devflow.json` becomes `site/data/aoforge.json`; the Hugo templates read `site.Data.aoforge` after the
  rewrite. Regenerate with `node scripts/gen-docs-data.cjs` only if a test pins its content.
- `plugins/eden-ui-flutter` reads the runtime mirror: after this TRD its SKILL.md points at `~/.claude/aoforge/...`,
  which exists only once 3.0.0 is installed. That is intended (it ships with 3.0.0).
- Never port 8080.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: The rename guard, RED against today's tree</name>
  <files>plugins/devflow/devflow/bin/lib/rename-guard.repo.test.cjs</files>
  <action>
Write the guard (tests 1-6 and 5b, header test list first) at today's path; the codemod moves it in Task 2. Build token
patterns from `require('./legacy-names.cjs').LEGACY` and read `PRESERVE`/`SKIP` from
`require(path.join(REPO_ROOT, 'scripts', 'aoforge-rename.cjs'))`. Use `IS_AOFORGE_CHECKOUT`-style skipping (README.md at
REPO_ROOT). Run it: test 2 fails with thousands of findings (expected RED); tests 3-6 and 5b pass. Commit RED
(`test(72-04): rename guard (RED before the rewrite)`).
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/rename-guard.repo.test.cjs (expect test 2 to fail, tests 3-6 to pass)</verify>
  <done>The guard exists and fails only on the main gate.</done>
  <recovery>If the guard itself trips test 6 (a literal in its own source), build the string from LEGACY parts.</recovery>
</task>

<task type="auto">
  <name>Task 2: Run the names codemod, fix manifests and residuals</name>
  <files>(the whole tree outside SKIP; see frontmatter)</files>
  <action>
1. `git status --porcelain` must be empty. Run `node scripts/aoforge-rename.cjs --rules names` (dry run) and compare
   its counts with 72-03-SUMMARY; then `--rules names --write --report <scratchpad>/names-report.json`.
2. Manifests (verify what the codemod produced, fix only what it could not): `package.json` name
   `@ao-cyber-systems/aoforge-cc`, `scripts.test` globs `plugins/aoforge/**`, repository/homepage/bugs URLs
   `aoforge-claude`; `package-lock.json` name; marketplace.json plugin `aoforge`, `source: ./plugins/aoforge`,
   description wording AOForge; `plugins/aoforge/.claude-plugin/plugin.json` `name: aoforge`, description AOForge.
3. Manual residuals from the report: `.gitignore` (add the AOForge form of each legacy line, keep the legacy line);
   `plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js` (add `.aoforge` to the skip list, keep `.devflow`
   and `.planning`); anything else 72-03 listed as manual.
4. Run the guard: green. Run the full suite (`!(micro)` form with `plugins/aoforge/**`); fix residual failures per
   error_recovery. Run `claude plugin validate plugins/aoforge` and `claude plugin validate .`.
5. Commit everything in ONE commit (gotchas).
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs && node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs' && claude plugin validate plugins/aoforge && git status --porcelain</verify>
  <done>Guard green, full suite at baseline, both validations exit 0, tree clean, one rename commit;
`git log --follow` on aof-tools.cjs shows pre-rename history.</done>
  <recovery>A rule-level problem: fix the codemod with a test, `git checkout -- . && git clean -fd` the changed
top-level paths (never `.planning/`), re-run step 1.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Entry points alias legacy env; CLAUDE.md transition note</name>
  <files>plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs, plugins/aoforge/aoforge/bin/aof-tools.cjs, plugins/aoforge/aoforge/bin/aoforge-watch.cjs, plugins/aoforge/hooks/*.js, CLAUDE.md, plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs</files>
  <action>
RED: tests 7-8 in `compat-entry.repo.test.cjs`. Run: 7 fails for every entry point, 8 fails (legacy skip ignored).
Commit RED.

GREEN: add the alias line (codebase_examples) as the first statement after the `fs`/`path`/`os` requires in
`aof-tools.cjs`, `aoforge-watch.cjs` and every hook script registered in `hooks.json` plus `statusline.js`. Run tests
7-8 and the hooks suites. Commit GREEN.

CLAUDE.md: at the top, inside a `<!-- rename-guard:ignore-start -->` / `<!-- rename-guard:ignore-end -->` region,
add "Transition (objective 72): this file describes the renamed AOForge source tree. Until AOForge 3.0.0 is installed
(TRD 72-21) the live runtime is the installed DevFlow 2.15.0 plugin: run `node ~/.claude/devflow/bin/df-tools.cjs`,
and this repo's planning tree stays at `.planning/`. 72-22 removes this note." Do not spell a slash command in it.
Add `CLAUDE.md` to the guard's `IGNORE_REGION_FILES`. Commit (`docs(72-04): CLAUDE.md transition note`).
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Tests 7-8 pass; the guard and doc-refs gate pass with the note in place; full suite at baseline.</done>
  <recovery>If a hook reads env at module scope above the alias line, move the alias above that read; never alias
inside `main()` only.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
<build>claude plugin validate plugins/aoforge && claude plugin validate .</build>
</validation_gates>

<verification>
- `git show --stat HEAD~1` (the rename commit) shows renames, not delete+add, for `plugins/aoforge/**`.
- `rg -n -i 'devflow' plugins/aoforge -g '!*legacy*' | rg -v -e devflowops -e 'devflow\.cloud' | head` prints nothing
  outside allowlisted files.
- `node plugins/aoforge/aoforge/bin/aof-tools.cjs state load --raw` works in this repo (it still reads `.planning/`
  because the planning pass has not run).
</verification>

<success_criteria>
- The tree is AOForge by name everywhere except the planning directory, history and the allowlisted shim files.
- The suite is green and the guard keeps it that way.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-04-SUMMARY.md` through
`df-tools summary post`.
</output>
