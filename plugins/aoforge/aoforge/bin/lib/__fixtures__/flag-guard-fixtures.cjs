'use strict';

/**
 * Fixtures for the unknown-flag guard (TRD 68-03, TOOL-01).
 *
 * `flagProbeProject()` builds a hand-made temp project and runs the real `aof-tools` against it with a fake HOME and
 * the `gh` PATH shim, so a probe can neither reach GitHub nor touch `~/.claude` nor this repository's `.aoforge/`.
 * The shim lives OUTSIDE the project root (its call log and the fake HOME are not part of `tree()`).
 *
 * `PROBES` maps each FLAG_SPEC entry to the shortest realistic argv for it, without the unknown flag. The label is
 * `command` (a flags-only command, or the default rule of a subcommand-taking one) or `command subcommand`. Where a verb
 * reads its content from `--from`, the argv names `draft.md`, which the project carries at its root (a relative path
 * resolves against the project because the probes run with `--cwd <root>`).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { installGhShim } = require('./gh-shim.cjs');
const { snapshot } = require('./upgrade-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');

const STATE_MD = [
  '# Project State',
  '',
  '**Status:** Planned',
  '**Current Objective:** 01',
  '',
].join('\n');

const ROADMAP_MD = [
  '# Roadmap: Flag Probe',
  '',
  '## Milestones',
  '',
  '- 🚧 **v1.0 — Probe** — Objective 1 (in progress)',
  '',
  '## Objectives',
  '',
  '- [ ] Objective 1: A',
  '',
  '## Progress',
  '',
  '| Objective | Milestone | Plans | Status | Completed |',
  '|---|---|---|---|---|',
  '| 1. A | v1.0 | 0/1 | Planned | — |',
  '',
  '### Objective 1: A',
  '',
  '**Goal**: Exercise the unknown-flag guard.',
  '**Jobs:** 0/1 jobs complete',
  '',
].join('\n');

const REQUIREMENTS_MD = [
  '# Requirements',
  '',
  '- [ ] **PROBE-01**: A requirement the probes can name.',
  '',
  '| Requirement | Objective | Status |',
  '|---|---|---|',
  '| PROBE-01 | 1 | Pending |',
  '',
].join('\n');

const TRD_MD = [
  '---',
  'objective: 01-a',
  'trd: "01"',
  'type: standard',
  'wave: 1',
  'depends_on: []',
  'files_modified: []',
  'autonomous: true',
  '---',
  '',
  '# TRD 01-01: Probe',
  '',
].join('\n');

const OBJECTIVE_MD = [
  '---',
  'objective: 01-a',
  'status: planned',
  '---',
  '',
  '# Objective 1: A',
  '',
].join('\n');

/** Every directory under `root` (relative, `/`-separated, sorted), skipping `.git`. */
function listDirs(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || !entry.isDirectory()) continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      out.push(relPath);
      walk(path.join(dir, entry.name), relPath);
    }
  };
  walk(root, '');
  return out.sort();
}

/**
 * @returns {{
 *   root: string,
 *   run: (argv: string[]) => {status: number|null, stdout: string, stderr: string},
 *   tree: () => {files: Record<string, string>, dirs: string[]},
 *   ghCalls: () => string[][],
 *   cleanup: () => void,
 * }}
 */
function flagProbeProject() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'df-flag-probe-')));
  const planning = path.join(root, '.aoforge');
  const objectiveDir = path.join(planning, 'objectives', '01-a');
  fs.mkdirSync(objectiveDir, { recursive: true });

  fs.writeFileSync(path.join(planning, 'config.json'), '{}\n');
  fs.writeFileSync(path.join(planning, 'STATE.md'), STATE_MD);
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), ROADMAP_MD);
  fs.writeFileSync(path.join(planning, 'REQUIREMENTS.md'), REQUIREMENTS_MD);
  fs.writeFileSync(path.join(objectiveDir, '01-01-TRD.md'), TRD_MD);
  fs.writeFileSync(path.join(objectiveDir, 'OBJECTIVE.md'), OBJECTIVE_MD);
  fs.writeFileSync(path.join(root, 'draft.md'), '# Draft\n\nContent a `--from draft.md` verb can read.\n');

  // The things the "complete / resolve / summarise" verbs act on, so their probes can really write.
  for (const [rel, text] of [
    ['todos/pending/a-todo.md', '# A todo\n'],
    ['debug/a-bug.md', '# A bug\n\n**Status:** open\n'],
    ['quick/1-a-slug/1-PLAN.md', '# Quick 1\n'],
  ]) {
    const file = path.join(planning, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }

  const shim = installGhShim({ table: {} });

  function run(argv) {
    const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, ...argv], {
      env: shim.env(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20000,
    });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  }

  return {
    root,
    run,
    tree: () => ({ files: snapshot(root), dirs: listDirs(root) }),
    ghCalls: () => shim.readCalls(),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      shim.cleanup();
    },
  };
}

