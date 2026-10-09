'use strict';

/**
 * legacy-rebrand-fixtures.cjs (objective 72, TRD 72-16) — one store-mode repository as the old plugin left it, for
 * `aof-tools gh rebrand`.
 *
 *   legacyRepoSnapshot({ withAoforgeLabels: ['trd'] })   // what GitHub answers for repository o/r (REST shapes)
 *   stubClient(snapshot, { failAt, rulesetsStatus })    // a rebrand client over that state; records every write
 *   localRepo({ store: true })                         // a git checkout of o/r: legacy caller, docs/<legacy>/, config
 *
 * legacyRepoSnapshot returns `{ repo, labels, issues, comments, rulesets, wiki }`:
 *   labels    REST labels: the five legacy-namespace labels, `bug`, and `aoforge:<kind>` for each kind in
 *             `withAoforgeLabels` (that label then already exists, so the rebrand merges instead of renaming).
 *   issues    REST issues, `state=all` order (ascending number), each with `labels: [{ name }]`:
 *               #1 an objective issue: legacy id line, legacy summary and footer sections (the footer is the legacy
 *                  tracking line), then text a person typed that names the legacy product and `devflowops`;
 *                  title "DevFlow doctor"
 *               #2 a TRD issue (legacy id and file lines, then the TRD text)
 *               #3 a todo issue (legacy entity body)
 *               #4 an unmanaged issue a person opened about the legacy product (no marker: never touched)
 *               #5 the objective pull request (legacy PR marker, legacy sections; `pull_request` set)
 *   comments  REST issue comments (`issue_url`, not `issue_number`): a legacy state comment on #1, a two-part legacy
 *             summary comment on #2, a human comment on #1 that names the legacy product (unmanaged), and the legacy
 *             reconcile comment on #5
 *   rulesets  `{ list, full }`: the repository rulesets list (summaries, as `GET .../rulesets` answers, including one
 *             organization ruleset) and the full document of each repository ruleset by id. Ruleset 42 is the old
 *             `gh setup` ruleset: its name and two required contexts are in the legacy namespace, a third is not.
 *   wiki      `{ state: 'ok', pages: [{ name, text }] }`: `Home` names the legacy product, `DevFlow-Guide` has it in
 *             its name, `Objective-46-doctor` has neither.
 *
 * stubClient(snapshot, opts) implements the rebrand client interface over a private copy of the snapshot:
 *   list(apiPath)  -> { ok, items } for labels, issues, issue comments and rulesets; with `rulesetsStatus: 403` the
 *                     rulesets list fails like a token without admin rights
 *   get(apiPath)   -> { ok, data } for one full ruleset
 *   readWiki(repo) -> { ok: true, state, pages }
 *   write(op)      -> applies `op.request` (gh api argv + JSON stdin) or a wiki op to the copy, records it in
 *                     `writes`, and answers `{ ok: true, data }`. `failAt(op, counts)` (counts = writes per section so
 *                     far, this one included) returning true fails that write with HTTP 502; returning an object fails
 *                     it with that object. A failed write changes nothing.
 *   writes         [{ section, kind, method, endpoint, input, page }] in the order they were sent
 *   state          the copy, as it stands after the writes (a later list/get/readWiki reads it)
 *
 * localRepo({ store }) builds a hermetic git checkout (tracked-repo.cjs) holding `.aoforge/config.json` (github.enabled,
 * github.repo o/r, `store`, and the five labels configured in the legacy namespace, as the old config template wrote
 * them), the legacy managed caller workflow pinned to v2.12.0 (legacy-gh-fixtures.legacyCaller), the legacy managed
 * pull request template, and `docs/<legacy>/Project.md`. It returns tracked-repo's handle plus `status()` (the
 * porcelain status) and `runGit(args, opts)` (git in the repository's hermetic environment).
 *
 * Legacy names are spelled here on purpose: this is one of the `__fixtures__/legacy-*` files the rename guard allows.
 * Every value is a hand-written literal; nothing is produced by the code under test.
 */

