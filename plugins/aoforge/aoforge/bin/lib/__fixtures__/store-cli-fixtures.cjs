'use strict';

/**
 * store-cli-fixtures.cjs (TRD 48-14) — a store-shaped project plus a hermetic environment for tests that SPAWN
 * `aof-tools` (the `cmd*` functions exit the process, so they cannot run in-process).
 *
 *   const p = storeCliProject({ store: true });
 *   const r = p.run(['objective', 'complete', '7']);   // spawnSync result: {status, stdout, stderr}
 *   p.journalOps();                                      // ops in the outbox journal ([] when there is none)
 *   p.ledgerEntries();                                   // {rel: {hash, at, verb}} from the verb-write ledger
 *   p.cleanup();
 *
 * Hermetic by construction:
 *   - a `gh` PATH shim (gh-shim.cjs) answers EVERY call like an unreachable GitHub: each first argv word starts
 *     with a letter, so the 26 one-letter prefixes below match all of them, and the stderr carries the network
 *     wording gh.isOfflineResult and gh-outbox-flush.classifyFailure read as `offline`. A store verb therefore
 *     queues and the flush stops `pending` (exit 3); nothing ever reaches GitHub.
 *   - HOME, AOFORGE_GH_CACHE_DIR (shim.env) and AOFORGE_OUTBOX_DIR point under one temp root, so the real
 *     ~/.claude is never read or written; the ledger lives beside the journal there.
 *   - AOFORGE_WIKI_REMOTE is the loopback discard port (127.0.0.1:9; never 8080), so a wiki clone fails at once with
 *     "couldn't connect", which gh-wiki classifies as offline (a missing file:// remote would read as an uninitialised
 *     wiki and halt the flush instead). git runs with no global/system config and no terminal prompts, so a wiki-push
 *     can never reach github.com.
 *   - `mapped: true` (default) seeds a v3 mapping for objective 7, so an offline objective sync can queue its
 *     hierarchy (an unmapped objective cannot be created offline).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { makeStoreProject, STORE_FIXTURE } = require('./gh-store-fixtures.cjs');
const { installGhShim } = require('./gh-shim.cjs');
const outbox = require('../gh-outbox.cjs');
const ledger = require('../planning-ledger.cjs');

const DF_TOOLS = path.join(__dirname, '..', '..', 'aof-tools.cjs');

const OFFLINE_WIKI_REMOTE = 'http://127.0.0.1:9/o/r.wiki.git';
const OFFLINE_STDERR = 'error connecting to api.github.com\ndial tcp: lookup api.github.com: no such host\n';

/** Every gh call fails like a network outage: one entry per possible first letter of argv. */
function offlineTable() {
  const table = {};
  for (let c = 'a'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
    table[String.fromCharCode(c)] = { code: 1, stderr: OFFLINE_STDERR };
  }
  return table;
}

/**
 * @param {{store?: boolean, enabled?: boolean, mapped?: boolean}} [opts]
 */
function storeCliProject({ store = true, enabled = true, mapped = true } = {}) {
  const project = makeStoreProject({ store, enabled });
  const root = fs.realpathSync(project.root);
  const envRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'store-cli-env-')));
  const shim = installGhShim({ dir: path.join(envRoot, 'shim'), table: offlineTable(), defaultCode: 1 });
  const outboxDir = path.join(envRoot, 'outbox');

  if (mapped) {
    const mapping = {
      version: 3,
      repo: STORE_FIXTURE.repo,
      milestones: {},
      objectives: { 7: { issue_id: 107, state_comment_id: null, verified_at: null } },
      trds: {},
    };
    fs.writeFileSync(path.join(root, '.aoforge', '.gh-mapping.json'), `${JSON.stringify(mapping, null, 2)}\n`);
  }

  const env = shim.env({
    AOFORGE_OUTBOX_DIR: outboxDir,
    AOFORGE_WIKI_REMOTE: OFFLINE_WIKI_REMOTE,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'AOForge Test',
    GIT_AUTHOR_EMAIL: 'aoforge-test@example.invalid',
    GIT_COMMITTER_NAME: 'AOForge Test',
    GIT_COMMITTER_EMAIL: 'aoforge-test@example.invalid',
  });

  const planning = (rel) => path.join(root, '.aoforge', ...rel.split('/'));

  return {
    root,
    env,
    shim,
    outboxDir,
    objectiveDir: STORE_FIXTURE.objectiveDir,
    planning,
    read: (rel) => fs.readFileSync(planning(rel), 'utf8'),
    run(args, opts = {}) {
      return spawnSync(process.execPath, [DF_TOOLS, ...args], {
        cwd: opts.cwd || root,
        env,
        encoding: 'utf-8',
        timeout: 60000,
      });
    },
    journalOps() {
      const file = outbox.journalPath(root, { env });
      if (!fs.existsSync(file)) return [];
      return JSON.parse(fs.readFileSync(file, 'utf8')).ops || [];
    },
    ledgerEntries() {
      const file = ledger.ledgerPath(root, { env });
      if (!fs.existsSync(file)) return {};
      return JSON.parse(fs.readFileSync(file, 'utf8')).entries || {};
    },
    ghCalls: () => shim.readCalls(),
    /** `{rel: text}` of every file under `.aoforge/`, for "nothing changed" assertions. */
    snapshot() {
      const out = {};
      const walk = (dir, rel) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(path.join(dir, e.name), r);
          else out[r] = fs.readFileSync(path.join(dir, e.name), 'utf8');
        }
      };
      walk(path.join(root, '.aoforge'), '');
      return out;
    },
    cleanup() {
      project.cleanup();
      fs.rmSync(envRoot, { recursive: true, force: true });
    },
  };
}

module.exports = { storeCliProject, offlineTable, OFFLINE_STDERR, DF_TOOLS };
