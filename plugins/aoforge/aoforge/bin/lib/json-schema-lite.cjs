'use strict';

// A hand-rolled walk of a JSON-Schema SUBSET — not an engine. No external package dependency
// (repo policy): this repo carries exactly one intentional runtime dependency, and a schema
// validator package is not going to be the second.
//
// Supported: $ref, type (string or union array), const, enum, pattern, minLength, format:date,
// minimum, required, properties, additionalProperties (false | schema), propertyNames, items,
// uniqueItems, anyOf, oneOf. Everything else (descriptions, minItems, $id) is ignored — in
// particular `minItems` is deliberately NOT enforced: surface-spec.schema.json declares it, and
// enforcing it would change ui-spec verdicts. Neutral: this module names no stack.
//
// Extracted from ui-spec-validate.cjs (35-01) so both ui-spec and stack-profile validation share
// one walker. Message text for the extracted keywords is copied verbatim — ui-spec's tests match
// on it.

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function join(ptr, key) {
  return ptr ? `${ptr}.${key}` : String(key);
}

function deref(node, root) {
  let seen = 0;
  while (node && typeof node.$ref === 'string') {
    if (++seen > 16) return {};
    const parts = node.$ref.replace(/^#\//, '').split('/');
    let cur = root;
    for (const p of parts) {
      cur = cur && cur[p.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    node = cur || {};
  }
  return node || {};
}

function typeOk(value, type) {
  if (Array.isArray(type)) return type.some((t) => typeOk(value, t));
  switch (type) {
    case 'object': return isPlainObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return true;
  }
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** `date` format: the string must match YYYY-MM-DD AND name a real calendar date. */
function isValidDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Collects `{path, msg}` errors for `value` against schema `node`. Returns the error array. */
function checkStructure(value, node, root, ptr) {
  const out = [];
  const s = deref(node, root);

  if (Array.isArray(s.anyOf) || Array.isArray(s.oneOf)) {
    const branches = s.anyOf || s.oneOf;
    const matched = branches.some((b) => checkStructure(value, b, root, ptr).length === 0);
    if (!matched) {
      out.push({ path: ptr, msg: `value does not match any form the schema declares for this node (got ${describe(value)})` });
    }
    return out;
  }

  if (s.type && !typeOk(value, s.type)) {
    const typeLabel = Array.isArray(s.type) ? s.type.join('|') : s.type;
    out.push({ path: ptr, msg: `expected type ${typeLabel} here, got ${describe(value)}` });
    return out; // every further check on this node would be noise about the same defect
  }

  if (Array.isArray(s.enum) && !s.enum.includes(value)) {
    out.push({ path: ptr, msg: `value ${JSON.stringify(value)} is not one of the declared values: ${s.enum.join(', ')}` });
    return out;
  }

  if ('const' in s && JSON.stringify(value) !== JSON.stringify(s.const)) {
    out.push({ path: ptr, msg: `value ${JSON.stringify(value)} is not the declared constant ${JSON.stringify(s.const)}` });
    return out;
  }

  if (typeof s.pattern === 'string' && typeof value === 'string') {
    if (!new RegExp(s.pattern).test(value)) {
      out.push({ path: ptr, msg: `${JSON.stringify(value)} does not match the pattern the schema declares here: ${s.pattern}` });
      return out;
    }
  }

  if (typeof value === 'string') {
    if (typeof s.minLength === 'number' && value.length < s.minLength) {
      out.push({ path: ptr, msg: `string is shorter than the declared minLength ${s.minLength}` });
      return out;
    }
    if (s.format === 'date' && !isValidDate(value)) {
      out.push({ path: ptr, msg: `${JSON.stringify(value)} is not a valid date (YYYY-MM-DD)` });
      return out;
    }
  }

  if (typeof s.minimum === 'number' && typeof value === 'number' && value < s.minimum) {
    out.push({ path: ptr, msg: `value ${value} is below the declared minimum ${s.minimum}` });
  }

  if (Array.isArray(value) && s.uniqueItems) {
    const seenKeys = new Set();
    for (const el of value) {
      const key = JSON.stringify(el);
      if (seenKeys.has(key)) {
        out.push({ path: ptr, msg: `array items are not unique: duplicate ${JSON.stringify(el)}` });
        return out;
      }
      seenKeys.add(key);
    }
  }

  if (Array.isArray(value) && s.items) {
    value.forEach((el, i) => {
      out.push(...checkStructure(el, s.items, root, `${ptr}[${i}]`));
    });
    return out;
  }

  if (isPlainObject(value)) {
    const props = s.properties || {};

    for (const key of s.required || []) {
      if (!(key in value)) {
        out.push({ path: join(ptr, key), msg: `required key ${JSON.stringify(key)} is absent — the schema declares it here` });
      }
    }

    if (s.propertyNames) {
      for (const key of Object.keys(value)) {
        const keyPtr = join(ptr, key);
        out.push(
          ...checkStructure(key, s.propertyNames, root, keyPtr)
            .map((e) => ({ path: e.path, msg: `property name ${JSON.stringify(key)}: ${e.msg}` }))
        );
      }
    }

    for (const [key, v] of Object.entries(value)) {
      if (props[key]) {
        out.push(...checkStructure(v, props[key], root, join(ptr, key)));
      } else if (s.additionalProperties === false) {
        out.push({ path: join(ptr, key), msg: `unknown key ${JSON.stringify(key)} — the schema declares no such property here` });
      } else if (isPlainObject(s.additionalProperties)) {
        out.push(...checkStructure(v, s.additionalProperties, root, join(ptr, key)));
      }
    }
  }

  return out;
}

function validate(value, schema) {
  return checkStructure(value, schema, schema, '');
}

module.exports = { deref, typeOk, checkStructure, validate, describe, isPlainObject, join };
