import assert from "node:assert/strict";
import test from "node:test";

import { approvePendingPlan, createSession } from "../../core/session_schema.mjs";
import {
  applyContinuationInstruction,
  applyResearchPlan,
  planSession,
} from "../../core/planner.mjs";
import { planningArtifactsFromGeminiGrounding } from "../../core/planner_legacy.mjs";
import { scoreSession, updateStopStatus } from "../../core/scorer.mjs";
import { createFixtureAdapters, createTestRuntime } from "../fixtures/provider_fixtures.mjs";

test("planSession creates answer-bearing threads and claims for broad research", async () => {
  const session = createSession({
    query: "Research the AI coding agent landscape in 2026",
    depth: "deep",
    domains: [],
  });
  const adapters = createFixtureAdapters();

  await planSession(session, createTestRuntime(session, adapters));

  assert.equal(session.task_shape, "broad");
  assert.ok(session.goal.includes("AI coding agent landscape"));
  assert.ok(session.threads.length >= 4);
  assert.ok(session.claims.every((claim) => claim.text.includes(session.goal)));
  assert.ok(session.work_items.some((item) => item.kind === "gather_thread"));
});

test("Tavily Research contributes only planning artifacts", async () => {
  const session = createSession({
    query: "Research the AI coding agent landscape in 2026",
    depth: "deep",
    domains: [],
  });
  const adapters = createFixtureAdapters();

  await planSession(session, createTestRuntime(session, adapters));

  assert.ok(session.planning_artifacts.hypotheses.length > 0);
  assert.equal(session.evidence.length, 0);
  assert.ok(session.runs.some((run) => run.tool === "research"));
  assert.ok(session.operations.some((operation) => operation.tool === "research"));
});

