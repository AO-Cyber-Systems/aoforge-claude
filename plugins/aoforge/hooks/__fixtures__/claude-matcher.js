'use strict';

/**
 * Claude Code's documented rule for a hook group's `matcher` on TOOL events (quick 35).
 *
 * Source: https://code.claude.com/docs/en/hooks (hooks reference, "Matcher patterns", read 2026-10-16):
 *   - `"*"`, `""` or an omitted matcher matches every tool.
 *   - A matcher made only of letters, digits, `_`, `-`, spaces, `,` and `|` is a list of exact names
 *     (`Bash`, `Edit|Write`, `Edit, Write`): a tool fires the hook only when its name is in the list.
 *     `mcp__` therefore matches no MCP tool, and `Bash` does not match `BashOutput`.
 *   - Any other matcher is a JavaScript regular expression, tested UNANCHORED (`RegExp.prototype.test`):
 *     `mcp__.*` matches every MCP tool, `^Notebook` matches `NotebookEdit`.
 *
 * Tool events only (PreToolUse, PostToolUse, PermissionRequest and the like). FileChanged and StopFailure match
 * on a narrower set and are not modelled here. Tests use this helper instead of `new RegExp(matcher)` or an
 * anchored `^(?:…)$`, either of which disagrees with Claude Code on one half of the rule.
 *
 * Not a test file: no `*.test.js` glob picks it up.
 */

const EXACT_LIST = /^[A-Za-z0-9_\- ,|]+$/;

/** True when a hook group with `matcher` fires for a tool named `value`. */
function matcherFires(matcher, value) {
  if (matcher === undefined || matcher === null || matcher === '' || matcher === '*') return true;
  if (EXACT_LIST.test(matcher)) {
    return matcher.split(/[|,]/).map((s) => s.trim()).filter(Boolean).includes(value);
  }
  return new RegExp(matcher).test(value);
}

module.exports = { matcherFires };
