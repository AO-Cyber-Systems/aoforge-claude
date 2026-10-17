#!/usr/bin/env node
'use strict';

/**
 * pre-bash.js — the PreToolUse(Bash) hooks in one process.
 *
 * Claude Code spawns one `node` per command hook and runs the hooks of an event in parallel, so every
 * Bash tool call used to start five processes (gate-commits, changelog-on-tag, gate-interactive,
 * gate-bash-writes, guard-no-progress), each ~50 ms of node startup on Linux and two to four times
 * that on macOS and Windows. The hooks themselves run in a few milliseconds. This dispatcher is the
 * one registration for the event: it reads stdin once and runs each hook's `main()` in this process
 * with the same stdin, then merges their outputs the way Claude Code merges parallel hooks:
 *
 *   exit 2 from any hook           -> exit 2, that hook's stderr (a block)
 *   permissionDecision deny > ask  -> one hookSpecificOutput carrying the strongest decision and
 *                                     every reason, plus every additionalContext
 *   plain stdout text              -> passed through
 *   stderr (warnings)              -> passed through
 *
 * Each dispatched hook stays a complete standalone script (its own tests spawn it directly) and
 * carries a `DISPATCHED-BY: pre-bash.js` header so doctor check 12 and the hook inventory know it is
 * registered through this file. A hook that throws is skipped (fail open), never the whole event.
 * guard-no-progress stays registered on the other tools itself; for Bash it runs here, so a Bash
 * call is counted once.
 */

const fs = require('fs');
const path = require('path');

/** The hooks this file runs, in order. Each exports `main()`; each reads stdin through fs.readFileSync(0). */
const DISPATCHED_HOOKS = [
  'gate-commits.js',
  'changelog-on-tag.js',
  'gate-interactive.js',
  'gate-bash-writes.js',
  'guard-no-progress.js',
];

const DECISION_RANK = { deny: 3, ask: 2, allow: 1 };

class HookExit extends Error {
  constructor(code) {
    super(`hook exit ${code}`);
    this.code = code;
  }
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

/**
 * Run one hook's main() in this process with `stdin` as its standard input.
 * -> {file, stdout, stderr, code, error?}
 */
function runHook(file, stdin, { dir = __dirname, loader = require } = {}) {
  const out = [];
  const err = [];
  let code = 0;
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;
  const origExit = process.exit;
  const origRead = fs.readFileSync;
  process.stdout.write = (chunk) => { out.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { err.push(String(chunk)); return true; };
  process.exit = (c) => { throw new HookExit(c === undefined ? 0 : c); };
  fs.readFileSync = function (p, ...rest) {
    if (p === 0) return stdin;
    return origRead.call(fs, p, ...rest);
  };
  let error = null;
  try {
    const mod = loader(path.join(dir, file));
    if (typeof mod.main !== 'function') throw new Error(`${file} does not export main()`);
    mod.main();
  } catch (e) {
    if (e instanceof HookExit) code = e.code;
    else error = e;
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.exit = origExit;
    fs.readFileSync = origRead;
  }
  return { file, stdout: out.join(''), stderr: err.join(''), code, error };
}

function parseJson(text) {
  const t = text.trim();
  if (!t.startsWith('{')) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** Merge the hooks' results into one process result. -> {stdout, stderr, code} */
function merge(results) {
  const blocking = results.filter((r) => r.code === 2);
  if (blocking.length) {
    return { stdout: '', stderr: blocking.map((r) => r.stderr.trim()).filter(Boolean).join('\n'), code: 2 };
  }
  let decision = null;
  const reasons = [];
  const contexts = [];
  const plain = [];
  const stderr = [];
  for (const r of results) {
    if (r.error) {
      stderr.push(`[aoforge] ${r.file} skipped: ${r.error.message}`);
      continue;
    }
    if (r.stderr.trim()) stderr.push(r.stderr.trim());
    if (!r.stdout.trim()) continue;
    const json = parseJson(r.stdout);
    if (!json) { plain.push(r.stdout.trim()); continue; }
    const h = json.hookSpecificOutput || {};
    const d = h.permissionDecision;
    if (d && DECISION_RANK[d]) {
      if (!decision || DECISION_RANK[d] > DECISION_RANK[decision]) {
        if (decision && decision !== d) reasons.length = 0; // a stronger decision replaces the weaker ones' reasons
        decision = d;
      }
      if (d === decision && h.permissionDecisionReason) reasons.push(String(h.permissionDecisionReason));
    }
    if (h.additionalContext) contexts.push(String(h.additionalContext));
    if (json.decision === 'block' && json.reason) {
      // Older top-level block form: treat as a deny.
      if (!decision || DECISION_RANK.deny > DECISION_RANK[decision]) { decision = 'deny'; reasons.length = 0; }
      reasons.push(String(json.reason));
    }
  }
  let stdout = '';
  if (decision || contexts.length) {
    const h = { hookEventName: 'PreToolUse' };
    if (decision) {
      h.permissionDecision = decision;
      if (reasons.length) h.permissionDecisionReason = reasons.join('\n\n');
    }
    if (contexts.length) h.additionalContext = contexts.join('\n\n');
    stdout = JSON.stringify({ hookSpecificOutput: h });
  } else if (plain.length) {
    stdout = plain.join('\n');
  }
  return { stdout, stderr: stderr.join('\n'), code: 0 };
}

function dispatch(stdin, opts) {
  const results = DISPATCHED_HOOKS.map((file) => runHook(file, stdin, opts));
  return merge(results);
}

function main() {
  let result;
  try {
    result = dispatch(readStdin());
  } catch (e) {
    process.stderr.write(`[aoforge] pre-bash dispatcher failed open: ${e.message}\n`);
    return;
  }
  if (result.stderr) process.stderr.write(result.stderr + '\n');
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.code) process.exit(result.code);
}

if (require.main === module) main();

module.exports = { DISPATCHED_HOOKS, runHook, merge, dispatch, main };
