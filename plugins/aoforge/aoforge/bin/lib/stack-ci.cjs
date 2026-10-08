'use strict';

// stack-ci.cjs — structural GitHub Actions reader for `aof-tools stack init` (TRD 42-03, SDR-02).
//
// Reads `.github/workflows/*.y{a,}ml` as WORKFLOWS — job, step, working directory, `uses:` — and
// hands every `run:` body to stack-shell.cjs so what comes out is a list of logical invocations,
// not physical lines. It replaces the line-at-a-time regex scrape in stack-evidence.cjs.
//
// Deliberately NOT a YAML parser (see the stack-evidence.cjs header): real workflows use anchors,
// multi-document files, a bare `on:` key and flow maps that yaml-lite rejects. This is an
// indentation-tracking line reader that recognises exactly the handful of shapes it needs:
//
//   on: / schedule:                              -> `scheduled`
//   defaults: run: working-directory:            -> workflow cwd
//   jobs: <job>: defaults: run: working-directory:, continue-on-error:, steps:
//   jobs: <job>: services: <name>:               -> step.services (block spelling only; a flow `services: { … }` is not read)
//   env: / jobs: <job>: env: / step env:         -> step.envNames (names; the literals also feed run-line substitution)
//   - name: / uses: / run: (inline, `|` or `>`) / working-directory: / continue-on-error:
//
// Anything else is skipped, never thrown on: `_parseWorkflowText` returns whatever it could read.
//
// PURE apart from the directory read in parseWorkflows(). Names no language or framework.

