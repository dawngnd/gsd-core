---
phase: 02-change-intake-and-spec-drafting
plan: 01
subsystem: ndd-intake
tags: [ndd, change-intake, filesystem, deterministic-id, status-json]
requires:
  - phase: 01
    provides: NDD namespace surface and command/skill scaffolding
provides:
  - Safe NDD change-id validation and workspace path resolution
  - Deterministic generated change ids from source folder identity and Markdown file set
  - STATUS.json create/resume helper for `.planning/ndd/changes/<change-id>/`
affects: [ndd-change, phase-2, intake, source-manifest, change-spec]
tech-stack:
  added: []
  patterns:
    - TypeScript `.cts` source emitted to CommonJS `.cjs` via `npm run build:lib`
    - Structured validation result objects for unsafe user-supplied ids
key-files:
  created:
    - src/ndd-change-intake.cts
    - gsd-core/bin/lib/ndd-change-intake.cjs
    - tests/ndd-change-intake.test.cjs
  modified: []
key-decisions:
  - "Explicit NDD change ids are not normalized; unsafe ids return structured errors so callers can explain rejection."
  - "Generated ids use folder basename as a slug and a SHA-256 suffix from canonical folder path plus sorted Markdown relative paths."
  - "STATUS.json resume preserves existing status, phase, and unknown fields unless intake metadata update is explicitly requested."
patterns-established:
  - "NDD change workspaces resolve only under `.planning/ndd/changes/<change-id>/`."
  - "Intake helpers keep filesystem writes localized to workspace initialization."
requirements-completed: [NDD-03, INTK-02]
coverage:
  - id: D1
    description: Safe explicit change id validation and workspace resolution
    requirement: NDD-03
    verification:
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#resolves explicit valid ids under .planning/ndd/changes"
        status: pass
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#rejects unsafe ids with structured validation errors"
        status: pass
    human_judgment: false
  - id: D2
    description: Deterministic generated change ids from Markdown source folders
    requirement: INTK-02
    verification:
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#generates stable safe ids from folder basename and markdown file set"
        status: pass
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#generated suffix changes when the markdown file set changes"
        status: pass
    human_judgment: false
  - id: D3
    description: STATUS.json creation and resume behavior
    requirement: INTK-02
    verification:
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#creates parseable STATUS.json with required intake fields"
        status: pass
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#resumes existing STATUS.json without clobbering unrelated fields"
        status: pass
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#can intentionally update intake metadata on resume"
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-07-08
status: complete
---

# Phase 02 Plan 01: NDD Change Intake Foundation Summary

**Safe NDD change workspace helpers with deterministic ids and resumable STATUS.json state**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-08T02:03:10Z
- **Completed:** 2026-07-08T02:08:53Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `src/ndd-change-intake.cts` with explicit id validation, workspace resolution, deterministic id generation, Markdown discovery, and STATUS.json create/resume helpers.
- Generated `gsd-core/bin/lib/ndd-change-intake.cjs` from the TypeScript source with `npm run build:lib`.
- Added focused Node tests for unsafe id rejection, stable generated ids, file-set-sensitive suffixes, STATUS.json creation, resume preservation, and intentional metadata refresh.

## Task Commits

1. **Task 1: Add NDD change workspace and id helpers** - `e647a850` (feat)
2. **Task 2: Add deterministic generated change ids** - `e647a850` (feat)
3. **Task 3: Write and resume STATUS.json** - `e647a850`, `b34f2e6c` (feat/test)

**Plan metadata:** skipped (`commit_docs=false`)

## Files Created/Modified

- `src/ndd-change-intake.cts` - Source of truth for NDD intake helper APIs.
- `gsd-core/bin/lib/ndd-change-intake.cjs` - Generated CommonJS runtime output.
- `tests/ndd-change-intake.test.cjs` - Focused regression and behavior tests for this plan.

## Verification

- `npm run build:lib` - pass
- `node --test tests/ndd-change-intake.test.cjs` - pass
- `node .agents/gsd-core/bin/gsd-tools.cjs verify plan-structure .planning/phases/02-change-intake-and-spec-drafting/02-01-PLAN.md --raw` - pass (`valid`)

## Decisions Made

- Unsafe explicit ids are rejected instead of normalized, preventing surprising workspace names.
- Generated id suffixes hash canonical folder path plus sorted Markdown relative paths, not timestamps.
- Existing STATUS.json files keep unrelated and future-phase fields by default; callers must opt in to refresh intake metadata.

## Deviations from Plan

None - plan scope was executed as written. Commit grouping differs from one-commit-per-task because the shared helper module was implemented as one cohesive source/runtime change, with tests committed separately.

## Known Stubs

None. Stub scan only found internal empty-array initialization and null comparison used by implementation logic.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: filesystem-write | `src/ndd-change-intake.cts` | New helper writes `STATUS.json`; path resolution is constrained under `.planning/ndd/changes/<change-id>/` and ids are validated before writes. |

## Issues Encountered

- Git staging initially failed in the sandbox because `.git/index.lock` could not be created. Retried the same git operations with approved escalation.
- Existing unrelated working tree changes were present before execution and were left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Later Phase 2 plans can reuse `ndd-change-intake` for workspace/id/status behavior before adding source manifests and draft spec generation.

## Self-Check: PASSED

- Found `src/ndd-change-intake.cts`.
- Found `gsd-core/bin/lib/ndd-change-intake.cjs`.
- Found `tests/ndd-change-intake.test.cjs`.
- Found commits `e647a850` and `b34f2e6c`.

---
*Phase: 02-change-intake-and-spec-drafting*
*Completed: 2026-07-08*
