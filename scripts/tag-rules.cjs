#!/usr/bin/env node
'use strict';

// tag-rules.cjs — which repository rulesets apply to a tag (quick 37). Read-only.
//
//   node scripts/tag-rules.cjs [--repo owner/name] [--json] <tag>...
//
// GitHub answers "which rules apply to this branch" (GET /repos/{owner}/{repo}/rules/branches/{branch})
// but has no such endpoint for a tag. So this lists the tag-target rulesets, inherited (organization)
// ones included:
//
//   gh api 'repos/<repo>/rulesets?targets=tag&includes_parents=true&per_page=100'
//
// reads each one with `gh api repos/<repo>/rulesets/<id>`, and matches its
// conditions.ref_name.include/exclude patterns against refs/tags/<tag> here. The patterns are fnmatch:
// `*` stops at `/`, `**` crosses it, `?` is one character, `~ALL` is every ref, and `~DEFAULT_BRANCH`
// is branch-only, so it never matches a tag. A ruleset applies when an include pattern matches and no
// exclude pattern does; a disabled ruleset is dropped, and an `evaluate` one is listed as such.
//
// Every call is a plain `gh api <path>` GET: no -X/--method, no -f/-F/--field/--raw-field/--input.
// Without --repo the path carries the literal {owner}/{repo}, which gh fills from the current checkout.
//
// bypass_actors comes back only when the caller can edit the ruleset, so it prints as `not visible`
// otherwise; current_user_can_bypass is always there. The GitHub Actions app (whose GITHUB_TOKEN
// pushes the release alias and the dry-run tag) usually appears as actor_type Integration, actor_id
// 15368. If its bypass is not visible here, check it in the ruleset UI.
//
// run takes `exec(cmd, args) -> { status, stdout, stderr }` and returns { code, stdout, stderr }. The
// CLI entry below is the only place that wires a real exec; the tests pass a fake. CommonJS, sync, no
// dependencies.

const { spawnSync } = require('child_process');

const USAGE = 'usage: node scripts/tag-rules.cjs [--repo owner/name] [--json] <tag>...';
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The anchored RegExp for one fnmatch pattern, matched against a whole ref (FNM_PATHNAME semantics). */
function patternRegex(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') { i++; re += '(?:.*/)?'; } else { re += '.*'; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '[') {
      const close = pattern.indexOf(']', i + 2);
      if (close === -1) { re += '\\['; continue; }
      let body = pattern.slice(i + 1, close);
      const negate = body[0] === '!' || body[0] === '^';
      if (negate) body = body.slice(1);
      re += `(?!/)[${negate ? '^' : ''}${body.replace(/[\\\]^]/g, '\\$&')}]`;
      i = close;
    } else {
      re += escapeRe(c);
    }
  }
  return new RegExp(`^${re}$`);
}

/** refMatches(ref, pattern) -> whether a ruleset ref_name pattern matches a full ref such as refs/tags/v3.1.0. */
function refMatches(ref, pattern) {
  if (pattern === '~ALL') return true;
  if (pattern === '~DEFAULT_BRANCH') return false;
  if (typeof pattern !== 'string' || typeof ref !== 'string') return false;
  return patternRegex(pattern).test(ref);
}

/**
 * matchingRulesets(tag, rulesets) -> the tag-target, non-disabled rulesets whose ref_name conditions
 * select refs/tags/<tag>, in input order, each as
 *   { id, name, source_type, source, enforcement, rules: [<type>...], current_user_can_bypass, bypass_actors }
 * bypass_actors is null when the API did not return it (the caller cannot edit that ruleset).
 */
function matchingRulesets(tag, rulesets) {
  const ref = `refs/tags/${tag}`;
  const hits = [];
  for (const rs of rulesets || []) {
    if (!rs || rs.target !== 'tag' || rs.enforcement === 'disabled') continue;
    const cond = (rs.conditions && rs.conditions.ref_name) || {};
    const include = Array.isArray(cond.include) ? cond.include : [];
    const exclude = Array.isArray(cond.exclude) ? cond.exclude : [];
    if (!include.some((p) => refMatches(ref, p))) continue;
    if (exclude.some((p) => refMatches(ref, p))) continue;
    hits.push({
      id: rs.id,
      name: rs.name,
      source_type: rs.source_type,
      source: rs.source,
      enforcement: rs.enforcement,
      rules: (Array.isArray(rs.rules) ? rs.rules : []).map((r) => r && r.type).filter(Boolean),
      current_user_can_bypass: rs.current_user_can_bypass === undefined ? null : rs.current_user_can_bypass,
      bypass_actors: Array.isArray(rs.bypass_actors) ? rs.bypass_actors : null,
    });
  }
  return hits;
}

