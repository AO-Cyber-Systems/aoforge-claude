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
const { safeReadFile, localDate } = require('./helpers.cjs');
const { VALID_KINDS, VALID_WORKS } = require('./intent.cjs');
const managedBlock = require('./managed-block.cjs');
const stackProfile = require('./stack-profile.cjs');
const { loadClaudeMdTemplate } = require('./migrations/0005-claude-md-block.cjs');
const upgrade = require('./upgrade.cjs');
const backupPrune = require('./backup-prune.cjs');

const ADOPT_BRANCH = 'devflow/adopt';
const MARKER_NAME = 'devflow-adopt.json';
const OWNED_PATHS = ['.planning', 'CLAUDE.md'];
// Stack-draft notes carried in the marker and turned into report rows (TRD 42-07); bounded so a
// sprawling monorepo cannot bloat the marker or the report.
const MAX_STACK_NOTES = 100;

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

  // Ensure `.planning/` exists before the caller marks a skill active (the
  // scripted pipeline runs `skill-active --start adopt` here, ahead of the
  // stand-in maps / scaffold that would otherwise create it first).
  fs.mkdirSync(path.join(target, '.planning'), { recursive: true });

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
  // The LOCAL calendar day (SDR-07): STATE/ROADMAP dates are read by a human as "today".
  const date = localDate(now);

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
    const ip = stackProfile.initProfile({ projectRoot: target, userHome, from: 'codebase', write: true, now });
    if (ip.action === 'written') created.push('.planning/STACK.md');
    // TRD 42-07: the grounded draft says which keys it VERIFIED, which the tier supplies, and why
    // any candidate was not proposed (notes); the report reads all of it back from the marker.
    const resolvedKeys = Array.isArray(ip.resolvedKeys) ? ip.resolvedKeys : [];
    stackSummary = {
      action: ip.action,
      ok: ip.validation ? !!ip.validation.ok : false,
      errors: ip.validation ? ip.validation.errors : [],
      evidence_keys: [...new Set([...(ip.evidence || []).map((e) => e.key), ...resolvedKeys])],
      resolved_keys: resolvedKeys,
      inherited_keys: Array.isArray(ip.inheritedKeys) ? ip.inheritedKeys : [],
      notes: (Array.isArray(ip.notes) ? ip.notes : []).slice(0, MAX_STACK_NOTES),
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

// ─── report(root, opts) — deterministic + LLM-inference review report ─────
//
// Only runs from the resume state with scaffold already done. Redacts secrets in owned .planning
// docs + PROJECT.md + the CLAUDE.md block (never touching bytes outside it), folds the LLM's
// confidence records (`.planning/.adopt-inferences.json`) together with deterministic findings
// (invalid STACK.md, missing loop evidence, short/missing codebase docs, health warnings/errors,
// scratch state) into `.planning/ADOPT-REPORT.md`, and returns the exact file list + message the
// workflow commits with (37-09) — adopt report never commits.

const REPORT_REL = '.planning/ADOPT-REPORT.md';
const INFERENCES_REL = '.planning/.adopt-inferences.json';

// Verbatim from workflows/map-codebase.md:304, split into named kinds for the report.
const SECRET_PATTERNS = [
  { kind: 'openai-key', re: /sk-[a-zA-Z0-9]{20,}/g },
  { kind: 'stripe-live', re: /sk_live_[a-zA-Z0-9]+/g },
  { kind: 'stripe-test', re: /sk_test_[a-zA-Z0-9]+/g },
  { kind: 'github-pat', re: /ghp_[a-zA-Z0-9]{36}/g },
  { kind: 'github-oauth', re: /gho_[a-zA-Z0-9]{36}/g },
  { kind: 'gitlab-pat', re: /glpat-[a-zA-Z0-9_-]+/g },
  { kind: 'aws-access-key', re: /AKIA[A-Z0-9]{16}/g },
  { kind: 'slack-token', re: /xox[baprs]-[a-zA-Z0-9-]+/g },
  { kind: 'private-key', re: /-----BEGIN.*PRIVATE KEY/g },
  { kind: 'jwt', re: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\./g },
];

const TRANSIENT_COMMIT_EXCLUDES = new Set([
  '.planning/.skill-active',
  INFERENCES_REL,
  '.planning/.devflow-notices.json',
]);

/** redactBlob(text, fileLabel) -> { text, rows:[{file, line, kind}] }. Never returns the secret. */
function redactBlob(text, fileLabel) {
  const lines = text.split('\n');
  const rows = [];
  const redacted = lines.map((line, idx) => {
    let out = line;
    for (const { kind, re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(out)) {
        re.lastIndex = 0;
        out = out.replace(re, '[REDACTED]');
        rows.push({ file: fileLabel, line: idx + 1, kind });
      }
    }
    return out;
  });
  return { text: redacted.join('\n'), rows };
}

/** redactPlainFile(root, relPath) -> { rows }. Rewrites the file only if a match was found. */
function redactPlainFile(root, relPath) {
  const abs = path.join(root, relPath);
  const text = safeReadFile(abs);
  if (text === null) return { rows: [] };
  const { text: next, rows } = redactBlob(text, relPath);
  if (rows.length > 0) fs.writeFileSync(abs, next, 'utf-8');
  return { rows };
}

/**
 * redactClaudeMdBlock(root) -> { rows }. Slices strictly to [block.start, block.end) so every
 * byte outside the DEVFLOW block is untouched, even if the block itself never changes offsets.
 */
function redactClaudeMdBlock(root) {
  const abs = path.join(root, CLAUDE_MD_REL);
  const text = safeReadFile(abs);
  if (text === null) return { rows: [] };
  let block;
  try {
    block = managedBlock.read(text);
  } catch {
    return { rows: [] };
  }
  if (!block) return { rows: [] };
  const inner = text.slice(block.start, block.end);
  const { text: redactedInner, rows } = redactBlob(inner, CLAUDE_MD_REL);
  if (rows.length === 0) return { rows: [] };
  const lineOffset = text.slice(0, block.start).split('\n').length - 1;
  const adjusted = rows.map((r) => ({ ...r, line: r.line + lineOffset }));
  const next = text.slice(0, block.start) + redactedInner + text.slice(block.end);
  fs.writeFileSync(abs, next, 'utf-8');
  return { rows: adjusted };
}

/** splitInferences(raw) -> { high, low, medium, malformed } (pure). */
function splitInferences(raw) {
  const CONF = new Set(['high', 'low', 'medium']);
  const high = [], low = [], medium = [], malformed = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const conf = entry && entry.confidence;
    if (!CONF.has(conf)) { malformed.push(entry); continue; }
    if (conf === 'high') high.push(entry);
    else if (conf === 'low') low.push(entry);
    else medium.push(entry);
  }
  return { high, low, medium, malformed };
}

