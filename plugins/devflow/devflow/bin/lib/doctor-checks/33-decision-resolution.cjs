'use strict';

// Doctor check: decision-resolution (TRD 53-06, item 53-8).
//
// Before objective 52 the frontmatter writer flattened a multi-line decision answer: it wrote the lines raw, so the
// parse lost everything after the first line (and, past an inner `---`, `resolved_at` too). The answer is still on
// disk, so `decision-repair` recovers it from the text between the `resolution:` and `resolved_at:` lines. This
// check scans `.planning/decisions/resolved/DECISION-NNN.md`, classifies each file with decision-repair, and:
//
//   repairable     → warn; `doctor --fix` rewrites `resolution` as a `|-` block scalar holding the full answer
//   unrecoverable  → warn; report-only, with the hand-fix instruction (nothing in the file bounds the answer)
//   intact         → never reported, never rewritten (a one-line answer, DECISION-002's trailing blank line, a block)
//
// Store mode (github.store) makes the file a cache of GitHub, so there the check is report-only: repairing the
// cache would be overwritten by the next `gh pull --all`, and the source of truth is the GitHub copy.
//
// The fix is a working-tree edit, not an index change: no staged-changes guard is needed, and the doctor never
// commits. It re-scans (the files may have moved since run()), takes `upgrade.backup` of the project's `.planning/`
// first, then writes each file atomically, and only when its bytes still match what was classified.

const fs = require('fs');
const path = require('path');

const upgrade = require('../upgrade.cjs');
const planningMode = require('../planning-mode.cjs');
const { classifyDecision, repairDecision } = require('../decision-repair.cjs');

const RESOLVED_REL = '.planning/decisions/resolved';
const DECISION_FILE_RE = /^DECISION-\d+\.md$/;
const HAND_FIX = 'write `resolution: |-` followed by the answer lines, each indented two spaces';
const COMMIT_COMMAND = 'node ~/.claude/devflow/bin/df-tools.cjs commit "fix: repair flattened decision resolution" --files';
const GH_PULL_COMMAND = 'node ~/.claude/devflow/bin/df-tools.cjs gh pull --all';

/** Every `DECISION-NNN.md` in resolved/, classified. Sorted by file name; a missing directory is no decisions. */
function scan(root) {
  const dir = path.join(root, ...RESOLVED_REL.split('/'));
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return [];
    throw e;
  }
  return names
    .filter((name) => DECISION_FILE_RE.test(name))
    .sort()
    .map((name) => {
      const abs = path.join(dir, name);
      const base = { id: name.slice(0, -'.md'.length), rel: `${RESOLVED_REL}/${name}`, abs };
      let text;
      try {
        text = fs.readFileSync(abs, 'utf-8');
      } catch (e) {
        return { ...base, state: 'unrecoverable', reason: `unreadable: ${e && e.message ? e.message : String(e)}` };
      }
      const c = classifyDecision(text);
      return { ...base, text, state: c.state, reason: c.reason };
    });
}

const idList = (files) => files.map((f) => f.id).join(', ');

function run(ctx) {
  const root = ctx.projectRoot;
  if (!root) return { severity: 'ok', finding: 'no project: no resolved decisions to check', fixable: false };

  const found = scan(root);
  const repairable = found.filter((f) => f.state === 'repairable');
  const stuck = found.filter((f) => f.state === 'unrecoverable');

  if (repairable.length === 0 && stuck.length === 0) {
    const finding = found.length === 0
      ? 'no resolved decisions to check'
      : `${found.length} resolved decision(s) checked: every resolution is intact`;
    return { severity: 'ok', finding, fixable: false };
  }

  const store = planningMode.isStoreMode(root);
  const parts = [];
  if (repairable.length) {
    parts.push(
      `${repairable.length} resolved decision(s) lost their full answer to the pre-52 one-line writer but it is recoverable from the file: ${idList(repairable)}`
    );
  }
  if (stuck.length) {
    parts.push(
      `${stuck.length} cannot be recovered from the file: ${idList(stuck)}. Hand fix: ${HAND_FIX}`
    );
  }
  if (store) {
    parts.push(
      'store mode is on, so the repair is a hand fix: .planning/ is a cache of GitHub and the next `gh pull --all` would overwrite an edit made only here. Correct the answer in the decision\'s GitHub copy, then refresh the cache'
    );
  }

  const result = {
    severity: 'warn',
    finding: parts.join('; '),
    fixable: repairable.length > 0 && !store,
    details: {
      checked: found.length,
      decisions: [...repairable, ...stuck].map(({ id, state, reason }) => (reason ? { id, state, reason } : { id, state })),
    },
  };
  if (store) result.fix_command = GH_PULL_COMMAND;
  return result;
}

/** Write `text` to `abs` through a temp file in the same directory, keeping the file's mode. */
function writeAtomic(abs, text) {
  const dir = path.dirname(abs);
  const tmp = path.join(dir, `.${path.basename(abs)}.${process.pid}.tmp`);
  const mode = fs.statSync(abs).mode & 0o777;
  try {
    fs.writeFileSync(tmp, text, 'utf-8');
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, abs);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // the temp file may never have been created
    }
    throw e;
  }
}

function fix(ctx) {
  const root = ctx.projectRoot;
  if (!root) return { applied: false, refused: 'no project' };
  if (planningMode.isStoreMode(root)) {
    return {
      applied: false,
      refused: 'store mode: .planning/ is a cache of GitHub, so a decision repair is a hand fix on the GitHub copy',
    };
  }

  // Re-discover: the files may have moved since run().
  const todo = scan(root).filter((f) => f.state === 'repairable');
  if (todo.length === 0) return { applied: false, notes: 'nothing to fix: no repairable decision found' };

  // 1. Back up first (the project's .planning/ and CLAUDE.md, outside the repo).
  const backup = upgrade.backup({ projectRoot: root, userHome: ctx.userHome, now: ctx.now });

  // 2. Rewrite each file, only when it still holds the bytes that were classified and the rebuild verifies.
  const changed = [];
  const skipped = [];
  for (const f of todo) {
    if (fs.readFileSync(f.abs, 'utf-8') !== f.text) {
      skipped.push(`${f.id} changed while the fix ran`);
      continue;
    }
    const repaired = repairDecision(f.text);
    if (!repaired.ok) {
      skipped.push(`${f.id} (${repaired.reason})`);
      continue;
    }
    writeAtomic(f.abs, repaired.text);
    changed.push(f.rel);
  }

  const notes = [];
  if (changed.length) {
    notes.push(`repaired: ${changed.join(', ')}`);
    notes.push(`review the diff, then commit with: ${COMMIT_COMMAND} ${changed.join(' ')}`);
  }
  if (skipped.length) notes.push(`left unchanged: ${skipped.join('; ')}`);

  if (changed.length === 0) {
    return { applied: false, refused: 'no repairable decision could be rewritten safely', backup, notes: notes.join('; ') };
  }
  return { applied: true, changed, backup, notes: notes.join('; ') };
}

module.exports = {
  id: 'decision-resolution',
  title: 'Resolved decisions keep their full answer',
  scope: 'project',
  run,
  fix,
};
