'use strict';

// stack-draft.cjs — assemble a grounded STACK.md draft from areas + evidence (TRD 42-07).
//
// assembleDraft({ areas, evidence, tierCommands, verify, extendsId }) ->
//   { extendsId, components, commands, loop?, notes, sources, resolvedKeys, inheritedKeys }
//
// PURE: no fs, no process, no require of stack-profile.cjs. `verify(command, cwd)` is injected
// (stack-profile.draftProfile passes stack-verify.verifyCommand); `tierCommands` maps a profile id
// to its RESOLVED commands (general + its extends chain).
//
// Extends and components (research_context step 2; TRD 43-05, D3 literal rule). A language area is
// one with `kinds`; it is SUPPORTED when its profile (`area.profile`, else `area.tier`) is a real
// tier, not `general`. The root manifest decides the root extends:
//   a supported area at the root -> extends that tier
//   no supported area at the root -> extends general (even with ONE supported sub-area: it is never
//                                    promoted to the root extends)
// Every supported area that is not at the root is a component `{ path: 'D/', profile: <tier id> }`.
// Unsupported areas are never components; they are notes. `stack init` never writes a component
// profile file, so a command that belongs to a NON-primary component is a NOTE, not a root command.
//
// Primary component (TRD 43-05, D6). A `general` root with 1+ components picks one primary component
// (`pickPrimaryComponent`): a component whose CI steps go through its task runner to serve build, test
// or lint first (TRD 43-06, 43-10), then the one holding the most build/test/lint evidence, then the
// most runner + CI evidence of any key, ties broken go > flutter > dart > other, then the shallower
// path, then the lexical one. A `general` root that builds itself in a stack no component
// has (a root build that is not only an image build) is a product: its components are sidecars and there
// is no primary (tag `root_product`, TRD 43-06). A root-invoked attachable key (e2e, lint_helm,
// lint_docker) is a root candidate wherever its script lives. It is recorded in an info note tagged
// `primary_component`. A tier root has no primary component and behaves exactly as before.
//
// Which items may fill a ROOT key (TRD 42-15, D3; TRD 43-05, D6; TRD 43-10). In a `general` root with a
// primary component a key's candidates are taken by TIER, the first tier that supplies the key winning:
//   (1) recipes of a task-runner file at the repo root (a declared row too), wherever their body runs;
//   (2) targets of the primary component's own runner file, each keeping its own `cwd` whatever its body
//       does (`make build` in `go/` is `{ run: make build, cwd: go }`; a `cd .. && buf generate` target
//       keeps cwd `go`);
//   (3) the other candidates whose body RUNS (stack-evidence `effectiveArea`) at the root: CI, docs,
//       manifest, and a root-invoked attachable key;
//   (4) the primary component's other candidates (its CI and docs steps).
// A tier none of whose candidates resolves falls through to the next, and only when every tier is spent
// does a key that had candidates end as `discover`. A root CI candidate that the primary's runner target
// shadows is a `shadowed` note, with an `image_build` detail when it is only a container image build. A
// root runner recipe that runs in a primary-less workspace, and a root without a primary, are the next
// paragraph and the rule above. A root or runner candidate whose tool stack belongs ONLY to a non-primary
// component (`flutter build` beside a go primary) is an `off_primary` note, whatever its tier. With
// exactly ONE component, root build/test/lint also fall back to that component's tier defaults with `cwd`
// = the component dir when nothing else supplied them. One running in another component is summarised
// per (area, key) as a component note unless it equals the tier default; one running in an unsupported
// sub-area is a `sub_area` note per (area, key), for every key.
//
// Workspace root (TRD 43-10). A `general` root whose ROOT task runner has a build/test/lint recipe that
// runs in two or more areas (stack-evidence `unitAreas`) is a workspace: the runner is the repo's
// interface, so there is no primary component (an info note tagged `root_workspace`), no off_primary
// gate and no single-component fallback, and every root-runner recipe (tier 1), then the other root
// candidates (tier 3), supply the root keys. Component and sub-area notes still apply to everything else.
// Root-override policy: for a key the extends profile supplies with a runnable run, only a root
// candidate whose body runs a tool of the tier's stack family (stack-classify.TIER_STACKS, via
// `bodyScopes` / `bodyStacks`) at the root may override it; others are `off_stack` notes and the
// profile default applies. A chosen mixed body is noted `mixed_stack`. Keys the profile does not
// supply, and extends general, are not gated.
//
// Per key, candidates are ranked, first difference wins (the tie-break rule, stable otherwise):
//   1. source      declared > runner > ci > manifest > docs > detected
//   2. confidence  high > low
//   3. weak        non-weak > weak
// For `e2e_env` alone, a scenario-named target (stack-evidence `scenarioNamed`) ranks right after the
// source, ahead of confidence: `make e2e-stack-up` beats a generic `make infra-up` (TRD 43-04).
// Only check/build/mutate forms fill `run`; an apply form fills `apply`. Walking the ranked run
// candidates: one EQUAL to the tier default's run (or whose runner body is) stops the walk and
// the key stays inherited, unless it is a task-runner target named for the key (TRD 43-12: `make lint`
// running exactly `go vet ./...` is the repo's declared entry point, so it is verified and kept like any
// other candidate). Narrowed on the fleet (declaredTarget): its WHOLE body must be the default (no
// prerequisite, no further invocation) and its name must not restate the default's own command word
// (`build:` running `go build ./...` is a shorthand and stays inherited). Otherwise the first candidate
// `verify` calls `resolved` is the run.
// Candidates that failed before it are notes. None resolved but candidates existed ->
// `run: discover`. A `${{ }}` command is `unverifiable` without asking `verify`.
//
// Wrapper scripts (TRD 43-12). The GOVERNING tier entry is the primary component's tier for a primary
// candidate and the root's extends tier for a root one. A script candidate (runner `script`) whose name
// is NOT the key's (canonicalName) and whose body runs the governing default's run, redirections aside
// (`govulncheck ./... > "$OUT" 2>&1` inside `govulncheck-gate.sh`), is a wrapper around that default: it
// stops the walk like an equal candidate and is a `wrapper` note. In the primary component the key takes
// the tier default with the script's cwd; at the root the key stays inherited. A key-named script
// (`audit.sh`) is the repo's own entry point and is never reduced.
//
// Special keys: gosec (`sast`) collapses into `audit` when no audit candidate exists anywhere.
// A `maestro` e2e candidate survives only when some area carries the `maestro` flag (a .maestro/
// dir), which also contributes `maestro test .maestro`. codegen/deps keep a `when`. A
// re-emitted command run by the SAME tool as the tier default keeps the tier's scoped/apply forms.

