# Objective 39: Wire the telemetry & audit CLI - Research

**Researched:** 2026-09-28
**Domain:** Internal CLI dispatch wiring (df-tools.cjs), CLI-level test infrastructure, docs-accuracy audit
**Confidence:** HIGH — every claim below was verified against this repo's checked-out source (not training data). Codebase-only research per instructions; no web research performed.

## Summary

Four modules — `lib/context-audit.cjs` (TRD 29-04), `lib/session-audit.cjs` (TRD 31-03),
`lib/transcript-export.cjs` (TRD 31-02), `lib/override.cjs` (TRD 30-04) — are fully implemented,
unit-tested, pure/testable, and **not reachable from `df-tools.cjs`**. Verified live:
`node df-tools.cjs context|session-audit|transcript-export|override` all print `Error: Unknown
command: X` and exit 1. The exact same shape of gap was closed for a fifth module, `telemetry`, in
TRD 38-11 (`df-tools.cjs:803-814`, `lib/help.cjs:177-180`) — that TRD is the template to mirror
almost mechanically: one `case` block per command, one `help.cjs` entry, CLI-level tests that
`spawnSync` the real binary with `--cwd <mkdtemp>` and `HOME=<mkdtemp>` env override, plus a
source-scanning "wiring pin" test file (`lib/doc-surfaces.test.cjs`).

`df-tools.cjs`'s dispatcher is a plain `switch(command)` (`df-tools.cjs:313`) with 67 top-level
`case` arms today; `help.cjs`'s `COMMANDS` table is bidirectionally pinned to it by
`help.test.cjs` (every case has a help entry AND every help entry has a case — verified: 67/67
match, zero orphans either direction). CLAUDE.md's own Core Tool section (`CLAUDE.md:57`) already
states accurately that these four are "libraries not yet wired" — the milestone audit's claim
that CLAUDE.md documents them as live turned out to be about `context-discipline.md:99`, not
CLAUDE.md (see Open Questions). All named `df-tools` commands elsewhere in CLAUDE.md dispatch
cleanly (verified by running each with `--help`); the four targets are the only gap.

**Primary recommendation:** Add four `case` blocks (`context`, `session-audit`,
`transcript-export`, `override`) to `df-tools.cjs` next to `telemetry` (~line 814), matching help
entries in `lib/help.cjs`, using `path.join(os.homedir(), '.claude', 'projects')` as the default
transcript root (the same convention `lib/benchmark.cjs:545` already uses). Write CLI-level tests
by copying `telemetry.test.cjs`'s `runTelemetry`-style local helper (lines 145-233) with `--cwd
<fixture>` + `HOME=<fixtureHome>` so fixture transcripts live under
`<fixtureHome>/.claude/projects/...` and never touch the real `~/.claude/projects`. Add a new
dispatch-completeness test (no existing one enumerates CLAUDE.md's named commands against the
dispatcher — `help.test.cjs` only guards the COMMANDS table against itself, not against prose).

## Architecture: df-tools.cjs Dispatch (Q1)

- **Entry point:** `main()` at `df-tools.cjs:264`. `args = process.argv.slice(2)` (line 265).
- **`--raw` extraction is global**, before the switch: `const rawIndex = args.indexOf('--raw')`
  (line 266), spliced out immediately (line 268). Every command receives a plain `raw` boolean;
  no per-command `--raw` parsing is needed (`telemetry`'s case just reads the outer `raw`, line 812).
- **Global `--cwd <dir>` flag** (`df-tools.cjs:270-277`, via `lib/cwd-flag.cjs`'s `extractCwdFlag`):
  parsed and `process.chdir()`'d **before** `const command = args[0]` (line 279) and before the
  `--help` pre-switch (line 297). Every new command automatically gets `--cwd` support for free —
  nothing to add. This is also what `telemetry.test.cjs`'s CLI tests use to point at a fixture
  `.planning/` (`spawnSync(..., ['--cwd', cwd, 'telemetry', ...args], ...)`, line 154-159).
- **`--help`/`-h` is answered before the switch** (`df-tools.cjs:282-303`) via `hasTopLevelHelpFlag`
  + `HELP_TABLE[name]` (imported as `COMMANDS` from `lib/help.cjs:256-258`). A command with no
  `COMMANDS` entry silently gets the top-level listing instead of its own usage — this is exactly
  what `help.test.cjs:44-47` (`dispatcherCommands()` regex-scans `^ {4}case '([^']+)':` from the
  source) fails on. **Every new case needs a matching `help.cjs` entry in the same commit** or
  `help.test.cjs` fails both ways (missing entry AND orphan entry are separately asserted, lines
  44-53).
- **No command at all** → usage + exit 1 (`df-tools.cjs:308-311`). **Unknown command** → `error(...)`
  which is `process.stderr.write('Error: ' + msg); process.exit(1)` (`lib/helpers.cjs:43-46`),
  hit at the `default:` arm, `df-tools.cjs:1272-1273`.
