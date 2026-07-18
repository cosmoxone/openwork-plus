/**
 * React Query hooks wrapping the bundle IPC bridge (bundleList/Install/Uninstall/Catalog).
 *
 * The IPC layer is a Proxy on `desktopBridge`, so per-command invokers are
 * typed via DesktopCommandMap (see packages/types/src/desktop-ipc.ts). All
 * commands return discriminated unions for install/uninstall — the caller
 * must narrow `ok` before reading success fields.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { desktopBridge } from "@/app/lib/desktop";
import type {
  BundleCatalogArgs,
  BundleCatalogResult,
  BundleInstallArgs,
  BundleInstallFromCatalogArgs,
  BundleInstallResult,
  BundleListOptions,
  BundleListResult,
  BundleUninstallArgs,
  BundleUninstallResult,
} from "@/app/lib/desktop-types";
import { isDesktopRuntime } from "@/app/utils";

export const bundlesQueryKey = (workspaceRoot: string | null) =>
  ["bundles", "list", workspaceRoot ?? "user"] as const;

export const bundleCatalogQueryKey = (workspaceRoot: string | null, remoteUrl: string | null) =>
  ["bundles", "catalog", workspaceRoot ?? "user", remoteUrl ?? "builtin"] as const;

/**
 * Fetch installed bundles. When `workspaceRoot` is null/empty, the orchestrator
 * resolves user scope; otherwise it lists workspace-scoped bundles for that root.
 *
 * `enabled: isDesktopRuntime()` keeps the query from firing outside the
 * desktop runtime (web/preview) where IPC would throw.
 */
export function useBundles(options: BundleListOptions = {}) {
  const workspaceRoot =
    typeof options.workspaceRoot === "string" && options.workspaceRoot.trim()
      ? options.workspaceRoot.trim()
      : null;
  return useQuery<BundleListResult>({
    queryKey: bundlesQueryKey(workspaceRoot),
    queryFn: () => desktopBridge.bundleList({ workspaceRoot }),
    enabled: isDesktopRuntime(),
    // Bundle list changes only after install/uninstall mutations call
    // invalidateQueries; staleTime is set high so background refetches don't
    // run on window focus and reset the UI mid-interaction.
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Install a bundle from a local path (.zip or directory).
 * On success, invalidates the bundles query so the list refreshes.
 */
export function useInstallBundle() {
  const qc = useQueryClient();
  return useMutation<BundleInstallResult, Error, BundleInstallArgs>({
    mutationFn: (args) => desktopBridge.bundleInstall(args),
    onSuccess: (result) => {
      // Only invalidate on success; failure keeps the list stable so the
      // caller can show the error alongside current state.
      if (result.ok) {
        void qc.invalidateQueries({ queryKey: ["bundles"] });
      }
    },
  });
}

/**
 * P2.3+: Install or update a bundle directly from a catalog entry. Resolves
 * the entry to a local source on the main-process side (builtin path or
 * remote download), then runs install. Used by the catalog card's
 * [Install] / [Update] buttons so users no longer need to manually pick a
 * zip when the bundle is already in the catalog.
 *
 * Caller must pass `replace: true` for the update flow.
 */
export function useInstallFromCatalog() {
  const qc = useQueryClient();
  return useMutation<BundleInstallResult, Error, BundleInstallFromCatalogArgs>({
    mutationFn: (args) => desktopBridge.bundleInstallFromCatalog(args),
    onSuccess: (result) => {
      if (result.ok) {
        void qc.invalidateQueries({ queryKey: ["bundles"] });
      }
    },
  });
}

/**
 * Uninstall a bundle by id.
 * Same invalidation pattern as install.
 */
export function useUninstallBundle() {
  const qc = useQueryClient();
  return useMutation<BundleUninstallResult, Error, BundleUninstallArgs>({
    mutationFn: (args) => desktopBridge.bundleUninstall(args),
    onSuccess: (result) => {
      if (result.ok) {
        void qc.invalidateQueries({ queryKey: ["bundles"] });
      }
    },
  });
}

/**
 * Fetch the bundle catalog (builtin + installed merge). P2.1: builtin only
 * unless `remoteUrl` is provided (P2.2 will wire the URL input).
 *
 * Stays in the same ["bundles", ...] query namespace so install/uninstall
 * mutations invalidate it automatically alongside the installed list.
 */
export function useBundleCatalog(options: BundleCatalogArgs = {}) {
  const workspaceRoot =
    typeof options.workspaceRoot === "string" && options.workspaceRoot.trim()
      ? options.workspaceRoot.trim()
      : null;
  const remoteUrl =
    typeof options.remoteUrl === "string" && options.remoteUrl.trim()
      ? options.remoteUrl.trim()
      : null;
  return useQuery<BundleCatalogResult>({
    queryKey: bundleCatalogQueryKey(workspaceRoot, remoteUrl),
    queryFn: () => desktopBridge.bundleCatalog({ workspaceRoot, remoteUrl }),
    enabled: isDesktopRuntime(),
    staleTime: Infinity,
    retry: false,
  });
}
