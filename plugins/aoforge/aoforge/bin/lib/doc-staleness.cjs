'use strict';

// doc-staleness.cjs — the four documentation-staleness advisories (TRD 38-07).
//
// One read-only, synchronous function answers "which of this project's docs are stale?" for:
//   W050  removed-command references still live in CLAUDE.md's AOFORGE block or STATE.md
//   W051  .planning/STACK.md has no (or an old) provenance.reviewed date
//   W052  .planning/STACK.md declares languages the repo's own manifest no longer matches
//   W053  .planning/codebase/*.md is N commits behind HEAD, excluding .planning churn
//
// All four are advisories only — nothing here writes, and no issue is ever `repairable: true`.
// Every surface (health, `validate docs`, telemetry, status) calls this module so they can never
// disagree (38-10/38-11).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { scanText } = require('./doc-refs.cjs');
const { read: readManagedBlock, ManagedBlockError } = require('./managed-block.cjs');
const { parseProfile, StackProfileError } = require('./stack-profile.cjs');
const { detectManifest } = require('./project-state.cjs');

// Modeled on awareness.cjs's `peer_stale_days` default pattern. Not added to
// templates/config.json — these live in code; 38-12 documents the config.docs overrides.
const DEFAULTS = Object.freeze({
  stack_review_stale_days: 90,
  codebase_map_stale_commits: 50,
});

const SESSION_LOG_RE = /^##\s+Session Log[^\n]*$/m;

// {typescript<->javascript, dart<->flutter} per W052's must_have. Comparison is
// case-insensitive; this table is consulted after lower-casing both sides.
const LANGUAGE_ALIASES = {
  typescript: 'javascript',
  javascript: 'typescript',
  dart: 'flutter',
  flutter: 'dart',
};

// ─── git seam (the `_setRunFs` pattern from project-hygiene.cjs) ──────────────────────────────

function defaultRunGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

let runGit = defaultRunGit;

function _setRunGit(fn) {
  runGit = fn;
}

function _resetRunGit() {
  runGit = defaultRunGit;
}

// ─── small helpers ──────────────────────────────────────────────────────────────────────────

/** Parse a `YYYY-MM-DD` string as UTC midnight. Returns `null` on anything else. */
function _parseDateUTC(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(ms)) return null;
  // Reject dates that overflowed (e.g. 2026-13-40 rolling into another month/year).
  const check = new Date(ms);
  if (check.getUTCFullYear() !== Number(y) || check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)) {
    return null;
  }
  return check;
}

