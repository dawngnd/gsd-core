# Phase 3 Research: Impact Discovery

## Summary

Phase 3 adds the `ndd-impact` command that reads a change workspace's `CHANGE-SPEC.md`, consults codebase maps (`.planning/codebase/*.md`), optionally queries wiki/CodeGraph capabilities, and writes `IMPACT.md` into the NDD change workspace. The implementation follows the established NDD pattern: deterministic TypeScript helpers in `src/`, command routing via `src/ndd-command-router.cts`, and a Markdown command prompt in `commands/ndd/impact.md`. A new `gsd-core/ndd/codebase_capability.json` config file defines available tools and their capabilities.

---

## Existing Patterns

### NDD Module Architecture (Phase 2)

Phase 2 established the NDD module pattern. All deterministic logic lives in TypeScript source files under `src/`, compiled to CommonJS under `gsd-core/bin/lib/`.

**Key file:** [ndd-change-intake.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts)

Pattern summary:
- **Types first**: Exported interfaces/types for all inputs, outputs, and results (lines 34–162)
- **Validation functions**: Pure helpers like `validateChangeId()`, `inferSourceRole()` (lines 207–384)
- **Workspace resolution**: `resolveChangeWorkspace()` returns structured `ok: true | ok: false` results (lines 232–255)
- **STATUS.json management**: `readExistingStatus()` / `statusWithDefaults()` for non-destructive status updates (lines 756–790)
- **Markdown rendering**: Pure string-building helpers (`renderSourceManifest`, `renderChangeSpec`) that produce complete Markdown files (lines 433–683)
- **File I/O**: Uses `platformWriteSync()` and `platformEnsureDir()` from [shell-command-projection.cts](file:///home/dangnd/code/github/gsd-core/src/shell-command-projection.cts#L635-L683) for cross-platform safety

### NDD Command Router

**Key file:** [ndd-command-router.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-command-router.cts)

The router is thin — 61 lines. It:
1. Imports `io.cjs` for `output()` and `ERROR_REASON`
2. Imports the intake module
3. Dispatches `args[1]` to subcommands (currently only `change`)
4. Returns structured JSON via `output()` on success, calls `error()` on failure

Currently, the router only supports `args[1] === 'change'`. Phase 3 must add `args[1] === 'impact'`. The error message at line 25 says: `'Unknown ndd subcommand. Available: change'` — this must be updated.

### GSD Tools CLI Integration

**Key file:** [gsd-tools.cjs](file:///home/dangnd/code/github/gsd-core/gsd-core/bin/gsd-tools.cjs#L264) (line 264)

The NDD command family is already wired:
```js
const { routeNddCommand } = require('./lib/ndd-command-router.cjs');
```
And dispatched at line 1044:
```js
case 'ndd': {
  routeNddCommand({ args, cwd, raw, error });
  break;
}
```

No changes needed to gsd-tools.cjs — the router handles subcommand dispatch internally.

### I/O Conventions

**Key file:** [io.cts](file:///home/dangnd/code/github/gsd-core/src/io.cts)

- `output(result, raw)` — JSON to stdout; auto-redirects to tmpfile if >50KB (line 127)
- `error(message, reason)` — structured error to stderr + `process.exit(1)` (line 211)
- `ERROR_REASON` — frozen enum of typed reason codes (line 163)

### Capability Pattern (GSD Capabilities)

**Key files:** [capabilities/intel/capability.json](file:///home/dangnd/code/github/gsd-core/capabilities/intel/capability.json), [capabilities/research/capability.json](file:///home/dangnd/code/github/gsd-core/capabilities/research/capability.json)

GSD capabilities use a fixed schema with fields: `id`, `role`, `version`, `title`, `description`, `tier`, `requires`, `engines`, `runtimeCompat`, `skills`, `agents`, `activationKey`, `config`, `commands`, `hooks`, `steps`, `contributions`, `gates`.

**Important distinction**: The `codebase_capability.json` from the CONTEXT decisions is a **different schema** — it's an NDD-specific tool availability config, not a GSD capability manifest. The naming is similar but the purpose and schema are different. The NDD config describes which codebase analysis tools are available (CodeGraph, grep_search, wiki), while GSD capability.json describes installable capability packs.

### NDD Change Status (STATUS.json)

**Key interface:** [NddChangeStatus](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L83-L94)

```typescript
export interface NddChangeStatus {
  change_id: string;
  status: string;
  phase: string;
  source_folder: string;
  source_count: number;
  artifacts: Record<string, string>;
  warnings: string[];
  created_at: string;
  updated_at: string;
  [key: string]: unknown;  // extensible with index signature
}
```

The `[key: string]: unknown` index signature means we can extend STATUS.json with `impact_path` without modifying the interface itself. The `phase` field transitions from `'intake'` → `'impact'`. The `artifacts` record can add `impact: 'IMPACT.md'`.

### Codebase Map Files

**Location:** `.planning/codebase/`

Seven files available:
| File | Size | Purpose |
|------|------|---------|
| [ARCHITECTURE.md](file:///home/dangnd/code/github/gsd-core/.planning/codebase/ARCHITECTURE.md) | 9KB | Layer/module structure, data flow, key abstractions |
| [STRUCTURE.md](file:///home/dangnd/code/github/gsd-core/.planning/codebase/STRUCTURE.md) | 8KB | Directory layout, file organization |
| [CONCERNS.md](file:///home/dangnd/code/github/gsd-core/.planning/codebase/CONCERNS.md) | 9KB | Cross-cutting concerns |
| [CONVENTIONS.md](file:///home/dangnd/code/github/gsd-core/.planning/codebase/CONVENTIONS.md) | 6KB | Naming, style, module design |
| [INTEGRATIONS.md](file:///home/dangnd/code/github/gsd-core/.planning/codebase/INTEGRATIONS.md) | 5KB | External integrations |
| [STACK.md](file:///home/dangnd/code/github/gsd-core/.planning/codebase/STACK.md) | 4KB | Technology stack |
| [TESTING.md](file:///home/dangnd/code/github/gsd-core/.planning/codebase/TESTING.md) | 6KB | Test patterns and coverage |

These are the baseline knowledge the impact discovery pipeline must read.

### Test Patterns

**Key file:** [ndd-change-intake.test.cjs](file:///home/dangnd/code/github/gsd-core/tests/ndd-change-intake.test.cjs)

Pattern summary:
- Uses Node's built-in `node:test` runner (`describe`, `test`, `beforeEach`, `afterEach`)
- Uses `node:assert/strict` for assertions
- Imports helpers from [tests/helpers.cjs](file:///home/dangnd/code/github/gsd-core/tests/helpers.cjs) (`createTempDir`, `cleanup`)
- Sets up temp directories with realistic source folder structures
- Tests both happy paths and error/edge cases
- Requires compiled `.cjs` modules from `gsd-core/bin/lib/`
- `runGsdTools()` helper executes `gsd-tools.cjs` as subprocess for integration tests

### NDD Impact Command Placeholder

**Key file:** [commands/ndd/impact.md](file:///home/dangnd/code/github/gsd-core/commands/ndd/impact.md)

Currently a Phase 1 placeholder. Frontmatter defines: `name: ndd:impact`, `effort: high`, `argument-hint: "<change-id>"`. The process section says it's deferred. Must be rewritten with full impact discovery workflow.

---

## Technical Approach

### Plan 03-01: IMPACT.md Template and Confidence Taxonomy

**Files to create:**
1. `gsd-core/ndd/codebase_capability.json` — Default tool capability config
2. Impact template structure defined in new module (or same module as impact logic)

**Key decisions from CONTEXT:**
- 3-level confidence taxonomy: `confirmed`, `likely`, `unknown`
- IMPACT.md has YAML frontmatter + summary table + per-requirement impact tables + cross-cutting section
- Evidence format: Markdown table with `File | Evidence | Source Ref | Discovered By` columns
- `Discovered By` values: `codegraph.callers`, `codegraph.callees`, `wiki.knowledge`, `grep_search`, `codebase_map`, `llm_reasoning`

**Implementation approach:**
- Define TypeScript types for impact entries, confidence levels, and the capability config schema in a new `src/ndd-impact-discovery.cts` module
- Implement pure `renderImpactMarkdown()` function following the pattern from `renderChangeSpec()` / `renderSourceManifest()`
- Implement `loadCodebaseCapabilityConfig()` to read and validate `gsd-core/ndd/codebase_capability.json`
- The capability config schema must be extensible (additional tools can be added without schema changes)

**`codebase_capability.json` default content:**
```jsonc
{
  "tools": {
    "codegraph": {
      "available": false,
      "config": {},
      "capabilities": {
        "callers": true,
        "callees": true,
        "impact_analysis": true,
        "symbol_lookup": true,
        "semantic": false,
        "knowledge": false
      }
    },
    "grep_search": {
      "available": true,
      "config": {},
      "capabilities": {
        "callers": false,
        "callees": false,
        "impact_analysis": false,
        "symbol_lookup": false,
        "semantic": true,
        "knowledge": false
      }
    },
    "wiki": {
      "available": false,
      "config": {
        "wiki_path": "",
        "query_tool": ""
      },
      "capabilities": {
        "callers": false,
        "callees": false,
        "impact_analysis": false,
        "symbol_lookup": false,
        "semantic": true,
        "knowledge": true
      }
    }
  }
}
```

### Plan 03-02: Impact Discovery Prompt/Workflow Implementation

**Files to modify:**
1. `src/ndd-command-router.cts` — Add `impact` subcommand
2. `commands/ndd/impact.md` — Full workflow prompt

**Files to create:**
1. `src/ndd-impact-discovery.cts` — Deterministic impact helpers

**Routing approach:** The `impact` subcommand in the router should:
1. Validate `change-id` argument
2. Resolve the change workspace
3. Verify STATUS.json exists and has passed intake
4. Check codebase map availability (`.planning/codebase/` presence)
5. Load capability config
6. Deterministically prepare context (read CHANGE-SPEC.md, read codebase maps)
7. Write initial IMPACT.md scaffold
8. Update STATUS.json with `phase: 'impact'` and `artifacts.impact: 'IMPACT.md'`

**The prompt-driven parts** (LLM reasoning, actual impact analysis) live in `commands/ndd/impact.md`. The TypeScript layer handles:
- Workspace validation
- Codebase map availability checking
- Capability config loading
- IMPACT.md template writing
- STATUS.json updates
- CHANGE-SPEC.md parsing (extract requirement sections for impact grouping)

**Missing codebase map handling:**
```
When .planning/codebase/ is missing or empty:
  → warn to stderr
  → return structured result with `codebase_map_available: false`
  → command prompt presents user choice: run map, continue lightweight, cancel
```

### Plan 03-03: Tests and Fixtures

**Files to create:**
1. `tests/ndd-impact-discovery.test.cjs` — Unit tests for helpers
2. Test fixtures for impact scenarios

**Test categories:**
1. **Capability config loading**: valid/invalid/missing config, schema validation
2. **IMPACT.md rendering**: correct Markdown structure, frontmatter, tables
3. **Missing codebase map detection**: warns correctly, returns structured result
4. **Status updates**: phase transitions from `intake` → `impact`, artifact additions
5. **Change-id validation reuse**: workspace resolution for impact (reuse from intake)
6. **Integration**: `runGsdTools('ndd impact <change-id>')` end-to-end

---

## Dependencies

### Internal Dependencies
| Dependency | Location | Used For |
|-----------|----------|----------|
| `resolveChangeWorkspace()` | [ndd-change-intake.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L232) | Resolve `.planning/ndd/changes/<change-id>/` |
| `NddChangeStatus` interface | [ndd-change-intake.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L83) | Read/write STATUS.json |
| `platformWriteSync()` | [shell-command-projection.cts](file:///home/dangnd/code/github/gsd-core/src/shell-command-projection.cts#L635) | Cross-platform file writes |
| `platformEnsureDir()` | [shell-command-projection.cts](file:///home/dangnd/code/github/gsd-core/src/shell-command-projection.cts#L680) | Directory creation |
| `output()`, `ERROR_REASON` | [io.cts](file:///home/dangnd/code/github/gsd-core/src/io.cts#L127) | CLI output and error handling |
| `extractFrontmatter()` | [frontmatter.cjs](file:///home/dangnd/code/github/gsd-core/src/frontmatter.cts) | Parse CHANGE-SPEC.md frontmatter (if present) |

### External Dependencies
| Dependency | Purpose | Fallback |
|-----------|---------|----------|
| `.planning/codebase/*.md` | Baseline codebase knowledge | Warn + lightweight mode |
| CodeGraph MCP | Structural caller/callee analysis | Skip — rely on codebase maps + LLM reasoning |
| Wiki/knowledge tool | Domain context, business rules | Skip — proceed without domain enrichment |

### Phase Dependencies
- **Phase 2 (completed)**: Change workspace with STATUS.json, CHANGE-SPEC.md, SOURCE-MANIFEST.md
- **Phase 4 (downstream consumer)**: `ndd-discuss-phase` reads IMPACT.md to ask targeted questions

---

## Risks and Mitigations

### Risk 1: `readExistingStatus` is not exported
**Impact:** Medium — The `readExistingStatus()` function in `ndd-change-intake.cts` (line 756) is not exported. The impact module needs to read STATUS.json.
**Mitigation:** Either (a) export it from the intake module, (b) re-implement a simple JSON reader in the impact module, or (c) use the `[key: string]: unknown` extensibility and just read STATUS.json directly with `JSON.parse(fs.readFileSync(...))`. Option (c) is simplest and matches the existing extensible design.

### Risk 2: Large IMPACT.md exceeding output buffer
**Impact:** Low — The `output()` function auto-redirects to tmpfile if >50KB, but IMPACT.md itself is written to disk, not to stdout. The risk is minimal.
**Mitigation:** Impact discovery results go to `output()` as a summary; IMPACT.md is written to the workspace directly.

### Risk 3: CHANGE-SPEC.md parsing for requirement sections
**Impact:** Medium — CHANGE-SPEC.md is free-form Markdown. Extracting individual "requirement" headings to group impact by is fragile.
**Mitigation:** Use the existing `tokenizeHeadings()` from `markdown-sectionizer.cjs` (already imported in intake) to parse section structure. The "## Confirmed Source-Backed Requirements" section contains bulleted requirements that can be extracted by line parsing. If parsing fails, fall back to a single un-grouped impact table.

### Risk 4: `gsd-core/ndd/` directory doesn't exist yet
**Impact:** Low — The `gsd-core/ndd/` directory needs to be created to house `codebase_capability.json`.
**Mitigation:** Create the directory and file as part of Plan 03-01. Ensure `package.json` `files` array includes it for npm publishing (check if `gsd-core/` is already included — likely yes since `gsd-core/bin/` is published).

### Risk 5: Capability config vs GSD capability manifests confusion
**Impact:** Medium — The `codebase_capability.json` schema is different from `capabilities/*/capability.json`. Name similarity may confuse contributors.
**Mitigation:** Document the distinction clearly in code comments. The NDD config lives under `gsd-core/ndd/` (not under `capabilities/`) and uses a different schema focused on tool availability rather than installable feature packs.

### Risk 6: CodeGraph/Wiki tools may not be available at test time
**Impact:** Low — Tests should not depend on external MCP tools.
**Mitigation:** Tests verify the deterministic parts: config loading, IMPACT.md template rendering, missing-map detection, status updates. Actual tool invocation is prompt-driven and tested through the command prompt, not the TypeScript layer.

---

## Validation Architecture

### Unit Tests (Plan 03-03)
1. **`loadCodebaseCapabilityConfig()` tests:**
   - Returns default config when file not found
   - Parses valid JSON correctly
   - Returns default + warning for invalid JSON
   - Validates schema (rejects missing `tools` key)

2. **`renderImpactMarkdown()` tests:**
   - Produces valid Markdown with YAML frontmatter
   - Summary table has correct confidence counts
   - Per-requirement tables have correct columns
   - Cross-cutting section is included
   - Empty impact entries produce "None identified" rows

3. **`checkCodebaseMapAvailability()` tests:**
   - Returns `available: true` with file list when `.planning/codebase/` exists with `.md` files
   - Returns `available: false` when directory is missing
   - Returns `available: false` when directory is empty

4. **Missing-map behavior tests:**
   - `ndd impact <change-id>` with no `.planning/codebase/` returns structured warning
   - STATUS.json is NOT updated when map is missing and user would cancel

5. **Status transition tests:**
   - STATUS.json `phase` updates from `intake` to `impact`
   - STATUS.json `artifacts.impact` is set to `IMPACT.md`
   - Existing STATUS.json fields are preserved
   - `updated_at` timestamp is refreshed

### Integration Tests
6. **`runGsdTools('ndd impact <change-id>')` tests:**
   - Returns error for missing change-id argument
   - Returns error for non-existent change workspace
   - Returns structured result with impact summary

### UAT Criteria (from ROADMAP Success Criteria)
- SC1: `ndd-impact` refuses or warns when no codebase map exists → Test #4
- SC2: `IMPACT.md` identifies confirmed, likely, and unknown → Test #2
- SC3: Each impact entry includes code paths or evidence references → Test #2
- SC4: Impact output feeds targeted questions for `ndd-discuss-phase` → By structure (IMPACT.md grouped by requirement)

---

## Key Files

### Files to Create
| File | Purpose |
|------|---------|
| `src/ndd-impact-discovery.cts` | Deterministic impact helpers: capability config loader, IMPACT.md renderer, codebase map checker, CHANGE-SPEC section extractor |
| `gsd-core/ndd/codebase_capability.json` | Default tool capability configuration |
| `tests/ndd-impact-discovery.test.cjs` | Unit + integration tests |

### Files to Modify
| File | Change |
|------|--------|
| [src/ndd-command-router.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-command-router.cts) | Add `impact` subcommand routing (args[1] === 'impact'), update available subcommands error message |
| [commands/ndd/impact.md](file:///home/dangnd/code/github/gsd-core/commands/ndd/impact.md) | Replace placeholder with full impact discovery workflow prompt |

### Files to Read (Not Modify)
| File | Purpose |
|------|---------|
| [src/ndd-change-intake.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts) | Reuse `resolveChangeWorkspace()`, `NddChangeStatus`, `validateChangeId()` |
| [src/io.cts](file:///home/dangnd/code/github/gsd-core/src/io.cts) | `output()`, `error()`, `ERROR_REASON` for CLI output |
| [src/shell-command-projection.cts](file:///home/dangnd/code/github/gsd-core/src/shell-command-projection.cts) | `platformWriteSync()`, `platformEnsureDir()` for file I/O |
| [src/markdown-sectionizer.cts](file:///home/dangnd/code/github/gsd-core/src/markdown-sectionizer.cts) | `tokenizeHeadings()` for parsing CHANGE-SPEC.md sections |
| [tests/helpers.cjs](file:///home/dangnd/code/github/gsd-core/tests/helpers.cjs) | `createTempDir()`, `cleanup()`, `runGsdTools()` for tests |

### Build Artifacts (Auto-generated)
| Source | Generated |
|--------|-----------|
| `src/ndd-impact-discovery.cts` | `gsd-core/bin/lib/ndd-impact-discovery.cjs` |
| `src/ndd-command-router.cts` | `gsd-core/bin/lib/ndd-command-router.cjs` |
