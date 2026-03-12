import assert from "node:assert/strict";
import test from "node:test";

import { createFixtureAdapters } from "../fixtures/provider_fixtures.mjs";
import { createSession } from "../../core/session_schema.mjs";
import { runOrchestrator } from "../../research_session.mjs";

test("broad market scan fans out into multiple searches and produces citations", async () => {
  const session = createSession({
    query: "Research the AI coding agent landscape in 2026",
    depth: "deep",
    domains: [],
  });

  await runOrchestrator(session, createFixtureAdapters(), 12);

  assert.equal(session.task_shape, "broad");
  assert.ok(session.runs.filter((run) => run.tool === "search").length >= 3);
  assert.ok(session.final_answer.citations.length > 0);
  assert.ok(session.final_answer.key_findings.length > 0);
  assert.ok(session.entities.length > 0);
  assert.ok(session.observations.length > 0);
  assert.ok(session.final_answer.synthesis_sections.length > 0);
  assert.equal(session.session_version, 6);
  assert.ok(session.findings.length > 0);
});
