# git commit

使用以下标准来 `git commit` 当前已 staged 的文件：

1. 使用 `git log` 查看当前分支的 commit 历史，获取修改历史的上下文
2. 仅针对已 staged 的文件进行信息描述，且仅提交已 staged 的文件
3. 使用 gitmoji 来标准化描述所做的更改
4. 在传统 commit 信息的基础上：
   - 使用中英双语留下为什么做了这些改动，以便其他人接手项目时获得更多上下文、少犯同样的问题
   - 留下下一步行动项，以便其他人接手项目时少犯同样的问题

## 格式

```plaintext
<gitmoji> [scope?][:?] <中文的简要描述>

改动：

- [所做改动列表的详细中文说明]

为什么：

- [问题、顾虑等原因列表]

下一步行动项:

- [需要完成的功能]
- [潜在的问题、顾虑]

<gitmoji> [scope?][:?] <description in English>

Changes:

[changes list in detail]

Why:

[issues/concerns list]

Next steps:

- [future task]
- [potential issues/concerns]

```

## gitmoji 规范

对于 `<gitmoji>`，只能从以下表情符号中选择最能描述所做的更改的一个：

| Emoji | Code                          | 描述                               |
| ----- | ----------------------------- | ---------------------------------- |
| 🎨    | `:art:`                       | 改进代码的结构/格式                |
| ⚡️   | `:zap:`                       | 提高性能                           |
| 🔥    | `:fire:`                      | 删除代码或文件                     |
| 🐛    | `:bug:`                       | 修复错误                           |
| 🚑️   | `:ambulance:`                 | 重要热修复                         |
| ✨    | `:sparkles:`                  | 引入新功能                         |
| 📝    | `:memo:`                      | 添加或更新文档                     |
| 🚀    | `:rocket:`                    | 部署内容                           |
| 💄    | `:lipstick:`                  | 添加或更新 UI 和样式文件           |
| 🎉    | `:tada:`                      | 开始一个项目                       |
| ✅    | `:white_check_mark:`          | 添加、更新或通过测试               |
| 🔒️   | `:lock:`                      | 修复安全或隐私问题                 |
| 🔐    | `:closed_lock_with_key:`      | 添加或更新密钥                     |
| 🔖    | `:bookmark:`                  | 发布/版本标签                      |
| 🚨    | `:rotating_light:`            | 修复编译器/代码检查工具警告        |
| 🚧    | `:construction:`              | 工作进行中                         |
| 💚    | `:green_heart:`               | 修复 CI 构建                       |
| ⬇️    | `:arrow_down:`                | 降级依赖项                         |
| ⬆️    | `:arrow_up:`                  | 升级依赖项                         |
| 📌    | `:pushpin:`                   | 将依赖项固定到特定版本             |
| 👷    | `:construction_worker:`       | 添加或更新 CI 构建系统             |
| 📈    | `:chart_with_upwards_trend:`  | 添加或更新分析或跟踪代码           |
| ♻️    | `:recycle:`                   | 重构代码                           |
| ➕    | `:heavy_plus_sign:`           | 添加依赖项                         |
| ➖    | `:heavy_minus_sign:`          | 移除依赖项                         |
| 🔧    | `:wrench:`                    | 添加或更新配置文件                 |
| 🔨    | `:hammer:`                    | 添加或更新开发脚本                 |
| 🌐    | `:globe_with_meridians:`      | 国际化和本地化                     |
| ✏️    | `:pencil2:`                   | 修复拼写错误                       |
| 💩    | `:poop:`                      | 编写需要改进的糟糕代码             |
| ⏪️   | `:rewind:`                    | 还原更改                           |
| 🔀    | `:twisted_rightwards_arrows:` | 合并分支                           |
| 📦️   | `:package:`                   | 添加或更新编译后的文件或包         |
| 👽️   | `:alien:`                     | 由于外部 API 更改而更新代码        |
| 🚚    | `:truck:`                     | 移动或重命名资源                   |
| 📄    | `:page_facing_up:`            | 添加或更新许可证                   |
| 💥    | `:boom:`                      | 引入重大变更                       |
| 🍱    | `:bento:`                     | 添加或更新资源                     |
| ♿️   | `:wheelchair:`                | 改善无障碍访问                     |
| 💡    | `:bulb:`                      | 在源代码中添加或更新注释           |
| 🍻    | `:beers:`                     | 醉酒编程                           |
| 💬    | `:speech_balloon:`            | 添加或更新文本和字面量             |
| 🗃️    | `:card_file_box:`             | 执行与数据库相关的更改             |
| 🔊    | `:loud_sound:`                | 添加或更新日志                     |
| 🔇    | `:mute:`                      | 移除日志                           |
| 👥    | `:busts_in_silhouette:`       | 添加或更新贡献者                   |
| 🚸    | `:children_crossing:`         | 改善用户体验/可用性                |
| 🏗️    | `:building_construction:`     | 进行架构更改                       |
| 📱    | `:iphone:`                    | 进行响应式设计工作                 |
| 🤡    | `:clown_face:`                | 模拟功能                           |
| 🥚    | `:egg:`                       | 添加或更新彩蛋                     |
| 🙈    | `:see_no_evil:`               | 添加或更新 .gitignore 文件         |
| 📸    | `:camera_flash:`              | 添加或更新快照                     |
| ⚗️    | `:alembic:`                   | 进行实验                           |
| 🔍️   | `:mag:`                       | 改善搜索引擎优化                   |
| 🏷️    | `:label:`                     | 添加或更新类型                     |
| 🌱    | `:seedling:`                  | 添加或更新种子文件                 |
| 🚩    | `:triangular_flag_on_post:`   | 添加、更新或删除功能标志           |
| 🥅    | `:goal_net:`                  | 捕获错误                           |
| 💫    | `:dizzy:`                     | 添加或更新动画和过渡效果           |
| 🗑️    | `:wastebasket:`               | 弃用需要清理的代码                 |
| 🛂    | `:passport_control:`          | 处理与授权、角色和权限相关的代码   |
| 🩹    | `:adhesive_bandage:`          | 对非关键问题的简单修复             |
| 🧐    | `:monocle_face:`              | 数据探索/检查                      |
| ⚰️    | `:coffin:`                    | 删除无效代码                       |
| 🧪    | `:test_tube:`                 | 添加一个失败的测试                 |
| 👔    | `:necktie:`                   | 添加或更新业务逻辑                 |
| 🩺    | `:stethoscope:`               | 添加或更新健康检查                 |
| 🧱    | `:bricks:`                    | 与基础设施相关的更改               |
| 🧑‍💻    | `:technologist:`              | 改善开发者体验                     |
| 💸    | `:money_with_wings:`          | 添加赞助或与资金相关的基础设施     |
| 🧵    | `:thread:`                    | 添加或更新与多线程或并发相关的代码 |
| 🦺    | `:safety_vest:`               | 添加或更新与验证相关的代码         |
| ✈️    | `:airplane:`                  | 改善离线支持                       |

