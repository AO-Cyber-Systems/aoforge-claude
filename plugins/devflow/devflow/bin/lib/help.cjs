'use strict';

/**
 * help.cjs — `--help` / `-h` for every df-tools subcommand (issue #87).
 *
 * Why this exists: before it, `df-tools commit --help` took `--help` as the
 * commit MESSAGE, found no `--files`, staged `.planning/` and committed
 * whatever was dirty. The universal "tell me before you do anything" gesture
 * was the one input that guaranteed a write — and it succeeded silently,
 * printing a hash.
 *
 * The fix is structural rather than per-subcommand: the dispatcher answers
 * `--help`/`-h` BEFORE the switch, so no subcommand can ever see a help flag
 * as data. Every top-level command therefore needs an entry here, and
 * `help.test.cjs` fails if a `case` in df-tools.cjs has none.
 *
 * `mutates: true` marks a command that writes to disk or to git. It is shown in
 * the listing so a reader can tell, before running anything, which questions
 * are safe to ask.
 */

// The shared shape of every planning verb (TRD 48-15, planning-verbs-cli.cjs).
const VERB_DETAILS = [
  '  Planning verb: content comes from --from <path> or --from - (stdin). A missing --from is a usage error;',
  '  `df-tools planning draft <rel>` prints a draft path seeded with the current file.',
  '  Prose by default, the result JSON with --raw. Store mode (github.store): --no-flush / --no-wait (no-ops locally).',
  '  Exit: 0 ok, 1 error; store mode also 2 halted for a human, 3 ops still pending (offline / rate limited).',
];

