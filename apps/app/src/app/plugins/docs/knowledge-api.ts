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

export type KnowledgeScanResult = {
  ok: boolean;
  roots: string[];
  total: number;
  pending: number;
  ingested: number;
  manifest: KnowledgeScanEntry[];
};

export type KnowledgeIngestResult = {
  ok: boolean;
  sourcePath: string;
  archivePath: string;
  summaryPath: string;
  summaryRel: string;
};

export type KnowledgeStateResult = {
  ok: boolean;
  state: KnowledgeState;
  indexPreview: string;
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

export async function knowledgeScan(
  workspacePath: string,
  roots?: string[],
): Promise<KnowledgeScanResult> {
  if (!isTauriRuntime()) {
    return { ok: false, roots: [], total: 0, pending: 0, ingested: 0, manifest: [] };
  }
  return invoke<KnowledgeScanResult>("knowledge_scan", {
    workspacePath,
    roots: roots ?? [],
  });
}

export async function knowledgeIngest(
  workspacePath: string,
  filePath: string,
  title?: string,
): Promise<KnowledgeIngestResult> {
  if (!isTauriRuntime()) {
    throw new Error("ingest requires desktop runtime");
  }
  return invoke<KnowledgeIngestResult>("knowledge_ingest", {
    workspacePath,
    filePath,
    title: title ?? null,
  });
}

export async function knowledgeReadState(workspacePath: string): Promise<KnowledgeStateResult> {
  if (!isTauriRuntime()) {
    return { ok: false, state: emptyState(), indexPreview: "" };
  }
  return invoke<KnowledgeStateResult>("knowledge_read_state", { workspacePath });
}

export async function pickScanRoot(): Promise<string | null> {
  const picked = await pickDirectory({
    title: t("docs.knowledge_pick_scan_root", currentLocale()),
  });
  if (!picked || Array.isArray(picked)) return null;
  return picked;
}

export async function pickIngestFile(): Promise<string | null> {
  const picked = await pickFile({
    title: t("docs.knowledge_pick_ingest_file", currentLocale()),
    filters: [
      {
        name: "Documents",
        extensions: ["md", "markdown", "txt", "pdf", "docx", "html", "htm"],
      },
    ],
  });
  if (!picked || Array.isArray(picked)) return null;
  return picked;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
