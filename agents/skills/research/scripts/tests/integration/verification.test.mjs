import assert from "node:assert/strict";
import test from "node:test";

import { createFixtureAdapters } from "../fixtures/provider_fixtures.mjs";
import { createSession } from "../../core/session_schema.mjs";
import { runOrchestrator } from "../../research_session.mjs";
import { summarizeReport } from "../../core/synthesizer.mjs";

test("verification flow creates claim-level evidence and stop reasons", async () => {
  const session = createSession({
    query: "Is product X SOC 2 certified, and what is the evidence?",
    depth: "standard",
    domains: ["example.com"],
  });

  await runOrchestrator(session, createFixtureAdapters(), 12);

  assert.equal(session.task_shape, "verification");
  assert.ok(session.evidence.length > 0);
  assert.ok(
    session.evidence.every(
      (item) =>
        Array.isArray(item.claim_links) &&
        item.claim_links.every(
          (link) =>
            link.claim_id &&
            ["support", "oppose", "context"].includes(link.stance) &&
            link.reason,
        ),
    ),
  );
  assert.ok(session.stop_status.reason.length > 0);
  assert.ok(
    session.claims.every(
      (claim) =>
        claim.assessment &&
        claim.assessment.verdict &&
        claim.assessment.sufficiency &&
        Array.isArray(claim.assessment.missing_dimensions),
    ),
  );
});

test("negative but resolved answers appear in the final synthesis", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch({ query }) {
      return {
        request_id: "negative-search",
        results: [
          {
            url: "https://official.example.com/no",
            title: "Official no",
            content: `${query} is not supported`,
            score: 0.95,
          },
        ],
      };
    },
    runTavilyExtract({ urls, query }) {
      return {
        request_id: "negative-extract",
        results: urls.map((url) => ({
          url,
          title: url,
          raw_content: `${query} is not supported by the official source`,
          published_date: "2026-02-01",
        })),
      };
    },
  });

  const session = createSession({
    query: "Is product X certified?",
    depth: "standard",
    domains: ["example.com"],
  });

  await runOrchestrator(session, adapters, 12);
  const report = summarizeReport(session);

  assert.equal(session.status, "completed");
  assert.match(report, /# Answer Summary/u);
  assert.match(report, /No\./u);
});

