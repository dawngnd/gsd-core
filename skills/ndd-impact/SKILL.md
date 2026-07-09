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
Discover likely affected code areas for an NDD change using codebase maps, capability-based tool selection, and LLM source inspection. Write a structured `IMPACT.md` grouped by CHANGE-SPEC requirements.
</objective>

<execution_context>
@.planning/PROJECT.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/STRUCTURE.md
</execution_context>

<process>

### Step 1 — Run deterministic helper

Run the local helper to validate workspace, check codebase map availability, load capability config, and write the initial IMPACT.md scaffold:

```bash
node .agents/gsd-core/bin/gsd-tools.cjs ndd impact <change-id>
```

If the project-local `.agents` helper is unavailable, use the package helper from the repository:

```bash
node gsd-core/bin/gsd-tools.cjs ndd impact <change-id>
```

Parse the JSON result. If `ok: false`, report the error to the user and **stop**.

### Step 2 — Report tool availability

For each tool in `capability_config.tools`:
- If `available: true`: report `✓ <tool> available — using <comma-separated true capabilities>`
- If `available: false`: report `⚠ <tool> not available — <fallback description>`

Example output:
```
✓ grep_search available — using semantic
⚠ codegraph not available — falling back to codebase maps + LLM reasoning for callers/callees/impact analysis
⚠ wiki not available — skipping domain knowledge enrichment
```

### Step 3 — Handle missing codebase map

If `codebase_map_available: false` in the result:

1. Warn the user: "⚠ No codebase map found at `.planning/codebase/`. Impact discovery will be less accurate without codebase maps."
2. Present three choices:
   - **(1) Run `/gsd-map-codebase` first** (recommended) — stop and tell the user to run map-codebase
   - **(2) Continue with lightweight discovery** — proceed with grep_search + LLM reasoning only
   - **(3) Cancel** — stop the workflow

If user chooses (1), stop and instruct them to run `/gsd-map-codebase` first, then re-run `/ndd:impact <change-id>`.
If user chooses (3), stop.
If user chooses (2), proceed with available tools only.

If `codebase_map_available: true`, proceed normally.

### Step 4 — Read context

Read the following files to build analysis context:
- `.planning/codebase/*.md` files (from `codebase_map_files` in the result) — codebase architecture, structure, conventions
- `CHANGE-SPEC.md` from the change workspace (`.planning/ndd/changes/<change-id>/CHANGE-SPEC.md`)
- `SOURCE-MANIFEST.md` from the change workspace
- Source documents under `sources/` in the change workspace

### Step 5 — Wiki enrichment (if wiki tool available)

If `capability_config.tools.wiki.available: true`:
- Query wiki/knowledge base about each CHANGE-SPEC requirement for domain context
- Look for business rules, prior decisions, and implicit impacts
- Tag findings with `discovered_by: wiki.knowledge`

If wiki is not available, skip this step.

### Step 6 — CodeGraph analysis (if codegraph tool available)

If `capability_config.tools.codegraph.available: true`:
- For each requirement, query available capabilities:
  - `callers` — find callers of identified symbols
  - `callees` — find callees from identified symbols
  - `impact_analysis` — structural impact analysis
  - `symbol_lookup` — find symbol definitions
- Tag findings with `discovered_by: codegraph.<capability>`

If codegraph is not available, skip this step. The LLM source inspection step will compensate.

### Step 7 — LLM source inspection

Based on codebase map context and CHANGE-SPEC requirements:
1. Identify relevant source files from codebase maps (ARCHITECTURE.md, STRUCTURE.md)
2. Use `grep_search` to find matching patterns in codebase (function names, module references, data models)
3. Read and reason about identified source files
4. Assign confidence levels:
   - **confirmed** — direct code path match (explicit reference, direct dependency)
   - **likely** — indirect relationship (same module/layer, shared data model, pattern similarity)
   - **unknown** — possible impact but insufficient evidence (cross-cutting concerns, implicit dependencies)
5. Tag findings with `discovered_by: grep_search`, `codebase_map`, or `llm_reasoning`

### Step 8 — Write final IMPACT.md

1. Read the scaffold IMPACT.md created in Step 1 (at `.planning/ndd/changes/<change-id>/IMPACT.md`)
2. Replace the scaffold with actual populated impact entries grouped by requirement
3. Each impact entry must have: File, Evidence, Source Ref, Discovered By
4. Update the summary table with actual counts (Confirmed, Likely, Unknown)
5. Update frontmatter `status` from `draft` to `complete`
6. Add `tools_used` list with actually used tools
7. Write the final IMPACT.md to `.planning/ndd/changes/<change-id>/IMPACT.md`

</process>

<success_criteria>
- `IMPACT.md` exists at `.planning/ndd/changes/<change-id>/IMPACT.md`
- Every requirement from CHANGE-SPEC has an impact section (even if "None identified")
- Each impact entry has file path, evidence, source reference, and `discovered_by` attribution
- Tool availability was reported to the user before analysis began
- Missing codebase map was handled with user choice (not silently skipped)
- STATUS.json `phase` is `impact` and `artifacts.impact` is `IMPACT.md`
</success_criteria>

