import { existsSync } from "node:fs";

export const SESSION_VERSION = 6;
export const DEFAULT_DEPTH = "standard";
export const VALID_DEPTHS = new Set(["quick", "standard", "deep"]);
export const VALID_REPORT_FORMATS = new Set(["md", "json"]);
export const VALID_STAGES = new Set([
  "plan",
  "pending_review",
  "gather",
  "verify",
  "synthesize",
  "awaiting_agent_decision",
  "blocked",
  "complete",
  "closed",
]);
export const WORK_ITEM_PRIORITY = {
  plan_session: 10,
  handoff_session: 20,
  rejoin_handoff: 30,
  gather_thread: 40,
  verify_claim: 50,
  synthesize_session: 60,
};

export function isoNow() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fail(message) {
  throw new Error(String(message));
}

export function assertValidDepth(depth) {
  if (!VALID_DEPTHS.has(depth)) {
    fail(`Invalid depth: ${depth}`);
  }
}

export function assertValidFormat(format) {
  if (!VALID_REPORT_FORMATS.has(format)) {
    fail(`Invalid format: ${format}`);
  }
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function mergeUniqueStrings(base, incoming) {
  return uniqueBy([...ensureArray(base), ...ensureArray(incoming)], (item) => item);
}

export function normalizeStance(value) {
  if (value === "support" || value === "supports") {
    return "support";
  }
  if (value === "oppose" || value === "opposes") {
    return "oppose";
  }
  return "context";
}

function createThreadExecutionState(state = {}) {
  return {
    gather_status: state.gather_status ?? "queued",
    verify_status: state.verify_status ?? "queued",
    gather_rounds: Number.isFinite(state.gather_rounds) ? state.gather_rounds : 0,
    last_gathered_at: state.last_gathered_at ?? null,
    last_verified_at: state.last_verified_at ?? null,
    open_claim_ids: ensureArray(state.open_claim_ids),
    last_continuation_id: state.last_continuation_id ?? null,
  };
}

function createClaimVerificationState(state = {}) {
  return {
    status: state.status ?? "queued",
    attempts: Number.isFinite(state.attempts) ? state.attempts : 0,
    stale: Boolean(state.stale),
    last_checked_at: state.last_checked_at ?? null,
    last_continuation_id: state.last_continuation_id ?? null,
  };
}

function createClaimAssessmentState(state = {}) {
  return {
    verdict: state.verdict ?? "unproven",
    sufficiency: state.sufficiency ?? "unassessed",
    resolution_state: state.resolution_state ?? "unassessed",
    support_evidence_ids: ensureArray(state.support_evidence_ids),
    oppose_evidence_ids: ensureArray(state.oppose_evidence_ids),
    context_evidence_ids: ensureArray(state.context_evidence_ids),
    primary_evidence_ids: ensureArray(state.primary_evidence_ids),
    missing_dimensions: ensureArray(state.missing_dimensions),
    reason: state.reason ?? "",
    confidence_label: state.confidence_label ?? "low",
    last_evaluated_at: state.last_evaluated_at ?? null,
  };
}

function createPlanningArtifacts(value = {}) {
  return {
    hypotheses: ensureArray(value.hypotheses),
    domain_hints: ensureArray(value.domain_hints),
    comparison_axes: ensureArray(value.comparison_axes),
    continuation_notes: ensureArray(value.continuation_notes),
  };
}

function createSourcePolicy(value = {}, domains = []) {
  const allowDomains = mergeUniqueStrings(
    ensureArray(value.allow_domains ?? value.domains),
    ensureArray(domains),
  );
  return {
    mode: value.mode ?? (allowDomains.length > 0 ? "allowlist" : "open"),
    allow_domains: allowDomains,
    preferred_domains: ensureArray(value.preferred_domains),
    notes: ensureArray(value.notes),
  };
}

function createResearchBrief(value = {}, query = "", domains = []) {
  const now = isoNow();
  return {
    objective: value.objective ?? query,
    deliverable: value.deliverable ?? "report",
    source_policy: createSourcePolicy(value.source_policy, domains),
    clarification_notes: ensureArray(value.clarification_notes),
    auto_synthesize: Boolean(value.auto_synthesize),
    created_at: value.created_at ?? now,
    updated_at: value.updated_at ?? now,
  };
}

function createPlanState(value = {}) {
  return {
    approval_status: value.approval_status ?? "approved",
    review_required: Boolean(value.review_required),
    current_plan_version_id: value.current_plan_version_id ?? null,
    pending_plan_version_id: value.pending_plan_version_id ?? null,
    control_mode: value.control_mode ?? null,
    workflow_state: value.workflow_state ?? "draft",
    awaiting_agent_decision_since: value.awaiting_agent_decision_since ?? null,
    last_prepared_at: value.last_prepared_at ?? null,
    last_approved_at: value.last_approved_at ?? null,
  };
}

export function createContradiction(value = {}) {
  const now = isoNow();
  return {
    contradiction_id: value.contradiction_id ?? createId("cx"),
    claim_id: value.claim_id ?? value.claimId ?? null,
    left_evidence_id: value.left_evidence_id ?? value.leftEvidenceId ?? null,
    right_evidence_id: value.right_evidence_id ?? value.rightEvidenceId ?? null,
    conflict_type: value.conflict_type ?? value.conflictType ?? "factual_disagreement",
    summary: String(value.summary ?? "").trim(),
    status: value.status ?? "open",
    resolution_strategy: value.resolution_strategy ?? value.resolutionStrategy ?? "",
    resolved_at: value.resolved_at ?? null,
    resolution_note: value.resolution_note ?? "",
    created_at: value.created_at ?? now,
  };
}

function contradictionIdentity(item = {}) {
  return [item.claim_id ?? "", item.left_evidence_id ?? "", item.right_evidence_id ?? ""]
    .join("|")
    .toLowerCase();
}

export function upsertContradiction(session, input = {}) {
  const normalized = createContradiction(input);
  if (!normalized.summary) {
    fail("Contradiction entries require a non-empty `summary`.");
  }
  const existing = ensureArray(session.contradictions).find(
    (item) =>
      (normalized.contradiction_id && item.contradiction_id === normalized.contradiction_id) ||
      contradictionIdentity(item) === contradictionIdentity(normalized),
  );
  if (!existing) {
    session.contradictions.push(normalized);
    return normalized;
  }
  existing.summary = normalized.summary || existing.summary;
  existing.status = normalized.status || existing.status;
  existing.conflict_type = normalized.conflict_type || existing.conflict_type;
  existing.resolution_strategy = normalized.resolution_strategy || existing.resolution_strategy;
  existing.resolution_note = normalized.resolution_note || existing.resolution_note;
  if (normalized.status === "resolved" && !existing.resolved_at) {
    existing.resolved_at = isoNow();
  }
  return existing;
}

function createGap(value = {}) {
  const now = isoNow();
  const summary = String(value.summary ?? value.gap ?? value.text ?? "").trim();
  return {
    gap_id: value.gap_id ?? createId("gap"),
    kind: value.kind ?? "evidence_gap",
    summary,
    scope_type: value.scope_type ?? value.scopeType ?? null,
    scope_id: value.scope_id ?? value.scopeId ?? null,
    severity: value.severity ?? "medium",
    status: value.status ?? "open",
    recommended_next_action: value.recommended_next_action ?? value.recommendedNextAction ?? "",
    created_by: value.created_by ?? value.createdBy ?? "agent",
    created_at: value.created_at ?? now,
    updated_at: value.updated_at ?? now,
  };
}

function createDeltaPlan(value = {}) {
  const now = isoNow();
  return {
    delta_plan_id: value.delta_plan_id ?? createId("delta"),
    summary: String(value.summary ?? value.what_changed ?? "").trim(),
    what_changed: String(value.what_changed ?? value.summary ?? "").trim(),
    goal_update: String(value.goal_update ?? "").trim(),
    source_policy_update:
      value.source_policy_update && typeof value.source_policy_update === "object"
        ? {
            mode:
              typeof value.source_policy_update.mode === "string"
                ? value.source_policy_update.mode.trim()
                : "",
            allow_domains: ensureArray(value.source_policy_update.allow_domains),
            preferred_domains: ensureArray(value.source_policy_update.preferred_domains),
            notes: ensureArray(value.source_policy_update.notes),
          }
        : null,
    gap_updates: ensureArray(value.gap_updates),
    thread_actions: ensureArray(value.thread_actions),
    claim_actions: ensureArray(value.claim_actions),
    queue_proposals: ensureArray(value.queue_proposals),
    why_now: String(value.why_now ?? "").trim(),
    status: String(value.status ?? "applied").trim() || "applied",
    created_at: value.created_at ?? now,
    applied_at: value.applied_at ?? now,
  };
}

function summarizePlanThread(thread = {}) {
  return {
    thread_id: thread.thread_id ?? null,
    title: thread.title ?? "Untitled thread",
    intent: thread.intent ?? "",
    subqueries: ensureArray(thread.subqueries),
    claim_ids: ensureArray(thread.claim_ids),
  };
}

function summarizePlanGap(gap = {}) {
  return {
    gap_id: gap.gap_id ?? null,
    kind: gap.kind ?? "evidence_gap",
    summary: gap.summary ?? "",
    scope_type: gap.scope_type ?? null,
    scope_id: gap.scope_id ?? null,
    severity: gap.severity ?? "medium",
    status: gap.status ?? "open",
    recommended_next_action: gap.recommended_next_action ?? "",
    created_by: gap.created_by ?? "agent",
  };
}

function summarizePlanClaim(claim = {}) {
  return {
    claim_id: claim.claim_id ?? null,
    thread_id: claim.thread_id ?? null,
    text: claim.text ?? "",
    claim_type: claim.claim_type ?? "fact",
    priority: claim.priority ?? "medium",
  };
}

function normalizePlanVersion(value = {}) {
  const status = value.status ?? "approved";
  const createdAt = value.created_at ?? isoNow();
  return {
    plan_version_id: value.plan_version_id ?? createId("planv"),
    plan_id: value.plan_id ?? null,
    source: value.source ?? "runtime_fallback",
    mode: value.mode ?? "replace",
    status,
    goal: value.goal ?? "",
    task_shape: value.task_shape ?? null,
    summary: value.summary ?? "",
    threads: ensureArray(value.threads).map((thread) => summarizePlanThread(thread)),
    claims: ensureArray(value.claims).map((claim) => summarizePlanClaim(claim)),
    gaps: ensureArray(value.gaps).map((gap) => summarizePlanGap(gap)),
    research_brief: createResearchBrief(value.research_brief ?? {}, value.goal ?? "", []),
    remaining_gaps: ensureArray(value.remaining_gaps),
    created_at: createdAt,
    approved_at: value.approved_at ?? (status === "approved" ? createdAt : null),
  };
}

function normalizeActivityEntry(value = {}) {
  return {
    activity_id: value.activity_id ?? createId("activity"),
    type: value.type ?? "note",
    stage: value.stage ?? null,
    summary: value.summary ?? "",
    metadata: value.metadata ?? {},
    created_at: value.created_at ?? isoNow(),
  };
}

function gapIdentity(gap = {}) {
  return [
    gap.kind ?? "evidence_gap",
    gap.scope_type ?? "",
    gap.scope_id ?? "",
    gap.summary ?? "",
  ].join("|");
}

function createScores(value = {}) {
  return {
    claim_coverage_score: Number(value.claim_coverage_score ?? 0),
    primary_source_score: Number(value.primary_source_score ?? 0),
    source_diversity_score: Number(value.source_diversity_score ?? 0),
    contradiction_penalty: Number(value.contradiction_penalty ?? 0),
    recency_score: Number(value.recency_score ?? 1),
    confidence_score: Number(value.confidence_score ?? 0),
  };
}

function createStopStatus(value = {}) {
  return {
    decision: value.decision ?? "continue",
    reason: value.reason ?? "Session has not gathered evidence yet.",
    open_claim_ids: ensureArray(value.open_claim_ids),
    remaining_gaps: ensureArray(value.remaining_gaps),
  };
}

function createFinalAnswer(value = {}) {
  return {
    answer_summary: value.answer_summary ?? value.summary ?? "",
    key_findings: ensureArray(value.key_findings),
    thread_summaries: ensureArray(value.thread_summaries),
    synthesis_sections: ensureArray(value.synthesis_sections),
    unresolved_questions: ensureArray(value.unresolved_questions),
    confidence_explanation: value.confidence_explanation ?? "",
    citations: ensureArray(value.citations),
    generated_at: value.generated_at ?? null,
  };
}

function normalizeFindingEvidenceItem(item = {}) {
  return {
    evidence_id: item.evidence_id ?? null,
    title: item.title ?? "",
    url: item.url ?? "",
    quality: item.quality ?? "medium",
    source_type: item.source_type ?? "vendor",
    published_at: item.published_at ?? null,
    reason: item.reason ?? "",
    snippet: item.snippet ?? "",
    anchor_text: item.anchor_text ?? "",
    matched_sentence: item.matched_sentence ?? "",
    matched_sentence_index: Number.isFinite(item.matched_sentence_index)
      ? item.matched_sentence_index
      : null,
    matched_tokens: ensureArray(item.matched_tokens),
    excerpt_method: item.excerpt_method ?? "",
    attribution_confidence:
      typeof item.attribution_confidence === "number" ? item.attribution_confidence : null,
  };
}

function normalizeFinding(finding = {}) {
  return {
    finding_id: finding.finding_id ?? createId("finding"),
    claim_id: finding.claim_id ?? null,
    thread_id: finding.thread_id ?? null,
    thread_title: finding.thread_title ?? "",
    claim_text: finding.claim_text ?? "",
    status: finding.status ?? "insufficient",
    summary: finding.summary ?? "",
    confidence_label: finding.confidence_label ?? "low",
    confidence_reason: finding.confidence_reason ?? "",
    missing_dimensions: ensureArray(finding.missing_dimensions),
    support_evidence: ensureArray(finding.support_evidence).map((item) =>
      normalizeFindingEvidenceItem(item),
    ),
    oppose_evidence: ensureArray(finding.oppose_evidence).map((item) =>
      normalizeFindingEvidenceItem(item),
    ),
    context_evidence: ensureArray(finding.context_evidence).map((item) =>
      normalizeFindingEvidenceItem(item),
    ),
    citations: ensureArray(finding.citations).map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
    })),
    updated_at: finding.updated_at ?? null,
  };
}

