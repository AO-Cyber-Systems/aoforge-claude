'use strict';

/**
 * bash-write-cases.cjs — TRD 60-01
 *
 * Hand-built command cases shared by the Bash write detector (60-02), the edit
 * gate (60-03), the hook (60-04) and the transcript replay (60-05). One table,
 * so those four agree on what a write, a mention and a gated path are.
 *
 * Every command is a shape reduced by hand from a real agent command. Nothing
 * here is generated. The tests are pure (no filesystem): `cwd` and the project
 * root are both `/repo`, and a path is "tracked" only when it is listed in
 * TRACKED (relative to `/repo`) or is a directory listed in DIRS.
 *
 *   WRITE_CASES    commands that DO write. `writes` is what the detector must
 *                  report, in command order: { form, path }. `path` is absolute
 *                  with no trailing slash, or null when it cannot be resolved
 *                  statically. cp and mv writes also carry `sources` (absolute)
 *                  and `into` (true when `path` is a destination directory the
 *                  sources land in). Forms: redirect | tee | sed-i | perl-i | cp
 *                  | mv | python | node.
 *   MENTION_CASES  commands that only MENTION a write: heredoc bodies, quoted
 *                  arguments, comments, descriptor duplication, arithmetic. Every
 *                  one expects `writes: []`.
 *   PATH_CASES     the gate's view: of the paths a command writes, which are
 *                  `gated` and which pass, with the reason. Reasons:
 *                  unresolvable | outside-project | planning | markdown | untracked.
 *   TRACKED, DIRS  the fake index the PATH_CASES run against.
 *
 * Tables, case objects and the nested arrays are frozen.
 */

const CWD = '/repo';

