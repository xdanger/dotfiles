import {
  createId,
  createRunRecord,
  finalizeRun,
  getWorkItemById,
  isoNow,
} from "./session_schema.mjs";

function noop() {
  return undefined;
}

function summarizePayload(payload) {
  if (payload === null || payload === undefined) {
    return "No payload";
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (Array.isArray(payload)) {
    return `Array(${payload.length})`;
  }
  if (typeof payload === "object") {
    return JSON.stringify(payload).slice(0, 300);
  }
  return String(payload);
}

export function createRuntime(session, adapters, checkpoint = noop) {
  async function flush(reason) {
    await checkpoint(session, reason);
  }

  function updateWorkItem(workItemId, updates) {
    const workItem = getWorkItemById(session, workItemId);
    if (!workItem) {
      return null;
    }
    Object.assign(workItem, updates, { updated_at: isoNow() });
    return workItem;
  }

  return {
    adapters,
    async checkpoint(reason) {
      await flush(reason);
    },
    async startWorkItem(workItem) {
      workItem.status = "in_progress";
      workItem.attempt_count += 1;
      workItem.last_error = null;
      workItem.updated_at = isoNow();
      await flush(`start-work-item:${workItem.work_key}`);
    },
    async completeWorkItem(workItem, metadata = {}) {
      updateWorkItem(workItem.work_item_id, {
        status: "completed",
        completed_at: isoNow(),
        metadata,
      });
      await flush(`complete-work-item:${workItem.work_key}`);
    },
    async skipWorkItem(workItem, reason) {
      updateWorkItem(workItem.work_item_id, {
        status: "skipped",
        last_error: reason,
        completed_at: isoNow(),
      });
      await flush(`skip-work-item:${workItem.work_key}`);
    },
    async failWorkItem(workItem, error) {
      updateWorkItem(workItem.work_item_id, {
        status: "queued",
        last_error: error instanceof Error ? error.message : String(error),
      });
      await flush(`fail-work-item:${workItem.work_key}`);
    },
    async runProviderOperation(
      {
        type = "provider_call",
        provider,
        tool,
        inputSummary,
        scopeType,
        scopeId,
        workItemId,
        retryPolicy = "safe_retry",
      },
      executor,
    ) {
      const operation = {
        operation_id: createId("op"),
        operation_key: [type, provider, tool, scopeType, scopeId, workItemId ?? "no-work"].join(
          ":",
        ),
        type,
        provider,
        tool,
        scope_type: scopeType,
        scope_id: scopeId,
        work_item_id: workItemId ?? null,
        run_id: null,
        status: "pending",
        retry_policy: retryPolicy,
        input_summary: inputSummary,
        response_summary: null,
        remote_id: null,
        error: null,
        created_at: isoNow(),
        updated_at: isoNow(),
        completed_at: null,
      };

      const run = createRunRecord(provider, tool, inputSummary);
      operation.run_id = run.run_id;
      session.operations.push(operation);
      session.runs.push(run);
      await flush(`before-operation:${operation.operation_key}`);

      try {
        const result = await executor();
        const remoteId = result?.request_id ?? result?.task_id ?? null;
        const responseSummary =
          result?.summary ?? result?.content?.slice?.(0, 180) ?? summarizePayload(result);
        operation.status = "applied";
        operation.remote_id = remoteId;
        operation.response_summary = responseSummary;
        operation.completed_at = isoNow();
        operation.updated_at = isoNow();
        finalizeRun(run, "completed", remoteId, responseSummary, {
          operation_id: operation.operation_id,
          work_item_id: workItemId ?? null,
        });
        await flush(`after-operation:${operation.operation_key}`);
        return { operation, run, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        operation.status = "failed";
        operation.error = message;
        operation.updated_at = isoNow();
        finalizeRun(run, "failed", null, message, {
          operation_id: operation.operation_id,
          work_item_id: workItemId ?? null,
        });
        await flush(`failed-operation:${operation.operation_key}`);
        throw error;
      }
    },
  };
}