const fs = require('fs');
const path = require('path');
const { normalizeScript } = require('./stack-shell.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

// indent, optional `- `, key (bare or quoted), `:`, optional value.
const KEY_RE = /^(\s*)(-\s+)?(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_][A-Za-z0-9_.-]*))\s*:(?:\s+(.*?))?\s*$/;
// A list item, whether or not its content is a `key: value` pair.
const DASH_RE = /^(\s*)-(?:\s+|$)/;
const COMMENT_RE = /^\s*#/;
// `|`, `>`, with optional chomping / indentation indicators and a trailing comment.
const BLOCK_RE = /^[|>][+-]?\d*[+-]?\s*(?:#.*)?$/;

const asString = (t) => (t == null ? '' : String(t));

/** A YAML scalar as text: quotes removed, `&anchor` stripped, a trailing ` # comment` dropped. */
function scalar(v) {
  let s = asString(v).trim();
  if (!s) return '';
  s = s.replace(/^&\S+\s*/, '');
  if (s.startsWith('*')) return ''; // an alias: its target is not knowable here
  const q = s[0];
  if (q === '"' || q === "'") {
    let end = -1;
    for (let k = 1; k < s.length; k++) {
      if (q === '"' && s[k] === '\\') { k++; continue; }
      if (s[k] === q) {
        if (q === "'" && s[k + 1] === "'") { k++; continue; } // '' is an escaped quote
        end = k;
        break;
      }
    }
    if (end === -1) return s.slice(1); // unterminated: take what follows the quote
    const inner = s.slice(1, end);
    return q === '"' ? inner.replace(/\\(["\\/])/g, '$1') : inner.replace(/''/g, "'");
  }
  return s.replace(/\s+#.*$/, '').trim();
}

const isTrue = (v) => scalar(v).toLowerCase() === 'true';

const firstSet = (values) => {
  for (const v of values) if (v != null && v !== '') return v;
  return null;
};

/** Remove the common leading indentation of a block scalar body; blank lines stay empty. */
function dedent(lines) {
  let min = Infinity;
  for (const l of lines) {
    if (l.trim() === '') continue;
    min = Math.min(min, l.length - l.trimStart().length);
  }
  if (!Number.isFinite(min)) return lines.map(() => '');
  return lines.map((l) => (l.trim() === '' ? '' : l.slice(min)));
}

/** `>` folded style: adjacent lines join with a space; a blank line starts a new paragraph. */
function fold(lines) {
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) { out.push(cur.join(' ')); cur = []; }
    } else {
      cur.push(l.trim());
    }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

/** A one-line YAML flow map (`{ a: x, b: 'y' }`) as `{ key: scalar }`; anything else gives `{}`. */
function flowMap(v) {
  const s = asString(v).trim();
  const out = {};
  if (!s.startsWith('{')) return out;
  const end = s.lastIndexOf('}');
  const body = s.slice(1, end === -1 ? undefined : end);
  const parts = [];
  let cur = '';
  let q = null;
  for (const ch of body) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  for (const part of parts) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(part);
    if (m) out[m[1]] = scalar(m[2]);
  }
  return out;
}

/**
 * A `with:` key (block or flow spelling) recorded on the raw step: `actions/checkout`'s `path` and
 * `repository`, and any action's `working-directory` (TRD 43-12: where an action such as
 * golangci-lint-action runs; read only as a plain scalar).
 */
function applyWithKey(step, key, value) {
  if (key === 'path') step.withPath = scalar(value) || null;
  else if (key === 'repository') step.withRepo = scalar(value) || null;
  else if (key === 'working-directory') step.withCwd = scalar(value);
}

// ─── working-directory normalisation (TRD 42-14, D1) ──────────────────────
//
// CI often checks THIS repo out into a subdir (`actions/checkout … with: { path: svcrepo }`) and
// then says `working-directory: svcrepo/go`, which is `go` in the repo. Other checkout steps put a
// DIFFERENT repo (`repository:` + `path:`) beside it; a cwd inside one of those is not this repo.

const WORKSPACE_RE = /^(?:\$\{\{\s*github\.workspace\s*\}\}|\$\{?GITHUB_WORKSPACE\}?)(?:\/+|$)/;
const SELF_REPOSITORY = /^\$\{\{\s*github\.repository\s*\}\}$/;

/** A repo-relative posix dir: `${{ github.workspace }}/` and `./` stripped; null for the root. */
function cleanRel(p) {
  if (p == null) return null;
  let s = asString(p).trim().replace(/\\/g, '/');
  if (!s) return null;
  const ws = WORKSPACE_RE.exec(s);
  if (ws) s = s.slice(ws[0].length);
  s = s.replace(/^(?:\.\/+)+/, '');
  if (!s) return null;
  const n = path.posix.normalize(s).replace(/\/+$/, '');
  return n === '.' || n === '' ? null : n;
}

const under = (p, base) => p === base || p.startsWith(`${base}/`);
const stripBase = (p, base) => (p === base ? null : p.slice(base.length + 1));

function isDir(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * normaliseWorkingDirectory(raw, { root, repoName, selfCheckoutPath, otherCheckoutPaths }) -> { cwd, external }
 *
 * In order: `${{ github.workspace }}/` (or `$GITHUB_WORKSPACE/`) and a leading `./` are stripped;
 * a cwd at or under another checkout's `path:` is returned as-is with `external: true`; a leading
 * `<p>/` is stripped when `<p>` is the job's self-checkout `path:`; else, only when the job has no
 * self-checkout path, a leading `<repoName>/` is stripped when `<root>/<repoName>` does NOT exist
 * (a real dir of that name is never stripped). Anything undecidable is kept as written; the
 * verifier's `cwd_missing` catches a wrong guess. `cwd` is null for the repo root.
 */
function normaliseWorkingDirectory(raw, { root = null, repoName = null, selfCheckoutPath = null, otherCheckoutPaths = [] } = {}) {
  const s = cleanRel(raw);
  if (s === null) return { cwd: null, external: false };
  for (const other of Array.isArray(otherCheckoutPaths) ? otherCheckoutPaths : []) {
    const o = cleanRel(other);
    if (o && under(s, o)) return { cwd: s, external: true };
  }
  const self = cleanRel(selfCheckoutPath);
  if (self) {
    if (under(s, self)) return { cwd: stripBase(s, self), external: false };
    return { cwd: s, external: false };
  }
  const name = repoName || (root ? path.basename(String(root)) : null);
  if (name && root && under(s, name) && !isDir(path.join(String(root), name))) {
    return { cwd: stripBase(s, name), external: false };
  }
  return { cwd: s, external: false };
}

/** The job's checkouts -> { selfCheckoutPath, otherCheckoutPaths } for normaliseWorkingDirectory. */
function checkoutContext(checkouts) {
  let selfCheckoutPath = null;
  const otherCheckoutPaths = [];
  for (const c of checkouts) {
    if (!c.path) continue;
    const self = !c.repository || SELF_REPOSITORY.test(c.repository);
    if (self) {
      if (selfCheckoutPath === null) selfCheckoutPath = c.path;
    } else {
      otherCheckoutPaths.push(c.path);
    }
  }
  return { selfCheckoutPath, otherCheckoutPaths };
}

// ─── env literals (TRD 43-09) ─────────────────────────────────────────────────
//
// A workflow, job or step `env:` value that is a plain literal (`CHART_DIR: helm/x`) is what the shell
// sees for `$CHART_DIR` / `${CHART_DIR}`, so it is substituted into the run lines (step > job >
// workflow) before invocations are built: `helm lint "${CHART_DIR}/"` reads `helm lint helm/x/`.
// Runtime values are never substituted: a `${{ }}` expression or any other `$` in the value, a block
// scalar, a variable assigned inside the same run block, one an earlier step of the job writes to
// $GITHUB_ENV, and anything inside single quotes.

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// What may stand unquoted in a shell word: the stack-evidence `shq` safe set.
const SAFE_WORD = /^[\w@%+=:,./-]+$/;

/** An `env:` entry's literal value, or null when it is not a literal this reader may substitute. */
function envLiteral(value, block) {
  if (block) return null;
  const raw = asString(value).trim();
  if (!raw || raw.startsWith('*') || raw.startsWith('{') || raw.startsWith('[')) return null;
  const v = scalar(raw);
  if (!v || /[$`\\"\n]/.test(v)) return null;
  return v;
}

/** Record one `env:` entry: its literal, or null (a runtime value at this level hides an outer literal). */
function setEnv(target, key, value, block) {
  if (!ENV_NAME.test(String(key))) return;
  target[key] = envLiteral(value, block);
}

function mergeFlowEnv(target, value) {
  const s = asString(value).trim();
  if (!s.startsWith('{')) return;
  const m = flowMap(s); // values already unquoted: re-quote so envLiteral reads them as one scalar
  for (const k of Object.keys(m)) setEnv(target, k, JSON.stringify(m[k]), null);
}

/** Names the run text assigns itself (`X=…`, `export X=…`, `for X in`, `read X`): runtime, never substituted. */
function assignedNames(text) {
  const out = new Set();
  const assign = /(?:^|[\s;&|(`"'])(?:(?:export|local|readonly|declare|typeset)\s+(?:-\w+\s+)*)?([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\])?\+?=/g;
  let m;
  while ((m = assign.exec(text)) !== null) out.add(m[1]);
  const loop = /\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g;
  while ((m = loop.exec(text)) !== null) out.add(m[1]);
  const read = /\bread\s+(?:-\w+\s+)*([A-Za-z_][A-Za-z0-9_]*(?:\s+[A-Za-z_][A-Za-z0-9_]*)*)/g;
  while ((m = read.exec(text)) !== null) for (const n of m[1].split(/\s+/)) out.add(n);
  return out;
}

// ─── runtime-assigned names (TRD 43-13) ───────────────────────────────────────
//
// step.runtimeVars: the names a run block assigns a value that is only known when it runs, so a command
// expanding one (`go test ./... -skip "${SKIP}"` after `SKIP="$(./scripts/print-skips.sh)"`) is parameterised
// at run time. A command substitution anywhere in the value (`X=$(…)`, `X="$(…)"`, `` X=`…` ``), an
// `export X=…`, a `read [-r] X` and a `for X in` loop variable are runtime, and so is a name assigned from one
// of those (`PKG="${line%%=*}"` inside `while read -r line`). A plain literal (`OUT=dist`, `IFS=`), a
// `${{ }}` value (GitHub fills it before the shell runs) and an `env:` name substituted into the line are not.

/** The text with every single-quoted span removed: nothing inside single quotes expands. */
const unquoteSingle = (s) => String(s).replace(/'[^']*'/g, "''");

/** The shell word starting at `i` (quotes, backticks and `$( )` nesting respected). */
function wordAt(text, i) {
  let single = false;
  let double = false;
  let tick = false;
  let depth = 0;
  let j = i;
  for (; j < text.length; j++) {
    const ch = text[j];
    if (single) {
      if (ch === "'") single = false;
      continue;
    }
    if (ch === '\\') {
      j += 1;
      continue;
    }
    if (ch === '`') tick = !tick;
    else if (ch === '$' && text[j + 1] === '(') {
      depth += 1;
      j += 1;
    } else if (ch === ')' && depth > 0) depth -= 1;
    else if (ch === '"') double = !double;
    else if (ch === "'" && !double) single = true;
    else if (!double && !tick && depth === 0 && /[\s;&|]/.test(ch)) break;
  }
  return text.slice(i, j);
}

/** True when `text` expands `$NAME` / `${NAME…}` for one of `names` outside single quotes. */
function expandsAny(text, names) {
  if (!names || !names.length) return false;
  const t = unquoteSingle(text);
  return names.some((n) => {
    const name = escapeRegExp(n);
    return new RegExp(`\\$(?:\\{${name}(?![A-Za-z0-9_])|${name}(?![A-Za-z0-9_]))`).test(t);
  });
}

/** runtimeVarsOf(text) -> the run block's runtime-assigned names, in first-seen order (see the section header). */
function runtimeVarsOf(text) {
  const src = String(text || '');
  const out = [];
  const add = (n) => { if (!out.includes(n)) out.push(n); };
  let m;
  const loop = /\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g;
  while ((m = loop.exec(src)) !== null) add(m[1]);
  const read = /\bread\s+(?:-\w+\s+)*([A-Za-z_][A-Za-z0-9_]*(?:[ \t]+[A-Za-z_][A-Za-z0-9_]*)*)/g;
  while ((m = read.exec(src)) !== null) for (const n of m[1].split(/[ \t]+/)) add(n);
  const assigns = [];
  const assign = /(?:^|[\s;&|(])((?:export|declare\s+-x)\s+(?:-\w+\s+)*)?([A-Za-z_][A-Za-z0-9_]*)=/gm;
  while ((m = assign.exec(src)) !== null) {
    assigns.push({ name: m[2], exported: !!m[1], value: wordAt(src, m.index + m[0].length) });
  }
  // Two passes, so a name derived from one assigned later in the text (a loop body) is still caught.
  for (let pass = 0; pass < 2; pass++) {
    for (const a of assigns) {
      if (out.includes(a.name)) continue;
      const v = unquoteSingle(a.value);
      if (a.exported || v.includes('$(') || v.includes('`') || expandsAny(a.value, out)) add(a.name);
    }
  }
  return out;
}

/** Names a run text writes to $GITHUB_ENV (`echo "X=…" >> "$GITHUB_ENV"`, `X<<EOF`): runtime for later steps. */
function githubEnvNames(text) {
  const out = new Set();
  for (const line of text.split('\n')) {
    if (!/GITHUB_ENV/.test(line)) continue;
    const re = /([A-Za-z_][A-Za-z0-9_]*)(?:=|<<)/g;
    let m;
    while ((m = re.exec(line)) !== null) out.add(m[1]);
  }
  return out;
}

/**
 * substituteEnv(text, env) -> { text, used }. Quote-aware: nothing inside single quotes, a `\$` stays,
 * `$NAME` / `${NAME}` only (never `${NAME:-x}` and friends). Outside quotes a value must be a safe word;
 * inside double quotes any literal will do, and a double-quoted word that held a substitution and is
 * left a safe word loses its quotes (`"${CHART}/"` -> `helm/x/`).
 */
function substituteEnv(text, env) {
  const used = [];
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let dqStart = -1;
  let dqSubst = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inSingle) {
      out += ch;
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (ch === '\\') {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      if (!inDouble) {
        inDouble = true;
        dqStart = out.length;
        dqSubst = false;
        out += ch;
      } else {
        inDouble = false;
        const content = out.slice(dqStart + 1);
        if (dqSubst && SAFE_WORD.test(content)) out = out.slice(0, dqStart) + content;
        else out += ch;
      }
      i += 1;
      continue;
    }
    if (ch === '$') {
      if (text[i + 1] === '$') { // `$$` is the shell's pid, never a reference
        out += '$$';
        i += 2;
        continue;
      }
      const m = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/.exec(text.slice(i));
      const name = m ? (m[1] || m[2]) : null;
      const value = name !== null && Object.prototype.hasOwnProperty.call(env, name) ? env[name] : null;
      if (value !== null && (inDouble || SAFE_WORD.test(value))) {
        out += value;
        if (inDouble) dqSubst = true;
        if (!used.includes(name)) used.push(name);
        i += m[0].length;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return { text: out, used };
}

function applyStepKey(step, key, value, block) {
  switch (key) {
    case 'name': step.name = scalar(value) || null; break;
    case 'uses': step.uses = scalar(value) || null; break;
    case 'with': {
      const m = flowMap(value);
      for (const k of Object.keys(m)) applyWithKey(step, k, m[k]);
      break;
    }
    case 'env': mergeFlowEnv(step.env, value); break;
    case 'working-directory': step.cwd = scalar(value) || null; break;
    case 'continue-on-error': step.coe = isTrue(value); break;
    case 'run':
      if (block) {
        step.runLines = block.style === '>' ? fold(block.lines) : block.lines;
      } else {
        const v = scalar(value);
        step.runLines = v ? [v] : [];
      }
      break;
    default: break;
  }
}

/**
 * parseDoc(doc, file) -> steps[]
 *
 * One YAML document. Two phases: (1) walk the lines collecting raw steps plus the workflow / job
 * defaults, (2) once the whole document is read, resolve each step's effective cwd and normalise its
 * `run:` body — so key ORDER never matters (`defaults:` may follow `jobs:`, `working-directory:`
 * may follow `run:`).
 */
function parseDoc(doc, file, { root = null, repoName = null } = {}) {
  const lines = doc.split('\n').map((l) => l.replace(/\r$/, ''));
  const stack = []; // open mapping keys: { col, key }
  let wfCwd = null;
  let scheduled = false;
  const jobCwd = new Map();
  const jobCoe = new Map();
  const wfEnv = {}; // TRD 43-09: literal `env:` values per level
  const jobEnv = new Map();
  const jobEnvOf = (job) => {
    if (!jobEnv.has(job)) jobEnv.set(job, {});
    return jobEnv.get(job);
  };
  const jobServices = new Map(); // TRD 71-03: job -> the names under its block `services:`
  const rawSteps = [];
  let cur = null;
  let stepsDash = null; // indent of the current job's `steps:` list dashes

  try {
    let i = 0;
    while (i < lines.length) {
      const line = lines[i++];
      if (!line.trim() || COMMENT_RE.test(line)) continue;
      const dm = DASH_RE.exec(line);
      const km = KEY_RE.exec(line);
      if (!dm && !km) continue;

      const indent = line.length - line.trimStart().length;
      const col = dm ? dm[0].length : indent; // the column the key itself starts at

      // A dash at the steps-list indent ALWAYS opens a sibling step, however tangled the lines
      // before it were: re-sync to the `steps:` frame instead of trusting the popped stack.
      const inSteps = stack.length >= 3 && stack[0].key === 'jobs' && stack[2].key === 'steps';
      if (dm && inSteps && stepsDash !== null && indent === stepsDash) {
        while (stack.length > 3) stack.pop();
      } else {
        while (stack.length && stack[stack.length - 1].col >= col) stack.pop();
      }
      const p = stack.map((f) => f.key);

      const key = km ? (km[3] !== undefined ? km[3] : km[4] !== undefined ? km[4] : km[5]) : null;
      const value = km && km[6] !== undefined ? km[6] : '';

      // A block scalar is consumed wholesale, whatever key owns it, so its body is never
      // mistaken for structure (a `script: |` under `with:` may contain `run:` look-alikes).
      let block = null;
      if (km && BLOCK_RE.test(value)) {
        const body = [];
        while (i < lines.length) {
          const l = lines[i];
          if (l.trim() === '') { body.push(''); i++; continue; }
          if (l.length - l.trimStart().length <= col) break;
          body.push(l);
          i++;
        }
        while (body.length && body[body.length - 1] === '') body.pop();
        block = { style: value[0], lines: dedent(body) };
      }

      if (km) {
        if (p.length === 0) {
          if ((key === 'on' || key === 'true') && /\bschedule\b/.test(value)) scheduled = true;
          else if (key === 'env') mergeFlowEnv(wfEnv, value);
        } else if (p.length === 1 && p[0] === 'on' && key === 'schedule') {
          scheduled = true;
        } else if (p.length === 1 && p[0] === 'env') {
          setEnv(wfEnv, key, value, block);
        } else if (p.length === 2 && p[0] === 'defaults' && p[1] === 'run' && key === 'working-directory') {
          wfCwd = scalar(value) || null;
        } else if (p[0] === 'jobs' && p.length >= 2) {
          const job = p[1];
          if (p.length === 2 && key === 'continue-on-error') jobCoe.set(job, isTrue(value));
          else if (p.length === 2 && key === 'steps') stepsDash = null;
          else if (p.length === 2 && key === 'env') mergeFlowEnv(jobEnvOf(job), value);
          else if (p.length === 3 && p[2] === 'env') setEnv(jobEnvOf(job), key, value, block);
          else if (p.length === 3 && p[2] === 'services' && key) {
            if (!jobServices.has(job)) jobServices.set(job, []);
            jobServices.get(job).push(key);
          } else if (p.length === 4 && p[2] === 'defaults' && p[3] === 'run' && key === 'working-directory') {
            jobCwd.set(job, scalar(value) || null);
          }
        }
      } else if (p.length === 1 && p[0] === 'on' && /^\s*-\s*schedule\s*$/.test(line)) {
        scheduled = true; // `on:` written as a list: `- schedule`
      }

      const atStepLevel = p.length === 3 && p[0] === 'jobs' && p[2] === 'steps';
      if (dm && atStepLevel) {
        if (stepsDash === null) stepsDash = indent;
        if (indent === stepsDash) {
          cur = { job: p[1], name: null, uses: null, cwd: null, coe: null, runLines: null, env: {}, keyCol: col };
          rawSteps.push(cur);
        }
      }
      if (km && cur && atStepLevel && cur.job === p[1] && col === cur.keyCol) {
        applyStepKey(cur, key, value, block);
      }
      // A direct child of the current step's own `with:` / `env:` (block spelling).
      if (km && cur && p.length === 4 && p[0] === 'jobs' && p[2] === 'steps'
        && cur.job === p[1] && stack[3].col === cur.keyCol) {
        if (p[3] === 'with') applyWithKey(cur, key, value);
        else if (p[3] === 'env') setEnv(cur.env, key, value, block);
      }
      if (km) stack.push({ col, key });
    }
  } catch (_) {
    // A shape this reader does not understand: keep whatever was read so far.
  }

  // Per-job `actions/checkout` steps, in declaration order (TRD 42-14).
  const jobCheckouts = new Map();
  for (const s of rawSteps) {
    if (!s.uses || !/^actions\/checkout(?:@|$)/.test(s.uses)) continue;
    if (!jobCheckouts.has(s.job)) jobCheckouts.set(s.job, []);
    jobCheckouts.get(s.job).push({ path: cleanRel(s.withPath), repository: s.withRepo || null });
  }

  const steps = [];
  const exported = new Map(); // job -> names an earlier step wrote to $GITHUB_ENV (TRD 43-09)
  for (const s of rawSteps) {
    if (s.uses == null && s.runLines == null) continue; // a step with nothing to run or use
    const rawCwd = firstSet([s.cwd, jobCwd.get(s.job), wfCwd]);
    const checkouts = (jobCheckouts.get(s.job) || []).map((c) => ({ ...c }));
    const ctx = { root, repoName, ...checkoutContext(checkouts) };
    const continueOnError = s.coe !== null ? s.coe : jobCoe.get(s.job) === true;
    let invocations = [];
    let envSubstituted = [];
    let runtimeVars = [];
    if (s.runLines) {
      let runLines = s.runLines;
      try {
        runtimeVars = runtimeVarsOf(s.runLines.join('\n'));
      } catch (_) {
        runtimeVars = [];
      }
      try {
        const runText = runLines.join('\n');
        if (!exported.has(s.job)) exported.set(s.job, new Set());
        const runtime = new Set([...exported.get(s.job), ...assignedNames(runText)]);
        for (const n of githubEnvNames(runText)) exported.get(s.job).add(n);
        const env = { ...wfEnv, ...(jobEnv.get(s.job) || {}), ...s.env };
        for (const n of runtime) delete env[n];
        if (Object.keys(env).length) {
          const sub = substituteEnv(runText, env);
          if (sub.used.length) {
            runLines = sub.text.split('\n');
            envSubstituted = sub.used;
          }
        }
      } catch (_) {
        runLines = s.runLines;
        envSubstituted = [];
      }
      try {
        // The RAW cwd seeds the block so a `cd` composes against what CI really ran in; each
        // resulting cwd is then normalised on its own (a `cd ../libs/x` can reach a sibling).
        invocations = normalizeScript(runLines, { cwd: rawCwd });
      } catch (_) {
        invocations = [];
      }
    }
    for (const inv of invocations) {
      const n = normaliseWorkingDirectory(inv.cwd, ctx);
      inv.cwd = n.cwd;
      inv.external = n.external;
    }
    const { cwd, external } = normaliseWorkingDirectory(rawCwd, ctx);
    // TRD 71-03: the job's service containers and the env names in scope (workflow, job, step). Names only: a
    // runtime-valued entry (`${{ secrets.X }}`) is a null literal above and still counts as a name here. A
    // service container's own `env:` is deeper than the job's and never reaches `envNames`.
    const services = [...new Set(jobServices.get(s.job) || [])].sort();
    const envNames = Object.keys({ ...wfEnv, ...(jobEnv.get(s.job) || {}), ...s.env }).sort();
    const step = { file, job: s.job, name: s.name, uses: s.uses, cwd, external, checkouts, continueOnError, scheduled, invocations, envSubstituted, runtimeVars, services, envNames };
    // An action's own `with: working-directory` (TRD 43-12), normalised like a step cwd; null is the repo root.
    if (typeof s.withCwd === 'string' && s.withCwd.trim() !== '') {
      const w = normaliseWorkingDirectory(s.withCwd, ctx);
      step.with = { 'working-directory': w.cwd };
      if (w.external) step.withExternal = true;
    }
    steps.push(step);
  }
  return steps;
}

/**
 * _parseWorkflowText(text, file) -> steps[]
 *
 * Exported for unit tests. Splits multi-document files on `---` so workflow-level state (defaults,
 * schedule) never leaks from one document to the next, and never throws.
 */
function _parseWorkflowText(text, file, opts = {}) {
  const out = [];
  let src;
  try {
    src = asString(text).replace(/^﻿/, '');
  } catch (_) {
    return out;
  }
  for (const doc of src.split(/^---[ \t]*\r?$/m)) {
    if (!doc.trim()) continue;
    try {
      for (const step of parseDoc(doc, file, opts || {})) out.push(step);
    } catch (_) {
      // skip an unreadable document
    }
  }
  return out;
}

/**
 * parseWorkflows(root) -> [{ file, job, name, uses, cwd, external, checkouts, continueOnError, scheduled, invocations }]
 *
 * `file` is repo-relative (`.github/workflows/ci.yml`). Files are read in sorted order; `.yml` and
 * `.yaml` both count. `cwd` is the effective step directory — step `working-directory`, else job
 * `defaults.run.working-directory`, else workflow-level — NORMALISED against the job's checkouts
 * (normaliseWorkingDirectory, TRD 42-14), or null for the repo root. `external` is true when that
 * cwd is inside another repo's checkout. `checkouts` lists the job's `actions/checkout` steps as
 * `{ path, repository }`. Each invocation additionally carries any `cd` made inside the block, and
 * its own normalised `cwd` + `external`. `scheduled` is per WORKFLOW. A `uses:` step is recorded
 * with `uses` set and `invocations: []`. A step whose `with:` sets `working-directory` also carries
 * `with: { 'working-directory': <normalised dir, null for the root> }` (and `withExternal: true` when that
 * dir is in another checkout); it never changes `cwd` (TRD 43-12). Every step also carries `services` (the
 * names under its job's block `services:`, sorted, `[]` when the job has none) and `envNames` (the workflow,
 * job and step `env:` names in scope, sorted; a service container's own `env:` is not one), TRD 71-03.
 */
function parseWorkflows(root) {
  const dir = path.join(root, '.github', 'workflows');
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const out = [];
  for (const name of entries.filter((f) => /\.ya?ml$/.test(f)).sort()) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf-8');
    } catch (_) {
      continue;
    }
    const opts = { root, repoName: path.basename(path.resolve(String(root))) };
    for (const step of _parseWorkflowText(text, `.github/workflows/${name}`, opts)) out.push(step);
  }
  return out;
}

module.exports = { parseWorkflows, _parseWorkflowText, normaliseWorkingDirectory, expandsAny };
