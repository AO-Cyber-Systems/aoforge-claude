'use strict';

// gh-rebrand.cjs (objective 72, TRD 72-16, INST-04) — `aof-tools gh rebrand [--repo <owner/name>] [--apply|--dry-run]`.
//
// A store-mode repository set up before the AOForge rename carries the legacy names on GitHub: labels in the legacy
// namespace, legacy hidden markers and wording in the issues, pull requests and comments AOForge manages, legacy names
// in the wiki, legacy required-check contexts (and the legacy ruleset name), and in its checkout the legacy managed
// caller workflow, a legacy docs-backend directory, the legacy pull request template block and legacy label values in
// config.json. 72-11 keeps all of that readable for one release; this verb renames it, one repository at a time, after
// a full preview.
//
//   snapshotRepo(client, repo)    GitHub reads only -> labels, issues (PRs included), comments, rulesets, wiki
//   snapshotLocal(root, opts)     local reads only  -> the legacy caller, PR template, docs backend, config.json
//   planRebrand(snapshot, local)  pure             -> { repo, ops, sections }, ops in the fixed apply order
//   renderPlan(plan)              pure             -> the dry-run text: sections, counts, line diffs
//   applyRebrand(plan, deps)      the one writer   -> every op in order; stops at the first failure
//
// An op is `{ section, kind, target, before, after, destructive, request? , ...where }`:
//   labels    rename (PATCH new_name, keeps every association) | merge-add (POST the AOForge label onto one issue) |
//             merge-delete (DELETE the legacy label, destructive; planned only after every merge-add for it)
//   issues    edit (PATCH title and/or body; issues and pull requests alike)
//   comments  edit (PATCH body)
//   wiki      page (write a page in a scratch clone; `rename_from` removes the old name) | push (one push, last)
//   rulesets  update (PUT the ruleset's writable fields with the AOForge name and contexts)
//   local     move (`git mv`) | write (a file in the working tree) | remove (`git rm`, destructive)
// `request` is `{ args, input? }`: the gh argv and the exact stdin, so the dry run shows what apply sends.
//
// What is rewritten:
//   - Only AOForge-managed bodies and comments: the first line is a marker in either namespace, or the text holds a
//     managed section. Marker namespaces become AOForge; inside a managed section the wording is rewritten with
//     legacy-rewrite.rewriteLegacyNames (PRESERVE tokens kept); outside one, only the legacy product name changes.
//   - Managed titles, wiki pages and the docs-backend pages get the wording rewrite.
//   - A reference to the repository itself is never rewritten, even when its name holds a legacy word.
//
// The order is fixed: labels, issues, comments, wiki, rulesets, local files. Apply stops at the first failed op and
// reports what was done and what is left; re-running re-reads GitHub and plans only what is still legacy, so it
// resumes, and a second run after a complete one has nothing to do. Local changes are left in the working tree with
// the commit steps printed (commit-steps.cjs); the verb never commits or pushes.
//
// GitHub writes go through gh-client.ghWrite (one retry-free policy: a secondary rate limit stops the run with the wait
// time instead of sleeping); wiki and local git work go through gh-wiki's git seam. This module spawns nothing itself.
// No legacy name is spelled here: every form comes from legacy-names.cjs.

const fs = require('fs');
const os = require('os');
const path = require('path');
const ghClient = require('./gh-client.cjs');
const wikiLib = require('./gh-wiki.cjs');
const setupLib = require('./gh-setup.cjs');
const bodyLib = require('./gh-body.cjs');
const trdLib = require('./gh-trd.cjs');
const outbox = require('./gh-outbox.cjs');
const planningMode = require('./planning-mode.cjs');
const helpers = require('./helpers.cjs');
const { parseWorkflowPins, WORKFLOW_PATH, DEFAULT_CHECKS_WORKFLOW } = require('./checks-pin.cjs');
const { branchCommitSteps, commitCommand } = require('./commit-steps.cjs');
const { rewriteLegacyNames, unifiedDiff } = require('./legacy-rewrite.cjs');
const { NAMES, LEGACY, PRESERVE } = require('./legacy-names.cjs');
const { escapeRegExp } = require('./text-escape.cjs');
const { planningRel, isLegacyPlanning } = require('./compat.cjs');

const EXIT = Object.freeze({ OK: 0, ERROR: 1 });
const SECTIONS = Object.freeze(['labels', 'issues', 'comments', 'wiki', 'rulesets', 'local']);
const SECTION_TITLES = Object.freeze({
  labels: 'Labels', issues: 'Issues', comments: 'Comments', wiki: 'Wiki', rulesets: 'Rulesets', local: 'Local files',
});

const REPO_SLUG = /^[^/\s]+\/[^/\s]+$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Names ───────────────────────────────────────────────────────────────────

const LEGACY_NS = `${LEGACY.markerNs}:`;
const NEW_NS = `${NAMES.markerNs}:`;
const NS_ALT = `(?:${escapeRegExp(NAMES.markerNs)}|${escapeRegExp(LEGACY.markerNs)})`;

/** A legacy-namespace HTML comment opener, `<!--` and its spacing kept (group 1). */
const LEGACY_MARKER_RE = new RegExp(`(<!--\\s*)${escapeRegExp(LEGACY.markerNs)}:`, 'g');
/** A first line that is a marker in either namespace. */
const MARKER_LINE_RE = new RegExp(`^\\s*<!--\\s*${NS_ALT}:`);
/** A managed section opener: `<!-- ns:begin NAME -->` or `<!-- ns:NAME:start -->` (the PR template block). */
const SECTION_OPEN_RE = new RegExp(`<!--\\s*(${NS_ALT}):(?:begin ([A-Za-z0-9_-]+)|([A-Za-z0-9_-]+):start)\\s*-->`, 'g');

