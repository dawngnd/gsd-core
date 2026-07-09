---
name: ndd-plan-phase
description: "Plan an approved NDD change through GSD planning mechanics."
argument-hint: "<change-id>"
effort: max
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

<objective>
Bridge an approved NDD change into GSD plan-phase without copying planner core.

NDD plan-phase validates NDD change approval and creates planner-readable bridge context, then reuses GSD plan-phase and plan-check conventions.
</objective>

<execution_context>
@.agents/gsd-core/workflows/plan-phase.md
@.agents/gsd-core/references/agent-contracts.md
@.planning/ndd/changes/
</execution_context>

<process>
Load the requested NDD change folder. Require approved `CHANGE-SPEC.md` and use `IMPACT.md` plus NDD context to create or identify the GSD phase context consumed by `gsd-plan-phase`.

Dispatch into GSD planning mechanics rather than reimplementing research, planner, checker, source-grounding, or validation loops.
</process>

<success_criteria>
- Unapproved or critically ambiguous NDD changes do not plan.
- Approved NDD change artifacts are visible to GSD plan-phase.
- Produced GSD plans remain traceable to the NDD change id.
</success_criteria>
