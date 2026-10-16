'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation;
// TRD 38-09, objective 38-doc-auto-correction). This is the CI gate: it walks the repo's own
// live text and fails when a stale or unknown /aoforge: command reference ships. (TRD 72-13 also
// read the pre-rename command forms for one release; TRD 78-02 removed that, so they are no
// longer command references. The rename guard, rename-guard.repo.test.cjs, still fails on any
// legacy name in the tree.)
//
// 1. The scan set (before EXEMPT) is non-empty (> 150 files) and includes README.md,
//    plugins/aoforge/aoforge/bin/lib/validate.cjs and plugins/aoforge/hooks/statusline.js.
//    [Task 2]
// 2. The main gate: zero findings across the scan set minus EXEMPT minus legacy workflows.
//    The failure message lists every finding and the EXEMPT table. [Task 2]
// 3. Every EXEMPT entry has a reason of >= 20 chars and matches >= 1 existing path. [Task 1]
// 4. ignore-start markers appear only in help.md — exactly one region, properly closed. [Task 1]
// 5. The help.md fenced rename table deep-equals DEPRECATION_MAP. [Task 1]
// 6. Sensitivity (a): route-intent.test.js and legacy-command-fixtures.cjs (intent-fixtures.cjs
//    until TRD 78-02: its only findings were pre-rename forms) each produce >= 1 finding
//    when scanned directly (bypassing EXEMPT) — proves the exemption is doing real work. [Task 1]
// 7. Sensitivity (b): the sample string
//    "/aoforge:health /aoforge:update /aoforge:nope /aoforge:status" ->
//    kinds [renamed, removed, unknown] (status is a live skill -> ok -> filtered). [Task 1;
//    TRD 78-02 dropped the leading legacy token, which is no longer a reference]
// 8. The legacy-workflow exemption is derived from frontmatter: insert-objective.md
//    (status: legacy) is exempt; add-objective.md (status: active) is scanned. [Task 1]
// 9. plugins/aoforge/aoforge/references/command-renames.json does not exist. [Task 1]
// 10. templates/claude-md.md and templates/global-claude-md.md produce zero findings. [Task 1]
//
// TRD 44-08 (objective 44-autonomy-hardening, AUT-03) — legacy agent-path read instructions.
// Agents ship inside the plugin and reach a typed subagent as its system prompt; global-upgrade
// moves the legacy ~/.claude/agents copies into a backup. 44-01 and 44-02 removed every
// "read ~/.claude/agents/<name>.md" spawn instruction; this gate keeps them removed. It is a
// separate scan (scanLegacyAgentPaths), never part of scanText, so migration 0007 never
// rewrites agent paths.
// 11. LEGACY gate: zero scanLegacyAgentPaths findings across effectiveScanSet() minus
//     LEGACY_AGENT_EXEMPT; the failure message lists `file:line token`.
// 12. Every LEGACY_AGENT_EXEMPT entry has a reason of >= 20 chars and matches >= 1 real path.
// 13. Sensitivity: the three historical instruction shapes (plain read, `@` reference,
//     "process in") -> 3 findings with 1-based lines; the USER-GUIDE `~/.claude/agents/df-*`
//     glob sentence (and the real USER-GUIDE.md) -> 0.
// 14. Scope: the LEGACY scan set IS effectiveScanSet() minus LEGACY_AGENT_EXEMPT, so
//     status: legacy workflows and the shared EXEMPT patterns (tests, __fixtures__/**) are
//     excluded exactly as for the command-reference gate.
//
// TRD 72-13 (objective 72-install-and-naming-cleanup, INST-01) added these for the legacy command
// forms; TRD 78-02 (objective 78) removed the resolver's reading of them, and reworked 15-18 to
// match. These tests spell no legacy name: samples come from the legacy-command fixture and paths
// are built from LEGACY.
// 15. Sensitivity (c), reworked by TRD 78-02: a legacy form is not a command reference. The legacy
//     samples (every legacy namespace and the dash form, with live, renamed, removed and unknown
//     names) yield zero findings; the current-namespace control yields [renamed, removed, unknown].
// 16. Sibling plugins (plugins/eden-ui-*, monorepo-standards, aosentry-mcp, social-media-generator,
//     minus EXEMPT): zero renamed/removed /aoforge: findings. Unknown names are ignored. The
//     sibling scan set is non-empty and covers each sibling.
// 17. (Removed by TRD 78-02, with the pointer release of the legacy plugin it named.)
// 18. The raw scan set holds no path under the current or the legacy planning directory, and the
//     "Not scanned by design" comment names the current planning directory beside the legacy one.
//
// Runtime model (binding, TRD 38-09): this test is read-only — it never writes to the repo.
// Repo root is path.resolve(__dirname, '..', '..', '..', '..', '..'); a mirror install (no
// README.md there) skips the whole file rather than failing on paths that can't exist.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { scanText, liveSkillNames, walkFiles, scanLegacyAgentPaths } = require('./doc-refs.cjs');
const { DEPRECATION_MAP } = require('./skill-route.cjs');
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { legacyCommandText } = require('./__fixtures__/legacy-command-fixtures.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

// ─── Scan set (must_haves truth 1) ─────────────────────────────────────────────────

const SCAN_INCLUDE = [
  'plugins/aoforge/agents/**',
  'plugins/aoforge/skills/**',
  'plugins/aoforge/aoforge/workflows/**',
  'plugins/aoforge/aoforge/references/**',
  'plugins/aoforge/aoforge/templates/**',
  'plugins/aoforge/aoforge/bin/**/*.cjs',
  'plugins/aoforge/hooks/**/*.js',
  'README.md',
  'CLAUDE.md',
  'docs/USER-GUIDE.md',
  'docs/MIGRATING-TO-AOFORGE.md', // TRD 72-17: a live guide, not a dated record
  'site/content/**',
  '.github/**',
  'assets/**/*.svg',
];

// Not scanned by design (outside SCAN_INCLUDE; test 18 enforces the planning part):
// CHANGELOG.md, .aoforge/** and the legacy planning directory it replaces (LEGACY.planningDir,
// the same archive under its pre-3.0.0 name), docs/ other than USER-GUIDE and MIGRATING-TO-AOFORGE (dated PROPOSAL/
// IMPLEMENTATION-PLAN/CODEX-PORT records) and site/public (gitignored build output). The sibling plugins
// under plugins/ are not in this gate either: their own /<name>: commands are namespaced by
// their own plugin. Test 16 scans them separately for stale AOForge command forms.

// ─── EXEMPT (must_haves truth 2-5) ─────────────────────────────────────────────────
// Every entry: a reason of >= 20 chars, and a pattern that matches >= 1 real path (test 3) —
// a dead exemption is a bug, so it fails the gate rather than sitting there silently.

const EXEMPT = [
  {
    pattern: '**/*.test.cjs',
    reason:
      'tests feed old command names as deliberate input fixtures (classifier.test.cjs, ' +
      'gh-pull.test.cjs and this file\'s own doc-refs.test.cjs suite)',
  },
  {
    pattern: '**/*.test.js',
    reason:
      'tests feed old command names as deliberate input: route-intent prefix exclusion ' +
      '(route-intent.test.js:209-210) and the statusline text assertions',
  },
  {
    pattern: 'plugins/aoforge/aoforge/bin/lib/__fixtures__/**',
    reason:
      'frozen fixtures — legacy-command-fixtures.cjs feeds renamed and removed /aoforge: commands ' +
      'as deliberate input, and intent-fixtures.cjs realCLAUDEMd is a faithful copy of an old CLAUDE.md',
  },
  {
    pattern: 'plugins/aoforge/aoforge/bin/lib/skill-route.cjs',
    reason:
      'declares DEPRECATION_MAP and REMOVED_COMMANDS themselves — the rename map, not a ' +
      'reference to it',
  },
  {
    pattern: 'plugins/aoforge/aoforge/bin/lib/doc-refs.cjs',
    reason:
      'declares the doc-refs:ignore-start/-end marker strings and the token rule this very gate ' +
      'depends on',
  },
  // TRD 78-02 removed TRD 72-13's `**/legacy-names.cjs` entry: with the legacy command forms no
  // longer read, that module holds nothing this gate reports.
];

// ─── LEGACY_AGENT_EXEMPT (TRD 44-08, tests 11-14) ──────────────────────────────────
// Applied ON TOP of EXEMPT for the legacy agent-path gate only. The shared EXEMPT already
// covers the upgrade fixtures (__fixtures__/**) and every test file, so this list only names
// shipped code that must spell the legacy location. Same sanity rules as EXEMPT (test 12).

const LEGACY_AGENT_EXEMPT = [
  {
    pattern: 'plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs',
    reason:
      'moves legacy ~/.claude/agents/df-* copies into a backup — it names the legacy location ' +
      'on purpose',
  },
];

// ─── shared plumbing ────────────────────────────────────────────────────────────────

/** Frontmatter `status:` value, or null when the file has no --- frontmatter block. */
function _frontmatterStatus(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^status:\s*(\S+)/m);
  return m ? m[1] : null;
}

