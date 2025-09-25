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
  post: async (url: string, body: any) => {
    return await ipcRenderer.invoke('axios:post', url, body)
  },
  get: async (url: string) => {
    return await ipcRenderer.invoke('axios:get', url)
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
  ) => {
    return ipcRenderer.invoke('fs:setupFile', car, track, fileName, writeVal)
  },
  presetList: (exePath: string) => {
    return ipcRenderer.invoke('fs:presetList', exePath)
  },
  presetFile: (exePath: string, presetName: string, writeVal: string) => {
    return ipcRenderer.invoke('fs:presetFile', exePath, presetName, writeVal)
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
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = ev => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
