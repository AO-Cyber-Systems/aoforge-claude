'use strict';

// stack-profile.cjs — the stack-profile loader core (TRD 35-02a).
//
// Parses a stack profile document (YAML front matter + H2 body sections) and resolves the
// full tier chain for a project: bundled general (always present) -> org/pack tier(s) reached
// through an `extends` chain -> the project's own override -> an optional component override
// selected by the longest matching path prefix. Each field in the merged result carries the
// name of the tier that supplied it.
//
// Command rendering and per-agent slicing are a separate module (35-02b); this module owns
// only parsing and resolution.
//
// Parses with yaml-lite.cjs, never frontmatter.cjs (the latter turns a flow map like
// `{ run: discover }` into a plain string, which loses exactly the shape this loader needs).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseYamlLite } = require('./yaml-lite.cjs');
const { validate: schemaValidate } = require('./json-schema-lite.cjs');
const { output, error, localDate } = require('./helpers.cjs');
// 35-02b built command rendering / per-agent context slicing as a separate module so it could
// run in parallel with 35-02a; re-exported below so every later caller requires only this file.
const { renderCommand, contextFor, AGENT_SLICES, AGENT_ALIASES } = require('./stack-render.cjs');
// 35-04's drafting flow reads repo evidence (CI, task runner, manifest scripts) through this
// sibling module so this loader itself never has to know a file FORMAT, only the command shape
// evidence produces — see stack-evidence.cjs's own header for why the split exists.
const { collectEvidence } = require('./stack-evidence.cjs');

const BUNDLED_PATH = path.join(__dirname, '../../references/stack-general.md');
// Tier-2 profiles shipped with the plugin (TRD 42-02). Resolved AFTER the user/org tier at
// `<home>/.claude/devflow/stacks/`, so a user profile with the same id always wins. The same
// `__dirname` join works from the repo checkout and from the `~/.claude/devflow` mirror.
const BUNDLED_STACKS_DIR = path.join(__dirname, '../../stack-profiles');
const SCHEMA_PATH = path.join(__dirname, '../../schemas/stack-profile.schema.json');
const FENCE = '---';
const MAX_EXTENDS_DEPTH = 4;
const MAX_BODY_LINES = 150;

const SECTION_NAMES = [
  'Principles',
  'Idioms',
  'Avoid',
  'Layout & architecture',
  'Testing',
  'Dependencies',
  'Generated code',
  'Security',
  'UI',
];

class StackProfileError extends Error {
  constructor(code, message, source) {
    super(source ? `${message} (${source})` : message);
    this.name = 'StackProfileError';
    this.code = code;
    this.source = source || null;
  }
}

// ─── parseProfile ──────────────────────────────────────────────────────────

// Splits body lines into named H2 sections. A ``` fence toggles a mode where a `## ` line is
// ordinary text, not a split point — so a fenced code sample may itself contain a heading-shaped
// line without breaking the document apart. Once a section is found, an immediate
// `<!-- inherit -->` marker (the first non-blank line) is captured as `inherit:true` and removed
// from the section's own text.
function splitSections(bodyLines) {
  const sections = [];
  let inFence = false;
  let current = null;

  const flush = () => {
    if (!current) return;
    let lines = current.lines;
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    let inherit = false;
    if (i < lines.length && lines[i].trim() === '<!-- inherit -->') {
      inherit = true;
      lines = lines.slice(0, i).concat(lines.slice(i + 1));
    }
    sections.push({ name: current.name, text: lines.join('\n').trim(), inherit });
  };

  for (const line of bodyLines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      if (current) current.lines.push(line);
      continue;
    }
    if (!inFence && /^## /.test(line)) {
      flush();
      current = { name: line.slice(3).trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return sections;
}

/**
 * Parse a stack profile document into its front matter and its named body sections.
 *
 * @param {string} text          the whole document
 * @param {{source?: string}}    [opts]  a path used in error messages only
 * @returns {{frontmatter: object, sections: Array<{name:string,text:string,inherit:boolean}>, bodyLineCount: number}}
 * @throws {StackProfileError}   NO_FRONTMATTER | UNTERMINATED | NOT_A_MAPPING | YAML
 */
function parseProfile(text, opts) {
  const source = (opts && opts.source) || null;
  const normalized = String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  if (lines[0] !== FENCE) {
    throw new StackProfileError(
      'NO_FRONTMATTER',
      'no front matter: a stack profile must open on line 1 with a `---` fence, its YAML, then a closing `---`',
      source
    );
  }

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FENCE) { close = i; break; }
  }
  if (close === -1) {
    throw new StackProfileError(
      'UNTERMINATED',
      'unterminated front matter: the `---` block opened on line 1 is never closed',
      source
    );
  }

  const yamlText = lines.slice(1, close).join('\n');
  let parsed;
  try {
    parsed = parseYamlLite(yamlText);
  } catch (err) {
    throw new StackProfileError('YAML', err.message, source);
  }
  const frontmatter = parsed === null ? {} : parsed;
  if (typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new StackProfileError(
      'NOT_A_MAPPING',
      'front matter must be a YAML mapping (`key: value`), not a list or a scalar',
      source
    );
  }

  const bodyLines = lines.slice(close + 1);
  const sections = splitSections(bodyLines);

  return { frontmatter, sections, bodyLineCount: bodyLines.length };
}

// ─── resolveProfile ────────────────────────────────────────────────────────
//
// The org tier is stored one file per id at `<userHome>/.claude/devflow/stacks/<id>.md`. This
// helper only builds that path — it is called only when a caller passes `userHome`, so this
// module never reaches for the operator's own home directory on its own.
function orgProfilePath(userHome, id) {
  return path.join(userHome, '.claude', 'devflow', 'stacks', `${id}.md`);
}

/**
 * profileLookup(id, { userHome, bundledDir }) -> { path, tier: 'user'|'bundled' } | null
 *
 * The user/org tier (`<userHome>/.claude/devflow/stacks/<id>.md`) first, then the bundled tier
 * (`<bundledDir>/<id>.md`). Either tier is skipped when its root is null, so `bundledDir: null`
 * restores the single-tier lookup exactly.
 */
function profileLookup(id, { userHome = null, bundledDir = BUNDLED_STACKS_DIR } = {}) {
  if (userHome) {
    const userPath = orgProfilePath(userHome, id);
    if (fs.existsSync(userPath)) return { path: userPath, tier: 'user' };
  }
  if (bundledDir) {
    const bundledPath = path.join(bundledDir, `${id}.md`);
    if (fs.existsSync(bundledPath)) return { path: bundledPath, tier: 'bundled' };
  }
  return null;
}

// The EXTENDS_UNRESOLVED message. With the bundled tier off it is byte-identical to the
// pre-42-02 single-tier text; with it on it names every place that was looked at.
function unresolvedMessage(id, { userHome, bundledDir }) {
  if (!bundledDir) {
    return userHome
      ? `extends '${id}' not found at ${orgProfilePath(userHome, id)}`
      : `extends '${id}' cannot be resolved: no org home was provided`;
  }
  const bundledPath = path.join(bundledDir, `${id}.md`);
  return userHome
    ? `extends '${id}' not found at ${orgProfilePath(userHome, id)} or ${bundledPath}`
    : `extends '${id}' not found at ${bundledPath} (no org home was provided)`;
}

