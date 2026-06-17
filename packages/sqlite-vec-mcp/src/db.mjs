// 知识库 JSON 存储：文档 CRUD + 分块向量索引（MVP 替代 sqlite-vec 原生扩展）。
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { embedText } from "./embed.mjs";
import { rankChunks } from "./search.mjs";

export function defaultDbPath(override) {
  if (override) return path.resolve(override);
  if (process.env.OPENWORK_KNOWLEDGE_DB) return path.resolve(process.env.OPENWORK_KNOWLEDGE_DB);
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "openwork", "knowledge.json")
    : path.join(home, ".openwork", "knowledge.json");
}

/** @param {string} text @param {number} [maxLen] */
function chunkText(text, maxLen = 600) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  /** @type {string[]} */
  const chunks = [];
  let buf = "";
  for (const p of paragraphs.length ? paragraphs : [text]) {
    if ((buf + "\n\n" + p).trim().length <= maxLen) {
      buf = buf ? `${buf}\n\n${p}` : p;
      continue;
    }
    if (buf) chunks.push(buf);
    if (p.length <= maxLen) {
      buf = p;
      continue;
    }
    for (let i = 0; i < p.length; i += maxLen) {
      chunks.push(p.slice(i, i + maxLen));
    }
    buf = "";
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [text.slice(0, maxLen)];
}

export class KnowledgeDb {
  /** @param {string} file */
  constructor(file) {
    this.file = file;
    /** @type {{documents:any[]}} */
    this.data = { documents: [] };
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(await readFile(this.file, "utf8"));
      } catch {
        this.data = { documents: [] };
      }
    }
    if (!this.data.documents) this.data.documents = [];
    this.loaded = true;
  }

  async flush() {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
    await rename(tmp, this.file);
  }

  /** @param {{path?:string, content?:string, title?:string}} input */
  async indexDocument(input) {
    await this.load();
    const docPath = String(input.path ?? "untitled.md");
    const content = String(input.content ?? "");
    const title = String(input.title ?? path.basename(docPath, path.extname(docPath)));

    /** @type {any[]} */
    const chunks = [];
    const parts = chunkText(content);
    for (let i = 0; i < parts.length; i++) {
      const text = parts[i];
      chunks.push({
        id: `chunk-${i + 1}`,
        text,
        embedding: await embedText(text),
      });
    }

    const existingIdx = this.data.documents.findIndex((d) => d.path === docPath);
    const row = {
      id: existingIdx >= 0 ? this.data.documents[existingIdx].id : `doc-${randomUUID()}`,
      path: docPath,
      title,
      content,
      chunks,
      indexedAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      this.data.documents[existingIdx] = row;
    } else {
      this.data.documents.push(row);
    }
    await this.flush();
    return { id: row.id, path: row.path, title: row.title, chunks: chunks.length, indexedAt: row.indexedAt };
  }

  /** @param {{query?:string, top_k?:number}} input */
  async semanticSearch(input) {
    await this.load();
    const query = String(input.query ?? "").trim();
    if (!query) return { query, results: [] };
    const topK = Math.max(1, Math.min(20, Number(input.top_k ?? 5) || 5));
    const queryVec = await embedText(query);

    /** @type {Array<{docId:string, path:string, chunkId:string, text:string, embedding:number[]}>} */
    const flat = [];
    for (const doc of this.data.documents) {
      for (const chunk of doc.chunks ?? []) {
        if (!Array.isArray(chunk.embedding)) continue;
        flat.push({
          docId: doc.id,
          path: doc.path,
          chunkId: chunk.id,
          text: chunk.text,
          embedding: chunk.embedding,
        });
      }
    }

    const ranked = rankChunks(queryVec, flat, topK);
    return {
      query,
      results: ranked.map((r) => ({
        docId: r.docId,
        path: r.path,
        chunkId: r.chunkId,
        score: Number(r.score.toFixed(4)),
        excerpt: r.text.slice(0, 400),
      })),
    };
  }

  async listDocuments() {
    await this.load();
    return this.data.documents.map((d) => ({
      id: d.id,
      path: d.path,
      title: d.title,
      chunks: (d.chunks ?? []).length,
      indexedAt: d.indexedAt,
      preview: String(d.content ?? "").slice(0, 120),
    }));
  }
}
