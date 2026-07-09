# Phase 7: Verification, Ship, and Hardening - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 completes the NDD v1 lifecycle by adding verification and ship adapters over existing GSD mechanics, plus lifecycle hardening tests and documentation.

The phase delivers:
1. `ndd-verify-work` verifies an implemented NDD change against the approved `CHANGE-SPEC.md` acceptance criteria.
2. Verification evidence is stored in the NDD change folder and linked back to canonical GSD verification artifacts.
3. `ndd-ship` gates on NDD verification plus canonical GSD verification, enriches shipping context with NDD artifacts, and delegates actual ship mechanics to GSD.
4. Tests and documentation cover the NDD lifecycle from intake through ship handoff without introducing a separate verifier or ship core.

</domain>

<decisions>
## Implementation Decisions

### 1. Verification Contract - Acceptance Criteria First

- **D-01:** `CHANGE-SPEC.md ## Acceptance Criteria` is the mandatory NDD verification checklist.
- **D-02:** GSD `VERIFICATION.md` and `UAT.md` must provide evidence that each acceptance criterion passed.
- **D-03:** If `CHANGE-SPEC.md` is missing `## Acceptance Criteria`, or the section is empty, `ndd-verify-work` must block and direct the user back to `ndd-discuss-phase`. It must not infer a best-effort contract from goals, scope, or summaries.
- **D-04:** `ndd-verify-work` may only perform acceptance-criteria mapping when canonical GSD verification is `passed`. Any other GSD verification status blocks NDD verification and should point the user to the appropriate GSD verify/execute next step.

### 2. NDD Verification Evidence

- **D-05:** NDD verification evidence is stored in the NDD change folder, preferably as `.planning/ndd/changes/<change-id>/VERIFICATION.md`.
- **D-06:** The NDD verification artifact must map each acceptance criterion to concrete evidence from GSD `VERIFICATION.md`, `UAT.md`, summaries, or equivalent phase-local artifacts.
- **D-07:** If GSD verification is `passed` but an acceptance criterion lacks a clear evidence mapping, `ndd-verify-work` must ask the user for an override instead of automatically passing or failing.
- **D-08:** Overrides must be recorded in NDD `VERIFICATION.md` with reason, confirming user/person, and timestamp.
- **D-09:** After successful NDD verification, update `STATUS.json` lightly with fields such as `verified`, `verification_path`, and `verified_at`. Do not modify core GSD state, and do not turn `phase-link.md` into runtime status storage.

### 3. Ship Gate and Enrichment

- **D-10:** `ndd-ship` must gate on both NDD verified status and canonical GSD verification `passed`.
- **D-11:** PR/review context should include a concise spec, impact, and verification summary: links or short summaries from `CHANGE-SPEC.md`, `IMPACT.md`, NDD `VERIFICATION.md`, and GSD verification evidence.
- **D-12:** `ndd-ship` should create a lightweight pre-ship context artifact that canonical GSD ship can consume. Do not patch the PR body after GSD ship, and do not fork the ship core.
- **D-13:** After successful ship/PR creation, update `STATUS.json` lightly with fields such as `shipped`, `pr_url`, `pr_number`, and `shipped_at` when available.
- **D-14:** If canonical GSD ship is blocked by dirty worktree, missing remote, missing `gh`, non-passing verification, or a similar blocker, `ndd-ship` must ask the user whether to leave NDD state unchanged or update `STATUS.json` to `ship_blocked` with blocker details.

### 4. Hardening, Tests, and Documentation

- **D-15:** Deterministic NDD verify/ship logic belongs in a dedicated TypeScript helper module or deliberately extended helper module. Command Markdown should stay focused on orchestration and delegation.
- **D-16:** Tests should cover router/workflow contracts and artifact generation: `ndd verify`, `ndd ship`, NDD `VERIFICATION.md`, ship context artifact, `STATUS.json` updates, and command adapter content.
- **D-17:** Ship tests must not create a real PR. They should verify helper/router gate output and generated ship context, while workflow adapter tests assert delegation to canonical GSD ship.
- **D-18:** Documentation should update command references and NDD lifecycle notes to describe the full flow, artifacts, gates, and the boundary between NDD adapters and GSD core.

### Agent's Discretion

The planner may choose:
- Exact helper module name and whether verify/ship share a module or use separate focused modules.
- Exact NDD `VERIFICATION.md` section layout, as long as each acceptance criterion has evidence or an explicit override.
- Exact pre-ship context artifact name and location, as long as it remains lightweight and traceable.
- Exact `STATUS.json` field names, provided they are machine-readable and backward-compatible with existing status data.
- Exact test file organization.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope
- `.planning/PROJECT.md` - NDD scope, thin adapter constraint, artifact layout, and v1 lifecycle intent.
- `.planning/REQUIREMENTS.md` - VERF-01, VERF-02, SHIP-01, SHIP-02, and MNT-03 definitions.
- `.planning/ROADMAP.md` - Phase 7 goal, success criteria, and plan breakdown.

