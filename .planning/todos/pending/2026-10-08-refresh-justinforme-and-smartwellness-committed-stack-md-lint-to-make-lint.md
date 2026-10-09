---
title: refresh justinforme and smartWellness committed STACK.md lint to make lint
area: stack-drafter
files: [plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs]
---

## Problem

The committed `.planning/STACK.md` in justinforme and smartWellness (reviewed 2026-09-29) carry no `lint` key, so they inherit the go tier default `go vet ./...`. Their Makefile `lint:` target runs `go vet ./...` and `buf lint`, and since objective 71 (TRD 71-01) the drafter writes `lint: make lint` for both. The fleet harness reports each as `OPEN, refresh pending (conflict): lint: committed go vet ./... vs draft make lint` (TRD 71-02).

## Solution

Refresh each repository's committed STACK.md so `lint` is `make lint`. That is a commit in each repo and needs the user's approval (43-ROLLOUT option (c)); nothing in the fleet is edited from this repo. After both land, remove the two OPEN `pending: 'refresh'` rows (justinforme `lint`, smartWellness `lint`) from `plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs`; the ratchet then fails each row with `remove it from OPEN` until it is gone, and the harness guards the files as matches.
