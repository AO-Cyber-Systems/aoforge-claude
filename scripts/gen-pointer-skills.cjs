#!/usr/bin/env node
'use strict';

/**
 * gen-pointer-skills: the forwarding skills of the final devflow@aocyber release (TRD 72-14).
 *
 * DevFlow is now AOForge. Users who still have the old plugin get one last release of it from
 * the same marketplace: plugins/devflow, which holds a SessionStart notice and, for every
 * AOForge skill, a skill of the same name that forwards `/devflow:<name>` to `/aoforge:<name>`.
 * This script writes those forwarding skills from plugins/aoforge/skills and keeps them in
 * step: `--check` (run by scripts/gen-pointer-skills.legacy.test.cjs) fails on a pointer that
 * is missing, extra or stale.
 *
 * A pointer carries only the AOForge skill's description and argument hint, plus
 * `disable-model-invocation` when the AOForge skill has it: such a skill runs only when the
 * user types it, and the Skill tool cannot start it, so its pointer asks the user to type the
 * new command instead of forwarding. Nothing else is copied (requires:, model:, the AOForge
 * allowed-tools): a pointer allows only the Skill tool.
 *
 * Usage:
 *   node scripts/gen-pointer-skills.cjs --write [--source <dir>] [--dest <dir>]
 *   node scripts/gen-pointer-skills.cjs --check [--source <dir>] [--dest <dir>]
 * Defaults: --source plugins/aoforge/skills, --dest plugins/devflow/skills.
 * Exit: 0 written, or in step; 1 --check found a missing, extra or stale pointer (or a source
 * skill could not be read); 2 usage.
 *
 * The pointer plugin is removed in the release after 3.0.0, and this script with it.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const { NAMES, LEGACY, SHIM_REMOVAL } = require(
  path.join(REPO_ROOT, 'plugins', 'aoforge', 'aoforge', 'bin', 'lib', 'legacy-names.cjs'),
);

const DEFAULT_SOURCE = path.join(REPO_ROOT, 'plugins', NAMES.slug, 'skills');
const DEFAULT_DEST = path.join(REPO_ROOT, 'plugins', LEGACY.slug, 'skills');
const MARKETPLACE = NAMES.plugin.slice(NAMES.plugin.indexOf('@') + 1);

const USAGE = 'usage: node scripts/gen-pointer-skills.cjs (--write | --check) [--source <dir>] [--dest <dir>]\n';

// ─── reading an AOForge skill ─────────────────────────────────────────────────────

/**
 * A block scalar's text. Indentation is the first non-empty line's, as YAML detects it.
 * Chomping: `-` strips trailing newlines, none keeps one, `+` keeps them all. A folded (`>`)
 * block is refused: no AOForge skill uses one, and a wrong fold would change the description.
 */
function decodeBlock(indicator, bodyLines, where) {
  if (indicator.startsWith('>')) throw new Error(`${where}: a folded (>) block scalar is not supported`);
  const first = bodyLines.find((l) => l.trim() !== '');
  if (first === undefined) return '';
  const indent = first.match(/^ */)[0].length;
  const text = bodyLines.map((l) => (l.trim() === '' ? '' : l.slice(indent))).join('\n');
  const core = text.replace(/\n+$/, '');
  const chomp = indicator.slice(1);
  if (chomp === '-') return core;
  if (chomp === '+') return `${text}\n`;
  return `${core}\n`;
}

/**
 * A one-line scalar's text. Double-quoted: read as a JSON string (the escapes the AOForge
 * files use are JSON's). Single-quoted: `''` is a quote. Plain: the raw text, so an unquoted
 * `[issue description]` hint stays the string the user sees, not a YAML flow sequence.
 */
