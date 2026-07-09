---
name: ndd-execute-phase
description: "Execute a planned NDD change through GSD execution mechanics."
argument-hint: "<change-id-or-phase> [--wave N]"
effort: max
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - TodoWrite
---

<objective>
Execute NDD-planned work while preserving traceability to the NDD change.

NDD execute-phase is a wrapper over GSD execute-phase. It loads NDD phase-link metadata and lets GSD executor mechanics handle plan execution, summaries, and verification handoff.
</objective>

<execution_context>
@.agents/gsd-core/workflows/execute-phase.md
@.agents/gsd-core/references/agent-contracts.md
@.planning/ndd/changes/
</execution_context>

<process>
Resolve the NDD change id to its linked GSD phase or accept a direct phase id. Load NDD traceability metadata, then reuse GSD execute-phase wave execution and summary contracts.

Do not duplicate GSD executor internals in this command.
</process>

<success_criteria>
- Execution uses GSD plan execution mechanics.
- NDD change id remains linked from summaries or status metadata.
- No parallel NDD executor core is introduced.
</success_criteria>
