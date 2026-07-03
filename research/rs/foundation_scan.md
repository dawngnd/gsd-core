# Foundation Scan — gsd-core

> Documentation-first scan of gsd-core's core concepts, terminology, and architecture.

---

## Project Identity

- **Name:** gsd-core ("Git. Ship. Done.")
- **Package:** `@opengsd/gsd-core` v1.7.0-rc.1
- **License:** MIT | **Node:** ≥22.0.0
- **Type:** Meta-prompting, context-engineering, and spec-driven development system for AI coding agents
- **Supported runtimes:** 33 (Claude Code, Gemini CLI, Cursor, Codex, Copilot, Windsurf, Cline, Augment, Kilo, Kimi, Qwen, etc.)

## Core Concepts

### 1. Phase Loop (the central execution model)
Each milestone repeats a five-step loop, one phase at a time:
1. **Discuss** — capture implementation decisions before planning
2. **Plan** — research, decompose, verify the plan fits a fresh context window
3. **Execute** — run plans in parallel waves; each executor starts with clean 200K-token context
4. **Verify** — walk through what was built; diagnose and fix before declaring done
5. **Ship** — create the PR, archive the phase, repeat

### 2. Context Rot
Quality degradation that accumulates as an AI fills its context window. GSD solves this by running heavy work in fresh-context subagents.

### 3. Milestone / Phase
- **Milestone** — high-level unit of work containing multiple phases
- **Phase** — single iteration through the five-step loop

### 4. `.planning/` Workspace
Source-of-truth directory for project state:
- `PROJECT.md` — project context
- `config.json` — workflow preferences
- `STATE.md` — project state (YAML frontmatter + markdown body)
- `ROADMAP.md` — phase structure
- `REQUIREMENTS.md` — scoped requirements
- `phases/` — phase directories with PLAN.md, SUMMARY.md, CONTEXT.md, VERIFICATION.md, UAT.md
- `milestones/` — archived milestone dirs

### 5. STATE.md Transitions
11 intent kinds: beginPhase, advancePlan, completePhase, plannedPhase, milestoneSwitch, milestoneComplete, patch, update, prune, sync, rebuild. Field classification table (ADR-1769): source × preservation.

### 6. Command Routing Hub
Single dispatch seam for all command family adapters. No-throw pure-result contract. Typed Result algebra (OkResult | ErrResult with 4 error variants).

### 7. Capability System (ADR-1244)
Bundle delivering optional GSD features. Lifecycle: install, upgrade, remove, reconcile. Trust gate, consent store, command dispatch. 12 loop extension points with 3 hook kinds (step, contribution, gate).

### 8. Host Integration
Versioned, negotiated contract over 8 axes: embeddingMode, commandSurface, modelMode, hookBus, stateIO, transport, runtime, subagentToolkit. Fail-closed to SAFE_DEFAULTS. 6 interface points with degradation model.

### 9. Wave Execution Model
Plans grouped into dependency waves via Kahn's topological sort. Parallel within waves, sequential across waves. Worktree isolation (Claude Code only).

### 10. Agent System
34 specialized agents (markdown role cards): researchers, analyzers, synthesizers, planners, executors, checkers, verifiers, auditors, mappers, debuggers, doc writers, profilers. Each scoped with tool permissions and model tier.

## Architecture Overview

### 4-Layer Architecture
1. **Command Layer** — 69 slash commands (markdown with YAML frontmatter)
2. **Workflow Layer** — 90+ workflow orchestration files
3. **Agent Layer** — 34 agent definitions
4. **CLI Tools Layer** — `gsd-tools.cjs` with 30+ domain modules

### Module System (Seam-Oriented)
Key modules: State, Phase, Roadmap, Config, Capability, Verify, Template, Init, Security, Model Resolution, Planning Workspace, Shell Command Projection, Host Integration, Markdown Sectionizer, Frontmatter.

### Entry Points
| Binary | Path | Purpose |
|---|---|---|
| `gsd-core` | `bin/install.js` | Multi-runtime installer |
| `gsd-tools` | `gsd-core/bin/gsd-tools.cjs` | CLI utility |
| `gsd_run` | `gsd-core/bin/gsd_run` | Shell launcher |
| `gsd-mcp-server` | `bin/gsd-mcp-server.js` | MCP companion server |

### Scale
| Category | Count |
|---|---|
| TypeScript source files | ~140 |
| Slash commands | 69 |
| Agent definitions | 34 |
| Hook scripts | 20 |
| Skills | 69 |
| Workflow files | 90+ |
| Templates | 34+ |
| Reference docs | 79+ |
| Supported runtimes | 33 |
| Total src/ code | ~2.4MB TypeScript |

## Key Documentation Files
| File | Size | Content |
|---|---|---|
| `README.md` | 5.6KB | Project overview, phase loop, install |
| `CONTEXT.md` | 222KB | Machine-greppable predicate document |
| `CONTRIBUTING.md` | 51KB | Issue-first rule, testing standards, branching model |
| `docs/ARCHITECTURE.md` | 62.6KB | System architecture, design principles |
| `docs/COMMANDS.md` | 81.6KB | Complete command reference (86+ commands) |
| `docs/CONFIGURATION.md` | 113.4KB | Config schema reference |
| `docs/FEATURES.md` | 169.3KB | Feature index (147+ features, v1.0–v1.43) |
| `docs/AGENTS.md` | 32.8KB | Agent role cards |
| `docs/USER-GUIDE.md` | 52KB | Narrative companion guide |
| `docs/INVENTORY.md` | 73.6KB | Authoritative roster of all shipped surfaces |
| `docs/CLI-TOOLS.md` | 28.9KB | `gsd-tools` CLI reference |

## Design Principles
1. **Fresh Context Per Agent** — 200K tokens, never share context across subagents
2. **Thin Orchestrators** — orchestrator stays at ~15% context budget
3. **File-Based State** — all state in `.planning/`, no databases
4. **Absent = Enabled** — disabled capability yields base output by construction
5. **Defense in Depth** — path traversal guards, prompt injection detection, worktree safety
