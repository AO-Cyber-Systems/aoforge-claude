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

const crypto = require('crypto');
const nodeFs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { normalizeScript, splitTopLevel, splitWords, findHeredocs } = require('./stack-shell.cjs');
const runners = require('./stack-runners.cjs');
const { parseWorkflows } = require('./stack-ci.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

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

// `cwd_missing` (TRD 42-14): the command's directory does not exist under the repo root.
const MISSING_STATUSES = new Set(['binary_missing', 'target_missing', 'script_missing', 'cwd_missing']);

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
 * A non-empty `cwd` is checked FIRST: when `<root>/<cwd>` is not a directory the result is
 * `cwd_missing` and nothing else is looked at (TRD 42-14).
 *
 * status: resolved | cwd_missing | binary_missing | target_missing | script_missing | unverifiable. `tool` names
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
  if (cwd) {
    let dir = false;
    try {
      dir = fs.statSync(path.resolve(ctx.root, String(cwd))).isDirectory();
    } catch (_) {
      dir = false;
    }
    if (!dir) return res('cwd_missing', null, `${cwd} does not exist under the repo root`);
  }
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
//
// Service-backed gates (TRD 71-03, SDR-10). The effect guard below snapshots only the WORK TREE, so it cannot
// see a database write: in the objective 43 follow-up run trades' `test` (`npx vitest --run`) ran against
// whatever was listening on 127.0.0.1:5432. A gate that needs a service is therefore never run silently: it is
// skipped `env_required`, and `--allow-services` (only with `--run`) is the explicit opt-in. An allowed run is
// marked: JSON `run.services_allowed` lists the signals and `--raw` appends ` services=allowed`. Three layers
// of signal, all STATIC (nothing here connects to a port or probes a host):
//
//   1. the gate's own text: the command, a runner body one level deep, a wrapper script. A service URL scheme
//      (`postgres://`), a service variable (`DATABASE_URL`, `*_DSN`, ...) or a loopback host:port;
//   2. the CI job that runs the SAME command in the same directory: it declares `services:`, or env names of
//      that kind (an exact-command match: a hand-edited command that differs from CI is not matched);
//   3. for `test` and `e2e` only, a `.env.test` / `.env.test.local` / `.env.testing` at the root or the gate's
//      directory that sets such a variable. A repo-level test env file says nothing about `lint` or `build`.
//
// A skip detail names the signal (file, job, service, variable, scheme, host:port) and the flag, and never
// echoes a URL, a password or an env value. A deny (`git push`, port 8080, ...) still outranks `env_required`.
//
// Build outputs (TRD 71-04, SDR-10). In the objective 43 follow-up run eden-circle's `make build` wrote
// `bin/circle-api`, which is untracked and not gitignored. The guard removed it, then halted the root, so every
// later Dart/Flutter gate was skipped `side-effect-unsafe`, including the `client/` Flutter gates a Go binary
// cannot affect. A file a `build` gate creates in a conventional output directory is the build doing its job.
// So a `build` gate's NEW, untracked, unignored files under `bin/ build/ dist/ out/ target/` (the first path
// segment, relative to the gate's cwd; `RUN_POLICY.buildOutputDirs`) are removed like any other change (the run
// stays read-only; the emptied directory stays, and git does not list an empty directory), are listed in JSON
// `run.build_outputs` (also in `run.mutated`), and `--raw` appends ` build_outputs=<n>`. They do NOT halt the
// root. Anything else still does: a changed or staged tracked file, a write outside an output directory, any
// non-`build` key, or an output that could not be removed. A gitignored output is not reported at all.

/** `<tool> ... <verb>` on one shell line: stops at a pipe, `;`, `&` or newline. */
const toolVerb = (tool, verbs) => new RegExp(`\\b(?:${tool})\\b[^|;&\\n]*?\\b(?:${verbs})\\b`);

// The refusals the EFFECT guard adds on top of the key policy (TRD 43-02). The key allow list says which
// gates may run; these say a gate may NOT run because its effect on the work tree cannot be contained.
const EFFECT_REASONS = Object.freeze({
  unsafe: 'side-effect-unsafe',     // an earlier command in this root changed files: no more Dart/Flutter gates
  unproven: 'side-effect-unproven', // not a git work tree, so a Dart/Flutter gate's effect cannot be undone
  needsPubGet: 'needs-pub-get',     // `flutter --no-pub` has no resolved package config, and we never run pub get
});

// A service URL scheme, a service variable name and a loopback host:port (TRD 71-03). `SERVICE_ENV_NAME` takes an
// optional prefix (`TEST_DATABASE_URL`, `MIGRATIONS_TEST_DSN`); the loopback lookbehind keeps `[::1]` matchable
// after a space and refuses a longer host name (`db.localhost:5432`).
const SERVICE_SCHEMES = Object.freeze(['postgres', 'postgresql', 'mysql', 'mariadb', 'mongodb', 'mongodb+srv', 'redis', 'rediss', 'amqp', 'amqps', 'nats', 'kafka', 'clickhouse']);
const SERVICE_URL = new RegExp(`(?:^|[^A-Za-z0-9+.-])(${SERVICE_SCHEMES.map(escapeRegExp).join('|')})://`, 'i');
const LOOPBACK_PORT = /(?<![A-Za-z0-9.-])(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})\b/;
const SERVICE_ENV_NAME = /^(?:[A-Z][A-Z0-9_]*_)?(?:DATABASE_URL|DATABASE_URI|DB_URL|DSN|POSTGRES_URL|PG_URL|PGHOST|MYSQL_URL|MONGO_URL|MONGO_URI|MONGODB_URL|MONGODB_URI|REDIS_URL|REDIS_ADDR|AMQP_URL|RABBITMQ_URL|NATS_URL|KAFKA_BROKERS)$/;

