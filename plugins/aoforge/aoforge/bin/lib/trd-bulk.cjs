'use strict';

// trd-bulk.cjs — the ONE measurement of a TRD's size and inline bulk (GWP-05).
//
// Shared by `verify trd-pre` (checks.trd_budget), the job-checker's Dimension 8 and,
// later, `plan put-trd`, so all three agree on what "too big" means:
//
//   - Budget (D-06): the length of the ENCODED issue body — `gh-trd.encodeTrdBody`,
//     two header lines plus the file — measured by `gh-trd.budget`: `ok` below
//     40,000, `warn` from 40,000 to 60,000, `over` above 60,000. Only `over` fails.
//   - Linked bulk (U-2): fenced blocks are listings that belong in the repo or the
//     wiki, linked from the TRD. A block over 8,000 content chars, or fenced content
//     over 40% of a TRD of 40,000+ encoded chars, is a WARNING — never a failure.
//
// Only fenced blocks are measured. Prose that says "inline fixtures" or "sample
// data" is a description, not bulk, and is never matched.
//
// This module does NOT read `github.store`: it reports both severities and the
// consumer picks (D-01 — only planning-mode reads the store flag).
//
// Pure: no fs, no child_process — requires only gh-trd.cjs.
// Length unit: JS `.length`, the same unit gh-trd measures in.

const ghTrd = require('./gh-trd.cjs');

// ─── Thresholds ───────────────────────────────────────────────────────────────

const BULK_BLOCK_MAX = 8000; // a block finding when content chars > this
const BULK_SHARE_MIN_CHARS = 40000; // the share is checked when encoded chars >= this
const BULK_SHARE_MAX = 0.40; // a share finding when fenced / encoded > this

const LINK_FIX = 'move the listing to the repo or wiki and link it; never trim prose to fit';
const SPLIT_FIX =
  'split it or move work to a follow-up TRD; move fixtures, sample data and long listings to the repo or wiki ' +
  'and link them; never trim prose to fit';

// The file-name grammar gh-hierarchy.parseTrdFile uses (`<objective>-<NN>[-<slug>]-TRD.md`), duplicated
// here so this module needs nothing but gh-trd. The prefix becomes the id; encodeTrdBody canonicalises it.
const TRD_FILE_RE = /^(\d+(?:\.\d+)?-\d+)(?:-(.*))?-TRD\.md$/;

// ─── Fenced blocks ────────────────────────────────────────────────────────────

// An opening fence: up to three spaces, then three or more backticks or tildes. Anything may follow (the
// info string). A closing fence is the same character, at least as long, alone on its line.
const OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

/**
 * fencedBlocks(text) — every fenced block, in order: `[{line, chars, fence, closed}]`.
 *
 * `line` is the 1-based line of the opening fence. `chars` is the content between the fence lines — the
 * content lines joined by `\n`, so neither fence line nor the newline before the closing fence counts.
 * `fence` is the opening marker (e.g. "```" or "~~~~"). An unclosed fence runs to end of text
 * (`closed:false`). A fence of the other character, or a shorter one, inside a block is content.
 */
function fencedBlocks(text) {
  if (typeof text !== 'string') {
    throw new TypeError(`fencedBlocks() needs a string, got ${text === null ? 'null' : typeof text}`);
  }
  const lines = ghTrd.normalise(text).split('\n');
  // A trailing newline ends the last line; it does not start an empty one.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const blocks = [];
  let open = null; // {line, fence, contentLines}
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (open === null) {
      const m = OPEN_RE.exec(ln);
      if (m) open = { line: i + 1, fence: m[1], contentLines: [] };
      continue;
    }
    const c = CLOSE_RE.exec(ln);
    if (c && c[1][0] === open.fence[0] && c[1].length >= open.fence.length) {
      blocks.push({ line: open.line, chars: open.contentLines.join('\n').length, fence: open.fence, closed: true });
      open = null;
      continue;
    }
    open.contentLines.push(ln);
  }
  if (open !== null) {
    blocks.push({ line: open.line, chars: open.contentLines.join('\n').length, fence: open.fence, closed: false });
  }
  return blocks;
}

/**
 * bulkFindings(text, encodedChars) — the U-2 warnings for a TRD text whose encoded body is
 * `encodedChars` long:
 *
 *   {kind:'block', line, chars, severity:'warning', message}               one per block > 8,000 chars
 *   {kind:'share', share, fenced, chars, severity:'warning', message}      fenced / encoded > 40% at >= 40,000
 *
 * Block findings come first, in text order; the share finding (at most one) last.
 */
