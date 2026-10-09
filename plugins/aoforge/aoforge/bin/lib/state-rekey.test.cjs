'use strict';

// Test list (TRD 72-07, objective 72-install-and-naming-cleanup, INST-06): repo-keyed runtime state can follow a moved
// checkout. Fake home and TMPDIR under one temp dir; the real ~/.claude is never read.
//
// 12. keyForPath equals upgrade.repoKey (and the awareness and outbox repoKey) for an existing directory; it keeps
//     the same key after the directory is gone (the nearest existing ancestor is realpath'd, so a symlinked temp root
//     still matches); a path with no existing part is keyed from the path string.
// 12b. KEYED_STATE is pinned to each store's own path function: for a real project, every entry's path under its key
//     is the path that store computes (estimate statePath/historyDir, awareness cacheFile, hook-marker markerDir, outbox
//     journalPath, upgrade.backupDirFor's repo directory, the drafts directory).
// 13. planRekey({ from, to, userHome }) lists `{ kind, src, dst, action }` for each entry present under the old key
//     (the outbox lock is left out, another repository's state is not listed); an entry already present at dst is
//     `skip`, a directory with missing files is `merge`; planning writes nothing.
// 13b. A store's env override moves its entries (the plan follows the store's own path function).
// 14. applyRekey copies files and dirs, never deletes src, never overwrites dst; the backups registry gains a `to`
//     entry pointing at the new realpath and keeps the old one; a second plan is all `skip`.
// 15. CLI: `aof-tools state rekey --from <old> --to <new> --dry-run` prints the plan (JSON; --raw prose) and writes
//     nothing; without --dry-run it applies; `--to` defaults to the cwd's project root; `--bogus` exits 1 (flag-spec);
//     missing `--from` exits 1 with usage; the same key twice exits 1.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { keyForPath, planRekey, applyRekey, KEYED_STATE } = require('./state-rekey.cjs');
const upgrade = require('./upgrade.cjs');
const awarenessStore = require('./awareness-store.cjs');
const outbox = require('./gh-outbox.cjs');
const estimateRunStore = require('./estimate-run-store.cjs');
const hookMarkerStore = require('./hook-marker-store.cjs');
const { DRAFTS_DIR } = require('./planning-drafts.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { writeKeyedState, HISTORY_FILE } = require('./__fixtures__/legacy-runtime-fixtures.cjs');

const TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const NOW = new Date('2026-10-09T02:00:00.000Z');

/** A temp dir (NOT realpath'd: on macOS it sits under a symlink) holding a fake home and a fake TMPDIR. */
function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aof-rekey-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const tmpDir = path.join(root, 'tmp');
  fs.mkdirSync(home);
  fs.mkdirSync(tmpDir);
  const runtime = path.join(home, '.claude', NAMES.runtimeDir);
  return { root, home, tmpDir, runtime };
}

/** rel path -> content of every file under dir. */
function tree(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  (function walk(cur, rel) {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(cur, e.name), r);
      else out[r] = fs.readFileSync(path.join(cur, e.name), 'utf8');
    }
  })(dir, '');
  return out;
}

/**
 * A moved checkout: `old` no longer exists, `newDir` does (with a planning directory), and the runtime home under
 * the fake home holds keyed state under the old key, plus one draft and another repository's state.
 */
function movedCheckout(t) {
  const s = sandbox(t);
  const old = path.join(s.root, 'dev', LEGACY.repo);
  fs.mkdirSync(old, { recursive: true });
  const oldKey = upgrade.repoKey(old);
  fs.rmSync(old, { recursive: true });
  const newDir = path.join(s.root, 'dev', NAMES.repo);
  fs.mkdirSync(path.join(newDir, NAMES.planningDir), { recursive: true });
  const newKey = upgrade.repoKey(newDir);
  writeKeyedState(s.runtime, oldKey, { projectPath: fs.realpathSync(s.root) + `/dev/${LEGACY.repo}` });
  writeKeyedState(s.runtime, 'other-0badc0de', { projectPath: '/elsewhere/other' });
  const draft = path.join(s.tmpDir, DRAFTS_DIR, oldKey, 'objectives', '01-x', '01-01-SUMMARY.md');
  fs.mkdirSync(path.dirname(draft), { recursive: true });
  fs.writeFileSync(draft, '# draft\n');
  return { ...s, old, oldKey, newDir, newKey };
}

const opts = (m, extra = {}) => ({ from: m.old, to: m.newDir, userHome: m.home, env: {}, tmpDir: m.tmpDir, ...extra });

