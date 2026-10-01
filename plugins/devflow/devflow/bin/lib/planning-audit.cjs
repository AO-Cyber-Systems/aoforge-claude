'use strict';

/**
 * planning-audit.cjs — SC1 scanner for direct planning-file write instructions (TRD 48-04,
 * objective 48-planning-write-path-migration, GWP-02, decision D-21).
 *
 * The prose that drives DevFlow (skills, workflows, agents, templates) must reach planning
 * files through df-tools verbs, so that store mode (GitHub as the store) and local mode both
 * work. This module finds the lines that still tell an agent to write a planning file
 * directly. `planning-writes.repo.test.cjs` walks the repo with it and ratchets the counts.
 *
 * Scan set (scanSet): plugins/devflow/skills/<name>/SKILL.md, plugins/devflow/devflow/workflows/*.md
 * (minus `status: legacy` frontmatter), plugins/devflow/agents/*.md and
 * plugins/devflow/devflow/templates/**\/*.md. References (plugins/devflow/devflow/references/)
 * are out of scope on purpose: they explain, they do not instruct.
 *
 * A line is a write DIRECTIVE when it carries a write verb that no negation governs, and an
 * artifact token on the same line:
 *   - word forms (WRITE_VERB_RE, case-insensitive) need the artifact within MAX_GAP chars;
 *   - operator forms (WRITE_OP_RE: Write(, Edit(, cat >, cat <<, a redirect into .planning/,
 *     tee, sed -i, frontmatter set|merge, template fill) take any artifact on the line.
 * `@~/.claude/...` references are masked first: a template path is a read, not the file. So is
 * the quoted message of a `df-tools commit "<msg>"` call ("docs: create roadmap" narrates).
 *
 * A directive is SATISFIED when a df-tools verb call (VERB_CALL_RE) appears within
 * WINDOW lines above or below it. An unsatisfied directive is a finding.
 *
 * Inline allow marker: `<!-- planning-audit: allow <reason> -->` on the flagged line, or on
 * the line directly above it, suppresses that one finding. The reason must be at least
 * MIN_REASON chars. A marker with a short reason, or one that suppresses nothing, is a bad
 * marker; the repo test fails on any bad marker. Use it only for lines that are read-only,
 * explanatory, or about runtime/tracked-config paths (STACK.md, config.json, .trd-progress/).
 *
 * scanWrites is pure: text in, findings out. scanSet does the read-only fs walk. No gh, no git.
 */

const fs = require('fs');
const path = require('path');

const WINDOW = 3;
const MAX_GAP = 80;
const MIN_REASON = 20;

// ─── regexes ────────────────────────────────────────────────────────────────────────

/** Word-form write verbs. Case-insensitive; the artifact must sit within MAX_GAP chars. */
const WRITE_VERB_RE =
  /\b(write|writes|create|creates|update|updates|append|appends|save|saves|edit|fill|overwrite|rewrite)\b/gi;

/**
 * Operator-form writes. Any artifact on the same line counts. The redirect form refuses a
 * `>` that closes a tag or an arrow (`<files>.planning/...`, `-->`, `=>`) and an fd number.
 */
