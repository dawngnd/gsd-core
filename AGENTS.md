<!-- GSD:project-start source:PROJECT.md -->

## Project

**NDD Brownfield Change Workflow**

NDD is a fixed brand and namespace for a plug-and-play brownfield change workflow built inside GSD Core. It helps users maintain an existing running project by ingesting a folder of Markdown change documents, clarifying unclear business/API/proposal context, discovering impact against the existing codebase, and then reusing GSD's phase planning, execution, verification, and ship mechanics.

The workflow is not a replacement for GSD Core. NDD is an opinionated orchestration layer that adapts GSD's core engine to project-specific maintenance work: adding features, modifying existing behavior, fixing business flows, and implementing scoped change requests from imperfect documentation.

**Core Value:** Turn messy project-specific change documents into an approved, impact-aware implementation scope that can safely reuse GSD's existing planning, subagent execution, verification, and shipping loop.

### Constraints

- **Namespace**: NDD must use the fixed `ndd` brand/namespace — The feature should be distinct from core GSD commands.
- **Architecture**: NDD should be a thin workflow/adaptor layer over GSD Core — The goal is to reuse GSD's context management, subagent orchestration, phase mechanics, verification, and ship behavior.
- **Artifacts**: NDD discovery state should live under `.planning/ndd/changes/<change-id>/` — Change intake and clarification should not pollute `ROADMAP.md` before the change is approved.
- **Bridge point**: Approved changes may bridge into GSD phase mechanics — This maximizes reuse while preserving a separate NDD discovery lifecycle.
- **Input format**: Initial change input is a folder of Markdown files — The workflow must support multiple source documents, not only one file.
- **Document quality**: Source documents can be ambiguous, contradictory, or incomplete — Ingestion and discussion must surface and resolve uncertainty before planning.
- **Brownfield requirement**: Codebase mapping is baseline knowledge — NDD should use `.planning/codebase/*` and source inspection for impact discovery.
- **Maintainability**: Do not hard-fork GSD core workflows — Forking core flows would create drift from future GSD fixes.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript - Runtime library sources in `src/**/*.cts`, compiled to CommonJS `.cjs` files under `gsd-core/bin/lib/`.
- JavaScript - Installer, build scripts, hooks, generated runtime artifacts, tests, and CLI entry points.
- Markdown - User-facing commands, workflow definitions, agent definitions, templates, docs, and skill bodies.
- Shell - Hook scripts and release/security helper scripts in `hooks/*.sh` and `scripts/*.sh`.
- JSON/TOML/YAML - Package metadata, GitHub workflow/config files, capability manifests, rulesets, issue templates, and runtime configuration snippets.

## Runtime

- Node.js `>=22.0.0`, npm `>=10.0.0`, enforced by `package.json`.
- Distributed as npm package `@opengsd/gsd-core`.
- No server process is required for the main product; most behavior is CLI/file-system based.
- npm with `package-lock.json`.
- npm package bin entries:

## Frameworks and Tooling

- Vanilla Node.js CLI/runtime code using Node built-ins such as `fs`, `path`, `os`, `child_process`, and `readline`.
- Prompt/workflow framework stored as Markdown artifacts in `commands/`, `skills/`, `agents/`, and `gsd-core/workflows/`.
- Runtime capability model stored in `capabilities/*/capability.json`.
- TypeScript `^6.0.3` compiles `.cts` files from `src/` to `.cjs` in `gsd-core/bin/lib/`.
- `scripts/build-hooks.js` builds hook distribution artifacts.
- Generation scripts create derived registries/manifests, including `scripts/gen-capability-registry.cjs`, `scripts/gen-loop-host-contract.cjs`, `scripts/gen-plugin-skills.cjs`, and `scripts/generate-package-identity.cjs`.
- Node's built-in test runner via `node --test`, orchestrated by `scripts/run-tests.cjs`.
- `c8` for coverage.
- `fast-check` for property tests.
- Stryker (`@stryker-mutator/core`) for mutation testing.
- ESLint 9 flat config in `eslint.config.mjs`.
- `typescript-eslint`, `eslint-plugin-n`, `eslint-plugin-no-only-tests`.
- Local custom ESLint rules in `eslint-rules/`.

## Key Dependencies

