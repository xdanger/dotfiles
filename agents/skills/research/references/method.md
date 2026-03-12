# Research Method

Use this compact loop for every session:

1. Clarify the main goal and the highest-value unknowns.
2. Break the goal into a small set of research threads.
3. Choose the next tool based on whether the need is synthesis, breadth, close reading, or site focus.
4. Record evidence in a ledger instead of treating tool output as the final answer.
5. Check for contradictions, weak sourcing, and unanswered questions.
6. Decide whether to stop, deepen, verify, or branch.

## Ledger Fields

Track at least these fields in the session:

- `research_brief`
- `plan_state`
- `plan_versions`
- `delta_plans`
- `activity_history`
- `gaps`
- `goal`
- `threads`
- `claims`
- `continuations[]`
- `planning_artifacts.hypotheses`
- `candidate_urls`
- `evidence`
- `contradictions`
- `scores`
- `stop_status`

Treat `research_brief` as an agent-authored judgment surface:

- `objective`
- `deliverable`
- `source_policy`
- `clarification_notes`

Treat `plan_versions` and `activity_history` as review artifacts, not just internal debugging data.
Treat `gaps[]` as the durable blocker surface. Keep `remaining_gaps` compatible for text outputs, but
prefer typed gaps for anything another agent may need to update, review, or resolve.
Treat `delta_plans[]` as agent-authored “what changed and what should happen next” artifacts. The
runtime should validate and persist them, not invent them.

Suggested gap fields:

- `gap_id`
- `kind`
- `summary`
- `scope_type`
- `scope_id`
- `severity`
- `status`
- `recommended_next_action`
- `created_by`

## Source Grading

Rank sources by the 5-tier credibility hierarchy defined in SKILL.md:

1. **Axiomatic** — math, physical laws, formal proofs
2. **Legal/regulatory** — statutes, court rulings, SEC filings, audited financials
3. **Institutional data** — government stats, IMF/World Bank, authoritative books, high-cite papers
4. **Official and authoritative** — company websites, Wikipedia, Science/Nature, Britannica
5. **Other** — blogs, forums, opinion pieces — leads and context only

The runtime simplifies to three labels for scoring:

- `high`: tiers 1-3
- `medium`: tier 4
- `low`: tier 5

Prefer multiple domains for important claims. If a high-priority claim depends on one
low-quality source, keep it unresolved.

For inspectable evidence, store attribution fields when the runtime can infer them:

- `anchor_text`
- `matched_sentence`
- `matched_sentence_index`
- `matched_tokens`
- `excerpt_method`
- `attribution_confidence`

Make those fields visible in the outputs another agent is likely to consume, not only in raw
session state. Findings and source listings should preserve the best available attribution anchor
for each claim/source pair.

## Evidence Freshness

Evidence records carry freshness metadata:

- `observed_at`: when the runtime first saw this evidence
- `published_at`: publication date from the source (if available)
- `last_verified_at`: when the evidence was last cross-checked

## Contradictions

Contradictions are durable typed objects, not just text strings. Each contradiction records:

- `contradiction_id`: stable identifier
- `claim_id`: which claim is contested
- `left_evidence_id` / `right_evidence_id`: the conflicting sources
- `conflict_type`: `factual_disagreement`, `temporal`, `interpretation`, or `scope`
- `status`: `open`, `resolved`, or `dismissed`
- `resolution_strategy`: what the agent should try next

When two sources disagree:

1. Record the contradiction as a typed object.
2. Search for a tie-breaker source that is more primary or more recent.
3. If the conflict remains, lower confidence instead of forcing a conclusion.

## Continuation Patches

Treat continuation as a structured mutation when the next step is already known.

Useful operations in the current runtime:

- merge domains
- mark a claim stale for re-verification
- requeue a thread for another gather pass
- record an explicit gap or note
- add a new thread with answer-bearing claims

## Stopping Criteria

Stop when all of these are mostly true:

- the main question is answered
- high-priority claims have URL-backed evidence
- primary or official support is acceptable for the supported claims
- source diversity is acceptable
- additional searches are mostly repetitive

Continue when any of these are true:

- unresolved contradiction
- weak source mix
- key claim supported by one source
- obvious missing subtopic
