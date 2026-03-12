import { createId, mergeUniqueStrings, uniqueBy } from "./session_schema.mjs";
import { classifyTaskShape, normalizeGoal } from "./router.mjs";

/** @legacy */
function splitSentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** @legacy */
function domainsFromText(text) {
  return mergeUniqueStrings(
    [],
    (String(text).match(/\b[a-z0-9.-]+\.[a-z]{2,}\b/giu) || []).map((item) =>
      item.replace(/^www\./u, "").toLowerCase(),
    ),
  );
}

/** @legacy */
function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .map((item) => item.trim())
      .filter((item) => item.length > 2),
  );
}

/** @legacy */
function overlapScore(leftText, rightText) {
  const left = tokenize(leftText);
  const right = tokenize(rightText);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let matches = 0;
  for (const token of left) {
    if (right.has(token)) {
      matches += 1;
    }
  }
  return matches;
}

/** @legacy */
export function defaultComparisonAxes(taskShape) {
  if (taskShape === "broad") {
    return ["pricing", "deployment", "security", "adoption", "workflow"];
  }
  if (taskShape === "site") {
    return ["coverage", "policy", "documentation", "limitations"];
  }
  return ["claim", "official evidence", "caveats"];
}

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

function attachClaimsToThreads(threads, claims) {
  const claimsByThread = new Map(threads.map((thread) => [thread.thread_id, []]));
  for (const claim of claims) {
    claimsByThread.get(claim.thread_id)?.push(claim.claim_id);
  }
  return threads.map((thread) => ({
    ...thread,
    claim_ids: claimsByThread.get(thread.thread_id) ?? [],
    execution: {
      ...thread.execution,
      open_claim_ids: claimsByThread.get(thread.thread_id) ?? [],
    },
  }));
}

function capitalizeSentence(text) {
  const value = String(text).trim();
  if (!value) {
    return value;
  }
  return value[0].toUpperCase() + value.slice(1);
}

function ensureSentence(text) {
  const value = String(text)
    .trim()
    .replace(/[.?!]+$/u, "");
  if (!value) {
    return value;
  }
  return `${capitalizeSentence(value)}.`;
}

function stripVerificationFollowUps(goal) {
  return String(goal)
    .replace(/,?\s+and\s+if\s+so\b.*$/iu, "")
    .replace(/,?\s+if\s+so\b.*$/iu, "")
    .replace(/,?\s+and\s+(what|which|how|where|when)\b.*$/iu, "")
    .replace(/,?\s+(what|which)\s+is\s+the\s+evidence\b.*$/iu, "")
    .trim();
}

function conjugateThirdPerson(verb) {
  const lower = String(verb).toLowerCase();
  if (lower === "have") {
    return "has";
  }
  if (/(s|sh|ch|x|z|o)$/u.test(lower)) {
    return `${lower}es`;
  }
  if (/[^aeiou]y$/u.test(lower)) {
    return `${lower.slice(0, -1)}ies`;
  }
  return `${lower}s`;
}

function statementFromQuestion(goal) {
  const clean = stripVerificationFollowUps(goal).replace(/\?+$/u, "").trim();
  if (!clean) {
    return ensureSentence(goal);
  }

  const doesMatch = clean.match(/^does\s+(.+?)\s+([a-z][a-z-]+)\s+(.+)$/iu);
  if (doesMatch) {
    const [, subject, verb, rest] = doesMatch;
    return ensureSentence(`${subject} ${conjugateThirdPerson(verb)} ${rest}`);
  }

  const modalMatch = clean.match(
    /^(can|could|should|would|will|did|do|has|have)\s+(.+?)\s+([a-z][a-z-]+)\s+(.+)$/iu,
  );
  if (modalMatch) {
    const [, modal, subject, verb, rest] = modalMatch;
    return ensureSentence(`${subject} ${modal.toLowerCase()} ${verb} ${rest}`);
  }

  const beMatch = clean.match(
    /^(is|are|was|were)\s+(.+?)\s+((?:soc ?2|iso ?27001|gdpr|hipaa|fedramp|available|supported|certified|deprecated|documented|enabled|included|listed|public|private|required|free|ga|beta)\b.+)$/iu,
  );
  if (beMatch) {
    const [, auxiliary, subject, predicate] = beMatch;
    return ensureSentence(`${subject} ${auxiliary.toLowerCase()} ${predicate}`);
  }

  return ensureSentence(clean);
}

