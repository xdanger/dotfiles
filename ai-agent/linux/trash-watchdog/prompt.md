Review `snapshot.json` in the current directory for runaway `trash-cli` processes. Return only a decision matching the supplied JSON schema.

A process is eligible only when the snapshot marks `identity_confirmed`, `threshold_confirmed`, and `evidence_confirmed` as true. Repeated `EROFS` failures while creating `~/.local/share/Trash/info/*.trashinfo` are conclusive evidence. Choose `terminate` only for eligible candidate PIDs; otherwise choose `noop`.

Do not inspect the host directly, invoke `trash`, modify files other than the required decision output, or act on incomplete evidence. A deterministic host-side enforcer will independently revalidate any selected PID before signaling it.
