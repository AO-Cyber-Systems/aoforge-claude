'use strict';

/**
 * legacy-gh-fixtures.cjs (objective 72, TRD 72-11) — the GitHub artefacts a store-mode repository carries until it is
 * rebranded: issue and PR bodies, comments and labels in the old marker namespace, and the old managed caller workflow.
 *
 *   legacyIssueBody({ id: '46' })                      // old id line, one old begin/end section, a human's text below
 *   legacyIssueBody({ id: '46', sections: { summary: 'S', footer: 'F' } })
 *   legacyComment({ id: '46', kind: 'state', parts: ['**State**'] })   // -> [{ id, body }], one comment
 *   legacyComment({ id: '7-01', kind: 'summary', parts: ['<file line>\nA', 'B'] })   // two numbered parts
 *   legacyPrBody({ objective: '49', closes: [100, 101] })
 *   legacyCaller({ sha: 'abc...' })                    // the old .github/workflows caller, pinned to `sha`
 *   legacyTrdBody({ id: '7-01', file: '07-01-alpha-TRD.md', text })
 *   legacyEntityBody({ id: 'todo-2026-07-31-a', file: 'todos/pending/2026-07-31-a.md', text })
 *   legacyReconcileComment({ closed: [2, 3] })         // what the old check runner left on a merged PR
 *   legacyPrTemplate()                                 // the old managed block of .github/pull_request_template.md
 *   labelPages({ kind: 'objective', aoforge: [1, 3], legacy: [2, 3] })
 *
 * Every shape is copied from what the old writers produced (gh-body.cjs, gh-trd.cjs, gh-check-cli.cjs, gh-setup.cjs and
 * templates/github before the rename commit), with only the namespace changed back. Nothing is generated from the new
 * writers: a fixture built by the code under test would agree with it by construction.
 *
 * labelPages returns, for one label kind:
 *   labels  { aoforge: 'aoforge:<kind>', legacy: 'devflow:<kind>' }
 *   issues  [{ number, title, body, labels: [names], state: 'OPEN' }] ascending by number, ready for a fake's seedIssue.
 *           An issue under the legacy label only gets a legacy body; one under the AOForge label (alone or with the
 *           legacy one) gets an AOForge body. Its marker id is its number.
 *   pages   { [label]: [REST issue] }, what `GET repos/o/r/issues?labels=<label>&state=all` answers (one page).
 *
 * Legacy names may be spelled here: this is one of the `__fixtures__/legacy-*` files the rename codemod and the rename
 * guard leave alone. Every value is a hand-written literal.
 */

const OLD = 'devflow';
const NEW = 'aoforge';

/** A begin/end pair in the old namespace, exactly as the old gh-body renderBlock wrote it. */
function oldBlock(name, content) {
  return `<!-- ${OLD}:begin ${name} -->\n${content}\n<!-- ${OLD}:end ${name} -->`;
}

/** The text a human typed below the managed sections. Tests compare it byte for byte. */
const HUMAN_TEXT = 'Notes a person typed under the managed sections.\nKeep these two lines exactly.\n';

/**
 * legacyIssueBody({ id, sections }) — an objective issue body as the old plugin wrote it: the old id line, the old
 * begin/end sections in the order given (default one `summary` section), a blank line, then HUMAN_TEXT.
 */
function legacyIssueBody({ id = '46', sections = { summary: '**Objective 46: Store demo**' } } = {}) {
  const blocks = Object.entries(sections).map(([name, content]) => oldBlock(name, content));
  return `<!-- ${OLD}:id=${id} -->\n${blocks.join('\n\n')}\n\n${HUMAN_TEXT}`;
}

/**
 * legacyComment({ id, kind, parts }) — the comments of one old marked comment, `[{ id, body }]`. One part is one
 * comment (marker line, then the text). Several parts are numbered the old way: marker line, `<!-- devflow:part=i/n -->`,
 * then the part's text. Comment ids start at `firstId` (default 9100).
 */
function legacyComment({ id = '46', kind = 'state', parts = ['**State**'], firstId = 9100 } = {}) {
  const marker = `<!-- ${OLD}:id=${id} kind=${kind} -->`;
  if (parts.length === 1) return [{ id: firstId, body: `${marker}\n${parts[0]}` }];
  return parts.map((text, i) => ({
    id: firstId + i,
    body: `${marker}\n<!-- ${OLD}:part=${i + 1}/${parts.length} -->\n${text}`,
  }));
}

/** legacyPrBody({ objective, closes }) — an objective PR body with the old PR marker and old sections. */
function legacyPrBody({ objective = '49', closes = [100, 101] } = {}) {
  const closing = closes.map((n) => `Closes #${n}`).join('\n');
  return [
    `<!-- ${OLD}:pr=${objective} -->`,
    oldBlock('closes', closing),
    '',
    oldBlock('summary', 'TRDs complete 1/2'),
    '',
  ].join('\n');
}

/** legacyTrdBody({ id, file, text }) — a TRD issue body: the old id line, the old file line, then the TRD text. */
function legacyTrdBody({ id = '7-01', file = '07-01-alpha-TRD.md', text = '# TRD 07-01 alpha\n\nDo the thing.\n' } = {}) {
  return `<!-- ${OLD}:id=${id} -->\n<!-- ${OLD}:file=${file} -->\n${text}`;
}