const WRITE_OP_RE =
  /Write\(|Edit\(|\bcat\s*>|\bcat\s*<<|(?<![\w"'=\-\/<])>>?\s*\S*\.planning\/|\btee\b|\bsed -i\b|\bfrontmatter (?:set|merge)\b|\btemplate fill\b/g;

/** Planning artifact tokens. Case-sensitive. Group 1|2|3 is the reported artifact name. */
const ARTIFACT_RE =
  /\b(TRD|SUMMARY|VERIFICATION|UAT|RESEARCH|CONTEXT|REQUIREMENTS|ROADMAP|MILESTONES)s?\b|\b(OBJECTIVE\.md|PROJECT\.md|STATE\.md)|\b(codebase\/|todos\/|debug\/|quick\/|research\/|milestones\/|decisions\/)/g;

/** A df-tools verb that writes through the store (or is store-aware), satisfying a directive. */
const VERB_CALL_RE =
  /df-tools(?:\.cjs)?\s+(plan (put-trd|push)|objective (put|set-status|add|insert|complete)|summary (post|checkpoint)|verification post|doc put|decision (open|answer)|todo (add|complete)|debug (put|resolve)|quick (put|summary)|milestone (put|complete)|planning (draft|import|mode)|state [a-z-]+|roadmap update-job-progress|requirements mark-complete|template fill|gh pull)/;

/** Negation governing the verb: up to two plain words between it and the verb, no clause break. */
const NEGATION_BEFORE_RE =
  /\b(?:never|not|no|cannot|\w*n['’]t)[*_`]*\s+(?:[^\s,.;:]+\s+){0,2}[*_`]*$/i;

const MARKER_RE = /<!--\s*planning-audit:\s*allow\b\s*([\s\S]*?)\s*-->/;

/** `@~/.claude/...` and bare `~/.claude/...` references: reads of shipped files, never targets. */
const CLAUDE_REF_RE = /@?~\/\.claude\/\S*/g;

// ─── groups (D-21) ──────────────────────────────────────────────────────────────────

/**
 * Pinned group table. Each prose TRD (48-16 plan, 48-17 execute, 48-18 verify, 48-19 bootstrap,
 * 48-20 work, 48-21 misc) owns one group and its baseline file. `misc` is every other file.
 * Template entries ending in `/` are directory prefixes.
 */
const GROUPS = {
  plan: {
    agents: ['planner', 'objective-researcher', 'job-checker'],
    workflows: [
      'plan-objective',
      'research-objective',
      'discuss-objective',
      'plan-milestone-gaps',
      'discovery-objective',
      'list-objective-assumptions',
    ],
    skills: ['plan-objective', 'research-objective', 'discuss-objective', 'list-objective-assumptions'],
    templates: ['trd-prompt', 'objective', 'research', 'context', 'discovery', 'planner-subagent-prompt'],
  },
  execute: {
    agents: ['executor'],
    workflows: ['execute-objective', 'execute-trd', 'transition', 'build'],
    skills: ['execute-objective', 'build'],
    templates: ['summary', 'job-prompt'],
  },
  verify: {
    agents: ['verifier', 'integration-checker', 'ui-evaluator', 'security-auditor'],
    workflows: ['verify-work', 'verify-objective', 'diagnose-issues', 'ui-eval', 'design-review', 'security-audit'],
    skills: ['verify-work', 'ui-eval', 'design-review', 'security-audit'],
    templates: ['UAT', 'verification-report'],
  },
  bootstrap: {
    agents: ['roadmapper', 'project-researcher', 'research-synthesizer'],
    workflows: [
      'new-project',
      'new-milestone',
      'complete-milestone',
      'audit-milestone',
      'adopt',
      'add-objective',
      'remove-objective',
    ],
    skills: ['new-project', 'milestone', 'adopt', 'objective'],
    templates: [
      'project',
      'milestone',
      'milestone-archive',
      'requirements',
      'roadmap',
      'state',
      'state_archive',
      'research-project/',
    ],
  },
  work: {
    agents: ['debugger'],
    workflows: ['add-todo', 'check-todos', 'quick', 'micro'],
    skills: ['todo', 'decide', 'debug', 'quick', 'micro'],
    templates: ['DEBUG', 'debug-subagent-prompt'],
  },
  misc: { agents: [], workflows: [], skills: [], templates: [] },
};

const AGENTS_DIR = 'plugins/devflow/agents/';
const SKILLS_DIR = 'plugins/devflow/skills/';
const WORKFLOWS_DIR = 'plugins/devflow/devflow/workflows/';
const TEMPLATES_DIR = 'plugins/devflow/devflow/templates/';

/** GROUPS expanded to repo-relative paths (or `/`-terminated prefixes), per group. */
const GROUP_PATHS = Object.fromEntries(
  Object.entries(GROUPS).map(([group, t]) => [
    group,
    [
      ...t.agents.map((n) => `${AGENTS_DIR}${n}.md`),
      ...t.workflows.map((n) => `${WORKFLOWS_DIR}${n}.md`),
      ...t.skills.map((n) => `${SKILLS_DIR}${n}/SKILL.md`),
      ...t.templates.map((n) => (n.endsWith('/') ? `${TEMPLATES_DIR}${n}` : `${TEMPLATES_DIR}${n}.md`)),
    ],
  ]),
);

/** The group a repo-relative path belongs to; `misc` when the table does not pin it. */
function groupOf(relPath) {
  const rel = String(relPath).split(path.sep).join('/');
  for (const [group, paths] of Object.entries(GROUP_PATHS)) {
    for (const p of paths) {
      if (p.endsWith('/') ? rel.startsWith(p) : rel === p) return group;
    }
  }
  return 'misc';
}

// ─── scanner ────────────────────────────────────────────────────────────────────────

function _matches(re, text) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, m });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

function _negated(line, start) {
  return NEGATION_BEFORE_RE.test(line.slice(0, start));
}

function _gap(a, b) {
  if (b.start >= a.end) return b.start - a.end;
  if (a.start >= b.end) return a.start - b.end;
  return 0;
}

/** The quoted message of a `df-tools commit "<msg>"` call: narration of a commit, not a write. */
const COMMIT_MSG_RE = /(df-tools(?:\.cjs)?\s+(?:--cwd\s+\S+\s+)?commit\s+)("[^"]*"|'[^']*')/g;

const _blank = (s) => ' '.repeat(s.length);

/**
 * Blank out `@~/.claude/...` references, the allow marker and commit messages, keeping
 * columns stable so the MAX_GAP distance is measured on the original layout.
 */
function _mask(line) {
  // Commit messages first: the `~/.claude/...` mask would blank the `df-tools.cjs` anchor.
  return line
    .replace(COMMIT_MSG_RE, (_s, call, msg) => call + _blank(msg))
    .replace(CLAUDE_REF_RE, _blank)
    .replace(new RegExp(MARKER_RE.source, 'g'), _blank);
}

/**
 * The artifact a single line is a write directive for, or null.
 * @param {string} line
 * @returns {string|null}
 */
function directiveArtifact(line) {
  const masked = _mask(line);
  const artifacts = _matches(ARTIFACT_RE, masked).map((a) => ({
    ...a,
    name: a.m[1] || a.m[2] || a.m[3],
  }));
  if (artifacts.length === 0) return null;

  const nearest = (v) => artifacts.reduce((best, a) => (_gap(v, a) < _gap(v, best) ? a : best));

  const verbs = [
    ..._matches(WRITE_VERB_RE, masked).map((v) => ({ ...v, word: true })),
    ..._matches(WRITE_OP_RE, masked).map((v) => ({ ...v, word: false })),
  ].sort((a, b) => a.start - b.start);

  for (const v of verbs) {
    if (_negated(masked, v.start)) continue;
    const a = nearest(v);
    if (v.word && _gap(v, a) > MAX_GAP) continue;
    return a.name;
  }
  return null;
}

/**
 * Scan one file's text.
 * @param {string} text
 * @returns {{findings: {line:number, text:string, artifact:string}[],
 *            allowed: {line:number, reason:string}[],
 *            badMarkers: {line:number, problem:string}[]}}
 */
function scanWrites(text) {
  const lines = String(text).split(/\r?\n/);
  const verbLines = new Set();
  lines.forEach((l, i) => {
    if (VERB_CALL_RE.test(l)) verbLines.add(i);
  });
  const satisfied = (i) => {
    for (let j = Math.max(0, i - WINDOW); j <= Math.min(lines.length - 1, i + WINDOW); j++) {
      if (verbLines.has(j)) return true;
    }
    return false;
  };

  // Unsatisfied directives, keyed by 0-based line index.
  const raw = new Map();
  lines.forEach((l, i) => {
    const artifact = directiveArtifact(l);
    if (artifact && !satisfied(i)) raw.set(i, { line: i + 1, text: l.trim(), artifact });
  });

  const allowed = [];
  const badMarkers = [];
  lines.forEach((l, i) => {
    const m = l.match(MARKER_RE);
    if (!m) return;
    const reason = m[1].trim();
    if (reason.length < MIN_REASON) {
      badMarkers.push({
        line: i + 1,
        problem: `short reason (${reason.length} chars, need >= ${MIN_REASON})`,
      });
      return;
    }
    const target = raw.has(i) ? i : raw.has(i + 1) ? i + 1 : null;
    if (target === null) {
      badMarkers.push({ line: i + 1, problem: 'stale marker: suppresses no finding on this line or the next' });
      return;
    }
    raw.delete(target);
    allowed.push({ line: target + 1, reason });
  });

  const findings = [...raw.values()].sort((a, b) => a.line - b.line);
  return { findings, allowed, badMarkers };
}

// ─── scan set ───────────────────────────────────────────────────────────────────────

/** Frontmatter `status:` value, or null when the text has no --- frontmatter block. */
function frontmatterStatus(text) {
  const fm = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^status:\s*(\S+)/m);
  return m ? m[1] : null;
}

function _list(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function _walkMd(root, rel, out) {
  for (const e of _list(path.join(root, rel))) {
    const childRel = `${rel}${e.name}`;
    if (e.isDirectory()) _walkMd(root, `${childRel}/`, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(childRel);
  }
}

/**
 * Repo-relative paths of every file the audit scans, sorted. Read-only.
 * @param {string} repoRoot
 * @returns {string[]}
 */
function scanSet(repoRoot) {
  const out = [];
  for (const e of _list(path.join(repoRoot, SKILLS_DIR))) {
    if (!e.isDirectory()) continue;
    const rel = `${SKILLS_DIR}${e.name}/SKILL.md`;
    if (fs.existsSync(path.join(repoRoot, rel))) out.push(rel);
  }
  for (const e of _list(path.join(repoRoot, AGENTS_DIR))) {
    if (e.isFile() && e.name.endsWith('.md')) out.push(`${AGENTS_DIR}${e.name}`);
  }
  for (const e of _list(path.join(repoRoot, WORKFLOWS_DIR))) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const rel = `${WORKFLOWS_DIR}${e.name}`;
    if (frontmatterStatus(fs.readFileSync(path.join(repoRoot, rel), 'utf-8')) === 'legacy') continue;
    out.push(rel);
  }
  _walkMd(repoRoot, TEMPLATES_DIR, out);
  return out.sort();
}

module.exports = {
  WINDOW,
  MAX_GAP,
  MIN_REASON,
  WRITE_VERB_RE,
  WRITE_OP_RE,
  ARTIFACT_RE,
  VERB_CALL_RE,
  MARKER_RE,
  GROUPS,
  GROUP_PATHS,
  groupOf,
  directiveArtifact,
  scanWrites,
  frontmatterStatus,
  scanSet,
};
