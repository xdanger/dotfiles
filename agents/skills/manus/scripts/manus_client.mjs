/* global fetch, process, URL */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const BASE_URL = "https://api.manus.ai";
const STATE_HOME = process.env.MANUS_SKILL_HOME || join(homedir(), ".manus-skill");
const REGISTRY_PATH = join(STATE_HOME, "cache", "tasks.json");
const DEFAULT_MEDIA_DIR = join(STATE_HOME, "downloads");

function fail(message, code = 1) {
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(code);
}

function getApiKey() {
  const key = process.env.MANUS_API_KEY || "";
  if (!key) {
    fail("MANUS_API_KEY not set");
  }
  return key;
}

function apiHeaders(extra = {}) {
  return {
    API_KEY: getApiKey(),
    "Content-Type": "application/json",
    ...extra,
  };
}

function monthDir() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dir = join(DEFAULT_MEDIA_DIR, `${y}${m}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveRegistry(data) {
  mkdirSync(join(STATE_HOME, "cache"), { recursive: true });
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function registerTask(taskId, label, promptSummary) {
  const registry = loadRegistry();
  registry[taskId] = {
    label: label || "",
    created_at: new Date().toISOString(),
    prompt_summary: promptSummary.slice(0, 200),
    status: "created",
  };
  saveRegistry(registry);
}

function updateTaskStatus(taskId, status) {
  const registry = loadRegistry();
  if (!registry[taskId]) {
    return;
  }
  registry[taskId].status = status;
  saveRegistry(registry);
}

function safeOutputPath(downloadDir, filename) {
  let cleaned = basename(filename || "attachment");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    cleaned = "attachment";
  }

  const dotIndex = cleaned.lastIndexOf(".");
  const stem = dotIndex > 0 ? cleaned.slice(0, dotIndex) : cleaned;
  const suffix = dotIndex > 0 ? cleaned.slice(dotIndex) : "";

  let candidate = join(downloadDir, cleaned);
  let index = 1;
  while (existsSync(candidate)) {
    candidate = join(downloadDir, `${stem}-${index}${suffix}`);
    index += 1;
  }
  return candidate;
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text();
    fail(`HTTP ${response.status} for ${url}: ${body}`);
  }
  return response.json();
}

async function uploadFile(filepath) {
  if (!existsSync(filepath)) {
    fail(`File not found: ${filepath}`);
  }

  const fileInfo = await requestJson(`${BASE_URL}/v1/files`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ filename: basename(filepath) }),
  });

  const fileBuffer = readFileSync(filepath);
  const putResponse = await fetch(fileInfo.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fileBuffer.byteLength),
    },
    body: fileBuffer,
  });
  if (!putResponse.ok) {
    const body = await putResponse.text();
    fail(`Upload failed for ${filepath}: HTTP ${putResponse.status}: ${body}`);
  }

  return {
    filename: basename(filepath),
    file_id: fileInfo.id,
  };
}
async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    const body = await response.text();
    fail(`Download failed for ${url}: HTTP ${response.status}: ${body}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  const stream = createWriteStream(destination);
  await finished(Readable.fromWeb(response.body).pipe(stream));
}

function printJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function printMedia(path) {
  process.stderr.write(`MEDIA:${path}\n`);
}

