import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../utils";
import { pickDirectory, pickFile } from "../../lib/tauri";
import { currentLocale, t } from "../../../i18n";

export type KnowledgeScanEntry = {
  path: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
  sha256: string;
  ext: string;
  status: "pending" | "ingested" | "skipped";
};

export type KnowledgeState = {
  version: string;
  updatedAt: string;
  scanRoots: string[];
  scanManifest: KnowledgeScanEntry[];
  ingestLog: Array<{ at: string; sourcePath: string; summaryPath: string }>;
};

export type KnowledgeWikiPage = {
  relPath: string;
  type: string;
  title: string;
  slug: string;
  sourceFiles: string[];
  wikilinks: string[];
  updatedAt: string;
};

export type KnowledgeLintIssue = {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
  file?: string;
  fixable?: boolean;
};

export type KnowledgeLintReport = {
  ok: boolean;
  generatedAt: string;
  summary: { errors: number; warnings: number; total: number; fixed: number };
  issues: KnowledgeLintIssue[];
};

export type KnowledgeQueryHit = {
  layer: string;
  score: number;
  path: string;
  title: string;
  excerpt: string;
};

export type KnowledgeQueryResult = {
  ok: boolean;
  layer: string;
  query: string;
  results: KnowledgeQueryHit[];
  citations: string[];
  vectorFallback?: boolean;
};

const emptyState = (): KnowledgeState => ({
  version: "1.0.0",
  updatedAt: "",
  scanRoots: [],
  scanManifest: [],
  ingestLog: [],
});

export async function knowledgeInit(workspacePath: string): Promise<{ ok: boolean; root: string }> {
  if (!isTauriRuntime()) return { ok: false, root: "" };
  return invoke("knowledge_init", { workspacePath });
}

export async function knowledgeScan(workspacePath: string, roots?: string[]) {
  if (!isTauriRuntime()) {
    return { ok: false, roots: [], total: 0, pending: 0, ingested: 0, manifest: [] };
  }
  return invoke("knowledge_scan", { workspacePath, roots: roots ?? [] });
}

export async function knowledgeIngest(workspacePath: string, filePath: string, title?: string) {
  if (!isTauriRuntime()) throw new Error("ingest requires desktop runtime");
  return invoke("knowledge_ingest", { workspacePath, filePath, title: title ?? null });
}

export async function knowledgeReadState(workspacePath: string) {
  if (!isTauriRuntime()) {
    return { ok: false, state: emptyState(), indexPreview: "" };
  }
  return invoke<{ ok: boolean; state: KnowledgeState; indexPreview: string }>("knowledge_read_state", {
    workspacePath,
  });
}

export async function knowledgeLint(workspacePath: string, apply = false): Promise<KnowledgeLintReport> {
  if (!isTauriRuntime()) {
    return {
      ok: false,
      generatedAt: "",
      summary: { errors: 0, warnings: 0, total: 0, fixed: 0 },
      issues: [],
    };
  }
  return invoke<KnowledgeLintReport>("knowledge_lint", { workspacePath, apply });
}

export async function knowledgeQuery(workspacePath: string, query: string): Promise<KnowledgeQueryResult> {
  if (!isTauriRuntime()) {
    return { ok: false, layer: "L1", query, results: [], citations: [] };
  }
  return invoke<KnowledgeQueryResult>("knowledge_query", { workspacePath, query });
}

export async function knowledgeSaveQueryPage(
  workspacePath: string,
  input: { title: string; query: string; answer: string },
) {
  if (!isTauriRuntime()) throw new Error("save requires desktop runtime");
  return invoke("knowledge_save_query_page", {
    workspacePath,
    title: input.title,
    query: input.query,
    answer: input.answer,
  });
}

export async function knowledgeListPages(workspacePath: string): Promise<KnowledgeWikiPage[]> {
  if (!isTauriRuntime()) return [];
  const res = await invoke<{ ok: boolean; pages: KnowledgeWikiPage[] }>("knowledge_list_pages", {
    workspacePath,
  });
  return res.pages ?? [];
}

export async function knowledgeReadPage(workspacePath: string, pagePath: string) {
  if (!isTauriRuntime()) return null;
  return invoke<{ ok: boolean; path: string; meta: Record<string, unknown>; body: string }>(
    "knowledge_read_page",
    { workspacePath, pagePath },
  );
}

export async function knowledgeRebuildIndex(workspacePath: string) {
  if (!isTauriRuntime()) return { ok: false };
  return invoke("knowledge_rebuild_index", { workspacePath });
}

export async function pickScanRoot() {
  const picked = await pickDirectory({ title: t("docs.knowledge_pick_scan_root", currentLocale()) });
  if (!picked || Array.isArray(picked)) return null;
  return picked;
}

export async function pickIngestFile() {
  const picked = await pickFile({
    title: t("docs.knowledge_pick_ingest_file", currentLocale()),
    filters: [{ name: "Documents", extensions: ["md", "markdown", "txt", "pdf", "docx", "html", "htm"] }],
  });
  if (!picked || Array.isArray(picked)) return null;
  return picked;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
