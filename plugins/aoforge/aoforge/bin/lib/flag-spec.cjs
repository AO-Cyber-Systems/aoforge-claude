'use strict';

/**
 * FLAG_SPEC (TRD 68-03, TOOL-01): the flags each writing aof-tools command accepts, per subcommand.
 *
 * `aof-tools.cjs` `main()` runs `checkFlags(args, FLAG_SPEC)` (flag-guard.cjs) after the `--help` pre-switch and before the
 * `switch (command)`, for every command `help.cjs` marks `mutates: true` that has an entry here. A `--flag` this table does
 * not list for the command and subcommand in use exits 1 before anything runs, so nothing is written. The shape of an
 * entry, and what `anyFlags`, `ownParser` and `tailFrom` mean, is documented at the top of flag-guard.cjs.
 *
 * This file holds every writing command: the planning and state writers (group 1, TRD 68-03) and the rest (group 2, TRD
 * 68-05). flag-spec.repo.test.cjs checks the table against `help.cjs` (every command marked `mutates: true` has an entry,
 * and no other command has one), against PROBES, and against the invocations documented in the plugin prose and docs.
 *
 * To add a flag to a command: add it to the entry here, in the same change that makes the command read it. A flag listed
 * here that nothing reads is a lie, and a flag read but not listed is rejected before it is read. Add the probe for a new
 * subcommand to PROBES in flag-guard-fixtures.cjs (the test fixtures), which flag-guard-cli.test.cjs requires to match
 * this table.
 *
 * Global flags (`--raw`, `--help`, `--cwd`) are accepted everywhere and are not listed.
 */

