'use strict';

// gh-milestone-store.cjs (TRD 48-05, D-05, GWP-01 / GWP-04) — native GitHub milestones as the store for
// MILESTONES.md entries.
//
// In store mode a milestone is a NATIVE GitHub milestone titled `<milestone_prefix><version>` (the same
// title 47's hierarchy sync gives it, via gh-milestone.milestoneTitle). Its description holds at most
// MILESTONE_DESC_MAX characters: the entry's first paragraph plus a link to the wiki page
// `Milestone-v<X_Y>` (gh-wiki PAGE_TABLE), which holds the full entry.
//
// Why these writes are DIRECT gh-client calls and not outbox ops: this is the same documented exception
// as 47's milestone bootstrap (`gh-issue.ensureMilestone`). Every write is idempotent — find-or-create by
// TITLE, then PATCH by NUMBER (REST never addresses a milestone by title) with only the fields that
// differ, so a repeat run writes nothing. A create refused because the title already exists (422
// already_exists: another writer won the race) resolves by re-listing, never by a second create.
//
// Offline exits BEFORE any write: every operation lists first, and a failed list returns
// `{ok:false, offline:true, error:'offline: ...'}` without attempting a write.
//
// gh is reached ONLY through gh-client (`ghRead`/`ghWrite`/`ghPaginate`): no spawn here. 46's
// `gh-milestone.cjs` stays pure local I/O and is not touched; this module only borrows its version and
// title helpers.

const client = require('./gh-client.cjs');
const milestoneLib = require('./gh-milestone.cjs');
const wiki = require('./gh-wiki.cjs');

const MILESTONE_DESC_MAX = 1000;
const ELLIPSIS = '…';
const STATES = new Set(['open', 'closed']);

// A network outage (gh prints no HTTP status). A missing gh binary also has status null, so it is excluded.
const OFFLINE_RE = /error connecting to|could not resolve host|connection refused|timed out|network is unreachable|dial tcp/i;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * The entry's first paragraph: skip leading blank lines and one leading `## ` heading line, then take
 * lines up to the first blank line. Line endings are normalised to `\n`; the result is trimmed.
 */
function firstParagraph(entryText) {
  if (typeof entryText !== 'string') return '';
  const lines = entryText.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && /^##\s/.test(lines[i])) i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  const out = [];
  for (; i < lines.length && lines[i].trim() !== ''; i++) out.push(lines[i]);
  return out.join('\n').trim();
}

/** Cut `text` to at most `room` characters on a whitespace boundary, then add the ellipsis. */
function truncateOnWord(text, room) {
  if (room <= 1) return room === 1 ? ELLIPSIS : '';
  let cut = text.slice(0, room - 1);
  // Only back up to a boundary when the cut landed inside a word.
  if (!/\s/.test(text[cut.length] || ' ')) {
    const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'), cut.lastIndexOf('\t'));
    if (at > 0) cut = cut.slice(0, at);
  }
  return cut.replace(/\s+$/, '') + ELLIPSIS;
}

/**
 * The native milestone description (D-05): at most MILESTONE_DESC_MAX characters — the entry's first
 * paragraph (cut on a word boundary with an ellipsis when it does not fit), a blank line, then
 * `Full notes: <pageUrl>`. Without a usable `pageUrl` it is the paragraph alone.
 */
function milestoneDescription(entryText, pageUrl) {
  const link = typeof pageUrl === 'string' && pageUrl !== '' ? `Full notes: ${pageUrl}` : '';
  const usable = link && link.length + 2 < MILESTONE_DESC_MAX ? link : '';
  const trailer = usable ? `\n\n${usable}` : '';
  let para = firstParagraph(entryText);
  if (!para) return usable;
  const room = MILESTONE_DESC_MAX - trailer.length;
  if (para.length > room) para = truncateOnWord(para, room);
  return `${para}${trailer}`;
}

/** The wiki page holding a milestone's full entry: `v1.3` -> `Milestone-v1_3` (null for a non-version). */
function milestonePage(version) {
  const v = milestoneLib.normaliseVersion(version);
  return v ? wiki.pageForCachePath(`milestones/${v}.md`) : null;
}

