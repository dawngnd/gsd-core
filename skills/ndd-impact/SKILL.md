---
name: ndd-impact
description: "Discover likely code impact for an approved or drafted NDD change."
argument-hint: "<change-id>"
effort: high
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

<objective>
Map an NDD change starting point to likely affected code areas in an existing project.

NDD impact discovery reuses GSD codebase mapping and source inspection. V1 exposes the namespace command only; full `IMPACT.md` generation lands in the NDD Impact Discovery phase.
</objective>

<execution_context>
@.planning/PROJECT.md
@.agents/gsd-core/workflows/map-codebase.md
</execution_context>

<process>
For Phase 1, report that `ndd-impact` is installed as a local NDD command and that full impact discovery is intentionally deferred.

When implemented, this command must read `.planning/codebase/*`, NDD `CHANGE-SPEC.md`, and relevant source files, then write `.planning/ndd/changes/<change-id>/IMPACT.md` for use by `ndd-discuss-phase`.
</process>

<success_criteria>
- NDD impact entry point exists.
- It references GSD codebase mapping rather than introducing a separate mapper core.
- It does not claim Phase 3 impact generation before it exists.
</success_criteria>