- **`telemetry`'s case is the exact pattern to mirror** (`df-tools.cjs:803-814`):
  ```js
  case 'telemetry': {
    const fs = require('fs'); const path = require('path'); const os = require('os');
    const { output: outputTelemetry } = require('./lib/helpers.cjs');
    const { collect } = require('./lib/telemetry.cjs');
    const planningDir = fs.existsSync(path.join(cwd, '.planning')) ? path.join(cwd, '.planning') : null;
    const r = collect({ planningDir, userHome: os.homedir() });
    outputTelemetry(r, raw, r.advisories.join('\n'));
    break;
  }
  ```
  **Key gotcha already discovered by 38-11** (its own TDD-evidence log, `38-11-SUMMARY.md:114`):
  `df-tools.cjs` has **no top-level `fs`/`path`/`os`/`output` import** — most cases `require` their
  own inline, matching the file's existing style (e.g. the `planning sibling-trd-scan` case a few
  hundred lines up, per `38-11-TRD.md:34`). Check what's already imported at file top before adding
  duplicate requires; `output` specifically is NOT in top-level scope and must be required from
  `lib/helpers.cjs` inside the case (alias it, e.g. `outputTelemetry`, to avoid shadowing other
  cases' local `output` uses if any exist in the same file scope — case blocks are their own `{ }`
  block scope so this is defense-in-depth, not strictly required).
- **`benchmark`'s case is the pattern for a command with subcommands routed through the lib**
  (`df-tools.cjs:1132-1136`): `case 'benchmark': { const { cmdBenchmarkRoute } = require('./lib/benchmark.cjs'); cmdBenchmarkRoute(cwd, args.slice(1), raw); break; }`.
  `session-audit` (if it grows a `--since`/`--limit`-only flag surface, no subcommands) can stay
  telemetry-shaped; `override` (record vs. list, see Q3) is closer to benchmark-shaped if it needs
  a subcommand.

## Per-module CLI Contract (Q2)

None of the four libs has a `cmd*`/CLI entry point today — 100% of their `module.exports` are pure
functions (`analyze`, `accumulate`, `summarize`, `recordOverride`, `readOverrides`,
`exportTranscripts`, ...). Confirmed by grep: zero `cmd`-prefixed exports in any of the four files.
All I/O side effects are exactly what's below; nothing else.

### `lib/context-audit.cjs` (232 lines, TRD 29-04)
- **API:** `analyze(roots: string[], opts?: {limit?: number}) → summary object` (`:201-221`).
  Pure aggregation helpers also exported: `accumulate`, `summarize`, `newAccumulator`,
  `tokensOfResult`, `collectTranscripts`, `CHARS_PER_TOKEN`, `TOKENS_PER_IMAGE` (`:223-232`).
- **Side effects:** read-only (`fs.readdirSync`/`fs.readFileSync` only, `:182-190`, `:208-219`).
  Never writes.
- **Expected CLI flags** (from docs, not code — the CLI doesn't exist yet):
  `references/context-discipline.md:99` documents `node ~/.claude/devflow/bin/df-tools.cjs context
  --raw`. `29-04`'s own evidence in `objectives/29-context-discipline/SUMMARY.md:25` used
  `df-tools context --limit 150` (this is the exact invocation this research re-ran, see Q6). So
  the CLI needs at minimum `[--limit N]` and the already-global `[--raw]`.
- **Default root:** not specified anywhere in code or docs. Recommend
  `path.join(os.homedir(), '.claude', 'projects')`, matching `lib/benchmark.cjs:545`
  (`const root = projectsRoot || path.join(os.homedir(), '.claude', 'projects');`) — the one
  existing precedent for a df-tools command that reads Claude Code's own transcript corpus.
- **Output:** `summarize()`'s shape includes `targets.read_share_pct`, `targets.read_share_ok`
  (boolean, `< 40` target) — this IS objective 29's acceptance metric (Q6).

### `lib/session-audit.cjs` (188 lines, TRD 31-03)
- **API:** `analyze(roots: string[], opts?: {limit?: number, since?: string}) → report object`
  (`:163-183`). `opts.since` is an ISO date string, string-compared against `row.timestamp`
  (`:178`). Also exports `accumulate`, `summarize`, `newAccumulator`, `classify`,
  `collectTranscripts`, `RULES`, `DEVFLOW_OWNED` (`:185-188`).
- **Side effects:** read-only, same pattern as context-audit.
- **Expected CLI flags:** `objectives/31-telemetry-and-retention/SUMMARY.md:88` documents the
  intended re-run: `df-tools session-audit --since <release-date>`. Needs `[--since <date>]
  [--limit N] [--raw]`.
- **Consumed by:** `lib/transcript-export.cjs:25` (`const { classify } = require('./session-audit.cjs');`)
  — already wired lib-to-lib. **Not** consumed by `telemetry.cjs` today (see Q3).
- **Output `verdict` field** (`:137-139`) is a human sentence: `"N DevFlow-owned blocks remain —
  objectives 27/30 target these"` or `"no DevFlow-owned blocks in this window"`.

### `lib/transcript-export.cjs` (151 lines, TRD 31-02)
- **API:** `exportTranscripts({roots, out, fullDir?, limit?}) → {indexed, skipped, copied, out,
  sessions}` (`:105-149`). Also `indexTranscript(file)`, `collect(dir, out)` (directory walker,
  name collides with `telemetry.cjs`'s unrelated `collect` — only a problem if both are
  destructured into the same lexical scope without aliasing; each `case` block is its own scope so
  this is a non-issue in the dispatcher, but flag it in the TRD as a naming gotcha for whoever
  reads the diff).
- **Side effects — the one lib here that WRITES:** `fs.mkdirSync(path.dirname(out), {recursive:
  true})` (`:119`), `fs.appendFileSync(out, ...)` (`:145`) for the index; with `fullDir` set, also
  `fs.mkdirSync(fullDir, ...)` (`:120`) and `fs.copyFileSync(...)` per session (`:138`).
  **Idempotent/incremental by design**: re-runs skip sessions whose `stat().size` hasn't grown
  (`:111-117`, `:129`) — this is exactly the TDD-caught bug in 31-02's SUMMARY (`bytes` must be
  `fs.statSync().size`, never `raw.length`, because those differ for multi-byte UTF-8).
