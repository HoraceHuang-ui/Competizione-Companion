import * as VueRouter from 'vue-router'
import MainPage from '../views/MainPage.vue'
const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes: [
    {
      name: 'status',
      path: '/',
      component: MainPage,
    },
    {
      name: 'list',
      path: '/list',
      component: () => import('../views/ServerListPage/index.vue'),
    },
    {
      name: 'setup',
      path: '/setup',
      component: () => import('../views/SetupMgmtPage/index.vue'),
    },
    {
      name: 'bop',
      path: '/bop',
      component: () => import('../views/BopPage/index.vue'),
    },
    {
      name: 'report',
      path: '/report',
      component: () => import('../views/RulesPage/index.vue'),
    },
    {
      name: 'settings',
      path: '/settings',
      component: () => import('../views/SettingsPage/SettingsPage.vue'),
    },
  ],
})

export default router
