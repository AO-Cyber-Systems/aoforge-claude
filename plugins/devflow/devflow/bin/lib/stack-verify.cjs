'use strict';

// stack-verify.cjs — command verification: `stack verify [--run] [--draft]` (TRD 42-06, SDR-03).
//
// Two halves that share one command reader:
//
//   verifyCommand(command, ctx)  a deterministic, injectable resolvability check. Is the binary on
//                                PATH? Does the make/task/just target exist? Does the script exist
//                                and is it executable? MISSING NEVER COUNTS AS RESOLVED.
//   runCommands(items, opts)     an opt-in executor that runs only safe gate keys, and refuses
//                                anything on a strict deny policy (Task 2).
//
// This module only REPORTS status. The drafter (42-07) applies the policy: binary_missing,
// target_missing and script_missing all mean "not proposed" (locked decision Q2).
//
// `stack verify` is read-only in both modes: it never writes a file. It is reached through the
// STACK_EXTENSIONS dispatch in stack-profile.cjs (42-01), which requires this module lazily — so
// the stack-profile / stack-render requires below happen inside `cli`, never at load time.

const nodeFs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { normalizeScript, splitTopLevel, splitWords, findHeredocs } = require('./stack-shell.cjs');
const runners = require('./stack-runners.cjs');

// ─── Binary lookup ────────────────────────────────────────────────────────────

function isExecutableFile(fs, file) {
  try {
    const st = fs.statSync(file);
    return st.isFile() && (st.mode & 0o111) !== 0;
  } catch (_) {
    return false;
  }
}

/** Directories searched after PATH: `$GOPATH/bin`, `~/go/bin`, `~/.local/bin`, `~/.maestro/bin`, mise shims. */
function extraBinDirs(env, home) {
  const dirs = [];
  const gopath = env && env.GOPATH ? String(env.GOPATH) : path.join(home, 'go');
  for (const entry of gopath.split(path.delimiter)) if (entry) dirs.push(path.join(entry, 'bin'));
  dirs.push(
    path.join(home, 'go', 'bin'),
    path.join(home, '.local', 'bin'),
    path.join(home, '.maestro', 'bin'),
    path.join(home, '.local', 'share', 'mise', 'shims'),
  );
  return dirs;
}

/**
 * resolveBinary(name, { env, home, fs }) -> absolute path | null
 *
 * PATH entries first, then the well-known tool dirs an interactive shell would usually have on
 * PATH but a CI job or an agent subprocess may not. Never shells out (`go env GOPATH` is not run):
 * `env.GOPATH` or `<home>/go`. A file must be executable to count.
 */
function resolveBinary(name, { env = process.env, home = os.homedir(), fs = nodeFs } = {}) {
  if (typeof name !== 'string' || name === '') return null;
  if (name.includes('/')) return isExecutableFile(fs, name) ? name : null;
  const seen = new Set();
  const dirs = [];
  const pathDirs = String((env && env.PATH) || '').split(path.delimiter).filter(Boolean);
  for (const dir of [...pathDirs, ...extraBinDirs(env, home)]) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    dirs.push(dir);
  }
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (isExecutableFile(fs, candidate)) return candidate;
  }
  return null;
}

// ─── Reading a command: argv -> descriptor ────────────────────────────────────

const MAKE_TOOLS = new Set(['make', 'gmake']);
const NPM_FAMILY = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const RUNNER_TOOLS = new Set(['make', 'gmake', 'task', 'just', 'npm', 'pnpm', 'yarn', 'bun']);
const SHELL_INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const BUILTINS = new Set(['test', '[', '[[', 'command', 'type', 'hash', 'eval', 'wait']);
const VAR_ASSIGN = /^[A-Za-z_][A-Za-z0-9_.]*=/;

const ARG_SPEC = {
  make: {
    dirFlags: ['-C', '--directory'],
    fileFlags: ['-f', '--file', '--makefile'],
    valueFlags: ['-I', '-o', '-W', '--include-dir', '--old-file', '--what-if', '--new-file', '--assume-old', '--assume-new'],
    optNumeric: ['-j', '-l', '--jobs', '--load-average'],
  },
  task: {
    dirFlags: ['-d', '--dir'],
    fileFlags: ['-t', '--taskfile'],
    valueFlags: ['-C', '--concurrency', '-o', '--output', '--interval', '--sort'],
    optNumeric: [],
    info: ['--list', '-l', '--list-all', '-a', '--init', '-i', '--version', '--help', '-h', '--summary'],
  },
  just: {
    dirFlags: ['-d', '--working-directory'],
    fileFlags: ['-f', '--justfile'],
    valueFlags: ['--shell', '--shell-arg', '--color', '--dotenv-filename', '--dotenv-path', '-E', '--chooser', '--show', '-s'],
    optNumeric: [],
    info: ['--list', '-l', '--summary', '--dump', '--fmt', '--init', '--evaluate', '--variables', '--choose', '--help', '-h', '--version', '-V', '--show', '-s', '--edit', '-e', '--completions', '--changelog'],
  },
  npm: { dirFlags: ['--prefix'], fileFlags: [], valueFlags: ['-w', '--workspace', '--registry', '--cache', '--tag', '--loglevel'], optNumeric: [] },
  pnpm: { dirFlags: ['-C', '--dir'], fileFlags: [], valueFlags: ['--filter', '-F', '--reporter', '--loglevel', '--workspace-concurrency'], optNumeric: [] },
  yarn: { dirFlags: ['--cwd'], fileFlags: [], valueFlags: ['--registry', '--cache-folder'], optNumeric: [] },
  bun: { dirFlags: ['--cwd'], fileFlags: [], valueFlags: ['--filter', '--config', '-c'], optNumeric: [] },
};