/** The legacy product name in prose, both spellings, as a whole word. */
const PRODUCT_FORMS = [LEGACY.product, capitalise(LEGACY.slug)];
const PRODUCT_RE = new RegExp(`(?<![A-Za-z0-9_])(?:${PRODUCT_FORMS.map(escapeRegExp).join('|')})(?![A-Za-z0-9_])`, 'g');
const PRODUCT_ARTICLE_RE = new RegExp(
  `\\b([Aa]) (?=[\`*_"'(]{0,2}(?:${PRODUCT_FORMS.map(escapeRegExp).join('|')})(?![A-Za-z0-9_]))`, 'g');
const PRESERVE_RE = new RegExp(
  [...new Set(PRESERVE.map((t) => t.toLowerCase()))].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'gi');

// Placeholders: \u0001 never occurs in GitHub text, and legacy-rewrite uses \u0000 for its own.
const REPO_MARK_RE = /\u0001R(\d+)\u0001/g;
const KEEP_MARK_RE = /\u0001K(\d+)\u0001/g;

/** Mask every spelling of `tokens` (case-insensitive) as \u0001R<i>\u0001; returns [masked, restore]. */
function maskTokens(text, tokens) {
  const live = tokens.filter((t) => typeof t === 'string' && t !== '');
  if (live.length === 0) return [text, (s) => s];
  const re = new RegExp(live.sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'gi');
  const saved = [];
  const masked = text.replace(re, (m) => `\u0001R${saved.push(m) - 1}\u0001`);
  return [masked, (s) => s.replace(REPO_MARK_RE, (_, i) => saved[Number(i)])];
}

/** The rewrite context: the repository's own slug is never rewritten; the planning directory only when moved. */
function rewriteContext({ repo = null, planningDir = true } = {}) {
  const keep = typeof repo === 'string' && rewriteLegacyNames(repo) !== repo ? [repo] : [];
  return { keep, planningDir };
}

/** The wording rewrite (legacy-rewrite, PRESERVE kept), with the repository's own slug masked. */
function rewriteWording(text, ctx = rewriteContext()) {
  if (typeof text !== 'string' || text === '') return text;
  const [masked, restore] = maskTokens(text, ctx.keep);
  return restore(rewriteLegacyNames(masked, { planningDir: ctx.planningDir }));
}

/** Only the legacy product name (and the article before it); PRESERVE tokens and the repository slug kept. */
function rewriteProductNames(text, ctx = rewriteContext()) {
  if (typeof text !== 'string' || text === '') return text;
  const [masked, restore] = maskTokens(text, ctx.keep);
  const saved = [];
  let out = masked.replace(PRESERVE_RE, (m) => `\u0001K${saved.push(m) - 1}\u0001`);
  out = out.replace(PRODUCT_ARTICLE_RE, (_, a) => `${a}n `).replace(PRODUCT_RE, NAMES.product);
  return restore(out.replace(KEEP_MARK_RE, (_, i) => saved[Number(i)]));
}

/** Every legacy marker namespace in `text` spelled the AOForge way. */
function respellMarkers(text) {
  return text.replace(LEGACY_MARKER_RE, (_, open) => `${open}${NEW_NS}`);
}

/**
 * The managed sections of `text`, in order and non-overlapping: `{ innerStart, innerEnd }` (the text between the opener
 * and its closer). A pair never mixes namespaces; an opener with no closer is not a section.
 */
function findSections(text) {
  const out = [];
  const re = new RegExp(SECTION_OPEN_RE.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const ns = escapeRegExp(m[1]);
    const name = escapeRegExp(m[2] || m[3]);
    const close = m[2]
      ? new RegExp(`<!--\\s*${ns}:end ${name}\\s*-->`, 'g')
      : new RegExp(`<!--\\s*${ns}:${name}:end\\s*-->`, 'g');
    close.lastIndex = re.lastIndex;
    const c = close.exec(text);
    if (!c) continue;
    out.push({ innerStart: re.lastIndex, innerEnd: c.index });
    re.lastIndex = c.index + c[0].length;
  }
  return out;
}

/** True for a body or comment AOForge manages: a marker on its first line, or a managed section in it. */
function isManagedText(text) {
  if (typeof text !== 'string' || text === '') return false;
  return MARKER_LINE_RE.test(text.split('\n', 1)[0]) || findSections(text).length > 0;
}

/** A managed text rewritten: markers re-spelled, wording inside sections, product names outside. */
function rewriteManagedText(text, ctx = rewriteContext()) {
  const t = respellMarkers(text);
  let out = '';
  let at = 0;
  for (const s of findSections(t)) {
    out += rewriteProductNames(t.slice(at, s.innerStart), ctx);
    out += rewriteWording(t.slice(s.innerStart, s.innerEnd), ctx);
    at = s.innerEnd;
  }
  return out + rewriteProductNames(t.slice(at), ctx);
}

// ─── Requests ────────────────────────────────────────────────────────────────

/** `gh api -X <method> <endpoint> --input -` and the compact JSON stdin (as gh-setup builds its requests). */
function apiRequest(method, endpoint, payload) {
  if (payload === undefined) return { args: ['api', '-X', method, endpoint] };
  return { args: ['api', '-X', method, endpoint, '--input', '-'], input: JSON.stringify(payload) };
}

const labelPath = (repo, name) => `repos/${repo}/labels/${encodeURIComponent(name)}`;

// ─── Snapshot (reads only) ───────────────────────────────────────────────────

const labelNamesOf = (labels) => (Array.isArray(labels) ? labels : [])
  .map((l) => (typeof l === 'string' ? l : (l && l.name)))
  .filter((n) => typeof n === 'string');

function issueNumberOf(comment) {
  if (Number.isInteger(comment.issue_number)) return comment.issue_number;
  const m = /\/issues\/(\d+)$/.exec(String(comment.issue_url || ''));
  return m ? Number(m[1]) : null;
}

/** The HTTP status in a failed read, or null. */
function statusOf(r) {
  if (r && Number.isInteger(r.status) && r.status >= 100) return r.status;
  const m = /HTTP (\d{3})/.exec(`${(r && r.error) || ''}\n${(r && r.stderr) || ''}`);
  return m ? Number(m[1]) : null;
}

