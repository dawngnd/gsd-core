---
phase: 04-discuss-and-approve-change-spec
plan: 02
subsystem: cli
tags: [ndd, approval, gate, markdown]
requires:
  - phase: 04-plan-01
    provides: NDD discuss helper module and router branch
provides:
  - CHANGE-SPEC resolved section writer
  - Approval status dual-write helper
  - `ndd discuss-update` and `ndd discuss-check` subcommands
affects: [ndd, phase-05-planning-bridge]
tech-stack:
  added: []
  patterns: [dual-write approval state, CLI gate check]
key-files:
  created: []
  modified: [src/ndd-discuss-spec.cts, src/ndd-command-router.cts, commands/ndd/discuss-phase.md, gsd-core/bin/lib/ndd-discuss-spec.cjs, gsd-core/bin/lib/ndd-command-router.cjs]
key-decisions:
  - "Approval is dual-written to STATUS.json and CHANGE-SPEC.md frontmatter/body."
  - "`discuss-check` exposes the DISC-05 gate as structured JSON for Phase 5."
patterns-established:
  - "NDD approval helpers preserve STATUS.json fields while updating phase/status."
requirements-completed: [DISC-03, DISC-04, DISC-05]
coverage:
  - id: D1
    description: "CHANGE-SPEC can be updated with Resolved, Acceptance Criteria, and Scope sections while preserving original ambiguity/conflict/question text."
    requirement: DISC-03
    verification:
      - kind: unit
        ref: "tests/ndd-discuss-spec.test.cjs#writeResolvedSection"
        status: pass
    human_judgment: false
  - id: D2
    description: "Approval status is dual-written to STATUS.json and CHANGE-SPEC.md."
    requirement: DISC-04
    verification:
      - kind: unit
        ref: "tests/ndd-discuss-spec.test.cjs#updateApprovalStatus"
        status: pass
    human_judgment: false
  - id: D3
    description: "Critical unresolved ambiguities are exposed through a CLI-accessible gate check."
    requirement: DISC-05
    verification:
      - kind: integration
        ref: "tests/ndd-discuss-spec.test.cjs#DISC-05 gate: critical ambiguity blocks planning"
        status: pass
    human_judgment: false
duration: 0h
completed: 2026-07-08
status: complete
---

# Phase 04 Plan 02: Implement Spec Update and Approval State Transitions Summary

**Dual-write approval state and DISC-05 CLI gate for NDD planning**

## Performance

- **Duration:** 0h
- **Started:** 2026-07-08
- **Completed:** 2026-07-08
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `writeResolvedSection`, `updateApprovalStatus`, and `hasCriticalUnresolved` to the NDD discuss helper module.
- Added `ndd discuss-update <change-id> <status>` for approval state transitions.
- Added `ndd discuss-check <change-id>` for machine-readable approval and critical-ambiguity gate status.
- Updated the NDD discuss workflow to require explicit user approval and to call `discuss-update`/`discuss-check`.

## Task Commits

No git commits were created during this Codex run; changes remain in the working tree for user review.

## Files Created/Modified

- `src/ndd-discuss-spec.cts` - Added spec update, approval, and gate helpers.
- `src/ndd-command-router.cts` - Added `discuss-update` and `discuss-check`.
- `commands/ndd/discuss-phase.md` - Added explicit approval and gate-check process.
- `gsd-core/bin/lib/ndd-discuss-spec.cjs` - Compiled helper.
- `gsd-core/bin/lib/ndd-command-router.cjs` - Compiled router.

## Decisions Made

`discuss-check` reports both `approved` and `has_critical_unresolved` so Phase 5 can enforce approval and ambiguity gates independently.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 04-03 test coverage.

---
*Phase: 04-discuss-and-approve-change-spec*
*Completed: 2026-07-08*