/** Split an argv tail into positionals, the dir/file flag values, and the set of flags seen. */
function scanArgs(args, spec) {
  const out = { pos: [], dir: null, file: null, flags: new Set(), rest: [] };
  const takesValue = (name) => spec.dirFlags.includes(name) || spec.fileFlags.includes(name) || spec.valueFlags.includes(name);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { out.rest = args.slice(i + 1); break; }
    if (a.startsWith('-') && a.length > 1) {
      const long = a.startsWith('--');
      let name;
      let attached = null;
      if (long) {
        const eq = a.indexOf('=');
        name = eq === -1 ? a : a.slice(0, eq);
        attached = eq === -1 ? null : a.slice(eq + 1);
      } else {
        name = a.slice(0, 2);
        attached = a.length > 2 ? a.slice(2) : null;
      }
      out.flags.add(name);
      let val = attached;
      if (takesValue(name) && attached === null && i + 1 < args.length) val = args[++i];
      else if (spec.optNumeric.includes(name) && attached === null && i + 1 < args.length && /^\d+$/.test(args[i + 1])) i++;
      if (spec.dirFlags.includes(name)) out.dir = val;
      else if (spec.fileFlags.includes(name)) out.file = val;
      continue;
    }
    if (VAR_ASSIGN.test(a)) continue;
    out.pos.push(a);
  }
  return out;
}

/** `dir` joined onto `base`, as a clean repo-relative posix path ('' = the root); absolute stays absolute. */
function joinDir(base, dir) {
  if (dir === null || dir === undefined || dir === '') return base || '';
  if (path.isAbsolute(dir)) return dir;
  const joined = path.posix.normalize(base ? path.posix.join(base, dir) : dir).replace(/\/+$/, '');
  return joined === '.' ? '' : joined;
}

const NON_SCRIPT_VERBS = {
  pnpm: new Set(['add', 'i', 'install', 'remove', 'rm', 'uninstall', 'un', 'update', 'up', 'upgrade', 'link', 'ln', 'unlink', 'exec', 'dlx', 'create', 'audit', 'outdated', 'list', 'ls', 'why', 'publish', 'pack', 'prune', 'rebuild', 'rb', 'store', 'config', 'c', 'env', 'init', 'patch', 'patch-commit', 'deploy', 'fetch', 'import', 'licenses', 'setup', 'root', 'bin', 'cache', 'dedupe', 'doctor', 'help', 'install-test', 'it', 'approve-builds', 'self-update', 'server']),
  yarn: new Set(['add', 'install', 'remove', 'upgrade', 'up', 'init', 'link', 'unlink', 'exec', 'dlx', 'create', 'audit', 'outdated', 'list', 'why', 'publish', 'pack', 'config', 'cache', 'bin', 'global', 'import', 'info', 'login', 'logout', 'owner', 'plugin', 'set', 'version', 'workspaces', 'npm', 'node', 'tag', 'team', 'whoami', 'constraints', 'dedupe', 'explain', 'rebuild', 'unplug', 'patch', 'patch-commit', 'stage', 'autoclean', 'check', 'licenses', 'policies', 'help', 'versions']),
  bun: new Set(['add', 'install', 'i', 'remove', 'rm', 'update', 'upgrade', 'link', 'unlink', 'pm', 'x', 'create', 'init', 'repl', 'build', 'test', 'publish', 'outdated', 'audit', 'patch', 'exec', 'help', 'completions']),
};

const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/** npm / pnpm / yarn / bun: the script an invocation runs, or a `binary` descriptor for `npm ci`. */
function describeNpmFamily(manager, argv, dir, tool) {
  const scan = scanArgs(argv.slice(1), ARG_SPEC[manager]);
  const base = { kind: 'runner', runner: 'npm', manager, tool, dir: joinDir(dir, scan.dir), names: [], info: false, unresolvable: null };
  if (scan.flags.has('--filter') || scan.flags.has('-F') || scan.flags.has('--workspace') || scan.flags.has('-w') || scan.flags.has('-r') || scan.flags.has('--recursive')) {
    return { ...base, unresolvable: 'workspace-scoped script (--filter/--workspace/-r) is not resolved statically', names: ['?'] };
  }
  const [verb, ...more] = scan.pos;
  if (verb === undefined) return { kind: 'binary', tool };
  if (manager === 'yarn' && verb === 'workspace') {
    return { ...base, unresolvable: 'yarn workspace <name> <cmd> is not resolved statically', names: ['?'] };
  }
  if (manager === 'npm') {
    if (['run', 'run-script', 'rum', 'urn'].includes(verb)) {
      return more.length ? { ...base, names: [more[0]] } : { kind: 'binary', tool };
    }
    if (['test', 't', 'tst'].includes(verb)) return { ...base, names: ['test'] };
    return { kind: 'binary', tool };
  }
  if (verb === 'run' || verb === 'run-script') {
    if (!more.length) return { kind: 'binary', tool };
    const name = more[0];
    if (manager === 'bun' && (name.includes('/') || SOURCE_EXT.test(name))) {
      return { kind: 'script', tool, file: name, cwd: base.dir, direct: false, interpreter: 'bun' };
    }
    return { ...base, names: [name] };
  }
  if (verb === 'test' || verb === 't') return manager === 'bun' ? { kind: 'binary', tool } : { ...base, names: ['test'] };
  if (NON_SCRIPT_VERBS[manager].has(verb)) return { kind: 'binary', tool };
  return { ...base, names: [verb] }; // the short form: `pnpm lint`, `yarn build`
}