/**
 * loadInferences(target, marker) -> { raw, noRecord, markerPatch, deleteInferenceFile }
 *
 * Idempotent: once consumed, `marker.inferences` (or `marker.no_inference_record`) is the source
 * of truth on every later run — the file is gone by then, and re-reading disk would silently
 * change the answer.
 */
function loadInferences(target, marker) {
  if (Array.isArray(marker.inferences)) {
    return { raw: marker.inferences, noRecord: false, markerPatch: {}, deleteInferenceFile: null };
  }
  if (marker.no_inference_record === true) {
    return { raw: [], noRecord: true, markerPatch: {}, deleteInferenceFile: null };
  }
  const infPath = path.join(target, INFERENCES_REL);
  const text = safeReadFile(infPath);
  if (text === null) {
    return { raw: [], noRecord: true, markerPatch: { no_inference_record: true }, deleteInferenceFile: null };
  }
  let raw;
  try {
    raw = JSON.parse(text);
    if (!Array.isArray(raw)) raw = [];
  } catch {
    raw = [];
  }
  return { raw, noRecord: false, markerPatch: { inferences: raw }, deleteInferenceFile: infPath };
}

/** runValidateHealth(root, env) -> {errors, warnings} | null (null on spawn/parse failure). */
function runValidateHealth(root, env) {
  const dfToolsPath = path.join(__dirname, '..', 'df-tools.cjs');
  try {
    const out = execFileSync(process.execPath, [dfToolsPath, '--cwd', root, 'validate', 'health', '--raw'], {
      env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/** computeCommitFiles(root, env) -> sorted owned paths, minus transient files. Called AFTER writes. */
function computeCommitFiles(root, env) {
  const statusRes = git(root, env, ['status', '--porcelain=v1', '--untracked-files=all', '-z']);
  const dirty = statusRes.ok ? parsePorcelainZ(statusRes.out) : [];
  const files = new Set(dirty.filter((rel) => isOwnedPath(rel) && !TRANSIENT_COMMIT_EXCLUDES.has(rel)));
  return [...files].sort();
}

function renderNeedsReviewTable(rows) {
  if (rows.length === 0) {
    return 'Nothing needs review — every inference was high confidence.\n';
  }
  const lines = ['| # | Item | Inferred | Confidence | Evidence |', '|---|---|---|---|---|'];
  rows.forEach((r, i) => lines.push(`| ${i + 1} | ${r.item} | ${r.inferred} | ${r.confidence} | ${r.evidence} |`));
  return lines.join('\n') + '\n';
}

function renderHighTable(rows) {
  const lines = ['| Item | Value | Evidence |', '|---|---|'];
  for (const r of rows) lines.push(`| ${r.item} | ${r.value} | ${r.evidence} |`);
  return lines.join('\n') + '\n';
}

function renderReport(ctx) {
  const {
    name, date, version, baseBranch, baseSha7, docsCount, claudeVerb, claudeVersion,
    backupPath, registryKey, needsReviewRows, highRows, stackReportLinked,
  } = ctx;
  return (
    `# Adopt report — ${name}\n\n` +
    `**Adopted:** ${date} · **DevFlow:** v${version} · **Branch:** \`${ADOPT_BRANCH}\` (from \`${baseBranch}\` @ \`${baseSha7}\`) · **Pushed:** no\n\n` +
    '## Needs review\n\n' +
    renderNeedsReviewTable(needsReviewRows) + '\n' +
    (stackReportLinked
      ? 'See .planning/STACK-REPORT.md for CI/CD and local-testing recommendations (proposals only).\n\n'
      : '') +
    '## Inferred with high confidence\n\n' +
    renderHighTable(highRows) + '\n' +
    '## What adopt did\n\n' +
    `- Mapped the codebase into \`.planning/codebase/\` (${docsCount} documents).\n` +
    '- Wrote PROJECT.md, STACK.md, STATE.md, ROADMAP.md (no objectives), config.json, state.json.\n' +
    `- CLAUDE.md: ${claudeVerb} DevFlow block v${claudeVersion}.\n` +
    `- Stamped DevFlow v${version}; pre-apply backup: \`${backupPath || 'none'}\`.\n` +
    `- Registered for backup pruning as \`${registryKey}\`.\n\n` +
    '## Next steps\n\n' +
    '1. Work through **Needs review**; edit `.planning/PROJECT.md` / `.planning/STACK.md` as needed.\n' +
    `2. When satisfied: \`git switch ${baseBranch} && git merge ${ADOPT_BRANCH}\`. Nothing was pushed.\n` +
    '3. Add a first objective with `/devflow:objective add`.\n'
  );
}

/**
 * report(root, opts) -> preflight-shaped report (route !== 'resume') | report result
 *
 * Runs only from the resume state with `steps.scaffolded` true (throws otherwise — the CLI maps
 * that to exit 1). Redaction and rendering happen before `commit_files` is computed, since the
 * report file itself becomes part of what gets committed.
 */
function report(root, opts = {}) {
  const { env = process.env, userHome = null, pluginVersion = '0.0.0' } = opts;
  const pf = preflight(root, opts);

  if (pf.route !== 'resume') {
    return { ...pf };
  }
  if (!pf.adopt.steps || !pf.adopt.steps.scaffolded) {
    throw new Error('run adopt scaffold first');
  }

  const target = pf.target;
  const marker = { ...pf.adopt.marker };
  const scaffoldInfo = marker.scaffold || {};
  const rows = [];

  // ── Redaction (before anything else reads these files) ──────────────────
  let redactions = 0;
  const pushSecretRows = (found) => {
    for (const r of found.rows) {
      redactions += 1;
      rows.push({ confidence: 'priority', item: `possible secret in ${r.file}:${r.line}`, inferred: '[REDACTED]', evidence: `pattern: ${r.kind}` });
    }
  };
  for (const name of CODEBASE_DOC_NAMES) {
    pushSecretRows(redactPlainFile(target, `.planning/codebase/${name}.md`));
  }
  pushSecretRows(redactPlainFile(target, '.planning/PROJECT.md'));
  pushSecretRows(redactClaudeMdBlock(target));

  // ── Deterministic finding: STACK.md invalid ──────────────────────────────
  if (scaffoldInfo.stack && scaffoldInfo.stack.ok === false) {
    const errs = scaffoldInfo.stack.errors || [];
    rows.push({
      confidence: 'priority',
      item: '.planning/STACK.md failed validation',
      inferred: errs.length ? errs.join('; ') : '(no error detail recorded)',
      evidence: 'stack-profile.validateProfile at scaffold time',
    });
  }

  // ── Deterministic finding: validate health ───────────────────────────────
  const health = runValidateHealth(target, env);
  const healthErrors = (health && Array.isArray(health.errors)) ? health.errors : [];
  const healthWarnings = (health && Array.isArray(health.warnings)) ? health.warnings : [];
  for (const e of healthErrors) {
    rows.push({ confidence: 'priority', item: `validate health error ${e.code}`, inferred: e.message, evidence: e.fix || '(no fix suggested)' });
  }
  for (const w of healthWarnings) {
    rows.push({ confidence: 'low', item: `validate health warning ${w.code}`, inferred: w.message, evidence: w.fix || '(no fix suggested)' });
  }

  // ── Inferences (idempotent: marker-first, file-second, then consumed) ───
  const { raw: inferenceRaw, noRecord, markerPatch, deleteInferenceFile } = loadInferences(target, marker);
  Object.assign(marker, markerPatch);
  const { high, low: lowInf, medium: mediumInf, malformed } = splitInferences(inferenceRaw);

  if (noRecord) {
    rows.push({
      confidence: 'low',
      item: 'no inference record — PROJECT.md fields are unverified',
      inferred: '(none)',
      evidence: `${INFERENCES_REL} was not present at report time`,
    });
  }
  if (malformed.length > 0) {
    rows.push({
      confidence: 'low',
      item: `${malformed.length} malformed inference ${malformed.length === 1 ? 'entry' : 'entries'} ignored`,
      inferred: malformed.map((m) => (m && m.field) || '(unnamed field)').join(', '),
      evidence: 'expected confidence: high|medium|low',
    });
  }
  for (const entry of lowInf) {
    rows.push({ confidence: 'low', item: entry.field, inferred: entry.value, evidence: entry.evidence || '(no evidence recorded)' });
  }
  for (const entry of mediumInf) {
    rows.push({ confidence: 'medium', item: entry.field, inferred: entry.value, evidence: entry.evidence || '(no evidence recorded)' });
  }
  const highRows = high.map((entry) => ({ item: entry.field, value: entry.value, evidence: entry.evidence || '(no evidence recorded)' }));

  // ── Deterministic finding: stack draft notes + missing loop-command evidence ─
  // TRD 42-07: each draft note (a candidate that was not verified, a weak gate kept verbatim, an
  // unsupported area) is one low row; a loop key gets the missing-evidence row only when it is
  // neither verified, nor inherited from the tier, nor evidenced at all.
  const st = scaffoldInfo.stack;
  let evidenceKeys;
  let resolvedKeys;
  let inheritedKeys;
  let draftNotes;
  if (st && st.action === 'written' && Array.isArray(st.evidence_keys)) {
    evidenceKeys = new Set(st.evidence_keys);
    resolvedKeys = new Set(Array.isArray(st.resolved_keys) ? st.resolved_keys : []);
    inheritedKeys = new Set(Array.isArray(st.inherited_keys) ? st.inherited_keys : []);
    draftNotes = Array.isArray(st.notes) ? st.notes : [];
  } else {
    const draft = stackProfile.draftProfile({ projectRoot: target, userHome, from: 'codebase' });
    evidenceKeys = new Set((draft.evidence || []).map((e) => e.key));
    resolvedKeys = new Set(draft.resolvedKeys || []);
    inheritedKeys = new Set(draft.inheritedKeys || []);
    // An existing STACK.md was not drafted by adopt; notes about a re-draft do not apply to it.
    draftNotes = st && st.action === 'existing' ? [] : (draft.notes || []);
  }
  for (const n of draftNotes.slice(0, MAX_STACK_NOTES)) {
    if (!n || typeof n !== 'object') continue;
    const item = `${n.key || 'stack'}: ${n.candidate || n.detail || '(no detail)'} — ${n.status || 'note'}`;
    rows.push({
      confidence: 'low',
      item: item.replace(/\|/g, '\\|'),
      inferred: n.area ? n.area : '(root)',
      evidence: String(n.detail || `stack init ${n.source || 'draft'}`).replace(/\|/g, '\\|'),
    });
  }
  for (const key of ['test', 'lint', 'build']) {
    if (resolvedKeys.has(key) || inheritedKeys.has(key) || evidenceKeys.has(key)) continue;
    rows.push({ confidence: 'low', item: `no command evidence for '${key}'`, inferred: '(none)', evidence: 'checked .planning/STACK.md loop commands at scaffold time' });
  }

  // ── Deterministic finding: scratch repo state ────────────────────────────
  if (pf.repo_state && pf.repo_state.signals && pf.repo_state.signals.is_scratch_dir) {
    rows.push({ confidence: 'low', item: 'repo root is a scratch/tmp location', inferred: target, evidence: 'repo-state signals: is_scratch_dir' });
  }

  // ── Deterministic finding: missing/short codebase docs ──────────────────
  let docsCount = 0;
  for (const name of CODEBASE_DOC_NAMES) {
    const rel = `.planning/codebase/${name}.md`;
    const text = safeReadFile(path.join(target, rel));
    if (text === null) {
      rows.push({ confidence: 'medium', item: rel, inferred: '(missing)', evidence: 'expected from adopt mapping' });
      continue;
    }
    docsCount += 1;
    const lineCount = text.split('\n').length;
    if (lineCount < 20) {
      rows.push({ confidence: 'medium', item: rel, inferred: `${lineCount} lines`, evidence: 'under the 20-line floor' });
    }
  }

  const now = pf.adopt.marker && marker.started_at ? new Date(marker.started_at) : new Date();

  // ── Stack report (TRD 42-08): CI/CD + local-testing proposals ────────────
  // Written only when absent (a present one may be hand-edited); the rows always come from a
  // fresh computation. Lazy: the report is adopt's only caller-side dependency on it.
  let stackReportLinked = false;
  try {
    const stackReport = require('./stack-report.cjs');
    const built = stackReport.buildReport({ projectRoot: target, userHome, now, verifyOpts: { env } });
    if (!fs.existsSync(path.join(target, stackReport.REPORT_REL))) stackReport.writeReport(target, built.text);
    for (const f of built.findings.filter((x) => x.severity === 'gap')) {
      const proposal = f.snippet ? `${f.proposal} \`${f.snippet}\`` : f.proposal;
      rows.push({
        confidence: 'medium',
        item: `${f.id}: ${f.finding}`.replace(/\|/g, '\\|'),
        inferred: proposal.replace(/\|/g, '\\|'),
        evidence: 'STACK-REPORT.md',
      });
    }
    stackReportLinked = true;
  } catch { /* the stack report is advisory; adopt never fails on it */ }

  // ── Order (priority, then low, then medium) and render ───────────────────
  const RANK = { priority: 0, low: 1, medium: 2 };
  rows.sort((a, b) => RANK[a.confidence] - RANK[b.confidence]);

  const date = localDate(now);
  const pm = readProjectMd(target);
  const name = pm.ok ? pm.name : path.basename(target);

  const claudePath = path.join(target, CLAUDE_MD_REL);
  const claudeTextNow = safeReadFile(claudePath) || '';
  let claudeVersion = '?';
  try {
    const b = managedBlock.read(claudeTextNow);
    if (b) claudeVersion = String(b.meta.v);
  } catch { /* leave '?' */ }
  const claudeVerb = scaffoldInfo.claude_md === 'unchanged' ? 'kept the existing' : 'inserted the';

  const reportText = renderReport({
    name,
    date,
    version: pluginVersion,
    baseBranch: marker.base_branch || 'main',
    baseSha7: (marker.base_sha || '').slice(0, 7),
    docsCount,
    claudeVerb,
    claudeVersion,
    backupPath: (scaffoldInfo.upgrade && scaffoldInfo.upgrade.backup) || null,
    registryKey: scaffoldInfo.registry_key || '(unregistered)',
    needsReviewRows: rows,
    highRows,
    stackReportLinked,
  });

  const reportPath = path.join(target, REPORT_REL);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportText, 'utf-8');

  marker.steps = { ...(marker.steps || {}), reported: true };
  writeMarker(target, env, marker);

  if (deleteInferenceFile) {
    try { fs.unlinkSync(deleteInferenceFile); } catch { /* already gone */ }
  }

  const commitFiles = computeCommitFiles(target, env);
  const commitMessage = `chore(devflow): adopt repository (DevFlow v${pluginVersion})`;

  return {
    route: 'report',
    target,
    report_path: REPORT_REL,
    needs_review: rows,
    high: highRows,
    redactions,
    health_errors: healthErrors,
    commit_files: commitFiles,
    commit_message: commitMessage,
    marker,
  };
}

module.exports = {
  ADOPT_BRANCH,
  MARKER_NAME,
  OWNED_PATHS,
  CODEBASE_DOC_NAMES,
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
  report,
};
