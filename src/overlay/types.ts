// 遥测窗的数据结构。
// 主进程是唯一数据源（electron/main/overlay.ts），这里的定义必须与它保持一致。

export interface OverlayItem {
  id: string
  /** 组件注册表里的键，见 src/overlay/registry.ts */
  widget: string
  displayId: number
  /** 相对该显示器左上角的 DIP 坐标 */
  x: number
  y: number
  /** 等比缩放系数，作用在 baseWidth/baseHeight 之上 */
  scale: number
  /** 未缩放时的基准尺寸（设计尺寸），组件内部排版都按这个尺寸写 */
  baseWidth: number
  baseHeight: number
  /** 纯黑背景的不透明度 0~1 */
  opacity: number
  z: number
  visible: boolean
  /** 锁定后完全鼠标穿透，且不显示悬浮控制条 */
  locked: boolean
  props: Record<string, unknown>
}

export interface OverlayDisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  primary: boolean
  internal: boolean
}

/** 主窗口收到的载荷 */
export interface MainOverlayPayload {
  scope: 'main'
  enabled: boolean
  items: OverlayItem[]
  displays: OverlayDisplayInfo[]
}

/** 覆盖层窗口收到的载荷：只含本显示器的组件 */
export interface RenderOverlayPayload {
  scope: 'overlay'
  displayId: number
  displayWidth: number
  displayHeight: number
  enabled: boolean
  items: OverlayItem[]
}

export type OverlayPayload = MainOverlayPayload | RenderOverlayPayload
