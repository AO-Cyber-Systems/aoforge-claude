'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// Parity (behaviour extracted from ui-spec-validate.cjs, message text must match exactly):
//   1. $ref chain (#/$defs/a -> #/$defs/b) resolves; a ref to a missing node resolves to {} (accepts anything)
//   2. Type mismatch -> exactly one error "expected type object here, got string"; no descent into children
//   3. enum miss -> value "x" is not one of the declared values: a, b
//   4. pattern miss -> "X" does not match the pattern the schema declares here: ^[a-z]+$
//   5. minimum -> value 0 is below the declared minimum 1
//   6. required key absent -> path obj.key, message required key "key" is absent — the schema declares it here
//   7. additionalProperties: false unknown key -> unknown key "zz" — the schema declares no such property here
//   8. items -> element paths list[1]
//   9. anyOf/oneOf with no matching branch -> value does not match any form the schema declares for this node (got number)
// New keywords:
//   10. Union type: ["string","null"]: accepts null and "a", rejects 3 with expected type string|null here, got number
//   11. const: 1: accepts 1, rejects 2 -> value 2 is not the declared constant 1
//   12. propertyNames: {pattern: "^[a-z][a-z0-9_]*$"}: key Bad-Key -> one error at path obj.Bad-Key, message starts property name "Bad-Key":
//   13. minLength: 1: "" rejected -> string is shorter than the declared minLength 1
//   14. uniqueItems: true: ["a","a"] rejected -> array items are not unique: duplicate "a"; ["a","b"] passes
//   15. format: "date": "2026-09-27" passes; "2026-13-01", "2026-02-30", "yesterday" fail -> "yesterday" is not a valid date (YYYY-MM-DD); a non-string is not format-checked
//   16. additionalProperties: {$ref: "#/$defs/command"}: an extra key whose value violates the referenced schema yields errors at commands.test.run; a conforming one yields none
//   17. minItems: 1 with [] -> NO error (documents the deliberate non-support; see gotchas)
// Positive control (integration):
//   18. Frontmatter of references/stack-general.md and stack-profiles/{go,dart,flutter}.md validates against schemas/stack-profile.schema.json with []
//   19. A copy of the go profile with commands.test.run = "" and provenance.reviewed = "soon" yields exactly two errors (minLength, format)

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { validate } = require('./json-schema-lite.cjs');
const { parseYamlLite } = require('./yaml-lite.cjs');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Split a markdown file on its `---` frontmatter fences and parse the YAML with parseYamlLite. */
function readFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  const yaml = lines.slice(1, close).join('\n');
  return parseYamlLite(yaml);
}

const STACK_PROFILE_SCHEMA_PATH = path.join(
  __dirname,
  '..', '..', 'schemas', 'stack-profile.schema.json'
);
const STACK_GENERAL_PATH = path.join(__dirname, '..', '..', 'references', 'stack-general.md');
// The tier-2 profiles ship bundled in the plugin beside references/ and schemas/ (TRD 42-02).
const STACK_PROFILES_DIR = path.join(__dirname, '..', '..', 'stack-profiles');

function loadStackProfileSchema() {
  return JSON.parse(fs.readFileSync(STACK_PROFILE_SCHEMA_PATH, 'utf8'));
}

// ─── Parity ─────────────────────────────────────────────────────────────────

