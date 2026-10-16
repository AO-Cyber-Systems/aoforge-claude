---
objective: quick-34
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs
  - package.json
  - package-lock.json
  - plugins/aoforge/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - CHANGELOG.md
  - site/data/aoforge.json
  - plugins/aoforge/aoforge/bin/lib/stack-drafter-fleet.test.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-pack-hints.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-profile.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-profile.test.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs
  - scripts/release-tag.cjs
  - scripts/release-tag.test.cjs
  - .github/workflows/release.yml
  - plugins/aoforge/hooks/changelog-on-tag.js
  - plugins/aoforge/hooks/changelog-on-tag.test.js
  - plugins/aoforge/aoforge/bin/lib/changelog.cjs
  - plugins/aoforge/aoforge/bin/lib/changelog.test.cjs
  - CLAUDE.md
  - plugins/aoforge/aoforge/bin/lib/security-sweep.cjs
  - plugins/aoforge/aoforge/bin/lib/security-sweep.test.cjs
autonomous: true
must_haves:
  truths:
    - "package.json, package-lock.json (root and packages[\"\"]), plugins/aoforge/.claude-plugin/plugin.json and .claude-plugin/marketplace.json (top-level `version` and the `aoforge` entry) all say 3.1.0. Every pack's `aoforge` dependency range (`>=3.1.0`) is satisfied by it, and CHANGELOG.md has a `## [3.1.0]` heading. A repo test in stack-packs.test.cjs enforces all three, and it failed at ee93e66f"
    - "The `devflow` pointer entry and plugins/devflow/.claude-plugin/plugin.json stay at 3.0.0. The pack versions (1.0.0) are unchanged"
    - "`node --test plugins/aoforge/aoforge/bin/lib/stack-drafter-fleet.test.cjs` on this machine goes from 31 pass / 18 fail / 1 skipped (baseline at ee93e66f) to 49 pass / 0 fail / 1 skipped, because it drafts with this checkout's packs (useRepoPacks). ACCEPTED, OPEN and FLEET are not edited"
    - "An `extends: flutter` or `extends: dart` that cannot be resolved gives an EXTENDS_UNRESOLVED message naming `aoforge-stack-flutter` and `/plugin install aoforge-stack-flutter@aocyber`. The messages for go and an unknown id (stack-profile tests B3 and B4) are unchanged byte for byte"
    - "A `v*` tag push runs scripts/release-tag.cjs. It creates and pushes `aoforge--vX.Y.Z` at the same commit, idempotently, then creates the core release. A `<pack>--vX.Y.Z` push creates that pack's release from plugins/<pack>/CHANGELOG.md with `--latest=false`. An `aoforge--v*` push creates no second release. Unit tests with a fake exec prove all of this and never run real git push or gh"
    - "changelog-on-tag denies `git tag -a aoforge--v3.1.1` with a hint of `changelog update --version v3.1.1`. Running that hinted command in the fixture repo and committing makes the gate pass. The hint for a plain `v3.1.1` tag is byte-identical to before"
    - "`changelog update` picks the previous core tag with `--match 'v[0-9]*'`, so a pack tag between releases does not shrink the commit range"
    - "security sweep redacts every listed leak form in JSON and --raw output. Each test line is asserted to be a reported hit, so no case passes vacuously. Go `password :=`, `sk-ant-…` and `github_pat_…` are now leads"
    - "A 200 KB single-line .js file of adversarial text sweeps in under 5 s. The test runs it in a child process with a 30 s kill timeout. No PATTERNS alternative has two `.*`"
    - "`security sweep --root <missing path or file>` exits 1, and `sweep()` throws for it"
    - "`npm test` reports 0 failures, compared with a baseline measured at ee93e66f before any change. Nothing is pushed, tagged or released, and nothing is written under ~/.claude"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/stack-pack-hints.cjs
      provides: "PACK_PROFILES {flutter, dart -> aoforge-stack-flutter} and packInstallHint(id) -> string|null"
      exports: ["PACK_PROFILES", "packInstallHint"]
    - path: scripts/release-tag.cjs
      provides: "parseTag, planTag, releaseNotes, runRelease (exec injected) and a CLI `node scripts/release-tag.cjs <tag>`"
      exports: ["parseTag", "planTag", "releaseNotes", "runRelease"]
    - path: .github/workflows/release.yml
      provides: "triggers on tags 'v*' and '*--v*'. One step runs `node scripts/release-tag.cjs \"$GITHUB_REF_NAME\"`"
    - path: plugins/aoforge/aoforge/bin/lib/security-sweep.cjs
      provides: "whole-token and fail-closed key/value redaction, MAX_LINE_CHARS cap with line_truncated / lines_capped, tempered sql-injection and debug-defaults rows, a root check"
  key_links:
    - from: "stack-profile.cjs unresolvedMessage (~line 195)"
      to: "stack-pack-hints.cjs packInstallHint(id)"
      via: "appends `; <hint>` only when the id is pack-owned"
    - from: ".github/workflows/release.yml"
      to: "scripts/release-tag.cjs runRelease"
      via: "node scripts/release-tag.cjs \"$GITHUB_REF_NAME\" with GH_TOKEN set"
    - from: "changelog-on-tag.js core deny (~line 276)"
      to: "aof-tools changelog update --version v<version>"
      via: "the prefix-stripped `version`, not `tag`"
    - from: "stack-drafter-fleet.test.cjs"
      to: "__fixtures__/stack-pack-env.cjs useRepoPacks()"
      via: "required at the top of the file, as stack-drafter-golden/e2e already do"
