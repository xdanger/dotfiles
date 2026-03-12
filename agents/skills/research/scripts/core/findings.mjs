import {
  claimLinkForEvidence,
  getThreadById,
  isPrimarySource,
  isRealEvidence,
  linkedClaimEvidence,
  uniqueBy,
} from "./session_schema.mjs";

const CLAIM_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "there",
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
  "does",
  "do",
  "did",
  "is",
  "are",
  "can",
  "could",
  "would",
  "should",
  "official",
  "primary",
  "source",
  "evidence",
]);

const CLAIM_ENTITY_STOP_WORDS = new Set([
  ...CLAIM_STOP_WORDS,
  "answer",
  "question",
  "concrete",
  "detail",
  "details",
  "pricing",
  "price",
  "cost",
  "billing",
  "plan",
  "plans",
  "endpoint",
  "surface",
  "route",
  "path",
  "mechanism",
  "documented",
  "documentation",
  "docs",
  "guide",
  "guides",
  "support",
  "supports",
  "available",
  "availability",
  "research",
  "deep",
  "official",
  "sources",
  "name",
]);

const QUALITY_ORDER = {
  high: 3,
  medium: 2,
  low: 1,
};

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return "";
  }
}

function claimTokens(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map((token) => token.trim())
    .filter((token) => token && token.length > 2 && !CLAIM_STOP_WORDS.has(token));
}

