import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Browser build of the renderer (web demo). The Electron build stays in
// electron.vite.config.ts – both share the same React code.
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  base: "/",
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer/src"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: resolve(__dirname, "out/web"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5174,
    proxy: { "/ltor": { target: "ws://127.0.0.1:8646", ws: true } },
  },
});
