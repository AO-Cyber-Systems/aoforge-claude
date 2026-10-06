'use strict';

/**
 * builtin-audit.cjs — scanner for the built-in sweep (TRD 62-01, objective 62-built-in-sweep,
 * BLTN-01, BLTN-02, BLTN-03).
 *
 * DevFlow's prose (skills and active workflows) should use Claude Code's built-ins instead of
 * ad hoc text: AskUserQuestion for discrete choices (BLTN-03), TaskCreate/TaskUpdate for progress
 * (BLTN-01) and EnterPlanMode/ExitPlanMode for draft review (BLTN-02). This module measures how
 * far the prose is from that, so a repo test can ratchet it. `builtin-sweep.repo.test.cjs`
 * (TRD 62-03) is the consumer: it walks the real tree with scanSet and asserts against
 * scanPrompts, skillCoverage, progressCounts, planModeSpans and groupOf.
 *
 * What scanPrompts counts (a line scanner with a window, deliberately not clever):
 *   - prose-choice: a discrete-choice prompt written as prose ("(y/n)", "Reply with a number",
 *     "Offer: 1) ... 2) ...", "Options:", "Wait for user response."). It is SATISFIED, and so not a
 *     finding, when a non-negated AskUserQuestion mention sits within WINDOW_ABOVE lines above
 *     or WINDOW_BELOW lines below it. Field lines of an AskUserQuestion payload (`question:`,
 *     `header:`, `label:`, ...) are never prose prompts. A negation ("never", "no", "not",
 *     "without", "n't", "do not") in the 24 characters before a trigger voids that trigger, and
 *     before an AskUserQuestion mention voids that mention.
 *   - ask-without-options: an `AskUserQuestion(` call whose parenthesised block has no `options`.
 *   - header-too-long: a `header` field over MAX_HEADER characters (the tool's limit is 12).
 *   - too-many-options: a `question` field followed by more than MAX_OPTIONS option entries (the
 *     tool takes 2 to 4).
 *
 * Inline allow marker: `<!-- builtin-audit: allow <reason> -->` on the flagged line, or on the line
 * directly above it, suppresses every finding on that line. The reason must be at least
 * MIN_REASON chars. A marker with a short reason, or one that suppresses nothing (stale), is a bad
 * marker and the repo test fails on it. The marker text is masked before patterns run, so a
 * reason that quotes "yes/no" is never itself a finding. Use it for free-text questions and
 * quoted examples, not to hide a real choice.
 *
 * Declarations. skillCoverage follows a skill's workflow references transitively and reports the
 * built-ins the skill (or any workflow it reaches) uses that its `allowed-tools` does not declare,
 * minus `disallowed-tools`. It also reports a forbidden declaration: ExitPlanMode must never be in
 * `allowed-tools`. Claude Code's skills reference says `allowed-tools` lists "Tools Claude can use
 * without asking permission during the turn that invokes this skill". The tools reference marks
 * ExitPlanMode "Permission required: Yes", and its permission prompt IS the plan approval.
 * Pre-approving it risks approving the very draft the user is meant to review. EnterPlanMode,
 * AskUserQuestion, TaskCreate and TaskUpdate need no permission, so declaring them is harmless.
 * For that reason ExitPlanMode is never reported as "missing" either.
 *
 * Progress and plan mode. progressCounts totals TaskCreate(/TaskUpdate( wiring across flow files.
 * planModeSpans finds EnterPlanMode()...ExitPlanMode() spans, whether each presents a draft, and
 * the skip rule (naming `--auto`) that should precede it.
 *
 * Pure module: text in, results out. Only skillCoverage and scanSet read the filesystem,
 * read-only. No git, no gh, no network, no child processes. References, templates and agents are
 * out of scope on purpose: references explain, templates are copied into projects, and a subagent
 * cannot reach the user (its questions return to the orchestrator as checkpoints).
 */

// ─── constants ──────────────────────────────────────────────────────────────────────

const MIN_REASON = 20;
const WINDOW_ABOVE = 12;
const WINDOW_BELOW = 6;
const MAX_OPTIONS = 4;
const MAX_HEADER = 12;
const BLOCK_LINES = 40;
const NEGATION_CHARS = 24;