---

# Quick 34: release blockers for 3.1.0, and secret leaks in security sweep

## Objective

End-to-end testing of objectives 76 and 77 on `main` found three defect groups. Fix each one test first.

1. **Core version against the packs.** Objective 77 shipped packs that depend on `aoforge >=3.1.0`, but core still says
   3.0.0, so Claude Code disables both packs (`dependency-version-unsatisfied`). The local fleet harness fails for 18
   repos because it drafts without any pack. EXTENDS_UNRESOLVED for flutter or dart gives no install hint.
2. **No release step makes prefixed tags.** Packs resolve core from `aoforge--vX.Y.Z` (docs/PROPOSAL-stack-packs.md
   Q15, ~line 833), but release.yml only handles `v*`. The changelog gate's hint for `aoforge--v3.1.0` writes the wrong
   heading.
3. **security sweep leaks secrets** in hit text, has regexes with catastrophic backtracking, and treats a missing
   `--root` as clean.

Repository: `/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/main-wt`
(worktree of `main`, branch `fix/post-77-verification`, HEAD ee93e66f, planning tree `.planning/`). Work only there,
with absolute paths. Run aof-tools as `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs --cwd <repo> ...`.

## Locked decisions

- **Bump core to 3.1.0 now.** `main` is the marketplace's distribution channel and already carries the 3.1.0 content
  (the Flutter and web procedure is gone from core), so a 3.0.0 label there is wrong. Do not lower the packs' range:
  the pack contract does not exist in a 3.0.0 core. Bump exactly the sites the 3.0.0 and 2.15.0 release commits
  bumped: package.json, package-lock.json lines 3 and 9, plugins/aoforge/.claude-plugin/plugin.json, and
  marketplace.json (top-level `version` and the `aoforge` entry), then regenerate site/data/aoforge.json with
  `node scripts/gen-docs-data.cjs`. Leave the `devflow` pointer (marketplace entry and plugin.json) at 3.0.0. It is the
  pointer's final release, and POINTER_MAJOR is 3.
- **CHANGELOG.** Insert `## [3.1.0] - Unreleased` directly under `## [Unreleased]`, so the content accumulated there
  becomes the 3.1.0 section and `## [Unreleased]` is left empty. This follows the packs' own `## [1.0.0] - Unreleased`
  convention. The user sets the date at tag time. The gate regex `^## \[3.1.0\]` and the notes extraction both match
  the heading.
- **Fleet harness.** It uses the checkout's packs, the same way it already uses the checkout's aof-tools. Do not skip
  it, and do not edit ACCEPTED, OPEN or FLEET to make it pass. A probe at planning time, running the test with
  `useRepoPacks()` pre-required, gave 49 pass / 0 fail / 1 skipped.
- **Neutrality.** The install-hint table goes in a new data-only module, `lib/stack-pack-hints.cjs`, with its own ALLOW
  entry in stack-neutrality.repo.test.cjs: "install hints keyed by profile id: the pack that ships each pack-owned
  profile". This follows the precedent of skill-requires.cjs ("install hints keyed by tool name"). Do not ALLOW
  stack-profile.cjs itself.
- **Release logic.** It lives in a testable Node script with an injected `exec`, not in workflow shell. CI pushes the
  alias tag with GITHUB_TOKEN, which does not trigger another workflow run. A pack release is `--latest=false`, so it
  never displaces core as the repository's Latest release.
- **Redaction is fail-closed.** Redact the whole token (prefix and body). After a secret-looking key and its operator,
  redact the whole rest of the line. Lines are capped at MAX_LINE_CHARS = 4096 before matching. Lower the cap to 2048
  only if the timing test is still slow, and record the reason.
- Test posture: strict. Write the failing test, confirm it is RED, commit it, then make the fix and commit it. Commit
  only through `aof-tools commit`. Never push, tag or create a release. Never write under `~/.claude`. Never use port 8080.

## Test list

Each list runs outermost first. Every item is a named `test(...)` with hand-built fixtures. There is no
property-based testing, no Gherkin and no generated data.

**Task 1**
1. stack-packs.test.cjs, `core version: the sync files agree, satisfy every pack's aoforge range, and have a CHANGELOG
   heading`. Asserts:
   - package.json === package-lock (root and `packages[""]`) === plugins/aoforge plugin.json === marketplace top-level
     === marketplace `aoforge` entry;
   - every in-repo pack's `{name:'aoforge', version}` range parses as `^>=(\d+)\.(\d+)\.(\d+)$`. Any other form fails
     with "unsupported range" and is never skipped;
   - the core version is at least that minimum;
   - CHANGELOG.md matches `^## \[<core>\]`.
   RED: 3.0.0 < 3.1.0.
