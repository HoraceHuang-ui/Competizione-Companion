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
      name: 'livery',
      path: '/livery',
      component: () => import('../views/LiveryPage/index.vue'),
    },
    {
      name: 'settings',
      path: '/settings',
      component: () => import('../views/SettingsPage/SettingsPage.vue'),
    },
    {
      // 遥测窗管理面板。路径刻意不叫 /overlay ——
      // #/overlay 是覆盖层窗口专用的入口 hash（见 src/main.ts），不能撞。
      name: 'widgets',
      path: '/widgets',
      component: () => import('../views/OverlayPage/OverlayPage.vue'),
    },
  ],
})

export default router
