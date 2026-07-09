# Phase 6: Execution Bridge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 06-Execution Bridge
**Areas discussed:** Execution Gate Strategy, Change ID Resolution, Traceability After Execution, Router and TS Helper Scope

---

## Execution Gate Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Gate nhẹ | Chỉ kiểm tra phase-link.md tồn tại + PLAN.md files tồn tại. Không lặp lại approval/ambiguity (Phase 5 đã check). | ✓ |
| Gate trung bình | Kiểm tra phase-link.md + PLAN.md + verify STATUS.json phase >= 'planned'. | |
| Gate chặt | Kiểm tra lại tất cả: approval + critical ambiguity + phase-link + PLAN.md. Defense-in-depth. | |

**User's choice:** Gate nhẹ — Phase 5 plan-bridge đã enforce approval/ambiguity, không cần lặp lại.
**Notes:** Consistent with thin wrapper philosophy.

---

## Change ID Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Change-id primary | Change-id là primary, resolve qua phase-link.md. User không cần nhớ phase number. | |
| Hỗ trợ cả hai | `<change-id-or-phase>` — dual-path: change-id → phase-link.md, phase-id → scan ngược. | ✓ |
| Phase-id primary | Phase-id là primary, NDD adapter chỉ cần biết target phase. | |

**User's choice:** Hỗ trợ cả hai — linh hoạt cho user biết change-id hoặc phase-id.
**Notes:** Phân biệt tự động dựa trên format (change-id = kebab-case vs phase-id = số/số-slug).

---

## Traceability After Execution

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-write STATUS.json + phase-link.md | Cập nhật cả hai sau execution: STATUS.json phase = 'executed', phase-link.md append summary. | |
| Chỉ STATUS.json | Cập nhật STATUS.json phase = 'executed' only. | |
| Delegate hoàn toàn cho GSD | Không cập nhật NDD metadata. GSD tự viết SUMMARY.md, VERIFICATION.md. | ✓ |

**User's choice:** Delegate hoàn toàn — NDD traceability đã đủ qua phase-link.md, GSD tự quản execution artifacts.
**Notes:** Giữ ndd-execute-phase thực sự là thin wrapper: gate → resolve → delegate → done.

---

## Router and TS Helper Scope

| Option | Description | Selected |
|--------|-------------|----------|
| File mới ndd-execution-bridge.cts | Tạo file TS helper riêng với resolveExecutionTarget() + checkExecutionGate(). | |
| Extend ndd-plan-bridge.cts | Thêm helpers vào file plan-bridge hiện có. | |
| Tối giản — không TS helper mới | Router chỉ resolve path, gate check nằm trong workflow adapter. | ✓ |

**User's choice:** Tối giản — không cần TS helper mới vì logic quá đơn giản cho file riêng.
**Notes:** Router thêm `ndd execute <change-id-or-phase>` inline, reuse existing helpers.

---

## Agent's Discretion

- JSON response shape cho `ndd execute` subcommand
- Error message wording cho gate failures
- Flag passthrough logic (--wave, etc.)
- Test organization (single file vs multiple)

## Deferred Ideas

None — discussion stayed within phase scope.
