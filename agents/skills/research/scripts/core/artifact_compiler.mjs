import { createId, ensureArray, fail, mergeUniqueStrings } from "./session_schema.mjs";
import { normalizeGoal } from "./router.mjs";

const VALID_TASK_SHAPES = new Set(["broad", "verification", "site", "async"]);

function createThread(title, intent, subqueries, notes = "") {
  return {
    thread_id: createId("thread"),
    title,
    intent,
    subqueries,
    claim_ids: [],
    notes,
    execution: {
      gather_status: "queued",
      verify_status: "queued",
      gather_rounds: 0,
      last_gathered_at: null,
      last_verified_at: null,
      open_claim_ids: [],
      last_continuation_id: null,
    },
  };
}

function createClaim(threadId, text, claimType, priority, answerRelevance = "high") {
  return {
    claim_id: createId("claim"),
    thread_id: threadId,
    text,
    claim_type: claimType,
    answer_relevance: answerRelevance,
    priority,
    status: "open",
    why_it_matters: "",
    evidence_ids: [],
    verification: {
      status: "queued",
      attempts: 0,
      stale: false,
      last_checked_at: null,
      last_continuation_id: null,
    },
    assessment: {
      verdict: "unproven",
      sufficiency: "unassessed",
      resolution_state: "unassessed",
      support_evidence_ids: [],
      oppose_evidence_ids: [],
      context_evidence_ids: [],
      primary_evidence_ids: [],
      missing_dimensions: [],
      reason: "",
      confidence_label: "low",
      last_evaluated_at: null,
    },
  };
}

function createClaimFromSpec(threadId, spec = {}) {
  const text = String(spec.text ?? "").trim();
  if (!text) {
    fail("Agent-authored claim is missing `text`.");
  }
  const claim = createClaim(
    threadId,
    text,
    spec.claim_type ?? "fact",
    spec.priority ?? "medium",
    spec.answer_relevance ?? (spec.priority === "high" ? "high" : "medium"),
  );
  claim.why_it_matters = String(spec.why_it_matters ?? "").trim();
  return claim;
}

function createThreadFromSpec(spec = {}) {
  const title = String(spec.title ?? "").trim();
  const intent = String(spec.intent ?? "").trim();
  if (!title) {
    fail("Agent-authored thread is missing `title`.");
  }
  if (!intent) {
    fail(`Agent-authored thread "${title}" is missing \`intent\`.`);
  }
  return createThread(
    title,
    intent,
    Array.isArray(spec.subqueries)
      ? spec.subqueries.map((item) => String(item).trim()).filter(Boolean)
      : [],
    String(spec.notes ?? "").trim(),
  );
}

export function compileResearchBrief(rawPlan = {}) {
  const rawBrief =
    rawPlan.research_brief && typeof rawPlan.research_brief === "object"
      ? rawPlan.research_brief
      : {};
  const rawSourcePolicy =
    rawBrief.source_policy && typeof rawBrief.source_policy === "object"
      ? rawBrief.source_policy
      : rawPlan.source_policy && typeof rawPlan.source_policy === "object"
        ? rawPlan.source_policy
        : null;
  return {
    objective: String(rawBrief.objective ?? rawPlan.goal ?? "").trim(),
    deliverable: String(rawBrief.deliverable ?? "").trim(),
    source_policy: rawSourcePolicy
      ? {
          mode: typeof rawSourcePolicy.mode === "string" ? rawSourcePolicy.mode.trim() : "",
          allow_domains: mergeUniqueStrings(
            [],
            ensureArray(rawSourcePolicy.allow_domains ?? rawSourcePolicy.domains)
              .map((item) => String(item).trim())
              .filter(Boolean),
          ),
          preferred_domains: mergeUniqueStrings(
            [],
            ensureArray(rawSourcePolicy.preferred_domains)
              .map((item) => String(item).trim())
              .filter(Boolean),
          ),
          notes: ensureArray(rawSourcePolicy.notes)
            .map((item) => String(item).trim())
            .filter(Boolean),
        }
      : null,
    clarification_notes: ensureArray(rawBrief.clarification_notes)
      .map((item) => String(item).trim())
      .filter(Boolean),
    auto_synthesize: Boolean(rawBrief.auto_synthesize),
  };
}

