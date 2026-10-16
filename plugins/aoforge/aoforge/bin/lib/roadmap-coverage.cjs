'use strict';

// `aof-tools validate roadmap-coverage` (TRD 76-04): the roadmapper's coverage check as code.
// Every v1 requirement in REQUIREMENTS.md must map to exactly one ROADMAP.md objective. The roadmapper used to build
// this map by hand in its own tokens.
//
// One parser (quick 36): the ROADMAP side reads ids only through requirement-ids.cjs `roadmapRequirementIds`, one
// objective section at a time, with { objective } — the same call `verify trd-pre` and `objective complete` make. So a
// `- **Requirements**: API-01` line, a label followed by bullet lines and `none (tech debt; ...)` mean the same here as
// there. A section opens at an `## `/`### `/`#### Objective N` heading of level L and closes at the next heading of
// level <= L; deeper headings stay inside, and text after a closed section (a `## Progress` table) belongs to no
// objective. The REQUIREMENTS side builds its definition regex from the exported REQUIREMENT_ID_SRC, so both sides
// accept the same id shapes.
//
// Read-only. Exit 1 when a v1 requirement is unmapped or mapped twice, or when REQUIREMENTS.md defines no v1
// requirement at all, so a caller can gate on it.

const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');
const { planningRoot } = require('./compat.cjs');
const { roadmapRequirementIds, REQUIREMENT_ID_SRC } = require('./requirement-ids.cjs');

const DEFINITION_RE = new RegExp(`^- \\[[ xX]\\] \\*\\*(${REQUIREMENT_ID_SRC})\\*\\*`, 'gm');
// A `## ` section is out of v1 scope only when its heading text STARTS with a later version (v2, v3, v10) or one of
// these words. `## Integrations (OAuth v2)` is a v1 section.
const NON_V1_SECTION = /^(?:v(?:[2-9]|[1-9]\d+)\b|out of scope\b|traceability\b|future\b|deferred\b|later\b)/i;
const HEADING = /^(#{1,6})\s/;
const OBJECTIVE_HEADING = /^(#{2,4})\s+Objective\s+(\d+(?:\.\d+)?)\b/;
const NO_V1_REASON = 'no v1 requirements found in REQUIREMENTS.md';

function read(file) {
  try { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); } catch { return null; }
}

/** v1 requirement ids: definitions under every `## ` section whose heading does not start out of v1 scope. */
function v1Requirements(text) {
  const ids = [];
  let inScope = true;
  for (const line of text.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) inScope = !NON_V1_SECTION.test(h[1].trim());
    if (!inScope) continue;
    DEFINITION_RE.lastIndex = 0;
    const m = DEFINITION_RE.exec(line);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/**
 * The objective sections of a ROADMAP: `[{ objective, level, text }]`. A section runs from its heading to the next
 * heading of the same or a higher level (fewer `#`); a deeper heading stays inside it.
 */
function objectiveSections(text) {
  const sections = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = HEADING.exec(line);
    if (h) {
      const o = OBJECTIVE_HEADING.exec(line);
      if (cur && (o || h[1].length <= cur.level)) {
        sections.push(cur);
        cur = null;
      }
      if (o) {
        cur = { objective: o[2], level: o[1].length, lines: [line] };
        continue;
      }
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) sections.push(cur);
  return sections.map((s) => ({ objective: s.objective, level: s.level, text: `${s.lines.join('\n')}\n` }));
}

/** id -> [objective numbers], from each objective section through the shared `roadmapRequirementIds`. */
function roadmapMapping(text) {
  const map = new Map();
  for (const { objective, text: section } of objectiveSections(text)) {
    for (const id of roadmapRequirementIds(section, { objective }).ids) {
      const list = map.get(id) || [];
      if (!list.includes(objective)) list.push(objective);
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
  if (v1.length === 0) {
    // An empty or headings-only REQUIREMENTS.md is not "full coverage": nothing was checked.
    return { ok: false, v1_total: 0, mapped: 0, coverage: '0/0', reason: NO_V1_REASON, orphans, duplicates, unknown };
  }
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
  const unknownLines = (r.unknown || [])
    .map((u) => `unknown: ${u.id} (objective ${u.objectives.join(', ')} names an id REQUIREMENTS.md does not define)`);
  let lines;
  if (r.missing) lines = [`missing: ${r.missing.join(', ')}`];
  else if (r.reason) lines = [`Coverage: ${r.reason}`, ...unknownLines];
  else {
    lines = [
      `Coverage: ${r.coverage} v1 requirements mapped${r.ok ? ' ✓' : ''}`,
      ...r.orphans.map((id) => `orphan: ${id} (no objective)`),
      ...r.duplicates.map((d) => `duplicate: ${d.id} -> objectives ${d.objectives.join(', ')}`),
      ...unknownLines,
    ];
  }
  if (!r.ok) {
    process.stdout.write(raw ? `${lines.join('\n')}\n` : `${JSON.stringify(r, null, 2)}\n`);
    process.exit(1);
  }
  output(r, raw, `${lines.join('\n')}\n`);
}

module.exports = { v1Requirements, objectiveSections, roadmapMapping, coverage, cmdValidateRoadmapCoverage };
