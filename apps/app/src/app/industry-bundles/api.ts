import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils";
import { pickDirectory, pickFile } from "../lib/tauri";
import { currentLocale, t } from "../../i18n";
import { getIndustryBundleCatalogUrl } from "./catalog-url";
import {
  e2eInstallIndustryBundleFromCatalog,
  e2eListIndustryBundleCatalog,
  e2eReadIndustryBundleUiManifest,
  e2eUninstallIndustryBundle,
  isIndustryBundleE2E,
} from "./e2e-api";
import type {
  IndustryBundleCatalogEntry,
  IndustryBundleInstallResult,
  IndustryBundleUiManifest,
} from "./types";

export type {
  IndustryBundleCatalogEntry,
  IndustryBundleInstallResult,
  IndustryBundleUiManifest,
} from "./types";

function catalogUrlOverride(remoteUrl?: string): string | null {
  const explicit = remoteUrl?.trim() || getIndustryBundleCatalogUrl();
  return explicit || null;
}

export async function readIndustryBundleUiManifest(
  workspacePath: string,
): Promise<IndustryBundleUiManifest> {
  if (isIndustryBundleE2E()) return e2eReadIndustryBundleUiManifest();
  if (!isTauriRuntime()) return { bundles: [] };
  return invoke<IndustryBundleUiManifest>("industry_bundle_read_ui_manifest", {
    workspacePath,
  });
}

export async function listIndustryBundleCatalog(
  workspacePath: string,
  remoteUrl?: string,
): Promise<IndustryBundleCatalogEntry[]> {
  if (isIndustryBundleE2E()) return e2eListIndustryBundleCatalog(catalogUrlOverride(remoteUrl) ?? undefined);
  if (!isTauriRuntime()) return [];
  return invoke<IndustryBundleCatalogEntry[]>("industry_bundle_list_catalog", {
    workspacePath,
    dataDir: null,
    remoteUrl: catalogUrlOverride(remoteUrl),
  });
}

export async function installIndustryBundleFromCatalog(
  workspacePath: string,
  bundleId: string,
  replace = false,
  remoteUrl?: string,
): Promise<IndustryBundleInstallResult> {
  if (isIndustryBundleE2E()) {
    return e2eInstallIndustryBundleFromCatalog(bundleId, replace, catalogUrlOverride(remoteUrl) ?? undefined);
  }
  return invoke<IndustryBundleInstallResult>("industry_bundle_install_from_catalog", {
    workspacePath,
    bundleId,
    dataDir: null,
    remoteUrl: catalogUrlOverride(remoteUrl),
    replace,
  });
}

/** @deprecated 优先使用 installIndustryBundleFromCatalog */
export async function installIndustryBundleBuiltin(
  workspacePath: string,
  bundleId: string,
  replace = false,
): Promise<IndustryBundleInstallResult> {
  return installIndustryBundleFromCatalog(workspacePath, bundleId, replace);
}

export async function installIndustryBundleFromPath(
  workspacePath: string,
  source: string,
  replace = false,
): Promise<IndustryBundleInstallResult> {
  return invoke<IndustryBundleInstallResult>("industry_bundle_install", {
    workspacePath,
    source,
    dataDir: null,
    replace,
  });
}

export async function uninstallIndustryBundle(bundleId: string): Promise<void> {
  if (isIndustryBundleE2E()) {
    await e2eUninstallIndustryBundle(bundleId);
    return;
  }
  await invoke("industry_bundle_uninstall", {
    bundleId,
    dataDir: null,
  });
}

export async function pickBundleZipFile(): Promise<string | null> {
  const picked = await pickFile({
    title: t("bundles.pick_zip_title", currentLocale()),
    filters: [{ name: "Industry Bundle", extensions: ["zip"] }],
  });
  if (!picked || Array.isArray(picked)) return null;
  return picked;
}

export async function pickBundleDirectory(): Promise<string | null> {
  const picked = await pickDirectory({ title: t("bundles.pick_folder_title", currentLocale()) });
  if (!picked || Array.isArray(picked)) return null;
  return picked;
}

export async function checkIndustryBundleUpdates(
  workspacePath: string,
  remoteUrl?: string,
): Promise<IndustryBundleCatalogEntry[]> {
  if (isIndustryBundleE2E()) return e2eListIndustryBundleCatalog(catalogUrlOverride(remoteUrl) ?? undefined);
  if (!isTauriRuntime()) return [];
  return invoke<IndustryBundleCatalogEntry[]>("industry_bundle_check_updates", {
    workspacePath,
    dataDir: null,
    remoteUrl: catalogUrlOverride(remoteUrl),
  });
}