export function compileGapSpec(rawGap = {}, fallbackSummary = "") {
  const summary =
    typeof rawGap === "string"
      ? rawGap.trim()
      : String(rawGap.summary ?? rawGap.gap ?? rawGap.text ?? fallbackSummary).trim();
  if (!summary) {
    fail("Gap entries require a non-empty `summary`.");
  }
  return {
    kind:
      typeof rawGap === "object" && !Array.isArray(rawGap) && rawGap.kind
        ? String(rawGap.kind).trim()
        : "evidence_gap",
    summary,
    scope_type:
      typeof rawGap === "object" && !Array.isArray(rawGap)
        ? (rawGap.scope_type ?? rawGap.scopeType ?? null)
        : null,
    scope_id:
      typeof rawGap === "object" && !Array.isArray(rawGap)
        ? (rawGap.scope_id ?? rawGap.scopeId ?? null)
        : null,
    severity:
      typeof rawGap === "object" && !Array.isArray(rawGap) && rawGap.severity
        ? String(rawGap.severity).trim()
        : "medium",
    status:
      typeof rawGap === "object" && !Array.isArray(rawGap) && rawGap.status
        ? String(rawGap.status).trim()
        : "open",
    recommended_next_action:
      typeof rawGap === "object" && !Array.isArray(rawGap)
        ? String(rawGap.recommended_next_action ?? rawGap.recommendedNextAction ?? "").trim()
        : "",
    created_by:
      typeof rawGap === "object" && !Array.isArray(rawGap)
        ? String(rawGap.created_by ?? rawGap.createdBy ?? "agent").trim()
        : "agent",
  };
}

export function compileSourcePolicyUpdate(rawSourcePolicy = null) {
  if (
    !rawSourcePolicy ||
    typeof rawSourcePolicy !== "object" ||
    Array.isArray(rawSourcePolicy)
  ) {
    return null;
  }
  return {
    mode: typeof rawSourcePolicy.mode === "string" ? rawSourcePolicy.mode.trim() : "",
    allow_domains: mergeUniqueStrings(
      [],
      ensureArray(rawSourcePolicy.allow_domains ?? rawSourcePolicy.domains)
        .map((item) => String(item).trim())
        .filter(Boolean),
    ),
    preferred_domains: mergeUniqueStrings(
      [],
      ensureArray(rawSourcePolicy.preferred_domains)
        .map((item) => String(item).trim())
        .filter(Boolean),
    ),
    notes: ensureArray(rawSourcePolicy.notes)
      .map((item) => String(item).trim())
      .filter(Boolean),
  };
}

export function compileQueueProposal(proposal = {}) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    fail("Delta plan queue proposals must be JSON objects.");
  }
  const kind = String(proposal.kind ?? "").trim();
  const scopeType = String(proposal.scope_type ?? proposal.scopeType ?? "").trim();
  const scopeId = String(proposal.scope_id ?? proposal.scopeId ?? "").trim();
  if (!kind || !scopeType || !scopeId) {
    fail("Delta plan queue proposals require `kind`, `scope_type`, and `scope_id`.");
  }
  if (
    !["gather_thread", "verify_claim", "synthesize_session", "handoff_session"].includes(kind)
  ) {
    fail(`Unsupported delta plan queue proposal kind: ${kind}`);
  }
  return {
    kind,
    scope_type: scopeType,
    scope_id: scopeId,
    reason: String(proposal.reason ?? "").trim() || `Delta plan proposed ${kind}.`,
    key_suffix: String(proposal.key_suffix ?? proposal.keySuffix ?? "delta-plan").trim(),
  };
}