function bulkFindings(text, encodedChars) {
  if (!Number.isFinite(encodedChars) || encodedChars < 0) {
    throw new TypeError(`bulkFindings() needs the encoded length, got ${encodedChars}`);
  }
  const blocks = fencedBlocks(text);
  const findings = [];
  for (const b of blocks) {
    if (b.chars > BULK_BLOCK_MAX) {
      findings.push({
        kind: 'block',
        line: b.line,
        chars: b.chars,
        severity: 'warning',
        message:
          `fenced block at line ${b.line} is ${fmt(b.chars)} chars (over ${fmt(BULK_BLOCK_MAX)}): ${LINK_FIX}`,
      });
    }
  }

  const fenced = blocks.reduce((sum, b) => sum + b.chars, 0);
  if (encodedChars >= BULK_SHARE_MIN_CHARS) {
    const share = fenced / encodedChars;
    if (share > BULK_SHARE_MAX) {
      const pct = (share * 100).toFixed(1);
      findings.push({
        kind: 'share',
        share,
        fenced,
        chars: encodedChars,
        severity: 'warning',
        message:
          `fenced blocks are ${pct}% of ${fmt(encodedChars)} encoded chars (over ${Math.round(BULK_SHARE_MAX * 100)}% ` +
          `at ${fmt(BULK_SHARE_MIN_CHARS)}+): ${LINK_FIX}`,
      });
    }
  }
  return findings;
}

// ─── checkTrd ─────────────────────────────────────────────────────────────────

/** The TRD id a file name carries (the `gh-hierarchy.parseTrdFile` prefix), or null. */
function idFromFile(file) {
  if (typeof file !== 'string') return null;
  const m = TRD_FILE_RE.exec(file);
  return m ? m[1] : null;
}

function canonicalTrdId(prefix) {
  const m = /^(\d+)((?:\.\d+)?)-(\d+)$/.exec(prefix);
  return m ? `${parseInt(m[1], 10)}${m[2]}-${m[3]}` : prefix;
}

/**
 * checkTrd({id?, file, text}) — size and bulk of one TRD.
 *
 * -> {trd, chars, status, bulk, passed, messages, note?}
 *
 * `chars`/`status` come from `gh-trd.budget` over `gh-trd.encodeTrdBody({id, file, text})`. `id` defaults to
 * the one the file name carries; when there is none, or the body cannot be encoded, `chars` falls back to
 * the raw `text.length` and `note` says why. `passed` is false only when `status` is `over`: bulk findings
 * are always warnings. `messages` lists the budget message (warn/over), the bulk messages and the note,
 * each naming its fix. `trd` is the given id, else the canonical id from the file name, else the file name.
 */
function checkTrd({ id, file, text } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError(`checkTrd() needs the TRD text, got ${text === null ? 'null' : typeof text}`);
  }
  const fromFile = idFromFile(file);
  const hasId = id !== undefined && id !== null && String(id) !== '';
  const encodeId = hasId ? String(id) : fromFile;
  const trd = hasId ? String(id) : fromFile !== null ? canonicalTrdId(fromFile) : String(file);

  let chars;
  let status;
  let note;
  if (encodeId === null) {
    note =
      `${file}: file name does not parse as <objective>-<NN>[-<slug>]-TRD.md; measured the raw text ` +
      '(the encoded body is a few dozen chars longer)';
  } else {
    try {
      ({ chars, status } = ghTrd.budget(ghTrd.encodeTrdBody({ id: encodeId, file, text })));
    } catch (err) {
      note = `${file}: cannot encode the TRD body (${err.message}); measured the raw text`;
    }
  }
  if (note !== undefined) {
    // Same thresholds gh-trd.budget applies, over the raw text.
    chars = text.length;
    status = chars > ghTrd.TRD_MAX_CHARS ? 'over' : chars >= ghTrd.TRD_TARGET_CHARS ? 'warn' : 'ok';
  }

  const bulk = bulkFindings(text, chars);
  const messages = [];
  if (status === 'over') {
    messages.push(
      `TRD ${trd} is ${fmt(chars)} encoded chars, over the ${fmt(ghTrd.TRD_MAX_CHARS)} ceiling: ${SPLIT_FIX}`,
    );
  } else if (status === 'warn') {
    messages.push(
      `TRD ${trd} is ${fmt(chars)} encoded chars, at or above the ${fmt(ghTrd.TRD_TARGET_CHARS)} target: ${SPLIT_FIX}`,
    );
  }
  for (const f of bulk) messages.push(f.message);
  if (note !== undefined) messages.push(note);

  const result = { trd, chars, status, bulk, passed: status !== 'over', messages };
  if (note !== undefined) result.note = note;
  return result;
}

module.exports = {
  BULK_BLOCK_MAX,
  BULK_SHARE_MAX,
  BULK_SHARE_MIN_CHARS,
  fencedBlocks,
  bulkFindings,
  checkTrd,
};