/** Raw scan set: SCAN_INCLUDE only, no EXEMPT and no legacy-workflow filter applied. */
function rawScanSet() {
  return walkFiles(REPO_ROOT, { include: SCAN_INCLUDE });
}

/**
 * Effective scan set: SCAN_INCLUDE minus every EXEMPT pattern minus workflows whose
 * frontmatter is status: legacy (must_haves truth 6 — computed from frontmatter, not
 * hard-coded as a path in EXEMPT). `extraExclude` (TRD 44-08) adds a gate-specific
 * exemption list, matched by walkFiles' own exclude globs.
 */
function effectiveScanSet({ extraExclude = [] } = {}) {
  const files = walkFiles(REPO_ROOT, {
    include: SCAN_INCLUDE,
    exclude: [...EXEMPT.map((e) => e.pattern), ...extraExclude.map((e) => e.pattern)],
  });
  const WORKFLOWS_DIR = 'plugins/aoforge/aoforge/workflows/';
  return files.filter((rel) => {
    if (!rel.startsWith(WORKFLOWS_DIR)) return true;
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
    return _frontmatterStatus(text) !== 'legacy';
  });
}

function findAllFindings() {
  const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/aoforge/skills'));
  const findings = [];
  for (const rel of effectiveScanSet()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
    for (const r of scanText(text, { liveSkills })) {
      findings.push({ file: rel, line: r.line, token: r.token, kind: r.kind, replacement: r.replacement });
    }
  }
  return findings;
}

