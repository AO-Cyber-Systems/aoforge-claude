'use strict';

/**
 * gh-check.cjs — what the two required status checks decide, as pure functions (objective 50, GEN-05).
 *
 * Contexts the ruleset requires (50-09), the runner posts (50-08) and the workflow template names (50-10):
 *   aoforge/linked-issue         every PR to the default branch closes an existing issue
 *   aoforge/planning-consistency an AOForge objective PR closes the whole objective graph
 *
 * Pure module: no gh calls, no git, no fs, no child_process, no process.env. The runner (50-08) fetches the
 * PR, the referenced issues and the commits, hands them in as plain data and posts the returned result as a
 * commit status. Nothing here can reach GitHub, so every rule is unit-testable with hand-written objects.
 * The only dependency allowed here is gh-body.cjs (itself pure), for the `aoforge:id=` / `aoforge:pr=` readers.
 *
 * Result shape of both checks:
 *   { state: 'success' | 'failure', description, details: [string] }
 * `description` is what the commit status shows (GitHub caps it at 140 characters, so it is clipped here);
 * `details` has one named line per finding for the check output.
 *
 * ── aoforge/linked-issue ─────────────────────────────────────────────────────────────────────────────────
 * Passes when the PR body has at least one closing reference (close/closes/closed, fix/fixes/fixed,
 * resolve/resolves/resolved, any case, optional colon, then `#N`, `<owner>/<repo>#N` or an issue URL) to an
 * issue that exists in THIS repository and is not a pull request, AND the PR's base is the default branch.
 *   - Closing keywords only act on a PR merged to the default branch, so any other base cannot link anything.
 *   - A reference aimed at another repository is reported but never counted.
 *   - Text inside fenced code blocks and HTML comments is ignored (it is not rendered as a reference).
 *   - A counted reference that resolves to nothing (404) or to a pull request is a named failure, even beside
 *     a good one: a dead `Closes #N` is almost always a typo, and a green check would hide it.
 *   - `Refs #N` commit paragraphs are reported as `refs_seen` but never required: a human PR has none and a
 *     squash-only history loses them. The closing reference is what links the PR.
 *
 * `issues` is a `Map<number, issue|null>` the runner fills: an issue object (`{number, state, state_reason?,
 * body?, pull_request?}`), `null` for a 404, and absent when the runner never fetched it (also a failure).
 *
 * ── aoforge/planning-consistency (research Open Question 1) ──────────────────────────────────────────────
 * In store mode `.planning/` is NOT in git (migration 0010 ignores it), so a checkout of the PR has no
 * planning files to read and `aof-tools validate consistency` needs the local cache. This check therefore
 * validates the GitHub graph, never files, and nothing in this module reads a path:
 *   (a) Store mode is read from the PR head's tracked `.planning/config.json` (`github.store === true`, handed
 *       in as `config`). Otherwise success "store mode off: planning files are reviewed in the diff". The
 *       check still reports a status, so a required check never hangs waiting for a context that never comes.
 *   (b) No `<!-- aoforge:pr=<id> -->` marker: success "not an AOForge objective PR".
 *   (c) An objective PR must: target the default branch; close the objective issue (the issue whose body
 *       marker is `aoforge:id=<id>`); close every TRD issue linked under the objective (sub-issues, or the
 *       `trds` task list in degraded mode, supplied by the runner as `linked`); and close nothing that was
 *       closed as `not_planned`. Each violation is one named line.
 * The objective issue is looked for among every issue the runner resolved, not only the closing targets, so
 * "the PR forgot to close #100" is named rather than reported as "no objective issue".
 *
 * ── Merge-time reconcile ─────────────────────────────────────────────────────────────────────────────────
 * `reconcilePlan` only lists what a merged PR left open (its closing targets plus the objective's linked
 * TRDs): the runner closes them. Project -> Done is deliberately NOT done here: the GitHub Projects built-in
 * "Item closed" workflow moves closed items, and the GITHUB_TOKEN cannot reach Projects v2. The local
 * `gh pr reconcile` still does the full reconcile including the cache.
 */

const ghBody = require('./gh-body.cjs');

// The one source for the ruleset (50-09), the runner (50-08) and the workflow test (50-10).
const CONTEXTS = Object.freeze({
  linkedIssue: 'aoforge/linked-issue',
  planningConsistency: 'aoforge/planning-consistency',
});

// GitHub's commit-status description limit.
const DESCRIPTION_MAX = 140;

// ─── Small helpers ───────────────────────────────────────────────────────────

function clip(text, max) {
  const s = String(text);
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}

