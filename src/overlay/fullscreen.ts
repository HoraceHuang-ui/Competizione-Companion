/**
 * 「强制设置」——某些遥测窗不允许用户改（机制保留；目前没有组件在用）。
 *
 * 为什么放在这里：这些规则**主进程和渲染侧都要用**——
 *   · 主进程（`electron/main/overlay.ts`）负责真正生效：窗口铺满显示器、鼠标穿透、
 *     置顶层级、透明度夹取；加载/新增/更新之后都要再应用一次，用户改不动。
 *   · 管理面板用它把对应控件禁掉、并把透明度滑杆限制在可用范围内。
 * 所以做成纯函数 + 常量，两边共用（主进程 import 渲染侧纯 TS 模块的做法与 carData 一致）。
 */
import type { OverlayItem } from './types'

export interface ForcedSettings {
  /** 强制锁定（锁定 = 鼠标穿透），且面板里不可解锁 */
  locked: boolean
  /** 强制层级（置顶），面板里不可调 */
  z: number
  /** 透明度可用范围与新增时的默认值 */
  opacity: { min: number; max: number; default: number }
  /** 铺满整个显示器（位置/尺寸/缩放都不可调，随分辨率变化自动跟随） */
  fullscreen: boolean
}


/** widget id → 强制设置（没有条目就是普通组件，全部可调） */
export const FORCED_BY_WIDGET: Record<string, ForcedSettings> = {
}

export function forcedSettingsOf(widget: string | null | undefined): ForcedSettings | null {
  if (!widget) return null
  return FORCED_BY_WIDGET[widget] ?? null
}

export function clampOpacity(value: unknown, forced: ForcedSettings): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : forced.opacity.default
  return Math.min(forced.opacity.max, Math.max(forced.opacity.min, n))
}

export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 把强制设置落到实例上（就地修改）。
 * `bounds` 给显示器的位置与尺寸（DIP）；不给就只处理锁定/层级/透明度。
 */
export function applyForcedSettings(
  item: OverlayItem,
  bounds?: DisplayBounds | null,
): boolean {
  const forced = forcedSettingsOf(item.widget)
  if (!forced) return false
  if (forced.locked) item.locked = true
  item.z = forced.z
  item.opacity = clampOpacity(item.opacity, forced)
  if (forced.fullscreen && bounds && bounds.width > 0 && bounds.height > 0) {
    item.x = bounds.x
    item.y = bounds.y
    item.baseWidth = bounds.width
    item.baseHeight = bounds.height
    item.scale = 1
  }
  return true
}
