'use strict';

// pr-lifecycle-prose.repo.test.cjs — TRD 49-13 (objective 49, GPR-06).
//
// The execute-objective and complete-milestone workflows drive the objective's linked branch and
// pull request in store mode (start, TRD in progress, wave sync, verify, merge, reconcile) and
// complete-milestone no longer merges branches locally. This test pins that prose contract. It
// reads the workflow files as written, so a later edit that drops a verb, reorders sync and
// verification, or lets `df/exec-*` branches be pushed fails here.
//
// Branching is on the init JSON (`pr_lifecycle`), never on a shell probe of config (Pitfall 11),
// and the local path stays verbatim: the new behaviour sits in labelled "If `pr_lifecycle` is
// true" blocks next to the old text.
//
// Test list (the TRD's 1-8):
// 1.  handle_branching: `pr_lifecycle`, `gh pr start`, stop-on-exit-1 offline, the local
//     `git checkout -b` survives under the local branch, init `deprecations` are printed.
//     initialize parses pr_lifecycle / objective_branch / pr_number / deprecations.
// 2.  execute_waves: `gh trd start` at spawn, worktree base = the objective branch tip, `gh pr sync`
//     once per wave, `df/exec-*` never pushed and deleted locally after the merge.
// 3.  verify_objective_goal: `gh pr sync` before the verification is posted, VERIFICATION carries a
//     status, and prose never calls `gh pr ready` or touches the in-progress label.
// 4.  update_roadmap: offers `gh pr merge` then `gh pr reconcile`; the objective issue closes on merge.
// 5.  complete-milestone handle_branches starts with a skip when `pr_lifecycle` is true.
// 6.  settings.md and planning-config.md carry the store-mode deprecation of `branching_strategy`.
// 7.  Every `aof-tools gh <sub> <verb>` named in the four files dispatches (real process for the
//     pr / trd / outbox verbs, the dispatcher's own `case 'gh'` for the top-level names).
// 8.  The planning-writes audit finds nothing in the two workflows.
//
// Read-only except for temp dirs. Never reaches GitHub: the spawned aof-tools has an empty PATH (no
// gh, no git) and a throwaway HOME, and the verbs are called without their arguments.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { scanWrites } = require('./planning-audit.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
const AOFORGE_DIR = path.resolve(__dirname, '..', '..');
const DF_TOOLS = path.join(AOFORGE_DIR, 'bin', 'aof-tools.cjs');

const FILES = {
  execute: 'workflows/execute-objective.md',
  milestone: 'workflows/complete-milestone.md',
  settings: 'workflows/settings.md',
  config: 'references/planning-config.md',
};

const read = (rel) => fs.readFileSync(path.join(AOFORGE_DIR, rel), 'utf-8');

/** The body of `<step name="name">…</step>`. Throws when the step is missing, so a rename fails loudly. */
function step(text, name) {
  const m = new RegExp(`<step name="${name}"[^>]*>([\\s\\S]*?)</step>`).exec(text);
  assert.ok(m, `no <step name="${name}"> found`);
  return m[1];
}

/** Position of `needle` in `hay`, failing with a readable message when it is absent. */
function at(hay, needle, label) {
  const i = typeof needle === 'string' ? hay.indexOf(needle) : hay.search(needle);
  assert.notEqual(i, -1, `${label || needle} not found`);
  return i;
}

