# manus

Async task delegation to [Manus](https://manus.im) for AI agents.

Some jobs don't fit inside a local agent loop — generating a polished PDF, building a spreadsheet from scattered sources, running a multi-step workflow through external connectors, or kicking off broad research that might take minutes. This skill gives the agent a clean interface to offload those tasks to Manus asynchronously: create, poll, fetch results, and continue.

## What it does

- Creates Manus tasks with structured prompts, attachments, and connector bindings
- Polls or receives webhook notifications for completion
- Fetches results (text, files, artifacts) back into the local workflow
- Supports multi-turn follow-up on the same task

## What it does not do

- It does not replace local tools. If the agent can do the job locally, it should.
- It does not manage Manus account setup — see `references/setup.md` for that.
- It does not stream intermediate progress; it checks status and waits.

## When to reach for this

- Deliverables: PDF, PPT, CSV, or other formatted output the agent can't produce locally
- Connector-based work: tasks that need Manus integrations (e.g., third-party APIs)
- Long-running jobs: research or multi-step workflows that exceed local tool timeouts
- Broad research: when the scope is too wide for a single agent pass

## Usage

```bash
npx skills add https://github.com/xdanger/skills --skill manus
```

Requires a Manus API key. See `references/setup.md` for configuration.
