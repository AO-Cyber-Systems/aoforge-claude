'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, safeReadFile } = require('./helpers.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

// ─── YAML Frontmatter Parser ──────────────────────────────────────────────────

// A value that is exactly a block-scalar indicator opens a block (`a | b` does not). Indentation indicators
// (`|2-`) are not supported: the serializer never writes them.
const BLOCK_SCALAR_RE = /^[|>][+-]?$/;

/**
 * Read the block scalar whose indicator sits on `lines[start - 1]` at column `keyIndent` (TRD 52-05).
 * The block is every following line that is blank or indented past the key. Exactly `keyIndent + 2` columns are
 * stripped from each line (all of its leading whitespace when it is shorter), so spaces past the block indent stay
 * part of the text. Chomping: `-` strips every trailing newline, none keeps exactly one, `+` keeps them all.
 * `>` / `>-` / `>+` are read as literal blocks, NOT folded: the serializer never emits them, and a wrong fold
 * would be worse than an honest literal. Returns `{ value, next }`, `next` being the first line after the block.
 */
function readBlockScalar(lines, start, keyIndent, indicator) {
  const strip = keyIndent + 2;
  const body = [];
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const lead = line.match(/^\s*/)[0].length;
    if (line.trim() !== '' && lead <= keyIndent) break;
    body.push(line.slice(Math.min(strip, lead)));
  }
  if (body.length === 0) return { value: '', next: i };
  // Every block line ends in a newline (the last one's is the newline before the closing `---` or the next key).
  const text = `${body.join('\n')}\n`;
  const core = text.replace(/\n+$/, '');
  const chomp = indicator.slice(1);
  let value;
  if (chomp === '-') value = core;
  else if (chomp === '+') value = text;
  else value = core === '' ? '' : `${core}\n`;
  return { value, next: i };
}

