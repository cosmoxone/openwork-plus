/**
 * OpenWork Plus public hub defaults.
 *
 * - Bundle catalog: HTTPS JSON at hub.openwork.plus
 * - Skill hub: GitHub-backed repo (served via hub.openwork.plus docs/mirror until HTTP skill catalog ships)
 */
export const OPENWORK_PLUS_HUB_SITE = "https://hub.openwork.plus";

export const OPENWORK_PLUS_BUNDLE_CATALOG_URL = `${OPENWORK_PLUS_HUB_SITE}/catalog.json`;

export type PlusSkillHubRepo = {
  owner: string;
  repo: string;
  ref: string;
};

export const OPENWORK_PLUS_SKILL_HUB_REPO: PlusSkillHubRepo = {
  owner: "comoxone",
  repo: "openwork-plus-hub",
  ref: "main",
};

export function plusSkillHubRepoKey(repo: PlusSkillHubRepo): string {
  return `${repo.owner}/${repo.repo}@${repo.ref}`;
}

export const OPENWORK_PLUS_DEFAULT_SKILL_HUB_REPO_KEY = plusSkillHubRepoKey(
  OPENWORK_PLUS_SKILL_HUB_REPO,
);