const errorOf = (r) => String((r && (r.error || r.stderr || r.stdout)) || 'gh api failed').trim().replace(/\s+/g, ' ');

/** The repository rulesets with their full documents; org rulesets are listed apart (the repo endpoint cannot PUT them). */
function readRulesets(c, repo) {
  const listed = c.list(`repos/${repo}/rulesets`);
  if (!listed.ok) {
    const status = statusOf(listed);
    return { ok: false, needs_admin: status === 403 || status === 404, error: errorOf(listed) };
  }
  const items = [];
  const elsewhere = [];
  for (const summary of listed.items) {
    if (!isObject(summary) || summary.id === undefined) continue;
    if (summary.source_type && summary.source_type !== 'Repository') {
      elsewhere.push({ id: summary.id, name: summary.name, source_type: summary.source_type });
      continue;
    }
    const full = c.get(`repos/${repo}/rulesets/${summary.id}`);
    if (!full.ok || !isObject(full.data)) return { ok: false, needs_admin: statusOf(full) === 403, error: errorOf(full) };
    items.push(full.data);
  }
  return { ok: true, items, elsewhere };
}

/**
 * Read one repository through the rebrand client: labels, every issue and pull request (`state=all`), every issue
 * comment, the rulesets and the wiki. Reads only. A failed label, issue or comment read fails the snapshot; rulesets and
 * the wiki degrade to a reported section.
 *
 * @returns {{ok:true, repo, labels, issues, comments, rulesets, wiki} | {ok:false, error:string, wait_ms?:number}}
 */
function snapshotRepo(c, repo) {
  if (!REPO_SLUG.test(String(repo))) return { ok: false, error: `not an owner/name repository: ${JSON.stringify(repo)}` };
  const read = (what, apiPath) => {
    const r = c.list(apiPath);
    if (r.ok) return { items: r.items };
    const out = { error: `could not read the ${what} of ${repo}: ${errorOf(r)}` };
    if (r.rate_limited) out.wait_ms = r.wait_ms;
    return out;
  };
  const labels = read('labels', `repos/${repo}/labels`);
  if (labels.error) return { ok: false, ...labels };
  const issues = read('issues', `repos/${repo}/issues?state=all`);
  if (issues.error) return { ok: false, ...issues };
  const comments = read('issue comments', `repos/${repo}/issues/comments`);
  if (comments.error) return { ok: false, ...comments };
  const wiki = c.readWiki(repo);

  return {
    ok: true,
    repo,
    labels: labels.items.filter((l) => isObject(l) && typeof l.name === 'string')
      .map((l) => ({ name: l.name, color: l.color || null, description: l.description || null })),
    issues: issues.items.filter((i) => isObject(i) && Number.isInteger(i.number)).map((i) => ({
      number: i.number,
      id: i.id,
      title: typeof i.title === 'string' ? i.title : '',
      body: typeof i.body === 'string' ? i.body : '',
      labels: labelNamesOf(i.labels),
      pr: isObject(i.pull_request),
      updated_at: i.updated_at || null,
    })),
    comments: comments.items.filter((cm) => isObject(cm) && cm.id !== undefined).map((cm) => ({
      id: cm.id,
      issue_number: issueNumberOf(cm),
      body: typeof cm.body === 'string' ? cm.body : '',
      updated_at: cm.updated_at || null,
    })),
    rulesets: readRulesets(c, repo),
    wiki: isObject(wiki) && wiki.ok !== false
      ? { state: wiki.state || 'ok', pages: Array.isArray(wiki.pages) ? wiki.pages : [], note: wiki.note || null }
      : { state: 'unavailable', pages: [], note: errorOf(wiki) },
  };
}

// ─── Local snapshot (reads only) ─────────────────────────────────────────────

const LEGACY_CALLER_PATH = `.github/workflows/${LEGACY.checksCaller}`;
const LEGACY_DOCS_DIR = `docs/${LEGACY.slug}`;
const NEW_DOCS_DIR = wikiLib.DOCS_DIR_REL;
const LEGACY_CHECKS_PATH_RE = new RegExp(`/${escapeRegExp(LEGACY.repo)}/\\.github/workflows/${escapeRegExp(LEGACY.checksWorkflow)}(?:@|$)`);

function readText(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf-8');
  } catch {
    return null;
  }
}

function listFiles(root, rel) {
  const out = [];
  const walk = (sub) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel, sub), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const child = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (e.isFile()) out.push(child);
    }
  };
  walk('');
  return out;
}

/**
 * The github block with the legacy names rewritten: every `labels.*` value in the legacy namespace moves to the AOForge
 * one (the 72-11 hand-off: a lookup uses a configured label as configured), and a `checks_workflow` naming the legacy
 * reusable workflow becomes AOForge's at the current release (the legacy file does not exist under the new name at an
 * old ref). `null` in, `null` out.
 */
function rewriteGithubConfig(github, version) {
  if (!isObject(github)) return github;
  const out = clone(github);
  if (isObject(out.labels)) {
    for (const [role, value] of Object.entries(out.labels)) {
      if (typeof value === 'string' && value.toLowerCase().startsWith(LEGACY_NS)) out.labels[role] = NEW_NS + value.slice(LEGACY_NS.length);
    }
  }
  if (typeof out.checks_workflow === 'string' && LEGACY_CHECKS_PATH_RE.test(out.checks_workflow)) {
    out.checks_workflow = `${DEFAULT_CHECKS_WORKFLOW}@v${String(version).replace(/^v/, '')}`;
  }
  return out;
}

/**
 * config.json text with only the rewritten github values changed: each changed string literal is replaced in place, so
 * the layout is kept. Falls back to a 2-space JSON rendering when an in-place replacement would not parse back to the
 * intended document.
 */
