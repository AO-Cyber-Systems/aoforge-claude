/**
 * Tests for gate-interactive PreToolUse hook
 *
 * Covers:
 *   - Each interactive pattern triggers when command sits at command position
 *   - Quoted-strings fix (1c334b0): commands inside echo "..." MUST NOT trigger
 *   - Shell separators (&&, ||, |, ;, &, (, newline) are valid command positions
 *   - skipIf flags suppress detection (e.g. gh auth login --with-token)
 *   - Subprocess invocation produces well-formed PreToolUse deny JSON
 *   - Escape hatch env var disables the hook
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-interactive.js');
const { detectInteractive, INTERACTIVE_PATTERNS } = require('./gate-interactive.js');

// ---------------------------------------------------------------------------
// Unit tests: detectInteractive() pattern matching
// ---------------------------------------------------------------------------

describe('detectInteractive — interactive commands at command position', () => {
  const cases = [
    { cmd: 'doctl auth init', label: 'doctl auth init' },
    { cmd: 'gcloud auth login', label: 'gcloud auth login' },
    { cmd: 'gh auth login', label: 'gh auth login' },
    { cmd: 'aws configure', label: 'aws configure' },
    { cmd: 'op signin', label: 'op signin' },
    { cmd: 'npm login', label: 'npm login' },
    { cmd: 'vault login', label: 'vault login' },
    { cmd: 'passwd', label: 'passwd' },
    { cmd: 'ssh-keygen', label: 'ssh-keygen (no -N)' },
  ];

  for (const c of cases) {
    test(`triggers on bare ${c.label}`, () => {
      const hit = detectInteractive(c.cmd);
      assert.ok(hit, `expected detection for: ${c.cmd}`);
      assert.ok(hit.reason, 'detection result should include a reason');
    });
  }

  test('all 23 patterns present (10 TTY + 13 shell-flow, post-TRD-01-06)', () => {
    assert.equal(INTERACTIVE_PATTERNS.length, 23,
      'pattern count regression — adjust this assertion if intentionally added/removed');
    const tty = INTERACTIVE_PATTERNS.filter(p => p.category === 'tty').length;
    const shellFlow = INTERACTIVE_PATTERNS.filter(p => p.category === 'shell-flow').length;
    assert.equal(tty, 10, 'TTY-interactive pattern count');
    assert.equal(shellFlow, 13, 'shell-flow pattern count');
  });
});

describe('detectInteractive — skipIf flags suppress detection', () => {
  const skipCases = [
    { cmd: 'doctl auth init --access-token abc123', label: 'doctl --access-token' },
    { cmd: 'doctl auth init --access-token=abc123', label: 'doctl --access-token=' },
    { cmd: 'gcloud auth login --cred-file=/tmp/cred.json', label: 'gcloud --cred-file' },
    { cmd: 'gh auth login --with-token < token.txt', label: 'gh --with-token' },
    { cmd: 'vault login -method=token foo', label: 'vault -method=token' },
    { cmd: 'ssh-keygen -t ed25519 -N "" -f /tmp/key', label: 'ssh-keygen -N ""' },
  ];

  for (const c of skipCases) {
    test(`does NOT trigger on ${c.label}`, () => {
      const hit = detectInteractive(c.cmd);
      assert.equal(hit, null, `expected no detection for: ${c.cmd}`);
    });
  }

  test('aws configure get/list/set/import/export/sso are NOT interactive', () => {
    for (const sub of ['get', 'list', 'set', 'import', 'export', 'sso']) {
      const cmd = `aws configure ${sub} foo`;
      assert.equal(detectInteractive(cmd), null, `aws configure ${sub} should pass`);
    }
  });
});

describe('detectInteractive — quoted-strings fix (1c334b0)', () => {
  // TRD 73-10: heredoc bodies are data too. Detection reads shell-words
  // parseCommand segments, so `cat <<EOF\ndoctl auth init\nEOF` is not gated;
  // only a heredoc fed to a shell (`bash <<'EOF'`) is read as commands. The
  // heredoc rows live in __fixtures__/interactive-command-cases.cjs.
  const quotedCases = [
    'echo "doctl auth init"',
    "echo 'gcloud auth login'",
    'echo "I would run gh auth login but I am not"',
    'grep "passwd" /etc/services',
    'echo "--- doctl auth init ---"',
    'rg "op signin" docs/',
    'echo "to authenticate run: gh auth login"',
  ];

  for (const cmd of quotedCases) {
    test(`does NOT trigger inside quoted/text context: ${cmd.slice(0, 40)}…`, () => {
      const hit = detectInteractive(cmd);
      assert.equal(hit, null,
        `quoted-strings fix regression — should not trigger inside text: ${cmd}`);
    });
  }
});

describe('detectInteractive — shell separators are valid command positions', () => {
  const separatorCases = [
    { cmd: 'true && doctl auth init', label: '&&' },
    { cmd: 'false || doctl auth init', label: '||' },
    { cmd: 'echo before; gh auth login', label: ';' },
    { cmd: 'echo before | gh auth login', label: '|' },
    { cmd: 'echo before & gh auth login', label: '&' },
    { cmd: '(gh auth login)', label: 'subshell (' },
    { cmd: 'echo before\ngh auth login', label: 'newline' },
    { cmd: '   gh auth login', label: 'leading whitespace' },
  ];

  for (const c of separatorCases) {
    test(`detects after ${c.label}`, () => {
      const hit = detectInteractive(c.cmd);
      assert.ok(hit, `expected detection after ${c.label}: ${c.cmd}`);
    });
  }
});

describe('detectInteractive — false-position guards', () => {
  test('does NOT trigger on substring inside another word', () => {
    // e.g. an envvar named DOCTL_AUTH_INIT_TOKEN — no separator before it
    const cases = [
      'export MY_DOCTL_AUTH_INIT_TOKEN=foo',
      'echo my-gh-auth-login-script',
    ];
    for (const cmd of cases) {
      const hit = detectInteractive(cmd);
      assert.equal(hit, null, `false-positive on: ${cmd}`);
    }
  });

  test('does NOT trigger when interactive command is the value of a flag', () => {
    // e.g. --message="run gh auth login first"
    const cmd = 'git commit --message="run gh auth login first"';
    assert.equal(detectInteractive(cmd), null);
  });
});

describe('detectInteractive — reasons and categories are unchanged (TRD 73-10 item 12)', () => {
  // One plain invocation per pattern, with the reason and category the hook gave before TRD 73-10. The ssh-keygen
  // reason is the one deliberate change (it now names -y and -P), so it is pinned in interactive-commands.test.cjs.
  const UNCHANGED = [
    ['doctl auth init', 'doctl auth init prompts for an access token', 'tty'],
    ['gcloud auth login', 'gcloud auth login opens a browser flow', 'tty'],
    ['gh auth login', 'gh auth login is interactive without --with-token', 'tty'],
    ['aws configure', 'aws configure prompts for credentials', 'tty'],
    ['aws sso login', 'aws sso login opens a browser flow', 'tty'],
    ['op signin', '1Password signin prompts for the master password', 'tty'],
    ['npm login', 'npm login prompts for username/password/OTP', 'tty'],
    ['vault login', 'vault login is interactive without -method=token', 'tty'],
    ['passwd', 'passwd prompts for the current and new password', 'tty'],
    ['nvm use 18', 'nvm is a shell function — needs user shell', 'shell-flow'],
    ['nvm install 20', 'nvm is a shell function — needs user shell', 'shell-flow'],
    ['pyenv shell 3.11', 'pyenv shell modifies the active shell session', 'shell-flow'],
    ['pyenv install 3.12', 'pyenv install needs full shell env', 'shell-flow'],
    ['conda activate myenv', 'conda activate is a shell function', 'shell-flow'],
    ['direnv exec . make build', 'direnv exec needs the user shell to source the env', 'shell-flow'],
    ['direnv allow', 'direnv allow trusts a directory in the user shell', 'shell-flow'],
    ['mise use node@20', 'mise use modifies the active shell session', 'shell-flow'],
    ['mise install', 'mise install needs the shimmed shell env', 'shell-flow'],
    ['mise run test', 'mise run dispatches via the shimmed shell', 'shell-flow'],
    ['asdf shell ruby 3.2', 'asdf shell modifies the active shell session', 'shell-flow'],
    ['asdf install', 'asdf install needs the shimmed shell env', 'shell-flow'],
    ['rbenv shell 3.2', 'rbenv shell modifies the active shell session', 'shell-flow'],
  ];

  for (const [cmd, reason, category] of UNCHANGED) {
    test(`${cmd}: reason and category unchanged`, () => {
      const hit = detectInteractive(cmd);
      assert.ok(hit, `expected detection for: ${cmd}`);
      assert.equal(hit.reason, reason);
      assert.equal(hit.category, category);
    });
  }
});

// ---------------------------------------------------------------------------
// Integration tests: subprocess invocation
// ---------------------------------------------------------------------------

function runHook(payload, env = {}, cwd) {
  const tmp = cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-'));
  const result = spawnSync('node', [HOOK_PATH], {
    cwd: tmp,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  return { tmp, result };
}

describe('detectInteractive — shell-flow patterns (TRD 01-06)', () => {
  const shellFlowCases = [
    'nvm use 18',
    'nvm install 20',
    'pyenv shell 3.11',
    'pyenv install 3.12',
    'conda activate myenv',
    'direnv exec . make build',
    'direnv allow',
    'mise use node@20',
    'mise install',
    'mise run test',
    'asdf shell ruby 3.2',
    'asdf install',
    'rbenv shell 3.2',
  ];
  for (const cmd of shellFlowCases) {
    test(`detects (shell-flow): ${cmd}`, () => {
      const hit = detectInteractive(cmd);
      assert.ok(hit, `expected detection for: ${cmd}`);
      assert.equal(hit.category, 'shell-flow');
    });
  }

  test('aws sso login is detected as TTY (browser auth, not shell-flow)', () => {
    const hit = detectInteractive('aws sso login');
    assert.ok(hit);
    assert.equal(hit.category, 'tty');
  });

  test('quoted shell-flow commands still NOT triggered (1c334b0 still applies)', () => {
    assert.equal(detectInteractive('echo "nvm use 18"'), null);
    assert.equal(detectInteractive('echo "mise use node"'), null);
  });
});

function withFakePidFile({ alive }, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-'));
  const pidFile = path.join(tmp, 'aoforge-watch.pid');
  // alive=true → use OUR pid (test process is alive). alive=false → unused pid.
  const pid = alive ? process.pid : 999999;
  fs.writeFileSync(pidFile, JSON.stringify({
    pid, version: '0.1.0', shell: 'zsh', watching: [], started_at: new Date().toISOString(),
  }));
  try {
    return fn(pidFile);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('hook subprocess — daemon-aware deny message (TRD 01-06)', () => {
  test('watcher LIVE: deny says "queued for daemon", does NOT instruct paste', () => {
    withFakePidFile({ alive: true }, (pidFile) => {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { AOFORGE_HANDOFF_PID_FILE: pidFile },
      );
      assert.equal(result.status, 0);
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /queued/);
      // TRD 19-03: wording extended from "aoforge-watch daemon" → "aoforge-watch
      // PTY-backed daemon". Loosen the regex so the test asserts the daemon-by-
      // name contract without pinning the exact phrase (BD-1 in 19-03 pins the
      // PTY-backed substring as the v1.2+ contract).
      assert.match(reason, /aoforge-watch[^.]*daemon/);
      assert.ok(!/Tell the user verbatim/.test(reason),
        'should NOT instruct user paste when daemon is live');
      assert.ok(!/`! gh auth login`/.test(reason),
        'should NOT include the ! prefix line when daemon is live');
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });

  test('watcher absent: deny instructs paste (Approach A)', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-home-'));
    try {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { HOME: fakeHome },
      );
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /! gh auth login/);
      assert.match(reason, /not running/);
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('stale PID (process dead) → not-live → Approach A reason', () => {
    withFakePidFile({ alive: false }, (pidFile) => {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { AOFORGE_HANDOFF_PID_FILE: pidFile },
      );
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /! gh auth login/);
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });

  test('malformed PID file → not-live → Approach A reason', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-bad-'));
    const pidFile = path.join(tmpDir, 'aoforge-watch.pid');
    fs.writeFileSync(pidFile, 'not json');
    try {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { AOFORGE_HANDOFF_PID_FILE: pidFile },
      );
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /! gh auth login/);
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('hook integration — subprocess', () => {
  test('emits PreToolUse deny JSON for interactive command (Approach A — no watcher)', () => {
    // Sandbox HOME so isWatcherLive() doesn't see a real daemon if one is running.
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-home-'));
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'gh auth login' },
    }, { HOME: fakeHome });

    assert.equal(result.status, 0, `non-zero exit: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /shell/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /! gh auth login/);

    // Pending record written with new fields
    const pendingDir = path.join(tmp, '.aoforge-handoff', 'pending');
    const files = fs.readdirSync(pendingDir);
    assert.equal(files.length, 1, 'expected one pending record');
    const record = JSON.parse(fs.readFileSync(path.join(pendingDir, files[0]), 'utf-8'));
    assert.equal(record.cmd, 'gh auth login');
    assert.equal(record.status, 'pending');
    assert.equal(record.source, 'hook');
    assert.equal(typeof record.timeout_ms, 'number');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  test('passes through (no output) on non-interactive command', () => {
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '', 'expected no output for pass-through');
    assert.ok(!fs.existsSync(path.join(tmp, '.aoforge-handoff')),
      'no handoff dir should be created on pass-through');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('passes through on non-Bash tool', () => {
    const { tmp, result } = runHook({
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.txt' },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('passes through on empty/missing command', () => {
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: '' },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('passes through on malformed input', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-'));
    const result = spawnSync('node', [HOOK_PATH], {
      cwd: tmp,
      input: 'not json at all',
      encoding: 'utf-8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('escape hatch AOFORGE_SKIP_INTERACTIVE_GATE=1 bypasses', () => {
    const { tmp, result } = runHook(
      { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
      { AOFORGE_SKIP_INTERACTIVE_GATE: '1' }
    );

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '', 'should produce no output when bypassed');
    assert.ok(!fs.existsSync(path.join(tmp, '.aoforge-handoff')),
      'no handoff dir should be created when bypassed');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('reason includes the offending command verbatim', () => {
    const cmd = 'doctl auth init';
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: cmd },
    });

    const out = JSON.parse(result.stdout);
    assert.match(out.hookSpecificOutput.permissionDecisionReason,
      new RegExp('! ' + cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'reason should include the verbatim ! cmd');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// TRD 19-03: buildDenyReason — PTY messaging (post-PTY-backend)
// ---------------------------------------------------------------------------
//
// Behavior list:
//   BD-1: watcher-live branch reason contains "PTY-backed daemon" (exact, hyphenated)
//   BD-2: watcher-live branch preserves "Continue with other work" promise
//   BD-3: watcher-live branch preserves "Do NOT instruct the user to paste anything"
//   BD-4: watcher-live branch preserves "do NOT retry the Bash tool"
//   BD-5: watcher-absent branch preserves "paste this in the prompt" wording
//   BD-6: watcher-absent branch does NOT contain "PTY-backed daemon"
//   BD-7: watcher-live branch includes daemon pid number when watcherInfo provided
//   BD-8: subprocess invocation with watcher-live env emits well-formed deny JSON containing new wording
//   BD-9: pattern count regression check still passes (23 patterns)

describe('buildDenyReason — PTY messaging (post-TRD-19-03)', () => {
  const { buildDenyReason } = require('./gate-interactive.js');

  function liveReason(overrides = {}) {
    return buildDenyReason({
      id: 'h-test1234',
      cmd: 'gh auth login',
      hit: { reason: 'gh auth login is interactive without --with-token', category: 'tty' },
      watcherLive: true,
      watcherInfo: { pid: 12345 },
      ...overrides,
    });
  }
  function absentReason(overrides = {}) {
    return buildDenyReason({
      id: 'h-test1234',
      cmd: 'gh auth login',
      hit: { reason: 'gh auth login is interactive without --with-token', category: 'tty' },
      watcherLive: false,
      watcherInfo: null,
      ...overrides,
    });
  }

  test('BD-1: watcher-live branch contains "PTY-backed daemon" (exact, hyphenated)', () => {
    assert.match(liveReason(), /PTY-backed daemon/);
  });

  test('BD-2: watcher-live branch preserves "Continue with other work" promise', () => {
    assert.match(liveReason(), /Continue with other work/);
  });

  test('BD-3: watcher-live branch preserves "Do NOT instruct the user to paste anything"', () => {
    assert.match(liveReason(), /Do NOT instruct the user to paste anything/);
  });

  test('BD-4: watcher-live branch preserves "do NOT retry the Bash tool"', () => {
    assert.match(liveReason(), /do NOT retry the Bash tool/);
  });

  test('BD-5: watcher-absent branch preserves "paste this in the prompt" wording', () => {
    assert.match(absentReason(), /paste this in the prompt/);
  });

  test('BD-6: watcher-absent branch does NOT contain "PTY-backed daemon"', () => {
    assert.doesNotMatch(absentReason(), /PTY-backed daemon/);
  });

  test('BD-7: watcher-live branch includes daemon pid number when watcherInfo provided', () => {
    const reason = liveReason({ watcherInfo: { pid: 98765 } });
    assert.match(reason, /pid 98765/);
  });

  test('BD-8: subprocess invocation with watcher-live env emits PreToolUse deny JSON with new wording', () => {
    withFakePidFile({ alive: true }, (pidFile) => {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { AOFORGE_HANDOFF_PID_FILE: pidFile },
      );
      assert.equal(result.status, 0);
      const out = JSON.parse(result.stdout);
      assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /PTY-backed daemon/);
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });

  test('BD-9: pattern count regression check still passes (23 patterns)', () => {
    // Re-assert the pattern count locked by TRD 01-06 + 19-03 anti-pattern.
    // If this fails, an INTERACTIVE_PATTERNS entry was inadvertently added/removed.
    assert.equal(INTERACTIVE_PATTERNS.length, 23);
    assert.equal(INTERACTIVE_PATTERNS.filter(p => p.category === 'tty').length, 10);
    assert.equal(INTERACTIVE_PATTERNS.filter(p => p.category === 'shell-flow').length, 13);
  });
});

// ---------------------------------------------------------------------------
// TRD 73-04: pending records carry the address; the daemon-live reason names the delivery points
// ---------------------------------------------------------------------------
//
// Test list items 15-17:
//   15. a PreToolUse payload's session_id / agent_id land in the pending record (null for the main loop), and
//       the done record the daemon builds from it carries both
//   16. daemon live: the reason says the command waits in the user's aoforge-watch terminal, that its result arrives
//       after the next tool call or when the turn ends, to tell the user in one line, and not to paste or retry
//   17. daemon absent: the reason is byte-identical to what it was before this TRD

describe('gate-interactive — handoff address and delivery wording (TRD 73-04)', () => {
  const { buildDenyReason } = require('./gate-interactive.js');
  const HIT = { reason: 'gh auth login is interactive without --with-token', category: 'tty' };

  function onlyPendingRecord(tmp) {
    const pendingDir = path.join(tmp, '.aoforge-handoff', 'pending');
    const files = fs.readdirSync(pendingDir);
    assert.equal(files.length, 1, 'expected one pending record');
    return JSON.parse(fs.readFileSync(path.join(pendingDir, files[0]), 'utf-8'));
  }

  test('15. a main-loop payload records its session_id and a null agent_id', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-home-'));
    try {
      const { tmp, result } = runHook(
        { session_id: 's-gate-main', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm login' } },
        { HOME: fakeHome },
      );
      assert.equal(result.status, 0, result.stderr);
      const record = onlyPendingRecord(tmp);
      assert.equal(record.session_id, 's-gate-main');
      assert.strictEqual(record.agent_id, null);
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('15. a subagent payload records its agent_id', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-home-'));
    try {
      const { tmp, result } = runHook(
        {
          session_id: 's-gate-sub',
          hook_event_name: 'PreToolUse',
          agent_id: 'a1',
          agent_type: 'aoforge:executor',
          tool_name: 'Bash',
          tool_input: { command: 'npm login' },
        },
        { HOME: fakeHome },
      );
      assert.equal(result.status, 0, result.stderr);
      const record = onlyPendingRecord(tmp);
      assert.equal(record.session_id, 's-gate-sub');
      assert.equal(record.agent_id, 'a1');
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('15. a payload with no session_id records nulls, so any main loop may take the result', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-home-'));
    try {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'npm login' } },
        { HOME: fakeHome },
      );
      assert.equal(result.status, 0, result.stderr);
      const record = onlyPendingRecord(tmp);
      assert.strictEqual(record.session_id, null);
      assert.strictEqual(record.agent_id, null);
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('15. the done record the daemon builds from the pending record carries session_id and agent_id', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-home-'));
    try {
      const { tmp } = runHook(
        { session_id: 's-gate-done', agent_id: 'a2', tool_name: 'Bash', tool_input: { command: 'npm login' } },
        { HOME: fakeHome },
      );
      const pendingRecord = onlyPendingRecord(tmp);
      const { makeDoneRecord } = require('../aoforge/bin/lib/watcher-state.cjs');
      const doneRecord = makeDoneRecord(pendingRecord, { stdout: 'ok\n', stderr: '', exit_code: 0 });
      assert.equal(doneRecord.session_id, 's-gate-done');
      assert.equal(doneRecord.agent_id, 'a2');
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('16. daemon live: the reason names the aoforge-watch terminal and both delivery points', () => {
    const reason = buildDenyReason({
      id: 'h-test1234', cmd: 'gh auth login', hit: HIT, watcherLive: true, watcherInfo: { pid: 12345 },
    });
    assert.match(reason, /aoforge-watch terminal/);
    assert.match(reason, /after your next tool call/);
    assert.match(reason, /when you end your turn/);
    assert.match(reason, /Tell the user in one line/);
    assert.match(reason, /`gh auth login`/, 'the one-line message to the user names the command');
    assert.match(reason, /Do NOT instruct the user to paste anything/);
    assert.match(reason, /do NOT retry the Bash tool/);
    assert.match(reason, /pid 12345/);
    assert.match(reason, /h-test1234/);
    assert.doesNotMatch(reason, /into your next turn automatically/);
    assert.ok(!/\n/.test(reason), 'one paragraph');
  });

  test('16. daemon live, spawned: the deny JSON carries the new wording', () => {
    withFakePidFile({ alive: true }, (pidFile) => {
      const { tmp, result } = runHook(
        { session_id: 's-gate-live', tool_name: 'Bash', tool_input: { command: 'npm login' } },
        { AOFORGE_HANDOFF_PID_FILE: pidFile },
      );
      assert.equal(result.status, 0, result.stderr);
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /aoforge-watch terminal/);
      assert.match(reason, /after your next tool call/);
      assert.match(reason, /when you end your turn/);
      assert.doesNotMatch(reason, /into your next turn automatically/);
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });

  test('17. daemon absent: the reason is byte-identical to the one before TRD 73-04', () => {
    const reason = buildDenyReason({
      id: 'h-test1234', cmd: 'gh auth login', hit: HIT, watcherLive: false, watcherInfo: null,
    });
    assert.equal(reason,
      'This command requires the user\'s shell (gh auth login is interactive without --with-token; category: tty). ' +
      'The Claude Code harness cannot run it directly, and the aoforge-watch daemon is not running. ' +
      'Tell the user verbatim to paste this in the prompt: `! gh auth login` ' +
      'The `!` prefix runs the command in their shell so the output returns inline. ' +
      'Do NOT retry the Bash tool. Wait for the user\'s next message containing the output, then continue. ' +
      '(handoff id: h-test1234 — record at .aoforge-handoff/pending/h-test1234.json. ' +
      'Tip: run `aoforge-watch start` in another terminal to skip the paste step in future.) ' +
      'Escape hatch: set AOFORGE_SKIP_INTERACTIVE_GATE=1 if this is a false positive.');
  });
});

// ---------------------------------------------------------------------------
// TRD 73-10: the hook reads invocations, not mentions (gaps G1, G2, G3)
// ---------------------------------------------------------------------------
//
// Test list items at the hook (the rest are rows of __fixtures__/interactive-command-cases.cjs, asserted in
// aoforge/bin/lib/interactive-commands.test.cjs):
//   1.  a quoted `|` mention is not gated and leaves no pending record (G3)
//   2.  a new key with no -N is still denied with a pending record (G1, unchanged)
//   3.  in a two-call command the reason's parenthesis names the gated call, never the exempt one (G2)
//   6.  an unterminated quote fails open
//   6b. a copy of the hook with no lib directory beside it fails open
//   19. single-call hits keep both wordings byte-identical
//   20. multi-call hits name the call in the parenthesis, in both wordings
//   21. the hook agrees with the shared case table and re-exports the shared module's own objects

/** A temp cwd and HOME, with the daemon pid file pointed into the temp dir (no daemon). */
function gapSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-gap-'));
  const home = path.join(dir, 'home');
  const work = path.join(dir, 'work');
  fs.mkdirSync(home);
  fs.mkdirSync(work);
  return {
    dir,
    work,
    env: { HOME: home, AOFORGE_HANDOFF_PID_FILE: path.join(dir, 'aoforge-watch.pid') },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function pendingRecords(work) {
  const dir = path.join(work, '.aoforge-handoff', 'pending');
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

describe('G3: quoted text and heredoc bodies are data', () => {
  test('1. a quoted `|` mention is not gated and leaves no pending record', () => {
    const sb = gapSandbox();
    try {
      const { result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'rg -n "a|ssh-keygen" notes.md' } },
        sb.env,
        sb.work,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '', 'a mention is not gated');
      assert.deepStrictEqual(pendingRecords(sb.work), [], 'no stray pending record');
      assert.ok(!fs.existsSync(path.join(sb.work, '.aoforge-handoff')), 'no handoff directory at all');
    } finally {
      sb.cleanup();
    }
  });

  test('1. a heredoc body written to a file is not gated', () => {
    const sb = gapSandbox();
    try {
      const { result } = runHook(
        { tool_name: 'Bash', tool_input: { command: "cat > notes.md <<'EOF'\nnpm login\nEOF" } },
        sb.env,
        sb.work,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.deepStrictEqual(pendingRecords(sb.work), []);
    } finally {
      sb.cleanup();
    }
  });

  test('6. an unterminated quote fails open: no output, exit 0', () => {
    const sb = gapSandbox();
    try {
      const { result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'echo "npm login' } },
        sb.env,
        sb.work,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.deepStrictEqual(pendingRecords(sb.work), []);
    } finally {
      sb.cleanup();
    }
  });
});

