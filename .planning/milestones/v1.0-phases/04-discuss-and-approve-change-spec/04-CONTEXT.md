---
phase: 4
phase_name: Discuss and Approve Change Spec
status: planned
created: 2026-07-08
requirements: [DISC-01, DISC-02, DISC-03, DISC-04, DISC-05]
---

# Phase 4: Discuss and Approve Change Spec - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 builds `ndd-discuss-phase` — the interactive clarification step that turns a draft `CHANGE-SPEC.md` (with ambiguities, conflicts, and open questions) into an approved implementation contract. It sits between impact discovery (Phase 3) and planning bridge (Phase 5).

The phase delivers:
1. A TypeScript helper module (`src/ndd-discuss-spec.cts`) with deterministic spec-reading/updating logic
2. An `ndd discuss` router subcommand in `src/ndd-command-router.cts`
3. The `commands/ndd/discuss-phase.md` workflow adapter that drives the interactive discussion
4. NDD CONTEXT.md with implementation decisions
5. Approval gate enforcement (DISC-05): critical unresolved ambiguity blocks `ndd-plan-phase`

</domain>

<decisions>
## Implementation Decisions

### 1. Question Strategy — Seed from NDD Artifacts

- **D-01:** ndd-discuss-phase generates targeted questions by parsing CHANGE-SPEC.md ambiguities, conflicts, and open questions + IMPACT.md unknown/likely areas as question seeds.
- **D-02:** [informational] GSD-style gray-area analysis runs as fallback for anything the NDD artifacts didn't cover (e.g., acceptance criteria gaps, missing non-functional requirements). (Workflow adapter behavior — implicit in discuss-phase.md adapter prompt.)
- **D-03:** [informational] Impact findings grouped by requirement (from Phase 3 IMPACT.md) inform which questions are most important — unknown confidence areas get priority. (Ordering heuristic — implicit in the discuss adapter prompt.)

### 2. Spec Update Mechanics — Preserve Original + Resolved Section

- **D-04:** CHANGE-SPEC.md keeps original ambiguities/conflicts/open-questions sections intact for audit trail.
- **D-05:** A new `## Resolved` section is appended recording each resolution with the original reference, decision made, and source reference.
- **D-06:** CHANGE-SPEC.md frontmatter gets `approval_status` field (draft → discussed → approved).

### 3. Approval Flow — User Explicit Confirmation + Dual-Write

- **D-07:** Approval is always user-explicit. After all critical ambiguities are resolved, workflow asks user "Approve spec?" before marking approved. No auto-approve.
- **D-08:** Approval state is dual-written: `STATUS.json.status = 'approved'` AND `CHANGE-SPEC.md frontmatter approval_status = 'approved'`. STATUS.json is machine-readable for ndd-plan-phase gate; frontmatter is human-readable.
- **D-09:** DISC-05 enforcement: `ndd-plan-phase` reads STATUS.json to check approval gate. If not approved, refuse with clear message.

### 4. Ambiguity Severity — Binary Classification

