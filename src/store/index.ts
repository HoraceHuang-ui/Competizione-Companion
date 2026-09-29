import { defineStore } from 'pinia'

export const useStore = defineStore('userStore', {
  state: () => ({
    general: {
      targetVersion: undefined as string | undefined,
      windowSize: {
        width: 1200,
        height: 700,
        isMax: false,
      },
      favTracks: [] as string[],
      favCars: {
        GT3: [] as string[],
        GT4: [] as string[],
        GTC: [] as string[],
        TCX: [] as string[],
      },
      msgId: 0,
      firstSetupFlag: false,
      aiModel: 'deepseek-v4-pro',
      // ACC 是否正在运行：由主进程的状态广播写入（见 App.vue），
      // 供主页与侧边栏的“启动 ACC”按钮做状态展示
      accRunning: false,
      // 注入是否已在 ACC 进程中生效（DLL 完成握手），同样来自主进程状态广播
      hookActive: false,
    },
    servers: {
      listView: false,
    },
    presets: {
      serverExePath: '',
    },
    // ACC 直连（ACC Connector）注入历史记录：最新在前，按 hostname+port 去重
    serverHistory: [] as Array<{
      name: string
      hostname: string
      port: number
      // 是否已收藏：不受“清除未收藏”影响
      favorite?: boolean
      // 加入直连列表的时间戳，用于弹窗展示“刚刚添加 / 添加于 MM/DD HH:mm”。
      // 旧版本持久化的记录没有该字段，界面会直接不展示时间。
      addedAt?: number
    }>,
    settings: {
      general: {
        lang: 'zh_CN',
        darkMode: '2',
        minToTray: false,
        themeColor: '#785abf',
        customBgThemeColor: '#785abf',
        bgType: 'hime',
        bgImg: '',
        bgImgPath: '',
        bgOpacity: 0.75,
      },
      status: {
        serverDownMsg: 'Time for maimai DX!',
      },
      setup: {
        carDisplay: 2, // 1: 英文全写, 2: 英文缩写, 3: 中文缩写
        trackDisplay: 2, // 1: 英文全写, 2: 英文缩写, 3: 中文缩写
        setupLabelEn: false,
        alwaysViewOnly: false,
      },
    },
    messages: [] as Array<{
      role: string
      content: string
      reasoning?: string
    }>,
    tokenUsage: {
      pro: { date: '', token: 0 },
      flash: { date: '', token: 0 },
    },
  }),
  actions: {
    clear() {
      // this.$state = { ...initState }
      this.$reset()
    },
    addMessage(msg: { role: string; content: string; reasoning?: string }) {
      this.messages.push(msg)
    },
    newConversation() {
      this.messages = []
    },
    // 注入（直连）一个服务器：去重后置顶，不设数量上限
    addServerHistory(item: { name: string; hostname: string; port: number }) {
      const idx = this.serverHistory.findIndex(
        s => s.hostname === item.hostname && s.port === item.port,
      )
      // 重复添加时保留原有收藏状态，只是移到最前并刷新时间
      const favorite = idx !== -1 ? !!this.serverHistory[idx].favorite : false
      if (idx !== -1) {
        this.serverHistory.splice(idx, 1)
      }
      this.serverHistory.unshift({
        name: item.name,
        hostname: item.hostname,
        port: item.port,
        favorite,
        // 重复添加同一服务器时同样刷新时间戳，与“移到最前”的语义保持一致
        addedAt: Date.now(),
      })
    },
    removeServerHistory(hostname: string, port: number) {
      const idx = this.serverHistory.findIndex(
        s => s.hostname === hostname && s.port === port,
      )
      if (idx !== -1) {
        this.serverHistory.splice(idx, 1)
      }
    },
    toggleServerFavorite(hostname: string, port: number) {
      const target = this.serverHistory.find(
        s => s.hostname === hostname && s.port === port,
      )
      if (target) {
        target.favorite = !target.favorite
      }
    },
    // 清除所有未收藏的服务器，返回被清除的数量
    clearUnfavoritedServers() {
      const before = this.serverHistory.length
      this.serverHistory = this.serverHistory.filter(s => s.favorite)
      return before - this.serverHistory.length
    },
  },
  persist: {
    // accRunning / hookActive 都是运行时状态，不该随持久化回灌：若上次 ACC 正在运行、
    // 注入也生效时退出应用，下次启动会在主进程首次上报前错误地显示为“已连接”，因此恢复后强制归零。
    afterRestore: ctx => {
      ctx.store.$state.general.accRunning = false
      ctx.store.$state.general.hookActive = false
    },
  },
})
