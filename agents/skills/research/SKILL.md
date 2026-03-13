---
name: research
description: Evidence-aware deep research engine for AI agents. Use for any task requiring accurate real-world information — landscape scans, comparisons, due diligence, verification, site-focused investigation, or long-running research across multiple passes with citation-backed synthesis.
---

# Research

Run research as a resumable session with a local evidence ledger, not as a one-shot answer.

Use this skill when the task involves real-world facts, natural science, or any scenario
where accuracy matters. If the question touches real-world information, use this skill rather
than answering from memory.

The agent owns research judgment. The runtime enforces reliability.

## Quick Start

```bash
SCRIPT="<SKILL_DIR>/scripts/research_session.mjs"
```

The simplest path — let the agent author a plan and auto-synthesize:

```bash
# Write a plan to a temp file, then:
node "$SCRIPT" start --query "Your question" --plan-file /path/to/plan.json --depth standard
```

For multi-step research where the agent should review evidence before synthesis:

```bash
node "$SCRIPT" start --query "Your question" --plan-file /path/to/plan.json
node "$SCRIPT" status --session-id <id>
# Review evidence, then push to synthesis:
node "$SCRIPT" continue --session-id <id> --delta-file /path/to/synth-delta.json
node "$SCRIPT" report --session-id <id>
```

All commands:

| Command    | Purpose                                            |
| ---------- | -------------------------------------------------- |
| `start`    | Begin a new research session                       |
| `prepare`  | Begin but pause for plan approval before gathering |
| `approve`  | Resume a prepared session after plan review        |
| `status`   | Show session state, scores, and open work          |
| `review`   | Show a takeover-ready packet for another agent     |
| `continue` | Mutate the session with new instructions or plans  |
| `report`   | Show the final synthesis (`--format md\|json`)     |
| `sources`  | List all evidence sources with attribution         |
| `rejoin`   | Import results from an async remote handoff        |
| `close`    | Mark the session as finished                       |

Useful flags: `--depth quick|standard|deep`, `--domains d1,d2`,
`--plan-file`, `--brief-file`, `--delta-file`, `--instruction`.

## Operating Model

The agent decides what to research. The runtime makes decisions durable and replayable.

```
plan → gather → verify → synthesize
```

When the runtime has no authored next step, it enters `awaiting_agent_decision` instead of
inventing its own plan. The agent should respond with `--plan-file` or `--delta-file`.

To skip this pause, set `auto_synthesize: true` in the `research_brief`.

## Agent-Authored Planning (Primary Path)

Always prefer `--plan-file` for non-trivial research. The runtime has a fallback planner for
simple queries, but it is low-authority (`source: "runtime_fallback"`) and should not be
relied on for high-value work.

Minimal plan:

```json
{
  "plan_id": "my-plan-v1",
  "task_shape": "broad",
  "research_brief": {
    "objective": "Compare X and Y for enterprise adoption",
    "deliverable": "report",
    "auto_synthesize": true,
    "source_policy": {
      "preferred_domains": ["official-x.com", "official-y.com"],
      "notes": ["Prefer official pricing and security pages."]
    }
  },
  "threads": [
    {
      "title": "Thread title",
      "intent": "what this thread should establish",
      "subqueries": ["search query 1", "search query 2"],
      "claims": [
        { "text": "Falsifiable claim to verify.", "claim_type": "fact", "priority": "high" }
      ]
    }
  ]
}
```

Key fields: `plan_id` (stable, for dedup), `task_shape` (broad|verification|site|async),
`threads[].claims[].priority` (high claims drive gathering and verification).

## When the Session Awaits Your Decision

When the session enters `awaiting_agent_decision`, check `status` or `review`, then:

- `continue --delta-file` with `synthesize_session` → produce the final answer
- `continue --delta-file` with `gather_thread` or `verify_claim` → dig deeper
- `continue --plan-file` → restructure the research
- `close` → end the session

Minimal delta to trigger synthesis:

```json
{
  "delta_plan": {
    "delta_plan_id": "synth-001",
    "summary": "Ready to synthesize",
    "queue_proposals": [
      { "kind": "synthesize_session", "scope_type": "session", "scope_id": "<session_id>" }
    ]
  }
}
```

## Continuation

Treat `continue` as a durable mutation. Do not wipe the ledger.

