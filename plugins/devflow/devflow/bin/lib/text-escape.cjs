'use strict';
// lib/text-escape.cjs — dependency-free escapes shared by lib modules and hooks (objective 54).
//
// Requires nothing on purpose: hooks load this on every call, and helpers.cjs reads the model-profiles
// JSON at require time.

/** Escape every RegExp metacharacter so `s` matches literally. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * An objective number as a RegExp source fragment with a trailing boundary: `4.1` never matches
 * `4.10`, `4.1.2` or `401`, and `4` never matches `4.1` or `41`. A sentence-ending period is allowed.
 */
function objectiveNumPattern(n) {
  return `${escapeRegExp(n)}(?!\\.?\\d)`;
}

/** A GitHub-flavoured markdown table cell: backslash first, then pipe, then newlines -> space. */
function mdCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

module.exports = { escapeRegExp, objectiveNumPattern, mdCell };
