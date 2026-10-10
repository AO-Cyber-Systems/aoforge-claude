'use strict';

// summary-completion-fixtures.cjs (TRD 75-03, TODO-01) — hand-built SUMMARY texts for every completion shape that
// roadmap-reconcile's `_summaryNotComplete` must tell apart.
//
// Hand-built only, no generated data: every string below is literal text. `summaryDoc` only assembles the pieces a test
// names, in the order the executor writes them (frontmatter, title, `## Progress`, extra sections, `## Self-Check`).
//
// Used by:
//   roadmap-reconcile.test.cjs   (NC-P group: the predicate, and reconcile over a temp ROADMAP)
//   objective.test.cjs           (completedSummaryFiles and the `objective complete` Jobs count)
//   state-advance-job.test.cjs   (`state advance-job --objective N` position)
//
// The presets mirror real files:
//   PROGRESS_CHECKPOINT                 72-26 at abc18a9f: a mid-TRD `summary checkpoint` (two ticked, one unticked task
//                                       with its `next step:` line, task sections, Task Evidence, no Self-Check, no
//                                       frontmatter status)
//   COMPLETE_PASSED / COMPLETE_FAILED   a finished executor SUMMARY: every task ticked, `## Self-Check: PASSED|FAILED`
//   COMPLETE_ALL_TICKED_NO_SELF_CHECK   .aoforge/objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-
//                                       SUMMARY.md: a backfilled SUMMARY, every Progress task ticked, no Self-Check. It is
//                                       the only such file under .aoforge/objectives/ and it must stay complete
//   LEGACY_NO_PROGRESS                  a pre-Progress SUMMARY: neither a Progress list nor a Self-Check
//   UNTICKED_OUTSIDE_PROGRESS           every Progress task ticked, no Self-Check, and a `## Left for the user` checklist
//                                       with `- [ ]` lines (an unticked box outside Progress is not an unfinished task)
//   STATUS_DEFERRED / STATUS_CHECKPOINT objective 74's frontmatter `status:` shapes (74-06 is the real deferred one)

/**
 * Build a SUMMARY document.
 *
 * @param {object} [spec]
 * @param {string|null} [spec.status]      frontmatter `status:` value, written only when given
 * @param {Array<{done: boolean, name: string}>|null} [spec.progress]  `## Progress` list; null omits the section
 * @param {'PASSED'|'FAILED'|null} [spec.selfCheck]  writes `## Self-Check: <verdict>` last; null omits it
 * @param {Array<{heading: string, body: string}>} [spec.sections]  extra `## heading` sections after Progress
 * @returns {string}
 */
function summaryDoc({ status = null, progress = null, selfCheck = null, sections = [] } = {}) {
  const parts = [];
  const fm = ['objective: 75-prospective-estimate-retest-and-todo-sweep', 'trd: "99"'];
  if (status !== null) fm.push(`status: ${status}`);
  parts.push(`---\n${fm.join('\n')}\n---\n`);
  parts.push('# Objective 75 TRD 99: Fixture Summary\n');
  if (Array.isArray(progress)) {
    const items = progress.map((p, i) => {
      const box = p.done ? '[x]' : '[ ]';
      const tail = p.done ? 'abc1234' : 'next step: edit the module and run its test';
      return `- ${box} Task ${i + 1}: ${p.name} — ${tail}`;
    });
    parts.push(`## Progress\n${items.join('\n')}\n`);
  }
  for (const s of sections) parts.push(`## ${s.heading}\n${s.body}\n`);
  if (selfCheck) parts.push(`## Self-Check: ${selfCheck}\n`);
  return parts.join('\n');
}

const TASKS_ALL_DONE = [
  { done: true, name: 'CLI module and integration' },
  { done: true, name: 'Tests' },
  { done: true, name: 'Docs' },
];

const TASK_SECTIONS = [
  { heading: 'Task 1: move the checkout', body: 'Moved. Verified with the scoped test run.' },
  { heading: 'Task 2: carry the state over', body: 'Carried. Verified.' },
  { heading: 'Task Evidence', body: '| Task | Verify Command | Exit Code | Status |\n|---|---|---|---|\n| 1 | `node --test` | 0 | PASS |' },
];

const PROGRESS_CHECKPOINT = summaryDoc({
  progress: [
    { done: true, name: 'Approval gate: move the checkout' },
    { done: true, name: 'Carry the path-keyed state over' },
    { done: false, name: 'Approval gates (push, then PR)' },
  ],
  sections: TASK_SECTIONS,
});

const COMPLETE_PASSED = summaryDoc({
  progress: TASKS_ALL_DONE,
  sections: TASK_SECTIONS,
  selfCheck: 'PASSED',
});

const COMPLETE_FAILED = summaryDoc({
  progress: TASKS_ALL_DONE,
  sections: TASK_SECTIONS,
  selfCheck: 'FAILED',
});

const COMPLETE_ALL_TICKED_NO_SELF_CHECK = summaryDoc({
  progress: [...TASKS_ALL_DONE, { done: true, name: 'Pre-test ROADMAP cleanup' }],
  sections: [
    { heading: 'What changed', body: 'The CLI, the skill and the integration test.' },
    { heading: 'Evidence', body: 'node --test exits 0.' },
    { heading: 'Deviations from Plan', body: 'None.' },
    { heading: 'Backfill note', body: 'Written after the fact from the commit history.' },
  ],
});

const LEGACY_NO_PROGRESS = summaryDoc({
  sections: [
    { heading: 'Accomplishments', body: '- Built the thing.' },
    { heading: 'Deviations from Plan', body: 'None.' },
  ],
});

const UNTICKED_OUTSIDE_PROGRESS = summaryDoc({
  progress: TASKS_ALL_DONE,
  sections: [
    { heading: 'Task Evidence', body: 'All three tasks verified.' },
    { heading: 'Left for the user', body: '- [ ] Review the migration on a staging project\n- [ ] Decide when to tag the release' },
  ],
});

const STATUS_DEFERRED = summaryDoc({
  status: 'deferred',
  progress: TASKS_ALL_DONE,
  sections: TASK_SECTIONS,
  selfCheck: 'PASSED',
});

const STATUS_CHECKPOINT = summaryDoc({
  status: 'checkpoint',
  progress: [
    { done: true, name: 'Approval gate: move the checkout' },
    { done: false, name: 'Approval gates (push, then PR)' },
  ],
  sections: TASK_SECTIONS,
});

module.exports = {
  summaryDoc,
  PROGRESS_CHECKPOINT,
  COMPLETE_PASSED,
  COMPLETE_FAILED,
  COMPLETE_ALL_TICKED_NO_SELF_CHECK,
  LEGACY_NO_PROGRESS,
  UNTICKED_OUTSIDE_PROGRESS,
  STATUS_DEFERRED,
  STATUS_CHECKPOINT,
};