const { legacyCaller, legacyPrTemplate } = require('./legacy-gh-fixtures.cjs');
const { makeTrackedRepo } = require('./tracked-repo.cjs');

const OLD = 'devflow';
const NEW = 'aoforge';
const REPO = 'o/r';
const API = `https://api.github.com/repos/${REPO}`;

const clone = (v) => JSON.parse(JSON.stringify(v));

/** The legacy tracking line the old buildObjectiveSections wrote into the footer section (mirror mode). */
function legacyTrackingLine(dir = '46-doctor') {
  return `_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). Source of truth: \`.planning/objectives/${dir}/\` in this repo._`;
}

/** What a person typed under the managed sections of issue #1: it names the legacy product and a preserved product. */
const ISSUE_HUMAN_TEXT = 'Notes a person typed: we ran a DevFlow sweep last week.\nThe devflowops dashboard stays as it is; see /devflow:status.\n';

const LEGACY_LABELS = [
  { id: 701, name: 'devflow:objective', color: '1d76db', description: 'DevFlow tracking' },
  { id: 702, name: 'devflow:trd', color: '1d76db', description: 'DevFlow tracking' },
  { id: 703, name: 'devflow:todo', color: '1d76db', description: 'DevFlow tracking' },
  { id: 704, name: 'devflow:in-progress', color: '1d76db', description: 'DevFlow tracking' },
  { id: 705, name: 'devflow:decision', color: '1d76db', description: 'DevFlow tracking' },
  { id: 706, name: 'bug', color: 'd73a4a', description: "Something isn't working" },
];

const ISSUE_1_BODY = [
  '<!-- devflow:id=46 -->',
  '<!-- devflow:begin summary -->',
  '**Objective 46: DevFlow doctor**',
  '',
  'A doctor for DevFlow projects. It reads the devflowops fleet list.',
  '<!-- devflow:end summary -->',
  '',
  '<!-- devflow:begin footer -->',
  legacyTrackingLine('46-doctor'),
  '<!-- devflow:end footer -->',
  '',
  ISSUE_HUMAN_TEXT,
].join('\n');

const ISSUE_2_BODY = [
  '<!-- devflow:id=46-01 -->',
  '<!-- devflow:file=46-01-doctor-checks-TRD.md -->',
  '# TRD 46-01 doctor checks',
  '',
  'Teach the DevFlow doctor two checks. Run df-tools doctor afterwards.',
  '',
].join('\n');

const ISSUE_3_BODY = [
  '<!-- devflow:id=todo-2026-07-31-a -->',
  '<!-- devflow:file=todos/pending/2026-07-31-a.md -->',
  '# Document the DevFlow doctor',
  '',
].join('\n');

const ISSUE_5_BODY = [
  '<!-- devflow:pr=46 -->',
  '<!-- devflow:begin closes -->',
  'Closes #1',
  'Closes #2',
  '<!-- devflow:end closes -->',
  '',
  '<!-- devflow:begin summary -->',
  'TRDs complete 1/1. Built with DevFlow.',
  '<!-- devflow:end summary -->',
  '',
].join('\n');

function legacyIssues() {
  return [
    {
      id: 5001, number: 1, title: 'DevFlow doctor', body: ISSUE_1_BODY, state: 'open',
      labels: [{ name: 'devflow:objective' }], updated_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 5002, number: 2, title: '[46-01] doctor checks', body: ISSUE_2_BODY, state: 'open',
      labels: [{ name: 'devflow:trd' }], updated_at: '2026-10-01T10:01:00Z',
    },
    {
      id: 5003, number: 3, title: 'Document the DevFlow doctor', body: ISSUE_3_BODY, state: 'open',
      labels: [{ name: 'devflow:todo' }], updated_at: '2026-10-01T10:02:00Z',
    },
    {
      id: 5004, number: 4, title: 'DevFlow is slow on big repos', body: 'I think DevFlow is slow here.\n', state: 'open',
      labels: [{ name: 'bug' }], updated_at: '2026-10-01T10:03:00Z',
    },
    {
      id: 5005, number: 5, title: 'Objective 46: DevFlow doctor', body: ISSUE_5_BODY, state: 'open',
      labels: [], updated_at: '2026-10-01T10:04:00Z',
      pull_request: { url: `${API}/pulls/5` },
    },
  ];
}

