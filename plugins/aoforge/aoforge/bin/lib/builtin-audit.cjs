'use strict';

/**
 * builtin-audit.cjs — scanner for the built-in sweep (TRD 62-01, objective 62-built-in-sweep,
 * BLTN-01, BLTN-02, BLTN-03).
 *
 * AOForge's prose (skills and active workflows) should use Claude Code's built-ins instead of
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
 * AskUserQuestion, TaskCreate, TaskUpdate, TaskList and TodoWrite need no permission, so declaring
 * them is harmless. For that reason ExitPlanMode is never reported as "missing" either.
 *
 * TodoWrite (TRD 63-04, BLTN-04) is the session todo store of `/aoforge:todo`: with the Task tools
 * switched off (`CLAUDE_CODE_ENABLE_TASKS=0`) the session task list is written through it. Like the
 * Task tools it is counted only in call form (`TodoWrite(`), so a bare mention is not a use.
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

const fs = require('fs');
const path = require('path');
const { escapeRegExp } = require('./text-escape.cjs');

// ─── constants ──────────────────────────────────────────────────────────────────────

const MIN_REASON = 20;
const WINDOW_ABOVE = 12;
const WINDOW_BELOW = 6;
const MAX_OPTIONS = 4;
const MAX_HEADER = 12;
const BLOCK_LINES = 40;
const NEGATION_CHARS = 24;
const SKIP_WINDOW = 20;
const CALL_CHARS = 400;

const BUILTINS = [
  'AskUserQuestion',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TodoWrite',
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

// ─── frontmatter and tool lists ─────────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Split a SKILL.md / workflow into its `---` frontmatter and its body.
 * @param {string} text
 * @returns {{frontmatter: string, body: string, bodyStartLine: number}} bodyStartLine is the
 *   1-based line of the first body line (1 when there is no frontmatter).
 */
function splitFrontmatter(text) {
  const t = String(text);
  const m = t.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: '', body: t, bodyStartLine: 1 };
  const newlines = (m[0].match(/\n/g) || []).length;
  return {
    frontmatter: m[1] || '',
    body: t.slice(m[0].length),
    bodyStartLine: newlines + (m[0].endsWith('\n') ? 1 : 2),
  };
}

/** Split an inline tool list on commas and whitespace, never inside parentheses (`Bash(git add:*)`). */
function _splitTools(s) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || /\s/.test(ch))) {
      if (cur) out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const _unquote = (s) => s.replace(/^(["'])(.*)\1$/, '$2');

/**
 * Read a tool list from frontmatter text: a YAML list, an inline comma list or a space-separated
 * list. The key is matched at line start, so `allowed-tools` never reads `disallowed-tools`.
 * @param {string} frontmatter
 * @param {string} key  e.g. 'allowed-tools'
 * @returns {string[]} [] when the key is absent
 */
function parseToolList(frontmatter, key) {
  const lines = String(frontmatter).split(/\r?\n/);
  const re = new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const rest = m[1].trim();
    if (rest) return _splitTools(rest.replace(/^\[|\]$/g, '')).map(_unquote);
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      const item = lines[j].match(/^\s*-\s*(\S.*?)\s*$/);
      if (!item) break;
      out.push(_unquote(item[1]));
    }
    return out;
  }
  return [];
}

// ─── built-ins used, workflow references, coverage ──────────────────────────────────

/** AskUserQuestion is named in directive form; every other built-in needs the call form `Tool(`. */
const TOOL_RES = Object.fromEntries(
  BUILTINS.map((t) => [t, new RegExp(t === 'AskUserQuestion' ? String.raw`\bAskUserQuestion\b` : String.raw`\b${t}\(`, 'g')]),
);

function _hasTool(maskedLine, tool) {
  const re = TOOL_RES[tool];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(maskedLine)) !== null) {
    if (!_negated(maskedLine, m.index)) return true;
  }
  return false;
}

/**
 * The built-ins a text uses, sorted. A negated mention ("Never call AskUserQuestion") is not a use.
 * @param {string} body
 * @returns {string[]}
 */
function builtinsUsed(body) {
  const used = new Set();
  for (const raw of String(body).split(/\r?\n/)) {
    const line = _maskMarker(raw);
    for (const tool of BUILTINS) {
      if (!used.has(tool) && _hasTool(line, tool)) used.add(tool);
    }
  }
  return [...used].sort();
}

/**
 * Workflow names a text references (`.../workflows/<name>.md`), once each, in first-seen order.
 * @param {string} text
 * @returns {string[]}
 */
