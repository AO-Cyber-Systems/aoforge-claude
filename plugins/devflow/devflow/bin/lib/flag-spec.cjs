'use strict';

/**
 * FLAG_SPEC (TRD 68-03, TOOL-01): the flags each writing df-tools command accepts, per subcommand.
 *
 * `df-tools.cjs` `main()` runs `checkFlags(args, FLAG_SPEC)` (flag-guard.cjs) after the `--help` pre-switch and before the
 * `switch (command)`, for every command `help.cjs` marks `mutates: true` that has an entry here. A `--flag` this table does
 * not list for the command and subcommand in use exits 1 before anything runs, so nothing is written. The shape of an
 * entry, and what `anyFlags`, `ownParser` and `tailFrom` mean, is documented at the top of flag-guard.cjs.
 *
 * This file holds the planning and state writers (group 1). The remaining writing commands join it in TRD 68-05, whose
 * repo test checks the table against `help.cjs` (every command marked `mutates: true` has an entry or an exemption with a
 * reason) and against the invocations documented in the plugin prose.
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
});

module.exports = { FLAG_SPEC };
