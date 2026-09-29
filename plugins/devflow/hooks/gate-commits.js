#!/usr/bin/env node

/**
 * DevFlow Commit Gate (PreToolUse, Bash)
 *
 * Blocks raw `git commit` invocations in DevFlow-initialized projects and
 * redirects Claude to use `df-tools.cjs commit` (which preserves objective
 * scope, task IDs, and updates STATE.md).
 *
 * Exceptions (pass through):
 *   - The command is already invoking df-tools.cjs commit.
 *   - DEVFLOW_ALLOW_RAW_COMMIT=1 in the HOOK's own env (set before Claude Code
 *     was launched) — the user's session-wide escape hatch, unchanged.
 *   - EVERY git-commit invocation in the command carries an inline
 *     `DEVFLOW_ALLOW_RAW_COMMIT=1` assignment prefix (optionally after `env`),
 *     parsed from the command text (objective 44, DF-02(c)). A PreToolUse hook
 *     decides BEFORE the command runs and never sees variables the command
 *     sets, so an earlier statement (`export X=1; git commit`, `X=1; git commit`)
 *     can never reach it; the inline prefix is the only in-command form it can
 *     read.
 *   - A merge, rebase or cherry-pick is in progress in the git dir of every
 *     commit invocation's target repo — MERGE_HEAD, REBASE_HEAD, rebase-merge/,
 *     rebase-apply/ or CHERRY_PICK_HEAD (objective 44, DF-02(b)). Finishing one
 *     needs a whole-index commit, which `df-tools commit`'s pathspec-scoped
 *     commit can't make. The git dir is resolved fs-only (no git spawn) from
 *     `git -C <path>` or cwd, following a linked worktree's `.git` file to its
 *     per-worktree git dir. An unresolvable target is "no op in progress".
 *
 * Fails open: any internal error exits 0 with no output.
 *
 * Detection is invocation-aware (TRD 27-04), not a substring test: heredoc
 * bodies and quoted arguments are stripped first, so writing a file or grepping
 * for text that merely MENTIONS the phrase is not treated as running it.
 *
 * NOTE: a commit-message prefix allowlist ("chore(release):", "docs:", "wip:")
 * was documented here but never implemented. Comment corrected in TRD 27-04
 * rather than silently widening the gate; add it deliberately if wanted.
 *
 * Non-DevFlow repos: pass through unchanged.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Remove heredoc BODIES from a command string (TRD 27-04).
 *
 * `cat > f <<'EOF' ... EOF` bodies are file content, not commands. Leaving them
 * in meant any script, doc, or test fixture whose text merely mentioned the raw
 * commit phrase was refused — reproduced live while writing the 2026-08-18
 * audit, where an analysis script containing it as a regex literal was blocked.
 */
function stripHeredocs(cmd) {
  return cmd.replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm,
    ' <<HEREDOC '
  );
}

/**
 * Blank out quoted string contents so a mention inside an argument (echo,
 * grep pattern, commit message body) is not read as an invocation.
 */
function stripQuoted(cmd) {
  return cmd
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/**
 * True when the command actually INVOKES git's commit subcommand.
 *
 * Matches `git commit` at a command position, tolerating git's global flags
 * (`-C <path>`, `-c k=v`, `--no-pager`, `--git-dir=`, `--work-tree=`, `-P`),
 * after heredoc bodies and quoted text have been removed.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
function invokesGitCommit(cmd) {
  const cleaned = stripQuoted(stripHeredocs(String(cmd || '')));
  const GLOBAL_FLAG = String.raw`(?:-C\s+\S+|-c\s+\S+|--no-pager|--git-dir=\S+|--work-tree=\S+|-P)`;
  const re = new RegExp(
    String.raw`(?:^|[;&|(]|\s)git(?:\s+${GLOBAL_FLAG})*\s+commit(?:\s|$|;|&)`
  );
  return re.test(cleaned);
}

// ---------------------------------------------------------------------------
// Objective 44 (AUT-04) — per-invocation parsing
// ---------------------------------------------------------------------------

/**
 * Blank quoted-string CONTENTS without moving anything: the quote characters
 * stay and every character between them becomes `_`. Offsets into the result
 * are offsets into the input, so a word can be located in the masked text
 * (where quoting can neither fake a separator nor an invocation, exactly as
 * with stripQuoted) and then read back verbatim from the unmasked text.
 */
function maskQuoted(cmd) {
  return cmd.replace(
    /'[^']*'|"(?:[^"\\]|\\[\s\S])*"/g,
    (m) => m[0] + '_'.repeat(m.length - 2) + m[m.length - 1]
  );
}