function rewriteConfigText(text, data, version) {
  if (!isObject(data) || !isObject(data.github)) return text;
  const github = rewriteGithubConfig(data.github, version);
  const want = { ...data, github };
  if (JSON.stringify(want) === JSON.stringify(data)) return text;
  let out = text;
  const pairs = [];
  for (const [role, value] of Object.entries(isObject(data.github.labels) ? data.github.labels : {})) {
    if (github.labels[role] !== value) pairs.push([value, github.labels[role]]);
  }
  if (github.checks_workflow !== data.github.checks_workflow) pairs.push([data.github.checks_workflow, github.checks_workflow]);
  for (const [from, to] of pairs) out = out.split(JSON.stringify(from)).join(JSON.stringify(to));
  try {
    if (JSON.stringify(JSON.parse(out)) === JSON.stringify(want)) return out;
  } catch { /* fall through */ }
  return `${JSON.stringify(want, null, 2)}\n`;
}

/**
 * What the checkout at `root` holds that the rebrand changes. Local reads only.
 * @param {string} root
 * @param {{version?:string}} [opts] the plugin version the new caller is pinned to (default: the installed plugin)
 */
function snapshotLocal(root, { version = helpers.pluginVersion() } = {}) {
  const configPath = planningRel(root, 'config.json');
  const configText = readText(root, configPath);
  let configData = null;
  try {
    configData = configText === null ? null : JSON.parse(configText);
  } catch {
    configData = null;
  }
  const github = configData && isObject(configData.github) ? configData.github : {};

  const legacyCaller = readText(root, LEGACY_CALLER_PATH);
  const newCaller = readText(root, WORKFLOW_PATH);
  const prTemplate = readText(root, setupLib.PR_TEMPLATE_PATH);
  const docsFiles = fs.existsSync(path.join(root, LEGACY_DOCS_DIR)) ? listFiles(root, LEGACY_DOCS_DIR) : null;

  return {
    root,
    version: String(version || '').replace(/^v/, ''),
    store: planningMode.isStoreMode(root),
    legacyPlanning: isLegacyPlanning(root),
    caller: legacyCaller === null ? null : { path: LEGACY_CALLER_PATH, text: legacyCaller, pins: parseWorkflowPins(legacyCaller) },
    newCaller: newCaller === null ? null : { path: WORKFLOW_PATH, text: newCaller },
    renderedCaller: legacyCaller === null || !version ? null
      : setupLib.renderTemplates(rewriteGithubConfig(github, version), version).workflow,
    prTemplate: prTemplate === null ? null : { path: setupLib.PR_TEMPLATE_PATH, text: prTemplate },
    docs: docsFiles === null ? null : {
      from: LEGACY_DOCS_DIR,
      to: NEW_DOCS_DIR,
      targetExists: fs.existsSync(path.join(root, NEW_DOCS_DIR)),
      files: docsFiles.map((rel) => ({ rel, text: readText(root, `${LEGACY_DOCS_DIR}/${rel}`) })).filter((f) => f.text !== null),
    },
    config: configText === null ? null : { path: configPath, text: configText, data: configData },
  };
}

// ─── Plan (pure) ─────────────────────────────────────────────────────────────

const section = (status = 'ok', note = null) => ({ status, note });

function planLabels(snap) {
  const ops = [];
  const have = new Map(snap.labels.map((l) => [l.name.toLowerCase(), l.name]));
  const base = (name) => labelPath(snap.repo, name);
  for (const label of snap.labels) {
    if (!label.name.toLowerCase().startsWith(LEGACY_NS)) continue;
    const to = NEW_NS + label.name.slice(LEGACY_NS.length);
    if (!have.has(to.toLowerCase())) {
      ops.push({
        section: 'labels', kind: 'rename', target: label.name, before: label.name, after: to, destructive: false,
        request: apiRequest('PATCH', base(label.name), { new_name: to }),
      });
      continue;
    }
    const existing = have.get(to.toLowerCase());
    const carriers = snap.issues.filter((i) => i.labels.some((n) => n.toLowerCase() === label.name.toLowerCase()));
    for (const issue of carriers) {
      if (issue.labels.some((n) => n.toLowerCase() === existing.toLowerCase())) continue;
      ops.push({
        section: 'labels', kind: 'merge-add', target: `#${issue.number}`, number: issue.number, merge: label.name,
        before: label.name, after: existing, destructive: false,
        request: apiRequest('POST', `repos/${snap.repo}/issues/${issue.number}/labels`, { labels: [existing] }),
      });
    }
    ops.push({
      section: 'labels', kind: 'merge-delete', target: label.name, merge: label.name, before: label.name, after: existing,
      destructive: true, issues: carriers.map((i) => i.number), request: apiRequest('DELETE', base(label.name)),
    });
  }
  return ops;
}

function planIssues(snap, ctx) {
  const ops = [];
  for (const issue of snap.issues) {
    if (!isManagedText(issue.body)) continue;
    const after = { title: rewriteWording(issue.title, ctx), body: rewriteManagedText(issue.body, ctx) };
    const payload = {};
    if (after.title !== issue.title) payload.title = after.title;
    if (after.body !== issue.body) payload.body = after.body;
    if (Object.keys(payload).length === 0) continue;
    ops.push({
      section: 'issues', kind: 'edit', target: `${issue.pr ? 'pull request' : 'issue'} #${issue.number}`, number: issue.number,
      pr: issue.pr, before: { title: issue.title, body: issue.body }, after, destructive: false,
      request: apiRequest('PATCH', `repos/${snap.repo}/issues/${issue.number}`, payload),
    });
  }
  return ops;
}

function planComments(snap, ctx) {
  const ops = [];
  for (const c of snap.comments) {
    if (!isManagedText(c.body)) continue;
    const after = rewriteManagedText(c.body, ctx);
    if (after === c.body) continue;
    ops.push({
      section: 'comments', kind: 'edit', target: `comment ${c.id} on #${c.issue_number}`, id: c.id, number: c.issue_number,
      before: c.body, after, destructive: false,
      request: apiRequest('PATCH', `repos/${snap.repo}/issues/comments/${c.id}`, { body: after }),
    });
  }
  return ops;
}

