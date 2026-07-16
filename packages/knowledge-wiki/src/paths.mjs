import path from "node:path";

/** @param {string} workspaceRoot */
export function knowledgeRoot(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot), ".openwork", "knowledge");
}

/** @param {string} workspaceRoot */
export function knowledgePaths(workspaceRoot) {
  const root = knowledgeRoot(workspaceRoot);
  return {
    root,
    agents: path.join(root, "AGENTS.md"),
    raw: path.join(root, "raw"),
    rawInbox: path.join(root, "raw", "inbox"),
    rawArchive: path.join(root, "raw", "archive"),
    wiki: path.join(root, "wiki"),
    wikiIndex: path.join(root, "wiki", "INDEX.md"),
    wikiSummaries: path.join(root, "wiki", "summaries"),
    wikiConcepts: path.join(root, "wiki", "concepts"),
    wikiEntities: path.join(root, "wiki", "entities"),
    wikiSyntheses: path.join(root, "wiki", "syntheses"),
    wikiQa: path.join(root, "wiki", "qa"),
    lintReport: path.join(root, "lint-report.json"),
    logDir: path.join(root, "log"),
    stateFile: path.join(root, "state.json"),
  };
}
