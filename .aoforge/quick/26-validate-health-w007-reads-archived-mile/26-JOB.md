---
objective: quick-26
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/validate.cjs
  - plugins/devflow/devflow/bin/lib/validate.test.cjs
  - CHANGELOG.md
autonomous: true
must_haves:
  truths:
    - "validate health on this repo emits no W007 for objectives 00-41"
    - "An objective dir listed in neither ROADMAP.md nor any .planning/milestones/*-ROADMAP.md still gets W007"
    - "W006 and W001/W005 behaviour is unchanged (W006 still reads only ROADMAP.md headings)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/validate.cjs
      provides: "W007 known-objective set = ROADMAP.md + milestones/*-ROADMAP.md, headings + checklist/bullet lines"
    - path: plugins/devflow/devflow/bin/lib/validate.test.cjs
      provides: "describe('Check 8: W007 archived roadmaps') cases"
  key_links:
    - from: "validate.cjs Check 8"
      to: ".planning/milestones/*-ROADMAP.md"
      via: "readdirSync(milestonesDir) filter /-ROADMAP\\.md$/"
---

# Quick 26: W007 reads archived milestone roadmaps

## Objective

W007 ("Objective NN exists on disk but not in ROADMAP.md") fires for objectives 00–41 on this repo.
Two causes, both confirmed by reading the files:

1. Objectives 00–39 are listed only in archived roadmaps `.planning/milestones/v1.2-ROADMAP.md`
   (uses `### Objective N:` headings) and `v1.3-ROADMAP.md` (uses collapsed checklist lines
   `- [x] Objective 27: ...`). Check 8 never reads `.planning/milestones/`.
2. Even ROADMAP.md itself lists 40/41 as checklist lines (`- [x] Objective 40: ...`, lines 70–71)
   and 26 as a bold bullet (`- **Objective 26: GitHub ...**`, line 158). The Check 8 regex
   `/#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi` only matches headings.

Fix W007 only: build a separate `w007KnownObjectives` set = heading matches from ROADMAP.md
(existing `roadmapObjectives`) ∪ list-line matches from ROADMAP.md ∪ heading + list-line matches from
every `.planning/milestones/*-ROADMAP.md`. W006 keeps using `roadmapObjectives` unchanged.

## Context

- Intent: `(plugin, bugfix)` → strict TDD; failing test first.
- Code: `plugins/devflow/devflow/bin/lib/validate.cjs` Check 8, ~lines 355–391. `roadmapPath` defined at ~line 188;
  `planningDir` in scope. Check 2 (~line 278) already builds `milestonesDir = path.join(planningDir, 'milestones')` — reuse the same path expression.
- Tests: `plugins/devflow/devflow/bin/lib/validate.test.cjs`. Follow the `describe('objective 38 — W002 + live fix text')`
  block (~line 1000): mkdtemp fixture, `makeHome()`, `runHealth(tmpProject, { homeDir: tmpHome, mainVersionFn: () => null }, false)`,
  filter `json.warnings` by `code`. Shared `afterEach` cleans `tmpProject`/`tmpHome` — assign to those globals.
- Constraints: hand-built fixtures (no generated data), no property-based libs, no Gherkin. Temp dirs only. Never port 8080.
- Commits via `node plugins/devflow/devflow/bin/df-tools.cjs commit "..." --files ...` (raw git commit is gated).

## Test list (W007, outermost = runHealth JSON)

1. Dir `27-x` on disk, ROADMAP.md has no mention, `milestones/v1.3-ROADMAP.md` has `- [x] Objective 27: Foo (3/3 plans)` → no W007 for 27.
2. Dir `05-y` on disk, `milestones/v1.2-ROADMAP.md` has `### Objective 5: Bar` → no W007 for 05 (unpadded match).
3. Dir `40-z` on disk, ROADMAP.md itself has `- [x] Objective 40: Baz` (checklist, no heading) → no W007.
4. Dir `26-w` on disk, ROADMAP.md has `- **Objective 26: Qux** — moved` → no W007.
5. Dir `99-orphan` on disk, absent from ROADMAP.md and all archives → exactly one W007 naming 99.
6. Prose mention only (`**Depends on:** Objective 99` / `candidates: Objective 99 (`) does NOT count → W007 still fires for 99.
7. W006 unchanged: ROADMAP.md contains only `- [x] Objective 7: Old` (checklist) with no `07-*` dir → no W006 for 7
   (list lines must not feed W006).
