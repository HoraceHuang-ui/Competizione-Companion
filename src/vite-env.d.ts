/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '@/utils/carData' {
  const value: any
  export default value
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  fs?: {
    setupList: (car: string, track: string) => Promise<any>
    setupFile: (
      car: string,
      track: string,
      fileName: string,
      writeVal: string,
      overwrite?: boolean,
    ) => Promise<any>
    presetList: (exePath: string) => Promise<any>
    presetFile: (
      exePath: string,
      presetName: string,
      writeVal: string,
    ) => Promise<any>
    bopJsonFile: (
      exePath: string,
      writeVal: string,
      overwrite: boolean,
    ) => Promise<any>
    saveUserDataFile: (
      relativePath: string,
      data: string | ArrayBuffer | Uint8Array,
    ) => Promise<any>
    clearUserDataDirectory: (relativeDir: string) => Promise<any>
    saveFileToPath: (
      pathToFile: string,
      data: string | ArrayBuffer | Uint8Array,
    ) => Promise<any>
  }
  shell?: {
    openDirectory: (directoryPath: string) => Promise<any>
  }
  dialog?: {
    show: (options: any) => Promise<string[]>
    showAndCopy: (options: any) => Promise<string>
  }
  accConnector?: {
    setServers: (
      servers: Array<{ name: string; hostname: string; port: number }>,
    ) => Promise<void>
    getStatus: () => Promise<{
      supported: boolean
      dllAvailable: boolean
      accPath: string | null
      accPathValid: boolean
      hookInstalled: boolean
      hookMatches: boolean
      hookConflict: boolean
      accRunning: boolean
      hookActive: boolean
      pipeRunning: boolean
      version: string
    }>
    installHook: () => Promise<any>
    removeHook: () => Promise<any>
    discoverAccPath: () => Promise<{ path: string | null }>
    selectAccPath: () => Promise<any>
    onStatus: (callback: (status: any) => void) => () => void
  }
}
