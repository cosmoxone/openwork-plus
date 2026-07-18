// User-data fault-tolerance helpers.
//
// Standard pattern for reading files that are user-editable or produced by
// third-party tools (opencode.json, SKILL.md frontmatter, installed-bundles.json):
// never let a single corrupt file abort the whole feature. Always back up the
// original, reset to a safe default, log a warning, and continue.
//
// See cosmoxwork-docs/openworkplus/12-project/issues/01-skill-yaml-not-fault-tolerant.md
// for the design rationale and the bug that motivated this module.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Read a JSON file and parse it. If the file does not exist, returns `defaultValue`.
 * If the file exists but cannot be parsed, the bad content is backed up to
 * `<file>.corrupt-<timestamp>.json`, the file is overwritten with `defaultValue`
 * (serialized as JSON), and `defaultValue` is returned — so the caller can
 * continue without surfacing the corruption as a hard error.
 *
 * @template T
 * @param {object} opts
 * @param {string} opts.file         Absolute path to the JSON file.
 * @param {T} opts.defaultValue      Value returned (and written) on missing/corrupt.
 * @param {string} [opts.label]      Human-readable label for log messages; defaults to the file name.
 * @param {(content: string) => T} [opts.parse]   Custom parser; defaults to JSON.parse.
 * @param {(value: T) => string} [opts.serialize] Custom serializer for the reset write; defaults to JSON.stringify(_, null, 2).
 * @param {string} [opts.backupSuffix]            Suffix appended to backup file (before .json); defaults to ".corrupt-<ts>".
 * @param {(file: string, content: string) => Promise<void>} opts.atomicWrite  Atomic write implementation (required; avoids a hard dep on installer.mjs).
 * @returns {Promise<{ value: T; recoveredFromCorrupt: boolean; backupPath?: string }>}
 */
export async function readUserDataOrReset(opts) {
  const {
    file,
    defaultValue,
    label,
    parse = (raw) => JSON.parse(raw),
    serialize = (value) => JSON.stringify(value, null, 2),
    backupSuffix,
    atomicWrite,
  } = opts;
  if (!file) throw new Error("readUserDataOrReset: file is required");
  if (typeof atomicWrite !== "function") {
    throw new Error("readUserDataOrReset: atomicWrite is required");
  }
  const displayName = label ?? path.basename(file);

  if (!existsSync(file)) {
    return { value: defaultValue, recoveredFromCorrupt: false };
  }

  const raw = await readFile(file, "utf8");
  try {
    const value = parse(raw);
    return { value, recoveredFromCorrupt: false };
  } catch (parseErr) {
    const ts = Date.now();
    const suffix = backupSuffix ?? `.corrupt-${ts}`;
    const backupPath = `${file}${suffix}.json`;
    await atomicWrite(backupPath, raw);
    // Reset to a safe default so the caller can continue.
    await atomicWrite(file, `${serialize(defaultValue)}\n`);
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error(
      `[fault-tolerant] WARNING: ${displayName} (${file}) was not valid: ${msg}. ` +
        `Backed up to ${backupPath} and reset to default value.`,
    );
    return { value: defaultValue, recoveredFromCorrupt: true, backupPath };
  }
}
