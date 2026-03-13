# Research Skill

`research` is a deep research skill for modern AI agents.

Not a search wrapper. Not a summary prompt with extra steps. Not a pile of heuristics pretending to be judgment.

The ambition here is simpler and more serious: give an agent a research runtime it can trust. A place to think across multiple passes, keep its bearings, preserve evidence, survive interruptions, and come back to the same investigation without quietly starting over.

This README is written for humans maintaining the skill. It is meant to give a clear feel for what this project is, what kind of taste it is trying to embody, and where its boundaries should stay. Agent-facing operating instructions live in [SKILL.md](SKILL.md).

## Usage

```bash
npx skills add https://github.com/xdanger/skills --skill research
```

## The Shape Of The Thing

The target is an **evidence-aware deep research engine** for agents.

That phrase matters. “Evidence-aware” means the system should know the difference between:

- a plan
- a lead
- a source
- a claim
- a contradiction
- an answer

Those are not the same object wearing different names. A good research system keeps them separate. It does not let a promising plan masquerade as evidence, or let a plausible synthesis pretend to be a settled conclusion.

“Deep research” also matters. The goal is not to answer quickly at any cost. The goal is to let an agent do the kind of work that actually takes multiple passes:

- break a fuzzy question into tractable threads
- gather real sources
- tie evidence to claims
- surface contradictions instead of smoothing them away
- preserve uncertainty where the evidence remains thin
- continue the same line of inquiry later

If this skill is doing its job, “continue this research” should feel like returning to a live case file, not asking the same assistant to improvise a fresh summary.

## What It Should Feel Like

The ideal user experience is not “the model searched a bit more.”

It is closer to this:

- the question is framed well
- the work is decomposed in a way that matches the problem
- the answer is direct when the evidence is direct
- the uncertainty is honest when the evidence is mixed
- the system remembers what it already knows
- the citations are attached to actual support, not decorative

This is meant to feel like a research workflow with memory, not a chat turn with extra latency.

## The Central Design Belief

This skill is built on one core belief:

**scripts should enforce reliability; agents should spend their intelligence on judgment**

That is the line everything else hangs on.

The scripted runtime should own the things that must be dependable:

- persistence
- resumability
- checkpointing
- work queue semantics
- provider contracts
- handoff and rejoin behavior
- evidence ledger integrity

The agent should own as much of the following as possible:

- how to frame the question
- how to decompose the work
- what claims matter
- what sources are worth pursuing next
- how to interpret conflicting evidence
- when to keep digging
- how to synthesize the answer

This boundary is not an implementation detail. It is the philosophy of the skill.

If a decision can be described clearly in natural language and benefits from a better model, it should drift toward the agent side over time. If a behavior must survive retries, interruptions, or provider weirdness without corrupting state, it belongs in the scripted runtime.

## Why This Boundary Matters

There is a trap in building agent skills: each time the model struggles, it is tempting to codify more judgment in scripts.

That works for a while. Then the skill slowly turns into a rule engine. It becomes harder to improve, more brittle to edge cases, and less able to benefit from stronger models.

This project is trying not to fall into that trap.

The runtime should be firm where firmness creates trust. It should be soft where softness allows judgment to improve.

That is why the recent design work deliberately moved toward **agent-authored planning** rather than doubling down on a bigger fallback planner.

## Agent-Native Planning

One of the most important recent changes is the addition of an explicit agent-authored planning path via `--plan-file`.

This is not just a convenience feature. It is a statement about how the skill is supposed to work.

Sometimes the agent already knows the right shape of the investigation:

- which threads matter
- which claims are answer-bearing
- which subqueries are worth paying for
- which gaps should remain explicit

In those moments, the runtime should not force the agent to tunnel that judgment through a fallback planner and hope the heuristics recover it.

Instead:

- the agent authors the plan
- the runtime validates it
- the runtime persists it
- the runtime queues it
- the rest of the research loop proceeds with the same durability guarantees

