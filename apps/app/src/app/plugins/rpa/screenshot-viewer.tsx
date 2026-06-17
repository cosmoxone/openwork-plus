import { createSignal, createEffect, Show, For } from "solid-js";
import { captureScreenshot, fetchScreenshots, screenshotSrc, type ScreenshotEntry } from "./rpa-api";

type Props = {
  refreshToken: number;
  onCaptured?: () => void;
};

export default function ScreenshotViewer(props: Props) {
  const [shots, setShots] = createSignal<ScreenshotEntry[]>([]);
  const [selected, setSelected] = createSignal<ScreenshotEntry | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const reload = async () => {
    setError("");
    try {
      const list = await fetchScreenshots();
      setShots(list);
      setSelected(list[0] ?? null);
    } catch (e) {
      setError(String(e));
    }
  };

  createEffect(() => {
    void props.refreshToken;
    void reload();
  });

  const onCapture = async () => {
    setBusy(true);
    setError("");
    try {
      await captureScreenshot(0);
      await reload();
      props.onCaptured?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="rounded-xl border border-dls-border bg-dls-surface p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-medium text-dls-text">截图预览</h2>
        <button
          type="button"
          class="rounded-md bg-dls-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          disabled={busy()}
          onClick={() => void onCapture()}
        >
          {busy() ? "捕获中…" : "立即截图"}
        </button>
      </div>

      <Show when={error()}>
        <p class="mt-2 text-xs text-red-500">{error()}</p>
      </Show>

      <Show
        when={selected()}
        fallback={<p class="mt-3 text-sm text-dls-secondary">暂无截图。点击「立即截图」或会话内调用 MCP `screenshot`。</p>}
      >
        {(shot) => (
          <div class="mt-3 space-y-2">
            <img
              src={screenshotSrc(shot().path)}
              alt={shot().name}
              class="max-h-80 w-full rounded-lg border border-dls-border object-contain bg-black/5"
            />
            <p class="text-xs text-dls-secondary">
              {shot().name} · {Math.round(shot().size / 1024)} KB · {new Date(shot().modifiedAt).toLocaleString()}
            </p>
          </div>
        )}
      </Show>

      <Show when={shots().length > 1}>
        <div class="mt-3 flex flex-wrap gap-2">
          <For each={shots()}>
            {(s) => (
              <button
                type="button"
                class="rounded border border-dls-border px-2 py-1 text-xs text-dls-secondary hover:bg-dls-hover"
                onClick={() => setSelected(s)}
              >
                {s.name}
              </button>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
