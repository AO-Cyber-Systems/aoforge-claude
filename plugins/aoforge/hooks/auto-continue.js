#!/usr/bin/env node
/**
 * auto-continue.js — Stop hook (TRD 44-05, AUT-06)
 *
 * PURPOSE
 *   81 of 186 bare human nudges ("continue", "yes", "do it") followed the main
 *   loop ANNOUNCING an action ("Writing the predicate.") and then ending its
 *   turn; 58 more followed an unneeded ask ("Ready for wave 4 on your word").
 *   (44-EVIDENCE §1 row 4, §3.3.) This hook blocks such a stop ONCE and hands
 *   the announced step back as the next instruction.
 *
 * BLOCKS (prints {"decision":"block","reason":...}) only when ALL hold:
 *   1. the cwd is inside an AOForge project (a `.planning/` directory);
 *   2. a `.skill-active` marker is live — local `.planning/` or the MAIN
 *      checkout's, not expired (gate-edits.js hasSkillActiveMarker);
 *   3. `stop_hook_active` is false;
 *   4. no `background_tasks` entry is still running — the model legitimately
 *      ends its turn to wait for a task notification;
 *   5. the FINAL paragraph of `last_assistant_message` announces a next action
 *      and is not a question, a hand-off to the user, or a wait.
 *
 * ONCE-GUARD
 *   Verified harness fact (OBJECTIVE.md): a blocked Stop continues with
 *   `reason`, and the re-stop payload carries `stop_hook_active: true`. That
 *   bounds this hook to one auto-continue per stop chain. No counter file:
 *   one would dirty `.planning/`.
 *
 * ESCAPE HATCH
 *   AOFORGE_SKIP_AUTOCONTINUE=1 disables the hook.
 *
 * FAIL-OPEN CONTRACT
 *   Any error (bad stdin, unreadable marker, a moved gate-edits.js) → exit 0
 *   with no output. The hook can only ever withhold a block, never cause one.
 *
 * FALSE POSITIVES ARE THE MAIN RISK
 *   A wrong block makes the model act without permission. So the classifier
 *   is deliberately narrow: only the last paragraph, only sentence-start
 *   matches, only the LAST sentence of that paragraph, gerund-led sentences
 *   that read as a report ("Running the suite showed …") are rejected, and any
 *   question / ask phrase / `/aoforge:` hand-off / wait vetoes the whole thing.
 */

'use strict';

// ---------------------------------------------------------------------------
// Final paragraph
// ---------------------------------------------------------------------------

