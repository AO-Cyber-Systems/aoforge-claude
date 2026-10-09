'use strict';

// Migration 0007 — doc-refs-fix (TRD 38-08).
//
// Rewrites stale AOForge command references (renamed commands, and bare /df: prefixes) inside the
// two live, AOForge-authored surfaces a project carries: the CLAUDE.md AOFORGE managed block, and
// STATE.md outside its Session Log section. Command-rename knowledge is not duplicated here — see
// doc-refs.cjs (TRD 38-01), the single resolver both this migration and the sibling CI gate call
// into. A removed command (one with no replacement) is left exactly as written; it never makes
// this migration applicable and never gets rewritten.
//
// Every other project file — SUMMARY/VERIFICATION/TRD/OBJECTIVE, CHANGELOG, milestones, todos,
// ROADMAP, and the Session Log itself — is a historical record and is never opened for writing
// here. (The sibling CI gate scans this module's own source, comments included, for a literal
// stale command name — so this file describes examples in words rather than spelling one out.)

const fs = require('fs');
const path = require('path');
const managedBlock = require('../managed-block.cjs');
const docRefs = require('../doc-refs.cjs');
const { planningRel } = require('../compat.cjs');

const CLAUDE_REL = 'CLAUDE.md';
// STATE.md under the project's resolved planning directory (`.aoforge/`, or a legacy one)
const stateRel = (root) => planningRel(root, 'STATE.md');
const SESSION_LOG_RE = /^##\s+Session Log[^\n]*$/m;
const NEXT_H2_RE = /^##[ \t]/m;

function readTextIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

/**
 * locateSessionLog(content) -> null | {start, end}
 *
 * `start` is the index of the "## Session Log" heading line; `end` is the index of the next
 * `^## ` heading, or content.length. Mirrors 0005's locateRules / 0002's SESSION_LOG_RE.
 */
function locateSessionLog(content) {
  const h = SESSION_LOG_RE.exec(content);
  if (!h) return null;
  const afterHeading = h.index + h[0].length;
  const n = NEXT_H2_RE.exec(content.slice(afterHeading));
  return { start: h.index, end: n ? afterHeading + n.index : content.length };
}

// ─── CLAUDE.md target ───────────────────────────────────────────────────────────

/**
 * claudeTargetInfo(ctx) -> { present, skip, count, ... }
 *
 * Reads and scans (never writes) the CLAUDE.md AOFORGE block. `present: false` means there is
 * nothing to rewrite in CLAUDE.md this run (missing file, no block, or a malformed block); `skip`
 * then names why. `count` is the number of renamed/prefix tokens found inside the block region
 * (START marker through END marker, inclusive) — the only bytes this target ever touches.
 */
function claudeTargetInfo(ctx) {
  const claudePath = path.join(ctx.projectRoot, CLAUDE_REL);
  const text = readTextIfExists(claudePath);
  if (text === null) return { present: false, skip: `no ${CLAUDE_REL}` };

  let block;
  try {
    block = managedBlock.read(text);
  } catch (e) {
    if (e instanceof managedBlock.ManagedBlockError) {
      return { present: false, skip: `malformed AOFORGE block (${e.message})` };
    }
    throw e;
  }
  if (!block) return { present: false, skip: `no AOFORGE block in ${CLAUDE_REL}` };

  const region = text.slice(block.start, block.end);
  const rewrite = docRefs.rewriteText(region);
  return {
    present: true, skip: null, claudePath, text, block, rewrite, count: rewrite.changes.length,
  };
}

function applyClaudeTarget(ctx, info) {
  if (!info.present || info.count === 0) return { changed: false, rewrites: [], removed: info.present ? info.rewrite.removed : [] };
  const next = info.text.slice(0, info.block.start) + info.rewrite.text + info.text.slice(info.block.end);
  if (!ctx.dryRun) fs.writeFileSync(info.claudePath, next);
  return { changed: true, rewrites: info.rewrite.changes, removed: info.rewrite.removed };
}

// ─── STATE.md target ────────────────────────────────────────────────────────────

/**
 * stateTargetInfo(ctx) -> { present, skip, count, ... }
 *
 * Reads and scans (never writes) STATE.md. When a "## Session Log" heading exists, everything
 * from that heading up to the next `## ` heading (or EOF) is excluded from both the count and the
 * rewrite — it is a record of what already happened. Everything else in the file is in scope.
 */
