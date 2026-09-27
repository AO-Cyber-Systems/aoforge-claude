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
const { parseYamlLite } = require('./yaml-lite.cjs');
const { validate: schemaValidate } = require('./json-schema-lite.cjs');

const BUNDLED_PATH = path.join(__dirname, '../../references/stack-general.md');
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

// Walks an `extends` chain starting at `startId`, stopping at `general`. Returns hops in
// LOW -> HIGH order (the farthest ancestor first), never including `general` itself. A cycle, a
// chain deeper than MAX_EXTENDS_DEPTH, or an id that cannot be found are all recorded as issues
// and stop the walk at that point — never thrown, so a caller always gets a usable, if partial,
// chain back.
function walkExtendsChain({ startId, userHome, issues }) {
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
    if (!userHome) {
      issues.push({ code: 'EXTENDS_UNRESOLVED', message: `extends '${id}' cannot be resolved: no org home was provided`, id });
      break;
    }
    const orgPath = orgProfilePath(userHome, id);
    if (!fs.existsSync(orgPath)) {
      issues.push({ code: 'EXTENDS_UNRESOLVED', message: `extends '${id}' not found at ${orgPath}`, id });
      break;
    }
    const text = fs.readFileSync(orgPath, 'utf-8');
    const parsed = parseProfile(text, { source: orgPath }); // a malformed org-tier file throws, per contract
    seen.add(id);
    collected.push({ id, path: orgPath, frontmatter: parsed.frontmatter, sections: parsed.sections });
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
// slashes so a caller on any platform gets the same match). Returns null when nothing matches.
function matchComponent(components, file) {
  if (!Array.isArray(components) || !file) return null;
  const normFile = normalizeSlashes(file);
  let best = null;
  for (const candidate of components) {
    if (!candidate || typeof candidate.path !== 'string') continue;
    const p = normalizeSlashes(candidate.path);
    if (normFile.startsWith(p) && (!best || p.length > normalizeSlashes(best.path).length)) {
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
function resolveFromParsed(parsedTarget, { userHome = null, file = null, projectRoot = null, targetPath = null } = {}) {
  const issues = [];
  const generalParsed = parseProfile(fs.readFileSync(BUNDLED_PATH, 'utf-8'), { source: BUNDLED_PATH });
  const layers = [{ id: 'general', tier: 'bundled', path: BUNDLED_PATH, frontmatter: generalParsed.frontmatter, sections: generalParsed.sections }];

  let projectFrontmatter = null;

  if (parsedTarget) {
    projectFrontmatter = parsedTarget.frontmatter;
    const extendsId = parsedTarget.frontmatter.extends === undefined || parsedTarget.frontmatter.extends === null
      ? 'general'
      : parsedTarget.frontmatter.extends;
    const orgHops = walkExtendsChain({ startId: extendsId, userHome, issues });
    for (const hop of orgHops) {
      layers.push({ id: hop.id, tier: 'org', path: hop.path, frontmatter: hop.frontmatter, sections: hop.sections });
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
          layers.push({ id: null, tier: 'component', path: compPath, frontmatter: parsed.frontmatter, sections: parsed.sections });
        } else {
          issues.push({ code: 'COMPONENT_MISSING', message: `component profile file not found: ${compPath}`, id: match.profile });
        }
      } else if (typeof match.profile === 'string') {
        const compHops = walkExtendsChain({ startId: match.profile, userHome, issues });
        for (const hop of compHops) {
          if (chainIds.has(hop.id)) continue;
          layers.push({ id: hop.id, tier: 'component', path: hop.path, frontmatter: hop.frontmatter, sections: hop.sections });
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

  const chain = layers.map((l) => ({ id: l.id, tier: l.tier, path: l.path }));

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
function resolveProfile({ projectRoot = null, userHome = null, file = null } = {}) {
  const cacheKey = `${projectRoot || ''}|${userHome || ''}|${file || ''}`;
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

  const result = resolveFromParsed(parsedTarget, { userHome, file, projectRoot, targetPath });
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
function runValidationRules(resolved, parsedTarget, { projectRoot, userHome, targetPath, targetLabel }) {
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
    } else if (!userHome || !fs.existsSync(orgProfilePath(userHome, comp.profile))) {
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
function validateProfileText(text, { projectRoot = null, userHome = null, file = null } = {}) {
  const targetLabel = file || 'draft';
  let parsedTarget;
  try {
    parsedTarget = parseProfile(text, { source: file });
  } catch (err) {
    return parseFailureResult(err, targetLabel, file || null);
  }
  const resolved = resolveFromParsed(parsedTarget, { userHome, file, projectRoot, targetPath: file || null });
  return runValidationRules(resolved, parsedTarget, { projectRoot, userHome, targetPath: file || null, targetLabel });
}

/**
 * validateProfile({ projectRoot, userHome, profilePath }) -> { ok, target, errors, warnings }
 *
 * Default target: `<projectRoot>/.planning/STACK.md`. When it (and `profilePath`) is absent,
 * validates the bundled general profile itself — target reads
 * `'general (bundled; no .planning/STACK.md)'`, and this is always `ok: true` for a healthy
 * install (general ships schema-valid with every gate/loop key defined).
 */
function validateProfile({ projectRoot = null, userHome = null, profilePath = null } = {}) {
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
    : resolveFromParsed(parsedTarget, { userHome, file: null, projectRoot, targetPath });

  return runValidationRules(resolved, parsedTarget, { projectRoot, userHome, targetPath, targetLabel });
}

module.exports = {
  parseProfile,
  resolveProfile,
  resolveFromParsed,
  validateProfile,
  validateProfileText,
  StackProfileError,
  SECTION_NAMES,
  _resetCache,
  BUNDLED_PATH,
};