8. Non-roadmap files in milestones/ (e.g. `v1.3-MILESTONE-AUDIT.md` containing `### Objective 99:`) are ignored → W007 still fires for 99.

Each test writes a minimal `.planning/ROADMAP.md` (W007 only runs when it exists).

<tasks>

<task type="auto" tdd="true">
  <name>RED: W007 archived-roadmap tests</name>
  <files>plugins/devflow/devflow/bin/lib/validate.test.cjs</files>
  <action>
Add `describe('Check 8: W007 reads archived milestone roadmaps', ...)` after the objective-38 block.
Local helper `makeRoadmapFixture({ dirs, roadmap, archives })` where `archives` is `{ 'v1.3-ROADMAP.md': '...' }`
written under `.planning/milestones/`. Implement test list cases 1–8 with `const w007s = (j) => j.warnings.filter(w => w.code === 'W007')`.
Assert on messages with `/Objective 99\b/` etc. Run the file; cases 1–4 must fail (5–8 may already pass — that is fine,
they are regression guards). Commit: `test(validate): W007 ignores archived milestone roadmaps`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` → cases 1–4 fail, rest of file passes.</verify>
  <done>Failing tests committed.</done>
</task>

<task type="auto" tdd="true">
  <name>GREEN: widen W007 known-objective set</name>
  <files>plugins/devflow/devflow/bin/lib/validate.cjs, CHANGELOG.md</files>
  <action>
In Check 8, after `roadmapObjectives` is built:

```js
// W007 only: an objective is "known" if any roadmap lists it — current or archived — as a heading
// or as a checklist/bullet line. W006 keeps reading ROADMAP.md headings only.
const listPattern = /^\s*-\s*(?:\[[ xX]\]\s*)?\*{0,2}Objective\s+(\d+(?:\.\d+)?)\s*:/gim;
const collect = (text, set) => {
  for (const re of [/#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi, listPattern]) {
    re.lastIndex = 0; let mm;
    while ((mm = re.exec(text)) !== null) set.add(mm[1]);
  }
};
const w007Known = new Set(roadmapObjectives);
collect(roadmapContent, w007Known);
try {
  const milestonesDir = path.join(planningDir, 'milestones');
  for (const f of fs.readdirSync(milestonesDir)) {
    if (!/-ROADMAP\.md$/.test(f)) continue;
    try { collect(fs.readFileSync(path.join(milestonesDir, f), 'utf-8'), w007Known); } catch {}
  }
} catch {}
```

Then change the W007 loop to test `w007Known` (both `p` and `unpadded`) instead of `roadmapObjectives`.
Normalise: also check `String(parseInt(p,10)).padStart(2,'0')` is not needed — disk has padded, set has unpadded; existing
`unpadded` check covers it. Keep message text unchanged. Do not touch W006, W001, W005.

# GOTCHA: regexes with /g are stateful — construct inside `collect` or reset `lastIndex` (shown above).
# GOTCHA: anchored `^\s*-` keeps prose like "**Depends on:** Objective 23" and "candidates: Objective 26 (" from counting.

CHANGELOG.md `## [Unreleased]`: add under `### Fixed` (create the subsection after `### Added` if absent):
`- **\`validate health\` W007 no longer flags archived objectives.** It now also reads
  \`.planning/milestones/*-ROADMAP.md\` and counts checklist/bullet lines (\`- [x] Objective 27: …\`), not only
  \`### Objective N:\` headings. W006 is unchanged.`

Commit: `fix(validate): W007 reads archived milestone roadmaps and checklist lines`.
  </action>
  <verify>
- `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` all pass.
- `npm test` passes.
- `node plugins/devflow/devflow/bin/df-tools.cjs validate health | grep -c '"W007"'` → 0 on this repo
  (00–39 from archives, 40/41 from ROADMAP.md checklist, 26 from ROADMAP.md bold bullet, 42–45 from headings).
  If any W007 remains, confirm that objective genuinely appears in no roadmap before accepting it.
  </verify>
  <done>No W007 for 00–41 on this repo; orphan dirs still warn; W006 unaffected; CHANGELOG Fixed entry present.</done>
</task>

</tasks>

<validation_gates>
- `npm test`
- `node plugins/devflow/devflow/bin/df-tools.cjs validate health`
</validation_gates>

## Success criteria

- Test list cases 1–8 pass; full suite green.
- Live `validate health` on this repo reports zero W007 for 00–41.
- W006/W001/W005 logic untouched (diff confined to W007 set construction + loop).
