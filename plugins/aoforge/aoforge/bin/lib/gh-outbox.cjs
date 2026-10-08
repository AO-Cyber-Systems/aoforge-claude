'use strict';

/**
 * gh-outbox.cjs — TRD 47-03 (GST-05, store half)
 *
 * The durable, per-repo outbox for every GitHub issue write objective 47 introduces.
 * It stores LOGICAL ops (`kind` + `target` + `payload`, never argv), keeps strict FIFO order,
 * coalesces duplicate pending ops, and refuses malformed ops at enqueue. Execution lives in
 * gh-outbox-flush.cjs (47-07); nothing here calls gh.
 *
 * Location: $AOFORGE_OUTBOX_DIR, else ~/.claude/aoforge/state/outbox/. One journal per repo,
 * `<repoKey>.json`, with sibling files `<repoKey>.base.json`, `<repoKey>.cache.json` and
 * `<repoKey>.lock`. Nothing is ever written inside the project, so Claude Code's file watcher
 * never sees a change (same lesson as awareness-store.cjs and progress-guard-store.cjs).
 *
 * Hook-safe on purpose: node builtins plus sync-state.cjs (for atomicWrite) only. The post-commit
 * and Stop hooks of objectives 49-50 will call a flush, so this module must stay cheap to load.
 * That is why repoKey is copied below instead of imported, and why `.planning/config.json` is read
 * directly instead of through gh-client / helpers.
 *
 * Failure policy: a journal that cannot be parsed is renamed to `<file>.corrupt-<ts>` and reported,
 * never silently replaced - a queue that quietly forgets writes is worse than one that stops.
 *
 * Concurrency: every journal write is atomic (tmp + rename), so a reader never sees a torn file.
 * Each mutator is its own short read-modify-write; callers (the flusher) must re-read through the
 * mutators between ops rather than holding one journal across a gh call. The single-flusher lock
 * and the cross-process write budget guard the long-running part.
 *
 * Time is injected: functions take `now` (epoch ms) in their options; `Date.now()` appears only as
 * a default argument.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { atomicWrite } = require('./sync-state.cjs');

const JOURNAL_VERSION = 1;
/** Done ops kept in the journal for `status`; older ones are pruned on write. */
const MAX_DONE_OPS = 200;
const STATUSES = ['pending', 'done', 'blocked'];
const HALT_REASONS = ['remote-edit', 'blocked'];
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
/** Cross-process GitHub write budget: refuse at >= this many writes inside the window. */
const BUDGET = Object.freeze({ minute: 80, hour: 450 });
/** A flush lock older than this is assumed to belong to a dead flusher. */
const LOCK_STALE_MS = 10 * MINUTE_MS;

// ─── small validators ─────────────────────────────────────────────────────────

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;

/** AOForge ids: `47`, `47-01`, `47-01-d1`, `07.1`. Never an issue number (a number type fails here). */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function idErr(v, name) {
  return typeof v === 'string' && ID_RE.test(v)
    ? null
    : `${name} must be an AOForge id string such as "47-01" (never an issue number), got ${JSON.stringify(v)}`;
}

/** First key of `obj` that is not in `allowed`, formatted as an error; else null. */
function unknownKey(obj, allowed, what) {
  const extra = Object.keys(obj).find((k) => !allowed.includes(k));
  return extra === undefined ? null : `unexpected ${what} field "${extra}"`;
}

function strArray(v, name) {
  return Array.isArray(v) && v.every((x) => isStr(x)) ? null : `${name} must be an array of non-empty strings`;
}

/** An optional string-or-null field. */
function optStrOrNull(obj, key) {
  const v = obj[key];
  return v === undefined || v === null || typeof v === 'string' ? null : `payload.${key} must be a string or null`;
}

function emptyPayload(p) {
  return isPlainObject(p) && Object.keys(p).length === 0 ? null : 'payload must be {}';
}

/** A pull request belongs to an objective (`49`, `2.1`), never to a TRD, Decision or entity. */
const OBJECTIVE_ID_RE = /^\d+(?:\.\d+)?$/;

function objectiveIdErr(v, name) {
  const e = idErr(v, name);
  if (e) return e;
  return OBJECTIVE_ID_RE.test(v) ? null : `${name} must be an objective id such as "49" (a pull request belongs to an objective), got ${JSON.stringify(v)}`;
}

/**
 * A git branch name that is safe to put in a query string and a JSON body: no whitespace or control character,
 * none of `~ ^ : ? * [ \`, no `..`, and not starting with `-` or `/` or ending with `/` or `.`.
 */
