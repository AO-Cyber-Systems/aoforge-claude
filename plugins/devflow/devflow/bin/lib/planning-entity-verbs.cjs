'use strict';

/**
 * planning-entity-verbs.cjs — the planning verbs for everything that is not an objective document (objective 48,
 * GWP-01, U-1, D-03, D-05, D-09): todos, debug sessions, quick tasks, decisions and milestones.
 *
 * INVARIANT (D-01): with `github.store` off (`local` mode) every verb writes exactly the file today's code path writes,
 * under the MAIN checkout's `.planning/`, and makes zero gh calls (no journal, no ledger):
 *   todo add             todos/pending/<YYYY-MM-DD>-<slug>.md            (workflows/add-todo.md naming)
 *   todo complete        todos/completed/<stem>.md, `completed: <date>` prepended, pending file removed (cmdTodoComplete)
 *   debug put / resolve  debug/<slug>.md -> debug/resolved/<slug>.md      (agents/debugger.md layout)
 *   quick put / summary  quick/<N>-<slug>/<N>-JOB.md, <N>-SUMMARY.md     (quick workflow layout)
 *   decision open/answer decisions/pending|resolved/DECISION-NNN.md      (decision-queue addDecision / resolveDecision,
 *                                                                         delegated so parity is structural)
 *   milestone put        the `## <version> ...` section of MILESTONES.md (replaced, or inserted after `# Milestones`)
 *   milestone complete   local: `{delegate:'milestone complete'}` (today's cmdMilestoneComplete, wired by 48-15)
 *
 * STORE mode (U-1 homes): every write goes through planning-verbs `writeThrough` (cache write, ledger, enqueue, flush,
 * baseline after a drained flush):
 *   todo/debug/quick     upsert-issue {id, role} with an entity-codec body (48-02), the role label and, for debug and
 *                        quick, the native type (the flusher falls back to `devflow:type/<name>` labels, 48-06)
 *   complete / resolve   the file move in the cache (both rels through the ledger), the body re-upserted with the new
 *                        header path, then patch-issue closed/completed
 *   quick summary        a `summary` file comment on the quick issue, then patch-issue closed/completed
 *   decision open        47's gh-hierarchy.openDecision (Decision issue + block edge); cache `decisions/<id>.md`
 *   decision answer      upsert-comment {kind:'answer'} + patch-issue closed/completed (D-09); cache gains `## Answer`
 *   milestone put        native milestone (gh-milestone-store, a DIRECT write, D-05: description <= 1,000 chars ending
 *                        in the wiki link), then doc put `milestones/<version>.md`; offline fails before any write
 *   milestone complete   closeMilestone, then doc put of every `milestones/<version>-*.md` archive (one wiki-push)
 * The cache files are exactly what `gh pull --all` (gh-cache.materialize, 48-07) rebuilds from those GitHub objects.
 *
 * A library: no spawns, no stdout, no process.exit. Results are planning-verbs' shape
 * `{ok, mode, rel, path, warnings, queued?, flush?, prose?, note?, error?, exit}` plus verb fields (`id`, `from`, ...).
 */

const fs = require('fs');
const path = require('path');

const planningMode = require('./planning-mode.cjs');
const planningPaths = require('./planning-paths.cjs');
const ledger = require('./planning-ledger.cjs');
const verbs = require('./planning-verbs.cjs');
const outbox = require('./gh-outbox.cjs');
const flushLib = require('./gh-outbox-flush.cjs');
const ghTrd = require('./gh-trd.cjs');
const ghComments = require('./gh-comments.cjs');
const ghHierarchy = require('./gh-hierarchy.cjs');
const ghMilestone = require('./gh-milestone.cjs');
const milestoneStore = require('./gh-milestone-store.cjs');
const client = require('./gh-client.cjs');
const decisionQueue = require('./decision-queue.cjs');
const storeCli = require('./gh-store-cli.cjs');
const { generateSlugInternal } = require('./helpers.cjs');
const { milestoneHeadingPattern } = require('./text-escape.cjs');

const { EXIT } = storeCli;
const { LOCAL, STORE } = planningMode;

const CLOSE = Object.freeze({ state: 'closed', state_reason: 'completed' });
const STORE_DECISION_ID_RE = /^\d+(?:\.\d+)?-\d+-d\d+$/;
const ANSWER_HEADING = '\n\n## Answer\n\n';
const DECISION_TITLE_MAX = 80;

// ─── Small helpers ───────────────────────────────────────────────────────────

const planningFile = (main, rel) => path.join(main, '.planning', ...rel.split('/'));

