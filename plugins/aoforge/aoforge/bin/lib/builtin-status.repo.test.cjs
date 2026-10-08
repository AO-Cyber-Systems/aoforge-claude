'use strict';

// builtin-status.repo.test.cjs — TRD 63-06 (BLTN-06), Objective 63.
//
// Holds docs/built-in-integration-status.md to the tree and to its pinned built-in lists, so a new
// built-in, a dropped one, a new hook registration or a stale citation fails CI until the
// inventory is updated.
//
// What is checked (test numbers match the TRD):
//  1. The document exists, carries Last reviewed / Next review / Claude Code lines and its sections.
//  2. Every REQUIRED_TOOLS name has exactly one `## Tools` row, and every row names one.
//  3. Every REQUIRED_EVENTS name has exactly one `## Hook events` row, and every row names one.
//  4. Every Status cell (all three tables) is adopted | partial | not adopted | candidate | n/a.
//  5. Every adopted or partial row cites a repo path that exists; for Tools rows, a cited file
//     names the tool (or its legacy alias) as a word.
//  6. Tree to document: every built-in a skill declares in `allowed-tools` or an agent in `tools:`
//     (legacy names mapped by ALIASES, `mcp__*` ignored) has an adopted or partial row.
//  7. Every event registered in hooks.json is adopted, and every adopted event row is registered.
//  8. Every builtin-audit BUILTINS name is adopted or partial.
//  9. Every candidate row has Notes, and `## Candidates` names it.
// 10. Sensitivity: each check run over a synthetic snippet produces the matching error.
//
// There is deliberately NO clock check. An unrelated PR must not fail because a quarter passed;
// the document's Last reviewed / Next review dates and its Review procedure carry the cadence.
// The test never touches the network.
//
// How to review (the document's `## Review procedure` has the full steps): fetch the Claude Code
// tools and hooks references, diff the names against REQUIRED_TOOLS / REQUIRED_EVENTS below, update
// the document rows and the pinned lists together, then re-run this file.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const audit = require('./builtin-audit.cjs');
const { escapeRegExp } = require('./text-escape.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const IS_AOFORGE_CHECKOUT = fs.existsSync(path.join(REPO_ROOT, 'README.md'));
const DOC_REL = 'docs/built-in-integration-status.md';

// ---- pinned lists --------------------------------------------------------------------------
//
// Taken from the Claude Code 2.1.292 tools reference (https://code.claude.com/docs/en/tools-reference)
// and hooks reference (https://code.claude.com/docs/en/hooks), both fetched 2026-10-06. A review
// updates these lists together with the document, never one without the other.

const REQUIRED_TOOLS = [
  'Agent', 'Artifact', 'AskUserQuestion', 'Bash', 'CronCreate', 'CronDelete', 'CronList', 'Edit',
  'EndConversation', 'EnterPlanMode', 'EnterWorktree', 'ExitPlanMode', 'ExitWorktree', 'Glob', 'Grep',
  'ListAgents', 'ListMcpResourcesTool', 'LSP', 'Monitor', 'NotebookEdit', 'PowerShell',
  'PushNotification', 'Read', 'ReadMcpResourceTool', 'RemoteTrigger', 'ReportFindings',
  'ScheduleWakeup', 'SendFeedback', 'SendMessage', 'SendUserFile', 'ShareOnboardingGuide', 'Skill',
  'SubagentHandback', 'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate',
  'TodoWrite', 'ToolSearch', 'WaitForMcpServers', 'WebFetch', 'WebSearch', 'Workflow', 'Write',
];

const REQUIRED_EVENTS = [
  'SessionStart', 'Setup', 'InstructionsLoaded', 'UserPromptSubmit', 'UserPromptExpansion',
  'MessageDisplay', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure',
  'PostToolBatch', 'PermissionDenied', 'Notification', 'SubagentStart', 'SubagentStop', 'TaskCreated',
  'TaskCompleted', 'Stop', 'StopFailure', 'TeammateIdle', 'ConfigChange', 'CwdChanged',
  'DirectoryAdded', 'FileChanged', 'WorktreeCreate', 'WorktreeRemove', 'PreCompact', 'PostCompact',
  'PreModelSwitch', 'PostModelSwitch', 'SessionEnd', 'Elicitation', 'ElicitationResult',
];

/** Legacy names AOForge frontmatter still declares, mapped to the built-in they became. */
const ALIASES = { Task: 'Agent', SlashCommand: 'Skill' };

const STATUSES = ['adopted', 'partial', 'not adopted', 'candidate', 'n/a'];
const LIVE = ['adopted', 'partial'];
const SECTIONS = ['Tools', 'Hook events', 'Other surfaces', 'Candidates', 'Review procedure', 'Adoption history'];
const J5_CANDIDATES = ['mark_chapter', 'spawn_task', 'ScheduleWakeup', 'list_sessions'];
const MAX_REVIEW_GAP_DAYS = 100;

// ---- pure parsers --------------------------------------------------------------------------

/** Text under `## <heading>` up to the next `## ` heading, or null when the heading is absent. */
function section(md, heading) {
  const m = new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*$`, 'm').exec(md);
  if (!m) return null;
  const rest = md.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Cells of one pipe-table line; `\|` stays inside a cell. */
function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/**
 * Rows of the first pipe table in a section's text. The header row names the columns (Tool | Event |
 * Surface, Status, Where, Since, Notes); `name` is the first cell's backticked token, or its plain text.
 * `where` is every backticked token in the Where cell that contains a `/`.
 */
function parseTable(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return { columns: [], rows: [] };
  const columns = splitRow(lines[0]).map((c) => c.toLowerCase());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = splitRow(line);
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const at = (name) => {
      const i = columns.indexOf(name);
      return i === -1 ? '' : cells[i] || '';
    };
    const first = cells[0] || '';
    const named = first.match(/`([^`]+)`/);
    rows.push({
      name: named ? named[1] : first.replace(/[`*]/g, '').trim(),
      status: at('status'),
      where: (at('where').match(/`[^`]+`/g) || []).map((t) => t.slice(1, -1)).filter((t) => t.includes('/')),
      since: at('since'),
      notes: at('notes'),
      cells,
    });
  }
  return { columns, rows };
}

/** Strip a scope (`Bash(git add:*)`), map legacy names, drop `mcp__*`. */
function normalizeDeclared(names) {
  const out = new Set();
  for (const raw of names) {
    const base = String(raw).replace(/\(.*$/, '').trim();
    if (!base || base.startsWith('mcp__')) continue;
    out.add(ALIASES[base] || base);
  }
  return [...out].sort();
}

/** Map builtin -> files that declare it, over every skill's `allowed-tools` and agent's `tools:`. */
function declaredBuiltins(repoRoot) {
  const out = new Map();
  const note = (names, file) => {
    for (const n of normalizeDeclared(names)) {
      if (!out.has(n)) out.set(n, []);
      out.get(n).push(file);
    }
  };
  const skillsDir = path.join(repoRoot, 'plugins/aoforge/skills');
  for (const e of fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir, { withFileTypes: true }) : []) {
    const rel = `plugins/aoforge/skills/${e.name}/SKILL.md`;
    if (!e.isDirectory() || !fs.existsSync(path.join(repoRoot, rel))) continue;
    const { frontmatter } = audit.splitFrontmatter(fs.readFileSync(path.join(repoRoot, rel), 'utf-8'));
    note(audit.parseToolList(frontmatter, 'allowed-tools'), rel);
  }
  const agentsDir = path.join(repoRoot, 'plugins/aoforge/agents');
  for (const f of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir) : []) {
    if (!f.endsWith('.md')) continue;
    const rel = `plugins/aoforge/agents/${f}`;
    const { frontmatter } = audit.splitFrontmatter(fs.readFileSync(path.join(repoRoot, rel), 'utf-8'));
    note(audit.parseToolList(frontmatter, 'tools'), rel);
  }
  return out;
}

/** Event names registered in a parsed hooks.json. */
function registeredEvents(hooksJson) {
  return Object.keys((hooksJson && hooksJson.hooks) || {}).sort();
}

const wordRe = (name) => new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(name)}(?![A-Za-z0-9_])`);
const mentions = (text, name) => wordRe(name).test(String(text || ''));

// ---- checks (each returns a list of error strings) -----------------------------------------

function checkHeader(md) {
  const errors = [];
  const last = md.match(/^Last reviewed:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  const next = md.match(/^Next review:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  if (!last) errors.push('missing "Last reviewed: YYYY-MM-DD" line');
  if (!next) errors.push('missing "Next review: YYYY-MM-DD" line');
  if (last && next) {
    const days = (Date.parse(`${next[1]}T00:00:00Z`) - Date.parse(`${last[1]}T00:00:00Z`)) / 86400000;
    if (!(days > 0)) errors.push(`Next review ${next[1]} is not after Last reviewed ${last[1]}`);
    else if (days > MAX_REVIEW_GAP_DAYS) {
      errors.push(`Next review is ${days} days after Last reviewed (limit ${MAX_REVIEW_GAP_DAYS})`);
    }
  }
  if (!/^Claude Code:\s*\d+\.\d+\.\d+\b/m.test(md)) errors.push('missing "Claude Code: <x.y.z>" line');
  for (const s of SECTIONS) if (section(md, s) === null) errors.push(`missing section "## ${s}"`);
  return errors;
}

function checkRowSet(rows, required, label) {
  const errors = [];
  for (const name of required) {
    const n = rows.filter((r) => r.name === name).length;
    if (n === 0) errors.push(`${label}: no row for ${name}`);
    else if (n > 1) errors.push(`${label}: ${n} rows for ${name}, expected one`);
  }
  for (const r of rows) {
    if (!required.includes(r.name)) errors.push(`${label}: row "${r.name}" is not a known ${label} name`);
  }
  return errors;
}

function checkStatuses(rows, label) {
  return rows
    .filter((r) => !STATUSES.includes(r.status))
    .map((r) => `${label}: row ${r.name} has unknown status "${r.status}"`);
}

/** ctx: { exists(rel) -> bool, hasWord(rel, words) -> bool }. `toolRows` adds the name-in-file check. */
function checkCitations(rows, label, ctx, toolRows) {
  const errors = [];
  for (const r of rows) {
    if (!LIVE.includes(r.status)) continue;
    if (r.where.length === 0) {
      errors.push(`${label}: ${r.status} row ${r.name} cites no repo path in Where`);
      continue;
    }
    const missing = r.where.filter((p) => !ctx.exists(p));
    for (const p of missing) errors.push(`${label}: row ${r.name} cites ${p}, which does not exist`);
    if (toolRows && missing.length < r.where.length) {
      const words = [r.name, ...Object.keys(ALIASES).filter((k) => ALIASES[k] === r.name)];
      const found = r.where.filter((p) => ctx.exists(p)).some((p) => ctx.hasWord(p, words));
      if (!found) errors.push(`${label}: no file cited by ${r.name} names ${words.join(' or ')}`);
    }
  }
  return errors;
}

function checkTreeToDoc(declared, toolRows) {
  const errors = [];
  for (const [name, files] of declared) {
    const row = toolRows.find((r) => r.name === name);
    if (!row) errors.push(`${name} is declared by ${files[0]} but has no Tools row`);
    else if (!LIVE.includes(row.status)) {
      errors.push(`${name} is declared by ${files[0]} but its row says "${row.status}"`);
    }
  }
  return errors;
}

function checkEvents(eventRows, registered) {
  const errors = [];
  for (const ev of registered) {
    const row = eventRows.find((r) => r.name === ev);
    if (!row) errors.push(`${ev} is registered in hooks.json but has no Hook events row`);
    else if (row.status !== 'adopted') errors.push(`${ev} is registered in hooks.json but its row says "${row.status}"`);
  }
  for (const r of eventRows) {
    if (r.status === 'adopted' && !registered.includes(r.name)) {
      errors.push(`${r.name} is marked adopted but is not registered in hooks.json`);
    }
  }
  return errors;
}

function checkBuiltins(toolRows, builtins) {
  const errors = [];
  for (const name of builtins) {
    const row = toolRows.find((r) => r.name === name);
    if (!row) errors.push(`builtin-audit counts ${name} but it has no Tools row`);
    else if (!LIVE.includes(row.status)) {
      errors.push(`builtin-audit counts ${name} but its row says "${row.status}"`);
    }
  }
  return errors;
}

/** `tables`: [{label, rows}]. A candidate row needs Notes and a mention in `## Candidates`. */
function checkCandidates(tables, candidatesText) {
  const errors = [];
  for (const { label, rows } of tables) {
    for (const r of rows.filter((x) => x.status === 'candidate')) {
      if (!r.notes.trim()) errors.push(`${label}: candidate row ${r.name} has empty Notes`);
      if (!mentions(candidatesText, r.name)) errors.push(`${label}: candidate ${r.name} is not named in ## Candidates`);
    }
  }
  return errors;
}

