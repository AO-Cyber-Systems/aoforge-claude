#!/usr/bin/env node

/**
 * AOForge Tools — CLI utility for AOForge workflow operations
 *
 * Replaces repetitive inline bash patterns across ~50 AOForge command/workflow/agent files.
 * Centralizes: config parsing, model resolution, objective lookup, git commits, summary verification.
 *
 * Usage: node aof-tools.cjs <command> [args] [--raw]
 *   A writing command exits 1 on an unknown flag, before it runs (lib/flag-guard.cjs, lib/flag-spec.cjs).
 *
 * Help:
 *   aof-tools --help                    List every command (writing ones marked *)
 *   aof-tools <command> --help          Usage for one command
 *   `--help`/`-h` is answered by the dispatcher BEFORE the switch, so no
 *   subcommand can ever receive it as data (issue #87).
 *
 * Atomic Commands:
 *   state load                         Load project config + state
 *   state update <field> <value>       Update a STATE.md field
 *   state get [section]                Get STATE.md content or section
 *   state patch --field val ...        Batch update STATE.md fields
 *   state rekey --from <old> [--to <new>] [--dry-run]
 *                                      Copy repo-keyed runtime state from a moved
 *                                      checkout's old key to its new key
 *   resolve-model <agent-type>         Get model for agent based on profile
 *   find-objective <objective>                 Find objective directory by number
 *   commit <message> [--files f1 f2]   Commit planning docs. A message starting
 *                                      with `--` is refused; with no --files the
 *                                      commit is scoped to `.aoforge/` alone.
 *   verify-summary <path>              Verify a SUMMARY.md file
 *   generate-slug <text>               Convert text to URL-safe slug
 *   current-timestamp [format]         Get timestamp (full|date|filename)
 *   list-todos [area]                  Count and enumerate pending todos
 *   verify-path-exists <path>          Check file/directory existence
 *   config-ensure-section              Initialize .aoforge/config.json
 *   history-digest                     Aggregate all SUMMARY.md data
 *   summary-extract <path> [--fields]  Extract structured data from SUMMARY.md
 *   state-snapshot                     Structured parse of STATE.md
 *   objective-job-index <objective>           Index plans with waves and status
 *   websearch <query>                  Search web via Brave API (if configured)
 *     [--limit N] [--freshness day|week|month]
 *
 * Objective Operations:
 *   objective next-decimal <objective>         Calculate next decimal objective number
 *   objective add <description>            Append new objective to roadmap + create dir
 *   objective insert <after> <description> Insert decimal objective after existing
 *   objective remove <objective> [--force] [--confirm]  Dry-run by default; --confirm executes delete + renumber
 *   objective complete <objective>             Mark objective done, update state + roadmap
 *
 * Roadmap Operations:
 *   roadmap get-objective <objective>          Extract objective section from ROADMAP.md
 *   roadmap analyze                    Full roadmap parse with disk status
 *   roadmap update-job-progress <N>   Update progress table row from disk (TRD/JOB vs SUMMARY counts)
 *
 * Requirements Operations:
 *   requirements mark-complete <ids>   Mark requirement IDs as complete in REQUIREMENTS.md
 *                                      Accepts: REQ-01,REQ-02 or REQ-01 REQ-02 or [REQ-01, REQ-02]
 *
 * Milestone Operations:
 *   milestone complete <version>       Archive milestone, create MILESTONES.md
 *     [--name <name>]
 *     [--archive-objectives]               Move objective dirs to milestones/vX.Y-objectives/
 *     [--dry-run]                          Print the plan, write nothing
 *
 * Workstreams:
 *   workstreams analyze                 Analyze ROADMAP.md deps for parallel workstreams
 *   workstreams provision <id> <path>   Copy .aoforge/ to worktree with filtering
 *   workstreams reconcile               Regenerate .aoforge/ state after merge
 *
 * Validation:
 *   validate consistency               Check objective numbering, disk/roadmap sync
 *   validate health [--repair]         Check .aoforge/ integrity, optionally repair
 *   validate requirements [--objective N]  SUMMARY requirements-completed vs VERIFICATION
 *
 * Progress:
 *   progress [json|table|bar]          Render progress in various formats
 *
 * Todos:
 *   todo complete <filename>           Move todo from pending to completed
 *   todo sync --session <id>           Merge a session's todos into the archive
 *
 * Scaffolding:
 *   scaffold context --objective <N>       Create CONTEXT.md template
 *   scaffold uat --objective <N>           Create UAT.md template
 *   scaffold verification --objective <N>  Create VERIFICATION.md template
 *   scaffold objective-dir --objective <N>     Create objective directory
 *     --name <name>
 *
 * Frontmatter CRUD:
 *   frontmatter get <file> [--field k] Extract frontmatter as JSON
 *   frontmatter set <file> --field k   Update single frontmatter field
 *     --value jsonVal
 *   frontmatter merge <file>           Merge JSON into frontmatter
 *     --data '{json}'
 *   frontmatter validate <file>        Validate required fields
 *     --schema job|summary|verification
 *
 * Verification Suite:
 *   verify job-structure <file>       Check TRD.md/JOB.md structure + tasks
 *   verify objective-completeness <objective>  Check all jobs have summaries
 *   verify references <file>           Check @-refs + paths resolve
 *   verify commits <h1> [h2] ...      Batch verify commit hashes
 *   verify artifacts <job-file>       Check must_haves.artifacts
 *   verify key-links <job-file>       Check must_haves.key_links
 *   verify api-contract <trd-path>    SHA drift for api_contract: block (advisory; exits 0)
 *   verify trd-pre <objective>        Cheap pre-flight: req coverage, task completeness,
 *                                       dep cycles, scope counts (pure-logic, no agent spawn)
 *   verify flutter-ui-bootstrap <project-dir>  Check Flutter UI testing infra
 *                                       (pubspec/integration_test/.maestro/test_driver/marker)
 *   verify flutter-state-coverage <trd-path>  Check Flutter UI artifact state coverage via regex catalog
 *
 * Skill Lifecycle:
 *   skill-active --start <name>        Mark skill as active (writes .aoforge/.skill-active)
 *   skill-active --end                 Mark skill as ended (removes .aoforge/.skill-active)
 *   skill-active --status              Show active skill marker (or {active:false})
 *
 * Merge Driver:
 *   merge-driver install [--check]     Register the state.json (JSON-aware) and STATE_ARCHIVE.md (union)
 *                                      merges in info/attributes + repo-local config (never committed)
 *   merge-driver uninstall             Undo install (removes only the managed block and config section)
 *   merge-driver resolve <path>        Resolve a stopped merge's state.json / STATE_ARCHIVE.md from the index
 *   merge-driver state-json <b> <o> <t>  The git merge driver entry point (writes <o>)
 *
 * Detection:
 *   detect novel-domain <objective>   Detect if objective crosses research boundary
 *     [--raw]                           Returns { novel, signals, recommendation }
 *                                       Signals: new_dep, missing_patterns, comparison_keyword
 *   detect flutter-ui-scope <objective>  Detect Flutter UI scope (sets type=ui semantics in planner)
 *     [--raw]                           Returns { detected, signals, platform, state_management, evidence }
 *
 * UAT Generation:
 *   generate uat <objective>           Auto-generate 1-page UAT.md checklist from TRDs + Maestro flows
 *     [--raw]                           (mobile-only) + flutter drive web instructions. Writes to
 *                                       .aoforge/objectives/<obj-dir>/<obj>-UAT.md. Refuses to
 *                                       overwrite a UAT.md already in use (non-pending results).
 *
 * Template Fill:
 *   template fill summary --objective N    Create pre-filled SUMMARY.md
 *     [--job M] [--name "..."]
 *     [--fields '{json}']
 *   template fill job --objective N       Create pre-filled TRD.md (or JOB.md)
 *     [--job M] [--type execute|tdd]
 *     [--wave N] [--fields '{json}']
 *   template fill verification         Create pre-filled VERIFICATION.md
 *     --objective N [--fields '{json}']
 *
 * State Progression:
 *   state advance-job [--objective <N>]   Record TRD progress (position from disk with --objective)
 *   state record-metric --objective N      Record execution metrics
 *     --job M --duration Xmin
 *     [--tasks N] [--files N]
 *   state update-progress              Recalculate progress bar
 *   state add-decision --summary "..."  Add decision to STATE.md
 *     [--objective N] [--rationale "..."]
 *   state add-blocker --text "..."     Add blocker
 *   state resolve-blocker --text "..." Remove blocker
 *   state record-session               Update session continuity
 *     --stopped-at "..."
 *     [--resume-file path]
 *
 * Estimation data:
 *   tokens trd <trd-id>                Executor token totals of one TRD from transcripts
 *     [--objective-dir d] [--repo p] [--root dir]   (read-only; exit 0 even when none is found)
 *   tokens stamp <trd-id> --draft <path>  Write tokens_input/tokens_output/... into a SUMMARY draft
 *     [--objective-dir d] [--repo p] [--root dir]   (a draft inside .aoforge/ is refused; run before summary post)
 *   tokens backfill [--write] [--force]  Recover token usage for historical SUMMARYs from surviving transcripts
 *     [--repo p] [--root dir]            (dry run unless --write: counts recovered/unrecovered by reason, changes no file;
 *                                         --write stamps through summary post; --force restamps already stamped SUMMARYs)
 *   tokens coverage [--milestone v | --objective N]  Forward-stamp coverage (live/counted) of TRD SUMMARYs; read-only
 *     [--repo p] [--root dir]            (default scope: the current milestone; exit 0 for every report)
 *   calibrate [--paths a,b] [--out f]  Build per-task-class medians/P90s (minutes, tokens, dollars) into calibration.json
 *     [--rates f] [--root dir | --no-overhead] [--window <N|all>]
 *     [--minutes <task_sum|trd_level>] [--through <N>] [--dry-run]
 *                                      (default out: AOFORGE_CALIBRATION_PATH or ~/.claude/aoforge/calibration.json;
 *                                       default paths: the checkout holding cwd or AOFORGE_CALIBRATE_PATHS;
 *                                       --root: transcripts for agent overhead, default ~/.claude/projects;
 *                                       --no-overhead skips that scan;
 *                                       --window <N|all>: keep only the N most recent objectives with samples per project;
 *                                       default: the most recent 10 objectives, --window all keeps all history;
 *                                       --minutes <task_sum|trd_level>: how an estimate builds a TRD's minutes (default trd_level);
 *                                       --through <N>: drop objectives numbered above N before anything is read or counted;
 *                                       the file names both in its `method` block)
 *   estimate task (--files a[,b] [--tdd] [--trd-type t] | --class c | --checkpoint)
 *                                      Median and P90 minutes, tokens and dollars for one task, with sample count and confidence
 *   estimate trd <trd-id|path>         The composed estimate of one TRD
 *   estimate objective <N> [--all] [--table|--line]
 *                                      What is left of an objective: waves, verifier, gap-closure factor (--all also counts done TRDs)
 *   estimate milestone [vX.Y] [--table|--line]
 *                                      What is left of a milestone (default: the current one)
 *   estimate start <N>                 Estimate an objective's remaining TRDs and record the run state the status line reads
 *   estimate wave <N> <wave> (--start|--done)
 *                                      Record a wave's timing; --done prints actual against the estimate with a verdict
 *   estimate finish <N>                Print the objective's execution time against its estimate (idempotent)
 *   estimate backtest <N[,N...]>       Compare each listed objective's estimate with its measured actuals and print the EST-08 verdict
 *                                      (JSON, or the markdown report with --raw; finished runs come from the run history)
 *     (every estimate verb: [--calibration f] [--raw]; default calibration: AOFORGE_CALIBRATION_PATH or
 *      ~/.claude/aoforge/calibration.json; run state: AOFORGE_ESTIMATE_STATE_DIR or ~/.claude/aoforge/state/estimates;
 *      exit 0 even when there is no estimate (`No estimate: <reason>`), exit 1 for usage errors and unknown objectives/TRDs)
 *
 * UI Metrics:
 *   ui metrics baseline [--since D] [--paths p1,p2] [--out f]  Fix/feat commit baseline JSON for UI paths
 *
 * UI Surface Specs:
 *   ui spec validate <file> [--patterns catalogue.json]  Static invariants (§4.5)
 *     EXIT 0 checked and clean · 1 a real violation · 2 clean, but a check DID NOT RUN.
 *     `render`, `sheet` and `lock` share the three codes; on those, 2 still produced the
 *     artifact. Only 1 refuses.
 *
 * Compound Commands (workflow-specific initialization):
 *   init execute-objective <objective>         All context for execute-objective workflow
 *   init plan-objective <objective>            All context for plan-objective workflow
 *   init new-project                   All context for new-project workflow
 *   init new-milestone                 All context for new-milestone workflow
 *   init quick <description>           All context for quick workflow
 *   init resume                        All context for resume-project workflow
 *   init verify-work <objective>           All context for verify-work workflow
 *   init objective-op <objective>              Generic objective operation context
 *   init todos [area]                  All context for todo workflows
 *   init milestone-op                  All context for milestone operations
 *   init map-codebase                  All context for map-codebase workflow
 *   init security-audit                All context for security-audit workflow
 *   init progress                      All context for progress workflow
 */

