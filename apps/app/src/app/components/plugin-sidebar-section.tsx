import { Show, createMemo } from "solid-js";

import { pluginRegistry } from "../extensions/plugin-registry";
import PluginSidebarNav from "./plugin-sidebar-nav";

type PluginSidebarSectionProps = {
  title?: string;
};

/** 侧栏底部：PluginRegistry 贡献的垂类入口 */
export default function PluginSidebarSection(props: PluginSidebarSectionProps) {
  const hasItems = createMemo(() => pluginRegistry.getNavItems().length > 0);

  return (
    <Show when={hasItems()}>
      <div class="mt-2 shrink-0 border-t border-dls-border pt-2">
        <Show when={props.title}>
          <div class="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-dls-secondary">
            {props.title}
          </div>
        </Show>
        <PluginSidebarNav />
      </div>
    </Show>
  );
}
