# Lỗi đọc cấu hình capability
  Lỗi đường dẫn cấu hình:

  • File ndd-impact-discovery.cjs tìm  gsd-core/ndd/codebase_capability.json  ở project root.
  • File thực tế ở codebase_capability.json.
  • Gây lỗi fallback, đặt  wiki  và  codegraph  thành  available: false .

  Đã cập nhật ndd-impact-discovery.cjs để kiểm tra thêm thư mục  .agents .
  Chạy lại lệnh  /ndd-impact  thành công. Wiki và Codegraph hiện trạng:  available: true .

# Muốn khi cài đặt, chọn luôn luồng ndd hoặc config language
 - có option để ép gsd-core phản hồi/trao đổi bằng tiếng ANh


# Không có các gợi ý chạy các phase tiếp theo


# tôi thấy khi chạy các phase ndd-change, ndd-impact, ndd-discuss-phase, sau đó chạy ndd-plan-phase nhưng lại gọi gsd-new-project
> /ndd-plan-phase

● Bash(node .agents/gsd-core/bin/gsd-tools.cjs ndd discuss-update bug-551e343e8a approved)
● Bash(node .agents/gsd-core/bin/gsd-tools.cjs ndd plan bug-551e343e8a)
● Bash(node .agents/gsd-core/bin/gsd-tools.cjs phase)
● Bash(node .agents/gsd-core/bin/gsd-tools.cjs phase add)
● Bash(node .agents/gsd-core/bin/gsd-tools.cjs phase add "bug-551e343e8a")
● Bash(find . -name "ROADMAP.md")
● Bash(node .agents/gsd-core/bin/gsd-tools.cjs roadmap) (ctrl+o to expand)

> /agents
  ⎿  Exited /agents command

● Bash(node .agents/gsd-core/bin/gsd-tools.cjs docs-init)
● Bash(node .agents/gsd-core/bin/gsd-tools.cjs init)
● Bash(node .agents/gsd-core/bin/gsd-tools.cjs init new-project)
● Read(/home/dangnd/code/dvnh/ipay-micro/.agents/gsd-core/workflows/new-project.md)
● Search(Search ROADMAP.md in lib)
● Search(Search roadmap.md in lib)
● Search(Search ROADMAP in lib)



# Có vẻ như không kích hoạt được gsd-core để chạy subagent thì phải 

# Không hiển thị banner qua các phase như GSD_Core