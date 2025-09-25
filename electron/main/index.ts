import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  Tray,
} from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import brotli from 'brotli-compress'
import axios from 'axios'
import fs, { promises as fsPromises } from 'fs'

// const store = new Store({
//   defaults: {
//     w: 1200,
//     h: 700,
//     max: false,
//     tray: false,
//   },
// })

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
let tray = null
const iconPath = path.join(process.env.VITE_PUBLIC, 'favicon.ico')

async function createWindow() {
  win = new BrowserWindow({
    title: 'Competizione Companion',
    icon: iconPath,
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
  // if (store.get('max')) {
  //   win.maximize()
  // }

  // win.on('resized', () => {
  //   if (win.isMinimized()) {
  //     return
  //   }
  //   const [width, height] = win.getSize()
  //   store.set('w', width)
  //   store.set('h', height)
  // })
  // win.on('maximize', () => {
  //   store.set('max', true)
  // })
  // win.on('unmaximize', () => {
  //   store.set('max', false)
  // })

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
  ipcMain.on('win:close', _event => {
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

  // ipcMain.on('elec:storeSet', (_event, key, value) => {
  //   store.set(key, value)
  // })

  ipcMain.handle('axios:post', async (_event, url, body) => {
    const result = await axios.post(url, body)
    return result.data
  })
  ipcMain.handle('axios:get', async (_event, url) => {
    const result = await axios.get(url)
    return result.data
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

  ipcMain.handle(
    'fs:setupFile',
    async (_event, car, track, fileName, writeVal) => {
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
        fs.writeFileSync(setupPath, writeVal, 'utf-8')
        return writeVal
      }
    },
  )

  ipcMain.handle('fs:presetList', async (_event, exePath) => {
    if (!fs.existsSync(exePath)) {
      return []
    }
    const presetDir = path.join(path.dirname(exePath), 'presets')
    if (!fs.existsSync(presetDir)) {
      fs.mkdirSync(presetDir)
      return []
    }
    return fs.readdirSync(presetDir).filter(file => file.endsWith('.pre'))
  })

  ipcMain.handle(
    'fs:presetFile',
    async (_event, exePath, presetName, writeVal = undefined) => {
      if (!fs.existsSync(exePath)) {
        return ''
      }
      const presetDir = path.join(path.dirname(exePath), 'presets')
      if (!fs.existsSync(presetDir)) {
        fs.mkdirSync(presetDir)
      }
      const presetPath = path.join(presetDir, presetName)

      if (writeVal) {
        const buffer = Buffer.from('\uFEFF' + writeVal, 'utf16le')
        fs.writeFileSync(presetPath, buffer)
        return writeVal
      } else {
        if (fs.existsSync(presetPath)) {
          return fs.readFileSync(presetPath, 'utf16le')
        } else {
          return ''
        }
      }
    },
  )

  ipcMain.handle('brotli:compress', async (_event, input) => {
    const buf = Buffer.from(input, 'utf-8')
    const compressed = await brotli.compress(buf, { quality: 5 })
    return Buffer.from(compressed).toString('base64')
  })

  ipcMain.handle('brotli:decompress', async (_event, input) => {
    const buf = Buffer.from(input, 'base64')
    const decompressed = await brotli.decompress(buf)
    return Buffer.from(decompressed).toString('utf-8')
  })

  ipcMain.handle('dialog:show', async (_event, options) => {
    const result = await dialog.showOpenDialog(win, options)
    if (!result.canceled) {
      return result.filePaths
    } else {
      return []
    }
  })

  ipcMain.handle('dialog:showAndCopy', async (_event, options) => {
    try {
      const result = await dialog.showOpenDialog(win, options)
      if (!result.canceled && result.filePaths.length > 0) {
        const sourcePath = result.filePaths[0]
        const data = await fsPromises
          .readFile(sourcePath, 'base64')
          .then(data => `data:image/png;base64,${data}`)
        return await base64ToImg(data)
      } else {
        return ''
      }
    } catch (err) {
      console.error('Error copying image:', err)
      throw err
    }
  })

  const base64ToImg = async (base64Str: string) => {
    const matches = base64Str.match(/^data:(.+);base64,(.+)$/)
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 string')
    }
    const buffer = Buffer.from(matches[2], 'base64')
    const userDataPath = app.getPath('userData')
    const filePath = path.join(userDataPath, 'bg.png')
    try {
      await fsPromises.writeFile(filePath, buffer)
      return filePath
    } catch (err) {
      console.error('Failed to write image file:', err)
      throw err
    }
  }

  ipcMain.handle('img:base64ToImg', async (_event, base64Str) => {
    try {
      return await base64ToImg(base64Str)
    } catch (err) {
      console.error('Error converting base64 to image:', err)
      throw err
    }
  })

  ipcMain.handle('img:getBgBase64', async () => {
    const userDataPath = app.getPath('userData')
    const filePath = path.join(userDataPath, 'bg.png')
    try {
      if (fs.existsSync(filePath)) {
        return await fs.promises
          .readFile(filePath, 'base64')
          .then(data => `data:image/png;base64,${data}`)
      }
    } catch (err) {
      console.error('Error reading background image:', err)
      throw err
    }
  })

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Quit',
      click: () => {
        win.destroy()
      },
    },
  ])
  tray = new Tray(iconPath)
  tray.setToolTip('Competizione Companion')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    win.isVisible() ? win.hide() : win.show()
    win.isVisible() ? win.setSkipTaskbar(false) : win.setSkipTaskbar(true)
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
