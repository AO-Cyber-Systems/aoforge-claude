/**
 * Fixtures for the auto-continue Stop hook (TRD 44-05).
 *
 * - stopPayload(overrides)            — the VERIFIED Stop payload field set
 *                                        (OBJECTIVE.md "Verified harness facts").
 * - writeSkillMarker(planningDir, o)  — writes `.planning/.skill-active`.
 * - makeWorktreeWithMainMarker(tmp)   — main checkout with a live marker + a
 *                                        linked worktree whose own `.planning/`
 *                                        has none (the TRD 27-01 shape).
 * - ANNOUNCE / NOT_ANNOUNCE           — HAND-WRITTEN message corpus, each entry
 *                                        labelled. Never generate these.
 *
 * Label prefixes:
 *   trd-6x / trd-7x — verbatim from the 44-05 TRD test list (items 6 and 7).
 *   real-*          — modelled on phrasing from 44-EVIDENCE.md §1 row 4 / §3.3
 *                     and on DevFlow's own hand-off shapes (ui-brand.md Next Up
 *                     block, executor completion format, checkpoint returns).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

/**
 * A Stop payload with exactly the verified field set.
 * Defaults: stop_hook_active false, no background tasks, no crons.
 */
function stopPayload(overrides = {}) {
  return {
    session_id: 'test-session',
    transcript_path: '/nonexistent/transcript.jsonl',
    cwd: '/nonexistent',
    prompt_id: 'test-prompt',
    permission_mode: 'default',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: '',
    background_tasks: [],
    session_crons: [],
    ...overrides,
  };
}

/**
 * Write `<planningDir>/.skill-active`. `expiresAt` is an ISO string; it
 * defaults to eight hours from now (the gate-edits default lifetime).
 */
function writeSkillMarker(planningDir, { expiresAt } = {}) {
  fs.mkdirSync(planningDir, { recursive: true });
  const now = Date.now();
  const marker = {
    skill: 'execute-objective',
    started_at: new Date(now).toISOString(),
    expires_at: expiresAt || new Date(now + EIGHT_HOURS_MS).toISOString(),
  };
  const p = path.join(planningDir, '.skill-active');
  fs.writeFileSync(p, JSON.stringify(marker));
  return p;
}

/**
 * A main checkout (`<tmp>/main`, `.git` directory, live marker in
 * `.planning/`) and a linked worktree (`<tmp>/wt`, `.git` FILE pointing at
 * `<main>/.git/worktrees/wt`, its own `.planning/` with NO marker).
 */