function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function fail(error, base = {}, extra = {}) {
  return { ok: false, mode: null, rel: null, path: null, warnings: [], ...base, ...extra, error, exit: EXIT.ERROR };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const optsOf = (opts) => (isObject(opts) ? opts : {});
const flushFlags = (o) => ({ noFlush: o.noFlush === true, noWait: o.noWait === true });

/** `{main, mode}` for the MAIN checkout (D-14), or `{error}`. */
function contextOf(root) {
  const main = planningMode.resolveMainRoot(root);
  if (!main) return { error: `no .planning/ directory at or above ${root}` };
  return { main, mode: planningMode.planningMode(main).mode };
}

/** UTC `YYYY-MM-DD` of `now` (ms) or of the current time: the date today's todo prose and cmdTodoComplete use. */
function dateOf(now) {
  return (Number.isFinite(now) ? new Date(now) : new Date()).toISOString().split('T')[0];
}

/** A plain file-name-safe stem: no `/`, no leading dot, no `.md`. */
function cleanStem(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).replace(/\.md$/, '');
  return s !== '' && !s.includes('/') && !s.includes('\\') && !s.startsWith('.') ? s : null;
}

/**
 * entityIdFor(rel) — the entity id of a `.planning/`-relative path (`todo-<stem>`, `debug-<slug>`, `quick-<N>`), or
 * null. Delegates to planning-paths.classify, so a verb and the flusher/materialiser agree on one id per file.
 * Throws TypeError for an unsafe rel (planning-paths' rule).
 */
function entityIdFor(rel) {
  const c = planningPaths.classify(rel);
  return c.entity ? c.entity.id : null;
}

/** The role label: `github.labels.<role>` from config, else 48-02's ENTITY_ROLES label. */
function roleLabel(main, role) {
  const cfg = client.readConfig(main);
  const labels = cfg && isObject(cfg.github) && isObject(cfg.github.labels) ? cfg.github.labels : {};
  return typeof labels[role] === 'string' && labels[role] !== '' ? labels[role] : outbox.ENTITY_ROLES[role].label;
}

/** upsert-issue of an entity: entity-codec body (header path = `rel`), role label, native type for debug/quick. */
function upsertOp(main, { id, role, rel, text, title }) {
  const payload = { title, body: ghTrd.encodeEntityBody({ id, file: rel, text }), labels: [roleLabel(main, role)] };
  const type = outbox.ENTITY_ROLES[role].type;
  if (type) payload.type = type;
  return { kind: 'upsert-issue', target: { id, role }, payload };
}

/** patch-issue closed/completed, merged over a pending patch-issue on the same id (one target, latest payload wins). */
function closeOp(main, id) {
  let prior = null;
  try {
    const { journal } = outbox.readJournal(main);
    prior = journal.ops.find((op) => op.status === 'pending' && op.kind === 'patch-issue' && op.target && op.target.id === id && Object.keys(op.target).length === 1) || null;
  } catch {
    prior = null;
  }
  const before = prior && isObject(prior.payload) ? prior.payload : {};
  return { kind: 'patch-issue', target: { id }, payload: { ...before, ...CLOSE } };
}

const enqueueOf = (build) => (m) => outbox.enqueue(m, build(m));

/**
 * The cache side of a move: remove `rel`'s file, forget its ledger entry and drop its cache-index baseline (the file no
 * longer exists in the cache; GitHub now names the new path). Failures are warnings.
 */
function removeThrough(main, mode, rel, warnings) {
  fs.rmSync(planningFile(main, rel), { force: true });
  if (mode !== STORE) return;
  try {
    ledger.forget(main, [rel]);
  } catch (e) {
    warnings.push(`ledger not updated for ${rel}: ${e.message}`);
  }
  try {
    const index = outbox.readCacheIndex(main);
    if (Object.prototype.hasOwnProperty.call(index, rel)) {
      const next = { ...index };
      delete next[rel];
      outbox.writeCacheIndex(main, next);
    }
  } catch (e) {
    warnings.push(`cache baseline of ${rel} not dropped: ${e.message}`);
  }
}

/** One flush; a drained flush settles every queued ledger entry whose bytes match (gh-store-cli flushResult). */
function flushNow(main, base, { noWait } = {}) {
  const flushed = storeCli.flushResult(main, flushLib.flush(main, { wait: noWait !== true }));
  const out = { ...base, ok: flushed.payload.ok !== false && flushed.code !== EXIT.ERROR, flush: flushed.payload, prose: flushed.prose.trimEnd(), exit: flushed.code };
  delete out.note;
  if (flushed.code === EXIT.ERROR) out.error = flushed.payload.error || 'the flush failed';
  return out;
}