// Walks an `extends` chain starting at `startId`, stopping at `general`. Returns hops in
// LOW -> HIGH order (the farthest ancestor first), never including `general` itself. Each hop
// carries `source` ('user' | 'bundled'): the tier `profileLookup` found it in. A cycle, a chain
// deeper than MAX_EXTENDS_DEPTH, or an id that cannot be found are all recorded as issues and
// stop the walk at that point — never thrown, so a caller always gets a usable, if partial,
// chain back.
function walkExtendsChain({ startId, userHome, bundledDir = BUNDLED_STACKS_DIR, issues }) {
  const collected = [];
  const seen = new Set();
  let id = startId;
  let depth = 0;

  while (id && id !== 'general') {
    if (depth >= MAX_EXTENDS_DEPTH) {
      issues.push({ code: 'EXTENDS_DEPTH', message: `extends chain exceeds ${MAX_EXTENDS_DEPTH} hops at '${id}'`, id });
      break;
    }
    if (seen.has(id)) {
      issues.push({ code: 'EXTENDS_CYCLE', message: `extends cycle detected at '${id}'`, id });
      break;
    }
    const found = profileLookup(id, { userHome, bundledDir });
    if (!found) {
      issues.push({ code: 'EXTENDS_UNRESOLVED', message: unresolvedMessage(id, { userHome, bundledDir }), id });
      break;
    }
    const text = fs.readFileSync(found.path, 'utf-8');
    const parsed = parseProfile(text, { source: found.path }); // a malformed org-tier file throws, per contract
    seen.add(id);
    collected.push({ id, path: found.path, source: found.tier, frontmatter: parsed.frontmatter, sections: parsed.sections });
    depth += 1;
    id = parsed.frontmatter.extends === undefined || parsed.frontmatter.extends === null
      ? 'general'
      : parsed.frontmatter.extends;
  }

  collected.reverse();
  return collected;
}

// Merges `layer` (a frontmatter object) into the accumulator `acc`, key by key, and records the
// supplying tier per dotted field path. A field is ATOMIC — replaced wholesale, never merged
// leaf by leaf — when it is itself an entry directly under `commands`, or its own value is an
// array, `null`, or a non-object scalar. Everything else that is a plain object is merged
// recursively, so unrelated leaves contributed by other tiers are never lost.
function mergeFrontmatter(acc, layer, tier, provenance, prefix) {
  for (const [key, value] of Object.entries(layer)) {
    // js/prototype-pollution-utility: a document-supplied key of exactly one of these three
    // names must never reach an assignment into `acc` — `__proto__` reaches the real
    // Object.prototype through the read-then-recurse branch below (acc[key] returns the
    // inherited prototype when acc has no own `__proto__`), and `constructor`/`prototype`
    // shadow the accumulator's own identity. Refused before any read or assignment happens.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const atomic = prefix === 'commands'
      || Array.isArray(value)
      || value === null
      || typeof value !== 'object';
    if (atomic) {
      acc[key] = value;
      provenance[fieldPath] = tier;
      continue;
    }
    if (typeof acc[key] !== 'object' || acc[key] === null || Array.isArray(acc[key])) {
      acc[key] = {};
    }
    mergeFrontmatter(acc[key], value, tier, provenance, fieldPath);
  }
}

// Merges body sections across layers, in the same LOW -> HIGH order as the layer list. A named
// section replaces the prior tier's text by default. It APPENDS instead — prior text, a blank
// line, then this tier's text — when the incoming section began with an `<!-- inherit -->`
// marker, or when its name is `Principles`, which always appends so the base principles can be
// extended by every tier but dropped by none of them.
function mergeSections(layers) {
  const acc = {};
  for (const layer of layers) {
    for (const section of layer.sections) {
      const prior = acc[section.name];
      if (!prior) {
        acc[section.name] = { text: section.text, sources: [layer.tier] };
        continue;
      }
      if (section.name === 'Principles' || section.inherit) {
        prior.text = `${prior.text}\n\n${section.text}`;
        prior.sources = prior.sources.concat(layer.tier);
      } else {
        prior.text = section.text;
        prior.sources = [layer.tier];
      }
    }
  }
  return acc;
}

function normalizeSlashes(p) {
  return String(p).replace(/\\/g, '/');
}

// Picks the component whose `path` is the LONGEST prefix of `file` (both compared with forward
// slashes so a caller on any platform gets the same match). A non-empty path without a trailing
// slash gets one appended before comparing (TRD 42-05), so `svc` matches `svc/x` but never
// `svcx/y`. Returns null when nothing matches.
function componentPrefix(p) {
  const norm = normalizeSlashes(p);
  return norm && !norm.endsWith('/') ? `${norm}/` : norm;
}

function matchComponent(components, file) {
  if (!Array.isArray(components) || !file) return null;
  const normFile = normalizeSlashes(file);
  let best = null;
  for (const candidate of components) {
    if (!candidate || typeof candidate.path !== 'string') continue;
    const p = componentPrefix(candidate.path);
    if (normFile.startsWith(p) && (!best || p.length > componentPrefix(best.path).length)) {
      best = candidate;
    }
  }
  return best;
}

let _cache = new Map();
function _resetCache() { _cache = new Map(); }

/**
 * Builds the full tier chain from an ALREADY-PARSED target (bundled general (always present),
 * then any org tier(s) reached through the target's own `extends` chain, then the target itself
 * as the top "project" layer, then an optional component override) and merges it. This is the
 * one place the chain-walk + merge logic lives — `resolveProfile` calls it after reading
 * `.planning/STACK.md` off disk; `validateProfileText` (35-03) calls it directly on a draft's
 * parsed frontmatter/sections, so a profile that has not been written to disk yet resolves
 * exactly the same way a saved one would.
 *
 * @param {{frontmatter: object, sections: Array}|null} parsedTarget  the target's own parse, or
 *   null when there is no project-tier document at all (bundled general only).
 * @param {{userHome?: string, file?: string, projectRoot?: string, targetPath?: string}} [ctx]
 *   `targetPath` is used only as the "project" layer's `path` (component-relative resolution and
 *   result labelling); it need not exist on disk.
 * @returns {{id, frontmatter, sections, provenance, chain, component, issues, projectFile, layers}}
 *   `layers` is the pre-merge list `[{id, tier, path, frontmatter, sections}, ...]` — each
 *   entry's OWN (unmerged) frontmatter, for callers (validateProfile) that schema-check each
 *   file in the chain individually rather than the merged result.
 */
