# Flow Deep-Dive: `/gsd:discuss-phase`

> Bước đầu tiên trong Phase Loop — thu thập quyết định implementation trước khi planning.

---

## Tổng quan

`/gsd:discuss-phase` là bước **Discuss** trong Phase Loop (discuss → plan → execute → verify → ship). Mục đích: **trích xuất các quyết định implementation** mà downstream agents (researcher, planner, executor) cần biết để làm việc hiệu quả.

**Triết lý:** User = founder/visionary, AI = builder. Chỉ hỏi về **vision và implementation choices**. KHÔNG hỏi về codebase patterns, technical risks, implementation approach, hay success metrics — những thứ đó AI tự tìm được.

**Output chính:** `{padded_phase}-CONTEXT.md` — file 6 section chứa tất cả decisions cho phase.

---

## Architecture Overview

```
User → /gsd:discuss-phase <phase> [flags]
         │
         ▼
  commands/gsd/discuss-phase.md  (thin shell, YAML frontmatter)
         │
         │  Mode routing (config + flags)
         ▼
  ┌──────────────────────────────────────────────┐
  │              MODE ROUTER                      │
  │                                               │
  │  --assumptions  →  list-phase-assumptions.md  │  (read-only, no output)
  │  assumptions    →  discuss-phase-assumptions.md│  (codebase-first)
  │  --power        →  discuss-phase-power.md     │  (async/offline)
  │  default        →  discuss-phase.md           │  (interactive interview)
  │                     + mode overlays:           │
  │                       --auto, --chain, --all   │
  │                       --text, --batch, --analyze│
  │                       ADVISOR_MODE             │
  └──────────────────────────────────────────────┘
         │
         ▼
  CONTEXT.md + DISCUSSION-LOG.md
         │
         ▼
  (optional auto-advance → /gsd:plan-phase)
```

---

## Entry Point: Command File

**File:** `commands/gsd/discuss-phase.md`

```yaml
name: gsd:discuss-phase
effort: max                    # maximum reasoning
requires: [config, phase]     # dependencies
allowed-tools:
  - Read, Write, Bash, Glob, Grep
  - AskUserQuestion           # interactive questioning
  - Agent                     # can spawn subagents
  - mcp__context7__*          # library docs lookup
```

**Argument parsing:**
```
/gsd:discuss-phase <phase> [--all] [--auto] [--chain] [--batch] [--analyze]
                           [--text] [--power] [--assumptions]
```

**Mode routing logic:**
1. Đọc `DISCUSS_MODE` từ config: `gsd_run query config-get workflow.discuss_mode` (mặc định `"discuss"`)
2. Nếu `--assumptions` trong args → chạy `list-phase-assumptions.md` (chỉ đọc, không tạo file)
3. Nếu `DISCUSS_MODE == "assumptions"` → chạy `discuss-phase-assumptions.md`
4. Còn lại → chạy `discuss-phase.md` (workflow chính)

---

## Flow 1: Default Interactive Discuss (Main Flow)

**File:** `gsd-core/workflows/discuss-phase.md` (520 lines, 32KB)

**Loop host metadata:**
```
step: discuss
points: discuss:pre, discuss:post
agent-roles: orchestrator
produces: CONTEXT.md
consumes: (none — this is the first step)
```

### Step-by-step:

#### Step 1: `initialize`
```bash
gsd_run query init.phase-op "${PHASE}"
```
Trả về JSON:
```json
{
  "phase_found": true,
  "phase_dir": ".planning/phases/01-setup",
  "phase_number": "1",
  "padded_phase": "01",
  "phase_name": "setup",
  "has_context": false,
  "has_plans": false,
  "plan_count": 0,
  "roadmap_exists": true,
  "response_language": "en"
}
```

Cũng detect **ADVISOR_MODE**: kiểm tra file `$HOME/.claude/gsd-core/USER-PROFILE.md` có tồn tại không.

