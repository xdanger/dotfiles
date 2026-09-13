# Lane B: persistent codex app-server

- Spawn a dedicated `codex app-server --listen stdio://` child per `CODEX_HOME` and own its
  lifetime; never
  attach orchestration to an operator's already-running daemon or its control socket, where a
  supervisor bug can disturb interactive sessions. One process is one credential profile; a
  multi-account fleet is N processes. If a socket listener is unavoidable, prefer a private Unix
  socket, authenticate WebSocket listeners, protect token files, and tunnel non-loopback traffic.
- Treat stdio as newline-delimited JSON-RPC and Unix or TCP listeners as WebSocket transports. Do
  not reuse stdio framing on sockets.
- Generate protocol bindings from the installed binary (`codex app-server generate-ts` /
  `codex app-server generate-json-schema`); they are version-locked to that binary by construction. Regenerate on
  every codex upgrade and treat a resulting compile break as the upgrade signal. Do not build the
  supervisor on experimental-marked methods or fields.
- Complete the `initialize`/`initialized` handshake and assert that the returned `codexHome`
  equals the intended profile before dispatching work. The home assertion does not establish
  which credential the process will spend: launch the server with a sanitized environment,
  removing unintended API-key and custom-provider environment variables, because such keys
  outrank the profile's stored login and `codex login status` does not report them.
- Start one thread per task via `thread/start` with the contract-selected task directory as `cwd` and per-thread sandbox,
  approval policy, and config overrides. Start threads non-ephemeral so they persist, and record
  each thread ID in fleet state. Thread creation can restart the configured MCP server set and is
  not free: reuse threads for serialized follow-up work, and measure contention before assuming
  parallel threads produce linear throughput.
- `turn/start` returns an in-progress handle immediately; the turn's only completion signal is
  the `turn/completed` notification carrying terminal status. `turn/steer` requires the
  `expectedTurnId` from that handle — an intended guard against steering the wrong turn.
  Budgets are supervisor-owned: bound each turn by wall clock, escalate `turn/interrupt`, and
  only as a last resort kill the process, which takes every thread in it.
- A server crash takes down all its threads. On restart or reconnection, resume from persisted
  thread IDs via `thread/resume`. A lost connection is not a dead server: when the process
  survived, the original turn may still be running, so read the resumed thread's status and
  `turn/interrupt` any live turn before dispatching anything — otherwise two turns race the same
  worktree. Then reconcile before retrying: a turn that performed side effects before the
  crash — commits, file mutations, spawned processes — repeats them if replayed verbatim, and
  replayed thread history is lossy (not every command execution is persisted), so treat the
  worktree and external state as the authority on what already happened. Continue from that
  reconciled checkpoint with a brief scoped to the remainder, retrying only operations known to
  be idempotent, rather than re-issuing the original turn.