/** `https://github.com/<repo>/wiki/Milestone-v1_3`, or null. */
function milestonePageUrl(repo, version) {
  const page = milestonePage(version);
  return page && typeof repo === 'string' && repo ? `https://github.com/${repo}/wiki/${page}` : null;
}

/** The milestone title for `version` under the project's configured prefix (default `v`), or null. */
function milestoneTitleFor(root, version) {
  const cfg = client.readConfig(root);
  const gh = cfg && cfg.github && typeof cfg.github === 'object' ? cfg.github : {};
  return milestoneLib.milestoneTitle(gh.milestone_prefix || 'v', version);
}

// ─── Remote helpers ───────────────────────────────────────────────────────────

function isOffline(r) {
  const text = `${(r && r.stderr) || ''}\n${(r && r.stdout) || ''}\n${(r && r.error) || ''}`;
  if (/command not found|ENOENT/i.test(text)) return false;
  return OFFLINE_RE.test(text) || (r && r.status === null && text.trim() !== '');
}

function failure(r, what) {
  const reason = (r && (r.error || r.stderr || r.stdout)) || `${what} failed`;
  if (isOffline(r)) return { ok: false, offline: true, error: `offline: ${what}: ${String(reason).trim()}` };
  return { ok: false, error: `${what}: ${String(reason).trim()}` };
}

/** One milestone row in the shape callers read. */
function toRow(m) {
  return {
    number: m.number,
    title: m.title,
    state: m.state,
    description: typeof m.description === 'string' ? m.description : '',
    due_on: m.due_on || null,
    closed_at: m.closed_at || null,
  };
}

function listRemote(repo) {
  const r = client.ghPaginate(`repos/${repo}/milestones?state=all`);
  if (!r.ok) return failure(r, 'list milestones');
  return { ok: true, milestones: r.items.filter((m) => m && typeof m === 'object').map(toRow) };
}

/** The fields of `want` that differ from milestone `row` (only those present in `want`). */
function diffFields(row, want) {
  const patch = {};
  if (want.description !== undefined && want.description !== row.description) patch.description = want.description;
  if (want.state !== undefined && want.state !== row.state) patch.state = want.state;
  if (want.due_on !== undefined && (want.due_on || null) !== row.due_on) patch.due_on = want.due_on || null;
  return patch;
}

function patchMilestone(repo, number, body) {
  return client.ghWrite(
    ['api', '--method', 'PATCH', `repos/${repo}/milestones/${number}`, '--input', '-'],
    { input: JSON.stringify(body) },
  );
}

/** Gate + version -> `{gate, title}` or a result to return unchanged. Zero gh calls. */
function prepare(root, version) {
  const gate = client.requireEnabled(root);
  if (gate.skipped) return { done: gate };
  const v = milestoneLib.normaliseVersion(version);
  if (!v) return { done: { ok: false, error: `not a milestone version: ${JSON.stringify(version)}` } };
  return { gate, version: v, title: milestoneLib.milestoneTitle(gate.milestone_prefix, v) };
}

// ─── Public operations ────────────────────────────────────────────────────────

/**
 * Every milestone of the repo, open and closed (paginated).
 * -> {ok:true, milestones:[{number,title,state,description,due_on,closed_at}]}
 *  | {ok:false, skipped:true, ...}   github.enabled is not true (zero gh calls)
 *  | {ok:false, offline?:true, error}
 */
function listMilestones(root) {
  const gate = client.requireEnabled(root);
  if (gate.skipped) return gate;
  return listRemote(gate.repo);
}

/** -> {ok:true, title, milestone: row|null} | skipped | {ok:false, offline?, error}. Read only. */
function findMilestone(root, version) {
  const p = prepare(root, version);
  if (p.done) return p.done;
  const list = listRemote(p.gate.repo);
  if (!list.ok) return list;
  return { ok: true, title: p.title, milestone: list.milestones.find((m) => m.title === p.title) || null };
}