const FENCE_LINE = /^\s*(?:```|~~~)/;

/** Remove trailing fenced code blocks (and trailing whitespace). */
function stripTrailingFences(text) {
  let t = String(text).replace(/\s+$/, '');
  for (let guard = 0; guard < 20; guard++) {
    const lines = t.split('\n');
    if (lines.length < 2 || !FENCE_LINE.test(lines[lines.length - 1])) break;
    let open = -1;
    for (let j = lines.length - 2; j >= 0; j--) {
      if (FENCE_LINE.test(lines[j])) {
        open = j;
        break;
      }
    }
    if (open === -1) break;
    t = lines.slice(0, open).join('\n').replace(/\s+$/, '');
  }
  return t;
}

/**
 * The text after the last blank line, once trailing whitespace and trailing
 * fenced blocks are stripped. Earlier paragraphs are narrative and never count.
 */
function finalParagraph(text) {
  if (typeof text !== 'string') return '';
  const t = stripTrailingFences(text);
  const parts = t.split(/\n[ \t]*\n/);
  return parts[parts.length - 1].trim();
}

// ---------------------------------------------------------------------------
// Vetoes: question / hand-off / wait
// ---------------------------------------------------------------------------

// Phrases that hand the decision to the user even without a '?'.
// "on your word" is deliberately ABSENT: "Ready for wave N on your word" is an
// unneeded permission ask that SHOULD auto-continue (AUT-06).
const ASK_RE = new RegExp(
  '\\b(?:' +
    [
      'should i',
      'shall i',
      'do you want',
      'would you like',
      'would you prefer',
      'would you rather',
      'do you prefer',
      'want me to',
      'let me know',
      'can you',
      'could you',
      'please',
      'your call',
      'up to you',
      'over to you',
      "if you(?:['’]d| would) like",
      'if you want',
      "you(?:['’]ll| will)? need to",
      'need you to',
      'needs? your',
    ].join('|') +
    ')\\b',
  'i'
);

/**
 * True when the paragraph asks the user something: its last line ends with
 * '?', any sentence in it ends with '?', or it carries an ask phrase.
 * A '?' inside a URL query string does not count.
 */
function isQuestionToUser(para) {
  if (typeof para !== 'string') return false;
  const lines = para
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const last = lines[lines.length - 1];
  if (/\?[*_`)"'\]”’]*$/.test(last)) return true;
  if (/\?(?=[\s*_`)"'\]”’]|$)/.test(para)) return true;
  return ASK_RE.test(para);
}

/**
 * The offer_next hand-off: a `Next Up` / `Next:` / `Next step` / `Next, run`
 * block that recommends a `/aoforge:` command to the USER. It must never
 * auto-continue — those commands expect a /clear and a human decision.
 */
function isHandoffToUser(para) {
  if (typeof para !== 'string' || !para.includes('/aoforge:')) return false;
  return /(^|\n)\s*(#+\s*)?(▶\s*)?Next( Up|:| step)/i.test(para) || /\bnext\b/i.test(para);
}

const WAIT_RE =
  /\b(?:wait(?:ing)?\s+(?:for|on|until)|in the background|task notifications?|(?:once|when|after)\s+(?:it|they|those|these|each|all|both|the\s+\w+(?:\s+\w+)?)\s+(?:finish(?:es)?|complete[sd]?|reports?|lands?|returns?|comes? back|(?:is|are) done))\b/i;

/** The model is ending its turn to wait on background work. */
function isWaitingOnBackground(para) {
  return typeof para === 'string' && WAIT_RE.test(para);
}

// ---------------------------------------------------------------------------
// Announcement
// ---------------------------------------------------------------------------

// Words ending in -ing that are not gerunds.
const NOT_GERUND = /^(?:bring|string|spring|ring|sing|sting|swing|thing|king|wing|during|nothing|something|anything|everything)$/i;

function isGerund(word) {
  return typeof word === 'string' && /^[a-z]{3,}ing$/i.test(word) && !NOT_GERUND.test(word);
}

// A gerund-led sentence that carries a finite verb is a REPORT with the gerund
// phrase as its subject ("Running the suite showed three failures.", "Writing
// the SUMMARY is the last step."), or carries its own result ("… 412 pass").
const REPORT_RE =
  /\b(?:is|are|was|were|would|will|could|should|might|can|needs|needed|requires|required|showed|shows|revealed|reveals|caught|catches|took|takes|worked|works|passed|passes|failed|fails|succeeded|finished|completed|found|gave|gives|broke|breaks|done)\b|\b\d+\s*(?:pass|fail)/i;

const I_WILL = "I(?:['’]ll| will)\\b";
const LET_ME = "let(?: me|['’]s)\\b";

/**
 * Classify one sentence (already stripped of leading emphasis markers).
 * Returns true when it announces the model's own next action.
 */
function isAnnouncementSentence(s) {
  let m;

  // "Now running …", "Now I'll …", "Now let me …", "Now to/for/on to …"
  if ((m = /^Now,?\s+(\S+)(?:\s+(\S+))?/.exec(s))) {
    const w1 = m[1];
    const w2 = m[2] || '';
    if (isGerund(w1)) return !REPORT_RE.test(s);
    if (new RegExp('^' + I_WILL).test(`${w1} ${w2}`)) return true;
    if (/^I['’]m$/.test(w1) || (w1 === 'I' && w2 === 'am')) {
      // "Now I am writing …" → ['Now', 'I', 'am', 'writing', …]
      const next = w1 === 'I' ? s.split(/\s+/)[3] : w2;
      return isGerund(next) && !REPORT_RE.test(s);
    }
    if (new RegExp('^(?:' + LET_ME + ')', 'i').test(`${w1} ${w2}`)) return true;
    if (/^(?:to|for|onto)$/i.test(w1)) return true;
    if (/^on$/i.test(w1) && /^to$/i.test(w2)) return true;
    return false;
  }

  // "Next, …", "Next I'll …", "Next let me …", "Next <gerund> …".
  // NOT "Next:", "Next steps", "Next Up" — those recommend work to the user.
  if (/^Next\b/.test(s)) {
    if (/^Next,\s*\S/.test(s)) return true;
    if (new RegExp('^Next\\s+(?:' + I_WILL + '|' + LET_ME + '|I(?:[\'’]m| am)\\b)').test(s)) return true;
    const w = (/^Next\s+(\S+)/.exec(s) || [])[1];
    return isGerund(w) && !REPORT_RE.test(s);
  }

  // "Running npm test.", "Writing the SUMMARY." — never "Running: …".
  if (/^(?:Running|Writing)\s+[^\s:]/.test(s)) return !REPORT_RE.test(s);

  // "Starting wave 3."
  if (/^Starting wave\b/.test(s)) return !REPORT_RE.test(s);

  return false;
}

const READY_RE = /Ready for wave \d+[^.\n]*on your word/i;

/** Split a paragraph into sentences on [.!?]+whitespace and on newlines. */
function sentencesOf(para) {
  return para
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Cap the quoted action at 120 characters. */
function cap(s) {
  const t = s.trim();
  return t.length <= 120 ? t : t.slice(0, 119).trimEnd() + '…';
}

/**
 * The announced next action in `text`, or null.
 *
 * Only the FINAL paragraph counts, and within it only its LAST sentence, which
 * must start with `Now …`, `Next, …`, `Running …`, `Writing …` or
 * `Starting wave …` (case-sensitive, so "known"/"snow"/mid-sentence "now"
 * never match). "Ready for wave N … on your word" anywhere in the final
 * paragraph also counts. A question, ask phrase, `/aoforge:` hand-off or a wait
 * on background work vetoes the whole paragraph.
 *
 * @param {unknown} text  last_assistant_message
 * @returns {string|null} the announced sentence, <= 120 chars
 */
function announcedAction(text) {
  if (typeof text !== 'string') return null;
  const para = finalParagraph(text);
  if (!para) return null;

  if (isQuestionToUser(para) || isHandoffToUser(para) || isWaitingOnBackground(para)) return null;

  const ready = READY_RE.exec(para);
  if (ready) return cap(ready[0]);

  const sentences = sentencesOf(para);
  if (sentences.length === 0) return null;
  const last = sentences[sentences.length - 1];
  const bare = last.replace(/^[*_]+/, '').replace(/[*_]+$/, '');
  return isAnnouncementSentence(bare) ? cap(bare) : null;
}

// ---------------------------------------------------------------------------
// Background tasks
// ---------------------------------------------------------------------------

// Statuses that mean the task is finished. Anything else — `running`, and any
// status this hook does not recognise, e.g. `pending` — counts as still
// running, so an unfamiliar shape fails toward NOT blocking.
const FINISHED = new Set([
  'completed',
  'complete',
  'done',
  'succeeded',
  'success',
  'failed',
  'failure',
  'error',
  'errored',
  'killed',
  'cancelled',
  'canceled',
  'stopped',
  'timed_out',
  'timeout',
]);

/**
 * True when any `background_tasks` entry is not yet finished.
 * @param {unknown} tasks  payload.background_tasks
 */
function hasRunningBackground(tasks) {
  if (!Array.isArray(tasks)) return false;
  return tasks.some((t) => {
    if (!t || typeof t !== 'object') return false;
    const status = typeof t.status === 'string' ? t.status.toLowerCase() : '';
    return !FINISHED.has(status);
  });
}

// ---------------------------------------------------------------------------
// decide / main
// ---------------------------------------------------------------------------

/**
 * gate-edits.js owns the marker logic (TRD 27-01: expiry + the worktree's
 * MAIN checkout). Required lazily so a moved or broken file fails open instead
 * of crashing the hook at load time.
 */
function loadMarkerHelpers() {
  const { hasSkillActiveMarker, findPlanningDir, sharedPlanningDir } = require('./gate-edits.js');
  return { hasSkillActiveMarker, findPlanningDir, sharedPlanningDir };
}

function reasonFor(action) {
  return (
    `AOForge auto-continue: you announced "${action}" and then ended your turn. ` +
    'Take that step now, in this turn. If you actually need the user\'s input, ask one explicit ' +
    'question instead of announcing. Never use port 8080.'
  );
}

function skipRequested(env) {
  const v = env && env.AOFORGE_SKIP_AUTOCONTINUE;
  return v === '1' || v === 'true';
}

/**
 * The whole decision, in order. Returns null (no block) or {block, reason}.
 *
 * @param {object} payload  the Stop payload
 * @param {object} [deps]
 * @param {object} [deps.env]          defaults to process.env
 * @param {string} [deps.cwd]          used when payload.cwd is absent
 * @param {Function} [deps.markerLive] (planningDir, sharedDir) → boolean;
 *                                     defaults to gate-edits hasSkillActiveMarker
 * @param {Function} [deps.loadHelpers] test seam for the gate-edits require
 */
function decide(payload, deps = {}) {
  const env = deps.env || process.env;
  if (skipRequested(env)) return null;
  if (!payload || typeof payload !== 'object') return null;

  // Once-guard: the re-stop after a block carries stop_hook_active: true.
  if (payload.stop_hook_active) return null;

  // Main loop only. A subagent's stop belongs to the SubagentStop gate (44-02).
  if (payload.hook_event_name && payload.hook_event_name !== 'Stop') return null;

  let helpers;
  try {
    helpers = (deps.loadHelpers || loadMarkerHelpers)();
  } catch {
    return null;
  }
  if (!helpers || typeof helpers.findPlanningDir !== 'function') return null;

  const cwd = (typeof payload.cwd === 'string' && payload.cwd) || deps.cwd || process.cwd();
  const planningDir = helpers.findPlanningDir(cwd);
  if (!planningDir) return null;

  const markerLive =
    typeof deps.markerLive === 'function'
      ? deps.markerLive
      : (pd, sd) => helpers.hasSkillActiveMarker(pd, sd);
  if (!markerLive(planningDir, helpers.sharedPlanningDir(cwd))) return null;

  if (hasRunningBackground(payload.background_tasks)) return null;

  const action = announcedAction(payload.last_assistant_message);
  if (!action) return null;

  return { block: true, reason: reasonFor(action) };
}

function main() {
  try {
    const raw = require('fs').readFileSync(0, 'utf8');
    if (!raw || !raw.trim()) return;
    const out = decide(JSON.parse(raw), { env: process.env, cwd: process.cwd() });
    if (out && out.block) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: out.reason }));
    }
  } catch {
    // Fail open: no output, exit 0.
  }
}

// No process.exit(): on macOS a pipe write is asynchronous and an explicit
// exit could truncate the JSON. The process ends naturally with code 0.
if (require.main === module) main();

module.exports = {
  finalParagraph,
  isQuestionToUser,
  isHandoffToUser,
  isWaitingOnBackground,
  announcedAction,
  hasRunningBackground,
  decide,
  reasonFor,
};
