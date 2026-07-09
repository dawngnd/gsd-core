---
name: ndd:ship
description: Ship a verified NDD change using GSD ship mechanics.
argument-hint: "<change-id-or-phase>"
effort: high
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
requires: []
---
<objective>
Prepare a verified NDD change for review and merge.

NDD ship enriches GSD ship context with NDD `CHANGE-SPEC.md`, `IMPACT.md`, and verification evidence. It does not replace the GSD ship workflow.
</objective>

<execution_context>
@.agents/gsd-core/workflows/ship.md
@gsd-core/workflows/ship.md
@.planning/ndd/changes/
</execution_context>

<process>

## 1. Parse arguments

Parse `$ARGUMENTS` as `<change-id-or-phase>`.
Extract `INPUT_ID` (the first positional token).
If `INPUT_ID` is missing, stop with usage message:
```text
Usage: ndd-ship <change-id-or-phase>
```

## 2. Hard pre-ship gate check

Run:
```bash
gsd-tools ndd ship <INPUT_ID>
```

This is a hard gate. If this command exits non-zero, stop the workflow.
The command verifies that the NDD change is verified (`STATUS.json.verified === true`), that `VERIFICATION.md` exists, and that canonical GSD verification is `passed`.

On success, the helper writes `.planning/ndd/changes/<change-id>/SHIP-CONTEXT.md` containing concise summaries of the change spec, impact, and verification.

Parse the output for:
- `change_id`
- `phase_id`
- `ship_context_path`

## 3. Delegate to canonical GSD ship

Invoke canonical GSD ship:
```bash
gsd-ship <phase_id>
```
If using slash commands in the current runtime, invoke:
```text
/gsd-ship <phase_id>
```

Note: Tests must not create a real PR or call remote git operations; GSD ship is the sole mechanism responsible for PR creation.

## 4. Handle GSD ship completion

### Case A: Canonical GSD ship succeeded
If GSD ship successfully created the PR, collect any available PR URL and PR number from the output or ask the user.
Then, run the post-success helper to mark the change as shipped:
```bash
gsd-tools ndd ship-shipped <INPUT_ID> [--pr-url <url>] [--pr-number <number>]
```
If PR metadata is unavailable, invoke:
```bash
gsd-tools ndd ship-shipped <INPUT_ID>
```
This ensures `shipped: true` and `shipped_at` are recorded in `STATUS.json`.

Do not patch the PR body or description after canonical GSD ship.

### Case B: Canonical GSD ship was blocked/failed
If GSD ship failed or was blocked (e.g., due to a dirty worktree, missing remote, missing `gh` CLI, non-passing verification, or other blockers):
Ask the user via `AskUserQuestion` whether they want to:
- Leave NDD status unchanged.
- Record `ship_blocked` status with details of the blocker:
  ```bash
  gsd-tools ndd ship-blocked <INPUT_ID> "<BLOCKER_DETAILS>"
  ```

</process>

<success_criteria>
- Gates on both NDD verified status and canonical GSD verification passed.
- Generates `.planning/ndd/changes/<change-id>/SHIP-CONTEXT.md` before GSD ship.
- Delegates actual PR/review creation to canonical GSD ship; does not define independent PR mechanics.
- Post-success helper `gsd-tools ndd ship-shipped` is called to record `shipped: true`, `shipped_at`, and optional PR metadata.
- Blocker handling is explicit and user-selected.
</success_criteria>
