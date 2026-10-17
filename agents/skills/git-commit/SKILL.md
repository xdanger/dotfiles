---
name: git-commit
description: Create atomic git commits with Conventional Commits and Gitmoji. Use when the user asks to commit changes, create a commit, or says "/commit". Review staged and unstaged diffs, split changes into logical groups, and write focused commit messages that follow repository-local conventions.
---

# Git Commit

Repository-local commit conventions take precedence. Otherwise use:

```text
<Gitmoji> <type>(<scope>)[!]: <subject>

[optional body]

[optional footer(s)]
```

## Workflow

1. **Inspect** both staged and unstaged changes (`git status`, `git diff --staged`,
   `git diff`).
2. **Group** into the fewest commits that each carry one intent: describable without
   "and", revertible on its own. Keep tests with the code they cover and lockfiles with
   their dependency change; separate behavior changes from formatting, renames, and docs.
3. **Stage** one group at a time by path, or with `git add -p` when a file mixes concerns.
   Stage everything at once only when it is a single change. Never stage secrets.
4. **Write** the message:
   - Closest type and Gitmoji: `✨ feat`, `🐛 fix`, `♻️ refactor` (no behavior change),
     `✅ test`, `📝 docs`, `🔧 chore`.
   - Subject: imperative, lowercase, no trailing period, ideally ≤50 characters; add a
     scope when it helps.
   - Breaking change: `!` plus a `BREAKING CHANGE:` footer.
   - Body bullets only when they aid review; issue refs and `Co-Authored-By:` go in
     footers.
5. **Order** multiple commits: preparatory refactors → config/infra → feature or fix →
   docs/formatting. Each commit leaves the tree coherent.

```text
✨ feat(auth): add OAuth2 login flow

- :sparkles: implement `GoogleAuthProvider` with PKCE
- :lock: add CSRF token validation

Closes #42
```

## Safety

Don't change git config, run destructive commands, or bypass hooks unless asked. When a
`pre-commit` or `commit-msg` hook rejects the commit, nothing was committed: fix the cause
and commit again rather than `--amend`, which would rewrite the previous commit. A
`post-commit` hook runs after the commit exists, so check `git log -1` before retrying.
