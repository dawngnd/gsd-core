---
name: ndd-discuss-phase
description: "Clarify an NDD brownfield change before planning."
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
Load the NDD change folder, especially `CHANGE-SPEC.md`, `SOURCE-MANIFEST.md`, and `IMPACT.md` when present. Use GSD discuss-phase questioning patterns to clarify scope and update the NDD change artifacts.

Do not fork the GSD discuss workflow. Treat NDD-specific documents as additional context and produce bridge-ready decisions that later GSD plan-phase mechanics can consume.
</process>

<success_criteria>
- NDD change ambiguity is clarified before planning.
- Critical unresolved ambiguity remains blocking.
- Approved NDD artifacts can be bridged into GSD planning.
</success_criteria>
