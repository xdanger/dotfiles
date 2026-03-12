# Provider Routing

Use providers deliberately. The research skill is remote-first, but not remote-only.

## Tavily Research

Best for:

- broad synthesis
- comparison reports
- topic overviews
- quick subreports for one research thread

Tradeoff:

- fast path to synthesis
- less explicit control over intermediate search decisions

## Tavily Search

Best for:

- breadth
- freshness
- domain diversity
- explicit verification

Tradeoff:

- higher control
- more orchestration work in the session script

## Tavily Extract

Best for:

- close reading of high-value URLs
- pulling focused evidence from search results
- quote or claim verification

Tradeoff:

- depends on already knowing which URLs matter

## Tavily Map and Crawl

Best for:

- documentation or policy sites
- site structure discovery
- finding relevant sections before extraction

Tradeoff:

- more expensive and slower than basic search
- should be scoped tightly

## Brave LLM Context

Best for:

- search + extract in a single call
- source-controlled retrieval via Goggles (allowlists, boosts)
- cross-engine verification alongside Tavily
- token-budgeted context for tight claim checks

Tradeoff:

- requires `BRAVE_SEARCH_API_KEY` environment variable
- no MCP tool — called directly via HTTP
- runs as a supplement to Tavily on the first gather round, not a replacement

## Gemini Grounding Search

Best for:

- planning accelerator (alongside Tavily Research)
- Google-grounded synthesis with segment-level attribution
- subquery suggestions via `webSearchQueries`

Tradeoff:

- requires `GEMINI_API_KEY` environment variable
- grounding chunk URIs are proxied (`vertexaisearch.cloud.google.com`), not original source URLs
- not suitable as an evidence source — used for planning artifacts only
- no MCP tool — called directly via HTTP

## Manus

Best for:

- long-running work
- connector-backed research
- deliverables such as PDF, PPT, or CSV
- asynchronous continuation when the remote agent needs follow-up

Tradeoff:

- less local control over intermediate reasoning
- better as an escalation path than the default engine for this MVP
