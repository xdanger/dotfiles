import assert from "node:assert/strict";
import test from "node:test";

import { createFixtureAdapters } from "../fixtures/provider_fixtures.mjs";
import { createSession } from "../../core/session_schema.mjs";
import { runOrchestrator } from "../../research_session.mjs";

test("contradictory policy case leaves unresolved contradiction when no tie-breaker exists", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch({ query }) {
      return {
        request_id: "contradiction-search",
        results: [
          {
            url: "https://official.example.com/yes",
            title: "Yes",
            content: `${query} is supported`,
            score: 0.92,
          },
          {
            url: "https://official.example.com/no",
            title: "No",
            content: `${query} is not supported`,
            score: 0.91,
          },
        ],
      };
    },
    runTavilyExtract({ urls, query }) {
      return {
        request_id: "contradiction-extract",
        results: urls.map((url) => ({
          url,
          title: url,
          raw_content: url.includes("/no")
            ? `${query} is not supported`
            : `${query} is supported`,
        })),
      };
    },
  });

  const session = createSession({
    query: "Is product X SOC 2 certified, and what is the evidence?",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, adapters, 12);

  assert.ok(session.contradictions.some((item) => item.status === "open"));
  assert.ok(session.stop_status.open_claim_ids.length > 0);
});
