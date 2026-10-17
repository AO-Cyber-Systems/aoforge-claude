'use strict';

// Tests for security-sweep.cjs (TRD 76-04): the security-auditor's grep set as one fs-only sweep.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sweepMod = require('./security-sweep.cjs');
const { PATTERNS, FOCI, EXISTENCE, sweep } = sweepMod;

const ENV_MARKER = 'ENV_CONTENT_MUST_NOT_LEAK_7731';
const AWS_KEY = 'AKIA' + 'ABCDEFGHIJKLMNOP';
let root;

function put(rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'security-sweep-'));
  put('src/config.js', `const awsKey = "${AWS_KEY}";\nmodule.exports = { awsKey };\n`);
  put('src/keys.py', 'KEY = """-----BEGIN RSA PRIVATE KEY-----\nabc\n"""\n');
  put('src/view.tsx', 'export function V(el) { el.innerHTML = props.html; }\n');
  put('src/hash.js', "const h = require('crypto').createHash('md5');\nconst r = Math.random();\n");
  put('src/app.test.js', 'const r = Math.random();\nconst h = createHash("md5");\n');
  put('src/server.js', "app.get('/users/:id', (req, res) => res.send(req.params.id));\n");
  put('node_modules/pkg/index.js', 'el.innerHTML = x; const k = Math.random();\n');
  put('dist/bundle.js', 'el.innerHTML = y;\n');
  put('.env', `API_KEY=${ENV_MARKER}\n`);
  put('config/credentials.json', `{ "debug": true, "v": "${ENV_MARKER}" }\n`);
  put('package.json', '{ "name": "fixture", "debug": false }\n');
  put('yarn.lock', '# lock\n');
  put('big.js', 'el.innerHTML = z;\n' + 'x'.repeat(1024 * 1024 + 10));
  fs.mkdirSync(path.join(root, 'secrets'));
});

after(() => {
  if (root && path.basename(root).startsWith('security-sweep-')) fs.rmSync(root, { recursive: true, force: true });
});

const hitsOf = (res, id) => res.checks.find(c => c.id === id).hits;

test('PATTERNS rows are well formed and cover every focus', () => {
  assert.ok(Object.isFrozen(PATTERNS));
  const ids = new Set();
  for (const r of PATTERNS) {
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.ok(FOCI.includes(r.focus), r.id);
    assert.ok(r.re instanceof RegExp && !r.re.global, r.id);
    assert.ok(Array.isArray(r.exts) && r.exts.length > 0, r.id);
    assert.equal(typeof r.excludeTests, 'boolean');
    assert.ok(r.limit > 0);
  }
  for (const f of FOCI) assert.ok(PATTERNS.some(r => r.focus === f), f);
  for (const e of EXISTENCE) assert.ok(FOCI.includes(e.focus) && Array.isArray(e.files) && Array.isArray(e.dirs));
});

test('planted hits are found with relative POSIX paths and line numbers', () => {
  const res = sweep({ root });
  assert.equal(res.focus, 'all');
  const tok = hitsOf(res, 'secret-tokens');
  assert.deepEqual(tok.map(h => [h.file, h.line]), [['src/config.js', 1]]);
  assert.ok(!tok[0].text.includes(AWS_KEY), 'matched token is redacted');
  assert.deepEqual(hitsOf(res, 'private-keys').map(h => h.file), ['src/keys.py']);
  assert.deepEqual(hitsOf(res, 'xss').map(h => h.file), ['src/view.tsx']);
  assert.ok(hitsOf(res, 'weak-hash').some(h => h.file === 'src/hash.js' && h.line === 1));
  assert.ok(hitsOf(res, 'routes').some(h => h.file === 'src/server.js'));
  for (const c of res.checks) for (const h of c.hits) {
    assert.ok(!h.file.includes('\\') && !path.isAbsolute(h.file));
    assert.ok(h.text.length <= 200);
    assert.ok(!h.text.includes(AWS_KEY), `${c.id} leaks the token: ${h.text}`);
  }
});

