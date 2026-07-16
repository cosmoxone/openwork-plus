import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ingestSourceFile } from "./ingest.mjs";
import { scanCorpus } from "./scan.mjs";
import { readState, writeState } from "./state.mjs";
import { knowledgePaths } from "./paths.mjs";

/** @param {string} dir */
async function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  /** @type {string[]} */
  const files = [];
  for (const entry of entries) {
    if (entry.isFile()) files.push(path.join(dir, entry.name));
  }
  return files;
}

/**
 * 单次轮询：inbox 自动 ingest + 授权目录增量 scan。
 * @param {string} workspaceRoot
 * @param {{ autoIngestWatchRoots?: boolean }} [options]
 */
export async function pollWatchOnce(workspaceRoot, options = {}) {
  const paths = knowledgePaths(workspaceRoot);
  const state = await readState(workspaceRoot);
  const watchCfg = state.watch ?? { enabled: false, roots: [], inboxAutoIngest: true };

  /** @type {Array<{ kind: string, path: string, result?: string }>} */
  const actions = [];

  if (watchCfg.inboxAutoIngest !== false) {
    const inboxFiles = await listFiles(paths.rawInbox);
    for (const file of inboxFiles) {
      const ingested = await ingestSourceFile(workspaceRoot, file);
      actions.push({ kind: "inbox-ingest", path: file, result: ingested.summaryRel });
    }
  }

  const roots = (watchCfg.roots ?? []).filter((r) => existsSync(r));
  if (roots.length > 0) {
    const scan = await scanCorpus(workspaceRoot, roots, { merge: true });
    actions.push({
      kind: "scan-merge",
      path: roots.join(","),
      result: `pending=${scan.pending} total=${scan.total}`,
    });

    if (options.autoIngestWatchRoots || watchCfg.autoIngestWatchRoots) {
      const pending = scan.manifest.filter((e) => e.status === "pending");
      for (const entry of pending.slice(0, watchCfg.maxAutoIngestPerPoll ?? 5)) {
        const ingested = await ingestSourceFile(workspaceRoot, entry.path);
        actions.push({ kind: "root-ingest", path: entry.path, result: ingested.summaryRel });
      }
    }
  }

  state.watch = {
    ...watchCfg,
    lastRunAt: new Date().toISOString(),
    lastActions: actions,
  };
  await writeState(workspaceRoot, state);

  return { ok: true, actions, actionCount: actions.length };
}

/**
 * @param {string} workspaceRoot
 * @param {{ roots?: string[], enabled?: boolean, inboxAutoIngest?: boolean, autoIngestWatchRoots?: boolean, intervalSec?: number }} patch
 */
export async function updateWatchConfig(workspaceRoot, patch) {
  const state = await readState(workspaceRoot);
  state.watch = {
    enabled: false,
    roots: [],
    inboxAutoIngest: true,
    autoIngestWatchRoots: false,
    intervalSec: 30,
    maxAutoIngestPerPoll: 5,
    ...(state.watch ?? {}),
    ...patch,
  };
  await writeState(workspaceRoot, state);
  return { ok: true, watch: state.watch };
}

/** @param {string} workspaceRoot */
export async function getWatchConfig(workspaceRoot) {
  const state = await readState(workspaceRoot);
  return { ok: true, watch: state.watch ?? { enabled: false, roots: [] } };
}

/**
 * 长驻 watch（CLI/dev）：fs.watch inbox + debounce poll。
 * @param {string} workspaceRoot
 */
export async function startWatchLoop(workspaceRoot) {
  const paths = knowledgePaths(workspaceRoot);
  await updateWatchConfig(workspaceRoot, { enabled: true });

  let timer = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      pollWatchOnce(workspaceRoot).catch(console.error);
    }, 800);
  };

  const watchers = [];
  if (existsSync(paths.rawInbox)) {
    watchers.push(watch(paths.rawInbox, schedule));
  }

  const state = await readState(workspaceRoot);
  for (const root of state.watch?.roots ?? []) {
    if (existsSync(root)) watchers.push(watch(root, schedule));
  }

  schedule();
  return {
    ok: true,
    message: "watch loop running; Ctrl+C to stop",
    stop: () => {
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
    },
  };
}
