---
name: audience-aware-comms
description: >-
  Apply when writing an artifact whose reader is beyond this conversation —
  another human, or an AI executor that will act on your words, including
  subagents you spawn: emails; IM/Slack to other people; PR/issue descriptions;
  review comments; design/decision docs; customer-facing copy; docs/README;
  natural-language prompts, specs, or agent mandates. Apply even when the
  artifact is an incidental sub-step of a larger task (the PR body after a
  feature, a subagent prompt) — that is where audience-blind writing slips
  through. It makes you model the reader's real capability and what they will
  infer or assume, then emit only the calibrated artifact. Do NOT apply to:
  in-chat replies addressed to the current user (answers, explanations,
  summaries, status updates — however substantial), unless the user signals
  the text is destined for someone else ("to send to my manager", "to paste
  into Slack") — then that recipient is the reader and the skill applies; text
  the user dictates verbatim; git commit messages; output consumed literally
  by a deterministic interpreter (executed code, configs, schemas, queries,
  regexes, test fixtures) — no mind to model.
---

# Audience-Aware Communication

The "when to use" lives entirely in the `description` above — that is the trigger.
By the time you are reading this body, assume you are writing an artifact for a
reader beyond this conversation and it is consequential. (If on reflection the text
falls under one of the description's exclusions — an in-chat reply to the current
user, dictated-verbatim text, a git commit message, or output consumed literally by
a deterministic interpreter — exit quietly and respond normally; those cases are out
of scope.)

## Why this skill exists

Writing lands well only when it fits the reader. There are two failure modes, mirror
images of each other, and both come from ignoring the reader's actual level:

- **To a human**, the default slip is _under_-modeling — writing for a literal
  token-absorber: too blunt, missing what they will infer, ignoring what is better
  left unsaid.
- **To an AI executor**, the default slip is the opposite, _over_-specifying —
  treating a capable reasoner like a level-0 machine, spelling out every mechanical
  step. That buries the intent, wastes context, and actively suppresses the model's
  judgment. (Write to it like it's an idiot and it will execute like one.)

Same root error both times: not modeling the reader's real capability. A deterministic
interpreter genuinely is literal, so you skip it. (You also skip the current user in
live chat — not because they are literal, but because ordinary conversational judgment
already covers them. The description above carries the full exclusion list.) Every
reader outside those exclusions, human or LLM, infers and fills gaps, so model it.

## 1. Run this in your thinking — never in the output

1. **Model the reader** (human or AI): who they are · their actual capability /
   expertise · what they know vs. don't · what they care about · the one action or
   decision you want. Use only context already in hand. If it is thin, see section 4.
2. **Climb the ladder** (this is k-level reasoning; do as many layers as the stakes
   justify):
   - **L1** — what they take from a literal read.
   - **L2** — what they _infer_ about your intent, the situation, or the task from
     _how_ it is written and from what you leave out.
   - **L3** (high stakes only) — they expect you to be anticipating their reaction
     or their gaps; does that recursion change the move?
3. **Decide what to leave unsaid.** Omission is a tool, not a gap. Don't state what
   they can infer; don't over-justify; don't surface what creates obligation, anxiety,
   or constraint without purpose. Note which omissions are load-bearing.
4. **Calibrate register and grain** to the reader and channel.

## 1a. If the reader is an AI agent

When the executor is another LLM (a downstream agent, a subagent, a prompt or mandate
you are authoring), keep the ladder but change _what_ you model:

- **Capability, not feelings.** Estimate its real level. Frontier agents reason well;
  they need a clear target, not rote steps. There is no face to protect, so omission
  here is about granting latitude, not tact.
- **Specify the WHAT, trust the HOW.** Pin down precisely the things that are genuinely
  underdetermined and costly to get wrong — the goal, hard constraints, interfaces and
  contracts, acceptance criteria, and any ambiguity where a wrong guess is expensive.
  Leave the method, the obvious sub-steps, and anything a capable reasoner infers from
  the goal to the executor. This is delegating to a senior engineer, not micromanaging.
- **Model where it will guess wrong.** Under-specifying is not a virtue either — a
  context-free executor fills blanks with assumptions. Spend your words exactly on the
  blanks that matter, not on the steps it already knows.

## 2. Output rules

- Emit **only the finished artifact.** Don't show the reader-analysis, the L1/L2/L3
  ladder, or meta-phrases like "considering what they think I think." The reasoning
  stays backstage; surfacing it breaks the effect and reads as odd.
- Ship the **leanest version that achieves the goal.** Cut what the reader can infer;
  for an AI executor, cut the mechanical steps it does not need spelled out.
- **No manipulation, no false claims.** Audience-modeling is for clarity, tact, and
  calibration — not for steering a reader against their own interest. Copy that schemes
  reads as oily; this also keeps the prose clean and trustworthy.

## 3. Self-check — high stakes only

If the reader is **human**: cold-read the draft as the recipient seeing it for the first
time — first reaction? unintended subtext? anywhere they'd bristle, feel condescended to,
or feel rushed?

If the reader is an **AI executor**: ask instead — where would a capable but context-free
agent guess wrong, over-comply, or lose the goal under all this detail? Cut the
over-specification; sharpen the genuinely ambiguous parts.

Either way, revise once, then stop.

## 4. When to ask instead of guessing

If you lack the context to model the reader (unknown recipient, unclear stakes), ask for
a one-line reader card rather than fabricating one:

```
Audience · reads how (skim / close / executes literally) · capability ·
knows · doesn't · cares about · desired action · leave unsaid
```

For recurring recipients, keep profiles in `references/audience-profiles.md` and read
that file only when a matching recipient comes up — it costs no context until then.

## 5. What good looks like

**Example 1 — PR description (embedded case, written after a hotfix).**
The fix also quietly works around a flaky upstream API.

- Weak (literal dump): "Fixed the crash. Not sure why the upstream API keeps timing out,
  maybe their load balancer?" — broadcasts live doubt, invites bikeshedding, makes a fast
  merge feel risky.
- Strong (audience-aware): states what changed and why it's safe to merge now; the
  flakiness becomes a linked follow-up issue, not aired uncertainty. Backstage: the
  reviewer's only real question is "can I approve this quickly?"

**Example 2 — message to a senior advisor billed by the hour; you need a decision Friday.**

- Weak: "Can you confirm by Friday? We're waiting on you." — reads as chasing someone you
  can't actually rush.
- Strong: frame Friday as _your_ downstream constraint, give an easy path to respond, and
  leave "we've already consulted another firm" unsaid — that omission is load-bearing.

**Example 3 — a task prompt you are writing for a downstream coding agent.**

- Weak (over-specified, treats it as level-0): a 20-step checklist — "open the file, find
  the function, add a parameter, save, run the tests, if they fail read the error..." —
  buries the goal and boxes in a capable model.
- Strong (WHAT + constraints + acceptance, trust the HOW): "Add optional rate-limiting to
  the `/charge` client. Constraint: do not change the public signature. Done when: existing
  tests pass and a new test covers the limit being hit. Method is your call." Judgment is
  invited, not replaced.

The common thread: model the reader's real level, spend words where they change the
outcome, and let the reasoning stay backstage. The reader — person or agent — sees only a
clean artifact that happens to land right.