function branchErr(v, name) {
  const ok = typeof v === 'string' && v !== '' && !/[\s\x00-\x1f\x7f~^:?*[\\]/.test(v) && !v.includes('..')
    && !v.startsWith('-') && !v.startsWith('/') && !v.endsWith('/') && !v.endsWith('.');
  return ok ? null : `${name} must be a git branch name, got ${JSON.stringify(v)}`;
}

/** 49-10: commit-status states, GitHub's 140-character description limit, a commit sha, a status context. */
const STATUS_STATES = ['success', 'failure', 'pending', 'error'];
const STATUS_DESCRIPTION_MAX = 140;
const SHA_RE = /^[0-9a-fA-F]{7,40}$/;
const STATUS_CONTEXT_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
/** The three REST merge methods; a merge queue takes none of them. */
const MERGE_METHODS = ['squash', 'merge', 'rebase'];

/** `upsert-pr` payload.wiki: the buildWikiSection arguments, `{dir, page, url, sha}`, all non-empty strings. */
const PR_WIKI_KEYS = ['dir', 'page', 'url', 'sha'];

// ─── OP_KINDS: the one contract between enqueuers (47-08/09/12) and the executor (47-07) ──────────

/** upsert-issue roles: 47's trd/decision, then 48's entity roles (todo, debug, quick). */
const ROLES = Object.freeze(['trd', 'decision', 'todo', 'debug', 'quick']);

/**
 * Entity roles (48-02, D-03): todos, debug sessions and quick tasks are issues too. Each names the label the
 * flusher applies (`config.github.labels.<role>` overrides it, exactly as labels.trd / labels.decision do)
 * and the issue type: none for a todo; Debug and Quick are optional types, degraded per type.
 */
const ENTITY_ROLES = Object.freeze({
  todo: Object.freeze({ label: 'aoforge:todo', type: null }),
  debug: Object.freeze({ label: 'aoforge:debug', type: 'Debug' }),
  quick: Object.freeze({ label: 'aoforge:quick', type: 'Quick' }),
});

/**
 * Entity ids: `todo-<stem>`, `debug-<stem>`, `quick-<N>`. Duplicated from gh-trd.cjs ENTITY_ID_RE on purpose,
 * because this module stays hook-safe (builtins plus sync-state only); a test pins the two to one `.source`.
 */
const ENTITY_ID_RE = /^(?:(?:todo|debug)-[a-z0-9][a-z0-9._-]{0,99}|quick-\d+)$/;

/** Is `id` an entity id whose prefix is `role`? */
function entityIdHasRole(id, role) {
  return typeof id === 'string' && ENTITY_ID_RE.test(id) && id.slice(0, id.indexOf('-')) === role;
}

const ISSUE_STATES = ['open', 'closed'];
const DERIVE_KEYS = ['wiki', 'trds', 'meta'];
const META_KEYS = ['type', 'work', 'kind'];
const FIELD_KEYS = ['work', 'kind'];

function checkDerive(d) {
  if (!isPlainObject(d)) return 'payload.derive must be an object';
  const bad = unknownKey(d, DERIVE_KEYS, 'derive');
  if (bad) return bad;
  if (d.wiki !== undefined) {
    if (!isPlainObject(d.wiki) || !isStr(d.wiki.dir) || unknownKey(d.wiki, ['dir'], 'derive.wiki')) {
      return 'payload.derive.wiki must be {dir: string}';
    }
  }
  if (d.trds !== undefined && d.trds !== true) return 'payload.derive.trds must be true';
  if (d.meta !== undefined) {
    if (!isPlainObject(d.meta) || unknownKey(d.meta, META_KEYS, 'derive.meta')
      || !Object.values(d.meta).every((x) => typeof x === 'string')) {
      return 'payload.derive.meta must be {type?, work?, kind?} of strings';
    }
  }
  return null;
}

/** A wiki-push page is a path relative to `.planning/`: no absolute paths, no `..`, no NUL. */
function safeRelPath(p) {
  return isStr(p) && !p.startsWith('/') && !p.includes('\0') && !p.includes('\\') && !p.split('/').includes('..');
}

/**
 * Each entry: `target` = the exact set of target fields (all required, none extra) and
 * `check(target, payload)` = the type/shape check, returning an error string or null.
 */
const OP_KINDS = Object.freeze({
  'upsert-issue': {
    target: ['id', 'role'],
    check(t, p) {
      const e = idErr(t.id, 'target.id');
      if (e) return e;
      if (!ROLES.includes(t.role)) return `target.role must be one of ${ROLES.join('|')}`;
      // An entity role must name an entity id of that role; trd/decision keep the 47 path unchanged.
      if (Object.hasOwn(ENTITY_ROLES, t.role) && !entityIdHasRole(t.id, t.role)) {
        return `entity id ${t.id} does not match role ${t.role}`;
      }
      if (!isPlainObject(p)) return 'payload must be an object';
      if (!isStr(p.title)) return 'payload.title must be a non-empty string';
      if (typeof p.body !== 'string') return 'payload.body must be a string';
      const l = strArray(p.labels, 'payload.labels');
      if (l) return l;
      return optStrOrNull(p, 'milestone_title') || optStrOrNull(p, 'type')
        || unknownKey(p, ['title', 'body', 'labels', 'milestone_title', 'type'], 'payload');
    },
  },
  'patch-body': {
    target: ['id'],
    check(t, p) {
      const e = idErr(t.id, 'target.id');
      if (e) return e;
      if (!isPlainObject(p)) return 'payload must be an object';
      if (p.mode === 'replace') {
        if (typeof p.body !== 'string') return 'payload.body must be a string for mode "replace"';
        return unknownKey(p, ['mode', 'body'], 'payload');
      }
      if (p.mode !== 'managed') return 'payload.mode must be "managed" or "replace"';
      const bad = unknownKey(p, ['mode', 'sections', 'preserve_ticks', 'derive'], 'payload');
      if (bad) return bad;
      if (!isPlainObject(p.sections) || !Object.values(p.sections).every((x) => typeof x === 'string')) {
        return 'payload.sections must be an object of {name: text}';
      }
      if (p.preserve_ticks !== undefined && typeof p.preserve_ticks !== 'boolean') {
        return 'payload.preserve_ticks must be a boolean';
      }
      if (p.derive !== undefined) {
        const d = checkDerive(p.derive);
        if (d) return d;
      }
      const hasDerive = p.derive !== undefined && Object.keys(p.derive).length > 0;
      return Object.keys(p.sections).length > 0 || hasDerive
        ? null
        : 'payload needs at least one section or a derive request';
    },
  },
  'patch-issue': {
    target: ['id'],
    check(t, p) {
      const e = idErr(t.id, 'target.id');
      if (e) return e;
      if (!isPlainObject(p)) return 'payload must be an object';
      const bad = unknownKey(p, ['type', 'state', 'state_reason', 'labels_add', 'labels_remove'], 'payload');
      if (bad) return bad;
      if (Object.keys(p).length === 0) {
        return 'patch-issue payload needs at least one of type, state, state_reason, labels_add, labels_remove';
      }
      if (p.type !== undefined && !isStr(p.type)) return 'payload.type must be a non-empty string';
      if (p.state !== undefined && !ISSUE_STATES.includes(p.state)) {
        return `payload.state must be one of ${ISSUE_STATES.join('|')}`;
      }
      if (p.state_reason !== undefined && !isStr(p.state_reason)) return 'payload.state_reason must be a non-empty string';
      if (p.labels_add !== undefined) {
        const l = strArray(p.labels_add, 'payload.labels_add');
        if (l) return l;
        if (p.labels_add.length === 0) return 'payload.labels_add must not be empty';
      }
      if (p.labels_remove !== undefined) {
        const l = strArray(p.labels_remove, 'payload.labels_remove');
        if (l) return l;
        if (p.labels_remove.length === 0) return 'payload.labels_remove must not be empty';
      }
      return null;
    },
  },
  'link-sub-issue': {
    target: ['parent', 'child'],
    check(t, p) {
      return idErr(t.parent, 'target.parent') || idErr(t.child, 'target.child')
        || (t.parent === t.child ? 'target.parent and target.child must differ' : null)
        || emptyPayload(p);
    },
  },
  block: {
    target: ['blocked', 'blocker'],
    check(t, p) {
      return idErr(t.blocked, 'target.blocked') || idErr(t.blocker, 'target.blocker')
        || (t.blocked === t.blocker ? 'target.blocked and target.blocker must differ' : null)
        || emptyPayload(p);
    },
  },
  'set-fields': {
    target: ['id'],
    check(t, p) {
      const e = idErr(t.id, 'target.id');
      if (e) return e;
      if (!isPlainObject(p)) return 'payload must be an object';
      const bad = unknownKey(p, ['values'], 'payload');
      if (bad) return bad;
      if (!isPlainObject(p.values)) return 'payload.values must be an object';
      const badValue = unknownKey(p.values, FIELD_KEYS, 'payload.values');
      if (badValue) return badValue;
      if (Object.keys(p.values).length === 0) return 'payload.values needs at least one of work, kind';
      return Object.values(p.values).every((x) => isStr(x)) ? null : 'payload.values must be non-empty strings';
    },
  },
  'upsert-comment': {
    target: ['id', 'kind'],
    check(t, p) {
      const e = idErr(t.id, 'target.id');
      if (e) return e;
      if (typeof t.kind !== 'string' || !ID_RE.test(t.kind)) return 'target.kind must be a comment kind string such as "summary"';
      if (!isPlainObject(p)) return 'payload must be an object';
      if (p.mode === 'replace') {
        if (!isStr(p.text)) return 'payload.text must be a non-empty string for mode "replace"';
        return unknownKey(p, ['mode', 'text'], 'payload');
      }
      if (p.mode !== 'append-spec-rev') return 'payload.mode must be "replace" or "append-spec-rev"';
      const bad = unknownKey(p, ['mode', 'entry'], 'payload');
      if (bad) return bad;
      const en = p.entry;
      if (!isPlainObject(en) || unknownKey(en, ['at', 'event', 'hash', 'chars'], 'payload.entry')
        || !isStr(en.at) || !isStr(en.event) || !isStr(en.hash)
        || typeof en.chars !== 'number' || !Number.isFinite(en.chars) || en.chars < 0) {
        return 'payload.entry must be {at, event, hash: strings, chars: number}';
      }
      return null;
    },
  },
  'post-scope': {
    target: ['id', 'n'],
    check(t, p) {
      const e = idErr(t.id, 'target.id');
      if (e) return e;
      if (!Number.isInteger(t.n) || t.n < 1) return 'target.n must be a positive integer';
      if (!isPlainObject(p)) return 'payload must be an object';
      if (!isStr(p.text)) return 'payload.text must be a non-empty string';
      return unknownKey(p, ['text'], 'payload');
    },
  },
  'wiki-push': {
    target: ['store'],
    check(t, p) {
      if (t.store !== 'pages') return 'target.store must be "pages"';
      if (!isPlainObject(p)) return 'payload must be an object';
      const bad = unknownKey(p, ['pages', 'message'], 'payload');
      if (bad) return bad;
      if (!Array.isArray(p.pages) || p.pages.length === 0 || !p.pages.every(safeRelPath)) {
        return 'payload.pages must be a non-empty array of paths relative to .planning/ (no absolute paths, no "..")';
      }
      return isStr(p.message) ? null : 'payload.message must be a non-empty string';
    },
  },
  // 49-05: the one pull request per objective. `closes` is never in the payload: the flusher derives it from the
  // mapping at flush time, so a TRD planned after `gh pr start` still closes on merge. `title` is needed only to
  // create the PR; an existing PR keeps its remote title.
  'upsert-pr': {
    target: ['id'],
    check(t, p) {
      const e = objectiveIdErr(t.id, 'target.id');
      if (e) return e;
      if (!isPlainObject(p)) return 'payload must be an object';
      const bad = unknownKey(p, ['branch', 'base', 'title', 'wiki', 'summary'], 'payload');
      if (bad) return bad;
      const fail = branchErr(p.branch, 'payload.branch') || branchErr(p.base, 'payload.base');
      if (fail) return fail;
      if (p.title !== undefined && !isStr(p.title)) return 'payload.title must be a non-empty string';
      if (p.summary !== undefined && typeof p.summary !== 'string') return 'payload.summary must be a string';
      if (p.wiki !== undefined) {
        const w = p.wiki;
        if (!isPlainObject(w) || unknownKey(w, PR_WIKI_KEYS, 'wiki') || !PR_WIKI_KEYS.every((k) => isStr(w[k]))) {
          return 'payload.wiki must be {dir, page, url, sha} of non-empty strings';
        }
      }
      return null;
    },
  },
  'pr-ready': {
    target: ['id'],
    check(t, p) {
      return objectiveIdErr(t.id, 'target.id') || emptyPayload(p);
    },
  },
  // 49-10: the PR-side writes that verify-pass and merge replay. All four target the objective's PR (or its branch)
  // and are flushed after the PR exists.
  //
  // `post-status` posts a commit status (never a check run: only a GitHub App may create one, and the local
  // identity is the developer's token). `sha` is optional because the flusher resolves the PR head when absent.
  'post-status': {
    target: ['id', 'context'],
    check(t, p) {
      const e = objectiveIdErr(t.id, 'target.id');
      if (e) return e;
      if (typeof t.context !== 'string' || !STATUS_CONTEXT_RE.test(t.context)) {
        return `target.context must be a status context such as "aoforge/verification", got ${JSON.stringify(t.context)}`;
      }
      if (!isPlainObject(p)) return 'payload must be an object';
      const bad = unknownKey(p, ['state', 'description', 'sha', 'target_url'], 'payload');
      if (bad) return bad;
      if (!STATUS_STATES.includes(p.state)) return `payload.state must be one of ${STATUS_STATES.join('|')}`;
      if (!isStr(p.description) || p.description.length > STATUS_DESCRIPTION_MAX) {
        return `payload.description must be a non-empty string of at most ${STATUS_DESCRIPTION_MAX} characters`;
      }
      if (p.sha !== undefined && !(typeof p.sha === 'string' && SHA_RE.test(p.sha))) {
        return 'payload.sha must be a 7 to 40 character hex commit sha';
      }
      if (p.target_url !== undefined && !(typeof p.target_url === 'string' && /^https?:\/\/\S+$/.test(p.target_url))) {
        return 'payload.target_url must be an http(s) URL';
      }
      return null;
    },
  },
  // One sticky, marker-keyed comment per `kind` on the objective PR (e.g. `wiki-diff`). Replace-only: the
  // append-spec-rev log is an issue-comment device and has no meaning on a PR.
  'upsert-pr-comment': {
    target: ['id', 'kind'],
    check(t, p) {
      const e = objectiveIdErr(t.id, 'target.id');
      if (e) return e;
      if (typeof t.kind !== 'string' || !ID_RE.test(t.kind)) return 'target.kind must be a comment kind string such as "wiki-diff"';
      if (!isPlainObject(p)) return 'payload must be an object';
      if (p.mode !== 'replace') return 'payload.mode must be "replace"';
      const bad = unknownKey(p, ['mode', 'text'], 'payload');
      if (bad) return bad;
      return isStr(p.text) ? null : 'payload.text must be a non-empty string';
    },
  },
  // `method` is optional: absent means `github.pr.merge_method`, then squash. A merge queue ignores it.
  'pr-merge': {
    target: ['id'],
    check(t, p) {
      const e = objectiveIdErr(t.id, 'target.id');
      if (e) return e;
      if (!isPlainObject(p)) return 'payload must be an object';
      const bad = unknownKey(p, ['method'], 'payload');
      if (bad) return bad;
      if (p.method !== undefined && !MERGE_METHODS.includes(p.method)) {
        return `payload.method must be one of ${MERGE_METHODS.join('|')}`;
      }
      return null;
    },
  },
  'delete-branch': {
    target: ['id'],
    check(t, p) {
      const e = objectiveIdErr(t.id, 'target.id');
      if (e) return e;
      if (!isPlainObject(p)) return 'payload must be an object';
      const bad = unknownKey(p, ['branch'], 'payload');
      return bad || branchErr(p.branch, 'payload.branch');
    },
  },
});

/**
 * @param {*} op `{kind, target, payload, base?}`
 * @returns {{ok:true}|{ok:false, error:string}}
 */
function validateOp(op) {
  if (!isPlainObject(op)) return { ok: false, error: 'op must be an object' };
  const spec = typeof op.kind === 'string' && Object.hasOwn(OP_KINDS, op.kind) ? OP_KINDS[op.kind] : null;
  if (!spec) return { ok: false, error: `unknown op kind ${JSON.stringify(op.kind)}` };
  const fail = (msg) => ({ ok: false, error: `${op.kind}: ${msg}` });
  if (!isPlainObject(op.target)) return fail('target must be an object');
  const missing = spec.target.find((f) => !Object.hasOwn(op.target, f));
  if (missing) return fail(`target.${missing} is required`);
  const extra = unknownKey(op.target, spec.target, 'target');
  if (extra) return fail(extra);
  if (op.base !== undefined && op.base !== null && !isPlainObject(op.base)) return fail('base must be an object or null');
  const err = spec.check(op.target, op.payload);
  return err ? fail(err) : { ok: true };
}

// ─── stable keys ──────────────────────────────────────────────────────────────

/** JSON with object keys sorted, so insertion order never changes a key. */
function stable(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}

/** @returns {string} stable string identity of an op target. */
function targetKey(target) {
  return stable(target);
}

/** @returns {string} `sha256:<hex>` of kind + target + payload (the op's idempotency key). */
function opKey(op) {
  const text = `${op.kind}\n${stable(op.target)}\n${stable(op.payload === undefined ? {} : op.payload)}`;
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

// ─── paths ────────────────────────────────────────────────────────────────────

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home] defaults to os.homedir(); a parameter so tests never depend on the real home
 */
function stateDir(env = process.env, home) {
  const override = env && env.AOFORGE_OUTBOX_DIR;
  if (override) return override;
  return path.join(home || os.homedir(), '.claude', 'aoforge', 'state', 'outbox');
}

/**
 * repoKey(projectRoot) -> <slug>-<hash8>. Copied from awareness-store.repoKey (lines 57-67) because
 * this module must stay hook-safe; a test asserts the two agree. Never throws: an unresolvable path
 * falls back to path.resolve.
 */
function repoKey(projectRoot) {
  let real;
  try {
    real = fs.realpathSync(projectRoot);
  } catch {
    real = path.resolve(projectRoot);
  }
  const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
  return `${slug}-${hash8}`;
}

/** `<stateDir>/<repoKey><suffix>` - the one place every per-repo file name is built. */
function repoFile(projectRoot, suffix, opts = {}) {
  return path.join(stateDir(opts.env || process.env, opts.home), `${repoKey(projectRoot)}${suffix}`);
}

/** @returns {string} absolute path of this project's journal (outside the project). */
function journalPath(projectRoot, opts = {}) {
  return repoFile(projectRoot, '.json', opts);
}

// ─── config ───────────────────────────────────────────────────────────────────

function readGithubConfig(projectRoot) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(projectRoot, '.planning', 'config.json'), 'utf8'));
    return cfg && isPlainObject(cfg.github) ? cfg.github : null;
  } catch {
    return null;
  }
}