- `@anthropic-ai/claude-agent-sdk` - Agent SDK integration.
- `ws` - WebSocket support for runtime/MCP/host integration surfaces.
- Optional `fallow` - Optional dependency used by fallow runner support.
- `typescript` - Strict build for runtime source.
- `eslint` and local rules - Style, portability, and safety gates.
- `c8` - Coverage enforcement.
- `fast-check` - Property-based tests.
- `js-yaml` - YAML parsing in tests/scripts or tooling.

## Configuration

- `tsconfig.build.json` is the emitting build config. It emits CommonJS artifacts into `gsd-core/bin/lib/` and uses strict TypeScript settings.
- `tsconfig.json` extends the build config with `noEmit: true` for editor/CI type checking.
- `eslint.config.mjs` applies type-aware linting to `src/**/*.cts`, custom portability rules, and separate JavaScript/test/hook rules.
- GSD project state is file-based under `.planning/` when a user initializes a project.
- Runtime install/config targets are resolved by runtime policy modules such as `src/runtime-homes.cts`, `src/runtime-artifact-layout.cts`, and `src/runtime-config-adapter-registry.cts`.

## Platform Requirements

- Cross-platform Node environment. The codebase has explicit Windows portability guardrails in tests and ESLint rules.
- Git is used by workflow tooling, commit helpers, branch policy scripts, and release automation.
- Published as an npm package.
- Installs command, skill, agent, workflow, hook, and runtime-specific artifacts into local or global runtime config directories.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Kebab-case for most modules: `command-routing-hub.cts`, `runtime-artifact-layout.cts`, `run-tests.cjs`.
- TypeScript runtime source uses `.cts` so TypeScript emits CommonJS `.cjs`.
- Tests use `*.test.cjs`; regression tests commonly include issue IDs such as `bug-3491-nested-git-worktree.test.cjs`.
- Command, skill, workflow, and agent files use kebab-case names.
- camelCase for functions in TypeScript and JavaScript.
- Predicate helpers often start with `is`, `has`, `should`, or `can`.
- Router helpers often use `route*`, `resolve*`, `load*`, `read*`, `write*`, or `build*`.
- camelCase for local variables.
- UPPER_SNAKE_CASE for constants such as `ERROR_KINDS` and hook/config marker names.
- Leading underscore is used for private/internal helper names in some modules, e.g. `_safeJson`.
- PascalCase for TypeScript interfaces and type aliases.
- Literal union/result variants are preferred for structured command outcomes.

## Code Style

- Semicolons are used.
- Single quotes are the dominant string style.
- Two-space indentation is common in JavaScript/TypeScript files.
- Long comments are acceptable when they document ADR/issue rationale or non-obvious portability/security constraints.
- `eslint.config.mjs` is the authoritative lint config.
- Type-aware linting applies to `src/**/*.cts` through `typescript-eslint`.
- Local rules enforce project-specific constraints, especially around markdown parsing, path normalization, portability, temp paths, shell execution, and tests.
- Run with `npm run lint` or `npm run lint:ci`.
- Strict TypeScript settings in `tsconfig.build.json`.
- `noEmitOnError: true`.
- The project uses `.cts` and NodeNext module resolution to emit CommonJS.
- Some migrated modules still use `require` interop with explicit ESLint disable comments to preserve CommonJS compatibility.

## Import Organization

- `require(...)` is used in installer, scripts, tests, hooks, and generated runtime artifacts.
- Destructuring imports from local modules are common.
- No broad application alias is used. Relative imports dominate.
- Generated runtime modules generally import sibling `.cjs` files.

## Error Handling

- CLI boundaries use `ExitError` and `runMain` from `cli-exit.cjs` / `src/cli-exit.cts`.
- Command routers increasingly use structured result objects instead of throwing.
- `src/command-routing-hub.cts` enforces a no-throw dispatch contract and closed error taxonomy.
- Installer code frequently uses explicit guards, rollback snapshots, best-effort cleanup, and human-readable error messages.
- Expected validation failures should return structured errors or user-facing CLI errors.
- Unexpected handler failures are wrapped as `HandlerFailure` in the routing hub.
- Best-effort cleanup catches errors intentionally and documents that behavior in comments.

## Logging and Output

- No general logging framework is used.
- CLI output is centralized through `io.cjs` where possible.
- Observability events have a logger seam under `src/observability/`.
- Avoid direct output from pure routing logic.
- Use stderr warnings for non-blocking advisory conditions.
- Tests often assert stdout/stderr behavior for CLI commands.

