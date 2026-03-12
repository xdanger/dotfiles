/* global process */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  approvePendingPlan,
  assertValidFormat,
  createId,
  createSession,
  DEFAULT_DEPTH,
  fail,
  nextQueuedWorkItem,
  queueWorkItem,
  syncSessionStage,
  upsertGap,
  uniqueBy,
} from "./core/session_schema.mjs";
import {
  deleteSession,
  ensureStateDir,
  loadSession,
  saveSession,
} from "./core/session_store.mjs";
import {
  chooseManusProfile,
  normalizeGoal,
  parseDomainsFromInstruction,
} from "./core/router.mjs";
import { createDefaultAdapters } from "./core/providers.mjs";
import {
  applyContinuationInstruction,
  applyResearchPlan,
  mergeResearchBrief,
  planSession,
} from "./core/planner.mjs";
import { gatherEvidence, recordEvidenceStructures } from "./core/retrieval.mjs";
import { claimNeedsVerification, reconcileClaims, verifyClaims } from "./core/verifier.mjs";
import {
  advanceStage,
  recordStageDecision,
  scoreSession,
  updateStopStatus,
} from "./core/scorer.mjs";
import {
  reviewSessionPacket,
  sourcesForSession,
  summarizeReport,
  summarizeSession,
  synthesizeAnswer,
} from "./core/synthesizer.mjs";
import { appendDecision, getClaimById } from "./core/session_schema.mjs";
import { createRuntime } from "./core/runtime.mjs";

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

