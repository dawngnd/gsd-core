---
name: ndd-verify-work
description: "Verify completed NDD work against CHANGE-SPEC acceptance criteria."
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
---

<objective>
Verify NDD work against the approved NDD change contract.

NDD verify-work adapts GSD verify-work to treat `CHANGE-SPEC.md` acceptance criteria as the primary user-facing contract while preserving GSD verification artifacts.
</objective>

<execution_context>
@.agents/gsd-core/workflows/verify-work.md
@gsd-core/workflows/verify-work.md
@.planning/ndd/changes/
</execution_context>

<process>

## 1. Parse arguments

Parse `$ARGUMENTS` as `<change-id-or-phase>`.
Extract `INPUT_ID` (the first positional token).
If `INPUT_ID` is missing, stop with usage message:
```text
Usage: ndd-verify-work <change-id-or-phase>
```

## 2. Invoke NDD verification check

Run the helper check:
```bash
gsd-tools ndd verify <INPUT_ID>
```

This checks if canonical GSD verification is `passed` and if `CHANGE-SPEC.md` has acceptance criteria.

If the command exits with `gsd_verification_not_passed`, GSD verification is missing or failed. Direct the user to run canonical `/gsd-verify-work <phase_id>` or `gsd-verify-work <phase_id>` before proceeding.

If the command exits with `missing_acceptance_criteria`, the change has no approved acceptance criteria. Tell the user to run `ndd-discuss-phase` first.

## 3. Handle overrides

If the JSON output has `requires_override: true`, some acceptance criteria lack evidence in GSD artifacts. For each criterion requiring override:
1. Ask the user via `AskUserQuestion` to confirm they want to override the criterion.
2. Prompt the user for an override reason and confirming person name.
3. Re-run the verify tool with the override details:
   ```bash
   gsd-tools ndd verify <INPUT_ID> --override-criterion "<CRITERION_TEXT>" --override-reason "<REASON>" --override-person "<PERSON>"
   ```

Repeat until `gate_passed` is true.

## 4. Report verification outcome

Once NDD verification succeeds, report:
- Verification successfully complete.
- Path to NDD verification evidence: `.planning/ndd/changes/<change-id>/VERIFICATION.md`.
- STATUS.json verified state has been recorded.

Do not copy or inline verifier internals. The canonical workflow is `.agents/gsd-core/workflows/verify-work.md` (packaged source: `gsd-core/workflows/verify-work.md`).

</process>

<success_criteria>
- Missing or empty acceptance criteria section blocks verification and directs user to `ndd-discuss-phase`.
- Canonical GSD verification status `passed` is a hard gate.
- Successful verification writes `.planning/ndd/changes/<change-id>/VERIFICATION.md`.
- Successful verification updates only the NDD change `STATUS.json` (verified: true, verified_at, etc.).
- Does not define a separate verifier engine and does not write core GSD state.
</success_criteria>
