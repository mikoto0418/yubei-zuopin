import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// InterviewGo 前端：端口 5203，/api 代理到后端 4203。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5203,
    proxy: {
      '/api': {
        target: 'http://localhost:4203',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5203,
  },
});
