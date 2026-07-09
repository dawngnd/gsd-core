# Phase 1: NDD Namespace Foundation - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the NDD namespace surface for local runtime installs without changing existing GSD command behavior. It should prove that NDD can be discovered and installed as a distinct branded command/skill namespace, while keeping NDD implementation as a thin workflow/adaptor layer over existing GSD core mechanics.

</domain>

<decisions>
## Implementation Decisions

### Namespace Surface

- **D-01:** V1 uses a parallel top-level NDD namespace rather than a full capability/plugin surface.
- **D-02:** `commands/ndd/*.md` is the canonical source for NDD commands.
- **D-03:** `skills/ndd-*` should be generated from `commands/ndd/*.md` where possible, not maintained manually.
- **D-04:** The installer/runtime artifact layer should be extended to support non-GSD namespaces using a reusable abstraction such as `commandNamespaces` or `extraNamespaces`.
- **D-05:** The Phase 1 design should leave a path to later capability/plugin registration, but must not build the full plugin/capability system now.
- **D-06:** User-facing command names remain direct NDD commands: `ndd-change`, `ndd-impact`, `ndd-discuss-phase`, `ndd-plan-phase`, `ndd-execute-phase`, `ndd-verify-work`, and `ndd-ship`.

### Install Contract

- **D-07:** Phase 1 supports local installs only.
- **D-08:** Codex local install should emit NDD skills under `.codex/skills/ndd-*`.
- **D-09:** Antigravity local install should emit NDD skills under `.agents/skills/ndd-*`.
- **D-10:** Antigravity CLI should remain part of the design target, but Phase 1 only needs to prove local artifact output.
- **D-11:** Global NDD install is out of Phase 1 and may be added later.
- **D-12:** Existing `gsd-*` skill generation must remain unchanged.
- **D-13:** Tests should prove that `commands/ndd/*.md` converts to `skills/ndd-*/SKILL.md` for Codex and Antigravity local installs, without namespace rewrite mistakes or unwanted pruning of non-GSD/user-authored skills.

### Reuse Boundary

- **D-14:** NDD wrappers may reference GSD workflow, reference, and template files.
- **D-15:** NDD wrappers may call existing `gsd-tools.cjs` helpers.
- **D-16:** NDD wrappers may generate bridge artifacts that existing GSD planner/executor/verifier mechanics can consume.
- **D-17:** NDD must not copy full `gsd-plan-phase.md`, `gsd-execute-phase.md`, `gsd-verify-work.md`, or `gsd-ship.md` workflows into independent forks.
- **D-18:** NDD-specific prompts should stay in small wrapper/adaptor workflows that load NDD artifacts and dispatch into GSD mechanics.

### the agent's Discretion

The planner may choose exact helper names and module seams for the namespace abstraction, as long as it preserves the decisions above and keeps Phase 1 scoped to local Codex + local Antigravity support.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope

- `.planning/PROJECT.md` — Defines NDD as a fixed namespace and thin brownfield workflow layer over GSD Core.
- `.planning/REQUIREMENTS.md` — Contains Phase 1 requirements `NDD-01`, `NDD-02`, `MNT-01`, and `MNT-02`.
- `.planning/ROADMAP.md` — Defines Phase 1 goal, plans, and success criteria.

### Codebase Map

- `.planning/codebase/STACK.md` — Runtime/build/tooling context for installer and generated skill work.
- `.planning/codebase/ARCHITECTURE.md` — Describes command, workflow, installer, runtime artifact, and capability layers.
- `.planning/codebase/CONVENTIONS.md` — Coding, naming, generation, portability, and prompt artifact conventions.

### Likely Source Areas

- `commands/gsd/` — Existing canonical GSD command source layout that NDD should parallel.
- `skills/` — Existing generated/manual skill surface patterns.
- `src/runtime-artifact-layout.cts` — Runtime artifact layout source for install/surface descriptors.
- `src/runtime-artifact-conversion.cts` — Runtime conversion helpers for command-to-skill surfaces.
- `src/install-profiles.cts` — Staging helpers used by runtime artifact layout.
- `bin/install.js` — Existing installer behavior and legacy authoritative install paths.
- `capabilities/codex/capability.json` — Codex runtime artifact layout; currently local/global skill layout uses `prefix: "gsd-"`.
- `capabilities/antigravity/capability.json` — Antigravity runtime artifact layout; local config dir is `.agents` and skill layout uses `prefix: "gsd-"`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- Runtime artifact descriptors already model runtime-specific skill layout with `kind`, `destSubpath`, `prefix`, and `converter`.
- Codex and Antigravity both use flat skills layouts with runtime-specific converters, making them good first targets for local NDD namespace generation.
- Existing command/skill generation already knows how to convert Claude-style command Markdown into runtime skill folders.

### Established Patterns

- Canonical prompt artifacts are Markdown and live under runtime/source-specific directories.
- TypeScript source in `src/**/*.cts` is the source of truth for many generated runtime modules.
- Installer logic is high-risk; prefer extracted source modules and focused tests rather than large direct installer rewrites.
- Generated or installed copies under `.agents/` and `.codex/` should not be treated as canonical source.

### Integration Points

- Namespace support likely belongs near command source discovery/staging and runtime artifact layout, not in each individual converter.
- Tests should exercise local install fixtures for Codex and Antigravity and verify GSD behavior is unchanged.

</code_context>

<specifics>
## Specific Ideas

- Treat NDD as direct user-facing commands, not hidden GSD subcommands.
- Build V1 as a pragmatic parallel namespace, but shape the abstraction so a future capability/plugin surface can register namespaces without another rewrite.
- Keep global install explicitly out of Phase 1 to reduce risk.

</specifics>

<deferred>
## Deferred Ideas

- Global NDD install support for Codex and Antigravity.
- Full capability/plugin registration for NDD namespace.
- Additional runtime support beyond Codex and Antigravity.

</deferred>

---

*Phase: 1-NDD Namespace Foundation*
*Context gathered: 2026-07-07*
