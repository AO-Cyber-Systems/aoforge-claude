'use strict';

// planning-layout-detect.legacy.test.cjs — the 3.1 pre-rename detectors in planning-layout.cjs (objective 78,
// TRD 78-01, SC-3/SC-4). Module level: the detectors are called directly on hand-built fixtures from
// __fixtures__/legacy-layout-fixtures.cjs. Legacy names may be spelled here (`*.legacy.test.*`), but are built
// from LEGACY.
//
// Test list (TRD 78-01; the CLI cases 1-6 live in planning-layout.legacy.test.cjs and
// doctor-checks/27-legacy-planning-layout.legacy.test.cjs):
//
// CLI (`node aof-tools.cjs --cwd <root> ...`, scratch HOME):
//   1. Legacy-only project: `validate health --raw` -> status broken, an issue W066 whose message names the legacy
//      directory and whose fix names 3.0.x, `git mv` and the migration guide; no other check ran (no W003/E002
//      noise); `.aoforge/` was not created.
//   2. Both directories: `validate health --raw` -> W066 warning "both exist ... ignored"; status not broken by
//      W066 alone.
//   3. `.aoforge/config.json` with only the pre-rename stamp key -> W067 with fix "rename the key"; with both keys
//      -> W067 with fix "delete the pre-rename key"; with only `aoforge` -> no W067.
//   4. CLAUDE.md holding a START marker under LEGACY.blockTag ... END -> W069 warning; an AOFORGE block -> none;
//      no CLAUDE.md -> none.
//   5. `doctor --json` run inside a legacy-only project -> no project checks in the report, and a note equal to
//      `legacyLayoutMessage(root)`; run inside a subdirectory of it -> the same note (walk).
//   6. `doctor` in a both-layout / W067 / W069 project -> check 27 `warn` listing each code once; check 22 does
//      not repeat them; no finding names `--only 0012` or `--only 0013`.
//
// Module (this file):
//   7. isLegacyPlanning: legacy dir with a marker -> true; legacy dir empty or holding only unrelated files ->
//      false; a FILE named like the legacy dir -> false; both dirs -> false.
//   8. bothPlanningDirs: true only when both are directories.
//   9. findLegacyLayoutRoot: from a nested subdir of a legacy project -> the project root; from inside an
//      `.aoforge/` project nested under a legacy one -> null (the nearer real project wins); reaching $HOME (fake
//      home that itself holds a legacy layout) -> null; `home: ''` disables the stop.
//  10. legacyLayoutMessage(root) is a single line (no `\n`) containing the legacy directory with its slash,
//      `.aoforge`, `3.0.x`, `git mv` and `MIGRATING-TO-AOFORGE`.
//  11. hasLegacyBlockMarker(text): true for a START marker under the legacy tag (any attributes, CRLF too), false
//      for an AOFORGE marker, for the legacy tag in prose without the comment syntax, and for an END-only marker.
//      legacyBlockMessage('~/.claude/CLAUDE.md') names that label, both pre-rename markers, the AOFORGE tag and
//      `3.0.x`.
//  12. legacy-names: SHIM_RELEASE === '3.0.x'; existing assertions on NAMES/LEGACY unchanged
//      (legacy-names.legacy.test.cjs).
