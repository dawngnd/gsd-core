# Roadmap: NDD Brownfield Change Workflow

## Overview

NDD will be built as a namespaced brownfield change workflow layered on top of GSD Core. The roadmap first establishes the `ndd` command/install surface, then adds change intake and `CHANGE-SPEC.md`, impact discovery, mandatory discussion/spec approval, and finally adapter workflows that bridge approved NDD changes into GSD planning, execution, verification, and ship mechanics.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: NDD Namespace Foundation** - Add the fixed `ndd` command/skill namespace and shared artifact conventions without disturbing GSD commands. (completed 2026-07-08)
- [x] **Phase 2: Change Intake and Spec Drafting** - Ingest Markdown document folders and create source-traceable NDD change artifacts. (completed 2026-07-08)
- [x] **Phase 3: Impact Discovery** - Map a change start point to likely affected code areas using codebase maps and source inspection. (completed 2026-07-08)
- [x] **Phase 4: Discuss and Approve Change Spec** - Resolve ambiguity/conflicts and approve `CHANGE-SPEC.md` before planning. (completed 2026-07-08)
- [ ] **Phase 5: Planning Bridge** - Adapt approved NDD changes into GSD planning mechanics.
- [ ] **Phase 6: Execution Bridge** - Reuse GSD execution/subagent mechanics while preserving NDD traceability.
- [ ] **Phase 7: Verification, Ship, and Hardening** - Verify against `CHANGE-SPEC.md`, enrich ship output, and cover the NDD workflow with tests.

## Phase Details

### Phase 1: NDD Namespace Foundation

**Goal**: Users can invoke NDD-branded workflow commands through the existing runtime artifact system while GSD commands remain unchanged.
**Depends on**: Nothing (first phase)
**Requirements**: [NDD-01, NDD-02, MNT-01, MNT-02]
**Success Criteria** (what must be TRUE):

  1. User can discover NDD commands as distinct from GSD commands in supported runtime surfaces.
  2. Existing GSD command installation and invocation behavior remains unchanged.
  3. NDD command definitions share GSD helper primitives instead of introducing a parallel core.
  4. Tests or contract checks cover non-GSD namespace installation/routing behavior.

**Plans**: 3/3 plans complete

Plans:

- [x] 01-01-PLAN.md
- [x] 01-02-PLAN.md
- [x] 01-03-PLAN.md

**Wave 1**

- [x] 01-01: Analyze installer/runtime artifact support for non-GSD namespaces.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02: Add NDD command/skill scaffolding and shared naming/artifact references.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03: Add namespace install/routing tests and preserve GSD namespace behavior.

### Phase 2: Change Intake and Spec Drafting

**Goal**: User can start `ndd-change` with a folder of Markdown documents and receive a traceable draft change spec.
**Depends on**: Phase 1
**Requirements**: [NDD-03, INTK-01, INTK-02, INTK-03, INTK-04, INTK-05]
**Success Criteria** (what must be TRUE):

  1. User can provide a Markdown folder and get `.planning/ndd/changes/<change-id>/`.
  2. `SOURCE-MANIFEST.md` lists ingested files and inferred roles.
  3. `CHANGE-SPEC.md` separates confirmed requirements, ambiguities, conflicts, open questions, and source references.
  4. Change ids are stable enough to resume later commands.

**Plans**: 3/3 plans complete

Plans:

- [x] 02-01-PLAN.md
- [x] 02-02-PLAN.md
- [x] 02-03-PLAN.md

- [x] 02-01: Design NDD change folder schema, `STATUS.json`, and change-id generation.
- [x] 02-02: Implement Markdown folder ingestion and source manifest generation.
- [x] 02-03: Implement draft `CHANGE-SPEC.md` synthesis with ambiguity/conflict sections.

### Phase 3: Impact Discovery

**Goal**: `ndd-impact` discovers likely affected code areas from the change spec, source docs, codebase map, and source inspection.
**Depends on**: Phase 2
**Requirements**: [IMPT-01, IMPT-02, IMPT-03, IMPT-04]
**Success Criteria** (what must be TRUE):

  1. `ndd-impact` refuses or warns when no codebase map exists and points users to codebase mapping.
  2. `IMPACT.md` identifies confirmed, likely, and unknown affected areas.
  3. Each impact entry includes code paths or evidence references where available.
  4. Impact output feeds targeted questions for `ndd-discuss-phase`.

**Plans**: 3/3 plans complete

Plans:

- [x] 03-01-PLAN.md
- [x] 03-02-PLAN.md
- [x] 03-03-PLAN.md

**Wave 1**

