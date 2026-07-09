---
phase: 02-change-intake-and-spec-drafting
plan: 02
subsystem: intake
tags: [ndd, markdown, manifest, source-traceability]
requires:
  - phase: 02-change-intake-and-spec-drafting
    provides: 02-01 NDD change workspace, change id, and STATUS.json helpers
provides:
  - Markdown folder ingestion into NDD change workspace sources
  - Conservative source role inference
  - SOURCE-MANIFEST.md generation and STATUS.json source metadata updates
affects: [ndd-change-intake, change-spec-drafting]
tech-stack:
  added: []
  patterns: [Node fs/path recursive intake, relative-path preserving workspace copies, deterministic markdown manifest rendering]
key-files:
  created: []
  modified:
    - src/ndd-change-intake.cts
    - gsd-core/bin/lib/ndd-change-intake.cjs
    - tests/ndd-change-intake.test.cjs
key-decisions:
  - "02-02: Copied Markdown files preserve source-relative paths under sources/ instead of flattening basenames."
  - "02-02: Role inference prefers explicit frontmatter/headings/filename/content signals and returns unknown with empty evidence when weak."
patterns-established:
  - "NDD intake manifests record original relative path, copied workspace path, role, evidence, and warnings in one source-traceable table."
requirements-completed: [INTK-01, INTK-03, INTK-05]
coverage:
  - id: D1
    description: "A local Markdown folder can be recursively ingested into .planning/ndd/changes/<change-id>/sources/."
    requirement: INTK-01
    verification:
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#ingests markdown folders into workspace sources without basename collisions"
        status: pass
      - kind: other
        ref: "npm run build:lib"
        status: pass
    human_judgment: false
  - id: D2
    description: "SOURCE-MANIFEST.md lists ingested Markdown sources with original path, copied path, inferred role, evidence, and warnings."
    requirement: INTK-03
    verification:
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#writes SOURCE-MANIFEST.md and updates STATUS.json with source traceability"
        status: pass
    human_judgment: false
  - id: D3
    description: "Copied source paths remain traceable and duplicate basenames do not overwrite one another."
    requirement: INTK-05
    verification:
      - kind: unit
        ref: "tests/ndd-change-intake.test.cjs#ingests markdown folders into workspace sources without basename collisions"
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-07-08
status: complete
---

# Phase 02 Plan 02: Markdown Source Intake and Manifest Summary

**NDD Markdown folder ingestion now copies traceable sources, infers conservative document roles, and writes SOURCE-MANIFEST.md with STATUS.json metadata.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-08T02:11:56Z
- **Completed:** 2026-07-08T02:22:22Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `ingestMarkdownSources()` to validate source folders, discover `.md`/`.markdown` files recursively, and copy them into workspace `sources/` while preserving source-relative paths.
- Added conservative `inferSourceRole()` support for `api-doc`, `business-doc`, `proposal`, `acceptance`, and `unknown` with evidence strings.
- Generated `SOURCE-MANIFEST.md` and updated `STATUS.json` with `source_count`, artifact path, warnings, and timestamps.

## Task Commits

1. **Task 1: Discover and copy Markdown sources safely** - `327efbee` (feat)
2. **Task 2: Infer conservative source roles** - `327efbee` (feat)
3. **Task 3: Generate SOURCE-MANIFEST.md and update STATUS.json** - `327efbee` (feat)

Commit granularity caveat: these tasks share one API surface and test expansion, so they were committed together as one scoped plan commit after verification.

## Files Created/Modified

- `src/ndd-change-intake.cts` - Added folder ingestion, safe copy boundaries, role inference, manifest rendering, and status metadata updates.
- `gsd-core/bin/lib/ndd-change-intake.cjs` - Generated CommonJS runtime output from `npm run build:lib`.
- `tests/ndd-change-intake.test.cjs` - Added coverage for ingestion, duplicate basenames, invalid inputs, role inference, manifest output, and status updates.

## Verification Results

- `npm run build:lib` - pass
- `node --test tests/ndd-change-intake.test.cjs` - pass
- `node .agents/gsd-core/bin/gsd-tools.cjs verify plan-structure .planning/phases/02-change-intake-and-spec-drafting/02-02-PLAN.md --raw` - pass (`valid`)

## Decisions Made

- Preserve relative source paths under `sources/` rather than flatten copied files, preventing duplicate basename overwrites without inventing opaque names.
- Treat weak classification evidence as `unknown` and leave evidence empty instead of overstating certainty.
- Record duplicate basename warnings at manifest/status level while still copying both files safely.

## Deviations from Plan

None - plan scope was implemented as written.

## Issues Encountered

- Initial duplicate-basename test fixture used different basenames (`overview.md` and `overview.markdown`); corrected it to duplicate `Proposal.md` paths before final verification.
- Initial sandboxed commit attempt could not write `.git/index.lock`; reran the same scoped git commit with escalation.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: file-ingest | `src/ndd-change-intake.cts` | New local Markdown folder ingestion and workspace copy surface. Implemented path containment checks for source traversal and destination workspace escape. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02-03 can consume `SOURCE-MANIFEST.md`, copied `sources/`, and `STATUS.json` metadata as the traceable input set for draft change spec synthesis.

## Self-Check: PASSED

- Found all modified implementation/test/runtime files.
- Found `.planning/phases/02-change-intake-and-spec-drafting/02-02-SUMMARY.md`.
- Found task commit `327efbee`.

---
*Phase: 02-change-intake-and-spec-drafting*
*Completed: 2026-07-08*
