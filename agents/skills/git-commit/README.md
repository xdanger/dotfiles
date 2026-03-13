# git-commit

Standardized git commits for AI agents.

This skill teaches the agent to produce [Conventional Commits](https://www.conventionalcommits.org/) with [Gitmoji](https://gitmoji.dev/) prefixes. It reads staged and unstaged diffs, splits changes into atomic logical groups, and writes focused commit messages — so you get a clean, reviewable history without manual formatting.

## What it does

- Analyzes the worktree to understand what changed and why
- Groups changes into atomic commits (one intent per commit)
- Chooses the right type (`feat`, `fix`, `refactor`, …) and Gitmoji
- Writes imperative, concise subject lines with optional body bullets
- Respects repository-local commit conventions when present
- Never stages secrets, never skips hooks, never force-pushes without asking

## What it does not do

- It does not push. Commits stay local until you say otherwise.
- It does not amend previous commits unless explicitly asked.
- It does not invent changes — it only describes what is already in the diff.

## Usage

```bash
npx skills add https://github.com/xdanger/skills --skill git-commit
```

Once installed, ask the agent to commit, or use `/commit`.
