import {
  activeGaps,
  appendDecision,
  ensureArray,
  getHighPriorityClaims,
  getThreadById,
  isPrimarySource,
  isRealEvidence,
  linkedClaimEvidence,
  queueWorkItem,
  refreshThreadExecutionState,
  syncSessionStage,
} from "./session_schema.mjs";
import { depthProfile, isTimeSensitiveGoal } from "./router.mjs";

function resolvedEvidenceForClaim(session, claimId) {
  return linkedClaimEvidence(session, claimId, ["support", "oppose"]).filter((item) =>
    isRealEvidence(item),
  );
}

function claimIsOpen(claim) {
  const assessment = claim.assessment ?? {
    sufficiency: "unassessed",
    resolution_state: "unassessed",
  };
  return (
    claim.verification.stale ||
    assessment.sufficiency !== "sufficient" ||
    assessment.resolution_state === "contested"
  );
}

function hasQueuedWork(session, kind, scopeId) {
  return session.work_items.some(
    (item) =>
      item.kind === kind &&
      item.scope_id === scopeId &&
      (item.status === "queued" || item.status === "in_progress"),
  );
}

function compatibleRemainingGaps(session, openGaps, openClaims) {
  const activeGapSummaries = new Set(openGaps.map((gap) => gap.summary));
  const legacyTextOnlyGaps = session.stop_status.remaining_gaps.filter(
    (summary) =>
      !session.gaps.some((gap) => gap.summary === summary) || activeGapSummaries.has(summary),
  );
  return [
    ...new Set([...legacyTextOnlyGaps, ...openGaps.map((gap) => gap.summary), ...openClaims]),
  ];
}

function hasAuthoredControlSurface(session) {
  const currentPlan = ensureArray(session.plan_versions).find(
    (item) => item.plan_version_id === session.plan_state?.current_plan_version_id,
  );
  return Boolean(
    session.plan_state?.control_mode === "agent_authored" ||
    currentPlan?.source === "agent_authored",
  );
}

function claimIsExhausted(session, claim) {
  const thread = getThreadById(session, claim.thread_id);
  if (!thread) {
    return false;
  }
  const profile = depthProfile(session.constraints.depth);
  return (
    thread.execution.gather_rounds >= profile.maxGatherRounds &&
    claim.verification.attempts >= 1 &&
    !hasQueuedWork(session, "gather_thread", thread.thread_id) &&
    !hasQueuedWork(session, "verify_claim", claim.claim_id)
  );
}

