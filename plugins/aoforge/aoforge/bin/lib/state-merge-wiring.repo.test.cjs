'use strict';

/**
 * state-merge-wiring.repo.test.cjs — TRD 59-06, the prose half.
 *
 * 59-01 built `merge-driver install|resolve`, 59-02 made `state advance-job --objective N`
 * derive the position from disk and 59-03 put `--cwd <checkout>` in the preflight. These are
 * mechanical pins on the three files that put them where the build uses them, so a prose edit
 * cannot quietly drop the install, the resolve step or the `--objective` flag.
 *
 * The replay of the documented merge sequence lives in
 * hooks/gate-commits-merge-sequence.test.js; this file only reads markdown.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', '..');
const EXECUTE_OBJECTIVE = path.join(PLUGIN, 'aoforge', 'workflows', 'execute-objective.md');
const EXECUTE_TRD = path.join(PLUGIN, 'aoforge', 'workflows', 'execute-trd.md');
const EXECUTOR = path.join(PLUGIN, 'agents', 'executor.md');

const DF_TOOLS = 'node ~/.claude/aoforge/bin/aof-tools.cjs';

function read(p) { return fs.readFileSync(p, 'utf8'); }

/** Fenced code blocks in order: `{lang, body, line}` (line = 1-based fence open). */
function fences(text) {
  const out = [];
  let cur = null;
  text.split('\n').forEach((ln, i) => {
    const m = /^\s*```(\S*)\s*$/.exec(ln);
    if (!m) {
      if (cur) cur.lines.push(ln);
      return;
    }
    if (cur) {
      out.push({ lang: cur.lang, body: cur.lines.join('\n'), line: cur.line });
      cur = null;
    } else {
      cur = { lang: m[1], lines: [], line: i + 1 };
    }
  });
  return out;
}

const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', '']);

function shellLines(text) {
  const lines = [];
  for (const f of fences(text)) {
    if (!SHELL_LANGS.has(f.lang)) continue;
    for (const raw of f.body.split('\n')) {
      const line = raw.trim();
      if (line && !line.startsWith('#')) lines.push(line);
    }
  }
  return lines;
}

/** Everything outside a fence. */
function proseOf(text) {
  const out = [];
  let inFence = false;
  for (const ln of text.split('\n')) {
    if (/^\s*```/.test(ln)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(ln);
  }
  return out.join('\n');
}

/** Same extraction the replay uses: from the marker to `<!-- merge-sequence:end -->` or the next bold paragraph. */
function mergeProtocolSection(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.includes('**Branch merge protocol**'));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/<!--\s*merge-sequence:end\s*-->/.test(lines[i]) || /^\s*\*\*[^*\n]+\*\*/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Step 0 of the wave loop: from `0. **Fix the repo` up to `1. **Describe`. */
function stepZero(text) {
  const start = text.indexOf('0. **Fix the repo and the base for this wave');
  const end = text.indexOf('1. **Describe what');
  assert.ok(start >= 0 && end > start, 'execute-objective.md step 0 is where the pins expect it');
  return text.slice(start, end);
}

/** The text between `<state_updates>` and `</state_updates>` in executor.md. */
function executorStateBlock() {
  const text = read(EXECUTOR);
  const start = text.indexOf('<state_updates>');
  const end = text.indexOf('</state_updates>');
  assert.ok(start >= 0 && end > start, 'executor.md has a <state_updates> block');
  return text.slice(start, end);
}

describe('TRD 59-06 — execute-objective installs the merge driver before the first parallel wave', () => {
  test('7: `merge-driver install` is a shell-fence line, one plain command, ahead of the first `exec-context worktree --repo` fence', () => {
    const text = read(EXECUTE_OBJECTIVE);
    const all = fences(text).filter((f) => SHELL_LANGS.has(f.lang));
    const install = all.findIndex((f) => f.body.split('\n').some((l) => l.trim() === `${DF_TOOLS} merge-driver install`));
    assert.ok(install >= 0, `execute-objective.md must document the line \`${DF_TOOLS} merge-driver install\` in a shell fence`);
    const worktree = all.findIndex((f) => /exec-context worktree --repo/.test(f.body));
    assert.ok(worktree >= 0, 'the exec-context worktree fence is still documented');
    assert.ok(install < worktree, 'the install is documented before the first worktree is provisioned');
    assert.equal(all[install].body.trim(), `${DF_TOOLS} merge-driver install`, 'the install fence holds only the one plain command');
  });

  test('12: step 0 says the install and the wave merges run from the main checkout, never inside an executor worktree, and names `merge-driver uninstall` as the undo', () => {
    const prose = proseOf(stepZero(read(EXECUTE_OBJECTIVE)));
    assert.match(prose, /main checkout/, 'step 0 names the main checkout');
    assert.match(prose, /never inside an executor worktree/, 'step 0 says never inside an executor worktree');
    assert.match(prose, /merge-driver uninstall/, 'step 0 names `merge-driver uninstall` as the undo');
  });
});

describe('TRD 59-06 — the Branch merge protocol resolves state.json and STATE_ARCHIVE.md instead of aborting', () => {
  test('8: the section names both paths and has the `merge-driver resolve <planning_path>` line', () => {
    const section = mergeProtocolSection(read(EXECUTE_OBJECTIVE));
    assert.ok(section, 'execute-objective.md has a "**Branch merge protocol**" section');
    assert.ok(section.includes('.planning/state.json'), 'the protocol names .planning/state.json');
    assert.ok(section.includes('.planning/STATE_ARCHIVE.md'), 'the protocol names .planning/STATE_ARCHIVE.md');
    assert.ok(
      shellLines(section).includes(`${DF_TOOLS} merge-driver resolve <planning_path>`),
      `the protocol must hold the line \`${DF_TOOLS} merge-driver resolve <planning_path>\``
    );
  });

  test('12: the protocol lead-in (outside any fence) says the merges run in the main checkout, never inside an executor worktree', () => {
    const section = mergeProtocolSection(read(EXECUTE_OBJECTIVE));
    assert.ok(section, 'the merge protocol section exists');
    const leadIn = section.split('\n');
    const firstFence = leadIn.findIndex((l) => /^\s*```/.test(l));
    assert.ok(firstFence > 0, 'the section has a lead-in before its first fence');
    const prose = leadIn.slice(0, firstFence).join('\n');
    assert.match(prose, /main checkout/, 'the lead-in names the main checkout');
    assert.match(prose, /never inside an executor worktree/, 'the lead-in says never inside an executor worktree');
  });

  test('9: the regeneration after every wave runs `state advance-job --objective "${OBJECTIVE_NUMBER}"` and commits state.json too', () => {
    const section = mergeProtocolSection(read(EXECUTE_OBJECTIVE));
    assert.ok(section, 'the merge protocol section exists');
    const lines = shellLines(section);
    assert.ok(
      lines.includes(`${DF_TOOLS} state advance-job --objective "\${OBJECTIVE_NUMBER}"`),
      'the regeneration must run `state advance-job --objective "${OBJECTIVE_NUMBER}"`'
    );
    assert.ok(lines.includes(`${DF_TOOLS} state update-progress`), 'update-progress stays in the regeneration');
    assert.ok(
      lines.includes(`${DF_TOOLS} roadmap update-job-progress "\${OBJECTIVE_NUMBER}"`),
      'roadmap update-job-progress stays in the regeneration'
    );
    const commit = lines.find((l) => l.startsWith(`${DF_TOOLS} commit `) && l.includes('after wave'));
    assert.ok(commit, 'the regeneration ends with an aof-tools commit');
    const files = commit.slice(commit.indexOf('--files'));
    for (const f of ['.planning/STATE.md', '.planning/ROADMAP.md', '.planning/state.json']) {
      assert.ok(files.includes(f), `the regeneration commit's --files list includes ${f}`);
    }
    const advance = lines.findIndex((l) => l.includes('state advance-job'));
    assert.ok(advance < lines.indexOf(commit), 'advance-job runs before the commit');
  });

  test('9b: the regeneration is no longer conditional on a planning-file conflict', () => {
    const section = mergeProtocolSection(read(EXECUTE_OBJECTIVE));
    assert.ok(section, 'the merge protocol section exists');
    assert.doesNotMatch(
      section,
      /when a planning-file conflict was resolved above, regenerate/,
      'the merged SUMMARYs change the position after every parallel wave, so the regeneration always runs'
    );
  });
});

describe('TRD 59-06 — every state advance-job the build documents carries --objective', () => {
  for (const [name, file] of [
    ['executor.md', EXECUTOR],
    ['execute-trd.md', EXECUTE_TRD],
    ['execute-objective.md', EXECUTE_OBJECTIVE],
  ]) {
    test(`10: ${name}: every line naming \`state advance-job\` also passes --objective`, () => {
      const bad = [];
      read(file).split('\n').forEach((ln, i) => {
        if (/state advance-job/.test(ln) && !/--objective/.test(ln)) bad.push(`${name}:${i + 1}: ${ln.trim()}`);
      });
      assert.deepEqual(bad, [], 'a state advance-job without --objective cannot derive the position from disk');
    });
  }

  test('10: executor.md and execute-trd.md each run advance-job with --objective "${OBJECTIVE_NUMBER}"', () => {
    for (const file of [EXECUTOR, EXECUTE_TRD]) {
      assert.match(read(file), /state advance-job --objective "\$\{OBJECTIVE_NUMBER\}"/, `${path.basename(file)} documents the --objective call`);
    }
  });
});

describe('TRD 59-06 — executor.md addresses the checkout explicitly in its state block', () => {
  test('11: every aof-tools call in <state_updates> passes `--cwd <checkout>`', () => {
    const block = executorStateBlock();
    const calls = block.split('\n').filter((l) => l.includes('aof-tools.cjs'));
    assert.ok(calls.length >= 6, `the state block documents its aof-tools calls (found ${calls.length})`);
    const bad = calls.filter((l) => !/aof-tools\.cjs --cwd <checkout> /.test(l));
    assert.deepEqual(bad, [], 'each aof-tools call in the state block must read `aof-tools.cjs --cwd <checkout> <command>`');
  });

  test('11: the behaviour list says advance-job derives the position from disk', () => {
    const block = executorStateBlock();
    assert.match(block, /`state advance-job --objective N`/, 'the behaviour line names the --objective form');
    assert.match(block, /never says ready for verification until every TRD has a SUMMARY/);
  });
});
