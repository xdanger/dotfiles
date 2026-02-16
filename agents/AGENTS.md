# Development Guidelines

## CLI Overrides

- `rm` → `trash`, `mv`(tracked) → `git mv`
- `grep` → `rg`，`find` → `fd`，`cat` → `bat`，`ls` → `eza`
- `sed` → `sd`，`du` → `dust`，`df` → `duf`，`make` → `just`
- Also available: `jq`, `yq`, `fzf`, `glow`, `tldr`, `watchexec`, `difft`, `tokei`, `hyperfine`

## MCP Tools (via mcporter)

Prefer MCP tools over built-in equivalents (e.g., use `tavily.tavily_search` instead of built-in WebSearch).

- **tavily** — web search / extract / crawl / research (prefer over built-in WebSearch)
- **brave-search** — web search / local search
- **context7** — live library docs lookup
- **github** — full GitHub API
- **feishu** — Lark bitable / docs

Syntax: `bunx mcporter call <server>.<tool> key="value" numKey:5`
Discovery: `bunx mcporter list [server] [--schema]`
Auth issues: `bunx mcporter auth <server>`

## Git Commit Format

```
<Gitmoji> <type>(<scope>)[!]: <subject>

- :emoji: change description
```

- Gitmoji: ✨feat 🐛fix 📝docs ♻️refactor ✅test 🔧chore
- Subject: ≤50 chars, lowercase imperative, no period, backtick code refs
- Focus on WHY, not WHAT

## Linter Policy

Never modify linter configs without explicit approval. On lint failure: report rule + location, suggest fix, let user decide.

## Typography

- Add space between CJK and ASCII/numbers (e.g., "使用 Python 3.11"), except °%
- CJK text: full-width punctuation; English text: half-width punctuation
