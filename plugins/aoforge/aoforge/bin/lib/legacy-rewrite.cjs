'use strict';

/**
 * legacy-rewrite.cjs — rewrite the pre-rename names in free text to their AOForge forms (objective 72,
 * TRD 72-09, INST-04), and show the change as a unified diff.
 *
 *   rewriteLegacyNames(text) -> text with every LEGACY/NAMES pair mapped
 *   hasLegacyNames(text)     -> true when rewriteLegacyNames would change it
 *   diffLines(a, b)          -> [{ op: ' ' | '-' | '+', line }], one entry per line (LCS)
 *   unifiedDiff(a, b, opts)  -> a `---`/`+++`/`@@` unified diff, '' when a === b
 *
 * Used by migration 0014 (a project CLAUDE.md managed block) and by global-upgrade.cjs (the proposal for
 * hand-written text outside the global block, which is only ever written on confirmation).
 *
 * How the rewrite runs:
 *   1. Every PRESERVE token (other products and a domain that contain the legacy slug) is masked,
 *      case-insensitively, as the rename codemod masks them.
 *   2. The article before a renamed name becomes "an" (the new names start with a vowel sound).
 *   3. The pairs run longest legacy form first, so a specific form is mapped before a shorter one it
 *      contains. The pairs are every key NAMES and LEGACY share, plus the capitalised slug and the
 *      upper-case CLI (case forms the codemod also maps). The planning directory is mapped only where it
 *      is a directory: not after an identifier character (member access) and not before one (a longer
 *      identifier).
 *   4. The masked tokens are restored.
 *
 * No legacy name is spelled here: every form comes from legacy-names.cjs. Dependencies: ./legacy-names.cjs
 * and ./text-escape.cjs only, neither of which requires anything (sync-runtime's test copies the
 * global-upgrade closure into a fake plugin root).
 */

const { NAMES, LEGACY, PRESERVE } = require('./legacy-names.cjs');
const { escapeRegExp: escapeRe } = require('./text-escape.cjs');

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const IDENT_CHAR = 'A-Za-z0-9_$';

/** [{ id, from, to }], deduplicated on `from`, longest `from` first. */
function buildPairs() {
  const raw = [];
  for (const key of Object.keys(NAMES)) {
    if (Object.prototype.hasOwnProperty.call(LEGACY, key)) raw.push({ id: key, from: LEGACY[key], to: NAMES[key] });
  }
  raw.push({ id: 'slugCapitalised', from: capitalise(LEGACY.slug), to: capitalise(NAMES.slug) });
  raw.push({ id: 'cliUpper', from: LEGACY.cli.toUpperCase(), to: NAMES.cli.toUpperCase() });

  const byFrom = new Map();
  for (const p of raw) {
    const seen = byFrom.get(p.from);
    if (seen && seen.to !== p.to) {
      throw new Error(`legacy-rewrite: ${p.id} and ${seen.id} map ${JSON.stringify(p.from)} to different names`);
    }
    if (!seen) byFrom.set(p.from, p);
  }
  return [...byFrom.values()].sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from));
}

const PAIRS = buildPairs();

/** One global regex per pair; the planning directory is bounded on both sides. */
const RULES = PAIRS.map((p) => {
  const body = escapeRe(p.from);
  const re = p.id === 'planningDir'
    ? new RegExp(`(?<![${IDENT_CHAR}])${body}(?![${IDENT_CHAR}])`, 'g')
    : new RegExp(body, 'g');
  return { ...p, re };
});

/** "a <legacy name>" -> "an <legacy name>" before the names whose new form starts with a vowel. */
const ARTICLE_FORMS = [LEGACY.product, capitalise(LEGACY.slug), LEGACY.upper, LEGACY.slug, LEGACY.cli, LEGACY.cli.toUpperCase()];
const ARTICLE_RE = new RegExp(`\\b([Aa]) (?=[\`*_"'(]{0,2}(?:${ARTICLE_FORMS.map(escapeRe).join('|')}))`, 'g');

