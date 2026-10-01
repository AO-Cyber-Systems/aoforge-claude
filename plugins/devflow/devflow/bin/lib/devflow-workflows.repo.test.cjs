'use strict';

/**
 * devflow-workflows.repo.test.cjs - objective 50 (GEN-05), TRD 50-10.
 *
 * Pins, as plain text assertions, the GitHub Actions side of enforcement:
 *
 *   .github/workflows/devflow-checks.yml   the reusable workflow (workflow_call)
 *
 * No YAML parser is used on purpose: the plugin has no runtime dependencies, and
 * the properties that matter here (triggers, token source, no path filters, the
 * script each job runs) are all visible as lines. A real Actions run is not
 * possible offline; the live check is an open item in 50-13.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'devflow-checks.yml');

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

/**
 * The lines nested under `key:` - every following line indented deeper than the
 * key's own line, up to the first non-blank line that is not. Blank lines are
 * kept. Returns null when the key is absent. `parentIndent` pins the key's own
 * indentation so a same-named key at another depth is never picked up.
 */
function blockUnder(lines, key, parentIndent) {
  const re = new RegExp('^' + ' '.repeat(parentIndent) + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*$');
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() !== '' && indentOf(l) <= parentIndent) break;
    out.push(l);
  }
  return out;
}

/** Split a block of step lines (a `steps:` body) into one string per `- ` item. */
function splitSteps(stepLines) {
  const dashRe = /^(\s*)- /;
  const first = stepLines.find((l) => dashRe.test(l));
  if (!first) return [];
  const dashIndent = indentOf(first);
  const steps = [];
  let cur = null;
  for (const l of stepLines) {
    if (dashRe.test(l) && indentOf(l) === dashIndent) {
      if (cur) steps.push(cur.join('\n'));
      cur = [l];
    } else if (cur) {
      cur.push(l);
    }
  }
  if (cur) steps.push(cur.join('\n'));
  return steps;
}

