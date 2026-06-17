import path from "node:path";

/** @param {string} workspaceRoot */
export function knowledgeDbPath(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot), "knowledge.db");
}