### Prior Phase Context
- `.planning/phases/04-discuss-and-approve-change-spec/04-CONTEXT.md` - `CHANGE-SPEC.md` approval contract, acceptance criteria, and STATUS dual-write pattern.
- `.planning/phases/05-planning-bridge/05-CONTEXT.md` - Planning bridge assumptions and phase-link traceability, if present in the workspace.
- `.planning/phases/06-execution-bridge/06-CONTEXT.md` - Dual-path change-id/phase-id resolution, phase-link gate pattern, and direct delegation to canonical GSD workflow.
- `.planning/phases/06-execution-bridge/06-01-SUMMARY.md` - Implemented `ndd execute` router pattern and workflow adapter delegation.
- `.planning/phases/06-execution-bridge/06-02-SUMMARY.md` - Existing execution bridge test coverage pattern.

### Existing NDD Source
- `src/ndd-command-router.cts` - Router to extend with verify/ship subcommands or helper calls.
- `src/ndd-change-intake.cts` - `resolveChangeWorkspace()`, `readStatus()`, `writeStatus()`, and `validateChangeId()` helpers.
- `src/ndd-plan-bridge.cts` - `phase-link.md` traceability and planning bridge artifact patterns.
- `commands/ndd/verify-work.md` - Placeholder command adapter to replace with the full verification flow.
- `commands/ndd/ship.md` - Placeholder command adapter to replace with the full ship flow.
- `commands/ndd/execute-phase.md` - Thin adapter pattern for gate, resolve, and delegate behavior.

### Canonical GSD Workflows
- `.agents/gsd-core/workflows/verify-work.md` - Canonical GSD UAT/verification workflow to reuse.
- `.agents/gsd-core/workflows/ship.md` - Canonical GSD ship workflow to reuse.
- `gsd-core/workflows/verify-work.md` - Packaged canonical verify workflow.
- `gsd-core/workflows/ship.md` - Packaged canonical ship workflow.

### Codebase Maps
- `.planning/codebase/TESTING.md` - Test runner, suite, and fixture conventions.
- `.planning/codebase/CONVENTIONS.md` - TypeScript, router, markdown, and portability conventions.
- `.planning/codebase/STRUCTURE.md` - Where to add runtime source, commands, and tests.
- `.planning/codebase/ARCHITECTURE.md` - GSD workflow/CLI/tooling layer boundaries.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveChangeWorkspace(projectRoot, changeId)` - Resolve `.planning/ndd/changes/<change-id>/` for status, verification, and ship context artifacts.
- `readStatus(workspaceDir)` / `writeStatus(workspaceDir, data)` - Read/write `STATUS.json` for verified, shipped, or ship-blocked metadata.
- `validateChangeId(id)` - Validate change-id inputs.
- `resolveExecutionContext(cwd, inputId)` in `src/ndd-command-router.cts` - Existing dual-path change-id/phase-id resolution pattern. Consider extracting or reusing equivalent logic for verify/ship.
- `phase-link.md` frontmatter - Existing bridge from NDD change-id to GSD phase id, phase dir, and plan files.
- `output(result, raw)` from `io.cts` - Structured JSON response pattern for router subcommands.
- `error(message, ERROR_REASON.*)` - Existing CLI/router error pattern.

### Established Patterns
- NDD command router subcommands return structured JSON and use deterministic helpers for filesystem/state work.
- Command Markdown adapters perform gate/resolve/delegate orchestration, while GSD canonical workflows own implementation-heavy behavior.
- Tests use Node's built-in test runner in `tests/*.test.cjs` and commonly assert CLI stdout/stderr/exit behavior through child processes.
- Workflow adapter tests can assert command files contain required delegation language and avoid independent core logic.
- Generated CommonJS outputs mirror `src/**/*.cts` after TypeScript build.

### Integration Points
- `src/ndd-command-router.cts` - Add `verify` and `ship` subcommands or route to new helper functions.
- New or extended NDD helper module - Own acceptance-criteria parsing, evidence mapping, NDD verification artifact rendering, ship context rendering, and status updates.
- `commands/ndd/verify-work.md` - Run NDD gate/prepare helper, delegate to or require canonical GSD verification status, collect override decisions when needed, and write NDD verification output.
- `commands/ndd/ship.md` - Run NDD ship gate, render pre-ship context, invoke canonical GSD ship, and update NDD status only after success or after user-selected blocked-state handling.
- Tests under `tests/` - Add focused coverage for helper/router behavior, artifact generation, and adapter content.

</code_context>

<specifics>
## Specific Ideas

- `ndd verify <change-id-or-phase>` should resolve the NDD change and linked GSD phase, require canonical GSD verification `passed`, parse `CHANGE-SPEC.md ## Acceptance Criteria`, and generate NDD verification mapping output.
- NDD `VERIFICATION.md` should include at minimum: change id, linked phase id, GSD verification status/path, acceptance criteria table, evidence links, override records, and final NDD verification status.
- `ndd ship <change-id-or-phase>` should resolve the same change/phase link, require NDD verified plus GSD verification passed, render a pre-ship context artifact, and then delegate to canonical GSD ship.
- Ship context should be concise: spec summary, impact summary, verification summary, and artifact links. It should not embed full source documents.
- `ship_blocked` state is user-selected when canonical ship cannot proceed; do not write it automatically.
- Lifecycle docs should make the flow explicit: `ndd-change -> ndd-impact -> ndd-discuss-phase -> ndd-plan-phase -> ndd-execute-phase -> ndd-verify-work -> ndd-ship`.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 07-Verification, Ship, and Hardening*
*Context gathered: 2026-07-09*