/**
 * Find-or-create the milestone for `version` and bring `description` / `state` / `due_on` (each optional)
 * up to date with ONE PATCH by number carrying only the fields that differ; no write when nothing differs.
 * -> {ok:true, number, title, created, updated, warnings} | skipped | {ok:false, offline?, error, ...}
 */
function upsertMilestone(root, { version, description, state, due_on: dueOn } = {}) {
  const p = prepare(root, version);
  if (p.done) return p.done;
  if (description !== undefined && typeof description !== 'string') {
    return { ok: false, error: 'description must be a string' };
  }
  if (typeof description === 'string' && description.length > MILESTONE_DESC_MAX) {
    return { ok: false, error: `description is ${description.length} characters; the limit is ${MILESTONE_DESC_MAX} (use milestoneDescription)` };
  }
  if (state !== undefined && !STATES.has(state)) return { ok: false, error: `state must be open or closed, got ${JSON.stringify(state)}` };
  const { repo } = p.gate;
  const title = p.title;
  const want = { description, state, due_on: dueOn };
  const warnings = [];

  const list = listRemote(repo);
  if (!list.ok) return { ...list, title };
  let row = list.milestones.find((m) => m.title === title);
  let created = false;

  if (!row) {
    const body = { title };
    if (description !== undefined) body.description = description;
    if (state !== undefined) body.state = state;
    if (dueOn) body.due_on = dueOn;
    const made = client.ghWrite(['api', '--method', 'POST', `repos/${repo}/milestones`, '--input', '-'], { input: JSON.stringify(body) });
    if (made.ok) {
      let number = null;
      try {
        number = JSON.parse(made.stdout).number;
      } catch {
        number = null;
      }
      if (Number.isInteger(number) && number > 0) {
        return { ok: true, number, title, created: true, updated: false, warnings };
      }
      warnings.push(`create of milestone ${title} returned no number; looked it up`);
    } else if (isOffline(made)) {
      return { ...failure(made, `create milestone ${title}`), title };
    }
    // Any refused create falls back to a lookup by title (copied from gh-issue.ensureMilestone): a 422
    // already_exists is the common case, and a lookup is harmless (read-only) for every other failure.
    const again = listRemote(repo);
    if (!again.ok) return { ...again, title };
    row = again.milestones.find((m) => m.title === title);
    if (!row) {
      const why = made.ok ? 'create returned no number' : String(made.error || made.stderr || made.stdout || 'create failed').trim();
      return { ok: false, error: `could not create milestone ${title}: ${why}`, title, warnings };
    }
    created = false;
  }

  const patch = diffFields(row, want);
  if (Object.keys(patch).length === 0) {
    return { ok: true, number: row.number, title, created, updated: false, warnings };
  }
  const r = patchMilestone(repo, row.number, patch);
  if (!r.ok) return { ...failure(r, `update milestone ${title} (#${row.number})`), number: row.number, title, warnings };
  return { ok: true, number: row.number, title, created, updated: true, warnings };
}

/**
 * Close the milestone for `version` (PATCH state=closed by number). Already closed writes nothing.
 * -> {ok:true, number, title, updated} | {ok:false, notFound:true, error} | skipped | {ok:false, offline?, error}
 */
function closeMilestone(root, version) {
  const p = prepare(root, version);
  if (p.done) return p.done;
  const { repo } = p.gate;
  const list = listRemote(repo);
  if (!list.ok) return { ...list, title: p.title };
  const row = list.milestones.find((m) => m.title === p.title);
  if (!row) return { ok: false, notFound: true, title: p.title, error: `no milestone titled ${p.title}` };
  if (row.state === 'closed') return { ok: true, number: row.number, title: p.title, updated: false };
  const r = patchMilestone(repo, row.number, { state: 'closed' });
  if (!r.ok) return { ...failure(r, `close milestone ${p.title} (#${row.number})`), number: row.number, title: p.title };
  return { ok: true, number: row.number, title: p.title, updated: true };
}

module.exports = {
  MILESTONE_DESC_MAX,
  milestoneDescription,
  milestonePage,
  milestonePageUrl,
  milestoneTitleFor,
  findMilestone,
  upsertMilestone,
  closeMilestone,
  listMilestones,
};
