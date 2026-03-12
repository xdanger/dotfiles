import assert from "node:assert/strict";
import test from "node:test";

import { createFixtureAdapters } from "../fixtures/provider_fixtures.mjs";
import { createSession } from "../../core/session_schema.mjs";
import { runOrchestrator } from "../../research_session.mjs";

test("site review uses map and avoids crawl unless audit-like", async () => {
  const session = createSession({
    query: "Analyze this docs site auth story: https://example.com",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, createFixtureAdapters(), 12);

  assert.equal(session.task_shape, "site");
  assert.ok(session.runs.some((run) => run.tool === "map"));
  assert.ok(!session.runs.some((run) => run.tool === "crawl"));
});

test("site-shaped prompts without explicit URL or domain do not fall back to open-web search", async () => {
  const session = createSession({
    query: "Audit this docs site for auth coverage",
    depth: "standard",
    domains: [],
  });

  await runOrchestrator(session, createFixtureAdapters(), 8);

  assert.equal(session.task_shape, "broad");
  assert.ok(!session.runs.some((run) => run.tool === "map"));
});
