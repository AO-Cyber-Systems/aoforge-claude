'use strict';

// adopt.cjs — the deterministic routing/refusal front-door for /devflow:adopt
// (objective 37, TRD 05, ADP-03).
//
// Pure/IO split, same shape as repo-state.cjs: `decideRoute(facts)` is pure and
// total; `gitFacts()`/`readMarker()`/`writeMarker()`/`resumeSteps()`/`preflight()`/
// `begin()` do the IO and compose into `decideRoute`.
//
// `userHome` is injected — this module never calls `os.homedir()`. Only
// adopt-cli.cjs may do that (Runtime model, OBJECTIVE.md).
//
// Git access is exclusively `execFileSync('git', ['-C', root, ...], {env})` —
// never a shell string, never `stash`/`reset --hard` (adopt never destroys
// anything; refusals leave the tree untouched).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { detectRepoState } = require('./repo-state.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { safeReadFile } = require('./helpers.cjs');
const { VALID_KINDS, VALID_WORKS } = require('./intent.cjs');
const managedBlock = require('./managed-block.cjs');
const stackProfile = require('./stack-profile.cjs');
const { loadClaudeMdTemplate } = require('./migrations/0005-claude-md-block.cjs');
const upgrade = require('./upgrade.cjs');
const backupPrune = require('./backup-prune.cjs');

const ADOPT_BRANCH = 'devflow/adopt';
const MARKER_NAME = 'devflow-adopt.json';
const OWNED_PATHS = ['.planning', 'CLAUDE.md'];

const CODEBASE_DOC_NAMES = [
  'STACK', 'INTEGRATIONS', 'ARCHITECTURE', 'STRUCTURE',
  'CONVENTIONS', 'TESTING', 'PATTERNS', 'CONCERNS',
];

// Busy-state markers, re-declared verbatim from upgrade-project.js's gitState()
// rather than required, to avoid coupling a hook to a df-tools lib module.
const BUSY_MARKERS = [
  ['rebase-merge', 'rebase'], ['rebase-apply', 'rebase'], ['MERGE_HEAD', 'merge'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'], ['REVERT_HEAD', 'revert'], ['BISECT_LOG', 'bisect'],
];

const EMPTY_GIT_FACTS = Object.freeze({
  is_repo: false, toplevel: null, branch: null, head_sha: null,
  detached: false, unborn: false, busy: null, dirty: [],
  branch_exists: false, roadmap_tracked: false,
});

// ─── git plumbing ───────────────────────────────────────────────────────────

function git(root, env, args) {
  try {
    const out = execFileSync('git', ['-C', root, ...args], {
      env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e && typeof e.stdout === 'string') ? e.stdout : '' };
  }
}

function realpathSafe(p) {
  try { return fs.realpathSync(p); } catch { return p; }
}

function parsePorcelainZ(out) {
  const parts = out.split('\0');
  const dirty = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry || entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    dirty.push(entry.slice(3));
    if (/[RC]/.test(xy) && i + 1 < parts.length) dirty.push(parts[++i]);
  }
  return dirty;
}

function isOwnedPath(rel) {
  return rel === 'CLAUDE.md' || rel === '.planning' || rel.startsWith('.planning/');
}

/**
 * gitFacts(root, { env }) -> { is_repo, toplevel, branch, head_sha, detached,
 *   unborn, busy, dirty, branch_exists, roadmap_tracked }
 *
 * IO-only. Returns EMPTY_GIT_FACTS (is_repo:false, everything else null/false)
 * when `root` is not inside a git work tree.
 */
