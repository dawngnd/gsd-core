---
name: ndd-plan-phase
description: "Plan an approved NDD change through GSD planning mechanics."
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
---

<objective>
Bridge an approved NDD change into canonical GSD plan-phase without copying planner internals.

NDD owns the approved-change gate, target phase handoff, bridge context, and phase-link traceability. GSD owns research, planning, source-grounding, plan-check, validation, and plan file production.
</objective>

<execution_context>
@.agents/gsd-core/workflows/plan-phase.md
@gsd-core/workflows/plan-phase.md
@.agents/gsd-core/references/agent-contracts.md
@.planning/ndd/changes/
</execution_context>

<process>

## 1. Parse arguments

Read command arguments as:

```text
ndd-plan-phase <change-id> [target-phase]
```

If `<change-id>` is missing, stop with:

```text
Usage: ndd-plan-phase <change-id> [target-phase]
```

`[target-phase]` is a normal GSD phase id such as `05`, `06`, or a custom phase token supported by GSD phase lookup.

## 2. Gate and prepare the NDD bridge

Run:

```bash
gsd-tools ndd plan <change-id> [target-phase]
```

This is a hard gate. If the command exits non-zero, stop before any planning work. Common blocking cases:

- `STATUS.json` or `CHANGE-SPEC.md` is not approved.
- `DISC-05` critical ambiguity checks still find unresolved critical ambiguity.
- Required NDD artifacts are missing: `CHANGE-SPEC.md`, `IMPACT.md`, or NDD `CONTEXT.md` cannot be read/backfilled.
- A supplied `[target-phase]` does not exist under `.planning/phases/`.

On success, parse the returned JSON. Preserve these fields for later steps:

- `changeId`
- `sourceArtifacts.status`
- `sourceArtifacts.changeSpec`
- `sourceArtifacts.impact`
- `sourceArtifacts.context`
- `targetPhase`
- `workflowNextStep`

## 3. Resolve or create the target GSD phase

If `[target-phase]` was supplied:

1. Require `targetPhase.mode == "resolved"`.
2. Require `targetPhase.phase_dir` to exist under `.planning/phases/`.
3. Require ROADMAP.md to contain the phase by running the normal GSD phase lookup used by canonical planning.
4. Continue with that phase id.

If `[target-phase]` was omitted:

1. Use the JSON proposal from `targetPhase`:
   - `title`
   - `slug`
   - `goal`
2. Create a normal GSD phase entry using existing GSD phase/roadmap mechanics. Do not write ROADMAP.md by hand when a GSD phase command/helper is available.
3. The phase goal must be derived from the approved `CHANGE-SPEC.md` scope and acceptance criteria, using the proposed `goal` as the default.
4. After the phase exists, capture its concrete phase id as `<target-phase>`.
5. Re-run:

```bash
gsd-tools ndd plan <change-id> <target-phase>
```

This confirms the new phase can be resolved before canonical planning starts.

## 4. Write phase-local NDD bridge context

Run:

```bash
gsd-tools ndd plan-context <change-id> <target-phase>
```

This writes deterministic planner input into the target phase directory, normally:

```text
.planning/phases/<target-phase>-*/NDD-BRIDGE-CONTEXT.md
```

The bridge context must cite:

- `.planning/ndd/changes/<change-id>/STATUS.json`
- `.planning/ndd/changes/<change-id>/CHANGE-SPEC.md`
- `.planning/ndd/changes/<change-id>/IMPACT.md`
- `.planning/ndd/changes/<change-id>/CONTEXT.md`

If this command exits non-zero, stop. Do not invoke GSD planning without phase-local NDD context.

## 5. Invoke canonical GSD plan-phase

Invoke canonical planning for the target phase:

```bash
gsd-plan-phase <target-phase>
```

If the runtime uses slash commands, invoke:

```text
/gsd-plan-phase <target-phase>
```

If direct command invocation is unavailable in the current runtime, instruct the user to run the canonical command exactly and stop with the target phase id and bridge context path.

Do not copy or inline planner internals here. The canonical workflow is `.agents/gsd-core/workflows/plan-phase.md` (packaged source: `gsd-core/workflows/plan-phase.md`) and remains authoritative for:

- researcher/planner/checker agent role separation
- planner source audit and source-grounding
- plan-check revision loop
- requirement traceability
- frontmatter validation
- plan structure validation
- source-grounded tasks, acceptance criteria, and verification commands

The target phase's planner context list must include the generated `NDD-BRIDGE-CONTEXT.md` alongside the normal phase context, ROADMAP, REQUIREMENTS, and codebase sources. The NDD bridge is additional context, not a replacement for GSD planning inputs.

## 6. Verify produced plan files

After canonical `gsd-plan-phase <target-phase>` completes, list produced plans:

```bash
ls .planning/phases/<target-phase>-*/*-PLAN.md
```

If no `*-PLAN.md` files exist, stop and report that canonical planning did not produce plans.

Do not relax GSD plan-check/source-grounding conventions. If canonical plan-phase reports checker issues, source-grounding gaps, missing frontmatter, missing requirements, or invalid plan structure, follow the canonical revision loop before linking.

## 7. Record NDD phase-link metadata

Call the router link command with the exact produced plan files:

```bash
gsd-tools ndd plan-link <change-id> <target-phase> <plan-files...>
```

Use paths returned by the phase plan listing. The command records:

- change id
- concrete GSD phase id
- target phase directory
- exact produced `*-PLAN.md` files
- link timestamp

The link is written to:

```text
.planning/ndd/changes/<change-id>/phase-link.md
```

If link recording fails, stop and report the error. Planning is not traceable until `phase-link.md` exists.

</process>

<success_criteria>
- Unapproved or critically ambiguous NDD changes stop before canonical planning.
- A concrete GSD target phase is supplied or created through existing GSD phase/roadmap mechanics.
- `gsd-tools ndd plan-context <change-id> <target-phase>` writes phase-local `NDD-BRIDGE-CONTEXT.md`.
- Canonical `gsd-plan-phase <target-phase>` remains the only planner path.
- GSD source-grounding, plan-check, requirement traceability, frontmatter validation, and plan structure validation stay active.
- `gsd-tools ndd plan-link <change-id> <target-phase> <plan-files...>` records `phase-link.md` after plan creation.
</success_criteria>
