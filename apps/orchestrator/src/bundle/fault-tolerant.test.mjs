// Unit tests for readUserDataOrReset.
// Run: bun test apps/orchestrator/src/bundle/fault-tolerant.test.mjs
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { dirname } from "node:path";
import { readUserDataOrReset } from "./fault-tolerant.mjs";

const { join } = path;

let tempDir;
/** Atomic write helper for tests: writes then renames (same semantics as installer.mjs). */
async function testAtomicWrite(file, content) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "fault-tolerant-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("readUserDataOrReset", () => {
  test("returns defaultValue when file is missing", async () => {
    const result = await readUserDataOrReset({
      file: join(tempDir, "nope.json"),
      defaultValue: { ok: true },
      atomicWrite: testAtomicWrite,
    });
    expect(result.value).toEqual({ ok: true });
    expect(result.recoveredFromCorrupt).toBe(false);
    expect(result.backupPath).toBeUndefined();
  });

  test("parses valid JSON", async () => {
    const file = join(tempDir, "good.json");
    await writeFile(file, '{"name":"alpha","count":3}', "utf8");
    const result = await readUserDataOrReset({
      file,
      defaultValue: {},
      atomicWrite: testAtomicWrite,
    });
    expect(result.value).toEqual({ name: "alpha", count: 3 });
    expect(result.recoveredFromCorrupt).toBe(false);
  });

  test("backs up and resets on corrupt JSON (trailing comma)", async () => {
    const file = join(tempDir, "broken.json");
    const bad = '{"a":1,}\n';
    await writeFile(file, bad, "utf8");

    const result = await readUserDataOrReset({
      file,
      defaultValue: { fresh: true },
      label: "broken.json",
      atomicWrite: testAtomicWrite,
    });

    expect(result.value).toEqual({ fresh: true });
    expect(result.recoveredFromCorrupt).toBe(true);
    expect(result.backupPath).toBeTruthy();
    // Backup contains the original bad content.
    const backupContent = await readFile(result.backupPath, "utf8");
    expect(backupContent).toBe(bad);
    // File was reset to serialized default.
    const newContent = await readFile(file, "utf8");
    expect(newContent.trim()).toBe(JSON.stringify({ fresh: true }, null, 2));
  });

  test("respects custom parse/serialize", async () => {
    const file = join(tempDir, "frontmatter.txt");
    // Content that the custom parser rejects but JSON.parse would accept.
    await writeFile(file, "REJECT_ME\n", "utf8");
    let parseCalls = 0;

    const result = await readUserDataOrReset({
      file,
      defaultValue: { recovered: true },
      parse: (raw) => {
        parseCalls += 1;
        if (raw.includes("REJECT_ME")) throw new Error("simulated parse failure");
        return JSON.parse(raw);
      },
      serialize: (value) => JSON.stringify(value),
      backupSuffix: ".custom-corrupt",
      atomicWrite: testAtomicWrite,
    });

    expect(parseCalls).toBe(1);
    expect(result.value).toEqual({ recovered: true });
    expect(result.recoveredFromCorrupt).toBe(true);
    expect(result.backupPath).toContain(".custom-corrupt");
  });

  test("throws when atomicWrite is missing", async () => {
    await expect(
      readUserDataOrReset({
        file: join(tempDir, "x.json"),
        defaultValue: {},
      }),
    ).rejects.toThrow(/atomicWrite is required/);
  });
});