test('every row redacts tokens and assigned secret literals, not only the token row', () => {
  const { redactSecrets } = require('./security-sweep.cjs');
  // Fail-closed (quick 34): after a secret-looking key and its operator the whole rest of the line
  // goes, quoted or not. The last case loses `null) return;` on purpose.
  assert.equal(redactSecrets(`const apiKey = "${AWS_KEY}";`), 'const apiKey = [REDACTED]');
  assert.equal(redactSecrets(`password = 'hunter2'`), `password = [REDACTED]`);
  assert.equal(redactSecrets('db_token: `abc`'), 'db_token: [REDACTED]');
  assert.equal(redactSecrets('if (password == null) return;'), 'if (password == [REDACTED]');
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'security-sweep-redact-'));
  try {
    fs.mkdirSync(path.join(r, 'lib'));
    fs.writeFileSync(path.join(r, 'lib', 'keys.js'), `const apiKey = "${AWS_KEY}";\nconst password = "hunter2";\n`);
    const res = sweep({ root: r });
    const out = JSON.stringify(res);
    assert.ok(!out.includes(AWS_KEY) && !out.includes('hunter2'), out);
    assert.equal(hitsOf(res, 'hardcoded-secrets').length, 2);
  } finally {
    fs.rmSync(r, { recursive: true, force: true });
  }
});

test('skipped dirs, oversized files and test exclusion', () => {
  const res = sweep({ root });
  const all = res.checks.flatMap(c => c.hits.map(h => h.file));
  assert.ok(!all.some(f => f.startsWith('node_modules/')), 'node_modules skipped');
  assert.ok(!all.some(f => f.startsWith('dist/')), 'dist skipped');
  assert.ok(!all.includes('big.js'), 'file over 1 MB skipped');
  // insecure-random excludes tests (agent: grep -v '.test.'); weak-hash does not.
  assert.deepEqual(hitsOf(res, 'insecure-random').map(h => h.file), ['src/hash.js']);
  assert.ok(hitsOf(res, 'weak-hash').some(h => h.file === 'src/app.test.js'));
});

test('secret files are reported by existence only and never read', () => {
  const res = sweep({ root });
  const sec = res.existence.find(e => e.id === 'secret-files');
  assert.deepEqual(sec.found, ['.env', 'config/credentials.json', 'secrets/']);
  const lock = res.existence.find(e => e.id === 'lockfiles');
  assert.deepEqual(lock.found, ['yarn.lock']);
  assert.deepEqual(res.existence.find(e => e.id === 'manifests').found, ['package.json']);
  // credentials.json matches the *.json debug row, but is a forbidden file: not opened.
  assert.ok(!hitsOf(res, 'debug-defaults').some(h => h.file === 'config/credentials.json'));
  assert.ok(!JSON.stringify(res).includes(ENV_MARKER));
});

test('focus filters rows and existence', () => {
  const res = sweep({ root, focus: 'auth-and-access' });
  assert.equal(res.focus, 'auth-and-access');
  const want = PATTERNS.filter(r => r.focus === 'auth-and-access').map(r => r.id);
  assert.deepEqual(res.checks.map(c => c.id), want);
  assert.deepEqual(res.existence, []);
  const cfg = sweep({ root, focus: 'config-and-deps' });
  assert.deepEqual(cfg.existence.map(e => e.id), ['manifests', 'lockfiles']);
  assert.equal(sweep({ root, focus: 'all' }).checks.length, PATTERNS.length);
});

test('unknown focus throws naming the valid foci', () => {
  assert.throws(() => sweep({ root, focus: 'nope' }), (e) => FOCI.every(f => e.message.includes(f)));
});

test('limits truncate and limitScale scales them', () => {
  const many = Array.from({ length: 30 }, () => 'const r = Math.random();').join('\n');
  put('src/many.js', many);
  try {
    const res = sweep({ root, focus: 'secrets-and-code' });
    const c = res.checks.find(x => x.id === 'insecure-random');
    assert.equal(c.hits.length, 20);
    assert.equal(c.truncated, true);
    const half = sweep({ root, focus: 'secrets-and-code', limitScale: 0.5 }).checks.find(x => x.id === 'insecure-random');
    assert.equal(half.hits.length, 10);
  } finally {
    fs.rmSync(path.join(root, 'src/many.js'));
  }
});

test('output is deterministic', () => {
  assert.deepEqual(sweep({ root }), sweep({ root }));
});

function runCli(args) {
  const script = `require(${JSON.stringify(path.join(__dirname, 'security-sweep.cjs'))})` +
    `.cmdSecuritySweep(${JSON.stringify(root)}, ${JSON.stringify(args.filter(a => a !== '--raw'))}, ${args.includes('--raw')})`;
  return spawnSync(process.execPath, ['-e', script], { encoding: 'utf-8' });
}

