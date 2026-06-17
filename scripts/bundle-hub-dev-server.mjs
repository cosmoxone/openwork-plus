#!/usr/bin/env node
/**
 * 本地 Bundle Hub 静态 HTTP 服务（默认 http://127.0.0.1:9123）。
 *
 * 先运行: node scripts/prepare-bundle-hub-dev.mjs
 * 再运行: node scripts/bundle-hub-dev-server.mjs
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const hubDir = path.join(root, ".dev", "bundle-hub");
const port = Number(process.env.BUNDLE_HUB_DEV_PORT ?? 9123);

const MIME = {
  ".json": "application/json; charset=utf-8",
  ".zip": "application/zip",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const rel = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(hubDir, rel);
  if (!resolved.startsWith(path.resolve(hubDir))) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  const file = safePath(req.url ?? "/");
  if (!file || !existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const body = await readFile(file);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Bundle Hub dev server: http://127.0.0.1:${port}/catalog.json`);
  console.log(`Serving: ${hubDir}`);
});
