/**
 * 读写编码：**ACC 自己会把 broadcasting.json 写成 UTF-16LE（无 BOM！）** —— 实测本机
 * 184 字节、隔一个 0x00。必须按"是否有 BOM / NUL 字节分布"判断编码，否则会把它当成
 * 坏 JSON 重写（曾经就这么把用户的密码冲掉过）。写回时**沿用原编码**，避免和游戏的
 * 写入方来回打架。
 */
type ConfigEncoding = 'utf8' | 'utf16le'

export function decodeConfigBuffer(buffer: Buffer): { text: string; encoding: ConfigEncoding } {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.subarray(2).toString('utf16le'), encoding: 'utf16le' }
  }
  const probe = Math.min(buffer.length, 64)
  let nulOdd = 0
  let nulEven = 0
  for (let i = 0; i < probe; i++) {
    if (buffer[i] === 0) (i % 2 ? nulOdd++ : nulEven++)
  }
  if (buffer.length >= 4 && nulOdd > nulEven * 2) {
    return { text: buffer.toString('utf16le'), encoding: 'utf16le' }
  }
  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return { text, encoding: 'utf8' }
}

export function encodeConfigText(text: string, encoding: ConfigEncoding): Buffer {
  return encoding === 'utf16le' ? Buffer.from(text, 'utf16le') : Buffer.from(text, 'utf8')
}

/**
 * ACC UDP 广播配置（`Documents/Assetto Corsa Competizione/Config/broadcasting.json`）的
 * **自动检测与静默补齐**。
 *
 * 为什么需要它：ACC 只有在 `broadcasting.json` 里把 `updListenerPort` 设成非 0 端口后，
 * 才会把会话数据（报名表/实时车况）通过 UDP 播出来；我们后续的"车号、评级、组别内名次与
 * 车数"全靠这个广播。文件默认是**没有的**（或端口为 0 = 关闭），用户不该为此手改文件。
 * 所以每次启动应用时都检查一遍，缺了/关了就静默补上，确保用户无感。
 *
 * 原则（很重要）：
 *   1. **只在"不能用"时才动文件**：端口合法且密码非空就一个字都不改；
 *   2. **只补必要的键**，其余键（用户自己的设置）原样保留；
 *   3. 真要改已存在的文件时先留备份：`broadcasting.json.cc-backup`（只留第一次的，
 *      不覆盖旧备份）；若文件**解析不了**，再额外留一份带时间戳的原文备份，
 *      确保任何情况下都不丢用户原文；
 *   4. **永不抛异常**：任何失败只记日志，绝不影响应用启动（读写不了就当没这回事）；
 *   5. **沿用文件原编码**（ACC 写的是 UTF-16LE 无 BOM，见上）。
 *
 * 注意：ACC 只在**启动时**读这个文件，所以改动要到下次启动游戏才生效（不是本应用的启动）。
 * 协议细节（端口/密码/注册消息）见 `ACC-接口文档调研.md`。
 */
import fs from 'node:fs'
import path from 'node:path'

/** 官方示例里的默认端口（广播发到 localhost 的这个 UDP 端口） */
export const DEFAULT_BROADCAST_PORT = 9000
/** 官方示例里的默认密码（连接密码/命令密码，应用注册时要带上同样的值） */
export const DEFAULT_BROADCAST_PASSWORD = 'cc'

/** 相对 `文档` 目录的配置文件路径 */
export const BROADCAST_CONFIG_RELATIVE = path.join(
  'Assetto Corsa Competizione',
  'Config',
  'broadcasting.json',
)

export interface BroadcastConfig {
  /** 游戏会往这个 UDP 端口广播（>0 才算打开） */
  port: number
  connectionPassword: string
  commandPassword: string
}

export interface BroadcastConfigResult extends BroadcastConfig {
  /** 配置文件绝对路径 */
  file: string
  /** 文件是否存在（补齐前） */
  existed: boolean
  /** 是否新建了文件 */
  created: boolean
  /** 是否改动了已存在的文件 */
  patched: boolean
  /** 改动前是否留了备份 */
  backedUp: boolean
  /** 不改文件的原因（已正确配置时为 'ok'） */
  reason: 'ok' | 'missing' | 'unreadable' | 'invalid-json' | 'disabled-port' | 'empty-password'
}

/** 端口是否可用（1..65535 的整数） */
export function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/**
 * 纯逻辑：把文件里读到的任意 JSON 归一成可用配置，并判断"要不要动文件"。
 * 不碰文件系统，方便单测。
 */
export function normalizeBroadcastConfig(raw: unknown): {
  config: BroadcastConfig
  patched: boolean
  reason: BroadcastConfigResult['reason']
} {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>)

  // 端口：合法就沿用（**绝不改用户已设好的端口**，否则会打断用户其它读广播的插件）
  const port = isValidPort(source.updListenerPort)
    ? (source.updListenerPort as number)
    : DEFAULT_BROADCAST_PORT
  const connectionPassword =
    asNonEmptyString(source.connectionPassword) ?? DEFAULT_BROADCAST_PASSWORD
  const commandPassword =
    asNonEmptyString(source.commandPassword) ?? DEFAULT_BROADCAST_PASSWORD

  const portWasValid = isValidPort(source.updListenerPort)
  const connectionOk = asNonEmptyString(source.connectionPassword) != null
  const commandOk = asNonEmptyString(source.commandPassword) != null

  let reason: BroadcastConfigResult['reason'] = 'ok'
  if (!portWasValid) reason = 'disabled-port'
  else if (!connectionOk || !commandOk) reason = 'empty-password'

  return {
    config: { port, connectionPassword, commandPassword },
    // 只有归一化结果与文件内容不同才需要写回（等于"没坏就别动"）
    patched: !portWasValid || !connectionOk || !commandOk,
    reason,
  }
}

