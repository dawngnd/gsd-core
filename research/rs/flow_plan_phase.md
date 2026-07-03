# Flow: `/gsd:plan-phase` — Chi tiết cách hoạt động

> Đây là bước **Plan** trong vòng lặp 5 bước của GSD: Discuss → **Plan** → Execute → Verify → Ship.
> Nhiệm vụ: tạo ra các file PLAN.md chứa hướng dẫn thực thi chi tiết cho mỗi phase.

---

## Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    /gsd:plan-phase N                         │
│              (commands/gsd/plan-phase.md)                    │
│          Thin shell: YAML frontmatter + delegation          │
└────────────────────────┬────────────────────────────────────┘
                         │ loads
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            workflows/plan-phase.md (90KB, 1616 lines)       │
│                   The actual orchestration                   │
│                                                             │
│   Spawns 3 subagents (NEVER runs their roles inline):       │
│                                                             │
│   ┌──────────────────┐  ┌───────────┐  ┌────────────────┐  │
│   │ gsd-phase-        │  │ gsd-      │  │ gsd-plan-      │  │
│   │ researcher        │  │ planner   │  │ checker        │  │
│   │                  │  │           │  │                │  │
│   │ Output:          │  │ Output:   │  │ Output:        │  │
│   │ RESEARCH.md      │  │ PLAN.md   │  │ PASSED /       │  │
│   │                  │  │ files     │  │ ISSUES FOUND   │  │
│   └──────────────────┘  └───────────┘  └────────────────┘  │
│                                                             │
│   + Optional: gsd-pattern-mapper → PATTERNS.md              │
└─────────────────────────────────────────────────────────────┘
```

**Nguyên tắc cốt lõi:** Orchestrator (workflow) **không bao giờ** thực hiện vai trò của researcher/planner/checker. Ba vai trò này PHẢI chạy trong context riêng biệt (subagent) để đảm bảo plan-checker gate có ý nghĩa (checker không bị bias bởi context của planner).

---

## Flow chi tiết từng bước

### Bước 0: Git Branch Invariant

**Không tạo, đổi tên, hoặc switch git branch** trong plan-phase. Branch identity do discuss-phase thiết lập và thuộc sở hữu git workflow của user.

### Bước 1: Initialize — Tải toàn bộ context

```
gsd_run query init.plan-phase "$PHASE" $GRAN_PARAM
```

Trả về JSON chứa mọi thứ orchestrator cần:

| Field | Ý nghĩa |
|-------|---------|
| `researcher_model` / `planner_model` / `checker_model` | Model AI cho từng agent |
| `research_enabled` / `plan_checker_enabled` | Bật/tắt research và verification |
| `phase_found` / `phase_dir` / `phase_number` / `phase_name` | Thông tin phase |
| `has_research` / `has_context` / `has_plans` / `plan_count` | Artifacts đã tồn tại |
| `state_path` / `roadmap_path` / `requirements_path` / ... | Đường dẫn files |
| `granularity` | `coarse` / `standard` / `fine` |
| `response_language` | Ngôn ngữ output |
| `nyquist_validation_enabled` | Bật/tắt Nyquist validation |

Đồng thời load agent skills cho cả 3 agents:
```bash
AGENT_SKILLS_RESEARCHER=$(gsd_run query agent-skills gsd-phase-researcher)
AGENT_SKILLS_PLANNER=$(gsd_run query agent-skills gsd-planner)
AGENT_SKILLS_CHECKER=$(gsd_run query agent-skills gsd-plan-checker)
```

### Bước 1.5: Closed-Phase Gate

Kiểm tra `phase_status` từ init JSON:
- **Phase `Complete`:** Hard-stop. Không cho replan.
  - `--reviews` trên phase đã đóng → **KHÔNG bao giờ override** (exit 1)
  - Replan bình thường → yêu cầu `--force` (exit 1 nếu thiếu)
  - `--force` → cho phép tiếp tục với WARNING banner
- **Phase `Executed` / `Needs Review`:** Cho phép replan bình thường

### Bước 2: Parse Arguments

Phân tích `$ARGUMENTS` để xác định chế độ hoạt động:

```
┌─────────────────────┬────────────────────────────────────────┐
│ Flag                │ Hiệu ứng                               │
├─────────────────────┼────────────────────────────────────────┤
│ (không có flag)     │ Auto-detect next unplanned phase       │
│ --research          │ Force re-research dù RESEARCH.md đã có│
│ --skip-research     │ Bỏ qua research, plan trực tiếp       │
│ --research-phase N  │ CHỈ research, KHÔNG plan               │
│ --view              │ In RESEARCH.md ra stdout, thoát        │
│ --gaps              │ Gap closure mode (đọc VERIFICATION.md) │
│ --skip-verify       │ Bỏ qua plan-checker verification loop │
│ --prd <file>        │ Express path: PRD → CONTEXT.md → plan  │
│ --ingest <path>     │ Express path: ADR → CONTEXT.md → plan  │
│ --reviews           │ Replan dựa trên REVIEWS.md feedback    │
│ --mvp               │ Vertical-slice planning mode           │
│ --tdd               │ TDD mode: type:tdd cho eligible tasks  │
│ --chunked           │ Chia planner thành outline + N per-plan│
│ --text              │ Plain-text menus (cho remote sessions)  │
│ --granularity       │ Override: coarse / standard / fine      │
│ --bounce            │ External refinement sau planning       │
│ --auto / --chain    │ Auto-advance sang execute-phase        │
│ --force             │ Override closed-phase gate              │
└─────────────────────┴────────────────────────────────────────┘
```

**MVP_MODE resolution** (cascade ưu tiên):
1. CLI flag `--mvp` → wins
2. ROADMAP.md `**Mode:** mvp` trên phase → second
3. `workflow.mvp_mode` config → third
4. `false` → default

**Walking Skeleton:** Khi `MVP_MODE=true` + `phase_number == "01"` + zero prior summaries → planner tạo thêm `SKELETON.md`.

### Bước 3: Validate Phase

```bash
PHASE_INFO=$(gsd_run query roadmap.get-phase "${PHASE}")
```

Xác nhận phase tồn tại trong ROADMAP.md. Nếu không tồn tại nhưng hợp lệ → tự tạo directory.

### Bước 3.5 / 3.6: Express Paths (bypass discuss-phase)

Hai đường tắt cho phép bỏ qua `/gsd:discuss-phase`:

**PRD Express (`--prd <file>`):**
- Đọc PRD file → tự sinh CONTEXT.md
- Mỗi requirement/story → locked decision
- Uncovered areas → "Claude's Discretion"
- Commit và bypass bước 4

**ADR Ingest Express (`--ingest <path>`):**
- Parse ADR files qua `adr-parser.cjs` (hỗ trợ: auto, nygard, madr, narrative)
- Status gate: reject superseded/rejected/deprecated
- Consequences → Success Criteria + Risk Summary
- Commit và bypass bước 4

> `--prd` và `--ingest` **loại trừ lẫn nhau** — không dùng cả hai.

### Bước 4: Load CONTEXT.md

Nếu CONTEXT.md **không tồn tại** (và không dùng express path):

```
┌─────────────────────────────────────────────┐
│   Không có CONTEXT.md cho Phase X.          │
│   Plans sẽ chỉ dùng research + requirements │
│                                             │
│   1. Continue without context               │
│   2. Run discuss-phase first ← recommended  │
└─────────────────────────────────────────────┘
```

Nếu user chọn "Run discuss-phase first" → **EXIT workflow** (không nested call — do #1009 bug với AskUserQuestion trong nested contexts).

### Bước 4.5: Resolve AI-SPEC

Tìm `*-AI-SPEC.md` trong phase directory. Nếu có → truyền cho planner. Nếu không → capability hook ở bước 5.6 xử lý.

### Bước 5: Handle Research ⭐

Đây là bước phức tạp nhất với nhiều nhánh logic:

```
                    ┌─── --gaps / --skip-research / --reviews?
                    │         YES → Skip research entirely
                    │
                    │    NO
                    ▼
              RESEARCH_ONLY mode?
              ┌─────┴─────┐
              │ YES        │ NO
              ▼            ▼
    ┌─────────────┐   has_research?
    │ --view?     │   ┌────┴────┐
    │ YES: print  │   │ YES     │ NO
    │   & exit    │   │ Use     │
    │             │   │ existing│
    │ --research? │   │ → §6   │
    │ YES: force  │   │         │
    │   re-spawn  │   │         │
    │             │   │         │
    │ neither?    │   │         │
    │ has_research│   │         │
    │ → auto-use  │   │         │
    │   & exit    │   │         │
    │ else: spawn │   │         │
    └─────────────┘   └─────────┘
                            │ NO
                            ▼
                   ┌──────────────────┐
                   │ Ask user:        │
                   │ 1. Research first│
                   │ 2. Skip research │
                   └──────────────────┘
                            │
                            ▼
               ┌─────────────────────────┐
               │ Spawn gsd-phase-        │
               │ researcher subagent     │
               │                         │
               │ Output: RESEARCH.md     │
               │ Return: RESEARCH        │
               │ COMPLETE or BLOCKED     │
               └─────────────────────────┘
