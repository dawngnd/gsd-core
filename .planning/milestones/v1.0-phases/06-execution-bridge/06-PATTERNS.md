# Phase 6: Execution Bridge — Pattern Mapping

**Mapped:** 2026-07-09
**Phase:** 06-execution-bridge

---

## File 1: `src/ndd-command-router.cts` (MODIFY)

**Role:** CLI router — dispatches `gsd-tools ndd execute <id>` to inline resolution logic, returns execution-ready JSON to the workflow adapter.

**Data flow:** CLI args → arg validation → dual-path resolution (change-id vs phase-id) → read `phase-link.md` → locate phase → scan plan files → structured JSON via `output()`.

**Closest analog:** The `plan-link` branch in the same file ([ndd-command-router.cts L376-417](file:///home/dangnd/code/github/gsd-core/src/ndd-command-router.cts#L376-L417)), plus the `plan` branch ([L340-357](file:///home/dangnd/code/github/gsd-core/src/ndd-command-router.cts#L340-L357)) for single-arg intake with optional second arg.

### Pattern excerpt — Subcommand branch structure (plan-link, L376-417)

```typescript
  } else if (subcommand === 'plan-link') {
    const changeId = args[2];
    const phaseId = args[3];
    const planFiles = args.slice(4);
    if (!changeId || changeId.startsWith('-') || !phaseId || phaseId.startsWith('-') || planFiles.length === 0) {
      error('Usage: gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>', ERROR_REASON.USAGE);
      return;
    }
    if (planFiles.some(planFile => planFile.startsWith('-'))) {
      error('Usage: gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>', ERROR_REASON.USAGE);
      return;
    }

    const phase = locateCurrentPhase(cwd, phaseId);
    if (!phase) {
      error(`Target GSD phase '${phaseId}' was not found under .planning/phases/.`, ERROR_REASON.SDK_MISSING_ARG);
      return;
    }
    const normalizedPlans = normalizePlanFiles(cwd, phase, planFiles);
    if ('error' in normalizedPlans) {
      error(normalizedPlans.error, ERROR_REASON.SDK_MISSING_ARG);
      return;
    }

    const result = bridge.writePhaseLink({
      projectRoot: cwd,
      changeId,
      phaseId: phase.phase_id,
      phaseDir: phase.phase_dir,
      planFiles: normalizedPlans,
    });
    if (result.ok) {
      output({
        ok: true,
        changeId: result.change_id,
        targetPhase: phase,
        phaseLinkPath: result.phase_link_relative_path,
        planFiles: normalizedPlans,
      }, raw);
    } else {
      error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else {
    error('Unknown ndd subcommand. Available: change, impact, discuss, discuss-update, discuss-check, plan, plan-context, plan-link', ERROR_REASON.SDK_UNKNOWN_COMMAND);
  }
```

### Pattern excerpt — Single-arg subcommand (plan, L340-357)

```typescript
  } else if (subcommand === 'plan') {
    const changeId = args[2];
    const phaseId = args[3];
    if (!changeId || changeId.startsWith('-')) {
      error('Usage: gsd-tools ndd plan <change-id> [phase-id]', ERROR_REASON.USAGE);
      return;
    }
    if (phaseId?.startsWith('-') || args.length > 4) {
      error('Usage: gsd-tools ndd plan <change-id> [phase-id]', ERROR_REASON.USAGE);
      return;
    }

    const result = renderPlanResponse(cwd, changeId, phaseId);
    if (result.ok) {
      output(result.value, raw);
    } else {
      error(result.message, ERROR_REASON.SDK_MISSING_ARG);
    }
```

### Pattern excerpt — Import block (L15-30)

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { platformWriteSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ioMod = require('./io.cjs');
const { output, ERROR_REASON } = ioMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intake = require('./ndd-change-intake.cjs');
// ...
// eslint-disable-next-line @typescript-eslint/no-require-imports
import bridge = require('./ndd-plan-bridge.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import phaseLocator = require('./phase-locator.cjs');
```

### Pattern excerpt — Internal helpers reusable inline (L48-84)

```typescript
function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function locateCurrentPhase(projectRoot: string, phaseId: string): LocatedPhase | null {
  const located = phaseLocator.findPhaseInternal(projectRoot, phaseId);
  if (!located || located.archived || typeof located.directory !== 'string') return null;
  if (!located.directory.startsWith('.planning/phases/')) return null;

  const phaseDir = path.resolve(projectRoot, located.directory);
  if (!fs.existsSync(phaseDir) || !fs.statSync(phaseDir).isDirectory()) return null;

  return {
    phase_id: String(located.phase_number ?? phaseId),
    phase_dir: toPosixPath(located.directory),
    phase_name: typeof located.phase_name === 'string' ? located.phase_name : null,
    phase_slug: typeof located.phase_slug === 'string' ? located.phase_slug : null,
  };
}
```

### Pattern excerpt — Error fallback with command list (L418-419)

```typescript
  } else {
    error('Unknown ndd subcommand. Available: change, impact, discuss, discuss-update, discuss-check, plan, plan-context, plan-link', ERROR_REASON.SDK_UNKNOWN_COMMAND);
  }
```

### Pattern excerpt — Doc-comment at file top (L1-13)

```typescript
/**
 * NDD command router.
 *
 * Keeps the NDD surface local and thin:
 * - `gsd-tools ndd change <docs-folder> [change-id]` → change-intake helper
 * ...
 * - `gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>` → NDD phase-link recorder
 */
```

### Adaptation notes

1. **Add `execute` branch** between `plan-link` (L417) and `else` fallback (L418).
2. **Arg parsing:** Single required arg `args[2]` = `<change-id-or-phase>`. No second positional arg needed.
3. **Dual-path detection:** Add inline functions `isPhaseId(input)` (matches `/^\d+$/`) and use `intake.validateChangeId()` for change-id path. If input starts with digit → phase-id path; else → change-id path.
4. **Change-id path:** `intake.resolveChangeWorkspace(cwd, changeId)` → read `phase-link.md` → parse markdown list with regex (see Research §8).
5. **Phase-id path (reverse lookup):** Scan `.planning/ndd/changes/*/phase-link.md` via `fs.readdirSync` → parse each for `GSD phase id:` → match. Handle ambiguity (multiple matches → error).
6. **phase-link.md parsing:** New inline functions: `readPhaseLinkPhaseId(content)`, `readPhaseLinkChangeId(content)`, `readPhaseLinkPhaseDir(content)`, `readPhaseLinkPlanFiles(content)` — all regex-based (format is plain markdown list, NOT YAML frontmatter).
7. **Gate check:** Verify `phase-link.md` exists (proves plan-phase ran) + at least 1 `*-PLAN.md` in phase dir.
8. **Output shape:** `{ ok, change_id, phase_id, phase_dir, plan_files[], phase_link_path, gate_passed }`.
9. **Update error fallback** to include `execute` in the Available list.
10. **Update doc-comment** at file top to add `execute` command.
11. **No new TS helper file** (D-10) — all logic inline in router.

---

## File 2: `commands/ndd/execute-phase.md` (MODIFY)

**Role:** Workflow adapter — NDD thin wrapper that gates on phase-link, delegates to canonical GSD `execute-phase`, passes through flags.

**Data flow:** Parse args → call `gsd-tools ndd execute <id>` → parse JSON → gate check → invoke `gsd-execute-phase <phase-id> [--wave N] [--gaps-only]` → report result.

**Closest analog:** [commands/ndd/plan-phase.md](file:///home/dangnd/code/github/gsd-core/commands/ndd/plan-phase.md) — 7-step adapter pattern.

### Pattern excerpt — Frontmatter (plan-phase.md L1-15)

```yaml
---
name: ndd:plan-phase
description: Plan an approved NDD change through GSD planning mechanics.
argument-hint: "<change-id> [target-phase]"
effort: max
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
requires: []
---
```

### Pattern excerpt — Objective section (L16-20)

```markdown
<objective>
Bridge an approved NDD change into canonical GSD plan-phase without copying planner internals.

NDD owns the approved-change gate, target phase handoff, bridge context, and phase-link traceability. GSD owns research, planning, source-grounding, plan-check, validation, and plan file production.
</objective>
```

### Pattern excerpt — Execution context references (L22-27)

```markdown
<execution_context>
@.agents/gsd-core/workflows/plan-phase.md
@gsd-core/workflows/plan-phase.md
@.agents/gsd-core/references/agent-contracts.md
@.planning/ndd/changes/
</execution_context>
```

### Pattern excerpt — Gate step (L47-71)

```markdown
## 2. Gate and prepare the NDD bridge

Run:

\`\`\`bash
gsd-tools ndd plan <change-id> [target-phase]
\`\`\`

This is a hard gate. If the command exits non-zero, stop before any planning work. Common blocking cases:

- `STATUS.json` or `CHANGE-SPEC.md` is not approved.
- ...

On success, parse the returned JSON. Preserve these fields for later steps:

- `changeId`
- `sourceArtifacts.status`
- ...
```

### Pattern excerpt — GSD delegation step (L121-148)

```markdown
## 5. Invoke canonical GSD plan-phase

Invoke canonical planning for the target phase:

\`\`\`bash
gsd-plan-phase <target-phase>
\`\`\`

If the runtime uses slash commands, invoke:

\`\`\`text
/gsd-plan-phase <target-phase>
\`\`\`

Do not copy or inline planner internals here. The canonical workflow is `.agents/gsd-core/workflows/plan-phase.md`...
```

### Pattern excerpt — Success criteria (L187-194)

```markdown
<success_criteria>
- Unapproved or critically ambiguous NDD changes stop before canonical planning.
- A concrete GSD target phase is supplied or created through existing GSD phase/roadmap mechanics.
- ...
- GSD source-grounding, plan-check, requirement traceability, frontmatter validation, and plan structure validation stay active.
</success_criteria>
```

### Adaptation notes

1. **Frontmatter:** Keep existing placeholder frontmatter (name: `ndd:execute-phase`, argument-hint: `<change-id-or-phase> [--wave N]`, allowed-tools includes `TodoWrite`). These are already correct in the placeholder.
2. **Objective:** Rewrite to "Bridge NDD phase-link metadata into canonical GSD execute-phase without copying executor internals."
3. **Execution context:** Reference `@.agents/gsd-core/workflows/execute-phase.md` instead of `plan-phase.md`.
4. **Process — simplify to ~4 steps** (simpler than plan-phase's 7):
   - Step 1: Parse arguments (`<change-id-or-phase> [--wave N] [--gaps-only]`).
   - Step 2: Gate — call `gsd-tools ndd execute <change-id-or-phase>` → hard gate on non-zero exit. Parse JSON for `phase_id`, `phase_dir`, `plan_files`, `gate_passed`.
   - Step 3: Delegate — invoke `gsd-execute-phase <phase-id>` with flag passthrough (`--wave N`, `--gaps-only`).
   - Step 4: Report — summarize execution result with NDD traceability link.
5. **No post-execution NDD metadata update** (D-07) — no equivalent of plan-phase Step 7 (plan-link recording). GSD writes its own SUMMARY.md/VERIFICATION.md.
6. **Flag passthrough:** `--wave N` and `--gaps-only` must be forwarded verbatim to `gsd-execute-phase`. Plan-phase doesn't demonstrate this pattern — it's new.
7. **Non-duplication principle:** Must include explicit "Do not duplicate GSD executor internals" statement, same as plan-phase's L137-146.

---

## File 3: `tests/ndd-execution-bridge.test.cjs` (CREATE)

**Role:** Test file — validates execute subcommand routing, dual-path resolution, gate enforcement, phase-link parsing, and reverse lookup.

**Data flow:** Set up temp dir fixtures → call `runGsdTools('ndd execute ...')` or inline module functions → assert JSON output / error behavior.

**Closest analog:** [tests/ndd-plan-bridge.test.cjs](file:///home/dangnd/code/github/gsd-core/tests/ndd-plan-bridge.test.cjs) (764 lines) — same test infrastructure, fixture helpers, assertion patterns.

### Pattern excerpt — Imports (L1-7)

```javascript
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');

const bridge = require('../gsd-core/bin/lib/ndd-plan-bridge.cjs');
```

### Pattern excerpt — assertCommandOk helper (L9-11)

```javascript
function assertCommandOk(result) {
  assert.equal(result.exitCode, 0, result.error || result.output);
}
```

### Pattern excerpt — Fixture builders (L151-211)

```javascript
function buildChangeWorkspace(tmpDir, overrides = {}) {
  const changeWorkspaceDir = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change');
  fs.mkdirSync(changeWorkspaceDir, { recursive: true });

  const statusPath = path.join(changeWorkspaceDir, 'STATUS.json');
  const changeSpecPath = path.join(changeWorkspaceDir, 'CHANGE-SPEC.md');
  const impactPath = path.join(changeWorkspaceDir, 'IMPACT.md');
  const contextPath = path.join(changeWorkspaceDir, 'CONTEXT.md');

  fs.writeFileSync(statusPath, overrides.status ?? approvedStatus());
  fs.writeFileSync(changeSpecPath, overrides.changeSpec ?? baseChangeSpec());
  fs.writeFileSync(impactPath, overrides.impact ?? baseImpactMd());

  if (overrides.skipContext !== true) {
    fs.writeFileSync(contextPath, overrides.context ?? baseContextMd());
  }

  return { changeWorkspaceDir, statusPath, changeSpecPath, impactPath, contextPath };
}

function buildPhaseFixture(tmpDir, phaseNum, phaseName) {
  const phaseDir = path.join(tmpDir, '.planning', 'phases', `${phaseNum}-${phaseName}`);
  fs.mkdirSync(phaseDir, { recursive: true });

  const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
  const roadmapContent = [
    '# Roadmap', '', '## Phases', '',
    `- [ ] **Phase ${phaseNum}: ${phaseName}** - Test phase.`, '',
    '## Phase Details', '', `### Phase ${phaseNum}: ${phaseName}`, '',
    '**Goal**: Test.', `**Depends on**: Nothing`,
    '**Requirements**: []', '**Success Criteria** (what must be TRUE):', '',
    '  1. Test passes.', '', '**Plans**: 0 plans', '', 'Plans:', '',
    `- [ ] ${phaseNum}-01-PLAN.md`, '',
  ].join('\n');
  if (!fs.existsSync(roadmapPath)) {
    fs.writeFileSync(roadmapPath, roadmapContent);
  }

  return { phaseDir, phaseNum, phaseName };
}
```

### Pattern excerpt — Describe block with requirement linking (L217-226)

```javascript
describe('PLAN-01: preparePlanningBridge approval gating', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-plan-bridge-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('draft status causes preparePlanningBridge to fail', () => {
    // ...
  });
});
```

### Pattern excerpt — CLI-level test (L724-745)

```javascript
test('CLI ndd plan-link records phase-link.md successfully', () => {
  buildChangeWorkspace(tmpDir);
  const { phaseDir } = buildPhaseFixture(tmpDir, '06', 'test-phase');

  // Create a plan file in the phase directory for plan-link to find
  const planFilePath = path.join(phaseDir, '06-01-PLAN.md');
  fs.writeFileSync(planFilePath, '---\nphase: 06\nplan: 01\n---\n# Plan\n');

  const result = runGsdTools('ndd plan-link test-change 06 06-01-PLAN.md', tmpDir);
  assertCommandOk(result);
  const parsed = JSON.parse(result.output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.changeId, 'test-change');
  assert.ok(parsed.phaseLinkPath.includes('phase-link.md'));

  // Verify the file exists on disk
  const linkPath = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change', 'phase-link.md');
  assert.ok(fs.existsSync(linkPath), 'phase-link.md should exist on disk');
  const linkContent = fs.readFileSync(linkPath, 'utf-8');
  assert.match(linkContent, /Change id: test-change/);
  assert.match(linkContent, /GSD phase id: 06/);
  assert.match(linkContent, /06-01-PLAN\.md/);
});
```

### Pattern excerpt — Error/usage test (L748-752)

```javascript
test('CLI ndd plan-link without required args returns usage error', () => {
  const result = runGsdTools('ndd plan-link', tmpDir);
  assert.equal(result.success, false);
  assert.match(result.error, /Usage/);
});
```

### Pattern excerpt — Workflow adapter content tests (L550-579)

```javascript
describe('PLAN-03: Workflow adapter command file', () => {
  const planPhasePath = path.join(__dirname, '..', 'commands', 'ndd', 'plan-phase.md');

  test('plan-phase.md references canonical GSD plan-phase', () => {
    const content = fs.readFileSync(planPhasePath, 'utf-8');
    assert.match(content, /gsd-plan-phase/);
  });

  test('plan-phase.md does not define an independent planner flow', () => {
    const content = fs.readFileSync(planPhasePath, 'utf-8');
    assert.match(content, /Do not copy or inline planner internals/i);
  });
});
```

### Adaptation notes

1. **File name:** `tests/ndd-execution-bridge.test.cjs`
2. **Describe blocks** should link to EXEC-01, EXEC-02, EXEC-03 requirements.
3. **New fixture helper:** `buildPhaseLinkFixture(tmpDir, changeId, phaseId, phaseDir, planFiles)` — writes a `phase-link.md` in the change workspace matching the plain markdown list format from `writePhaseLink`.
4. **Test categories to cover:**
   - **EXEC-01: Execute gate enforcement** — CLI `ndd execute` fails when phase-link.md is missing; fails when no `*-PLAN.md` files exist; succeeds when both present.
   - **EXEC-02: Dual-path resolution** — Change-id input resolves via `phase-link.md`; phase-id input resolves via reverse scan; unknown format returns error; multiple changes linking same phase returns ambiguity error.
   - **EXEC-03: Workflow adapter** — `execute-phase.md` references canonical GSD execute-phase; does not define independent executor flow; references `gsd-tools ndd execute`.
5. **Reuse existing fixture helpers** (`buildChangeWorkspace`, `buildPhaseFixture`, `approvedStatus` etc.) where possible; add new ones for phase-link content.
6. **CLI-level tests:** Use `runGsdTools('ndd execute test-change', tmpDir)` and `runGsdTools('ndd execute 06', tmpDir)` patterns.
7. **No module-level import of router** — the router is tested via CLI (`runGsdTools`), not direct function import (router is not exported as testable functions beyond `routeNddCommand`).

---

## Summary: Data Flow

```
User invokes: ndd:execute-phase <change-id-or-phase> [--wave N]
         │
         ▼
commands/ndd/execute-phase.md  (workflow adapter)
         │
         │  Step 1: Parse args
         │  Step 2: gsd-tools ndd execute <id>  ──► src/ndd-command-router.cts
         │          (gate check + resolution)           │
         │                                              ├─ change-id path: resolveChangeWorkspace → read phase-link.md
         │                                              └─ phase-id path: scan changes/*/phase-link.md (reverse lookup)
         │          ◄── JSON: { phase_id, phase_dir, plan_files, gate_passed }
         │
         │  Step 3: gsd-execute-phase <phase-id> [--wave N]  ──► GSD canonical executor
         │  Step 4: Report result
         ▼
Done (GSD writes SUMMARY.md, VERIFICATION.md in phase dir)
```

---

## PATTERN MAPPING COMPLETE