function gitFacts(root, { env = process.env } = {}) {
  const repoCheck = git(root, env, ['rev-parse', '--is-inside-work-tree']);
  const is_repo = repoCheck.ok && repoCheck.out.trim() === 'true';
  if (!is_repo) return { ...EMPTY_GIT_FACTS };

  const toplevelRes = git(root, env, ['rev-parse', '--show-toplevel']);
  const toplevel = toplevelRes.ok ? toplevelRes.out.trim() : null;

  const headRes = git(root, env, ['rev-parse', '-q', '--verify', 'HEAD']);
  const unborn = !headRes.ok;
  const head_sha = headRes.ok ? headRes.out.trim() : null;

  const symRes = git(root, env, ['symbolic-ref', '-q', '--short', 'HEAD']);
  const branch = symRes.ok ? symRes.out.trim() : null;
  const detached = !symRes.ok && !unborn;

  let busy = null;
  for (const [name, op] of BUSY_MARKERS) {
    const gp = git(root, env, ['rev-parse', '--git-path', name]);
    if (gp.ok && fs.existsSync(path.resolve(root, gp.out.trim()))) {
      busy = op;
      break;
    }
  }

  const statusRes = git(root, env, ['status', '--porcelain=v1', '--untracked-files=all', '-z']);
  const dirty = statusRes.ok ? parsePorcelainZ(statusRes.out) : [];

  const branchExistsRes = git(root, env, ['show-ref', '--verify', '--quiet', `refs/heads/${ADOPT_BRANCH}`]);
  const branch_exists = branchExistsRes.ok;

  const roadmapRes = git(root, env, ['ls-files', '--error-unmatch', '.planning/ROADMAP.md']);
  const roadmap_tracked = roadmapRes.ok;

  return { is_repo, toplevel, branch, head_sha, detached, unborn, busy, dirty, branch_exists, roadmap_tracked };
}

// ─── marker (out-of-tree, at the git-dir path) ─────────────────────────────

function markerPath(root, env) {
  const r = git(root, env, ['rev-parse', '--git-path', MARKER_NAME]);
  if (!r.ok) return null;
  return path.resolve(root, r.out.trim());
}

/**
 * readMarker(root, env) -> { marker: object|null, warning: string|null }
 *
 * A bad/unparseable marker is treated as "no marker" plus a warning — it is
 * never deleted (adopt never destroys anything it did not create this call).
 */
function readMarker(root, env) {
  const p = markerPath(root, env);
  if (!p || !fs.existsSync(p)) return { marker: null, warning: null };
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { marker: data, warning: null };
  } catch (e) {
    return { marker: null, warning: `unreadable adopt marker at ${p}: ${e.message}` };
  }
}

function writeMarker(root, env, marker) {
  const p = markerPath(root, env);
  if (!p) throw new Error('writeMarker: could not resolve the marker path (not a git repo?)');
  fs.writeFileSync(p, JSON.stringify(marker, null, 2) + '\n', 'utf-8');
  return p;
}

// ─── resume progress (mix of disk-state and marker-stored state) ──────────

function resumeSteps(root, marker) {
  const mapped = CODEBASE_DOC_NAMES.every((name) => {
    try {
      return fs.statSync(path.join(root, '.planning', 'codebase', `${name}.md`)).size > 0;
    } catch {
      return false;
    }
  });

  let project_md = false;
  const pmTxt = safeReadFile(path.join(root, '.planning', 'PROJECT.md'));
  if (pmTxt) {
    const fm = extractFrontmatter(pmTxt);
    project_md = VALID_KINDS.includes(fm.kind);
  }

  const scaffolded = !!(marker && marker.steps && marker.steps.scaffolded === true);
  const reported = fs.existsSync(path.join(root, '.planning', 'ADOPT-REPORT.md'));

  return { mapped, project_md, scaffolded, reported };
}

function nextForResume(steps) {
  const order = ['mapped', 'project_md', 'scaffolded', 'reported'];
  const first = order.find((k) => !steps[k]);
  return first ? `resume: '${first}' step not done yet` : 'resume: all steps done, ready to commit';
}

