'use strict';

// gh-milestone.cjs (TRD 46-05, GSF-05) — which GitHub milestone an objective's issue belongs to.
//
// The defect this replaces: the milestone was "the first `vX.Y` anywhere in ROADMAP" (v1.1 in this
// repo, while objective 46 declares `milestone: v1.4`), defaulted to v1.0, and its number was cached
// in the mapping forever. Now, in order:
//   1. the objective's own OBJECTIVE.md `milestone:` — the truth for that objective;
//   2. the ROADMAP `## Milestones` list, via roadmap.getMilestoneInfo (the project's one resolver);
//   3. none — the issue is created without a milestone, with a warning. Never a default.
//
// Pure local I/O: no gh calls. The title -> number cache lives in the mapping (see gh-issue
// ensureMilestone), keyed by title, so a changed milestone is a different key.

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./frontmatter.cjs');
const roadmap = require('./roadmap.cjs');

const NO_MILESTONE_WARNING = 'no milestone resolved; issue created without one';

/**
 * `v1.4` | `1.4` | `"V1.4"` -> `v1.4`. Anything that is not a dotted version (`banana`, `2`, ``) -> null.
 * @param {any} value
 * @returns {string|null}
 */
function normaliseVersion(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/^["']|["']$/g, '').trim();
  if (!/^v?\d+(\.\d+)+$/i.test(s)) return null;
  return `v${s.replace(/^v/i, '')}`;
}

/**
 * Milestone title = prefix + the version without its leading `v` (prefix `v` + `v1.4` -> `v1.4`,
 * prefix `M-` -> `M-1.4`). An unset prefix means the default `v`; an explicit empty string is honoured.
 * @returns {string|null} null when there is no version
 */
function milestoneTitle(prefix, version) {
  const v = normaliseVersion(version);
  if (v === null) return null;
  const p = typeof prefix === 'string' ? prefix : 'v';
  return `${p}${v.replace(/^v/, '')}`;
}

/** The versions named by bullets in the ROADMAP `## Milestones` section, as `vX.Y`. [] when none. */
function milestoneSectionVersions(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Milestones\b/i.test(l));
  if (start < 0) return [];
  const found = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    if (!/^\s*[-*]\s/.test(lines[i])) continue;
    const m = /\bv(\d+(?:\.\d+)+)/.exec(lines[i]);
    if (m) found.push(`v${m[1]}`);
  }
  return found;
}

function readObjectiveMilestone(cwd, objDir) {
  if (!objDir) return { present: false };
  const file = path.join(cwd, '.planning', 'objectives', objDir, 'OBJECTIVE.md');
  let raw;
  try {
    raw = extractFrontmatter(fs.readFileSync(file, 'utf-8')).milestone;
  } catch {
    return { present: false };
  }
  if (raw === undefined || raw === null || raw === '' || typeof raw === 'object') return { present: false };
  return { present: true, raw: String(raw) };
}

/**
 * The milestone for one objective.
 *
 *   resolveObjectiveMilestone(cwd, objDir, prefix)
 *     -> { title, version, source: 'objective' | 'roadmap' | 'none', warning? }
 *
 * `objDir` is the objective directory NAME (null for a ROADMAP-only objective). `warning` is set when
 * nothing resolved, or when an objective `milestone:` value was ignored because it is not a version.
 *
 * getMilestoneInfo falls back to the first `vX.Y` anywhere (then v1.0) when the Milestones list is
 * missing or unparseable, which is exactly the defect GSF-05 removes. So it is consulted only when the
 * `## Milestones` section has a versioned bullet, and its answer is accepted only if that section names
 * it.
 */
function resolveObjectiveMilestone(cwd, objDir, prefix) {
  let warning;

  const own = readObjectiveMilestone(cwd, objDir);
  if (own.present) {
    const version = normaliseVersion(own.raw);
    if (version) return { title: milestoneTitle(prefix, version), version, source: 'objective' };
    warning = `OBJECTIVE.md milestone "${own.raw}" is not a version; ignored`;
  }

  let text = null;
  try {
    text = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
  } catch {
    text = null;
  }
  if (text !== null) {
    const listed = milestoneSectionVersions(text);
    if (listed.length > 0) {
      const info = roadmap.getMilestoneInfo(cwd);
      const version = info ? normaliseVersion(info.version) : null;
      if (version && listed.includes(version)) {
        const out = { title: milestoneTitle(prefix, version), version, source: 'roadmap' };
        if (warning) out.warning = warning;
        return out;
      }
    }
  }

  return {
    title: null,
    version: null,
    source: 'none',
    warning: warning ? `${warning}; ${NO_MILESTONE_WARNING}` : NO_MILESTONE_WARNING,
  };
}

module.exports = {
  normaliseVersion,
  milestoneTitle,
  resolveObjectiveMilestone,
};