#### Step 2: `check_blocking_antipatterns`
Tìm `.continue-here.md` trong phase dir. Nếu có blocking anti-patterns, agent phải trả lời 3 câu hỏi cho mỗi pattern trước khi tiếp tục:
- Pattern là gì?
- Nó đã manifest như thế nào?
- Cơ chế prevention là gì?

#### Step 3: `check_spec`
Tìm `*-SPEC.md` (trừ AI-SPEC). Nếu có → lock requirements, set `spec_loaded = true`. SPEC.md sẽ được tích hợp vào CONTEXT.md output.

#### Step 4: `check_existing`
Xử lý 3 trường hợp:

| Condition | Options |
|---|---|
| CONTEXT.md đã tồn tại | Update / View / Skip |
| Checkpoint file bị interrupted | Resume / Start fresh |
| Plans đã tồn tại | Cảnh báo cần replan |

`--auto` mode tự động chọn trong mỗi trường hợp.

#### Step 5: `load_prior_context`
Thu thập context từ các phase trước:
- Đọc `PROJECT.md`, `REQUIREMENTS.md`, `STATE.md`
- Đọc **tối đa 3** CONTEXT.md từ các phase trước (hoặc `DECISIONS-INDEX.md` nếu có)
- Kiểm tra spike/sketch findings
- Build internal `<prior_decisions>` context

> **Tại sao chỉ 3?** Để giữ context window lean — những phase cũ hơn đã được tóm tắt trong PROJECT.md.

#### Step 6: `cross_reference_todos`
```bash
gsd_run query todo.match-phase "${PHASE_NUMBER}"
```
- Todos match → fold vào CONTEXT.md decisions
- Reviewed nhưng không fold → deferred
- `--auto` auto-folds todos có score ≥ 0.4

#### Step 7: `scout_codebase`
Đọc `references/scout-codebase.md` để chọn codebase maps phù hợp với loại phase.
- Đọc 2-3 existing codebase maps
- Fallback sang grep nếu không có maps
- Build internal `<codebase_context>`

#### Step 8: `dispatch_discuss_pre_hooks`
```bash
gsd_run loop render-hooks discuss:pre --raw
```
Chạy capability hooks đăng ký tại extension point `discuss:pre`.

#### Step 9: `analyze_phase` ⭐ (core logic)
Đây là bước quan trọng nhất — xác định **gray areas** cần discuss:

1. Xác định domain boundary từ ROADMAP.md
2. Khởi tạo canonical refs accumulator
3. Kiểm tra prior decisions — **skip** những gì đã quyết định ở phase trước
4. Xác định 1-2 gray areas cụ thể cho mỗi category
5. Nếu không có meaningful gray areas → skip assessment hoàn toàn

> **Gray area** = quyết định implementation mà AI không thể tự đưa ra vì phụ thuộc vào preference/vision của user.

#### Step 10: `present_gray_areas`
Trình bày cho user:
- Domain summary
- Prior decisions (đã biết)
- Gray areas cần discuss

Behavior theo mode:
- `--auto` / `--all` → auto-select TẤT CẢ gray areas
- Default → `AskUserQuestion` multiSelect với 3-4 options cụ thể

#### Step 11: `discuss_areas` ⭐ (interaction core)
Behavior phụ thuộc vào **active mode file**. Xem chi tiết ở section Mode Files bên dưới.

**Universal rules** (áp dụng cho mọi mode):
- Tích lũy canonical refs liên tục
- Xử lý scope creep (ghi nhận nhưng defer)
- Incremental checkpoint sau mỗi area
- Tích lũy discussion log

#### Step 12: `write_context` ⭐ (output)
Tạo `{phase_dir}/{padded_phase}-CONTEXT.md` với 6 sections:

