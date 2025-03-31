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

#### Format

```plaintext
<gitmoji> <type>[scope]: <English description> / <Chinese description>

[English details]
[Chinese details]

Next steps / 下一步:

- [Future task in English] / [对应的中文]
- [Potential issue/consideration in English] / [对应的中文]
```

#### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `perf`: Performance
- `test`: Testing
- `build`: Build system
- `ci`: CI/CD
- `chore`: Maintenance

#### Example

```plaintext
🔧 fix(auth): Fix token expiration calculation / 修复令牌过期计算

Corrected the timestamp comparison logic to handle timezone differences.
修正时间戳比较逻辑，以处理时区差异。

Next steps / 下一步:

- Add comprehensive timezone tests / 添加全面的时区测试
- Consider persisting tokens with absolute expiry time / 考虑使用绝对过期时间存储令牌
- Update documentation with timezone considerations / 更新文档以包含时区注意事项

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