// ---- real-tree context ---------------------------------------------------------------------

function readText(rel) {
  const abs = path.join(REPO_ROOT, rel);
  const st = fs.statSync(abs);
  if (!st.isDirectory()) return fs.readFileSync(abs, 'utf-8');
  const parts = [];
  const walk = (dir, budget) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (budget.n <= 0) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, budget);
      else if (/\.(md|js|cjs|json)$/.test(e.name)) {
        budget.n--;
        parts.push(fs.readFileSync(p, 'utf-8'));
      }
    }
  };
  walk(abs, { n: 500 });
  return parts.join('\n');
}

const realCtx = {
  exists: (rel) => fs.existsSync(path.join(REPO_ROOT, rel)),
  hasWord: (rel, words) => words.some((w) => wordRe(w).test(readText(rel))),
};

function loadDoc() {
  const abs = path.join(REPO_ROOT, DOC_REL);
  assert.ok(fs.existsSync(abs), `${DOC_REL} is missing`);
  const md = fs.readFileSync(abs, 'utf-8');
  return {
    md,
    tools: parseTable(section(md, 'Tools')).rows,
    events: parseTable(section(md, 'Hook events')).rows,
    surfaces: parseTable(section(md, 'Other surfaces')).rows,
    candidates: section(md, 'Candidates') || '',
  };
}