/** `github.enabled === true` in `.planning/config.json`. Missing or invalid config is not enabled. */
function isEnabled(projectRoot) {
  const gh = readGithubConfig(projectRoot);
  return !!gh && gh.enabled === true;
}

// ─── journal ──────────────────────────────────────────────────────────────────

function emptyJournal(repo = null) {
  return { version: JOURNAL_VERSION, repo, ops: [], halted: null, next_seq: 1, writes: [] };
}

function validJournalShape(j) {
  return isPlainObject(j) && j.version === JOURNAL_VERSION && Array.isArray(j.ops)
    && j.ops.every((o) => isPlainObject(o) && Number.isInteger(o.seq) && typeof o.kind === 'string'
      && STATUSES.includes(o.status));
}

/** Fill the optional fields of a parsed journal; next_seq never falls at or below an existing seq. */
function normalizeJournal(j) {
  const maxSeq = j.ops.reduce((m, o) => Math.max(m, o.seq), 0);
  j.repo = typeof j.repo === 'string' ? j.repo : null;
  j.halted = isPlainObject(j.halted) ? j.halted : null;
  j.writes = Array.isArray(j.writes) ? j.writes.filter((w) => typeof w === 'number') : [];
  j.next_seq = Number.isInteger(j.next_seq) && j.next_seq > maxSeq ? j.next_seq : maxSeq + 1;
  return j;
}

