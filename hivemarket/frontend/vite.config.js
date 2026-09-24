import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 端口 5174；开发时把 /api 代理到后端 4104
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4104',
        changeOrigin: true,
      },
    },
  },
});