function describeLocalBin(argv, dir, tool) {
  const args = argv.slice(1);
  const scan = scanArgs(args, { dirFlags: [], fileFlags: [], valueFlags: ['-p', '--package', '-c', '--call'], optNumeric: [] });
  if (scan.flags.has('-p') || scan.flags.has('--package') || scan.flags.has('-c') || scan.flags.has('--call')) {
    return { kind: 'localbin', tool, dir, bin: null, unresolvable: `${tool} with an explicit package/call is not resolved statically` };
  }
  const bin = scan.pos[0];
  if (!bin) return { kind: 'binary', tool };
  if (/^@?[^@/]+(?:\/[^@]+)?@/.test(bin) && /@[^/]*$/.test(bin.replace(/^@/, ''))) {
    return { kind: 'localbin', tool, dir, bin, unresolvable: `${bin} names a version; npx would download it` };
  }
  return { kind: 'localbin', tool, dir, bin, unresolvable: null };
}

const GO_VALUE_FLAGS = new Set(['-tags', '-ldflags', '-gcflags', '-asmflags', '-o', '-C', '-mod', '-modfile', '-p', '-exec', '-overlay', '-pkgdir', '-toolexec', '-buildvcs']);

function describeGoRun(argv, dir, tool) {
  let target = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { target = argv[i + 1] || null; break; }
    if (a.startsWith('-')) { if (GO_VALUE_FLAGS.has(a)) i++; continue; }
    target = a;
    break;
  }
  return { kind: 'gorun', tool, cwd: dir, target };
}

function describeShellInterpreter(argv, dir, tool) {
  let script = null;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { script = argv[i + 1] || null; break; }
    if (a.startsWith('-')) {
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a)) return { kind: 'inline', tool };
      if (a === '-o' || a === '-O') i++;
      continue;
    }
    script = a;
    break;
  }
  if (script === null) return { kind: 'binary', tool };
  return { kind: 'script', tool, file: script, cwd: dir, direct: false, interpreter: tool };
}

/**
 * describeInvocation(inv) -> descriptor. Pure: argv in, structure out, no filesystem. `inv` is a
 * stack-shell.normalizeScript entry `{ tool, argv, cwd, env }`. Kinds:
 *   runner    make | task | just | an npm-family SCRIPT run (`names` are the targets)
 *   script    a wrapper script: `./x.sh`, `bin/x`, `bash x.sh`
 *   inline    `bash -c '...'`
 *   localbin  `npx <bin>`
 *   gorun     `go run <target>`
 *   builtin   `test`, `[`
 *   binary    anything else (only its binary is checked)
 * The body-expansion in Task 2 reuses this to find runner and script references inside a body.
 */
function describeInvocation(inv) {
  const { tool, argv } = inv;
  const dir = inv.cwd || '';
  const name = tool.includes('/') ? null : tool;

  if (name === null) return { kind: 'script', tool, file: tool, cwd: dir, direct: true, interpreter: null };
  if (MAKE_TOOLS.has(name) || name === 'task' || name === 'just') {
    const runner = MAKE_TOOLS.has(name) ? 'make' : name;
    const spec = ARG_SPEC[runner];
    const scan = scanArgs(argv.slice(1), spec);
    let rdir = joinDir(dir, scan.dir);
    let unresolvable = null;
    if (scan.file) {
      const standard = runners.RUNNER_FILES[runner] || [];
      if (standard.includes(path.posix.basename(scan.file))) rdir = joinDir(rdir, path.posix.dirname(scan.file));
      else unresolvable = `custom ${runner} file ${scan.file} is not read statically`;
    }
    const info = (spec.info || []).some((f) => scan.flags.has(f));
    const names = runner === 'just' ? scan.pos.slice(0, 1) : scan.pos.slice();
    return { kind: 'runner', runner, manager: null, tool, dir: rdir, names, info, unresolvable };
  }
  if (NPM_FAMILY.has(name)) return describeNpmFamily(name, argv, dir, tool);
  if (name === 'npx' || name === 'bunx') return describeLocalBin(argv, dir, tool);
  if ((name === 'pnpm' || name === 'yarn') && argv[1] === 'exec') return describeLocalBin(argv.slice(1), dir, tool);
  if (name === 'go' && argv[1] === 'run') return describeGoRun(argv, dir, tool);
  if (SHELL_INTERPRETERS.has(name)) return describeShellInterpreter(argv, dir, tool);
  if (BUILTINS.has(name)) return { kind: 'builtin', tool };
  return { kind: 'binary', tool };
}

// ─── Checking a descriptor against the filesystem ─────────────────────────────

const MISSING_STATUSES = new Set(['binary_missing', 'target_missing', 'script_missing']);

const res = (status, tool, detail, extra = {}) => ({ status, detail, tool, ...extra });

function absPath(ctx, rel) {
  return path.isAbsolute(rel) ? rel : path.join(ctx.root, rel);
}

function needBinary(tool, ctx) {
  if (ctx.which(tool)) return null;
  return res('binary_missing', tool, `${tool} not found on PATH (also checked GOPATH/bin, ~/go/bin, ~/.local/bin, ~/.maestro/bin, mise shims)`);
}

function runnerFileExists(ctx, runner, dir) {
  const names = runners.RUNNER_FILES[runner] || [];
  return names.some((n) => ctx.fs.existsSync(path.join(absPath(ctx, dir), n)));
}

function where(dir) { return dir ? ` in ${dir}/` : ''; }