function resolveFromParsed(parsedTarget, { userHome = null, file = null, projectRoot = null, targetPath = null, bundledDir = BUNDLED_STACKS_DIR } = {}) {
  const issues = [];
  const generalParsed = parseProfile(fs.readFileSync(BUNDLED_PATH, 'utf-8'), { source: BUNDLED_PATH });
  const layers = [{ id: 'general', tier: 'bundled', path: BUNDLED_PATH, frontmatter: generalParsed.frontmatter, sections: generalParsed.sections }];

  let projectFrontmatter = null;

  if (parsedTarget) {
    projectFrontmatter = parsedTarget.frontmatter;
    const extendsId = parsedTarget.frontmatter.extends === undefined || parsedTarget.frontmatter.extends === null
      ? 'general'
      : parsedTarget.frontmatter.extends;
    const orgHops = walkExtendsChain({ startId: extendsId, userHome, bundledDir, issues });
    for (const hop of orgHops) {
      layers.push({ id: hop.id, tier: 'org', source: hop.source, path: hop.path, frontmatter: hop.frontmatter, sections: hop.sections });
    }
    layers.push({ id: null, tier: 'project', path: targetPath, frontmatter: parsedTarget.frontmatter, sections: parsedTarget.sections });
  }

  // The matched component descriptor, and its own layer, if any.
  let component = null;
  if (file && projectFrontmatter) {
    const match = matchComponent(projectFrontmatter.components, file);
    if (match) {
      component = { path: match.path, profile: match.profile };
      const chainIds = new Set(layers.map((l) => l.id).filter(Boolean));

      if (typeof match.profile === 'string' && match.profile.endsWith('.md')) {
        const compPath = path.isAbsolute(match.profile) ? match.profile : path.join(projectRoot, match.profile);
        if (fs.existsSync(compPath)) {
          const parsed = parseProfile(fs.readFileSync(compPath, 'utf-8'), { source: compPath });
          // The file's own `extends` chain (TRD 42-05): each hop goes in BEFORE the file, so the
          // file overrides its parent. A hop the root chain already holds is not added twice.
          const compExtends = parsed.frontmatter.extends;
          if (compExtends !== undefined && compExtends !== null && compExtends !== 'general') {
            const fileHops = walkExtendsChain({ startId: compExtends, userHome, bundledDir, issues });
            for (const hop of fileHops) {
              if (chainIds.has(hop.id)) continue;
              chainIds.add(hop.id);
              layers.push({ id: hop.id, tier: 'component', source: hop.source, path: hop.path, frontmatter: hop.frontmatter, sections: hop.sections });
            }
          }
          layers.push({ id: null, tier: 'component', path: compPath, frontmatter: parsed.frontmatter, sections: parsed.sections });
        } else {
          issues.push({ code: 'COMPONENT_MISSING', message: `component profile file not found: ${compPath}`, id: match.profile });
        }
      } else if (typeof match.profile === 'string') {
        const compHops = walkExtendsChain({ startId: match.profile, userHome, bundledDir, issues });
        for (const hop of compHops) {
          if (chainIds.has(hop.id)) continue;
          layers.push({ id: hop.id, tier: 'component', source: hop.source, path: hop.path, frontmatter: hop.frontmatter, sections: hop.sections });
        }
      }
    }
  }

  const frontmatter = {};
  const provenance = {};
  for (const layer of layers) {
    mergeFrontmatter(frontmatter, layer.frontmatter, layer.tier, provenance, '');
  }
  const sections = mergeSections(layers);

  let id = 'general';
  for (const layer of layers) {
    if (layer.tier === 'bundled' || layer.tier === 'org') id = layer.id;
  }

  // `source` ('user' | 'bundled') is present only on hops found through profileLookup.
  const chain = layers.map((l) => (l.source
    ? { id: l.id, tier: l.tier, path: l.path, source: l.source }
    : { id: l.id, tier: l.tier, path: l.path }));

  return { id, frontmatter, sections, provenance, chain, component, issues, projectFile: targetPath, layers };
}

/**
 * Resolve the full tier chain for a project: bundled general (always present), then any org
 * tier(s) reached through an `extends` chain, then the project's own `.planning/STACK.md`
 * (when present), then an optional component override selected by the longest `path` prefix
 * of `file`. Results are cached by the exact triple of arguments; call `_resetCache()` to
 * force a re-read (tests do this in `beforeEach`).
 *
 * @param {{projectRoot?: string, userHome?: string, file?: string}} [opts]
 * @returns {{id, frontmatter, sections, provenance, chain, component, issues, projectFile}}
 * @throws {StackProfileError} only when a file already in the chain fails to parse
 */