// name → { usage, summary, mutates?, details? }
const COMMANDS = {
  'state': {
    usage: 'df-tools state [load|get [section]|update <field> <value>|patch --<field> <val>...|advance-job [--objective <N>]|record-metric|update-progress|add-decision|add-blocker|resolve-blocker|record-session] [--raw]',
    summary: 'Read or update .planning/STATE.md.',
    mutates: true,
  },
  'resolve-model': {
    usage: 'df-tools resolve-model <agent-type> [--raw]',
    summary: 'Resolve the model for an agent from the configured profile.',
  },
  'find-objective': {
    usage: 'df-tools find-objective <objective> [--raw]',
    summary: 'Find an objective directory by number.',
  },
  'commit': {
    usage: 'df-tools commit <message> [--files <path>...] [--amend] [--raw]',
    summary: 'Commit planning docs (honours commit_docs + .gitignore).',
    mutates: true,
    details: [
      '  <message>   The commit subject. A message starting with "--" is REFUSED:',
      '              it is far likelier a mistyped flag than an intended subject.',
      '  --files     Paths to stage and commit. STRONGLY RECOMMENDED: the commit is',
      '              limited to these pathspecs, so a concurrent executor\'s staged',
      '              changes are not swept in.',
      '              Omitted, the command falls back to staging and committing',
      '              .planning/ only — never the rest of the working tree.',
      '  --amend     Amend the previous commit (--no-edit); <message> is not required.',
      '',
      'Examples:',
      '  df-tools commit "docs(12-03): complete TRD" --files .planning/STATE.md',
      '  df-tools commit "chore: sync mapping" --files .planning/.gh-mapping.json',
    ],
  },
  'verify-summary': {
    usage: 'df-tools verify-summary <path> [--check-count N] [--raw]',
    summary: 'Verify a SUMMARY.md file.',
  },
  'template': {
    usage: 'df-tools template <select|fill> ... [--raw]',
    summary: 'Select or fill a DevFlow document template.',
    mutates: true,
  },
  'frontmatter': {
    usage: 'df-tools frontmatter <get|set|merge|validate> <file> [--field k] [--value v] [--data json] [--schema job|summary|verification] [--raw]',
    summary: 'Read, write or validate a file\'s YAML frontmatter.',
    mutates: true,
  },
  'verify': {
    usage: 'df-tools verify <job-structure|objective-completeness|references|commits|artifacts|key-links|trd-pre|api-contract|flutter-ui-bootstrap|flutter-state-coverage|flutter-ui-eval> <arg> [--raw]',
    summary: 'Verification suite — structure, references, commits, artifacts, UI states.',
  },
  'flutter-ui': {
    usage: 'df-tools flutter-ui <setup|eval|bootstrap|design-review> [args] [--raw]',
    summary: 'Flutter UI evaluation setup and runs.',
    mutates: true,
  },
  'ui': {
    usage: 'df-tools ui <metrics|spec|sheet|lock> [args] [--raw]',
    summary: 'Surface Spec validation, review sheet, look-lock and UI metrics.',
    mutates: true,
  },
  'detect': {
    usage: 'df-tools detect <novel-domain|brownfield-map|flutter-ui-scope> [arg] [--raw]',
    summary: 'Detectors used by the planner (research boundary, brownfield, Flutter UI scope).',
  },
  'generate': {
    usage: 'df-tools generate uat <objective> [--raw]',
    summary: 'Generate a 1-page UAT checklist from TRDs and Maestro flows.',
    mutates: true,
  },
  'generate-slug': {
    usage: 'df-tools generate-slug <text> [--raw]',
    summary: 'Convert text to a URL-safe slug.',
  },
  'current-timestamp': {
    usage: 'df-tools current-timestamp [full|date|filename] [--raw]',
    summary: 'Print a timestamp in the requested format.',
  },
  'list-todos': {
    usage: 'df-tools list-todos [area] [--raw]',
    summary: 'Count and enumerate pending todos.',
  },
  'verify-path-exists': {
    usage: 'df-tools verify-path-exists <path> [--raw]',
    summary: 'Check that a file or directory exists.',
  },
  'config-ensure-section': {
    usage: 'df-tools config-ensure-section [--raw]',
    summary: 'Initialize .planning/config.json.',
    mutates: true,
  },
  'config-set': {
    usage: 'df-tools config-set <key> <value> [--raw]',
    summary: 'Set a key in .planning/config.json.',
    mutates: true,
  },
  'config-get': {
    usage: 'df-tools config-get <key> [--raw]',
    summary: 'Read a key from .planning/config.json.',
  },
  'history-digest': {
    usage: 'df-tools history-digest [--raw]',
    summary: 'Aggregate every SUMMARY.md into one digest.',
  },
  'migrate': {
    usage: 'df-tools migrate <plan|apply> [--kind k] [--default-work w] [--work-choices json] [--dry-run]',
    summary: 'Plan or apply a .planning/ layout migration.',
    mutates: true,
  },
  'upgrade': {
    usage: 'df-tools upgrade [--check|--apply] [--only id[,id]] [--confirm] [--path dir] [--kind k] [--default-work w] [--global] [--prune [--dry-run]] [--register]',
    summary: 'Bring this project (or, with --global, ~/.claude) forward to the running DevFlow version.',
    mutates: true,
    details: '--check (default) lists pending migrations; --apply runs auto migrations, backs up outside the repo, and stamps config.json. Confirm migrations run only with --apply --only <id> or --apply --confirm; 0006 takes --kind (and --default-work). --global moves legacy df-* files and manages the ~/.claude/CLAUDE.md block; --global --confirm adopts it over a hand-written section. --prune removes old backups under ~/.claude/devflow/backups (keeps <14 days and the newest 5 per repo; backups.retain_days / backups.keep_min in global-config.json); --dry-run lists without removing. --register records this repo for pruning.',
  },
  'adopt': {
    usage: 'df-tools adopt <preflight|begin|scaffold|report> [--raw]',
    summary: 'Adopt an existing repo as a DevFlow project (routes, branches, scaffolds, reports; never pushes).',
    mutates: true,
    details: 'preflight is read-only: it routes to adopt | resume | upgrade | new-project | refuse. begin creates the devflow/adopt branch and a progress marker in the git dir. scaffold writes config/STATE/state.json/ROADMAP/STACK.md and the CLAUDE.md block, then stamps. report writes .planning/ADOPT-REPORT.md and prints the files to commit. Refusals (dirty tree, rebase/merge, detached HEAD, not a repo) change nothing and exit 3. Combine with the global --cwd <dir> flag to target another repo.',
  },
  'intent': {
    usage: 'df-tools intent resolve [--objective N] [--trd path] [--raw]',
    summary: 'Resolve the intent/defaults cell for an objective or TRD.',
  },
  'objectives': {
    usage: 'df-tools objectives list [--type t] [--objective N] [--include-archived] [--raw]',
    summary: 'List objectives with their on-disk status.',
  },
  'roadmap': {
    usage: 'df-tools roadmap <get-objective <N>|analyze|update-job-progress <N>> [--raw]',
    summary: 'Read or update ROADMAP.md.',
    mutates: true,
  },
  'requirements': {
    usage: 'df-tools requirements mark-complete <REQ-01[,REQ-02...]> [--raw]',
    summary: 'Mark requirement IDs complete in REQUIREMENTS.md.',
    mutates: true,
  },
  'objective': {
    usage: 'df-tools objective <next-decimal <N>|add <description>|insert <after> <description>|remove <N> [--confirm]|complete <N>|put <id> --from <path|->|set-status <id> <planned|in_progress|verifying|complete|cancelled|reopened>> [--raw]',
    summary: 'Add, insert, remove or complete a roadmap objective; write OBJECTIVE.md (put) or its status (set-status).',
    mutates: true,
    details: [
      '  put / set-status are planning verbs (TRD 48-15). Local `set-status <id> complete` sets the status, then runs',
      '  `objective complete <id>` unchanged.',
      ...VERB_DETAILS,
    ],
  },
  'milestone': {
    usage: 'df-tools milestone put <version> --from <path|-> | milestone complete <version> [--name ...] [--archive-objectives] [--raw]',
    summary: 'Write a MILESTONES.md entry (put) or archive a milestone (complete).',
    mutates: true,
    details: VERB_DETAILS,
  },
  'plan': {
    usage: 'df-tools plan put-trd <objective> <file-name> --from <path|-> [--no-push] [--no-flush] | plan push <objective> [--no-flush] [--raw]',
    summary: 'Write a TRD (put-trd; store mode refuses one over 60,000 encoded chars) or push an objective\'s hierarchy.',
    mutates: true,
    details: VERB_DETAILS,
  },
  'summary': {
    usage: 'df-tools summary post <trd-id> --from <path|-> [--file <name>] | summary checkpoint <trd-id> --from <path|-> [--raw]',
    summary: 'Write a TRD\'s SUMMARY (post) or a per-task progress checkpoint.',
    mutates: true,
    details: VERB_DETAILS,
  },
  'verification': {
    usage: 'df-tools verification post <objective> --from <path|-> [--file <name>] [--raw]',
    summary: 'Write an objective\'s VERIFICATION.',
    mutates: true,
    details: VERB_DETAILS,
  },
  'doc': {
    usage: 'df-tools doc put <rel-under-.planning> --from <path|-> [--message <text>] [--raw]',
    summary: 'Write a planning document that has a wiki page (PROJECT.md, research/, CONTEXT, RESEARCH, ...).',
    mutates: true,
    details: VERB_DETAILS,
  },
  'decision': {
    usage: 'df-tools decision open <trd-id> --question <text|@path> | decision answer <trd-id>-d<k> --from <path|-> | --text <t> [--raw]',
    summary: 'Open a decision a TRD waits on, or answer one (local ids are DECISION-NNN).',
    mutates: true,
    details: VERB_DETAILS,
  },
  'debug': {
    usage: 'df-tools debug put <slug> --from <path|-> | debug resolve <slug> [--raw]',
    summary: 'Write a debug session, or resolve it.',
    mutates: true,
    details: VERB_DETAILS,
  },
  'quick': {
    usage: 'df-tools quick put <N> <slug> --from <path|-> | quick summary <N> --from <path|-> [--raw]',
    summary: 'Write a quick task\'s JOB (put) or its SUMMARY.',
    mutates: true,
    details: VERB_DETAILS,
  },
  'validate': {
    usage: 'df-tools validate <consistency|health [--repair]|docs> [--raw]',
    summary: 'Check .planning/ integrity, objective numbering, and documentation staleness.',
    mutates: true,
  },
  'doctor': {
    usage: 'df-tools doctor [--fix] [--json] [--path <dir>] [--global]',
    summary: 'Diagnose (and with --fix safely repair) DevFlow environment problems: stale runtime mirror, in-repo runtime state, pending migrations, stale markers/state/backups, hook drift.',
    mutates: true,
    details: 'Read-only by default. --fix applies only safe, reversible fixes (backups per upgrade conventions) and refuses index-changing fixes when unrelated changes are staged. --global runs only machine-level checks.',
  },
  'telemetry': {
    usage: 'df-tools telemetry [--scan [--limit N] [--since YYYY-MM-DD] [--root <dir>]] [--raw]',
    summary: 'One read-only view of gate overrides, stuck-loop state and documentation staleness, with advisories. `--scan` adds a session audit of blocking events (default root ~/.claude/projects, --limit 150; 0 = all).',
  },
  'context': {
    usage: 'df-tools context [--limit N] [--root <dir>] [--raw]',
    summary: 'Context-window composition from session transcripts (default root ~/.claude/projects, --limit 150; 0 = all). Read-only.',
  },
  'session-audit': {
    usage: 'df-tools session-audit [--since YYYY-MM-DD] [--limit N] [--root <dir>] [--raw]',
    summary: 'Classify blocking events in session transcripts (default root ~/.claude/projects, --limit 150). Read-only.',
  },
  'transcript-export': {
    usage: 'df-tools transcript-export [--out <file>] [--full <dir>] [--limit N] [--root <dir>] [--raw]',
    summary: 'Append a compact per-session index of transcripts (default ~/.claude/devflow/transcript-index.jsonl); incremental.',
    mutates: true,
  },
  'tokens': {
    usage: 'df-tools tokens <trd <trd-id> | stamp <trd-id> --draft <path> | backfill [--write] [--force] | coverage [--milestone <v> | --objective <N>]> [--objective-dir <dir>] [--repo <path>] [--root <dir>] [--raw]',
    summary: 'Executor token usage of one TRD from Claude Code transcripts; `stamp` writes it into a SUMMARY draft before `summary post`; `backfill` recovers it for historical SUMMARYs; `coverage` reports how many SUMMARYs of a milestone or objective were stamped at write time.',
    mutates: true,
    details: 'trd is read-only; stamp writes only the draft you name (tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model, tokens_source: "live"), never a file under .planning/. Transcripts are read from --root, default ~/.claude/projects, for the repository at --repo (default: the main checkout). Exit 0 even when no transcript is found (stamped: false, the draft is left byte-identical); exit 1 for usage errors or a draft inside .planning/. backfill covers every SUMMARY of the checkout holding cwd and is a dry run by default: it prints recovered and unrecovered counts (by reason) and changes no file. --write stamps each recovered SUMMARY through `summary post` (tokens_source: "backfill"); a second --write writes nothing. --force also restamps a SUMMARY that already has token values. Unrecoverable history is the normal outcome (exit 0); exit 1 only for usage errors or a failed write. coverage is read-only and writes nothing: it classifies every TRD SUMMARY of the current milestone (--milestone <v> for another, --objective <N> for one objective, not both) as live (tokens_source "live"), backfill, unlabeled, missing (no token fields, with or without a Self-Check) or in progress (a Progress checkpoint only, listed but not counted), and prints live/counted as an exact fraction with the decimal floored at 6 places and an integer check of the 95% target; each missing SUMMARY says why (stamp_skipped when an executor transcript exists, else no_transcript and the other reasons). A report exits 0 whatever the coverage; exit 1 only for a usage error, an unknown milestone, a missing ROADMAP.md or an objective with no directory.',
  },
  'calibrate': {
    usage: 'df-tools calibrate [--paths <dir[,dir]>] [--out <file>] [--rates <file>] [--root <dir> | --no-overhead] [--window <N|all>] [--minutes <task_sum|trd_level>] [--through <N>] [--dry-run] [--raw]',
    summary: 'Build per-task-class medians/P90s (minutes, tokens, dollars), per-agent overhead and objective-level history from SUMMARY frontmatter, STATE_ARCHIVE metrics, subagent transcripts and model-rates.json into ~/.claude/devflow/calibration.json.',
    mutates: true,
    details: 'Default paths: the checkout holding cwd (or DEVFLOW_CALIBRATE_PATHS, path.delimiter separated). Default out: DEVFLOW_CALIBRATION_PATH, else ~/.claude/devflow/calibration.json. Agent overhead (planner, plan checker, verifier, researcher, integration checker, roadmapper) is measured per spawn from Claude Code subagent transcripts under --root, default ~/.claude/projects (resolved when the command runs); --no-overhead skips that scan and cannot be combined with --root. --window <N|all> keeps, per project, only the N most recent objectives that have samples (by objective number) and drops older ones before every statistic, agent overhead excepted; `--window all` keeps all history; with no flag the window is on (default: the most recent 10 objectives with samples per project, objective 64). A window that drops nothing (a project of 10 or fewer objectives) leaves no `window` block in the file. Calibration version 3 names the method in a `method` block (and in inputs_digest): the requested minutes method, window and cutoff. --minutes <task_sum|trd_level> (default trd_level since objective 67) says how an estimate builds the minutes of a TRD: `task_sum` adds the per-task class distributions of its auto tasks, `trd_level` takes trd_level.minutes of the calibration whatever the task count; the statistics in the file are the same for both, the estimator applies the method. --through <N> drops, before anything is read or counted, every objective directory numbered above N (or with no number) together with its STATE_ARCHIVE and state.json metric rows, so a later objective cannot change the file; the window then applies to what is left, and agent overhead (from transcripts) is not cut. Deterministic: unchanged inputs give a byte-identical file and changed:false. --dry-run builds and reports but writes nothing. Refuses (exit 1) when no project is found, so an empty history never overwrites a good file.',
  },
  'estimate': {
    usage: 'df-tools estimate <task (--files <a[,b]> [--tdd] [--trd-type <t>] | --class <name> | --checkpoint) | trd <trd-id|path> | objective <N> [--all] [--table|--line] | milestone [vX.Y] [--table|--line] | start <N> | wave <N> <wave> (--start|--done) | finish <N> | backtest <N[,N...]>> [--calibration <file>] [--raw]',
    summary: 'Estimate time, tokens and dollars from the calibration (median and P90, with sample count and confidence): one task, a TRD, what is left of an objective or a milestone; start/wave/finish record the run state the status line reads and print actual against estimate.',
    mutates: true,
    details: 'Needs the calibration df-tools calibrate writes: --calibration <file>, else DEVFLOW_CALIBRATION_PATH, else ~/.claude/devflow/calibration.json. Without a usable calibration every estimate verb exits 0 and prints `No estimate: <reason>` naming df-tools calibrate, never a number. A version 3 calibration names its minutes method; with `trd_level` the minutes of a TRD come from the TRD-level history of the calibration, not the sum of its tasks, and every result carries `calibration.method`. JSON by default (rounded; objective and milestone results carry `line` and `table`); --raw prints the text (--table for the table, otherwise one line). objective --all also estimates the done TRDs (a backtest). start <N> writes the run state (objective, waves with their estimates) to DEVFLOW_ESTIMATE_STATE_DIR, else ~/.claude/devflow/state/estimates, never into the repository; wave <N> <wave> --start|--done records one wave and --done prints actual against the estimate with a verdict; finish <N> prints the objective execution time against its estimate and is idempotent, and archives the finished run to <state dir>/history/<repo-key>/ so a later start cannot destroy it. backtest <N[,N...]> compares the estimate of each listed objective (every TRD, as before execution) with its measured executor minutes (SUMMARY duration, else the STATE_ARCHIVE row) and priced SUMMARY tokens, uses the last finished run state of the objective when the run history holds one (prospective), and prints the EST-08 verdict: median within ±30%, P90 covering at least 80% of objectives and TRDs; --raw prints the markdown report. Exit 0 for every estimate, including "no estimate"; exit 1 for usage errors and an objective, TRD or milestone that does not exist.',
  },
  'override': {
    usage: 'df-tools override --gate <edits|commits|changelog> --reason "<why>" | --list [--limit N] [--raw]',
    summary: 'Record a structured, logged gate override in .planning/.override-log.jsonl, or list recent overrides.',
    mutates: true,
  },
  'progress': {
    usage: 'df-tools progress [json|table|bar] [--raw]',
    summary: 'Render roadmap progress.',
  },
  'todo': {
    usage: 'df-tools todo add --from <path|-> [--stem <stem>] | todo complete <stem|filename> | todo sync (--transcript <path>... | --session <id>) [--projects-root <dir>] [--dry-run] [--no-flush] [--no-wait] [--raw]',
    summary: 'Add a todo, move one to completed, or merge a session\'s task-list todos into the archive.',
    mutates: true,
    details: VERB_DETAILS,
  },
  'handoff': {
    usage: 'df-tools handoff <create <command...> [--inputs-json json]|complete <id> [--exit-code N] [--output s] [--output-file f]|list|get <id>> [--raw]',
    summary: 'Hand a TTY-required command off to the user\'s shell.',
    mutates: true,
  },
  'scaffold': {
    usage: 'df-tools scaffold <context|uat|verification|objective-dir> --objective <N> [--name <name>] [--raw]',
    summary: 'Create a DevFlow document or objective directory from a template.',
    mutates: true,
  },
  'init': {
    usage: 'df-tools init <execute-objective|plan-objective|new-project|new-milestone|quick|resume|verify-work|objective-op|todos|milestone-op|map-codebase|security-audit|progress> [args] [--include a,b] [--raw]',
    summary: 'Load the context bundle a workflow or agent needs at start.',
  },
  'objective-job-index': {
    usage: 'df-tools objective-job-index <objective> [--raw]',
    summary: 'Index an objective\'s plans with waves and status.',
  },
  'state-snapshot': {
    usage: 'df-tools state-snapshot [--raw]',
    summary: 'Structured parse of STATE.md.',
  },
  'summary-extract': {
    usage: 'df-tools summary-extract <path> [--fields a,b] [--raw]',
    summary: 'Extract structured data from a SUMMARY.md.',
  },
  'websearch': {
    usage: 'df-tools websearch <query> [--limit N] [--freshness day|week|month] [--raw]',
    summary: 'Search the web via the Brave API, when configured.',
  },
  'workstreams': {
    usage: 'df-tools workstreams <analyze|provision <id> <path>|reconcile> [--raw]',
    summary: 'Analyze, provision or reconcile parallel workstreams.',
    mutates: true,
  },
  'changelog': {
    usage: 'df-tools changelog <update [--version v] [--from ref] [--to ref] [--dry-run]|check <path>> [--raw]',
    summary: 'Generate or check CHANGELOG entries.',
    mutates: true,
  },
  'defaults-table': {
    usage: 'df-tools defaults-table init [args] [--raw]',
    summary: 'Write the project defaults table.',
    mutates: true,
  },
  'gh': {
    usage: 'df-tools gh <status|sync [<objective>|--all]|pull <objective> [--apply]|pull --all [--force]|resolve <objective>|comment <objective|#issue> <body|@file:path> [--kind k]|close-issue <objective|#issue> [comment]|sync-release <tag>|outbox <status|flush [--no-wait]|resolve <seq> --accept-remote|--overwrite>|trd <spec|freeze|fold [--force]|scope <body|@file:path> [--n K]|confirm-scope <n> [--force --reason <why>]|start> <trd>|orphans <objective>|pr <start|sync|status|merge|reconcile> <objective> [--name <branch>] [--no-flush]|setup [--apply] [--refresh] [--require-wiki]> [--raw]  (sync-objectives: deprecated alias of sync --all; setup is a dry-run unless --apply, needs github.enabled but not store mode, and exits 1 on a failed action, a conflicting local file or (with --require-wiki) an unready wiki; outbox flush exits 0 flushed, 1 error, 2 halted for a human, 3 pending; pr start and merge need a store-mode project and are online-required; pr merge exits 3 when the PR only joined a merge queue, pr reconcile exits 3 while the PR is open)',
    summary: 'Sync DevFlow planning state to and from GitHub.',
    mutates: true,
  },
  'stack': {
    usage: 'df-tools stack <resolve [--file <path>] [--provenance] | context <agent> [--files a,b] [--budget N] [--ui] | validate [--profile <path>] | command <key> [--files a,b] [--packages a,b] [--apply] | init [--from codebase|research] [--extends <id>] [--write] [--force]> [--raw]',
    summary: 'Resolve, validate and slice the project stack profile (.planning/STACK.md over bundled general).',
    mutates: true,
  },
  'awareness': {
    usage: 'df-tools awareness [args] [--raw]',
    summary: 'Peer view — who else is working in this repo.',
  },
  'org-awareness': {
    usage: 'df-tools org-awareness [args] [--raw]',
    summary: 'Org-wide progress across repos.',
  },
  'planning': {
    usage: 'df-tools planning sibling-trd-scan <objective> | planning draft <rel> | planning import [--dry-run] | planning mode [--raw]',
    summary: 'Planning mode (local|store), a draft path for a planning file, import local work into the store, sibling TRD scan.',
    // `import` writes; `mode`, `draft` (a temp draft outside .planning/) and `sibling-trd-scan` do not.
    mutates: true,
    details: [
      '  planning mode     prints `local` or `store` (--raw: {mode, reason, root}); writes nothing.',
      '  planning draft    prints a draft path under the OS temp dir, seeded from the current file; edit it, then pass',
      '                    it to the owning verb with --from. Writes nothing under .planning/.',
      '  planning import   store mode: queue existing local planning files to GitHub. --dry-run writes nothing and prints the plan, the request estimate and the history closes; with the store off and github.enabled true it previews the backfill.',
    ],
  },
  'project-hygiene': {
    usage: 'df-tools project-hygiene <check|move [args]|archive [args]> [--raw]',
    summary: 'Check or repair project file hygiene.',
    mutates: true,
  },
  'benchmark': {
    usage: 'df-tools benchmark [args] [--raw]',
    summary: 'DevFlow benchmark harness.',
  },
  'dup-detect': {
    usage: 'df-tools dup-detect [args] [--raw]',
    summary: 'Detect duplicate objectives or TRDs.',
  },
  'decision-queue': {
    usage: 'df-tools decision-queue [args] [--raw]',
    summary: 'List and resolve parked decisions.',
    mutates: true,
  },
  'initiatives': {
    usage: 'df-tools initiatives [sync|list|show <id>]',
    summary: 'Sync and read strategic initiative context.',
    mutates: true,
  },
  'check-todos': {
    usage: 'df-tools check-todos [args] [--raw]',
    summary: 'Morning standup across local, GitHub and peer todos.',
  },
  'tui': {
    usage: 'df-tools tui [args] [--raw]',
    summary: 'Program-aware read-only terminal UI.',
  },
  'sync-roadmap': {
    usage: 'df-tools sync-roadmap [--dry-run] [--interactive] [--raw]',
    summary: 'Reconcile ROADMAP.md checkboxes against on-disk SUMMARY.md presence.',
    mutates: true,
  },
  'skill-route': {
    usage: 'df-tools skill-route <request...> | --list [--raw]',
    summary: 'Route a natural-language request to a DevFlow skill.',
  },
  'deprecation': {
    usage: 'df-tools deprecation log <old-name>',
    summary: 'Record use of a deprecated command name.',
    mutates: true,
  },
  'survey': {
    usage: 'df-tools survey decimal-objectives [--root <path>] [--raw]',
    summary: 'Survey decimal-objective usage across projects.',
  },
  'trd-tdd': {
    usage: 'df-tools trd-tdd inspect <trd-path> [--raw]',
    summary: 'Inspect a TRD\'s TDD structure.',
  },
  'project-state': {
    usage: 'df-tools project-state [<cwd>] [--raw]',
    summary: 'Report whether a directory is a DevFlow project.',
  },
  'project-decline': {
    usage: 'df-tools project-decline [<cwd>] [--duration-days N] [--raw]',
    summary: 'Record that DevFlow adoption was declined here.',
    mutates: true,
  },
  'project-accept': {
    usage: 'df-tools project-accept [<cwd>] [--raw]',
    summary: 'Clear a recorded decline.',
    mutates: true,
  },
  'skill-active': {
    usage: 'df-tools skill-active <--start <name>|--end|--status> [--raw]',
    summary: 'Mark a skill active or ended (.planning/.skill-active).',
    mutates: true,
  },
  'micro': {
    usage: 'df-tools micro <start <description>|commit [--files <path>...]|abort> [--raw]',
    summary: 'The micro workflow: start, commit, abort.',
    mutates: true,
  },
  'merge-driver': {
    usage: 'df-tools merge-driver <install [--check]|uninstall|resolve <path>|state-json <base> <ours> <theirs>> [--raw]',
    summary: 'Merge .planning/state.json (JSON-aware) and STATE_ARCHIVE.md (union) without conflicts in wave merges.',
    mutates: true,
    details: [
      '  install      Register the state.json driver and the attributes in info/attributes and',
      '               repo-local config (never committed); idempotent. --check writes nothing.',
      '  uninstall    The undo for install: removes only the managed block and config section.',
      '  resolve      Resolve a merge that already stopped on state.json or STATE_ARCHIVE.md from',
      '               the index stages and stage the result; any other path is refused.',
      '  state-json   The git merge driver entry point: 3-way merges <ours> in place (git runs it).',
    ],
  },
  'exec-context': {
    usage: 'df-tools exec-context <check|worktree|release> --repo <path> [--base <ref>] [--id <slug>] [--path <dir>] [--raw]',
    summary: 'Prove a spawn is in the intended repo on an explicit base; provision a worktree from that base.',
    mutates: true,
    details: [
      '  check     Exit 1 unless the current directory belongs to --repo (a linked',
      '            worktree of it counts) and, with --base, HEAD contains that commit.',
      '            Run this FIRST in any dispatched executor: a wrong-repo spawn then',
      '            stops loudly instead of writing where nobody is looking.',
      '            --repo must be ABSOLUTE: a relative path resolves against the',
      '            spawn\'s own cwd, so the guard would compare a repo with itself',
      '            and could never fail.',
      '            In the payload, `checkout` is the tree you are standing in and is',
      '            where work goes; `repo_root` names the REPOSITORY, which for a',
      '            linked worktree is the SHARED main checkout.',
      '            With --id AND --base, check also claims (checkout, base) for that',
      '            plan id. A DIFFERENT id on the same claim exits 1 with SHARED INDEX:',
      '            it is a parallel sibling sharing one git index (issue #98). The',
      '            same id re-checking, or a later wave on a new base, passes; claims',
      '            expire after 4h (DEVFLOW_EXEC_CLAIM_TTL_MS). No --id: no claim.',
      '            With --id, check fails WRONG CHECKOUT when a worktree was provisioned',
      '            for that id and the check ran somewhere else (no claim is taken): run',
      '            the `--cwd <worktree>` command it prints.',
      '  worktree  Provision isolation explicitly, in --repo, from --base (default: the',
      '            tip YOU are standing on — never the default branch, and never the',
      '            main checkout\'s HEAD when you dispatch from a worktree). Prints the path,',
      '            branch, and the merge-back and removal commands. `merge_back`',
      '            targets the checkout YOU are standing in (`merge_into`), not the',
      '            main checkout\'s current branch. `preflight` is the exact `--cwd` check',
      '            command for the new worktree.',
      '  release   Clear this checkout\'s shared-index claims — all of them, or only',
      '            those held by --id. For a claim left behind by a dead executor.',
      '',
      'Issue #86: forced `isolation: worktree` resolved the repo from the controller',
      'session and the base from the default branch. Both are stated here instead.',
    ],
  },
  'global-config': {
    usage: 'df-tools global-config <get <key>|set <key> <value>> [--raw]',
    summary: 'Read or write the user-level DevFlow config.',
    mutates: true,
  },
};

