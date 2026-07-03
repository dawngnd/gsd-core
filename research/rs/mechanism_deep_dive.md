# Mechanism Deep-Dive — gsd-core

> How the system actually works: concept → code → runtime behavior.

---

## 1. Concept-to-Code Map

| Concept (from docs) | Primary File(s) | Key Type/Function | Notes |
|---|---|---|---|
| **Phase Loop** (discuss→plan→execute→verify→ship) | `commands/gsd/{explore,plan-phase,execute-phase,verify-work,ship}.md` → `gsd-core/workflows/*.md` | Commands are thin YAML-frontmatter shells; workflows contain all logic | Each command declares `effort`, `allowed-tools`, `requires` dependencies |
| **STATE.md Progression** | `src/state.cts` (2916L), `src/state-transition.cts` (1995L) | `readModifyWriteStateMd()`, `transitionCore(content, intent, deps)` | Pure core + I/O wrapper. 11 intent kinds. Lock-protected RMW. |
| **Field Classification** (ADR-1769) | `src/state-transition.cts` | `FIELD_CLASSIFICATION` (null-prototype frozen object), `applyStatePreservation()` | Two-axis: `source × preservation`. New fields without classification row = hard error. |
| **Phase Lifecycle** | `src/phase.cts` (1860L), `src/phase-locator.cts` (181L) | `cmdPhaseAdd()`, `cmdPhaseComplete()`, `findPhaseInternal()` | Create → execute → complete. Transactional writes to ROADMAP + REQUIREMENTS + STATE. |
| **Plan Dependency Waves** | `src/phase.cts` L428+ | `computeDependencyLevels(rawPlans, planMap, canonicalToId)` | Kahn's algorithm (O(V+E)) topological sort. O(1) amortized dequeue via head-index. |
| **Command Routing Hub** | `src/command-routing-hub.cts` (414L) | `createHub(opts) → { dispatch }`, Result type algebra | No-throw contract. Runtime variant schema validation. Frozen discriminated union results. |
| **Planning Workspace** | `src/planning-workspace.cts` (413L) | `planningDir()`, `planningPaths()`, `withPlanningLock()` | Path traversal guard (`BAD_SEGMENT`). O_EXCL lock with liveness-gated steal protocol. |
| **Capability System** (ADR-1244) | `src/capability-lifecycle.cts` (1788L), `src/capability-source.cts`, `src/capability-loader.cts`, `src/capability-consent.cts`, `src/capability-trust.cts` | `installCapability()`, `upgradeCapability()`, `removeCapability()`, `reconcileCapabilities()` | Two-phase commit via ledger `_pending` field. Crash-recoverable install/upgrade/remove. |
| **Host Integration** | `src/host-integration.cts` (531L) | `negotiateHostCapabilities(host, engine)`, `degradationFor(point, axes)`, `profileOf(axes)` | Pure no-I/O module. 8 axes, 6 interface points. Fail-closed to `SAFE_DEFAULTS`. |
| **MCP Server** | `src/mcp-server.cts` (213L) | `handleMessage()` (pure), `runServer()` (I/O), `callTool()` | Hand-rolled JSON-RPC 2.0 over stdio. 3 tools: `gsd_invoke_command`, `gsd_read_state`, `gsd_write_state`. |
| **Context Monitoring** | `hooks/gsd-context-monitor.js` (197L) | Bridge-file pattern: statusline writes `/tmp/claude-ctx-{session}.json`, monitor reads it | WARNING ≤35%, CRITICAL ≤25%. Debounce 5 tool uses. Severity escalation bypasses debounce. |
| **Prompt Injection Guard** | `hooks/gsd-prompt-guard.js` (98L) | 13 regex patterns + Unicode invisible char detection | PreToolUse on Write/Edit to `.planning/`. Advisory only — never blocks. |
| **Agent Definitions** | `agents/gsd-*.md` (34 files) | Markdown role cards with tool permissions, model tier, color, output artifacts | Each agent is a scoped prompt with explicit tool allow-lists. |
| **Installer** | `bin/install.js` (498KB) | Multi-runtime installer supporting 16+ runtimes | Writes commands, agents, hooks, skills, templates into target runtime config dirs. |
| **Model Resolution** | `src/model-resolver.cts`, `src/model-catalog.cts` | Resolve model by agent type + effort level + provider | Provider presets (openai, anthropic, google, qwen, generic). Budget tiers. |
| **Security** | `src/security.cts` (20KB) | Path validation, sanitization, traversal detection | `confinedSharedFile()` and `confinedBundleScript()` use realpath for symlink confinement. |
| **Worktree Safety** | `src/worktree-safety.cts` (50KB) | Verify-only, fail-closed policy; branch allow-list `^worktree-agent-*` | cwd-drift guard, branch-drift guard, diverged-HEAD auto-downgrade. |
| **Research Module** | `src/research-store.cts`, `src/research-provider.cts` | L2-hybrid seam, content-addressed cache | Provider waterfall: Context7→Ref→Jina→websearch (docs); Exa→Tavily→Perplexity→Brave→websearch (web). |
| **Configuration** | `src/config-loader.cts` (38KB), `src/configuration.cts`, `src/config-schema.cts` | `.planning/config.json` loader with defaults merge, validation, migration | Dynamic routing with failure-tier escalation. Per-phase-type model overrides. |
| **Markdown Sectionizer** | `src/markdown-sectionizer.cts` (24KB) | CommonMark-correct heading tokenization, CRLF-safe | Used by state, roadmap, and verification modules for section extraction/replacement. |
| **Shell Command Projection** | `src/shell-command-projection.cts` (27KB) | `execGit()`, `platformReadSync()`, `platformWriteSync()` | All OS-facing I/O. Cross-platform (Windows path handling). |
| **Frontmatter** | `src/frontmatter.cts` (27KB) | YAML frontmatter parsing/reconstruction for STATE.md, PLAN.md, etc. | Extracts, strips, and reconstructs YAML between `---` fences. |
| **Package Legitimacy** | `src/package-legitimacy.cts` | Slopcheck verdicts: `[SLOP]`, `[SUS]`, `[OK]`, `[ASSUMED]` | Gates npm package usage during execution. |
| **Context Predicates** (CONTEXT.md) | `examples/dynamic-context-management/context-predicates.cjs` | `CLASS.subkey=value` parser → JIT selector | Machine-greppable fact store for agent-brief assembly. |
| **Loop Extension Points** | Workflow `<!-- gsd:loop-host -->` headers | 12 named sites: pre/post for each of 5 steps + per-wave in Execute | Three hook kinds: `step` (additive), `contribution` (inject), `gate` (blocking). |
| **Capability Trust Gate** | `src/capability-trust.cts` (33KB) | Policy module: what a capability does → whether policy permits it | Consent + integrity + reversibility checks. |