//
// Canonical runner targets (TRD 42-13, widened in 43-06). Right after the source rank, for EVERY key,
// the name rank: a target or script named for the key (`build`, `fmt` for format, `generate` for
// codegen, with any form suffix: `lint-fix`, `fmt-check`) > a raw command with no name > any other name
// (`deps-frontend`, `build-deps.sh`). The name is a runner item's `target.name`, else the target or
// script a CI / docs step goes through (`invokedName`). For build/test/lint runner targets the order
// then continues: the runner's default target > a target others depend on > fewer `:` segments > no
// VARIANT_TOKENS token; then confidence and weak as above, then source order within the same runner
// file (never the alphabet). When a runner target wins build/test/lint, every other resolved runner
// candidate for the key is an `alternate` note.
//
// codegen (TRD 43-06): when a codegen candidate is a drift check (check form), the generators (mutate)
// are its apply, so `make openapi-verify` is the run and `make openapi-regen` the apply.
//
// Mixed aggregates (TRD 43-11). Before ranking a single-purpose key K (not build/test/lint, not e2e/e2e_env:
// WHOLE_ENTRY_KEYS), a candidate whose units run K AND other keys (stack-evidence `unitKeys`) is a
// `mixed_aggregate` note while a PURE candidate for K exists (unitKeys exactly [K], or none). `generate: proto
// sqlc gen-sdk`, which also runs `dart pub get` and `dart analyze`, loses codegen to `make proto`; a one-shot
// `task init` that also tidies loses deps to the CI install line. With no pure candidate nothing changes.
//
// Partial drift checks (TRD 43-11). R5 above holds only for a check of the GENERATOR: G = the best-ranked
// codegen generator, and a check whose writer (stack-evidence `driftWriter`) is one of G's legs (`target.legs`)
// rather than G itself is a `partial_check` note; it neither fills run nor turns G into apply.
//
// Environment teardown and reset (TRD 43-11). For e2e_env and e2e, a candidate whose target or invoked name
// tears the scenario environment down or resets it (stack-classify envRole: `e2e-stack-down`, `e2e-db-reset`)
// is an `env_teardown` / `env_reset` note, before the env_unnamed rule. A declared row is the user's own.
//
// Repo-wide test (TRD 42-13). For `test`, a candidate is NARROW when some invocation it runs
// (`bodyInvocations`) is narrow by stack-classify.testBreadth and none is broad. Narrow candidates
// never fill `test`: each becomes a `narrow` note under the key it fits (test / integration / e2e;
// notes only, never a new key). With no broad candidate left the key is inherited from a runnable
// parent test, else `discover`. A chosen test whose breadth cannot be read is kept and noted
// `breadth-unknown`.
//
// Command cwd hygiene (TRD 42-14). An item whose `cwdStatus` is ignored / untracked / nested_repo /
// external is never a candidate: it is a `cwd_<status>` note. A `missing` cwd stays a candidate
// that verifies as `cwd_missing` (never inherited there), so it ends as `discover` + a note like any
// other unresolved candidate. Items without a cwdStatus are treated as ok.

const { classifyInvocation, testBreadth, toolStack, envRole, TIER_STACKS, NEUTRAL_STACK } = require('./stack-classify.cjs');

const SOURCE_RANK = Object.freeze({ declared: 0, runner: 1, ci: 2, manifest: 3, docs: 4, detected: 5 });
const CANONICAL_KEYS = new Set(['build', 'test', 'lint']);
/** Name tokens that mark a target as a variant of the canonical one (a platform, a mode, a helper). */
const VARIANT_TOKENS = Object.freeze([
  'internal', 'quickdev', 'dev', 'preview', 'debug', 'local', 'macos', 'windows', 'linux', 'darwin', 'arm64', 'amd64',
]);
const ATTACHABLE_KEYS = new Set(['e2e', 'lint_helm', 'lint_docker']);
/**
 * Keys whose entry point runs a whole workflow by design, so a body that also runs other keys is not a
 * mixed aggregate (TRD 43-11): build/test/lint (the canonical entry points, TRD 42-13) and the scenario
 * keys (an e2e wrapper or an environment bring-up orchestrates, TRD 43-04 D4).
 */
