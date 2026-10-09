'use strict';

/**
 * classifier.cjs — Session classification + routing preamble generator
 *
 * Pure-logic module (no fs I/O). Exported functions are called by
 * classify-session.js SessionStart hook after filesystem probing.
 *
 * API:
 *   classifySession({ planningDir, hasGitDir, hasDeclineMarker, isSubstantive?, previouslyDeclined? })
 *     → 'ambient' | 'init-offer' | 'skip'  (17-03 extended — back-compat via default params)
 *   renderRoutingPreamble({ mode }) → string  (modes: ambient | init-offer | auto-init | skip)
 *   CONSOLIDATED_SKILLS → Array (snapshot from 12-RESEARCH.md Phase G handoff 2026-05-06)
 */

// ─── classifySession ──────────────────────────────────────────────────────────

/**
 * Pure function — no filesystem I/O.
 *
 * Truth table (17-03 extended, 5-input):
 *   hasDeclineMarker=true                                    → 'skip'  (legacy marker, highest priority)
 *   planningDir non-null                                     → 'ambient'
 *   hasGitDir=true AND isSubstantive=true AND !previouslyDeclined → 'init-offer'
 *   (else)                                                   → 'skip'
 *
 * Back-compat: isSubstantive defaults to true and previouslyDeclined defaults to false,
 * so existing call sites that only pass {planningDir, hasGitDir, hasDeclineMarker}
 * continue to work without modification (same behavior as before 17-03).
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir         - path to .aoforge/ dir, or null if not found
 * @param {boolean}     opts.hasGitDir           - true if .git/ found in ancestor
 * @param {boolean}     opts.hasDeclineMarker    - true if .aoforge/.aoforge-init-declined exists (legacy 15-01)
 * @param {boolean}     [opts.isSubstantive=true]       - true if project meets substantive heuristic (17-03)
 * @param {boolean}     [opts.previouslyDeclined=false] - true if user declined via aof-tools project-decline (17-03)
 * @returns {'ambient'|'init-offer'|'skip'}
 */
function classifySession({
  planningDir,
  hasGitDir,
  hasDeclineMarker,
  isSubstantive = true,       // default true → existing 15-01 tests pass without modification
  previouslyDeclined = false, // default false → existing 15-01 tests pass without modification
}) {
  // Legacy decline marker (15-01) — highest priority
  if (hasDeclineMarker) return 'skip';

  // Ambient — AOForge already initialized
  if (planningDir) return 'ambient';

  // Init-offer extended: gate on substantive AND not declined (17-03)
  if (hasGitDir && isSubstantive && !previouslyDeclined) return 'init-offer';

  return 'skip';
}

// ─── Preamble constants ───────────────────────────────────────────────────────

/**
 * Routing decision table preamble for ambient mode (AOForge project with .aoforge/).
 *
 * LOCKED TEXT — from 15-RESEARCH.md (preamble structure) and 16-PHASE-B (micro shipped).
 * Update only in a dedicated TRD.
 */
const AMBIENT_PREAMBLE = `AOFORGE PROJECT DETECTED — ROUTING DIRECTIVE

This project has .aoforge/ — AOForge ambient mode is active.

ROUTING DECISION TABLE:
  • Q&A / explanation / exploration       → respond directly, no skill
  • Sub-30-LOC, single-file change        → /aoforge:micro (~2k token floor)
  • <5 files, <200 LOC, no new abstractions → /aoforge:quick
  • Multi-file feature                    → /aoforge:build
  • Bug investigation                     → /aoforge:debug
  • Plan an objective                     → /aoforge:plan-objective
  • Verify work                           → /aoforge:verify-work
  • Status check                          → /aoforge:status
  • Resume work                           → /aoforge:status resume
  • Pause work                            → /aoforge:status pause

CONSOLIDATED SKILLS (Phase G, v1.2 obj 12):
  /aoforge:todo         add | list
  /aoforge:status       (no arg) | check | pause | resume
  /aoforge:objective    add | remove
                        (remove is dry-run by default — it prints the delete +
                        renumber plan and changes nothing without --confirm)

USER-TYPED ONLY — you CANNOT invoke these via the Skill tool
(disable-model-invocation: true, because they mutate planning state):
  /aoforge:milestone    new | audit | complete | gaps
  /aoforge:workstreams  setup | status | merge | run
Ask the user to type these, or use aof-tools directly for the equivalent
operation. Attempting the Skill tool on them fails.

GATE: gate-edits.js will DENY direct Edit/Write/MultiEdit in ambient mode
unless an active skill marker (.aoforge/.skill-active) is present, or the
user prompt contains an explicit override phrase ("skip aoforge", "just edit",
"bypass aoforge", "force edit").

You MUST route through the appropriate skill BEFORE editing code.`;

/**
 * Init-offer preamble for substantive git repos without .aoforge/ (no decline, no auto-init).
 *
 * LOCKED TEXT — updated 17-03 per #28 spec (replaces 15-RESEARCH.md version).
 * Mentions /aoforge:new-project --auto and aof-tools project-decline.
 */