2. stack-packs.test.cjs, `stack-pack-hints covers exactly the profiles the in-repo packs ship`. Every manifest
   `profiles/<id>.md` of every `plugins/aoforge-stack-*` maps to that pack's plugin in PACK_PROFILES, and every
   PACK_PROFILES entry names an in-repo pack that ships it. RED: module missing.
3. stack-profile.test.cjs. Set AOFORGE_STACKS_DIR to an empty temp dir and a fake empty userHome, then resolve
   `extends: flutter` and `extends: dart`. Each gives exactly one EXTENDS_UNRESOLVED whose message contains
   `aoforge-stack-flutter` and `/plugin install aoforge-stack-flutter@aocyber`. Restore the env in `finally`. B3 and B4
   stay unchanged.
4. Existing (outermost): stack-drafter-fleet.test.cjs, 18 failures → 0. Its RED is the current failure, e.g. `aocore:
   new conflict: components: committed admin/|flutter, dev/devedge/|go, go/|go, portal/|flutter vs draft
   dev/devedge/|go, go/|go`.

**Task 2** (release-tag tests use a fake `exec` that records `[cmd, ...args]` and returns scripted results)
1. release-tag.test.cjs, workflow text (in the style of workflow-permissions.test.cjs, text-level):
   - release.yml's tag filter lists both `'v*'` and `'*--v*'`;
   - a run step invokes `node scripts/release-tag.cjs "$GITHUB_REF_NAME"`;
   - `contents: write` is still declared;
   - no `${{ github.ref_name }}` is interpolated inside a `run:` block.
2. `runRelease('v3.1.0')`, alias absent. Calls in order: rev-parse of the tag commit, verify of the alias (fails), then
   `git tag aoforge--v3.1.0 <sha>`, `git push origin refs/tags/aoforge--v3.1.0`, `gh release view v3.1.0` (fails), and
   `gh release create v3.1.0 --title … --notes-file …` without `--latest=false`.
3. Alias already at the same commit: no tag and no push. At a different commit: throws, naming both shas, and no
   release is created.
4. Release already exists: the alias is still ensured, and `gh release create` is not called.
5. `runRelease('aoforge-stack-demo--v1.0.0')` on a fixture root with that pack's plugin.json (1.0.0) and CHANGELOG
   uses the notes from `plugins/aoforge-stack-demo/CHANGELOG.md`, passes `--latest=false`, and makes no alias.
6. `runRelease('aoforge--v3.1.0')` performs zero exec calls and returns `{ action: 'skip' }`.
7. planTag throws for:
   - `nosuch--v1.0.0` (no such plugin);
   - `aoforge-stack-demo--v9.9.9` (plugin.json says 1.0.0);
   - `v3.0.9` when core plugin.json says 3.1.0;
   - `v3.1`;
   - `release-1`.
8. releaseNotes:
   - extracts the body under `## [1.0.0] - Unreleased` up to the next `## [`;
   - treats the version as a literal (`1.0.0` does not match `## [1x0x0]`);
   - returns '' when the heading is absent, which leads to `--generate-notes`.
9. Against the real repo root: `releaseNotes(CHANGELOG.md, <package.json version>)` is non-empty. This depends on
   Task 1.
10. changelog-on-tag.test.js:
    - `git tag -a aoforge--v3.1.1` (manifests at 3.1.1, CHANGELOG without it) is denied, and the reason contains
      `changelog update --version v3.1.1` and not `--version aoforge--v`;
    - the plain `v3.1.1` deny reason equals the pre-change text exactly;
    - a pack-tag deny names `plugins/aoforge-stack-demo/CHANGELOG.md` and `## [1.0.0]`.
11. changelog-on-tag.test.js, end to end. Take the `--version (\S+)` argument from the deny reason, run
    `node <repo aof-tools> --cwd <fixture> changelog update --version <arg>`, and commit with the fixture's `-c` git
    flags. The hook then passes for `aoforge--v3.1.1`.
12. changelog.test.cjs. In a temp repo: commit, tag `v1.0.0`, commit, lightweight tag `aoforge-stack-demo--v1.0.0`,
    commit. `changelog update --version v1.1.0 --dry-run` reports `from: 'v1.0.0'` and `commit_count: 2`. A second
    case does the same for `--to <v-tag>` past a pack tag. RED: from is the pack tag, with 1 commit.

**Task 3** (fixtures build every token by concatenation, e.g. `'sk_' + 'live_' + …`, so push protection and CodeQL never
see a literal)
1. CLI, both JSON and `--raw`, on a fixture holding one line per leak form, each carrying a unique marker
   `LEAKMARK01`…`LEAKMARK12`. Each line's `file:line` is reported as a hit, and no marker (and no `51Hxyz`) appears
   anywhere in stdout. The lines:
   1. `.js`: `const stripe = "sk_live_51HxyzLEAKMARK01abc";`
   2. `.js`: `const slack = "xoxb-1234-LEAKMARK02";`
   3. `.js`: `const password = "it's-a-LEAKMARK03";`
   4. `.py`: `token = "ab\"cdLEAKMARK04"`
   5. `.py`: `password = f"LEAKMARK05{user}"`
   6. `.js`: `// GET /api?token=LEAKMARK06PLAIN`
   7. `.py`: `api_token = os.getenv("API_TOKEN") or "LEAKMARK07"`
   8. `.go`: `password := "LEAKMARK08"`
   9. `.js`: `const a = "sk-ant-api03-LEAKMARK09abcdefghijklmnop";`
   10. `.js`: `const g = "github_pat_11ABCDEFG0LEAKMARK10abcdefghij";`
   11. `.js`: `const token = process.env.API_TOKEN || "LEAKMARK11";`
   12. `.js`: `if (password == "LEAKMARK12") {`
