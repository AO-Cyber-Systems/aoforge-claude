'use strict';

// Hand-built fixtures for the file-level legacy identities (objective 72, TRD 72-12, INST-03).
//
// The old names that live in files outside this repo's code, typed out literally:
//   - the ownership key DevFlow's `stack mcp` wrote into a user's `.mcp.json` (DEVFLOW_MANAGED)
//   - the metadata key on session todos in past transcripts (devflow_todo)
//   - user files under ~/.devflow/ (defaults.json, brave_api_key, devflow-watch-allow.json,
//     devflow-watch.pid), next to the devflowops product's devflow.sqlite and sessions.json
//   - a half-finished adopt on the devflow/adopt branch with its devflow-adopt.json marker
//
// Naming convention (enforced by the 72-04 repo test): a legacy name may be spelled only in
// bin/lib/legacy-names.cjs, in bin/lib/__fixtures__/legacy-*.cjs (this file) and in
// *.legacy.test.* files. Factory functions with explicit inputs, not generated data.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const todoFx = require('./todo-transcript-fixtures.cjs');
const { makeFixture, makeFakeHome, gitEnv } = require('./adopt-fixtures.cjs');

// ─── literal legacy names ─────────────────────────────────────────────────────

const LEGACY_OWNER_KEY = 'DEVFLOW_MANAGED';
const OWNER_VALUE = 'stack';
const LEGACY_TODO_KEY = 'devflow_todo';
const LEGACY_DOT_DIR = '.devflow';
const NEW_DOT_DIR = '.aoforge';
const LEGACY_ADOPT_BRANCH = 'devflow/adopt';
const NEW_ADOPT_BRANCH = 'aoforge/adopt';
const LEGACY_ADOPT_MARKER = 'devflow-adopt.json';

/** The devflowops product's own files under ~/.devflow/. Never moved, renamed or deleted. */
const DEVFLOWOPS_SENTINELS = Object.freeze({
  // The 16-byte SQLite header followed by a recognisable tail: a sentinel, not a database.
  'devflow.sqlite': 'SQLite format 3\u0000fixture-sentinel-do-not-touch\n',
  'sessions.json': '{\n  "sessions": [\n    { "id": "fixture-session", "product": "devflowops" }\n  ]\n}\n',
});

// ─── legacyMcpJson ────────────────────────────────────────────────────────────

/**
 * A `.mcp.json` document whose `stack mcp` entries carry the legacy ownership key.
 *
 * Owned entries come first, in the given order, each `{ command, args, env: { <ownerKey>: 'stack' } }`
 * (the exact shape `stack mcp` wrote: env holds the ownership marker only). Foreign entries follow,
 * copied verbatim. Pass `ownerKey` to build the same document with another key (the AOForge key
 * for the expected result of a rewrite), so the two never diverge by hand.
 *
 * @param {object} [opts]
 * @param {Record<string,{command:string,args:string[]}>} [opts.owned]
 * @param {Record<string,object>} [opts.foreign]
 * @param {string} [opts.ownerKey='DEVFLOW_MANAGED']
 * @returns {{ mcpServers: Record<string,object> }}
 */
function legacyMcpJson({
  owned = { gopls: { command: 'gopls', args: ['mcp'] } },
  foreign = { playwright: { command: 'npx', args: ['@playwright/mcp@latest'], env: { FOO: 'bar' } } },
  ownerKey = LEGACY_OWNER_KEY,
} = {}) {
  const mcpServers = {};
  for (const [name, spec] of Object.entries(owned)) {
    mcpServers[name] = { command: spec.command, args: [...spec.args], env: { [ownerKey]: OWNER_VALUE } };
  }
  for (const [name, entry] of Object.entries(foreign)) {
    mcpServers[name] = JSON.parse(JSON.stringify(entry));
  }
  return { mcpServers };
}

// ─── legacyTodoTranscript ─────────────────────────────────────────────────────

/**
 * One JSONL session: a TaskCreate tool_use whose `input.metadata` carries the stem under the legacy
 * todo key, and its result (task id `taskId`). Record shapes are todo-transcript-fixtures.cjs's (the
 * observed Claude Code 2.1.292 shapes); only the metadata key differs.
 *
 * @param {object} opts
 * @param {string} opts.stem            the archive stem, e.g. '2026-10-06-carry-the-old-todo'
 * @param {string} [opts.title]         defaults to 'Carry the old todo'
 * @param {string} [opts.subject]       defaults to `Todo: <title>`; pass a plain subject to test a
 *                                      todo identified by its metadata alone
 * @param {number} [opts.taskId=1]
 * @param {string} [opts.metadataKey='devflow_todo'] the key the stem is carried under
 * @returns {string} JSONL text with a trailing newline
 */