export function compileDeltaPlan(rawPlan = {}) {
  const rawDelta =
    rawPlan?.delta_plan && typeof rawPlan.delta_plan === "object"
      ? rawPlan.delta_plan
      : rawPlan;
  if (!rawDelta || typeof rawDelta !== "object" || Array.isArray(rawDelta)) {
    fail("Delta plan must be a JSON object.");
  }
  const gapUpdates = ensureArray(rawDelta.gap_updates).map((item) => {
    const action = String(item.action ?? "upsert").trim() || "upsert";
    if (!["upsert", "resolve", "close"].includes(action)) {
      fail(`Unsupported delta plan gap action: ${action}`);
    }
    return {
      action,
      gap_id: typeof item.gap_id === "string" ? item.gap_id.trim() : "",
      summary: typeof item.summary === "string" ? item.summary.trim() : "",
      gap: action === "upsert" ? compileGapSpec(item.gap ?? item) : null,
    };
  });
  const threadActions = ensureArray(rawDelta.thread_actions).map((item) => {
    const action = String(item.action ?? item.type ?? "").trim();
    if (!["deepen", "pause", "branch"].includes(action)) {
      fail(`Unsupported delta plan thread action: ${action}`);
    }
    if (action === "branch") {
      const spec = item.thread ?? item.payload ?? {};
      const thread = createThreadFromSpec(spec);
      const rawClaims = Array.isArray(spec.claims) ? spec.claims : [];
      if (rawClaims.length === 0) {
        fail("Delta plan thread action `branch` requires at least one claim.");
      }
      const claims = rawClaims.map((claim) => createClaimFromSpec(thread.thread_id, claim));
      thread.claim_ids = claims.map((claim) => claim.claim_id);
      thread.execution.open_claim_ids = [...thread.claim_ids];
      return { action, thread, claims, reason: String(item.reason ?? "").trim() };
    }
    const threadId = String(item.thread_id ?? item.threadId ?? "").trim();
    if (!threadId) {
      fail(`Delta plan thread action \`${action}\` requires \`thread_id\`.`);
    }
    return { action, thread_id: threadId, reason: String(item.reason ?? "").trim() };
  });
  const claimActions = ensureArray(rawDelta.claim_actions).map((item) => {
    const action = String(item.action ?? item.type ?? "").trim();
    if (!["mark_stale", "set_priority"].includes(action)) {
      fail(`Unsupported delta plan claim action: ${action}`);
    }
    const claimId = String(item.claim_id ?? item.claimId ?? "").trim();
    if (!claimId) {
      fail(`Delta plan claim action \`${action}\` requires \`claim_id\`.`);
    }
    const priority = action === "set_priority" ? String(item.priority ?? "").trim() : "";
    if (action === "set_priority" && !priority) {
      fail("Delta plan claim action `set_priority` requires `priority`.");
    }
    return {
      action,
      claim_id: claimId,
      priority,
      reason: String(item.reason ?? "").trim(),
    };
  });
  return {
    delta_plan_id: String(rawDelta.delta_plan_id ?? "").trim() || createId("delta"),
    summary: String(rawDelta.summary ?? rawDelta.what_changed ?? "").trim(),
    what_changed: String(rawDelta.what_changed ?? rawDelta.summary ?? "").trim(),
    goal_update: String(rawDelta.goal_update ?? "").trim(),
    source_policy_update: compileSourcePolicyUpdate(rawDelta.source_policy_update),
    gap_updates: gapUpdates,
    thread_actions: threadActions,
    claim_actions: claimActions,
    queue_proposals: ensureArray(rawDelta.queue_proposals).map((item) =>
      compileQueueProposal(item),
    ),
    why_now: String(rawDelta.why_now ?? "").trim(),
  };
}

export function compileAgentPlan(rawPlan = {}) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    fail("Agent-authored plan must be a JSON object.");
  }

  const rawThreads = Array.isArray(rawPlan.threads) ? rawPlan.threads : [];
  if (rawThreads.length === 0) {
    fail("Agent-authored plan must include a non-empty `threads` array.");
  }

  const threads = [];
  const claims = [];
  for (const rawThread of rawThreads) {
    const thread = createThreadFromSpec(rawThread);
    const rawClaims = Array.isArray(rawThread.claims) ? rawThread.claims : [];
    if (rawClaims.length === 0) {
      fail(`Agent-authored thread "${thread.title}" must include at least one claim.`);
    }
    const compiledClaims = rawClaims.map((item) => createClaimFromSpec(thread.thread_id, item));
    thread.claim_ids = compiledClaims.map((item) => item.claim_id);
    thread.execution.open_claim_ids = [...thread.claim_ids];
    threads.push(thread);
    claims.push(...compiledClaims);
  }

  const artifacts = rawPlan.planning_artifacts ?? {};
  const taskShape =
    typeof rawPlan.task_shape === "string" ? rawPlan.task_shape.trim().toLowerCase() : null;
  if (taskShape && !VALID_TASK_SHAPES.has(taskShape)) {
    fail(`Invalid agent-authored task_shape: ${rawPlan.task_shape}`);
  }
  return {
    goal: typeof rawPlan.goal === "string" ? normalizeGoal(rawPlan.goal) : "",
    task_shape: taskShape,
    plan_id: typeof rawPlan.plan_id === "string" ? rawPlan.plan_id.trim() : "",
    threads,
    claims,
    remainingGaps: Array.isArray(rawPlan.remaining_gaps)
      ? rawPlan.remaining_gaps.map((item) => String(item).trim()).filter(Boolean)
      : [],
    gaps: [
      ...ensureArray(rawPlan.gaps).map((item) => compileGapSpec(item)),
      ...ensureArray(rawPlan.remaining_gaps).map((item) =>
        compileGapSpec(
          typeof item === "string"
            ? { summary: item, status: "tracking", created_by: "compat" }
            : {
                ...item,
                status: item.status ?? "tracking",
                created_by: item.created_by ?? "compat",
              },
        ),
      ),
    ],
    planningArtifacts: {
      hypotheses: Array.isArray(artifacts.hypotheses)
        ? artifacts.hypotheses.map((item) => String(item).trim()).filter(Boolean)
        : [],
      domain_hints: Array.isArray(artifacts.domain_hints)
        ? artifacts.domain_hints.map((item) => String(item).trim()).filter(Boolean)
        : [],
      comparison_axes: Array.isArray(artifacts.comparison_axes)
        ? artifacts.comparison_axes.map((item) => String(item).trim()).filter(Boolean)
        : [],
      continuation_notes: Array.isArray(artifacts.continuation_notes)
        ? artifacts.continuation_notes.map((item) => String(item).trim()).filter(Boolean)
        : [],
    },
    constraints: rawPlan.constraints ?? {},
    researchBrief: compileResearchBrief(rawPlan),
    summary: String(rawPlan.summary ?? rawPlan.notes ?? "").trim(),
  };
}

