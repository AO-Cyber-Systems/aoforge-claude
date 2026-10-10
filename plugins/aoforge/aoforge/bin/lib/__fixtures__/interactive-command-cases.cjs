'use strict';

/**
 * interactive-command-cases.cjs — TRD 73-10
 *
 * Hand-built command cases shared by every consumer of the interactive-command
 * matcher (`lib/interactive-commands.cjs`): the hook's tests
 * (hooks/gate-interactive.test.js), the module's own tests
 * (lib/interactive-commands.test.cjs) and, from TRD 73-12, the watch daemon's
 * allowlist tests (lib/watcher-allowlist.test.cjs). One table, so the hook that
 * hands a command off and the daemon that accepts it agree on what an
 * invocation is.
 *
 * Every command is hand-built, never generated. Heredoc rows are literal
 * strings with `\n`. Nothing here is ever run.
 *
 *   GATED_CASES      commands that DO invoke an interactive command:
 *                    { cmd, label, segment }. `label` is the matched pattern's
 *                    label (the daemon's label for the same command) and
 *                    `segment` is the one simple command that matched, trimmed,
 *                    as the deny reason quotes it when the command has more
 *                    than one call. The table holds one plain invocation per
 *                    pattern label, every command position, the per-call flag
 *                    rows and the shell heredoc rows.
 *   NOT_GATED_CASES  commands that only MENTION one, or run it in a form that
 *                    never prompts: { cmd, why }. Quoted arguments and heredoc
 *                    bodies are data; read-only key forms and a given
 *                    passphrase pass; a skip flag in the matched call exempts it.
 *
 * Tables and case objects are frozen.
 */

