import { createSignal, createEffect, Show, For } from "solid-js";
import {
  fetchGuiOperationLogs,
  fetchOperationHistory,
  type GuiOperationLogEntry,
  type OperationEntry,
} from "./rpa-api";

type Props = {
  refreshToken: number;
};

function formatTs(ts: string | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

export default function RecordingList(props: Props) {
  const [history, setHistory] = createSignal<OperationEntry[]>([]);
  const [ndjson, setNdjson] = createSignal<GuiOperationLogEntry[]>([]);
  const [error, setError] = createSignal("");

  createEffect(() => {
    void props.refreshToken;
    void (async () => {
      setError("");
      try {
        const [hist, logs] = await Promise.all([fetchOperationHistory(), fetchGuiOperationLogs()]);
        setHistory(hist);
        setNdjson(logs);
      } catch (e) {
        setError(String(e));
      }
    })();
  });

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-dls-border p-4">
        <h2 class="text-sm font-medium text-dls-text">操作 NDJSON 审计</h2>
        <p class="mt-1 text-xs text-dls-secondary">
          来自 <code class="font-mono">logs/gui-operate/operations.ndjson</code>（gui-operate MCP 每步一行）
        </p>

        <Show when={error()}>
          <p class="mt-2 text-xs text-red-500">{error()}</p>
        </Show>

        <Show
          when={ndjson().length > 0}
          fallback={
            <p class="mt-3 text-sm text-dls-secondary">
              暂无 NDJSON 记录。会话内 MCP <code class="font-mono text-xs">screenshot</code> /{" "}
              <code class="font-mono text-xs">click</code> 后会写入此文件。
            </p>
          }
        >
          <div class="mt-3 max-h-64 overflow-auto">
            <table class="w-full text-left text-xs">
              <thead class="sticky top-0 bg-dls-surface text-dls-secondary">
                <tr>
                  <th class="py-1 pr-2">工具</th>
                  <th class="py-1 pr-2">应用</th>
                  <th class="py-1 pr-2">操作</th>
                  <th class="py-1 pr-2">坐标</th>
                  <th class="py-1">时间</th>
                </tr>
              </thead>
              <tbody>
                <For each={ndjson()}>
                  {(row) => (
                    <tr class="border-t border-dls-border">
                      <td class="py-1.5 pr-2 font-mono">{row.tool}</td>
                      <td class="py-1.5 pr-2">{row.appName ?? "—"}</td>
                      <td class="py-1.5 pr-2">{row.operation ?? "—"}</td>
                      <td class="py-1.5 pr-2 font-mono">
                        {row.x != null && row.y != null
                          ? `(${Math.round(row.x)}, ${Math.round(row.y)})`
                          : row.xNormalized != null && row.yNormalized != null
                            ? `(${row.xNormalized.toFixed(3)}, ${row.yNormalized.toFixed(3)})`
                            : "—"}
                      </td>
                      <td class="py-1.5 text-dls-secondary">{formatTs(row.ts)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </section>

      <section class="rounded-xl border border-dls-border p-4">
        <h2 class="text-sm font-medium text-dls-text">点击历史</h2>
        <p class="mt-1 text-xs text-dls-secondary">
          来自 <code class="font-mono">gui_apps/*/click_history.json</code>（gui-operate MCP 写入）
        </p>

        <Show
          when={history().length > 0}
          fallback={
            <p class="mt-3 text-sm text-dls-secondary">
              暂无点击记录。会话内使用 MCP <code class="font-mono text-xs">click</code> /{" "}
              <code class="font-mono text-xs">type</code> 后会出现在此。
            </p>
          }
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
                <For each={history()}>
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
    </div>
  );
}
