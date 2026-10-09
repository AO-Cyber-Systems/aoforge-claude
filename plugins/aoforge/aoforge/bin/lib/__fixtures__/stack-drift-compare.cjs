'use strict';

// stack-drift-compare.cjs — the pure drift comparison of TRD 43-08 (no fs, no aof-tools module).
//
// Reproduces the 43-07 dry-run drift scope (43-ROLLOUT.md `## Dry-run drift`): `extends`, the
// `components` set, and per command key the EFFECTIVE run/apply/cwd (the file's own entry, else the
// one it inherits from its `extends` tier) over the union of both files' own keys. `when`, `scoped`,
// `timeout_s`, `loop` and `provenance` are out of scope. The caller passes each file's frontmatter and
// the resolved commands of each file's `extends` tier, so this stays a function of its arguments.
//
// A row is a CONFLICT (a hand-fix is needed to reach the committed file): a different concrete
// command, a key or an `apply` the draft lacks, a draft `discover` where the committed file has a
// command, a different `cwd`, or a different `extends` / `components`. It is MORE_SPECIFIC when the
// draft only adds a key, an `apply`, or resolves a committed `discover`.
//
// `run: 'none'` is a concrete decision, not a gap: a committed `none` against a draft command is a
// conflict (only a committed `discover` or a missing key lets the draft be more specific).

const DISCOVER = 'discover';

/** scoped(entry) -> { run, apply, cwd } | null. A bare string is a run. */
function scoped(entry) {
  if (entry === undefined || entry === null) return null;
  if (typeof entry === 'string') return { run: entry, apply: undefined, cwd: undefined };
  return { run: entry.run, apply: entry.apply, cwd: entry.cwd };
}

/** The components list as a sorted `{ path, profile }` list (the golden suite's sortComponents). */
const sortComponents = (list) => (Array.isArray(list) ? list : [])
  .map((c) => ({ path: c.path, profile: c.profile }))
  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const extendsOf = (frontmatter) => {
  const v = frontmatter ? frontmatter.extends : undefined;
  return v === undefined || v === null ? 'general' : v;
};

const norm = (v) => (v === undefined || v === null || v === '' ? undefined : v);
const sameEntry = (a, b) => norm(a.run) === norm(b.run) && norm(a.apply) === norm(b.apply) && norm(a.cwd) === norm(b.cwd);

/** classify(c, d) -> 'conflict' | 'more_specific' for two scoped entries that are not equal. */
function classify(c, d) {
  if (!c) return 'more_specific'; // the draft only adds a key
  if (!d) return 'conflict'; // the draft lacks a key the committed file has
  const committedRunnable = norm(c.run) !== undefined && c.run !== DISCOVER; // a command or `none`
  if (committedRunnable && norm(d.run) !== norm(c.run)) return 'conflict'; // different run, or draft discover
  if (norm(c.apply) !== undefined && norm(d.apply) !== norm(c.apply)) return 'conflict'; // apply lacking or different
  if (norm(c.cwd) !== undefined && norm(d.cwd) !== norm(c.cwd)) return 'conflict'; // a different directory
  if (committedRunnable && norm(c.cwd) === undefined && norm(d.cwd) !== undefined) return 'conflict'; // moved a command
  return 'more_specific';
}

/**
 * compareDrift({ committed, draft, committedTier, draftTier, handOnly, keyAliases })
 *   committed, draft            frontmatter objects { extends, components, commands }
 *   committedTier, draftTier    the resolved `commands` of each file's `extends` tier ({} when none)
 *   handOnly                    keys accepted as hand-only (the committed file's spelling, or the draft's)
 *   keyAliases                  { committedKey: draftKey }, e.g. { helm_lint: 'lint_helm' }
 * -> { rows: [{ key, kind, committed, draft }], skipped: [key] }
 *   Rows for a command key carry { run, apply, cwd } | null; `extends` rows carry the id strings and
 *   `components` rows the sorted { path, profile } lists. `skipped` names the hand-only keys that differ.
 */
function compareDrift({ committed, draft, committedTier = {}, draftTier = {}, handOnly = [], keyAliases = {} }) {
  const rows = [];
  const skipped = [];
  const c = committed || {};
  const d = draft || {};

  const cExt = extendsOf(c);
  const dExt = extendsOf(d);
  if (cExt !== dExt) rows.push({ key: 'extends', kind: 'conflict', committed: cExt, draft: dExt });

  const cComps = sortComponents(c.components);
  const dComps = sortComponents(d.components);
  if (JSON.stringify(cComps) !== JSON.stringify(dComps)) {
    rows.push({ key: 'components', kind: 'conflict', committed: cComps, draft: dComps });
  }

  // Own keys of each file, the committed file's spelled through the alias table.
  const cOwn = {};
  for (const [key, entry] of Object.entries(c.commands || {})) cOwn[keyAliases[key] || key] = entry;
  const dOwn = {};
  for (const [key, entry] of Object.entries(d.commands || {})) dOwn[key] = entry;
  // The committed spelling of an aliased key, so handOnly may name either spelling.
  const spelledAs = {};
  for (const [from, to] of Object.entries(keyAliases)) spelledAs[to] = from;

  const keys = [...new Set([...Object.keys(cOwn), ...Object.keys(dOwn)])].sort();
  for (const key of keys) {
    const effC = scoped(cOwn[key] !== undefined ? cOwn[key] : committedTier[key]);
    const effD = scoped(dOwn[key] !== undefined ? dOwn[key] : draftTier[key]);
    if (effC && effD && sameEntry(effC, effD)) continue;
    if (!effC && !effD) continue;
    if (handOnly.includes(key) || (spelledAs[key] && handOnly.includes(spelledAs[key]))) {
      skipped.push(key);
      continue;
    }
    rows.push({ key, kind: classify(effC, effD), committed: effC, draft: effD });
  }
  return { rows, skipped };
}

