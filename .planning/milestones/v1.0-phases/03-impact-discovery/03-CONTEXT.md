---
phase: 3
phase_name: Impact Discovery
status: planned
created: 2026-07-08
requirements: [IMPT-01, IMPT-02, IMPT-03, IMPT-04]
---

# Phase 3 Context: Impact Discovery

## Goal

`ndd-impact` discovers likely affected code areas from the change spec, source docs, codebase map, and source inspection.

## Current State

Phase 2 completed the change intake pipeline:

- `src/ndd-change-intake.cts` — workspace creation, id validation, source ingestion, SOURCE-MANIFEST.md, draft CHANGE-SPEC.md
- NDD change workspace at `.planning/ndd/changes/<change-id>/` with STATUS.json, sources/, SOURCE-MANIFEST.md, CHANGE-SPEC.md
- Command routing via `src/ndd-command-router.cts` → `gsd-tools.cjs ndd change`

Codebase maps available at `.planning/codebase/`: ARCHITECTURE.md, STRUCTURE.md, STACK.md, CONVENTIONS.md, CONCERNS.md, INTEGRATIONS.md, TESTING.md

## Requirements Covered

- `IMPT-01`: `ndd-impact` reads `.planning/codebase/*` as baseline codebase knowledge.
- `IMPT-02`: `ndd-impact` inspects relevant source files based on the change start point and source documents.
- `IMPT-03`: `ndd-impact` writes `IMPACT.md` with confirmed, likely, and unknown affected areas.
- `IMPT-04`: `IMPACT.md` records evidence paths and confidence levels for each affected area.

<domain>
Impact discovery: analyze CHANGE-SPEC.md requirements → identify affected code areas → produce IMPACT.md grouped by CHANGE-SPEC sections.
</domain>

<decisions>

### 1. Impact Discovery Strategy — Prompt-driven A+ with Capability-based Tool Selection

Pipeline order:
1. Read `.planning/codebase/*` maps (baseline — always available)
2. Query wiki/knowledge base if `knowledge` capability available (domain context, business rules, prior decisions)
3. Use CodeGraph or equivalent tool if `callers`/`callees`/`impact_analysis`/`symbol_lookup` capabilities available (narrow scope precisely)
4. LLM reads narrowed source files + grep_search for semantic matching → reason about impact
5. Produce IMPACT.md

Tool selection is **not hardcoded** to any specific tool. It is driven by `gsd-core/ndd/codebase_capability.json`.

### 2. Capability Config — `gsd-core/ndd/codebase_capability.json`

Location: `gsd-core/ndd/codebase_capability.json` (project-level, ships with package, NOT in `.planning/`).

Schema:
```jsonc
{
  "tools": {
    "<tool-name>": {
      "available": true|false,
      "config": { /* tool-specific config */ },
      "capabilities": {
        "callers": true|false,      // find callers of a symbol
        "callees": true|false,      // find callees from a symbol
        "impact_analysis": true|false, // structural impact analysis
        "symbol_lookup": true|false,   // find symbol definitions
        "semantic": true|false,        // semantic/content search
        "knowledge": true|false        // domain knowledge, business rules
      }
    }
  }
}
```

Default tools:
- `codegraph`: callers=true, callees=true, impact_analysis=true, symbol_lookup=true, semantic=false, knowledge=false
- `grep_search`: callers=false, callees=false, impact_analysis=false, symbol_lookup=false, semantic=true, knowledge=false
- `wiki`: callers=false, callees=false, impact_analysis=false, symbol_lookup=false, semantic=true, knowledge=true

### 3. Wiki/Knowledge Integration

Wiki tools run at the **start** of the pipeline (before code analysis) to provide domain context.
- Query domain knowledge about the change requirements
- Discover implicit impacts from business rules (no direct code path)
- Evidence tagged `discovered_by: wiki.knowledge`
- Config: `wiki_path` and `query_tool` fields allow plugging any wiki tool

### 4. Runtime Transparency — Always Notify User

Before starting impact discovery, workflow MUST report tool availability:
- Available: `✓ CodeGraph available — using callers/callees/impact_analysis/symbol_lookup`
- Available: `✓ Wiki available — using knowledge/semantic`
- Fallback: `⚠ CodeGraph not available — falling back to codebase maps + LLM reasoning for callers/callees/impact analysis`
- Fallback: `⚠ Wiki not configured — skipping domain knowledge enrichment`

Auto-detect at runtime (check MCP/tool actually responds), merge with config, notify user.

### 5. Confidence Taxonomy — 3 Levels

