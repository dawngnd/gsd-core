# Cách GSD Lấy AI Runtime Type

> GSD **KHÔNG tự động detect** runtime bạn đang dùng.
> Runtime được **SET tại install time** và đọc lại từ config tại run time.
> Hệ thống dùng **Capability Registry pattern** — mỗi runtime khai báo khả năng
> của mình trong file `capability.json`, và toàn bộ machinery (installer, converter,
> hooks, model resolver) tra cứu registry này.

---

## 1. Hai Khái Niệm "Runtime" Khác Nhau

GSD dùng từ "runtime" cho **2 thứ hoàn toàn khác nhau**:

| | AI Tool Runtime | Execution Environment Runtime |
|---|---|---|
| **Ví dụ** | `claude`, `codex`, `gemini`, `cursor`, `copilot` | `node`, `bun`, `sandboxed-web`, `python` |
| **Nơi lưu** | `.planning/config.json` → key `"runtime"` | `host-integration.cts` → axis `runtime` |
| **Ai set** | User chọn khi install (`--claude`, `--codex`) | Host tự khai báo qua capability descriptor |
| **Dùng để** | Chọn model, layout artifact, đổi path, chọn hook dialect | Negotiation capability, degradation level |
| **Module** | `config-loader.cts`, `model-resolver.cts`, `runtime-name-policy.cts` | `host-integration.cts` |

Phần còn lại của tài liệu này nói về **AI Tool Runtime** — thứ quyết định GSD chạy trên Claude Code, Gemini CLI, Codex, hay Cursor.

---

## 2. Luồng End-to-End: Từ Install Đến Runtime

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: INSTALL TIME                                       │
│  User: npx gsd-core --gemini --global                        │
│                                                              │
│  1. selectRuntimesFromArgs(["--gemini"]) → ["gemini"]        │
│  2. canonicalizeRuntimeName("gemini") → "gemini"             │
│  3. getGlobalConfigDir("gemini") → ~/.gemini/                │
│  4. _stampNonClaudeRuntimeDefaults():                        │
│     → runtime: "claude" → "gemini"                           │
│     → workflow.use_worktrees: true → false                   │
│  5. _applyRuntimeRewrites():                                 │
│     → ~/.claude/ → ~/.gemini/ (tất cả path references)       │
│  6. applySettingsJsonHooks():                                │
│     → hookEvents: "gemini" → BeforeTool/AfterTool            │
│  7. writeManifest(~/.gemini/, "gemini")                      │
│                                                              │
│  OUTPUT: Tất cả artifacts (commands, agents, hooks, skills)  │
│          đã được chuyển đổi cho Gemini runtime                │
├─────────────────────────────────────────────────────────────┤
│  PHASE 2: CONFIG TIME                                        │
│  User tạo project → .planning/config.json tự sinh:           │
│  {                                                           │
│    "runtime": "gemini",   ← stamped by installer             │
│    "workflow": {                                             │
│      "use_worktrees": false  ← stamped (Gemini không hỗ trợ)│
│    }                                                         │
│  }                                                           │
├─────────────────────────────────────────────────────────────┤
│  PHASE 3: RUN TIME                                           │
│  User: /gsd:execute-phase 3                                  │
│                                                              │
│  RUNTIME=$(gsd_run query config-get runtime --default claude) │
│  → Đọc .planning/config.json → "gemini"                     │
│  → RUNTIME="gemini"                                          │
│                                                              │
│  Workflow branches behavior dựa trên RUNTIME:                │
│  - Worktree guard: gemini + use_worktrees=false → OK         │
│  - Agent spawning: inline sequential (no worktree isolation) │
│  - Model resolution: RUNTIME_PROFILE_MAP["gemini"][tier]     │
│  - Hook dialect: AfterTool (không phải PostToolUse)           │
├─────────────────────────────────────────────────────────────┤
│  PHASE 4: HOOK TIME                                          │
│  gsd-context-monitor.js kiểm tra:                            │
│  process.env.GEMINI_API_KEY ? "AfterTool" : "PostToolUse"    │
│  → Dùng đúng event name cho runtime hiện tại                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Phase 1: Install Time — Chọn Runtime