describe('G1: read-only key forms', () => {
  test('2. a new key with no -N is denied and a pending record is written (unchanged)', () => {
    const sb = gapSandbox();
    try {
      const { result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'ssh-keygen -t ed25519 -f k' } },
        sb.env,
        sb.work,
      );
      assert.equal(result.status, 0, result.stderr);
      const out = JSON.parse(result.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      const files = pendingRecords(sb.work);
      assert.equal(files.length, 1, 'one pending record');
      const record = JSON.parse(fs.readFileSync(path.join(sb.work, '.aoforge-handoff', 'pending', files[0]), 'utf-8'));
      assert.equal(record.cmd, 'ssh-keygen -t ed25519 -f k');
    } finally {
      sb.cleanup();
    }
  });

  test('a fingerprint read (-lf) runs directly: no output, no pending record', () => {
    const sb = gapSandbox();
    try {
      const { result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'ssh-keygen -lf key.pub' } },
        sb.env,
        sb.work,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.deepStrictEqual(pendingRecords(sb.work), []);
    } finally {
      sb.cleanup();
    }
  });
});

describe('G2: flags and reasons per call', () => {
  const { buildDenyReason } = require('./gate-interactive.js');
  const TWO_CALLS = 'ssh-keygen -t ed25519 -f a -N ""; ssh-keygen -t ed25519 -f b';

  test('3. spawned: the deny reason\'s parenthesis names the gated call, never the exempt one', () => {
    const sb = gapSandbox();
    try {
      const { result } = runHook({ tool_name: 'Bash', tool_input: { command: TWO_CALLS } }, sb.env, sb.work);
      assert.equal(result.status, 0, result.stderr);
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.ok(reason.includes('(`ssh-keygen -t ed25519 -f b`: '), reason);
      assert.doesNotMatch(reason, /\(`[^`]*-f a/, 'no parenthesis names the exempt call');
      assert.ok(reason.includes(`\`! ${TWO_CALLS}\``), 'the paste instruction still carries the whole command');
    } finally {
      sb.cleanup();
    }
  });

  const HIT = { reason: 'gh auth login is interactive without --with-token', category: 'tty' };
  const ARGS = { id: 'h-test1234', cmd: 'gh auth login', watcherInfo: { pid: 12345 } };

  test('19. a single-call hit keeps both wordings byte-identical', () => {
    for (const watcherLive of [true, false]) {
      const base = buildDenyReason({ ...ARGS, hit: HIT, watcherLive });
      const variants = [
        { segment: 'gh auth login', compound: false },
        { segment: 'gh auth login' },
        { segment: 'gh auth login', compound: true },  // segment equal to the trimmed command
      ];
      for (const extra of variants) {
        assert.equal(buildDenyReason({ ...ARGS, hit: { ...HIT, ...extra }, watcherLive }), base,
          `watcherLive=${watcherLive} ${JSON.stringify(extra)}`);
      }
    }
  });

  test('20. a multi-call hit names the call in the parenthesis, in both wordings', () => {
    const hit = { reason: 'R', category: 'tty', segment: 'ssh-keygen -t ed25519 -f b', compound: true };
    const live = buildDenyReason({ id: 'h-1', cmd: TWO_CALLS, hit, watcherLive: true, watcherInfo: { pid: 1 } });
    const absent = buildDenyReason({ id: 'h-1', cmd: TWO_CALLS, hit, watcherLive: false, watcherInfo: null });
    assert.ok(live.startsWith('This command needs the user\'s shell (`ssh-keygen -t ed25519 -f b`: R; category: tty).'), live);
    assert.ok(absent.startsWith('This command requires the user\'s shell (`ssh-keygen -t ed25519 -f b`: R; category: tty).'), absent);
    assert.ok(live.includes(`\`${TWO_CALLS}\` is waiting`), 'the live instruction still names the whole command');
    assert.ok(absent.includes(`\`! ${TWO_CALLS}\``), 'the paste instruction still carries the whole command');
  });
});

