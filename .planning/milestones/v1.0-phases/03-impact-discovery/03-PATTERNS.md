# Phase 3 Patterns: Impact Discovery

## File Classification

| File | Role | Data Flow | Closest Analog |
|------|------|-----------|----------------|
| `src/ndd-impact-discovery.cts` | **Domain logic module** | Reads workspace + codebase maps → produces IMPACT.md + STATUS.json updates | [ndd-change-intake.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts) |
| `gsd-core/ndd/codebase_capability.json` | **Static config** | Read-only config consumed at runtime by impact module | [capabilities/intel/capability.json](file:///home/dangnd/code/github/gsd-core/capabilities/intel/capability.json) (schema differs) |
| `src/ndd-command-router.cts` (modify) | **CLI dispatch** | Routes `ndd impact <change-id>` → impact module | Self (add `impact` case alongside `change`) |
| `commands/ndd/impact.md` (modify) | **Command prompt** | Drives LLM workflow; calls gsd-tools, references IMPACT.md | [commands/ndd/change.md](file:///home/dangnd/code/github/gsd-core/commands/ndd/change.md) |
| `tests/ndd-impact-discovery.test.cjs` | **Test suite** | Exercises deterministic helpers, integration via `runGsdTools` | [tests/ndd-change-intake.test.cjs](file:///home/dangnd/code/github/gsd-core/tests/ndd-change-intake.test.cjs) |

---

## Pattern 1: NDD Module Structure (Primary Pattern)

**Analog:** [src/ndd-change-intake.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts)
**Target:** `src/ndd-impact-discovery.cts`

### 1a. Module Header — Imports and Platform Helpers

```typescript
// ndd-change-intake.cts lines 1–18
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { tokenizeHeadings } from './markdown-sectionizer.cjs';
import { platformEnsureDir, platformWriteSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import frontmatterMod = require('./frontmatter.cjs');

const { extractFrontmatter } = frontmatterMod as {
  extractFrontmatter: (content: string) => Record<string, unknown>;
};
```

**Reuse for impact module:** Same import pattern. The impact module additionally needs to import from `ndd-change-intake.cjs` for `resolveChangeWorkspace`, `validateChangeId`, and `NddChangeStatus`.

### 1b. Types First — Exported Interfaces

All inputs, outputs, and result types are defined as exported interfaces at the top of the module (lines 34–162). The discriminated-union pattern `ok: true | ok: false` is used for results:

```typescript
// ndd-change-intake.cts lines 58–73
export interface ChangeWorkspaceResolutionSuccess {
  ok: true;
  change_id: string;
  workspace_dir: string;
  relative_workspace_dir: string;
}

export interface ChangeWorkspaceResolutionFailure {
  ok: false;
  error: ChangeIdValidationFailure | {
    code: 'path_escape';
    message: string;
  };
}

export type ChangeWorkspaceResolutionResult = ChangeWorkspaceResolutionSuccess | ChangeWorkspaceResolutionFailure;
```

**Apply to impact module:** Define types for `ImpactEntry`, `ImpactConfidence`, `CodebaseCapabilityConfig`, `CodebaseMapAvailability`, `ImpactDiscoveryResult`, etc.

### 1c. Pure Markdown Rendering Functions

Markdown output is built by pure string-array-joining functions. No side effects — they take data and return strings:

```typescript
// ndd-change-intake.cts lines 433–463
function renderSourceManifest(changeId: string, sourceFolder: string, sources: IngestedSource[], warnings: string[]): string {
  const lines = [
    `# Source Manifest: ${changeId}`,
    '',
    `Source folder: \`${sourceFolder}\``,
    '',
    '| Original relative path | Workspace copied path | Inferred role | Evidence | Warnings |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const source of sources) {
    lines.push(`| ${[
      `\`${markdownTableCell(source.original_path)}\``,
      // ... more cells
    ].join(' | ')} |`);
  }
  // ...
  return lines.join('\n');
}
```

**Apply to impact module:** `renderImpactMarkdown()` should follow this exact pattern — build a `lines` array, use `markdownTableCell()` for escaping, return `lines.join('\n')`.

### 1d. STATUS.json Read/Write Pattern

STATUS.json is read with defensive parsing and written with non-destructive merge:

```typescript
// ndd-change-intake.cts lines 756–790
function readExistingStatus(statusPath: string): NddChangeStatus | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record['change_id'] !== 'string') return null;
    return record as NddChangeStatus;
  } catch {
    return null;
  }
}
```

> [!IMPORTANT]
> `readExistingStatus` is **not exported**. The impact module should re-implement a simple JSON reader (option c from RESEARCH Risk 1) rather than modifying the intake module. The `NddChangeStatus` interface has `[key: string]: unknown` index signature (line 93) allowing extensible fields like `impact_path`.

### 1e. NddChangeStatus Interface — Extensible by Design

```typescript
// ndd-change-intake.cts lines 83–94
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

**Impact module updates:** Set `phase: 'impact'`, add `artifacts.impact: 'IMPACT.md'`, refresh `updated_at`.

### 1f. Markdown Table Cell Escaping Helper

```typescript
// ndd-change-intake.cts lines 185–190
function markdownTableCell(value: string): string {
  return value
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim();
}
```

**Reuse:** This is a private function. Either re-implement or extract to shared utility. Impact module needs it for table rendering.

---

## Pattern 2: Command Router Extension

**File:** [src/ndd-command-router.cts](file:///home/dangnd/code/github/gsd-core/src/ndd-command-router.cts)
**Action:** Modify — add `impact` subcommand

### 2a. Current Router Structure (full file, 61 lines)

```typescript
// ndd-command-router.cts lines 22–56
function routeNddCommand({ args, cwd, raw, error }: RouteNddCommandOptions): void {
  const subcommand = args[1];
  if (subcommand !== 'change') {
    error('Unknown ndd subcommand. Available: change', ERROR_REASON.SDK_UNKNOWN_COMMAND);
    return;
  }

  const docsFolder = args[2];
  const changeId = args[3];
  if (!docsFolder || docsFolder.startsWith('-')) {
    error('Usage: gsd-tools ndd change <docs-folder> [change-id]', ERROR_REASON.USAGE);
    return;
  }
  // ... dispatch to intake.ingestMarkdownSources()
  output({ ok: true, change_id: result.change_id, ... }, raw);
}
```

### 2b. Extension Pattern

The guard at line 24 must change from `subcommand !== 'change'` to a switch/if-else chain:

```
if (subcommand === 'change') { ... }
else if (subcommand === 'impact') { ... }
else { error('Unknown ndd subcommand. Available: change, impact', ERROR_REASON.SDK_UNKNOWN_COMMAND); }
```

The `impact` branch needs:
1. Import the impact module: `import impact = require('./ndd-impact-discovery.cjs');`
2. Validate `args[2]` as `<change-id>` (required, unlike `change` which takes `<docs-folder>`)
3. Call the deterministic impact helper
4. Call `output()` with result

### 2c. Module Export Pattern

```typescript
// ndd-command-router.cts lines 58–60
export = {
  routeNddCommand,
};
```

The router uses CJS-style `export =` because `gsd-tools.cjs` requires it via:

```javascript
// gsd-tools.cjs line 264
const { routeNddCommand } = require('./lib/ndd-command-router.cjs');
```

No changes needed to `gsd-tools.cjs` — the router handles all subcommand dispatch.

---

## Pattern 3: Command Prompt Structure

**Analog:** [commands/ndd/change.md](file:///home/dangnd/code/github/gsd-core/commands/ndd/change.md)
**Target:** `commands/ndd/impact.md` (replace placeholder)

### 3a. Frontmatter Schema

```yaml
---
name: ndd:change
description: Start an NDD brownfield change from project Markdown documents.
argument-hint: "<docs-folder> [change-id]"
effort: high
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
requires: []
---
```

**Impact equivalent:** `name: ndd:impact`, `argument-hint: "<change-id>"`, same `allowed-tools` and `effort: high`.

### 3b. Prompt Sections

Commands use XML-tag sections: `<objective>`, `<execution_context>`, `<process>`, `<success_criteria>`.

```markdown
<!-- commands/ndd/change.md lines 25–38 -->
<process>
Run the deterministic local helper:

```bash
node .agents/gsd-core/bin/gsd-tools.cjs ndd change <docs-folder> [change-id]
```

If the project-local `.agents` helper is unavailable, use the package helper:

```bash
node gsd-core/bin/gsd-tools.cjs ndd change <docs-folder> [change-id]
```
</process>
```

**Impact command pattern:**
- `<process>` calls `gsd-tools.cjs ndd impact <change-id>`
- Adds capability reporting step (tool availability notification)
- Adds wiki query step, CodeGraph step, LLM source inspection step
- References codebase maps from `.planning/codebase/*`

### 3c. Current Placeholder to Replace

```markdown
<!-- commands/ndd/impact.md lines 14–18 (current placeholder) -->
<objective>
Map an NDD change starting point to likely affected code areas in an existing project.

NDD impact discovery reuses GSD codebase mapping and source inspection. V1 exposes the namespace command only; full `IMPACT.md` generation lands in the NDD Impact Discovery phase.
</objective>
```

Full replacement needed — the entire file content after frontmatter changes.

---

## Pattern 4: Test Suite Structure

**Analog:** [tests/ndd-change-intake.test.cjs](file:///home/dangnd/code/github/gsd-core/tests/ndd-change-intake.test.cjs)
**Target:** `tests/ndd-impact-discovery.test.cjs`

### 4a. Test File Skeleton

```javascript
// ndd-change-intake.test.cjs lines 1–24
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir, cleanup } = require('./helpers.cjs');

const intake = require('../gsd-core/bin/lib/ndd-change-intake.cjs');

describe('NDD change intake helpers', () => {
  let tmpDir;
  let sourceDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-ndd-intake-');
    sourceDir = path.join(tmpDir, 'Feature Docs');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'Proposal.md'), '# Proposal\n');
    // ...
  });

  afterEach(() => {
    cleanup(tmpDir);
  });
```

**Impact test pattern:** Same skeleton. Import from `../gsd-core/bin/lib/ndd-impact-discovery.cjs`. Set up fixtures with existing change workspaces (STATUS.json, CHANGE-SPEC.md) since impact depends on a completed intake phase.

### 4b. Test Fixture Setup — Pre-populated Change Workspace

Impact tests need a workspace that looks like intake output. Setup pattern:

```javascript
// From test patterns — create realistic workspace
beforeEach(() => {
  tmpDir = createTempDir('gsd-ndd-impact-');
  // Create change workspace structure
  const wsDir = path.join(tmpDir, '.planning', 'ndd', 'changes', 'test-change');
  fs.mkdirSync(wsDir, { recursive: true });
  // Write STATUS.json (intake phase completed)
  fs.writeFileSync(path.join(wsDir, 'STATUS.json'), JSON.stringify({
    change_id: 'test-change',
    status: 'draft',
    phase: 'intake',
    source_folder: '/tmp/sources',
    source_count: 2,
    artifacts: { source_manifest: 'SOURCE-MANIFEST.md', change_spec: 'CHANGE-SPEC.md' },
    warnings: [],
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
  }, null, 2));
  // Write CHANGE-SPEC.md with requirement sections
  fs.writeFileSync(path.join(wsDir, 'CHANGE-SPEC.md'), '# Change Spec: test-change\n\n## Confirmed Source-Backed Requirements\n\n- The checkout flow must support saved cards.\n');
});
```

### 4c. Integration Test Pattern — `runGsdTools`

```javascript
// From helpers.cjs lines 39–113
function runGsdTools(args, cwd = process.cwd(), env = {}) {
  // Returns { success: boolean, output: string, error?: string, exitCode: number }
}
```

Usage in impact tests:
```javascript
test('returns error for missing change-id argument', () => {
  const result = runGsdTools('ndd impact', tmpDir);
  assert.equal(result.success, false);
  assert.match(result.error, /Usage/);
});
```

### 4d. Assertion Patterns from Intake Tests

STATUS.json field assertions:
```javascript
// ndd-change-intake.test.cjs lines 82–97
const parsed = JSON.parse(fs.readFileSync(result.status_path, 'utf-8'));
assert.deepEqual(parsed, {
  change_id: 'billing-flow',
  status: 'draft',
  phase: 'intake',
  // ...
});
```

Non-clobber test:
```javascript
// ndd-change-intake.test.cjs lines 99–130
// Write extra fields, then re-initialize → verify they survive
status.review_notes = ['keep me'];
// ...
assert.deepEqual(parsed.review_notes, ['keep me']);
```

---

## Pattern 5: Static JSON Config File

**Analog:** [capabilities/intel/capability.json](file:///home/dangnd/code/github/gsd-core/capabilities/intel/capability.json)
**Target:** `gsd-core/ndd/codebase_capability.json`

> [!WARNING]
> Despite similar naming, these are **different schemas**. The GSD `capability.json` has fields like `id`, `role`, `version`, `tier`, `skills`, `agents`, `hooks`, `steps`, `gates` — it's a feature pack manifest. The NDD `codebase_capability.json` is a tool availability config with `tools.<name>.{available, config, capabilities}` structure. They share no schema.

### 5a. Location and Directory

The `gsd-core/ndd/` directory does **not exist yet**. It must be created. The `gsd-core/` package directory currently contains:
- `bin/` — compiled JS output
- `contexts/` — context files
- `references/` — reference docs
- `templates/` — templates
- `workflows/` — workflow files

Adding `ndd/` follows the same pattern of domain-scoped subdirectories under the package root.

### 5b. Config File Schema (from CONTEXT decisions)

```jsonc
{
  "tools": {
    "<tool-name>": {
      "available": true|false,
      "config": { /* tool-specific config */ },
      "capabilities": {
        "callers": true|false,
        "callees": true|false,
        "impact_analysis": true|false,
        "symbol_lookup": true|false,
        "semantic": true|false,
        "knowledge": true|false
      }
    }
  }
}
```

### 5c. Config Loading Pattern

No direct analog for JSON config loading in the codebase. The pattern should be:
1. Resolve path relative to package root (using `__dirname` from the compiled `.cjs`)
2. Try `fs.readFileSync` + `JSON.parse`
3. Return default config on file-not-found
4. Validate `tools` key exists
5. Warn on invalid JSON but return defaults

---

## Pattern 6: I/O Conventions

**File:** [src/io.cts](file:///home/dangnd/code/github/gsd-core/src/io.cts)

### 6a. Structured Output

```typescript
// io.cts line 127
function output(result: unknown, raw: boolean, rawValue?: unknown): void {
  // JSON.stringify → stdout, auto-redirect to tmpfile if >50KB
}
```

### 6b. Typed Error Reasons

```typescript
// io.cts lines 163–187
const ERROR_REASON = Object.freeze({
  SDK_UNKNOWN_COMMAND: 'sdk_unknown_command',
  SDK_MISSING_ARG: 'sdk_missing_arg',
  USAGE: 'usage',
  // ...
});
```

Impact-specific error reasons may be needed (e.g., `NDD_WORKSPACE_NOT_FOUND`, `NDD_INTAKE_NOT_COMPLETE`). Check if existing codes suffice or if new ones should be added.

### 6c. Error Function

```typescript
// io.cts lines 211–218
function error(message: string, reason: ErrorReasonValue = ERROR_REASON.UNKNOWN): never {
  // Exits process with code 1
}
```

The router imports `error` from the caller, not from io.cts directly. The router receives it via `RouteNddCommandOptions.error`.

---

## Pattern 7: Build Pipeline

**Config:** [tsconfig.build.json](file:///home/dangnd/code/github/gsd-core/tsconfig.build.json)

```jsonc
{
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "gsd-core/bin/lib",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2022"
  },
  "include": ["src/**/*.cts"]
}
```

`src/ndd-impact-discovery.cts` → `gsd-core/bin/lib/ndd-impact-discovery.cjs` (automatic via glob).

---

## Pattern 8: Cross-Module Import Convention

### 8a. CJS Require in .cts Files

```typescript
// ndd-command-router.cts lines 9–13
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ioMod = require('./io.cjs');
const { output, ERROR_REASON } = ioMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intake = require('./ndd-change-intake.cjs');
```

The `import x = require('./y.cjs')` syntax is the approved pattern for CJS interop in `.cts` files. The eslint-disable comment is standard.

### 8b. Platform File I/O

```typescript
// Used throughout ndd-change-intake.cts
import { platformEnsureDir, platformWriteSync } from './shell-command-projection.cjs';
```

- [platformWriteSync](file:///home/dangnd/code/github/gsd-core/src/shell-command-projection.cts#L635) — atomic cross-platform write
- [platformEnsureDir](file:///home/dangnd/code/github/gsd-core/src/shell-command-projection.cts#L680) — recursive mkdir

---

## Reusable Functions from Intake Module

| Function | Exported? | Line | Reuse Plan |
|----------|-----------|------|------------|
| `validateChangeId()` | ✅ Yes | [L207](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L207) | Import from intake — validate change-id arg |
| `resolveChangeWorkspace()` | ✅ Yes | [L232](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L232) | Import from intake — resolve workspace path |
| `NddChangeStatus` | ✅ Yes (type) | [L83](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L83) | Import type for STATUS.json read/write |
| `readExistingStatus()` | ❌ No | [L756](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L756) | Re-implement simple JSON reader in impact module |
| `statusWithDefaults()` | ❌ No | [L768](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L768) | Impact module writes status directly (simpler update) |
| `markdownTableCell()` | ❌ No | [L185](file:///home/dangnd/code/github/gsd-core/src/ndd-change-intake.cts#L185) | Re-implement in impact module (4-line helper) |
| `tokenizeHeadings()` | ✅ Yes | [L165](file:///home/dangnd/code/github/gsd-core/src/markdown-sectionizer.cts#L165) | Import from markdown-sectionizer for CHANGE-SPEC parsing |

---

## Key Implementation Guardrails

1. **File I/O**: Always use `platformWriteSync()` / `platformEnsureDir()` — never raw `fs.writeFileSync()` / `fs.mkdirSync()`
2. **Output**: Always use `output(result, raw)` from io module — never raw `console.log()`
3. **Errors**: Always use `error(message, ERROR_REASON.X)` — never raw `throw` from router-level code
4. **Paths**: Use `path.resolve()` and `path.relative()` — normalize with `.split(path.sep).join('/')`
5. **Tests**: Import compiled `.cjs` from `../gsd-core/bin/lib/` — never import `.cts` source directly
6. **Build**: Files under `src/*.cts` auto-compile to `gsd-core/bin/lib/*.cjs` via tsconfig.build.json
7. **`gsd-core/ndd/` directory** must be created — it doesn't exist yet