const WHOLE_ENTRY_KEYS = new Set([...CANONICAL_KEYS, 'e2e', 'e2e_env']);
const WHEN_DEFAULT = Object.freeze({ codegen: 'sources_changed', deps: 'deps_changed' });
const LOOP_KEYS = ['format', 'lint', 'test'];
const RUN_FORMS = new Set(['check', 'build', 'mutate']);
const GH_EXPR = /\$\{\{/;
const MAESTRO_COMMAND = 'maestro test .maestro';
/** Why an item's cwd (stack-evidence `cwdStatus`) keeps it out of placement (TRD 42-14). */
const CWD_REASON = Object.freeze({
  ignored: 'is gitignored',
  untracked: 'holds no tracked file',
  nested_repo: 'is inside a nested git repository',
  external: "is another repository's checkout in CI, not this repo",
});

const runnable = (run) => typeof run === 'string' && run !== '' && run !== 'discover' && run !== 'none';
const squash = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
const trimDir = (d) => (d ? String(d).replace(/\/+$/, '') : '');
const profileOf = (a) => (a && (a.profile || a.tier)) || null;

function unique(list) {
  const out = [];
  for (const x of list) if (x && !out.includes(x)) out.push(x);
  return out;
}

/**
 * The names a target or script carries when it IS the key's entry point (TRD 43-06): the key itself,
 * else its conventional spelling. A form suffix is ignored (`lint-fix`, `fmt-check`, `tidy-check`), so
 * the check and apply halves of a pair are both canonical for their form.
 */
const KEY_NAMES = Object.freeze({ format: ['format', 'fmt'], codegen: ['codegen', 'generate', 'gen'] });
const FORM_SUFFIX_TOKENS = new Set(['check', 'verify', 'diff', 'fix', 'write', 'apply']);
const nameTokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function canonicalName(name, key) {
  const tokens = nameTokens(name);
  const core = tokens.filter((t) => !FORM_SUFFIX_TOKENS.has(t));
  const joined = (core.length ? core : tokens).join('-');
  return (KEY_NAMES[key] || [key]).some((n) => nameTokens(n).join('-') === joined);
}

/**
 * canonicalOf(item, key) -> the canonical tuple (see the header). Element 0 is the NAME rank, for every
 * key (TRD 43-06): a name that is the key's (canonicalName) 0, no name at all (a raw command) 1, any
 * other name (`deps-frontend`, `build-deps.sh`) 2. The name is the runner target's, else the target or
 * script a CI / docs step goes through (stack-evidence `invokedName`). For build/test/lint runner
 * targets the rest of the TRD 42-13 tuple follows; elsewhere it is neutral.
 */
function canonicalOf(item, key) {
  const t = item.target && typeof item.target.name === 'string' ? item.target : null;
  const name = t ? t.name : (typeof item.invokedName === 'string' && item.invokedName ? item.invokedName : null);
  if (!name) return [1, 0, 0, 0, 0];
  const nameRank = canonicalName(name, key) ? 0 : 2;
  if (!t || !CANONICAL_KEYS.has(key)) return [nameRank, 0, 0, 0, 0];
  const tokens = nameTokens(t.name);
  return [
    nameRank,
    t.isDefault === true && item.key === key ? 0 : 1,
    t.dependedOn === true ? 0 : 1,
    t.name.split(':').filter(Boolean).length,
    tokens.some((x) => VARIANT_TOKENS.includes(x)) ? 1 : 0,
  ];
}

/**
 * For e2e_env only (TRD 43-04, D4): a target whose NAME carries the scenario and environment tokens
 * (stack-evidence `scenarioNamed`, `make e2e-stack-up`) is that scenario's environment; a target with
 * only a bring-up body (`make infra-up` running `docker compose up`) is some environment. The name
 * outranks the body here, though a name alone is low confidence. Neutral for every other key.
 */
const scenarioNamedOf = (item, key) => (key === 'e2e_env' && item.scenarioNamed !== true ? 1 : 0);

function rankOf(item, key) {
  const s = SOURCE_RANK[item.source];
  return [
    s === undefined ? 9 : s,
    scenarioNamedOf(item, key),
    ...canonicalOf(item, key),
    item.confidence === 'low' ? 1 : 0,
    item.weak && item.weak.length ? 1 : 0,
  ];
}

/** Two targets of the same runner file compare by their position in it; anything else ties. */
function sourceOrder(a, b) {
  if (!a.target || !b.target || a.sourceFile !== b.sourceFile) return 0;
  return (a.target.order || 0) - (b.target.order || 0);
}

/** Stable ranking by (source, canonical target tuple, confidence, weak, source order). */
function rank(items, key) {
  return items
    .map((item, i) => ({ item, i, r: rankOf(item, key) }))
    .sort((a, b) => {
      for (let k = 0; k < a.r.length; k++) if (a.r[k] !== b.r[k]) return a.r[k] - b.r[k];
      return sourceOrder(a.item, b.item) || a.i - b.i;
    })
    .map((x) => x.item);
}

/**
 * breadthOf(item) -> { breadth: 'broad'|'narrow'|'unknown', reason?, fitsKey?, detail? }. Judged
 * over every invocation the item runs; any broad one makes it broad, else the first narrow one
 * decides; nothing recognisable is `unknown` (treated as broad by the caller). A single-purpose
 * script (stack-evidence `singlePurpose`: `check-*`, `verify-*`, `*_test.sh`) is narrow before any
 * invocation is read, whatever its body looks like (TRD 43-04, D4). The flag is computed in
 * stack-evidence; this module reads it and never looks at a script name.
 */
function breadthOf(item) {
  if (item.singlePurpose === true) {
    return { breadth: 'narrow', reason: 'single-purpose script', fitsKey: 'test', detail: 'single-purpose script' };
  }
  const invs = Array.isArray(item.bodyInvocations) && item.bodyInvocations.length
    ? item.bodyInvocations
    : [item.command, item.resolvesTo].filter(Boolean);
  const judged = invs.map((inv) => testBreadth(inv)).filter(Boolean);
  if (judged.some((j) => j.breadth === 'broad')) return { breadth: 'broad' };
  return judged.find((j) => j.breadth === 'narrow') || { breadth: 'unknown' };
}

/** The candidate IS the tier default: same text, or a runner target whose body is that text. */
function equivalent(item, parentRun) {
  if (!runnable(parentRun)) return false;
  const p = squash(parentRun);
  return squash(item.command) === p || (item.resolvesTo != null && squash(item.resolvesTo) === p);
}

/** The runner target or script a candidate goes through (`target.name`, else stack-evidence `invokedName`), or null. */
function nameOf(item) {
  if (item.target && typeof item.target.name === 'string') return item.target.name;
  return typeof item.invokedName === 'string' && item.invokedName ? item.invokedName : null;
}

// A shell redirection word (`>/dev/null`, `2>&1`, `&>log`, `<in`): it changes where output goes, not what runs.
const REDIRECTION = /^(?:\d*|&)(?:>>?|<)/;
// A redirection operator written apart from its target (`> "$OUT"`): the next word is that target (TRD 43-12).
const REDIRECTION_OPERATOR = /^(?:\d*|&)(?:>>?|<)$/;

/** bare(s) -> the invocation with every redirection (and a detached redirection target) removed, squashed. */
function bare(s) {
  const words = squash(s).split(' ');
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;
    if (REDIRECTION.test(w)) {
      if (REDIRECTION_OPERATOR.test(w)) i += 1;
      continue;
    }
    out.push(w);
  }
  return out.join(' ');
}

/**
 * writesAs(writer, item) -> true when a drift check's writer (stack-evidence `driftWriter`) IS `item`: the
 * writer is item's target, or the writer invocation is one its body runs, redirections aside (TRD 43-11).
 */
function writesAs(writer, item) {
  if (!writer || !item) return false;
  if (writer.target) return !!item.target && item.target.name === writer.target;
  if (!writer.invocation) return false;
  const want = bare(writer.invocation);
  const body = Array.isArray(item.bodyInvocations) && item.bodyInvocations.length
    ? item.bodyInvocations
    : [item.command, item.resolvesTo].filter(Boolean);
  return body.some((b) => bare(b) === want);
}

/**
 * restatesCommand(name, run) -> true when a target's name (form suffix aside) is the default run's own
 * tool or subcommand word: `build:` running `go build ./...`, `test:` running `flutter test`. Such a target
 * is a shorthand for that command, not an interface over it (TRD 43-12, fleet narrowing).
 */
function restatesCommand(name, run) {
  const words = bare(run).split(' ');
  const tool = words[0] ? words[0].split('/').pop() : '';
  const sub = words[1] && /^[A-Za-z][A-Za-z0-9_-]*$/.test(words[1]) ? words[1] : '';
  const core = nameTokens(name).filter((t) => !FORM_SUFFIX_TOKENS.has(t)).join('-');
  return [tool, sub].filter(Boolean).some((w) => nameTokens(w).join('-') === core);
}

/**
 * declaredTarget(item, key, defaultRun) -> true for the repo's declared entry point of `key`, kept even
 * though it equals the tier default (TRD 43-12): a task-runner target named for the key (`make lint`)
 *   - whose WHOLE body is the default: no prerequisite, every invocation the default run, redirections
 *     aside. A target that runs the default AND more (`go vet ./...` then `buf lint`, or a `portal-build`
 *     prerequisite) is still judged by its first invocation (42-07's resolvesTo) and stays inherited;
 *   - whose name does not restate the default's own command word (restatesCommand: `build:` running
 *     `go build ./...` is a shorthand for that command). `lint:` running `go vet ./...` names an interface
 *     the repo owns, where a stronger linter is added later.
 * Both narrowings were made on the fleet: the reviewed files inherit in each case they exclude.
 */
function declaredTarget(item, key, defaultRun) {
  const t = item.target;
  if (!t || typeof t.name !== 'string' || !TASK_RUNNERS.has(item.runner) || !canonicalName(t.name, key)) return false;
  if (!runnable(defaultRun) || (Array.isArray(t.deps) && t.deps.length)) return false;
  const want = bare(defaultRun);
  const body = Array.isArray(item.bodyInvocations) && item.bodyInvocations.length
    ? item.bodyInvocations
    : [item.resolvesTo].filter(Boolean);
  if (!body.length || !body.every((b) => bare(b) === want)) return false;
  return !restatesCommand(t.name, defaultRun);
}

/**
 * wraps(item, key, defaultRun) -> true when `item` is a script NOT named for `key` whose body runs
 * `defaultRun`, redirections aside: a wrapper around the tier default, not a command of its own (TRD 43-12).
 */
function wraps(item, key, defaultRun) {
  if (!runnable(defaultRun) || item.runner !== 'script') return false;
  const name = nameOf(item);
  if (name && canonicalName(name, key)) return false;
  const want = bare(defaultRun);
  const body = Array.isArray(item.bodyInvocations) ? item.bodyInvocations : [];
  return body.some((b) => bare(b) === want);
}

/** Same key and same tool as the tier default's run, and not behind a task runner. */
function sameTool(item, key, parentRun) {
  if (!runnable(parentRun) || item.runner) return false;
  const c = classifyInvocation(parentRun);
  return !!(c && c.key === key && item.tool && c.tool === item.tool);
}

/** Where an item's body runs (stack-evidence `effectiveArea`); its own area when absent. */
function effectiveAreaOf(item) {
  return typeof item.effectiveArea === 'string' ? item.effectiveArea : item.area || '';
}

/**
 * scopesOf(item) -> [{ stack, area }]: the stacks an item's body runs and where (stack-evidence
 * `bodyScopes`, else `bodyStacks` at its effectiveArea). An item built without either (a caller
 * that predates 42-15) is read through stack-classify.toolStack over its body, command and tool.
 */
function scopesOf(item) {
  if (Array.isArray(item.bodyScopes) && item.bodyScopes.length) return item.bodyScopes;
  const area = effectiveAreaOf(item);
  const stacks = Array.isArray(item.bodyStacks)
    ? item.bodyStacks
    : unique([item.resolvesTo, item.command, item.tool].map((x) => (x ? toolStack(String(x)) : null)));
  return stacks.filter(Boolean).map((stack) => ({ stack, area }));
}

/** The toolStack of container image tools (stack-classify TOOL_STACKS.docker). */
const IMAGE_STACK = 'docker';

/** True when every stack an item's body runs is the container image stack (`docker build -t x .`). */
function imageBuildOnly(item) {
  const stacks = unique(scopesOf(item).map((s) => s.stack));
  return stacks.length > 0 && stacks.every((s) => s === IMAGE_STACK);
}

/**
 * Heuristic (user decision 2026-10-02): the primary-component tie-break is go-first. The 5 multi-stack
 * fleet goldens (aocore, aodex, politihub, eden-biz, navigators) all build their product from a Go
 * component, so on equal evidence a go component is the primary, then flutter, then dart, then any
 * other tier. It is a heuristic, untested on the rest of the fleet. The names live here, next to
 * TIER_STACKS' consumers, and never in stack-profile.cjs (P11).
 */
const PRIMARY_ORDER = Object.freeze(['go', 'flutter', 'dart']);

const depthOf = (p) => String(p).split('/').filter(Boolean).length;

/** Task runners whose TARGETS a CI step can call (stack-verify describeInvocation `runner`); a script file is not one. */
const TASK_RUNNERS = new Set(['make', 'task', 'just', 'npm']);

/** An evidence item that is a target or recipe of a task-runner file (not a CI step, a doc or a script). */
const isRunnerItem = (e) => e.source === 'runner' && TASK_RUNNERS.has(e.runner);
/** The item's runner file sits at the repository root (`Makefile`, `justfile`, `Taskfile.yml`). */
const atRepoRoot = (e) => typeof e.sourceFile === 'string' && e.sourceFile !== '' && !e.sourceFile.includes('/');

/**
 * pickPrimaryComponent(components, items) -> { path, profile, score, canonical, viaRunner } | null
 *
 * The evidence that names a repository's build interface is its build, test and lint evidence
 * (CANONICAL_KEYS), so those decide (TRD 43-10, B1). Over the runner and CI items whose effectiveArea
 * is the component dir:
 *   viaRunner = the CI items through a task runner (`make build` in `go/`) that serve a canonical key.
 *               CI driving a component's runner targets for build/test/lint says that runner is the repo's
 *               declared build interface (TRD 43-06); a component whose CI only runs its tier's tool
 *               directly is built by its tier defaults. A step through a runner that serves another key
 *               (`make bundle-e2e`) says nothing about the build and lifts nothing.
 *   canonical = those items whose key is build, test or lint.
 *   score     = all of them.
 * Sorted: a component with viaRunner > 0 first, then canonical, then score (most first), then
 * PRIMARY_ORDER (others last), then a shallower path, then the lexical path. With zero evidence
 * everywhere this is the go component if any, else the first by path.
 */
function pickPrimaryComponent(components, items = []) {
  const list = (Array.isArray(components) ? components : []).filter((c) => c && typeof c.path === 'string');
  if (!list.length) return null;
  const evidence = (Array.isArray(items) ? items : []).filter((e) => e && (e.source === 'runner' || e.source === 'ci'));
  const orderOf = (c) => {
    const i = PRIMARY_ORDER.indexOf(c.profile);
    return i === -1 ? PRIMARY_ORDER.length : i;
  };
  return list
    .map((c) => {
      const own = evidence.filter((e) => effectiveAreaOf(e) === c.path);
      const canonical = own.filter((e) => CANONICAL_KEYS.has(e.key));
      const viaRunner = canonical.filter((e) => e.source === 'ci' && TASK_RUNNERS.has(e.runner)).length;
      return { path: c.path, profile: c.profile, score: own.length, canonical: canonical.length, viaRunner };
    })
    .sort((a, b) => (b.viaRunner > 0) - (a.viaRunner > 0)
      || b.canonical - a.canonical
      || b.score - a.score
      || orderOf(a) - orderOf(b)
      || depthOf(a.path) - depthOf(b.path)
      || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))[0];
}

