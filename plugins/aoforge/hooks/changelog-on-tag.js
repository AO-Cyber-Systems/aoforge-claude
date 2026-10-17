#!/usr/bin/env node
// DISPATCHED-BY: pre-bash.js — registered through hooks/pre-bash.js for PreToolUse(Bash); still runs standalone.

/**
 * AOForge Tag Gate (PreToolUse, Bash)
 *
 * Fires when Claude is about to run `git tag -a vX.Y.Z`. Enforces two invariants:
 *
 *   1. CHANGELOG.md has a heading for that version (`## [X.Y.Z]`).
 *   2. The three release manifests carry matching versions:
 *        - package.json
 *        - plugins/aoforge/.claude-plugin/plugin.json (the only plugin manifest read;
 *          a tree from before the objective 72 rename has none, so it is skipped)
 *        - .claude-plugin/marketplace.json (the plugin entry matching plugin.json `.name`)
 *
 * If CHANGELOG is missing the entry, denies and tells Claude to run
 * `aof-tools changelog update --version vX.Y.Z` first.
 *
 * If any manifest version disagrees with the tag, denies with a per-file
 * mismatch listing.
 *
 * Commit-ish awareness (quick task 15): when the gated command names a
 * commit-ish (`git tag -a vX.Y.Z <commit-ish>`, in either git-accepted
 * position), all four gated files are read from THAT COMMIT's tree via
 * `git show <commit-ish>:<path>` instead of the working tree — so
 * retroactively tagging a historical commit is judged against its own tree,
 * not whatever the working tree happens to be on right now. The commit-ish is
 * verified with `git rev-parse --verify <c>^{commit}` first; if it doesn't
 * resolve to a real commit, the hook silently falls back to today's
 * working-tree behavior (never denies or throws on a bad ref). No commit-ish
 * at all => working-tree behavior, structurally unchanged.
 *
 * Repos without a CHANGELOG.md (at the resolved tree) skip the changelog
 * check silently — and that return skips the manifest check too.
 * Repos missing any of the three manifests (at the resolved tree) skip the
 * version-sync check silently (so the hook stays a no-op for repos that
 * aren't this one).
 * Tags that do not match vMAJOR.MINOR.PATCH skip silently.
 *
 * Detection is invocation-aware (mirrors TRD 27-04's gate-commits.js fix):
 * heredoc bodies and quoted arguments are stripped (via the shared
 * stripHeredocs/stripQuoted helpers) before the tag-command regex runs, so a
 * command that merely MENTIONS a tag command inside quotes (e.g.
 * `echo "git tag -a v9.9.9 -m x"`) is not treated as an invocation.
 *
 * Escape hatch: AOFORGE_SKIP_CHANGELOG_GATE=1 (covers both checks, with or
 * without a commit-ish).
 *
 * Filename intentionally retained as `changelog-on-tag.js` for now; rename deferred.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { stripHeredocs, stripQuoted } = require('./gate-commits.js');
const { escapeRegExp } = require('../aoforge/bin/lib/text-escape.cjs');
const { NAMES } = require('../aoforge/bin/lib/legacy-names.cjs');

// The plugin manifest. Only the AOForge one (TRD 78-02): a tree from before the objective 72 rename has none, so the
// version-sync check skips it like any other repo without the three manifests.
const PLUGIN_MANIFEST = `plugins/${NAMES.slug}/.claude-plugin/plugin.json`;

// Flags that consume the NEXT token as their value (never a commit-ish candidate).
const VALUE_FLAGS = new Set(['-m', '--message', '-F', '--file', '-u', '--local-user']);
// Tokens that stop the positional scan (shell control-flow, not part of `git tag`).
const SEPARATORS = new Set(['&&', '||', ';', '|', ')']);

// Today's tag-matching regex, unchanged — applied to the CLEANED command (see parseTagCommand).
// Objective 77: also `<plugin>--vX.Y.Z`, the form Claude Code resolves plugin dependency ranges
// from. `aoforge--vX.Y.Z` is core's own release; any other prefix is a stack pack's release.
const TAG_RE = /\bgit\s+tag\s+(?:-a\s+)?(?:-m\s+\S+\s+)?((?:[a-z][a-z0-9-]*--)?v\d+\.\d+\.\d+)\b/;
const CORE_PLUGIN = 'aoforge';

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function findRepoRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function parseJsonSafe(text) {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Parses a (possibly heredoc/quote-laden) shell command string into the tag
 * being created and an optional commit-ish, if the command actually invokes
 * `git tag -a vX.Y.Z [...]`.
 *
 * Returns `{ tag, commitish }` (commitish may be null) or `null` when the
 * command does not invoke a tag command at all (including when the only
 * apparent invocation was inside a heredoc body or a quoted string).
 *
 * @param {string} cmd
 * @returns {{ tag: string, commitish: string|null } | null}
 */
