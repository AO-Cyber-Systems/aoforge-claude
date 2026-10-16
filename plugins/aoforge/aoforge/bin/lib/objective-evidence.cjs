'use strict';

// `aof-tools verify objective-evidence <objective>` (TRD 76-04): the verifier's mechanical evidence
// collection in one call. Per TRD it runs `verify artifacts` and `verify key-links` (the must_haves
// checks), reads the SUMMARY's Self-Check and key-files (and whether each still exists), and counts
// the TRD's commits; for the objective it adds `verify objective-completeness`. The verifier then
// spends its tokens on the judgment: do the truths hold, is the wiring real, what is a stub.
//
// Read-only. Composes the existing verbs as subprocesses (each `output()` exits), so their JSON
// is reported unchanged.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output, error, trdKey } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { findObjectiveInternal } = require('./objective.cjs');

const AOF_TOOLS = path.join(__dirname, '..', 'aof-tools.cjs');

function verb(cwd, argv) {
  const r = spawnSync(process.execPath, [AOF_TOOLS, '--cwd', cwd, ...argv], { encoding: 'utf-8' });
  try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || r.stdout || '').trim().slice(0, 400), exit: r.status }; }
}

function keyFiles(fm) {
  const v = fm['key-files'];
  const out = [];
  const add = (x) => { if (typeof x === 'string' && x.trim()) out.push(x.trim().replace(/^`|`$/g, '').split(/\s+[—-]\s+|:\s/)[0]); };
  if (Array.isArray(v)) v.forEach(add);
  else if (v && typeof v === 'object') Object.values(v).forEach((l) => (Array.isArray(l) ? l.forEach(add) : add(l)));
  return [...new Set(out)];
}

function commitCount(cwd, key) {
  const r = spawnSync('git', ['log', '--oneline', '--all', `--grep=(${key})`], { cwd, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean).length : null;
}

function evidence(cwd, objective) {
  const obj = findObjectiveInternal(cwd, objective);
  if (!obj || !obj.found) throw new Error(`objective ${objective} not found`);
  const dir = path.join(cwd, obj.directory);
  const files = fs.readdirSync(dir).sort();
  const trds = files.filter((f) => /-TRD\.md$/.test(f));
  const out = [];
  for (const trd of trds) {
    const key = trdKey(trd);
    const trdRel = path.join(obj.directory, trd);
    const summary = files.find((f) => /-SUMMARY\.md$/.test(f) && trdKey(f) === key);
    let summaryState = { exists: false };
    if (summary) {
      const text = fs.readFileSync(path.join(dir, summary), 'utf-8');
      const self = text.match(/^## Self-Check:\s*(PASSED|FAILED)/m);
      const kf = keyFiles(extractFrontmatter(text));
      summaryState = {
        exists: true,
        path: path.join(obj.directory, summary),
        self_check: self ? self[1] : null,
        key_files: kf.map((f) => ({ path: f, exists: fs.existsSync(path.join(cwd, f)) })),
      };
    }
    out.push({
      id: key,
      trd: trdRel,
      artifacts: verb(cwd, ['verify', 'artifacts', trdRel]),
      key_links: verb(cwd, ['verify', 'key-links', trdRel]),
      summary: summaryState,
      commits: commitCount(cwd, key),
    });
  }
  const completeness = verb(cwd, ['verify', 'objective-completeness', obj.objective_number]);
  const missingKeyFiles = out.flatMap((t) => (t.summary.key_files || []).filter((k) => !k.exists).map((k) => `${t.id}: ${k.path}`));
  return {
    objective: obj.objective_number,
    directory: obj.directory,
    trds: out,
    completeness,
    rollup: {
      trds: out.length,
      summaries: out.filter((t) => t.summary.exists).length,
      self_check_failed: out.filter((t) => t.summary.self_check === 'FAILED').map((t) => t.id),
      artifacts_failed: out.filter((t) => t.artifacts && t.artifacts.all_passed === false).map((t) => t.id),
      key_links_failed: out.filter((t) => t.key_links && t.key_links.all_verified === false).map((t) => t.id),
      no_commits: out.filter((t) => t.commits === 0).map((t) => t.id),
      missing_key_files: missingKeyFiles,
    },
  };
}

function cmdVerifyObjectiveEvidence(cwd, objective, raw) {
  if (!objective) error('objective required: aof-tools verify objective-evidence <objective>');
  let r;
  try { r = evidence(cwd, objective); } catch (e) { error(e.message); }
  const x = r.rollup;
  const text = [
    `Objective ${r.objective}: ${x.summaries}/${x.trds} TRDs have a SUMMARY`,
    ...['self_check_failed', 'artifacts_failed', 'key_links_failed', 'no_commits', 'missing_key_files']
      .filter((k) => x[k].length).map((k) => `${k}: ${x[k].join(', ')}`),
  ].join('\n');
  output(r, raw, text);
}

module.exports = { evidence, keyFiles, cmdVerifyObjectiveEvidence };
