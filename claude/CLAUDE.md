# 项目规范

## 语言要求

- **使用英文**：
  - **范围**：代码、程序文件内的注释、日志、调试信息
  - **原因**：项目本身以英文为主要语言

- **使用中文**：
  - **范围**：文档（例如 README 文件、`docs/` 目录下的文件）、你与我对话时的回复
  - **原因**：对于大语言模型可以节约数量可观的 tokens，而文档随时可以多翻译一份英文版
  - **例外**：为了保持理解一致性，对于包括专有技术术语的专有名词，仍然使用英文表达

- **中英双语**：
  - **范围**：git commit message
  - **原因**：对于无法修改的历史信息，中英双语可以保持最大的信息量、兼容性和灵活性

## 文档组织

### README 文件

- **必须有的**：根目录；所有组件、模块、功能和工具目录
- **语言要求**：中文（对于专有名词保留英文）

#### 必要的章节

1. **用途**：简短描述目录内容（1-3 句话）
2. **使用方法**：如何使用该组件，包括：
   - 环境配置
   - 安装/初始化
   - 编译/构建步骤
   - 如何使用该组件
   - 测试流程
3. **路线图**：条目带状态指示器：
   - ✅ 已完成
   - 🔄 进行中
   - ⏳ 计划中
   - ❌ 已阻塞
   - 🔍 审核中
4. **下一步行动项**：优先级排序的即将进行的任务/功能

## git commit

使用 Gitmoji 来标准化描述所做的更改，并使用中英双语。

### 格式

```plaintext
<gitmoji> [scope?][:?] <description>

[details]

Next steps:

- [future task]
- [potential issues/concerns]

<gitmoji> [scope?][:?] <中文的简要描述>

[所做改动的详细中文说明]

下一步行动项:

- [需要完成的功能]
- [潜在的问题、顾虑]

```

### Gitmoji 规范

对于 `<gitmoji>`，只能从以下表情符号中选择，选择最能描述所做的更改的一个：

