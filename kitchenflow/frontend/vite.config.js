import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// KitchenFlow 前端构建配置：开发端口 5201，/api 代理到后端 4201。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5201,
    proxy: {
      '/api': { target: 'http://localhost:4201', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