```

**Researcher agent** được spawn thông qua capability hook system:
```
gsd_run loop render-hooks plan:pre --raw
→ Tìm research step hook
→ Dùng hook's fragment.inline làm prompt template
→ Agent(subagent_type=research_hook.ref.agent)
```

**ORCHESTRATOR RULE:** Sau khi spawn Agent, orchestrator **dừng hoàn toàn** — không đọc file, không edit code. Chờ subagent return.

### Bước 5.5: Nyquist Validation Strategy

Nếu `nyquist_validation_enabled=true` + research hoàn tất:
- Đọc "Validation Architecture" từ RESEARCH.md
- Tạo `VALIDATION.md` từ template
- Dùng cho Dimension 8 verification sau này

### Bước 5.55: Security Threat Model Gate

Capability-driven. Nếu security capability active:
- Đọc ASVS level và block threshold từ capability config
- Thông báo cho planner: mỗi PLAN.md phải có `<threat_model>` block

### Bước 5.6: Plan:Pre Capability Dispatch

Xử lý tất cả `plan:pre` hooks từ capability registry:

| Hook | Kind | Hành vi |
|------|------|---------|
| `research` | step | Đã xử lý ở §5.1 |
| `pattern-mapper` | step | Xử lý ở §7.8 |
| `ai-integration` | step | Spawn AI-SPEC nếu phase có AI keywords |
| `tdd` | contribution | Inject `<tdd_mode_active>` vào planner prompt |
| `security` | contribution | Inject threat-model guidance |
| `schema-gate` | contribution | Inject schema-push detection |
| `ui` | step/gate | UI-SPEC generation / blocking gate |
| `drift` | gate | Codebase map freshness (non-blocking) |

**UI Gate logic:**
```
frontend detected?
├── NO → skip
├── YES + UI-SPEC exists → use it
├── YES + --skip-ui → skip
├── YES + auto/pipeline → fire UI step hooks
└── YES + manual + gate blocking → BLOCK + EXIT
    "Run /gsd:ui-phase N first"