## Comments

- Comments are used heavily for ADR references, issue-specific regression context, portability constraints, security boundaries, and generated-artifact rationale.
- Comments should explain why a constraint exists or what invariant a block protects.
- Existing TODOs are sparse and generally tied to ADR follow-ups, for example `gsd-core/bin/lib/state-transition.cjs`.

## Function and Module Design

- Prefer small pure helpers for validation, formatting, parsing, and dispatch decisions.
- Boundary functions handle file-system, process, or git I/O.
- Many modules expose both public functions and internal helpers for tests.
- Domain modules are grouped by concept: config, state, roadmap, phase, runtime-artifact, capability, validation, verification, graphify, intel, workstream.
- Router modules keep CLI subcommand handling out of lower-level domain modules.
- Generated runtime `.cjs` files mirror TypeScript source where migration has happened.

## Markdown and Prompt Artifacts

- Markdown files are executable instructions and should be treated as source code.
- Keep workflow files bounded; extract lazily loaded references/templates when workflows grow.
- Maintain runtime-specific command spelling rules (`/gsd-command`, `/gsd:command`, `$gsd-command`) through conversion utilities instead of ad hoc edits.
- `.planning/` artifacts are human-readable Markdown/JSON and are expected to be committed when `commit_docs` is enabled.

## File-System and Portability Rules

- Prefer Node APIs over shell-specific behavior for cross-platform operations.
- Avoid hardcoded `/tmp`; use OS temp helpers.
- Guard shell execution and platform-sensitive path handling.
- Use POSIX normalization when embedding paths in generated content.
- Use symlink/path escape checks around installer writes.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Pattern Overview

- Prompt-first product surface: commands, skills, workflows, references, templates, and agents are Markdown artifacts.
- Node CLI/tooling layer performs deterministic file-system, git, config, validation, install, and state operations.
- TypeScript source in `src/**/*.cts` is the source of truth for many runtime `.cjs` modules emitted into `gsd-core/bin/lib/`.
- Runtime adapters translate one canonical GSD workflow surface into multiple agent-runtime formats.
- State is local and file-based; `.planning/` is the user project's durable memory.

## Layers

- Purpose: Expose GSD actions to users in runtime-native command/skill form.
- Contains: `commands/gsd/*.md`, `skills/*/SKILL.md`, namespace router skills, and installed runtime copies under `.agents/` and `.codex/`.
- Depends on: Workflow Markdown, references, templates, and runtime-specific installation/conversion.
- Used by: Agent runtimes such as Claude Code, Codex, Gemini CLI, OpenCode, Kilo, Copilot, Cursor, and others.
- Purpose: Orchestrate multi-step GSD flows such as new-project, map-codebase, plan-phase, execute-phase, verify-work, and ship.
- Contains: `gsd-core/workflows/*.md`, `gsd-core/references/*.md`, and `gsd-core/templates/*.md`.
- Depends on: `gsd-tools.cjs` query/init helpers and specialized agents.
- Used by: Command/skill bodies and orchestration agents.
- Purpose: Define specialized fresh-context roles for research, planning, execution, review, verification, mapping, security, UI, and documentation.
- Contains: `agents/*.md` and installed runtime-specific agent files.
- Depends on: Workflow prompts, references, source files, and `.planning/` artifacts.
- Used by: GSD workflows when a runtime supports subagent execution.
- Purpose: Provide deterministic operations that prompts should not hand-roll: init context, state updates, roadmap/phase parsing, config, commits, validation, frontmatter, drift guard, and router families.
- Contains: `gsd-core/bin/gsd-tools.cjs`, `gsd-core/bin/gsd_run`, generated `gsd-core/bin/lib/*.cjs`, and TypeScript sources in `src/*.cts`.
- Depends on: Node built-ins, package metadata, config files, and `.planning/` documents.
- Used by: Workflows, hooks, scripts, tests, and installer.
- Purpose: Install, convert, preserve, migrate, and uninstall GSD artifacts for each supported runtime.
- Contains: `bin/install.js`, `src/install-engine.cts`, `src/runtime-artifact-*.cts`, `src/runtime-homes.cts`, `src/runtime-name-policy.cts`, `src/profile-output.cts`, and hook surface modules.
- Depends on: Packaged `commands/`, `skills/`, `agents/`, `gsd-core/`, `hooks/`, `capabilities/`, and runtime config directories.
- Used by: `npx @opengsd/gsd-core@latest` and package bin `gsd-core`.
- Purpose: Model optional capability packs and loop extension points.
- Contains: `capabilities/*/capability.json`, `src/capability-*.cts`, generated `gsd-core/bin/lib/capability-registry.cjs`, and related tests.
- Depends on: Capability manifests and install/surface state.
- Used by: Installer, loop hooks, state queries, and runtime surface management.
- Purpose: Integrate local runtime lifecycle events with GSD state, guardrails, status, and update checks.
- Contains: `hooks/*.js`, `hooks/*.sh`, `hooks/lib/*`, `hooks/managed-hooks-registry.cjs`, and `scripts/build-hooks.js`.
- Depends on: Git, Node, shell, runtime hook support, and generated hook distribution files.
- Used by: Installed runtime configurations.
- Purpose: Enforce behavior, portability, regression fixes, package integrity, workflow size, lint policy, and release gates.
- Contains: `tests/**/*.test.cjs`, `scripts/run-tests.cjs`, `eslint-rules/`, `.github/workflows/`, and policy scripts in `scripts/`.
- Depends on: Built runtime artifacts and hook dist artifacts.
- Used by: CI and local development.

