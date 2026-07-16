// Embedding：优先 OpenAI text-embedding-3-small；无 API Key 时用确定性本地向量（冒烟/离线可用）。

const EMBED_DIM = 64;

/** @param {string} text */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** @param {string} text @param {number} dim */
export function localEmbed(text, dim = EMBED_DIM) {
  /** @type {number[]} */
  const vec = Array.from({ length: dim }, () => 0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1;
  }
  return normalize(vec);
}

/** @param {number[]} vec */
function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return localEmbed(text);

  const model = process.env.OPENWORK_EMBED_MODEL?.trim() || "text-embedding-3-small";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const embedding = json?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("OpenAI embeddings response missing vector");
  }
  return normalize(embedding);
}