- **No documented CLI invocation anywhere** (unlike the other three, no SUMMARY/reference names an
  exact command line) — only the two modes from the file's own header comment (`:14-21`): `index`
  (default) and `--full <dir>` (raw copy). CLI needs `[--out <path>] [--full <dir>] [--limit N]
  [--raw]`; `--out` is effectively required by the lib (`exportTranscripts` throws nothing but
  produces nothing useful without it) — give it a sane default rather than making it mandatory.
- **No existing convention for a default `--out` path.** Recommend NOT `.planning/` — this index
  spans ALL projects' transcripts (roots default to the whole `~/.claude/projects`), not just the
  current repo, so a per-project `.planning/` file would be misleading and would need a new
  `.gitignore` entry. Two existing libs already define a home-scoped constant for exactly this
  kind of cross-project state: `lib/global-config.cjs:32` and `lib/decline-tracker.cjs:38`, both
  `const DEVFLOW_HOME = path.join(os.homedir(), '.claude', 'devflow');`. Recommend the same family,
  e.g. `path.join(DEVFLOW_HOME, 'transcript-index.jsonl')`.

### `lib/override.cjs` (144 lines, TRD 30-04)
- **API:** `recordOverride({planningDir, gate, reason, now?}) → {ok, gate?, marker?, reason?,
  message?}` (`:50-93`); `readOverrides({planningDir, limit=20}) → {entries, by_gate, total,
  needs_rescoping}` (`:103-126`); `pruneLog(planningDir, max=500)` (`:131-142`).
  `GATES = {edits: '.edit-override', commits: null, changelog: null}` (`:27-31`) — `commits` and
  `changelog` are env-var-driven gates (logged only, no marker file); `edits` also arms
  `.planning/.edit-override`.
- **Side effects — writes:** `fs.appendFileSync(logPath(planningDir), ...)` to
  `.planning/.override-log.jsonl` (`:76`, constant at `:25`) on every `recordOverride` call, plus
  the marker file for `edits`. **Already gitignored**: `.gitignore:48-49` lists both
  `.planning/.progress-guard.json` and `.planning/.override-log.jsonl`.
- **Expected CLI flags:** `objectives/30-agent-environment-hygiene/SUMMARY.md:55` documents the
  exact intended invocation: `df-tools override --gate <edits|commits|changelog> --reason "<why>"`
  — matches the objective prompt's own citation verbatim. A **`reason` is mandatory**; the lib
  itself refuses with `reason_code: 'missing-reason'` if empty (`:61-67`) — the CLI wrapper must
  surface `result.message` on stderr and exit 1 on `ok: false` (mirroring how `error()` /
  `lib/helpers.cjs:43-46` is used everywhere else).
