'use strict';

// Hand-built fixture builders for builtin-audit.test.cjs (TRD 62-01, objective 62-built-in-sweep).
// no_llm_test_data: every string below is written by hand, deterministic, no randomness. The only
// non-determinism is fs.mkdtempSync, which names the temp root of makeTree.

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * A SKILL.md string: `name:`, a one-line `description:`, `allowed-tools:` as a YAML list (or one
 * comma-separated line when `inline`), an optional `disallowed-tools:` line, then the body.
 */
function skillMd({ name, allowed = [], disallowed = null, inline = false, body = '' } = {}) {
  const lines = ['---', `name: ${name}`, `description: Fixture skill ${name}`];
  if (inline) {
    lines.push(`allowed-tools: ${allowed.join(', ')}`);
  } else {
    lines.push('allowed-tools:');
    for (const t of allowed) lines.push(`  - ${t}`);
  }
  if (disallowed) lines.push(`disallowed-tools: ${disallowed}`);
  lines.push('---', body);
  return lines.join('\n');
}

/** A workflow string: `status:` frontmatter then the body. */
function workflowMd({ status = 'active', body = '' } = {}) {
  return `---\nstatus: ${status}\n---\n${body}`;
}

/**
 * AskUserQuestion in object form: one `{ label: "<x>", description: "<x> option" }` line per
 * option. `omitOptions` drops the options block, producing a schema break.
 */
function askCall({ header = 'Pick', question = 'Which one?', options = ['A', 'B'], omitOptions = false } = {}) {
  const lines = ['AskUserQuestion([', '  {', `    header: "${header}",`, `    question: "${question}",`, '    multiSelect: false,'];
  if (omitOptions) {
    lines[lines.length - 1] = '    multiSelect: false';
  } else {
    lines.push('    options: [');
    options.forEach((o, i) => {
      const comma = i < options.length - 1 ? ',' : '';
      lines.push(`      { label: "${o}", description: "${o} option" }${comma}`);
    });
    lines.push('    ]');
  }
  lines.push('  }', '])');
  return lines.join('\n');
}

/** AskUserQuestion in bullet form: one `  - "<x>" — <x> option` line per option. */
function askProse({ header = 'Pick', question = 'Which one?', options = ['A', 'B'] } = {}) {
  const lines = ['Use AskUserQuestion:', `- header: "${header}"`, `- question: "${question}"`, '- options:'];
  for (const o of options) lines.push(`  - "${o}" — ${o} option`);
  return lines.join('\n');
}

/**
 * Write a temp tree. `skills` and `workflows` map a name to its full file text. The default layout
 * is `<root>/skills/<name>/SKILL.md` and `<root>/workflows/<name>.md`; `repoLayout` writes the
 * repository layout (`<root>/plugins/aoforge/skills/...`, `<root>/plugins/aoforge/aoforge/workflows/...`).
 * Returns { root, skillsDir, workflowsDir, cleanup }.
 */
function makeTree({ skills = {}, workflows = {}, repoLayout = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-audit-'));
  const skillsDir = repoLayout ? path.join(root, 'plugins', 'aoforge', 'skills') : path.join(root, 'skills');
  const workflowsDir = repoLayout
    ? path.join(root, 'plugins', 'aoforge', 'aoforge', 'workflows')
    : path.join(root, 'workflows');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(workflowsDir, { recursive: true });
  for (const [name, text] of Object.entries(skills)) {
    fs.mkdirSync(path.join(skillsDir, name), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, name, 'SKILL.md'), text);
  }
  for (const [name, text] of Object.entries(workflows)) {
    fs.writeFileSync(path.join(workflowsDir, `${name}.md`), text);
  }
  return {
    root,
    skillsDir,
    workflowsDir,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = { skillMd, workflowMd, askCall, askProse, makeTree };
