import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../../core/session_schema.mjs";
import { planSession } from "../../core/planner.mjs";
import {
  gatherEvidence,
  inferQuality,
  inferSourceType,
  mergeEvidenceRecords,
} from "../../core/retrieval.mjs";
import { sourcesForSession } from "../../core/synthesizer.mjs";
import { createFixtureAdapters, createTestRuntime } from "../fixtures/provider_fixtures.mjs";

test("gatherEvidence records candidate filtering and domain budgeting", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch({ query }) {
      return {
        request_id: "search-budget",
        results: [
          {
            url: "https://official.example.com/a",
            title: "A",
            content: `${query} official`,
            score: 0.95,
          },
          {
            url: "https://official.example.com/b",
            title: "B",
            content: `${query} official second`,
            score: 0.9,
          },
          {
            url: "https://official.example.com/c",
            title: "C",
            content: `${query} official third`,
            score: 0.88,
          },
          {
            url: "https://news.example.com/a",
            title: "News",
            content: `${query} news`,
            score: 0.7,
          },
        ],
      };
    },
  });

  const session = createSession({
    query: "Is product X SOC 2 certified, and what is the evidence?",
    depth: "quick",
    domains: [],
  });
  const runtime = createTestRuntime(session, adapters);
  await planSession(session, runtime);
  const workItem = session.work_items.find((item) => item.kind === "gather_thread");
  await gatherEvidence(session, runtime, workItem);

  assert.ok(session.candidate_urls.some((item) => item.selected));
  assert.ok(session.candidate_urls.some((item) => item.filter_reason === "domain_cap"));
  assert.ok(session.evidence.length > 0);
  assert.ok(session.evidence.every((item) => Array.isArray(item.claim_links)));
  assert.ok(session.evidence.every((item) => item.attribution?.anchor_text));
  assert.ok(
    session.evidence.every((item) =>
      item.claim_links.every((link) => link.attribution?.excerpt_method),
    ),
  );
});

test("gatherEvidence executes more than the first subquery when fanout allows it", async () => {
  const observedQueries = [];
  const adapters = createFixtureAdapters({
    runTavilySearch({ query }) {
      observedQueries.push(query);
      return {
        request_id: `search-${observedQueries.length}`,
        results: [
          {
            url: `https://official.example.com/${observedQueries.length}`,
            title: `Result ${observedQueries.length}`,
            content: `${query} official`,
            score: 0.9,
          },
        ],
      };
    },
  });

  const session = createSession({
    query: "Research the AI coding agent landscape in 2026",
    depth: "standard",
    domains: [],
  });
  const runtime = createTestRuntime(session, adapters);
  await planSession(session, runtime);
  const workItem = session.work_items.find((item) => item.kind === "gather_thread");
  await gatherEvidence(session, runtime, workItem);

  assert.ok(observedQueries.length > 1);
});

test("mergeEvidenceRecords keeps the richer attribution on re-verification", () => {
  const existing = [
    {
      evidence_id: "evidence-1",
      url: "https://docs.example.com/sso",
      title: "SSO docs",
      excerpt: "Product X supports SSO through SAML.",
      claim_links: [
        {
          claim_id: "claim-1",
          stance: "support",
          reason: "Initial pass.",
          attribution: {
            anchor_text: "supports SSO",
            matched_sentence: "Product X supports SSO through SAML.",
            matched_sentence_index: 0,
            matched_tokens: ["supports", "sso"],
            excerpt_method: "sentence_token_match",
            attribution_confidence: 0.52,
          },
        },
      ],
      attribution: {
        anchor_text: "supports SSO",
        matched_sentence: "Product X supports SSO through SAML.",
        matched_sentence_index: 0,
        matched_tokens: ["supports", "sso"],
        excerpt_method: "sentence_token_match",
        attribution_confidence: 0.52,
      },
    },
  ];
  const incoming = [
    {
      evidence_id: "evidence-2",
      url: "https://docs.example.com/sso",
      title: "SSO docs",
      excerpt: "Product X supports SSO through SAML.",
      claim_links: [
        {
          claim_id: "claim-1",
          stance: "support",
          reason: "Re-verification found a better anchor.",
          attribution: {
            anchor_text: "supports SSO through SAML",
            matched_sentence: "Product X supports SSO through SAML.",
            matched_sentence_index: 0,
            matched_tokens: ["supports", "sso", "saml"],
            excerpt_method: "sentence_token_match",
            attribution_confidence: 0.83,
          },
        },
      ],
      attribution: {
        anchor_text: "supports SSO through SAML",
        matched_sentence: "Product X supports SSO through SAML.",
        matched_sentence_index: 0,
        matched_tokens: ["supports", "sso", "saml"],
        excerpt_method: "sentence_token_match",
        attribution_confidence: 0.83,
      },
    },
  ];

  const merged = mergeEvidenceRecords(existing, incoming);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].attribution.attribution_confidence, 0.83);
  assert.equal(merged[0].claim_links[0].attribution.attribution_confidence, 0.83);
});

