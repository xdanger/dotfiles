import { uniqueBy } from "./session_schema.mjs";

export const DEPTH_PROFILES = {
  quick: {
    searchDepth: "fast",
    searchFanout: 2,
    extractLimit: 3,
    domainCap: 1,
    minScore: 0.55,
    verifyClaimLimit: 1,
    maxGatherRounds: 1,
  },
  standard: {
    searchDepth: "advanced",
    searchFanout: 4,
    extractLimit: 5,
    domainCap: 2,
    minScore: 0.45,
    verifyClaimLimit: 4,
    maxGatherRounds: 2,
  },
  deep: {
    searchDepth: "advanced",
    searchFanout: 6,
    extractLimit: 8,
    domainCap: 2,
    minScore: 0.35,
    verifyClaimLimit: 6,
    maxGatherRounds: 3,
  },
};

export function depthProfile(depth) {
  return DEPTH_PROFILES[depth] ?? DEPTH_PROFILES.standard;
}

export function normalizeGoal(query) {
  return String(query).trim().replace(/\s+/gu, " ").replace(/\?+$/u, "");
}

export function classifyTaskShape(query, domains = []) {
  const text = String(query).toLowerCase().trim();
  const hasUrl = /(https?:\/\/|www\.)/.test(text);
  const wantsArtifact = /\b(pdf|ppt|pptx|csv|spreadsheet|deck|slides)\b/.test(text);
  const wantsConnector = /\b(gmail|notion|calendar|google calendar|connector)\b/.test(text);
  const directQuestionHint =
    /^(is|are|can|could|does|do|did|has|have|what|which|who|when|where|why|how)\b/.test(text) ||
    /\?$/.test(text);
  const specificAnswerHint =
    /\b(endpoint|api surface|route|path|parameter|pricing|price|availability|support|supports|certified|compliant|documented|documentation|docs)\b/.test(
      text,
    ) || /\bif so\b/.test(text);
  const discoveryQuestionHint =
    /^(what|which|who)\b/.test(text) &&
    /\b(top|best|leading|main|vendors|alternatives|options|competitors|tools|products|platforms)\b/.test(
      text,
    );
  const explanatoryQuestionHint =
    /^(what|how|why)\b/.test(text) &&
    !specificAnswerHint &&
    !/\b(evidence|verify|verification|official|prove|proof)\b/.test(text);
  const siteHint =
    hasUrl ||
    (domains.length > 0 &&
      /\b(this docs site|documentation site|policy page|release notes|changelog|audit|coverage)\b/.test(
        text,
      ));
  const verificationHint =
    domains.length > 0 ||
    /\b(evidence|verify|verification|official|certified|soc ?2|prove|proof)\b/.test(text);
  const broadHint = /\b(compare|comparison|landscape|market|trend|competitive|outlook)\b/.test(
    text,
  );

  if (wantsArtifact || wantsConnector) {
    return "async";
  }
  if (siteHint) {
    return "site";
  }
  if (broadHint || discoveryQuestionHint) {
    return "broad";
  }
  if (explanatoryQuestionHint) {
    return "broad";
  }
  if ((directQuestionHint && specificAnswerHint) || verificationHint) {
    return "verification";
  }
  if (directQuestionHint) {
    return "verification";
  }
  return "broad";
}

export function chooseManusProfile(query, depth, taskShape) {
  const text = String(query).toLowerCase();
  if (
    /\b(max|comprehensive|artifact-heavy|deep analysis|full report)\b/.test(text) &&
    depth === "deep"
  ) {
    return "manus-1.6-max";
  }
  if (taskShape === "async" && /\b(pdf|ppt|pptx|csv|spreadsheet|deck|slides)\b/.test(text)) {
    return "manus-1.6";
  }
  return "manus-1.6-lite";
}

export function parseDomainsFromInstruction(instruction) {
  return uniqueBy(
    (String(instruction).match(/\b[a-z0-9.-]+\.[a-z]{2,}\b/giu) || []).map((item) =>
      item.replace(/^www\./u, "").toLowerCase(),
    ),
    (item) => item,
  );
}

export function isTimeSensitiveGoal(goal) {
  return /\b(latest|today|current|recent|2025|2026|2027|this year|this month)\b/i.test(goal);
}

export function shouldUseCrawl(session) {
  return (
    session.task_shape === "site" &&
    /\b(audit|coverage|all mentions|policy review|changelog review)\b/i.test(session.goal)
  );
}

export function braveGogglesFromPolicy(sourcePolicy = {}) {
  const allowed = sourcePolicy?.allow_domains ?? [];
  const preferred = sourcePolicy?.preferred_domains ?? [];
  if (allowed.length > 0) {
    return ["$discard", ...allowed.map((d) => `$site=${d}`)].join("\n");
  }
  if (preferred.length > 0) {
    return preferred.map((d) => `$site=${d},boost=5`).join("\n");
  }
  return undefined;
}

export function scopedSiteDomains(query, domains = []) {
  const discovered = [];
  for (const match of String(query).matchAll(/https?:\/\/([^/\s]+)/gu)) {
    discovered.push(match[1].replace(/^www\./u, "").toLowerCase());
  }
  return uniqueBy([...domains, ...discovered], (item) => item);
}