function checkRunner(d, ctx) {
  const miss = needBinary(d.tool, ctx);
  if (miss) return miss;
  if (d.unresolvable) return res('unverifiable', d.tool, d.unresolvable);
  if (d.info) return res('resolved', d.tool, 'informational invocation; no target requested');
  const isNpm = d.runner === 'npm';
  if (d.names.length === 0) {
    return runnerFileExists(ctx, d.runner, d.dir)
      ? res('resolved', d.tool, `${d.runner} default target (a runner file is present${where(d.dir)})`)
      : res('target_missing', d.tool, `no ${d.runner} runner file${where(d.dir) || ' in the repo root'}`);
  }
  let unknown = null;
  for (const name of d.names) {
    const has = runners.hasTarget(ctx.root, { runner: d.runner, dir: d.dir, name });
    if (has === false) {
      return isNpm
        ? res('script_missing', d.tool, `no script "${name}" in package.json${where(d.dir)}`)
        : res('target_missing', d.tool, `no ${d.runner} target "${name}"${where(d.dir)}`);
    }
    if (has === 'unknown' && unknown === null) {
      unknown = `${d.runner} target "${name}" is not defined statically and the file includes others${where(d.dir)}`;
    }
  }
  if (unknown) return res('unverifiable', d.tool, unknown);
  return res('resolved', d.tool, isNpm ? `script found in package.json${where(d.dir)}` : `${d.runner} target found${where(d.dir)}`);
}

function checkScript(d, ctx) {
  if (d.interpreter) {
    const miss = needBinary(d.interpreter, ctx);
    if (miss) return miss;
  }
  const rel = path.isAbsolute(d.file) ? d.file : path.posix.join(d.cwd || '', d.file);
  const abs = absPath(ctx, rel);
  let st;
  try {
    st = ctx.fs.statSync(abs);
  } catch (_) {
    return res('script_missing', d.tool, `script not found: ${rel}`);
  }
  if (!st.isFile()) return res('script_missing', d.tool, `${rel} is not a file`);
  if (d.direct && (st.mode & 0o111) === 0) return res('script_missing', d.tool, `${rel} is not executable`);
  return res('resolved', d.tool, d.direct ? `${rel} exists and is executable` : `${rel} exists`);
}

function readDeps(ctx, dir) {
  try {
    const pkg = JSON.parse(ctx.fs.readFileSync(path.join(absPath(ctx, dir), 'package.json'), 'utf-8'));
    return { ...pkg.optionalDependencies, ...pkg.devDependencies, ...pkg.dependencies };
  } catch (_) {
    return {};
  }
}

function checkLocalBin(d, ctx) {
  const miss = needBinary(d.tool, ctx);
  if (miss) return miss;
  const unverifiable = (detail) => res('unverifiable', d.tool, detail, { confidence: 'low' });
  if (d.unresolvable) return unverifiable(d.unresolvable);
  // node_modules/.bin/<bin> in the command's dir and each parent up to the repo root (hoisting).
  let dir = d.dir || '';
  for (;;) {
    if (isExecutableFile(ctx.fs, path.join(absPath(ctx, dir), 'node_modules', '.bin', d.bin))) {
      return res('resolved', d.tool, `node_modules/.bin/${d.bin} is installed${where(dir)}`);
    }
    if (dir === '' || path.isAbsolute(dir)) break;
    dir = path.posix.dirname(dir) === '.' ? '' : path.posix.dirname(dir);
  }
  const suffix = `/${d.bin}`;
  for (const scope of new Set([d.dir || '', ''])) {
    const deps = readDeps(ctx, scope);
    if (Object.keys(deps).some((n) => n === d.bin || n.endsWith(suffix))) {
      return res('resolved', d.tool, `${d.bin} is a declared dependency (not installed)`);
    }
  }
  return unverifiable(`${d.bin} is neither installed under node_modules/.bin nor a declared dependency`);
}

function checkGoRun(d, ctx) {
  const miss = needBinary(d.tool, ctx);
  if (miss) return miss;
  const target = d.target;
  if (!target || /@/.test(target)) return res('resolved', d.tool, 'go run: no local path to check');
  if (target === '.' || target.startsWith('./') || target.startsWith('../') || target.endsWith('.go')) {
    const rel = path.isAbsolute(target) ? target : path.posix.join(d.cwd || '', target);
    return ctx.fs.existsSync(absPath(ctx, rel))
      ? res('resolved', d.tool, `go run target ${rel} exists`)
      : res('script_missing', d.tool, `go run target not found: ${rel}`);
  }
  return res('resolved', d.tool, 'go run of an import path; only go is checked');
}

const TEST_INNER_TOOL = /\$\(\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*([^\s)|;&<>]+)/;

function checkBuiltin(inv, d, ctx) {
  if (d.tool === 'test' || d.tool === '[' || d.tool === '[[') {
    const inner = TEST_INNER_TOOL.exec(inv.text || '');
    if (inner) return checkBinary(inner[1], ctx);
  }
  return res('resolved', d.tool, 'shell builtin');
}

function checkBinary(tool, ctx) {
  return needBinary(tool, ctx) || res('resolved', tool, `${tool} found on PATH`);
}

function checkInvocation(inv, ctx) {
  const d = describeInvocation(inv);
  switch (d.kind) {
    case 'runner': return checkRunner(d, ctx);
    case 'script': return checkScript(d, ctx);
    case 'localbin': return checkLocalBin(d, ctx);
    case 'gorun': return checkGoRun(d, ctx);
    case 'builtin': return checkBuiltin(inv, d, ctx);
    case 'inline': return needBinary(d.tool, ctx) || res('unverifiable', d.tool, 'inline shell script (-c) is not analysed');
    default: return checkBinary(d.tool, ctx);
  }
}

/**
 * verifyCommand(command, { root, cwd = '', env, home, which, fs }) -> { status, detail, tool }
 *
 * status: resolved | binary_missing | target_missing | script_missing | unverifiable. `tool` names
 * the invocation that decided the status; `confidence: 'low'` marks a guess (`npx` with nothing
 * installed). The FIRST invocation of the normalised command is always checked; later ones only when
 * they are make/task/just/npm-family tokens (`make lint && pnpm test` checks both runners). The worst
 * status wins: any *_missing outranks unverifiable, which outranks resolved. A command that
 * normalises to nothing (all shell plumbing) is `unverifiable`, never resolved.
 *
 * `which(name)` is injectable (returns a path or null); the default is `resolveBinary` over
 * `env`/`home`. Files are read through the injectable `fs`.
 */