function describeActors(actors) {
  if (actors === null) return 'not visible';
  if (!actors.length) return 'none';
  return actors.map((a) => `${a.actor_type} ${a.actor_id === null || a.actor_id === undefined ? '-' : a.actor_id} (${a.bypass_mode})`).join(', ');
}

function hitLine(h) {
  const rules = h.rules.length ? h.rules.join(', ') : 'no rules';
  return `${h.id} "${h.name}" (${h.source_type} ${h.source}, ${h.enforcement}): ${rules}; ` +
    `you can bypass: ${h.current_user_can_bypass === null ? 'unknown' : h.current_user_can_bypass}; ` +
    `bypass actors: ${describeActors(h.bypass_actors)}`;
}

const usage = (why) => ({ code: 1, stdout: '', stderr: `tag-rules: ${why}\n${USAGE}\n` });
const ghFailed = (what, r) => ({ code: 1, stdout: '', stderr: `tag-rules: gh api ${what} failed: ${((r && (r.stderr || r.stdout)) || '').trim()}\n` });

function parseJson(text, what) {
  try { return { value: JSON.parse(text) }; } catch (e) { return { error: `tag-rules: ${what} is not JSON: ${e.message}\n` }; }
}

/** run(argv, { exec }) -> { code, stdout, stderr }. Only ever calls `gh api <path>` (GET). */
function run(argv, { exec }) {
  let repo = '{owner}/{repo}';
  let json = false;
  const tags = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') {
      const value = argv[++i];
      if (!value || !REPO_RE.test(value)) return usage(`--repo needs owner/name, got ${JSON.stringify(value)}`);
      repo = value;
    } else if (a === '--json') {
      json = true;
    } else if (a === '-h' || a === '--help') {
      return { code: 0, stdout: `${USAGE}\n`, stderr: '' };
    } else if (a.startsWith('-')) {
      return usage(`unknown flag ${a}`);
    } else {
      tags.push(a);
    }
  }
  if (!tags.length) return usage('no tag given');

  const listPath = `repos/${repo}/rulesets?targets=tag&includes_parents=true&per_page=100`;
  const list = exec('gh', ['api', listPath]);
  if (list.status !== 0) return ghFailed(listPath, list);
  const parsed = parseJson(list.stdout, listPath);
  if (parsed.error) return { code: 1, stdout: '', stderr: parsed.error };
  if (!Array.isArray(parsed.value)) return { code: 1, stdout: '', stderr: `tag-rules: ${listPath} did not return a list\n` };

  const rulesets = [];
  for (const summary of parsed.value) {
    const id = summary && summary.id;
    if (!Number.isInteger(id)) return { code: 1, stdout: '', stderr: `tag-rules: a listed ruleset has no numeric id: ${JSON.stringify(summary)}\n` };
    const detailPath = `repos/${repo}/rulesets/${id}`;
    const detail = exec('gh', ['api', detailPath]);
    if (detail.status !== 0) return ghFailed(detailPath, detail);
    const one = parseJson(detail.stdout, detailPath);
    if (one.error) return { code: 1, stdout: '', stderr: one.error };
    rulesets.push(one.value);
  }

  const results = tags.map((tag) => ({ tag, ref: `refs/tags/${tag}`, rulesets: matchingRulesets(tag, rulesets) }));
  if (json) return { code: 0, stdout: `${JSON.stringify(results, null, 2)}\n`, stderr: '' };

  const lines = [`${rulesets.length} tag ruleset(s) read from ${repo} (inherited ones included)`];
  for (const r of results) {
    lines.push(`${r.tag} (${r.ref}):`);
    if (!r.rulesets.length) lines.push('  no tag ruleset matches');
    for (const h of r.rulesets) lines.push(`  ${hitLine(h)}`);
  }
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

function realExec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) return { status: 1, stdout: '', stderr: r.error.message };
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

if (require.main === module) {
  const r = run(process.argv.slice(2), { exec: realExec });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.code);
}

module.exports = { refMatches, matchingRulesets, run };
