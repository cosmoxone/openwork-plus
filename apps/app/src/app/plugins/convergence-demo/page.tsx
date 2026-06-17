import type { Component } from "solid-js";

export default function ConvergenceDemoPage() {
  return (
    <div class="mx-auto max-w-2xl space-y-4 p-8">
      <h1 class="text-xl font-semibold text-dls-text">融合平台验证页</h1>
      <p class="text-sm text-dls-secondary">
        此页面由 <code class="font-mono text-xs">PluginRegistry</code> 动态注册，路径为{" "}
        <code class="font-mono text-xs">/plugins/convergence-demo</code>。
      </p>
      <ul class="list-disc space-y-1 pl-5 text-sm text-dls-secondary">
        <li>Sprint 0：bundle install + gui-operate-mcp</li>
        <li>Sprint 1：test-automation bundle</li>
        <li>P0-ARC-1：appserver-stub JSON-RPC 宿主</li>
      </ul>
      <p class="text-xs text-dls-secondary">
        验收状态见仓库 <code class="font-mono">docs/convergence-acceptance-status.md</code>。
      </p>
    </div>
  );
}
