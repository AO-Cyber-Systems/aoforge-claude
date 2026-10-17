# Go stack pack: assessment (2026-10-16)

**Verdict: do not build `aoforge-stack-go` now.** Revisit with dflang M1.

## What Go-specific content core carries today

| Content | Size | Nature | Could a pack own it? |
|---|---|---|---|
| Go examples in core agent prompts | ~0.5 KB | illustrative examples beside other languages | no gain: not procedure |
| `mcp__gopls__*` grants on core agents | — | tool grants | no: a pack cannot add grants to a core agent |
| `stack-mcp.cjs` writing the gopls server | — | written only because `go.md` names it | already profile-driven |
| classify/report/detect/draft rows (GO-*) | — | one row per language in shared tables | no: language-neutral data, same as Dart's rows |
| `stack-profiles/go.md` (bundled tier-2 profile) | 1 file | data | yes, but see cost |

Unlike Flutter (21% of the executor prompt, 30% of the verifier before objective 77), Go has no
resident procedure to remove. The neutrality guard leaves Go out of scope for this reason.

## Cost of a pack today

- Moving `go.md` breaks `extends: go` for every project without the pack installed: a compatibility
  shim or a bundled fallback would be needed for a release, which objective 77 chose not to do.
- A large test migration (stack-* tests use the bundled Go profile as their tier-2 fixture).
- No Go-only agent, verify command or doctor check exists yet to give the pack a body.

## When it becomes worth it

dflang M1 (`docs/PROPOSAL-stack-packs.md` §6.12) brings Go-specific executables: `dflang verify`,
aolint, a gopls daemon and a go-runtime-verifier agent. Those are pack material. Build the pack then,
moving `go.md` with a one-release bundled fallback. A minimal pack now (manifest + `go.md` only) is
possible but buys nothing over the bundled profile.