test("sourcesForSession surfaces attribution in agent-facing source views", () => {
  const session = createSession({
    query: "Does product X support SSO?",
    depth: "standard",
    domains: [],
  });
  session.threads = [
    {
      thread_id: "thread-1",
      title: "Direct answer",
      intent: "answer the question directly",
      subqueries: [],
      claim_ids: ["claim-1"],
      notes: "",
      execution: {
        gather_status: "completed",
        verify_status: "completed",
        gather_rounds: 1,
        last_gathered_at: null,
        last_verified_at: null,
        open_claim_ids: [],
        last_continuation_id: null,
      },
    },
  ];
  session.claims = [
    {
      claim_id: "claim-1",
      thread_id: "thread-1",
      text: "Product X supports SSO.",
      claim_type: "fact",
      answer_relevance: "high",
      priority: "high",
      status: "supported",
      why_it_matters: "",
      evidence_ids: ["evidence-1"],
      verification: {
        status: "completed",
        attempts: 1,
        stale: false,
        last_checked_at: null,
        last_continuation_id: null,
      },
      assessment: {
        verdict: "supported",
        sufficiency: "sufficient",
        resolution_state: "resolved",
        support_evidence_ids: ["evidence-1"],
        oppose_evidence_ids: [],
        context_evidence_ids: [],
        primary_evidence_ids: ["evidence-1"],
        missing_dimensions: [],
        reason: "",
        confidence_label: "high",
        last_evaluated_at: null,
      },
    },
  ];
  session.evidence = [
    {
      evidence_id: "evidence-1",
      run_id: "run-1",
      url: "https://docs.example.com/sso",
      domain: "docs.example.com",
      title: "SSO docs",
      excerpt: "Product X supports SSO through SAML.",
      source_type: "docs",
      quality: "high",
      retrieval_score: 0.9,
      published_at: "2026-01-01",
      claim_links: [
        {
          claim_id: "claim-1",
          stance: "support",
          reason: "Direct docs support the claim.",
          attribution: {
            anchor_text: "supports SSO through SAML",
            matched_sentence: "Product X supports SSO through SAML.",
            matched_sentence_index: 0,
            matched_tokens: ["supports", "sso", "saml"],
            excerpt_method: "sentence_token_match",
            attribution_confidence: 0.88,
          },
        },
      ],
      attribution: {
        anchor_text: "supports SSO through SAML",
        matched_sentence: "Product X supports SSO through SAML.",
        matched_sentence_index: 0,
        matched_tokens: ["supports", "sso", "saml"],
        excerpt_method: "sentence_token_match",
        attribution_confidence: 0.88,
      },
      provenance: {
        query: "Product X SSO official docs",
        strategy: "claim_verification",
        operation_id: "op-1",
        work_item_id: "work-1",
      },
      legacy: false,
    },
  ];

  const sources = sourcesForSession(session);

  assert.equal(sources[0].attribution.anchor_text, "supports SSO through SAML");
  assert.equal(sources[0].claims[0].attribution.attribution_confidence, 0.88);
});

test("inferSourceType keeps news articles distinct from official docs", () => {
  assert.equal(
    inferSourceType(
      "https://techcrunch.com/2025/02/25/why-openai-isnt-bringing-deep-research-to-its-api-just-yet/",
      "Why OpenAI isn't bringing deep research to its API just yet",
      "A reported article about API availability.",
    ),
    "news",
  );
  assert.equal(
    inferSourceType(
      "https://developers.openai.com/api/docs/guides/deep-research/",
      "Deep research | OpenAI API",
      "Official API guide.",
    ),
    "docs",
  );
  assert.equal(
    inferSourceType(
      "https://cookbook.openai.com/examples/deep_research_api/introduction_to_deep_research_api",
      "Introduction to deep research in the OpenAI API",
      "Official cookbook example.",
    ),
    "docs",
  );
  assert.equal(
    inferSourceType(
      "https://community.openai.com/t/plans-for-deep-research-tools-and-the-api/1111030",
      "Plans for Deep Research tools and the API",
      "Forum discussion.",
    ),
    "community",
  );
  assert.equal(
    inferSourceType(
      "https://cobusgreyling.substack.com/p/openai-api-deep-research",
      "OpenAI API Deep Research",
      "Newsletter post.",
    ),
    "community",
  );
  assert.equal(inferQuality("docs"), "high");
  assert.equal(inferQuality("community"), "low");
});