const RUN_POLICY = Object.freeze({
  defaultKeys: Object.freeze(['format', 'lint', 'typecheck', 'build']),
  optInKeys: Object.freeze(['test', 'e2e', 'audit', 'sast', 'lint_helm', 'lint_docker']),
  neverKeys: Object.freeze(['codegen', 'deps']),
  // TRD 71-04: the directories whose NEW files a `build` gate may leave (first segment, relative to its cwd).
  buildOutputDirs: Object.freeze(['bin', 'build', 'dist', 'out', 'target']),
  effectReasons: Object.freeze(Object.values(EFFECT_REASONS)),
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
  // TRD 71-03: the service-backed gate policy (see the header paragraph above). `envFileKeys` are the only keys a
  // test env file is read for.
  services: Object.freeze({
    reason: 'env_required',
    optIn: '--allow-services',
    schemes: SERVICE_SCHEMES,
    envName: SERVICE_ENV_NAME,
    envFiles: Object.freeze(['.env.test', '.env.test.local', '.env.testing']),
    envFileKeys: Object.freeze(['test', 'e2e']),
  }),
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

// A `$NAME` / `${NAME}` / `$(NAME)` reference and a `NAME=` assignment (also after `export` or `-e`).
const ENV_REFERENCE = /\$[({]?([A-Za-z_][A-Za-z0-9_]*)/g;
const ENV_ASSIGNMENT = /(?:^|[\s;&|("'`])(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\+?=/g;

/**
 * serviceIn(line) -> what names a service on this shell line, or null. NEVER the line itself, a URL, a password
 * or a value: the first of a service variable referenced or assigned (`references NAME`), a service URL scheme
 * (`a postgres:// URL`) and a loopback host:port (`127.0.0.1:6379`).
 */
function serviceIn(line) {
  const names = [];
  for (const re of [ENV_REFERENCE, ENV_ASSIGNMENT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) names.push({ at: m.index, name: m[1] });
  }
  names.sort((a, b) => a.at - b.at);
  const hit = names.find((n) => SERVICE_ENV_NAME.test(n.name));
  if (hit) return `references ${hit.name}`;
  const url = SERVICE_URL.exec(line);
  if (url) return `a ${url[1].toLowerCase()}:// URL`;
  const loop = LOOPBACK_PORT.exec(line);
  if (loop) return `${loop[1]}:${loop[2]}`;
  return null;
}

/**
 * scanText(text) -> { deny: {reason, line}|null, skip: {reason, line}|null, service: {what}|null }.
 * Deny outranks skip, and a deny is returned alone (`service: null`): a refusal is never softened to a skip.
 */
function scanText(text) {
  const lines = logicalLines(text);
  for (const line of lines) {
    for (const d of RUN_POLICY.deny) if (d.re.test(line)) return { deny: { reason: d.reason, line }, skip: null, service: null };
  }
  let service = null;
  for (const line of lines) {
    const what = serviceIn(line);
    if (what !== null) { service = { what }; break; }
  }
  for (const line of lines) {
    for (const s of RUN_POLICY.skip) if (s.re.test(line)) return { deny: null, skip: { reason: s.reason, line }, service };
  }
  return { deny: null, skip: null, service };
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

// Launchers that run the command that follows them. stack-shell peels sudo/time/env/nohup/exec; these
// are the rest, so `timeout 60 ./scripts/release.sh` is read as the script, not as `timeout`.
const LAUNCHER_TOOLS = new Set(['timeout', 'gtimeout', 'nice', 'ionice', 'xargs', 'stdbuf', 'setsid', 'caffeinate', 'watch', 'unbuffer', 'chronic']);
const ENV_LAUNCHER_TOOLS = new Set(['doppler', 'dotenv', 'direnv', 'mise', 'asdf', 'op', 'aws-vault']);
const LAUNCHER_NOISE = /^\d+(?:\.\d+)?[smhd]?$/;

/** The invocation a launcher runs, or null when `inv` is not a launcher (or names nothing to run). */
function unwrapInvocation(inv) {
  const envLauncher = ENV_LAUNCHER_TOOLS.has(inv.tool);
  if (!LAUNCHER_TOOLS.has(inv.tool) && !envLauncher) return null;
  let rest = inv.argv.slice(1);
  const dd = rest.indexOf('--');
  if (dd !== -1) {
    rest = rest.slice(dd + 1);
  } else {
    let i = 0;
    while (i < rest.length && (rest[i].startsWith('-') || LAUNCHER_NOISE.test(rest[i]) || ENV_ASSIGN_WORD.test(rest[i])
      || (envLauncher && (rest[i] === 'run' || rest[i] === 'exec')))) i++;
    rest = rest.slice(i);
  }
  if (rest.length === 0) return null;
  return { text: rest.join(' '), tool: rest[0], argv: rest, cwd: inv.cwd, env: inv.env };
}

/** Sort one invocation into refs.runners / refs.scripts (looking through launchers and `-c` strings). */
function collectRefs(inv, refs, depth = 0) {
  const d = describeInvocation(inv);
  if (d.kind === 'runner') {
    refs.runners.push(d);
  } else if (d.kind === 'script') {
    if (!INSTALLED_TOOL.test(d.file)) refs.scripts.push(d);
  } else if (d.kind === 'inline') {
    const at = inv.argv.findIndex((a, i) => i > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
    if (at !== -1 && inv.argv[at + 1] !== undefined) {
      const inner = referencesIn(inv.argv[at + 1], inv.cwd);
      refs.runners.push(...inner.runners);
      refs.scripts.push(...inner.scripts);
      refs.opaque.push(...inner.opaque);
    }
  } else if (depth < 4) {
    const inner = unwrapInvocation(inv);
    if (inner) collectRefs(inner, refs, depth + 1);
  }
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
  for (const inv of normalizeScript(src, { cwd: cwd || null })) collectRefs(inv, refs);
  return refs;
}

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
  const re = new RegExp(`^@?${escapeRegExp(name)}\\b(?:\\s+[^:]*?)?\\s*:(?![=:])\\s*([^#]*)$`);
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
  const re = new RegExp(`^(\\s+)(?:${escapeRegExp(name)}|'${escapeRegExp(name)}'|"${escapeRegExp(name)}")\\s*:`);
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
 * { type: deny|name-deny|unverifiable|service|skip, reason, detail }.
 */
function analyzeText(text, cwd, ctx, { mode, label, scanExtra = null }) {
  const out = [];
  const prefix = mode === 'command' ? '' : 'body:';
  for (const scanned of [text, scanExtra]) {
    if (scanned === null) continue;
    const scan = scanText(scanned);
    if (scan.deny) out.push({ type: 'deny', reason: `${prefix}${scan.deny.reason}`, detail: `${label}: ${scan.deny.line}` });
    if (scan.skip) out.push({ type: 'skip', reason: `${prefix}${scan.skip.reason}`, detail: `${label}: ${scan.skip.line}` });
    // TRD 71-03: the reason is exactly `env_required` (no `body:` prefix), and the detail is the signal, not the line.
    if (scan.service) out.push({ type: 'service', reason: RUN_POLICY.services.reason, detail: `${label}: ${scan.service.what}` });
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

const FINDING_ORDER = ['deny', 'name-deny', 'unverifiable', 'service', 'skip'];

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

// ─── The effect guard (TRD 43-02, SDR-03) ─────────────────────────────────────
//
// The key allow list above is POLICY: it says which gates may run. It cannot see what a command DOES.
// In objective 42's rollout the "safe" lint key ran `flutter analyze --fatal-infos`, which rewrote
// analysis_options.yaml and ran an implicit `pub get` that bumped pubspec.lock. So every spawned command
// is bracketed by a snapshot of the git work tree, and whatever it changed is reported and put back.
// THE GUARD IS AUTHORITATIVE; the key list and `--no-pub` only make it fire less often.
//
//   * Compare CONTENT, not status codes. aocore and aodex were already dirty on exactly the files flutter
//     touches, so ` M` before and ` M` after would hide a second modification. Every listed path is hashed.
//   * A path that was clean before and is listed after has HEAD as its before-state, so git restores it.
//   * A path that was dirty before is restored from the bytes saved before the run (up to 1 MB). Larger
//     files cannot be held, so they are reported `restored: false` with the path listed.
//   * Git runs through the REAL spawnSync (or `opts.git`), never through `opts.spawn`: the injected spawn
//     of the existing tests would otherwise receive git calls.
//   * The index is not restored for a path that was dirty before: a command that stages a user's
//     uncommitted edit changes the index, not the content the guard compares.

const MAX_RESTORE_BYTES = 1024 * 1024;
const GIT_TIMEOUT_MS = 120 * 1000;
const GIT_MAX_BUFFER = 256 * 1024 * 1024;

// Variables git reads that would point it at some other repository (they are set inside a git hook).
const GIT_ENV_DROP = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'];

/** `git` must not take the index lock (a concurrent writer would fail) and must not start a daemon. */
function gitEnv() {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const k of GIT_ENV_DROP) delete env[k];
  return env;
}

/** The completed git result, or null when git is absent, failed or timed out. */
function runGit(git, cwd, args, input) {
  const r = git('git', ['-c', 'core.fsmonitor=false', '-C', cwd, ...args], {
    encoding: 'utf-8',
    env: gitEnv(),
    input,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return r && !r.error && r.status === 0 ? r : null;
}

/** `status --porcelain=v1 -z` -> Map(path -> XY). A rename names its source too (a deletion); a copy keeps it. */
function parseStatusZ(text) {
  const codes = new Map();
  const records = String(text).split('\0');
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.length < 4) continue;
    const code = rec.slice(0, 2);
    codes.set(rec.slice(3), code);
    if (/[RC]/.test(code)) {
      const from = records[++i];
      if (from && !code.includes('C')) codes.set(from, code[0] === 'R' ? 'D ' : ' D');
    }
  }
  return codes;
}

/** A path HEAD does not have (untracked, added, copied or renamed to). Its before-state is "absent". */
const isNewToHead = (entry) => /^(?:\?\?|[ACR]|.A)/.test(entry.code);

/** git's own blob id for a file's bytes: the fallback when `hash-object` cannot be used (a path with a newline). */
function blobSha1(abs, fs) {
  let data;
  try { data = fs.readFileSync(abs); } catch (_) { return 'unreadable'; }
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

/** One `git hash-object --stdin-paths` call for every regular file (no filters, so CRLF is not normalised). */
function hashFiles(top, rels, { git, fs }) {
  const hashes = new Map();
  const viaGit = rels.filter((rel) => !/[\r\n]/.test(rel));
  if (viaGit.length) {
    const r = runGit(git, top, ['hash-object', '--no-filters', '--stdin-paths'], `${viaGit.join('\n')}\n`);
    const lines = r ? String(r.stdout).split('\n').filter((l) => l !== '') : [];
    if (lines.length === viaGit.length) viaGit.forEach((rel, i) => hashes.set(rel, lines[i]));
  }
  for (const rel of rels) if (!hashes.has(rel)) hashes.set(rel, blobSha1(path.join(top, rel), fs));
  return hashes;
}

/** What is on disk at `rel` now: existence, kind, permission bits, size and (links) target. Files are hashed later. */
function describePath(top, rel, fs) {
  const abs = path.join(top, rel);
  let st;
  try { st = fs.lstatSync(abs); } catch (_) { return { exists: false, kind: 'none', hash: null, mode: 0, size: 0 }; }
  const mode = st.mode & 0o777;
  if (st.isSymbolicLink()) {
    let target = '';
    try { target = fs.readlinkSync(abs); } catch (_) { /* a dangling read is still a link */ }
    return { exists: true, kind: 'link', hash: `link:${target}`, mode, size: st.size, target };
  }
  if (st.isDirectory()) return { exists: true, kind: 'dir', hash: 'dir', mode, size: 0 };
  if (!st.isFile()) return { exists: true, kind: 'other', hash: `other:${st.mode}`, mode, size: st.size };
  return { exists: true, kind: 'file', hash: null, mode, size: st.size };
}

/**
 * snapshotTree(root, { fs, git, also, withBytes }) -> { top, files: Map(path -> entry) } | null
 *
 * `files` holds every path `git status --porcelain=v1 -z -uall` lists (ignored paths are never listed),
 * each as `{ listed, code, exists, kind, hash, mode, size, bytes? }`; paths are relative to `top`, the
 * work tree's top level. A path NOT in `files` was clean: its content is HEAD's. `also` names extra paths
 * to describe even when clean (the paths that were dirty BEFORE the run, so the after-snapshot can still
 * compare them once the command has made them clean). `withBytes` keeps the bytes of files up to 1 MB,
 * which is what a restore writes back. Returns null when `root` is not a git work tree or git failed.
 */
function snapshotTree(root, { fs = nodeFs, git = spawnSync, also = [], withBytes = false } = {}) {
  const topResult = runGit(git, root, ['rev-parse', '--show-toplevel']);
  if (!topResult) return null;
  const top = String(topResult.stdout).replace(/\r?\n$/, '');
  if (!top) return null;
  const status = runGit(git, top, ['status', '--porcelain=v1', '-z', '-uall', '--ignored=no']);
  if (!status) return null;

  const wanted = parseStatusZ(status.stdout);
  for (const rel of also) if (!wanted.has(rel)) wanted.set(rel, null);

  const files = new Map();
  const toHash = [];
  for (const [rel, code] of wanted) {
    const entry = { listed: code !== null, code: code === null ? '' : code, ...describePath(top, rel, fs) };
    if (entry.kind === 'file') toHash.push(rel);
    files.set(rel, entry);
  }
  const hashes = hashFiles(top, toHash, { git, fs });
  for (const rel of toHash) {
    const entry = files.get(rel);
    entry.hash = hashes.get(rel);
    if (withBytes && entry.size <= MAX_RESTORE_BYTES) {
      try { entry.bytes = fs.readFileSync(path.join(top, rel)); } catch (_) { /* restored:false later */ }
    }
  }
  return { top, files };
}

const sameEntry = (b, a) => b.exists === a.exists && b.kind === a.kind && b.hash === a.hash && b.mode === a.mode;

/**
 * diffTree(before, after) -> [{ path, change: 'added'|'deleted'|'modified' }], sorted by path.
 *
 * Compares the union of both snapshots. A path clean before and listed after changed (its before-state
 * is HEAD). A path dirty before is compared by existence, kind, content hash and permission bits against
 * its description in `after` (which `also` guarantees). A path listed in neither was clean both times.
 */
function diffTree(before, after) {
  const delta = [];
  const paths = [...new Set([...before.files.keys(), ...after.files.keys()])].sort();
  for (const rel of paths) {
    const b = before.files.get(rel);
    const a = after.files.get(rel);
    if (!b) {
      if (!a || !a.listed) continue;
      delta.push({ path: rel, change: isNewToHead(a) ? 'added' : (a.exists ? 'modified' : 'deleted') });
    } else if (a && !sameEntry(b, a)) {
      delta.push({ path: rel, change: !b.exists ? 'added' : (!a.exists ? 'deleted' : 'modified') });
    }
  }
  return delta;
}

/** Remove a file or symlink; refuses (false) to remove a directory, which may hold the user's files. */
function removeNonDir(fs, abs) {
  let st;
  try { st = fs.lstatSync(abs); } catch (_) { return true; }
  if (st.isDirectory()) return false;
  fs.unlinkSync(abs);
  return true;
}

function restorePath(before, after, rel, { fs, git }) {
  const top = before.top;
  const abs = path.join(top, rel);
  const b = before.files.get(rel);
  const a = after.files.get(rel);
  try {
    if (!b) {
      // Clean before: HEAD (index and work tree) is the before-state.
      if (isNewToHead(a)) {
        // Staged by the command: drop it from the index, then from disk.
        if (/^(?:[ACR]|.A)/.test(a.code) && runGit(git, top, ['rm', '--cached', '-q', '-f', '--', rel]) === null) return false;
        return removeNonDir(fs, abs);
      }
      return runGit(git, top, ['checkout', 'HEAD', '--', rel]) !== null;
    }
    if (!b.exists) return removeNonDir(fs, abs);
    if (b.kind === 'file' && b.bytes !== undefined) {
      let cur = null;
      try { cur = fs.lstatSync(abs); } catch (_) { /* gone: written fresh below */ }
      if (cur && cur.isDirectory()) return false;
      if (cur && cur.isSymbolicLink()) fs.unlinkSync(abs); // never write THROUGH a link the command left
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, b.bytes);
      fs.chmodSync(abs, b.mode);
      return true;
    }
    if (b.kind === 'link') {
      if (!removeNonDir(fs, abs)) return false;
      fs.symlinkSync(b.target, abs);
      return true;
    }
    return false; // over 1 MB, a directory, or something that is not a plain file
  } catch (_) {
    return false;
  }
}

/**
 * restoreTree(before, delta, after, { fs, git }) -> { restored, unrestored: [path] }
 *
 * Puts every changed path back: an untracked or newly added path is removed (and unstaged); a path that
 * was clean before is checked out from HEAD; a path that was dirty before is rewritten from its saved bytes
 * with its permission bits. `restored` is true only when every path was put back.
 */
function restoreTree(before, delta, after, { fs = nodeFs, git = spawnSync } = {}) {
  const unrestored = [];
  for (const d of delta) {
    if (!restorePath(before, after, d.path, { fs, git })) unrestored.push(d.path);
  }
  return { restored: unrestored.length === 0, unrestored };
}

// Tools whose gates rewrite the work tree behind the command's back (`pub get`, lockfiles, analyzer
// options). fvm/puro/melos/very_good/dcm are launchers or Dart-ecosystem drivers for the same tools.
const DART_TOOLS = new Set(['dart', 'flutter', 'fvm', 'puro', 'melos', 'very_good', 'dcm']);

/** Every tool a command invokes directly: past env/sudo/time prefixes, `cd x &&` chains, launchers and `sh -c "..."`. */
function directTools(command, depth = 0, into = new Set()) {
  if (depth > 4) return into;
  for (const inv of normalizeScript(String(command))) {
    let cur = inv;
    for (let i = 0; cur && i < 4; i++) {
      const name = path.posix.basename(cur.tool);
      into.add(name);
      if (SHELL_INTERPRETERS.has(name)) {
        const at = cur.argv.findIndex((w, k) => k > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w));
        if (at !== -1 && cur.argv[at + 1] !== undefined) directTools(cur.argv[at + 1], depth + 1, into);
      }
      cur = unwrapInvocation(cur);
    }
  }
  return into;
}

function isDartFlutter(command) {
  for (const tool of directTools(command)) if (DART_TOOLS.has(tool)) return true;
  return false;
}

// A single direct `flutter analyze|test`, optionally behind `VAR=value ` assignments and a path to the binary.
const DIRECT_FLUTTER_GATE = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:\S*\/)?flutter\s+(?:analyze|test)(?:\s|$)/;
const SHELL_CONTROL_WORD = /^(?:\|\|?|&&?|;)$/;

/**
 * noPubRewrite(command) -> the command with ` --no-pub` appended, or null when it must run as written.
 *
 * Prevention, ahead of the effect guard: `flutter analyze|test` runs an implicit `pub get` that bumps
 * pubspec.lock (objective 42's rollout). `--no-pub` stops it. Only a SINGLE DIRECT invocation is rewritten:
 * `flutter analyze` or `flutter test`, optional leading env assignments, no `&&` `;` `|` `&`, no subshell or
 * comment, and no `--pub` / `--no-pub` already (the author's choice stands). A wrapper (`make lint`,
 * `fvm flutter analyze`, `sh -c`) is not rewritten: appending a flag to the wrapper would not reach flutter.
 * The effect guard still applies to every one of them. `dart analyze|test|format` have no pub flag.
 */
function noPubRewrite(command) {
  const text = String(command).trim();
  if (/\n/.test(text) || /(?:^|\s)#/.test(text) || /\\$/.test(text)) return null;
  if (!DIRECT_FLUTTER_GATE.test(text) || splitTopLevel(text).length !== 1) return null;
  const invocations = normalizeScript(text);
  if (invocations.length !== 1) return null;
  const { argv } = invocations[0];
  if (argv.some((w) => w === '--pub' || w === '--no-pub' || w === '--' || SHELL_CONTROL_WORD.test(w))) return null;
  return `${text} --no-pub`;
}

/**
 * Is there a resolved package config for a command run in `cwdAbs`? `--no-pub` needs one, and this module
 * never runs `pub get`. It sits next to the package's pubspec; a pub-workspace member (`resolution:
 * workspace`, Dart 3.6+) resolves through the workspace root's, so those climb to the repo root.
 */
function packageConfigPresent(ctx, cwdAbs) {
  const has = (dir) => ctx.fs.existsSync(path.join(dir, '.dart_tool', 'package_config.json'));
  if (has(cwdAbs)) return true;
  let member = false;
  try { member = /^resolution:\s*workspace\b/m.test(ctx.fs.readFileSync(path.join(cwdAbs, 'pubspec.yaml'), 'utf-8')); } catch (_) { /* no pubspec: not a member */ }
  if (!member) return false;
  for (let dir = cwdAbs; dir !== ctx.root && dir !== path.dirname(dir);) {
    dir = path.dirname(dir);
    if (has(dir)) return true;
  }
  return false;
}

const haltedDetail = (halted) => (halted.path
  ? `an earlier command in this root changed tracked or untracked files: ${halted.path}`
  : 'an earlier command in this root left the work tree in an unverifiable state');

// ─── Service signals outside the gate's own text (TRD 71-03) ─────────────────

const squash = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
/** `''` is the repo root: `null`, `.`, `./` and a trailing slash all mean it. */
const rootRelative = (c) => (c == null ? '' : String(c).replace(/^\.\/+/, '').replace(/\/+$/, '').replace(/^\.$/, ''));
const SERVICE_HINT = ` (pass ${RUN_POLICY.services.optIn} to run it against whatever service is listening)`;

/** The workflow steps of the repo, read once per run; a reader failure is "no CI signal", never a crash. */
function ciStepsOf(ctx) {
  if (ctx.ciSteps === null || ctx.ciSteps === undefined) {
    try {
      ctx.ciSteps = parseWorkflows(ctx.root);
    } catch (_) {
      ctx.ciSteps = [];
    }
  }
  return ctx.ciSteps;
}

/** CI signals: the job that runs EXACTLY this command in this directory declares services or service env names. */
function ciSignals(item, ctx) {
  const want = squash(item.command);
  const wantCwd = rootRelative(item.cwd);
  const out = [];
  for (const step of ciStepsOf(ctx)) {
    const runsIt = (step.invocations || []).some((inv) => !inv.external && squash(inv.text) === want && rootRelative(inv.cwd) === wantCwd);
    if (!runsIt) continue;
    const where = `CI job \`${step.job}\` (${step.file}) runs it with`;
    if (Array.isArray(step.services) && step.services.length) out.push(`${where} services ${step.services.join(', ')}`);
    const names = (step.envNames || []).filter((n) => RUN_POLICY.services.envName.test(n));
    if (names.length) out.push(`${where} env ${names.join(', ')}`);
  }
  return out;
}

/** Names of the service variables a test env file sets (`NAME=...`, `export NAME=...`); values are never kept. */
function envFileNames(abs, ctx) {
  let text;
  try {
    if (!ctx.fs.statSync(abs).isFile()) return [];
    text = ctx.fs.readFileSync(abs, 'utf-8');
  } catch (_) {
    return [];
  }
  const names = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(raw);
    if (m && RUN_POLICY.services.envName.test(m[1]) && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/** Env-file signals, for `test` and `e2e` only: a test env file at the repo root or the gate's own directory. */
function envFileSignals(item, ctx) {
  if (!RUN_POLICY.services.envFileKeys.includes(item.key)) return [];
  const dirs = [...new Set(['', rootRelative(item.cwd)])];
  const out = [];
  for (const dir of dirs) {
    for (const file of RUN_POLICY.services.envFiles) {
      const rel = dir ? path.posix.join(dir, file) : file;
      const names = envFileNames(path.join(ctx.root, rel), ctx);
      if (names.length) out.push(`${rel} sets ${names.join(', ')}`);
    }
  }
  return out;
}

/**
 * serviceSignals(item, ctx) -> [detail]
 *
 * The signals that do NOT come from the gate's own text: the CI job that runs the same command, then (for the
 * keys in `RUN_POLICY.services.envFileKeys`) a test env file. `ctx` is `{ root, fs }` (+ a `ciSteps` cache that
 * is filled on first use). Each detail names a file, job, service or variable, and never a value.
 */
function serviceSignals(item, ctx) {
  if (!item || typeof item.command !== 'string' || item.command === '') return [];
  return [...new Set([...ciSignals(item, ctx), ...envFileSignals(item, ctx)])];
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
  const findings = analyzeText(it.command, it.cwd || '', ctx, { mode: 'command', label: 'command' });
  const finding = pickFinding(opts.allowServices ? findings.filter((f) => f.type !== 'service') : findings);
  if (finding && finding.type !== 'service') return withSkip(it, finding.reason, finding.detail);

  // Service-backed gates (TRD 71-03): the text signals found above plus CI and test env files. Without
  // `--allow-services` any signal skips the gate `env_required`; with it the gate runs and the run lists them.
  const signals = [...new Set([...findings.filter((f) => f.type === 'service').map((f) => f.detail), ...serviceSignals(it, ctx)])];
  if (signals.length && !opts.allowServices) return withSkip(it, RUN_POLICY.services.reason, `${signals.join('; ')}${SERVICE_HINT}`);

  // The effect guard. Only a Dart/Flutter gate is refused by it (`pub get`, lockfiles and analyzer options
  // are what those tools rewrite); every other tool is merely bracketed and restored.
  const dartFlutter = isDartFlutter(it.command);
  if (dartFlutter && ctx.halted) return withSkip(it, EFFECT_REASONS.unsafe, haltedDetail(ctx.halted));

  // Prevention: run `flutter analyze|test` with --no-pub (only the executed text; it.command is never
  // modified). That needs a resolved package config, and we never run `pub get` to make one.
  const rewritten = noPubRewrite(it.command);
  if (rewritten !== null && !packageConfigPresent(ctx, cwdAbs)) {
    return withSkip(it, EFFECT_REASONS.needsPubGet, 'flutter --no-pub needs a resolved package config (.dart_tool/package_config.json); run pub get yourself first');
  }
  const commandToRun = rewritten !== null ? rewritten : it.command;

  const before = snapshotTree(ctx.root, { fs: ctx.fs, git: opts.git, withBytes: true });
  if (before === null && dartFlutter) {
    return withSkip(it, EFFECT_REASONS.unproven, 'not a git work tree (or git is unavailable), so a change this command makes could not be detected and undone');
  }

  const seconds = opts.timeoutS != null ? opts.timeoutS : (it.timeout_s != null ? it.timeout_s : DEFAULT_TIMEOUT_S);
  const started = Date.now();
  const r = opts.spawn('sh', ['-c', commandToRun], {
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
  if (rewritten !== null) run.rewritten = rewritten;
  if (signals.length) run.services_allowed = signals;
  if (before !== null) guardEffects(it, ctx, opts, before, run);
  return { ...it, run };
}

/**
 * isBuildOutput(it, d) -> boolean. True for a delta entry that is a `build` gate's product (TRD 71-04): the
 * gate's key is `build`, the path is `added` (new to HEAD, so untracked), and relative to the gate's cwd it
 * stays inside the cwd and starts with one of `RUN_POLICY.buildOutputDirs`. A `modified` or `deleted` path is
 * never an output, and neither is anything under another key.
 */
function isBuildOutput(it, d) {
  if (!it || it.key !== 'build' || !d || d.change !== 'added') return false;
  const rel = path.posix.relative(rootRelative(it.cwd), String(d.path));
  if (rel === '' || rel === '..' || rel.startsWith('../') || path.posix.isAbsolute(rel)) return false;
  return RUN_POLICY.buildOutputDirs.includes(rel.split('/')[0]);
}

/**
 * Diff the work tree against `before`, restore whatever the command changed, and record it on `run`:
 * `mutated: [{path, change}]`, `restored` (true only if EVERY path was put back and a third snapshot
 * agrees), `unrestored: [path]` when not. An after-snapshot that cannot be taken (git failed mid-run) is
 * `mutated_unknown`. Either way the root is halted for the remaining Dart/Flutter gates.
 *
 * The one exception (TRD 71-04): a `build` gate's new files under an output directory are also listed in
 * `build_outputs` and do not halt the root. Any other changed path, or a restore that did not fully succeed,
 * still halts it, and the halt names the first path that is NOT an output.
 */
function guardEffects(it, ctx, opts, before, run) {
  const deps = { fs: ctx.fs, git: opts.git };
  const also = [...before.files.keys()];
  const after = snapshotTree(ctx.root, { ...deps, also });
  if (after === null) {
    run.mutated_unknown = true;
    ctx.halted = { key: it.key, path: null };
    return;
  }
  const delta = diffTree(before, after);
  if (delta.length === 0) return;

  const result = restoreTree(before, delta, after, deps);
  const again = snapshotTree(ctx.root, { ...deps, also });
  const left = again === null ? null : diffTree(before, again).map((d) => d.path);
  const unrestored = [...new Set([...result.unrestored, ...(left || [])])].sort();
  run.mutated = delta;
  run.restored = result.restored && left !== null && left.length === 0;
  if (unrestored.length) run.unrestored = unrestored;
  const outputs = delta.filter((d) => isBuildOutput(it, d)).map((d) => d.path);
  const others = delta.filter((d) => !isBuildOutput(it, d));
  if (outputs.length) run.build_outputs = outputs;
  if (others.length || !run.restored) ctx.halted = { key: it.key, path: (others[0] || delta[0]).path };
}

/**
 * runCommands(items, { root, include = [], keys = null, timeoutS = null, spawn = spawnSync, env, fs })
 *   -> items, each with `run: { exit_code, duration_ms, timed_out, tail }` or `run: { skipped, detail }`
 *
 * `items` are `{ component, key, command, cwd, timeout_s?, form?, resolve? }`. Nothing is spawned for
 * a skipped item, and a skipped item also carries a top-level `skipped` reason (42-11 counts them).
 * The timeout is `timeoutS` when given, else the item's own `timeout_s`, else 300s. A slow or failing
 * command never aborts the batch. The input array and its items are not mutated.
 *
 * Effect guard (43-02): each spawned command is bracketed by a snapshot of the git work tree. What it
 * changed is restored and reported as `run.mutated` / `run.restored`; after one change the remaining
 * Dart/Flutter items for this root are skipped `side-effect-unsafe`. Outside a git work tree a
 * Dart/Flutter item is refused `side-effect-unproven`. `git` (default spawnSync) runs the snapshots and is
 * separate from `spawn`, which only ever runs the gate commands.
 *
 * Build outputs (71-04): a `build` gate's new, untracked, unignored files under `bin/ build/ dist/ out/ target/`
 * (relative to its cwd) are removed like any change, listed in `run.build_outputs`, and do NOT halt the root;
 * any other change, or an output that could not be removed, halts as above.
 *
 * Service-backed gates (71-03): a gate whose text, CI job or (test/e2e) env file names a service is skipped
 * `env_required` and never spawned, unless `allowServices` is true; then it runs and `run.services_allowed`
 * lists the signals. The CI workflows are read once per call, and only when an item gets that far.
 */
function runCommands(items, { root, include = [], keys = null, timeoutS = null, spawn = spawnSync, git = spawnSync, env = process.env, fs = nodeFs, allowServices = false } = {}) {
  const ctx = { root: path.resolve(String(root)), fs, runnerList: null, halted: null, ciSteps: null };
  const opts = { include: include || [], keys: keys && keys.length ? keys : null, timeoutS, spawn, git, env, allowServices: allowServices === true };
  return items.map((it) => runOne(it, ctx, opts));
}

// ─── aof-tools stack verify ────────────────────────────────────────────────────

const PROBE_FILE = '__probe__';

const VERIFY_FLAGS_WITH_VALUE = new Set(['--include', '--keys', '--timeout']);
const VERIFY_FLAGS = new Set(['--run', '--draft', '--allow-services', ...VERIFY_FLAGS_WITH_VALUE]);

class UsageError extends Error {}

/**
 * Parse `stack verify` args (everything after the subcommand). Unknown flags and positionals throw, and so does
 * `--allow-services` without `--run`: it opts a RUN into service-backed gates, so there is nothing to opt into.
 */
function parseVerifyArgs(args) {
  const opts = { run: false, draft: false, allowServices: false, include: [], keys: null, timeoutS: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!VERIFY_FLAGS.has(a)) {
      throw new UsageError(a.startsWith('-')
        ? `unknown flag ${a}. stack verify takes: --run, --allow-services (with --run), --include a,b, --keys a,b, --timeout <seconds>, --draft`
        : `stack verify takes no positional argument (got "${a}")`);
    }
    if (a === '--run') opts.run = true;
    else if (a === '--draft') opts.draft = true;
    else if (a === '--allow-services') opts.allowServices = true;
    else {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${a} needs a value`);
      i++;
      if (a === '--timeout') {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--timeout needs a positive number of seconds (got "${value}")`);
        opts.timeoutS = n;
      } else {
        const list = value.split(',').map((s) => s.trim()).filter(Boolean);
        if (a === '--include') opts.include = list;
        else opts.keys = list;
      }
    }
  }
  if (opts.allowServices && !opts.run) throw new UsageError('--allow-services needs --run');
  return opts;
}

const RESOLVE_BUCKET = { resolved: 'resolved', unverifiable: 'unverifiable', discover: 'discover', none: 'none' };

function summarize(results) {
  const s = { resolved: 0, missing: 0, unverifiable: 0, discover: 0, none: 0, ran: 0, failed: 0, skipped: 0 };
  for (const r of results) {
    const status = r.resolve.status;
    if (MISSING_STATUSES.has(status)) s.missing++;
    else if (RESOLVE_BUCKET[status]) s[RESOLVE_BUCKET[status]]++;
    if (r.run) {
      if (r.run.skipped !== undefined) s.skipped++;
      else {
        s.ran++;
        if (r.run.exit_code !== 0) s.failed++;
      }
    }
  }
  return s;
}

/**
 * verifyStack({ projectRoot, userHome, draft, run, allowServices, include, keys, timeoutS, env, spawn, which, fs })
 *   -> { result: { profile_source, profile_file, results, summary }, exitCode }
 *
 * Read-only: `.aoforge/STACK.md` is only read, and `--draft` verifies `initProfile(write:false)`.
 * Exported so 42-11 can call it without a subprocess.
 */
function verifyStack({ projectRoot, userHome = null, draft = false, run = false, allowServices = false, include = [], keys = null, timeoutS = null, env = process.env, spawn = spawnSync, which = null, fs = nodeFs } = {}) {
  // Required here, not at load time: stack-profile requires this module lazily, and the
  // extensions require stack-profile, so a top-level require would be a cycle.
  const sp = require('./stack-profile.cjs');
  const root = path.resolve(String(projectRoot));

  let viewOf;
  let profileFile = null;
  if (draft) {
    const preview = sp.initProfile({ projectRoot: root, userHome, write: false });
    const parsed = sp.parseProfile(preview.text, { source: preview.path });
    viewOf = (file) => sp.resolveFromParsed(parsed, { userHome, file, projectRoot: root, targetPath: preview.path });
  } else {
    viewOf = (file) => sp.resolveProfile({ projectRoot: root, userHome, file });
  }

  const rootView = viewOf(null);
  if (!draft) profileFile = rootView.projectFile || null;
  const rootCommands = (rootView.frontmatter && rootView.frontmatter.commands) || {};

  const views = [{ component: null, view: rootView, only: null }];
  const components = Array.isArray(rootView.frontmatter && rootView.frontmatter.components) ? rootView.frontmatter.components : [];
  for (const comp of components) {
    if (!comp || typeof comp.path !== 'string') continue;
    views.push({ component: comp.path, view: viewOf(path.posix.join(comp.path, PROBE_FILE)), only: rootCommands });
  }

  const results = [];
  for (const { component, view, only } of views) {
    const commands = (view.frontmatter && view.frontmatter.commands) || {};
    for (const key of Object.keys(commands)) {
      // A component view inherits the root's commands; report only what it overrides.
      if (only && JSON.stringify(only[key]) === JSON.stringify(commands[key])) continue;
      const rendered = sp.renderCommand(view, key, {});
      const base = { component, key };
      if (rendered.status !== 'ok') {
        const item = { ...base, command: null, resolve: { status: rendered.status } };
        if (rendered.cwd !== undefined) item.cwd = rendered.cwd;
        results.push(item);
        continue;
      }
      // cwd is taken from renderCommand AS-IS: the component cwd join belongs to renderCommand (42-05).
      const item = { ...base, command: rendered.command };
      if (rendered.cwd !== undefined) item.cwd = rendered.cwd;
      if (rendered.timeout_s !== undefined) item.timeout_s = rendered.timeout_s;
      item.form = rendered.form;
      item.resolve = verifyCommand(rendered.command, { root, cwd: rendered.cwd || '', env, home: userHome || os.homedir(), which, fs });
      results.push(item);
    }
  }

  const finalResults = run
    ? runCommands(results, { root, include, keys, timeoutS, spawn, env, fs, allowServices })
    : results;
  for (const r of finalResults) delete r.form;

  const summary = summarize(finalResults);
  const result = {
    profile_source: draft ? 'draft' : 'file',
    profile_file: profileFile,
    results: finalResults,
    summary,
  };
  return { result, exitCode: summary.missing > 0 || summary.failed > 0 ? 1 : 0 };
}

/**
 * The compact `--raw` table: `key[@component] status` (a run appends ` run=<exit>` or ` skipped=<reason>`).
 * A run that changed the work tree adds ` mutated=<n>` (` restored=false` when it could not be put back), or
 * ` mutated=unknown` when the after-state could not be read: a change must never be invisible in this view.
 * A run that `--allow-services` let reach a service adds ` services=allowed` right after `run=` (TRD 71-03).
 * A `build` gate whose new files under an output directory were removed adds ` build_outputs=<n>` after the
 * `mutated=` part (TRD 71-04), so the suffix order is `run=`, `services=allowed`, `mutated=`, `build_outputs=`.
 */
function rawTable(result) {
  const lines = result.results.map((r) => {
    let line = `${r.key}${r.component ? `@${r.component}` : ''} ${r.resolve.status}`;
    if (r.run) {
      line += r.run.skipped !== undefined ? ` skipped=${r.run.skipped}` : ` run=${r.run.timed_out ? 'timeout' : r.run.exit_code}`;
      if (r.run.services_allowed) line += ' services=allowed';
      if (r.run.mutated) line += ` mutated=${r.run.mutated.length}${r.run.restored ? '' : ' restored=false'}`;
      else if (r.run.mutated_unknown) line += ' mutated=unknown';
      if (r.run.build_outputs) line += ` build_outputs=${r.run.build_outputs.length}`;
    }
    return line;
  });
  return `${lines.join('\n')}\n`;
}

/**
 * cli(cwd, args, raw, { userHome }) — `aof-tools stack verify [--run [--allow-services]] [--include a,b]
 * [--keys a,b] [--timeout <s>] [--draft]`. `args` excludes the `verify` token (the STACK_EXTENSIONS contract).
 * Prints JSON, or the compact table under `--raw`. Exit 1 when any command is missing or any run failed;
 * a gate skipped `env_required` (it needs a service) is a skip, not a failure.
 */
function cli(cwd, args, raw, { userHome = null } = {}) {
  const { output, error } = require('./helpers.cjs');
  let opts;
  try {
    opts = parseVerifyArgs(args || []);
  } catch (err) {
    if (err instanceof UsageError) { error(err.message); return; }
    throw err;
  }
  let outcome;
  try {
    outcome = verifyStack({ projectRoot: cwd, userHome: userHome || os.homedir(), ...opts });
  } catch (err) {
    error(err.message);
    return;
  }
  output(outcome.result, raw, rawTable(outcome.result), outcome.exitCode);
}

module.exports = {
  verifyCommand,
  resolveBinary,
  describeInvocation,
  MISSING_STATUSES,
  runCommands,
  serviceSignals,
  RUN_POLICY,
  verifyStack,
  parseVerifyArgs,
  cli,
};
