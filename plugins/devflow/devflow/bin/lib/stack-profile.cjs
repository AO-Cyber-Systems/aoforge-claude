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

const { parseYamlLite } = require('./yaml-lite.cjs');

const FENCE = '---';

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

module.exports = {
  parseProfile,
  StackProfileError,
  SECTION_NAMES,
};