function legacyComments() {
  return [
    {
      id: 9100, issue_url: `${API}/issues/1`, updated_at: '2026-10-01T11:00:00Z',
      body: '<!-- devflow:id=46 kind=state -->\n**State**: DevFlow wave 1 of 2, last commit none',
    },
    {
      id: 9101, issue_url: `${API}/issues/2`, updated_at: '2026-10-01T11:01:00Z',
      body: '<!-- devflow:id=46-01 kind=summary -->\n<!-- devflow:part=1/2 -->\n<!-- devflow:file=46-01-SUMMARY.md -->\n# 46-01 summary\n',
    },
    {
      id: 9102, issue_url: `${API}/issues/2`, updated_at: '2026-10-01T11:02:00Z',
      body: '<!-- devflow:id=46-01 kind=summary -->\n<!-- devflow:part=2/2 -->\nThe DevFlow doctor has two checks.\n',
    },
    {
      id: 9200, issue_url: `${API}/issues/1`, updated_at: '2026-10-01T11:03:00Z',
      body: 'Thanks, DevFlow works for me now.',
    },
    {
      id: 9300, issue_url: `${API}/issues/5`, updated_at: '2026-10-01T11:04:00Z',
      body: '<!-- devflow:reconcile -->\nClosed after the merge (they were still open):\n\n- #3\n',
    },
  ];
}

const RULESET_42 = {
  id: 42,
  name: 'devflow: default branch',
  target: 'branch',
  source_type: 'Repository',
  source: REPO,
  enforcement: 'active',
  node_id: 'RRS_lACqUmVwb3NpdG9yec5',
  created_at: '2026-06-01T09:00:00Z',
  updated_at: '2026-06-01T09:00:00Z',
  current_user_can_bypass: 'always',
  _links: { self: { href: `${API}/rulesets/42` } },
  bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [
          { context: 'devflow/linked-issue' },
          { context: 'devflow/planning-consistency' },
          { context: 'ci/build' },
        ],
      },
    },
  ],
};

const RULESET_LIST = [
  { id: 42, name: 'devflow: default branch', target: 'branch', source_type: 'Repository', source: REPO, enforcement: 'active' },
  { id: 77, name: 'org baseline', target: 'branch', source_type: 'Organization', source: 'o', enforcement: 'active' },
];

const WIKI_PAGES = [
  { name: 'Home', text: '# DevFlow planning\n\nThese pages are written by DevFlow. The devflowops wiki is separate.\n' },
  { name: 'DevFlow-Guide', text: 'Run /devflow:plan-objective, then df-tools commit.\n' },
  { name: 'Objective-46-doctor', text: '# Objective 46\n\nNothing to rename on this page.\n' },
];

/** The repository o/r as GitHub answers for it before the rebrand. See the header. */
function legacyRepoSnapshot({ withAoforgeLabels = [] } = {}) {
  const labels = clone(LEGACY_LABELS);
  withAoforgeLabels.forEach((kind, i) => {
    labels.push({ id: 801 + i, name: `${NEW}:${kind}`, color: '1d76db', description: 'AOForge tracking' });
  });
  return {
    repo: REPO,
    labels,
    issues: legacyIssues(),
    comments: legacyComments(),
    rulesets: { list: clone(RULESET_LIST), full: { 42: clone(RULESET_42) } },
    wiki: { state: 'ok', pages: clone(WIKI_PAGES) },
  };
}

// ─── stub client ────────────────────────────────────────────────────────────────

const SECTION_OF = { label: 'labels', issue: 'issues', comment: 'comments', ruleset: 'rulesets' };

