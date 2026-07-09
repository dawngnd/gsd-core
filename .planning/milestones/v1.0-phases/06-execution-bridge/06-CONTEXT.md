---
phase: 6
phase_name: Execution Bridge
status: planned
created: 2026-07-09
requirements: [EXEC-01, EXEC-02, EXEC-03]
---

# Phase 6: Execution Bridge - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 builds `ndd-execute-phase` — a thin wrapper that loads NDD phase-link metadata, verifies plans exist, resolves the target GSD phase, and delegates to GSD's canonical `execute-phase` workflow. It does not duplicate GSD executor internals.

The phase delivers:
1. A router subcommand (`ndd execute <change-id-or-phase>`) in `src/ndd-command-router.cts` that resolves change-id ↔ phase-id and returns execution-ready JSON
2. An updated workflow adapter (`commands/ndd/execute-phase.md`) with gate checks and GSD delegation
3. Tests covering gate enforcement, dual-path resolution, and delegation behavior

</domain>

<decisions>
## Implementation Decisions

### 1. Execution Gate Strategy — Lightweight

- **D-01:** Gate is lightweight: check `phase-link.md` tồn tại (chứng minh plan-phase đã chạy) + ít nhất 1 `*-PLAN.md` trong target phase dir. Không lặp lại approval/ambiguity check — Phase 5 plan-bridge đã enforce rồi.
- **D-02:** [informational] Gate check nằm trong workflow adapter (`commands/ndd/execute-phase.md`), không trong TS helper. (Thin wrapper philosophy — gate logic đủ đơn giản cho bash.)

### 2. Change ID Resolution — Dual-Path

- **D-03:** `ndd execute-phase <change-id-or-phase>` hỗ trợ cả change-id và phase-id.
- **D-04:** Change-id → resolve qua `phase-link.md` trong `.planning/ndd/changes/<change-id>/phase-link.md` để tìm target phase-id.
- **D-05:** Phase-id → scan ngược `.planning/ndd/changes/*/phase-link.md` để tìm NDD change-id liên kết.
- **D-06:** Phân biệt tự động: change-id format (kebab-case, chứa dashes) khác phase-id format (số hoặc số-slug).

### 3. Traceability After Execution — Full Delegation

- **D-07:** Không cập nhật NDD metadata (STATUS.json, phase-link.md) sau khi GSD executor hoàn thành. GSD tự viết SUMMARY.md, VERIFICATION.md trong phase dir.
- **D-08:** [informational] NDD traceability đã đủ: phase-link.md ghi change-id ↔ phase-id link, GSD artifacts nằm trong target phase dir. (Tracing đi từ change-id → phase-link.md → phase-dir → SUMMARY.md/VERIFICATION.md.)

### 4. Router and TS Helper Scope — Minimal

- **D-09:** Router thêm 1 subcommand: `ndd execute <change-id-or-phase>`. Trả JSON: `change_id`, `phase_id`, `phase_dir`, `plan_files`, `phase_link_path`.
- **D-10:** Không tạo file TS helper mới (`ndd-execution-bridge.cts`). Logic resolve nằm inline trong router, reuse existing helpers (`resolveChangeWorkspace`, `readStatus` từ `ndd-change-intake.cts`).
- **D-11:** Workflow adapter `commands/ndd/execute-phase.md` gọi `gsd-tools ndd execute <change-id-or-phase>` để lấy JSON, kiểm tra gate, rồi invoke `gsd-execute-phase <phase-id>`.

### Agent's Discretion

The planner may choose:
- Exact JSON response shape for `ndd execute` subcommand (match existing pattern from `ndd plan`)
- Error message wording for gate failures
- How the workflow adapter passes `--wave` and other flags through to GSD execute-phase
- Test organization (single file vs multiple test files)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope
- `.planning/PROJECT.md` — NDD as thin brownfield workflow layer over GSD Core
- `.planning/REQUIREMENTS.md` — EXEC-01 through EXEC-03 definitions
- `.planning/ROADMAP.md` — Phase 6 goal, success criteria, requirements

### Prior Phase Context (Pattern References)
- `.planning/phases/04-discuss-and-approve-change-spec/04-CONTEXT.md` — Approval flow, STATUS.json transitions, dual-write pattern
- `.planning/phases/02-change-intake-and-spec-drafting/02-CONTEXT.md` — Workspace shape, STATUS.json fields, change-id format

### Phase 5 Implementation (Direct Dependency)
- `src/ndd-plan-bridge.cts` — Planning bridge pattern: `PreparePlanningBridgeResult`, `WritePhaseLinkResult`, `BridgeArtifactRefs` types
- `src/ndd-command-router.cts` — Router to extend with `execute` subcommand (add after `plan-link` branch)
- `commands/ndd/plan-phase.md` — Adapter workflow pattern to follow for execute-phase.md

### Existing NDD Source (Reusable Helpers)
- `src/ndd-change-intake.cts` — `resolveChangeWorkspace()`, `readStatus()`, `validateChangeId()` helpers to reuse
- `src/ndd-plan-bridge.cts` — `phase-link.md` reading logic to reuse for reverse lookup

### GSD Execute Pattern
- `.agents/gsd-core/workflows/execute-phase.md` — GSD execute-phase workflow (delegate target)
- `commands/ndd/execute-phase.md` — Placeholder command to implement

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — Layer/module structure
- `.planning/codebase/CONVENTIONS.md` — Coding and naming conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveChangeWorkspace(projectRoot, changeId)` — resolves `.planning/ndd/changes/<change-id>/` path (reuse for phase-link.md lookup)
- `readStatus(workspaceDir)` / `writeStatus(workspaceDir, data)` — STATUS.json management (read-only in Phase 6)
- `validateChangeId(id)` — input validation (reuse for execute router)
- `output(result, raw)` from `io.cts` — structured JSON output for router subcommand
- `error(message, ERROR_REASON.*)` — error reporting pattern
- `toPosixPath()` — cross-platform path normalization (present in both router and bridge)

### Established Patterns
- NDD modules import intake helpers via `require('./ndd-change-intake.cjs')` with type-safe require pattern
- Router returns structured JSON via `output(result, raw)` from `io.cts`
- Error reporting uses `error(message, ERROR_REASON.*)` pattern
- Tests follow `tests/*.test.cjs` naming, use Node built-in test runner
- `phase-link.md` has frontmatter with `change_id`, `phase_id`, `phase_dir`, `plan_files`, `linked_at`

### Integration Points
- `src/ndd-command-router.cts` — add `execute` branch after `plan-link` branch
- `commands/ndd/execute-phase.md` — currently a placeholder with process stub, needs full implementation
- Phase-link.md reading: parse frontmatter from `.planning/ndd/changes/<change-id>/phase-link.md` for phase_id
- Reverse lookup: scan `.planning/ndd/changes/*/phase-link.md` to find which change owns a phase-id

</code_context>

<specifics>
## Specific Ideas

- `ndd execute` router subcommand phải trả JSON đủ cho workflow adapter: `change_id`, `phase_id`, `phase_dir`, `plan_files[]`, `phase_link_path`, `gate_passed: boolean`
- Workflow adapter pattern: call `gsd-tools ndd execute <id>` → parse JSON → check gate → invoke `gsd-execute-phase <phase-id>`
- Flag passthrough: `--wave N` và các GSD execute flags khác phải được truyền nguyên vẹn sang `gsd-execute-phase`
- Reverse phase-id lookup cần handle case: nhiều changes link cùng 1 phase — lấy most recent hoặc report ambiguity

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-Execution Bridge*
*Context gathered: 2026-07-09*