function decodeScalar(raw, where) {
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`${where}: unreadable double-quoted value ${raw}`);
    }
  }
  if (raw.startsWith("'")) {
    if (raw.length < 2 || !raw.endsWith("'")) throw new Error(`${where}: unclosed single-quoted value ${raw}`);
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw.replace(/\s+#.*$/, '');
}

/** The top-level keys of a frontmatter block: key -> { block, lines } | { scalar }. */
function topLevelEntries(yaml) {
  const lines = yaml.split(/\r?\n/);
  const entries = {};
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
    if (!km) continue; // list items and nested keys of another entry
    const [, key, rest] = km;
    const value = rest.trim();
    if (/^[|>][+-]?$/.test(value)) {
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() !== '' && !/^\s/.test(lines[j])) break;
        body.push(lines[j]);
      }
      entries[key] = { block: value, lines: body };
      i = j - 1;
    } else {
      entries[key] = { scalar: value };
    }
  }
  return entries;
}

/**
 * What a pointer needs from an AOForge SKILL.md: { name, description, argumentHint, manualOnly }.
 * `dirName` is the skill's directory, which is its name; a frontmatter name that differs is
 * refused rather than guessed between.
 */
function parseSkill(text, dirName) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) throw new Error(`${dirName}: SKILL.md has no frontmatter`);
  const entries = topLevelEntries(m[1]);
  const valueOf = (key) => {
    const e = entries[key];
    if (!e) return null;
    const where = `${dirName}: ${key}`;
    return e.block !== undefined ? decodeBlock(e.block, e.lines, where) : decodeScalar(e.scalar, where);
  };

  const name = valueOf('name');
  if (name !== null && name !== dirName) {
    throw new Error(`${dirName}: frontmatter name "${name}" differs from the directory name`);
  }
  const description = valueOf('description');
  if (!description || description.trim() === '') throw new Error(`${dirName}: no description`);
  const hint = valueOf('argument-hint');

  return {
    name: dirName,
    description,
    argumentHint: hint === null || hint === '' ? null : hint,
    manualOnly: valueOf('disable-model-invocation') === 'true',
  };
}

// ─── writing a pointer ────────────────────────────────────────────────────────────

/** `description:` as a literal block: `|` when the text ends in a newline, else `|-`. */
function descriptionLines(name, text) {
  const core = text.replace(/\n+$/, '');
  if (/^\s/.test(core)) {
    throw new Error(`${name}: a description that starts with whitespace needs an indentation indicator`);
  }
  const lines = core.split('\n').map((l) => (l === '' ? '' : `  ${l}`));
  return [`description: ${text.endsWith('\n') ? '|' : '|-'}`, ...lines];
}

/**
 * The forwarding SKILL.md for one AOForge skill.
 *
 * @param {{ name: string, description: string, argumentHint?: string|null, manualOnly?: boolean }} skill
 * @returns {string}
 */
function renderPointerSkill({ name, description, argumentHint = null, manualOnly = false }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name))) throw new Error(`not a skill name: ${name}`);
  const target = `${NAMES.slug}:${name}`;
  const command = `/${target}`;

  const fm = ['---', `name: ${name}`, ...descriptionLines(name, description)];
  if (argumentHint !== null && argumentHint !== '') fm.push(`argument-hint: ${JSON.stringify(argumentHint)}`);
  if (manualOnly) fm.push('disable-model-invocation: true');
  fm.push('allowed-tools:', '  - Skill', '---');

  const install =
    `run \`/plugin install ${NAMES.plugin}\` (marketplace \`${MARKETPLACE}\`), restart Claude Code, ` +
    `then disable this plugin with \`claude plugin disable ${LEGACY.plugin}\`. ` +
    `This pointer is removed in ${SHIM_REMOVAL}.`;

  const body = [`${LEGACY.product} is now ${NAMES.product}. This command moved to \`${command}\`.`, ''];
  if (manualOnly) {
    body.push(
      `\`${command}\` runs only when the user types it, so the Skill tool cannot start it: do not try. ` +
        `Tell the user to type \`${command} $ARGUMENTS\` to run it, and do nothing else.`,
      '',
      `If Claude Code does not know \`${command}\`, the ${NAMES.product} plugin is not installed. Tell the user: ${install}`,
    );
  } else {
    body.push(
      `If the ${NAMES.product} plugin is installed, invoke the Skill tool with skill \`${target}\` and pass ` +
        '`$ARGUMENTS` unchanged. Do nothing else.',
      '',
      `If it is not installed (\`${target}\` is not among your skills, or the Skill tool does not know it), ` +
        `tell the user: ${install}`,
    );
  }

  return `${[...fm, ...body].join('\n')}\n`;
}

