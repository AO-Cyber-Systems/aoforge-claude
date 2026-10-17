'use strict';

// stack-pack-hints.cjs — which stack pack ships each pack-owned tier-2 profile (quick 34).
//
// DATA ONLY. Core carries no stack procedure (stack-neutrality.repo.test.cjs); this table only says
// where a profile id now lives, so a project whose STACK.md says `extends: <id>` and has no pack
// installed is told what to install instead of only "not found". It is consulted when a lookup has
// already failed (stack-profile.cjs unresolvedMessage), never to resolve a profile.
//
// stack-packs.test.cjs keeps it exact: every profile an in-repo pack (plugins/aoforge-stack-*)
// ships maps to that pack here, every entry names a pack that ships it, and the hint's
// `@<marketplace>` is the marketplace.json name.

const MARKETPLACE = 'aocyber';

const PACK_PROFILES = Object.freeze({
  flutter: 'aoforge-stack-flutter',
  dart: 'aoforge-stack-flutter',
});

/** packInstallHint(id) -> the install sentence for a pack-owned profile id, or null. */
function packInstallHint(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(PACK_PROFILES, id)) return null;
  const plugin = PACK_PROFILES[id];
  return `the '${id}' profile ships in the ${plugin} stack pack: install it with /plugin install ${plugin}@${MARKETPLACE}`;
}

module.exports = { PACK_PROFILES, packInstallHint };
