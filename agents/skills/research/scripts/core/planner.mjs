import {
  appendDecision,
  createId,
  ensureArray,
  fail,
  getThreadById,
  mergeUniqueStrings,
  queueWorkItem,
  recordDeltaPlan,
  recordPlanVersion,
  syncSessionStage,
  upsertGap,
} from "./session_schema.mjs";
import {
  compileAgentPlan as compileAgentPlanArtifact,
  compileContinuationPatch as compileContinuationPatchArtifact,
  compileDeltaPlan as compileDeltaPlanArtifact,
} from "./artifact_compiler.mjs";
import { classifyTaskShape, normalizeGoal } from "./router.mjs";
import {
  buildFallbackPlan,
  defaultComparisonAxes,
  inferContinuationFromProse,
  planningArtifactsFromGeminiGrounding,
  planningArtifactsFromResearch,
} from "./planner_legacy.mjs";

function hasAuthoredControlSurface(session) {
  const currentPlan = ensureArray(session.plan_versions).find(
    (item) => item.plan_version_id === session.plan_state?.current_plan_version_id,
  );
  return Boolean(
    session.plan_state?.control_mode === "agent_authored" ||
    currentPlan?.source === "agent_authored",
  );
}

function queuePlanWork(session, parentWorkItemId = null) {
  if (session.task_shape === "async") {
    queueWorkItem(session, {
      kind: "handoff_session",
      scopeType: "session",
      scopeId: session.session_id,
      reason: "Task shape requires async remote execution.",
      dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
    });
    return;
  }

  for (const thread of session.threads) {
    queueWorkItem(session, {
      kind: "gather_thread",
      scopeType: "thread",
      scopeId: thread.thread_id,
      keySuffix: `round-${thread.execution.gather_rounds + 1}`,
      reason: "Initial gathering pass for planned thread.",
      dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
    });
  }
}

function queueThreadsForGathering(session, threads, parentWorkItemId = null, reason) {
  for (const thread of threads) {
    queueWorkItem(session, {
      kind: "gather_thread",
      scopeType: "thread",
      scopeId: thread.thread_id,
      keySuffix: `round-${thread.execution.gather_rounds + 1}`,
      reason,
      dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
    });
  }
}

function requiresPlanApproval(session) {
  return session.plan_state?.approval_status === "pending";
}

export function mergeResearchBrief(session, researchBrief = {}) {
  if (!session.research_brief) {
    return;
  }
  if (researchBrief.objective) {
    session.research_brief.objective = normalizeGoal(researchBrief.objective);
  } else if (!session.research_brief.objective && session.goal) {
    session.research_brief.objective = session.goal;
  }
  if (researchBrief.deliverable) {
    session.research_brief.deliverable = researchBrief.deliverable;
  }
  if (researchBrief.source_policy) {
    const existing = session.research_brief.source_policy ?? {
      mode: "open",
      allow_domains: [],
      preferred_domains: [],
      notes: [],
    };
    const allowDomains = mergeUniqueStrings(
      existing.allow_domains,
      researchBrief.source_policy.allow_domains,
    );
    session.research_brief.source_policy = {
      ...existing,
      ...researchBrief.source_policy,
      allow_domains: allowDomains,
      preferred_domains: mergeUniqueStrings(
        existing.preferred_domains,
        researchBrief.source_policy.preferred_domains,
      ),
      notes: mergeUniqueStrings(existing.notes, researchBrief.source_policy.notes),
      mode:
        researchBrief.source_policy.mode ||
        (allowDomains.length > 0 ? "allowlist" : (existing.mode ?? "open")),
    };
  }
  session.research_brief.clarification_notes = mergeUniqueStrings(
    session.research_brief.clarification_notes,
    researchBrief.clarification_notes,
  );
  if (researchBrief.auto_synthesize != null) {
    session.research_brief.auto_synthesize = Boolean(researchBrief.auto_synthesize);
  }
  session.research_brief.updated_at = new Date().toISOString();
}

function ensureNotAwaitingPlanApproval(session) {
  if (requiresPlanApproval(session) && session.plan_state?.pending_plan_version_id) {
    fail(
      "This session has a pending plan approval. Approve the prepared plan before mutating it.",
    );
  }
}

function looksLikeDeltaPlan(rawPlan = {}) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return false;
  }
  return Boolean(rawPlan.delta_plan && typeof rawPlan.delta_plan === "object");
}