// ─── comparing the two directories ────────────────────────────────────────────────

/** Subdirectory names of `dir`, sorted; [] when `dir` does not exist. */
function subdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** name -> the pointer text every AOForge skill under `sourceDir` should have. */
function expectedPointers(sourceDir) {
  const out = new Map();
  for (const name of subdirs(sourceDir)) {
    const file = path.join(sourceDir, name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    out.set(name, renderPointerSkill(parseSkill(fs.readFileSync(file, 'utf8'), name)));
  }
  return out;
}

/**
 * How the pointer skills under `pointerSkillsDir` differ from the AOForge skills under
 * `aoforgeSkillsDir`: { missing, extra, stale }, each a sorted list of skill names.
 */
function plan(aoforgeSkillsDir, pointerSkillsDir) {
  const expected = expectedPointers(aoforgeSkillsDir);
  const missing = [];
  const stale = [];
  for (const [name, text] of expected) {
    const file = path.join(pointerSkillsDir, name, 'SKILL.md');
    if (!fs.existsSync(file)) missing.push(name);
    else if (fs.readFileSync(file, 'utf8') !== text) stale.push(name);
  }
  const extra = subdirs(pointerSkillsDir).filter((name) => !expected.has(name));
  return { missing, extra, stale };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { mode: null, source: DEFAULT_SOURCE, dest: DEFAULT_DEST };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write' || a === '--check') {
      if (opts.mode) return { error: 'choose one of --write and --check' };
      opts.mode = a.slice(2);
    } else if (a === '--source' || a === '--dest') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) return { error: `${a} needs a directory` };
      opts[a.slice(2)] = path.resolve(v);
    } else {
      return { error: `unknown argument: ${a}` };
    }
  }
  if (!opts.mode) return { error: 'choose one of --write and --check' };
  return opts;
}

const shown = (p) => {
  const rel = path.relative(REPO_ROOT, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p;
};

/**
 * @param {string[]} [argv]
 * @param {{ stdout?: { write: Function }, stderr?: { write: Function } }} [io]
 * @returns {number} the exit code
 */
function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const opts = parseArgs(argv);
  if (opts.error) {
    stderr.write(`gen-pointer-skills: ${opts.error}\n${USAGE}`);
    return 2;
  }

  let expected;
  let diff;
  try {
    expected = expectedPointers(opts.source);
    diff = plan(opts.source, opts.dest);
  } catch (err) {
    stderr.write(`gen-pointer-skills: ${err.message}\n`);
    return 1;
  }

  if (opts.mode === 'check') {
    const lines = ['missing', 'extra', 'stale']
      .filter((k) => diff[k].length > 0)
      .map((k) => `  ${k}: ${diff[k].join(', ')}`);
    if (lines.length > 0) {
      stderr.write(
        `gen-pointer-skills: ${shown(opts.dest)} is out of step with ${shown(opts.source)}\n` +
          `${lines.join('\n')}\n` +
          'run: node scripts/gen-pointer-skills.cjs --write\n',
      );
      return 1;
    }
    stdout.write(`gen-pointer-skills: ${expected.size} pointer skills match ${shown(opts.source)}\n`);
    return 0;
  }

  fs.mkdirSync(opts.dest, { recursive: true });
  for (const name of [...diff.missing, ...diff.stale]) {
    fs.mkdirSync(path.join(opts.dest, name), { recursive: true });
    fs.writeFileSync(path.join(opts.dest, name, 'SKILL.md'), expected.get(name));
  }
  for (const name of diff.extra) fs.rmSync(path.join(opts.dest, name), { recursive: true, force: true });
  stdout.write(
    `gen-pointer-skills: ${expected.size} pointer skills in ${shown(opts.dest)} ` +
      `(${diff.missing.length} written, ${diff.stale.length} updated, ${diff.extra.length} removed)\n`,
  );
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { renderPointerSkill, parseSkill, plan, main };
