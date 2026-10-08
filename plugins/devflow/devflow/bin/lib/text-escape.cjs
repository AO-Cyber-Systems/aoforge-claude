'use strict';
// lib/text-escape.cjs — dependency-free escapes shared by lib modules and hooks (objective 54).
// objectiveNumPattern (leading-zero tolerant, objective 56) and boldLabelPattern build RegExp fragments for ROADMAP text.
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
 *
 * A numeric id matches with any number of leading zeros, so the directory's digits (`04`) find a ROADMAP heading
 * written `Objective 4:` and the reverse. Every caller places the pattern after `Objective\s+`, `\|\s*` or `^`,
 * so the `0*` cannot absorb a digit of a longer number (`4` still never matches `14`, `40` or `041`).
 * A non-numeric id stays a literal.
 */
function objectiveNumPattern(n) {
  const s = String(n);
  if (!/^\d/.test(s)) return `${escapeRegExp(s)}(?!\\.?\\d)`;
  return `0*${escapeRegExp(s.replace(/^0+(?=\d)/, ''))}(?!\\.?\\d)`;
}

/** A markdown bold label as a RegExp source fragment: `**Goal:**` and `**Goal**:` both match; the label is escaped. */
function boldLabelPattern(label) {
  return `\\*\\*${escapeRegExp(label)}(?::\\*\\*|\\*\\*:)`;
}

/** A GitHub-flavoured markdown table cell: backslash first, then pipe, then newlines -> space. */
function mdCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

module.exports = { escapeRegExp, objectiveNumPattern, boldLabelPattern, mdCell };
