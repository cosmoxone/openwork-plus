/** @jsxImportSource react */
import { Download, Loader2, Package, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BundleInstalledEntry } from "@/app/lib/desktop-types";
import { t } from "@/i18n";

export type BundleCardProps = {
  bundle: BundleInstalledEntry;
  busy: boolean;
  error: string | null;
  onUninstall: (bundle: BundleInstalledEntry) => void;
  exportable?: boolean;
  exportBusy?: boolean;
  onExport?: (bundle: BundleInstalledEntry) => void;
};

function formatIsoDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

/**
 * Renders a single installed bundle with metadata and an Uninstall action.
 *
 * Layout follows the visual density of MCP/Skills cards (icon + title row,
 * description, footer with badge + action). Errors from uninstall are shown
 * inline so the user can see why a bundle failed to remove.
 */
export function BundleCard(props: BundleCardProps) {
  const { bundle, busy, error, onUninstall, exportable = false, exportBusy = false, onExport } =
    props;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dls-border bg-dls-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dls-border bg-dls-hover">
            <Package size={14} className="text-dls-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-dls-text">
              {bundle.name || bundle.id}
            </div>
            <div className="truncate text-[11px] text-dls-secondary">
              {bundle.id} · v{bundle.version}
            </div>
          </div>
        </div>
        {(bundle.scope === "workspace" || bundle.scope === "user") && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {t(`settings.bundles.scope_${bundle.scope}`)}
          </Badge>
        )}
      </div>

      {bundle.description && (
        <p className="line-clamp-3 text-xs text-dls-secondary">{bundle.description}</p>
      )}

      {(bundle.installedAt || bundle.targetRoot) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-dls-secondary">
          {bundle.installedAt && (
            <span>
              {t("settings.bundles.installed_on")}: {formatIsoDate(bundle.installedAt)}
            </span>
          )}
          {bundle.targetRoot && (
            <span className="truncate font-mono" title={bundle.targetRoot}>
              {bundle.targetRoot}
            </span>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-[11px]">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-end gap-1">
        {exportable && onExport && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || exportBusy}
            onClick={() => onExport(bundle)}
          >
            {exportBusy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {t("settings.bundles.export")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onUninstall(bundle)}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          {t("settings.bundles.uninstall")}
        </Button>
      </div>
    </div>
  );
}