// ─── decideRoute(facts) — pure, total ──────────────────────────────────────
//
// facts: { target, isDirectory, git: {is_repo, toplevel, isTopLevel, branch,
//   head_sha, detached, unborn, busy, dirty}, state, marker, branchExists,
//   roadmapTracked }
//
// Rule order (must_haves):
//   1. not a directory -> refuse not-a-directory
//   2. not a git repo -> refuse not-a-git-repo
//   3. not the repo root -> refuse not-repo-root
//   4. a rebase/merge/etc in progress -> refuse operation-in-progress
//   5. detached HEAD -> refuse detached-head
//   6. an in-progress adopt marker -> resume, or refuse
//      adopt-in-progress-elsewhere / dirty-tree (owned paths exempt)
//   7. dirty tree (tracked or untracked), no marker -> refuse dirty-tree
//   8. .planning/ present -> upgrade
//   9. greenfield (no code, no manifest) -> new-project
//   10. no commits yet -> refuse no-commits
//   11. devflow/adopt branch already exists, no marker -> refuse adopt-branch-exists
//   12. otherwise -> adopt
function decideRoute(facts) {
  const { isDirectory, git: g, state, marker, branchExists, roadmapTracked, target } = facts;

  if (!isDirectory) {
    return {
      route: 'refuse', reason: 'not-a-directory',
      message: `${target} is not a directory`,
      next: `${target} is not a directory; point /devflow:adopt at a real directory`,
    };
  }

  if (!g.is_repo) {
    return {
      route: 'refuse', reason: 'not-a-git-repo',
      message: `${target} is not a git repository`,
      next: 'run git init yourself first, then re-run /devflow:adopt',
    };
  }

  if (!g.isTopLevel) {
    return {
      route: 'refuse', reason: 'not-repo-root',
      message: `${target} is not the repository top level (${g.toplevel}); adopt targets the repo root, not a subdirectory`,
      next: `re-run /devflow:adopt from ${g.toplevel}`,
    };
  }

  if (g.busy) {
    return {
      route: 'refuse', reason: 'operation-in-progress',
      message: `a git ${g.busy} is in progress`,
      next: `finish or abort the ${g.busy}, then re-run /devflow:adopt`,
    };
  }

  if (g.detached) {
    return {
      route: 'refuse', reason: 'detached-head',
      message: 'HEAD is detached',
      next: 'check out a branch yourself, then re-run /devflow:adopt',
    };
  }

  const activeMarker = (marker && !roadmapTracked) ? marker : null;
  if (activeMarker && activeMarker.status === 'in_progress') {
    if (g.branch !== activeMarker.branch) {
      return {
        route: 'refuse', reason: 'adopt-in-progress-elsewhere',
        message: `an adopt is in progress on branch '${activeMarker.branch}' but the current branch is '${g.branch || '(detached)'}'`,
        next: `switch to '${activeMarker.branch}' to resume, or delete the marker to abandon it`,
      };
    }
    const offending = g.dirty.filter((p) => !isOwnedPath(p));
    if (offending.length) {
      return {
        route: 'refuse', reason: 'dirty-tree',
        message: `the working tree has uncommitted changes: ${offending.join(', ')}`,
        next: 'commit or revert them yourself, then re-run /devflow:adopt (adopt never stashes)',
      };
    }
    return {
      route: 'resume', reason: null,
      message: `resuming adopt on branch '${activeMarker.branch}'`,
      next: null,
    };
  }

  if (g.dirty.length) {
    return {
      route: 'refuse', reason: 'dirty-tree',
      message: `the working tree has uncommitted changes: ${g.dirty.join(', ')}`,
      next: 'commit or stash them yourself, then re-run /devflow:adopt (adopt never stashes)',
    };
  }

  if (state === 'devflow') {
    return {
      route: 'upgrade', reason: null,
      message: 'already a DevFlow project',
      next: 'df-tools --cwd <target> upgrade --check',
    };
  }

  if (state === 'greenfield') {
    return {
      route: 'new-project', reason: null,
      message: 'no source code yet',
      next: '/devflow:new-project (this repo has no source code yet)',
    };
  }

  if (g.unborn) {
    return {
      route: 'refuse', reason: 'no-commits',
      message: 'the repository has no commits yet',
      next: 'make an initial commit yourself, then re-run /devflow:adopt',
    };
  }

  if (branchExists) {
    return {
      route: 'refuse', reason: 'adopt-branch-exists',
      message: `branch '${ADOPT_BRANCH}' already exists with no in-progress marker`,
      next: `delete the stale '${ADOPT_BRANCH}' branch yourself, then re-run /devflow:adopt`,
    };
  }

  return {
    route: 'adopt', reason: null,
    message: `ready to adopt (${state})`,
    next: 'df-tools --cwd <target> adopt begin',
  };
}

// ─── preflight(root, opts) — IO, read-only ─────────────────────────────────

