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

## Quick Reference

```bash
SCRIPT="<SKILL_DIR>/scripts/research_session.mjs"
```

| Command    | Purpose                                            |
| ---------- | -------------------------------------------------- |
| `start`    | Begin a new research session                       |
| `prepare`  | Begin but pause for plan approval before gathering |
| `approve`  | Resume a prepared session after plan review        |
| `status`   | Show session state, scores, and open work          |
| `review`   | Show a takeover-ready packet for another agent     |
| `continue` | Mutate the session with delta plans or patches     |
| `report`   | Show the final synthesis (`--format md\|json`)     |
| `sources`  | List all evidence sources with attribution         |
| `rejoin`   | Import results from an async remote handoff        |
| `close`    | Mark the session as finished                       |

Useful flags: `--depth quick|standard|deep`, `--domains d1,d2`,
`--plan-file`, `--brief-file`, `--delta-file`, `--instruction`.

## The Research Loop

The full pipeline has five stages. **Do not skip assess.**

```
plan → gather → verify → assess → synthesize
```

1. **Plan** — author a plan file with threads, claims, and subqueries.
2. **Gather** — runtime searches and extracts evidence, links it to claims.
3. **Verify** — runtime runs claim-centric verification for high-priority claims.
4. **Assess** — agent reads evidence excerpts and assigns stances (`support`/`oppose`/`context`).
5. **Synthesize** — runtime builds findings and the final answer from assessed evidence.

If you skip step 4, synthesis will produce hollow results — evidence stays `"unassessed"`,
no findings get `support` or `oppose` status, and the final answer is just a list of titles
with "stance assessment pending."

### Complete workflow

```bash
# 1. Author a plan and start the session
node "$SCRIPT" start --query "Your question" --plan-file /tmp/plan.json --depth standard

# 2. Wait for gather + verify to finish (if run in background, poll until exit)

# 3. Check status — look for missing_dimensions: ["agent_stance_assessment"]
node "$SCRIPT" status --session-id <id>

# 4. Read evidence, evaluate stances, write them back
node "$SCRIPT" sources --session-id <id>
# → use the excerpts to build a stance delta (see Stance Assessment below)
node "$SCRIPT" continue --session-id <id> --delta-file /tmp/stance-delta.json

# 5. Trigger synthesis
node "$SCRIPT" continue --session-id <id> --delta-file /tmp/synth-delta.json

# 6. Read the report
node "$SCRIPT" report --session-id <id> --format md
```

### With `auto_synthesize`

Setting `auto_synthesize: true` in the research brief makes the runtime synthesize
automatically after gather+verify. But the runtime does **not** wait for stance assessment —
it will synthesize with unassessed evidence and produce a hollow result.

When using `auto_synthesize`, the agent must still:
1. Wait for the session to complete
2. Run stance assessment via `continue --delta-file`
3. Re-trigger synthesis via another `continue --delta-file` with `synthesize_session`

## Planning

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

## Stance Assessment

After gather and verify, evidence is linked to claims but all stances are `"unassessed"`.
The agent must evaluate each piece and assign `support`, `oppose`, or `context` before
synthesis can produce meaningful results.

### How to read evidence

Use `sources --session-id <id>` to get all evidence with URLs, excerpts, and claim links.
Use `report --session-id <id> --format json` for structured access to evidence per claim.
Use `status --session-id <id>` to check which claims have
`missing_dimensions: ["agent_stance_assessment"]`.

### How to write stances

Use `continue --delta-file` with `assess_evidence` claim actions:

```json
{
  "delta_plan": {
    "delta_plan_id": "stance-v1",
    "summary": "Assess evidence stances for all claims",
    "claim_actions": [
      {
        "claim_id": "claim-xxx",
        "action": "assess_evidence",
        "stances": [
          { "evidence_id": "evidence-aaa", "stance": "support", "reason": "Directly confirms the claim with official documentation" },
          { "evidence_id": "evidence-bbb", "stance": "oppose", "reason": "Contradicts the stated timeline" },
          { "evidence_id": "evidence-ccc", "stance": "context", "reason": "Background info, does not directly address the claim" }
        ]
      }
    ]
  }
}
```

### What to assess

- Focus on high-priority claims first.
- Read the evidence excerpt and decide: does it **support** the claim, **oppose** it,
  or provide **context** without taking a clear position?
- Provide a brief `reason` — this becomes part of the finding summary.
- You do not need to assess every piece of evidence. Unassessed evidence is treated
  as context during synthesis.

### After assessment

Trigger synthesis with a `synthesize_session` queue proposal:

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

## When the Session Awaits Your Decision

When the session enters `awaiting_agent_decision`, check `status` or `review`, then:

- `continue --delta-file` with `assess_evidence` → assess stances (do this first)
- `continue --delta-file` with `synthesize_session` → produce the final answer (after assessment)
- `continue --delta-file` with `gather_thread` or `verify_claim` → dig deeper
- `continue --plan-file` → restructure the research
- `close` → end the session

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
`claim_actions` (assess_evidence, mark_stale, set_priority),
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
- **stances are assessed** for high-priority claims
- new searches are mostly repetitive
- the remaining gaps are explicit

Continue when contradictions remain, sourcing is weak, or important claims hinge on thin evidence.

## Load Only When Needed

- `references/method.md` — research loop, evidence standards, source grading details
- `references/providers.md` — provider routing decisions (Tavily, Brave, Gemini, Manus)