function compileContinuationOperation(operation = {}) {
  const type = String(operation.type ?? "").trim();
  if (!type) {
    fail("Continuation patch operations require a `type`.");
  }

  if (type === "merge_domains") {
    const domains = mergeUniqueStrings(
      [],
      ensureArray(operation.domains)
        .map((item) => String(item).trim())
        .filter(Boolean),
    );
    if (domains.length === 0) {
      fail("Continuation patch operation `merge_domains` requires at least one domain.");
    }
    return {
      type,
      domains,
      reason: String(operation.reason ?? "Continuation merged additional domain constraints."),
    };
  }

  if (type === "mark_claim_stale") {
    const claimId = String(operation.claim_id ?? operation.claimId ?? "").trim();
    if (!claimId) {
      fail("Continuation patch operation `mark_claim_stale` requires `claim_id`.");
    }
    return {
      type,
      claim_id: claimId,
      reason:
        String(operation.reason ?? "").trim() ||
        "Continuation requested claim re-verification.",
    };
  }

  if (type === "requeue_thread") {
    const threadId = String(operation.thread_id ?? operation.threadId ?? "").trim();
    if (!threadId) {
      fail("Continuation patch operation `requeue_thread` requires `thread_id`.");
    }
    return {
      type,
      thread_id: threadId,
      reason:
        String(operation.reason ?? "").trim() ||
        "Continuation requested another gather pass for this thread.",
    };
  }

  if (type === "add_gap") {
    const gap = compileGapSpec(operation.gap ?? operation);
    return {
      type,
      gap,
      reason:
        String(operation.reason ?? "").trim() ||
        "Continuation recorded an explicit evidence gap.",
    };
  }

  if (type === "note") {
    const note = String(operation.note ?? operation.text ?? "").trim();
    if (!note) {
      fail("Continuation patch operation `note` requires `note`.");
    }
    return {
      type,
      note,
    };
  }

  if (type === "add_thread") {
    const spec = operation.thread ?? operation.payload ?? {};
    const thread = createThreadFromSpec(spec);
    const rawClaims = Array.isArray(spec.claims) ? spec.claims : [];
    if (rawClaims.length === 0) {
      fail("Continuation patch operation `add_thread` requires at least one claim.");
    }
    const claims = rawClaims.map((item) => createClaimFromSpec(thread.thread_id, item));
    thread.claim_ids = claims.map((item) => item.claim_id);
    thread.execution.open_claim_ids = [...thread.claim_ids];
    return {
      type,
      thread,
      claims,
      reason: String(operation.reason ?? `Continuation created a new thread: ${thread.title}`),
    };
  }

  fail(`Unsupported continuation patch operation: ${type}`);
}

export function compileContinuationPatch(rawPatch = {}) {
  const patch =
    rawPatch?.continuation_patch && typeof rawPatch.continuation_patch === "object"
      ? rawPatch.continuation_patch
      : rawPatch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    fail("Continuation patch must be a JSON object.");
  }
  const operations = ensureArray(patch.operations).map((item) =>
    compileContinuationOperation(item),
  );
  if (operations.length === 0) {
    fail("Continuation patch must include a non-empty `operations` array.");
  }
  return {
    instruction: String(patch.instruction ?? rawPatch.instruction ?? "").trim(),
    mode: String(patch.mode ?? "deepen").trim() || "deepen",
    domains: mergeUniqueStrings(
      ensureArray(patch.domains)
        .map((item) => String(item).trim())
        .filter(Boolean),
      operations.flatMap((operation) => operation.domains ?? []),
    ),
    notes: ensureArray(patch.notes)
      .map((item) => String(item).trim())
      .filter(Boolean),
    operations,
  };
}
