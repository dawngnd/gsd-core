# Giải Thích Chi Tiết Luồng `/gsd:execute-phase`

> Tài liệu này trace toàn bộ luồng thực thi từ khi user gõ lệnh đến khi phase hoàn thành,
> đi qua **4 lớp kiến trúc** và **22 bước xử lý**.

---

## Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Lớp 1: Command — Điểm vào](#2-lớp-1-command--điểm-vào)
3. [Lớp 2: Workflow — Bộ não điều phối](#3-lớp-2-workflow--bộ-não-điều-phối)
4. [Lớp 3: Agent — Đơn vị thực thi](#4-lớp-3-agent--đơn-vị-thực-thi)
5. [Lớp 4: CLI Tools — Hạ tầng runtime](#5-lớp-4-cli-tools--hạ-tầng-runtime)
6. [Cơ Chế Locking](#6-cơ-chế-locking)
7. [Cơ Chế Wave (Kahn's Algorithm)](#7-cơ-chế-wave-kahns-algorithm)
8. [Cơ Chế Worktree Isolation](#8-cơ-chế-worktree-isolation)
9. [State Transition Engine](#9-state-transition-engine)
10. [Sơ Đồ Data Flow Tổng Thể](#10-sơ-đồ-data-flow-tổng-thể)

---

## 1. Tổng Quan Kiến Trúc

Khi user gõ `/gsd:execute-phase 3`, request đi qua **4 lớp**:

```
┌─────────────────────────────────────────────────────────┐
│  LỚP 1: COMMAND (commands/gsd/execute-phase.md)         │
│  → Markdown file + YAML frontmatter                     │
│  → Khai báo: tên lệnh, tools được phép, effort level   │
│  → Không chứa logic — chỉ trỏ đến workflow             │
├─────────────────────────────────────────────────────────┤
│  LỚP 2: WORKFLOW (gsd-core/workflows/execute-phase.md)  │
│  → 93KB, 1708 dòng — BỘ NÃO ĐIỀU PHỐI                 │
│  → 22 bước xử lý tuần tự                               │
│  → Spawn subagent, gọi CLI tools, quản lý wave         │
├─────────────────────────────────────────────────────────┤
│  LỚP 3: AGENT (agents/gsd-executor.md, gsd-verifier.md) │
│  → Prompt chuyên biệt cho từng vai trò                  │
│  → Fresh context 200K tokens mỗi agent                   │
│  → Thực thi plan, tạo commit, viết SUMMARY.md           │
├─────────────────────────────────────────────────────────┤
│  LỚP 4: CLI TOOLS (gsd-core/bin/gsd-tools.cjs)          │
│  → Command Routing Hub dispatch                          │
│  → State transition engine (pure function)               │
│  → File locking, phase lookup, config loader             │
└─────────────────────────────────────────────────────────┘
```

**Nguyên tắc cốt lõi:** Orchestrator (workflow) **KHÔNG BAO GIỜ tự thực thi code**. Nó chỉ điều phối — spawn agent, gọi CLI, đọc kết quả. Mỗi executor agent nhận context hoàn toàn mới (fresh 200K tokens), tránh "context rot" (suy giảm chất lượng khi context window đầy).

---

## 2. Lớp 1: Command — Điểm Vào

**File:** [execute-phase.md](file:///home/dangnd/code/github/gsd-core/commands/gsd/execute-phase.md)

Đây là file Markdown 66 dòng với YAML frontmatter:

```yaml
name: gsd:execute-phase
effort: max                    # AI dùng mức reasoning cao nhất
allowed-tools:                 # Chỉ những tool này được phép
  - Read, Write, Edit, Glob, Grep, Bash
  - Agent                      # ← Quan trọng: được phép spawn subagent
  - TodoWrite, AskUserQuestion
requires: [phase, verify-work] # Phụ thuộc vào 2 command khác
```

**Cơ chế hoạt động:**

1. AI runtime (Claude Code, Gemini CLI, v.v.) **tự động phát hiện** command qua plugin manifest (`.claude-plugin/plugin.json` hoặc `gemini-extension.json`)
2. Khi user gõ `/gsd:execute-phase 3`, runtime đọc file này
3. File trỏ đến workflow: `@~/.claude/gsd-core/workflows/execute-phase.md`
4. Runtime tải workflow và bắt đầu thực thi theo hướng dẫn trong đó
5. `effort: max` yêu cầu runtime dùng reasoning cao nhất (extended thinking)
6. `allowed-tools` giới hạn những tool AI được sử dụng — đây là **access control**

**Tại sao thiết kế này?** Command là "vỏ mỏng" (thin shell) — nó chỉ khai báo metadata. Logic nằm trong workflow. Điều này cho phép:
- Cùng một workflow được gọi từ nhiều nơi (command, MCP, auto-advance chain)
- Thay đổi logic mà không thay đổi interface
- Kiểm soát tool access tại điểm vào

---

## 3. Lớp 2: Workflow — Bộ Não Điều Phối

**File:** [execute-phase.md](file:///home/dangnd/code/github/gsd-core/gsd-core/workflows/execute-phase.md) (93KB, 1708 dòng)

Đây là file lớn nhất trong hệ thống — chứa toàn bộ logic điều phối. Nó có **22 bước** chạy tuần tự:

### Bước 1: `parse_args` — Phân tích tham số

```
Input:  $ARGUMENTS = "3 --wave 2 --gaps-only"
Output: PHASE_ARG=3, WAVE_FILTER=2, GAPS_ONLY=true
```

- Tách token đầu tiên → số phase
- `--wave N` → chỉ chạy wave N (bỏ qua các wave khác)
- `--gaps-only` → chỉ chạy plan sửa lỗi (gap closure)
- `--interactive` → chạy tuần tự, có checkpoint hỏi user
- `--cross-ai` → delegate sang AI runtime khác (Codex, Gemini, v.v.)

> [!IMPORTANT]
> Flag là **explicit-only** — nếu `--wave` không xuất hiện trong `$ARGUMENTS`, hệ thống KHÔNG BAO GIỜ tự suy ra rằng cần filter wave. Điều này ngăn AI "hallucinate" flag.

---

### Bước 2: `initialize` — Khởi tạo toàn bộ ngữ cảnh

Đây là bước phức tạp nhất — gọi **12+ lệnh CLI** để thu thập mọi thông tin cần thiết:

```bash
# 1. Khởi tạo phase metadata
INIT=$(gsd_run query init.execute-phase "${PHASE_ARG}")
# → Trả về JSON: executor_model, verifier_model, parallelization,
#   branching_strategy, phase_dir, plans[], incomplete_plans[], ...

# 2. Lấy runtime type
RUNTIME=$(gsd_run query config-get runtime --default claude --raw)

# 3. Kiểm tra worktree config
USE_WORKTREES=$(gsd_run query config-get workflow.use_worktrees --raw)

# 4. Lấy context window size
CONTEXT_WINDOW=$(gsd_run query config-get context_window)

# 5. Quét worktree orphan từ session trước
gsd_run query worktree.reap-orphans

# 6. Kiểm tra HEAD có diverged không
gsd_run query worktree.base-check --pick shouldDegrade

# 7. Render capability hooks
EXECUTE_POST_HOOKS_JSON=$(gsd_run loop render-hooks execute:post --raw)

# 8. Kiểm tra MVP/TDD mode
MVP_MODE=$(gsd_run query phase.mvp-mode "${PHASE_NUMBER}")
TDD_MODE=$(gsd_run loop render-hooks execute:post --active-cap tdd)
```

**Cơ chế safety check:**
- Nếu `runtime != claude` VÀ `use_worktrees != false` → **FATAL EXIT** (worktree chỉ hoạt động trên Claude Code)
- Nếu HEAD đã diverge từ worktree base → **auto-downgrade** sang sequential execution
- Nếu `.planning/` tồn tại nhưng STATE.md không → offer reconstruct

**Adaptive context enrichment** — dựa trên kích thước context window:
- **≥ 500K tokens** (model 1M+): Agent nhận context phong phú hơn — prior SUMMARY.md, CONTEXT.md, RESEARCH.md
- **< 200K tokens**: Prompt gọn hơn ~40%, load ví dụ on-demand thay vì inline

---

### Bước 3: `safe_resume_gate` — Ngăn làm lại việc đã xong

**Vấn đề:** Session trước bị crash — agent đã commit code nhưng chưa viết SUMMARY.md. Nếu chạy lại, sẽ làm lại từ đầu.

**Cơ chế:**
```bash
# Tìm commit của plan hiện tại
PLAN_COMMITS=$(git log --oneline --grep="${CURRENT_PLAN_ID}" -30)

# Kiểm tra SUMMARY.md có tồn tại không
SUMMARY_PATH="{phase_dir}/{plan_padded}-SUMMARY.md"
```

Nếu commit tồn tại NHƯNG SUMMARY.md không → **DỪNG**, hỏi user:
1. **Close out manually** — kiểm tra commit, viết SUMMARY.md, cập nhật STATE
2. **Re-execute from scratch** — revert commit cũ, chạy lại
3. **Mark-and-skip** — đánh dấu bất thường, bỏ qua

> [!NOTE]
> Đây là cơ chế **idempotent resumption** — chạy lại `execute-phase` bao nhiêu lần cũng an toàn vì nó kiểm tra SUMMARY.md trước khi thực thi mỗi plan.

---

### Bước 4: `check_blocking_antipatterns` — Kiểm tra anti-pattern

Đọc file `.continue-here.md` trong thư mục phase. Nếu có anti-pattern với `severity = blocking`:

Agent **BẮT BUỘC** trả lời 3 câu hỏi cho mỗi anti-pattern:
1. Anti-pattern này là gì?
2. Nó biểu hiện như thế nào?
3. Cơ chế nào ngăn nó tái phát?

**Không thể bỏ qua bước này.** Đây là "structural learning" — buộc agent chứng minh đã hiểu bài học từ lần thất bại trước.

---

### Bước 5: `check_interactive_mode` — Chế độ tương tác

Nếu `--interactive`:
- Chạy từng plan một (không spawn subagent)
- Sau mỗi task: dừng lại hỏi user
- User có thể: Execute / Review first / Skip / Stop
- Tốn ít token hơn, bắt lỗi sớm hơn

---

### Bước 6: `handle_branching` — Tạo nhánh Git

```bash
DEFAULT_BRANCH=$(gsd_run query git.base-branch ...)
```

Tuỳ `branching_strategy` trong config:
- `"none"` → bỏ qua, ở lại nhánh hiện tại
- `"phase"` → tạo nhánh `phase-3-setup`
- `"milestone"` → tạo nhánh `milestone-1`

> [!WARNING]
> Nhánh fork từ `origin/HEAD` — **KHÔNG PHẢI** current HEAD. Fix cho bug #2916 nơi nhánh cũ chồng lên nhánh mới (branch compounding).

---

### Bước 7: `validate_phase` — Cập nhật STATE.md

```bash
gsd_run query state.begin-phase --phase "3" --name "core-api" --plans "5"
```

Gọi state transition engine (chi tiết ở [Section 9](#9-state-transition-engine)):
- `Status: In Progress`
- `Current Phase: 3`
- `Current Phase Name: core-api`
- `Current Plan: 1`
- `Total Plans: 5`
- `Last Activity: Phase start`

---

### Bước 8: `discover_and_group_plans` — Phân nhóm plan thành wave

```bash
PLAN_INDEX=$(gsd_run query phase-plan-index "3")
```

**Đây là bước then chốt** — gọi [cmdPhasePlanIndex()](file:///home/dangnd/code/github/gsd-core/src/phase.cts) để:

1. **Scan thư mục phase** → tìm tất cả file `*-PLAN.md`
2. **Parse frontmatter** từng plan → trích `wave`, `depends_on`, `autonomous`, `files_modified`
3. **Chạy Kahn's algorithm** → phân plan vào wave theo dependency DAG
4. **Trả về JSON:**

```json
{
  "phase": "03",
  "plans": [
    { "id": "03-01", "wave": 1, "depends_on": [], "autonomous": true,
      "files_modified": ["src/api.ts"], "task_count": 4, "has_summary": false },
    { "id": "03-02", "wave": 1, "depends_on": [], "autonomous": true,
      "files_modified": ["src/db.ts"], "task_count": 3, "has_summary": false },
    { "id": "03-03", "wave": 2, "depends_on": ["03-01", "03-02"], "autonomous": true,
      "files_modified": ["src/routes.ts"], "task_count": 5, "has_summary": false }
  ],
  "waves": { "1": ["03-01", "03-02"], "2": ["03-03"] },
  "incomplete": ["03-01", "03-02", "03-03"]
}
```

Chi tiết thuật toán Kahn → [Section 7](#7-cơ-chế-wave-kahns-algorithm).

**Filtering:**
- Plan có `has_summary: true` → bỏ qua (đã hoàn thành)
- `--gaps-only` → chỉ giữ plan sửa lỗi
- `--wave N` → chỉ giữ plan trong wave N

**Wave safety:** Nếu `--wave 2` nhưng wave 1 có plan chưa xong → **TỪCHỐI** (không cho nhảy qua prerequisite).

---

### Bước 9: `cross_ai_delegation` — Delegate sang AI khác (tuỳ chọn)

Nếu kích hoạt (`--cross-ai` hoặc config `workflow.cross_ai_execution`):

```bash
# Prompt KHÔNG BAO GIỜ qua shell interpolation (chống injection)
echo "$TASK_PROMPT" | timeout "${CROSS_AI_TIMEOUT}s" ${CROSS_AI_CMD} > "$CANDIDATE_SUMMARY"
```

Plan chạy thành công qua cross-AI → xoá khỏi danh sách execute_waves, chuyển sang plan tiếp.

---

### Bước 10: `execute_waves` — VÒNG LẶP CHÍNH (600+ dòng)

Đây là phần phức tạp nhất. Xử lý tuần tự qua từng wave:

```
Wave 1: [Plan 03-01, Plan 03-02]  ← song song (parallel)
         ↓ merge worktrees
         ↓ post-merge test gate
         ↓ update tracking
Wave 2: [Plan 03-03]              ← chạy sau wave 1
         ↓ merge
         ↓ test gate
         ↓ update tracking
```

#### Sub-step 10.1: CWD-drift guard

```bash
ORCHESTRATOR_WT=$(git rev-parse --show-toplevel)
ORCH_BRANCH=$(git rev-parse --abbrev-ref HEAD)
# Nếu đang trong worktree-agent-* branch → FATAL
```

Ngăn orchestrator bị "kéo" vào worktree của agent (bug #48).

#### Sub-step 10.2: Checkpoint heartbeats (#2410)

```
[checkpoint] phase 3 wave 1/2 starting, 2 plan(s), 0/3 plans done
[checkpoint] phase 3 wave 1/2 plan 03-01 starting (0/3 plans done)
```

**Vấn đề:** Khi context lớn (~200K+ cache_read), Claude API SSE layer timeout vì không có output giữa tool_result và assistant turn tiếp theo.

**Giải pháp:** Emit text ngắn (không có tool call) tại mỗi ranh giới wave/plan. Text bắt đầu bằng `[checkpoint]` để tooling và `/gsd:manager` có thể grep.

#### Sub-step 10.3: File overlap detection

```
Trước khi spawn agent, quét files_modified của mọi plan trong wave:

Plan 03-01 modifies: [src/api.ts, src/utils.ts]
Plan 03-02 modifies: [src/db.ts, src/utils.ts]
                                   ↑ OVERLAP!

→ Cảnh báo: "Intra-wave files_modified overlap detected"
→ Override PARALLELIZATION=false CHO WAVE NÀY (chạy tuần tự)
```

#### Sub-step 10.4: Per-plan worktree decision

Mỗi plan kiểm tra `files_modified` có giao với `SUBMODULE_PATHS` không:
- Nếu có → `USE_WORKTREES_FOR_PLAN=false` (plan này chạy inline, không dùng worktree)
- Nếu không → dùng worktree bình thường

#### Sub-step 10.5: Spawn executor agents

**Worktree mode (mặc định trên Claude Code):**

```bash
# Capture trạng thái trước khi spawn
EXPECTED_BASE=$(git rev-parse HEAD)
EXPECTED_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Tạo manifest theo dõi worktree
WAVE_WORKTREE_MANIFEST=$(mktemp "gsd-worktree-wave-XXXXXX.json")
echo '{"orchestrator_root":"'$ORCHESTRATOR_WT'","worktrees":[]}' > "$WAVE_WORKTREE_MANIFEST"
```

**QUAN TRỌNG:** Agent được dispatch **TỪNG CÁI MỘT** với `run_in_background: true`:

```
Agent(
  subagent_type="gsd-executor",
  isolation="worktree",          ← Claude Code tạo git worktree tự động
  model="claude-opus-4-20250918",
  prompt="<objective>...</objective>
    <execution_context>
      @~/.claude/gsd-core/workflows/execute-plan.md
      @~/.claude/gsd-core/templates/summary.md
    </execution_context>
    <files_to_read>
      - .planning/phases/03-setup/03-01-PLAN.md
      - .planning/PROJECT.md
      - .planning/STATE.md
      - CLAUDE.md
    </files_to_read>"
)
```

**Tại sao dispatch từng cái?** Để tránh `.git/config.lock` contention — nếu 3 agent cùng gọi `git worktree add` đồng thời, chúng sẽ tranh nhau lock file.

Sau khi mỗi agent trả về, ghi metadata vào manifest:
```bash
gsd_run query worktree.record-agent --manifest "$WAVE_WORKTREE_MANIFEST" \
  --agent-id "exec-03-01" --path "/tmp/worktree-abc123" \
  --branch "worktree-agent-03-01" --base "$EXPECTED_BASE"
```

**Sequential mode** (runtime khác hoặc worktree disabled):
- Bỏ `isolation="worktree"` khỏi Agent() call
- Agent cập nhật STATE.md và ROADMAP.md trực tiếp (worktree agent thì KHÔNG được làm điều này)

#### Sub-step 10.6: Stall detection

```bash
# Mỗi EXECUTOR_STALL_INTERVAL_MINUTES (mặc định 5 phút):
#   - Kiểm tra SUMMARY.md đã xuất hiện chưa
#   - Kiểm tra commit mới trên expected branch
#   - Nếu im lặng > EXECUTOR_STALL_THRESHOLD_MINUTES (mặc định 10 phút):
#     → Hỏi: Continue waiting / Kill & retry / Kill & switch to inline
```

#### Sub-step 10.7: Worktree merge & cleanup

Chi tiết → [Section 8](#8-cơ-chế-worktree-isolation)

```bash
gsd_run query worktree.cleanup-wave --manifest "$WAVE_WORKTREE_MANIFEST"
```

1. Pin CWD về orchestrator worktree (chống drift)
2. Validate branch identity + expected base
3. Merge worktree branches vào nhánh chính
4. Remove worktree directories + temp branches
5. `git worktree prune` (metadata cleanup)

#### Sub-step 10.8: Post-merge test gate

```bash
# Auto-detect build command: config → Makefile → Cargo → npm
timeout 300 $BUILD_CMD     # 5 phút timeout
timeout 300 $TEST_CMD      # 5 phút timeout
```

- Exit 0 → pass, cập nhật tracking
- Exit 124 (timeout) → non-blocking, plan vẫn "in progress"
- Non-zero → increment `WAVE_FAILURE_COUNT`, hỏi user "Fix now" / "Continue"

**Tại sao chạy test SAU merge?** Từng agent chạy test trong worktree riêng — nhưng khi merge lại, có thể xảy ra conflict (ví dụ: Plan A và Plan B cùng thêm route vào router, merge thành công nhưng logic bị duplicate).

#### Sub-step 10.9: Post-wave capability hooks

```bash
WAVE_POST_HOOKS_JSON=$(gsd_run loop render-hooks execute:wave:post --raw)
```

Capability hooks (ví dụ: UI safety gate, TDD review) được render từ registry:
- `kind: "gate"` + `block: true` → **HALT** execution
- `kind: "gate"` + `block: false` → advisory warning
- `kind: "step"` → chạy thêm action (ví dụ: remap codebase)

#### Sub-step 10.10: Failure classification

```bash
CLASS_JSON=$(gsd_run query agent.classify-failure -- "$AGENT_RETURN_BODY")
CLASS=$(echo "$CLASS_JSON" | jq -r '.class')
```

3 loại failure:
| Class | Xử lý |
|---|---|
| `quota-exceeded` | KHÔNG retry ngay. Spot-check SUMMARY.md trước. Options: đợi reset / đổi runtime / abort |
| `classify-handoff-bug` | Bug Claude runtime. Spot-check → nếu SUMMARY.md có → coi như thành công |
| `unknown-failure` | Report, hỏi Continue/Stop |

---

### Bước 11–22: Post-Execution Pipeline

| Bước | Tên | Cơ chế |
|---|---|---|
| 11 | `checkpoint_handling` | Plan có `autonomous: false` → dừng lại hỏi user. Auto-mode có thể auto-approve |
| 12 | `aggregate_results` | Tổng hợp bảng kết quả + kiểm tra security gate |
| 13 | `handle_partial_wave` | Nếu `--wave` → kiểm tra còn plan chưa xong không, KHÔNG verify nếu còn |
| 14 | `code_review_gate` | Gọi code-review capability nếu active. Advisory only, không block |
| 15 | `close_parent_artifacts` | Decimal phase (4.1) → cập nhật UAT gaps của parent phase (4) |
| 16 | `regression_gate` | Chạy test từ VERIFICATION.md của phase trước → bắt regression |
| 17 | `verify_phase_goal` | Spawn `gsd-verifier` agent → tạo VERIFICATION.md |
| 18 | `update_roadmap` | `cmdPhaseComplete()` → transactional write: ROADMAP ✓, STATE advance, REQUIREMENTS trace |
| 19 | `auto_copy_learnings` | Copy LEARNINGS.md → `~/.gsd/knowledge/` (opt-in) |
| 20 | `close_phase_todos` | Auto-close todos với `resolves_phase: current` |
| 21 | `update_project_md` | Evolve PROJECT.md → ngăn drift (#956) |
| 22 | `offer_next` | Route đến action tiếp theo hoặc auto-advance chain |

---

## 4. Lớp 3: Agent — Đơn Vị Thực Thi

### gsd-executor (43KB prompt)

**File:** [gsd-executor.md](file:///home/dangnd/code/github/gsd-core/agents/gsd-executor.md)

Executor là agent chuyên thực thi PLAN.md. Mỗi executor:
- Nhận **context hoàn toàn mới** (fresh 200K tokens)
- Chạy trong **git worktree riêng** (isolated branch)
- **KHÔNG được** sửa STATE.md hay ROADMAP.md (orchestrator làm việc này)

**Flow bên trong executor:**

```
1. load_project_state    → Bootstrap gsd-tools, đọc STATE.md
2. load_plan             → Parse PLAN.md: objective, tasks, files_modified
3. record_start_time     → Ghi timestamp UTC
4. worktree_metadata     → Capture worktree path/branch nếu có
5. determine_pattern     → A (auto) / B (has checkpoint) / C (continuation)
6. execute_tasks:
   FOR EACH task:
     → Kiểm tra TDD flag
     → Thực thi code changes
     → Apply deviations nếu cần (3 rules)
     → Chạy verification
     → git commit (per-task)
     → Track completion
7. create SUMMARY.md     → Viết kết quả
8. git commit SUMMARY.md → BẮT BUỘC commit trước khi thoát
```

**3 Deviation Rules** (agent tự quyết, không hỏi user):
1. **Auto-fix bugs:** broken behavior, errors, type errors, null pointers
2. **Auto-add critical functionality:** error handling, validation, auth, CSRF, rate limiting
3. **Auto-fix blocking issues:** wrong types, broken imports — TRỪKHI cần install package mới

> [!CAUTION]
> SUMMARY.md phải được **Write → commit → narration** theo đúng thứ tự. Nếu bị truncate giữa Write và commit, worktree bị force-removed → SUMMARY.md mất vĩnh viễn (bug #2070).

### gsd-verifier (49KB prompt)

**File:** [gsd-verifier.md](file:///home/dangnd/code/github/gsd-core/agents/gsd-verifier.md)

Verifier kiểm tra **mục tiêu phase** (không phải task completion):
- Giả định ban đầu: "tasks completed, goal missed"
- Đi ngược từ outcome → truths → artifacts → wiring

**Phân loại findings:**
| Status | Ý nghĩa |
|---|---|
| ✓ VERIFIED | Artifact tồn tại, test chạy pass |
| ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Artifact có, nhưng chưa có test |
| ✗ FAILED | Artifact thiếu, stub, hoặc chưa wired |
| ? UNCERTAIN | Cần human verification |

---

## 5. Lớp 4: CLI Tools — Hạ Tầng Runtime

**File:** [gsd-tools.cjs](file:///home/dangnd/code/github/gsd-core/gsd-core/bin/gsd-tools.cjs) (148KB)

Tất cả `gsd_run query ...` calls từ workflow đều đi qua **Command Routing Hub**:

```
gsd_run query state.begin-phase --phase 3 --name "core-api" --plans 5
  ↓
Command Routing Hub: dispatch({ family: "state", subcommand: "begin-phase", args: [...] })
  ↓
CJS Registry lookup: registry["state"]["begin-phase"] → handler function
  ↓
Handler: cmdStateBeginPhase(cwd, "3", "core-api", 5, false)
  ↓
State Transition Engine: transitionCore(content, {kind:'beginPhase',...}, deps)
  ↓
Write STATE.md (lock-protected)
```

**Hub contract — KHÔNG BAO GIỜ throw:**

```typescript
type HubResult =
  | { ok: true, data: unknown }                              // Thành công
  | { ok: false, kind: 'UnknownCommand', command: string }   // Lệnh không tồn tại
  | { ok: false, kind: 'InvalidArgs', arg, reason }          // Tham số sai
  | { ok: false, kind: 'HandlerRefusal', reason }            // Handler từ chối
  | { ok: false, kind: 'HandlerFailure', message, cause? }   // Handler lỗi runtime
```

Mọi exception bên trong handler đều bị catch và wrap thành `HandlerFailure`. Kể cả throw non-Error (ví dụ: `throw "oops"`) cũng được wrap:
```typescript
catch (err) {
  const wrapper = new Error('non-Error thrown: ' + String(err));
  wrapper.thrown = err;
  return makeHandlerFailure(wrapper.message, wrapper);
}
```

---

## 6. Cơ Chế Locking

**File:** [planning-workspace.cts](file:///home/dangnd/code/github/gsd-core/src/planning-workspace.cts)

GSD có 2 lock riêng biệt:

| Lock | File | Scope | Dùng khi |
|---|---|---|---|
| Planning Lock | `.planning/.lock` | Workspace-wide | Tạo/xoá phase, cập nhật ROADMAP |
| State Lock | `.planning/STATE.md.lock` | STATE.md only | Mọi mutation vào STATE.md |

### Cơ chế O_EXCL Lock

```typescript
// Tạo lock file: ATOMIC — nếu file đã tồn tại → throw EEXIST
fs.writeFileSync(lockPath, JSON.stringify({
  pid: process.pid,
  cwd: process.cwd(),
  acquired: new Date().toISOString()
}), { flag: 'wx' })  // wx = O_CREAT | O_EXCL | O_WRONLY
```

`O_EXCL` đảm bảo **chỉ 1 process** tạo được file. Mọi process khác nhận `EEXIST` error.

### Steal Protocol (khi lock bị kẹt)

```
WHILE (chưa hết 10s budget):
  TRY acquireLock()
  CATCH EEXIST:
    1. Đọc lock body → lấy PID
    2. Kiểm tra PID còn sống: process.kill(pid, 0)
       - ESRCH (process dead)    → stealable = true
       - EPERM (alive, diff user) → stealable = false (sống thật)
       - Success (alive)          → stealable = false (sống thật)
    
    3. NẾU PID sống NHƯNG lock > 60 giây (deadman ceiling):
       → stealable = true   // Chống false-alive do PID reuse
    
    4. NẾU stealable:
       a. IDENTITY RE-CONFIRM (chống race condition):
          - Re-stat lock file: so sánh (dev, ino) — same inode?
          - Re-read lock body: so sánh content — same content?
          - Nếu khác → racer khác đã steal, back off
       
       b. ATOMIC STEAL via rename:
          rename(".lock", ".lock.stale-{pid}-{timestamp}-{seq}")
          - CHỈ 1 RACER thắng rename
          - Racer thua → back off, retry
       
       c. Xoá file stale, retry acquire
    
    5. NẾU KHÔNG stealable:
       sleep(100ms), thử lại

TIMEOUT (10s) → throw Error("lock held by live process")
```

**Tại sao phức tạp thế?**

| Vấn đề | Giải pháp |
|---|---|
| Process crash giữ lock | Kiểm tra PID sống/chết via `kill(pid, 0)` |
| PID reuse (OS gán PID cũ cho process mới) | Deadman ceiling 60s — lock quá cũ = stealable |
| Race condition khi 2 process cùng steal | Identity re-confirm + atomic rename |
| NFS/Docker overlay FS errors | Retry trên transient error codes (EBUSY, EAGAIN, ...) |
| Crash giữa steal và acquire | Rename tạo file `.stale-*`, rmSync dọn dẹp |

### Process Exit Cleanup

```typescript
const _heldPlanningLocks = new Set<string>();

process.on('exit', () => {
  for (const lockPath of _heldPlanningLocks) {
    try { fs.unlinkSync(lockPath); } catch {}
  }
});
```

Khi process thoát (bình thường hoặc crash), tự động xoá tất cả lock đang giữ.

---

## 7. Cơ Chế Wave (Kahn's Algorithm)

**File:** [phase.cts](file:///home/dangnd/code/github/gsd-core/src/phase.cts) — `computeDependencyLevels()`

### Bài toán

Cho N plan với dependency:
```
Plan 03-01: depends_on = []
Plan 03-02: depends_on = []
Plan 03-03: depends_on = [03-01, 03-02]
Plan 03-04: depends_on = [03-03]
```

Cần phân thành wave sao cho:
- Plan trong cùng wave **chạy song song**
- Wave sau chạy **sau** wave trước
- Dependency luôn được thoả mãn

### Thuật toán (O(V+E) topological sort)

```
INPUT:  rawPlans = [{id:"03-01", dependsOn:[]}, {id:"03-02", dependsOn:[]},
                    {id:"03-03", dependsOn:["03-01","03-02"]},
                    {id:"03-04", dependsOn:["03-03"]}]

BƯỚC 1: Xây adjacency list + in-degree
  adj["03-01"] = ["03-03"]     inDeg["03-01"] = 0
  adj["03-02"] = ["03-03"]     inDeg["03-02"] = 0
  adj["03-03"] = ["03-04"]     inDeg["03-03"] = 2  (phụ thuộc 2 plan)
  adj["03-04"] = []            inDeg["03-04"] = 1

BƯỚC 2: Queue = tất cả node có inDeg=0
  queue = ["03-01", "03-02"]
  level["03-01"] = 0, level["03-02"] = 0

BƯỚC 3: Process queue (head-index, KHÔNG dùng Array.shift() — O(1))
  head=0: cur="03-01", level=0
    → adj["03-01"] = ["03-03"]
    → level["03-03"] = max(0, 0+1) = 1
    → inDeg["03-03"]-- → 1 (chưa = 0, chưa vào queue)
  
  head=1: cur="03-02", level=0
    → adj["03-02"] = ["03-03"]
    → level["03-03"] = max(1, 0+1) = 1  (giữ nguyên)
    → inDeg["03-03"]-- → 0 → queue.push("03-03")
  
  head=2: cur="03-03", level=1
    → adj["03-03"] = ["03-04"]
    → level["03-04"] = max(0, 1+1) = 2
    → inDeg["03-04"]-- → 0 → queue.push("03-04")
  
  head=3: cur="03-04", level=2
    → adj["03-04"] = [] (no outgoing)

OUTPUT:
  level = {"03-01": 0, "03-02": 0, "03-03": 1, "03-04": 2}
  visited = 4 (= rawPlans.length → không có cycle)

WAVE ASSIGNMENT (offset 1):
  Wave 1: [03-01, 03-02]  ← chạy song song
  Wave 2: [03-03]          ← đợi wave 1 xong
  Wave 3: [03-04]          ← đợi wave 2 xong
```

> [!TIP]
> Thuật toán dùng **longest-path** (không phải shortest) — `level[dep] = max(existing, curLevel+1)`. Điều này đảm bảo plan chỉ nằm trong wave SAU tất cả dependency truyền cậy (transitive) của nó.

### Cycle Detection

Nếu `visited < rawPlans.length` → có cycle. Ví dụ:
```
Plan A depends_on [B]
Plan B depends_on [A]
→ inDeg["A"] = 1, inDeg["B"] = 1 — cả hai không bao giờ vào queue
→ visited = 0 < 2 → CYCLE DETECTED → error
```

---

## 8. Cơ Chế Worktree Isolation

**File:** [worktree-safety.cts](file:///home/dangnd/code/github/gsd-core/src/worktree-safety.cts)

### Tại sao cần worktree?

Khi 2 agent chạy song song trên cùng 1 repo:
- Agent A sửa file `src/api.ts` → commit
- Agent B sửa file `src/db.ts` → commit
- **Xung đột:** cả hai cùng thấy working directory khác nhau

**Giải pháp:** Mỗi agent nhận **git worktree riêng** — một bản copy của repo với branch riêng:

```
Main repo (orchestrator):     /project/          branch: phase-3
Agent 1 worktree:             /tmp/wt-03-01/     branch: worktree-agent-03-01
Agent 2 worktree:             /tmp/wt-03-02/     branch: worktree-agent-03-02
```

### Flow chi tiết

```
TRƯỚC WAVE:
  1. Orchestrator capture: EXPECTED_BASE = HEAD commit hash
  2. Tạo manifest JSON: { orchestrator_root, worktrees: [] }

SPAWN AGENT:
  3. Claude Code tạo worktree tự động (orchestrator KHÔNG gọi git worktree add)
  4. Agent chạy trong worktree, commit vào branch riêng
  5. Sau khi agent xong: ghi metadata vào manifest

SAU WAVE:
  6. CWD-drift guard: kiểm tra orchestrator vẫn ở đúng thư mục
  7. Branch identity check: EXPECTED_BRANCH vẫn đúng
  8. Merge: worktree branches → main branch
  9. Cleanup: git worktree remove + git branch -D + git worktree prune
  10. Post-merge test gate: build + test

NẾU MERGE CONFLICT:
  → Thử auto-resolve
  → Nếu không được → hỏi user
  → Nếu HEAD diverged → auto-downgrade sang sequential
```

### resolveWorktreeContext — Tìm đúng `.planning/`

```typescript
function resolveWorktreeContext(cwd):
  1. Nếu cwd có .planning/ → dùng cwd (local takes precedence)
  2. Nếu không phải git repo → dùng cwd
  3. Nếu git-dir ≠ common-dir (linked worktree) → redirect về main worktree root
     // Tất cả worktree chia sẻ cùng .planning/ state
  4. Otherwise → dùng cwd (main worktree)
```

**Chính sách non-destructive:** Module CHỈ hỗ trợ `metadata_prune_only` — KHÔNG BAO GIỜ force-remove thư mục worktree. Nếu cleanup thất bại → hướng dẫn manual.

---

## 9. State Transition Engine

**File:** [state-transition.cts](file:///home/dangnd/code/github/gsd-core/src/state-transition.cts) (1995 dòng)

### Kiến trúc Pure Function

```
                    ┌─────────────────────────┐
                    │  cmdStateBeginPhase()    │  ← I/O wrapper
                    │  (state.cts)             │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  readModifyWriteStateMd  │  ← Lock + Read + Write
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  transitionCore()        │  ← PURE FUNCTION (no I/O)
                    │  (state-transition.cts)  │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  syncStateFrontmatter()  │  ← Re-derive YAML
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  applyStatePreservation  │  ← Table-driven field restore
                    └─────────────────────────┘
```

**Tại sao pure function?**
- Testable: không cần mock filesystem
- Predictable: cùng input → cùng output
- Composable: nhiều transition có thể chain

### Field Classification Table

Mỗi field trong STATE.md YAML frontmatter có 2 thuộc tính:

| Field | Source | Preservation |
|---|---|---|
| `current_phase` | `body` | `preserve-when-unchanged` |
| `current_phase_name` | `curated` | `preserve-always` |
| `status` | `body` | `preserve-when-unchanged` |
| `progress` | `curated` | `preserve-always` |
| `progress.total_phases` | `disk` | `derive` |
| `progress.completed_plans` | `disk` | `derive` |
| `milestone` | `external` | `preserve-if-placeholder` |
| `last_updated` | `free` | `derive` |

**Source** = field lấy giá trị từ đâu:
- `body`: từ markdown body của STATE.md
- `disk`: tính từ filesystem (đếm plan/summary files)
- `external`: từ user input
- `curated`: do workflow logic quyết định
- `free`: tự sinh (timestamp, version)

**Preservation** = khi sync lại frontmatter, giữ hay tính lại:
- `derive`: luôn tính lại từ source
- `preserve-always`: giữ nguyên giá trị cũ
- `preserve-when-unchanged`: giữ nếu body không thay đổi (delta heuristic)
- `preserve-if-placeholder`: giữ nếu chưa phải placeholder
- `clear`: xoá

### Build-time Guard

```typescript
// Trong mỗi *Core() function:
for (const key of Object.keys(newFrontmatter)) {
  if (getFieldClassification(key) === null) {
    throw new Error(`Unknown field '${key}' — add to FIELD_CLASSIFICATION`);
  }
}
```

Thêm field mới vào STATE.md mà quên thêm vào bảng classification → **hard error**. Đây là regression guard tại build time.

---

## 10. Sơ Đồ Data Flow Tổng Thể

```
User: /gsd:execute-phase 3
│
▼
┌───────────────────────────────────────────────────────────────┐
│ COMMAND LAYER                                                  │
│ commands/gsd/execute-phase.md                                  │
│   → effort: max, allowed-tools: [...Agent...], requires: [...] │
│   → Delegate to workflow                                       │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────────────────┐
│ WORKFLOW LAYER                                                 │
│ gsd-core/workflows/execute-phase.md (93KB, 22 bước)           │
│                                                                │
│  ┌─ parse_args ──→ initialize ──→ safe_resume_gate            │
│  │                      │                                      │
│  │          ┌───────────┴────────────┐                        │
│  │          ▼                        ▼                        │
│  │   gsd_run query             gsd_run query                  │
│  │   init.execute-phase        config-get runtime             │
│  │          │                        │                        │
│  │          ▼                        ▼                        │
│  │   check_blocking ──→ handle_branching ──→ validate_phase   │
│  │                                                │           │
│  │                                    ┌───────────┘           │
│  │                                    ▼                       │
│  │                          STATE.md transition               │
│  │                          (beginPhase intent)               │
│  │                                    │                       │
│  │                                    ▼                       │
│  │                       discover_and_group_plans             │
│  │                          cmdPhasePlanIndex()               │
│  │                          Kahn's algorithm                  │
│  │                                    │                       │
│  │                          ┌─────────┴──────────┐           │
│  │                          ▼                    ▼           │
│  │                       Wave 1               Wave 2         │
│  │                     ┌────┴────┐              │            │
│  │                     ▼         ▼              ▼            │
│  │               ┌──────┐  ┌──────┐       ┌──────┐         │
│  │               │Agent │  │Agent │       │Agent │         │
│  │               │03-01 │  │03-02 │       │03-03 │         │
│  │               │(wt)  │  │(wt)  │       │(wt)  │         │
│  │               └──┬───┘  └──┬───┘       └──┬───┘         │
│  │                  │         │               │              │
│  │                  ▼         ▼               ▼              │
│  │              SUMMARY   SUMMARY         SUMMARY            │
│  │              03-01.md  03-02.md        03-03.md           │
│  │                  │         │               │              │
│  │                  └────┬────┘               │              │
│  │                       ▼                    │              │
│  │                  Merge worktrees           │              │
│  │                  Post-merge test           │              │
│  │                  Update tracking           │              │
│  │                       │                    │              │
│  │                       └───────┬────────────┘              │
│  │                               ▼                           │
│  │                     ┌──────────────────┐                  │
│  │                     │  gsd-verifier    │                  │
│  │                     │  agent           │                  │
│  │                     └────────┬─────────┘                  │
│  │                              ▼                            │
│  │                      VERIFICATION.md                      │
│  │                              │                            │
│  │                    ┌─────────┼──────────┐                │
│  │                    ▼         ▼          ▼                │
│  │                 passed   human_needed  gaps_found        │
│  │                    │         │          │                 │
│  │                    ▼         ▼          ▼                │
│  │              cmdPhaseComplete  UAT.md  plan-phase --gaps │
│  │              (transactional)                              │
│  │                    │                                      │
│  │                    ▼                                      │
│  │              offer_next                                   │
│  │              → /gsd:plan-phase 4                          │
│  │              → /gsd:discuss-phase 4                       │
│  │              → auto-advance chain                         │
│  └───────────────────────────────────────────────────────────┘
```

> [!NOTE]
> **Resumption:** Nếu chạy lại `/gsd:execute-phase 3`:
> - Bước 8 phát hiện plan 03-01 và 03-02 đã có SUMMARY.md → bỏ qua
> - Chỉ chạy plan 03-03 (incomplete)
> - **Idempotent** — chạy bao nhiêu lần cũng an toàn

---

## Tổng Kết Các Cơ Chế Bảo Vệ

| Cơ chế | Bảo vệ khỏi | Vị trí |
|---|---|---|
| O_EXCL lock + steal protocol | Concurrent write corruption | planning-workspace.cts |
| CWD-drift guard | Orchestrator lạc vào worktree | execute-phase.md step 10.1 |
| Branch identity check | Branch bị switch bất ngờ | execute-phase.md step 10.7 |
| Checkpoint heartbeat | SSE stream idle timeout | execute-phase.md step 10.2 |
| File overlap detection | Parallel write conflict | execute-phase.md step 10.3 |
| Safe resume gate | Duplicate work sau crash | execute-phase.md step 3 |
| Stall detection | Agent bị treo | execute-phase.md step 10.6 |
| Post-merge test gate | Cross-plan integration bugs | execute-phase.md step 10.8 |
| Failure classification | Xử lý đúng loại failure | execute-phase.md step 10.10 |
| Field classification guard | STATE.md field thiếu metadata | state-transition.cts |
| Non-canonical plan warning | Plan bị bỏ sót do tên sai | phase.cts |
| Prompt injection guard | Injection qua .planning/ files | gsd-prompt-guard.js |
| Context monitor | Context window exhaustion | gsd-context-monitor.js |
| Deadman ceiling (60s) | PID reuse false-alive | planning-workspace.cts |
| Identity re-confirm | Double-steal race condition | planning-workspace.cts |