/**
 * Move an unreadable file aside. Throws if it cannot: carrying on would let the next write
 * overwrite the only copy of the user's queued writes.
 */
function quarantine(file, now) {
  let dest = `${file}.corrupt-${now}`;
  for (let i = 1; fs.existsSync(dest); i++) dest = `${file}.corrupt-${now}-${i}`;
  fs.renameSync(file, dest);
  return dest;
}

/**
 * Read a JSON state file. Missing -> `empty()`. Unparseable or failing `valid` -> quarantined and
 * `empty()`, with `recovered.corrupt_path` set. Any other I/O error throws.
 */
function readJsonFile(file, valid, empty, now) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { value: empty(), recovered: null };
    throw e;
  }
  let parsed;
  let ok = false;
  try {
    parsed = JSON.parse(raw);
    ok = valid(parsed);
  } catch {
    ok = false;
  }
  if (ok) return { value: parsed, recovered: null };
  return { value: empty(), recovered: { corrupt_path: quarantine(file, now) } };
}

/**
 * @param {string} projectRoot
 * @param {{now?:number, env?:object, home?:string}} [opts]
 * @returns {{journal:object, recovered:null|{corrupt_path:string}}} never creates a file
 */
function readJournal(projectRoot, opts = {}) {
  const { now = Date.now() } = opts;
  const { value, recovered } = readJsonFile(
    journalPath(projectRoot, opts), validJournalShape, () => emptyJournal(readRepoName(projectRoot)), now,
  );
  return { journal: normalizeJournal(value), recovered };
}