function parseCsvList(value) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command) {
    fail("Missing command");
  }

  const options = {
    command,
    depth: DEFAULT_DEPTH,
    domains: [],
    format: "md",
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case "--query":
        options.query = rest[++index];
        break;
      case "--depth":
        options.depth = rest[++index];
        break;
      case "--domains":
        options.domains = parseCsvList(rest[++index]);
        break;
      case "--session-id":
        options.sessionId = rest[++index];
        break;
      case "--instruction":
        options.instruction = rest[++index];
        break;
      case "--format":
        options.format = rest[++index];
        break;
      case "--payload-file":
        options.payloadFile = rest[++index];
        break;
      case "--plan-file":
        options.planFile = rest[++index];
        break;
      case "--brief-file":
        options.briefFile = rest[++index];
        break;
      case "--delta-file":
        options.deltaFile = rest[++index];
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function reopenSessionForContinuation(session, instruction = "") {
  if (!instruction.trim()) {
    return;
  }
  if (session.status === "completed" || session.status === "waiting_remote") {
    session.status = "open";
  }
  if (
    session.status === "needs_recovery" &&
    session.handoff?.state === "submission_uncertain"
  ) {
    fail(
      "This session has an uncertain remote handoff. Rejoin or inspect the remote task first.",
    );
  }
  syncSessionStage(session);
  session.stop_status.decision = "continue";
}

async function createAsyncHandoff(session, runtime, workItem) {
  const prompt = session.goal || normalizeGoal(session.user_query);
  session.goal = prompt;
  const profile = chooseManusProfile(prompt, session.constraints.depth, session.task_shape);
  session.handoff = {
    provider: "manus",
    state: "pending_submission",
    task_id: null,
    task_url: null,
    profile,
    reason: "artifact-heavy or connector-backed async task",
    interactive_mode: false,
    locale: "en-US",
    rejoin_contract: {
      schema_version: 1,
      accepted_formats: ["json"],
      guidance:
        "Return URL-backed evidence records with claim_links so the local research ledger can resume verification and synthesis.",
    },
    remote_summary: null,
    rejoined_at: null,
  };
  await runtime.checkpoint("handoff-pending-submission");

  const { result } = await runtime.runProviderOperation(
    {
      type: "handoff",
      provider: "manus",
      tool: "create_task",
      inputSummary: prompt,
      scopeType: "session",
      scopeId: session.session_id,
      workItemId: workItem.work_item_id,
      retryPolicy: "manual_review",
    },
    () =>
      runtime.adapters.runManusTask({
        prompt,
        profile,
        locale: "en-US",
        interactiveMode: false,
        sessionId: session.session_id,
      }),
  );

  session.handoff = {
    ...session.handoff,
    state: "submitted",
    task_id: result.task_id ?? null,
    task_url: result.task_url ?? null,
    remote_summary: result.task_title ?? result.share_url ?? null,
  };
  session.status = "waiting_remote";
  appendDecision(session, "handoff", "Escalated the session to Manus.", session.handoff);
}

function normalizeRemoteClaimLink(session, link) {
  const claimId =
    link.claim_id ??
    session.claims.find((claim) => claim.text === link.claim_text)?.claim_id ??
    null;
  if (!claimId) {
    return null;
  }
  return {
    claim_id: claimId,
    stance:
      link.stance === "support" || link.stance === "oppose" || link.stance === "context"
        ? link.stance
        : "context",
    reason: link.reason ?? "Imported from remote handoff result.",
  };
}

function applyQueuedRejoinPayload(session, workItem) {
  if (!session.handoff) {
    fail("This session does not have an active handoff to rejoin.");
  }

  const payload = session.handoff.pending_rejoin_payload?.payload;
  if (!payload) {
    fail("No pending remote rejoin payload is available.");
  }

  const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
  const normalizedEvidence = evidence
    .map((item) => {
      const claimLinks = (Array.isArray(item.claim_links) ? item.claim_links : [])
        .map((link) => normalizeRemoteClaimLink(session, link))
        .filter(Boolean);
      if (!item.url || claimLinks.length === 0) {
        return null;
      }
      return {
        evidence_id: createId("evidence"),
        run_id: `remote-${session.handoff.task_id ?? "result"}`,
        url: item.url,
        domain: item.domain ?? "",
        title: item.title ?? item.url,
        excerpt: item.excerpt ?? item.summary ?? "",
        source_type: item.source_type ?? "vendor",
        quality: item.quality ?? "medium",
        retrieval_score: item.retrieval_score ?? null,
        published_at: item.published_at ?? null,
        claim_links: claimLinks,
        provenance: {
          query: item.query ?? session.goal,
          strategy: "remote_rejoin",
          operation_id: null,
          work_item_id: workItem.work_item_id,
        },
      };
    })
    .filter(Boolean);

  session.evidence = uniqueBy(
    [...session.evidence, ...normalizedEvidence],
    (item) =>
      `${item.url}|${item.title}|${item.excerpt}|${item.claim_links
        .map((link) => `${link.claim_id}:${link.stance}`)
        .join(",")}`,
  );
  const remoteGapSummaries = Array.isArray(payload.remaining_gaps) ? payload.remaining_gaps : [];
  const remoteTypedGaps = Array.isArray(payload.gaps) ? payload.gaps : [];
  session.stop_status.remaining_gaps =
    remoteGapSummaries.length > 0
      ? [...new Set([...session.stop_status.remaining_gaps, ...remoteGapSummaries])]
      : session.stop_status.remaining_gaps;
  if (remoteGapSummaries.length > 0) {
    for (const gap of remoteGapSummaries) {
      upsertGap(session, {
        summary: gap,
        kind: "remote_gap",
        created_by: "remote",
        recommended_next_action: "Review the remote handoff result and decide the next local step.",
      });
    }
  }
  for (const gap of remoteTypedGaps) {
    upsertGap(session, {
      ...gap,
      kind: gap.kind ?? "remote_gap",
      created_by: gap.created_by ?? "remote",
    });
  }
  session.handoff = {
    ...session.handoff,
    state: "rejoined",
    remote_summary: payload.summary ?? session.handoff.remote_summary,
    rejoined_at: new Date().toISOString(),
    pending_rejoin_payload: null,
  };
  session.status = "open";

  const affectedClaimIds = new Set(
    normalizedEvidence.flatMap((item) => item.claim_links.map((link) => link.claim_id)),
  );
  const evidenceByThreadId = new Map();
  for (const claimId of affectedClaimIds) {
    const claim = getClaimById(session, claimId);
    if (!claim) {
      continue;
    }
    const thread = session.threads.find((item) => item.thread_id === claim.thread_id);
    if (thread) {
      evidenceByThreadId.set(
        thread.thread_id,
        (evidenceByThreadId.get(thread.thread_id) ?? []).concat(
          normalizedEvidence.filter((item) =>
            item.claim_links.some((link) => link.claim_id === claim.claim_id),
          ),
        ),
      );
    }
    claim.verification.stale = false;
    claim.verification.status = claimNeedsVerification(session, claim) ? "queued" : "completed";
    claim.verification.last_checked_at = new Date().toISOString();
    if (claim.verification.status === "queued") {
      queueWorkItem(session, {
        kind: "verify_claim",
        scopeType: "claim",
        scopeId: claim.claim_id,
        reason: "Verify remote evidence imported from an async handoff.",
        dependsOn: [workItem.work_item_id],
      });
    }
  }
  for (const [threadId, evidenceItems] of evidenceByThreadId.entries()) {
    const thread = session.threads.find((item) => item.thread_id === threadId);
    if (thread) {
      recordEvidenceStructures(session, thread, evidenceItems);
    }
  }

  appendDecision(session, "rejoin", "Imported remote handoff results into the local ledger.", {
    evidence_count: normalizedEvidence.length,
    handoff_state: session.handoff.state,
  });
}

export function rejoinRemoteResults(session, payload) {
  if (!session.handoff) {
    fail("This session does not have an active handoff to rejoin.");
  }
  const handoffWorkItem = [...session.work_items]
    .reverse()
    .find((item) => item.kind === "handoff_session");
  session.handoff = {
    ...session.handoff,
    state: "rejoin_pending",
    pending_rejoin_payload: {
      received_at: new Date().toISOString(),
      payload,
    },
  };
  session.status = "open";
  queueWorkItem(session, {
    kind: "rejoin_handoff",
    scopeType: "session",
    scopeId: session.session_id,
    reason: "Import the remote handoff payload into the local ledger.",
    dependsOn: handoffWorkItem ? [handoffWorkItem.work_item_id] : [],
  });
  appendDecision(session, "rejoin_queued", "Queued remote handoff results for import.", {
    handoff_state: session.handoff.state,
  });
  syncSessionStage(session);
}

export async function runOrchestrator(
  session,
  adapters = createDefaultAdapters(),
  maxExecutions = 12,
) {
  const runtime = createRuntime(session, adapters, async (currentSession) => {
    saveSession(currentSession);
  });

  let executions = 0;
  while (executions < maxExecutions) {
    if (
      session.status === "closed" ||
      session.status === "waiting_remote" ||
      session.status === "needs_recovery"
    ) {
      break;
    }

    const workItem = nextQueuedWorkItem(session);
    const pendingPlanVersionId = session.plan_state?.pending_plan_version_id ?? null;
    if (
      session.plan_state?.approval_status === "pending" &&
      (pendingPlanVersionId || !workItem || workItem.kind !== "plan_session")
    ) {
      session.stop_status = {
        decision: "review",
        reason: "The session is waiting for plan approval before queued work can run.",
        open_claim_ids: session.stop_status?.open_claim_ids ?? [],
        remaining_gaps: session.stop_status?.remaining_gaps ?? [],
      };
      syncSessionStage(session);
      break;
    }

    if (!workItem) {
      scoreSession(session);
      updateStopStatus(session);
      advanceStage(session);
      recordStageDecision(session);
      const nextItem = nextQueuedWorkItem(session);
      if (!nextItem) {
        break;
      }
      continue;
    }

    await runtime.startWorkItem(workItem);
    try {
      if (workItem.kind === "plan_session") {
        await planSession(session, runtime, workItem);
      } else if (workItem.kind === "gather_thread") {
        await gatherEvidence(session, runtime, workItem);
      } else if (workItem.kind === "verify_claim") {
        await verifyClaims(session, runtime, workItem);
      } else if (workItem.kind === "rejoin_handoff") {
        applyQueuedRejoinPayload(session, workItem);
      } else if (workItem.kind === "handoff_session") {
        await createAsyncHandoff(session, runtime, workItem);
      } else if (workItem.kind === "synthesize_session") {
        synthesizeAnswer(session);
      }

      reconcileClaims(session);
      scoreSession(session);
      updateStopStatus(session);
      advanceStage(session);
      recordStageDecision(session);
      await runtime.completeWorkItem(workItem, {
        status: session.status,
        stage: session.stage,
      });

      if (session.status === "completed" || session.status === "waiting_remote") {
        break;
      }
    } catch (error) {
      await runtime.failWorkItem(workItem, error);
      throw error;
    }

    executions += 1;
  }

  saveSession(session);
}

async function cmdStart(args, adapters) {
  const session = createSession({
    query: args.query,
    depth: args.depth,
    domains: args.domains,
  });
  if (args.briefFile) {
    const brief = JSON.parse(readFileSync(args.briefFile, "utf8"));
    mergeResearchBrief(session, brief.research_brief ?? brief);
  }
  if (args.planFile) {
    const plan = JSON.parse(readFileSync(args.planFile, "utf8"));
    applyResearchPlan(session, plan, { mode: "replace" });
  }
  await runOrchestrator(session, adapters);
  printJson(summarizeSession(session));
}

async function cmdPrepare(args, adapters) {
  const session = createSession({
    query: args.query,
    depth: args.depth,
    domains: args.domains,
    approvalMode: "pending",
  });
  if (args.briefFile) {
    const brief = JSON.parse(readFileSync(args.briefFile, "utf8"));
    mergeResearchBrief(session, brief.research_brief ?? brief);
  }
  if (args.planFile) {
    const plan = JSON.parse(readFileSync(args.planFile, "utf8"));
    applyResearchPlan(session, plan, { mode: "replace" });
  }
  await runOrchestrator(session, adapters);
  printJson(summarizeSession(session));
}

function cmdStatus(args) {
  const session = loadSession(args.sessionId);
  printJson(summarizeSession(session));
}

function cmdReview(args) {
  const session = loadSession(args.sessionId);
  printJson(reviewSessionPacket(session));
}

async function cmdContinue(args, adapters) {
  const session = loadSession(args.sessionId);
  if (session.status === "closed") {
    fail(`Session is closed: ${session.session_id}`);
  }
  const instruction = args.instruction || "";
  const instructionDomains = parseDomainsFromInstruction(instruction);
  if (instruction) {
    applyContinuationInstruction(session, instruction, instructionDomains);
  }
  session.constraints.domains = [
    ...new Set([...session.constraints.domains, ...instructionDomains]),
  ];
  if (args.planFile) {
    const plan = JSON.parse(readFileSync(args.planFile, "utf8"));
    applyResearchPlan(session, plan, { mode: "append" });
  }
  if (args.deltaFile) {
    const delta = JSON.parse(readFileSync(args.deltaFile, "utf8"));
    applyResearchPlan(
      session,
      delta.delta_plan ? delta : { delta_plan: delta },
      { mode: "append" },
    );
  }
  reopenSessionForContinuation(session, instruction || "agent-authored follow-up plan");
  await runOrchestrator(session, adapters);
  printJson(summarizeSession(session));
}

async function cmdApprove(args, adapters) {
  const session = loadSession(args.sessionId);
  approvePendingPlan(session);
  await runOrchestrator(session, adapters);
  printJson(summarizeSession(session));
}

function cmdReport(args) {
  assertValidFormat(args.format);
  const session = loadSession(args.sessionId);
  if (args.format === "json") {
    printJson(session);
    return;
  }
  process.stdout.write(`${summarizeReport(session)}\n`);
}

function cmdSources(args) {
  const session = loadSession(args.sessionId);
  printJson({
    session_id: session.session_id,
    sources: sourcesForSession(session),
  });
}

async function cmdRejoin(args, adapters) {
  if (!args.payloadFile) {
    fail("--payload-file is required");
  }
  const session = loadSession(args.sessionId);
  const payload = JSON.parse(readFileSync(args.payloadFile, "utf8"));
  rejoinRemoteResults(session, payload);
  await runOrchestrator(session, adapters);
  printJson(summarizeSession(session));
}

function cmdClose(args) {
  const session = loadSession(args.sessionId);
  session.status = "closed";
  session.closed_at = new Date().toISOString();
  appendDecision(session, "close", "The session was explicitly closed.");
  saveSession(session);
  printJson(summarizeSession(session));
}

function cmdDelete(args) {
  deleteSession(args.sessionId);
  printJson({ deleted: true, session_id: args.sessionId });
}

export async function main(argv = process.argv.slice(2), adapters = createDefaultAdapters()) {
  ensureStateDir();
  const args = parseArgs(argv);
  if (
    [
      "status",
      "review",
      "continue",
      "approve",
      "report",
      "sources",
      "rejoin",
      "close",
      "delete",
    ].includes(args.command) &&
    !args.sessionId
  ) {
    fail("--session-id is required");
  }
  if (["start", "prepare"].includes(args.command) && !args.query) {
    fail("--query is required");
  }
  if (args.command === "continue" && !args.instruction && !args.planFile && !args.deltaFile) {
    fail("--instruction, --plan-file, or --delta-file is required");
  }

  switch (args.command) {
    case "start":
      await cmdStart(args, adapters);
      break;
    case "prepare":
      await cmdPrepare(args, adapters);
      break;
    case "status":
      cmdStatus(args);
      break;
    case "review":
      cmdReview(args);
      break;
    case "continue":
      await cmdContinue(args, adapters);
      break;
    case "approve":
      await cmdApprove(args, adapters);
      break;
    case "report":
      cmdReport(args);
      break;
    case "sources":
      cmdSources(args);
      break;
    case "rejoin":
      await cmdRejoin(args, adapters);
      break;
    case "close":
      cmdClose(args);
      break;
    case "delete":
      cmdDelete(args);
      break;
    default:
      fail(`Unknown command: ${args.command}`);
  }
}

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
    process.exit(1);
  }
}
