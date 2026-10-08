// ---------------------------------------------------------------------------
// 编译 ACC 共享内存读取器（native/shm-reader/acc-shm-reader.cs）
//
// 用系统自带的 .NET Framework 编译器 csc.exe，不需要 MSBuild / node-gyp，
// 产物固定为 native/out/acc-shm-reader.exe（打包时由 electron-builder 带进
// resources/shm/，见 electron-builder.json5）。
//
// 用法：node native/build-shm-reader.cjs  （package.json 里是 pnpm build:reader）
// ---------------------------------------------------------------------------

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(__dirname, 'shm-reader', 'acc-shm-reader.cs')
const OUT_DIR = path.join(__dirname, 'out')
const OUT = path.join(OUT_DIR, 'acc-shm-reader.exe')

// 共享内存只有 Windows 有，其它平台直接跳过（主进程也不会启用遥测）
if (process.platform !== 'win32') {
  console.log('[reader] 非 Windows，跳过共享内存读取器构建')
  process.exit(0)
}

function findCsc() {
  const winDir = process.env.WINDIR || 'C:\\Windows'
  const candidates = []

  // 优先用 VS 的 Roslyn 编译器（诊断更好、语言版本更新）
  const vsRoots = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft Visual Studio'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio'),
  ]
  for (const root of vsRoots) {
    if (!fs.existsSync(root)) continue
    for (const year of ['2022', '2019', '2017']) {
      const yearDir = path.join(root, year)
      if (!fs.existsSync(yearDir)) continue
      for (const edition of fs.readdirSync(yearDir)) {
        candidates.push(
          path.join(yearDir, edition, 'MSBuild', 'Current', 'Bin', 'Roslyn', 'csc.exe'),
        )
      }
    }
  }

  // 兜底：系统自带的 .NET Framework 编译器（源码刻意保持 C# 5 语法，能编）
  candidates.push(
    path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  )

  return candidates.find(p => fs.existsSync(p)) || null
}

const csc = findCsc()
if (!csc) {
  console.error(
    '[reader] 找不到 csc.exe（.NET Framework 4.x）。Win10/11 默认自带，' +
      '若确实缺失请安装 .NET Framework 4.x 后重试。',
  )
  process.exit(1)
}

fs.mkdirSync(OUT_DIR, { recursive: true })

console.log(`[reader] 使用 ${csc} 编译 acc-shm-reader.exe`)
try {
  execFileSync(
    csc,
    [
      '/nologo',
      '/optimize+',
      '/target:exe',
      '/platform:x64',
      `/out:${OUT}`,
      SRC,
    ],
    { stdio: 'inherit', cwd: ROOT },
  )
} catch (err) {
  console.error('[reader] 编译失败:', err.message)
  process.exit(1)
}

const size = fs.statSync(OUT).size
console.log(`[reader] 完成: ${path.relative(ROOT, OUT)} (${size} 字节)`)