- **Also needed — a read/list mode.** `30`'s own follow-up (`SUMMARY.md:73`): *"`df-tools override
  --list` output should surface in `/devflow:status` — folded into objective 31's telemetry view
  rather than duplicated here."* That folding already happened (`telemetry.cjs:22,37-43` calls
  `readOverrides`), so `--list`/`list` on the `override` command itself is for **direct** inspection
  (e.g. checking `needs_rescoping` without a whole telemetry dump), not a duplicate of telemetry.
  Recommend a `benchmark`-shaped subcommand split: `override --gate <g> --reason <r>` (or
  `override record --gate...`) for writing, `override list [--limit N]` for reading —
  the planner should pick based on which reads cleaner against `help.cjs`'s usage-string
  conventions (single-line, e.g. `telemetry`'s `df-tools telemetry [--raw]` vs. `handoff`'s
  multi-branch `df-tools handoff <create|complete|list|get>`, `help.cjs:190-193`).

## Who Should Call These (Q3)

**`override.recordOverride`:** zero callers outside `override.test.cjs` anywhere in
`plugins/devflow` (verified: `rg -n "recordOverride" plugins/devflow --glob '!*.test.cjs'` matches
only the definition/export line in `override.cjs` itself). Checked all three gate hooks for a call
site: `gate-edits.js` (phrases `"skip devflow"`, `"just edit"`, `"bypass devflow"`, `"force edit"`,
header comment `:13-14`; `DEVFLOW_SKIP_EDIT_GATE=1` at `:292`), `gate-commits.js`
(`DEVFLOW_ALLOW_RAW_COMMIT=1` at `:98`), `changelog-on-tag.js` (`DEVFLOW_SKIP_CHANGELOG_GATE=1` at
`:196`) — **none of them import or call `override.cjs`**. This is by design, not an oversight: the
module's own header (`override.cjs:14-19`) and `30`'s SUMMARY (`:61-62`, *"The prose path (`skip
devflow`) still works. This is an additional auditable entry point, not a replacement that breaks
muscle memory."*) frame it as a **manual, parallel** entry point — a user or agent who wants an
audit trail runs `df-tools override --gate ... --reason ...` themselves, in addition to (or
instead of) the phrase/env-var bypass. Wiring the CLI IS satisfying TRD 30-04's original intent;
no hook needs to change. (Nothing in `agents/*.md` or `workflows/*.md` currently tells an agent to
do this either — worth an Open Question below, but out of this objective's stated scope sketch.)

**`context-audit.analyze`:** zero callers anywhere, including `telemetry.cjs` — confirmed by `rg -n
"context-audit" plugins/devflow --glob '!*.test.cjs'`, only the file itself and its own
`require`-free position (it requires nothing from the other three; `telemetry.cjs`'s only requires
are `override.cjs:22` and an inline `doc-staleness.cjs` at `:80`). The milestone audit's phrase
"fully orphaned" is accurate. The correct caller, per its own purpose, is simply **the CLI itself**
— its `read_share_ok` output IS objective 29's acceptance signal (Q6); no other module needs to
read it programmatically. `context-discipline.md:99`'s "Checking" section already documents this
as the intended usage (a human/agent runs `df-tools context --raw` periodically), not a
library-to-library integration.

**`session-audit.analyze` → `telemetry.cjs`'s `sessionReport` param:** `telemetry.cjs:27`'s own
JSDoc says `sessionReport` is *"optional output of session-audit analyze()"*, and `collect()`
(`:31`) accepts it — the wiring surface already exists on the telemetry side. But 38-11's own
SUMMARY explicitly declined to connect them: `38-11-SUMMARY.md:191`, *"Did not add a `--sessions`
flag to `df-tools telemetry` (per gotcha: `sessionReport` stays opt-in/caller-supplied, and
session-audit is unwired)."* and `38-11-TRD.md`'s gotcha (`:122`) repeats it verbatim. **This was a
deliberate, scoped-down decision by the prior TRD, not an accident** — wiring `session-audit` as
its own standalone command (per this objective's scope sketch) satisfies it without needing to
also add a `--sessions`/`--scan` flag to `telemetry`. Whether to additionally wire
`telemetry --scan` (mentioned prospectively in `31-01-SUMMARY.md:66`, *"Transcript scanning is
opt-in (`--scan`)..."* — that flag was never implemented; `rg -n -- "--scan"` finds zero matches in
non-test source) is optional scope-creep the planner should explicitly accept or defer (see Open
Questions) rather than assume.

## Test Infrastructure (Q4)

**No shared CLI-test helper file exists.** Every `*.test.cjs` that spawns the real binary defines
its own small local closure (confirmed: 19 files use `spawnSync(process.execPath` directly, no
`test-helpers.cjs`/`cli-helpers.cjs` anywhere under `bin/`). The convention to copy is
`telemetry.test.cjs:145-233`'s `describe('df-tools telemetry (CLI) — objective 38', ...)` block:

```js
const { spawnSync } = require('child_process');
const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');
function makeHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'df-telem-home-')); }
function runTelemetry(args, cwd, home) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', cwd, 'telemetry', ...args], {
    encoding: 'utf-8', timeout: 30000, env: { ...process.env, HOME: home },
  });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}
```

**This directly answers "how to point at fixture transcripts without touching `~/.claude/projects`":**
since the recommended default root for the three transcript-reading commands is
`path.join(os.homedir(), '.claude', 'projects')` (Q2), and Node's `os.homedir()` reads
`process.env.HOME` on POSIX at call time (no caching), spawning with a fixture `HOME` and writing
`.jsonl` fixtures under `<fixtureHome>/.claude/projects/<project>/<session>.jsonl` is sufficient —
**no new `--root`/`--projects-root` CLI flag is required** for test isolation, though one MAY still
be worth adding for interactive/ad-hoc use (planner's call; note `lib/benchmark.cjs`'s
`runBenchmarkSession` accepts `projectsRoot` as a lib-level param but its CLI wrapper
`cmdBenchmarkSession` (`:591-635`) never exposes a flag for it — same precedent either way).
Verified this pattern works today: `help.test.cjs:24-28`'s own `run(argv, cwd)` helper and every
`telemetry.test.cjs` CLI test pass with this exact shape.

For `lib/context-audit.cjs`/`session-audit.cjs`, existing **unit** test fixtures build transcript
rows as plain JS objects fed to `accumulate()`/`summarize()` directly (no disk I/O) — see
`context-audit.test.cjs:66-117`, `session-audit.test.cjs:61-103`. Keep those as-is; only the new
CLI-level describe blocks need real `.jsonl` files on disk (mirror
`transcript-export.test.cjs:28-32`'s `writeTranscript(name, rows)` helper, which already writes
real `.jsonl` fixture files under a `mkdtemp`'d `src` dir — reuse that shape for the new CLI
fixtures' `.claude/projects/<proj>/` directories).

**Wiring-pin test file precedent:** `lib/doc-surfaces.test.cjs` (42 lines) is a small,
source-scanning test that pins the dispatcher `case` and `help.cjs` entry exist by reading the raw
source text (`assert.match(dfToolsSrc, /case 'telemetry':/)`, `:36`), guarded by
`IS_DEVFLOW_CHECKOUT` (`:19`, skips cleanly in a mirror install with no `README.md`). A new file in
this shape (e.g. `lib/audit-cli-surfaces.test.cjs`) covering all four new cases + help entries in
one place is a reasonable single artifact for the dispatch-completeness assertion (Q5), separate
from the four modules' own CLI-behavior tests.

## Dispatch-Completeness Test Design (Q5)

**Existing machinery to reuse, not reinvent:**
- `help.test.cjs:31-39`'s `dispatcherCommands()` — regex-scans `df-tools.cjs` for
  `^ {4}case '([^']+)':` lines (4-space indent excludes nested switches like `init`'s workflow
  switch at `:886`). This is the authoritative "what actually dispatches" list.
- `scripts/gen-docs-data.cjs:172-191` — the site-docs generator independently derives the same
  list with a near-identical regex (`/^\s{4}case '([a-z0-9-]+)': \{$/gm`, requiring the opening
  brace on the same line — true for every existing case, including `telemetry`'s). Confirms the
  convention is stable/relied-upon elsewhere; **once the four new cases are added in the same
  `case 'name': {` style, both `help.test.cjs` and the site generator pick them up for free with no
  code changes to either.**
- `Object.keys(COMMANDS)` from `lib/help.cjs:23` for the reverse direction (already
  bidirectionally checked by `help.test.cjs`, but only COMMANDS-vs-dispatcher, never vs. prose).

**What's missing and needs a new test:** nothing today checks CLAUDE.md's own prose against the
dispatcher. `doc-refs.cjs`'s CI gate (Q8) only resolves `/devflow:`/`/df:` **skill** tokens
(`TOKEN_RE` at `doc-refs.cjs:28` is anchored to `\/(devflow|df):`), never bare `df-tools <command>`
text — confirmed by reading `doc-refs.repo.test.cjs`'s scan set and `resolveToken` (`:40-54`),
which has no concept of df-tools subcommands at all. **A CLAUDE.md-vs-dispatcher check is a real
gap this objective should close**, not a redundant one.

Design: extract command names from CLAUDE.md's `### Core Tool` section (`CLAUDE.md:46-63`) — the
backtick-quoted `` `word` `` or `` `word ...` `` tokens immediately after a leading verb like
"— `state load`", "`validate consistency`" etc. A robust extractor: regex over backtick spans
`` /`([a-z][a-z0-9-]*)(?:\s|`)/g `` restricted to the Core Tool section's text block, filtered to
names present in `HELP_TABLE`/dispatcher-shaped tokens (first word of each backtick span), then
assert each resolves via `dispatcherCommands()`. Given the section is prose (not a machine table),
prefer a **narrower, explicit fixture list** over a fully generic parser — mirror
`doc-refs.repo.test.cjs`'s own approach of hand-listing an EXEMPT/SCAN set rather than parsing
free text perfectly. Detect "does it dispatch" via `spawnSync` + exit code: `1` and stderr matching
`/^Error: Unknown command:/` = not wired; anything else = wired (don't assert `0`, since some
commands legitimately exit non-zero on missing required args — the signal is specifically the
"Unknown command" string, already stable at `df-tools.cjs:1273`).

**Verified today (2026-09-28, this repo, this branch) by actually running every command CLAUDE.md
names:** `state`, `objective`, `roadmap`, `init`, `resolve-model`, `validate`, `gh`, `telemetry`,
`changelog`, `upgrade`, `adopt`, `intent` — all exit 0 on `--help` (i.e. all wired). The **only**
CLAUDE.md-named commands that produce `Error: Unknown command:` are the four target ones (`context`,
`session-audit`, `transcript-export`, `override`), confirming the objective's scope is complete —
no fifth gap exists.

**Subcommand forms** already in the dispatcher that a naive "list every case" scan would miss:
several top-level commands (`state`, `objective`, `handoff`, `validate`, `init`, `benchmark`,
`skill-route`, ...) route to a nested `if/else`/`switch` on `args[1]` inside their own case block
(e.g. `state`'s subcommands at `df-tools.cjs:314-373`). `dispatcherCommands()`'s 4-space-indent
regex correctly ignores these (they're indented deeper), so it only ever reports **top-level**
command names — exactly what's needed here, since all four target additions are top-level, no
subcommand nesting required by the objective's scope sketch (though `override` may want a
`record`/`list` split internally, Q2).

## Objective 29 `read_share_pct` Re-baseline (Q6)

**Where the old baseline lives:** `objectives/29-context-discipline/SUMMARY.md:29,39` — `53.6%`
(`read_share_ok: false` against the 40% target), captured 2026-08-19 via `df-tools context --limit
150` run against local transcripts at that time. Also referenced narratively (not numerically) in
CLAUDE.md's Context management section (`CLAUDE.md:137-140`, `:156-159`) and
`context-discipline.md`'s "Checking" section (`:90-96`) — neither of those two currently states a
number, they just describe the methodology and image-pricing trap.

**Re-ran the exact methodology today** (`node -e` against `context-audit.cjs`'s `analyze()`
directly, roots = `~/.claude/projects`, `limit: 150`, same as 29-04's own evidence table) — cheap:
150 files, ~1 second:

```
files_scanned: 150
composition: { tool_results_pct: 58.2, tool_inputs_pct: 33.3, assistant_text_pct: 5.8, images_pct: 2.7 }
targets: { read_share_pct: 24.6, read_share_target: 40, read_share_ok: true }
context_per_turn.subagent:    { p50: 227262, p90: 361383, over_200k_pct: 56.7 }
context_per_turn.main_thread: { p50: 455319, p90: 804099, over_200k_pct: 95.1 }
```

`read_share_pct` dropped from 53.6% → 24.6%, now **under** the 40% target
(`read_share_ok: true`). This is a real number from this machine's actual transcript corpus, not a
projection — but it should be treated as informational for the RESEARCH phase, not yet the
"official" re-baseline, for two reasons the milestone audit itself raises: (1) the CLI still isn't
wired, so this number was produced by calling the lib directly, not by running the command this
objective is about to add; (2) `v1.3-MILESTONE-AUDIT.md:40` notes nothing since v2.10.1 is live in
real sessions yet (`sync-runtime` hasn't re-mirrored), so some of the transcripts sampled may
predate 29-01's prompt-discipline changes and some may postdate them — an unweighted mix, not a
clean before/after.

**Where to record the new baseline without rewriting history:** do not edit
`29-context-discipline/SUMMARY.md` (historical record of what 29-04 shipped and measured then).
Recommend: (a) this objective's own `39-*-SUMMARY.md` (written at execution time) is the natural
place for a "re-measured, see below" note with a fresh `df-tools context --limit 150` run using the
now-wired CLI — that's the SUMMARY the milestone-audit gap explicitly asks for; (b) optionally add
one line to `references/context-discipline.md`'s "Checking" section (`:90-96`) recording the
measured number the same way `CLAUDE.md:134` records its own line-count ("currently ~156 lines")
as a self-referential, update-on-touch fact rather than a static claim. Do **not** touch
`CLAUDE.md:137-140`'s prose (the "not yet wired" framing needs to flip to a real command reference
once this objective ships, which is in-scope; the 53.6%/59% composition numbers quoted there are
this objective's to refresh once the CLI is real, but a full re-measurement should wait for a
released, re-mirrored plugin per the milestone audit's gap #2 — flag as Open Question, don't
silently overwrite with today's ad hoc number).

## CLAUDE.md Hook Inventory (Q7)

Confirmed via `hooks.json` (full file read): **13 registered hooks**, none reference
`inject-org-context.js` or `inject-handoff-results.js`. Both files carry an explicit header
(`inject-org-context.js:6-8`, `inject-handoff-results.js:6-8`): `**DRAFT — landing as part of v1.1
"DevFlow Coordination Layer" milestone.** Not registered in hooks.json yet...`.

CLAUDE.md's hook inventory (`:95-121`) lists all 13 registered hooks correctly grouped, PLUS these
two DRAFT files under "**Session context (SessionStart / UserPromptSubmit):**"
(`CLAUDE.md:102-103`) with no DRAFT/unregistered annotation — this is the exact issue named in the
milestone audit's tech-debt list (`v1.3-MILESTONE-AUDIT.md:67`) and in this objective's own scope
sketch (`OBJECTIVE.md:24`). `scripts/gen-docs-data.cjs` (the site generator) already handles this
correctly at the data layer — its `hooks` array marks `registered: reg.length > 0` per file
(`:156-169`), so the DRAFT/unregistered status is already computed correctly for the published
site; **only CLAUDE.md's own prose is stale**. Fix is textual: move or annotate those two bullets
(e.g. a new "**Draft (not registered):**" subsection) rather than deleting them — they're accurate
descriptions of real, reviewable files, just not live hooks.

No other inventory entries were found wrong: all 13 `hooks.json` entries match a CLAUDE.md bullet
1:1 (`sync-runtime.js`, `awareness-cache-populate.js`, `classify-session.js`, `route-results.js`,
`upgrade-project.js`, `statusline.js` (via `plugin.json`, correctly noted separately),
`verify-completion.js`, `verify-commits.js`, `route-intent.js`, `gate-commits.js`,
`gate-edits.js`, `gate-interactive.js`, `guard-no-progress.js`, `changelog-on-tag.js`).

## Pitfalls (Q8)

1. **`doc-refs.cjs`'s CI gate (TRD 38-09) does not protect this objective's changes** — it only
   resolves `/devflow:`/`/df:` skill-invocation tokens (`doc-refs.cjs:28`), never bare `df-tools
   <command>` prose. Do not assume adding the four commands and updating CLAUDE.md's prose will be
   caught by the existing `doc-refs.repo.test.cjs` gate if done wrong — that's precisely why this
   objective needs its own dispatch-completeness test (Q5).
2. **CHANGELOG `[Unreleased]` convention:** current section already has an `### Added` entry for
   `telemetry` (`CHANGELOG.md`, "`df-tools telemetry [--raw]` is now a real CLI command...",
   verified present) — follow the same terse, past-tense, code-formatted style: one bullet per new
   command naming it was "previously advertised... but unimplemented" / "Unknown command" before.
   No version bump/tag/push per constraints — this stays under the existing `[Unreleased]` heading.
3. **`help.test.cjs` has no fixed-count assertion** (checked: no `.length === N` anywhere) — only
   the bidirectional set-equality checks (`:44-53`). Adding 4 new cases + 4 new help entries is
   safe and won't need a magic-number update anywhere.
4. **`gen-docs-data.cjs`'s regex requires `case 'name': {` with the brace on the same line** — every
   existing case in `df-tools.cjs` already follows this (verified via the same grep used for Q5);
   just don't deviate to a multi-line brace style for the new cases, or the site's command table
   silently drops them (no test currently enforces `gen-docs-data.cjs` picking up new commands —
   it only runs in `docs.yml` CI on push to `main`, not as part of `npm test`).
5. **`--raw` is stripped globally before dispatch** (`df-tools.cjs:266-268`) — do not re-parse
   `--raw` inside the new case blocks; read the outer `raw` variable exactly like `telemetry` does.
6. **Large JSON payloads auto-spill to a tmpfile** (`lib/helpers.cjs:25-41`, `>50000` chars →
   `@file:<path>` sentinel). `context`/`session-audit`'s `by_tool`/`by_category` outputs are capped
   (top 12 tools, `context-audit.cjs:162`) so this is unlikely to trigger, but `transcript-export`
   is not — its `exportTranscripts()` return value is small (counts only, not the index rows
   themselves), so this is a non-issue for all four, just worth knowing the mechanism exists.
7. **No `.gitignore` entry exists yet for whatever default output path `transcript-export`'s CLI
   picks** — if the planner chooses a path under `.planning/` instead of the recommended
   `~/.claude/devflow/`-scoped path (Q2), a new `.gitignore` line will be needed (follow the
   existing pattern at `.gitignore:48-49`, with the same kind of comment citing the TRD number).
8. **`override.cjs`'s `GATES` map only knows 3 gates** (`edits`, `commits`, `changelog`,
   `override.cjs:27-31`) — `guard-no-progress.js`'s escalation and the worktree-isolation guard are
   NOT overridable gates in this scheme (by design — the latter is explicitly "not a DevFlow hook",
   `CLAUDE.md:121`). Don't expand `GATES` as part of this objective; it's out of scope (mirrors an
   existing module, not a redesign).

## Open Questions

1. **Should `override --gate`/`--reason` be a bare-flag command or a `record`/`list` subcommand
   pair?** What we know: the documented invocation (`30-04-SUMMARY.md:55`) is flag-only
   (`override --gate <g> --reason <r>`); a `--list` mode is also asked for
   (`30-04-SUMMARY.md:73`) but never specified precisely. What's unclear: whether `--list` composes
   with `--gate`/`--reason` (mutually exclusive flags on one command) or needs a subcommand.
   Recommendation: subcommand (`override record ...` / `override list [--limit N]`) is more
   consistent with `handoff`'s existing 4-way subcommand shape (`help.cjs:190-193`) and avoids flag
   ambiguity; the planner should pick one and encode it in `help.cjs`'s single `usage` string.
2. **Should `telemetry --scan`/`--sessions` finally get wired to `session-audit`, now that
   `session-audit` itself is reachable?** What we know: 38-11 explicitly deferred this
   (`38-11-SUMMARY.md:191`); `31-01-SUMMARY.md:66` describes the flag prospectively but it was
   never implemented (`rg -- "--scan"` = 0 matches). Recommendation: treat as separate, optional
   scope — the objective's scope sketch only asks for the four commands to dispatch + a
   dispatch-completeness test + the 29 re-baseline + the CLAUDE.md hook-inventory fix. Adding
   `--scan` to `telemetry` is a fifth, unstated change; call it out to the user/planner explicitly
   rather than silently bundling it.
3. **Is today's ad hoc 24.6% `read_share_pct` (Q6) the number that should ship in this objective's
   SUMMARY, or should the SUMMARY defer to a post-release re-run** (per
   `v1.3-MILESTONE-AUDIT.md:40`, nothing since v2.10.1 is live yet)? Recommendation: report both —
   the as-wired-today number (via the newly-wired CLI, not the lib-direct call this research used)
   AND an explicit note that it predates the pending version bump/re-mirror, so a future re-run
   after release is expected to move again.
4. **No agent/workflow prompt currently tells anyone to run `df-tools override`** even after it's
   wired (checked `agents/*.md`, `skills/*/SKILL.md`, `workflows/*.md` — zero references). Wiring
   the CLI makes it *reachable*, not *used*. Out of this objective's stated scope (it's about
   dispatch, not adoption), but worth a one-line callout in the SUMMARY's Follow-ups so it isn't
   lost again the way the original wiring was.

## Sources

### Primary (HIGH confidence — direct repo reads, this branch, 2026-09-28)
- `plugins/devflow/devflow/bin/df-tools.cjs` (dispatch structure, telemetry/benchmark cases, help
  pre-switch, default arm)
- `plugins/devflow/devflow/bin/lib/help.cjs`, `help.test.cjs` (COMMANDS table, dispatcherCommands())
- `plugins/devflow/devflow/bin/lib/{context-audit,session-audit,transcript-export,override,telemetry,benchmark}.cjs`
  and their `.test.cjs` siblings
- `plugins/devflow/devflow/bin/lib/doc-refs.cjs`, `doc-refs.repo.test.cjs`, `doc-surfaces.test.cjs`
- `CLAUDE.md` (Core Tool, Hooks, Context management sections)
- `plugins/devflow/devflow/references/context-discipline.md`
- `.planning/v1.3-MILESTONE-AUDIT.md`
- `.planning/objectives/{29-context-discipline,30-agent-environment-hygiene,31-telemetry-and-retention}/SUMMARY.md`
- `.planning/objectives/38-doc-auto-correction/38-11-{TRD,SUMMARY}.md`
- `plugins/devflow/hooks/hooks.json`, `inject-org-context.js`, `inject-handoff-results.js`
- `scripts/gen-docs-data.cjs`, `.github/workflows/docs.yml`, `.gitignore`
- CHANGELOG.md `[Unreleased]` section
- Live command execution: `node df-tools.cjs {context,session-audit,transcript-export,override,
  state,objective,roadmap,init,resolve-model,validate,gh,telemetry,changelog,upgrade,adopt,intent}
  [--help]` (all run in this repo, this session)
- Live `node -e` calls to `context-audit.analyze()` and `session-audit.analyze()` against real
  `~/.claude/projects` transcripts (`--limit 150`), this session

No secondary/tertiary sources — no web research performed per instructions; every claim above is
either a direct file read/grep or an actual command execution in this repo.

## Metadata

**Confidence breakdown:**
- Dispatch mechanics (Q1, Q5): HIGH — read the actual switch statement and ran every command.
- Per-module contracts (Q2): HIGH for existing code/side-effects; MEDIUM for the *recommended*
  default paths/flags that don't exist yet (defaults are precedent-based recommendations, not
  discovered facts — the planner can deviate).
- Caller intent (Q3): HIGH — grepped for zero call sites, cross-checked against the objectives'
  own SUMMARY prose.
- Test infra (Q4): HIGH — read every relevant `.test.cjs` file's actual helper code.
- Re-baseline (Q6): HIGH for the historical number and today's re-run; MEDIUM for what number
  should "count" given the pending version bump (explicitly flagged as an Open Question).
- Hook inventory (Q7): HIGH — read `hooks.json` and both draft file headers directly.

**Research date:** 2026-09-28
**Valid until:** This is a fast-moving branch (262 unreleased commits per the milestone audit) —
treat this research as valid only until the next `df-tools.cjs`/`help.cjs`/CLAUDE.md edit lands;
re-verify command counts and line numbers before the planner locks task-level line citations.
