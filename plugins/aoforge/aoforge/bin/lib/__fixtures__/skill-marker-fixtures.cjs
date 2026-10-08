'use strict';

// Hand-built `.planning/.skill-active` project builder (TRD 69-02, TOOL-09).
//
// no_llm_test_data: every marker body is literal JSON whose times are offsets from an injected
// `now`, written into an `fs.mkdtemp`-ed stamped project (doctor-fixtures.makeDoctorProject). Every
// git call runs with upgrade-fixtures' gitEnv(home): a fake HOME, no system config, a local
// identity and no signing, so the operator's git config is never consulted. This repository's own
// `.planning/.skill-active` is never read: during an execution it is the live marker that holds the
// executor's edit gate open.
//
// makeMarkerProject builds every row of the 69-02 decision table in one call:
//
//   marker       a MARKERS key ('live' | 'expired' | 'garbage' | 'empty' | 'legacyOld' | 'legacyFresh'),
//                an object (serialised as JSON), or null (no marker file)
//   tracked      `git add -f` the marker and commit it (git only)
//   ignored      commit a .gitignore rule for the marker (git only)
//   stagedOther  stage an unrelated file, never committed (git only)
//   git          false -> a plain directory, no repository

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { makeDoctorProject } = require('./doctor-fixtures.cjs');
const { gitEnv } = require('./upgrade-fixtures.cjs');

const MARKER_REL = '.planning/.skill-active';
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_NOW = new Date('2026-10-08T12:00:00.000Z');

function body(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

/**
 * MARKERS(now) -> literal marker file bodies relative to `now` (a Date or epoch ms).
 *   live         started 1h ago, expires in 7h
 *   expired      started 9h ago, expired 1h ago
 *   garbage      truncated JSON
 *   empty        a zero-byte file
 *   legacyOld    pre-27-01 shape (no expires_at), started 9h ago
 *   legacyFresh  pre-27-01 shape (no expires_at), started 1h ago
 */
function MARKERS(now = DEFAULT_NOW) {
  const t = now instanceof Date ? now.getTime() : now;
  const iso = (ms) => new Date(ms).toISOString();
  return {
    live: body({ skill: 'build', started_at: iso(t - HOUR_MS), pid: 4242, expires_at: iso(t + 7 * HOUR_MS) }),
    expired: body({ skill: 'build', started_at: iso(t - 9 * HOUR_MS), pid: 4242, expires_at: iso(t - HOUR_MS) }),
    garbage: '{"skill": "bu',
    empty: '',
    legacyOld: body({ skill: 'build', started_at: iso(t - 9 * HOUR_MS), pid: 4242 }),
    legacyFresh: body({ skill: 'build', started_at: iso(t - HOUR_MS), pid: 4242 }),
  };
}

function markerBody(marker, now) {
  if (marker !== null && typeof marker === 'object') return body(marker);
  const bodies = MARKERS(now);
  if (!Object.prototype.hasOwnProperty.call(bodies, marker)) {
    throw new Error(`unknown marker "${marker}" (expected one of ${Object.keys(bodies).join(', ')})`);
  }
  return bodies[marker];
}

function writeRel(root, rel, content) {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

/**
 * makeMarkerProject(opts) -> { root, home, env, now, nowMs, markerPath, git, porcelain, tracked, snapshot, cleanup }
 *
 *   git(args)    -> { status, stdout, stderr }   runs `git <args>` in root with the fixture env
 *   porcelain()  -> `git status --porcelain=v1` text ('' for a non-repo)
 *   tracked()    -> [MARKER_REL] when the marker is in the index, else [] (also [] for a non-repo)
 *   snapshot()   -> Map(relPosixPath -> sha256) of every file outside .git
 *   cleanup()    -> removes root and home
 */
function makeMarkerProject({
  git = true,
  marker = null,
  tracked = false,
  ignored = false,
  stagedOther = false,
  now = DEFAULT_NOW,
} = {}) {
  const { root, home } = makeDoctorProject({ git });
  const env = gitEnv(home);
  const nowDate = now instanceof Date ? now : new Date(now);
  const markerPath = path.join(root, ...MARKER_REL.split('/'));

  const run = (args) => {
    const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
      cwd: root, env, input: '', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  const must = (args) => {
    const r = run(args);
    if (r.status !== 0) throw new Error(`fixture git ${args.join(' ')} failed: ${r.stderr.trim() || r.status}`);
    return r;
  };

  if (marker !== null) writeRel(root, MARKER_REL, markerBody(marker, nowDate));

  if (git) {
    if (ignored) {
      fs.appendFileSync(path.join(root, '.gitignore'), `${MARKER_REL}\n`, 'utf-8');
      must(['add', '--', '.gitignore']);
      must(['commit', '-q', '-m', 'ignore the skill marker']);
    }
    if (tracked) {
      if (marker === null) throw new Error('tracked: true needs a marker');
      must(['add', '-f', '--', MARKER_REL]);
      must(['commit', '-q', '-m', 'track the skill marker']);
    }
    if (stagedOther) {
      writeRel(root, 'notes.txt', 'unrelated staged work\n');
      must(['add', '--', 'notes.txt']);
    }
  }

  const snapshot = () => {
    const out = new Map();
    const walk = (dir, rel) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        const abs = path.join(dir, entry.name);
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(abs, relPath);
        else if (entry.isFile()) out.set(relPath, crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'));
      }
    };
    walk(root, '');
    return out;
  };

  return {
    root,
    home,
    env,
    now: nowDate,
    nowMs: nowDate.getTime(),
    markerPath,
    git: run,
    porcelain: () => (git ? run(['status', '--porcelain=v1']).stdout : ''),
    tracked: () => (git ? run(['ls-files', '-z']).stdout.split('\0').filter(Boolean).filter((p) => p === MARKER_REL) : []),
    snapshot,
    cleanup: () => {
      for (const dir of [root, home]) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { makeMarkerProject, MARKERS, MARKER_REL, HOUR_MS, DEFAULT_NOW };