function normalizeThread(thread) {
  return {
    thread_id: thread.thread_id ?? createId("thread"),
    title: thread.title ?? "Untitled thread",
    intent: thread.intent ?? "",
    subqueries: ensureArray(thread.subqueries),
    claim_ids: ensureArray(thread.claim_ids),
    notes: thread.notes ?? "",
    execution: createThreadExecutionState(thread.execution ?? thread.state),
  };
}

function normalizeClaim(claim, index = 0) {
  return {
    claim_id: claim.claim_id ?? createId(`claim${index + 1}`),
    thread_id: claim.thread_id ?? `legacy-thread-${index + 1}`,
    text: claim.text ?? `Legacy claim ${index + 1}`,
    claim_type: claim.claim_type ?? "fact",
    answer_relevance: claim.answer_relevance ?? (claim.priority === "high" ? "high" : "medium"),
    priority: claim.priority ?? "medium",
    status: claim.status ?? "open",
    why_it_matters: claim.why_it_matters ?? "",
    evidence_ids: ensureArray(claim.evidence_ids),
    verification: createClaimVerificationState(claim.verification),
    assessment: createClaimAssessmentState(claim.assessment),
  };
}

function normalizeClaimLinks(item = {}) {
  if (Array.isArray(item.claim_links)) {
    return uniqueBy(
      item.claim_links
        .map((link) => ({
          claim_id: link.claim_id ?? null,
          stance: normalizeStance(link.stance),
          reason: link.reason ?? link.why_matched ?? "",
          attribution: normalizeEvidenceAttribution(link.attribution ?? link),
        }))
        .filter((link) => link.claim_id),
      (link) => `${link.claim_id}|${link.stance}|${link.reason}`,
    );
  }

  const supports = ensureArray(item.supports_claim_ids).map((claimId) => ({
    claim_id: claimId,
    stance: "support",
    reason: item.why_matched ?? "Upgraded from legacy support links.",
  }));
  const opposes = ensureArray(item.opposes_claim_ids).map((claimId) => ({
    claim_id: claimId,
    stance: "oppose",
    reason: item.why_matched ?? "Upgraded from legacy opposition links.",
  }));
  if (supports.length > 0 || opposes.length > 0) {
    return [...supports, ...opposes];
  }

  if (item.claim_id) {
    return [
      {
        claim_id: item.claim_id,
        stance: normalizeStance(item.stance),
        reason: item.why_matched ?? "Upgraded from a single-claim legacy evidence record.",
        attribution: normalizeEvidenceAttribution(item.attribution ?? item),
      },
    ];
  }

  return [];
}

