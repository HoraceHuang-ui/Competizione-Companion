# Builds the ACC Connector hook DLL (client-hooks.dll) with MSBuild.
# Requires Visual Studio 2022 with the C++ (v143) workload and MASM.
# Output is written to <repo>/native/out/client-hooks.dll.
param(
    [string]$Configuration = "Release",
    [string]$Platform = "x64"
)

$ErrorActionPreference = "Stop"
$proj = Join-Path $PSScriptRoot "client-hooks\client-hooks.vcxproj"
$outDir = Join-Path $PSScriptRoot "out\"
$intDir = Join-Path $PSScriptRoot "out\obj\"

$buildArgs = @(
    $proj,
    "/p:Configuration=$Configuration",
    "/p:Platform=$Platform",
    "/p:OutDir=$outDir",
    "/p:IntDir=$intDir",
    "/m",
    "/nologo"
)

if (-not (Get-Command msbuild -ErrorAction SilentlyContinue)) {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" | Select-Object -First 1
        if ($msbuild) {
            & $msbuild @buildArgs
            exit $LASTEXITCODE
        }
    }
    throw "MSBuild not found. Install Visual Studio 2022 with Desktop development with C++."
}

msbuild @buildArgs
exit $LASTEXITCODE
