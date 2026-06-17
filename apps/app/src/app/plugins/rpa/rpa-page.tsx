/** 场景 E：RPA / UI 自动化控制面板 */
import { createSignal } from "solid-js";
import AutoControl from "./auto-control";
import RecordingList from "./recording-list";
import ScreenshotViewer from "./screenshot-viewer";

export default function RpaPage() {
  const [refreshToken, setRefreshToken] = createSignal(0);
  const bump = () => setRefreshToken((n) => n + 1);

  return (
    <div class="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 class="text-xl font-semibold text-dls-text">RPA / UI 自动化</h1>
        <p class="mt-2 text-sm text-dls-secondary">
          <code class="font-mono text-xs">@openwork/gui-operate-mcp</code> +{" "}
          <code class="font-mono text-xs">computer-use</code> bundle。会话内可用 MCP{" "}
          <code class="font-mono text-xs">screenshot</code>、<code class="font-mono text-xs">click</code>、
          <code class="font-mono text-xs">type</code> 或斜杠命令{" "}
          <code class="font-mono text-xs">/gui-screenshot</code>。
        </p>
      </div>

      <AutoControl onChange={bump} />

      <ScreenshotViewer refreshToken={refreshToken()} onCaptured={bump} />

      <RecordingList refreshToken={refreshToken()} />

      <section class="rounded-xl border border-dls-border p-4 text-xs text-dls-secondary">
        <p>
          安装：打开 <strong>Settings › Bundles（行业包）</strong>，一键安装{" "}
          <code class="font-mono text-xs">computer-use</code>；无需命令行。
        </p>
        <p class="mt-1">
          与场景 A 联动：安装 test-automation 后可用 <code class="font-mono text-xs">ui-test-assist</code> 技能做 UI 测试。
        </p>
      </section>
    </div>
  );
}