function legacyTodoTranscript({ stem, title = 'Carry the old todo', subject, taskId = 1, metadataKey = LEGACY_TODO_KEY } = {}) {
  if (typeof stem !== 'string' || stem === '') throw new Error('legacyTodoTranscript: stem is required');
  return todoFx.transcriptOf(todoFx.taskCreate({
    subject: subject === undefined ? `Todo: ${title}` : subject,
    description: 'a todo captured before the rename',
    metadata: { [metadataKey]: stem },
    taskId,
    ts: todoFx.ts(0),
  }));
}

// ─── legacyDotHome ────────────────────────────────────────────────────────────

function writeTree(base, files) {
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(base, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

/** Every file under `dir` as sorted `<rel> <size> <sha256>` lines (directories as `<rel>/`). */
function listTree(dir) {
  const out = [];
  const walk = (abs, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        out.push(`${childRel}/`);
        walk(childAbs, childRel);
      } else {
        const buf = fs.readFileSync(childAbs);
        out.push(`${childRel} ${buf.length} ${crypto.createHash('sha256').update(buf).digest('hex')}`);
      }
    }
  };
  walk(dir, '');
  return out.sort();
}

/**
 * A fake home with files under ~/.devflow/ (plus the devflowops sentinels devflow.sqlite and
 * sessions.json, always) and, optionally, under ~/.aoforge/.
 *
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.files]    name -> content under <home>/.devflow/
 * @param {Record<string,string>} [opts.newFiles] name -> content under <home>/.aoforge/ (none by default:
 *                                                ~/.aoforge/ does not exist unless asked for)
 * @returns {{ home: string, legacyDir: string, newDir: string, listLegacy: () => string[], cleanup: () => void }}
 */
function legacyDotHome({ files = {}, newFiles = {} } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-dot-home-'));
  const legacyDir = path.join(home, LEGACY_DOT_DIR);
  const newDir = path.join(home, NEW_DOT_DIR);
  fs.mkdirSync(legacyDir, { recursive: true });
  writeTree(legacyDir, { ...DEVFLOWOPS_SENTINELS, ...files });
  if (Object.keys(newFiles).length > 0) writeTree(newDir, newFiles);
  return {
    home,
    legacyDir,
    newDir,
    listLegacy: () => listTree(legacyDir),
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}

// ─── legacyAdoptRepo ──────────────────────────────────────────────────────────

const CODEBASE_DOC_NAMES = [
  'STACK', 'INTEGRATIONS', 'ARCHITECTURE', 'STRUCTURE',
  'CONVENTIONS', 'TESTING', 'PATTERNS', 'CONCERNS',
];

function git(root, home, args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: gitEnv(home),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
}

/**
 * A go-service git repo (adopt-fixtures.cjs) with a half-finished legacy adopt, as the legacy
 * `adopt begin` left it: the devflow/adopt branch checked out at the base commit, the in-progress
 * marker devflow-adopt.json at its git-dir path, and the legacy planning directory `.planning/`
 * holding the mapped codebase docs (untracked, so the resume also exercises the planning-directory
 * fallback of TRD 72-05).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.withNewBranch=false] also create an aoforge/adopt branch at the base commit
 * @param {boolean} [opts.mapped=true]         write the 8 codebase docs under .planning/codebase/
 * @returns {{ root: string, home: string, parent: string, markerPath: string, marker: object,
 *             baseSha: string, cleanup: () => void }}
 */
function legacyAdoptRepo({ withNewBranch = false, mapped = true } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-adopt-parent-'));
  const home = makeFakeHome();
  const root = makeFixture('go-service', { parent, home });

  const baseSha = git(root, home, ['rev-parse', 'HEAD']).trim();
  git(root, home, ['switch', '-q', '-c', LEGACY_ADOPT_BRANCH]);
  if (withNewBranch) git(root, home, ['branch', NEW_ADOPT_BRANCH, baseSha]);

  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (mapped) {
    for (const name of CODEBASE_DOC_NAMES) {
      const body = [`# ${name}`, '', `Mapped by the legacy adopt before the rename (${name.toLowerCase()}).`, ''];
      writeTree(path.join(root, '.planning', 'codebase'), { [`${name}.md`]: body.join('\n') });
    }
  }

  const marker = {
    version: 1,
    status: 'in_progress',
    branch: LEGACY_ADOPT_BRANCH,
    base_branch: 'main',
    base_sha: baseSha,
    started_at: '2026-10-06T12:00:00.000Z',
    plugin_version: '2.15.0',
    steps: {},
  };
  const markerPath = path.resolve(root, git(root, home, ['rev-parse', '--git-path', LEGACY_ADOPT_MARKER]).trim());
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf-8');

  return {
    root,
    home,
    parent,
    markerPath,
    marker,
    baseSha,
    cleanup: () => {
      fs.rmSync(parent, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

module.exports = {
  LEGACY_OWNER_KEY,
  LEGACY_TODO_KEY,
  LEGACY_ADOPT_BRANCH,
  LEGACY_ADOPT_MARKER,
  DEVFLOWOPS_SENTINELS,
  legacyMcpJson,
  legacyTodoTranscript,
  legacyDotHome,
  legacyAdoptRepo,
  listTree,
};
