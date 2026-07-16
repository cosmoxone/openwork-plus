import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { knowledgePaths } from "./paths.mjs";
import { listWikiPages, readWikiPageContent } from "./pages.mjs";
import { openKnowledgeDb } from "./index-sync.mjs";

/** @param {string} text @param {string} query */
function scoreText(text, query) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of q.split(/\s+/).filter(Boolean)) {
    if (lower.includes(term)) score += 2;
  }
  if (lower.includes(q)) score += 5;
  return score;
}

/**
 * @param {string} workspaceRoot
 * @param {string} query
 * @param {{ topK?: number, minWikiHits?: number }} [options]
 */
export async function hybridQuery(workspaceRoot, query, options = {}) {
  const topK = options.topK ?? 5;
  const minWikiHits = options.minWikiHits ?? 2;
  const q = query.trim();
  if (!q) return { ok: true, layer: "L1", query: q, results: [], citations: [] };

  /** @type {Array<{ layer: string, score: number, path: string, title: string, excerpt: string }>} */
  const results = [];

  const paths = knowledgePaths(workspaceRoot);
  if (existsSync(paths.wikiIndex)) {
    const index = await readFile(paths.wikiIndex, "utf8");
    for (const line of index.split("\n")) {
      const score = scoreText(line, q);
      if (score <= 0) continue;
      results.push({
        layer: "L1",
        score,
        path: "wiki/INDEX.md",
        title: "INDEX",
        excerpt: line.trim(),
      });
    }
  }

  const pages = await listWikiPages(workspaceRoot);
  for (const page of pages) {
    const content = await readWikiPageContent(workspaceRoot, page.relPath);
    if (!content) continue;
    const score = scoreText(`${page.title}\n${content.body}`, q);
    if (score <= 0) continue;
    results.push({
      layer: "L2",
      score: score + 1,
      path: `wiki/${page.relPath}.md`,
      title: page.title,
      excerpt: content.body.slice(0, 320).trim(),
    });
  }

  results.sort((a, b) => b.score - a.score);
  const wikiHits = results.slice(0, topK);

  if (wikiHits.length >= minWikiHits) {
    return {
      ok: true,
      layer: wikiHits[0]?.layer ?? "L2",
      query: q,
      results: wikiHits.slice(0, topK),
      citations: wikiHits.slice(0, topK).map((r) => `[[${r.path.replace(/^wiki\//, "").replace(/\.md$/, "")}]]`),
    };
  }

  const db = openKnowledgeDb(workspaceRoot);
  const vec = await db.semanticSearch({ query: q, top_k: topK });
  /** @type {typeof results} */
  const vecResults = (vec.results ?? []).map((r) => ({
    layer: "L3",
    score: Number(r.score ?? 0) * 10,
    path: r.path,
    title: r.path,
    excerpt: r.excerpt ?? "",
  }));

  const merged = [...wikiHits, ...vecResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    ok: true,
    layer: vecResults.length ? "L3" : wikiHits[0]?.layer ?? "L1",
    query: q,
    results: merged,
    citations: merged.map((r) => `\`${r.path}\``),
    vectorFallback: vecResults.length > 0,
  };
}
