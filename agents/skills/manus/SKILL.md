---
name: manus
description: "Use Manus for async tasks that exceed local tools: broad research, deliverables such as PDF/PPT/CSV, connector-based work, or long multi-step jobs. Create a task, poll or receive webhooks, then fetch results with the bundled script."
---

# Manus

Prefer Manus only when local tools or sub-agents are not enough.

Docs: `https://open.manus.im/docs`

## Rules

1. Give Manus a complete prompt with scope, output format, and constraints
2. Do not include secrets or unnecessary personal data
3. Prefer `manus-1.6`; use `-lite` for cheaper exploratory work
4. Continue multi-turn tasks with `--task-id`

## Script

```bash
SCRIPT="<SKILL_DIR>/scripts/manus_client.mjs"
```

Create:

```bash
node "$SCRIPT" create \
  --prompt "Your prompt" \
  --mode agent \
  --profile manus-1.6
```

Optional:

- `--attachment /path/to/file` repeatable
- `--connector <uuid>` repeatable
- `--task-id <id>`
- `--label <text>`
- `--locale zh-CN`
- `--interactive`

Status:

```bash
node "$SCRIPT" status --task-id <task_id>
```

Result:

```bash
node "$SCRIPT" result --task-id <task_id>
```

List:

```bash
node "$SCRIPT" list --limit 10 --status completed
```

Delete:

```bash
node "$SCRIPT" delete --task-id <task_id>
```

If Manus asks a follow-up question:

```bash
node "$SCRIPT" create \
  --task-id <original_task_id> \
  --prompt "User reply"
```

References:

- API: `<SKILL_DIR>/references/api.md`
- Setup: `<SKILL_DIR>/references/setup.md`
- Webhook helper (Node): `<SKILL_DIR>/scripts/webhook-transform.mjs`
- Webhook helper (Python): `<SKILL_DIR>/scripts/webhook_transform.py`
- Python fallback: `<SKILL_DIR>/scripts/manus_client.py`
