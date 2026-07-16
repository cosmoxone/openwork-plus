import path from "node:path";

/** @typedef {'summary'|'concept'|'entity'|'synthesis'|'qa'} WikiPageType */

export const WIKI_PAGE_TYPES = /** @type {const} */ ([
  "summary",
  "concept",
  "entity",
  "synthesis",
  "qa",
]);

/** @type {Record<WikiPageType, string>} */
export const TYPE_TO_DIR = {
  summary: "summaries",
  concept: "concepts",
  entity: "entities",
  synthesis: "syntheses",
  qa: "qa",
};

/** @param {string} content */
export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }
  /** @type {Record<string, unknown>} */
  const meta = {};
  let currentKey = "";
  for (const line of match[1].split("\n")) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(listItem[1].trim());
      continue;
    }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!kv) continue;
    currentKey = kv[1];
    const raw = kv[2].trim();
    if (!raw) {
      meta[currentKey] = [];
      continue;
    }
    meta[currentKey] = raw.replace(/^['"]|['"]$/g, "");
  }
  return { meta, body: match[2] };
}

/** @param {Record<string, unknown>} meta @param {string} body */
export function serializeFrontmatter(meta, body) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---", "", body.trim(), "");
  return `${lines.join("\n")}\n`;
}

/** @param {string} body */
export function extractWikilinks(body) {
  /** @type {string[]} */
  const links = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    links.push(m[1].trim());
  }
  return [...new Set(links)];
}
