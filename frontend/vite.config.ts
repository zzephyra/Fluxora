import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl = (env.VITE_SITE_URL || "https://lumisene.com").replace(/\/$/, "");
  return {
  plugins: [react(), tailwindcss(), {
    name: "lumi-brand-metadata",
    transformIndexHtml(html) {
      return html.replaceAll("%SITE_URL%", siteUrl)
        .replaceAll("%BRAND_TITLE%", "Lumi — AI Image &amp; Video Creative Studio")
        .replaceAll("%BRAND_DESCRIPTION%", "Create, edit, and transform images and videos with Lumi, an AI-powered creative workspace by Lumisene.");
    },
  }],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/docs": { target: apiTarget, changeOrigin: true },
      "/openapi.json": { target: apiTarget, changeOrigin: true },
      "/healthz": { target: apiTarget, changeOrigin: true },
      "/readyz": { target: apiTarget, changeOrigin: true },
    },
  },
};
});
