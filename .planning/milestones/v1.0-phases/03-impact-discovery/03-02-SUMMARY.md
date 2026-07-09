---
phase: 3
plan: 03-02
status: complete
completed: 2026-07-08T12:23:48+07:00
---

# Summary: Plan 03-02 — Impact Command Wiring and Orchestrator

## What was built

| File | Action | Description |
|------|--------|-------------|
| `src/ndd-command-router.cts` | Modified | Added `impact` subcommand dispatch alongside `change`, with argument validation and error handling |
| `src/ndd-impact-discovery.cts` | Modified | Added `runImpactDiscovery()` orchestrator function and expanded `ImpactDiscoveryResult` type with `codebase_map_available`, `codebase_map_files`, `capability_config` fields |
| `commands/ndd/impact.md` | Replaced | Full 8-step workflow prompt replacing placeholder — covers deterministic helper, tool availability reporting, missing map handling, wiki enrichment, CodeGraph analysis, LLM inspection, IMPACT.md writing |
| `gsd-core/bin/lib/ndd-command-router.cjs` | Rebuilt | Compiled output with impact routing |
| `gsd-core/bin/lib/ndd-impact-discovery.cjs` | Rebuilt | Compiled output with runImpactDiscovery |

## Key decisions

- **Router uses if-else chain** (not switch) to match existing code style and keep `change` branch variables scoped
- **`runImpactDiscovery` returns error objects** (not throws) — matches the discriminated union pattern from `resolveChangeWorkspace`
- **STATUS.json update preserves all existing fields** via spread operator: `{ ...status, phase: 'impact', artifacts, updated_at }`
- **ImpactDiscoveryResult extended** with `codebase_map_available`, `codebase_map_files`, and `capability_config` for the prompt workflow to consume
- **CHANGE-SPEC read failure is non-fatal** — proceeds with empty requirements array (workspace may be in early intake state)

## Verification

- `npx tsc --noEmit` — passes with 0 errors
- `npx tsc -p tsconfig.build.json` — builds successfully
- `gsd-core/bin/lib/ndd-command-router.cjs` exports `routeNddCommand` (function)
- `gsd-core/bin/lib/ndd-impact-discovery.cjs` exports `runImpactDiscovery` (function)
- `commands/ndd/impact.md` frontmatter preserved (`name: ndd:impact`, `argument-hint: "<change-id>"`, `effort: high`)
- `commands/ndd/impact.md` contains `<process>` (1), `map-codebase` (2), `codebase_map_available` (2)
