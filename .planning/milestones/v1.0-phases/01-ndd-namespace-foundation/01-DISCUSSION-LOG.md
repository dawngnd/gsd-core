# Phase 1: NDD Namespace Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 1-NDD Namespace Foundation
**Areas discussed:** Namespace Surface, Install Contract, Reuse Boundary

---

## Namespace Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel top-level namespace | Add NDD as a direct command/skill namespace separate from GSD. | ✓ |
| Capability/plugin surface | Register NDD as a capability/plugin that emits commands when enabled. | |
| Generated wrapper surface | Generate NDD wrappers from a separate registry/template source. | |

**User's choice:** V1 should use a parallel top-level namespace, designed so it can later move toward capability/plugin registration.
**Notes:** Canonical source should be `commands/ndd/*.md`. `skills/ndd-*` should be generated from command source where possible.

---

## Install Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Codex + Antigravity local only | Prove local NDD skill output for Codex and Antigravity first. | ✓ |
| Codex + Antigravity local and global | Support local and global NDD install in Phase 1. | |
| All runtimes | Extend non-GSD namespace support across all supported runtimes immediately. | |

**User's choice:** Start with local install only for Codex and Antigravity, including Antigravity CLI as a design target.
**Notes:** Global install can be developed later. Existing GSD behavior must remain unchanged.

---

## Reuse Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Thin wrappers/adapters | Reference GSD workflows/templates and use `gsd-tools`, but do not copy full GSD workflows. | ✓ |
| Fast copy/fork | Copy GSD workflows into NDD and customize them directly. | |
| Fully independent NDD engine | Build independent NDD planner/executor/verifier mechanics. | |

**User's choice:** Use thin wrappers/adapters.
**Notes:** NDD may reference GSD workflow/reference/template files, call `gsd-tools.cjs`, and generate bridge artifacts. NDD must not fork full GSD core workflows.

---

## the agent's Discretion

- Planner may choose exact module names for namespace abstraction.
- Planner may decide whether initial NDD source discovery is implemented in install profiles, runtime artifact layout, or a small shared helper, provided decisions in `01-CONTEXT.md` are preserved.

## Deferred Ideas

- Global NDD install support.
- Capability/plugin registration for NDD.
- Additional runtime support beyond Codex and Antigravity.
