'use strict';

// Every workflow under .github/workflows/ must declare what its GITHUB_TOKEN may do.
//
// Without a `permissions:` block a job gets the repository's default token grant, which on
// a repo with the legacy default is read-write across scopes. CodeQL flags this as
// `actions/missing-workflow-permissions` (alerts 125 and 137). This guard keeps a new or
// edited workflow from regressing to that default.
//
// It reads the workflows at the TEXT level, like agent-shell-harness.test.cjs (Case C1):
// the repo carries no YAML dependency and the structure we need is two indentation levels.
//
//   - a top-level  `^permissions:`          covers every job, or
//   - every job (`^  <name>:` under `jobs:`) carries its own `^    permissions:`.
//
// Only the job keys are read. Anything under `on:` (for example `workflow_call:`) sits at
// the same indentation as a job key, so the scan starts after the `jobs:` line.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOWS_DIR = path.resolve(__dirname, '..', '.github', 'workflows');

// The workflows whose token grant is exactly `contents: read` (TRD 54-03; visual-judge.yml,
// which runs with the Anthropic secret, TRD 74-01).
const READ_ONLY_WORKFLOWS = ['test.yml', 'agent-shell-harness.yml', 'visual-judge.yml'];

function workflowFiles() {
  return fs.readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
}

function read(file) {
  return fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf-8');
}

/** True when the file has a column-0 `permissions:` key. */
function hasTopLevelPermissions(yml) {
  return /^permissions:/m.test(yml);
}

/**
 * The jobs section as `{ name, body }` pairs. A job starts at `  <name>:` (two-space
 * indent, nothing after the colon but a comment) and runs to the next job key, the next
 * column-0 key, or EOF.
 */
function jobBlocks(yml) {
  const lines = yml.split('\n');
  const jobsAt = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (jobsAt === -1) return [];

  const blocks = [];
  let current = null;
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const line = lines[i];
    // A column-0 key that is not a comment ends the jobs mapping.
    if (/^\S/.test(line) && !/^#/.test(line)) break;
    const start = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
    if (start) {
      current = { name: start[1], body: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return blocks.map((b) => ({ name: b.name, body: b.body.join('\n') }));
}

describe('workflow token permissions', () => {
  test('there are workflows to check', () => {
    assert.ok(workflowFiles().length > 0, `no workflow files found under ${WORKFLOWS_DIR}`);
  });

  test('every workflow declares permissions at the top level or in every job', () => {
    const offenders = [];
    for (const file of workflowFiles()) {
      const yml = read(file);
      if (hasTopLevelPermissions(yml)) continue;

      const jobs = jobBlocks(yml);
      if (jobs.length === 0) {
        offenders.push(`${file}: no top-level permissions and no jobs found`);
        continue;
      }
      for (const job of jobs) {
        if (!/^ {4}permissions:/m.test(job.body)) {
          offenders.push(`${file}: job "${job.name}" has no permissions and the workflow has no top-level block`);
        }
      }
    }
    assert.deepStrictEqual(
      offenders,
      [],
      `workflows falling back to the default GITHUB_TOKEN grant:\n  ${offenders.join('\n  ')}`
    );
  });

  for (const file of READ_ONLY_WORKFLOWS) {
    test(`${file} grants exactly contents: read at the top level`, () => {
      const yml = read(file);
      // `permissions:` at column 0, one `contents: read` line, then a blank line, a
      // comment, a new column-0 key or EOF. Nothing else may sit in the block.
      assert.match(
        yml,
        /^permissions:\n {2}contents: read\n(?=\n|#|[A-Za-z]|$)/m,
        `${file}: top-level block must be exactly "permissions:" / "  contents: read"`
      );
      assert.doesNotMatch(yml, /: write\b/, `${file}: no write scope may be granted`);
    });
  }
});
