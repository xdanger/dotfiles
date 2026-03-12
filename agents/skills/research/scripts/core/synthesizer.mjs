import {
  activeGaps,
  getClaimById,
  getThreadById,
  isPrimarySource,
  isRealEvidence,
  mergeUniqueStrings,
  nextQueuedWorkItem,
  uniqueBy,
} from "./session_schema.mjs";
import { buildFindings } from "./findings.mjs";

function confidenceLabel(score) {
  if (score >= 0.8) {
    return "high";
  }
  if (score >= 0.5) {
    return "medium";
  }
  return "low";
}

function citationsForEvidence(evidence) {
  return uniqueBy(
    evidence.filter((item) => item.url),
    (item) => item.url,
  ).map((item) => ({
    title: item.title,
    url: item.url,
  }));
}

function summarizedPlanVersion(version) {
  if (!version) {
    return null;
  }
  return {
    plan_version_id: version.plan_version_id,
    plan_id: version.plan_id,
    source: version.source,
    status: version.status,
    summary: version.summary,
    task_shape: version.task_shape,
    research_brief: version.research_brief ?? null,
    thread_count: Array.isArray(version.threads) ? version.threads.length : 0,
    claim_count: Array.isArray(version.claims) ? version.claims.length : 0,
    gaps: Array.isArray(version.gaps) ? version.gaps : [],
    remaining_gaps: Array.isArray(version.remaining_gaps) ? version.remaining_gaps : [],
    created_at: version.created_at,
    approved_at: version.approved_at,
  };
}

function currentPlanSummary(session) {
  return summarizedPlanVersion(
    session.plan_versions.find(
      (item) => item.plan_version_id === session.plan_state?.current_plan_version_id,
    ) ?? null,
  );
}

function pendingPlanSummary(session) {
  return summarizedPlanVersion(
    session.plan_versions.find(
      (item) => item.plan_version_id === session.plan_state?.pending_plan_version_id,
    ) ?? null,
  );
}

function latestDeltaPlanSummary(session) {
  const latest = Array.isArray(session.delta_plans) ? session.delta_plans.at(-1) : null;
  if (!latest) {
    return null;
  }
  return {
    delta_plan_id: latest.delta_plan_id,
    summary: latest.summary,
    what_changed: latest.what_changed,
    why_now: latest.why_now,
    gap_update_count: Array.isArray(latest.gap_updates) ? latest.gap_updates.length : 0,
    thread_action_count: Array.isArray(latest.thread_actions) ? latest.thread_actions.length : 0,
    claim_action_count: Array.isArray(latest.claim_actions) ? latest.claim_actions.length : 0,
    queue_proposal_count: Array.isArray(latest.queue_proposals) ? latest.queue_proposals.length : 0,
    applied_at: latest.applied_at,
  };
}

function observationsForThread(session, threadId) {
  return session.observations.filter((item) => item.thread_id === threadId);
}

function entityName(session, entityId) {
  return (
    session.entities.find((item) => item.entity_id === entityId)?.display_name ??
    "Unknown entity"
  );
}

function evidenceForThread(session, thread) {
  return session.evidence.filter(
    (item) =>
      isRealEvidence(item) &&
      item.claim_links.some((link) => thread.claim_ids.includes(link.claim_id)),
  );
}

function findingsForThread(session, threadId) {
  return session.findings.filter((item) => item.thread_id === threadId);
}

function preferredVerificationFinding(session) {
  const directClaim = session.claims.find(
    (claim) => claim.priority === "high" && claim.answer_relevance === "high",
  );
  return (
    session.findings.find((item) => item.claim_id === directClaim?.claim_id) ??
    session.findings[0] ??
    null
  );
}

function detailVerificationFinding(session, leadFinding) {
  const detailIntent =
    /\b(if so|which|what|how|where)\b/i.test(session.user_query || session.goal) ||
    /\b(endpoint|api surface|route|path|pricing|price|cost|billing|plan)\b/i.test(
      session.user_query || session.goal,
    );
  if (!detailIntent) {
    return null;
  }
  const statusOrder = {
    supported: 0,
    mixed: 1,
    insufficient: 2,
    rejected: 3,
  };
  return (
    [...session.findings]
      .filter(
        (item) =>
          item.claim_id !== leadFinding?.claim_id &&
          /\b(endpoint|api surface|route|path|pricing|price|cost|billing|plan|details?)\b/i.test(
            `${item.thread_title} ${item.claim_text}`,
          ),
      )
      .sort((left, right) => (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9))[0] ??
    null
  );
}