- **D-10:** Ambiguity severity is `critical` or `non-critical`. Only critical ambiguities block approval.
- **D-11:** [informational] Non-critical ambiguities are acknowledged and recorded but do not prevent approval or planning. (Inverse of D-10 which is covered — critical blocks, non-critical doesn't.)
- **D-12:** The `extractAmbiguities()` helper tags each ambiguity with severity based on whether it would change the implementation approach if resolved differently.

### 5. NDD CONTEXT.md Placement — In NDD Change Folder

- **D-13:** [informational] Discussion CONTEXT.md goes into `.planning/ndd/changes/<change-id>/CONTEXT.md`, consistent with other NDD artifacts (SOURCE-MANIFEST.md, CHANGE-SPEC.md, IMPACT.md). (File path convention — implicit in resolveChangeWorkspace usage.)
- **D-14:** [informational] Phase 5 planning bridge reads CONTEXT.md from the NDD change folder, not from `.planning/phases/`. (Phase 5 concern — not enforced by Phase 4 code.)

### 6. Implementation Approach — Workflow + TS Helper

- **D-15:** Add `src/ndd-discuss-spec.cts` with 3 deterministic helpers:
  - `extractAmbiguities(changeSpecPath)` — parse CHANGE-SPEC.md into structured ambiguity/conflict/open-question list with severity tags
  - `writeResolvedSection(changeSpecPath, resolutions)` — append `## Resolved` section while preserving original content
  - `updateApprovalStatus(changeId, status)` — dual-write STATUS.json + CHANGE-SPEC.md frontmatter
- **D-16:** Creative work (asking questions, interpreting answers, synthesizing decisions) stays in `commands/ndd/discuss-phase.md` workflow prompt.
- **D-17:** Deterministic work (parsing spec, writing resolved section, updating approval status) uses TS helpers for correctness.

### 7. Router Extension — Structured JSON Response

- **D-18:** `src/ndd-command-router.cts` adds `discuss` subcommand: `gsd-tools ndd discuss <change-id>`.
- **D-19:** Returns structured JSON with: `change_id`, `workspace_dir`, `ambiguities` (list with severity + section_ref), `conflicts`, `open_questions`, `impact_summary`, `current_status`. Consistent with `ndd change` and `ndd impact` response patterns.

### 8. Acceptance Criteria and Scope Format — New CHANGE-SPEC.md Sections

- **D-20:** Discussion appends `## Acceptance Criteria` and `## Scope` (In-scope / Out-of-scope) sections to CHANGE-SPEC.md.
- **D-21:** CHANGE-SPEC.md remains the single source of truth for "what must change". CONTEXT.md holds implementation decisions.

### 9. Test Strategy — Unit + Integration

- **D-22:** Unit tests cover TS helper correctness: extractAmbiguities parse accuracy, writeResolvedSection preserves original content, updateApprovalStatus dual-write consistency, severity classification.
- **D-23:** Integration tests cover DISC-05 gate: ndd-plan-phase rejects unapproved changes, accepts approved changes.
- **D-24:** [informational] Follow test patterns from Phase 2 and Phase 3 (tests/*.test.cjs). (Convention guideline — executor reads existing test files in read_first.)

### Agent's Discretion

The planner may choose:
- Exact ambiguity parsing heuristics (heading-based vs marker-based vs frontmatter-based)
- Resolved section formatting details (table vs list)
- How the workflow prompt organizes NDD artifact seeds into user-facing questions
- Internal helper naming and module boundaries within ndd-discuss-spec.cts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope
- `.planning/PROJECT.md` — NDD as thin brownfield workflow layer over GSD Core
- `.planning/REQUIREMENTS.md` — DISC-01 through DISC-05 definitions
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, requirements

### Prior Phase Context
- `.planning/phases/02-change-intake-and-spec-drafting/02-CONTEXT.md` — CHANGE-SPEC.md structure, STATUS.json fields, workspace shape
- `.planning/phases/03-impact-discovery/03-CONTEXT.md` — IMPACT.md structure, confidence taxonomy, capability config

### Existing NDD Source
- `src/ndd-command-router.cts` — Router to extend with `discuss` subcommand
- `src/ndd-change-intake.cts` — `resolveChangeWorkspace()`, `readStatus()`, `writeStatus()`, `validateChangeId()` helpers to reuse
- `src/ndd-impact-discovery.cts` — Impact types and patterns to reference
- `commands/ndd/discuss-phase.md` — Placeholder command to implement

### GSD Discuss Pattern
- `.agents/gsd-core/workflows/discuss-phase.md` — GSD discuss interaction patterns to adapt (not fork)
- `.agents/gsd-core/references/gate-prompts.md` — Gate prompt patterns

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — Layer/module structure
- `.planning/codebase/CONVENTIONS.md` — Coding and naming conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveChangeWorkspace(projectRoot, changeId)` — resolves `.planning/ndd/changes/<change-id>/` path (reuse for CONTEXT.md writes)
- `readStatus(workspaceDir)` / `writeStatus(workspaceDir, data)` — STATUS.json management (update phase/status after approval)
- `validateChangeId(id)` — input validation (reuse for discuss router)
- `tokenizeHeadings(content)` — markdown section parser from `src/markdown-sectionizer.cts` (useful for extracting ambiguity sections)
- `platformWriteSync(path, content)` — cross-platform file write from `src/shell-command-projection.cts`
- `routeNddCommand()` pattern in `src/ndd-command-router.cts` — extend with discuss subcommand

### Established Patterns
- NDD modules import intake helpers via `require('./ndd-change-intake.cjs')` with type-safe require pattern
- Router returns structured JSON via `output(result, raw)` from `io.cts`
- Error reporting uses `error(message, ERROR_REASON.*)` pattern
- Tests follow `tests/*.test.cjs` naming, use Node built-in test runner

### Integration Points
- `src/ndd-command-router.cts` line 73: add `discuss` branch after `impact` branch
- `commands/ndd/discuss-phase.md`: currently a placeholder — needs full implementation as workflow adapter
- STATUS.json `status` field transitions: `draft` → `discussed` → `approved`
- CHANGE-SPEC.md frontmatter needs `approval_status` field addition

</code_context>

<specifics>
## Specific Ideas

- CHANGE-SPEC.md after discuss should have these sections in order: original goals/requirements/constraints → original ambiguities/conflicts/open-questions (preserved) → new Resolved section → new Acceptance Criteria → new Scope (in/out) → approval status in frontmatter
- STATUS.json phase progression: `intake` → `impact` → `discuss` → `approved`
- The `ndd discuss` router subcommand should also validate that CHANGE-SPEC.md exists (prerequisite from intake) before proceeding

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Discuss and Approve Change Spec*
*Context gathered: 2026-07-08*
