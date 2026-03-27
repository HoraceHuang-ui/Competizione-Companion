import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('steam', {
  launch: (id: string) => {
    ipcRenderer.send('steam:launch', id)
  },
})

contextBridge.exposeInMainWorld('win', {
  close: (force = false) => {
    ipcRenderer.send('win:close', force)
  },
  min: () => {
    ipcRenderer.send('win:min')
  },
  tray: () => {
    ipcRenderer.send('win:tray')
  },
  max: () => {
    ipcRenderer.send('win:max')
  },
  relaunch: () => {
    ipcRenderer.send('win:relaunch')
  },
})

contextBridge.exposeInMainWorld('axios', {
  post: async (url: string, body: any, config?: any) => {
    return await ipcRenderer.invoke('axios:post', url, body, config)
  },
  get: async (url: string, config?: any) => {
    return await ipcRenderer.invoke('axios:get', url, config)
  },
})

contextBridge.exposeInMainWorld('electron', {
  openExtLink: (url: string) => {
    ipcRenderer.send('elec:openExtLink', url)
  },
})

contextBridge.exposeInMainWorld('fs', {
  setupList: (car: string, track: string) => {
    return ipcRenderer.invoke('fs:setupList', car, track)
  },
  setupFile: (
    car: string,
    track: string,
    fileName: string,
    writeVal: string,
    overwrite = false,
  ) => {
    return ipcRenderer.invoke(
      'fs:setupFile',
      car,
      track,
      fileName,
      writeVal,
      overwrite,
    )
  },
  presetList: (exePath: string) => {
    return ipcRenderer.invoke('fs:presetList', exePath)
  },
  presetFile: (exePath: string, presetName: string, writeVal: string) => {
    return ipcRenderer.invoke('fs:presetFile', exePath, presetName, writeVal)
  },
  bopJsonFile: (exePath: string, writeVal: string, overwrite: boolean) => {
    return ipcRenderer.invoke('fs:bopJsonFile', exePath, writeVal, overwrite)
  },
  saveUserDataFile: (
    relativePath: string,
    data: string | ArrayBuffer | Uint8Array,
  ) => {
    return ipcRenderer.invoke('fs:saveUserDataFile', relativePath, data)
  },
  clearUserDataDirectory: (relativeDir: string) => {
    return ipcRenderer.invoke('fs:clearUserDataDirectory', relativeDir)
  },
  saveFileToPath: (
    pathToFile: string,
    data: string | ArrayBuffer | Uint8Array,
  ) => {
    return ipcRenderer.invoke('fs:saveFileToPath', pathToFile, data)
  },
})

contextBridge.exposeInMainWorld('shell', {
  openDirectory: (directoryPath: string) => {
    return ipcRenderer.invoke('shell:openDirectory', directoryPath)
  },
})

contextBridge.exposeInMainWorld('brotli', {
  compress: (input: string) => {
    return ipcRenderer.invoke('brotli:compress', input)
  },
  decompress: (input: string) => {
    return ipcRenderer.invoke('brotli:decompress', input)
  },
})

contextBridge.exposeInMainWorld('dialog', {
  show: async options => {
    return await ipcRenderer.invoke('dialog:show', options)
  },
  showAndCopy: async options => {
    return await ipcRenderer.invoke('dialog:showAndCopy', options)
  },
})

contextBridge.exposeInMainWorld('img', {
  base64ToImg: async (base64Str: string) => {
    return await ipcRenderer.invoke('img:base64ToImg', base64Str)
  },
  getBgBase64: () => {
    return ipcRenderer.invoke('img:getBgBase64')
  },
})

contextBridge.exposeInMainWorld('os', {
  platform: () => {
    return ipcRenderer.invoke('os:platform')
  },
})

// --------- Preload scripts loading ---------
function domReady(
  condition: DocumentReadyState[] = ['complete', 'interactive'],
) {
  return new Promise(resolve => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const styleContent = `
    .logo {
      width: 80px;
      height: 80px;
      filter: drop-shadow(0 0 1rem crimson);
    }
    .app-loading-wrap {
      position: fixed;
      color: #eee;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #222;
      z-index: 9999;
      transition: all 1s ease;
    }
    .inner-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .below-text {
      text-align: center;
      font-weight: bold;
    }
    .append-text {
      text-align: center;
      opacity: 0.6;
    }
  `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')
  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="inner-wrapper">
    <img class="logo" src="../../build/icon.ico" />
    <div style="margin-top: 1rem; font-size: 22px">
      <div class="below-text" style="font-family: sans-serif;">争锋小助手</span>
      <div class="append-text" style="font-family: sans-serif;"> Competizione Companion</span>
    </div>
    <div class="append-text" style="font-size: 14px; margin-top: 0.5rem; font-family: sans-serif;">by horacehuang17</div>
  </div>`

  const hideDom = () => {
    oDiv.style.opacity = '0'
    oDiv.style.filter = 'blur(20px)'
  }

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      hideDom()

      setTimeout(() => {
        safeDOM.remove(document.head, oStyle)
        safeDOM.remove(document.body, oDiv)
      }, 1000)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = ev => {
  ev.data.payload === 'removeLoading' && setTimeout(removeLoading, 500)
}

setTimeout(removeLoading, 4999)