/** Store-mode entity id of `rel`, or an error naming the stem rule. */
function storeEntityId(rel, what) {
  const id = entityIdFor(rel);
  return id ? { id } : { error: `${rel} has no ${what} id: the stem must be lowercase letters, digits, '.', '_' or '-' (max 100)` };
}

/**
 * Move `from` -> `to` with `text`. Local: write `to`, remove `from`. Store: write `to` through writeThrough with
 * `build(main)` queued (no flush), remove `from` from the cache, then one flush unless noFlush.
 */
function moveEntity(ctx, { from, to, text, verb, build }, o) {
  const { main, mode } = ctx;
  if (mode === LOCAL) {
    const r = verbs.writeThrough(main, { rel: to, text, verb });
    if (r.ok) removeThrough(main, mode, from, r.warnings);
    return { ...r, from };
  }
  const r = verbs.writeThrough(main, { rel: to, text, verb, enqueue: enqueueOf(build), noFlush: true });
  if (!r.ok) return { ...r, from };
  removeThrough(main, mode, from, r.warnings);
  if (o.noFlush === true) return { ...r, from };
  return { ...flushNow(main, r, { noWait: o.noWait === true }), from };
}

// ─── Todos ───────────────────────────────────────────────────────────────────

/** The frontmatter `title:` of a todo, or null. */
function todoTitle(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const m = fm ? /^title:\s*(.+?)\s*$/m.exec(fm[1]) : null;
  return m ? m[1].replace(/^(['"])(.*)\1$/, '$2') : null;
}

/**
 * todoAdd(root, {text, stem?, now?, noFlush, noWait}) — `todo add`: `todos/pending/<stem>.md`, stem defaulting to
 * `<YYYY-MM-DD>-<slug(title)>` as workflows/add-todo.md names files. Store: a `devflow:todo` issue.
 */
function todoAdd(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  if (typeof o.text !== 'string') return fail('todo add needs the todo text');
  const title = todoTitle(o.text);
  const stem = o.stem !== undefined && o.stem !== null ? cleanStem(o.stem) : `${dateOf(o.now)}-${generateSlugInternal(title || '') || 'todo'}`;
  if (!stem) return fail(`not a todo file stem: ${JSON.stringify(o.stem)}`);
  const rel = `todos/pending/${stem}.md`;
  if (ctx.mode === LOCAL) return { ...verbs.writeThrough(ctx.main, { rel, text: o.text, verb: 'todo add' }), stem };

  const sid = storeEntityId(rel, 'todo');
  if (sid.error) return fail(sid.error, { mode: ctx.mode, rel });
  const r = verbs.writeThrough(ctx.main, {
    rel,
    text: o.text,
    verb: 'todo add',
    enqueue: enqueueOf((m) => [upsertOp(m, { id: sid.id, role: 'todo', rel, text: o.text, title: title || stem })]),
    ...flushFlags(o),
  });
  return { ...r, stem, id: sid.id };
}

/**
 * todoComplete(root, {stem, now?, noFlush, noWait}) — `todo complete`: prepend `completed: <date>` and move the file to
 * `todos/completed/` exactly like cmdTodoComplete. Store: the body re-upserted with the new path, then closed/completed.
 */
function todoComplete(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const stem = cleanStem(o.stem);
  if (!stem) return fail(`todo complete needs a todo file stem, got ${JSON.stringify(o.stem === undefined ? null : o.stem)}`);
  const from = `todos/pending/${stem}.md`;
  const to = `todos/completed/${stem}.md`;
  const current = readOrNull(planningFile(ctx.main, from));
  if (current === null) return fail(`Todo not found: ${stem}.md`, { mode: ctx.mode, rel: from });
  const text = `completed: ${dateOf(o.now)}\n${current}`;
  if (ctx.mode === LOCAL) return moveEntity(ctx, { from, to, text, verb: 'todo complete' }, o);

  const sid = storeEntityId(to, 'todo');
  if (sid.error) return fail(sid.error, { mode: ctx.mode, rel: to });
  const title = todoTitle(current) || stem;
  return {
    ...moveEntity(ctx, {
      from,
      to,
      text,
      verb: 'todo complete',
      build: (m) => [upsertOp(m, { id: sid.id, role: 'todo', rel: to, text, title }), closeOp(m, sid.id)],
    }, o),
    id: sid.id,
  };
}

// ─── Debug sessions ──────────────────────────────────────────────────────────

/** The first `# ` heading of a debug file, or the slug. */
function debugTitle(text, slug) {
  const m = /^# +(.+?)\s*$/m.exec(text);
  return m ? m[1] : slug;
}

/** debugPut(root, {slug, text, noFlush, noWait}) — `debug put`: `debug/<slug>.md`. Store: a `devflow:debug` issue. */
function debugPut(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const slug = cleanStem(o.slug);
  if (!slug) return fail(`debug put needs a session slug, got ${JSON.stringify(o.slug === undefined ? null : o.slug)}`);
  if (typeof o.text !== 'string') return fail('debug put needs the debug session text');
  const rel = `debug/${slug}.md`;
  if (ctx.mode === LOCAL) return verbs.writeThrough(ctx.main, { rel, text: o.text, verb: 'debug put' });

  const sid = storeEntityId(rel, 'debug');
  if (sid.error) return fail(sid.error, { mode: ctx.mode, rel });
  const r = verbs.writeThrough(ctx.main, {
    rel,
    text: o.text,
    verb: 'debug put',
    enqueue: enqueueOf((m) => [upsertOp(m, { id: sid.id, role: 'debug', rel, text: o.text, title: debugTitle(o.text, slug) })]),
    ...flushFlags(o),
  });
  return { ...r, id: sid.id };
}

/**
 * debugResolve(root, {slug, noFlush, noWait}) — `debug resolve`: move `debug/<slug>.md` to `debug/resolved/<slug>.md`
 * (agents/debugger.md). Store: the body re-upserted with the new path, then closed/completed.
 */
function debugResolve(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const slug = cleanStem(o.slug);
  if (!slug) return fail(`debug resolve needs a session slug, got ${JSON.stringify(o.slug === undefined ? null : o.slug)}`);
  const from = `debug/${slug}.md`;
  const to = `debug/resolved/${slug}.md`;
  const text = readOrNull(planningFile(ctx.main, from));
  if (text === null) return fail(`debug session not found: ${from}`, { mode: ctx.mode, rel: from });
  if (ctx.mode === LOCAL) return moveEntity(ctx, { from, to, text, verb: 'debug resolve' }, o);

  const sid = storeEntityId(to, 'debug');
  if (sid.error) return fail(sid.error, { mode: ctx.mode, rel: to });
  return {
    ...moveEntity(ctx, {
      from,
      to,
      text,
      verb: 'debug resolve',
      build: (m) => [upsertOp(m, { id: sid.id, role: 'debug', rel: to, text, title: debugTitle(text, slug) }), closeOp(m, sid.id)],
    }, o),
    id: sid.id,
  };
}

// ─── Quick tasks ─────────────────────────────────────────────────────────────

const quickNumber = (n) => (/^\d+$/.test(String(n)) ? String(Number(n)) : null);

/** `Quick <N>: <slug words>`. */
const quickTitle = (n, slug) => `Quick ${n}: ${slug.replace(/-/g, ' ')}`;

/** quickPut(root, {n, slug, text, noFlush, noWait}) — `quick put`: `quick/<N>-<slug>/<N>-JOB.md`. Store: a Quick issue. */
function quickPut(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const n = quickNumber(o.n);
  const slug = cleanStem(o.slug);
  if (!n || !slug) return fail(`quick put needs a task number and slug, got ${JSON.stringify({ n: o.n, slug: o.slug })}`);
  if (typeof o.text !== 'string') return fail('quick put needs the JOB text');
  const rel = `quick/${n}-${slug}/${n}-JOB.md`;
  if (ctx.mode === LOCAL) return verbs.writeThrough(ctx.main, { rel, text: o.text, verb: 'quick put' });

  const id = `quick-${n}`;
  const r = verbs.writeThrough(ctx.main, {
    rel,
    text: o.text,
    verb: 'quick put',
    enqueue: enqueueOf((m) => [upsertOp(m, { id, role: 'quick', rel, text: o.text, title: quickTitle(n, slug) })]),
    ...flushFlags(o),
  });
  return { ...r, id };
}

/**
 * quickSummary(root, {n, text, noFlush, noWait}) — `quick summary`: `<N>-SUMMARY.md` in the task's existing
 * `quick/<N>-<slug>/` dir. Store: the `summary` file comment on the quick issue, then closed/completed.
 */
function quickSummary(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const n = quickNumber(o.n);
  if (!n) return fail(`quick summary needs a task number, got ${JSON.stringify(o.n === undefined ? null : o.n)}`);
  if (typeof o.text !== 'string') return fail('quick summary needs the SUMMARY text');
  const dir = listDir(path.join(ctx.main, '.planning', 'quick')).find((d) => d.startsWith(`${n}-`));
  if (!dir) return fail(`no quick task ${n} (no .planning/quick/${n}-<slug>/ directory); run quick put first`, { mode: ctx.mode });
  const name = `${n}-SUMMARY.md`;
  const rel = `quick/${dir}/${name}`;
  if (ctx.mode === LOCAL) return verbs.writeThrough(ctx.main, { rel, text: o.text, verb: 'quick summary' });

  const id = `quick-${n}`;
  const r = verbs.writeThrough(ctx.main, {
    rel,
    text: o.text,
    verb: 'quick summary',
    enqueue: enqueueOf((m) => [
      { kind: 'upsert-comment', target: { id, kind: 'summary' }, payload: { mode: 'replace', text: ghComments.fileCommentText(name, o.text) } },
      closeOp(m, id),
    ]),
    ...flushFlags(o),
  });
  return { ...r, id };
}

// ─── Decisions ───────────────────────────────────────────────────────────────

function decisionSummary(question) {
  const line = question.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).find((l) => l !== '') || '';
  return line.length > DECISION_TITLE_MAX ? `${line.slice(0, DECISION_TITLE_MAX - 1).trimEnd()}…` : line;
}

/** The cache text gh-cache.materialize rebuilds for an open Decision issue: the question, one trailing newline. */
const questionText = (question) => `${question.replace(/\r\n/g, '\n').replace(/^\n+/, '').trimEnd()}\n`;

/**
 * decisionOpen(root, {trd?, question?, title?, context?, options?, recommendation?, objective?, wave?, blocks?,
 * independent?, type?, created?, noFlush, noWait}) — `decision open`.
 *
 * Local: decision-queue addDecision (today's `decisions/pending/DECISION-NNN.md`, its notification included); no TRD
 * id needed. Store: 47's gh-hierarchy.openDecision (a Decision issue that BLOCKS the TRD) and the cache file
 * `decisions/<trd>-d<k>.md` holding the question; a TRD id is required.
 */
function decisionOpen(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const question = [o.question, o.context, o.title].find((v) => typeof v === 'string' && v.trim() !== '');
  if (question === undefined) return fail('decision open needs a question');

  if (ctx.mode === LOCAL) {
    const id = decisionQueue.nextDecisionId(ctx.main);
    const rel = `decisions/pending/${id}.md`;
    const trd = o.trd === undefined || o.trd === null ? '' : String(o.trd);
    const objective = o.objective !== undefined && o.objective !== null ? o.objective : trd.replace(/-\d+$/, '');
    let pending;
    try {
      pending = decisionQueue.addDecision(ctx.main, {
        objective,
        trd,
        wave: o.wave,
        type: o.type,
        created: o.created,
        blocks: o.blocks,
        independent: o.independent,
        recommendation: o.recommendation === undefined ? '' : o.recommendation,
        title: o.title === undefined ? decisionSummary(question) : o.title,
        context: o.context === undefined ? question : o.context,
        options: o.options,
      });
    } catch (e) {
      return fail(e.message, { mode: ctx.mode, rel });
    }
    // addDecision is async only for its fire-and-forget notification; the file is written before it returns.
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    const file = planningFile(ctx.main, rel);
    if (!fs.existsSync(file)) return fail(`decision-queue did not write ${rel}`, { mode: ctx.mode, rel, path: file });
    return { ok: true, mode: ctx.mode, rel, path: file, id, warnings: [], exit: EXIT.OK };
  }

  if (o.trd === undefined || o.trd === null || String(o.trd).trim() === '') {
    return fail('decision open in store mode needs the TRD id the decision blocks (e.g. 07-01)', { mode: ctx.mode });
  }
  const q = ghHierarchy.openDecision(ctx.main, o.trd, { question });
  if (!q.ok) return fail(q.error || 'the decision was not queued', { mode: ctx.mode });
  if (q.skipped || !q.id) return fail(`the decision was not queued: ${q.reason || 'skipped'}`, { mode: ctx.mode });
  const rel = `decisions/${q.id}.md`;
  const r = verbs.writeThrough(ctx.main, { rel, text: questionText(question), verb: 'decision open', enqueue: () => q, ...flushFlags(o) });
  return { ...r, id: q.id, trd: q.trd };
}

/**
 * decisionAnswer(root, {id, text, noFlush, noWait}) — `decision answer`.
 *
 * Local: decision-queue resolveDecision (`decisions/pending/<id>.md` -> `resolved/` with resolution + resolved_at).
 * Store (D-09): the `answer` comment and patch-issue closed/completed on the Decision issue; the cache file
 * `decisions/<id>.md` becomes question + `## Answer` + answer, the text gh-cache.materialize rebuilds.
 */
function decisionAnswer(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  if (typeof o.text !== 'string' || o.text.trim() === '') return fail('decision answer needs the answer text');
  const id = typeof o.id === 'string' ? o.id.trim() : '';

  if (ctx.mode === LOCAL) {
    if (!/^DECISION-\d+$/i.test(id)) return fail(`not a decision id: ${JSON.stringify(o.id === undefined ? null : o.id)} (expected DECISION-NNN)`, { mode: ctx.mode });
    try {
      decisionQueue.resolveDecision(ctx.main, id, o.text);
    } catch (e) {
      return fail(e.message, { mode: ctx.mode });
    }
    const rel = `decisions/resolved/${id}.md`;
    return { ok: true, mode: ctx.mode, rel, path: planningFile(ctx.main, rel), id, warnings: [], exit: EXIT.OK };
  }

  if (!STORE_DECISION_ID_RE.test(id)) return fail(`not a decision id: ${JSON.stringify(o.id === undefined ? null : o.id)} (expected <trd>-d<k>, e.g. 7-01-d1)`, { mode: ctx.mode });
  const rel = `decisions/${id}.md`;
  const current = readOrNull(planningFile(ctx.main, rel));
  if (current === null) return fail(`${rel} is not in the cache; run \`df-tools gh pull --all\` first`, { mode: ctx.mode, rel });
  const at = current.indexOf(ANSWER_HEADING);
  const question = at === -1 ? current : current.slice(0, at);
  const answer = o.text.replace(/\r\n/g, '\n').trimEnd();
  const text = `${question.trimEnd()}${ANSWER_HEADING}${answer}\n`;
  const r = verbs.writeThrough(ctx.main, {
    rel,
    text,
    verb: 'decision answer',
    enqueue: enqueueOf((m) => [
      { kind: 'upsert-comment', target: { id, kind: 'answer' }, payload: { mode: 'replace', text: answer } },
      closeOp(m, id),
    ]),
    ...flushFlags(o),
  });
  return { ...r, id };
}

// ─── Milestones ──────────────────────────────────────────────────────────────

/**
 * MILESTONES.md with the version's section replaced by `entry`, or inserted after the `# Milestones` heading (and its
 * blank lines). A missing file becomes `# Milestones\n\n<entry>`. Sections end at the next `## ` line. A section is the
 * version's when `text-escape.milestoneHeadingPattern` says so, the rule `milestone complete` uses too (TOOL-02):
 * `## 1.0` and `## v1.0` are one version, `## v1.0.1` is another.
 */
function spliceMilestoneEntry(existing, version, entry) {
  const body = entry.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (existing === null || existing.trim() === '') return `# Milestones\n\n${body}\n`;
  const text = existing.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const offsets = [];
  let off = 0;
  for (const l of lines) {
    offsets.push(off);
    off += l.length + 1;
  }
  const head = new RegExp(milestoneHeadingPattern(version));
  const start = lines.findIndex((l) => head.test(l));
  if (start !== -1) {
    const nextRel = lines.slice(start + 1).findIndex((l) => /^## /.test(l));
    const startOff = offsets[start];
    const endOff = nextRel === -1 ? text.length : offsets[start + 1 + nextRel];
    const rest = text.slice(endOff);
    return text.slice(0, startOff) + body + (rest === '' ? '\n' : '\n\n') + rest;
  }
  let at = lines.findIndex((l) => /^# +Milestones\s*$/.test(l));
  if (at === -1) return `# Milestones\n\n${body}\n\n${text}`;
  at += 1;
  while (at < lines.length && lines[at].trim() === '' && offsets[at] < text.length) at += 1;
  const insertOff = at < lines.length ? offsets[at] : text.length;
  const before = text.slice(0, insertOff);
  const rest = text.slice(insertOff);
  const lead = before.endsWith('\n\n') ? before : `${before.replace(/\n*$/, '')}\n\n`;
  return lead + body + (rest === '' ? '\n' : '\n\n') + rest;
}

/**
 * The milestone entry text with a heading for the version guaranteed (so the local section can be found again). A first
 * line that already heads the version by the shared rule (`## 1.0 ...` or `## v1.0 ...`, TOOL-02) is kept as written.
 */
function entryWithHeading(text, version) {
  const first = text.replace(/\r\n/g, '\n').split('\n').find((l) => l.trim() !== '') || '';
  return new RegExp(milestoneHeadingPattern(version)).test(first) ? text : `## ${version}\n\n${text}`;
}

/**
 * milestonePut(root, {version, text, noFlush, noWait}) — `milestone put`.
 *
 * Local: replace-or-insert the version's section in MILESTONES.md. Store (D-05): upsert the native milestone with
 * milestoneDescription(text, <wiki page url>) — a direct write that fails before any write when offline (exit 1) —
 * then doc put `milestones/<version>.md` (the full entry as the `Milestone-vX_Y` wiki page).
 */
function milestonePut(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const version = ghMilestone.normaliseVersion(o.version);
  if (!version) return fail(`not a milestone version: ${JSON.stringify(o.version === undefined ? null : o.version)}`);
  if (typeof o.text !== 'string' || o.text.trim() === '') return fail('milestone put needs the milestone entry text');

  if (ctx.mode === LOCAL) {
    const rel = 'MILESTONES.md';
    const next = spliceMilestoneEntry(readOrNull(planningFile(ctx.main, rel)), version, entryWithHeading(o.text, version));
    return { ...verbs.writeThrough(ctx.main, { rel, text: next, verb: 'milestone put' }), version };
  }

  const rel = `milestones/${version}.md`;
  const cfg = client.readConfig(ctx.main);
  const repo = cfg && isObject(cfg.github) ? cfg.github.repo : null;
  const description = milestoneStore.milestoneDescription(o.text, milestoneStore.milestonePageUrl(repo, version));
  const up = milestoneStore.upsertMilestone(ctx.main, { version, description });
  if (!up || up.ok !== true) {
    const why = (up && (up.error || up.reason)) || 'the milestone was not written';
    return fail(`milestone ${version} not written: ${why}`, { mode: ctx.mode, rel }, { offline: Boolean(up && up.offline), version });
  }
  const r = verbs.docPut(ctx.main, { rel, text: o.text, message: `devflow: milestone ${version}`, ...flushFlags(o) });
  const warnings = [...(r.warnings || []), ...(up.warnings || [])];
  return { ...r, warnings, version, milestone: { number: up.number, title: up.title, created: up.created === true, updated: up.updated === true } };
}

/**
 * docsPut(main, rels, {message, noFlush, noWait}) — doc put of several existing cache files as ONE wiki-push and one
 * flush (planning-verbs unions the pages of a pending wiki-push). Used by milestone complete and planning import.
 */
function docsPut(main, rels, o = {}) {
  const warnings = [];
  let last = null;
  for (const rel of rels) {
    const text = readOrNull(planningFile(main, rel));
    if (text === null) {
      warnings.push(`${rel} vanished before it was queued`);
      continue;
    }
    const r = verbs.docPut(main, { rel, text, message: o.message, noFlush: true });
    if (!r.ok) return { ...r, warnings: [...warnings, ...(r.warnings || [])] };
    warnings.push(...(r.warnings || []));
    last = r;
  }
  if (last === null) return { ok: true, mode: STORE, rel: null, path: null, warnings, exit: EXIT.OK };
  const base = { ...last, rel: rels.length === 1 ? last.rel : null, path: rels.length === 1 ? last.path : null, rels, warnings };
  if (o.noFlush === true) return base;
  return flushNow(main, base, { noWait: o.noWait === true });
}

/** The `milestones/<version>-*.md` archives in the cache: what `milestone complete` publishes (and previews). */
function milestoneArchives(main, version) {
  return listDir(path.join(main, '.planning', 'milestones'))
    .filter((f) => f.startsWith(`${version}-`) && f.endsWith('.md'))
    .map((f) => `milestones/${f}`);
}

/** The `--dry-run` text of a store-mode `milestone complete`: the banner, the milestone and the archives. */
function milestoneDryRunProse(title, wouldPublish) {
  return [
    'DRY RUN — nothing has been modified.',
    `Would close milestone ${title}`,
    `Would publish: ${wouldPublish.length > 0 ? wouldPublish.join(', ') : '(none)'}`,
  ].join('\n');
}

/**
 * milestoneComplete(root, {version, dryRun, noFlush, noWait}) — `milestone complete`. Local: `{delegate:'milestone
 * complete'}` (today's cmdMilestoneComplete). Store: close the native milestone, then doc put every
 * `milestones/<version>-*.md` archive as one wiki-push. Store with `dryRun: true` (TOOL-01): report the milestone it
 * would close and the archives it would publish from the config and the cache alone — no gh call (reads included), no
 * outbox op, no ledger entry, no cache write — so it also works offline.
 */
function milestoneComplete(root, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const version = ghMilestone.normaliseVersion(o.version);
  if (!version) return fail(`not a milestone version: ${JSON.stringify(o.version === undefined ? null : o.version)}`);
  if (ctx.mode === LOCAL) {
    return { ok: true, mode: ctx.mode, rel: null, path: null, warnings: [], version, delegate: 'milestone complete', exit: EXIT.OK };
  }
  if (o.dryRun === true) {
    const title = milestoneStore.milestoneTitleFor(ctx.main, version);
    const wouldPublish = milestoneArchives(ctx.main, version);
    return {
      ok: true,
      mode: ctx.mode,
      dry_run: true,
      version,
      milestone_title: title,
      would_close: true,
      would_publish: wouldPublish,
      warnings: [],
      prose: milestoneDryRunProse(title, wouldPublish),
      exit: EXIT.OK,
    };
  }
  const closed = milestoneStore.closeMilestone(ctx.main, version);
  if (!closed || closed.ok !== true) {
    return fail(`milestone ${version} not closed: ${(closed && closed.error) || 'unknown error'}`, { mode: ctx.mode }, { offline: Boolean(closed && closed.offline), version });
  }
  const archives = milestoneArchives(ctx.main, version);
  const r = docsPut(ctx.main, archives, { message: `devflow: milestone ${version} archives`, ...flushFlags(o) });
  return { ...r, version, milestone: { number: closed.number, title: closed.title, updated: closed.updated === true } };
}

// ─── Import (planning-import.cjs) ────────────────────────────────────────────

/**
 * importEntity(root, rel, {dryRun}) — queue an EXISTING store-mode cache entity file (todo, debug, quick JOB or
 * SUMMARY) as its GitHub home, no flush: the same ops the verbs queue, with the file's own location deciding open or
 * closed (todos/completed|done, debug/resolved, a quick SUMMARY). The bytes are rewritten unchanged so writeThrough
 * ledgers them; planning-import flushes once at the end.
 * -> writeThrough's result + {id, role} | {ok:false, keep:<reason>} when the file cannot be imported.
 */
function importEntity(root, rel, opts = {}) {
  const o = optsOf(opts);
  const ctx = contextOf(root);
  if (ctx.error) return fail(ctx.error);
  const c = planningPaths.classify(rel);
  const e = c.entity;
  if (!e) return { ok: false, keep: `no entity id (the stem must be lowercase letters, digits, '.', '_' or '-')` };
  const text = readOrNull(planningFile(ctx.main, rel));
  if (text === null) return { ok: false, keep: 'the file vanished' };
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  let build;
  if (e.role === 'todo' || e.role === 'debug') {
    const stem = name.replace(/\.md$/, '');
    const title = e.role === 'todo' ? todoTitle(text) || stem : debugTitle(text, stem);
    build = (m) => [upsertOp(m, { id: e.id, role: e.role, rel, text, title }), ...(e.state === 'closed' ? [closeOp(m, e.id)] : [])];
  } else if (e.part === 'job') {
    const dir = rel.split('/')[1];
    build = (m) => [upsertOp(m, { id: e.id, role: 'quick', rel, text, title: quickTitle(e.id.slice('quick-'.length), dir.replace(/^\d+-/, '')) })];
  } else {
    build = (m) => [
      { kind: 'upsert-comment', target: { id: e.id, kind: 'summary' }, payload: { mode: 'replace', text: ghComments.fileCommentText(name, text) } },
      closeOp(m, e.id),
    ];
  }
  if (o.dryRun === true) return { ok: true, mode: ctx.mode, rel, id: e.id, role: e.role, dryRun: true, warnings: [], exit: EXIT.OK };
  const r = verbs.writeThrough(ctx.main, { rel, text, verb: 'planning import', enqueue: enqueueOf(build), noFlush: true });
  return { ...r, id: e.id, role: e.role };
}

module.exports = {
  importEntity,
  entityIdFor,
  todoAdd,
  todoComplete,
  debugPut,
  debugResolve,
  quickPut,
  quickSummary,
  decisionOpen,
  decisionAnswer,
  milestonePut,
  milestoneComplete,
  docsPut,
  spliceMilestoneEntry,
  entryWithHeading,
  removeThrough,
};