/** Freeze a value and everything reachable from it. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const GATED_CASES = deepFreeze([
  // ── One plain invocation per pattern label (TTY) ──
  { cmd: 'doctl auth init', label: 'doctl auth init', segment: 'doctl auth init' },
  { cmd: 'gcloud auth login', label: 'gcloud auth login', segment: 'gcloud auth login' },
  { cmd: 'gh auth login', label: 'gh auth login', segment: 'gh auth login' },
  { cmd: 'aws configure', label: 'aws configure', segment: 'aws configure' },
  { cmd: 'aws sso login', label: 'aws sso login', segment: 'aws sso login' },
  { cmd: 'op signin', label: 'op signin', segment: 'op signin' },
  { cmd: 'npm login', label: 'npm login', segment: 'npm login' },
  { cmd: 'vault login', label: 'vault login', segment: 'vault login' },
  { cmd: 'passwd', label: 'passwd', segment: 'passwd' },
  { cmd: 'ssh-keygen', label: 'ssh-keygen', segment: 'ssh-keygen' },

  // ── One plain invocation per pattern label (shell-flow) ──
  { cmd: 'nvm use 18', label: 'nvm use', segment: 'nvm use 18' },
  { cmd: 'nvm install 20', label: 'nvm install', segment: 'nvm install 20' },
  { cmd: 'pyenv shell 3.11', label: 'pyenv shell', segment: 'pyenv shell 3.11' },
  { cmd: 'pyenv install 3.12', label: 'pyenv install', segment: 'pyenv install 3.12' },
  { cmd: 'conda activate myenv', label: 'conda activate', segment: 'conda activate myenv' },
  { cmd: 'direnv exec . make build', label: 'direnv exec', segment: 'direnv exec . make build' },
  { cmd: 'direnv allow', label: 'direnv allow', segment: 'direnv allow' },
  { cmd: 'mise use node@20', label: 'mise use', segment: 'mise use node@20' },
  { cmd: 'mise install', label: 'mise install', segment: 'mise install' },
  { cmd: 'mise run test', label: 'mise run', segment: 'mise run test' },
  { cmd: 'asdf shell ruby 3.2', label: 'asdf shell', segment: 'asdf shell ruby 3.2' },
  { cmd: 'asdf install', label: 'asdf install', segment: 'asdf install' },
  { cmd: 'rbenv shell 3.2', label: 'rbenv shell', segment: 'rbenv shell 3.2' },

  // ── Every command position: line start, ; && || | & ( newline, leading whitespace ──
  { cmd: 'true && doctl auth init', label: 'doctl auth init', segment: 'doctl auth init' },
  { cmd: 'false || doctl auth init', label: 'doctl auth init', segment: 'doctl auth init' },
  { cmd: 'echo before; gh auth login', label: 'gh auth login', segment: 'gh auth login' },
  { cmd: 'echo before | gh auth login', label: 'gh auth login', segment: 'gh auth login' },
  { cmd: 'echo before & gh auth login', label: 'gh auth login', segment: 'gh auth login' },
  { cmd: '(gh auth login)', label: 'gh auth login', segment: 'gh auth login' },
  { cmd: 'echo before\ngh auth login', label: 'gh auth login', segment: 'gh auth login' },
  { cmd: '   gh auth login', label: 'gh auth login', segment: 'gh auth login' },

  // ── 13: a new key with no -N prompts for its passphrase ──
  { cmd: 'ssh-keygen -t ed25519 -f k', label: 'ssh-keygen', segment: 'ssh-keygen -t ed25519 -f k' },

  // ── 14: -y reads a private key and prompts unless -P; -N does not cover -y ──
  { cmd: 'ssh-keygen -y -f k', label: 'ssh-keygen', segment: 'ssh-keygen -y -f k' },
  { cmd: 'ssh-keygen -y -N "" -f k', label: 'ssh-keygen', segment: 'ssh-keygen -y -N "" -f k' },

  // ── 15: flags are read per call ──
  {
    cmd: 'ssh-keygen -t ed25519 -f a -N ""; ssh-keygen -t ed25519 -f b',
    label: 'ssh-keygen',
    segment: 'ssh-keygen -t ed25519 -f b',
  },
  { cmd: 'gh auth login; echo --with-token', label: 'gh auth login', segment: 'gh auth login' },

  // ── 16: a heredoc fed to a shell is code: its body is read as commands ──
  { cmd: "bash <<'EOF'\nnpm login\nEOF", label: 'npm login', segment: 'npm login' },
  { cmd: "sh <<'EOF'\nnpm login\nEOF", label: 'npm login', segment: 'npm login' },
  { cmd: "zsh <<'EOF'\nnpm login\nEOF", label: 'npm login', segment: 'npm login' },

  // ── 17: an unquoted command substitution is its own call ──
  { cmd: 'echo $(gh auth login)', label: 'gh auth login', segment: 'gh auth login' },
]);

const NOT_GATED_CASES = deepFreeze([
  // ── 7: quoted arguments are data ──
  { cmd: 'grep -n "ssh-keygen" notes.md', why: 'a grep pattern in double quotes' },
  { cmd: 'rg "a|ssh-keygen" file', why: 'a `|` inside quotes is not a pipe' },
  { cmd: "echo 'gh auth login'", why: 'an echo argument in single quotes' },
  { cmd: "echo 'run gh auth login'", why: 'an echo argument in single quotes, mid-sentence' },
  { cmd: 'git commit -m "docs: npm login flow"', why: 'a commit message' },
  { cmd: "printf '%s\\n' 'aws sso login'", why: 'a printf argument in single quotes' },

  // ── 8: heredoc bodies are data unless a shell reads them ──
  { cmd: "cat > notes.md <<'EOF'\nnpm login\nEOF", why: 'a quoted-delimiter heredoc body written to a file' },
  { cmd: 'cat > notes.md <<EOF\nnpm login\nEOF', why: 'an unquoted-delimiter heredoc body written to a file' },
  { cmd: 'cat > notes.md <<-EOF\nnpm login\nEOF', why: 'a <<- heredoc body written to a file' },

  // ── 9: read-only key forms never prompt ──
  { cmd: 'ssh-keygen -lf key.pub', why: 'fingerprint (-l, clustered with -f)' },
  { cmd: 'ssh-keygen -l -f key.pub', why: 'fingerprint (-l)' },
  { cmd: 'ssh-keygen -E sha256 -lf key.pub', why: 'fingerprint with a hash algorithm (-E takes an argument)' },
  { cmd: 'ssh-keygen -F github.com', why: 'find a host in known_hosts (-F)' },
  { cmd: 'ssh-keygen -R github.com', why: 'remove a host from known_hosts (-R)' },

  // ── 10: the passphrase is given ──
  { cmd: 'ssh-keygen -t ed25519 -f k -N ""', why: 'new key with an empty -N passphrase (double quotes)' },
  { cmd: "ssh-keygen -t ed25519 -f k -N ''", why: 'new key with an empty -N passphrase (single quotes)' },
  { cmd: 'ssh-keygen -q -t rsa -N "" -f k', why: 'new key, -N before -f' },
  { cmd: 'ssh-keygen -y -f k -P ""', why: '-y with the old passphrase given by -P' },

  // ── Skip flags in the matched call ──
  { cmd: 'echo hi && gh auth login --with-token < t', why: 'the skip flag is in the gated call itself' },
  { cmd: 'gh auth login --with-token < t', why: 'token read from stdin' },
  { cmd: 'doctl auth init --access-token x', why: 'token given on the command line' },

  // ── Fail open ──
  { cmd: 'echo "npm login', why: 'unterminated quote: the command cannot be parsed, so nothing is gated' },
]);

module.exports = { GATED_CASES, NOT_GATED_CASES };
