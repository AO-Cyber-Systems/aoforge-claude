'use strict';

// flag-spec.repo.test.cjs — TRD 68-05 task 2 (TOOL-01).
//
// FLAG_SPEC (flag-spec.cjs) is what makes every writing df-tools command reject an unknown flag. It stays honest only if
// three things hold, and none of them is a property of any one command, so each is checked here, against the repository:
//
//   * it is COMPLETE: every command help.cjs marks `mutates: true` has an entry, and nothing else has one, so a new writing
//     command added without a spec entry fails CI instead of silently ignoring flags;
//   * it is PROBED: PROBES (the spawn test's argv table) names every entry, and every rule that switches the check off
//     (`anyFlags`, `ownParser`, `tailFrom`) states why;
//   * it BREAKS NOTHING DOCUMENTED: every `df-tools <command> ...` invocation in the plugin's skills, agents, hooks,
//     workflows, references and templates, in docs/USER-GUIDE.md and in CLAUDE.md passes the same checkFlags the dispatcher
//     runs, so the guard cannot start rejecting a call the documentation tells people to make.
//
// Test list:
//  4. The set of COMMANDS keys with `mutates: true` equals the set of FLAG_SPEC keys (both directions, offenders listed).
//  5. PROBES keys equal the spec's labels (each subcommand, or the command for a flags-only entry).
//  6. Every rule with `anyFlags`, `ownParser` or `tailFrom` has a non-empty `reason` string.
//  7. Documented invocations (scan set below): every extracted invocation of a writing command passes checkFlags. A failure
//     reports `file:line`, the flag and the entry, minus EXEMPT.
//  8. Extraction unit check on a hand-written snippet: exactly the expected argv arrays.
//  9. Every EXEMPT entry still suppresses a real finding (no stale exemptions), and carries a reason.
//
// Tests 7 and 9 read the repository's own text, so they are guarded by IS_DEVFLOW_CHECKOUT like
// dispatch-completeness.test.cjs (a mirror install has no README.md at the repo root). Tests 4-6 and 8 always run.
//
// What is scanned, and what is not. The scan set is the documentation a reader or an agent follows. Test files, fixtures
// and `node_modules` are not documentation: a test names a bad flag on purpose. `.planning/`, CHANGELOG.md and `site/` are
// history and generated text, which name old flags deliberately, and are left out on purpose.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { COMMANDS } = require('./help.cjs');
const { FLAG_SPEC } = require('./flag-spec.cjs');
const { checkFlags } = require('./flag-guard.cjs');
const { PROBES, specEntries } = require('./__fixtures__/flag-guard-fixtures.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_DEVFLOW_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));

// ─── The scan set ────────────────────────────────────────────────────────────────────

const SCAN_DIRS = [
  'plugins/devflow/skills',
  'plugins/devflow/agents',
  'plugins/devflow/hooks',
  'plugins/devflow/devflow/workflows',
  'plugins/devflow/devflow/references',
  'plugins/devflow/devflow/templates',
];
const SCAN_FILES = ['docs/USER-GUIDE.md', 'CLAUDE.md'];
const SCAN_EXTENSIONS = new Set(['.md', '.js', '.json', '.yml']);
const SKIP_DIRS = new Set(['node_modules', '__fixtures__', '.git']);
const isTestFile = (name) => /\.test\.[a-z]+$/.test(name) || /\.audit\.test\.[a-z]+$/.test(name);

/** Every scanned file as a repo-relative, `/`-separated path (sorted). */
function scanFiles() {
  const out = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(REPO_ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(child);
      } else if (SCAN_EXTENSIONS.has(path.extname(entry.name)) && !isTestFile(entry.name)) {
        out.push(child);
      }
    }
  };
  for (const dir of SCAN_DIRS) walk(dir);
  for (const file of SCAN_FILES) out.push(file);
  return out.sort();
}

