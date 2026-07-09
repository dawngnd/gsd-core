---
status: complete
phase: 05-planning-bridge
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
started: "2026-07-09T01:51:00Z"
updated: "2026-07-09T09:17:00Z"
---

## Current Test

[testing complete]

## Tests

### 1. Unapproved Change Rejection
expected: Running `gsd-tools ndd plan` against a change with draft or discussed status exits non-zero and refuses to produce bridge context.
result: pass

### 2. Critical Ambiguity Blocking
expected: An approved change with critical unresolved ambiguity still fails the planning bridge gate. `preparePlanningBridge` refuses to produce context when `checkDiscussionApproval` reports critical unresolved items.
result: pass

### 3. Approved Change Bridge Context
expected: Running `gsd-tools ndd plan <change-id>` against an approved change with CHANGE-SPEC.md, IMPACT.md, and CONTEXT.md returns JSON with `approved: true` and `sourceArtifacts` referencing all three artifact paths.
result: pass

### 4. Missing CONTEXT.md Backfill
expected: When `.planning/ndd/changes/<change-id>/CONTEXT.md` is absent but the change is approved with CHANGE-SPEC.md and IMPACT.md, the helper automatically creates CONTEXT.md by extracting resolved decisions, acceptance criteria, scope, and impact summary. The backfilled file includes a generated-source note.
result: pass

### 5. Phase-Local Bridge Context Write
expected: Running `gsd-tools ndd plan-context <change-id> <phase-id>` writes `NDD-BRIDGE-CONTEXT.md` into the target phase directory. The file contains the NDD change id, source artifact paths, and planner instructions preserving GSD source-grounding conventions.
result: pass

### 6. Phase-Link Metadata Recording
expected: Running `gsd-tools ndd plan-link <change-id> <phase-id> <plan-files>` writes `phase-link.md` inside `.planning/ndd/changes/<change-id>/` with change id, phase id, plan file names, timestamp, phase directory, and source artifact references.
result: pass

### 7. NDD Plan-Phase Workflow Adapter
expected: `commands/ndd/plan-phase.md` is a complete executable workflow that delegates planning to canonical GSD `plan-phase.md`. It references plan-check, source-grounding, and phase-link conventions without copying GSD planner internals.
result: pass

### 8. Router CLI Shape Validation
expected: Running NDD planning CLI subcommands with missing required arguments returns usage errors (not crashes). `ndd plan-context` without args, `ndd plan-link` without args both return structured usage messages.
result: pass

### 9. TypeScript Build and Lint Clean
expected: `npx tsc --project tsconfig.build.json` succeeds with no errors. `npx eslint src/ndd-plan-bridge.cts src/ndd-command-router.cts` passes. Generated `gsd-core/bin/lib/ndd-plan-bridge.cjs` and `gsd-core/bin/lib/ndd-command-router.cjs` are current.
result: pass
source: automated
coverage_id: D1

### 10. Regression Test Coverage
expected: `node --test tests/ndd-plan-bridge.test.cjs` passes all 42 tests covering PLAN-01 through PLAN-04 requirements: approval gating, critical ambiguity blocking, bridge context creation, CONTEXT.md backfill, target phase validation, workflow invariants, and phase-link metadata.
result: pass
source: automated
coverage_id: D2

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
