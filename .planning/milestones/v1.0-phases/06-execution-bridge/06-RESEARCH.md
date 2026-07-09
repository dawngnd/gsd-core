# Phase 6: Execution Bridge — Research

**Researched:** 2026-07-09
**Phase:** 06-execution-bridge
**Requirements:** EXEC-01, EXEC-02, EXEC-03

---

## 1. Existing NDD Command Router

**File:** [ndd-command-router.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-command-router.cts)

### Subcommand Dispatch Pattern

The router uses a single `routeNddCommand` function (L236-421) with chained `if/else if` blocks on `args[1]` (the subcommand token). Current subcommands in order:

1. `change` (L239)
2. `impact` (L267)
3. `discuss` (L284)
4. `discuss-update` (L301)
5. `discuss-check` (L323)
6. `plan` (L340)
7. `plan-context` (L358)
8. `plan-link` (L376)
9. **else** → unknown command error (L418)

**Insertion point for `execute`:** Add a new `else if (subcommand === 'execute')` branch **after the `plan-link` branch** (L376-417) and **before the `else` fallback** (L418).

### Argument Parsing Pattern

Each subcommand follows a consistent pattern:

```typescript
} else if (subcommand === 'plan') {
    const changeId = args[2];
    const phaseId = args[3];
    if (!changeId || changeId.startsWith('-')) {
      error('Usage: gsd-tools ndd plan <change-id> [phase-id]', ERROR_REASON.USAGE);
      return;
    }
    if (phaseId?.startsWith('-') || args.length > 4) {
      error('Usage: ...', ERROR_REASON.USAGE);
      return;
    }
    // ... business logic ...
    if (result.ok) {
      output(result.value, raw);
    } else {
      error(result.message, ERROR_REASON.SDK_MISSING_ARG);
    }
}
```

### JSON Output Pattern

