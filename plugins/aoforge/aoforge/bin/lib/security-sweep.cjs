'use strict';

// security-sweep.cjs — `aof-tools security sweep [--focus <f>] [--root <dir>] [--raw]` (TRD 76-04).
//
// The security-auditor agent used to run about 25 grep/ls commands by hand per focus. This module
// runs the same checks in one process: PATTERNS is the agent's grep set transcribed to JS regexes
// (same extensions, same test exclusion, same head limits), EXISTENCE is its `ls` set. The hits are
// leads for the agent to read in context, not findings.
//
// Secret files are never read: a file whose name matches SECRET_FILES (the agent's
// <forbidden_files> list) is reported by an existence row at most, and the content scan skips it
// even when its extension matches a row (credentials.json under a *.json row, say).
//
// Walk: fs only (no grep), sorted entries, symlinks not followed, SKIP_DIRS pruned, files over
// MAX_FILE_BYTES skipped, files with a NUL byte treated as binary and skipped. Paths are relative
// POSIX. Output order is deterministic: PATTERNS order, then sorted file, then line.

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');
const { PLANNING_DIR_NAMES } = require('./compat.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

const FOCI = Object.freeze(['secrets-and-code', 'auth-and-access', 'config-and-deps']);

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', ...PLANNING_DIR_NAMES, '.security-audit-tmp']);
const MAX_FILE_BYTES = 1024 * 1024;
const TEXT_MAX = 200;
// The agent dropped `.test.` / `.spec.` lines with `grep -v`; a row with excludeTests skips those files.
const TEST_FILE_RE = /\.(test|spec)\./;

const E = {
  web: ['ts', 'tsx', 'js', 'jsx'],
  tsjs: ['ts', 'js'],
  tsjspy: ['ts', 'js', 'py'],
  tsjspygo: ['ts', 'js', 'py', 'go'],
};

function row(id, focus, category, re, exts, excludeTests, limit, extra) {
  return Object.freeze(Object.assign({ id, focus, category, re, exts: Object.freeze(exts.slice()), excludeTests, limit }, extra || {}));
}

const PATTERNS = Object.freeze([
  // secrets-and-code
  row('hardcoded-secrets', 'secrets-and-code', 'Secrets',
    /password\s*=|api_key\s*=|apiKey\s*=|secret\s*=|token\s*=/,
    [...E.web, 'py', 'go', 'java', 'rb'], true, 50),
  row('secret-tokens', 'secrets-and-code', 'Secrets',
    /sk-[a-zA-Z0-9]{20,}|sk_live_|sk_test_|ghp_[a-zA-Z0-9]{36}|AKIA[A-Z0-9]{16}|xox[baprs]-/,
    E.tsjspygo, false, 30, { redact: true }),
  row('private-keys', 'secrets-and-code', 'Secrets',
    /BEGIN.*PRIVATE KEY|BEGIN RSA|BEGIN EC|BEGIN DSA/,
    [...E.tsjspygo, 'java'], false, 20),
  row('sql-injection', 'secrets-and-code', 'Injection',
    /query.*\+.*"|execute.*\+.*"|raw.*\+.*"/,
    E.tsjspygo, true, 30),
  row('command-injection', 'secrets-and-code', 'Injection',
    /exec\(|execSync\(|child_process|subprocess|os\.system|os\.popen/,
    E.tsjspygo, true, 30),
  row('xss', 'secrets-and-code', 'Injection',
    /dangerouslySetInnerHTML|innerHTML|document\.write|v-html|\$sce\.trustAsHtml/,
    [...E.web, 'vue'], false, 30),
  row('path-traversal', 'secrets-and-code', 'Injection',
    /\.\.\//,
    E.tsjspy, true, 20, { excludeLine: /import|require/ }),
  row('logged-secrets', 'secrets-and-code', 'Sensitive-Data',
    /console\.log.*password|console\.log.*token|console\.log.*secret|logger.*password|log\..*password/,
    E.tsjspy, false, 20),
  row('secrets-in-urls', 'secrets-and-code', 'Sensitive-Data',
    /password=|token=|secret=/,
    E.tsjspy, true, 20),
  row('weak-hash', 'secrets-and-code', 'Cryptography',
    /createHash.*md5|createHash.*sha1|hashlib\.md5|hashlib\.sha1|MD5\.|SHA1\./,
    [...E.tsjspygo, 'java'], false, 20),
  row('insecure-random', 'secrets-and-code', 'Cryptography',
    /Math\.random/,
    E.tsjs, true, 20),

  // auth-and-access
  row('jwt-unverified', 'auth-and-access', 'Auth',
    /jwt\.decode|verify.*false|algorithms.*none/,
    E.tsjspygo, false, 20),
  row('routes', 'auth-and-access', 'Auth',
    /app\.get|app\.post|app\.put|app\.delete|router\.get|router\.post/,
    E.tsjs, true, 50),
  row('password-handling', 'auth-and-access', 'Auth',
    /bcrypt|argon2|scrypt|pbkdf2|plaintext.*password|password.*plaintext/,
    E.tsjspy, false, 20),
  row('idor', 'auth-and-access', 'AuthZ',
    /params\.id|params\.userId|req\.params\.|request\.args\./,
    E.tsjspy, true, 30),
  row('role-checks', 'auth-and-access', 'AuthZ',
    /isAdmin|role.*===|hasPermission|authorize|can\(/,
    E.tsjspy, false, 20),
  row('cors', 'auth-and-access', 'API-Security',
    /cors|Access-Control-Allow-Origin|Access-Control-Allow/,
    E.tsjspy, false, 20),
  row('rate-limiting', 'auth-and-access', 'Rate-Limiting',
    /rateLimit|rate-limit|throttle|RateLimiter/,
    E.tsjspy, false, 20),
  row('csrf', 'auth-and-access', 'API-Security',
    /csrf|csurf|CSRFToken|_token|authenticity_token/,
    E.tsjspy, false, 20),

  // config-and-deps
  row('security-headers', 'config-and-deps', 'Security-Headers',
    /helmet|Content-Security-Policy|X-Frame-Options|Strict-Transport-Security|X-Content-Type-Options/,
    E.tsjspy, false, 20),
  row('cookies', 'config-and-deps', 'Security-Headers',
    /cookie|session|httpOnly|secure.*true|sameSite/,
    E.tsjspy, false, 20),
  row('stack-traces', 'config-and-deps', 'Error-Handling',
    /stack.*trace|err\.stack|error\.stack|traceback|stackTrace/,
    E.tsjspy, true, 20),
  row('error-details', 'config-and-deps', 'Error-Handling',
    /res\.status.*error\.|response.*error\.|send.*err\b/,
    E.tsjs, true, 20),
  row('debug-defaults', 'config-and-deps', 'Config',
    /debug.*true|DEBUG.*=.*1|NODE_ENV.*development/,
    [...E.tsjspy, 'json'], false, 20),
  row('disabled-security', 'config-and-deps', 'Config',
    /verify.*false|rejectUnauthorized.*false|insecure|allowHttp|TLS.*false|SSL.*false/,
    E.tsjspygo, false, 20),
]);

// Existence-only rows. `files` are basename globs; scope 'tree' matches anywhere in the walk,
// 'root' only at the root. `dirs` are root-relative directories. Contents are never read.
const EXISTENCE = Object.freeze([
  Object.freeze({ id: 'secret-files', focus: 'secrets-and-code', category: 'Secrets', scope: 'tree',
    files: Object.freeze(['.env', '.env.*', '*.pem', '*.key', '*.p12', 'credentials.*', 'secrets.*']),
    dirs: Object.freeze(['.secrets', 'config/secrets', 'secrets']) }),
  Object.freeze({ id: 'manifests', focus: 'config-and-deps', category: 'Dependencies', scope: 'root',
    files: Object.freeze(['package.json', 'requirements.txt', 'go.mod']), dirs: Object.freeze([]) }),
  Object.freeze({ id: 'lockfiles', focus: 'config-and-deps', category: 'Dependencies', scope: 'root',
    files: Object.freeze(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Pipfile.lock', 'poetry.lock', 'go.sum']),
    dirs: Object.freeze([]) }),
]);

// The agent's <forbidden_files>: never opened by the content scan.
const SECRET_FILES = [
  '.env', '.env.*', '*.env', 'credentials.*', 'secrets.*', '*secret*', '*credential*',
  '*.pem', '*.key', '*.p12', '*.pfx', '*.jks', 'id_rsa*', 'id_ed25519*', 'id_dsa*',
  '.npmrc', '.pypirc', '.netrc', '*.keystore', '*.truststore', 'serviceAccountKey.json', '*-credentials.json',
];
const SECRET_DIRS = ['.secrets', 'config/secrets', 'secrets'];

const TOKEN_RE = new RegExp(PATTERNS.find((r) => r.id === 'secret-tokens').re.source, 'g');
// The quoted value of a secret-looking assignment: `password = "x"`, `apiKey: 'x'`, `token=\`x\``.
const ASSIGNED_SECRET_RE = /((?:password|passwd|api_?key|apiKey|secret|token)\w*\s*[:=]\s*)(["'`])[^"'`]*\2/gi;

/** A hit line with tokens and assigned secret literals replaced by [REDACTED]. */
function redactSecrets(text) {
  return text.replace(TOKEN_RE, '[REDACTED]').replace(ASSIGNED_SECRET_RE, '$1$2[REDACTED]$2');
}

function globRe(glob) {
  const src = glob.split('*').map((part) => part.split('?').map(escapeRegExp).join('.')).join('.*');
  return new RegExp('^' + src + '$');
}
const SECRET_FILE_RES = SECRET_FILES.map(globRe);

function isSecretPath(rel) {
  const base = rel.split('/').pop();
  if (SECRET_FILE_RES.some(re => re.test(base))) return true;
  return SECRET_DIRS.some(d => rel === d || rel.startsWith(d + '/') || rel.includes('/' + d + '/'));
}

function walk(root) {
  const files = [];
  const dirs = [];
  const visit = (abs, rel) => {
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      const childRel = rel ? rel + '/' + ent.name : ent.name;
      const childAbs = path.join(abs, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        dirs.push(childRel);
        visit(childAbs, childRel);
      } else if (ent.isFile()) {
        files.push({ rel: childRel, abs: childAbs });
      }
      // symlinks and other types are not followed
    }
  };
  visit(root, '');
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { files, dirs };
}

function extOf(rel) {
  const base = rel.split('/').pop();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1) : '';
}

function selectFocus(focus) {
  if (focus === undefined || focus === null || focus === 'all') return null;
  if (!FOCI.includes(focus)) {
    throw new Error(`Unknown security focus "${focus}". Valid: ${FOCI.join(', ')}, all`);
  }
  return focus;
}

function sweep({ root, focus, limitScale } = {}) {
  const selected = selectFocus(focus);
  const absRoot = path.resolve(root || process.cwd());
  const scale = typeof limitScale === 'number' && limitScale > 0 ? limitScale : 1;
  const rows = PATTERNS.filter(r => !selected || r.focus === selected);
  const exRows = EXISTENCE.filter(r => !selected || r.focus === selected);

  const { files, dirs } = walk(absRoot);
  const wantedExts = new Set(rows.flatMap(r => r.exts));
  const state = rows.map(r => ({ row: r, limit: Math.max(1, Math.ceil(r.limit * scale)), hits: [], truncated: false }));

  let scanned = 0;
  for (const f of files) {
    const ext = extOf(f.rel);
    if (!wantedExts.has(ext) || isSecretPath(f.rel)) continue;
    let buf;
    try {
      if (fs.statSync(f.abs).size > MAX_FILE_BYTES) continue;
      buf = fs.readFileSync(f.abs);
    } catch { continue; }
    if (buf.includes(0)) continue;
    scanned++;
    const isTest = TEST_FILE_RE.test(f.rel);
    const live = state.filter(s => s.row.exts.includes(ext) && !(s.row.excludeTests && isTest));
    if (live.length === 0) continue;
    const lines = buf.toString('utf-8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const s of live) {
        if (!s.row.re.test(line)) continue;
        if (s.row.excludeLine && s.row.excludeLine.test(line)) continue;
        if (s.hits.length >= s.limit) { s.truncated = true; continue; }
        // Every hit is redacted, whichever row matched: a token or an assigned secret literal can
        // match a non-token row too (`apiKey = "AKIA..."`), and the hit text lands in a transcript.
        let text = redactSecrets(line.trim());
        if (s.row.redact) text = text.replace(new RegExp(s.row.re.source, 'g'), '[REDACTED]');
        if (text.length > TEXT_MAX) text = text.slice(0, TEXT_MAX);
        s.hits.push({ file: f.rel, line: i + 1, text });
      }
    }
  }

  const fileSet = files.map(f => f.rel);
  const dirSet = new Set(dirs);
  const existence = exRows.map(r => {
    const res = r.files.map(globRe);
    const found = fileSet.filter(rel => {
      if (r.scope === 'root' && rel.includes('/')) return false;
      const base = rel.split('/').pop();
      return res.some(re => re.test(base));
    });
    for (const d of r.dirs) if (dirSet.has(d)) found.push(d + '/');
    found.sort();
    return { id: r.id, category: r.category, found };
  });

  return {
    root: absRoot,
    focus: selected || 'all',
    files_scanned: scanned,
    checks: state.map(s => ({ id: s.row.id, category: s.row.category, hits: s.hits, truncated: s.truncated })),
    existence,
  };
}

function formatRaw(result) {
  const out = [`security sweep: focus ${result.focus}, ${result.files_scanned} files scanned`];
  for (const c of result.checks) {
    for (const h of c.hits) out.push(`[${c.category}] ${h.file}:${h.line} ${h.text}`);
    if (c.truncated) out.push(`[${c.category}] (${c.id}: more hits than the limit, narrow with Grep)`);
  }
  for (const e of result.existence) {
    for (const f of e.found) out.push(`[${e.category}] exists: ${f} (${e.id}; do not read contents)`);
  }
  const total = result.checks.reduce((n, c) => n + c.hits.length, 0);
  out.push(`${total} hits, ${result.existence.reduce((n, e) => n + e.found.length, 0)} existence entries`);
  return out.join('\n') + '\n';
}

function cmdSecuritySweep(cwd, args, raw) {
  const rest = args.slice(2);
  let focus;
  let root = cwd;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--focus' || a === '--root') {
      const v = rest[i + 1];
      if (v === undefined || v.startsWith('--')) error(`${a} needs a value`);
      if (a === '--focus') focus = v; else root = path.resolve(cwd, v);
      i++;
    } else if (a === '--raw') {
      // handled by the dispatcher
    } else {
      error(`security sweep: unknown argument "${a}". Usage: security sweep [--focus ${FOCI.join('|')}|all] [--root <dir>] [--raw]`);
    }
  }
  let result;
  try {
    result = sweep({ root, focus });
  } catch (e) {
    error(e.message);
  }
  output(result, raw, formatRaw(result));
}

module.exports = { PATTERNS, FOCI, EXISTENCE, sweep, redactSecrets, cmdSecuritySweep };
