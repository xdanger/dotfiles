# Create a new GitHub Issue

根据要求创建一条新的 GitHub Issue。

## 大致需求

$ARGUMENTS

## 要求和约束

- 给出创建分支的建议命名，例如 `feature/{ISSUE_ID}-{<简短描述>}`、`bugfix/{ISSUE_ID}-{<简短描述>}` 等。
  - 你需要具体命名出 `{<简短描述>}`，使用小写字母和连字符 `-` 连接。
  - 项目要求 `git commit` 信息要符合 [Gitmoji](https://gitmoji.dev/) 和 [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) 的标准。分支名前缀和 git commit 信息模板应该怎么起？
  - 使用 `gh` 创建完之后获得 Issue 编号后，更新这条 Issue，更新正文中的 `{ISSUE_ID}` 占位符。