/** The flags every store-aware planning verb accepts; both are no-ops in local mode. */
const FLUSH = ['--no-flush', '--no-wait'];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const FLAG_SPEC = deepFreeze({
  // `state` with no subcommand loads the state; a flag where the subcommand goes takes the default rule (none accepted).
  state: {
    subcommands: {
      load: {},
      get: {},
      update: {},
      'update-progress': {},
      patch: {
        anyFlags: true,
        reason: '`state patch --<field> <value>` pairs name arbitrary STATE.md fields, so every --x is a field name',
      },
      'advance-job': { values: ['--objective'] },
      'record-metric': { values: ['--objective', '--job', '--duration', '--tasks', '--files'] },
      'add-decision': { values: ['--objective', '--summary', '--rationale'] },
      'add-blocker': { values: ['--text'] },
      'resolve-blocker': { values: ['--text'] },
      'record-session': { values: ['--stopped-at', '--resume-file'] },
      // TRD 72-07: copies repo-keyed runtime state from a moved checkout's old key (state-rekey.cjs).
      rekey: { values: ['--from', '--to'], bools: ['--dry-run'] },
    },
    default: {},
  },

  // The tokens after --files are file names too; they do not start with `--`, so the checker passes over them.
  commit: { values: ['--files'], bools: ['--amend'] },

  template: {
    subcommands: {
      select: {},
      fill: { values: ['--objective', '--job', '--name', '--type', '--wave', '--fields'] },
    },
  },

  frontmatter: {
    subcommands: {
      get: { values: ['--field'] },
      set: { values: ['--field', '--value'] },
      merge: { values: ['--data'] },
      validate: { values: ['--schema'] },
    },
  },

  'config-ensure-section': {},
  'config-set': {},

  roadmap: {
    subcommands: {
      'get-objective': {},
      analyze: {},
      'update-job-progress': {},
    },
  },

  requirements: {
    subcommands: {
      'mark-complete': {},
    },
  },

  objective: {
    subcommands: {
      'next-decimal': {},
      add: {},
      insert: {},
      remove: { bools: ['--force', '--confirm'] },
      complete: {},
      put: { values: ['--from'], bools: FLUSH },
      'set-status': { bools: FLUSH },
    },
  },

  milestone: {
    subcommands: {
      put: { values: ['--from'], bools: FLUSH },
      // `--name` takes the words up to the next flag; the words after the first are positionals to the checker.
      complete: { values: ['--name'], bools: ['--archive-objectives', '--dry-run', ...FLUSH] },
    },
  },

  plan: {
    subcommands: {
      'put-trd': { values: ['--from'], bools: ['--no-push', ...FLUSH] },
      push: { bools: FLUSH },
    },
  },

  summary: {
    subcommands: {
      post: { values: ['--from', '--file'], bools: FLUSH },
      checkpoint: { values: ['--from', '--file'], bools: FLUSH },
    },
  },

  verification: {
    subcommands: {
      post: { values: ['--from', '--file'], bools: FLUSH },
    },
  },

  doc: {
    subcommands: {
      put: { values: ['--from', '--message'], bools: FLUSH },
    },
  },

  decision: {
    subcommands: {
      open: { values: ['--question'], bools: FLUSH },
      answer: { values: ['--from', '--text'], bools: FLUSH },
    },
  },

  debug: {
    subcommands: {
      put: { values: ['--from'], bools: FLUSH },
      resolve: { bools: FLUSH },
    },
  },

  quick: {
    subcommands: {
      put: { values: ['--from'], bools: FLUSH },
      summary: { values: ['--from'], bools: FLUSH },
    },
  },

  todo: {
    subcommands: {
      add: { values: ['--from', '--stem'], bools: FLUSH },
      complete: { bools: FLUSH },
      sync: { values: ['--transcript', '--session', '--projects-root'], bools: ['--dry-run', ...FLUSH] },
    },
  },

  // The first positional is the type (`context`, `uat`, ...), not a subcommand; `--name` takes the rest of the argv.
  scaffold: { values: ['--objective', '--name'] },

  validate: {
    subcommands: {
      consistency: {},
      docs: {},
      health: { bools: ['--repair'] },
      requirements: { values: ['--objective'] },
    },
  },

  // No subcommand: the flag is the action (`--start <name>`, `--end`, `--status`).
  'skill-active': { values: ['--start'], bools: ['--end', '--status'] },

  micro: {
    subcommands: {
      start: {},
      abort: {},
      commit: { values: ['--files'] },
    },
  },

  // ─── Group 2 (TRD 68-05): the remaining commands help.cjs marks `mutates: true` ───────────────────────────────────
  // Each row was read against the dispatcher arm and the module that parses its argv. A command whose own parser rejects
  // an unknown flag before it acts is `ownParser` (the probe in flag-guard-cli.test.cjs proves it); everything else lists
  // the flags it reads. Where a command nests (`gh outbox flush|resolve`, `ui spec validate|render`, `stack`'s extension
  // modules) the entry carries the union of the nested forms' flags.

  // Flutter UI and UI-spec tooling.
  'flutter-ui': {
    subcommands: {
      setup: { bools: ['--print-only', '--auto'] },
      eval: { values: ['--judge', '--samples'] },
      bootstrap: {},
      'design-review': { bools: ['--live'] },
    },
  },
  ui: {
    subcommands: {
      metrics: { values: ['--since', '--paths', '--out'] },
      // `ui spec validate|render`: --manifest, --graph and --table choose the artifact `render` prints.
      spec: { values: ['--patterns'], bools: ['--manifest', '--graph', '--table'] },
      sheet: { values: ['--renders', '--refs', '--out', '--patterns'] },
      lock: { values: ['--sheet-hash', '--by', '--at', '--patterns'] },
    },
  },
  generate: { subcommands: { uat: {} } },

  // Layout migration, adoption, upgrade and diagnosis.
  // `migrate plan` is read-only and ignores the apply flags; help.cjs documents one flag list for both, so both accept it.
  migrate: {
    subcommands: {
      plan: { values: ['--kind', '--default-work', '--work-choices'], bools: ['--dry-run'] },
      apply: { values: ['--kind', '--default-work', '--work-choices'], bools: ['--dry-run'] },
    },
  },
  adopt: {
    subcommands: {
      preflight: {},
      begin: {},
      scaffold: {},
      report: {},
    },
  },
  upgrade: {
    ownParser: true,
    reason: 'upgrade-cli.cjs parseArgs throws a UsageError on an unknown flag, before any migration is detected or applied',
  },
  doctor: {
    ownParser: true,
    reason: 'doctor-cli.cjs parseArgs rejects unknown flags (usage: aof-tools doctor [--fix] [--json] [--path <dir>] [--global])',
  },

  // Estimation data and telemetry. Their parsers check flags per subcommand and reject before reading or writing.
  tokens: {
    ownParser: true,
    reason: 'tokens-cli.cjs parseArgs checks the flags of each subcommand (trd, stamp, backfill, coverage) and rejects an unknown one before reading a transcript or writing a draft',
  },
  calibrate: {
    ownParser: true,
    reason: 'calibrate-cli.cjs parseArgs rejects an unknown flag before it reads a SUMMARY or writes calibration.json',
  },
  estimate: {
    ownParser: true,
    reason: 'estimate-cli.cjs parseArgs checks the flags of each subcommand and rejects an unknown one before the calibration or any run state is read or written',
  },
  'transcript-export': {
    ownParser: true,
    reason: 'audit-cli.cjs runTranscriptExport rejects an unknown flag before it reads a transcript or appends to the index',
  },
  override: {
    ownParser: true,
    reason: 'audit-cli.cjs runOverride rejects an unknown flag before it appends to .aoforge/.override-log.jsonl',
  },

  // Hand-off of TTY commands. `create` carries the user's own command line.
  handoff: {
    subcommands: {
      create: {
        tailFrom: 2,
        reason: 'the tokens after `create` are the user command to hand off; the arm extracts --inputs-json from them and joins the rest',
      },
      complete: { values: ['--exit-code', '--output', '--output-file'] },
      list: {},
      get: {},
    },
  },

  workstreams: {
    subcommands: {
      analyze: {},
      provision: {},
      reconcile: {},
    },
  },
  changelog: {
    subcommands: {
      update: { values: ['--version', '--from', '--to'], bools: ['--dry-run'] },
      check: {},
    },
  },
  // `--scope=org|project` is the inline form the module reads; the spaced form is accepted by the guard and reported by the
  // module as a missing scope.
  'defaults-table': {
    subcommands: {
      init: { values: ['--scope'], bools: ['--force', '--dry-run'] },
    },
  },

  // GitHub sync. `outbox`, `trd` and `pr` nest further (`outbox flush|resolve`, `trd scope|confirm-scope|...`,
  // `pr start|sync|status|merge|reconcile`), so each carries the union of its forms' flags.
  gh: {
    subcommands: {
      status: {},
      'sync-objectives': {},
      comment: { values: ['--kind'] },
      'close-issue': {},
      'sync-release': {},
      resolve: {},
      sync: { bools: ['--all'] },
      // `--resolve=disk|gh|merge` is inline; the module refuses the spaced form with its own explanation.
      pull: { values: ['--resolve'], bools: ['--apply', '--resolved', '--all', '--force'] },
      outbox: { bools: ['--no-wait', '--accept-remote', '--overwrite'] },
      trd: { values: ['--n', '--reason'], bools: ['--force', '--no-flush', '--no-wait'] },
      orphans: {},
      pr: { values: ['--name'], bools: ['--no-flush', '--no-wait'] },
      setup: { bools: ['--apply', '--refresh', '--require-wiki'] },
    },
  },

  // Stack profile. `verify` has an explicit rule although its parser rejects too, so the guard answers first and the
  // message names the entry; `report` and `mcp` leave it to their modules.
  stack: {
    subcommands: {
      resolve: { values: ['--file'], bools: ['--provenance'] },
      context: { values: ['--file', '--files', '--budget'], bools: ['--ui'] },
      validate: { values: ['--profile'] },
      command: { values: ['--file', '--files', '--packages'], bools: ['--apply'] },
      init: { values: ['--from', '--extends'], bools: ['--write', '--force'] },
      verify: { values: ['--include', '--keys', '--timeout'], bools: ['--run', '--draft', '--allow-services'] },
      report: {
        ownParser: true,
        reason: 'stack-report.cjs rejects an unknown flag (it takes --write and --draft) before it drafts or writes STACK-REPORT.md',
      },
      mcp: {
        ownParser: true,
        reason: 'stack-mcp.cjs throws McpUsageError on an unknown argument (it takes --write) before it reads or writes .mcp.json',
      },
    },
  },

  // Planning verbs that are not entity writers: the sibling scan, the draft path, the import and the mode.
  planning: {
    subcommands: {
      'sibling-trd-scan': {},
      draft: {},
      import: { bools: ['--dry-run'] },
      mode: {},
    },
  },

  // Project hygiene and the decision queue. The decision queue's parser accepts any `--x` as a boolean, so it is listed.
  'project-hygiene': {
    subcommands: {
      check: {},
      // `--to=<path>` inline; `archive --apply <name>` takes the repo name.
      move: { values: ['--to'] },
      archive: { values: ['--apply'] },
    },
  },
  'decision-queue': {
    subcommands: {
      add: {
        values: ['--objective', '--trd', '--wave', '--title', '--context', '--options', '--recommendation', '--blocks', '--independent'],
      },
      list: { values: ['--status'] },
      resolve: {},
      notify: {},
    },
  },
  initiatives: {
    subcommands: {
      sync: { values: ['--home', '--initiative', '--project-id'], bools: ['--force'] },
      list: { values: ['--home'] },
      show: { values: ['--home'] },
      'format-for-planner': { values: ['--repo', '--home'] },
    },
  },
  'sync-roadmap': { bools: ['--dry-run', '--interactive'] },
  deprecation: { subcommands: { log: {} } },

  // Adoption decline and accept, merge driver, execution context and the user-level config.
  'project-decline': { values: ['--duration-days'] },
  'project-accept': {},
  'merge-driver': {
    subcommands: {
      install: { bools: ['--check'] },
      uninstall: {},
      resolve: {},
      'state-json': {},
    },
  },
  'exec-context': {
    subcommands: {
      check: { values: ['--repo', '--base', '--id'] },
      worktree: { values: ['--repo', '--id', '--base', '--path'] },
      release: { values: ['--repo', '--id'] },
    },
  },
  'global-config': {
    subcommands: {
      get: {},
      set: {},
    },
  },
});

module.exports = { FLAG_SPEC };
