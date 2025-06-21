# Create a new GitHub Issue

根据要求创建一条新的 GitHub Issue。

## 大致需求

$ARGUMENTS

## 要求和约束

- 根据我的以上需求，给出为此 issue 所服务的分支名的简短描述，格式为：`<type>/<issue_id>-<short_slug>`

  - `type`：遵循 Conventional Commits，从以下选项中选择一个：

    | type     | 主要场景                              | Gitmoji                 |
    | -------- | ------------------------------------- | ----------------------- |
    | build    | 构建系统、依赖升级、DevContainer 变更 | `:construction:` 🏗️     |
    | ci       | 持续集成配置变更                      | `:green_heart:` 💚      |
    | chore    | 杂项 / 工具脚本                       | `:wrench:` 🔧           |
    | docs     | 仅文档                                | `:memo:` 📝             |
    | feat     | 新功能 / 重要增强                     | `:sparkles:` ✨         |
    | fix      | 修复缺陷                              | `:bug:` 🐛              |
    | perf     | 性能优化                              | `:zap:` ⚡️             |
    | refactor | 重构（不改变外部行为）                | `:recycle:` ♻️          |
    | style    | 代码样式（不影响功能）                | `:art:` 🎨              |
    | test     | 添加或修改测试                        | `:white_check_mark:` ✅ |

  - `issue_id`：
    1. 先使用 `{ISSUE_ID}` 占位符
    2. 使用 `gh` 创建完之后获得 issue 编号，再更新这条 issue，更新文中的 `{ISSUE_ID}` 占位符
  - `short_slug`：你需要命名为此 issue 所服务的分支名的简短描述，使用小写字母和连字符 `-` 连接

- issue 标题：格式为 `<Gitmoji> <subject>`
  - `Gitmoji`：`type` 对应的 Gitmoji 表情符号
  - `subject`：以中文为主，避免句号
- issue 描述：用你的语言，使用 Markdown 格式重新描述我的需求：
  - 讲述需求的完整上下文的关键信息
  - 语言简洁明了，避免冗长。对于关键信息，只需要保持引用，无需深入描述
  - 重点描述 Why，无需给出具体方案
