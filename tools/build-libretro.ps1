# Builds Nest's own libretro host with the C# compiler that ships with the
# .NET Framework (no SDK needed).
#
#   tools/libretro/*.cs  ->  resources/tools/nest-libretro.exe
#
# The host is compiled for x64 on purpose: the official libretro core builds
# (dolphin_libretro.dll) are x86_64, so an AnyCPU process that happens to run
# as 32-bit could not LoadLibrary them.
#
# SDL3.dll stays next to the exe (it is loaded by name at runtime). If it is
# missing the build copies it from the engine source tree.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
  $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path $csc)) {
  throw 'csc.exe not found: install .NET Framework 4.x'
}

$outDir = Join-Path $root 'resources\tools'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$exe = Join-Path $outDir 'nest-libretro.exe'

$sources = @(Get-ChildItem (Join-Path $PSScriptRoot 'libretro') -Filter '*.cs' |
  Sort-Object Name |
  ForEach-Object { $_.FullName })
if ($sources.Count -eq 0) {
  throw 'no sources found under tools/libretro'
}

& $csc /nologo /optimize+ /target:exe /platform:x64 /warn:4 `
  "/out:$exe" `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Drawing.dll `
  @sources
if ($LASTEXITCODE -ne 0) { throw "csc failed for nest-libretro.exe: $LASTEXITCODE" }

Write-Host ("built " + $exe + " (" + (Get-Item $exe).Length + " bytes)")

$sdl = Join-Path $outDir 'SDL3.dll'
if (-not (Test-Path $sdl)) {
  $fallback = 'E:\workstop\engines-src\dolphin-libretro\SDL3.dll'
  if (Test-Path $fallback) {
    Copy-Item $fallback $sdl
    Write-Host "copied SDL3.dll from $fallback"
  } else {
    throw "SDL3.dll missing in $outDir and no fallback found"
  }
}
Write-Host ("SDL3.dll: " + $sdl + " (" + (Get-Item $sdl).Length + " bytes)")
