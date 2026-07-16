/**
 * turn / session 最小内存实现（P0-ARC-5 stub）。
 */
import { randomUUID } from "node:crypto";

/** @typedef {"idle"|"running"|"interrupted"|"completed"} TurnState */

/** @type {Map<string, { id: string, cwd: string, turns: object[], activeTurn?: { id: string, state: TurnState, chunks: string[] } }>} */
const sessions = new Map();

export function sessionStart(params) {
  const id = params?.sessionId ?? randomUUID();
  const cwd = params?.cwd ?? process.cwd();
  sessions.set(id, { id, cwd, turns: [] });
  return { sessionId: id, cwd };
}

export function sessionList() {
  return [...sessions.values()].map((s) => ({
    sessionId: s.id,
    cwd: s.cwd,
    turnCount: s.turns.length,
    active: s.activeTurn?.state === "running",
  }));
}

export function turnStart(sessionId, prompt) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`session not found: ${sessionId}`);
  if (s.activeTurn?.state === "running") {
    throw new Error("turn already active");
  }
  const turnId = randomUUID();
  const text = String(prompt ?? "");
  s.activeTurn = { id: turnId, state: "running", chunks: [text] };
  s.turns.push({ turnId, prompt: text, state: "running" });
  return { turnId, sessionId, stream: [{ type: "stream.partial", text }] };
}

export function turnInterrupt(sessionId) {
  const s = sessions.get(sessionId);
  if (!s?.activeTurn || s.activeTurn.state !== "running") {
    throw new Error("no active turn");
  }
  s.activeTurn.state = "interrupted";
  const last = s.turns[s.turns.length - 1];
  if (last) last.state = "interrupted";
  s.activeTurn = undefined;
  return { sessionId, interrupted: true };
}

export function turnSteer(sessionId, text) {
  const s = sessions.get(sessionId);
  if (!s?.activeTurn || s.activeTurn.state !== "running") {
    throw new Error("session not active");
  }
  s.activeTurn.chunks.push(String(text ?? ""));
  return { sessionId, steered: true, injectedText: text };
}

export function resetSessionsForTest() {
  sessions.clear();
}
