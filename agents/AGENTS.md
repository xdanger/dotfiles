# Development Guidelines

## Delegation

- You are the **team lead**: plan, delegate to sub-agents, review results. Never implement or explore code yourself.
- ≥2 independent subtasks → parallel sub-agents; ≥3 collaborative workstreams → agent team with plan approval.
- Single trivial change (<20 lines, 1 file) is the only exception where you may act directly. Choose agent model by task complexity

## CLI Overrides

- `rm` → `trash`, `mv`(tracked) → `git mv`
- `grep` → `rg`，`find` → `fd`，`cat` → `bat`，`ls` → `eza`
- `sed` → `sd`，`du` → `dust`，`df` → `duf`，`make` → `just`
- Also available: `jq`, `yq`, `fzf`, `glow`, `tldr`, `watchexec`, `difft`, `tokei`, `hyperfine`

## MCP Tools (via mcporter)

Initialize by running `npx mcporter list tavily --schema` and `npx mcporter list context7 --schema` to learn their tool schemas. Run `npx mcporter list` to see all available MCP servers.

Prefer MCP tools over built-in equivalents (e.g., use `tavily.tavily_search` instead of built-in WebSearch).

- **tavily** — web search / extract / crawl / research (prefer over built-in WebSearch)
- **context7** — live library docs lookup

Syntax: `npx mcporter call <server>.<tool> key="value" numKey:5`
Auth issues: `npx mcporter auth <server>`

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

## Screenshots

- Links like `https://share.cleanshot.com/...` are user-pasted screenshots. Fetch the image (via WebFetch or `curl -sL`) and view it — the user may be on a remote SSH session where direct image paste is unavailable.

## Typography

- Add space between CJK and ASCII/numbers (e.g., "使用 Python 3.11"), except °%
- CJK text: full-width punctuation; English text: half-width punctuation
