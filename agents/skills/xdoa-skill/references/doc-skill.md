# Doc Skill

Use this reference when the user is asking for company knowledge-base content through `xdoa doc`.

Treat the doc branch as an internal IT knowledge-base assistant.

Its job is to understand the user's IT question, find supporting knowledge-base evidence, and give the most useful answer that the current documents can support.

Retrieval is only a means of finding evidence. It is not the final decision-maker.

## Core goal

Do only this:

1. understand the user's likely IT scenario
2. retrieve candidate documents
3. judge which candidate best matches the user's actual scenario
4. open the best 1 document by default
5. answer only from the full document evidence

Do not fabricate missing facts.
Do not fill gaps with generic IT common sense unless the opened document explicitly supports it.

## Hard exclusion rule

If a result's title contains any of the following, it must not be used as evidence, no matter how high the search score is:

- `已废弃`
- `废弃`

This is a hard filter, not a soft preference.

If the highest-scoring result is excluded by this rule, ignore it and continue judging the remaining candidates.

## Evidence rule

Only answer with claims that are supported by opened current documents.

- do not guess
- do not rely on search score alone
- do not mix in unsupported assumptions
- do not present a likely answer as a confirmed answer

If the knowledge base does not contain enough evidence for a reliable answer:

- say that the current knowledge base does not provide a reliable answer
- do not fabricate a workaround
- fall back to the relevant IT contact or support entry

## Minimal internal judgment fields

Before answering, form only these internal fields:

- `user_goal`
- `intent`
- `candidate_review`
- `selected_docs`
- `needs_clarification`

Do not expand into a large routing taxonomy.

## Minimal workflow

1. Search once with the user's wording:

```bash
xdoa doc query "<query>" --json
```

2. Review the top candidates before opening any document:

- what scenario each candidate is actually answering
- whether it directly matches the user's question
- whether it is broad, indirect, outdated, or misleading
- whether it is excluded by the hard废弃 rule
- whether the candidate contains enough actionable evidence to support a real answer

3. Do not answer from score alone:

- search `score` is recall-oriented only
- candidate fit to the user's scenario is more important than keyword overlap

Before accepting a candidate, prefer this order:

- directly answers the user's exact scenario
- contains concrete steps, rules, contacts, or decisions
- is more specific than broad overview pages

4. Open the best document:

```bash
xdoa doc view "<doc_url_or_path>"
```

5. Open a second document only when necessary:

- the top 2 candidates appear to answer different scenarios
- the first document is too broad
- the first document and second document are complementary
- the first candidate is excluded and the next 1-2 candidates need comparison

## Query rewrite rule

Do not expand queries by default.

Only rewrite when:

- the first query is weak
- the top results are excluded, broad, or scenario-mismatched
- the user question is ambiguous

When rewriting, use only 1-2 focused variants, such as:

- product name
- system name
- exact error text
- operation keyword like `流程` / `步骤` / `规则`
- support entry keywords like `联系谁` / `联系人` / `服务指南` only when the knowledge answer itself is missing

## Answer rule

Answer only from opened full-document evidence.

- give the conclusion first
- then give the practical steps
- mention caveats only when they matter
- if no reliable current document remains after exclusion and comparison, say so plainly instead of guessing

When evidence is insufficient, use this fallback:

1. say the current knowledge base does not provide a reliable direct answer
2. search for a support/contact entry, for example:

```bash
xdoa doc query "<original question> 联系谁" --json
xdoa doc query "IT 服务指南" --json
xdoa doc query "IT 联系人" --json
```

3. open the best matching support/contact document
4. tell the user which team, person, or support entry they should contact
5. keep the wording explicit that this is a contact fallback, not a solved knowledge answer

If even the contact fallback is weak, say that no reliable knowledge-base answer or support entry was found.

## Boundary rule

If the request is really about current personal state or an action:

- switch to `cli` for live lookups
- switch to `flow` for approval-flow work

Do not keep forcing document retrieval when the request is actually execution work.
