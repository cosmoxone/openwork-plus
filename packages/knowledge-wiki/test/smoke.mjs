import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initKnowledgeLayout,
  scanCorpus,
  ingestSourceFile,
  readState,
  readIndex,
  knowledgePaths,
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "ow-knowledge-wiki-"));
  try {
    await initKnowledgeLayout(tmp);
    const paths = knowledgePaths(tmp);
    if (!existsSync(paths.agents)) throw new Error("AGENTS.md missing");
    if (!existsSync(paths.wikiIndex)) throw new Error("INDEX.md missing");

    const docsDir = path.join(tmp, "sample-docs");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(docsDir, { recursive: true });
    await writeFile(path.join(docsDir, "note-a.md"), "# Note A\n\nAlpha content.");
    await writeFile(path.join(docsDir, "note-b.md"), "# Note B\n\nBeta content.");

    const scan = await scanCorpus(tmp, [docsDir]);
    if (scan.total !== 2) throw new Error(`expected 2 scan entries, got ${scan.total}`);
    if (scan.pending !== 2) throw new Error(`expected 2 pending, got ${scan.pending}`);

    const noteA = path.join(docsDir, "note-a.md");
    const ingested = await ingestSourceFile(tmp, noteA);
    if (!existsSync(ingested.summaryPath)) throw new Error("summary not created");

    const index = await readIndex(tmp);
    if (!index.includes("note-a") && !index.includes("Note A")) {
      throw new Error("INDEX missing ingested entry");
    }

    const state = await readState(tmp);
    if (state.ingestLog.length !== 1) throw new Error("ingestLog length mismatch");
    const entry = state.scanManifest.find((e) => e.path === noteA);
    if (entry?.status !== "ingested") throw new Error("manifest status not ingested");

    const archived = await readFile(ingested.summaryPath, "utf8");
    if (!archived.includes("Alpha content")) throw new Error("summary missing excerpt");

    console.log("PASS: knowledge-wiki K0 smoke");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
