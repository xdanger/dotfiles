---
name: audience-aware-comms
description: Calibrate writing for a reader beyond the current conversation, including messages, docs, PR descriptions, and downstream agent prompts. Exclude ordinary chat replies, verbatim text, commit messages, and code or other deterministic output.
---

# Audience-Aware Communication

The description is the trigger. If the text turns out to be one of its exclusions — an
in-chat reply to the current user, dictated-verbatim text, a commit message, or output a
deterministic interpreter consumes — drop this skill and respond normally.

Writing lands only when it fits the reader's real capability. The two usual misses mirror
each other:

- **Human reader → under-modeling.** Writing for a literal token-absorber: too blunt,
  spelling out what they would infer, airing what is better left unsaid.
- **AI executor → over-specifying.** Treating a capable reasoner as a level-0 machine:
  rote steps that bury the goal, waste context, and suppress its judgment.

## 1. Model the reader — in your thinking, never in the output

1. **Who:** capability, what they know and don't, what they care about, and the one
   action or decision you want. Use context already in hand; if it is thin, see §4.
2. **Climb the ladder** as far as the stakes justify:
   - **L1:** what a literal read gives them.
   - **L2:** what they infer about your intent and situation from how it is written and
     what is missing.
   - **L3** (high stakes): they expect you to anticipate their reaction — does that change
     the move?
3. **Choose omissions.** Don't state what they can infer, over-justify, or raise
   obligations and anxieties without purpose. Know which omissions are load-bearing.
4. **Set register and grain** for the reader and channel.

### When the reader is an AI agent

- **Model capability, not feelings.** Frontier agents need a clear target, not rote
  steps; omission here grants latitude rather than tact.
- **Specify the WHAT, trust the HOW.** Pin down the goal, hard constraints, interfaces,
  acceptance criteria, and any ambiguity where a wrong guess is costly. Leave the method
  and obvious sub-steps to the executor, as you would with a senior engineer.
- **Find where it will guess wrong.** A context-free executor fills blanks with
  assumptions; spend words on those blanks, not on steps it already knows.

## 2. Output

- The deliverable is **only the finished artifact**: no reader analysis, ladder, or
  "considering what they think I think" meta. Progress, verification results, and
  limitations reported to the current user are unaffected.
- Ship the **leanest version that achieves the goal.**
- **No manipulation or false claims.** Modeling the reader serves clarity, tact, and
  calibration, never steering them against their own interest.

## 3. Self-check — high stakes only

- **Human:** cold-read it as the recipient. First reaction? Unintended subtext? Anywhere
  they would bristle, feel condescended to, or feel rushed?
- **AI executor:** where would a capable but context-free agent guess wrong, over-comply,
  or lose the goal under the detail? Cut over-specification; sharpen real ambiguity.

Revise once, then stop.

## 4. Infer or ask

Infer a conventional audience when that suffices (e.g., repository contributors reading
a PR description). Don't invent personal facts. Ask only when missing reader information
would materially change a commitment, key wording, or the desired action. Optional reader
card:

```
Audience · reads how (skim / close / executes literally) · capability ·
knows · doesn't · cares about · desired action · leave unsaid
```

For recurring recipients, read `references/audience-profiles.md` only when one matches.

## 5. Examples

- **PR description for a hotfix that also works around a flaky upstream API.** Weak:
  "Fixed the crash. Not sure why upstream keeps timing out, maybe their load balancer?" —
  airs doubt and makes a fast merge feel risky. Strong: what changed and why it is safe
  to merge now, with the flakiness as a linked follow-up issue. The reviewer's real
  question is "can I approve this quickly?"
- **Message to an hourly-billed senior advisor; you need a decision by Friday.** Weak:
  "Can you confirm by Friday? We're waiting on you." — chases someone you can't rush.
  Strong: frame Friday as your downstream constraint, make replying easy, and leave "we've
  consulted another firm" unsaid; that omission is load-bearing.
- **Task prompt for a downstream coding agent.** Weak: a 20-step checklist ("open the
  file, find the function, add a parameter, run the tests…") that buries the goal. Strong:
  "Add optional rate-limiting to the `/charge` client. Don't change the public signature.
  Done when existing tests pass and a new test covers hitting the limit. Method is your
  call."
