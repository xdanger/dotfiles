# Standards

## Git Commit Standards

All commit messages MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification with [gitmoji](https://gitmoji.dev/) prefix:

```plaintext
<gitmoji> <type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types**:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to our CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files

**Example**:

```plaintext
📝 docs(readme): update installation instructions
```

## Copywriting Standards

Following the [Chinese Copywriting Guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines):

### Application Scope

All of the following content must comply with these copywriting guidelines:

- Conversations with Claude
- Output code (including comments)
- Git commit messages
- Documentation
- User interface text

### Spacing

- Add spaces between Chinese and English text
  - ✔ 在 LeanCloud 上，数据存储是围绕 `AVObject` 进行的
  - ❌ 在 LeanCloud 上，数据存储是围绕`AVObject`进行的
- Add spaces between Chinese text and numbers
  - ✔ 今天出去买菜花了 5000 元
  - ❌ 今天出去买菜花了5000元
- Add spaces between numbers and units
  - ✔ 我家的光纤入屋宽带有 10 Gbps
  - ❌ 我家的光纤入屋宽带有10Gbps
  - ❌ No space needed for degrees/percentages (90°, 15%)

### Punctuation

- Don't repeat punctuation marks
- Use full-width Chinese punctuation for Chinese text
  - ✔ 嗨！你知道嘛？今天前台的小妹跟我说「喵」了哎！
  - ❌ 嗨! 你知道嘛? 今天前台的小妹跟我说 "喵" 了哎!
- Use half-width punctuation for complete English sentences within Chinese text
  - ✔ 乔布斯那句话是怎么说的？「Stay hungry, stay foolish.」
  - ❌ 乔布斯那句话是怎么说的？「Stay hungry，stay foolish。」

### Numbers and Special Terms

- Use half-width characters for numbers
  - ✔ 这个蛋糕只卖 1000 元
  - ❌ 这个蛋糕只卖 １０００ 元
- Use correct capitalization for specialized terms
  - ✔ 使用 GitHub 登录
  - ❌ 使用 github 登录

### AutoCorrect Linter

To ensure compliance with these guidelines, use [AutoCorrect](https://github.com/huacnlee/autocorrect), a linter and formatter for Chinese copywriting.

- Features:
  - Automatically corrects spacing between CJK and Latin characters
  - Fixes punctuation issues (fullwidth/halfwidth)
  - Performs spellcheck for common terms
  - Supports various file formats (Markdown, HTML, JavaScript, etc.)

### Markdown formatting requirements

- Lists must be surrounded by blank lines
- No trailing spaces at end of lines
- Files must end with a single newline character
- Consistent heading hierarchy
- Proper indentation for lists and code blocks