function normalizeEvidenceAttribution(attribution = {}, excerpt = "") {
  const fallbackAnchor =
    attribution.anchor_text ?? attribution.matched_sentence ?? String(excerpt).trim();
  return {
    anchor_text: fallbackAnchor ? String(fallbackAnchor) : "",
    matched_sentence:
      attribution.matched_sentence ?? (fallbackAnchor ? String(fallbackAnchor) : ""),
    matched_sentence_index: Number.isFinite(attribution.matched_sentence_index)
      ? attribution.matched_sentence_index
      : null,
    matched_tokens: ensureArray(attribution.matched_tokens),
    excerpt_method:
      attribution.excerpt_method ??
      (fallbackAnchor ? "sentence_match" : String(excerpt).trim() ? "raw_excerpt" : "none"),
    attribution_confidence:
      typeof attribution.attribution_confidence === "number"
        ? Number(attribution.attribution_confidence.toFixed(2))
        : null,
  };
}

function normalizeEvidenceRecord(item, index = 0) {
  const sourceType =
    item.source_type ?? (item.domain === "tavily" || item.url === "" ? "synthetic" : "vendor");
  const claimLinks = normalizeClaimLinks(item);
  const primaryLink =
    claimLinks.find((link) => link.stance !== "context") ?? claimLinks[0] ?? null;
  return {
    evidence_id: item.evidence_id ?? createId(`evidence${index + 1}`),
    run_id: item.run_id ?? `legacy-run-${index + 1}`,
    url: item.url ?? "",
    domain: item.domain ?? "",
    title: item.title ?? item.url ?? "Legacy evidence",
    excerpt: item.excerpt ?? item.snippet ?? item.summary ?? "",
    source_type: sourceType,
    quality: item.quality ?? (sourceType === "synthetic" ? "low" : "medium"),
    retrieval_score: item.retrieval_score ?? item.search_score ?? null,
    published_at: item.published_at ?? item.source_date ?? null,
    claim_links: claimLinks,
    attribution: normalizeEvidenceAttribution(
      item.attribution ?? primaryLink?.attribution ?? {},
      item.excerpt ?? item.snippet ?? item.summary ?? "",
    ),
    observed_at: item.observed_at ?? null,
    last_verified_at: item.last_verified_at ?? null,
    provenance: {
      query: item.provenance?.query ?? null,
      strategy:
        item.provenance?.strategy ?? (item.legacy ? "legacy_upgrade" : "search_extract"),
      operation_id: item.provenance?.operation_id ?? null,
      work_item_id: item.provenance?.work_item_id ?? null,
    },
    legacy: Boolean(item.legacy),
  };
}

