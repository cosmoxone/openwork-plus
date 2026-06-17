/** 个人知识管理 — LLM Wiki（K0：扫描 manifest + ingest + 编辑） */
import { createMemo, createSignal, For, Show, onMount } from "solid-js";

import { useConnections } from "../../connections/provider";
import { isTauriRuntime } from "../../utils";
import { ReactIsland } from "../../../react/island";
import { LexicalDocsEditor } from "./editor.react";
import {
  deleteDoc,
  docVirtualPath,
  getDoc,
  listDocs,
  saveDoc,
  type DocEntry,
} from "./docs-store";
import {
  formatBytes,
  knowledgeIngest,
  knowledgeInit,
  knowledgeReadState,
  knowledgeScan,
  pickIngestFile,
  pickScanRoot,
  type KnowledgeScanEntry,
  type KnowledgeState,
} from "./knowledge-api";
import { currentLocale, t } from "../../../i18n";

type Tab = "edit" | "scan" | "wiki";

export default function DocsPage() {
  const connections = useConnections();
  const workspacePath = () => connections.selectedWorkspaceRoot().trim();

  const [tab, setTab] = createSignal<Tab>("scan");
  const [docs, setDocs] = createSignal<DocEntry[]>([]);
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [title, setTitle] = createSignal("");
  const [content, setContent] = createSignal("");
  const [status, setStatus] = createSignal("");

  const [knowledgeState, setKnowledgeState] = createSignal<KnowledgeState | null>(null);
  const [indexPreview, setIndexPreview] = createSignal("");
  const [knowledgeBusy, setKnowledgeBusy] = createSignal(false);
  const [knowledgeError, setKnowledgeError] = createSignal("");

  const manifest = createMemo(() => knowledgeState()?.scanManifest ?? []);
  const pendingCount = createMemo(() => manifest().filter((e) => e.status === "pending").length);

  const refreshDocs = () => setDocs(listDocs());

  const refreshKnowledge = async () => {
    const ws = workspacePath();
    if (!ws || !isTauriRuntime()) return;
    try {
      const result = await knowledgeReadState(ws);
      if (result.ok) {
        setKnowledgeState(result.state);
        setIndexPreview(result.indexPreview);
      }
    } catch (err) {
      setKnowledgeError(err instanceof Error ? err.message : String(err));
    }
  };

  onMount(() => {
    refreshDocs();
    const first = listDocs()[0];
    if (first) selectDoc(first.id);
    void refreshKnowledge();
  });

  const selectDoc = (id: string) => {
    const doc = getDoc(id);
    if (!doc) return;
    setActiveId(id);
    setTitle(doc.title);
    setContent(doc.content);
    setStatus("");
  };

  const handleNew = () => {
    setActiveId(null);
    setTitle("新文档");
    setContent("");
    setStatus("未保存的新文档");
  };

  const handleSave = () => {
    const saved = saveDoc({
      id: activeId() ?? undefined,
      title: title(),
      content: content(),
    });
    setActiveId(saved.id);
    refreshDocs();
    setStatus(`已保存 · ${docVirtualPath(saved)}`);
  };

  const handleDelete = () => {
    const id = activeId();
    if (!id) return;
    if (!deleteDoc(id)) return;
    refreshDocs();
    const next = listDocs()[0];
    if (next) selectDoc(next.id);
    else handleNew();
    setStatus("已删除");
  };

  const runKnowledge = async (fn: () => Promise<void>) => {
    const ws = workspacePath();
    if (!ws) {
      setKnowledgeError(t("docs.knowledge_no_workspace", currentLocale()));
      return;
    }
    if (!isTauriRuntime()) {
      setKnowledgeError(t("docs.knowledge_desktop_only", currentLocale()));
      return;
    }
    setKnowledgeBusy(true);
    setKnowledgeError("");
    try {
      await knowledgeInit(ws);
      await fn();
      await refreshKnowledge();
    } catch (err) {
      setKnowledgeError(err instanceof Error ? err.message : String(err));
    } finally {
      setKnowledgeBusy(false);
    }
  };

  const handleScanWorkspace = () => {
    void runKnowledge(async () => {
      const ws = workspacePath();
      await knowledgeScan(ws, [ws]);
      setStatus(t("docs.knowledge_scan_done", currentLocale()));
    });
  };

  const handleScanFolder = async () => {
    const folder = await pickScanRoot();
    if (!folder) return;
    void runKnowledge(async () => {
      const ws = workspacePath();
      await knowledgeScan(ws, [folder]);
      setStatus(t("docs.knowledge_scan_done", currentLocale()));
    });
  };

  const handleIngestFile = async () => {
    const file = await pickIngestFile();
    if (!file) return;
    void runKnowledge(async () => {
      const ws = workspacePath();
      const result = await knowledgeIngest(ws, file);
      setStatus(t("docs.knowledge_ingest_done", currentLocale(), { path: result.summaryRel }));
      setTab("wiki");
    });
  };

  const handleIngestManifestEntry = (entry: KnowledgeScanEntry) => {
    void runKnowledge(async () => {
      const ws = workspacePath();
      const result = await knowledgeIngest(ws, entry.path);
      setStatus(t("docs.knowledge_ingest_done", currentLocale(), { path: result.summaryRel }));
    });
  };

  const tabClass = (value: Tab) =>
    `rounded-md px-3 py-1.5 text-sm ${tab() === value ? "bg-dls-hover font-medium text-dls-text" : "text-dls-secondary hover:text-dls-text"}`;

  return (
    <div class="mx-auto flex h-full max-w-6xl flex-col gap-4 p-6">
      <div class="flex flex-wrap items-center gap-2 border-b border-dls-border pb-3">
        <h1 class="mr-4 text-base font-medium text-dls-text">{t("docs.knowledge_title", currentLocale())}</h1>
        <button type="button" class={tabClass("scan")} onClick={() => setTab("scan")}>
          {t("docs.knowledge_tab_scan", currentLocale())}
        </button>
        <button type="button" class={tabClass("wiki")} onClick={() => setTab("wiki")}>
          {t("docs.knowledge_tab_wiki", currentLocale())}
        </button>
        <button type="button" class={tabClass("edit")} onClick={() => setTab("edit")}>
          {t("docs.knowledge_tab_edit", currentLocale())}
        </button>
      </div>

      <Show when={knowledgeError()}>
        <p class="text-sm text-red-500">{knowledgeError()}</p>
      </Show>

      <Show when={tab() === "scan"}>
        <section class="flex flex-col gap-4">
          <p class="text-sm text-dls-secondary">{t("docs.knowledge_scan_hint", currentLocale())}</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-dls-accent px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              disabled={knowledgeBusy()}
              onClick={handleScanWorkspace}
            >
              {t("docs.knowledge_scan_workspace", currentLocale())}
            </button>
            <button
              type="button"
              class="rounded-lg border border-dls-border px-3 py-2 text-sm hover:bg-dls-hover disabled:opacity-50"
              disabled={knowledgeBusy()}
              onClick={() => void handleScanFolder()}
            >
              {t("docs.knowledge_scan_folder", currentLocale())}
            </button>
            <button
              type="button"
              class="rounded-lg border border-dls-border px-3 py-2 text-sm hover:bg-dls-hover disabled:opacity-50"
              disabled={knowledgeBusy()}
              onClick={() => void handleIngestFile()}
            >
              {t("docs.knowledge_ingest_file", currentLocale())}
            </button>
          </div>

          <div class="flex gap-4 text-xs text-dls-secondary">
            <span>{t("docs.knowledge_manifest_total", currentLocale(), { n: manifest().length })}</span>
            <span>{t("docs.knowledge_manifest_pending", currentLocale(), { n: pendingCount() })}</span>
          </div>

          <div class="max-h-[420px] overflow-auto rounded-lg border border-dls-border">
            <table class="w-full text-left text-xs">
              <thead class="sticky top-0 bg-dls-surface">
                <tr class="border-b border-dls-border text-dls-secondary">
                  <th class="px-3 py-2">{t("docs.knowledge_col_path", currentLocale())}</th>
                  <th class="px-3 py-2">{t("docs.knowledge_col_size", currentLocale())}</th>
                  <th class="px-3 py-2">{t("docs.knowledge_col_status", currentLocale())}</th>
                  <th class="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                <For each={manifest()} fallback={<tr><td colSpan={4} class="px-3 py-4 text-dls-secondary">{t("docs.knowledge_manifest_empty", currentLocale())}</td></tr>}>
                  {(entry) => (
                    <tr class="border-b border-dls-border/60 hover:bg-dls-hover/40">
                      <td class="max-w-md truncate px-3 py-2 font-mono" title={entry.path}>{entry.relativePath}</td>
                      <td class="px-3 py-2">{formatBytes(entry.size)}</td>
                      <td class="px-3 py-2">{entry.status}</td>
                      <td class="px-3 py-2">
                        <Show when={entry.status === "pending"}>
                          <button
                            type="button"
                            class="text-dls-accent hover:underline disabled:opacity-50"
                            disabled={knowledgeBusy()}
                            onClick={() => handleIngestManifestEntry(entry)}
                          >
                            ingest
                          </button>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </Show>

      <Show when={tab() === "wiki"}>
        <section class="flex flex-col gap-3">
          <p class="text-sm text-dls-secondary">{t("docs.knowledge_wiki_hint", currentLocale())}</p>
          <pre class="max-h-[480px] overflow-auto rounded-lg border border-dls-border bg-dls-hover/30 p-4 text-xs whitespace-pre-wrap font-mono">
            {indexPreview() || t("docs.knowledge_index_empty", currentLocale())}
          </pre>
          <Show when={(knowledgeState()?.ingestLog.length ?? 0) > 0}>
            <div class="text-xs text-dls-secondary">
              <p class="mb-1 font-medium">{t("docs.knowledge_ingest_log", currentLocale())}</p>
              <ul class="list-inside list-disc">
                <For each={knowledgeState()?.ingestLog.slice().reverse().slice(0, 8) ?? []}>
                  {(row) => (
                    <li>
                      {row.summaryPath} ← {row.sourcePath.split(/[/\\]/).pop()}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
        </section>
      </Show>

      <Show when={tab() === "edit"}>
        <div class="flex min-h-0 flex-1 gap-6">
          <aside class="flex w-56 shrink-0 flex-col gap-3">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-medium text-dls-text">{t("docs.knowledge_local_notes", currentLocale())}</h2>
              <button
                type="button"
                class="rounded-md border border-dls-border px-2 py-1 text-xs text-dls-secondary hover:text-dls-text"
                onClick={handleNew}
              >
                {t("docs.knowledge_new", currentLocale())}
              </button>
            </div>
            <ul class="min-h-0 flex-1 space-y-1 overflow-auto text-sm">
              <For each={docs()} fallback={<li class="text-dls-secondary">{t("docs.knowledge_no_notes", currentLocale())}</li>}>
                {(doc) => (
                  <li>
                    <button
                      type="button"
                      class="w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-dls-hover"
                      classList={{ "bg-dls-hover font-medium": activeId() === doc.id }}
                      onClick={() => selectDoc(doc.id)}
                    >
                      {doc.title}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </aside>

          <section class="flex min-w-0 flex-1 flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <input
                class="min-w-[12rem] flex-1 rounded-lg border border-dls-border bg-dls-surface px-3 py-2 text-sm"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder={t("docs.knowledge_title_placeholder", currentLocale())}
              />
              <button
                type="button"
                class="rounded-lg bg-dls-accent px-3 py-2 text-sm text-white hover:opacity-90"
                onClick={handleSave}
              >
                {t("docs.knowledge_save", currentLocale())}
              </button>
              <Show when={activeId()}>
                <button
                  type="button"
                  class="rounded-lg border border-dls-border px-3 py-2 text-sm text-dls-secondary hover:text-dls-text"
                  onClick={handleDelete}
                >
                  {t("docs.knowledge_delete", currentLocale())}
                </button>
              </Show>
            </div>

            <ReactIsland
              class="min-h-[360px] flex-1"
              component={LexicalDocsEditor}
              props={{
                value: content(),
                placeholder: t("docs.knowledge_editor_placeholder", currentLocale()),
                onChange: (v: string) => setContent(v),
              }}
              instanceKey={activeId() ?? "new"}
            />
          </section>
        </div>
      </Show>

      <Show when={status()}>
        <p class="text-xs text-dls-secondary">{status()}</p>
      </Show>
    </div>
  );
}