test("planSession does not fall back to runtime planning when authored control is active", async () => {
  const session = createSession({
    query: "Research the AI coding agent landscape in 2026",
    depth: "deep",
    domains: [],
  });
  const adapters = createFixtureAdapters();

  applyResearchPlan(session, {
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  session.work_items = session.work_items.filter((item) => item.kind === "gather_thread");
  session.runs = [];
  session.operations = [];

  await planSession(session, createTestRuntime(session, adapters));

  assert.equal(session.threads.length, 1);
  assert.equal(session.threads[0]?.title, "Workflow fit");
  assert.equal(session.plan_state.control_mode, "agent_authored");
  assert.equal(
    session.runs.some((run) => run.tool === "research"),
    false,
  );
  assert.equal(
    session.operations.some((operation) => operation.tool === "research"),
    false,
  );
});

test("planSession shapes verification claims around the user's actual question", async () => {
  const session = createSession({
    query: "Does OpenAI expose deep research in the API, and if so through which endpoint?",
    depth: "standard",
    domains: [],
  });

  await planSession(session, createTestRuntime(session, createFixtureAdapters()));

  assert.equal(session.task_shape, "verification");
  assert.equal(session.threads[0]?.title, "Direct answer");
  assert.match(session.claims[0]?.text ?? "", /OpenAI exposes deep research in the API\./u);
  assert.ok(session.claims.some((claim) => /endpoint|API surface|mechanism/u.test(claim.text)));
  assert.ok(
    session.threads
      .find((thread) => thread.title === "Concrete API surface")
      ?.subqueries.some((query) => /Responses API/u.test(query)),
  );
  assert.ok(
    session.claims.every(
      (claim) =>
        !/there is official|primary-source evidence that can confirm/iu.test(claim.text),
    ),
  );
});

test("planningArtifactsFromGeminiGrounding extracts hypotheses and domain hints", () => {
  const result = {
    content:
      "Spain won Euro 2024, defeating England 2-1 in the final. The tournament was held in Germany.",
    web_search_queries: ["UEFA Euro 2024 winner", "Euro 2024 host country"],
    grounding_chunks: [
      { uri: "https://vertexaisearch.cloud.google.com/...", title: "uefa.com" },
      { uri: "https://vertexaisearch.cloud.google.com/...", title: "bbc.co.uk" },
    ],
    grounding_supports: [],
  };

  const artifacts = planningArtifactsFromGeminiGrounding(result);

  assert.ok(artifacts.hypotheses.length > 0);
  assert.ok(artifacts.hypotheses.some((h) => /Spain/u.test(h)));
  assert.ok(artifacts.hypotheses.some((h) => /Euro 2024/u.test(h)));
  assert.ok(artifacts.domain_hints.some((d) => d === "uefa.com" || d === "bbc.co.uk"));
});

test("planningArtifactsFromGeminiGrounding handles null/empty result gracefully", () => {
  assert.deepEqual(planningArtifactsFromGeminiGrounding(null), {
    hypotheses: [],
    domain_hints: [],
  });
  assert.deepEqual(planningArtifactsFromGeminiGrounding({ content: "" }), {
    hypotheses: [],
    domain_hints: [],
  });
  assert.deepEqual(planningArtifactsFromGeminiGrounding({ content: "Short." }), {
    hypotheses: [],
    domain_hints: [],
  });
});

test("applyResearchPlan lets the agent seed threads and claims directly", () => {
  const session = createSession({
    query: "Research the AI coding agent landscape in 2026",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    summary: "Agent-authored plan for a landscape scan.",
    planning_artifacts: {
      comparison_axes: ["workflow", "deployment", "pricing"],
    },
    gaps: [
      {
        kind: "source_authority",
        summary: "Need primary sources for deployment claims.",
        scope_type: "thread",
        severity: "high",
        recommended_next_action: "Check official deployment docs.",
      },
    ],
    remaining_gaps: ["Need primary sources for deployment claims."],
    threads: [
      {
        title: "Workflow fit",
        intent: "compare how the products fit different engineering workflows",
        subqueries: ["AI coding agents workflow fit", "AI coding agents team workflows"],
        claims: [
          {
            text: "Leading AI coding agents optimize for different engineering workflows.",
            claim_type: "comparison",
            priority: "high",
            why_it_matters: "Workflow fit is often the deciding factor for adoption.",
          },
        ],
      },
    ],
  });

  assert.equal(session.task_shape, "broad");
  assert.equal(session.threads.length, 1);
  assert.equal(session.claims.length, 1);
  assert.ok(session.work_items.some((item) => item.kind === "gather_thread"));
  assert.deepEqual(session.planning_artifacts.comparison_axes, [
    "workflow",
    "deployment",
    "pricing",
  ]);
  assert.ok(
    session.stop_status.remaining_gaps.includes("Need primary sources for deployment claims."),
  );
  assert.ok(
    session.gaps.some((gap) => gap.summary === "Need primary sources for deployment claims."),
  );
});

test("applyResearchPlan carries research_brief and source_policy into the session", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    research_brief: {
      objective: "Compare AI coding agents for enterprise adoption",
      deliverable: "report",
      source_policy: {
        mode: "allowlist",
        allow_domains: ["openai.com", "anthropic.com"],
        preferred_domains: ["developers.openai.com"],
        notes: ["Prefer official pricing and security pages."],
      },
      clarification_notes: ["Optimize for enterprise buyers, not hobbyists."],
    },
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  assert.equal(
    session.research_brief.objective,
    "Compare AI coding agents for enterprise adoption",
  );
  assert.equal(session.research_brief.deliverable, "report");
  assert.ok(session.research_brief.source_policy.allow_domains.includes("openai.com"));
  assert.ok(
    session.research_brief.source_policy.preferred_domains.includes("developers.openai.com"),
  );
  assert.ok(
    session.research_brief.clarification_notes.includes(
      "Optimize for enterprise buyers, not hobbyists.",
    ),
  );
});

test("applyResearchPlan rejects invalid task shapes from agent-authored plans", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  assert.throws(
    () =>
      applyResearchPlan(session, {
        task_shape: "unknown-shape",
        threads: [
          {
            title: "Workflow fit",
            intent: "compare workflow fit",
            claims: [{ text: "Vendors differ in workflow fit." }],
          },
        ],
      }),
    /Invalid agent-authored task_shape/u,
  );
});

test("applyResearchPlan skips duplicate plan ids", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  const plan = {
    plan_id: "plan-123",
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit." }],
      },
    ],
  };

  applyResearchPlan(session, plan);
  applyResearchPlan(session, plan, { mode: "append" });

  assert.equal(session.threads.length, 1);
  assert.equal(
    session.decision_log.filter((item) => item.action === "agent_plan_skip").length,
    1,
  );
});

