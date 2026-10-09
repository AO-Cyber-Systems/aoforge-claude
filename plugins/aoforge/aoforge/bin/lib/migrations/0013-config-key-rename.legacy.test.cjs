'use strict';

// Migration 0013 — config-key rename, the runner over a legacy project, and W067 (objective 72, TRD 72-08, INST-03/04).
//
// Test list
// 10. 0013 detect/apply: `{devflow:{version:'2.15.0',migrations_applied:['0001']}}` -> `{aoforge:{...same}}`, in the
//     legacy key's place; both keys -> one `aoforge` object, aoforge values winning; no legacy key -> not applicable;
//     no config.json -> not applicable; other keys keep their order. Dry run writes nothing.
// 11. upgrade.readStamp: only `devflow` -> that stamp; both -> the `aoforge` one.
// 12. upgrade.apply on a clean legacy project: 0012 then 0013 applied, the final stamp in `.aoforge/config.json`
//     (version, the old migrations plus 0012 and 0013, no legacy key), changed_files = the two directories and
//     .gitignore. check() lists both as pending auto migrations first.
//     12b. a dirty legacy project: 0012 is deferred ('dirty'), the later migrations are held, nothing is applied or
//          stamped, config.json is byte-identical, report.deferred names 0012.
//     12c. an earlier migration of the same run (0001 normalising config.json) does not defer 0012: the runner
//          hands its changes over in ctx.changedSoFar.
// 13. validate health: only the legacy key -> W067 legacy-config-key with the 0013 fix; after 0013 -> none.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { NAMES, LEGACY } = require('../legacy-names.cjs');
const { legacyProject, MIGRATIONS_APPLIED } = require('../__fixtures__/legacy-migration-fixtures.cjs');
const { planningProject } = require('../__fixtures__/legacy-layout-fixtures.cjs');
const upgrade = require('../upgrade.cjs');

const M_PATH = path.join(__dirname, '0013-config-key-rename.cjs');
const NEW = NAMES.planningDir;
const OLD = LEGACY.planningDir;
const TO = '3.0.0';

function m0013() {
  return require(M_PATH);
}

function withProject(make, fn) {
  const p = make();
  try {
    return fn(p);
  } finally {
    p.cleanup();
  }
}

/** A `.aoforge/` project whose config.json is exactly `config` (object) or `text` (string). */
function aoforgeWithConfig(config) {
  const text = typeof config === 'string' ? config : `${JSON.stringify(config, null, 2)}\n`;
  return planningProject({ layout: 'aoforge', files: { 'config.json': text } });
}

function ctxFor(p, extra = {}) {
  return { projectRoot: p.root, userHome: p.home, pluginVersion: TO, dryRun: false, options: {}, ...extra };
}

function readConfigAt(p, dir) {
  return JSON.parse(fs.readFileSync(path.join(p.root, dir, 'config.json'), 'utf-8'));
}

// ─── 10. 0013 ───────────────────────────────────────────────────────────────────

