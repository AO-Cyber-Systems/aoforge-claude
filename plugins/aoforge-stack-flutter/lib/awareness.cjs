'use strict';

// The Flutter pack's org-awareness hook (objective 77 follow-up): Dart packages in the shared library
// repo (eden-libs) contribute their exported symbols to `org-awareness` scans. Loaded by core
// lib/org-awareness.cjs through the manifest's `awareness` field. Moved from core unchanged.

const path = require('path');

const extensions = Object.freeze(['.dart']);

/**
 * entrypoints(root, fs) -> the .dart files under lib/ of a Dart package at `root` (a pubspec.yaml),
 * skipping generated files (*.g.dart, *.freezed.dart) and library-private files (leading _).
 */
function entrypoints(root, fs) {
  if (!fs.existsSync(path.join(root, 'pubspec.yaml'))) return [];
  const libDir = path.join(root, 'lib');
  if (!fs.existsSync(libDir)) return [];
  return walkDartLib(fs, libDir);
}

function walkDartLib(fs, libDir, out = [], depth = 0) {
  if (depth > 5) return out; // hard depth limit
  let entries;
  try {
    entries = fs.readdirSync(libDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
    const full = path.join(libDir, ent.name);
    if (ent.isDirectory()) {
      walkDartLib(fs, full, out, depth + 1);
    } else if (ent.isFile() && ent.name.endsWith('.dart') &&
               !ent.name.endsWith('.g.dart') &&
               !ent.name.endsWith('.freezed.dart')) {
      out.push(full);
    }
  }
  return out;
}

/** Exported (public) top-level names of a Dart source file. Best-effort regex parsing. */
function parseExports(source) {
  if (!source || typeof source !== 'string') return [];
  const names = new Set();
  let m;
  // Top-level class / enum / mixin / typedef / extension declarations. Same-line `class Foo {} class
  // Bar {}` is legal, so match anywhere after a word boundary. Library-private names start with `_`.
  const reType = /\b(?:abstract\s+|sealed\s+|final\s+|base\s+|interface\s+)*(?:class|enum|mixin|typedef|extension)\s+([A-Za-z_]\w*)/g;
  while ((m = reType.exec(source)) !== null) {
    if (!m[1].startsWith('_')) names.add(m[1]);
  }
  // Top-level final/const/var declarations (allow leading indent).
  const reVar = /^[ \t]*(?:final|const|var)\s+(?:[A-Za-z_]\w*(?:<[^>]+>)?\s+)?([a-z_]\w*)\s*=/gm;
  while ((m = reVar.exec(source)) !== null) {
    if (!m[1].startsWith('_')) names.add(m[1]);
  }
  // Top-level functions: `Type funcName(` at line start (best effort; constructors are tolerated).
  const reFunc = /^[ \t]*(?:[A-Za-z_]\w*(?:<[^>]+>)?\s+)+([a-z_]\w*)\s*\(/gm;
  while ((m = reFunc.exec(source)) !== null) {
    if (!m[1].startsWith('_')) names.add(m[1]);
  }
  return Array.from(names);
}

module.exports = { extensions, entrypoints, parseExports, walkDartLib };