/** Case-insensitive alternation of the PRESERVE tokens, longest first. */
const PRESERVE_RE = new RegExp(
  [...new Set(PRESERVE.map((t) => t.toLowerCase()))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|'),
  'gi',
);

// A NUL never occurs in CLAUDE.md text; the index makes each placeholder unique.
const PLACEHOLDER_RE = /\u0000P(\d+)\u0000/g;

/**
 * rewriteLegacyNames(text) -> text with every legacy name mapped to its AOForge form. Bytes that hold no
 * legacy name (line endings, whitespace, PRESERVE tokens) are unchanged.
 */
function rewriteLegacyNames(text) {
  if (typeof text !== 'string') throw new TypeError('rewriteLegacyNames: text must be a string');
  const saved = [];
  let out = text.replace(PRESERVE_RE, (m) => `\u0000P${saved.push(m) - 1}\u0000`);
  out = out.replace(ARTICLE_RE, (_, a) => `${a}n `);
  for (const rule of RULES) out = out.replace(rule.re, rule.to);
  return out.replace(PLACEHOLDER_RE, (_, i) => saved[Number(i)]);
}

/** True when `text` holds a legacy name that rewriteLegacyNames would map. */
function hasLegacyNames(text) {
  return rewriteLegacyNames(text) !== text;
}

// ─── diff ─────────────────────────────────────────────────────────────────────

const splitLines = (s) => (s === '' ? [] : s.split('\n'));

/**
 * diffLines(a, b) -> [{ op, line }] where op is ' ' (both), '-' (only a) or '+' (only b). A longest
 * common subsequence over the lines between the common prefix and suffix; a removal is listed before the
 * addition that replaces it. Lines are split on '\n' only, so a '\r' stays part of its line.
 */
function diffLines(a, b) {
  const x = splitLines(String(a));
  const y = splitLines(String(b));
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;

  const xm = x.slice(pre, x.length - suf);
  const ym = y.slice(pre, y.length - suf);
  const n = xm.length;
  const m = ym.length;
  // lcs[i][j] = LCS length of xm[i..] and ym[j..]
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = xm[i] === ym[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops = x.slice(0, pre).map((line) => ({ op: ' ', line }));
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && xm[i] === ym[j]) {
      ops.push({ op: ' ', line: xm[i] });
      i++;
      j++;
    } else if (i < n && (j >= m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      ops.push({ op: '-', line: xm[i] });
      i++;
    } else {
      ops.push({ op: '+', line: ym[j] });
      j++;
    }
  }
  for (const line of x.slice(x.length - suf)) ops.push({ op: ' ', line });
  return ops;
}

/**
 * unifiedDiff(a, b, { fromFile = 'a', toFile = 'b', context = 3 }) -> unified diff text, '' when the
 * texts are equal. Hunks carry `context` unchanged lines on each side; nearby hunks merge.
 */
function unifiedDiff(a, b, { fromFile = 'a', toFile = 'b', context = 3 } = {}) {
  if (a === b) return '';
  const ops = diffLines(a, b);
  const changed = ops.map((o, k) => (o.op === ' ' ? -1 : k)).filter((k) => k >= 0);
  if (changed.length === 0) return '';

  // Group changed op indexes into hunks [lo, hi] (inclusive) with context.
  const hunks = [];
  for (const k of changed) {
    const lo = Math.max(0, k - context);
    const hi = Math.min(ops.length - 1, k + context);
    const last = hunks[hunks.length - 1];
    if (last && lo <= last.hi + 1) last.hi = Math.max(last.hi, hi);
    else hunks.push({ lo, hi });
  }

  // Line numbers (1-based) in a and b at each op index.
  const aAt = [];
  const bAt = [];
  let an = 1;
  let bn = 1;
  for (const o of ops) {
    aAt.push(an);
    bAt.push(bn);
    if (o.op !== '+') an++;
    if (o.op !== '-') bn++;
  }

  const out = [`--- ${fromFile}`, `+++ ${toFile}`];
  for (const h of hunks) {
    const slice = ops.slice(h.lo, h.hi + 1);
    const aLen = slice.filter((o) => o.op !== '+').length;
    const bLen = slice.filter((o) => o.op !== '-').length;
    const aStart = aLen === 0 ? aAt[h.lo] - 1 : aAt[h.lo];
    const bStart = bLen === 0 ? bAt[h.lo] - 1 : bAt[h.lo];
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const o of slice) out.push(`${o.op}${o.line}`);
  }
  return out.join('\n');
}

module.exports = {
  rewriteLegacyNames,
  hasLegacyNames,
  diffLines,
  unifiedDiff,
  PAIRS,
};
