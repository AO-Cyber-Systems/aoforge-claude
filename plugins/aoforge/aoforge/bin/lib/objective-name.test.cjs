'use strict';

// objective-name.test.cjs (TRD 61-03) — the one chain that names an objective for its GitHub issue and its PR.
//
// Test list:
//   1  objectiveHeadingName(dir): the OBJECTIVE.md title heading without its `Objective N` prefix, or null
//   2  bareSlug(dirName): the directory name without its number prefix, or null
//   3  objectiveDisplayName: ROADMAP name, then the heading, then the bare slug, then `objective <number>`
//
// Pure: the only I/O is an OBJECTIVE.md written to a temp dir. Nothing touches ~/.claude, a remote or GitHub.

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { objectiveHeadingName, bareSlug, objectiveDisplayName } = require('./objective-name.cjs');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-objname-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const writeObjective = (text) => fs.writeFileSync(path.join(dir, 'OBJECTIVE.md'), text);

describe('61-03 objectiveHeadingName', () => {
  test('1a. a `# Objective N: name` heading after frontmatter gives the name', () => {
    writeObjective('---\nwork: feature\n---\n\n# Objective 7: Store demo\n');
    assert.equal(objectiveHeadingName(dir), 'Store demo');
  });

  test('1b. an em dash or a hyphen after the number is stripped too', () => {
    writeObjective('# Objective 7 — Store demo\n');
    assert.equal(objectiveHeadingName(dir), 'Store demo');
    writeObjective('# Objective 7 - Store demo\n');
    assert.equal(objectiveHeadingName(dir), 'Store demo');
  });

  test('1c. a heading with no `Objective N` prefix is the name as written', () => {
    writeObjective('# Store demo\n');
    assert.equal(objectiveHeadingName(dir), 'Store demo');
  });

  test('1d. `# Objective 7` alone has no name', () => {
    writeObjective('# Objective 7\n');
    assert.equal(objectiveHeadingName(dir), null);
  });

  test('1e. no OBJECTIVE.md has no name', () => {
    assert.equal(objectiveHeadingName(dir), null);
  });

  test('1f. a `# ` line inside the frontmatter is not a heading', () => {
    writeObjective('---\n# a yaml comment\nwork: feature\n---\n\nNo heading here.\n');
    assert.equal(objectiveHeadingName(dir), null);
  });
});

describe('61-03 bareSlug', () => {
  test('2. the number prefix goes, a decimal prefix too, an unnumbered name stays, nothing gives null', () => {
    assert.equal(bareSlug('07-store-demo'), 'store-demo');
    assert.equal(bareSlug('07.1-hotfix'), 'hotfix');
    assert.equal(bareSlug('store-demo'), 'store-demo');
    assert.equal(bareSlug(''), null);
    assert.equal(bareSlug(null), null);
    assert.equal(bareSlug(undefined), null);
  });
});

describe('61-03 objectiveDisplayName', () => {
  test('3a. the ROADMAP name wins over the heading and the slug', () => {
    writeObjective('# Objective 7: Heading name\n');
    assert.equal(
      objectiveDisplayName({ roadmapName: 'Roadmap name', objDir: dir, dirName: '07-store-demo', number: '7' }),
      'Roadmap name',
    );
  });

  test('3b. with no ROADMAP name the heading wins over the slug', () => {
    writeObjective('# Objective 7: Heading name\n');
    assert.equal(
      objectiveDisplayName({ roadmapName: null, objDir: dir, dirName: '07-store-demo', number: '7' }),
      'Heading name',
    );
  });

  test('3c. with no ROADMAP name and no heading the bare slug wins over `objective <number>`', () => {
    writeObjective('No heading here.\n');
    assert.equal(
      objectiveDisplayName({ roadmapName: undefined, objDir: dir, dirName: '07-store-demo', number: '7' }),
      'store-demo',
    );
  });

  test('3d. with nothing at all the name is `objective <number>`', () => {
    assert.equal(objectiveDisplayName({ roadmapName: null, objDir: null, dirName: null, number: '7' }), 'objective 7');
    assert.equal(objectiveDisplayName({ number: '7' }), 'objective 7');
  });
});
