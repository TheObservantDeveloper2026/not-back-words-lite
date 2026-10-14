/**
 * Electron 主进程：把打包后的网页包成 Windows / macOS / Linux 桌面应用
 *
 * 打包命令见 README「打包成桌面 App」章节。
 */
import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 开发模式下加载 vite dev server，打包后加载本地文件
const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 390,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    title: '不背单词 Lite',
    webPreferences: {
      // 词库是本地静态资源，不需要 Node 权限
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})