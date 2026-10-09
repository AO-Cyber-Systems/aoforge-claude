'use strict';

// Migration 0014 — claude-md-rebrand (objective 72, TRD 72-09, INST-04).
//
// Moves a project CLAUDE.md's managed block to the AOForge identity: the pre-rename START/END markers
// become AOFORGE markers (the v= and src= attributes are kept as written), and the pre-rename names in
// the block body (product name, slash namespace, CLI, runtime path, planning directory) become their
// AOForge forms. Both come from one call, legacy-rewrite.rewriteLegacyNames, over the block's bytes
// (START marker through END marker); the block is located with managed-block.read, which recognises
// both marker tags.
//
// Text outside the block is hand-written and is never touched, even where it names the old product.
// A CLAUDE.md with no block, or with a malformed one (two blocks, a START with no END), is left alone.
//
// Ordering: 0005 (Development Rules) and 0007 (stale command references) run first and may already
// have restamped the markers or mapped the slash commands; 0014's rewrite is idempotent over what they
// leave. This module spells no legacy name: every form comes from legacy-names.cjs.

const fs = require('fs');
const path = require('path');
const managedBlock = require('../managed-block.cjs');
const { rewriteLegacyNames, diffLines } = require('../legacy-rewrite.cjs');
const { NAMES } = require('../legacy-names.cjs');

const CLAUDE_REL = 'CLAUDE.md';

/**
 * plan(projectRoot) -> { applies:false, reason } | { applies:true, reason, claudePath, text, next, block }
 *
 * Reads only. `next` is the whole new file text: the bytes before and after the block are copied
 * unchanged, and the block bytes are rewritten.
 */
function plan(projectRoot) {
  const claudePath = path.join(projectRoot, CLAUDE_REL);
  if (!fs.existsSync(claudePath)) return { applies: false, reason: `no ${CLAUDE_REL}` };

  const text = fs.readFileSync(claudePath, 'utf-8');
  let block;
  try {
    block = managedBlock.read(text);
  } catch (e) {
    if (e instanceof managedBlock.ManagedBlockError) {
      return { applies: false, reason: `${CLAUDE_REL}: ${e.message}` };
    }
    throw e;
  }
  if (!block) return { applies: false, reason: `no managed block in ${CLAUDE_REL} (0014 never adds one)` };

  const region = text.slice(block.start, block.end);
  const nextRegion = rewriteLegacyNames(region);
  if (nextRegion === region) {
    return { applies: false, reason: `${CLAUDE_REL} block already uses the ${NAMES.product} markers and names` };
  }

  const next = text.slice(0, block.start) + nextRegion + text.slice(block.end);
  // The rewrite must leave one well-formed block under the current tag at the same place.
  const check = managedBlock.read(next);
  if (!check || check.tag !== NAMES.blockTag || check.start !== block.start) {
    throw new Error(`0014: rewriting the ${CLAUDE_REL} block did not leave one ${NAMES.blockTag} block; nothing written`);
  }

  const why = [];
  if (block.tag !== NAMES.blockTag) why.push(`uses the legacy ${block.tag} markers`);
  const changedLines = diffLines(block.content, check.content).filter((o) => o.op === '-').length;
  if (changedLines > 0) why.push(`names the old product on ${changedLines} line(s)`);
  if (why.length === 0) why.push('names the old product in its START marker');
  return {
    applies: true,
    reason: `${CLAUDE_REL} managed block ${why.join(' and ')}`,
    claudePath,
    text,
    next,
    block,
    changedLines,
  };
}

function detect(ctx) {
  const p = plan(ctx.projectRoot);
  return { applies: p.applies, reason: p.reason };
}

function apply(ctx) {
  const p = plan(ctx.projectRoot);
  if (!p.applies) return { changed: [], notes: { reason: p.reason } };
  if (!ctx.dryRun) fs.writeFileSync(p.claudePath, p.next);
  return {
    changed: [CLAUDE_REL],
    notes: {
      markers: p.block.tag === NAMES.blockTag ? 'unchanged' : `${p.block.tag} -> ${NAMES.blockTag}`,
      body_lines: p.changedLines,
    },
  };
}

module.exports = {
  id: '0014',
  title: `Move the project CLAUDE.md managed block to the ${NAMES.product} markers and names`,
  since: '3.0.0',
  safety: 'auto',
  detect,
  apply,
};