const HELP_FLAGS = new Set(['--help', '-h']);

/**
 * Commands that already print their OWN, richer help — domain text the generic
 * table cannot carry (which judge modes are binding, which scopes a scaffold
 * writes to). The dispatcher delegates to them instead of overriding.
 *
 * Delegating is only safe because each of these prints and returns BEFORE doing
 * any work; `help-delegation.test.cjs` holds them to that, so adding a name here
 * cannot quietly reopen issue #87.
 *
 * `true` = the whole command owns its help. A Set = only those subcommands do.
 */
const OWN_HELP = {
  'awareness': true,
  'org-awareness': true,
  'dup-detect': true,
  'defaults-table': new Set(['init']),
  'flutter-ui': new Set(['bootstrap', 'design-review', 'eval']),
  'verify': new Set(['flutter-ui-eval']),
  'gh': new Set(['resolve']),
};

function ownsHelp(args) {
  const owner = OWN_HELP[args[0]];
  if (owner === undefined) return false;
  if (owner === true) return true;
  return owner.has(args[1]);
}

function hasHelpFlag(args) {
  return args.some(a => HELP_FLAGS.has(a));
}

/**
 * Subcommands whose remaining argv is a FREE-FORM TAIL — text df-tools carries
 * rather than reads. `handoff create <command...>` joins its tail into a
 * command line handed to the user's shell, so a `--help` in it belongs to THAT
 * command, not to df-tools.
 *
 * Issue #100 finding 6: the global scan was flat, so
 * `df-tools handoff create gh auth login --help` printed df-tools' handoff
 * usage, exited 0, and queued NOTHING — the handoff silently never happened.
 * Mapped `command -> subcommands`; the tail starts after the subcommand.
 */