2. A unit test of `redactSecrets`, with exact strings:
   - `const apiKey = "<AKIA…>";` → `const apiKey = [REDACTED]`
   - `password = 'hunter2'` → `password = [REDACTED]`
   - ``db_token: `abc` `` → `db_token: [REDACTED]`
   - `if (password == null) return;` → `if (password == [REDACTED]`. This is a deliberate fail-closed change from the
     current assertion.
   - Every detection prefix (`sk-`, `sk-ant-`, `sk_live_`, `sk_test_`, `ghp_`, `github_pat_`, `AKIA`, `xoxb-`) followed
     by a 30-char body leaves no character of the body.
3. Timing (child process): a temp root containing one `.js` file of about 200 KB on a single line, made of repeated
   `query+execute+raw+console.log logger log. role secure verify rejectUnauthorized TLS SSL DEBUG= debug NODE_ENV stack
   res.status response createHash jwt algorithms plaintext `. It must contain no `"`, `1`, `true`, `false`, `none`,
   `===`, `password`, `token`, `secret`, `trace`, `error.`, `md5`, `sha1` or `development`. Use
   `spawnSync(node, [aof-tools, 'security', 'sweep', '--root', dir, '--raw'], { timeout: 30000 })`. Assert
   `signal === null`, `status === 0` and elapsed < 5000 ms. RED: killed (SIGTERM) at 30 s.
4. A long line: `const password = "` + 'A'×5000 + `LEAKMARKEND"`. The hit has `line_truncated: true`, `text.length <=
   200`, and no marker. The result has `lines_capped >= 1`, and `--raw` prints the capped-lines footer.
5. Static guard: for every PATTERNS row, each `|`-alternative of `re.source` contains at most one `.*`. RED:
   sql-injection and debug-defaults.
6. Root: `sweep({ root: missing })` and `sweep({ root: aFile })` throw. The CLI with `--root /nonexistent-<rand>` exits 1
   and stderr names the path.

<embedded_context>
<codebase_examples>
Pack mirroring for tests already exists (`lib/__fixtures__/stack-pack-env.cjs`). The golden and e2e suites start with:
```js
require('./__fixtures__/stack-pack-env.cjs').useRepoPacks(); // pack-shipped profiles (flutter, dart): objective 77
```
useRepoPacks mirrors `plugins/aoforge-stack-*` into a temp dir, sets `process.env.AOFORGE_STACKS_DIR` (and
AOFORGE_CORE_LIB), and cleans up on exit. The fleet test spawns `stack init` with `env: process.env`, so the variable
reaches the child. Its in-process `tierCommands()` resolves through `packProfilePath`, which also reads the variable.

EXTENDS_UNRESOLVED message builder (stack-profile.cjs ~193-204). Append the hint in all four branches, only when
`packInstallHint(id)` is non-null:
```js
function unresolvedMessage(id, { userHome, bundledDir }) {
  if (!bundledDir) { return userHome ? `extends '${id}' not found at ${orgProfilePath(userHome, id)}` : `extends '${id}' cannot be resolved: no org home was provided`; }
  const bundledPath = path.join(bundledDir, `${id}.md`);
  return userHome ? `extends '${id}' not found at ${orgProfilePath(userHome, id)} or ${bundledPath}` : `extends '${id}' not found at ${bundledPath} (no org home was provided)`;
}
```
Suggested hint: `the '${id}' profile ships in the ${plugin} stack pack: install it with /plugin install
${plugin}@aocyber`. stack-packs.cjs has `const MARKETPLACE = 'aocyber'` (line 25), so reuse it if it is exported, or
export it. stack-profile.cjs lazy-requires stack-packs.cjs (line 184), so keep the new require lazy or cycle-free.

changelog-on-tag.js core deny (lines 270-279). `version` is already prefix-stripped at line 258:
```js
`  node ~/.claude/aoforge/bin/aof-tools.cjs changelog update --version ${tag}`,   // -> --version v${version}
```
The pack branch `checkPackTag` (lines 211-238) already names `${dir}/CHANGELOG.md` and `## [${version}]`. Assert it,
and change it only if an assertion fails. The test helpers are `mkRepo({ commitFiles })`, `manifests(version)`,
`runHook(payload, cwd)`, `isDeny` and `denyReason` (lines 43-130). The fixture's git flags are `-c user.email=t@t -c
user.name=T -c commit.gpgsign=false`.

changelog.cjs previous-tag lookups (lines 36 and 148). Add `'--match', 'v[0-9]*'` to both `describe` argument lists:
```js
const args = ref ? ['describe', '--tags', '--abbrev=0', `${ref}^`] : ['describe', '--tags', '--abbrev=0', 'HEAD^'];
const latest = git(['describe', '--tags', '--abbrev=0'], cwd);
```

The current release.yml body: idempotency `gh release view`, then `git fetch --tags --force --quiet`, then the title
from `git for-each-ref --format='%(contents:subject)' refs/tags/$TAG` falling back to the tag, then notes from an awk
over `## [ver]`, else `--generate-notes`. Keep every behaviour in runRelease, in this order: alias, release-exists
check, title, notes. Keep the comment explaining why the tags are re-fetched.

