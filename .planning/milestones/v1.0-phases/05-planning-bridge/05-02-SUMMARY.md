---
phase: 05-planning-bridge
plan: 02
subsystem: ndd-planning-bridge
tags: [ndd, planning, bridge, router, workflow, typescript, markdown]

requires:
  - phase: 05-planning-bridge
    plan: 01
    provides: Deterministic planning bridge helper (preparePlanningBridge, ensureChangeContext, renderPlannerBridgeContext, writePhaseLink).
provides:
  - NDD planning bridge CLI subcommands (plan, plan-context, plan-link) in the command router.
  - Executable ndd-plan-phase workflow adapter that gates, bridges, and links approved NDD changes to canonical GSD planning.
affects: [05-planning-bridge, ndd-plan-phase, ndd-command-router, phase-link, planner-context]

tech-stack:
  added: []
  patterns:
    - TypeScript router extensions compiled to CommonJS runtime artifact.
    - Thin Markdown workflow adapter referencing canonical GSD plan-phase without copying planner internals.

key-files:
  created:
    - commands/ndd/plan-phase.md
  modified:
    - src/ndd-command-router.cts
    - gsd-core/bin/lib/ndd-command-router.cjs

key-decisions:
  - "Router exposes three NDD planning subcommands: plan (gate + context), plan-context (phase-local bridge writer), plan-link (metadata recorder)."
  - "commands/ndd/plan-phase.md is an adapter workflow that delegates all planner logic to canonical gsd-plan-phase."
  - "Bridge context is written as NDD-BRIDGE-CONTEXT.md inside the target phase directory."

patterns-established:
  - "NDD workflow adapters reference canonical GSD workflows instead of copying planner internals."
  - "Phase-local bridge context file (NDD-BRIDGE-CONTEXT.md) is a deterministic planner input produced by the router."

requirements-completed: [PLAN-01, PLAN-02, PLAN-03, PLAN-04]

coverage:
  - id: D1
    description: "NDD planning bridge router subcommands validate CLI shape and call Phase 5 helper."
    requirement: PLAN-01
    verification:
      - kind: other
        ref: "npx tsc --project tsconfig.build.json"
        status: pass
      - kind: other
        ref: "npx eslint src/ndd-command-router.cts"
        status: pass
    human_judgment: false
  - id: D2
    description: "plan-context writes phase-local NDD bridge context consumed by canonical planner."
    requirement: PLAN-02
    verification:
      - kind: other
        ref: "npx tsc --project tsconfig.build.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "commands/ndd/plan-phase.md references canonical GSD plan-phase and source-grounding/plan-check conventions."
    requirement: PLAN-03
    verification:
      - kind: grep
        ref: "rg -n 'gsd-core/workflows/plan-phase.md|source-grounding|plan-check|phase-link' commands/ndd/plan-phase.md"
        status: pass
    human_judgment: false
  - id: D4
    description: "plan-link subcommand records phase-link.md with change id, phase id, plan files, and timestamp."
    requirement: PLAN-04
    verification:
      - kind: other
        ref: "npx tsc --project tsconfig.build.json"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-08
status: complete
---

# Phase 05 Plan 02: NDD Planning Bridge Router & Workflow Adapter

**NDD planning bridge CLI subcommands and executable plan-phase workflow adapter.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-08T09:40:00Z
- **Completed:** 2026-07-08T09:55:00Z
- **Tasks:** 2
- **Files modified:** 3 implementation files, 1 summary file

## Accomplishments

- Extended `src/ndd-command-router.cts` with three planning bridge subcommands:
  - `ndd plan <change-id> [phase-id]` — validates approval gate, critical ambiguity check, ensures/backfills change-folder CONTEXT.md, prepares bridge context.
  - `ndd plan-context <change-id> <phase-id>` — writes phase-local `NDD-BRIDGE-CONTEXT.md` into the target phase directory.
  - `ndd plan-link <change-id> <phase-id> <plan-files...>` — records phase-link metadata in `.planning/ndd/changes/<change-id>/phase-link.md`.
- Rewrote `commands/ndd/plan-phase.md` from placeholder to a complete executable adapter with 7 steps: parse arguments, gate the NDD bridge, resolve/create target GSD phase, write phase-local bridge context, invoke canonical `gsd-plan-phase`, verify produced plans, record phase-link metadata.
- Generated and committed `gsd-core/bin/lib/ndd-command-router.cjs` from the TypeScript build.

## Task Commits

1. **Task 1: Add NDD planning bridge router commands** — `5dfecbe5` (feat)
2. **Task 2: Replace placeholder ndd-plan-phase with GSD planning adapter workflow** — `7e827c65` (docs)

**Plan metadata:** skipped (`commit_docs: false` and `.planning/` is gitignored)

## Files Created/Modified

- `src/ndd-command-router.cts` — Extended with `plan`, `plan-context`, and `plan-link` subcommands calling Phase 5 helper.
- `gsd-core/bin/lib/ndd-command-router.cjs` — Generated CommonJS runtime artifact.
- `commands/ndd/plan-phase.md` — Complete NDD planning adapter workflow referencing canonical GSD plan-phase.
- `.planning/phases/05-planning-bridge/05-02-SUMMARY.md` — Local GSD execution summary.

## Decisions Made

- Router subcommands call `ndd-plan-bridge.cjs` helpers from 05-01 and validate CLI arity with `ERROR_REASON.USAGE`.
- `plan-phase.md` workflow references `.agents/gsd-core/workflows/plan-phase.md` and does not copy planner internals (PLAN-03).
- Bridge context is written as `NDD-BRIDGE-CONTEXT.md` inside the target phase directory using a deterministic filename.

## Deviations from Plan

None — plan executed as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope changes.

## Issues Encountered

- Previous execution session ended before SUMMARY.md was written. Closed out manually from commit inspection.

## Verification Results

```text
npx tsc --project tsconfig.build.json
Result: PASS
```

```text
npx eslint src/ndd-command-router.cts
Result: PASS
```

```text
rg -n 'gsd-core/workflows/plan-phase.md|source-grounding|plan-check|phase-link' commands/ndd/plan-phase.md
Result: PASS — references found for canonical plan-phase, source-grounding, plan-check, and phase-link
```

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None.

## Next Phase Readiness

Phase 05-03 can now write regression tests for the planning bridge helper, router commands, workflow invariants, and phase-link metadata.

## Self-Check: PASSED

- `src/ndd-command-router.cts` contains `plan`, `plan-context`, `plan-link` subcommands.
- `gsd-core/bin/lib/ndd-command-router.cjs` exists.
- `commands/ndd/plan-phase.md` contains complete adapter workflow.
- Commits `5dfecbe5` and `7e827c65` exist in git history.

---
*Phase: 05-planning-bridge*
*Completed: 2026-07-08*
