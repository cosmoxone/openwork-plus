import { createSignal, createEffect, Show, For } from "solid-js";
import { fetchOperationHistory, type OperationEntry } from "./rpa-api";

type Props = {
  refreshToken: number;
};

export default function RecordingList(props: Props) {
  const [rows, setRows] = createSignal<OperationEntry[]>([]);
  const [error, setError] = createSignal("");

  createEffect(() => {
    void props.refreshToken;
    void (async () => {
      setError("");
      try {
        setRows(await fetchOperationHistory());
      } catch (e) {
        setError(String(e));
      }
    })();
  });

  return (
    <section class="rounded-xl border border-dls-border p-4">
      <h2 class="text-sm font-medium text-dls-text">操作历史</h2>
      <p class="mt-1 text-xs text-dls-secondary">
        来自 <code class="font-mono">gui_apps/*/click_history.json</code>（gui-operate MCP 写入）
      </p>

      <Show when={error()}>
        <p class="mt-2 text-xs text-red-500">{error()}</p>
      </Show>

      <Show
        when={rows().length > 0}
        fallback={<p class="mt-3 text-sm text-dls-secondary">暂无点击记录。会话内使用 MCP `click` / `type` 后会出现在此。</p>}
      >
        <div class="mt-3 max-h-64 overflow-auto">
          <table class="w-full text-left text-xs">
            <thead class="sticky top-0 bg-dls-surface text-dls-secondary">
              <tr>
                <th class="py-1 pr-2">应用</th>
                <th class="py-1 pr-2">操作</th>
                <th class="py-1 pr-2">坐标</th>
                <th class="py-1">时间</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(row) => (
                  <tr class="border-t border-dls-border">
                    <td class="py-1.5 pr-2">{row.appName}</td>
                    <td class="py-1.5 pr-2">{row.operation}</td>
                    <td class="py-1.5 pr-2 font-mono">
                      ({Math.round(row.x)}, {Math.round(row.y)})
                    </td>
                    <td class="py-1.5 text-dls-secondary">
                      {row.timestamp ? new Date(row.timestamp).toLocaleString() : "—"}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </section>
  );
}
