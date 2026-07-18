/** @jsxImportSource react */
import { Loader2, Package, Trash2, Download, ArrowUpCircle, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BundleCatalogEntry } from "@/app/lib/desktop-types";
import { t } from "@/i18n";

export type BundleCatalogCardProps = {
  entry: BundleCatalogEntry;
  /** Install/uninstall/update in progress for this id. */
  busy: boolean;
  /** Per-id error message surfaced from a failed action. */
  error: string | null;
  /** P2.3: real install handler (no longer a toast stub). */
  onInstall: (entry: BundleCatalogEntry) => void;
  /** P2.3: real update handler (replace: true install). Falls back to onInstall. */
  onUpdate?: (entry: BundleCatalogEntry) => void;
  onUninstall: (entry: BundleCatalogEntry) => void;
};

/**
 * Renders a catalog entry (builtin/remote) with status-aware action button.
 *
 * States:
 *  - status === "available"      → [Install] (primary)
 *  - status === "installed"      → [Uninstall] (outline)
 *  - status === "update_available" → [Update] (primary, with badge)
 *
 * Layout mirrors BundleCard so the two can coexist visually.
 */
export function BundleCatalogCard(props: BundleCatalogCardProps) {
  const { entry, busy, error, onInstall, onUpdate, onUninstall } = props;
  const featured = entry.featured === true;
  // P2.3: when entry has no installable source, the action is disabled and
  // the user must fall back to "Install from zip" with a manually-provided
  // archive. This is now a UI signal rather than a hard error.
  const canInstallDirectly = Boolean(entry.sourcePath || entry.downloadUrl);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dls-border bg-dls-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dls-border bg-dls-hover">
            <Package size={14} className="text-dls-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-dls-text">
                {entry.name || entry.id}
              </span>
              {featured && (
                <Star size={11} className="shrink-0 fill-amber-400 text-amber-500" />
              )}
            </div>
            <div className="truncate text-[11px] text-dls-secondary">
              {entry.id} · v{entry.version}
              {entry.installedVersion && entry.installedVersion !== entry.version && (
                <span className="ml-1 text-dls-secondary/70">
                  ({t("settings.bundles.installed")}: v{entry.installedVersion})
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="outline" className="text-[10px]">
            {t(`settings.bundles.source_${entry.source}`)}
          </Badge>
        </div>
      </div>

      {entry.description && (
        <p className="line-clamp-3 text-xs text-dls-secondary">{entry.description}</p>
      )}

      {entry.keywords && entry.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.keywords.slice(0, 4).map((kw) => (
            <Badge key={kw} variant="secondary" className="text-[10px] font-normal">
              {kw}
            </Badge>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-end gap-1">
        {entry.status === "installed" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onUninstall(entry)}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            {t("settings.bundles.uninstall")}
          </Button>
        )}
        {entry.status === "available" && (
          <Button
            variant="default"
            size="sm"
            disabled={busy || !canInstallDirectly}
            title={!canInstallDirectly ? t("settings.bundles.no_direct_install_hint") : undefined}
            onClick={() => onInstall(entry)}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {canInstallDirectly ? t("settings.bundles.install") : t("settings.bundles.zip_only")}
          </Button>
        )}
        {entry.status === "update_available" && (
          <Button
            variant="default"
            size="sm"
            disabled={busy || !canInstallDirectly}
            title={!canInstallDirectly ? t("settings.bundles.no_direct_install_hint") : undefined}
            onClick={() => (onUpdate ?? onInstall)(entry)}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpCircle size={12} />}
            {canInstallDirectly ? t("settings.bundles.update") : t("settings.bundles.zip_only")}
          </Button>
        )}
      </div>
    </div>
  );
}