function preflight(root, opts = {}) {
  const { userHome = null, env = process.env } = opts;
  const target = path.resolve(root);

  let isDirectory = false;
  try { isDirectory = fs.statSync(target).isDirectory(); } catch { /* leave false */ }

  const warnings = [];
  const gf = isDirectory ? gitFacts(target, { env }) : { ...EMPTY_GIT_FACTS };
  const isTopLevel = gf.is_repo && !!gf.toplevel && realpathSafe(target) === realpathSafe(gf.toplevel);

  const repoState = isDirectory
    ? detectRepoState(target, { userHome })
    : { state: null, signals: null, derived: null };

  let marker = null;
  if (isDirectory && gf.is_repo) {
    const read = readMarker(target, env);
    marker = read.marker;
    if (read.warning) warnings.push(read.warning);
  }

  const facts = {
    target,
    isDirectory,
    git: { ...gf, isTopLevel },
    state: repoState.state,
    marker,
    branchExists: gf.branch_exists,
    roadmapTracked: gf.roadmap_tracked,
  };

  const decision = decideRoute(facts);
  const steps = decision.route === 'resume' ? resumeSteps(target, marker) : null;
  const next = decision.next != null ? decision.next : (decision.route === 'resume' ? nextForResume(steps) : null);

  const report = {
    route: decision.route,
    reason: decision.reason,
    message: decision.message,
    target,
    repo_state: { state: repoState.state, signals: repoState.signals },
    git: {
      is_repo: gf.is_repo,
      toplevel: gf.toplevel,
      branch: gf.branch,
      head_sha: gf.head_sha,
      detached: gf.detached,
      unborn: gf.unborn,
      busy: gf.busy,
      dirty: gf.dirty,
    },
    adopt: {
      branch: ADOPT_BRANCH,
      branch_exists: gf.branch_exists,
      marker,
      steps,
    },
    next,
  };
  if (warnings.length) report.warnings = warnings;
  return report;
}

// ─── begin(root, opts) — creates the branch + marker, exactly once ────────

function begin(root, opts = {}) {
  const { env = process.env, pluginVersion = '0.0.0' } = opts;
  const pf = preflight(root, opts);

  if (pf.route !== 'adopt') {
    return { ...pf, created_branch: false };
  }

  const target = pf.target;
  let sw = git(target, env, ['switch', '-c', ADOPT_BRANCH]);
  if (!sw.ok) sw = git(target, env, ['checkout', '-b', ADOPT_BRANCH]);

  const marker = {
    version: 1,
    status: 'in_progress',
    branch: ADOPT_BRANCH,
    base_branch: pf.git.branch,
    base_sha: pf.git.head_sha,
    started_at: new Date().toISOString(),
    plugin_version: pluginVersion,
    steps: {},
  };
  writeMarker(target, env, marker);

  return {
    ...pf,
    git: { ...pf.git, branch: ADOPT_BRANCH },
    adopt: { ...pf.adopt, branch_exists: true, marker, steps: null },
    created_branch: true,
  };
}

// ─── scaffold(root, opts) — deterministic post-mapping scaffold, resumable ─
//
// After begin() + LLM mapping (PROJECT.md + codebase docs), scaffold() produces everything else a
// DevFlow project needs: STATE.md, an objective-less ROADMAP.md, STACK.md (via stack-profile),
// the CLAUDE.md managed block, config.json + state.json + version stamp (via upgrade.apply, TRD
// 36-04), and pruner registration (backup-prune.register, TRD 37-03). Every check runs before the
// first write; the marker is updated last so a mid-scaffold interruption resumes cleanly.

const CLAUDE_MD_REL = 'CLAUDE.md';