const INIT_OFFER_PREAMBLE = `AOFORGE INIT OFFER — substantive non-AOForge project detected

This is a git repository without .aoforge/ that meets the substantive-project
heuristic (git history >7 days OR >10 source files, with a manifest, not a
scratch dir). If the user requests a non-trivial change (multi-file feature,
plan, milestone work), offer:

  "This looks like a substantive project but AOForge isn't set up.
   Want me to run /aoforge:new-project --auto to bootstrap it (~2 min),
   or skip and edit directly?"

If the user declines, run: aof-tools project-decline
This suppresses future offers in this project for 30 days.

For trivial changes (single-file, <2 line), proceed directly without offering.`;

/**
 * Init-offer preamble for brownfield repos -- points at /aoforge:adopt instead of
 * /aoforge:new-project --auto (TRD 37-10). LOCKED TEXT for this TRD only; do not
 * hand-edit outside a dedicated TRD (per the LOCKED TEXT convention above).
 */
const ADOPT_OFFER_PREAMBLE = `AOFORGE INIT OFFER — substantive non-AOForge project detected

This is a git repository without .aoforge/ that meets the substantive-project
heuristic (git history >7 days OR >10 source files, with a manifest, not a
scratch dir) — an existing codebase. If the user requests a non-trivial change
(multi-file feature, plan, milestone work), offer:

  "This looks like an existing codebase but AOForge isn't set up.
   Want me to run /aoforge:adopt to adopt it? It maps the code, infers
   PROJECT.md and STACK.md, and makes one commit on an aoforge/adopt
   branch (never pushed). Or skip and edit directly?"

If the user declines, run: aof-tools project-decline
This suppresses future offers in this project for 30 days.

For trivial changes (single-file, <2 line), proceed directly without offering.`;

/**
 * Auto-init preamble — emitted when user has opted into auto-init mode
 * (auto_init_substantive_projects=true in ~/.claude/aoforge/global-config.json).
 *
 * NEW constant — 17-03 per #28 spec.
 * LOCKED TEXT — byte-locked to 17-RESEARCH.md "Locked preamble texts".
 */
const AUTO_INIT_PREAMBLE = `AOFORGE AUTO-INIT ACTIVE — substantive non-AOForge project detected

This is a substantive git repository without .aoforge/, and the user has
opted into auto-init mode (auto_init_substantive_projects=true in
~/.claude/aoforge/global-config.json).

When the user submits their first work-flavored request (not Q&A or
exploration), automatically invoke:

  /aoforge:new-project --auto

Do NOT prompt. The user has pre-authorized this via global config. If you
need to abort, the user can run: aof-tools global-config set auto_init_substantive_projects false

For Q&A or exploration prompts, respond directly without auto-initing.`;

// ─── renderRoutingPreamble ────────────────────────────────────────────────────

/**
 * Pure function — returns the appropriate preamble text for a given mode.
 *
 * @param {object} opts
 * @param {string} opts.mode - 'ambient' | 'init-offer' | 'auto-init' | 'skip' | (any other → '')
 * @param {string} [opts.repoState] - 'brownfield' | 'greenfield' | 'scratch' | 'aoforge' (37-04
 *   project-state; only consulted for mode === 'init-offer' -- auto-init is never routed to adopt,
 *   it is user-triggered and LOCKED per objective 37)
 * @returns {string}
 */
function renderRoutingPreamble({ mode, repoState }) {
  if (mode === 'ambient') return AMBIENT_PREAMBLE;
  if (mode === 'init-offer') return repoState === 'brownfield' ? ADOPT_OFFER_PREAMBLE : INIT_OFFER_PREAMBLE;
  if (mode === 'auto-init') return AUTO_INIT_PREAMBLE;  // 17-03: new mode
  return '';
}

// ─── CONSOLIDATED_SKILLS ─────────────────────────────────────────────────────

/**
 * Locked snapshot from 12-RESEARCH.md Phase G handoff (2026-05-06T02:32:48Z).
 * Generated by: node plugins/aoforge/aoforge/bin/aof-tools.cjs skill-route --list --raw
 *
 * ANTI-PATTERN: Do NOT shell out to aof-tools to fetch this at runtime.
 * SessionStart hooks are hot-path — subprocess overhead is unacceptable.
 * Drift across versions is acceptable for the routing-table preamble.
 */
// `userOnly` mirrors `disable-model-invocation: true` in the skill's own
// frontmatter (TRD 30-02). These skills mutate planning state, so requiring the
// user to type them is deliberate, not a bug.
//
// The bug was advertising them to the model anyway: the routing preamble listed
// them alongside invocable skills, producing 68 failed Skill-tool attempts
// across 22 sessions in the 2026-08-18 audit. classifier.test.cjs asserts these
// flags stay in sync with the actual frontmatter.
//
// `objective` moved to userOnly:false in quick job 13. Its rationale used to be
// that `objective remove` cascade-renumbers every objective above it — that
// cascade is now dry-run by default and mutates nothing without an explicit
// `--confirm`, so the destructive path is gated by the flag rather than by
// keeping the whole skill out of the model's reach.
const CONSOLIDATED_SKILLS = [
  { name: 'objective',   subcommands: ['add', 'remove'], userOnly: false },
  { name: 'milestone',   subcommands: ['new', 'audit', 'complete', 'gaps'], userOnly: true },
  { name: 'workstreams', subcommands: ['setup', 'status', 'merge', 'run'], userOnly: true },
  { name: 'todo',        subcommands: ['add', 'list'], userOnly: false },
  { name: 'status',      subcommands: [null, 'check', 'pause', 'resume'], userOnly: false },
];

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { classifySession, renderRoutingPreamble, CONSOLIDATED_SKILLS };