describe('pr-lifecycle-prose.repo.test.cjs', { skip: IS_AOFORGE_CHECKOUT ? false : 'not an aoforge-claude checkout' }, () => {
  describe('execute-objective.md: initialize and handle_branching (test 1)', () => {
    test('1a: initialize parses pr_lifecycle, objective_branch, pr_number and deprecations', () => {
      const body = step(read(FILES.execute), 'initialize');
      for (const field of ['pr_lifecycle', 'objective_branch', 'pr_number', 'deprecations']) {
        assert.ok(body.includes(`\`${field}\``), `initialize does not parse \`${field}\``);
      }
    });

    test('1b: handle_branching branches on pr_lifecycle and runs gh pr start in store mode', () => {
      const body = step(read(FILES.execute), 'handle_branching');
      assert.ok(body.includes('pr_lifecycle'), 'handle_branching does not mention pr_lifecycle');
      assert.ok(body.includes('aof-tools.cjs gh pr start'), 'handle_branching does not run `gh pr start`');
      assert.match(body, /exit 1[^\n]*(stop|report)|(stop|report)[^\n]*exit 1/i, 'no stop-and-report on a `gh pr start` failure (exit 1)');
      assert.match(body, /branching_strategy[^\n]*(ignored|ignore)|(ignored|ignore)[^\n]*branching_strategy/i, 'store mode does not say branching_strategy is ignored');
    });

    test('1c: the local branch keeps `git checkout -b` and prints init deprecations', () => {
      const body = step(read(FILES.execute), 'handle_branching');
      const localAt = at(body, /If `pr_lifecycle` is false/, 'the local-mode heading');
      const checkoutAt = at(body, 'git checkout -b "$BRANCH_NAME"', 'the local `git checkout -b`');
      assert.ok(checkoutAt > localAt, '`git checkout -b` is not under the local-mode heading');
      assert.ok(body.includes('"objective" or "milestone"'), 'the local strategy text was rewritten');
      assert.ok(body.includes('`deprecations`'), 'local mode does not print init `deprecations`');
      const storeAt = at(body, /If `pr_lifecycle` is true/, 'the store-mode heading');
      assert.ok(storeAt < localAt, 'the store-mode block should come first');
      assert.ok(body.indexOf('git checkout -b') > storeAt && !body.slice(storeAt, localAt).includes('git checkout -b'), 'the store-mode block runs a local `git checkout -b`');
    });
  });

  describe('execute-objective.md: execute_waves (test 2)', () => {
    const waves = () => step(read(FILES.execute), 'execute_waves');

    test('2a: each spawned TRD gets `gh trd start`, the objective branch tip is the worktree base', () => {
      const body = waves();
      assert.ok(body.includes('aof-tools.cjs gh trd start'), 'no `gh trd start` at spawn');
      const startAt = body.indexOf('gh trd start');
      const spawnAt = at(body, /4\. \*\*Spawn executor agents/, 'the spawn item');
      const taskAt = at(body, 'Task(\n     subagent_type="executor"', 'the executor Task call');
      assert.ok(spawnAt < startAt && startAt < taskAt, '`gh trd start` is not inside the spawn item, before the executor Task call');
      assert.match(body, /objective branch/i, 'the wave step never names the objective branch');
      assert.match(body, /WAVE_BASE[^\n]*objective branch|objective branch[^\n]*WAVE_BASE/i, 'WAVE_BASE is not tied to the objective branch tip');
      assert.ok(body.includes('exec-context worktree --repo <REPO_ROOT> --id <plan_id> --base <WAVE_BASE>'), 'the worktree command was rewritten');
    });

    test('2b: gh pr sync runs once per wave, after the merge-back', () => {
      const body = waves();
      const mergeAt = at(body, '5b. **Merge the wave', 'item 5b');
      const syncAt = at(body, 'aof-tools.cjs gh pr sync', '`gh pr sync`');
      assert.ok(syncAt > mergeAt, '`gh pr sync` is before the merge-back');
      assert.match(body, /once per wave/i, 'no "once per wave" statement');
      assert.match(body, /exit 3/, 'the pending exit (3) of `gh pr sync` is not handled');
    });

    test('2c: df/exec-* branches are never pushed and are deleted locally after the merge', () => {
      const body = waves();
      assert.match(body, /`df\/exec-\*` branches? (is|are) never pushed/, 'no "df/exec-* branches are never pushed" sentence');
      assert.ok(body.includes('git branch -d df/exec-{plan_id}'), 'no `git branch -d df/exec-{plan_id}` after the merge');
      assert.ok(body.indexOf('git branch -d df/exec-{plan_id}') > body.indexOf('git merge --no-ff df/exec-{plan_id}'), 'the branch is deleted before it is merged');
      const text = read(FILES.execute);
      assert.doesNotMatch(text, /git push[^\n]*df\/exec/, 'prose pushes a df/exec-* branch');
    });
  });

  describe('execute-objective.md: verify_objective_goal (test 3)', () => {
    const verify = () => step(read(FILES.execute), 'verify_objective_goal');

    test('3a: gh pr sync runs before the verifier posts the verification', () => {
      const body = verify();
      const syncAt = at(body, 'aof-tools.cjs gh pr sync', '`gh pr sync` in the verify step');
      const postAt = at(body, 'verification post', '`verification post` in the verify step');
      assert.ok(syncAt < postAt, '`gh pr sync` is not before `verification post`');
      assert.match(body, /verified head/i, 'does not say why: the status lands on the verified head');
      assert.match(body, /re-?verif/i, 'does not cover the gap-closure re-verify');
    });

    test('3b: the VERIFICATION carries a status, and `verification post` owns status/ready/wiki', () => {
      const body = verify();
      assert.ok(body.includes('status: passed|gaps_found|human_needed'), 'the status values are not stated');
      assert.match(body, /`verification post`[^\n]*(status|ready)/i, 'does not say `verification post` handles status/ready');
    });

    test('3c: prose never calls gh pr ready, posts a status, or edits the in-progress label', () => {
      const text = read(FILES.execute);
      assert.doesNotMatch(text, /gh pr ready/, 'prose calls `gh pr ready`');
      assert.doesNotMatch(text, /gh issue edit|--remove-label|--add-label/, 'prose edits an issue label itself');
      assert.doesNotMatch(text, /gh api[^\n]*statuses/, 'prose posts a commit status itself');
    });
  });

  describe('execute-objective.md: update_roadmap (test 4)', () => {
    const roadmap = () => step(read(FILES.execute), 'update_roadmap');

    test('4a: offers gh pr merge then gh pr reconcile', () => {
      const body = roadmap();
      const mergeAt = at(body, 'aof-tools.cjs gh pr merge', '`gh pr merge`');
      const reconcileAt = at(body, 'aof-tools.cjs gh pr reconcile', '`gh pr reconcile`');
      assert.ok(mergeAt < reconcileAt, 'reconcile is offered before merge');
      assert.match(body, /merge queue/i, 'no merge-queue case (exit 3, reconcile later)');
      assert.match(body, /merged (it )?on GitHub|merged by (a )?human|human merge/i, 'no human-merge-on-GitHub case');
    });

    test('4b: the objective issue closes on merge, not at verify; exit codes are handled', () => {
      const body = roadmap();
      assert.match(body, /objective issue closes on merge/i, 'no "objective issue closes on merge" statement');
      assert.match(body, /objective complete[^\n]*(does not|no longer)[^\n]*clos/i, '`objective complete` is not said to leave the issue open');
      for (const code of ['exit 0', 'exit 1', 'exit 2', 'exit 3']) assert.ok(body.includes(code), `the merge exit codes omit \`${code}\``);
      assert.match(body, /stderr/i, 'warnings on stderr are not surfaced');
    });

    test('4c: the gh sync step is untouched (execute-objective-gh-sync.test extracts it)', () => {
      const body = roadmap();
      assert.ok(body.includes('**Auto-push to GitHub (objective 46, GSF-03):**'), 'the Auto-push heading moved');
      assert.ok(body.includes('gh sync "${OBJECTIVE_DIR}"'), 'the gh sync call changed');
    });
  });

  describe('complete-milestone.md handle_branches (test 5)', () => {
    test('5: the step starts with a skip when pr_lifecycle is true; the local text stays', () => {
      const body = step(read(FILES.milestone), 'handle_branches').trim();
      const firstBlock = body.split(/\n\n/)[0];
      assert.match(firstBlock, /pr_lifecycle/, 'the first paragraph does not mention pr_lifecycle');
      assert.match(firstBlock, /skip/i, 'the first paragraph does not skip the step');
      assert.match(body, /already merged through (its|their) (PR|pull request)/i, 'no "already merged through its PR" reason');
      assert.ok(body.includes('git branch --list'), 'the local branch discovery was removed');
      assert.match(body, /git merge --squash|squash/i, 'the local squash merge text was removed');
    });
  });

  describe('settings.md and planning-config.md (test 6)', () => {
    const SENTENCE = /`git\.branching_strategy`[^\n]*deprecated in store mode[^\n]*objective PR lifecycle/;

    test('6a: settings.md carries the deprecation sentence', () => {
      const text = read(FILES.settings);
      assert.match(text, SENTENCE, 'settings.md has no store-mode deprecation for `git.branching_strategy`');
      assert.match(text, /local mode[^\n]*(still )?honou?red/i, 'settings.md does not say local mode still honours it');
    });

    test('6b: planning-config.md carries it and says objective_branch_template names the linked branch', () => {
      const text = read(FILES.config);
      assert.match(text, SENTENCE, 'planning-config.md has no store-mode deprecation for `git.branching_strategy`');
      assert.match(text, /`objective_branch_template`[^\n]*linked branch|linked branch[^\n]*`objective_branch_template`/, 'objective_branch_template is not said to name the linked branch');
    });
  });

  describe('every `aof-tools gh <sub> <verb>` named in the prose dispatches (test 7)', () => {
    const MENTION_RE = /aof-tools(?:\.cjs)?[ \t]+gh[ \t]+([a-z][a-z-]*)(?:[ \t]+([a-z][a-z-]*))?/g;

    /** `[sub, verb|null]` pairs named in `text`. */
    function mentions(text) {
      const out = [];
      let m;
      MENTION_RE.lastIndex = 0;
      while ((m = MENTION_RE.exec(text)) !== null) out.push([m[1], m[2] || null]);
      return out;
    }

    /** The top-level `gh` names the dispatcher's own `case 'gh'` block takes. */
    function dispatchedTopLevel() {
      const src = fs.readFileSync(DF_TOOLS, 'utf-8');
      const start = src.indexOf("case 'gh': {");
      assert.notEqual(start, -1, "aof-tools.cjs has no `case 'gh'`");
      const block = src.slice(start, src.indexOf("case 'awareness'", start));
      return new Set([...block.matchAll(/subcommand === '([a-z-]+)'/g)].map((m) => m[1]));
    }

    let sandbox;
    function sandboxDirs() {
      if (!sandbox) {
        sandbox = {
          cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'pr-prose-cwd-')),
          home: fs.mkdtempSync(path.join(os.tmpdir(), 'pr-prose-home-')),
          bin: fs.mkdtempSync(path.join(os.tmpdir(), 'pr-prose-bin-')),
        };
      }
      return sandbox;
    }

    /** Whether `gh <sub> <verb>` (no further arguments) dispatches. An empty PATH keeps gh and git out of reach. */
    function verbDispatches(sub, verb) {
      const d = sandboxDirs();
      const r = spawnSync(process.execPath, [DF_TOOLS, '--cwd', d.cwd, 'gh', sub, verb], {
        encoding: 'utf-8',
        timeout: 20000,
        env: { PATH: d.bin, HOME: d.home },
      });
      return !new RegExp(`Unknown gh ${sub} subcommand`).test(`${r.stderr || ''}${r.stdout || ''}`);
    }

    test('7a: sensitivity — a made-up verb is reported as undispatched, a real one is not', () => {
      assert.equal(verbDispatches('pr', 'no-such-verb-49'), false);
      assert.equal(verbDispatches('trd', 'no-such-verb-49'), false);
      assert.equal(verbDispatches('pr', 'start'), true);
      assert.equal(verbDispatches('trd', 'start'), true);
      assert.ok(mentions('run `aof-tools gh pr sync <obj>` then `aof-tools.cjs gh sync "x"`').length === 2);
    });

    test('7b: the lifecycle verbs are named in the prose at all (no vacuous pass)', () => {
      const named = new Set(mentions(read(FILES.execute) + read(FILES.milestone)).map(([s, v]) => `${s} ${v}`));
      for (const want of ['pr start', 'pr sync', 'pr merge', 'pr reconcile', 'trd start']) {
        assert.ok(named.has(want), `no prose names \`aof-tools gh ${want}\``);
      }
    });

    test('7c: every named gh subcommand and verb dispatches', () => {
      const top = dispatchedTopLevel();
      const failures = [];
      const seen = new Set();
      for (const rel of Object.values(FILES)) {
        for (const [sub, verb] of mentions(read(rel))) {
          const key = `${sub} ${verb}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!top.has(sub)) {
            failures.push(`${rel}: gh ${sub} is not a dispatched gh subcommand`);
          } else if (['pr', 'trd', 'outbox'].includes(sub) && verb && !verbDispatches(sub, verb)) {
            failures.push(`${rel}: gh ${sub} ${verb} does not dispatch`);
          }
        }
      }
      assert.deepEqual(failures, [], failures.join('\n'));
    });

    test('7d: clean up the sandbox', () => {
      if (sandbox) for (const dir of Object.values(sandbox)) fs.rmSync(dir, { recursive: true, force: true });
      sandbox = null;
    });
  });

  describe('planning-writes audit (test 8)', () => {
    for (const key of ['execute', 'milestone']) {
      test(`8: ${FILES[key]} has no direct planning-write instruction and no bad marker`, () => {
        const { findings, badMarkers } = scanWrites(read(FILES[key]));
        assert.deepEqual(findings.map((f) => `${f.line}: ${f.text}`), []);
        assert.deepEqual(badMarkers, []);
      });
    }
  });
});
