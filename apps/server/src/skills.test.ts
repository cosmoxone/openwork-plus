import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteSkill, listSkills } from "./skills.js";
import { exists } from "./utils.js";

let workspace: string;

async function writeSkill(dir: string, name: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\nBody\n`, "utf8");
}

/** Write a SKILL.md with arbitrary frontmatter content (for fault-injection). */
async function writeSkillRaw(dir: string, name: string, frontmatter: string, body = "Body") {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n${body}\n`, "utf8");
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "openwork-skills-"));
  await mkdir(join(workspace, ".git"), { recursive: true });
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("deleteSkill", () => {
  test("deletes a flat skill", async () => {
    const dir = join(workspace, ".opencode", "skills", "flat-skill");
    await writeSkill(dir, "flat-skill");
    await deleteSkill(workspace, "flat-skill");
    expect(await exists(dir)).toBe(false);
  });

  test("deletes a plugin-namespaced (nested) skill", async () => {
    // Marketplace plugin bundles install skills under skills/<plugin>/<name>/
    const dir = join(workspace, ".opencode", "skills", "bio-research-plugin", "instrument-data-to-allotrope");
    await writeSkill(dir, "instrument-data-to-allotrope");

    const listed = await listSkills(workspace, false);
    expect(listed.map((s) => s.name)).toContain("instrument-data-to-allotrope");

    await deleteSkill(workspace, "instrument-data-to-allotrope");
    expect(await exists(dir)).toBe(false);
  });

  test("404s for unknown skills", async () => {
    await expect(deleteSkill(workspace, "does-not-exist")).rejects.toThrow("Skill not found");
  });
});

describe("listSkills fault tolerance", () => {
  // Regression: a single SKILL.md with broken YAML frontmatter used to abort
  // the whole /skills request with 500. We now skip the bad entry and return
  // the rest. See issues/01-skill-yaml-not-fault-tolerant.md.
  test("skips skill with malformed YAML frontmatter (unquoted colon)", async () => {
    const goodDir = join(workspace, ".opencode", "skills", "good-skill");
    const badDir = join(workspace, ".opencode", "skills", "bad-skill");
    await writeSkill(goodDir, "good-skill");
    // The pattern that triggered the original bug: a colon inside description
    // without quotes makes the YAML parser see a nested mapping.
    await writeSkillRaw(
      badDir,
      "bad-skill",
      "name: bad-skill\ndescription: Use when bumping: query release, verify artifacts",
    );

    const list = await listSkills(workspace, false);

    const names = list.map((s) => s.name);
    expect(names).toContain("good-skill");
    expect(names).not.toContain("bad-skill");
    expect(names.length).toBe(1);
  });

  test("skips skill with unparseable frontmatter (tabs/control chars)", async () => {
    const goodDir = join(workspace, ".opencode", "skills", "alpha");
    const badDir = join(workspace, ".opencode", "skills", "beta");
    await writeSkill(goodDir, "alpha");
    await writeSkillRaw(badDir, "beta", "\tname: beta\n\tdescription: tab-indented");

    const list = await listSkills(workspace, false);
    const names = list.map((s) => s.name);
    expect(names).toContain("alpha");
    expect(names).not.toContain("beta");
  });

  test("returns empty list when all skills are broken", async () => {
    const badDir = join(workspace, ".opencode", "skills", "broken");
    await writeSkillRaw(
      badDir,
      "broken",
      "name: broken\ndescription: bad: colon: everywhere: yes",
    );

    const list = await listSkills(workspace, false);
    expect(list).toEqual([]);
  });

  test("does not throw when SKILL.md is missing frontmatter entirely", async () => {
    const dir = join(workspace, ".opencode", "skills", "no-frontmatter");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "# Just markdown\n\nNo frontmatter here.\n", "utf8");

    const list = await listSkills(workspace, false);
    // No frontmatter -> name falls back to entryName; description empty may
    // fail validation, in which case it is filtered. Either way, no throw.
    expect(Array.isArray(list)).toBe(true);
  });

  test("still scans .claude/skills/ alongside .opencode/skills/", async () => {
    const ocDir = join(workspace, ".opencode", "skills", "oc-skill");
    const clDir = join(workspace, ".claude", "skills", "cl-skill");
    await writeSkill(ocDir, "oc-skill");
    await writeSkill(clDir, "cl-skill");

    const list = await listSkills(workspace, false);
    const names = list.map((s) => s.name).sort();
    expect(names).toEqual(["cl-skill", "oc-skill"]);
  });
});
