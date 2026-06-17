/** 个人知识管理 — 文档列表 + Lexical Markdown 编辑器（场景 C） */
import { createMemo, createSignal, For, Show, onMount } from "solid-js";

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

export default function DocsPage() {
  const [docs, setDocs] = createSignal<DocEntry[]>([]);
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [title, setTitle] = createSignal("");
  const [content, setContent] = createSignal("");
  const [status, setStatus] = createSignal("");

  const activeDoc = createMemo(() => {
    const id = activeId();
    return id ? getDoc(id) : null;
  });

  const refresh = () => setDocs(listDocs());

  onMount(() => {
    refresh();
    const first = listDocs()[0];
    if (first) selectDoc(first.id);
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
    refresh();
    setStatus(`已保存 · ${docVirtualPath(saved)} · 可用 /semantic-search 或 MCP index_document 索引`);
  };

  const handleDelete = () => {
    const id = activeId();
    if (!id) return;
    if (!deleteDoc(id)) return;
    refresh();
    const next = listDocs()[0];
    if (next) selectDoc(next.id);
    else handleNew();
    setStatus("已删除");
  };

  return (
    <div class="mx-auto flex h-full max-w-6xl gap-6 p-6">
      <aside class="flex w-56 shrink-0 flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium text-dls-text">文档</h2>
          <button
            type="button"
            class="rounded-md border border-dls-border px-2 py-1 text-xs text-dls-secondary hover:text-dls-text"
            onClick={handleNew}
          >
            新建
          </button>
        </div>
        <ul class="min-h-0 flex-1 space-y-1 overflow-auto text-sm">
          <For each={docs()} fallback={<li class="text-dls-secondary">暂无文档</li>}>
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
        <p class="text-xs text-dls-secondary">
          安装 <code class="font-mono">knowledge-mgmt</code> bundle 后，会话内使用{" "}
          <code class="font-mono">/semantic-search</code> 做跨文档检索。
        </p>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <input
            class="min-w-[12rem] flex-1 rounded-lg border border-dls-border bg-dls-surface px-3 py-2 text-sm"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder="文档标题"
          />
          <button
            type="button"
            class="rounded-lg bg-dls-accent px-3 py-2 text-sm text-white hover:opacity-90"
            onClick={handleSave}
          >
            保存
          </button>
          <Show when={activeId()}>
            <button
              type="button"
              class="rounded-lg border border-dls-border px-3 py-2 text-sm text-dls-secondary hover:text-dls-text"
              onClick={handleDelete}
            >
              删除
            </button>
          </Show>
        </div>

        <ReactIsland
          class="min-h-[360px] flex-1"
          component={LexicalDocsEditor}
          props={{
            value: content(),
            placeholder: "在此编写 Markdown 笔记…",
            onChange: (v: string) => setContent(v),
          }}
          instanceKey={activeId() ?? "new"}
        />

        <Show when={status()}>
          <p class="text-xs text-dls-secondary">{status()}</p>
        </Show>
      </section>
    </div>
  );
}