function normalizeCandidateUrl(candidate) {
  return {
    candidate_id: candidate.candidate_id ?? createId("candidate"),
    thread_id: candidate.thread_id ?? null,
    query: candidate.query ?? "",
    url: candidate.url ?? "",
    title: candidate.title ?? candidate.url ?? "Untitled result",
    domain: candidate.domain ?? "",
    search_score: candidate.search_score ?? candidate.score ?? null,
    source_type: candidate.source_type ?? "vendor",
    selected: Boolean(candidate.selected),
    filter_reason: candidate.filter_reason ?? candidate.filterReason ?? "",
    operation_id: candidate.operation_id ?? null,
    work_item_id: candidate.work_item_id ?? null,
  };
}

function normalizeHandoff(handoff = null) {
  if (!handoff) {
    return null;
  }
  return {
    provider: handoff.provider ?? "manus",
    state: handoff.state ?? "submitted",
    task_id: handoff.task_id ?? null,
    task_url: handoff.task_url ?? null,
    profile: handoff.profile ?? "manus-1.6-lite",
    reason: handoff.reason ?? "artifact-heavy or connector-backed async task",
    interactive_mode: Boolean(handoff.interactive_mode),
    locale: handoff.locale ?? "en-US",
    rejoin_contract: {
      schema_version: handoff.rejoin_contract?.schema_version ?? 1,
      accepted_formats:
        ensureArray(handoff.rejoin_contract?.accepted_formats).length > 0
          ? ensureArray(handoff.rejoin_contract?.accepted_formats)
          : ["json"],
      guidance:
        handoff.rejoin_contract?.guidance ??
        "Return URL-backed evidence with claim_links so the local ledger can resume verification.",
    },
    remote_summary: handoff.remote_summary ?? null,
    rejoined_at: handoff.rejoined_at ?? null,
    pending_rejoin_payload: handoff.pending_rejoin_payload ?? null,
  };
}

function normalizeEntity(entity) {
  return {
    entity_id: entity.entity_id ?? createId("entity"),
    canonical_name: entity.canonical_name ?? entity.display_name ?? "Unknown entity",
    display_name: entity.display_name ?? entity.canonical_name ?? "Unknown entity",
    entity_type: entity.entity_type ?? "subject",
    domains: ensureArray(entity.domains),
    source_evidence_ids: ensureArray(entity.source_evidence_ids),
    notes: ensureArray(entity.notes),
  };
}

function normalizeObservation(observation) {
  return {
    observation_id: observation.observation_id ?? createId("observation"),
    entity_id: observation.entity_id ?? null,
    thread_id: observation.thread_id ?? null,
    claim_id: observation.claim_id ?? null,
    evidence_id: observation.evidence_id ?? null,
    facet: observation.facet ?? "",
    text: observation.text ?? "",
    source_url: observation.source_url ?? "",
    source_type: observation.source_type ?? "vendor",
    quality: observation.quality ?? "medium",
    published_at: observation.published_at ?? null,
  };
}

function normalizeOperation(operation) {
  const now = isoNow();
  return {
    operation_id: operation.operation_id ?? createId("op"),
    operation_key:
      operation.operation_key ??
      [
        operation.type ?? "provider_call",
        operation.provider ?? "local",
        operation.tool ?? "unknown",
        operation.scope_type ?? "session",
        operation.scope_id ?? "session",
        operation.work_item_id ?? "no-work-item",
      ].join(":"),
    type: operation.type ?? "provider_call",
    provider: operation.provider ?? "local",
    tool: operation.tool ?? "unknown",
    scope_type: operation.scope_type ?? "session",
    scope_id: operation.scope_id ?? "session",
    work_item_id: operation.work_item_id ?? null,
    run_id: operation.run_id ?? null,
    status: operation.status ?? "pending",
    retry_policy: operation.retry_policy ?? "safe_retry",
    input_summary: operation.input_summary ?? "",
    response_summary: operation.response_summary ?? null,
    remote_id: operation.remote_id ?? null,
    error: operation.error ?? null,
    created_at: operation.created_at ?? now,
    updated_at: operation.updated_at ?? now,
    completed_at: operation.completed_at ?? null,
  };
}

function normalizeContinuation(continuation) {
  const now = isoNow();
  return {
    continuation_id: continuation.continuation_id ?? createId("continuation"),
    instruction: continuation.instruction ?? "",
    mode: continuation.mode ?? "deepen",
    created_at: continuation.created_at ?? now,
    applied_at: continuation.applied_at ?? null,
    domains: ensureArray(continuation.domains),
    affected_thread_ids: ensureArray(continuation.affected_thread_ids),
    created_thread_ids: ensureArray(continuation.created_thread_ids),
    stale_claim_ids: ensureArray(continuation.stale_claim_ids),
    notes: ensureArray(continuation.notes),
    operations: ensureArray(continuation.operations).map((operation) =>
      normalizeContinuationOperation(operation),
    ),
  };
}

function normalizeContinuationOperation(operation = {}) {
  return {
    operation_id: operation.operation_id ?? createId("contop"),
    type: operation.type ?? "note",
    target_thread_id: operation.target_thread_id ?? operation.thread_id ?? null,
    target_claim_id: operation.target_claim_id ?? operation.claim_id ?? null,
    domains: ensureArray(operation.domains),
    note: operation.note ?? "",
    gap: operation.gap ?? "",
    reason: operation.reason ?? "",
    payload: operation.payload ?? operation.thread ?? operation.value ?? {},
  };
}

function normalizeWorkItem(workItem) {
  const now = isoNow();
  return {
    work_item_id: workItem.work_item_id ?? createId("work"),
    work_key:
      workItem.work_key ??
      [
        workItem.kind ?? "plan_session",
        workItem.scope_type ?? "session",
        workItem.scope_id ?? "session",
        workItem.continuation_id ?? "base",
        workItem.key_suffix ?? "default",
      ].join(":"),
    kind: workItem.kind ?? "plan_session",
    scope_type: workItem.scope_type ?? "session",
    scope_id: workItem.scope_id ?? "session",
    continuation_id: workItem.continuation_id ?? null,
    key_suffix: workItem.key_suffix ?? "default",
    reason: workItem.reason ?? "",
    status: workItem.status ?? "queued",
    attempt_count: Number.isFinite(workItem.attempt_count) ? workItem.attempt_count : 0,
    last_error: workItem.last_error ?? null,
    created_at: workItem.created_at ?? now,
    updated_at: workItem.updated_at ?? now,
    completed_at: workItem.completed_at ?? null,
    depends_on: ensureArray(workItem.depends_on),
  };
}