```

### Bước 6: Check Existing Plans

Nếu phase đã có `*-PLAN.md`:
- `--reviews` → skip prompt, straight to replan
- Không có `--reviews` → hỏi user: Add more / View existing / Replan

### Bước 7: Extract File Paths

Trích xuất tất cả paths từ init JSON:
- `STATE_PATH`, `ROADMAP_PATH`, `REQUIREMENTS_PATH`
- `RESEARCH_PATH`, `VERIFICATION_PATH`, `UAT_PATH`
- `CONTEXT_PATH`, `REVIEWS_PATH`, `PATTERNS_PATH`
- `SPEC_PATH` (phase SPEC, loại trừ AI-SPEC và UI-SPEC)
- Spike/Sketch findings từ project skills

### Bước 7.8: Pattern Mapper (Optional)

Nếu `pattern-mapper` capability active + CONTEXT.md/RESEARCH.md tồn tại:
- Spawn `gsd-pattern-mapper` agent
- Output: `PATTERNS.md` — analog files và code excerpts
- Non-blocking nếu thất bại

### Bước 7.9: API Surface Regeneration (intel)

Nếu `intel` capability active:
```bash
gsd_run intel api-surface
API_SURFACE_PATH=".planning/intel/API-SURFACE.md"
```

### Bước 8: Spawn gsd-planner ⭐⭐

Đây là core step — tạo PLAN.md files.

**Planner nhận prompt khổng lồ bao gồm:**

```xml
<planning_context>
  Phase: N
  Mode: standard | gap_closure | reviews

  <files_to_read>
    STATE.md, ROADMAP.md, REQUIREMENTS.md, CONTEXT.md,
    RESEARCH.md, PATTERNS.md, REVIEWS.md (nếu --reviews),
    VERIFICATION.md + UAT.md (nếu --gaps),
    AI-SPEC.md, UI-SPEC.md, SPEC.md,
    spike/sketch findings,
    API-SURFACE.md (HINT only)

    [Nếu model ≥ 500K context:]
    + 3 most recent prior CONTEXT.md + SUMMARY.md + LEARNINGS.md
    + Explicit dependency phases from ROADMAP "Depends on:" field
  </files_to_read>

  [Capability contributions: TDD, security, schema-gate injected here]

  MVP_MODE: true/false
  WALKING_SKELETON: true/false
  Granularity: coarse/standard/fine