describe('10. migration 0013', () => {
  test('10a. the module meets the runner contract: auto, since 3.0.0', () => {
    const m = m0013();
    assert.equal(m.id, '0013');
    assert.equal(m.safety, 'auto');
    assert.equal(m.since, '3.0.0');
  });

  test('10b. only the legacy key -> renamed in place, same value, other keys in order', () => {
    const config = {
      mode: 'yolo',
      devflow: { version: '2.15.0', migrations_applied: ['0001'] },
      workflow: { auto_advance: false },
    };
    withProject(() => aoforgeWithConfig(config), (p) => {
      const det = m0013().detect(ctxFor(p));
      assert.equal(det.applies, true, JSON.stringify(det));
      const res = m0013().apply(ctxFor(p));
      assert.deepEqual(res.changed, [`${NEW}/config.json`]);
      const after = readConfigAt(p, NEW);
      assert.deepEqual(Object.keys(after), ['mode', 'aoforge', 'workflow']);
      assert.deepEqual(after.aoforge, { version: '2.15.0', migrations_applied: ['0001'] });
      assert.equal(m0013().detect(ctxFor(p)).applies, false, 'idempotent');
    });
  });

  test('10c. both keys -> one aoforge object, aoforge values winning; the legacy key is gone', () => {
    const config = {
      aoforge: { version: '3.0.0', upgraded_at: '2026-10-08T00:00:00.000Z' },
      devflow: { version: '2.15.0', migrations_applied: ['0001', '0003'], extra: 'kept' },
      mode: 'yolo',
    };
    withProject(() => aoforgeWithConfig(config), (p) => {
      assert.equal(m0013().detect(ctxFor(p)).applies, true);
      m0013().apply(ctxFor(p));
      const after = readConfigAt(p, NEW);
      assert.deepEqual(Object.keys(after), ['aoforge', 'mode']);
      assert.deepEqual(after.aoforge, {
        version: '3.0.0',
        migrations_applied: ['0001', '0003'],
        extra: 'kept',
        upgraded_at: '2026-10-08T00:00:00.000Z',
      });
      assert.equal(LEGACY.configKey in after, false);
    });
  });

  test('10d. no legacy key, or no config.json -> not applicable', () => {
    withProject(() => aoforgeWithConfig({ mode: 'yolo', aoforge: { version: '3.0.0' } }), (p) => {
      const det = m0013().detect(ctxFor(p));
      assert.equal(det.applies, false, JSON.stringify(det));
    });
    withProject(() => planningProject({ layout: 'none' }), (p) => {
      assert.equal(m0013().detect(ctxFor(p)).applies, false);
    });
  });

  test('10e. dry run reports the file and writes nothing', () => {
    withProject(() => aoforgeWithConfig({ devflow: { version: '2.15.0' } }), (p) => {
      const file = path.join(p.root, NEW, 'config.json');
      const before = fs.readFileSync(file, 'utf-8');
      const res = m0013().apply(ctxFor(p, { dryRun: true }));
      assert.deepEqual(res.changed, [`${NEW}/config.json`]);
      assert.equal(fs.readFileSync(file, 'utf-8'), before);
    });
  });

  test('10f. a legacy project: 0013 renames the key in the legacy directory too', () => {
    withProject(() => legacyProject({ state: 'nogit' }), (p) => {
      assert.equal(m0013().detect(ctxFor(p)).applies, true);
      const res = m0013().apply(ctxFor(p));
      assert.deepEqual(res.changed, [`${OLD}/config.json`]);
      const after = readConfigAt(p, OLD);
      assert.equal(after.aoforge.version, '2.15.0');
      assert.equal(LEGACY.configKey in after, false);
    });
  });
});

// ─── 11. readStamp ──────────────────────────────────────────────────────────────

describe('11. upgrade.readStamp', () => {
  test('11a. only the legacy key -> that stamp', () => {
    withProject(() => aoforgeWithConfig({ devflow: { version: '2.15.0', migrations_applied: ['0001'] } }), (p) => {
      const s = upgrade.readStamp(p.root);
      assert.equal(s && s.version, '2.15.0');
      assert.deepEqual(s.migrations_applied, ['0001']);
    });
  });

  test('11b. both keys -> the aoforge stamp', () => {
    const config = { devflow: { version: '2.15.0' }, aoforge: { version: '3.0.0', migrations_applied: ['0013'] } };
    withProject(() => aoforgeWithConfig(config), (p) => {
      const s = upgrade.readStamp(p.root);
      assert.equal(s.version, '3.0.0');
      assert.deepEqual(s.migrations_applied, ['0013']);
    });
  });
});

// ─── 12. the runner over a legacy project ───────────────────────────────────────