export function createRunRecord(provider, tool, inputSummary) {
  const now = isoNow();
  return {
    run_id: createId("run"),
    provider,
    tool,
    remote_id: null,
    status: "started",
    input_summary: inputSummary,
    output_summary: null,
    created_at: now,
    updated_at: now,
    metadata: {},
  };
}

export function finalizeRun(run, status, remoteId, outputSummary, metadata = {}) {
  run.status = status;
  run.remote_id = remoteId;
  run.output_summary = outputSummary;
  run.updated_at = isoNow();
  run.metadata = {
    ...run.metadata,
    ...metadata,
  };
}

export function appendDecision(session, action, rationale, details = {}) {
  session.decision_log.push({
    decided_at: isoNow(),
    action,
    rationale,
    details,
  });
}

export function appendActivity(session, type, summary, metadata = {}, stage = session.stage) {
  const entry = normalizeActivityEntry({
    type,
    stage: stage ?? null,
    summary,
    metadata,
  });
  session.activity_history.push(entry);
  return entry;
}

export function activeGaps(session) {
  return ensureArray(session.gaps).filter(
    (gap) => gap.status !== "resolved" && gap.status !== "closed" && gap.status !== "tracking",
  );
}

export function upsertGap(session, gapInput = {}) {
  const normalized = createGap(gapInput);
  if (!normalized.summary) {
    fail("Gap entries require a non-empty `summary`.");
  }
  const existing = ensureArray(session.gaps).find(
    (gap) =>
      (normalized.gap_id && gap.gap_id === normalized.gap_id) ||
      gapIdentity(gap) === gapIdentity(normalized),
  );
  if (!existing) {
    session.gaps.push(normalized);
    return normalized;
  }
  existing.severity = normalized.severity || existing.severity;
  existing.status = normalized.status || existing.status;
  existing.recommended_next_action =
    normalized.recommended_next_action || existing.recommended_next_action;
  existing.created_by = existing.created_by || normalized.created_by;
  existing.updated_at = isoNow();
  return existing;
}

export function syncResearchBrief(session) {
  const objective =
    session.goal || session.user_query || session.research_brief?.objective || "";
  session.research_brief = createResearchBrief(
    {
      ...session.research_brief,
      objective,
    },
    objective,
    session.constraints?.domains ?? [],
  );
  session.research_brief.updated_at = isoNow();
  return session.research_brief;
}

export function recordPlanVersion(
  session,
  {
    planId = null,
    source = "runtime_fallback",
    mode = "replace",
    status = session.plan_state?.approval_status === "pending"
      ? "pending_approval"
      : "approved",
    summary = "",
    threads = [],
    claims = [],
    gaps = [],
    researchBrief = session.research_brief,
    remainingGaps = [],
  } = {},
) {
  const pendingId = session.plan_state?.pending_plan_version_id ?? null;
  if (pendingId) {
    const pendingVersion = session.plan_versions.find(
      (version) => version.plan_version_id === pendingId,
    );
    if (pendingVersion && pendingVersion.status === "pending_approval") {
      pendingVersion.status = "superseded";
    }
  }

  const version = normalizePlanVersion({
    plan_id: planId,
    source,
    mode,
    status,
    summary,
    goal: session.goal,
    task_shape: session.task_shape,
    threads,
    claims,
    gaps,
    research_brief: researchBrief,
    remaining_gaps: remainingGaps,
  });
  session.plan_versions.push(version);

  if (status === "pending_approval") {
    session.plan_state.approval_status = "pending";
    session.plan_state.review_required = true;
    session.plan_state.pending_plan_version_id = version.plan_version_id;
    session.plan_state.workflow_state = "pending_review";
    session.plan_state.last_prepared_at = version.created_at;
  } else {
    session.plan_state.current_plan_version_id = version.plan_version_id;
    session.plan_state.approval_status = "approved";
    session.plan_state.review_required = false;
    session.plan_state.pending_plan_version_id = null;
    session.plan_state.control_mode =
      source === "agent_authored" ? "agent_authored" : "runtime_fallback";
    session.plan_state.workflow_state = "executing";
    session.plan_state.awaiting_agent_decision_since = null;
    session.plan_state.last_approved_at = version.approved_at ?? version.created_at;
  }

  appendActivity(session, "plan_version_recorded", "Recorded a research plan snapshot.", {
    plan_version_id: version.plan_version_id,
    plan_id: version.plan_id,
    source: version.source,
    status: version.status,
    thread_count: version.threads.length,
    claim_count: version.claims.length,
  });
  return version;
}

export function recordDeltaPlan(session, deltaPlan) {
  const normalized = createDeltaPlan(deltaPlan);
  const existing = ensureArray(session.delta_plans).find(
    (item) => item.delta_plan_id === normalized.delta_plan_id,
  );
  if (existing) {
    return existing;
  }
  session.delta_plans.push(normalized);
  appendActivity(session, "delta_plan_recorded", "Recorded an agent-authored delta plan.", {
    delta_plan_id: normalized.delta_plan_id,
    summary: normalized.summary,
    gap_update_count: normalized.gap_updates.length,
    thread_action_count: normalized.thread_actions.length,
    claim_action_count: normalized.claim_actions.length,
    queue_proposal_count: normalized.queue_proposals.length,
  });
  return normalized;
}

export function approvePendingPlan(session) {
  const pendingId = session.plan_state?.pending_plan_version_id ?? null;
  if (!pendingId) {
    fail("This session does not have a pending research plan to approve.");
  }
  const version = session.plan_versions.find((item) => item.plan_version_id === pendingId);
  if (!version) {
    fail("The pending research plan snapshot could not be found.");
  }
  version.status = "approved";
  version.approved_at = isoNow();
  session.plan_state.approval_status = "approved";
  session.plan_state.review_required = false;
  session.plan_state.pending_plan_version_id = null;
  session.plan_state.current_plan_version_id = version.plan_version_id;
  session.plan_state.control_mode =
    version.source === "agent_authored" ? "agent_authored" : "runtime_fallback";
  session.plan_state.workflow_state = "executing";
  session.plan_state.awaiting_agent_decision_since = null;
  session.plan_state.last_approved_at = version.approved_at;
  appendActivity(session, "plan_approved", "Approved the pending research plan.", {
    plan_version_id: version.plan_version_id,
    plan_id: version.plan_id,
  });
  queueWorkItem(session, {
    kind: "plan_session",
    scopeType: "session",
    scopeId: session.session_id,
    keySuffix: "approved-resume",
    reason: "The prepared research plan was approved; resume orchestration.",
  });
  return version;
}

export function getHighPriorityClaims(session) {
  return session.claims.filter((claim) => claim.priority === "high");
}