'use strict';

// ─── Module Imports ───────────────────────────────────────────────────────────

// Objective 72: the legacy environment prefix keeps working for one release (the new prefix
// wins when both are set). First, so no module below reads the environment before it runs.
require('./lib/compat.cjs').aliasLegacyEnv();

const { error, parseIncludeFlag } = require('./lib/helpers.cjs');
const { cmdConfigEnsureSection, cmdConfigSet, cmdConfigGet } = require('./lib/config.cjs');
const {
  cmdStateLoad, cmdStateGet, cmdStatePatch, cmdStateUpdate, cmdStateAdvanceJob,
  cmdStateRecordMetric, cmdStateUpdateProgress, cmdStateAddDecision, cmdStateAddBlocker,
  cmdStateResolveBlocker, cmdStateRecordSession, cmdStateSnapshot,
} = require('./lib/state.cjs');
const {
  cmdFrontmatterGet, cmdFrontmatterSet, cmdFrontmatterMerge, cmdFrontmatterValidate,
} = require('./lib/frontmatter.cjs');
const {
  cmdFindObjective, cmdObjectiveNextDecimal, cmdObjectivesList,
  cmdObjectiveAdd, cmdObjectiveInsert, cmdObjectiveRemove, cmdObjectiveComplete,
} = require('./lib/objective.cjs');
const {
  cmdRoadmapGetObjective, cmdRoadmapAnalyze, cmdRoadmapUpdateJobProgress,
  cmdMilestoneComplete, cmdProgressRender,
} = require('./lib/roadmap.cjs');
const { cmdTemplateSelect, cmdTemplateFill } = require('./lib/templates.cjs');
const {
  cmdVerifySummary, cmdVerifyJobStructure, cmdVerifyObjectiveCompleteness,
  cmdVerifyReferences, cmdVerifyCommits, cmdVerifyArtifacts, cmdVerifyKeyLinks,
} = require('./lib/verify.cjs');
const { cmdVerifyTrdPre } = require('./lib/trd-pre-check.cjs');
const { cmdVerifyApiContract } = require('./lib/api-contract.cjs');
const { cmdVerifyFlutterUIBootstrap } = require('./lib/flutter-ui-bootstrap.cjs');
const { cmdFlutterUISetup } = require('./lib/flutter-ui-setup.cjs');
const { cmdFlutterUIEvalBootstrap } = require('./lib/flutter-ui-eval-bootstrap.cjs');
const { cmdVerifyFlutterStateCoverage } = require('./lib/flutter-state-coverage.cjs');
const { cmdVerifyFlutterUIEval } = require('./lib/flutter-ui-eval.cjs');
const { cmdDesignReview } = require('./lib/flutter-ui-design-review.cjs');
const { cmdUiMetrics } = require('./lib/ui-metrics.cjs');
const { cmdUiSpec, cmdUiSheet, cmdUiLock } = require('./lib/ui-spec-cli.cjs');
const { cmdDetectNovelDomain } = require('./lib/novel-domain.cjs');
const { cmdDetectBrownfieldMap } = require('./lib/brownfield-detector.cjs');
const { cmdDetectFlutterUIScope } = require('./lib/flutter-ui-scope.cjs');
const { cmdValidateConsistency, cmdValidateHealth, cmdValidateDocs, cmdValidateRequirements } = require('./lib/validate.cjs');
const {
  cmdResolveModel, cmdInitExecuteObjective, cmdInitPlanObjective, cmdInitNewProject,
  cmdInitNewMilestone, cmdInitQuick, cmdInitResume, cmdInitVerifyWork, cmdInitObjectiveOp,
  cmdInitTodos, cmdInitMilestoneOp, cmdInitMapCodebase, cmdInitSecurityAudit, cmdInitProgress,
} = require('./lib/init.cjs');
const intent = require('./lib/intent.cjs');
const migrate = require('./lib/migrate.cjs');
const {
  cmdWorkstreamsAnalyze, cmdWorkstreamsProvision, cmdWorkstreamsReconcile,
} = require('./lib/workstreams.cjs');
const {
  cmdGhStatus, cmdGhSyncObjectives, cmdGhComment, cmdGhCloseIssue, cmdGhSyncRelease,
  cmdGhResolve, cmdGhSync,
} = require('./lib/gh.cjs');
const {
  cmdChangelogUpdate, cmdChangelogCheck,
} = require('./lib/changelog.cjs');
const { cmdSkillActive } = require('./lib/skill-active.cjs');
const { cmdAwarenessRoute } = require('./lib/awareness-cli.cjs');
const { cmdOrgAwarenessRoute } = require('./lib/org-awareness-cli.cjs');
const { cmdDupDetectRoute } = require('./lib/dup-detect-cli.cjs');
const { cmdInitiativesRoute } = require('./lib/initiatives-cli.cjs');
const { cmdCheckTodosRoute } = require('./lib/check-todos-cli.cjs');
const { cmdSyncRoadmapRoute } = require('./lib/roadmap-reconcile-cli.cjs');
const { cmdTuiRoute } = require('./lib/tui-cli.cjs');
const { cmdSurveyDecimalObjectives } = require('./lib/decimal-survey.cjs');
const {
  cmdGenerateSlug, cmdCurrentTimestamp, cmdListTodos, cmdVerifyPathExists,
  cmdHistoryDigest, cmdObjectiveJobIndex, cmdSummaryExtract, cmdWebsearch,
  cmdCommit, cmdTodoComplete, cmdScaffold, cmdRequirementsMarkComplete,
} = require('./lib/misc.cjs');
const {
  cmdHandoffCreate, cmdHandoffComplete, cmdHandoffList, cmdHandoffGet,
} = require('./lib/handoff.cjs');
const {
  cmdTrdTddInspect,
} = require('./lib/trd-tdd.cjs');
const { cmdMicro } = require('./lib/micro.cjs');
const { cmdProjectDecline, cmdProjectAccept } = require('./lib/decline-tracker.cjs');
const { cmdProjectState } = require('./lib/project-state.cjs');
const { cmdGlobalConfig } = require('./lib/global-config.cjs');
const { cmdExecContextRoute } = require('./lib/exec-context.cjs');
const { cmdMergeDriver } = require('./lib/merge-driver-cli.cjs');
const {
  hasTopLevelHelpFlag, ownsHelp, HELP_FLAGS, printHelp, topLevelUsage, COMMANDS: HELP_TABLE,
} = require('./lib/help.cjs');
const { cmdGenerateUAT } = require('./lib/uat-generator.cjs');
const { extractCwdFlag } = require('./lib/cwd-flag.cjs');
const { checkFlags, formatUnknownFlag } = require('./lib/flag-guard.cjs');
const { FLAG_SPEC } = require('./lib/flag-spec.cjs');

