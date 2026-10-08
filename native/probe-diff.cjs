#!/usr/bin/env node
/**
 * `acc-shm-reader.exe --probe` 的输出差分工具（无依赖，Node 跑）。
 *
 * 用途：**在共享内存里找"跟着某个游戏内状态变化"的字段**（本项目定位 1.9 追加区、PitWindow 用的就是这套）。
 * 典型场景：找 **Cut 警告次数** —— 游戏没暴露它，只能靠差分：
 *
 *   1) 进车、**把车完全停稳**在赛道边（别动、别在跑，否则几百个槽位都在变，没法看）
 *   2) 此时 cut 警告 = 0 →  native\out\acc-shm-reader.exe --probe > cut-0.txt
 *   3) 去切一次弯拿到 1 个警告，回来**把车停稳** →  --probe > cut-1.txt
 *   4) 再切一次拿到 2 个警告，回来停稳      →  --probe > cut-2.txt
 *   5) node native/probe-diff.cjs cut-0.txt cut-1.txt cut-2.txt
 *
 * 输出两部分：
 *   · **候选计数器**：值随 dump 单调递增、且每次增量都一样的槽位（例如 0→1→2）—— 这就是要找的字段
 *   · **全部差异**：剩下的差异槽位（时间/位置/温度/圈速…都在这儿，用来排除噪音）
 *
 * 已知噪音（默认忽略）：偏移 0（`packetId`，每帧都变）。要再加用 `--ignore 8,12`。
 */

const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const ignore = new Set([0]) // packetId 永远在每页偏移 0
const files = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ignore') {
    for (const off of String(args[++i] || '').split(',')) if (off.trim()) ignore.add(Number(off))
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('用法: node native/probe-diff.cjs <dump1.txt> <dump2.txt> [dump3.txt ...] [--ignore 8,12]')
    process.exit(0)
  } else {
    files.push(args[i])
  }
}
if (files.length < 2) {
  console.error('至少给两份 --probe 的输出（建议三份：0 / 1 / 2 个 cut 警告）')
  console.error('用法: node native/probe-diff.cjs <dump1.txt> <dump2.txt> [更多…] [--ignore 8,12]')
  process.exit(2)
}

/** 解析一份 --probe 输出 → Map<"页面@偏移", {page, off, int, float}> */
function parseDump(file) {
  const text = fs.readFileSync(file, 'utf8')
  const map = new Map()
  let page = '?'
  for (const line of text.split(/\r?\n/)) {
    const head = /^#\s*-+\s*([A-Z]+)\s*-+/.exec(line)
    if (head) {
      page = head[1]
      continue
    }
    const m = /^off=\s*(\d+)\s+int=\s*(-?\d+)\s+float=(\S+)/.exec(line)
    if (m) map.set(`${page}@${m[1]}`, { page, off: Number(m[1]), int: Number(m[2]), float: m[3] })
  }
  return { file, map }
}

const dumps = files.map(f => {
  if (!fs.existsSync(f)) {
    console.error(`找不到文件：${f}`)
    process.exit(2)
  }
  const d = parseDump(f)
  console.log(`# ${path.basename(f)} → ${d.map.size} 个槽位`)
  return d
})

const keys = new Set()
for (const d of dumps) for (const k of d.map.keys()) keys.add(k)

const candidates = []
const diffs = []
for (const key of keys) {
  const rows = dumps.map(d => d.map.get(key))
  if (rows.some(r => !r)) continue // 某份 dump 缺这个槽位（映射容量不同）→ 单独提示
  const off = rows[0].off
  if (ignore.has(off)) continue
  const ints = rows.map(r => r.int)
  if (ints.every(v => v === ints[0])) continue
  const entry = { key, page: rows[0].page, off, ints, floats: rows.map(r => r.float) }
  // 候选计数器：严格单调递增，且每次增量相同（增量 1 优先）
  let monotonic = true
  let delta = null
  let sameDelta = true
  for (let i = 1; i < ints.length; i++) {
    const d = ints[i] - ints[i - 1]
    if (d <= 0 || d > 1000) {
      monotonic = false
      break
    }
    if (delta === null) delta = d
    else if (d !== delta) sameDelta = false
  }
  if (monotonic && sameDelta) candidates.push({ ...entry, delta })
  else diffs.push(entry)
}

const fmt = e =>
  `${e.page.padEnd(7)} off=${String(e.off).padStart(5)}  int=[${e.ints.join(', ')}]  float=[${e.floats.join(', ')}]` +
  (e.delta != null ? `  ← 每次 +${e.delta}` : '')

console.log(`\n===== 候选计数器（值随 dump 单调递增、增量恒定；最可能是你要找的那个字段）=====`)
if (candidates.length === 0) {
  console.log('（没有）—— 说明这三份 dump 之间没有"稳定递增"的槽位：')
  console.log('      ① 采样时车没停稳（噪音淹没了它）② 该字段不在共享内存里 ③ 警告次数不是"递增"型的值')
} else {
  for (const c of candidates) console.log(fmt(c))
}

console.log(`\n===== 其它差异槽位（共 ${diffs.length} 个；时间/位置/温度/圈速等噪音都在这里）=====`)
const showMax = 80
for (const d of diffs.slice(0, showMax)) console.log(fmt(d))
if (diffs.length > showMax) console.log(`… 还有 ${diffs.length - showMax} 个（要全看就把输出重定向到文件）`)

console.log(`\n提示：偏移 0（packetId）已忽略；还有已知噪音（例 8/12 之类）可以用 --ignore 8,12 去掉再跑一次。`)