// A failure description: the first finding, with the count of the rest, kept under the status limit.
function summarize(failures) {
  if (failures.length <= 1) return clip(failures[0] || '', DESCRIPTION_MAX);
  const suffix = ` (+${failures.length - 1} more)`;
  return clip(failures[0], DESCRIPTION_MAX - suffix.length) + suffix;
}

function ascending(set) {
  return Array.from(set).sort((a, b) => a - b);
}

// `issues` is a Map; a plain object keyed by number is tolerated. undefined = never resolved, null = 404.
function issueAt(issues, n) {
  if (issues instanceof Map) return issues.get(n);
  if (issues && typeof issues === 'object') return issues[n];
  return undefined;
}

// Every resolved (non-null) issue as [number, issue], in the order supplied.
function resolvedIssues(issues) {
  const entries = issues instanceof Map ? Array.from(issues.entries()) : Object.entries(issues || {});
  return entries.filter(([, issue]) => issue && typeof issue === 'object').map(([n, issue]) => [Number(n), issue]);
}

// The base-branch finding shared by both checks, or null when the PR targets the default branch.
function baseFailure(pr, defaultBranch) {
  if (!defaultBranch) return 'default branch unknown: cannot tell whether the pull request targets it';
  const base = pr && pr.base && typeof pr.base.ref === 'string' ? pr.base.ref : null;
  if (base === defaultBranch) return null;
  return (
    `base branch \`${base === null ? '(none)' : base}\` is not the default branch \`${defaultBranch}\`: ` +
    'closing keywords only act on pull requests to the default branch'
  );
}

// ─── Closing references ──────────────────────────────────────────────────────

// The body with fenced code blocks and HTML comments blanked out, line structure preserved. A comment
// becomes one space so the words either side of it never glue into a keyword. Fences are only recognised at
// the start of a line outside a comment; an unterminated fence or comment runs to the end of the text.
function stripIgnored(body) {
  if (typeof body !== 'string' || body === '') return '';
  const out = [];
  let fence = null; // { ch, len }
  let inComment = false;
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.ch && close[1].length >= fence.len) fence = null;
      out.push('');
      continue;
    }
    if (!inComment) {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      // A backtick fence's info string may not contain a backtick (that is inline code, not a fence).
      if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
        fence = { ch: open[1][0], len: open[1].length };
        out.push('');
        continue;
      }
    }
    let kept = '';
    let rest = line;
    while (rest.length > 0) {
      if (inComment) {
        const end = rest.indexOf('-->');
        if (end === -1) {
          rest = '';
        } else {
          inComment = false;
          kept += ' ';
          rest = rest.slice(end + 3);
        }
      } else {
        const start = rest.indexOf('<!--');
        if (start === -1) {
          kept += rest;
          rest = '';
        } else {
          kept += rest.slice(0, start);
          inComment = true;
          rest = rest.slice(start + 4);
        }
      }
    }
    out.push(kept);
  }
  return out.join('\n');
}

// keyword, optional colon, then one of: issue URL | owner/repo#N | #N. The keyword must start a word
// (so "prefixes #3" and "unclosed #4" do not count) and the number must end one ("#12abc" is no reference).
const NAME = '[A-Za-z0-9_.-]+';
const CLOSING_SOURCE =
  '(?<![A-Za-z0-9_])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?:[ \\t]*:[ \\t]*|[ \\t]+)' +
  `(?:https?://github\\.com/(${NAME}/${NAME})/issues/(\\d+)|(${NAME}/${NAME})#(\\d+)|#(\\d+))(?![A-Za-z0-9_])`;

/**
 * parseClosingRefs(body, repoFullName) — the closing references in a PR body.
 * Returns `{ counted, foreign }`: `counted` are issue numbers of THIS repo in order of first appearance,
 * de-duplicated; `foreign` are `owner/repo#N` strings aimed at other repositories (reported, never counted).
 * `Refs #N`, fenced code and HTML comments contribute nothing.
 */
function parseClosingRefs(body, repoFullName) {
  const text = stripIgnored(body);
  const here = typeof repoFullName === 'string' ? repoFullName.toLowerCase() : null;
  const counted = [];
  const foreign = [];
  const re = new RegExp(CLOSING_SOURCE, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    const qualified = m[1] || m[3] || null;
    const n = parseInt(m[2] || m[4] || m[5], 10);
    if (qualified === null || qualified.toLowerCase() === here) {
      if (!counted.includes(n)) counted.push(n);
    } else {
      const label = `${qualified}#${n}`;
      if (!foreign.some((f) => f.toLowerCase() === label.toLowerCase())) foreign.push(label);
    }
  }
  return { counted, foreign };
}