describe('state rekey (TRD 72-07, INST-06)', () => {
  test('12. keyForPath matches upgrade.repoKey, survives the directory going away, and keys a bare string', (t) => {
    const s = sandbox(t);
    const dir = path.join(s.root, 'x', LEGACY.repo);
    fs.mkdirSync(dir, { recursive: true });
    const key = upgrade.repoKey(dir);
    assert.equal(keyForPath(dir), key);
    assert.equal(keyForPath(dir), awarenessStore.repoKey(dir));
    assert.equal(keyForPath(dir), outbox.repoKey(dir));
    assert.match(key, new RegExp(`^${LEGACY.repo}-[0-9a-f]{8}$`));

    fs.rmSync(path.join(s.root, 'x'), { recursive: true });
    assert.equal(keyForPath(dir), key, 'the key of a moved-away checkout is the key it had');

    const bare = `/nonexistent-72-07/x/${LEGACY.repo}`;
    const hash8 = crypto.createHash('sha1').update(bare).digest('hex').slice(0, 8);
    assert.equal(keyForPath(bare), `${LEGACY.repo}-${hash8}`);
    assert.equal(keyForPath('/nonexistent-72-07/My Repo.v2'), `my-repo-v2-${crypto.createHash('sha1')
      .update('/nonexistent-72-07/My Repo.v2').digest('hex').slice(0, 8)}`);
  });

  test('12b. KEYED_STATE is pinned to each store\'s own path function', (t) => {
    const s = sandbox(t);
    const proj = path.join(s.root, 'proj');
    fs.mkdirSync(proj);
    const key = keyForPath(proj);
    const ctx = { userHome: s.home, env: {}, tmpDir: s.tmpDir };
    const at = (kind) => {
      const e = KEYED_STATE.find((x) => x.kind === kind);
      assert.ok(e, `KEYED_STATE has ${kind}`);
      return path.join(e.dir(ctx), e.name(key));
    };
    const so = { env: {}, home: s.home };
    assert.equal(at('estimate-run'), estimateRunStore.statePath(proj, so));
    assert.equal(at('estimate-history'), estimateRunStore.historyDir(proj, so));
    assert.equal(at('awareness'), awarenessStore.cacheFile(proj, so));
    assert.equal(at('hook-markers'), hookMarkerStore.markerDir(proj, so));
    assert.equal(at('outbox'), outbox.journalPath(proj, so));
    assert.equal(at('backups'), path.dirname(upgrade.backupDirFor({ projectRoot: proj, userHome: s.home, now: NOW })));
    assert.equal(at('drafts'), path.join(s.tmpDir, DRAFTS_DIR, key));
    assert.deepEqual(KEYED_STATE.map((e) => e.kind).sort(), [
      'awareness', 'backups', 'drafts', 'estimate-history', 'estimate-run', 'hook-markers', 'outbox',
    ]);
  });

  test('13. planRekey lists each entry under the old key with its action, and writes nothing', (t) => {
    const m = movedCheckout(t);
    const r = m.runtime;
    // Already present under the new key: a file (skip), a directory with nothing missing (skip), one with gaps (merge).
    fs.mkdirSync(path.join(r, 'state', 'estimates'), { recursive: true });
    fs.writeFileSync(path.join(r, 'state', 'estimates', `${m.newKey}.json`), '{"new":true}\n');
    fs.mkdirSync(path.join(r, 'state', 'hook-markers', m.newKey), { recursive: true });
    fs.writeFileSync(path.join(r, 'state', 'hook-markers', m.newKey, 'm.json'), '{"new":true}\n');
    fs.mkdirSync(path.join(r, 'backups', m.newKey, 'later'), { recursive: true });
    fs.writeFileSync(path.join(r, 'backups', m.newKey, 'later', 'y'), 'newer backup\n');

    const before = { runtime: tree(m.home), tmp: tree(m.tmpDir) };
    const plan = planRekey(opts(m));
    assert.deepEqual({ runtime: tree(m.home), tmp: tree(m.tmpDir) }, before, 'planning writes nothing');

    assert.equal(plan.from_key, m.oldKey);
    assert.equal(plan.to_key, m.newKey);
    const byDst = Object.fromEntries(plan.entries.map((e) => [path.relative(m.root, e.dst), e]));
    const rel = (p) => path.relative(m.root, p);
    const expect = (kind, src, dst, action) => {
      const e = byDst[rel(dst)];
      assert.ok(e, `planned ${kind} -> ${rel(dst)}; got ${Object.keys(byDst).join(', ')}`);
      assert.deepEqual({ kind: e.kind, src: rel(e.src), action: e.action }, { kind, src: rel(src), action });
    };
    const st = (...p) => path.join(r, 'state', ...p);
    expect('estimate-run', st('estimates', `${m.oldKey}.json`), st('estimates', `${m.newKey}.json`), 'skip');
    expect('estimate-history', st('estimates', 'history', m.oldKey), st('estimates', 'history', m.newKey), 'copy');
    expect('awareness', st('awareness', `${m.oldKey}.json`), st('awareness', `${m.newKey}.json`), 'copy');
    expect('hook-markers', st('hook-markers', m.oldKey), st('hook-markers', m.newKey), 'skip');
    expect('outbox', st('outbox', `${m.oldKey}.json`), st('outbox', `${m.newKey}.json`), 'copy');
    expect('outbox', st('outbox', `${m.oldKey}.base.json`), st('outbox', `${m.newKey}.base.json`), 'copy');
    expect('outbox', st('outbox', `${m.oldKey}.verb-writes.json`), st('outbox', `${m.newKey}.verb-writes.json`), 'copy');
    expect('backups', path.join(r, 'backups', m.oldKey), path.join(r, 'backups', m.newKey), 'merge');
    expect('drafts', path.join(m.tmpDir, DRAFTS_DIR, m.oldKey), path.join(m.tmpDir, DRAFTS_DIR, m.newKey), 'copy');

    const reg = plan.entries.filter((e) => e.kind === 'backups-registry');
    assert.equal(reg.length, 1);
    assert.equal(reg[0].action, 'copy');
    assert.equal(reg[0].from_key, m.oldKey);
    assert.equal(reg[0].to_key, m.newKey);
    assert.equal(reg[0].path, fs.realpathSync(m.newDir));

    assert.equal(plan.entries.length, 10, 'nine path entries + the registry entry');
    assert.ok(!plan.entries.some((e) => e.src.endsWith('.lock')), 'the outbox lock is never planned');
    assert.ok(!plan.entries.some((e) => e.src.includes('other-0badc0de')), 'another repository is not listed');
  });

  test('13b. a store env override moves its entries with it', (t) => {
    const m = movedCheckout(t);
    const custom = path.join(m.root, 'custom-estimates');
    fs.mkdirSync(custom);
    fs.writeFileSync(path.join(custom, `${m.oldKey}.json`), '{"custom":true}\n');
    const plan = planRekey(opts(m, { env: { AOFORGE_ESTIMATE_STATE_DIR: custom } }));
    const run = plan.entries.find((e) => e.kind === 'estimate-run');
    assert.equal(run.src, path.join(custom, `${m.oldKey}.json`));
    assert.equal(run.dst, path.join(custom, `${m.newKey}.json`));
  });

  test('14. applyRekey copies, never deletes, never overwrites; the registry gains the new key', (t) => {
    const m = movedCheckout(t);
    const r = m.runtime;
    fs.mkdirSync(path.join(r, 'state', 'estimates'), { recursive: true });
    fs.writeFileSync(path.join(r, 'state', 'estimates', `${m.newKey}.json`), '{"new":true}\n');
    fs.mkdirSync(path.join(r, 'backups', m.newKey, 'later'), { recursive: true });
    fs.writeFileSync(path.join(r, 'backups', m.newKey, 'later', 'y'), 'newer backup\n');
    const oldTree = tree(m.home);
    const regBefore = JSON.parse(fs.readFileSync(path.join(r, 'backups', '.registry.json'), 'utf8'));

    const result = applyRekey(planRekey(opts(m)), { now: NOW });
    assert.equal(result.applied, true);

    const after = tree(m.home);
    for (const [relPath, content] of Object.entries(oldTree)) {
      if (relPath.endsWith('backups/.registry.json')) continue;
      assert.equal(after[relPath], content, `${relPath} is unchanged (never deleted, never overwritten)`);
    }
    const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
    const st = (...p) => path.join(r, 'state', ...p);
    assert.equal(read(st('estimates', `${m.newKey}.json`)), '{"new":true}\n');
    assert.equal(read(st('estimates', 'history', m.newKey, HISTORY_FILE)),
      read(st('estimates', 'history', m.oldKey, HISTORY_FILE)));
    assert.equal(read(st('awareness', `${m.newKey}.json`)), read(st('awareness', `${m.oldKey}.json`)));
    assert.equal(read(st('hook-markers', m.newKey, 'm.json')), read(st('hook-markers', m.oldKey, 'm.json')));
    for (const suffix of ['.json', '.base.json', '.verb-writes.json']) {
      assert.equal(read(st('outbox', m.newKey + suffix)), read(st('outbox', m.oldKey + suffix)));
    }
    assert.equal(fs.existsSync(st('outbox', `${m.newKey}.lock`)), false, 'the lock is not copied');
    assert.equal(read(r, 'backups', m.newKey, '2026-10-08', 'x'), 'backup body\n', 'merged in');
    assert.equal(read(r, 'backups', m.newKey, 'later', 'y'), 'newer backup\n', 'kept');
    assert.equal(read(m.tmpDir, DRAFTS_DIR, m.newKey, 'objectives', '01-x', '01-01-SUMMARY.md'), '# draft\n');

    const reg = JSON.parse(fs.readFileSync(path.join(r, 'backups', '.registry.json'), 'utf8'));
    assert.deepEqual(reg.repos[m.oldKey], regBefore.repos[m.oldKey], 'the old entry is kept');
    assert.deepEqual(reg.repos['other-0badc0de'], regBefore.repos['other-0badc0de']);
    assert.deepEqual(reg.repos[m.newKey], { path: fs.realpathSync(m.newDir), registered_at: NOW.toISOString() });

    const again = planRekey(opts(m));
    assert.deepEqual(again.entries.map((e) => e.action).filter((a) => a !== 'skip'), [], 'a second plan is all skip');
  });

  describe('15. CLI', () => {
    function run(m, args, cwd = m.newDir) {
      const env = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (k.startsWith(NAMES.envPrefix) || k.startsWith(LEGACY.envPrefix)) continue;
        env[k] = v;
      }
      return spawnSync(process.execPath, [TOOLS, '--cwd', cwd, 'state', 'rekey', ...args], {
        encoding: 'utf8',
        env: { ...env, HOME: m.home, TMPDIR: m.tmpDir },
        timeout: 30000,
      });
    }
    const snap = (m) => ({ home: tree(m.home), tmp: tree(m.tmpDir) });

    test('--dry-run prints the plan (JSON, and prose with --raw) and writes nothing', (t) => {
      const m = movedCheckout(t);
      const before = snap(m);
      const r = run(m, ['--from', m.old, '--to', m.newDir, '--dry-run']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.dry_run, true);
      assert.equal(out.from_key, m.oldKey);
      assert.equal(out.to_key, m.newKey);
      assert.equal(out.entries.length, 10);
      assert.deepEqual(snap(m), before);

      const raw = run(m, ['--from', m.old, '--to', m.newDir, '--dry-run', '--raw']);
      assert.equal(raw.status, 0, raw.stderr);
      assert.match(raw.stdout, new RegExp(`dry run: ${m.oldKey} -> ${m.newKey}`));
      assert.match(raw.stdout, /^copy +estimate-history +/m);
      assert.match(raw.stdout, /^copy +backups-registry +/m);
      assert.deepEqual(snap(m), before);
    });

    test('without --dry-run it applies; --to defaults to the cwd project root', (t) => {
      const m = movedCheckout(t);
      const r = run(m, ['--from', m.old], path.join(m.newDir, NAMES.planningDir));
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.applied, true);
      assert.equal(out.to_key, m.newKey);
      assert.ok(fs.existsSync(path.join(m.runtime, 'state', 'estimates', `${m.newKey}.json`)));
      assert.ok(fs.existsSync(path.join(m.runtime, 'state', 'estimates', `${m.oldKey}.json`)), 'old kept');
    });

    test('--bogus exits 1 (flag-spec) and writes nothing; a missing --from exits 1 with usage', (t) => {
      const m = movedCheckout(t);
      const before = snap(m);
      const bogus = run(m, ['--from', m.old, '--bogus']);
      assert.equal(bogus.status, 1);
      assert.match(bogus.stderr, /unknown flag --bogus for `state rekey`/);
      const missing = run(m, ['--to', m.newDir]);
      assert.equal(missing.status, 1);
      assert.match(missing.stderr, /Usage: aof-tools state rekey --from <old checkout path>/);
      const empty = run(m, ['--from']);
      assert.equal(empty.status, 1);
      assert.match(empty.stderr, /Usage: aof-tools state rekey/);
      assert.deepEqual(snap(m), before);
    });

    test('the same key on both sides exits 1', (t) => {
      const m = movedCheckout(t);
      const r = run(m, ['--from', m.newDir, '--to', m.newDir]);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /same repo key/);
    });
  });
});
