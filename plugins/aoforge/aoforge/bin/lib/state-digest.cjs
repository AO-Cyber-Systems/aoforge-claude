'use strict';

// state-digest.cjs — STATE.md as a digest, not an archive.
//
// The state template says decisions live in STATE_ARCHIVE.md "to keep STATE.md lean", but nothing enforced it: a
// project's `## Recent Decisions` grows one entry per TRD until STATE.md is tens of kilobytes, and every skill that
// inlines STATE.md (or runs `state load`) pays for all of it. This module is the enforcement:
//
//   rotateDecisions(stateMd, keep)      keep the newest `keep` entries (the section lists newest first), return
//                                       the older ones so the caller can append them to the archive
//   appendDecisionsToArchive(archiveMd, entries)
//                                       append the moved entries, oldest first, under the archive's `## Decisions`
//   digest(stateMd, opts)               the sections a session needs on entry: Project Reference, Current
//                                       Position, Blockers / Concerns, Session Continuity, the first
//                                       `opts.decisions` decisions (headline line only) and the pending todos
//
// All three are pure (string in, string out) so `state rotate-decisions`, `state digest`, `state load`, migration
// 0015 and `validate health` share one reading of the file. Line endings: STATE.md files written on Windows carry
// `\r\n`; everything here splits on `\n` and leaves a trailing `\r` on its line, so the rotated text keeps the
// file's own endings.

const DEFAULT_KEEP = 10;
const DEFAULT_DIGEST_DECISIONS = 5;

const DECISIONS_HEADING_RE = /^##\s+Recent Decisions\s*$/i;
const HEADING_RE = /^#{1,6}\s/;

/** Split `content` into `{before, heading, body, after}` around `## Recent Decisions`, or null when absent. */
function splitDecisionsSection(content) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => DECISIONS_HEADING_RE.test(l.replace(/\r$/, '')));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) { end = i; break; }
  }
  return {
    before: lines.slice(0, start),
    heading: lines[start],
    body: lines.slice(start + 1, end),
    after: lines.slice(end),
  };
}

/**
 * Group a section body into entries: a top-level `- ` bullet plus its continuation lines (indented bullets, wrapped
 * text, blank lines inside the entry). Leading blank lines and a trailing run of blank lines are kept apart so the
 * section's spacing survives a rotation. -> {lead: string[], entries: string[][], tail: string[]}
 */
function groupEntries(bodyLines) {
  const lead = [];
  const entries = [];
  let i = 0;
  while (i < bodyLines.length && !/^- /.test(bodyLines[i])) { lead.push(bodyLines[i]); i++; }
  let current = null;
  for (; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    if (/^- /.test(line)) {
      if (current) entries.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      lead.push(line);
    }
  }
  if (current) entries.push(current);
  // Trailing blank lines of the last entry belong to the section, not the entry.
  const tail = [];
  if (entries.length) {
    const last = entries[entries.length - 1];
    while (last.length > 1 && last[last.length - 1].trim() === '') tail.unshift(last.pop());
  }
  return { lead, entries, tail };
}

/** Entries of `## Recent Decisions` as arrays of lines (newest first, as the file lists them). */
function decisionEntries(content) {
  const split = splitDecisionsSection(content);
  if (!split) return [];
  return groupEntries(split.body).entries;
}

/**
 * rotateDecisions(content, keep) -> {content, moved, kept, applies}
 *   applies  false when there is no section or it holds `keep` entries or fewer (content returned unchanged)
 *   moved    the entries beyond `keep`, each as its text (newest first, as they stood in the file)
 */
function rotateDecisions(content, keep = DEFAULT_KEEP) {
  const n = Number.isInteger(keep) && keep >= 0 ? keep : DEFAULT_KEEP;
  const split = splitDecisionsSection(content);
  if (!split) return { content, moved: [], kept: 0, applies: false };
  const { lead, entries, tail } = groupEntries(split.body);
  if (entries.length <= n) return { content, moved: [], kept: entries.length, applies: false };
  const keptEntries = entries.slice(0, n);
  const movedEntries = entries.slice(n);
  const body = [...lead, ...keptEntries.flat(), ...tail];
  const next = [...split.before, split.heading, ...body, ...split.after].join('\n');
  return {
    content: next,
    moved: movedEntries.map((e) => e.join('\n').replace(/\s+$/, '')),
    kept: keptEntries.length,
    applies: true,
  };
}

const ARCHIVE_DECISIONS_RE = /^##\s+Decisions\s*$/i;

/**
 * Append `entries` (newest first, as rotateDecisions returns them) to the archive's `## Decisions` section in
 * chronological order (oldest first), after everything already there. A `*(none yet)*` placeholder is removed. With
 * no `## Decisions` heading the section is added at the end. Each entry is written as it stood in STATE.md, so its
 * date and rationale travel with it.
 */
