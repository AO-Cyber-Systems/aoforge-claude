'use strict';

// Zero raw `git commit` instructions in AOForge's agent and skill prompts (TRD 52-02, item 52-4).
//
// WHY. gate-commits.js denies a raw `git commit` in every AOForge project, so a prompt that tells an agent to run one
// sends it straight into a refusal (48-VERIFICATION found agents/debugger.md doing exactly that). Commits go through
// `aof-tools commit "<msg>" --files <paths>`, which stages only the named paths and, in store mode, applies the branch
// gate whose refusal names `gh pr start` and the logged escape.
//
// WHAT COUNTS. Every line inside a fenced code block (``` or ~~~, CommonMark rules: a fence closes on the same character
// at least as long as the opener) of plugins/aoforge/agents/*.md and plugins/aoforge/skills/*/SKILL.md that matches
// RAW_COMMIT_RE (optional VAR=value prefixes, then `git commit`) and does not mention `aof-tools`. Prose that merely
// names the command ("never use raw `git commit`") is outside a fence and is not a finding.
//
// OUT OF SCOPE. workflows/ and references/: workflows/complete-milestone.md and workstreams-merge.md hold
// merge-completion `git commit` lines, which gate-commits allows (MERGE_HEAD). Keep this guard to agents and skills.
//
// Test list:
// 6.  The repo has zero findings, every one listed `file:line: text` on failure (not just the first).
// 6b. The scan set is not empty (a broken glob must not pass vacuously).
// 7.  Sensitivity: an injected `git commit -m "x"` inside a ```bash fence of an in-memory prompt is flagged at its line;
//     the same line in prose, an aof-tools line, and a fence-closed line are not; a VAR=1 prefix is still flagged.
//
// Runtime model: read-only. Repo root is five levels up; a mirror install (no README.md there) skips the whole file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

const AGENTS_DIR = 'plugins/aoforge/agents';
const SKILLS_DIR = 'plugins/aoforge/skills';

/** A raw commit invocation: any `VAR=value ` prefixes, then `git commit`. */
const RAW_COMMIT_RE = /^\s*(?:[A-Z_]+=\S+\s+)*git commit\b/;

/** The repo-relative prompt files this guard covers: agents/*.md and skills/<name>/SKILL.md, sorted. */
function promptFiles(root = REPO_ROOT) {
  const out = [];
  const agents = path.join(root, AGENTS_DIR);
  if (fs.existsSync(agents)) {
    for (const name of fs.readdirSync(agents).sort()) {
      if (name.endsWith('.md')) out.push(`${AGENTS_DIR}/${name}`);
    }
  }
  const skills = path.join(root, SKILLS_DIR);
  if (fs.existsSync(skills)) {
    for (const name of fs.readdirSync(skills).sort()) {
      if (fs.existsSync(path.join(skills, name, 'SKILL.md'))) out.push(`${SKILLS_DIR}/${name}/SKILL.md`);
    }
  }
  return out;
}

/**
 * The raw-commit findings in one prompt's text, as `{file, line, text}` (1-based line, trimmed text). Only lines inside
 * a fenced code block count; a line mentioning `aof-tools` is never a finding.
 */
function scanText(text, file) {
  const findings = [];
  let fence = null; // { char, len } while inside a fenced block
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (m) {
      const char = m[1][0];
      if (fence === null) {
        // A backtick fence's info string may not contain a backtick (CommonMark); such a line is not a fence.
        if (!(char === '`' && m[2].includes('`'))) fence = { char, len: m[1].length };
        continue;
      }
      if (char === fence.char && m[1].length >= fence.len && m[2].trim() === '') {
        fence = null;
        continue;
      }
    }
    if (fence !== null && RAW_COMMIT_RE.test(line) && !line.includes('aof-tools')) {
      findings.push({ file, line: i + 1, text: line.trim() });
    }
  }
  return findings;
}