export function collectAssistantOutputs(data) {
  const texts = [];
  const files = [];

  for (const entry of data.output || []) {
    if (entry.role !== "assistant") {
      continue;
    }

    for (const content of entry.content || []) {
      if (content.text) {
        texts.push(content.text);
      }
      if (content.fileUrl) {
        files.push({
          url: content.fileUrl,
          name: content.fileName || "attachment",
        });
      }
    }
  }

  return { texts, files };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command) {
    fail("Missing command");
  }

  const options = {
    command,
    attachment: [],
    connector: [],
    convert: false,
    interactive: false,
    mode: "agent",
    profile: "manus-1.6",
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    switch (arg) {
      case "--prompt":
        options.prompt = rest[++i];
        break;
      case "--mode":
        options.mode = rest[++i];
        break;
      case "--profile":
        options.profile = rest[++i];
        break;
      case "--label":
        options.label = rest[++i];
        break;
      case "--attachment":
        options.attachment.push(rest[++i]);
        break;
      case "--connector":
        options.connector.push(rest[++i]);
        break;
      case "--locale":
        options.locale = rest[++i];
        break;
      case "--task-id":
        options.taskId = rest[++i];
        break;
      case "--download-dir":
        options.downloadDir = rest[++i];
        break;
      case "--limit":
        options.limit = Number.parseInt(rest[++i], 10);
        break;
      case "--status":
        options.status = rest[++i];
        break;
      case "--convert":
        options.convert = true;
        break;
      case "--interactive":
        options.interactive = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function cmdCreate(args) {
  if (!args.prompt) {
    fail("--prompt is required");
  }

  const payload = {
    prompt: args.prompt,
    agentProfile: args.profile,
  };
  if (args.mode) payload.taskMode = args.mode;
  if (args.locale) payload.locale = args.locale;
  if (args.taskId) payload.taskId = args.taskId;
  if (args.interactive) payload.interactiveMode = true;
  if (args.attachment.length > 0) {
    payload.attachments = [];
    for (const filepath of args.attachment) {
      payload.attachments.push(await uploadFile(filepath));
    }
  }
  if (args.connector.length > 0) {
    payload.connectors = args.connector;
  }

  const result = await requestJson(`${BASE_URL}/v1/tasks`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(payload),
  });

  if (result.task_id) {
    registerTask(result.task_id, args.label, args.prompt);
  }
  printJson(result);
}

async function getTask(taskId, convert) {
  if (!taskId) {
    fail("--task-id is required");
  }
  const url = new URL(`${BASE_URL}/v1/tasks/${taskId}`);
  if (convert) {
    url.searchParams.set("convert", "true");
  }
  return requestJson(url, {
    method: "GET",
    headers: apiHeaders(),
  });
}

async function cmdStatus(args) {
  const data = await getTask(args.taskId, args.convert);
  const status = data.status || "unknown";
  updateTaskStatus(args.taskId, status);
  const summary = {
    task_id: args.taskId,
    status,
    created_at: data.created_at,
    updated_at: data.updated_at,
    credit_usage: data.credit_usage,
  };
  if (data.error) {
    summary.error = data.error;
  }
  printJson(summary);
}

async function cmdResult(args) {
  const data = await getTask(args.taskId, args.convert);
  const status = data.status || "unknown";
  updateTaskStatus(args.taskId, status);

  const downloadDir = args.downloadDir || monthDir();
  mkdirSync(downloadDir, { recursive: true });

  const downloadedFiles = [];
  const { texts, files } = collectAssistantOutputs(data);
  for (const file of files) {
    const destination = safeOutputPath(downloadDir, file.name);
    await downloadFile(file.url, destination);
    downloadedFiles.push(destination);
  }

  printJson({
    task_id: args.taskId,
    status,
    text: texts.length > 0 ? texts.join("\n\n") : null,
    files: downloadedFiles,
    credit_usage: data.credit_usage,
  });

  for (const file of downloadedFiles) {
    printMedia(file);
  }
}

async function cmdList(args) {
  const url = new URL(`${BASE_URL}/v1/tasks`);
  url.searchParams.set("limit", String(args.limit || 10));
  url.searchParams.set("order", "desc");
  if (args.status) {
    url.searchParams.append("status", args.status);
  }

  const data = await requestJson(url, {
    method: "GET",
    headers: apiHeaders(),
  });

  const tasks = (data.data || []).map((task) => ({
    task_id: task.id,
    status: task.status,
    created_at: task.created_at,
    credit_usage: task.credit_usage,
  }));

  printJson({
    tasks,
    has_more: Boolean(data.has_more),
  });
}

async function cmdDelete(args) {
  if (!args.taskId) {
    fail("--task-id is required");
  }
  const data = await requestJson(`${BASE_URL}/v1/tasks/${args.taskId}`, {
    method: "DELETE",
    headers: { API_KEY: getApiKey() },
  });
  updateTaskStatus(args.taskId, "deleted");
  printJson(data);
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "create":
      await cmdCreate(args);
      break;
    case "status":
      await cmdStatus(args);
      break;
    case "result":
      await cmdResult(args);
      break;
    case "list":
      await cmdList(args);
      break;
    case "delete":
    case "cancel":
      await cmdDelete(args);
      break;
    default:
      fail(`Unknown command: ${args.command}`);
  }
}

if (import.meta.main) {
  await main();
}
