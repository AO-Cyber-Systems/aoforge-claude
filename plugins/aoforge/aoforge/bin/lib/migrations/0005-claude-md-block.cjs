'use strict';

// Migration 0005 — claude-md-block (TRD 36-04c, UPG-04 part c).
//
// Brings an EXISTING project CLAUDE.md AOFORGE block up to the corrected, versioned
// templates/claude-md.md. It never adds a block to a CLAUDE.md that has none.
//
// Ownership: the block's sections are synthesised per project by /aoforge:map-codebase from the
// codebase docs. Regenerating the whole block from the template would destroy them, so 0005 owns
// ONLY the AOForge-authored `# Development Rules` section. It replaces that one section by string
// slicing (inserting it as the first section when absent), restamps the start marker
// `v=<template_version> src=claude-md`, and routes the write through managed-block.upsert so every
// byte outside the block is preserved.

const fs = require('fs');
const path = require('path');
const managedBlock = require('../managed-block.cjs');

const CLAUDE_REL = 'CLAUDE.md';
const TEMPLATE_SRC = 'claude-md';
const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'templates', 'claude-md.md');

const RULES_HEADING_RE = /^# Development Rules[ \t]*\r?$/m;
const NEXT_H1_RE = /^# /m;

function normalizeSection(text) {
  return text.replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

/**
 * Locate the `# Development Rules` section inside `content`: from the heading up to (not
 * including) the next line starting `# `, or the end of the content.
 * @returns {null | {start:number, end:number}}
 */
function locateRules(content) {
  const h = RULES_HEADING_RE.exec(content);
  if (!h) return null;
  const afterHeading = h.index + h[0].length;
  const n = NEXT_H1_RE.exec(content.slice(afterHeading));
  return { start: h.index, end: n ? afterHeading + n.index : content.length };
}

/**
 * loadClaudeMdTemplate([templatePath]) -> {version, rules}
 *
 * `version` is the frontmatter `template_version`. `rules` is the `# Development Rules` section of
 * the first ```markdown fence under "## File Template", trailing blank lines trimmed.
 */
function loadClaudeMdTemplate(templatePath = TEMPLATE_PATH) {
  const text = fs.readFileSync(templatePath, 'utf-8').replace(/\r\n/g, '\n');

  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const vm = fm && /^template_version:[ \t]*["']?([^"'\s]+)["']?[ \t]*$/m.exec(fm[1]);
  if (!vm) throw new Error(`claude-md template has no template_version frontmatter (${templatePath})`);

  const ft = /^## File Template[ \t]*$/m.exec(text);
  if (!ft) throw new Error(`claude-md template has no "## File Template" section (${templatePath})`);
  const fence = /^```markdown[ \t]*\n([\s\S]*?)^```[ \t]*$/m.exec(text.slice(ft.index));
  if (!fence) throw new Error(`claude-md template has no \`\`\`markdown fence under "## File Template" (${templatePath})`);

  const body = fence[1];
  const loc = locateRules(body);
  if (!loc) throw new Error(`claude-md template File Template has no "# Development Rules" section (${templatePath})`);
  return { version: vm[1], rules: normalizeSection(body.slice(loc.start, loc.end)) };
}

/**
 * Replace the rules section in the block content with `rules` (followed by one blank line unless it
 * is the last section), or insert it as the first section when the content has none.
 */
function replaceRulesSection(content, rules) {
  const loc = locateRules(content);
  if (!loc) {
    const lead = /^(?:[ \t]*\r?\n)*/.exec(content)[0]; // keep any blank lines after START
    const rest = content.slice(lead.length);
    return lead + rules + (rest.length > 0 ? `\n\n${rest}` : '');
  }
  const atEnd = loc.end === content.length;
  return content.slice(0, loc.start) + rules + (atEnd ? '' : '\n\n') + content.slice(loc.end);
}

function readBlock(claudePath) {
  const text = fs.readFileSync(claudePath, 'utf-8');
  return { text, block: managedBlock.read(text) };
}

function detect(ctx) {
  const claudePath = path.join(ctx.projectRoot, CLAUDE_REL);
  if (!fs.existsSync(claudePath)) return { applies: false, reason: `no ${CLAUDE_REL}` };

  let block;
  try {
    ({ block } = readBlock(claudePath));
  } catch (e) {
    if (e instanceof managedBlock.ManagedBlockError) {
      return { applies: false, reason: `${CLAUDE_REL}: ${e.message}` };
    }
    throw e;
  }
  if (!block) {
    return { applies: false, reason: `no AOFORGE block in ${CLAUDE_REL} (0005 never adds one)` };
  }

  const tpl = loadClaudeMdTemplate();
  if (managedBlock.isStale(block, tpl.version)) {
    const why = block.meta.legacy || block.meta.v == null
      ? 'has a legacy unversioned marker'
      : `is v=${block.meta.v}`;
    return { applies: true, reason: `${CLAUDE_REL} AOFORGE block ${why}; template is v=${tpl.version}` };
  }
  if (managedBlock.compareVersions(block.meta.v, tpl.version) > 0) {
    return {
      applies: false,
      reason: `${CLAUDE_REL} AOFORGE block v=${block.meta.v} is newer than template v=${tpl.version}; not downgrading`,
    };
  }

  const loc = locateRules(block.content);
  if (!loc) {
    return { applies: true, reason: `${CLAUDE_REL} AOFORGE block is missing its # Development Rules section` };
  }
  if (normalizeSection(block.content.slice(loc.start, loc.end)) !== tpl.rules) {
    return { applies: true, reason: `${CLAUDE_REL} # Development Rules section differs from the template (drift)` };
  }
  return { applies: false, reason: `${CLAUDE_REL} AOFORGE block is current (v=${tpl.version})` };
}

function apply(ctx) {
  const claudePath = path.join(ctx.projectRoot, CLAUDE_REL);
  if (!fs.existsSync(claudePath)) return { changed: [], notes: { reason: `no ${CLAUDE_REL}` } };

  const { text, block } = readBlock(claudePath); // ManagedBlockError propagates: nothing is written
  if (!block) return { changed: [], notes: { reason: 'no AOFORGE block; 0005 never adds one' } };

  const tpl = loadClaudeMdTemplate();
  const content = replaceRulesSection(block.content, tpl.rules);
  const next = managedBlock.upsert(text, content, { v: tpl.version, src: TEMPLATE_SRC });
  if (!ctx.dryRun && next !== text) fs.writeFileSync(claudePath, next);

  return {
    changed: [CLAUDE_REL],
    notes: { from: block.meta.legacy ? 'legacy' : `v=${block.meta.v}`, to: `v=${tpl.version}` },
  };
}

module.exports = {
  id: '0005',
  title: 'Keep the project CLAUDE.md AOFORGE block current',
  since: '2.11.0',
  safety: 'auto',
  detect,
  apply,
  loadClaudeMdTemplate,
};
