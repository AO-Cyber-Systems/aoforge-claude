'use strict';

// Hand-built fixtures for the legacy-name and compat tests (objective 72).
//
// Naming convention (enforced by the 72-04 repo test): a legacy name may be spelled
// only in bin/lib/legacy-names.cjs, in bin/lib/__fixtures__/legacy-*.cjs (this file)
// and in test files named *.legacy.test.cjs / *.legacy.test.js. Every other module
// builds its legacy strings from LEGACY.
//
// Factory functions with explicit inputs, not generated data.

const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── projectTree ──────────────────────────────────────────────────────────────

/**
 * Build a project root in a fresh temp dir.
 *
 * @param {object} [opts]
 * @param {'aoforge'|'legacy'|'both'|'none'} [opts.layout='aoforge']
 *   aoforge: only the new planning dir; legacy: only the old one; both: each; none: neither.
 * @param {Record<string,string>} [opts.files] relative path -> content, written under root
 * @param {string|null} [opts.nested] a relative subdirectory to create (e.g. 'a/b')
 * @returns {{ root: string, cleanup: () => void }}
 */
function projectTree({ layout = 'aoforge', files = {}, nested = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-project-'));
  if (layout === 'aoforge' || layout === 'both') {
    fs.mkdirSync(path.join(root, '.aoforge'), { recursive: true });
  }
  if (layout === 'legacy' || layout === 'both') {
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  }
  if (nested) fs.mkdirSync(path.join(root, nested), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// ─── legacyEnv ────────────────────────────────────────────────────────────────

/**
 * A plain env object holding the old-prefix variables. Never touches process.env.
 *
 * @param {Record<string,string>} [overrides] merged over the defaults
 * @returns {Record<string,string>}
 */
function legacyEnv(overrides = {}) {
  return Object.assign(
    {
      DEVFLOW_SKIP_EDIT_GATE: '1',
      DEVFLOW_CALIBRATION_PATH: '/tmp/x.json',
    },
    overrides,
  );
}

// ─── fakeHome ─────────────────────────────────────────────────────────────────

/**
 * A fake home directory with files under the old and the new user dot directory.
 *
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.legacyDot] file name -> content under <home>/.devflow/
 * @param {Record<string,string>} [opts.newDot] file name -> content under <home>/.aoforge/
 * @returns {{ home: string, cleanup: () => void }}
 */
function fakeHome({ legacyDot = {}, newDot = {} } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-home-'));
  const write = (dir, files) => {
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(home, dir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  };
  write('.devflow', legacyDot);
  write('.aoforge', newDot);
  return { home, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
}

module.exports = { projectTree, legacyEnv, fakeHome };
