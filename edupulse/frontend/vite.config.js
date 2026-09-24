import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // 开发时把 /api 代理到 Flask 后端 4103，避免跨域
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4103",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});