function note(item, key, status, detail, extra = {}) {
  return {
    area: item ? item.area || '' : '',
    key,
    candidate: item ? item.command : null,
    status,
    detail,
    source: item ? item.source : null,
    ...extra,
  };
}

/**
 * assembleDraft(opts) — see the header. `areas` are detectAreas entries, optionally carrying the
 * `profile` draftProfile picked for them; `evidence` are collectEvidence items; `extendsId` is an
 * explicit root `--extends` (it wins for the root).
 */
function assembleDraft({ areas = [], evidence = [], tierCommands = {}, verify = null, extendsId: explicit = null } = {}) {
  const notes = [];
  const areaList = Array.isArray(areas) ? areas.filter(Boolean) : [];
  const lang = areaList.filter((a) => Array.isArray(a.kinds) && a.kinds.length);
  const supported = lang.filter((a) => profileOf(a) && profileOf(a) !== 'general');

  // ── extends / components ────────────────────────────────────────────────
  // D3 (TRD 43-05), the literal rule: the root manifest decides the root extends, and EVERY supported
  // area that is not at the root is a component, a lone one included.
  const rootArea = supported.find((a) => a.dir === '');
  let extendsId = rootArea ? profileOf(rootArea) : 'general';
  const components = supported
    .filter((a) => a.dir !== '')
    .map((a) => ({ path: a.dir, profile: profileOf(a) }))
    .sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  // An explicit --extends sets the root extends and leaves the components alone.
  if (explicit) extendsId = explicit;
  // The extends tier's stack family (D3 gate); null for general or a tier this classifier does
  // not know, which makes the gate a no-op.
  const family = Object.prototype.hasOwnProperty.call(TIER_STACKS, extendsId) ? TIER_STACKS[extendsId] : null;
  // A language-neutral generator (NEUTRAL_STACK) belongs to no stack, so it matches any tier.
  const onFamily = (stack) => stack === NEUTRAL_STACK || (!!family && family.includes(stack));
  const componentDirs = new Set(components.map((c) => c.path));
  const profileByDir = new Map(lang.map((a) => [a.dir, profileOf(a)]));

  for (const a of areaList) {
    if (supported.includes(a)) continue;
    if (!(Array.isArray(a.kinds) && a.kinds.length) && !a.unsupported) continue;
    const what = a.unsupported || (a.tier ? `${a.tier} (no installed profile)` : a.kinds.join('/'));
    notes.push({
      area: a.dir || '',
      key: null,
      candidate: null,
      status: 'info',
      detail: `unsupported area (${what}): no tier-2 profile, so it is not a component; only its own commands are noted`,
      source: null,
    });
  }

  // ── evidence preparation ────────────────────────────────────────────────
  const maestroAreas = areaList.filter((a) => Array.isArray(a.flags) && a.flags.includes('maestro'));
  let items = evidence.filter((e) => e && e.key && e.command);
  // Command cwd hygiene (TRD 42-14): an item whose cwd is not a real, tracked, non-ignored dir of
  // THIS repo is never a candidate, only a `cwd_<status>` note. `missing` stays a candidate so it
  // takes the unresolved path (check() answers cwd_missing): discover + a note.
  items = items.filter((e) => {
    const s = e.cwdStatus;
    if (!s || s === 'ok' || s === 'missing') return true;
    const why = CWD_REASON[s] || `is not usable (${s})`;
    notes.push(note(e, e.key, `cwd_${s}`, `${e.cwd || 'the repo root'} ${why}; the command is never placed`));
    return false;
  });
  if (!maestroAreas.length) items = items.filter((e) => !(e.key === 'e2e' && e.tool === 'maestro'));
  for (const a of maestroAreas) {
    items.push({
      key: 'e2e',
      command: MAESTRO_COMMAND,
      form: 'check',
      source: 'detected',
      sourceFile: `${a.dir || ''}.maestro/`,
      cwd: trimDir(a.dir) || null,
      area: a.dir || '',
      runner: null,
      confidence: 'high',
      weak: [],
      tool: 'maestro',
    });
  }
  if (!items.some((e) => e.key === 'audit')) {
    items = items.map((e) => (e.key === 'sast' && e.tool === 'gosec' ? { ...e, key: 'audit' } : e));
  }
  const sources = unique(items.map((e) => e.sourceFile));

  // ── verification (cached per command + cwd) ─────────────────────────────
  const cache = new Map();
  const check = (item) => {
    const k = `${item.command}\u0000${item.cwd || ''}`;
    if (cache.has(k)) return cache.get(k);
    let v;
    if (item.cwdStatus === 'missing') {
      v = { status: 'cwd_missing', detail: `${item.cwd} does not exist under the repo root` };
    } else if (GH_EXPR.test(item.command)) {
      v = { status: 'unverifiable', detail: 'contains a GitHub Actions ${{ }} expression; it only runs inside a workflow' };
    } else if (typeof verify !== 'function') {
      v = { status: 'unverifiable', detail: 'no verifier supplied' };
    } else {
      try {
        const r = verify(item.command, item.cwd || '') || {};
        v = { status: r.status || 'unverifiable', detail: r.detail || '' };
      } catch (err) {
        v = { status: 'unverifiable', detail: `verifier failed: ${err && err.message ? err.message : err}` };
      }
    }
    cache.set(k, v);
    return v;
  };

  // ── placement ───────────────────────────────────────────────────────────
  // TRD 42-15 (D3): an item is placed by where its body RUNS (effectiveArea). One running in an
  // unsupported sub-area is never a root command for any key: a `sub_area` note, one per
  // (area, key). One running in a component is noted against that component.
  // (An attachable key — e2e, lint_helm, lint_docker — from a non-component area used to reach the
  // root; from an unsupported sub-area it is now a sub_area note like every other key.)
  // TRD 43-05 (D6): a `general` root with 1+ components has a primary component. Its candidates fill
  // the root keys that no root-area candidate fills. A tier root has none (it behaves as before).
  // TRD 43-06 (root product): a `general` root that BUILDS ITSELF in a stack of its own — a root-area
  // build candidate whose body runs no component tier's stack (autotools, a shell script) and is not only
  // a container image build (an image packages what the repo builds) — is a product. Its components are
  // sidecars: none is primary, none fills a root key, and the single-component fallback does not apply.
  // A root build that runs a component's stack (`go build`, `flutter build`) keeps the primary rules.
  const componentStacks = new Set(components.flatMap((c) => (Object.prototype.hasOwnProperty.call(TIER_STACKS, c.profile) ? TIER_STACKS[c.profile] : [])));
  const buildsOwnStack = (e) => !imageBuildOnly(e) && !scopesOf(e).some((s) => componentStacks.has(s.stack));
  const rootProduct = extendsId === 'general' && components.length
    ? items.find((e) => e.key === 'build' && RUN_FORMS.has(e.form) && effectiveAreaOf(e) === '' && buildsOwnStack(e)) || null
    : null;
  // TRD 43-10 (workspace root): a `general` root whose ROOT task runner has a build/test/lint recipe that
  // runs in two or more areas (stack-evidence `unitAreas`) is a workspace. Its runner is the repo's
  // interface and no component is primary: there is no off_primary gate, no single-component fallback,
  // and every root-runner recipe is a root candidate wherever its body runs (tier 1). A recipe that
  // runs in one area (`just test-go`) fans out nowhere, and a CI step or a sub-dir runner is not the root's.
  const fansOut = (e) => isRunnerItem(e) && atRepoRoot(e) && CANONICAL_KEYS.has(e.key)
    && Array.isArray(e.unitAreas) && unique(e.unitAreas).length >= 2;
  const workspaceItem = extendsId === 'general' && components.length && !rootProduct ? items.find(fansOut) || null : null;
  const primary = extendsId === 'general' && !rootProduct && !workspaceItem ? pickPrimaryComponent(components, items) : null;
  if (workspaceItem) {
    notes.push({
      area: '',
      key: null,
      candidate: workspaceItem.command,
      status: 'info',
      detail: `root workspace: the root task runner's \`${workspaceItem.command}\` runs in ${unique(workspaceItem.unitAreas).map((a) => a || 'the root').join(', ')}; the runner is the interface, so no component is primary and every root recipe is a root candidate wherever its body runs`,
      source: workspaceItem.source,
      tag: 'root_workspace',
    });
  }
  if (rootProduct) {
    notes.push({
      area: '',
      key: null,
      candidate: rootProduct.command,
      status: 'info',
      detail: `the root builds itself (${rootProduct.command}): components ${components.map((c) => c.path).join(', ')} are sidecars, so there is no primary component`,
      source: rootProduct.source,
      tag: 'root_product',
    });
  }
  if (primary) {
    notes.push({
      area: primary.path,
      key: null,
      candidate: null,
      status: 'info',
      detail: `primary component ${primary.path} (${primary.profile}): ${primary.canonical} build/test/lint evidence items of ${primary.score}${primary.viaRunner ? `, ${primary.viaRunner} CI steps through its task runner serving them` : ''}`,
      source: null,
      tag: 'primary_component',
    });
  }
  const rootAreas = new Set(['']);
  // The candidates of a root key, by tier (index 0..3 = tiers 1..4, see the header): a root task-runner
  // recipe, a runner target of the primary component, the other root-area candidates, the primary's
  // other candidates. Tiers 1, 2 and 4 exist only with a primary component; without one every
  // root-area candidate is tier 3, which is the old single root list.
  const tierByKey = new Map();
  const elsewhere = new Map(); // component (area, key) -> items
  const subArea = new Map(); // unsupported sub-area (area, key) -> items
  const rootKeyOrder = []; // the keys of tierByKey in first-seen evidence order
  const bucket = (map, k, e) => {
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  };
  const place = (item, tier) => {
    if (!tierByKey.has(item.key)) {
      tierByKey.set(item.key, [[], [], [], []]);
      rootKeyOrder.push(item.key);
    }
    tierByKey.get(item.key)[tier - 1].push(item);
  };
  for (const item of items) {
    const eff = effectiveAreaOf(item);
    if ((primary || workspaceItem) && item.source === 'declared' && (rootAreas.has(eff) || (primary && eff === primary.path))) {
      place(item, 1); // the user's own row outranks every tier, as it outranks every source
    } else if ((primary || workspaceItem) && isRunnerItem(item) && atRepoRoot(item)) {
      place(item, 1); // a recipe of the root task runner is the repo's interface wherever its body runs
    } else if (primary && isRunnerItem(item) && item.area === primary.path) {
      place(item, 2); // a target of the primary component's runner file keeps its own cwd
    } else if (primary && eff === primary.path) {
      place(item.area !== eff ? { ...item, area: eff } : item, 4);
    } else if (componentDirs.has(eff) && !item.cwd && ATTACHABLE_KEYS.has(item.key)) {
      // TRD 43-06: a repo-level check run FROM the root (e2e, chart lint, Dockerfile lint) is a root
      // candidate wherever its script lives (`./wopi-host/scripts/wopi-e2e.sh` exercises the whole repo).
      place(item, 3);
    } else if (componentDirs.has(eff)) {
      const e = item.area !== eff ? { ...item, area: eff } : item;
      bucket(elsewhere, `${eff}\u0000${e.key}`, e);
    } else if (rootAreas.has(eff)) {
      place(item, 3);
    } else {
      bucket(subArea, `${eff}\u0000${item.key}`, item);
    }
  }
  for (const list of subArea.values()) {
    const best = rank(list, list[0].key)[0];
    const eff = effectiveAreaOf(best);
    notes.push(note(best, best.key, 'sub_area', `runs in ${eff}: not the primary stack; never a root command`, { effectiveArea: eff }));
  }

  // ── root keys ───────────────────────────────────────────────────────────
  const parent = tierCommands[extendsId] || {};
  const primaryTier = primary ? tierCommands[primary.profile] || {} : {};
  const commands = {};
  // With exactly ONE component the root build/test/lint fall back to that component's runnable tier
  // defaults, run from the component's dir (TRD 43-05, D6). Never any other key, never with 2+.
  const fallbackFor = (key) => {
    if (!primary || components.length !== 1 || !CANONICAL_KEYS.has(key)) return null;
    const entry = primaryTier[key];
    return entry && typeof entry === 'object' && runnable(entry.run) ? { ...entry, cwd: trimDir(primary.path) } : null;
  };
  // off_primary (TRD 43-05, D6): stacks that belong ONLY to a non-primary component's tier family
  // (TIER_STACKS) -> that component. Neutral generators, shell, unknown tools and the primary's own
  // stack are never in it, so a root `shellcheck` or `buf generate` is never gated.
  const stackOwner = new Map();
  if (primary) {
    const familyOf = (profile) => (Object.prototype.hasOwnProperty.call(TIER_STACKS, profile) ? TIER_STACKS[profile] : []);
    const own = familyOf(primary.profile);
    for (const c of components) {
      if (c.path === primary.path) continue;
      for (const st of familyOf(c.profile)) {
        if (st !== NEUTRAL_STACK && !own.includes(st) && !stackOwner.has(st)) stackOwner.set(st, c.path);
      }
    }
  }
  // evaluateKey(key, list, fromPrimary) -> { entry, supplies, via }: the per-key pipeline (D3 gate, e2e_env
  // eligibility, rank, the repo-wide test, the verify walk, apply) over ONE tier's candidates. `supplies`
  // is true when the tier fills the key or leaves it inherited from the tier default; a tier that does
  // not (every candidate failed, or none was broad) leaves its notes and the next tier is tried.
  const evaluateKey = (key, list, fromPrimary) => {
    const parentEntry = parent[key] && typeof parent[key] === 'object' ? parent[key] : null;
    const parentRun = parentEntry ? parentEntry.run : undefined;
    // A primary candidate that runs the SAME tool as the component tier's default keeps that tier's
    // scoped/apply forms (they run in the same cwd); a root one is judged against the root's parent.
    const formEntry = fromPrimary ? (primaryTier[key] && typeof primaryTier[key] === 'object' ? primaryTier[key] : null) : parentEntry;
    const formRun = formEntry ? formEntry.run : undefined;
    // D3 (TRD 42-15): a key the extends profile supplies is overridden only by a root candidate
    // that runs the tier's stack at the root; the rest are off_stack notes (the default applies).
    const gated = family && runnable(parentRun);
    const offStackSeen = new Set();
    const onStack = gated
      ? list.filter((c) => {
        const scopes = scopesOf(c);
        if (scopes.some((s) => onFamily(s.stack) && rootAreas.has(s.area))) return true;
        if (!offStackSeen.has(c.command)) {
          offStackSeen.add(c.command);
          const stacks = unique(scopes.map((s) => s.stack));
          notes.push(note(c, key, 'off_stack', `tool stack ${stacks.join('+') || 'unknown'} does not match extends ${extendsId}`));
        }
        return false;
      })
      : list;
    // A scenario name that tears the environment down (`make e2e-stack-down`) or resets it (`make e2e-db-reset`)
    // (stack-classify envRole) is neither the environment nor the suite: an `env_teardown` / `env_reset` note
    // for e2e_env and e2e alike (TRD 43-11). A declared row is the user's own.
    const roleFree = key === 'e2e_env' || key === 'e2e'
      ? onStack.filter((c) => {
        if (c.source === 'declared') return true;
        const role = envRole(nameOf(c));
        if (!role) return true;
        notes.push(note(c, key, `env_${role}`, role === 'teardown'
          ? 'tears the scenario environment down; never the e2e environment or suite'
          : 'resets the scenario environment between runs; never the e2e environment or suite'));
        return false;
      })
      : onStack;
    // e2e_env is the environment the e2e scenarios run against, and only a NAME says that (stack-evidence
    // `scenarioNamed`: `make e2e-stack-up`). A body-only bring-up (`make up`, `just infra`, a live-cluster
    // script) is some environment: an `env_unnamed` note, never the key. A declared row counts (TRD 43-06).
    const eligible = key === 'e2e_env'
      ? roleFree.filter((c) => {
        if (c.scenarioNamed === true || c.source === 'declared') return true;
        notes.push(note(c, key, 'env_unnamed', 'brings an environment up, but no target or script name says it is the e2e environment; never a root key'));
        return false;
      })
      : roleFree;
    // A mixed aggregate (TRD 43-11): a candidate whose body runs K AND other keys (stack-evidence `unitKeys`;
    // `generate: proto sqlc gen-sdk` also pulls deps and lint through gen-sdk) never fills K while a pure
    // candidate (unitKeys exactly [K]; none at all counts as pure, so a raw CI line is unaffected) exists.
    // It is a `mixed_aggregate` note. With no pure candidate the ranking is unchanged. Only single-purpose
    // keys are judged: a build/test/lint entry point runs whatever its key needs (`build: generate`, a lint
    // that builds its vet tool, a test that installs node modules) and the canonical ranking picks it (42-13);
    // a scenario key's body is an orchestration by nature (43-04, D4).
    const keysOf = (c) => (Array.isArray(c.unitKeys) ? c.unitKeys : []);
    const isPure = (c) => keysOf(c).every((k) => k === key);
    const mixedOthers = (c) => (keysOf(c).includes(key) ? keysOf(c).filter((k) => k !== key) : []);
    let pool = eligible;
    if (!WHOLE_ENTRY_KEYS.has(key) && eligible.some(isPure)) {
      const mixedSeen = new Set();
      pool = eligible.filter((c) => {
        const others = mixedOthers(c);
        if (!others.length) return true;
        if (!mixedSeen.has(c.command)) {
          mixedSeen.add(c.command);
          notes.push(note(c, key, 'mixed_aggregate', `also runs ${others.join(', ')}; a candidate that runs only ${key} exists, so this aggregate never fills ${key}`));
        }
        return false;
      });
    }
    let ranked = rank(pool, key);
    // A codegen drift check (check form: regenerate, then fail on a diff) is the codegen gate; the
    // generator it re-runs (mutate) is then its apply, not a competing run (TRD 43-06, R5). TRD 43-11: the
    // check must check the GENERATOR. Take G = the best-ranked generator. A check whose writer (stack-evidence
    // `driftWriter`) is G's target, or the same invocation G's body runs, is G's check: R5. A check whose
    // writer is one of G's LEGS (`views-check: views` under `generate: views styles buf-generate`) covers that
    // leg only: a `partial_check` note that neither fills run nor makes G its apply. Any other check keeps R5.
    let generatorIsApply = false;
    if (key === 'codegen' && ranked.some((e) => e.form === 'check')) {
      const g = ranked.find((e) => e.form === 'mutate') || null;
      const legs = g && g.target && Array.isArray(g.target.legs) ? g.target.legs : [];
      const legItems = ranked.filter((e) => e !== g && e.target && legs.includes(e.target.name));
      const partial = new Set();
      for (const c of ranked.filter((e) => e.form === 'check')) {
        const w = c.driftWriter;
        const ofLeg = !!g && !!w && !writesAs(w, g) && (w.target ? legs.includes(w.target) : legItems.some((l) => writesAs(w, l)));
        if (!ofLeg) {
          generatorIsApply = true;
          continue;
        }
        partial.add(c);
        notes.push(note(c, key, 'partial_check', `checks drift of \`${w.target || w.invocation}\` only, one leg of the generator \`${g.command}\`; it neither fills run nor turns that generator into its apply`));
      }
      if (partial.size) ranked = ranked.filter((e) => !partial.has(e));
    }
    let runCands = ranked.filter((e) => RUN_FORMS.has(e.form) && !(generatorIsApply && e.form === 'mutate'));
    const applyCands = ranked.filter((e) => e.form === 'apply' || (generatorIsApply && e.form === 'mutate'));

    // The repo-wide test must be broad: narrow candidates are notes under the key they fit.
    let narrowed = 0;
    if (key === 'test') {
      runCands = runCands.filter((c) => {
        const b = breadthOf(c);
        if (b.breadth !== 'narrow') return true;
        notes.push(note(c, b.fitsKey, 'narrow', `not the repo-wide test (${b.detail})`));
        narrowed += 1;
        return false;
      });
    }

    let chosen = null;
    let chosenAt = -1;
    let inheritedAt = undefined; // null = inherited as-is; a string = inherited but needs that cwd
    let wrapper = null; // a primary-component script that wraps the governing default (TRD 43-12)
    for (let i = 0; i < runCands.length; i++) {
      const c = runCands[i];
      // A candidate at a missing cwd never makes the key inherited THERE (it would carry that cwd).
      // A task-runner target named for the key is the declared entry point even when it equals the
      // default (TRD 43-12): it is verified and chosen like any other candidate.
      if (c.cwdStatus !== 'missing' && equivalent(c, parentRun) && !declaredTarget(c, key, parentRun)) {
        inheritedAt = c.cwd || null;
        break;
      }
      // A script not named for the key that runs the governing default (formEntry) is that default.
      if (c.cwdStatus !== 'missing' && wraps(c, key, formRun)) {
        notes.push(note(c, key, 'wrapper', fromPrimary
          ? `wraps \`${formRun}\`; ${key} is that ${primary.profile} default, run from ${c.cwd || 'the repo root'}`
          : `wraps \`${formRun}\`; ${key} stays the inherited ${extendsId} default`));
        if (fromPrimary) wrapper = c;
        else inheritedAt = c.cwd || null;
        break;
      }
      const v = check(c);
      if (v.status === 'resolved') {
        chosen = c;
        chosenAt = i;
        break;
      }
      notes.push(note(c, key, v.status, v.detail));
    }
    if (chosen && chosen.target && CANONICAL_KEYS.has(key)) {
      for (const c of runCands.slice(chosenAt + 1)) {
        if (!c.target || squash(c.command) === squash(chosen.command)) continue;
        if (check(c).status === 'resolved') notes.push(note(c, key, 'alternate', `canonical pick: ${chosen.command}`));
      }
    }
    if (chosen && key === 'test' && breadthOf(chosen).breadth === 'unknown') {
      notes.push(note(chosen, key, 'breadth-unknown', 'what this command runs could not be read; kept as the repo-wide test'));
    }
    if (gated && chosen) {
      const others = unique(scopesOf(chosen).map((s) => s.stack).filter((s) => !onFamily(s)));
      if (others.length) {
        notes.push(note(chosen, key, 'mixed_stack', `also runs ${others.join('+')}; kept because a ${extendsId}-stack invocation runs at the root`));
      }
    }
    let apply = null;
    for (const a of applyCands) {
      const v = check(a);
      if (v.status === 'resolved') {
        apply = a;
        break;
      }
      notes.push(note(a, key, v.status, v.detail));
    }

    const withWhen = (entry) => {
      if (Object.prototype.hasOwnProperty.call(WHEN_DEFAULT, key) && !entry.when) {
        entry.when = (parentEntry && parentEntry.when) || WHEN_DEFAULT[key];
      }
      return entry;
    };

    let entry = null;
    if (inheritedAt !== undefined) {
      const needsCwd = inheritedAt && inheritedAt !== '';
      if (needsCwd || (apply && squash(apply.command) !== squash(parentEntry.apply))) {
        entry = { ...parentEntry };
        if (apply && squash(apply.command) !== squash(parentEntry.apply)) entry.apply = apply.command;
        if (needsCwd) entry.cwd = inheritedAt;
      }
    } else if (wrapper) {
      // The primary tier's default, run where the wrapper ran (TRD 43-12).
      entry = { ...formEntry };
      if (apply && (apply.cwd || null) === (wrapper.cwd || null)) entry.apply = apply.command;
      withWhen(entry);
      if (wrapper.cwd) entry.cwd = wrapper.cwd;
    } else if (chosen) {
      entry = { run: chosen.command };
      if (sameTool(chosen, key, formRun)) {
        if (formEntry.scoped) entry.scoped = formEntry.scoped;
        if (!apply && formEntry.apply) entry.apply = formEntry.apply;
      }
      if (apply && (apply.cwd || null) === (chosen.cwd || null)) entry.apply = apply.command;
      withWhen(entry);
      if (chosen.cwd) entry.cwd = chosen.cwd;
      if (chosen.weak && chosen.weak.length) {
        notes.push(note(chosen, key, 'resolved', `weak gate kept verbatim: ${chosen.weak.join(', ')}`, { weak: [...chosen.weak] }));
      }
    } else if (runCands.length || (narrowed && !runnable(parentRun) && !fallbackFor(key))) {
      // Unresolved candidates, or only narrow tests with no parent test to inherit (the one
      // component's tier test is that parent: the fallback below supplies it).
      entry = withWhen({ run: 'discover' });
      if (apply) {
        entry.apply = apply.command;
        if (apply.cwd) entry.cwd = apply.cwd;
      }
    } else if (apply) {
      entry = runnable(parentRun) ? { ...parentEntry, apply: apply.command } : withWhen({ run: 'discover', apply: apply.command });
      if (apply.cwd) entry.cwd = apply.cwd;
    }
    const supplies = chosen !== null || inheritedAt !== undefined || wrapper !== null;
    const via = chosen ? chosen.command : wrapper ? formRun : (supplies ? `the ${extendsId} default` : null);
    return { entry, supplies, via };
  };

  const TIER_NAMES = ['a root task-runner recipe', "the primary component's task-runner target", 'a root CI, docs or manifest candidate', "the primary component's CI or docs candidate"];
  for (const key of rootKeyOrder) {
    // The first tier that supplies the key wins; a tier that supplies nothing falls through to the next,
    // and only with every tier spent does a key that had candidates end as `discover`.
    let lists = tierByKey.get(key);
    // off_primary (TRD 43-05, D6): a root-area or runner candidate whose tool stack belongs ONLY to a
    // non-primary component is a note, whichever tier it is in. The primary's own candidates (tier 4)
    // are never filtered.
    if (primary && stackOwner.size) {
      const offPrimarySeen = new Set();
      lists = lists.map((list, idx) => (idx === 3 ? list : list.filter((c) => {
        const stacks = unique(scopesOf(c).map((sc) => sc.stack));
        if (!stacks.length || !stacks.every((st) => stackOwner.has(st))) return true;
        if (!offPrimarySeen.has(c.command)) {
          offPrimarySeen.add(c.command);
          const owners = unique(stacks.map((st) => stackOwner.get(st)));
          notes.push(note(c, key, 'off_primary', `tool stack ${stacks.join('+')} belongs to component ${owners.join(', ')}, not the primary component ${primary.path}`));
        }
        return false;
      })));
    }
    const outcomes = [];
    let winner = -1;
    for (let idx = 0; idx < 4 && winner === -1; idx++) {
      if (!lists[idx].length) continue;
      const o = evaluateKey(key, lists[idx], idx === 1 || idx === 3);
      outcomes.push(o);
      if (o.supplies) winner = idx;
    }
    // The candidates of the tiers after the winner: the primary's own become component notes when a ROOT
    // tier wins (as before); a root CI, docs or manifest candidate that the primary's runner shadows is
    // a note of its own, which says so for a container image build (it packages what the repo builds).
    if (winner !== -1) {
      if (winner === 0 || winner === 2) {
        for (const idx of [1, 3]) {
          if (idx <= winner) continue;
          for (const e of lists[idx]) bucket(elsewhere, `${primary.path}\u0000${key}`, e);
        }
      }
      if (winner === 1 && lists[2].length) {
        const ordered = rank(lists[2], key);
        const best = ordered.find((e) => RUN_FORMS.has(e.form)) || ordered[0];
        const via = outcomes[outcomes.length - 1].via;
        const detail = key === 'build' && imageBuildOnly(best)
          ? `image_build: a container image build packages what the repo builds and is not the build; ${key} is ${via}, from ${TIER_NAMES[1]} of ${primary.path}`
          : `shadowed: ${key} is ${via}, from ${TIER_NAMES[1]} of ${primary.path}; this root candidate is not used`;
        notes.push(note(best, key, 'shadowed', detail));
      }
    }
    let entry = null;
    if (winner !== -1) {
      entry = outcomes[outcomes.length - 1].entry;
    } else {
      const entries = outcomes.map((o) => o.entry).filter(Boolean);
      entry = entries.find((e) => e.run === 'discover') || entries[0] || null;
    }
    if (entry) commands[key] = entry;
  }

  // Exactly one component: root build/test/lint nothing else supplied are that component's tier
  // defaults, run from its dir (scoped kept: it is the same command there). Not format/fix/audit/
  // codegen/tidy: the component inherits those from its tier.
  for (const key of ['build', 'test', 'lint']) {
    const entry = fallbackFor(key);
    if (entry && !commands[key]) commands[key] = entry;
  }

  // ── commands that belong to a component or an unsupported area: one note per (area, key) ──
  for (const list of elsewhere.values()) {
    const ordered = rank(list, list[0].key);
    const best = ordered.find((e) => RUN_FORMS.has(e.form)) || ordered[0];
    const areaProfile = profileByDir.get(best.area) || null;
    const tier = areaProfile && areaProfile !== 'general' ? (tierCommands[areaProfile] || {}) : {};
    const tierEntry = tier[best.key];
    if (tierEntry && equivalent(best, tierEntry.run)) continue;
    const v = check(best);
    const where = areaProfile && areaProfile !== 'general'
      ? `component ${best.area} uses tier ${areaProfile}`
      : `${best.area || 'root'} has no tier-2 profile`;
    const extra = best.weak && best.weak.length ? { weak: [...best.weak] } : {};
    notes.push(note(best, best.key, v.status, `${where}; a per-area command is not written to STACK.md${v.detail ? ` (${v.detail})` : ''}`, extra));
  }

  if (!lang.length && !evidence.length && !Object.keys(commands).length) {
    notes.push({
      area: '',
      key: null,
      candidate: null,
      status: 'info',
      detail: 'no language area and no command evidence found: drafted extends general with no commands',
      source: null,
    });
  }

  // ── loop, resolved / inherited keys ─────────────────────────────────────
  let loop;
  if (extendsId === 'general' && Object.keys(commands).length) {
    const resolvedLoop = LOOP_KEYS.filter((k) => commands[k] && runnable(commands[k].run));
    if (resolvedLoop.length) loop = resolvedLoop;
  }
  const resolvedKeys = Object.keys(commands).filter((k) => runnable(commands[k].run));
  const inheritedKeys = Object.keys(parent).filter((k) => !commands[k] && parent[k] && runnable(parent[k].run));

  const out = { extendsId, components, commands, notes, sources, resolvedKeys, inheritedKeys };
  if (loop) out.loop = loop;
  return out;
}

module.exports = {
  assembleDraft,
  pickPrimaryComponent,
  SOURCE_RANK,
  ATTACHABLE_KEYS,
  MAESTRO_COMMAND,
};
