import path from "node:path";

export const DEFAULT_SCAN_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".pdf",
  ".docx",
  ".html",
  ".htm",
]);

export const DEFAULT_IGNORE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".openwork",
  ".opencode",
  "dist",
  "build",
  "target",
  ".turbo",
  ".next",
  "coverage",
]);

/** @param {string} absPath @param {string} scanRoot */
export function isUnderKnowledgeStore(absPath, scanRoot) {
  const knowledgeMarker = `${path.sep}.openwork${path.sep}knowledge${path.sep}`;
  return absPath.includes(knowledgeMarker) && absPath.startsWith(path.resolve(scanRoot));
}

/** @param {string} dirName */
export function shouldIgnoreDir(dirName) {
  return DEFAULT_IGNORE_DIR_NAMES.has(dirName);
}

/** @param {string} filePath */
export function isScannableFile(filePath) {
  return DEFAULT_SCAN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
