import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";

const appRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const e2eRoot = resolve(appRoot, "e2e");

export default defineConfig({
  root: e2eRoot,
  envDir: appRoot,
  plugins: [tailwindcss(), solid()],
  define: {
    "import.meta.env.VITE_INDUSTRY_BUNDLE_E2E": JSON.stringify("1"),
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.INDUSTRY_BUNDLE_E2E_PORT ?? 5199),
    strictPort: true,
    fs: {
      allow: [appRoot, resolve(appRoot, "../..")],
    },
  },
  resolve: {
    alias: {
      "/e2e": resolve(appRoot, "public/e2e"),
    },
  },
  publicDir: resolve(appRoot, "public"),
});
