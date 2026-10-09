'use strict';

/**
 * wrappers/bash — bash/zsh dispatch wrapper (TRD 20-05).
 *
 * Extracted byte-identical from watcher-shell.cjs:354-374 (current bash
 * logic). zsh routes to this same module via wrappers/index.cjs because
 * zsh is bash-compatible for our sentinel pattern (mktemp, $?, $VAR,
 * set +o monitor, PS1).
 *
 * Interface: { shellName, shellArgs, wrapCommand, lineSep, initLines }
 * plus two OPTIONAL members, { ptyScript, sourceLine } (objective 73, TRD 73-01).
 * A wrapper that exports both opts in to the in-band PTY script protocol (see
 * watcher-shell.cjs); a wrapper without them keeps the replay protocol that
 * wrapCommand describes. fish and powershell have neither, so they are unchanged.
 */

/** Single-quote a string for a POSIX-ish shell: ' becomes '\'' . */
function shQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

module.exports = {
  shellName: 'bash',

  shellArgs: (interactive) => (interactive ? ['-i'] : []),

  lineSep: '\n',

  initLines: (mode) => {
    const base = [
      'set +o monitor 2>/dev/null',
      "PS1=''",
      "PS2=''",
      "PROMPT_COMMAND=''",
      'unset PROMPT_DIRTRIM',
    ];
    // PTY mode needs `stty -echo` first to disable cooked-mode echo;
    // pipe mode doesn't echo so it's omitted.
    //
    // `stty -echo` only silences the TTY DRIVER. readline writes control
    // sequences of its own that the driver never sees, and since readline 8.1
    // it wraps every line it reads in the bracketed-paste pair ESC[?2004h /
    // ESC[?2004l followed by a CRLF on accept-line. Those land BETWEEN the
    // BEGIN and DELIM sentinels of the dispatch wrapper and become part of the
    // captured output, so on the bash that ships with any current Linux distro
    // a `handoff` result reads `ESC[?2004hESC[?2004l\r\nhello\n…` instead of
    // `hello\n`. macOS ships bash 3.2 / readline 6.x, which has no such mode,
    // which is why this was invisible to every developer on this team until CI
    // ran the suite on ubuntu-latest (issue #95). This is a USER-FACING bug, so
    // it is fixed at the source rather than scrubbed out of the capture.
    //
    // Both lines are error-suppressed because this module serves bash AND zsh
    // (wrappers/index.cjs routes zsh here): `bind` is a bash builtin that zsh
    // does not have, and `zle_bracketed_paste` is a zsh array that bash does
    // not have. Each shell runs the one that applies to it and swallows the
    // other. Readline only reads `bind` in an interactive shell, which is
    // exactly what PTY mode spawns (`bash -i`); pipe mode has no TTY, so
    // readline is not in play there at all.
    const ptyQuiet = [
      "bind 'set enable-bracketed-paste off' 2>/dev/null",  // bash / readline >= 8.1
      'unset zle_bracketed_paste 2>/dev/null',              // zsh / zle
    ];
    // The PTY shell is interactive, so it keeps command history, and the daemon
    // dispatches secrets-adjacent commands through it (`doctl auth init`, a
    // passphrase prompt). History would persist them to ~/.bash_history or
    // ~/.zsh_history at exit. Turn it off at the source: unset HISTFILE (bash
    // and zsh both skip the save when it is unset) and `set +o history` (bash
    // stops recording; zsh has no such option and rejects the line, which the
    // redirect swallows and the readiness drain discards). Pipe mode is not an
    // interactive shell and records nothing, so its lines are unchanged.
    const ptyNoHistory = [
      'unset HISTFILE 2>/dev/null',
      'set +o history 2>/dev/null',
    ];
    return mode === 'pty' ? ['stty -echo 2>/dev/null', ...ptyQuiet, ...ptyNoHistory, ...base] : base;
  },

  /**
   * The in-band PTY dispatch script (objective 73, TRD 73-01). Used instead of
   * wrapCommand when the session is a PTY. The session writes this text to a
   * private file and sends ONE line, sourceLine(file), to the shell.
   *
   * Why not wrapCommand's replay protocol on a PTY:
   *  - gap 1: `{ cmd ; } > file 2> file` leaves the command's stdout/stderr as
   *    regular files, so isatty() is false and a TUI (doctl) quits. Here the
   *    command keeps the terminal on fds 0, 1 and 2 and its output is read in
   *    band, between BEGIN and DELIM.
   *  - gap 2: ten wrapper lines queued on the tty let a command that reads
   *    stdin eat the next wrapper line as its answer. One short line cannot.
   *  - Ctrl+C: the tty driver flushes queued input on SIGINT, so END was never
   *    printed. The script is already read, so there is nothing to flush.
   *
   * Line by line:
   *  - AOFW_SCRIPT       the script's own path (private; lets a test or tool find it)
   *  - trap ':' INT      held for the whole script. An interactive shell aborts
   *                      the rest of a sourced script when its foreground child
   *                      dies of SIGINT unless INT is trapped. With the trap the
   *                      child still dies (children get the default disposition),
   *                      the shell runs `:` and goes on to DELIM and END. It is
   *                      released only after END, so a late ^C cannot land in the
   *                      gap between the command and END. (`set +o monitor` in
   *                      initLines keeps the command in the terminal's foreground
   *                      process group, which is what delivers ^C to it.)
   *  - { <cmd> }         the command on its OWN lines, so a trailing `# comment`
   *                      or an embedded newline cannot reach the closing brace.
   *                      Not a subshell: `export FOO=bar` and `nvm use` must
   *                      persist across dispatches.
   *  - __DFW_RC=$?       the command's status, captured before anything else runs
   *  - stty sane; -echo  a TUI killed mid-run can leave the tty raw; restore
   *                      cooked mode with echo off before the next dispatch
   *  - DELIM, END:rc     the fence splitDispatchOutput reads. The DELIM-END
   *                      section is empty (both fds were the terminal), so the
   *                      parsed stderr is '' with no parser change.
   *
   * @param {string} cmd
   * @param {{begin: string, delim: string, end: string}} markers sentinel names
   * @param {{scriptPath?: string}} [opts]
   * @returns {string} the script text (LF-separated, trailing newline)
   */
  ptyScript: (cmd, markers, { scriptPath } = {}) => {
    const { begin, delim, end } = markers;
    return [
      `AOFW_SCRIPT=${shQuote(scriptPath || '')}`,
      "trap ':' INT",
      `echo ${begin}`,
      '{',
      cmd,
      '}',
      '__DFW_RC=$?',
      'stty sane 2>/dev/null; stty -echo 2>/dev/null',
      `echo ${delim}`,
      `echo ${end}:$__DFW_RC`,
      'trap - INT',
      '',
    ].join('\n');
  },

  /** The one input line that runs a script file in the current shell. */
  sourceLine: (scriptPath) => `. ${shQuote(scriptPath)}`,

  wrapCommand: (cmd, id) => {
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    return [
      '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
      `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
      '__DFW_RC=$?',
      `echo ${begin}`,
      'cat $__DFW_OUT 2>/dev/null',
      `echo ${delim}`,
      'cat $__DFW_ERR 2>/dev/null',
      `echo ${end}:$__DFW_RC`,
      'rm -f $__DFW_OUT $__DFW_ERR',
      '',
    ];
  },
};
