// Cross-platform wrapper for building the ACC Connector hook DLL.
// - Windows: invokes native/build-hook.ps1 (MSBuild + v143 + MASM).
// - Other platforms: no-op (the hook only exists for Windows builds).
const { spawnSync } = require('node:child_process')
const path = require('node:path')

if (process.platform !== 'win32') {
  console.log('[build-hook] Not on Windows, skipping hook DLL build.')
  process.exit(0)
}

const script = path.join(__dirname, 'build-hook.ps1')
const res = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
  { stdio: 'inherit', shell: false },
)

if (res.error) {
  // MSBuild/PowerShell unavailable (e.g. dev machine without VS):
  // warn but let packaging continue; the app degrades gracefully at runtime.
  console.warn(
    '[build-hook] Hook DLL build skipped: ' + (res.error.message || res.error),
  )
  process.exit(0)
}

process.exit(res.status ?? 0)