- **confirmed** — direct code path match (CodeGraph callers/callees, explicit reference in CHANGE-SPEC)
- **likely** — indirect relationship (same module/layer, shared data model, pattern similarity)
- **unknown** — possible impact but insufficient evidence (cross-cutting concerns, implicit dependencies)

### 6. Evidence Format — Markdown Table with Discovered By

Each impact entry is a table row with: File | Evidence | Source Ref | Discovered By.

`Discovered By` records which capability/tool found the impact (codegraph.callers, wiki.knowledge, grep_search, codebase_map, llm_reasoning).

### 7. Missing Codebase Map Handling — Warn + User Choice

When `.planning/codebase/` is missing or empty:
- Warn user: impact discovery will be less accurate
- Present options: (1) Run /gsd:map-codebase first (recommended), (2) Continue with lightweight discovery, (3) Cancel
- Never block the user — their choice

### 8. IMPACT.md Structure — Grouped by CHANGE-SPEC Requirement

Each requirement/goal from CHANGE-SPEC.md gets its own impact table:

```markdown
---
change_id: <change-id>
phase: impact-discovery
status: draft
created: <ISO timestamp>
tools_used: [codegraph, grep_search, wiki]
---

# Impact Analysis: <change-id>

## Summary

| Confidence | Count |
|-----------|-------|
| Confirmed | N     |
| Likely    | N     |
| Unknown   | N     |

## Impact: Requirement R1 — "<requirement title>"

| File | Evidence | Source Ref | Discovered By |
|------|----------|------------|---------------|
| ... | ... | ... | ... |

## Impact: Requirement R2 — "<requirement title>"

| File | Evidence | Source Ref | Discovered By |
|------|----------|------------|---------------|
| ... | ... | ... | ... |

## Cross-cutting Impact

| File | Evidence | Source Ref | Discovered By |
|------|----------|------------|---------------|
| ... | ... | ... | ... |
```

Link ngược về CHANGE-SPEC.md sections — phục vụ Phase 4 (discuss/approve).

</decisions>

<specifics>
- Pipeline order is fixed: wiki → codebase maps → CodeGraph → LLM inspect → IMPACT.md
- `codebase_capability.json` schema must be extensible for future tools
- Each tool's `available` field can be overridden by runtime detection
- IMPACT.md goes into NDD change workspace: `.planning/ndd/changes/<change-id>/IMPACT.md`
- STATUS.json updated with `phase: "impact"` and `impact_path` after IMPACT.md created
</specifics>

<deferred>
None — all proposed items are within Phase 3 scope.
</deferred>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — IMPT-01 through IMPT-04 definitions
- `.planning/phases/02-change-intake-and-spec-drafting/02-CONTEXT.md` — workspace shape, STATUS.json fields
- `.planning/codebase/ARCHITECTURE.md` — codebase layer/module structure
- `.planning/codebase/STRUCTURE.md` — file organization
- `src/ndd-change-intake.cts` — existing intake helpers to extend
- `src/ndd-command-router.cts` — command routing for ndd-impact
- `commands/ndd/impact.md` — placeholder command to implement
</canonical_refs>

<code_context>
Reusable assets from prior phases:
- `resolveChangeWorkspace()` — resolves `.planning/ndd/changes/<change-id>/` (reuse for IMPACT.md writes)
- `readStatus()` / `writeStatus()` — STATUS.json management (update phase/artifacts after impact)
- `src/ndd-command-router.cts` — add `impact` subcommand routing
- `commands/ndd/impact.md` — exists as placeholder, needs full implementation
- `.planning/codebase/*.md` — existing maps to consume
- Capability pattern from `capabilities/*/capability.json` in GSD core — reference for schema design
</code_context>

## Boundaries

In scope:
- `gsd-core/ndd/codebase_capability.json` definition and runtime loader
- Capability-driven tool selection logic
- IMPACT.md template and writer
- `ndd-impact` command/skill implementation
- Wiki integration when available
- Missing-map user-choice flow
- Tests for capability loading, impact output, missing-map behavior

Out of scope:
- Interactive clarification of impact results (Phase 4)
- Bridging impact into GSD planning (Phase 5)
- Building the wiki tool itself (external dependency)
- CodeGraph tool implementation (external MCP)

## Risks

- CodeGraph MCP may not be available in all environments — capability fallback must be robust
- Wiki tool integration depends on external plugin — graceful skip when absent
- Large codebases may produce too many impact entries — consider a relevance threshold or limit
- CHANGE-SPEC.md may have vague requirements — impact discovery should flag low-confidence areas explicitly
