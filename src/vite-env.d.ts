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
  // 主进程转发请求（无 CORS 限制），见 electron/main/index.ts 的 axios:post / axios:get
  axios: {
    post: (url: string, body: any, config?: any) => Promise<any>
    get: (url: string, config?: any) => Promise<any>
  }
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
  // 自定义 AI 提供商（BYOK），见 electron/preload/index.ts
  aiStream?: {
    start: (payload: {
      id: string
      apiType: 'chatCompletions' | 'responses' | 'anthropic'
      baseUrl: string
      apiKey: string
      model: string
      messages: Array<{ role: string; content: string }>
      maxTokens?: number
    }) => Promise<{ ok: boolean; canceled?: boolean; error?: string }>
    abort: (id: string) => void
    onEvent: (
      callback: (data: {
        id: string
        type: 'content' | 'reasoning' | 'usage'
        value: string | number
      }) => void,
    ) => () => void
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
  // 遥测窗（Overlays），见 electron/main/overlay.ts 与 electron/preload/index.ts
  overlay?: {
    getState: () => Promise<
      | {
          scope: 'main'
          enabled: boolean
          /** 游戏暂停 / 无数据时是否隐藏全部遥测窗（默认开启） */
          hideWhenPaused: boolean
          /** 当前是否判定为"游戏暂停 / 无数据" */
          paused: boolean
          items: import('./overlay/types').OverlayItem[]
          displays: import('./overlay/types').OverlayDisplayInfo[]
        }
      | {
          scope: 'overlay'
          displayId: number
          displayWidth: number
          displayHeight: number
          enabled: boolean
          items: import('./overlay/types').OverlayItem[]
        }
    >
    getDisplays: () => Promise<import('./overlay/types').OverlayDisplayInfo[]>
    addItem: (payload: {
      widget: string
      displayId?: number
      baseWidth?: number
      baseHeight?: number
      /** 初始不透明度（0..1）；被强制设置的组件（全屏刹车）会按自己的范围夹取 */
      opacity?: number
      props?: Record<string, unknown>
    }) => Promise<any>
    removeItem: (id: string) => Promise<any>
    updateItems: (
      patches: Array<{ id: string; patch: Record<string, unknown> }>,
    ) => Promise<any>
    setEnabled: (enabled: boolean) => Promise<any>
    /** 游戏暂停 / 无数据时是否隐藏全部遥测窗（默认开启） */
    setHideWhenPaused: (hide: boolean) => Promise<any>
    setAllLocked: (locked: boolean) => Promise<any>
    clear: () => Promise<any>
    /** 拖动 / 缩放期间告知主进程保持可交互（false = 该覆盖层窗口完全穿透） */
    setBusy: (busy: boolean) => void
    /** 主进程的光标命中检测结果 */
    onHover: (
      callback: (hover: {
        activeId: string | null
        hintId: string | null
      }) => void,
    ) => () => void
    /** ACC 遥测数据流（~60Hz），见 electron/main/telemetry.ts */
    onTelemetry: (
      callback: (data: {
        active: boolean
        gas: number
        brake: number
        steer: number
        speedKmh: number
        rpms: number
        gear: number
        packetId: number
        /** 四轮胎压 psi，顺序 [FL, FR, RL, RR] */
        tyrePressure: number[]
        /** 四轮胎心温度 ℃，顺序 [FL, FR, RL, RR] */
        tyreCoreTemp: number[]
        /** 四轮刹车片温度 ℃，顺序 [FL, FR, RL, RR] */
        brakeTemp: number[]
        compound: string | null
        /** 当前轮胎编号（Graphic currentTyreSet，实测偏移 1572） */
        tyreSet: number | null
        /** 四轮刹车片剩余寿命（Physics padLife[4]，实测偏移 740），顺序 [FL, FR, RL, RR] */
        padLife: number[] | null
        /** Graphic status：0=OFF 1=REPLAY 2=LIVE 3=PAUSE */
        status: number
        /** Graphic session（-1 未知 0 练习 1 排位 2 正赛 3 热圈 4 计时赛 …） */
        session: number
        completedLaps: number
        position: number
        /** 赛程总圈数（练习/排位为 0） */
        numberOfLaps: number
        sectorIndex: number
        /** 当前圈 / 上圈 / 最快圈时间（ms）；无效时是哨兵 2147483647 */
        iCurrentTime: number
        iLastTime: number
        iBestTime: number
        /** 赛节剩余时间（秒）；无时限时为负 */
        sessionTimeLeft: number
        /** Graphic flag（ACC_FLAG_TYPE） */
        flag: number
        /** Graphic penalty（ACC_PENALTY_TYPE），0 = 无 */
        penalty: number
        /** Graphic penaltyTime（偏移 1220，float，秒）—— SG 的等待秒数 / 罚时秒数 */
        penaltyTime: number
        /** Graphic trackGripStatus（实测偏移 1556） */
        trackGripStatus: number | null
        /** Physics 248：限速器是否开启（0/1） */
        pitLimiterOn: number | null
        /** 一天中的时间（秒，Graphic Clock，实测偏移 1488） */
        timeOfDay: number | null
        /** 气温 / 赛道温度 ℃（Physics 288 / 292） */
        airTemp: number
        roadTemp: number
        /** 全局旗（Graphic 1500..1528，0/1） */
        globalYellow: number
        globalYellow1: number
        globalYellow2: number
        globalYellow3: number
        globalWhite: number
        globalGreen: number
        globalChequered: number
        globalRed: number
        /** 进站窗口圈号区间（Static 676/680）；null = 本赛节没有进站窗口 */
        pitWindowStart: number | null
        pitWindowEnd: number | null
        /** 车损原始值（Physics 224）：前/后/左/右/中；显示秒数 = 值 / 3.545（实测标定） */
        carDamage: number[] | null
        /** 悬挂损伤原始值（Physics 680）：FL/FR/RL/RR */
        suspensionDamage: number[] | null
        /** 前/后刹车片型号（Physics 732/736，0 起编号） */
        brakeCompoundFront: number | null
        brakeCompoundRear: number | null
        /** TC / ABS 是否正在介入（Physics 204 / 252，0/1） */
        tc: number
        abs: number
        /** 四轮滑移（Physics 56），顺序 [FL, FR, RL, RR] */
        wheelSlip: number[] | null
        /** 雨强三连（Graphic 1560/1564/1568，ACC_RAIN_INTENSITY 0..5）：当前 / +10min / +30min 预报 */
        rainIntensity: number | null
        rainIntensityIn10min: number | null
        rainIntensityIn30min: number | null
        /** TC / ABS **档位**（Graphic 1268 / 1280，0..N；不是 Physics 204/252 的"是否介入"） */
        tcLevel: number | null
        absLevel: number | null
        /** 圈速 delta（Graphic 1360，ms 绝对值）+ 符号（Graphic 1400，1 = 更慢） */
        deltaLapTimeMs: number | null
        deltaPositive: number | null
        /** 玩家车 id（Graphic 1216，实测 1001/1002；与 UDP 广播的 carEntryId 同域） */
        playerCarId: number | null
        /** Driver stint 剩余额度（Graphic 1308/1312，ms；单人/无换人规则时 -1000 = N/A） */
        driverStintTotalTimeLeft: number | null
        driverStintTimeLeft: number | null
        /** 游戏算的预测圈速（Graphic 1396，ms） */
        estimatedLapTimeMs: number | null
        /** 会话信息（Static）：本场车数 / 车型名 / 车手三字母短名 */
        numCars: number | null
        /** 实时车数（Graphic 252 activeCars） */
        activeCars: number | null
        /** 当前圈是否有效（Graphic 1408 isValidLap：1 = 有效、0 = 无效） */
        isValidLap: number | null
        /** 剩余油量（Physics 12） */
        fuel: number | null
        /** 每圈平均油耗 L/lap（Graphic fuelXLap 1284，实测确认） */
        fuelXLap: number | null
        /** 上次加油后已用油量（Graphic usedFuel 1324） */
        usedFuel: number | null
        /** 节类型（广播）：0=Practice 4=Qualifying 10=Race … */
        sessionType: number | null
        /** 本节已进行时间 ms（广播） */
        sessionTimeMs: number | null
        /** 本节总时长 ms（广播；无固定时长时 null） */
        sessionTotalMs: number | null
        /** 我所在地点（广播 CAR_LOCATION：1=Track 2=Pitlane 3=PitEntry 4=PitExit） */
        carLocation: number | null

        /** 我进行中那一圈是否已无效（广播实时信号） */

        currentLapInvalid: boolean | null
        /** 排行榜：每辆车一行（车型/车号/名字/名次/最快圈/上一圈/秒差），0.5s 重建一次 */
        leaderboard: Array<{
          carEntryId: number
          carId: number
          raceNumber: number | null
          driverName: string
          position: number
          bestLapMs: number | null
          lastLapMs: number | null
          gapMs: number | null
          gapKind: 'segments' | 'ahead' | 'bestLap' | null
          lapsDelta: number
          isMe: boolean; inPit?: boolean
        }>
        carModel: string | null
        playerNick: string | null
        /** 只能来自 UDP 广播（ENTRY_LIST_CAR）的 4 项：车号 / 评级 / 组别内名次 / 组别内车数 */
        raceNumber: number | null
        driverCategory: number | null
        cupPosition: number | null
        cupCarCount: number | null
        /** 实时总车数（广播报名表条数） */
        totalCarCount: number | null
      }) => void,
    ) => () => void
    onState: (callback: (payload: any) => void) => () => void
    onRender: (callback: (payload: any) => void) => () => void
  }
}