function extractFrontmatter(content) {
  const frontmatter = {};
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return frontmatter;

  const yaml = match[1];
  const lines = yaml.split('\n');

  // Stack to track nested objects: [{obj, key, indent}]
  // obj = object to write to, key = current key collecting array items, indent = indentation level
  let stack = [{ obj: frontmatter, key: null, indent: -1 }];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // Skip empty lines
    if (line.trim() === '') continue;

    // Calculate indentation (number of leading spaces)
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // Pop stack back to appropriate level
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    // Check for key: value pattern
    const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);
    if (keyMatch) {
      const key = keyMatch[2];
      const value = keyMatch[3].trim();

      if (BLOCK_SCALAR_RE.test(value)) {
        // Block scalar (`key: |-` + indented lines): a multi-line string, read whole so none of its lines is
        // mistaken for a key, a list item or the end of the frontmatter.
        const block = readBlockScalar(lines, li + 1, indent, value);
        current.obj[key] = block.value;
        current.key = null;
        li = block.next - 1;
      } else if (value === '' || value === '[') {
        // Key with no value or opening bracket — could be nested object or array
        // We'll determine based on next lines, for now create placeholder
        current.obj[key] = value === '[' ? [] : {};
        current.key = null;
        // Push new context for potential nested content
        stack.push({ obj: current.obj[key], key: null, indent });
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array: key: [a, b, c]
        current.obj[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        current.key = null;
      } else {
        // Simple key: value
        current.obj[key] = value.replace(/^["']|["']$/g, '');
        current.key = null;
      }
    } else if (line.trim().startsWith('- ')) {
      // Array item
      const itemValue = line.trim().slice(2).replace(/^["']|["']$/g, '');

      // If current context is an empty object, convert to array
      if (typeof current.obj === 'object' && !Array.isArray(current.obj) && Object.keys(current.obj).length === 0) {
        // Find the key in parent that points to this object and convert it
        const parent = stack.length > 1 ? stack[stack.length - 2] : null;
        if (parent) {
          for (const k of Object.keys(parent.obj)) {
            if (parent.obj[k] === current.obj) {
              parent.obj[k] = [itemValue];
              current.obj = parent.obj[k];
              break;
            }
          }
        }
      } else if (Array.isArray(current.obj)) {
        current.obj.push(itemValue);
      }
    }
  }

  return frontmatter;
}

/**
 * A string holding a newline as a `|-` literal block scalar: `${pad}${key}: |-`, then each line indented two columns
 * past the key (TRD 52-05). CRLF is normalised; an empty content line is an empty line (no trailing spaces);
 * trailing newlines are dropped, since `|-` strips them on read. An indented line can never be the column-0 `---`
 * that ends the frontmatter. Single-line strings never come here, so their output is unchanged.
 */
function blockScalarLines(pad, key, text) {
  const body = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const out = [`${pad}${key}: |-`];
  if (body !== '') {
    for (const line of body.split('\n')) out.push(line === '' ? '' : `${pad}  ${line}`);
  }
  return out;
}

function reconstructFrontmatter(obj) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every(v => typeof v === 'string') && value.length <= 3 && value.join(', ').length < 60) {
        lines.push(`${key}: [${value.join(', ')}]`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${typeof item === 'string' && (item.includes(':') || item.includes('#')) ? `"${item}"` : item}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [subkey, subval] of Object.entries(value)) {
        if (subval === null || subval === undefined) continue;
        if (Array.isArray(subval)) {
          if (subval.length === 0) {
            lines.push(`  ${subkey}: []`);
          } else if (subval.every(v => typeof v === 'string') && subval.length <= 3 && subval.join(', ').length < 60) {
            lines.push(`  ${subkey}: [${subval.join(', ')}]`);
          } else {
            lines.push(`  ${subkey}:`);
            for (const item of subval) {
              lines.push(`    - ${typeof item === 'string' && (item.includes(':') || item.includes('#')) ? `"${item}"` : item}`);
            }
          }
        } else if (typeof subval === 'object') {
          lines.push(`  ${subkey}:`);
          for (const [subsubkey, subsubval] of Object.entries(subval)) {
            if (subsubval === null || subsubval === undefined) continue;
            if (Array.isArray(subsubval)) {
              if (subsubval.length === 0) {
                lines.push(`    ${subsubkey}: []`);
              } else {
                lines.push(`    ${subsubkey}:`);
                for (const item of subsubval) {
                  lines.push(`      - ${item}`);
                }
              }
            } else {
              lines.push(`    ${subsubkey}: ${subsubval}`);
            }
          }
        } else {
          const sv = String(subval);
          if (sv.includes('\n')) {
            lines.push(...blockScalarLines('  ', subkey, sv));
          } else {
            lines.push(`  ${subkey}: ${sv.includes(':') || sv.includes('#') ? `"${sv}"` : sv}`);
          }
        }
      }
    } else {
      const sv = String(value);
      if (sv.includes('\n')) {
        lines.push(...blockScalarLines('', key, sv));
      } else if (sv.includes(':') || sv.includes('#') || sv.startsWith('[') || sv.startsWith('{')) {
        lines.push(`${key}: "${sv}"`);
      } else {
        lines.push(`${key}: ${sv}`);
      }
    }
  }
  return lines.join('\n');
}

function spliceFrontmatter(content, newObj) {
  const yamlStr = reconstructFrontmatter(newObj);
  const match = content.match(/^---\n[\s\S]+?\n---/);
  if (match) {
    return `---\n${yamlStr}\n---` + content.slice(match[0].length);
  }
  return `---\n${yamlStr}\n---\n\n` + content;
}

// ─── Comment-preserving scalar setter (TRD 46-06) ─────────────────────────────