function resolveProfile({ projectRoot = null, userHome = null, file = null, bundledDir = BUNDLED_STACKS_DIR } = {}) {
  const cacheKey = `${projectRoot || ''}|${userHome || ''}|${file || ''}|${bundledDir || ''}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  if (!fs.existsSync(BUNDLED_PATH)) {
    throw new StackProfileError(
      'MISSING_BUNDLED',
      `bundled stack-general.md not found at ${BUNDLED_PATH}; reinstall the devflow plugin`,
      BUNDLED_PATH
    );
  }

  let parsedTarget = null;
  let targetPath = null;
  if (projectRoot) {
    const candidate = path.join(projectRoot, '.planning', 'STACK.md');
    if (fs.existsSync(candidate)) {
      targetPath = candidate;
      parsedTarget = parseProfile(fs.readFileSync(candidate, 'utf-8'), { source: candidate });
    }
  }

  const result = resolveFromParsed(parsedTarget, { userHome, file, projectRoot, targetPath, bundledDir });
  _cache.set(cacheKey, result);
  return result;
}

// ─── validateProfile / validateProfileText ────────────────────────────────
//
// Schema check runs on EACH file's own frontmatter in the chain (errors carry that file);
// cross-field rules run on the resolved (merged) profile. See the STK code table in the TRD.

let _schema = null;
let _schemaNoId = null;
function loadStackProfileSchema() {
  if (!_schema) {
    _schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  }
  return _schema;
}

// `id` is required only for the tiers other profiles address BY id (bundled `general` and org/pack
// profiles reached via `extends`). A project's `.planning/STACK.md` and a file-path component
// override are leaves — never targeted by another profile's `extends` — so they conventionally omit
// `id` and inherit it from the chain. This variant drops that one requirement for those two tiers.
function loadStackProfileSchemaNoId() {
  if (!_schemaNoId) {
    const base = loadStackProfileSchema();
    _schemaNoId = Object.assign({}, base, { required: (base.required || []).filter((k) => k !== 'id') });
  }
  return _schemaNoId;
}

// STK010: a skill pin that is a whole-string template placeholder (`<sha>`, `<commit>`, ...).
const PLACEHOLDER_PIN = /^<[^<>]+>$/;

const ISSUE_TO_STK = {
  EXTENDS_UNRESOLVED: 'STK002',
  EXTENDS_CYCLE: 'STK003',
  EXTENDS_DEPTH: 'STK004',
  COMPONENT_MISSING: 'STK009',
};

// A parse failure (StackProfileError | YamlLiteError) becomes one STK008 error, never a throw.
function parseFailureResult(err, targetLabel, targetPath) {
  return {
    ok: false,
    target: targetLabel,
    errors: [{ code: 'STK008', path: '', msg: err.message, file: targetPath }],
    warnings: [],
  };
}

/**
 * Runs the schema walk + the four cross-field rules (STK005-STK009) over an already-resolved
 * chain, plus STK006/STK007 over the TARGET's own (unmerged) parse. Shared by validateProfile
 * and validateProfileText — both just supply a resolved chain and the target's own parse.
 */
function runValidationRules(resolved, parsedTarget, { projectRoot, userHome, targetPath, targetLabel, bundledDir = BUNDLED_STACKS_DIR }) {
  const errors = [];
  const warnings = [];
  const schema = loadStackProfileSchema();
  const schemaNoId = loadStackProfileSchemaNoId();

  // STK001 — schema violation, checked on EACH file's own (unmerged) frontmatter. `project` and
  // `component` tiers use the no-id-required variant (see loadStackProfileSchemaNoId).
  for (const layer of resolved.layers) {
    const layerSchema = layer.tier === 'bundled' || layer.tier === 'org' ? schema : schemaNoId;
    for (const e of schemaValidate(layer.frontmatter, layerSchema)) {
      errors.push({ code: 'STK001', path: e.path, msg: e.msg, file: layer.path });
    }
  }

  // STK002 / STK003 / STK004 / STK009 — issues the chain walk already found.
  for (const issue of resolved.issues) {
    const code = ISSUE_TO_STK[issue.code] || 'STK002';
    const path_ = issue.code === 'COMPONENT_MISSING' ? 'components' : 'extends';
    errors.push({ code, path: path_, msg: issue.message, file: targetPath });
  }

  // STK005 — loop / gates.task / gates.objective / generated.regenerate /
  // verification.runtime_check must each name a key present in the RESOLVED commands (a gate
  // key defined only in the org parent is fine — this is why it checks the MERGED result).
  const resolvedCommands = (resolved.frontmatter && resolved.frontmatter.commands) || {};
  const checkList = (value, fieldPath) => {
    if (!Array.isArray(value)) return;
    for (const key of value) {
      if (!(key in resolvedCommands)) {
        errors.push({ code: 'STK005', path: fieldPath, msg: `${fieldPath} names '${key}', which is not a defined command`, file: targetPath });
      }
    }
  };
  const checkScalar = (value, fieldPath) => {
    if (value === undefined || value === null) return;
    if (!(value in resolvedCommands)) {
      errors.push({ code: 'STK005', path: fieldPath, msg: `${fieldPath} names '${value}', which is not a defined command`, file: targetPath });
    }
  };
  checkList(resolved.frontmatter.loop, 'loop');
  const gates = resolved.frontmatter.gates || {};
  checkList(gates.task, 'gates.task');
  checkList(gates.objective, 'gates.objective');
  const generated = resolved.frontmatter.generated || {};
  checkScalar(generated.regenerate, 'generated.regenerate');
  const verification = resolved.frontmatter.verification || {};
  checkScalar(verification.runtime_check, 'verification.runtime_check');

  // STK006 — an H2 section on the TARGET's OWN document outside SECTION_NAMES.
  for (const section of parsedTarget.sections) {
    if (!SECTION_NAMES.includes(section.name)) {
      errors.push({
        code: 'STK006',
        path: `sections.${section.name}`,
        msg: `section '## ${section.name}' is not one of the recognized sections: ${SECTION_NAMES.join(', ')}`,
        file: targetPath,
      });
    }
  }

  // STK007 — the TARGET's OWN body over 150 lines (warning only; never flips `ok`).
  if (parsedTarget.bodyLineCount > MAX_BODY_LINES) {
    warnings.push({
      code: 'STK007',
      path: 'body',
      msg: `profile body is ${parsedTarget.bodyLineCount} lines, over the ${MAX_BODY_LINES}-line guideline`,
      file: targetPath,
    });
  }

  // STK010 — a placeholder skill pin (any whole-string `<...>`, e.g. "<sha>") on ANY layer of the
  // chain, plus the target's own parse (warning only; never flips `ok`). A placeholder is an
  // unpinned upstream, which is the thing a pin exists to prevent. One warning per
  // (source, pin, layer path), so a repeated entry in one file is reported once.
  const pinLayers = [...resolved.layers];
  if (parsedTarget && !pinLayers.some((l) => l.frontmatter === parsedTarget.frontmatter)) {
    pinLayers.push({ id: null, tier: 'project', path: targetPath, frontmatter: parsedTarget.frontmatter });
  }
  const seenPins = new Set();
  for (const layer of pinLayers) {
    const tooling = layer.frontmatter && layer.frontmatter.agent_tooling;
    const skills = tooling && Array.isArray(tooling.skills) ? tooling.skills : [];
    skills.forEach((skill, i) => {
      if (!skill || typeof skill.pin !== 'string' || !PLACEHOLDER_PIN.test(skill.pin)) return;
      const key = JSON.stringify([skill.source, skill.pin, layer.path]);
      if (seenPins.has(key)) return;
      seenPins.add(key);
      const label = `${layer.tier} layer${layer.id ? ` '${layer.id}'` : ''}`;
      warnings.push({
        code: 'STK010',
        path: `agent_tooling.skills[${i}].pin`,
        msg: `${label}: skill ${skill.source} has placeholder pin "${skill.pin}"; pin a real commit`,
        file: layer.path,
      });
    });
  }

  // STK009 — every declared component's profile eagerly, not only one selected by --file (the
  // chain walk above only checks a component matched via `file`, which validate never passes).
  const components = Array.isArray(resolved.frontmatter.components) ? resolved.frontmatter.components : [];
  for (const comp of components) {
    if (!comp || typeof comp.profile !== 'string') continue;
    if (comp.profile.endsWith('.md')) {
      const compPath = path.isAbsolute(comp.profile) ? comp.profile : path.join(projectRoot || '.', comp.profile);
      if (!fs.existsSync(compPath)) {
        errors.push({ code: 'STK009', path: 'components[].profile', msg: `component profile file not found: ${compPath}`, file: targetPath });
      }
    } else if (!profileLookup(comp.profile, { userHome, bundledDir })) {
      errors.push({ code: 'STK009', path: 'components[].profile', msg: `component profile '${comp.profile}' not found`, file: targetPath });
    }
  }

  return { ok: errors.length === 0, target: targetLabel, errors, warnings };
}

/**
 * validateProfileText(text, { projectRoot, userHome, file }) -> { ok, target, errors, warnings }
 *
 * Validates `text` as if it WERE the project's `.planning/STACK.md`, without writing it to disk
 * — 35-04's `init` uses this to check a draft before it commits to a file. Resolves the chain
 * from the text's own `extends` (via `resolveFromParsed`), exactly as a saved file would.
 */
function validateProfileText(text, { projectRoot = null, userHome = null, file = null, bundledDir = BUNDLED_STACKS_DIR } = {}) {
  const targetLabel = file || 'draft';
  let parsedTarget;
  try {
    parsedTarget = parseProfile(text, { source: file });
  } catch (err) {
    return parseFailureResult(err, targetLabel, file || null);
  }
  const resolved = resolveFromParsed(parsedTarget, { userHome, file, projectRoot, targetPath: file || null, bundledDir });
  return runValidationRules(resolved, parsedTarget, { projectRoot, userHome, targetPath: file || null, targetLabel, bundledDir });
}

/**
 * validateProfile({ projectRoot, userHome, profilePath }) -> { ok, target, errors, warnings }
 *
 * Default target: `<projectRoot>/.planning/STACK.md`. When it (and `profilePath`) is absent,
 * validates the bundled general profile itself — target reads
 * `'general (bundled; no .planning/STACK.md)'`, and this is always `ok: true` for a healthy
 * install (general ships schema-valid with every gate/loop key defined).
 */
function validateProfile({ projectRoot = null, userHome = null, profilePath = null, bundledDir = BUNDLED_STACKS_DIR } = {}) {
  let targetPath;
  let targetLabel;
  let isBundledGeneral = false;

  if (profilePath) {
    targetPath = path.isAbsolute(profilePath) ? profilePath : path.join(projectRoot || '.', profilePath);
    targetLabel = targetPath;
  } else {
    const candidate = projectRoot ? path.join(projectRoot, '.planning', 'STACK.md') : null;
    if (candidate && fs.existsSync(candidate)) {
      targetPath = candidate;
      targetLabel = candidate;
    } else {
      targetPath = BUNDLED_PATH;
      targetLabel = 'general (bundled; no .planning/STACK.md)';
      isBundledGeneral = true;
    }
  }

  let text;
  try {
    text = fs.readFileSync(targetPath, 'utf-8');
  } catch (err) {
    return parseFailureResult(err, targetLabel, targetPath);
  }

  let parsedTarget;
  try {
    parsedTarget = parseProfile(text, { source: targetPath });
  } catch (err) {
    return parseFailureResult(err, targetLabel, targetPath);
  }

  // The bundled general profile IS the chain's root — resolving it again on top of itself would
  // double it up as both 'bundled' and 'project'. Its "chain" is just itself.
  const resolved = isBundledGeneral
    ? {
        frontmatter: parsedTarget.frontmatter,
        sections: parsedTarget.sections,
        chain: [{ id: 'general', tier: 'bundled', path: BUNDLED_PATH }],
        issues: [],
        layers: [{ id: 'general', tier: 'bundled', path: BUNDLED_PATH, frontmatter: parsedTarget.frontmatter, sections: parsedTarget.sections }],
      }
    : resolveFromParsed(parsedTarget, { userHome, file: null, projectRoot, targetPath, bundledDir });

  return runValidationRules(resolved, parsedTarget, { projectRoot, userHome, targetPath, targetLabel, bundledDir });
}

// ─── stack init: draft / serialize / write (35-04) ────────────────────────
//
// Drafting turns two inputs — installed org profiles (this operator's own tier) and repo
// evidence (this project's own CI/task-runner/manifest) — into a project-tier document a human
// reviews before it becomes `.planning/STACK.md`. Nothing here writes to disk except
// `initProfile`, and only when its caller asks for `write: true`.

/**
 * listOrgProfiles({ userHome, bundledDir }) -> [{ id, extends, detect, languages, path, tier }, ...]
 *
 * Reads every `*.md` in the user tier (`<userHome>/.claude/devflow/stacks/`, `tier: 'user'`),
 * then every `*.md` in the bundled tier (`bundledDir`, `tier: 'bundled'`), each sorted by
 * filename. A bundled entry whose id a user entry already has is dropped: the user tier shadows
 * it, exactly as `profileLookup` resolves an `extends`. A file that fails to parse is skipped (a
 * listing call reports what it CAN read, never throws over one bad entry) — `resolveProfile`'s
 * own `extends` walk is what enforces a hard failure for a chain a project actually depends on.
 * A null root or a directory that doesn't exist contributes nothing, so `bundledDir: null` with
 * a null `userHome` is `[]` — 35-09's detectMarkers reuses this for the same "there may be
 * nothing installed yet" case.
 */
function listOrgProfiles({ userHome = null, bundledDir = BUNDLED_STACKS_DIR } = {}) {
  const user = userHome ? listProfileDir(path.join(userHome, '.claude', 'devflow', 'stacks'), 'user') : [];
  const bundled = bundledDir ? listProfileDir(bundledDir, 'bundled') : [];
  const userIds = new Set(user.map((p) => p.id));
  return user.concat(bundled.filter((p) => !userIds.has(p.id)));
}

// One tier's directory listing for listOrgProfiles. `[]` when the directory can't be read.
function listProfileDir(dir, tier) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const results = [];
  for (const entry of entries.filter((e) => e.endsWith('.md')).sort()) {
    const full = path.join(dir, entry);
    let parsed;
    try {
      parsed = parseProfile(fs.readFileSync(full, 'utf-8'), { source: full });
    } catch (_) {
      continue;
    }
    const fm = parsed.frontmatter || {};
    const id = typeof fm.id === 'string' ? fm.id : entry.slice(0, -3);
    const extendsId = fm.extends === undefined || fm.extends === null ? 'general' : fm.extends;
    results.push({
      id,
      extends: extendsId,
      detect: Array.isArray(fm.detect) ? fm.detect : [],
      languages: Array.isArray(fm.languages) ? fm.languages : [],
      path: full,
      tier,
    });
  }
  return results;
}

/**
 * detectMarkers({ userHome }) -> [{ marker, profile, languages }]
 *
 * Unions every installed org profile's `detect` markers into one flat, stack-neutral list —
 * this function never names a language itself (35-02a's P11 neutrality property keeps holding).
 * The three detector files (project-state.cjs, init.cjs, brownfield-detector.cjs) are the ONE
 * place allowed to turn a matched marker's `languages` back into a language name (TRD 35-09's
 * neutrality exception). Covers both tiers via listOrgProfiles, user entries first; `[]` only
 * when `userHome` is null AND `bundledDir` is null.
 */
function detectMarkers({ userHome = null, bundledDir = BUNDLED_STACKS_DIR } = {}) {
  return listOrgProfiles({ userHome, bundledDir }).flatMap((p) =>
    (p.detect || []).map((marker) => ({ marker, profile: p.id, languages: p.languages || [] }))
  );
}

// A marker either names a file at the project root literally, or (`*.ext`) matches any root
// entry sharing that suffix. The object form `{file, contains}` (TRD 42-05) names a root entry
// literally AND, when `contains` is set, requires that file's text to include it — read from
// `root`, so without a root (or on any read error) a content marker never matches. `file` must
// be a root entry name, which also keeps the read inside `root` (a path-shaped name never is one).
function markerMatches(marker, rootEntries, root = null) {
  if (marker && typeof marker === 'object' && !Array.isArray(marker)) {
    if (typeof marker.file !== 'string' || !marker.file || !rootEntries.includes(marker.file)) return false;
    if (marker.contains === undefined || marker.contains === null) return true;
    try {
      return fs.readFileSync(path.join(root, marker.file), 'utf-8').includes(String(marker.contains));
    } catch (_) {
      return false;
    }
  }
  if (typeof marker !== 'string' || !marker) return false;
  if (marker.startsWith('*.')) {
    const suffix = marker.slice(1);
    return rootEntries.some((e) => e.endsWith(suffix));
  }
  return rootEntries.includes(marker);
}

// A marker as text for a human-facing reason: a string as-is, an object as `file(contains)`.
function markerLabel(marker) {
  if (marker && typeof marker === 'object') {
    return marker.contains === undefined || marker.contains === null
      ? String(marker.file)
      : `${marker.file}(${marker.contains})`;
  }
  return String(marker);
}

/**
 * matchMarkersAt(root, markers) -> the subset of `markers` present at `root`
 *
 * `markers` is typically `detectMarkers()`'s own output (only its `marker` field is read, so
 * any `{marker, ...}` array works). A literal marker must equal a root entry; a `*.ext` marker
 * matches when any root entry shares that suffix; a `{file, contains}` marker also reads that
 * file (see `markerMatches`). An unreadable `root` (doesn't exist yet, permissions) matches
 * nothing rather than throwing.
 */
function matchMarkersAt(root, markers) {
  let rootEntries = [];
  try {
    rootEntries = fs.readdirSync(root);
  } catch (_) {
    rootEntries = [];
  }
  return markers.filter((m) => markerMatches(m.marker, rootEntries, root));
}

// True when `candidateId` sits somewhere in `ofId`'s own `extends` chain (an ANCESTOR of it),
// walking the profile list rather than the filesystem so a caller that already loaded
// `listOrgProfiles` doesn't re-read every file per comparison.
function isAncestorOf(candidateId, ofId, byId) {
  let cur = byId.get(ofId);
  let depth = 0;
  while (cur && cur.extends && cur.extends !== 'general' && depth < MAX_EXTENDS_DEPTH) {
    if (cur.extends === candidateId) return true;
    cur = byId.get(cur.extends);
    depth += 1;
  }
  return false;
}

/**
 * pickExtends({ projectRoot, userHome, explicit }) -> { id, reason, alternatives }
 *
 * `explicit` (a `--extends` value) always wins outright. Otherwise: match every installed org
 * profile's `detect` markers against the project root's own entries; when more than one matches
 * and one is an ANCESTOR (via `extends`) of another, drop the ancestor — the most specific match
 * wins, and the dropped ones are reported as `alternatives` alongside any other surviving tie.
 * A remaining tie breaks alphabetically. No match at all -> `general`.
 */
function pickExtends({ projectRoot, userHome = null, explicit = null, bundledDir = BUNDLED_STACKS_DIR } = {}) {
  if (explicit) {
    return { id: explicit, reason: `explicit --extends ${explicit}`, alternatives: [] };
  }

  const profiles = listOrgProfiles({ userHome, bundledDir });
  if (!profiles.length) {
    return { id: 'general', reason: 'no org profiles installed', alternatives: [] };
  }

  let rootEntries = [];
  try {
    rootEntries = fs.readdirSync(projectRoot);
  } catch (_) {
    rootEntries = [];
  }

  const matched = profiles.filter((p) => p.detect.some((marker) => markerMatches(marker, rootEntries, projectRoot)));
  if (!matched.length) {
    return { id: 'general', reason: 'no installed org profile detect marker matched this project', alternatives: [] };
  }

  const byId = new Map(profiles.map((p) => [p.id, p]));
  const survivors = matched.filter(
    (m) => !matched.some((other) => other.id !== m.id && isAncestorOf(m.id, other.id, byId))
  );
  survivors.sort((a, b) => a.id.localeCompare(b.id));
  const winner = survivors[0];
  const alternatives = matched.filter((m) => m.id !== winner.id).map((m) => m.id);

  return { id: winner.id, reason: `detected via ${winner.detect.map(markerLabel).join(', ')}`, alternatives };
}

// `basename(projectRoot)`, lowercased, every run of characters outside `[a-z0-9.-]` collapsed to
// a single `-`, and any leading non-alphanumeric stripped — the schema's `id` pattern is
// `^[a-z0-9][a-z0-9.\-]*$`, and a mkdtemp-style directory name (`df-Stack_AbC`) is exactly the
// shape this needs to survive.
function slugifyId(name) {
  const lowered = String(name).toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
  return lowered.replace(/^[^a-z0-9]+/, '');
}

// The body's notes comment is capped so a draft with many notes stays under MAX_BODY_LINES (STK007).
const MAX_NOTE_LINES = 40;

function noteLine(n) {
  const where = n.area ? n.area : 'root';
  const what = n.candidate ? `${n.key}: ${n.candidate}` : (n.key || 'stack');
  const detail = n.detail ? ` (${n.detail})` : '';
  // Never close the HTML comment early, never break it across lines. HTML5 ends a comment at `-->`
  // (after any run of dashes, so `--->` too) and at `--!>`; `(--!?)>` catches both and the inserted
  // space defuses it. A bare CLI flag such as `--no-pub` has no `>` and is left intact.
  return `- ${where} ${what} — ${n.status}${detail}`.replace(/\r?\n/g, ' ').replace(/(--!?)>/g, '$1 >');
}

/**
 * renderDraftBody(id, extendsId, notes) -> the drafted body: a title, the "no empty sections"
 * comment, and — when there are notes — a second comment listing them, capped at 40 lines with a
 * `(+N more in STACK-REPORT.md)` trailer.
 */
function renderDraftBody(id, extendsId, notes = []) {
  let body = `# Stack Profile: ${id}\n\n`
    + `<!-- Drafted by \`df-tools stack init\`. Add no `
    + '`## ` heading below unless this project genuinely diverges from `'
    + `${extendsId}\`: an empty section would replace the parent's. Recognized sections: `
    + `${SECTION_NAMES.join(', ')}. -->\n`;
  const list = Array.isArray(notes) ? notes : [];
  if (list.length) {
    const lines = list.slice(0, MAX_NOTE_LINES).map(noteLine);
    if (list.length > MAX_NOTE_LINES) lines.push(`(+${list.length - MAX_NOTE_LINES} more in STACK-REPORT.md)`);
    body += `\n<!-- stack init notes (see .planning/STACK-REPORT.md):\n${lines.join('\n')}\n-->\n`;
  }
  return body;
}