function looksLikeContinuationPatch(rawPlan = {}) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return false;
  }
  return Boolean(rawPlan.continuation_patch && typeof rawPlan.continuation_patch === "object");
}

function cancelQueuedThreadWork(session, threadId, reason) {
  for (const item of session.work_items) {
    if (
      item.scope_id === threadId &&
      item.kind === "gather_thread" &&
      item.status === "queued"
    ) {
      item.status = "skipped";
      item.last_error = reason;
      item.completed_at = new Date().toISOString();
      item.updated_at = item.completed_at;
    }
  }
}

function validateQueueProposalTarget(session, proposal) {
  if (proposal.kind === "gather_thread") {
    if (proposal.scope_type !== "thread" || !getThreadById(session, proposal.scope_id)) {
      fail("Delta plan queue proposal referenced a missing thread.");
    }
    return;
  }
  if (proposal.kind === "verify_claim") {
    if (
      proposal.scope_type !== "claim" ||
      !session.claims.some((claim) => claim.claim_id === proposal.scope_id)
    ) {
      fail("Delta plan queue proposal referenced a missing claim.");
    }
    return;
  }
  if (proposal.kind === "synthesize_session" || proposal.kind === "handoff_session") {
    if (proposal.scope_type !== "session" || proposal.scope_id !== session.session_id) {
      fail("Delta plan queue proposal referenced an invalid session target.");
    }
  }
}

function applyContinuationPatch(
  session,
  rawPatch,
  { parentWorkItemId = null, action = "continuation_patch" } = {},
) {
  const compiled = compileContinuationPatchArtifact(rawPatch);
  const continuation = {
    continuation_id: createId("continuation"),
    instruction: compiled.instruction,
    mode: compiled.mode,
    created_at: new Date().toISOString(),
    applied_at: new Date().toISOString(),
    domains: compiled.domains,
    affected_thread_ids: [],
    created_thread_ids: [],
    stale_claim_ids: [],
    notes: [...compiled.notes],
    operations: [],
  };
  session.continuations.push(continuation);

  if (compiled.instruction) {
    session.planning_artifacts.continuation_notes = mergeUniqueStrings(
      session.planning_artifacts.continuation_notes,
      [compiled.instruction],
    );
  }

  for (const operation of compiled.operations) {
    continuation.operations.push(operation);

    if (operation.type === "merge_domains") {
      session.constraints.domains = mergeUniqueStrings(
        session.constraints.domains,
        operation.domains,
      );
      if (session.research_brief?.source_policy) {
        session.research_brief.source_policy.allow_domains = mergeUniqueStrings(
          session.research_brief.source_policy.allow_domains,
          operation.domains,
        );
        session.research_brief.source_policy.mode =
          session.research_brief.source_policy.allow_domains.length > 0 ? "allowlist" : "open";
      }
      continue;
    }

    if (operation.type === "add_gap") {
      upsertGap(session, {
        ...operation.gap,
        created_by: operation.gap.created_by ?? "agent",
      });
      session.stop_status.remaining_gaps = mergeUniqueStrings(
        session.stop_status.remaining_gaps,
        [operation.gap.summary],
      );
      continue;
    }

    if (operation.type === "note") {
      continuation.notes.push(operation.note);
      session.planning_artifacts.continuation_notes = mergeUniqueStrings(
        session.planning_artifacts.continuation_notes,
        [operation.note],
      );
      continue;
    }

    if (operation.type === "mark_claim_stale") {
      const claim = session.claims.find((item) => item.claim_id === operation.claim_id);
      if (!claim) {
        fail(`Continuation patch referenced an unknown claim: ${operation.claim_id}`);
      }
      claim.verification.stale = true;
      claim.verification.status = "queued";
      claim.verification.last_continuation_id = continuation.continuation_id;
      continuation.stale_claim_ids.push(claim.claim_id);
      queueWorkItem(session, {
        kind: "verify_claim",
        scopeType: "claim",
        scopeId: claim.claim_id,
        continuationId: continuation.continuation_id,
        reason: operation.reason,
        dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
      });
      continue;
    }

    if (operation.type === "requeue_thread") {
      const thread = getThreadById(session, operation.thread_id);
      if (!thread) {
        fail(`Continuation patch referenced an unknown thread: ${operation.thread_id}`);
      }
      thread.execution.gather_status = "queued";
      thread.execution.last_continuation_id = continuation.continuation_id;
      continuation.affected_thread_ids.push(thread.thread_id);
      queueWorkItem(session, {
        kind: "gather_thread",
        scopeType: "thread",
        scopeId: thread.thread_id,
        continuationId: continuation.continuation_id,
        keySuffix: `round-${thread.execution.gather_rounds + 1}`,
        reason: operation.reason,
        dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
      });
      continue;
    }

    if (operation.type === "add_thread") {
      session.threads.push(operation.thread);
      session.claims.push(...operation.claims);
      continuation.created_thread_ids.push(operation.thread.thread_id);
      queueWorkItem(session, {
        kind: "gather_thread",
        scopeType: "thread",
        scopeId: operation.thread.thread_id,
        continuationId: continuation.continuation_id,
        keySuffix: `round-${operation.thread.execution.gather_rounds + 1}`,
        reason: operation.reason,
        dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
      });
    }
  }

  appendDecision(
    session,
    action,
    compiled.instruction
      ? `Applied continuation mutation: ${compiled.instruction}`
      : "Applied a structured continuation mutation patch.",
    {
      continuation_id: continuation.continuation_id,
      mode: continuation.mode,
      operation_count: continuation.operations.length,
      affected_thread_ids: continuation.affected_thread_ids,
      created_thread_ids: continuation.created_thread_ids,
      stale_claim_ids: continuation.stale_claim_ids,
      domains: continuation.domains,
    },
  );
  if (action !== "instruction") {
    session.plan_state.control_mode = "agent_authored";
  }
  session.plan_state.awaiting_agent_decision_since = null;
  syncSessionStage(session);
  return continuation;
}

