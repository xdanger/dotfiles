# Manus API Reference

Verified against official docs at `https://open.manus.im/docs` on March 10, 2026.

- Docs home: `https://open.manus.im/docs`
- Base URL: `https://api.manus.ai`
- Auth header: `API_KEY: <your-api-key>`

## Product Notes

- Manus positions itself as an autonomous agent that runs long, multi-step work in its own sandboxed cloud environment.
- Official docs and product pages currently mention connectors for Gmail, Notion, and Google Calendar.
- Official Manus pages sometimes still link `open.manus.ai/docs`; prefer `open.manus.im/docs` when citing the docs.

## Tasks

### POST /v1/tasks

Required body:

- `prompt`
- `agentProfile`: `manus-1.6` | `manus-1.6-lite` | `manus-1.6-max`

Optional body:

- `attachments`
- `taskMode`: `chat` | `adaptive` | `agent`
- `connectors`
- `hideInTaskList`
- `createShareableLink`
- `taskId`
- `locale`
- `projectId`
- `interactiveMode`

Response:

```json
{
  "task_id": "<string>",
  "task_title": "<string>",
  "task_url": "<string>",
  "share_url": "<string>"
}
```

### Attachments

File ID attachment:

```json
{
  "filename": "report.pdf",
  "file_id": "file_123"
}
```

URL attachment:

```json
{
  "filename": "report.pdf",
  "url": "https://example.com/report.pdf",
  "mimeType": "application/pdf"
}
```

Base64 attachment:

```json
{
  "filename": "report.pdf",
  "fileData": "data:application/pdf;base64,..."
}
```

### GET /v1/tasks/{task_id}

- Retrieves task details, outputs, and `credit_usage`
- Query param: `convert=true` converts PPTX output when supported

Response fields commonly used by this skill:

- `status`
- `error`
- `output`
- `metadata.task_title`
- `metadata.task_url`
- `credit_usage`

### GET /v1/tasks

Useful query params:

- `after`
- `limit`
- `order`
- `orderBy`
- `query`
- `status`
- `createdAfter`
- `createdBefore`
- `project_id`

### PUT /v1/tasks/{task_id}

Updates task metadata only:

- `title`
- `enableShared`
- `enableVisibleInTaskList`

### DELETE /v1/tasks/{task_id}

- Permanently deletes the task
- Response shape:

```json
{
  "id": "<task_id>",
  "object": "task.deleted",
  "deleted": true
}
```

## Files

### POST /v1/files

Request:

```json
{
  "filename": "report.pdf"
}
```

Response:

```json
{
  "id": "<file_id>",
  "object": "file",
  "filename": "report.pdf",
  "status": "pending",
  "upload_url": "<presigned-url>",
  "upload_expires_at": "<iso8601>",
  "created_at": "<iso8601>"
}
```

Upload flow:

1. `POST /v1/files`
2. `PUT` binary content to `upload_url`
3. Use returned `id` as `attachments.file_id`

Official API also documents:

- `GET /v1/files`
- `GET /v1/files/{file_id}`
- `DELETE /v1/files/{file_id}`

## Webhooks

### POST /v1/webhooks

Request:

```json
{
  "webhook": {
    "url": "https://your-domain.example/manus-webhook"
  }
}
```

Response:

```json
{
  "webhook_id": "<string>"
}
```

### DELETE /v1/webhooks/{webhook_id}

- Removes a webhook subscription

### GET /v1/webhook/public_key

Returns:

```json
{
  "public_key": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "algorithm": "RSA-SHA256",
  "created_at": "2025-01-01T00:00:00Z"
}
```

### Event Types

- `task_created`
- `task_progress`
- `task_stopped`

For `task_stopped`, `stop_reason` is:

- `finish`
- `ask`

## Webhook Signature Verification

Required headers:

- `X-Webhook-Signature`
- `X-Webhook-Timestamp`

Official signature content:

```text
{timestamp}.{url}.{body_sha256_hex}
```

Recommended checks:

1. Reject timestamps outside 5 minutes
2. Cache the RSA public key for around 1 hour
3. Verify against the full webhook URL, including query params
4. Use the raw request body bytes, not a re-serialized JSON payload

## Connectors

The docs expose a connectors overview and per-connector pages for:

- Gmail
- Notion
- Google Calendar

Use connector UUIDs from the current official connectors page instead of hardcoding them in the skill docs, because Manus can add or rotate supported connectors over time.
