import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initKnowledgeLayout,
  scanCorpus,
  ingestSourceFile,
  readState,
  readIndex,
  knowledgePaths,
  knowledgeDbPath,
  createWikiPage,
  runKnowledgeLint,
  hybridQuery,
  rebuildKnowledgeIndex,
  saveQueryAsWikiPage,
  listWikiPages,
} from "../src/index.mjs";

async function run() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "ow-knowledge-wiki-"));
  try {
    await initKnowledgeLayout(tmp);
    const paths = knowledgePaths(tmp);
    if (!existsSync(paths.agents)) throw new Error("AGENTS.md missing");

    const docsDir = path.join(tmp, "sample-docs");
    await mkdir(docsDir, { recursive: true });
    await writeFile(
      path.join(docsDir, "note-a.md"),
      "# Note A\n\nAlpha content with [[concepts/alpha-term]].",
    );
    await writeFile(path.join(docsDir, "note-b.md"), "# Note B\n\nBeta content.");

    const scan = await scanCorpus(tmp, [docsDir]);
    if (scan.total !== 2) throw new Error(`expected 2 scan entries, got ${scan.total}`);

    const noteA = path.join(docsDir, "note-a.md");
    await ingestSourceFile(tmp, noteA);

    const pages = await listWikiPages(tmp);
    if (pages.length < 2) throw new Error("expected summary + concept stub pages");

    await createWikiPage(tmp, {
      type: "synthesis",
      title: "Alpha Beta Synth",
      body: "Cross doc synthesis linking [[summaries/note-a]].",
    });

    const broken = await createWikiPage(tmp, {
      type: "entity",
      title: "Broken Link Demo",
      body: "See [[concepts/does-not-exist]].",
    });
    if (!broken.relPath) throw new Error("entity page missing");

    let lint = await runKnowledgeLint(tmp);
    if (lint.summary.errors < 1) throw new Error("lint should detect broken wikilink");

    lint = await runKnowledgeLint(tmp, { apply: true });
    if (lint.summary.fixed < 1) throw new Error("lint apply should fix broken link");

    const saved = await saveQueryAsWikiPage(tmp, {
      title: "What is Alpha",
      query: "What is Alpha",
      answer: "Alpha is mentioned in note A.",
    });
    if (!existsSync(path.join(paths.wiki, "qa", `${saved.slug}.md`))) {
      throw new Error("qa page not saved");
    }

    const index = await readIndex(tmp);
    if (!index.includes("问答沉淀")) throw new Error("INDEX missing qa section");

    const rebuild = await rebuildKnowledgeIndex(tmp);
    if (!rebuild.indexed || rebuild.indexed < 2) throw new Error("rebuild index too small");
    if (!existsSync(knowledgeDbPath(tmp))) throw new Error("knowledge.db missing");

    const query = await hybridQuery(tmp, "Alpha content");
    if (!query.results.length) throw new Error("hybrid query returned no hits");
    if (!query.results.some((r) => r.layer === "L1" || r.layer === "L2")) {
      throw new Error("expected L1/L2 wiki hit before vector");
    }

    const state = await readState(tmp);
    if (state.ingestLog.length < 1) throw new Error("ingestLog empty");

    const summary = await readFile(path.join(paths.wiki, "summaries", "note-a.md"), "utf8");
    if (!summary.includes("Alpha content")) throw new Error("summary missing excerpt");

    console.log("PASS: knowledge-wiki K0–K2 smoke");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