## 示例

```plaintext
♻️ 从 `yarn` 迁移到 `pnpm` (#1503)

- 🐛 修正时间戳比较逻辑，以处理时区差异
- 🔧 添加 `pnpm-workspace` 配置
- ♻️ 在根 package.json 中将 `yarn` 替换为 `pnpm`
- ⬆️ 升级 `next-pwa` 依赖
- 🔥 移除 yarn lockfile
- ✏️ 修复 `README.md` 中的拼写错误
- 📝 更新文档

为什么：

- `pnpm` 的性能比 `yarn` 更好
- `next-pwa` 的依赖存在安全漏洞

下一步行动项:

- ⏳ 添加全面的时区测试
- ⏳ 考虑使用绝对过期时间存储令牌
- ⏳ 更新文档以包含时区注意事项

♻️ Migrate from `yarn` to `pnpm` (#1503)

Changes:

- 🐛 Correct the timestamp comparison logic to handle timezone differences.
- 🔧 Add `pnpm-workspace` configuration
- ♻️ Replace `yarn` with `pnpm` in root package.json
- ⬆️ Bump `next-pwa` dependencies
- 🔥 Remove yarn lockfile
- ✏️ Fix typo in `README.md`
- 📝 Update documentation

Why:

- `pnpm`'s performance is better than `yarn`'s
- `next-pwa`'s dependency has a security issue

Next steps:

- ⏳ Add comprehensive timezone tests
- ⏳ Consider persisting tokens with absolute expiry time
- ⏳ Update documentation with timezone considerations

```

## 注意

- 对于文件、目录、命令、函数、变量等的引用，使用 \`\` 包裹
- 下一步的事项必须是在对话的上下文或项目文档中明确提到的，不要自己猜测
