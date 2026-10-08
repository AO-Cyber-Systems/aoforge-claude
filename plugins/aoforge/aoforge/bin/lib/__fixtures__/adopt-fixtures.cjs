'use strict';

// adopt-fixtures.cjs — hand-built scratch git repos for objective 37 (no_llm_test_data).
// Never touches the real ~/.claude or any real repository.
//
// Ownership: this is the ONLY shared fixture file for objective 37 (37-01's must_haves). Later
// TRDs import it read-only and keep any extra helpers inside their own test files. This file
// re-exports `makeFakeHome`, `gitEnv`, `snapshot` and `diffSnapshots` from upgrade-fixtures.cjs
// (objective 36) verbatim and never edits that file.

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const {
  makeFakeHome,
  gitEnv,
  snapshot,
  diffSnapshots,
} = require('./upgrade-fixtures.cjs');

const FIXTURE_KINDS = ['go-service', 'flutter-app', 'node-cli', 'empty', 'aoforge', 'dirty'];

// ─── Small helpers ────────────────────────────────────────────────────────────

function writeRel(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function writeJson(root, relPath, value) {
  return writeRel(root, relPath, JSON.stringify(value, null, 2) + '\n');
}

// ─── Literal file contents (hand-written, no_llm_test_data) ──────────────────

const GO_MOD = 'module example.com/orders\n\ngo 1.22\n';

const GO_MAIN =
  'package main\n\n' +
  'import (\n' +
  '\t"log"\n' +
  '\t"net/http"\n\n' +
  '\t"example.com/orders/internal/orders"\n' +
  ')\n\n' +
  'func main() {\n' +
  '\tstore := orders.NewStore()\n' +
  '\tmux := http.NewServeMux()\n' +
  '\tmux.HandleFunc("/orders", orders.Handler(store))\n\n' +
  '\tsrv := &http.Server{\n' +
  '\t\tAddr:    ":8091",\n' +
  '\t\tHandler: mux,\n' +
  '\t}\n' +
  '\tlog.Fatal(srv.ListenAndServe())\n' +
  '}\n';

const GO_HANDLER =
  'package orders\n\n' +
  'import (\n' +
  '\t"encoding/json"\n' +
  '\t"net/http"\n' +
  ')\n\n' +
  '// Handler returns an http.HandlerFunc that lists orders on GET and creates one on POST.\n' +
  'func Handler(store *Store) http.HandlerFunc {\n' +
  '\treturn func(w http.ResponseWriter, r *http.Request) {\n' +
  '\t\tswitch r.Method {\n' +
  '\t\tcase http.MethodGet:\n' +
  '\t\t\tw.Header().Set("Content-Type", "application/json")\n' +
  '\t\t\tjson.NewEncoder(w).Encode(store.List())\n' +
  '\t\tcase http.MethodPost:\n' +
  '\t\t\tvar o Order\n' +
  '\t\t\tif err := json.NewDecoder(r.Body).Decode(&o); err != nil {\n' +
  '\t\t\t\thttp.Error(w, err.Error(), http.StatusBadRequest)\n' +
  '\t\t\t\treturn\n' +
  '\t\t\t}\n' +
  '\t\t\tstore.Add(o)\n' +
  '\t\t\tw.WriteHeader(http.StatusCreated)\n' +
  '\t\tdefault:\n' +
  '\t\t\thttp.Error(w, "method not allowed", http.StatusMethodNotAllowed)\n' +
  '\t\t}\n' +
  '\t}\n' +
  '}\n';

const GO_STORE =
  'package orders\n\n' +
  'import "sync"\n\n' +
  '// Order is a single customer order.\n' +
  'type Order struct {\n' +
  '\tID       string `json:"id"`\n' +
  '\tItem     string `json:"item"`\n' +
  '\tQuantity int    `json:"quantity"`\n' +
  '}\n\n' +
  '// Store is an in-memory, mutex-guarded collection of orders.\n' +
  'type Store struct {\n' +
  '\tmu     sync.Mutex\n' +
  '\torders map[string]Order\n' +
  '}\n\n' +
  '// NewStore returns an empty Store.\n' +
  'func NewStore() *Store {\n' +
  '\treturn &Store{orders: make(map[string]Order)}\n' +
  '}\n\n' +
  '// Add stores an order, keyed by its ID.\n' +
  'func (s *Store) Add(o Order) {\n' +
  '\ts.mu.Lock()\n' +
  '\tdefer s.mu.Unlock()\n' +
  '\ts.orders[o.ID] = o\n' +
  '}\n\n' +
  '// List returns every stored order.\n' +
  'func (s *Store) List() []Order {\n' +
  '\ts.mu.Lock()\n' +
  '\tdefer s.mu.Unlock()\n' +
  '\tout := make([]Order, 0, len(s.orders))\n' +
  '\tfor _, o := range s.orders {\n' +
  '\t\tout = append(out, o)\n' +
  '\t}\n' +
  '\treturn out\n' +
  '}\n';

const GO_HANDLER_TEST =
  'package orders\n\n' +
  'import (\n' +
  '\t"net/http"\n' +
  '\t"net/http/httptest"\n' +
  '\t"testing"\n' +
  ')\n\n' +
  'func TestHandlerList(t *testing.T) {\n' +
  '\tstore := NewStore()\n' +
  '\tstore.Add(Order{ID: "1", Item: "Widget", Quantity: 2})\n\n' +
  '\treq := httptest.NewRequest(http.MethodGet, "/orders", nil)\n' +
  '\trec := httptest.NewRecorder()\n\n' +
  '\tHandler(store)(rec, req)\n\n' +
  '\tif rec.Code != http.StatusOK {\n' +
  '\t\tt.Fatalf("expected 200, got %d", rec.Code)\n' +
  '\t}\n' +
  '}\n';

const GO_MAKEFILE =
  'test:\n' +
  '\tgo test ./...\n\n' +
  'lint:\n' +
  '\tgo vet ./...\n\n' +
  'build:\n' +
  '\tgo build ./...\n';

const GO_CI_YML =
  'name: CI\n' +
  'on: [push]\n' +
  'jobs:\n' +
  '  test:\n' +
  '    runs-on: ubuntu-latest\n' +
  '    steps:\n' +
  '      - uses: actions/checkout@v4\n' +
  "      - uses: actions/setup-go@v5\n" +
  "        with:\n" +
  "          go-version: '1.22'\n" +
  '      - run: go test ./...\n';

const GO_README = '# Orders service\n\nHTTP API for creating and listing orders.\n';

const FLUTTER_PUBSPEC =
  'name: habit_tracker\n' +
  'description: A habit tracking fixture app.\n' +
  "publish_to: 'none'\n" +
  'version: 0.1.0\n\n' +
  'environment:\n' +
  "  sdk: '>=3.0.0 <4.0.0'\n\n" +
  'dependencies:\n' +
  '  flutter:\n' +
  '    sdk: flutter\n\n' +
  'dev_dependencies:\n' +
  '  flutter_test:\n' +
  '    sdk: flutter\n\n' +
  'flutter:\n' +
  '  uses-material-design: true\n';

const FLUTTER_MAIN =
  "import 'package:flutter/material.dart';\n\n" +
  "import 'src/app.dart';\n\n" +
  'void main() {\n' +
  '  runApp(const HabitApp());\n' +
  '}\n';

const FLUTTER_APP_DART =
  "import 'package:flutter/material.dart';\n\n" +
  "import 'habit_list.dart';\n\n" +
  'class HabitApp extends StatelessWidget {\n' +
  '  const HabitApp({super.key});\n\n' +
  '  @override\n' +
  '  Widget build(BuildContext context) {\n' +
  '    return MaterialApp(\n' +
  "      title: 'Habit Tracker',\n" +
  '      home: Scaffold(\n' +
  "        appBar: AppBar(title: const Text('Habit Tracker')),\n" +
  "        body: const HabitList(habits: ['Read', 'Walk', 'Meditate']),\n" +
  '      ),\n' +
  '    );\n' +
  '  }\n' +
  '}\n';

const FLUTTER_HABIT_LIST_DART =
  "import 'package:flutter/material.dart';\n\n" +
  'class HabitList extends StatelessWidget {\n' +
  '  const HabitList({super.key, required this.habits});\n\n' +
  '  final List<String> habits;\n\n' +
  '  @override\n' +
  '  Widget build(BuildContext context) {\n' +
  '    return ListView(\n' +
  '      children: habits.map((h) => ListTile(title: Text(h))).toList(),\n' +
  '    );\n' +
  '  }\n' +
  '}\n';

const FLUTTER_HABIT_LIST_TEST =
  "import 'package:flutter/material.dart';\n" +
  "import 'package:flutter_test/flutter_test.dart';\n" +
  "import 'package:habit_tracker/src/habit_list.dart';\n\n" +
  'void main() {\n' +
  "  testWidgets('renders each habit title', (tester) async {\n" +
  '    await tester.pumpWidget(\n' +
  '      const MaterialApp(\n' +
  "        home: HabitList(habits: ['Read', 'Walk']),\n" +
  '      ),\n' +
  '    );\n\n' +
  "    expect(find.text('Read'), findsOneWidget);\n" +
  "    expect(find.text('Walk'), findsOneWidget);\n" +
  '  });\n' +
  '}\n';

const FLUTTER_ANALYSIS_OPTIONS = 'include: package:flutter_lints/flutter.yaml\n';

const FLUTTER_README = '# Habit tracker\n';

const NODE_PACKAGE_JSON = {
  name: 'todo-cli',
  version: '0.1.0',
  bin: { todo: 'bin/todo.js' },
  scripts: { test: 'node --test', lint: 'node --check bin/todo.js' },
};

const NODE_TODO_JS =
  '#!/usr/bin/env node\n' +
  "'use strict';\n\n" +
  "const { addTodo, listTodos, completeTodo } = require('../lib/store.js');\n" +
  "const { formatTodo } = require('../lib/format.js');\n\n" +
  'const [, , command, ...args] = process.argv;\n\n' +
  'switch (command) {\n' +
  "  case 'add':\n" +
  "    addTodo(args.join(' '));\n" +
  '    break;\n' +
  "  case 'list':\n" +
  '    for (const todo of listTodos()) console.log(formatTodo(todo));\n' +
  '    break;\n' +
  "  case 'done':\n" +
  '    completeTodo(Number(args[0]));\n' +
  '    break;\n' +
  '  default:\n' +
  "    console.error('usage: todo <add|list|done> [args]');\n" +
  '    process.exitCode = 1;\n' +
  '}\n';

const NODE_STORE_JS =
  "'use strict';\n\n" +
  "const fs = require('fs');\n" +
  "const path = require('path');\n" +
  "const os = require('os');\n\n" +
  "const STORE_PATH = path.join(os.tmpdir(), 'todo-cli-store.json');\n\n" +
  'function loadTodos() {\n' +
  '  try {\n' +
  "    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));\n" +
  '  } catch {\n' +
  '    return [];\n' +
  '  }\n' +
  '}\n\n' +
  'function saveTodos(todos) {\n' +
  "  fs.writeFileSync(STORE_PATH, JSON.stringify(todos, null, 2), 'utf-8');\n" +
  '}\n\n' +
  'function addTodo(text) {\n' +
  '  const todos = loadTodos();\n' +
  '  todos.push({ text, done: false });\n' +
  '  saveTodos(todos);\n' +
  '}\n\n' +
  'function listTodos() {\n' +
  '  return loadTodos();\n' +
  '}\n\n' +
  'function completeTodo(index) {\n' +
  '  const todos = loadTodos();\n' +
  '  if (todos[index]) todos[index].done = true;\n' +
  '  saveTodos(todos);\n' +
  '}\n\n' +
  'module.exports = { addTodo, listTodos, completeTodo };\n';

const NODE_FORMAT_JS =
  "'use strict';\n\n" +
  'function formatTodo(todo) {\n' +
  "  return `[${todo.done ? 'x' : ' '}] ${todo.text}`;\n" +
  '}\n\n' +
  'module.exports = { formatTodo };\n';

const NODE_STORE_TEST_JS =
  "'use strict';\n\n" +
  "const { test } = require('node:test');\n" +
  "const assert = require('node:assert/strict');\n" +
  "const { formatTodo } = require('../lib/format.js');\n\n" +
  "test('formatTodo marks done items', () => {\n" +
  "  assert.strictEqual(formatTodo({ text: 'x', done: true }), '[x] x');\n" +
  '});\n\n' +
  "test('formatTodo marks pending items', () => {\n" +
  "  assert.strictEqual(formatTodo({ text: 'y', done: false }), '[ ] y');\n" +
  '});\n';

const NODE_README = '# todo-cli\n';

const EMPTY_README = '# Empty\n';

const ROADMAP_MD = '# Roadmap\n\n## Progress\n\n| Objective | Status | TRDs |\n| --- | --- | --- |\n';

const STATE_MD =
  '# Project State\n\n' +
  '## Current Position\n\n' +
  '**Current Objective:** —\n' +
  '**Status:** Ready\n\n' +
  '## Blockers\n\n' +
  '## Session Log\n';

// ─── git helpers (LOCAL config only — never global, never this repo) ─────────

function git(root, home, args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: gitEnv(home),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
}

function initGitRepo(root, home) {
  git(root, home, ['init', '-q', '-b', 'main']);
  git(root, home, ['config', 'user.name', 'AOForge Fixture']);
  git(root, home, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, home, ['config', 'commit.gpgsign', 'false']);
  git(root, home, ['config', 'tag.gpgsign', 'false']);
  git(root, home, ['add', '-A']);
  git(root, home, ['commit', '-q', '-m', 'init']);
}

// ─── Per-kind file writers ────────────────────────────────────────────────────

function writeGoService(root) {
  writeRel(root, 'go.mod', GO_MOD);
  writeRel(root, 'main.go', GO_MAIN);
  writeRel(root, 'internal/orders/handler.go', GO_HANDLER);
  writeRel(root, 'internal/orders/store.go', GO_STORE);
  writeRel(root, 'internal/orders/handler_test.go', GO_HANDLER_TEST);
  writeRel(root, 'Makefile', GO_MAKEFILE);
  writeRel(root, '.github/workflows/ci.yml', GO_CI_YML);
  writeRel(root, 'README.md', GO_README);
}

function writeFlutterApp(root) {
  writeRel(root, 'pubspec.yaml', FLUTTER_PUBSPEC);
  writeRel(root, 'lib/main.dart', FLUTTER_MAIN);
  writeRel(root, 'lib/src/app.dart', FLUTTER_APP_DART);
  writeRel(root, 'lib/src/habit_list.dart', FLUTTER_HABIT_LIST_DART);
  writeRel(root, 'test/habit_list_test.dart', FLUTTER_HABIT_LIST_TEST);
  writeRel(root, 'analysis_options.yaml', FLUTTER_ANALYSIS_OPTIONS);
  writeRel(root, 'README.md', FLUTTER_README);
}

function writeNodeCli(root) {
  writeJson(root, 'package.json', NODE_PACKAGE_JSON);
  writeRel(root, 'bin/todo.js', NODE_TODO_JS);
  writeRel(root, 'lib/store.js', NODE_STORE_JS);
  writeRel(root, 'lib/format.js', NODE_FORMAT_JS);
  writeRel(root, 'test/store.test.js', NODE_STORE_TEST_JS);
  writeRel(root, 'README.md', NODE_README);
}

function writeEmpty(root) {
  writeRel(root, 'README.md', EMPTY_README);
}

// ─── Public builders ──────────────────────────────────────────────────────────

/**
 * makeFixture(kind, { parent, home, name = kind }) -> absolute fixture root
 *
 * `parent` and `home` are required absolute paths. Writes literal, hand-built files for `kind`
 * (see FIXTURE_KINDS), then `git init -b main` with LOCAL identity + gpgsign=false and one `init`
 * commit — all git calls run with `gitEnv(home)` so the operator's real git config is never
 * consulted. Nothing is created outside `parent`.
 */
function makeFixture(kind, { parent, home, name = kind } = {}) {
  if (!parent || !path.isAbsolute(parent)) {
    throw new Error('makeFixture: parent must be an absolute path');
  }
  if (!home || !path.isAbsolute(home)) {
    throw new Error('makeFixture: home must be an absolute path');
  }
  if (!FIXTURE_KINDS.includes(kind)) {
    throw new Error(`makeFixture: unknown kind ${JSON.stringify(kind)} (expected one of ${FIXTURE_KINDS.join(', ')})`);
  }

  const root = path.join(parent, name);
  fs.mkdirSync(root, { recursive: true });

  switch (kind) {
    case 'go-service':
      writeGoService(root);
      initGitRepo(root, home);
      break;
    case 'flutter-app':
      writeFlutterApp(root);
      initGitRepo(root, home);
      break;
    case 'node-cli':
      writeNodeCli(root);
      initGitRepo(root, home);
      break;
    case 'empty':
      writeEmpty(root);
      initGitRepo(root, home);
      break;
    case 'aoforge':
      writeGoService(root);
      writeProjectMd(root, { name: 'Orders service', kind: 'api', defaultWork: 'feature' });
      writeRel(root, '.planning/ROADMAP.md', ROADMAP_MD);
      writeRel(root, '.planning/STATE.md', STATE_MD);
      writeJson(root, '.planning/config.json', { aoforge: { version: '2.10.0', migrations_applied: [] } });
      initGitRepo(root, home);
      break;
    case 'dirty':
      writeGoService(root);
      initGitRepo(root, home);
      fs.appendFileSync(path.join(root, 'main.go'), '// wip\n', 'utf-8');
      writeRel(root, 'notes.txt', 'scratch notes\n');
      break;
    default:
      throw new Error(`makeFixture: unhandled kind ${JSON.stringify(kind)}`);
  }

  return root;
}

const CODEBASE_DOC_NAMES = [
  'STACK', 'INTEGRATIONS', 'ARCHITECTURE', 'STRUCTURE',
  'CONVENTIONS', 'TESTING', 'PATTERNS', 'CONCERNS',
];

/**
 * writeMappedDocs(root, { lines = 24 } = {}) -> absolute paths written
 *
 * Writes 8 literal, hand-built stand-in codebase docs under `.planning/codebase/`, each at least
 * `lines` lines long (default 24, comfortably over the 21-line must-have floor).
 */
function writeMappedDocs(root, { lines = 24 } = {}) {
  const written = [];
  for (const name of CODEBASE_DOC_NAMES) {
    const body = [`# ${name}`, ''];
    let i = 1;
    while (body.length < lines) {
      body.push(`Fixture ${name.toLowerCase()} line ${i}.`);
      i += 1;
    }
    written.push(writeRel(root, `.planning/codebase/${name}.md`, body.join('\n') + '\n'));
  }
  return written;
}

/**
 * writeProjectMd(root, { name, kind, defaultWork = 'feature', validated = [] }) -> absolute path
 *
 * Writes `.planning/PROJECT.md` with frontmatter `kind`/`default_work` and the sections
 * `## What This Is`, `## Core Value`, `## Requirements` (`### Validated`, `### Active`,
 * `### Out of Scope`), `## Constraints`.
 */
function writeProjectMd(root, { name, kind, defaultWork = 'feature', validated = [] } = {}) {
  const fm = ['---'];
  if (kind !== undefined && kind !== null) fm.push(`kind: ${kind}`);
  fm.push(`default_work: ${defaultWork}`);
  fm.push('---');

  const validatedLines = validated.length ? validated.map((v) => `- ${v}`).join('\n') : '(none inferred yet)';

  const body =
    fm.join('\n') + '\n\n' +
    `# ${name}\n\n` +
    '## What This Is\n\n' +
    `${name} — adopted by AOForge from an existing codebase.\n\n` +
    '## Core Value\n\n' +
    'Keeps the existing codebase working while AOForge tracks its plan.\n\n' +
    '## Requirements\n\n' +
    '### Validated\n\n' +
    `${validatedLines}\n\n` +
    '### Active\n\n' +
    '### Out of Scope\n\n' +
    '## Constraints\n';

  return writeRel(root, '.planning/PROJECT.md', body);
}

/**
 * writeInferences(root, items) -> absolute path
 *
 * Writes `.planning/.adopt-inferences.json` as a JSON array of
 * `{ field, value, confidence: 'high'|'medium'|'low', evidence }` items.
 */
function writeInferences(root, items = []) {
  return writeJson(root, '.planning/.adopt-inferences.json', items);
}

// ─── CLI ────────────────────────────────────────────────────────────────────
//
// node adopt-fixtures.cjs home <dir>                          -> {"home": "<abs>"}
// node adopt-fixtures.cjs make <kind> <dir> [--home <abs>]     -> {"root": "<abs>"}
//
// Both refuse (non-zero, nothing written) a target dir that already exists and is non-empty.
// `make` additionally refuses when the target's parent is inside an existing git work tree, so a
// fixture can never land inside a real repository. The missing parent is created only after both
// guards pass.

function dirExistsNonEmpty(dir) {
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

function cmdHome(rest) {
  const [dirArg] = rest;
  if (!dirArg) {
    process.stderr.write('Usage: adopt-fixtures.cjs home <dir>\n');
    process.exitCode = 1;
    return;
  }
  const dir = path.resolve(dirArg);
  if (dirExistsNonEmpty(dir)) {
    process.stderr.write(`Error: target dir exists and is non-empty: ${dir}\n`);
    process.exitCode = 1;
    return;
  }

  const home = makeFakeHome();
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(home, dir, { recursive: true });
  fs.rmSync(home, { recursive: true, force: true });

  process.stdout.write(JSON.stringify({ home: dir }) + '\n');
}

function cmdMake(rest) {
  const [kind, dirArg, ...flags] = rest;
  if (!kind || !dirArg) {
    process.stderr.write('Usage: adopt-fixtures.cjs make <kind> <dir> [--home <abs home>]\n');
    process.exitCode = 1;
    return;
  }
  if (!FIXTURE_KINDS.includes(kind)) {
    process.stderr.write(`Error: unknown kind ${JSON.stringify(kind)}. Expected one of: ${FIXTURE_KINDS.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }

  const homeFlagIndex = flags.indexOf('--home');
  const homeArg = homeFlagIndex !== -1 ? flags[homeFlagIndex + 1] : null;

  const dir = path.resolve(dirArg);

  // Guard 1: the target dir must not already exist and be non-empty.
  if (dirExistsNonEmpty(dir)) {
    process.stderr.write(`Error: target dir exists and is non-empty: ${dir}\n`);
    process.exitCode = 1;
    return;
  }

  // Guard 2: the target's parent must not be inside an existing git work tree — a fixture can
  // never land inside a real repository. Uses gitEnv(home) only when --home was given; otherwise
  // the inherited environment (no fixture home exists yet at this point).
  const parent = path.dirname(dir);
  const checkEnv = homeArg ? gitEnv(path.resolve(homeArg)) : process.env;
  const check = spawnSync('git', ['-C', parent, 'rev-parse', '--is-inside-work-tree'], {
    env: checkEnv,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!check.error && check.status === 0 && check.stdout.trim() === 'true') {
    process.stderr.write(`Error: parent is inside an existing git work tree: ${parent}\n`);
    process.exitCode = 1;
    return;
  }

  // Both guards passed — now it's safe to create the parent (if missing) and the fixture.
  fs.mkdirSync(parent, { recursive: true });
  const home = homeArg ? path.resolve(homeArg) : makeFakeHome();
  const root = makeFixture(kind, { parent, home, name: path.basename(dir) });

  process.stdout.write(JSON.stringify({ root }) + '\n');
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'make') return cmdMake(rest);
  if (cmd === 'home') return cmdHome(rest);
  process.stderr.write(
    `Unknown command ${JSON.stringify(cmd)}. Usage: adopt-fixtures.cjs make <kind> <dir> [--home <abs>] | home <dir>\n`
  );
  process.exitCode = 1;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  FIXTURE_KINDS,
  makeFixture,
  writeMappedDocs,
  writeProjectMd,
  writeInferences,
  // Re-exported verbatim from upgrade-fixtures.cjs (objective 36) — never edited here.
  makeFakeHome,
  gitEnv,
  snapshot,
  diffSnapshots,
};