```markdown
# Phase [X] Context: [Name]

## Phase Boundary
(scope anchor từ ROADMAP.md)

## Requirements Lock (conditional — chỉ khi có SPEC.md)

## Implementation Decisions
D-01. [Decision title]
- **Choice:** [what was decided]
- **Rationale:** [why]

### Claude's Discretion
(items AI tự quyết — user không có preference)

### Folded Todos
(todos đã match và fold vào)

## Canonical References ← MANDATORY
### [Topic Area]
- `src/components/Card.tsx` — existing card component
- `src/styles/theme.ts` — design tokens

## Code Context
### Reusable Assets
### Established Patterns
### Integration Points

## Specific Ideas
("I want it like X" moments)

## Deferred Ideas
(out-of-scope nhưng ghi lại để không quên)
```

#### Steps 13-17: Finalize
- `dispatch_discuss_post_hooks` — chạy `discuss:post` hooks
- `confirm_creation` — summary và next steps
- `git_commit` — commit CONTEXT.md + DISCUSSION-LOG.md
- `update_state` — cập nhật STATE.md
- `auto_advance` — nếu `--auto`/`--chain`/config → tự động chạy `/gsd:plan-phase`

---

## Flow 2: Assumptions Mode (Codebase-First)

**File:** `gsd-core/workflows/discuss-phase-assumptions.md` (676 lines)

Ngược lại với discuss mode (hỏi user trước), assumptions mode **phân tích codebase trước** rồi đưa ra assumptions cho user review.

```
Codebase Analysis → Structured Assumptions → User Review/Correction → CONTEXT.md
```

### Khác biệt chính:

| Aspect | Discuss Mode | Assumptions Mode |
|---|---|---|
| Approach | Interview-first | Codebase-first |
| User effort | Trả lời nhiều câu hỏi | Review assumptions, chỉ correct sai |
| Agent used | Orchestrator trực tiếp | Spawns `gsd-assumptions-analyzer` subagent |
| Best for | Greenfield, high-vision | Brownfield, code-heavy |

### Key step: `deep_codebase_analysis`
Spawns **`gsd-assumptions-analyzer`** subagent:

**Input:**
- Phase goal, prior decisions, codebase hints
- **Calibration tier** (từ USER-PROFILE.md `vendor_philosophy`):
  - `full_maturity`: 3-5 areas, 2-3 alternatives each
  - `standard`: 3-4 areas, 2 alternatives
  - `minimal_decisive`: 2-3 areas, single recommendation

**Subagent behavior:**
- Đọc 5-15 source files
- Trả về structured assumptions với confidence levels:
  - 🟢 **Confident** — strong evidence trong code
  - 🟡 **Likely** — reasonable inference
  - 🔴 **Unclear** — needs user input
- Cũng trả về `needs_research[]` — topics cần external research

**User review:**
- Hiển thị tất cả assumptions với confidence badges
- `--auto` skip nếu tất cả Confident/Likely
- User chọn MultiSelect assumptions cần correct
- Focused questions cho mỗi correction

**Output:** Cùng format CONTEXT.md 6 sections.

---

## Flow 3: Power Mode (Async/Offline)

**File:** `gsd-core/workflows/discuss-phase-power.md` (292 lines)

Dành cho người muốn **trả lời offline** — generate tất cả questions lên JSON + HTML, user trả lời khi rảnh.

```
Analyze Gray Areas → Generate JSON + HTML → User answers offline → Finalize → CONTEXT.md
```

### Output files:
1. **`{padded_phase}-QUESTIONS.json`** — structured questions:
```json
{
  "sections": [{
    "name": "UI Layout",
    "questions": [{
      "id": "Q-01",
      "title": "Card vs List layout?",
      "context": "...",
      "options": ["Card-based grid", "Vertical list"],
      "answer": "",
      "chat_more": false,
      "status": "unanswered"
    }]
  }]
}
```

2. **`{padded_phase}-QUESTIONS.html`** — self-contained companion:
   - Stats bar (answered/total)
   - Collapsible sections
   - 3-column card grid
   - Green highlight cho answered, orange border cho `chat_more`

### Wait loop commands:
| Command | Action |
|---|---|
| `"refresh"` | Re-read JSON, show updated stats |
| `"finalize"` | Process answers → CONTEXT.md (warns if <50% answered) |
| `"explain Q-N"` | Deep-dive explanation cho 1 question |
| `"exit power mode"` | Abort |

