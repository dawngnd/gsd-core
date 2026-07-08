---
name: ndd-change
description: "Start an NDD brownfield change from project Markdown documents."
argument-hint: "<docs-folder> [change-id]"
effort: high
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

<objective>
Start an NDD change workspace for an existing project from Markdown source documents.

NDD change intake is a brownfield wrapper over GSD Core mechanics. It ingests a folder of Markdown documents, creates or resumes `.planning/ndd/changes/<change-id>/`, copies source documents, writes `SOURCE-MANIFEST.md`, and drafts `CHANGE-SPEC.md`.
</objective>

<execution_context>
@.planning/PROJECT.md
@.agents/gsd-core/workflows/new-project.md
</execution_context>

<process>
Run the deterministic local helper:

```bash
node .agents/gsd-core/bin/gsd-tools.cjs ndd change <docs-folder> [change-id]
```

If the project-local `.agents` helper is unavailable, use the package helper from the repository:

```bash
node gsd-core/bin/gsd-tools.cjs ndd change <docs-folder> [change-id]
```

The helper must remain limited to Phase 2 intake and draft spec generation. Do not perform impact discovery, clarification approval, phase planning, execution, verification, or shipping from this command.
</process>

<success_criteria>
- `STATUS.json`, `SOURCE-MANIFEST.md`, copied `sources/`, and draft `CHANGE-SPEC.md` exist under `.planning/ndd/changes/<change-id>/`.
- `CHANGE-SPEC.md` is explicitly draft and unapproved.
- Confirmed requirements, ambiguities, conflicts, open questions, and source references are preserved from the Markdown inputs.
- The command keeps NDD as an adapter over GSD Core rather than a parallel core.
</success_criteria>
