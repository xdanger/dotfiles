# Project Standards

## Document Organization

### README Files

- **Required in**: All component, module, feature, and utility directories
- **Languages**: Maintain both English (`README.md`) and Chinese (`README.zh.md`) versions

#### Required Sections

1. **Purpose**: Brief description of directory contents (1-3 sentences)
2. **Usage**: How to work with this component, including:
   - Environment setup
   - Installation/initialization
   - Compilation/build steps
   - How to use the component
   - Testing procedures
3. **Roadmap**: Items with status indicators:
   - ✅ Complete
   - 🔄 In progress
   - ⏳ Planned
   - ❌ Blocked
   - 🔍 Under review
4. **Next Steps**: Prioritized upcoming tasks/features

## Content Standards

### Git Commits

Use gitmoji to standardize and describe the changes, in both English and Chinese.

#### Format

```plaintext
<gitmoji> [scope?][:?] <English description>

[details]

Next steps:

- [Future task(s)]
- [Potential issue/consideration]

<gitmoji> [scope?][:?] <中文的简要描述>

[所做改动的详细中文说明]

下一步行动项:

- [需要完成的功能]
- [潜在的问题、顾虑]

```

### Specification

For `<gitmoji>`, you MUST choose one of the following emojis that best describes the changes:

| Emoji | Code | Description |
|-------|------|-------------|
| 🎨 | `:art:` | Improve structure / format of the code |
| ⚡️ | `:zap:` | Improve performance |
| 🔥 | `:fire:` | Remove code or files |
| 🐛 | `:bug:` | Fix a bug |
| 🚑️ | `:ambulance:` | Critical hotfix |
| ✨ | `:sparkles:` | Introduce new features |
| 📝 | `:memo:` | Add or update documentation |
| 🚀 | `:rocket:` | Deploy stuff |
| 💄 | `:lipstick:` | Add or update the UI and style files |
| 🎉 | `:tada:` | Begin a project |
| ✅ | `:white_check_mark:` | Add, update, or pass tests |
| 🔒️ | `:lock:` | Fix security or privacy issues |
| 🔐 | `:closed_lock_with_key:` | Add or update secrets |
| 🔖 | `:bookmark:` | Release / Version tags |
| 🚨 | `:rotating_light:` | Fix compiler / linter warnings |
| 🚧 | `:construction:` | Work in progress |
| 💚 | `:green_heart:` | Fix CI Build |
| ⬇️ | `:arrow_down:` | Downgrade dependencies |
| ⬆️ | `:arrow_up:` | Upgrade dependencies |
| 📌 | `:pushpin:` | Pin dependencies to specific versions |
| 👷 | `:construction_worker:` | Add or update CI build system |
| 📈 | `:chart_with_upwards_trend:` | Add or update analytics or track code |
| ♻️ | `:recycle:` | Refactor code |
| ➕ | `:heavy_plus_sign:` | Add a dependency |
| ➖ | `:heavy_minus_sign:` | Remove a dependency |
| 🔧 | `:wrench:` | Add or update configuration files |
| 🔨 | `:hammer:` | Add or update development scripts |
| 🌐 | `:globe_with_meridians:` | Internationalization and localization |
| ✏️ | `:pencil2:` | Fix typos |
| 💩 | `:poop:` | Write bad code that needs to be improved |
| ⏪️ | `:rewind:` | Revert changes |
| 🔀 | `:twisted_rightwards_arrows:` | Merge branches |
| 📦️ | `:package:` | Add or update compiled files or packages |
| 👽️ | `:alien:` | Update code due to external API changes |
| 🚚 | `:truck:` | Move or rename resources |
| 📄 | `:page_facing_up:` | Add or update license |
| 💥 | `:boom:` | Introduce breaking changes |
| 🍱 | `:bento:` | Add or update assets |
| ♿️ | `:wheelchair:` | Improve accessibility |
| 💡 | `:bulb:` | Add or update comments in source code |
| 🍻 | `:beers:` | Write code drunkenly |
| 💬 | `:speech_balloon:` | Add or update text and literals |
| 🗃️ | `:card_file_box:` | Perform database related changes |
| 🔊 | `:loud_sound:` | Add or update logs |
| 🔇 | `:mute:` | Remove logs |
| 👥 | `:busts_in_silhouette:` | Add or update contributor(s) |
| 🚸 | `:children_crossing:` | Improve user experience / usability |
| 🏗️ | `:building_construction:` | Make architectural changes |
| 📱 | `:iphone:` | Work on responsive design |
| 🤡 | `:clown_face:` | Mock things |
| 🥚 | `:egg:` | Add or update an easter egg |
| 🙈 | `:see_no_evil:` | Add or update a .gitignore file |
| 📸 | `:camera_flash:` | Add or update snapshots |
| ⚗️ | `:alembic:` | Perform experiments |
| 🔍️ | `:mag:` | Improve SEO |
| 🏷️ | `:label:` | Add or update types |
| 🌱 | `:seedling:` | Add or update seed files |
| 🚩 | `:triangular_flag_on_post:` | Add, update, or remove feature flags |
| 🥅 | `:goal_net:` | Catch errors |
| 💫 | `:dizzy:` | Add or update animations and transitions |
| 🗑️ | `:wastebasket:` | Deprecate code that needs to be cleaned up |
| 🛂 | `:passport_control:` | Work on code related to authorization, roles and permissions |
| 🩹 | `:adhesive_bandage:` | Simple fix for a non-critical issue |
| 🧐 | `:monocle_face:` | Data exploration/inspection |
| ⚰️ | `:coffin:` | Remove dead code |
| 🧪 | `:test_tube:` | Add a failing test |
| 👔 | `:necktie:` | Add or update business logic |
| 🩺 | `:stethoscope:` | Add or update healthcheck |
| 🧱 | `:bricks:` | Infrastructure related changes |
| 🧑‍💻 | `:technologist:` | Improve developer experience |
| 💸 | `:money_with_wings:` | Add sponsorships or money related infrastructure |
| 🧵 | `:thread:` | Add or update code related to multithreading or concurrency |
| 🦺 | `:safety_vest:` | Add or update code related to validation |
| ✈️ | `:airplane:` | Improve offline support |

#### Example

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

接下来需要做的:

- ⏳ 添加全面的时区测试
- ⏳ 考虑使用绝对过期时间存储令牌
- ⏳ 更新文档以包含时区注意事项

```

### Chinese-English Text

Follow [Chinese Copywriting Guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines) for all content:

#### Key Rules

- Add spaces between Chinese and English:
  - ✅ 使用 Markdown 格式
  - ❌ 使用Markdown格式

- Add spaces between Chinese and numbers:
  - ✅ 共发现 3 个问题
  - ❌ 共发现3个问题

- Use full-width punctuation with Chinese:
  - ✅ 请检查错误，然后重试。
  - ❌ 请检查错误, 然后重试.

- Use proper capitalization for technical terms:
  - ✅ 使用 GitHub 账号
  - ❌ 使用 github 账号

## Formatting & Validation

### Markdown Requirements

- No trailing spaces
- Single newline at end of file
- Consistent heading hierarchy
- Code blocks specify language
- Lists surrounded by blank lines

### Exceptions to Standard Rules

- MD013: Line length limit not enforced
- MD024: Allows multiple headings with same content
- MD042: Empty links permitted
- MD022: Headings without surrounding blank lines permitted
- MD037: Spaces inside emphasis markers permitted

### Validation

- Chinese text: `bunx autocorrect --lint .`
- Markdown: `bunx markdownlint-cli2 .`
- Fix automatically: `bunx autocorrect --fix . && bunx markdownlint-cli2 --fix .`