function workflowRefs(text) {
  const out = [];
  const re = /\bworkflows\/([A-Za-z0-9][\w-]*)\.md\b/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Which built-ins a skill uses (in its body and every workflow it reaches, transitively) that its
 * `allowed-tools` does not declare, and whether it declares a forbidden one. Reads the filesystem,
 * read-only. A referenced workflow with no file is skipped; a cycle is walked once.
 * @param {{skillsDir: string, workflowsDir: string, name: string}} opts
 * @returns {{declared: string[], disallowed: string[], used: string[], missing: string[],
 *            forbidden: string[], via: Object<string, string[]>}} `via[tool]` lists the files that use it.
 */
function skillCoverage({ skillsDir, workflowsDir, name }) {
  const skillPath = path.join(skillsDir, name, 'SKILL.md');
  const { frontmatter, body } = splitFrontmatter(fs.readFileSync(skillPath, 'utf-8'));
  const via = {};
  const note = (tools, file) => {
    for (const t of tools) {
      if (!via[t]) via[t] = [];
      if (!via[t].includes(file)) via[t].push(file);
    }
  };
  note(builtinsUsed(body), skillPath);

  const queue = workflowRefs(body);
  const seen = new Set();
  while (queue.length > 0) {
    const n = queue.shift();
    if (seen.has(n)) continue;
    seen.add(n);
    const file = path.join(workflowsDir, `${n}.md`);
    if (!fs.existsSync(file)) continue;
    const wBody = splitFrontmatter(fs.readFileSync(file, 'utf-8')).body;
    note(builtinsUsed(wBody), file);
    queue.push(...workflowRefs(wBody));
  }

  const declared = parseToolList(frontmatter, 'allowed-tools');
  const disallowed = parseToolList(frontmatter, 'disallowed-tools');
  const used = Object.keys(via).sort();
  const missing = used.filter(
    (t) => !declared.includes(t) && !disallowed.includes(t) && !FORBIDDEN_ALLOWED.includes(t),
  );
  const forbidden = FORBIDDEN_ALLOWED.filter((t) => declared.includes(t));
  return { declared, disallowed, used, missing, forbidden, via };
}

// ─── progress and plan mode ─────────────────────────────────────────────────────────

/** The text of the call whose `(` is at `open`, up to the matching `)` or CALL_CHARS characters. */
function _callText(text, open) {
  let depth = 0;
  const end = Math.min(text.length, open + CALL_CHARS);
  for (let i = open; i < end; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open, end);
}

/**
 * Progress wiring across flow texts: TaskCreate( calls, and TaskUpdate( calls whose arguments set
 * `status` to completed or in_progress (either `status="x"` or `status: "x"`, on one line or several).
 * @param {string[]} texts
 * @returns {{creates: number, completes: number, inProgress: number}}
 */
function progressCounts(texts) {
  let creates = 0;
  let completes = 0;
  let inProgress = 0;
  for (const raw of texts) {
    const text = String(raw);
    creates += (text.match(/\bTaskCreate\(/g) || []).length;
    const re = /\bTaskUpdate\(/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const s = _callText(text, m.index + m[0].length - 1).match(/\bstatus\s*[:=]\s*["'`]?(completed|in_progress)\b/);
      if (!s) continue;
      if (s[1] === 'completed') completes++;
      else inProgress++;
    }
  }
  return { creates, completes, inProgress };
}

/**
 * EnterPlanMode() ... ExitPlanMode() spans in a text. Each span reports the 1-based enter line, the
 * exit line (null when no ExitPlanMode follows before the next EnterPlanMode), whether a line from
 * enter to exit (or to the next span, or the end) mentions a draft, and the nearest line within
 * SKIP_WINDOW lines above the enter that names `--auto` (the skip rule), or null.
 * @param {string} text
 * @returns {{enterLine: number, exitLine: number|null, mentionsDraft: boolean, skipLine: number|null}[]}
 */
function planModeSpans(text) {
  const lines = String(text).split(/\r?\n/).map(_maskMarker);
  const enters = [];
  const exits = [];
  lines.forEach((l, i) => {
    if (_hasTool(l, 'EnterPlanMode')) enters.push(i);
    if (_hasTool(l, 'ExitPlanMode')) exits.push(i);
  });
  return enters.map((enter, k) => {
    const nextEnter = k + 1 < enters.length ? enters[k + 1] : lines.length;
    const exit = exits.find((x) => x > enter && x < nextEnter);
    const end = exit !== undefined ? exit : nextEnter - 1;
    let mentionsDraft = false;
    for (let j = enter; j <= end && !mentionsDraft; j++) mentionsDraft = /\bdraft/i.test(lines[j]);
    let skipLine = null;
    for (let j = enter - 1; j >= Math.max(0, enter - SKIP_WINDOW); j--) {
      if (lines[j].includes('--auto')) {
        skipLine = j + 1;
        break;
      }
    }
    return { enterLine: enter + 1, exitLine: exit !== undefined ? exit + 1 : null, mentionsDraft, skipLine };
  });
}

// ─── scan set and groups ────────────────────────────────────────────────────────────

const SKILLS_DIR = 'plugins/aoforge/skills/';
const WORKFLOWS_DIR = 'plugins/aoforge/aoforge/workflows/';

function _list(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
}

function _isLegacy(text) {
  const m = splitFrontmatter(text).frontmatter.match(/^status:\s*(\S+)/m);
  return m !== null && m[1] === 'legacy';
}

/**
 * Every file the sweep scans: skills (plugins/aoforge/skills/<name>/SKILL.md) and active workflows
 * (plugins/aoforge/aoforge/workflows/*.md, minus `status: legacy`). Agents, references and templates
 * are out of scope. Read-only.
 * @param {string} repoRoot
 * @returns {{rel: string, text: string}[]} sorted by rel (POSIX)
 */
function scanSet(repoRoot) {
  const out = [];
  for (const e of _list(path.join(repoRoot, SKILLS_DIR))) {
    if (!e.isDirectory()) continue;
    const rel = `${SKILLS_DIR}${e.name}/SKILL.md`;
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) out.push({ rel, text: fs.readFileSync(abs, 'utf-8') });
  }
  for (const e of _list(path.join(repoRoot, WORKFLOWS_DIR))) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const rel = `${WORKFLOWS_DIR}${e.name}`;
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
    if (!_isLegacy(text)) out.push({ rel, text });
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/**
 * Pinned partition of the sweep between the conversion TRDs (62-04..62-09 and 62-11): one owner per
 * file. Skills map to plugins/aoforge/skills/<name>/SKILL.md, workflows to
 * plugins/aoforge/aoforge/workflows/<name>.md. `todo-status-objective` predates workstreams joining
 * it; the name is kept. 62-03's repo test checks the table against the real tree.
 */
const GROUPS = {
  'micro-quick-debug': {
    skills: ['micro', 'quick', 'debug'],
    workflows: ['micro', 'quick'],
  },
  'verify-work': {
    skills: ['verify-work'],
    workflows: ['verify-work', 'diagnose-issues', 'verify-objective'],
  },
  'plan-build': {
    skills: ['plan-objective', 'build'],
    workflows: ['plan-objective', 'build'],
  },
  'new-project': {
    skills: ['new-project'],
    workflows: ['new-project'],
  },
  milestone: {
    skills: ['milestone'],
    workflows: ['complete-milestone', 'new-milestone', 'audit-milestone', 'plan-milestone-gaps'],
  },
  'execute-and-map': {
    skills: ['execute-objective', 'discuss-objective', 'map-codebase', 'adopt'],
    workflows: [
      'execute-objective',
      'transition',
      'execute-trd',
      'discuss-objective',
      'discovery-objective',
      'map-codebase',
      'adopt',
    ],
  },
  'todo-status-objective': {
    skills: ['todo', 'status', 'objective', 'decide', 'handoff', 'workstreams'],
    workflows: [
      'add-todo',
      'check-todos',
      'health',
      'pause-work',
      'progress',
      'resume-project',
      'add-objective',
      'remove-objective',
      'workstreams-merge',
      'workstreams-run',
      'workstreams-setup',
      'workstreams-status',
    ],
  },
  remaining: {
    skills: [
      'security-audit',
      'cleanup',
      'settings',
      'set-profile',
      'help',
      'design-review',
      'ui-eval',
      'research-objective',
      'list-objective-assumptions',
      'flow',
      'gh-sync',
      'doctor',
      'awareness',
      'initiatives',
      'sync-roadmap',
      'tui',
    ],
    workflows: [
      'security-audit',
      'cleanup',
      'settings',
      'set-profile',
      'help',
      'design-review',
      'ui-eval',
      'research-objective',
      'list-objective-assumptions',
    ],
  },
};

/** GROUPS expanded to repo-relative paths, per group (skills first, then workflows). */
const GROUP_PATHS = Object.fromEntries(
  Object.entries(GROUPS).map(([group, t]) => [
    group,
    [...t.skills.map((n) => `${SKILLS_DIR}${n}/SKILL.md`), ...t.workflows.map((n) => `${WORKFLOWS_DIR}${n}.md`)],
  ]),
);

/**
 * The conversion group that owns a repo-relative path, or null when the table does not pin it
 * (a legacy workflow, or a file outside the scan set).
 * @param {string} relPath
 * @returns {string|null}
 */
function groupOf(relPath) {
  const rel = String(relPath).split(path.sep).join('/');
  for (const [group, paths] of Object.entries(GROUP_PATHS)) {
    if (paths.includes(rel)) return group;
  }
  return null;
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
  GROUPS,
  GROUP_PATHS,
  scanPrompts,
  splitFrontmatter,
  parseToolList,
  builtinsUsed,
  workflowRefs,
  skillCoverage,
  progressCounts,
  planModeSpans,
  scanSet,
  groupOf,
};