/** Every finding across the prompt set. `override` maps a repo-relative file to replacement text (sensitivity tests). */
function scanRepo({ root = REPO_ROOT, override = {} } = {}) {
  const findings = [];
  for (const file of promptFiles(root)) {
    const text = Object.prototype.hasOwnProperty.call(override, file)
      ? override[file]
      : fs.readFileSync(path.join(root, file), 'utf-8');
    findings.push(...scanText(text, file));
  }
  return findings;
}

const formatFinding = (f) => `${f.file}:${f.line}: ${f.text}`;

function formatFailure(findings) {
  return (
    `${findings.length} raw \`git commit\` instruction(s) in agent/skill prompts. gate-commits.js denies a raw commit; ` +
    'use `node ~/.claude/aoforge/bin/aof-tools.cjs commit "<msg>" --files <paths>` instead:\n' +
    findings.map((f) => `  ${formatFinding(f)}`).join('\n')
  );
}

// ─── tests ──────────────────────────────────────────────────────────────────────────

describe('prompt-raw-commit.repo.test.cjs', { skip: !IS_AOFORGE_CHECKOUT && 'not an aoforge-claude checkout' }, () => {
  test('6. no agent or skill prompt instructs a raw `git commit`', () => {
    const findings = scanRepo();
    assert.deepEqual(findings.map(formatFinding), [], formatFailure(findings));
  });

  test('6b. the scan set covers both the agents and the skills', () => {
    const files = promptFiles();
    assert.ok(files.some((f) => f.startsWith(`${AGENTS_DIR}/`)), 'no agent prompt was scanned');
    assert.ok(files.some((f) => f.startsWith(`${SKILLS_DIR}/`)), 'no skill prompt was scanned');
    assert.ok(files.includes(`${AGENTS_DIR}/debugger.md`), 'agents/debugger.md is in the scan set');
  });

  describe('7. sensitivity (in-memory prompts)', () => {
    const FILE = 'plugins/aoforge/agents/example.md';

    test('an injected `git commit -m "x"` inside a ```bash fence is flagged at its line', () => {
      const text = ['# Example', '', 'Commit the fix:', '', '```bash', 'git add src/a.ts', 'git commit -m "x"', '```', ''].join('\n');
      assert.deepEqual(scanText(text, FILE), [{ file: FILE, line: 7, text: 'git commit -m "x"' }]);
    });

    test('an injected line in a real prompt fails the repo scan, naming file:line', () => {
      const rel = `${AGENTS_DIR}/debugger.md`;
      const original = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      const text = `${original.replace(/\n?$/, '\n')}\n\`\`\`bash\ngit commit -m "x"\n\`\`\`\n`;
      const injectedLine = text.split('\n').indexOf('git commit -m "x"') + 1;
      const findings = scanRepo({ override: { [rel]: text } });
      const message = formatFailure(findings);
      assert.ok(message.includes(`${rel}:${injectedLine}: git commit -m "x"`), message);
    });

    test('an env-var prefix does not hide a raw commit', () => {
      const text = ['```bash', 'AOFORGE_ALLOW_RAW_COMMIT=1 git commit -m "x"', '```'].join('\n');
      assert.equal(scanText(text, FILE).length, 1);
    });

    test('prose naming the command, an aof-tools line, and a line after the fence closes are not findings', () => {
      const text = [
        'Never run a raw `git commit`; gate-commits blocks it.',
        'git commit -m "prose line outside any fence"',
        '```bash',
        'node ~/.claude/aoforge/bin/aof-tools.cjs commit "fix: x" --files a.ts # not git commit',
        'echo "git commit is not at the start of this line"',
        '```',
        'git commit -m "after the fence closed"',
      ].join('\n');
      assert.deepEqual(scanText(text, FILE), []);
    });

    test('a ~~~ fence counts, and a shorter fence line does not close a longer opener', () => {
      const tilde = ['~~~sh', 'git commit -m "x"', '~~~'].join('\n');
      assert.equal(scanText(tilde, FILE).length, 1);
      const nested = ['````markdown', '```', 'git commit -m "x"', '```', '````'].join('\n');
      assert.deepEqual(scanText(nested, FILE).map((f) => f.line), [3]);
    });
  });
});