function leadEvidenceSentence(evidence, fallbackPrefix) {
  if (!evidence) {
    return "";
  }
  return `${fallbackPrefix} ${evidence.title}.`;
}

function detailPhraseFromEvidence(evidence) {
  const snippet = String(evidence?.snippet ?? evidence?.excerpt ?? "")
    .replace(/`+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!snippet) {
    return "";
  }
  const endpointMatch = snippet.match(/\b(\/v\d+(?:\/[a-z0-9._-]+)+)\b/iu);
  if (endpointMatch) {
    return endpointMatch[1];
  }
  const namedEndpointMatch = snippet.match(
    /\b((?:responses?|chat completions|assistants|realtime)\s+(?:api|endpoint))\b/iu,
  );
  if (namedEndpointMatch) {
    const phrase = namedEndpointMatch[1].trim();
    return phrase.replace(/\bapi\b/iu, "API").replace(/\bendpoint\b/iu, "endpoint");
  }
  const apiMatch = snippet.match(/\b([A-Z][A-Za-z0-9/-]*(?:\s+[A-Z][A-Za-z0-9/-]*)*\s+API)\b/u);
  if (apiMatch) {
    const phrase = apiMatch[1].trim();
    const firstWord = phrase.split(/\s+/u)[0]?.toLowerCase();
    if (!["set", "use", "open", "choose", "configure", "add", "fetch"].includes(firstWord)) {
      return phrase;
    }
  }
  const surfaceMatch = snippet.match(
    /\b(?:through|via|using)\s+the\s+([A-Za-z0-9/_ -]{3,80})[.;,]?/iu,
  );
  if (surfaceMatch) {
    return surfaceMatch[1].trim();
  }
  return "";
}

function detailEvidenceFromSession(session) {
  const candidates = session.evidence
    .filter((item) => isRealEvidence(item))
    .map((item) => ({
      evidence: item,
      phrase: detailPhraseFromEvidence(item),
    }))
    .filter(
      ({ evidence, phrase }) =>
        phrase ||
        /\b(endpoint|responses api|response api|pricing|billing|plan)\b/i.test(
          `${evidence.title} ${evidence.excerpt}`,
        ),
    );

  candidates.sort((left, right) => {
    const leftScore =
      Number(Boolean(left.phrase)) * 100 +
      Number(isPrimarySource(left.evidence.source_type)) * 10 +
      (left.evidence.quality === "high" ? 3 : left.evidence.quality === "medium" ? 2 : 1);
    const rightScore =
      Number(Boolean(right.phrase)) * 100 +
      Number(isPrimarySource(right.evidence.source_type)) * 10 +
      (right.evidence.quality === "high" ? 3 : right.evidence.quality === "medium" ? 2 : 1);
    return rightScore - leftScore;
  });

  return candidates[0] ?? null;
}

function detailSentenceForFinding(session, finding) {
  const evidence = finding?.support_evidence?.[0] ?? null;
  const phrase = detailPhraseFromEvidence(evidence);
  if (phrase) {
    return `The clearest implementation detail is ${phrase}.`;
  }
  const fallback = detailEvidenceFromSession(session);
  if (fallback?.phrase) {
    return `The clearest implementation detail is ${fallback.phrase}.`;
  }
  if (evidence?.title) {
    return `The clearest implementation detail comes from ${evidence.title}.`;
  }
  return "";
}

function detailUncertaintySentence(session, finding) {
  const directPhrase = detailPhraseFromEvidence(finding?.support_evidence?.[0] ?? null);
  const fallbackPhrase = detailEvidenceFromSession(session)?.phrase ?? "";
  const phrase = directPhrase || fallbackPhrase;
  if (finding?.status === "mixed") {
    return phrase
      ? `The best current implementation detail points to ${phrase}, but the endpoint evidence remains mixed.`
      : "The concrete implementation detail remains mixed across sources.";
  }
  if (finding?.status === "insufficient") {
    return phrase
      ? `The best current implementation detail points to ${phrase}, but the endpoint evidence is still incomplete.`
      : "The concrete implementation detail is still incomplete in the current evidence.";
  }
  return "";
}

function summarizeVerificationAnswer(session, finding) {
  if (!finding) {
    return `Not yet. Current evidence does not conclusively answer: ${session.goal}.`;
  }

  const claimText = String(finding.claim_text ?? "").trim();
  const normalizedClaimText =
    claimText.endsWith("?") || !claimText
      ? `Current evidence supports a direct answer to: ${session.goal}.`
      : claimText;
  const support = finding.support_evidence?.[0] ?? null;
  const oppose = finding.oppose_evidence?.[0] ?? null;
  const caveat = finding.context_evidence?.[0] ?? null;
  const detailFinding = detailVerificationFinding(session, finding);

  if (finding.status === "supported") {
    const detail =
      detailFinding?.status === "supported"
        ? detailSentenceForFinding(session, detailFinding)
        : detailUncertaintySentence(session, detailFinding);
    const supportSentence = leadEvidenceSentence(support, "The strongest support comes from");
    const caveatSentence = caveat ? ` Caveat: ${caveat.title} adds useful context.` : "";
    return `Yes. ${normalizedClaimText}${detail ? ` ${detail}` : ""} ${supportSentence}${caveatSentence}`.trim();
  }
  if (finding.status === "rejected") {
    const detail = leadEvidenceSentence(oppose, "The strongest opposing evidence comes from");
    return `No. ${normalizedClaimText} ${detail}`.trim();
  }
  if (finding.status === "mixed") {
    const supportDetail = support
      ? ` The strongest supporting detail comes from ${support.title}, which says: ${support.snippet}`
      : "";
    const opposeDetail = oppose
      ? ` Conflicting evidence also appears in ${oppose.title}.`
      : "";
    return `Not conclusively. Evidence is mixed on whether ${session.goal}.${supportDetail}${opposeDetail}`.trim();
  }
  return `Not yet. Current evidence does not conclusively answer: ${session.goal}.`;
}

function threadSummary(session, thread) {
  const findings = findingsForThread(session, thread.thread_id);
  const evidence = evidenceForThread(session, thread);
  const citations = uniqueBy(
    [...findings.flatMap((item) => item.citations), ...citationsForEvidence(evidence)].filter(
      (item) => item.url,
    ),
    (item) => item.url,
  ).slice(0, 3);
  const observations = observationsForThread(session, thread.thread_id)
    .slice(0, 4)
    .map((item) => ({
      entity: entityName(session, item.entity_id),
      facet: item.facet,
      text: item.text,
    }));

  const resolvedFindings = findings.filter((item) => item.status !== "insufficient");
  const unresolvedCount = findings.filter(
    (item) => item.status === "mixed" || item.status === "insufficient",
  ).length;
  let summary =
    resolvedFindings.length > 0
      ? resolvedFindings.map((item) => item.summary).join(" ")
      : "No decisive evidence has been gathered yet.";
  if (unresolvedCount > 0) {
    summary = `${summary} Unresolved evidence remains for ${unresolvedCount} claim(s).`.trim();
  }

  return {
    thread_id: thread.thread_id,
    title: thread.title,
    summary,
    claim_ids: thread.claim_ids,
    citations,
    gather_rounds: thread.execution.gather_rounds,
    entity_observations: observations,
  };
}

export function synthesizeAnswer(session) {
  session.findings = buildFindings(session);
  const threadSummaries = session.threads.map((thread) => threadSummary(session, thread));
  const leadFinding = preferredVerificationFinding(session);
  const keyFindings = session.findings
    .filter((item) => item.status !== "insufficient")
    .map((item) => item.summary);
  const orderedKeyFindings =
    session.task_shape === "verification" && leadFinding
      ? uniqueBy([leadFinding.summary, ...keyFindings], (item) => item)
      : keyFindings;
  const unresolvedQuestions = mergeUniqueStrings(
    session.stop_status.remaining_gaps,
    session.claims
      .filter(
        (claim) =>
          claim.assessment.sufficiency !== "sufficient" ||
          claim.assessment.resolution_state !== "resolved" ||
          claim.verification.stale,
      )
      .map((claim) => claim.text),
  );
  const synthesisSections = threadSummaries.map((thread) => ({
    section_id: `section-${thread.thread_id}`,
    title: thread.title,
    summary: thread.summary,
    entity_observations: thread.entity_observations,
    citations: thread.citations,
  }));
  const citations = uniqueBy(
    [
      ...(leadFinding?.citations ?? []),
      ...threadSummaries.flatMap((thread) => thread.citations),
    ],
    (item) => item.url,
  ).slice(0, 8);

  session.final_answer = {
    answer_summary:
      session.task_shape === "verification"
        ? summarizeVerificationAnswer(session, leadFinding)
        : orderedKeyFindings.length > 0
          ? orderedKeyFindings.slice(0, 2).join(" ")
          : "The session did not reach strong evidence-backed findings yet.",
    key_findings: orderedKeyFindings,
    thread_summaries: threadSummaries,
    synthesis_sections: synthesisSections,
    unresolved_questions: unresolvedQuestions,
    confidence_explanation: `Confidence is ${confidenceLabel(
      session.scores.confidence_score,
    )} based on claim coverage, primary-source support, diversity, and contradiction penalty.`,
    citations,
    generated_at: new Date().toISOString(),
  };
  session.status = "completed";
}

export function summarizeSession(session) {
  const activeWorkItem = nextQueuedWorkItem(session);
  const openGaps = activeGaps(session);
  return {
    session_id: session.session_id,
    session_version: session.session_version,
    status: session.status,
    stage: session.stage,
    task_shape: session.task_shape,
    goal: session.goal,
    research_brief: session.research_brief,
    plan_state: session.plan_state,
    workflow_state: session.plan_state?.workflow_state ?? null,
    control_mode: session.plan_state?.control_mode ?? null,
    current_plan: currentPlanSummary(session),
    pending_plan: pendingPlanSummary(session),
    latest_delta_plan: latestDeltaPlanSummary(session),
    scores: session.scores,
    stop_status: session.stop_status,
    open_gaps: openGaps,
    active_work_item: activeWorkItem
      ? {
          kind: activeWorkItem.kind,
          scope_type: activeWorkItem.scope_type,
          scope_id: activeWorkItem.scope_id,
          reason: activeWorkItem.reason,
        }
      : null,
    open_high_priority_claims: session.claims
      .filter(
        (claim) =>
          claim.priority === "high" &&
          (claim.assessment.sufficiency !== "sufficient" ||
            claim.assessment.resolution_state !== "resolved" ||
            claim.verification.stale),
      )
      .map((claim) => claim.text),
    unresolved_contradictions: session.contradictions
      .filter((item) => item.status === "open")
      .map((item) => ({
        summary: item.summary,
        conflict_type: item.conflict_type ?? null,
        resolution_strategy: item.resolution_strategy ?? "",
        status: item.status,
      })),
    recent_activity: session.activity_history.slice(-5),
    updated_at: session.updated_at,
  };
}

export function reviewSessionPacket(session) {
  const openGaps = activeGaps(session);
  const unresolvedContradictions = session.contradictions.filter((item) => item.status === "open");
  const latestEvidence = [...session.evidence]
    .filter((item) => item.url)
    .slice(-5)
    .map((item) => ({
      evidence_id: item.evidence_id,
      title: item.title,
      url: item.url,
      quality: item.quality,
      source_type: item.source_type,
      published_at: item.published_at,
    }));
  const recentFindings = session.findings.slice(-5).map((item) => ({
    finding_id: item.finding_id,
    claim_id: item.claim_id,
    status: item.status,
    summary: item.summary,
    confidence_label: item.confidence_label,
  }));

  return {
    session_id: session.session_id,
    stage: session.stage,
    workflow_state: session.plan_state?.workflow_state ?? null,
    control_mode: session.plan_state?.control_mode ?? null,
    research_brief: session.research_brief,
    current_plan: currentPlanSummary(session),
    pending_plan: pendingPlanSummary(session),
    latest_delta_plan: latestDeltaPlanSummary(session),
    open_blockers: openGaps,
    unresolved_contradictions: unresolvedContradictions.map((item) => ({
      contradiction_id: item.contradiction_id ?? null,
      summary: item.summary,
      status: item.status,
      conflict_type: item.conflict_type ?? null,
      resolution_strategy: item.resolution_strategy ?? "",
    })),
    recent_findings: recentFindings,
    recent_evidence: latestEvidence,
    recent_activity: session.activity_history.slice(-8),
    stop_status: session.stop_status,
  };
}

export function summarizeReport(session) {
  const answerSummary =
    session.final_answer.answer_summary || "No final synthesis available yet.";
  const currentPlan = currentPlanSummary(session);
  const pendingPlan = pendingPlanSummary(session);
  const latestDeltaPlan = latestDeltaPlanSummary(session);
  const blockerLines =
    activeGaps(session).length > 0
      ? activeGaps(session)
          .map(
            (gap) =>
              `- [${gap.severity}] ${gap.summary}${gap.recommended_next_action ? ` (${gap.recommended_next_action})` : ""}`,
          )
          .join("\n")
      : "- No structured blockers recorded.";
  const planLines =
    session.threads.length > 0
      ? session.threads.map((thread) => `- ${thread.title}: ${thread.intent}`).join("\n")
      : "- No research plan recorded.";

  const findingsLines =
    session.final_answer.key_findings.length > 0
      ? session.final_answer.key_findings.map((item) => `- ${item}`).join("\n")
      : "- No evidence-backed findings yet.";

  const gapLines =
    session.final_answer.unresolved_questions.length > 0
      ? session.final_answer.unresolved_questions.map((item) => `- ${item}`).join("\n")
      : "- No unresolved gaps.";

  const openContradictions = session.contradictions.filter((item) => item.status === "open");
  const contradictionLines =
    openContradictions.length > 0
      ? openContradictions
          .map(
            (item) =>
              `- [${item.conflict_type ?? "unknown"}] ${item.summary}${item.resolution_strategy ? ` (strategy: ${item.resolution_strategy})` : ""}`,
          )
          .join("\n")
      : "- No open contradictions.";

  const synthesisLines =
    session.final_answer.thread_summaries.length > 0
      ? session.final_answer.thread_summaries
          .map((item) => `- ${item.title}: ${item.summary}`)
          .join("\n")
      : session.final_answer.answer_summary || "No final synthesis available yet.";

  const citationLines =
    session.final_answer.citations.length > 0
      ? session.final_answer.citations
          .map((item, index) => `[${index + 1}] ${item.title} — ${item.url}`)
          .join("\n")
      : "- No citations recorded.";

  return [
    "# Research Plan",
    "",
    `Approval status: ${session.plan_state?.approval_status ?? "approved"}`,
    `Review required: ${session.plan_state?.review_required ? "yes" : "no"}`,
    `Workflow state: ${session.plan_state?.workflow_state ?? "draft"}`,
    `Control mode: ${session.plan_state?.control_mode ?? "none"}`,
    currentPlan ? `Current plan: ${currentPlan.summary || currentPlan.plan_version_id}` : "Current plan: none",
    pendingPlan ? `Pending plan: ${pendingPlan.summary || pendingPlan.plan_version_id}` : "Pending plan: none",
    latestDeltaPlan
      ? `Latest delta plan: ${latestDeltaPlan.summary || latestDeltaPlan.delta_plan_id}`
      : "Latest delta plan: none",
    "",
    "# Blockers",
    "",
    blockerLines,
    "",
    planLines,
    "",
    "# Answer Summary",
    "",
    answerSummary,
    "",
    "# Interim Findings",
    "",
    findingsLines,
    "",
    "# Evidence Gaps",
    "",
    gapLines,
    "",
    "# Open Contradictions",
    "",
    contradictionLines,
    "",
    "# Final Synthesis",
    "",
    synthesisLines,
    "",
    "Citations:",
    citationLines,
    "",
    "# Confidence and Unresolved Questions",
    "",
    session.final_answer.confidence_explanation,
    "",
    `Stop decision: ${session.stop_status.decision}`,
    `Reason: ${session.stop_status.reason}`,
    "",
    "Unresolved questions:",
    gapLines,
  ].join("\n");
}

export function sourcesForSession(session) {
  return uniqueBy(
    session.evidence.filter((item) => item.url),
    (item) => item.url,
  ).map((item) => ({
    claims: item.claim_links
      .map((link) => ({
        claim: getClaimById(session, link.claim_id)?.text ?? "",
        stance: link.stance,
        attribution: link.attribution ?? null,
      }))
      .filter((link) => link.claim),
    thread_titles: uniqueBy(
      item.claim_links
        .map((link) =>
          getThreadById(session, getClaimById(session, link.claim_id)?.thread_id ?? ""),
        )
        .filter(Boolean)
        .map((thread) => thread.title),
      (threadTitle) => threadTitle,
    ),
    title: item.title,
    url: item.url,
    domain: item.domain,
    source_type: item.source_type,
    quality: item.quality,
    attribution: item.attribution ?? null,
  }));
}
