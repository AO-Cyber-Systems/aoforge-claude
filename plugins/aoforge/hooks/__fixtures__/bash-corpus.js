'use strict';

/**
 * A hand-built corpus of Bash commands and an isolated fixture project, for proving that the one-process
 * PreToolUse(Bash) dispatcher (hooks/pre-bash.js) decides exactly what the five dispatched hooks decide when each
 * runs as its own process (TRD 79-03). Used by hooks/pre-bash-equivalence.test.js.
 *
 * Not a test file: no `*.test.js` glob picks it up. Plain CommonJS, synchronous fs, no dependencies.
 *
 * Shapes this file writes, read from the code (TRD 79-03 Task 1; where the code differs from the TRD's context, the
 * code is followed and the difference is named here):
 *   - `.aoforge/config.json`: `{ github: { store: false }, gates: { bashEditGate } }`. Local mode is store off.
 *     gate-edits.readEditGateMode: `gates.editGate` unset means strict. bash-write-gate.readBashEditGate:
 *     `gates.bashEditGate` unset means BASH_EDIT_GATE_DEFAULT (warn). The Bash write gate applies the LEAST severe
 *     of the two (effectiveBashMode), so the default fixture asks and `bashEditGate: 'strict'` denies.
 *   - `.aoforge/ROADMAP.md`: gate-commits denies only when `.aoforge/ROADMAP.md` or `.aoforge/objectives/` exists
 *     (TRD 23-02). The TRD's context names only config.json; without ROADMAP.md the commit gate never fires.
 *   - `.aoforge/.skill-active`: `{ skill, started_at, pid, expires_at }`, the shape skill-active.cjs startSkill
 *     writes. gate-edits.hasSkillActiveMarker reads only `expires_at` (in the past: expired; absent: never expires).
 *   - `.aoforge/.edit-override`: `{ created_at }` (hooks/lib/edit-override.js). Freshness is the file's mtime
 *     (5 minutes); gate-bash-writes consumes it only for a write it would otherwise gate.
 *   - the aoforge-watch pid file: `{ pid, shell, watching, started_at }` (watcher-state.cjs), read from
 *     $AOFORGE_HANDOFF_PID_FILE when that is set. With no pid file (a scratch HOME) the watcher is absent.
 *   - `.git/MERGE_HEAD`: the HEAD sha. gate-commits treats MERGE_HEAD, rebase-merge/, rebase-apply/ or
 *     CHERRY_PICK_HEAD in the target repo's git dir as an operation in progress.
 *
 * Where the gates read their directory: gate-commits, changelog-on-tag, gate-interactive and guard-no-progress use
 * process.cwd(); gate-bash-writes uses the payload's absolute `cwd`. Both sides of the comparison spawn with
 * cwd = payload cwd = the project root.
 *
 * gate-interactive, as objective 73 rewrote it, does not gate `ssh host` or `vim a.txt`: neither is in
 * lib/interactive-commands.cjs INTERACTIVE_PATTERNS (TTY: doctl/gcloud/gh auth, aws configure/sso, op signin, npm
 * login, vault login, passwd, ssh-keygen; shell-flow: nvm, pyenv, conda, direnv, mise, asdf, rbenv). The TRD's
 * `ssh host` family therefore uses `gh auth login`, and `ssh host` / `vim a.txt` stay in the corpus as silent cases.
 * changelog-on-tag's TAG_RE makes `-a` optional, so a lightweight `git tag v9.9.9` is gated like an annotated one.
 *
 * Placeholders: `<P>` in a command or an env value is the project root, `<H>` the scratch home.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const AUTHOR = {
  GIT_AUTHOR_NAME: 'Corpus',
  GIT_AUTHOR_EMAIL: 'corpus@example.invalid',
  GIT_COMMITTER_NAME: 'Corpus',
  GIT_COMMITTER_EMAIL: 'corpus@example.invalid',
};

/** process.env without any AOFORGE_* or GIT_* variable: the session running the suite may carry escapes. */
function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('AOFORGE_') || k.startsWith('GIT_')) continue;
    env[k] = v;
  }
  return env;
}

