/** 场景包 / Industry Bundle 管理页（Settings › Bundles） */
import { createMemo, createSignal, For, Show, onMount } from "solid-js";
import { Package, RefreshCw, Upload, Trash2, Sparkles, ChevronRight } from "lucide-solid";

import Button from "../components/button";
import { useConnections } from "../connections/provider";
import { isTauriRuntime } from "../utils";
import { isIndustryBundleE2E } from "../industry-bundles/e2e-api";
import {
  checkIndustryBundleUpdates,
  installIndustryBundleFromCatalog,
  installIndustryBundleFromPath,
  listIndustryBundleCatalog,
  pickBundleDirectory,
  pickBundleZipFile,
  uninstallIndustryBundle,
  type IndustryBundleCatalogEntry,
} from "../industry-bundles/api";
import {
  DEFAULT_DEV_CATALOG_URL,
  getIndustryBundleCatalogUrl,
  setIndustryBundleCatalogUrl,
} from "../industry-bundles/catalog-url";
import { currentLocale, t } from "../../i18n";

export type BundlesViewProps = {
  selectedWorkspaceRoot: string;
  busy?: boolean;
  showHeader?: boolean;
};

type Filter = "all" | "installed" | "available" | "updates";

export default function BundlesView(props: BundlesViewProps) {
  const connections = useConnections();
  const translate = (key: string, params?: Record<string, string | number>) =>
    t(key, currentLocale(), params);
  const [entries, setEntries] = createSignal<IndustryBundleCatalogEntry[]>([]);
  const [filter, setFilter] = createSignal<Filter>("all");
  const [loading, setLoading] = createSignal(false);
  const [actionBusy, setActionBusy] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");
  const [catalogUrl, setCatalogUrl] = createSignal(getIndustryBundleCatalogUrl() ?? "");
  const [advancedOpen, setAdvancedOpen] = createSignal(false);

  const workspacePath = () => props.selectedWorkspaceRoot.trim();
  const remoteCatalogUrl = () => catalogUrl().trim() || undefined;
  const hostReady = () => isTauriRuntime() || isIndustryBundleE2E();

  const reload = async () => {
    if (!hostReady() || !workspacePath()) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const list = await listIndustryBundleCatalog(workspacePath(), remoteCatalogUrl());
      setEntries(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void reload();
  });

  const filtered = createMemo(() => {
    const list = entries();
    switch (filter()) {
      case "installed":
        return list.filter((e) => e.installed);
      case "available":
        return list.filter((e) => !e.installed);
      case "updates":
        return list.filter((e) => e.updateAvailable);
      default:
        return list;
    }
  });

  const installedCount = createMemo(() => entries().filter((e) => e.installed).length);
  const updateCount = createMemo(() => entries().filter((e) => e.updateAvailable).length);

  const afterMutation = async () => {
    await connections.refreshMcpServers();
    await reload();
  };

  const installEntry = async (entry: IndustryBundleCatalogEntry, replace = false) => {
    if (!workspacePath()) return;
    setActionBusy(entry.id);
    setError("");
    try {
      await installIndustryBundleFromCatalog(workspacePath(), entry.id, replace, remoteCatalogUrl());
      await afterMutation();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const uninstallEntry = async (entry: IndustryBundleCatalogEntry) => {
    setActionBusy(entry.id);
    setError("");
    try {
      await uninstallIndustryBundle(entry.id);
      await afterMutation();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const importFromFile = async () => {
    const zip = await pickBundleZipFile();
    if (!zip || !workspacePath()) return;
    setActionBusy("import");
    setError("");
    try {
      await installIndustryBundleFromPath(workspacePath(), zip, false);
      await afterMutation();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const importFromDir = async () => {
    const dir = await pickBundleDirectory();
    if (!dir || !workspacePath()) return;
    setActionBusy("import");
    setError("");
    try {
      await installIndustryBundleFromPath(workspacePath(), dir, false);
      await afterMutation();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const checkUpdates = async () => {
    if (!workspacePath()) return;
    setLoading(true);
    setError("");
    try {
      const list = await checkIndustryBundleUpdates(workspacePath(), remoteCatalogUrl());
      setEntries(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const pillClass = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
      active ? "bg-gray-12/10 text-gray-12 border-gray-6/20" : "text-gray-10 border-gray-6 hover:text-gray-12"
    }`;

  return (
    <section class="space-y-6 animate-in fade-in duration-300">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="space-y-1">
          <Show when={props.showHeader !== false}>
            <h2 class="text-3xl font-bold text-dls-text">{translate("bundles.title")}</h2>
            <p class="text-sm text-dls-secondary mt-1.5">{translate("bundles.description")}</p>
          </Show>
          <div class={`${props.showHeader === false ? "" : "mt-3"} flex flex-wrap items-center gap-2`}>
            <div class="inline-flex items-center gap-2 rounded-full bg-gray-3 px-3 py-1 text-xs text-gray-11" data-testid="industry-bundle-installed-count">
              <Package size={14} />
              {translate("bundles.installed_count", { count: installedCount() })}
            </div>
            <Show when={updateCount() > 0}>
              <div class="inline-flex items-center gap-2 rounded-full bg-amber-3 px-3 py-1 text-xs text-amber-11">
                <Sparkles size={14} />
                {translate("bundles.updates_count", { count: updateCount() })}
              </div>
            </Show>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class={pillClass(filter() === "all")} onClick={() => setFilter("all")}>
            {translate("bundles.filter_all")}
          </button>
          <button
            type="button"
            class={pillClass(filter() === "installed")}
            onClick={() => setFilter("installed")}
          >
            {translate("bundles.filter_installed")}
          </button>
          <button
            type="button"
            class={pillClass(filter() === "available")}
            onClick={() => setFilter("available")}
          >
            {translate("bundles.filter_available")}
          </button>
          <button type="button" class={pillClass(filter() === "updates")} onClick={() => setFilter("updates")}>
            {translate("bundles.filter_updates")}
          </button>
          <Button variant="secondary" disabled={loading()} onClick={() => void reload()}>
            <RefreshCw size={14} class={loading() ? "animate-spin" : ""} />
            {translate("bundles.refresh")}
          </Button>
          <Button variant="secondary" disabled={loading()} data-testid="industry-bundle-check-updates" onClick={() => void checkUpdates()}>
            {translate("bundles.check_updates")}
          </Button>
        </div>
      </div>

      <Show when={error()}>
        <p class="rounded-lg border border-red-6 bg-red-2 p-3 text-sm text-red-11">{error()}</p>
      </Show>

      <div class="grid gap-4 md:grid-cols-2">
        <For each={filtered()}>
          {(entry) => (
            <article class="rounded-xl border border-dls-border bg-dls-surface p-4 space-y-3" data-testid={`industry-bundle-card-${entry.id}`}>
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h3 class="font-semibold text-dls-text">{entry.name}</h3>
                  <p class="text-xs text-dls-secondary" data-testid={`industry-bundle-version-${entry.id}`}>
                    {entry.id} · v{entry.version}
                    {entry.installed
                      ? ` · ${translate("bundles.installed_version", { version: entry.installedVersion ?? "?" })}`
                      : ""}
                  </p>
                </div>
                <Show when={entry.featured}>
                  <span class="rounded-full bg-violet-3 px-2 py-0.5 text-[10px] font-medium text-violet-11">
                    {translate("bundles.featured")}
                  </span>
                </Show>
              </div>
              <p class="text-sm text-dls-secondary line-clamp-3">{entry.description || "—"}</p>
              <div class="flex flex-wrap gap-2">
                <Show
                  when={entry.installed}
                  fallback={
                    <Button
                      disabled={actionBusy() === entry.id || !workspacePath()}
                      data-testid={`industry-bundle-install-${entry.id}`}
                      onClick={() => void installEntry(entry, false)}
                    >
                      {translate("bundles.install")}
                    </Button>
                  }
                >
                  <Show when={entry.updateAvailable}>
                    <Button disabled={actionBusy() === entry.id} data-testid={`industry-bundle-update-${entry.id}`} onClick={() => void installEntry(entry, true)}>
                      {translate("bundles.update")}
                    </Button>
                  </Show>
                  <Button
                    variant="secondary"
                    disabled={actionBusy() === entry.id}
                    onClick={() => void uninstallEntry(entry)}
                  >
                    <Trash2 size={14} />
                    {translate("bundles.uninstall")}
                  </Button>
                </Show>
              </div>
            </article>
          )}
        </For>
      </div>

      <Show when={!hostReady()}>
        <p class="rounded-lg border border-dls-border bg-dls-surface p-3 text-sm text-dls-secondary">
          {translate("bundles.desktop_only")}
        </p>
      </Show>

      <Show when={!workspacePath() && hostReady()}>
        <p class="text-sm text-dls-secondary">{translate("bundles.select_workspace")}</p>
      </Show>

      <Show when={!loading() && filtered().length === 0 && workspacePath()}>
        <p class="text-sm text-dls-secondary">{translate("bundles.empty")}</p>
      </Show>

      <div class="rounded-xl border border-dls-border bg-dls-surface overflow-hidden">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-2/50"
          data-testid="industry-bundle-advanced-toggle"
          aria-expanded={advancedOpen()}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <div>
            <div class="text-sm font-medium text-dls-text">{translate("bundles.advanced_title")}</div>
            <div class="text-xs text-dls-secondary mt-0.5">{translate("bundles.advanced_hint")}</div>
          </div>
          <ChevronRight
            size={16}
            class={`shrink-0 text-dls-secondary transition-transform ${advancedOpen() ? "rotate-90" : ""}`}
          />
        </button>

        <Show when={advancedOpen()}>
          <div class="border-t border-dls-border px-4 py-4 space-y-4 animate-in fade-in duration-200">
            <div class="space-y-2">
              <label class="text-xs font-medium text-dls-secondary" for="bundle-catalog-url">
                {translate("bundles.catalog_url_label")}
              </label>
              <div class="flex flex-wrap gap-2">
                <input
                  id="bundle-catalog-url"
                  data-testid="industry-bundle-catalog-url"
                  type="url"
                  class="min-w-[16rem] flex-1 rounded-lg border border-dls-border bg-dls-bg px-3 py-2 text-sm text-dls-text"
                  placeholder={translate("bundles.catalog_url_placeholder")}
                  value={catalogUrl()}
                  onInput={(e) => setCatalogUrl(e.currentTarget.value)}
                />
                <Button
                  variant="secondary"
                  data-testid="industry-bundle-catalog-save"
                  onClick={() => {
                    setIndustryBundleCatalogUrl(catalogUrl());
                    void reload();
                  }}
                >
                  {translate("bundles.catalog_url_save")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCatalogUrl(DEFAULT_DEV_CATALOG_URL);
                    setIndustryBundleCatalogUrl(DEFAULT_DEV_CATALOG_URL);
                    void reload();
                  }}
                >
                  {translate("bundles.catalog_url_dev_default")}
                </Button>
              </div>
              <p class="text-xs text-dls-secondary">{translate("bundles.catalog_url_hint")}</p>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={actionBusy() !== null}
                data-testid="industry-bundle-import-zip"
                onClick={() => void importFromFile()}
              >
                <Upload size={14} />
                {translate("bundles.import_zip")}
              </Button>
              <Button
                variant="secondary"
                disabled={actionBusy() !== null}
                data-testid="industry-bundle-import-folder"
                onClick={() => void importFromDir()}
              >
                {translate("bundles.import_folder")}
              </Button>
            </div>
          </div>
        </Show>
      </div>
    </section>
  );
}