/** Freeze a value and everything reachable from it. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const WRITE_CASES = deepFreeze([
  {
    name: 'w-redirect',
    cmd: 'echo hi > src/a.js',
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-append',
    cmd: "printf 'x\\n' >> src/a.js",
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-clobber',
    cmd: 'echo x >| src/a.js',
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-fd',
    cmd: 'node gen.js 1> src/out.js 2> err.log',
    cwd: CWD,
    writes: [
      { form: 'redirect', path: '/repo/src/out.js' },
      { form: 'redirect', path: '/repo/err.log' },
    ],
  },
  {
    name: 'w-both',
    cmd: 'make &> build.log',
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/build.log' }],
  },
  {
    name: 'w-attached',
    cmd: 'cat a.txt >src/a.js',
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-truncate',
    cmd: '> src/a.js',
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-heredoc-before',
    cmd: "cat > src/a.go <<'EOF'\npackage a\n// see > other.go\nEOF",
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.go' }],
  },
  {
    name: 'w-heredoc-after',
    cmd: "cat <<'EOF' > src/a.go\npackage a\nEOF",
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.go' }],
  },
  {
    name: 'w-tee',
    cmd: 'go run . | tee src/out.txt',
    cwd: CWD,
    writes: [{ form: 'tee', path: '/repo/src/out.txt' }],
  },
  {
    name: 'w-tee-multi',
    cmd: 'echo x | tee -a src/a.txt src/b.txt',
    cwd: CWD,
    writes: [
      { form: 'tee', path: '/repo/src/a.txt' },
      { form: 'tee', path: '/repo/src/b.txt' },
    ],
  },
  {
    name: 'w-sed-gnu',
    cmd: "sed -i 's/a/b/' src/a.js",
    cwd: CWD,
    writes: [{ form: 'sed-i', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-sed-mac',
    cmd: "sed -i '' 's/a/b/' src/a.js src/b.js",
    cwd: CWD,
    writes: [
      { form: 'sed-i', path: '/repo/src/a.js' },
      { form: 'sed-i', path: '/repo/src/b.js' },
    ],
  },
  {
    name: 'w-sed-suffix',
    cmd: "sed -i.bak -e 's/a/b/' src/a.js",
    cwd: CWD,
    writes: [{ form: 'sed-i', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-perl',
    cmd: "perl -pi -e 's/a/b/' src/a.go",
    cwd: CWD,
    writes: [{ form: 'perl-i', path: '/repo/src/a.go' }],
  },
  {
    name: 'w-cp',
    cmd: 'cp /tmp/a.go src/a.go',
    cwd: CWD,
    writes: [{ form: 'cp', path: '/repo/src/a.go', sources: ['/tmp/a.go'], into: false }],
  },
  {
    name: 'w-mv',
    cmd: 'mv src/new.go src/a.go',
    cwd: CWD,
    writes: [{ form: 'mv', path: '/repo/src/a.go', sources: ['/repo/src/new.go'], into: false }],
  },
  {
    name: 'w-cp-into',
    cmd: 'cp a.go b.go src/',
    cwd: CWD,
    writes: [{ form: 'cp', path: '/repo/src', sources: ['/repo/a.go', '/repo/b.go'], into: true }],
  },
  {
    name: 'w-cp-t',
    cmd: 'cp -t src a.go',
    cwd: CWD,
    writes: [{ form: 'cp', path: '/repo/src', sources: ['/repo/a.go'], into: true }],
  },
  {
    name: 'w-cd-rel',
    cmd: 'cd sub && echo x > a.js',
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/sub/a.js' }],
  },
  {
    name: 'w-cd-abs',
    cmd: "cd /other/repo; sed -i 's/a/b/' x.go",
    cwd: CWD,
    writes: [{ form: 'sed-i', path: '/other/repo/x.go' }],
  },
  {
    name: 'w-env-prefix',
    cmd: "FOO=1 sed -i 's/a/b/' src/a.js",
    cwd: CWD,
    writes: [{ form: 'sed-i', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-comment-line',
    cmd: '# regenerate\necho x > src/a.js',
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-sh-c',
    cmd: 'bash -c "echo x > src/a.js"',
    cwd: CWD,
    writes: [{ form: 'redirect', path: '/repo/src/a.js' }],
  },
  {
    name: 'w-unresolvable',
    cmd: 'echo x > "$OUT"',
    cwd: CWD,
    writes: [{ form: 'redirect', path: null }],
  },
  {
    name: 'w-py-c',
    cmd: 'python3 -c "open(\'src/a.py\',\'w\').write(\'x\')"',
    cwd: CWD,
    writes: [{ form: 'python', path: '/repo/src/a.py' }],
  },
  {
    name: 'w-py-heredoc-var',
    cmd: "python3 - <<'EOF'\np = \"src/a.py\"\ns = open(p).read()\nopen(p, \"w\").write(s)\nEOF",
    cwd: CWD,
    writes: [{ form: 'python', path: '/repo/src/a.py' }],
  },
  {
    name: 'w-py-pathlib',
    cmd: 'python3 -c "from pathlib import Path; Path(\'src/a.py\').write_text(\'x\')"',
    cwd: CWD,
    writes: [{ form: 'python', path: '/repo/src/a.py' }],
  },
  {
    name: 'w-py-mode-kw',
    cmd: 'python -c "open(\'src/a.py\', mode=\'a\').write(\'x\')"',
    cwd: CWD,
    writes: [{ form: 'python', path: '/repo/src/a.py' }],
  },
  {
    name: 'w-node-e',
    cmd: 'node -e "require(\'fs\').writeFileSync(\'src/a.json\', \'{}\')"',
    cwd: CWD,
    writes: [{ form: 'node', path: '/repo/src/a.json' }],
  },
  {
    name: 'w-node-heredoc-const',
    cmd: "node <<'EOF'\nconst f = 'src/a.json';\nrequire('fs').writeFileSync(f, '{}');\nEOF",
    cwd: CWD,
    writes: [{ form: 'node', path: '/repo/src/a.json' }],
  },
  {
    name: 'w-cd-then-py',
    cmd: "cd sub && python3 - <<'EOF'\nopen('a.py','w').write('x')\nEOF",
    cwd: CWD,
    writes: [{ form: 'python', path: '/repo/sub/a.py' }],
  },
]);

const MENTION_CASES = deepFreeze([
  {
    name: 'm-heredoc-body',
    cmd: "cat <<'EOF'\nsed -i 's/a/b/' src/a.js\necho x > src/a.js\nEOF",
    cwd: CWD,
  },
  {
    name: 'm-body-file',
    cmd: "gh issue create --title t --body-file - <<'EOF'\nRun: cp x src/a.js\nEOF",
    cwd: CWD,
  },
  { name: 'm-quoted-grep', cmd: 'grep -n "> src/a.js" notes.txt', cwd: CWD },
  { name: 'm-echo-stdout', cmd: 'echo "writing src/a.js"', cwd: CWD },
  { name: 'm-single-quoted', cmd: "echo 'cp x src/a.js; sed -i s/a/b/ src/a.js'", cwd: CWD },
  { name: 'm-fd-dup', cmd: 'npm test 2>&1 | tail -5', cwd: CWD },
  { name: 'm-dev-null', cmd: 'ls missing 2>/dev/null; echo x > /dev/stderr', cwd: CWD },
  { name: 'm-here-string', cmd: 'cat <<< "x > y"', cwd: CWD },
  { name: 'm-test-cmp', cmd: '[[ "$a" > "$b" ]] && echo yes', cwd: CWD },
  { name: 'm-arith', cmd: 'echo $(( 3 > 2 ))', cwd: CWD },
  { name: 'm-sed-print', cmd: "sed -n '1,5p' src/a.js", cwd: CWD },
  { name: 'm-py-read', cmd: 'python3 -c "print(open(\'src/a.py\').read())"', cwd: CWD },
  { name: 'm-py-script', cmd: 'python3 tools/gen.py --out src/a.py', cwd: CWD },
  {
    name: 'm-cat-heredoc-code',
    cmd: "cat <<EOF\nopen('src/a.py','w')\nEOF",
    cwd: CWD,
  },
  { name: 'm-comment', cmd: 'ls # then: echo x > src/a.js', cwd: CWD },
  { name: 'm-apostrophe-comment', cmd: "# don't touch src\nls src", cwd: CWD },
  { name: 'm-git-mv', cmd: 'git mv src/a.js src/b.js', cwd: CWD },
  { name: 'm-node-script', cmd: 'node scripts/build.js', cwd: CWD },
  { name: 'm-unbalanced', cmd: 'echo "unterminated > src/a.js', cwd: CWD },
  { name: 'm-awk', cmd: "awk '$1 > 5' data.txt", cwd: CWD },
  { name: 'm-jq', cmd: "jq '.a > 1' x.json", cwd: CWD },
  { name: 'm-proc-subst', cmd: 'diff <(sort a.txt) <(sort b.txt)', cwd: CWD },
]);

/** The fake index PATH_CASES run against, relative to /repo. */
const TRACKED = deepFreeze([
  'src/a.js',
  'src/a.go',
  'README.md',
  'docs/guide.md',
  '.aoforge/STATE.md',
]);

