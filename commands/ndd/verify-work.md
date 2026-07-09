---
name: ndd:verify-work
description: Verify completed NDD work against CHANGE-SPEC acceptance criteria.
argument-hint: "<change-id-or-phase>"
effort: high
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
requires: []
---
<objective>
Verify NDD work against the approved NDD change contract.

NDD verify-work adapts GSD verify-work to treat `CHANGE-SPEC.md` acceptance criteria as the primary user-facing contract while preserving GSD verification artifacts.
</objective>

<execution_context>
@.agents/gsd-core/workflows/verify-work.md
@.agents/gsd-core/templates/UAT.md
@.planning/ndd/changes/
</execution_context>

<process>
Load the NDD change folder and linked GSD phase summaries. Use GSD verify-work mechanics, but ground checks in NDD `CHANGE-SPEC.md` acceptance criteria and unresolved notes.

Store or link verification output back to `.planning/ndd/changes/<change-id>/`.
</process>

<success_criteria>
- Verification is traceable to NDD `CHANGE-SPEC.md`.
- GSD verification workflow remains the underlying mechanism.
- NDD change status can reflect verification outcome.
</success_criteria>