function parseTagCommand(cmd) {
  const cleaned = stripQuoted(stripHeredocs(String(cmd || '')));
  const m = cleaned.match(TAG_RE);
  if (!m) return null;

  const tag = m[1];

  // Tokenize from the matched point onward so we can walk positionals after the tag.
  const tokens = cleaned.slice(m.index).split(/\s+/).filter(Boolean);
  // tokens[0..] look like: git tag -a v2.6.0 <rest...> — find the tag token, then walk after it.
  const tagIdx = tokens.indexOf(tag);
  let commitish = null;

  for (let i = tagIdx + 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (SEPARATORS.has(tok)) break;
    if (tok.startsWith('-')) {
      if (VALUE_FLAGS.has(tok)) i++; // skip the flag's value too
      continue;
    }
    // First non-flag, non-separator token after the tag is the commit-ish.
    commitish = tok;
    break;
  }

  return { tag, commitish };
}

/**
 * Verifies `commitish` resolves to a real commit. Returns the same string on
 * success, or null on any failure (bad ref, git missing, not a repo) — never
 * throws.
 *
 * @param {string} repoRoot
 * @param {string} commitish
 * @returns {string|null}
 */
function resolveCommit(repoRoot, commitish) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${commitish}^{commit}`], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return commitish;
  } catch {
    return null;
  }
}

/**
 * Builds a tree reader for the four gated files. With no commitish, reads the
 * working tree via `fs` (today's behavior, structurally unchanged). With a
 * resolved commitish, reads via `git show <commitish>:<path>` — absent paths
 * and any git failure return null, mirroring `fs.existsSync` false today.
 *
 * @param {string} repoRoot
 * @param {string|null} commitish
 * @returns {{ commitish: string|null, read: (rel: string) => string|null }}
 */
function makeTreeReader(repoRoot, commitish) {
  if (!commitish) {
    return {
      commitish: null,
      read: (rel) => {
        const p = path.join(repoRoot, rel);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
      },
    };
  }
  return {
    commitish,
    read: (rel) => {
      try {
        return execFileSync('git', ['show', `${commitish}:${rel}`], {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 32 * 1024 * 1024,
        });
      } catch {
        return null;
      }
    },
  };
}

/**
 * A stack pack's release tag `<pack>--vX.Y.Z` (objective 77): its own CHANGELOG (when it has one)
 * names the version, and its plugin.json and marketplace entry carry it. package.json is core's.
 */
function checkPackTag({ reader, tag, tagPlugin, version, at }) {
  const dir = `plugins/${tagPlugin}`;
  const plugin = parseJsonSafe(reader.read(`${dir}/.claude-plugin/plugin.json`));
  const market = parseJsonSafe(reader.read('.claude-plugin/marketplace.json'));
  if (!plugin || !market || !Array.isArray(market.plugins)) return; // not a plugin of this marketplace
  const changelog = reader.read(`${dir}/CHANGELOG.md`);
  if (changelog !== null && !new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm').test(changelog)) {
    deny([
      `${dir}/CHANGELOG.md has no entry for ${tag}${at}.`,
      `Add a \`## [${version}]\` section, commit it, then re-run the tag command.`,
      `Escape hatch: AOFORGE_SKIP_CHANGELOG_GATE=1`,
    ].join(' '));
  }
  const entry = market.plugins.find((p) => p && p.name === tagPlugin);
  const mismatches = [];
  if (plugin.version !== version) mismatches.push(`  ${dir}/.claude-plugin/plugin.json: ${plugin.version} (expected ${version})`);
  if (!entry) mismatches.push(`  .claude-plugin/marketplace.json: no entry named ${tagPlugin}`);
  else if (entry.version !== version) mismatches.push(`  .claude-plugin/marketplace.json [${tagPlugin}]: ${entry.version} (expected ${version})`);
  if (mismatches.length > 0) {
    deny([
      `Manifest versions out of sync for tag ${tag}${at}:`,
      ...mismatches,
      ``,
      `Update each file to ${version} and commit before tagging.`,
      `Escape hatch: AOFORGE_SKIP_CHANGELOG_GATE=1`,
    ].join('\n'));
  }
}