/** The default draft verifier: stack-verify's static resolver, run against the real env unless overridden. */
function defaultVerifier(projectRoot, verifyOpts = {}) {
  // Lazy: stack-verify.cjs requires this module (inside verifyStack); a top-level require would cycle.
  const { verifyCommand } = require('./stack-verify.cjs');
  return (command, cwd) => verifyCommand(command, { root: projectRoot, cwd: cwd || '', ...verifyOpts });
}

/**
 * draftProfile({ projectRoot, userHome, from, extendsId, now, bundledDir, verifyOpts, verify }) ->
 *   { frontmatter, body, evidence, extends, notes, resolvedKeys, inheritedKeys }
 *
 * Grounded drafting (TRD 42-07): detect the repo's areas, pick each language area's profile with
 * `pickExtends` (an explicit `extendsId` wins for the root), collect structured evidence, resolve
 * each involved profile's commands (a synthetic target carrying only `extends`, so it cannot
 * shadow the chain it asks about), and hand all of it to stack-draft.assembleDraft with a
 * verifier — `verify(command, cwd)` when given, else stack-verify with `verifyOpts` (env, home).
 * Only STACK.md is ever drafted: components name a profile id, never a file under .planning/.
 */
function draftProfile({ projectRoot, userHome = null, from = 'codebase', extendsId = null, now = new Date(), bundledDir = BUNDLED_STACKS_DIR, verifyOpts = {}, verify = null } = {}) {
  // Lazy: stack-draft/stack-detect are drafting-only, and keeping them out of the loader's load
  // path means every `stack resolve` caller never pays for them.
  const { detectAreas } = require('./stack-detect.cjs');
  const { assembleDraft } = require('./stack-draft.cjs');

  let areas = [];
  try {
    areas = detectAreas(projectRoot);
  } catch (_) {
    areas = [];
  }
  const withProfiles = areas.map((a) => {
    if (!Array.isArray(a.kinds) || !a.kinds.length) return a;
    const dirAbs = a.dir ? path.join(projectRoot, a.dir) : projectRoot;
    return { ...a, profile: pickExtends({ projectRoot: dirAbs, userHome, bundledDir }).id };
  });
  const evidence = collectEvidence(projectRoot, { from, areas });

  const ids = new Set(['general']);
  if (extendsId) ids.add(extendsId);
  for (const a of withProfiles) if (a.profile) ids.add(a.profile);
  const tierCommands = {};
  for (const tierId of ids) {
    const resolved = resolveFromParsed(
      { frontmatter: { schema: 1, extends: tierId }, sections: [] },
      { userHome, file: null, projectRoot, targetPath: null, bundledDir }
    );
    tierCommands[tierId] = (resolved.frontmatter && resolved.frontmatter.commands) || {};
  }

  const draft = assembleDraft({
    areas: withProfiles,
    evidence,
    tierCommands,
    verify: typeof verify === 'function' ? verify : defaultVerifier(projectRoot, verifyOpts),
    extendsId,
  });

  const id = slugifyId(path.basename(projectRoot));
  // The LOCAL calendar day: `reviewed` is a date a human reads, not a UTC instant (SDR-07).
  const today = localDate(now);

  const frontmatter = { schema: 1, id, extends: draft.extendsId };
  if (draft.components.length) frontmatter.components = draft.components;
  frontmatter.commands = draft.commands;
  if (draft.loop) frontmatter.loop = draft.loop;
  frontmatter.provenance = { reviewed: today, sources: draft.sources };

  return {
    frontmatter,
    body: renderDraftBody(id, draft.extendsId, draft.notes),
    evidence,
    extends: draft.extendsId,
    notes: draft.notes,
    resolvedKeys: draft.resolvedKeys,
    inheritedKeys: draft.inheritedKeys,
  };
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(String(value));
}