| Emoji | Code | 描述 |
|----------|------|------|
| 🎨 | `:art:` | 改进代码的结构/格式 |
| ⚡️ | `:zap:` | 提高性能 |
| 🔥 | `:fire:` | 删除代码或文件 |
| 🐛 | `:bug:` | 修复错误 |
| 🚑️ | `:ambulance:` | 重要热修复 |
| ✨ | `:sparkles:` | 引入新功能 |
| 📝 | `:memo:` | 添加或更新文档 |
| 🚀 | `:rocket:` | 部署内容 |
| 💄 | `:lipstick:` | 添加或更新 UI 和样式文件 |
| 🎉 | `:tada:` | 开始一个项目 |
| ✅ | `:white_check_mark:` | 添加、更新或通过测试 |
| 🔒️ | `:lock:` | 修复安全或隐私问题 |
| 🔐 | `:closed_lock_with_key:` | 添加或更新密钥 |
| 🔖 | `:bookmark:` | 发布/版本标签 |
| 🚨 | `:rotating_light:` | 修复编译器/代码检查工具警告 |
| 🚧 | `:construction:` | 工作进行中 |
| 💚 | `:green_heart:` | 修复 CI 构建 |
| ⬇️ | `:arrow_down:` | 降级依赖项 |
| ⬆️ | `:arrow_up:` | 升级依赖项 |
| 📌 | `:pushpin:` | 将依赖项固定到特定版本 |
| 👷 | `:construction_worker:` | 添加或更新 CI 构建系统 |
| 📈 | `:chart_with_upwards_trend:` | 添加或更新分析或跟踪代码 |
| ♻️ | `:recycle:` | 重构代码 |
| ➕ | `:heavy_plus_sign:` | 添加依赖项 |
| ➖ | `:heavy_minus_sign:` | 移除依赖项 |
| 🔧 | `:wrench:` | 添加或更新配置文件 |
| 🔨 | `:hammer:` | 添加或更新开发脚本 |
| 🌐 | `:globe_with_meridians:` | 国际化和本地化 |
| ✏️ | `:pencil2:` | 修复拼写错误 |
| 💩 | `:poop:` | 编写需要改进的糟糕代码 |
| ⏪️ | `:rewind:` | 还原更改 |
| 🔀 | `:twisted_rightwards_arrows:` | 合并分支 |
| 📦️ | `:package:` | 添加或更新编译后的文件或包 |
| 👽️ | `:alien:` | 由于外部 API 更改而更新代码 |
| 🚚 | `:truck:` | 移动或重命名资源 |
| 📄 | `:page_facing_up:` | 添加或更新许可证 |
| 💥 | `:boom:` | 引入重大变更 |
| 🍱 | `:bento:` | 添加或更新资源 |
| ♿️ | `:wheelchair:` | 改善无障碍访问 |
| 💡 | `:bulb:` | 在源代码中添加或更新注释 |
| 🍻 | `:beers:` | 醉酒编程 |
| 💬 | `:speech_balloon:` | 添加或更新文本和字面量 |
| 🗃️ | `:card_file_box:` | 执行与数据库相关的更改 |
| 🔊 | `:loud_sound:` | 添加或更新日志 |
| 🔇 | `:mute:` | 移除日志 |
| 👥 | `:busts_in_silhouette:` | 添加或更新贡献者 |
| 🚸 | `:children_crossing:` | 改善用户体验/可用性 |
| 🏗️ | `:building_construction:` | 进行架构更改 |
| 📱 | `:iphone:` | 进行响应式设计工作 |
| 🤡 | `:clown_face:` | 模拟功能 |
| 🥚 | `:egg:` | 添加或更新彩蛋 |
| 🙈 | `:see_no_evil:` | 添加或更新 .gitignore 文件 |
| 📸 | `:camera_flash:` | 添加或更新快照 |
| ⚗️ | `:alembic:` | 进行实验 |
| 🔍️ | `:mag:` | 改善搜索引擎优化 |
| 🏷️ | `:label:` | 添加或更新类型 |
| 🌱 | `:seedling:` | 添加或更新种子文件 |
| 🚩 | `:triangular_flag_on_post:` | 添加、更新或删除功能标志 |
| 🥅 | `:goal_net:` | 捕获错误 |
| 💫 | `:dizzy:` | 添加或更新动画和过渡效果 |
| 🗑️ | `:wastebasket:` | 弃用需要清理的代码 |
| 🛂 | `:passport_control:` | 处理与授权、角色和权限相关的代码 |
| 🩹 | `:adhesive_bandage:` | 对非关键问题的简单修复 |
| 🧐 | `:monocle_face:` | 数据探索/检查 |
| ⚰️ | `:coffin:` | 删除无效代码 |
| 🧪 | `:test_tube:` | 添加一个失败的测试 |
| 👔 | `:necktie:` | 添加或更新业务逻辑 |
| 🩺 | `:stethoscope:` | 添加或更新健康检查 |
| 🧱 | `:bricks:` | 与基础设施相关的更改 |
| 🧑‍💻 | `:technologist:` | 改善开发者体验 |
| 💸 | `:money_with_wings:` | 添加赞助或与资金相关的基础设施 |
| 🧵 | `:thread:` | 添加或更新与多线程或并发相关的代码 |
| 🦺 | `:safety_vest:` | 添加或更新与验证相关的代码 |
| ✈️ | `:airplane:` | 改善离线支持 |

### 示例

```plaintext
♻️ Migrate from yarn to pnpm (#1503)

- 🐛 Correct the timestamp comparison logic to handle timezone differences.
- 🔧 Add `pnpm-workspace` configuration
- ♻️ Replace `yarn` with `pnpm` in root package.json
- ⬆️ Bump `next-pwa` dependencies
- 🔥 Remove yarn lockfile
- ✏️ Fix typo in `README.md`
- 📝 Update documentation

Next steps:

- ⏳ Add comprehensive timezone tests
- ⏳ Consider persisting tokens with absolute expiry time
- ⏳ Update documentation with timezone considerations

♻️ 从 yarn 迁移到 pnpm (#1503)

- 🐛 修正时间戳比较逻辑，以处理时区差异
- 🔧 添加 `pnpm-workspace` 配置
- ♻️ 在根 package.json 中将 `yarn` 替换为 `pnpm`
- ⬆️ 升级 `next-pwa` 依赖
- 🔥 移除 yarn lockfile
- ✏️ 修复 `README.md` 中的拼写错误
- 📝 更新文档

下一步行动项:

- ⏳ 添加全面的时区测试
- ⏳ 考虑使用绝对过期时间存储令牌
- ⏳ 更新文档以包含时区注意事项
```

