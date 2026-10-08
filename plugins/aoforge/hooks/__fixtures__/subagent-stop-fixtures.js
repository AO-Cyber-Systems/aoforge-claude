/**
 * Hand-built SubagentStop fixtures for gate-executor-stop tests (TRD 44-04).
 *
 * Everything here is invented: plan ids like `77-02`, paths like `/fixture/repo`.
 * Nothing is copied from a real transcript. The payload field SET is the one
 * verified on Claude Code 2.1.284 (OBJECTIVE.md, "Verified harness facts"):
 *
 *   session_id, transcript_path, cwd, prompt_id, permission_mode, agent_id,
 *   agent_type, hook_event_name, stop_hook_active, agent_transcript_path,
 *   last_assistant_message, background_tasks
 *
 * TRD 66-02 adds `summaryText(kind, id)` and the `summaryKinds` option of
 * `makePlanningRepo`: `checkpoint` (the default), `final_stamped`,
 * `final_backfill`, `final_unstamped`, `final_template_comments` and
 * `final_input_only`. They let the token branch of the gate be tested against a
 * final SUMMARY with and without `tokens_input` / `tokens_output`.
 *
 * No dependencies beyond node core.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * A SubagentStop payload with the verified field set.
 *
 * An override whose value is `undefined` REMOVES that key, so a test can
 * express "field missing" (e.g. `{ agent_type: undefined }`).
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function subagentStopPayload(overrides = {}) {
  const payload = {
    session_id: 'sess-fixture-0001',
    transcript_path: '/fixture/home/.claude/projects/-fixture-repo/sess-fixture-0001.jsonl',
    cwd: '/fixture/repo',
    prompt_id: 'prompt-fixture-0001',
    permission_mode: 'bypassPermissions',
    agent_id: 'a1b2',
    agent_type: 'aoforge:executor',
    hook_event_name: 'SubagentStop',
    stop_hook_active: false,
    agent_transcript_path: '/fixture/home/.claude/projects/-fixture-repo/sess-fixture-0001/subagents/agent-a1b2.jsonl',
    last_assistant_message: 'Task 2 committed. Stopping here.',
    background_tasks: [],
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete payload[key];
    else payload[key] = value;
  }
  return payload;
}

/**
 * Split `77-02` into `{ objectiveNum: '77', trd: '02' }`. Decimal objectives
 * (`12.1-03`) keep their decimal.
 */
function splitPlanId(planId) {
  const m = /^(\d+(?:\.\d+)?)-(\d+)$/.exec(String(planId || ''));
  return m ? { objectiveNum: m[1], trd: m[2] } : null;
}

/**
 * An executor spawn prompt shaped like execute-objective.md's (step
 * execute_waves, item 4): `<objective>`, `<plan_content>` with a tiny embedded
 * TRD, and `<repo_and_base>` carrying REPO_ROOT / WAVE_BASE / PLAN_ID plus the
 * `exec-context check ... --id` line.
 *
 * `planId: null` omits BOTH id lines (PLAN_ID and `--id`); the embedded TRD
 * frontmatter then comes from `objective` / `trd` if given, otherwise it is
 * omitted too.
 *
 * @param {object} opts
 * @param {string|null} opts.planId
 * @param {string} [opts.repoRoot]
 * @param {string} [opts.base]
 * @param {string} [opts.extra]       appended verbatim after </repo_and_base>
 * @param {string} [opts.objective]   embedded TRD frontmatter `objective:` value
 * @param {string} [opts.trd]         embedded TRD frontmatter `trd:` value
 * @returns {string}
 */
