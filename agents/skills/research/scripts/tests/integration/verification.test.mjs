import assert from "node:assert/strict";
import test from "node:test";

import { createFixtureAdapters } from "../fixtures/provider_fixtures.mjs";
import { createSession } from "../../core/session_schema.mjs";
import { runOrchestrator } from "../../research_session.mjs";
import { summarizeReport } from "../../core/synthesizer.mjs";

test("verification flow creates claim-level evidence with attribution", async () => {
  const session = createSession({
    query: "Is product X SOC 2 certified, and what is the evidence?",
    depth: "standard",
    domains: ["example.com"],
  });

  await runOrchestrator(session, createFixtureAdapters(), 16);

  assert.equal(session.task_shape, "verification");
  assert.ok(session.evidence.length > 0);
  assert.ok(
    session.evidence.every(
      (item) =>
        Array.isArray(item.claim_links) &&
        item.claim_links.every(
          (link) =>
            link.claim_id &&
            (link.stance === "unassessed" || link.stance === "context") &&
            link.reason,
        ),
    ),
    "Runtime-gathered evidence should only have unassessed or context stance",
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

test("verification synthesis produces a report even without agent stance assessment", async () => {
  const session = createSession({
    query: "Does product X support SSO?",
    depth: "standard",
    domains: ["example.com"],
  });

  await runOrchestrator(session, createFixtureAdapters(), 16);
  const report = summarizeReport(session);

  assert.equal(session.task_shape, "verification");
  assert.match(report, /# Answer Summary/u);
  assert.ok(session.findings.length > 0);
  assert.ok(session.final_answer.citations.length > 0);
});

test("verification collects evidence from official sources with proper attribution", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch() {
      return {
        request_id: "endpoint-search",
        results: [
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
            url === "https://developers.openai.com/api/docs/guides/deep-research"
              ? "Deep research | OpenAI API"
              : "Plans for Deep Research tools and the API",
          raw_content:
            url === "https://developers.openai.com/api/docs/guides/deep-research"
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

  await runOrchestrator(session, adapters, 16);

  assert.equal(session.task_shape, "verification");
  assert.ok(session.evidence.length > 0);
  assert.ok(
    session.evidence.some(
      (item) =>
        item.url ===
          "https://community.openai.com/t/plans-for-deep-research-tools-and-the-api/1111030" &&
        item.source_type === "community",
    ),
  );
  assert.ok(
    session.evidence.every((item) =>
      item.claim_links.every((link) => link.attribution && link.attribution.anchor_text),
    ),
  );
});

test("evidence-collected findings include context evidence in synthesis", async () => {
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
        ],
      };
    },
    runTavilyExtract({ urls }) {
      return {
        request_id: "live-like-extract",
        results: urls.map((url) => ({
          url,
          title: "Introduction to deep research in the OpenAI API",
          raw_content:
            "Programmatically kicking off a deep research task is as simple as calling the OpenAI Responses API.",
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

  await runOrchestrator(session, adapters, 16);
  const report = summarizeReport(session);

  assert.ok(session.findings.some((item) => item.context_evidence.length > 0));
  assert.match(report, /Introduction to deep research/u);
});

test("no false contradictions are created from unassessed evidence", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch({ query }) {
      return {
        request_id: "no-contradiction-search",
        results: [
          {
            url: "https://official.example.com/a",
            title: "Source A",
            content: `${query} is confirmed by official sources`,
            score: 0.95,
          },
          {
            url: "https://official.example.com/b",
            title: "Source B",
            content: `${query} is not a draft, it is final`,
            score: 0.9,
          },
        ],
      };
    },
    runTavilyExtract({ urls }) {
      return {
        request_id: "no-contradiction-extract",
        results: urls.map((url) => ({
          url,
          title: url.includes("/a") ? "Source A" : "Source B",
          raw_content: url.includes("/a")
            ? "The paper was published in PNAS (not a preprint)."
            : "This is the final published version, not a preprint.",
          published_date: "2026-02-01",
        })),
      };
    },
  });

  const session = createSession({
    query: "Was the paper published in PNAS (not a preprint)?",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, adapters, 16);

  const openContradictions = session.contradictions.filter((item) => item.status === "open");
  assert.equal(
    openContradictions.length,
    0,
    "No false contradictions from negation in claim text",
  );
});
