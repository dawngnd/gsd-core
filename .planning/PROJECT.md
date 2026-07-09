# NDD Brownfield Change Workflow

## What This Is

NDD is a fixed brand and namespace for a plug-and-play brownfield change workflow built inside GSD Core. It helps users maintain an existing running project by ingesting a folder of Markdown change documents, clarifying unclear business/API/proposal context, discovering impact against the existing codebase, and then reusing GSD's phase planning, execution, verification, and ship mechanics.

The workflow is not a replacement for GSD Core. NDD is an opinionated orchestration layer that adapts GSD's core engine to project-specific maintenance work: adding features, modifying existing behavior, fixing business flows, and implementing scoped change requests from imperfect documentation.

## Core Value

Turn messy project-specific change documents into an approved, impact-aware implementation scope that can safely reuse GSD's existing planning, subagent execution, verification, and shipping loop.

## Requirements

### Validated

- ✓ GSD Core already provides a phase-oriented workflow engine with discuss, plan, execute, verify, and ship concepts — existing
- ✓ GSD Core already supports brownfield codebase mapping through `.planning/codebase/*` — existing
- ✓ GSD Core already has workflow, agent, command, skill, template, config, git, state, and verification primitives that NDD should reuse — existing
- ✓ This repository is a Node.js/TypeScript npm package with prompt/workflow artifacts and generated CommonJS runtime helpers — existing
- ✓ Runtime installation/conversion is multi-surface and must be handled carefully for any non-GSD command namespace — existing
- ✓ Add an `ndd` namespace as a fixed branded workflow surface distinct from the existing `gsd` namespace — Phase 1
- ✓ Keep NDD-owned discovery artifacts under `.planning/ndd/changes/<change-id>/` — Phase 1 & 2
- ✓ Implement `ndd-change` to ingest a folder of Markdown documents into `.planning/ndd/changes/<change-id>/` — Phase 2
- ✓ Generate a draft `CHANGE-SPEC.md` from proposal, API, business, and related Markdown documents — Phase 2
- ✓ Detect ambiguous, conflicting, missing, or source-dependent requirements during document ingestion — Phase 2
- ✓ Implement `ndd-impact` to inspect `.planning/codebase/*` and relevant source files, then write `IMPACT.md` — Phase 3
- ✓ Implement `ndd-discuss-phase` to clarify business/API ambiguity, resolve conflicts, define in/out scope, and approve `CHANGE-SPEC.md` — Phase 4
- ✓ Implement `ndd-plan-phase` as an adapter that bridges an approved NDD change into GSD planning mechanics — Phase 5
- ✓ Avoid forking GSD core engines; customize at workflow, agent, prompt, and artifact-adapter layers — Phases 1-7
- ✓ Implement `ndd-execute-phase` as an adapter that reuses GSD execution and subagent coordination mechanics — Phase 6
- ✓ Implement `ndd-verify-work` to verify implementation against `CHANGE-SPEC.md`, not vague phase intent — Phase 7
- ✓ Implement `ndd-ship` to reuse GSD ship behavior and enrich PR context from NDD artifacts — Phase 7

### Active

*(No active requirements remaining)*

### Out of Scope

- Rewriting GSD's state engine, planner, executor, verifier, roadmap parser, git helpers, config system, drift guard, workstream logic, or ship core — NDD should reuse these primitives.
- Copy-pasting full GSD workflows into independent NDD forks — this would create long-term drift and duplicate bugfix burden.
- Treating NDD as new-project ideation — NDD is for existing codebases and concrete change requests.
- Requiring the user's source documents to be clean, complete, or internally consistent — ambiguity handling is a core NDD responsibility.
- Managing discovery-only change requests directly in `ROADMAP.md` — NDD discovery state belongs under `.planning/ndd/changes/`.

## Context

This is a brownfield GSD Core feature. The repository already contains the core workflow system, prompt artifacts, runtime installation surfaces, and many helper modules that should be reused rather than replaced.

The intended user already has a running project and periodically needs to add a feature, modify existing behavior, fix a flow, or implement a business/API change. The user's input is a folder of Markdown documents, not a single greenfield idea. Those documents may include API docs, business documents, proposals, and supporting notes. They may be incomplete, contradictory, or unclear.

The NDD lifecycle should make uncertainty explicit. Ingestion should extract claims with source traceability and mark ambiguities/conflicts. Impact discovery should identify likely affected code areas. Discussion should resolve unclear scope and produce an approved `CHANGE-SPEC.md`. Only after approval should the change bridge into GSD's phase planning/execution/verification flow.