describe('parity — behaviour extracted from ui-spec-validate.cjs', () => {
  test('1. $ref chain resolves; a ref to a missing node resolves to {} (accepts anything)', () => {
    const schema = {
      $defs: {
        a: { $ref: '#/$defs/b' },
        b: { type: 'string' }
      },
      type: 'object',
      properties: { x: { $ref: '#/$defs/a' }, y: { $ref: '#/$defs/missing' } }
    };
    assert.deepStrictEqual(validate({ x: 'ok' }, schema), []);
    assert.deepStrictEqual(validate({ x: 3 }, schema), [
      { path: 'x', msg: 'expected type string here, got number' }
    ]);
    // A ref to a missing node dereferences to {} — no constraints, anything passes.
    assert.deepStrictEqual(validate({ y: 'anything at all' }, schema), []);
    assert.deepStrictEqual(validate({ y: 12345 }, schema), []);
  });

  test('2. type mismatch -> exactly one error; no descent into children', () => {
    const schema = {
      type: 'object',
      required: ['x'],
      properties: { x: { type: 'string' } }
    };
    // Value is not even an object: a naive walker would ALSO complain about the missing
    // required key `x` and the (non-existent) properties. The type check must return early.
    const result = validate('not an object', schema);
    assert.deepStrictEqual(result, [
      { path: '', msg: 'expected type object here, got string' }
    ]);
  });

  test('3. enum miss', () => {
    const schema = { enum: ['a', 'b'] };
    assert.deepStrictEqual(validate('x', schema), [
      { path: '', msg: 'value "x" is not one of the declared values: a, b' }
    ]);
    assert.deepStrictEqual(validate('a', schema), []);
  });

  test('4. pattern miss', () => {
    const schema = { type: 'string', pattern: '^[a-z]+$' };
    assert.deepStrictEqual(validate('X', schema), [
      { path: '', msg: '"X" does not match the pattern the schema declares here: ^[a-z]+$' }
    ]);
    assert.deepStrictEqual(validate('ok', schema), []);
  });

  test('5. minimum', () => {
    const schema = { type: 'number', minimum: 1 };
    assert.deepStrictEqual(validate(0, schema), [
      { path: '', msg: 'value 0 is below the declared minimum 1' }
    ]);
    assert.deepStrictEqual(validate(1, schema), []);
  });

  test('6. required key absent -> path obj.key', () => {
    const schema = {
      type: 'object',
      properties: { obj: { type: 'object', required: ['key'] } }
    };
    assert.deepStrictEqual(validate({ obj: {} }, schema), [
      { path: 'obj.key', msg: 'required key "key" is absent — the schema declares it here' }
    ]);
  });

  test('7. additionalProperties: false unknown key', () => {
    const schema = { type: 'object', additionalProperties: false, properties: {} };
    assert.deepStrictEqual(validate({ zz: 1 }, schema), [
      { path: 'zz', msg: 'unknown key "zz" — the schema declares no such property here' }
    ]);
  });

  test('8. items -> element paths list[1]', () => {
    const schema = {
      type: 'object',
      properties: { list: { type: 'array', items: { type: 'string' } } }
    };
    const result = validate({ list: ['a', 2, 'c'] }, schema);
    assert.deepStrictEqual(result, [{ path: 'list[1]', msg: 'expected type string here, got number' }]);
  });

  test('9. anyOf/oneOf with no matching branch', () => {
    const anyOfSchema = { anyOf: [{ type: 'string' }, { type: 'boolean' }] };
    assert.deepStrictEqual(validate(3, anyOfSchema), [
      { path: '', msg: 'value does not match any form the schema declares for this node (got number)' }
    ]);
    assert.deepStrictEqual(validate('ok', anyOfSchema), []);

    const oneOfSchema = { oneOf: [{ type: 'string' }, { type: 'boolean' }] };
    assert.deepStrictEqual(validate(3, oneOfSchema), [
      { path: '', msg: 'value does not match any form the schema declares for this node (got number)' }
    ]);
  });
});

// ─── New keywords ───────────────────────────────────────────────────────────

