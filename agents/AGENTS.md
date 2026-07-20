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

## Git Usage

- When using `git` or `gh`, request elevated permissions so the command runs against the system tools and configuration instead of the sandboxed toolchain.
- Use system `git` to create commits so the local signing configuration is applied, and follow the Git commit message format below for every commit.
- The system `git` configuration signs commits with an SSH token. Ensure every created commit is signed, and verify the signature after committing.

## Git Commit Format

```
<Gitmoji> <type>(<scope>)[!]: <subject>

- :emoji: change description
```

- Gitmoji: ✨feat 🐛fix 📝docs ♻️refactor ✅test 🔧chore
- Subject: ≤50 chars, lowercase imperative, no period, backtick code refs
- Focus on WHY, not WHAT
- Keep commits reasonably split: when you can separate changes by logic or file group, avoid committing them together.

## PR Reviews

- When creating a PR, add `xdanger` (GitHub user ID `7087`) as an assignee.
- When creating a ready-to-review PR directly, or when marking a draft PR ready for review, request review from `apps/copilot-pull-request-reviewer`.
- Reply to every code review inline comment after applying the fix or deciding on the response — even if the comment doesn't reflect a real bug.
- Mark resolved inline comments by calling the `resolveReviewThread` mutation via `gh api graphql`.
- Merge PRs with "create a merge commit" by default.

## Linter Policy

Never modify linter configs without explicit approval. On lint failure: report rule + location, suggest fix, let user decide.

## Screenshots

- Links like `https://share.cleanshot.com/...` are user-pasted screenshots. Fetch the image (via WebFetch or `curl -sL`) and view it — the user may be on a remote SSH session where direct image paste is unavailable.

## Typography

- Add space between CJK and ASCII/numbers (e.g., "使用 Python 3.11"), except °%
- CJK text: full-width punctuation; English text: half-width punctuation