// ─── The extractor ───────────────────────────────────────────────────────────────────
//
// One invocation per `df-tools` / `df-tools.cjs` mention that is followed by a command word. It ends at the first of: a
// backtick, `|`, `;`, `&&`, `)` (the close of a `$(...)`), a redirect (`>`, `2>`), a heredoc (`<<`) or the end of the line.
// A line ending in a backslash continues onto the next line (the continuation belongs to the invocation, not to a new one).
// Quoted strings, `<placeholders>`, `{placeholders}` and `${VARS}` are kept whole as one token, so what is inside them is
// never read as a flag. Leading `[`/trailing `]` (optional-argument syntax) are stripped, so `[--no-flush]` is checked.

const MENTION = /\bdf-tools(?:\.cjs)?["']?[ \t]+/g;
const FLAG_NAME = /^--[A-Za-z][A-Za-z0-9-]*(=.*)?$/;

/** Index just past the `close` that matches the `open` at `from`, honouring nesting; -1 when it never closes. */
function skipBalanced(text, from, open, close) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** The tokens of one invocation's tail (see the block comment above for where it ends). */
function tokenize(rest) {
  const tokens = [];
  let i = 0;
  while (i < rest.length) {
    const c = rest[i];
    if (c === ' ' || c === '\t') { i += 1; continue; }
    if (c === '`' || c === '|' || c === ';' || c === ')' || c === '>') break;
    if (c === '&' && rest[i + 1] === '&') break;
    if (c === '<' && rest[i + 1] === '<') break;
    if (/\d/.test(c) && rest[i + 1] === '>') break;

    let token = '';
    let ended = false;
    while (i < rest.length && !ended) {
      const ch = rest[i];
      if (ch === ' ' || ch === '\t') break;
      if (ch === '`' || ch === '|' || ch === ';' || ch === ')' || ch === '>') { ended = true; break; }
      if (ch === '&' && rest[i + 1] === '&') { ended = true; break; }
      if (ch === '"' || ch === "'") {
        const close = rest.indexOf(ch, i + 1);
        const stop = close === -1 ? rest.length : close + 1;
        token += rest.slice(i + 1, close === -1 ? rest.length : close);
        i = stop;
        continue;
      }
      if (ch === '<' && /[A-Za-z$]/.test(rest[i + 1] || '')) {
        const stop = skipBalanced(rest, i, '<', '>');
        if (stop === -1) { ended = true; break; }
        token += rest.slice(i, stop);
        i = stop;
        continue;
      }
      if (ch === '{' || (ch === '$' && (rest[i + 1] === '{' || rest[i + 1] === '('))) {
        const dollar = ch === '$';
        const open = dollar ? rest[i + 1] : '{';
        const close = open === '(' ? ')' : '}';
        const stop = skipBalanced(rest, dollar ? i + 1 : i, open, close);
        if (stop === -1) { ended = true; break; }
        token += rest.slice(i, stop);
        i = stop;
        continue;
      }
      token += ch;
      i += 1;
    }
    if (token !== '') tokens.push(token);
    if (ended) break;
  }
  return tokens;
}

/** Normalise one token: strip optional-argument brackets and a sentence's trailing punctuation off a flag. */
function normaliseToken(token) {
  let t = token.replace(/^\[+/, '').replace(/\]+$/, '');
  if (t.startsWith('--') && t !== '--') {
    const trimmed = t.replace(/[,.:!?]+$/, '');
    if (!trimmed.includes('=') && FLAG_NAME.test(trimmed)) t = trimmed;
  }
  return t;
}

/** The argv a mention stands for: global `--raw` / `--cwd <x>` before the command are dropped; not-a-flag `--...` too. */
function toArgv(tokens) {
  const argv = [];
  for (const raw of tokens) {
    const t = normaliseToken(raw);
    if (t === '') continue;
    // `--<flag>` / `--$VAR`: a placeholder standing where a flag name goes, not a flag.
    if (t.startsWith('--') && t !== '--' && !FLAG_NAME.test(t)) continue;
    argv.push(t);
  }
  while (argv.length > 0 && (argv[0] === '--raw' || argv[0].startsWith('--cwd'))) {
    if (argv[0] === '--cwd') argv.splice(0, 2);
    else argv.splice(0, 1);
  }
  return argv;
}

/**
 * extractInvocations(text) -> [{ line, argv, source }]
 * `line` is 1-based, `source` is the physical line the mention is on. An invocation needs a command word first.
 */
function extractInvocations(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let joined = lines[i];
    for (let j = i; /\\\s*$/.test(lines[j]) && j + 1 < lines.length; j++) {
      joined = `${joined.replace(/\\\s*$/, ' ')}${lines[j + 1]}`;
    }
    const ownLength = lines[i].length;
    MENTION.lastIndex = 0;
    let match;
    while ((match = MENTION.exec(joined)) !== null) {
      if (match.index >= ownLength) break;
      const argv = toArgv(tokenize(joined.slice(match.index + match[0].length)));
      if (argv.length === 0 || !/^[a-z][a-z0-9-]*$/.test(argv[0])) continue;
      out.push({ line: i + 1, argv, source: lines[i] });
    }
  }
  return out;
}

