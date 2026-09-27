'use strict';

// stack-evidence.cjs — command evidence readers for `df-tools stack init` (TRD 35-04).
//
// Reads file FORMATS (a GitHub Actions workflow, a Makefile, a justfile, a package.json, a
// STACK.md `## Commands` table, a fenced TESTING.md snippet) and turns whatever run-invocations
// they contain into `{ key, command, source }` evidence — never a language or framework name.
// The only tool names this module may ever emit are the runner IMPLIED by the file itself
// (`make`, `just`, `npm`); see `docs/PROPOSAL-stack-profile.md` and the 35-04 TRD's neutrality
// constraint. `stack-profile.cjs` (the loader/resolver) stays entirely free of this — evidence
// gathering is drafting-only, and lives here so the loader can keep being required by every
// caller without pulling in file-format parsing it never needs.
//
// `.github/workflows/*.yml` is read line by line, NOT through yaml-lite: real GitHub Actions
// YAML routinely uses constructs (anchors, multi-document files, `on:` as a bare key) outside
// yaml-lite's deliberately narrow subset, and a `run:` step is a single well-known shape a
// handful of regexes finds reliably without a full parser.

const fs = require('fs');
const path = require('path');

const STANDARD_KEYS = ['build', 'test', 'lint', 'format', 'fix', 'typecheck', 'audit', 'codegen', 'deps'];

// Order matters: this is the exact precedence the TRD's design lists, and it is the order a
// hint or a command string is tested in when more than one token could match.
const TOKEN_MAP = [
  ['test', /\btests?\b/],
  ['lint', /\blint\b/],
  ['format', /\b(fmt|format)\b/],
  ['build', /\bbuild\b/],
  ['typecheck', /\btype-?check\b/],
  ['audit', /\baudit\b/],
  ['codegen', /\b(generate|codegen)\b/],
  ['fix', /\bfix\b/],
];

/**
 * classifyCommand(cmd, hint) -> a STANDARD_KEYS member, or null when nothing matches.
 *
 * The hint (a Makefile target, a justfile recipe name, a package.json script name) is checked
 * FIRST — it is usually the more deliberate signal, a name someone chose — and only when it
 * matches nothing does the command's own text get checked.
 */
function classifyCommand(cmd, hint) {
  if (hint) {
    for (const [key, re] of TOKEN_MAP) {
      if (re.test(hint)) return key;
    }
  }
  if (cmd) {
    for (const [key, re] of TOKEN_MAP) {
      if (re.test(cmd)) return key;
    }
  }
  return null;
}

function rel(projectRoot, full) {
  return path.relative(projectRoot, full).split(path.sep).join('/');
}

function stripQuotes(s) {
  const t = String(s).trim();
  if (t.length >= 2) {
    const first = t.charAt(0);
    const last = t.charAt(t.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return t.slice(1, -1);
    }
  }
  return t;
}

// ─── 1. Explicit table: .planning/<from>/STACK.md `## Commands` rows ──────────