const BUILTINS = [
  'AskUserQuestion',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'EnterPlanMode',
  'ExitPlanMode',
];
const FORBIDDEN_ALLOWED = ['ExitPlanMode'];

// ─── regexes ────────────────────────────────────────────────────────────────────────

const MARKER_RE = /<!--\s*builtin-audit:\s*allow\b\s*([\s\S]*?)\s*-->/;

/** A parenthesised slash list: `(y/n)`, `(yes / edit / skip)`. No nested quantifier over one char class. */
const SLASH_LIST = String.raw`\(\s*[\w-]+(?: [\w-]+)*(?:\s*\/\s*[\w-]+(?: [\w-]+)*)+\s*\)`;

/**
 * Trigger patterns for a prose prompt. Each is global so every match position can be tested for
 * negation. Case-insensitive except `Ask:` and the line-start list heads. One finding per line
 * however many match.
 */
const CHOICE_PATTERNS = [
  // slash choice after a question mark: `Proceed? (y/n)`
  new RegExp(String.raw`\?\s*["'“]?\s*${SLASH_LIST}`, 'g'),
  // the same list alone on a line: `(yes / wait / adjust scope)`
  new RegExp(String.raw`^\s*(?:[-*]\s+)?${SLASH_LIST}[.:]?\s*$`, 'g'),
  /\[y\/n\]/gi,
  /\b(?:Reply|Respond|Answer)\s+(?:with\b|")/gi,
  /\bType\s+"[^"]+"\s+(?:or|to)\b/gi,
  // line-start list heads, case-sensitive
  /^\s*(?:[-*]\s+)?(?:\*\*)?(?:Options|Offer options|Offer|Choose|Pick one|Select one)(?:\*\*)?:/g,
  // inline offers
  /\bOffer:\s*1[.)]/gi,
  /\boffer:\s+[^/\n]+\//gi,
  /\b(?:present|offer)s?\s+(?:\d+|two|three|four)\s+options\b/gi,
  /\bask(?:s|ed)?\s+(?:the\s+)?user\s+(?:if|whether|which)\b/gi,
  /\bAsk:\s*"/g,
  /\bWait for (?:the )?(?:user(?:'s)?\s+)?(?:response|decision|selection|choice|confirmation|reply)\b/gi,
  /\boffer(?:s|ed)? to\s+\w+/gi,
  /\bpicks? (?:a )?number\b/gi,
];

/** Negation as a word in the characters before a token. */
const NEGATION_RE = /\b(?:never|no|not|without)\b|\w*n['’]t\b|\bdo not\b/i;

/** First token (after `-`/`*` and an optional `{`) is an AskUserQuestion payload field. */
const FIELD_LINE_RE = /^\s*(?:[-*]\s+)?\{?\s*(?:question|header|label|description|options|multiSelect)\s*[:=]/;
const QUESTION_FIELD_RE = /^\s*(?:[-*]\s+)?\{?\s*question\s*[:=]/;
const HEADER_FIELD_RE = /\bheader\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|“([^”]*)”)/g;
const LABEL_ENTRY_RE = /\{\s*label\s*:/g;
const BULLET_OPTION_RE = /^\s*[-*]\s+"[^"]+"\s+[—–-]/;
const HEADING_RE = /^#{1,6} /;
const STEP_TAG_RE = /<\/?step\b/;
const ASK_CALL_RE = /\bAskUserQuestion\(/;

// ─── scanPrompts ────────────────────────────────────────────────────────────────────

const _blank = (s) => ' '.repeat(s.length);

function _maskMarker(line) {
  return line.replace(new RegExp(MARKER_RE.source, 'g'), _blank);
}

function _negated(line, start) {
  return NEGATION_RE.test(line.slice(Math.max(0, start - NEGATION_CHARS), start));
}

/** Does any CHOICE pattern match this masked line at a position no negation governs? */
function _choiceTrigger(masked) {
  for (const re of CHOICE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(masked)) !== null) {
      if (!_negated(masked, m.index)) return true;
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return false;
}

/** Does this masked line carry a non-negated AskUserQuestion mention? */
function _mention(masked) {
  const re = /AskUserQuestion/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    if (!_negated(masked, m.index)) return true;
  }
  return false;
}

/** The text of the parenthesised block opened on line `i`, until depth 0 or BLOCK_LINES lines. */
function _callBlock(masked, i) {
  const open = masked[i].search(ASK_CALL_RE);
  let depth = 0;
  let block = '';
  for (let j = i; j < Math.min(masked.length, i + BLOCK_LINES); j++) {
    const segment = j === i ? masked[j].slice(open) : masked[j];
    for (const ch of segment) {
      block += ch;
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) return block;
    }
    block += '\n';
  }
  return block;
}

/** Option entries after the `question` field on line `i`, up to the next boundary. */
function _optionCount(masked, i) {
  let n = 0;
  for (let j = i + 1; j < Math.min(masked.length, i + 1 + BLOCK_LINES); j++) {
    const l = masked[j];
    if (QUESTION_FIELD_RE.test(l) || HEADING_RE.test(l) || STEP_TAG_RE.test(l)) break;
    const labels = l.match(LABEL_ENTRY_RE);
    if (labels) n += labels.length;
    else if (BULLET_OPTION_RE.test(l)) n++;
  }
  return n;
}

/**
 * Scan one file's text for prose choice prompts, AskUserQuestion schema breaks and bad markers.
 * @param {string} text
 * @returns {{findings: {line:number, kind:string, text:string}[],
 *            allowed: {line:number, reason:string}[],
 *            badMarkers: {line:number, why:'short'|'stale'}[]}}
 */
function scanPrompts(text) {
  const lines = String(text).split(/\r?\n/);
  const masked = lines.map(_maskMarker);
  const mentions = [];
  masked.forEach((l, i) => {
    if (_mention(l)) mentions.push(i);
  });
  const satisfied = (i) => mentions.some((m) => m >= i - WINDOW_ABOVE && m <= i + WINDOW_BELOW);

  /** @type {Map<number, {line:number, kind:string, text:string}[]>} */
  const raw = new Map();
  const add = (i, kind) => {
    if (!raw.has(i)) raw.set(i, []);
    raw.get(i).push({ line: i + 1, kind, text: lines[i].trim() });
  };

  masked.forEach((l, i) => {
    if (!FIELD_LINE_RE.test(l) && _choiceTrigger(l) && !satisfied(i)) add(i, 'prose-choice');

    HEADER_FIELD_RE.lastIndex = 0;
    let h;
    while ((h = HEADER_FIELD_RE.exec(l)) !== null) {
      const value = h[1] !== undefined ? h[1] : h[2] !== undefined ? h[2] : h[3];
      if (value.length > MAX_HEADER) {
        add(i, 'header-too-long');
        break;
      }
    }

    if (ASK_CALL_RE.test(l) && !/\boptions\b/.test(_callBlock(masked, i))) add(i, 'ask-without-options');

    if (QUESTION_FIELD_RE.test(l) && _optionCount(masked, i) > MAX_OPTIONS) add(i, 'too-many-options');
  });

  const allowed = [];
  const badMarkers = [];
  lines.forEach((l, i) => {
    const m = l.match(MARKER_RE);
    if (!m) return;
    const reason = m[1].trim();
    if (reason.length < MIN_REASON) {
      badMarkers.push({ line: i + 1, why: 'short' });
      return;
    }
    const target = raw.has(i) ? i : raw.has(i + 1) ? i + 1 : null;
    if (target === null) {
      badMarkers.push({ line: i + 1, why: 'stale' });
      return;
    }
    raw.delete(target);
    allowed.push({ line: target + 1, reason });
  });

  const findings = [...raw.values()]
    .flat()
    .sort((a, b) => a.line - b.line || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return { findings, allowed, badMarkers };
}

module.exports = {
  MIN_REASON,
  WINDOW_ABOVE,
  WINDOW_BELOW,
  MAX_OPTIONS,
  MAX_HEADER,
  BUILTINS,
  FORBIDDEN_ALLOWED,
  MARKER_RE,
  CHOICE_PATTERNS,
  scanPrompts,
};