test('cmdSecuritySweep: JSON, --raw listing, and errors', () => {
  const json = runCli(['security', 'sweep', '--focus', 'secrets-and-code']);
  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.focus, 'secrets-and-code');
  assert.equal(parsed.root, root);

  const raw = runCli(['security', 'sweep', '--focus', 'secrets-and-code', '--raw']);
  assert.equal(raw.status, 0, raw.stderr);
  assert.match(raw.stdout, /\[Injection\] src\/view\.tsx:1 /);
  assert.match(raw.stdout, /\[Secrets\] exists: \.env /);
  assert.ok(!raw.stdout.includes(ENV_MARKER));
  assert.ok(!raw.stdout.includes(AWS_KEY));

  const sub = runCli(['security', 'sweep', '--root', 'src', '--focus', 'secrets-and-code']);
  assert.equal(sub.status, 0, sub.stderr);
  assert.equal(JSON.parse(sub.stdout).root, path.join(root, 'src'));

  const bad = runCli(['security', 'sweep', '--focus', 'bogus']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /secrets-and-code, auth-and-access, config-and-deps/);

  const unk = runCli(['security', 'sweep', '--frobnicate']);
  assert.equal(unk.status, 1);
  assert.match(unk.stderr, /unknown argument/);
});

// ---------------------------------------------------------------------------
// Quick 34: hit text leaked secrets, two rows backtracked catastrophically, and a missing --root
// swept as clean. Every token below is built by concatenation, so no secret-format literal sits in
// this file (GitHub push protection, CodeQL js/hardcoded-credentials).
// ---------------------------------------------------------------------------

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Runs the real CLI; returns { status, signal, stdout, stderr, body } where body follows an @file: pointer. */
function aofSweep(args, opts = {}) {
  const r = spawnSync(process.execPath, [AOF_TOOLS, 'security', 'sweep', ...args], { encoding: 'utf-8', ...opts });
  let body = r.stdout || '';
  if (body.trim().startsWith('@file:')) {
    const file = body.trim().slice('@file:'.length).trim();
    body = fs.readFileSync(file, 'utf-8');
    try { fs.unlinkSync(file); } catch { /* aof-tools' own temp file */ }
  }
  return { status: r.status, signal: r.signal, stdout: r.stdout || '', stderr: r.stderr || '', body };
}

// One line per leak form; each carries a unique marker that must never reach the output.
const LEAKS = [
  ['src/leaks.js', 'const stripe = "' + 'sk' + '_live_' + '51Hxyz' + 'LEAKMARK01abc";'],
  ['src/leaks.js', 'const slack = "' + 'xox' + 'b-1234-' + 'LEAKMARK02";'],
  ['src/leaks.js', 'const password = "it\'s-a-LEAKMARK03";'],
  ['src/leaks.py', 'token = "ab\\"cdLEAKMARK04"'],
  ['src/leaks.py', 'password = f"LEAKMARK05{user}"'],
  ['src/leaks.js', '// GET /api?token=LEAKMARK06PLAIN'],
  ['src/leaks.py', 'api_token = os.getenv("API_TOKEN") or "LEAKMARK07"'],
  ['src/leaks.go', 'password := "LEAKMARK08"'],
  ['src/leaks.js', 'const a = "' + 'sk' + '-ant-' + 'api03-' + 'LEAKMARK09abcdefghijklmnop";'],
  ['src/leaks.js', 'const g = "' + 'github' + '_pat_' + '11ABCDEFG0' + 'LEAKMARK10abcdefghij";'],
  ['src/leaks.js', 'const token = process.env.API_TOKEN || "LEAKMARK11";'],
  ['src/leaks.js', 'if (password == "LEAKMARK12") {'],
];