/** The rebrand client over a private copy of `snapshot`. See the header. */
function stubClient(snapshot, { failAt = null, rulesetsStatus = null } = {}) {
  const state = clone(snapshot);
  const writes = [];
  const counts = {};
  const staged = new Map();
  let tick = 0;
  const stamp = () => {
    tick += 1;
    return `2026-10-08T12:00:${String(tick).padStart(2, '0')}Z`;
  };
  const base = `repos/${state.repo}`;
  const lc = (s) => String(s).toLowerCase();
  const findLabel = (name) => state.labels.find((l) => lc(l.name) === lc(name));
  const findIssue = (n) => state.issues.find((i) => i.number === n);

  function list(apiPath) {
    if (apiPath === `${base}/labels`) return { ok: true, items: clone(state.labels) };
    if (apiPath === `${base}/issues?state=all`) return { ok: true, items: clone(state.issues) };
    if (apiPath === `${base}/issues/comments`) return { ok: true, items: clone(state.comments) };
    if (apiPath === `${base}/rulesets`) {
      if (rulesetsStatus) return { ok: false, status: rulesetsStatus, error: `gh: Resource not accessible by integration (HTTP ${rulesetsStatus})` };
      return { ok: true, items: clone(state.rulesets.list) };
    }
    return { ok: false, status: 404, error: `stub: no list for ${apiPath} (HTTP 404)` };
  }

  function get(apiPath) {
    const m = new RegExp(`^${base}/rulesets/(\\d+)$`).exec(apiPath);
    if (m && state.rulesets.full[m[1]]) return { ok: true, data: clone(state.rulesets.full[m[1]]) };
    return { ok: false, status: 404, error: `stub: no document for ${apiPath} (HTTP 404)` };
  }

  function readWiki() {
    return { ok: true, state: state.wiki.state, pages: clone(state.wiki.pages || []) };
  }

  function sectionOf(op) {
    return op.section || SECTION_OF[op.kind] || 'other';
  }

  function applyRequest(method, endpoint, input) {
    let m;
    if ((m = new RegExp(`^${base}/labels/([^/]+)$`).exec(endpoint))) {
      const name = decodeURIComponent(m[1]);
      const label = findLabel(name);
      if (!label) return { ok: false, status: 404, error: `label ${name} not found (HTTP 404)` };
      if (method === 'PATCH') {
        const to = input.new_name;
        for (const issue of state.issues) {
          for (const l of issue.labels) if (lc(l.name) === lc(name)) l.name = to;
        }
        label.name = to;
        return { ok: true, data: clone(label) };
      }
      if (method === 'DELETE') {
        state.labels = state.labels.filter((l) => l !== label);
        for (const issue of state.issues) issue.labels = issue.labels.filter((l) => lc(l.name) !== lc(name));
        return { ok: true, data: null };
      }
    }
    if ((m = new RegExp(`^${base}/issues/(\\d+)/labels$`).exec(endpoint)) && method === 'POST') {
      const issue = findIssue(Number(m[1]));
      if (!issue) return { ok: false, status: 404, error: 'issue not found (HTTP 404)' };
      for (const name of input.labels) {
        if (!findLabel(name)) state.labels.push({ id: 900 + state.labels.length, name, color: 'ededed', description: '' });
        if (!issue.labels.some((l) => lc(l.name) === lc(name))) issue.labels.push({ name });
      }
      return { ok: true, data: clone(issue.labels) };
    }
    if ((m = new RegExp(`^${base}/issues/comments/(\\d+)$`).exec(endpoint)) && method === 'PATCH') {
      const comment = state.comments.find((c) => c.id === Number(m[1]));
      if (!comment) return { ok: false, status: 404, error: 'comment not found (HTTP 404)' };
      comment.body = input.body;
      comment.updated_at = stamp();
      return { ok: true, data: clone(comment) };
    }
    if ((m = new RegExp(`^${base}/issues/(\\d+)$`).exec(endpoint)) && method === 'PATCH') {
      const issue = findIssue(Number(m[1]));
      if (!issue) return { ok: false, status: 404, error: 'issue not found (HTTP 404)' };
      if (typeof input.title === 'string') issue.title = input.title;
      if (typeof input.body === 'string') issue.body = input.body;
      issue.updated_at = stamp();
      return { ok: true, data: clone(issue) };
    }
    if ((m = new RegExp(`^${base}/rulesets/(\\d+)$`).exec(endpoint)) && method === 'PUT') {
      const doc = state.rulesets.full[m[1]];
      if (!doc) return { ok: false, status: 404, error: 'ruleset not found (HTTP 404)' };
      Object.assign(doc, clone(input), { updated_at: stamp() });
      const summary = state.rulesets.list.find((r) => String(r.id) === m[1]);
      if (summary && typeof input.name === 'string') summary.name = input.name;
      return { ok: true, data: clone(doc) };
    }
    return { ok: false, status: 404, error: `stub: unhandled ${method} ${endpoint} (HTTP 404)` };
  }

  function applyWiki(op) {
    if (op.kind === 'wiki-push') {
      const pages = new Map(state.wiki.pages.map((p) => [p.name, p.text]));
      for (const [name, text] of staged) {
        if (text === null) pages.delete(name);
        else pages.set(name, text);
      }
      staged.clear();
      state.wiki.pages = [...pages.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, text]) => ({ name, text }));
      return { ok: true, data: { pushed: true } };
    }
    if (op.rename_from) staged.set(op.rename_from, null);
    staged.set(op.page, op.after);
    return { ok: true, data: { staged: op.page } };
  }

  function write(op) {
    const section = sectionOf(op);
    counts[section] = (counts[section] || 0) + 1;
    const request = op.request || null;
    const method = request ? request.args[2] : null;
    const endpoint = request ? request.args[3] : null;
    const input = request && typeof request.input === 'string' ? JSON.parse(request.input) : null;
    const record = { section, kind: op.kind, method, endpoint, input, page: op.page || null };
    if (typeof failAt === 'function') {
      const verdict = failAt(op, { ...counts });
      if (verdict) {
        writes.push({ ...record, failed: true });
        return verdict === true ? { ok: false, status: 502, error: 'gh: Bad Gateway (HTTP 502)' } : { ok: false, ...verdict };
      }
    }
    writes.push(record);
    if (section === 'wiki') return applyWiki(op);
    if (!request) return { ok: false, error: `stub: op ${op.kind} carries no request` };
    return applyRequest(method, endpoint, input);
  }

  return { list, get, readWiki, write, writes, state };
}