This keeps the fallback planner available, but prevents it from becoming the center of the system.

## Why Resumability Is Non-Negotiable

Serious research breaks.

It breaks because providers are slow, because new leads appear late, because follow-up questions change the shape of the work, because remote handoffs happen, because evidence conflicts, because someone wants to return tomorrow and go deeper on one thread instead of three.

That is why this skill treats research as a session rather than a prompt.

The session should preserve the living state of the investigation:

- the goal
- the current research shape
- the evidence already gathered
- the claims still unresolved
- the work still queued
- the handoff state, if any

Without that, “deep research” is just repeated forgetting with nicer formatting.

## Why Evidence Awareness Is Non-Negotiable

The skill should never quietly blur these layers together:

- planning artifacts
- candidate URLs
- evidence
- conclusions

Once those boundaries collapse, the system starts to look smarter than it is. And that is the exact failure mode this skill is trying to avoid.

For this project, evidence awareness means:

- claims should be falsifiable and answer-bearing
- evidence should be tied to real URLs
- support and contradiction should be explicit
- confidence should come from sufficiency, quality, and diversity
- unresolved conflicts should remain visible

The standard is not “remove uncertainty.” The standard is “make uncertainty legible.”

## What Exists Today

This project has a real runtime under it.

It is no longer just an idea or a prompt pattern. Today it already has:

- a versioned local session ledger with durable state
- agent-authored planning as the primary path, with a legacy fallback planner isolated behind an explicit compatibility layer
- explicit queued work instead of one monolithic run
- checkpointed provider operations with replay safety
- separation between claims, evidence, contradictions, and synthesis
- typed durable contradictions with conflict classification and resolution tracking
- evidence freshness metadata (observed_at, last_verified_at)
- a 5-tier source credibility system for agent judgment, mapped to 3 tiers for runtime scoring
- continuation, delta plans, and rejoin flows
- direct-answer oriented synthesis for verification-style work
- auto-synthesize option for one-shot research workflows
- an `awaiting_agent_decision` state that pauses instead of inventing the next step

The foundation is real. The remaining problems are increasingly quality problems rather than structure problems.

## What Still Needs Work

This skill is not “finished deep research.” Not yet.

The biggest remaining gaps:

- evidence attribution is still not audit-grade
- excerpts can still be noisy
- state machine transitions lack a formal `transitions.mjs` enforcing legal moves
- plan approval freeze protection is not yet airtight
- contradiction resolution workflow is manual, not guided

That is the right kind of incompleteness at this stage. The boundary is clean; the judgments now need to get sharper.

## What Should Stay Hard

As the skill evolves, some parts should remain unapologetically rigid:

- session schema
- persistence format
- checkpoint semantics
- retry and recovery rules
- work queue behavior
- provider validation
- handoff and rejoin contracts

These are the places where ambiguity creates duplication, corruption, or unsafe replay.

## What Should Stay Soft

Other parts should stay deliberately open to model improvement:

- plan shape
- claim selection
- retrieval strategy
- source tradeoffs
- follow-up prioritization
- stopping judgment
- synthesis structure and tone

These are the places where stronger agents should make the skill better without requiring the whole runtime to be rewritten.

## How To Judge A Change

When changing this skill, the useful questions are not only technical.

They are also questions of taste:

1. Does this make the runtime more trustworthy?
2. Does this make the agent/runtime boundary clearer?
3. Does this improve real research quality?
4. Does this preserve honest uncertainty?

If a change adds more hardcoded judgment where the agent could do better, it is probably moving in the wrong direction, even if it looks clever in the diff.

## Directory Layout

```text
skills/research/
├── README.md
├── SKILL.md
├── references/
└── scripts/
```

In practice:

- [SKILL.md](SKILL.md) is the agent-facing operating guide
- `references/` holds supporting method and provider notes
- `scripts/` holds the durable runtime, ledger logic, and tests

## References

- [SKILL.md](SKILL.md)
- [method.md](references/method.md)
- [providers.md](references/providers.md)
