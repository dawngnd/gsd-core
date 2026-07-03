# Foundation Scan — GSD Core

> **PR1: First-pass analysis from documentation only.**
> Sources: [README.md](file:///home/dangnd/code/github/gsd-core/README.md), all files under [docs/explanation/](file:///home/dangnd/code/github/gsd-core/docs/explanation)

---

## 1. Project Identity

- **What is gsd-core?** A lightweight meta-prompting, context-engineering, and spec-driven development framework that drives AI coding agents through a disciplined phase loop.
- **What problem does it solve?** **Context rot** — "the quality degradation that accumulates as an AI fills its context window" — where early instructions, constraints, and architecture decisions get diluted as the conversation grows, causing the model to silently produce lower-quality output.
- **Who is the target user/developer?** Developers using AI coding agents (Claude Code, Codex, Gemini CLI, Kimi CLI, Kilo, Copilot, Cursor, Windsurf, and more) who work on tasks complex enough that context rot is a real risk — multi-file features, cross-cutting refactors, and work spanning hours or sessions.

---

## 2. Core Concepts & Terminology

| Term | Author's Definition / Usage |
|---|---|
| **Context rot** | "the quality degradation that accumulates as an AI fills its context window" — the model keeps answering but quality "quietly degrades", contradicting earlier decisions, drifting style, hallucinating file names. Described as "a fundamental property of how transformer attention works over long sequences." |
| **Fresh-context subagent** | A specialised agent that "starts with a clean, carefully scoped context window" (typically 200K tokens) and "reports its result back to a thin orchestrator." The core structural solution to context rot. |
| **Phase** | "one unit of work within a milestone" — moves through the loop: Discuss → Plan → Execute → Verify → Ship. Has a goal, a set of requirements, and a set of plans. |
| **Milestone** | "a version cycle — a meaningful, releasable increment of the project." Has a name, version number, and requirements. Complete when all its phases are shipped. |
| **Phase loop** | The repeating cycle: `Discuss → (UI design) → Plan → Execute → Verify → Ship`. "Each step exists because it guards against a specific class of failure that the previous step alone cannot prevent." |
| **Spec-driven development** | "every phase produces structured artefacts before execution begins" — CONTEXT.md, RESEARCH.md, PLAN.md — so executors work from "a precise specification… not a re-interpretation of a long conversation." |
| **Meta-prompting** | "the agent definitions themselves are carefully engineered prompts, not ad-hoc instructions." The files in `workflows/` and `agents/` "encode hard-won knowledge about how to scope tasks, what to verify, and when to escalate." |
| **Orchestrator** | The thin main session that "never touches source files. It spawns agents, collects their results, updates shared state, and routes to the next step." |
| **Wave-based execution** | Parallel execution model where plans are grouped into dependency waves. Plans with no dependencies form Wave 1 (parallel); dependent plans wait for earlier waves. |
| **Capability** | An extensibility unit (first-party or third-party) that can ship skills, agents, hooks, MCP servers, and command modules. Composed at runtime via an overlay model. |
| **Artifact parity** | "a third-party capability may ship the same executable surfaces that GSD Core ships." Design choice: full parity for what can be shipped, but not symmetric trust. |
| **Capability overlay** | Third-party capabilities composed at runtime on top of the frozen first-party registry via `loadRegistry`. "An installed capability is not a second-class citizen." |
| **Context engineering** | The broader discipline: "what an AI agent gets in its context window matters as much as the model tier or prompt quality." Operationalised through context isolation and context hygiene. |
| **`.planning/`** | The file-system directory that carries all durable state — STATE.md, CONTEXT.md, PLAN.md, RESEARCH.md, config.json. "Knowledge survives context resets." |
| **`STATE.md`** | "the spine of this system" — records project position, active decisions, blockers, and progress metrics. Every workflow reads it to orient and writes back to it. |

---

## 3. Architecture Overview

- **Orchestrator → Agent pattern**: A thin orchestrator (workflow `.md` file) loads context via `gsd-tools.cjs init`, resolves the model via `gsd-tools.cjs resolve-model`, spawns specialised agents, collects results, and updates state via `gsd-tools.cjs state update`. The orchestrator "does not reason about the domain, does not write code, and does not interpret results beyond routing."
- **Agent categories**: Researchers (4 parallel), Synthesisers, Planners, Checkers (up to 3 revision iterations), Executors (parallel within waves), Verifiers, Mappers (4 parallel sub-probes), and Auditors. Each agent gets a fresh context window and only the tool permissions it needs.
- **Data flow**: The pipeline is `research → plan → execute → verify`, with all intermediate artefacts stored as Markdown/JSON in `.planning/`. Agents read artefacts from prior steps and write artefacts for later steps.
- **Wave-based parallelism**: Plans are grouped by dependencies into waves. Executors in the same wave run in parallel on non-overlapping concerns. Atomic `STATE.md` locking and per-wave hook runs prevent write conflicts.
- **Capability registry**: First-party capabilities are frozen at release time into `capability-registry.cjs`. Third-party capabilities compose at runtime via `loadRegistry({ includeInstalled: true })`. One canonical `buildRegistry` function materialises both.

---

## 4. Design Decisions

- **Fresh-context subagents over in-context work**: "most of the work in a coding session does not need to happen in the main context at all." Heavy work runs in agents that start clean; the orchestrator stays lean. This is "not a workaround for context rot. It is a structural solution."
- **File-system as shared state over conversation memory**: "Context engineering requires that knowledge survive context resets. GSD Core uses the file system for this." All meaningful output goes to `.planning/` as human-readable Markdown/JSON. "Agents do not rely on memory; they rely on the file."
- **Full artifact parity for third-party capabilities, no sandbox**: The maintainer chose full parity (third-party can ship hooks, MCP servers, command modules) over declarative-only. "Full artifact parity and meaningful sandboxing are in tension. The maintainer chose full parity." Trade-off: "there is no sandbox, and this document says so directly."
- **Decentralised URL import over centralised registry**: Rejected Obsidian-style centralised review model. "Requiring a maintainer-review PR for every third-party capability is the bottleneck." URL/git/npm/tarball import ships without a curated registry. A curated registry remains an open question.
- **Install never runs code**: "downloading and staging this capability will not execute any of its code." Copy-only staging. No `postinstall`-equivalent. This makes the consent step meaningful.
- **First-party always wins in overlay composition**: "When a third-party overlay collides with a first-party capability, the overlay is rejected — never the other way round." An overlay can only add, never override.
- **Gates fail closed, steps fail open**: A broken overlay's steps/contributions are skipped (fail-open). But a broken gate "blocks the loop" with a synthetic blocking gate (fail-closed), because "failing to load a gate means you must not proceed."
- **Advisory-only prompt injection detection by default**: Detection is "logged but not blocked" — "a deliberate choice that preserves workflow continuity at the cost of not hard-stopping on a detection." Opt-in blocking available via `security.injection_blocking`.
- **Auto-update off by default**: Re-consent required when executable surfaces change. Directly addresses VS Code stolen-PAT scenario.

---

## 5. Stated Design Principles

- **"Context engineering: what an AI agent gets in its context window matters as much as the model tier or prompt quality."** — The foundational principle.
- **"The orchestrator never touches source files."** — Strict separation: orchestrator routes, agents do heavy work.
- **"Fresh context ensures each agent reasons clearly. Spec-driven artefacts ensure each agent reasons about the right thing. Meta-prompting ensures each agent knows how to reason about it well."** — The three complementary disciplines.
- **"Defence in depth. No single control is assumed to be perfect."** — Security organising principle.
- **"Artifact parity is not trust parity."** — Central thesis of the trust model: third-party capabilities get full artifact parity but not symmetric trust.
- **"When in doubt, split."** — Phase scoping principle. "A smaller phase completes faster, verifies more confidently, and makes it easier to course-correct."
- **"The loop is a rhythm, not a constraint."** — Each step prevents failures that are "genuinely expensive to fix later."
- **"Skip, don't crash."** — Composition principle: "a bad overlay is skipped with a warning; the loop always gets a usable registry."
- **"Install never runs code, full stop."** — Staging is copy-only; no `postinstall`-equivalent.
- **Honesty about trade-offs**: Multiple documents explicitly call out what the system does *not* protect against — "GSD does not pretend this is the same as not running the code at all."

---

## 6. Open Questions

- **How does `gsd-tools.cjs` actually work internally?** The documentation references it as the CLI tool for context loading (`init`), model resolution (`resolve-model`), and state management (`state update`, `state patch`, `state advance-plan`), but its implementation, API surface, and error handling are not explained — documentation only describes its role in the orchestration pattern.
- **What is the concrete format/schema of the JSON context payload?** The docs say `gsd-tools.cjs init` produces "a compact JSON context payload (project summary, phase goal, relevant config)" but the actual fields, structure, and token-budget calculations are not documented in the explanation docs.
- **How does `dynamic_routing` work in practice?** Mentioned as a cost-saving feature that "starts every agent on a cheaper tier and escalates only on a soft failure" — but the escalation criteria, what constitutes a "soft failure", and the fallback chain are not explained in the explanation docs.
- **What are the 12 loop extension points?** Referenced as defined in "ADR-857" — the capability trust model and overlay model discuss gates, steps, and contributions registering into extension points, but the actual extension point taxonomy is not enumerated in the explanation documents.
- **How does the `gsd-codebase-mapper` agent work?** Listed as having "4 parallel sub-probes" in the agent roster, but its purpose, what it maps, and how its output is consumed are not described in the explanation docs.
- **What is the structure of `ROADMAP.md` and `REQUIREMENTS.md`?** The phase loop doc references `ROADMAP.md` for phase goals and the verification section mentions "REQ-IDs", but the format and lifecycle of these artefacts are not described in the explanation docs.
- **How does the consent store (`consent.json`) interact with team workflows?** The trust model describes it as user-owned and machine-local, but the implications for teams sharing a project repo (different team members having different consent states, onboarding new members) are not addressed.

---

> **✅ Success criteria check:**
> - ✅ Every section is populated — no "❌ Not found" markers needed
> - ✅ No source code was referenced — documentation only
> - ✅ Core concepts include direct quotes from the author
> - ✅ Open Questions section identifies 7 gaps