function stateTargetInfo(ctx) {
  const STATE_REL = stateRel(ctx.projectRoot);
  const statePath = path.join(ctx.projectRoot, STATE_REL);
  const text = readTextIfExists(statePath);
  if (text === null) return { present: false, skip: `no ${STATE_REL}` };

  const loc = locateSessionLog(text);
  if (!loc) {
    const rewrite = docRefs.rewriteText(text);
    return {
      present: true, skip: null, statePath, text, hasLog: false, rewrite, count: rewrite.changes.length,
    };
  }

  const before = text.slice(0, loc.start);
  const logSection = text.slice(loc.start, loc.end);
  const after = text.slice(loc.end);
  const rBefore = docRefs.rewriteText(before);
  const rAfter = docRefs.rewriteText(after);
  return {
    present: true, skip: null, statePath, text, hasLog: true,
    logSection, rBefore, rAfter, count: rBefore.changes.length + rAfter.changes.length,
  };
}

/**
 * appendSessionLogLine(logSection, line) -> the Session Log section text with `line` inserted
 * directly after its last non-blank line (the heading itself counts when the section is
 * otherwise empty). Every existing byte is preserved; only one new "\n" + line is spliced in.
 */
function appendSessionLogLine(logSection, line) {
  const lines = logSection.split('\n');
  let lastIdx = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== '') { lastIdx = i; break; }
  }
  lines.splice(lastIdx + 1, 0, line);
  return lines.join('\n');
}

function applyStateTarget(ctx, info) {
  if (!info.present) return { changed: false, rewrites: [], removed: [] };
  if (!info.hasLog) {
    if (info.count === 0) return { changed: false, rewrites: [], removed: info.rewrite.removed };
    if (!ctx.dryRun) fs.writeFileSync(info.statePath, info.rewrite.text);
    return { changed: true, rewrites: info.rewrite.changes, removed: info.rewrite.removed };
  }
  const removed = [...info.rBefore.removed, ...info.rAfter.removed];
  if (info.count === 0) return { changed: false, rewrites: [], removed };
  const today = new Date().toISOString().split('T')[0];
  const line = `- ${today}: upgrade 0007 updated ${info.count} command reference(s) to current /aoforge: names`;
  const next = info.rBefore.text + appendSessionLogLine(info.logSection, line) + info.rAfter.text;
  if (!ctx.dryRun) fs.writeFileSync(info.statePath, next);
  return { changed: true, rewrites: [...info.rBefore.changes, ...info.rAfter.changes], removed };
}

// ─── detect / apply ─────────────────────────────────────────────────────────────

function reasonFor(claudeInfo, stateInfo) {
  const claudeCount = claudeInfo.present ? claudeInfo.count : 0;
  const stateCount = stateInfo.present ? stateInfo.count : 0;
  const parts = [`${claudeCount} stale command reference(s) in CLAUDE.md AOFORGE block, ${stateCount} in STATE.md`];
  if (claudeInfo.skip) parts.push(`CLAUDE.md skipped (${claudeInfo.skip})`);
  if (stateInfo.skip) parts.push(`STATE.md skipped (${stateInfo.skip})`);
  return { applies: claudeCount + stateCount > 0, reason: parts.join('; ') };
}

function detect(ctx) {
  const claudeInfo = claudeTargetInfo(ctx);
  const stateInfo = stateTargetInfo(ctx);
  return reasonFor(claudeInfo, stateInfo);
}

// Aggregate per-occurrence {from, to, line} records into one {file, from, to, count} row per
// distinct (file, from, to) triple, in first-seen order.
function aggregateRewrites(file, changesList) {
  const order = [];
  const counts = new Map();
  for (const c of changesList) {
    const key = `${c.from}\u0000${c.to}`;
    if (!counts.has(key)) {
      counts.set(key, 0);
      order.push(key);
    }
    counts.set(key, counts.get(key) + 1);
  }
  return order.map((key) => {
    const [from, to] = key.split('\u0000');
    return { file, from, to, count: counts.get(key) };
  });
}

function apply(ctx) {
  const STATE_REL = stateRel(ctx.projectRoot);
  const claudeInfo = claudeTargetInfo(ctx);
  const stateInfo = stateTargetInfo(ctx);
  const claudeRes = applyClaudeTarget(ctx, claudeInfo);
  const stateRes = applyStateTarget(ctx, stateInfo);

  const changed = [];
  if (claudeRes.changed) changed.push(CLAUDE_REL);
  if (stateRes.changed) changed.push(STATE_REL);

  return {
    changed,
    notes: {
      rewrites: [
        ...aggregateRewrites(CLAUDE_REL, claudeRes.rewrites),
        ...aggregateRewrites(STATE_REL, stateRes.rewrites),
      ],
      removed_left: [...new Set([...claudeRes.removed, ...stateRes.removed].map((r) => r.token))].sort(),
    },
  };
}

module.exports = {
  id: '0007',
  title: 'Rewrite stale AOForge command references in live project docs',
  since: '2.11.0',
  safety: 'auto',
  detect,
  apply,
};
