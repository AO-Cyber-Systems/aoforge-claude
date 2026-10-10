'use strict';

/**
 * interactive-commands.cjs — TRD 73-10
 *
 * The one per-invocation matcher for commands that need the user's own shell:
 * a TTY prompt (auth logins, passwd, a key passphrase) or the user's shell
 * environment (nvm, pyenv, conda, direnv, mise, asdf, rbenv).
 *
 * What is matched: each SIMPLE COMMAND of the text, as shell-words.parseCommand
 * splits it (TRD 60-01, the primitives gate-commits and the Bash write detector
 * use). So:
 *   - quoted text and heredoc bodies are data: `rg "a|x" f`, `echo 'x'` and
 *     `cat > notes.md <<'EOF'` never reach a pattern;
 *   - a heredoc fed to a shell (`bash <<'EOF'`, sh, zsh, dash, ksh) is code: its
 *     body is read as commands, one level deep;
 *   - every call is matched on its own, its skip flags are read from its own
 *     words, and a hit carries `segment`, the call that matched, so a reason can
 *     name it when the command has more than one call;
 *   - ssh-keygen's read-only forms (-l, -F, -R) never prompt and pass, and a
 *     given passphrase (-N, or -P with -y) passes.
 * An unterminated quote parses to nothing, so nothing is gated (fail open).
 *
 * Consumers:
 *   - hooks/gate-interactive.js decides what to hand off to the user's shell. It
 *     requires this module fail-open and re-exports it.
 *   - the watch daemon's allowlist (lib/watcher-allowlist.cjs) must accept
 *     exactly what this module gates; TRD 73-12 switches it to this module and
 *     pins that against __fixtures__/interactive-command-cases.cjs. Each
 *     pattern's `label` is the daemon's label for the same command.
 *
 * A plain require of shell-words: the hook's try/catch is the fail-open boundary.
 */

const path = require('path');
const shell = require('./shell-words.cjs');

