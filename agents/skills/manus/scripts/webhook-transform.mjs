/* global Buffer, fetch, process */

import { createHash, createVerify } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MANUS_SKILL_HOME = process.env.MANUS_SKILL_HOME || join(homedir(), ".manus-skill");
const PUBKEY_CACHE = join(MANUS_SKILL_HOME, "cache", "manus-webhook-pubkey.pem");
const PUBKEY_TTL_MS = 60 * 60 * 1000;
const TIMESTAMP_TOLERANCE_S = 300;

let cachedPubKey = null;
let cachedPubKeyAt = 0;

function loadPubKey() {
  const now = Date.now();
  if (cachedPubKey && now - cachedPubKeyAt < PUBKEY_TTL_MS) {
    return cachedPubKey;
  }
  if (existsSync(PUBKEY_CACHE)) {
    try {
      cachedPubKey = readFileSync(PUBKEY_CACHE, "utf8");
      cachedPubKeyAt = now;
      return cachedPubKey;
    } catch {
      return null;
    }
  }
  return null;
}

function savePubKey(pem) {
  mkdirSync(dirname(PUBKEY_CACHE), { recursive: true });
  writeFileSync(PUBKEY_CACHE, pem, "utf8");
  cachedPubKey = pem;
  cachedPubKeyAt = Date.now();
}

async function fetchPubKey(apiKey) {
  const resp = await fetch("https://api.manus.ai/v1/webhook/public_key", {
    headers: { API_KEY: apiKey },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const pem = data.public_key;
  if (pem) savePubKey(pem);
  return pem;
}

function verifySignature(ctx, pubKeyPem) {
  const headers = ctx.headers || {};
  const signature = headers["x-webhook-signature"] || headers["X-Webhook-Signature"];
  const timestamp = headers["x-webhook-timestamp"] || headers["X-Webhook-Timestamp"];

  if (!signature || !timestamp) return false;

  const ts = Number.parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TIMESTAMP_TOLERANCE_S) {
    return false;
  }

  const rawBody =
    typeof ctx.rawBody === "string"
      ? ctx.rawBody
      : Buffer.isBuffer(ctx.rawBody)
        ? ctx.rawBody.toString("utf8")
        : null;
  if (!rawBody) return false;

  const url = ctx.url || "";
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const signatureContent = `${timestamp}.${url}.${bodyHash}`;

  const verifier = createVerify("RSA-SHA256");
  verifier.update(signatureContent, "utf8");
  try {
    return verifier.verify(pubKeyPem, signature, "base64");
  } catch {
    return false;
  }
}

export async function transformManus(ctx) {
  const payload = ctx?.payload ?? {};
  const apiKey = process.env.MANUS_API_KEY || "";

  let pubKey = loadPubKey();
  if (!pubKey && apiKey) {
    pubKey = await fetchPubKey(apiKey);
  }

  const signatureVerified = pubKey ? verifySignature(ctx, pubKey) : false;
  const taskDetail = payload.task_detail || {};

  return {
    verified: signatureVerified,
    eventType: payload.event_type || null,
    taskId: taskDetail.task_id || null,
    taskTitle: taskDetail.task_title || null,
    taskUrl: taskDetail.task_url || null,
    stopReason: taskDetail.stop_reason || null,
    message: taskDetail.message || null,
    attachments: taskDetail.attachments || [],
  };
}
