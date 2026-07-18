import { parse, stringify } from "yaml";

export type ParsedFrontmatter = {
  data: Record<string, unknown>;
  body: string;
  /** True when the YAML block failed to parse and was treated as empty. */
  parseError?: string;
};

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, body: content };
  }
  const raw = match[1] ?? "";
  // Tolerate broken YAML: a single SKILL.md with a syntax error (e.g. an
  // unquoted colon inside description) must NOT take down the whole /skills
  // list. We log a warning and degrade to {} so downstream validation filters
  // the entry out. See cosmoxwork-docs/openworkplus/12-project/issues/01.
  let data: Record<string, unknown> = {};
  let parseError: string | undefined;
  try {
    data = (parse(raw) as Record<string, unknown>) ?? {};
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
    console.warn(
      `[frontmatter] failed to parse YAML frontmatter, treating as empty: ${parseError}`,
    );
  }
  const body = content.slice(match[0].length);
  return { data, body, parseError };
}

export function buildFrontmatter(data: Record<string, unknown>): string {
  const yaml = stringify(data).trimEnd();
  return `---\n${yaml}\n---\n`;
}
