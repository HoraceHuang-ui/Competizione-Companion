import type { OverlayItem } from './types'

// 遥测窗的几何计算。
// BaseOverlayTemplate（组件自身）与 OverlayApp（宿主命中检测）必须用同一套公式，
// 否则会出现「控制条看得到却点不到」这类错位问题。

export const MIN_SCALE = 0.3
export const MAX_SCALE = 2

/** 控制条的设计高度（会被反向缩放，屏幕上恒定是这个值） */
export const CONTROL_BAR_HEIGHT = 28
/** 控制条与组件之间的间隙 */
export const CONTROL_BAR_GAP = 6
/** 命中检测外扩量：让光标刚接近组件就进入可交互状态，避免「先点到游戏」 */
export const HIT_PADDING = 8

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 组件在屏幕上的占用尺寸（DIP） */
export function itemScreenSize(item: OverlayItem) {
  return {
    width: item.baseWidth * item.scale,
    height: item.baseHeight * item.scale,
  }
}

/** 组件太靠屏幕底部时，控制条改贴组件内侧，否则会被屏幕边缘截掉 */
export function isControlBarInside(item: OverlayItem, displayHeight: number) {
  if (!displayHeight) return false
  const { height } = itemScreenSize(item)
  return (
    item.y + height + CONTROL_BAR_GAP + CONTROL_BAR_HEIGHT > displayHeight
  )
}

/** 组件的可交互区域：组件矩形外扩 HIT_PADDING，下方再算上控制条所占的一条带 */
export function itemHitRect(item: OverlayItem, displayHeight: number): Rect {
  const { width, height } = itemScreenSize(item)
  const barBelow = !isControlBarInside(item, displayHeight)
  return {
    x: item.x - HIT_PADDING,
    y: item.y - HIT_PADDING,
    width: width + HIT_PADDING * 2,
    height:
      height +
      HIT_PADDING * 2 +
      (barBelow ? CONTROL_BAR_GAP + CONTROL_BAR_HEIGHT : 0),
  }
}

export function rectContains(rect: Rect, x: number, y: number) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  )
}

/** 约束到显示器范围内：能放下就完整放下，放不下就贴左上角 */
export function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  displayWidth: number,
  displayHeight: number,
) {
  if (!displayWidth || !displayHeight) {
    return { x: Math.round(x), y: Math.round(y) }
  }
  const maxX = Math.max(0, displayWidth - width)
  const maxY = Math.max(0, displayHeight - height)
  return {
    x: Math.min(Math.max(Math.round(x), 0), Math.round(maxX)),
    y: Math.min(Math.max(Math.round(y), 0), Math.round(maxY)),
  }
}

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

export const RESIZE_CORNERS: ResizeCorner[] = ['nw', 'ne', 'sw', 'se']

/**
 * 等比缩放：沿基准尺寸对角线做投影，得到最贴手的系数，并让对角（锚点）保持不动。
 * 返回新尺寸与新位置，调用方据此写回 item。
 */
export function resizeItem(
  base: { x: number; y: number; scale: number },
  item: Pick<OverlayItem, 'baseWidth' | 'baseHeight'>,
  corner: ResizeCorner,
  dx: number,
  dy: number,
) {
  const bw = item.baseWidth
  const bh = item.baseHeight
  const w0 = bw * base.scale
  const h0 = bh * base.scale

  let dw = 0
  let dh = 0
  if (corner.includes('e')) dw = dx
  if (corner.includes('w')) dw = -dx
  if (corner.includes('s')) dh = dy
  if (corner.includes('n')) dh = -dy

  const raw =
    ((w0 + dw) * bw + (h0 + dh) * bh) / (bw * bw + bh * bh)
  const scale = Math.min(Math.max(raw, MIN_SCALE), MAX_SCALE)

  const width = bw * scale
  const height = bh * scale
  // 拖动哪条边，就固定对面那条边
  const x = corner.includes('w') ? base.x + w0 - width : base.x
  const y = corner.includes('n') ? base.y + h0 - height : base.y

  return { scale, width, height, x, y }
}
