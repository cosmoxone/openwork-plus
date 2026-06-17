import type { Component } from "solid-js";

import { pluginRegistry } from "./plugin-registry";
import ConvergenceDemoPage from "../plugins/convergence-demo/page";
import DocsPage from "../plugins/docs/page";
import RpaPage from "../plugins/rpa/page";
import TestAutomationPage from "../plugins/test-automation/page";

export type BundleUiRouteDef = {
  path: string;
  label: string;
  order?: number;
  component: Component;
};

export type BundleUiEntry = {
  routes: BundleUiRouteDef[];
};

/** 内置 bundle id → 前端 UI（路径须与 bundle.json `ui.routes` 一致） */
export const BUNDLE_UI_CATALOG: Record<string, BundleUiEntry> = {
  "convergence-demo": {
    routes: [
      {
        path: "/plugins/convergence-demo",
        label: "融合验证",
        order: 900,
        component: ConvergenceDemoPage,
      },
    ],
  },
  "computer-use": {
    routes: [
      {
        path: "/plugins/rpa",
        label: "RPA / UI 自动化",
        order: 850,
        component: RpaPage,
      },
    ],
  },
  "test-automation": {
    routes: [
      {
        path: "/plugins/test-automation",
        label: "测试自动化",
        order: 800,
        component: TestAutomationPage,
      },
    ],
  },
  "knowledge-mgmt": {
    routes: [
      {
        path: "/docs",
        label: "文档",
        order: 750,
        component: DocsPage,
      },
    ],
  },
};

/** MCP server id → bundle id（用于从 opencode.json 推断已安装 bundle） */
export const MCP_SERVER_TO_BUNDLE: Record<string, string> = {
  "gui-operate": "computer-use",
  "test-db": "test-automation",
  "sqlite-vec-rag": "knowledge-mgmt",
};

/**
 * 根据 bundle id 注册 PluginRegistry 条目（已存在则跳过）。
 * @returns 本次新注册的 bundle id
 */
export function registerPluginsForBundles(bundleIds: string[]): string[] {
  const registered: string[] = [];
  for (const id of bundleIds) {
    const entry = BUNDLE_UI_CATALOG[id];
    if (!entry) continue;
    if (pluginRegistry.list().some((p) => p.id === id)) continue;
    const primary = entry.routes[0];
    pluginRegistry.register({
      id,
      routes: entry.routes.map((r) => ({ path: r.path, component: r.component })),
      navItem: {
        label: primary?.label ?? id,
        order: primary?.order ?? 500,
        group: "vertical",
      },
      executionSurface: id === "computer-use" ? "desktop" : "both",
    });
    registered.push(id);
  }
  return registered;
}

/**
 * 从 MCP 名称 + 显式 bundle id 列表同步侧栏插件。
 */
export function syncBundleUiPluginsCombined(mcpNames: string[], bundleIds: string[] = []): string[] {
  const ids = new Set<string>(["convergence-demo", ...bundleIds]);
  for (const name of mcpNames) {
    const bundleId = MCP_SERVER_TO_BUNDLE[name];
    if (bundleId) ids.add(bundleId);
  }
  return registerPluginsForBundles([...ids]);
}

/**
 * 从 MCP 名称推断 bundle 并同步侧栏插件（始终包含 convergence-demo 开发验证项）。
 */
export function syncBundleUiPluginsFromMcp(mcpNames: string[]): string[] {
  return syncBundleUiPluginsCombined(mcpNames, []);
}

/**
 * 解析 `.openwork/bundle-ui.json` 内容（纯数据，可在宿主读取文件后传入）。
 */
export function bundleIdsFromUiManifest(manifest: { bundles?: Array<{ id: string }> } | null): string[] {
  if (!manifest?.bundles?.length) return [];
  return manifest.bundles.map((b) => b.id).filter(Boolean);
}