test("applyResearchPlan can apply a structured continuation patch", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  const existingThread = session.threads[0];
  const existingClaim = session.claims[0];

  applyResearchPlan(
    session,
    {
      continuation_patch: {
        instruction: "Re-check workflow fit and add a deployment angle",
        operations: [
          {
            type: "merge_domains",
            domains: ["docs.example.com"],
          },
          {
            type: "mark_claim_stale",
            claim_id: existingClaim.claim_id,
          },
          {
            type: "requeue_thread",
            thread_id: existingThread.thread_id,
          },
          {
            type: "add_gap",
            gap: {
              kind: "freshness",
              summary: "Need fresher deployment evidence.",
              scope_type: "thread",
              scope_id: existingThread.thread_id,
              severity: "medium",
              recommended_next_action: "Check changelog or release notes.",
            },
          },
          {
            type: "note",
            note: "Prefer official deployment docs.",
          },
          {
            type: "add_thread",
            thread: {
              title: "Deployment",
              intent: "compare deployment models",
              subqueries: ["AI coding agents deployment models"],
              claims: [
                {
                  text: "Deployment models differ across leading vendors.",
                  claim_type: "comparison",
                  priority: "high",
                },
              ],
            },
          },
        ],
      },
    },
    { mode: "append" },
  );

  assert.ok(session.constraints.domains.includes("docs.example.com"));
  assert.equal(existingClaim.verification.stale, true);
  assert.ok(
    session.work_items.some(
      (item) => item.kind === "verify_claim" && item.scope_id === existingClaim.claim_id,
    ),
  );
  assert.ok(
    session.work_items.some(
      (item) => item.kind === "gather_thread" && item.scope_id === existingThread.thread_id,
    ),
  );
  assert.ok(session.threads.some((thread) => thread.title === "Deployment"));
  assert.ok(session.stop_status.remaining_gaps.includes("Need fresher deployment evidence."));
  assert.ok(
    session.gaps.some(
      (gap) =>
        gap.summary === "Need fresher deployment evidence." &&
        gap.recommended_next_action === "Check changelog or release notes.",
    ),
  );
  assert.ok(session.continuations.at(-1)?.operations.length >= 5);
  assert.equal(session.plan_state.control_mode, "agent_authored");
});

test("heuristic prose continuation stays in compatibility mode", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  session.plan_state.control_mode = "runtime_fallback";
  applyContinuationInstruction(session, "Dig deeper on workflow fit");

  assert.equal(session.plan_state.control_mode, "runtime_fallback");
});

test("explicit continuation gaps survive scoring updates", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  applyResearchPlan(
    session,
    {
      continuation_patch: {
        instruction: "Keep an explicit open gap for enterprise proof points",
        operations: [{ type: "add_gap", gap: "Need stronger enterprise proof points." }],
      },
    },
    { mode: "append" },
  );

  scoreSession(session);
  updateStopStatus(session);

  assert.ok(
    session.stop_status.remaining_gaps.includes("Need stronger enterprise proof points."),
  );
});

test("resolved typed gaps drop out of the compatible text view", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    gaps: [
      {
        kind: "source_authority",
        summary: "Need stronger enterprise proof points.",
        severity: "high",
        status: "open",
      },
    ],
    threads: [
      {
        title: "Enterprise rollout",
        intent: "inspect rollout proof points",
        claims: [{ text: "Enterprise rollout patterns differ.", priority: "high" }],
      },
    ],
  });

  const gap = session.gaps.find(
    (item) => item.summary === "Need stronger enterprise proof points.",
  );
  gap.status = "resolved";
  scoreSession(session);
  updateStopStatus(session);

  assert.ok(
    !session.stop_status.remaining_gaps.includes("Need stronger enterprise proof points."),
  );
});

test("pending plan snapshots carry typed gaps", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
    approvalMode: "pending",
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    gaps: [
      {
        kind: "source_authority",
        summary: "Need stronger enterprise proof points.",
        severity: "high",
        recommended_next_action: "Check official enterprise case studies.",
      },
    ],
    threads: [
      {
        title: "Enterprise rollout",
        intent: "inspect rollout proof points",
        claims: [{ text: "Enterprise rollout patterns differ.", priority: "high" }],
      },
    ],
  });

  assert.equal(session.plan_versions.length, 1);
  assert.equal(
    session.plan_versions[0].gaps[0]?.summary,
    "Need stronger enterprise proof points.",
  );
  assert.equal(
    session.plan_versions[0].gaps[0]?.recommended_next_action,
    "Check official enterprise case studies.",
  );
});

test("pending agent-authored plans do not replace the live current plan until approval", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
    approvalMode: "pending",
  });

  applyResearchPlan(session, {
    plan_id: "plan-pending",
    task_shape: "broad",
    threads: [
      {
        title: "Enterprise rollout",
        intent: "inspect rollout proof points",
        claims: [{ text: "Enterprise rollout patterns differ.", priority: "high" }],
      },
    ],
  });

  assert.equal(session.plan_state.current_plan_version_id, null);
  assert.ok(session.plan_state.pending_plan_version_id);
  assert.equal(session.plan_state.workflow_state, "pending_review");

  approvePendingPlan(session);

  assert.equal(
    session.plan_state.current_plan_version_id,
    session.plan_versions[0].plan_version_id,
  );
  assert.equal(session.plan_state.pending_plan_version_id, null);
  assert.equal(session.plan_state.control_mode, "agent_authored");
});