test("verification reports answer directly instead of echoing the claim", async () => {
  const session = createSession({
    query: "Does product X support SSO?",
    depth: "standard",
    domains: ["example.com"],
  });

  await runOrchestrator(session, createFixtureAdapters(), 12);
  const report = summarizeReport(session);

  assert.equal(session.task_shape, "verification");
  assert.match(report, /# Answer Summary/u);
  assert.match(report, /Yes\./u);
  assert.ok(session.findings.length > 0);
});

test("verification answer summary surfaces concrete endpoint details", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch() {
      return {
        request_id: "endpoint-search",
        results: [
          {
            url: "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api",
            title: "Introduction to deep research in the OpenAI API",
            content: "Official cookbook guide for deep research in the API.",
            score: 0.94,
          },
          {
            url: "https://developers.openai.com/api/docs/guides/deep-research",
            title: "Deep research | OpenAI API",
            content: "Official API guide for deep research.",
            score: 0.97,
          },
          {
            url: "https://community.openai.com/t/plans-for-deep-research-tools-and-the-api/1111030",
            title: "Plans for Deep Research tools and the API",
            content: "Community discussion about deep research.",
            score: 0.7,
          },
        ],
      };
    },
    runTavilyExtract({ urls }) {
      return {
        request_id: "endpoint-extract",
        results: urls.map((url) => ({
          url,
          title:
            url ===
            "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api"
              ? "Introduction to deep research in the OpenAI API"
              : url === "https://developers.openai.com/api/docs/guides/deep-research"
                ? "Deep research | OpenAI API"
                : "Plans for Deep Research tools and the API",
          raw_content:
            url ===
            "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api"
              ? "The Deep Research API is available in the OpenAI API. ```python client.responses.create(...) ``` You can inspect intermediate steps after starting a task."
              : url === "https://developers.openai.com/api/docs/guides/deep-research"
                ? "Use the Responses API to start deep research tasks in the OpenAI API."
                : "Forum thread speculating about API support.",
          published_date: "2026-02-01",
        })),
      };
    },
  });

  const session = createSession({
    query: "Does OpenAI expose deep research in the API, and if so through which endpoint?",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, adapters, 12);
  const report = summarizeReport(session);

  assert.equal(session.task_shape, "verification");
  assert.match(report, /Yes\. OpenAI exposes deep research in the API\./u);
  assert.match(report, /Responses API/u);
  assert.doesNotMatch(report, /```/u);
  assert.ok(
    session.evidence.some(
      (item) =>
        item.url ===
          "https://community.openai.com/t/plans-for-deep-research-tools-and-the-api/1111030" &&
        item.source_type === "community",
    ),
  );
});

test("verification answer summary can recover concrete details from the session evidence", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch() {
      return {
        request_id: "live-like-search",
        results: [
          {
            url: "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api",
            title: "Introduction to deep research in the OpenAI API",
            content: "Official cookbook introduction to deep research in the API.",
            score: 0.97,
          },
          {
            url: "https://docs.msty.app/how-to-guides/openai-deep-research-with-msty",
            title: "OpenAI Deep Research like service with Msty - Msty Docs",
            content: "Third-party docs about an OpenAI-compatible endpoint.",
            score: 0.91,
          },
        ],
      };
    },
    runTavilyExtract({ urls }) {
      return {
        request_id: "live-like-extract",
        results: urls.map((url) => ({
          url,
          title:
            url ===
            "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api"
              ? "Introduction to deep research in the OpenAI API"
              : "OpenAI Deep Research like service with Msty - Msty Docs",
          raw_content:
            url ===
            "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api"
              ? "Programmatically kicking off a deep research task is as simple as calling the OpenAI Responses API."
              : "Choose an OpenAI-compatible endpoint in Msty and configure the remote model provider.",
          published_date: "2026-02-01",
        })),
      };
    },
  });

  const session = createSession({
    query: "Does OpenAI expose deep research in the API, and if so through which endpoint?",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, adapters, 12);
  const report = summarizeReport(session);
  const detailFinding = session.findings.find((item) => item.thread_title === "Concrete API surface");

  assert.equal(
    detailFinding?.support_evidence[0]?.title,
    "Introduction to deep research in the OpenAI API",
  );
  assert.match(report, /Responses API/u);
});

test("mixed detail threads stay readable in the final synthesis", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch({ query }) {
      if (/endpoint|api reference|official docs|Responses API/u.test(query)) {
        return {
          request_id: "mixed-detail-search",
          results: [
            {
              url: "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api",
              title: "Introduction to deep research in the OpenAI API",
              content: "Official cookbook example for the Responses API.",
              score: 0.97,
            },
            {
              url: "https://platform.openai.com/docs/models/o3-deep-research",
              title: "o3-deep-research Model | OpenAI API",
              content: "Model page without a concrete endpoint detail.",
              score: 0.95,
            },
          ],
        };
      }
      return {
        request_id: "mixed-direct-search",
        results: [
          {
            url: "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api",
            title: "Introduction to deep research in the OpenAI API",
            content: "Official cookbook introduction to deep research in the API.",
            score: 0.97,
          },
        ],
      };
    },
    runTavilyExtract({ urls }) {
      return {
        request_id: "mixed-detail-extract",
        results: urls.map((url) => ({
          url,
          title:
            url ===
            "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api"
              ? "Introduction to deep research in the OpenAI API"
              : "o3-deep-research Model | OpenAI API",
          raw_content:
            url ===
            "https://developers.openai.com/cookbook/examples/deep_research_api/introduction_to_deep_research_api"
              ? "Programmatically kicking off a deep research task is as simple as calling the OpenAI Responses API."
              : "The model page documents the model family, but it does not explicitly confirm a dedicated endpoint.",
          published_date: "2026-02-01",
        })),
      };
    },
  });

  const session = createSession({
    query: "Does OpenAI expose deep research in the API, and if so through which endpoint?",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, adapters, 12);
  const report = summarizeReport(session);

  assert.match(report, /The detail remains unresolved\./u);
  assert.doesNotMatch(report, /supports the point, but .* contradicts it\./u);
});

test("verification answer summary keeps endpoint uncertainty explicit when detail evidence is mixed", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch({ query }) {
      if (/endpoint|api reference|official docs/u.test(query)) {
        return {
          request_id: "mixed-detail-search",
          results: [
            {
              url: "https://cookbook.openai.com/examples/deep_research_api/introduction_to_deep_research_api",
              title: "Introduction to deep research in the OpenAI API",
              content: "Official cookbook example for the Responses API.",
              score: 0.95,
            },
            {
              url: "https://platform.openai.com/docs/models/o3-deep-research",
              title: "o3-deep-research Model | OpenAI API",
              content: "Model page without a concrete endpoint detail.",
              score: 0.93,
            },
          ],
        };
      }
      return {
        request_id: "mixed-direct-search",
        results: [
          {
            url: "https://cookbook.openai.com/examples/deep_research_api/introduction_to_deep_research_api",
            title: "Introduction to deep research in the OpenAI API",
            content: "Official cookbook example for the Responses API.",
            score: 0.95,
          },
        ],
      };
    },
    runTavilyExtract({ urls }) {
      return {
        request_id: "mixed-detail-extract",
        results: urls.map((url) => ({
          url,
          title: url.includes("cookbook.openai.com")
            ? "Introduction to deep research in the OpenAI API"
            : "o3-deep-research Model | OpenAI API",
          raw_content: url.includes("cookbook.openai.com")
            ? "OpenAI exposes deep research in the API through the Responses API."
            : "The model page states that o3-deep-research is available, but not via the Responses API.",
          published_date: "2026-02-01",
        })),
      };
    },
  });

  const session = createSession({
    query: "Does OpenAI expose deep research in the API, and if so through which endpoint?",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, adapters, 12);

  assert.match(session.final_answer.answer_summary, /Not conclusively/u);
  assert.match(session.final_answer.answer_summary, /Responses API/u);
  assert.match(session.final_answer.answer_summary, /Conflicting evidence/u);
});
