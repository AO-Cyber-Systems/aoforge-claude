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
