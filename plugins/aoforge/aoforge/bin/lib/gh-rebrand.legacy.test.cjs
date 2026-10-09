'use strict';

// gh-rebrand.legacy.test.cjs (objective 72, TRD 72-16, INST-04) — `aof-tools gh rebrand`: preview, then rename one
// repository's pre-rename GitHub artefacts.
//
// Every test runs on legacy-rebrand-fixtures: a hand-built snapshot of repository o/r, a stub client over it (it
// records every write and applies it to its own copy), and a hermetic git checkout. No test reaches GitHub.
//
// Test list
//  1. CLI dry run: `gh rebrand --repo o/r` (stub) prints Labels, Issues, Comments, Wiki, Rulesets and Local files, each
//     with a count, and line diffs; exit 0; the stub recorded zero writes; the checkout's git status is unchanged.
//  2. Labels: the legacy objective label with no AOForge twin -> `rename` (PATCH new_name); the legacy trd label when
//     `aoforge:trd` exists -> `merge`: add the AOForge label to every issue carrying the legacy one, then delete the
//     legacy label, the delete marked destructive and the preview saying so.
//  3. Issues: a managed issue (legacy id marker, legacy sections, legacy tracking line) -> markers and section wording
//     AOForge, the person's text changed only where it names the legacy product; the title "DevFlow doctor" -> "AOForge
//     doctor"; TRD, todo and PR bodies re-marked; the unmanaged issue untouched; `devflowops` never changes.
//  4. Comments: managed comments (state, both parts of a summary, reconcile) -> re-marked; the human comment untouched.
//  5. Wiki: a page that names the legacy product -> rewritten; a page whose name holds a legacy name -> renamed; a page
//     with neither -> untouched; one push closes the section; a disabled wiki skips the section.
//  6. Rulesets: the legacy ruleset -> one PUT with the AOForge name and contexts and only writable fields; the
//     organization ruleset is left alone; a 403 on the rulesets list reports `needs admin` and plans everything else.
//  7. Local: the legacy caller -> `git mv` to aoforge.yml, then the rendered caller (new slug, workflow file, input
//     name, current pin); `docs/<legacy>/` -> moved to `docs/aoforge/` and its page rewritten; the PR template block
//     re-marked; config.json's legacy-namespace labels rewritten (72-11 hand-off).
// 11. `--bogus` exits 1 (flag-spec); `--apply` with `--dry-run` exits 1.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rebrand = require('./gh-rebrand.cjs');
const fx = require('./__fixtures__/legacy-rebrand-fixtures.cjs');

const TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');
const VERSION = '3.0.0';

const repos = [];
afterEach(() => {
  while (repos.length > 0) repos.pop().cleanup();
});

function checkout(opts) {
  const repo = fx.localRepo(opts);
  repos.push(repo);
  return repo;
}

/** snapshot -> plan through the stub client. `local` is a checkout (or null for no local section). */
function planFor({ snap = {}, client = {}, local = null, mutate = null } = {}) {
  const snapshot = fx.legacyRepoSnapshot(snap);
  if (mutate) mutate(snapshot);
  const stub = fx.stubClient(snapshot, client);
  const read = rebrand.snapshotRepo(stub, fx.REPO);
  assert.equal(read.ok, true, read.error);
  const localSnap = local ? rebrand.snapshotLocal(local.root, { version: VERSION }) : null;
  return { stub, read, plan: rebrand.planRebrand(read, localSnap) };
}

const opsOf = (plan, section) => plan.ops.filter((o) => o.section === section);
const inputOf = (op) => JSON.parse(op.request.input);
const count = (text, token) => String(text).split(token).length - 1;