describe('reusable workflow .github/workflows/devflow-checks.yml', () => {
  const text = read(WORKFLOW);
  const lines = text.split('\n');

  test('1. workflow_call with inputs devflow-ref (required), devflow-repo, app-client-id and secret app-private-key', () => {
    const onBlock = blockUnder(lines, 'on', 0);
    assert.ok(onBlock, 'top-level on: block');
    const call = blockUnder(lines, 'workflow_call', 2);
    assert.ok(call, 'workflow_call: under on:');

    const inputs = blockUnder(call, 'inputs', 4);
    assert.ok(inputs, 'workflow_call.inputs');
    for (const name of ['devflow-ref', 'devflow-repo', 'app-client-id']) {
      assert.ok(blockUnder(inputs, name, 6), `input ${name}`);
    }
    const ref = blockUnder(inputs, 'devflow-ref', 6).join('\n');
    assert.match(ref, /^\s+required:\s*true\s*$/m, 'devflow-ref is required');

    const repo = blockUnder(inputs, 'devflow-repo', 6).join('\n');
    assert.match(repo, /default:\s*['"]?AO-Cyber-Systems\/devflow-claude['"]?\s*$/m, 'devflow-repo defaults to the DevFlow repo');

    const secrets = blockUnder(call, 'secrets', 4);
    assert.ok(secrets, 'workflow_call.secrets');
    assert.ok(blockUnder(secrets, 'app-private-key', 6), 'secret app-private-key');
    assert.match(
      blockUnder(secrets, 'app-private-key', 6).join('\n'),
      /^\s+required:\s*false\s*$/m,
      'the App secret is optional - checks work without an App'
    );
  });

  test('2. jobs linked-issue, planning-consistency and reconcile each run gh-check-cli.cjs <same name>', () => {
    const jobs = blockUnder(lines, 'jobs', 0);
    assert.ok(jobs, 'top-level jobs: block');
    for (const name of ['linked-issue', 'planning-consistency', 'reconcile']) {
      const job = blockUnder(jobs, name, 2);
      assert.ok(job, `job ${name}`);
      const body = job.join('\n');
      const runRe = new RegExp('^\\s+run:\\s*.*gh-check-cli\\.cjs\\s+' + name + '\\s*$', 'm');
      assert.match(body, runRe, `job ${name} has a run: line invoking gh-check-cli.cjs ${name}`);
      assert.match(
        body,
        /\.devflow\/plugins\/devflow\/devflow\/bin\/lib\/gh-check-cli\.cjs/,
        `job ${name} runs the script from the .devflow checkout`
      );
      assert.match(body, /^\s+runs-on:\s*ubuntu-latest\s*$/m, `job ${name} runs on ubuntu-latest`);
    }
  });

  test('3. App token uses actions/create-github-app-token@v3 with client-id (never app-id), conditional on the input', () => {
    assert.match(text, /uses:\s*actions\/create-github-app-token@v3\b/);
    assert.match(text, /^\s+client-id:\s*\$\{\{\s*inputs\.app-client-id\s*\}\}\s*$/m, 'client-id comes from the input');
    assert.doesNotMatch(text, /^\s+(-\s+)?app-id:/m, 'no app-id: line anywhere (deprecated in favour of client-id)');
    assert.doesNotMatch(text, /create-github-app-token@v[12]\b/, 'no older major');

    const jobs = blockUnder(lines, 'jobs', 0);
    let appSteps = 0;
    for (const name of ['linked-issue', 'planning-consistency', 'reconcile']) {
      const stepLines = blockUnder(blockUnder(jobs, name, 2), 'steps', 4);
      assert.ok(stepLines, `job ${name} has steps`);
      for (const step of splitSteps(stepLines)) {
        if (!/uses:\s*actions\/create-github-app-token@v3\b/.test(step)) continue;
        appSteps += 1;
        assert.match(
          step,
          /^\s+if:\s*inputs\.app-client-id\s*!=\s*''\s*$/m,
          `every App step in ${name} is conditional on the input:\n${step}`
        );
        // Explicit, minimal permissions - never the App's full grant.
        assert.match(step, /^\s+permission-/m, `App step in ${name} lists explicit permission-* inputs`);
      }
    }
    assert.ok(appSteps >= 3, 'each job mints its own token (at least one App step per job)');

    // With no App, the job falls back to the caller's GITHUB_TOKEN.
    assert.match(text, /steps\.app\.outputs\.token\s*\|\|\s*github\.token/, 'token falls back to github.token');
    assert.match(text, /DEVFLOW_GH_CACHE_DIR:\s*\$\{\{\s*runner\.temp\s*\}\}\/devflow/, 'gh-client state kept off the runner home');
    assert.doesNotMatch(text, /pull_request_target/, 'checks only read - no pull_request_target');
  });

  test('4. reconcile runs only on a merged pull_request; the checks run on merge_group and non-closed pull_request', () => {
    const jobs = blockUnder(lines, 'jobs', 0);

    const reconcile = blockUnder(jobs, 'reconcile', 2).join('\n');
    const rIf = reconcile.match(/^ {4}if:\s*(.+)$/m);
    assert.ok(rIf, 'reconcile has a job-level if:');
    assert.match(rIf[1], /merged\s*==\s*true/, 'reconcile requires merged == true');
    assert.match(rIf[1], /pull_request/);
    assert.match(rIf[1], /closed/);

    for (const name of ['linked-issue', 'planning-consistency']) {
      const job = blockUnder(jobs, name, 2).join('\n');
      const cIf = job.match(/^ {4}if:\s*(.+)$/m);
      assert.ok(cIf, `${name} has a job-level if:`);
      assert.match(cIf[1], /merge_group/, `${name} runs in the merge queue`);
      assert.match(cIf[1], /!=\s*'closed'/, `${name} does not run on a closed pull_request`);
    }
  });

  test('the reusable workflow carries no path or branch filters (a required check that does not report hangs merges)', () => {
    assert.doesNotMatch(text, /^\s*paths(-ignore)?:/m);
    assert.doesNotMatch(text, /^\s*branches(-ignore)?:/m);
  });

  test('the header names objective 50, the status-context decision and the token rules', () => {
    const header = lines.slice(0, lines.findIndex((l) => /^name:/.test(l))).join('\n');
    assert.match(header, /objective 50/i);
    assert.match(header, /devflow\/linked-issue/);
    assert.match(header, /devflow\/planning-consistency/);
    assert.match(header, /GITHUB_TOKEN|github\.token/);
  });
});