export function scoreSession(session) {
  const highClaims = getHighPriorityClaims(session);
  if (highClaims.length === 0) {
    session.scores = {
      claim_coverage_score: 0,
      primary_source_score: 0,
      source_diversity_score: 0,
      contradiction_penalty: 0,
      recency_score: 1,
      confidence_score: 0,
    };
    return session.scores;
  }

  const covered = highClaims.filter((claim) =>
    session.evidence.some((item) => {
      if (!isRealEvidence(item)) {
        return false;
      }
      return item.claim_links.some((link) => link.claim_id === claim.claim_id);
    }),
  );
  const resolved = highClaims.filter(
    (claim) =>
      !claim.verification.stale &&
      (claim.assessment?.sufficiency ?? "unassessed") === "sufficient",
  );
  const primaryResolved = resolved.filter((claim) =>
    resolvedEvidenceForClaim(session, claim.claim_id).some((item) =>
      isPrimarySource(item.source_type),
    ),
  );
  const supportedEvidence = resolved.flatMap((claim) =>
    resolvedEvidenceForClaim(session, claim.claim_id),
  );
  const domains = new Set(supportedEvidence.map((item) => item.domain).filter(Boolean));
  const sourceTypes = new Set(
    supportedEvidence.map((item) => item.source_type).filter(Boolean),
  );
  const unresolvedContradictions = session.contradictions.filter(
    (item) => item.status === "open",
  );

  const claimCoverageScore = covered.length / highClaims.length;
  const primarySourceScore = resolved.length > 0 ? primaryResolved.length / resolved.length : 0;
  const sourceDiversityScore = Math.min(1, (domains.size + sourceTypes.size) / 6);
  const contradictionWeight = (contradiction) => {
    const type = contradiction.conflict_type ?? "factual_disagreement";
    if (type === "factual_disagreement") return 1.0;
    if (type === "temporal") return 0.7;
    if (type === "interpretation") return 0.4;
    if (type === "scope") return 0.25;
    return 0.5;
  };
  const weightedContradictions = unresolvedContradictions.reduce(
    (sum, item) => sum + contradictionWeight(item),
    0,
  );
  const contradictionPenalty = weightedContradictions / highClaims.length;
  const recencyScore = isTimeSensitiveGoal(session.goal)
    ? session.evidence.some((item) => item.published_at)
      ? 1
      : 0.4
    : 1;
  const confidenceScore = Math.max(
    0,
    Math.min(
      1,
      claimCoverageScore * 0.35 +
        primarySourceScore * 0.25 +
        sourceDiversityScore * 0.2 +
        recencyScore * 0.2 -
        contradictionPenalty * 0.5,
    ),
  );

  session.scores = {
    claim_coverage_score: Number(claimCoverageScore.toFixed(2)),
    primary_source_score: Number(primarySourceScore.toFixed(2)),
    source_diversity_score: Number(sourceDiversityScore.toFixed(2)),
    contradiction_penalty: Number(contradictionPenalty.toFixed(2)),
    recency_score: Number(recencyScore.toFixed(2)),
    confidence_score: Number(confidenceScore.toFixed(2)),
  };
  return session.scores;
}

export function updateStopStatus(session) {
  refreshThreadExecutionState(session);

  if (
    session.status === "needs_recovery" &&
    session.handoff?.state === "submission_uncertain"
  ) {
    session.stop_status = {
      decision: "handoff",
      reason:
        "The previous Manus submission was interrupted after the handoff checkpoint. Rejoin or inspect the remote task before continuing.",
      open_claim_ids: getHighPriorityClaims(session).map((claim) => claim.claim_id),
      remaining_gaps: session.stop_status.remaining_gaps,
    };
    return session.stop_status;
  }

  if (session.handoff?.state === "submitted" && session.status === "waiting_remote") {
    session.stop_status = {
      decision: "handoff",
      reason: session.handoff.reason,
      open_claim_ids: getHighPriorityClaims(session)
        .filter((claim) => claimIsOpen(claim))
        .map((claim) => claim.claim_id),
      remaining_gaps: session.stop_status.remaining_gaps,
    };
    return session.stop_status;
  }

  const highClaims = getHighPriorityClaims(session);
  const openClaims = highClaims.filter((claim) => claimIsOpen(claim));
  const openGaps = activeGaps(session);
  const allOpenClaimsExhausted =
    openClaims.length > 0 && openClaims.every((claim) => claimIsExhausted(session, claim));

  const decision =
    (openClaims.length === 0 &&
      openGaps.length === 0 &&
      session.scores.primary_source_score >= 0.5 &&
      session.scores.contradiction_penalty === 0) ||
    (allOpenClaimsExhausted && openGaps.length === 0)
      ? "stop"
      : "continue";

  session.stop_status = {
    decision,
    reason:
      decision === "stop"
        ? allOpenClaimsExhausted
          ? "Automatic retrieval reached the depth budget, so the session will return a partial synthesis with explicit gaps."
          : "High-priority claims are sufficiently supported with acceptable primary-source coverage."
        : openGaps.length > 0
          ? "Important blockers remain open, so the session should not claim closure yet."
          : "Important claims remain unresolved, tentative, contradictory, stale, or under-evidenced.",
    open_claim_ids: openClaims.map((claim) => claim.claim_id),
    remaining_gaps: compatibleRemainingGaps(
      session,
      openGaps,
      openClaims.map((claim) => claim.text),
    ),
  };
  return session.stop_status;
}

