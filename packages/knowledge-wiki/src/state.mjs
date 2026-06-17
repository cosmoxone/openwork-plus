import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { knowledgePaths } from "./paths.mjs";

/** @typedef {{ path: string, relativePath: string, size: number, mtimeMs: number, sha256: string, ext: string, status: 'pending'|'ingested'|'skipped' }} ScanEntry */

/** @typedef {{ version: string, updatedAt: string, scanRoots: string[], scanManifest: ScanEntry[], ingestLog: Array<{ at: string, sourcePath: string, summaryPath: string }> }} KnowledgeState */

const STATE_VERSION = "1.0.0";

/** @returns {KnowledgeState} */
export function emptyState() {
  return {
    version: STATE_VERSION,
    updatedAt: new Date().toISOString(),
    scanRoots: [],
    scanManifest: [],
    ingestLog: [],
  };
}

/** @param {string} workspaceRoot */
export async function readState(workspaceRoot) {
  const { stateFile } = knowledgePaths(workspaceRoot);
  if (!existsSync(stateFile)) return emptyState();
  try {
    const raw = await readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw);
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

/** @param {string} workspaceRoot @param {KnowledgeState} state */
export async function writeState(workspaceRoot, state) {
  const { stateFile, root } = knowledgePaths(workspaceRoot);
  await mkdir(root, { recursive: true });
  const next = { ...state, version: STATE_VERSION, updatedAt: new Date().toISOString() };
  await writeFile(stateFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
