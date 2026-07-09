# Phase 7: Verification, Ship, and Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 7-Verification, Ship, and Hardening
**Areas discussed:** Verification grounding, Ship enrichment, Lifecycle tests and hardening

---

## Verification Grounding

| Option | Description | Selected |
|--------|-------------|----------|
| Acceptance criteria as primary contract | Use `CHANGE-SPEC.md ## Acceptance Criteria` as the mandatory checklist and require GSD evidence for each criterion. | yes |
| Whole CHANGE-SPEC.md | Use goals, scope, resolved decisions, constraints, and acceptance criteria as verification inputs. | |
| GSD first, spec comparison after | Run canonical GSD verify first, then compare against the spec. | |

**User's choice:** Acceptance criteria as the primary contract.
**Notes:** Missing or empty acceptance criteria must block and route back to `ndd-discuss-phase`.

| Option | Description | Selected |
|--------|-------------|----------|
| Store evidence in NDD change folder | Create/update NDD verification output mapping criteria to GSD evidence. | yes |
| Only phase-local GSD artifacts | Rely only on `phase-link.md` to find GSD verification artifacts. | |
| Both, NDD as light index | Keep GSD report primary and NDD output as a lightweight index. | |

**User's choice:** Store evidence in the NDD change folder.
**Notes:** Prefer `.planning/ndd/changes/<change-id>/VERIFICATION.md`.

| Option | Description | Selected |
|--------|-------------|----------|
| Fail closed | Treat missing evidence mapping as failed NDD verification. | |
| Warning but pass | Record a warning but allow pass if GSD verification passed. | |
| Ask user override | Ask the user to confirm missing evidence mappings and record the override. | yes |

**User's choice:** Ask user override.
**Notes:** Overrides must record reason, confirming user/person, and timestamp.

| Option | Description | Selected |
|--------|-------------|----------|
| Light `STATUS.json` update | Record verified status/path/timestamp without changing GSD state. | yes |
| No status update | Only write NDD verification artifact. | |
| Update `STATUS.json` and `phase-link.md` | Store more traceability metadata in both artifacts. | |

**User's choice:** Light `STATUS.json` update.
**Notes:** Do not overload `phase-link.md`.

| Option | Description | Selected |
|--------|-------------|----------|
| Only canonical GSD `passed` | Only map acceptance criteria when GSD verification passed. | yes |
| `passed` or `human_needed` | Allow mapping when only human UAT remains. | |
| Any status with an artifact | Generate a report even when gaps remain. | |

**User's choice:** Only canonical GSD verification `passed`.
**Notes:** Other statuses block NDD verification.

---

## Ship Enrichment

| Option | Description | Selected |
|--------|-------------|----------|
| NDD verified plus GSD verification passed | Gate ship on both NDD contract verification and canonical GSD verification. | yes |
| NDD verified only | Trust NDD verification because it maps to GSD evidence. | |
| GSD verification passed only | Keep ship closest to GSD and use NDD only for context. | |

**User's choice:** Gate on both NDD verified and GSD verification passed.
**Notes:** This keeps NDD contract verification explicit.

| Option | Description | Selected |
|--------|-------------|----------|
| Spec, impact, verification summary | Include concise links/summaries from NDD spec, impact, NDD verification, and GSD evidence. | yes |
| Full artifact excerpts | Embed larger excerpts from source docs and artifacts. | |
| Links only | Add artifact links without summaries. | |

**User's choice:** Spec, impact, and verification summary.
**Notes:** Keep PR/review context useful but compact.

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-ship context artifact | Create a lightweight artifact that canonical GSD ship can consume. | yes |
| Patch PR body after GSD ship | Edit the PR body after canonical ship creates it. | |
| Temporary `ship.pr_body_sections` config | Use config extension temporarily. | |

**User's choice:** Pre-ship context artifact.
**Notes:** Avoid forking ship core or relying on post-PR patching.

| Option | Description | Selected |
|--------|-------------|----------|
| Light `STATUS.json` update after success | Record shipped state and PR metadata after successful ship. | yes |
| Rely only on GSD STATE.md | Do not write NDD ship status. | |
| Write only to human-readable artifact | Store ship result outside machine-readable status. | |

**User's choice:** Light `STATUS.json` update after successful ship.
**Notes:** Fields may include `shipped`, `pr_url`, `pr_number`, and `shipped_at`.

| Option | Description | Selected |
|--------|-------------|----------|
| Leave NDD state unchanged on blocker | Report the ship blocker without changing NDD state. | |
| Set `ship_blocked` on blocker | Record blocker details in `STATUS.json`. | |
| Ask user which state behavior to use | Present update/no-update options when canonical ship blocks. | yes |

**User's choice:** Ask user which state behavior to use.
**Notes:** `ndd-ship` must not automatically mutate state for environmental or preflight blockers.

---

## Lifecycle Tests and Hardening

| Option | Description | Selected |
|--------|-------------|----------|
| Router/workflow contract plus artifact generation | Cover verify/ship router behavior, generated artifacts, status updates, and command adapter content. | yes |
| End-to-end synthetic lifecycle | Simulate intake through ship handoff. | |
| Unit tests only | Test helper/router logic without lifecycle artifact coverage. | |

**User's choice:** Router/workflow contract plus artifact generation.
**Notes:** Avoid brittle full lifecycle tests while covering the core Phase 7 surfaces.

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated TS helper module | Put deterministic parsing/writing/gating in TypeScript; keep Markdown commands as orchestration. | yes |
| Inline in router | Keep logic in `src/ndd-command-router.cts`. | |
| Mostly in command Markdown | Implement primarily in prompts. | |

**User's choice:** Dedicated or deliberately extended TypeScript helper module.
**Notes:** This keeps filesystem and status logic testable.

| Option | Description | Selected |
|--------|-------------|----------|
| Do not create real PRs in tests | Test ship context/gates and assert workflow delegation only. | yes |
| Mock `gh` command | Exercise more of the ship flow with a fake CLI. | |
| Optional integration when `gh` exists | Keep PR creation tests outside the main CI gate. | |

**User's choice:** Do not create real PRs in tests.
**Notes:** Avoid GitHub or `gh` dependencies in CI.

| Option | Description | Selected |
|--------|-------------|----------|
| Command reference plus lifecycle notes | Document full NDD flow, artifacts, gates, and NDD/GSD responsibility boundary. | yes |
| Command files only | Rely on command Markdown as documentation. | |
| Full end-to-end tutorial | Add a larger user tutorial. | |

**User's choice:** Command reference plus lifecycle notes.
**Notes:** The docs should explicitly describe `ndd-change -> ndd-impact -> ndd-discuss-phase -> ndd-plan-phase -> ndd-execute-phase -> ndd-verify-work -> ndd-ship`.

---

## Agent's Discretion

- Exact helper/module names.
- Exact NDD verification artifact section layout.
- Exact pre-ship context artifact filename and placement.
- Exact `STATUS.json` field names.
- Exact test file organization.

## Deferred Ideas

None.