// ─── Findings and exemptions ─────────────────────────────────────────────────────────

/**
 * A line the scan reports that is not a call to make: `file` is repo-relative, `contains` a substring of the physical line.
 * Every entry says why. Test 9 fails when an entry no longer suppresses a finding, so a fixed line takes its entry with it.
 */
const EXEMPT = [];

/** Every documented invocation `spec` would reject, as { file, line, source, argv, flag, label, accepted }. */
function scanFindings(spec = FLAG_SPEC) {
  const findings = [];
  for (const file of scanFiles()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    for (const inv of extractInvocations(text)) {
      const verdict = checkFlags(inv.argv, spec);
      if (verdict) findings.push({ file, line: inv.line, source: inv.source, argv: inv.argv, ...verdict });
    }
  }
  return findings;
}

// The three structural gates as pure functions, so each can be shown to fail on a broken input (the sensitivity controls).

/** Writing commands without an entry, and entries for commands the dispatcher never guards. */
function completenessGaps(commands, spec) {
  const writing = Object.keys(commands).filter((name) => commands[name].mutates).sort();
  const specced = Object.keys(spec).sort();
  return { missing: writing.filter((n) => !specced.includes(n)), extra: specced.filter((n) => !writing.includes(n)) };
}

/** Labels of the rules that switch the check off without saying why. */
function rulesWithoutReason(spec) {
  return specEntries(spec)
    .filter((e) => e.rule.anyFlags || e.rule.ownParser || e.rule.tailFrom !== undefined)
    .filter((e) => typeof e.rule.reason !== 'string' || e.rule.reason.trim() === '')
    .map((e) => e.label);
}

/** The exemptions that have no reason or no longer suppress a finding. */
function exemptionProblems(exempt, findings) {
  const problems = [];
  for (const e of exempt) {
    if (typeof e.reason !== 'string' || e.reason.trim().length < 10) problems.push(`${e.file} "${e.contains}": needs a reason`);
    else if (!findings.some((f) => f.file === e.file && f.source.includes(e.contains))) {
      problems.push(`${e.file} "${e.contains}": no longer matches a finding (fixed, or the text changed): remove the entry`);
    }
  }
  return problems;
}

const isExempt = (finding) => EXEMPT.some((e) => e.file === finding.file && finding.source.includes(e.contains));
const describeFinding = (f) => `${f.file}:${f.line}  ${f.flag} is not accepted by \`${f.label}\` (accepted: ${f.accepted.join(', ') || 'none'})\n      ${f.source.trim().slice(0, 200)}`;

// ─── Tests ───────────────────────────────────────────────────────────────────────────