const FREEFORM_TAIL = {
  'handoff': new Set(['create']),
};

/**
 * The index at which the dispatcher's scan for a help flag must STOP: the
 * start of a free-form tail, or a literal `--`, whichever comes first.
 *
 * The tail's FIRST token is still scanned: `handoff create --help` forwards no
 * command at all (a shell line cannot begin with `--help`), so there it really
 * is a question. From the second token on — `handoff create gh auth login
 * --help` — the flag is addressed to the command being carried. A literal `--`
 * ends the flag region unconditionally, tail or no tail.
 */
function helpScanLimit(args) {
  let limit = args.length;
  const tail = FREEFORM_TAIL[args[0]];
  if (tail && tail.has(args[1])) limit = Math.min(limit, 3);
  const dashdash = args.indexOf('--');
  if (dashdash !== -1) limit = Math.min(limit, dashdash);
  return limit;
}

/**
 * Is a help flag addressed to df-tools ITSELF? Unlike `hasHelpFlag` (which a
 * subcommand uses on its own argv, where every token is its own), this stops
 * at anything df-tools is only carrying.
 */
function hasTopLevelHelpFlag(args) {
  return args.slice(0, helpScanLimit(args)).some(a => HELP_FLAGS.has(a));
}

function topLevelUsage() {
  const names = Object.keys(COMMANDS).sort();
  const width = names.reduce((w, n) => Math.max(w, n.length), 0);
  const lines = [
    'Usage: df-tools [--cwd <dir>] <command> [args] [--raw]',
    '  --cwd <dir>  run as if started in <dir> (resolved against the current directory)',
    '',
    'Run `df-tools <command> --help` for a command\'s own usage.',
    '(*) marks a command that writes to disk or to git.',
    '',
    'Commands:',
  ];
  for (const name of names) {
    const c = COMMANDS[name];
    const mark = c.mutates ? ' *' : '  ';
    lines.push(`  ${name.padEnd(width)}${mark}  ${c.summary}`);
  }
  return lines.join('\n') + '\n';
}

function commandUsage(name) {
  const c = COMMANDS[name];
  if (!c) return null;
  const lines = [`Usage: ${c.usage}`, '', c.summary];
  if (c.mutates) lines.push('', 'This command WRITES (disk and/or git).');
  // `details` is an array of lines OR one string. Spreading a string would push one
  // character per line (it did, for upgrade and adopt), so normalize first.
  if (c.details) lines.push('', ...[].concat(c.details));
  return lines.join('\n') + '\n';
}

/**
 * Print help for `name` (or the top-level listing) and exit 0.
 * Never returns.
 */
function printHelp(name) {
  const text = (name && commandUsage(name)) || topLevelUsage();
  process.stdout.write(text);
  process.exit(0);
}

module.exports = {
  COMMANDS, HELP_FLAGS, OWN_HELP, FREEFORM_TAIL,
  ownsHelp, hasHelpFlag, hasTopLevelHelpFlag, helpScanLimit,
  topLevelUsage, commandUsage, printHelp,
};