function applyDeltaPlan(
  session,
  rawDelta,
  { parentWorkItemId = null, action = "delta_plan" } = {},
) {
  const compiled = compileDeltaPlanArtifact(rawDelta);
  const existing = ensureArray(session.delta_plans).find(
    (item) => item.delta_plan_id === compiled.delta_plan_id,
  );
  if (existing) {
    appendDecision(
      session,
      "delta_plan_skip",
      "Skipped a duplicate agent-authored delta plan.",
      {
        delta_plan_id: compiled.delta_plan_id,
      },
    );
    return existing;
  }

  if (compiled.goal_update) {
    session.goal = normalizeGoal(compiled.goal_update);
  }
  mergeResearchBrief(session, {
    objective: compiled.goal_update || "",
    source_policy: compiled.source_policy_update,
    clarification_notes: [],
  });

  for (const update of compiled.gap_updates) {
    if (update.action === "upsert" && update.gap) {
      upsertGap(session, {
        ...update.gap,
        created_by: update.gap.created_by ?? "agent",
      });
      session.stop_status.remaining_gaps = mergeUniqueStrings(
        session.stop_status.remaining_gaps,
        [update.gap.summary],
      );
      continue;
    }
    const targetGap = ensureArray(session.gaps).find(
      (gap) =>
        (update.gap_id && gap.gap_id === update.gap_id) ||
        (update.summary && gap.summary === update.summary),
    );
    if (!targetGap) {
      fail("Delta plan gap update referenced a missing gap.");
    }
    targetGap.status = update.action === "resolve" ? "resolved" : "closed";
    targetGap.updated_at = new Date().toISOString();
  }

  for (const threadAction of compiled.thread_actions) {
    if (threadAction.action === "branch") {
      session.threads.push(threadAction.thread);
      session.claims.push(...threadAction.claims);
      queueWorkItem(session, {
        kind: "gather_thread",
        scopeType: "thread",
        scopeId: threadAction.thread.thread_id,
        keySuffix: `delta-${compiled.delta_plan_id}`,
        reason: threadAction.reason || "Delta plan proposed a new branch.",
        dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
      });
      continue;
    }
    const thread = getThreadById(session, threadAction.thread_id);
    if (!thread) {
      fail("Delta plan thread action referenced a missing thread.");
    }
    if (threadAction.action === "pause") {
      thread.execution.gather_status = "blocked";
      thread.notes = [thread.notes, threadAction.reason].filter(Boolean).join(" ").trim();
      cancelQueuedThreadWork(
        session,
        thread.thread_id,
        threadAction.reason || "Delta plan paused queued gather work for this thread.",
      );
      continue;
    }
    if (threadAction.action === "deepen") {
      thread.execution.gather_status = "queued";
      queueWorkItem(session, {
        kind: "gather_thread",
        scopeType: "thread",
        scopeId: thread.thread_id,
        keySuffix: `delta-${compiled.delta_plan_id}`,
        reason: threadAction.reason || "Delta plan requested a deeper gather pass.",
        dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
      });
    }
  }

  for (const claimAction of compiled.claim_actions) {
    const claim = session.claims.find((item) => item.claim_id === claimAction.claim_id);
    if (!claim) {
      fail("Delta plan claim action referenced a missing claim.");
    }
    if (claimAction.action === "mark_stale") {
      claim.verification.stale = true;
      claim.verification.status = "queued";
      queueWorkItem(session, {
        kind: "verify_claim",
        scopeType: "claim",
        scopeId: claim.claim_id,
        keySuffix: `delta-${compiled.delta_plan_id}`,
        reason: claimAction.reason || "Delta plan requested claim re-verification.",
        dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
      });
      continue;
    }
    if (claimAction.action === "set_priority" && claimAction.priority) {
      claim.priority = claimAction.priority;
      claim.answer_relevance =
        claimAction.priority === "high" ? "high" : claim.answer_relevance;
    }
  }

  for (const proposal of compiled.queue_proposals) {
    validateQueueProposalTarget(session, proposal);
    queueWorkItem(session, {
      kind: proposal.kind,
      scopeType: proposal.scope_type,
      scopeId: proposal.scope_id,
      keySuffix: proposal.key_suffix || `delta-${compiled.delta_plan_id}`,
      reason: proposal.reason,
      dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
    });
  }

  const recorded = recordDeltaPlan(session, compiled);
  appendDecision(session, action, "Applied an agent-authored delta plan.", {
    delta_plan_id: recorded.delta_plan_id,
    summary: recorded.summary,
    gap_update_count: recorded.gap_updates.length,
    thread_action_count: recorded.thread_actions.length,
    claim_action_count: recorded.claim_actions.length,
    queue_proposal_count: recorded.queue_proposals.length,
  });
  session.plan_state.control_mode = "agent_authored";
  session.plan_state.awaiting_agent_decision_since = null;
  syncSessionStage(session);
  return recorded;
}

