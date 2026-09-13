# Lane A: one-shot CLI workers

- Use headless one-shot execution in the directory selected by the task contract:
  an isolated worktree for implementation, or a stable read-only checkout or
  snapshot for review. Bound codex with an external wall-clock
  timeout; bound grok by both turns and wall clock.
- Select codex credentials through the intended `CODEX_HOME`, remove unintended API-key overrides,
  and inspect the resolved auth mode in the worker's environment before a wide fan-out. Custom
  provider environment keys can outrank both stored login and standard overrides.
- Keep machine-readable output and diagnostics separate. Store final-output files outside the
  worktree so orchestration artifacts do not dirty it.
- Use headless codex review when codex is the reviewer. A review target and a free-form prompt are
  mutually exclusive, so carry the specification in the prompt and tell the reviewer which diff
  to resolve. Validate the base independently; an invalid base can yield a plausible review of the
  wrong range.
- Set grok permissions deliberately. Prefer targeted allowances; pair any broad unattended
  permission mode with a sandbox boundary.
