# Create a new GitHub Issue

## Task & Context

我使用 GitHub Issues 管理项目需求和任务，每条 issue 的生命周期如下：

1. **定义需求**：用一条 issue 来描述要解决的问题
2. **探索方案**：探索最佳的实现方案，总结成 high-level 的方案，并回复 issue
3. **定义接口**：设计并实现架构、协议、接口，编写注释与相关 README 文档，提交相关 commit 以使 issue 下能看到相关实现的接口和文档
4. **验收标准**：设计测试方案以评估实现质量，并回复 issue
5. **编写代码**：编写实现与测试代码，提交相关 commit 以使 issue 下能看到相关实现
6. **审核实现**：在了解要解决的问题与实现方案的情况下，根据测试方案 review 上一步的实现与测试代码
7. **创建 PR**：git 提交、推送，并创建 Pull Request
8. **合并 & 关闭 PR**：在 PR 通过审核后，进行合并、关闭 issue

你的任务为：完成以上**第 1 步** —— 根据“§ Objective“，按“§ Standards”创建一条新的 GitHub Issue

## Objective

$ARGUMENTS

## Standards

- 根据以上目标，给出为此 issue 所服务的分支名的简短描述，格式为：`<type>/<issue_id>-<short_slug>`

  - `type`：遵循 [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)，从以下选项中选择一个：

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
- issue 描述：用你的语言，使用 [GitHub Markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) 格式重新描述我的需求：
  - 讲述需求的完整上下文的关键信息，旨在让所有人都了解要做什么以及为什么
  - **重点描述 Why**，无需给出具体方案
  - 语言简洁明了、避免冗长，对于关键信息只需要保持引用，无需深入描述
