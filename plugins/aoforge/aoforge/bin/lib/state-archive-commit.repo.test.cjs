'use strict';

/**
 * state-archive-commit.repo.test.cjs — quick 35.
 *
 * `state advance-job` rotates decisions into STATE_ARCHIVE.md, and `state record-metric`, `state add-decision`,
 * `state rotate-decisions` and `trd finalize` write it too. A commit that follows one of them and names
 * `.aoforge/STATE.md` but not the archive leaves the archive rows behind: in a worktree they never reach the
 * branch. execute-trd.md and execute-objective.md both did that; agents/executor.md already named the archive.
 *
 * Test list
 *   a. the detector, on inline fixtures: an archive writer in a fence followed by a STATE.md commit without the
 *      archive is flagged; the same commit naming STATE_ARCHIVE.md passes; a prose mention outside a fence is not
 *      a writer, and neither is an inline code span inside a fence (a spawn prompt); STATE_ARCHIVE.md alone does not
 *      count as STATE.md; a `\` continuation is one command
 *   b. over every workflow, agent and skill prompt: no violation, and the three known sites are checked, so the
 *      test cannot pass on nothing
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', '..');
const REPO = path.join(PLUGIN, '..', '..');

const WRITER = /aof-tools(?:\.cjs)?\s+(?:--cwd\s+\S+\s+)?(?:state\s+(?:advance-job|rotate-decisions|record-metric|add-decision)|trd\s+finalize)\b/;
const COMMIT = /aof-tools(?:\.cjs)?\s+(?:--cwd\s+\S+\s+)?commit\b/;
const STATE_MD = /(?:^|[\s/"'`])STATE\.md\b/;
const ARCHIVE_MD = /STATE_ARCHIVE\.md\b/;

/**
 * The fenced commands of a markdown text, `\` continuations joined: [{line, text}] (line is 1-based). An inline code
 * span inside a fence is prose, not a command: a spawn prompt held in a fence says "change them only through
 * `aof-tools state advance-job`" without running it (execute-objective.md's worktree_protocol), so spans are dropped.
 */
