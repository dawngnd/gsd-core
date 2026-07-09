---
name: ndd:discuss-phase
description: Clarify an NDD brownfield change before planning.
argument-hint: "<change-id>"
effort: max
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
requires: []
---
<objective>
Clarify messy NDD business, API, and proposal documents into an implementation-ready change contract.

NDD discuss adapts GSD discuss-phase principles to an existing project change: resolve ambiguity, conflicts, scope, and acceptance criteria before allowing planning.
</objective>

<execution_context>
@.agents/gsd-core/workflows/discuss-phase.md
@.agents/gsd-core/references/gate-prompts.md
@.planning/ndd/changes/
</execution_context>

<process>
1. Parse `<change-id>` from the command arguments. If missing, stop with usage: `gsd-tools ndd discuss <change-id>`.

2. Run `gsd-tools ndd discuss <change-id>` to load deterministic discussion seeds from `CHANGE-SPEC.md` and `IMPACT.md`.

3. Present and resolve questions in this order:
   - Critical ambiguities first
   - Conflicts
   - Open questions
   - Impact unknowns
   - Non-critical ambiguities

4. Ask targeted clarification questions one category at a time using the referenced GSD discuss-phase patterns. Preserve the original CHANGE-SPEC sections as audit trail.

5. After each resolved batch, write the resolved decision into CHANGE-SPEC.md through the NDD discuss helper. The resolved record must include original reference, decision, source, and timestamp.

6. When all critical ambiguities are resolved, add or update `## Acceptance Criteria` and `## Scope` (`### In Scope`, `### Out of Scope`) in CHANGE-SPEC.md.

7. Run `gsd-tools ndd discuss-update <change-id> discussed` after the clarification pass is complete.

8. Run `gsd-tools ndd discuss-check <change-id>` as the planning gate check. If `has_critical_unresolved` is true, stop before approval and continue clarification.

9. Ask the user exactly this approval question: "All critical ambiguities have been resolved. Do you approve this change spec for planning?" Approval must be explicit; do not auto-approve.

10. Only after explicit approval, run `gsd-tools ndd discuss-update <change-id> approved`. This dual-writes approval to `STATUS.json` and `CHANGE-SPEC.md` frontmatter/body.

Do not fork the GSD discuss workflow. Treat NDD-specific documents as additional context and produce bridge-ready decisions that later GSD plan-phase mechanics can consume.
</process>

<success_criteria>
- All critical ambiguities are resolved or the workflow remains blocked before planning.
- `CHANGE-SPEC.md` contains `## Resolved`, `## Acceptance Criteria`, and `## Scope`.
- User explicitly approved the spec; no auto-approval occurred.
- `STATUS.json.status` and `CHANGE-SPEC.md` `approval_status` both show `approved`.
- Approved NDD artifacts can be bridged into GSD planning.
</success_criteria>
