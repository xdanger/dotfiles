/* global process */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { fail, isoNow, upgradeSession } from "./session_schema.mjs";

const STATE_HOME = process.env.RESEARCH_SKILL_HOME || join(homedir(), ".research-skill");
const SESSIONS_DIR = join(STATE_HOME, "sessions");

export function ensureStateDir() {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function sessionPath(sessionId) {
  return join(SESSIONS_DIR, `${sessionId}.json`);
}

export function loadSession(sessionId) {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) {
    fail(`Session not found: ${sessionId}`);
  }
  return upgradeSession(JSON.parse(readFileSync(path, "utf8")));
}

export function saveSession(session) {
  ensureStateDir();
  session.updated_at = isoNow();
  const targetPath = sessionPath(session.session_id);
  const tempPath = `${targetPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  renameSync(tempPath, targetPath);
}

export function deleteSession(sessionId) {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) {
    fail(`Session not found: ${sessionId}`);
  }
  rmSync(path);
}
