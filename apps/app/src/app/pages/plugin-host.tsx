import { Show, createMemo } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";

import { pluginRegistry } from "../extensions/plugin-registry";

export default function PluginHostPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const resolved = createMemo(() => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    return pluginRegistry.resolve(path);
  });

  const RouteComponent = createMemo(() => resolved()?.route.component ?? null);

  return (
    <div class="flex min-h-0 flex-1 flex-col bg-dls-surface">
      <header class="flex h-12 shrink-0 items-center gap-3 border-b border-dls-border px-4">
        <button
          type="button"
          class="text-sm text-dls-secondary hover:text-dls-text"
          onClick={() => navigate("/session")}
        >
          ← 返回会话
        </button>
        <span class="truncate text-sm font-medium text-dls-text">
          {resolved()?.plugin.id ?? "插件"}
        </span>
      </header>
      <main class="min-h-0 flex-1 overflow-auto">
        <Show
          when={RouteComponent()}
          fallback={
            <div class="p-8 text-sm text-dls-secondary">未找到插件路由：{location.pathname}</div>
          }
        >
          {(Component) => <Component />}
        </Show>
      </main>
    </div>
  );
}