describe('fail open without the libs', () => {
  test('6b. a copy of the hook with no aoforge/ beside it gates nothing and writes nothing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-nolib-'));
    try {
      const hooksDir = path.join(tmp, 'hooks');
      const work = path.join(tmp, 'work');
      const home = path.join(tmp, 'home');
      for (const d of [hooksDir, work, home]) fs.mkdirSync(d);
      const copy = path.join(hooksDir, 'gate-interactive.js');
      fs.copyFileSync(HOOK_PATH, copy);
      const result = spawnSync('node', [copy], {
        cwd: work,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm login' } }),
        encoding: 'utf-8',
        env: { ...process.env, HOME: home, AOFORGE_HANDOFF_PID_FILE: path.join(tmp, 'aoforge-watch.pid') },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '', 'no deny without the matcher');
      assert.ok(!fs.existsSync(path.join(work, '.aoforge-handoff')), 'no handoff directory');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('hook agreement: the shared case table and module (TRD 73-10 item 21)', () => {
  const { GATED_CASES, NOT_GATED_CASES } = require('../aoforge/bin/lib/__fixtures__/interactive-command-cases.cjs');

  for (const row of GATED_CASES) {
    test(`gated through the hook: ${JSON.stringify(row.cmd)}`, () => {
      assert.ok(detectInteractive(row.cmd), `expected a hit for ${JSON.stringify(row.cmd)}`);
    });
  }

  for (const row of NOT_GATED_CASES) {
    test(`not gated through the hook: ${JSON.stringify(row.cmd)} (${row.why})`, () => {
      assert.strictEqual(detectInteractive(row.cmd), null);
    });
  }

  test('the hook re-exports the shared module\'s own objects (item 21)', () => {
    // Required here, not at the top of the file, so a missing module fails this test only.
    const shared = require('../aoforge/bin/lib/interactive-commands.cjs');
    const hook = require('./gate-interactive.js');
    assert.strictEqual(hook.detectInteractive, shared.detectInteractive);
    assert.strictEqual(hook.INTERACTIVE_PATTERNS, shared.INTERACTIVE_PATTERNS);
    assert.strictEqual(hook.sshKeygenFlags, shared.sshKeygenFlags);
    assert.strictEqual(hook.CMD_POS, shared.CMD_POS);
  });
});

// ---------------------------------------------------------------------------
// TRD 73-10 Task 3: the daemon is read through watcher-state
// ---------------------------------------------------------------------------
//
//   4. a pid file where watcher-state.pidFilePath() says (temp HOME, override unset) is a live daemon
//   5. a pre-rename daemon's pid file only counts as no daemon, as before
//   the hook's pidFilePath() is watcher-state's, with the override unset and set
//   a stub tree without watcher-state.cjs behaves as daemon-absent

/** Run `fn` with HOME and the pid-file override set as given in this process, then restore both. */
function withEnv({ HOME, AOFORGE_HANDOFF_PID_FILE }, fn) {
  const saved = { HOME: process.env.HOME, AOFORGE_HANDOFF_PID_FILE: process.env.AOFORGE_HANDOFF_PID_FILE };
  process.env.HOME = HOME;
  if (AOFORGE_HANDOFF_PID_FILE === undefined) delete process.env.AOFORGE_HANDOFF_PID_FILE;
  else process.env.AOFORGE_HANDOFF_PID_FILE = AOFORGE_HANDOFF_PID_FILE;
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('the daemon is read through watcher-state (TRD 73-10 Task 3)', () => {
  const watcherState = require('../aoforge/bin/lib/watcher-state.cjs');
  const handoffFixtures = require('../aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs');

  test('4. a live daemon\'s pid file where watcher-state puts it gives the daemon-live reason', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-ws-'));
    try {
      const home = path.join(dir, 'home');
      const work = path.join(dir, 'work');
      fs.mkdirSync(home);
      fs.mkdirSync(work);
      const pidFile = withEnv({ HOME: home }, () => watcherState.pidFilePath());
      fs.mkdirSync(path.dirname(pidFile), { recursive: true });
      fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, watching: [work] }));
      const { result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'npm login' } },
        { HOME: home, AOFORGE_HANDOFF_PID_FILE: undefined },
        work,
      );
      assert.equal(result.status, 0, result.stderr);
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /aoforge-watch terminal/);
      assert.match(reason, new RegExp(`pid ${process.pid}\\b`));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('5. only a pre-rename daemon\'s pid file: the daemon-absent reason, as before', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-ws-'));
    try {
      const home = path.join(dir, 'home');
      const work = path.join(dir, 'work');
      fs.mkdirSync(home);
      fs.mkdirSync(work);
      handoffFixtures.writePidFile(home, { legacy: true, watching: [work] });
      const { result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'npm login' } },
        { HOME: home, AOFORGE_HANDOFF_PID_FILE: undefined },
        work,
      );
      assert.equal(result.status, 0, result.stderr);
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /`! npm login`/);
      assert.match(reason, /not running/);
      assert.doesNotMatch(reason, /aoforge-watch terminal/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the hook\'s pidFilePath() is watcher-state\'s, with the override unset and set', () => {
    const hook = require('./gate-interactive.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-ws-'));
    try {
      withEnv({ HOME: dir }, () => {
        assert.equal(hook.pidFilePath(), watcherState.pidFilePath());
      });
      const override = path.join(dir, 'elsewhere', 'daemon.pid');
      withEnv({ HOME: dir, AOFORGE_HANDOFF_PID_FILE: override }, () => {
        assert.equal(hook.pidFilePath(), watcherState.pidFilePath());
        assert.equal(hook.pidFilePath(), override);
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('without watcher-state.cjs beside it, the hook behaves as daemon-absent', () => {
    // A stub tree with the matcher and shell-words but no watcher-state: a live daemon's pid file is not read.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-nows-'));
    try {
      const libSrc = path.join(__dirname, '..', 'aoforge', 'bin', 'lib');
      const libDst = path.join(tmp, 'aoforge', 'bin', 'lib');
      const hooksDir = path.join(tmp, 'hooks');
      const work = path.join(tmp, 'work');
      const home = path.join(tmp, 'home');
      for (const d of [libDst, hooksDir, work, home]) fs.mkdirSync(d, { recursive: true });
      for (const f of ['interactive-commands.cjs', 'shell-words.cjs']) {
        fs.copyFileSync(path.join(libSrc, f), path.join(libDst, f));
      }
      const copy = path.join(hooksDir, 'gate-interactive.js');
      fs.copyFileSync(HOOK_PATH, copy);
      const pidFile = path.join(tmp, 'aoforge-watch.pid');
      fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, watching: [work] }));
      const result = spawnSync('node', [copy], {
        cwd: work,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm login' } }),
        encoding: 'utf-8',
        env: { ...process.env, HOME: home, AOFORGE_HANDOFF_PID_FILE: pidFile },
      });
      assert.equal(result.status, 0, result.stderr);
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /`! npm login`/, 'daemon-absent wording');
      assert.doesNotMatch(reason, /aoforge-watch terminal/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// TRD 73-12 item 14: the daemon is found where watcher-state keeps it
// ---------------------------------------------------------------------------
//
// The hook spawned with HOME = a temp home and the override unset:
//   - a live pid file in the watch state directory (compat.watchStateDir) -> daemon-live
//   - a live pid file only where AOForge 3.0.0 kept it (~/.aoforge/) -> daemon-absent (TRD 78-05 case 6): that file
//     is no longer read, so the hook asks for `! cmd` and never tells Claude a daemon took the command
//   - a pre-rename daemon's pid file only -> daemon-absent: not read either

describe('the daemon is found where watcher-state keeps it (TRD 73-12 item 14)', () => {
  const { watchStateDir } = require('../aoforge/bin/lib/compat.cjs');
  const handoffFixtures = require('../aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs');

  /** Run the hook on `npm login` in `work` with HOME = `home` and no override; return the deny reason. */
  function reasonFor(home, work) {
    const { result } = runHook(
      { tool_name: 'Bash', tool_input: { command: 'npm login' } },
      { HOME: home, AOFORGE_HANDOFF_PID_FILE: undefined },
      work,
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
  }

  function withSandbox(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-73-12-'));
    try {
      const home = path.join(dir, 'home');
      const work = path.join(dir, 'work');
      fs.mkdirSync(home);
      fs.mkdirSync(work);
      fn({ home, work });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function writeLivePid(file, work) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, version: '3.1.0', watching: [work] }));
  }

  test('a live pid file in the watch state directory gives the daemon-live reason', () => {
    withSandbox(({ home, work }) => {
      writeLivePid(path.join(watchStateDir(home), 'aoforge-watch.pid'), work);
      const reason = reasonFor(home, work);
      assert.match(reason, /aoforge-watch terminal/);
      assert.match(reason, new RegExp(`pid ${process.pid}\\b`));
    });
  });

  test('[78-05 case 6] a live pid file only where AOForge 3.0.0 kept it gives the daemon-absent reason', () => {
    withSandbox(({ home, work }) => {
      writeLivePid(path.join(home, '.aoforge', 'aoforge-watch.pid'), work);
      const reason = reasonFor(home, work);
      assert.match(reason, /`! npm login`/, 'asks for `! cmd`');
      assert.match(reason, /not running/);
      assert.doesNotMatch(reason, /aoforge-watch terminal/, 'never says a daemon took the command');
      assert.doesNotMatch(reason, new RegExp(`pid ${process.pid}\\b`), 'never names the 3.0.0 daemon as the one');
    });
  });

  test('[78-05 case 7] a `legacy` key inside the daemon\'s own pid file changes nothing: daemon-live', () => {
    withSandbox(({ home, work }) => {
      const file = path.join(watchStateDir(home), 'aoforge-watch.pid');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, version: '3.1.0', watching: [work], legacy: true }));
      const reason = reasonFor(home, work);
      assert.match(reason, /aoforge-watch terminal/, 'no branch is keyed on `legacy`');
      assert.match(reason, new RegExp(`pid ${process.pid}\\b`));
    });
  });

  test('[78-05 case 6] the hook\'s own reader returns nothing for a 3.0.0 pid file alone', () => {
    const hook = require('./gate-interactive.js');
    withSandbox(({ home, work }) => {
      writeLivePid(path.join(home, '.aoforge', 'aoforge-watch.pid'), work);
      withEnv({ HOME: home }, () => {
        assert.equal(hook.readWatcherInfo(), null);
        assert.equal(hook.isWatcherLive(), false);
      });
    });
  });

  test('only a pre-rename daemon\'s pid file gives the daemon-absent reason', () => {
    withSandbox(({ home, work }) => {
      handoffFixtures.writePidFile(home, { legacy: true, watching: [work] });
      const reason = reasonFor(home, work);
      assert.match(reason, /`! npm login`/);
      assert.doesNotMatch(reason, /aoforge-watch terminal/);
    });
  });
});
