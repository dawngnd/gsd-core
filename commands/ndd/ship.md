---
name: ndd:ship
description: Ship a verified NDD change using GSD ship mechanics.
argument-hint: "<change-id-or-phase>"
effort: high
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
requires: []
---
<objective>
Prepare a verified NDD change for review and merge.

NDD ship enriches GSD ship context with NDD `CHANGE-SPEC.md`, `IMPACT.md`, and verification evidence. It does not replace the GSD ship workflow.
</objective>

<execution_context>
@.agents/gsd-core/workflows/ship.md
@.planning/ndd/changes/
</execution_context>

<process>
Resolve the NDD change id to the linked GSD phase and load the NDD change artifacts. Reuse GSD ship mechanics for PR/review preparation, adding NDD spec, impact, and verification references to the shipping context.
</process>

<success_criteria>
- Shipping context includes NDD traceability.
- GSD ship remains the underlying workflow.
- No separate NDD PR/review core is introduced.
</success_criteria>
