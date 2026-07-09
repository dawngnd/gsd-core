---
phase: 2
phase_name: Change Intake and Spec Drafting
status: planned
created: 2026-07-08
requirements: [NDD-03, INTK-01, INTK-02, INTK-03, INTK-04, INTK-05]
---

# Phase 2 Context: Change Intake and Spec Drafting

## Goal

Make `ndd-change` useful for the first real NDD brownfield workflow step: a user points it at a folder of Markdown documents and receives a durable, source-traceable change workspace under `.planning/ndd/changes/<change-id>/`.

This phase does not perform code impact discovery or user clarification. It creates the intake artifacts that later phases consume.

## Current State

Phase 1 added the NDD namespace surface:

- `commands/ndd/change.md`
- `commands/ndd/impact.md`
- `commands/ndd/discuss-phase.md`
- `commands/ndd/plan-phase.md`
- `commands/ndd/execute-phase.md`
- `commands/ndd/verify-work.md`
- `commands/ndd/ship.md`
- generated `skills/ndd-*`
- runtime artifact support for `sourceNamespace`

`commands/ndd/change.md` is currently a placeholder. It states that full ingestion is deferred to this phase.

## Requirements Covered

- `NDD-03`: NDD artifacts are stored under `.planning/ndd/changes/<change-id>/`.
- `INTK-01`: User can start a change workflow by providing a folder of Markdown documents.
- `INTK-02`: `ndd-change` creates a stable change id and initializes `.planning/ndd/changes/<change-id>/`.
- `INTK-03`: `ndd-change` writes `SOURCE-MANIFEST.md` listing ingested source files and their roles when inferable.
- `INTK-04`: `ndd-change` writes a draft `CHANGE-SPEC.md` summarizing goals, source-backed requirements, constraints, ambiguities, conflicts, and open questions.
- `INTK-05`: Ingestion preserves source traceability for extracted business/API/proposal claims.

## Design Direction

NDD remains a thin workflow/adaptor layer over GSD Core. Phase 2 should add deterministic helper code where file-system behavior must be reliable, and keep interpretation-heavy behavior in workflow/prompt artifacts.

The change workspace shape should be:

```text
.planning/ndd/changes/<change-id>/
  STATUS.json
  SOURCE-MANIFEST.md
  CHANGE-SPEC.md
  sources/
    <copied-or-normalized-source-markdown-files>
```

`change-id` must be stable enough for resume:

- If user supplies an explicit id, validate and use it.
- If no id is supplied, derive from the docs folder basename plus a short deterministic suffix from canonical source paths/content metadata.
- Avoid timestamps as the only identity source.

`STATUS.json` should be machine-readable and small. Suggested fields:

- `change_id`
- `created_at`
- `updated_at`
- `source_folder`
- `status`: `draft`
- `phase`: `intake`
- `artifacts`: paths to `SOURCE-MANIFEST.md` and `CHANGE-SPEC.md`
- `source_count`
- `warnings`

`SOURCE-MANIFEST.md` should be human-readable and source-traceable:

- file path
- copied path under `sources/`
- inferred role: `api-doc`, `business-doc`, `proposal`, `acceptance`, `unknown`
- rough signal/evidence for the role
- warnings for empty, unreadable, duplicate, or unsupported files

`CHANGE-SPEC.md` should be a draft contract, not an approved implementation scope:

- goal / requested change
- confirmed source-backed requirements
- constraints
- business/API notes
- ambiguities
- conflicts
- open questions
- source references
- approval status: `draft`

## Boundaries

In scope:

- Markdown folder intake.
- Change folder creation/resume.
- Source manifest generation.
- Draft spec structure and source references.
- Tests for deterministic behavior and generated artifacts.
- Updating `ndd-change` to call or instruct the actual intake behavior.

Out of scope:

- Codebase impact discovery. That is Phase 3.
- Interactive clarification and approval. That is Phase 4.
- Bridging into GSD phase planning. That is Phase 5.
- Execution, verification, and ship wrappers.

## Likely Files To Inspect

- `commands/ndd/change.md`
- `skills/ndd-change/SKILL.md`
- `src/command-routing-hub.cts`
- `src/*command-router.cts`
- `src/planning-workspace.cts`
- `src/frontmatter.cts`
- `src/markdown-sectionizer.cts`
- `src/io.cts`
- `tests/commands.test.cjs`
- existing tests around command routers, planning workspace, and markdown parsing

## Risks

- Source documents can be ambiguous or contradictory. Phase 2 should preserve and surface ambiguity, not pretend to resolve it.
- Generated specs must not look approved. Approval belongs to Phase 4.
- Intake should not pollute `ROADMAP.md`.
- Path handling must avoid escapes when copying or referencing source files.
- Tests should avoid relying on real `.planning/` state from this repository.

## Verification Strategy

Phase 2 is complete when focused tests prove:

- a Markdown folder can initialize `.planning/ndd/changes/<change-id>/`;
- explicit and generated change ids are stable and validated;
- `STATUS.json`, `SOURCE-MANIFEST.md`, and `CHANGE-SPEC.md` are produced;
- manifest/spec content includes source references;
- invalid input paths and no-Markdown folders fail clearly;
- existing GSD command behavior remains unaffected.