function subjectFromStatement(statement) {
  const clean = String(statement)
    .replace(/[.?!]+$/u, "")
    .trim();
  const match = clean.match(
    /^(.+?)\s+(?:is|are|was|were|has|have|supports?|exposes?|offers?|documents?|allows?|includes?|lists?|uses?)\b/iu,
  );
  return match?.[1]?.trim() ?? "";
}

function endpointSubqueries(goal) {
  const directStatement = statementFromQuestion(goal);
  const subject = subjectFromStatement(directStatement);
  const subjectDomainHint =
    /^[a-z0-9-]+$/iu.test(subject) && !/\s/u.test(subject)
      ? `site:${subject.toLowerCase().replace(/[^a-z0-9-]+/giu, "")}.com`
      : "";
  const focus = [
    subject,
    /\bdeep research\b/iu.test(goal) ? "deep research" : "",
    /\bapi\b/iu.test(goal) ? "API" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!focus) {
    return [`${goal} endpoint`, `${goal} official docs`, `${goal} API reference`];
  }
  return uniqueBy(
    [
      `${focus} Responses API`,
      `${focus} endpoint`,
      `${focus} API reference`,
      subjectDomainHint ? `${focus} endpoint ${subjectDomainHint}` : "",
      `${focus} official docs`,
    ].filter(Boolean),
    (item) => item.toLowerCase(),
  );
}

function detailThreadForGoal(goal, directClaim) {
  const normalizedDirectClaim = String(directClaim).replace(/[.?!]+$/u, "");
  if (/\b(endpoint|api surface|route|path|responses api|response api)\b/iu.test(goal)) {
    return {
      title: "Concrete API surface",
      intent:
        "identify the exact endpoint, API surface, or mechanism named in official sources",
      subqueries: endpointSubqueries(goal),
      claim: normalizedDirectClaim
        ? `${normalizedDirectClaim} through a documented endpoint or API surface.`
        : `Official sources name the endpoint, API surface, or mechanism needed to answer: ${goal}.`,
      claimType: "capability",
    };
  }

  if (/\b(price|pricing|cost|billing|plan)\b/iu.test(goal)) {
    return {
      title: "Pricing details",
      intent:
        "identify the concrete pricing, packaging, or billing details that answer the question",
      subqueries: [`${goal} pricing`, `${goal} official pricing`],
      claim: `Official pricing or packaging details directly answer: ${goal}.`,
      claimType: "comparison",
    };
  }

  return {
    title: "Primary documentation",
    intent:
      "find the official documentation or policy page that most directly answers the question",
    subqueries: [`${goal} official documentation`, `${goal} docs`],
    claim: `A primary or official source directly answers: ${goal}.`,
    claimType: "documentation",
  };
}

/** @fallback */
function buildBroadPlan(goal) {
  const landscapeThread = createThread(
    "Product landscape",
    "identify the main products or categories relevant to the goal",
    [`${goal} leading products`, `${goal} market landscape`],
  );
  const pricingThread = createThread(
    "Pricing and packaging",
    "determine pricing visibility, packaging differences, and sales-gated plans",
    [`${goal} pricing`, `${goal} pricing packaging`],
  );
  const deploymentThread = createThread(
    "Deployment and security posture",
    "compare deployment, security, hosting, and compliance positioning",
    [`${goal} deployment security`, `${goal} hosting compliance`],
  );
  const adoptionThread = createThread(
    "Audience and adoption",
    "compare target users, enterprise proof points, and workflow fit",
    [`${goal} enterprise adoption`, `${goal} target users workflow`],
  );

  const claims = [
    createClaim(
      landscapeThread.thread_id,
      `The leading options in ${goal} differ in scope, positioning, or product category.`,
      "positioning",
      "high",
    ),
    createClaim(
      pricingThread.thread_id,
      `The leading options in ${goal} differ in pricing visibility, packaging, or sales-gated plans.`,
      "comparison",
      "high",
    ),
    createClaim(
      deploymentThread.thread_id,
      `The leading options in ${goal} differ in deployment model, security posture, or data handling.`,
      "capability",
      "high",
    ),
    createClaim(
      adoptionThread.thread_id,
      `The leading options in ${goal} target different audiences or show different levels of enterprise adoption.`,
      "positioning",
      "high",
    ),
  ];

  return {
    threads: attachClaimsToThreads(
      [landscapeThread, pricingThread, deploymentThread, adoptionThread],
      claims,
    ),
    claims,
    remainingGaps: [
      "Which high-priority claims still lack primary-source evidence?",
      "Which important comparison dimensions remain under-covered?",
    ],
  };
}

