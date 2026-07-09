---
phase: 04-discuss-and-approve-change-spec
plan: 01
subsystem: cli
tags: [ndd, discuss, markdown, workflow]
requires:
  - phase: 03-impact-discovery
    provides: IMPACT.md structure and unknown-confidence discussion seeds
provides:
  - NDD discussion seed extraction helpers
  - `ndd discuss` router subcommand
  - `ndd:discuss-phase` workflow adapter
affects: [ndd, phase-05-planning-bridge]
tech-stack:
  added: []
  patterns: [structured NDD helper module, router JSON result]
key-files:
  created: [src/ndd-discuss-spec.cts, gsd-core/bin/lib/ndd-discuss-spec.cjs]
  modified: [src/ndd-command-router.cts, gsd-core/bin/lib/ndd-command-router.cjs, commands/ndd/discuss-phase.md]
key-decisions:
  - "Discussion seed parsing is deterministic TypeScript; creative questioning stays in the workflow prompt."
  - "Critical ambiguity severity is keyword-based and surfaced in structured CLI JSON."
patterns-established:
  - "NDD discuss helpers return ok/error structured results for router consumption."
requirements-completed: [DISC-01, DISC-02, DISC-03]
coverage:
  - id: D1
    description: "CHANGE-SPEC ambiguities, conflicts, and open questions are parsed into structured discussion seeds."
    requirement: DISC-01
    verification:
      - kind: unit
        ref: "tests/ndd-discuss-spec.test.cjs#extractAmbiguities"
        status: pass
    human_judgment: false
  - id: D2
    description: "`ndd discuss <change-id>` returns discussion seed JSON for workflow use."
    requirement: DISC-01
    verification:
      - kind: integration
        ref: "tests/ndd-discuss-spec.test.cjs#CLI integration: ndd discuss subcommands"
        status: pass
    human_judgment: false
  - id: D3
    description: "`ndd:discuss-phase` adapter presents critical ambiguities, conflicts, questions, and impact unknowns in order."
    requirement: DISC-02
    verification:
      - kind: other
        ref: "npx eslint src/ndd-discuss-spec.cts src/ndd-command-router.cts tests/ndd-discuss-spec.test.cjs"
        status: pass
    human_judgment: true
    rationale: "Workflow prompt sequencing still needs human review during conversational UAT."
duration: 0h
completed: 2026-07-08
status: complete
---

# Phase 04 Plan 01: Create NDD Discuss Workflow and Question Strategy Summary

**Structured NDD discussion seeds and CLI entrypoint for targeted clarification**

## Performance

- **Duration:** 0h
- **Started:** 2026-07-08T07:36:13Z
- **Completed:** 2026-07-08
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `src/ndd-discuss-spec.cts` with ambiguity/conflict/open-question extraction, severity classification, impact unknown extraction, and discussion context preparation.
- Extended `src/ndd-command-router.cts` with `ndd discuss <change-id>`.
- Replaced the placeholder `commands/ndd/discuss-phase.md` with a seed-driven NDD discussion adapter over GSD discuss patterns.

## Task Commits

No git commits were created during this Codex run; changes remain in the working tree for user review.

## Files Created/Modified

- `src/ndd-discuss-spec.cts` - Deterministic discussion seed helper module.
- `gsd-core/bin/lib/ndd-discuss-spec.cjs` - Compiled runtime helper.
- `src/ndd-command-router.cts` - Added discuss routing.
- `gsd-core/bin/lib/ndd-command-router.cjs` - Compiled router.
- `commands/ndd/discuss-phase.md` - Full NDD discuss workflow adapter.

## Decisions Made

Followed the phase context: deterministic parsing and state updates live in TypeScript, while interpretation and user-facing clarification remain prompt-driven.

## Deviations from Plan

The implementation uses normal exported TypeScript functions, matching the existing `ndd-impact-discovery.cts` style, instead of forcing an `export =` module shape.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 04-02 approval state transitions.

---
*Phase: 04-discuss-and-approve-change-spec*
*Completed: 2026-07-08*