function verifyCommand(command, { root, cwd = '', env = process.env, home = os.homedir(), which = null, fs = nodeFs } = {}) {
  const ctx = {
    root: path.resolve(String(root)),
    fs,
    which: which || ((name) => resolveBinary(name, { env, home, fs })),
  };
  const invocations = normalizeScript(String(command), { cwd: cwd || null });
  if (invocations.length === 0) {
    return res('unverifiable', null, 'no checkable invocation: the command is only shell plumbing');
  }
  const results = [];
  invocations.forEach((inv, i) => {
    if (i === 0 || RUNNER_TOOLS.has(inv.tool)) results.push(checkInvocation(inv, ctx));
  });
  return results.find((r) => MISSING_STATUSES.has(r.status))
    || results.find((r) => r.status === 'unverifiable')
    || results[0];
}

// ─── --run policy ─────────────────────────────────────────────────────────────
//
// `--run` executes a profile's gate commands, so it is the one place this module can do damage. The
// posture is REFUSE UNLESS PROVEN SAFE:
//
//   * only the `run` form of a key ever executes (never `apply`, never codegen/deps),
//   * a deny list is matched against the command AND against everything the command would run:
//     the body of a make/task/just target or npm-family script, and the text of a wrapper script,
//   * expansion is ONE level. A body that invokes another runner target, or a wrapper that invokes
//     another script, cannot be proved safe, so the command is refused as `unverifiable-body`,
//   * a false positive (a `release` target that only builds) is a refusal, never a run. Do not
//     weaken the deny set to fix one; refuse and record it.
//
// The deny list is text, deliberately loose (`git` ... `push` anywhere on the line): over-refusing
// is safe, under-refusing is not.

/** `<tool> ... <verb>` on one shell line: stops at a pipe, `;`, `&` or newline. */
const toolVerb = (tool, verbs) => new RegExp(`\\b(?:${tool})\\b[^|;&\\n]*?\\b(?:${verbs})\\b`);

const RUN_POLICY = Object.freeze({
  defaultKeys: Object.freeze(['format', 'lint', 'typecheck', 'build']),
  optInKeys: Object.freeze(['test', 'e2e', 'audit', 'sast', 'lint_helm', 'lint_docker']),
  neverKeys: Object.freeze(['codegen', 'deps']),
  // Order matters: the first regex that matches a line names the refusal.
  deny: Object.freeze([
    { re: /\b8080\b/, reason: 'port-8080-forbidden' },
    { re: toolVerb('git', 'push'), reason: 'git-push' },
    { re: toolVerb('docker|docker-compose|podman|buildah|nerdctl', 'push'), reason: 'docker-push' },
    { re: /(?:^|\s)--push(?:[\s=]|$)|\bpush=true\b|\btype=registry\b/, reason: 'push-flag' },
    { re: toolVerb('kubectl', 'delete'), reason: 'kubectl-delete' },
    { re: toolVerb('kubectl', 'apply|create|replace|patch|rollout|scale|set|edit|drain|cordon|uncordon|taint|annotate|label|exec|cp|port-forward|run'), reason: 'kubectl-apply' },
    { re: toolVerb('helm|helmfile', 'install|upgrade|uninstall|rollback|delete|apply|sync|destroy'), reason: 'helm-deploy' },
    { re: toolVerb('terraform|tofu|terragrunt|pulumi', 'apply|destroy|import|taint|untaint|up|state|run-all'), reason: 'terraform-apply' },
    { re: toolVerb('gh', 'release'), reason: 'gh-release' },
    { re: /\bgoreleaser\b/, reason: 'goreleaser' },
    { re: new RegExp(`${toolVerb('npm|pnpm|yarn|bun|lerna|changeset|changesets', 'publish').source}|\\b(?:semantic-release|release-it)\\b`), reason: 'npm-publish' },
    { re: /\b(?:dart|flutter)\b[^|;&\n]*?\bpub\b[^|;&\n]*?\bpublish\b/, reason: 'pub-publish' },
    { re: toolVerb('cargo', 'publish|login|yank|owner'), reason: 'cargo-publish' },
    { re: toolVerb('twine|poetry|uv|flit|hatch|pdm', 'upload|publish'), reason: 'python-publish' },
    { re: toolVerb('gem', 'push'), reason: 'gem-push' },
    { re: toolVerb('mvn|mvnw|gradle|gradlew', 'deploy|publish|release'), reason: 'maven-deploy' },
    { re: new RegExp(`${toolVerb('flyctl|fly|vercel|wrangler|firebase|netlify|serverless|sls|cdk|sam|kamal|cap|heroku|railway|doctl|az|aws', 'deploy|publish|release').source}|\\bansible-playbook\\b`), reason: 'deploy-cli' },
    { re: /\bflutter\b[^|;&\n]*?\b(?:run|attach)\b/, reason: 'flutter-run' },
    { re: toolVerb('npm|pnpm|yarn|bun', 'dev|start|serve|watch|preview|storybook'), reason: 'server-or-watch' },
    { re: /\b(?:nodemon|watchexec|webpack-dev-server|live-server|http-server|browser-sync|storybook)\b/, reason: 'server-or-watch' },
    { re: /\b(?:vite|next|nuxt|astro|remix|gatsby|hugo|jekyll|mkdocs|docusaurus|ng|webpack|rails|uvicorn|gunicorn|flask|manage\.py)\s+(?:dev|serve|server|start|preview|s|run|runserver)\b/, reason: 'server-or-watch' },
    { re: /(?:^|\s)--watch(?:All)?\b/, reason: 'server-or-watch' },
    { re: /\b(?:docker|podman|nerdctl)(?:\s+(?:container|compose))?\s+(?:run|up|start|exec)\b|\bdocker-compose\s+(?:run|up|start|exec)\b/, reason: 'container-run' },
  ]),
  skip: Object.freeze([
    { re: toolVerb('docker|docker-compose|podman|buildah|nerdctl', 'build|buildx'), reason: 'container-build' },
  ]),
});

