import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 默认相对路径：便于 Capacitor / Electron / 本地 file:// 直接打开。
  // 部署到 GitHub Pages 等子路径托管时，改用 npm run build:pages，
  // 它会推断仓库名并注入正确的 base 前缀。
  base: process.env.PAGES_BASE || './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})