// ─── local checkout ─────────────────────────────────────────────────────────────

const LEGACY_PIN = 'v2.12.0';

/** The github block the old config template wrote, labels in the legacy namespace. */
function legacyGithubConfig({ store = true } = {}) {
  return {
    enabled: true,
    repo: REPO,
    store,
    labels: {
      objective: 'devflow:objective',
      in_progress: 'devflow:in-progress',
      gaps: 'devflow:gaps',
      trd: 'devflow:trd',
      decision: 'devflow:decision',
    },
  };
}

const DOCS_PROJECT = '# Project\n\nPlanned with DevFlow. Pages live in docs/devflow/.\n';

/** A hermetic git checkout of o/r with the legacy local files. See the header. */
function localRepo({ store = true } = {}) {
  const config = `${JSON.stringify({ mode: 'yolo', github: legacyGithubConfig({ store }) }, null, 2)}\n`;
  const repo = makeTrackedRepo({
    files: {
      '.aoforge/config.json': config,
      [`.github/workflows/${OLD}.yml`]: legacyCaller({ sha: LEGACY_PIN }),
      '.github/pull_request_template.md': legacyPrTemplate(),
      [`docs/${OLD}/Project.md`]: DOCS_PROJECT,
      'README.md': '# r\n',
    },
  });
  const runGit = (args, opts = {}) => {
    const r = repo.run(args, { cwd: opts.cwd || repo.root });
    return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  const status = () => repo.git(['status', '--porcelain']);
  return { ...repo, config, runGit, status };
}

module.exports = {
  REPO,
  LEGACY_PIN,
  ISSUE_HUMAN_TEXT,
  DOCS_PROJECT,
  legacyTrackingLine,
  legacyGithubConfig,
  legacyRepoSnapshot,
  stubClient,
  localRepo,
};
