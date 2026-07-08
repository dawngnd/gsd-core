---
status: passed
phase: 03-impact-discovery
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md]
started: 2026-07-08T12:38:21+07:00
updated: 2026-07-08T12:48:00+07:00
---

## Current Test

number: 7
name: Full Test Suite and Regression Check
expected: |
  All 26 impact discovery tests pass, all 13 intake tests pass (no regression)
awaiting: complete

## Tests

### 1. Capability Config JSON Schema
expected: `gsd-core/ndd/codebase_capability.json` exists with 3 tools (codegraph, grep_search, wiki), each with available/config/capabilities. codegraph=false, grep_search=true, wiki=false. Each capabilities has 6 boolean keys.
result: pass
source: automated

### 2. Config Loader Default Fallback
expected: `loadCodebaseCapabilityConfig('/nonexistent')` returns default config with `grep_search.available === true` and `codegraph.available === false`. `checkCodebaseMapAvailability('.')` detects 7 codebase map files.
result: pass
source: automated

### 3. CHANGE-SPEC Requirement Extraction
expected: `extractRequirementSections()` extracts bullet items from "Confirmed Source-Backed Requirements" section as `[{id: 'R1', title: '...'}, ...]`. Returns `[]` when no matching section found.
result: pass
source: automated

### 4. IMPACT.md Renderer
expected: `renderImpactMarkdown()` produces Markdown with YAML frontmatter (change_id, phase, status), summary table (Confirmed/Likely/Unknown counts), per-requirement impact sections with 4-column tables (File, Evidence, Source Ref, Discovered By), cross-cutting section, and pipe-character escaping.
result: pass
source: automated

### 5. runImpactDiscovery Error Handling
expected: Returns `{ok: false, error: {code: 'invalid_change_id'}}` for path-traversal ids. Returns `{ok: false, error: {code: 'workspace_not_found'}}` for non-existent workspaces.
result: pass
source: automated

### 6. Command Router Integration
expected: `routeNddCommand` dispatches `impact` subcommand. `gsd-tools.cjs ndd impact` without change-id shows usage error. Unknown subcommand error lists both `change` and `impact`.
result: pass
source: automated

### 7. Full Test Suite and Regression Check
expected: All 26 impact discovery tests pass (4 config + 3 map + 6 render + 4 extract + 6 orchestrator + 3 CLI). All 13 existing intake tests pass with 0 regressions.
result: pass
source: automated

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