/** Whole days between two Date objects (UTC), floored. */
function _daysBetween(earlier, later) {
  const ms = later.getTime() - earlier.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function _readConfig(config) {
  const docs = (config && config.docs) || {};
  return {
    stack_review_stale_days: typeof docs.stack_review_stale_days === 'number'
      ? docs.stack_review_stale_days
      : DEFAULTS.stack_review_stale_days,
    codebase_map_stale_commits: typeof docs.codebase_map_stale_commits === 'number'
      ? docs.codebase_map_stale_commits
      : DEFAULTS.codebase_map_stale_commits,
  };
}

/** Case-insensitive membership, honoring the alias table both ways. */
function _aliasMatches(declaredList, detectedLang) {
  if (!detectedLang) return false;
  const detected = String(detectedLang).toLowerCase();
  const alias = LANGUAGE_ALIASES[detected];
  for (const raw of declaredList) {
    const d = String(raw).toLowerCase();
    if (d === detected || d === alias) return true;
  }
  return false;
}

/** True when a git stderr/message string is git's own "not a git repository" complaint. */
function _looksLikeNotAGitRepo(message) {
  return /not a git repository/i.test(String(message || ''));
}

/**
 * Splits STATE.md text at the first `## Session Log` heading (the same regex as migration
 * 0002). Returns the part(s) that should be scanned: everything before the Session Log, plus
 * anything from a LATER `## ` heading onward (so post-log sections are not silently skipped).
 */
function _excludeSessionLog(text) {
  const match = SESSION_LOG_RE.exec(text);
  if (!match) return text;
  const before = text.slice(0, match.index);
  const rest = text.slice(match.index + match[0].length);
  const nextHeadingMatch = /^##\s+.+$/m.exec(rest);
  if (!nextHeadingMatch) return before;
  return before + rest.slice(nextHeadingMatch.index);
}

// ─── W050 — removed-command references ─────────────────────────────────────────────────────

function _checkRemovedRefs({ projectRoot, issues }) {
  let anyIssue = false;
  let claudeFailed = false;

  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const text = fs.readFileSync(claudeMdPath, 'utf-8');
    try {
      const block = readManagedBlock(text);
      if (block && typeof block.content === 'string') {
        // No liveSkills option: this check only ever acts on kind === 'removed' below, and
        // `resolveToken` calls `liveSkills.has(name)` when the option is truthy — an array
        // (or any non-Set) throws there. Omitting it entirely is the documented default
        // (doc-refs.cjs: "only when liveSkills is given ... -> ok") and is behaviorally
        // identical for this check's purposes, since 'unknown' kind is never consulted here.
        for (const hit of scanText(block.content)) {
          if (hit.kind !== 'removed') continue;
          anyIssue = true;
          issues.push({
            code: 'W050',
            message: `CLAUDE.md references /aoforge:${hit.token}, which was removed with no replacement`,
            fix: 'Remove or update this reference — the command no longer exists.',
          });
        }
      }
    } catch (err) {
      if (err instanceof ManagedBlockError) {
        claudeFailed = true;
      } else {
        throw err;
      }
    }
  }

  const stateMdPath = path.join(projectRoot, '.planning', 'STATE.md');
  if (fs.existsSync(stateMdPath)) {
    const text = fs.readFileSync(stateMdPath, 'utf-8');
    const scanned = _excludeSessionLog(text);
    for (const hit of scanText(scanned)) { // see the CLAUDE.md branch above for why no liveSkills
      if (hit.kind !== 'removed') continue;
      anyIssue = true;
      issues.push({
        code: 'W050',
        message: `STATE.md references /aoforge:${hit.token}, which was removed with no replacement`,
        fix: 'Remove or update this reference — the command no longer exists.',
      });
    }
  }

  if (anyIssue) return 'stale';
  if (claudeFailed) return 'skipped:malformed-block';
  return 'ok';
}

// ─── W051 — STACK.md review age ────────────────────────────────────────────────────────────

function _checkStackReview({ projectRoot, now, thresholds, issues }) {
  const stackPath = path.join(projectRoot, '.planning', 'STACK.md');
  if (!fs.existsSync(stackPath)) return 'skipped:no-stack';

  let parsed;
  try {
    parsed = parseProfile(fs.readFileSync(stackPath, 'utf-8'), { source: stackPath });
  } catch (err) {
    if (err instanceof StackProfileError) return 'skipped:stack-unparseable';
    throw err;
  }

  const frontmatter = parsed.frontmatter || {};
  const provenance = frontmatter.provenance;
  const reviewed = provenance && typeof provenance === 'object' ? provenance.reviewed : undefined;

  if (reviewed === undefined || reviewed === null || reviewed === '') {
    issues.push({
      code: 'W051',
      message: 'STACK.md has no provenance.reviewed date',
      fix: 'Re-run `stack init` (or add `provenance: { reviewed: "YYYY-MM-DD" }`) to record when this was last reviewed.',
    });
    return 'stale';
  }

  const reviewedDate = _parseDateUTC(reviewed);
  if (!reviewedDate) {
    issues.push({
      code: 'W051',
      message: `STACK.md's provenance.reviewed value (${JSON.stringify(reviewed)}) is unparseable`,
      fix: 'Set provenance.reviewed to a YYYY-MM-DD date.',
    });
    return 'stale';
  }

  const days = _daysBetween(reviewedDate, now);
  if (days > thresholds.stack_review_stale_days) {
    issues.push({
      code: 'W051',
      message: `STACK.md was last reviewed ${days} days ago, which exceeds the ${thresholds.stack_review_stale_days}-day threshold`,
      fix: 'Review STACK.md and update provenance.reviewed once confirmed current.',
    });
    return 'stale';
  }

  return 'ok';
}

