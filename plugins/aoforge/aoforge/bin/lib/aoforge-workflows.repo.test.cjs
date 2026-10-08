'use strict';

/**
 * aoforge-workflows.repo.test.cjs - objective 50 (GEN-05), TRD 50-10.
 *
 * Pins, as plain text assertions, the GitHub Actions side of enforcement:
 *
 *   .github/workflows/aoforge-checks.yml                         the reusable workflow (workflow_call)
 *   plugins/aoforge/aoforge/templates/github/aoforge.yml         the caller `gh setup` writes into a repo
 *   plugins/aoforge/aoforge/templates/github/pull_request_template.md   the managed PR-template block
 *
 * No YAML parser is used on purpose: the plugin has no runtime dependencies, and
 * the properties that matter here (triggers, token source, no path filters, the
 * script each job runs) are all visible as lines. A real Actions run is not
 * possible offline; the live check is an open item in 50-13.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'aoforge-checks.yml');
const TEMPLATES = path.join(REPO_ROOT, 'plugins', 'aoforge', 'aoforge', 'templates', 'github');
const CALLER = path.join(TEMPLATES, 'aoforge.yml');
const PR_TEMPLATE = path.join(TEMPLATES, 'pull_request_template.md');

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

describe('reusable workflow .github/workflows/aoforge-checks.yml', () => {
  const text = read(WORKFLOW);
  const lines = text.split('\n');

  test('1. workflow_call with inputs aoforge-ref (required), aoforge-repo, app-client-id and secret app-private-key', () => {
    const onBlock = blockUnder(lines, 'on', 0);
    assert.ok(onBlock, 'top-level on: block');
    const call = blockUnder(lines, 'workflow_call', 2);
    assert.ok(call, 'workflow_call: under on:');

    const inputs = blockUnder(call, 'inputs', 4);
    assert.ok(inputs, 'workflow_call.inputs');
    for (const name of ['aoforge-ref', 'aoforge-repo', 'app-client-id']) {
      assert.ok(blockUnder(inputs, name, 6), `input ${name}`);
    }
    const ref = blockUnder(inputs, 'aoforge-ref', 6).join('\n');
    assert.match(ref, /^\s+required:\s*true\s*$/m, 'aoforge-ref is required');

    const repo = blockUnder(inputs, 'aoforge-repo', 6).join('\n');
    assert.match(repo, /default:\s*['"]?AO-Cyber-Systems\/aoforge-claude['"]?\s*$/m, 'aoforge-repo defaults to the AOForge repo');

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
        /\.aoforge\/plugins\/aoforge\/aoforge\/bin\/lib\/gh-check-cli\.cjs/,
        `job ${name} runs the script from the .aoforge checkout`
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
    assert.match(text, /AOFORGE_GH_CACHE_DIR:\s*\$\{\{\s*runner\.temp\s*\}\}\/aoforge/, 'gh-client state kept off the runner home');
    // Comments may explain why it is absent; only a real trigger/line counts.
    const code = lines.filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.doesNotMatch(code, /pull_request_target/, 'checks only read - no pull_request_target');
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
    assert.match(header, /aoforge\/linked-issue/);
    assert.match(header, /aoforge\/planning-consistency/);
    assert.match(header, /GITHUB_TOKEN|github\.token/);
  });
});

describe('caller workflow template templates/github/aoforge.yml', () => {
  const text = read(CALLER);
  const lines = text.split('\n');

  test('5a. first line is the managed marker', () => {
    assert.match(lines[0], /^# aoforge:managed\b/);
    assert.match(lines[0], /aof-tools gh setup/);
  });

  test('5b. triggers: pull_request with the six types, and merge_group', () => {
    assert.match(text, /^name:\s*AOForge\s*$/m);
    const on = blockUnder(lines, 'on', 0);
    assert.ok(on, 'top-level on: block');
    assert.ok(on.some((l) => /^ {2}merge_group:/.test(l)), 'merge_group: trigger');
    const pr = blockUnder(on, 'pull_request', 2);
    assert.ok(pr, 'pull_request: trigger');
    const types = pr.join('\n');
    for (const t of ['opened', 'edited', 'synchronize', 'reopened', 'ready_for_review', 'closed']) {
      assert.match(types, new RegExp('\\b' + t + '\\b'), `pull_request type ${t}`);
    }
  });

  test('5c. no path or branch filters anywhere (a filtered required check never reports)', () => {
    const code = lines.filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.doesNotMatch(code, /^\s*paths:/m);
    assert.doesNotMatch(code, /^\s*paths-ignore:/m);
    assert.doesNotMatch(code, /^\s*branches(-ignore)?:/m);
    assert.doesNotMatch(code, /pull_request_target/);
  });

  test('5d. permissions grant statuses: write; one job calls the reusable workflow via the placeholders', () => {
    const perms = blockUnder(lines, 'permissions', 0);
    assert.ok(perms, 'top-level permissions:');
    const p = perms.join('\n');
    assert.match(p, /^\s+statuses:\s*write\s*$/m);
    assert.match(p, /^\s+issues:\s*write\s*$/m);
    assert.match(p, /^\s+contents:\s*read\s*$/m);
    assert.match(p, /^\s+pull-requests:\s*read\s*$/m);

    assert.match(text, /\{\{checks_workflow\}\}/);
    assert.match(text, /\{\{aoforge_ref\}\}/);
    const jobs = blockUnder(lines, 'jobs', 0);
    const job = blockUnder(jobs, 'aoforge', 2);
    assert.ok(job, 'single job named aoforge');
    const j = job.join('\n');
    assert.match(j, /^\s+uses:\s*\{\{checks_workflow\}\}\s*$/m);
    assert.match(j, /^\s+aoforge-ref:\s*\{\{aoforge_ref\}\}\s*$/m);
    assert.match(j, /^\s+app-client-id:\s*\$\{\{\s*vars\.AOFORGE_APP_CLIENT_ID\s*\}\}\s*$/m);
    assert.match(j, /^\s+app-private-key:\s*\$\{\{\s*secrets\.AOFORGE_APP_PRIVATE_KEY\s*\}\}\s*$/m);
  });

  test('5e. only the documented placeholders appear; ${{ }} expressions are left alone', () => {
    const tokens = new Set(text.match(/\{\{[a-z_]+\}\}/g) || []);
    assert.deepEqual([...tokens].sort(), ['{{aoforge_ref}}', '{{checks_workflow}}']);
  });
});

describe('PR template templates/github/pull_request_template.md', () => {
  const text = read(PR_TEMPLATE);
  const START = '<!-- aoforge:pr-template:start -->';
  const END = '<!-- aoforge:pr-template:end -->';

  test('6a. start and end markers appear exactly once each, start before end', () => {
    assert.equal(text.split(START).length - 1, 1, 'one start marker');
    assert.equal(text.split(END).length - 1, 1, 'one end marker');
    assert.ok(text.indexOf(START) < text.indexOf(END), 'start precedes end');
  });

  test('6b. the managed block asks for Closes #<objective issue> and the default base branch', () => {
    const block = text.slice(text.indexOf(START), text.indexOf(END));
    assert.match(block, /Closes #<objective issue>/);
    assert.match(block, /one `Closes #` per TRD/);
    assert.match(block, /aof-tools gh pr start/);
    assert.match(block, /default branch/i);
  });

  test('6c. no stale command reference (doc-refs scanner)', () => {
    const { scanText, liveSkillNames } = require('./doc-refs.cjs');
    const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/aoforge/skills'));
    assert.deepEqual(scanText(text, { liveSkills }), []);
  });
});

/**
 * TRD 55-02 (item 55-4). The reusable workflow checks the AOForge runner out with `sparse-checkout`, and the
 * runner reads `references/model-profiles.json` when helpers.cjs loads. A directory missing from that list
 * crashed every required check (ENOENT) on a customer's pull request. These tests rebuild the sparse checkout
 * from the workflow's own lists and run the runner from it, so the omission fails this repository's CI instead.
 */
