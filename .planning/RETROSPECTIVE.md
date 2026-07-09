# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 - milestone

**Shipped:** 2026-07-09
**Phases:** 7 | **Plans:** 20 | **Sessions:** not tracked

### What Was Built

- Runtime and install surfaces for a fixed `ndd` namespace alongside existing GSD commands.
- Source-traceable Markdown change intake with deterministic change workspaces.
- Impact discovery, discussion approval, planning bridge, execution bridge, verification, and ship adapters for brownfield change work.
- Regression coverage for the NDD lifecycle and audit closeout behavior.

### What Worked

- Keeping NDD as a thin adapter over GSD Core avoided duplicating planner, executor, verifier, and ship internals.
- Source-traceable artifacts under `.planning/ndd/changes/<change-id>/` kept discovery state separate from approved GSD phase work.
- Focused tests made it possible to verify late milestone gaps without re-running the entire suite.

### What Was Inefficient

- Phase closeout exposed drift between UAT `status: passed` artifacts and the audit scanner's terminal status list.
- Some requirements were implemented but left marked pending until closeout, so readiness needed reconciliation.
- Phase archival moved tracked phase files while many planning artifacts are ignored, which makes commit hygiene more manual.

### Patterns Established

- NDD workflow commands should gate, resolve paths, and prepare context, then delegate heavy planning/execution/verification mechanics to canonical GSD commands.
- Brownfield requirements benefit from an early impact scout before approval, followed by confirmed impact after clarification when needed.
- Audit scanners must recognize every terminal status emitted by current workflows.

### Key Lessons

1. Treat milestone closeout as a verification reconciliation step, not just an archive operation.
2. Keep generated runtime artifacts rebuilt immediately after TypeScript source changes.
3. When planning artifacts are gitignored, explicitly check tracking status before relying on commit automation.

### Cost Observations

- Model mix: not tracked
- Sessions: not tracked
- Notable: Closeout work was dominated by artifact reconciliation rather than implementation changes.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | not tracked | 7 | Established NDD as a brownfield adapter layer over GSD Core. |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | Focused NDD and audit regressions passing | not measured | NDD adapters reuse existing GSD primitives. |

### Top Lessons (Verified Across Milestones)

1. Adapter workflows need explicit gate checks and traceability artifacts to avoid silently forking core behavior.
2. Closeout audits should be run before archival and again after any generated artifact rebuild.
