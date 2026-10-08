'use strict';

// dispatch-completeness.test.cjs — TRD 39-04.
//
// `help.test.cjs` checks COMMANDS against the dispatcher switch, and `doc-refs.repo.test.cjs`
// checks skill tokens (`/aoforge:...`). Neither checks bare `aof-tools <name>` prose against the
// dispatcher — a command can ship, work end to end, and still be documented as "not yet wired"
// (or never documented at all) with nothing failing. This test closes that gap in both
// directions: every documented name must dispatch, and a hand-listed FLOOR must actually be
// documented.
//
// Test list:
// 1. Sensitivity control: isDispatched('no-such-command-39') === false; stderr matches
//    /^Error: Unknown command: no-such-command-39/.
// 2. Positive control: isDispatched('telemetry') === true.
// 3. Every Object.keys(COMMANDS) entry dispatches. Failures collected into one array so a
//    single run lists every offender.
// 4. extractCommands(claudeMd, contextDisciplineMd) ⊇ FLOOR. RED on today's CLAUDE.md: it names
//    context/session-audit/transcript-export/override only as `lib/*.cjs` modules, not as live
//    commands (context-discipline.md already documents `aof-tools context`, so that one name is
//    already present — see the SUMMARY for the exact RED set actually observed).
// 5. Every extracted name (minus EXEMPT) is in COMMANDS and dispatches.
// 6. Every EXEMPT key occurs in the scanned text (no stale exemptions).
// 7. extractCommands unit check on a hand-written snippet -> exactly {state, gh, upgrade, context}.
//
// Tests 4-6 are guarded by IS_AOFORGE_CHECKOUT (they read the repo-root CLAUDE.md and
// context-discipline.md). Tests 1-3 and 7 always run.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { COMMANDS } = require('./help.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
const TOOLS_PATH = path.join(__dirname, '..', 'aof-tools.cjs');
const CONTEXT_DISCIPLINE_REL = 'plugins/aoforge/aoforge/references/context-discipline.md';

// ─── isDispatched: spawn the real binary, HOME/cwd-isolated ───────────────────────────
// Never pass --help: the top-level --help pre-switch answers before dispatch, so an unknown
// name with --help would print the listing and exit 0, hiding a missing case (gotcha).

