'use strict';

// objective-name.cjs (TRD 61-03, STOR-02) — the one chain that names an objective for GitHub.
//
// The objective issue title (`gh.cjs` readObjectiveState) and the objective PR title (`gh-pr.cjs` objectiveName) both
// call objectiveDisplayName, so the two cannot drift: a fresh store has no ROADMAP entry (the view is generated from
// the issues), and neither title may fall back to the directory name (`01-hello-cli`).
//
// Needs only fs and path. It must not require gh.cjs (large, and lazily required by gh-pr).

const fs = require('fs');
const path = require('path');

/**
 * OBJECTIVE.md's title heading without its `Objective N —|:|-` prefix, or null.
 * `objective add` writes `# Objective N: <description>`; a hand-written file may use a dash or no prefix.
 */
function objectiveHeadingName(objDir) {
  let text;
  try {
    text = fs.readFileSync(path.join(objDir, 'OBJECTIVE.md'), 'utf-8');
  } catch {
    return null;
  }
  const m = /^#\s+(.+?)\s*$/m.exec(text.replace(/^---\n[\s\S]*?\n---\n/, ''));
  if (!m) return null;
  const name = m[1].replace(/^Objective\s+[\d.]+\s*(?:[—–:-]\s*)?/i, '').trim();
  return name || null;
}

/** An objective directory name without its number prefix (`07-store-demo` -> `store-demo`), or null when empty. */
function bareSlug(dirName) {
  if (dirName === null || dirName === undefined) return null;
  const slug = String(dirName).replace(/^[\d.]+-/, '');
  return slug || null;
}

/**
 * The objective's display name: the ROADMAP name, then the OBJECTIVE.md title heading, then the directory slug without
 * its number prefix, then `objective <number>`. Takes plain values (never a project root), so it is pure apart from the
 * OBJECTIVE.md read inside objectiveHeadingName.
 */
function objectiveDisplayName({ roadmapName, objDir, dirName, number } = {}) {
  return roadmapName
    || (objDir ? objectiveHeadingName(objDir) : null)
    || bareSlug(dirName)
    || `objective ${number}`;
}

module.exports = { objectiveHeadingName, bareSlug, objectiveDisplayName };
