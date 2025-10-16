根据当前 staged 的文件生成并提交一条符合 Gitmoji 和 Conventional Commits 规范的 commit message。

执行步骤：

1. 运行 git diff --cached 查看所有已 staged 的变更
2. 如果 ARGUMENTS 不为空，运行 gh issue view {ARGUMENTS} 获取 issue 详情
3. 分析变更内容，确定：
   - type: feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert
   - scope: 从 issue 或分支名提取作用域（可选）
   - gitmoji: 选择最符合变更性质的一个 emoji
   - breaking: 是否有破坏性变更
4. 生成 commit message，格式如下：

第一行（subject）：
<emoji> <type>(<scope>)<exclamation-if-breaking>: <description> (#<issue_id>)

示例：✨ feat(auth)! support user login (#1234)

要点：

- description 使用英文，祈使语气（add/fix/update），不超过 50 字符
- 有破坏性变更时在 type 后加感叹号

Body（空一行后）：

- <emoji> change description 1
- <emoji> change description 2
- <emoji> change description 3

如有破坏性变更，末尾添加：

💥 BREAKING CHANGE:

- breaking change description

5. 提交后运行 git status 确认结果

注意事项：

- 只输出 commit message，不附加解释
- 确保 message 准确反映变更的 why 和 what
- 使用主动语态，避免冗余短语
- 如无 staged 文件，输出警告信息
