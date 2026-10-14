#!/usr/bin/env node
/**
 * 以GitHub Pages 子路径前缀构建站点。
 *
 * 仓库地址：https://<owner>.github.io/<repo>/
 * 因此资源 base 必须是 /<repo>/ 而不是 /，
 * 否则打包后的 JS/CSS 会 404。
 *
 * 用法：npm run build:pages
 * 覆盖仓库名：PAGES_REPO=my-repo npm run build:pages
 * 自定义前缀：  PAGES_BASE=/custom/ npm run build:pages
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 优先用显式环境变量，其次从 package.json / git remote 推断仓库名 */
function resolveBase() {
  if (process.env.PAGES_BASE) return normalize(process.env.PAGES_BASE)

  let repo = process.env.PAGES_REPO
  if (!repo) {
    try {
      repo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).name
    } catch {
      /* 忽略：无package.json 时回退到 git remote */
    }
  }
  if (!repo) {
    try {
      const remote = spawn('git', ['remote', 'get-url', 'origin'], { cwd: root })
      let url = ''
      remote.stdout.on('data', (d) => (url += d))
      remote.on('close', () => {
        const m = url.trim().match(/[:/]([^/:]+)\/([^/.]+)(?:\.git)?$/)
        if (m) build(`/${m[2]}/`)
      })
      remote.on('error', () => build('/'))
      return
    } catch {
      /* 忽略 */
    }
  }
  build(`/${repo}/`)
}

function normalize(base) {
  let b = base.trim()
  if (!b.startsWith('/')) b = `/${b}`
  if (!b.endsWith('/')) b = `${b}/`
  return b
}

function build(base) {
  console.log(`[build:pages] base = ${base}`)
  const child = spawn(
    'npx',
    ['vite', 'build', '--base', base],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
  )
  child.on('close', (code) => process.exit(code ?? 1))
}

resolveBase()