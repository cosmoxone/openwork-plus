// Sprint 2 冒烟：knowledge-mgmt bundle 安装 + skills/commands/mcp + 卸载可逆。
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  installBundle,
  listBundles,
  uninstallBundle,
} from "../src/bundle/installer.mjs";
import { KnowledgeDb } from "../../../packages/sqlite-vec-mcp/src/db.mjs";
import { knowledgeDbPath } from "../../../packages/knowledge-wiki/src/db-path.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.join(here, "..", "..", "..", "bundles", "knowledge-mgmt");
const monorepoRoot = path.join(here, "..", "..", "..");

async function main() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-km-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-km-data-"));
  process.env.OPENWORK_MONOREPO_ROOT = monorepoRoot;
  try {
    const res = await installBundle({ bundleDir, workspaceRoot, dataDir });
    assert.equal(res.id, "knowledge-mgmt");
    assert.ok(res.addedMcp.includes("sqlite-vec-rag"), "应合并 sqlite-vec-rag mcp");
    assert.ok(res.addedMcp.includes("filesystem"), "应合并 filesystem mcp");

    for (const skill of ["summarize-docs", "find-connections", "semantic-search"]) {
      const p = path.join(workspaceRoot, ".opencode", "skills", skill, "SKILL.md");
      assert.ok(existsSync(p), `技能应存在: ${skill}`);
    }

    assert.ok(
      existsSync(path.join(workspaceRoot, ".opencode", "commands", "semantic-search.md")),
      "斜杠命令 semantic-search 应存在",
    );

    const cfg = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    const rag = cfg.mcp["sqlite-vec-rag"];
    assert.ok(rag.args[0].includes("sqlite-vec-mcp"), "sqlite-vec-rag 应指向 monorepo 包");
    assert.equal(
      path.normalize(rag.args[rag.args.length - 1]),
      path.normalize(knowledgeDbPath(workspaceRoot)),
    );

    const ui = JSON.parse(
      await readFile(path.join(workspaceRoot, ".openwork", "bundle-ui.json"), "utf8"),
    );
    assert.ok(ui.bundles.some((b) => b.id === "knowledge-mgmt"));
    assert.ok(ui.bundles.find((b) => b.id === "knowledge-mgmt")?.routes?.includes("/docs"));

    // MCP 存储层：索引 + 语义检索
    const dbPath = knowledgeDbPath(workspaceRoot);
    const db = new KnowledgeDb(dbPath);
    await db.indexDocument({
      path: "docs/onboarding.md",
      title: "Onboarding",
      content: "OpenWork knowledge bundle enables semantic search across markdown notes.",
    });
    const hits = await db.semanticSearch({ query: "semantic search markdown", top_k: 3 });
    assert.ok(hits.results.length >= 1);
    assert.equal(hits.results[0].path, "docs/onboarding.md");

    const list = await listBundles({ dataDir });
    assert.equal(list.length, 1);

    await uninstallBundle({ id: "knowledge-mgmt", dataDir });
    assert.ok(!existsSync(path.join(workspaceRoot, ".opencode", "skills", "semantic-search")));
    const cfg2 = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    assert.ok(!cfg2.mcp?.["sqlite-vec-rag"]);

    console.log("PASS: Sprint 2 knowledge-mgmt bundle install/list/uninstall + RAG");
  } finally {
    delete process.env.OPENWORK_MONOREPO_ROOT;
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