function makeWorktreeWithMainMarker(tmp) {
  const mainRoot = path.join(tmp, 'main');
  const wtRoot = path.join(tmp, 'wt');

  fs.mkdirSync(path.join(mainRoot, '.git', 'worktrees', 'wt'), { recursive: true });
  writeSkillMarker(path.join(mainRoot, '.planning'));

  fs.mkdirSync(path.join(wtRoot, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(wtRoot, '.git'),
    `gitdir: ${path.join(mainRoot, '.git', 'worktrees', 'wt')}\n`
  );

  return { mainRoot, wtRoot };
}

// ---------------------------------------------------------------------------
// Hand-written message corpus
// ---------------------------------------------------------------------------

/** Messages that announce a next action and then stop — must classify non-null. */
const ANNOUNCE = [
  // --- TRD test list item 6 (verbatim) ---
  { label: 'trd-6a: Now + gerund', text: 'Now running the full suite.' },
  { label: 'trd-6b: Next, I\'ll', text: 'Next, I\'ll wire the hook into hooks.json.' },
  { label: 'trd-6c: Running', text: 'Running npm test.' },
  { label: 'trd-6d: Writing', text: 'Writing the SUMMARY.' },
  { label: 'trd-6e: Starting wave', text: 'Starting wave 3.' },
  { label: 'trd-6f: Ready for wave N on your word', text: 'Wave 2 merged. Ready for wave 3 on your word.' },

  // --- real phrasing (44-EVIDENCE §1 row 4, §3.3) ---
  { label: 'real-a: evidence "Writing the predicate." after a status paragraph', text: 'Tests are green.\n\nWriting the predicate.' },
  { label: 'real-b: evidence "Ready for wave 4 on your word"', text: 'Wave 3 merged cleanly — 3/3 TRDs, SUMMARYs present.\n\nReady for wave 4 on your word.' },
  { label: 'real-c: Now let me', text: 'RED is committed (a1b2c3d).\n\nNow let me write the implementation.' },
  { label: 'real-d: Now I\'ll', text: 'The fixture loads and the corpus has 20 entries.\n\nNow I\'ll update the roadmap row.' },
  { label: 'real-e: Next I\'ll (no comma)', text: 'Wave 3 merged.\n\nNext I\'ll spawn the wave 4 executors.' },
  { label: 'real-f: announcement followed by a trailing code fence', text: 'Build is clean.\n\nNow running the focused test:\n\n```bash\nnode --test plugins/devflow/hooks/auto-continue.test.js\n```' },
  { label: 'real-g: Starting wave after a merge report', text: 'Merged df/exec-44-03 and df/exec-44-06.\n\nStarting wave 2: 44-02, 44-04, 44-07.' },
  { label: 'real-z: bold announcement', text: 'RED is committed.\n\n**Now writing the implementation.**' },
];

/** Messages that must NOT auto-continue — must classify null. */
const NOT_ANNOUNCE = [
  // --- TRD test list item 7 (verbatim) ---
  { label: 'trd-7a: Should I … ?', text: 'Should I start wave 3?' },
  { label: 'trd-7b: Now, do you want me to … ?', text: 'Now, do you want me to push?' },
  { label: 'trd-7c: Writing it now — or would you prefer … ?', text: 'Writing it now — or would you prefer a draft first?' },
  {
    label: 'trd-7d: ## ▶ Next Up block with /devflow: command',
    text: '## ▶ Next Up\n**Objective 44: Autonomy hardening** — execute\n`/devflow:execute-objective 44`',
  },
  { label: 'trd-7e: Next: run /devflow:verify-work', text: 'Next: run /devflow:verify-work 44' },
  { label: 'trd-7f: completion report', text: 'All 9 TRDs complete.' },
  { label: 'trd-7g: "now" mid-sentence', text: 'The value is now known.' },
  {
    label: 'trd-7h: Now only in an earlier paragraph',
    text: 'Now running the full suite.\n\nAll 412 tests pass and the branch is merged. Nothing further is pending.',
  },

  // --- real phrasing: DevFlow's own hand-offs to the user ---
  {
    label: 'real-h: canonical ui-brand Next Up block (multi-paragraph)',
    text: [
      'Objective 44 complete — 9/9 TRDs, verification passed.',
      '',
      '───────────────────────────────────────────────────────────────',
      '',
      '## ▶ Next Up',
      '',
      '**Objective 45: Stack packs** — plan',
      '',
      '`/devflow:plan-objective 45`',
      '',
      '<sub>`/clear` first → fresh context window</sub>',
      '',
      '───────────────────────────────────────────────────────────────',
      '',
      '**Also available:**',
      '- `/devflow:verify-work 44` — manual acceptance testing',
      '',
      '───────────────────────────────────────────────────────────────',
    ].join('\n'),
  },
  { label: 'real-i: Next, run /devflow: (comma form of the hand-off)', text: 'Next, run /devflow:verify-work 44 to walk through UAT.' },
  { label: 'real-j: Next steps list for the user (no slash command)', text: 'Everything is committed on feat/stack-profile-loader.\n\nNext steps:\n- Tag v2.12.0\n- Push the branch' },
  {
    label: 'real-k: executor completion format',
    text: '## TRD COMPLETE\n\n**TRD:** 44-05\n**Tasks:** 3/3\n**SUMMARY:** .planning/objectives/44-autonomy-hardening/44-05-SUMMARY.md',
  },

  // --- real phrasing: reports that merely START with an announce word ---
  { label: 'real-l: "Now" + finite clause is a report', text: 'Now all 412 tests pass.' },
  { label: 'real-m: "Now nothing …" is not a gerund', text: 'Merged wave 3.\n\nNow nothing is left to do.' },
  { label: 'real-n: "Running:" colon report', text: 'Running: npm test → 412 pass, 0 fail.' },
  { label: 'real-o: bullet-list report', text: 'Done.\n\n- Running the suite: 412 pass\n- Writing SUMMARY: done' },

  // --- real phrasing: waits on background work ---
  {
    label: 'real-p: waiting on background executors',
    text: 'Spawned 3 executors for wave 2.\n\nNow waiting for their task notifications.',
  },
  {
    label: 'real-q: running in the background',
    text: 'Running the full suite in the background; I\'ll report when it finishes.',
  },

  // --- real phrasing: asks that need the user ---
  { label: 'real-r: can you … ?', text: 'Running the Flutter integration tests needs a booted emulator. Can you boot one?' },
  { label: 'real-s: let me know', text: 'Writing to main is blocked while the other session is active. Let me know when it is free.' },
  { label: 'real-t: you\'ll need to', text: 'Next, you\'ll need to run `gh auth login` in your terminal.' },
  { label: 'real-u: want me to … ?', text: 'Starting wave 3 would touch hooks.json. Want me to go ahead?' },

  // --- real phrasing: gerund-led sentences that report a result ---
  { label: 'real-v: gerund subject + finite verb is a report', text: 'Running the suite showed three failures in gate-edits.' },
  { label: 'real-w: announcement carrying its own result', text: 'Now running the full suite: 412 pass, 0 fail.' },
  { label: 'real-x: announcement followed by its result in the same paragraph', text: 'Now running the full suite. All 412 pass.' },
  { label: 'real-y: needs your approval', text: 'Writing the SUMMARY is the last step, and it needs your look-lock approval first.' },
];

module.exports = {
  stopPayload,
  writeSkillMarker,
  makeWorktreeWithMainMarker,
  ANNOUNCE,
  NOT_ANNOUNCE,
};