function readRepoName(projectRoot) {
  const gh = readGithubConfig(projectRoot);
  return gh && isStr(gh.repo) ? gh.repo : null;
}

/** Drop all but the newest MAX_DONE_OPS done ops, in place. Pending and blocked ops are never pruned. */
function pruneDone(journal) {
  const doneSeqs = journal.ops.filter((o) => o.status === 'done').map((o) => o.seq).sort((a, b) => b - a);
  if (doneSeqs.length <= MAX_DONE_OPS) return journal;
  const keep = new Set(doneSeqs.slice(0, MAX_DONE_OPS));
  journal.ops = journal.ops.filter((o) => o.status !== 'done' || keep.has(o.seq));
  return journal;
}

/**
 * Persist a journal atomically, pruning done ops beyond the newest 200 (the journal is pruned in place).
 * @returns {string} the journal path
 */
function writeJournal(projectRoot, journal, opts = {}) {
  pruneDone(journal);
  const file = journalPath(projectRoot, opts);
  atomicWrite(file, `${JSON.stringify(journal, null, 2)}\n`);
  return file;
}

/** Read-modify-write one journal. `fn` returns `{ok:false,...}` to abort or `{noop:true}` to skip the write. */
function mutate(projectRoot, opts, fn) {
  const { journal } = readJournal(projectRoot, opts);
  const result = fn(journal);
  if (result && (result.ok === false || result.noop)) return result;
  writeJournal(projectRoot, journal, opts);
  return result;
}

const isoAt = (ms) => new Date(ms).toISOString();

const isSpecRevAppend = (o) => o.kind === 'upsert-comment' && isPlainObject(o.payload) && o.payload.mode === 'append-spec-rev';

/**
 * May `incoming` fold into the pending op `existing` (same kind and target)? Almost always yes (latest payload
 * wins). The exception is an `append-spec-rev` op: it adds one row to an append-only log, so replacing a pending
 * append with a different row would silently lose the earlier one. Two appends coalesce only when they are the
 * same row (event and hash, the flusher's own idempotency key); an append never folds into a replace.
 */
function coalescible(existing, incoming) {
  if (!isSpecRevAppend(existing) && !isSpecRevAppend(incoming)) return true;
  if (!isSpecRevAppend(existing) || !isSpecRevAppend(incoming)) return false;
  const a = existing.payload.entry;
  const b = incoming.payload.entry;
  return a.event === b.event && a.hash === b.hash;
}

/**
 * Queue logical ops. All-or-nothing: every op is validated before any is written. A pending op with the
 * same kind + target is replaced in place (latest payload wins, original seq and queued_at kept); a
 * blocked or done op is never replaced, a new op is appended instead. The one exception (47-08): an
 * `upsert-comment` in mode `append-spec-rev` adds a row to an append-only log, so it coalesces only with the
 * same row (event + hash) and keeps the first entry; a different row is queued as its own op.
 *
 * When `github.enabled` is not true this writes nothing and returns `{ok:true, skipped:true, reason}`
 * (46's contract: disabled is not an error). Degraded mode is not disabled.
 *
 * @param {string} projectRoot
 * @param {Array<{kind:string, target:object, payload?:object, base?:object|null}>} ops
 * @param {{now?:number, env?:object, home?:string}} [opts]
 * @returns {{ok:boolean, enqueued:number[], coalesced:number[], skipped?:boolean, reason?:string,
 *   error?:string, invalid?:Array<{index:number,error:string}>, recovered?:object}}
 */
function enqueue(projectRoot, ops, opts = {}) {
  const { now = Date.now() } = opts;
  if (!isEnabled(projectRoot)) {
    return {
      ok: true, skipped: true, reason: 'github.enabled is not true in .planning/config.json',
      enqueued: [], coalesced: [],
    };
  }
  if (!Array.isArray(ops)) return { ok: false, error: 'ops must be an array', invalid: [], enqueued: [], coalesced: [] };

  const invalid = [];
  const normalized = ops.map((o, index) => {
    const n = isPlainObject(o)
      ? { kind: o.kind, target: o.target, payload: o.payload === undefined ? {} : o.payload, base: o.base === undefined ? null : o.base }
      : o;
    const v = validateOp(n);
    if (!v.ok) invalid.push({ index, error: v.error });
    return n;
  });
  if (invalid.length > 0) {
    const first = invalid[0];
    return {
      ok: false, error: `invalid op at index ${first.index}: ${first.error}`, invalid, enqueued: [], coalesced: [],
    };
  }
  if (normalized.length === 0) return { ok: true, enqueued: [], coalesced: [] };

  const { journal, recovered } = readJournal(projectRoot, opts);
  const enqueued = [];
  const coalesced = [];
  for (const n of normalized) {
    const tk = targetKey(n.target);
    const existing = journal.ops.find((o) => o.status === 'pending' && o.kind === n.kind && targetKey(o.target) === tk
      && coalescible(o, n));
    if (existing) {
      // An append is the same row already queued: keep the first entry (it holds the real time).
      if (!isSpecRevAppend(n)) {
        existing.payload = n.payload;
        existing.key = opKey(n);
      }
      if (n.base) existing.base = n.base;
      coalesced.push(existing.seq);
      continue;
    }
    const seq = journal.next_seq;
    journal.next_seq = seq + 1;
    journal.ops.push({
      seq,
      key: opKey(n),
      kind: n.kind,
      target: n.target,
      payload: n.payload,
      base: n.base,
      status: 'pending',
      attempts: 0,
      last_error: null,
      retry_after: null,
      queued_at: isoAt(now),
      done_at: null,
    });
    enqueued.push(seq);
  }
  journal.repo = readRepoName(projectRoot) || journal.repo;
  writeJournal(projectRoot, journal, opts);
  const result = { ok: true, enqueued, coalesced };
  if (recovered) result.recovered = recovered;
  return result;
}