export function getClaimById(session, claimId) {
  return session.claims.find((claim) => claim.claim_id === claimId) ?? null;
}

export function getThreadById(session, threadId) {
  return session.threads.find((thread) => thread.thread_id === threadId) ?? null;
}

export function getWorkItemById(session, workItemId) {
  return session.work_items.find((item) => item.work_item_id === workItemId) ?? null;
}

export function createWorkItem({
  kind,
  scopeType,
  scopeId,
  continuationId = null,
  reason = "",
  keySuffix = "default",
  dependsOn = [],
}) {
  const now = isoNow();
  return {
    work_item_id: createId("work"),
    work_key: [kind, scopeType, scopeId, continuationId ?? "base", keySuffix].join(":"),
    kind,
    scope_type: scopeType,
    scope_id: scopeId,
    continuation_id: continuationId,
    key_suffix: keySuffix,
    reason,
    status: "queued",
    attempt_count: 0,
    last_error: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    depends_on: ensureArray(dependsOn),
  };
}

export function queueWorkItem(session, spec) {
  const draft = createWorkItem(spec);
  const existing = session.work_items.find(
    (item) =>
      item.work_key === draft.work_key &&
      (item.status === "queued" || item.status === "in_progress"),
  );
  if (existing) {
    return existing;
  }
  session.work_items.push(draft);
  return draft;
}

export function workItemDependenciesSatisfied(session, workItem) {
  const dependencies = ensureArray(workItem.depends_on);
  if (dependencies.length === 0) {
    return true;
  }
  return dependencies.every((dependencyId) => {
    const dependency = getWorkItemById(session, dependencyId);
    if (!dependency) {
      return false;
    }
    return dependency.status === "completed" || dependency.status === "skipped";
  });
}

export function nextQueuedWorkItem(session) {
  const queued = session.work_items
    .filter((item) => item.status === "queued" && workItemDependenciesSatisfied(session, item))
    .sort((left, right) => {
      const leftPriority = WORK_ITEM_PRIORITY[left.kind] ?? 999;
      const rightPriority = WORK_ITEM_PRIORITY[right.kind] ?? 999;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.created_at.localeCompare(right.created_at);
    });
  return queued[0] ?? null;
}

export function syncClaimEvidenceIds(session) {
  for (const claim of session.claims) {
    claim.evidence_ids = uniqueBy(
      session.evidence
        .filter((item) => item.claim_links.some((link) => link.claim_id === claim.claim_id))
        .map((item) => item.evidence_id),
      (item) => item,
    );
  }
}

export function setClaimAssessment(session, claimId, updates) {
  const claim = getClaimById(session, claimId);
  if (!claim) {
    return null;
  }
  claim.assessment = {
    ...createClaimAssessmentState(claim.assessment),
    ...updates,
    support_evidence_ids: ensureArray(
      updates.support_evidence_ids ?? claim.assessment.support_evidence_ids,
    ),
    oppose_evidence_ids: ensureArray(
      updates.oppose_evidence_ids ?? claim.assessment.oppose_evidence_ids,
    ),
    context_evidence_ids: ensureArray(
      updates.context_evidence_ids ?? claim.assessment.context_evidence_ids,
    ),
    primary_evidence_ids: ensureArray(
      updates.primary_evidence_ids ?? claim.assessment.primary_evidence_ids,
    ),
    missing_dimensions: ensureArray(
      updates.missing_dimensions ?? claim.assessment.missing_dimensions,
    ),
  };
  return claim.assessment;
}

export function upsertEntity(session, entity) {
  const normalized = normalizeEntity(entity);
  const nameKey = normalized.canonical_name.trim().toLowerCase();
  const domainKey = normalized.domains[0] ?? null;
  const existing = session.entities.find((item) => {
    if (nameKey && item.canonical_name.trim().toLowerCase() === nameKey) {
      return true;
    }
    if (domainKey && item.domains.includes(domainKey)) {
      return true;
    }
    return false;
  });
  if (existing) {
    existing.domains = mergeUniqueStrings(existing.domains, normalized.domains);
    existing.source_evidence_ids = uniqueBy(
      [...existing.source_evidence_ids, ...normalized.source_evidence_ids],
      (item) => item,
    );
    existing.notes = mergeUniqueStrings(existing.notes, normalized.notes);
    return existing;
  }
  session.entities.push(normalized);
  return normalized;
}

export function upsertObservation(session, observation) {
  const normalized = normalizeObservation(observation);
  const existing = session.observations.find(
    (item) =>
      item.entity_id === normalized.entity_id &&
      item.thread_id === normalized.thread_id &&
      item.claim_id === normalized.claim_id &&
      item.evidence_id === normalized.evidence_id &&
      item.facet === normalized.facet &&
      item.text === normalized.text,
  );
  if (existing) {
    return existing;
  }
  session.observations.push(normalized);
  return normalized;
}

export function evidenceForClaim(session, claimId) {
  return session.evidence.filter((item) =>
    item.claim_links.some((link) => link.claim_id === claimId),
  );
}

export function linkedClaimEvidence(session, claimId, stances = []) {
  const allowed = new Set(ensureArray(stances).map(normalizeStance));
  return session.evidence.filter((item) =>
    item.claim_links.some((link) => {
      if (link.claim_id !== claimId) {
        return false;
      }
      if (allowed.size === 0) {
        return true;
      }
      return allowed.has(normalizeStance(link.stance));
    }),
  );
}

export function claimLinkForEvidence(evidence, claimId) {
  return ensureArray(evidence.claim_links).find((link) => link.claim_id === claimId) ?? null;
}

export function isPrimarySource(sourceType) {
  return (
    sourceType === "official" ||
    sourceType === "docs" ||
    sourceType === "academic" ||
    sourceType === "news"
  );
}

export function isRealEvidence(evidence) {
  return Boolean(evidence.url) && evidence.source_type !== "synthetic";
}

function createFallbackThreadsFromClaims(claims) {
  return claims.map((claim, index) => ({
    thread_id: claim.thread_id ?? `legacy-thread-${index + 1}`,
    title: `Legacy thread ${index + 1}`,
    intent: "upgraded-legacy-thread",
    subqueries: [],
    claim_ids: [claim.claim_id],
    notes: "Upgraded from a v2 or v3 session.",
    execution: createThreadExecutionState(),
  }));
}