function stripFrontmatter(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

function extractHeading(body) {
  const m = /^#[ \t]+(.+?)[ \t]*$/m.exec(body);
  return m ? m[1].trim() : null;
}

function extractCoreValue(body) {
  const idx = body.indexOf('## Core Value');
  if (idx === -1) return null;
  const after = body.slice(idx + '## Core Value'.length);
  const nextHeading = after.search(/\n##[ \t]/);
  const section = nextHeading === -1 ? after : after.slice(0, nextHeading);
  const line = section.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  return line || null;
}

/**
 * readProjectMd(root) -> { ok: true, name, coreValue, kind, default_work } | { ok: false, error }
 *
 * Never modifies PROJECT.md. `error` names the exact problem (missing file, or an invalid `kind` /
 * `default_work` — each error lists the valid values) so the caller can refuse with a precise
 * message before writing anything.
 */
function readProjectMd(root) {
  const p = path.join(root, '.planning', 'PROJECT.md');
  const text = safeReadFile(p);
  if (text === null) {
    return { ok: false, error: `.planning/PROJECT.md is missing` };
  }
  const fm = extractFrontmatter(text);
  if (!fm.kind || !VALID_KINDS.includes(fm.kind)) {
    return {
      ok: false,
      error: `.planning/PROJECT.md frontmatter 'kind' must be one of ${VALID_KINDS.join(', ')} (got ${JSON.stringify(fm.kind || null)})`,
    };
  }
  if (!fm.default_work || !VALID_WORKS.includes(fm.default_work)) {
    return {
      ok: false,
      error: `.planning/PROJECT.md frontmatter 'default_work' must be one of ${VALID_WORKS.join(', ')} (got ${JSON.stringify(fm.default_work || null)})`,
    };
  }
  const body = stripFrontmatter(text);
  const name = extractHeading(body) || path.basename(path.resolve(root));
  const coreValue = extractCoreValue(body) || '(see PROJECT.md)';
  return { ok: true, name, coreValue, kind: fm.kind, default_work: fm.default_work };
}

/**
 * renderState({name, coreValue, date, version}) -> STATE.md text (pure).
 * `name` is accepted for interface symmetry with renderRoadmap but does not appear in STATE.md.
 */
function renderState({ coreValue, date, version }) {
  return (
    '# Project State\n\n' +
    '## Project Reference\n\n' +
    'See: .planning/PROJECT.md\n\n' +
    `**Core value:** ${coreValue}\n` +
    '**Current focus:** No objectives yet — add one with /devflow:objective add\n\n' +
    '## Current Position\n\n' +
    '**Current Objective:** None\n' +
    '**Status:** Adopted — no objectives planned\n' +
    `**Last Activity:** ${date} — adopted by /devflow:adopt (DevFlow v${version})\n\n` +
    '## Blockers\n\n' +
    'None.\n\n' +
    '## Session Log\n\n' +
    `- ${date}: Adopted by /devflow:adopt (DevFlow v${version}); see .planning/ADOPT-REPORT.md\n`
  );
}

/** renderRoadmap({name, date}) -> ROADMAP.md text (pure). Zero objectives, by design. */
function renderRoadmap({ name, date }) {
  return (
    `# Roadmap: ${name}\n\n` +
    '## Milestones\n\n' +
    `- **v0.1 — Adopted** (${date}, current): no objectives yet.\n\n` +
    '## Objectives\n\n' +
    'None yet. Add one with `/devflow:objective add`.\n\n' +
    '## Progress\n\n' +
    '| Objective | Milestone | Plans | Status | Completed |\n' +
    '|---|---|---|---|---|\n'
  );
}

/** Deterministic CLAUDE.md block content, only ever used when no block exists yet. */
function renderClaudeMdOverview(tpl) {
  return (
    '# Project Overview\n\n' +
    'See `.planning/PROJECT.md` (what this is, core value) and `.planning/codebase/` (how it is built).\n' +
    'Adopted by `/devflow:adopt`; review `.planning/ADOPT-REPORT.md`.\n\n' +
    tpl.rules
  );
}

function isoDate(now) {
  return now.toISOString().slice(0, 10);
}

/**
 * scaffold(root, opts) -> preflight-shaped report (route !== 'resume') | scaffold result
 *
 * Runs only from the resume state (an in-progress adopt marker on ADOPT_BRANCH); anywhere else it
 * returns the preflight report untouched and writes nothing (the CLI maps that to exit 3). Every
 * validation (PROJECT.md, CLAUDE.md block well-formedness) runs before the first write. Never
 * overwrites an existing STATE.md/ROADMAP.md/STACK.md/PROJECT.md; never forces stack init.
 */
function scaffold(root, opts = {}) {
  const { env = process.env, userHome = null, pluginVersion = '0.0.0', now = new Date() } = opts;
  const pf = preflight(root, opts);

  if (pf.route !== 'resume') {
    return { ...pf, created: [], skipped: [] };
  }

  const target = pf.target;
  const date = isoDate(now);

  // ── Pre-checks (no writes before all pass) ──────────────────────────────
  const pm = readProjectMd(target);
  if (!pm.ok) {
    throw new Error(pm.error);
  }

  const claudePath = path.join(target, CLAUDE_MD_REL);
  const claudeText = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf-8') : '';
  let claudeBlock;
  try {
    claudeBlock = managedBlock.read(claudeText);
  } catch (e) {
    throw new Error(`CLAUDE.md: ${e.message}`);
  }

  const tpl = loadClaudeMdTemplate();

  // ── Writes (create-if-missing only) ─────────────────────────────────────
  const created = [];
  const skipped = [];

  const statePath = path.join(target, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, renderState({ name: pm.name, coreValue: pm.coreValue, date, version: pluginVersion }), 'utf-8');
    created.push('.planning/STATE.md');
  } else {
    skipped.push('.planning/STATE.md');
  }

  const roadmapPath = path.join(target, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    fs.mkdirSync(path.dirname(roadmapPath), { recursive: true });
    fs.writeFileSync(roadmapPath, renderRoadmap({ name: pm.name, date }), 'utf-8');
    created.push('.planning/ROADMAP.md');
  } else {
    skipped.push('.planning/ROADMAP.md');
  }

  const stackPath = path.join(target, '.planning', 'STACK.md');
  let stackSummary;
  if (!fs.existsSync(stackPath)) {
    const ip = stackProfile.initProfile({ projectRoot: target, userHome, from: 'codebase', write: true });
    if (ip.action === 'written') created.push('.planning/STACK.md');
    stackSummary = {
      action: ip.action,
      ok: ip.validation ? !!ip.validation.ok : false,
      errors: ip.validation ? ip.validation.errors : [],
      evidence_keys: (ip.evidence || []).map((e) => e.key),
    };
  } else {
    const vp = stackProfile.validateProfile({ projectRoot: target, userHome });
    skipped.push('.planning/STACK.md');
    stackSummary = { action: 'existing', ok: !!vp.ok, errors: vp.errors || [], evidence_keys: [] };
  }

  let claudeAction;
  if (!claudeBlock) {
    const content = renderClaudeMdOverview(tpl);
    const next = managedBlock.upsert(claudeText, content, { v: tpl.version, src: 'claude-md' }, { position: 'prepend' });
    fs.writeFileSync(claudePath, next, 'utf-8');
    claudeAction = claudeText === '' ? 'created' : 'prepended';
    created.push('CLAUDE.md');
  } else {
    claudeAction = 'unchanged';
    skipped.push('CLAUDE.md');
  }

  const upgradeReport = upgrade.apply({ projectRoot: target, userHome, pluginVersion, now });
  const reg = backupPrune.register({ userHome, projectRoot: target, now });

  const marker = { ...pf.adopt.marker };
  marker.steps = { ...(marker.steps || {}), scaffolded: true };
  marker.scaffold = {
    at: now.toISOString(),
    created: [...created],
    skipped: [...skipped],
    stack: stackSummary,
    claude_md: claudeAction,
    upgrade: {
      from: upgradeReport.from,
      to: upgradeReport.to,
      applied: upgradeReport.applied.map((a) => a.id),
      failed: upgradeReport.failed,
      backup: upgradeReport.backup,
    },
    registry_key: reg.key,
  };
  writeMarker(target, env, marker);

  return {
    route: 'scaffold',
    target,
    created,
    skipped,
    stack: stackSummary,
    claude_md: claudeAction,
    upgrade: marker.scaffold.upgrade,
    marker,
  };
}

module.exports = {
  ADOPT_BRANCH,
  MARKER_NAME,
  OWNED_PATHS,
  gitFacts,
  readMarker,
  writeMarker,
  resumeSteps,
  decideRoute,
  preflight,
  begin,
  readProjectMd,
  renderState,
  renderRoadmap,
  scaffold,
};