/** @fallback */
function buildVerificationPlan(goal) {
  const directClaim = statementFromQuestion(goal);
  const detailThreadPlan = detailThreadForGoal(goal, directClaim);
  const directThread = createThread(
    "Direct answer",
    "answer the user's question directly from primary or official evidence",
    [`${goal} official evidence`, `${goal} primary source`],
  );
  const detailThread = createThread(
    detailThreadPlan.title,
    detailThreadPlan.intent,
    detailThreadPlan.subqueries,
  );
  const caveatThread = createThread(
    "Caveats and contradictory evidence",
    "look for exceptions, caveats, dates, or contradictory statements",
    [`${goal} caveats`, `${goal} contradictory evidence`],
  );

  const claims = [
    createClaim(directThread.thread_id, directClaim, "fact", "high"),
    createClaim(
      detailThread.thread_id,
      detailThreadPlan.claim,
      detailThreadPlan.claimType,
      "high",
    ),
    createClaim(
      caveatThread.thread_id,
      `Important caveats, exclusions, or contradictory evidence exist for: ${goal}.`,
      "policy",
      "medium",
    ),
  ];

  return {
    threads: attachClaimsToThreads([directThread, detailThread, caveatThread], claims),
    claims,
    remainingGaps: [
      "Which official source most directly answers the user's question?",
      "Which concrete detail would a user need to act on the answer?",
      "Does any primary source contradict, qualify, or narrow the answer?",
      "Is the evidence current enough for the user's question?",
    ],
  };
}

/** @fallback */
function buildSitePlan(goal) {
  const docsThread = createThread(
    "Relevant documentation",
    "identify the pages that directly document the requested topic",
    [goal],
  );
  const policyThread = createThread(
    "Policy or explicit statements",
    "capture direct statements or policy language related to the goal",
    [goal],
  );
  const limitationThread = createThread(
    "Gaps or omissions",
    "identify what the site does not make explicit",
    [goal],
  );

  const claims = [
    createClaim(
      docsThread.thread_id,
      `The target site documents the requested topic for: ${goal}.`,
      "capability",
      "high",
    ),
    createClaim(
      policyThread.thread_id,
      `The target site includes explicit statements or policy language relevant to: ${goal}.`,
      "policy",
      "high",
    ),
    createClaim(
      limitationThread.thread_id,
      `The target site leaves important details unspecified or scattered for: ${goal}.`,
      "fact",
      "medium",
    ),
  ];

  return {
    threads: attachClaimsToThreads([docsThread, policyThread, limitationThread], claims),
    claims,
    remainingGaps: [
      "Which paths on the site contain the strongest evidence?",
      "What important details are still not explicit on the site?",
    ],
  };
}

/** @fallback */
function buildAsyncPlan(goal) {
  const asyncThread = createThread(
    "Async handoff",
    "prepare a remote handoff for artifact-heavy or connector-heavy work",
    [goal],
  );
  const claims = [
    createClaim(
      asyncThread.thread_id,
      `This task needs async execution or artifact generation for: ${goal}.`,
      "capability",
      "high",
    ),
  ];
  return {
    threads: attachClaimsToThreads([asyncThread], claims),
    claims,
    remainingGaps: ["What follow-up or deliverable format will the remote worker need?"],
  };
}

/** @fallback */
function planningArtifactsFromResearch(result, taskShape) {
  const content = String(result.content ?? result.answer ?? "").trim();
  if (!content) {
    return {
      hypotheses: [],
      domain_hints: [],
      comparison_axes: defaultComparisonAxes(taskShape),
    };
  }
  const sentences = splitSentences(content);
  return {
    hypotheses: sentences.slice(0, 4),
    domain_hints: domainsFromText(content),
    comparison_axes: defaultComparisonAxes(taskShape),
  };
}

/** @legacy */
function inferContinuationMode(instruction) {
  const text = String(instruction).toLowerCase();
  if (/\b(branch|separate|new angle|new thread)\b/.test(text)) {
    return "branch";
  }
  if (/\b(verify|re-verify|double-check|confirm|validate|prove)\b/.test(text)) {
    return "verify";
  }
  return "deepen";
}

