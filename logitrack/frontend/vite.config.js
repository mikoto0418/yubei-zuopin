import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// LogiTrack 前端：开发端口 5205，/api 代理到后端 4205
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5205,
    proxy: {
      '/api': {
        target: 'http://localhost:4205',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
})
