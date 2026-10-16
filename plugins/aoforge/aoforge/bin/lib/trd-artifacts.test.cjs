'use strict';
// parseMustHavesArtifacts: structured must_haves.artifacts from raw TRD frontmatter. The `tests`
// block takes any nested key (objective 77: test kinds are stack pack vocabulary, not core's).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMustHavesArtifacts } = require('./trd-artifacts.cjs');

const TRD = `---
objective: 01
must_haves:
  truths:
    - "a thing works"
  artifacts:
    - path: src/panel.ts
      provides: the panel
      states: [loading, empty, error]
      tests:
        unit: src/panel.test.ts
        e2e: e2e/panel.spec.ts
      contains: renderPanel
    - path: src/other.ts
      contains_also: [a, b]
  key_links: []
files_modified: []
---
body`;

test('artifacts parse with their sub-fields', () => {
  const out = parseMustHavesArtifacts(TRD);
  assert.deepEqual(out, [
    {
      path: 'src/panel.ts',
      provides: 'the panel',
      states: ['loading', 'empty', 'error'],
      tests: { unit: 'src/panel.test.ts', e2e: 'e2e/panel.spec.ts' },
      contains: 'renderPanel',
    },
    { path: 'src/other.ts', contains_also: ['a', 'b'] },
  ]);
});

test('a sibling field after tests ends the tests block', () => {
  const [first] = parseMustHavesArtifacts(TRD);
  assert.equal(first.tests.contains, undefined);
  assert.equal(first.contains, 'renderPanel');
});

test('no frontmatter or no must_haves yields nothing', () => {
  assert.deepEqual(parseMustHavesArtifacts('no fm'), []);
  assert.deepEqual(parseMustHavesArtifacts('---\nobjective: 1\n---\n'), []);
});