// ─── consuming the queue ──────────────────────────────────────────────────────

/** The head of the queue stops it when it is blocked: report that as a halt. */
function blockedHalt(op) {
  return { reason: 'blocked', seq: op.seq, target: op.target, detail: op.last_error };
}

/**
 * The next op to run. Strictly FIFO by seq: nothing past an earlier pending or blocked op is ever
 * returned, and nothing at all while the journal is halted.
 *
 * @param {string} projectRoot
 * @param {{now?:number, ignoreRetryAfter?:boolean, env?:object, home?:string}} [opts]
 * @returns {{op:object|null, halted:object|null, reason:'halted'|'blocked'|'retry_after'|'empty'|null, wait_ms?:number}}
 *   `op` is set only when there is something to run (`reason` null). A blocked head op yields
 *   `op:null, halted:{reason:'blocked', seq, target, detail}`; a pending head op whose `retry_after`
 *   (epoch ms) is still in the future yields `op:null, reason:'retry_after', wait_ms` unless
 *   `ignoreRetryAfter` is set (a manual flush).
 */
function nextOp(projectRoot, opts = {}) {
  const { now = Date.now(), ignoreRetryAfter = false } = opts;
  const { journal } = readJournal(projectRoot, opts);
  if (journal.halted) return { op: null, halted: journal.halted, reason: 'halted' };
  const head = [...journal.ops].sort((a, b) => a.seq - b.seq).find((o) => o.status !== 'done');
  if (!head) return { op: null, halted: null, reason: 'empty' };
  if (head.status === 'blocked') return { op: null, halted: blockedHalt(head), reason: 'blocked' };
  if (!ignoreRetryAfter && typeof head.retry_after === 'number' && head.retry_after > now) {
    return { op: null, halted: null, reason: 'retry_after', wait_ms: head.retry_after - now };
  }
  return { op: head, halted: null, reason: null };
}

function findOp(journal, seq) {
  return journal.ops.find((o) => o.seq === Number(seq));
}

const noSuchOp = (seq) => ({ ok: false, error: `no op with seq ${seq}` });

/** @returns {{ok:true, op:object}|{ok:false, error:string}} */
function markDone(projectRoot, seq, opts = {}) {
  const { now = Date.now() } = opts;
  return mutate(projectRoot, opts, (journal) => {
    const o = findOp(journal, seq);
    if (!o) return noSuchOp(seq);
    o.status = 'done';
    o.done_at = isoAt(now);
    o.last_error = null;
    o.retry_after = null;
    return { ok: true, op: o };
  });
}

/**
 * Leave an op pending after a failed attempt: attempts + 1, the error recorded, and an optional
 * `retry_after` (epoch ms) before which `nextOp` will not hand it out again.
 * @param {{error?:string, retry_after?:number|null}} [details]
 */
function markPending(projectRoot, seq, details = {}, opts = {}) {
  const ra = details.retry_after === undefined ? null : details.retry_after;
  if (ra !== null && !Number.isFinite(ra)) return { ok: false, error: 'retry_after must be epoch milliseconds or null' };
  return mutate(projectRoot, opts, (journal) => {
    const o = findOp(journal, seq);
    if (!o) return noSuchOp(seq);
    o.status = 'pending';
    o.attempts = (o.attempts || 0) + 1;
    o.last_error = details.error === undefined || details.error === null ? null : String(details.error);
    o.retry_after = ra;
    return { ok: true, op: o };
  });
}

/** A human must resolve this op before the queue moves past it. */
function markBlocked(projectRoot, seq, reason, opts = {}) {
  return mutate(projectRoot, opts, (journal) => {
    const o = findOp(journal, seq);
    if (!o) return noSuchOp(seq);
    o.status = 'blocked';
    o.last_error = reason === undefined || reason === null ? null : String(reason);
    o.retry_after = null;
    return { ok: true, op: o };
  });
}

/** Remove an op outright (resolve --accept-remote). Its seq is never reused. */
function dropOp(projectRoot, seq, opts = {}) {
  return mutate(projectRoot, opts, (journal) => {
    const o = findOp(journal, seq);
    if (!o) return noSuchOp(seq);
    journal.ops = journal.ops.filter((x) => x !== o);
    return { ok: true, op: o };
  });
}

/** @param {{reason:'remote-edit'|'blocked', seq?:number, target?:object, detail?:string}} halted */
function setHalted(projectRoot, halted, opts = {}) {
  if (!isPlainObject(halted) || !HALT_REASONS.includes(halted.reason)) {
    return { ok: false, error: `halted.reason must be one of ${HALT_REASONS.join('|')}` };
  }
  return mutate(projectRoot, opts, (journal) => {
    journal.halted = {
      reason: halted.reason,
      seq: halted.seq === undefined ? null : halted.seq,
      target: halted.target === undefined ? null : halted.target,
      detail: halted.detail === undefined ? null : halted.detail,
    };
    return { ok: true, halted: journal.halted };
  });
}

function clearHalted(projectRoot, opts = {}) {
  return mutate(projectRoot, opts, (journal) => {
    if (!journal.halted) return { ok: true, noop: true };
    journal.halted = null;
    return { ok: true };
  });
}

// ─── status ───────────────────────────────────────────────────────────────────

/** Newest `<journal>.corrupt-*` sibling, so a recovery is still reported after the rename already happened. */
function latestCorrupt(projectRoot, opts) {
  const file = journalPath(projectRoot, opts);
  const prefix = `${path.basename(file)}.corrupt-`;
  let names;
  try {
    names = fs.readdirSync(path.dirname(file));
  } catch {
    return null;
  }
  let best = null;
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const m = /^(\d+)(?:-(\d+))?$/.exec(name.slice(prefix.length));
    if (!m) continue;
    const rank = [Number(m[1]), m[2] ? Number(m[2]) : 0];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) best = { name, rank };
  }
  return best ? { corrupt_path: path.join(path.dirname(file), best.name), at: isoAt(best.rank[0]) } : null;
}

/** Writes recorded inside the trailing minute and hour windows (a write at exactly now-60s has aged out). */
function countWrites(journal, now) {
  let minute = 0;
  let hour = 0;
  for (const w of journal.writes) {
    if (w > now - HOUR_MS) hour++;
    if (w > now - MINUTE_MS) minute++;
  }
  return { minute, hour };
}