/** Directories that exist, so a cp or mv destination can be told from a file. */
const DIRS = deepFreeze(['/repo/src', '/repo/docs']);

const PATH_CASES = deepFreeze([
  {
    name: 'p-tracked',
    cmd: 'echo x > src/a.js',
    cwd: CWD,
    gated: ['/repo/src/a.js'],
    passed: [],
  },
  {
    name: 'p-planning',
    cmd: 'echo x > .aoforge/STATE.md',
    cwd: CWD,
    gated: [],
    passed: [{ path: '/repo/.aoforge/STATE.md', reason: 'planning' }],
  },
  {
    name: 'p-nested-planning',
    cmd: "sed -i 's/a/b/' flutter/.aoforge/x.json",
    cwd: CWD,
    gated: [],
    passed: [{ path: '/repo/flutter/.aoforge/x.json', reason: 'planning' }],
  },
  {
    name: 'p-markdown',
    cmd: 'echo x >> README.md',
    cwd: CWD,
    gated: [],
    passed: [{ path: '/repo/README.md', reason: 'markdown' }],
  },
  {
    name: 'p-untracked',
    cmd: 'echo x > src/new.js',
    cwd: CWD,
    gated: [],
    passed: [{ path: '/repo/src/new.js', reason: 'untracked' }],
  },
  {
    name: 'p-tmp',
    cmd: 'echo x > /tmp/scratch.txt',
    cwd: CWD,
    gated: [],
    passed: [{ path: '/tmp/scratch.txt', reason: 'outside-project' }],
  },
  {
    name: 'p-scratchpad',
    cmd: 'cp src/a.js /private/tmp/claude-501/s/scratchpad/a.js',
    cwd: CWD,
    gated: [],
    passed: [{ path: '/private/tmp/claude-501/s/scratchpad/a.js', reason: 'outside-project' }],
  },
  {
    name: 'p-other-repo',
    cmd: 'cd /other && echo x > a.js',
    cwd: CWD,
    gated: [],
    passed: [{ path: '/other/a.js', reason: 'outside-project' }],
  },
  {
    name: 'p-cp-into-tracked',
    cmd: 'cp /tmp/a.js src/',
    cwd: CWD,
    gated: ['/repo/src/a.js'],
    passed: [],
  },
  {
    name: 'p-cp-into-new',
    cmd: 'cp /tmp/new.js src/',
    cwd: CWD,
    gated: [],
    passed: [{ path: '/repo/src/new.js', reason: 'untracked' }],
  },
  {
    name: 'p-mv-dir-dest',
    cmd: 'mv /tmp/a.go src',
    cwd: CWD,
    gated: ['/repo/src/a.go'],
    passed: [],
  },
  {
    name: 'p-unresolvable',
    cmd: 'echo x > "$F"',
    cwd: CWD,
    gated: [],
    passed: [{ path: null, reason: 'unresolvable' }],
  },
  {
    name: 'p-mixed',
    cmd: 'echo x > README.md; echo y > src/a.js',
    cwd: CWD,
    gated: ['/repo/src/a.js'],
    passed: [{ path: '/repo/README.md', reason: 'markdown' }],
  },
  {
    name: 'p-sh-c-nested-quotes',
    cmd: 'bash -c "sed -i \'s/a/b/\' src/a.go"',
    cwd: CWD,
    gated: ['/repo/src/a.go'],
    passed: [],
  },
]);

module.exports = { WRITE_CASES, MENTION_CASES, PATH_CASES, TRACKED, DIRS };