test('CLI: every listed leak form is a reported hit and no marker reaches JSON or --raw output', () => {
  const r = tmpRoot('security-sweep-leaks-');
  try {
    const byFile = {};
    const expected = [];
    for (const [rel, line] of LEAKS) {
      (byFile[rel] = byFile[rel] || []).push(line);
      expected.push(`${rel}:${byFile[rel].length}`);
    }
    for (const [rel, lines] of Object.entries(byFile)) {
      fs.mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
      fs.writeFileSync(path.join(r, rel), lines.join('\n') + '\n');
    }
    const markers = LEAKS.map((_, i) => `LEAKMARK${String(i + 1).padStart(2, '0')}`).concat(['51Hxyz']);

    const json = aofSweep(['--root', r]);
    assert.equal(json.status, 0, json.stderr);
    const res = JSON.parse(json.body);
    const hits = new Set(res.checks.flatMap((c) => c.hits.map((h) => `${h.file}:${h.line}`)));
    for (const loc of expected) assert.ok(hits.has(loc), `${loc} is not reported as a hit`);

    const raw = aofSweep(['--root', r, '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    for (const loc of expected) assert.ok(raw.stdout.includes(`${loc} `), `${loc} is not in the --raw listing`);

    for (const out of [json.stdout, json.body, raw.stdout]) {
      for (const m of markers) assert.ok(!out.includes(m), `${m} leaked:\n${out}`);
    }
  } finally {
    fs.rmSync(r, { recursive: true, force: true });
  }
});

test('redactSecrets removes every character of a token body after each detection prefix', () => {
  const { redactSecrets } = sweepMod;
  const body = 'Qz7Wm4Rt9Xk2Vb8Np3Ls6Hd1Jf5Gc0Y'.slice(0, 30);
  assert.equal(body.length, 30);
  const prefixes = ['sk' + '-', 'sk' + '-ant-', 'sk' + '_live_', 'sk' + '_test_', 'gh' + 'p_', 'github' + '_pat_', 'AK' + 'IA', 'xox' + 'b-'];
  for (const p of prefixes) {
    assert.equal(redactSecrets(`const k = "${p}${body}";`), 'const k = "[REDACTED]";', p);
  }
});

test('a 200 KB single-line file of adversarial text sweeps in under 5 s (child process, 30 s kill)', (t) => {
  const r = tmpRoot('security-sweep-slow-');
  try {
    const unit = 'query+execute+raw+console.log logger log. role secure verify rejectUnauthorized TLS SSL DEBUG= debug NODE_ENV stack res.status response createHash jwt algorithms plaintext ';
    const text = unit.repeat(Math.ceil((200 * 1024) / unit.length));
    for (const banned of ['"', '1', 'true', 'false', 'none', '===', 'password', 'token', 'secret', 'trace', 'error.', 'md5', 'sha1', 'development']) {
      assert.ok(!text.includes(banned), `the fixture must not contain ${banned}`);
    }
    assert.ok(text.length >= 200 * 1024 && !text.includes('\n'));
    fs.writeFileSync(path.join(r, 'slow.js'), text);
    const started = Date.now();
    const run = spawnSync(process.execPath, [AOF_TOOLS, 'security', 'sweep', '--root', r, '--raw'], { encoding: 'utf-8', timeout: 30000 });
    const elapsed = Date.now() - started;
    t.diagnostic(`security sweep of a ${text.length}-char line: ${elapsed} ms`);
    assert.equal(run.signal, null, `killed by ${run.signal} after ${elapsed} ms`);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(elapsed < 5000, `took ${elapsed} ms`);
  } finally {
    fs.rmSync(r, { recursive: true, force: true });
  }
});

test('a line longer than MAX_LINE_CHARS is scanned capped: the hit says line_truncated and the result counts it', () => {
  const r = tmpRoot('security-sweep-long-');
  try {
    fs.mkdirSync(path.join(r, 'src'));
    fs.writeFileSync(path.join(r, 'src', 'long.js'), 'const password = "' + 'A'.repeat(5000) + 'LEAKMARKEND";\n');
    const res = sweep({ root: r });
    const hit = hitsOf(res, 'hardcoded-secrets').find((h) => h.file === 'src/long.js');
    assert.ok(hit, JSON.stringify(res.checks.filter((c) => c.hits.length)));
    assert.equal(hit.line_truncated, true);
    assert.ok(hit.text.length <= 200);
    assert.ok(!JSON.stringify(res).includes('LEAKMARKEND'));
    assert.ok(res.lines_capped >= 1, `lines_capped: ${res.lines_capped}`);
    const raw = aofSweep(['--root', r, '--raw']);
    assert.equal(raw.status, 0, raw.stderr);
    assert.match(raw.stdout, /\d+ lines? longer than 4096 chars (were|was) scanned only in (their|its) first 4096 chars/);
    assert.ok(!raw.stdout.includes('LEAKMARKEND'));
  } finally {
    fs.rmSync(r, { recursive: true, force: true });
  }
});

test('no PATTERNS alternative has more than one .*', () => {
  const offenders = [];
  for (const row of PATTERNS) {
    for (const alt of row.re.source.split('|')) {
      const n = (alt.match(/(?<!\\)\.\*/g) || []).length;
      if (n > 1) offenders.push(`${row.id}: ${alt}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('a missing root or a file root is an error, not a clean sweep', () => {
  const r = tmpRoot('security-sweep-root-');
  try {
    const missing = path.join(r, 'nope');
    const file = path.join(r, 'a.js');
    fs.writeFileSync(file, 'x\n');
    assert.throws(() => sweep({ root: missing }), (e) => e.message.includes(missing));
    assert.throws(() => sweep({ root: file }), (e) => e.message.includes(file));
    const bogus = `/nonexistent-${process.pid}-${Date.now()}`;
    const cli = aofSweep(['--root', bogus]);
    assert.equal(cli.status, 1, cli.stdout);
    assert.ok(cli.stderr.includes(bogus), cli.stderr);
  } finally {
    fs.rmSync(r, { recursive: true, force: true });
  }
});