function executorPrompt({ planId, repoRoot = '/fixture/repo', base = 'abc1234', extra = '', objective, trd } = {}) {
  const parts = planId ? splitPlanId(planId) : null;
  const fmObjective = objective !== undefined ? objective : (parts ? `${parts.objectiveNum}-fixture-objective` : null);
  const fmTrd = trd !== undefined ? trd : (parts ? parts.trd : null);
  const title = planId || 'fixture';

  const frontmatter = [];
  if (fmObjective !== null || fmTrd !== null) {
    frontmatter.push('---');
    if (fmObjective !== null) frontmatter.push(`objective: ${fmObjective}`);
    if (fmTrd !== null) frontmatter.push(`trd: "${fmTrd}"`);
    frontmatter.push('type: tdd');
    frontmatter.push('wave: 1');
    frontmatter.push('---');
    frontmatter.push('');
  }

  const repoLines = [`REPO_ROOT:  ${repoRoot}`, `WAVE_BASE:  ${base}`];
  if (planId) repoLines.push(`PLAN_ID:    ${planId}`);

  const checkArgs = [`--repo ${repoRoot}`, `--base ${base}`];
  if (planId) checkArgs.push(`--id ${planId}`);

  return [
    '<objective>',
    `Execute plan ${parts ? parts.trd : '??'} of objective ${parts ? parts.objectiveNum : '??'}-fixture-objective.`,
    'Commit each task atomically. Create SUMMARY.md. Update STATE.md and ROADMAP.md.',
    '</objective>',
    '',
    '<plan_content>',
    'The full TRD content is embedded below because you may be running in an isolated',
    'worktree where .planning/ files from the parent tree are not visible.',
    '--- BEGIN TRD ---',
    ...frontmatter,
    `# TRD ${title}: fixture plan`,
    '',
    '<tasks>',
    '<task type="auto"><name>Task 1: do the fixture thing</name></task>',
    '</tasks>',
    '--- END TRD ---',
    '</plan_content>',
    '',
    '<repo_and_base>',
    ...repoLines,
    '',
    'Before anything else, prove you are where you are supposed to be:',
    '',
    `  node ~/.claude/aoforge/bin/aof-tools.cjs exec-context check ${checkArgs.join(' ')}`,
    '',
    'Exit 1 means WRONG REPOSITORY, BASE NOT VISIBLE or SHARED INDEX — all are hard stops.',
    '</repo_and_base>',
    extra,
  ].join('\n');
}

let uuidCounter = 0;
function fixtureUuid(prefix) {
  uuidCounter += 1;
  return `${prefix}-fixture-${String(uuidCounter).padStart(4, '0')}`;
}

/**
 * Write an agent transcript (`agent-fixture.jsonl`) into `dir` and return its path.
 *
 * Record order: `leading` → the first user record (omitted when `firstPrompt`
 * is null) → `trailing` → filler assistant records until at least `padBytes`
 * of filler have been written.
 *
 * A `leading`/`trailing` entry that is a STRING is written verbatim (garbage
 * lines); an object is JSON-serialized.
 *
 * @param {string} dir
 * @param {string|null} firstPrompt
 * @param {object} [opts]
 * @param {boolean} [opts.contentAsArray]  user content as [{type:'text',text}] instead of a string
 * @param {Array<object|string>} [opts.leading]
 * @param {Array<object|string>} [opts.trailing]
 * @param {number} [opts.padBytes]
 * @returns {string}
 */
function writeAgentTranscript(dir, firstPrompt, { contentAsArray = false, leading = [], trailing = [], padBytes = 0 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'agent-fixture.jsonl');
  const lines = [];
  const serialize = (rec) => (typeof rec === 'string' ? rec : JSON.stringify(rec));

  for (const rec of leading) lines.push(serialize(rec));

  if (firstPrompt !== null && firstPrompt !== undefined) {
    const content = contentAsArray
      ? [{ type: 'text', text: firstPrompt }]
      : firstPrompt;
    lines.push(JSON.stringify({
      parentUuid: null,
      isSidechain: true,
      userType: 'external',
      cwd: '/fixture/repo',
      sessionId: 'sess-fixture-0001',
      agentId: 'a1b2',
      type: 'user',
      message: { role: 'user', content },
      uuid: fixtureUuid('u'),
      timestamp: '2026-09-29T00:00:00.000Z',
    }));
  }

  for (const rec of trailing) lines.push(serialize(rec));

  const CHUNK = 64 * 1024;
  let padded = 0;
  while (padded < padBytes) {
    const text = 'f'.repeat(Math.min(CHUNK, padBytes - padded));
    const line = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text }] },
      uuid: fixtureUuid('a'),
    });
    lines.push(line);
    padded += Buffer.byteLength(line, 'utf8') + 1;
  }

  fs.writeFileSync(file, lines.map((l) => `${l}\n`).join(''), 'utf8');
  return file;
}

/** The six summaryText kinds (TRD 66-02). */
const SUMMARY_KINDS = [
  'checkpoint',
  'final_stamped',
  'final_backfill',
  'final_unstamped',
  'final_template_comments',
  'final_input_only',
];

/**
 * The token frontmatter lines of a stamped SUMMARY: the exact serialisation of
 * `token-usage.tokenFrontmatterFields` (invented numbers).
 */
