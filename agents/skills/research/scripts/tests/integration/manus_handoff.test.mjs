import assert from "node:assert/strict";
import test from "node:test";

import { createFixtureAdapters } from "../fixtures/provider_fixtures.mjs";
import { createSession } from "../../core/session_schema.mjs";
import { rejoinRemoteResults, runOrchestrator } from "../../research_session.mjs";

test("Manus handoff records structured metadata", async () => {
  const session = createSession({
    query: "Research this market and deliver a CSV with top vendors",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, createFixtureAdapters(), 6);

  assert.equal(session.task_shape, "async");
  assert.equal(session.status, "waiting_remote");
  assert.equal(session.handoff?.provider, "manus");
  assert.equal(session.handoff?.profile, "manus-1.6");
  assert.equal(session.handoff?.state, "submitted");
});

test("remote rejoin normalizes URL-backed evidence into the local ledger", async () => {
  const session = createSession({
    query: "Research this market and deliver a CSV with top vendors",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, createFixtureAdapters(), 6);
  const targetClaim = session.claims[0];

  rejoinRemoteResults(session, {
    summary: "Remote work completed.",
    evidence: [
      {
        url: "https://official.example.com/vendors",
        title: "Official vendor list",
        excerpt: "The official page lists the vendors.",
        source_type: "official",
        quality: "high",
        claim_links: [
          {
            claim_id: targetClaim.claim_id,
            stance: "support",
            reason: "The evidence directly supports the async claim.",
          },
        ],
      },
    ],
  });

  assert.equal(session.handoff?.state, "rejoin_pending");
  assert.ok(session.work_items.some((item) => item.kind === "rejoin_handoff"));
  await runOrchestrator(session, createFixtureAdapters(), 8);

  assert.equal(session.handoff?.state, "rejoined");
  assert.equal(session.status, "completed");
  assert.ok(
    session.evidence.some((item) =>
      item.claim_links.some((link) => link.claim_id === targetClaim.claim_id),
    ),
  );
  assert.ok(session.entities.length > 0);
  assert.ok(session.observations.length > 0);
});
