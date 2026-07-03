# Foundation Scan — GSD Core (Bản quét nền tảng — GSD Core)

> **PR1: Phân tích lượt đầu tiên chỉ từ tài liệu.**
> Nguồn: [README.md](file:///home/dangnd/code/github/gsd-core/README.md), tất cả các file trong [docs/explanation/](file:///home/dangnd/code/github/gsd-core/docs/explanation)

---

## 1. Project Identity (Định danh dự án)

- **gsd-core là gì?** Một Framework meta-prompting, context-engineering, và spec-driven development nhẹ nhàng, điều hướng các AI coding agents thông qua một vòng lặp phase kỷ luật.
- **Nó giải quyết vấn đề gì?** **Context rot** — "sự suy giảm chất lượng tích tụ khi một AI lấp đầy context window của nó" — nơi các hướng dẫn, ràng buộc và quyết định kiến trúc ban đầu bị pha loãng khi cuộc hội thoại phát triển, khiến mô hình âm thầm tạo ra đầu ra chất lượng thấp hơn.
- **Đối tượng người dùng/nhà phát triển mục tiêu là ai?** Các nhà phát triển sử dụng AI coding agents (Claude Code, Codex, Gemini CLI, Kimi CLI, Kilo, Copilot, Cursor, Windsurf, và nhiều hơn nữa) làm việc trên các tác vụ đủ phức tạp để Context rot trở thành một rủi ro thực sự — các tính năng đa file, refactor chéo, và công việc kéo dài nhiều giờ hoặc nhiều phiên.

---

## 2. Core Concepts & Terminology (Các khái niệm cốt lõi & Thuật ngữ)

| Thuật ngữ | Định nghĩa / Cách dùng của tác giả |
|---|---|
| **Context rot** | "sự suy giảm chất lượng tích tụ khi một AI lấp đầy context window của nó" — mô hình tiếp tục trả lời nhưng chất lượng "âm thầm suy giảm", mâu thuẫn với các quyết định trước đó, sai lệch phong cách, ảo tưởng tên file. Được mô tả là "một thuộc tính cơ bản của cách transformer attention hoạt động trên các chuỗi dài." |
| **Fresh-context subagent** | Một Agent chuyên biệt "bắt đầu với một context window sạch sẽ, được giới hạn phạm vi cẩn thận" (thường là 200K tokens) và "báo cáo kết quả của nó lại cho một orchestrator mỏng." Giải pháp cấu trúc cốt lõi cho Context rot. |
| **Phase** | "một đơn vị công việc trong một milestone" — di chuyển qua vòng lặp: Discuss → Plan → Execute → Verify → Ship. Có một mục tiêu, một tập hợp các yêu cầu, và một tập hợp các kế hoạch. |
| **Milestone** | "một chu kỳ phiên bản — một mức tăng có ý nghĩa, có thể phát hành của dự án." Có tên, số phiên bản và các yêu cầu. Hoàn tất khi tất cả các phase của nó được ship. |
| **Phase loop** | Chu kỳ lặp lại: `Discuss → (UI design) → Plan → Execute → Verify → Ship`. "Mỗi bước tồn tại vì nó bảo vệ chống lại một loại thất bại cụ thể mà bước trước đó không thể ngăn chặn đơn lẻ." |
| **Spec-driven development** | "mỗi phase tạo ra các cấu trúc artefacts trước khi quá trình thực thi bắt đầu" — CONTEXT.md, RESEARCH.md, PLAN.md — để các executors làm việc từ "một bản mô tả chính xác… không phải là sự diễn giải lại một cuộc hội thoại dài." |
| **Meta-prompting** | "bản thân các định nghĩa agent là các prompt được thiết kế cẩn thận, không phải là các hướng dẫn tùy hứng." Các file trong `workflows/` và `agents/` "mã hóa những kiến thức quý giá về cách phân chia phạm vi nhiệm vụ, những gì cần xác minh và khi nào cần báo cáo lên cấp trên." |
| **Orchestrator** | Phiên làm việc chính mỏng "không bao giờ chạm vào các file nguồn. Nó spawn các agents, thu thập kết quả của chúng, cập nhật trạng thái chung và điều hướng đến bước tiếp theo." |
| **Wave-based execution** | Mô hình thực thi song song nơi các kế hoạch được nhóm thành các dependency waves. Các kế hoạch không có dependency tạo thành Wave 1 (song song); các kế hoạch phụ thuộc phải chờ các wave trước đó. |
| **Capability** | Một đơn vị mở rộng (của bên thứ nhất hoặc bên thứ ba) có thể ship các skills, agents, hooks, MCP servers, và command modules. Được hợp nhất tại runtime thông qua một overlay model. |
| **Artifact parity** | "một capability của bên thứ ba có thể ship các bề mặt thực thi tương tự như GSD Core." Lựa chọn thiết kế: sự tương đồng đầy đủ cho những gì có thể được ship, nhưng không phải là sự tin tưởng đối xứng. |
| **Capability overlay** | Các capabilities của bên thứ ba được hợp nhất tại runtime lên trên Registry của bên thứ nhất đã bị đóng băng thông qua `loadRegistry`. "Một capability được cài đặt không phải là một công dân hạng hai." |
| **Context engineering** | Kỷ luật rộng hơn: "những gì một AI agent nhận được trong context window của nó quan trọng không kém gì cấp bậc mô hình hay chất lượng prompt." Được vận hành thông qua context isolation và context hygiene. |
| **`.planning/`** | Thư mục hệ thống file mang tất cả các durable state — STATE.md, CONTEXT.md, PLAN.md, RESEARCH.md, config.json. "Kiến thức tồn tại sau các context resets." |
| **`STATE.md`** | "xương sống của hệ thống này" — ghi lại vị trí dự án, các quyết định đang hoạt động, các blockers và các chỉ số tiến độ. Mọi workflow đều đọc nó để định hướng và viết lại vào nó. |

---

## 3. Architecture Overview (Tổng quan kiến trúc)

- **Mô hình Orchestrator → Agent**: Một orchestrator mỏng (file workflow `.md`) tải context thông qua `gsd-tools.cjs init`, giải quyết mô hình thông qua `gsd-tools.cjs resolve-model`, spawn các agents chuyên biệt, thu thập kết quả và cập nhật trạng thái thông qua `gsd-tools.cjs state update`. Orchestrator "không suy luận về domain, không viết code và không diễn giải kết quả vượt quá việc điều hướng."
- **Các danh mục Agent**: Researchers (4 song song), Synthesisers, Planners, Checkers (lên đến 3 lần lặp lại sửa đổi), Executors (song song trong các waves), Verifiers, Mappers (4 sub-probes song song), và Auditors. Mỗi agent nhận được một fresh context window và chỉ những quyền tool mà nó cần.
- **Luồng dữ liệu**: Đường ống là `research → plan → execute → verify`, với tất cả các intermediate artefacts được lưu trữ dưới dạng Markdown/JSON trong `.planning/`. Các agents đọc artefacts từ các bước trước và viết artefacts cho các bước sau.
- **Tính song song dựa trên Wave**: Các kế hoạch được nhóm theo dependencies vào các waves. Các Executors trong cùng một wave chạy song song trên các mối quan tâm không chồng chéo. Việc khóa `STATE.md` nguyên tử và các lượt chạy hook trên mỗi wave ngăn chặn xung đột ghi.
- **Capability registry**: Các capabilities của bên thứ nhất được đóng băng tại thời điểm phát hành vào `capability-registry.cjs`. Các capabilities của bên thứ ba hợp nhất tại runtime thông qua `loadRegistry({ includeInstalled: true })`. Một hàm `buildRegistry` chuẩn hóa hiện thực hóa cả hai.

---

## 4. Design Decisions (Các quyết định thiết kế)

- **Fresh-context subagents thay vì làm việc in-context**: "hầu hết công việc trong một phiên coding không cần thiết phải diễn ra trong context chính." Công việc nặng nhọc chạy trong các agents bắt đầu sạch sẽ; orchestrator vẫn tinh gọn. Đây "không phải là một giải pháp tình thế cho Context rot. Nó là một giải pháp cấu trúc."
- **Hệ thống file như trạng thái chung thay vì bộ nhớ hội thoại**: "Context engineering yêu cầu kiến thức phải tồn tại sau các context resets. GSD Core sử dụng hệ thống file cho việc này." Tất cả các đầu ra có ý nghĩa đều đi vào `.planning/` dưới dạng Markdown/JSON mà con người có thể đọc được. "Các agents không dựa vào bộ nhớ; chúng dựa vào file."
- **Artifact parity đầy đủ cho các capabilities của bên thứ ba, không có sandbox**: Người duy trì đã chọn sự tương đồng đầy đủ (bên thứ ba có thể ship hooks, MCP servers, command modules) thay vì chỉ khai báo. "Sự tương đồng đầy đủ của artifact và sandboxing có ý nghĩa đang mâu thuẫn với nhau. Người duy trì đã chọn sự tương đồng đầy đủ." Đánh đổi: "không có sandbox, và tài liệu này nói thẳng như vậy."
- **Import URL phi tập trung thay vì registry tập trung**: Từ chối mô hình đánh giá tập trung kiểu Obsidian. "Yêu cầu một maintainer-review PR for mỗi capability của bên thứ ba là nút thắt cổ chai." Import URL/git/npm/tarball ship mà không cần một Registry được quản lý. Một Registry được quản lý vẫn là một câu hỏi mở.
- **Cài đặt không bao giờ chạy code**: "việc tải xuống và dàn dựng capability này sẽ không thực thi bất kỳ code nào của nó." Chỉ sao chép dàn dựng. Không có tương đương với `postinstall`. Điều này làm cho bước đồng ý trở nên có ý nghĩa.
- **Bên thứ nhất luôn thắng trong cấu trúc overlay**: "Khi một overlay của bên thứ ba xung đột với một capability của bên thứ nhất, overlay đó sẽ bị từ chối — không bao giờ có chiều ngược lại." Một overlay chỉ có thể thêm vào, không bao giờ được ghi đè.
- **Các cổng (Gates) thất bại ở trạng thái đóng, các bước (Steps) thất bại ở trạng thái mở**: Các bước/đóng góp của một overlay bị hỏng sẽ bị bỏ qua (fail-open). Nhưng một cổng bị hỏng "chặn vòng lặp" với một cổng chặn tổng hợp (fail-closed), bởi vì "việc không tải được một cổng có nghĩa là bạn không được tiến hành."
- **Phát hiện prompt injection chỉ mang tính cảnh báo theo mặc định**: Việc phát hiện được "ghi lại nhưng không bị chặn" — "một lựa chọn có chủ đích nhằm duy trì tính liên tục của workflow với chi phí là không dừng ngay khi phát hiện." Chặn có thể chọn tham gia thông qua `security.injection_blocking`.
- **Tự động cập nhật bị tắt theo mặc định**: Yêu cầu sự đồng ý lại khi các bề mặt thực thi thay đổi. Trực tiếp giải quyết kịch bản bị đánh cắp PAT trong VS Code.

---

## 5. Stated Design Principles (Các nguyên tắc thiết kế đã nêu)

- **"Context engineering: những gì một AI agent nhận được trong context window của nó quan trọng không kém gì cấp bậc mô hình hay chất lượng prompt."** — Nguyên tắc nền tảng.
- **"Orchestrator không bao giờ chạm vào các file nguồn."** — Sự phân tách nghiêm ngặt: orchestrator điều hướng, các agents làm công việc nặng nhọc.
- **"Fresh context đảm bảo mỗi agent suy luận rõ ràng. Spec-driven artefacts đảm bảo mỗi agent suy luận về đúng thứ. Meta-prompting đảm bảo mỗi agent biết cách suy luận tốt về nó."** — Ba kỷ luật bổ trợ cho nhau.
- **"Phòng thủ theo chiều sâu. Không có quyền kiểm soát đơn lẻ nào được coi là hoàn hảo."** — Nguyên tắc tổ chức an ninh.
- **"Artifact parity không phải là trust parity."** — Luận điểm trung tâm của mô hình tin cậy: các capabilities của bên thứ ba có được sự tương đồng đầy đủ về artifact nhưng không phải sự tin tưởng đối xứng.
- **"Khi nghi ngờ, hãy chia nhỏ."** — Nguyên tắc xác định phạm vi Phase. "Một phase nhỏ hơn hoàn thành nhanh hơn, xác minh tự tin hơn và giúp điều chỉnh hướng đi dễ dàng hơn."
- **"Vòng lặp là một nhịp điệu, không phải một sự ràng buộc."** — Mỗi bước ngăn chặn những thất bại mà "thực sự tốn kém để sửa chữa sau này."
- **"Bỏ qua, đừng làm sập (crash)."** — Nguyên tắc hợp nhất: "một overlay tồi sẽ bị bỏ qua với một cảnh báo; vòng lặp luôn nhận được một Registry có thể sử dụng."
- **"Cài đặt không bao giờ chạy code, chấm hết."** — Dàn dựng chỉ là sao chép; không có tương đương với `postinstall`.
- **Trung thực về các đánh đổi**: Nhiều tài liệu nêu rõ những gì hệ thống *không* bảo vệ chống lại — "GSD không giả vờ rằng điều này giống như việc hoàn toàn không chạy code."

---

## 6. Open Questions (Các câu hỏi mở)

- **`gsd-tools.cjs` thực sự hoạt động như thế nào bên trong?** Tài liệu tham chiếu nó như là CLI tool để tải context (`init`), giải quyết mô hình (`resolve-model`), và quản lý trạng thái (`state update`, `state patch`, `state advance-plan`), nhưng việc triển khai, bề mặt API và xử lý lỗi của nó không được giải thích — tài liệu chỉ mô tả vai trò của nó trong mô hình điều phối.
- **Định dạng/schema cụ thể của JSON context payload là gì?** Tài liệu nói `gsd-tools.cjs init` tạo ra "một JSON context payload nhỏ gọn (tóm tắt dự án, mục tiêu phase, cấu hình liên quan)" nhưng các trường thực tế, cấu trúc và tính toán token-budget không được ghi lại trong các tài liệu giải thích.
- **`dynamic_routing` hoạt động như thế nào trong thực tế?** Được đề cập như một tính năng tiết kiệm chi phí "bắt đầu mọi agent trên một phân khúc rẻ hơn và chỉ leo thang khi có lỗi mềm" — nhưng các tiêu chí leo thang, điều gì cấu thành một "lỗi mềm", và chuỗi dự phòng không được giải thích trong các tài liệu giải thích.
- **12 loop extension points là gì?** Được tham chiếu là được định nghĩa trong "ADR-857" — mô hình tin cậy capability và mô hình overlay thảo luận về các cổng, các bước và các đóng góp đăng ký vào các extension points, nhưng danh mục extension point thực tế không được liệt kê trong các tài liệu giải thích.
- **Agent `gsd-codebase-mapper` hoạt động như thế nào?** Được liệt kê là có "4 sub-probes song song" trong danh sách agent, nhưng mục đích của nó, những gì nó ánh xạ và cách đầu ra của nó được tiêu thụ không được mô tả trong các tài liệu giải thích.
- **Cấu trúc của `ROADMAP.md` và `REQUIREMENTS.md` là gì?** Tài liệu vòng lặp phase tham chiếu `ROADMAP.md` cho các mục tiêu phase và phần xác minh đề cập đến "REQ-IDs", nhưng định dạng và vòng đời của các artefacts này không được mô tả trong các tài liệu giải thích.
- **Consent store (`consent.json`) tương tác với các quy trình làm việc của nhóm như thế nào?** Mô hình tin cậy mô tả nó là do người dùng sở hữu và cục bộ trên máy, nhưng các tác động đối với các nhóm chia sẻ một kho lưu trữ dự án (các thành viên khác nhau có trạng thái đồng ý khác nhau, việc tiếp nhận thành viên mới) không được giải quyết.

---

## Success criteria check (Kiểm tra tiêu chí thành công):
- ✅ Mọi phần đều được điền — không cần dấu hiệu "❌ Không tìm thấy"
- ✅ Không có mã nguồn nào được tham chiếu — chỉ tài liệu
- ✅ Các khái niệm cốt lõi bao gồm các trích dẫn trực tiếp từ tác giả
- ✅ Phần Câu hỏi mở xác định 7 khoảng trống
