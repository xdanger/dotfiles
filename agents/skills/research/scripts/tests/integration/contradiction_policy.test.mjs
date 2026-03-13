import assert from "node:assert/strict";
import test from "node:test";

import { createFixtureAdapters } from "../fixtures/provider_fixtures.mjs";
import { createSession } from "../../core/session_schema.mjs";
import { runOrchestrator } from "../../research_session.mjs";

test("runtime does not create false contradictions from unassessed evidence", async () => {
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

  await runOrchestrator(session, adapters, 16);

  const openContradictions = session.contradictions.filter((item) => item.status === "open");
  assert.equal(
    openContradictions.length,
    0,
    "No contradictions from unassessed evidence — stance judgment is deferred to the agent",
  );
  assert.ok(
    session.evidence.every((item) =>
      item.claim_links.every(
        (link) => link.stance === "unassessed" || link.stance === "context",
      ),
    ),
    "All evidence has unassessed or context stance",
  );
});