export function applyResearchPlan(
  session,
  rawPlan,
  { mode = "replace", parentWorkItemId = null } = {},
) {
  ensureNotAwaitingPlanApproval(session);
  if (looksLikeDeltaPlan(rawPlan)) {
    return applyDeltaPlan(session, rawPlan, {
      parentWorkItemId,
      action: "delta_plan",
    });
  }
  if (looksLikeContinuationPatch(rawPlan)) {
    return applyContinuationPatch(session, rawPlan, {
      parentWorkItemId,
      action: "continuation_patch",
    });
  }
  const compiled = compileAgentPlanArtifact(rawPlan);
  const isAppend = mode === "append";
  if (!isAppend && mode !== "replace") {
    fail(`Invalid agent-authored plan mode: ${mode}`);
  }
  if (
    compiled.plan_id &&
    session.decision_log.some(
      (item) => item.action === "agent_plan" && item.details?.plan_id === compiled.plan_id,
    )
  ) {
    appendDecision(session, "agent_plan_skip", "Skipped a duplicate agent-authored plan.", {
      mode,
      plan_id: compiled.plan_id,
    });
    return compiled;
  }

  if (compiled.goal) {
    session.goal = compiled.goal;
  } else if (!session.goal) {
    session.goal = normalizeGoal(session.user_query);
  }
  mergeResearchBrief(session, compiled.researchBrief);

  if (compiled.task_shape) {
    session.task_shape = compiled.task_shape;
  } else if (!session.task_shape) {
    session.task_shape = classifyTaskShape(
      session.goal || session.user_query,
      session.constraints.domains,
    );
  }

  if (Array.isArray(compiled.constraints.domains) && compiled.constraints.domains.length > 0) {
    session.constraints.domains = mergeUniqueStrings(
      session.constraints.domains,
      compiled.constraints.domains.map((item) => String(item).trim()).filter(Boolean),
    );
  }
  if (compiled.constraints.time_range) {
    session.constraints.time_range = compiled.constraints.time_range;
  }
  if (compiled.constraints.country) {
    session.constraints.country = compiled.constraints.country;
  }

  if (isAppend) {
    session.threads.push(...compiled.threads);
    session.claims.push(...compiled.claims);
  } else {
    session.threads = compiled.threads;
    session.claims = compiled.claims;
    session.work_items = session.work_items.filter(
      (item) => !(item.kind === "plan_session" && item.status === "queued"),
    );
  }

  session.planning_artifacts.hypotheses = isAppend
    ? mergeUniqueStrings(
        session.planning_artifacts.hypotheses,
        compiled.planningArtifacts.hypotheses,
      )
    : compiled.planningArtifacts.hypotheses;
  session.planning_artifacts.domain_hints = isAppend
    ? mergeUniqueStrings(
        session.planning_artifacts.domain_hints,
        compiled.planningArtifacts.domain_hints,
      )
    : compiled.planningArtifacts.domain_hints;
  session.planning_artifacts.comparison_axes = isAppend
    ? mergeUniqueStrings(
        session.planning_artifacts.comparison_axes,
        compiled.planningArtifacts.comparison_axes,
      )
    : compiled.planningArtifacts.comparison_axes;
  session.planning_artifacts.continuation_notes = isAppend
    ? mergeUniqueStrings(
        session.planning_artifacts.continuation_notes,
        compiled.planningArtifacts.continuation_notes,
      )
    : compiled.planningArtifacts.continuation_notes;

  session.stop_status.remaining_gaps = mergeUniqueStrings(
    session.stop_status.remaining_gaps,
    compiled.remainingGaps,
  );
  for (const gap of compiled.gaps) {
    upsertGap(session, gap);
  }
  if (session.planning_artifacts.comparison_axes.length === 0 && session.task_shape) {
    session.planning_artifacts.comparison_axes = defaultComparisonAxes(session.task_shape);
  }

  if (requiresPlanApproval(session)) {
    recordPlanVersion(session, {
      planId: compiled.plan_id || null,
      source: "agent_authored",
      mode,
      status: "pending_approval",
      summary:
        compiled.summary ||
        (isAppend
          ? "Prepared an agent-authored follow-up research plan for approval."
          : "Prepared an agent-authored research plan for approval."),
      threads: compiled.threads,
      claims: compiled.claims,
      gaps: compiled.gaps,
      researchBrief: session.research_brief,
      remainingGaps: compiled.remainingGaps,
    });
    appendDecision(
      session,
      "agent_plan_prepare",
      isAppend
        ? "Prepared an agent-authored follow-up plan and paused for approval."
        : "Prepared an agent-authored plan and paused for approval.",
      {
        mode,
        plan_id: compiled.plan_id || null,
        task_shape: session.task_shape,
        thread_count: compiled.threads.length,
        claim_count: compiled.claims.length,
        summary: compiled.summary,
      },
    );
    syncSessionStage(session);
    return compiled;
  }

  session.plan_state.control_mode = "agent_authored";
  session.plan_state.awaiting_agent_decision_since = null;
  if (session.task_shape === "async") {
    queueWorkItem(session, {
      kind: "handoff_session",
      scopeType: "session",
      scopeId: session.session_id,
      reason: "Agent-authored plan marked the task as async.",
      dependsOn: parentWorkItemId ? [parentWorkItemId] : [],
    });
  } else {
    queueThreadsForGathering(
      session,
      compiled.threads,
      parentWorkItemId,
      isAppend
        ? "Agent-authored follow-up plan queued new gathering work."
        : "Agent-authored plan queued the initial gathering work.",
    );
  }

  appendDecision(
    session,
    "agent_plan",
    isAppend
      ? "Applied an agent-authored follow-up research plan."
      : "Applied an agent-authored research plan.",
    {
      mode,
      plan_id: compiled.plan_id || null,
      task_shape: session.task_shape,
      thread_count: compiled.threads.length,
      claim_count: compiled.claims.length,
      summary: compiled.summary,
    },
  );
  syncSessionStage(session);
  return compiled;
}