// A value that stays inline: `[a, b]` for arrays (`[]` when empty), `{ k: v }` for a plain object
// (`{}` when empty), a JSON-quoted string/number/boolean/null otherwise. Recursive so a
// `commands.<key>` entry's own object value nests correctly on one line.
function yamlFlowValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[${value.map(yamlFlowValue).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return `{ ${entries.map(([k, v]) => `${k}: ${yamlFlowValue(v)}`).join(', ')} }`;
  }
  return yamlScalar(value);
}

/**
 * serializeProfile(frontmatter, body) -> text
 *
 * Renders front matter yaml-lite can parse back byte-for-byte-equivalent (see `parseProfile`):
 * every string JSON-quoted, a non-empty plain object as a block key with one indented
 * `sub: <flow-value>` line per entry (so a human reviewing the draft sees each command on its
 * own line), an empty object or array collapsed to `{}` / `[]` on the parent's own line.
 */
function serializeProfile(frontmatter, body) {
  const lines = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    const isPlainObject = value && typeof value === 'object' && !Array.isArray(value);
    if (isPlainObject && Object.keys(value).length) {
      lines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value)) {
        lines.push(`  ${subKey}: ${yamlFlowValue(subValue)}`);
      }
    } else {
      lines.push(`${key}: ${yamlFlowValue(value)}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

const STACK_REL = '.planning/STACK.md';
const STACK_REPORT_REL = '.planning/STACK-REPORT.md';
const STACK_FILES = Object.freeze([STACK_REL, STACK_REPORT_REL]);

/**
 * ignoredTargets(projectRoot, rels) -> the repo-relative FILE paths among `rels` that the ignore
 * RULES match (TRD 42-14, D5). ONE `git -C root check-ignore --no-index --stdin -z` call:
 * `--no-index` because a tracked file (a force-added `.planning/STACK.md`, or any tracked file
 * under an ignored `.planning/`) makes the index-aware check say "not ignored" and masks the rule.
 * helpers.isGitIgnored stays index-aware for its other callers. No git, not a work tree, or any git
 * failure: `[]`. Never throws.
 */
function ignoredTargets(projectRoot, rels) {
  const list = (rels || []).map(String);
  if (!list.length) return [];
  let r;
  try {
    r = spawnSync('git', ['-C', String(projectRoot), 'check-ignore', '--no-index', '--stdin', '-z'], {
      input: `${list.join('\0')}\0`, stdio: ['pipe', 'pipe', 'ignore'], timeout: 15000,
    });
  } catch (_) {
    return [];
  }
  if (!r || r.error || r.status !== 0) return []; // 1 = nothing ignored; 128 = not a repo / no git
  const hits = new Set(String(r.stdout).split('\0').filter(Boolean));
  return list.filter((rel) => hits.has(rel));
}

/**
 * initProfile({ projectRoot, userHome, from, extendsId, write, force, now }) ->
 *   { action: 'preview'|'written'|'refused', path, text, extends, evidence, validation }
 *
 * `extendsId` here is the CALLER's `--extends` override (may be null/undefined — `pickExtends`
 * then detects); the picked id is what ends up in the result and in the draft itself.
 * Preview (the default, and always the outcome when the draft fails validation): nothing is
 * written. Refused: `.planning/STACK.md` already exists and `force` was not given — the
 * existing file is never touched. Written: `force`, or no prior file, and the draft validates.
 *
 * Every result carries `ignored` and `warnings` (TRD 42-12, 42-14). In PREVIEW and write alike,
 * both stack FILES (`.planning/STACK.md`, `.planning/STACK-REPORT.md`) are checked with one
 * `git check-ignore --no-index` call (ignoredTargets): a tracked file under `.planning/` makes a
 * dir-level or index-aware check say "not ignored", so the rule itself is what must be tested.
 * Each match is in `ignored` with a warning naming it in `warnings`; it is NOT fatal (adopt relies
 * on the write; the rollout decides). No git, not a repo, or any git failure: `ignored: []`.
 */
function initProfile({ projectRoot, userHome = null, from = 'codebase', extendsId = null, write = false, force = false, now = new Date(), bundledDir = BUNDLED_STACKS_DIR, verifyOpts = {}, verify = null } = {}) {
  // draftProfile picks each area's profile itself; `extendsId` is only the caller's override.
  const draft = draftProfile({ projectRoot, userHome, from, extendsId, now, bundledDir, verifyOpts, verify });
  const text = serializeProfile(draft.frontmatter, draft.body);
  const validation = validateProfileText(text, { projectRoot, userHome, file: null, bundledDir });
  const targetPath = path.join(projectRoot, '.planning', 'STACK.md');
  const ignored = ignoredTargets(projectRoot, STACK_FILES);
  const base = {
    path: targetPath,
    text,
    extends: draft.extends,
    evidence: draft.evidence,
    notes: draft.notes,
    resolvedKeys: draft.resolvedKeys,
    inheritedKeys: draft.inheritedKeys,
    validation,
    ignored,
    warnings: ignored.map((rel) => `${rel} is gitignored; df-tools commit will skip it`),
  };

  if (!write || !validation.ok) {
    return { action: 'preview', ...base };
  }

  if (fs.existsSync(targetPath) && !force) {
    return { action: 'refused', ...base };
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, text, 'utf-8');
  return { action: 'written', ...base };
}

// ─── df-tools stack CLI ────────────────────────────────────────────────────

/**
 * Stack extensions — `stack <sub>` subcommands implemented in sibling modules, so a later TRD can
 * ship one without editing this file (42-06 stack-verify.cjs, 42-08 stack-report.cjs, 42-09
 * stack-mcp.cjs).
 *
 * Contract for an extension module: export `cli(cwd, args, raw, { userHome })`, where `args` is
 * everything after the subcommand name. It reports through helpers `output` / `error` like every
 * other df-tools command. The module is required LAZILY, inside the dispatch branch, never at
 * load time: a missing or broken extension must not break `stack resolve`, and the extensions
 * require this module, so a top-level require would be a cycle.
 */
const STACK_EXTENSIONS = Object.freeze({
  verify: 'stack-verify.cjs',
  report: 'stack-report.cjs',
  mcp: 'stack-mcp.cjs',
});

/**
 * loadStackExtension(sub, { libDir }) -> module | null
 *
 * null when `sub` is not an extension or its module file is absent. A module that exists but
 * throws while loading (a syntax error, a bad require) is NOT caught: that is a broken build and
 * must surface, not read as "not available".
 */
function loadStackExtension(sub, { libDir = __dirname } = {}) {
  if (!Object.prototype.hasOwnProperty.call(STACK_EXTENSIONS, sub)) return null;
  const modulePath = path.join(libDir, STACK_EXTENSIONS[sub]);
  if (!fs.existsSync(modulePath)) return null;
  return require(modulePath);
}

function parseFlagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  return v === undefined ? null : v;
}

function parseCsvFlag(args, flag) {
  const v = parseFlagValue(args, flag);
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * cmdStack(cwd, args, raw) — `df-tools stack resolve|context|validate|command`. `stack init` is
 * 35-04. `os.homedir()` is called ONLY here (never in resolveProfile/validateProfile) so those
 * stay pure and every test can sandbox HOME by passing `userHome` explicitly.
 */
function cmdStack(cwd, args, raw, { libDir = __dirname } = {}) {
  const userHome = require('os').homedir();
  const projectRoot = cwd;
  const subcommand = args[0];

  try {
    if (subcommand === 'resolve') {
      const file = parseFlagValue(args, '--file');
      const withProvenance = args.includes('--provenance');
      const resolved = resolveProfile({ projectRoot, userHome, file });
      const result = {
        id: resolved.id,
        chain: resolved.chain,
        component: resolved.component,
        frontmatter: resolved.frontmatter,
        sections: Object.keys(resolved.sections),
        issues: resolved.issues,
      };
      if (withProvenance) result.provenance = resolved.provenance;
      output(result, raw, resolved.id);
      return;
    }

    if (subcommand === 'context') {
      const agent = args[1];
      const file = parseFlagValue(args, '--file');
      const files = parseCsvFlag(args, '--files');
      const budgetRaw = parseFlagValue(args, '--budget');
      const ui = args.includes('--ui');
      const resolved = resolveProfile({ projectRoot, userHome, file });
      const opts = { ui };
      if (budgetRaw !== null) opts.budget = parseInt(budgetRaw, 10);
      void files; // context slices by section, not by file list; kept for CLI-surface symmetry
      const result = contextFor(resolved, agent, opts);
      output(result, raw, result.text);
      return;
    }

    if (subcommand === 'validate') {
      // A positional path used to be ignored, so `stack validate x.md` validated .planning/STACK.md
      // and reported ITS result — a green run for a file it never read (SDR-07).
      if (args[1] !== undefined && !String(args[1]).startsWith('-')) {
        error('stack validate takes --profile <path>, not a positional path');
        return;
      }
      const profilePath = parseFlagValue(args, '--profile');
      const result = validateProfile({ projectRoot, userHome, profilePath });
      output(result, raw, result.ok ? 'ok' : 'invalid', result.ok ? 0 : 1);
      return;
    }

    if (subcommand === 'command') {
      const key = args[1];
      const file = parseFlagValue(args, '--file');
      const files = parseCsvFlag(args, '--files');
      const packages = parseCsvFlag(args, '--packages');
      const apply = args.includes('--apply');
      const resolved = resolveProfile({ projectRoot, userHome, file });
      const result = renderCommand(resolved, key, { files, packages, apply });
      const rawValue = result.status === 'ok' ? result.command : '';
      output(result, raw, rawValue, result.status === 'undefined' ? 1 : 0);
      return;
    }

    if (subcommand === 'init') {
      const from = parseFlagValue(args, '--from') || 'codebase';
      const extendsFlag = parseFlagValue(args, '--extends');
      const write = args.includes('--write');
      const force = args.includes('--force');
      const result = initProfile({ projectRoot, userHome, from, extendsId: extendsFlag, write, force });
      if (result.action === 'refused') {
        error(`.planning/STACK.md already exists; pass --force to overwrite it (refusing to write ${result.path})`);
        return;
      }
      for (const w of result.warnings || []) process.stderr.write(`warning: ${w}\n`);
      const exitCode = result.validation.ok ? 0 : 1;
      output(result, raw, result.text, exitCode);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(STACK_EXTENSIONS, subcommand)) {
      const mod = loadStackExtension(subcommand, { libDir });
      if (!mod || typeof mod.cli !== 'function') {
        error(`stack ${subcommand} is not available in this build`);
        return;
      }
      return mod.cli(cwd, args.slice(1), raw, { userHome });
    }

    error(`Unknown stack subcommand. Available: resolve, context, validate, command, init, ${Object.keys(STACK_EXTENSIONS).join(', ')}`);
  } catch (err) {
    error(err.message);
  }
}

module.exports = {
  parseProfile,
  resolveProfile,
  resolveFromParsed,
  validateProfile,
  validateProfileText,
  listOrgProfiles,
  detectMarkers,
  matchMarkersAt,
  pickExtends,
  draftProfile,
  renderDraftBody,
  serializeProfile,
  initProfile,
  cmdStack,
  STACK_EXTENSIONS,
  loadStackExtension,
  renderCommand,
  contextFor,
  AGENT_SLICES,
  AGENT_ALIASES,
  StackProfileError,
  SECTION_NAMES,
  _resetCache,
  BUNDLED_PATH,
  BUNDLED_STACKS_DIR,
};
