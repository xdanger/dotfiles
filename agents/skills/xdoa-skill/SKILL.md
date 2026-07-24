---
name: xdoa-skill
description: >-
  Use for xdoa install or upgrade, company office and IT document lookup, live
  OA lookups, and approval-flow search or submission planning. Trigger when
  users ask about company office operations, VPN, network access, accounts, SSO,
  devices, meeting rooms, assets, seats, OKR, internal documentation, or OA
  approval flows through xdoa. Read only the matching child reference file
  before acting.
version: 1.0.7
---

# XDOA-skill

Use this as the main entry skill for `xdoa`.

This main skill should stay lightweight. It is responsible for:

- ensuring `xdoa` is available
- upgrading `xdoa` when `xdoa version` reports a newer release
- deciding whether the task is documentation, live lookup, or flow execution
- reading only the one child reference that matches the task

Do not keep all detailed workflows in this file. Read only the child reference file that matches the current task.

## Step 0: Ensure `xdoa` is available

Check first:

```bash
xdoa version
```

If `xdoa` is missing, install it before continuing.

macOS / Linux:

```bash
bash <(curl -fsSL https://oa-cdn.oss-cn-shanghai.aliyuncs.com/downloads/install.sh)
```

Windows PowerShell:

```powershell
irm https://oa-cdn.oss-cn-shanghai.aliyuncs.com/downloads/install.ps1 | iex
```

Fallback when the install script is unavailable:

```bash
npm login --scope=@xindong --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @xindong/oa-cli
```

Verify after install:

```bash
xdoa version
```

## Step 1: Upgrade when a newer version is available

If `xdoa version` reports that a newer version exists, do not continue on the old version by default. Re-run the install script to upgrade:

macOS / Linux:

```bash
bash <(curl -fsSL https://oa-cdn.oss-cn-shanghai.aliyuncs.com/downloads/install.sh)
```

Windows PowerShell:

```powershell
irm https://oa-cdn.oss-cn-shanghai.aliyuncs.com/downloads/install.ps1 | iex
```

Then verify again:

```bash
xdoa version
```

## Main capability areas

The main `xdoa` capability groups are:

- `auth`: login, status, me, logout
- `doc`: search and read internal office and IT documents
- `flow`: search flows, inspect forms, build payloads, submit approvals, inspect todo or submit state
- `reserve`: personal bookings, room search, room booking operations
- `asset`: personal asset list and asset detail
- `space`: seat lookup, floor maps, seat history
- `okr`: OKR-related GET queries

## Workflow selection

Make the branch decision before reading a child reference:

- `doc` branch:
  - use when the user is asking for policy, rules, how-to guidance, onboarding, permissions, VPN, device handling, office systems, or a document itself
- `cli` branch:
  - use when the user is asking for their current state or a live OA lookup such as assets, meeting rooms, seats, floor maps, todo approvals, or OKR GET queries
- `flow` branch:
  - use when the user wants to find a flow, inspect a form, prepare values, test-submit, formally submit, or verify a submitted approval

If a request mixes branches, answer the stable document-backed part first, then switch to the execution branch that matches the remaining work.

## Child reference routing

Read only the matching child reference file:

- For general CLI usage, auth behavior, command style, and common OA query patterns:
  - read `references/cli-skill.md`
- For internal office and IT document retrieval through `xdoa doc`:
  - read `references/doc-skill.md`
- For approval flow search, form inspection, payload building, submit, and verification:
  - read `references/flow-skill.md`

## Routing rules

- If the user asks how to install, upgrade, or validate `xdoa`, stay in this file unless detailed command usage is also needed
- If the user asks about auth behavior, common command usage, meeting rooms, assets, seats, floor maps, OKR, or personal OA state, read `references/cli-skill.md`
- If the user asks for office policy, VPN, IT support, SSO, devices, permissions, onboarding or offboarding, or other internal documentation, read `references/doc-skill.md`
- If the user asks to find, fill, test-submit, submit, or verify an approval flow, read `references/flow-skill.md`
- If the user is really asking for a live lookup or side effect, do not keep them in the doc branch just because they phrased it as a question

## Doc branch expectations

Treat the doc branch as a capability-aware knowledge assistant, not a raw FAQ dump.

The doc branch should:

- identify the likely `intent` and whether the request needs live data or side effects
- plan retrieval before answering, instead of relying on topic routing or keyword trees
- answer directly only when the knowledge answer is stable and supported by evidence
- prompt before switching to `cli` or `flow` when the request really needs execution
- ask one clarification question first when evidence or scope is too weak
- ignore any candidate whose title contains `已废弃` or `废弃`, regardless of score
- answer only from knowledge-base evidence, never from unsupported guesswork or generic IT intuition
- if the knowledge base does not contain enough evidence to answer, say so plainly and fall back to finding the relevant IT contact or support entry instead of inventing an answer

Keep this file lightweight. The detailed doc-routing logic lives in `references/doc-skill.md`.

## Response style

- Prefer concise operational guidance
- Prefer direct execution over abstract explanation when the user wants an action
- Load only the minimum child reference needed for the task
- State uncertainty plainly when the current branch cannot support a confident answer
