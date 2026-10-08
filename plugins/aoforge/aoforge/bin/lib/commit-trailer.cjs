'use strict';

/**
 * commit-trailer.cjs — the `Refs #N` trailer on AOForge commits (objective 49, GPR-02).
 *
 * In store mode every commit AOForge records names the issue it serves: a TRD's commits reference the TRD issue,
 * objective-level commits the objective issue. The issue comes from the conventional-commit scope already in every
 * executor message (`feat(49-02): ...` -> TRD 49-02, `docs(49): ...` -> objective 49), resolved through the v3 mapping in
 * the MAIN checkout, so a commit made from a `.df-worktrees/` executor gets the trailer too (its own `.planning/` holds
 * no mapping in store mode).
 *
 * Format: the literal final paragraph `Refs #N` (the proposal's wording). Git's default trailer separator is `:`, so
 * `git interpret-trailers` does not parse it as a trailer; a checker must match `^Refs #\d+$` (objective 50's
 * `aoforge/linked-issue`).
 *
 * Reads files only (config, mapping). No gh, no git. Resolution never throws and never blocks a commit: every failure
 * is a null issue plus a reason, because enforcement belongs to the check, not to `aof-tools commit`.
 */

const planningMode = require('./planning-mode.cjs');
const ghMapping = require('./gh-mapping.cjs');

// `type(scope)!: subject` — lower-case conventional-commit type, optional breaking-change bang.
const SCOPE_RE = /^[a-z]+\(([^)]+)\)!?:/;
// A bare objective scope: `49`, `049`, `07.1`. A slug (`49-demo`) is deliberately not one.
const OBJECTIVE_SCOPE_RE = /^\d+(\.\d+)?$/;
// An existing trailer paragraph. Anchored to a whole line, so "see Refs #5 in the doc" is not one.
const EXISTING_REFS_RE = /^Refs #\d+[ \t]*$/m;

/** The scope of a message's subject line (its first line), verbatim, or null. */
function parseScope(subject) {
  if (typeof subject !== 'string') return null;
  const first = subject.split('\n', 1)[0].trim();
  const m = SCOPE_RE.exec(first);
  return m ? m[1].trim() : null;
}

/**
 * Which issue a commit message serves.
 *
 *   -> { issue: <positive integer>, id: <canonical TRD or objective id> }
 *    | { issue: null, id: <canonical id | null>, reason }
 *
 * `mainRoot` is the MAIN checkout (`planningMode.resolveMainRoot(cwd)`). Reasons: `not store mode`, `no scope`,
 * `unrecognised scope`, `mapping unreadable`, `no mapping entry`.
 *
 * `opts.objective` (TRD 50-06): the objective whose branch the commit lands on. A message that names no scope (`no scope`)
 * or a scope that names no issue (`unrecognised scope`) references that objective's issue instead, so every commit on a
 * linked branch carries a `Refs #` paragraph. A message with a recognised scope keeps today's resolution, even when that
 * scope has no mapping entry: the author named something specific.
 */
function refsFor(mainRoot, message, opts) {
  const none = (reason, id = null) => ({ issue: null, id, reason });

  // Local mode is today's behaviour: do not even look at the mapping.
  if (!planningMode.isStoreMode(mainRoot)) return none('not store mode');

  const scope = parseScope(message);

  // A TRD (or Decision) id is `<objective>-<NN>[-dK]`; an objective scope is a bare number. Anything else — a slug, a
  // feature name — names no issue.
  let trdId = null;
  let objectiveId = null;
  if (scope !== null) {
    trdId = ghMapping.toTrdId(scope);
    objectiveId = trdId === null && OBJECTIVE_SCOPE_RE.test(scope) ? ghMapping.toObjectiveId(scope) : null;
  }
  if (trdId === null && objectiveId === null) {
    // No usable scope: the linked objective (if the caller has one) is the issue this commit serves.
    const linked = opts && opts.objective !== undefined && opts.objective !== null ? ghMapping.toObjectiveId(opts.objective) : null;
    if (linked === null) return none(scope === null ? 'no scope' : 'unrecognised scope');
    objectiveId = linked;
  }
  const id = trdId !== null ? trdId : objectiveId;

  let report;
  try {
    report = ghMapping.readMappingV3WithReport(mainRoot);
  } catch (_) {
    return none('mapping unreadable', id);
  }
  if (report.error) return none('mapping unreadable', id);

  const entry = trdId !== null ? ghMapping.getTrd(report.mapping, trdId) : ghMapping.getEntry(report.mapping, objectiveId);
  const issue = entry ? (trdId !== null ? entry.issue_number : entry.issue_id) : null;
  if (!Number.isInteger(issue) || issue <= 0) return none('no mapping entry', id);
  return { issue, id };
}

/**
 * `message` with a final `Refs #<issue>` paragraph. Idempotent: a message that already has a `Refs #N` line is returned
 * unchanged (whatever N is), and an `issue` that is not a positive integer leaves the message byte-identical.
 */
function applyRefs(message, issue) {
  if (typeof message !== 'string') return message;
  if (!Number.isInteger(issue) || issue <= 0) return message;
  if (EXISTING_REFS_RE.test(message)) return message;
  return `${message.replace(/\s+$/, '')}\n\nRefs #${issue}`;
}

module.exports = { parseScope, refsFor, applyRefs };