test("applyResearchPlan can apply an agent-authored delta plan", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  const existingThread = session.threads[0];
  const existingClaim = session.claims[0];

  applyResearchPlan(session, {
    delta_plan: {
      delta_plan_id: "delta-1",
      summary: "Workflow fit is stable, but we need fresher pricing evidence next.",
      goal_update: "Research AI coding agents for enterprise adoption and pricing clarity",
      source_policy_update: {
        mode: "allowlist",
        allow_domains: ["openai.com"],
        preferred_domains: ["developers.openai.com"],
      },
      gap_updates: [
        {
          action: "upsert",
          gap: {
            kind: "freshness",
            summary: "Need fresher pricing evidence.",
            scope_type: "thread",
            scope_id: existingThread.thread_id,
            severity: "high",
          },
        },
      ],
      thread_actions: [
        {
          action: "deepen",
          thread_id: existingThread.thread_id,
          reason: "Gather one more pass for pricing and packaging.",
        },
      ],
      claim_actions: [
        {
          action: "mark_stale",
          claim_id: existingClaim.claim_id,
          reason: "Pricing evidence has likely shifted.",
        },
        {
          action: "set_priority",
          claim_id: existingClaim.claim_id,
          priority: "high",
        },
      ],
      queue_proposals: [
        {
          kind: "synthesize_session",
          scope_type: "session",
          scope_id: session.session_id,
          reason: "Produce an updated interim synthesis after the next pass.",
        },
      ],
      why_now: "The blocker surface changed and the next step should be explicit.",
    },
  });

  assert.equal(session.delta_plans.length, 1);
  assert.equal(
    session.goal,
    "Research AI coding agents for enterprise adoption and pricing clarity",
  );
  assert.ok(session.research_brief.source_policy.allow_domains.includes("openai.com"));
  assert.ok(session.gaps.some((gap) => gap.summary === "Need fresher pricing evidence."));
  assert.equal(existingClaim.verification.stale, true);
  assert.ok(
    session.work_items.some(
      (item) => item.kind === "gather_thread" && item.scope_id === existingThread.thread_id,
    ),
  );
  assert.ok(
    session.work_items.some(
      (item) => item.kind === "synthesize_session" && item.scope_id === session.session_id,
    ),
  );
});

test("applyResearchPlan skips duplicate delta plan ids", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  const existingThread = session.threads[0];
  const deltaPlan = {
    delta_plan: {
      delta_plan_id: "delta-dup",
      summary: "Deeper workflow pass needed.",
      thread_actions: [{ action: "deepen", thread_id: existingThread.thread_id }],
    },
  };

  applyResearchPlan(session, deltaPlan);
  const workCount = session.work_items.length;
  applyResearchPlan(session, deltaPlan);

  assert.equal(session.delta_plans.length, 1);
  assert.equal(session.work_items.length, workCount);
  assert.equal(
    session.decision_log.filter((item) => item.action === "delta_plan_skip").length,
    1,
  );
});

test("delta plan pause suppresses already queued gather work for the thread", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  const existingThread = session.threads[0];

  applyResearchPlan(session, {
    delta_plan: {
      delta_plan_id: "delta-pause",
      summary: "Pause this thread until the agent resolves the blocker.",
      thread_actions: [
        {
          action: "pause",
          thread_id: existingThread.thread_id,
          reason: "Block this thread pending user clarification.",
        },
      ],
    },
  });

  assert.equal(existingThread.execution.gather_status, "blocked");
  assert.ok(
    session.work_items
      .filter(
        (item) => item.kind === "gather_thread" && item.scope_id === existingThread.thread_id,
      )
      .every((item) => item.status !== "queued"),
  );
});

test("delta plan rejects queue proposals that reference missing targets", () => {
  const session = createSession({
    query: "Research AI coding agents",
    depth: "standard",
    domains: [],
  });

  applyResearchPlan(session, {
    task_shape: "broad",
    threads: [
      {
        title: "Workflow fit",
        intent: "compare workflow fit",
        claims: [{ text: "Vendors differ in workflow fit.", priority: "high" }],
      },
    ],
  });

  assert.throws(
    () =>
      applyResearchPlan(session, {
        delta_plan: {
          delta_plan_id: "delta-invalid-queue",
          summary: "This proposal should fail validation.",
          queue_proposals: [
            {
              kind: "verify_claim",
              scope_type: "claim",
              scope_id: "claim-missing",
            },
          ],
        },
      }),
    /missing claim/u,
  );
});
