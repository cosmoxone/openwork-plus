/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { Loader2, Package, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { desktopBridge } from "@/app/lib/desktop";
import type {
  BundleCatalogEntry,
  BundleInstalledEntry,
  BundleInstallResult,
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
import { useBundleCatalog, useBundles, useInstallBundle, useUninstallBundle } from "../bundles/use-bundles";

export type BundlesViewProps = {
  /** Active workspace root; empty/null → user scope. */
  selectedWorkspaceRoot: string;
};

type CatalogFilter = "all" | "installed" | "available";

/**
 * Bundles settings page (P2.1): catalog browse + installed list + zip install.
 * Filter tabs switch between catalog view (all/installed/available) and the
 * action bar still offers the zip install escape hatch. Backed by `ow bundle`
 * CLI through the desktop IPC bridge. See docs/38-bundle-ui-port-design.md.
 */
export function BundlesView(props: BundlesViewProps) {
  const workspaceRoot = props.selectedWorkspaceRoot?.trim() || null;

  // Installed list (used by "Installed" tab and to refresh catalog status).
  const bundlesQuery = useBundles({ workspaceRoot });
  // Catalog (builtin + installed merge); refetches when bundles invalidate.
  const catalogQuery = useBundleCatalog({ workspaceRoot });

  const installMutation = useInstallBundle();
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

  const handleInstallFromZip = async () => {
    try {
      const picked = await desktopBridge.bundlePickFile({ extensions: ["zip"] });
      if (picked.canceled) return;
      const result: BundleInstallResult = await installMutation.mutateAsync({
        source: picked.filePath,
        workspaceRoot,
      });
      if (result.ok) {
        toast.success(
          t("settings.bundles.install_succeeded", { id: result.id, version: result.version }),
        );
      } else {
        toast.error(t("settings.bundles.install_failed"), { description: result.error });
      }
    } catch (err) {
      toast.error(t("settings.bundles.install_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /** Install a catalog entry by routing it through zip install if a builtin
   * bundle zip is available, otherwise prompting the user. For MVP+catalog we
   * rely on the orchestrator being able to install from the bundle directory
   * when source is "builtin" — but we don't yet have a stable mapping from
   * catalog id to on-disk path, so we surface a TODO toast and fall back to
   * the zip flow. P2.5 will add directory install. */
  const handleInstallFromCatalog = async (entry: BundleCatalogEntry) => {
    // Builtin bundles currently ship as sources under <repo>/bundles/<id>/.
    // In dev that path exists; in packaged builds we'd need a separate
    // mechanism. For now, surface the limitation honestly.
    toast.error(t("settings.bundles.catalog_install_unavailable_title"), {
      description: t("settings.bundles.catalog_install_unavailable_hint", { id: entry.id }),
    });
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
        workspaceRoot,
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

  const busyId = useMemo(() => {
    if (installMutation.isPending && installMutation.variables) {
      return (installMutation.variables as { source?: string }).source ?? null;
    }
    if (uninstallMutation.isPending && uninstallMutation.variables) {
      return uninstallMutation.variables.id;
    }
    return null;
  }, [installMutation.isPending, installMutation.variables, uninstallMutation.isPending, uninstallMutation.variables]);

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
              onClick={() => void handleInstallFromZip()}
            >
              {installMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {t("settings.bundles.install_from_zip")}
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
                onInstall={(e) => void handleInstallFromCatalog(e)}
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