function inferLegacyTaskShape(session) {
  if (session.handoff?.provider === "manus" || session.path_hint === "manus") {
    return "async";
  }
  if (session.path_hint === "site") {
    return "site";
  }
  if (session.path_hint === "broad") {
    return "broad";
  }
  if (session.path_hint === "default") {
    return "verification";
  }

  const text = String(session.user_query ?? session.goal ?? "").toLowerCase();
  if (/(https?:\/\/|docs site|policy|changelog)/.test(text)) {
    return "site";
  }
  if (/(csv|pdf|ppt|connector|gmail|notion|calendar)/.test(text)) {
    return "async";
  }
  if (/(evidence|verify|official|certified|soc ?2)/.test(text)) {
    return "verification";
  }
  return "broad";
}

function createInitialWorkItems(session) {
  if (session.status === "completed" || session.status === "closed") {
    return [];
  }
  if (session.stage === "awaiting_agent_decision" || session.stage === "blocked") {
    return [];
  }
  if (session.plan_state?.approval_status === "pending") {
    return [];
  }
  if (session.handoff?.state === "rejoin_pending" && session.handoff.pending_rejoin_payload) {
    return [
      createWorkItem({
        kind: "rejoin_handoff",
        scopeType: "session",
        scopeId: session.session_id,
        reason: "Recover a queued remote handoff import.",
      }),
    ];
  }
  if (session.task_shape === "async" && session.handoff?.state === "submitted") {
    return [];
  }
  if (session.threads.length === 0) {
    return [
      createWorkItem({
        kind: "plan_session",
        scopeType: "session",
        scopeId: session.session_id,
      }),
    ];
  }

  const workItems = [];
  if (session.task_shape === "async" && !session.handoff) {
    workItems.push(
      createWorkItem({
        kind: "handoff_session",
        scopeType: "session",
        scopeId: session.session_id,
        reason: "Async work requires remote execution.",
      }),
    );
    return workItems;
  }

  for (const thread of session.threads) {
    workItems.push(
      createWorkItem({
        kind: "gather_thread",
        scopeType: "thread",
        scopeId: thread.thread_id,
        keySuffix: `round-${thread.execution.gather_rounds + 1}`,
        reason: "Recovered from a legacy session without explicit work items.",
      }),
    );
  }
  return workItems;
}

function normalizeThreadsAndClaims(session) {
  session.claims = ensureArray(session.claims).map((claim, index) =>
    normalizeClaim(claim, index),
  );
  session.threads =
    ensureArray(session.threads).length > 0
      ? ensureArray(session.threads).map((thread) => normalizeThread(thread))
      : createFallbackThreadsFromClaims(session.claims);

  for (const thread of session.threads) {
    if (thread.claim_ids.length === 0) {
      thread.claim_ids = session.claims
        .filter((claim) => claim.thread_id === thread.thread_id)
        .map((claim) => claim.claim_id);
    }
  }
}

function normalizeLedgerFields(session) {
  session.research_brief = createResearchBrief(
    session.research_brief,
    session.user_query ?? session.goal ?? "",
    session.constraints?.domains ?? [],
  );
  session.plan_state = createPlanState(session.plan_state);
  session.plan_versions = ensureArray(session.plan_versions).map((item) =>
    normalizePlanVersion(item),
  );
  session.delta_plans = ensureArray(session.delta_plans).map((item) => createDeltaPlan(item));
  session.activity_history = ensureArray(session.activity_history).map((item) =>
    normalizeActivityEntry(item),
  );
  session.gaps = ensureArray(session.gaps).map((item) => createGap(item));
  session.planning_artifacts = createPlanningArtifacts(session.planning_artifacts);
  session.candidate_urls = ensureArray(session.candidate_urls).map((item) =>
    normalizeCandidateUrl(item),
  );
  session.evidence = ensureArray(session.evidence).map((item, index) =>
    normalizeEvidenceRecord(item, index),
  );
  session.findings = ensureArray(session.findings).map((item) => normalizeFinding(item));
  session.contradictions = ensureArray(session.contradictions).map((item) =>
    createContradiction(item),
  );
  session.scores = createScores(session.scores);
  session.stop_status = createStopStatus(session.stop_status);
  session.final_answer = createFinalAnswer(session.final_answer);
  session.decision_log = ensureArray(session.decision_log);
  session.runs = ensureArray(session.runs);
  session.operations = ensureArray(session.operations).map((item) => normalizeOperation(item));
  session.continuations = ensureArray(session.continuations).map((item) =>
    normalizeContinuation(item),
  );
  session.work_items = ensureArray(session.work_items).map((item) => normalizeWorkItem(item));
  session.handoff = normalizeHandoff(session.handoff);
  session.entities = ensureArray(session.entities).map((item) => normalizeEntity(item));
  session.observations = ensureArray(session.observations).map((item) =>
    normalizeObservation(item),
  );
}

export function refreshThreadExecutionState(session) {
  for (const thread of session.threads) {
    const claims = session.claims.filter((claim) => claim.thread_id === thread.thread_id);
    const openClaims = claims
      .filter(
        (claim) =>
          claim.assessment.sufficiency !== "sufficient" ||
          claim.assessment.resolution_state === "contested",
      )
      .map((claim) => claim.claim_id);
    thread.execution.open_claim_ids = openClaims;
    if (thread.execution.gather_rounds > 0) {
      thread.execution.gather_status = openClaims.length === 0 ? "completed" : "gathered";
    }
    if (claims.every((claim) => claim.verification.status === "completed")) {
      thread.execution.verify_status = "completed";
    } else if (claims.some((claim) => claim.verification.status === "in_progress")) {
      thread.execution.verify_status = "in_progress";
    } else if (claims.some((claim) => claim.verification.status === "queued")) {
      thread.execution.verify_status = "queued";
    }
  }
}

