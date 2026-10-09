'use strict';

// decision-repair (TRD 53-06, item 53-8): find and repair a resolved decision whose multi-line `resolution` was
// flattened by the pre-objective-52 frontmatter writer.
//
// Why the answer is usually still on disk: before 4ab2e30a the serializer wrote every string on ONE line, wrapped
// in `"..."` only when the value held `:` or `#` (or started with `[` / `{`), and it never escaped a newline. So a
// multi-line answer reached the file byte for byte. It is the PARSE that is lossy: `extractFrontmatter` reads only
// the first line, may take a continuation line for a key, and stops at an inner `---`, which loses `resolved_at`.
//
// `resolveDecision` (decision-queue.cjs) always writes `resolution` and then `resolved_at` last, so the lines from
// the `resolution:` line up to the `resolved_at:` line are the answer. Recovery is purely textual:
//
//   1. span   = the `resolution:` value plus the lines strictly before `resolved_at:`.
//   2. quoted = the value opens with `"` AND the last non-blank span line ends with `"`: drop both quotes
//               (a final line that is exactly `"` is dropped whole).
//   3. answer = span joined with LF, trimEnd. This is the same normalisation `resolveDecision` applies since 52-05.
//   4. rebuilt = the lines before `resolution:` + the serializer's block form of `resolution` + the lines from
//               `resolved_at:` on, unchanged.
//
// The rebuilt text is never returned unless it passes its own re-parse (`verify`): it must read back with
// `resolution === answer`, the original `resolved_at`, and an unchanged text after the frontmatter. Otherwise the file
// is `unrecoverable` and the caller reports it for a hand fix.
//
// Pure: strings in, strings out. No filesystem, no git, no environment. The doctor check (33-decision-resolution)
// owns every read, backup and write.

const { extractFrontmatter, reconstructFrontmatter } = require('./frontmatter.cjs');

// A value that is exactly a block-scalar indicator (`|`, `|-`, `|+`, `>`, `>-`, `>+`) opens a block: already 52-05 shape.
const BLOCK_INDICATOR_RE = /^[|>][+-]?$/;
const RESOLUTION_RE = /^resolution:\s?([\s\S]*)$/;
const RESOLVED_AT_RE = /^resolved_at:\s/;
// The parser's own frontmatter match (frontmatter.cjs extractFrontmatter). Used to find where the body starts.
const FRONTMATTER_RE = /^---\n([\s\S]+?)\n---/;

const noCr = (line) => line.replace(/\r$/, '');
const isBlank = (line) => line.trim() === '';

const intact = (reason) => ({ state: 'intact', reason });
const unrecoverable = (reason) => ({ state: 'unrecoverable', reason });

/**
 * Re-parse `rebuilt` with `parse` and compare. Returns null when it passes, else the reason it does not.
 * `parse` is a seam (default extractFrontmatter): AOForge's own parser round-trips every shape this module builds
 * (52-05), so the guard is exercised in tests with stub parsers.
 */
function verify(rebuilt, { answer, resolvedAt, body }, parse) {
  let fm;
  try {
    fm = parse(rebuilt);
  } catch (e) {
    return `the rebuilt file failed to parse: ${e && e.message ? e.message : String(e)}`;
  }
  if (!fm || typeof fm !== 'object' || fm.resolution !== answer) {
    return 'the rebuilt file does not re-parse to the recovered answer';
  }
  if (fm.resolved_at !== resolvedAt) return 'the rebuilt file loses or changes resolved_at';
  const match = rebuilt.match(FRONTMATTER_RE);
  if (!match || rebuilt.slice(match[0].length) !== body) return 'the text after the frontmatter would change';
  return null;
}

/**
 * Classify `text` and, when it is repairable, rebuild it. Returns one of
 *   { state: 'intact', reason }
 *   { state: 'unrecoverable', reason }
 *   { state: 'repairable', answer, rebuilt }     (rebuilt has already passed `verify`)
 */
