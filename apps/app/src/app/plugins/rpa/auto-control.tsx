import { createSignal, onMount, Show } from "solid-js";
import { fetchRpaStatus, setAutomationEnabled, type RpaStatus } from "./rpa-api";

type Props = {
  onChange?: () => void;
};

export default function AutoControl(props: Props) {
  const [status, setStatus] = createSignal<RpaStatus | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const reload = async () => {
    setError("");
    try {
      setStatus(await fetchRpaStatus());
    } catch (e) {
      setError(String(e));
    }
  };

  onMount(() => {
    void reload();
  });

  const toggle = async () => {
    const current = status();
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await setAutomationEnabled(!current.automationEnabled);
      await reload();
      props.onChange?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const sandboxLabel = () => {
    const s = status();
    if (!s) return "加载中…";
    if (!s.sandboxBootstrapped) return "沙箱未初始化";
    return `沙箱: ${s.sandboxMode}`;
  };

  return (
    <section class="rounded-xl border border-dls-border bg-dls-surface p-4">
      <h2 class="text-sm font-medium text-dls-text">自动化控制</h2>

      <Show when={error()}>
        <p class="mt-2 text-xs text-red-500">{error()}</p>
      </Show>

      <div class="mt-3 flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <span
            class="inline-block h-2.5 w-2.5 rounded-full"
            classList={{
              "bg-green-500": status()?.automationEnabled,
              "bg-dls-border": !status()?.automationEnabled,
            }}
          />
          <span class="text-sm text-dls-text">
            {status()?.automationEnabled ? "自动化已启用" : "自动化已停止"}
          </span>
        </div>
        <button
          type="button"
          class="rounded-md border border-dls-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          disabled={busy() || !status()}
          onClick={() => void toggle()}
        >
          {status()?.automationEnabled ? "停止" : "启动"}
        </button>
      </div>

      <ul class="mt-3 space-y-1 text-xs text-dls-secondary">
        <li>{sandboxLabel()}</li>
        <li>截图数: {status()?.screenshotCount ?? 0}</li>
        <li class="truncate">数据目录: {status()?.dataDir ?? "—"}</li>
      </ul>
    </section>
  );
}