describe('12. upgrade.apply on a legacy project', () => {
  test('12. 0012 then 0013, the final stamp in .aoforge/config.json', () => {
    withProject(() => legacyProject({ state: 'clean' }), (p) => {
      const chk = upgrade.check({ projectRoot: p.root, userHome: p.home, pluginVersion: TO });
      assert.equal(chk.from, '2.15.0', 'check reads the legacy stamp');
      assert.deepEqual(chk.pending.map((m) => m.id), ['0012', '0013']);

      const report = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: TO });
      assert.deepEqual(report.failed, []);
      assert.equal(report.from, '2.15.0');
      assert.deepEqual(report.applied.map((a) => a.id), ['0012', '0013']);
      assert.deepEqual(report.changed_files, ['.aoforge', '.gitignore', '.planning']);
      assert.equal(report.up_to_date, true);

      assert.equal(fs.existsSync(path.join(p.root, OLD)), false);
      const cfg = readConfigAt(p, NEW);
      assert.equal(LEGACY.configKey in cfg, false, 'no legacy key');
      assert.equal(cfg.aoforge.version, TO);
      assert.deepEqual(cfg.aoforge.migrations_applied, [...MIGRATIONS_APPLIED, '0012', '0013'].sort());
      assert.equal(typeof cfg.aoforge.upgraded_at, 'string');
      assert.deepEqual(Object.keys(cfg).slice(-1), [NAMES.configKey], 'the stamp takes the legacy key\'s place (last)');
    });
  });

  test('12b. a dirty legacy project: 0012 deferred, later migrations held, nothing stamped', () => {
    withProject(() => legacyProject({ state: 'dirty' }), (p) => {
      const cfgFile = path.join(p.dir, 'config.json');
      const before = fs.readFileSync(cfgFile, 'utf-8');
      const report = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: TO });
      assert.deepEqual(report.applied, []);
      assert.deepEqual(report.failed, []);
      assert.deepEqual(report.changed_files, []);
      assert.deepEqual(report.deferred.map((d) => [d.id, d.reason]), [['0012', 'dirty']]);
      assert.deepEqual(report.pending.map((m) => m.id), ['0012', '0013']);
      assert.equal(report.up_to_date, false);
      assert.equal(fs.readFileSync(cfgFile, 'utf-8'), before, 'config.json byte-identical');
      assert.equal(fs.existsSync(path.join(p.root, NEW)), false);
    });
  });

  test('12c. a change an earlier migration made in the same run does not defer the move', () => {
    // The layout fixture's config.json lacks template sections, so 0001 rewrites it (a tracked file) before 0012.
    withProject(() => planningProject({ layout: 'legacy' }), (p) => {
      const report = upgrade.apply({ projectRoot: p.root, userHome: p.home, pluginVersion: TO });
      assert.deepEqual(report.failed, []);
      const ids = report.applied.map((a) => a.id);
      assert.ok(ids.includes('0001') && ids.includes('0012'), JSON.stringify(ids));
      assert.ok(ids.indexOf('0001') < ids.indexOf('0012'));
      assert.deepEqual(report.deferred, []);
      assert.equal(fs.existsSync(path.join(p.root, OLD)), false);
      assert.equal(readConfigAt(p, NEW).aoforge.version, TO);
      assert.ok(report.changed_files.includes('.aoforge') && report.changed_files.includes('.planning'));
      assert.ok(!report.changed_files.some((f) => f.startsWith(`${OLD}/`) || f.startsWith(`${NEW}/`)),
        `paths under a moved directory collapse into it: ${report.changed_files.join(', ')}`);
    });
  });
});

// ─── 13. W067 ───────────────────────────────────────────────────────────────────

function healthWarnings(p, code) {
  const r = p.run(['validate', 'health', '--raw']);
  let j;
  try {
    j = JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`validate health did not print JSON: ${e.message}\n${r.out}`);
  }
  return (j.warnings || []).filter((w) => w.code === code);
}

describe('13. validate health W067', () => {
  test('13. only the legacy key -> W067 legacy-config-key with the 0013 fix; after 0013 -> none', () => {
    withProject(() => aoforgeWithConfig({ mode: 'yolo', devflow: { version: '2.15.0' } }), (p) => {
      const found = healthWarnings(p, 'W067');
      assert.equal(found.length, 1, JSON.stringify(found));
      assert.match(found[0].message, /^legacy-config-key: /);
      assert.ok(found[0].fix.includes('aof-tools upgrade --apply --only 0013'), found[0].fix);
      assert.equal(found[0].repairable, false);

      m0013().apply(ctxFor(p));
      assert.deepEqual(healthWarnings(p, 'W067'), []);
    });
  });

  test('13b. both keys, or only the new key -> no W067', () => {
    withProject(() => aoforgeWithConfig({ aoforge: { version: '3.0.0' }, devflow: { version: '2.15.0' } }), (p) => {
      assert.deepEqual(healthWarnings(p, 'W067'), []);
    });
  });
});
