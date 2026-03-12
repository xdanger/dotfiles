import {
  appendDecision,
  evidenceForClaim,
  getClaimById,
  isoNow,
  isPrimarySource,
  linkedClaimEvidence,
  setClaimAssessment,
  upsertContradiction,
  uniqueBy,
} from "./session_schema.mjs";
import { depthProfile, scopedSiteDomains } from "./router.mjs";
import {
  inferClaimMatch,
  inferQuality,
  inferSourceType,
  mergeEvidenceRecords,
  recordEvidenceStructures,
} from "./retrieval.mjs";
import { URL } from "node:url";

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function bestLinkedEvidence(evidenceItems, stance) {
  const ranked = evidenceItems
    .filter((item) => item.claim_links.some((link) => link.stance === stance))
    .sort((left, right) => {
      const qualityOrder = { high: 3, medium: 2, low: 1 };
      return (qualityOrder[right.quality] ?? 0) - (qualityOrder[left.quality] ?? 0);
    });
  return ranked[0] ?? null;
}

function evaluateClaimAssessment(session, claim, items) {
  const supporting = items.filter((item) =>
    item.claim_links.some(
      (link) => link.claim_id === claim.claim_id && link.stance === "support",
    ),
  );
  const opposing = items.filter((item) =>
    item.claim_links.some(
      (link) => link.claim_id === claim.claim_id && link.stance === "oppose",
    ),
  );
  const context = items.filter((item) =>
    item.claim_links.some(
      (link) => link.claim_id === claim.claim_id && link.stance === "context",
    ),
  );
  const primaryEvidenceIds = items
    .filter((item) => isPrimarySource(item.source_type))
    .map((item) => item.evidence_id);
  const bestSupport = bestLinkedEvidence(supporting, "support");
  const bestOppose = bestLinkedEvidence(opposing, "oppose");

  let status = "open";
  let verdict = "unproven";
  let sufficiency = "insufficient";
  let resolutionState = "unassessed";
  let reason = "The claim does not yet have direct supporting or opposing evidence.";
  const missingDimensions = [];

  if (supporting.length === 0 && opposing.length === 0) {
    missingDimensions.push("direct_support");
  } else if (supporting.length > 0 && opposing.length === 0) {
    status = "supported";
    verdict = primaryEvidenceIds.length > 0 ? "supported" : "tentative_support";
    sufficiency =
      primaryEvidenceIds.length > 0 || supporting.length > 1 ? "sufficient" : "partial";
    resolutionState = sufficiency === "sufficient" ? "resolved" : "tentative";
    reason =
      verdict === "supported"
        ? "Supporting evidence exists and includes at least one primary or sufficiently corroborated source."
        : "Supporting evidence exists, but the claim still lacks strong primary corroboration.";
    if (verdict === "tentative_support") {
      missingDimensions.push("primary_support");
    }
  } else if (supporting.length === 0 && opposing.length > 0) {
    status = "rejected";
    verdict = primaryEvidenceIds.length > 0 ? "rejected" : "tentative_reject";
    sufficiency =
      primaryEvidenceIds.length > 0 || opposing.length > 1 ? "sufficient" : "partial";
    resolutionState = sufficiency === "sufficient" ? "resolved" : "tentative";
    reason =
      verdict === "rejected"
        ? "Opposing evidence exists and includes at least one primary or sufficiently corroborated source."
        : "Opposing evidence exists, but the claim still lacks strong primary corroboration.";
    if (verdict === "tentative_reject") {
      missingDimensions.push("primary_oppose");
    }
  } else {
    const supportIsStronger = bestSupport?.quality === "high" && bestOppose?.quality !== "high";
    const opposeIsStronger = bestOppose?.quality === "high" && bestSupport?.quality !== "high";
    status = "mixed";
    verdict = "mixed";
    sufficiency = "insufficient";
    resolutionState = "contested";
    reason = "Conflicting evidence remains and the claim cannot be treated as settled.";
    missingDimensions.push("tie_breaker_source");

    if (supportIsStronger) {
      status = "supported";
      verdict = primaryEvidenceIds.length > 0 ? "supported" : "tentative_support";
      sufficiency = primaryEvidenceIds.length > 0 ? "sufficient" : "partial";
      resolutionState = primaryEvidenceIds.length > 0 ? "resolved" : "tentative";
      reason = "Conflicting evidence exists, but stronger primary support currently wins.";
      missingDimensions.length = 0;
    } else if (opposeIsStronger) {
      status = "rejected";
      verdict = primaryEvidenceIds.length > 0 ? "rejected" : "tentative_reject";
      sufficiency = primaryEvidenceIds.length > 0 ? "sufficient" : "partial";
      resolutionState = primaryEvidenceIds.length > 0 ? "resolved" : "tentative";
      reason = "Conflicting evidence exists, but stronger primary opposition currently wins.";
      missingDimensions.length = 0;
    }
  }

  if (primaryEvidenceIds.length === 0 && supporting.length + opposing.length > 0) {
    missingDimensions.push("primary_source");
  }

  setClaimAssessment(session, claim.claim_id, {
    verdict,
    sufficiency,
    resolution_state: resolutionState,
    support_evidence_ids: supporting.map((item) => item.evidence_id),
    oppose_evidence_ids: opposing.map((item) => item.evidence_id),
    context_evidence_ids: context.map((item) => item.evidence_id),
    primary_evidence_ids: primaryEvidenceIds,
    missing_dimensions: uniqueBy(missingDimensions, (item) => item),
    reason,
    confidence_label:
      sufficiency === "sufficient" ? "high" : sufficiency === "partial" ? "medium" : "low",
    last_evaluated_at: isoNow(),
  });

  claim.status = status;
  return { supporting, opposing, bestSupport, bestOppose };
}

