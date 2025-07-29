import { createApp } from 'vue'
import App from './App.vue'

import './style.css'
import 'mdui/mdui.css'
import 'mdui'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from './router'
import './assets/fonts/index.css'

import './demos/ipc'
import { setTheme } from 'mdui'
// If you want use Node.js, the`nodeIntegration` needs to be enabled in the Main process.
// import './demos/node'

setTheme('auto')

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App)
  .use(pinia)
  .use(router)
  .mount('#app')
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*')
  })