function planWiki(snap, ctx) {
  const wiki = snap.wiki || { state: 'unavailable', pages: [] };
  if (wiki.state !== 'ok') {
    return { ops: [], section: section('skipped', `the wiki is ${wiki.state}${wiki.note ? ` (${wiki.note})` : ''}; nothing to rename there`) };
  }
  const ops = [];
  const conflicts = [];
  const names = new Set(wiki.pages.map((p) => p.name));
  for (const page of wiki.pages) {
    const name = rewriteWording(page.name, ctx);
    const text = rewriteWording(page.text, ctx);
    const renamed = name !== page.name;
    if (!renamed && text === page.text) continue;
    if (renamed && (names.has(name) || !wikiLib.validPage(name))) {
      conflicts.push(`${page.name} -> ${name}`);
      continue;
    }
    const op = { section: 'wiki', kind: 'page', target: `page ${name}`, page: name, before: page.text, after: text, destructive: false };
    if (renamed) op.rename_from = page.name;
    ops.push(op);
  }
  if (ops.length > 0) ops.push({ section: 'wiki', kind: 'push', target: 'wiki', destructive: false });
  const note = conflicts.length > 0 ? `left alone, the new name is taken or not a page name: ${conflicts.join(', ')}` : null;
  return { ops, section: section(conflicts.length > 0 ? 'partial' : 'ok', note) };
}

const RULESET_FIELDS = ['name', 'target', 'enforcement', 'bypass_actors', 'conditions', 'rules'];

function contextsOf(doc) {
  const out = [];
  for (const rule of Array.isArray(doc.rules) ? doc.rules : []) {
    if (!rule || rule.type !== 'required_status_checks' || !isObject(rule.parameters)) continue;
    for (const check of Array.isArray(rule.parameters.required_status_checks) ? rule.parameters.required_status_checks : []) {
      if (check && typeof check.context === 'string') out.push(check.context);
    }
  }
  return out;
}