The selected command naming aligns with GSD phase naming while keeping the NDD namespace distinct:

- `ndd-change`
- `ndd-impact`
- `ndd-discuss-phase`
- `ndd-plan-phase`
- `ndd-execute-phase`
- `ndd-verify-work`
- `ndd-ship`

The selected artifact layout is:

```text
.planning/ndd/
  changes/
    <change-id>/
      SOURCE-MANIFEST.md
      CHANGE-SPEC.md
      IMPACT.md
      CONTEXT.md
      STATUS.json
      phase-link.md
      VERIFICATION.md
```

`CHANGE-SPEC.md` owns the approved "what must change" contract. `CONTEXT.md` owns implementation discussion and decisions. `IMPACT.md` owns discovered affected areas, confidence levels, and codebase evidence.

## Current State

v1.0 shipped on 2026-07-09. The milestone delivered the complete NDD brownfield change workflow across seven phases:

- Fixed `ndd` namespace and runtime command/skill surface.
- Markdown folder intake with source manifests, stable change ids, and draft `CHANGE-SPEC.md`.
- Impact discovery over codebase maps and source evidence.
- Discussion and explicit approval gates for ambiguous change specs.
- Planning, execution, verification, and ship adapters that reuse GSD Core mechanics.

Milestone archives:

- Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Phase artifacts: `.planning/milestones/v1.0-phases/`

## Next Milestone Goals

No active requirements remain for v1.0. Candidate v2 directions are change management commands, impact refresh, chain orchestration, issue tracker ingestion, glossary generation, and change history reporting.

## Constraints

- **Namespace**: NDD must use the fixed `ndd` brand/namespace — The feature should be distinct from core GSD commands.
- **Architecture**: NDD should be a thin workflow/adaptor layer over GSD Core — The goal is to reuse GSD's context management, subagent orchestration, phase mechanics, verification, and ship behavior.
- **Artifacts**: NDD discovery state should live under `.planning/ndd/changes/<change-id>/` — Change intake and clarification should not pollute `ROADMAP.md` before the change is approved.
- **Bridge point**: Approved changes may bridge into GSD phase mechanics — This maximizes reuse while preserving a separate NDD discovery lifecycle.
- **Input format**: Initial change input is a folder of Markdown files — The workflow must support multiple source documents, not only one file.
- **Document quality**: Source documents can be ambiguous, contradictory, or incomplete — Ingestion and discussion must surface and resolve uncertainty before planning.
- **Brownfield requirement**: Codebase mapping is baseline knowledge — NDD should use `.planning/codebase/*` and source inspection for impact discovery.
- **Maintainability**: Do not hard-fork GSD core workflows — Forking core flows would create drift from future GSD fixes.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use fixed `ndd` namespace | Keeps the brownfield maintenance workflow branded and separate from GSD core commands | ✓ Decided (Phase 1) |
| Manage change discovery under `.planning/ndd/changes/<change-id>/` | Allows each change request to have its own lifecycle without immediately modifying `ROADMAP.md` | ✓ Decided (Phase 1 & 2) |
| Use `CHANGE-SPEC.md` as a separate artifact | Separates approved what/why/scope from implementation discussion and enables stronger verification | ✓ Decided (Phase 2) |
| Keep `CONTEXT.md` for implementation discussion | Reuses GSD's discussion pattern while avoiding scope/spec duplication | ✓ Decided (Phase 2 & 4) |
| Add explicit `ndd-impact` step | User change requests often start with only a start point; impact scope must be discovered against the codebase | ✓ Decided (Phase 3) |
| Make `ndd-discuss-phase` mandatory before planning | Business/API documents may be messy or conflicting; unresolved ambiguity should not silently reach the planner | ✓ Decided (Phase 4) |
| Use adapter/wrapper workflows rather than full workflow copies | Reuses GSD's core mechanics and avoids long-term drift | ✓ Decided (Phase 1-7) |
| Align command names with GSD phase naming | Makes NDD feel familiar while preserving namespace separation | ✓ Decided (Phase 1) |
| Reuse GSD execution mechanics for `ndd-execute-phase` | Ensures subagent parallelism and wave execution remain consistent | ✓ Decided (Phase 6) |
| Gate NDD ship on verification | Ensures only fully verified changes can be pushed to shipping stages | ✓ Decided (Phase 7) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition` or equivalent NDD bridge):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-09 after v1.0 milestone*
