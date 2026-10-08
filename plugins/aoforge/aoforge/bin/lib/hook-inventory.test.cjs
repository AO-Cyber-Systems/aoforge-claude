'use strict';

// hook-inventory.test.cjs — TRD 39-03 tests 1-5.
//
// Pins CLAUDE.md's `### Hooks` section to `plugins/aoforge/hooks/hooks.json` (plus
// plugin.json's `statusLine` script) in both directions, so the inventory cannot
// drift silently again: every registered script must be documented, and every
// documented script must be either registered or explicitly marked Draft.
//
// Test list:
// 1. Registered ⊆ documented: every hooks.json + plugin.json statusLine script has
//    a CLAUDE.md bullet.
// 2. Documented ⊆ registered ∪ draft: every CLAUDE.md bullet is registered or sits
//    under a `**Draft (not registered` group. RED today on inject-org-context.js
//    and inject-handoff-results.js.
// 3. Draft labels are true: every Draft-group script exists on disk and is NOT
//    registered. Vacuously true before the Draft group exists.
// 4. Sensitivity control: classifyInventory on a hand-written synthetic snippet.
// 5. Sanity floor: registered set >= 10, bullet set non-empty.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

// ---- pure parser functions ----

/** Text from `### Hooks` up to (not including) the next `### ` heading. */
function hooksSection(md) {
  const startIdx = md.indexOf('### Hooks');
  if (startIdx === -1) return '';
  const rest = md.slice(startIdx);
  const nextIdx = rest.indexOf('\n### ');
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

/** [{script, group}] for every `- \`<name>.js\`` bullet; group is the most recent `**...**` line. */
function parseBullets(section) {
  const lines = section.split('\n');
  let group = null;
  const bullets = [];
  for (const line of lines) {
    const groupMatch = line.match(/^\*\*(.+?):\*\*/);
    if (groupMatch) {
      group = groupMatch[0];
      continue;
    }
    const bulletMatch = line.match(/^- `([^`]+)`/);
    if (bulletMatch && /\.js$/.test(bulletMatch[1])) {
      bullets.push({ script: bulletMatch[1], group });
    }
  }
  return bullets;
}

/** Every `hooks/<name>.js` reference across hooks.json + plugin.json (statusLine). */
function registeredScripts(hooksJson, pluginJson) {
  const scripts = new Set();
  const re = /hooks\/([a-z0-9-]+\.js)/g;
  for (const blob of [JSON.stringify(hooksJson), JSON.stringify(pluginJson)]) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(blob))) scripts.add(m[1]);
  }
  return scripts;
}

function isDraftGroup(group) {
  return !!group && /^\*\*Draft \(not registered/.test(group);
}

/** Bullets that are neither registered nor under a Draft group. */
function classifyInventory(md, registeredSet) {
  const bullets = parseBullets(hooksSection(md));
  const undocumentedLive = bullets
    .filter(({ script, group }) => !registeredSet.has(script) && !isDraftGroup(group))
    .map(({ script }) => script);
  return { undocumentedLive };
}

describe(
  'CLAUDE.md hook inventory (TRD 39-03)',
  { skip: !IS_AOFORGE_CHECKOUT ? 'not an AOForge checkout' : false },
  () => {
    const claudeMd = () => fs.readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf-8');
    const hooksJson = () =>
      JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'plugins/aoforge/hooks/hooks.json'), 'utf-8'));
    const pluginJson = () =>
      JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'plugins/aoforge/.claude-plugin/plugin.json'), 'utf-8')
      );

    test('1. registered ⊆ documented: every registered script has a CLAUDE.md bullet', () => {
      const registered = registeredScripts(hooksJson(), pluginJson());
      const documented = new Set(parseBullets(hooksSection(claudeMd())).map((b) => b.script));
      const missing = [...registered].filter((s) => !documented.has(s));
      assert.deepEqual(
        missing,
        [],
        `expected every registered script to have a CLAUDE.md bullet, missing: ${missing.join(', ')}`
      );
    });

    test('2. documented ⊆ registered ∪ draft: every bullet is registered or Draft-grouped', () => {
      const registered = registeredScripts(hooksJson(), pluginJson());
      const { undocumentedLive } = classifyInventory(claudeMd(), registered);
      assert.deepEqual(
        undocumentedLive.sort(),
        [],
        `expected no bullets claiming to be live while unregistered and un-Drafted, found: ${undocumentedLive.join(', ')}`
      );
    });

    test('3. Draft labels are true: script exists on disk and is not registered', () => {
      const registered = registeredScripts(hooksJson(), pluginJson());
      const bullets = parseBullets(hooksSection(claudeMd()));
      const draftBullets = bullets.filter((b) => isDraftGroup(b.group));
      // Vacuously true before the Draft group exists (RED phase); once it exists,
      // every entry in it must hold both properties.
      for (const { script } of draftBullets) {
        const onDisk = fs.existsSync(path.join(REPO_ROOT, 'plugins/aoforge/hooks', script));
        assert.ok(onDisk, `expected Draft script ${script} to exist on disk`);
        assert.ok(!registered.has(script), `expected Draft script ${script} to NOT be registered in hooks.json`);
      }
    });

    test('4. classifyInventory sensitivity control on a synthetic snippet', () => {
      const registeredSet = new Set(['known.js']);
      const liveSnippet = [
        '### Hooks (test)',
        '',
        '**Runtime sync:**',
        '- `known.js` — registered',
        '- `ghost.js` — not registered, not marked draft',
        '',
        '### Marketplace',
        '',
      ].join('\n');
      const { undocumentedLive: liveResult } = classifyInventory(liveSnippet, registeredSet);
      assert.deepEqual(liveResult, ['ghost.js']);

      const draftSnippet = [
        '### Hooks (test)',
        '',
        '**Runtime sync:**',
        '- `known.js` — registered',
        '',
        '**Draft (not registered in hooks.json):**',
        '- `ghost.js` — draft, not registered',
        '',
        '### Marketplace',
        '',
      ].join('\n');
      const { undocumentedLive: draftResult } = classifyInventory(draftSnippet, registeredSet);
      assert.deepEqual(draftResult, []);
    });

    test('5. sanity floor: parser is not silently matching nothing', () => {
      const registered = registeredScripts(hooksJson(), pluginJson());
      const bullets = parseBullets(hooksSection(claudeMd()));
      assert.ok(registered.size >= 10, `expected >= 10 registered scripts, got ${registered.size}`);
      assert.ok(bullets.length > 0, 'expected a non-empty bullet set');
    });
  }
);
