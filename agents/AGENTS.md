# Development Guidelines

## Communication

- Whatever language the user writes in — English, Chinese, or any other — rephrase their message in natural, idiomatic English before proceeding. Present the rephrased version in blockquote format (`>`) so the user can learn from the improvement.
- Before producing a written artifact whose reader is beyond the current conversation — another human, OR an AI executor that will act on it, including subagents you spawn (emails, IM to others, PR/issue descriptions, review comments, docs, AND prompts / specs / mandates for a downstream agent), even as a sub-step, apply the `audience-aware-comms` skill. Calibrate grain to the reader's real capability: for a capable agent, give the goal + constraints + acceptance criteria and trust the method — don't write a mechanical step-by-step. Exemptions: conversational replies to the current user, text the user dictates verbatim, git commit messages, and content run literally by a deterministic interpreter (executed code, configs, schemas, queries, test fixtures) — no reader to model.

## CLI Overrides

- `rm` → `trash`, `mv`(tracked) → `git mv`
- `grep` → `rg`，`find` → `fd`，`cat` → `bat`，`ls` → `eza`
- `sed` → `sd`，`du` → `dust`，`df` → `duf`，`make` → `just`
- Also available: `jq`, `yq`, `fzf`, `glow`, `tldr`, `watchexec`, `difft`, `tokei`, `hyperfine`
- @RTK.md

## MCP Tools (via mcporter)

Initialize by running `npx mcporter list tavily --schema` and `npx mcporter list context7 --schema` to learn their tool schemas. Run `npx mcporter list` to see all available MCP servers.

Prefer MCP tools over built-in equivalents (e.g., use `tavily.tavily_search` instead of built-in WebSearch).

- **tavily** — web search / extract / crawl / research (prefer over built-in WebSearch)
- **context7** — live library docs lookup

Syntax: `npx mcporter call <server>.<tool> key="value" numKey:5`
Auth issues: `npx mcporter auth <server>`

## Git Workflow

**Branches and worktrees**

- When working in a Git repository, create a dedicated worktree before making concrete changes by default. Repository-specific instructions or explicit user direction may override this default.
- Choose the branch type that best fits the work. Every branch created must match `^(build|ci|chore|docs|feat|fix|perf|refactor|style|test)/[a-z0-9]+(-[a-z0-9]+)*$`.
- When using `git` or `gh`, request elevated permissions so the command runs against the system tools and configuration instead of the sandboxed toolchain.

**Commits**

- Use system `git` to create commits so the local signing configuration is applied. The system configuration signs commits with an SSH token; ensure every created commit is signed and verify its signature after committing.
- Follow this format for every commit:

  ```
  <Gitmoji> <type>(<scope>)[!]: <subject>

  - :emoji: change description
  ```

- Gitmoji: ✨feat 🐛fix 📝docs ♻️refactor ✅test 🔧chore
- Subject: ≤50 chars, lowercase imperative, no period, backtick code refs
- Focus on WHY, not WHAT
- Keep commits reasonably split: when you can separate changes by logic or file group, avoid committing them together.

**Shipping**

- Treat “ship the changes,” “ship the branch,” and equivalent requests as an explicit, fully autonomous mandate to complete the entire Git workflow. Do not stop after committing, pushing, or opening the PR.
- Use the existing compliant task branch, or create one without disturbing unrelated work. Commit the task-scoped changes, run the full test suite before the first push, and push to `origin` using the exact same branch name.
- Treat a local test failure as non-blocking only after verifying that it is pre-existing on the current upstream base and unrelated to the change; preserve the evidence. Never weaken tests or absorb unrelated fixes merely to obtain a passing result. PR checks remain subject to the strict `pr-shepherd` GREEN gate; escalate if an upstream failure blocks merging.
- Open a ready-for-review PR and invoke the `pr-shepherd` skill. Own it until it is merged and cleaned up or a genuine human-only blocker is reached: monitor CI and reviews, fix real failures, rerun genuine flakes at most once, address and resolve every review thread, re-check the strict gate after each push, merge only when GREEN, and perform the prescribed branch and worktree cleanup.
- A “ship” request authorizes the final merge without additional confirmation once the strict GREEN gate passes. Use the repository's configured merge and cleanup policies.

**Pull requests, merge, and cleanup**

- When creating a PR, add `xdanger` (GitHub user ID `7087`) as an assignee.
- When creating a ready-to-review PR directly, or when marking a draft PR ready for review, request review from `apps/copilot-pull-request-reviewer`.
- Reply to every code review inline comment after applying the fix or deciding on the response — even if the comment doesn't reflect a real bug.
- Mark resolved inline comments by calling the `resolveReviewThread` mutation via `gh api graphql`.
- Merge PRs with "create a merge commit" by default.
- After a PR is merged, if the branch is not long-lived, leave and remove the associated worktree from its owning repository, then fast-forward the repository's default branch to the corresponding `origin` branch.

## Linter Policy

Never modify linter configs without explicit approval. On lint failure: report rule + location, suggest fix, let user decide.

## Screenshots

- Links like `https://share.cleanshot.com/...` are user-pasted screenshots. Fetch the image (via WebFetch or `curl -sL`) and view it — the user may be on a remote SSH session where direct image paste is unavailable.

## Typography

- Add space between CJK and ASCII/numbers (e.g., "使用 Python 3.11"), except °%
- CJK text: full-width punctuation; English text: half-width punctuation
