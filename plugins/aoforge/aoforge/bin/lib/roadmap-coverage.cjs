'use strict';

// `aof-tools validate roadmap-coverage` (TRD 76-04): the roadmapper's coverage check as code.
// Every v1 requirement in REQUIREMENTS.md must map to exactly one ROADMAP.md objective
// (`**Requirements**:` or `**Requirements:**` line). The roadmapper used to build this map by hand in its own tokens.
//
// Read-only. Exit 1 when a v1 requirement is unmapped or mapped twice, so a caller can gate on it.

const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');
const { planningRoot } = require('./compat.cjs');
const { boldLabelPattern } = require('./text-escape.cjs');

const DEFINITION_RE = /^- \[[ xX]\] \*\*([A-Z][A-Z0-9]*-\d+[a-z]?)\*\*/gm;
const ID_RE = /\b[A-Z][A-Z0-9]*-\d+[a-z]?\b/g;
// `## ` sections whose definitions are not in v1 scope.
const NON_V1_SECTION = /v2|out of scope|traceability|future|deferred|later/i;
const OBJECTIVE_HEADING = /^#{2,4}\s+Objective\s+(\d+(?:\.\d+)?)\b/;
// `**Requirements**:` (the roadmapper's template) or `**Requirements:**` (objective add's style).
const REQUIREMENTS_LINE = new RegExp(`^${boldLabelPattern('Requirements')}`);

function read(file) {
  try { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); } catch { return null; }
}

/** v1 requirement ids: definitions under every `## ` section that is not v2, out of scope or traceability. */
function v1Requirements(text) {
  const ids = [];
  let inScope = true;
  for (const line of text.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) inScope = !NON_V1_SECTION.test(h[1]);
    if (!inScope) continue;
    DEFINITION_RE.lastIndex = 0;
    const m = DEFINITION_RE.exec(line);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** id -> [objective numbers] from each objective section's `**Requirements**:` line. */
function roadmapMapping(text) {
  const map = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const h = line.match(OBJECTIVE_HEADING);
    if (h) { current = h[1]; continue; }
    if (!current || !REQUIREMENTS_LINE.test(line)) continue;
    // Ids sit before any trailing note; cut at the first comment opener rather than strip comments.
    for (const id of line.split('<!--')[0].match(ID_RE) || []) {
      const list = map.get(id) || [];
      if (!list.includes(current)) list.push(current);
      map.set(id, list);
    }
  }
  return map;
}

function coverage(cwd) {
  const root = planningRoot(cwd);
  const reqText = read(path.join(root, 'REQUIREMENTS.md'));
  const roadmapText = read(path.join(root, 'ROADMAP.md'));
  const missing = [];
  if (reqText === null) missing.push('REQUIREMENTS.md');
  if (roadmapText === null) missing.push('ROADMAP.md');
  if (missing.length) return { ok: false, missing };

  const v1 = v1Requirements(reqText);
  const mapping = roadmapMapping(roadmapText);
  const orphans = v1.filter((id) => !mapping.has(id));
  const duplicates = v1.filter((id) => (mapping.get(id) || []).length > 1)
    .map((id) => ({ id, objectives: mapping.get(id) }));
  const defined = new Set();
  DEFINITION_RE.lastIndex = 0;
  for (const m of reqText.matchAll(DEFINITION_RE)) defined.add(m[1]);
  const unknown = [...mapping.keys()].filter((id) => !defined.has(id)).sort()
    .map((id) => ({ id, objectives: mapping.get(id) }));
  const mapped = v1.length - orphans.length;
  return {
    ok: orphans.length === 0 && duplicates.length === 0,
    v1_total: v1.length,
    mapped,
    coverage: `${mapped}/${v1.length}`,
    orphans,
    duplicates,
    unknown,
  };
}

function cmdValidateRoadmapCoverage(cwd, raw) {
  const r = coverage(cwd);
  const lines = r.missing
    ? [`missing: ${r.missing.join(', ')}`]
    : [
      `Coverage: ${r.coverage} v1 requirements mapped${r.ok ? ' ✓' : ''}`,
      ...r.orphans.map((id) => `orphan: ${id} (no objective)`),
      ...r.duplicates.map((d) => `duplicate: ${d.id} -> objectives ${d.objectives.join(', ')}`),
      ...r.unknown.map((u) => `unknown: ${u.id} (objective ${u.objectives.join(', ')} names an id REQUIREMENTS.md does not define)`),
    ];
  if (!r.ok) {
    process.stdout.write(raw ? `${lines.join('\n')}\n` : `${JSON.stringify(r, null, 2)}\n`);
    process.exit(1);
  }
  output(r, raw, lines.join('\n'));
}

module.exports = { v1Requirements, roadmapMapping, coverage, cmdValidateRoadmapCoverage };
