import type { Component } from "solid-js";
import { createSignal } from "solid-js";

export type PluginExecutionSurface = "desktop" | "web" | "both";

export type PluginNavItem = {
  label: string;
  icon?: string;
  order?: number;
  group?: "core" | "vertical" | "bottom";
};

export type PluginRoute = {
  /** 完整路径，如 /plugins/convergence-demo */
  path: string;
  component: Component;
};

export type FrontendPlugin = {
  id: string;
  routes: PluginRoute[];
  navItem?: PluginNavItem;
  permissions?: string[];
  executionSurface?: PluginExecutionSurface;
};

const [navRevision, bumpNavRevision] = createSignal(0);

export class PluginRegistry {
  private plugins = new Map<string, FrontendPlugin>();

  register(plugin: FrontendPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, plugin);
    bumpNavRevision((n) => n + 1);
  }

  list(): FrontendPlugin[] {
    return [...this.plugins.values()].sort(
      (a, b) => (a.navItem?.order ?? 100) - (b.navItem?.order ?? 100),
    );
  }

  resolve(pathname: string): { plugin: FrontendPlugin; route: PluginRoute } | null {
    const normalized = pathname.replace(/\/+$/, "") || "/";
    for (const plugin of this.plugins.values()) {
      for (const route of plugin.routes) {
        if (route.path === normalized) {
          return { plugin, route };
        }
      }
    }
    return null;
  }

  getNavItems(): Array<{ pluginId: string; path: string; nav: PluginNavItem }> {
    navRevision();
    const items: Array<{ pluginId: string; path: string; nav: PluginNavItem }> = [];
    for (const plugin of this.list()) {
      if (!plugin.navItem || plugin.routes.length === 0) continue;
      items.push({
        pluginId: plugin.id,
        path: plugin.routes[0].path,
        nav: plugin.navItem,
      });
    }
    return items.sort((a, b) => (a.nav.order ?? 100) - (b.nav.order ?? 100));
  }
}

export const pluginRegistry = new PluginRegistry();
