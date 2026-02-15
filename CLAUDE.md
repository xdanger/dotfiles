# Development Guidelines

## CLI Toolbox (Homebrew)

Prefer modern tools over legacy commands:

| Modern | Legacy | Usage |
|--------|--------|-------|
| `rg` | grep | `rg "pattern" path/` |
| `fd` | find | `fd "pattern" path/` |
| `bat` | cat | `bat file.md` |
| `eza` | ls | `eza -la --tree` |
| `sd` | sed | `sd 'before' 'after' file` |
| `jq` | — | `jq '.key' file.json` |
| `yq` | — | `yq '.key' file.yaml` |
| `fzf` | — | `cmd \| fzf` |
| `delta` | diff | git config'd |
| `dust` | du | `dust path/` |
| `duf` | df | `duf` |
| `glow` | — | `glow README.md` |
| `tldr` | man | `tldr tar` |
| `trash` | rm | `trash file` |
| `watchexec` | — | `watchexec -e rs -- cargo test` |
| `just` | make | `just build` |
| `difft` | diff | `difft old.rs new.rs` |
| `tokei` | cloc | `tokei src/` |
| `hyperfine` | time | `hyperfine 'cmd1' 'cmd2'` |

**Critical**: Always use `trash` (not `rm`). Always use `git mv` (not `mv`) for tracked files.

## MCP Tools (via mcporter)

`mcporter`: Shell bridge for MCP servers. Run `bunx mcporter` to get started.

### Discovery

```bash
bunx mcporter list                        # List all servers
bunx mcporter list <server> --schema      # List tools + signatures
```

### Context7 — Live Library Docs

```bash
# 1. Resolve library ID
bunx mcporter call context7.resolve-library-id libraryName="next.js"

# 2. Query docs
bunx mcporter call context7.get-library-docs context7CompatibleLibraryID="/vercel/next.js" topic="middleware"
```

### Tavily — Web Search

```bash
# Quick search
bunx mcporter call tavily.tavily_search query="..." max_results:5 search_depth=basic

# Deep research
bunx mcporter call tavily.tavily_research input="..." model=pro

# Extract page content
bunx mcporter call tavily.tavily_extract urls='["https://example.com"]'
```

### Troubleshooting

- **Auth error**: Ask user to run `bunx mcporter auth <server>` (requires browser)
- **Debug**: Add `--verbose` flag to see full request/response

## Git Standards

### Commit Message Format

```
<Gitmoji> <type>(<scope>)[!]: <subject> [(#issue)]

- :emoji: change 1
- :emoji: change 2

💥 BREAKING CHANGE:
- description
```

**Rules**:
- Gitmoji: ✨feat 🐛fix 📝docs ♻️refactor ✅test 🔧chore
- Subject: ≤50 chars, lowercase verb, no period
- Imperative mood, explain WHY (not just WHAT)
- Backticks for code refs (`file.rs`, `functionName`)
- End with: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`

**Example**:
```
✨ feat(auth): support JWT login

- ✨ add POST /v1/login endpoint
- ✨ introduce jwt for tokens
- ✅ add login tests

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Commit Protocol

1. Run `git status` (no `-uall`) and `git diff` to see changes
2. Run `git log` to check existing commit style
3. Draft concise message focusing on WHY
4. Add relevant files, create commit with HEREDOC:
   ```bash
   git commit -m "$(cat <<'EOF'
   Message here.

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   EOF
   )"
   ```
5. Run `git status` after commit to verify

**Creating PRs**:
1. Run `git status`, `git diff`, `git log` to understand branch changes
2. Run `git diff [base-branch]...HEAD` to see full PR scope
3. Draft PR title (<70 chars) and description
4. Push with `-u` if needed, then `gh pr create` with HEREDOC

## Linter Policy

**NEVER modify `eslint.config.mjs` or linter configs without explicit approval.**

**When linting fails**:
1. Report rule + location
2. Explain why rule exists
3. Suggest fix
4. If rule is inappropriate, explain why → **user decides**
5. Never auto-disable rules to pass tests

## Writing Standards

**Language**: Respond in 中文, keep code/identifiers in English.

**Spacing**:
- CN + EN/number: add space (e.g., "使用 Python 3.11")
- Number + unit: add space, except °%

**Punctuation**:
- Chinese: full-width (，。！？)
- English: half-width (, . ! ?)

**Characters**: Numbers/letters always half-width.

## Critical Reminders

**NEVER**:
- Use `--no-verify` or `--no-gpg-sign` to bypass hooks
- Use `-i` flags (interactive mode not supported)
- Use `--no-edit` with git rebase
- Disable tests instead of fixing them
- Commit code that doesn't compile
- Modify linter config without approval
- Use `mv` for tracked files (always `git mv`)

**ALWAYS**:
- Commit working code incrementally
- Verify with existing code before making assumptions