export function advanceStage(session) {
  refreshThreadExecutionState(session);
  updateStopStatus(session);
  const authoredControl = hasAuthoredControlSurface(session);
  const openGaps = activeGaps(session);

  if (session.handoff?.state === "submitted" && session.status === "waiting_remote") {
    return syncSessionStage(session);
  }

  if (authoredControl) {
    const hasNonSynthesisWork = session.work_items.some(
      (item) =>
        item.kind !== "synthesize_session" &&
        (item.status === "queued" || item.status === "in_progress"),
    );
    if (
      session.stop_status.decision === "stop" &&
      !hasQueuedWork(session, "synthesize_session", session.session_id)
    ) {
      queueWorkItem(session, {
        kind: "synthesize_session",
        scopeType: "session",
        scopeId: session.session_id,
        reason: session.stop_status.reason,
      });
    } else if (
      !hasNonSynthesisWork &&
      !hasQueuedWork(session, "synthesize_session", session.session_id)
    ) {
      const hasHighSeverityBlockers = openGaps.some((gap) => gap.severity === "high");
      if (session.research_brief?.auto_synthesize && !hasHighSeverityBlockers) {
        queueWorkItem(session, {
          kind: "synthesize_session",
          scopeType: "session",
          scopeId: session.session_id,
          reason:
            "Auto-synthesize enabled; producing synthesis without waiting for agent decision.",
        });
      } else {
        session.stage =
          openGaps.length > 0 ? "blocked" : "awaiting_agent_decision";
      }
    }
    return syncSessionStage(session);
  }

  const profile = depthProfile(session.constraints.depth);
  for (const claim of getHighPriorityClaims(session)) {
    const thread = getThreadById(session, claim.thread_id);
    if (!thread) {
      continue;
    }

    if (claimIsOpen(claim) && claim.verification.status !== "queued") {
      queueWorkItem(session, {
        kind: "verify_claim",
        scopeType: "claim",
        scopeId: claim.claim_id,
        reason: `Claim ${claim.claim_id} remains unresolved after scoring.`,
      });
      claim.verification.status = "queued";
    }

    if (
      claimIsOpen(claim) &&
      !hasQueuedWork(session, "gather_thread", thread.thread_id) &&
      thread.execution.gather_rounds < profile.maxGatherRounds
    ) {
      queueWorkItem(session, {
        kind: "gather_thread",
        scopeType: "thread",
        scopeId: thread.thread_id,
        keySuffix: `round-${thread.execution.gather_rounds + 1}`,
        reason: `Follow-up gather pass for unresolved claim ${claim.claim_id}.`,
      });
    }
  }

  const hasNonSynthesisWork = session.work_items.some(
    (item) =>
      item.kind !== "synthesize_session" &&
      (item.status === "queued" || item.status === "in_progress"),
  );
  if (
    session.stop_status.decision === "stop" &&
    !hasQueuedWork(session, "synthesize_session", session.session_id)
  ) {
    queueWorkItem(session, {
      kind: "synthesize_session",
      scopeType: "session",
      scopeId: session.session_id,
      reason: session.stop_status.reason,
    });
  } else if (
    !hasNonSynthesisWork &&
    !hasQueuedWork(session, "synthesize_session", session.session_id)
  ) {
    queueWorkItem(session, {
      kind: "synthesize_session",
      scopeType: "session",
      scopeId: session.session_id,
      reason: "No more automatic work items remain; produce the best current synthesis.",
    });
  }

  return syncSessionStage(session);
}

export function recordStageDecision(session) {
  appendDecision(session, "score", "Updated sufficiency scores, stage, and stop decision.", {
    scores: session.scores,
    stop_status: session.stop_status,
    stage: session.stage,
  });
}
