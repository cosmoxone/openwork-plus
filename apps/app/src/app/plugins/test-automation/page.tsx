/** 测试自动化看板（场景 A UI；场景 E 的 gui-operate 可作为 UI 测试扩展） */
import { createSignal, onMount, Show, For } from "solid-js";

type RunRow = {
  id: string;
  framework: string;
  passed: number;
  failed: number;
  finishedAt?: string;
};

export default function TestAutomationPage() {
  const [runs, setRuns] = createSignal<RunRow[]>([]);
  const [hint, setHint] = createSignal<string>("");

  onMount(() => {
    setHint(
      "安装 test-automation bundle 后：会话内使用 /analyze-failure、/generate-test-cases；" +
        "CLI：test-runner run --framework jest --path ./tests；" +
        "可选安装 computer-use bundle 启用 GUI 自动化测试（场景 E 能力）。",
    );
    // 占位：后续可经 test-db MCP / Host API 拉取 .openwork/test-results.json
    setRuns([]);
  });

  return (
    <div class="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 class="text-xl font-semibold text-dls-text">测试自动化控制台</h1>
        <p class="mt-2 text-sm text-dls-secondary">{hint()}</p>
      </div>

      <section class="rounded-xl border border-dls-border bg-dls-surface p-4">
        <h2 class="text-sm font-medium text-dls-text">快速入口</h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-dls-secondary">
          <li>
            斜杠命令：<code class="font-mono text-xs">/analyze-failure</code>、
            <code class="font-mono text-xs">/generate-test-cases</code>
          </li>
          <li>MCP：<code class="font-mono text-xs">test-db</code>（历史与趋势）</li>
          <li>
            UI 测试（场景 E）：安装 <code class="font-mono text-xs">computer-use</code> 后使用{" "}
            <code class="font-mono text-xs">gui-operate</code> MCP
          </li>
        </ul>
      </section>

      <section class="rounded-xl border border-dls-border p-4">
        <h2 class="text-sm font-medium text-dls-text">最近运行</h2>
        <Show
          when={runs().length > 0}
          fallback={
            <p class="mt-2 text-sm text-dls-secondary">
              暂无记录。运行{" "}
              <code class="font-mono text-xs">test-runner run --framework jest --path .</code>{" "}
              后写入 <code class="font-mono text-xs">.openwork/test-results.json</code>。
            </p>
          }
        >
          <ul class="mt-2 divide-y divide-dls-border">
            <For each={runs()}>
              {(row) => (
                <li class="flex justify-between py-2 text-sm">
                  <span>{row.framework}</span>
                  <span class="text-dls-secondary">
                    ✓ {row.passed} / ✗ {row.failed}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
