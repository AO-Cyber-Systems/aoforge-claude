#!/usr/bin/env node

/**
 * coexistence-guard.js — SessionStart hook (objective 72, TRD 72-10, INST-05)
 *
 * When the pre-rename plugin is still installed and enabled beside AOForge, both plugins register their hooks and
 * the same gate can run twice. This hook queues ONE global notice per session naming the old plugin's version and
 * the exact disable command; route-results.js shows it on the next prompt. It never edits settings and never
 * uninstalls anything: it only tells the user.
 *
 * Detection is bin/lib/coexistence.cjs (installed_plugins.json plus enabledPlugins in the user settings).
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
 * Decide and, when the old plugin is enabled, queue the notice.
 *
 * @param {{env?: object, home?: string, payload?: object, detect?: Function, now?: Date}} [opts]
 * @returns {{status: 'skip'|'not-enabled'|'already-told'|'pending'|'queued'|'unwritable', notice?: object}}
 */
function run({ env = process.env, home = os.homedir(), payload = {}, detect, now = new Date() } = {}) {
  const { compat, coexistence, notices } = libs();
  compat.aliasLegacyEnv(env);
  if (env[SKIP_ENV] === '1') return { status: 'skip' };

  const result = (detect || coexistence.detectLegacyPlugin)({ userHome: home });
  const message = coexistence.coexistenceMessage(result);
  if (!message) return { status: 'not-enabled' };

  const file = notices.globalNoticesPath(home);
  const key = sessionKey(payload);
  const existing = notices.readNotices(file);
  if (existing.some((n) => n.key === key)) return { status: 'already-told' };
  if (existing.some((n) => n.consumed !== true && typeof n.key === 'string' && n.key.startsWith(KEY_PREFIX))) {
    return { status: 'pending' };
  }

  const notice = notices.appendNotice(
    file,
    { source: SOURCE, level: result.pointer ? 'info' : 'action', key, message },
    { now }
  );
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

module.exports = { run, sessionKey, SKIP_ENV, SOURCE, KEY_PREFIX };
