/** 测试自动化看板（场景 A UI；Recharts 趋势 + test-db 历史） */
import { createSignal, onMount, Show, For } from "solid-js";

import { useConnections } from "../../connections/provider";
import { isTauriRuntime } from "../../utils";
import { ReactIsland } from "../../../react/island";
import { TestTrendChart } from "./trend-chart.react";
import {
  fetchTestAutomationDashboard,
  type TestAutomationDashboard,
  type TestRunRow,
} from "./test-automation-api";

export default function TestAutomationPage() {
  const connections = useConnections();
  const workspacePath = () => connections.selectedWorkspaceRoot().trim();

  const [dashboard, setDashboard] = createSignal<TestAutomationDashboard | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const refresh = async () => {
    const ws = workspacePath();
    if (!ws || !isTauriRuntime()) {
      setDashboard(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setDashboard(await fetchTestAutomationDashboard(ws));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void refresh();
  });

  const runs = () => dashboard()?.runs ?? [];
  const trend = () => dashboard()?.trend ?? [];

  return (
    <div class="mx-auto max-w-3xl space-y-6 p-8">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-dls-text">测试自动化控制台</h1>
          <p class="mt-2 text-sm text-dls-secondary">
            安装 test-automation bundle 后：会话内{" "}
            <code class="font-mono text-xs">/analyze-failure</code>、
            <code class="font-mono text-xs">/generate-test-cases</code>；CLI：{" "}
            <code class="font-mono text-xs">test-runner run --record</code>。
          </p>
        </div>
        <Show when={isTauriRuntime()}>
          <button
            type="button"
            class="rounded-lg border border-dls-border px-3 py-1.5 text-xs text-dls-text hover:bg-dls-hover"
            onClick={() => void refresh()}
            disabled={loading()}
          >
            {loading() ? "刷新中…" : "刷新"}
          </button>
        </Show>
      </div>

      <Show when={error()}>
        <p class="text-sm text-red-600">{error()}</p>
      </Show>

      <section class="rounded-xl border border-dls-border bg-dls-surface p-4">
        <h2 class="text-sm font-medium text-dls-text">7 日通过 / 失败趋势</h2>
        <Show
          when={isTauriRuntime()}
          fallback={
            <p class="mt-2 text-sm text-dls-secondary">桌面端打开工作区后可加载 test-db 历史与趋势图。</p>
          }
        >
          <ReactIsland component={TestTrendChart} props={{ trend: trend() }} instanceKey={trend().length} />
        </Show>
      </section>

      <section class="rounded-xl border border-dls-border bg-dls-surface p-4">
        <h2 class="text-sm font-medium text-dls-text">最近运行</h2>
        <Show
          when={runs().length > 0}
          fallback={
            <p class="mt-2 text-sm text-dls-secondary">
              暂无记录。运行{" "}
              <code class="font-mono text-xs">test-runner run --framework jest --path . --record</code>{" "}
              后写入{" "}
              <code class="font-mono text-xs">.openwork/test-results.json</code>
              {dashboard()?.dbPath ? (
                <>
                  {" "}
                  （<span class="font-mono text-xs">{dashboard()?.dbPath}</span>）
                </>
              ) : null}
              。
            </p>
          }
        >
          <ul class="mt-2 divide-y divide-dls-border">
            <For each={runs()}>{(row: TestRunRow) => <RunRow row={row} />}</For>
          </ul>
        </Show>
      </section>

      <section class="rounded-xl border border-dls-border p-4 text-sm text-dls-secondary">
        <p class="font-medium text-dls-text">快速入口</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <li>
            MCP：<code class="font-mono text-xs">test-db</code>（list_runs / get_trend / list_failures）
          </li>
          <li>
            UI 测试：安装 <code class="font-mono text-xs">computer-use</code> +{" "}
            <code class="font-mono text-xs">gui-operate</code> MCP
          </li>
        </ul>
      </section>
    </div>
  );
}

function RunRow(props: { row: TestRunRow }) {
  const row = () => props.row;
  return (
    <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <div>
        <span class="font-medium text-dls-text">{row().framework}</span>
        <span class="ml-2 text-xs text-dls-secondary">{row().id}</span>
      </div>
      <div class="text-dls-secondary">
        <span class="text-green-600">✓ {row().passed}</span>
        <span class="mx-2">/</span>
        <span class="text-red-600">✗ {row().failed}</span>
        <Show when={row().startedAt}>
          <span class="ml-3 text-xs">{row().startedAt?.slice(0, 16).replace("T", " ")}</span>
        </Show>
      </div>
    </li>
  );
}
