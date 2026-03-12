import { createRunRecord } from "../../core/session_schema.mjs";
import { createRuntime } from "../../core/runtime.mjs";

export function createFixtureAdapters(overrides = {}) {
  return {
    runTavilySearch({ query }) {
      return {
        request_id: "search-fixture",
        results: [
          {
            url: "https://official.example.com/page",
            title: "Official page",
            content: `${query} official support`,
            score: 0.92,
            published_date: "2026-02-01",
          },
          {
            url: "https://news.example.com/page",
            title: "News page",
            content: `${query} reported by a news source`,
            score: 0.72,
            published_date: "2026-01-10",
          },
          {
            url: "https://community.example.com/page",
            title: "Community page",
            content: `${query} community discussion`,
            score: 0.51,
            published_date: "2025-12-20",
          },
        ],
      };
    },
    runTavilyExtract({ urls, query }) {
      return {
        request_id: "extract-fixture",
        results: urls.map((url) => ({
          url,
          title: `Extracted ${url}`,
          raw_content: `${query} with direct evidence and primary source support`,
          published_date: "2026-02-01",
        })),
      };
    },
    runTavilyMap({ url }) {
      return {
        request_id: "map-fixture",
        results: [`${url}/docs/auth`, `${url}/docs/security`, `${url}/policies/privacy`],
      };
    },
    runTavilyCrawl({ selectPaths = [] }) {
      return {
        request_id: "crawl-fixture",
        results: selectPaths.map((path) => ({
          url: `https://example.com${path}`,
          title: path,
          raw_content: `Crawled content for ${path}`,
        })),
      };
    },
    runTavilyResearch({ input }) {
      return {
        request_id: "research-fixture",
        content: `Hypothesis one. Hypothesis two. ${input} likely involves pricing, deployment, and adoption.`,
      };
    },
    hasBraveContext() {
      return false;
    },
    runBraveContext({ query }) {
      return {
        results: [
          {
            url: "https://example.com/brave-result",
            title: "Brave context result",
            snippets: [`${query} with brave context evidence and grounded snippets`],
            hostname: "example.com",
            published_date: "2026-02-01",
          },
        ],
      };
    },
    hasGeminiGrounding() {
      return false;
    },
    runGeminiGrounding({ query }) {
      return {
        content: `${query} involves multiple factors. Key considerations include scope, impact, and methodology.`,
        web_search_queries: [`${query} overview`, `${query} details`],
        grounding_chunks: [
          { uri: "https://vertexaisearch.cloud.google.com/...", title: "example.com" },
        ],
        grounding_supports: [
          {
            text: `${query} involves multiple factors.`,
            start_index: 0,
            end_index: 40,
            chunk_indices: [0],
          },
        ],
      };
    },
    runManusTask({ prompt, profile }) {
      return {
        task_id: `manus-${profile}`,
        task_url: `https://manus.example/tasks/${encodeURIComponent(prompt)}`,
      };
    },
    ...overrides,
  };
}

export function legacyV2SessionFixture() {
  return {
    session_id: "legacy-session",
    status: "open",
    stage: "verify",
    depth: "standard",
    domains: ["example.com"],
    path_hint: "default",
    user_query: "Is product X SOC 2 certified?",
    claims: [
      {
        claim_id: "legacy-claim",
        text: "Is product X SOC 2 certified?",
        priority: "high",
        status: "supported",
        evidence_ids: ["legacy-evidence"],
      },
    ],
    evidence: [
      {
        evidence_id: "legacy-evidence",
        run_id: "legacy-run",
        url: "",
        domain: "tavily",
        title: "Synthetic summary",
        summary: "This is a synthetic broad summary.",
        quality: "medium",
        source_type: "synthetic",
        supports_claim_ids: ["legacy-claim"],
        opposes_claim_ids: [],
      },
    ],
    contradictions: [],
    scores: {
      confidence_score: 0.8,
    },
    final_answer: {
      summary: "Legacy summary.",
    },
  };
}

export function runRecordFixture() {
  return createRunRecord("tavily", "search", "fixture query");
}

export function createTestRuntime(session, adapters = createFixtureAdapters()) {
  return createRuntime(session, adapters, async () => undefined);
}