// ─── Merge queue ─────────────────────────────────────────────────────────────

// `refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>`; <base> may itself contain slashes.
const QUEUE_REF_RE = /^(?:refs\/heads\/)?gh-readonly-queue\/.+\/pr-(\d+)-[^/]+$/;

/**
 * prNumberFromQueueRef(ref) — the PR number a merge-queue branch was built for, or null for anything else.
 * A `merge_group` event has no PR body: the runner re-evaluates the PR named by `merge_group.head_ref`.
 */
function prNumberFromQueueRef(ref) {
  if (typeof ref !== 'string') return null;
  const m = QUEUE_REF_RE.exec(ref);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Commit trailers ─────────────────────────────────────────────────────────

// Message text of a commit given as a string, `{message}` or the REST shape `{commit: {message}}`.
function messageOf(commit) {
  if (typeof commit === 'string') return commit;
  if (commit && typeof commit.message === 'string') return commit.message;
  if (commit && commit.commit && typeof commit.commit.message === 'string') return commit.commit.message;
  return '';
}

// Numbers from commits whose LAST paragraph is exactly `Refs #N` (commit-trailer.cjs writes it; git does not
// parse it as a trailer because the separator is a space). "see Refs #5 in the doc" is not one.
function refsFromCommits(commits) {
  const seen = new Set();
  for (const commit of Array.isArray(commits) ? commits : []) {
    const message = messageOf(commit).replace(/\r\n?/g, '\n').trim();
    if (message === '') continue;
    const paragraphs = message.split(/\n[ \t]*\n/);
    const m = /^Refs #(\d+)$/.exec(paragraphs[paragraphs.length - 1].trim());
    if (m) seen.add(parseInt(m[1], 10));
  }
  return ascending(seen);
}

// ─── aoforge/linked-issue ────────────────────────────────────────────────────

/**
 * linkedIssue({ pr, repo, defaultBranch, issues, commits }) — the `aoforge/linked-issue` verdict.
 * `pr` is the event's pull_request (`{number, body, base: {ref}}`), `repo` is `owner/repo`, `issues` is the
 * Map described in the header and `commits` are the PR's commit messages (strings, `{message}` or REST
 * commits). Returns `{ state, description, details, closing, refs_seen }`: `closing` are the counted
 * references that resolved to issues, `refs_seen` the `Refs #N` numbers found in commit messages.
 */
function linkedIssue({ pr, repo, defaultBranch, issues, commits } = {}) {
  const failures = [];
  const notes = [];
  const { counted, foreign } = parseClosingRefs(pr && pr.body, repo);
  const refs_seen = refsFromCommits(commits);

  const baseProblem = baseFailure(pr, defaultBranch);
  if (baseProblem) failures.push(baseProblem);

  const closing = [];
  if (counted.length === 0) {
    failures.push(`no closing reference (Closes #N) to an issue of ${repo} in the pull request body`);
  }
  for (const n of counted) {
    const issue = issueAt(issues, n);
    if (issue === undefined) {
      failures.push(`#${n} could not be resolved: it was not fetched`);
    } else if (issue === null) {
      failures.push(`#${n} does not exist in ${repo}`);
    } else if (issue.pull_request) {
      failures.push(`#${n} is a pull request, not an issue`);
    } else {
      closing.push(n);
      notes.push(`#${n} is ${issue.state === 'closed' ? 'a closed' : 'an open'} issue closed by this pull request`);
    }
  }
  for (const f of foreign) notes.push(`${f} is in another repository: not counted`);
  if (refs_seen.length > 0) notes.push(`commits reference ${refs_seen.map((n) => `#${n}`).join(', ')} (Refs, not required)`);

  if (failures.length > 0) {
    return { state: 'failure', description: summarize(failures), details: failures.concat(notes), closing, refs_seen };
  }
  return {
    state: 'success',
    description: clip(`Closes ${closing.map((n) => `#${n}`).join(', ')}`, DESCRIPTION_MAX),
    details: notes,
    closing,
    refs_seen,
  };
}

// ─── aoforge/planning-consistency ────────────────────────────────────────────

// Store mode is literally `github.store === true`; a string, a number or a missing block is off.
function storeModeOn(config) {
  return Boolean(config && config.github && config.github.store === true);
}

// Issue numbers from a Set / array / Map of numbers or issue objects, ascending and de-duplicated.
function numbersOf(collection) {
  const items = collection instanceof Map ? Array.from(collection.values()) : Array.from(collection || []);
  const out = new Set();
  for (const item of items) {
    const n = item && typeof item === 'object' ? item.number : item;
    if (Number.isInteger(n)) out.add(n);
  }
  return ascending(out);
}

// The objective issue: the resolved issue whose BODY marker (not a comment-kind marker) is `aoforge:id=<id>`.
// One that the PR closes wins over one it does not, so a stray duplicate cannot hide the real target.
function findObjectiveIssue(issues, id, closes) {
  const candidates = resolvedIssues(issues).filter(([, issue]) => {
    const marker = ghBody.extractMarker(issue.body);
    return marker !== null && marker.kind === null && marker.id === id;
  });
  return candidates.find(([n]) => closes.has(n)) || candidates[0] || null;
}

/**
 * planningConsistency({ pr, repo, defaultBranch, config, issues, linked }) — the `aoforge/planning-consistency`
 * verdict (see the header for the rules and for why no `.planning/` file is consulted). `config` is the parsed
 * `.planning/config.json` of the PR head (or null), `issues` the Map described above and `linked` the TRD issues
 * under the objective as numbers or issue objects (a Set, array or Map). Returns `{ state, description, details }`.
 */
function planningConsistency({ pr, repo, defaultBranch, config, issues, linked } = {}) {
  if (!storeModeOn(config)) {
    return { state: 'success', description: 'store mode off: planning files are reviewed in the diff', details: [] };
  }
  const marker = ghBody.extractPrMarker(pr && pr.body);
  if (!marker) {
    return { state: 'success', description: 'not an AOForge objective PR', details: [] };
  }

  const failures = [];
  const baseProblem = baseFailure(pr, defaultBranch);
  if (baseProblem) failures.push(baseProblem);

  const { counted } = parseClosingRefs(pr.body, repo);
  const closes = new Set(counted);

  const found = findObjectiveIssue(issues, marker.id, closes);
  const objective = found ? found[0] : null;
  if (found === null) {
    failures.push(`objective issue (aoforge:id=${marker.id}) not found: no resolved issue carries that marker`);
  } else if (!closes.has(objective)) {
    failures.push(`objective issue #${objective} (aoforge:id=${marker.id}) is not closed by this pull request`);
  }

  const trds = numbersOf(linked).filter((n) => n !== objective);
  for (const n of trds) {
    if (!closes.has(n)) failures.push(`TRD issue #${n} is linked under objective ${marker.id} but not closed by this pull request`);
  }

  for (const n of counted) {
    const issue = issueAt(issues, n);
    if (issue && issue.state_reason === 'not_planned') {
      failures.push(`#${n} was closed as not planned: merging would not complete it`);
    }
  }

  if (failures.length > 0) {
    return { state: 'failure', description: summarize(failures), details: failures };
  }
  const trdText = trds.length === 0 ? 'no linked TRDs' : `${trds.length} TRD issue${trds.length === 1 ? '' : 's'}`;
  return {
    state: 'success',
    description: clip(`objective ${marker.id}: closes #${objective} and ${trdText}`, DESCRIPTION_MAX),
    details: [`objective issue #${objective} and ${trdText} are closed by this pull request`],
  };
}

// ─── Merge-time reconcile ────────────────────────────────────────────────────

// Issue objects from an array / Set / Map; bare numbers and nulls (a 404) carry no state, so they drop out.
function issueObjects(collection) {
  const items = collection instanceof Map ? Array.from(collection.values()) : Array.from(collection || []);
  return items.filter((item) => item && typeof item === 'object');
}

/**
 * reconcilePlan({ pr, targets, linked }) — the issues a MERGED pull request left open: its closing targets
 * plus the objective's linked TRD issues, as issue numbers, de-duplicated, ascending. `targets` and `linked`
 * are collections of issue objects (`{number, state}`; an array, Set or Map). An unmerged PR yields [].
 * Project -> Done is not part of this plan (see the header).
 */
function reconcilePlan({ pr, targets, linked } = {}) {
  if (!pr || pr.merged !== true) return [];
  const open = new Set();
  for (const issue of issueObjects(targets).concat(issueObjects(linked))) {
    if (issue.pull_request) continue; // a pull request is not closed by closing an issue
    if (String(issue.state).toLowerCase() === 'open' && Number.isInteger(issue.number)) open.add(issue.number);
  }
  return ascending(open);
}

module.exports = {
  CONTEXTS,
  parseClosingRefs,
  prNumberFromQueueRef,
  linkedIssue,
  planningConsistency,
  reconcilePlan,
};
