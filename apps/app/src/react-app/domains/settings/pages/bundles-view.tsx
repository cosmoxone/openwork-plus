/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { Loader2, Package, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { desktopBridge } from "@/app/lib/desktop";
import type {
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
import { useBundles, useInstallBundle, useUninstallBundle } from "../bundles/use-bundles";

export type BundlesViewProps = {
  /** Active workspace root; empty/null → user scope. */
  selectedWorkspaceRoot: string;
};

/**
 * Bundles settings page (MVP): list installed bundles, install from a local
 * .zip, and uninstall. Backed by `ow bundle` CLI through the desktop IPC
 * bridge. See docs/38-bundle-ui-port-design.md for the full design.
 */
export function BundlesView(props: BundlesViewProps) {
  const workspaceRoot = props.selectedWorkspaceRoot?.trim() || null;
  const { data, isPending, isError, error, refetch } = useBundles({ workspaceRoot });
  const installMutation = useInstallBundle();
  const uninstallMutation = useUninstallBundle();

  // Per-id error messages surfaced from failed uninstall attempts. Cleared
  // when the user retries or when the list refreshes.
  const [uninstallErrors, setUninstallErrors] = useState<Record<string, string>>({});

  const installed: BundleInstalledEntry[] = data?.installed ?? [];

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
        // Failure is not a throw — the IPC layer reports business errors
        // (missing deps, conflicts) via { ok: false, error } so they surface
        // as actionable UI rather than a generic toast.
        toast.error(t("settings.bundles.install_failed"), { description: result.error });
      }
    } catch (err) {
      // Network/IPC/parse failure (e.g. orchestrator binary missing).
      toast.error(t("settings.bundles.install_failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleUninstall = async (bundle: BundleInstalledEntry) => {
    setUninstallErrors((prev) => {
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
        setUninstallErrors((prev) => ({ ...prev, [bundle.id]: result.error }));
      }
    } catch (err) {
      setUninstallErrors((prev) => ({
        ...prev,
        [bundle.id]: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  const busyId = useMemo(() => {
    // Only one mutation at a time per card; tracked by checking mutation
    // variables. Both install and uninstall are sequential (one click = one
    // mutation), so we don't need a more sophisticated busy map.
    if (uninstallMutation.isPending && uninstallMutation.variables) {
      return uninstallMutation.variables.id;
    }
    return null;
  }, [uninstallMutation.isPending, uninstallMutation.variables]);

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

        {isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : t("settings.bundles.load_failed")}
            </AlertDescription>
          </Alert>
        )}

        {isPending ? (
          <div className="flex items-center justify-center py-8 text-dls-secondary">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : installed.length === 0 ? (
          <EmptyState onRefresh={() => void refetch()} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {installed.map((bundle) => (
              <BundleCard
                key={bundle.id}
                bundle={bundle}
                busy={busyId === bundle.id}
                error={uninstallErrors[bundle.id] ?? null}
                onUninstall={(b) => void handleUninstall(b)}
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