</planning_context>

<downstream_consumer>
  Mỗi PLAN.md cần:
  - YAML frontmatter (wave, depends_on, files_modified, autonomous)
  - Tasks trong XML format với read_first + acceptance_criteria
  - must_haves cho goal-backward verification
  - SPEC edge coverage + prohibitions
  - "Artifacts this phase produces" section
</downstream_consumer>

<deep_work_rules>
  Anti-Shallow Execution Rules:
  - <read_first>: files executor PHẢI đọc trước
  - <acceptance_criteria>: verifiable, không subjective
  - <action>: concrete identifiers, không vague
</deep_work_rules>
```

**Hai chế độ spawn:**

| Chế độ | Khi nào | Cách hoạt động |
|--------|---------|----------------|
| **Standard** (default) | `CHUNKED_MODE=false` | 1 Agent call duy nhất, planner tạo tất cả PLAN.md |
| **Chunked** | `--chunked` hoặc config | Bước 8.5: Outline → N per-plan Agent calls, mỗi plan commit riêng |

**Chunked mode** (bước 8.5):
1. **8.5.1 Outline:** Spawn planner outline-only → tạo `PLAN-OUTLINE.md` (bảng: Plan ID, Objective, Wave, Depends On)
2. **8.5.2 Per-Plan:** Với mỗi plan trong outline → spawn planner single-plan → tạo 1 PLAN.md → commit ngay
3. **Resume safety:** Nếu crash, rerun tự skip plans đã commit

### Bước 9: Handle Planner Return

5 kịch bản return:

| Return marker | Hành vi |
|---------------|---------|
| `## PLANNING COMPLETE` | Hiển thị plan count → §10 (hoặc §13 nếu skip-verify) |
| `## PHASE SPLIT RECOMMENDED` | Phase quá lớn → hỏi user: Split / Proceed / Prioritize |
| `## ⚠ Source Audit: Unplanned Items` | Coverage gap → hỏi user: Add plan / Split / Defer |
| `## CHECKPOINT REACHED` | Pause cho user input, rồi spawn continuation |
| Empty/truncated/no marker | **Filesystem fallback (§9a):** Kiểm tra disk, nếu có plans → hỏi user accept/retry/stop |

### Bước 10-11: Plan Checker Verification Loop ⭐