// CMD_POS: the old command-position prefix (start of string, or a separator ; & | ( newline, && or ||). Detection no
// longer uses it; it stays exported because the hook exported it and the daemon allowlist's deny list builds on it.
const CMD_POS = /(?:^\s*|[;&|\n(]\s*|&&\s*|\|\|\s*)/.source;

// ssh-keygen options that take an argument (OpenBSD ssh-keygen.c getopt string). An argument-taking letter consumes the
// rest of its cluster, or the next word when it ends the cluster.
const SSH_KEYGEN_ARG_FLAGS = 'abCDEFfIJjMmNnOPRrSsTtVWwYZz';

/**
 * The option letters of one ssh-keygen call, getopt style.
 *
 * @param {string[]} args unquoted words after the command name
 * @returns {Set<string>}
 */
function sshKeygenFlags(args) {
  const flags = new Set();
  const words = Array.isArray(args) ? args : [];
  for (let i = 0; i < words.length; i++) {
    const w = String(words[i]);
    if (w === '--') break;
    if (!/^-[A-Za-z]/.test(w)) continue;
    for (let k = 1; k < w.length; k++) {
      flags.add(w[k]);
      if (SSH_KEYGEN_ARG_FLAGS.includes(w[k])) {
        if (k === w.length - 1) i++;
        break;
      }
    }
  }
  return flags;
}

/** True when this ssh-keygen call cannot prompt for a passphrase. */
function sshKeygenNeverPrompts(args) {
  const f = sshKeygenFlags(args);
  if (f.has('l') || f.has('F') || f.has('R')) return true; // fingerprint / find / remove: never prompt
  if (f.has('y')) return f.has('P'); // reads a private key: prompts unless -P gives its passphrase
  return f.has('N'); // new key, or -p: no new-passphrase prompt with -N
}

// Each pattern: { label, match, skipIf?, skipArgs?, reason, category }.
//   label     the daemon allowlist's label for the same command
//   match     anchored at the start of ONE simple command, tested on its masked words joined by single spaces
//   skipIf    tested on the call's raw text: a match exempts the call
//   skipArgs  gets the call's unquoted words after the command name: true exempts the call
const pattern = (p) => Object.freeze(p);

const INTERACTIVE_PATTERNS = Object.freeze([
  // ── TTY-interactive (need a real TTY) ──
  pattern({
    label: 'doctl auth init',
    match: /^doctl\s+auth\s+init\b/,
    skipIf: /--access-token[\s=]/,
    reason: 'doctl auth init prompts for an access token',
    category: 'tty',
  }),
  pattern({
    label: 'gcloud auth login',
    match: /^gcloud\s+auth\s+login\b/,
    skipIf: /--cred-file[\s=]/,
    reason: 'gcloud auth login opens a browser flow',
    category: 'tty',
  }),
  pattern({
    label: 'gh auth login',
    match: /^gh\s+auth\s+login\b/,
    skipIf: /--with-token\b/,
    reason: 'gh auth login is interactive without --with-token',
    category: 'tty',
  }),
  pattern({
    label: 'aws configure',
    match: /^aws\s+configure\b(?!\s+(get|list|set|import|export|sso))/,
    reason: 'aws configure prompts for credentials',
    category: 'tty',
  }),
  pattern({
    label: 'aws sso login',
    match: /^aws\s+sso\s+login\b/,
    reason: 'aws sso login opens a browser flow',
    category: 'tty',
  }),
  pattern({
    label: 'op signin',
    match: /^op\s+signin\b/,
    reason: '1Password signin prompts for the master password',
    category: 'tty',
  }),
  pattern({
    label: 'npm login',
    match: /^npm\s+login\b/,
    reason: 'npm login prompts for username/password/OTP',
    category: 'tty',
  }),
  pattern({
    label: 'vault login',
    match: /^vault\s+login\b/,
    skipIf: /-method=token\b/,
    reason: 'vault login is interactive without -method=token',
    category: 'tty',
  }),
  pattern({
    label: 'passwd',
    match: /^passwd\b(?!\s*=)/,
    reason: 'passwd prompts for the current and new password',
    category: 'tty',
  }),
  pattern({
    label: 'ssh-keygen',
    match: /^ssh-keygen\b/,
    skipArgs: sshKeygenNeverPrompts,
    reason: 'ssh-keygen prompts for a passphrase without -N (or, with -y, without -P)',
    category: 'tty',
  }),

  // ── Shell-flow (need the user's interactive shell env: aliases, mise/nvm/conda activations, sourced rc files) ──
  pattern({
    label: 'nvm use',
    match: /^nvm\s+use\b/,
    reason: 'nvm is a shell function — needs user shell',
    category: 'shell-flow',
  }),
  pattern({
    label: 'nvm install',
    match: /^nvm\s+install\b/,
    reason: 'nvm is a shell function — needs user shell',
    category: 'shell-flow',
  }),
  pattern({
    label: 'pyenv shell',
    match: /^pyenv\s+shell\b/,
    reason: 'pyenv shell modifies the active shell session',
    category: 'shell-flow',
  }),
  pattern({
    label: 'pyenv install',
    match: /^pyenv\s+install\b/,
    reason: 'pyenv install needs full shell env',
    category: 'shell-flow',
  }),
  pattern({
    label: 'conda activate',
    match: /^conda\s+activate\b/,
    reason: 'conda activate is a shell function',
    category: 'shell-flow',
  }),
  pattern({
    label: 'direnv exec',
    match: /^direnv\s+exec\b/,
    reason: 'direnv exec needs the user shell to source the env',
    category: 'shell-flow',
  }),
  pattern({
    label: 'direnv allow',
    match: /^direnv\s+allow\b/,
    reason: 'direnv allow trusts a directory in the user shell',
    category: 'shell-flow',
  }),
  pattern({
    label: 'mise use',
    match: /^mise\s+use\b/,
    reason: 'mise use modifies the active shell session',
    category: 'shell-flow',
  }),
  pattern({
    label: 'mise install',
    match: /^mise\s+install\b/,
    reason: 'mise install needs the shimmed shell env',
    category: 'shell-flow',
  }),
  pattern({
    label: 'mise run',
    match: /^mise\s+run\b/,
    reason: 'mise run dispatches via the shimmed shell',
    category: 'shell-flow',
  }),
  pattern({
    label: 'asdf shell',
    match: /^asdf\s+shell\b/,
    reason: 'asdf shell modifies the active shell session',
    category: 'shell-flow',
  }),
  pattern({
    label: 'asdf install',
    match: /^asdf\s+install\b/,
    reason: 'asdf install needs the shimmed shell env',
    category: 'shell-flow',
  }),
  pattern({
    label: 'rbenv shell',
    match: /^rbenv\s+shell\b/,
    reason: 'rbenv shell modifies the active shell session',
    category: 'shell-flow',
  }),
]);

// A heredoc fed to one of these is code, not data.
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

/** The matching walk. `depth` 1 is a shell heredoc's body, which is not searched for further shell heredocs. */
function matchAt(cmd, depth) {
  const parsed = shell.parseCommand(String(cmd || ''));
  if (!parsed.ok) return { hit: null, skipped: null }; // unterminated quote: fail open
  const many = depth > 0 || parsed.segments.length > 1;
  let skipped = null;
  for (const seg of parsed.segments) {
    if (seg.words.length === 0) continue;
    const masked = seg.words.map((w) => w.masked).join(' ');
    const raw = parsed.text.slice(seg.start, seg.end).trim();
    const args = seg.words.slice(1).map((w) => shell.unquoteWord(w.raw));
    for (const p of INTERACTIVE_PATTERNS) {
      if (!p.match.test(masked)) continue;
      if ((p.skipIf && p.skipIf.test(raw)) || (p.skipArgs && p.skipArgs(args))) {
        if (!skipped) skipped = { ...p, segment: raw };
        continue;
      }
      return { hit: { ...p, segment: raw, compound: many }, skipped };
    }
    // A heredoc fed to a shell is read as commands (the raw-text match gated it before TRD 73-10; keep that).
    const name = path.basename(shell.unquoteWord(seg.words[0].raw));
    if (depth === 0 && SHELLS.has(name)) {
      for (const h of seg.heredocs) {
        const inner = matchAt(h.body, 1);
        if (inner.hit) return { hit: inner.hit, skipped };
        if (!skipped && inner.skipped) skipped = inner.skipped;
      }
    }
  }
  return { hit: null, skipped };
}

/**
 * Match every call of a command.
 *
 * @param {string} cmd
 * @returns {{hit: object|null, skipped: object|null}}
 *   hit      the first gated call: its pattern plus `segment` (the call, trimmed) and `compound` (true when the
 *            command holds more than that one call, or the call came from a shell heredoc's body)
 *   skipped  the first call a pattern matched but a skip rule exempted: its pattern plus `segment`, else null
 */
function matchInvocations(cmd) {
  return matchAt(cmd, 0);
}

/** The first gated call (see matchInvocations), or null. */
function detectInteractive(cmd) {
  return matchInvocations(cmd).hit;
}

module.exports = {
  INTERACTIVE_PATTERNS,
  CMD_POS,
  sshKeygenFlags,
  matchInvocations,
  detectInteractive,
};
