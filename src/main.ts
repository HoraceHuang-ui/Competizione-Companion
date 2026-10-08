import { createApp } from 'vue'
import App from './App.vue'
import OverlayApp from './overlay/OverlayApp.vue'

import './style.css'
import 'mdui/mdui.css'
import 'mdui'
import 'mdui/components/icon.js'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from './router'
import i18n, { translate } from './i18n'

import './assets/fonts/index.css'
import './assets/traffic.scss'
import 'vue-color/style.css'

import './demos/ipc'
import { setColorScheme, setTheme } from 'mdui'
import { useStore } from '@/store'
import { Theme } from 'mdui/internal/theme'

// 覆盖层窗口加载的是同一个入口文件（见 electron/main/overlay.ts），用 hash 区分：
// 它只挂载遥测窗画布，不挂主界面外壳，也不接 Pinia——两个窗口共用同一份
// localStorage，主窗口的持久化状态不该被覆盖层窗口回写。
// 精确匹配，避免主窗口的路由（如 #/widgets）被误判成覆盖层。
const isOverlayWindow = /^#\/overlay(\?|$)/.test(window.location.hash)

if (isOverlayWindow) {
  // 控制条用的是 mdui 组件，它们取色自 mdui 主题；覆盖层是纯黑底，固定用深色主题
  setTheme('dark')
  createApp(OverlayApp)
    // 遥测窗里的文案（提示 / tooltip）也走 i18n
    .use(i18n, { globalInstall: true })
    .mount('#app')
    .$nextTick(() => {
      postMessage({ payload: 'removeLoading' }, '*')
    })
} else {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)

  createApp(App)
    .use(pinia)
    .use(i18n, { globalInstall: true })
    .use(router)
    .mount('#app')
    .$nextTick(() => {
      postMessage({ payload: 'removeLoading' }, '*')
    })

  const store = useStore()
  setTheme(
    ['light', 'auto', 'dark'][
      parseInt(store.settings.general.darkMode) - 1
    ] as Theme,
  )
  store.settings.general.themeColor =
    store.settings.general.themeColor || '#785abf'
  setColorScheme(store.settings.general.themeColor)

  if (
    ['舞萌DX启动！', 'Time for maimai DX!'].includes(
      store.settings.status.serverDownMsg,
    )
  ) {
    store.settings.status.serverDownMsg = translate(
      'settings.serverDownMsgDefault',
    )
  }
}