export function reconcileClaims(session) {
  session.contradictions = [];

  for (const claim of session.claims) {
    const items = evidenceForClaim(session, claim.claim_id);
    claim.evidence_ids = uniqueBy(
      items.map((item) => item.evidence_id),
      (item) => item,
    );

    const { bestSupport, bestOppose } = evaluateClaimAssessment(session, claim, items);

    if (claim.assessment.verdict === "unproven") {
      continue;
    }

    if (claim.assessment.resolution_state === "resolved") {
      if (claim.status === "supported" && bestOppose) {
        upsertContradiction(session, {
          claimId: claim.claim_id,
          leftEvidenceId: bestSupport?.evidence_id ?? null,
          rightEvidenceId: bestOppose.evidence_id,
          conflictType: "factual_disagreement",
          summary: `Conflicting evidence exists for "${claim.text}", but primary support is stronger.`,
          status: "resolved",
          resolutionStrategy: "stronger_primary_support",
        });
      } else if (claim.status === "rejected" && bestSupport) {
        upsertContradiction(session, {
          claimId: claim.claim_id,
          leftEvidenceId: bestSupport.evidence_id,
          rightEvidenceId: bestOppose?.evidence_id ?? null,
          conflictType: "factual_disagreement",
          summary: `Conflicting evidence exists for "${claim.text}", but primary opposition is stronger.`,
          status: "resolved",
          resolutionStrategy: "stronger_primary_opposition",
        });
      }
      continue;
    }

    if (claim.assessment.resolution_state === "tentative") {
      upsertContradiction(session, {
        claimId: claim.claim_id,
        leftEvidenceId: bestSupport?.evidence_id ?? null,
        rightEvidenceId: bestOppose?.evidence_id ?? null,
        conflictType: "interpretation",
        summary: `The current verdict for "${claim.text}" remains tentative because primary corroboration is still missing.`,
        status: "open",
        resolutionStrategy: "seek_more_primary_or_recent_source",
      });
      continue;
    }

    upsertContradiction(session, {
      claimId: claim.claim_id,
      leftEvidenceId: bestSupport?.evidence_id ?? null,
      rightEvidenceId: bestOppose?.evidence_id ?? null,
      conflictType: "factual_disagreement",
      summary: `Conflicting evidence exists for "${claim.text}".`,
      status: "open",
      resolutionStrategy: "seek_more_primary_or_recent_source",
    });
  }
}

export function claimNeedsVerification(session, claim) {
  const assessment = claim.assessment ?? {
    sufficiency: "unassessed",
    resolution_state: "unassessed",
  };
  if (claim.priority !== "high") {
    return false;
  }
  if (claim.verification.stale) {
    return true;
  }
  if (assessment.sufficiency !== "sufficient" || assessment.resolution_state === "contested") {
    return true;
  }
  const items = evidenceForClaim(session, claim.claim_id);
  return !items.some((item) => item.source_type === "official" || item.source_type === "docs");
}

function candidateFromVerificationResult(claim, query, result) {
  const sourceType = inferSourceType(
    result.url ?? "",
    result.title ?? "",
    result.content ?? "",
  );
  return {
    claim,
    query,
    url: result.url ?? "",
    title: result.title ?? result.url ?? "Untitled result",
    domain: domainFromUrl(result.url ?? ""),
    score: result.score ?? 0,
    sourceType,
  };
}

function selectVerificationCandidates(results, profile) {
  return results
    .filter((item) => item.score >= profile.minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(2, Math.min(profile.extractLimit, 4)));
}

function buildVerificationEvidence({
  runId,
  operationId,
  workItemId,
  claim,
  item,
  query,
  searchScore,
}) {
  const excerpt = item.raw_content ?? item.content ?? "";
  const sourceType = inferSourceType(item.url ?? "", item.title ?? "", excerpt);
  const match = inferClaimMatch(claim, excerpt, claim.text);
  return {
    evidence_id: `evidence-${runId}-${Math.random().toString(36).slice(2, 7)}`,
    run_id: runId,
    url: item.url ?? "",
    domain: domainFromUrl(item.url ?? ""),
    title: item.title ?? item.url ?? "Untitled evidence",
    excerpt,
    source_type: sourceType,
    quality: inferQuality(sourceType),
    retrieval_score: searchScore,
    published_at: item.published_date ?? item.date ?? item.created_at ?? null,
    claim_links: [
      {
        claim_id: claim.claim_id,
        stance: match.stance,
        reason: `Verification query targeted the claim directly. ${match.whyMatched}`,
        attribution: match.attribution,
      },
    ],
    attribution: match.attribution,
    observed_at: isoNow(),
    last_verified_at: null,
    provenance: {
      query,
      strategy: "claim_verification",
      operation_id: operationId,
      work_item_id: workItemId,
    },
  };
}