// A runner TARGET named for a release or a server is refused by name (its body may not say so).
const RELEASE_TARGET_NAME = /(?:^|[:_./-])(?:deploy|publish|release|push|ship|promote|rollout|upload)(?:$|[:_./-])/i;
const SERVER_TARGET_NAME = /(?:^|[:_./-])(?:dev|serve|server|watch|run|start|up|preview)(?:$|[:_./-])/i;

// A path that is an installed tool, not a wrapper script to read.
const INSTALLED_TOOL = /(?:^|\/)(?:node_modules\/\.bin|\.venv\/bin|venv\/bin|vendor\/bin)\//;

const MAX_SCRIPT_BYTES = 1024 * 1024;
const TAIL_LINES = 40;
const DEFAULT_TIMEOUT_S = 300;

/** Comment-free logical lines: `\` continuations joined, blanks and `#` lines dropped. Heredoc bodies are KEPT. */
function logicalLines(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    .replace(/\\\n[ \t]*/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

/** scanText(text) -> { deny: {reason, line}|null, skip: {reason, line}|null }. Deny outranks skip. */
function scanText(text) {
  const lines = logicalLines(text);
  for (const line of lines) {
    for (const d of RUN_POLICY.deny) if (d.re.test(line)) return { deny: { reason: d.reason, line }, skip: null };
  }
  for (const line of lines) {
    for (const s of RUN_POLICY.skip) if (s.re.test(line)) return { deny: null, skip: { reason: s.reason, line } };
  }
  return { deny: null, skip: null };
}

const WRAPPER_WORDS = new Set(['sudo', 'time', 'env', 'nohup', 'exec', 'command', 'builtin', 'if', 'elif', 'while', 'until', 'then', 'do', 'else', '!', '{', '}']);
const ENV_ASSIGN_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/;
const CMD_SUBST_EXEC = /(?:\$\(|`)\s*(?:\.{1,2}\/|\/|(?:bin|scripts)\/|(?:bash|sh|zsh|dash|make|task|just|npm|pnpm|yarn|bun)\s)/;

/** The word a shell segment actually runs, past env assignments and wrapper words; null when none. */
function firstCommandWord(segment) {
  const words = splitWords(String(segment).replace(/^[\s@+-]+/, '').replace(/^\(+\s*/, ''));
  let sawWrapper = false;
  for (const w of words) {
    if (ENV_ASSIGN_WORD.test(w)) continue;
    if (WRAPPER_WORDS.has(w)) { sawWrapper = true; continue; }
    if (sawWrapper && w.startsWith('-')) continue;
    return w;
  }
  return null;
}

/**
 * referencesIn(text, cwd) -> { runners: [descriptor], scripts: [descriptor], opaque: [string] }
 *
 * What a body or script REFERENCES that this module would have to expand to prove it safe.
 * `opaque` lists constructs it cannot expand at all: a command that starts with an expansion
 * (`$(DOCKER) push`), `source` / `.` / `eval`, a shell fed a heredoc, and command substitution that
 * runs a script or runner. `$(MAKE)` is read as `make`.
 */
function referencesIn(text, cwd) {
  const refs = { runners: [], scripts: [], opaque: [] };
  const src = String(text == null ? '' : text).replace(/\$\(MAKE\)|\$\{MAKE\}/g, 'make');
  for (const line of logicalLines(src)) {
    const segments = splitTopLevel(line);
    for (const seg of segments) {
      const first = firstCommandWord(seg);
      if (first === null) continue;
      if (first.startsWith('$')) refs.opaque.push(`the command starts with an expansion (${first}), so its tool is unknown`);
      else if (first === 'source' || first === '.' || first === 'eval') refs.opaque.push(`${first} runs code that is not analysed`);
    }
    if (findHeredocs(line).length && segments.some((s) => SHELL_INTERPRETERS.has(firstCommandWord(s)))) {
      refs.opaque.push('a shell is fed a heredoc, which is not analysed');
    }
    if (CMD_SUBST_EXEC.test(line)) refs.opaque.push('command substitution runs a script or runner, which is not analysed');
  }
  for (const inv of normalizeScript(src, { cwd: cwd || null })) {
    const d = describeInvocation(inv);
    if (d.kind === 'runner') refs.runners.push(d);
    else if (d.kind === 'script') {
      if (!INSTALLED_TOOL.test(d.file)) refs.scripts.push(d);
    } else if (d.kind === 'inline') {
      const at = inv.argv.findIndex((a, i) => i > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      if (at !== -1 && inv.argv[at + 1] !== undefined) {
        const inner = referencesIn(inv.argv[at + 1], inv.cwd);
        refs.runners.push(...inner.runners);
        refs.scripts.push(...inner.scripts);
        refs.opaque.push(...inner.opaque);
      }
    }
  }
  return refs;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Prerequisites named on a Makefile rule line for `name` (`build: gen lint`); order-only `|` ignored. */
function makePrereqs(text, name) {
  const found = [];
  const flat = String(text).replace(/\r\n?/g, '\n').replace(/\\\n[ \t]*/g, ' ');
  for (const line of flat.split('\n')) {
    if (line.startsWith('\t') || /^\s*#/.test(line)) continue;
    const m = /^([^:=#\s][^:=#]*?)\s*:{1,2}(?!=)([^#]*)$/.exec(line);
    if (!m || !m[1].trim().split(/\s+/).includes(name)) continue;
    const rest = m[2];
    const semi = rest.indexOf(';');
    const head = semi >= 0 ? rest.slice(0, semi) : rest;
    found.push(...head.split(/\s+/).filter((t) => t && t !== '|'));
  }
  return found;
}

/** Dependencies on the justfile recipe line for `name` (`build: gen`). */
function justPrereqs(text, name) {
  const found = [];
  const re = new RegExp(`^@?${escapeRe(name)}\\b(?:\\s+[^:]*?)?\\s*:(?![=:])\\s*([^#]*)$`);
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s/.test(line)) continue;
    const m = re.exec(line);
    if (m) found.push(...m[1].split(/\s+/).filter(Boolean));
  }
  return found;
}

/** A Taskfile task's raw YAML block (so `defer:` and friends are scanned) and whether it has `deps:`. */
function taskBlock(text, name) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const re = new RegExp(`^(\\s+)(?:${escapeRe(name)}|'${escapeRe(name)}'|"${escapeRe(name)}")\\s*:`);
  const blocks = [];
  let hasDeps = false;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const block = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() !== '' && !/^\s*#/.test(l) && /^\s*/.exec(l)[0].length <= indent) break;
      block.push(l);
    }
    if (block.slice(1).some((l) => /^\s*deps\s*:/.test(l))) hasDeps = true;
    blocks.push(block.join('\n'));
  }
  return { raw: blocks.length ? blocks.join('\n') : null, hasDeps };
}