const hooksJson = () =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'plugins/aoforge/hooks/hooks.json'), 'utf-8'));

const failIf = (errors) => assert.deepEqual(errors, [], errors.join('\n'));

// ---- tests ---------------------------------------------------------------------------------

describe(
  'built-in integration inventory (TRD 63-06)',
  { skip: !IS_AOFORGE_CHECKOUT ? 'not an AOForge checkout' : false },
  () => {
    test('1. the document exists with its review lines and sections', () => {
      failIf(checkHeader(loadDoc().md));
    });

    test('1b. the document carries the J5 candidates and the adoption history of 62 and 63', () => {
      const { md, candidates } = loadDoc();
      const history = section(md, 'Adoption history') || '';
      const errors = [];
      for (const c of J5_CANDIDATES) if (!candidates.includes(c)) errors.push(`## Candidates does not name ${c}`);
      for (const o of ['62', '63']) {
        if (!new RegExp(`Objective ${o}\\b`).test(history)) errors.push(`## Adoption history has no Objective ${o} entry`);
      }
      failIf(errors);
    });

    test('1c. the review procedure names this test file and both pinned lists', () => {
      const proc = section(loadDoc().md, 'Review procedure') || '';
      const errors = [];
      for (const s of ['builtin-status.repo.test.cjs', 'REQUIRED_TOOLS', 'REQUIRED_EVENTS']) {
        if (!proc.includes(s)) errors.push(`## Review procedure does not mention ${s}`);
      }
      failIf(errors);
    });

    test('2. every pinned tool has exactly one Tools row, and every row names one', () => {
      failIf(checkRowSet(loadDoc().tools, REQUIRED_TOOLS, 'Tools'));
    });

    test('3. every pinned event has exactly one Hook events row, and every row names one', () => {
      failIf(checkRowSet(loadDoc().events, REQUIRED_EVENTS, 'Hook events'));
    });

    test('4. every Status cell is one of the five statuses', () => {
      const d = loadDoc();
      failIf([
        ...checkStatuses(d.tools, 'Tools'),
        ...checkStatuses(d.events, 'Hook events'),
        ...checkStatuses(d.surfaces, 'Other surfaces'),
      ]);
      assert.ok(d.surfaces.length >= 5, 'expected at least 5 Other surfaces rows');
    });

    test('5. adopted and partial rows cite existing paths, and Tools rows cite a file that names the tool', () => {
      const d = loadDoc();
      failIf([
        ...checkCitations(d.tools, 'Tools', realCtx, true),
        ...checkCitations(d.events, 'Hook events', realCtx, false),
        ...checkCitations(d.surfaces, 'Other surfaces', realCtx, false),
      ]);
    });

    test('6. every built-in a skill or agent declares has an adopted or partial row', () => {
      const declared = declaredBuiltins(REPO_ROOT);
      assert.ok(declared.size >= 10, `expected a populated declaration set, found ${declared.size}`);
      failIf(checkTreeToDoc(declared, loadDoc().tools));
    });

    test('7. registered events are adopted, and adopted events are registered', () => {
      const registered = registeredEvents(hooksJson());
      assert.ok(registered.length >= 5, `expected registered events, found ${registered.length}`);
      failIf(checkEvents(loadDoc().events, registered));
    });

    test('8. every builtin-audit BUILTINS name is adopted or partial', () => {
      assert.ok(audit.BUILTINS.length >= 8);
      failIf(checkBuiltins(loadDoc().tools, audit.BUILTINS));
    });

    test('9. every candidate row has Notes and is named in ## Candidates', () => {
      const d = loadDoc();
      failIf(
        checkCandidates(
          [
            { label: 'Tools', rows: d.tools },
            { label: 'Hook events', rows: d.events },
            { label: 'Other surfaces', rows: d.surfaces },
          ],
          d.candidates,
        ),
      );
    });

    test('pinned lists are well formed', () => {
      assert.equal(new Set(REQUIRED_TOOLS).size, REQUIRED_TOOLS.length, 'duplicate in REQUIRED_TOOLS');
      assert.equal(new Set(REQUIRED_EVENTS).size, REQUIRED_EVENTS.length, 'duplicate in REQUIRED_EVENTS');
      assert.equal(REQUIRED_TOOLS.length, 46);
      assert.equal(REQUIRED_EVENTS.length, 33);
      for (const v of Object.values(ALIASES)) assert.ok(REQUIRED_TOOLS.includes(v), `alias target ${v} is not pinned`);
    });
  },
);