function verificationQuery(session, claim) {
  const domains = scopedSiteDomains(session.user_query, session.constraints.domains);
  const domainHint = domains.length > 0 ? ` site:${domains[0]}` : "";
  return `${claim.text} official primary source${domainHint}`;
}

export async function verifyClaims(session, runtime, workItem) {
  const claim = getClaimById(session, workItem.scope_id);
  if (!claim) {
    appendDecision(session, "verify", "Skipped verification for missing claim.", {
      work_item_id: workItem.work_item_id,
    });
    return;
  }

  if (
    session.task_shape === "site" &&
    scopedSiteDomains(session.user_query, session.constraints.domains).length === 0
  ) {
    appendDecision(
      session,
      "verify",
      "Skipped site verification because no explicit URL or domain scope was provided.",
    );
    return;
  }

  if (!claimNeedsVerification(session, claim)) {
    claim.verification.status = "completed";
    appendDecision(
      session,
      "verify",
      "Skipped verification because the claim is already sufficient.",
      {
        claim_id: claim.claim_id,
      },
    );
    return;
  }

  const profile = depthProfile(session.constraints.depth);
  const query = verificationQuery(session, claim);
  const { operation: searchOperation, result: searchResult } =
    await runtime.runProviderOperation(
      {
        provider: "tavily",
        tool: "search",
        inputSummary: query,
        scopeType: "claim",
        scopeId: claim.claim_id,
        workItemId: workItem.work_item_id,
      },
      () =>
        runtime.adapters.runTavilySearch({
          query,
          depth: profile.searchDepth,
          domains: session.constraints.domains,
          timeRange: session.constraints.time_range,
          country: session.constraints.country,
        }),
    );

  const selected = selectVerificationCandidates(
    (searchResult.results || []).map((result) =>
      candidateFromVerificationResult(claim, query, result),
    ),
    profile,
  );

  session.candidate_urls.push(
    ...selected.map((item) => ({
      candidate_id: `candidate-${claim.claim_id}-${Math.random().toString(36).slice(2, 7)}`,
      thread_id: claim.thread_id,
      query,
      url: item.url,
      title: item.title,
      domain: item.domain,
      search_score: item.score,
      source_type: item.sourceType,
      selected: true,
      filter_reason: "selected_for_claim_verification",
      operation_id: searchOperation.operation_id,
      work_item_id: workItem.work_item_id,
    })),
  );

  if (selected.length === 0) {
    claim.verification.status = "completed";
    claim.verification.attempts += 1;
    claim.verification.last_checked_at = isoNow();
    appendDecision(session, "verify", "No verification candidates met the threshold.", {
      claim_id: claim.claim_id,
      query,
    });
    return;
  }

  const { operation, run, result } = await runtime.runProviderOperation(
    {
      provider: "tavily",
      tool: "extract",
      inputSummary: `Claim verification extract for ${claim.claim_id}`,
      scopeType: "claim",
      scopeId: claim.claim_id,
      workItemId: workItem.work_item_id,
    },
    () =>
      runtime.adapters.runTavilyExtract({
        urls: selected.map((item) => item.url),
        query,
      }),
  );

  const evidenceItems = (result.results || []).map((item) =>
    buildVerificationEvidence({
      runId: run.run_id,
      operationId: operation.operation_id,
      workItemId: workItem.work_item_id,
      claim,
      item,
      query,
      searchScore: selected.find((candidate) => candidate.url === item.url)?.score ?? null,
    }),
  );
  const verifiedAt = isoNow();
  for (const item of evidenceItems) {
    item.last_verified_at = verifiedAt;
  }
  session.evidence = mergeEvidenceRecords(session.evidence, evidenceItems);
  recordEvidenceStructures(
    session,
    session.threads.find((thread) => thread.thread_id === claim.thread_id) ?? {
      thread_id: claim.thread_id,
      title: claim.text,
    },
    evidenceItems,
  );

  claim.verification.status = "completed";
  claim.verification.stale = false;
  claim.verification.attempts += 1;
  claim.verification.last_checked_at = isoNow();
  reconcileClaims(session);
  const realEvidence = linkedClaimEvidence(session, claim.claim_id, ["support", "oppose"]);
  if (realEvidence.length === 0) {
    claim.status = "insufficient";
  }
  appendDecision(session, "verify", "Ran claim-centric verification for a queued claim.", {
    claim_id: claim.claim_id,
    work_item_id: workItem.work_item_id,
  });
}
