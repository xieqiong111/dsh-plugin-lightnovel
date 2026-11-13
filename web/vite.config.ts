import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// 独立前端工程：不影响仓库中 Cordis 插件的 tsc 构建（见根 tsconfig 的 include）
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5273,
    // 预留桥接层代理：待后端实现 /api 后启用
    // proxy: { '/api': 'http://127.0.0.1:8080' },
  },
})
