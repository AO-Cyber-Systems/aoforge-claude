#!/usr/bin/env node

/**
 * coexistence-guard.js — SessionStart hook (objective 72, TRD 72-10, INST-05; objective 78, TRD 78-06, SC-3/SC-4)
 *
 * Tells the user, once per session, about everything the rename left in their home that AOForge 3.1 no longer reads
 * or converts, each with its fix (bin/lib/coexistence.cjs legacyNotices):
 *   - the pre-rename plugin still enabled beside AOForge, so its hooks and gates may run twice (the disable command);
 *   - variables with the pre-rename env prefix, which are no longer read (each with its AOFORGE_* name);
 *   - the pre-rename runtime home present and never migrated by a 3.0.x session (the 3.0.x path or the manual copy);
 *   - files AOForge 3.0.0 wrote in ~/.aoforge/ (`aof-tools doctor --global --fix` moves them).
 * It queues ONE global notice: one finding is the message itself; several give a one-line message and one detail
 * line per finding. Level info only when the sole finding is the pointer plugin, else action. route-results.js shows
 * it on the next prompt. It only reports: it never edits settings, uninstalls, moves or migrates anything, and it
 * reads no value out of an old variable or directory.
 *
 * One per session: the notice key carries the session id. A later SessionStart of the same session (resume,
 * compact) queues nothing, even after the notice was read; a new session is told again, but never while an earlier
 * coexistence notice is still unread.
 *
 * Contract: stdout stays empty, exit 0 on every path, fail open (a diagnostic line on stderr at most). SessionStart
 * only, so there is no per-prompt nagging.
 * Escape: AOFORGE_SKIP_COEXISTENCE=1 (the legacy env prefix is aliased first, as in every hook).
 */

'use strict';

const fs = require('fs');
const os = require('os');
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

const SKIP_ENV = 'AOFORGE_SKIP_COEXISTENCE';
const SOURCE = 'coexistence-guard';
const KEY_PREFIX = 'coexistence:';

function libs() {
  return {
    compat: require('../aoforge/bin/lib/compat.cjs'),
    coexistence: require('../aoforge/bin/lib/coexistence.cjs'),
    notices: require('../aoforge/bin/lib/notices.cjs'),
  };
}

/** The session id from a SessionStart payload, else 'unknown' (a malformed payload is still told once). */
function sessionKey(payload) {
  const id = payload && typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : 'unknown';
  return KEY_PREFIX + id;
}

/**
 * The notice for a list of findings ({kind, level, text}), or null when there are none.
 *
 * @returns {{level: 'info'|'action', message: string, detail: string|null}|null}
 */
function noticeFor(found) {
  if (!Array.isArray(found) || found.length === 0) return null;
  const level = found.length === 1 && found[0].level === 'info' ? 'info' : 'action';
  if (found.length === 1) return { level, message: found[0].text, detail: null };
  return {
    level,
    message: `AOForge found ${found.length} leftovers from before 3.1 that it no longer reads; see below`,
    detail: found.map((f) => `- ${f.text}`).join('\n'),
  };
}

/**
 * Decide and, when anything is left over, queue the notice.
 *
 * @param {{env?: object, home?: string, payload?: object, detect?: Function, now?: Date}} [opts]  `detect` replaces
 *   the old-plugin detector (coexistence.detectLegacyPlugin)
 * @returns {{status: 'skip'|'nothing'|'already-told'|'pending'|'queued'|'unwritable', notice?: object}}
 */
function run({ env = process.env, home = os.homedir(), payload = {}, detect, now = new Date() } = {}) {
  const { compat, coexistence, notices } = libs();
  compat.aliasLegacyEnv(env);
  if (env[SKIP_ENV] === '1') return { status: 'skip' };

  const found = coexistence.legacyNotices({ env, userHome: home, detect });
  const composed = noticeFor(found);
  if (!composed) return { status: 'nothing' };

  const file = notices.globalNoticesPath(home);
  const key = sessionKey(payload);
  const existing = notices.readNotices(file);
  if (existing.some((n) => n.key === key)) return { status: 'already-told' };
  if (existing.some((n) => n.consumed !== true && typeof n.key === 'string' && n.key.startsWith(KEY_PREFIX))) {
    return { status: 'pending' };
  }

  const notice = notices.appendNotice(file, { source: SOURCE, key, ...composed }, { now });
  return notice ? { status: 'queued', notice } : { status: 'unwritable' };
}

function readPayload() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return {}; }
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

if (require.main === module) {
  try {
    run({ payload: readPayload() });
  } catch (err) {
    process.stderr.write(`[coexistence-guard] ${err && err.message ? err.message : err}\n`);
  }
}

module.exports = { run, noticeFor, sessionKey, SKIP_ENV, SOURCE, KEY_PREFIX };