/** @legacy */
function matchingThreads(session, instruction) {
  return session.threads
    .map((thread) => ({
      thread,
      score: overlapScore(instruction, `${thread.title} ${thread.intent} ${thread.notes}`),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.thread);
}

/** @legacy */
function matchingClaims(session, instruction) {
  return session.claims
    .map((claim) => ({
      claim,
      score: overlapScore(instruction, claim.text),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.claim);
}

function createContinuationThreadSpec(instruction, mode = "deepen") {
  const title = String(instruction).slice(0, 72);
  return {
    title: `Follow-up: ${title}`,
    intent: `address the continuation instruction: ${instruction}`,
    subqueries: [instruction],
    notes: "Created from a continuation instruction.",
    claims: [
      {
        text:
          mode === "verify"
            ? instruction
            : `There is URL-backed evidence that refines the session for: ${instruction}.`,
        claim_type: "follow_up",
        priority: "high",
      },
    ],
  };
}

/** @fallback — wraps all heuristic planning into a single entry point */
export function buildFallbackPlan(session) {
  const goal = session.goal || normalizeGoal(session.user_query);
  if (!session.task_shape) {
    session.task_shape = classifyTaskShape(session.user_query, session.constraints.domains);
  }

  const plan =
    session.task_shape === "broad"
      ? buildBroadPlan(goal)
      : session.task_shape === "site"
        ? buildSitePlan(goal)
        : session.task_shape === "async"
          ? buildAsyncPlan(goal)
          : buildVerificationPlan(goal);

  plan.source = "runtime_fallback";
  plan.authority = "low";
  return plan;
}

/** @fallback — extract planning artifacts from a Tavily Research result */
export { planningArtifactsFromResearch };

/** @fallback — extract planning artifacts from a Gemini Grounding result */
export function planningArtifactsFromGeminiGrounding(result) {
  const content = String(result?.content ?? "").trim();
  if (!content) {
    return { hypotheses: [], domain_hints: [] };
  }

  const hypotheses = [];
  const sentences = splitSentences(content).filter((s) => s.length > 20 && s.length < 300);
  hypotheses.push(...sentences.slice(0, 5));

  for (const query of result.web_search_queries ?? []) {
    if (query && !hypotheses.some((h) => h.toLowerCase().includes(query.toLowerCase()))) {
      hypotheses.push(query);
    }
  }

  const chunkTitles = (result.grounding_chunks ?? [])
    .map((chunk) => chunk.title)
    .filter(Boolean)
    .join(" ");
  const domainHints = domainsFromText(chunkTitles);

  return {
    hypotheses: hypotheses.slice(0, 8),
    domain_hints: domainHints.slice(0, 6),
  };
}

/** @legacy — infer continuation intent from prose instruction */
export function inferContinuationFromProse(session, instruction, domains = []) {
  const trimmed = String(instruction).trim();
  if (!trimmed) {
    return null;
  }
  const mode = inferContinuationMode(trimmed);
  const operations = [
    {
      type: "add_gap",
      gap: {
        summary: trimmed,
        status: "tracking",
        kind: "continuation_instruction",
        created_by: "legacy_inference",
      },
      reason: "Continuation kept this angle explicitly open in the ledger.",
    },
  ];
  if (domains.length > 0) {
    operations.push({
      type: "merge_domains",
      domains,
      reason: "Continuation introduced or reinforced domain constraints.",
    });
  }

  if (mode === "verify") {
    const matched = matchingClaims(session, trimmed).slice(0, 3);
    if (matched.length > 0) {
      for (const claim of matched) {
        operations.push({
          type: "mark_claim_stale",
          claim_id: claim.claim_id,
          reason: `Continuation requested verification for claim: ${claim.text}`,
        });
      }
    } else {
      operations.push({
        type: "add_thread",
        thread: createContinuationThreadSpec(trimmed, mode),
        reason: "Continuation created a new focused verification thread.",
      });
    }
  } else {
    const matched = mode === "branch" ? [] : matchingThreads(session, trimmed).slice(0, 2);
    if (matched.length > 0) {
      for (const thread of matched) {
        operations.push({
          type: "requeue_thread",
          thread_id: thread.thread_id,
          reason: `Continuation requested deeper gathering for thread: ${thread.title}`,
        });
      }
    } else {
      operations.push({
        type: "add_thread",
        thread: createContinuationThreadSpec(trimmed, mode),
        reason:
          mode === "branch"
            ? "Continuation branched into a new thread."
            : "Continuation created a new follow-up thread.",
      });
    }
  }

  return { instruction: trimmed, mode, domains, operations };
}
