import path from "node:path";
import { createHash } from "node:crypto";

/** @param {string} name */
export function slugify(name) {
  const base = path.basename(name, path.extname(name));
  const slug = base
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "doc";
}

/** @param {string} filePath */
export function fileId(filePath) {
  const hash = createHash("sha256").update(path.resolve(filePath)).digest("hex").slice(0, 12);
  return `${slugify(filePath)}-${hash}`;
}