// ─── CLI Router ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  // ── Global `--cwd <dir>` (issue 37-02) — chdir BEFORE dispatch, so every
  // subcommand below (including the `--help` pre-switch right after this) sees
  // <dir> as its cwd. Must run before `const command = args[0]` reads the
  // post-flag command name.
  const cwdFlag = extractCwdFlag(args, { originalCwd: process.cwd() });
  if (cwdFlag.error) { process.stderr.write(`Error: ${cwdFlag.error}\n`); process.exit(1); }
  if (cwdFlag.dir) process.chdir(cwdFlag.dir);
  args.splice(0, args.length, ...cwdFlag.args);

  const command = args[0];
  const cwd = process.cwd();

  // ── `--help` is a question, never an instruction (issue #87) ───────────────
  // Answered BEFORE the switch, so no subcommand can take a help flag ADDRESSED
  // TO AOF-TOOLS as data. `aof-tools commit --help` used to take '--help' as the
  // commit MESSAGE and commit whatever was dirty; a per-subcommand fix would
  // have left the same hole open in the next subcommand added.
  //
  // Two boundaries the first cut of this got wrong (issue #100):
  //   - Some argv is CARRIED, not read: `handoff create <command...>` hands its
  //     tail to the user's shell, so `--help` there is the forwarded command's.
  //     `hasTopLevelHelpFlag` stops at that tail (and at a literal `--`).
  //   - A handful of commands print their own, richer help (which judge modes
  //     are binding, which scope a scaffold writes to). Those are delegated to
  //     — each honours a help flag at ANY argv position and returns before
  //     doing any work, which help-delegation.test.cjs enforces in every form
  //     (`<cmd> [<sub>] [<positional>] --help|-h`).
  if (hasTopLevelHelpFlag(args) && !ownsHelp(args)) {
    const name = command && !HELP_FLAGS.has(command) ? command : null;
    // A help flag on a name that is not a command is a TYPO, not a question
    // (issue #100 finding 7). Fall through to the `default:` arm, which names
    // it and exits 1, rather than printing the listing and reporting success.
    if (!name || HELP_TABLE[name]) printHelp(name);
  }

  // No command named at all. A script building a command name dynamically that
  // produced an empty one must not read `rc=0` (issue #100 finding 7); this is
  // the exit 1 the pre-#87 `error(...)` path gave.
  if (!command) {
    process.stderr.write(topLevelUsage());
    process.exit(1);
  }

  // ── A writing command rejects a flag it does not know (TOOL-01) ─────────────
  // The same shape as the `--help` pre-switch above (issue #87): answered ONCE, here, before any subcommand runs, so no
  // arm can ignore a typo and carry on writing (`milestone complete v1.0 --dry-runn` used to archive the milestone) and
  // the next command added is guarded without remembering to. FLAG_SPEC (lib/flag-spec.cjs) lists what each writer
  // accepts; a command help.cjs does not mark `mutates: true`, or that has no entry, is not checked here.
  if (HELP_TABLE[command] && HELP_TABLE[command].mutates) {
    const unknownFlag = checkFlags(args, FLAG_SPEC);
    if (unknownFlag) error(formatUnknownFlag(unknownFlag));
  }

  switch (command) {
    case 'state': {
      const subcommand = args[1];
      if (subcommand === 'update') {
        cmdStateUpdate(cwd, args[2], args[3]);
      } else if (subcommand === 'get') {
        cmdStateGet(cwd, args[2], raw);
      } else if (subcommand === 'patch') {
        const patches = {};
        for (let i = 2; i < args.length; i += 2) {
          const key = args[i].replace(/^--/, '');
          const value = args[i + 1];
          if (key && value !== undefined) {
            patches[key] = value;
          }
        }
        cmdStatePatch(cwd, patches, raw);
      } else if (subcommand === 'advance-job') {
        const objectiveIdx = args.indexOf('--objective');
        const objective = objectiveIdx !== -1 ? args[objectiveIdx + 1] : null;
        if (objectiveIdx !== -1 && (!objective || objective.startsWith('--'))) {
          error('state advance-job --objective requires an objective number, e.g. --objective 59');
        }
        cmdStateAdvanceJob(cwd, { objective }, raw);
      } else if (subcommand === 'record-metric') {
        const objectiveIdx = args.indexOf('--objective');
        const jobIdx = args.indexOf('--job');
        const durationIdx = args.indexOf('--duration');
        const tasksIdx = args.indexOf('--tasks');
        const filesIdx = args.indexOf('--files');
        cmdStateRecordMetric(cwd, {
          objective: objectiveIdx !== -1 ? args[objectiveIdx + 1] : null,
          job: jobIdx !== -1 ? args[jobIdx + 1] : null,
          duration: durationIdx !== -1 ? args[durationIdx + 1] : null,
          tasks: tasksIdx !== -1 ? args[tasksIdx + 1] : null,
          files: filesIdx !== -1 ? args[filesIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'update-progress') {
        cmdStateUpdateProgress(cwd, raw);
      } else if (subcommand === 'add-decision') {
        const objectiveIdx = args.indexOf('--objective');
        const summaryIdx = args.indexOf('--summary');
        const rationaleIdx = args.indexOf('--rationale');
        cmdStateAddDecision(cwd, {
          objective: objectiveIdx !== -1 ? args[objectiveIdx + 1] : null,
          summary: summaryIdx !== -1 ? args[summaryIdx + 1] : null,
          rationale: rationaleIdx !== -1 ? args[rationaleIdx + 1] : '',
        }, raw);
      } else if (subcommand === 'add-blocker') {
        const textIdx = args.indexOf('--text');
        cmdStateAddBlocker(cwd, textIdx !== -1 ? args[textIdx + 1] : null, raw);
      } else if (subcommand === 'resolve-blocker') {
        const textIdx = args.indexOf('--text');
        cmdStateResolveBlocker(cwd, textIdx !== -1 ? args[textIdx + 1] : null, raw);
      } else if (subcommand === 'record-session') {
        const stoppedIdx = args.indexOf('--stopped-at');
        const resumeIdx = args.indexOf('--resume-file');
        cmdStateRecordSession(cwd, {
          stopped_at: stoppedIdx !== -1 ? args[stoppedIdx + 1] : null,
          resume_file: resumeIdx !== -1 ? args[resumeIdx + 1] : 'None',
        }, raw);
      } else if (subcommand === 'rekey') {
        // TRD 72-07 (INST-06): copy repo-keyed runtime state from a moved checkout's old key to its new key; never deletes.
        const { output: outputRekey } = require('./lib/helpers.cjs');
        const { runStateRekey } = require('./lib/state-rekey.cjs');
        const os = require('os');
        const r = runStateRekey({ argv: args.slice(2), cwd, userHome: os.homedir(), tmpDir: os.tmpdir() });
        if (!r.ok) error(r.message);
        outputRekey(r.result, raw, r.text);
      } else {
        cmdStateLoad(cwd, raw);
      }
      break;
    }

    case 'resolve-model': {
      cmdResolveModel(cwd, args[1], raw);
      break;
    }

    case 'find-objective': {
      cmdFindObjective(cwd, args[1], raw);
      break;
    }

    case 'commit': {
      const amend = args.includes('--amend');
      const message = args[1];
      // A message starting with `--` is a mistyped flag far more often than an
      // intended subject line (issue #87). Refuse rather than commit under it.
      if (typeof message === 'string' && message.startsWith('--') && message !== '--') {
        error(`Refusing to commit with '${message}' as the message — that looks like a flag, not a subject.\nRun \`aof-tools commit --help\` for usage.`);
      }
      // Parse --files flag (collect args after --files, stopping at other flags)
      const filesIndex = args.indexOf('--files');
      const files = filesIndex !== -1 ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];
      cmdCommit(cwd, message, files, raw, amend);
      break;
    }

    case 'verify-summary': {
      const summaryPath = args[1];
      const countIndex = args.indexOf('--check-count');
      const checkCount = countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 2;
      cmdVerifySummary(cwd, summaryPath, checkCount, raw);
      break;
    }

    case 'template': {
      const subcommand = args[1];
      if (subcommand === 'select') {
        cmdTemplateSelect(cwd, args[2], raw);
      } else if (subcommand === 'fill') {
        const templateType = args[2];
        const objectiveIdx = args.indexOf('--objective');
        const jobIdx = args.indexOf('--job');
        const nameIdx = args.indexOf('--name');
        const typeIdx = args.indexOf('--type');
        const waveIdx = args.indexOf('--wave');
        const fieldsIdx = args.indexOf('--fields');
        cmdTemplateFill(cwd, templateType, {
          objective: objectiveIdx !== -1 ? args[objectiveIdx + 1] : null,
          job: jobIdx !== -1 ? args[jobIdx + 1] : null,
          name: nameIdx !== -1 ? args[nameIdx + 1] : null,
          type: typeIdx !== -1 ? args[typeIdx + 1] : 'execute',
          wave: waveIdx !== -1 ? args[waveIdx + 1] : '1',
          fields: fieldsIdx !== -1 ? JSON.parse(args[fieldsIdx + 1]) : {},
        }, raw);
      } else {
        error('Unknown template subcommand. Available: select, fill');
      }
      break;
    }

    case 'frontmatter': {
      const subcommand = args[1];
      const file = args[2];
      if (subcommand === 'get') {
        const fieldIdx = args.indexOf('--field');
        cmdFrontmatterGet(cwd, file, fieldIdx !== -1 ? args[fieldIdx + 1] : null, raw);
      } else if (subcommand === 'set') {
        const fieldIdx = args.indexOf('--field');
        const valueIdx = args.indexOf('--value');
        cmdFrontmatterSet(cwd, file, fieldIdx !== -1 ? args[fieldIdx + 1] : null, valueIdx !== -1 ? args[valueIdx + 1] : undefined, raw);
      } else if (subcommand === 'merge') {
        const dataIdx = args.indexOf('--data');
        cmdFrontmatterMerge(cwd, file, dataIdx !== -1 ? args[dataIdx + 1] : null, raw);
      } else if (subcommand === 'validate') {
        const schemaIdx = args.indexOf('--schema');
        cmdFrontmatterValidate(cwd, file, schemaIdx !== -1 ? args[schemaIdx + 1] : null, raw);
      } else {
        error('Unknown frontmatter subcommand. Available: get, set, merge, validate');
      }
      break;
    }

    case 'verify': {
      const subcommand = args[1];
      if (subcommand === 'job-structure') {
        cmdVerifyJobStructure(cwd, args[2], raw);
      } else if (subcommand === 'objective-completeness') {
        cmdVerifyObjectiveCompleteness(cwd, args[2], raw);
      } else if (subcommand === 'references') {
        cmdVerifyReferences(cwd, args[2], raw);
      } else if (subcommand === 'commits') {
        cmdVerifyCommits(cwd, args.slice(2), raw);
      } else if (subcommand === 'artifacts') {
        cmdVerifyArtifacts(cwd, args[2], raw);
      } else if (subcommand === 'key-links') {
        cmdVerifyKeyLinks(cwd, args[2], raw);
      } else if (subcommand === 'trd-pre') {
        cmdVerifyTrdPre(cwd, args[2], raw);
      } else if (subcommand === 'api-contract') {
        // verify api-contract <trd-path> [--raw]
        cmdVerifyApiContract(cwd, args[2], raw);
      } else if (subcommand === 'flutter-ui-bootstrap') {
        // verify flutter-ui-bootstrap <project-dir> [--raw]
        cmdVerifyFlutterUIBootstrap(cwd, args[2], raw);
      } else if (subcommand === 'flutter-state-coverage') {
        // verify flutter-state-coverage <trd-path> [--raw]
        cmdVerifyFlutterStateCoverage(cwd, args[2], raw);
      } else if (subcommand === 'flutter-ui-eval') {
        // verify flutter-ui-eval <manifest|captureResults> [--raw]
        cmdVerifyFlutterUIEval(cwd, args.slice(2), raw);
      } else {
        error('Unknown verify subcommand. Available: job-structure, objective-completeness, references, commits, artifacts, key-links, trd-pre, api-contract, flutter-ui-bootstrap, flutter-state-coverage, flutter-ui-eval');
      }
      break;
    }

    case 'flutter-ui': {
      // flutter-ui setup [--print-only] [--auto] [--raw]
      //   One-command adoption: detect missing system tools, build install plan,
      //   dispatch via handoff (daemon live) or print (daemon down), chain bootstrap.
      const subcommand = args[1];
      if (subcommand === 'setup') {
        cmdFlutterUISetup(cwd, args.slice(2), raw);
      } else if (subcommand === 'eval') {
        // flutter-ui eval <manifest|captureResults> [--raw]
        cmdVerifyFlutterUIEval(cwd, args.slice(2), raw);
      } else if (subcommand === 'bootstrap') {
        // flutter-ui bootstrap [project-dir] [--raw]
        cmdFlutterUIEvalBootstrap(cwd, args[2], raw, args.slice(2));
      } else if (subcommand === 'design-review') {
        // flutter-ui design-review <manifest> [--live] [--raw]
        cmdDesignReview(cwd, args.slice(2), raw);
      } else {
        error('Unknown flutter-ui subcommand. Available: setup, eval, bootstrap, design-review');
      }
      break;
    }

    case 'ui': {
      // ui metrics baseline [--since YYYY-MM-DD] [--paths p1,p2] [--out file]
      //   Classifies conventional-commit subjects on given paths and writes a
      //   fix/feat baseline JSON (W0-6, UI-process redesign "before" numbers).
      // ui spec validate <file> [--patterns <catalogue.json>]
      //   Validates a Surface Spec against the §4.5 static invariants. Prints the verdict
      //   JSON on stdout; the exit code is the gate (34-04), and it has THREE values:
      //     0  every check ran and nothing violated
      //     1  a real violation
      //     2  nothing violated, but one or more checks DID NOT RUN (a MISSING row)
      //   2 exists because `validate "$spec" || exit 1` cannot tell 0 from 0: before issue
      //   #90 an invariant that was never evaluated exited 0 and so read as verified. The
      //   payload carries `complete` and `unchecked` beside `ok` for the same reason.
      // ui sheet <spec> [--renders <dir>] [--refs <dir>] --out <file> [--patterns <c.json>]
      //   Writes the §8.3 static review sheet and prints {sheet_hash, out, states, missing,
      //   complete, unchecked}. Exits 2 when a declared state has no render or a spec check
      //   did not run — the sheet is still written; only an invalid spec (exit 1) refuses.
      //   `sheet_hash` is the sha256 of the canonical MODEL, never of the HTML — 34-07's
      //   look-lock anchors on it, and a hash that moved on a CSS tweak would train the lock
      //   out of existence. A declared state with no render is a MISSING cell, never a
      //   dropped row.
      // ui lock <spec> --sheet-hash <64 hex> --by <email> [--at YYYY-MM-DD]
      //   The §8.3 look-lock: writes `acceptance: {locked_sheet, locked_by, locked_at,
      //   locked_shape_hash, locked_section_hashes}` into the spec's OWN front matter, as a
      //   surgical text splice that leaves the prose body byte-identical. `locked_shape_hash`
      //   covers `{routes, controls, states}` and nothing else — §4.1's three keys — so a
      //   prose or `design_read` edit does NOT clear a human's approval and a control edit
      //   DOES. Refuses (exit 1, writes nothing) on an invalid spec, a `--sheet-hash` that is
      //   not 64 hex, or an absent `--by`. Exits 2 when the lock WAS written over a spec one
      //   of whose invariants never ran — a signature standing over an unchecked spec.
      const subcommand = args[1];
      if (subcommand === 'metrics') {
        cmdUiMetrics(cwd, args.slice(2), raw);
      } else if (subcommand === 'spec') {
        cmdUiSpec(cwd, args.slice(2), raw);
      } else if (subcommand === 'sheet') {
        cmdUiSheet(cwd, args.slice(2), raw);
      } else if (subcommand === 'lock') {
        cmdUiLock(cwd, args.slice(2), raw);
      } else {
        error('Unknown ui subcommand. Available: metrics, spec, sheet, lock');
      }
      break;
    }

    case 'detect': {
      const subcommand = args[1];
      if (subcommand === 'novel-domain') {
        // detect novel-domain <objective> [--raw]
        cmdDetectNovelDomain(cwd, args[2], raw);
      } else if (subcommand === 'brownfield-map') {
        // detect brownfield-map [<cwd>] [--raw]
        cmdDetectBrownfieldMap(cwd, args[2], raw);
      } else if (subcommand === 'flutter-ui-scope') {
        // detect flutter-ui-scope <objective> [--raw]
        cmdDetectFlutterUIScope(cwd, args[2], raw);
      } else {
        error('Unknown detect subcommand. Available: novel-domain, brownfield-map, flutter-ui-scope');
      }
      break;
    }

    case 'generate': {
      const subcommand = args[1];
      if (subcommand === 'uat') {
        // generate uat <objective> [--raw]
        // Auto-generates 1-page UAT checklist from TRDs + Maestro flows + flutter drive web rows.
        // Writes to .aoforge/objectives/<obj-dir>/<obj>-UAT.md
        cmdGenerateUAT(cwd, args[2], raw);
      } else {
        error('Unknown generate subcommand. Available: uat');
      }
      break;
    }

    case 'generate-slug': {
      cmdGenerateSlug(args[1], raw);
      break;
    }

    case 'current-timestamp': {
      cmdCurrentTimestamp(args[1] || 'full', raw);
      break;
    }

    case 'list-todos': {
      cmdListTodos(cwd, args[1], raw);
      break;
    }

    case 'verify-path-exists': {
      cmdVerifyPathExists(cwd, args[1], raw);
      break;
    }

    case 'config-ensure-section': {
      cmdConfigEnsureSection(cwd, raw);
      break;
    }

    case 'config-set': {
      cmdConfigSet(cwd, args[1], args[2], raw);
      break;
    }

    case 'config-get': {
      cmdConfigGet(cwd, args[1], raw);
      break;
    }

    case 'history-digest': {
      cmdHistoryDigest(cwd, raw);
      break;
    }

    case 'upgrade': {
      const { cmdUpgrade } = require('./lib/upgrade-cli.cjs');
      cmdUpgrade(cwd, args.slice(1), raw);
      break;
    }

    case 'adopt': {
      const { cmdAdopt } = require('./lib/adopt-cli.cjs');
      cmdAdopt(cwd, args.slice(1), raw);
      break;
    }

    case 'migrate': {
      const subcommand = args[1];
      if (subcommand === 'plan') {
        try {
          const result = migrate.plan({ projectRoot: cwd });
          process.stdout.write(JSON.stringify(result, null, 2));
          process.exit(0);
        } catch (e) {
          error(e.message);
        }
      } else if (subcommand === 'apply') {
        const kindIdx = args.indexOf('--kind');
        const defaultWorkIdx = args.indexOf('--default-work');
        const workChoicesIdx = args.indexOf('--work-choices');
        const dryRun = args.includes('--dry-run');
        let workChoices = {};
        if (workChoicesIdx !== -1 && args[workChoicesIdx + 1]) {
          try { workChoices = JSON.parse(args[workChoicesIdx + 1]); }
          catch { error('Invalid JSON for --work-choices'); }
        }
        try {
          const result = migrate.apply({
            projectRoot: cwd,
            kind: kindIdx !== -1 ? args[kindIdx + 1] : undefined,
            defaultWork: defaultWorkIdx !== -1 ? args[defaultWorkIdx + 1] : undefined,
            workChoices,
            dryRun,
          });
          process.stdout.write(JSON.stringify(result, null, 2));
          process.exit(0);
        } catch (e) {
          error(e.message);
        }
      } else {
        error('Unknown migrate subcommand. Available: plan, apply');
      }
      break;
    }

    case 'intent': {
      const subcommand = args[1];
      if (subcommand === 'resolve') {
        const objectiveIndex = args.indexOf('--objective');
        const trdIndex = args.indexOf('--trd');
        const options = {
          projectRoot: cwd,
          objectiveId: objectiveIndex !== -1 ? args[objectiveIndex + 1] : undefined,
          trdPath: trdIndex !== -1 ? args[trdIndex + 1] : undefined,
        };
        try {
          const result = intent.resolve(options);
          if (raw) {
            process.stdout.write(JSON.stringify(result));
          } else {
            process.stdout.write(JSON.stringify(result, null, 2));
          }
          process.exit(0);
        } catch (e) {
          error(e.message);
        }
      } else {
        error('Unknown intent subcommand. Available: resolve');
      }
      break;
    }

    case 'objectives': {
      const subcommand = args[1];
      if (subcommand === 'list') {
        const typeIndex = args.indexOf('--type');
        const objectiveIndex = args.indexOf('--objective');
        const options = {
          type: typeIndex !== -1 ? args[typeIndex + 1] : null,
          objective: objectiveIndex !== -1 ? args[objectiveIndex + 1] : null,
          includeArchived: args.includes('--include-archived'),
        };
        cmdObjectivesList(cwd, options, raw);
      } else {
        error('Unknown objectives subcommand. Available: list');
      }
      break;
    }

    case 'roadmap': {
      const subcommand = args[1];
      if (subcommand === 'get-objective') {
        cmdRoadmapGetObjective(cwd, args[2], raw);
      } else if (subcommand === 'analyze') {
        cmdRoadmapAnalyze(cwd, raw);
      } else if (subcommand === 'update-job-progress') {
        cmdRoadmapUpdateJobProgress(cwd, args[2], raw);
      } else {
        error('Unknown roadmap subcommand. Available: get-objective, analyze, update-job-progress');
      }
      break;
    }

    case 'requirements': {
      const subcommand = args[1];
      if (subcommand === 'mark-complete') {
        cmdRequirementsMarkComplete(cwd, args.slice(2), raw);
      } else {
        error('Unknown requirements subcommand. Available: mark-complete');
      }
      break;
    }

    case 'objective': {
      const subcommand = args[1];
      if (subcommand === 'next-decimal') {
        cmdObjectiveNextDecimal(cwd, args[2], raw);
      } else if (subcommand === 'add') {
        cmdObjectiveAdd(cwd, args.slice(2).join(' '), raw);
      } else if (subcommand === 'insert') {
        cmdObjectiveInsert(cwd, args[2], args.slice(3).join(' '), raw);
      } else if (subcommand === 'remove') {
        const forceFlag = args.includes('--force');
        const confirmFlag = args.includes('--confirm');
        cmdObjectiveRemove(cwd, args[2], { force: forceFlag, confirm: confirmFlag }, raw);
      } else if (subcommand === 'complete') {
        cmdObjectiveComplete(cwd, args[2], raw);
      } else if (subcommand === 'put' || subcommand === 'set-status') {
        // TRD 48-15: the planning verbs (logic in planning-verbs-cli.cjs).
        require('./lib/planning-verbs-cli.cjs').cmdObjectiveVerb(cwd, args.slice(1), raw);
      } else {
        error('Unknown objective subcommand. Available: next-decimal, add, insert, remove, complete, put, set-status');
      }
      break;
    }

    case 'milestone': {
      // milestone put | complete — TRD 48-15. Local `complete` runs cmdMilestoneComplete unchanged; store mode routes
      // to the entity verb.
      require('./lib/planning-verbs-cli.cjs').cmdMilestoneVerb(cwd, args.slice(1), raw);
      break;
    }

    // ── Planning verbs (TRD 48-15): one argument shape, `--from <path|->`, `--raw`; logic in planning-verbs-cli.cjs.
    case 'plan': {
      require('./lib/planning-verbs-cli.cjs').cmdPlan(cwd, args.slice(1), raw);
      break;
    }

    case 'summary': {
      require('./lib/planning-verbs-cli.cjs').cmdSummary(cwd, args.slice(1), raw);
      break;
    }

    case 'verification': {
      require('./lib/planning-verbs-cli.cjs').cmdVerification(cwd, args.slice(1), raw);
      break;
    }

    case 'doc': {
      require('./lib/planning-verbs-cli.cjs').cmdDoc(cwd, args.slice(1), raw);
      break;
    }

    case 'decision': {
      require('./lib/planning-verbs-cli.cjs').cmdDecision(cwd, args.slice(1), raw);
      break;
    }

    case 'debug': {
      require('./lib/planning-verbs-cli.cjs').cmdDebug(cwd, args.slice(1), raw);
      break;
    }

    case 'quick': {
      require('./lib/planning-verbs-cli.cjs').cmdQuick(cwd, args.slice(1), raw);
      break;
    }

    case 'validate': {
      const subcommand = args[1];
      if (subcommand === 'consistency') {
        cmdValidateConsistency(cwd, raw);
      } else if (subcommand === 'health') {
        const repairFlag = args.includes('--repair');
        cmdValidateHealth(cwd, { repair: repairFlag }, raw);
      } else if (subcommand === 'docs') {
        cmdValidateDocs(cwd, raw);
      } else if (subcommand === 'requirements') {
        const i = args.indexOf('--objective');
        const eq = args.find((a) => a.startsWith('--objective='));
        const objective = eq ? eq.slice('--objective='.length) : (i >= 0 ? args[i + 1] : null);
        cmdValidateRequirements(cwd, { objective }, raw);
      } else {
        error('Unknown validate subcommand. Available: consistency, health, docs, requirements');
      }
      break;
    }

    case 'telemetry': {
      // aof-tools telemetry [--scan [--limit N] [--since D] [--root R]] [--raw] — read-only summary
      // (TRD 31-01 module, wired in TRD 38-11, --scan and strict flags in TRD 61-04). Flag handling
      // lives in audit-cli.runTelemetry: every token is understood or an error.
      const os = require('os');
      const { output: outputTelemetry } = require('./lib/helpers.cjs');
      const { runTelemetry } = require('./lib/audit-cli.cjs');
      const r = runTelemetry({ argv: args.slice(1), cwd, userHome: os.homedir() });
      if (!r.ok) error(r.message);
      outputTelemetry(r.result, raw, r.text);
      break;
    }

    case 'doctor': {
      // aof-tools doctor [--fix] [--json] [--path <dir>] [--global] — TRD 45-04 (DOC-04).
      // Read-only unless --fix. Exit 0 for any completed run (the verdict is result.status);
      // exit 1 only for usage errors.
      const os = require('os');
      const { output: outputDoctor } = require('./lib/helpers.cjs');
      const { runDoctorCli } = require('./lib/doctor-cli.cjs');
      const r = runDoctorCli({ cwd, argv: args.slice(1), env: process.env, userHome: os.homedir() });
      if (!r.ok) error(r.message);
      if (r.json) outputDoctor(r.result, false);
      else outputDoctor(r.result, true, r.text);
      break;
    }

    case 'context': {
      // aof-tools context [--limit N] [--root <dir>] [--raw] — TRD 29-04 module, wired in TRD 39-01
      const { output: outputAudit } = require('./lib/helpers.cjs');
      const { runContext } = require('./lib/audit-cli.cjs');
      const r = runContext({ argv: args.slice(1) });
      if (!r.ok) error(r.message);
      outputAudit(r.result, raw, r.text);
      break;
    }

    case 'tokens': {
      // aof-tools tokens <trd|stamp|backfill> ... — TRD 57-03, backfill TRD 57-06
      const { output: outputTokens } = require('./lib/helpers.cjs');
      const { runTokens } = require('./lib/tokens-cli.cjs');
      const r = runTokens({ argv: args.slice(1), cwd });
      if (!r.ok) error(r.message);
      outputTokens(r.result, raw, r.text, r.exit || 0);
      break;
    }

    case 'calibrate': {
      // aof-tools calibrate [--paths a,b] [--out file] [--rates file] [--root dir | --no-overhead] [--window <N|all>] [--minutes <task_sum|trd_level>] [--through <N>] [--dry-run] — TRD 57-06, 58-03, 64-08, 67-02
      const { output: outputCalibrate } = require('./lib/helpers.cjs');
      const { runCalibrate } = require('./lib/calibrate-cli.cjs');
      const r = runCalibrate({ argv: args.slice(1), cwd, env: process.env });
      if (!r.ok) error(r.message);
      outputCalibrate(r.result, raw, r.text, r.exit || 0);
      break;
    }

    case 'estimate': {
      // aof-tools estimate <task|trd|objective|milestone|start|wave|finish|backtest> ... — TRD 58-08, backtest TRD 64-04
      const { output: outputEstimate } = require('./lib/helpers.cjs');
      const { runEstimate } = require('./lib/estimate-cli.cjs');
      const r = runEstimate({ argv: args.slice(1), cwd, env: process.env, now: Date.now() });
      if (!r.ok) error(r.message);
      outputEstimate(r.result, raw, r.text, r.exit || 0);
      break;
    }

    case 'session-audit': {
      // aof-tools session-audit [--since YYYY-MM-DD] [--limit N] [--root <dir>] [--raw] — TRD 31-03 module, wired in TRD 39-01
      const { output: outputAudit } = require('./lib/helpers.cjs');
      const { runSessionAudit } = require('./lib/audit-cli.cjs');
      const r = runSessionAudit({ argv: args.slice(1) });
      if (!r.ok) error(r.message);
      outputAudit(r.result, raw, r.text);
      break;
    }

    case 'transcript-export': {
      // aof-tools transcript-export [--out <file>] [--full <dir>] [--limit N] [--root <dir>] [--raw] — TRD 31-02 module, wired in TRD 39-02
      const { output: outputAudit } = require('./lib/helpers.cjs');
      const { runTranscriptExport } = require('./lib/audit-cli.cjs');
      const r = runTranscriptExport({ argv: args.slice(1) });
      if (!r.ok) error(r.message);
      outputAudit(r.result, raw, r.text);
      break;
    }

    case 'override': {
      // aof-tools override --gate <g> --reason <why> | --list [--limit N] — TRD 30-04 module, wired in TRD 39-02
      const { output: outputAudit } = require('./lib/helpers.cjs');
      const { runOverride } = require('./lib/audit-cli.cjs');
      const r = runOverride({ argv: args.slice(1), cwd });
      if (!r.ok) error(r.message);
      outputAudit(r.result, raw, r.text);
      break;
    }

    case 'progress': {
      const subcommand = args[1] || 'json';
      cmdProgressRender(cwd, subcommand, raw);
      break;
    }

    case 'todo': {
      // todo add | complete — TRD 48-15. Local `complete` runs cmdTodoComplete unchanged; store mode routes to the
      // entity verb.
      require('./lib/planning-verbs-cli.cjs').cmdTodoVerb(cwd, args.slice(1), raw);
      break;
    }

    case 'handoff': {
      const subcommand = args[1];
      if (subcommand === 'create') {
        // Pull --inputs-json <json> out of the arg list before joining the
        // command (TRD 19-02). The flag and its value are removed; the rest
        // of the args become the command string.
        const createArgs = args.slice(2);
        let inputsJson;
        const idx = createArgs.indexOf('--inputs-json');
        if (idx !== -1) {
          inputsJson = createArgs[idx + 1];
          createArgs.splice(idx, 2);
        }
        const cmd = createArgs.join(' ');
        cmdHandoffCreate(cwd, cmd, raw, { inputsJson });
      } else if (subcommand === 'complete') {
        const id = args[2];
        const exitIdx = args.indexOf('--exit-code');
        const outFileIdx = args.indexOf('--output-file');
        const outIdx = args.indexOf('--output');
        const opts = {
          exitCode: exitIdx !== -1 ? parseInt(args[exitIdx + 1], 10) : undefined,
          outputFile: outFileIdx !== -1 ? args[outFileIdx + 1] : undefined,
          output: outIdx !== -1 ? args[outIdx + 1] : undefined,
        };
        cmdHandoffComplete(cwd, id, opts, raw);
      } else if (subcommand === 'list') {
        cmdHandoffList(cwd, raw);
      } else if (subcommand === 'get') {
        cmdHandoffGet(cwd, args[2], raw);
      } else {
        error('Unknown handoff subcommand. Available: create, complete, list, get');
      }
      break;
    }

    case 'scaffold': {
      const scaffoldType = args[1];
      const objectiveIndex = args.indexOf('--objective');
      const nameIndex = args.indexOf('--name');
      const scaffoldOptions = {
        objective: objectiveIndex !== -1 ? args[objectiveIndex + 1] : null,
        name: nameIndex !== -1 ? args.slice(nameIndex + 1).join(' ') : null,
      };
      cmdScaffold(cwd, scaffoldType, scaffoldOptions, raw);
      break;
    }

    case 'init': {
      const workflow = args[1];
      const includes = parseIncludeFlag(args);
      // TRD 22-01: pass argv tail (everything after subcommand) so cmdInitX
      // functions can extract --branch via _resolveBranch.
      const initArgs = args.slice(2);
      switch (workflow) {
        case 'execute-objective':
          cmdInitExecuteObjective(cwd, args[2], includes, raw, initArgs);
          break;
        case 'plan-objective':
          cmdInitPlanObjective(cwd, args[2], includes, raw, initArgs);
          break;
        case 'new-project':
          cmdInitNewProject(cwd, raw, initArgs);
          break;
        case 'new-milestone':
          cmdInitNewMilestone(cwd, raw, initArgs);
          break;
        case 'quick':
          cmdInitQuick(cwd, args.slice(2).join(' '), raw, initArgs);
          break;
        case 'resume':
          cmdInitResume(cwd, raw, initArgs);
          break;
        case 'verify-work':
          cmdInitVerifyWork(cwd, args[2], raw, initArgs);
          break;
        case 'objective-op':
          cmdInitObjectiveOp(cwd, args[2], raw, initArgs);
          break;
        case 'todos':
          cmdInitTodos(cwd, args[2], raw, initArgs);
          break;
        case 'milestone-op':
          cmdInitMilestoneOp(cwd, raw, initArgs);
          break;
        case 'map-codebase':
          cmdInitMapCodebase(cwd, raw, initArgs);
          break;
        case 'security-audit':
          cmdInitSecurityAudit(cwd, raw, initArgs);
          break;
        case 'progress':
          cmdInitProgress(cwd, includes, raw, initArgs);
          break;
        default:
          error(`Unknown init workflow: ${workflow}\nAvailable: execute-objective, plan-objective, new-project, new-milestone, quick, resume, verify-work, objective-op, todos, milestone-op, map-codebase, security-audit, progress`);
      }
      break;
    }

    case 'objective-job-index': {
      cmdObjectiveJobIndex(cwd, args[1], raw);
      break;
    }

    case 'state-snapshot': {
      cmdStateSnapshot(cwd, raw);
      break;
    }

    case 'summary-extract': {
      const summaryPath = args[1];
      const fieldsIndex = args.indexOf('--fields');
      const fields = fieldsIndex !== -1 ? args[fieldsIndex + 1].split(',') : null;
      cmdSummaryExtract(cwd, summaryPath, fields, raw);
      break;
    }

    case 'websearch': {
      const query = args[1];
      const limitIdx = args.indexOf('--limit');
      const freshnessIdx = args.indexOf('--freshness');
      await cmdWebsearch(query, {
        limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10,
        freshness: freshnessIdx !== -1 ? args[freshnessIdx + 1] : null,
      }, raw);
      break;
    }

    case 'workstreams': {
      const subcommand = args[1];
      if (subcommand === 'analyze') {
        cmdWorkstreamsAnalyze(cwd, raw);
      } else if (subcommand === 'provision') {
        cmdWorkstreamsProvision(cwd, args[2], args[3], raw);
      } else if (subcommand === 'reconcile') {
        cmdWorkstreamsReconcile(cwd, raw);
      } else {
        error('Unknown workstreams subcommand. Available: analyze, provision, reconcile');
      }
      break;
    }

    case 'changelog': {
      const subcommand = args[1];
      if (subcommand === 'update') {
        const versionIdx = args.indexOf('--version');
        const fromIdx = args.indexOf('--from');
        const toIdx = args.indexOf('--to');
        const dryRun = args.includes('--dry-run');
        cmdChangelogUpdate(cwd, {
          version: versionIdx !== -1 ? args[versionIdx + 1] : args[2],
          from: fromIdx !== -1 ? args[fromIdx + 1] : null,
          to: toIdx !== -1 ? args[toIdx + 1] : null,
          dryRun,
        }, raw);
      } else if (subcommand === 'check') {
        cmdChangelogCheck(cwd, args[2], raw);
      } else {
        error('Unknown changelog subcommand. Available: update, check');
      }
      break;
    }

    case 'defaults-table': {
      const subcommand = args[1];
      if (subcommand === 'init') {
        const { cmdDefaultsTableInit } = require('./lib/defaults-loader.cjs');
        cmdDefaultsTableInit(cwd, args.slice(2), raw);
      } else {
        error('Unknown defaults-table subcommand. Available: init');
      }
      break;
    }

    case 'stack': {
      const { cmdStack } = require('./lib/stack-profile.cjs');
      cmdStack(cwd, args.slice(1), raw);
      break;
    }

    case 'gh': {
      const subcommand = args[1];
      if (subcommand === 'status') {
        cmdGhStatus(cwd, raw);
      } else if (subcommand === 'sync-objectives') {
        // Deprecated alias of `gh sync --all` (TRD 46-08; skill-route DF_TOOLS_DEPRECATIONS)
        cmdGhSyncObjectives(cwd, raw);
      } else if (subcommand === 'comment') {
        // aof-tools gh comment <objective|#issue> <body|@file:path> [--kind k]
        cmdGhComment(cwd, args.slice(2), raw);
      } else if (subcommand === 'close-issue') {
        // aof-tools gh close-issue <objective|#issue> [comment]
        cmdGhCloseIssue(cwd, args[2], args[3] || null, raw);
      } else if (subcommand === 'sync-release') {
        // aof-tools gh sync-release <tag>
        cmdGhSyncRelease(cwd, args[2], raw);
      } else if (subcommand === 'resolve') {
        // aof-tools gh resolve <objectiveId> [--raw]
        cmdGhResolve(cwd, args[2], raw, args.slice(2));
      } else if (subcommand === 'sync') {
        // aof-tools gh sync [<objective>|--all] — bare `gh sync` is `--all`
        cmdGhSync(cwd, args.slice(2), raw);
      } else if (subcommand === 'pull') {
        // aof-tools gh pull <objectiveId> [--apply] [--raw]
        const { cmdGhPull } = require('./lib/gh-pull.cjs');
        cmdGhPull(cwd, args.slice(2), raw);
      } else if (subcommand === 'outbox') {
        // aof-tools gh outbox <status|flush [--no-wait]|resolve <seq> --accept-remote|--overwrite> [--raw]
        // Exit codes (flush): 0 flushed, 1 error, 2 halted for a human, 3 ops still pending.
        const { cmdGhOutbox } = require('./lib/gh-store-cli.cjs');
        cmdGhOutbox(cwd, args.slice(2), raw);
      } else if (subcommand === 'trd') {
        // aof-tools gh trd <spec|freeze|fold [--force]|scope <body|@file:path> [--n K]> <trd> [--no-flush] [--raw]
        const { cmdGhTrd } = require('./lib/gh-store-cli.cjs');
        cmdGhTrd(cwd, args.slice(2), raw);
      } else if (subcommand === 'orphans') {
        // aof-tools gh orphans <objective> [--raw]
        const { cmdGhOrphans } = require('./lib/gh-store-cli.cjs');
        cmdGhOrphans(cwd, args.slice(2), raw);
      } else if (subcommand === 'pr') {
        // aof-tools gh pr <start <objective> [--name <branch>]|sync <objective>|status <objective>> [--no-flush] [--raw]
        // Store mode only (skipped otherwise). Exit codes: 0 ok, 1 error, 2 halted for a human, 3 pending.
        const { cmdGhPr } = require('./lib/gh-pr-cli.cjs');
        cmdGhPr(cwd, args.slice(2), raw);
      } else if (subcommand === 'setup') {
        // aof-tools gh setup [--apply] [--refresh] [--require-wiki] [--raw]
        // Dry-run unless --apply. Needs github.enabled + github.repo (not store mode; skipped otherwise).
        // Exit codes: 0 dry-run or applied, 1 an error, a failed action, a conflicting local file or an unready wiki.
        const { cmdGhSetup } = require('./lib/gh-setup-cli.cjs');
        cmdGhSetup(cwd, args.slice(2), raw);
      } else {
        error('Unknown gh subcommand. Available: status, sync, pull, resolve, comment, close-issue, sync-release, outbox, trd, orphans, pr, setup (sync-objectives: deprecated alias)');
      }
      break;
    }

    case 'awareness': {
      cmdAwarenessRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'org-awareness': {
      cmdOrgAwarenessRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'planning': {
      const sub = args[1];
      if (sub === 'sibling-trd-scan') {
        const objective_id = args[2];
        if (!objective_id) {
          process.stderr.write('Usage: aof-tools planning sibling-trd-scan <objective-num> [--raw]\n');
          process.exit(1);
        }
        const oa = require('./lib/org-awareness.cjs');
        // Read .aoforge/config.json awareness.sibling_repos (matches org-awareness-cli.cjs pattern)
        let config_paths = null;
        try {
          const fsBase = require('fs');
          const pathBase = require('path');
          const cfgPath = pathBase.join(require('./lib/compat.cjs').planningRoot(cwd), 'config.json');
          const cfgRaw = fsBase.readFileSync(cfgPath, 'utf-8');
          const cfg = JSON.parse(cfgRaw);
          if (cfg && cfg.awareness && Array.isArray(cfg.awareness.sibling_repos)) {
            config_paths = cfg.awareness.sibling_repos;
          }
        } catch {
          // missing/malformed config — pass null, scanSiblingTrds emits the documented warning
        }

        const result = oa.scanSiblingTrds({ objective_id, cwd, config_paths });

        if (raw) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          // Human-readable
          process.stdout.write(`scanned ${result.scanned} sibling repo(s)\n`);
          if (result.matches.length === 0) {
            process.stdout.write('no matching TRDs found\n');
          } else {
            process.stdout.write(`\nmatches (${result.matches.length}):\n`);
            for (const m of result.matches) {
              const supTag = m.supersedes ? ` [supersedes: ${m.supersedes}]` : '';
              const preTag = m.prerequisite_for ? ` [prereq for: ${m.prerequisite_for}]` : '';
              const conf = m.confidence ? ` (confidence: ${m.confidence})` : '';
              const files = Array.isArray(m.files_modified) ? m.files_modified.join(', ') : '(none)';
              process.stdout.write(`  - ${m.trd_path}\n`);
              process.stdout.write(`      objective=${m.objective || '?'} trd=${m.trd || '?'}${conf}${supTag}${preTag}\n`);
              process.stdout.write(`      files: ${files}\n`);
            }
          }
          if (result.warnings.length > 0) {
            process.stdout.write(`\nwarnings:\n`);
            for (const w of result.warnings) process.stdout.write(`  - ${w}\n`);
          }
        }
        process.exit(0);
      }
      if (sub === 'draft' || sub === 'import' || sub === 'mode') {
        // TRD 48-15: planning draft <rel> | import [--dry-run] | mode (logic in planning-verbs-cli.cjs).
        require('./lib/planning-verbs-cli.cjs').cmdPlanningVerb(cwd, args.slice(1), raw);
        break;
      }
      error(`Unknown planning subcommand${sub ? ': ' + sub : ''}. Available: sibling-trd-scan, draft, import, mode`);
      break;
    }

    case 'project-hygiene': {
      const subcommand = args[1];
      if (subcommand === 'check') {
        const { cmdProjectHygieneCheck } = require('./lib/project-hygiene.cjs');
        cmdProjectHygieneCheck(cwd, raw);
      } else if (subcommand === 'move') {
        const { cmdProjectHygieneMove } = require('./lib/project-hygiene.cjs');
        cmdProjectHygieneMove(cwd, args.slice(2), raw);
      } else if (subcommand === 'archive') {
        const { cmdProjectHygieneArchive } = require('./lib/project-hygiene.cjs');
        cmdProjectHygieneArchive(cwd, args.slice(2), raw);
      } else {
        error(`Unknown project-hygiene subcommand${subcommand ? ': ' + subcommand : ''}. Available: check, move, archive`);
      }
      break;
    }

    case 'benchmark': {
      const { cmdBenchmarkRoute } = require('./lib/benchmark.cjs');
      cmdBenchmarkRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'dup-detect': {
      cmdDupDetectRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'decision-queue': {
      const { cmdDecisionQueueRoute } = require('./lib/decision-queue.cjs');
      await cmdDecisionQueueRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'initiatives': {
      cmdInitiativesRoute(cwd, args.slice(1));
      break;
    }

    case 'check-todos': {
      cmdCheckTodosRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'tui': {
      cmdTuiRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'sync-roadmap': {
      cmdSyncRoadmapRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'skill-route': {
      const { cmdSkillRoute, cmdSkillRouteList } = require('./lib/skill-route.cjs');
      const srArgs = args.slice(1);
      const srRaw = srArgs.includes('--raw');
      const srFiltered = srArgs.filter(a => a !== '--raw');
      if (srFiltered[0] === '--list') {
        cmdSkillRouteList(cwd, srRaw);
      } else {
        cmdSkillRoute(cwd, srFiltered, srRaw);
      }
      break;
    }

    case 'deprecation': {
      const { cmdDeprecationLog } = require('./lib/skill-route.cjs');
      const depSub = args[1];
      const depRaw = args.includes('--raw');
      if (depSub === 'log') {
        const result = cmdDeprecationLog(cwd, args[2], depRaw);
        if (result.error) {
          process.stderr.write(JSON.stringify(result, null, 2));
          process.exit(1);
        }
        process.stdout.write(JSON.stringify(result, null, 2));
        process.exit(0);
      } else {
        error('Usage: aof-tools deprecation log <old-name>');
      }
      break;
    }

    case 'survey': {
      const sub = args[1];
      const surveyArgs = args.slice(2);
      const surveyRaw = surveyArgs.includes('--raw');
      const filteredSurveyArgs = surveyArgs.filter(a => a !== '--raw');
      if (sub === 'decimal-objectives') {
        cmdSurveyDecimalObjectives(cwd, filteredSurveyArgs, surveyRaw);
      } else {
        error('Usage: aof-tools survey decimal-objectives [--root <path>]');
      }
      break;
    }

    case 'trd-tdd': {
      const sub = args[1];
      if (sub === 'inspect') {
        cmdTrdTddInspect(cwd, args[2], raw);
      } else {
        error('Usage: aof-tools trd-tdd inspect <trd-path>');
      }
      break;
    }

    case 'project-state': {
      // aof-tools project-state [<cwd>] [--raw]
      cmdProjectState(cwd, args[1], raw);
      break;
    }

    case 'project-decline': {
      // aof-tools project-decline [<cwd>] [--duration-days N]
      cmdProjectDecline(cwd, args.slice(1), raw);
      break;
    }

    case 'project-accept': {
      // aof-tools project-accept [<cwd>]
      cmdProjectAccept(cwd, args.slice(1), raw);
      break;
    }

    case 'skill-active': {
      // aof-tools skill-active --start <name>
      // aof-tools skill-active --end
      // aof-tools skill-active --status
      cmdSkillActive(cwd, args.slice(1), raw);
      break;
    }

    case 'micro': {
      // aof-tools micro start <description>
      // aof-tools micro commit [--files <path>...]
      // aof-tools micro abort
      cmdMicro(cwd, args.slice(1), raw);
      break;
    }

    case 'exec-context': {
      // aof-tools exec-context check --repo <path> [--base <ref>] [--id <plan_id>]
      // aof-tools exec-context worktree --repo <path> --id <slug> [--base <ref>] [--path <dir>]
      // aof-tools exec-context release --repo <path> [--id <slug>]
      cmdExecContextRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'merge-driver': {
      // aof-tools merge-driver state-json <base> <ours> <theirs>   (the git merge driver entry point)
      // aof-tools merge-driver install [--check]
      // aof-tools merge-driver uninstall
      // aof-tools merge-driver resolve <path>
      cmdMergeDriver(cwd, args.slice(1), raw);
      break;
    }

    case 'global-config': {
      // aof-tools global-config get <key>
      // aof-tools global-config set <key> <value>
      cmdGlobalConfig(cwd, args.slice(1), raw);
      break;
    }

    default:
      error(`Unknown command: ${command}`);
  }
}

main();
