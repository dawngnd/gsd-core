# NDD Brownfield Change Workflow

The NDD workflow is an opinionated orchestration layer that adapts GSD's core engine to project-specific brownfield maintenance work: adding features, modifying existing behavior, fixing business flows, and implementing scoped change requests from imperfect documentation.

It is built as a thin layer over GSD Core, reusing GSD's planning, execution, verification, and ship mechanics.

## Lifecycle Flow

The complete NDD lifecycle consists of the following steps:

```
ndd-change → ndd-impact → ndd-discuss-phase → ndd-plan-phase → ndd-execute-phase → ndd-verify-work → ndd-ship
```

1. **Intake (`ndd-change`)**: Ingests folders of Markdown documents to generate draft spec and status files in a stable change folder.
2. **Impact Discovery (`ndd-impact`)**: Maps affected files, risk metrics, and unknowns.
3. **Discussion (`ndd-discuss-phase`)**: Gathers design feedback and resolves ambiguities to approve `CHANGE-SPEC.md`.
4. **Planning Bridge (`ndd-plan-phase`)**: Transforms approved NDD artifacts into GSD phase planning context.
5. **Execution Bridge (`ndd-execute-phase`)**: Resolves links and executes plan waves via canonical GSD execution.
6. **Verification (`ndd-verify-work`)**: Validates criteria against `CHANGE-SPEC.md` acceptance criteria using GSD verification evidence.
7. **Ship (`ndd-ship`)**: Gates on verification, generates ship context, and delegates PR creation to GSD ship.

## Artifact Layout

All NDD workspace data is located under `.planning/ndd/changes/<change-id>/`:

- `STATUS.json`: Machine-readable change status (metadata, phase, warnings, verified/shipped flags).
- `SOURCE-MANIFEST.md`: Source document manifest and role inference log.
- `CHANGE-SPEC.md`: Product spec, scope boundary, and acceptance criteria checklist.
- `IMPACT.md`: Confirmed/likely affected files, confidence analysis, and risk factors.
- `CONTEXT.md`: Implementation decisions and conversation provenance.
- `phase-link.md`: Backlink link mapping the change to a concrete GSD phase and its plan files.
- `VERIFICATION.md`: Acceptance criteria mapping and evidence check details.
- `SHIP-CONTEXT.md`: Concise PR/review enrichment context.

## Reusing GSD Core

NDD commands are thin adapters that perform gates, path resolution, and context preparation. They delegate heavy lifting (like subagent wave execution, UAT interaction, and PR creation) to GSD Core to prevent code duplication and feature drift.
