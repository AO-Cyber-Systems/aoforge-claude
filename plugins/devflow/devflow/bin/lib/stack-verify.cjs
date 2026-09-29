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

const { normalizeScript } = require('./stack-shell.cjs');
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

module.exports = {
  verifyCommand,
  resolveBinary,
  describeInvocation,
  MISSING_STATUSES,
};