export async function planSession(session, runtime, workItem = null) {
  if (!session.goal) {
    session.goal = normalizeGoal(session.user_query);
  }

  const authoredControl = hasAuthoredControlSurface(session);

  if (authoredControl) {
    if (!session.task_shape) {
      session.task_shape = classifyTaskShape(session.user_query, session.constraints.domains);
    }
    const hasActiveWork = session.work_items.some(
      (item) =>
        (item.kind === "gather_thread" || item.kind === "handoff_session") &&
        (item.status === "queued" || item.status === "in_progress"),
    );
    if (!hasActiveWork && session.threads.length > 0) {
      queuePlanWork(session, workItem?.work_item_id ?? null);
    }
    appendDecision(
      session,
      "plan",
      "Authored control surface is active; skipping runtime planning.",
      {
        task_shape: session.task_shape,
        thread_count: session.threads.length,
        claim_count: session.claims.length,
      },
    );
    return;
  }

  if (!session.task_shape) {
    session.task_shape = classifyTaskShape(session.user_query, session.constraints.domains);
  }

  if (
    session.task_shape === "broad" &&
    session.constraints.depth !== "quick" &&
    session.planning_artifacts.hypotheses.length === 0
  ) {
    const { result } = await runtime.runProviderOperation(
      {
        provider: "tavily",
        tool: "research",
        inputSummary: `Planning accelerator for: ${session.goal}`,
        scopeType: "session",
        scopeId: session.session_id,
        workItemId: workItem?.work_item_id ?? null,
      },
      () =>
        runtime.adapters.runTavilyResearch({
          input: session.goal,
          depth: session.constraints.depth,
        }),
    );
    const artifacts = planningArtifactsFromResearch(result, session.task_shape);
    session.planning_artifacts.hypotheses = artifacts.hypotheses;
    session.planning_artifacts.domain_hints = artifacts.domain_hints;
    session.planning_artifacts.comparison_axes = artifacts.comparison_axes;
  }

  if (
    session.task_shape === "broad" &&
    session.constraints.depth !== "quick" &&
    runtime.adapters.hasGeminiGrounding()
  ) {
    const { result } = await runtime.runProviderOperation(
      {
        provider: "gemini",
        tool: "grounding",
        inputSummary: `Planning accelerator: ${session.goal}`,
        scopeType: "session",
        scopeId: session.session_id,
        workItemId: workItem?.work_item_id ?? null,
      },
      () => runtime.adapters.runGeminiGrounding({ query: session.goal }),
    );
    const geminiArtifacts = planningArtifactsFromGeminiGrounding(result);
    session.planning_artifacts.hypotheses = mergeUniqueStrings(
      session.planning_artifacts.hypotheses,
      geminiArtifacts.hypotheses,
    );
    session.planning_artifacts.domain_hints = mergeUniqueStrings(
      session.planning_artifacts.domain_hints,
      geminiArtifacts.domain_hints,
    );
  }

  if (session.threads.length === 0 || session.claims.length === 0) {
    const plan = buildFallbackPlan(session);

    session.threads = plan.threads;
    session.claims = plan.claims;
    session.stop_status.remaining_gaps = mergeUniqueStrings(
      session.stop_status.remaining_gaps,
      plan.remainingGaps,
    );
    for (const gap of plan.remainingGaps) {
      upsertGap(session, { summary: gap, created_by: "runtime", status: "tracking" });
    }
    if (session.planning_artifacts.comparison_axes.length === 0) {
      session.planning_artifacts.comparison_axes = defaultComparisonAxes(session.task_shape);
    }
  }

  if (requiresPlanApproval(session)) {
    recordPlanVersion(session, {
      source: "runtime_fallback",
      mode: "replace",
      status: "pending_approval",
      summary: "Prepared a runtime-generated research plan for approval.",
      threads: session.threads,
      claims: session.claims,
      gaps: ensureArray(session.gaps),
      researchBrief: session.research_brief,
      remainingGaps: session.stop_status.remaining_gaps,
    });
    appendDecision(
      session,
      "plan_prepare",
      "Prepared a research plan and paused for approval.",
      {
        task_shape: session.task_shape,
        thread_count: session.threads.length,
        claim_count: session.claims.length,
      },
    );
    syncSessionStage(session);
    return;
  }

  session.plan_state.control_mode = "runtime_fallback";
  session.plan_state.awaiting_agent_decision_since = null;
  queuePlanWork(session, workItem?.work_item_id ?? null);
  appendDecision(session, "plan", "Generated answer-bearing threads and queued work items.", {
    task_shape: session.task_shape,
    thread_count: session.threads.length,
    claim_count: session.claims.length,
    source: "runtime_fallback",
    authority: "low",
  });
}

export function applyContinuationInstruction(session, instruction, domains = []) {
  const trimmed = String(instruction).trim();
  if (!trimmed) {
    return null;
  }
  ensureNotAwaitingPlanApproval(session);

  const inferred = inferContinuationFromProse(session, trimmed, domains);
  if (!inferred) {
    return null;
  }

  return applyContinuationPatch(
    session,
    {
      instruction: inferred.instruction,
      mode: inferred.mode,
      domains: inferred.domains,
      operations: inferred.operations,
    },
    { action: "instruction" },
  );
}