describe('FLAG_SPEC is complete, probed and in step with the documented invocations (TOOL-01)', () => {
  test('4. FLAG_SPEC keys are exactly the commands help.cjs marks mutates: true', () => {
    const { missing, extra } = completenessGaps(COMMANDS, FLAG_SPEC);
    assert.deepEqual(missing, [], `writing commands without a FLAG_SPEC entry (add one to flag-spec.cjs): ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `FLAG_SPEC entries for commands help.cjs does not mark mutates: true (the dispatcher never runs them): ${extra.join(', ')}`);
  });

  test('5. PROBES has a key for every spec label and no other', () => {
    const labels = specEntries(FLAG_SPEC).map((e) => e.label).sort();
    const probes = Object.keys(PROBES).sort();
    assert.deepEqual(labels.filter((l) => !probes.includes(l)), [], 'spec entries with no PROBES argv (add one to flag-guard-fixtures.cjs)');
    assert.deepEqual(probes.filter((p) => !labels.includes(p)), [], 'PROBES keys with no spec entry');
  });

  test('6. every anyFlags, ownParser and tailFrom rule states its reason', () => {
    const offenders = rulesWithoutReason(FLAG_SPEC);
    assert.deepEqual(offenders, [], `rules that switch the check off without a reason: ${offenders.join(', ')}`);
  });

  describe('sensitivity: each gate fails on a broken input', () => {
    test('4. a writing command with no entry, and an entry for a read-only command, are both reported', () => {
      const commands = { writer: { mutates: true }, reader: {}, covered: { mutates: true } };
      assert.deepEqual(completenessGaps(commands, { covered: {}, reader: {} }), { missing: ['writer'], extra: ['reader'] });
    });

    test('6. an ownParser, anyFlags or tailFrom rule with a blank or missing reason is reported', () => {
      const spec = {
        a: { ownParser: true, reason: '  ' },
        b: { subcommands: { c: { tailFrom: 2 }, d: { anyFlags: true, reason: 'field names' }, e: { values: ['--x'] } } },
      };
      assert.deepEqual(rulesWithoutReason(spec), ['a', 'b c']);
    });

    test('9. an exemption with no reason, or one that matches no finding, is reported', () => {
      const findings = [{ file: 'a.md', source: 'run df-tools foo --bar now' }];
      assert.deepEqual(exemptionProblems([{ file: 'a.md', contains: '--bar', reason: 'prose, not an invocation' }], findings), []);
      assert.equal(exemptionProblems([{ file: 'a.md', contains: '--bar', reason: '' }], findings).length, 1);
      assert.equal(exemptionProblems([{ file: 'a.md', contains: '--gone', reason: 'prose, not an invocation' }], findings).length, 1);
      assert.equal(exemptionProblems([{ file: 'b.md', contains: '--bar', reason: 'prose, not an invocation' }], findings).length, 1);
    });
  });

  describe('8. the extractor', () => {
    const snippet = [
      'Run `node ~/.claude/devflow/bin/df-tools.cjs state add-blocker --text "Waiting on API"` first.',
      'node ~/.claude/devflow/bin/df-tools.cjs summary post 68-05 --from <draft path> --no-flush | tee out.log',
      'RESULT=$(node "$HOME/.claude/devflow/bin/df-tools.cjs" gh pr start 68 --name feat/x 2>/dev/null)',
      'node ~/.claude/devflow/bin/df-tools.cjs --cwd {CHECKOUT} exec-context check --repo {REPO_ROOT} [--base <ref>] --raw',
      'The `df-tools plan put-trd <obj> <file> --from ${DRAFT}` form, and `df-tools commit` with no flags.',
    ].join('\n');

    test('finds exactly the five invocations of the snippet, with their argv', () => {
      const found = extractInvocations(snippet);
      assert.deepEqual(found.map((f) => [f.line, f.argv]), [
        [1, ['state', 'add-blocker', '--text', 'Waiting on API']],
        [2, ['summary', 'post', '68-05', '--from', '<draft path>', '--no-flush']],
        [3, ['gh', 'pr', 'start', '68', '--name', 'feat/x']],
        [4, ['exec-context', 'check', '--repo', '{REPO_ROOT}', '--base', '<ref>', '--raw']],
        [5, ['plan', 'put-trd', '<obj>', '<file>', '--from', '${DRAFT}']],
        [5, ['commit']],
      ]);
    });

    test('a backslash continuation belongs to the invocation, and is not read twice', () => {
      const text = 'df-tools dup-detect log "$OBJ" \\\n  --outcome proceed \\\n  --note x\nnext line\n';
      assert.deepEqual(extractInvocations(text).map((f) => [f.line, f.argv]), [
        [1, ['dup-detect', 'log', '$OBJ', '--outcome', 'proceed', '--note', 'x']],
      ]);
    });

    test('prose is not an invocation: no command word, a flag placeholder, a trailing comma', () => {
      const text = 'See df-tools --help, or `df-tools commit --amend,` and df-tools state patch --<field> v.\n';
      assert.deepEqual(extractInvocations(text).map((f) => f.argv), [
        ['commit', '--amend'],
        ['state', 'patch', 'v.'],
      ]);
    });

    test('a guarded command is judged by checkFlags exactly as the dispatcher judges it', () => {
      const [ok] = extractInvocations('`df-tools milestone complete v1.0 --dry-run`');
      const [bad] = extractInvocations('`df-tools milestone complete v1.0 --dry-runn`');
      assert.equal(checkFlags(ok.argv, FLAG_SPEC), null);
      assert.equal(checkFlags(bad.argv, FLAG_SPEC).flag, '--dry-runn');
    });
  });

  describe('documented invocations', { skip: !IS_DEVFLOW_CHECKOUT && 'not a DevFlow checkout (no README.md at the repo root)' }, () => {
    test('the scan set is the documentation, and it is not empty', () => {
      const files = scanFiles();
      assert.ok(files.length > 100, `only ${files.length} files scanned`);
      for (const expected of ['CLAUDE.md', 'docs/USER-GUIDE.md', 'plugins/devflow/devflow/workflows/execute-objective.md', 'plugins/devflow/agents/executor.md']) {
        assert.ok(files.includes(expected), `${expected} is not in the scan set`);
      }
      assert.ok(files.some((f) => f.startsWith('plugins/devflow/hooks/') && f.endsWith('.js')), 'no hook source scanned');
      assert.ok(!files.some((f) => f.startsWith('.planning/') || f === 'CHANGELOG.md' || f.startsWith('site/')), 'history and generated text must stay out of the scan');
    });

    test('7. every documented invocation of a writing command uses only flags the spec accepts', () => {
      const findings = scanFindings().filter((f) => !isExempt(f));
      assert.deepEqual(
        findings.map(describeFinding),
        [],
        `\n${findings.length} documented invocation(s) the dispatcher would now reject. If the code reads the flag, add it to its FLAG_SPEC entry; if no code reads it, correct the doc line; if the line is prose and not a call to make, add it to EXEMPT with the reason.\n`,
      );
    });

    test('7. sensitivity: a spec that lacks a flag the docs use is reported with file:line', () => {
      // The spec is deeply frozen; a structured clone is a plain copy to break. `exec-context check --base` is documented in
      // the executor agent, the execute-objective and quick workflows and the user guide.
      const broken = structuredClone(FLAG_SPEC);
      broken['exec-context'].subcommands.check.values = broken['exec-context'].subcommands.check.values.filter((f) => f !== '--base');
      const findings = scanFindings(broken).filter((f) => f.label === 'exec-context check' && f.flag === '--base');
      assert.ok(findings.length >= 3, `expected the documented --base calls to be reported, got ${findings.length}`);
      assert.ok(findings.every((f) => Number.isInteger(f.line) && f.line > 0 && f.file.length > 0));
      assert.ok(findings.some((f) => f.file === 'plugins/devflow/agents/executor.md'), 'the executor agent documents --base');
      assert.deepEqual(scanFindings(FLAG_SPEC).filter((f) => f.label === 'exec-context check'), [], 'the real spec accepts them');
    });

    test('9. every EXEMPT entry has a reason and still suppresses a finding', () => {
      assert.deepEqual(exemptionProblems(EXEMPT, scanFindings()), []);
    });
  });
});