/** legacyEntityBody({ id, file, text }) — a todo / debug / quick issue body in the old namespace. */
function legacyEntityBody({ id = 'todo-2026-07-31-a', file = 'todos/pending/2026-07-31-a.md', text = '# A todo\n' } = {}) {
  return `<!-- ${OLD}:id=${id} -->\n<!-- ${OLD}:file=${file} -->\n${text}`;
}

/** legacyReconcileComment({ closed }) — the one comment the old check runner posted on a merged PR. */
function legacyReconcileComment({ closed = [2, 3] } = {}) {
  return `${[`<!-- ${OLD}:reconcile -->`, 'Closed after the merge (they were still open):', '', ...closed.map((n) => `- #${n}`)].join('\n')}\n`;
}

/** legacyPrTemplate() — `.github/pull_request_template.md` as the old `gh setup` wrote it, with a line a team added. */
function legacyPrTemplate() {
  return [
    'Team checklist: link the design doc.',
    '',
    `<!-- ${OLD}:pr-template:start -->`,
    '## Summary',
    '',
    'Closes #',
    `<!-- ${OLD}:pr-template:end -->`,
    '',
  ].join('\n');
}

/**
 * legacyCaller({ sha }) — `.github/workflows/devflow.yml` as the old `gh setup --apply` rendered it from
 * templates/github/devflow.yml: the old managed header, the old repository slug and reusable-workflow file name on the
 * `uses:` line, and the old ref input, all pinned to `sha`.
 */
function legacyCaller({ sha = '0123456789abcdef0123456789abcdef01234567' } = {}) {
  return [
    `# ${OLD}:managed — written by df-tools gh setup; edits are overwritten`,
    '#',
    "# Runs DevFlow's required checks (devflow/linked-issue, devflow/planning-consistency) on every",
    '# pull request and in the merge queue, and closes anything a merge left open. The logic lives in',
    '# the reusable workflow named on the `uses:` line below; this file only wires the triggers.',
    '#',
    '# There are no path or branch filters here, on purpose: a required check that a filter stops from',
    '# running never reports a status, and the merge then waits on it forever. `merge_group` is',
    '# required for the same reason - a merge queue only merges after its entry reports the checks.',
    '#',
    '# The App variable and secret are optional. When they are unset the checks run on the workflow\'s',
    '# own token, which the permissions below are sized for.',
    'name: DevFlow',
    '',
    'on:',
    '  pull_request:',
    '    types: [opened, edited, synchronize, reopened, ready_for_review, closed]',
    '  merge_group:',
    '',
    'permissions:',
    '  contents: read',
    '  pull-requests: read',
    '  issues: write',
    '  statuses: write',
    '',
    'jobs:',
    '  devflow:',
    `    uses: AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@${sha}`,
    '    with:',
    `      devflow-ref: ${sha}`,
    '      app-client-id: ${{ vars.DEVFLOW_APP_CLIENT_ID }}',
    '    secrets:',
    '      app-private-key: ${{ secrets.DEVFLOW_APP_PRIVATE_KEY }}',
    '',
  ].join('\n');
}

/** The AOForge-namespace body of an objective issue `n` (what AOForge writes today), for the label-union fixtures. */
function aoforgeIssueBody(n) {
  return `<!-- ${NEW}:id=${n} -->\n<!-- ${NEW}:begin summary -->\n**Objective ${n}**\n<!-- ${NEW}:end summary -->\n`;
}

/**
 * labelPages({ kind, aoforge, legacy }) — issues listed under the AOForge label (`aoforge`, issue numbers) and the
 * legacy label (`legacy`, issue numbers) of one kind. See the header for the result.
 */
function labelPages({ kind = 'objective', aoforge = [], legacy = [] } = {}) {
  const labels = { aoforge: `${NEW}:${kind}`, legacy: `${OLD}:${kind}` };
  const numbers = [...new Set([...aoforge, ...legacy])].sort((a, b) => a - b);
  const issues = numbers.map((number) => {
    const names = [];
    if (aoforge.includes(number)) names.push(labels.aoforge);
    if (legacy.includes(number)) names.push(labels.legacy);
    const onlyLegacy = !aoforge.includes(number);
    return {
      number,
      title: `[Objective ${number}] issue ${number}`,
      body: onlyLegacy ? legacyIssueBody({ id: String(number) }) : aoforgeIssueBody(number),
      labels: names,
      state: 'OPEN',
    };
  });
  const rest = (issue) => ({
    id: 1000000 + issue.number,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: 'open',
    labels: issue.labels.map((name) => ({ name })),
  });
  const pages = {
    [labels.aoforge]: issues.filter((i) => i.labels.includes(labels.aoforge)).map(rest),
    [labels.legacy]: issues.filter((i) => i.labels.includes(labels.legacy)).map(rest),
  };
  return { labels, issues, pages };
}

module.exports = {
  HUMAN_TEXT,
  legacyIssueBody,
  legacyComment,
  legacyPrBody,
  legacyTrdBody,
  legacyEntityBody,
  legacyReconcileComment,
  legacyPrTemplate,
  legacyCaller,
  labelPages,
};