describe('new keywords', () => {
  test('10. union type ["string","null"]', () => {
    const schema = { type: ['string', 'null'] };
    assert.deepStrictEqual(validate(null, schema), []);
    assert.deepStrictEqual(validate('a', schema), []);
    assert.deepStrictEqual(validate(3, schema), [
      { path: '', msg: 'expected type string|null here, got number' }
    ]);
  });

  test('11. const: 1', () => {
    const schema = { const: 1 };
    assert.deepStrictEqual(validate(1, schema), []);
    assert.deepStrictEqual(validate(2, schema), [
      { path: '', msg: 'value 2 is not the declared constant 1' }
    ]);
  });

  test('12. propertyNames pattern -> one error at path obj.Bad-Key', () => {
    const schema = {
      type: 'object',
      properties: {
        obj: { type: 'object', propertyNames: { pattern: '^[a-z][a-z0-9_]*$' } }
      }
    };
    const result = validate({ obj: { 'Bad-Key': 1 } }, schema);
    assert.strictEqual(result.length, 1, JSON.stringify(result));
    assert.strictEqual(result[0].path, 'obj.Bad-Key');
    assert.ok(
      result[0].msg.startsWith('property name "Bad-Key":'),
      `expected message to start with property name "Bad-Key": — got ${result[0].msg}`
    );
    assert.deepStrictEqual(validate({ obj: { ok_key: 1 } }, schema), []);
  });

  test('13. minLength', () => {
    const schema = { type: 'string', minLength: 1 };
    assert.deepStrictEqual(validate('', schema), [
      { path: '', msg: 'string is shorter than the declared minLength 1' }
    ]);
    assert.deepStrictEqual(validate('a', schema), []);
  });

  test('14. uniqueItems', () => {
    const schema = { type: 'array', uniqueItems: true };
    assert.deepStrictEqual(validate(['a', 'a'], schema), [
      { path: '', msg: 'array items are not unique: duplicate "a"' }
    ]);
    assert.deepStrictEqual(validate(['a', 'b'], schema), []);
  });

  test('15. format: date', () => {
    const schema = { type: 'string', format: 'date' };
    assert.deepStrictEqual(validate('2026-09-27', schema), []);
    assert.deepStrictEqual(validate('2026-13-01', schema), [
      { path: '', msg: '"2026-13-01" is not a valid date (YYYY-MM-DD)' }
    ]);
    assert.deepStrictEqual(validate('2026-02-30', schema), [
      { path: '', msg: '"2026-02-30" is not a valid date (YYYY-MM-DD)' }
    ]);
    assert.deepStrictEqual(validate('yesterday', schema), [
      { path: '', msg: '"yesterday" is not a valid date (YYYY-MM-DD)' }
    ]);
    // A non-string is not format-checked — no `type` declared here, so a number sails through.
    assert.deepStrictEqual(validate(20260927, { format: 'date' }), []);
  });

  test('16. additionalProperties: {$ref} — object-form additionalProperties', () => {
    const schema = {
      $defs: {
        command: {
          type: 'object',
          required: ['run'],
          properties: { run: { type: 'string', minLength: 1 } }
        }
      },
      type: 'object',
      properties: {
        commands: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/command' }
        }
      }
    };
    const bad = { commands: { test: { run: '' } } };
    assert.deepStrictEqual(validate(bad, schema), [
      { path: 'commands.test.run', msg: 'string is shorter than the declared minLength 1' }
    ]);
    const good = { commands: { test: { run: 'go test ./...' } } };
    assert.deepStrictEqual(validate(good, schema), []);
  });

  test('17. minItems is NOT enforced (deliberate non-support)', () => {
    const schema = { type: 'array', minItems: 1 };
    assert.deepStrictEqual(validate([], schema), []);
  });
});

// ─── Positive control (integration) ────────────────────────────────────────

describe('positive control — shipped stack profiles', () => {
  const schema = loadStackProfileSchema();

  test('18a. stack-general.md frontmatter validates with []', () => {
    const fm = readFrontmatter(STACK_GENERAL_PATH);
    assert.deepStrictEqual(validate(fm, schema), []);
  });

  for (const name of ['go', 'dart', 'flutter']) {
    test(`18b. stack-profiles/${name}.md frontmatter validates with []`, () => {
      const fm = readFrontmatter(path.join(STACK_PROFILES_DIR, `${name}.md`));
      assert.deepStrictEqual(validate(fm, schema), []);
    });
  }

  test('19. a broken copy of the go profile yields exactly two errors (minLength, format)', () => {
    const fm = readFrontmatter(path.join(STACK_PROFILES_DIR, 'go.md'));
    const broken = JSON.parse(JSON.stringify(fm));
    broken.commands.test.run = '';
    broken.provenance.reviewed = 'soon';
    const result = validate(broken, schema);
    assert.strictEqual(result.length, 2, JSON.stringify(result));
    const msgs = result.map((e) => e.msg).sort();
    assert.ok(msgs.some((m) => m.includes('minLength')), JSON.stringify(result));
    assert.ok(msgs.some((m) => m.includes('valid date')), JSON.stringify(result));
  });
});
