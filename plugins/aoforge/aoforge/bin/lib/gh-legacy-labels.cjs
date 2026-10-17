'use strict';

// gh-legacy-labels.cjs (TRD 78-09, objective 78, SC-2) — is this repository rebranded?
//
// 3.0.0 (TRD 72-11) listed a DEFAULT label (`aoforge:objective`, `aoforge:trd`, ...) together with its pre-rename
// twin and merged the two lists by issue number, so a repository not yet rebranded kept working. 3.1.0 removed the
// twins: every lookup lists the AOForge label only. In a repository whose issues still carry the old labels that
// lookup would find nothing, and mirror sync and the outbox would create every issue a second time. So before a
// lookup by a default label its caller asks here, and this module sends one `GET repos/{repo}/labels/{twin}`:
//   200          -> the twin exists: the lookup is refused, and the message names `aof-tools gh rebrand --apply`;
//   404          -> the twin is absent: the lookup proceeds;
//   anything else (5xx, rate limit, no answer) -> an error, never "absent"; the caller fails its lookup the way it
//                   fails a list it could not read.
// A definitive answer is cached per repository and label for the process (`clearCache` is for tests: a process
// that saw the twin keeps refusing until it exits, which is what a rebrand in progress wants).
//
// A detector, not a reader: it never lists, reads or writes an issue under the old label. Only a DEFAULT label has a
// twin; a label configured in `github.labels.*` is used as configured and is never checked (72-11's rule). `gh
// rebrand` (gh-rebrand.cjs) never calls it: it reads the old labels to rename them.

const { NAMES, LEGACY } = require('./legacy-names.cjs');
const ghClient = require('./gh-client.cjs');

const LABEL_PREFIX = `${NAMES.markerNs}:`;
const LEGACY_LABEL_PREFIX = `${LEGACY.markerNs}:`;
const MIGRATION_GUIDE = 'docs/MIGRATING-TO-AOFORGE.md, "Repositories with GitHub integration"';

// `${repo}\n${twin}` -> true (the twin exists) | false (404). Errors are never stored.
const answers = new Map();

/** legacyTwin(label) — the pre-rename twin of an AOForge-namespace label (`aoforge:trd` -> the old `:trd`), else null. */
function legacyTwin(label) {
  if (typeof label !== 'string' || !label.startsWith(LABEL_PREFIX) || label.length === LABEL_PREFIX.length) return null;
  return LEGACY_LABEL_PREFIX + label.slice(LABEL_PREFIX.length);
}

const textOf = (r) => `${(r && r.stderr) || ''}\n${(r && r.stdout) || ''}\n${(r && r.error) || ''}`;

/** The HTTP status `gh api` prints on failure (`gh: Not Found (HTTP 404)`), or null. */
function httpStatus(r) {
  const m = /HTTP (\d{3})/.exec(textOf(r));
  return m ? Number(m[1]) : null;
}

/** The refusal: the repository still has the twin, so a lookup by `label` alone would miss its issues. */
function refusal(repo, twin, label) {
  return `${repo} still has the pre-rename label "${twin}", which AOForge no longer reads, so it will not look issues `
    + `up by "${label}" alone: run \`aof-tools gh rebrand --apply\` (${MIGRATION_GUIDE}), then retry`;
}

/**
 * checkRebranded({ repo, label, defaultLabel, client }) — may a lookup by `label` list that one label?
 *
 *   -> { ok:true }                                    not a default label, no twin, or the twin is absent (404)
 *    | { ok:false, kind:'legacy-namespace', error }   the twin exists: refuse the lookup
 *    | { ok:false, kind:'error', error, r }           the GET got no definitive answer; `r` is the raw gh result
 *
 * `client` is the read seam: an object with `ghRead(args)` (default: gh-client) or the read function itself.
 */
function checkRebranded({ repo, label, defaultLabel, client } = {}) {
  if (label !== defaultLabel) return { ok: true };
  const twin = legacyTwin(label);
  if (twin === null) return { ok: true };
  const key = `${repo}\n${twin}`;
  if (!answers.has(key)) {
    const read = typeof client === 'function' ? client : (client || ghClient).ghRead;
    const r = read(['api', `repos/${repo}/labels/${encodeURIComponent(twin)}`]);
    if (r && r.ok) answers.set(key, true);
    else if (httpStatus(r) === 404) answers.set(key, false);
    else {
      const detail = String((r && (r.error || r.stderr || r.stdout)) || 'no answer').trim();
      return { ok: false, kind: 'error', error: `could not tell whether ${repo} still has the pre-rename label "${twin}": ${detail}`, r };
    }
  }
  return answers.get(key) ? { ok: false, kind: 'legacy-namespace', error: refusal(repo, twin, label) } : { ok: true };
}

/** Forget every cached answer. Tests only: production code never clears it. */
function clearCache() {
  answers.clear();
}

module.exports = { legacyTwin, checkRebranded, clearCache };
