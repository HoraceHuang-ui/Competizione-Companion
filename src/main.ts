import { createApp } from 'vue'
import App from './App.vue'

import './style.css'
import 'mdui/mdui.css'
import 'mdui'
import 'mdui/components/icon.js'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from './router'
import i18n from './i18n'

import './assets/fonts/index.css'
import './assets/traffic.scss'
import 'vue-color/style.css'

import './demos/ipc'
import { setColorScheme, setTheme } from 'mdui'
import { useStore } from '@/store'

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
setTheme('auto')
setColorScheme(store.settings.general.themeColor)
