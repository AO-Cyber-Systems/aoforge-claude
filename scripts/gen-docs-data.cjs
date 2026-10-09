#!/usr/bin/env node
/**
 * Generates site/data/aoforge.json from the plugin source.
 *
 * Everything in the docs' reference tables (commands, agents, hooks, model
 * profiles, config schema) is derived here rather than hand-copied, so the
 * published site cannot drift from the plugin it documents. Run it in CI
 * before `hugo` and the build fails loudly if the shapes change.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugins', 'aoforge');
const RUNTIME = path.join(PLUGIN, 'aoforge');

const read = (p) => fs.readFileSync(p, 'utf8');
const readJSON = (p) => JSON.parse(read(p));

/** Pull the YAML frontmatter block out of a markdown file. */
function frontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : '';
}

/**
 * Minimal YAML reader for the shapes the plugin actually uses: scalars,
 * block scalars (`|`), and `- item` lists. Not a general YAML parser.
 */
function parseFrontmatter(yaml) {
  const out = {};
  const lines = yaml.split(/\r?\n/);
  let key = null;
  let mode = null; // 'block' | 'list'
  let buf = [];

  const flush = () => {
    if (!key) return;
    if (mode === 'block') out[key] = buf.join('\n').trim();
    else if (mode === 'list') out[key] = buf.slice();
    key = null; mode = null; buf = [];
  };

  for (const line of lines) {
    if (mode === 'block' && /^\s{2,}\S/.test(line)) { buf.push(line.trim()); continue; }
    if (mode === 'list' && /^\s*-\s+/.test(line)) { buf.push(line.replace(/^\s*-\s+/, '').trim()); continue; }
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    flush();
    const [, k, rawV] = m;
    const v = rawV.trim();
    if (v === '|' || v === '>') { key = k; mode = 'block'; buf = []; continue; }
    if (v === '') { key = k; mode = 'list'; buf = []; continue; }
    out[k] = v.replace(/^["']|["']$/g, '');
  }
  flush();
  return out;
}

/** Split a skill description into its summary, usage note, and trigger phrases. */
function splitDescription(desc = '') {
  const lines = desc.split('\n').map((l) => l.trim()).filter(Boolean);
  const triggerLine = lines.find((l) => /^Triggers on:/i.test(l));
  const triggers = triggerLine
    ? (triggerLine.replace(/^Triggers on:\s*/i, '').match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''))
    : [];
  const body = lines.filter((l) => l !== triggerLine);
  return { summary: body[0] || '', notes: body.slice(1), triggers };
}

/** Normalise `allowed-tools` — the plugin writes it as both a list and a CSV string. */
function toolList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

// ── skills ────────────────────────────────────────────────────────────────
const skillsDir = path.join(PLUGIN, 'skills');
const skills = fs.readdirSync(skillsDir)
  .filter((d) => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
  .sort()
  .map((dir) => {
    const fm = parseFrontmatter(frontmatter(read(path.join(skillsDir, dir, 'SKILL.md'))));
    const { summary, notes, triggers } = splitDescription(fm.description);
    return {
      name: fm.name || dir,
      slug: dir,
      command: `/aoforge:${fm.name || dir}`,
      summary,
      notes,
      triggers,
      args: fm['argument-hint'] || '',
      tools: toolList(fm['allowed-tools']),
      agent: fm.agent || null,
      // disable-model-invocation means the user must type it; Claude cannot fire it.
      userOnly: String(fm['disable-model-invocation']) === 'true',
    };
  });

// ── agents ────────────────────────────────────────────────────────────────
const profiles = readJSON(path.join(RUNTIME, 'references', 'model-profiles.json'));
const agentsDir = path.join(PLUGIN, 'agents');
const agents = fs.readdirSync(agentsDir)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => {
    const fm = parseFrontmatter(frontmatter(read(path.join(agentsDir, f))));
    const name = fm.name || f.replace(/\.md$/, '');
    return {
      name,
      description: (fm.description || '').replace(/\s+/g, ' ').trim(),
      tools: toolList(fm.tools),
      effort: fm.effort || null,
      color: fm.color || null,
      maxTurns: fm.maxTurns ? Number(fm.maxTurns) : null,
      isolation: fm.isolation || null,
      memory: fm.memory || null,
      models: profiles.agents[name] || null,
    };
  });

// ── hooks ─────────────────────────────────────────────────────────────────
// Event registration is read from hooks.json; anything on disk but absent from
// it is reported as unregistered rather than silently documented as active.
const hooksJson = readJSON(path.join(PLUGIN, 'hooks', 'hooks.json'));
const registered = {};
for (const [event, groups] of Object.entries(hooksJson.hooks)) {
  for (const group of groups) {
    for (const h of group.hooks) {
      const file = path.basename(h.command.trim().split(/\s+/).pop());
      (registered[file] ||= []).push({ event, matcher: group.matcher || null });
    }
  }
}

const HOOK_DOCS = {
  'sync-runtime.js': ['Runtime sync', 'Mirrors the plugin-bundled runtime to `~/.claude/aoforge/` whenever the bundled version differs from the cached `.plugin-version`. Skills reference `@~/.claude/aoforge/...` paths, which do not interpolate `${CLAUDE_PLUGIN_ROOT}` — this hook is what makes those references resolve.', null],
  'awareness-cache-populate.js': ['Session context', 'Warms the cross-repo awareness cache in a detached child process. Never blocks session start, even when a scan takes 30s or more.', null],
  'classify-session.js': ['Session context', 'Classifies the project as `ambient`, `init-offer`, or `skip` and injects the routing decision table you see at session start.', 'AOFORGE_SKIP_CLASSIFY=1'],
  'route-intent.js': ['Enforcement', 'Matches the prompt against build/plan/verify/debug intent and injects a directive to route through the matching skill instead of editing code directly. Regexes require imperative form, so plain questions do not trip it.', null],
  'route-results.js': ['Session context', 'Injects completed handoff-watcher results into the next turn, so a queued interactive command resumes without you pasting anything.', null],
  'gate-commits.js': ['Enforcement', 'Blocks raw `git commit` and redirects to `aof-tools commit`, which preserves objective scope and task IDs and updates STATE.md. Detection is invocation-aware: heredoc bodies and quoted arguments are stripped first, so prose that merely mentions the command is not gated. Merge, rebase and cherry-pick completions are allowed automatically (MERGE_HEAD, REBASE_HEAD, rebase-merge/, rebase-apply/ or CHERRY_PICK_HEAD in the target repo\'s per-worktree git dir). From inside a session, the only in-command escape is an inline `AOFORGE_ALLOW_RAW_COMMIT=1 git commit …` prefix on every commit invocation: the hook decides before the command runs, so an `export` never reaches it. The env escape works only when set before Claude Code is launched.', 'AOFORGE_ALLOW_RAW_COMMIT=1'],
  'gate-edits.js': ['Enforcement', 'Strict DENY by default in ambient mode. Allows edits when a live `.aoforge/.skill-active` marker exists (resolved from both the local and the main checkout, so worktree-isolated agents are not denied by a marker they cannot see), when the PreToolUse payload\'s `agent_type` is an AOForge agent (`aoforge:<name>`), when the prompt carries an override phrase, or when the env escape is set. Targets outside the project root are never gated. Severity is per-project via `gates.editGate`. Bash writes to the same files are gated by `gate-bash-writes.js`.', 'AOFORGE_SKIP_EDIT_GATE=1'],
  'gate-bash-writes.js': ['Enforcement', 'Denies a Bash write to a tracked source file in ambient mode (redirect, `tee`, `sed -i`, `perl -i`, `cp`/`mv`, inline python/node), the same as Edit/Write. Commands that only mention a write (heredoc bodies, quoted arguments) and writes to `.aoforge/`, `*.md`, untracked files, paths outside the project and unresolvable targets are never gated. Same escapes as the Edit gate (live skill marker, `aoforge:<name>` agent, override phrase, which only a write that would be gated consumes). Severity is the least of `gates.editGate` and `gates.bashEditGate` (`strict` deny, `warn` ask, `off`). With no `bashEditGate` key the default is `warn`, measured at 633/17,957 = 0.035251 of ambient Bash calls (an upper bound, above the 0.02 threshold), so `strict` is opt-in; `gates.editGate` `warn` softens it to ask and `off` disables it. The env escape works only in the environment Claude Code was launched from, never as an inline command prefix. Needs an installed plugin carrying objective 60.', 'AOFORGE_SKIP_EDIT_GATE=1'],
  'gate-executor-stop.js': ['Enforcement', 'Blocks an `aoforge:executor` subagent once when it stops naturally and its TRD has no `<id>-SUMMARY.md` in any checkout (the local tree, REPO_ROOT, main checkouts and one `git worktree list`). The TRD is identified from the first user prompt of the agent transcript (`PLAN_ID:` / `exec-context check --id`, then `-TRD.md` paths, then embedded frontmatter); an ambiguous or unidentifiable prompt is never blocked. The reason tells the executor to finish, or at least write the `## Progress` checkpoint. Never blocks on the re-stop (`stop_hook_active`), outside an AOForge project, or after a deliberate checkpoint, escalation or preflight stop; fails open on any error.', 'AOFORGE_SKIP_EXECUTOR_STOP_GATE=1'],
  'gate-skill-requires.js': ['Enforcement', 'Refuses to start a `/aoforge:<skill>` whose SKILL.md `requires:` names a tool that is not on PATH (today only `/aoforge:gh-sync`, which needs `gh`). A typed command is blocked on UserPromptExpansion and a Skill tool call is denied on PreToolUse, each with the install hint and a pointer to `/aoforge:doctor` (check `skill-requires`). Not project-scoped, and the PATH lookup only stats files, so nothing is spawned. Anything that is not an AOForge skill with a declared tool is allowed, and any error fails open. The env escape works only in the environment Claude Code was launched from. Needs an installed plugin carrying objective 61.', 'AOFORGE_SKIP_SKILL_REQUIRES=1'],
  'auto-continue.js': ['Enforcement', 'Blocks the main loop once when it ends a turn right after announcing its own next step ("Writing the predicate.", "Ready for wave 4 on your word."): a skill marker must be live, no background task may be running, and the last sentence must be an announcement. Questions, ask phrases, `/aoforge:` hand-offs, waits and result reports never fire it. The reason tells the model to take the announced step now, or ask one explicit question. Never blocks on the re-stop (`stop_hook_active`) or outside an AOForge project; fails open.', 'AOFORGE_SKIP_AUTOCONTINUE=1'],
  'gate-interactive.js': ['Enforcement', 'Intercepts TTY-requiring commands and routes them to the handoff watcher rather than letting them hang on a prompt no one can answer.', null],
  'guard-no-progress.js': ['Enforcement', 'Detects the same tool being called with identical arguments repeatedly: warns at 3, escalates to `ask` at 5, and resets whenever the agent varies its approach. Step limits cannot catch a stuck loop — they only fire once the whole budget is spent.', 'AOFORGE_SKIP_PROGRESS_GUARD=1'],
  'changelog-on-tag.js': ['Enforcement', 'Blocks `git tag -a vX.Y.Z` unless CHANGELOG.md has a `## [X.Y.Z]` heading and the three release manifests carry matching versions.', 'AOFORGE_SKIP_CHANGELOG_GATE=1'],
  'verify-completion.js': ['Observability', 'Checks that the most recent SUMMARY.md carries task evidence and no failure markers. Warns only — never blocks.', null],
  'verify-commits.js': ['Observability', 'Warns when a subagent finishes without producing commits — a silent-failure detector for the executor.', null],
  'todo-sync.js': ['Observability', 'At every Stop, merges the session\'s `/aoforge:todo` items (TaskCreate/TaskUpdate or TodoWrite calls in the transcript) into the todo archive with the library behind `aof-tools todo sync`: `.aoforge/todos/` in local mode, a queued `aoforge:todo` issue in store mode. Idempotent: a second Stop over the same transcript changes nothing and prints nothing. Says what it did in one message (archived, completed, uncommitted todo files, or a failure line), never commits, never blocks, keeps no state and fails open.', 'AOFORGE_SKIP_TODO_SYNC=1'],
  'statusline.js': ['Observability', 'Renders model, current task, directory, and context usage in the Claude Code status line, plus estimated time remaining while an objective builds.', null],
  'inject-org-context.js': ['Session context', 'Injects an objective’s full org context — parent issue, repo roadmap, sibling repo activity — at planning time.', null],
  'inject-handoff-results.js': ['Session context', 'Surfaces completed handoff-watcher results back into the session.', null],
  'upgrade-project.js': ['Session context', 'Upgrades a behind AOForge project in place at session start: applies the safe migrations, then commits exactly the changed files in a detached background process (skipped during rebase/merge/cherry-pick/bisect, on a detached HEAD, over uncommitted edits other than the gitignored runtime-state files, or if signing fails). Notices are emitted once on the next prompt. It also prunes ~/.claude/aoforge/backups at most once per 24 h (older than 14 days, keeping the newest 5 per repo). It also starts a background `aof-tools transcript-export` at most once per 24 h, in every session, which keeps the per-session index under `~/.claude/aoforge/` current before Claude Code deletes old transcripts.', 'AOFORGE_SKIP_UPGRADE=1, AOFORGE_SKIP_PRUNE=1, AOFORGE_SKIP_TRANSCRIPT_EXPORT=1'],
};

const hooks = fs.readdirSync(path.join(PLUGIN, 'hooks'))
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
  .sort()
  .map((file) => {
    const [group, purpose, escape] = HOOK_DOCS[file] || ['Other', '', null];
    const reg = registered[file] || [];
    return {
      file,
      name: file.replace(/\.js$/, ''),
      group,
      purpose,
      escape,
      events: reg.map((r) => (r.matcher ? `${r.event} (${r.matcher})` : r.event)),
      registered: reg.length > 0,
      // statusline is wired through plugin.json rather than hooks.json.
      note: reg.length === 0 && file === 'statusline.js' ? 'Registered via plugin.json statusLine' : null,
    };
  });

// ── aof-tools command surface ──────────────────────────────────────────────
const dfToolsSrc = read(path.join(RUNTIME, 'bin', 'aof-tools.cjs'));
const topLevel = [...dfToolsSrc.matchAll(/^\s{4}case '([a-z0-9-]+)': \{$/gm)].map((m) => m[1]);
const subFor = (cmd) => {
  const start = dfToolsSrc.indexOf(`    case '${cmd}': {`);
  if (start === -1) return [];
  const next = topLevel
    .map((c) => dfToolsSrc.indexOf(`    case '${c}': {`))
    .filter((i) => i > start)
    .sort((a, b) => a - b)[0] || dfToolsSrc.length;
  const block = dfToolsSrc.slice(start, next);
  const subs = new Set();
  for (const m of block.matchAll(/sub(?:command)? === '([a-z0-9-]+)'/g)) subs.add(m[1]);
  for (const m of block.matchAll(/^\s{8}case '([a-z0-9-]+)':/gm)) subs.add(m[1]);
  return [...subs];
};
const dfTools = topLevel.sort().map((cmd) => ({ command: cmd, subcommands: subFor(cmd) }));

// ── workflows, references, templates ──────────────────────────────────────
const workflows = fs.readdirSync(path.join(RUNTIME, 'workflows'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => {
    const fm = parseFrontmatter(frontmatter(read(path.join(RUNTIME, 'workflows', f))));
    return { name: f.replace(/\.md$/, ''), status: fm.status || 'unknown' };
  });

const references = fs.readdirSync(path.join(RUNTIME, 'references'))
  .filter((f) => f.endsWith('.md')).sort().map((f) => f.replace(/\.md$/, ''));

const templates = fs.readdirSync(path.join(RUNTIME, 'templates')).sort();

// ── intent model: (kind, work) defaults table ─────────────────────────────
const defaultsMd = read(path.join(RUNTIME, 'references', 'defaults-table.md'));
const yamlBlock = defaultsMd.match(/```yaml\r?\n([\s\S]*?)```/);
const kinds = [];
const works = new Set();
if (yamlBlock) {
  for (const line of yamlBlock[1].split(/\r?\n/)) {
    const k = line.match(/^  ([a-z-]+):\s*$/);
    if (k && k[1] !== 'defaults') kinds.push(k[1]);
    const w = line.match(/^    ([a-z-]+):\s*$/);
    if (w) works.add(w[1]);
  }
}

// ── assemble ──────────────────────────────────────────────────────────────
const pkg = readJSON(path.join(ROOT, 'package.json'));
const manifest = readJSON(path.join(PLUGIN, '.claude-plugin', 'plugin.json'));

const data = {
  generatedAt: new Date().toISOString(),
  version: manifest.version,
  packageVersion: pkg.version,
  repo: 'AO-Cyber-Systems/aoforge-claude',
  marketplace: 'aoforge@aocyber',
  counts: {
    skills: skills.length,
    agents: agents.length,
    hooks: hooks.length,
    workflows: workflows.length,
    references: references.length,
    templates: templates.length,
    dfToolsCommands: dfTools.length,
  },
  skills,
  agents,
  hooks,
  dfTools,
  workflows,
  references,
  templates,
  models: profiles.models,
  profiles: ['quality', 'balanced', 'budget'],
  intent: { kinds, works: [...works] },
  config: readJSON(path.join(RUNTIME, 'templates', 'config.json')),
};

const outDir = path.join(ROOT, 'site', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'aoforge.json'), JSON.stringify(data, null, 2) + '\n');

console.log(
  `site/data/aoforge.json  v${data.version}  ` +
  Object.entries(data.counts).map(([k, v]) => `${k}=${v}`).join(' ')
);