export function syncSessionStage(session) {
  if (session.status === "closed") {
    session.stage = "closed";
    session.plan_state.workflow_state = "closed";
    return session.stage;
  }
  if (session.status === "completed") {
    session.stage = "synthesize";
    session.plan_state.workflow_state = "complete";
    return session.stage;
  }
  if (session.plan_state?.approval_status === "pending") {
    session.stage = "pending_review";
    session.plan_state.workflow_state = "pending_review";
    return session.stage;
  }

  const queuedOrRunning = session.work_items.filter(
    (item) => item.status === "queued" || item.status === "in_progress",
  );
  if (queuedOrRunning.some((item) => item.kind === "plan_session")) {
    session.stage = "plan";
    session.plan_state.workflow_state = "draft";
    return session.stage;
  }
  if (
    queuedOrRunning.some(
      (item) => item.kind === "gather_thread" || item.kind === "handoff_session",
    )
  ) {
    session.stage = "gather";
    session.plan_state.workflow_state = "executing";
    session.plan_state.awaiting_agent_decision_since = null;
    return session.stage;
  }
  if (
    queuedOrRunning.some(
      (item) => item.kind === "verify_claim" || item.kind === "rejoin_handoff",
    )
  ) {
    session.stage = "verify";
    session.plan_state.workflow_state = "executing";
    session.plan_state.awaiting_agent_decision_since = null;
    return session.stage;
  }
  if (queuedOrRunning.some((item) => item.kind === "synthesize_session")) {
    session.stage = "synthesize";
    session.plan_state.workflow_state = "synthesizing";
    session.plan_state.awaiting_agent_decision_since = null;
    return session.stage;
  }
  if (session.stage === "awaiting_agent_decision" || session.stage === "blocked") {
    session.plan_state.workflow_state = session.stage;
    if (
      session.stage === "awaiting_agent_decision" &&
      !session.plan_state.awaiting_agent_decision_since
    ) {
      session.plan_state.awaiting_agent_decision_since = isoNow();
    }
    return session.stage;
  }
  if (session.threads.length === 0) {
    session.stage = "plan";
    session.plan_state.workflow_state = "draft";
    return session.stage;
  }
  session.stage = "gather";
  session.plan_state.workflow_state = "executing";
  session.plan_state.awaiting_agent_decision_since = null;
  return session.stage;
}

function recoverInFlightState(session) {
  for (const workItem of session.work_items) {
    if (workItem.status === "in_progress") {
      workItem.status = "queued";
      workItem.updated_at = isoNow();
      workItem.last_error = "Recovered from a previously interrupted run.";
    }
  }

  const pendingHandoff = session.operations.find(
    (operation) =>
      operation.status === "pending" &&
      operation.type === "handoff" &&
      operation.provider === "manus",
  );
  if (pendingHandoff) {
    session.status = "needs_recovery";
    session.handoff = normalizeHandoff({
      ...session.handoff,
      provider: "manus",
      state: "submission_uncertain",
      reason:
        session.handoff?.reason ??
        "A previous Manus handoff may have been submitted before the last checkpoint.",
    });
    session.stop_status = {
      decision: "handoff",
      reason:
        "A Manus handoff was interrupted after the submission checkpoint. Do not auto-resubmit; inspect the remote task or rejoin it manually.",
      open_claim_ids: getHighPriorityClaims(session)
        .filter(
          (claim) =>
            claim.assessment.sufficiency !== "sufficient" ||
            claim.assessment.resolution_state === "contested",
        )
        .map((claim) => claim.claim_id),
      remaining_gaps: session.stop_status.remaining_gaps,
    };
  }
}

export function createSession({ query, depth, domains, approvalMode = "approved" }) {
  assertValidDepth(depth);
  const now = isoNow();
  const sessionId = createId("research");
  const session = {
    session_version: SESSION_VERSION,
    session_id: sessionId,
    status: "open",
    stage: "plan",
    task_shape: null,
    goal: "",
    research_brief: createResearchBrief({}, query, domains),
    plan_state: createPlanState({
      approval_status: approvalMode,
      review_required: approvalMode === "pending",
    }),
    plan_versions: [],
    delta_plans: [],
    activity_history: [],
    gaps: [],
    constraints: {
      depth,
      domains,
      time_range: null,
      country: null,
    },
    threads: [],
    claims: [],
    planning_artifacts: createPlanningArtifacts(),
    candidate_urls: [],
    evidence: [],
    findings: [],
    contradictions: [],
    scores: createScores(),
    stop_status: createStopStatus(),
    final_answer: createFinalAnswer(),
    decision_log: [],
    runs: [],
    operations: [],
    continuations: [],
    work_items: [
      createWorkItem({
        kind: "plan_session",
        scopeType: "session",
        scopeId: sessionId,
        reason: "Seed the initial research plan.",
      }),
    ],
    handoff: null,
    entities: [],
    observations: [],
    created_at: now,
    updated_at: now,
    closed_at: null,
    user_query: query,
  };
  syncSessionStage(session);
  appendActivity(session, "session_created", "Created a research session.", {
    approval_status: session.plan_state.approval_status,
    depth,
    domains,
  });
  return session;
}

export function upgradeSession(rawSession) {
  if (!rawSession || typeof rawSession !== "object") {
    fail("Invalid session payload.");
  }

  const upgraded = {
    session_version: SESSION_VERSION,
    session_id: rawSession.session_id ?? createId("research"),
    status: rawSession.status ?? "open",
    stage: VALID_STAGES.has(rawSession.stage) ? rawSession.stage : "plan",
    task_shape: rawSession.task_shape ?? inferLegacyTaskShape(rawSession),
    goal: rawSession.goal ?? rawSession.user_query ?? "",
    research_brief: rawSession.research_brief,
    plan_state: rawSession.plan_state,
    plan_versions: rawSession.plan_versions,
    delta_plans: rawSession.delta_plans,
    activity_history: rawSession.activity_history,
    gaps: rawSession.gaps,
    constraints: {
      depth: rawSession.constraints?.depth ?? rawSession.depth ?? DEFAULT_DEPTH,
      domains: ensureArray(rawSession.constraints?.domains ?? rawSession.domains),
      time_range: rawSession.constraints?.time_range ?? null,
      country: rawSession.constraints?.country ?? null,
    },
    threads: ensureArray(rawSession.threads),
    claims: ensureArray(rawSession.claims),
    planning_artifacts: rawSession.planning_artifacts,
    candidate_urls: rawSession.candidate_urls,
    evidence: rawSession.evidence,
    findings: rawSession.findings,
    contradictions: rawSession.contradictions,
    scores: rawSession.scores,
    stop_status: rawSession.stop_status,
    final_answer: rawSession.final_answer,
    decision_log: rawSession.decision_log,
    runs: rawSession.runs,
    operations: rawSession.operations,
    continuations: rawSession.continuations,
    work_items: rawSession.work_items,
    handoff: rawSession.handoff,
    entities: rawSession.entities,
    observations: rawSession.observations,
    created_at: rawSession.created_at ?? isoNow(),
    updated_at: rawSession.updated_at ?? isoNow(),
    closed_at: rawSession.closed_at ?? null,
    user_query: rawSession.user_query ?? rawSession.goal ?? "",
  };

  normalizeThreadsAndClaims(upgraded);
  normalizeLedgerFields(upgraded);
  syncResearchBrief(upgraded);
  syncClaimEvidenceIds(upgraded);

  if (upgraded.work_items.length === 0) {
    upgraded.work_items = createInitialWorkItems(upgraded);
  }

  recoverInFlightState(upgraded);
  refreshThreadExecutionState(upgraded);
  syncSessionStage(upgraded);
  return upgraded;
}

export function loadSessionIfExists(path) {
  return existsSync(path);
}
