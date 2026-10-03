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
// (`pickPrimaryComponent`): a component whose CI steps go through its task runner first (TRD 43-06),
// then the one holding the most runner + CI evidence, ties broken go > flutter > dart > other, then
// the shallower path, then the lexical one. A `general` root that builds itself in a stack no component
// has (a root build that is not only an image build) is a product: its components are sidecars and there
// is no primary (tag `root_product`, TRD 43-06). A root-invoked attachable key (e2e, lint_helm,
// lint_docker) is a root candidate wherever its script lives. It is recorded in an info note tagged
// `primary_component`. A tier root has no primary component and behaves exactly as before.
//
// Which items may fill a ROOT key (TRD 42-15, D3; TRD 43-05, D6): items whose body RUNS (stack-evidence
// `effectiveArea`) at the root, then, for a key with no root candidate, in the primary component (the
// candidate keeps its own `cwd`: `make build` in `go/` is `{ run: make build, cwd: go }`; a root `just
// test-go` whose recipe does the `cd` itself keeps no cwd). A root candidate whose tool stack belongs
// ONLY to a non-primary component (`flutter build` beside a go primary) is an `off_primary` note.
// With exactly ONE component, root build/test/lint also fall back to that component's tier defaults
// with `cwd` = the component dir when nothing else supplied them. One running in another component is
// summarised per (area, key) as a component note unless it equals the tier default; one running
// in an unsupported sub-area is a `sub_area` note per (area, key), for every key.
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
// the key stays inherited; otherwise the first candidate `verify` calls `resolved` is the run.
// Candidates that failed before it are notes. None resolved but candidates existed ->
// `run: discover`. A `${{ }}` command is `unverifiable` without asking `verify`.
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

const { classifyInvocation, testBreadth, toolStack, TIER_STACKS, NEUTRAL_STACK } = require('./stack-classify.cjs');

const SOURCE_RANK = Object.freeze({ declared: 0, runner: 1, ci: 2, manifest: 3, docs: 4, detected: 5 });
const CANONICAL_KEYS = new Set(['build', 'test', 'lint']);
/** Name tokens that mark a target as a variant of the canonical one (a platform, a mode, a helper). */
const VARIANT_TOKENS = Object.freeze([
  'internal', 'quickdev', 'dev', 'preview', 'debug', 'local', 'macos', 'windows', 'linux', 'darwin', 'arm64', 'amd64',
]);
const ATTACHABLE_KEYS = new Set(['e2e', 'lint_helm', 'lint_docker']);
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

/**
 * pickPrimaryComponent(components, items) -> { path, profile, score, viaRunner } | null
 *
 * viaRunner = the CI items whose effectiveArea is the component dir AND that go through a task runner
 * (`make build` run in `go/`): CI driving the component's runner targets says that runner is the repo's
 * declared build interface, where a component whose CI only runs its tier's tool directly (`flutter build
 * web` in several workflows) is built by its tier defaults (TRD 43-06). score = the runner and CI
 * evidence items whose effectiveArea is the component dir. Sorted: a component with viaRunner > 0 first,
 * then score (most first), then PRIMARY_ORDER (others last), then a shallower path, then the lexical
 * path. With zero evidence everywhere this is the go component if any, else the first by path.
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
      const viaRunner = own.filter((e) => e.source === 'ci' && TASK_RUNNERS.has(e.runner)).length;
      return { path: c.path, profile: c.profile, score: own.length, viaRunner };
    })
    .sort((a, b) => (b.viaRunner > 0) - (a.viaRunner > 0)
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
  const primary = extendsId === 'general' && !rootProduct ? pickPrimaryComponent(components, items) : null;
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
      detail: `primary component ${primary.path} (${primary.profile}): ${primary.score} evidence items${primary.viaRunner ? `, ${primary.viaRunner} CI steps through its task runner` : ''}`,
      source: null,
      tag: 'primary_component',
    });
  }
  const rootAreas = new Set(['']);
  const rootByKey = new Map();
  const primaryByKey = new Map(); // primary component: key -> items (each keeps its own cwd)
  const elsewhere = new Map(); // component (area, key) -> items
  const subArea = new Map(); // unsupported sub-area (area, key) -> items
  const rootKeyOrder = []; // the keys of rootByKey / primaryByKey in first-seen evidence order
  const bucket = (map, k, e) => {
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  };
  const seeKey = (k) => {
    if (!rootKeyOrder.includes(k)) rootKeyOrder.push(k);
  };
  for (const item of items) {
    const eff = effectiveAreaOf(item);
    if (primary && eff === primary.path) {
      seeKey(item.key);
      bucket(primaryByKey, item.key, item.area !== eff ? { ...item, area: eff } : item);
    } else if (componentDirs.has(eff) && !item.cwd && ATTACHABLE_KEYS.has(item.key)) {
      // TRD 43-06: a repo-level check run FROM the root (e2e, chart lint, Dockerfile lint) is a root
      // candidate wherever its script lives (`./wopi-host/scripts/wopi-e2e.sh` exercises the whole repo).
      seeKey(item.key);
      bucket(rootByKey, item.key, item);
    } else if (componentDirs.has(eff)) {
      const e = item.area !== eff ? { ...item, area: eff } : item;
      bucket(elsewhere, `${eff}\u0000${e.key}`, e);
    } else if (rootAreas.has(eff)) {
      seeKey(item.key);
      bucket(rootByKey, item.key, item);
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
  for (const key of rootKeyOrder) {
    // Root-area candidates first. A key none of them fills takes the primary component's candidates;
    // when a root candidate exists the primary ones are component notes.
    let list = rootByKey.get(key) || [];
    if (primary && stackOwner.size) {
      const offPrimarySeen = new Set();
      list = list.filter((c) => {
        const stacks = unique(scopesOf(c).map((sc) => sc.stack));
        if (!stacks.length || !stacks.every((st) => stackOwner.has(st))) return true;
        if (!offPrimarySeen.has(c.command)) {
          offPrimarySeen.add(c.command);
          const owners = unique(stacks.map((st) => stackOwner.get(st)));
          notes.push(note(c, key, 'off_primary', `tool stack ${stacks.join('+')} belongs to component ${owners.join(', ')}, not the primary component ${primary.path}`));
        }
        return false;
      });
    }
    let fromPrimary = false;
    const primaryList = primaryByKey.get(key) || [];
    if (primaryList.length && !list.length) {
      list = primaryList;
      fromPrimary = true;
    } else if (primaryList.length) {
      for (const e of primaryList) bucket(elsewhere, `${primary.path}\u0000${key}`, e);
    }
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
    const ranked = rank(onStack, key);
    // A codegen drift check (check form: regenerate, then fail on a diff) is the codegen gate; the
    // generator it re-runs (mutate) is then its apply, not a competing run (TRD 43-06).
    const generatorIsApply = key === 'codegen' && ranked.some((e) => e.form === 'check');
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
    for (let i = 0; i < runCands.length; i++) {
      const c = runCands[i];
      // A candidate at a missing cwd never makes the key inherited THERE (it would carry that cwd).
      if (c.cwdStatus !== 'missing' && equivalent(c, parentRun)) {
        inheritedAt = c.cwd || null;
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
