# CLI Skill

Use this reference when the task is about general `xdoa` usage, auth behavior, or live OA lookups outside the document-search and flow-submit specialties.

## Default execution rule

- Prefer running the business command first
- Do not force `xdoa auth status` before every command
- Do not ask the user to re-login just because an access token may be old
- Use `--json` when the result needs filtering, parsing, or follow-up automation

## Auth behavior that matters to users

- If a valid token already exists for the target sub-system, the business command uses it directly
- If the access token is expired, the CLI usually refreshes it automatically with the stored `refresh_token`
- If there is no local token for `flow`, `reserve`, `asset`, `space`, or `okr`, the CLI may try to silently obtain one through the browser
- Only when silent auth fails, the refresh token is also expired, or the command still returns unauthorized should you ask the user to log in again

## Manual auth recovery

Use manual recovery only when one of these is true:

- the command explicitly fails with not logged in, unauthorized, login required, or expired credential behavior
- `xdoa auth status <client-id>` shows the credential is invalid
- silent token acquisition did not succeed

Recommended recovery order:

1. run the original business command first
2. if auth fails, inspect status:

```bash
xdoa auth status
xdoa auth status <client-id>
```

3. re-login the relevant sub-system only if needed:

```bash
xdoa auth login
xdoa auth login flow
xdoa auth login reserve
xdoa auth login asset
xdoa auth login space
xdoa auth login okr
```

4. rerun the original business command
5. only if repeated auth recovery still fails:

```bash
xdoa auth logout
xdoa auth login <client-id>
```

`xdoa auth logout` clears the local auth store for all locally saved clients, not just one sub-system.

## Command style

- Prefer the installed binary:

```bash
xdoa ...
```

- In a development checkout without the installed binary, use:

```bash
go run main.go ...
```

- Keep machine payloads and human-readable summaries separate

## When to stay in this branch

Stay in `cli` when the user wants current state instead of static guidance, for example:

- "我有哪些资产"
- "我订了哪些会议室"
- "某某坐哪"
- "A1-1F 工位图"
- "我有哪些待办审批"
- "帮我查一下 OKR 接口返回"

## Typical live OA lookups

- My assets:

```bash
xdoa asset get
```

- Asset detail:

```bash
xdoa asset detail <asset_id>
```

- My meeting-room bookings:

```bash
xdoa reserve get mine
```

- Search available rooms:

```bash
xdoa reserve rooms --json
```

- Seat lookup:

```bash
xdoa space search "<name>"
```

- Floor layout:

```bash
xdoa space floor A1-1F
```

- Todo approvals:

```bash
xdoa flow get task
```

- OKR GET-style queries:

```bash
xdoa okr get <path> --json
```

## Use `--json` when appropriate

Examples:

```bash
xdoa flow get task --json
xdoa reserve get mine --json
xdoa asset get all --json
xdoa space floor A1-1F --json
```

## Response behavior

- Report the user-facing result first, not the raw command
- Mention the command only when it helps the user verify or repeat the lookup
- If auth fails after one recovery pass, say exactly which sub-system needs login
