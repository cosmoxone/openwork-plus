import { For, createMemo } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { LayoutGrid } from "lucide-solid";

import { pluginRegistry } from "../extensions/plugin-registry";

type PluginSidebarNavProps = {
  class?: string;
};

export default function PluginSidebarNav(props: PluginSidebarNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const items = createMemo(() => pluginRegistry.getNavItems());

  const activePath = createMemo(() => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    return path.startsWith("/plugins/") ? path : null;
  });

  return (
    <For each={items()}>
      {(item) => {
        const isActive = () => activePath() === item.path;
        return (
          <button
            type="button"
            class={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
              isActive()
                ? "bg-[rgba(var(--dls-accent-rgb),0.12)] text-dls-text"
                : "text-dls-secondary hover:bg-gray-3/60 hover:text-dls-text"
            } ${props.class ?? ""}`}
            onClick={() => navigate(item.path)}
            title={item.nav.label}
            aria-current={isActive() ? "page" : undefined}
          >
            <LayoutGrid size={14} class="shrink-0 opacity-80" />
            <span class="truncate">{item.nav.label}</span>
          </button>
        );
      }}
    </For>
  );
}
