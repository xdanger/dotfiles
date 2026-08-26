Audit this Linux host for runaway `trash-cli` processes and remediate only confirmed busy loops.

A process is eligible for remediation only when its identity resolves to the installed `trash-cli` command, it has sustained at least 90% CPU for at least five minutes, and a short bounded syscall sample or equally strong evidence confirms that it is making no progress. Repeated `EROFS` failures while creating `~/.local/share/Trash/info/*.trashinfo` are conclusive evidence.

You may request host-level inspection and exact process signals through automatic approval. Recheck each PID's identity and start time immediately before signaling it. Send `SIGTERM` first; use `SIGKILL` only if the same process remains after a brief wait and ignores `SIGTERM`.

Do not invoke `trash`, delete or move files, stop or restart services, signal parent jobs, or act on incomplete evidence. Finish with a concise no-op or remediation report that includes the relevant PIDs, evidence, and post-action verification.