/** One entry as the 43-07 table writes it: `run (apply: X) (cwd Y)`. */
function renderEntry(entry) {
  let out = String(entry.run);
  if (norm(entry.apply) !== undefined) out += ` (apply: ${entry.apply})`;
  if (norm(entry.cwd) !== undefined) out += ` (cwd ${entry.cwd})`;
  return out;
}

const renderComponents = (list) => (list.length ? list.map((x) => `${x.path}|${x.profile}`).join(', ') : 'none');

/** formatRow(row) -> "<key>: committed `X` vs draft `Y`" (the 43-07 table wording). */
function formatRow(row) {
  if (row.key === 'extends') return `extends: committed \`${row.committed}\` vs draft \`${row.draft}\``;
  if (row.key === 'components') {
    return `components: committed \`${renderComponents(row.committed)}\` vs draft \`${renderComponents(row.draft)}\``;
  }
  if (!row.committed) return `${row.key}: draft only \`${renderEntry(row.draft)}\``;
  if (!row.draft) return `${row.key}: committed only \`${renderEntry(row.committed)}\``;
  return `${row.key}: committed \`${renderEntry(row.committed)}\` vs draft \`${renderEntry(row.draft)}\``;
}

// A self-test argument (TRD 71-02, guarding TRD 71-01's rule). Written here on purpose, not imported from stack-draft:
// the guard must not share the drafter's predicate, or a broken predicate would hide its own regression.
const SELF_TEST_WORD = /^(?:--?self-?test(?:[-=].*)?|self-?test)$/i;
// Programs whose next word is the script they run (`bash t0/selftest.sh`) or the target they build (`make selftest`):
// an entry point, never an argument.
const SCRIPT_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const TASK_RUNNERS = new Set(['make', 'gmake', 'just', 'task', 'rake', 'mage']);

const squash = (s) => String(s).trim().split(/\s+/).filter(Boolean).join(' ');

/** A cwd as a comparable key: null, '', '.' are the repo root; `./go/` is `go`. */
function cwdKey(cwd) {
  if (typeof cwd !== 'string') return '';
  const trimmed = cwd.trim().replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  return trimmed === '.' ? '' : trimmed;
}

/**
 * selfTestDrafts({ commands, evidence }) -> [{ key, run, gate }]
 * A drafted own command whose run passes a self-test argument (any word after the program, and after the script when
 * the program is bash|sh|zsh|dash or a task runner, that is not an evidence item's target name) while `evidence` holds
 * an item for the same key, at the same cwd (null and '' are the root), whose command equals the drafted run with
 * those words removed (whitespace squashed). That item is the gate the drafter should have picked. A bare string is
 * a run, as in compareDrift. `discover`, `none` and any shape that is not a run are never judged. Never throws.
 */
function selfTestDrafts({ commands, evidence } = {}) {
  const found = [];
  const items = (Array.isArray(evidence) ? evidence : [])
    .filter((item) => item && typeof item === 'object' && typeof item.command === 'string');
  const own = commands && typeof commands === 'object' && !Array.isArray(commands) ? commands : {};

  for (const [key, entry] of Object.entries(own)) {
    const obj = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
    const run = typeof entry === 'string' ? entry : obj ? obj.run : undefined;
    if (typeof run !== 'string' || !squash(run) || squash(run) === DISCOVER || squash(run) === 'none') continue;

    const cwd = cwdKey(obj ? obj.cwd : undefined);
    const siblings = items.filter((item) => item.key === key && cwdKey(item.cwd) === cwd);
    const names = new Set(
      siblings
        .flatMap((item) => [item.target && item.target.name, item.invokedName])
        .filter((name) => typeof name === 'string' && name),
    );

    const words = squash(run).split(' ');
    const program = words[0].split('/').pop();
    const first = SCRIPT_SHELLS.has(program) || TASK_RUNNERS.has(program) ? 2 : 1;
    const marks = [];
    for (let i = first; i < words.length; i++) {
      const word = words[i].replace(/^["']+|["']+$/g, '');
      if (!names.has(word) && SELF_TEST_WORD.test(word)) marks.push(i);
    }
    if (!marks.length) continue;

    const gateCommand = words.filter((_, i) => !marks.includes(i)).join(' ');
    const gate = siblings.find((item) => squash(item.command) === gateCommand);
    if (gate) found.push({ key, run, gate: gate.command });
  }
  return found;
}

module.exports = { compareDrift, formatRow, scoped, sortComponents, selfTestDrafts };
