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

const BUNDLED_PATH = path.join(__dirname, '../../references/stack-general.md');
const FENCE = '---';
const MAX_EXTENDS_DEPTH = 4;

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

  const issues = [];
  const generalParsed = parseProfile(fs.readFileSync(BUNDLED_PATH, 'utf-8'), { source: BUNDLED_PATH });
  const layers = [{ id: 'general', tier: 'bundled', path: BUNDLED_PATH, frontmatter: generalParsed.frontmatter, sections: generalParsed.sections }];

  let projectFile = null;
  let projectFrontmatter = null;

  if (projectRoot) {
    const candidate = path.join(projectRoot, '.planning', 'STACK.md');
    if (fs.existsSync(candidate)) {
      projectFile = candidate;
      const parsed = parseProfile(fs.readFileSync(candidate, 'utf-8'), { source: candidate });
      projectFrontmatter = parsed.frontmatter;

      const extendsId = parsed.frontmatter.extends === undefined || parsed.frontmatter.extends === null
        ? 'general'
        : parsed.frontmatter.extends;
      const orgHops = walkExtendsChain({ startId: extendsId, userHome, issues });
      for (const hop of orgHops) {
        layers.push({ id: hop.id, tier: 'org', path: hop.path, frontmatter: hop.frontmatter, sections: hop.sections });
      }
      layers.push({ id: null, tier: 'project', path: projectFile, frontmatter: parsed.frontmatter, sections: parsed.sections });
    }
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

  const result = { id, frontmatter, sections, provenance, chain, component, issues, projectFile };
  _cache.set(cacheKey, result);
  return result;
}

module.exports = {
  parseProfile,
  resolveProfile,
  StackProfileError,
  SECTION_NAMES,
  _resetCache,
  BUNDLED_PATH,
};