## Data Flow

## State Management

- Project state is local files under `.planning/`.
- GSD installation/runtime state is local files under runtime config directories and project-local install directories.
- Capability state and ledgers are JSON/file based.
- No long-lived in-memory service is required.

## Key Abstractions

- Markdown instructions in `gsd-core/workflows/*.md`.
- Pattern: Thin orchestrator that loads context, asks/branches, delegates or performs deterministic steps, and writes files.
- Encapsulates how canonical GSD assets become runtime-specific commands, skills, agents, hooks, and instructions.
- Examples: `src/runtime-artifact-layout.cts`, `src/runtime-artifact-conversion.cts`, `src/runtime-config-adapter-registry.cts`.
- Dispatches CLI command families through generated CommonJS handlers with a no-throw result contract.
- Examples: `src/command-routing-hub.cts`, `src/*-command-router.cts`.
- Resolves `.planning/`, active workstream, project root, and state file locations.
- Examples: `src/planning-workspace.cts`, `src/active-workstream-store.cts`, `src/state.cts`.
- A declarative feature pack with install/surface/hook behavior.
- Examples: `capabilities/*/capability.json`, `src/capability-loader.cts`, `src/capability-state.cts`.

## Entry Points

- `bin/install.js` - Main installer invoked by `npx @opengsd/gsd-core@latest` and package bin `gsd-core`.
- `package.json` - Defines package metadata, bins, scripts, dependencies, engines, and publish files.
- `gsd-core/bin/gsd-tools.cjs` - Main workflow helper CLI.
- `gsd-core/bin/gsd_run` - Runtime helper wrapper.
- `bin/gsd-mcp-server.js` - MCP server bin.
- `src/**/*.cts` - Typed source for generated runtime modules.
- `tsconfig.build.json` - Emits generated `.cjs` runtime library.
- `scripts/run-tests.cjs` - Test runner and build-artifact bootstrap.

## Error Handling

- CLI helpers centralize exit behavior through `cli-exit.cjs` / `src/cli-exit.cts`.
- Routers increasingly use pure result objects instead of throwing or printing directly.
- Installer code uses explicit guards and rollback/preservation behavior around file writes.
- Boundary modules validate inputs and return structured errors where possible.
- Best-effort cleanup is common for temporary files and rollback paths.
- Tests encode many historical bug regressions as `tests/bug-*.test.cjs`.

## Cross-Cutting Concerns

- Path validation, symlink escape guards, read guards, prompt-injection scanners, and secret scans appear across installer, hooks, scripts, and tests.
- Security scan workflows and scripts live under `.github/workflows/security-scan.yml`, `scripts/secret-scan.sh`, and `scripts/prompt-injection-scan.sh`.
- Windows and shell portability are first-class concerns enforced by custom ESLint rules and regression tests.
- Many runtime files are generated from source or canonical assets. Build and lint scripts check identity, alias, manifest, command contract, plugin skill, and capability drift.
- Workflow, agent, and skill sizes are treated as product quality constraints, with scripts/tests enforcing budgets and progressive disclosure patterns.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.agents/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
