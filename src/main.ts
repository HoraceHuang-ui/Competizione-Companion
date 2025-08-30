import { createApp } from 'vue'
import App from './App.vue'

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