---

## Flow 4: List Assumptions (Read-Only)

**File:** `gsd-core/workflows/list-phase-assumptions.md` (179 lines)

Triggered bởi `--assumptions` flag. **Purely conversational** — KHÔNG tạo file nào.

Phân tích assumptions qua 5 areas:
1. Technical Approach
2. Implementation Order
3. Scope Boundaries
4. Risk Areas
5. Dependencies

Mỗi assumption có confidence level: Fairly confident / Assuming / Unclear.

---

## Mode Files (Overlays)

Các mode files **stack lên nhau** theo thứ tự cố định, cho phép kết hợp:

| Mode | File | Behavior |
|---|---|---|
| **default** | `modes/default.md` | 4 câu hỏi/area via `AskUserQuestion`. Gate "More?" / "Next area" sau mỗi 4 câu. |
| **auto** | `modes/auto.md` | Tự chọn recommended option cho mọi câu hỏi. Single-pass cap. Auto-advance. |
| **chain** | `modes/chain.md` | Interactive discuss (như default), sau đó auto-advance qua plan → execute. |
| **all** | `modes/all.md` | Auto-select TẤT CẢ gray areas (skip selection step). Discuss vẫn interactive. |
| **advisor** | `modes/advisor.md` | Research-backed. Spawns `gsd-advisor-researcher` agents song song. Presents comparison tables. |
| **analyze** | `modes/analyze.md` | Overlay: thêm trade-off analysis table trước mỗi câu hỏi. |
| **batch** | `modes/batch.md` | Overlay: gom 2-5 câu hỏi/turn. User trả lời "1c, 2a, 3b". |
| **text** | `modes/text.md` | Overlay: plain-text lists thay vì AskUserQuestion. Cho remote sessions. |
| **power** | `modes/power.md` | Redirect toàn bộ sang power workflow. |

### Kết hợp hợp lệ:

| Combo | Effect |
|---|---|
| `--all --auto` | Auto wins — fully autonomous |
| `--all --chain` | Interactive discuss all areas + auto-advance |
| `--auto` alone | Auto discuss + auto-advance (= `--auto` includes chain) |
| `--chain --batch` | Interactive batch discuss + auto-advance |
| `--text --analyze` | Trade-off tables in plain text |
| `--power --chain` | Power mode, chain auto-advance after finalize |
| `--power --auto` | Power wins |

---

## Agents Used

### `gsd-assumptions-analyzer`
**File:** `agents/gsd-assumptions-analyzer.md`

| Attribute | Value |
|---|---|
| Tools | Read, Bash, Grep, Glob, Skill |
| Color | cyan |
| Role | Deep codebase analysis cho ONE phase |
| Output | Structured assumptions + `needs_research[]` |

### `gsd-advisor-researcher`
**File:** `agents/gsd-advisor-researcher.md`

| Attribute | Value |
|---|---|
| Tools | Read, Bash, Grep, Glob, Skill, WebSearch, WebFetch, mcp__context7__* |
| Color | cyan |
| Role | Research ONE gray area, produce comparison table |
| Output | 5-column table (Option / Pros / Cons / Complexity / Recommendation) |
| Tool priority | Context7 (1st, HIGH trust) → WebFetch (2nd) → WebSearch (3rd, needs verification) |

---

## Data Flow Diagram