function formatFailureMessage(findings) {
  const findingLines = findings.map(
    (f) => `  ${f.file}:${f.line}  ${f.token} → ${f.replacement || f.kind}`,
  );
  const exemptLines = EXEMPT.map((e) => `  ${e.pattern} — ${e.reason}`);
  return [
    'stale command references (fix the text, or — only if it is a record, not a live doc — add a justified EXEMPT entry):',
    ...findingLines,
    '',
    'EXEMPT:',
    ...exemptLines,
  ].join('\n');
}

// ─── sibling plugins (TRD 72-13, test 16) ─────────────────────────────────────────
// The other plugins this marketplace ships. Their own `/<plugin>:<name>` commands are never
// matched (the resolver reads only the AOForge namespace); what must not ship there is a stale
// reference to an AOForge command.

const SIBLING_PLUGINS = [
  'plugins/eden-ui-*/**',
  'plugins/monorepo-standards/**',
  'plugins/aosentry-mcp/**',
  'plugins/social-media-generator/**',
];

/** The sibling plugins' files minus EXEMPT (their tests feed inputs, as ours do). */
function siblingScanSet() {
  return walkFiles(REPO_ROOT, { include: SIBLING_PLUGINS, exclude: EXEMPT.map((e) => e.pattern) });
}

/** Every finding in the sibling plugins except `unknown` (another plugin's command name). */
function findSiblingFindings() {
  const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/aoforge/skills'));
  const findings = [];
  for (const rel of siblingScanSet()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
    for (const r of scanText(text, { liveSkills })) {
      if (r.kind === 'unknown') continue;
      findings.push({ file: rel, line: r.line, token: r.token, kind: r.kind, replacement: r.replacement });
    }
  }
  return findings;
}

