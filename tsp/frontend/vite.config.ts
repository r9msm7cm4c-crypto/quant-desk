import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 把仓库根目录的单文件离线 PWA 一并产出到 dist/pwa/。
 *
 * 主站 22 个页面依赖 FastAPI；这个单文件 PWA 是纯前端、自带数据的独立界面。
 * 打进 Capacitor 包后，即使完全没有后端，App 里也始终有一块能真正操作的区域
 * （Layout 的「离线版」入口会 HEAD /pwa/index.html 探活，存在即显示）。
 */
function offlinePwaPlugin(): Plugin {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const entries = ['index.html', 'manifest.webmanifest', 'sw.js']
  return {
    name: 'quantdesk-offline-pwa',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist', 'pwa')
      fs.mkdirSync(outDir, { recursive: true })
      const copied: string[] = []
      for (const name of entries) {
        const src = path.join(repoRoot, name)
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(outDir, name))
          copied.push(name)
        }
      }
      const iconsSrc = path.join(repoRoot, 'icons')
      if (fs.existsSync(iconsSrc)) {
        fs.cpSync(iconsSrc, path.join(outDir, 'icons'), { recursive: true })
        copied.push('icons/')
      }
      console.log(`[offline-pwa] dist/pwa ← ${copied.join(', ') || '（源缺失，跳过）'}`)
    },
  }
}

const backendHost = process.env.BACKEND_HOST || '127.0.0.1'
const proxyHost = ['0.0.0.0', '::'].includes(backendHost) ? '127.0.0.1' : backendHost
const backendPort = process.env.BACKEND_PORT || '3018'
const backendTarget = `http://${proxyHost}:${backendPort}`

export default defineConfig({
  plugins: [react(), offlinePwaPlugin()],
  experimental: {
    // 后端将资源挂到带版本的路径；分块预加载和 CSS 字体也须跟随该路径。
    renderBuiltUrl(_filename, { hostType }) {
      if (hostType !== 'html') return { relative: true }
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',   // dev.sh / dev.ps1 会用 CLI --host 覆盖
    port: 3011,
    // Quant Lab imports the shared platform-neutral native-core package from
    // the TSP workspace root. Allow that single sibling package in Vite dev.
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, '../native-core')],
    },
    proxy: {
      // dev 时 /api 转发到与启动脚本相同的 FastAPI 地址
      '/api': {
        target: backendTarget,
        // SSE 端点需要禁用缓冲
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            if (req.url?.includes('/stream')) {
              _proxyReq.setHeader('Accept', 'text/event-stream')
              _proxyReq.setHeader('Cache-Control', 'no-cache')
              _proxyReq.setHeader('Connection', 'keep-alive')
            }
          })
        },
      },
      '/health': backendTarget,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // 把重型图表库拆到独立 chunk, 避免打进主包 + 让页面按需加载。
        // 用函数形式按 node_modules 路径匹配, 比对象形式更可靠。
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts')) return 'echarts'
            if (id.includes('lightweight-charts')) return 'lightweight-charts'
          }
        },
      },
    },
  },
})