// ─── W052 — STACK.md language drift ────────────────────────────────────────────────────────

function _checkStackDrift({ projectRoot, userHome, issues }) {
  const stackPath = path.join(projectRoot, '.planning', 'STACK.md');
  if (!fs.existsSync(stackPath)) return 'skipped:no-stack';

  let parsed;
  try {
    parsed = parseProfile(fs.readFileSync(stackPath, 'utf-8'), { source: stackPath });
  } catch (err) {
    if (err instanceof StackProfileError) return 'skipped:stack-unparseable';
    throw err;
  }

  const declared = (parsed.frontmatter || {}).languages;
  if (!Array.isArray(declared) || declared.length === 0) {
    return 'skipped:no-declared-languages';
  }

  const { primary_lang: detected } = detectManifest(projectRoot, { userHome });
  if (!detected) return 'skipped:no-declared-languages';

  if (_aliasMatches(declared, detected)) return 'ok';

  issues.push({
    code: 'W052',
    message: `STACK.md declares ${declared.join(', ')}, but the repo's manifest now detects ${detected}`,
    fix: 'Re-run `stack init` to refresh STACK.md, or update `languages` by hand if the declaration is still correct.',
  });
  return 'stale';
}

// ─── W053 — codebase-map commits-behind ────────────────────────────────────────────────────

function _checkCodebaseMap({ projectRoot, threshold, issues }) {
  const codebaseDir = path.join(projectRoot, '.planning', 'codebase');
  let mapFiles = [];
  try {
    mapFiles = fs.readdirSync(codebaseDir).filter((f) => f.endsWith('.md'));
  } catch (_) {
    mapFiles = [];
  }
  if (mapFiles.length === 0) return 'skipped:no-maps';

  let sha;
  try {
    sha = runGit(projectRoot, ['log', '-1', '--format=%H', '--', '.planning/codebase']).trim();
  } catch (err) {
    const message = (err && (err.stderr || err.message)) || '';
    if (_looksLikeNotAGitRepo(message)) return 'skipped:not-a-git-repo';
    return 'skipped:git-failed';
  }

  if (!sha) return 'skipped:maps-not-committed';

  let countOutput;
  try {
    countOutput = runGit(projectRoot, ['rev-list', '--count', `${sha}..HEAD`, '--', '.', ':(exclude).planning']);
  } catch (err) {
    const message = (err && (err.stderr || err.message)) || '';
    if (_looksLikeNotAGitRepo(message)) return 'skipped:not-a-git-repo';
    return 'skipped:git-failed';
  }

  const n = parseInt(String(countOutput).trim(), 10);
  if (!Number.isFinite(n)) return 'skipped:git-failed';

  if (n > threshold) {
    issues.push({
      code: 'W053',
      message: `.planning/codebase is ${n} commits behind HEAD, which exceeds the ${threshold}-commit threshold`,
      fix: 'Re-run /aoforge:map-codebase to refresh the codebase maps.',
    });
    return 'stale';
  }

  return 'ok';
}

// ─── collect ────────────────────────────────────────────────────────────────────────────────

/**
 * collect({projectRoot, userHome=null, now=new Date(), config}) -> {issues, checked}
 *
 * Read-only, synchronous. `config` defaults to `{}` (callers typically pass the parsed
 * `.planning/config.json`). Never throws on a missing/malformed git repo, STACK.md, or CLAUDE.md
 * managed block — those become `checked.<x> = 'skipped:<why>'`.
 */
function collect({ projectRoot, userHome = null, now = new Date(), config = {} } = {}) {
  const issues = [];
  const thresholds = _readConfig(config);

  const removed_refs = _checkRemovedRefs({ projectRoot, issues });
  const stack_review = _checkStackReview({ projectRoot, now, thresholds, issues });
  const stack_drift = _checkStackDrift({ projectRoot, userHome, issues });
  const codebase_map = _checkCodebaseMap({ projectRoot, threshold: thresholds.codebase_map_stale_commits, issues });

  return {
    issues,
    checked: { removed_refs, stack_review, stack_drift, codebase_map },
  };
}

module.exports = {
  collect,
  DEFAULTS,
  _setRunGit,
  _resetRunGit,
};