/** The legacy agent-path gate's scan set: the effective scan set minus LEGACY_AGENT_EXEMPT. */
function legacyAgentScanSet() {
  return effectiveScanSet({ extraExclude: LEGACY_AGENT_EXEMPT });
}

function findLegacyAgentFindings() {
  const findings = [];
  for (const rel of legacyAgentScanSet()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
    for (const r of scanLegacyAgentPaths(text)) {
      findings.push({ file: rel, line: r.line, token: r.token });
    }
  }
  return findings;
}

function formatLegacyFailureMessage(findings) {
  const findingLines = findings.map((f) => `  ${f.file}:${f.line}  ${f.token}`);
  const exemptLines = LEGACY_AGENT_EXEMPT.map((e) => `  ${e.pattern} — ${e.reason}`);
  return [
    'legacy agent-path read instructions (delete the instruction — a typed subagent already ' +
      'gets its definition as the system prompt, and the ~/.claude/agents copy was moved to a backup):',
    ...findingLines,
    '',
    'LEGACY_AGENT_EXEMPT (on top of EXEMPT):',
    ...exemptLines,
  ].join('\n');
}

/** Rows of a `| \`/aoforge:<old>\` | \`/aoforge:<new>\` ... |` table: {old: new}. */
function parseRenameTable(text) {
  const rowRe = /^\|\s*`\/aoforge:([a-z][a-z0-9-]*)`\s*\|\s*`\/aoforge:([a-z][a-z0-9 -]*)`/gm;
  const map = {};
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

// ─── tests ──────────────────────────────────────────────────────────────────────────

describe('doc-refs.repo.test.cjs', { skip: IS_AOFORGE_CHECKOUT ? false : 'not an aoforge-claude checkout' }, () => {
  describe('SCAN: raw scan set', () => {
    test('1: scan set is non-empty (> 150 files) and includes the named anchors', () => {
      const files = rawScanSet();
      assert.ok(files.length > 150, `expected > 150 files in the scan set, got ${files.length}`);
      assert.ok(files.includes('README.md'), 'scan set must include README.md');
      assert.ok(
        files.includes('plugins/aoforge/aoforge/bin/lib/validate.cjs'),
        'scan set must include plugins/aoforge/aoforge/bin/lib/validate.cjs',
      );
      assert.ok(
        files.includes('plugins/aoforge/hooks/statusline.js'),
        'scan set must include plugins/aoforge/hooks/statusline.js',
      );
    });
  });

  describe('GATE: the CI gate itself', () => {
    test('2: zero findings across the scan set minus EXEMPT minus legacy workflows', () => {
      const findings = findAllFindings();
      assert.deepStrictEqual(findings, [], formatFailureMessage(findings));
    });
  });

  describe('EXEMPT sanity', () => {
    test('3: every EXEMPT entry has a reason >= 20 chars and matches >= 1 real path', () => {
      for (const entry of EXEMPT) {
        assert.ok(
          entry.reason.length >= 20,
          `EXEMPT reason too short (${entry.reason.length} chars): ${entry.pattern}`,
        );
        const matches = walkFiles(REPO_ROOT, { include: [entry.pattern] });
        assert.ok(matches.length >= 1, `EXEMPT pattern matches no existing path: ${entry.pattern}`);
      }
    });
  });

  describe('IGNORE: ignore-region discipline', () => {
    const HELP_REL = 'plugins/aoforge/aoforge/workflows/help.md';

    test('4: ignore-start markers appear only in help.md — exactly one region, properly closed', () => {
      const hits = [];
      for (const rel of effectiveScanSet()) {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
        const startCount = (text.match(/doc-refs:ignore-start/g) || []).length;
        const endCount = (text.match(/doc-refs:ignore-end/g) || []).length;
        if (startCount > 0 || endCount > 0) hits.push({ rel, startCount, endCount });
      }
      assert.deepStrictEqual(
        hits.map((h) => h.rel),
        [HELP_REL],
        `ignore-region markers found outside help.md: ${JSON.stringify(hits)}`,
      );
      assert.strictEqual(hits[0].startCount, 1, 'help.md must contain exactly one ignore-start');
      assert.strictEqual(hits[0].endCount, 1, 'help.md must contain exactly one ignore-end');
      // "properly closed": scanText must not throw DocRefsError on help.md's own text.
      const helpText = fs.readFileSync(path.join(REPO_ROOT, HELP_REL), 'utf-8');
      assert.doesNotThrow(() => scanText(helpText));
    });

    test('5: help.md fenced rename table deep-equals DEPRECATION_MAP', () => {
      const text = fs.readFileSync(path.join(REPO_ROOT, HELP_REL), 'utf-8');
      const region = text.match(/doc-refs:ignore-start[\s\S]*?doc-refs:ignore-end/);
      assert.ok(region, 'help.md must contain a doc-refs:ignore-start/-end region');
      const table = parseRenameTable(region[0]);
      assert.deepStrictEqual(table, DEPRECATION_MAP);
    });
  });

  describe('SENSITIVITY', () => {
    test('6: (a) route-intent.test.js and legacy-command-fixtures.cjs each produce >= 1 finding scanned directly', () => {
      const files = [
        'plugins/aoforge/hooks/route-intent.test.js',
        'plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs',
      ];
      for (const rel of files) {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
        const results = scanText(text);
        assert.ok(
          results.length >= 1,
          `${rel} must produce >= 1 finding when scanned directly (proves EXEMPT is doing real work)`,
        );
      }
    });

    test('7: (b) one token of every kind in a hand-built sample string', () => {
      const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/aoforge/skills'));
      const sample = '/aoforge:health /aoforge:update /aoforge:nope /aoforge:status';
      const results = scanText(sample, { liveSkills });
      assert.deepStrictEqual(results.map((r) => r.kind), ['renamed', 'removed', 'unknown']);
    });
  });

  describe('LEGACY: frontmatter-derived workflow exemption', () => {
    test('8: insert-objective.md (legacy) is exempt; add-objective.md (active) is scanned', () => {
      const insertRel = 'plugins/aoforge/aoforge/workflows/insert-objective.md';
      const addRel = 'plugins/aoforge/aoforge/workflows/add-objective.md';
      const insertText = fs.readFileSync(path.join(REPO_ROOT, insertRel), 'utf-8');
      const addText = fs.readFileSync(path.join(REPO_ROOT, addRel), 'utf-8');
      assert.strictEqual(_frontmatterStatus(insertText), 'legacy');
      assert.strictEqual(_frontmatterStatus(addText), 'active');

      const scanned = effectiveScanSet();
      assert.ok(!scanned.includes(insertRel), 'status: legacy workflow must not be in the effective scan set');
      assert.ok(scanned.includes(addRel), 'status: active workflow must be in the effective scan set');
    });
  });

  describe('SINGLE SOURCE', () => {
    test('9: references/command-renames.json does not exist', () => {
      const p = path.join(REPO_ROOT, 'plugins/aoforge/aoforge/references/command-renames.json');
      assert.strictEqual(
        fs.existsSync(p),
        false,
        'command-renames.json must not exist — DEPRECATION_MAP is the only rename source (DOC-01)',
      );
    });
  });

  describe('MIGRATION TARGETS', () => {
    test('10: templates/claude-md.md and templates/global-claude-md.md produce zero findings', () => {
      const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/aoforge/skills'));
      for (const rel of [
        'plugins/aoforge/aoforge/templates/claude-md.md',
        'plugins/aoforge/aoforge/templates/global-claude-md.md',
      ]) {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
        const results = scanText(text, { liveSkills });
        assert.deepStrictEqual(results, [], `${rel} has stale references: ${JSON.stringify(results)}`);
      }
    });
  });

  describe('LEGACY: agent-path read instructions', () => {
    test('11: zero legacy agent-path findings across the effective scan set minus LEGACY_AGENT_EXEMPT', () => {
      const findings = findLegacyAgentFindings();
      assert.deepStrictEqual(findings, [], formatLegacyFailureMessage(findings));

      // The failure message lists `file:line token` for every finding.
      const message = formatLegacyFailureMessage([
        { file: 'plugins/aoforge/aoforge/workflows/example.md', line: 7, token: '~/.claude/agents/planner.md' },
      ]);
      assert.ok(
        message.includes('plugins/aoforge/aoforge/workflows/example.md:7  ~/.claude/agents/planner.md'),
        `failure message must list file:line token, got:\n${message}`,
      );
    });

    test('12: every LEGACY_AGENT_EXEMPT entry has a reason >= 20 chars and matches >= 1 real path', () => {
      assert.ok(LEGACY_AGENT_EXEMPT.length >= 1, 'LEGACY_AGENT_EXEMPT must not be empty');
      for (const entry of LEGACY_AGENT_EXEMPT) {
        assert.ok(
          entry.reason.length >= 20,
          `LEGACY_AGENT_EXEMPT reason too short (${entry.reason.length} chars): ${entry.pattern}`,
        );
        const matches = walkFiles(REPO_ROOT, { include: [entry.pattern] });
        assert.ok(matches.length >= 1, `LEGACY_AGENT_EXEMPT pattern matches no existing path: ${entry.pattern}`);
      }
    });

    test('13: sensitivity — fires on each historical instruction shape, not on the df-* glob', () => {
      const positives = [
        'First, read ~/.claude/agents/planner.md for your role',
        '- The agent definition to follow (reference `@~/.claude/agents/security-auditor.md`)',
        'You are a security auditor. Follow the agent definition and process in ~/.claude/agents/security-auditor.md',
      ];
      for (const line of positives) {
        assert.strictEqual(scanLegacyAgentPaths(line).length, 1, `must fire exactly once on: ${line}`);
      }

      // As one synthetic prompt: 1-based line numbers (scanText's convention), the `@` kept.
      const prompt = ['Task(', ...positives, ')'].join('\n');
      assert.deepStrictEqual(scanLegacyAgentPaths(prompt), [
        { line: 2, token: '~/.claude/agents/planner.md' },
        { line: 3, token: '@~/.claude/agents/security-auditor.md' },
        { line: 4, token: '~/.claude/agents/security-auditor.md' },
      ]);

      // Negative: a glob naming the legacy location, not an instruction to read <name>.md.
      const guideSentence =
        'It moves legacy `~/.claude/skills/df-*`, `~/.claude/agents/df-*` and ' +
        '`~/.claude/aoforge/VERSION` into a backup (it moves them, never deletes them).';
      assert.deepStrictEqual(scanLegacyAgentPaths(guideSentence), []);

      // ...and the real USER-GUIDE.md (in the scan set) carries that glob and stays clean.
      const guide = fs.readFileSync(path.join(REPO_ROOT, 'docs/USER-GUIDE.md'), 'utf-8');
      assert.ok(guide.includes('`~/.claude/agents/df-*`'), 'USER-GUIDE.md should still name the df-* glob');
      assert.deepStrictEqual(scanLegacyAgentPaths(guide), []);
    });

    test('14: scope — the LEGACY scan set is effectiveScanSet() minus LEGACY_AGENT_EXEMPT', () => {
      const effective = effectiveScanSet();
      const legacyExempt = new Set(
        LEGACY_AGENT_EXEMPT.flatMap((e) => walkFiles(REPO_ROOT, { include: [e.pattern] })),
      );
      const scanned = legacyAgentScanSet();
      assert.deepStrictEqual(
        scanned,
        effective.filter((rel) => !legacyExempt.has(rel)),
        'LEGACY scan set must be exactly effectiveScanSet() minus LEGACY_AGENT_EXEMPT',
      );

      // Shared exclusions carried over unchanged from the command-reference gate.
      const raw = rawScanSet();
      for (const rel of [
        'plugins/aoforge/aoforge/workflows/insert-objective.md', // status: legacy workflow
        'plugins/aoforge/aoforge/bin/lib/__fixtures__/upgrade-fixtures.cjs', // __fixtures__/**
        'plugins/aoforge/aoforge/bin/lib/upgrade.test.cjs', // **/*.test.cjs
        'plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs', // LEGACY_AGENT_EXEMPT
      ]) {
        assert.ok(raw.includes(rel), `${rel} must be in the raw scan set (else this check is vacuous)`);
        assert.ok(!scanned.includes(rel), `${rel} must be excluded from the LEGACY scan set`);
      }
      // ...while the files 44-01/44-02 cleaned stay scanned.
      for (const rel of [
        'plugins/aoforge/aoforge/workflows/execute-objective.md',
        'plugins/aoforge/aoforge/workflows/plan-objective.md',
        'plugins/aoforge/aoforge/workflows/security-audit.md',
        'plugins/aoforge/skills/research-objective/SKILL.md',
      ]) {
        assert.ok(scanned.includes(rel), `${rel} must be in the LEGACY scan set`);
      }
    });
  });

  describe('LEGACY COMMAND FORMS (TRD 72-13, INST-01)', () => {
    const T = legacyCommandText();

    test('15: (c) a legacy form is not a command reference: zero findings (TRD 78-02)', () => {
      const liveSkills = liveSkillNames(path.join(REPO_ROOT, 'plugins/aoforge/skills'));
      for (const text of [T.legacyLine, ...T.legacyForms]) {
        assert.deepStrictEqual(scanText(text, { liveSkills }), [], `no finding: ${text}`);
      }
      // Not vacuous: the same kinds of name under the current namespace are still findings.
      const control = scanText(T.currentLine, { liveSkills });
      assert.deepStrictEqual(control.map((r) => r.kind), [...T.currentKinds]);
      assert.deepStrictEqual(control.map((r) => r.replacement), [`${NAMES.commandNs}status check`, null, null]);
    });

    test('16: the sibling plugins carry no stale AOForge command reference', () => {
      const files = siblingScanSet();
      for (const glob of SIBLING_PLUGINS) {
        const prefix = glob.replace(/\*\*$/, '').replace(/\*\/$/, '');
        assert.ok(
          files.some((rel) => rel.startsWith(prefix)),
          `the sibling scan set must cover ${glob} (else this test is vacuous)`,
        );
      }
      const findings = findSiblingFindings();
      assert.deepStrictEqual(
        findings,
        [],
        'stale AOForge command references in a sibling plugin (rewrite each to its current ' +
          `${NAMES.commandNs}<name> form, or drop a removed command):\n` +
          findings.map((f) => `  ${f.file}:${f.line}  ${f.token} → ${f.replacement || f.kind}`).join('\n'),
      );
    });

    test('18: the raw scan set stays out of both planning directories', () => {
      const banned = [`${NAMES.planningDir}/`, `${LEGACY.planningDir}/`];
      const raw = rawScanSet();
      for (const prefix of banned) {
        const hits = raw.filter((rel) => rel.startsWith(prefix));
        assert.deepStrictEqual(hits, [], `the scan set must not include ${prefix}`);
      }
      // Not vacuous: a planning directory exists in this checkout.
      const planningFiles = walkFiles(REPO_ROOT, {
        include: [`${NAMES.planningDir}/**`, `${LEGACY.planningDir}/**`],
      });
      assert.ok(planningFiles.length >= 1, 'expected a planning directory in this checkout');

      // The "Not scanned by design" comment names the current planning directory beside the legacy one.
      const src = fs.readFileSync(__filename, 'utf-8');
      const start = src.indexOf('// Not scanned by design');
      assert.ok(start >= 0, 'the "Not scanned by design" comment must exist');
      const comment = src.slice(start).split('\n').filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith('//'))).join('\n');
      assert.ok(comment.includes(`${NAMES.planningDir}/**`), `the comment must name ${NAMES.planningDir}/**:\n${comment}`);
      assert.ok(comment.includes('LEGACY.planningDir'), `the comment must name the legacy planning directory:\n${comment}`);
    });
  });
});
