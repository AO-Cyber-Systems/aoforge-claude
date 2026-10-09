'use strict';

/**
 * CI guard for deprecated aof-tools subcommands in live prose (TRD 46-10).
 *
 * skill-route.DF_TOOLS_DEPRECATIONS maps an old aof-tools argv to its replacement
 * (`gh sync-objectives` -> `gh sync --all`). The alias still runs, but no live skill, agent,
 * workflow, template or reference may tell a reader to use the old form: a line that names it must
 * say it is deprecated. This is the aof-tools-argv counterpart of doc-refs.repo.test.cjs, which
 * covers slash-command names from DEPRECATION_MAP.
 *
 * 10. every line naming an old form also says "deprecated"
 * 10b. the scan set is real (non-empty, includes the files that once drove the old form)
 * 10c. sensitivity: the matcher fires on a bare instruction and passes a deprecation note
 * 11. every replacement is a live subcommand in the help table
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DF_TOOLS_DEPRECATIONS } = require('./skill-route.cjs');
const { COMMANDS } = require('./help.cjs');

const AOFORGE = path.resolve(__dirname, '..', '..'); // plugins/aoforge/aoforge
const PLUGIN = path.resolve(AOFORGE, '..'); // plugins/aoforge

// ─── Scan set ────────────────────────────────────────────────────────────────

function markdownIn(dir, recursive) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...markdownIn(full, true));
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** A workflow whose YAML frontmatter says `status: legacy` is superseded prose; it is not scanned. */
function isLegacy(text) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  return fm !== null && /^status:[ \t]*legacy[ \t]*$/m.test(fm[1]);
}

function scanSet() {
  const files = [
    ...markdownIn(path.join(PLUGIN, 'skills'), true),
    ...markdownIn(path.join(PLUGIN, 'agents'), false),
    ...markdownIn(path.join(AOFORGE, 'workflows'), false),
    ...markdownIn(path.join(AOFORGE, 'templates'), true),
    ...markdownIn(path.join(AOFORGE, 'references'), false),
  ];
  return files.filter((f) => !(f.startsWith(path.join(AOFORGE, 'workflows') + path.sep) && isLegacy(fs.readFileSync(f, 'utf-8'))));
}

/** Lines (1-based) that name `oldForm` without saying "deprecated" (case-insensitive). */
function undeprecatedLines(text, oldForm) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes(oldForm) && !/deprecated/i.test(line)) hits.push({ line: i + 1, text: line.trim() });
  });
  return hits;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DF_TOOLS_DEPRECATIONS in live prose', () => {
  it('10. every line that names a deprecated aof-tools form also says it is deprecated', () => {
    const findings = [];
    for (const oldForm of Object.keys(DF_TOOLS_DEPRECATIONS)) {
      for (const file of scanSet()) {
        for (const hit of undeprecatedLines(fs.readFileSync(file, 'utf-8'), oldForm)) {
          findings.push(
            `${path.relative(PLUGIN, file)}:${hit.line}: "${oldForm}" is deprecated; use "${DF_TOOLS_DEPRECATIONS[oldForm]}" (${hit.text})`,
          );
        }
      }
    }
    assert.deepEqual(findings, [], `live prose still instructs a deprecated form:\n${findings.join('\n')}`);
  });

  it('10b. the scan set covers skills, agents, workflows, templates and references', () => {
    const rel = scanSet().map((f) => path.relative(PLUGIN, f));
    assert.ok(rel.length > 100, `scan set too small: ${rel.length} files`);
    for (const anchor of [
      path.join('skills', 'gh-sync', 'SKILL.md'),
      path.join('agents', 'verifier.md'),
      path.join('aoforge', 'workflows', 'new-project.md'),
      path.join('aoforge', 'workflows', 'execute-objective.md'),
      path.join('aoforge', 'templates', 'objective.md'),
    ]) {
      assert.ok(rel.includes(anchor), `scan set is missing ${anchor}`);
    }
  });

  it('10c. the matcher fires on a bare instruction and accepts a deprecation note', () => {
    const old = 'gh sync-objectives';
    const bare = 'Run `node aof-tools.cjs gh sync-objectives` after roadmap creation.';
    const noted = '`gh sync-objectives` is a deprecated alias of `gh sync --all`.';
    const capitalised = 'Note: gh sync-objectives (Deprecated) still works.';
    assert.equal(undeprecatedLines(bare, old).length, 1);
    assert.equal(undeprecatedLines(noted, old).length, 0);
    assert.equal(undeprecatedLines(capitalised, old).length, 0);
    assert.equal(undeprecatedLines('nothing to see', old).length, 0);
    assert.equal(isLegacy('---\nstatus: legacy\n---\nbody'), true);
    assert.equal(isLegacy('---\nstatus: active\n---\nbody'), false);
  });

  it('11. every replacement names a live subcommand in the help table', () => {
    const entries = Object.entries(DF_TOOLS_DEPRECATIONS);
    assert.ok(entries.length > 0, 'DF_TOOLS_DEPRECATIONS is empty');
    for (const [oldForm, replacement] of entries) {
      const [command, ...rest] = replacement.split(/\s+/);
      const entry = COMMANDS[command];
      assert.ok(entry, `help table has no "${command}" command (replacement for "${oldForm}")`);
      for (const token of rest) {
        assert.ok(
          entry.usage.includes(token),
          `help usage for "${command}" does not mention "${token}" (replacement for "${oldForm}"): ${entry.usage}`,
        );
      }
    }
  });
});