/** { prereqs: [string], raw: string|null } for a readRunners target, or null when its file is unreadable. */
function targetInfo(ctx, target) {
  let text;
  try {
    text = ctx.fs.readFileSync(path.join(ctx.root, target.file), 'utf-8');
  } catch (_) {
    return null;
  }
  if (target.runner === 'make') return { prereqs: makePrereqs(text, target.name), raw: null };
  if (target.runner === 'just') return { prereqs: justPrereqs(text, target.name), raw: null };
  if (target.runner === 'task') {
    const t = taskBlock(text, target.name);
    return { prereqs: t.hasDeps ? ['deps:'] : [], raw: t.raw };
  }
  return { prereqs: [], raw: null };
}

function getRunners(ctx) {
  if (ctx.runnerList === null) ctx.runnerList = runners.readRunners(ctx.root, { maxDepth: 2 });
  return ctx.runnerList;
}

function findTarget(ctx, d, name) {
  return getRunners(ctx).find((t) => t.runner === d.runner && t.dir === d.dir
    && (t.name === name || (t.aliases || []).includes(name))) || null;
}

const unv = (detail) => ({ type: 'unverifiable', reason: 'unverifiable-body', detail });

/**
 * analyzeText(text, cwd, ctx, { mode, label, scanExtra }) -> [finding]
 *
 * `mode`: 'command' (the gate command itself: runners AND scripts it names are expanded),
 * 'runner-body' (a runner target's body: a wrapper it references is expanded, a runner is not),
 * 'script' (a wrapper script's text: nothing it references is expanded). A finding is
 * { type: deny|name-deny|unverifiable|skip, reason, detail }.
 */
function analyzeText(text, cwd, ctx, { mode, label, scanExtra = null }) {
  const out = [];
  const prefix = mode === 'command' ? '' : 'body:';
  for (const scanned of [text, scanExtra]) {
    if (scanned === null) continue;
    const scan = scanText(scanned);
    if (scan.deny) out.push({ type: 'deny', reason: `${prefix}${scan.deny.reason}`, detail: `${label}: ${scan.deny.line}` });
    if (scan.skip) out.push({ type: 'skip', reason: `${prefix}${scan.skip.reason}`, detail: `${label}: ${scan.skip.line}` });
  }
  const refs = referencesIn(text, cwd);
  for (const o of refs.opaque) out.push(unv(`${label}: ${o}`));
  if (mode === 'command') {
    for (const d of refs.runners) out.push(...analyzeRunner(d, ctx));
    for (const d of refs.scripts) out.push(...analyzeScript(d, ctx));
  } else if (mode === 'runner-body') {
    for (const d of refs.runners) out.push(unv(`${label}: invokes another runner target (${d.tool} ${d.names.join(' ')}); one level only, not expanded`));
    for (const d of refs.scripts) out.push(...analyzeScript(d, ctx, label));
  } else {
    for (const d of refs.runners) out.push(unv(`${label}: invokes another runner target (${d.tool} ${d.names.join(' ')}); not expanded`));
    for (const d of refs.scripts) out.push(unv(`${label}: invokes another script (${d.file}); not expanded`));
  }
  return out;
}

function analyzeScript(d, ctx, via = null) {
  const rel = path.isAbsolute(d.file) ? d.file : path.posix.join(d.cwd || '', d.file);
  const label = `${via ? `${via} -> ` : ''}script ${rel}`;
  const abs = path.isAbsolute(rel) ? rel : path.join(ctx.root, rel);
  let text;
  try {
    const st = ctx.fs.statSync(abs);
    if (!st.isFile()) return [unv(`${label}: not a file`)];
    if (st.size > MAX_SCRIPT_BYTES) return [unv(`${label}: larger than ${MAX_SCRIPT_BYTES} bytes; not analysed`)];
    text = ctx.fs.readFileSync(abs, 'utf-8');
  } catch (_) {
    return [unv(`${label}: absent or unreadable`)];
  }
  if (text.includes('\u0000')) return [unv(`${label}: binary file; not analysed`)];
  return analyzeText(text, d.cwd || '', ctx, { mode: 'script', label });
}

