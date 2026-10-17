'use strict';

/**
 * `gh` PATH shim (TRD 46-01). FOR CLI-LEVEL TESTS ONLY: tests that spawn a real `aof-tools`
 * process and so cannot inject `_setRunGh`. Unit tests should use gh-client `_setRunGh`
 * (or `buildMockRunGh` from gh-fixtures.cjs) instead.
 *
 * `installGhShim({dir, table, defaultCode})` writes an executable `gh` into `<dir>/bin`.
 * When run, that script
 *   - appends `JSON.stringify(argv)` as one line to `<dir>/gh-calls.jsonl`,
 *   - looks `argv.join(' ')` up in `<dir>/gh-table.json` (exact key first, then the longest
 *     key that is a prefix, mirroring gh-fixtures.cjs `buildMockRunGh`),
 *   - writes the entry's stdout/stderr and exits with its `code`,
 *   - for an unmatched argv prints `[gh-shim] no match: <argv>` to stderr and exits with
 *     `defaultCode` (1), so an unanticipated call fails loudly instead of reaching GitHub.
 *     The one exception: an unmatched `api repos/<o>/<r>/labels/<name>` answers 404 (TRD 78-09: the
 *     pre-rename label twin is absent unless a table entry says otherwise).
 *
 * Table entries look like `{ code: 0, stdout: '{"number":7}', stderr: '' }`. `delay_ms` (optional)
 * waits that long before answering, so a test can drive a timeout (TRD 72-27); only a positive
 * integer waits.
 *
 * Use `shim.env()` as the child's environment: it puts the shim first on PATH (so a real `gh`
 * on the machine is never reached) and points HOME and AOFORGE_GH_CACHE_DIR at temp dirs
 * (so the real ~/.claude is never read or written).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * The body of the generated `gh` script. It is serialised with Function#toString, so it must
 * be self-contained: no references to anything outside its own parameters and `require`.
 */
function shimMain(defaultCode) {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const argv = process.argv.slice(2);

  fs.appendFileSync(path.join(root, 'gh-calls.jsonl'), JSON.stringify(argv) + '\n');

  let table = {};
  try {
    table = JSON.parse(fs.readFileSync(path.join(root, 'gh-table.json'), 'utf-8'));
  } catch {
    table = {};
  }

  const key = argv.join(' ');
  let entry = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
  if (entry === undefined) {
    let bestLen = -1;
    for (const k of Object.keys(table)) {
      if (k.length > 0 && key.startsWith(k) && k.length > bestLen) {
        entry = table[k];
        bestLen = k.length;
      }
    }
  }

  // One label GET (gh-legacy-labels' "is this repository rebranded" check, TRD 78-09) that the table does not
  // answer is a 404, as GitHub answers for a label the repository lacks; a table entry still wins.
  if (entry === undefined && argv.length === 2 && argv[0] === 'api' && /^repos\/[^/]+\/[^/]+\/labels\/[^/]+$/.test(argv[1])) {
    process.stdout.write('{"message":"Not Found","status":"404"}');
    process.stderr.write('gh: Not Found (HTTP 404)\n');
    process.exitCode = 1;
    return;
  }

  if (entry === undefined) {
    process.stderr.write('[gh-shim] no match: ' + key + '\n');
    process.exitCode = defaultCode;
    return;
  }
  // Wait before writing anything, so a caller's timeout kills the shim with nothing read (TRD 72-27).
  if (Number.isInteger(entry.delay_ms) && entry.delay_ms > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, entry.delay_ms);
  }
  if (entry.stdout) process.stdout.write(String(entry.stdout));
  if (entry.stderr) process.stderr.write(String(entry.stderr));
  process.exitCode = Number.isInteger(entry.code) ? entry.code : 0;
}

function shimSource(defaultCode) {
  return `#!/usr/bin/env node\n'use strict';\n(${shimMain.toString()})(${Number(defaultCode)});\n`;
}

/**
 * @param {{dir?: string, table?: Record<string, {code?: number, stdout?: string, stderr?: string, delay_ms?: number}>, defaultCode?: number}} [opts]
 * @returns {{dir:string, binDir:string, callsFile:string, tableFile:string,
 *            readCalls:()=>string[][], setTable:(t:object)=>void,
 *            env:(extra?:object)=>object, cleanup:()=>void}}
 */
function installGhShim({ dir, table = {}, defaultCode = 1 } = {}) {
  const root = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'gh-shim-'));
  const binDir = path.join(root, 'bin');
  const homeDir = path.join(root, 'home');
  const cacheDir = path.join(root, 'gh-cache');
  const callsFile = path.join(root, 'gh-calls.jsonl');
  const tableFile = path.join(root, 'gh-table.json');

  for (const d of [binDir, homeDir, cacheDir]) fs.mkdirSync(d, { recursive: true });

  // The script has no extension; pin it to CommonJS so a parent package.json
  // with "type": "module" (a caller-supplied dir inside a repo) cannot change how it loads.
  fs.writeFileSync(path.join(binDir, 'package.json'), '{"type":"commonjs"}\n');
  const ghPath = path.join(binDir, 'gh');
  fs.writeFileSync(ghPath, shimSource(defaultCode));
  fs.chmodSync(ghPath, 0o755);

  fs.rmSync(callsFile, { force: true });

  function setTable(next) {
    fs.writeFileSync(tableFile, JSON.stringify(next || {}, null, 2) + '\n');
  }
  setTable(table);

  function readCalls() {
    if (!fs.existsSync(callsFile)) return [];
    return fs.readFileSync(callsFile, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  function env(extra = {}) {
    // The shim's `#!/usr/bin/env node` needs `node` on PATH: append the running node's own
    // directory as a last resort so the shim still works when node was started by absolute path.
    const pathValue = [binDir, process.env.PATH, path.dirname(process.execPath)]
      .filter(Boolean)
      .join(path.delimiter);
    return {
      ...process.env,
      PATH: pathValue,
      HOME: homeDir,
      AOFORGE_GH_CACHE_DIR: cacheDir,
      ...extra,
    };
  }

  function cleanup() {
    fs.rmSync(root, { recursive: true, force: true });
  }

  return { dir: root, binDir, callsFile, tableFile, readCalls, setTable, env, cleanup };
}

module.exports = { installGhShim };