/** Remove one level of shell quoting from a single word (best effort). */
function unquoteWord(word) {
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const c = word[i];
    if (c === "'") {
      const j = word.indexOf("'", i + 1);
      const end = j === -1 ? word.length : j;
      out += word.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      while (j < word.length && word[j] !== '"') {
        if (word[j] === '\\' && '$`"\\'.includes(word[j + 1] || '')) j++;
        out += word[j];
        j++;
      }
      i = j;
    } else if (c === '\\' && i + 1 < word.length) {
      out += word[++i];
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * Resolve a raw (still-quoted) path word against `base`. Returns null when the
 * word can't be resolved statically — any `$` or backtick expansion — so the
 * caller treats the target as unknown rather than guessing.
 */
function resolvePathWord(raw, base) {
  if (typeof raw !== 'string' || /[$`]/.test(raw)) return null;
  let p = unquoteWord(raw);
  if (p === '') return null;
  if (raw === '~' || raw.startsWith('~/')) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(base, p);
}

/**
 * Every git-commit invocation in `cmd`, one entry per invocation.
 *
 * Heredoc bodies are removed and quoted text masked first (the TRD 27-04
 * cleaning), then the command is split into simple commands on `&&`, `||`,
 * `;`, `&`, `|`, `(`, `)` and newline (`&&`/`||` are matched before the single
 * characters). A backslash-newline continuation stays inside one simple command.
 *
 * @param {string} cmd
 * @returns {Array<{prefix: string[], cWords: string[], gitDirWord: string|null}>}
 *   prefix     — the (masked) words before `git` in its simple command
 *   cWords     — raw `-C` operands, in order
 *   gitDirWord — raw `--git-dir=` value, or null
 */
function commitInvocations(cmd) {
  const src = stripHeredocs(String(cmd || '')).replace(/\\\n/g, '  ');
  const masked = maskQuoted(src);

  const segments = [];
  const sep = /&&|\|\||[;&|()\n]/g;
  let start = 0;
  let m;
  while ((m = sep.exec(masked)) !== null) {
    segments.push([start, m.index]);
    start = m.index + m[0].length;
  }
  segments.push([start, masked.length]);

  const found = [];
  for (const [s, e] of segments) {
    const words = [];
    const wordRe = /\S+/g;
    const seg = masked.slice(s, e);
    let w;
    while ((w = wordRe.exec(seg)) !== null) {
      const at = s + w.index;
      words.push({ masked: w[0], raw: src.slice(at, at + w[0].length) });
    }

    for (let k = 0; k < words.length; k++) {
      if (words[k].masked !== 'git') continue;
      const cWords = [];
      let gitDirWord = null;
      let j = k + 1;
      while (j < words.length) {
        const t = words[j].masked;
        if ((t === '-C' || t === '-c') && j + 1 < words.length) {
          if (t === '-C') cWords.push(words[j + 1].raw);
          j += 2;
        } else if (t === '--no-pager' || t === '-P' || t.startsWith('--work-tree=')) {
          j += 1;
        } else if (t.startsWith('--git-dir=')) {
          gitDirWord = words[j].raw.slice('--git-dir='.length);
          j += 1;
        } else {
          break;
        }
      }
      if (j < words.length && words[j].masked === 'commit') {
        found.push({ prefix: words.slice(0, k).map((x) => x.masked), cWords, gitDirWord });
      }
    }
  }
  return found;
}

const ALLOW_VAR = 'DEVFLOW_ALLOW_RAW_COMMIT';
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

/**
 * The words before `git` are only `NAME=value` assignments (after at most one
 * leading `env`), and the effective (last) DEVFLOW_ALLOW_RAW_COMMIT assignment
 * among them is exactly `=1`.
 */
function prefixAllows(prefix) {
  let i = prefix[0] === 'env' ? 1 : 0;
  let value = null;
  for (; i < prefix.length; i++) {
    const a = ASSIGNMENT.exec(prefix[i]);
    if (!a) return false;
    if (a[1] === ALLOW_VAR) value = a[2];
  }
  return value === '1';
}

/**
 * True only when the command invokes git commit at least once and EVERY
 * invocation carries an inline `DEVFLOW_ALLOW_RAW_COMMIT=1` prefix in its own
 * simple command. Not a substring test: `export X=1; git commit`,
 * `X=1; git commit`, `echo X=1 && git commit` and a heredoc or quoted mention
 * all return false.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
function hasInlineAllowPrefix(cmd) {
  const invocations = commitInvocations(cmd);
  return invocations.length > 0 && invocations.every((inv) => prefixAllows(inv.prefix));
}

/**
 * The directory an invocation runs in after its `-C` operands (each relative
 * to the previous, as git does). Null when an operand can't be resolved.
 */
function invocationDir(inv, cwd) {
  let dir = cwd;
  for (const w of inv.cWords) {
    dir = resolvePathWord(w, dir);
    if (!dir) return null;
  }
  return dir;
}

/**
 * The `git -C <path>` operand of the command's first git-commit invocation,
 * resolved against `cwd` (chained `-C`s resolve cumulatively). Null when that
 * invocation has no `-C`, or it can't be resolved statically.
 *
 * @param {string} cmd
 * @param {string} [cwd]
 * @returns {string|null}
 */
function gitCPath(cmd, cwd = process.cwd()) {
  const inv = commitInvocations(cmd)[0];
  if (!inv || inv.cWords.length === 0) return null;
  return invocationDir(inv, cwd);
}

/**
 * Walk up from `start` to the nearest `.git`. A directory is the git dir; a
 * FILE (linked worktree) holds `gitdir: <path>` naming the PER-WORKTREE git
 * dir, which is where that worktree's MERGE_HEAD etc. live — deliberately not
 * the common dir. A relative `gitdir:` resolves against the file's directory.
 * fs-only: hooks run on every Bash call and must stay cheap.
 *
 * @param {string} start
 * @returns {string|null} the git dir, or null when none can be resolved
 */
function resolveGitDir(start) {
  try {
    if (typeof start !== 'string' || !start) return null;
    let dir = path.resolve(start);
    if (!fs.existsSync(dir)) return null;
    for (;;) {
      const dotGit = path.join(dir, '.git');
      let st = null;
      try { st = fs.statSync(dotGit); } catch { /* not here — keep walking */ }
      if (st) {
        if (st.isDirectory()) return dotGit;
        if (!st.isFile()) return null;
        const g = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'));
        return g ? path.resolve(dir, g[1]) : null;
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch {
    return null;
  }
}

/**
 * The git operation in progress in `gitDir`, from the markers git leaves while
 * one is paused waiting for a commit.
 *
 * @param {string|null} gitDir
 * @returns {'merge'|'rebase'|'cherry-pick'|null}
 */
function gitOpInProgress(gitDir) {
  if (typeof gitDir !== 'string' || !gitDir) return null;
  const has = (name) => {
    try { return fs.existsSync(path.join(gitDir, name)); } catch { return false; }
  };
  if (has('MERGE_HEAD')) return 'merge';
  if (has('REBASE_HEAD') || has('rebase-merge') || has('rebase-apply')) return 'rebase';
  if (has('CHERRY_PICK_HEAD')) return 'cherry-pick';
  return null;
}

/** The git dir one invocation commits into, or null when unknown. */
function invocationGitDir(inv, cwd) {
  const dir = invocationDir(inv, cwd);
  if (!dir) return null;
  if (inv.gitDirWord !== null) return resolvePathWord(inv.gitDirWord, dir);
  return resolveGitDir(dir);
}

/**
 * True when EVERY commit invocation targets a repo with a merge, rebase or
 * cherry-pick in progress. With no parseable invocation, falls back to cwd.
 */
function allTargetsMidOperation(cmd, cwd) {
  const invocations = commitInvocations(cmd);
  const gitDirs = invocations.length > 0
    ? invocations.map((inv) => invocationGitDir(inv, cwd))
    : [resolveGitDir(cwd)];
  return gitDirs.every((d) => gitOpInProgress(d) !== null);
}

const DENY_MESSAGE = [
  'DevFlow project detected. Raw `git commit` is blocked.',
  'Use `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` so the commit is scoped to the active task/plan and STATE.md stays consistent.',
  'Commit format: `{type}({objective}-{trd}): {task}` (see devflow/references/git-integration.md).',
  'Merge, rebase and cherry-pick completions are allowed automatically.',
  'To bypass for one commit, put the assignment on the same command: `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …`.',
  'That inline prefix is the only in-command form this hook can see; setting the variable in an earlier statement of the command never reaches it.',
].join(' ');

function deny(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function main() {
  try {
    run();
  } catch {
    // Fail open: a gate bug must never block the user's command.
  }
}

function run() {
  if (process.env.DEVFLOW_ALLOW_RAW_COMMIT === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  // Only gate an actual git-commit INVOCATION (TRD 27-04).
  // Previously a substring test, which fired on any command merely containing
  // the phrase — including heredoc bodies writing a file that mentions it.
  if (!invokesGitCommit(cmd)) return;

  // Allow df-tools commit wrapper
  if (/df-tools\.cjs\s+commit\b/.test(cmd)) return;

  // Objective 44 (DF-02(c)) — inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …`
  // on EVERY invocation. Parsed from the text: the hook can't see the env the
  // command will build.
  if (hasInlineAllowPrefix(cmd)) return;

  // Objective 44 (DF-02(b)) — finishing a merge/rebase/cherry-pick needs a
  // whole-index commit that df-tools commit can't make.
  if (allTargetsMidOperation(cmd, process.cwd())) return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return; // Not a DevFlow project — pass through

  // 23-02: gate on ROADMAP.md or objectives/ — both are created only by new-project,
  // so either presence proves DevFlow initialization. STATE.md check removed: it was
  // absent on brand-new projects (post-init, pre-first-execution), bypassing the gate.
  const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
  const objectivesDirExists = fs.existsSync(path.join(planningDir, 'objectives'));
  if (!roadmapExists && !objectivesDirExists) return; // Planning dir exists but uninitialized

  deny(DENY_MESSAGE);
}

if (require.main === module) main();

module.exports = {
  invokesGitCommit,
  stripHeredocs,
  stripQuoted,
  hasInlineAllowPrefix,
  gitCPath,
  resolveGitDir,
  gitOpInProgress,
  DENY_MESSAGE,
};