security-sweep.cjs today (lines 147-153), as confirmed at planning time:
```js
const TOKEN_RE = new RegExp(PATTERNS.find((r) => r.id === 'secret-tokens').re.source, 'g');
const ASSIGNED_SECRET_RE = /((?:password|passwd|api_?key|apiKey|secret|token)\w*\s*[:=]\s*)(["'`])[^"'`]*\2/gi;
// redactSecrets('const k = "sk_live_51HxyzABCDEF";') === 'const k = "[REDACTED]51HxyzABCDEF";'   <- leak
// 'password = f"SECRET{u}"', '?token=PLAIN', '… or "FALLBACK"', 'password := "X"' -> unchanged          <- leaks
// PATTERNS hardcoded-secrets misses `password :=`; secret-tokens misses sk-ant-… and github_pat_…
```
A sketch of the redaction (adjust as needed, but keep these properties: linear, whole token, rest of line):
```js
const TOKEN_REDACT_RE = /(?<![A-Za-z0-9])(?:sk-ant-|sk-|sk_live_|sk_test_|rk_live_|rk_test_|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|xox[abprs]-|AKIA|ASIA|glpat-)[A-Za-z0-9_\-]*/g;
const KEY_VALUE_RE = /((?:password|passwd|passphrase|pwd|secret|token|api[_-]?key|apikey|auth|credential|private[_-]?key|access[_-]?key|bearer)[\w-]*["'`\])?]*\s*(?::=|[=!]==?|=|:|\|\||\?\?|\bor\b|,|\())\s*[\s\S]*$/i;
function redactSecrets(text) { return text.replace(TOKEN_REDACT_RE, '[REDACTED]').replace(KEY_VALUE_RE, '$1 [REDACTED]'); }
```
Row fixes:
- hardcoded-secrets: `/password\s*:?=|api_key\s*:?=|apiKey\s*:?=|secret\s*:?=|token\s*:?=/`
- secret-tokens: add `sk-ant-[A-Za-z0-9_\-]{20,}|github_pat_[A-Za-z0-9_]{20,}`
- sql-injection: `/query[^+]*\+[^"]*"|execute[^+]*\+[^"]*"|raw[^+]*\+[^"]*"/`
- debug-defaults: `DEBUG[^=]*=[^1]*1`

The tempered forms match exactly the lines the `.*` forms matched (the first `+` or `=` after the keyword exists if
and only if any does), so the existing hit tests keep passing.

The scan loop (lines 222-235) tests `s.row.re.test(line)` on the full line, redacts, then slices to TEXT_MAX (200). Test
and redact `line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) : line`. Add `line_truncated: true` to a hit
only when the line was cut, count `lines_capped` per sweep, and add `lines_capped` to the result. formatRaw prints `N
lines longer than 4096 chars were scanned only in their first 4096 chars` when N > 0, and marks a truncated hit with
` (line truncated)`.

In cmdSecuritySweep, helpers `error(msg)` writes `Error: msg` to stderr and exits 1. sweep() currently returns empty
results for a missing root, because walk swallows the readdir error. Add a `statSync(...).isDirectory()` check in
sweep() that throws `security sweep: root <abs> is not a directory`. The CLI already turns a throw into error().
</codebase_examples>

<anti_patterns>
- Do not make the fleet test pass by editing ACCEPTED/OPEN/FLEET, adding skips, or setting AOFORGE_SKIP_FLEET_HARNESS.
- Do not name flutter or dart in stack-profile.cjs (the neutrality guard), and do not ALLOW stack-profile.cjs.
- Do not bump the `devflow` pointer, the pack versions, `SHIM_REMOVAL` or `.planning/config.json`'s stamp.
- Do not let release-tag tests call a real `git push` or `gh`. `runRelease` must take `exec`, and the CLI entry is the
  only place that wires the real one. A test never runs the CLI against this repository.
- Do not write a secret-format literal into any test file. Build tokens by concatenation (GitHub push protection,
  CodeQL `js/hardcoded-credentials`).
- Do not "fix" leaks by narrowing the hit set or dropping rows. Every listed form must stay a reported hit and be
  redacted.
- Do not run a possibly catastrophic regex in the test process. The timing test must use a killable child process.
- Do not weaken an existing assertion. The only expectations that change are the four `redactSecrets` strings (a
  deliberate fail-closed format change). List each changed line in the SUMMARY.
</anti_patterns>

<error_recovery>
- Fleet test still fails after useRepoPacks. Print the failing rows. If they show `extends` or flutter/dart
  components, check that AOFORGE_STACKS_DIR reaches the child (`env: process.env`) and that the mirror has
  `.repo-packs`. If a row is genuine drafter drift unrelated to packs, stop, record it in the SUMMARY under
  "Deferred" with the row text, and do not table it.
- `node scripts/gen-docs-data.cjs` changes more than the version fields and generatedAt (counts changed since
  2026-10-15). That is expected for a generated file. Keep it, and name the changed keys in the SUMMARY.
- The neutrality guard flags stack-pack-hints.cjs's ALLOW as stale or missing. The entry key must be
  `aoforge/bin/lib/stack-pack-hints.cjs`, relative to plugins/aoforge.
- The timing test is still over 5 s at 4096. Measure each row alone on the capped text to find the slow one. Temper
  it, or lower MAX_LINE_CHARS to 2048 and say why.
- Lookbehind `(?<!…)` needs Node ≥ 9. engines is ≥16.7, so it is fine.
- An existing test elsewhere breaks on the version bump (for example a fixture comparing to 3.0.0). Read it. If it
  pins the live core version, make it read package.json. If it pins 3.0.0 as history (the rename, the pointer), leave
  it and do not bump that site.
</error_recovery>
</embedded_context>

<gotchas>
- `git tag` inside node tests runs in temp repos and is not a Bash tool call, so the changelog gate does not see it.
  Never type `git tag -a …` into Bash in this repository.
- `actions/checkout` persists GITHUB_TOKEN credentials, so `git push origin refs/tags/<alias>` works with
  `contents: write`. A tag ruleset (if the org adds one) could reject it, and only the first real release shows that.
  Note it in the SUMMARY.
- The output helper may print `@file:<path>` for large JSON. The CLI leak test must read through that pointer, as
  `parseInitOutput` in stack-drafter-fleet.test.cjs does.
- The fleet harness reads `~/dev` repos read-only and asserts their HEAD and status are unchanged. It takes about
  10 s on this machine.
</gotchas>

<validation_gates>
- task: `npm test` (from `aof-tools stack command test`; `gates.task: [test]`). Scoped form: `node --test {files}`.
- Per-file baselines at ee93e66f:
  - security-sweep: 10/10
  - stack-packs: 22/22
  - stack-profile: 52/52
  - changelog: 5/5
  - stack-neutrality.repo: 3/3
  - changelog-on-tag: 26/26
  - workflow-permissions: 4/4
  - stack-drafter-fleet: 50 tests, 31 pass, 18 fail, 1 skipped
- Before Task 1, run `npm test` once at ee93e66f and record tests/pass/fail/skipped as the baseline.
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: core 3.1.0 matches the packs; fleet harness drafts with the checkout's packs; pack install hint</name>
  <files>plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs, plugins/aoforge/aoforge/bin/lib/stack-profile.test.cjs, package.json, package-lock.json, plugins/aoforge/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CHANGELOG.md, site/data/aoforge.json, plugins/aoforge/aoforge/bin/lib/stack-pack-hints.cjs, plugins/aoforge/aoforge/bin/lib/stack-profile.cjs, plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs, plugins/aoforge/aoforge/bin/lib/stack-drafter-fleet.test.cjs</files>
  <action>
RED: add Task 1 Test list items 1-3. Item 1 lives in the repo-level part of stack-packs.test.cjs and finds the repo
root the way its marketplace test does (`path.join(__dirname, '..','..','..','..','..')`). Run the two files: items 1-3
fail for the stated reasons and every existing test passes. Commit:
`test(release): core version must satisfy the packs' aoforge range; pack install hint (RED)`.

GREEN:
- Bump the version sites listed under Locked decisions to 3.1.0.
- Insert `## [3.1.0] - Unreleased` under an empty `## [Unreleased]`. If the moved content has no lead stating the
  break, add a 2-sentence lead: Flutter, Dart and web procedure moved to `aoforge-stack-flutter` / `aoforge-stack-web`
  with no forwarding shim, so such projects install their pack.
- Add a `### Release tooling and security sweep (quick 34)` subsection. Its first bullet is the version alignment;
  Tasks 2 and 3 append theirs.
- Run `node scripts/gen-docs-data.cjs`.
- Create stack-pack-hints.cjs: a header comment explaining it is data only, `PACK_PROFILES` (frozen), and
  `packInstallHint(id)`. Wire it into unresolvedMessage and add the ALLOW entry.
- Run the touched files: all green, B3 and B4 unchanged.
Commit: `chore(release): align core to 3.1.0 for the stack packs; name the pack in EXTENDS_UNRESOLVED`.

FLEET: first run the fleet test at this point to confirm it is still RED (18 fail). Then add
`require('./__fixtures__/stack-pack-env.cjs').useRepoPacks();` near the top. Add a header line under "Real environment
on purpose": the drafter and the stack packs are both this checkout's (a dev checkout); HOME and PATH stay real. Re-run:
49 pass, 0 fail, 1 skipped. Commit: `test(stack): fleet harness drafts with the checkout's stack packs`.
  </action>
  <verify>
- `node --test plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs plugins/aoforge/aoforge/bin/lib/stack-profile.test.cjs plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs`: 0 fail. Counts are 22+2, 52+N3 and 3.
- `node --test plugins/aoforge/aoforge/bin/lib/stack-drafter-fleet.test.cjs`: 49 pass, 0 fail, 1 skipped.
- `git grep -n '"version": "3.0.0"' -- package.json package-lock.json plugins/aoforge/.claude-plugin/plugin.json` prints nothing, and in marketplace.json only the `devflow` entry is still 3.0.0.
- `rg -n '^## \[3\.1\.0\]' CHANGELOG.md` prints one line.
  </verify>
  <done>The packs' `>=3.1.0` is satisfied by a consistent 3.1.0 core, enforced by a test. The fleet harness is green
  for the right reason. A flutter or dart EXTENDS_UNRESOLVED tells the user which pack to install. Three commits.</done>
  <recovery>If the bump breaks an unrelated test, see error_recovery. To roll back, `git revert` the GREEN commit; the RED
  commit stays as the specification.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: release step creates prefixed tags and pack releases; changelog hint and previous-tag lookup handle prefixes</name>
  <files>scripts/release-tag.test.cjs, scripts/release-tag.cjs, .github/workflows/release.yml, plugins/aoforge/hooks/changelog-on-tag.test.js, plugins/aoforge/hooks/changelog-on-tag.js, plugins/aoforge/aoforge/bin/lib/changelog.test.cjs, plugins/aoforge/aoforge/bin/lib/changelog.cjs, CLAUDE.md, CHANGELOG.md</files>
  <action>
RED: write Task 2 Test list items 1-12. release-tag.test.cjs builds fixture roots in os.tmpdir() containing:
- `plugins/aoforge/.claude-plugin/plugin.json` `{name:'aoforge', version:'3.1.0'}`;
- a `plugins/aoforge-stack-demo` plugin.json and CHANGELOG;
- a root CHANGELOG.md.
The fake exec returns scripted `{status, stdout, stderr}` per command prefix. Items 1-9 fail because the module is
missing and release.yml has the old trigger. Item 10's prefixed-tag case and item 11 fail on the hint, and item 12 fails
on `from`. Commit: `test(release): prefixed release tags, pack releases, prefixed-tag changelog hint (RED)`.

GREEN, scripts/release-tag.cjs (CommonJS, Node ≥16, sync fs, no dependencies):
- `parseTag(tag)` → `{plugin|null, version}` | null, for `^v(\d+\.\d+\.\d+)$` and
  `^([a-z][a-z0-9-]*)--v(\d+\.\d+\.\d+)$`.
- `planTag(tag, {root})`. The core name comes from `plugins/aoforge/.claude-plugin/plugin.json` `name`.
  - `v` tag → `{kind:'core', version, changelog:'CHANGELOG.md', alias:'<core>--v<ver>', latest:true}`, and the core
    plugin.json version must equal it.
  - `<core>--v` → `{kind:'core-alias'}`.
  - `<pack>--v` → `plugins/<pack>/.claude-plugin/plugin.json` must exist with that name and version, giving
    `{kind:'pack', plugin, version, changelog:'plugins/<pack>/CHANGELOG.md', alias:null, latest:false}`.
  - Anything else throws a message naming the tag.
- `releaseNotes(text, version)` uses the escaped version.
- `runRelease(tag, {root, exec, log})` follows the order in codebase_examples. Write the notes to an mkdtemp file and
  remove it in `finally`. If the notes are empty, pass `--generate-notes`.
- CLI: `if (require.main === module)` runs with root = cwd and an `exec` built on `spawnSync`, printing errors and
  exiting 1.

GREEN, release.yml:
- `tags: ['v*', '*--v*']`;
- one step with `GH_TOKEN` env and `set -euo pipefail; git fetch --tags --force --quiet; node scripts/release-tag.cjs
  "$GITHUB_REF_NAME"`;
- keep `permissions: contents: write`, checkout `fetch-depth: 0`, and a header comment describing the three tag kinds.

GREEN, other files:
- changelog-on-tag.js line 276: `--version v${version}`.
- changelog.cjs: `--match v[0-9]*` on both describes.
- CLAUDE.md "Publishing": one sentence. A `v*` release also pushes `aoforge--vX.Y.Z` (what the packs resolve core
  from); a pack releases from `<pack>--vX.Y.Z` with its own CHANGELOG, never marked Latest.
- CHANGELOG 3.1.0 subsection: one bullet.

Run the touched test files and `scripts/workflow-permissions.test.cjs`. Commit:
`feat(release): push aoforge--vX.Y.Z with each core release and release packs from their prefixed tags`.
  </action>
  <verify>
- `node --test scripts/release-tag.test.cjs scripts/workflow-permissions.test.cjs plugins/aoforge/hooks/changelog-on-tag.test.js plugins/aoforge/aoforge/bin/lib/changelog.test.cjs`: 0 fail. changelog-on-tag 26+N and changelog 5+N.
- `rg -n "tags:" .github/workflows/release.yml` shows both patterns.
- `rg -n -F 'version ${tag}' plugins/aoforge/hooks/changelog-on-tag.js` prints nothing.
- `git tag --list | wc -l` is unchanged from before the task, so no tag was created in this repository.
  </verify>
  <done>A core release ensures `aoforge--vX.Y.Z` and a pack tag yields a non-Latest pack release, all proven with a
  fake exec. The gate's hint, run as printed, satisfies the gate. Two commits.</done>
  <recovery>If the workflow text test and workflow-permissions disagree on structure, keep a top-level or job-level
  `permissions:` exactly as workflow-permissions expects. Nothing here reaches GitHub, so a mistake is reverted with one
  `git revert`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: security sweep redacts fail-closed, bounds regex cost, and rejects a missing root</name>
  <files>plugins/aoforge/aoforge/bin/lib/security-sweep.test.cjs, plugins/aoforge/aoforge/bin/lib/security-sweep.cjs, CHANGELOG.md</files>
  <action>
RED: write Task 3 Test list items 1-6, and change the four existing `redactSecrets` expectations to the fail-closed
strings. Run the file. Expect these failures:
- item 1, markers leak and lines 8-10 are not hits;
- item 2;
- item 3, killed at 30 s;
- item 4, no `line_truncated`;
- item 5, sql-injection and debug-defaults;
- item 6, exit 0.
Commit: `test(security): secret leaks in sweep hits, catastrophic patterns, missing root (RED)`.

GREEN in security-sweep.cjs:
- replace TOKEN_RE/ASSIGNED_SECRET_RE with whole-token plus fail-closed key/value redaction (sketch in
  codebase_examples);
- extend hardcoded-secrets (`:?=`) and secret-tokens (`sk-ant-`, `github_pat_`);
- temper sql-injection and debug-defaults;
- add `MAX_LINE_CHARS = 4096` (exported) and the per-line cap with `line_truncated` and `lines_capped`, plus the raw
  footer;
- add the root check in sweep().
Keep PATTERNS order, the limits, the existence rows and the SECRET_FILES behaviour unchanged. Update the header
comment: redaction is fail-closed (whole token; rest of line after a secret-looking key and operator) and lines are
capped. Add a CHANGELOG bullet to the quick-34 subsection. Run the file and record the timing test's measured time.
Commit: `fix(security): redact whole tokens and secret values fail-closed; cap scanned line length`.
  </action>
  <verify>
- `node --test plugins/aoforge/aoforge/bin/lib/security-sweep.test.cjs`: 10+N tests, 0 fail. The timing test's
  measured elapsed time is printed with `t.diagnostic` and is under 5000 ms.
- `node <repo>/plugins/aoforge/aoforge/bin/aof-tools.cjs security sweep --root /nonexistent-quick34; echo $?` prints `1`.
  </verify>
  <done>No listed leak form survives in JSON or --raw. The three missed leads are found. A 200 KB line is fast. A
  missing root is an error, not a clean result. Two commits.</done>
  <recovery>If the new redaction changes an existing planted-hit assertion beyond the four listed strings, check that
  the change is fail-closed (more redacted, never less) and record it. Otherwise fix the regex, not the test.</recovery>
</task>

</tasks>

<verification>
- `npm test`: fail 0, compared with the ee93e66f baseline. tests and pass grow only by the tests added here, and skipped
  is unchanged.
- The fleet harness passes 49, fails 0 and skips 1 on this machine (it is local-only; CI skips it without `~/dev`).
- `git log --oneline ee93e66f..HEAD` shows 7 commits (Task 1: 3, Task 2: 2, Task 3: 2), all made through
  `aof-tools commit`.
- `git diff ee93e66f --stat` lists only files in `files_modified`.
- No push, no tag (the `git tag --list` count is unchanged), no release, and nothing written under `~/.claude`.
</verification>

<success_criteria>
- Installing the packs from `main` no longer fails on the core version, and the release tooling will produce the
  `aoforge--vX.Y.Z` and `<pack>--vX.Y.Z` tags and releases that Claude Code resolves.
- The tag gate's printed fix works as printed for every tag form.
- The security-auditor's sweep can no longer copy a secret into a transcript through any listed form, and no input
  line can stall it.
</success_criteria>

<output>
Write `.planning/quick/34-release-blockers-for-3-1-0-and-security-/34-SUMMARY.md` through the quick summary verb.
Include:
- the npm test baseline and final totals, and the per-file counts before and after;
- the fleet harness before and after (31/18/1 → 49/0/1);
- each RED failure message;
- the seven commit hashes;
- the four changed `redactSecrets` expectations;
- the timing test's measured time and MAX_LINE_CHARS;
- the site/data keys that changed.

Carry these user decisions forward:
1. `SHIM_REMOVAL` and the docs say the rename shims and the `devflow` pointer go in "the release after 3.0.0", which is
   now 3.1.0, but they are still present. Either remove them before tagging or reword the promise.
2. Replace `Unreleased` with the date in `## [3.1.0]` and in each pack's `## [1.0.0]` before tagging.
3. The first real release confirms that GITHUB_TOKEN may push `aoforge--vX.Y.Z` (no tag ruleset blocks it).
</output>