```
                    ┌─────────────────────┐
                    │    Prior Context     │
                    │  PROJECT.md          │
                    │  REQUIREMENTS.md     │
                    │  STATE.md            │
                    │  Prior CONTEXT.md×3  │
                    │  Matched Todos       │
                    │  Codebase Maps       │
                    └────────┬────────────┘
                             │
                             ▼
                    ┌─────────────────────┐
                    │   analyze_phase     │
                    │                     │
                    │  Prior decisions    │
                    │  ─ skip resolved ─  │
                    │  Gray areas (1-2    │
                    │  per category)      │
                    └────────┬────────────┘
                             │
                    ┌────────┴────────────┐
                    │  present_gray_areas │
                    │  (user selects or   │
                    │   auto-select all)  │
                    └────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  Area 1  │  │  Area 2  │  │  Area 3  │
        │ 4 Qs via │  │ 4 Qs via │  │ 4 Qs via │
        │ AskUser  │  │ AskUser  │  │ AskUser  │
        │ Question │  │ Question │  │ Question │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │ checkpoint   │ checkpoint   │ checkpoint
             ▼              ▼              ▼
        ┌──────────────────────────────────────┐
        │          write_context               │
        │                                      │
        │  {padded_phase}-CONTEXT.md           │
        │  ├── Phase Boundary                  │
        │  ├── Implementation Decisions (D-01) │
        │  ├── Canonical References ← MUST     │
        │  ├── Code Context                    │
        │  ├── Specific Ideas                  │
        │  └── Deferred Ideas                  │
        └──────────────────┬───────────────────┘
                           │
                    ┌──────┴──────┐
                    │  git_commit │
                    │  + STATE.md │
                    │  update     │
                    └──────┬──────┘
                           │
                           ▼
                  (auto-advance?)
                  → /gsd:plan-phase
```

---

## TypeScript Source Integration

| Source File | Function | Relevance |
|---|---|---|
| `src/config.cts` L245 | `discuss_mode: 'discuss'` | Default mode config |
| `src/config.cts` L243-244 | `text_mode: false`, `research_before_questions: false` | Mode toggles |
| `src/init.cts` L1542-1600 | `is_next_to_discuss` | Phase status: empty → discussed (has CONTEXT.md) |
| `src/roadmap.cts` L395 | `hasContext → diskStatus = 'discussed'` | ROADMAP status derivation |
| `src/state-document.cts` L135-136 | Normalizes `'discussing'` status | STATE.md field handling |
| `src/loop-resolver.cts` L71-72 | Hook points `discuss:pre`, `discuss:post` | Extension point registration |
| `src/clusters.cts` L35 | `discuss-phase` in command clusters | Command grouping |

---

## Non-Obvious Behaviors

1. **Incremental checkpoints** — sau mỗi area, workflow ghi checkpoint JSON. Nếu session crash, user có thể resume từ checkpoint thay vì bắt đầu lại.

2. **Canonical refs là MANDATORY** — mọi CONTEXT.md phải có section này. Chứa full relative paths đến files mà planner/executor cần biết. Thiếu section này = downstream agents sẽ phải tự tìm, tốn context.

3. **DISCUSSION-LOG.md là audit trail** — KHÔNG được downstream agents consume. Chỉ để human review sau này. CONTEXT.md mới là output chính thức.

4. **Scope creep handling** — nếu user đề cập thứ ngoài phase scope, workflow ghi nhận vào "Deferred Ideas" thay vì từ chối. Không mất ý tưởng, nhưng không để nó ảnh hưởng phase hiện tại.

5. **"Claude's Discretion" section** — cho những quyết định mà user nói "tùy bạn" hoặc không có preference. Planner/executor biết đây là những thứ họ tự quyết được.

6. **Prior phase awareness** — Step 9 (`analyze_phase`) explicitly skip gray areas đã resolved ở phase trước. Không hỏi lại câu đã trả lời.

7. **ADVISOR_MODE** (khi có USER-PROFILE.md) — detect non-technical owner → reframe gray areas bằng product-outcome language thay vì technical jargon. Spawns parallel researcher agents cho comparison tables.

8. **Workflow files lazy-loaded** — mode files CHỈ được đọc khi cần, không load tất cả upfront. Tiết kiệm context window.

9. **`--auto` single-pass cap** — ở auto mode, workflow KHÔNG bao giờ re-read CONTEXT.md vừa tạo. Tránh vòng lặp vô hạn.

10. **Todo folding** — `gsd_run query todo.match-phase` match todos với phase, auto-fold những cái score ≥ 0.4 vào decisions. Giữ context coherent giữa todo system và discuss flow.