/**
 * 检查并（必要时）静默补齐广播配置。
 * `documentsDir` 由调用方给（Electron 里是 `app.getPath('documents')`），方便测试。
 */
export function ensureBroadcastConfig(
  documentsDir: string,
  log: (message: string) => void = () => {},
): BroadcastConfigResult {
  const file = path.join(documentsDir, BROADCAST_CONFIG_RELATIVE)
  const base: BroadcastConfigResult = {
    port: DEFAULT_BROADCAST_PORT,
    connectionPassword: DEFAULT_BROADCAST_PASSWORD,
    commandPassword: DEFAULT_BROADCAST_PASSWORD,
    file,
    existed: false,
    created: false,
    patched: false,
    backedUp: false,
    reason: 'missing',
  }

  let raw: string | null = null
  let encoding: ConfigEncoding = 'utf8'
  try {
    const buffer = fs.readFileSync(file)
    const decoded = decodeConfigBuffer(buffer)
    raw = decoded.text
    encoding = decoded.encoding
    base.existed = true
  } catch {
    raw = null
  }

  // ---- 文件不存在：直接建一个（父目录可能也不存在，一起建）----
  if (raw == null) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, serializeConfig(base), 'utf-8')
      base.created = true
      base.reason = 'missing'
      log(`[broadcast] 已创建 ${file}（端口 ${base.port}）—— 游戏下次启动后开始广播`)
      return base
    } catch (error) {
      base.reason = 'unreadable'
      log(`[broadcast] 创建配置失败（忽略）：${String(error)}`)
      return base
    }
  }

  // ---- 文件存在：解析 + 归一 ----
  let parsed: unknown = null
  let parseOk = true
  try {
    parsed = JSON.parse(raw)
  } catch {
    parseOk = false
  }

  if (!parseOk) {
    // 坏 JSON：先留一份带时间戳的原文（任何情况下都不丢），再重写
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    try {
      fs.copyFileSync(file, `${file}.cc-backup-${stamp}`)
      log(`[broadcast] 原文无法解析，已备份到 ${path.basename(file)}.cc-backup-${stamp}`)
    } catch {
      // 备份失败不拦
    }
    const result = writeBack(file, base, log, 'invalid-json', false, encoding)
    return result
  }

  const { config, patched, reason } = normalizeBroadcastConfig(parsed)
  const result: BroadcastConfigResult = { ...base, ...config }
  if (!patched) {
    result.reason = 'ok'
    return result
  }
  return writeBack(file, result, log, reason, true, encoding)
}

/** 序列化成游戏认识的形状（键名照官方：`updListenerPort` 确实是这么拼的） */
function serializeConfig(config: BroadcastConfig): string {
  return `${JSON.stringify(
    {
      updListenerPort: config.port,
      connectionPassword: config.connectionPassword,
      commandPassword: config.commandPassword,
    },
    null,
    2,
  )}\n`
}

/** 写回文件（先留一次备份），失败也不抛；**沿用原编码** */
function writeBack(
  file: string,
  result: BroadcastConfigResult,
  log: (message: string) => void,
  reason: BroadcastConfigResult['reason'],
  keepOtherKeys: boolean,
  encoding: ConfigEncoding,
): BroadcastConfigResult {
  try {
    // 保留用户文件里的其它键（我们只改这三个）
    let merged: Record<string, unknown> = {
      updListenerPort: result.port,
      connectionPassword: result.connectionPassword,
      commandPassword: result.commandPassword,
    }
    if (keepOtherKeys) {
      try {
        const parsed = JSON.parse(decodeConfigBuffer(fs.readFileSync(file)).text)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          merged = { ...(parsed as Record<string, unknown>), ...merged }
        }
      } catch {
        // 读不出来就只写这三个键
      }
    }

    const backup = `${file}.cc-backup`
    if (!fs.existsSync(backup)) {
      try {
        fs.copyFileSync(file, backup)
        result.backedUp = true
      } catch {
        // 备份失败不拦，继续写
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, encodeConfigText(`${JSON.stringify(merged, null, 2)}\n`, encoding))
    result.patched = true
    result.reason = reason
    log(
      `[broadcast] 已补齐 ${file}（端口 ${result.port}，原因 ${reason}，编码 ${encoding}` +
        `${result.backedUp ? `，原文件备份在 ${path.basename(backup)}` : ''}）—— 游戏下次启动后生效`,
    )
    return result
  } catch (error) {
    result.reason = 'unreadable'
    log(`[broadcast] 写入配置失败（忽略）：${String(error)}`)
    return result
  }
}