---

## 2. Critical Execution Flows

### Flow 1: `/gsd:execute-phase` — Wave-Based Plan Execution

The most complex operation in gsd-core. Orchestrates parallel subagent execution with worktree isolation, locking, and crash recovery.

**Entry point:** `commands/gsd/execute-phase.md` (thin shell, `effort: max`)

1. **Command dispatch** → loads workflow `gsd-core/workflows/execute-phase.md` (93KB, 1708 lines)
2. **`parse_args`** → Extract phase number, `--wave N`, `--gaps-only`, `--interactive`, `--tdd` from `$ARGUMENTS`. Flags are **explicit-only** — never inferred.
3. **`initialize`** → Calls `gsd-tools query init.execute-phase`. Resolves models, worktree config, context window size, MVP/TDD modes. Searches ~20 possible install locations for runtime-agnostic shim.
4. **`safe_resume_gate`** → Checks for orphaned production commits without SUMMARY.md (crashed prior session). Prevents duplicate work.
5. **`check_blocking_antipatterns`** → Reads `.continue-here.md`. Agent must demonstrate understanding of each blocking pattern before proceeding.
6. **`handle_branching`** → Creates phase/milestone branches off `origin/HEAD` (not current HEAD — prevents branch compounding, fix #2916).
7. **`validate_phase`** → Calls `readModifyWriteStateMd()` to transition STATE.md via `transitionCore(content, {kind:'beginPhase', ...}, deps)`.
   - `acquireStateLock()` — `O_CREAT | O_EXCL | O_WRONLY` atomic lock with PID body
   - `transformFn(content)` — caller's mutation
   - `syncStateFrontmatter()` — re-derive YAML from body
   - `applyStatePreservation()` — table-driven field restoration per `FIELD_CLASSIFICATION`
   - `releaseStateLock()` — unlink + remove from `_heldStateLocks`
8. **`discover_and_group_plans`** → `cmdPhasePlanIndex()` → `computeDependencyLevels()` (Kahn's topological sort). Groups plans into dependency waves. Wave safety: refuses Wave 2+ if lower waves have incomplete plans.
9. **`execute_waves`** (the core loop):
   - **cwd-drift guard**: Detects if orchestrator's cwd drifted into agent worktree
   - **Intra-wave file overlap**: If two plans modify same file → force sequential
   - **Agent spawning**: `gsd-executor` subagents with `isolation="worktree"` (Claude Code only). Sequential dispatch with `run_in_background: true` to avoid `.git/config.lock` contention
   - **Checkpoint heartbeats** (#2410): Literal `[checkpoint]` text between waves to prevent Claude API SSE idle timeout at ~200K+ context
   - **Adaptive context enrichment**: 1M+ models get richer subagent context (prior SUMMARY.md, CONTEXT.md, RESEARCH.md)
   - **Worktree merge & cleanup**: After wave, merge worktree branches back. Manifest-based cleanup with safety guards.
   - **Post-merge test gate**: Build + test suite after merging all worktrees
   - **Post-wave capability hooks**: `gsd_run loop render-hooks` at `execute:wave:post` point
   - **Failure classification** (#3095): Unified classifier for quota-exceeded, classifyHandoff bugs, and unknowns across Claude/Copilot/Codex/Gemini
10. **`aggregate_results`** → Summary table. Security gate check.
11. **`code_review_gate`** → Auto-invokes code review capability if active. Advisory only.
12. **`verify_phase_goal`** → Spawns `gsd-verifier` agent. Routes on verification status.
13. **`update_roadmap`** → `cmdPhaseComplete()`:
    - `withPlanningLock(cwd, () => { ... })` — planning-level lock (separate from state lock)
    - Transactional `WriteSpec[]` array: ROADMAP.md checkbox + tracker, REQUIREMENTS.md traceability, STATE.md advance
    - `readModifyWriteStateMd(statePath, completePhaseTransform, cwd)` — `transitionCore(content, {kind:'completePhase', ...}, deps)`
14. **`offer_next`** → Routes to next action or auto-advances chain (`--auto`)

```
User → /gsd:execute-phase N
  → workflows/execute-phase.md
    → gsd-tools init.execute-phase (setup)
    → STATE.md beginPhase transition (locked RMW)
    → computeDependencyLevels (Kahn's sort → waves)
    → FOR EACH wave:
        → gsd-executor subagents (parallel, worktree-isolated)
        → Worktree merge + test gate
        → Capability gate hooks
    → gsd-verifier agent (verification)
    → cmdPhaseComplete (locked transactional write)
    → Route to next action
```

---

### Flow 2: `/gsd:progress` — Situational Routing State Machine

The unified entry point that reads project state and intelligently routes to the correct next action.

**Entry point:** `commands/gsd/progress.md` (`effort: low`)

1. **Parse mode** from first `$ARGUMENTS` token:
   - Default (no flag) → progress report + route
   - `--next` → auto-advance
   - `--next --auto` → chain steps until completion
   - `--do "task"` → freeform intent → best GSD command
   - `--forensic` → append 6-check integrity audit

2. **Read project state**:
   - `gsd-tools state load` → verify STATE.md exists
   - `gsd-tools state get` → extract `current_phase`, `status`, `milestone`, `progress`
   - `gsd-tools roadmap parse` → phase list with plan/summary counts
   - `gsd-tools phase find` → current phase directory artifacts

3. **Priority-ordered routing** (state machine):

   | Priority | Condition | Route | Action |
   |---|---|---|---|
   | 0 (highest) | Any phase has plans > summaries | Route 0 | Resume incomplete phase (catches crash-orphaned work) |
   | 1 | UAT partial | Route E.2 | Resume testing |
   | 2 | UAT gaps diagnosed | Route E | Plan fixes |
   | 3 | Current phase: summaries < plans | Route A | Execute unfinished plans |
   | 4 | All plans done, verification not passed | Route V.* | Close verification debt |
   | 5 | All plans done, verification passed | Step 3 | Check milestone status |
   | 6 | plans = 0 | Route B | Phase needs planning |
   | 7 | Current < highest phase | Route C | Next phase |
   | 8 | Current = highest phase | Route D | Milestone complete |
   | 9 | No ROADMAP but PROJECT exists | Route F | Between milestones |

4. **Route execution** → invokes the appropriate `/gsd:*` command via `SlashCommand` tool permission

```
User → /gsd:progress
  → state load (verify .planning/)
  → state get (current_phase, status)
  → roadmap parse (plan/summary counts across ALL phases)
  → phase find (current phase artifacts)
  → Priority scan (Routes 0→9)
  → Dispatch: /gsd:execute-phase | /gsd:plan-phase | /gsd:verify-work | /gsd:ship
```

**Non-obvious**: Route 0 scans ALL phases (not just current) for incomplete execution — catches STATE.md advanced past a phase with unfinished work (e.g., session crash). Verification status is checked even when count metrics say "complete."

---

### Flow 3: State Transition — `transitionCore()` Pure Engine

The pure-function heart of all STATE.md mutations. Every `cmdState*` function delegates here.

**Entry point:** `src/state-transition.cts` → `transitionCore(content, intent, deps)`

1. **Input**: Raw STATE.md content (string), a `StateTransitionIntent` (discriminated union, 11 kinds), and `StateTransitionDeps` (injected I/O):
   ```typescript
   deps = {
     progressProvider: () => ProgressRecord | null,
     clock: { today: () => string, nowIso: () => string },
     roadmapProvider?: () => string | null,
     phaseInventoryProvider?: () => PhaseInventoryRecord[] | null,
   }
   ```

2. **Dispatch** via `switch(intent.kind)`:
   - `beginPhase` → `beginPhaseCore()`: Sets `current_phase`, `current_phase_name`, `current_plan: 1`, `status: In Progress`, `last_activity: Phase start`
   - `advancePlan` → `advancePlanCore()`: Increments `current_plan` counter
   - `completePhase` → `completePhaseCore()`: Appends to completed phases, advances to next phase or declares milestone done
   - `plannedPhase` → `plannedPhaseCore()`: Records plan count after planning
   - `milestoneSwitch` → `milestoneSwitchCore()`: Transitions between milestones
   - `milestoneComplete` → `milestoneCompleteCore()`: Archives milestone
   - `patch` → `patchCore()`: Multi-field bulk update
   - `update` → `updateCore()`: Single-field update
   - `prune` → `pruneCore()`: Remove old sections
   - `sync` → `syncCore()`: Re-derive frontmatter from body
   - `rebuild` → `rebuildCore()`: Full reconstruction from disk state (ADR-1817)

3. **Output**: `{ content: string, updated: string[], data?: Record<string, unknown> }`

4. **Post-transition** (in the I/O wrapper `readModifyWriteStateMd`):
   - `syncStateFrontmatter(modified, cwd)` — re-derive YAML frontmatter
   - `applyStatePreservation({preFm, postFm, ...})` — table-driven field restoration:
     - `progress` (preserve-always): restored from pre-transition when not resyncing
     - `status` (preserve-when-unchanged): restored via delta heuristic (#1230)
     - Fields with `source: 'disk'` + `preservation: 'derive'`: recomputed from filesystem

5. **Frontmatter key validation**: Each `*Core` function validates that every frontmatter key it produces exists in `FIELD_CLASSIFICATION`. Missing classification = hard build-time error.

```
cmdState*(cwd, ...) [I/O wrapper]
  → acquireStateLock(statePath) [O_EXCL atomic]
  → read STATE.md
  → transitionCore(content, intent, deps) [PURE]
      → switch(intent.kind) → *Core() function
      → return { content, updated, data }
  → syncStateFrontmatter(modified, cwd) [re-derive YAML]
  → applyStatePreservation({preFm, postFm}) [table-driven]
  → write STATE.md
  → releaseStateLock(lockPath)
```

---

## 3. Data Model

### Core Data Structures

```
┌──────────────────────────────────────────────────────┐
│                   .planning/ (workspace)              │
├──────────────────────────────────────────────────────┤
│  PROJECT.md          ← project context               │
│  config.json         ← workflow configuration         │
│  STATE.md            ← YAML frontmatter + body        │
│  ROADMAP.md          ← phase structure + checklists   │
│  REQUIREMENTS.md     ← scoped requirements            │
│  research/           ← domain research files          │
│  phases/                                              │
│    ├── 01-setup/                                      │
│    │   ├── CONTEXT.md     ← phase context             │
│    │   ├── RESEARCH.md    ← phase research            │
│    │   ├── 01-01-PLAN.md  ← execution plan (YAML fm)  │
│    │   ├── 01-02-PLAN.md                              │
│    │   ├── 01-01-SUMMARY.md ← execution result        │
│    │   ├── VERIFICATION.md  ← verification status     │
│    │   └── UAT.md           ← user acceptance tests   │
│    └── 02-core/...                                    │
│  milestones/         ← archived milestone dirs        │
│    └── v1.0-phases/  ← archived phase dirs            │
└──────────────────────────────────────────────────────┘
```

### Type Hierarchy

**State Domain:**
```
StateTransitionIntent (discriminated union, 11 kinds)
  ├── beginPhase { phaseNumber, phaseName, planCount }
  ├── advancePlan {}
  ├── completePhase { phaseNum, nextPhaseNum, nextPhaseName, isLastPhase, planCount, summaryCount }
  ├── plannedPhase { phaseNumber, planCount }
  ├── milestoneSwitch { version, name }
  ├── milestoneComplete { version, nextMilestoneCommand }
  ├── patch { patches: Record<string, string> }
  ├── update { field, value }
  ├── prune { cutoff }
  ├── sync { totalPlansInPhase, percent }
  └── rebuild {}

FieldClassification { source: FieldSource, preservation: FieldPreservation }
  FieldSource = 'body' | 'disk' | 'external' | 'curated' | 'free'
  FieldPreservation = 'derive' | 'preserve-when-unchanged' | 'preserve-always' | 'preserve-if-placeholder' | 'clear'

StateTransitionResult { content: string, updated: string[], data?: Record<string, unknown> }
StateTransitionDeps { progressProvider, clock, roadmapProvider?, phaseInventoryProvider? }
```

**Command Domain:**
```
HubResult (discriminated union on ok + kind)
  ├── OkResult { ok: true, data: unknown }
  └── ErrResult
      ├── UnknownCommand { ok: false, kind, command }
      ├── InvalidArgs { ok: false, kind, arg, reason, exitReason? }
      ├── HandlerRefusal { ok: false, kind, reason }
      └── HandlerFailure { ok: false, kind, message, cause? }

DispatchRequest { family, subcommand?, args?, cwd?, raw?, parentTraceId? }
HubOptions { cjsRegistry?, manifest?, logger? }
```

**Phase Domain:**
```
PhaseSearchResult { found, directory, phase_number, phase_name, phase_slug,
                    plans[], summaries[], incomplete_plans[],
                    has_research, has_context, has_verification, has_reviews, archived? }

RawPlan { id, declaredWave, dependsOn, autonomous, objective, filesModified, taskCount, hasSummary }

ArchivedPhaseDir { name, milestone, basePath, fullPath }
```

**Host Integration Domain:**
```
HostIntegrationAxes {
  embeddingMode: 'imperative' | 'declarative',
  commandSurface: 'slash-file' | 'slash-programmatic' | 'slash-toml' | 'palette' | 'prose-only',
  modelMode: 'active' | 'passive',
  hookBus: 'host' | 'engine' | 'none',
  stateIO: 'filesystem' | 'sandboxed-storage' | 'session-log-append',
  transport: 'mcp' | 'native-extension',
  runtime: 'node' | 'bun' | 'sandboxed-web' | 'python' | 'go' | 'rust' | 'electron' | 'other',
  subagentToolkit: 'full' | 'read-only'
}

DegradationResult { level: 'full' | 'degraded' | 'absent', fallback: string, unknown?: boolean }
NegotiationResult { protocolVersion, effective, points, warnings }
```

**Capability Domain:**
```
LedgerEntry { id, version, source, integrity, files[], sharedEdits[], _pending? }
  _pending: { kind: 'install' | 'upgrade', backupName, sharedFiles[] }

LedgerFile { version, updatedAt, entries: Record<string, LedgerEntry> }
Disclosure { hooks[], commandModules[], mcpServers[], hasExecutable, missingArtifacts[] }
InstallTrustVerdict { allowed, requiresConsent, disclosure, engines, blockReasons[] }
```

### Relationships

```
Command (.md) ──references──→ Workflow (.md) ──spawns──→ Agent (.md)
     │                             │                         │
     │ requires                    │ calls                   │ uses
     ↓                             ↓                         ↓
 Other Commands              gsd-tools CLI              Tool Permissions
                                   │
                    dispatch via    │
                                   ↓
                        Command Routing Hub
                          │         │
                   family │         │ subcommand
                          ↓         ↓
                    CJS Handler Registry
                          │
                          ↓
                  Domain Modules (state, phase, config, verify, ...)
                          │
                          ↓
                    .planning/ filesystem
```

---

## 4. Integration Points

| Integration | Module(s) | Mechanism | Direction |
|---|---|---|---|
| **AI Runtimes** (33 supported) | `host-integration.cts`, `runtime-*.cts`, `capabilities/` | Versioned negotiation protocol. 8 axes, fail-closed to `SAFE_DEFAULTS`. Per-runtime install profiles. | Bidirectional |
| **CLI** | `gsd-core/bin/gsd-tools.cjs`, `gsd_run` | Node.js subcommand dispatch via Command Routing Hub | In: commands → Out: stdout/stderr |
| **MCP Protocol** | `src/mcp-server.cts`, `bin/gsd-mcp-server.js` | Hand-rolled JSON-RPC 2.0 over stdio. 3 tools. | Bidirectional |
| **File System** | `planning-workspace.cts`, `state-io.cts`, `shell-command-projection.cts` | Direct `fs.*Sync` with O_EXCL locking, `fsyncDir` for durability | Read/Write |
| **Git** | `shell-command-projection.cts` (`execGit`), `worktree-safety.cts`, `git-base-branch.cts` | Subprocess exec. Worktree isolation for parallel execution. Branch allow-list. | Subprocess |
| **Plugin System** | `.claude-plugin/plugin.json`, `gemini-extension.json` | Manifest-based auto-discovery of commands, agents, hooks, skills | Declarative |
| **Hook Bus** | `hooks/hooks.json`, `hooks/gsd-*.js` | Event-driven: SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop, PreCompact, FileChanged | Event → stdin JSON → stdout JSON |
| **Capability Ecosystem** | `capability-lifecycle.cts`, `capability-loader.cts`, `capability-consent.cts` | Two-phase commit ledger. npm/git/local sources. Trust gating. | Install/Runtime |
| **AI Models** | `model-resolver.cts`, `model-catalog.cts` | Provider cascade (openai→anthropic→google→qwen→generic). Per-agent tier. | Config → Resolution |
| **Research APIs** | `src/research-provider.cts`, `src/research-store.cts` | Content-addressed cache. Provider waterfall (Context7→Ref→Jina→websearch for docs; Exa→Tavily→Perplexity→Brave→websearch for web) | Outbound HTTP |
| **npm Registry** | `src/package-legitimacy.cts`, `src/capability-source.cts` | Slopcheck verdicts, source resolution for capabilities | Outbound |

### Input/Output Boundaries

**Inputs:**
- User commands via slash commands (`/gsd:*`) or CLI (`gsd-tools`)
- MCP JSON-RPC requests over stdio
- `.planning/` filesystem state
- Git repository state
- AI runtime hook events (JSON on stdin)
- npm/git capability sources
- Research API responses

**Outputs:**
- `.planning/` filesystem mutations (STATE.md, ROADMAP.md, PLAN.md, SUMMARY.md, etc.)
- Git commits and branches
- stdout/stderr for CLI consumers
- MCP JSON-RPC responses
- Hook `additionalContext` injections (context warnings, prompt guard alerts)
- Installed runtime artifacts (commands, agents, hooks, skills in `~/.claude/`, `~/.gemini/`, etc.)

---

## 5. Documentation vs. Reality

### ✅ Where Code MATCHES Documentation

| Aspect | Doc Source | Code Evidence |
|---|---|---|
| **Five-step phase loop** | README.md, `docs/explanation/the-phase-loop.md` | Commands exist for all 5 steps. Workflow files implement the exact sequence. `progress.md` routes through the exact loop order. |
| **Fresh context per agent** | `docs/ARCHITECTURE.md` (Design Principle 1) | `execute-phase.md` workflow explicitly caps orchestrator at ~15% context, spawns executor subagents with full fresh 200K tokens. `gsd-context-monitor.js` warns at 35%/25%. |
| **File-based state** | `docs/ARCHITECTURE.md` (Design Principle 3) | All state lives in `.planning/` as markdown + JSON files. `planning-workspace.cts` manages paths. No database, no in-memory state across sessions. |
| **Wave execution model** | `docs/ARCHITECTURE.md` | `computeDependencyLevels()` in `phase.cts` implements Kahn's algorithm. `execute-phase.md` workflow enforces wave ordering with safety checks. |
| **11 state transitions** | CONTEXT.md predicates | `StateTransitionIntent` union has exactly 11 kinds matching the documented set (10 from ADR-1769 + `rebuild` from ADR-1817). |
| **No-throw hub contract** | `docs/CLI-TOOLS.md`, ADR-0174 | `command-routing-hub.cts` wraps all dispatch in try/catch, coerces even non-Error throwables to `HandlerFailure`. Logger failures swallowed. |
| **O_EXCL lock protocol** | `docs/ARCHITECTURE.md` (Parallel Commit Safety) | Both `planning-workspace.cts` (`withPlanningLock`) and `state.cts` (`acquireStateLock`) implement O_EXCL with pid-body, liveness check, deadman ceiling. |
| **33 runtime support** | `docs/ARCHITECTURE.md`, `docs/COMMANDS.md` | `capabilities/` directory has 33 subdirectories, one per runtime. `host-integration.cts` has `SAFE_DEFAULTS` and 3 profile baselines. |
| **Advisory-only hooks** | `docs/context-monitor.md` | Both `gsd-context-monitor.js` and `gsd-prompt-guard.js` are advisory. Silent-fail philosophy: outer catch exits 0, never blocks tool execution. |
| **Capability crash recovery** | `docs/explanation/capability-trust-model.md` | `reconcileCapabilities()` in `capability-lifecycle.cts` implements full crash recovery: scan `_pending` markers → rollback or roll-forward. |

### ⚠️ Where Code DIVERGES from Documentation

| Aspect | Doc Says | Code Reality |
|---|---|---|
| **Worktree isolation** | Documented as a general feature | `execute-phase.md` workflow explicitly restricts worktrees to Claude Code runtime only. Other runtimes MUST set `workflow.use_worktrees=false` or FATAL. This restriction isn't prominent in high-level docs. |
| **"5 step" loop naming** | README says "Discuss → Plan → Execute → Verify → Ship" | Commands use both `discuss-phase` AND `explore` for the first step. `new-project` also serves as an entry point. The loop is actually 5+ entry points, not a strict 5-step sequence. |
| **Loop extension points** | Docs describe "12 named sites" | Workflow files declare extension points per-workflow via `<!-- gsd:loop-host -->` metadata. The actual number of active points depends on which capabilities are installed. The "12" count is a ceiling, not a guaranteed minimum. |
| **MCP server tools** | `docs/CLI-TOOLS.md` describes rich CLI | MCP server exposes only 3 tools (`gsd_invoke_command`, `gsd_read_state`, `gsd_write_state`). The full CLI surface (20+ command families) is accessed through `gsd_invoke_command` dispatch, not direct tools. The MCP surface is intentionally minimal. |
| **Context monitor bridge** | `docs/context-monitor.md` describes hook | The actual mechanism uses a **two-hook bridge**: `gsd-statusline.js` writes metrics to `/tmp/claude-ctx-{session}.json`, then `gsd-context-monitor.js` reads them. This bridge-file pattern isn't documented — docs describe it as a single hook. |

### 🔍 Behaviors in Code but NOT Documented

| Behavior | Location | Details |
|---|---|---|
| **Runtime variant schema validation** | `command-routing-hub.cts` `_validateErrResult()` | ok:false results from handlers are validated at runtime against `_VARIANT_SCHEMA`. Malformed error results are silently coerced to `HandlerFailure`. Not documented anywhere. |
| **Null-prototype objects** | `state-transition.cts` `FIELD_CLASSIFICATION` | Uses `Object.create(null)` to prevent prototype pollution. `FIELD_CLASSIFICATION['toString']` returns `undefined`. All lookups via `hasOwnProperty`. This defensive pattern isn't documented. |
| **Frontmatter key build-time guard** | `state-transition.cts` `*Core()` functions | Each transition function validates that every frontmatter key it produces exists in `FIELD_CLASSIFICATION`. Adding a new STATE.md field without a classification row is a hard error. Not in any ADR. |
| **Lock steal identity re-confirm** | `planning-workspace.cts` | Before stealing a dead lock, the code re-stats AND re-reads the lock file to compare `(dev, ino, body)` against the decision-time snapshot. Prevents race condition where another process already stole it. This sophisticated protocol isn't documented. |
| **`fsyncDir` after capability rename** | `capability-lifecycle.cts` `promoteStagingToFinal()` | Calls `fsyncDir(parent)` after each rename for durability across power loss (DUR-2/DUR-3). Crypto random nonce in backup name prevents same-ms collisions (CONC-3). Not in capability docs. |
| **Checkpoint heartbeats** | `execute-phase.md` workflow | Literal `[checkpoint]` text lines between waves to prevent Claude API SSE stream idle timeout at ~200K+ context. Undocumented workaround for #2410. |
| **Non-canonical plan warnings** | `phase.cts` `describeNonCanonicalPlans()` | Detects and warns about plan files that look like plans but don't match the strict naming convention. Prevents silent omission by the executor. Not documented. |
| **Session ID sanitization in hooks** | `gsd-context-monitor.js` | Rejects session IDs containing `/`, `\`, or `..` — path traversal prevention for `/tmp/` file paths. Security hardening not mentioned in hook docs. |
| **"act as" negative lookahead** | `gsd-prompt-guard.js` | The regex `/act\s+as\s+(?:a|an|the)\s+(?!plan|phase|wave)/i` uses negative lookahead to exempt legitimate GSD terms. This injection-detection nuance is undocumented. |
| **Auto-degrade for diverged HEAD** | `execute-phase.md` workflow | If HEAD diverged from worktree fork base, auto-downgrades to sequential execution with warning instead of failing. Undocumented graceful degradation. |
| **Transient FS error retry** | `planning-workspace.cts` `PLANNING_LOCK_RETRY_ERRNOS` | A curated set of transient codes (EPERM, EBUSY, EAGAIN, EINTR, EINVAL, EIO, ENOENT, ESTALE) trigger retry. Fatal codes (EMFILE, ENOSPC, EROFS, EACCES) propagate. This errno taxonomy isn't documented. |
