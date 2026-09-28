---
quick: 22
type: tdd
files_modified:
  - plugins/devflow/devflow/bin/lib/stack-profile.cjs
  - plugins/devflow/devflow/bin/lib/stack-profile.test.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-progress.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs
  - CHANGELOG.md
---

# Quick 22: close the two CodeQL alerts that are new in PR #114

These are the alerts the PR's new code introduced. The other 19 regex-injection/escaping alerts are pre-existing on `main`; CodeQL re-flagged them only because the diff moved their line numbers. They stay out of scope here.

<task type="tdd">
<name>1. mergeFrontmatter refuses prototype keys (js/prototype-pollution-utility, stack-profile.cjs:219)</name>
<files>plugins/devflow/devflow/bin/lib/stack-profile.test.cjs, plugins/devflow/devflow/bin/lib/stack-profile.cjs</files>
<action>
RED: add tests that build layers carrying `__proto__` (via `JSON.parse('{"__proto__":{"polluted":1}}')` so it is an own key), `constructor`, and `prototype`, nested and at top level. Merge them through the exported path that calls mergeFrontmatter; if that function is not exported, use the loader over a temp STACK.md. Assert:
- `({}).polluted === undefined` after the merge;
- the merged result has no own property with any of those names;
- provenance has no entry whose path contains them;
- normal sibling keys still merge.

Commit the test only.

GREEN: in mergeFrontmatter, `continue` on key ∈ {`__proto__`,`constructor`,`prototype`} before any assignment. Commit.
</action>
<verify>node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs</verify>
<done>The new tests fail on RED and pass on GREEN; the existing stack-profile tests are unchanged and green.</done>
</task>

<task type="tdd">
<name>2. roadmap-progress escapes objective numbers fully (js/regex-injection, roadmap-progress.cjs:81,169)</name>
<files>plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs, plugins/devflow/devflow/bin/lib/roadmap-progress.cjs</files>
<action>
RED: create or extend `roadmap-progress.test.cjs`. Call the functions at lines ~81 (progress-row update) and ~169 (updateJobsLine) with objectiveNum `"1+"`, `"("` and `"4.1"`. The functions are exported? Check `module.exports`. Assert:
- no throw;
- `"1+"` does not update the row or header for objective 1 or 11;
- `"4.1"` still matches only `4.1` and not `401`.

Commit the test only.

GREEN: add a local `escapeRegExp(s)` (`s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`, matching objective.cjs:921) and use it at both sites in place of `.replace('.', '\\.')`. Commit.
</action>
<verify>node --test plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs</verify>
<done>The new tests fail on RED and pass on GREEN.</done>
</task>

<task>
<name>3. CHANGELOG + full suite</name>
<files>CHANGELOG.md</files>
<action>Add a `### Fixed` bullet under `## [2.11.0]`; this ships in 2.11.0, which is not tagged on main yet. Then run `npm test` and compare with the baseline: 4268 tests, 4235 pass, 1 fail (MA-7), 32 skipped. Commit.</action>
<verify>npm test</verify>
<done>The only failure is MA-7, and the test count has risen only by the tests added here.</done>
</task>
