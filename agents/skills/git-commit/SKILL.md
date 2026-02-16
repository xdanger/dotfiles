---
name: git-commit
description: Create standardized git commits using Conventional Commits with Gitmoji. Use when the user asks to commit changes, create a commit, or says "/commit". Analyzes staged/unstaged diffs and generates semantic commit messages with emoji prefixes.
---

# Git Commit with Gitmoji + Conventional Commits

## Commit Format

```
<Gitmoji> <type>(<scope>)[!]: <subject>

[optional body]

[optional footer(s)]
```

### Example

```
✨ feat(auth): add OAuth2 login flow

- :sparkles: implement `GoogleAuthProvider` with PKCE
- :lock: add CSRF token validation

Closes #42
```

## Commit Types

| Gitmoji | Type       | Purpose                        |
| ------- | ---------- | ------------------------------ |
| ✨      | `feat`     | New feature                    |
| 🐛      | `fix`      | Bug fix                        |
| 📝      | `docs`     | Documentation only             |
| 💄      | `style`    | Formatting/style (no logic)    |
| ♻️      | `refactor` | Code refactor (no feature/fix) |
| ⚡️      | `perf`     | Performance improvement        |
| ✅      | `test`     | Add/update tests               |
| 🏗️      | `build`    | Build system/dependencies      |
| 👷      | `ci`       | CI/config changes              |
| 🔧      | `chore`    | Maintenance/misc               |
| ⏪️      | `revert`   | Revert commit                  |

### Additional Gitmoji (use with closest type)

| Gitmoji | Meaning                  | Type       |
| ------- | ------------------------ | ---------- |
| 🔒️      | Security fix             | `fix`      |
| 🚀      | Deploy                   | `chore`    |
| 🎨      | Improve structure/format | `refactor` |
| 🔥      | Remove code/files        | `chore`    |
| 🚑️      | Critical hotfix          | `fix`      |
| ➕      | Add dependency           | `build`    |
| ➖      | Remove dependency        | `build`    |
| 🔧      | Add/update config        | `chore`    |
| 🗃️      | Database changes         | `feat`     |
| 📦️      | Update compiled/packages | `build`    |
| 🚚      | Move/rename resources    | `chore`    |
| ♿️      | Accessibility            | `feat`     |
| 🌐      | Internationalization     | `feat`     |
| 🏷️      | Add/update types         | `feat`     |

## Subject Line Rules

- Imperative mood, present tense: "add" not "added"
- Lowercase, no period at end
- Max 50 characters
- Wrap code references in backticks
- Focus on WHY, not WHAT

## Breaking Changes

```
♻️ refactor(api)!: change response envelope format

BREAKING CHANGE: `data` key renamed to `result` in all API responses
```

## Body Format

Use Gitmoji shortcodes (`:emoji:`) as bullet prefixes in the body to describe individual changes:

```
- :sparkles: add new endpoint
- :bug: fix null pointer in handler
- :recycle: extract shared validation logic
```

## Workflow

### 1. Analyze changes

```bash
# Check what's staged vs unstaged
git status --porcelain

# View staged diff (preferred)
git diff --staged

# View unstaged diff if nothing staged
git diff
```

### 2. Stage files if needed

```bash
# Stage specific files (preferred over git add -A)
git add path/to/file1 path/to/file2

# Stage by pattern
git add src/components/*
```

Never stage secrets (.env, credentials, private keys).

### 3. Determine commit attributes

From the diff, determine:

- **Gitmoji + Type**: What kind of change?
- **Scope**: What module/area? (optional but preferred)
- **Breaking**: Does it break existing API/behavior?
- **Subject**: One-line summary focusing on WHY

### 4. Commit

```bash
# Single line
git commit -m "✨ feat(auth): add OAuth2 login flow"

# Multi-line with body
git commit -m "$(cat <<'EOF'
✨ feat(auth): add OAuth2 login flow

- :sparkles: implement `GoogleAuthProvider` with PKCE
- :lock: add CSRF token validation

Closes #42
EOF
)"
```

## Best Practices

- One logical change per commit
- Reference issues: `Closes #123`, `Refs #456`
- Co-author: append `Co-Authored-By:` footer when applicable

## Git Safety

- NEVER update git config
- NEVER run destructive commands (--force, hard reset) without explicit request
- NEVER skip hooks (--no-verify) unless user asks
- NEVER force push to main/master
- If commit fails due to hooks, fix and create NEW commit (don't amend)