function sentenceSplit(text) {
  return String(text)
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`+/gu, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/gu, " ")
    .replace(/\s+/gu, " ")
    .split(/(?<=[.!?])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function truncateText(text, maxLength = 220) {
  const value = String(text).trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function bestSentenceForClaim(claimText, excerpt) {
  const sentences = sentenceSplit(excerpt);
  if (sentences.length === 0) {
    return truncateText(String(excerpt).replace(/\s+/gu, " ").trim());
  }

  const tokens = claimTokens(claimText);
  const ranked = sentences
    .map((sentence) => ({
      sentence,
      score: tokens.reduce(
        (count, token) => count + Number(sentence.toLowerCase().includes(token)),
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score);
  return truncateText(ranked[0]?.sentence ?? sentences[0]);
}

function salientClaimTokens(claimText) {
  return claimTokens(claimText).filter((token) => !CLAIM_ENTITY_STOP_WORDS.has(token));
}

function subjectAffinityBonus(item, claimText) {
  const host = domainFromUrl(item.url);
  const title = String(item.title).toLowerCase();
  return salientClaimTokens(claimText).reduce((bonus, token) => {
    if (token.length < 4) {
      return bonus;
    }
    if (host === token || host.startsWith(`${token}.`) || host.includes(`.${token}.`)) {
      return bonus + 18;
    }
    if (title.includes(token)) {
      return bonus + 2;
    }
    return bonus;
  }, 0);
}

function evidenceRank(item, claimText) {
  const text = `${item.title} ${item.url}`.toLowerCase();
  let specificityBonus = 0;
  if (/\bapi\b/.test(String(claimText).toLowerCase())) {
    if (/(developers?\.)|(\/api\/)|(\bapi reference\b)|(\bapi docs\b)/.test(text)) {
      specificityBonus += 8;
    }
    if (/\bhelp center\b/.test(text)) {
      specificityBonus -= 2;
    }
  }
  return (
    (QUALITY_ORDER[item.quality] ?? 0) * 100 +
    (isPrimarySource(item.source_type) ? 10 : 0) +
    specificityBonus +
    subjectAffinityBonus(item, claimText)
  );
}

function sortEvidence(items, claimText) {
  return [...items].sort(
    (left, right) => evidenceRank(right, claimText) - evidenceRank(left, claimText),
  );
}

function summarizeEvidence(claim, item) {
  const link = claimLinkForEvidence(item, claim.claim_id);
  const attribution = link?.attribution ?? item.attribution ?? {};
  return {
    evidence_id: item.evidence_id,
    title: item.title,
    url: item.url,
    quality: item.quality,
    source_type: item.source_type,
    published_at: item.published_at,
    reason: link?.reason ?? "",
    snippet: bestSentenceForClaim(claim.text, item.excerpt),
    anchor_text: attribution.anchor_text ?? "",
    matched_sentence: attribution.matched_sentence ?? "",
    matched_sentence_index: attribution.matched_sentence_index ?? null,
    matched_tokens: Array.isArray(attribution.matched_tokens) ? attribution.matched_tokens : [],
    excerpt_method: attribution.excerpt_method ?? "",
    attribution_confidence:
      typeof attribution.attribution_confidence === "number"
        ? attribution.attribution_confidence
        : null,
  };
}

function findingStatus(claim) {
  if (claim.assessment.resolution_state === "contested" || claim.status === "mixed") {
    return "mixed";
  }
  if (claim.status === "supported") {
    return "supported";
  }
  if (claim.status === "rejected") {
    return "rejected";
  }
  return "insufficient";
}

function listTitles(items) {
  return uniqueBy(items.map((item) => item.title).filter(Boolean), (item) => item);
}

function summaryFromFinding(status, supportEvidence, opposeEvidence, contextEvidence, reason) {
  const support = supportEvidence[0] ?? null;
  const oppose = opposeEvidence[0] ?? null;
  const context = contextEvidence[0] ?? null;

  if (status === "supported" && support) {
    const corroboration = listTitles(supportEvidence.slice(1, 3));
    const corroborationText =
      corroboration.length > 0
        ? ` Corroboration also appears in ${corroboration.join(", ")}.`
        : "";
    return `Supported by ${support.title}. ${support.snippet}${corroborationText}`.trim();
  }

  if (status === "rejected" && oppose) {
    return `Rejected by ${oppose.title}. ${oppose.snippet}`.trim();
  }

  if (status === "mixed") {
    const supportTitle = support?.title ?? "one source";
    const opposeTitle = oppose?.title ?? "another source";
    return `Evidence is mixed: ${supportTitle} supports the point, but ${opposeTitle} does not fully confirm it. The detail remains unresolved.`.trim();
  }

  if (context) {
    return `Evidence remains insufficient. ${context.title} provides context, but the point is not settled yet.`;
  }

  return reason || "Evidence remains insufficient to settle this point.";
}

export function buildFindings(session) {
  const findings = session.claims.map((claim) => {
    const thread = getThreadById(session, claim.thread_id);
    const supportEvidence = sortEvidence(
      linkedClaimEvidence(session, claim.claim_id, ["support"]).filter((item) =>
        isRealEvidence(item),
      ),
      claim.text,
    ).map((item) => summarizeEvidence(claim, item));
    const opposeEvidence = sortEvidence(
      linkedClaimEvidence(session, claim.claim_id, ["oppose"]).filter((item) =>
        isRealEvidence(item),
      ),
      claim.text,
    ).map((item) => summarizeEvidence(claim, item));
    const contextEvidence = sortEvidence(
      linkedClaimEvidence(session, claim.claim_id, ["context"]).filter((item) =>
        isRealEvidence(item),
      ),
      claim.text,
    ).map((item) => summarizeEvidence(claim, item));
    const status = findingStatus(claim);
    const citations = uniqueBy(
      [...supportEvidence, ...opposeEvidence, ...contextEvidence].filter((item) => item.url),
      (item) => item.url,
    )
      .slice(0, 4)
      .map((item) => ({
        title: item.title,
        url: item.url,
      }));

    return {
      finding_id: `finding-${claim.claim_id}`,
      claim_id: claim.claim_id,
      thread_id: claim.thread_id,
      thread_title: thread?.title ?? "Unknown thread",
      claim_text: claim.text,
      status,
      summary: summaryFromFinding(
        status,
        supportEvidence,
        opposeEvidence,
        contextEvidence,
        claim.assessment.reason,
      ),
      confidence_label: claim.assessment.confidence_label,
      confidence_reason: claim.assessment.reason,
      missing_dimensions: claim.assessment.missing_dimensions,
      support_evidence: supportEvidence,
      oppose_evidence: opposeEvidence,
      context_evidence: contextEvidence,
      citations,
      updated_at: claim.assessment.last_evaluated_at ?? null,
    };
  });

  return findings.sort((left, right) => {
    const statusOrder = {
      supported: 0,
      rejected: 1,
      mixed: 2,
      insufficient: 3,
    };
    return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9);
  });
}

export function primaryFinding(session) {
  return buildFindings(session)[0] ?? null;
}

export function summarizeVerificationAnswer(session, finding) {
  const quotedGoal = `"${session.user_query || session.goal}"`;
  if (!finding) {
    return `Not yet. Current evidence does not conclusively answer ${quotedGoal}.`;
  }

  const support = finding.support_evidence[0] ?? null;
  const oppose = finding.oppose_evidence[0] ?? null;
  if (finding.status === "supported") {
    const lead = support ? ` The strongest support comes from ${support.title}.` : "";
    return `Yes. Current evidence supports ${quotedGoal}.${lead}`.trim();
  }
  if (finding.status === "rejected") {
    const lead = oppose ? ` The strongest opposing source is ${oppose.title}.` : "";
    return `No. Current evidence contradicts ${quotedGoal}.${lead}`.trim();
  }
  if (finding.status === "mixed") {
    return `Not conclusively. Sources disagree on ${quotedGoal}, so the answer remains contested.`;
  }
  return `Not yet. Current evidence does not conclusively answer ${quotedGoal}.`;
}