function readCommandsTable(projectRoot, from, push) {
  const full = path.join(projectRoot, '.planning', from, 'STACK.md');
  let text;
  try {
    text = fs.readFileSync(full, 'utf-8');
  } catch (_) {
    return;
  }
  const lines = text.split('\n');
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+Commands\b/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    const m = /^\|\s*([A-Za-z][A-Za-z0-9_-]*)\s*\|\s*`([^`]+)`\s*\|/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'key') continue; // header row
    push(key, m[2].trim(), rel(projectRoot, full));
  }
}

// ─── 2. CI: .github/workflows/*.yml|*.yaml `run:` lines and `run: |` blocks ───

function readCiWorkflows(projectRoot, push) {
  const dir = path.join(projectRoot, '.github', 'workflows');
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return;
  }
  const files = entries.filter((f) => /\.ya?ml$/.test(f)).sort();
  for (const file of files) {
    const full = path.join(dir, file);
    let text;
    try {
      text = fs.readFileSync(full, 'utf-8');
    } catch (_) {
      continue;
    }
    const source = rel(projectRoot, full);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*(?:-\s+)?)run:\s*(.*)$/.exec(lines[i]);
      if (!m) continue;
      const baseIndent = m[1].length;
      const rest = m[2].trim();
      if (/^[|>][+-]?$/.test(rest)) {
        // Block scalar: every subsequent, non-blank line indented deeper than `run:` itself is
        // a command line, one per line, until the indentation drops back to (or below) baseIndent.
        let j = i + 1;
        while (j < lines.length) {
          const l = lines[j];
          if (l.trim() === '') { j++; continue; }
          const indent = l.length - l.replace(/^\s*/, '').length;
          if (indent <= baseIndent) break;
          const cmd = l.trim();
          const key = classifyCommand(cmd, null);
          if (key) push(key, cmd, source);
          j++;
        }
        i = j - 1;
        continue;
      }
      const cmd = stripQuotes(rest);
      if (!cmd) continue;
      const key = classifyCommand(cmd, null);
      if (key) push(key, cmd, source);
    }
  }
}

// ─── 3. Makefile targets -> `make <t>` ────────────────────────────────────────

function readMakefile(projectRoot, push) {
  const full = path.join(projectRoot, 'Makefile');
  let text;
  try {
    text = fs.readFileSync(full, 'utf-8');
  } catch (_) {
    return;
  }
  const source = rel(projectRoot, full);
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z0-9_.-]+):(?!=)/.exec(line);
    if (!m) continue;
    const target = m[1];
    if (target === '.PHONY' || target === '.DEFAULT') continue;
    const command = `make ${target}`;
    const key = classifyCommand(command, target);
    if (key) push(key, command, source);
  }
}

// ─── 4. justfile/Justfile recipes -> `just <r>` ───────────────────────────────

function readJustfile(projectRoot, push) {
  for (const name of ['justfile', 'Justfile']) {
    const full = path.join(projectRoot, name);
    let text;
    try {
      text = fs.readFileSync(full, 'utf-8');
    } catch (_) {
      continue;
    }
    const source = rel(projectRoot, full);
    for (const line of text.split('\n')) {
      if (/^\s/.test(line)) continue; // recipe bodies are indented; not a recipe header
      if (/^\s*#/.test(line)) continue; // comment
      const m = /^([A-Za-z_][A-Za-z0-9_-]*)[^:=]*:(?!=)/.exec(line);
      if (!m) continue;
      const recipe = m[1];
      const command = `just ${recipe}`;
      const key = classifyCommand(command, recipe);
      if (key) push(key, command, source);
    }
    return; // only the first justfile variant found is read
  }
}

// ─── 5. package.json scripts ───────────────────────────────────────────────────

function readPackageJson(projectRoot, push) {
  const full = path.join(projectRoot, 'package.json');
  let text;
  try {
    text = fs.readFileSync(full, 'utf-8');
  } catch (_) {
    return;
  }
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (_) {
    return; // malformed JSON: skipped, never thrown
  }
  const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
  const source = rel(projectRoot, full);
  for (const [name, cmd] of Object.entries(scripts)) {
    if (name === 'test') {
      push('test', 'npm test', source);
      continue;
    }
    const key = classifyCommand(String(cmd), name);
    if (key) push(key, `npm run ${name}`, source);
  }
}

// ─── 6. .planning/codebase/TESTING.md fenced blocks (from=codebase only) ─────

function readTestingMd(projectRoot, push) {
  const full = path.join(projectRoot, '.planning', 'codebase', 'TESTING.md');
  let text;
  try {
    text = fs.readFileSync(full, 'utf-8');
  } catch (_) {
    return;
  }
  const source = rel(projectRoot, full);
  let inFence = false;
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    const fence = /^```(\w*)/.exec(trimmed);
    if (fence) {
      if (!inFence) {
        const lang = fence[1];
        inFence = lang === '' || lang === 'bash' || lang === 'sh';
      } else {
        inFence = false;
      }
      continue;
    }
    if (!inFence || trimmed === '') continue;
    const key = classifyCommand(trimmed, null);
    if (key) push(key, trimmed, source);
  }
}

/**
 * collectEvidence(projectRoot, { from }) -> [{ key, command, source }, ...]
 *
 * Reads every readable source, IN PRIORITY ORDER (explicit table, CI, Makefile, justfile,
 * package.json, then — for `from:'codebase'` only — TESTING.md), and returns every entry it
 * found, still in that order. A caller wanting "the" command for a key takes the FIRST matching
 * entry — evidence earlier in the list always outranks evidence later in it — but every entry
 * is kept so a draft can show its work.
 */
function collectEvidence(projectRoot, { from = 'codebase' } = {}) {
  const all = [];
  const push = (key, command, source) => {
    if (!key) return;
    all.push({ key, command, source });
  };

  readCommandsTable(projectRoot, from, push);
  readCiWorkflows(projectRoot, push);
  readMakefile(projectRoot, push);
  readJustfile(projectRoot, push);
  readPackageJson(projectRoot, push);
  if (from === 'codebase') readTestingMd(projectRoot, push);

  return all;
}

module.exports = {
  STANDARD_KEYS,
  classifyCommand,
  collectEvidence,
};