function analyzeRunner(d, ctx) {
  const out = [];
  if (d.unresolvable) return [unv(`${d.tool}: ${d.unresolvable}`)];
  if (d.info) return out;
  if (d.names.length === 0) return [unv(`${d.tool}: the default target is not expanded`)];
  for (const name of d.names) {
    const label = `${d.tool} ${name}`;
    if (RELEASE_TARGET_NAME.test(name)) out.push({ type: 'name-deny', reason: 'deploy-target', detail: `${label}: target name reads as a release or deploy` });
    else if (SERVER_TARGET_NAME.test(name)) out.push({ type: 'name-deny', reason: 'server-target', detail: `${label}: target name reads as a server or watcher` });
    const target = findTarget(ctx, d, name);
    if (!target) {
      out.push(unv(`${label}: target not found statically (included/imported file, or beyond the scanned depth)`));
      continue;
    }
    const info = targetInfo(ctx, target);
    if (!info) {
      out.push(unv(`${label}: runner file unreadable`));
      continue;
    }
    if (info.prereqs.length) out.push(unv(`${label}: has prerequisites (${info.prereqs.join(' ')}); not expanded`));
    const bodies = [{ label, lines: target.body, raw: info.raw }];
    if (d.runner === 'npm') {
      for (const hook of [`pre${name}`, `post${name}`]) {
        const h = findTarget(ctx, d, hook);
        if (h) bodies.push({ label: `${d.tool} ${hook} (npm hook of ${name})`, lines: h.body, raw: null });
      }
    }
    const base = target.cwd !== undefined ? target.cwd : target.dir;
    for (const b of bodies) {
      out.push(...analyzeText(b.lines.join('\n'), base, ctx, { mode: 'runner-body', label: b.label, scanExtra: b.raw }));
    }
  }
  return out;
}

const FINDING_ORDER = ['deny', 'name-deny', 'unverifiable', 'skip'];

function pickFinding(findings) {
  for (const type of FINDING_ORDER) {
    const hit = findings.find((f) => f.type === type);
    if (hit) return hit;
  }
  return null;
}

function keyVerdict(key, form, { include, keys }) {
  if (RUN_POLICY.neverKeys.includes(key) || /\.apply$/.test(String(key))) return 'never-run-key';
  if (form && form !== 'run') return 'mutating-form';
  if (keys && !keys.includes(key)) return 'not-selected';
  if (RUN_POLICY.defaultKeys.includes(key)) return null;
  if (RUN_POLICY.optInKeys.includes(key)) return include.includes(key) ? null : 'not-included';
  return 'key-not-runnable';
}

function tailOf(r) {
  const text = `${r.stdout == null ? '' : r.stdout}${r.stderr == null ? '' : r.stderr}`.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-TAIL_LINES).join('\n');
}

function withSkip(it, reason, detail) {
  return { ...it, skipped: reason, run: { skipped: reason, detail } };
}

function runOne(it, ctx, opts) {
  if (!it || typeof it.command !== 'string' || it.command === '') {
    return withSkip(it, 'no-command', `no command to run (${(it && it.resolve && it.resolve.status) || 'none'})`);
  }
  const why = keyVerdict(it.key, it.form, opts);
  if (why) return withSkip(it, why, `key "${it.key}" is not run by --run (${why})`);
  if (it.resolve && MISSING_STATUSES.has(it.resolve.status)) {
    return withSkip(it, 'not-resolved', `static check said ${it.resolve.status}: ${it.resolve.detail || ''}`.trim());
  }
  const cwdAbs = path.resolve(ctx.root, it.cwd || '');
  const back = path.relative(ctx.root, cwdAbs);
  if (back === '..' || back.startsWith(`..${path.sep}`) || path.isAbsolute(back)) {
    return withSkip(it, 'cwd-outside-repo', `cwd ${it.cwd} is outside the repository`);
  }
  const finding = pickFinding(analyzeText(it.command, it.cwd || '', ctx, { mode: 'command', label: 'command' }));
  if (finding) return withSkip(it, finding.reason, finding.detail);

  const seconds = opts.timeoutS != null ? opts.timeoutS : (it.timeout_s != null ? it.timeout_s : DEFAULT_TIMEOUT_S);
  const started = Date.now();
  const r = opts.spawn('sh', ['-c', it.command], {
    cwd: cwdAbs,
    timeout: seconds * 1000,
    killSignal: 'SIGKILL',
    env: opts.env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  }) || {};
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  const run = {
    exit_code: typeof r.status === 'number' ? r.status : null,
    duration_ms: Date.now() - started,
    timed_out: timedOut,
    tail: tailOf(r),
  };
  if (r.error && !timedOut) run.error = String(r.error.message || r.error);
  return { ...it, run };
}

/**
 * runCommands(items, { root, include = [], keys = null, timeoutS = null, spawn = spawnSync, env, fs })
 *   -> items, each with `run: { exit_code, duration_ms, timed_out, tail }` or `run: { skipped, detail }`
 *
 * `items` are `{ component, key, command, cwd, timeout_s?, form?, resolve? }`. Nothing is spawned for
 * a skipped item, and a skipped item also carries a top-level `skipped` reason (42-11 counts them).
 * The timeout is `timeoutS` when given, else the item's own `timeout_s`, else 300s. A slow or failing
 * command never aborts the batch. The input array and its items are not mutated.
 */
function runCommands(items, { root, include = [], keys = null, timeoutS = null, spawn = spawnSync, env = process.env, fs = nodeFs } = {}) {
  const ctx = { root: path.resolve(String(root)), fs, runnerList: null };
  const opts = { include: include || [], keys: keys && keys.length ? keys : null, timeoutS, spawn, env };
  return items.map((it) => runOne(it, ctx, opts));
}

module.exports = {
  verifyCommand,
  resolveBinary,
  describeInvocation,
  MISSING_STATUSES,
  runCommands,
  RUN_POLICY,
};