- [x] 03-01: Define `IMPACT.md` template and confidence taxonomy.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02: Implement impact discovery prompt/workflow using `.planning/codebase/*` and source inspection.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03: Add tests/fixtures for impact output and missing-map behavior.

### Phase 4: Discuss and Approve Change Spec

**Goal**: `ndd-discuss-phase` turns messy business/API/proposal docs into an approved implementation contract.
**Depends on**: Phase 3
**Requirements**: [DISC-01, DISC-02, DISC-03, DISC-04, DISC-05]
**Success Criteria** (what must be TRUE):

  1. User is asked targeted questions based on ambiguities, conflicts, impact findings, and missing acceptance criteria.
  2. `CHANGE-SPEC.md` records in scope, out of scope, assumptions, acceptance criteria, and unresolved non-blocking notes.
  3. Critical unresolved ambiguity blocks `ndd-plan-phase`.
  4. User can approve the spec before planning begins.

**Plans**: 3/3 plans complete

Plans:

- [x] 04-01-PLAN.md
- [x] 04-02-PLAN.md
- [x] 04-03-PLAN.md

**Wave 1**

- [x] 04-01: Create NDD discuss workflow and question strategy based on GSD discuss principles.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02: Implement spec update/approval state transitions.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03: Add tests for critical ambiguity blocking and approved spec gating.

### Phase 5: Planning Bridge

**Goal**: `ndd-plan-phase` validates an approved change and bridges it into GSD planning mechanics.
**Depends on**: Phase 4
**Requirements**: [PLAN-01, PLAN-02, PLAN-03, PLAN-04]
**Success Criteria** (what must be TRUE):

  1. `ndd-plan-phase` refuses unapproved or critically ambiguous changes.
  2. Approved `CHANGE-SPEC.md`, `IMPACT.md`, and NDD `CONTEXT.md` are transformed into planner-readable bridge context.
  3. GSD plan-check/source-grounding conventions remain active.
  4. NDD records the produced phase/plan linkage in the change folder.

**Plans**: 1/3 plans executed

Plans:

- [x] 05-01-PLAN.md
- [ ] 05-02-PLAN.md
- [ ] 05-03-PLAN.md

- [ ] 05-01: Define bridge model from NDD change artifact to GSD phase/planning context.
- [ ] 05-02: Implement `ndd-plan-phase` wrapper/adaptor workflow.
- [ ] 05-03: Add regression tests for approved-spec gating and phase-link metadata.

### Phase 6: Execution Bridge

**Goal**: `ndd-execute-phase` reuses GSD execution and subagent mechanics while preserving traceability back to the NDD change.
**Depends on**: Phase 5
**Requirements**: [EXEC-01, EXEC-02, EXEC-03]
**Success Criteria** (what must be TRUE):

  1. User can execute an NDD-planned change through the NDD command surface.
  2. Execution summaries and status remain traceable to the NDD change id.
  3. NDD execution avoids duplicating GSD executor internals.

**Plans**: 2 plans

Plans:

- [ ] 06-01: Implement execution wrapper that loads NDD phase-link metadata and routes to GSD execution mechanics.
- [ ] 06-02: Add traceability/status updates and tests for execution handoff.

### Phase 7: Verification, Ship, and Hardening

**Goal**: NDD verifies completed work against `CHANGE-SPEC.md`, reuses ship flow, and has enough tests to maintain safely.
**Depends on**: Phase 6
**Requirements**: [VERF-01, VERF-02, SHIP-01, SHIP-02, MNT-03]
**Success Criteria** (what must be TRUE):

  1. `ndd-verify-work` checks implementation against `CHANGE-SPEC.md` acceptance criteria.
  2. Verification output is stored or linked from the NDD change folder.
  3. `ndd-ship` enriches PR/review context with NDD spec, impact, and verification evidence.
  4. Tests cover the core NDD lifecycle from intake through ship handoff.

**Plans**: 3 plans

Plans:

- [ ] 07-01: Implement verification wrapper targeting `CHANGE-SPEC.md`.
- [ ] 07-02: Implement ship wrapper and PR context enrichment.
- [ ] 07-03: Add lifecycle documentation, command reference updates, and end-to-end workflow tests.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. NDD Namespace Foundation | 3/3 | Complete    | 2026-07-08 |
| 2. Change Intake and Spec Drafting | 3/3 | Complete    | 2026-07-08 |
| 3. Impact Discovery | 3/3 | Complete   | 2026-07-08 |
| 4. Discuss and Approve Change Spec | 3/3 | Complete   | 2026-07-08 |
| 5. Planning Bridge | 1/3 | In Progress|  |
| 6. Execution Bridge | 0/2 | Not started | - |
| 7. Verification, Ship, and Hardening | 0/3 | Not started | - |
