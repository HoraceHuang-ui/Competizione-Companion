import type { Component } from 'vue'
import BaseOverlayDriving from '@/components/overlay/BaseOverlayDriving.vue'
import BaseOverlayTyre from '@/components/overlay/BaseOverlayTyre.vue'
import BaseOverlaySession from '@/components/overlay/BaseOverlaySession.vue'
import BaseOverlayDamage from '@/components/overlay/BaseOverlayDamage.vue'
import BaseOverlayWeather from '@/components/overlay/BaseOverlayWeather.vue'
import BaseOverlayElectronics from '@/components/overlay/BaseOverlayElectronics.vue'
import BaseOverlayRanking from '@/components/overlay/BaseOverlayRanking.vue'
import BaseOverlayFuel from '@/components/overlay/BaseOverlayFuel.vue'
import BaseOverlayLeaderboard from '@/components/overlay/BaseOverlayLeaderboard.vue'
import BaseOverlayPenalty from '@/components/overlay/BaseOverlayPenalty.vue'
import BaseOverlayRpm from '@/components/overlay/BaseOverlayRpm.vue'
import BaseOverlayDeltaBar from '@/components/overlay/BaseOverlayDeltaBar.vue'
import BaseOverlayTest from '@/components/overlay/BaseOverlayTest.vue'

// 遥测窗注册表。
// 以后新增组件只要在这里登记一行，主窗口 / 覆盖层就能通过 widget 键找到它。
// 约定：组件必须基于 BaseOverlayTemplate 实现，并透传 $attrs（见 BaseOverlayTest 顶部的写法）。

export interface OverlayWidgetDef {
  id: string
  /** i18n 展示名 */
  nameKey: string
  /** 建议的基准尺寸（DIP）；未缩放时的排版尺寸 */
  defaultSize: { width: number; height: number }
  component: Component
}

export const OVERLAY_WIDGETS: OverlayWidgetDef[] = [
  {
    id: 'driving',
    nameKey: 'overlay.widgetDriving',
    defaultSize: { width: 420, height: 140 },
    component: BaseOverlayDriving,
  },
  {
    id: 'tyre',
    nameKey: 'overlay.widgetTyre',
    // 184 宽：列间距 4px + 格子外边距 2px 之后，"轮胎矩形 ↔ 中间刹车"只剩 6px（原来 13px），
    // 因此整体比原来的 200 窄一点；老实例由 overlay.ts 的旧默认尺寸迁移自动跟上（200×260 → 184×260）
    defaultSize: { width: 184, height: 260 },
    component: BaseOverlayTyre,
  },
  {
    id: 'session',
    nameKey: 'overlay.widgetSession',
    // 只是「刚加进来那一帧」的初值：组件会按内容自己贴合宽高（见 BaseOverlaySession 的 fitToContent）
    defaultSize: { width: 520, height: 32 },
    component: BaseOverlaySession,
  },
  {
    id: 'damage',
    nameKey: 'overlay.widgetDamage',
    defaultSize: { width: 210, height: 260 },
    component: BaseOverlayDamage,
  },
  {
    id: 'weather',
    nameKey: 'overlay.widgetWeather',
    // 按用户要求把默认尺寸整体放大一倍：3 列 36px + 2 个 14px 间距 + 左右各 14px = 164；
    // 高度 = 4+18+10+2+4+32+4 = 74（组件内字号/图标/线宽都同步翻倍，见 BaseOverlayWeather.vue）
    defaultSize: { width: 168, height: 76 },
    component: BaseOverlayWeather,
  },
  {
    id: 'electronics',
    nameKey: 'overlay.widgetElectronics',
    // 两个 34px 正方形格子 + 6px 间距 + 6px 内边距（尺寸自适应只增不减，见组件内说明）
    defaultSize: { width: 86, height: 46 },
    component: BaseOverlayElectronics,
  },
  {
    id: 'ranking',
    nameKey: 'overlay.widgetRanking',
    // 两横排：上排 车号矩形 / 当前圈计时 / delta；下排 组别·名次 | Best·Last·Pred·Stint | Total·Stint
    // 尺寸 = 内容自然尺寸（实测 376×180，四边各 16px 等宽内边距）。字号调整后内容会变，
    // 组件挂载时会**自动贴合**内容（大了就缩、运行中只增不减），所以这里只是"出生尺寸"
    defaultSize: { width: 376, height: 180 },
    component: BaseOverlayRanking,
  },  {
    id: 'fuel',
    nameKey: 'overlay.widgetFuel',
    // 四行：剩余油量 left / 每圈油耗 /lap / 可跑圈数 Est. / 目标油量 target
    // 尺寸同样按内容自适应（挂载贴合 + 运行中只增不减）
    defaultSize: { width: 130, height: 104 },
    component: BaseOverlayFuel,
  },
  {
    id: 'leaderboard',
    nameKey: 'overlay.widgetLeaderboard',
    // 多行：第一名固定 + 用户 ±2 名（不够补位）；行高随字号自适应
    defaultSize: { width: 420, height: 132 },
    component: BaseOverlayLeaderboard,
  },
  {
    id: 'rpm',
    nameKey: 'overlay.widgetRpm',
    // 14 盏 16px 圆灯 + 间距（胶囊形外框），横向一条
    defaultSize: { width: 320, height: 26 },
    component: BaseOverlayRpm,
  },
  {
    id: 'deltaBar',
    nameKey: 'overlay.widgetDeltaBar',
    // 400×20 的长条（20:1）+ 下方数值胶囊；左右各留 34px 给满槽时溢出的胶囊
    defaultSize: { width: 468, height: 48 },
    component: BaseOverlayDeltaBar,
  },
  {
    id: 'penalty',
    nameKey: 'overlay.widgetPenalty',
    // 一行红色圆角矩形（DT / SG10 / SG20 / SG30 / DSQ / NO BEST / +xx s）；
    // **没有判罚时整块（含背景）都不显示**（`:background="false"` + 内容 v-if），所以这里只是"出生尺寸"：
    // 能装下最长的单个 chip（NO BEST）即可，判罚出现时组件会按内容自己撑开（只增不减）
    defaultSize: { width: 90, height: 32 },
    component: BaseOverlayPenalty,
  },
  {
    id: 'test',
    nameKey: 'overlay.widgetTest',
    defaultSize: { width: 220, height: 120 },
    component: BaseOverlayTest,
  },
]

export const getWidget = (id: string) =>
  OVERLAY_WIDGETS.find(widget => widget.id === id) || null