describe('gh rebrand: plan and dry run (TRD 72-16)', () => {
  test('1. CLI dry run prints every section with counts and diffs, writes nothing and leaves git status alone', () => {
    const repo = checkout({ store: true });
    const before = repo.status();
    const stub = fx.stubClient(fx.legacyRepoSnapshot({ withAoforgeLabels: ['trd'] }));
    const res = rebrand.runRebrand(repo.root, ['--repo', 'o/r'], { client: stub, version: VERSION, runGit: repo.runGit });

    assert.equal(res.code, 0, res.prose);
    for (const title of ['Labels', 'Issues', 'Comments', 'Wiki', 'Rulesets', 'Local files']) {
      assert.match(res.prose, new RegExp(`^${title} \\(\\d+\\)`, 'm'), `section ${title} with a count`);
    }
    assert.match(res.prose, /^-<!-- devflow:id=46 -->$/m, 'a removed line of a diff');
    assert.match(res.prose, /^\+<!-- aoforge:id=46 -->$/m, 'an added line of a diff');
    assert.match(res.prose, /dry run/i);
    assert.match(res.prose, /aof-tools gh rebrand --apply/);
    assert.equal(stub.writes.length, 0, 'the dry run sends no write');
    assert.equal(repo.status(), before, 'the working tree is unchanged');
    assert.equal(res.payload.apply, false);
    assert.ok(res.payload.ops.length > 0);

    const raw = rebrand.runRebrand(repo.root, ['--repo', 'o/r', '--dry-run'], { client: stub, version: VERSION, runGit: repo.runGit });
    assert.equal(raw.code, 0);
    assert.deepEqual(raw.payload.ops.map((o) => o.kind), res.payload.ops.map((o) => o.kind), '--dry-run is the default made explicit');
    assert.equal(stub.writes.length, 0);
  });

  test('2. labels: rename when there is no AOForge twin, merge (destructive delete) when there is', () => {
    const { plan } = planFor({ snap: { withAoforgeLabels: ['trd'] } });
    const labels = opsOf(plan, 'labels');

    const rename = labels.find((o) => o.kind === 'rename' && o.before === 'devflow:objective');
    assert.ok(rename, 'devflow:objective is renamed');
    assert.equal(rename.after, 'aoforge:objective');
    assert.equal(rename.destructive, false);
    assert.deepEqual(rename.request.args, ['api', '-X', 'PATCH', 'repos/o/r/labels/devflow%3Aobjective', '--input', '-']);
    assert.deepEqual(inputOf(rename), { new_name: 'aoforge:objective' });

    const merge = labels.filter((o) => o.merge === 'devflow:trd');
    assert.deepEqual(merge.map((o) => o.kind), ['merge-add', 'merge-delete'], 'add to each issue first, then delete');
    assert.equal(merge[0].number, 2);
    assert.deepEqual(merge[0].request.args, ['api', '-X', 'POST', 'repos/o/r/issues/2/labels', '--input', '-']);
    assert.deepEqual(inputOf(merge[0]), { labels: ['aoforge:trd'] });
    assert.equal(merge[1].destructive, true);
    assert.deepEqual(merge[1].request.args, ['api', '-X', 'DELETE', 'repos/o/r/labels/devflow%3Atrd']);
    assert.ok(!labels.some((o) => o.kind === 'rename' && o.before === 'devflow:trd'), 'never renamed onto an existing label');
    assert.ok(!labels.some((o) => o.before === 'bug' || o.merge === 'bug'), 'a label outside the legacy namespace is not touched');

    const text = rebrand.renderPlan(plan);
    assert.match(text, /merge devflow:trd -> aoforge:trd.*destructive/);
    assert.match(text, /rename devflow:objective -> aoforge:objective/);
  });

  test('3. issues: managed bodies and titles rewritten, user text only where it names the product, unmanaged untouched', () => {
    const { plan } = planFor();
    const issues = opsOf(plan, 'issues');
    const byNumber = new Map(issues.map((o) => [o.number, o]));

    const one = byNumber.get(1);
    assert.ok(one, 'the objective issue is edited');
    assert.equal(one.kind, 'edit');
    assert.deepEqual(one.request.args, ['api', '-X', 'PATCH', 'repos/o/r/issues/1', '--input', '-']);
    const sent = inputOf(one);
    assert.equal(sent.title, 'AOForge doctor');
    assert.equal(sent.body, [
      '<!-- aoforge:id=46 -->',
      '<!-- aoforge:begin summary -->',
      '**Objective 46: AOForge doctor**',
      '',
      'A doctor for AOForge projects. It reads the devflowops fleet list.',
      '<!-- aoforge:end summary -->',
      '',
      '<!-- aoforge:begin footer -->',
      '_Tracked by [AOForge](https://github.com/AO-Cyber-Systems/aoforge-claude). Source of truth: `.aoforge/objectives/46-doctor/` in this repo._',
      '<!-- aoforge:end footer -->',
      '',
      'Notes a person typed: we ran an AOForge sweep last week.',
      'The devflowops dashboard stays as it is; see /devflow:status.',
      '',
    ].join('\n'));

    const two = byNumber.get(2);
    assert.deepEqual(Object.keys(inputOf(two)), ['body'], 'an unchanged title is not sent');
    assert.equal(inputOf(two).body, [
      '<!-- aoforge:id=46-01 -->',
      '<!-- aoforge:file=46-01-doctor-checks-TRD.md -->',
      '# TRD 46-01 doctor checks',
      '',
      'Teach the AOForge doctor two checks. Run df-tools doctor afterwards.',
      '',
    ].join('\n'));

    assert.equal(inputOf(byNumber.get(3)).title, 'Document the AOForge doctor');
    assert.match(inputOf(byNumber.get(3)).body, /^<!-- aoforge:id=todo-2026-07-31-a -->\n<!-- aoforge:file=todos\/pending\/2026-07-31-a.md -->\n/);

    const pr = inputOf(byNumber.get(5));
    assert.match(pr.body, /^<!-- aoforge:pr=46 -->\n<!-- aoforge:begin closes -->\nCloses #1\nCloses #2\n<!-- aoforge:end closes -->/);
    assert.match(pr.body, /Built with AOForge\./);
    assert.equal(pr.title, 'Objective 46: AOForge doctor');

    assert.ok(!byNumber.has(4), 'the unmanaged issue is never edited, whatever it says');
    for (const op of issues) {
      for (const field of ['title', 'body']) {
        assert.equal(count(op.after[field], 'devflowops'), count(op.before[field], 'devflowops'), `#${op.number} ${field}: devflowops kept`);
        assert.ok(!/<!--\s*devflow:/.test(op.after[field]), `#${op.number} ${field}: no legacy marker left`);
      }
    }
    assert.match(rebrand.renderPlan(plan), /^\+_Tracked by \[AOForge\]/m);
  });

  test('3b. a link to the repository itself keeps its name even when the name holds a legacy word', () => {
    const { plan } = planFor({
      mutate: (s) => {
        s.repo = 'o/devflow-app';
        s.issues[0].body = s.issues[0].body.replace('<!-- devflow:end footer -->',
          'Wiki: https://github.com/o/devflow-app/wiki/Home\n<!-- devflow:end footer -->');
      },
    });
    const one = plan.ops.find((o) => o.section === 'issues' && o.number === 1);
    assert.match(one.after.body, /https:\/\/github\.com\/o\/devflow-app\/wiki\/Home/);
  });

  test('4. comments: managed comments re-marked and re-worded, the human comment untouched', () => {
    const { plan } = planFor();
    const comments = opsOf(plan, 'comments');
    const byId = new Map(comments.map((o) => [o.id, o]));

    assert.deepEqual([...byId.keys()].sort(), [9100, 9101, 9102, 9300]);
    assert.deepEqual(byId.get(9100).request.args, ['api', '-X', 'PATCH', 'repos/o/r/issues/comments/9100', '--input', '-']);
    assert.equal(inputOf(byId.get(9100)).body, '<!-- aoforge:id=46 kind=state -->\n**State**: AOForge wave 1 of 2, last commit none');
    assert.equal(inputOf(byId.get(9101)).body,
      '<!-- aoforge:id=46-01 kind=summary -->\n<!-- aoforge:part=1/2 -->\n<!-- aoforge:file=46-01-SUMMARY.md -->\n# 46-01 summary\n');
    assert.equal(inputOf(byId.get(9102)).body, '<!-- aoforge:id=46-01 kind=summary -->\n<!-- aoforge:part=2/2 -->\nThe AOForge doctor has two checks.\n');
    assert.match(inputOf(byId.get(9300)).body, /^<!-- aoforge:reconcile -->\n/);
    assert.ok(!byId.has(9200), 'a comment a person wrote is never edited');
    assert.equal(byId.get(9100).number, 1, 'the comment knows its issue');
  });

  test('5. wiki: rewritten text, renamed page, untouched page, one push; a disabled wiki is skipped', () => {
    const { plan } = planFor();
    const wiki = opsOf(plan, 'wiki');
    assert.deepEqual(wiki.map((o) => o.kind), ['page', 'page', 'push'], 'pages first, one push last');

    const home = wiki.find((o) => o.page === 'Home');
    assert.equal(home.rename_from, undefined);
    assert.equal(home.after, '# AOForge planning\n\nThese pages are written by AOForge. The devflowops wiki is separate.\n');

    const guide = wiki.find((o) => o.page === 'AOForge-Guide');
    assert.equal(guide.rename_from, 'DevFlow-Guide');
    assert.equal(guide.after, 'Run /aoforge:plan-objective, then aof-tools commit.\n');
    assert.ok(!wiki.some((o) => o.page === 'Objective-46-doctor'), 'a page with no legacy name is left alone');

    const disabled = planFor({ mutate: (s) => { s.wiki = { state: 'disabled', pages: [] }; } }).plan;
    assert.deepEqual(opsOf(disabled, 'wiki'), []);
    assert.equal(disabled.sections.wiki.status, 'skipped');
    assert.match(disabled.sections.wiki.note, /disabled/);
  });

  test('6. rulesets: legacy name and contexts switched in one PUT; org ruleset left alone; 403 -> needs admin', () => {
    const { plan } = planFor();
    const rulesets = opsOf(plan, 'rulesets');
    assert.equal(rulesets.length, 1);
    const op = rulesets[0];
    assert.equal(op.kind, 'update');
    assert.deepEqual(op.request.args, ['api', '-X', 'PUT', 'repos/o/r/rulesets/42', '--input', '-']);
    const doc = inputOf(op);
    assert.deepEqual(Object.keys(doc).sort(), ['bypass_actors', 'conditions', 'enforcement', 'name', 'rules', 'target']);
    assert.equal(doc.name, 'aoforge: default branch');
    const checks = doc.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks;
    assert.deepEqual(checks.map((c) => c.context), ['aoforge/linked-issue', 'aoforge/planning-consistency', 'ci/build']);
    assert.ok(!rulesets.some((o) => o.id === 77), 'an organization ruleset is not edited from the repository');

    const forbidden = planFor({ client: { rulesetsStatus: 403 } }).plan;
    assert.deepEqual(opsOf(forbidden, 'rulesets'), []);
    assert.equal(forbidden.sections.rulesets.status, 'needs admin');
    assert.ok(opsOf(forbidden, 'issues').length > 0, 'the rest is still planned');
    assert.match(rebrand.renderPlan(forbidden), /^Rulesets \(needs admin\)/m);
  });

  test('7. local: caller moved and re-rendered, docs backend moved, PR template and config labels rewritten', () => {
    const repo = checkout({ store: true });
    const { plan } = planFor({ local: repo });
    const local = opsOf(plan, 'local');

    const callerMove = local.find((o) => o.kind === 'move' && o.from === '.github/workflows/devflow.yml');
    assert.ok(callerMove, 'the legacy caller is moved');
    assert.equal(callerMove.to, '.github/workflows/aoforge.yml');
    const caller = local.find((o) => o.kind === 'write' && o.path === '.github/workflows/aoforge.yml');
    assert.ok(local.indexOf(caller) > local.indexOf(callerMove), 'written after the move');
    assert.match(caller.after, /^# aoforge:managed/);
    assert.match(caller.after, /uses: AO-Cyber-Systems\/aoforge-claude\/\.github\/workflows\/aoforge-checks\.yml@v3\.0\.0/);
    assert.match(caller.after, /aoforge-ref: v3\.0\.0/);
    assert.ok(!/devflow/i.test(caller.after), 'no legacy name in the new caller');

    const docsMove = local.find((o) => o.kind === 'move' && o.from === 'docs/devflow');
    assert.ok(docsMove, 'the docs backend directory is moved');
    assert.equal(docsMove.to, 'docs/aoforge');
    const page = local.find((o) => o.kind === 'write' && o.path === 'docs/aoforge/Project.md');
    assert.equal(page.after, '# Project\n\nPlanned with AOForge. Pages live in docs/aoforge/.\n');

    const template = local.find((o) => o.kind === 'write' && o.path === '.github/pull_request_template.md');
    assert.match(template.after, /^Team checklist: link the design doc\.\n\n<!-- aoforge:pr-template:start -->/);
    assert.match(template.after, /<!-- aoforge:pr-template:end -->/);

    const config = local.find((o) => o.kind === 'write' && o.path === '.aoforge/config.json');
    const labels = JSON.parse(config.after).github.labels;
    assert.deepEqual(labels, {
      objective: 'aoforge:objective', in_progress: 'aoforge:in-progress', gaps: 'aoforge:gaps',
      trd: 'aoforge:trd', decision: 'aoforge:decision',
    });
    assert.equal(count(config.after, '\n'), count(config.before, '\n'), 'only the label values change, not the layout');

    assert.deepEqual(local.map((o) => o.kind).filter((k) => !['move', 'write', 'remove'].includes(k)), []);
  });

  test('7b. no checkout of the repository: the Local files section is skipped, not guessed', () => {
    const { plan } = planFor();
    assert.deepEqual(opsOf(plan, 'local'), []);
    assert.equal(plan.sections.local.status, 'skipped');
  });

  test('11. --bogus and --apply with --dry-run exit 1 before anything is read', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'rebrand-flags-'));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rebrand-home-'));
    try {
      const run = (args) => spawnSync(process.execPath, [TOOLS, '--cwd', cwd, 'gh', 'rebrand', ...args], {
        encoding: 'utf-8', timeout: 20000, env: { ...process.env, HOME: home, PATH: '/nonexistent' },
      });
      const bogus = run(['--bogus']);
      assert.equal(bogus.status, 1, bogus.stderr);
      assert.match(bogus.stderr + bogus.stdout, /--bogus/);
      const both = run(['--apply', '--dry-run']);
      assert.equal(both.status, 1, both.stdout);
      assert.match(both.stderr + both.stdout, /--apply.*--dry-run|--dry-run.*--apply/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }

    const inProcess = rebrand.runRebrand(os.tmpdir(), ['--apply', '--dry-run'], { client: fx.stubClient(fx.legacyRepoSnapshot()) });
    assert.equal(inProcess.code, 1);
  });
});