function analyze(text, parse) {
  if (typeof text !== 'string') return unrecoverable('the decision file is not text');

  const lines = text.split('\n');
  if (noCr(lines[0]) !== '---') return intact('no frontmatter: not a flattened decision');

  // The writer's `resolution:` key sits before the first column-0 `---` (an inner `---` can only come after it).
  let resIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = noCr(lines[i]);
    if (line === '---') break;
    if (RESOLUTION_RE.test(line)) {
      resIdx = i;
      break;
    }
  }
  if (resIdx < 0) return intact('no resolution line in the frontmatter');

  const value = noCr(lines[resIdx]).match(RESOLUTION_RE)[1];
  if (BLOCK_INDICATOR_RE.test(value.trim())) return intact('resolution is already a block scalar');

  let atIdx = -1;
  for (let i = resIdx + 1; i < lines.length; i++) {
    if (RESOLVED_AT_RE.test(noCr(lines[i]))) {
      atIdx = i;
      break;
    }
  }
  if (atIdx < 0) {
    // Nothing bounds the answer. An opening quote that never closes is the writer's multi-line quoted shape, and
    // the file was re-serialized after it was mangled (its resolved_at went with the parse), so the tail is gone.
    if (value.startsWith('"') && !(value.length > 1 && value.endsWith('"'))) {
      return unrecoverable(
        'resolution opens a quote that never closes and no resolved_at line follows, so the end of the answer cannot be found'
      );
    }
    return intact('no resolved_at line to bound the answer, and resolution reads as one line');
  }

  const between = lines.slice(resIdx + 1, atIdx).map(noCr);
  // One line, with only blank lines before resolved_at (DECISION-002's trailing newline): nothing was flattened.
  if (between.every(isBlank)) return intact('resolution is a single line');

  const span = [value, ...between];
  let last = span.length - 1;
  while (last > 0 && isBlank(span[last])) last--;
  const quoted = value.startsWith('"') && span[last].trimEnd().endsWith('"');
  if (quoted) {
    span[0] = value.slice(1);
    if (span[last].trim() === '"') span.splice(last, 1);
    else span[last] = span[last].trimEnd().slice(0, -1);
  }
  const answer = span.join('\n').trimEnd();

  if (extractFrontmatter(text).resolution === answer) return intact('resolution already reads back as the full answer');

  const tail = lines.slice(atIdx).join('\n');
  const close = tail.indexOf('\n---');
  if (close < 0) return unrecoverable('no closing --- line follows resolved_at, so the frontmatter does not end');
  const body = tail.slice(close + 4);
  const resolvedAt = noCr(lines[atIdx])
    .replace(/^resolved_at:\s*/, '')
    .trim()
    .replace(/^["']|["']$/g, '');

  const block = reconstructFrontmatter({ resolution: answer }).split('\n');
  const rebuilt = [...lines.slice(0, resIdx), ...block, ...lines.slice(atIdx)].join('\n');

  const problem = verify(rebuilt, { answer, resolvedAt, body }, parse);
  if (problem) return unrecoverable(problem);
  return { state: 'repairable', answer, rebuilt };
}

/**
 * classifyDecision(text, { parse }?) -> { state: 'intact' | 'repairable' | 'unrecoverable', answer?, reason? }
 *
 * `repairable` carries the recovered `answer`; `intact` and `unrecoverable` carry a `reason`. A file is `repairable`
 * only when its rebuild passes the same re-parse verification repairDecision applies, so the two always agree.
 */
function classifyDecision(text, { parse = extractFrontmatter } = {}) {
  const a = analyze(text, parse);
  if (a.state === 'repairable') return { state: 'repairable', answer: a.answer };
  return { state: a.state, reason: a.reason };
}

/**
 * repairDecision(text, { parse }?) -> { ok: true, text, answer } | { ok: false, state, reason }
 *
 * `text` is the whole file with the `resolution` rewritten as the serializer's block scalar, `resolved_at` and every
 * other line untouched. A refusal returns no text.
 */
function repairDecision(text, { parse = extractFrontmatter } = {}) {
  const a = analyze(text, parse);
  if (a.state === 'repairable') return { ok: true, text: a.rebuilt, answer: a.answer };
  return {
    ok: false,
    state: a.state,
    reason: a.state === 'intact' ? `nothing to repair: ${a.reason}` : a.reason,
  };
}

module.exports = { classifyDecision, repairDecision };