// ---- 10. sensitivity: each check fails on a synthetic snippet ------------------------------
// These run without the document, so they hold on any checkout.

describe('built-in inventory checks are sensitive (TRD 63-06 test 10)', () => {
  const SNIPPET = [
    'Last reviewed: 2026-10-06',
    'Next review: 2027-01-04',
    'Claude Code: 2.1.292',
    '',
    '## Tools',
    '| Tool | Status | Where | Since | Notes |',
    '|---|---|---|---|---|',
    '| `Read` | adopted | `a/b.md`, `c/d.md` | 62 | note \\| with pipe |',
    '| `Write` | candidate | | | |',
    '',
    '## Candidates',
    'Nothing here.',
  ].join('\n');

  const ctx = (existing, words = {}) => ({
    exists: (rel) => existing.includes(rel),
    hasWord: (rel, ws) => ws.some((w) => (words[rel] || []).includes(w)),
  });

  test('the parser reads names, statuses, paths and escaped pipes', () => {
    const rows = parseTable(section(SNIPPET, 'Tools')).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, 'Read');
    assert.equal(rows[0].status, 'adopted');
    assert.deepEqual(rows[0].where, ['a/b.md', 'c/d.md']);
    assert.equal(rows[0].notes, 'note | with pipe');
  });

  test('a missing tool row is reported by name', () => {
    const rows = parseTable(section(SNIPPET, 'Tools')).rows;
    const errors = checkRowSet(rows, ['Read', 'Write', 'Edit'], 'Tools');
    assert.deepEqual(errors, ['Tools: no row for Edit']);
  });

  test('a duplicate row and an unknown row are reported', () => {
    const rows = [{ name: 'Read' }, { name: 'Read' }, { name: 'Ghost' }];
    const errors = checkRowSet(rows, ['Read'], 'Tools');
    assert.equal(errors.length, 2);
    assert.match(errors[0], /2 rows for Read/);
    assert.match(errors[1], /"Ghost" is not a known/);
  });

  test('an unknown status is reported', () => {
    const errors = checkStatuses([{ name: 'Read', status: 'done' }, { name: 'Edit', status: 'adopted' }], 'Tools');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Read has unknown status "done"/);
  });

  test('an adopted row citing a missing path is reported', () => {
    const rows = [{ name: 'Read', status: 'adopted', where: ['a/b.md', 'gone.md/x'] }];
    const errors = checkCitations(rows, 'Tools', ctx(['a/b.md'], { 'a/b.md': ['Read'] }), true);
    assert.deepEqual(errors, ['Tools: row Read cites gone.md/x, which does not exist']);
  });

  test('an adopted row citing nothing, and a cited file that never names the tool, are reported', () => {
    const none = checkCitations([{ name: 'Read', status: 'adopted', where: [] }], 'Tools', ctx([]), true);
    assert.match(none[0], /cites no repo path/);
    const rows = [{ name: 'Agent', status: 'partial', where: ['a/b.md'] }];
    const miss = checkCitations(rows, 'Tools', ctx(['a/b.md'], { 'a/b.md': ['Nope'] }), true);
    assert.match(miss[0], /names Agent or Task/);
    const ok = checkCitations(rows, 'Tools', ctx(['a/b.md'], { 'a/b.md': ['Task'] }), true);
    assert.deepEqual(ok, []);
  });

  test('a not-adopted row is not required to cite anything', () => {
    assert.deepEqual(checkCitations([{ name: 'LSP', status: 'not adopted', where: [] }], 'Tools', ctx([]), true), []);
  });

  test('an adopted hook event that is not registered is reported, and so is a registered non-adopted one', () => {
    const rows = [
      { name: 'Stop', status: 'adopted' },
      { name: 'Elicitation', status: 'adopted' },
      { name: 'PreToolUse', status: 'candidate' },
    ];
    const errors = checkEvents(rows, ['Stop', 'PreToolUse', 'SessionEnd']);
    assert.deepEqual(errors, [
      'PreToolUse is registered in hooks.json but its row says "candidate"',
      'SessionEnd is registered in hooks.json but has no Hook events row',
      'Elicitation is marked adopted but is not registered in hooks.json',
    ]);
  });

  test('a declared built-in with no live row is reported', () => {
    const declared = new Map([['Edit', ['plugins/aoforge/skills/x/SKILL.md']], ['Glob', ['plugins/aoforge/agents/y.md']]]);
    const errors = checkTreeToDoc(declared, [{ name: 'Edit', status: 'not adopted' }]);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /Edit is declared by .* its row says "not adopted"/);
    assert.match(errors[1], /Glob is declared by .* no Tools row/);
  });

  test('aliases are mapped, scopes stripped and mcp tools dropped', () => {
    const got = normalizeDeclared(['Task', 'Bash(git add:*)', 'mcp__dart__*', 'SlashCommand', 'Read']);
    assert.deepEqual(got, ['Agent', 'Bash', 'Read', 'Skill']);
  });

  test('a builtin-audit name with no live row is reported', () => {
    const errors = checkBuiltins([{ name: 'TaskGet', status: 'not adopted' }], ['TaskGet', 'TodoWrite']);
    assert.equal(errors.length, 2);
  });

  test('a candidate with empty Notes, or missing from ## Candidates, is reported', () => {
    const rows = parseTable(section(SNIPPET, 'Tools')).rows;
    const errors = checkCandidates([{ label: 'Tools', rows }], section(SNIPPET, 'Candidates'));
    assert.equal(errors.length, 2);
    assert.match(errors[0], /candidate row Write has empty Notes/);
    assert.match(errors[1], /candidate Write is not named in ## Candidates/);
    const named = checkCandidates([{ label: 'Tools', rows: [{ name: 'Write', status: 'candidate', notes: 'x' }] }], 'Use `Write` here');
    assert.deepEqual(named, []);
  });

  test('the header check reports missing lines, a bad review gap and missing sections', () => {
    assert.ok(checkHeader('# nothing').length >= 9);
    const base = (next) => `Last reviewed: 2026-10-06\nNext review: ${next}\nClaude Code: 2.1.292\n`;
    assert.ok(checkHeader(base('2026-10-06')).some((e) => /not after/.test(e)));
    assert.ok(checkHeader(base('2027-06-01')).some((e) => /limit 100/.test(e)));
    assert.ok(!checkHeader(base('2027-01-04')).some((e) => /Next review|Last reviewed|Claude Code/.test(e)));
  });
});