function tokenLines(source) {
  return [
    'tokens_input: 140747',
    'tokens_output: 1370',
    'tokens_cache_read: 121144',
    'tokens_cache_write: 19596',
    'token_model: "claude-opus-5-5"',
    `tokens_source: "${source}"`,
  ];
}

/**
 * Literal SUMMARY text for one fixture kind (TRD 66-02). Hand-built, never
 * generated from a real SUMMARY.
 *
 *   checkpoint              `## Progress` only, no Self-Check, no tokens. Exactly the
 *                           text `makePlanningRepo` has always written.
 *   final_stamped           final (`## Self-Check`), live token fields
 *   final_backfill          final, token fields with `tokens_source: "backfill"`
 *   final_unstamped         final, no token fields
 *   final_template_comments final, only the template's COMMENTED `# tokens_*` lines
 *   final_input_only        final, `tokens_input` but no `tokens_output`
 *
 * @param {string} kind  one of SUMMARY_KINDS
 * @param {string} id    plan id such as `77-02`
 * @returns {string}
 */
function summaryText(kind, id) {
  if (kind === 'checkpoint') {
    return [
      `# TRD ${id} Summary`,
      '',
      '## Progress',
      '',
      '- Task 1: done (abc1234)',
      '- Next: Task 2',
      '',
    ].join('\n');
  }
  if (!SUMMARY_KINDS.includes(kind)) throw new Error(`unknown summary kind: ${kind}`);

  const parts = splitPlanId(id) || { objectiveNum: '0', trd: '00' };
  let tokens;
  switch (kind) {
    case 'final_stamped': tokens = tokenLines('live'); break;
    case 'final_backfill': tokens = tokenLines('backfill'); break;
    case 'final_template_comments': tokens = ['# tokens_input: N', '# tokens_output: N']; break;
    case 'final_input_only': tokens = ['tokens_input: 140747']; break;
    default: tokens = []; // final_unstamped
  }
  return [
    '---',
    `objective: ${parts.objectiveNum}-x`,
    `trd: "${parts.trd}"`,
    'subsystem: fixture',
    ...tokens,
    'completed: 2026-10-08',
    '---',
    '',
    `# TRD ${id} Summary: fixture`,
    '',
    '## Progress',
    '',
    '- [x] Task 1: do the fixture thing - abc1234',
    '',
    '## Self-Check: PASSED',
    '',
  ].join('\n');
}

/**
 * Create an AOForge-shaped fixture project under `root`:
 * `.planning/objectives/<objectiveDir>/<id>-TRD.md` for each `trdIds` entry and
 * `<id>-SUMMARY.md` for each `summaries` entry. By default a SUMMARY carries only
 * a `## Progress` checkpoint (no Self-Check) — the gate must treat that as present
 * and never as unstamped. `summaryKinds` (`{ '77-02': 'final_unstamped' }`) picks
 * another `summaryText` kind per id (TRD 66-02); an id it does not name keeps the
 * checkpoint text, byte for byte.
 *
 * @param {string} root
 * @param {object} [opts]
 * @param {string} [opts.objectiveDir]
 * @param {string[]} [opts.trdIds]
 * @param {string[]} [opts.summaries]
 * @param {Object<string,string>} [opts.summaryKinds]
 * @returns {string} root
 */
function makePlanningRepo(root, { objectiveDir = '77-x', trdIds = ['77-02'], summaries = [], summaryKinds = {} } = {}) {
  const objDir = path.join(root, '.planning', 'objectives', objectiveDir);
  fs.mkdirSync(objDir, { recursive: true });

  for (const id of trdIds) {
    const parts = splitPlanId(id) || { objectiveNum: '0', trd: '00' };
    fs.writeFileSync(
      path.join(objDir, `${id}-TRD.md`),
      [
        '---',
        `objective: ${objectiveDir}`,
        `trd: "${parts.trd}"`,
        'type: tdd',
        '---',
        '',
        `# TRD ${id}: fixture`,
        '',
      ].join('\n'),
      'utf8',
    );
  }

  for (const id of summaries) {
    fs.writeFileSync(
      path.join(objDir, `${id}-SUMMARY.md`),
      summaryText(summaryKinds[id] || 'checkpoint', id),
      'utf8',
    );
  }

  return root;
}

module.exports = {
  subagentStopPayload,
  executorPrompt,
  writeAgentTranscript,
  makePlanningRepo,
  summaryText,
};
