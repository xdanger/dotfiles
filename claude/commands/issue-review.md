# Code Review for GitHub Issue: #$ARGUMENTS

你是一位优秀的 code reviewer，擅长审阅由代理（Agentic Coding）自动生成的代码。

## 任务

1. 阅读当前仓库的文档和代码，了解项目背景和目标。
2. 使用 `gh` 读取并了解 Issue #\$ARGUMENTS 的问题或目标。
3. 使用 `git` 查看 staged 文件，了解为此目标已实现的代码。
4. **深度思考** 并回答：当前代码是否满足下列【审核标准】？
5. 按照 **Critical / Major / Minor / Nitpick** 的优先级对问题进行分类。
6. **采用 Markdown 输出**，建议结构：

   - **Overall Assessment**（一句话总结）
   - **Strengths**
   - **Issues**（分级列出）
   - **Recommendations**（必要时附示例代码片段）

7. **保存报告**：将评审结果保存至 `.agent/code-reviews/{YYYYMMDDHHmmss}.md`（使用当前系统时间生成时间戳），并在输出中给出该相对路径。
8. 如有不清晰之处，请先提出 **澄清问题**，不要自行猜测。

---

## 审核标准

### 1. 功能与业务正确性

- **Spec Alignment**：实现是否完整覆盖 Acceptance Criteria？有无“幻觉”API / 数据结构？
- **Edge Cases & Error Paths**：对异常输入、空值、极端场景的处理是否正确？
- **Idempotency & Transactions**：重复执行或失败回滚是否安全？

### 2. 安全与合规（⚠ Blocking）

- **Common Vulns**：SQL/OS 注入、XSS、SSRF 等；SAST/CodeQL 是否全部通过？
- **LLM / Agent Risks**：Prompt Injection、工具链越权、数据走私。
- **Supply-chain**：新增依赖的 SBOM、许可证兼容性（GPL vs MIT）。
- **Regulatory Baseline**：符合 NIST SP 800-218A 等要求（生成记录、完整性签名）。

### 3. 质量、可维护性与团队约定

- **Code Style & Readability**：命名、注释、格式化是否通过 Linter/Formatter？
- **Architectural Consistency**：是否违反既有 ADR 或技术栈？是否引入不必要的新框架？
- **Docs & Metadata**：README、CLAUDE.md、接口文档等是否同步更新？

### 4. 测试与验证自动化

- **Coverage**：关键路径单元/集成测试是否缺失？Mutation/property-based 测试通过率？
- **Regression Guard**：UI 变更是否有视觉回归测试？数据库迁移经影子库验证？
- **CI Stability**：脚本是否在沙箱执行？禁用危险 flag（如 `--dangerously-skip-permissions`）。

### 5. 运行时特性：性能、成本、可观测性

- **Complexity & Hotspots**：N+1 查询、深层循环等性能瓶颈。
- **Concurrency Safety**：锁、原子操作、async/await 正确性。
- **Logging & Tracing**：统一日志格式；敏感信息脱敏；链路追踪完整。

### 6. 治理与未来可演进性

- **Provenance**：模型、版本、prompt 等生成信息是否记录于 Git notes 或 SBOM？
- **Feedback Loop**：本次评审发现的模式性缺陷已纳入 Prompt 模板 / Best Practices。
- **Metrics (前瞻)**：人审时长/行数、回滚率等是否可量化监控？

---

如有任何不确定，**先向我提问** 而非自行假设。
