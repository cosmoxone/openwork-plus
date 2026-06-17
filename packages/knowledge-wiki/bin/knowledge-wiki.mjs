#!/usr/bin/env node
/**
 * knowledge-wiki CLI（JSON 出，供 Tauri / CI 调用）
 *
 *   node knowledge-wiki.mjs init --workspace <dir>
 *   node knowledge-wiki.mjs scan --workspace <dir> --roots <a,b>
 *   node knowledge-wiki.mjs ingest --workspace <dir> --file <path>
 *   node knowledge-wiki.mjs state --workspace <dir>
 */
import {
  initKnowledgeLayout,
  scanCorpus,
  ingestSourceFile,
  readState,
  readIndex,
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
      const result = await initKnowledgeLayout(workspace, { force: flags.force === true });
      out({ ok: true, ...result });
      return;
    }

    if (cmd === "scan") {
      const rootsRaw = typeof flags.roots === "string" ? flags.roots : workspace;
      const roots = rootsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const result = await scanCorpus(workspace, roots, { merge: flags.merge === true });
      out({ ok: true, ...result });
      return;
    }

    if (cmd === "ingest") {
      const file = typeof flags.file === "string" ? flags.file : "";
      if (!file) fail("ingest 需要 --file");
      const title = typeof flags.title === "string" ? flags.title : undefined;
      const result = await ingestSourceFile(workspace, file, { title });
      out({ ok: true, ...result });
      return;
    }

    if (cmd === "state") {
      const state = await readState(workspace);
      const index = await readIndex(workspace);
      out({ ok: true, state, indexPreview: index.slice(0, 500) });
      return;
    }

    fail(`未知命令: ${cmd ?? "(empty)"}. 可用: init, scan, ingest, state`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

main();