function isDispatched(name) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'df-disp-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-disp-home-'));
  try {
    const r = spawnSync(process.execPath, [TOOLS_PATH, '--cwd', cwd, name], {
      encoding: 'utf-8',
      timeout: 20000,
      env: { ...process.env, HOME: home },
    });
    return { dispatched: !/^Error: Unknown command:/m.test(r.stderr || ''), stderr: r.stderr || '' };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// ─── extractCommands: narrow Core Tool parse + whole-file aof-tools<space>word scan ────

/** Text from `### Core Tool` up to (not including) the next `### ` heading. */
function coreToolSection(md) {
  const startIdx = md.indexOf('### Core Tool');
  if (startIdx === -1) return '';
  const rest = md.slice(startIdx);
  const nextIdx = rest.indexOf('\n### ');
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

/**
 * For each `- **` line, take the text after the first ` — `. For each backtick span there,
 * take the first whitespace-delimited word (stripping a leading `aof-tools ` first). Keep it
 * only if it matches /^[a-z][a-z0-9-]*$/ — drops `lib/gh.cjs`, `--cwd`, `DEPRECATION_MAP`,
 * `aoforge{version,`.
 */
function coreToolCommands(section) {
  const names = new Set();
  for (const line of section.split('\n')) {
    if (!line.startsWith('- **')) continue;
    const idx = line.indexOf(' — ');
    if (idx === -1) continue;
    const rest = line.slice(idx + ' — '.length);
    const backtickRe = /`([^`]+)`/g;
    let m;
    while ((m = backtickRe.exec(rest)) !== null) {
      let span = m[1];
      if (span.startsWith('aof-tools ')) span = span.slice('aof-tools '.length);
      const word = span.split(/\s+/)[0];
      if (/^[a-z][a-z0-9-]*$/.test(word)) names.add(word);
    }
  }
  return names;
}

/** Every `aof-tools[.cjs] <word>` occurrence anywhere in the text. */
function wholeFileScan(text) {
  const names = new Set();
  const re = /aof-tools(?:\.cjs)?[ \t]+([a-z][a-z0-9-]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) names.add(m[1]);
  return names;
}

/** Union of the narrow Core Tool parse (claudeMd only) and a whole-file scan of both texts. */
function extractCommands(claudeMd, contextDisciplineMd) {
  const names = new Set();
  for (const n of coreToolCommands(coreToolSection(claudeMd))) names.add(n);
  for (const n of wholeFileScan(claudeMd)) names.add(n);
  for (const n of wholeFileScan(contextDisciplineMd)) names.add(n);
  return names;
}

// ─── FLOOR (must_haves truth 3) ────────────────────────────────────────────────────────

const FLOOR = [
  'state', 'objective', 'roadmap', 'init', 'resolve-model', 'validate', 'gh',
  'telemetry', 'context', 'session-audit', 'transcript-export', 'override',
  'changelog', 'upgrade', 'adopt',
];

// ─── EXEMPT (must_haves truth 5) ───────────────────────────────────────────────────────
// Prose false positives the narrow extractor picks up that are not aof-tools commands.
// Every entry must actually occur in the scanned text (test 6) — a dead exemption is a bug.

const EXEMPT = {
  'internals': 'Plugin Layout code-block comment "# aof-tools internals" describing bin/lib/*.cjs',
  'auto': 'Upgrade bullet lists migration kinds `auto` | `confirm` in backticks, not a command',
  'confirm': 'Upgrade bullet lists migration kinds `auto` | `confirm` in backticks, not a command',
  'aof-tools': 'the tool\'s own name appears as a bare backtick span/prefix, never a subcommand',
};

// ─── shared plumbing ────────────────────────────────────────────────────────────────

function readRepoFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
}

// ─── tests 1-3, 7: always run (no repo-file dependency beyond the real binary) ────────

describe('dispatch-completeness: sensitivity and coverage', () => {
  test('1: isDispatched sensitivity control — unknown command reports false', () => {
    const r = isDispatched('no-such-command-39');
    assert.strictEqual(r.dispatched, false);
    assert.match(r.stderr, /^Error: Unknown command: no-such-command-39/m);
  });

  test('2: isDispatched positive control — telemetry dispatches', () => {
    assert.strictEqual(isDispatched('telemetry').dispatched, true);
  });

  test('3: every COMMANDS entry dispatches', () => {
    const failures = [];
    for (const name of Object.keys(COMMANDS)) {
      if (!isDispatched(name).dispatched) failures.push(name);
    }
    assert.deepStrictEqual(failures, [], `undispatched COMMANDS entries: ${failures.join(', ')}`);
  });

  test('7: extractCommands unit check on a hand-written snippet', () => {
    const snippet = [
      '### Core Tool',
      '',
      '- **X** — `state load`, `gh status`, `lib/gh.cjs`, `--cwd <dir>`, `DEPRECATION_MAP`, `aoforge{version}`',
      '',
      'Elsewhere: run aof-tools upgrade --global and aof-tools.cjs context --raw.',
      '',
      '### Next',
    ].join('\n');
    const extracted = extractCommands(snippet, '');
    assert.deepStrictEqual([...extracted].sort(), ['context', 'gh', 'state', 'upgrade']);
  });
});

// ─── tests 4-6: repo-root CLAUDE.md + context-discipline.md ──────────────────────────

describe(
  'dispatch-completeness: CLAUDE.md prose vs dispatcher',
  { skip: IS_AOFORGE_CHECKOUT ? false : 'not an aoforge-claude checkout' },
  () => {
    const claudeMd = () => readRepoFile('CLAUDE.md');
    const contextMd = () => readRepoFile(CONTEXT_DISCIPLINE_REL);

    test('4: extracted commands are a superset of FLOOR', () => {
      const extracted = extractCommands(claudeMd(), contextMd());
      const missing = FLOOR.filter((f) => !extracted.has(f));
      assert.deepStrictEqual(
        missing,
        [],
        `FLOOR names missing from CLAUDE.md/context-discipline.md prose: ${missing.join(', ')}`
      );
    });

    test('5: every extracted name (minus EXEMPT) is a dispatching COMMANDS key', () => {
      const extracted = extractCommands(claudeMd(), contextMd());
      const failures = [];
      for (const name of extracted) {
        if (Object.prototype.hasOwnProperty.call(EXEMPT, name)) continue;
        if (!Object.prototype.hasOwnProperty.call(COMMANDS, name)) {
          failures.push(`${name}: not a COMMANDS key`);
          continue;
        }
        if (!isDispatched(name).dispatched) failures.push(`${name}: does not dispatch`);
      }
      assert.deepStrictEqual(failures, [], failures.join('\n'));
    });

    test('6: every EXEMPT key occurs in the scanned text', () => {
      const combined = claudeMd() + '\n' + contextMd();
      const stale = Object.keys(EXEMPT).filter((k) => !combined.includes(k));
      assert.deepStrictEqual(stale, [], `stale EXEMPT entries (not found in scanned text): ${stale.join(', ')}`);
    });
  }
);

module.exports = { isDispatched, extractCommands, coreToolSection, coreToolCommands, wholeFileScan, FLOOR, EXEMPT };
