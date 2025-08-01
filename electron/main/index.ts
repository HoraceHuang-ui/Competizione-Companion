import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    minWidth: 1200,
    minHeight: 700,
    width: 1200,
    height: 700,
    frame: false,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // win.webContents.on('will-navigate', (event, url) => { }) #344

  // ---------- Window actions ----------
  ipcMain.on('win:close', () => {
    win.close()
  })
  ipcMain.on('win:min', () => {
    win.minimize()
  })
  ipcMain.on('win:tray', () => {
    win.hide()
    win.setSkipTaskbar(true)
  })
  ipcMain.on('win:max', (_event, toMax: boolean) => {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })
  ipcMain.on('win:relaunch', () => {
    app.relaunch()
    app.quit()
  })

  // ---------- Steam actions ----------
  const { shell } = require('electron')
  ipcMain.on('steam:launch', (_event, id: string) => {
    // const steamPath = require('steam-path')
    // const steamExecutable = path.join(steamPath, 'steam.exe')
    if (os.platform() === 'win32') {
      // shell.openPath(steamExecutable)
      shell.openExternal(`steam://rungameid/${id}`)
    } else {
      console.warn('Steam launch is only supported on Windows.')
    }
  })

  ipcMain.on('elec:openExtLink', (_event, url) => {
    shell.openExternal(url)
  })

  /**
   * 在一个目录中查找与目标名称大小写不敏感相等的真实文件夹名
   */
  const fs = require('fs')
  function findCaseInsensitiveName(parentDir, targetName) {
    const items = fs.readdirSync(parentDir, { withFileTypes: true })
    const lowerTarget = targetName.toLowerCase()

    for (const item of items) {
      if (item.isDirectory() && item.name.toLowerCase() === lowerTarget) {
        return item.name // 返回真实名字
      }
    }

    return null // 找不到
  }
  ipcMain.handle('fs:setupList', async (_event, car, track) => {
    const setupsDir = path.join(
      os.homedir(),
      'Documents',
      'Assetto Corsa Competizione',
      'Setups',
    )
    if (!fs.existsSync(setupsDir)) {
      return []
    }

    const realCar = findCaseInsensitiveName(setupsDir, car)
    if (!realCar) {
      fs.mkdirSync(path.join(setupsDir, car), { recursive: true })
    }
    const realTrack = findCaseInsensitiveName(
      path.join(setupsDir, realCar || car),
      track,
    )
    if (!realTrack) {
      fs.mkdirSync(path.join(setupsDir, realCar || car, track), {
        recursive: true,
      })
    }

    const setupsPath = path.join(setupsDir, realCar, realTrack)
    return fs.readdirSync(setupsPath).filter(file => file.endsWith('.json'))
  })

  ipcMain.handle('fs:setupFile', async (_event, car, track, fileName) => {
    const setupsDir = path.join(
      os.homedir(),
      'Documents',
      'Assetto Corsa Competizione',
      'Setups',
    )
    const realCar = findCaseInsensitiveName(setupsDir, car)
    const realTrack = findCaseInsensitiveName(
      path.join(setupsDir, realCar || car),
      track,
    )
    const setupPath = path.join(setupsDir, realCar, realTrack, fileName)
    if (fs.existsSync(setupPath)) {
      return fs.readFileSync(setupPath, 'utf-8')
    } else {
      fs.writeFileSync(setupPath, '{}', 'utf-8')
      return '{}'
    }
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})