/** The writable ruleset document with legacy contexts switched (a context listed twice after the switch is kept once). */
function switchRuleset(doc, ctx) {
  const out = {};
  for (const key of RULESET_FIELDS) if (key in doc) out[key] = clone(doc[key]);
  if (typeof out.name === 'string') out.name = rewriteWording(out.name, ctx);
  for (const rule of Array.isArray(out.rules) ? out.rules : []) {
    if (!rule || rule.type !== 'required_status_checks' || !isObject(rule.parameters)) continue;
    const checks = Array.isArray(rule.parameters.required_status_checks) ? rule.parameters.required_status_checks : [];
    const seen = new Set();
    rule.parameters.required_status_checks = checks.map((check) => {
      if (!check || typeof check.context !== 'string' || !check.context.startsWith(LEGACY.checkContextNs)) return check;
      return { ...check, context: NAMES.checkContextNs + check.context.slice(LEGACY.checkContextNs.length) };
    }).filter((check) => {
      const key = check && typeof check.context === 'string' ? check.context : null;
      if (key === null) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return out;
}

function planRulesets(snap, ctx) {
  const rs = snap.rulesets || { ok: false, error: 'not read' };
  if (!rs.ok) {
    return rs.needs_admin
      ? { ops: [], section: section('needs admin', `the rulesets could not be read (${rs.error}); a repository admin must run the rebrand to switch the required contexts`) }
      : { ops: [], section: section('skipped', `the rulesets could not be read: ${rs.error}`) };
  }
  const ops = [];
  for (const doc of rs.items) {
    const after = switchRuleset(doc, ctx);
    const before = { name: doc.name, contexts: contextsOf(doc) };
    const now = { name: after.name, contexts: contextsOf(after) };
    if (JSON.stringify(before) === JSON.stringify(now)) continue;
    ops.push({
      section: 'rulesets', kind: 'update', target: `ruleset ${doc.id} (${doc.name})`, id: doc.id, before, after: now,
      destructive: false, request: apiRequest('PUT', `repos/${snap.repo}/rulesets/${doc.id}`, after),
    });
  }
  const elsewhere = Array.isArray(rs.elsewhere) ? rs.elsewhere : [];
  const note = elsewhere.length > 0
    ? `not edited from the repository: ${elsewhere.map((r) => `${r.source_type.toLowerCase()} ruleset ${r.id} (${r.name})`).join(', ')}`
    : null;
  return { ops, section: section('ok', note) };
}

function planLocal(local, ctx) {
  const ops = [];
  const notes = [];
  const write = (p, before, after) => ({ section: 'local', kind: 'write', target: p, path: p, before, after, destructive: false });

  if (local.caller) {
    if (!local.caller.pins.managed) {
      notes.push(`${local.caller.path} has no managed header, so it is not AOForge's to rename`);
    } else if (local.newCaller) {
      ops.push({ section: 'local', kind: 'remove', target: local.caller.path, path: local.caller.path, before: local.caller.text,
        after: null, destructive: true, note: `${WORKFLOW_PATH} already exists; the legacy caller beside it is removed` });
    } else if (local.renderedCaller) {
      ops.push({ section: 'local', kind: 'move', target: `${local.caller.path} -> ${WORKFLOW_PATH}`, from: local.caller.path,
        to: WORKFLOW_PATH, destructive: false });
      ops.push(write(WORKFLOW_PATH, local.caller.text, local.renderedCaller));
      if (local.caller.text.includes(`${LEGACY.upper}_APP_`)) {
        notes.push(`the new caller reads the GitHub App from ${NAMES.upper}_APP_CLIENT_ID (variable) and ${NAMES.upper}_APP_PRIVATE_KEY `
          + '(secret); if this repository set the legacy-named pair, add the new names before merging (a secret cannot be '
          + "copied through the API). Without them the checks run on the workflow's own token");
      }
    }
  }

  if (local.prTemplate && isManagedText(local.prTemplate.text)) {
    const after = rewriteManagedText(local.prTemplate.text, ctx);
    if (after !== local.prTemplate.text) ops.push(write(local.prTemplate.path, local.prTemplate.text, after));
  }

  if (local.docs) {
    if (local.docs.targetExists) {
      notes.push(`${local.docs.from}/ was not moved: ${local.docs.to}/ already exists; merge the two by hand`);
    } else {
      ops.push({ section: 'local', kind: 'move', target: `${local.docs.from} -> ${local.docs.to}`, from: local.docs.from,
        to: local.docs.to, destructive: false });
      for (const file of local.docs.files) {
        const rel = rewriteWording(file.rel, ctx);
        const text = rewriteWording(file.text, ctx);
        if (rel !== file.rel) {
          ops.push({ section: 'local', kind: 'move', target: `${local.docs.to}/${file.rel} -> ${local.docs.to}/${rel}`,
            from: `${local.docs.to}/${file.rel}`, to: `${local.docs.to}/${rel}`, destructive: false });
        }
        if (text !== file.text) ops.push(write(`${local.docs.to}/${rel}`, file.text, text));
      }
    }
  }

  if (local.config && local.config.data) {
    const after = rewriteConfigText(local.config.text, local.config.data, local.version);
    if (after !== local.config.text) ops.push(write(local.config.path, local.config.text, after));
  }
  return { ops, section: section('ok', notes.length > 0 ? notes.join('; ') : null) };
}

/**
 * The rebrand plan for one repository: `{ repo, ops, sections, store }`. `ops` is in the fixed apply order; `sections`
 * holds each section's status (`ok`, `partial`, `skipped`, `needs admin`) and note. `local` null skips the Local files
 * section (the command runs outside a checkout of the repository). Pure.
 */
function planRebrand(snapshot, local = null) {
  if (!snapshot || snapshot.ok === false) throw new TypeError('planRebrand needs the snapshot from snapshotRepo');
  const ctx = rewriteContext({ repo: snapshot.repo, planningDir: !(local && local.legacyPlanning) });
  const wiki = planWiki(snapshot, ctx);
  const rulesets = planRulesets(snapshot, ctx);
  const localPlan = local
    ? planLocal(local, ctx)
    : { ops: [], section: section('skipped', `this is not a checkout of ${snapshot.repo}; run the rebrand there to rename its local files`) };
  const ops = [
    ...planLabels(snapshot),
    ...planIssues(snapshot, ctx),
    ...planComments(snapshot, ctx),
    ...wiki.ops,
    ...rulesets.ops,
    ...localPlan.ops,
  ];
  return {
    repo: snapshot.repo,
    store: Boolean(local && local.store),
    ops,
    sections: {
      labels: section(), issues: section(), comments: section(),
      wiki: wiki.section, rulesets: rulesets.section, local: localPlan.section,
    },
  };
}

// ─── Render (pure) ───────────────────────────────────────────────────────────

const diffOf = (before, after, label) => unifiedDiff(String(before || ''), String(after || ''), { fromFile: `${label} (now)`, toFile: `${label} (after)`, context: 1 });

function rulesetText(state) {
  return [`name: ${state.name}`, ...state.contexts.map((c) => `required: ${c}`)].join('\n');
}

function renderLabels(ops) {
  const lines = [];
  const merges = new Map();
  for (const op of ops) {
    if (op.kind === 'rename') lines.push(`  rename ${op.before} -> ${op.after}`);
    else {
      if (!merges.has(op.merge)) {
        merges.set(op.merge, lines.length);
        lines.push(null);
      }
      if (op.kind === 'merge-add') lines.push(`    add ${op.after} to #${op.number}`);
      else lines.push(`    delete ${op.before}`);
    }
  }
  for (const [legacy, at] of merges) {
    const del = ops.find((o) => o.kind === 'merge-delete' && o.merge === legacy);
    const adds = ops.filter((o) => o.kind === 'merge-add' && o.merge === legacy).length;
    lines[at] = `  merge ${legacy} -> ${del.after} [destructive: ${adds} issue${adds === 1 ? ' gets' : 's get'} ${del.after} first, then ${legacy} is deleted]`;
  }
  return lines;
}

function renderOp(op) {
  switch (op.section) {
    case 'issues': {
      const fields = ['title', 'body'].filter((f) => op.after[f] !== op.before[f]);
      const lines = [`  edit ${op.target} (${fields.join(', ')})`];
      if (fields.includes('title')) lines.push(`    title: ${JSON.stringify(op.before.title)} -> ${JSON.stringify(op.after.title)}`);
      if (fields.includes('body')) lines.push(diffOf(op.before.body, op.after.body, `#${op.number} body`));
      return lines;
    }
    case 'comments':
      return [`  edit ${op.target}`, diffOf(op.before, op.after, `comment ${op.id}`)];
    case 'wiki':
      if (op.kind === 'push') return ['  push the wiki (one commit)'];
      return [
        op.rename_from ? `  rename page ${op.rename_from} -> ${op.page}` : `  edit page ${op.page}`,
        ...(op.after !== op.before ? [diffOf(op.before, op.after, op.page)] : []),
      ];
    case 'rulesets':
      return [`  update ${op.target}`, diffOf(rulesetText(op.before), rulesetText(op.after), `ruleset ${op.id}`)];
    case 'local':
      if (op.kind === 'move') return [`  move ${op.from} -> ${op.to}`];
      if (op.kind === 'remove') return [`  remove ${op.path} [destructive: ${op.note}]`];
      return [`  write ${op.path}`, diffOf(op.before, op.after, op.path)];
    default:
      return [`  ${op.kind} ${op.target}`];
  }
}

/** The dry-run text of a plan: one block per section with its count, line diffs for every text change. Pure. */
function renderPlan(plan) {
  const lines = [`AOForge rebrand for ${plan.repo}`];
  for (const name of SECTIONS) {
    const ops = plan.ops.filter((o) => o.section === name);
    const s = plan.sections[name] || section();
    const title = SECTION_TITLES[name];
    lines.push('');
    if (s.status === 'skipped' || s.status === 'needs admin') {
      lines.push(`${title} (${s.status}): ${s.note}`);
      continue;
    }
    lines.push(`${title} (${ops.length})`);
    if (ops.length === 0) lines.push('  nothing to change');
    else if (name === 'labels') lines.push(...renderLabels(ops));
    else for (const op of ops) lines.push(...renderOp(op));
    if (s.note) lines.push(`  note: ${s.note}`);
  }
  return `${lines.join('\n')}\n`;
}

// ─── Apply ───────────────────────────────────────────────────────────────────

const REBRAND_BRANCH = 'aoforge-rebrand';
const REBRAND_COMMIT_MESSAGE = 'chore: rebrand the AOForge workflow, docs and config';

/** The repository-relative paths the local ops touch, in op order, each once (a path inside a listed directory is not repeated). */
function localFiles(ops) {
  const out = [];
  const add = (p) => { if (p && !out.some((q) => q === p || p.startsWith(`${q}/`))) out.push(p); };
  for (const op of ops) {
    if (op.section !== 'local') continue;
    if (op.kind === 'move') {
      add(op.from);
      add(op.to);
    } else add(op.path);
  }
  return out;
}

/** The printed follow-up for the local changes: commit-steps' branch sequence, the store form in store mode. */
function commitSteps(files, store) {
  return branchCommitSteps({
    branch: REBRAND_BRANCH,
    command: commitCommand(REBRAND_COMMIT_MESSAGE, files),
    reason: store ? 'gh rebrand' : null,
  });
}

// ─── The real client (gh-client + gh-wiki) ───────────────────────────────────

function failure(r) {
  const limited = ghClient.isSecondaryLimit(r);
  const out = { ok: false, error: errorOf(r), status: statusOf(r) };
  if (limited) {
    out.rate_limited = true;
    out.wait_ms = ghClient.retryDelayMs(r, 0);
  }
  return out;
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return undefined;
  }
}

/**
 * The rebrand client over GitHub: list (paginated reads), get (one read), readWiki (a scratch clone, removed again) and
 * write (gh-client.ghWrite with the op's own request; wiki pages into a scratch clone, pushed by the push op). `root` is
 * the checkout whose configured wiki remote is used when it is a checkout of the repository being rebranded.
 */
function ghRebrandClient({ root = null } = {}) {
  let scratch = null;
  let remote = null;

  const remoteFor = (repo) => {
    if (root && String(ghClient.resolveRepo(root) || '').toLowerCase() === repo.toLowerCase()) {
      const configured = wikiLib.resolveWikiRemote(root);
      if (configured) return configured;
    }
    return `https://github.com/${repo}.wiki.git`;
  };
  const dropScratch = () => {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    scratch = null;
  };
  const openScratch = () => {
    if (scratch) return { ok: true };
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-rebrand-wiki-'));
    const cloned = wikiLib.ensureClone(scratch, { remote });
    if (!cloned.ok) {
      const error = cloned.error;
      dropScratch();
      return { ok: false, error };
    }
    return { ok: true };
  };

  return {
    list(apiPath) {
      const r = ghClient.ghPaginate(apiPath);
      return r.ok ? r : failure(r);
    },
    get(apiPath) {
      const r = ghClient.ghRead(['api', apiPath]);
      if (!r.ok) return failure(r);
      const data = parseJson(r.stdout);
      return data === undefined ? { ok: false, error: `unparseable answer from gh for ${apiPath}` } : { ok: true, data };
    },
    readWiki(repo) {
      const meta = this.get(`repos/${repo}`);
      if (meta.ok && isObject(meta.data) && meta.data.has_wiki === false) return { ok: true, state: 'disabled', pages: [] };
      remote = remoteFor(repo);
      const probe = wikiLib.probeRemote(remote);
      if (probe.state !== 'ok') return { ok: true, state: probe.state, pages: [], note: probe.error || null };
      const opened = openScratch();
      if (!opened.ok) return { ok: true, state: 'unavailable', pages: [], note: opened.error };
      try {
        const pages = wikiLib.listPages(scratch).map((name) => ({ name, text: wikiLib.readPage(scratch, name) }))
          .filter((p) => typeof p.text === 'string');
        return { ok: true, state: 'ok', pages };
      } finally {
        dropScratch();
      }
    },
    write(op) {
      if (op.section === 'wiki') {
        const opened = openScratch();
        if (!opened.ok) return { ok: false, error: opened.error };
        if (op.kind === 'push') {
          const pushed = wikiLib.push(scratch, { remote, message: 'aoforge: rebrand wiki pages' });
          dropScratch();
          return pushed.ok ? { ok: true, data: { sha: pushed.sha || null } } : { ok: false, error: pushed.error };
        }
        if (op.rename_from) fs.rmSync(path.join(scratch, planningRel(scratch, 'wiki'), `${op.rename_from}.md`), { force: true });
        const w = wikiLib.writePage(scratch, op.page, op.after);
        return w.ok ? { ok: true } : { ok: false, error: w.error };
      }
      if (!op.request) return { ok: false, error: `op ${op.kind} carries no request` };
      const r = ghClient.ghWrite(op.request.args, op.request.input === undefined ? undefined : { input: op.request.input });
      if (!r.ok) return failure(r);
      const data = parseJson(r.stdout);
      return { ok: true, data: data === undefined ? null : data };
    },
  };
}

// ─── The command ─────────────────────────────────────────────────────────────

const REBRAND_USAGE = [
  'Usage: aof-tools gh rebrand [--repo <owner/name>] [--apply|--dry-run] [--raw]',
  "  Preview, then rename one repository's pre-rename GitHub artefacts to AOForge: labels in the legacy namespace (renamed,",
  '  or merged into an existing AOForge label), the markers and wording of the issues, pull requests and comments AOForge',
  '  manages (other text only where it names the legacy product), wiki pages, the required-check contexts of the',
  "  repository's rulesets, and in this checkout the managed caller workflow, the docs-backend directory, the pull request",
  '  template block and config.json label values.',
  '  The default is a dry run that prints every change with a line diff and writes nothing. --apply makes them in a fixed',
  '  order (labels, issues, comments, wiki, rulesets, local files), stops at the first failure with what was done and what',
  '  is left, and is safe to re-run: it re-reads GitHub and finishes only what is left. Local changes stay in the working',
  '  tree with the commit steps printed; nothing is committed or pushed.',
  '  --repo defaults to github.repo; local files are changed only in a checkout of that repository.',
  'Exit codes: 0 a dry run, a finished apply or nothing to do; 1 a usage error, a failed read or a failed operation.',
].join('\n');

const result = (code, payload, prose) => ({ code, payload, prose: prose.endsWith('\n') ? prose : `${prose}\n` });
const failed = (message, extra = {}) => result(EXIT.ERROR, { ok: false, error: message, ...extra }, message);

function emit(res, raw) {
  if (raw) process.stdout.write(`${JSON.stringify(res.payload, null, 2)}\n`);
  else if (res.code === EXIT.ERROR) process.stderr.write(res.prose);
  else process.stdout.write(res.prose);
  if (res.code !== EXIT.OK) process.exit(res.code);
}

/** @returns {{apply:boolean, repo:string|null}|{error:string}} */
function parseArgs(args) {
  const out = { apply: false, dryRun: false, repo: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--raw') continue;
    else if (a === '--repo' || a.startsWith('--repo=')) {
      const v = a === '--repo' ? args[++i] : a.slice('--repo='.length);
      if (typeof v !== 'string' || !REPO_SLUG.test(v)) return { error: `--repo needs an owner/name repository, got ${JSON.stringify(v === undefined ? '' : v)}` };
      out.repo = v;
    } else return { error: `Unknown gh rebrand argument: ${a}` };
  }
  if (out.apply && out.dryRun) return { error: '--apply and --dry-run cannot be used together: the dry run is the default' };
  return out;
}

const payloadOps = (ops) => ops.map((op) => {
  const { request, ...rest } = op;
  return request ? { ...rest, request: { args: request.args, input: request.input } } : rest;
});

function sectionCounts(ops) {
  return SECTIONS.map((s) => `${ops.filter((o) => o.section === s).length} ${SECTION_TITLES[s].toLowerCase()}`).join(', ');
}

function dryRun(plan) {
  const payload = { ok: true, apply: false, repo: plan.repo, ops: payloadOps(plan.ops), sections: plan.sections };
  if (plan.ops.length === 0) {
    return result(EXIT.OK, payload, `${renderPlan(plan)}\nNothing to rebrand: ${plan.repo} has no pre-rename names left.`);
  }
  const lines = [renderPlan(plan).trimEnd(), '',
    `Dry run for ${plan.repo}: nothing was changed. ${plan.ops.length} operation${plan.ops.length === 1 ? '' : 's'} (${sectionCounts(plan.ops)}).`,
    `Run \`aof-tools gh rebrand --apply\` to apply them.`];
  const files = localFiles(plan.ops);
  if (files.length > 0) {
    payload.files = files;
    payload.steps = commitSteps(files, plan.store);
    lines.push('', `After --apply: ${files.join(', ')} change in the working tree, not committed. Commit them through a pull request:`, payload.steps);
  }
  return result(EXIT.OK, payload, lines.join('\n'));
}

/**
 * `gh rebrand [--repo o/r] [--apply|--dry-run]` as `{ code, payload, prose }`. `deps` (tests): `client` (the rebrand
 * client; default ghRebrandClient), `version` (the caller pin), `runGit`, `env`.
 */
function runRebrand(cwd, args, deps = {}) {
  if (args.includes('--help') || args[0] === 'help') return result(EXIT.OK, { ok: true, usage: REBRAND_USAGE }, REBRAND_USAGE);
  const parsed = parseArgs(args);
  if (parsed.error) return failed(`${parsed.error}\n${REBRAND_USAGE}`, { usage: true });

  let repo = parsed.repo;
  if (!repo) {
    const gate = ghClient.requireEnabled(cwd);
    if (gate.skipped) return result(EXIT.OK, { ok: false, skipped: true, reason: gate.reason }, `${gate.reason} (or pass --repo owner/name)`);
    repo = gate.repo;
  }
  const configured = ghClient.resolveRepo(cwd);
  const isCheckout = typeof configured === 'string' && configured.toLowerCase() === repo.toLowerCase();
  const c = deps.client || ghRebrandClient({ root: isCheckout ? cwd : null });

  return ghClient.withRetryPolicy({ maxRetries: 0 }, () => {
    const snap = snapshotRepo(c, repo);
    if (!snap.ok) {
      const wait = snap.wait_ms ? ` GitHub's secondary rate limit: wait ${Math.ceil(snap.wait_ms / 1000)} s and run it again.` : '';
      return failed(`${snap.error}${wait}`, snap.wait_ms ? { wait_ms: snap.wait_ms } : {});
    }
    const local = isCheckout ? snapshotLocal(cwd, deps.version ? { version: deps.version } : undefined) : null;
    const plan = planRebrand(snap, local);
    if (!parsed.apply) return dryRun(plan);
    return failed('gh rebrand --apply is not wired yet (TRD 72-16 Task 3)');
  });
}

function cmdGhRebrand(cwd, args, raw) {
  emit(runRebrand(cwd, args), raw);
}

module.exports = {
  REBRAND_USAGE,
  SECTIONS,
  isManagedText,
  rewriteManagedText,
  snapshotRepo,
  snapshotLocal,
  planRebrand,
  renderPlan,
  ghRebrandClient,
  runRebrand,
  cmdGhRebrand,
};
