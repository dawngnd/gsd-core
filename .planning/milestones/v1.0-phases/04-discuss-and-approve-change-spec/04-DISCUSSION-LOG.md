# Phase 4: Discuss and Approve Change Spec - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 04-discuss-and-approve-change-spec
**Areas discussed:** Question Strategy, Spec Update Mechanics, Approval Flow, NDD CONTEXT.md Placement, Implementation Approach, Ambiguity Severity, Router Extension, Test Strategy, Acceptance Criteria Format

---

## Question Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Seed from NDD artifacts | Parse CHANGE-SPEC.md ambiguities + IMPACT.md findings as question seeds | ✓ (recommended, user skipped) |
| Reuse GSD gray-area analysis | Treat phase like any GSD discuss-phase | |
| Hybrid | Start with NDD seeds, fall back to GSD-style analysis | |

**User's choice:** Skipped — recommended option selected (Seed from NDD artifacts)
**Notes:** User requested switch to Vietnamese at this point.

---

## Spec Update Mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Giữ nguyên + thêm Resolved | Keep original sections, append ## Resolved with audit trail | ✓ |
| Ghi đè tại chỗ | Overwrite ambiguities when resolved | |
| File riêng | Separate CHANGE-SPEC-RESOLVED.md | |

**User's choice:** Giữ nguyên + thêm section Resolved
**Notes:** Audit trail preservation was the deciding factor.

---

## Approval Flow

| Option | Description | Selected |
|--------|-------------|----------|
| User xác nhận tường minh | Always ask user before approving | ✓ |
| Tự động approve | Auto-approve when zero critical ambiguities | |
| Kết hợp | Auto with --auto flag, otherwise ask | |

**User's choice:** User xác nhận tường minh

---

## Approval State Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Cả hai | STATUS.json + CHANGE-SPEC.md frontmatter | ✓ |
| Chỉ STATUS.json | Single machine-readable source | |
| Chỉ frontmatter | Consistent with GSD pattern | |

**User's choice:** Dual-write (STATUS.json + CHANGE-SPEC.md frontmatter)

---

## NDD CONTEXT.md Placement

| Option | Description | Selected |
|--------|-------------|----------|
| NDD change folder | .planning/ndd/changes/<change-id>/CONTEXT.md | ✓ |
| GSD phase directory | .planning/phases/04-*/04-CONTEXT.md | |
| Cả hai | NDD folder + symlink to GSD phase dir | |

**User's choice:** Trong NDD change folder

---

## Implementation Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Workflow + TS helper | src/ndd-discuss-spec.cts with 3 deterministic helpers | ✓ |
| Workflow-only | LLM self-parse and write | |
| Agent chuyên dụng | Dedicated ndd-discuss agent | |

**User's choice:** Workflow + TS helper
**Notes:** User asked for clarification on TS helper purpose before selecting. Helper provides: extractAmbiguities, writeResolvedSection, updateApprovalStatus.

---

## Ambiguity Severity

| Option | Description | Selected |
|--------|-------------|----------|
| critical / non-critical | Binary — only critical blocks approval | ✓ |
| critical / major / minor | Three levels, only critical blocks | |
| Không phân loại | All ambiguities block | |

**User's choice:** Binary severity (critical / non-critical)

---

## Router Extension

| Option | Description | Selected |
|--------|-------------|----------|
| Structured JSON | Return change_id, ambiguities, conflicts, open_questions, impact_summary, status | ✓ |
| Validate + return path | Only validate and return workspace path | |
| Không cần router | Workflow calls resolveChangeWorkspace directly | |

**User's choice:** Structured JSON — consistent with ndd change and ndd impact patterns

---

## Test Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Unit + Integration | Unit for TS helpers, integration for DISC-05 gate | ✓ |
| Chỉ unit test | Individual helper tests | |
| Chỉ integration test | Full flow tests | |

**User's choice:** Unit test cho TS helpers + integration cho gate

---

## Acceptance Criteria Format

| Option | Description | Selected |
|--------|-------------|----------|
| Thêm section mới vào CHANGE-SPEC.md | Append ## Acceptance Criteria and ## Scope | ✓ |
| Ghi vào CONTEXT.md | Put in implementation decisions | |
| Agent quyết định | Let agent choose | |

**User's choice:** New sections in CHANGE-SPEC.md — keeps it as single source of truth

---

## Agent's Discretion

- Exact ambiguity parsing heuristics
- Resolved section formatting details
- How workflow organizes NDD artifact seeds into user questions
- Internal helper naming within ndd-discuss-spec.cts

## Deferred Ideas

None — discussion stayed within phase scope.