function main() {
  if (process.env.AOFORGE_SKIP_CHANGELOG_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  // `null`, an array or a string parses fine but is not a payload (TRD 63-05): exit 0 and say nothing.
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  const parsed = parseTagCommand(cmd);
  if (!parsed) return;

  const { tag } = parsed;
  const prefixMatch = tag.match(/^([a-z][a-z0-9-]*)--v/);
  const tagPlugin = prefixMatch ? prefixMatch[1] : null;
  const version = tag.replace(/^(?:[a-z][a-z0-9-]*--)?v/, '');
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) return;

  const commitish = parsed.commitish ? resolveCommit(repoRoot, parsed.commitish) : null;
  const reader = makeTreeReader(repoRoot, commitish);
  const at = commitish ? ` (at commit ${commitish})` : '';

  if (tagPlugin && tagPlugin !== CORE_PLUGIN) return checkPackTag({ reader, tag, tagPlugin, version, at });

  const content = reader.read('CHANGELOG.md');
  if (content === null) return; // No CHANGELOG at the resolved tree = nothing to gate (skips manifest check too)

  const versionRe = new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm');
  if (!versionRe.test(content)) {
    deny([
      `CHANGELOG.md has no entry for ${tag}${at}.`,
      `Run before tagging:`,
      // The bare version, not the tag: `--version aoforge--vX.Y.Z` would write `## [aoforge--vX.Y.Z]` (quick 34).
      `  node ~/.claude/aoforge/bin/aof-tools.cjs changelog update --version v${version}`,
      `Then commit the CHANGELOG update, then re-run the tag command.`,
      `Escape hatch: AOFORGE_SKIP_CHANGELOG_GATE=1`,
    ].join(' '));
  }

  // Manifest version-sync check.
  const pkg = parseJsonSafe(reader.read('package.json'));
  const plugin = parseJsonSafe(reader.read(PLUGIN_MANIFEST));
  const market = parseJsonSafe(reader.read('.claude-plugin/marketplace.json'));

  // Skip silently if any of the three are absent / unparseable — keeps hook a no-op for other repos.
  if (!pkg || !plugin || !market) return;
  if (!Array.isArray(market.plugins) || market.plugins.length === 0) return;

  const pluginName = plugin.name;
  const marketEntry =
    market.plugins.find((p) => p && p.name === pluginName) || market.plugins[0];

  const mismatches = [];
  if (pkg.version !== version) {
    mismatches.push(`  package.json: ${pkg.version} (expected ${version})`);
  }
  if (plugin.version !== version) {
    mismatches.push(`  ${PLUGIN_MANIFEST}: ${plugin.version} (expected ${version})`);
  }
  if (marketEntry && marketEntry.version !== version) {
    mismatches.push(`  .claude-plugin/marketplace.json [${marketEntry.name}]: ${marketEntry.version} (expected ${version})`);
  }

  if (mismatches.length > 0) {
    deny([
      `Manifest versions out of sync for tag ${tag}${at}:`,
      ...mismatches,
      ``,
      `Update each file to ${version} and commit before tagging.`,
      `Escape hatch: AOFORGE_SKIP_CHANGELOG_GATE=1`,
    ].join('\n'));
  }
}

if (require.main === module) main();

module.exports = {
  main,
  parseTagCommand,
  makeTreeReader,
  resolveCommit,
  PLUGIN_MANIFEST,
};
