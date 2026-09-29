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
// Extends and components (research_context step 2). A language area is one with `kinds`; it is
// SUPPORTED when its profile (`area.profile`, else `area.tier`) is a real tier, not `general`.
//   0 supported               -> extends general
//   1 supported, at the root  -> extends that tier
//   1 supported, non-root D   -> extends that tier; re-emitted keys carry `cwd: D` (and every
//                                runnable tier command is re-emitted with that cwd)
//   2+ supported              -> extends the root area's tier (or general); every non-root
//                                supported area is a component `{ path: 'D/', profile: <tier id> }`
// Unsupported areas are never components; they are notes. `stack init` never writes a component
// profile file, so a command that belongs to a component is a NOTE, not a root command.
//
// Which items may fill a ROOT key: items in the root area, items in the single non-root area, and
// items for a root-attachable key (e2e, lint_helm, lint_docker) from any area that is not a
// component. Everything else is summarised per (area, key) as a note unless it equals the area's
// tier default.
//
// Per key, candidates are ranked, first difference wins (the tie-break rule, stable otherwise):
//   1. source      declared > runner > ci > manifest > docs > detected
//   2. confidence  high > low
//   3. weak        non-weak > weak
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
// Canonical runner targets (TRD 42-13). For build/test/lint only, items carrying stack-evidence's
// `target` metadata (runner and manifest items) are ordered, right after the source rank, by:
//   bare key name (`build`) > the runner's default target > a target others depend on
//   > fewer `:` segments > no VARIANT_TOKENS token
// then confidence and weak as above, then source order within the same runner file (never the
// alphabet). When a runner target wins, every other resolved runner candidate for the key is an
// `alternate` note.
//
// Repo-wide test (TRD 42-13). For `test`, a candidate is NARROW when some invocation it runs
// (`bodyInvocations`) is narrow by stack-classify.testBreadth and none is broad. Narrow candidates
// never fill `test`: each becomes a `narrow` note under the key it fits (test / integration / e2e;
// notes only, never a new key). With no broad candidate left the key is inherited from a runnable
// parent test, else `discover`. A chosen test whose breadth cannot be read is kept and noted
// `breadth-unknown`.

const { classifyInvocation, testBreadth } = require('./stack-classify.cjs');

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

const runnable = (run) => typeof run === 'string' && run !== '' && run !== 'discover' && run !== 'none';
const squash = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
const trimDir = (d) => (d ? String(d).replace(/\/+$/, '') : '');
const profileOf = (a) => (a && (a.profile || a.tier)) || null;

function unique(list) {
  const out = [];
  for (const x of list) if (x && !out.includes(x)) out.push(x);
  return out;
}

const NEUTRAL = Object.freeze([0, 0, 0, 0, 0]);

/** A runner target's canonical tuple for `key` (see the header); neutral for other keys and items. */
function canonicalOf(item, key) {
  const t = item.target;
  if (!CANONICAL_KEYS.has(key) || !t || typeof t.name !== 'string') return NEUTRAL;
  const tokens = t.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return [
    t.name === key ? 0 : 1,
    t.isDefault === true && item.key === key ? 0 : 1,
    t.dependedOn === true ? 0 : 1,
    t.name.split(':').filter(Boolean).length,
    tokens.some((x) => VARIANT_TOKENS.includes(x)) ? 1 : 0,
  ];
}

function rankOf(item, key) {
  const s = SOURCE_RANK[item.source];
  return [
    s === undefined ? 9 : s,
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
 * decides; nothing recognisable is `unknown` (treated as broad by the caller).
 */
function breadthOf(item) {
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
  let extendsId = 'general';
  let single = null; // the one non-root supported area dir ('svc/')
  let components = [];
  const rootArea = supported.find((a) => a.dir === '');
  if (supported.length === 1) {
    extendsId = profileOf(supported[0]);
    if (supported[0].dir !== '') single = supported[0].dir;
  } else if (supported.length > 1) {
    extendsId = rootArea ? profileOf(rootArea) : 'general';
    components = supported
      .filter((a) => a.dir !== '')
      .map((a) => ({ path: a.dir, profile: profileOf(a) }))
      .sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  }
  if (explicit) {
    if (single && profileOf(supported[0]) !== explicit) single = null;
    extendsId = explicit;
  }
  const singleCwd = single ? trimDir(single) : null;
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
    if (GH_EXPR.test(item.command)) {
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
  const toRoot = (e) => e.area === '' || (single && e.area === single) || (ATTACHABLE_KEYS.has(e.key) && !componentDirs.has(e.area));
  const rootByKey = new Map();
  const elsewhere = new Map();
  for (const e of items) {
    if (toRoot(e)) {
      if (!rootByKey.has(e.key)) rootByKey.set(e.key, []);
      rootByKey.get(e.key).push(e);
    } else {
      const k = `${e.area}\u0000${e.key}`;
      if (!elsewhere.has(k)) elsewhere.set(k, []);
      elsewhere.get(k).push(e);
    }
  }

  // ── root keys ───────────────────────────────────────────────────────────
  const parent = tierCommands[extendsId] || {};
  const commands = {};
  for (const [key, list] of rootByKey) {
    const parentEntry = parent[key] && typeof parent[key] === 'object' ? parent[key] : null;
    const parentRun = parentEntry ? parentEntry.run : undefined;
    const ranked = rank(list, key);
    let runCands = ranked.filter((e) => RUN_FORMS.has(e.form));
    const applyCands = ranked.filter((e) => e.form === 'apply');

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
      if (equivalent(c, parentRun)) {
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
      if (sameTool(chosen, key, parentRun)) {
        if (parentEntry.scoped) entry.scoped = parentEntry.scoped;
        if (!apply && parentEntry.apply) entry.apply = parentEntry.apply;
      }
      if (apply && (apply.cwd || null) === (chosen.cwd || null)) entry.apply = apply.command;
      withWhen(entry);
      if (chosen.cwd) entry.cwd = chosen.cwd;
      if (chosen.weak && chosen.weak.length) {
        notes.push(note(chosen, key, 'resolved', `weak gate kept verbatim: ${chosen.weak.join(', ')}`, { weak: [...chosen.weak] }));
      }
    } else if (runCands.length || (narrowed && !runnable(parentRun))) {
      // Unresolved candidates, or only narrow tests with no parent test to inherit.
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

  // A single non-root area: the tier's own commands would run at the repo root, so each runnable
  // one is re-emitted with the area's cwd (scoped/apply/when kept: it is the same command there).
  if (singleCwd) {
    for (const [key, entry] of Object.entries(parent)) {
      if (commands[key] || !entry || !runnable(entry.run)) continue;
      commands[key] = { ...entry, cwd: singleCwd };
    }
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
  SOURCE_RANK,
  ATTACHABLE_KEYS,
  MAESTRO_COMMAND,
};
