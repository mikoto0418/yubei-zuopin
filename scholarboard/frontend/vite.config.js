import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 后端地址，本地联调时前端 dev 服务器走代理转发到后端 4102。
// 也可直接改为 http://localhost:4102（前后端分离直连）。
const BACKEND = 'http://localhost:4102';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5172,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});