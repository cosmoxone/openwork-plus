// Windows-safe tree copy: dereference symlinks/junctions (pnpm node_modules).
import { copyFile, lstat, mkdir, readdir, readlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Copy a file or directory tree, materializing symlink targets as real files.
 * Avoids EPERM from fs.cp on Windows when copying pnpm-linked node_modules.
 *
 * @param {string} src
 * @param {string} dest
 */
export async function copyTreeDeref(src, dest) {
  if (!existsSync(src)) return;

  const entry = await lstat(src);
  if (entry.isSymbolicLink()) {
    const link = await readlink(src);
    const resolved = path.resolve(path.dirname(src), link);
    await copyTreeDeref(resolved, dest);
    return;
  }

  if (entry.isDirectory()) {
    await mkdir(dest, { recursive: true });
    for (const name of await readdir(src)) {
      await copyTreeDeref(path.join(src, name), path.join(dest, name));
    }
    return;
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
}