## 文案排版标准

### 中文排版规范

遵循[中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines)的所有内容，主要注意以下几点：

- 中英文之间添加空格：
  - ✅ 使用 Markdown 格式
  - ❌ 使用Markdown格式
- 中文和数字之间添加空格：
  - ✅ 共发现 3 个问题
  - ❌ 共发现3个问题
- 中文使用全角标点符号：
  - ✅ 请检查错误，然后重试。
  - ❌ 请检查错误,然后重试.
- 技术术语使用正确大小写：
  - ✅ 使用 GitHub 账号
  - ❌ 使用 github 账号

### Markdown 排版规范

参照 [markdownlint](https://github.com/DavidAnson/markdownlint) 的编号与规则，特别注意需要遵守以下这些规则：

- `MD001` 标题层级不能跳跃，必须依次递增
- `MD003` 标题风格保持一致
- `MD004` 无序列表标记风格保持一致
- `MD005` 同级列表项缩进相同
- `MD007` 无序列表缩进统一
- `MD009` 不出现行尾空格
- `MD010` 不使用制表符，用空格代替
- `MD011` 链接语法格式正确
- `MD012` 避免连续多个空行
- `MD014` 命令示例格式正确
- `MD018` 标题井号后要有空格
- `MD019` 标题井号后只用一个空格
- `MD020` 封闭式标题内侧有空格
- `MD021` 封闭式标题内侧只用一个空格
- `MD022` 标题前后要有空行
- `MD023` 标题必须顶格写
- `MD025` 文档只有一个一级标题
- `MD026` 标题末尾不加标点
- `MD027` 引用符号后只用一个空格
- `MD028` 引用块之间不留空行
- `MD029` 有序列表编号格式统一
- `MD030` 列表标记后空格数正确
- `MD031` 代码块前后要有空行
- `MD032` 列表前后要有空行
- `MD033` 避免使用内联HTML
- `MD034` 网址要用链接语法包装
- `MD035` 分隔线风格统一
- `MD036` 不用强调代替标题
- `MD038` 代码标记内不留空格
- `MD039` 链接文本内不留空格
- `MD040` 代码块指定编程语言
- `MD041` 文档以一级标题开始
- `MD043` 标题结构符合要求
- `MD044` 专有名词大小写正确
- `MD045` 图片必须有替代文本
- `MD046` 代码块风格统一
- `MD047` 文件以单个换行符结束
- `MD048` 代码围栏符号统一
- `MD049` 强调符号风格统一
- `MD050` 加粗符号风格统一
- `MD051` 链接锚点必须有效
- `MD052` 引用式链接和图片有定义
- `MD053` 引用式定义必须被使用
- `MD054` 链接和图片语法风格统一
- `MD055` 表格分隔符风格统一
- `MD056` 表格列数保持一致
- `MD058` 表格前后要有空行

以下这些规则无需遵守：

- ~~`MD013` 行长度不超过限制~~ —— 允许无限长度
- ~~`MD024` 避免重复的标题内容~~ —— 允许有多个相同内容的标题
- ~~`MD037` 强调标记内不留空格~~ —— 允许有空格
- ~~`MD042` 链接必须有目标~~ —— 允许空链接

### 格式化与验证

- 中文文本：`bunx autocorrect --lint .`
- Markdown：`bunx markdownlint-cli2 .`
- 自动修复：`bunx autocorrect --fix . && bunx markdownlint-cli2 --fix .`