```
                    ┌────────────────────┐
                    │ Spawn gsd-plan-    │
                    │ checker agent      │◄────────────┐
                    └────────┬───────────┘             │
                             │                         │
                    ┌────────▼───────────┐             │
                    │ VERIFICATION       │             │
                    │ PASSED?            │             │
                    ├────────────────────┤             │
                    │ YES → §13          │             │
                    │ NO  → §12          │             │
                    └────────┬───────────┘             │
                             │ (ISSUES FOUND)          │
                    ┌────────▼───────────┐             │
                    │ iteration < 3?     │             │
                    ├────────────────────┤             │
                    │ YES                │             │
                    │  Stall detected?   │             │
                    │  (issues ≥ prev)   │             │
                    │  YES → ask user    │             │
                    │  NO  → revise      │─────────────┘
                    │                    │  Spawn planner
                    │ NO (max reached)   │  in revision mode
                    │  → ask user:       │  then re-check
                    │    Force/Retry/    │
                    │    Abandon         │
                    └────────────────────┘
```

**Checker prompt** bao gồm:
- Tất cả PLAN.md files
- ROADMAP, REQUIREMENTS, CONTEXT, RESEARCH
- REVIEWS.md (nếu `--reviews` mode)
- Agent skills

**Checker trả về:**
- `## VERIFICATION PASSED` → proceed
- `## ISSUES FOUND` → structured YAML issues (BLOCKER + WARNING)

**Revision loop (max 3 iterations):**
- Planner được spawn lại trong `revision` mode
- Chỉ sửa targeted issues, KHÔNG replan from scratch
- **Stall detection:** Nếu issue count không giảm → hỏi user
- **Stall re-entry cap:** Tối đa 2 lần re-entry

**Thinking partner (optional):** Nếu `features.thinking_partner` enabled, checker issues có architectural keywords → hiển thị Option A vs Option B analysis cho user.

### Bước 12.5: Plan Bounce (Optional)

External refinement script chạy trên mỗi PLAN.md:
1. Backup → `*-PLAN.pre-bounce.md`
2. Chạy bounce script
3. Validate YAML frontmatter
4. Nếu fail → restore backup
5. Re-run plan-checker trên bounced plans
6. Nếu checker fail → restore backup
7. Commit surviving plans

### Bước 13: Coverage Gates (3 layers)

```
┌──────────────────────────────┐
│ 13. Requirements Coverage    │
│     REQ-IDs từ ROADMAP       │ ← Mỗi REQ-ID phải có trong ít nhất 1 plan
│     + CONTEXT.md features    │
├──────────────────────────────┤
│ 13a. Decision Coverage       │
│     D-IDs từ CONTEXT.md      │ ← Mỗi decision phải visible trong plans
│     <decisions> block        │    **BLOCKING gate** — exit 1 nếu fail
├──────────────────────────────┤
│ 13b. Record Completion       │
│     STATE.md update          │ ← Status → "Ready to execute"
├──────────────────────────────┤
│ 13c. ROADMAP Annotations     │
│     Wave dependencies        │ ← Annotate ROADMAP với wave headers
│     Cross-cutting constraints│
├──────────────────────────────┤
│ 13d. Commit Plans            │
│     (if commit_docs=true)    │ ← Git commit tất cả PLAN.md + STATE.md + ROADMAP.md
├──────────────────────────────┤
│ 13e. Post-Planning Gap       │
│     Analysis (plan:post gate)│ ← Non-blocking coverage report
└──────────────────────────────┘
```

**Decision Coverage Gate (§13a)** là gate quan trọng nhất:
- Đọc `<decisions>` từ CONTEXT.md
- So sánh với `must_haves` / `truths` trong plans
- **BLOCKING:** nếu một decision không visible → exit 1
- Lý do: "Catching that now beats discovering it after thousands of dollars of execution"

### Bước 14-15: Present Status & Auto-Advance

**Manual mode:** Hiển thị summary table + suggest `/gsd:execute-phase N`

**Auto mode** (`--auto` / `--chain` / config):
```
Plan complete → Auto-advance → Skill("gsd-execute-phase", "${PHASE} --auto --no-transition")
                                     │
                                     ├── PHASE COMPLETE → Summary + suggest next phase
                                     └── GAPS/FAIL → Stop chain, suggest manual review
```

---

## Data Flow tổng hợp