describe('55-02 the check runner loads from the workflow\'s sparse checkout', () => {
  const { spawnSync } = require('child_process');
  const os = require('os');

  const BIN = 'plugins/aoforge/aoforge/bin';
  const REFERENCES = 'plugins/aoforge/aoforge/references';
  const CHECKS = ['linked-issue', 'planning-consistency', 'reconcile'];

  /** The paths one `sparse-checkout:` key lists: inline value, or a `|` block of deeper-indented lines. */
  function sparseSets(workflowLines) {
    const sets = [];
    workflowLines.forEach((line, i) => {
      const m = /^(\s*)sparse-checkout:\s*(.*)$/.exec(line);
      if (!m) return;
      const keyIndent = m[1].length;
      const inline = m[2].trim();
      if (inline && !/^[|>][+-]?$/.test(inline)) {
        sets.push(inline.split(/\s+/));
        return;
      }
      const items = [];
      for (let j = i + 1; j < workflowLines.length; j++) {
        const l = workflowLines[j];
        if (l.trim() === '') continue;
        if (indentOf(l) <= keyIndent) break;
        items.push(l.trim());
      }
      sets.push(items);
    });
    return sets;
  }

  const workflowLines = read(WORKFLOW).split('\n');
  const sets = sparseSets(workflowLines);

  /**
   * The relative requires reachable from `entry`, as absolute paths. Static and lazy requires are both
   * found by the one regex, so a `require('./x.cjs')` inside a function body is in the closure too.
   */
  function relativeClosure(entry) {
    const seen = new Set();
    const queue = [entry];
    const re = /require\(\s*'(\.\/[^']+)'\s*\)/g;
    while (queue.length) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);
      const src = fs.readFileSync(file, 'utf-8');
      let m;
      while ((m = re.exec(src)) !== null) {
        let target = path.resolve(path.dirname(file), m[1]);
        if (!fs.existsSync(target) && fs.existsSync(target + '.cjs')) target += '.cjs';
        queue.push(target);
      }
    }
    return [...seen];
  }

  let tmp;
  let sparse;
  let eventPath;

  function buildSparseCopy() {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-sparse-'));
    sparse = path.join(tmp, '.aoforge');
    for (const p of sets[0]) {
      fs.cpSync(path.join(REPO_ROOT, p), path.join(sparse, p), { recursive: true });
    }
    eventPath = path.join(tmp, 'event.json');
    fs.writeFileSync(
      eventPath,
      JSON.stringify({
        action: 'closed',
        pull_request: { number: 1, merged: false, head: { sha: 'a'.repeat(40) }, base: { ref: 'main' } },
        repository: { full_name: 'o/r', default_branch: 'main' },
      })
    );
  }

  test('1. every sparse-checkout lists the bin and references directories, and all three lists are equal', () => {
    assert.equal(sets.length, 3, 'one sparse-checkout per job (linked-issue, planning-consistency, reconcile)');
    for (const s of sets) {
      assert.ok(s.includes(BIN), `lists ${BIN}: ${JSON.stringify(s)}`);
      assert.ok(s.includes(REFERENCES), `lists ${REFERENCES}: ${JSON.stringify(s)}`);
    }
    assert.deepEqual([...sets[1]].sort(), [...sets[0]].sort());
    assert.deepEqual([...sets[2]].sort(), [...sets[0]].sort());
  });

  describe('from a copy holding only the listed paths', () => {
    before(buildSparseCopy);
    after(() => {
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    });

    for (const check of CHECKS) {
      test(`2. gh-check-cli ${check} on a closed, unmerged pull_request exits 0 with no missing-file error`, () => {
        const r = spawnSync(
          process.execPath,
          [path.join(sparse, BIN, 'lib', 'gh-check-cli.cjs'), check],
          {
            encoding: 'utf-8',
            env: {
              PATH: process.env.PATH,
              HOME: tmp,
              AOFORGE_GH_CACHE_DIR: path.join(tmp, 'cache'),
              GITHUB_EVENT_PATH: eventPath,
              GITHUB_EVENT_NAME: 'pull_request',
              GITHUB_REPOSITORY: 'o/r',
            },
          }
        );
        assert.doesNotMatch(r.stderr, /ENOENT|Cannot find module/, `stderr: ${r.stderr}`);
        assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
      });
    }

    test('3. every module in the runner\'s relative-require closure (lazy requires included) loads from the copy', () => {
      const entry = path.join(sparse, BIN, 'lib', 'gh-check-cli.cjs');
      const closure = relativeClosure(entry);
      assert.ok(closure.length > 3, `closure found: ${closure.length} files`);
      // The closure itself must lie inside the sparse copy: nothing escapes to a path the workflow did not check out.
      for (const f of closure) {
        assert.ok(fs.existsSync(f), `required file exists in the sparse copy: ${f}`);
        assert.ok(f.startsWith(sparse + path.sep), `inside the sparse copy: ${f}`);
      }
      assert.ok(closure.some((f) => f.endsWith('gh-hierarchy.cjs')), 'the lazy require in gh-check-cli is in the closure');
      const code = closure
        .map((f) => `require(${JSON.stringify(f)});`)
        .join('\n');
      const r = spawnSync(process.execPath, ['-e', code], {
        encoding: 'utf-8',
        env: { PATH: process.env.PATH, HOME: tmp, AOFORGE_GH_CACHE_DIR: path.join(tmp, 'cache') },
      });
      assert.equal(r.status, 0, `loading the closure failed; stderr: ${r.stderr}`);
    });
  });
});
