'use strict';

/**
 * Hand-built inputs for the pointer-skill generator (scripts/gen-pointer-skills.cjs, TRD 72-14).
 *
 * The generator reads every AOForge skill under plugins/aoforge/skills and writes one
 * forwarding skill per AOForge skill under plugins/devflow/skills, the final release of the
 * old devflow@aocyber plugin. These fixtures lay out that pair of directories in a tmp root.
 *
 * Nothing on the AOForge side is generated: the three skills are typed out, and EXPECTED
 * holds, typed out too, what the generator must read from each one. Each skill exercises one
 * shape the real skills have:
 *   alpha  a multi-line block description holding colons and quotes, a quoted argument hint
 *   beta   a one-line quoted description with a colon, no hint, and frontmatter the pointer
 *          must not copy (requires:, model:)
 *   gamma  a manual-only skill (disable-model-invocation) whose hint is unquoted brackets,
 *          which a YAML reader would take for a flow sequence (the real debug skill does this)
 *
 * Pointer-side states: empty, complete, missing (beta has no pointer), extra (a stray ghost
 * pointer), stale (alpha's pointer carries an old description). The pointers of the complete
 * state come from the `render` function the test passes in, so the fixture does not depend on
 * the generator; only the stale and the stray pointer are typed out here.
 *
 * This file spells the legacy plugin name on purpose (the pointer plugin keeps it), and
 * `__fixtures__/legacy-*` is on the allow-list for legacy spellings.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** relName -> SKILL.md text, typed out. */
const AOFORGE_SKILLS = {
  alpha: [
    '---',
    'name: alpha',
    'description: |',
    '  Alpha does the first thing.',
    '  Use when: the user asks for alpha.',
    '  Triggers on: "alpha", "first thing"',
    'argument-hint: "[--fast] <target>"',
    'allowed-tools:',
    '  - Read',
    '  - Bash',
    '---',
    '<objective>',
    'Alpha body.',
    '</objective>',
    '',
  ].join('\n'),
  beta: [
    '---',
    'name: beta',
    'description: "Beta: one line, no hint."',
    'requires:',
    '  - gh',
    'model: sonnet',
    'allowed-tools:',
    '  - Read',
    '---',
    'Beta body.',
    '',
  ].join('\n'),
  gamma: [
    '---',
    'name: gamma',
    'description: |',
    '  Gamma is started by the user only.',
    'argument-hint: [issue description]',
    'disable-model-invocation: true',
    'allowed-tools: Bash',
    '---',
    'Gamma body.',
    '',
  ].join('\n'),
};

/** What the generator must read from each AOForge skill (the renderPointerSkill input). */
const EXPECTED = {
  alpha: {
    name: 'alpha',
    description: 'Alpha does the first thing.\nUse when: the user asks for alpha.\nTriggers on: "alpha", "first thing"\n',
    argumentHint: '[--fast] <target>',
    manualOnly: false,
  },
  beta: {
    name: 'beta',
    description: 'Beta: one line, no hint.',
    argumentHint: null,
    manualOnly: false,
  },
  gamma: {
    name: 'gamma',
    description: 'Gamma is started by the user only.\n',
    argumentHint: '[issue description]',
    manualOnly: true,
  },
};

const STATES = ['empty', 'complete', 'missing', 'extra', 'stale'];

/** The skill each broken state is about. */
const MISSING = 'beta';
const EXTRA = 'ghost';
const STALE = 'alpha';

/** alpha's pointer as an earlier release wrote it: the description has since changed. */
const STALE_POINTER = [
  '---',
  'name: alpha',
  'description: |',
  '  An older description of alpha.',
  'allowed-tools:',
  '  - Skill',
  '---',
  'DevFlow is now AOForge. This command moved to `/aoforge:alpha`.',
  '',
].join('\n');

/** A pointer for a skill AOForge does not ship. */
const EXTRA_POINTER = [
  '---',
  'name: ghost',
  'description: |',
  '  A skill AOForge no longer ships.',
  'allowed-tools:',
  '  - Skill',
  '---',
  'DevFlow is now AOForge. This command moved to `/aoforge:ghost`.',
  '',
].join('\n');

function writeSkill(skillsDir, name, text) {
  const dir = path.join(skillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), text);
}

/**
 * A tmp root holding plugins/aoforge/skills (the three typed-out skills) and
 * plugins/devflow/skills in `state`.
 *
 * @param {'empty'|'complete'|'missing'|'extra'|'stale'} state
 * @param {{ render?: (skill: object) => string }} [opts] renders a pointer from an EXPECTED
 *   entry; required by every state but `empty`
 * @returns {{ root: string, aoforgeSkills: string, pointerSkills: string, cleanup: () => void }}
 */
function pointerFixture(state, { render } = {}) {
  if (!STATES.includes(state)) throw new Error(`unknown pointer fixture state: ${state}`);
  if (state !== 'empty' && typeof render !== 'function') {
    throw new Error(`pointer fixture state ${state} needs { render }`);
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pointer-skills-'));
  const aoforgeSkills = path.join(root, 'plugins', 'aoforge', 'skills');
  const pointerSkills = path.join(root, 'plugins', 'devflow', 'skills');
  for (const [name, text] of Object.entries(AOFORGE_SKILLS)) writeSkill(aoforgeSkills, name, text);
  fs.mkdirSync(pointerSkills, { recursive: true });

  if (state !== 'empty') {
    for (const name of Object.keys(AOFORGE_SKILLS)) {
      if (state === 'missing' && name === MISSING) continue;
      const text = state === 'stale' && name === STALE ? STALE_POINTER : render(EXPECTED[name]);
      writeSkill(pointerSkills, name, text);
    }
    if (state === 'extra') writeSkill(pointerSkills, EXTRA, EXTRA_POINTER);
  }

  return {
    root,
    aoforgeSkills,
    pointerSkills,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

module.exports = {
  AOFORGE_SKILLS,
  EXPECTED,
  STATES,
  MISSING,
  EXTRA,
  STALE,
  STALE_POINTER,
  EXTRA_POINTER,
  pointerFixture,
};