/**
 * A read-only view of the queue for `gh outbox status`.
 * @returns {{path:string, repo:string|null, pending:number, blocked:number, done:number,
 *   halted:object|null, recovered:object|null, next_seq:number, writes:{minute:number,hour:number},
 *   queue:Array<object>}}
 *   `halted` is the stored halt, or a derived `{reason:'blocked'}` when the head of the queue is blocked.
 *   `recovered` names the newest `.corrupt-*` journal still on disk. It is never cleared automatically:
 *   delete that file once you have looked at it.
 */
function status(projectRoot, opts = {}) {
  const { now = Date.now() } = opts;
  const { journal, recovered } = readJournal(projectRoot, { ...opts, now });
  const count = (s) => journal.ops.filter((o) => o.status === s).length;
  const live = [...journal.ops].sort((a, b) => a.seq - b.seq).filter((o) => o.status !== 'done');
  const head = live[0];
  const halted = journal.halted || (head && head.status === 'blocked' ? blockedHalt(head) : null);
  return {
    path: journalPath(projectRoot, opts),
    repo: journal.repo,
    pending: count('pending'),
    blocked: count('blocked'),
    done: count('done'),
    halted,
    recovered: recovered || latestCorrupt(projectRoot, opts),
    next_seq: journal.next_seq,
    writes: countWrites(journal, now),
    queue: live.map((o) => ({
      seq: o.seq,
      kind: o.kind,
      target: o.target,
      status: o.status,
      attempts: o.attempts,
      last_error: o.last_error,
      retry_after: o.retry_after,
      queued_at: o.queued_at,
    })),
  };
}

// ─── single-flusher lock ──────────────────────────────────────────────────────

/** @returns {string} absolute path of this project's flush lock (outside the project). */
function lockPath(projectRoot, opts = {}) {
  return repoFile(projectRoot, '.lock', opts);
}

/**
 * The parsed owner of a lock file, or null when it is gone. A file that cannot be parsed (a flusher
 * caught between creating and writing it) is dated by its mtime, so it is neither instantly stale
 * nor immortal.
 */
function readLockOwner(file) {
  let raw;
  let mtimeMs;
  try {
    raw = fs.readFileSync(file, 'utf8');
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    const o = JSON.parse(raw);
    if (isPlainObject(o)) {
      const at = typeof o.at === 'number' ? o.at : Date.parse(o.at);
      if (Number.isFinite(at)) return { pid: o.pid === undefined ? null : o.pid, at, token: o.token || null };
    }
  } catch {
    // fall through to the mtime fallback
  }
  return { pid: null, at: mtimeMs, token: null };
}

/** Releases the lock only while the file still holds OUR pid and token; idempotent. */
function makeRelease(file, pid, token) {
  return function release() {
    try {
      const o = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (o && o.pid === pid && o.token === token) {
        fs.unlinkSync(file);
        return true;
      }
    } catch {
      // already gone, or not ours to read: nothing to release
    }
    return false;
  };
}

/**
 * Take the per-repo flush lock so one flusher runs at a time. The file is created with O_EXCL
 * (`wx`), holds `{pid, at, token}`, and is stale once `at` is more than `staleMs` (10 min) old.
 * A stale lock is moved aside (rename is atomic, so only one contender wins it) and replaced.
 *
 * @param {string} projectRoot
 * @param {{now?:number, staleMs?:number, pid?:number, env?:object, home?:string}} [opts]
 * @returns {{ok:true, release:function():boolean, stale_replaced:boolean}
 *   | {ok:false, running:true, owner:{pid:number|null, at:number|null}}}
 *   The caller of a `running` result exits 0 with "flush already running".
 */
function acquireLock(projectRoot, opts = {}) {
  const { now = Date.now(), staleMs = LOCK_STALE_MS, pid = process.pid } = opts;
  const file = lockPath(projectRoot, opts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = crypto.randomBytes(8).toString('hex');
  let staleReplaced = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      try {
        fs.writeSync(fd, JSON.stringify({ pid, at: now, token }));
      } finally {
        fs.closeSync(fd);
      }
      return { ok: true, stale_replaced: staleReplaced, release: makeRelease(file, pid, token) };
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
    }
    const owner = readLockOwner(file);
    if (!owner) continue; // released between our open and our read: try again
    if (now - owner.at <= staleMs) return { ok: false, running: true, owner: { pid: owner.pid, at: owner.at } };
    const aside = `${file}.stale-${pid}-${token}`;
    try {
      fs.renameSync(file, aside);
    } catch (e) {
      if (e && e.code === 'ENOENT') continue; // someone else took it over first
      throw e;
    }
    // Between our read and our rename another contender may have replaced the stale lock with a live
    // one, which we have just moved aside. If what we hold is not the lock we judged stale, put it back.
    const moved = readLockOwner(aside);
    if (moved && (moved.at !== owner.at || moved.token !== owner.token)) {
      try {
        fs.linkSync(aside, file);
      } catch {
        // someone already created a new lock; theirs stands
      }
      try { fs.unlinkSync(aside); } catch { /* best effort */ }
      return { ok: false, running: true, owner: { pid: moved.pid, at: moved.at } };
    }
    try { fs.unlinkSync(aside); } catch { /* best effort */ }
    staleReplaced = true;
  }
  const owner = readLockOwner(file);
  return { ok: false, running: true, owner: { pid: owner ? owner.pid : null, at: owner ? owner.at : null } };
}

// ─── cross-process write budget ───────────────────────────────────────────────

/**
 * The write budget GitHub's secondary limits need, kept in the journal so it holds across processes
 * (gh-client's per-run counter cannot see another session). Minute window: wait for the oldest write
 * to age out. Hour window: stop and resume later.
 * @param {{writes?:number[]}} journal
 * @param {number} [now]
 * @returns {{ok:true, minute:number, hour:number}
 *   | {ok:false, reason:'minute'|'hour', wait_ms:number, minute:number, hour:number}}
 *   `wait_ms` is how long until enough writes age out for one more to fit. The hour (the stop) wins
 *   when both windows are full.
 */
function budgetCheck(journal, now = Date.now()) {
  const inHour = (journal.writes || []).filter((w) => typeof w === 'number' && w > now - HOUR_MS).sort((a, b) => a - b);
  const inMinute = inHour.filter((w) => w > now - MINUTE_MS);
  const counts = { minute: inMinute.length, hour: inHour.length };
  if (inHour.length >= BUDGET.hour) {
    return { ok: false, reason: 'hour', wait_ms: inHour[inHour.length - BUDGET.hour] + HOUR_MS - now, ...counts };
  }
  if (inMinute.length >= BUDGET.minute) {
    return { ok: false, reason: 'minute', wait_ms: inMinute[inMinute.length - BUDGET.minute] + MINUTE_MS - now, ...counts };
  }
  return { ok: true, ...counts };
}

