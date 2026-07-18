// Build the builtin bundle catalog by scanning bundles/*/bundle.json.
//
// Output: <outdir>/catalog.builtin.json
// Format: { schemaVersion, source: "builtin", generatedAt, bundles: [{id, name, version, description, ...}] }
//
// Used by the Bundle UI's "Browse catalog" view (P2.1). Run via
//   `pnpm --filter openwork-desktop build:builtin-catalog`
// or directly:
//   `node apps/desktop/scripts/build-builtin-catalog.mjs --bundles <repo>/bundles --outdir <repo>/apps/desktop/resources/bundles`

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** @typedef {{ id: string; name?: string; version?: string; description?: string; scope?: string; featured?: boolean; keywords?: string[]; author?: string; homepage?: string }} CatalogEntry */

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

/**
 * Scan the bundles directory and produce catalog entries.
 * @param {string} bundlesDir
 * @returns {Promise<CatalogEntry[]>}
 */
async function scanBundles(bundlesDir) {
  if (!existsSync(bundlesDir)) return [];
  const entries = await readdir(bundlesDir, { withFileTypes: true });
  /** @type {CatalogEntry[]} */
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const bundleJsonPath = path.join(bundlesDir, entry.name, "bundle.json");
    if (!existsSync(bundleJsonPath)) continue;
    try {
      const raw = await readFile(bundleJsonPath, "utf8");
      const manifest = JSON.parse(raw);
      if (!manifest || typeof manifest !== "object") continue;
      if (typeof manifest.id !== "string" || !manifest.id) continue;
      // Project the fields the catalog UI needs; ignore everything else.
      out.push({
        id: manifest.id,
        name: typeof manifest.name === "string" ? manifest.name : manifest.id,
        version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
        description: typeof manifest.description === "string" ? manifest.description : "",
        scope: manifest.scope === "user" ? "user" : "workspace",
        featured: manifest.featured === true,
        keywords: Array.isArray(manifest.keywords)
          ? manifest.keywords.filter((k) => typeof k === "string")
          : [],
        author: typeof manifest.author === "string" ? manifest.author : "",
        homepage: typeof manifest.homepage === "string" ? manifest.homepage : "",
        // P2.3+: sourcePath lets the renderer install/update this entry
        // directly without prompting for a zip. Uses POSIX-style relative
        // path from repo root (e.g. "bundles/knowledge-mgmt"). At runtime
        // bundle-bridge.mjs resolves this against the actual repo root or
        // process.resourcesPath in packaged builds.
        sourcePath: `bundles/${entry.name}`,
      });
    } catch (err) {
      console.warn(
        `[build-builtin-catalog] skipping ${bundleJsonPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  // Stable ordering: by id ascending.
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const bundlesDir = path.resolve(flags.bundles ?? path.join(process.cwd(), "bundles"));
  const outdir = path.resolve(
    flags.outdir ?? path.join(process.cwd(), "apps", "desktop", "resources", "bundles"),
  );

  const entries = await scanBundles(bundlesDir);
  const catalog = {
    schemaVersion: "1.0.0",
    source: "builtin",
    generatedAt: new Date().toISOString(),
    bundles: entries,
  };

  await mkdir(outdir, { recursive: true });
  const outfile = path.join(outdir, "catalog.builtin.json");
  await writeFile(outfile, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  console.log(`[build-builtin-catalog] wrote ${outfile} (${entries.length} entries)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
