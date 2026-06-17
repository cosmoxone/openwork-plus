// 向量检索：余弦相似度（JSON 存储的 chunk 向量）。

/** @param {number[]} a @param {number[]} b */
export function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * @param {number[]} queryVec
 * @param {Array<{docId:string, path:string, chunkId:string, text:string, embedding:number[]}>} chunks
 * @param {number} topK
 */
export function rankChunks(queryVec, chunks, topK = 5) {
  const scored = chunks
    .map((c) => ({
      ...c,
      score: cosineSimilarity(queryVec, c.embedding),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
