# NDD Execution Bridge Summary (06-01)

## Summary of Changes

Implemented the NDD execute-phase workflow and router subcommand to bridge NDD-planned changes into GSD's canonical execute-phase engine.

### 1. NDD Command Router Subcommand `execute` (`src/ndd-command-router.cts`)
- Added the `execute` subcommand under the NDD router CLI (`gsd-tools ndd execute <change-id-or-phase>`).
- Implemented **isPhaseIdInput** to distinguish phase IDs (numeric, e.g. `06`) from change IDs (kebab-case alphanumeric).
- Implemented **resolveExecutionContext**:
  - **Change-ID path**: Resolves the workspace using `resolveChangeWorkspace`, reads `phase-link.md`, parses the phase ID, directory, and plan files.
  - **Phase-ID path**: Scans `.planning/ndd/changes/*/phase-link.md` backward to resolve the associated NDD change ID.
  - **Gate check**: Converts both paths to check if the target GSD phase exists under `.planning/phases/` and enforces that at least one `*-PLAN.md` file is present in the phase directory.
- Returns execution-ready structured JSON with `ok: true`, `change_id`, `phase_id`, `phase_dir`, `plan_files`, `phase_link_path`, and `gate_passed: true`.
- Updated CLI unknown subcommand error messages and file doc-comment to include `execute`.

### 2. Built & Ignore lists
- Compiled sources using `npx tsc --project tsconfig.build.json`.
- Added the compiled CJS targets to the `ignores` block of `eslint.config.mjs` to keep the build-test footprint green and aligned with ADR-457.

### 3. Automated Tests (`tests/ndd-execute.test.cjs`)
- Added 7 comprehensive test cases to verify:
  - Valid change-id paths returning structured JSON.
  - Valid phase-id backward-scanning resolution paths.
  - Usage errors when args are missing.
  - Gate validation failures (missing phase-link, missing PLAN files, no change linked, multiple changes linked).
- All tests run and pass cleanly.

### 4. Workflow Adapter (`commands/ndd/execute-phase.md`)
- Replaced the command placeholder stub with a complete 4-step workflow adapter:
  - **Step 1**: Parse command arguments.
  - **Step 2**: Check execution gate via `gsd-tools ndd execute <change-id-or-phase>`.
  - **Step 3**: Delegate actual execution to the canonical GSD `execute-phase` (passing `--wave` and `--gaps-only` flags verbatim, explicitly stating not to copy executor internals).
  - **Step 4**: Report results showing complete NDD traceability.

## Verification Evidence

### Test Run Output:
```text
▶ NDD execute subcommand tests
  ✔ ndd execute with valid change-id and phase-link and plan files returns JSON success (204.099419ms)
  ✔ ndd execute with valid phase-id and phase-link returns JSON success (202.764583ms)
  ✔ ndd execute without arguments returns usage error (158.612789ms)
  ✔ ndd execute <change-id> when phase-link.md is missing returns error (108.441733ms)
  ✔ ndd execute <change-id> when phase dir has no *-PLAN.md files returns error (208.279532ms)
  ✔ ndd execute <phase-id> when no change links to that phase returns error (108.285728ms)
  ✔ ndd execute <phase-id> when multiple changes link to same phase returns error (341.809443ms)
✔ NDD execute subcommand tests (1333.851771ms)
```
