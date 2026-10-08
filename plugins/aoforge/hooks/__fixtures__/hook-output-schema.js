'use strict';

/**
 * A small, cited model of the JSON a Stop or SubagentStop hook may print
 * (objective 70, TRD 70-02, TOOL-08).
 *
 * Claude Code validates the JSON a hook prints on exit 0 against a fixed schema, and
 * this file encodes that schema for the two "stop family" events so a test can pin a
 * hook's output shape. Every rule carries the sentence it implements. The source is
 * https://code.claude.com/docs/en/hooks (hooks reference, checked 2026-10-08): the
 * "Stop decision control", "SubagentStop" and "JSON output" (universal fields)
 * sections. If Claude Code changes a rule, the citation is what gets updated, and the
 * suite with it.
 *
 * The model is deliberately no more permissive and no stricter than the docs. It pins
 * Claude Code's schema, not a house style: `reason` without `decision` is legal here
 * because the docs do not forbid it.
 *
 * Why it exists: the pre-70 verify-commits.js printed
 *   {"hookSpecificOutput":{"hookEventName":"SubagentStop","decision":"block","reason":"..."}}
 * and the hook-coexistence contract accepted it because only `hookEventName` was
 * checked. The docs allow only `hookEventName` and `additionalContext` inside
 * `hookSpecificOutput`, so the block never took effect. This validator checks the keys
 * inside `hookSpecificOutput` too.
 *
 *   stopFamilyProblems(event, json) -> string[]   (empty means the output is valid)
 *
 * Not a test file: no `*.test.js` glob picks it up.
 */

/** The events whose decision control is the "Stop decision control" format. */
const STOP_FAMILY_EVENTS = ['Stop', 'SubagentStop'];

/**
 * "JSON output" universal fields, valid for every event:
 *   continue (boolean), stopReason (string), suppressOutput (boolean),
 *   systemMessage (string), terminalSequence (string).
 */
const UNIVERSAL_FIELDS = {
  continue: 'boolean',
  stopReason: 'string',
  suppressOutput: 'boolean',
  systemMessage: 'string',
  terminalSequence: 'string',
};

/**
 * "Stop decision control": the fields a Stop hook adds to the universal ones.
 *   "`decision` | `"block"` prevents Claude from stopping. Omit to allow Claude to stop"
 *   "`reason` | Required when `decision` is `"block"`"
 *   "`hookSpecificOutput.additionalContext` | Non-error feedback for Claude."
 * The PreToolUse note says the same about the top level: "Other events like PostToolUse
 * and Stop continue to use top-level `decision` and `reason` as their current format."
 *
 * SubagentStop: "SubagentStop hooks use the same decision control format as Stop hooks,
 * including `hookSpecificOutput.additionalContext` with `hookEventName` set to
 * `"SubagentStop"`."
 */
const STOP_FIELDS = ['decision', 'reason', 'hookSpecificOutput'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Check one hook's parsed JSON output against the Stop / SubagentStop schema.
 *
 * @param {'Stop'|'SubagentStop'} event
 * @param {*} json the parsed stdout of the hook
 * @returns {string[]} one message per problem; [] when the output is valid
 * @throws {Error} when `event` is not a stop-family event (this model covers only those)
 */
function stopFamilyProblems(event, json) {
  if (!STOP_FAMILY_EVENTS.includes(event)) {
    throw new Error(
      `stopFamilyProblems models ${STOP_FAMILY_EVENTS.join(' and ')} only (got ${JSON.stringify(event)})`
    );
  }
  if (!isPlainObject(json)) return ['output is not a JSON object'];

  const problems = [];

  // An object whose keys are not in the universal or Stop fields fails schema validation:
  // "a parsed object that fails schema validation is a non-blocking error: the action
  // proceeds, and the transcript shows a `<hook name> hook error` notice".
  for (const key of Object.keys(json)) {
    if (!(key in UNIVERSAL_FIELDS) && !STOP_FIELDS.includes(key)) {
      problems.push(`unknown top-level key "${key}"`);
    }
  }

  for (const [key, type] of Object.entries(UNIVERSAL_FIELDS)) {
    if (key in json && typeof json[key] !== type) problems.push(`${key} must be a ${type}`);
  }

  // "`decision` | `"block"` prevents Claude from stopping. Omit to allow Claude to stop":
  // block is the only value, and allowing is spelled by omitting the field.
  if ('decision' in json && json.decision !== 'block') {
    problems.push(`decision must be "block" (got ${JSON.stringify(json.decision)})`);
  }

  // "`reason` | Required when `decision` is `"block"`".
  if (json.decision === 'block' && !(typeof json.reason === 'string' && json.reason.length > 0)) {
    problems.push('reason is required when decision is "block"');
  }

  if ('hookSpecificOutput' in json) {
    const hso = json.hookSpecificOutput;
    if (!isPlainObject(hso)) {
      problems.push('hookSpecificOutput must be an object');
    } else {
      // `hookSpecificOutput` "requires a `hookEventName` field set to the event name."
      if (hso.hookEventName !== event) {
        problems.push(`hookSpecificOutput.hookEventName must be "${event}"`);
      }
      // Inside it a stop-family event allows only hookEventName and additionalContext;
      // decision and reason belong at the top level.
      for (const key of Object.keys(hso)) {
        if (key !== 'hookEventName' && key !== 'additionalContext') {
          problems.push(`hookSpecificOutput.${key} is not a ${event} field`);
        }
      }
      if ('additionalContext' in hso && typeof hso.additionalContext !== 'string') {
        problems.push('hookSpecificOutput.additionalContext must be a string');
      }
    }
  }

  return problems;
}

module.exports = {
  STOP_FAMILY_EVENTS,
  UNIVERSAL_FIELDS,
  STOP_FIELDS,
  stopFamilyProblems,
};