### 3.1 User chọn runtime qua CLI flag

**File:** [install.js](file:///home/dangnd/code/github/gsd-core/bin/install.js) (498KB)

```bash
# Cách chọn runtime
npx gsd-core --claude --global      # Claude Code
npx gsd-core --gemini --global      # Gemini CLI
npx gsd-core --codex --global       # Codex
npx gsd-core --cursor --global      # Cursor
npx gsd-core --copilot --global     # GitHub Copilot
npx gsd-core --all --global         # Tất cả 16+ runtimes
npx gsd-core --both --global        # Claude + OpenCode
```

Nếu không truyền flag → installer hỏi interactive.

**Hàm `selectRuntimesFromArgs`:**
```javascript
function selectRuntimesFromArgs(runtimeArgs) {
  if (runtimeArgs.includes('--all')) return ['claude', 'kimi', 'kilo', ...all16];
  if (runtimeArgs.includes('--both')) return ['claude', 'opencode'];
  if (runtimeArgs.includes('--claude')) selected.push('claude');
  if (runtimeArgs.includes('--codex'))  selected.push('codex');
  if (runtimeArgs.includes('--gemini')) selected.push('gemini');
  // ... 1 flag per runtime
  return selected;
}
```

### 3.2 Normalize tên runtime

**File:** [runtime-name-policy.cts](file:///home/dangnd/code/github/gsd-core/src/runtime-name-policy.cts)

User có thể gõ nhiều dạng tên khác nhau. Tất cả đều normalize về **canonical name**:

```
"Claude-Code"  → normalize → "claude-code" → alias lookup → "claude"
"Codex_Desktop" → normalize → "codex-desktop" → alias lookup → "codex"
"gemini-cli"    → normalize → "gemini-cli"    → alias lookup → "gemini"
"OpenCode"      → normalize → "opencode"      → alias lookup → "opencode"
```

**Bảng alias đầy đủ (16 runtimes):**

| Canonical | Aliases |
|---|---|
| `claude` | claude, claude-code, claude-cli |
| `codex` | codex, codex-app, codex-cli, codex-desktop |
| `gemini` | gemini, gemini-cli, gemini-code |
| `copilot` | copilot, copilot-cli, github-copilot |
| `antigravity` | antigravity, antigravity-cli, antigravity-agent |
| `opencode` | opencode, open-code, opencode-cli |
| `cursor` | cursor, cursor-cli, cursor-nightly |
| `windsurf` | windsurf, windsurf-cli, windsurf-next, devin-desktop |
| `augment` | augment, augment-code, augment-cli |
| `trae` | trae, trae-cli |
| `qwen` | qwen, qwen-code, qwen-cli |
| `hermes` | hermes, hermes-agent, hermes-cli |
| `kimi` | kimi |
| `cline` | cline, cline-cli |
| `kilo` | kilo, kilo-cli |
| `codebuddy` | codebuddy, codebuddy-cli |

**Hàm normalize:**
```typescript
function normalizeRuntimeToken(value: string): string {
  return String(value).trim().toLowerCase().replace(/[_\s]+/g, '-');
}
// "Codex_Desktop" → "codex-desktop"
```

**Hàm canonicalize:**
```typescript
function canonicalizeRuntimeName(value: string): string | null {
  const normalized = normalizeRuntimeToken(value);
  // 1. Tìm trong runtime-aliases.manifest.json (generated)
  // 2. Fallback: tìm trong FALLBACK_ALIASES (hardcoded)
  // 3. Không tìm thấy → return null
}
```

### 3.3 Resolve config directory

**File:** [runtime-homes.cts](file:///home/dangnd/code/github/gsd-core/src/runtime-homes.cts)

Mỗi runtime có config dir khác nhau. Hàm `getGlobalConfigDir(runtime)` tra cứu **capability descriptor** từ registry:

```typescript
function getGlobalConfigDir(runtime: string, explicitDir?: string): string {
  // 1. Nếu user truyền explicit dir → dùng ngay
  if (explicitDir) return expandTilde(explicitDir);

  // 2. Tra cứu capability-registry
  const { runtimes } = getRegistry();
  const runtimeEntry = runtimes[runtime];
  if (runtimeEntry?.runtime?.configHome) {
    return resolveDescriptorWithOptions(runtimeEntry.runtime.configHome);
  }

  // 3. Fallback → ~/.claude (mặc định)
  return path.join(os.homedir(), '.claude');
}
```

**4 loại configHome descriptor:**

| Kind | Pattern | Ví dụ |
|---|---|---|
| `dot-home` | `~/.<name>` | Claude → `~/.claude`, Codex → `~/.codex` |
| `dot-home-nested` | `~/.<parent>/<probe>` | Antigravity → `~/.gemini/antigravity-cli` |
| `xdg` | `~/.config/<name>` | OpenCode → `~/.config/opencode`, Kilo → `~/.config/kilo` |
| `generic-agents-root` | Probe nhiều candidate | Kimi → `~/.config/agents` hoặc `~/.agents` |

### 3.4 Stamp runtime defaults vào artifacts

**File:** [runtime-artifact-conversion.cts](file:///home/dangnd/code/github/gsd-core/src/runtime-artifact-conversion.cts) (2710 dòng)

Đối với mọi runtime **không phải Claude**, installer làm 2 bước quan trọng:

**Bước A — `_stampNonClaudeRuntimeDefaults()`:**
```
Trước:  config defaults = { runtime: "claude", workflow: { use_worktrees: true } }
Sau:    config defaults = { runtime: "gemini", workflow: { use_worktrees: false } }
```

**Bước B — `_applyRuntimeRewrites()`:**
```
Trước:  @~/.claude/gsd-core/workflows/execute-phase.md
Sau:    @~/.gemini/gsd-core/workflows/execute-phase.md

Trước:  .claude/CLAUDE.md
Sau:    GEMINI.md (hoặc AGENTS.md tuỳ runtime)
```

**Bước C — `applySettingsJsonHooks()`:**

Đăng ký hook events theo dialect của runtime:
```
Claude:  PreToolUse, PostToolUse, SubagentStop, Stop, PreCompact, FileChanged
Gemini:  BeforeTool, AfterTool, BeforeAgent, AfterAgent, BeforeModel
Codex:   PreToolUse, PostToolUse (giống Claude, nhưng hook surface khác)
Copilot: (không có hook events — inline only)
```

### 3.5 Artifact conversion per runtime

Installer **chuyển đổi** Claude-native commands/agents thành format từng runtime hiểu:

| Runtime | Converter Function | Output Format |
|---|---|---|
| Claude | `convertClaudeCommandToClaudeSkill` | Skill markdown |
| Gemini | (no conversion needed) | Command markdown |
| Copilot | `convertClaudeCommandToCopilotSkill` | Copilot skill format |
| Codex | `convertClaudeCommandToCodexSkill` | Codex skill format |
| Kimi | `convertClaudeCommandToKimiSkill` | Kimi command format |
| Cline | `convertClaudeCommandToClineSkill` | Cline skill format |
| Antigravity | `convertClaudeCommandToAntigravitySkill` | Antigravity format |
| Hermes/Qwen | Claude converter + runtime-specific branches | Variant format |

---

## 4. Phase 2: Config Time — Lưu Trữ Runtime Identity

Khi user tạo project mới (`/gsd:new-project`), `.planning/config.json` sinh ra với `runtime` đã được stamp:

```json
{
  "runtime": "gemini",
  "mode": "interactive",
  "workflow": {
    "use_worktrees": false,
    "research": true
  },
  "model_profile": "balanced"
}
```

**Config loading precedence** (ai thắng khi conflict):

```
1. Workstream config:  .planning/workstreams/<ws>/config.json   ← cao nhất
2. Project config:     .planning/config.json
3. Global defaults:    ~/.gsd/defaults.json
4. Built-in defaults:  config-defaults.manifest.json            ← thấp nhất
```

**Validation tại load time** — `config-loader.cts`:
```typescript
const runtime = parsed['runtime'];
if (runtime && !KNOWN_RUNTIMES.has(runtime)) {
  // Warning: unknown runtime "xyz". Known: claude, codex, gemini, ...
  // Resolution will fall back to safe defaults.
}
```

`KNOWN_RUNTIMES` lấy từ [model-catalog.cts](file:///home/dangnd/code/github/gsd-core/src/model-catalog.cts) — là tập hợp tất cả key trong `runtimeTierDefaults` của `model-catalog.json`.

---

## 5. Phase 3: Run Time — Đọc Runtime và Branch Behavior

### 5.1 Đọc runtime từ config

Trong workflow (ví dụ `execute-phase.md`):

```bash
RUNTIME=$(gsd_run query config-get runtime --default claude --raw 2>/dev/null || echo "claude")
```

Đi qua call chain:
```
gsd_run query config-get runtime
  → Command Routing Hub dispatch({ family: "config", subcommand: "get", args: ["runtime"] })
  → loadConfigResolved(cwd)
  → config["runtime"]
  → return "gemini"
```

**Nếu không có trong config** → default `"claude"` (hardcoded fallback).

### 5.2 Behavior branching dựa trên runtime

Sau khi có `RUNTIME`, workflow phân nhánh hành vi:

```
                        RUNTIME = ?
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
           "claude"      "copilot"     mọi thứ khác
              │             │              │
              ▼             ▼              ▼
         Worktree OK    Sequential     use_worktrees=false
         Agent() +      inline         bắt buộc, nếu không
         isolation=     execution      → FATAL EXIT
         "worktree"     (no Agent())
              │             │              │
              ▼             ▼              ▼
         Parallel       One-at-a-time  Agent() nếu có,
         dispatch       user-visible   else inline
         run_in_bg                     sequential
```

**Chi tiết từng nhánh:**

| Hành vi | Claude | **Antigravity** 🟢 | Copilot | Gemini/Codex/Cursor/... |
|---|---|---|---|---|
| **Worktree isolation** | ✅ Parallel worktrees | ❌ `use_worktrees=false` (auto-stamped) | ❌ Không hỗ trợ | ❌ Phải set `use_worktrees=false` |
| **Agent spawning** | `Agent(isolation="worktree")` | `Agent()` (background=true nhưng nested/subagentToolkit=`"undocumented"` → fallback) | Inline sequential | `Agent()` nếu hỗ trợ, else inline |
| **Subagent dispatch** | `run_in_background: true` | `background: true` (hỗ trợ) | N/A | Tuỳ runtime |
| **STATE.md update** | Orchestrator cập nhật (agent không được) | Agent tự cập nhật (sequential mode) | Agent tự cập nhật | Tuỳ worktree mode |
| **Completion signal** | Agent() trả về kết quả | Spot-check fallback | Spot-check (SUMMARY.md + git log) | Spot-check fallback |
| **Stall detection** | Hỗ trợ (5/10 min intervals) | Hỗ trợ | N/A | Hỗ trợ |
| **Hook dialect** | PreToolUse/PostToolUse | **BeforeTool/AfterTool** (gemini dialect) | (none) | Tuỳ runtime |
| **Config dir** | `~/.claude/` | `~/.gemini/antigravity-cli/` (2-pass probe) | `~/.copilot/` | Tuỳ runtime |
| **Local config dir** | `.claude/` | `.agents/` | `.github/` | Tuỳ runtime |
| **Instruction file** | `CLAUDE.md` | `GEMINI.md` | `copilot-instructions.md` | `AGENTS.md` |

> [!IMPORTANT]
> **Bạn đang dùng Antigravity.** Các điểm quan trọng:
> - Config dir: `~/.gemini/antigravity-cli/` (KHÔNG PHẢI `~/.gemini/`)
> - Hook events dùng Gemini dialect: `BeforeTool`/`AfterTool` (KHÔNG PHẢI `PreToolUse`/`PostToolUse`)
> - Worktree isolation **KHÔNG khả dụng** — execution luôn sequential
> - Local config: `.agents/` (KHÔNG PHẢI `.claude/`)
> - `dispatch.nested = "undocumented"` → GSD giả định KHÔNG hỗ trợ nested dispatch → `maxDepth 1`
> - `supportTier = 1` (tier 1 = fully tested, đồng hạng Claude)

**Codex-specific rule:** Sau khi gọi `Agent()`, orchestrator phải **DỪNG NGAY** — không được read/edit/test trong khi subagent chạy.

### 5.3 Model resolution dựa trên runtime

**File:** [model-resolver.cts](file:///home/dangnd/code/github/gsd-core/src/model-resolver.cts)

Runtime quyết định model nào được chọn cho từng agent tier:

```typescript
function resolveTierEntry({ runtime, tier, overrides }) {
  // Tra cứu RUNTIME_PROFILE_MAP[runtime][tier]
  const builtin = runtimeMap[runtime]?.[tier];    // từ model-catalog.json
  const userOverride = overridesMap?.[runtime]?.[tier]; // từ config
  return { ...builtin, ...userOverride };         // user override thắng
}
```

**Ví dụ RUNTIME_PROFILE_MAP:**

| Runtime | max tier | high tier | standard tier |
|---|---|---|---|
| `claude` | claude-opus-4-20250918 | claude-sonnet-4-20250514 | claude-haiku-3-20250307 |
| `codex` | codex/o4-mini | codex/o4-mini | codex/o4-mini |
| `gemini` | gemini-2.5-pro | gemini-2.5-pro | gemini-2.5-flash |

**Đặc biệt:** Claude maps model ID ngược về tier alias (opus/sonnet/haiku/fable). Non-Claude runtimes dùng full model ID verbatim.

### 5.4 gsd-tools shim — tìm gsd-tools.cjs

Khi workflow cần gọi `gsd_run`, nó phải **tìm** file `gsd-tools.cjs` trong filesystem. Shim quét ~20 vị trí có thể:

```bash
# Thứ tự tìm kiếm (workflow tìm tuần tự, dừng ở cái đầu tiên tồn tại):
~/.claude/gsd-core/bin/gsd-tools.cjs
~/.codex/gsd-core/bin/gsd-tools.cjs
~/.gemini/gsd-core/bin/gsd-tools.cjs
~/.copilot/gsd-core/bin/gsd-tools.cjs
~/.cursor/gsd-core/bin/gsd-tools.cjs
~/.hermes/gsd-core/bin/gsd-tools.cjs
~/.codeium/windsurf/gsd-core/bin/gsd-tools.cjs
~/.augment/gsd-core/bin/gsd-tools.cjs
~/.trae/gsd-core/bin/gsd-tools.cjs
~/.qwen/gsd-core/bin/gsd-tools.cjs
~/.codebuddy/gsd-core/bin/gsd-tools.cjs
~/.cline/gsd-core/bin/gsd-tools.cjs
~/.agents/gsd-core/bin/gsd-tools.cjs
~/.gemini/antigravity/gsd-core/bin/gsd-tools.cjs
~/.gemini/antigravity-cli/gsd-core/bin/gsd-tools.cjs
~/.config/opencode/gsd-core/bin/gsd-tools.cjs
~/.config/kilo/gsd-core/bin/gsd-tools.cjs
# ... v.v.
```

Đây là cơ chế **runtime-agnostic** — cùng 1 workflow hoạt động trên bất kỳ runtime nào đã install.

---

## 6. Phase 4: Hook Time — Dialect Switching

### 6.1 Hook event names khác nhau theo runtime

**File:** [gsd-context-monitor.js](file:///home/dangnd/code/github/gsd-core/hooks/gsd-context-monitor.js)

```javascript
hookEventName: (data.hook_event_name && data.hook_event_name.trim())
  || (process.env.GEMINI_API_KEY ? "AfterTool" : "PostToolUse"),
```

| Claude dialect | Gemini dialect | Khi nào |
|---|---|---|
| `PreToolUse` | `BeforeTool` | Trước khi tool chạy |
| `PostToolUse` | `AfterTool` | Sau khi tool chạy |
| `SubagentStop` | `AfterAgent` | Subagent kết thúc |
| `Stop` | — | Session kết thúc |
| `PreCompact` | — | Trước context compaction |
| `FileChanged` | — | Config file thay đổi |
| — | `BeforeAgent` | Trước khi spawn agent |
| — | `BeforeModel` | Trước model call |

### 6.2 Hook surface khác nhau theo runtime

**File:** [runtime-hooks-surface.cts](file:///home/dangnd/code/github/gsd-core/src/runtime-hooks-surface.cts) (1761 dòng)

| Runtime | hooksSurface | Cách đăng ký hook |
|---|---|---|
| Claude | `settings-json` | Ghi vào `.claude/settings.json` → `hooks.*` |
| **Antigravity** 🟢 | `settings-json` | Ghi vào `~/.gemini/antigravity-cli/settings.json` → `hooks.*` (Gemini dialect) |
| Gemini | `settings-json` | Ghi vào `.gemini/settings.json` → `hooks.*` |
| Codex | `codex-hooks-json` | Ghi vào `.codex/hooks.json` (format riêng) |
| Copilot | `copilot-inline` | Inline trong command prompt (không có hook system) |
| OpenCode/Kilo | `none` | Bỏ qua — dùng hook surface riêng |

---

## 7. Capability Registry Pattern — Trung Tâm Mọi Thứ

**33 capability descriptors** trong `capabilities/` directory. Mỗi runtime có file `capability.json` khai báo **mọi thứ** về nó:

```json
// capabilities/antigravity/capability.json (BẠN ĐANG DÙNG CÁI NÀY)
{
  "id": "antigravity",
  "tier": "core",
  "supportTier": 1,
  "runtime": {
    "configHome": {
      "kind": "dot-home-nested",
      "name": "antigravity",
      "parent": ".gemini",
      "env": ["ANTIGRAVITY_CONFIG_DIR"],
      "probe": ["antigravity", "antigravity-ide", "antigravity-cli"],
      "probeExists": "gsd-core/VERSION"
    },
    "localConfigDir": ".agents",
    "configFormat": "settings-json",
    "hooksSurface": "settings-json",
    "hookEvents": "gemini",
    "commandStyle": "slash-hyphen",
    "embeddingMode": "declarative",
    "commandSurface": "slash-file",
    "sandboxTier": "none",
    "extendedHookEvents": [],
    "dispatch": {
      "namedDispatch": "undocumented",
      "nested": "undocumented",
      "maxDepth": "undocumented",
      "background": true,
      "subagentToolkit": "undocumented",
      "backgroundDispatch": "undocumented"
    },
    "hostIntegration": {
      "embeddingMode": "declarative",
      "commandSurface": "slash-file",
      "modelMode": "passive",
      "hookBus": "host",
      "stateIO": "filesystem",
      "transport": "mcp",
      "runtime": "go"
    },
    "artifactLayout": {
      "global": [{
        "kind": "skills",
        "destSubpath": "skills",
        "prefix": "gsd-",
        "nesting": "flat",
        "converter": "convertClaudeCommandToAntigravitySkill"
      }]
    }
  }
}
```

### 7.1 Antigravity: Config Dir Resolution — Cơ Chế 2-Pass Probe

Antigravity là runtime duy nhất dùng `dot-home-nested` với multi-probe. Lý do: Google có 3 sản phẩm cùng nằm dưới `~/.gemini/`:

```
~/.gemini/
  ├── antigravity/        ← Antigravity IDE (legacy)
  ├── antigravity-ide/    ← Antigravity IDE (2.x)
  └── antigravity-cli/    ← Antigravity CLI (bạn đang dùng)
```

**Vấn đề:** Nếu tất cả 3 dir tồn tại, GSD cần chọn ĐÚNG dir mà nó đã install vào.

**Giải pháp: 2-pass probe** (file [runtime-homes.cts](file:///home/dangnd/code/github/gsd-core/src/runtime-homes.cts#L172-L202)):

```
Pass 1 (marker-priority):
  Duyệt probe list: [antigravity, antigravity-ide, antigravity-cli]
  Với mỗi candidate, kiểm tra: ~/.gemini/<candidate>/gsd-core/VERSION tồn tại?
  → Nếu tìm thấy → CHỌN NGAY (đây là dir GSD đã install vào)
  → Ưu tiên: dir có GSD marker thắng dir chỉ tồn tại

Pass 2 (legacy bare-existence):
  Nếu Pass 1 không tìm được (GSD chưa install lần nào):
  Duyệt probe list theo thứ tự → chọn dir đầu tiên tồn tại
  → Ưu tiên theo thứ tự probe: antigravity > antigravity-ide > antigravity-cli

Fallback:
  Nếu không dir nào tồn tại → ~/.gemini/antigravity/ (probe[0])

Env override:
  ANTIGRAVITY_CONFIG_DIR=/custom/path → bỏ qua mọi probe, dùng path này
```

**Ví dụ thực tế (máy bạn):**
```
~/.gemini/antigravity-cli/gsd-core/VERSION  ← TỒN TẠI (GSD đã install ở đây)

Pass 1: probe "antigravity" → ~/.gemini/antigravity/gsd-core/VERSION → KHÔNG
        probe "antigravity-ide" → ~/.gemini/antigravity-ide/gsd-core/VERSION → KHÔNG
        probe "antigravity-cli" → ~/.gemini/antigravity-cli/gsd-core/VERSION → CÓ ✓
→ Resolved: ~/.gemini/antigravity-cli/
```

### 7.2 Antigravity: Ambiguity Detection

**Hàm:** [detectAntigravityDirAmbiguity()](file:///home/dangnd/code/github/gsd-core/src/runtime-homes.cts#L313-L333)

Khi installer/updater chạy, nó kiểm tra:

```typescript
interface AntigravityAmbiguity {
  ambiguous: boolean;       // > 1 dir tồn tại?
  resolved: string;         // Dir GSD sẽ dùng
  presentDirs: string[];    // Tất cả dir tồn tại
  gsdMarkedDirs: string[];  // Dir có gsd-core/VERSION
  envOverridden: boolean;   // ANTIGRAVITY_CONFIG_DIR đã set?
}
```

Nếu `ambiguous = true` → installer cảnh báo user:
- GSD có thể đã install vào dir sai (legacy #213/#217)
- Gợi ý: set `ANTIGRAVITY_CONFIG_DIR` hoặc di chuyển `gsd-core/` sang đúng dir
- Migration framework **KHÔNG tự di chuyển** install giữa các sibling dir (bounded to single configDir)

### 7.3 So Sánh Capability: Claude vs Antigravity vs Gemini

| Field | Claude | **Antigravity** 🟢 | Gemini |
|---|---|---|---|
| `supportTier` | 1 (fully tested) | **1** (fully tested) | 2 (tested, fewer features) |
| `configHome` kind | `dot-home` (~/.claude) | **`dot-home-nested`** (~/.gemini/antigravity-cli) | `dot-home` (~/.gemini) |
| `localConfigDir` | `.claude` | **`.agents`** | `.gemini` |
| `hookEvents` | `claude` (PreToolUse) | **`gemini`** (BeforeTool) | `gemini` (BeforeTool) |
| `embeddingMode` | `imperative` | **`declarative`** | `declarative` |
| `commandSurface` | `slash-file` | **`slash-file`** | `slash-toml` |
| `dispatch.nested` | `true` (depth 5) | **`"undocumented"`** (fail-closed) | `false` (depth 1) |
| `dispatch.background` | `true` | **`true`** | `"undocumented"` |
| `modelMode` | (active) | **`passive`** (không tự chọn model) | (passive) |
| `transport` | (native) | **`mcp`** | (mcp) |
| `execution runtime` | node | **`go`** (Antigravity viết bằng Go) | node |
| `artifactLayout` converter | `convertClaudeCommandToClaudeSkill` | **`convertClaudeCommandToAntigravitySkill`** | `null` |
| `extendedHookEvents` | SubagentStop, Stop, PreCompact, FileChanged | **[]** (không có extended events) | BeforeAgent, AfterAgent, BeforeModel |
| Instruction file | `CLAUDE.md` | **`GEMINI.md`** | `GEMINI.md` |

**Mọi module khác đều TRA CỨU registry này**, không hardcode logic per-runtime:

```
runtime-homes.cts       → registry.runtimes[name].runtime.configHome
runtime-name-policy.cts → registry.runtimes[name].runtime.localConfigDir
runtime-hooks-surface.cts → registry.runtimes[name].runtime.hooksSurface
runtime-artifact-conversion.cts → registry.runtimes[name].runtime.artifactLayout
model-resolver.cts      → runtimeTierDefaults[name] (from model-catalog.json)
install.js              → registry.runtimes[name].runtime.* (tất cả)
```

---

## 8. Host Integration Negotiation (Lớp Sâu Hơn)

**File:** [host-integration.cts](file:///home/dangnd/code/github/gsd-core/src/host-integration.cts)

Đây là lớp **execution environment** — KHÔNG PHẢI AI tool identity. Nó negotiation khả năng thực thi:

```typescript
const result = negotiateHostCapabilities(
  // Host khai báo: "tôi hỗ trợ những gì"
  { embeddingMode: 'declarative', commandSurface: 'slash-toml',
    hookBus: 'host', stateIO: 'filesystem', runtime: 'node' },
  // Engine khai báo: "tôi cần những gì"
  { protocolVersion: 1, axes: {...}, known: ['node', 'bun'] }
);

// result.effective = negotiated axes (intersection)
// result.points = degradation level per interface point
// result.warnings = mismatch warnings
```

**Fail-closed SAFE_DEFAULTS:**
```typescript
const SAFE_DEFAULTS = {
  embeddingMode: 'declarative',      // giả định ít khả năng nhất
  commandSurface: 'prose-only',      // không có slash command
  modelMode: 'passive',              // không chọn được model
  hookBus: 'none',                   // không có hook system
  stateIO: 'session-log-append',     // không ghi file trực tiếp
  transport: 'mcp',                  // qua MCP protocol
  runtime: 'node',                   // Node.js
  subagentToolkit: 'read-only'       // subagent chỉ đọc
};
```

**Sentinel `UNDOCUMENTED`:** Nếu host gửi giá trị `"undocumented"` cho bất kỳ axis nào → fail-closed về `SAFE_DEFAULTS`. Ví dụ: Gemini khai báo `dispatch.background: "undocumented"` → GSD giả định KHÔNG hỗ trợ background dispatch.

---

## 9. Tóm Tắt

```
┌──────────────────────────────────────────────────────────┐
│                    CAPABILITY REGISTRY                    │
│              capabilities/*/capability.json               │
│         (33 descriptors: claude, gemini, codex, ...)      │
│                          │                                │
│    ┌─────────┬──────────┼───────────┬──────────┐        │
│    ▼         ▼          ▼           ▼          ▼        │
│ install.js  runtime-  model-     runtime-   runtime-    │
│             homes     resolver   hooks-     artifact-   │
│             .cts      .cts       surface    conversion  │
│                                  .cts       .cts        │
│    │         │          │           │          │         │
│    ▼         ▼          ▼           ▼          ▼        │
│ Select    Resolve    Choose      Register   Convert     │
│ runtime   config     model       hooks      artifacts   │
│ from CLI  dir path   per tier    per dialect per format  │
└──────────────────────────────────────────────────────────┘

FLOW:  User chọn (install) → Config stamp → Config read (run) → Branch behavior
TRUTH: capability.json là single source of truth cho mỗi runtime
GUARD: Unknown runtime → warning + safe defaults (never crash)
```

**Điểm quan trọng nhất:** GSD **KHÔNG detect** runtime đang chạy. Nó **BIẾT** runtime nào vì user đã chọn tại install time, và giá trị đó được stamp vào config + artifacts. Tại run time, workflow chỉ đọc config key `"runtime"` và branch behavior dựa trên giá trị đó.