/**
 * One key per FLAG_SPEC entry (group 1 from TRD 68-03, group 2 from TRD 68-05). The argv is what a caller would type for
 * that entry, minus the unknown flag the guard test appends.
 */
const PROBES = {
  'state': ['state'],
  'state load': ['state', 'load'],
  'state get': ['state', 'get', 'Status'],
  'state update': ['state', 'update', 'Status', 'Building'],
  'state patch': ['state', 'patch', '--Status', 'Building'],
  'state advance-job': ['state', 'advance-job', '--objective', '1'],
  'state update-progress': ['state', 'update-progress'],
  'state record-metric': ['state', 'record-metric', '--objective', '1', '--job', '01', '--duration', '5min', '--tasks', '2', '--files', '3'],
  'state add-decision': ['state', 'add-decision', '--objective', '1', '--summary', 'Use the guard'],
  'state add-blocker': ['state', 'add-blocker', '--text', 'A blocker'],
  'state resolve-blocker': ['state', 'resolve-blocker', '--text', 'A blocker'],
  'state record-session': ['state', 'record-session', '--stopped-at', 'Probe'],
  'state rekey': ['state', 'rekey', '--from', '/nonexistent-probe/old-checkout', '--dry-run'],
  'commit': ['commit', 'msg'],
  'template select': ['template', 'select', '.aoforge/objectives/01-a/01-01-TRD.md'],
  'template fill': ['template', 'fill', 'summary', '--objective', '1', '--job', '01', '--name', 'Probe'],
  'frontmatter get': ['frontmatter', 'get', '.aoforge/objectives/01-a/01-01-TRD.md', '--field', 'type'],
  'frontmatter set': ['frontmatter', 'set', '.aoforge/objectives/01-a/01-01-TRD.md', '--field', 'type', '--value', 'tdd'],
  'frontmatter merge': ['frontmatter', 'merge', '.aoforge/objectives/01-a/01-01-TRD.md', '--data', '{"wave":2}'],
  'frontmatter validate': ['frontmatter', 'validate', '.aoforge/objectives/01-a/01-01-TRD.md', '--schema', 'trd'],
  'config-ensure-section': ['config-ensure-section'],
  'config-set': ['config-set', 'mode', 'yolo'],
  'roadmap get-objective': ['roadmap', 'get-objective', '1'],
  'roadmap analyze': ['roadmap', 'analyze'],
  'roadmap update-job-progress': ['roadmap', 'update-job-progress', '1'],
  'requirements mark-complete': ['requirements', 'mark-complete', 'PROBE-01'],
  'objective next-decimal': ['objective', 'next-decimal', '1'],
  'objective add': ['objective', 'add', 'Another objective'],
  'objective insert': ['objective', 'insert', '1', 'Inserted objective'],
  'objective remove': ['objective', 'remove', '1', '--confirm'],
  'objective complete': ['objective', 'complete', '1'],
  'objective put': ['objective', 'put', '01-a', '--from', 'draft.md'],
  'objective set-status': ['objective', 'set-status', '01-a', 'in_progress'],
  'milestone put': ['milestone', 'put', 'v1.0', '--from', 'draft.md'],
  'milestone complete': ['milestone', 'complete', 'v1.0'],
  'plan put-trd': ['plan', 'put-trd', '01-a', '01-02-TRD.md', '--from', 'draft.md'],
  'plan push': ['plan', 'push', '01-a'],
  'summary post': ['summary', 'post', '01-01', '--from', 'draft.md'],
  'summary checkpoint': ['summary', 'checkpoint', '01-01', '--from', 'draft.md'],
  'verification post': ['verification', 'post', '01-a', '--from', 'draft.md'],
  'doc put': ['doc', 'put', 'PROJECT.md', '--from', 'draft.md'],
  'decision open': ['decision', 'open', '01-01', '--question', 'Which one?'],
  'decision answer': ['decision', 'answer', 'DECISION-001', '--text', 'This one'],
  'debug put': ['debug', 'put', 'a-bug', '--from', 'draft.md'],
  'debug resolve': ['debug', 'resolve', 'a-bug'],
  'quick put': ['quick', 'put', '1', 'a-slug', '--from', 'draft.md'],
  'quick summary': ['quick', 'summary', '1', '--from', 'draft.md'],
  'todo add': ['todo', 'add', '--from', 'draft.md'],
  'todo complete': ['todo', 'complete', 'a-todo'],
  'todo sync': ['todo', 'sync', '--transcript', 'transcript.jsonl'],
  'scaffold': ['scaffold', 'context', '--objective', '1'],
  'validate consistency': ['validate', 'consistency'],
  'validate health': ['validate', 'health'],
  'validate docs': ['validate', 'docs'],
  'validate requirements': ['validate', 'requirements'],
  'skill-active': ['skill-active', '--status'],
  'micro start': ['micro', 'start', 'a small task'],
  'micro commit': ['micro', 'commit'],
  'micro abort': ['micro', 'abort'],

  // Group 2 (TRD 68-05): the remaining writing commands. Where a command could act outside the temp project if it were
  // not rejected first (a worktree, a push, an OS notification), the argv names something that does not exist, so the RED
  // run before the spec lands cannot do more than fail. `ownParser` entries use an argv that reaches the module's parser.
  'flutter-ui setup': ['flutter-ui', 'setup', '--print-only'],
  'flutter-ui eval': ['flutter-ui', 'eval', 'missing-manifest.json'],
  'flutter-ui bootstrap': ['flutter-ui', 'bootstrap'],
  'flutter-ui design-review': ['flutter-ui', 'design-review', 'missing-manifest.json'],
  'ui metrics': ['ui', 'metrics', 'baseline'],
  'ui spec': ['ui', 'spec', 'validate', 'draft.md'],
  'ui sheet': ['ui', 'sheet', 'draft.md', '--out', 'sheet.html'],
  'ui lock': ['ui', 'lock', 'draft.md', '--sheet-hash', '0'.repeat(64), '--by', 'probe@example.com'],
  'generate uat': ['generate', 'uat', '1'],
  'migrate plan': ['migrate', 'plan'],
  'migrate apply': ['migrate', 'apply', '--dry-run'],
  'upgrade': ['upgrade', '--check'],
  'adopt preflight': ['adopt', 'preflight'],
  'adopt begin': ['adopt', 'begin'],
  'adopt scaffold': ['adopt', 'scaffold'],
  'adopt report': ['adopt', 'report'],
  'doctor': ['doctor'],
  'transcript-export': ['transcript-export'],
  'tokens': ['tokens', 'coverage'],
  'calibrate': ['calibrate', '--dry-run'],
  'estimate': ['estimate', 'milestone'],
  'override': ['override', '--list'],
  'handoff create': ['handoff', 'create', 'echo hi'],
  'handoff complete': ['handoff', 'complete', 'probe-id', '--exit-code', '0'],
  'handoff list': ['handoff', 'list'],
  'handoff get': ['handoff', 'get', 'probe-id'],
  'workstreams analyze': ['workstreams', 'analyze'],
  'workstreams provision': ['workstreams', 'provision', 'ws-probe', 'wt-probe'],
  'workstreams reconcile': ['workstreams', 'reconcile'],
  'changelog update': ['changelog', 'update', '--version', 'v9.9.9', '--dry-run'],
  'changelog check': ['changelog', 'check', 'CHANGELOG.md'],
  'defaults-table init': ['defaults-table', 'init', '--scope=project', '--dry-run'],
  'gh status': ['gh', 'status'],
  'gh sync-objectives': ['gh', 'sync-objectives'],
  'gh comment': ['gh', 'comment', '1', 'a comment'],
  'gh close-issue': ['gh', 'close-issue', '1'],
  'gh sync-release': ['gh', 'sync-release', 'v9.9.9'],
  'gh resolve': ['gh', 'resolve', '1'],
  'gh sync': ['gh', 'sync', '1'],
  'gh pull': ['gh', 'pull', '1'],
  'gh outbox': ['gh', 'outbox', 'status'],
  'gh trd': ['gh', 'trd', 'spec', '01-01'],
  'gh orphans': ['gh', 'orphans', '1'],
  'gh pr': ['gh', 'pr', 'status', '1'],
  'gh setup': ['gh', 'setup'],
  'gh rebrand': ['gh', 'rebrand'],
  'stack resolve': ['stack', 'resolve'],
  'stack context': ['stack', 'context', 'executor'],
  'stack validate': ['stack', 'validate'],
  'stack command': ['stack', 'command', 'test'],
  'stack init': ['stack', 'init'],
  'stack verify': ['stack', 'verify'],
  'stack report': ['stack', 'report'],
  'stack mcp': ['stack', 'mcp'],
  'planning sibling-trd-scan': ['planning', 'sibling-trd-scan', '1'],
  'planning draft': ['planning', 'draft', 'STATE.md'],
  'planning import': ['planning', 'import', '--dry-run'],
  'planning mode': ['planning', 'mode'],
  'project-hygiene check': ['project-hygiene', 'check'],
  'project-hygiene move': ['project-hygiene', 'move', '1', '--to=/nonexistent/df-flag-probe'],
  'project-hygiene archive': ['project-hygiene', 'archive'],
  'decision-queue add': ['decision-queue', 'add', '--objective', '1', '--trd', '01', '--title', 'T', '--context', 'C', '--options', 'a,b', '--recommendation', 'a'],
  'decision-queue list': ['decision-queue', 'list'],
  'decision-queue resolve': ['decision-queue', 'resolve', 'DECISION-001', 'a'],
  'decision-queue notify': ['decision-queue', 'notify', 'DECISION-001'],
  'initiatives sync': ['initiatives', 'sync'],
  'initiatives list': ['initiatives', 'list'],
  'initiatives show': ['initiatives', 'show', 'probe'],
  'initiatives format-for-planner': ['initiatives', 'format-for-planner', '--repo', 'probe/repo'],
  'sync-roadmap': ['sync-roadmap', '--dry-run'],
  'deprecation log': ['deprecation', 'log', 'old-name'],
  'project-decline': ['project-decline'],
  'project-accept': ['project-accept'],
  'merge-driver install': ['merge-driver', 'install', '--check'],
  'merge-driver uninstall': ['merge-driver', 'uninstall'],
  'merge-driver resolve': ['merge-driver', 'resolve', '.aoforge/state.json'],
  'merge-driver state-json': ['merge-driver', 'state-json', 'base.json', 'ours.json', 'theirs.json'],
  'exec-context check': ['exec-context', 'check', '--repo', '/nonexistent/df-flag-probe'],
  'exec-context worktree': ['exec-context', 'worktree', '--repo', '/nonexistent/df-flag-probe', '--id', 'probe'],
  'exec-context release': ['exec-context', 'release', '--repo', '/nonexistent/df-flag-probe'],
  'global-config get': ['global-config', 'get', 'probe.key'],
  'global-config set': ['global-config', 'set', 'probe.key', 'value'],
};

/**
 * The probe-able entries of a FLAG_SPEC: `[{ label, rule }]`, one per subcommand, one per flags-only command and one per
 * `default` rule of a subcommand-taking command. The label is `command` or `command subcommand`, the key of PROBES.
 */
function specEntries(spec) {
  const out = [];
  for (const [command, entry] of Object.entries(spec)) {
    if (!entry.subcommands) {
      out.push({ label: command, rule: entry });
      continue;
    }
    for (const [sub, rule] of Object.entries(entry.subcommands)) out.push({ label: `${command} ${sub}`, rule });
    if (entry.default) out.push({ label: command, rule: entry.default });
  }
  return out;
}

module.exports = { flagProbeProject, PROBES, specEntries, DF_TOOLS };
