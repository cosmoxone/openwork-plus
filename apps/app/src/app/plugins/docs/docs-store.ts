export type DocEntry = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

const STORAGE_KEY = "openwork.knowledge.docs.v1";

function readAll(): DocEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DocEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(docs: DocEntry[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export function listDocs(): DocEntry[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDoc(id: string): DocEntry | null {
  return readAll().find((d) => d.id === id) ?? null;
}

export function saveDoc(input: { id?: string; title: string; content: string }): DocEntry {
  const docs = readAll();
  const now = new Date().toISOString();
  if (input.id) {
    const idx = docs.findIndex((d) => d.id === input.id);
    if (idx >= 0) {
      docs[idx] = { ...docs[idx], title: input.title, content: input.content, updatedAt: now };
      writeAll(docs);
      return docs[idx];
    }
  }
  const row: DocEntry = {
    id: `doc-${Date.now()}`,
    title: input.title.trim() || "未命名文档",
    content: input.content,
    updatedAt: now,
  };
  docs.unshift(row);
  writeAll(docs);
  return row;
}

export function deleteDoc(id: string): boolean {
  const docs = readAll();
  const next = docs.filter((d) => d.id !== id);
  if (next.length === docs.length) return false;
  writeAll(next);
  return true;
}

/** 导出为 MCP index_document 可用的虚拟路径 */
export function docVirtualPath(doc: DocEntry): string {
  const slug = doc.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `docs/${slug || doc.id}.md`;
}
