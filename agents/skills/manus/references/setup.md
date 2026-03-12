# Manus Setup Guide

Verified against official docs at `https://open.manus.im/docs` on March 10, 2026.

## Prerequisites

- Create a Manus API key
- Export `MANUS_API_KEY`
- Install `uv`

Optional local state lives under `~/.manus-skill/` by default. Override with `MANUS_SKILL_HOME` if needed.

Set the script path:

```bash
SCRIPT="<SKILL_DIR>/scripts/manus_client.mjs"
```

## Polling Workflow

### Create a test task

```bash
node "$SCRIPT" create \
  --prompt "What is 2+2? Reply with just the answer." \
  --mode chat \
  --profile manus-1.6-lite \
  --label smoke-test
```

### Check status

```bash
node "$SCRIPT" status --task-id <task_id>
```

### Get result

```bash
node "$SCRIPT" result --task-id <task_id>
```

## Webhook Workflow

Register your own webhook receiver:

```bash
WEBHOOK_URL="https://your-domain.example/manus-webhook"

curl -X POST https://api.manus.ai/v1/webhooks \
  -H "API_KEY: $MANUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"webhook\": {\"url\": \"$WEBHOOK_URL\"}}"
```

Cache the public key locally if you want:

```bash
curl -s https://api.manus.ai/v1/webhook/public_key \
  -H "API_KEY: $MANUS_API_KEY" | jq -r '.public_key' \
  > ~/.manus-skill/cache/manus-webhook-pubkey.pem
```

The bundled webhook helpers are optional adapters that validate the signature and normalize the event payload:

- Node: `scripts/webhook-transform.mjs`
- Python: `scripts/webhook_transform.py`

Adapt them to your runtime instead of assuming they are drop-in integrations for every platform.

## Multi-Turn Tasks

When `stop_reason` is `ask`:

```bash
node "$SCRIPT" create \
  --task-id <original_task_id> \
  --prompt "User's follow-up answer"
```

## Deleting Tasks

```bash
node "$SCRIPT" delete --task-id <task_id>
```

If your environment prefers Python, the bundled fallback remains available at `<SKILL_DIR>/scripts/manus_client.py`.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| `MANUS_API_KEY not set` | Confirm the env var is visible to the process running `uv` |
| Attachment creation fails | Uploaded file attachments must send `filename` and `file_id` |
| Webhook verification fails | Verify the full URL, including query params, and use the raw request body |
| No files downloaded | Some tasks only return text, not attachments |
