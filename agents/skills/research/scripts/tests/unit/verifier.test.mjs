import assert from "node:assert/strict";
import test from "node:test";

import { createSession, queueWorkItem } from "../../core/session_schema.mjs";
import { planSession } from "../../core/planner.mjs";
import { verifyClaims, reconcileClaims } from "../../core/verifier.mjs";
import { createFixtureAdapters, createTestRuntime } from "../fixtures/provider_fixtures.mjs";

test("verifyClaims collects evidence with unassessed stance and no false contradictions", async () => {
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
    runTavilyExtract({ urls }) {
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
  assert.ok(
    session.evidence.every((item) =>
      item.claim_links.some((link) => link.claim_id === targetClaim.claim_id),
    ),
  );
  assert.ok(
    session.evidence.every((item) =>
      item.claim_links.every(
        (link) => link.stance === "unassessed" || link.stance === "context",
      ),
    ),
    "Runtime does not infer stance — all evidence is unassessed or context",
  );
  const openContradictions = session.contradictions.filter((item) => item.status === "open");
  assert.equal(openContradictions.length, 0, "No contradictions from unassessed evidence");
});

test("agent-provided stance flows through to claim verdict", async () => {
  const adapters = createFixtureAdapters();
  const session = createSession({
    query: "Is product X SOC 2 certified?",
    depth: "standard",
    domains: [],
  });
  const runtime = createTestRuntime(session, adapters);
  await planSession(session, runtime);
  const targetClaim = session.claims[0];

  session.evidence.push({
    evidence_id: "ev-agent-support",
    run_id: "run-test",
    url: "https://official.example.com/compliance",
    domain: "official.example.com",
    title: "Compliance Page",
    excerpt: "Product X achieved SOC 2 Type II certification.",
    source_type: "official",
    quality: "high",
    retrieval_score: 0.95,
    published_at: null,
    claim_links: [
      {
        claim_id: targetClaim.claim_id,
        stance: "support",
        reason: "Agent assessed: directly confirms SOC 2 certification.",
      },
    ],
    attribution: {},
    observed_at: new Date().toISOString(),
    last_verified_at: null,
    provenance: { query: "test", strategy: "agent_assessment" },
  });
  reconcileClaims(session);

  assert.equal(targetClaim.status, "supported");
  assert.ok(
    ["supported", "tentative_support"].includes(targetClaim.assessment.verdict),
    "Agent support stance produces supported verdict",
  );
});

test("mixed unassessed and agent-assessed evidence resolves correctly", async () => {
  const adapters = createFixtureAdapters();
  const session = createSession({
    query: "Is product X SOC 2 certified?",
    depth: "standard",
    domains: [],
  });
  const runtime = createTestRuntime(session, adapters);
  await planSession(session, runtime);
  const targetClaim = session.claims[0];

  session.evidence.push(
    {
      evidence_id: "ev-unassessed-1",
      run_id: "run-test",
      url: "https://blog.example.com/review",
      domain: "blog.example.com",
      title: "Blog Review",
      excerpt: "Product X mentions compliance in its docs.",
      source_type: "vendor",
      quality: "low",
      retrieval_score: 0.8,
      published_at: null,
      claim_links: [
        {
          claim_id: targetClaim.claim_id,
          stance: "unassessed",
          reason: "Token match only.",
        },
      ],
      attribution: {},
      observed_at: new Date().toISOString(),
      last_verified_at: null,
      provenance: { query: "test", strategy: "gather" },
    },
    {
      evidence_id: "ev-agent-support-2",
      run_id: "run-test",
      url: "https://official.example.com/security",
      domain: "official.example.com",
      title: "Security Page",
      excerpt: "Product X is SOC 2 Type II certified.",
      source_type: "official",
      quality: "high",
      retrieval_score: 0.95,
      published_at: null,
      claim_links: [
        {
          claim_id: targetClaim.claim_id,
          stance: "support",
          reason: "Agent assessed: confirms certification.",
        },
      ],
      attribution: {},
      observed_at: new Date().toISOString(),
      last_verified_at: null,
      provenance: { query: "test", strategy: "agent_assessment" },
    },
  );
  reconcileClaims(session);

  assert.equal(targetClaim.status, "supported");
  assert.ok(
    ["supported", "tentative_support"].includes(targetClaim.assessment.verdict),
    "Agent support + unassessed evidence still produces supported verdict",
  );
  const openContradictions = session.contradictions.filter((item) => item.status === "open");
  assert.equal(openContradictions.length, 0, "No contradictions from mixed evidence");
});