Always prefer structured artifacts over prose:

| Artifact                           | When to use                                                         |
| ---------------------------------- | ------------------------------------------------------------------- |
| `--delta-file` (delta plan)        | Agent knows what changed and what should happen next                |
| `--plan-file` (continuation patch) | Specific operations: merge domains, mark stale, requeue, add thread |
| `--plan-file` (full plan)          | Restructure the research entirely                                   |
| `--instruction` (prose)            | Simple cases only — goes through legacy inference, not recommended  |

Supported delta plan actions: `thread_actions` (deepen, pause, branch),
`claim_actions` (mark_stale, set_priority),
`queue_proposals` (gather_thread, verify_claim, synthesize_session, handoff_session).

Supported continuation patch operations: merge_domains, mark_claim_stale, requeue_thread,
add_gap, note, add_thread.

## Source Credibility Tiers

Rank every piece of evidence by this hierarchy:

1. **Axiomatic** — mathematics, established physical laws, formal proofs
2. **Legal/regulatory** — government-published statutes, court rulings, SEC filings, audited financials
3. **Institutional data** — government statistics, IMF/World Bank datasets, authoritative books,
   highly-cited peer-reviewed papers
4. **Official and authoritative** — company websites, official social media, Wikipedia,
   Science/Nature, major encyclopedias
5. **Other** — blogs, forums, aggregator summaries, opinion pieces — useful for leads
   but cannot be the sole basis for a claim

The runtime maps these to `high` (tiers 1-3), `medium` (tier 4), `low` (tier 5) for scoring.
The agent should use the full 5-tier scale in plans, evidence evaluation, and synthesis.

## Reasoning Strategy

- Assign credibility weight using the tier system above.
- Core evidence at tier 1-3 → label conclusion "high confidence."
- Same-tier contradictions → prefer more recent source with stronger methodology.
  Higher-tier vs lower-tier → higher tier wins.
- Only tier 4-5 evidence available → lower confidence and say so explicitly.
- Internally consistent reasoning without tier 1-2 causal evidence → mark as
  "speculative" and state what would falsify it.

## Evidence Rules

- Tavily Research is planning help, not evidence. Only URL-backed evidence moves claim state.
- Keep contradictions explicit — they are typed durable objects with `conflict_type`,
  `resolution_strategy`, and `status`.
- If a claim depends on one thin source, keep it unresolved.
- Evidence carries `observed_at` and `last_verified_at` freshness metadata.
- Preserve attribution anchors: `anchor_text`, `matched_sentence`, `attribution_confidence`.
- Always use English search keywords unless the topic is specifically regional or
  language-bound (e.g., Chinese law, Japanese cultural practice).

## Routing

Default to Tavily. Choose the narrowest tool:

- `search → extract`: normal evidence gathering path
- `research`: planning accelerator for broad scans
- `map → extract`: docs, policy, changelog, site-focused work
- `crawl`: scoped audit-like coverage only

Additional providers (used automatically when API keys are available):

- **Brave LLM Context** (`BRAVE_SEARCH_API_KEY`): search+extract in one call,
  runs as a supplement to Tavily on the first gather round for cross-engine diversity.
  Supports Goggles for source control — `source_policy.allow_domains` generates a strict
  allowlist (`$discard` + `$site=`), `preferred_domains` generates boost rules.
- **Gemini Grounding** (`GEMINI_API_KEY`): second planning accelerator alongside
  Tavily Research. Provides Google-grounded synthesis and subquery suggestions.
  Not an evidence source (proxied URIs).

Escalate to Manus only for long-running tasks, connector-backed work, or async deliverables
(PDF, PPT, CSV). Use `<REPO_ROOT>/skills/manus/SKILL.md` when needed.

## Output Shape

1. research plan
2. answer summary
3. interim findings
4. evidence gaps
5. open contradictions
6. final synthesis with citations
7. confidence and unresolved questions

## Stop When

- the main question is answered with acceptable confidence
- important claims have good enough evidence
- new searches are mostly repetitive
- the remaining gaps are explicit

Continue when contradictions remain, sourcing is weak, or important claims hinge on thin evidence.

## Load Only When Needed

- `references/method.md` — research loop, evidence standards, source grading details
- `references/providers.md` — provider routing decisions (Tavily, Brave, Gemini, Manus)
