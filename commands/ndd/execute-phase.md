---
name: ndd:execute-phase
description: Execute a planned NDD change through GSD execution mechanics.
argument-hint: "<change-id-or-phase> [--wave N] [--gaps-only]"
effort: max
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - TodoWrite
requires: []
---
<objective>
Bridge NDD phase-link metadata into canonical GSD execute-phase without copying executor internals. NDD owns the execution gate and change-id resolution. GSD owns wave-based plan execution, subagent coordination, summaries, and verification.
</objective>

<execution_context>
@.agents/gsd-core/workflows/execute-phase.md
@gsd-core/workflows/execute-phase.md
@.agents/gsd-core/references/agent-contracts.md
@.planning/ndd/changes/
</execution_context>

<process>

## 1. Parse arguments

Parse `$ARGUMENTS` as `<change-id-or-phase> [--wave N] [--gaps-only]`.
Extract:
- `INPUT_ID` (the first positional token)
- `WAVE_FLAG` (the value after `--wave` if supplied)
- `GAPS_ONLY_FLAG` (boolean indicating if `--gaps-only` is set)

If `INPUT_ID` is missing, stop with usage message:
```text
Usage: ndd-execute-phase <change-id-or-phase> [--wave N] [--gaps-only]
```

## 2. Gate and resolve the NDD change

Run:
```bash
gsd-tools ndd execute <INPUT_ID>
```

This is a hard gate. If the command exits non-zero, stop execution. Common blocking cases:
- `phase-link.md` is missing (run `ndd-plan-phase` first).
- No plan files exist in the target GSD phase directory.
- No NDD change was found linked to the supplied phase-id.
- Multiple NDD changes are linked to the same phase-id.

On success, parse the returned JSON for the following fields:
- `change_id`
- `phase_id`
- `phase_dir`
- `plan_files`
- `phase_link_path`
- `gate_passed`

## 3. Invoke canonical GSD execute-phase

Build the execution command using the resolved `phase_id`:
```bash
gsd-execute-phase <phase_id>
```
Append `--wave <N>` if `WAVE_FLAG` was supplied.
Append `--gaps-only` if `GAPS_ONLY_FLAG` is true.

If the runtime uses slash commands, invoke:
```text
/gsd-execute-phase <phase_id> [--wave N] [--gaps-only]
```
If direct command invocation is unavailable in the current runtime, instruct the user to run the canonical command exactly.

Do not copy or inline executor internals here. The canonical workflow is `.agents/gsd-core/workflows/execute-phase.md` (packaged source: `gsd-core/workflows/execute-phase.md`) and remains authoritative for wave grouping, subagent spawning, plan execution, summary writing, and verification.

## 4. Report execution result

After the GSD execute-phase completes, report:
- The NDD change ID.
- The concrete GSD phase ID.
- The traceability path from change-id → `phase-link.md` → phase-dir → `SUMMARY.md`/`VERIFICATION.md`.

Note that the GSD executor is responsible for writing `SUMMARY.md` and `VERIFICATION.md` inside the phase directory. NDD does not perform post-execution metadata writes and does not update `STATUS.json` or `phase-link.md` after execution.

</process>

<success_criteria>
- Missing or invalid phase-link.md stops before execution.
- A concrete GSD phase id with existing plan files is required before delegation.
- `gsd-execute-phase <phase-id>` with `--wave` and `--gaps-only` passthrough is the only execution path.
- GSD executor writes SUMMARY.md and VERIFICATION.md in the phase directory.
- No parallel NDD executor core is introduced.
- NDD does not update STATUS.json or phase-link.md after execution.
</success_criteria>
