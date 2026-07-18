/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { Download, Loader2, Package, RefreshCw, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { desktopBridge } from "@/app/lib/desktop";
import type {
  BundleCatalogEntry,
  BundleInstalledEntry,
  BundleInstallResult,
  BundlePackArgs,
  BundleUninstallResult,
} from "@/app/lib/desktop-types";
import { isDesktopRuntime } from "@/app/utils";
import { toast } from "@/components/ui/sonner";
import { t } from "@/i18n";
import {
  LayoutSectionItem,
  LayoutSectionItemDescription,
  LayoutSectionItemHeader,
  LayoutSectionItemHeaderActions,
  LayoutSectionItemTitle,
  LayoutStack,
} from "../settings-layout";
import { BundleCard } from "../bundles/components/bundle-card";
import { BundleCatalogCard } from "../bundles/components/bundle-catalog-card";
import { validateCatalogUrl } from "../bundles/catalog-url-policy";
import {
  readBundleCatalogUrl,
  readBundleInstallScope,
  useBundleCatalog,
  useBundles,
  useInstallBundle,
  useInstallFromCatalog,
  usePackBundle,
  useUninstallBundle,
  writeBundleCatalogUrl,
  writeBundleInstallScope,
} from "../bundles/use-bundles";

export type BundlesViewProps = {
  /** Active workspace root; empty/null → user scope. */
  selectedWorkspaceRoot: string;
};

type CatalogFilter = "all" | "installed" | "available";

type ExportTarget = {
  id: string;
  version: string;
  sourcePath?: string | null;
  downloadUrl?: string | null;
  bundleRoot?: string | null;
};

function catalogEntryExportable(
  entry: BundleCatalogEntry,
  _installedById: Map<string, BundleInstalledEntry>,
): boolean {
  if (!entry.installed) return false;
  return Boolean(entry.sourcePath || entry.downloadUrl);
}

function installedEntryExportable(
  bundle: BundleInstalledEntry,
  catalogById: Map<string, BundleCatalogEntry>,
): boolean {
  const catalog = catalogById.get(bundle.id);
  return Boolean(catalog?.sourcePath || catalog?.downloadUrl);
}

function buildExportTarget(
  entry: Pick<
    BundleCatalogEntry,
    "id" | "version" | "sourcePath" | "downloadUrl"
  >,
  installed?: BundleInstalledEntry | null,
): ExportTarget {
  const hasCatalogSource = Boolean(entry.sourcePath || entry.downloadUrl);
  return {
    id: entry.id,
    version: installed?.version ?? entry.version,
    sourcePath: entry.sourcePath ?? null,
    downloadUrl: entry.downloadUrl ?? null,
    // Staged install dir (vendor/scripts) is not a packable bundle tree.
    bundleRoot: hasCatalogSource ? null : (installed?.bundleRoot ?? null),
  };
}

function buildPackArgs(target: ExportTarget, output: string): BundlePackArgs {
  // Prefer catalog resolution — install receipt bundleRoot is runtime-only.
  if (target.sourcePath || target.downloadUrl) {
    return {
      catalogEntry: {
        id: target.id,
        version: target.version,
        sourcePath: target.sourcePath ?? null,
        downloadUrl: target.downloadUrl ?? null,
      },
      installedId: target.id,
      output,
    };
  }
  if (target.bundleRoot) {
    return { bundleDir: target.bundleRoot, output };
  }
  return { installedId: target.id, output };
}

/**
 * Bundles settings page (P2.1): catalog browse + installed list + zip install.
 * Filter tabs switch between catalog view (all/installed/available) and the
 * action bar still offers the zip install escape hatch. Backed by `ow bundle`
 * CLI through the desktop IPC bridge. See docs/38-bundle-ui-port-design.md.
 */
export function BundlesView(props: BundlesViewProps) {
  const workspaceRoot = props.selectedWorkspaceRoot?.trim() || null;

  // P2.2: persisted remote catalog URL (localStorage-backed user preference).
  // `savedRemoteUrl` is what we actually feed into the query; `draftUrl` is
  // what the user is currently typing before pressing [Save].
  const [savedRemoteUrl, setSavedRemoteUrl] = useState<string | null>(() => readBundleCatalogUrl());
  const [draftUrl, setDraftUrl] = useState<string>(() => readBundleCatalogUrl() ?? "");

  // P2.5: persisted install scope. "workspace" → install into this workspace;
  // "user" → install into user-global scope (workspaceRoot passed as null).
  const [installScope, setInstallScope] = useState<"workspace" | "user">(() => readBundleInstallScope());
  // Resolve effective workspaceRoot for install/uninstall based on scope.
  const effectiveWorkspaceRoot = installScope === "workspace" ? workspaceRoot : null;

  // Installed list + catalog merge always use the **selected workspace** so the
  // user sees the full picture for this workspace. Install/uninstall alone
  // respect the scope radio (effectiveWorkspaceRoot). See
  // cosmoxwork-docs/.../2026-07-18-n6-bundle-phase2-issues-and-decisions.md.
  const bundlesQuery = useBundles({ workspaceRoot });
  const catalogQuery = useBundleCatalog({ workspaceRoot, remoteUrl: savedRemoteUrl });

  const installMutation = useInstallBundle();
  const installFromCatalogMutation = useInstallFromCatalog();
  const packMutation = usePackBundle();
  const uninstallMutation = useUninstallBundle();

  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const installed: BundleInstalledEntry[] = bundlesQuery.data?.installed ?? [];
  const catalogEntries: BundleCatalogEntry[] = catalogQuery.data?.entries ?? [];
  const catalogStale = catalogQuery.data?.stale === true;
  const catalogError = catalogQuery.data?.error ?? null;

  const visibleEntries = useMemo(() => {
    if (filter === "installed") return catalogEntries.filter((e) => e.installed);
    if (filter === "available") return catalogEntries.filter((e) => !e.installed);
    return catalogEntries;
  }, [catalogEntries, filter]);

  const updateCount = useMemo(
    () => catalogEntries.filter((e) => e.status === "update_available").length,
    [catalogEntries],
  );

  const installedById = useMemo(
    () => new Map(installed.map((bundle) => [bundle.id, bundle])),
    [installed],
  );
  const catalogById = useMemo(
    () => new Map(catalogEntries.map((entry) => [entry.id, entry])),
    [catalogEntries],
  );

  const exportBusyId = packMutation.isPending
    ? packMutation.variables?.catalogEntry?.id ??
      packMutation.variables?.installedId ??
      null
    : null;

  const handleInstallFromZip = async (fromDirectory = false) => {
    try {
      const picked = await desktopBridge.bundlePickFile(
        fromDirectory
          ? {
              directory: true,
              title: t("settings.bundles.install_pick_folder_title"),
            }
          : {
              extensions: ["zip"],
              title: t("settings.bundles.install_pick_zip_title"),
            },
      );
      if (picked.canceled) return;
      const result: BundleInstallResult = await installMutation.mutateAsync({
        source: picked.filePath,
        workspaceRoot: effectiveWorkspaceRoot,
      });
      if (result.ok) {
        toast.success(
          t("settings.bundles.install_succeeded", { id: result.id, version: result.version }),
        );
      } else {
        toast.error(t("settings.bundles.install_failed"), { description: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t("settings.bundles.install_failed"), { description: msg });
    }
  };

  /** Install or update directly from a builtin/remote catalog entry. */
  const handleInstallFromCatalog = async (entry: BundleCatalogEntry, replace = false) => {
    // Clear any previous error for this id.
    setActionErrors((prev) => {
      if (!prev[entry.id]) return prev;
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });
    try {
      const result = await installFromCatalogMutation.mutateAsync({
        entry: {
          id: entry.id,
          sourcePath: entry.sourcePath ?? null,
          downloadUrl: entry.downloadUrl ?? null,
        },
        workspaceRoot: effectiveWorkspaceRoot,
        replace,
      });
      if (result.ok) {
        toast.success(
          replace
            ? t("settings.bundles.update_succeeded", { id: result.id, version: result.version })
            : t("settings.bundles.install_succeeded", { id: result.id, version: result.version }),
        );
      } else {
        setActionErrors((prev) => ({ ...prev, [entry.id]: result.error }));
        toast.error(
          replace ? t("settings.bundles.update_failed") : t("settings.bundles.install_failed"),
          { description: result.error },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionErrors((prev) => ({ ...prev, [entry.id]: msg }));
      toast.error(
        replace ? t("settings.bundles.update_failed") : t("settings.bundles.install_failed"),
        { description: msg },
      );
    }
  };

  const handleUninstall = async (bundle: { id: string }) => {
    setActionErrors((prev) => {
      if (!prev[bundle.id]) return prev;
      const next = { ...prev };
      delete next[bundle.id];
      return next;
    });
    try {
      const result: BundleUninstallResult = await uninstallMutation.mutateAsync({
        id: bundle.id,
        workspaceRoot: effectiveWorkspaceRoot,
      });
      if (result.ok) {
        toast.success(t("settings.bundles.uninstall_succeeded", { id: result.id }));
      } else {
        setActionErrors((prev) => ({ ...prev, [bundle.id]: result.error }));
      }
    } catch (err) {
      setActionErrors((prev) => ({
        ...prev,
        [bundle.id]: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  const handleSaveRemoteUrl = () => {
    const trimmed = draftUrl.trim();
    let normalizedUrl: string | null = null;
    if (trimmed) {
      const validation = validateCatalogUrl(trimmed, {
        allowInsecure: import.meta.env.DEV,
      });
      if (!validation.ok) {
        toast.error(t(`settings.bundles.remote_url_invalid_${validation.reason}`));
        return;
      }
      normalizedUrl = validation.normalizedUrl;
    }
    writeBundleCatalogUrl(normalizedUrl);
    setDraftUrl(normalizedUrl ?? "");
    setSavedRemoteUrl(normalizedUrl);
    toast.success(
      normalizedUrl
        ? t("settings.bundles.remote_url_saved")
        : t("settings.bundles.remote_url_cleared"),
    );
  };

  const formatExportError = (message: string) => {
    const needsRestart =
      message.includes("args.bundleDir") ||
      message.includes("bundleDir, catalogEntry, or installedId");
    return needsRestart ? `${message} ${t("settings.bundles.export_restart_hint")}` : message;
  };

  const runExportPack = async (target: ExportTarget) => {
    try {
      const pickedOutput = await desktopBridge.bundlePickSave({
        defaultFileName: `${target.id}-${target.version}.zip`,
        title: t("settings.bundles.export_save_title"),
      });
      if (pickedOutput.canceled) return;

      const result = await packMutation.mutateAsync(
        buildPackArgs(target, pickedOutput.filePath),
      );
      if (result.ok) {
        toast.success(
          t("settings.bundles.export_succeeded", {
            id: result.id,
            version: result.version,
          }),
          { description: result.output },
        );
      } else {
        toast.error(t("settings.bundles.export_failed"), {
          description: formatExportError(result.error),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t("settings.bundles.export_failed"), {
        description: formatExportError(message),
      });
    }
  };

  const handleExportCatalogEntry = (entry: BundleCatalogEntry) => {
    if (!entry.installed) return;
    if (!catalogEntryExportable(entry, installedById)) {
      toast.error(t("settings.bundles.export_failed"), {
        description: t("settings.bundles.no_export_hint"),
      });
      return;
    }
    void runExportPack(
      buildExportTarget(entry, installedById.get(entry.id) ?? null),
    );
  };

  const handleExportInstalled = (bundle: BundleInstalledEntry) => {
    if (!installedEntryExportable(bundle, catalogById)) {
      toast.error(t("settings.bundles.export_failed"), {
        description: t("settings.bundles.no_export_hint"),
      });
      return;
    }
    const catalog = catalogById.get(bundle.id);
    void runExportPack(
      buildExportTarget(
        {
          id: bundle.id,
          version: bundle.version,
          sourcePath: catalog?.sourcePath ?? null,
          downloadUrl: catalog?.downloadUrl ?? null,
        },
        bundle,
      ),
    );
  };

  /** Advanced: pick a bundle source folder manually (must contain a manifest). */
  const handleExportFromFolder = async () => {
    try {
      const pickedDirectory = await desktopBridge.bundlePickFile({
        directory: true,
        title: t("settings.bundles.export_pick_source_title"),
      });
      if (pickedDirectory.canceled) return;

      const pickedOutput = await desktopBridge.bundlePickSave({
        defaultFileName: "bundle.zip",
        title: t("settings.bundles.export_save_title"),
      });
      if (pickedOutput.canceled) return;

      const result = await packMutation.mutateAsync({
        bundleDir: pickedDirectory.filePath,
        output: pickedOutput.filePath,
      });
      if (result.ok) {
        toast.success(
          t("settings.bundles.export_succeeded", {
            id: result.id,
            version: result.version,
          }),
          { description: result.output },
        );
      } else {
        toast.error(t("settings.bundles.export_failed"), {
          description: formatExportError(result.error),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t("settings.bundles.export_failed"), {
        description: formatExportError(message),
      });
    }
  };

  const busyId = useMemo(() => {
    if (installMutation.isPending && installMutation.variables) {
      return (installMutation.variables as { source?: string }).source ?? null;
    }
    if (installFromCatalogMutation.isPending && installFromCatalogMutation.variables) {
      return installFromCatalogMutation.variables.entry?.id ?? null;
    }
    if (uninstallMutation.isPending && uninstallMutation.variables) {
      return uninstallMutation.variables.id;
    }
    return null;
  }, [
    installMutation.isPending,
    installMutation.variables,
    installFromCatalogMutation.isPending,
    installFromCatalogMutation.variables,
    uninstallMutation.isPending,
    uninstallMutation.variables,
  ]);

  const loading = bundlesQuery.isPending || catalogQuery.isPending;

  return (
    <LayoutStack>
      {!isDesktopRuntime() && (
        <Alert>
          <AlertTitle>{t("settings.bundles.requires_desktop_title")}</AlertTitle>
          <AlertDescription>{t("settings.bundles.requires_desktop")}</AlertDescription>
        </Alert>
      )}

      <LayoutSectionItem>
        <LayoutSectionItemHeader>
          <LayoutSectionItemTitle>{t("settings.bundles.title")}</LayoutSectionItemTitle>
          <LayoutSectionItemDescription>
            {t("settings.bundles.description")}
          </LayoutSectionItemDescription>
          <LayoutSectionItemHeaderActions>
            <Button
              variant="outline"
              size="sm"
              disabled={!isDesktopRuntime() || installMutation.isPending}
              onClick={() => void handleInstallFromZip(false)}
            >
              {installMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {t("settings.bundles.install_from_zip")}
            </Button>
            {/* P2.5: directory install — pick an unzipped bundle folder. */}
            <Button
              variant="outline"
              size="sm"
              disabled={!isDesktopRuntime() || installMutation.isPending}
              onClick={() => void handleInstallFromZip(true)}
            >
              <Upload size={12} />
              {t("settings.bundles.install_from_dir")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!isDesktopRuntime() || catalogQuery.isFetching}
              onClick={() => void catalogQuery.refetch()}
            >
              <RefreshCw
                size={12}
                className={catalogQuery.isFetching ? "animate-spin" : undefined}
              />
              {t("settings.bundles.check_updates")}
            </Button>
          </LayoutSectionItemHeaderActions>
        </LayoutSectionItemHeader>

        {/* Filter tabs (segmented control). Simple inline implementation to
            avoid pulling in a shadcn Tabs dependency; same a11y semantics as
            a button group with aria-pressed. */}
        <div className="flex items-center gap-1 rounded-lg border border-dls-border bg-dls-surface p-1">
          {(["all", "installed", "available"] as const).map((key) => {
            const isOn = filter === key;
            const label = t(`settings.bundles.filter_${key}`);
            const badge =
              key === "installed"
                ? installed.length
                : key === "available"
                  ? catalogEntries.length - installed.length
                  : catalogEntries.length;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isOn}
                onClick={() => setFilter(key)}
                className={
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-colors " +
                  (isOn
                    ? "bg-dls-hover text-dls-text"
                    : "text-dls-secondary hover:text-dls-text")
                }
              >
                {label}
                <span className="rounded bg-dls-hover px-1 text-[10px] text-dls-secondary">
                  {badge}
                </span>
                {key === "all" && updateCount > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                    {updateCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {catalogStale && (
          <Alert>
            <AlertDescription>{t("settings.bundles.catalog_stale")}</AlertDescription>
          </Alert>
        )}
        {catalogError && !catalogStale && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("settings.bundles.catalog_error")}: {catalogError}
            </AlertDescription>
          </Alert>
        )}

        {/* P2.2: Remote catalog URL (private hub). Persisted in localStorage.
            Editing the input does NOT trigger refetch — user must press Save
            (or Clear) to commit, so partial URLs don't cause a flood of
            failing requests. */}
        <details className="rounded-md border border-dls-border bg-dls-surface px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none text-dls-secondary">
            {t("settings.bundles.remote_url_advanced")}
          </summary>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="url"
              value={draftUrl}
              placeholder={t("settings.bundles.remote_url_placeholder")}
              onChange={(e) => setDraftUrl(e.target.value)}
              className="h-8 text-xs sm:flex-1"
              spellCheck={false}
              autoComplete="off"
            />
            <div className="flex items-center gap-1">
              <Button size="sm" variant="default" onClick={handleSaveRemoteUrl}>
                {t("settings.bundles.remote_url_save")}
              </Button>
              {savedRemoteUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraftUrl("");
                    writeBundleCatalogUrl(null);
                    setSavedRemoteUrl(null);
                  }}
                >
                  {t("settings.bundles.remote_url_clear")}
                </Button>
              )}
            </div>
          </div>
          {savedRemoteUrl && (
            <p className="mt-2 text-[11px] text-dls-secondary">
              {t("settings.bundles.remote_url_active", { url: savedRemoteUrl })}
            </p>
          )}
          {/* P2.5: install scope. Persists across sessions (per-user UI pref). */}
          <div className="mt-3 flex items-center gap-3 border-t border-dls-border pt-2">
            <span className="text-[11px] text-dls-secondary">
              {t("settings.bundles.scope_label")}
            </span>
            <label className="flex items-center gap-1 text-[11px]">
              <input
                type="radio"
                name="bundle-install-scope"
                value="workspace"
                checked={installScope === "workspace"}
                onChange={() => {
                  setInstallScope("workspace");
                  writeBundleInstallScope("workspace");
                }}
              />
              {t("settings.bundles.scope_workspace")}
            </label>
            <label className="flex items-center gap-1 text-[11px]">
              <input
                type="radio"
                name="bundle-install-scope"
                value="user"
                checked={installScope === "user"}
                onChange={() => {
                  setInstallScope("user");
                  writeBundleInstallScope("user");
                }}
              />
              {t("settings.bundles.scope_user")}
            </label>
            <span className="text-[10px] text-dls-secondary/70">
              {installScope === "workspace"
                ? (workspaceRoot || t("settings.bundles.scope_no_workspace"))
                : t("settings.bundles.scope_user_hint")}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-dls-border pt-2">
            <p className="text-[11px] text-dls-secondary">
              {t("settings.bundles.export_from_folder_hint")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={!isDesktopRuntime() || packMutation.isPending}
              onClick={() => void handleExportFromFolder()}
            >
              {packMutation.isPending && !exportBusyId ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              {t("settings.bundles.export_from_folder")}
            </Button>
          </div>
        </details>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-dls-secondary">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : filter === "installed" && installed.length === 0 ? (
          <EmptyState onRefresh={() => void bundlesQuery.refetch()} />
        ) : visibleEntries.length === 0 ? (
          <EmptyState onRefresh={() => void catalogQuery.refetch()} />
        ) : filter === "installed" ? (
          // Installed tab uses the legacy card (shows install date / target root).
          <div className="grid gap-3 md:grid-cols-2">
            {installed.map((bundle) => (
              <BundleCard
                key={bundle.id}
                bundle={bundle}
                busy={busyId === bundle.id}
                error={actionErrors[bundle.id] ?? null}
                exportable={installedEntryExportable(bundle, catalogById)}
                exportBusy={exportBusyId === bundle.id}
                onExport={handleExportInstalled}
                onUninstall={(b) => void handleUninstall(b)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visibleEntries.map((entry) => (
              <BundleCatalogCard
                key={entry.id}
                entry={entry}
                busy={busyId === entry.id}
                error={actionErrors[entry.id] ?? null}
                exportable={catalogEntryExportable(entry, installedById)}
                exportBusy={exportBusyId === entry.id}
                onExport={handleExportCatalogEntry}
                onInstall={(e) => void handleInstallFromCatalog(e)}
                onUpdate={(e) => {
                  if (
                    window.confirm(
                      t("settings.bundles.update_confirm", {
                        id: e.id,
                        version: e.version,
                      }),
                    )
                  ) {
                    void handleInstallFromCatalog(e, true);
                  }
                }}
                onUninstall={(e) => void handleUninstall({ id: e.id })}
              />
            ))}
          </div>
        )}
      </LayoutSectionItem>
    </LayoutStack>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-dls-border bg-dls-surface py-10 text-center">
      <Package size={24} className="text-dls-secondary" />
      <div className="space-y-1">
        <div className="text-[13px] font-medium text-dls-text">
          {t("settings.bundles.empty_title")}
        </div>
        <div className="text-[11px] text-dls-secondary">
          {t("settings.bundles.empty_hint")}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onRefresh}>
        {t("settings.bundles.refresh")}
      </Button>
    </div>
  );
}