function git(root, args, env) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
    cwd: root, env, encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${root}: ${r.stderr || r.error}`);
  return r.stdout.trim();
}

/**
 * A fresh, isolated fixture project.
 *
 * @param {{merging?: boolean, marker?: boolean, bashEditGate?: string, aoforge?: boolean}} [opts]
 * @returns {{base: string, root: string, home: string, guardDir: string, env: object}}
 *   base     the mktemp directory holding the other three (cleanup removes it)
 *   root     a git repo on `main` with a tracked src/a.cjs and CHANGELOG.md (`## [9.9.8]`), one commit, branch `side`
 *   home     the scratch HOME (empty)
 *   guardDir the progress-guard state directory (AOFORGE_PROGRESS_GUARD_DIR)
 *   env      process.env minus every AOFORGE_* and GIT_* variable, with HOME=home,
 *            AOFORGE_PROGRESS_GUARD_DIR=guardDir and git's global and system config turned off
 */
function makeProject({ merging = false, marker = false, bashEditGate, aoforge = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bash-corpus-'));
  const root = path.join(base, 'proj');
  const home = path.join(base, 'home');
  const guardDir = path.join(base, 'guard');
  for (const d of [root, home, guardDir]) fs.mkdirSync(d, { recursive: true });

  const env = {
    ...cleanEnv(),
    HOME: home,
    AOFORGE_PROGRESS_GUARD_DIR: guardDir,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const gitEnv = { ...env, ...AUTHOR };

  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.cjs'), "'use strict';\nmodule.exports = 'a';\n");
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [9.9.8] - 2026-01-01\n\n- corpus fixture\n');
  if (aoforge) {
    const plan = path.join(root, '.aoforge');
    fs.mkdirSync(plan, { recursive: true });
    const config = { github: { store: false } };
    if (bashEditGate) config.gates = { bashEditGate };
    fs.writeFileSync(path.join(plan, 'config.json'), JSON.stringify(config, null, 2) + '\n');
    fs.writeFileSync(path.join(plan, 'ROADMAP.md'), '# Roadmap\n');
  }

  git(root, ['init', '-q', '-b', 'main'], gitEnv);
  git(root, ['add', '-A'], gitEnv);
  git(root, ['commit', '-q', '-m', 'corpus fixture'], gitEnv);
  git(root, ['branch', 'side'], gitEnv);

  if (merging) {
    const head = git(root, ['rev-parse', 'HEAD'], gitEnv);
    fs.writeFileSync(path.join(root, '.git', 'MERGE_HEAD'), head + '\n');
  }
  if (marker && aoforge) {
    // Written after the commit: .skill-active is never tracked.
    const now = Date.now();
    fs.writeFileSync(path.join(root, '.aoforge', '.skill-active'), JSON.stringify({
      skill: 'execute-objective',
      started_at: new Date(now).toISOString(),
      pid: process.pid,
      expires_at: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
    }));
  }
  return { base, root, home, guardDir, env };
}

/** Replace the `<P>` and `<H>` placeholders with this project's paths. */
function fill(text, project) {
  return String(text).split('<P>').join(project.root).split('<H>').join(project.home);
}

/**
 * The PreToolUse payload Claude Code sends for a Bash call, as an object.
 *
 * @param {{root: string, base: string}} project
 * @param {string} command `<P>` and `<H>` are filled in
 * @param {string} [session]
 */
function payload(project, command, session = 'corpus') {
  return {
    session_id: session,
    transcript_path: path.join(project.base, 'transcript.jsonl'),
    cwd: project.root,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: fill(command, project) },
  };
}

/** The stdin and env one corpus case is run with, against one project. */
function caseInput(c, project, session = 'corpus') {
  const env = { ...project.env };
  for (const [k, v] of Object.entries(c.env || {})) env[k] = fill(v, project);
  let stdin;
  if (typeof c.stdin === 'string') stdin = c.stdin;
  else stdin = JSON.stringify({ ...payload(project, c.command || '', session), ...(c.extra || {}) });
  return { stdin, env };
}

/** Write a watcher pid file naming a live process (this one) for the "daemon live" branch of gate-interactive. */
function liveWatcher(project) {
  fs.writeFileSync(path.join(project.home, 'watch.pid'), JSON.stringify({
    pid: process.pid, shell: '/bin/zsh', watching: [], started_at: new Date().toISOString(),
  }));
}

/** A fresh single-turn override marker, as route-intent.js writes it for "skip aoforge". */
function overrideMarker(project) {
  fs.writeFileSync(path.join(project.root, '.aoforge', '.edit-override'), JSON.stringify({ created_at: new Date().toISOString() }));
}

/**
 * The corpus. Each entry: { id, category, why, command, expect, reasons?, project?, setup?, env?, extra?, stdin? }.
 *   expect   the merged permissionDecision the code gives ('deny' | 'ask'), or null for a silent pass
 *   reasons  when given, how many reasons the merged decision carries (combined cases: every deny kept, an ask
 *            dropped under a deny)
 *   project  makeProject options; setup(project) runs on both sides' projects after it
 *   env      added to the child env (values may use `<P>` / `<H>`); extra is merged into the payload;
 *            stdin, when a string, replaces the payload entirely
 * Every command is hand-written. Nothing is generated.
 */
const CORPUS = [
  // ── benign ──
  { id: 'benign-ls', category: 'benign', expect: null, command: 'ls -la',
    why: 'the most common Bash call: every hook must stay silent' },
  { id: 'benign-rg', category: 'benign', expect: null, command: 'rg -n foo src',
    why: 'a read-only search over tracked source is neither a write nor a commit' },
  { id: 'benign-node-test', category: 'benign', expect: null, command: 'node --test x.test.cjs',
    why: 'a test run touches no gate' },
  { id: 'benign-quoted-commit', category: 'benign', expect: null, command: 'echo "git commit -m x"',
    why: 'a quoted mention of git commit is data, not an invocation (TRD 27-04)' },
  { id: 'benign-heredoc-commit', category: 'benign', expect: null, command: "cat <<'EOF'\ngit commit -m x\nEOF",
    why: 'a heredoc body fed to cat is data: gate-commits strips heredoc bodies' },

  // ── commits ──
  { id: 'commit-raw', category: 'commits', expect: 'deny', command: 'git commit -m x',
    why: 'a raw git commit in an AOForge project is denied with the aof-tools commit message' },
  { id: 'commit-dash-c', category: 'commits', expect: 'deny', command: 'git -C <P> commit -m x',
    why: 'git -C <path> commit is still a commit invocation, resolved to the project' },
  { id: 'commit-inline-allow', category: 'commits', expect: null, command: 'AOFORGE_ALLOW_RAW_COMMIT=1 git commit -m x',
    why: 'the inline assignment prefix on the same simple command is the one in-command escape' },
  { id: 'commit-merge-head', category: 'commits', expect: null, command: 'git commit --no-edit', project: { merging: true },
    why: 'finishing a merge (MERGE_HEAD present) needs a whole-index commit, so it passes' },
  { id: 'commit-merge-chain', category: 'commits', expect: 'deny', command: 'git merge side && git commit --no-edit',
    why: 'a merge chained with commit in one call stays denied, with the separate-call hint (TRD 53-04)' },
  { id: 'commit-non-aoforge', category: 'commits', expect: null, command: 'git commit -m x', project: { aoforge: false },
    why: 'outside an AOForge project the commit gate passes everything' },

  // ── tags ──
  { id: 'tag-missing-section', category: 'tags', expect: 'deny', command: 'git tag -a v9.9.9 -m x',
    why: 'CHANGELOG.md has no ## [9.9.9]: the tag gate denies and names changelog update' },
  { id: 'tag-present-section', category: 'tags', expect: null, command: 'git tag -a v9.9.8 -m x',
    why: 'CHANGELOG.md has ## [9.9.8] and the fixture has no release manifests: the tag passes' },
  { id: 'tag-lightweight', category: 'tags', expect: 'deny', command: 'git tag v9.9.9',
    why: 'TAG_RE makes -a optional, so a lightweight tag is gated like an annotated one' },
  { id: 'tag-commitish', category: 'tags', expect: 'deny', command: 'git tag -a v9.9.9 -m x HEAD',
    why: 'a commit-ish makes the gate read CHANGELOG.md through git show inside the hook (a child process)' },

  // ── interactive (objective 73's gate-interactive) ──
  { id: 'int-gh-auth', category: 'interactive', expect: 'deny', command: 'gh auth login',
    why: 'a TTY login is denied, queued as a pending record, and the reason asks for `! gh auth login`' },
  { id: 'int-ssh-host', category: 'interactive', expect: null, command: 'ssh host',
    why: 'ssh is not an interactive pattern on the merged tree (the TRD context assumed it was): silent' },
  { id: 'int-vim', category: 'interactive', expect: null, command: 'vim a.txt',
    why: 'an editor is not an interactive pattern either: silent' },
  { id: 'int-keygen-fingerprint', category: 'interactive', expect: null, command: 'ssh-keygen -l -f key.pub',
    why: 'ssh-keygen -l (fingerprint) never prompts and passes' },
  { id: 'int-keygen-find', category: 'interactive', expect: null, command: 'ssh-keygen -F host',
    why: 'ssh-keygen -F (find in known_hosts) never prompts and passes' },
  { id: 'int-keygen-remove', category: 'interactive', expect: null, command: 'ssh-keygen -R host',
    why: 'ssh-keygen -R (remove from known_hosts) never prompts and passes' },
  { id: 'int-keygen-y', category: 'interactive', expect: 'deny', command: 'ssh-keygen -y -f key',
    why: 'ssh-keygen -y without -P prompts for the passphrase: handed off' },
  { id: 'int-keygen-y-p', category: 'interactive', expect: null, command: "ssh-keygen -y -P 'pw' -f key",
    why: 'ssh-keygen -y with -P has its passphrase: passes' },
  { id: 'int-quoted-name', category: 'interactive', expect: null, command: '"gh" auth login',
    why: 'a quoted command name is not matched (objective 73 limit, listed in CLAUDE.md)' },
  { id: 'int-bash-c', category: 'interactive', expect: null, command: "bash -c 'gh auth login'",
    why: 'a bash -c string body is not read (objective 73 limit)' },
  { id: 'int-heredoc-shell', category: 'interactive', expect: 'deny', command: "bash <<'EOF'\ngh auth login\nEOF",
    why: 'a heredoc fed to a shell is code, read one level deep, and the reason names the call' },
  { id: 'int-heredoc-data', category: 'interactive', expect: null, command: "cat <<'EOF'\ngh auth login\nEOF",
    why: 'a heredoc fed to cat is data' },
  { id: 'int-env-prefix', category: 'interactive', expect: null, command: 'env FOO=1 gh auth login',
    why: 'an env prefix hides the command name from the matcher (objective 73 limit)' },
  { id: 'int-compound', category: 'interactive', expect: 'deny', command: 'echo start && gh auth login',
    why: 'with more than one call the reason names the call that matched' },
  { id: 'int-shell-flow', category: 'interactive', expect: 'deny', command: 'nvm use 20',
    why: 'a shell-flow command (nvm is a shell function) is handed off too, category shell-flow' },
  { id: 'int-watcher-live', category: 'interactive', expect: 'deny', command: 'gh auth login',
    env: { AOFORGE_HANDOFF_PID_FILE: '<H>/watch.pid' }, setup: liveWatcher,
    extra: { agent_id: 'agent-corpus' },
    why: 'a live aoforge-watch daemon switches the reason to "queued", and the record carries session and agent ids' },

  // ── Bash writes ──
  { id: 'write-sed-tracked', category: 'writes', expect: 'ask', command: "sed -i '' 's/a/b/' src/a.cjs",
    why: 'an in-place edit of a tracked file in ambient mode asks (bashEditGate default warn)' },
  { id: 'write-redirect-tracked', category: 'writes', expect: 'ask', command: 'echo x > src/a.cjs',
    why: 'a redirect onto a tracked file asks' },
  { id: 'write-untracked', category: 'writes', expect: null, command: 'echo x > notes.txt',
    why: 'a file git does not track is never gated' },
  { id: 'write-planning', category: 'writes', expect: null, command: 'echo x > .aoforge/x.md',
    why: '.aoforge/ and *.md are never gated' },
  { id: 'write-skill-marker', category: 'writes', expect: null, command: 'echo x > src/a.cjs', project: { marker: true },
    why: 'a live skill marker is the edit gate escape, for Bash writes too' },
  { id: 'write-strict', category: 'writes', expect: 'deny', command: 'echo x > src/a.cjs', project: { bashEditGate: 'strict' },
    why: 'gates.bashEditGate strict (editGate unset counts as strict) denies' },
  { id: 'write-aoforge-agent', category: 'writes', expect: null, command: 'echo x > src/a.cjs',
    extra: { agent_type: 'aoforge:executor' },
    why: 'an aoforge:* agent is exempt from the Bash write gate' },
  { id: 'write-override-marker', category: 'writes', expect: null, command: 'echo x > src/a.cjs', setup: overrideMarker,
    why: 'a fresh override marker exempts the write and is consumed by it' },

  // ── escapes (env, set where Claude Code was launched) ──
  { id: 'esc-interactive', category: 'escapes', expect: null, command: 'gh auth login',
    env: { AOFORGE_SKIP_INTERACTIVE_GATE: '1' },
    why: 'AOFORGE_SKIP_INTERACTIVE_GATE=1 turns the interactive gate off' },
  { id: 'esc-raw-commit', category: 'escapes', expect: null, command: 'git commit -m x',
    env: { AOFORGE_ALLOW_RAW_COMMIT: '1' },
    why: 'AOFORGE_ALLOW_RAW_COMMIT=1 in the hook env is the session-wide commit escape' },
  { id: 'esc-edit-gate', category: 'escapes', expect: null, command: 'echo x > src/a.cjs',
    env: { AOFORGE_SKIP_EDIT_GATE: '1' },
    why: 'AOFORGE_SKIP_EDIT_GATE=1 turns the Bash write gate off' },
  { id: 'esc-changelog', category: 'escapes', expect: null, command: 'git tag -a v9.9.9 -m x',
    env: { AOFORGE_SKIP_CHANGELOG_GATE: '1' },
    why: 'AOFORGE_SKIP_CHANGELOG_GATE=1 turns the tag gate off' },

  // ── combined (more than one hook speaks) ──
  { id: 'combo-commit-interactive', category: 'combined', expect: 'deny', reasons: 2,
    command: 'git commit -m x && gh auth login',
    why: 'two denials (gate-commits, gate-interactive): both reasons are kept' },
  { id: 'combo-write-interactive', category: 'combined', expect: 'deny', reasons: 1,
    command: 'echo x > src/a.cjs && gh auth login',
    why: 'ask (write) and deny (interactive): the deny wins and the ask reason is dropped' },
  { id: 'combo-tag-commit', category: 'combined', expect: 'deny', reasons: 2,
    command: 'git tag -a v9.9.9 -m x && git commit -m y',
    why: 'two denials from changelog-on-tag and gate-commits' },

  // ── input edges ──
  { id: 'edge-empty-stdin', category: 'input', expect: null, stdin: '',
    why: 'empty stdin: every hook treats it as no payload' },
  { id: 'edge-non-json', category: 'input', expect: null, stdin: 'not json {',
    why: 'garbage stdin: every hook fails open' },
  { id: 'edge-json-null', category: 'input', expect: null, stdin: 'null',
    why: 'JSON null parses but is not a payload (TRD 63-05)' },
  { id: 'edge-read-tool', category: 'input', expect: null, command: '',
    extra: { tool_name: 'Read', tool_input: { file_path: 'src/a.cjs' } },
    why: 'a non-Bash payload: the Bash gates pass and guard-no-progress counts it once' },
  { id: 'edge-no-command', category: 'input', expect: null, command: '', extra: { tool_input: {} },
    why: 'a Bash payload with no command' },
];

/**
 * Sequences: the same call several times in one session, compared step by step (the progress guard counts calls).
 * expect[i] is the decision at step i+1; warn marks a step that must carry the guard's stderr warning.
 */
const SEQUENCES = [
  { id: 'repeat-ls', command: 'ls -la', calls: 5, expect: [null, null, null, null, 'ask'], warnAt: 3,
    why: 'guard-no-progress warns on stderr at the 3rd identical call and asks at the 5th, counted once per call' },
  { id: 'repeat-commit', command: 'git commit -m x', calls: 5, expect: ['deny', 'deny', 'deny', 'deny', 'deny'], warnAt: 3,
    why: 'the commit deny outranks the guard ask at step 5; the step-3 warning still reaches stderr' },
];

/**
 * Text with this project's paths and the random handoff ids made comparable across two projects:
 *   project root (and its realpath) -> <P>, scratch home -> <H>, guard dir -> <G>, the mktemp base -> <B>,
 *   a handoff id `h-` + 8 hex -> <ID>.
 */
function normalize(text, project) {
  let out = String(text === undefined || text === null ? '' : text);
  const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
  const pairs = [];
  for (const [p, tag] of [[project.root, '<P>'], [project.home, '<H>'], [project.guardDir, '<G>'], [project.base, '<B>']]) {
    pairs.push([real(p), tag], [p, tag]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  for (const [p, tag] of pairs) out = out.split(p).join(tag);
  return out.replace(/\bh-[0-9a-f]{8}\b/g, '<ID>');
}

/** Remove a project made by makeProject. */
function cleanup(project) {
  if (project && project.base) fs.rmSync(project.base, { recursive: true, force: true });
}

module.exports = {
  CORPUS,
  SEQUENCES,
  makeProject,
  payload,
  caseInput,
  normalize,
  cleanup,
  cleanEnv,
  liveWatcher,
  overrideMarker,
};