/**
 * Record one GitHub write at `at` (epoch ms) and drop writes older than an hour. Mutates and returns
 * `journal`; the caller persists it with writeJournal.
 */
function recordWrite(journal, at = Date.now()) {
  const kept = (Array.isArray(journal.writes) ? journal.writes : []).filter((w) => typeof w === 'number' && w > at - HOUR_MS);
  kept.push(at);
  journal.writes = kept.sort((a, b) => a - b);
  return journal;
}

// ─── base store: last known state of each issue, for remote-edit detection ────

const positiveInt = (v) => Number.isInteger(v) && v > 0;

function readMap(projectRoot, suffix, valid, opts) {
  const { now = Date.now() } = opts;
  return readJsonFile(repoFile(projectRoot, suffix, opts), valid, () => ({}), now).value;
}

function writeMap(projectRoot, suffix, map, opts) {
  atomicWrite(repoFile(projectRoot, suffix, opts), `${JSON.stringify(map, null, 2)}\n`);
}

/**
 * @returns {Object<string, {issue_number:number, issue_id:number, body_hash:string, updated_at:string|null,
 *   managed_hash?:string|null, frozen?:true}>} `{}` when missing
 */
function readBase(projectRoot, opts = {}) {
  return readMap(projectRoot, '.base.json', (v) => isPlainObject(v) && Object.values(v).every(isPlainObject), opts);
}

/** @returns {object|null} the base recorded for an AOForge id */
function getBase(projectRoot, id, opts = {}) {
  const all = readBase(projectRoot, opts);
  return Object.hasOwn(all, id) ? all[id] : null;
}

/** A base key is an AOForge id, or `<id>#<kind>` for a comment (kind as in a comment marker: `summary`, `spec-rev`). */
// The one other form (49-05) is `pr:<objective id>`: the last known body of an objective's pull request.
const BASE_KEY_RE = /^(?:[A-Za-z0-9][A-Za-z0-9._-]*(?:#[a-z][a-z-]*)?|pr:\d+(?:\.\d+)?)$/;

/**
 * Record the last known remote state of one issue (or, under an `<id>#<kind>` key, one comment): its
 * number AND database id (the sub-issue and dependency endpoints take the id; storing both avoids ever
 * sending one as the other), the hash of its body and its `updated_at`.
 *
 * Two optional fields serve the flusher's remote-edit check (47-07, D-24) and are stored only when given:
 * `managed_hash` (hash of the AOForge-managed section text, so a human edit outside the managed regions can
 * be told apart from one inside) and `frozen: true` (the TRD body must not be patched by a push). Nothing
 * else is kept.
 * @returns {{ok:true, base:object}|{ok:false, error:string}}
 */
function setBase(projectRoot, id, entry, opts = {}) {
  if (typeof id !== 'string' || !BASE_KEY_RE.test(id)) {
    return { ok: false, error: `id must be an AOForge id such as "47-01", or "<id>#<kind>" for a comment, got ${JSON.stringify(id)}` };
  }
  if (!isPlainObject(entry)) return { ok: false, error: 'base entry must be an object' };
  if (!positiveInt(entry.issue_number)) return { ok: false, error: 'issue_number must be a positive integer' };
  if (!positiveInt(entry.issue_id)) return { ok: false, error: 'issue_id must be a positive integer' };
  if (!isStr(entry.body_hash)) return { ok: false, error: 'body_hash must be a non-empty string' };
  const updatedAt = entry.updated_at === undefined ? null : entry.updated_at;
  if (updatedAt !== null && !isStr(updatedAt)) return { ok: false, error: 'updated_at must be a string or null' };
  if (entry.managed_hash !== undefined && entry.managed_hash !== null && !isStr(entry.managed_hash)) {
    return { ok: false, error: 'managed_hash must be a non-empty string or null' };
  }
  if (entry.frozen !== undefined && typeof entry.frozen !== 'boolean') return { ok: false, error: 'frozen must be a boolean' };
  const base = {
    issue_number: entry.issue_number, issue_id: entry.issue_id, body_hash: entry.body_hash, updated_at: updatedAt,
  };
  if (entry.managed_hash !== undefined) base.managed_hash = entry.managed_hash;
  if (entry.frozen === true) base.frozen = true;
  const all = readBase(projectRoot, opts);
  all[id] = base;
  writeMap(projectRoot, '.base.json', all, opts);
  return { ok: true, base };
}

// ─── cache index: hash of each materialised cache file, so 47-10 never overwrites a local edit ──

/** @returns {Object<string,string>} `{relPath: contentHash}`, `{}` when missing */
function readCacheIndex(projectRoot, opts = {}) {
  return readMap(projectRoot, '.cache.json', (v) => isPlainObject(v) && Object.values(v).every((x) => typeof x === 'string'), opts);
}

/**
 * Replace the whole index. Keys are paths relative to `.planning/` (no absolute paths, no `..`).
 * @returns {{ok:true}|{ok:false, error:string}}
 */
function writeCacheIndex(projectRoot, index, opts = {}) {
  if (!isPlainObject(index)) return { ok: false, error: 'cache index must be an object of {relPath: hash}' };
  const entries = Object.entries(index);
  const badKey = entries.find(([k]) => !safeRelPath(k));
  if (badKey) return { ok: false, error: `cache index key ${JSON.stringify(badKey[0])} is not a safe relative path` };
  const badValue = entries.find(([, v]) => !isStr(v));
  if (badValue) return { ok: false, error: `cache index hash for ${JSON.stringify(badValue[0])} must be a non-empty string` };
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  writeMap(projectRoot, '.cache.json', Object.fromEntries(entries), opts);
  return { ok: true };
}

module.exports = {
  OP_KINDS,
  ROLES,
  ENTITY_ROLES,
  ENTITY_ID_RE,
  MAX_DONE_OPS,
  BUDGET,
  LOCK_STALE_MS,
  validateOp,
  targetKey,
  opKey,
  stateDir,
  repoKey,
  journalPath,
  isEnabled,
  readJournal,
  writeJournal,
  enqueue,
  nextOp,
  markDone,
  markPending,
  markBlocked,
  setHalted,
  clearHalted,
  dropOp,
  status,
  lockPath,
  acquireLock,
  budgetCheck,
  recordWrite,
  readBase,
  getBase,
  setBase,
  readCacheIndex,
  writeCacheIndex,
};
