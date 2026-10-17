'use strict';

/**
 * legacy-runtime-fixtures.cjs (objective 72, TRD 72-07; trimmed in objective 78, TRD 78-06) — a fake user home whose
 * old runtime home (`<home>/.claude/devflow/`) is populated the way DevFlow 2.15.0 leaves it, and the repo-keyed state
 * writer the `state rekey` tests use.
 *
 * Users: hooks/sync-runtime.legacy.test.js (3.1 carries none of this state over), legacy-doctor-fixtures.cjs
 * leftoverHome({ legacyRuntime: true }) (doctor check 16 and the coexistence-guard notice), state-rekey.test.cjs
 * (writeKeyedState). The 3.0.x runtime state migration these homes were built for is gone (TRD 78-06).
 *
 *   const h = legacyRuntimeHome();                       // repo key 'demo-1a2b3c4d'
 *   h.home; h.legacy; h.aoforge; h.key; h.files; h.cleanup();
 *
 * Layout written under `<home>/.claude/devflow/` (every content a short typed-out literal, see LEGACY_FILES):
 *   calibration.json, audit.log, transcript-index.jsonl, stacks/go.md          the user's data at the top level
 *   state/estimates/<key>.json, state/estimates/history/<key>/<ts>.json        estimate run state and its archive
 *   state/awareness/<key>.json, state/hook-markers/<key>/m.json               keyed caches and markers
 *   state/outbox/<key>.json                                                    the store-mode outbox journal
 *   backups/<key>/2026-10-08/x, backups/.registry.json (one repo)              backups and their registry
 *   locks/ (empty)                                                             runtime locks, not state
 *   workflows/x.md, references/x.md, templates/x.md, bin/df-tools.cjs,         one file in each mirrored subdir:
 *   schemas/x.json, stack-profiles/x.md                                       the old plugin's mirror, not state
 *   .plugin-version, .devflow-notices.json                                     old runtime markers, not state
 *
 * Nothing is written under `<home>/.claude/aoforge/`.
 *
 * writeKeyedState(runtimeRoot, key, { projectPath }) writes only the repo-keyed entries (estimates, history,
 * awareness, hook markers, outbox journal + sidecars + lock, backups and the registry entry) into any runtime root,
 * so the `state rekey` tests can seed the new home under a key of their choosing. It returns the relative paths it
 * wrote, sorted.
 *
 * Legacy names may be spelled here: this is one of the `__fixtures__/legacy-*` files the rename codemod and the
 * rename guard leave alone. Directory names still come from legacy-names.cjs.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { NAMES, LEGACY } = require('../legacy-names.cjs');

const DEFAULT_KEY = 'demo-1a2b3c4d';
const HISTORY_FILE = '2026-10-08T00_00_00_000Z.json';
const REGISTERED_AT = '2026-10-01T00:00:00.000Z';

/** The un-keyed files of an old runtime home: rel path -> content. */
const LEGACY_FILES = Object.freeze({
  'calibration.json': '{"version":3,"classes":{"test":{"minutes":{"p50":3.7}}}}\n',
  'audit.log': '2026-10-08T00:00:00.000Z gate=edits decision=allow\n',
  'transcript-index.jsonl': '{"session":"s-1","turns":3}\n',
  'stacks/go.md': '---\nid: go\n---\n# Go overrides\n',
  'workflows/x.md': '# workflow from the old mirror\n',
  'references/x.md': '# reference from the old mirror\n',
  'templates/x.md': '# template from the old mirror\n',
  [`bin/${LEGACY.cli}.cjs`]: '// the old CLI from the old mirror\n',
  'schemas/x.json': '{"schema":"old mirror"}\n',
  'stack-profiles/x.md': '# stack profile from the old mirror\n',
  '.plugin-version': '2.15.0',
  [LEGACY.notices]: '{"notices":[]}\n',
});

function writeFile(root, rel, content) {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** rel path -> content for the repo-keyed entries of `key`, as one runtime home holds them. */
function keyedFiles(key, projectPath) {
  return {
    [`state/estimates/${key}.json`]: `{"objective":"72","key":"${key}","wave":7}\n`,
    [`state/estimates/history/${key}/${HISTORY_FILE}`]: `{"objective":"71","key":"${key}","finished":true}\n`,
    [`state/awareness/${key}.json`]: `{"repo":"${key}","branches":[]}\n`,
    [`state/hook-markers/${key}/m.json`]: `{"marker":"retry","key":"${key}"}\n`,
    [`state/outbox/${key}.json`]: `{"version":1,"ops":[{"id":"op-1","kind":"comment"}]}\n`,
    [`state/outbox/${key}.base.json`]: '{"base":true}\n',
    [`state/outbox/${key}.verb-writes.json`]: '{"writes":[]}\n',
    [`state/outbox/${key}.lock`]: '{"pid":1}\n',
    [`backups/${key}/2026-10-08/x`]: 'backup body\n',
    'backups/.registry.json': `${JSON.stringify(
      { repos: { [key]: { path: projectPath, registered_at: REGISTERED_AT } } },
      null,
      2
    )}\n`,
  };
}

/**
 * Write the repo-keyed entries of `key` into `runtimeRoot`. An existing registry gains the entry instead of being
 * replaced. Returns the relative paths written, sorted.
 */
function writeKeyedState(runtimeRoot, key, { projectPath = path.join(os.tmpdir(), 'demo') } = {}) {
  const files = keyedFiles(key, projectPath);
  const regRel = 'backups/.registry.json';
  const regFile = path.join(runtimeRoot, 'backups', '.registry.json');
  if (fs.existsSync(regFile)) {
    const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    reg.repos[key] = { path: projectPath, registered_at: REGISTERED_AT };
    files[regRel] = `${JSON.stringify(reg, null, 2)}\n`;
  }
  for (const [rel, content] of Object.entries(files)) writeFile(runtimeRoot, rel, content);
  return Object.keys(files).sort();
}

/**
 * A fake home with a populated old runtime home (the new one is only named, never created).
 *
 * @param {{repoKey?: string}} [opts]
 * @returns {{home: string, legacy: string, aoforge: string, key: string, files: Record<string, string>,
 *            cleanup: () => void}}
 */
function legacyRuntimeHome({ repoKey = DEFAULT_KEY } = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aof-legacy-rt-')));
  const legacy = path.join(home, '.claude', LEGACY.runtimeDir);
  const aoforge = path.join(home, '.claude', NAMES.runtimeDir);

  const files = { ...LEGACY_FILES };
  for (const [rel, content] of Object.entries(files)) writeFile(legacy, rel, content);
  const projectPath = path.join(home, 'dev', 'demo');
  Object.assign(files, keyedFiles(repoKey, projectPath));
  writeKeyedState(legacy, repoKey, { projectPath });
  fs.mkdirSync(path.join(legacy, 'locks'), { recursive: true });

  return {
    home,
    legacy,
    aoforge,
    key: repoKey,
    files,
    cleanup() {
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

module.exports = { legacyRuntimeHome, writeKeyedState, LEGACY_FILES, DEFAULT_KEY, HISTORY_FILE };