function appendDecisionsToArchive(archive, entries) {
  if (!entries.length) return archive;
  const chronological = [...entries].reverse();
  const lines = archive.split('\n');
  const start = lines.findIndex((l) => ARCHIVE_DECISIONS_RE.test(l.replace(/\r$/, '')));
  if (start === -1) {
    const base = archive.replace(/\s+$/, '');
    return `${base}\n\n## Decisions\n\n${chronological.join('\n')}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) { end = i; break; }
  }
  let body = lines.slice(start + 1, end).filter((l) => !/^\s*[-*]?\s*\*\(none yet\)\*\s*$/i.test(l));
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  const rebuilt = [...body, ...chronological, ''];
  if (end < lines.length) rebuilt.push('');
  return [...lines.slice(0, start + 1), ...rebuilt, ...lines.slice(end)].join('\n');
}

// ─── Digest ───────────────────────────────────────────────────────────────────

const DIGEST_SECTIONS = ['Project Reference', 'Current Position', 'Blockers / Concerns', 'Blockers/Concerns', 'Session Continuity'];

/** `## <name>` (or `### <name>`) section body of `content`, heading line excluded, or null. */
function sectionBody(content, name) {
  const lines = content.split('\n');
  const re = new RegExp(`^#{2,3}\\s+${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`, 'i');
  const start = lines.findIndex((l) => re.test(l.replace(/\r$/, '')));
  if (start === -1) return null;
  const level = (lines[start].match(/^#+/) || ['##'])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n').replace(/\s+$/, '');
}

/** The first line of a decision entry, without its bullet marker. */
function headline(entry) {
  return entry[0].replace(/^- /, '').replace(/\r$/, '').trim();
}

const MAX_LINE = 400;
const COMPLETE_RE = /^\*\*Objective complete:\*\*\s*(\d+(?:\.\d+)?)\b/;

/**
 * A section body fit for a digest: a run of `**Objective complete:** N — ...` lines (this repo's STATE.md carries
 * one per finished objective, some over 3 KB) collapses to one line naming the numbers, and any line longer than
 * MAX_LINE is cut with an ellipsis. The full text stays in STATE.md for `state get`.
 */
function condense(body) {
  const out = [];
  let complete = [];
  const flush = () => {
    if (!complete.length) return;
    out.push(`**Objectives complete:** ${complete.join(', ')} (${complete.length}; \`aof-tools state get "Current Position"\` for each)`);
    complete = [];
  };
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = line.match(COMPLETE_RE);
    if (m) { complete.push(m[1]); continue; }
    flush();
    out.push(line.length > MAX_LINE ? `${line.slice(0, MAX_LINE).trimEnd()} …` : line);
  }
  flush();
  return out.join('\n');
}

/**
 * digest(content, {decisions = 5}) -> the compact STATE.md a session needs on entry, as markdown:
 * the digest sections in file order, then `## Recent Decisions (newest N of M)` with one headline per entry, then
 * `### Pending Todos` when the file has one. An empty or missing section is skipped.
 */
function digest(content, opts = {}) {
  const n = Number.isInteger(opts.decisions) && opts.decisions >= 0 ? opts.decisions : DEFAULT_DIGEST_DECISIONS;
  const parts = [];
  const seen = new Set();
  const firstLine = content.split('\n')[0] || '';
  if (/^# /.test(firstLine)) parts.push(firstLine.trim());
  for (const name of DIGEST_SECTIONS) {
    const key = name.replace(/\s/g, '').toLowerCase();
    if (seen.has(key)) continue;
    const body = sectionBody(content, name);
    if (body === null || body.trim() === '') continue;
    seen.add(key);
    parts.push(`## ${name}\n\n${condense(body.trim())}`);
  }
  const entries = decisionEntries(content);
  if (entries.length) {
    const shown = entries.slice(0, n);
    const title = entries.length > shown.length
      ? `## Recent Decisions (newest ${shown.length} of ${entries.length}; \`aof-tools state get "Recent Decisions"\` for all)`
      : '## Recent Decisions';
    parts.push(`${title}\n\n${shown.map((e) => `- ${headline(e)}`).join('\n')}`);
  }
  const todos = sectionBody(content, 'Pending Todos');
  if (todos !== null && todos.trim() !== '') parts.push(`### Pending Todos\n\n${todos.trim()}`);
  return parts.join('\n\n') + '\n';
}

module.exports = {
  DEFAULT_KEEP,
  DEFAULT_DIGEST_DECISIONS,
  splitDecisionsSection,
  decisionEntries,
  rotateDecisions,
  appendDecisionsToArchive,
  sectionBody,
  digest,
};
