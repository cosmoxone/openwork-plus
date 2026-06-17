import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { knowledgePaths } from "./paths.mjs";
import { listWikiPages, resolveWikiLink, readWikiPageContent } from "./pages.mjs";
import { extractWikilinks, serializeFrontmatter } from "./wiki-page.mjs";

/**
 * @typedef {{ severity: 'error'|'warn'|'info', code: string, message: string, file?: string, fixable?: boolean }} LintIssue
 */

/** @param {string} s */
function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @param {string} workspaceRoot @param {{ apply?: boolean }} [options] */
export async function runKnowledgeLint(workspaceRoot, options = {}) {
  const paths = knowledgePaths(workspaceRoot);
  const pages = await listWikiPages(workspaceRoot);
  /** @type {LintIssue[]} */
  const issues = [];
  const titles = new Map();

  for (const page of pages) {
    if (titles.has(page.title)) {
      issues.push({
        severity: "warn",
        code: "duplicate_title",
        message: `重复标题「${page.title}」`,
        file: page.relPath,
      });
    } else {
      titles.set(page.title, page.relPath);
    }

    for (const src of page.sourceFiles) {
      const srcAbs = path.join(paths.root, src.replace(/\\/g, "/"));
      if (!existsSync(srcAbs)) {
        issues.push({
          severity: "error",
          code: "stale_source_file",
          message: `source_files 指向不存在: ${src}`,
          file: page.relPath,
          fixable: true,
        });
      }
    }

    for (const link of page.wikilinks) {
      if (!resolveWikiLink(workspaceRoot, link)) {
        issues.push({
          severity: "error",
          code: "broken_wikilink",
          message: `断链 [[${link}]]`,
          file: page.relPath,
          fixable: true,
        });
      }
    }
  }

  const indexContent = existsSync(paths.wikiIndex)
    ? await readFile(paths.wikiIndex, "utf8")
    : "";
  const indexLinks = extractWikilinks(indexContent);

  for (const page of pages) {
    const linked =
      indexLinks.some((l) => l.includes(page.slug) || l.includes(page.relPath)) ||
      pages.some((other) =>
        other.wikilinks.some((l) => l.includes(page.slug) || l === page.relPath),
      );
    if (!linked && page.type !== "qa") {
      issues.push({
        severity: "warn",
        code: "orphan_page",
        message: "孤儿页（未被 INDEX 或其他页链接）",
        file: page.relPath,
      });
    }
  }

  let fixed = 0;
  if (options.apply) {
    for (const issue of issues.filter((i) => i.fixable && i.file)) {
      const content = await readWikiPageContent(workspaceRoot, issue.file);
      if (!content) continue;

      if (issue.code === "broken_wikilink") {
        const link = issue.message.match(/\[\[(.+?)\]\]/)?.[1];
        if (!link) continue;
        const re = new RegExp(`\\[\\[${escapeReg(link)}(?:#[^\\]|]+)?(?:\\|[^\\]]+)?\\]\\]`, "g");
        const nextBody = content.body.replace(re, "");
        await writeFile(
          path.join(paths.wiki, `${issue.file}.md`),
          serializeFrontmatter(content.meta, nextBody),
          "utf8",
        );
        fixed++;
      }

      if (issue.code === "stale_source_file") {
        const stale = issue.message.split(": ").slice(1).join(": ");
        const nextFiles = (Array.isArray(content.meta.source_files)
          ? content.meta.source_files
          : []
        ).filter((f) => String(f) !== stale);
        const meta = { ...content.meta, source_files: nextFiles };
        await writeFile(
          path.join(paths.wiki, `${issue.file}.md`),
          serializeFrontmatter(meta, content.body),
          "utf8",
        );
        fixed++;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warn").length,
      total: issues.length,
      fixed,
    },
    issues,
  };

  await writeFile(paths.lintReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ok: true, ...report };
}
