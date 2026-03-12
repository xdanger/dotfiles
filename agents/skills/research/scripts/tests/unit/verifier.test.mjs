import assert from "node:assert/strict";
import test from "node:test";

import { createSession, queueWorkItem } from "../../core/session_schema.mjs";
import { planSession } from "../../core/planner.mjs";
import { verifyClaims, reconcileClaims } from "../../core/verifier.mjs";
import { createFixtureAdapters, createTestRuntime } from "../fixtures/provider_fixtures.mjs";

test("verifyClaims uses claim-centric queries and creates contradictions when needed", async () => {
  const adapters = createFixtureAdapters({
    runTavilySearch({ query }) {
      return {
        request_id: "verify-search",
        results: [
          {
            url: "https://official.example.com/yes",
            title: "Yes",
            content: `${query} is true`,
            score: 0.91,
          },
          {
            url: "https://official.example.com/no",
            title: "No",
            content: `${query} is not true`,
            score: 0.9,
          },
        ],
      };
    },
    runTavilyExtract({ urls, query }) {
      return {
        request_id: "verify-extract",
        results: urls.map((url) => ({
          url,
          title: url,
          raw_content: url.includes("/no")
            ? "Official record states product X is not SOC 2 certified."
            : "Official record states product X is SOC 2 certified.",
        })),
      };
    },
  });

  const session = createSession({
    query: "Is product X SOC 2 certified, and what is the evidence?",
    depth: "standard",
    domains: [],
  });
  const runtime = createTestRuntime(session, adapters);
  await planSession(session, runtime);
  const targetClaim = session.claims[0];
  const workItem = queueWorkItem(session, {
    kind: "verify_claim",
    scopeType: "claim",
    scopeId: targetClaim.claim_id,
    reason: "Unit test claim verification.",
  });
  await verifyClaims(session, runtime, workItem);
  reconcileClaims(session);

  assert.ok(session.runs.some((run) => run.tool === "search"));
  assert.ok(session.contradictions.length > 0);
  assert.ok(
    session.evidence.every((item) =>
      item.claim_links.some((link) => link.claim_id === targetClaim.claim_id),
    ),
  );
});