All subcommands return structured JSON via `output(result, raw)` from [io.cts](file:///home/dangnd/code/github/gsd-core/src/io.cts) (L127). The `output()` function JSON-stringifies the result; payloads >50KB go to temp file with `@file:` prefix.

### Error Reporting Pattern

Errors use `error(message, ERROR_REASON.*)` from [io.cts](file:///home/dangnd/code/github/gsd-core/src/io.cts#L211). Common reason codes for NDD:
- `ERROR_REASON.USAGE` — argument validation failures
- `ERROR_REASON.SDK_MISSING_ARG` — business logic failures (missing artifacts, unapproved state)
- `ERROR_REASON.SDK_UNKNOWN_COMMAND` — unknown subcommand

### Imports and Interface

```typescript
// L32-37: RouteNddCommandOptions interface
interface RouteNddCommandOptions {
  args: string[];
  cwd: string;
  raw: boolean;
  error: (message: string, reason?: string) => void;
}
```

### Existing Helper Imports (L15-30)

```typescript
import ioMod = require('./io.cjs');
const { output, ERROR_REASON } = ioMod;
import intake = require('./ndd-change-intake.cjs');
import impact = require('./ndd-impact-discovery.cjs');
import discuss = require('./ndd-discuss-spec.cjs');
import bridge = require('./ndd-plan-bridge.cjs');
import phaseLocator = require('./phase-locator.cjs');
```

### Reusable Internal Functions

- `toPosixPath(value)` (L48) — path normalization
- `isPathInside(parent, child)` (L52) — path containment check
- `locateCurrentPhase(projectRoot, phaseId)` (L70-84) — returns `LocatedPhase | null`
- `LocatedPhase` interface (L41-46): `{ phase_id, phase_dir, phase_name, phase_slug }`

### Unknown Command Error Message (L418-419)

The error message must be updated to include `execute`:
```typescript
error('Unknown ndd subcommand. Available: change, impact, discuss, discuss-update, discuss-check, plan, plan-context, plan-link', ERROR_REASON.SDK_UNKNOWN_COMMAND);
```

---

## 2. Phase 5 Plan Bridge Implementation

**File:** [ndd-plan-bridge.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-plan-bridge.cts)

### Key Types

| Type | Lines | Purpose |
|------|-------|---------|
| `BridgeError` | L42-46 | Error with code, message, optional artifact path |
| `BridgeArtifactRefs` | L48-54 | Relative paths: status, change_spec, impact, context, phase_link |
| `NddBridgeArtifact` | L56-60 | Path + relative_path + content |
| `PlanningBridge` | L75-89 | Full bridge data including artifacts, planner_context, approval_status |
| `PreparePlanningBridgeResult` | L91 | `{ ok: true; bridge: PlanningBridge } | { ok: false; error: BridgeError }` |
| `WritePhaseLinkOptions` | L111-118 | Inputs for writePhaseLink |
| `WritePhaseLinkResult` | L120-128 | Result with change_id, paths, content |
| `WorkspacePaths` | L130-140 | Internal workspace path resolution |

### phase-link.md Format (Written by `writePhaseLink`, L505-550)

The file uses **plain Markdown list** format (NOT YAML frontmatter):

```markdown
# NDD Phase Link: <change-id>

- Change id: <change-id>
- GSD phase id: <phase-id>
- GSD phase directory: <phase-dir>
- Linked at: <ISO timestamp>

## Plan Files

- <plan-file-relative-path>
- <plan-file-relative-path>

## Source Artifacts

- STATUS.json: <relative-path>
- CHANGE-SPEC.md: <relative-path>
- IMPACT.md: <relative-path>
- CONTEXT.md: <relative-path>
```

### Reading phase-link.md (for execute subcommand)

**No existing reader function.** The `writePhaseLink` function only writes. To read phase-link.md for the execute subcommand, the implementer must:

1. Read `.planning/ndd/changes/<change-id>/phase-link.md`
2. Parse the markdown list items to extract:
   - `Change id` → regex: `/^- Change id:\s*(.+)$/m`
   - `GSD phase id` → regex: `/^- GSD phase id:\s*(.+)$/m`
   - `GSD phase directory` → regex: `/^- GSD phase directory:\s*(.+)$/m`
   - `Plan Files` → lines after `## Plan Files` heading matching `/^- (.+)$/`

### `resolveBridgeWorkspace` (L155-185) — Private but pattern is reusable

Returns `WorkspacePaths` containing all paths within the change workspace. This pattern is private to `ndd-plan-bridge.cts` but the same resolution can be built inline in the router using the imported `resolveChangeWorkspace` + `validateChangeId` from intake.

### Exported Functions

| Function | Lines | Reusable for Phase 6? |
|----------|-------|-----------------------|
| `ensureChangeContext` | L316 | No — planning-specific |
| `renderPlannerBridgeContext` | L371 | No — planning-specific |
| `preparePlanningBridge` | L422 | No — includes approval re-check |
| `writePhaseLink` | L505 | No — write-only, Phase 6 needs read |

---

## 3. NDD Change Intake Helpers

**File:** [ndd-change-intake.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts)

### `resolveChangeWorkspace(projectRoot, changeId)` (L232-255)

Validates change ID and resolves workspace path:

```typescript
// Returns:
interface ChangeWorkspaceResolutionSuccess {
  ok: true;
  change_id: string;
  workspace_dir: string;           // absolute path
  relative_workspace_dir: string;  // e.g. ".planning/ndd/changes/<id>"
}
```

Path: `.planning/ndd/changes/<change-id>/`

**Reuse:** YES — direct import in router already exists as `intake.resolveChangeWorkspace()`

### `validateChangeId(changeId)` (L207-229)

Validates change-id format: lowercase letters, numbers, hyphens only. Rejects reserved names, dot segments, path separators.

```typescript
// Returns:
{ valid: true, change_id: string } | { valid: false, code: string, message: string }
```

**Reuse:** YES — already imported in router

### `readStatus` — Does NOT exist as exported function

The context mentioned `readStatus()` but this function is **private** (`readExistingStatus`, L756-766). It's a module-private helper:

```typescript
function readExistingStatus(statusPath: string): NddChangeStatus | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof record['change_id'] !== 'string') return null;
    return record as NddChangeStatus;
  } catch { return null; }
}
```

The router's `readJsonObject` (L187-195 in `ndd-plan-bridge.cts`) is also private. For the execute subcommand, STATUS.json reading can be done inline with `JSON.parse(fs.readFileSync(...))`.

### Change ID Format (for dual-path resolution)

Per D-06, change IDs use kebab-case with dashes (e.g., `api-migration-3f2a9b1c2e`), while phase IDs are numbers or number-slug (e.g., `06`, `6`).

**Detection heuristic:**
- Phase ID: matches `/^\d+$/` or `/^\d+-/` (starts with digits)
- Change ID: matches `/^[a-z][a-z0-9-]*$/` and does NOT start with digit

---

## 4. Existing NDD Workflow Adapter (plan-phase.md)

**File:** [plan-phase.md](file:///home/dangnd/code/github/gsd-core/commands/ndd/plan-phase.md)

### Adapter Pattern (7-step process)

1. **Parse arguments** — `ndd-plan-phase <change-id> [target-phase]`
2. **Gate check** — `gsd-tools ndd plan <change-id> [target-phase]` → hard gate on non-zero exit
3. **Resolve/create target phase** — Handle `targetPhase.mode == "resolved"` vs `"proposed"`
4. **Write bridge context** — `gsd-tools ndd plan-context <change-id> <target-phase>`
5. **Invoke canonical GSD** — `gsd-plan-phase <target-phase>` (delegate, don't duplicate)
6. **Verify plan files** — `ls .planning/phases/<target-phase>-*/*-PLAN.md`
7. **Record phase-link** — `gsd-tools ndd plan-link <change-id> <target-phase> <plan-files...>`

### Frontmatter Pattern

```yaml
---
name: ndd:plan-phase
description: Plan an approved NDD change through GSD planning mechanics.
argument-hint: "<change-id> [target-phase]"
effort: max
allowed-tools: [Read, Write, Bash, Glob, Grep, Agent, AskUserQuestion]
requires: []
---
```

### Gate Checking Pattern

```bash
gsd-tools ndd plan <change-id> [target-phase]
```

Non-zero exit → stop. Parse JSON on success for `changeId`, `sourceArtifacts.*`, `targetPhase`, `workflowNextStep`.

### Execution Context References

```markdown
<execution_context>
@.agents/gsd-core/workflows/plan-phase.md
@gsd-core/workflows/plan-phase.md
@.agents/gsd-core/references/agent-contracts.md
@.planning/ndd/changes/
</execution_context>
```

### Key Principle: No Internal Duplication

> "Do not copy or inline planner internals here. The canonical workflow is `.agents/gsd-core/workflows/plan-phase.md`..."

The execute-phase adapter MUST follow this same principle with execute-phase.md.

---

## 5. Execute Phase Placeholder

**File:** [execute-phase.md](file:///home/dangnd/code/github/gsd-core/commands/ndd/execute-phase.md) (39 lines)

### Current Content

```yaml
---
name: ndd:execute-phase
description: Execute a planned NDD change through GSD execution mechanics.
argument-hint: "<change-id-or-phase> [--wave N]"
effort: max
allowed-tools: [Read, Write, Bash, Glob, Grep, Agent, TodoWrite]
requires: []
---
```

Notable differences from plan-phase.md:
- `argument-hint` accepts `<change-id-or-phase>` (dual-path resolution per D-03)
- `allowed-tools` includes `TodoWrite` instead of `AskUserQuestion`
- `requires` is empty (no explicit dependencies in frontmatter)

### Stub Process Section

```markdown
<process>
Resolve the NDD change id to its linked GSD phase or accept a direct phase id.
Load NDD traceability metadata, then reuse GSD execute-phase wave execution
and summary contracts.

Do not duplicate GSD executor internals in this command.
</process>
```

### Success Criteria (Existing)

```markdown
<success_criteria>
- Execution uses GSD plan execution mechanics.
- NDD change id remains linked from summaries or status metadata.
- No parallel NDD executor core is introduced.
</success_criteria>
```

---

## 6. GSD Execute-Phase Workflow

**File:** [execute-phase.md](file:///home/dangnd/code/github/gsd-core/.agents/gsd-core/workflows/execute-phase.md) (1708 lines)

### Entry Interface (First ~120 lines)

**Arguments parsed from `$ARGUMENTS`** (L63-73):
- First positional token → `PHASE_ARG` (the GSD phase id)
- `--wave N` → `WAVE_FILTER` (optional wave selection)
- `--gaps-only` → execute only incomplete plans
- `--cross-ai` / `--no-cross-ai` → cross-AI execution toggle

**Initialization** (L75-115):
```bash
INIT=$(gsd_run query init.execute-phase "${PHASE_ARG}")
```

Parses JSON for: `executor_model`, `verifier_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `state_exists`, `roadmap_exists`, `phase_req_ids`, `response_language`.

### How NDD Execute-Phase Should Invoke GSD Execute-Phase

The NDD adapter must invoke:

```bash
gsd-execute-phase <phase-id>
```

Or via slash command:
```text
/gsd-execute-phase <phase-id>
```

With optional flag passthrough:
- `--wave N` → pass through directly
- `--gaps-only` → pass through directly

The GSD workflow accepts `PHASE_ARG` as a phase id/token and handles everything else (wave grouping, subagent spawning, summary writing).

### Subagent Types Used

- `gsd-executor` — plan execution
- `gsd-verifier` — phase verification

### Outputs Produced by GSD Executor

- `SUMMARY.md` in the phase directory
- `VERIFICATION.md` in the phase directory
- Git commits per plan

---

## 7. Existing Test Patterns

### Test Files

| File | Lines | Module Under Test |
|------|-------|-------------------|
| [ndd-change-intake.test.cjs](file:///home/dangnd/code/github/gsd-core/tests/ndd-change-intake.test.cjs) | — | Change intake |
| [ndd-discuss-spec.test.cjs](file:///home/dangnd/code/github/gsd-core/tests/ndd-discuss-spec.test.cjs) | — | Discussion/approval |
| [ndd-impact-discovery.test.cjs](file:///home/dangnd/code/github/gsd-core/tests/ndd-impact-discovery.test.cjs) | — | Impact discovery |
| [ndd-plan-bridge.test.cjs](file:///home/dangnd/code/github/gsd-core/tests/ndd-plan-bridge.test.cjs) | 764 | Plan bridge + phase-link |

### Test Infrastructure

**Test runner:** Node built-in test runner (`node:test`)

**Imports pattern:**
```javascript
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');
```

**Module import pattern:**
```javascript
const bridge = require('../gsd-core/bin/lib/ndd-plan-bridge.cjs');
```

### Test Helper Functions ([helpers.cjs](file:///home/dangnd/code/github/gsd-core/tests/helpers.cjs))

| Helper | Purpose |
|--------|---------|
| `createTempDir(prefix)` | Create bare temp directory (L116) |
| `cleanup(tmpDir)` | Recursive remove with Windows retry (L130) |
| `runGsdTools(args, cwd, env)` | Execute `gsd-tools` CLI with shell-style arg parsing (L39) |
| `parseFrontmatter(content)` | Parse YAML frontmatter from file content (L176) |
| `toPosixPath(p)` | Normalize path separators (L280) |

### Fixture Pattern (from ndd-plan-bridge.test.cjs)

```javascript
function buildChangeWorkspace(tmpDir, overrides = {}) {
  const changeWorkspaceDir = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change');
  fs.mkdirSync(changeWorkspaceDir, { recursive: true });
  // Write STATUS.json, CHANGE-SPEC.md, IMPACT.md, CONTEXT.md
  fs.writeFileSync(statusPath, overrides.status ?? approvedStatus());
  // ...
  return { changeWorkspaceDir, statusPath, changeSpecPath, impactPath, contextPath };
}

function buildPhaseFixture(tmpDir, phaseNum, phaseName) {
  const phaseDir = path.join(tmpDir, '.planning', 'phases', `${phaseNum}-${phaseName}`);
  fs.mkdirSync(phaseDir, { recursive: true });
  // Write ROADMAP.md with phase listed
  return { phaseDir, phaseNum, phaseName };
}
```

### Assertion Patterns

```javascript
// CLI-level test
const result = runGsdTools('ndd plan-link test-change 06 06-01-PLAN.md', tmpDir);
assertCommandOk(result);
const parsed = JSON.parse(result.output);
assert.equal(parsed.ok, true);

// Module-level test
const result = bridge.preparePlanningBridge({ projectRoot: tmpDir, changeId: 'test-change' });
assert.equal(result.ok, false);
assert.equal(result.error.code, 'change_not_approved');

// Content assertion
assert.match(result.content, /Change id: test-change/);
```

### Test Naming Convention

- File: `tests/ndd-<module-name>.test.cjs`
- Describe blocks: `describe('PLAN-01: ...')` — requirement-linked
- Test names: descriptive verb phrases

For Phase 6, a new test file would be: `tests/ndd-execution-bridge.test.cjs`

---

## 8. Reverse Phase Lookup

### Current State: No Existing Helper

**Finding:** No helper currently scans `.planning/ndd/changes/*/phase-link.md` to find which change owns a given phase-id. All existing code writes phase-link.md (`writePhaseLink`) or references it by path, but none reads/parses it.

### Implementation Approach

The reverse lookup needs to:

1. List directories under `.planning/ndd/changes/` using `fs.readdirSync`
2. For each directory, check if `phase-link.md` exists
3. Read the file and extract `GSD phase id:` value
4. Match against the target phase-id

### Parsing phase-link.md Content

Since `phase-link.md` uses plain markdown list format (not YAML frontmatter), parsing requires regex:

```typescript
function readPhaseLinkPhaseId(content: string): string | null {
  const match = /^- GSD phase id:\s*(.+)$/m.exec(content);
  return match ? match[1].trim() : null;
}

function readPhaseLinkChangeId(content: string): string | null {
  const match = /^- Change id:\s*(.+)$/m.exec(content);
  return match ? match[1].trim() : null;
}

function readPhaseLinkPhaseDir(content: string): string | null {
  const match = /^- GSD phase directory:\s*(.+)$/m.exec(content);
  return match ? match[1].trim() : null;
}

function readPhaseLinkPlanFiles(content: string): string[] {
  const planSection = content.split('## Plan Files')[1]?.split('##')[0] ?? '';
  return planSection
    .split('\n')
    .map(line => /^- (.+-PLAN\.md.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map(m => m![1].trim());
}
```

### Ambiguity Handling (D-05 follow-up from specifics)

Per the context document's specifics section:
> "Reverse phase-id lookup cần handle case: nhiều changes link cùng 1 phase — lấy most recent hoặc report ambiguity"

The implementation should scan ALL change workspaces and if multiple link to the same phase-id, either:
- Return the most recently linked (by `Linked at:` timestamp)
- Or report ambiguity as an error

### Dual-Path Input Detection (D-06)

```typescript
function isPhaseId(input: string): boolean {
  return /^\d+$/.test(input);  // e.g., "06", "6"
}

function isChangeId(input: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(input) && !isPhaseId(input);
}
```

---

## Summary: Integration Points and Risks

### Files to Modify

| File | Change |
|------|--------|
| `src/ndd-command-router.cts` | Add `execute` subcommand branch (L417) |
| `commands/ndd/execute-phase.md` | Replace stub with full adapter workflow |

### Files to Create

| File | Purpose |
|------|---------|
| `tests/ndd-execution-bridge.test.cjs` | Tests for execute subcommand and reverse lookup |

### Reusable Code Summary

| Asset | Source | Usage |
|-------|--------|-------|
| `resolveChangeWorkspace()` | `ndd-change-intake.cts` L232 | Resolve change workspace path |
| `validateChangeId()` | `ndd-change-intake.cts` L207 | Input validation |
| `locateCurrentPhase()` | `ndd-command-router.cts` L70 | Phase directory resolution |
| `output()`, `ERROR_REASON` | `io.cts` L127, L163 | Structured JSON output |
| `toPosixPath()` | `ndd-command-router.cts` L48 | Path normalization |
| `isPathInside()` | `ndd-command-router.cts` L52 | Path containment |
| `buildChangeWorkspace()` | test fixture pattern | Test fixture reuse |
| `buildPhaseFixture()` | test fixture pattern | Test fixture reuse |

### Risks

1. **phase-link.md parsing fragility** — The format is plain markdown, not structured YAML. Regex parsing of `- GSD phase id: X` can break if the format changes. Mitigated by: both writer and reader are in the same codebase.

2. **Reverse lookup performance** — Scanning all `changes/*/phase-link.md` is O(n) on number of changes. Acceptable for v1 (unlikely to have hundreds of changes), but could become an issue at scale.

3. **Multiple changes linking to same phase** — Per D-05 and specifics, this must be handled. The most robust approach is to report an error (ambiguity) when multiple changes link to the same phase-id.

4. **No readStatus export** — The `readExistingStatus` function is private to `ndd-change-intake.cts`. The execute subcommand can use inline `JSON.parse(fs.readFileSync(...))` since it only needs read access (D-07 says no STATUS.json updates).

5. **Flag passthrough** — The adapter must pass `--wave N` and other GSD execute-phase flags through correctly. The plan-phase adapter doesn't demonstrate this pattern since it has no equivalent flags.

---

## RESEARCH COMPLETE