function fencedCommands(text) {
  const out = [];
  let inFence = false;
  let cur = null;
  text.split('\n').forEach((ln, i) => {
    if (/^\s*```/.test(ln)) {
      inFence = !inFence;
      cur = null;
      return;
    }
    if (!inFence) return;
    const code = ln.replace(/`[^`]*`/g, ' ').trim();
    if (cur) cur.text += ` ${code}`;
    else {
      cur = { line: i + 1, text: code };
      out.push(cur);
    }
    if (!/\\\s*$/.test(ln)) cur = null;
  });
  return out;
}

/**
 * scanArchiveCommits(text) -> { checked: [line], violations: [line] }
 * After an archive-writing command, the next commit whose --files names STATE.md must also name STATE_ARCHIVE.md.
 */
function scanArchiveCommits(text) {
  const checked = [];
  const violations = [];
  let pendingWriter = false;
  for (const cmd of fencedCommands(text)) {
    if (WRITER.test(cmd.text)) pendingWriter = true;
    if (!COMMIT.test(cmd.text) || !/--files\b/.test(cmd.text)) continue;
    const files = cmd.text.slice(cmd.text.indexOf('--files'));
    if (!STATE_MD.test(files) || !pendingWriter) continue;
    checked.push(cmd.line);
    if (!ARCHIVE_MD.test(files)) violations.push(cmd.line);
    pendingWriter = false;
  }
  return { checked, violations };
}

const fence = (...lines) => ['```bash', ...lines, '```'].join('\n');
const ADVANCE = 'node ~/.claude/aoforge/bin/aof-tools.cjs state advance-job --objective "${N}"';
const COMMIT_STATE = 'node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: x" --files .aoforge/STATE.md .aoforge/ROADMAP.md';
const COMMIT_BOTH = 'node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: x" --files .aoforge/STATE.md .aoforge/STATE_ARCHIVE.md';

describe('a. the archive-commit detector', () => {
  test('a writer then a STATE.md commit without the archive is flagged', () => {
    const r = scanArchiveCommits(['# x', fence(ADVANCE), 'prose', fence(COMMIT_STATE)].join('\n'));
    assert.deepEqual(r, { checked: [7], violations: [7] });
  });

  test('the same commit naming STATE_ARCHIVE.md passes', () => {
    const r = scanArchiveCommits([fence(ADVANCE), fence(COMMIT_BOTH)].join('\n'));
    assert.deepEqual(r, { checked: [5], violations: [] });
  });

  test('a writer with --cwd and a `\\` continuation are read as one command', () => {
    const text = fence(
      'node ~/.claude/aoforge/bin/aof-tools.cjs --cwd <checkout> state record-metric \\',
      '  --objective "${O}" --job "${T}"',
      'node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: x" \\',
      '  --files .aoforge/STATE.md',
    );
    assert.deepEqual(scanArchiveCommits(text), { checked: [4], violations: [4] });
  });

  test('a prose mention outside a fence is not a writer', () => {
    const text = ['Run `aof-tools state advance-job` after each TRD.', fence(COMMIT_STATE)].join('\n');
    assert.deepEqual(scanArchiveCommits(text), { checked: [], violations: [] });
  });

  test('an inline code span inside a fence (a spawn prompt) is prose, not a writer', () => {
    const prompt = ['```', 'Task(prompt="', '- STATE.md: change it only through `aof-tools state advance-job --objective 7`', '")', '```'];
    const text = [...prompt, fence(COMMIT_STATE)].join('\n');
    assert.deepEqual(scanArchiveCommits(text), { checked: [], violations: [] });
  });

  test('STATE_ARCHIVE.md alone does not count as STATE.md', () => {
    const only = 'node ~/.claude/aoforge/bin/aof-tools.cjs commit "docs: x" --files .aoforge/STATE_ARCHIVE.md';
    assert.deepEqual(scanArchiveCommits([fence(ADVANCE), fence(only)].join('\n')), { checked: [], violations: [] });
  });

  test('trd finalize is a writer too', () => {
    const r = scanArchiveCommits(fence('node ~/.claude/aoforge/bin/aof-tools.cjs trd finalize 35-01', COMMIT_STATE));
    assert.deepEqual(r.violations, [3]);
  });
});

describe('b. every prompt commits the archive after an archive write', () => {
  function promptFiles() {
    const files = [];
    const dir = (rel) => path.join(PLUGIN, rel);
    for (const f of fs.readdirSync(dir('aoforge/workflows'))) if (f.endsWith('.md')) files.push(path.join(dir('aoforge/workflows'), f));
    for (const f of fs.readdirSync(dir('agents'))) if (f.endsWith('.md')) files.push(path.join(dir('agents'), f));
    for (const d of fs.readdirSync(dir('skills'))) {
      const skill = path.join(dir('skills'), d, 'SKILL.md');
      if (fs.existsSync(skill)) files.push(skill);
    }
    return files.sort();
  }

  test('no violation, and the known commit sites are checked', () => {
    const checked = [];
    const violations = [];
    for (const file of promptFiles()) {
      const rel = path.relative(REPO, file);
      const r = scanArchiveCommits(fs.readFileSync(file, 'utf8'));
      for (const line of r.checked) checked.push(`${rel}:${line}`);
      for (const line of r.violations) violations.push(`${rel}:${line}`);
    }
    assert.deepEqual(violations, [],
      `these commits name .aoforge/STATE.md after an archive-writing command but not .aoforge/STATE_ARCHIVE.md:\n  ${violations.join('\n  ')}`);
    assert.ok(checked.length >= 3, `only ${checked.length} commit sites checked: ${checked.join(', ')}`);
    for (const known of ['workflows/execute-trd.md', 'workflows/execute-objective.md', 'agents/executor.md']) {
      assert.ok(checked.some((c) => c.includes(known)), `${known} has no checked commit site (checked: ${checked.join(', ')})`);
    }
  });
});