const unquote = (s) => String(s).trim().replace(/^(["'])(.*)\1$/, '$2');

/**
 * Set ONE scalar `key: value` line inside the first `---` block of `filePath`, touching nothing else.
 *
 * Unlike `cmdFrontmatterSet` this never round-trips the block through extract/reconstruct, so comments
 * (`# OPTIONAL: set manually`), key order, blank lines, the line endings and the body survive byte for byte.
 * The file is written only when the content actually changes, so an already-correct value leaves the mtime
 * alone (a touched OBJECTIVE.md reads as drift to the pull side).
 *
 *   value  the text to write verbatim after `key: `; the caller serialises it. One line, no newline.
 *   opts.ifAbsentOrEqual  refuse to overwrite a DIFFERENT non-empty existing value (reported as a conflict).
 *
 * Returns `{ ok, changed, conflict?, existing?, warning?, error? }`:
 *   missing/unreadable file, or a key/value that would break the line  -> { ok:false, error }
 *   no frontmatter block (file untouched)                              -> { ok:true, changed:false, warning }
 *   existing value differs and ifAbsentOrEqual                         -> { ok:true, changed:false, conflict:true, existing }
 * A bare `key:` counts as absent. Replacing a key that holds a block list/map also removes its continuation
 * lines, so no orphaned `- item` lines are left behind.
 */
function setFrontmatterField(filePath, key, value, opts = {}) {
  const k = String(key);
  const v = String(value);
  if (k === '' || /[\r\n:]/.test(k)) return { ok: false, error: `invalid frontmatter key: ${JSON.stringify(k)}` };
  if (/[\r\n]/.test(v)) return { ok: false, error: `frontmatter value for ${k} must be a single line` };

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return { ok: false, error: `cannot read ${filePath}: ${e.code || e.message}` };
  }

  // Group 1 = the line ending of the opening fence, group 2 = the block (undefined for `---\n---`).
  const m = content.match(/^---(\r?\n)(?:---|([\s\S]*?)\r?\n---)(?=[ \t]*(?:\r?\n|$))/);
  if (!m) return { ok: true, changed: false, warning: `no frontmatter block in ${filePath}; ${k} not written` };

  const eol = m[1];
  const emptyBlock = m[2] === undefined;
  const blockStart = 3 + eol.length;
  const block = emptyBlock ? '' : m[2];
  const blockEnd = blockStart + block.length;
  const newLine = `${k}: ${v}`;

  let nextBlock;
  const lines = block.split('\n');
  const keyRe = new RegExp('^' + escapeRegExp(k) + ':[ \\t]*(.*)(\\r?)$');
  let at = -1;
  let inline = '';
  let cr = '';
  if (!emptyBlock) {
    for (let i = 0; i < lines.length; i++) {
      const lm = lines[i].match(keyRe);
      if (lm) { at = i; inline = lm[1]; cr = lm[2]; break; }
    }
  }

  if (at === -1) {
    nextBlock = emptyBlock ? `${newLine}${eol}` : block + eol + newLine;
  } else {
    // A bare `key:` owns the indented / `- item` lines that follow it.
    let end = at + 1;
    if (inline.trim() === '') {
      while (end < lines.length && /^(?:[ \t]+\S|-(?:[ \t]|\r?$))/.test(lines[end])) end++;
    }
    const existing = inline.trim() !== '' ? unquote(inline) : lines.slice(at + 1, end).join(' ').trim();
    if (existing === unquote(v)) return { ok: true, changed: false };
    if (opts.ifAbsentOrEqual && existing !== '') return { ok: true, changed: false, conflict: true, existing };
    lines.splice(at, end - at, newLine + cr);
    nextBlock = lines.join('\n');
  }

  const next = content.slice(0, blockStart) + nextBlock + content.slice(blockEnd);
  if (next === content) return { ok: true, changed: false };
  fs.writeFileSync(filePath, next, 'utf-8');
  return { ok: true, changed: true };
}

function parseMustHavesBlock(content, blockName) {
  // Extract a specific block from must_haves in raw frontmatter YAML
  // Handles 3-level nesting: must_haves > artifacts/key_links > [{path, provides, ...}]
  const fmMatch = content.match(/^---\n([\s\S]+?)\n---/);
  if (!fmMatch) return [];

  const lines = fmMatch[1].split('\n');
  const indentOf = (line) => line.match(/^( *)/)[1].length;

  // The child indent C of `must_haves:` is taken from the file, not assumed: the template
  // and every real TRD use 2 (items at 4, keys at 6); the legacy layout used 4 (6, 8).
  // Everything below is relative to C. `must_haves:` at column 0 is searched only inside
  // its own block, so a same-named key elsewhere in the frontmatter cannot be picked up.
  let childIndent = 4;
  let from = 0;
  let to = lines.length;
  const mustHavesAt = lines.findIndex((l) => /^must_haves:\s*$/.test(l));
  if (mustHavesAt !== -1) {
    to = mustHavesAt + 1;
    while (to < lines.length && (lines[to].trim() === '' || indentOf(lines[to]) > 0)) to++;
    const firstChild = lines.slice(mustHavesAt + 1, to).find((l) => l.trim() !== '');
    if (firstChild) {
      childIndent = indentOf(firstChild);
      from = mustHavesAt + 1;
    } else {
      to = lines.length; // empty must_haves: fall through to the legacy search
    }
  }

  // Find the block header (e.g. "truths:", "artifacts:", "key_links:") at the child indent.
  // With no column-0 `must_haves:` (a fixture that indents it), the old 4-space search stands.
  const header = new RegExp(`^ {${childIndent}}${escapeRegExp(blockName)}:\\s*$`);
  let headerAt = -1;
  for (let i = from; i < to; i++) {
    if (header.test(lines[i])) { headerAt = i; break; }
  }
  if (headerAt === -1) return [];

  const unquote = (raw) => {
    const v = raw.trim();
    // Strip ONE pair of surrounding quotes, and only when the value both starts and ends
    // with one, so `provides: "has \"x\" key"` keeps its inner quotes.
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"');
    if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
    return v;
  };
  // `[a, "b, c"]` -> ['a', 'b, c']: split on commas that sit outside quotes.
  const flowItems = (inner) => {
    const out = [];
    let cur = '';
    let quote = null;
    for (const ch of inner) {
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim() !== '') out.push(cur);
    return out.map(unquote);
  };
  const scalar = (raw) => {
    const v = raw.trim();
    if (v.startsWith('[') && v.endsWith(']')) return flowItems(v.slice(1, -1));
    const val = unquote(v);
    return /^\d+$/.test(val) ? parseInt(val, 10) : val;
  };

  const items = [];
  let current = null;
  let lastKey = null;
  let itemIndent = -1;

  for (let i = headerAt + 1; i < to; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = indentOf(line);
    if (indent <= childIndent) break; // next sibling key (or a lower level): the block is over

    const text = line.slice(indent);
    if (itemIndent === -1 && text.startsWith('- ')) itemIndent = indent; // C + 2 in practice

    if (indent === itemIndent && text.startsWith('- ')) {
      // New list item, either a plain string or "- key: value" opening an object.
      if (current !== null) items.push(current);
      const rest = text.slice(2).trim();
      const kv = rest.match(/^(\w+):(?:\s+(.*))?$/);
      if (kv) {
        current = { [kv[1]]: scalar(kv[2] || '') };
        lastKey = kv[1];
      } else {
        current = unquote(rest);
        lastKey = null;
      }
    } else if (current !== null && typeof current === 'object') {
      if (text.startsWith('- ')) {
        // Array item under the last key; the key becomes an array on its first item.
        if (lastKey) {
          if (!Array.isArray(current[lastKey])) current[lastKey] = current[lastKey] ? [current[lastKey]] : [];
          current[lastKey].push(unquote(text.slice(2)));
        }
      } else {
        // Continuation key-value belonging to the current object.
        const kv = text.match(/^(\w+):(?:\s+(.*))?$/);
        if (kv) {
          current[kv[1]] = scalar(kv[2] || '');
          lastKey = kv[1];
        }
      }
    }
  }
  if (current !== null) items.push(current);

  return items;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

const FRONTMATTER_SCHEMAS = {
  plan: { required: ['objective', 'job', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  trd:  { required: ['objective', 'trd', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  // Note: NO 'confidence' in trd.required. Field is accepted if present (back-compat), but not required.
  summary: { required: ['objective', 'job', 'subsystem', 'tags', 'duration', 'completed'] },
  verification: { required: ['objective', 'verified', 'status', 'score'] },
};

function cmdFrontmatterGet(cwd, filePath, field, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }
  const fm = extractFrontmatter(content);
  if (field) {
    const value = fm[field];
    if (value === undefined) { output({ error: 'Field not found', field }, raw); return; }
    output({ [field]: value }, raw, JSON.stringify(value));
  } else {
    output(fm, raw);
  }
}

/**
 * Store mode (objective 48, TRD 48-14, D-19): the refusal for a frontmatter edit of a GitHub-backed cache file, or
 * null when the edit may go ahead (local mode, a runtime / tracked-config / generated planning path, or a file
 * outside .planning/). The target is resolved against the MAIN checkout's .planning/ (D-14), then the cwd's.
 * Everything is required lazily: this module is imported widely and its load cost stays flat.
 */
function storeCacheRefusal(cwd, fullPath) {
  const planningMode = require('./planning-mode.cjs');
  if (!planningMode.isStoreMode(cwd)) return null;
  const planningPaths = require('./planning-paths.cjs');
  const main = planningMode.resolveMainRoot(cwd);
  for (const dir of [main && path.join(main, '.planning'), path.join(cwd, '.planning')]) {
    const rel = dir ? planningPaths.relToPlanning(fullPath, dir) : null;
    if (rel === null) continue;
    let c;
    try {
      c = planningPaths.classify(rel);
    } catch {
      return null; // a name the classifier refuses is runtime (planning-paths listByClass)
    }
    if (c.class !== 'cache') return null;
    return `${rel} is a GitHub-backed cache file in store mode; frontmatter edits go through aof-tools ${c.verb} ` +
      `(edit a draft: aof-tools planning draft ${rel})`;
  }
  return null;
}

function cmdFrontmatterSet(cwd, filePath, field, value, raw) {
  if (!filePath || !field || value === undefined) { error('file, field, and value required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) { output({ error: 'File not found', path: filePath }, raw); return; }
  const refusal = storeCacheRefusal(cwd, fullPath);
  if (refusal) { error(refusal); }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  let parsedValue;
  try { parsedValue = JSON.parse(value); } catch { parsedValue = value; }
  fm[field] = parsedValue;
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, newContent, 'utf-8');
  output({ updated: true, field, value: parsedValue }, raw, 'true');
}

function cmdFrontmatterMerge(cwd, filePath, data, raw) {
  if (!filePath || !data) { error('file and data required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) { output({ error: 'File not found', path: filePath }, raw); return; }
  const refusal = storeCacheRefusal(cwd, fullPath);
  if (refusal) { error(refusal); }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  let mergeData;
  try { mergeData = JSON.parse(data); } catch { error('Invalid JSON for --data'); return; }
  Object.assign(fm, mergeData);
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, newContent, 'utf-8');
  output({ merged: true, fields: Object.keys(mergeData) }, raw, 'true');
}

function cmdFrontmatterValidate(cwd, filePath, schemaName, raw) {
  if (!filePath || !schemaName) { error('file and schema required'); }
  const schema = FRONTMATTER_SCHEMAS[schemaName];
  if (!schema) { error(`Unknown schema: ${schemaName}. Available: ${Object.keys(FRONTMATTER_SCHEMAS).join(', ')}`); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }
  const fm = extractFrontmatter(content);
  const missing = schema.required.filter(f => fm[f] === undefined);
  const present = schema.required.filter(f => fm[f] !== undefined);
  output({ valid: missing.length === 0, missing, present, schema: schemaName }, raw, missing.length === 0 ? 'valid' : 'invalid');
}

module.exports = {
  extractFrontmatter,
  reconstructFrontmatter,
  spliceFrontmatter,
  setFrontmatterField,
  parseMustHavesBlock,
  FRONTMATTER_SCHEMAS,
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
};
