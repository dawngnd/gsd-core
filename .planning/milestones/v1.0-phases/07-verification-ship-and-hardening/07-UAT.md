---
status: complete
phase: 07-verification-ship-and-hardening
source:
  - .planning/phases/07-verification-ship-and-hardening/07-01-SUMMARY.md
  - .planning/phases/07-verification-ship-and-hardening/07-02-SUMMARY.md
  - .planning/phases/07-verification-ship-and-hardening/07-03-SUMMARY.md
started: 2026-07-09T12:32:00.000Z
updated: 2026-07-09T13:43:25+07:00
---

## Current Test

[testing complete]

## Tests

### 1. NDD Verification Command
expected: |
  Running the verify command `node gsd-core/bin/gsd-tools.cjs ndd verify <change-id>` on an active change resolves its linked phase. It verifies that canonical GSD verification status is "passed". It parses acceptance criteria from `CHANGE-SPEC.md`, matches evidence in GSD phase files, requests overrides when evidence is missing, outputs `VERIFICATION.md` under the change folder, and updates the change status to verified in `STATUS.json`.
result: pass

### 2. NDD Ship Command Gates & Context
expected: |
  Running the pre-ship check `node gsd-core/bin/gsd-tools.cjs ndd ship <change-id>` gates on NDD verified status and canonical GSD verification passed. On success, it outputs `SHIP-CONTEXT.md` with links and summaries of spec, impact, and verification, and returns the phase ID for canonical `gsd-ship` delegation.
result: pass

### 3. NDD Post-Ship Updates
expected: |
  Invoking post-ship status commands (`node gsd-core/bin/gsd-tools.cjs ndd ship-shipped <change-id>` or `ship-blocked`) updates `STATUS.json` with the shipped/blocked state, timestamps, and optional PR URL/number metadata.
result: pass

### 4. NDD End-to-End Lifecycle and Documentation
expected: |
  All NDD verify and ship wrappers/adapters work end-to-end. Documentation is added to `docs/how-to/ndd-brownfield-change-workflow.md`, references updated in `docs/COMMANDS.md`/`docs/CLI-TOOLS.md`, and skill files regenerated under `skills/` using `gen-plugin-skills.cjs`.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