```
User
 │
 ▼
/gsd:plan-phase N
 │
 ├── gsd-tools query init.plan-phase N
 │   └── Returns: models, paths, flags, artifacts status
 │
 ├── Closed-phase gate
 │
 ├── Parse arguments → determine mode
 │
 ├── Load CONTEXT.md (or generate from PRD/ADR)
 │
 ├── Capability dispatch (plan:pre hooks)
 │   ├── research step hook → gsd-phase-researcher
 │   ├── pattern-mapper step hook → gsd-pattern-mapper
 │   ├── security contribution → threat model config
 │   ├── tdd contribution → type:tdd heuristics
 │   ├── ui step/gate → UI-SPEC generation/blocking
 │   └── drift gate → codebase freshness advisory
 │
 ├── gsd-phase-researcher → RESEARCH.md
 │
 ├── gsd-pattern-mapper → PATTERNS.md (optional)
 │
 ├── gsd-planner → PLAN.md files
 │   │   (standard: 1 call; chunked: outline + N calls)
 │   │
 │   ├── Input: STATE, ROADMAP, REQUIREMENTS, CONTEXT,
 │   │         RESEARCH, PATTERNS, REVIEWS, SPEC,
 │   │         AI-SPEC, UI-SPEC, spike/sketch findings,
 │   │         API-SURFACE, cross-phase context (1M models)
 │   │
 │   └── Output: N × PLAN.md with:
 │               - YAML frontmatter (wave, depends_on, files_modified)
 │               - XML tasks (<read_first>, <action>, <acceptance_criteria>)
 │               - must_haves, threat_model, "Artifacts this phase produces"
 │
 ├── gsd-plan-checker → PASSED / ISSUES FOUND
 │   └── Revision loop (max 3 iterations, stall detection)
 │
 ├── Plan bounce (optional external refinement)
 │
 ├── Coverage gates:
 │   ├── Requirements coverage (REQ-IDs)
 │   ├── Decision coverage (D-IDs) ← BLOCKING
 │   └── Post-planning gap analysis (capability gate)
 │
 ├── STATE.md update → "Ready to execute"
 ├── ROADMAP.md annotations (wave deps, cross-cutting)
 ├── Git commit (if commit_docs=true)
 │
 └── Route:
     ├── Manual → "Run /gsd:execute-phase N"
     └── Auto → Skill("gsd-execute-phase", "N --auto")
```

---

## Artifacts được tạo/sửa

| Artifact | Tạo bởi | Mục đích |
|----------|---------|----------|
| `RESEARCH.md` | gsd-phase-researcher | Domain research cho planning |
| `PATTERNS.md` | gsd-pattern-mapper | Existing code patterns |
| `VALIDATION.md` | Orchestrator (template) | Nyquist validation strategy |
| `PLAN-OUTLINE.md` | gsd-planner (chunked) | Outline manifest |
| `*-PLAN.md` (N files) | gsd-planner | Execution plans |
| `STATE.md` | gsd-tools state | Status → "Ready to execute" |
| `ROADMAP.md` | gsd-tools roadmap | Wave annotations |
| `CONTEXT.md` | PRD/ADR express path | Phase context (if generated) |
| `SKELETON.md` | gsd-planner (MVP+Phase 1) | Walking Skeleton |

---

## Điểm đặc biệt đáng chú ý

1. **Agent isolation là bắt buộc:** Researcher, planner, checker PHẢI chạy trong subagent riêng. Không bao giờ collapse inline — dù runtime có vẻ không hỗ trợ Agent tool.

2. **Capability-driven dispatch:** Research, pattern mapping, security, TDD, UI, drift đều được điều khiển qua capability hooks — không hardcode.

3. **Chunked mode cho crash resilience:** Mỗi plan commit riêng. Crash → rerun → resume từ plan cuối.

4. **Decision coverage gate blocks:** Đây là gate duy nhất **BLOCKING** (exit 1). Mọi decision từ discuss-phase phải visible trong plans.

5. **Context enrichment cho 1M models:** Models ≥500K context nhận thêm 3 prior phase contexts + explicit dependency phases.

6. **Filesystem fallback pattern:** Nếu Agent return empty/truncated (Windows stdio hang), check disk cho artifacts → hỏi user accept/retry.

7. **Stall detection trong revision loop:** Nếu issue count không giảm → hỏi user thay vì loop vô tận. Cap ở 2 re-entries.
