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
    // 开发服务器单独占用 5173；BFF 默认 5273，避免同端口自代理。
    port: 5173,
    // live 开发：先 `node server/serve.mjs`，再 `VITE_API_MODE=live npm run dev`。
    // 目标可用 LN_BFF_ORIGIN 覆盖（例如容器映射到其他端口时）。
    proxy: {
      '/api': {
        target: process.env.LN_BFF_ORIGIN || 'http://127.0.0.1:5273',
        changeOrigin: true,
      },
    },
  },
})
