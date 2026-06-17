#!/usr/bin/env node
/**
 * knowledge-wiki CLI（JSON 出，供 Tauri / CI 调用）
 */
import {
  initKnowledgeLayout,
  scanCorpus,
  ingestSourceFile,
  readState,
  readIndex,
  listWikiPages,
  createWikiPage,
  saveQueryAsWikiPage,
  readWikiPageContent,
  runKnowledgeLint,
  hybridQuery,
  rebuildKnowledgeIndex,
  clearKnowledgeIndex,
} from "../src/index.mjs";

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positionals.push(a);
    }
  }
  return { cmd: positionals[0], flags };
}

function out(payload) {
  console.log(JSON.stringify(payload));
}

function fail(message, code = 1) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(code);
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  const workspace = typeof flags.workspace === "string" ? flags.workspace : process.env.OW_WORKSPACE_ROOT;
  if (!workspace && cmd !== "help") {
    fail("缺少 --workspace 或 OW_WORKSPACE_ROOT");
  }

  try {
    if (cmd === "init") {
      out({ ok: true, ...(await initKnowledgeLayout(workspace, { force: flags.force === true })) });
      return;
    }

    if (cmd === "scan") {
      const rootsRaw = typeof flags.roots === "string" ? flags.roots : workspace;
      const roots = rootsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      out({ ok: true, ...(await scanCorpus(workspace, roots, { merge: flags.merge === true })) });
      return;
    }

    if (cmd === "ingest") {
      const file = typeof flags.file === "string" ? flags.file : "";
      if (!file) fail("ingest 需要 --file");
      const title = typeof flags.title === "string" ? flags.title : undefined;
      out({ ok: true, ...(await ingestSourceFile(workspace, file, { title })) });
      return;
    }

    if (cmd === "state") {
      const state = await readState(workspace);
      const index = await readIndex(workspace);
      out({ ok: true, state, indexPreview: index.slice(0, 800) });
      return;
    }

    if (cmd === "lint") {
      out(await runKnowledgeLint(workspace, { apply: flags.apply === true }));
      return;
    }

    if (cmd === "list-pages") {
      out({ ok: true, pages: await listWikiPages(workspace) });
      return;
    }

    if (cmd === "read-page") {
      const rel = typeof flags.path === "string" ? flags.path : "";
      if (!rel) fail("read-page 需要 --path");
      const page = await readWikiPageContent(workspace, rel);
      if (!page) fail(`页面不存在: ${rel}`);
      out({ ok: true, path: rel, ...page });
      return;
    }

    if (cmd === "create-page") {
      const title = typeof flags.title === "string" ? flags.title : "";
      const type = typeof flags.type === "string" ? flags.type : "qa";
      const body = typeof flags.body === "string" ? flags.body : "";
      if (!title || !body) fail("create-page 需要 --title 与 --body");
      out({ ok: true, ...(await createWikiPage(workspace, { type, title, body })) });
      return;
    }

    if (cmd === "save-query") {
      const title = typeof flags.title === "string" ? flags.title : "问答沉淀";
      const query = typeof flags.query === "string" ? flags.query : "";
      const answer = typeof flags.answer === "string" ? flags.answer : "";
      if (!answer) fail("save-query 需要 --answer");
      out({ ok: true, ...(await saveQueryAsWikiPage(workspace, { title, query, answer })) });
      return;
    }

    if (cmd === "query") {
      const q = typeof flags.q === "string" ? flags.q : "";
      if (!q) fail("query 需要 --q");
      out(await hybridQuery(workspace, q, { topK: Number(flags["top-k"] ?? 5) || 5 }));
      return;
    }

    if (cmd === "rebuild-index") {
      out(await rebuildKnowledgeIndex(workspace));
      return;
    }

    if (cmd === "clear-index") {
      out(await clearKnowledgeIndex(workspace));
      return;
    }

    fail(
      `未知命令: ${cmd ?? "(empty)"}. 可用: init, scan, ingest, state, lint, list-pages, read-page, create-page, save-query, query, rebuild-index, clear-index`,
    );
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

main();
